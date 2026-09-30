// P4H — candidate assessments over real HTTP against tb_notice_test (yarn test:db).
//
// Each test boots the real AppModule + configureApp pipeline on an ephemeral loopback port with a
// synthetic signed-in application User, a controllable clock and an assessment observer the
// consistency tests use. Every response is recorded and checked against the active contract
// (TB-SCHEMA-API-v1.4.0) at the end. All data is synthetic (example.invalid addresses only); every
// test deletes what it created.
//
// A CandidateAssessment records one attributable G1–G6 review of one exact candidate artifact at one
// evaluation epoch E = (candidateId, artifactSha256, dependencyDigest, rulesetVersion) (ADR-0008,
// accepted by the operator for implementation with the independent review deferred). The capture
// binds the server's epoch: the path candidate, its stored artifact (412 ARTIFACT_CHANGED), the
// current digest of its prompt's scope (412 CONTEXT_CHANGED, never substituted), the ruleset the
// server runs now (422) and a recorded run of exactly E (422 VALIDATION_RUN_REQUIRED; the run need
// not pass). Supports are LINKED case sources of this case; a PASS rests only on sources that apply
// now (D-3). An AI-assisted performer never records DOCUMENT_REVIEWED (D-4). Recording is not
// counting: nothing here is readiness, READY_FOR_SIGNER, G7, a signature or permission to send, and
// a capture never changes a run, issue, candidate, prompt, source, link or case record.
//
// getCandidateAssessmentSources (TB-SCHEMA-API-v1.4.0, ADR-0009) reads back exactly the stored
// support rows of one assessment of the path candidate — historical, never resolved from present
// state; 404 alike for an unknown or another candidate's assessment; 500 for rows that break the
// invariants, never a partial answer.
import { createHash, randomUUID } from 'node:crypto';
import net from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../apps/api/generated/prisma/client.js';
import type {
  Agency,
  AuthorityEvent,
  CandidateAssessment,
  CandidateAssessmentSourcesView,
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
} from '../../packages/contracts/src/index.js';
import {
  CONTRACT_BASELINE,
  OperationErrorSchema,
  operations,
  PFC_SCHEMA_VERSION,
} from '../../packages/contracts/src/index.js';
import { renderPrompt } from '../../apps/api/src/modules/prompts/prompt-renderer.js';
import { promptSourceManifest } from '../../apps/api/src/modules/prompts/prompt-snapshot-rules.js';
import { PROMPT_TEMPLATE_VERSION } from '../../apps/api/src/modules/prompts/prompt-template.js';
import { REQUIRED_RULES } from '../../apps/api/src/modules/validation/technical-ruleset.js';
import { validationScope } from '../../apps/api/src/modules/validation/validation-scope.js';
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
import { currentV2Digest } from '../support/context-digest-oracles.js';

let prisma: PrismaClient;
let t: TestApp;
let client: DirectoryClient;
const collected: Recorded[] = [];

type Hook = (caseId: string) => Promise<void>;

