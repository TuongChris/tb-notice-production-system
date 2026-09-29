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
  AuditEvent,
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
  ListAuditEventsResponseSchema,
  OperationErrorSchema,
  operations,
} from '../../packages/contracts/src/index.js';
import { LAST_SEEN_WRITE_INTERVAL_MS } from '../../apps/api/src/modules/auth/auth-config.js';
import {
  ALLOWED_ORIGIN,
  cookieHeader,
  http,
  insertUser,
  login,
  openTestPrisma,
  sessionTokenFrom,
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

/**
 * The export's consistency hooks, each run once: inside the export transaction, or inside a guarded
 * replay (R14-AUD-020: before its first read, after the request's instant, the claim and the replay
 * lookup; and after its input reads, before its evaluation instant).
 */
const readinessObserver = {
  hooks: {
    afterCaseLock: null as Hook | null,
    beforeRecord: null as Hook | null,
    beforeReplayRead: null as Hook | null,
    afterReplayInput: null as Hook | null,
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
  async beforeReplayRead(candidateId: string): Promise<void> {
    const hook = this.hooks.beforeReplayRead;
    this.hooks.beforeReplayRead = null;
    if (hook) await hook(candidateId);
  },
  async afterReplayInput(candidateId: string): Promise<void> {
    const hook = this.hooks.afterReplayInput;
    this.hooks.afterReplayInput = null;
    if (hook) await hook(candidateId);
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
  readinessObserver.hooks.beforeReplayRead = null;
  readinessObserver.hooks.afterReplayInput = null;
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

/**
 * A reply that can be READY_FOR_SIGNER: an NMI captured as full text and bound as the parent, a
 * prior transmission captured from a raw source of this subject and bound as sent, and an NMI_REPLY
 * DRAFTING prompt naming both; a clean candidate of it, its TECHNICAL_PASS run and five confirmed
 * PASS reviews G1–G5 of that epoch. G6 — and its ask dispositions — is left to the test.
 */
async function readyReplyWorld(label = 'A') {
  const p = await promptWorld({ label });
  const agencyId = p.w.agency.data.id;
  const nmiMessage = await capture(agencyId, {
    subject: 'SYNTHETIC we need more information',
    bodyText: 'SYNTHETIC Question 1: please provide the licence. Question 2: who owns the work?',
    fromAddress: 'synthetic-platform-review@example.invalid',
    replyToAddress: 'synthetic-reply-here@example.invalid',
  });
  const nmi = await bind(p.caseId, { correspondenceId: nmiMessage.id, eventType: 'NMI' });
  const rawSource = await createSource({
    agencyId,
    title: `SYNTHETIC ${label} raw message file`,
    scopeBindings: { legalSubjectIds: [p.w.subject.data.id] },
  });
  const sentMessage = await capture(agencyId, {
    direction: 'OUTBOUND',
    subject: 'SYNTHETIC copyright notice as sent (raw)',
    captureMode: 'RAW_SOURCE',
    rawSourceId: rawSource.id,
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
  const candidate = await importCandidate(p.caseId, draft(replyPrompt));
  const { run, view } = await validate(candidate, replyPrompt);
  expect(run.result).toBe('TECHNICAL_PASS');
  const gates = await passAll(candidate, view, p.caseSource.data.id, { G6: null });
  return { ...p, nmiMessage, nmi, sent, replyPrompt, candidate, run, view, gates };
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

  it('R-28: completed runs of the same epoch that disagree never yield the convenient PASS — TECHNICAL_RUN_CONFLICT, no counted run, even when the PASS is the latest (synthetic corruption of a stored run)', async () => {
    const r = await readyWorld();
    t.clock.advance(1000);
    const newer = await validate(r.candidate, r.prompt);
    expect([r.run.result, newer.run.result]).toEqual(['TECHNICAL_PASS', 'TECHNICAL_PASS']);
    expect(newer.run.dependencyDigest).toBe(r.run.dependencyDigest);
    expect((await readiness(r.candidate.id)).validationRunId).toBe(newer.run.id);
    // The older run, complete, as if it had recorded another outcome of the same epoch.
    await prisma.$executeRaw`UPDATE validation_runs SET result = 'BLOCKED' WHERE id = ${r.run.id}`;
    const blocked = await readiness(r.candidate.id);
    expect(blocked).toMatchObject({
      status: 'BLOCKED',
      technicalResult: null,
      validationRunId: null,
      reasonCodes: ['VALIDATION_BLOCKED', 'TECHNICAL_RUN_CONFLICT'],
    });
    await prisma.$executeRaw`UPDATE validation_runs SET result = 'REVIEW_REQUIRED' WHERE id = ${r.run.id}`;
    const review = await readiness(r.candidate.id);
    expect(review).toMatchObject({
      status: 'REVIEW_REQUIRED',
      technicalResult: null,
      validationRunId: null,
      reasonCodes: ['TECHNICAL_RUN_CONFLICT', 'VALIDATION_REVIEW_REQUIRED'],
    });
    expect(gateStatuses(review)).toEqual(ALL_PASS);
    // A further completed PASS does not outvote the disagreeing run.
    t.clock.advance(1000);
    await validate(r.candidate, r.prompt);
    expect((await readiness(r.candidate.id)).reasonCodes).toEqual([
      'TECHNICAL_RUN_CONFLICT',
      'VALIDATION_REVIEW_REQUIRED',
    ]);
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

describe('R14-AUD-015 — a run that did not complete is a diagnostic: the latest run of the epoch decides, an earlier ERROR poisons nothing', () => {
  const FAILED_RULE = 'ENVELOPE.SENDER';
  async function erroredRun(candidate: NoticeCandidate, prompt: PromptSnapshot) {
    validationObserver.failRule = FAILED_RULE;
    try {
      const recorded = await validate(candidate, prompt);
      expect(recorded.run.result).toBe('ERROR');
      expect(recorded.run.coverageManifest.notExecutedRuleIds).toEqual([FAILED_RULE]);
      return recorded;
    } finally {
      validationObserver.failRule = null;
    }
  }
  const ERROR_READINESS = {
    status: 'BLOCKED',
    technicalResult: 'ERROR',
    reasonCodes: ['VALIDATION_ERROR', 'VALIDATION_COVERAGE_INCOMPLETE'],
  };
  const getRun = async (id: string) => {
    const result = await client.get('getValidationRun', `/validation-runs/${id}`);
    expect(result.status, result.text).toBe(200);
    return dataOf<ValidationRun>(result);
  };
  const listRuns = async (candidateId: string) => {
    const result = await client.get(
      'listValidationRuns',
      `/candidates/${candidateId}/validation-runs`,
    );
    expect(result.status, result.text).toBe(200);
    return dataOf<{ items: ValidationRun[] }>(result).items;
  };
  /** A stored run and its issues exactly as recorded. */
  const storedRun = async (id: string) => ({
    run: await prisma.validationRun.findUniqueOrThrow({ where: { id } }),
    issues: await prisma.validationIssue.findMany({ where: { runId: id }, orderBy: { id: 'asc' } }),
  });

  it('ERROR → a completed TECHNICAL_PASS of the same epoch → READY_FOR_SIGNER and exported with the PASS; the ERROR run stays readable, byte-identical history', async () => {
    const p = await promptWorld();
    const candidate = await importCandidate(p.caseId, draft(p.prompt));
    const errored = await erroredRun(candidate, p.prompt);
    await passAll(candidate, errored.view, p.caseSource.data.id);
    // While the ERROR run is the latest, it is what counts.
    expect(await readiness(candidate.id)).toMatchObject({
      ...ERROR_READINESS,
      validationRunId: errored.run.id,
    });
    const history = await storedRun(errored.run.id);
    t.clock.advance(1000);
    const passed = await validate(candidate, p.prompt);
    expect(passed.run.result).toBe('TECHNICAL_PASS');
    expect(passed.run.dependencyDigest).toBe(errored.run.dependencyDigest);
    const current = await readiness(candidate.id);
    expect(current).toMatchObject({
      status: 'READY_FOR_SIGNER',
      technicalResult: 'TECHNICAL_PASS',
      validationRunId: passed.run.id,
      reasonCodes: [],
    });
    expect(gateStatuses(current)).toEqual(ALL_PASS);
    const handed = await exportUnsigned(candidate.id, exportBody(current));
    expect(handed.readiness).toMatchObject({
      status: 'READY_FOR_SIGNER',
      validationRunId: passed.run.id,
    });
    // A request naming the ERROR run is not the counted run.
    const named = await exportPost(
      candidate.id,
      exportBody(current, { validationRunId: errored.run.id }),
    );
    expect(outcome(named)).toEqual([412, 'VALIDATION_RUN_CHANGED']);
    // Both runs stay listed and readable exactly as recorded; nothing about the ERROR run changed.
    expect((await listRuns(candidate.id)).map((row) => [row.id, row.result])).toEqual([
      [passed.run.id, 'TECHNICAL_PASS'],
      [errored.run.id, 'ERROR'],
    ]);
    expect(await getRun(errored.run.id)).toEqual(errored.run);
    expect(await storedRun(errored.run.id)).toEqual(history);
  });

  it('PASS → a newer ERROR → BLOCKED: the ERROR counts, no older PASS is relied on — a fresh export is refused and a replay of an earlier export releases nothing; PASS → ERROR → PASS recovers, and the earlier request then names a run that no longer counts (412)', async () => {
    const r = await readyWorld();
    const first = await readiness(r.candidate.id);
    expect(first).toMatchObject({ status: 'READY_FOR_SIGNER', validationRunId: r.run.id });
    const key = newKey();
    await exportUnsigned(r.candidate.id, exportBody(first), key);
    t.clock.advance(1000);
    const errored = await erroredRun(r.candidate, r.prompt);
    expect(errored.run.dependencyDigest).toBe(r.run.dependencyDigest);
    const blocked = await readiness(r.candidate.id);
    expect(blocked).toMatchObject({ ...ERROR_READINESS, validationRunId: errored.run.id });
    expect(gateStatuses(blocked)).toEqual(ALL_PASS);

    const fresh = await exportPost(r.candidate.id, exportBody(first));
    expect(outcome(fresh)).toEqual([409, 'CANDIDATE_NOT_READY']);
    expect(detailsOf(fresh)).toEqual({
      status: 'BLOCKED',
      reasonCodes: ['VALIDATION_ERROR', 'VALIDATION_COVERAGE_INCOMPLETE'],
    });
    const before = { ...(await suiteDump()), auth_sessions: [] };
    const replay = await exportPost(r.candidate.id, exportBody(first), key);
    expect(outcome(replay)).toEqual([409, 'CANDIDATE_NOT_READY']);
    expect(detailsOf(replay)).toEqual(detailsOf(fresh));
    for (const text of ['SYNTHETIC notice text', 'SYNTHETIC notice subject']) {
      expect(replay.text).not.toContain(text);
    }
    expect({ ...(await suiteDump()), auth_sessions: [] }).toEqual(before);

    t.clock.advance(1000);
    const again = await validate(r.candidate, r.prompt);
    const recovered = await readiness(r.candidate.id);
    expect(recovered).toMatchObject({
      status: 'READY_FOR_SIGNER',
      technicalResult: 'TECHNICAL_PASS',
      validationRunId: again.run.id,
      reasonCodes: [],
    });
    const stale = await exportPost(r.candidate.id, exportBody(first), key);
    expect(outcome(stale)).toEqual([412, 'VALIDATION_RUN_CHANGED']);
    const handed = await exportUnsigned(r.candidate.id, exportBody(recovered));
    expect(handed.readiness.validationRunId).toBe(again.run.id);
    expect((await auditActions()).filter((action) => action === 'EXPORT_UNSIGNED')).toHaveLength(2);
  });

  it('a newer run with a required rule not executed is never READY, whatever came before it (synthetic corruption of a stored PASS); a later completed run recovers', async () => {
    const r = await readyWorld();
    t.clock.advance(1000);
    const newer = await validate(r.candidate, r.prompt);
    const coverage = newer.run.coverageManifest;
    await prisma.$executeRaw`UPDATE validation_runs SET coverage_manifest = ${JSON.stringify({
      ...coverage,
      executedRuleIds: coverage.executedRuleIds.filter((id) => id !== FAILED_RULE),
      notExecutedRuleIds: [FAILED_RULE],
    })} WHERE id = ${newer.run.id}`;
    const incomplete = await readiness(r.candidate.id);
    expect(incomplete).toMatchObject({
      status: 'REVIEW_REQUIRED',
      technicalResult: 'TECHNICAL_PASS',
      validationRunId: newer.run.id,
      reasonCodes: ['VALIDATION_COVERAGE_INCOMPLETE'],
    });
    const refused = await exportPost(r.candidate.id, exportBody(incomplete));
    expect(outcome(refused)).toEqual([409, 'CANDIDATE_NOT_READY']);
    t.clock.advance(1000);
    const completed = await validate(r.candidate, r.prompt);
    expect(await readiness(r.candidate.id)).toMatchObject({
      status: 'READY_FOR_SIGNER',
      validationRunId: completed.run.id,
    });
  });

  it('runs recorded at the same instant: the higher id is the latest (createdAt DESC, id DESC) — the run the history lists first is the one that counts', async () => {
    const p = await promptWorld();
    const candidate = await importCandidate(p.caseId, draft(p.prompt));
    const errored = await erroredRun(candidate, p.prompt);
    // The test clock has not moved: both runs are recorded at the same instant.
    const passed = await validate(candidate, p.prompt);
    expect(passed.run.createdAt).toBe(errored.run.createdAt);
    await passAll(candidate, passed.view, p.caseSource.data.id);
    const [listedFirst] = await listRuns(candidate.id);
    const latest = [errored.run, passed.run].sort((a, b) => (a.id < b.id ? 1 : -1))[0];
    expect(listedFirst?.id).toBe(latest?.id);
    const current = await readiness(candidate.id);
    expect(current.validationRunId).toBe(latest?.id);
    expect(current).toMatchObject(
      latest?.id === errored.run.id
        ? ERROR_READINESS
        : { status: 'READY_FOR_SIGNER', technicalResult: 'TECHNICAL_PASS', reasonCodes: [] },
    );
  });
});

type ReplyWorld = Awaited<ReturnType<typeof readyReplyWorld>>;
/** One ask disposition of the reply's parent (answered and supported unless overridden). */
const ask = (r: ReplyWorld, fields: Record<string, unknown> = {}) => ({
  askId: 'Q1',
  questionText: 'SYNTHETIC Question 1: please provide the licence.',
  parentBindingId: r.nmi.id,
  disposition: 'ANSWERED_SUPPORTED',
  answerLocator: 'SYNTHETIC second paragraph of the reply',
  sourceIds: [r.linked.id],
  ...fields,
});
const secondAsk = (r: ReplyWorld, fields: Record<string, unknown> = {}) =>
  ask(r, { askId: 'Q2', questionText: 'SYNTHETIC Question 2: who owns the work?', ...fields });
/** A confirmed G6 PASS of the reply's epoch with `askDispositions` (a successor of `previous`). */
const g6Pass = (r: ReplyWorld, askDispositions: unknown[], previous?: string) =>
  assess(
    r.candidate.id,
    pass(r.candidate, r.view, 'G6', r.caseSource.data.id, {
      askDispositions,
      ...(previous === undefined ? {} : { supersedesAssessmentId: previous }),
    }),
  );

describe('R14-AUD-016 — an NMI ask the G6 review records as unresolved holds G6: never READY, never exported', () => {
  it('REQUIRES_DOCUMENT, MISSING_FACT and LEGAL_REVIEW_REQUIRED — alone or beside answered asks — hold G6 with their reason: REVIEW_REQUIRED, five PASS gates never compensate, a fresh export is refused and releases nothing', async () => {
    const r = await readyReplyWorld();
    const cases: Array<[string, unknown[], string]> = [
      [
        'REQUIRES_DOCUMENT',
        [ask(r, { disposition: 'REQUIRES_DOCUMENT' })],
        'G6_ASK_REQUIRES_DOCUMENT',
      ],
      [
        'MISSING_FACT',
        [ask(r, { disposition: 'MISSING_FACT', sourceIds: [] })],
        'G6_ASK_MISSING_FACT',
      ],
      [
        'LEGAL_REVIEW_REQUIRED',
        [ask(r, { disposition: 'LEGAL_REVIEW_REQUIRED' })],
        'G6_ASK_LEGAL_REVIEW_REQUIRED',
      ],
      [
        'ANSWERED_SUPPORTED + REQUIRES_DOCUMENT',
        [ask(r), secondAsk(r, { disposition: 'REQUIRES_DOCUMENT' })],
        'G6_ASK_REQUIRES_DOCUMENT',
      ],
      [
        'ANSWERED_WITH_LIMITATION + MISSING_FACT',
        [
          ask(r, {
            disposition: 'ANSWERED_WITH_LIMITATION',
            unresolvedRemainder: 'SYNTHETIC the licence copy covers the first work only',
          }),
          secondAsk(r, { disposition: 'MISSING_FACT', sourceIds: [] }),
        ],
        'G6_ASK_MISSING_FACT',
      ],
    ];
    let previous: string | undefined;
    for (const [label, askDispositions, cause] of cases) {
      const g6 = await g6Pass(r, askDispositions, previous);
      previous = g6.id;
      // The capture stores the truthful record exactly: recording is not counting.
      expect(g6.result, label).toBe('PASS');
      expect(g6.askDispositions, label).toEqual(askDispositions);
      const current = await readiness(r.candidate.id);
      expect(current.gates[5], label).toEqual({
        gate: 'G6',
        status: 'HOLD',
        assessmentId: g6.id,
        reasonCodes: ['GATE_HOLD', cause],
      });
      expect([current.status, current.reasonCodes], label).toEqual([
        'REVIEW_REQUIRED',
        ['G6_HOLD', cause],
      ]);
      expect(gateStatuses(current), label).toEqual({ ...ALL_PASS, G6: 'HOLD' });
      expect([current.technicalResult, current.validationRunId], label).toEqual([
        'TECHNICAL_PASS',
        r.run.id,
      ]);
      const refused = await exportPost(r.candidate.id, exportBody(current));
      expect(outcome(refused), label).toEqual([409, 'CANDIDATE_NOT_READY']);
      expect(detailsOf(refused), label).toEqual({
        status: 'REVIEW_REQUIRED',
        reasonCodes: ['G6_HOLD', cause],
      });
      expect(refused.text).not.toContain('SYNTHETIC notice text');
    }
    expect(await auditActions()).not.toContain('EXPORT_UNSIGNED');
  });

  it('positive controls: ANSWERED_SUPPORTED, a genuinely limited answer (its remainder is never keyword-read) and a sourced NOT_APPLICABLE_WITH_REASON each count — READY_FOR_SIGNER when everything else passes', async () => {
    const r = await readyReplyWorld();
    const variants: Array<[string, unknown[]]> = [
      ['ANSWERED_SUPPORTED', [ask(r)]],
      [
        'ANSWERED_WITH_LIMITATION',
        [
          ask(r, {
            disposition: 'ANSWERED_WITH_LIMITATION',
            unresolvedRemainder:
              'SYNTHETIC the licence copy names the first work only; no document, fact or legal review is outstanding for this ask',
          }),
        ],
      ],
      [
        'NOT_APPLICABLE_WITH_REASON',
        [ask(r, { disposition: 'NOT_APPLICABLE_WITH_REASON', answerLocator: 'SYNTHETIC reason' })],
      ],
      [
        'all three',
        [
          ask(r),
          secondAsk(r, { disposition: 'ANSWERED_WITH_LIMITATION' }),
          ask(r, { askId: 'Q3', disposition: 'NOT_APPLICABLE_WITH_REASON' }),
        ],
      ],
    ];
    let previous: string | undefined;
    for (const [label, askDispositions] of variants) {
      const g6 = await g6Pass(r, askDispositions, previous);
      previous = g6.id;
      const current = await readiness(r.candidate.id);
      expect([current.status, current.reasonCodes], label).toEqual(['READY_FOR_SIGNER', []]);
      expect(current.gates[5], label).toEqual({
        gate: 'G6',
        status: 'PASS',
        assessmentId: g6.id,
        reasonCodes: [],
      });
    }
  });

  it('negative controls: no disposition holds G6; another parent (422 ASK_PARENT_MISMATCH), an ask twice (422 VALIDATION_FAILED) or a source outside the case (422) are refused at capture; a stored foreign, duplicate or unknown disposition never counts (BLOCKED)', async () => {
    const r = await readyReplyWorld();
    const none = await g6Pass(r, []);
    expect((await readiness(r.candidate.id)).gates[5]?.reasonCodes).toEqual([
      'GATE_HOLD',
      'G6_ASK_DISPOSITIONS_MISSING',
    ]);
    const q = await readyReplyWorld('Q');
    const before = await countRows(prisma, 'candidate_assessments');
    const refusals: Array<[unknown[], number, string]> = [
      [[ask(r, { parentBindingId: r.sent.id })], 422, 'ASK_PARENT_MISMATCH'],
      [
        [ask(r), ask(r, { questionText: 'SYNTHETIC the same ask again' })],
        422,
        'VALIDATION_FAILED',
      ],
      [[ask(r, { sourceIds: [q.linked.id] })], 422, 'CROSS_AGENCY_REFERENCE'],
    ];
    for (const [askDispositions, status, errorCode] of refusals) {
      const refused = await capturePost(
        r.candidate.id,
        pass(r.candidate, r.view, 'G6', r.caseSource.data.id, {
          askDispositions,
          supersedesAssessmentId: none.id,
        }),
      );
      expect(outcome(refused), errorCode).toEqual([status, errorCode]);
    }
    expect(await countRows(prisma, 'candidate_assessments')).toBe(before);
    // A stored record the capture never accepts (synthetic corruption) is never counted.
    const answered = await g6Pass(r, [ask(r)], none.id);
    expect((await readiness(r.candidate.id)).status).toBe('READY_FOR_SIGNER');
    for (const corrupt of [
      [ask(r, { parentBindingId: r.sent.id })],
      [ask(r), ask(r)],
      [ask(r, { disposition: 'ANSWERED' })],
    ]) {
      await prisma.$executeRaw`UPDATE candidate_assessments SET ask_dispositions = ${JSON.stringify(
        corrupt,
      )} WHERE id = ${answered.id}`;
      const current = await readiness(r.candidate.id);
      expect([current.status, current.gates[5]?.reasonCodes], JSON.stringify(corrupt)).toEqual([
        'BLOCKED',
        ['GATE_BLOCKED', 'ASSESSMENT_INTEGRITY_FAILED'],
      ]);
    }
  });

  it('successor recovery: a stored G6 PASS recording REQUIRES_DOCUMENT stays unchanged and readable; only an explicit, sourced successor that records every ask resolved becomes the one head — and only then is the candidate READY', async () => {
    const r = await readyReplyWorld();
    const held = await g6Pass(r, [ask(r), secondAsk(r, { disposition: 'REQUIRES_DOCUMENT' })]);
    expect((await readiness(r.candidate.id)).reasonCodes).toEqual([
      'G6_HOLD',
      'G6_ASK_REQUIRES_DOCUMENT',
    ]);
    const heldRow = await prisma.candidateAssessment.findUniqueOrThrow({ where: { id: held.id } });
    const resolved = await g6Pass(
      r,
      [ask(r), secondAsk(r, { disposition: 'ANSWERED_SUPPORTED', sourceIds: [r.linked.id] })],
      held.id,
    );
    const current = await readiness(r.candidate.id);
    expect(current.status).toBe('READY_FOR_SIGNER');
    expect(current.gates[5]).toEqual({
      gate: 'G6',
      status: 'PASS',
      assessmentId: resolved.id,
      reasonCodes: [],
    });
    // The earlier review is history: byte-identical and readable as recorded.
    expect(await prisma.candidateAssessment.findUniqueOrThrow({ where: { id: held.id } })).toEqual(
      heldRow,
    );
    const listed = await client.get(
      'listCandidateAssessments',
      `/candidates/${r.candidate.id}/assessments?limit=100`,
    );
    expect(listed.status, listed.text).toBe(200);
    const { items } = dataOf<{ items: CandidateAssessment[] }>(listed);
    expect(items.find((item) => item.id === held.id)).toEqual(held);
  });

  it('export replay: an export recorded while G6 was resolved releases nothing once a G6 successor records REQUIRES_DOCUMENT or MISSING_FACT — no text, no new audit event, no business change', async () => {
    const r = await readyReplyWorld();
    const answered = await g6Pass(r, [ask(r)]);
    const current = await readiness(r.candidate.id);
    expect(current.status).toBe('READY_FOR_SIGNER');
    const key = newKey();
    const first = await exportUnsigned(r.candidate.id, exportBody(current), key);
    let previous = answered.id;
    for (const [disposition, cause] of [
      ['REQUIRES_DOCUMENT', 'G6_ASK_REQUIRES_DOCUMENT'],
      ['MISSING_FACT', 'G6_ASK_MISSING_FACT'],
    ] as const) {
      previous = (await g6Pass(r, [ask(r, { disposition, sourceIds: [] })], previous)).id;
      const before = { ...(await suiteDump()), auth_sessions: [] };
      const replay = await exportPost(r.candidate.id, exportBody(current), key);
      expect(outcome(replay), disposition).toEqual([409, 'CANDIDATE_NOT_READY']);
      expect(detailsOf(replay), disposition).toEqual({
        status: 'REVIEW_REQUIRED',
        reasonCodes: ['G6_HOLD', cause],
      });
      for (const text of ['SYNTHETIC notice text', 'SYNTHETIC notice subject', first.bodySha256]) {
        expect(replay.text).not.toContain(text);
      }
      expect(replay.text).not.toContain('synthetic-reply-here@example.invalid');
      expect({ ...(await suiteDump()), auth_sessions: [] }).toEqual(before);
    }
    expect((await auditActions()).filter((action) => action === 'EXPORT_UNSIGNED')).toHaveLength(1);
  });
});

describe('R14-AUD-020 — a replay judges the records it reads at an instant sampled after reading them', () => {
  /**
   * A READY world whose selected authority records an instant boundary 10 minutes ahead (part of
   * the prompt's context: time never moves the digest), exported once with `key`.
   */
  async function exportedAheadOfBoundary(label = 'A') {
    const boundary = t.clock.ms + 10 * MINUTE;
    const r = await readyWorld({
      label,
      beforePrompt: async (w, a) => {
        await recordEvent(a.mandate.data.id, w.source.id, { effectiveAt: iso(boundary) });
      },
    });
    return { ...(await exported(r)), boundary };
  }
  /** A READY world whose authority records a date-only boundary `date`, exported once. */
  async function exportedAheadOfDate(label: string, date: string) {
    const r = await readyWorld({
      label,
      beforePrompt: async (w, a) => {
        await recordEvent(a.mandate.data.id, w.source.id, { effectiveOn: date });
      },
    });
    return exported(r);
  }
  async function exported(r: Awaited<ReturnType<typeof readyWorld>>) {
    const current = await readiness(r.candidate.id);
    expect(current.status).toBe('READY_FOR_SIGNER');
    const key = newKey();
    const first = await exportUnsigned(r.candidate.id, exportBody(current), key);
    return { ...r, current, key, first };
  }
  type Exported = Awaited<ReturnType<typeof exported>>;
  /** The test clock moves forward only. */
  const clockTo = (ms: number) => {
    expect(ms).toBeGreaterThanOrEqual(t.clock.ms);
    t.clock.advance(ms - t.clock.ms);
  };
  const STALE_G1 = {
    status: 'STALE_REVALIDATION_REQUIRED',
    reasonCodes: ['G1_UNASSESSED', 'G1_TEMPORAL_REVIEW_STALE'],
  };
  const replayOf = (x: Exported) => exportPost(x.candidate.id, exportBody(x.current), x.key);
  /** Nothing of the stored draft is in a refusal. */
  function releasesNothing(refused: HttpResult, x: Exported) {
    for (const text of ['SYNTHETIC notice text', 'SYNTHETIC notice subject', x.first.bodySha256]) {
      expect(refused.text).not.toContain(text);
    }
  }
  /** Every suite row but P1's session activity touch (independent of the export, see R-27). */
  const rowsBesidesSessions = async () => ({ ...(await suiteDump()), auth_sessions: [] });
  /** F: the replay of `x` is refused with `expected` — nothing released, nothing written. */
  async function replayRefused(x: Exported, expected: Record<string, unknown>) {
    const before = await rowsBesidesSessions();
    const refused = await replayOf(x);
    expect(outcome(refused)).toEqual([409, 'CANDIDATE_NOT_READY']);
    expect(detailsOf(refused)).toEqual(expected);
    releasesNothing(refused, x);
    // No audit event or idempotency record, and no candidate, assessment or case change: the
    // completed export stays exactly the history it was.
    expect(await rowsBesidesSessions()).toEqual(before);
  }

  it('A / F: the boundary passes after the request’s instant, while the replay waits in its claim and replay lookup — 409 STALE_REVALIDATION_REQUIRED (G1_TEMPORAL_REVIEW_STALE); nothing released or written', async () => {
    const x = await exportedAheadOfBoundary();
    // The replay starts 1 ms before the boundary, which passes before the replay's first read.
    clockTo(x.boundary - 1);
    let waited = false;
    readinessObserver.hooks.beforeReplayRead = async () => {
      clockTo(x.boundary + 1);
      waited = true;
    };
    await replayRefused(x, STALE_G1);
    expect(waited).toBe(true);
  });

  it('B / F: the boundary passes while the replay reads its input — still refused: an instant taken when the replay starts, before its reads, is not the evaluation instant', async () => {
    const x = await exportedAheadOfBoundary();
    clockTo(x.boundary - 1);
    let waited = false;
    readinessObserver.hooks.afterReplayInput = async () => {
      clockTo(x.boundary + 1);
      waited = true;
    };
    await replayRefused(x, STALE_G1);
    expect(waited).toBe(true);
  });

  it('C: no instant of the request is READY — G2 HOLD before the boundary, G1 stale from it on, a G2 PASS successor only after it; the replay reads the PASS and still refuses (G1 stale at its evaluation)', async () => {
    const x = await exportedAheadOfBoundary();
    // Before the replay: a supported G2 HOLD successor at the same epoch — no longer READY.
    const hold = await assess(
      x.candidate.id,
      pass(x.candidate, x.view, 'G2', x.caseSource.data.id, {
        supersedesAssessmentId: x.gates.G2?.id,
        result: 'HOLD',
      }),
    );
    const observed: Array<[string, Readiness['status'], string[]]> = [];
    const observe = async (phase: string) => {
      const now = await readiness(x.candidate.id);
      observed.push([phase, now.status, now.reasonCodes]);
    };
    clockTo(x.boundary - 1);
    await observe('T0 < e: G2 HOLD');
    let successor: CandidateAssessment | null = null;
    readinessObserver.hooks.beforeReplayRead = async () => {
      clockTo(x.boundary);
      await observe('e reached: G1 stale, G2 HOLD');
      clockTo(x.boundary + MINUTE);
      successor = await assess(
        x.candidate.id,
        pass(x.candidate, x.view, 'G2', x.caseSource.data.id, { supersedesAssessmentId: hold.id }),
      );
      await observe('T1 > e: a G2 PASS successor committed, G1 stale');
    };
    const exportEventsBefore = await prisma.auditEvent.findMany({
      where: { action: 'EXPORT_UNSIGNED' },
    });
    const recordBefore = await prisma.idempotencyRecord.findFirstOrThrow({
      where: { idempotencyKey: x.key },
    });
    const refused = await replayOf(x);
    expect(outcome(refused)).toEqual([409, 'CANDIDATE_NOT_READY']);
    // G2_HOLD is gone: the replay's snapshot read the PASS successor; G1 is stale at evaluation.
    expect(detailsOf(refused)).toEqual(STALE_G1);
    releasesNothing(refused, x);
    // The state the replay read (G2 PASS) exists only from T1 > e on, when G1 is stale; before T1 G2
    // was HOLD. At no instant of the request were both conditions met: never READY.
    if (successor === null) throw new Error('the concurrent capture did not run');
    expect(Date.parse((successor as CandidateAssessment).createdAt)).toBeGreaterThan(x.boundary);
    expect(observed).toEqual([
      ['T0 < e: G2 HOLD', 'REVIEW_REQUIRED', ['G2_HOLD']],
      [
        'e reached: G1 stale, G2 HOLD',
        'STALE_REVALIDATION_REQUIRED',
        ['G1_UNASSESSED', 'G2_HOLD', 'G1_TEMPORAL_REVIEW_STALE'],
      ],
      [
        'T1 > e: a G2 PASS successor committed, G1 stale',
        'STALE_REVALIDATION_REQUIRED',
        ['G1_UNASSESSED', 'G1_TEMPORAL_REVIEW_STALE'],
      ],
    ]);
    // The replay wrote nothing: the one export's audit event and its completed record stand.
    expect(await prisma.auditEvent.findMany({ where: { action: 'EXPORT_UNSIGNED' } })).toEqual(
      exportEventsBefore,
    );
    expect(
      await prisma.idempotencyRecord.findFirstOrThrow({ where: { idempotencyKey: x.key } }),
    ).toEqual(recordBefore);
  });

  it('D / F: a date-only boundary — the replay starts while the date lies ahead everywhere and is judged once the date may have begun somewhere (TEMPORAL_BOUNDARY_AMBIGUOUS) or has ended everywhere (G1 stale)', async () => {
    // 2026-09-24 begins somewhere (UTC+14:00) at 2026-09-23T10:00Z; 2026-09-25 ends everywhere
    // (UTC−12:00) at 2026-09-26T12:00Z. Start ten minutes before the first, in a fresh session.
    clockTo(Date.parse('2026-09-23T09:50:00.000Z'));
    client = new DirectoryClient(t.port, await signIn(t.port, prisma), collected);
    const ahead = await exportedAheadOfDate('D', '2026-09-24');
    clockTo(Date.parse('2026-09-23T09:59:59.999Z'));
    readinessObserver.hooks.afterReplayInput = async () => {
      clockTo(Date.parse('2026-09-23T10:00:00.000Z'));
    };
    await replayRefused(ahead, {
      status: 'REVIEW_REQUIRED',
      reasonCodes: ['G1_HOLD', 'TEMPORAL_BOUNDARY_AMBIGUOUS'],
    });

    const later = await exportedAheadOfDate('E', '2026-09-25');
    readinessObserver.hooks.beforeReplayRead = async () => {
      // The session was checked when the request started; the replay itself waits past the date.
      clockTo(Date.parse('2026-09-26T12:00:00.000Z'));
    };
    await replayRefused(later, STALE_G1);
  });

  it('E: before the boundary, with nothing changed, the replay is allowed — exactly the original subject, envelope, body, readiness and exportedAt; no second audit event, the record unchanged', async () => {
    const x = await exportedAheadOfBoundary();
    const auditBefore = await prisma.auditEvent.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const recordBefore = await prisma.idempotencyRecord.findFirstOrThrow({
      where: { idempotencyKey: x.key },
    });
    clockTo(x.boundary - 3 * MINUTE);
    readinessObserver.hooks.beforeReplayRead = async () => clockTo(x.boundary - 2 * MINUTE);
    readinessObserver.hooks.afterReplayInput = async () => clockTo(x.boundary - 1);
    const replayed = await exportUnsigned(x.candidate.id, exportBody(x.current), x.key);
    expect(replayed).toEqual(x.first);
    // The current readiness only guarded the release: the response is the historical one.
    expect(replayed.exportedAt).not.toBe(iso(t.clock.ms));
    expect(replayed.readiness.evaluatedAt).toBe(x.first.readiness.evaluatedAt);
    expect(
      await prisma.auditEvent.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    ).toEqual(auditBefore);
    expect(
      await prisma.idempotencyRecord.findFirstOrThrow({ where: { idempotencyKey: x.key } }),
    ).toEqual(recordBefore);
  });
});

describe('R14-AUD-018 — the contracted audit history read (listAuditEvents, GET /audit-events)', () => {
  type AuditPage = { items: AuditEvent[]; nextCursor: string | null };
  const auditPath = (params: Record<string, string | number> = {}) => {
    const search = new URLSearchParams(
      Object.entries(params).map(([name, value]): [string, string] => [name, String(value)]),
    ).toString();
    return `/audit-events${search === '' ? '' : `?${search}`}`;
  };
  /** One page, checked against the contract: 200, no ETag, no-store. */
  async function auditPage(params: Record<string, string | number> = {}) {
    const result = await client.get('listAuditEvents', auditPath(params));
    expect(result.status, result.text).toBe(200);
    expect(result.headers['etag']).toBeUndefined();
    expect(result.headers['cache-control']).toBe('no-store');
    const parsed = ListAuditEventsResponseSchema.safeParse(result.json);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    return { page: dataOf<AuditPage>(result), text: result.text };
  }
  /** Every page of one filter set, following nextCursor. */
  async function everyPage(params: Record<string, string | number> = {}, limit = 100) {
    const items: AuditEvent[] = [];
    const texts: string[] = [];
    let cursor: string | null = null;
    do {
      const { page, text } = await auditPage({
        ...params,
        limit,
        ...(cursor === null ? {} : { cursor }),
      });
      items.push(...page.items);
      texts.push(text);
      cursor = page.nextCursor;
    } while (cursor !== null);
    return { items, texts };
  }
  /** The stored rows, newest first — (createdAt DESC, id DESC) — exactly as the contract shows them. */
  async function storedEvents(where: Record<string, unknown> = {}): Promise<AuditEvent[]> {
    const rows = await prisma.auditEvent.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      actorUserId: row.actorUserId,
      requestId: row.requestId,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      beforeRedacted: row.beforeRedacted as AuditEvent['beforeRedacted'],
      afterRedacted: row.afterRedacted as AuditEvent['afterRedacted'],
      reason: row.reason,
      sourceIds: row.sourceIds as AuditEvent['sourceIds'],
      createdAt: row.createdAt.toISOString(),
    }));
  }
  const SEEDED_TYPES = ['SYNTHETIC_AUDIT_A', 'SYNTHETIC_AUDIT_B'] as const;
  /**
   * Synthetic audit rows of this suite's test schema only (fixtures for paging): created in groups
   * of three at one instant, so ties are ordered by id; two entity types, eight shared entity ids.
   */
  async function seedEvents(count: number) {
    const base = Date.parse('2026-09-20T08:00:00.000Z');
    const entityIds = Array.from({ length: 8 }, () => randomUUID());
    await prisma.auditEvent.createMany({
      data: Array.from({ length: count }, (_, n) => ({
        id: randomUUID(),
        actorUserId: n % 2 === 0 ? client.session.userId : null,
        requestId: `SYNTHETIC-request-${n}`,
        action: n % 5 === 0 ? 'SYNTHETIC_AUDIT_RECORDED' : 'SYNTHETIC_AUDIT_NOTED',
        entityType: SEEDED_TYPES[n % 2] as string,
        entityId: entityIds[n % 8] as string,
        afterRedacted: { n },
        createdAt: new Date(base + Math.floor(n / 3) * 1000),
      })),
    });
    return { entityIds };
  }

  it('without a session 401 and nothing is returned; an operator reads a contract-valid page, no-store — an empty one for a filter nothing matches', async () => {
    await seedEvents(3);
    const anonymous = await http(t.port, 'GET', '/api/v1/audit-events', {
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(anonymous.status).toBe(401);
    expect(anonymous.text).not.toContain('SYNTHETIC-request');
    expect(anonymous.headers['cache-control']).toBe('no-store');
    const empty = await auditPage({ entityType: 'SYNTHETIC_NOTHING_MATCHES' });
    expect(empty.page).toEqual({ items: [], nextCursor: null });
    const { page } = await auditPage();
    expect(page.items).toEqual(await storedEvents());
    expect(page.nextCursor).toBeNull();
  });

  it('limit 1, the default 25, 25 and 100; a stable keyset walk (createdAt DESC, id DESC; ties by id) returns every stored event once, exactly as stored', async () => {
    await seedEvents(130);
    const stored = await storedEvents();
    expect(stored.length).toBeGreaterThan(130);
    const one = await auditPage({ limit: 1 });
    expect(one.page.items).toEqual(stored.slice(0, 1));
    expect(one.page.nextCursor).not.toBeNull();
    expect((await auditPage()).page.items).toEqual(stored.slice(0, 25));
    expect((await auditPage({ limit: 25 })).page.items).toEqual(stored.slice(0, 25));
    const hundred = await auditPage({ limit: 100 });
    expect(hundred.page.items).toEqual(stored.slice(0, 100));
    const next = await auditPage({ limit: 100, cursor: hundred.page.nextCursor as string });
    expect(next.page.items).toEqual(stored.slice(100));
    expect(next.page.nextCursor).toBeNull();
    for (const limit of [1, 7, 25]) {
      const walked = await everyPage({}, limit);
      expect(
        walked.items.map((item) => item.id),
        `limit ${limit}`,
      ).toEqual(stored.map((item) => item.id));
    }
    // Ties exist, and the id decides their order.
    const tied = stored.filter((item, index) => stored[index + 1]?.createdAt === item.createdAt);
    expect(tied.length).toBeGreaterThan(10);
  });

  it('filters: entityType, entityId and both together, exactly; q is exactly an event id, request id, action, entity type, entity id or actor — never a text search', async () => {
    const { entityIds } = await seedEvents(40);
    const target = entityIds[3] as string;
    const byType = await everyPage({ entityType: 'SYNTHETIC_AUDIT_B' }, 7);
    expect(byType.items).toEqual(await storedEvents({ entityType: 'SYNTHETIC_AUDIT_B' }));
    expect(byType.items.length).toBe(20);
    const byId = await everyPage({ entityId: target }, 2);
    expect(byId.items).toEqual(await storedEvents({ entityId: target }));
    expect(byId.items.length).toBe(5);
    const both = await everyPage({ entityType: 'SYNTHETIC_AUDIT_B', entityId: target }, 2);
    expect(both.items).toEqual(
      await storedEvents({ entityType: 'SYNTHETIC_AUDIT_B', entityId: target }),
    );
    expect(both.items.length).toBe(5);
    expect(
      (await auditPage({ entityType: 'SYNTHETIC_AUDIT_A', entityId: target })).page.items,
    ).toEqual([]);
    const [first] = await storedEvents({ requestId: 'SYNTHETIC-request-7' });
    const q = async (value: string) => (await everyPage({ q: value }, 100)).items;
    expect(await q(first?.id as string)).toEqual([first]);
    expect(await q('SYNTHETIC-request-7')).toEqual([first]);
    expect(await q('SYNTHETIC_AUDIT_RECORDED')).toEqual(
      await storedEvents({ action: 'SYNTHETIC_AUDIT_RECORDED' }),
    );
    expect(await q('SYNTHETIC_AUDIT_A')).toEqual(
      await storedEvents({ entityType: 'SYNTHETIC_AUDIT_A' }),
    );
    expect(await q(target)).toEqual(await storedEvents({ entityId: target }));
    expect(await q(client.session.userId)).toEqual(
      await storedEvents({ actorUserId: client.session.userId }),
    );
    // Exact only: a substring, another case or a JSON value matches nothing.
    for (const value of [
      'SYNTHETIC-request',
      'synthetic_audit_a',
      'SYNTHETIC_AUDIT',
      '{"n":7}',
      '7',
    ]) {
      expect(await q(value), value).toEqual([]);
    }
    // An empty q is no filter (the list convention).
    expect((await auditPage({ q: '' })).page.items).toEqual((await storedEvents()).slice(0, 25));
  });

  it('a cursor is valid only for its own filter set: another q, entityType or entityId — or another list’s cursor — is 400 INVALID_CURSOR; an unknown parameter or an invalid limit, entityId or q is refused', async () => {
    await seedEvents(12);
    const cursorOf = async (params: Record<string, string | number>) =>
      (await auditPage({ ...params, limit: 2 })).page.nextCursor as string;
    const plain = await cursorOf({});
    const typed = await cursorOf({ entityType: 'SYNTHETIC_AUDIT_A' });
    const searched = await cursorOf({ q: 'SYNTHETIC_AUDIT_NOTED' });
    const refusals: Array<Record<string, string | number>> = [
      { cursor: plain, entityType: 'SYNTHETIC_AUDIT_A' },
      { cursor: plain, q: 'SYNTHETIC_AUDIT_NOTED' },
      { cursor: plain, entityId: randomUUID() },
      { cursor: typed },
      { cursor: typed, entityType: 'SYNTHETIC_AUDIT_B' },
      { cursor: searched, q: 'SYNTHETIC_AUDIT_RECORDED' },
      { cursor: `${plain.slice(0, -2)}xx` },
      { cursor: 'not-a-cursor' },
    ];
    for (const params of refusals) {
      const result = await client.get('listAuditEvents', auditPath({ ...params, limit: 2 }));
      expect(outcome(result), JSON.stringify(params)).toEqual([400, 'INVALID_CURSOR']);
    }
    // Another list's cursor (listCases) is not this list's.
    for (let n = 0; n < 3; n += 1) await createCase((await createAgency(`C${n}`)).data.id);
    const cases = dataOf<{ nextCursor: string | null }>(
      await client.get('listCases', '/cases?limit=1'),
    );
    expect(
      outcome(
        await client.get('listAuditEvents', auditPath({ cursor: cases.nextCursor as string })),
      ),
    ).toEqual([400, 'INVALID_CURSOR']);
    // The same filter set continues.
    expect(
      (await auditPage({ cursor: typed, entityType: 'SYNTHETIC_AUDIT_A', limit: 2 })).page.items,
    ).toHaveLength(2);
    const invalid: Array<[Record<string, string | number>, string]> = [
      [{ limit: 0 }, 'limit'],
      [{ limit: 101 }, 'limit'],
      [{ limit: 'ten' }, 'limit'],
      [{ limit: '1.5' }, 'limit'],
      [{ entityId: 'not-a-uuid' }, 'entityId'],
      [{ q: 'x'.repeat(201) }, 'q'],
      [{ entityType: 'x'.repeat(101) }, 'entityType'],
      [{ actorUserId: client.session.userId }, 'actorUserId'],
      [{ action: 'SYNTHETIC_AUDIT_NOTED' }, 'action'],
    ];
    for (const [params, parameter] of invalid) {
      const result = await client.get('listAuditEvents', auditPath(params));
      expect(outcome(result), JSON.stringify(params)).toEqual([400, 'INVALID_QUERY_PARAMETER']);
      expect(detailsOf(result)).toEqual({ parameter });
    }
  });

  it('a real assessment capture and a real unsigned export are recoverable exactly as recorded — CANDIDATE_ASSESSMENT_CAPTURED and EXPORT_UNSIGNED, their texts only as lengths', async () => {
    const r = await readyWorld();
    const MARK = 'SYNTHETIC-PRIVATE-AUD018';
    const successor = await assess(
      r.candidate.id,
      pass(r.candidate, r.view, 'G2', r.caseSource.data.id, {
        result: 'HOLD',
        supersedesAssessmentId: r.gates.G2?.id,
        performerLabel: `${MARK} performer label`,
        rationale: `${MARK} rationale text`,
        scopeText: `${MARK} scope text`,
        limitations: `${MARK} limitations text`,
        sources: [
          {
            caseSourceId: r.caseSource.data.id,
            supportedConclusion: `${MARK} supported conclusion`,
          },
        ],
      }),
    );
    const captured = await auditPage({
      entityType: 'CandidateAssessment',
      entityId: successor.id,
    });
    expect(captured.page.items.map((item) => item.action)).toEqual([
      'CANDIDATE_ASSESSMENT_CAPTURED',
    ]);
    expect(captured.page.items).toEqual(await storedEvents({ entityId: successor.id }));
    expect(captured.text).not.toContain(MARK);
    const after = captured.page.items[0]?.afterRedacted as Record<string, unknown>;
    expect(after['rationale']).toEqual({
      redacted: true,
      codePoints: [...`${MARK} rationale text`].length,
    });

    // The G2 successor holds G2: a fresh world exports.
    const x = await readyWorld({ label: 'B' });
    const current = await readiness(x.candidate.id);
    const handed = await exportUnsigned(x.candidate.id, exportBody(current));
    const exported = await auditPage({ q: 'EXPORT_UNSIGNED', entityId: x.candidate.id });
    expect(
      exported.page.items.map((item) => [item.action, item.entityType, item.entityId]),
    ).toEqual([['EXPORT_UNSIGNED', 'NoticeCandidate', x.candidate.id]]);
    expect(exported.page.items).toEqual(
      await storedEvents({ action: 'EXPORT_UNSIGNED', entityId: x.candidate.id }),
    );
    const exportAfter = exported.page.items[0]?.afterRedacted as Record<string, unknown>;
    expect(exportAfter).toMatchObject({
      candidateId: x.candidate.id,
      artifactSha256: x.candidate.artifactSha256,
      bodySha256: x.candidate.bodySha256,
      signatureState: 'HUMAN_PENDING',
      sendPerformed: false,
      externalAction: 'PROHIBITED',
      exportedAt: handed.exportedAt,
    });
    expect(exportAfter['bodyText']).toEqual({
      redacted: true,
      codePoints: [...x.candidate.bodyText].length,
    });
    expect(exported.text).not.toContain(x.candidate.bodyText);
    expect(exported.text).not.toContain(x.candidate.subject);
  });

  it('the whole history of a reply’s life — capture, binding, facts, prompt, candidate, validation, reviews with ask dispositions, export, sign-in — shows no password, session or CSRF token and no private text', async () => {
    const password = `synthetic-AUD018-password-${randomUUID()}`;
    const user = await insertUser(
      prisma,
      `aud018-${randomUUID().slice(0, 8)}@example.invalid`,
      password,
    );
    const signed = await login(t.port, user.email, password);
    expect(signed.status).toBe(200);
    const token = sessionTokenFrom(signed) as string;
    const csrfToken = (signed.json as { data: { csrfToken: string } }).data.csrfToken;
    const r = await readyReplyWorld();
    await g6Pass(r, [ask(r, { questionText: 'SYNTHETIC-PRIVATE-QUESTION about the licence' })]);
    const current = await readiness(r.candidate.id);
    expect(current.status).toBe('READY_FOR_SIGNER');
    await exportUnsigned(r.candidate.id, exportBody(current));
    const { items, texts } = await everyPage();
    expect(items).toEqual(await storedEvents());
    const actions = new Set(items.map((item) => item.action));
    for (const action of [
      'AUTH_LOGIN_SUCCEEDED',
      'CORRESPONDENCE_CAPTURED',
      'CORRESPONDENCE_BOUND',
      'PROMPT_GENERATED',
      'CANDIDATE_IMPORTED',
      'VALIDATION_RUN_RECORDED',
      'CANDIDATE_ASSESSMENT_CAPTURED',
      'EXPORT_UNSIGNED',
    ]) {
      expect(actions.has(action), action).toBe(true);
    }
    const privateTexts = [
      password,
      token,
      csrfToken,
      client.session.token,
      client.session.csrfToken,
      ...(await prisma.noticeCandidate.findMany()).flatMap((row) => [row.subject, row.bodyText]),
      ...(await prisma.correspondence.findMany()).flatMap((row) => [
        row.subject,
        row.bodyText ?? '',
        row.messageId ?? '',
        row.fromAddress ?? '',
      ]),
      ...(await prisma.candidateAssessment.findMany()).flatMap((row) => [
        row.rationale,
        row.scopeText,
        row.performerLabel,
        row.limitations ?? '',
        ...((row.askDispositions ?? []) as Array<{ questionText: string }>).map(
          (entry) => entry.questionText,
        ),
      ]),
      ...(await prisma.assessmentSource.findMany()).map((row) => row.supportedConclusion),
      ...(await prisma.factSource.findMany()).map((row) => row.supportedAssertion),
      ...(await prisma.promptSnapshot.findMany()).map((row) => row.renderedPrompt),
    ].filter((value) => value.length >= 12);
    expect(privateTexts.length).toBeGreaterThan(20);
    for (const text of texts) {
      for (const secret of privateTexts) {
        expect(text.includes(JSON.stringify(secret).slice(1, -1)), secret.slice(0, 40)).toBe(false);
      }
    }
  });

  it('reading writes nothing — no audit event about reading, no idempotency record, no row version — and the response is no-store; no other audit route exists', async () => {
    await seedEvents(5);
    await readyWorld();
    const before = { ...(await suiteDump()), auth_sessions: [] };
    const reads: Array<Record<string, string | number>> = [
      {},
      { limit: 1 },
      { q: 'SYNTHETIC_AUDIT_NOTED' },
      { entityType: 'Agency' },
    ];
    for (const params of reads) {
      await auditPage(params);
    }
    await everyPage({}, 3);
    expect({ ...(await suiteDump()), auth_sessions: [] }).toEqual(before);
    const [event] = await storedEvents();
    for (const [method, target] of [
      ['GET', `/audit-events/${event?.id as string}`],
      ['POST', '/audit-events'],
      ['PATCH', `/audit-events/${event?.id as string}`],
      ['PUT', `/audit-events/${event?.id as string}`],
      ['DELETE', `/audit-events/${event?.id as string}`],
      ['DELETE', '/audit-events'],
    ] as const) {
      const response = await unrouted(method, target);
      expect([response.status, code(response)], `${method} ${target}`).toEqual([404, 'NOT_FOUND']);
    }
    expect({ ...(await suiteDump()), auth_sessions: [] }).toEqual(before);
  });

  it('route parity: every contracted operation but getMeta is routed (144 of 145), no route outside the contract exists, and no sign, send, submit, AS_SENT or G7 route', () => {
    const express = t.app.getHttpAdapter().getInstance() as {
      router: { stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }> };
    };
    const routed = new Set<string>();
    for (const layer of express.router.stack) {
      if (!layer.route) continue;
      for (const [method, on] of Object.entries(layer.route.methods)) {
        if (on)
          routed.add(`${method.toUpperCase()} ${layer.route.path.replace(/:[A-Za-z]+/g, '{}')}`);
      }
    }
    const contracted = new Map(
      operations.map((operation) => [
        `${operation.method.toUpperCase()} /api/v1${operation.path.replace(/\{[A-Za-z]+\}/g, '{}')}`,
        operation.operationId,
      ]),
    );
    expect(contracted.size).toBe(145);
    const unroutedOperations = [...contracted].filter(([route]) => !routed.has(route));
    expect(unroutedOperations.map(([, operationId]) => operationId)).toEqual(['getMeta']);
    expect([...routed].filter((route) => !contracted.has(route))).toEqual([]);
    expect(routed.size).toBe(144);
    expect(routed.has('GET /api/v1/audit-events')).toBe(true);
    for (const route of routed) {
      expect(route).not.toMatch(/\/(sign|signature|send|submit|adopt|g7|as-sent)\b/i);
    }
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
