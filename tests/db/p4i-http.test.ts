// P4I — readiness and the unsigned export over real HTTP against tb_notice_test (yarn test:db).
//
// Each test boots the real AppModule + configureApp pipeline on an ephemeral loopback port with a
// synthetic signed-in application User, a controllable clock, a validation observer (to record an
// ERROR run) and a readiness observer the consistency tests use. Every response is recorded and
// checked against the active contract (TB-SCHEMA-API-v1.4.0, unchanged by P4I) at the end. All data
// is synthetic (example.invalid addresses only); every test deletes what it created.
//
// getCandidateReadiness derives READY_FOR_SIGNER from the current captured records on every read
// (ADR-0011, accepted by the operator with the independent review deferred): the current epoch E =
// (candidateId, artifactSha256, dependencyDigest, rulesetVersion), a TECHNICAL_PASS run of exactly
// E with full coverage, and six confirmed PASS heads of E (no compensation, no convenient PASS),
// with the G1 review not overtaken by a captured temporal boundary. It is never stored and writes
// nothing. exportUnsignedCandidate re-evaluates readiness in its SERIALIZABLE write and on every
// replay, and releases the stored text exactly only while the candidate is READY_FOR_SIGNER with
// the artifact, digest and run the caller named. READY_FOR_SIGNER is "ready for authorized human
// signer review": nothing here signs, adopts, sends or submits anything; G7 stays outside.
import { createHash, randomUUID } from 'node:crypto';
import net from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../apps/api/generated/prisma/client.js';
import type {
  Agency,
  AuthorityEvent,
  CandidateAssessment,
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
  Readiness,
  ReportedItem,
  Route,
  Signer,
  SourceReference,
  UnsignedExport,
  UseMapping,
  ValidationRun,
} from '../../packages/contracts/src/index.js';
import {
  CONTRACT_BASELINE,
  OperationErrorSchema,
  operations,
} from '../../packages/contracts/src/index.js';
import { LAST_SEEN_WRITE_INTERVAL_MS } from '../../apps/api/src/modules/auth/auth-config.js';
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

let prisma: PrismaClient;
let t: TestApp;
let client: DirectoryClient;
const collected: Recorded[] = [];

type Hook = (caseId: string) => Promise<void>;

/** The export's consistency hooks: each runs once, inside the export transaction. */
const readinessObserver = {
  hooks: {
    afterCaseLock: null as Hook | null,
    beforeRecord: null as Hook | null,
  },
  async afterCaseLock(caseId: string): Promise<void> {
    const hook = this.hooks.afterCaseLock;
    this.hooks.afterCaseLock = null;
    if (hook) await hook(caseId);
  },
  async beforeRecord(caseId: string): Promise<void> {
    const hook = this.hooks.beforeRecord;
    this.hooks.beforeRecord = null;
    if (hook) await hook(caseId);
  },
};

/** Makes one rule of the next validation runs fail while running (an ERROR run). */
const validationObserver = {
  failRule: null as string | null,
  async afterCapture(): Promise<void> {},
  async afterCaseLock(): Promise<void> {},
  async beforeInsert(): Promise<void> {},
  beforeRule(ruleId: string): void {
    if (ruleId === this.failRule) throw new TypeError('SYNTHETIC rule failure');
  },
};

const auditWriter = new FailingAuditWriter();

beforeAll(async () => {
  ({ prisma } = openTestPrisma());
  await assertSuiteTablesEmpty(prisma);
});