/** The consistency tests' hooks: each runs once, inside a capture's transaction. */
const assessmentObserver = {
  hooks: {
    afterCaseLock: null as Hook | null,
    beforeInsert: null as Hook | null,
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
};

const auditWriter = new FailingAuditWriter();

beforeAll(async () => {
  ({ prisma } = openTestPrisma());
  await assertSuiteTablesEmpty(prisma);
});

beforeEach(async () => {
  assessmentObserver.hooks.afterCaseLock = null;
  assessmentObserver.hooks.beforeInsert = null;
  auditWriter.armed = false;
  t = await startTestApp(prisma, { assessmentObserver, auditWriter });
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

interface Versioned<T> {
  readonly data: T;
  readonly etag: string;
}

const errorBody = (result: HttpResult) =>
  (
    result.json as
      { error?: { code: string; message: string; details: Record<string, unknown> } } | undefined
  )?.error;
const code = (result: HttpResult) => errorBody(result)?.code ?? `(no error: HTTP ${result.status})`;
const outcome = (result: HttpResult) => [result.status, code(result)];
const detailsOf = (result: HttpResult) => errorBody(result)?.details ?? {};
/** An error body without its per-request id: equal bodies are indistinguishable refusals. */
const refusal = (result: HttpResult) => {
  const error = errorBody(result);
  return [result.status, error?.code, error?.message, error?.details];
};
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
  tables: readonly string[] = DIRECTORY_SUITE_TABLES,
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

/** The tables an assessment capture must never change (everything but its own rows). */
const UNTOUCHED_TABLES = DIRECTORY_SUITE_TABLES.filter(
  (table) =>
    ![
      'candidate_assessments',
      'assessment_sources',
      'audit_events',
      'idempotency_records',
    ].includes(table),
);

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
const coverageBody = (routeId: string, basisSourceId: string, label: string) => ({
  routeId,
  basisSourceId,
  actionScope: ['PREPARE_NOTICE'],
  coverageLabel: `SYNTHETIC ${label} coverage`,
});
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
  const coverage = await createCoverage(
    version.data.id,
    coverageBody(w.route.data.id, basis.id, label),
  );
  await addCoverageSigner(coverage.data.id, { signerId: w.signer.data.id, sourceId: basis.id });
  await freeze(version.data.id);
  return {
    mandate: await getMandate(mandate.data.id),
    version: await getVersion(version.data.id),
    coverage: await getCoverage(coverage.data.id),
    basis,
  };
}

/**
 * Another owner of the agency, its route and a DRAFT mandate version whose coverage cites
 * `sourceId` as its basis — valid records of another owner that make the source that owner's
 * material (R14-AUD-010), touching nothing of the case.
 */
async function otherOwnerUses(w: World, sourceId: string, label = 'B-other') {
  const owner = await createOwner(label);
  const subject = await createSubject(label);
  const association = await link(owner.data.id, subject.data.id);
  const route = await createRoute({
    agencyId: w.agency.data.id,
    ownerSubjectId: association.data.id,
  });
  const mandate = await createMandate(w.agency.data.id, `SYNTHETIC ${label} mandate`);
  const version = await createVersion(mandate.data.id, {
    primarySourceId: w.source.id,
    documentState: 'SIGNED_APPEARING',
  });
  return {
    owner,
    route,
    mandate,
    version,
    coverage: () => coverageBody(route.data.id, sourceId, label),
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
async function linkSource(caseId: string, sourceId: string, useRole = 'SYNTHETIC_SUPPORT') {
  const current = await getCase(caseId);
  return versioned<CaseSource>(
    await client.write(
      'linkCaseSource',
      'POST',
      `/cases/${caseId}/sources`,
      { sourceId, useRole, scopeNote: 'SYNTHETIC scope note' },
      { ifMatch: current.etag },
    ),
    201,
  );
}
const getCaseSource = async (id: string) =>
  versioned<CaseSource>(await client.get('getCaseSource', `/case-sources/${id}`), 200);
async function setLinkState(id: string, state: 'LINKED' | 'PAUSED' | 'UNLINKED') {
  const current = await getCaseSource(id);
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
const createMapping = async (caseId: string, body: Record<string, unknown>) =>
  versioned<UseMapping>(
    await caseCreate('createUseMapping', caseId, 'mappings', { occurrence: 1, ...body }),
    201,
  );
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
async function reviseFact(caseId: string, id: string, assertion = 'SYNTHETIC revised assertion') {
  const current = await getCase(caseId);
  return immutable<CaseFact>(
    await client.write(
      'reviseCaseFact',
      'POST',
      `/cases/${caseId}/facts/${id}/revisions`,
      { ...FACT, value: { ...FACT.value, assertion }, changeReason: 'SYNTHETIC revision' },
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
const readPrompt = async (id: string) =>
  immutable<PromptSnapshot>(await client.get('getPrompt', `/prompts/${id}`), 200);

/** The context scope of a prompt snapshot (its prior bindings from its frozen manifest). */
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
 * route with an explicit selection, one reported item, one work, one mapping, a fact and two linked
 * case sources — and one INITIAL prompt generated against that selection.
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
  const linked2 = await createSource({
    agencyId: w.agency.data.id,
    title: `SYNTHETIC ${label} registration extract`,
  });
  const caseSource2 = await linkSource(caseId, linked2.id, 'SYNTHETIC_REGISTRATION');
  const prompt = await generate(caseId, { authoritySelectionId: selection.id, generationMode });
  return {
    w,
    a,
    caseId,
    selection,
    item,
    work,
    basis,
    mapping,
    fact,
    linked,
    caseSource,
    linked2,
    caseSource2,
    prompt,
  };
}

/**
 * The reply world: a prompt world plus a captured NMI bound to the case, a prior transmission
 * recorded as sent, and one NMI_REPLY DRAFTING prompt with that parent and prior.
 */
async function replyWorld(label = 'A') {
  const p = await promptWorld(label);
  const agencyId = p.w.agency.data.id;
  const nmiMessage = await capture(agencyId, {
    subject: 'SYNTHETIC we need more information',
    bodyText: 'SYNTHETIC Question 1: please provide the licence.',
    fromAddress: 'synthetic-platform-review@example.invalid',
    replyToAddress: 'synthetic-reply-here@example.invalid',
  });
  const nmi = await bind(p.caseId, { correspondenceId: nmiMessage.id, eventType: 'NMI' });
  const otherMessage = await capture(agencyId, {
    subject: 'SYNTHETIC another platform message',
    bodyText: 'SYNTHETIC Question 7: another message.',
  });
  const other = await bind(p.caseId, { correspondenceId: otherMessage.id, eventType: 'NMI' });
  const sentMessage = await capture(agencyId, {
    direction: 'OUTBOUND',
    subject: 'SYNTHETIC copyright notice',
    captureMode: 'OPERATOR_REPORTED',
    bodyRole: 'UNKNOWN',
    bodyText: null,
    limitations: 'SYNTHETIC reported by the operator; no raw message kept',
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
  return { ...p, nmiMessage, nmi, other, sentMessage, sent, replyPrompt };
}

// candidates (P4F) and validation (P4G) ---------------------------------------------------------

const SLOT = '[PENDING AUTHORIZED SIGNER — FULL LEGAL NAME REQUIRED]';
/** A draft with nothing a technical rule reports: exact text with CRLF, NFD and one slot. */
const CLEAN_BODY =
  'SYNTHETIC notice text for human review.\r\nThe recorded work appears in the reported video (café, café).\n\nSincerely,\n' +
  `${SLOT}\n`;

/** The import body of a draft from `prompt` (sender = the selected mailbox, its parent if any). */
function draft(
  prompt: PromptSnapshot,
  fields: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    promptSnapshotId: prompt.id,
    subject: 'SYNTHETIC notice subject',
    envelope: {
      from: SENDER,
      to: prompt.parentBindingId === null ? PLATFORM : 'synthetic-reply-here@example.invalid',
      ...(prompt.parentBindingId === null ? {} : { parentBindingId: prompt.parentBindingId }),
    },
    bodyText: CLEAN_BODY,
    preparedDocuments: [],
    ...fields,
  };
}
async function importCandidate(caseId: string, body: Record<string, unknown>) {
  return immutable<NoticeCandidate>(
    await client.write('importCandidate', 'POST', `/cases/${caseId}/candidates`, body),
    201,
  );
}
async function supersedeCandidate(id: string) {
  return immutable<NoticeCandidate>(
    await client.write('supersedeCandidate', 'POST', `/candidates/${id}/supersede`, {
      reason: 'SYNTHETIC replaced by a corrected draft',
    }),
    200,
  );
}
const validatePost = (candidateId: string, body: unknown, key?: string | null) =>
  client.write(
    'validateCandidate',
    'POST',
    `/candidates/${candidateId}/validation-runs`,
    body,
    key === undefined ? {} : { key },
  );
/** Reads the current context of the candidate's prompt scope and validates against exactly it. */
async function validate(
  candidate: NoticeCandidate,
  prompt: PromptSnapshot,
): Promise<{ run: ValidationRun; view: ContextView }> {
  const view = await context(candidate.caseId, scopeOf(prompt));
  const run = immutable<ValidationRun>(
    await validatePost(candidate.id, {
      expectedArtifactSha256: candidate.artifactSha256,
      expectedDependencyDigest: view.dependencyDigest,
    }),
    201,
  );
  return { run, view };
}
async function issuesOf(runId: string): Promise<ValidationIssue[]> {
  const result = await client.get(
    'listValidationIssues',
    `/validation-runs/${runId}/issues?limit=100`,
  );
  expect(result.status, result.text).toBe(200);
  return dataOf<{ items: ValidationIssue[] }>(result).items;
}

// assessments (P4H) -----------------------------------------------------------------------------

const RULESET = 'TB-TECHNICAL-RULESET-v4';
const ALL_RULES = REQUIRED_RULES.map((rule) => rule.id);

const support = (
  caseSourceId: string,
  supportedConclusion = 'SYNTHETIC conclusion recorded for this link',
) => ({ caseSourceId, supportedConclusion });

/** The capture body of a review of `candidate` against `view`: every substantive field explicit. */
function review(
  candidate: NoticeCandidate,
  view: ContextView,
  fields: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    gate: 'G1',
    result: 'HOLD',
    expectedArtifactSha256: candidate.artifactSha256,
    expectedDependencyDigest: view.dependencyDigest,
    rulesetVersion: RULESET,
    scopeState: 'RECORDED_NOT_ADOPTED',
    performerKind: 'HUMAN',
    performerLabel: 'SYNTHETIC Reviewer One',
    provenance: 'OPERATOR_REPORTED',
    rationale: 'SYNTHETIC rationale as entered by the reviewer',
    scopeText: 'SYNTHETIC scope of this review',
    sources: [],
    ...fields,
  };
}
const capturePost = (candidateId: string, body: unknown, key?: string | null) =>
  client.write(
    'captureCandidateAssessment',
    'POST',
    `/candidates/${candidateId}/assessments`,
    body,
    key === undefined ? {} : { key },
  );
async function assess(candidateId: string, body: unknown, key?: string) {
  return immutable<CandidateAssessment>(await capturePost(candidateId, body, key), 201);
}
async function listAssessments(candidateId: string, query = '') {
  const result = await client.get(
    'listCandidateAssessments',
    `/candidates/${candidateId}/assessments${query}`,
  );
  expect(result.status, result.text).toBe(200);
  expect(result.headers['etag']).toBeUndefined();
  return dataOf<{ items: CandidateAssessment[]; nextCursor: string | null }>(result);
}
const sourcesPath = (candidateId: string, id: string) =>
  `/candidates/${candidateId}/assessments/${id}/sources`;
const readSupports = (candidateId: string, id: string) =>
  client.get('getCandidateAssessmentSources', sourcesPath(candidateId, id));
async function supportsOf(candidateId: string, id: string) {
  return immutable<CandidateAssessmentSourcesView>(await readSupports(candidateId, id), 200);
}

/** A prompt world with a clean candidate of its DRAFTING prompt and one run at the current epoch. */
async function assessmentWorld(label = 'A') {
  const p = await promptWorld(label);
  const candidate = await importCandidate(p.caseId, draft(p.prompt));
  const { run, view } = await validate(candidate, p.prompt);
  return { ...p, candidate, run, view };
}
type AssessmentWorld = Awaited<ReturnType<typeof assessmentWorld>>;

/** The records a capture must leave byte-identical: every table but its own, raw. */
const untouched = () => suiteDump(UNTOUCHED_TABLES);

/** The stored rows of a candidate's assessments and their supports, every column, raw. */
async function assessmentRows(candidateId: string) {
  const assessments = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT * FROM candidate_assessments WHERE candidate_id = ${candidateId} ORDER BY id`;
  const supports = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT s.* FROM assessment_sources s JOIN candidate_assessments a ON a.id = s.assessment_id
    WHERE a.candidate_id = ${candidateId} ORDER BY s.id`;
  return { assessments, supports };
}

/** The expected wire view of a capture: exactly the body's values, the server's epoch and times. */
function expectedAssessment(
  p: Pick<AssessmentWorld, 'caseId'> & { candidate: NoticeCandidate },
  view: ContextView,
  body: Record<string, unknown>,
  id: string,
) {
  return {
    id,
    candidateId: p.candidate.id,
    caseId: p.caseId,
    gate: body['gate'],
    result: body['result'],
    artifactSha256: p.candidate.artifactSha256,
    dependencyDigest: view.dependencyDigest,
    rulesetVersion: RULESET,
    scopeState: body['scopeState'],
    performerKind: body['performerKind'],
    performerLabel: body['performerLabel'],
    assessedAt:
      typeof body['assessedAt'] === 'string' ? new Date(body['assessedAt']).toISOString() : null,
    provenance: body['provenance'],
    rationale: body['rationale'],
    scopeText: body['scopeText'],
    limitations: body['limitations'] ?? null,
    askDispositions: body['askDispositions'] ?? null,
    supersedesAssessmentId: body['supersedesAssessmentId'] ?? null,
    createdAt: new Date(t.clock.ms).toISOString(),
    createdById: client.session.userId,
  };
}

// ---------------------------------------------------------------------------------------------

describe('P4H captureCandidateAssessment — one attributable G1–G6 review of one exact candidate at the current evaluation epoch', () => {
  it('a G1 PASS and a G2 HOLD of a TECHNICAL_PASS candidate: every field stored and returned exactly, bound to the epoch the server derived (the candidate, its stored artifact, the current digest, the current ruleset v3), supports read back in request order; no case, candidate, run, issue, prompt, source or link row changes (AUD-005-K)', async () => {
    const p = await assessmentWorld();
    expect(p.run.result).toBe('TECHNICAL_PASS');
    expect([p.run.rulesetVersion, p.run.dependencyDigest]).toEqual([
      RULESET,
      p.view.dependencyDigest,
    ]);
    const before = await untouched();
    const caseBefore = await getCase(p.caseId);
    const g1Body = review(p.candidate, p.view, {
      gate: 'G1',
      result: 'PASS',
      scopeState: 'SCOPE_CONFIRMED_FOR_CANDIDATE',
      provenance: 'DOCUMENT_REVIEWED',
      assessedAt: '2026-09-22T08:07:06.005Z',
      limitations: 'SYNTHETIC limitation as entered',
      sources: [
        support(p.caseSource2.data.id, 'SYNTHETIC first conclusion'),
        support(p.caseSource.data.id, 'SYNTHETIC second conclusion'),
      ],
    });
    const created = await capturePost(p.candidate.id, g1Body);
    const g1 = immutable<CandidateAssessment>(created, 201);
    expect(g1).toEqual(expectedAssessment(p, p.view, g1Body, g1.id));
    // The capture names the assessment only; its supports are read back with the v1.4.0 read.
    expect(
      (created.json as { meta: { affectedResources: unknown } }).meta.affectedResources,
    ).toEqual([{ type: 'CandidateAssessment', id: g1.id, rowVersion: null }]);
    const g2Body = review(p.candidate, p.view, {
      gate: 'G2',
      result: 'HOLD',
      sources: [support(p.caseSource.data.id, 'SYNTHETIC rights documents incomplete')],
    });
    const g2 = await assess(p.candidate.id, g2Body);
    expect(g2).toEqual(expectedAssessment(p, p.view, g2Body, g2.id));
    expect([g2.assessedAt, g2.limitations, g2.askDispositions]).toEqual([null, null, null]);
    expect(await supportsOf(p.candidate.id, g1.id)).toEqual({
      assessmentId: g1.id,
      sources: [
        {
          id: expect.any(String),
          assessmentId: g1.id,
          caseSourceId: p.caseSource2.data.id,
          supportedConclusion: 'SYNTHETIC first conclusion',
          createdAt: g1.createdAt,
          createdById: client.session.userId,
        },
        {
          id: expect.any(String),
          assessmentId: g1.id,
          caseSourceId: p.caseSource.data.id,
          supportedConclusion: 'SYNTHETIC second conclusion',
          createdAt: g1.createdAt,
          createdById: client.session.userId,
        },
      ],
    });
    // Nothing else changed: the case (its row version and context revision), the candidate, the
    // run and its issues, the prompt, the sources and the links are byte-identical.
    expect(await untouched()).toEqual(before);
    const caseAfter = await getCase(p.caseId);
    expect([caseAfter.data.rowVersion, caseAfter.data.contextRevision]).toEqual([
      caseBefore.data.rowVersion,
      caseBefore.data.contextRevision,
    ]);
    const { assessments, supports } = await assessmentRows(p.candidate.id);
    expect([assessments.length, supports.length]).toEqual([2, 3]);
    // Listed exactly as returned, newest first (equal instants: the id order).
    expect(
      (await listAssessments(p.candidate.id)).items.sort((x, y) => (x.id < y.id ? -1 : 1)),
    ).toEqual([g1, g2].sort((x, y) => (x.id < y.id ? -1 : 1)));
  });

  it('request rules: the contract body only (422: no substantive default, no unknown field, 1–100 supports, conclusions ≤ 8,000), a repeated case source 422 before any write, an Idempotency-Key (400), no If-Match; D-4 AI_ASSISTED DOCUMENT_REVIEWED 422 REVIEW_UNSUPPORTED; an unknown or malformed candidate 404; nothing is written for any refusal', async () => {
    const p = await assessmentWorld();
    const base = review(p.candidate, p.view, { sources: [support(p.caseSource.data.id)] });
    const before = await suiteDump();
    for (const key of [
      'gate',
      'result',
      'scopeState',
      'performerKind',
      'performerLabel',
      'provenance',
      'rationale',
      'scopeText',
      'sources',
      'rulesetVersion',
      'expectedArtifactSha256',
      'expectedDependencyDigest',
    ]) {
      const { [key]: _omitted, ...rest } = base;
      expect(outcome(await capturePost(p.candidate.id, rest)), key).toEqual([
        422,
        'VALIDATION_FAILED',
      ]);
    }
    const hundredOne = Array.from({ length: 101 }, () => support(randomUUID()));
    for (const [label, body] of [
      ['G7', { ...base, gate: 'G7' }],
      ['UNASSESSED result', { ...base, result: 'UNASSESSED' }],
      ['readiness field', { ...base, readiness: 'READY_FOR_SIGNER' }],
      ['waiver field', { ...base, waivedRuleIds: ['PLAN.SOURCE_IN_CONTEXT'] }],
      ['no supports', { ...base, sources: [] }],
      ['101 supports', { ...base, sources: hundredOne }],
      [
        '8,001 code points',
        { ...base, sources: [support(p.caseSource.data.id, 'x'.repeat(8001))] },
      ],
      ['empty conclusion', { ...base, sources: [support(p.caseSource.data.id, '')] }],
    ] as const) {
      expect(outcome(await capturePost(p.candidate.id, body)), label).toEqual([
        422,
        'VALIDATION_FAILED',
      ]);
    }
    const repeated = await capturePost(p.candidate.id, {
      ...base,
      sources: [support(p.caseSource.data.id), support(p.caseSource.data.id, 'SYNTHETIC again')],
    });
    expect(outcome(repeated)).toEqual([422, 'VALIDATION_FAILED']);
    expect(JSON.stringify(detailsOf(repeated))).toContain('"path":"sources.1.caseSourceId"');
    const nul = await capturePost(p.candidate.id, { ...base, rationale: 'SYNTHETIC\u0000' });
    expect(outcome(nul)).toEqual([422, 'VALIDATION_FAILED']);
    const ai = await capturePost(p.candidate.id, {
      ...base,
      performerKind: 'AI_ASSISTED',
      provenance: 'DOCUMENT_REVIEWED',
    });
    expect(outcome(ai)).toEqual([422, 'REVIEW_UNSUPPORTED']);
    expect(detailsOf(ai)).toEqual({ field: 'provenance', reason: 'AI_ASSISTED_PERFORMER' });
    expect(errorBody(ai)?.message).toContain(
      'DOCUMENT_REVIEWED requires an actual human document review',
    );
    expect(outcome(await capturePost(p.candidate.id, base, null))).toEqual([
      400,
      'IDEMPOTENCY_KEY_REQUIRED',
    ]);
    expect(outcome(await capturePost(randomUUID(), base))).toEqual([404, 'NOT_FOUND']);
    expect(outcome(await capturePost('not-a-uuid', base))).toEqual([404, 'NOT_FOUND']);
    expect(await suiteDump()).toEqual(before);

    // A HUMAN reviewer, or a documented external review the operator reports, may record
    // DOCUMENT_REVIEWED as the explicit statement of an actual review; an AI-assisted review may
    // record its analysis. No If-Match is needed; each is stored exactly as supplied.
    const human = await assess(p.candidate.id, { ...base, provenance: 'DOCUMENT_REVIEWED' });
    const external = await assess(p.candidate.id, {
      ...base,
      gate: 'G2',
      performerKind: 'DOCUMENTED_EXTERNAL_REVIEW',
      performerLabel: 'SYNTHETIC external review (operator report of a documented review)',
      provenance: 'DOCUMENT_REVIEWED',
    });
    const analysis = await assess(p.candidate.id, {
      ...base,
      gate: 'G3',
      performerKind: 'AI_ASSISTED',
      performerLabel: 'SYNTHETIC drafting assistant chosen by the operator',
      provenance: 'ANALYSIS',
    });
    expect(
      [human, external, analysis].map((entry) => [
        entry.gate,
        entry.performerKind,
        entry.provenance,
      ]),
    ).toEqual([
      ['G1', 'HUMAN', 'DOCUMENT_REVIEWED'],
      ['G2', 'DOCUMENTED_EXTERNAL_REVIEW', 'DOCUMENT_REVIEWED'],
      ['G3', 'AI_ASSISTED', 'ANALYSIS'],
    ]);
  });

  it('AUD-005-I capture binding: a wrong artifact is 412 ARTIFACT_CHANGED; a stale or unknown digest 412 CONTEXT_CHANGED (never substituted); a ruleset that is not current 422 RULESET_NOT_CURRENT; no run of exactly E 422 VALIDATION_RUN_REQUIRED; nothing is written and the key is released', async () => {
    const p = await assessmentWorld();
    const body = review(p.candidate, p.view, { sources: [support(p.caseSource.data.id)] });
    const key = newKey();
    const before = await suiteDump();
    const wrongArtifact = await capturePost(
      p.candidate.id,
      { ...body, expectedArtifactSha256: 'f'.repeat(64) },
      key,
    );
    expect(outcome(wrongArtifact)).toEqual([412, 'ARTIFACT_CHANGED']);
    expect(detailsOf(wrongArtifact)).toEqual({ field: 'expectedArtifactSha256' });
    const unknownDigest = await capturePost(
      p.candidate.id,
      { ...body, expectedDependencyDigest: 'c'.repeat(64) },
      key,
    );
    expect(outcome(unknownDigest)).toEqual([412, 'CONTEXT_CHANGED']);
    expect(detailsOf(unknownDigest)).toEqual({ field: 'expectedDependencyDigest' });
    for (const rulesetVersion of [
      'TB-TECHNICAL-RULESET-v1',
      'TB-TECHNICAL-RULESET-v2',
      'SYNTHETIC ruleset',
    ]) {
      const refused = await capturePost(p.candidate.id, { ...body, rulesetVersion }, key);
      expect(outcome(refused), rulesetVersion).toEqual([422, 'RULESET_NOT_CURRENT']);
      expect(detailsOf(refused), rulesetVersion).toEqual({
        field: 'rulesetVersion',
        currentRulesetVersion: RULESET,
      });
    }
    expect(await suiteDump()).toEqual(before);

    // A context change: the reviewed digest is stale (412), and the current epoch E2 has no run.
    await reviseFact(p.caseId, p.fact.id);
    const stale = await capturePost(p.candidate.id, body, key);
    expect(outcome(stale)).toEqual([412, 'CONTEXT_CHANGED']);
    const e2 = await context(p.caseId, scopeOf(p.prompt));
    expect(e2.dependencyDigest).not.toBe(p.view.dependencyDigest);
    const atE2 = { ...body, expectedDependencyDigest: e2.dependencyDigest };
    const noRun = await capturePost(p.candidate.id, atE2, key);
    expect(outcome(noRun)).toEqual([422, 'VALIDATION_RUN_REQUIRED']);
    expect(detailsOf(noRun)).toEqual({
      epoch: {
        artifactSha256: p.candidate.artifactSha256,
        dependencyDigest: e2.dependencyDigest,
        rulesetVersion: RULESET,
      },
    });
    expect(await countRows(prisma, 'candidate_assessments')).toBe(0);
    expect(await prisma.idempotencyRecord.count({ where: { idempotencyKey: key } })).toBe(0);

    // A run at E2 (REVIEW_REQUIRED: the prompt drifted) is the epoch's run; the same key succeeds.
    const { run: runE2 } = await validate(p.candidate, p.prompt);
    expect([runE2.result, runE2.dependencyDigest]).toEqual([
      'REVIEW_REQUIRED',
      e2.dependencyDigest,
    ]);
    const recorded = await assess(p.candidate.id, atE2, key);
    expect([recorded.dependencyDigest, recorded.rulesetVersion]).toEqual([
      e2.dependencyDigest,
      RULESET,
    ]);
  });

  it('TECHNICAL_PASS is not required: candidates whose runs are BLOCKED or REVIEW_REQUIRED are assessed at their epochs, and a capture never changes a run or its issues (AUD-005-K)', async () => {
    const p = await promptWorld();
    const blocked = await importCandidate(
      p.caseId,
      draft(p.prompt, { bodyText: `SYNTHETIC two slots.\n${SLOT}\n${SLOT}\n` }),
    );
    const wording = await importCandidate(
      p.caseId,
      draft(p.prompt, {
        bodyText: `SYNTHETIC the licence is attached to this notice.\n${SLOT}\n`,
      }),
    );
    const { run: blockedRun, view } = await validate(blocked, p.prompt);
    const { run: wordingRun } = await validate(wording, p.prompt);
    expect([blockedRun.result, wordingRun.result]).toEqual(['BLOCKED', 'REVIEW_REQUIRED']);
    const runs = async () => ({
      runs: await prisma.$queryRaw`SELECT * FROM validation_runs ORDER BY id`,
      issues: await prisma.$queryRaw`SELECT * FROM validation_issues ORDER BY id`,
    });
    const before = await runs();
    const onBlocked = await assess(
      blocked.id,
      review(blocked, view, {
        gate: 'G6',
        result: 'BLOCKED',
        provenance: 'ANALYSIS',
        rationale: 'SYNTHETIC the draft carries the pending slot twice',
        sources: [support(p.caseSource.data.id)],
      }),
    );
    const onWording = await assess(
      wording.id,
      review(wording, view, {
        gate: 'G3',
        result: 'PASS',
        sources: [support(p.caseSource.data.id)],
      }),
    );
    expect([onBlocked.result, onWording.result]).toEqual(['BLOCKED', 'PASS']);
    expect(await runs()).toEqual(before);
    // Each run keeps exactly its recorded result and coverage (read back by id).
    for (const run of [blockedRun, wordingRun]) {
      expect(
        immutable<ValidationRun>(
          await client.get('getValidationRun', `/validation-runs/${run.id}`),
          200,
        ),
      ).toEqual(run);
    }
    expect(blockedRun.coverageManifest.executedRuleIds).toEqual(ALL_RULES);
  });

  it('AUD-005-J truthful negatives: HOLD, BLOCKED, MISSING and CONFLICT are recorded on the epoch and read back exactly; a MISSING review cites the material actually checked (a support-less assessment does not exist)', async () => {
    const p = await assessmentWorld();
    const cases = [
      ['G2', 'HOLD', 'OPERATOR_REPORTED'],
      ['G3', 'BLOCKED', 'ANALYSIS'],
      ['G4', 'MISSING', 'MISSING'],
      ['G5', 'CONFLICT', 'CONFLICT'],
    ] as const;
    const recorded: CandidateAssessment[] = [];
    for (const [gate, result, provenance] of cases) {
      t.clock.advance(1000);
      const body = review(p.candidate, p.view, {
        gate,
        result,
        provenance,
        rationale: `SYNTHETIC ${result} recorded truthfully`,
        sources: [
          support(p.caseSource.data.id, `SYNTHETIC ${result}: the material checked for ${gate}`),
        ],
      });
      const assessment = await assess(p.candidate.id, body);
      expect(assessment).toEqual(expectedAssessment(p, p.view, body, assessment.id));
      recorded.push(assessment);
    }
    expect((await listAssessments(p.candidate.id)).items).toEqual([...recorded].reverse());
    for (const assessment of recorded) {
      const read = await supportsOf(p.candidate.id, assessment.id);
      expect(read.sources.map((row) => [row.caseSourceId, row.supportedConclusion])).toEqual([
        [
          p.caseSource.data.id,
          `SYNTHETIC ${assessment.result}: the material checked for ${assessment.gate}`,
        ],
      ]);
    }
    // No PASS was created from a negative, and nothing was derived from the records.
    expect(recorded.map((entry) => entry.result)).not.toContain('PASS');
    expect(
      outcome(
        await capturePost(
          p.candidate.id,
          review(p.candidate, p.view, { gate: 'G4', result: 'MISSING', sources: [] }),
        ),
      ),
    ).toEqual([422, 'VALIDATION_FAILED']);
  });

  it('D-3: a PASS rests only on sources that apply now — a linked source another owner’s later coverage makes CROSS_OWNER_REFERENCE is 422 for a PASS (nothing written) and recordable for HOLD, BLOCKED, MISSING or CONFLICT; a PAUSED or UNLINKED link supports nothing new (409); another case’s link 422 CROSS_CASE_REFERENCE; an unknown link 422 REFERENCE_NOT_FOUND', async () => {
    const p = await assessmentWorld();
    const other = await otherOwnerUses(p.w, p.linked.id);
    await createCoverage(other.version.data.id, other.coverage());
    const view = await context(p.caseId, scopeOf(p.prompt));
    expect(view.dependencyDigest).not.toBe(p.view.dependencyDigest);
    expect(view.context.conflicts.map((entry) => entry.code)).toEqual(['SOURCE_NOT_APPLICABLE']);
    const { run } = await validate(p.candidate, p.prompt);
    expect(run.result).toBe('REVIEW_REQUIRED');

    const before = await suiteDump();
    const pass = await capturePost(
      p.candidate.id,
      review(p.candidate, view, {
        result: 'PASS',
        sources: [support(p.caseSource2.data.id), support(p.caseSource.data.id)],
      }),
    );
    expect(outcome(pass)).toEqual([422, 'CROSS_OWNER_REFERENCE']);
    // The established refusal of every write citing another owner's material (P3A): it names the
    // field and that owner (a directory record), never any content of this or another case.
    expect(detailsOf(pass)).toEqual({
      field: 'sources.1.caseSourceId',
      ownerId: other.owner.data.id,
    });
    expect(await suiteDump()).toEqual(before);
    // The same PASS on the source that still applies is recorded.
    const applies = await assess(
      p.candidate.id,
      review(p.candidate, view, { result: 'PASS', sources: [support(p.caseSource2.data.id)] }),
    );
    expect(applies.result).toBe('PASS');
    // HOLD, BLOCKED, MISSING and CONFLICT may cite it to record the problem truthfully.
    for (const [gate, result] of [
      ['G2', 'HOLD'],
      ['G3', 'BLOCKED'],
      ['G4', 'MISSING'],
      ['G5', 'CONFLICT'],
    ] as const) {
      const recorded = await assess(
        p.candidate.id,
        review(p.candidate, view, {
          gate,
          result,
          sources: [
            support(
              p.caseSource.data.id,
              'SYNTHETIC this document is now another owner’s material',
            ),
          ],
        }),
      );
      expect([recorded.gate, recorded.result], result).toEqual([gate, result]);
    }

    // A paused or unlinked link supports nothing new, whatever the result.
    const paused = await setLinkState(p.caseSource2.data.id, 'PAUSED');
    const e3 = await context(p.caseId, scopeOf(p.prompt));
    await validate(p.candidate, p.prompt);
    const count = await countRows(prisma, 'candidate_assessments');
    for (const result of ['PASS', 'HOLD'] as const) {
      const refused = await capturePost(
        p.candidate.id,
        review(p.candidate, e3, { result, sources: [support(paused.data.id)] }),
      );
      expect(outcome(refused), result).toEqual([409, 'RECORD_STATE_CONFLICT']);
      expect(detailsOf(refused), result).toMatchObject({
        record: 'CaseSource',
        linkState: 'PAUSED',
        field: 'sources.0.caseSourceId',
      });
    }
    // Another case's link, and an unknown link.
    const q = await promptWorld('Q');
    const foreign = await capturePost(
      p.candidate.id,
      review(p.candidate, e3, { result: 'HOLD', sources: [support(q.caseSource.data.id)] }),
    );
    expect(outcome(foreign)).toEqual([422, 'CROSS_CASE_REFERENCE']);
    expect(detailsOf(foreign)).toMatchObject({ field: 'sources.0.caseSourceId' });
    const unknown = await capturePost(
      p.candidate.id,
      review(p.candidate, e3, { result: 'HOLD', sources: [support(randomUUID())] }),
    );
    expect(outcome(unknown)).toEqual([422, 'REFERENCE_NOT_FOUND']);
    expect(await countRows(prisma, 'candidate_assessments')).toBe(count);
  });

  it('D-1: a superseded candidate is assessed as the exact historical artifact it is — recorded and listed, the candidate unchanged (it never counts: counting is a later readiness rule)', async () => {
    const p = await assessmentWorld();
    const superseded = await supersedeCandidate(p.candidate.id);
    expect(superseded.supersededAt).not.toBeNull();
    const candidateBefore = await prisma.noticeCandidate.findUniqueOrThrow({
      where: { id: p.candidate.id },
    });
    const body = review(superseded, p.view, {
      gate: 'G6',
      result: 'PASS',
      sources: [support(p.caseSource2.data.id)],
    });
    const recorded = await assess(p.candidate.id, body);
    expect(recorded).toEqual(expectedAssessment(p, p.view, body, recorded.id));
    expect(
      await prisma.noticeCandidate.findUniqueOrThrow({ where: { id: p.candidate.id } }),
    ).toEqual(candidateBefore);
    expect((await listAssessments(p.candidate.id)).items).toEqual([recorded]);
  });

  it('D-2 supersession: a successor names the head of a chain of the same candidate and gate, across epochs; the predecessor and its rows stay byte-identical and the successor has only its own rows (AUD-006-K); a second successor 409; another gate or candidate 422 REVISION_SCOPE_CHANGE; another case 422 CROSS_CASE_REFERENCE; unknown 422 REFERENCE_NOT_FOUND', async () => {
    const p = await assessmentWorld();
    const first = await assess(
      p.candidate.id,
      review(p.candidate, p.view, {
        gate: 'G2',
        result: 'HOLD',
        sources: [support(p.caseSource.data.id, 'SYNTHETIC predecessor conclusion')],
      }),
    );
    const firstRows = await assessmentRows(p.candidate.id);
    // A later epoch: the successor records the current epoch; the predecessor keeps its own.
    await reviseFact(p.caseId, p.fact.id);
    const { view: e2 } = await validate(p.candidate, p.prompt);
    t.clock.advance(1000);
    const successor = await assess(
      p.candidate.id,
      review(p.candidate, e2, {
        gate: 'G2',
        result: 'PASS',
        supersedesAssessmentId: first.id,
        sources: [support(p.caseSource2.data.id, 'SYNTHETIC successor conclusion')],
      }),
    );
    expect([successor.supersedesAssessmentId, successor.dependencyDigest]).toEqual([
      first.id,
      e2.dependencyDigest,
    ]);
    expect(first.dependencyDigest).toBe(p.view.dependencyDigest);
    const after = await assessmentRows(p.candidate.id);
    expect(after.assessments.find((row) => row['id'] === first.id)).toEqual(
      firstRows.assessments[0],
    );
    expect(after.supports.filter((row) => row['assessment_id'] === first.id)).toEqual(
      firstRows.supports,
    );
    expect(
      (await supportsOf(p.candidate.id, successor.id)).sources.map((row) => row.caseSourceId),
    ).toEqual([p.caseSource2.data.id]);
    expect(
      (await supportsOf(p.candidate.id, first.id)).sources.map((row) => row.caseSourceId),
    ).toEqual([p.caseSource.data.id]);

    const count = await countRows(prisma, 'candidate_assessments');
    const again = await capturePost(
      p.candidate.id,
      review(p.candidate, e2, {
        gate: 'G2',
        supersedesAssessmentId: first.id,
        sources: [support(p.caseSource.data.id)],
      }),
    );
    expect(outcome(again)).toEqual([409, 'ASSESSMENT_ALREADY_SUPERSEDED']);
    expect(detailsOf(again)).toEqual({ successorId: successor.id });
    const otherGate = await capturePost(
      p.candidate.id,
      review(p.candidate, e2, {
        gate: 'G3',
        supersedesAssessmentId: successor.id,
        sources: [support(p.caseSource.data.id)],
      }),
    );
    expect(outcome(otherGate)).toEqual([422, 'REVISION_SCOPE_CHANGE']);
    expect(detailsOf(otherGate)).toEqual({ fields: ['gate'] });
    // Another candidate of the same case (same prompt, so the same epoch values but its own id).
    const sibling = await importCandidate(p.caseId, draft(p.prompt));
    await validate(sibling, p.prompt);
    const otherCandidate = await capturePost(
      sibling.id,
      review(sibling, e2, {
        gate: 'G2',
        supersedesAssessmentId: successor.id,
        sources: [support(p.caseSource.data.id)],
      }),
    );
    expect(outcome(otherCandidate)).toEqual([422, 'REVISION_SCOPE_CHANGE']);
    expect(detailsOf(otherCandidate)).toEqual({ fields: ['candidateId'] });
    const q = await assessmentWorld('Q');
    const foreign = await assess(
      q.candidate.id,
      review(q.candidate, q.view, { gate: 'G2', sources: [support(q.caseSource.data.id)] }),
    );
    const crossCase = await capturePost(
      p.candidate.id,
      review(p.candidate, e2, {
        gate: 'G2',
        supersedesAssessmentId: foreign.id,
        sources: [support(p.caseSource.data.id)],
      }),
    );
    expect(outcome(crossCase)).toEqual([422, 'CROSS_CASE_REFERENCE']);
    const unknown = await capturePost(
      p.candidate.id,
      review(p.candidate, e2, {
        gate: 'G2',
        supersedesAssessmentId: randomUUID(),
        sources: [support(p.caseSource.data.id)],
      }),
    );
    expect(outcome(unknown)).toEqual([422, 'REFERENCE_NOT_FOUND']);
    expect(detailsOf(unknown)).toMatchObject({ field: 'supersedesAssessmentId' });
    expect(await countRows(prisma, 'candidate_assessments')).toBe(count + 1);
  });

  it('ask dispositions: a reply candidate records dispositions of its prompt’s parent message exactly; another binding of the case 422 ASK_PARENT_MISMATCH; another case’s binding 422 CROSS_CASE_REFERENCE; an initial candidate has no parent (422); a cited source must apply to the case', async () => {
    const r = await replyWorld();
    const candidate = await importCandidate(r.caseId, draft(r.replyPrompt));
    const { view } = await validate(candidate, r.replyPrompt);
    const disposition = {
      askId: 'Q1',
      questionText: 'SYNTHETIC Question 1: please provide the licence.\r\n',
      parentBindingId: r.nmi.id,
      disposition: 'ANSWERED_WITH_LIMITATION',
      answerLocator: 'SYNTHETIC paragraph 2',
      sourceIds: [r.linked.id],
      unresolvedRemainder: 'SYNTHETIC remainder',
    };
    const body = review(candidate, view, {
      gate: 'G6',
      askDispositions: [
        disposition,
        { ...disposition, askId: 'Q2', disposition: 'MISSING_FACT', sourceIds: [] },
      ],
      sources: [support(r.caseSource.data.id)],
    });
    const recorded = await assess(candidate.id, body);
    expect(recorded.askDispositions).toEqual(body['askDispositions']);
    expect((await listAssessments(candidate.id)).items[0]?.askDispositions).toEqual(
      body['askDispositions'],
    );
    const count = await countRows(prisma, 'candidate_assessments');
    const mismatch = await capturePost(
      candidate.id,
      review(candidate, view, {
        askDispositions: [{ ...disposition, parentBindingId: r.other.id }],
        sources: [support(r.caseSource.data.id)],
      }),
    );
    expect(outcome(mismatch)).toEqual([422, 'ASK_PARENT_MISMATCH']);
    expect(detailsOf(mismatch)).toEqual({
      field: 'askDispositions.0.parentBindingId',
      promptParentBindingId: r.nmi.id,
    });
    const q = await replyWorld('Q');
    const foreign = await capturePost(
      candidate.id,
      review(candidate, view, {
        askDispositions: [{ ...disposition, parentBindingId: q.nmi.id }],
        sources: [support(r.caseSource.data.id)],
      }),
    );
    expect(outcome(foreign)).toEqual([422, 'CROSS_CASE_REFERENCE']);
    const foreignSource = await capturePost(
      candidate.id,
      review(candidate, view, {
        askDispositions: [{ ...disposition, sourceIds: [q.linked.id] }],
        sources: [support(r.caseSource.data.id)],
      }),
    );
    expect(outcome(foreignSource)).toEqual([422, 'CROSS_AGENCY_REFERENCE']);
    expect(detailsOf(foreignSource)).toMatchObject({ field: 'askDispositions.0.sourceIds.0' });
    // An initial candidate answers no message.
    const initial = await importCandidate(r.caseId, draft(r.prompt));
    const { view: initialView } = await validate(initial, r.prompt);
    const noParent = await capturePost(
      initial.id,
      review(initial, initialView, {
        askDispositions: [disposition],
        sources: [support(r.caseSource.data.id)],
      }),
    );
    expect(outcome(noParent)).toEqual([422, 'ASK_PARENT_MISMATCH']);
    expect(detailsOf(noParent)).toEqual({
      field: 'askDispositions.0.parentBindingId',
      promptParentBindingId: null,
    });
    expect(await countRows(prisma, 'candidate_assessments')).toBe(count);
  });

  it('assessedAt is the actual assessment instant exactly as supplied, or null — never the recording time; an instant MySQL cannot store exactly is 422 before any claim', async () => {
    const p = await assessmentWorld();
    const base = review(p.candidate, p.view, { sources: [support(p.caseSource.data.id)] });
    const offset = await assess(p.candidate.id, {
      ...base,
      assessedAt: '2026-09-21T23:30:00.001+07:00',
    });
    expect(offset.assessedAt).toBe('2026-09-21T16:30:00.001Z');
    const none = await assess(p.candidate.id, { ...base, gate: 'G2', assessedAt: null });
    const omitted = await assess(p.candidate.id, { ...base, gate: 'G3' });
    expect([none.assessedAt, omitted.assessedAt]).toEqual([null, null]);
    expect(none.createdAt).toBe(new Date(t.clock.ms).toISOString());
    const count = await countRows(prisma, 'candidate_assessments');
    for (const assessedAt of [
      '2026-06-30T23:59:60Z',
      '2026-09-21T10:00:00.0001Z',
      '0999-12-31T00:00:00Z',
    ]) {
      expect(
        outcome(await capturePost(p.candidate.id, { ...base, assessedAt })),
        assessedAt,
      ).toEqual([422, 'VALIDATION_FAILED']);
    }
    expect(await countRows(prisma, 'candidate_assessments')).toBe(count);
  });
});

describe('P4H consistency — idempotency and concurrency (one short SERIALIZABLE transaction)', () => {
  it('idempotency: the same key and body replay the stored assessment with no duplicate rows (even after the context changed); the same key with another body is 409; a failed audit rolls everything back and leaves no record of the key', async () => {
    const p = await assessmentWorld();
    const key = newKey();
    const body = review(p.candidate, p.view, {
      sources: [support(p.caseSource.data.id), support(p.caseSource2.data.id)],
    });
    const failedKey = newKey();
    auditWriter.armed = true;
    const failed = await capturePost(p.candidate.id, body, failedKey);
    auditWriter.armed = false;
    expect(failed.status).toBe(500);
    expect(auditWriter.failures).toBeGreaterThan(0);
    expect(await countRows(prisma, 'candidate_assessments')).toBe(0);
    expect(await countRows(prisma, 'assessment_sources')).toBe(0);
    expect(await prisma.idempotencyRecord.count({ where: { idempotencyKey: failedKey } })).toBe(0);

    const first = await assess(p.candidate.id, body, key);
    const rows = await assessmentRows(p.candidate.id);
    const replay = await assess(p.candidate.id, body, key);
    expect(replay).toEqual(first);
    await reviseFact(p.caseId, p.fact.id);
    expect(await assess(p.candidate.id, body, key)).toEqual(first);
    expect(await assessmentRows(p.candidate.id)).toEqual(rows);
    expect([rows.assessments.length, rows.supports.length]).toEqual([1, 2]);
    const conflict = await capturePost(
      p.candidate.id,
      { ...body, rationale: 'SYNTHETIC other' },
      key,
    );
    expect(outcome(conflict)).toEqual([409, 'IDEMPOTENCY_CONFLICT']);
    expect(await assessmentRows(p.candidate.id)).toEqual(rows);
    // The idempotency record keeps no copy of the review (identifiers only).
    const [record] = await prisma.$queryRaw<Array<{ body: unknown }>>`
      SELECT response_json AS body FROM idempotency_records WHERE idempotency_key = ${key}`;
    expect(JSON.stringify(record?.body ?? null)).not.toContain('SYNTHETIC rationale');
  });

  it('two captures of the same gate and epoch at once: the case lock serializes them and both are recorded with their own supports — two heads, never resolved by taking the latest', async () => {
    const p = await assessmentWorld();
    const second = review(p.candidate, p.view, {
      performerLabel: 'SYNTHETIC Reviewer Two',
      sources: [support(p.caseSource2.data.id, 'SYNTHETIC second reviewer')],
    });
    const secondKey = newKey();
    let started: Promise<HttpResult> | null = null;
    let assessmentsWhileHeld = -1;
    assessmentObserver.hooks.afterCaseLock = async () => {
      started = capturePost(p.candidate.id, second, secondKey);
      await claimed(secondKey);
      assessmentsWhileHeld = await countRows(prisma, 'candidate_assessments');
    };
    const first = await assess(
      p.candidate.id,
      review(p.candidate, p.view, {
        performerLabel: 'SYNTHETIC Reviewer One',
        sources: [support(p.caseSource.data.id, 'SYNTHETIC first reviewer')],
      }),
    );
    if (started === null) throw new Error('the concurrent capture did not start');
    const other = immutable<CandidateAssessment>(await started, 201);
    expect(assessmentsWhileHeld).toBe(0);
    expect([first.gate, other.gate, first.dependencyDigest, other.dependencyDigest]).toEqual([
      'G1',
      'G1',
      p.view.dependencyDigest,
      p.view.dependencyDigest,
    ]);
    expect(
      (await supportsOf(p.candidate.id, first.id)).sources.map((row) => row.supportedConclusion),
    ).toEqual(['SYNTHETIC first reviewer']);
    expect(
      (await supportsOf(p.candidate.id, other.id)).sources.map((row) => row.supportedConclusion),
    ).toEqual(['SYNTHETIC second reviewer']);
    expect(
      (await listAssessments(p.candidate.id)).items.map((item) => item.supersedesAssessmentId),
    ).toEqual([null, null]);
  });

  it('two successors of one predecessor at once: exactly one is recorded; the other is 409 ASSESSMENT_ALREADY_SUPERSEDED naming it and writes nothing', async () => {
    const p = await assessmentWorld();
    const predecessor = await assess(
      p.candidate.id,
      review(p.candidate, p.view, { sources: [support(p.caseSource.data.id)] }),
    );
    const secondKey = newKey();
    let started: Promise<HttpResult> | null = null;
    assessmentObserver.hooks.afterCaseLock = async () => {
      started = capturePost(
        p.candidate.id,
        review(p.candidate, p.view, {
          result: 'MISSING',
          supersedesAssessmentId: predecessor.id,
          sources: [support(p.caseSource2.data.id)],
        }),
        secondKey,
      );
      await claimed(secondKey);
    };
    const winner = await assess(
      p.candidate.id,
      review(p.candidate, p.view, {
        result: 'PASS',
        supersedesAssessmentId: predecessor.id,
        sources: [support(p.caseSource2.data.id)],
      }),
    );
    if (started === null) throw new Error('the concurrent capture did not start');
    const loser: HttpResult = await started;
    expect(outcome(loser)).toEqual([409, 'ASSESSMENT_ALREADY_SUPERSEDED']);
    expect(detailsOf(loser)).toEqual({ successorId: winner.id });
    expect(await countRows(prisma, 'candidate_assessments')).toBe(2);
    expect(await countRows(prisma, 'assessment_sources')).toBe(2);
    expect(await prisma.idempotencyRecord.count({ where: { idempotencyKey: secondKey } })).toBe(0);
  });

  it('a link-state change during a capture waits for it (the case lock): the capture records the link as it was, the pause then commits, and the stored support is never changed', async () => {
    const p = await assessmentWorld();
    const pauseKey = newKey();
    let pausing: Promise<HttpResult> | null = null;
    let stateWhileHeld = '';
    assessmentObserver.hooks.beforeInsert = async () => {
      const link = await getCaseSource(p.caseSource.data.id);
      pausing = client.write(
        'setCaseSourceLinkState',
        'POST',
        `/case-sources/${p.caseSource.data.id}/link-state`,
        { state: 'PAUSED', reason: 'SYNTHETIC paused during a capture' },
        { ifMatch: link.etag, key: pauseKey },
      );
      await claimed(pauseKey);
      stateWhileHeld = (
        await prisma.caseSource.findUniqueOrThrow({ where: { id: p.caseSource.data.id } })
      ).linkState;
    };
    const recorded = await assess(
      p.candidate.id,
      review(p.candidate, p.view, { sources: [support(p.caseSource.data.id)] }),
    );
    if (pausing === null) throw new Error('the concurrent write did not start');
    const paused = versioned<CaseSource>(await pausing, 200);
    expect(stateWhileHeld).toBe('LINKED');
    expect(paused.data.linkState).toBe('PAUSED');
    const rows = await supportsOf(p.candidate.id, recorded.id);
    expect(rows.sources.map((row) => row.caseSourceId)).toEqual([p.caseSource.data.id]);
    // The pause made the recorded epoch's digest stale; the record itself is unchanged.
    const now = await context(p.caseId, scopeOf(p.prompt));
    expect(now.dependencyDigest).not.toBe(recorded.dependencyDigest);
    expect((await listAssessments(p.candidate.id)).items).toEqual([recorded]);
  });

  it('an applicability change during a PASS capture waits for it: another owner’s coverage citing the supporting source commits only after the PASS, which rested on the source as it applied; the context then lists the conflict and a new PASS on it is 422', async () => {
    const p = await assessmentWorld();
    const other = await otherOwnerUses(p.w, p.linked.id);
    const coverageKey = newKey();
    let covering: Promise<HttpResult> | null = null;
    let coveragesWhileHeld = -1;
    const coveragesBefore = await countRows(prisma, 'mandate_coverages');
    assessmentObserver.hooks.beforeInsert = async () => {
      const version = await getVersion(other.version.data.id);
      covering = client.write(
        'createCoverage',
        'POST',
        `/mandate-versions/${other.version.data.id}/coverages`,
        other.coverage(),
        { ifMatch: version.etag, key: coverageKey },
      );
      await claimed(coverageKey);
      coveragesWhileHeld = await countRows(prisma, 'mandate_coverages');
    };
    const passed = await assess(
      p.candidate.id,
      review(p.candidate, p.view, { result: 'PASS', sources: [support(p.caseSource.data.id)] }),
    );
    if (covering === null) throw new Error('the concurrent write did not start');
    const covered: HttpResult = await covering;
    expect(covered.status, covered.text).toBe(201);
    expect(coveragesWhileHeld).toBe(coveragesBefore);
    expect(passed.dependencyDigest).toBe(p.view.dependencyDigest);
    const now = await context(p.caseId, scopeOf(p.prompt));
    expect(now.dependencyDigest).not.toBe(p.view.dependencyDigest);
    expect(now.context.conflicts.map((entry) => entry.code)).toEqual(['SOURCE_NOT_APPLICABLE']);
    await validate(p.candidate, p.prompt);
    expect(
      outcome(
        await capturePost(
          p.candidate.id,
          review(p.candidate, now, { result: 'PASS', sources: [support(p.caseSource.data.id)] }),
        ),
      ),
    ).toEqual([422, 'CROSS_OWNER_REFERENCE']);
  });

  it('a digest change during a capture: committed before the capture reads the context it is 412 CONTEXT_CHANGED with nothing written; attempted after the capture read it, the write waits until the capture committed (SERIALIZABLE)', async () => {
    const p = await assessmentWorld();
    const body = review(p.candidate, p.view, { sources: [support(p.caseSource.data.id)] });
    const key = newKey();
    const auditBefore = await countRows(prisma, 'audit_events');
    assessmentObserver.hooks.afterCaseLock = async () => {
      await recordEvent(p.a.mandate.data.id, p.w.source.id);
    };
    const refused = await capturePost(p.candidate.id, body, key);
    expect(outcome(refused)).toEqual([412, 'CONTEXT_CHANGED']);
    expect(detailsOf(refused)).toEqual({ field: 'expectedDependencyDigest' });
    expect(await countRows(prisma, 'candidate_assessments')).toBe(0);
    // Only the event's own audit record was written; the key was released.
    expect(await countRows(prisma, 'audit_events')).toBe(auditBefore + 1);
    expect(await prisma.idempotencyRecord.count({ where: { idempotencyKey: key } })).toBe(0);

    const { view } = await validate(p.candidate, p.prompt);
    const eventKey = newKey();
    let event: Promise<HttpResult> | null = null;
    let eventsWhileHeld = -1;
    const eventsBefore = await countRows(prisma, 'authority_events');
    assessmentObserver.hooks.beforeInsert = async () => {
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
    const recorded = await assess(
      p.candidate.id,
      { ...body, expectedDependencyDigest: view.dependencyDigest },
      key,
    );
    if (event === null) throw new Error('the concurrent write did not start');
    const eventResult: HttpResult = await event;
    expect(eventResult.status, eventResult.text).toBe(201);
    expect(eventsWhileHeld).toBe(eventsBefore);
    expect(recorded.dependencyDigest).toBe(view.dependencyDigest);
    expect((await context(p.caseId, scopeOf(p.prompt))).dependencyDigest).not.toBe(
      view.dependencyDigest,
    );
  });
});

describe('P4H lists and the support read-back (getCandidateAssessmentSources, TB-SCHEMA-API-v1.4.0)', () => {
  it('list: this candidate’s assessments newest first, exactly as stored, superseded ones included, never another candidate’s; q is exactly an id, a gate, a result, a scope state, a digest, a ruleset or a performer label — no fuzzy match; paged; 404 for an unknown candidate', async () => {
    const p = await assessmentWorld();
    const q = await assessmentWorld('Q');
    await assess(
      q.candidate.id,
      review(q.candidate, q.view, { sources: [support(q.caseSource.data.id)] }),
    );
    const recorded: CandidateAssessment[] = [];
    for (const [gate, result, performerLabel] of [
      ['G1', 'HOLD', 'SYNTHETIC Reviewer Café'],
      ['G2', 'PASS', 'SYNTHETIC Reviewer Two'],
      ['G1', 'MISSING', 'SYNTHETIC Reviewer Two'],
    ] as const) {
      t.clock.advance(1000);
      recorded.push(
        await assess(
          p.candidate.id,
          review(p.candidate, p.view, {
            gate,
            result,
            performerLabel,
            ...(recorded.length === 2 ? { supersedesAssessmentId: recorded[0]?.id } : {}),
            sources: [support(p.caseSource.data.id)],
          }),
        ),
      );
    }
    const [a1, a2, a3] = recorded as [
      CandidateAssessment,
      CandidateAssessment,
      CandidateAssessment,
    ];
    expect((await listAssessments(p.candidate.id)).items).toEqual([a3, a2, a1]);
    const ids = async (query: string) =>
      (await listAssessments(p.candidate.id, `?q=${encodeURIComponent(query)}`)).items.map(
        (item) => item.id,
      );
    expect(await ids(a2.id)).toEqual([a2.id]);
    expect(await ids('G1')).toEqual([a3.id, a1.id]);
    expect(await ids('PASS')).toEqual([a2.id]);
    expect(await ids('RECORDED_NOT_ADOPTED')).toEqual([a3.id, a2.id, a1.id]);
    expect(await ids(p.view.dependencyDigest)).toEqual([a3.id, a2.id, a1.id]);
    expect(await ids(RULESET)).toEqual([a3.id, a2.id, a1.id]);
    expect(await ids('SYNTHETIC Reviewer Two')).toEqual([a3.id, a2.id]);
    for (const fuzzy of [
      'g1',
      'G1 ',
      'pass',
      'SYNTHETIC Reviewer',
      'synthetic reviewer two',
      'SYNTHETIC Reviewer Cafe',
      'Reviewer Two',
      '%',
      q.candidate.id,
    ]) {
      expect(await ids(fuzzy), fuzzy).toEqual([]);
    }
    const page1 = await listAssessments(p.candidate.id, '?limit=2');
    expect(page1.items).toEqual([a3, a2]);
    const page2 = await listAssessments(
      p.candidate.id,
      `?limit=2&cursor=${encodeURIComponent(page1.nextCursor ?? '')}`,
    );
    expect([page2.items, page2.nextCursor]).toEqual([[a1], null]);
    expect(
      outcome(
        await client.get('listCandidateAssessments', `/candidates/${randomUUID()}/assessments`),
      ),
    ).toEqual([404, 'NOT_FOUND']);
    expect(
      outcome(
        await client.get(
          'listCandidateAssessments',
          `/candidates/${p.candidate.id}/assessments?gate=G1`,
        ),
      ),
    ).toEqual([400, 'INVALID_QUERY_PARAMETER']);
  });

  it('AUD-006-A: after a restart and a new session, the list and the support read-back recover the assessment, S1→C1 and S2→C2 in request order with createdAt and createdById — from the server alone', async () => {
    const p = await assessmentWorld();
    const body = review(p.candidate, p.view, {
      sources: [
        support(p.caseSource2.data.id, 'SYNTHETIC C1 recorded first'),
        support(p.caseSource.data.id, 'SYNTHETIC C2 recorded second'),
      ],
    });
    const recorded = await assess(p.candidate.id, body);
    const author = client.session.userId;
    // A full reload: the application restarts and a new session reads.
    await t.close();
    t = await startTestApp(prisma, { assessmentObserver, auditWriter });
    client = new DirectoryClient(t.port, await signIn(t.port, prisma), collected);
    expect(client.session.userId).not.toBe(author);
    expect((await listAssessments(p.candidate.id)).items).toEqual([recorded]);
    const read = await supportsOf(p.candidate.id, recorded.id);
    expect(read).toEqual({
      assessmentId: recorded.id,
      sources: [
        {
          id: expect.any(String),
          assessmentId: recorded.id,
          caseSourceId: p.caseSource2.data.id,
          supportedConclusion: 'SYNTHETIC C1 recorded first',
          createdAt: recorded.createdAt,
          createdById: author,
        },
        {
          id: expect.any(String),
          assessmentId: recorded.id,
          caseSourceId: p.caseSource.data.id,
          supportedConclusion: 'SYNTHETIC C2 recorded second',
          createdAt: recorded.createdAt,
          createdById: author,
        },
      ],
    });
    const [first, second] = read.sources;
    expect((first?.id ?? '') < (second?.id ?? '')).toBe(true);
  });

  it('AUD-006-B exact bytes: CRLF, trailing spaces, combining marks, astral characters and 8,000 code points come back byte-identical — never trimmed, normalized or cut', async () => {
    const p = await assessmentWorld();
    const astral = '\u{1F600}';
    const long = `${'x'.repeat(7998)}${astral}${astral}`;
    const texts = [
      'SYNTHETIC line one\r\nline two\r\n  trailing spaces   ',
      'SYNTHETIC café and café  \t',
      long,
    ];
    const body = review(p.candidate, p.view, {
      rationale: ' SYNTHETIC rationale\r\né ',
      scopeText: '\tSYNTHETIC scope ',
      limitations: '  ',
      sources: [support(p.caseSource.data.id, texts[0]), support(p.caseSource2.data.id, texts[1])],
    });
    const recorded = await assess(p.candidate.id, body);
    expect([recorded.rationale, recorded.scopeText, recorded.limitations]).toEqual([
      body['rationale'],
      body['scopeText'],
      body['limitations'],
    ]);
    const read = await supportsOf(p.candidate.id, recorded.id);
    expect(read.sources.map((row) => row.supportedConclusion)).toEqual(texts.slice(0, 2));
    // The 8,000-code-point conclusion (two astral characters: 8,002 UTF-16 units).
    expect([...long]).toHaveLength(8000);
    const longOne = await assess(
      p.candidate.id,
      review(p.candidate, p.view, { gate: 'G2', sources: [support(p.caseSource.data.id, long)] }),
    );
    const readLong = await supportsOf(p.candidate.id, longOne.id);
    expect(readLong.sources[0]?.supportedConclusion).toBe(long);
    expect(sha256(readLong.sources[0]?.supportedConclusion ?? '')).toBe(sha256(long));
  });

  it('AUD-006-C/D: a link later PAUSED, then UNLINKED — the stored rows are unchanged and still listed; the present link state is a separate read (getCaseSource)', async () => {
    const p = await assessmentWorld();
    const recorded = await assess(
      p.candidate.id,
      review(p.candidate, p.view, {
        sources: [support(p.caseSource.data.id), support(p.caseSource2.data.id)],
      }),
    );
    const before = await supportsOf(p.candidate.id, recorded.id);
    await setLinkState(p.caseSource.data.id, 'PAUSED');
    expect(await supportsOf(p.candidate.id, recorded.id)).toEqual(before);
    expect((await getCaseSource(p.caseSource.data.id)).data.linkState).toBe('PAUSED');
    await setLinkState(p.caseSource.data.id, 'UNLINKED');
    const after = await supportsOf(p.candidate.id, recorded.id);
    expect(after).toEqual(before);
    expect(JSON.stringify(after)).not.toMatch(/linkState|PAUSED|UNLINKED|LINKED/);
    expect((await getCaseSource(p.caseSource.data.id)).data.linkState).toBe('UNLINKED');
    expect((await listAssessments(p.candidate.id)).items).toEqual([recorded]);
  });

  it('AUD-006-E: another candidate’s assessment, an unknown assessment, an unknown candidate and malformed ids are the same 404', async () => {
    const p = await assessmentWorld();
    const recorded = await assess(
      p.candidate.id,
      review(p.candidate, p.view, { sources: [support(p.caseSource.data.id)] }),
    );
    const sibling = await importCandidate(p.caseId, draft(p.prompt));
    const q = await assessmentWorld('Q');
    const refusals = [
      await readSupports(sibling.id, recorded.id),
      await readSupports(q.candidate.id, recorded.id),
      await readSupports(p.candidate.id, randomUUID()),
      await readSupports(randomUUID(), recorded.id),
      await readSupports(p.candidate.id, 'not-a-uuid'),
      await readSupports('not-a-uuid', recorded.id),
      await readSupports(p.candidate.id, recorded.id.toUpperCase()),
    ];
    const expected = refusal(refusals[2] as HttpResult);
    expect(expected.slice(0, 2)).toEqual([404, 'NOT_FOUND']);
    for (const result of refusals) {
      expect(refusal(result)).toEqual(expected);
      expect(result.text).not.toContain(recorded.id);
    }
  });

  it('AUD-006-G: a later source revision re-points nothing — the row still names the same link, and the link still names its exact revision', async () => {
    const p = await assessmentWorld();
    const recorded = await assess(
      p.candidate.id,
      review(p.candidate, p.view, { sources: [support(p.caseSource.data.id)] }),
    );
    const before = await supportsOf(p.candidate.id, recorded.id);
    const newer = await reviseSource(p.linked.id, {
      agencyId: p.w.agency.data.id,
      title: 'SYNTHETIC newer revision of the licence copy',
    });
    expect(newer.id).not.toBe(p.linked.id);
    expect(await supportsOf(p.candidate.id, recorded.id)).toEqual(before);
    expect((await getCaseSource(p.caseSource.data.id)).data.sourceId).toBe(p.linked.id);
  });

  it('AUD-006-I integrity: a stored row naming another case’s link, an assessment holding more than 100 rows or none is a 500 — never a partial answer, nothing leaked', async () => {
    const p = await assessmentWorld();
    const q = await assessmentWorld('Q');
    const recorded = await assess(
      p.candidate.id,
      review(p.candidate, p.view, { sources: [support(p.caseSource.data.id)] }),
    );
    const userId = client.session.userId;
    const at = new Date(t.clock.ms);
    // A row naming another case's link (set directly in tb_notice_test).
    await prisma.assessmentSource.create({
      data: {
        id: randomUUID(),
        assessmentId: recorded.id,
        caseSourceId: q.caseSource.data.id,
        supportedConclusion: 'SYNTHETIC LEAK-CHECK other case',
        createdAt: at,
        createdById: userId,
      },
    });
    const crossCase = await readSupports(p.candidate.id, recorded.id);
    expect(outcome(crossCase)).toEqual([500, 'INTERNAL_ERROR']);
    expect(crossCase.text).not.toMatch(/LEAK-CHECK|SYNTHETIC/);
    expect(crossCase.text).not.toContain(q.caseSource.data.id);
    await prisma.assessmentSource.deleteMany({ where: { caseSourceId: q.caseSource.data.id } });
    expect((await supportsOf(p.candidate.id, recorded.id)).sources).toHaveLength(1);

    // More than 100 rows: 101 links of this case (set directly) and a row for each.
    const links = Array.from({ length: 100 }, (_, index) => ({
      id: randomUUID(),
      caseId: p.caseId,
      sourceId: p.linked2.id,
      useRole: `SYNTHETIC_INTEGRITY_${String(index).padStart(3, '0')}`,
      scopeNote: 'SYNTHETIC integrity link',
      createdAt: at,
      createdById: userId,
      updatedAt: at,
      updatedById: userId,
    }));
    await prisma.caseSource.createMany({ data: links });
    await prisma.assessmentSource.createMany({
      data: links.map((entry) => ({
        id: randomUUID(),
        assessmentId: recorded.id,
        caseSourceId: entry.id,
        supportedConclusion: 'SYNTHETIC LEAK-CHECK row',
        createdAt: at,
        createdById: userId,
      })),
    });
    const tooMany = await readSupports(p.candidate.id, recorded.id);
    expect(outcome(tooMany)).toEqual([500, 'INTERNAL_ERROR']);
    expect(tooMany.text).not.toMatch(/LEAK-CHECK/);
    await prisma.assessmentSource.deleteMany({
      where: { caseSourceId: { in: links.map((entry) => entry.id) } },
    });
    await prisma.caseSource.deleteMany({ where: { id: { in: links.map((entry) => entry.id) } } });

    // No row at all (an assessment set directly without its supports).
    const bare = randomUUID();
    await prisma.candidateAssessment.create({
      data: {
        id: bare,
        candidateId: p.candidate.id,
        caseId: p.caseId,
        gate: 'G4',
        result: 'HOLD',
        artifactSha256: p.candidate.artifactSha256,
        dependencyDigest: p.view.dependencyDigest,
        rulesetVersion: RULESET,
        scopeState: 'RECORDED_NOT_ADOPTED',
        performerKind: 'HUMAN',
        performerLabel: 'SYNTHETIC LEAK-CHECK',
        provenance: 'OPERATOR_REPORTED',
        rationale: 'SYNTHETIC LEAK-CHECK',
        scopeText: 'SYNTHETIC LEAK-CHECK',
        createdAt: at,
        createdById: userId,
      },
    });
    const none = await readSupports(p.candidate.id, bare);
    expect(outcome(none)).toEqual([500, 'INTERNAL_ERROR']);
    expect(none.text).not.toMatch(/LEAK-CHECK/);
    // The sound assessment still reads back exactly.
    expect((await supportsOf(p.candidate.id, recorded.id)).sources).toHaveLength(1);
  });

  it('AUD-006-J read-only: repeated list and support reads write nothing — no row, audit event, idempotency record, row version or context revision', async () => {
    const p = await assessmentWorld();
    const recorded = await assess(
      p.candidate.id,
      review(p.candidate, p.view, { sources: [support(p.caseSource.data.id)] }),
    );
    const before = await suiteDump();
    for (let i = 0; i < 3; i += 1) {
      await supportsOf(p.candidate.id, recorded.id);
      await listAssessments(p.candidate.id);
      await readSupports(p.candidate.id, randomUUID());
    }
    expect(await suiteDump()).toEqual(before);
  });
});

describe('P4H isolation, history and the version transition', () => {
  it('AUD-005-L: two candidates with the same artifact never share runs or assessments — a run of one never makes an epoch of the other assessable', async () => {
    const p = await assessmentWorld();
    const twin = await importCandidate(p.caseId, draft(p.prompt));
    expect(twin.artifactSha256).toBe(p.candidate.artifactSha256);
    expect(twin.id).not.toBe(p.candidate.id);
    const view = await context(p.caseId, scopeOf(p.prompt));
    expect(view.dependencyDigest).toBe(p.run.dependencyDigest);
    // Same artifact, digest and ruleset: only the candidate differs — and that is enough.
    const refused = await capturePost(
      twin.id,
      review(twin, view, { sources: [support(p.caseSource.data.id)] }),
    );
    expect(outcome(refused)).toEqual([422, 'VALIDATION_RUN_REQUIRED']);
    const mine = await assess(
      p.candidate.id,
      review(p.candidate, view, { sources: [support(p.caseSource.data.id)] }),
    );
    const { run: twinRun } = await validate(twin, p.prompt);
    const theirs = await assess(
      twin.id,
      review(twin, view, { sources: [support(p.caseSource.data.id)] }),
    );
    expect(twinRun.candidateId).toBe(twin.id);
    expect((await listAssessments(p.candidate.id)).items).toEqual([mine]);
    expect((await listAssessments(twin.id)).items).toEqual([theirs]);
    expect(outcome(await readSupports(twin.id, mine.id))).toEqual([404, 'NOT_FOUND']);
    expect(outcome(await readSupports(p.candidate.id, theirs.id))).toEqual([404, 'NOT_FOUND']);
  });

  it('AUD-006-F case isolation: a support naming another case’s link is 422 CROSS_CASE_REFERENCE with no assessment, row, audit event or completed key; another case’s assessments never appear in this case’s lists', async () => {
    const p = await assessmentWorld();
    const q = await assessmentWorld('Q');
    const theirs = await assess(
      q.candidate.id,
      review(q.candidate, q.view, { sources: [support(q.caseSource.data.id)] }),
    );
    const before = await suiteDump();
    const key = newKey();
    const refused = await capturePost(
      p.candidate.id,
      review(p.candidate, p.view, {
        sources: [support(p.caseSource.data.id), support(q.caseSource.data.id)],
      }),
      key,
    );
    expect(outcome(refused)).toEqual([422, 'CROSS_CASE_REFERENCE']);
    expect(detailsOf(refused)).toMatchObject({ field: 'sources.1.caseSourceId' });
    expect(await suiteDump()).toEqual(before);
    expect(await prisma.idempotencyRecord.count({ where: { idempotencyKey: key } })).toBe(0);
    expect((await listAssessments(p.candidate.id)).items).toEqual([]);
    expect((await listAssessments(q.candidate.id)).items).toEqual([theirs]);
  });

  it('an archived case is read-only: a capture is 409 with nothing recorded; its recorded assessments and supports stay readable', async () => {
    const p = await assessmentWorld();
    const recorded = await assess(
      p.candidate.id,
      review(p.candidate, p.view, { sources: [support(p.caseSource.data.id)] }),
    );
    const supports = await supportsOf(p.candidate.id, recorded.id);
    await archiveCase(p.caseId);
    const refused = await capturePost(
      p.candidate.id,
      review(p.candidate, p.view, { gate: 'G2', sources: [support(p.caseSource.data.id)] }),
    );
    expect(outcome(refused)).toEqual([409, 'RECORD_STATE_CONFLICT']);
    expect(await countRows(prisma, 'candidate_assessments')).toBe(1);
    expect((await listAssessments(p.candidate.id)).items).toEqual([recorded]);
    expect(await supportsOf(p.candidate.id, recorded.id)).toEqual(supports);
  });

  it('the audit event records identifiers, the epoch and its run, counts, and the source revisions behind the supports — the rationale, scope text, limitations, conclusions and questions only as their lengths', async () => {
    const r = await replyWorld();
    const candidate = await importCandidate(r.caseId, draft(r.replyPrompt));
    const { run, view } = await validate(candidate, r.replyPrompt);
    const body = review(candidate, view, {
      gate: 'G6',
      result: 'PASS',
      performerLabel: 'SYNTHETIC Reviewer PRIVATE-LABEL',
      rationale: 'SYNTHETIC PRIVATE-RATIONALE',
      scopeText: 'SYNTHETIC PRIVATE-SCOPE',
      limitations: 'SYNTHETIC PRIVATE-LIMITS',
      askDispositions: [
        {
          askId: 'Q1',
          questionText: 'SYNTHETIC PRIVATE-QUESTION',
          parentBindingId: r.nmi.id,
          disposition: 'ANSWERED_SUPPORTED',
          sourceIds: [r.linked.id],
        },
      ],
      sources: [
        support(r.caseSource.data.id, 'SYNTHETIC PRIVATE-CONCLUSION one'),
        support(r.caseSource2.data.id, 'SYNTHETIC PRIVATE-CONCLUSION two'),
      ],
    });
    const recorded = await assess(candidate.id, body);
    const events = await prisma.auditEvent.findMany({
      where: { action: 'CANDIDATE_ASSESSMENT_CAPTURED' },
    });
    expect(events).toHaveLength(1);
    const event = events[0] as (typeof events)[number];
    expect([event.entityType, event.entityId, event.actorUserId]).toEqual([
      'CandidateAssessment',
      recorded.id,
      client.session.userId,
    ]);
    const text = JSON.stringify(event);
    expect(text).not.toMatch(/PRIVATE-/);
    const after = event.afterRedacted as Record<string, unknown>;
    expect(after).toMatchObject({
      candidateId: candidate.id,
      caseId: r.caseId,
      gate: 'G6',
      result: 'PASS',
      artifactSha256: candidate.artifactSha256,
      dependencyDigest: view.dependencyDigest,
      rulesetVersion: RULESET,
      epochValidationRunId: run.id,
      scopeState: 'RECORDED_NOT_ADOPTED',
      performerKind: 'HUMAN',
      performerLabel: {
        redacted: true,
        codePoints: [...'SYNTHETIC Reviewer PRIVATE-LABEL'].length,
      },
      provenance: 'OPERATOR_REPORTED',
      rationale: { redacted: true, codePoints: [...'SYNTHETIC PRIVATE-RATIONALE'].length },
      scopeText: { redacted: true, codePoints: [...'SYNTHETIC PRIVATE-SCOPE'].length },
      limitations: { redacted: true, codePoints: [...'SYNTHETIC PRIVATE-LIMITS'].length },
      askDispositions: { count: 1, dispositions: { ANSWERED_SUPPORTED: 1 } },
      supersedesAssessmentId: null,
      candidateSuperseded: false,
    });
    expect((after['sources'] as unknown[]).length).toBe(2);
    expect([...(event.sourceIds as string[])].sort()).toEqual([r.linked.id, r.linked2.id].sort());
  });

  it('the version transition (TB-SCHEMA-API-v1.3.0 → v1.4.0): a preview digest computed under v1.3.0 is 412 for a prompt, a validation and a capture; a prompt, run and assessment recorded under v1.3.0 with ruleset v2 stay exactly as recorded; the old prompt’s candidate is REVIEW_REQUIRED by a version-only CONTEXT.PROMPT_DRIFT — never redrafted; the historical assessment may be superseded at the current epoch', async () => {
    const p = await promptWorld();
    const scope = validationScope(
      await prisma.promptSnapshot.findUniqueOrThrow({ where: { id: p.prompt.id } }),
    );
    const view = await context(p.caseId, scopeOf(p.prompt));
    const v130 = { contract: 'TB-SCHEMA-API-v1.3.0', schemaVersion: PFC_SCHEMA_VERSION };
    const v140 = { contract: CONTRACT_BASELINE, schemaVersion: PFC_SCHEMA_VERSION };
    expect(CONTRACT_BASELINE).toBe('TB-SCHEMA-API-v1.5.0');
    expect(view.dependencyDigest).toBe(currentV2Digest(v140, scope, view.dependencies));
    const h130 = currentV2Digest(v130, scope, view.dependencies);
    expect(h130).not.toBe(view.dependencyDigest);

    // A prompt, its candidate, a v2 run and a v2 assessment as a v1.3.0 deployment recorded them
    // (set directly in tb_notice_test: this deployment no longer computes the v1.3.0 digest).
    const userId = client.session.userId;
    const at = new Date(Date.UTC(2026, 8, 22, 12, 0, 0, 0));
    const legacy: ContextView = { ...view, dependencyDigest: h130 };
    const promptId = randomUUID();
    const renderedPrompt = renderPrompt(legacy, 'TB-SCHEMA-API-v1.3.0');
    const sourceManifest = promptSourceManifest(legacy.context);
    const version =
      (await prisma.promptSnapshot.count({ where: { caseId: p.caseId, taskType: 'INITIAL' } })) + 1;
    await prisma.$executeRaw`
      INSERT INTO prompt_snapshots (id, case_id, task_type, generation_mode, version,
        authority_selection_id, parent_binding_id, contract_version, template_version,
        context_revision, dependency_digest, dependency_manifest, context_json, source_manifest,
        missing_items, conflicts, rendered_prompt, prompt_sha256, created_at, created_by_id)
      VALUES (${promptId}, ${p.caseId}, ${'INITIAL'}, ${'DRAFTING'}, ${version},
        ${p.selection.id}, ${null}, ${'TB-SCHEMA-API-v1.3.0'}, ${PROMPT_TEMPLATE_VERSION},
        ${legacy.contextRevision}, ${h130}, CAST(${JSON.stringify(legacy.dependencies)} AS JSON),
        CAST(${JSON.stringify(legacy.context)} AS JSON), CAST(${JSON.stringify(sourceManifest)} AS JSON),
        CAST(${JSON.stringify(legacy.context.missing)} AS JSON), CAST(${'[]'} AS JSON),
        ${renderedPrompt}, ${sha256(renderedPrompt)}, ${at}, ${userId})`;
    const oldPrompt = await readPrompt(promptId);
    expect([oldPrompt.contractVersion, oldPrompt.dependencyDigest]).toEqual([
      'TB-SCHEMA-API-v1.3.0',
      h130,
    ]);
    expect(oldPrompt.renderedPrompt).toContain('Wire contract: TB-SCHEMA-API-v1.3.0');
    const candidate = await importCandidate(p.caseId, draft(oldPrompt));
    const runId = randomUUID();
    const coverage = {
      requiredRuleIds: ALL_RULES,
      executedRuleIds: ALL_RULES,
      notExecutedRuleIds: [],
      semanticReviewRequired: true as const,
    };
    await prisma.$executeRaw`
      INSERT INTO validation_runs (id, candidate_id, case_id, artifact_sha256, dependency_digest,
        dependency_manifest, evaluated_context_json, ruleset_version, result, coverage_manifest,
        blocker_count, review_required_count, warning_count, started_at, completed_at, created_at,
        created_by_id)
      VALUES (${runId}, ${candidate.id}, ${p.caseId}, ${candidate.artifactSha256}, ${h130},
        CAST(${JSON.stringify(legacy.dependencies)} AS JSON), CAST(${JSON.stringify(legacy.context)} AS JSON),
        ${'TB-TECHNICAL-RULESET-v2'}, ${'TECHNICAL_PASS'}, CAST(${JSON.stringify(coverage)} AS JSON),
        0, 0, 0, ${at}, ${at}, ${at}, ${userId})`;
    const oldAssessmentId = randomUUID();
    await prisma.candidateAssessment.create({
      data: {
        id: oldAssessmentId,
        candidateId: candidate.id,
        caseId: p.caseId,
        gate: 'G1',
        result: 'PASS',
        artifactSha256: candidate.artifactSha256,
        dependencyDigest: h130,
        rulesetVersion: 'TB-TECHNICAL-RULESET-v2',
        scopeState: 'SCOPE_CONFIRMED_FOR_CANDIDATE',
        performerKind: 'HUMAN',
        performerLabel: 'SYNTHETIC historical reviewer',
        provenance: 'OPERATOR_REPORTED',
        rationale: 'SYNTHETIC historical rationale',
        scopeText: 'SYNTHETIC historical scope',
        createdAt: at,
        createdById: userId,
      },
    });
    await prisma.assessmentSource.create({
      data: {
        id: randomUUID(),
        assessmentId: oldAssessmentId,
        caseSourceId: p.caseSource.data.id,
        supportedConclusion: 'SYNTHETIC historical conclusion',
        createdAt: at,
        createdById: userId,
      },
    });
    const [historical] = (await listAssessments(candidate.id)).items;
    expect(historical).toMatchObject({
      id: oldAssessmentId,
      dependencyDigest: h130,
      rulesetVersion: 'TB-TECHNICAL-RULESET-v2',
      createdAt: at.toISOString(),
    });
    const historicalSupports = await supportsOf(candidate.id, oldAssessmentId);
    const stored = async () => ({
      prompt: await prisma.promptSnapshot.findUniqueOrThrow({ where: { id: promptId } }),
      run: await prisma.validationRun.findUniqueOrThrow({ where: { id: runId } }),
      candidate: await prisma.noticeCandidate.findUniqueOrThrow({ where: { id: candidate.id } }),
      assessments: await assessmentRows(candidate.id),
      caseRow: await prisma.caseRecord.findUniqueOrThrow({ where: { id: p.caseId } }),
    });
    const history = await stored();

    // A preview under v1.3.0: 412 for a prompt, a validation and a capture; nothing recorded.
    const counts = async () => [
      await countRows(prisma, 'prompt_snapshots'),
      await countRows(prisma, 'validation_runs'),
      await countRows(prisma, 'candidate_assessments'),
    ];
    const countsBefore = await counts();
    const stalePrompt = await client.write('generatePrompt', 'POST', `/cases/${p.caseId}/prompts`, {
      taskType: 'INITIAL',
      generationMode: 'DRAFTING',
      expectedContextRevision: view.contextRevision,
      expectedDependencyDigest: h130,
      authoritySelectionId: p.selection.id,
      priorBindingIds: [],
    });
    expect(outcome(stalePrompt)).toEqual([412, 'CONTEXT_CHANGED']);
    const staleRun = await validatePost(candidate.id, {
      expectedArtifactSha256: candidate.artifactSha256,
      expectedDependencyDigest: h130,
    });
    expect(outcome(staleRun)).toEqual([412, 'CONTEXT_CHANGED']);
    const staleCapture = await capturePost(
      candidate.id,
      review(candidate, legacy, { sources: [support(p.caseSource.data.id)] }),
    );
    expect(outcome(staleCapture)).toEqual([412, 'CONTEXT_CHANGED']);
    // A historical v2 run at the v1.3.0 digest makes no current epoch assessable either.
    const v2Capture = await capturePost(
      candidate.id,
      review(candidate, view, {
        rulesetVersion: 'TB-TECHNICAL-RULESET-v2',
        sources: [support(p.caseSource.data.id)],
      }),
    );
    expect(outcome(v2Capture)).toEqual([422, 'RULESET_NOT_CURRENT']);
    const noRun = await capturePost(
      candidate.id,
      review(candidate, view, { sources: [support(p.caseSource.data.id)] }),
    );
    expect(outcome(noRun)).toEqual([422, 'VALIDATION_RUN_REQUIRED']);
    expect(await counts()).toEqual(countsBefore);

    // The current read: a new v4 run, REVIEW_REQUIRED by the version-only drift of the prompt.
    const { run } = await validate(candidate, oldPrompt);
    expect([run.rulesetVersion, run.result, run.dependencyDigest]).toEqual([
      RULESET,
      'REVIEW_REQUIRED',
      view.dependencyDigest,
    ]);
    expect(
      (await issuesOf(run.id)).map((issue) => [issue.ruleId, issue.fieldPath, issue.details]),
    ).toEqual([
      [
        'CONTEXT.PROMPT_DRIFT',
        'dependencyDigest',
        {
          change: 'IDENTIFIERS',
          promptDependencyDigest: h130,
          currentDependencyDigest: view.dependencyDigest,
        },
      ],
    ]);
    // The historical assessment may be superseded at the current epoch; history is unchanged.
    t.clock.advance(1000);
    const successor = await assess(
      candidate.id,
      review(candidate, view, {
        gate: 'G1',
        result: 'HOLD',
        supersedesAssessmentId: oldAssessmentId,
        rationale:
          'SYNTHETIC re-recorded at the current epoch; the prompt’s version drift needs review',
        sources: [support(p.caseSource.data.id)],
      }),
    );
    expect([
      successor.rulesetVersion,
      successor.dependencyDigest,
      successor.supersedesAssessmentId,
    ]).toEqual([RULESET, view.dependencyDigest, oldAssessmentId]);
    const now = await stored();
    expect(now.prompt).toEqual(history.prompt);
    expect(now.run).toEqual(history.run);
    expect(now.candidate).toEqual(history.candidate);
    expect(now.caseRow).toEqual(history.caseRow);
    expect(now.assessments.assessments.find((row) => row['id'] === oldAssessmentId)).toEqual(
      history.assessments.assessments[0],
    );
    expect(await readPrompt(promptId)).toEqual(oldPrompt);
    expect(await supportsOf(candidate.id, oldAssessmentId)).toEqual(historicalSupports);
    // No automatic redraft: no prompt or candidate was created by the transition.
    expect(await countRows(prisma, 'prompt_snapshots')).toBe(countsBefore[0]);
    expect(await countRows(prisma, 'notice_candidates')).toBe(1);
  });
});

describe('P4H boundaries — no outbound call, no readiness, no export, no waiver, no mutation', () => {
  it('a capture and the reads open no outbound connection and call no fetch — no AI provider, network or mail call exists', async () => {
    const p = await assessmentWorld();
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
      const recorded = await assess(
        p.candidate.id,
        review(p.candidate, p.view, {
          rationale: 'SYNTHETIC see https://drive.example.invalid/file/synthetic',
          sources: [support(p.caseSource.data.id, 'SYNTHETIC https://example.invalid/evidence')],
        }),
      );
      await listAssessments(p.candidate.id);
      await supportsOf(p.candidate.id, recorded.id);
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

  it('hard stop: no assessment is updated or deleted; no waiver, disposition, override, adoption, signing or sending route exists (readiness and the unsigned export are routed since P4I, tests/db/p4i-http.test.ts)', async () => {
    const p = await assessmentWorld();
    const recorded = await assess(
      p.candidate.id,
      review(p.candidate, p.view, { sources: [support(p.caseSource.data.id)] }),
    );
    const before = await suiteDump();
    const base = `/candidates/${p.candidate.id}`;
    const paths: Array<['GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT', string]> = [
      ['POST', `${base}/readiness`],
      ['GET', `${base}/unsigned-exports`],
      ['GET', `${base}/assessments/${recorded.id}`],
      ['PATCH', `${base}/assessments/${recorded.id}`],
      ['PUT', `${base}/assessments/${recorded.id}`],
      ['DELETE', `${base}/assessments/${recorded.id}`],
      ['POST', `${base}/assessments/${recorded.id}/supersede`],
      ['POST', `${base}/assessments/${recorded.id}/sources`],
      ['DELETE', `${base}/assessments/${recorded.id}/sources`],
      ['POST', `${base}/waivers`],
      ['POST', `${base}/dispositions`],
      ['POST', `/validation-runs/${p.run.id}/dispositions`],
      ['POST', `/validation-runs/${p.run.id}/waive`],
      ['POST', `${base}/adopt`],
      ['POST', `${base}/sign`],
      ['POST', `${base}/send`],
      ['POST', `/cases/${p.caseId}/g7`],
    ];
    for (const [method, target] of paths) {
      const response = await unrouted(method, target);
      expect([response.status, code(response)], `${method} ${target}`).toEqual([404, 'NOT_FOUND']);
    }
    expect(await suiteDump()).toEqual(before);
  });

  it('every collected response matches its operation: declared status, contract schema, no ETag on an assessment, no readiness or verdict vocabulary as a key; the three assessment operations were exercised', () => {
    const byId = new Map<string, (typeof operations)[number]>(
      operations.map((operation) => [operation.operationId, operation]),
    );
    const seen = new Set<string>();
    const forbiddenKey =
      /"(g[1-7]\w*|ready\w*|readiness|eligib\w*|authori[sz]ed\w*|infring\w*|verified\w*|approved\w*|isCurrent\w*|current\w*|stale\w*|valid|validated|isValid\w*|signed\w*|adopted\w*|sent\w*|waive\w*|disposition(State|Status)|linkState|applicab\w*)"\s*:/i;
    const assessmentOperations = [
      'captureCandidateAssessment',
      'listCandidateAssessments',
      'getCandidateAssessmentSources',
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
        if (assessmentOperations.includes(operationId)) {
          expect(result.text, label).not.toMatch(forbiddenKey);
          expect(result.text, label).not.toMatch(/READY_FOR_SIGNER|G[1-7]_PASS|TECHNICAL_PASS/);
        }
      } else {
        expect(operation.errors as readonly string[], label).toContain(String(result.status));
        expect(OperationErrorSchema.safeParse(result.json).success, label).toBe(true);
      }
      expect(result.headers['cache-control'], label).toBe('no-store');
    }
    for (const operationId of assessmentOperations) {
      expect(seen.has(operationId), operationId).toBe(true);
    }
    expect(CONTRACT_BASELINE).toBe('TB-SCHEMA-API-v1.5.0');
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
