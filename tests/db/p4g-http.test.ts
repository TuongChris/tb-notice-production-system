// P4G — technical validation over real HTTP against tb_notice_test (yarn test:db).
//
// Each test boots the real AppModule + configureApp pipeline on an ephemeral loopback port with a
// synthetic signed-in application User, a controllable clock and a validation observer the
// consistency tests use. Every response is recorded and checked against the active contract at the
// end. All data is synthetic (example.invalid addresses only); every test deletes what it created.
//
// A ValidationRun records what the technical ruleset TB-TECHNICAL-RULESET-v1 found for one exact
// candidate artifact against the current production context of its prompt snapshot's scope: exact
// bytes and hashes, envelope and thread, document plan, internal markers, recorded gaps and drift —
// technical checks only. It is never a G1–G6 review, legal approval, readiness, READY_FOR_SIGNER, a
// signature or permission to send; it creates no CandidateAssessment and changes no candidate or
// case record. The expected artifact SHA-256 and dependency digest are the precondition (412 when
// either changed); the context is captured and checked outside any lock, then rechecked in a short
// SERIALIZABLE transaction before the run is committed, so no run is published against mixed
// snapshots. Nothing of one case appears in another case's runs. No AI provider or outbound call.
import { createHash, randomUUID } from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../apps/api/generated/prisma/client.js';
import type {
  Agency,
  AuthorityEvent,
  CaseAuthoritySelection,
  CaseFact,
  CaseRecord,
  CaseSource,
  CaseWork,
  ContextView,
  Correspondence,
  CorrespondenceBinding,
  CoverageSigner,
  LegalSubject,
  Mandate,
  MandateCoverage,
  MandateVersion,
  NoticeCandidate,
  Owner,
  OwnerSubject,
  PromptSnapshot,
  ReportedItem,
  Route,
  Signer,
  SourceReference,
  UseMapping,
  ValidationIssue,
  ValidationRun,
  ValidationRunSummary,
} from '../../packages/contracts/src/index.js';
import {
  CONTRACT_BASELINE,
  OperationErrorSchema,
  operations,
} from '../../packages/contracts/src/index.js';
import {
  REQUIRED_RULES,
  RULE_ERROR_MESSAGE,
} from '../../apps/api/src/modules/validation/technical-ruleset.js';
import {
  ALLOWED_ORIGIN,
  cookieHeader,
  http,
  openTestPrisma,
  startTestApp,
  type HttpResult,
  type TestApp,
} from './auth-support.js';
import {
  assertSuiteTablesEmpty,
  cleanSuiteTables,
  countRows,
  dataOf,
  DIRECTORY_SUITE_TABLES,
  DirectoryClient,
  etagOf,
  FailingAuditWriter,
  newKey,
  signIn,
  type Recorded,
} from './directory-support.js';

interface FrozenHelper {
  readonly PENDING_SIGNATURE: string;
  canonicalSha256(value: unknown): string;
  exactTextSha256(value: string): string;
}
/** The frozen reference helper (read-only): the independent oracle of the candidate hashes. */
const frozen = (await import(
  pathToFileURL(
    path.resolve(
      import.meta.dirname,
      '../../docs/reference/database-api-v1/TB_DATABASE_SCHEMA_API_CONTRACT_v1/contracts/consistency-reference.mjs',
    ),
  ).href
)) as FrozenHelper;

let prisma: PrismaClient;
let t: TestApp;
let client: DirectoryClient;
const collected: Recorded[] = [];

type Hook = (caseId: string) => Promise<void>;

/** The consistency tests' hooks: each runs once, around a validation's capture and commit. */
const validationObserver = {
  hooks: {
    afterCapture: null as Hook | null,
    afterCaseLock: null as Hook | null,
    beforeInsert: null as Hook | null,
  },
  failRule: null as string | null,
  async afterCapture(caseId: string): Promise<void> {
    const hook = this.hooks.afterCapture;
    this.hooks.afterCapture = null;
    if (hook) await hook(caseId);
  },
  async afterCaseLock(caseId: string): Promise<void> {
    const hook = this.hooks.afterCaseLock;
    this.hooks.afterCaseLock = null;
    if (hook) await hook(caseId);
  },
  async beforeInsert(caseId: string): Promise<void> {
    const hook = this.hooks.beforeInsert;
    this.hooks.beforeInsert = null;
    if (hook) await hook(caseId);
  },
  beforeRule(ruleId: string): void {
    if (ruleId === this.failRule) {
      throw new TypeError('SYNTHETIC rule failure SECRET-DIAGNOSTIC-MUST-NOT-LEAK');
    }
  },
};

const auditWriter = new FailingAuditWriter();

beforeAll(async () => {
  ({ prisma } = openTestPrisma());
  await assertSuiteTablesEmpty(prisma);
});

beforeEach(async () => {
  validationObserver.hooks.afterCapture = null;
  validationObserver.hooks.afterCaseLock = null;
  validationObserver.hooks.beforeInsert = null;
  validationObserver.failRule = null;
  auditWriter.armed = false;
  t = await startTestApp(prisma, { validationObserver, auditWriter });
  client = new DirectoryClient(t.port, await signIn(t.port, prisma), collected);
});

afterEach(async () => {
  await t.close();
  await cleanSuiteTables(prisma);
});

afterAll(async () => {
  if (!prisma) return;
  try {
    await assertSuiteTablesEmpty(prisma);
  } finally {
    await prisma.$disconnect();
  }
});

// ---------------------------------------------------------------------------------------------
// helpers

/** Records of later phases: P4G never writes any of them. */
const LATER_TABLES = ['candidate_assessments', 'assessment_sources'];

async function expectNoLaterRecords(): Promise<void> {
  for (const table of LATER_TABLES) expect(await countRows(prisma, table), table).toBe(0);
}

interface Versioned<T> {
  readonly data: T;
  readonly etag: string;
}

const errorBody = (result: HttpResult) =>
  (result.json as { error?: { code: string; details: Record<string, unknown> } } | undefined)
    ?.error;
const code = (result: HttpResult) => errorBody(result)?.code ?? `(no error: HTTP ${result.status})`;
const outcome = (result: HttpResult) => [result.status, code(result)];
const detailsOf = (result: HttpResult) => errorBody(result)?.details ?? {};
function versioned<T>(result: HttpResult, status: number): Versioned<T> {
  expect(result.status, result.text).toBe(status);
  return { data: dataOf<T>(result), etag: etagOf(result) };
}
function immutable<T>(result: HttpResult, status: number): T {
  expect(result.status, result.text).toBe(status);
  expect(result.headers['etag']).toBeUndefined();
  return dataOf<T>(result);
}
const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