beforeEach(async () => {
  readinessObserver.hooks.afterCaseLock = null;
  readinessObserver.hooks.beforeRecord = null;
  validationObserver.failRule = null;
  auditWriter.armed = false;
  t = await startTestApp(prisma, { readinessObserver, validationObserver, auditWriter });
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
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const iso = (ms: number) => new Date(ms).toISOString();

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

/** Every row of the given tables, raw (bigints as text), sorted. */
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

/** Every table but the audit and idempotency records: what an export must leave byte-identical. */
const BUSINESS_TABLES = DIRECTORY_SUITE_TABLES.filter(
  (table) => !['audit_events', 'idempotency_records'].includes(table),
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
const eventBody = (sourceId: string, fields: Record<string, unknown> = {}) => ({
  eventType: 'CURRENTNESS_RECORDED',
  provenance: 'OPERATOR_REPORTED',
  sourceId,
  scopeText: 'SYNTHETIC whole mandate',
  interpretation: 'SYNTHETIC operator reading',
  ...fields,
});
async function recordEvent(mandateId: string, sourceId: string, fields = {}) {
  const mandate = await getMandate(mandateId);
  return immutable<AuthorityEvent>(
    await client.write(
      'recordAuthorityEvent',
      'POST',
      `/mandates/${mandateId}/events`,
      eventBody(sourceId, fields),
      { ifMatch: mandate.etag },
    ),
    201,
  );
}

/** Agency A with its canonical-record source, Owner X – Subject L (LINKED), a route and a signer. */
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

/** Dates of the authority chain (all omitted unless a temporal test names them). */
interface AuthorityDates {
  readonly versionEffectiveOn?: string;
  readonly coverageEffectiveOn?: string;
  readonly coverageExpiresOn?: string;
}

/** One frozen mandate version of the world's agency with one coverage of its route and signer. */
async function authority(w: World, dates: AuthorityDates = {}) {
  const mandate = await createMandate(w.agency.data.id, 'SYNTHETIC mandate');
  const basis = await createSource({
    agencyId: w.agency.data.id,
    title: 'SYNTHETIC coverage basis',
  });
  const version = await createVersion(mandate.data.id, {
    primarySourceId: w.source.id,
    documentState: 'SIGNED_APPEARING',
    ...(dates.versionEffectiveOn === undefined ? {} : { effectiveOn: dates.versionEffectiveOn }),
  });
  const coverage = await createCoverage(version.data.id, {
    routeId: w.route.data.id,
    basisSourceId: basis.id,
    actionScope: ['PREPARE_NOTICE'],
    coverageLabel: 'SYNTHETIC coverage',
    ...(dates.coverageEffectiveOn === undefined ? {} : { effectiveOn: dates.coverageEffectiveOn }),
    ...(dates.coverageExpiresOn === undefined ? {} : { expiresOn: dates.coverageExpiresOn }),
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
type Authority = Awaited<ReturnType<typeof authority>>;

// cases (P4A), intake (P4B) and correspondence (P4C) --------------------------------------------

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
const SENDER = 'synthetic-sender@example.invalid';
const PLATFORM = 'synthetic-platform-notices@example.invalid';
async function select(caseId: string, w: World, coverageIds: readonly string[]) {
  const current = await getCase(caseId);
  return immutable<CaseAuthoritySelection>(
    await client.write(
      'selectCaseAuthority',
      'POST',
      `/cases/${caseId}/authority-selections`,
      {
        routeId: w.route.data.id,
        signerId: w.signer.data.id,
        taskType: 'INITIAL',
        intendedFromEmail: SENDER,
        selectionNote: 'SYNTHETIC selection note',
        coverages: coverageIds.map((coverageId, index) => ({
          coverageId,
          applicationScope: `SYNTHETIC application scope ${index + 1}`,
        })),
      },
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
      rawUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
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
const createFact = async (caseId: string) =>
  immutable<CaseFact>(
    await caseCreate('createCaseFact', caseId, 'facts', {
      factType: 'RIGHTS_BASIS',
      value: {
        basis: 'UNKNOWN',
        assertion: 'SYNTHETIC rights basis as reported',
        limitations: null,
      },
      scopeKind: 'CASE',
      provenance: 'OPERATOR_REPORTED',
      scopeText: 'SYNTHETIC scope of this fact',
      changeReason: 'SYNTHETIC initial intake',
      sources: [],
    }),
    201,
  );
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

// production context (P4D), prompts (P4E), candidates (P4F), validation (P4G) -------------------

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

/** Options of a production world. */
interface WorldOptions {
  readonly label?: string;
  readonly generationMode?: 'PREPARATION' | 'DRAFTING';
  readonly dates?: AuthorityDates;
  /** Runs before the prompt is generated (a temporal record must be part of the prompt's context). */
  readonly beforePrompt?: (w: World, a: Authority) => Promise<void>;
}

/**
 * A synthetic production world: the directory and a frozen authority chain, a case bound to the
 * route with an explicit selection, one reported item, one work, one mapping, a fact and two linked
 * case sources — and one INITIAL prompt generated against that selection.
 */
async function promptWorld(options: WorldOptions = {}) {
  const label = options.label ?? 'A';
  const w = await world(label);
  const a = await authority(w, options.dates);
  const created = await createCase(w.agency.data.id, { routeId: w.route.data.id });
  const caseId = created.data.id;
  const selection = await select(caseId, w, [a.coverage.data.id]);
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
  if (options.beforePrompt) await options.beforePrompt(w, a);
  const prompt = await generate(caseId, {
    authoritySelectionId: selection.id,
    generationMode: options.generationMode ?? 'DRAFTING',
  });
  return { w, a, caseId, selection, item, work, basis, mapping, fact, linked, caseSource, prompt };
}

/**
 * A prompt world plus a captured NMI bound to the case, a prior transmission recorded as sent and an
 * NMI_REPLY DRAFTING prompt with that parent and prior.
 */
async function replyWorld(label = 'A') {
  const p = await promptWorld({ label });
  const nmiMessage = await capture(p.w.agency.data.id, {
    subject: 'SYNTHETIC we need more information',
    bodyText: 'SYNTHETIC Question 1: please provide the licence.',
    fromAddress: 'synthetic-platform-review@example.invalid',
    replyToAddress: 'synthetic-reply-here@example.invalid',
  });
  const nmi = await bind(p.caseId, { correspondenceId: nmiMessage.id, eventType: 'NMI' });
  const sentMessage = await capture(p.w.agency.data.id, {
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
  return { ...p, nmiMessage, nmi, sent, replyPrompt };
}

const SLOT = '[PENDING AUTHORIZED SIGNER — FULL LEGAL NAME REQUIRED]';
/** A draft with nothing a technical rule reports: exact text with CRLF, NFD, trailing space, one slot. */
const CLEAN_BODY =
  'SYNTHETIC notice text for human review. \r\nThe recorded work appears in the reported video (café, café).\n\nSincerely,\n' +
  `${SLOT}\n`;

function draft(
  prompt: PromptSnapshot,
  fields: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    promptSnapshotId: prompt.id,
    subject: 'SYNTHETIC notice subject — café',
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
async function supersedeCandidate(id: string, key?: string) {
  return immutable<NoticeCandidate>(
    await client.write(
      'supersedeCandidate',
      'POST',
      `/candidates/${id}/supersede`,
      { reason: 'SYNTHETIC replaced by a corrected draft' },
      key === undefined ? {} : { key },
    ),
    200,
  );
}
async function validate(candidate: NoticeCandidate, prompt: PromptSnapshot) {
  const view = await context(candidate.caseId, scopeOf(prompt));
  const run = immutable<ValidationRun>(
    await client.write('validateCandidate', 'POST', `/candidates/${candidate.id}/validation-runs`, {
      expectedArtifactSha256: candidate.artifactSha256,
      expectedDependencyDigest: view.dependencyDigest,
    }),
    201,
  );
  return { run, view };
}

// assessments (P4H) -----------------------------------------------------------------------------

const RULESET = 'TB-TECHNICAL-RULESET-v3';
const GATES = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6'] as const;
type Gate = (typeof GATES)[number];

/** A confirmed PASS review of `gate` at the epoch of `view`, resting on `caseSourceId`. */
function pass(
  candidate: NoticeCandidate,
  view: ContextView,
  gate: Gate,
  caseSourceId: string,
  fields: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    gate,
    result: 'PASS',
    expectedArtifactSha256: candidate.artifactSha256,
    expectedDependencyDigest: view.dependencyDigest,
    rulesetVersion: RULESET,
    scopeState: 'SCOPE_CONFIRMED_FOR_CANDIDATE',
    performerKind: 'HUMAN',
    performerLabel: `SYNTHETIC Reviewer ${gate}, reviewing capacity`,
    provenance: 'OPERATOR_REPORTED',
    rationale: `SYNTHETIC ${gate} rationale as entered by the reviewer`,
    scopeText: `SYNTHETIC ${gate} scope of this review`,
    // The actual review instant as the operator records it: the moment of the (synthetic) review.
    assessedAt: iso(t.clock.ms),
    sources: [{ caseSourceId, supportedConclusion: `SYNTHETIC ${gate} conclusion` }],
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
async function assess(candidateId: string, body: unknown) {
  return immutable<CandidateAssessment>(await capturePost(candidateId, body), 201);
}

/** Six confirmed PASS reviews of the current epoch (per-gate fields override the defaults). */
async function passAll(
  candidate: NoticeCandidate,
  view: ContextView,
  caseSourceId: string,
  fields: Partial<Record<Gate, Record<string, unknown> | null>> = {},
): Promise<Partial<Record<Gate, CandidateAssessment>>> {
  const recorded: Partial<Record<Gate, CandidateAssessment>> = {};
  for (const gate of GATES) {
    const overrides = fields[gate];
    if (overrides === null) continue;
    recorded[gate] = await assess(
      candidate.id,
      pass(candidate, view, gate, caseSourceId, overrides ?? {}),
    );
  }
  return recorded;
}

// readiness and the unsigned export (P4I) -------------------------------------------------------

const readinessPath = (candidateId: string) => `/candidates/${candidateId}/readiness`;
async function readiness(candidateId: string): Promise<Readiness> {
  const result = await client.get('getCandidateReadiness', readinessPath(candidateId));
  expect(result.status, result.text).toBe(200);
  expect(result.headers['etag']).toBeUndefined();
  expect(result.headers['cache-control']).toBe('no-store');
  return dataOf<Readiness>(result);
}
const exportPost = (candidateId: string, body: unknown, key?: string | null) =>
  client.write(
    'exportUnsignedCandidate',
    'POST',
    `/candidates/${candidateId}/unsigned-exports`,
    body,
    key === undefined ? {} : { key },
  );
function exportBody(current: Readiness, fields: Record<string, unknown> = {}) {
  return {
    expectedArtifactSha256: current.artifactSha256,
    expectedDependencyDigest: current.dependencyDigest,
    validationRunId: current.validationRunId,
    format: 'PLAIN_TEXT',
    ...fields,
  };
}
async function exportUnsigned(candidateId: string, body: unknown, key?: string) {
  const result = await exportPost(candidateId, body, key);
  expect(result.status, result.text).toBe(200);
  expect(result.headers['etag']).toBeUndefined();
  expect(result.headers['cache-control']).toBe('no-store');
  return dataOf<UnsignedExport>(result);
}
const auditActions = async () =>
  (await prisma.auditEvent.findMany({ select: { action: true } })).map((row) => row.action);

/**
 * A READY_FOR_SIGNER world: a clean candidate of the DRAFTING prompt, a TECHNICAL_PASS run of the
 * current epoch and six confirmed PASS reviews of that epoch.
 */
async function readyWorld(options: WorldOptions = {}) {
  const p = await promptWorld(options);
  const candidate = await importCandidate(p.caseId, draft(p.prompt));
  const { run, view } = await validate(candidate, p.prompt);
  const gates = await passAll(candidate, view, p.caseSource.data.id);
  return { ...p, candidate, run, view, gates };
}

const gateStatuses = (current: Readiness) =>
  Object.fromEntries(current.gates.map((gate) => [gate.gate, gate.status]));
const ALL_PASS = Object.fromEntries(GATES.map((gate) => [gate, 'PASS']));

// ---------------------------------------------------------------------------------------------

describe('P4I getCandidateReadiness — derived from the current captured records, never stored', () => {
  it('R-09: a TECHNICAL_PASS run of E with full coverage and six confirmed PASS heads of E → READY_FOR_SIGNER — the server’s epoch, the counted run, the six heads, HUMAN_PENDING and PROHIBITED', async () => {
    const r = await readyWorld();
    expect(r.run.result).toBe('TECHNICAL_PASS');
    const current = await readiness(r.candidate.id);
    expect(current).toEqual({
      candidateId: r.candidate.id,
      artifactSha256: r.candidate.artifactSha256,
      dependencyDigest: r.view.dependencyDigest,
      rulesetVersion: RULESET,
      status: 'READY_FOR_SIGNER',
      technicalResult: 'TECHNICAL_PASS',
      validationRunId: r.run.id,
      gates: GATES.map((gate) => ({
        gate,
        status: 'PASS',
        assessmentId: r.gates[gate]?.id,
        reasonCodes: [],
      })),
      reasonCodes: [],
      signatureState: 'HUMAN_PENDING',
      externalAction: 'PROHIBITED',
      evaluatedAt: iso(t.clock.ms),
    });
    // The digest is exactly the P4D digest of the prompt's scope, and the run's.
    expect(current.dependencyDigest).toBe(r.run.dependencyDigest);
    expect(current.dependencyDigest).toBe(r.prompt.dependencyDigest);
  });

  it('R-01: an unknown or malformed candidate is 404; without a session 401 and nothing is returned', async () => {
    const r = await readyWorld();
    for (const id of [randomUUID(), 'not-a-uuid', r.prompt.id, r.run.id]) {
      expect(outcome(await client.get('getCandidateReadiness', readinessPath(id))), id).toEqual([
        404,
        'NOT_FOUND',
      ]);
    }
    const anonymous = await http(t.port, 'GET', `/api/v1${readinessPath(r.candidate.id)}`, {
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(anonymous.status).toBe(401);
    expect(anonymous.text).not.toContain(r.candidate.artifactSha256);
    expect(anonymous.headers['cache-control']).toBe('no-store');
  });

  it('R-27: reading writes nothing — repeated reads leave every row byte-identical (no audit event, idempotency record, row version or context revision); P1’s session activity touch is the only write', async () => {
    const r = await readyWorld();
    const tables = [...DIRECTORY_SUITE_TABLES, 'auth_sessions', 'users'];
    const caseBefore = await prisma.caseRecord.findUniqueOrThrow({ where: { id: r.caseId } });
    const before = await suiteDump(tables);
    const first = await readiness(r.candidate.id);
    for (let index = 0; index < 3; index += 1) {
      expect(await readiness(r.candidate.id)).toEqual(first);
    }
    expect(await suiteDump(tables)).toEqual(before);
    const caseAfter = await prisma.caseRecord.findUniqueOrThrow({ where: { id: r.caseId } });
    expect([caseAfter.rowVersion, caseAfter.contextRevision]).toEqual([
      caseBefore.rowVersion,
      caseBefore.contextRevision,
    ]);
    t.clock.advance(LAST_SEEN_WRITE_INTERVAL_MS + 1);
    const later = await readiness(r.candidate.id);
    expect(later.evaluatedAt).toBe(iso(t.clock.ms));
    expect({ ...later, evaluatedAt: first.evaluatedAt }).toEqual(first);
    const after = await suiteDump(tables);
    expect({ ...after, auth_sessions: [] }).toEqual({ ...before, auth_sessions: [] });
    // No readiness is stored anywhere: no table or column names it.
    const columns = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT CONCAT(TABLE_NAME, '.', COLUMN_NAME) AS name FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND (COLUMN_NAME LIKE '%ready%' OR COLUMN_NAME LIKE '%readiness%'
        OR TABLE_NAME LIKE '%ready%' OR TABLE_NAME LIKE '%readiness%' OR TABLE_NAME LIKE '%export%'
        OR COLUMN_NAME LIKE '%approved%')`;
    expect(columns).toEqual([]);
  });

  it('R-02: a superseded candidate is SUPERSEDED — reported as itself, never replaced by a newer candidate', async () => {
    const r = await readyWorld();
    const revision = immutable<NoticeCandidate>(
      await client.write('reviseCandidate', 'POST', `/candidates/${r.candidate.id}/revisions`, {
        ...draft(r.prompt, { subject: 'SYNTHETIC corrected subject' }),
        revisionReason: 'SYNTHETIC correction',
      }),
      201,
    );
    await supersedeCandidate(r.candidate.id);
    const current = await readiness(r.candidate.id);
    expect(current.status).toBe('SUPERSEDED');
    expect(current.candidateId).toBe(r.candidate.id);
    expect(current.artifactSha256).toBe(r.candidate.artifactSha256);
    expect(current.reasonCodes).toEqual(['CANDIDATE_SUPERSEDED']);
    expect(JSON.stringify(current)).not.toContain(revision.id);
    // The revision has its own readiness, from its own records only.
    expect((await readiness(revision.id)).status).toBe('UNVALIDATED');
  });

  it('R-03 / R-04 / R-20: no run → UNVALIDATED; a context change moves the digest: the run and every review of the old epoch are stale → STALE_REVALIDATION_REQUIRED', async () => {
    const p = await promptWorld();
    const candidate = await importCandidate(p.caseId, draft(p.prompt));
    const none = await readiness(candidate.id);
    expect(none).toMatchObject({
      status: 'UNVALIDATED',
      technicalResult: null,
      validationRunId: null,
      reasonCodes: ['VALIDATION_MISSING', ...GATES.map((gate) => `${gate}_UNASSESSED`)],
    });
    const { run, view } = await validate(candidate, p.prompt);
    await passAll(candidate, view, p.caseSource.data.id);
    expect((await readiness(candidate.id)).status).toBe('READY_FOR_SIGNER');
    // A new link changes the case context and so the current digest.
    const extra = await createSource({
      agencyId: p.w.agency.data.id,
      title: 'SYNTHETIC later linked source',
    });
    await linkSource(p.caseId, extra.id);
    const stale = await readiness(candidate.id);
    expect(stale.dependencyDigest).not.toBe(run.dependencyDigest);
    expect(stale).toMatchObject({
      status: 'STALE_REVALIDATION_REQUIRED',
      technicalResult: null,
      validationRunId: null,
      reasonCodes: [
        'VALIDATION_STALE',
        ...GATES.map((gate) => `${gate}_UNASSESSED`),
        'ASSESSMENT_STALE',
      ],
    });
    for (const gate of stale.gates) {
      expect(gate).toEqual({
        gate: gate.gate,
        status: 'UNASSESSED',
        assessmentId: null,
        reasonCodes: ['GATE_UNASSESSED', 'ASSESSMENT_STALE'],
      });
    }
  });

  it('R-05 / R-06 / R-07: a BLOCKED run → BLOCKED; an ERROR run → BLOCKED with VALIDATION_ERROR; a REVIEW_REQUIRED run → REVIEW_REQUIRED — no assessment turns it into a pass (D-6 stays deferred)', async () => {
    const p = await promptWorld();
    const blocked = await importCandidate(
      p.caseId,
      draft(p.prompt, {
        bodyText: `SYNTHETIC text [REVIEWED DECLARATION TEXT REQUIRED]\n${SLOT}\n`,
      }),
    );
    const blockedRun = await validate(blocked, p.prompt);
    expect(blockedRun.run.result).toBe('BLOCKED');
    await passAll(blocked, blockedRun.view, p.caseSource.data.id);
    expect(await readiness(blocked.id)).toMatchObject({
      status: 'BLOCKED',
      technicalResult: 'BLOCKED',
      validationRunId: blockedRun.run.id,
      reasonCodes: ['VALIDATION_BLOCKED'],
    });

    const errored = await importCandidate(p.caseId, draft(p.prompt));
    validationObserver.failRule = 'ENVELOPE.SENDER';
    const errorRun = await validate(errored, p.prompt);
    validationObserver.failRule = null;
    expect(errorRun.run.result).toBe('ERROR');
    await passAll(errored, errorRun.view, p.caseSource.data.id);
    expect(await readiness(errored.id)).toMatchObject({
      status: 'BLOCKED',
      technicalResult: 'ERROR',
      reasonCodes: ['VALIDATION_ERROR', 'VALIDATION_COVERAGE_INCOMPLETE'],
    });

    const review = await importCandidate(
      p.caseId,
      draft(p.prompt, { bodyText: `Please find attached the licence.\n${SLOT}\n` }),
    );
    const reviewRun = await validate(review, p.prompt);
    expect(reviewRun.run.result).toBe('REVIEW_REQUIRED');
    await passAll(review, reviewRun.view, p.caseSource.data.id);
    expect(await readiness(review.id)).toMatchObject({
      status: 'REVIEW_REQUIRED',
      technicalResult: 'REVIEW_REQUIRED',
      validationRunId: reviewRun.run.id,
      reasonCodes: ['VALIDATION_REVIEW_REQUIRED'],
    });
    expect(gateStatuses(await readiness(review.id))).toEqual(ALL_PASS);
  });

  it('R-08: a TECHNICAL_PASS whose stored coverage lists a rule not executed, or lacks a required rule, never counts as a full pass (synthetic corruption of the stored run)', async () => {
    const r = await readyWorld();
    const coverage = r.run.coverageManifest;
    await prisma.$executeRaw`UPDATE validation_runs SET coverage_manifest = ${JSON.stringify({
      ...coverage,
      executedRuleIds: coverage.executedRuleIds.slice(1),
    })} WHERE id = ${r.run.id}`;
    expect(await readiness(r.candidate.id)).toMatchObject({
      status: 'REVIEW_REQUIRED',
      technicalResult: 'TECHNICAL_PASS',
      reasonCodes: ['VALIDATION_COVERAGE_INCOMPLETE'],
    });
    await prisma.$executeRaw`UPDATE validation_runs SET coverage_manifest = ${JSON.stringify({
      ...coverage,
      notExecutedRuleIds: ['ENVELOPE.REPLY_RECIPIENT'],
    })} WHERE id = ${r.run.id}`;
    expect((await readiness(r.candidate.id)).reasonCodes).toEqual([
      'VALIDATION_COVERAGE_INCOMPLETE',
    ]);
  });

  it('R-10…R-14: five PASS gates and one HOLD, BLOCKED, MISSING, CONFLICT or UNASSESSED are never READY — nothing compensates', async () => {
    const p = await promptWorld();
    const cases: Array<[Gate, Record<string, unknown> | null, string, string[]]> = [
      ['G2', { result: 'HOLD' }, 'REVIEW_REQUIRED', ['G2_HOLD']],
      ['G3', { result: 'BLOCKED' }, 'BLOCKED', ['G3_BLOCKED']],
      ['G4', { result: 'MISSING' }, 'REVIEW_REQUIRED', ['G4_MISSING']],
      ['G5', { result: 'CONFLICT' }, 'REVIEW_REQUIRED', ['G5_CONFLICT']],
      ['G6', null, 'REVIEW_REQUIRED', ['G6_UNASSESSED']],
    ];
    for (const [gate, overrides, status, reasonCodes] of cases) {
      const candidate = await importCandidate(p.caseId, draft(p.prompt));
      const { view } = await validate(candidate, p.prompt);
      await passAll(candidate, view, p.caseSource.data.id, { [gate]: overrides });
      const current = await readiness(candidate.id);
      expect([current.status, current.reasonCodes], gate).toEqual([status, reasonCodes]);
      expect(current.technicalResult).toBe('TECHNICAL_PASS');
      expect(gateStatuses(current)).toEqual({
        ...ALL_PASS,
        [gate]: overrides === null ? 'UNASSESSED' : overrides['result'],
      });
    }
  });

  it('R-15 / R-16 / R-18: two current heads of one gate → CONFLICT, never the latest PASS (a successor of one head leaves the other standing); an explicit successor replaces its predecessor — a HOLD successor stops a PASS, a confirmed successor of an unadopted PASS counts', async () => {
    const r = await readyWorld();
    const second = await assess(
      r.candidate.id,
      pass(r.candidate, r.view, 'G3', r.caseSource.data.id, { performerLabel: 'SYNTHETIC second' }),
    );
    let current = await readiness(r.candidate.id);
    expect(current.status).toBe('REVIEW_REQUIRED');
    expect(current.gates[2]).toEqual({
      gate: 'G3',
      status: 'CONFLICT',
      assessmentId: null,
      reasonCodes: ['GATE_CONFLICT', 'GATE_HEADS_UNRECONCILED'],
    });
    expect(current.reasonCodes).toEqual(['G3_CONFLICT', 'GATE_HEADS_UNRECONCILED']);
    // A successor of one chain's head replaces only that head: the other chain still stands.
    await assess(
      r.candidate.id,
      pass(r.candidate, r.view, 'G3', r.caseSource.data.id, { supersedesAssessmentId: second.id }),
    );
    current = await readiness(r.candidate.id);
    expect(current.gates[2]?.status).toBe('CONFLICT');
    // R-16: a HOLD successor of a PASS head stops it (the predecessor PASS never slips through).
    const hold = await assess(
      r.candidate.id,
      pass(r.candidate, r.view, 'G5', r.caseSource.data.id, {
        supersedesAssessmentId: r.gates.G5?.id,
        result: 'HOLD',
      }),
    );
    current = await readiness(r.candidate.id);
    expect(current.gates[4]).toEqual({
      gate: 'G5',
      status: 'HOLD',
      assessmentId: hold.id,
      reasonCodes: ['GATE_HOLD'],
    });

    // R-18: a candidate whose G2 PASS was recorded but not adopted for it.
    const notAdopted = await importCandidate(r.caseId, draft(r.prompt));
    const { view } = await validate(notAdopted, r.prompt);
    const recorded = await passAll(notAdopted, view, r.caseSource.data.id, {
      G2: { scopeState: 'RECORDED_NOT_ADOPTED' },
    });
    const state = await readiness(notAdopted.id);
    expect(state.status).toBe('REVIEW_REQUIRED');
    expect(state.reasonCodes).toEqual(['G2_HOLD', 'SCOPE_NOT_CONFIRMED']);
    expect(state.gates[1]).toEqual({
      gate: 'G2',
      status: 'HOLD',
      assessmentId: recorded.G2?.id,
      reasonCodes: ['GATE_HOLD', 'SCOPE_NOT_CONFIRMED'],
    });
    // R-16: its explicit, confirmed successor replaces it.
    const confirmed = await assess(
      notAdopted.id,
      pass(notAdopted, view, 'G2', r.caseSource.data.id, {
        supersedesAssessmentId: recorded.G2?.id,
      }),
    );
    const after = await readiness(notAdopted.id);
    expect(after.status).toBe('READY_FOR_SIGNER');
    expect(after.gates[1]).toEqual({
      gate: 'G2',
      status: 'PASS',
      assessmentId: confirmed.id,
      reasonCodes: [],
    });
  });

  it('R-17: a G1 review of an earlier epoch with G2–G6 of the current epoch → STALE_REVALIDATION_REQUIRED; G1 is never mixed in from another epoch', async () => {
    const p = await promptWorld();
    const candidate = await importCandidate(p.caseId, draft(p.prompt));
    const first = await validate(candidate, p.prompt);
    await assess(candidate.id, pass(candidate, first.view, 'G1', p.caseSource.data.id));
    const extra = await createSource({
      agencyId: p.w.agency.data.id,
      title: 'SYNTHETIC later linked source',
    });
    await linkSource(p.caseId, extra.id);
    const second = await validate(candidate, p.prompt);
    expect(second.view.dependencyDigest).not.toBe(first.view.dependencyDigest);
    // The context changed after the prompt: the new run reports the drift (REVIEW_REQUIRED).
    expect(second.run.result).toBe('REVIEW_REQUIRED');
    await passAll(candidate, second.view, p.caseSource.data.id, { G1: null });
    const current = await readiness(candidate.id);
    expect(current.status).toBe('STALE_REVALIDATION_REQUIRED');
    expect(current.gates[0]).toEqual({
      gate: 'G1',
      status: 'UNASSESSED',
      assessmentId: null,
      reasonCodes: ['GATE_UNASSESSED', 'ASSESSMENT_STALE'],
    });
    expect(current.reasonCodes).toEqual([
      'VALIDATION_REVIEW_REQUIRED',
      'G1_UNASSESSED',
      'ASSESSMENT_STALE',
    ]);
    expect(gateStatuses(current)).toEqual({ ...ALL_PASS, G1: 'UNASSESSED' });
  });

  it('R-19: another candidate’s assessments never count, even of the same artifact in the same case', async () => {
    const r = await readyWorld();
    const twin = await importCandidate(r.caseId, draft(r.prompt));
    expect(twin.artifactSha256).toBe(r.candidate.artifactSha256);
    await validate(twin, r.prompt);
    const current = await readiness(twin.id);
    expect(current.status).toBe('REVIEW_REQUIRED');
    expect(current.reasonCodes).toEqual(GATES.map((gate) => `${gate}_UNASSESSED`));
    expect((await readiness(r.candidate.id)).status).toBe('READY_FOR_SIGNER');
  });

  it('R-21 / R-22: a body without exactly one pending slot and a PREPARATION prompt’s candidate are BLOCKED, whatever the reviews', async () => {
    const p = await promptWorld();
    const twoSlots = await importCandidate(
      p.caseId,
      draft(p.prompt, { bodyText: `SYNTHETIC ${SLOT}\n${SLOT}\n` }),
    );
    const { view } = await validate(twoSlots, p.prompt);
    await passAll(twoSlots, view, p.caseSource.data.id);
    const slotted = await readiness(twoSlots.id);
    expect(slotted.status).toBe('BLOCKED');
    expect(slotted.reasonCodes.slice(0, 2)).toEqual([
      'SIGNATURE_SLOT_INVALID',
      'VALIDATION_BLOCKED',
    ]);
    const prep = await promptWorld({ label: 'P', generationMode: 'PREPARATION' });
    const prepared = await importCandidate(prep.caseId, draft(prep.prompt));
    const prepRun = await validate(prepared, prep.prompt);
    expect(prepRun.run.result).toBe('BLOCKED');
    await passAll(prepared, prepRun.view, prep.caseSource.data.id);
    const current = await readiness(prepared.id);
    expect(current.status).toBe('BLOCKED');
    expect(current.reasonCodes.slice(0, 2)).toEqual(['PREPARATION_MODE', 'VALIDATION_BLOCKED']);
  });

  it('R-23 / R-24: a G1 review before a timestamp boundary that is reached later is stale — with an unchanged digest; a review after the boundary satisfies it', async () => {
    const effective = t.clock.ms + 10 * MINUTE;
    const r = await readyWorld({
      beforePrompt: async (w, a) => {
        await recordEvent(a.mandate.data.id, w.source.id, { effectiveAt: iso(effective) });
      },
    });
    const before = await readiness(r.candidate.id);
    expect(before.status).toBe('READY_FOR_SIGNER');
    t.clock.advance(20 * MINUTE);
    const after = await readiness(r.candidate.id);
    expect(after.dependencyDigest).toBe(before.dependencyDigest);
    expect(after.status).toBe('STALE_REVALIDATION_REQUIRED');
    expect(after.reasonCodes).toEqual(['G1_UNASSESSED', 'G1_TEMPORAL_REVIEW_STALE']);
    expect(after.gates[0]).toEqual({
      gate: 'G1',
      status: 'UNASSESSED',
      assessmentId: r.gates.G1?.id,
      reasonCodes: ['GATE_UNASSESSED', 'G1_TEMPORAL_REVIEW_STALE'],
    });
    // A new G1 review after the boundary (its actual time as supplied) counts again.
    const renewed = await assess(
      r.candidate.id,
      pass(r.candidate, r.view, 'G1', r.caseSource.data.id, {
        supersedesAssessmentId: r.gates.G1?.id,
        assessedAt: iso(effective + MINUTE),
      }),
    );
    const again = await readiness(r.candidate.id);
    expect(again.status).toBe('READY_FOR_SIGNER');
    expect(again.gates[0]?.assessmentId).toBe(renewed.id);
  });

  it('temporal negative controls: a missing G1 review time is never replaced by the recording time; a date-only boundary on the review date is ambiguous (REVIEW_REQUIRED); a future effective date is not assumed effective', async () => {
    const effective = t.clock.ms - HOUR;
    const unknown = await promptWorld({
      beforePrompt: async (w, a) => {
        await recordEvent(a.mandate.data.id, w.source.id, { effectiveAt: iso(effective) });
      },
    });
    const candidate = await importCandidate(unknown.caseId, draft(unknown.prompt));
    const { view } = await validate(candidate, unknown.prompt);
    await passAll(candidate, view, unknown.caseSource.data.id, { G1: { assessedAt: null } });
    expect(await readiness(candidate.id)).toMatchObject({
      status: 'REVIEW_REQUIRED',
      reasonCodes: ['G1_HOLD', 'G1_REVIEW_TIME_UNKNOWN'],
    });
    // The recorded instant (createdAt, after the boundary) is not a review time.
    const stored = await prisma.candidateAssessment.findFirstOrThrow({
      where: { candidateId: candidate.id, gate: 'G1' },
    });
    expect(stored.assessedAt).toBeNull();
    expect(stored.createdAt.getTime()).toBeGreaterThan(effective);

    // The TestClock's date is 2026-09-23: a boundary on that date is possibly reached now.
    const today = iso(t.clock.ms).slice(0, 10);
    const sameDay = await promptWorld({
      label: 'D',
      beforePrompt: async (w, a) => {
        await recordEvent(a.mandate.data.id, w.source.id, { effectiveOn: today });
      },
    });
    const dated = await importCandidate(sameDay.caseId, draft(sameDay.prompt));
    const datedRun = await validate(dated, sameDay.prompt);
    await passAll(dated, datedRun.view, sameDay.caseSource.data.id, {
      G1: { assessedAt: iso(t.clock.ms) },
    });
    expect(await readiness(dated.id)).toMatchObject({
      status: 'REVIEW_REQUIRED',
      reasonCodes: ['G1_HOLD', 'TEMPORAL_BOUNDARY_AMBIGUOUS'],
    });

    const future = await readyWorld({ label: 'F', dates: { coverageEffectiveOn: '2026-12-01' } });
    expect(await readiness(future.candidate.id)).toMatchObject({
      status: 'REVIEW_REQUIRED',
      reasonCodes: ['AUTHORITY_EFFECTIVE_DATE_NOT_REACHED'],
    });
  });

  it('R-26: time alone never stales anything — a year later, with no captured boundary, the readiness is unchanged (no 30/60/90-day rule)', async () => {
    const r = await readyWorld();
    const before = await readiness(r.candidate.id);
    t.clock.advance(366 * 24 * HOUR);
    // The session expired meanwhile (P1); sign in again as another synthetic user.
    client = new DirectoryClient(t.port, await signIn(t.port, prisma), collected);
    const later = await readiness(r.candidate.id);
    expect({ ...later, evaluatedAt: before.evaluatedAt }).toEqual(before);
    expect(later.evaluatedAt).toBe(iso(t.clock.ms));
  });

  it('R-28: runs of the same epoch that disagree never yield the convenient PASS — TECHNICAL_RUN_CONFLICT, no counted run, BLOCKED by the ERROR among them', async () => {
    const p = await promptWorld();
    const candidate = await importCandidate(p.caseId, draft(p.prompt));
    validationObserver.failRule = 'ENVELOPE.SENDER';
    const errored = await validate(candidate, p.prompt);
    validationObserver.failRule = null;
    t.clock.advance(1000);
    const passed = await validate(candidate, p.prompt);
    expect([errored.run.result, passed.run.result]).toEqual(['ERROR', 'TECHNICAL_PASS']);
    expect(passed.run.dependencyDigest).toBe(errored.run.dependencyDigest);
    await passAll(candidate, passed.view, p.caseSource.data.id);
    expect(await readiness(candidate.id)).toMatchObject({
      status: 'BLOCKED',
      technicalResult: null,
      validationRunId: null,
      reasonCodes: ['VALIDATION_ERROR', 'TECHNICAL_RUN_CONFLICT'],
    });
  });

  it('context: an archived case is BLOCKED (CASE_ARCHIVED); a reply whose named parent binding was corrected has no readable scope — 409 BINDING_ALREADY_SUPERSEDED, no readiness derived', async () => {
    const r = await readyWorld();
    await archiveCase(r.caseId);
    const archived = await readiness(r.candidate.id);
    expect(archived.status).toBe('BLOCKED');
    expect(archived.reasonCodes[0]).toBe('CASE_ARCHIVED');

    const reply = await replyWorld('R');
    const candidate = await importCandidate(reply.caseId, draft(reply.replyPrompt));
    const correction = await bind(reply.caseId, {
      correspondenceId: reply.nmiMessage.id,
      eventType: 'NMI',
      supersedesBindingId: reply.nmi.id,
      interpretation: 'SYNTHETIC corrected binding',
    });
    const refused = await client.get('getCandidateReadiness', readinessPath(candidate.id));
    expect(outcome(refused)).toEqual([409, 'BINDING_ALREADY_SUPERSEDED']);
    expect(detailsOf(refused)).toEqual({ field: 'parentBindingId', successorId: correction.id });
  });

  it('G6 of a reply: the reviewer’s ask dispositions of exactly the prompt’s parent are required; LEGAL_REVIEW_REQUIRED holds it; a disposition is never fabricated', async () => {
    const reply = await replyWorld();
    const candidate = await importCandidate(reply.caseId, draft(reply.replyPrompt));
    const { view } = await validate(candidate, reply.replyPrompt);
    const disposition = {
      askId: 'Q1',
      questionText: 'SYNTHETIC Question 1: please provide the licence.',
      parentBindingId: reply.nmi.id,
      disposition: 'ANSWERED_SUPPORTED',
      sourceIds: [reply.linked.id],
    };
    const recorded = await passAll(candidate, view, reply.caseSource.data.id, { G6: null });
    const g6 = await assess(candidate.id, pass(candidate, view, 'G6', reply.caseSource.data.id));
    let current = await readiness(candidate.id);
    expect(current.gates[5]).toEqual({
      gate: 'G6',
      status: 'HOLD',
      assessmentId: g6.id,
      reasonCodes: ['GATE_HOLD', 'G6_ASK_DISPOSITIONS_MISSING'],
    });
    const legal = await assess(
      candidate.id,
      pass(candidate, view, 'G6', reply.caseSource.data.id, {
        supersedesAssessmentId: g6.id,
        askDispositions: [{ ...disposition, disposition: 'LEGAL_REVIEW_REQUIRED' }],
      }),
    );
    current = await readiness(candidate.id);
    expect(current.gates[5]?.reasonCodes).toEqual(['GATE_HOLD', 'G6_ASK_LEGAL_REVIEW_REQUIRED']);
    const answered = await assess(
      candidate.id,
      pass(candidate, view, 'G6', reply.caseSource.data.id, {
        supersedesAssessmentId: legal.id,
        askDispositions: [disposition],
      }),
    );
    current = await readiness(candidate.id);
    expect(current.gates[5]).toEqual({
      gate: 'G6',
      status: 'PASS',
      assessmentId: answered.id,
      reasonCodes: [],
    });
    expect(Object.keys(recorded)).toEqual(['G1', 'G2', 'G3', 'G4', 'G5']);
  });
});

describe('P4I exportUnsignedCandidate — the unsigned text handoff, only while READY_FOR_SIGNER', () => {
  it('E-05…E-13: exactly the stored subject, envelope and body (CRLF, trailing space, NFD kept), both hashes, HUMAN_PENDING, sendPerformed false and the readiness evaluated; one EXPORT_UNSIGNED audit event with no text; no business row changes', async () => {
    const r = await readyWorld();
    const current = await readiness(r.candidate.id);
    const before = await suiteDump(BUSINESS_TABLES);
    const auditBefore = await countRows(prisma, 'audit_events');
    t.clock.advance(1000);
    const handoff = await exportUnsigned(r.candidate.id, exportBody(current));
    const stored = await prisma.noticeCandidate.findUniqueOrThrow({
      where: { id: r.candidate.id },
    });
    expect(handoff).toEqual({
      candidateId: r.candidate.id,
      artifactSha256: stored.artifactSha256,
      bodySha256: stored.bodySha256,
      subject: stored.subject,
      envelope: stored.envelopeJson,
      bodyText: stored.bodyText,
      signatureState: 'HUMAN_PENDING',
      sendPerformed: false,
      readiness: { ...current, evaluatedAt: iso(t.clock.ms) },
      exportedAt: iso(t.clock.ms),
    });
    expect(handoff.bodyText).toBe(CLEAN_BODY);
    expect(handoff.bodyText).toContain(' \r\n');
    expect(handoff.bodyText).toContain('café');
    expect(handoff.subject).toBe('SYNTHETIC notice subject — café');
    expect(handoff.bodySha256).toBe(sha256(CLEAN_BODY));
    expect(handoff.bodyText.split(SLOT)).toHaveLength(2);
    expect(await suiteDump(BUSINESS_TABLES)).toEqual(before);
    expect(await countRows(prisma, 'audit_events')).toBe(auditBefore + 1);
    // The export's one audit event is exactly EXPORT_UNSIGNED — never SIGNED, SENT or SUBMITTED.
    const candidateEvents = await prisma.auditEvent.findMany({
      where: { entityType: 'NoticeCandidate', entityId: r.candidate.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(candidateEvents.map((row) => row.action)).toEqual([
      'CANDIDATE_IMPORTED',
      'EXPORT_UNSIGNED',
    ]);
    const event = candidateEvents[1] as (typeof candidateEvents)[number];
    expect(event).toMatchObject({
      entityType: 'NoticeCandidate',
      entityId: r.candidate.id,
      actorUserId: client.session.userId,
    });
    expect(event.afterRedacted).toEqual({
      candidateId: r.candidate.id,
      caseId: r.caseId,
      artifactSha256: stored.artifactSha256,
      bodySha256: stored.bodySha256,
      dependencyDigest: current.dependencyDigest,
      rulesetVersion: RULESET,
      validationRunId: r.run.id,
      readinessStatus: 'READY_FOR_SIGNER',
      gateAssessmentIds: Object.fromEntries(GATES.map((gate) => [gate, r.gates[gate]?.id])),
      format: 'PLAIN_TEXT',
      signatureState: 'HUMAN_PENDING',
      sendPerformed: false,
      externalAction: 'PROHIBITED',
      exportedAt: iso(t.clock.ms),
      subject: { redacted: true, codePoints: Array.from(stored.subject).length },
      bodyText: { redacted: true, codePoints: Array.from(stored.bodyText).length },
    });
    // Neither the export's audit event nor its idempotency record keeps any text or address.
    const exportRecords = JSON.stringify([
      event,
      await prisma.idempotencyRecord.findMany({
        where: { operationId: 'exportUnsignedCandidate' },
      }),
    ]);
    expect(exportRecords).not.toContain('SYNTHETIC notice text for human review');
    expect(exportRecords).not.toContain('SYNTHETIC notice subject');
    expect(exportRecords).not.toContain(SENDER);
    expect(exportRecords).not.toContain(PLATFORM);
    // No signed, sent, submitted or AS_SENT state or record exists anywhere.
    expect(
      (await auditActions()).filter((action) => /(^|_)SIGNED|_SENT|SUBMITTED|ADOPTED/.test(action)),
    ).toEqual([]);
    expect(await countRows(prisma, 'correspondence_bindings')).toBe(0);
    expect(stored.signatureState).toBe('HUMAN_PENDING');
  });

  it('E-01…E-04: not READY is 409 CANDIDATE_NOT_READY with the status and reasons; another artifact 412 ARTIFACT_CHANGED; another digest 412 CONTEXT_CHANGED; another run 412 VALIDATION_RUN_CHANGED — nothing is released, written or kept', async () => {
    const r = await readyWorld();
    const current = await readiness(r.candidate.id);
    const before = await suiteDump();
    const refusals: Array<[Record<string, unknown>, number, string, Record<string, unknown>]> = [
      [
        { expectedArtifactSha256: 'a'.repeat(64) },
        412,
        'ARTIFACT_CHANGED',
        { field: 'expectedArtifactSha256' },
      ],
      [
        { expectedDependencyDigest: 'b'.repeat(64) },
        412,
        'CONTEXT_CHANGED',
        { field: 'expectedDependencyDigest' },
      ],
      [
        { validationRunId: randomUUID() },
        412,
        'VALIDATION_RUN_CHANGED',
        { field: 'validationRunId' },
      ],
    ];
    for (const [fields, status, errorCode, details] of refusals) {
      const key = newKey();
      const refused = await exportPost(r.candidate.id, exportBody(current, fields), key);
      expect(outcome(refused), errorCode).toEqual([status, errorCode]);
      expect(detailsOf(refused)).toEqual(details);
      expect(refused.text).not.toContain('SYNTHETIC notice text');
      expect(refused.headers['cache-control']).toBe('no-store');
      expect(await prisma.idempotencyRecord.count({ where: { idempotencyKey: key } })).toBe(0);
    }
    expect(await suiteDump()).toEqual(before);

    const held = await importCandidate(r.caseId, draft(r.prompt));
    const { view } = await validate(held, r.prompt);
    await passAll(held, view, r.caseSource.data.id, { G4: { result: 'HOLD' } });
    const heldReadiness = await readiness(held.id);
    const notReady = await exportPost(held.id, exportBody(heldReadiness));
    expect(outcome(notReady)).toEqual([409, 'CANDIDATE_NOT_READY']);
    expect(detailsOf(notReady)).toEqual({ status: 'REVIEW_REQUIRED', reasonCodes: ['G4_HOLD'] });
    expect(notReady.text).not.toContain('SYNTHETIC notice text');
    expect(await auditActions()).not.toContain('EXPORT_UNSIGNED');
    // UNVALIDATED: no run, so no run can be named.
    const bare = await importCandidate(r.caseId, draft(r.prompt));
    const unvalidated = await exportPost(
      bare.id,
      exportBody(await readiness(bare.id), { validationRunId: r.run.id }),
    );
    expect(outcome(unvalidated)).toEqual([409, 'CANDIDATE_NOT_READY']);
    expect(detailsOf(unvalidated)['status']).toBe('UNVALIDATED');
  });

  it('request rules: the contract body only (422: every field required, PLAIN_TEXT only, no unknown field), an Idempotency-Key (400), no If-Match; an unknown or malformed candidate 404; an archived case 409 CANDIDATE_NOT_READY (CASE_ARCHIVED)', async () => {
    const r = await readyWorld();
    const current = await readiness(r.candidate.id);
    const body = exportBody(current);
    const invalid: unknown[] = [
      {},
      { ...body, format: 'HTML' },
      { ...body, format: 'EML' },
      { ...body, signedBy: 'SYNTHETIC' },
      { ...body, sendPerformed: true },
      { ...body, validationRunId: null },
      { ...body, expectedArtifactSha256: 'A'.repeat(64) },
    ];
    for (const value of invalid) {
      expect(outcome(await exportPost(r.candidate.id, value)), JSON.stringify(value)).toEqual([
        422,
        'VALIDATION_FAILED',
      ]);
    }
    expect(outcome(await exportPost(r.candidate.id, body, null))).toEqual([
      400,
      'IDEMPOTENCY_KEY_REQUIRED',
    ]);
    for (const id of [randomUUID(), 'not-a-uuid', r.prompt.id]) {
      expect(outcome(await exportPost(id, body)), id).toEqual([404, 'NOT_FOUND']);
    }
    await archiveCase(r.caseId);
    // Archiving moves the digest: the caller's earlier read is 412; a fresh read is not ready.
    expect(outcome(await exportPost(r.candidate.id, body))).toEqual([412, 'CONTEXT_CHANGED']);
    const fresh = await readiness(r.candidate.id);
    const archived = await exportPost(
      r.candidate.id,
      exportBody(fresh, { validationRunId: r.run.id }),
    );
    expect(outcome(archived)).toEqual([409, 'CANDIDATE_NOT_READY']);
    expect(detailsOf(archived)).toMatchObject({ status: 'BLOCKED' });
    expect((detailsOf(archived)['reasonCodes'] as string[])[0]).toBe('CASE_ARCHIVED');
    expect(await auditActions()).not.toContain('EXPORT_UNSIGNED');
  });

  it('E-14 / E-15: the same key and body replay the exact historical response while still READY (no second audit event, no copy of the text kept); the same key with another body is 409 IDEMPOTENCY_CONFLICT', async () => {
    const r = await readyWorld();
    const current = await readiness(r.candidate.id);
    const key = newKey();
    const first = await exportUnsigned(r.candidate.id, exportBody(current), key);
    t.clock.advance(5 * MINUTE);
    const replayed = await exportUnsigned(r.candidate.id, exportBody(current), key);
    expect(replayed).toEqual(first);
    expect((await auditActions()).filter((action) => action === 'EXPORT_UNSIGNED')).toHaveLength(1);
    const record = await prisma.idempotencyRecord.findFirstOrThrow({
      where: { idempotencyKey: key },
    });
    expect(record.responseJson).toEqual({
      meta: expect.objectContaining({ affectedResources: [] }),
      kept: { readiness: first.readiness, exportedAt: first.exportedAt },
    });
    const kept = JSON.stringify(record.responseJson);
    expect(kept).not.toContain('SYNTHETIC notice text');
    expect(kept).not.toContain('SYNTHETIC notice subject');
    expect(kept).not.toContain(SENDER);
    const conflict = await exportPost(
      r.candidate.id,
      exportBody(current, { validationRunId: randomUUID() }),
      key,
    );
    expect(outcome(conflict)).toEqual([409, 'IDEMPOTENCY_CONFLICT']);
    // A new key is a new export (each is its own audited handoff).
    await exportUnsigned(r.candidate.id, exportBody(await readiness(r.candidate.id)));
    expect((await auditActions()).filter((action) => action === 'EXPORT_UNSIGNED')).toHaveLength(2);
  });

  it('§42 / E-16 / E-18: an old export never releases its body once the candidate is no longer ready — a replay after a new authority event returns the present refusal; the first export and its audit stay historical', async () => {
    const r = await readyWorld();
    const current = await readiness(r.candidate.id);
    const key = newKey();
    const first = await exportUnsigned(r.candidate.id, exportBody(current), key);
    await recordEvent(r.a.mandate.data.id, r.w.source.id, { eventType: 'REVOCATION' });
    const replay = await exportPost(r.candidate.id, exportBody(current), key);
    expect(outcome(replay)).toEqual([412, 'CONTEXT_CHANGED']);
    expect(replay.text).not.toContain('SYNTHETIC notice text');
    expect(replay.text).not.toContain(first.bodySha256);
    expect((await readiness(r.candidate.id)).status).toBe('STALE_REVALIDATION_REQUIRED');
    // The completed record and the one audit event are unchanged history.
    const record = await prisma.idempotencyRecord.findFirstOrThrow({
      where: { idempotencyKey: key },
    });
    expect(record.state).toBe('COMPLETED');
    expect((await auditActions()).filter((action) => action === 'EXPORT_UNSIGNED')).toHaveLength(1);
  });

  it('E-16 (time) / E-17: a replay after a temporal boundary passes (digest unchanged) or after the candidate is superseded returns 409 CANDIDATE_NOT_READY and releases nothing', async () => {
    const effective = t.clock.ms + 10 * MINUTE;
    const r = await readyWorld({
      beforePrompt: async (w, a) => {
        await recordEvent(a.mandate.data.id, w.source.id, { effectiveAt: iso(effective) });
      },
    });
    const current = await readiness(r.candidate.id);
    const key = newKey();
    await exportUnsigned(r.candidate.id, exportBody(current), key);
    t.clock.advance(20 * MINUTE);
    const temporal = await exportPost(r.candidate.id, exportBody(current), key);
    expect(outcome(temporal)).toEqual([409, 'CANDIDATE_NOT_READY']);
    expect(detailsOf(temporal)).toEqual({
      status: 'STALE_REVALIDATION_REQUIRED',
      reasonCodes: ['G1_UNASSESSED', 'G1_TEMPORAL_REVIEW_STALE'],
    });
    expect(temporal.text).not.toContain('SYNTHETIC notice text');

    const s = await readyWorld({ label: 'S' });
    const ready = await readiness(s.candidate.id);
    const sKey = newKey();
    await exportUnsigned(s.candidate.id, exportBody(ready), sKey);
    await supersedeCandidate(s.candidate.id);
    const superseded = await exportPost(s.candidate.id, exportBody(ready), sKey);
    expect(outcome(superseded)).toEqual([409, 'CANDIDATE_NOT_READY']);
    expect(detailsOf(superseded)).toEqual({
      status: 'SUPERSEDED',
      reasonCodes: ['CANDIDATE_SUPERSEDED'],
    });
    expect(superseded.text).not.toContain('SYNTHETIC notice text');
  });

  it('a reply whose named parent binding was corrected cannot be exported: 412 CONTEXT_CHANGED, nothing released', async () => {
    const reply = await replyWorld();
    const candidate = await importCandidate(reply.caseId, draft(reply.replyPrompt));
    await bind(reply.caseId, {
      correspondenceId: reply.nmiMessage.id,
      eventType: 'NMI',
      supersedesBindingId: reply.nmi.id,
      interpretation: 'SYNTHETIC corrected binding',
    });
    const refused = await exportPost(candidate.id, {
      expectedArtifactSha256: candidate.artifactSha256,
      expectedDependencyDigest: 'c'.repeat(64),
      validationRunId: randomUUID(),
      format: 'PLAIN_TEXT',
    });
    expect(outcome(refused)).toEqual([412, 'CONTEXT_CHANGED']);
    expect(refused.text).not.toContain('SYNTHETIC notice text');
  });
});

describe('P4I consistency — the export re-evaluates in one short SERIALIZABLE transaction (§43)', () => {
  it('A / D: a context change committed after the case lock (a newer source revision, a new authority event) is seen by the export and refused 412; one attempted after the export read the records waits until the export committed', async () => {
    const r = await readyWorld();
    const current = await readiness(r.candidate.id);
    readinessObserver.hooks.afterCaseLock = async () => {
      await reviseSource(r.linked.id, {
        agencyId: r.w.agency.data.id,
        title: 'SYNTHETIC newer revision of the licence copy',
      });
    };
    const revised = await exportPost(r.candidate.id, exportBody(current));
    expect(outcome(revised)).toEqual([412, 'CONTEXT_CHANGED']);

    const d = await readyWorld({ label: 'D' });
    const dReady = await readiness(d.candidate.id);
    readinessObserver.hooks.afterCaseLock = async () => {
      await recordEvent(d.a.mandate.data.id, d.w.source.id);
    };
    const evented = await exportPost(d.candidate.id, exportBody(dReady));
    expect(outcome(evented)).toEqual([412, 'CONTEXT_CHANGED']);
    expect(await auditActions()).not.toContain('EXPORT_UNSIGNED');

    const e = await readyWorld({ label: 'E' });
    const eReady = await readiness(e.candidate.id);
    const eventKey = newKey();
    let event: Promise<HttpResult> | null = null;
    let eventsWhileHeld = -1;
    const eventsBefore = await countRows(prisma, 'authority_events');
    readinessObserver.hooks.beforeRecord = async () => {
      const mandate = await getMandate(e.a.mandate.data.id);
      event = client.write(
        'recordAuthorityEvent',
        'POST',
        `/mandates/${e.a.mandate.data.id}/events`,
        eventBody(e.w.source.id),
        { ifMatch: mandate.etag, key: eventKey },
      );
      await claimed(eventKey);
      eventsWhileHeld = await countRows(prisma, 'authority_events');
    };
    const handoff = await exportUnsigned(e.candidate.id, exportBody(eReady));
    if (event === null) throw new Error('the concurrent write did not start');
    const eventResult: HttpResult = await event;
    expect(eventResult.status, eventResult.text).toBe(201);
    expect(eventsWhileHeld).toBe(eventsBefore);
    expect(handoff.readiness.status).toBe('READY_FOR_SIGNER');
    expect((await readiness(e.candidate.id)).status).toBe('STALE_REVALIDATION_REQUIRED');
  });

  it('B: a successor assessment recorded before the export is re-evaluated (the old PASS head does not slip through); one attempted during the export waits for the case lock', async () => {
    const r = await readyWorld();
    const current = await readiness(r.candidate.id);
    await assess(
      r.candidate.id,
      pass(r.candidate, r.view, 'G2', r.caseSource.data.id, {
        supersedesAssessmentId: r.gates.G2?.id,
        result: 'HOLD',
        scopeState: 'RECORDED_NOT_ADOPTED',
      }),
    );
    const refused = await exportPost(r.candidate.id, exportBody(current));
    expect(outcome(refused)).toEqual([409, 'CANDIDATE_NOT_READY']);
    expect(detailsOf(refused)).toEqual({ status: 'REVIEW_REQUIRED', reasonCodes: ['G2_HOLD'] });

    const q = await readyWorld({ label: 'Q' });
    const qReady = await readiness(q.candidate.id);
    const captureKey = newKey();
    let captured: Promise<HttpResult> | null = null;
    readinessObserver.hooks.beforeRecord = async () => {
      captured = capturePost(
        q.candidate.id,
        pass(q.candidate, q.view, 'G2', q.caseSource.data.id, {
          supersedesAssessmentId: q.gates.G2?.id,
          result: 'HOLD',
        }),
        captureKey,
      );
      await claimed(captureKey);
      expect(
        await prisma.candidateAssessment.count({ where: { candidateId: q.candidate.id } }),
      ).toBe(6);
    };
    const handoff = await exportUnsigned(q.candidate.id, exportBody(qReady));
    if (captured === null) throw new Error('the concurrent capture did not start');
    const capturedResult: HttpResult = await captured;
    expect(capturedResult.status, capturedResult.text).toBe(201);
    expect(handoff.readiness.gates[1]?.assessmentId).toBe(q.gates.G2?.id);
    expect((await readiness(q.candidate.id)).gates[1]?.status).toBe('HOLD');
  });

  it('C: a candidate superseded before the export is never exported; a supersession attempted during the export waits for it, and a replay afterwards refuses', async () => {
    const r = await readyWorld();
    const current = await readiness(r.candidate.id);
    await supersedeCandidate(r.candidate.id);
    const refused = await exportPost(r.candidate.id, exportBody(current));
    expect(outcome(refused)).toEqual([409, 'CANDIDATE_NOT_READY']);
    expect(detailsOf(refused)['status']).toBe('SUPERSEDED');

    const q = await readyWorld({ label: 'Q' });
    const qReady = await readiness(q.candidate.id);
    const supersedeKey = newKey();
    let superseding: Promise<NoticeCandidate> | null = null;
    readinessObserver.hooks.beforeRecord = async () => {
      superseding = supersedeCandidate(q.candidate.id, supersedeKey);
      await claimed(supersedeKey);
      const row = await prisma.noticeCandidate.findUniqueOrThrow({ where: { id: q.candidate.id } });
      expect(row.supersededAt).toBeNull();
    };
    const key = newKey();
    const handoff = await exportUnsigned(q.candidate.id, exportBody(qReady), key);
    if (superseding === null) throw new Error('the concurrent supersession did not start');
    await superseding;
    expect(handoff.readiness.status).toBe('READY_FOR_SIGNER');
    const replay = await exportPost(q.candidate.id, exportBody(qReady), key);
    expect(outcome(replay)).toEqual([409, 'CANDIDATE_NOT_READY']);
    expect(detailsOf(replay)['status']).toBe('SUPERSEDED');
  });

  it('a failed audit rolls the export back: nothing is kept for the key, and a retry with it is a new export', async () => {
    const r = await readyWorld();
    const current = await readiness(r.candidate.id);
    const key = newKey();
    auditWriter.armed = true;
    const failed = await exportPost(r.candidate.id, exportBody(current), key);
    expect(failed.status).toBe(500);
    expect(failed.text).not.toContain('SYNTHETIC notice text');
    expect(await prisma.idempotencyRecord.count({ where: { idempotencyKey: key } })).toBe(0);
    auditWriter.armed = false;
    const handoff = await exportUnsigned(r.candidate.id, exportBody(current), key);
    expect(handoff.bodyText).toBe(CLEAN_BODY);
  });
});

describe('P4I boundaries — no outbound call, no G7, the contract unchanged', () => {
  it('readiness and the export call nothing outside the application: no fetch and no connection beyond the loopback database and API', async () => {
    const r = await readyWorld();
    const connections: string[] = [];
    const originalConnect = net.Socket.prototype.connect;
    const connectSpy = vi.spyOn(net.Socket.prototype, 'connect').mockImplementation(function (
      this: net.Socket,
      ...args: unknown[]
    ) {
      connections.push(connectionTarget(args));
      return (originalConnect as (...rest: unknown[]) => net.Socket).apply(this, args);
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    let fetchCalls = -1;
    try {
      const current = await readiness(r.candidate.id);
      await exportUnsigned(r.candidate.id, exportBody(current));
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

  it('no signature, adoption, send, submission or G7 route exists; an export is not listed, read by id, updated or deleted', async () => {
    const r = await readyWorld();
    const before = await suiteDump();
    const base = `/candidates/${r.candidate.id}`;
    const paths: Array<['GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT', string]> = [
      ['POST', `${base}/readiness`],
      ['PATCH', `${base}/readiness`],
      ['GET', `${base}/unsigned-exports`],
      ['GET', `${base}/unsigned-exports/${randomUUID()}`],
      ['DELETE', `${base}/unsigned-exports/${randomUUID()}`],
      ['POST', `${base}/sign`],
      ['POST', `${base}/signature`],
      ['POST', `${base}/adopt`],
      ['POST', `${base}/send`],
      ['POST', `${base}/submit`],
      ['POST', `${base}/approve`],
      ['POST', `/cases/${r.caseId}/g7`],
      ['POST', `/cases/${r.caseId}/send`],
    ];
    for (const [method, target] of paths) {
      const response = await unrouted(method, target);
      expect([response.status, code(response)], `${method} ${target}`).toEqual([404, 'NOT_FOUND']);
    }
    expect(await suiteDump()).toEqual(before);
  });

  it('every collected response matches its operation: declared status, contract schema, no ETag, no-store; both P4I operations were exercised; the wire contract is unchanged', () => {
    const byId = new Map<string, (typeof operations)[number]>(
      operations.map((operation) => [operation.operationId, operation]),
    );
    const seen = new Set<string>();
    const forbiddenKey =
      /"(approved\w*|adopted\w*|signed\w*|authori[sz]ed\w*|verified\w*|infring\w*|legal\w*|eligib\w*|sent|submitted\w*|g7\w*)"\s*:/i;
    for (const { operationId, result } of collected) {
      const operation = byId.get(operationId);
      if (!operation) throw new Error(`unknown operation ${operationId}`);
      const label = `${operationId} ${result.status}`;
      if (result.status === Number(operation.success.status)) {
        seen.add(operationId);
        if ('schema' in operation.success) {
          const parsed = operation.success.schema.safeParse(result.json);
          expect(parsed.success, `${label} ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
        }
        if (['getCandidateReadiness', 'exportUnsignedCandidate'].includes(operationId)) {
          expect(result.headers['etag'], label).toBeUndefined();
          expect(result.text, label).not.toMatch(forbiddenKey);
        }
      } else {
        expect(operation.errors as readonly string[], label).toContain(String(result.status));
        expect(OperationErrorSchema.safeParse(result.json).success, label).toBe(true);
      }
      expect(result.headers['cache-control'], label).toBe('no-store');
    }
    for (const operationId of ['getCandidateReadiness', 'exportUnsignedCandidate']) {
      expect(seen.has(operationId), operationId).toBe(true);
    }
    expect(CONTRACT_BASELINE).toBe('TB-SCHEMA-API-v1.4.0');
    expect(operations).toHaveLength(145);
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