/** A request to a path that is not routed (not recorded: it has no contract operation). */
function unrouted(method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT', target: string) {
  return http(t.port, method, `/api/v1${target}`, {
    headers: {
      Origin: ALLOWED_ORIGIN,
      'X-Requested-With': 'TB-APP',
      ...cookieHeader(client.session.token),
      'X-CSRF-Token': client.session.csrfToken,
      'Idempotency-Key': newKey(),
      ...(method === 'GET' ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(method === 'GET' ? {} : { body: '{}' }),
  });
}

/** Every row of every table this suite can touch (audit and idempotency included). */
async function suiteDump(
  tables: readonly string[] = [...DIRECTORY_SUITE_TABLES, ...LATER_TABLES],
): Promise<Record<string, string[]>> {
  const dump: Record<string, string[]> = {};
  for (const table of tables) {
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM \`${table}\``,
    );
    dump[table] = rows
      .map((row) =>
        JSON.stringify(row, (_key, value: unknown) =>
          typeof value === 'bigint' ? value.toString() : value,
        ),
      )
      .sort();
  }
  return dump;
}

/** The stored row of one candidate, every column, as MySQL returns it. */
async function candidateRow(id: string): Promise<Record<string, unknown>> {
  const [row] = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT * FROM notice_candidates WHERE id = ${id}`;
  if (!row) throw new Error('no stored candidate');
  return row;
}

// directory (P2–P3A) ----------------------------------------------------------------------------

const createAgency = async (label = 'A', body: Record<string, unknown> = {}) =>
  versioned<Agency>(
    await client.write('createAgency', 'POST', '/agencies', {
      displayName: `SYNTHETIC Agency ${label}`,
      ...body,
    }),
    201,
  );
const createOwner = async (label = 'X') =>
  versioned<Owner>(
    await client.write('createOwner', 'POST', '/owners', {
      displayName: `SYNTHETIC Brand ${label}`,
    }),
    201,
  );
const getOwner = async (id: string) =>
  versioned<Owner>(await client.get('getOwner', `/owners/${id}`), 200);
const createSubject = async (label = 'L') =>
  versioned<LegalSubject>(
    await client.write('createLegalSubject', 'POST', '/legal-subjects', {
      subjectType: 'LEGAL_ENTITY',
      legalName: `SYNTHETIC Subject ${label} LLC`,
    }),
    201,
  );
const createSigner = async (agencyId: string, name = 'SYNTHETIC Signer Person') =>
  versioned<Signer>(
    await client.write('createSigner', 'POST', '/signers', {
      agencyId,
      fullLegalName: name,
      contactEmail: 'route-default-signer@example.invalid',
    }),
    201,
  );
async function link(ownerId: string, legalSubjectId: string) {
  const owner = await getOwner(ownerId);
  return versioned<OwnerSubject>(
    await client.write(
      'linkOwnerSubject',
      'POST',
      `/owners/${ownerId}/subjects`,
      { legalSubjectId },
      { ifMatch: owner.etag },
    ),
    201,
  );
}
const createRoute = async (body: Record<string, unknown>) =>
  versioned<Route>(await client.write('createRoute', 'POST', '/routes', body), 201);

const SOURCE_BASE = {
  title: 'SYNTHETIC source (test only; not evidence)',
  sourceRole: 'OPERATOR_INPUT',
  scopeText: 'SYNTHETIC recorded scope',
};
const createSource = async (body: Record<string, unknown> = {}) =>
  immutable<SourceReference>(
    await client.write('createSource', 'POST', '/sources', { ...SOURCE_BASE, ...body }),
    201,
  );
const reviseSource = async (id: string, body: Record<string, unknown> = {}) =>
  immutable<SourceReference>(
    await client.write('reviseSource', 'POST', `/sources/${id}/revisions`, {
      ...SOURCE_BASE,
      ...body,
    }),
    201,
  );

// authority (P3B) -------------------------------------------------------------------------------

const createMandate = async (agencyId: string, label = 'SYNTHETIC Representation agreement') =>
  versioned<Mandate>(
    await client.write('createMandate', 'POST', '/mandates', { agencyId, label }),
    201,
  );
const getMandate = async (id: string) =>
  versioned<Mandate>(await client.get('getMandate', `/mandates/${id}`), 200);
async function createVersion(mandateId: string, body: Record<string, unknown>) {
  const mandate = await getMandate(mandateId);
  return versioned<MandateVersion>(
    await client.write(
      'createMandateVersion',
      'POST',
      `/mandates/${mandateId}/versions`,
      { changeKind: 'NEW_AUTHORIZATION', changeReason: 'SYNTHETIC capture', ...body },
      { ifMatch: mandate.etag },
    ),
    201,
  );
}
const getVersion = async (id: string) =>
  versioned<MandateVersion>(await client.get('getMandateVersion', `/mandate-versions/${id}`), 200);
async function freeze(id: string) {
  const version = await getVersion(id);
  return versioned<MandateVersion>(
    await client.write(
      'freezeMandateVersion',
      'POST',
      `/mandate-versions/${id}/freeze`,
      { reason: 'SYNTHETIC freeze of the recorded terms' },
      { ifMatch: version.etag },
    ),
    200,
  );
}
async function createCoverage(versionId: string, body: Record<string, unknown>) {
  const version = await getVersion(versionId);
  return versioned<MandateCoverage>(
    await client.write(
      'createCoverage',
      'POST',
      `/mandate-versions/${versionId}/coverages`,
      { coverageLabel: 'SYNTHETIC coverage', ...body },
      { ifMatch: version.etag },
    ),
    201,
  );
}
const getCoverage = async (id: string) =>
  versioned<MandateCoverage>(await client.get('getCoverage', `/coverages/${id}`), 200);
async function addCoverageSigner(coverageId: string, body: Record<string, unknown>) {
  const coverage = await getCoverage(coverageId);
  return versioned<CoverageSigner>(
    await client.write(
      'createCoverageSigner',
      'POST',
      `/coverages/${coverageId}/signers`,
      { capacity: 'SYNTHETIC capacity', ...body },
      { ifMatch: coverage.etag },
    ),
    201,
  );
}
const eventBody = (sourceId: string) => ({
  eventType: 'TERMINATION',
  provenance: 'OPERATOR_REPORTED',
  sourceId,
  scopeText: 'SYNTHETIC whole mandate',
  interpretation: 'SYNTHETIC operator reading',
});
async function recordEvent(mandateId: string, sourceId: string) {
  const mandate = await getMandate(mandateId);
  return immutable<AuthorityEvent>(
    await client.write(
      'recordAuthorityEvent',
      'POST',
      `/mandates/${mandateId}/events`,
      eventBody(sourceId),
      { ifMatch: mandate.etag },
    ),
    201,
  );
}

/**
 * Agency A (with a recorded legal name) and its own canonical-record source, Owner X – LegalSubject
 * L (LINKED), the route of A over that association and a Signer of A.
 */
async function world(label = 'A') {
  const agency = await createAgency(label, {
    legalName: `SYNTHETIC ${label} Agency Legal Name Ltd`,
  });
  const owner = await createOwner(`${label}-X`);
  const subject = await createSubject(`${label}-L`);
  const association = await link(owner.data.id, subject.data.id);
  const signer = await createSigner(agency.data.id, `SYNTHETIC ${label} Signer Person`);
  const route = await createRoute({
    agencyId: agency.data.id,
    ownerSubjectId: association.data.id,
    defaultSignerId: signer.data.id,
  });
  const source = await createSource({
    agencyId: agency.data.id,
    title: `SYNTHETIC ${label} agency record`,
    sourceRole: 'CANONICAL_RECORD',
  });
  return { agency, owner, subject, association, route, signer, source };
}
type World = Awaited<ReturnType<typeof world>>;

/** One frozen mandate version of the world's agency with one coverage of its route and signer. */
async function authority(w: World, label = 'mandate') {
  const mandate = await createMandate(w.agency.data.id, `SYNTHETIC ${label}`);
  const basis = await createSource({
    agencyId: w.agency.data.id,
    title: `SYNTHETIC ${label} coverage basis`,
  });
  const version = await createVersion(mandate.data.id, {
    primarySourceId: w.source.id,
    documentState: 'SIGNED_APPEARING',
  });
  const coverage = await createCoverage(version.data.id, {
    routeId: w.route.data.id,
    basisSourceId: basis.id,
    actionScope: ['PREPARE_NOTICE'],
    coverageLabel: `SYNTHETIC ${label} coverage`,
  });
  await addCoverageSigner(coverage.data.id, { signerId: w.signer.data.id, sourceId: basis.id });
  await freeze(version.data.id);
  return {
    mandate: await getMandate(mandate.data.id),
    version: await getVersion(version.data.id),
    coverage: await getCoverage(coverage.data.id),
    basis,
  };
}

// cases (P4A) and intake (P4B) ------------------------------------------------------------------

const createCase = async (agencyId: string, body: Record<string, unknown> = {}) =>
  versioned<CaseRecord>(
    await client.write('createCase', 'POST', '/cases', {
      agencyId,
      intakeLabel: 'SYNTHETIC intake',
      ...body,
    }),
    201,
  );
const getCase = async (id: string) =>
  versioned<CaseRecord>(await client.get('getCase', `/cases/${id}`), 200);
async function patchCase(id: string, body: Record<string, unknown>) {
  const current = await getCase(id);
  return versioned<CaseRecord>(
    await client.write('patchCase', 'PATCH', `/cases/${id}`, body, { ifMatch: current.etag }),
    200,
  );
}
async function archiveCase(id: string) {
  const current = await getCase(id);
  return versioned<CaseRecord>(
    await client.write(
      'ArchiveCase',
      'POST',
      `/cases/${id}/archive`,
      { reason: 'SYNTHETIC archive' },
      { ifMatch: current.etag },
    ),
    200,
  );
}
/** The selected intended sender mailbox of every selection in this suite. */
const SENDER = 'synthetic-sender@example.invalid';
const PLATFORM = 'synthetic-platform-notices@example.invalid';
const choose = (w: World, coverageIds: readonly string[], taskType = 'INITIAL') => ({
  routeId: w.route.data.id,
  signerId: w.signer.data.id,
  taskType,
  intendedFromEmail: SENDER,
  selectionNote: 'SYNTHETIC selection note',
  coverages: coverageIds.map((coverageId, index) => ({
    coverageId,
    applicationScope: `SYNTHETIC application scope ${index + 1}`,
  })),
});
async function select(caseId: string, body: Record<string, unknown>) {
  const current = await getCase(caseId);
  return immutable<CaseAuthoritySelection>(
    await client.write(
      'selectCaseAuthority',
      'POST',
      `/cases/${caseId}/authority-selections`,
      body,
      { ifMatch: current.etag },
    ),
    201,
  );
}
async function linkSource(caseId: string, sourceId: string) {
  const current = await getCase(caseId);
  return versioned<CaseSource>(
    await client.write(
      'linkCaseSource',
      'POST',
      `/cases/${caseId}/sources`,
      { sourceId, useRole: 'SYNTHETIC_SUPPORT', scopeNote: 'SYNTHETIC scope note' },
      { ifMatch: current.etag },
    ),
    201,
  );
}
async function setLinkState(id: string, state: 'LINKED' | 'PAUSED' | 'UNLINKED') {
  const current = versioned<CaseSource>(
    await client.get('getCaseSource', `/case-sources/${id}`),
    200,
  );
  return versioned<CaseSource>(
    await client.write(
      'setCaseSourceLinkState',
      'POST',
      `/case-sources/${id}/link-state`,
      { state, reason: `SYNTHETIC link ${state}` },
      { ifMatch: current.etag },
    ),
    200,
  );
}

const VIDEO = 'dQw4w9WgXcQ';
const itemUrl = (id = VIDEO) => `https://www.youtube.com/watch?v=${id}`;
async function caseCreate(
  operationId: string,
  caseId: string,
  collection: string,
  body: object,
): Promise<HttpResult> {
  const current = await getCase(caseId);
  return client.write(operationId, 'POST', `/cases/${caseId}/${collection}`, body, {
    ifMatch: current.etag,
  });
}
const createItem = async (caseId: string, body: Record<string, unknown> = {}) =>
  versioned<ReportedItem>(
    await caseCreate('createReportedItem', caseId, 'reported-items', {
      rawUrl: itemUrl(),
      ...body,
    }),
    201,
  );
const createWork = async (caseId: string, body: Record<string, unknown> = {}) =>
  versioned<CaseWork>(
    await caseCreate('createCaseWork', caseId, 'works', { title: 'SYNTHETIC Work Title', ...body }),
    201,
  );
async function patchWork(caseId: string, id: string, body: Record<string, unknown>) {
  const current = versioned<CaseWork>(
    await client.get('getCaseWork', `/cases/${caseId}/works/${id}`),
    200,
  );
  return versioned<CaseWork>(
    await client.write('patchCaseWork', 'PATCH', `/cases/${caseId}/works/${id}`, body, {
      ifMatch: current.etag,
    }),
    200,
  );
}
const createMapping = async (caseId: string, body: Record<string, unknown>) =>
  versioned<UseMapping>(
    await caseCreate('createUseMapping', caseId, 'mappings', { occurrence: 1, ...body }),
    201,
  );
async function patchMapping(caseId: string, id: string, body: Record<string, unknown>) {
  const current = versioned<UseMapping>(
    await client.get('getUseMapping', `/cases/${caseId}/mappings/${id}`),
    200,
  );
  return versioned<UseMapping>(
    await client.write('patchUseMapping', 'PATCH', `/cases/${caseId}/mappings/${id}`, body, {
      ifMatch: current.etag,
    }),
    200,
  );
}
const FACT = {
  factType: 'RIGHTS_BASIS',
  value: { basis: 'UNKNOWN', assertion: 'SYNTHETIC rights basis as reported', limitations: null },
  scopeKind: 'CASE',
  provenance: 'OPERATOR_REPORTED',
  scopeText: 'SYNTHETIC scope of this fact',
  changeReason: 'SYNTHETIC initial intake',
  sources: [],
};
const createFact = async (caseId: string) =>
  immutable<CaseFact>(await caseCreate('createCaseFact', caseId, 'facts', FACT), 201);
async function reviseFact(caseId: string, id: string) {
  const current = await getCase(caseId);
  return immutable<CaseFact>(
    await client.write(
      'reviseCaseFact',
      'POST',
      `/cases/${caseId}/facts/${id}/revisions`,
      {
        ...FACT,
        value: { ...FACT.value, assertion: 'SYNTHETIC revised assertion' },
        changeReason: 'SYNTHETIC revision',
      },
      { ifMatch: current.etag },
    ),
    201,
  );
}

// correspondence (P4C) --------------------------------------------------------------------------

const MAILBOX = 'notices@example.invalid';
const capture = async (agencyId: string, body: Record<string, unknown> = {}) =>
  immutable<Correspondence>(
    await client.write('captureCorrespondence', 'POST', '/correspondence', {
      agencyId,
      mailboxAddress: MAILBOX,
      direction: 'INBOUND',
      subject: 'SYNTHETIC platform message',
      captureMode: 'COPIED_FULL_TEXT',
      bodyRole: 'FULL_MESSAGE',
      bodyText: 'SYNTHETIC message body as captured',
      ...body,
    }),
    201,
  );
async function bind(caseId: string, body: Record<string, unknown>) {
  const current = await getCase(caseId);
  return immutable<CorrespondenceBinding>(
    await client.write(
      'bindCaseCorrespondence',
      'POST',
      `/cases/${caseId}/correspondence-bindings`,
      body,
      { ifMatch: current.etag },
    ),
    201,
  );
}

// production context (P4D) and prompts (P4E) ----------------------------------------------------

interface Scope {
  readonly taskType?: 'INITIAL' | 'NMI_REPLY';
  readonly generationMode?: 'PREPARATION' | 'DRAFTING';
  readonly authoritySelectionId?: string;
  readonly parentBindingId?: string;
  readonly priorBindingIds?: readonly string[];
}
function contextPath(caseId: string, scope: Scope): string {
  const params = new URLSearchParams();
  params.set('taskType', scope.taskType ?? 'INITIAL');
  params.set('generationMode', scope.generationMode ?? 'DRAFTING');
  if (scope.authoritySelectionId) params.set('authoritySelectionId', scope.authoritySelectionId);
  if (scope.parentBindingId) params.set('parentBindingId', scope.parentBindingId);
  for (const id of scope.priorBindingIds ?? []) params.append('priorBindingIds', id);
  return `/cases/${caseId}/production-context?${params.toString()}`;
}
async function context(caseId: string, scope: Scope = {}): Promise<ContextView> {
  const result = await client.get('getProductionContext', contextPath(caseId, scope));
  expect(result.status, result.text).toBe(200);
  return dataOf<ContextView>(result);
}
/** Reads the context of a scope and generates a prompt against exactly that read. */
async function generate(caseId: string, scope: Scope = {}): Promise<PromptSnapshot> {
  const view = await context(caseId, scope);
  return immutable<PromptSnapshot>(
    await client.write('generatePrompt', 'POST', `/cases/${caseId}/prompts`, {
      taskType: scope.taskType ?? 'INITIAL',
      generationMode: scope.generationMode ?? 'DRAFTING',
      expectedContextRevision: view.contextRevision,
      expectedDependencyDigest: view.dependencyDigest,
      ...(scope.authoritySelectionId === undefined
        ? {}
        : { authoritySelectionId: scope.authoritySelectionId }),
      ...(scope.parentBindingId === undefined ? {} : { parentBindingId: scope.parentBindingId }),
      priorBindingIds: [...(scope.priorBindingIds ?? [])],
    }),
    201,
  );
}

/**
 * The context scope of a prompt snapshot, as a caller derives it to validate a candidate of it:
 * its task, mode, selection and parent, and its prior bindings — the correspondence bindings of its
 * frozen manifest other than the parent.
 */
function scopeOf(prompt: PromptSnapshot): Scope {
  const bindings = prompt.dependencyManifest
    .filter((dependency) => dependency.entityType === 'CorrespondenceBinding')
    .map((dependency) => dependency.entityId);
  return {
    taskType: prompt.taskType,
    generationMode: prompt.generationMode,
    ...(prompt.authoritySelectionId === null
      ? {}
      : { authoritySelectionId: prompt.authoritySelectionId }),
    ...(prompt.parentBindingId === null ? {} : { parentBindingId: prompt.parentBindingId }),
    priorBindingIds: bindings.filter((id) => id !== prompt.parentBindingId).sort(),
  };
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** Waits until a concurrent write has claimed its key, then a little longer (its first lock). */
async function claimed(key: string): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
    const count = await prisma.idempotencyRecord.count({
      where: { idempotencyKey: key, state: 'IN_PROGRESS' },
    });
    if (count === 1) break;
    await pause(10);
  }
  await pause(300);
}

/**
 * A synthetic production world: the directory and a frozen authority chain, a case bound to the
 * route with an explicit selection, one reported item, one work, one mapping, a fact and a linked
 * case source — and one INITIAL DRAFTING prompt generated against that selection.
 */
async function promptWorld(label = 'A', generationMode: 'PREPARATION' | 'DRAFTING' = 'DRAFTING') {
  const w = await world(label);
  const a = await authority(w);
  const created = await createCase(w.agency.data.id, { routeId: w.route.data.id });
  const caseId = created.data.id;
  const selection = await select(caseId, choose(w, [a.coverage.data.id]));
  const item = await createItem(caseId, { displayTitle: `SYNTHETIC ${label} reported video` });
  const work = await createWork(caseId, { title: `SYNTHETIC ${label} work` });
  const basis = await createSource({
    agencyId: w.agency.data.id,
    title: `SYNTHETIC ${label} mapping basis`,
  });
  const mapping = await createMapping(caseId, {
    caseWorkId: work.data.id,
    reportedItemId: item.data.id,
    basisSourceId: basis.id,
    provenance: 'OPERATOR_REPORTED',
  });
  const fact = await createFact(caseId);
  const linked = await createSource({
    agencyId: w.agency.data.id,
    title: `SYNTHETIC ${label} licence copy`,
    contentSha256: 'e'.repeat(64),
    hashTarget: 'RAW_FILE',
  });
  const caseSource = await linkSource(caseId, linked.id);
  const prompt = await generate(caseId, { authoritySelectionId: selection.id, generationMode });
  return { w, a, caseId, selection, item, work, basis, mapping, fact, linked, caseSource, prompt };
}

/**
 * The reply world: a prompt world plus a captured NMI (with its own Reply-To) and a prior
 * transmission recorded as sent whose captured attachments name one source, both bound to the case,
 * and one NMI_REPLY DRAFTING prompt with that parent and prior.
 */
async function replyWorld(label = 'A') {
  const p = await promptWorld(label);
  const agencyId = p.w.agency.data.id;
  const supplied = await createSource({
    agencyId,
    title: `SYNTHETIC ${label} licence copy sent earlier`,
  });
  const nmiMessage = await capture(agencyId, {
    subject: 'SYNTHETIC we need more information',
    bodyText: 'SYNTHETIC Question 1: please provide the licence.',
    fromAddress: 'synthetic-platform-review@example.invalid',
    replyToAddress: 'synthetic-reply-here@example.invalid',
  });
  const nmi = await bind(p.caseId, { correspondenceId: nmiMessage.id, eventType: 'NMI' });
  const sentMessage = await capture(agencyId, {
    direction: 'OUTBOUND',
    subject: 'SYNTHETIC copyright notice',
    captureMode: 'OPERATOR_REPORTED',
    bodyRole: 'UNKNOWN',
    bodyText: null,
    limitations: 'SYNTHETIC reported by the operator; no raw message kept',
    attachmentsManifest: [
      { fileName: 'synthetic-licence.pdf', sourceId: supplied.id, state: 'COPIED_TEXT_ALLEGATION' },
    ],
  });
  const sent = await bind(p.caseId, {
    correspondenceId: sentMessage.id,
    eventType: 'INITIAL_AS_SENT',
    reportedItemId: p.item.data.id,
  });
  const replyPrompt = await generate(p.caseId, {
    taskType: 'NMI_REPLY',
    authoritySelectionId: p.selection.id,
    parentBindingId: nmi.id,
    priorBindingIds: [sent.id],
  });
  return { ...p, supplied, nmiMessage, nmi, sentMessage, sent, replyPrompt };
}

// candidates (P4F) ------------------------------------------------------------------------------

const SLOT = '[PENDING AUTHORIZED SIGNER — FULL LEGAL NAME REQUIRED]';
/** A draft with nothing a technical rule reports: exact text with CRLF, NFD and one slot. */
const CLEAN_BODY =
  'SYNTHETIC notice text for human review.\r\nThe recorded work appears in the reported video (café, café).\n\nSincerely,\n' +
  `${SLOT}\n`;

interface DraftFields {
  readonly subject?: string;
  readonly bodyText?: string;
  readonly envelope?: Record<string, unknown>;
  readonly preparedDocuments?: ReadonlyArray<Record<string, unknown>>;
}
/** The import body of a draft from `prompt` (sender = the selected mailbox, its parent if any). */
function draft(prompt: PromptSnapshot, fields: DraftFields = {}): Record<string, unknown> {
  const { envelope, ...rest } = fields;
  return {
    promptSnapshotId: prompt.id,
    subject: 'SYNTHETIC notice subject',
    envelope: {
      from: SENDER,
      to: prompt.parentBindingId === null ? PLATFORM : 'synthetic-reply-here@example.invalid',
      ...(prompt.parentBindingId === null ? {} : { parentBindingId: prompt.parentBindingId }),
      ...envelope,
    },
    bodyText: CLEAN_BODY,
    preparedDocuments: [],
    ...rest,
  };
}
async function importCandidate(caseId: string, body: Record<string, unknown>) {
  return immutable<NoticeCandidate>(
    await client.write('importCandidate', 'POST', `/cases/${caseId}/candidates`, body),
    201,
  );
}
async function supersede(id: string) {
  return immutable<NoticeCandidate>(
    await client.write('supersedeCandidate', 'POST', `/candidates/${id}/supersede`, {
      reason: 'SYNTHETIC replaced by a corrected draft',
    }),
    200,
  );
}
const plan = (sourceId: string, fields: Record<string, unknown> = {}) => ({
  sourceId,
  purpose: 'SYNTHETIC planned document',
  state: 'REFERENCE_ONLY',
  disclosureReview: 'PENDING',
  ...fields,
});

/** The TB-CANDIDATE-ARTIFACT-v1 hash of stored content, from the frozen helper (the oracle). */
function artifactOf(content: {
  subject: string;
  bodyText: string;
  envelope: Record<string, unknown>;
  preparedDocuments: ReadonlyArray<Record<string, unknown>>;
}): string {
  return frozen.canonicalSha256({
    algorithm: 'TB-CANDIDATE-ARTIFACT-v1',
    subject: content.subject,
    bodyText: content.bodyText,
    envelope: {
      from: content.envelope['from'],
      to: content.envelope['to'],
      replyTo: content.envelope['replyTo'] ?? null,
      parentBindingId: content.envelope['parentBindingId'] ?? null,
    },
    preparedDocuments: content.preparedDocuments.map((entry) => ({
      sourceId: entry['sourceId'],
      purpose: entry['purpose'],
      state: entry['state'],
      fileName: entry['fileName'] ?? null,
      contentSha256: entry['contentSha256'] ?? null,
      disclosureReview: entry['disclosureReview'],
      limitations: entry['limitations'] ?? null,
    })),
    signatureState: 'HUMAN_PENDING',
    signatureSlot: frozen.PENDING_SIGNATURE,
  });
}

/**
 * Stored data the application never writes, set directly in tb_notice_test: exercises the
 * ruleset's integrity checks over real stored values. With `rehash`, the artifact SHA-256 is
 * recomputed with the frozen helper so only the injected relationship differs.
 */
async function inject(
  candidate: NoticeCandidate,
  change: {
    subject?: string;
    bodyText?: string;
    bodySha256?: string;
    artifactSha256?: string;
    envelope?: Record<string, unknown>;
    preparedDocuments?: ReadonlyArray<Record<string, unknown>>;
  },
  rehash = false,
): Promise<NoticeCandidate> {
  const next = {
    subject: change.subject ?? candidate.subject,
    bodyText: change.bodyText ?? candidate.bodyText,
    envelope: change.envelope ?? (candidate.envelopeJson as Record<string, unknown>),
    preparedDocuments:
      change.preparedDocuments ??
      (candidate.preparedDocuments as ReadonlyArray<Record<string, unknown>>),
  };
  const artifactSha256 =
    change.artifactSha256 ?? (rehash ? artifactOf(next) : candidate.artifactSha256);
  await prisma.$executeRaw`
    UPDATE notice_candidates
    SET subject = ${next.subject},
        body_text = ${next.bodyText},
        body_sha256 = ${change.bodySha256 ?? candidate.bodySha256},
        artifact_sha256 = ${artifactSha256},
        envelope_json = CAST(${JSON.stringify(next.envelope)} AS JSON),
        prepared_documents = CAST(${JSON.stringify(next.preparedDocuments)} AS JSON)
    WHERE id = ${candidate.id}`;
  // Read back without recording: injected rows are deliberately not what the contract allows (the
  // contract check at the end covers what the application itself returns).
  const result = await http(t.port, 'GET', `/api/v1/candidates/${candidate.id}`, {
    headers: { Origin: ALLOWED_ORIGIN, ...cookieHeader(client.session.token) },
  });
  expect(result.status, result.text).toBe(200);
  return dataOf<NoticeCandidate>(result);
}

// validation (P4G) ------------------------------------------------------------------------------

const validatePost = (candidateId: string, body: unknown, key?: string | null) =>
  client.write(
    'validateCandidate',
    'POST',
    `/candidates/${candidateId}/validation-runs`,
    body,
    key === undefined ? {} : { key },
  );
const expectations = (candidate: NoticeCandidate, view: ContextView) => ({
  expectedArtifactSha256: candidate.artifactSha256,
  expectedDependencyDigest: view.dependencyDigest,
});
/** Reads the current context of the candidate's prompt scope and validates against exactly it. */
async function validate(
  candidate: NoticeCandidate,
  prompt: PromptSnapshot,
  key?: string,
): Promise<{ run: ValidationRun; view: ContextView }> {
  const view = await context(candidate.caseId, scopeOf(prompt));
  const run = immutable<ValidationRun>(
    await validatePost(candidate.id, expectations(candidate, view), key),
    201,
  );
  return { run, view };
}
async function listRuns(candidateId: string, query = '') {
  const result = await client.get(
    'listValidationRuns',
    `/candidates/${candidateId}/validation-runs${query}`,
  );
  expect(result.status, result.text).toBe(200);
  return dataOf<{ items: ValidationRunSummary[]; nextCursor: string | null }>(result);
}
async function listIssues(runId: string, query = '') {
  const result = await client.get(
    'listValidationIssues',
    `/validation-runs/${runId}/issues${query}`,
  );
  expect(result.status, result.text).toBe(200);
  return dataOf<{ items: ValidationIssue[]; nextCursor: string | null }>(result);
}
/** Every issue of a run, following the cursor. */
async function issuesOf(runId: string): Promise<ValidationIssue[]> {
  const all: ValidationIssue[] = [];
  let cursor: string | null = null;
  do {
    const page = await listIssues(
      runId,
      `?limit=100${cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`}`,
    );
    all.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor !== null);
  return all;
}
const ruleIds = (issues: readonly ValidationIssue[]) => [
  ...new Set(issues.map((issue) => issue.ruleId)),
];
const issuesOfRule = (issues: readonly ValidationIssue[], ruleId: string) =>
  issues.filter((issue) => issue.ruleId === ruleId);

/** A prompt world with a clean candidate of its DRAFTING prompt. */
async function validationWorld(label = 'A') {
  const p = await promptWorld(label);
  const candidate = await importCandidate(p.caseId, draft(p.prompt));
  return { ...p, candidate };
}

const ALL_RULES = REQUIRED_RULES.map((rule) => rule.id);

// ---------------------------------------------------------------------------------------------

describe('P4G validateCandidate — a technical result for one exact artifact against the current context', () => {
  it('a clean DRAFTING candidate: TECHNICAL_PASS with every rule executed, bound to the exact artifact and the fresh context of its prompt’s scope; nothing else changes', async () => {
    const p = await validationWorld();
    const caseBefore = await prisma.caseRecord.findUniqueOrThrow({ where: { id: p.caseId } });
    const candidateBefore = await candidateRow(p.candidate.id);
    const auditBefore = await countRows(prisma, 'audit_events');
    const { run, view } = await validate(p.candidate, p.prompt);
    // The prompt was generated from this very context: nothing changed since.
    expect(view.dependencyDigest).toBe(p.prompt.dependencyDigest);
    expect(view.context.missing).toEqual([]);
    expect(view.context.conflicts).toEqual([]);
    expect(run).toEqual({
      id: run.id,
      candidateId: p.candidate.id,
      caseId: p.caseId,
      artifactSha256: p.candidate.artifactSha256,
      dependencyDigest: view.dependencyDigest,
      dependencyManifest: view.dependencies,
      evaluatedContextJson: view.context,
      rulesetVersion: 'TB-TECHNICAL-RULESET-v1',
      result: 'TECHNICAL_PASS',
      coverageManifest: {
        requiredRuleIds: ALL_RULES,
        executedRuleIds: ALL_RULES,
        notExecutedRuleIds: [],
        semanticReviewRequired: true,
      },
      blockerCount: 0,
      reviewRequiredCount: 0,
      warningCount: 0,
      startedAt: new Date(t.clock.ms).toISOString(),
      completedAt: new Date(t.clock.ms).toISOString(),
      createdAt: new Date(t.clock.ms).toISOString(),
      createdById: client.session.userId,
    });
    expect(ALL_RULES).toHaveLength(29);
    expect(p.candidate.bodySha256).toBe(sha256(CLEAN_BODY));
    expect(await issuesOf(run.id)).toEqual([]);
    // One run, one audit event, one idempotency record; the case and the candidate unchanged.
    expect(await countRows(prisma, 'validation_runs')).toBe(1);
    expect(await countRows(prisma, 'validation_issues')).toBe(0);
    expect(await countRows(prisma, 'audit_events')).toBe(auditBefore + 1);
    expect(await prisma.caseRecord.findUniqueOrThrow({ where: { id: p.caseId } })).toEqual(
      caseBefore,
    );
    expect(await candidateRow(p.candidate.id)).toEqual(candidateBefore);
    await expectNoLaterRecords();
  });

  it('request rules: the contract body only (422), an Idempotency-Key (400), no If-Match needed; an unknown candidate is 404; nothing is written for a refusal', async () => {
    const p = await validationWorld();
    const view = await context(p.caseId, scopeOf(p.prompt));
    const good = expectations(p.candidate, view);
    for (const body of [
      {},
      { expectedArtifactSha256: good.expectedArtifactSha256 },
      { ...good, expectedDependencyDigest: 'Z'.repeat(64) },
      { ...good, expectedArtifactSha256: good.expectedArtifactSha256.toUpperCase() },
      { ...good, result: 'TECHNICAL_PASS' },
      { ...good, rulesetVersion: 'TB-TECHNICAL-RULESET-v1' },
    ]) {
      expect(outcome(await validatePost(p.candidate.id, body)), JSON.stringify(body)).toEqual([
        422,
        'VALIDATION_FAILED',
      ]);
    }
    expect(outcome(await validatePost(p.candidate.id, good, null))).toEqual([
      400,
      'IDEMPOTENCY_KEY_REQUIRED',
    ]);
    expect(outcome(await validatePost(randomUUID(), good))).toEqual([404, 'NOT_FOUND']);
    expect(await countRows(prisma, 'validation_runs')).toBe(0);
    expect(
      await prisma.idempotencyRecord.count({ where: { operationId: 'validateCandidate' } }),
    ).toBe(0);
  });

  it('the artifact reviewed must be the stored one: another expected artifact SHA-256 is 412 ARTIFACT_CHANGED before any context is used, nothing recorded, the key released', async () => {
    const p = await validationWorld();
    const view = await context(p.caseId, scopeOf(p.prompt));
    const key = newKey();
    const refused = await validatePost(
      p.candidate.id,
      { ...expectations(p.candidate, view), expectedArtifactSha256: 'a'.repeat(64) },
      key,
    );
    expect(outcome(refused)).toEqual([412, 'ARTIFACT_CHANGED']);
    expect(detailsOf(refused)).toEqual({ field: 'expectedArtifactSha256' });
    expect(await countRows(prisma, 'validation_runs')).toBe(0);
    expect(await prisma.idempotencyRecord.count({ where: { idempotencyKey: key } })).toBe(0);
    // Even with a stale digest, the artifact is checked first.
    const both = await validatePost(p.candidate.id, {
      expectedArtifactSha256: 'a'.repeat(64),
      expectedDependencyDigest: 'b'.repeat(64),
    });
    expect(outcome(both)).toEqual([412, 'ARTIFACT_CHANGED']);
    // The released key serves the correct request.
    const run = immutable<ValidationRun>(
      await validatePost(p.candidate.id, expectations(p.candidate, view), key),
      201,
    );
    expect(run.result).toBe('TECHNICAL_PASS');
  });

  it('the context reviewed must be the current one: another expected digest is 412 CONTEXT_CHANGED — never substituted, nothing recorded', async () => {
    const p = await validationWorld();
    const refused = await validatePost(p.candidate.id, {
      expectedArtifactSha256: p.candidate.artifactSha256,
      expectedDependencyDigest: 'b'.repeat(64),
    });
    expect(outcome(refused)).toEqual([412, 'CONTEXT_CHANGED']);
    expect(detailsOf(refused)).toEqual({ field: 'expectedDependencyDigest' });
    expect(await countRows(prisma, 'validation_runs')).toBe(0);
    expect(await countRows(prisma, 'validation_issues')).toBe(0);
  });

  it('a relevant change after the read makes the reviewed digest stale (412): an authority event, a source head, a case-source link state, a fact revision and a mapping edit — each needs a new read; a work note does not', async () => {
    const p = await validationWorld();
    const scope = scopeOf(p.prompt);
    const changes: Array<[string, () => Promise<unknown>]> = [
      ['AuthorityEvent', () => recordEvent(p.a.mandate.data.id, p.w.source.id)],
      [
        'SourceReference head',
        () =>
          reviseSource(p.basis.id, {
            agencyId: p.w.agency.data.id,
            title: 'SYNTHETIC revised basis',
          }),
      ],
      ['CaseSource link state', () => setLinkState(p.caseSource.data.id, 'PAUSED')],
      ['CaseFact revision', () => reviseFact(p.caseId, p.fact.id)],
      [
        'UseMapping edit',
        () => patchMapping(p.caseId, p.mapping.data.id, { sourceStartMs: '1000' }),
      ],
    ];
    for (const [label, change] of changes) {
      const read = await context(p.caseId, scope);
      await change();
      const refused = await validatePost(p.candidate.id, expectations(p.candidate, read));
      expect(outcome(refused), label).toEqual([412, 'CONTEXT_CHANGED']);
      const fresh = await context(p.caseId, scope);
      expect(fresh.dependencyDigest, label).not.toBe(read.dependencyDigest);
    }
    expect(await countRows(prisma, 'validation_runs')).toBe(0);
    // A work's notes are not context: the reviewed digest stays current.
    const read = await context(p.caseId, scope);
    await patchWork(p.caseId, p.work.data.id, { notes: 'SYNTHETIC work notes (not context)' });
    await patchCase(p.caseId, { notes: 'SYNTHETIC case notes (not context)' });
    const run = immutable<ValidationRun>(
      await validatePost(p.candidate.id, expectations(p.candidate, read)),
      201,
    );
    expect(run.dependencyDigest).toBe(read.dependencyDigest);
  });

  it('a reply: the scope is the prompt’s parent and its prior bindings; a correction of the parent binding after the read is 412 CONTEXT_CHANGED, and the fresh read then names the correction', async () => {
    const r = await replyWorld();
    expect(scopeOf(r.replyPrompt)).toEqual({
      taskType: 'NMI_REPLY',
      generationMode: 'DRAFTING',
      authoritySelectionId: r.selection.id,
      parentBindingId: r.nmi.id,
      priorBindingIds: [r.sent.id],
    });
    const candidate = await importCandidate(r.caseId, draft(r.replyPrompt));
    const read = await context(r.caseId, scopeOf(r.replyPrompt));
    await bind(r.caseId, {
      correspondenceId: r.nmiMessage.id,
      eventType: 'NMI',
      supersedesBindingId: r.nmi.id,
      interpretation: 'SYNTHETIC corrected binding',
    });
    const refused = await validatePost(candidate.id, expectations(candidate, read));
    expect(outcome(refused)).toEqual([412, 'CONTEXT_CHANGED']);
    const fresh = await client.get(
      'getProductionContext',
      contextPath(r.caseId, scopeOf(r.replyPrompt)),
    );
    expect(outcome(fresh)).toEqual([409, 'BINDING_ALREADY_SUPERSEDED']);
    expect(await countRows(prisma, 'validation_runs')).toBe(0);
  });

  it('no run is published against mixed snapshots: a change committed after the capture is caught by the commit’s recheck (412, nothing written); a change that does not touch the context is not', async () => {
    const p = await validationWorld();
    const read = await context(p.caseId, scopeOf(p.prompt));
    const auditBefore = await countRows(prisma, 'audit_events');
    const key = newKey();
    validationObserver.hooks.afterCapture = async () => {
      await recordEvent(p.a.mandate.data.id, p.w.source.id);
    };
    const refused = await validatePost(p.candidate.id, expectations(p.candidate, read), key);
    expect(outcome(refused)).toEqual([412, 'CONTEXT_CHANGED']);
    expect(await countRows(prisma, 'validation_runs')).toBe(0);
    expect(await countRows(prisma, 'validation_issues')).toBe(0);
    // Only the event's own audit record was written; the key was released.
    expect(await countRows(prisma, 'audit_events')).toBe(auditBefore + 1);
    expect(await prisma.idempotencyRecord.count({ where: { idempotencyKey: key } })).toBe(0);
    const fresh = await context(p.caseId, scopeOf(p.prompt));
    validationObserver.hooks.afterCapture = async () => {
      await patchWork(p.caseId, p.work.data.id, { notes: 'SYNTHETIC notes while validating' });
    };
    const run = immutable<ValidationRun>(
      await validatePost(p.candidate.id, expectations(p.candidate, fresh), key),
      201,
    );
    expect(run.dependencyDigest).toBe(fresh.dependencyDigest);
    // The plan's sources are rechecked too: a planned agency source outside the context closure
    // (it applies to the case, it is not linked to it) gets a newer revision during the run.
    const outside = await createSource({
      agencyId: p.w.agency.data.id,
      title: 'SYNTHETIC agency document not linked to the case',
    });
    const planned = await importCandidate(
      p.caseId,
      draft(p.prompt, { preparedDocuments: [plan(outside.id)] }),
    );
    const again = await context(p.caseId, scopeOf(p.prompt));
    validationObserver.hooks.afterCapture = async () => {
      await reviseSource(outside.id, {
        agencyId: p.w.agency.data.id,
        title: 'SYNTHETIC newer revision',
      });
    };
    const planRefused = await validatePost(planned.id, expectations(planned, again));
    expect(outcome(planRefused)).toEqual([412, 'CONTEXT_CHANGED']);
    expect(detailsOf(planRefused)).toEqual({ field: 'preparedDocuments' });
    // Read again, the newer revision is a review signal: the plan is never re-pointed.
    const planRun = (await validate(planned, p.prompt)).run;
    const latest = issuesOfRule(await issuesOf(planRun.id), 'PLAN.SOURCE_LATEST_REVISION');
    expect(latest).toEqual([
      expect.objectContaining({
        severity: 'REVIEW_REQUIRED',
        fieldPath: 'preparedDocuments.0.sourceId',
      }),
    ]);
    expect(planned.preparedDocuments[0]?.sourceId).toBe(outside.id);
  });

  it('SERIALIZABLE: what the commit rechecked stays as read until it commits — a dependency write that never locks the case waits for the run', async () => {
    const p = await validationWorld();
    const read = await context(p.caseId, scopeOf(p.prompt));
    const eventsBefore = await countRows(prisma, 'authority_events');
    let event: Promise<HttpResult> | null = null;
    let eventsWhileHeld = -1;
    const eventKey = newKey();
    validationObserver.hooks.beforeInsert = async () => {
      const mandate = await getMandate(p.a.mandate.data.id);
      event = client.write(
        'recordAuthorityEvent',
        'POST',
        `/mandates/${p.a.mandate.data.id}/events`,
        eventBody(p.w.source.id),
        { ifMatch: mandate.etag, key: eventKey },
      );
      await claimed(eventKey);
      eventsWhileHeld = await countRows(prisma, 'authority_events');
    };
    const validated = await validatePost(p.candidate.id, expectations(p.candidate, read));
    if (event === null) throw new Error('the concurrent write did not start');
    const eventResult: HttpResult = await event;
    expect(eventsWhileHeld).toBe(eventsBefore);
    const run = immutable<ValidationRun>(validated, 201);
    expect(eventResult.status).toBe(201);
    expect(run.dependencyDigest).toBe(read.dependencyDigest);
    // The run is exactly the state it read; the event then made that digest stale.
    const after = await context(p.caseId, scopeOf(p.prompt));
    expect(after.dependencyDigest).not.toBe(run.dependencyDigest);
    expect(outcome(await validatePost(p.candidate.id, expectations(p.candidate, read)))).toEqual([
      412,
      'CONTEXT_CHANGED',
    ]);
  });

  it('idempotency: the same key and body replay the stored run (even after the context changed); the same key with another body is 409; a failed audit rolls everything back', async () => {
    const p = await validationWorld();
    const key = newKey();
    const { run, view } = await validate(p.candidate, p.prompt, key);
    await recordEvent(p.a.mandate.data.id, p.w.source.id);
    const replay = immutable<ValidationRun>(
      await validatePost(p.candidate.id, expectations(p.candidate, view), key),
      201,
    );
    expect(replay).toEqual(run);
    expect(await countRows(prisma, 'validation_runs')).toBe(1);
    const conflict = await validatePost(
      p.candidate.id,
      { ...expectations(p.candidate, view), expectedDependencyDigest: 'c'.repeat(64) },
      key,
    );
    expect(outcome(conflict)).toEqual([409, 'IDEMPOTENCY_CONFLICT']);
    const fresh = await context(p.caseId, scopeOf(p.prompt));
    const failedKey = newKey();
    auditWriter.armed = true;
    const failed = await validatePost(p.candidate.id, expectations(p.candidate, fresh), failedKey);
    auditWriter.armed = false;
    expect(failed.status).toBe(500);
    expect(auditWriter.failures).toBeGreaterThan(0);
    expect(await countRows(prisma, 'validation_runs')).toBe(1);
    expect(await prisma.idempotencyRecord.count({ where: { idempotencyKey: failedKey } })).toBe(0);
  });

  it('an ERROR run: a rule that fails while running is recorded as ERROR with a safe diagnostic (its name only) and listed as not executed — never a pass', async () => {
    const p = await validationWorld();
    validationObserver.failRule = 'ENVELOPE.SENDER';
    const { run } = await validate(p.candidate, p.prompt);
    expect(run.result).toBe('ERROR');
    expect(run.coverageManifest.notExecutedRuleIds).toEqual(['ENVELOPE.SENDER']);
    expect(run.coverageManifest.executedRuleIds).toHaveLength(28);
    expect(run.blockerCount).toBe(1);
    const issues = await issuesOf(run.id);
    expect(issues).toEqual([
      expect.objectContaining({
        ruleId: 'ENVELOPE.SENDER',
        checkKind: 'DETERMINISTIC',
        severity: 'BLOCKER',
        fieldPath: null,
        message: RULE_ERROR_MESSAGE,
        details: { outcome: 'ERROR', errorName: 'TypeError' },
      }),
    ]);
    // A heuristic rule that fails is an ERROR run as well; its diagnostic is never a BLOCKER.
    validationObserver.failRule = 'WORDING.ATTACHMENT_CLAIM';
    const heuristic = (await validate(p.candidate, p.prompt)).run;
    expect(heuristic.result).toBe('ERROR');
    expect(heuristic.coverageManifest.notExecutedRuleIds).toEqual(['WORDING.ATTACHMENT_CLAIM']);
    expect([heuristic.blockerCount, heuristic.reviewRequiredCount]).toEqual([0, 1]);
    expect(await issuesOf(heuristic.id)).toEqual([
      expect.objectContaining({
        ruleId: 'WORDING.ATTACHMENT_CLAIM',
        checkKind: 'HEURISTIC',
        severity: 'REVIEW_REQUIRED',
        message: RULE_ERROR_MESSAGE,
        details: { outcome: 'ERROR', errorName: 'TypeError' },
      }),
    ]);
    const stored = JSON.stringify(
      await suiteDump(['validation_runs', 'validation_issues', 'audit_events']),
    );
    expect(stored).not.toContain('SECRET-DIAGNOSTIC');
    expect(t.logs.join('\n')).not.toContain('SECRET-DIAGNOSTIC');
  });
});

describe('P4G stored integrity, signature, envelope and plan rules over real stored candidates', () => {
  it('wrong stored hashes and inexact text are technical BLOCKERs (never repaired): a body hash, an artifact hash, a NUL', async () => {
    const p = await validationWorld();
    const wrongBody = await inject(p.candidate, { bodySha256: 'a'.repeat(64) });
    const body = await validate(wrongBody, p.prompt);
    expect(body.run.result).toBe('BLOCKED');
    const bodyIssues = await issuesOf(body.run.id);
    expect(issuesOfRule(bodyIssues, 'ARTIFACT.BODY_SHA256')).toEqual([
      expect.objectContaining({
        severity: 'BLOCKER',
        fieldPath: 'bodySha256',
        details: { stored: 'a'.repeat(64), recomputed: frozen.exactTextSha256(CLEAN_BODY) },
      }),
    ]);
    const wrongArtifact = await inject(p.candidate, {
      bodySha256: p.candidate.bodySha256,
      artifactSha256: 'b'.repeat(64),
    });
    const artifact = await validate(wrongArtifact, p.prompt);
    expect(artifact.run.artifactSha256).toBe('b'.repeat(64));
    expect(ruleIds(await issuesOf(artifact.run.id))).toEqual(['ARTIFACT.ARTIFACT_SHA256']);
    const nul = await inject(p.candidate, {
      bodyText: `SYNTHETIC\u0000body\n${SLOT}\n`,
      artifactSha256: p.candidate.artifactSha256,
    });
    const withNul = await validate(nul, p.prompt);
    expect(withNul.run.result).toBe('BLOCKED');
    expect(withNul.run.coverageManifest.notExecutedRuleIds).toEqual([
      'ARTIFACT.BODY_SHA256',
      'ARTIFACT.ARTIFACT_SHA256',
    ]);
    expect(
      issuesOfRule(await issuesOf(withNul.run.id), 'ARTIFACT.TEXT_EXACT').map((i) => i.fieldPath),
    ).toEqual(['bodyText']);
  });

  it('the pending slot: zero or two are BLOCKED, one passes; a lookalike is a heuristic signal; the declaration placeholder and prompt text are deterministic BLOCKERs', async () => {
    const p = await promptWorld();
    const cases: Array<[string, string, string, string[]]> = [
      ['zero slots', 'SYNTHETIC body without a slot\n', 'BLOCKED', ['SIGNATURE.PENDING_SLOT_ONCE']],
      ['two slots', `A\n${SLOT}\nB\n${SLOT}\n`, 'BLOCKED', ['SIGNATURE.PENDING_SLOT_ONCE']],
      [
        'lookalike',
        `A\n[PENDING SIGNER NAME]\n${SLOT}\n`,
        'REVIEW_REQUIRED',
        ['SIGNATURE.SLOT_LOOKALIKE'],
      ],
      [
        'declaration placeholder',
        `A\n[REVIEWED DECLARATION TEXT REQUIRED]\n${SLOT}\n`,
        'BLOCKED',
        ['MARKER.DECLARATION_PLACEHOLDER'],
      ],
      ['prompt text', `A\nD. REVIEW NOTES\n${SLOT}\n`, 'BLOCKED', ['MARKER.PROMPT_STRUCTURE']],
      [
        'internal identifier',
        `Case ${p.caseId}\n${SLOT}\n`,
        'REVIEW_REQUIRED',
        ['MARKER.INTERNAL_IDENTIFIERS'],
      ],
    ];
    for (const [label, bodyText, result, rules] of cases) {
      const candidate = await importCandidate(p.caseId, draft(p.prompt, { bodyText }));
      const { run } = await validate(candidate, p.prompt);
      expect(run.result, label).toBe(result);
      const issues = await issuesOf(run.id);
      expect(ruleIds(issues), label).toEqual(rules);
    }
    const clean = await importCandidate(p.caseId, draft(p.prompt));
    expect((await validate(clean, p.prompt)).run.result).toBe('TECHNICAL_PASS');
  });

  it('attachment wording without a planned file is a HEURISTIC REVIEW_REQUIRED signal — never a BLOCKER and never labelled deterministic', async () => {
    const p = await promptWorld();
    const candidate = await importCandidate(
      p.caseId,
      draft(p.prompt, { bodyText: `Please find attached the licence.\n${SLOT}\n` }),
    );
    const { run } = await validate(candidate, p.prompt);
    expect(run.result).toBe('REVIEW_REQUIRED');
    expect(await issuesOf(run.id)).toEqual([
      expect.objectContaining({
        ruleId: 'WORDING.ATTACHMENT_CLAIM',
        checkKind: 'HEURISTIC',
        severity: 'REVIEW_REQUIRED',
        fieldPath: 'bodyText',
      }),
    ]);
    const prepared = await importCandidate(
      p.caseId,
      draft(p.prompt, {
        bodyText: `Please find attached the licence.\n${SLOT}\n`,
        preparedDocuments: [
          plan(p.linked.id, { state: 'PREPARED_FOR_ATTACHMENT', fileName: 'synthetic.pdf' }),
        ],
      }),
    );
    const withPlan = await validate(prepared, p.prompt);
    expect(withPlan.run.result).toBe('TECHNICAL_PASS');
    expect(withPlan.run.warningCount).toBe(1);
  });

  it('envelope and plan injections: thread, sender, another case’s source, an unknown source, an unrecorded hash, an unbacked PREVIOUSLY_SUPPLIED and ACTUALLY_ATTACHED are BLOCKERs', async () => {
    const r = await replyWorld();
    const candidate = await importCandidate(r.caseId, draft(r.replyPrompt));
    const clean = await validate(candidate, r.replyPrompt);
    // The reply keeps the parent's Reply-To: only the recorded prior's limited posture is noted.
    expect(ruleIds(await issuesOf(clean.run.id))).toEqual(['CONTEXT.MISSING']);
    const envelope = candidate.envelopeJson as Record<string, unknown>;
    const otherCase = await createCase(r.w.agency.data.id, { routeId: r.w.route.data.id });
    const foreign = await createSource({
      agencyId: r.w.agency.data.id,
      scopeBindings: { caseIds: [otherCase.data.id] },
      title: 'SYNTHETIC other case only',
    });
    const injections: Array<[string, Parameters<typeof inject>[1], string, string]> = [
      [
        'thread',
        { envelope: { ...envelope, parentBindingId: r.sent.id } },
        'ENVELOPE.THREAD',
        'envelope.parentBindingId',
      ],
      [
        'sender',
        { envelope: { ...envelope, from: 'someone-else@example.invalid' } },
        'ENVELOPE.SENDER',
        'envelope.from',
      ],
      [
        'foreign source',
        {
          preparedDocuments: [
            plan(foreign.id, { fileName: null, contentSha256: null, limitations: null }),
          ],
        },
        'PLAN.SOURCE_APPLIES',
        'preparedDocuments.0.sourceId',
      ],
      [
        'unknown source',
        {
          preparedDocuments: [
            plan(randomUUID(), { fileName: null, contentSha256: null, limitations: null }),
          ],
        },
        'PLAN.SOURCE_EXISTS',
        'preparedDocuments.0.sourceId',
      ],
      [
        'unrecorded hash',
        {
          preparedDocuments: [
            plan(r.linked.id, { fileName: null, contentSha256: 'd'.repeat(64), limitations: null }),
          ],
        },
        'PLAN.CONTENT_SHA256',
        'preparedDocuments.0.contentSha256',
      ],
      [
        'unbacked supply',
        {
          preparedDocuments: [
            plan(r.linked.id, {
              state: 'PREVIOUSLY_SUPPLIED',
              fileName: null,
              contentSha256: null,
              limitations: null,
            }),
          ],
        },
        'PLAN.PREVIOUSLY_SUPPLIED',
        'preparedDocuments.0.state',
      ],
      [
        'ACTUALLY_ATTACHED',
        {
          preparedDocuments: [
            plan(r.linked.id, {
              state: 'ACTUALLY_ATTACHED',
              fileName: null,
              contentSha256: null,
              limitations: null,
            }),
          ],
        },
        'ARTIFACT.SHAPE',
        'preparedDocuments.0.state',
      ],
    ];
    for (const [label, change, ruleId, fieldPath] of injections) {
      const injected = await inject(candidate, change, true);
      const { run } = await validate(injected, r.replyPrompt);
      expect(run.result, label).toBe('BLOCKED');
      const found = issuesOfRule(await issuesOf(run.id), ruleId);
      expect(
        found.map((issue) => [issue.severity, issue.fieldPath, issue.checkKind]),
        label,
      ).toEqual([['BLOCKER', fieldPath, 'DETERMINISTIC']]);
    }
    // Recorded only as a copied-text allegation: review required, not verified.
    const supplied = await inject(
      candidate,
      {
        envelope,
        preparedDocuments: [
          plan(r.supplied.id, {
            state: 'PREVIOUSLY_SUPPLIED',
            fileName: null,
            contentSha256: null,
            limitations: null,
          }),
        ],
      },
      true,
    );
    const limited = await validate(supplied, r.replyPrompt);
    expect(limited.run.result).toBe('REVIEW_REQUIRED');
    expect(issuesOfRule(await issuesOf(limited.run.id), 'PLAN.PREVIOUSLY_SUPPLIED')).toEqual([
      expect.objectContaining({
        severity: 'REVIEW_REQUIRED',
        details: {
          sourceId: r.supplied.id,
          reason: 'LIMITED_POSTURE',
          observedStates: ['COPIED_TEXT_ALLEGATION'],
        },
      }),
    ]);
  });

  it('a reply to another recipient than the parent’s Reply-To is review required — never a BLOCKER, never a judgement of the address', async () => {
    const r = await replyWorld();
    const candidate = await importCandidate(
      r.caseId,
      draft(r.replyPrompt, { envelope: { to: 'synthetic-platform-review@example.invalid' } }),
    );
    const { run } = await validate(candidate, r.replyPrompt);
    expect(run.result).toBe('REVIEW_REQUIRED');
    expect(issuesOfRule(await issuesOf(run.id), 'ENVELOPE.REPLY_RECIPIENT')).toEqual([
      expect.objectContaining({
        severity: 'REVIEW_REQUIRED',
        details: expect.objectContaining({
          reason: 'RECIPIENT_DIFFERS_FROM_PARENT',
          basis: 'REPLY_TO',
          expected: 'synthetic-reply-here@example.invalid',
        }),
      }),
    ]);
  });
});

describe('P4G recorded context, preparation, drift and history', () => {
  it('a PREPARATION prompt’s candidate is draft material only: BLOCKED by CONTEXT.GENERATION_MODE even when its text is clean', async () => {
    const p = await promptWorld('A', 'PREPARATION');
    expect(p.prompt.generationMode).toBe('PREPARATION');
    const candidate = await importCandidate(p.caseId, draft(p.prompt));
    const { run } = await validate(candidate, p.prompt);
    expect(run.result).toBe('BLOCKED');
    expect(await issuesOf(run.id)).toEqual([
      expect.objectContaining({
        ruleId: 'CONTEXT.GENERATION_MODE',
        severity: 'BLOCKER',
        details: { promptSnapshotId: p.prompt.id, generationMode: 'PREPARATION' },
      }),
    ]);
  });

  it('drift since the prompt: a record changed after generation is review required and named — the prompt itself never changes; the run evaluates the current context', async () => {
    const p = await validationWorld();
    await patchMapping(p.caseId, p.mapping.data.id, { sourceStartMs: '2000' });
    const { run, view } = await validate(p.candidate, p.prompt);
    expect(run.result).toBe('REVIEW_REQUIRED');
    expect(run.dependencyDigest).toBe(view.dependencyDigest);
    expect(run.dependencyDigest).not.toBe(p.prompt.dependencyDigest);
    expect(run.evaluatedContextJson.mappings[0]?.sourceStartMs).toBe('2000');
    const drift = issuesOfRule(await issuesOf(run.id), 'CONTEXT.PROMPT_DRIFT');
    expect(drift.map((issue) => issue.details)).toContainEqual(
      expect.objectContaining({
        change: 'CHANGED',
        entityType: 'UseMapping',
        entityId: p.mapping.data.id,
      }),
    );
    expect(drift.every((issue) => issue.severity === 'REVIEW_REQUIRED')).toBe(true);
    expect(drift.every((issue) => issue.checkKind === 'DETERMINISTIC')).toBe(true);
    const prompt = immutable<PromptSnapshot>(
      await client.get('getPrompt', `/prompts/${p.prompt.id}`),
      200,
    );
    expect(prompt).toEqual(p.prompt);
  });

  it('a superseded candidate is validated as the exact historical artifact; its runs stay listed after supersession', async () => {
    const p = await validationWorld();
    const before = await validate(p.candidate, p.prompt);
    const superseded = await supersede(p.candidate.id);
    const after = await validate(superseded, p.prompt);
    expect(after.run.artifactSha256).toBe(p.candidate.artifactSha256);
    expect((await listRuns(p.candidate.id)).items.map((item) => item.id).sort()).toEqual(
      [before.run.id, after.run.id].sort(),
    );
  });

  it('an archived case is read-only: 409, nothing recorded; its recorded runs stay readable', async () => {
    const p = await validationWorld();
    const { run, view } = await validate(p.candidate, p.prompt);
    await archiveCase(p.caseId);
    const refused = await validatePost(p.candidate.id, expectations(p.candidate, view));
    expect(outcome(refused)).toEqual([409, 'RECORD_STATE_CONFLICT']);
    expect((await listRuns(p.candidate.id)).items.map((item) => item.id)).toEqual([run.id]);
  });

  it('lists: a candidate’s runs newest first as summaries, only its own, paged; q exactly an id, digest or result; issues in the ruleset’s order, paged, q exactly an id, rule, severity or kind; 404 for an unknown candidate or run', async () => {
    const p = await promptWorld();
    const candidate = await importCandidate(
      p.caseId,
      draft(p.prompt, { bodyText: `Please find attached.\nG1 [NEEDED: x]\n${SLOT}\n${SLOT}\n` }),
    );
    const first = await validate(candidate, p.prompt);
    t.clock.advance(1000);
    const second = await validate(candidate, p.prompt);
    // A later run of another candidate of the same case is never listed with this one.
    const other = await importCandidate(p.caseId, draft(p.prompt));
    t.clock.advance(1000);
    const otherRun = await validate(other, p.prompt);
    expect((await listRuns(candidate.id)).items.map((item) => item.id)).toEqual([
      second.run.id,
      first.run.id,
    ]);
    expect((await listRuns(other.id)).items.map((item) => item.id)).toEqual([otherRun.run.id]);
    expect((await listRuns(candidate.id, `?q=${otherRun.run.id}`)).items).toHaveLength(0);
    const pageOne = await listRuns(candidate.id, '?limit=1');
    expect(pageOne.items.map((item) => item.id)).toEqual([second.run.id]);
    expect(Object.keys(pageOne.items[0] ?? {}).sort()).toEqual(
      [
        'artifactSha256',
        'blockerCount',
        'candidateId',
        'caseId',
        'completedAt',
        'createdAt',
        'dependencyDigest',
        'id',
        'result',
        'reviewRequiredCount',
        'rulesetVersion',
        'startedAt',
        'warningCount',
      ].sort(),
    );
    const pageTwo = await listRuns(
      candidate.id,
      `?limit=1&cursor=${encodeURIComponent(pageOne.nextCursor ?? '')}`,
    );
    expect(pageTwo.items.map((item) => item.id)).toEqual([first.run.id]);
    expect(pageTwo.nextCursor).toBeNull();
    expect((await listRuns(candidate.id, `?q=${first.run.id}`)).items).toHaveLength(1);
    expect((await listRuns(candidate.id, '?q=BLOCKED')).items).toHaveLength(2);
    expect((await listRuns(candidate.id, '?q=blocked')).items).toHaveLength(0);
    expect((await listRuns(candidate.id, '?q=TECHNICAL_PASS')).items).toHaveLength(0);
    expect((await listRuns(candidate.id, `?q=${first.run.dependencyDigest}`)).items).toHaveLength(
      2,
    );
    const issues = await issuesOf(first.run.id);
    const order = REQUIRED_RULES.map((rule) => rule.id);
    expect(issues.map((issue) => order.indexOf(issue.ruleId))).toEqual(
      issues.map((issue) => order.indexOf(issue.ruleId)).sort((a, b) => a - b),
    );
    expect(ruleIds(issues)).toEqual([
      'SIGNATURE.PENDING_SLOT_ONCE',
      'WORDING.ATTACHMENT_CLAIM',
      'MARKER.INPUT_PLACEHOLDERS',
      'MARKER.GATE_LABELS',
    ]);
    const paged = await listIssues(first.run.id, '?limit=2');
    expect(paged.items.map((issue) => issue.id)).toEqual(issues.slice(0, 2).map((i) => i.id));
    expect((await listIssues(first.run.id, '?q=HEURISTIC')).items.map((i) => i.ruleId)).toEqual([
      'WORDING.ATTACHMENT_CLAIM',
      'MARKER.GATE_LABELS',
    ]);
    expect((await listIssues(first.run.id, '?q=BLOCKER')).items).toHaveLength(2);
    expect(
      (await listIssues(first.run.id, '?q=MARKER.GATE_LABELS')).items.map((i) => i.ruleId),
    ).toEqual(['MARKER.GATE_LABELS']);
    expect(
      outcome(
        await client.get('listValidationRuns', `/candidates/${randomUUID()}/validation-runs`),
      ),
    ).toEqual([404, 'NOT_FOUND']);
    expect(
      outcome(await client.get('listValidationIssues', `/validation-runs/${randomUUID()}/issues`)),
    ).toEqual([404, 'NOT_FOUND']);
    expect(
      outcome(
        await client.get(
          'listValidationRuns',
          `/candidates/${candidate.id}/validation-runs?cursor=forged`,
        ),
      ),
    ).toEqual([400, 'INVALID_CURSOR']);
  });

  it('the audit event records identifiers, digests, the ruleset, the result, counts and not-executed rule ids — never the subject, body, addresses or issue messages', async () => {
    const r = await replyWorld();
    const marker = 'SYNTHETIC-PRIVATE-MARKER';
    const candidate = await importCandidate(
      r.caseId,
      draft(r.replyPrompt, {
        subject: `${marker} subject`,
        bodyText: `${marker} Please find attached.\n${SLOT}\n`,
      }),
    );
    const { run } = await validate(candidate, r.replyPrompt);
    const events = await prisma.auditEvent.findMany({ where: { entityType: 'ValidationRun' } });
    expect(events.map((event) => [event.action, event.entityId])).toEqual([
      ['VALIDATION_RUN_RECORDED', run.id],
    ]);
    expect(events[0]?.afterRedacted).toEqual({
      candidateId: candidate.id,
      caseId: r.caseId,
      promptSnapshotId: r.replyPrompt.id,
      taskType: 'NMI_REPLY',
      generationMode: 'DRAFTING',
      artifactSha256: candidate.artifactSha256,
      dependencyDigest: run.dependencyDigest,
      rulesetVersion: 'TB-TECHNICAL-RULESET-v1',
      result: 'REVIEW_REQUIRED',
      issues: {
        total: run.blockerCount + run.reviewRequiredCount + run.warningCount,
        blocker: run.blockerCount,
        reviewRequired: run.reviewRequiredCount,
        warning: run.warningCount,
        info: 0,
      },
      rules: { required: 29, executed: 29, notExecuted: 0, notExecutedRuleIds: [] },
      semanticReviewRequired: true,
      dependencies: run.dependencyManifest.length,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      durationMs: 0,
    });
    const text = JSON.stringify(events);
    expect(text).not.toContain(marker);
    expect(text).not.toContain('@example.invalid');
    expect(text).not.toContain('Please find attached');
  });
});

describe('CONTAMINATION — nothing of one case appears in or stales another case’s validation', () => {
  it('two cases of one agency, owner and route: each run evaluates only its own case’s facts, sources, authority and correspondence; the same artifact in both cases shares no run; a change in A never stales B; a technical pass changes no fact and creates no assessment or readiness', async () => {
    const p = await validationWorld('A');
    const createdB = await createCase(p.w.agency.data.id, {
      routeId: p.w.route.data.id,
      intakeLabel: 'SYNTHETIC B intake',
    });
    const b = createdB.data.id;
    const selectionB = await select(b, choose(p.w, [p.a.coverage.data.id]));
    const itemB = await createItem(b, { displayTitle: 'SYNTHETIC-B-ONLY reported video' });
    const workB = await createWork(b, { title: 'SYNTHETIC-B-ONLY work' });
    await createMapping(b, {
      caseWorkId: workB.data.id,
      reportedItemId: itemB.data.id,
      basisSourceId: p.basis.id,
      provenance: 'OPERATOR_REPORTED',
    });
    const factB = await createFact(b);
    // A source scoped to case B only (linked to B) and a message bound to B only.
    const sourceB = await createSource({
      agencyId: p.w.agency.data.id,
      scopeBindings: { caseIds: [b] },
      title: 'SYNTHETIC-B-ONLY document',
    });
    const linkB = await linkSource(b, sourceB.id);
    const messageB = await capture(p.w.agency.data.id, { subject: 'SYNTHETIC-B-ONLY message' });
    const bindingB = await bind(b, { correspondenceId: messageB.id, eventType: 'NMI' });
    const promptB = await generate(b, { authoritySelectionId: selectionB.id });
    const candidateB = await importCandidate(b, draft(promptB));
    // The same draft in both cases: one artifact hash, two case-specific candidates — a run of
    // A's candidate is never B's.
    expect(candidateB.artifactSha256).toBe(p.candidate.artifactSha256);
    const earlyA = await validate(p.candidate, p.prompt);
    expect((await listRuns(candidateB.id)).items).toEqual([]);
    const readB = await context(b, scopeOf(promptB));
    // A change of case A only (its fact) leaves B's reviewed digest current.
    await reviseFact(p.caseId, p.fact.id);
    const kept = [
      'case_facts',
      'fact_sources',
      'cases',
      'case_sources',
      'notice_candidates',
      'prompt_snapshots',
      'correspondence_bindings',
    ];
    const recordsBefore = await suiteDump(kept);
    const runB = immutable<ValidationRun>(
      await validatePost(candidateB.id, expectations(candidateB, readB)),
      201,
    );
    // A technical pass changes no fact, case, link, candidate, prompt or binding and creates no
    // assessment or readiness (no readiness is stored anywhere; the run carries no such field).
    expect(runB.result).toBe('TECHNICAL_PASS');
    expect(await suiteDump(kept)).toEqual(recordsBefore);
    await expectNoLaterRecords();
    expect(
      Object.keys(runB).filter((key) => /ready|readiness|assessment|g[1-7]/i.test(key)),
    ).toEqual([]);
    expect(runB.caseId).toBe(b);
    expect(runB.evaluatedContextJson.caseId).toBe(b);
    const textB = JSON.stringify(runB);
    expect(textB).toContain(factB.id);
    expect(textB).toContain(sourceB.id);
    for (const id of [
      p.caseId,
      p.fact.id,
      p.work.data.id,
      p.item.data.id,
      p.selection.id,
      p.linked.id,
      p.caseSource.data.id,
    ]) {
      expect(textB, id).not.toContain(id);
    }
    const runA = await validate(p.candidate, p.prompt);
    expect(runA.run.evaluatedContextJson.caseId).toBe(p.caseId);
    const textA = JSON.stringify(runA.run);
    for (const id of [
      b,
      factB.id,
      sourceB.id,
      linkB.data.id,
      selectionB.id,
      messageB.id,
      bindingB.id,
      workB.data.id,
      itemB.data.id,
    ]) {
      expect(textA, id).not.toContain(id);
    }
    expect((await listRuns(candidateB.id)).items.map((item) => item.id)).toEqual([runB.id]);
    expect((await listRuns(p.candidate.id)).items.map((item) => item.id).sort()).toEqual(
      [earlyA.run.id, runA.run.id].sort(),
    );
    const issuesB = await issuesOf(runB.id);
    expect(issuesB.every((issue) => issue.runId === runB.id)).toBe(true);
    await expectNoLaterRecords();
  });
});

describe('P4G boundaries — no outbound call, no later phase, no mutation of a run', () => {
  it('a validation opens no outbound connection and calls no fetch — no AI provider, network or mail call exists', async () => {
    const p = await validationWorld();
    const connections: string[] = [];
    const original = net.Socket.prototype.connect;
    const connectSpy = vi.spyOn(net.Socket.prototype, 'connect').mockImplementation(function (
      this: net.Socket,
      ...args: unknown[]
    ) {
      connections.push(connectionTarget(args));
      return (original as (...values: unknown[]) => net.Socket).apply(this, args);
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('network disabled in this test'));
    let fetchCalls = -1;
    try {
      const candidate = await importCandidate(
        p.caseId,
        draft(p.prompt, {
          bodyText: `SYNTHETIC see https://drive.example.invalid/file/synthetic.\n${SLOT}\n`,
        }),
      );
      const { run } = await validate(candidate, p.prompt);
      await listRuns(candidate.id);
      await issuesOf(run.id);
    } finally {
      fetchCalls = fetchSpy.mock.calls.length;
      fetchSpy.mockRestore();
      connectSpy.mockRestore();
    }
    expect(fetchCalls).toBe(0);
    expect(
      connections.filter((target) => !/^(127\.0\.0\.1|localhost|::1):\d+$/.test(target)),
    ).toEqual([]);
  });

  it('no run is read, updated or deleted by id, and assessments, readiness, unsigned export, signing and sending stay unrouted; P4G writes no later-phase record', async () => {
    const p = await validationWorld();
    const { run } = await validate(p.candidate, p.prompt);
    const before = await suiteDump();
    const paths: Array<['GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT', string]> = [
      ['GET', `/validation-runs/${run.id}`],
      ['PATCH', `/validation-runs/${run.id}`],
      ['PUT', `/validation-runs/${run.id}`],
      ['DELETE', `/validation-runs/${run.id}`],
      ['POST', `/validation-runs/${run.id}/issues`],
      ['PATCH', `/candidates/${p.candidate.id}/validation-runs`],
      ['DELETE', `/candidates/${p.candidate.id}/validation-runs`],
      ['POST', `/candidates/${p.candidate.id}/assessments`],
      ['GET', `/candidates/${p.candidate.id}/assessments`],
      ['GET', `/candidates/${p.candidate.id}/readiness`],
      ['POST', `/candidates/${p.candidate.id}/unsigned-exports`],
      ['POST', `/candidates/${p.candidate.id}/approve`],
      ['POST', `/candidates/${p.candidate.id}/sign`],
      ['POST', `/candidates/${p.candidate.id}/send`],
      ['POST', `/cases/${p.caseId}/send`],
    ];
    for (const [method, target] of paths) {
      const response = await unrouted(method, target);
      expect([response.status, code(response)], `${method} ${target}`).toEqual([404, 'NOT_FOUND']);
    }
    expect(await suiteDump()).toEqual(before);
    await expectNoLaterRecords();
  });

  it('every collected response matches its operation: declared status, contract schema, no ETag on a run, no readiness or approval vocabulary as a key; the three validation operations were exercised', () => {
    const byId = new Map<string, (typeof operations)[number]>(
      operations.map((operation) => [operation.operationId, operation]),
    );
    const seen = new Set<string>();
    // Verdict keys only, outside the recorded context (the evaluated context and its manifest are
    // recorded data: a version's signedDatesRaw or a party's legalSubjectId are not verdicts).
    const forbiddenKey =
      /"(g[1-7]\w*|ready\w*|eligib\w*|authori[sz]ed\w*|infring\w*|verified\w*|approved\w*|isCurrent\w*|currentAuthority\w*|valid|validated|isValid\w*|signed\w*|adopted\w*|sent\w*|legal(?:ly)?(?:Valid|Approved|Sufficient)\w*)"\s*:/i;
    const withoutRecordedContext = (text: string) =>
      JSON.stringify(text === '' ? null : JSON.parse(text), (key, value: unknown) =>
        key === 'evaluatedContextJson' || key === 'dependencyManifest' ? undefined : value,
      );
    const validationOperations = [
      'validateCandidate',
      'listValidationRuns',
      'listValidationIssues',
    ];
    for (const { operationId, result } of collected) {
      const operation = byId.get(operationId);
      if (!operation) throw new Error(`unknown operation ${operationId}`);
      const label = `${operationId} ${result.status}`;
      if (result.status === Number(operation.success.status)) {
        seen.add(operationId);
        if ('schema' in operation.success) {
          const parsed = operation.success.schema.safeParse(result.json);
          expect(parsed.success, `${label} ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
        } else {
          expect(result.text, label).toBe('');
        }
        const data = (result.json as { data?: { rowVersion?: unknown } } | null)?.data;
        if (typeof data?.rowVersion === 'number') {
          expect(result.headers['etag'], label).toMatch(/^"[A-Za-z]+:[0-9a-f-]{36}:v\d+"$/);
        } else {
          expect(result.headers['etag'], label).toBeUndefined();
        }
        if (validationOperations.includes(operationId)) {
          expect(withoutRecordedContext(result.text), label).not.toMatch(forbiddenKey);
          expect(result.text, label).not.toMatch(/READY_FOR_SIGNER"|G[1-7]_PASS|"PASS"/);
        }
      } else {
        expect(operation.errors as readonly string[], label).toContain(String(result.status));
        expect(OperationErrorSchema.safeParse(result.json).success, label).toBe(true);
      }
      expect(result.headers['cache-control'], label).toBe('no-store');
    }
    for (const operationId of validationOperations) {
      expect(seen.has(operationId), operationId).toBe(true);
    }
    expect(CONTRACT_BASELINE).toBe('TB-SCHEMA-API-v1.2.0');
  });
});

/** `host:port` (or `unix:path`) of a Socket.connect call, whatever argument form it used. */
function connectionTarget(args: unknown[]): string {
  let first: unknown = args[0];
  if (Array.isArray(first)) first = first[0];
  if (typeof first === 'object' && first !== null) {
    const options = first as { host?: string; port?: number | string; path?: string };
    if (options.path) return `unix:${options.path}`;
    return `${options.host ?? 'localhost'}:${String(options.port)}`;
  }
  if (typeof first === 'number' || (typeof first === 'string' && /^\d+$/.test(first))) {
    return `${typeof args[1] === 'string' ? args[1] : 'localhost'}:${String(first)}`;
  }
  return typeof first === 'string' ? `unix:${first}` : 'unknown';
}
