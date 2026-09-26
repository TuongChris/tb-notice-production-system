// P4D — Production context over real HTTP against tb_notice_test (yarn test:db).
//
// Each test boots the real AppModule + configureApp pipeline on an ephemeral loopback port with a
// synthetic signed-in application User, a controllable clock and a context-read observer the
// snapshot test uses. Every response is recorded and checked against the active contract at the
// end. All data is synthetic (example.invalid addresses only); every test deletes what it created.
//
// getProductionContext assembles the recorded, scoped input of one case from one consistent
// snapshot — never a G1–G7 decision, READY_FOR_SIGNER, legal approval, an ownership, permission or
// infringement finding or a current-authority adjudication. It is read-only: it writes nothing (no
// audit event, idempotency record or context-revision change). Only explicitly named selectors are
// used — nothing is chosen as the latest, current, default or preferred record — and nothing of one
// case appears in another's context. MISSING stays missing, CONFLICT stays conflict, capture
// posture stays as recorded, and the dependency digest binds the complete closure and the scope.
import { randomUUID } from 'node:crypto';
import net from 'node:net';
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
  Dependency,
  LegalSubject,
  Mandate,
  MandateCoverage,
  MandateVersion,
  Owner,
  OwnerSubject,
  ReportedItem,
  Route,
  Signer,
  SourceReference,
  UseMapping,
} from '../../packages/contracts/src/index.js';
import {
  CONTRACT_BASELINE,
  OperationErrorSchema,
  operations,
} from '../../packages/contracts/src/index.js';
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
  newKey,
  signIn,
  type Recorded,
} from './directory-support.js';

let prisma: PrismaClient;
let t: TestApp;
let client: DirectoryClient;
const collected: Recorded[] = [];

/** The snapshot test's hook: runs once, inside the context read's snapshot, after the case row. */
const observer = {
  hook: null as null | ((caseId: string) => Promise<void>),
  calls: 0,
  async afterSnapshot(caseId: string): Promise<void> {
    this.calls += 1;
    const hook = this.hook;
    this.hook = null;
    if (hook) await hook(caseId);
  },
};

beforeAll(async () => {
  ({ prisma } = openTestPrisma());
  await assertSuiteTablesEmpty(prisma);
});

beforeEach(async () => {
  observer.hook = null;
  observer.calls = 0;
  t = await startTestApp(prisma, { contextObserver: observer });
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

/** Records of later phases and derived states: P4D never writes any of them. */
const LATER_TABLES = [
  'prompt_snapshots',
  'notice_candidates',
  'validation_runs',
  'validation_issues',
  'candidate_assessments',
  'assessment_sources',
];

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

/** A request to a path that is not routed (not recorded: it has no contract operation). */
function unrouted(method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT', path: string) {
  return http(t.port, method, `/api/v1${path}`, {
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
async function suiteDump(): Promise<Record<string, string[]>> {
  const dump: Record<string, string[]> = {};
  for (const table of [...DIRECTORY_SUITE_TABLES, ...LATER_TABLES]) {
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

/** archive / restore / state commands of any record (If-Match of the record). */
const command = (
  operationId: string,
  path: string,
  etag: string,
  body: Record<string, unknown> = { reason: 'SYNTHETIC administrative change' },
) => client.write(operationId, 'POST', path, body, { ifMatch: etag });

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
    await client.write('createSigner', 'POST', '/signers', { agencyId, fullLegalName: name }),
    201,
  );
const getSigner = async (id: string) =>
  versioned<Signer>(await client.get('getSigner', `/signers/${id}`), 200);
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
const getRoute = async (id: string) =>
  versioned<Route>(await client.get('getRoute', `/routes/${id}`), 200);
async function patchRoute(id: string, body: Record<string, unknown>) {
  const route = await getRoute(id);
  return versioned<Route>(
    await client.write('patchRoute', 'PATCH', `/routes/${id}`, body, { ifMatch: route.etag }),
    200,
  );
}

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
    await command('freezeMandateVersion', `/mandate-versions/${id}/freeze`, version.etag, {
      reason: 'SYNTHETIC freeze of the recorded terms',
    }),
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
async function recordEvent(mandateId: string, body: Record<string, unknown>) {
  const mandate = await getMandate(mandateId);
  return immutable<AuthorityEvent>(
    await client.write(
      'recordAuthorityEvent',
      'POST',
      `/mandates/${mandateId}/events`,
      {
        eventType: 'TERMINATION',
        provenance: 'OPERATOR_REPORTED',
        scopeText: 'SYNTHETIC whole mandate',
        interpretation: 'SYNTHETIC operator reading',
        ...body,
      },
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
  const route = await createRoute({
    agencyId: agency.data.id,
    ownerSubjectId: association.data.id,
  });
  const signer = await createSigner(agency.data.id, `SYNTHETIC ${label} Signer Person`);
  const source = await createSource({
    agencyId: agency.data.id,
    title: `SYNTHETIC ${label} agency record`,
    sourceRole: 'CANONICAL_RECORD',
  });
  return { agency, owner, subject, association, route, signer, source };
}
type World = Awaited<ReturnType<typeof world>>;

/**
 * One mandate of the world's agency: one version (primary source: the agency source), one coverage
 * of a route (default: the world's) whose basis is a new agency source, and a signer (default: the
 * world's) recorded under it. Frozen unless `frozen: false`.
 */
async function authority(
  w: World,
  options: {
    frozen?: boolean;
    routeId?: string;
    signerId?: string;
    label?: string;
    mandateId?: string;
    version?: Record<string, unknown>;
    coverage?: Record<string, unknown>;
  } = {},
) {
  const label = options.label ?? 'mandate';
  const mandate =
    options.mandateId === undefined
      ? await createMandate(w.agency.data.id, `SYNTHETIC ${label}`)
      : await getMandate(options.mandateId);
  const basis = await createSource({
    agencyId: w.agency.data.id,
    title: `SYNTHETIC ${label} coverage basis`,
  });
  const version = await createVersion(mandate.data.id, {
    primarySourceId: w.source.id,
    documentState: 'SIGNED_APPEARING',
    ...options.version,
  });
  const coverage = await createCoverage(version.data.id, {
    routeId: options.routeId ?? w.route.data.id,
    basisSourceId: basis.id,
    actionScope: ['PREPARE_NOTICE'],
    coverageLabel: `SYNTHETIC ${label} coverage`,
    ...options.coverage,
  });
  const coverageSigner = await addCoverageSigner(coverage.data.id, {
    signerId: options.signerId ?? w.signer.data.id,
    sourceId: basis.id,
  });
  if (options.frozen ?? true) await freeze(version.data.id);
  return {
    mandate: await getMandate(mandate.data.id),
    version: await getVersion(version.data.id),
    coverage: await getCoverage(coverage.data.id),
    coverageSigner: coverageSigner.data,
    basis,
  };
}

// cases (P4A) -----------------------------------------------------------------------------------

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
async function caseCommand(operationId: string, id: string, path: string, body: object) {
  const current = await getCase(id);
  return versioned<CaseRecord>(
    await client.write(operationId, 'POST', `/cases/${id}/${path}`, body, {
      ifMatch: current.etag,
    }),
    200,
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
const getLink = async (id: string) =>
  versioned<CaseSource>(await client.get('getCaseSource', `/case-sources/${id}`), 200);
async function setLinkState(id: string, state: 'LINKED' | 'PAUSED' | 'UNLINKED') {
  const current = await getLink(id);
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
/** The selection request of the world's route and signer over the given coverages. */
const choose = (w: World, coverageIds: readonly string[], body: Record<string, unknown> = {}) => ({
  routeId: w.route.data.id,
  signerId: w.signer.data.id,
  taskType: 'INITIAL',
  intendedFromEmail: 'synthetic-sender@example.invalid',
  selectionNote: 'SYNTHETIC selection note',
  coverages: coverageIds.map((coverageId, index) => ({
    coverageId,
    applicationScope: `SYNTHETIC application scope ${index + 1}`,
  })),
  ...body,
});
async function select(caseId: string, body: Record<string, unknown>) {
  const current = await getCase(caseId);
  return immutable<CaseAuthoritySelection>(
    await client.write(
      'selectCaseAuthority',
      'POST',
      `/cases/${caseId}/authority-selections`,
      body,
      {
        ifMatch: current.etag,
      },
    ),
    201,
  );
}

// case intake (P4B) -----------------------------------------------------------------------------

const VIDEO = 'dQw4w9WgXcQ';
const itemUrl = (id = VIDEO) => `https://www.youtube.com/watch?v=${id}`;
/** A nested create with the case's current If-Match. */
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
const getItem = async (caseId: string, id: string) =>
  versioned<ReportedItem>(
    await client.get('getReportedItem', `/cases/${caseId}/reported-items/${id}`),
    200,
  );
const createWork = async (caseId: string, body: Record<string, unknown> = {}) =>
  versioned<CaseWork>(
    await caseCreate('createCaseWork', caseId, 'works', { title: 'SYNTHETIC Work Title', ...body }),
    201,
  );
const getWork = async (caseId: string, id: string) =>
  versioned<CaseWork>(await client.get('getCaseWork', `/cases/${caseId}/works/${id}`), 200);
const createMapping = async (caseId: string, body: Record<string, unknown>) =>
  versioned<UseMapping>(
    await caseCreate('createUseMapping', caseId, 'mappings', { occurrence: 1, ...body }),
    201,
  );
const getMapping = async (caseId: string, id: string) =>
  versioned<UseMapping>(await client.get('getUseMapping', `/cases/${caseId}/mappings/${id}`), 200);
type ChildKind = 'reported-items' | 'works' | 'mappings';
const ARCHIVE_OPERATION: Record<ChildKind, [string, string, string]> = {
  'reported-items': ['archiveReportedItem', 'restoreReportedItem', 'getReportedItem'],
  works: ['archiveCaseWork', 'restoreCaseWork', 'getCaseWork'],
  mappings: ['archiveUseMapping', 'restoreUseMapping', 'getUseMapping'],
};
async function archiveChild(kind: ChildKind, caseId: string, id: string) {
  const current = etagOf(
    await client.get(ARCHIVE_OPERATION[kind][2], `/cases/${caseId}/${kind}/${id}`),
  );
  const result = await client.write(
    ARCHIVE_OPERATION[kind][0],
    'POST',
    `/cases/${caseId}/${kind}/${id}/archive`,
    { reason: 'SYNTHETIC archive' },
    { ifMatch: current },
  );
  expect(result.status, result.text).toBe(200);
}

/** A valid typed value of every contracted fact type (neutral, unknown or unreviewed findings). */
const FACT_VALUES: Record<string, Record<string, unknown>> = {
  RIGHTS_BASIS: {
    basis: 'UNKNOWN',
    assertion: 'SYNTHETIC rights basis as reported',
    limitations: null,
  },
  RIGHTS_SCOPE: {
    exclusiveRights: ['SYNTHETIC reproduction'],
    protectedExpression: 'SYNTHETIC protected expression',
    thirdPartyExclusions: '',
    contraryRecords: '',
  },
  PERMISSION: { finding: 'UNKNOWN', assertion: '', reviewScope: 'Not reviewed' },
  AV_COMPARISON: { finding: 'UNREVIEWED', method: '', assertion: '', limitations: '' },
  EXCEPTION_REVIEW: {
    finding: 'UNREVIEWED',
    reasoning: '',
    jurisdictionScope: '',
    limitations: '',
  },
  WORK_IDENTIFICATION: { description: 'SYNTHETIC work identification', limitations: '' },
  REPORTED_IDENTIFICATION: { description: 'SYNTHETIC reported identification', limitations: '' },
  DUPLICATE_REVIEW: {
    finding: 'UNCHECKED',
    coverageDescription: '',
    observedThrough: null,
    relatedCaseIds: [],
    reasoning: '',
  },
  AUTHORITY_CURRENTNESS: { finding: 'UNKNOWN', assertion: '', asOf: null, limitations: '' },
};
const factBody = (body: Record<string, unknown> = {}) => {
  const factType = (body['factType'] as string | undefined) ?? 'PERMISSION';
  return {
    factType,
    value: FACT_VALUES[factType],
    scopeKind: 'CASE',
    provenance: 'MISSING',
    scopeText: 'SYNTHETIC scope of this fact',
    changeReason: 'SYNTHETIC initial intake',
    sources: [],
    ...body,
  };
};
const createFact = async (caseId: string, body: Record<string, unknown> = {}) =>
  immutable<CaseFact>(await caseCreate('createCaseFact', caseId, 'facts', factBody(body)), 201);
async function reviseFact(caseId: string, id: string, body: Record<string, unknown> = {}) {
  const current = await getCase(caseId);
  return immutable<CaseFact>(
    await client.write(
      'reviseCaseFact',
      'POST',
      `/cases/${caseId}/facts/${id}/revisions`,
      factBody(body),
      { ifMatch: current.etag },
    ),
    201,
  );
}
const getFact = async (caseId: string, id: string) =>
  immutable<CaseFact>(await client.get('getCaseFact', `/cases/${caseId}/facts/${id}`), 200);
const support = (caseSourceId: string, supportRole = 'SYNTHETIC_SUPPORT') => ({
  caseSourceId,
  supportRole,
  supportedAssertion: 'SYNTHETIC supported assertion as entered',
});

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
const getCorrespondence = async (id: string) =>
  immutable<Correspondence>(await client.get('getCorrespondence', `/correspondence/${id}`), 200);
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

// production context (P4D) ----------------------------------------------------------------------

interface ContextQuery {
  readonly taskType?: string;
  readonly generationMode?: string;
  readonly authoritySelectionId?: string;
  readonly parentBindingId?: string;
  readonly priorBindingIds?: readonly string[];
}
function contextPath(caseId: string, query: ContextQuery | string): string {
  if (typeof query === 'string') return `/cases/${caseId}/production-context${query}`;
  const params = new URLSearchParams();
  params.set('taskType', query.taskType ?? 'INITIAL');
  params.set('generationMode', query.generationMode ?? 'PREPARATION');
  if (query.authoritySelectionId) params.set('authoritySelectionId', query.authoritySelectionId);
  if (query.parentBindingId) params.set('parentBindingId', query.parentBindingId);
  for (const id of query.priorBindingIds ?? []) params.append('priorBindingIds', id);
  return `/cases/${caseId}/production-context?${params.toString()}`;
}
const readContext = (caseId: string, query: ContextQuery | string = {}) =>
  client.get('getProductionContext', contextPath(caseId, query));
async function context(caseId: string, query: ContextQuery = {}): Promise<ContextView> {
  const result = await readContext(caseId, query);
  expect(result.status, result.text).toBe(200);
  expect(result.headers['etag']).toBeUndefined();
  return dataOf<ContextView>(result);
}
const codes = (list: ReadonlyArray<{ code: string }>) => list.map((entry) => entry.code);
const deps = (view: ContextView) =>
  view.dependencies.map((dependency) => `${dependency.entityType}:${dependency.entityId}`);
/** The dependencies whose fingerprint differs between two reads (or that only one of them has). */
function changed(after: ContextView, before: ContextView): string[] {
  const print = (view: ContextView) =>
    new Map(view.dependencies.map((d) => [`${d.entityType}:${d.entityId}`, d.fingerprint]));
  const a = print(after);
  const b = print(before);
  return [...new Set([...a.keys(), ...b.keys()])].filter((key) => a.get(key) !== b.get(key)).sort();
}
const depOf = (view: ContextView, entityType: string, entityId: string): Dependency | undefined =>
  view.dependencies.find(
    (dependency) => dependency.entityType === entityType && dependency.entityId === entityId,
  );

/**
 * A complete synthetic production world: the directory and a frozen authority chain, a case bound
 * to the route with an explicit selection, one reported item, one work, one mapping (its basis an
 * agency source), a LINKED evidence source and a fact supported by it.
 */
async function productionWorld(label = 'A') {
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
  const evidence = await createSource({
    agencyId: w.agency.data.id,
    title: `SYNTHETIC ${label} evidence`,
    canonicalUrl: 'https://evidence.example.invalid/record-1',
  });
  const linked = await linkSource(caseId, evidence.id);
  const fact = await createFact(caseId, {
    factType: 'RIGHTS_BASIS',
    provenance: 'OPERATOR_REPORTED',
    sources: [support(linked.data.id)],
  });
  return { w, a, caseId, selection, item, work, basis, mapping, evidence, linked, fact };
}
type ProductionWorld = Awaited<ReturnType<typeof productionWorld>>;

/** The reply world: a production world plus a captured NMI and a prior INITIAL_AS_SENT, bound. */
async function replyWorld(label = 'A') {
  const p = await productionWorld(label);
  const nmiMessage = await capture(p.w.agency.data.id, {
    subject: 'SYNTHETIC we need more information',
    bodyText: 'SYNTHETIC Question 1: please provide the licence.',
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
  return { ...p, nmiMessage, nmi, sentMessage, sent };
}

const REPLY = (r: Awaited<ReturnType<typeof replyWorld>>, extra: ContextQuery = {}) => ({
  taskType: 'NMI_REPLY',
  authoritySelectionId: r.selection.id,
  parentBindingId: r.nmi.id,
  priorBindingIds: [r.sent.id],
  ...extra,
});

// ---------------------------------------------------------------------------------------------

describe('QUERY AND TASK SCOPE — only contracted, explicit selectors; nothing is chosen for the caller', () => {
  it('validates the query against the contract: task and mode required, enum values only, UUID selectors, at most 100 prior bindings each named once, no other parameter; an unknown or malformed case is 404; refusals write nothing', async () => {
    const p = await productionWorld();
    const before = await suiteDump();
    const base = `?taskType=INITIAL&generationMode=PREPARATION`;
    const cases: Array<[string, number, string, string | null]> = [
      ['', 400, 'INVALID_QUERY_PARAMETER', 'taskType'],
      ['?generationMode=PREPARATION', 400, 'INVALID_QUERY_PARAMETER', 'taskType'],
      ['?taskType=INITIAL', 400, 'INVALID_QUERY_PARAMETER', 'generationMode'],
      ['?taskType=initial&generationMode=PREPARATION', 400, 'INVALID_QUERY_PARAMETER', 'taskType'],
      ['?taskType=REPLY&generationMode=PREPARATION', 400, 'INVALID_QUERY_PARAMETER', 'taskType'],
      ['?taskType=INITIAL&generationMode=READY', 400, 'INVALID_QUERY_PARAMETER', 'generationMode'],
      [`${base}&taskType=NMI_REPLY`, 400, 'INVALID_QUERY_PARAMETER', 'taskType'],
      [
        `${base}&authoritySelectionId=not-a-uuid`,
        400,
        'INVALID_QUERY_PARAMETER',
        'authoritySelectionId',
      ],
      [`${base}&parentBindingId=123`, 400, 'INVALID_QUERY_PARAMETER', 'parentBindingId'],
      [`${base}&priorBindingIds=abc`, 400, 'INVALID_QUERY_PARAMETER', 'priorBindingIds'],
      [`${base}&priorBindingIds=`, 400, 'INVALID_QUERY_PARAMETER', 'priorBindingIds'],
      [`${base}&readiness=true`, 400, 'INVALID_QUERY_PARAMETER', 'readiness'],
      [`${base}&caseId=${p.caseId}`, 400, 'INVALID_QUERY_PARAMETER', 'caseId'],
      [
        `${base}&priorBindingIds[]=${randomUUID()}`,
        400,
        'INVALID_QUERY_PARAMETER',
        'priorBindingIds[]',
      ],
    ];
    for (const [query, status, errorCode, parameter] of cases) {
      const result = await readContext(p.caseId, query);
      expect(outcome(result), query).toEqual([status, errorCode]);
      expect(detailsOf(result)['parameter'], query).toBe(parameter);
    }
    const nmiReply = `?taskType=NMI_REPLY&generationMode=PREPARATION`;
    const repeated = randomUUID();
    const duplicate = await readContext(
      p.caseId,
      `${nmiReply}&priorBindingIds=${repeated}&priorBindingIds=${repeated}`,
    );
    expect(outcome(duplicate)).toEqual([400, 'INVALID_QUERY_PARAMETER']);
    expect(detailsOf(duplicate)['parameter']).toBe('priorBindingIds');
    const tooMany = Array.from({ length: 101 }, () => `priorBindingIds=${randomUUID()}`).join('&');
    expect(outcome(await readContext(p.caseId, `${nmiReply}&${tooMany}`))).toEqual([
      400,
      'INVALID_QUERY_PARAMETER',
    ]);
    expect(outcome(await readContext(randomUUID(), {}))).toEqual([404, 'NOT_FOUND']);
    expect(
      outcome(
        await client.get('getProductionContext', `/cases/not-a-case/production-context${base}`),
      ),
    ).toEqual([404, 'NOT_FOUND']);
    expect(await suiteDump()).toEqual(before);
  });

  it('every task and mode is accepted on a complete case; the context echoes the requested task and mode and nothing else changes between them', async () => {
    const r = await replyWorld();
    const initialPreparation = await context(r.caseId, { authoritySelectionId: r.selection.id });
    const initialDrafting = await context(r.caseId, {
      generationMode: 'DRAFTING',
      authoritySelectionId: r.selection.id,
    });
    const replyPreparation = await context(r.caseId, REPLY(r));
    const replyDrafting = await context(r.caseId, REPLY(r, { generationMode: 'DRAFTING' }));
    expect(
      [initialPreparation, initialDrafting, replyPreparation, replyDrafting].map((view) => [
        view.context.taskType,
        view.context.generationMode,
      ]),
    ).toEqual([
      ['INITIAL', 'PREPARATION'],
      ['INITIAL', 'DRAFTING'],
      ['NMI_REPLY', 'PREPARATION'],
      ['NMI_REPLY', 'DRAFTING'],
    ]);
    const { generationMode: _m1, ...initialRest } = initialPreparation.context;
    const { generationMode: _m2, ...draftingRest } = initialDrafting.context;
    expect(draftingRest).toEqual(initialRest);
    expect(initialDrafting.dependencies).toEqual(initialPreparation.dependencies);
    expect(
      new Set(
        [initialPreparation, initialDrafting, replyPreparation, replyDrafting].map(
          (view) => view.dependencyDigest,
        ),
      ).size,
    ).toBe(4);
  });

  it('INITIAL has no parent message and no prior transmissions: a parent or prior binding is refused (422 SELECTOR_NOT_FOR_TASK), never ignored', async () => {
    const r = await replyWorld();
    const parent = await readContext(r.caseId, { parentBindingId: r.nmi.id });
    expect(outcome(parent)).toEqual([422, 'SELECTOR_NOT_FOR_TASK']);
    expect(detailsOf(parent)).toEqual({ field: 'parentBindingId', taskType: 'INITIAL' });
    const prior = await readContext(r.caseId, { priorBindingIds: [r.sent.id] });
    expect(outcome(prior)).toEqual([422, 'SELECTOR_NOT_FOR_TASK']);
    expect(detailsOf(prior)).toEqual({ field: 'priorBindingIds', taskType: 'INITIAL' });
    const drafting = await readContext(r.caseId, {
      generationMode: 'DRAFTING',
      authoritySelectionId: r.selection.id,
      parentBindingId: r.nmi.id,
    });
    expect(outcome(drafting)).toEqual([422, 'SELECTOR_NOT_FOR_TASK']);
    const view = await context(r.caseId, { authoritySelectionId: r.selection.id });
    expect(view.context.parentBindingId).toBeNull();
    expect(view.context.priorCorrespondenceIds).toEqual([]);
    expect(view.context.correspondence).toEqual([]);
    expect(codes(view.context.missing)).not.toContain('REPLY_PARENT_NOT_SELECTED');
    expect(deps(view).filter((key) => key.startsWith('Correspondence'))).toEqual([]);
  });

  it("authoritySelectionId: an unknown selection is 422 REFERENCE_NOT_FOUND, another case's 422 CROSS_CASE_REFERENCE; an omitted one gives no authority — the case's current selection is not used unless named; an earlier selection named explicitly is used exactly", async () => {
    const p = await productionWorld();
    const unknown = await readContext(p.caseId, { authoritySelectionId: randomUUID() });
    expect(outcome(unknown)).toEqual([422, 'REFERENCE_NOT_FOUND']);
    expect(detailsOf(unknown)).toEqual({ field: 'authoritySelectionId' });
    const sibling = await createCase(p.w.agency.data.id, { routeId: p.w.route.data.id });
    const siblingSelection = await select(sibling.data.id, choose(p.w, [p.a.coverage.data.id]));
    const foreign = await readContext(p.caseId, { authoritySelectionId: siblingSelection.id });
    expect(outcome(foreign)).toEqual([422, 'CROSS_CASE_REFERENCE']);
    expect(detailsOf(foreign)).toEqual({ field: 'authoritySelectionId' });

    const current = await getCase(p.caseId);
    expect(current.data.currentAuthoritySelectionId).toBe(p.selection.id);
    const omitted = await context(p.caseId);
    expect(omitted.context.authoritySelectionId).toBeNull();
    expect(omitted.context.authority).toBeNull();
    expect(omitted.context.party.signerId).toBeNull();
    expect(omitted.context.party.signerFullLegalName).toBeNull();
    expect(codes(omitted.context.missing)).toContain('AUTHORITY_SELECTION_NOT_SELECTED');
    expect(
      deps(omitted).filter((key) =>
        /^(CaseAuthority|Mandate|Coverage|Signer|AuthorityEvent)/.test(key),
      ),
    ).toEqual([]);

    // A later selection moves the case's pointer; the earlier one, named, is still used exactly.
    const second = await authority(p.w, { label: 'second' });
    const later = await select(
      p.caseId,
      choose(p.w, [second.coverage.data.id], { taskType: 'NMI_REPLY' }),
    );
    expect((await getCase(p.caseId)).data.currentAuthoritySelectionId).toBe(later.id);
    const earlier = await context(p.caseId, { authoritySelectionId: p.selection.id });
    expect(earlier.context.authoritySelectionId).toBe(p.selection.id);
    expect(earlier.context.authority?.selection).toEqual(p.selection);
    expect(earlier.context.authority?.coverages.map((block) => block.coverage.id)).toEqual([
      p.a.coverage.data.id,
    ]);
  });

  it("parentBindingId: unknown 422 REFERENCE_NOT_FOUND, another case's 422 CROSS_CASE_REFERENCE, not an NMI 422 REPLY_PARENT_REQUIRED (NOT_NMI), a corrected NMI binding 409 BINDING_ALREADY_SUPERSEDED naming its correction — which is never used in its place", async () => {
    const r = await replyWorld();
    const query = (parentBindingId: string) => REPLY(r, { parentBindingId });
    const unknown = await readContext(r.caseId, query(randomUUID()));
    expect(outcome(unknown)).toEqual([422, 'REFERENCE_NOT_FOUND']);
    expect(detailsOf(unknown)).toEqual({ field: 'parentBindingId' });
    const other = await createCase(r.w.agency.data.id, { routeId: r.w.route.data.id });
    const otherNmi = await bind(other.data.id, {
      correspondenceId: r.nmiMessage.id,
      eventType: 'NMI',
    });
    const foreign = await readContext(r.caseId, query(otherNmi.id));
    expect(outcome(foreign)).toEqual([422, 'CROSS_CASE_REFERENCE']);
    expect(detailsOf(foreign)).toEqual({ field: 'parentBindingId' });
    for (const eventType of ['ACK', 'OTHER', 'REPLY_AS_SENT'] as const) {
      const wrong = await bind(r.caseId, { correspondenceId: r.nmiMessage.id, eventType });
      const refused = await readContext(r.caseId, query(wrong.id));
      expect(outcome(refused), eventType).toEqual([422, 'REPLY_PARENT_REQUIRED']);
      expect(detailsOf(refused), eventType).toEqual({
        field: 'parentBindingId',
        reason: 'NOT_NMI',
        eventType,
      });
    }
    const correction = await bind(r.caseId, {
      correspondenceId: r.nmiMessage.id,
      eventType: 'NMI',
      supersedesBindingId: r.nmi.id,
      interpretation: 'SYNTHETIC corrected reading',
    });
    const superseded = await readContext(r.caseId, query(r.nmi.id));
    expect(outcome(superseded)).toEqual([409, 'BINDING_ALREADY_SUPERSEDED']);
    expect(detailsOf(superseded)).toEqual({ field: 'parentBindingId', successorId: correction.id });
    const named = await context(r.caseId, query(correction.id));
    expect(named.context.parentBindingId).toBe(correction.id);
  });

  it('NMI_REPLY without a parent: PREPARATION shows the gap (no NMI is chosen by date, subject or text), DRAFTING is 422 REPLY_PARENT_REQUIRED (NOT_SELECTED) with every blocking code', async () => {
    const r = await replyWorld();
    // A second, later NMI binding exists: nothing picks either one.
    await bind(r.caseId, {
      correspondenceId: (
        await capture(r.w.agency.data.id, { subject: 'SYNTHETIC need more info (later)' })
      ).id,
      eventType: 'NMI',
    });
    const preparation = await context(r.caseId, {
      taskType: 'NMI_REPLY',
      authoritySelectionId: r.selection.id,
      priorBindingIds: [r.sent.id],
    });
    expect(preparation.context.parentBindingId).toBeNull();
    expect(codes(preparation.context.missing)).toContain('REPLY_PARENT_NOT_SELECTED');
    expect(preparation.context.correspondence.map((message) => message.id)).toEqual([
      r.sentMessage.id,
    ]);
    const drafting = await readContext(r.caseId, {
      taskType: 'NMI_REPLY',
      generationMode: 'DRAFTING',
      authoritySelectionId: r.selection.id,
      priorBindingIds: [r.sent.id],
    });
    expect(outcome(drafting)).toEqual([422, 'REPLY_PARENT_REQUIRED']);
    expect(detailsOf(drafting)).toEqual({
      field: 'parentBindingId',
      reason: 'NOT_SELECTED',
      missing: ['REPLY_PARENT_NOT_SELECTED'],
    });
  });

  it("priorBindingIds: explicit bindings only — unknown 422, another case's 422, OUTBOUND+OTHER or any non-AS_SENT event 422 PRIOR_BINDING_NOT_AS_SENT, a corrected one 409; unnamed AS_SENT bindings are never added; DRAFTING without one is 422 DRAFTING_INPUT_MISSING", async () => {
    const r = await replyWorld();
    const prior = (id: string) => REPLY(r, { priorBindingIds: [r.sent.id, id] });
    const unknown = await readContext(r.caseId, prior(randomUUID()));
    expect(outcome(unknown)).toEqual([422, 'REFERENCE_NOT_FOUND']);
    expect(detailsOf(unknown)).toEqual({ field: 'priorBindingIds.1' });
    const other = await createCase(r.w.agency.data.id, { routeId: r.w.route.data.id });
    const otherSent = await bind(other.data.id, {
      correspondenceId: r.sentMessage.id,
      eventType: 'INITIAL_AS_SENT',
    });
    const foreign = await readContext(r.caseId, prior(otherSent.id));
    expect(outcome(foreign)).toEqual([422, 'CROSS_CASE_REFERENCE']);
    expect(detailsOf(foreign)).toEqual({ field: 'priorBindingIds.1' });
    const outbound = await capture(r.w.agency.data.id, {
      direction: 'OUTBOUND',
      subject: 'SYNTHETIC outbound, not as sent',
    });
    const outboundOther = await bind(r.caseId, {
      correspondenceId: outbound.id,
      eventType: 'OTHER',
    });
    const notSent = await readContext(r.caseId, prior(outboundOther.id));
    expect(outcome(notSent)).toEqual([422, 'PRIOR_BINDING_NOT_AS_SENT']);
    expect(detailsOf(notSent)).toEqual({ field: 'priorBindingIds.1', eventType: 'OTHER' });
    for (const eventType of ['NMI', 'ACK'] as const) {
      const wrong = await bind(r.caseId, { correspondenceId: outbound.id, eventType });
      expect(outcome(await readContext(r.caseId, prior(wrong.id))), eventType).toEqual([
        422,
        'PRIOR_BINDING_NOT_AS_SENT',
      ]);
    }
    const outcomeBinding = await bind(r.caseId, {
      correspondenceId: outbound.id,
      eventType: 'OUTCOME',
      reportedItemId: r.item.data.id,
      outcome: 'REMOVED',
    });
    expect(outcome(await readContext(r.caseId, prior(outcomeBinding.id)))).toEqual([
      422,
      'PRIOR_BINDING_NOT_AS_SENT',
    ]);

    // Another AS_SENT binding exists but is not named: it is not added.
    const supplementMessage = await capture(r.w.agency.data.id, {
      direction: 'OUTBOUND',
      subject: 'SYNTHETIC supplement',
      captureMode: 'RAW_SOURCE',
      rawSourceId: r.w.source.id,
    });
    const supplement = await bind(r.caseId, {
      correspondenceId: supplementMessage.id,
      eventType: 'SUPPLEMENT_AS_SENT',
    });
    const one = await context(r.caseId, REPLY(r));
    expect(one.context.priorCorrespondenceIds).toEqual([r.sentMessage.id]);
    const two = await context(r.caseId, prior(supplement.id));
    expect(two.context.priorCorrespondenceIds).toEqual(
      [r.sentMessage.id, supplementMessage.id].sort(),
    );
    expect(two.dependencyDigest).not.toBe(one.dependencyDigest);

    const correction = await bind(r.caseId, {
      correspondenceId: supplementMessage.id,
      eventType: 'SUPPLEMENT_AS_SENT',
      supersedesBindingId: supplement.id,
    });
    const superseded = await readContext(r.caseId, prior(supplement.id));
    expect(outcome(superseded)).toEqual([409, 'BINDING_ALREADY_SUPERSEDED']);
    expect(detailsOf(superseded)).toEqual({
      field: 'priorBindingIds.1',
      successorId: correction.id,
    });

    const drafting = await readContext(
      r.caseId,
      REPLY(r, { generationMode: 'DRAFTING', priorBindingIds: [] }),
    );
    expect(outcome(drafting)).toEqual([422, 'DRAFTING_INPUT_MISSING']);
    expect(detailsOf(drafting)).toEqual({ missing: ['PRIOR_AS_SENT_NOT_SELECTED'] });
    const preparation = await context(r.caseId, REPLY(r, { priorBindingIds: [] }));
    expect(codes(preparation.context.missing)).toContain('PRIOR_AS_SENT_NOT_SELECTED');
    expect(preparation.context.priorCorrespondenceIds).toEqual([]);
  });

  it('PREPARATION returns an incomplete case with its gaps listed and nothing filled in; DRAFTING refuses it (422 DRAFTING_INPUT_MISSING naming every blocking code) — neither is readiness', async () => {
    const w = await world();
    const bare = await createCase(w.agency.data.id);
    const preparation = await context(bare.data.id);
    expect(codes(preparation.context.missing)).toEqual([
      'CASE_ROUTE_UNBOUND',
      'AUTHORITY_SELECTION_NOT_SELECTED',
      'REPORTED_ITEMS_ABSENT',
      'WORKS_ABSENT',
      'USE_MAPPINGS_ABSENT',
    ]);
    expect(preparation.context.party).toEqual({
      agencyId: w.agency.data.id,
      ownerId: null,
      legalSubjectId: null,
      signerId: null,
      agencyLegalName: w.agency.data.legalName,
      legalSubjectName: null,
      signerFullLegalName: null,
    });
    expect([
      preparation.context.reportedItems,
      preparation.context.works,
      preparation.context.mappings,
      preparation.context.facts,
      preparation.context.sources,
      preparation.context.correspondence,
      preparation.context.policySources,
      preparation.context.conflicts,
    ]).toEqual([[], [], [], [], [], [], [], []]);
    const drafting = await readContext(bare.data.id, { generationMode: 'DRAFTING' });
    expect(outcome(drafting)).toEqual([422, 'DRAFTING_INPUT_MISSING']);
    expect(detailsOf(drafting)).toEqual({
      missing: [
        'CASE_ROUTE_UNBOUND',
        'AUTHORITY_SELECTION_NOT_SELECTED',
        'REPORTED_ITEMS_ABSENT',
        'WORKS_ABSENT',
        'USE_MAPPINGS_ABSENT',
      ],
    });
    const replyDrafting = await readContext(bare.data.id, {
      taskType: 'NMI_REPLY',
      generationMode: 'DRAFTING',
    });
    expect(outcome(replyDrafting)).toEqual([422, 'REPLY_PARENT_REQUIRED']);
    expect(detailsOf(replyDrafting)['missing']).toEqual([
      'CASE_ROUTE_UNBOUND',
      'AUTHORITY_SELECTION_NOT_SELECTED',
      'REPORTED_ITEMS_ABSENT',
      'WORKS_ABSENT',
      'USE_MAPPINGS_ABSENT',
      'REPLY_PARENT_NOT_SELECTED',
      'PRIOR_AS_SENT_NOT_SELECTED',
    ]);
    // Non-blocking gaps stay listed in DRAFTING; the mode is never a readiness verdict.
    const p = await productionWorld('B');
    const missingFact = await createFact(p.caseId, { factType: 'PERMISSION' });
    const draftingOk = await context(p.caseId, {
      generationMode: 'DRAFTING',
      authoritySelectionId: p.selection.id,
    });
    expect(codes(draftingOk.context.missing)).toEqual(['FACT_PROVENANCE_MISSING']);
    expect(draftingOk.context.missing[0]?.fieldPath).toBe(
      `facts[${draftingOk.context.facts.findIndex((fact) => fact.id === missingFact.id)}]`,
    );
    expect(JSON.stringify(draftingOk)).not.toMatch(/READY_FOR_SIGNER|"g[1-7]|readiness/i);
    await expectNoLaterRecords();
  });
});

describe('CONTEXT CONTENT — every PFC-YT-EMAIL-v1.1 block exactly as recorded; fixed safety literals', () => {
  it('assembles every block from the records exactly as stored: schema version, case and canonical id, task, revision, party, authority, intake records, facts, sources, correspondence, missing, conflicts and the four fixed literals', async () => {
    const p = await productionWorld();
    const view = await context(p.caseId, { authoritySelectionId: p.selection.id });
    const current = await getCase(p.caseId);
    const c = view.context;
    expect(Object.keys(c).sort()).toEqual(
      [
        'schemaVersion',
        'caseId',
        'canonicalCaseId',
        'taskType',
        'generationMode',
        'caseContextRevision',
        'party',
        'authoritySelectionId',
        'reportedItems',
        'works',
        'mappings',
        'facts',
        'sources',
        'parentBindingId',
        'priorCorrespondenceIds',
        'missing',
        'conflicts',
        'sourcePrecedence',
        'signatureState',
        'externalAction',
        'scannerVerification',
        'authority',
        'correspondence',
        'policySources',
      ].sort(),
    );
    expect(c.schemaVersion).toBe('PFC-YT-EMAIL-v1.1');
    expect(c.caseId).toBe(p.caseId);
    expect(c.canonicalCaseId).toBeNull();
    expect([c.taskType, c.generationMode]).toEqual(['INITIAL', 'PREPARATION']);
    expect(c.caseContextRevision).toBe(current.data.contextRevision);
    expect(view.contextRevision).toBe(current.data.contextRevision);
    expect(c.party).toEqual({
      agencyId: p.w.agency.data.id,
      ownerId: p.w.owner.data.id,
      legalSubjectId: p.w.subject.data.id,
      signerId: p.w.signer.data.id,
      agencyLegalName: 'SYNTHETIC A Agency Legal Name Ltd',
      legalSubjectName: p.w.subject.data.legalName,
      signerFullLegalName: p.w.signer.data.fullLegalName,
    });
    expect(c.authoritySelectionId).toBe(p.selection.id);
    expect(c.reportedItems).toEqual([(await getItem(p.caseId, p.item.data.id)).data]);
    expect(c.works).toEqual([(await getWork(p.caseId, p.work.data.id)).data]);
    expect(c.mappings).toEqual([(await getMapping(p.caseId, p.mapping.data.id)).data]);
    expect(c.facts).toEqual([await getFact(p.caseId, p.fact.id)]);
    const manifest = (source: SourceReference) => ({
      sourceId: source.id,
      role: source.sourceRole,
      canonicalUrl: source.canonicalUrl,
      contentSha256: source.contentSha256,
      hashTarget: source.hashTarget,
      provenance: source.reportedProvenance,
      scopeText: source.scopeText,
      limitations: source.limitations,
    });
    // Mapping basis, fact support (LINKED evidence), version primary source, coverage basis
    // (also the coverage signer's source): exactly the sources of the closure, by id.
    expect(c.sources).toEqual(
      [p.basis, p.evidence, p.w.source, p.a.basis]
        .sort((x, y) => (x.id < y.id ? -1 : 1))
        .map(manifest),
    );
    expect(c.parentBindingId).toBeNull();
    expect(c.priorCorrespondenceIds).toEqual([]);
    expect(c.missing).toEqual([]);
    expect(c.conflicts).toEqual([]);
    expect([c.sourcePrecedence, c.signatureState, c.externalAction, c.scannerVerification]).toEqual(
      ['CANONICAL_PRIMARY_RECORDS_OVER_APP_DERIVATIVES', 'HUMAN_PENDING', 'PROHIBITED', 'DISABLED'],
    );
    expect(c.authority).toEqual({
      selection: p.selection,
      coverages: [
        {
          coverage: p.a.coverage.data,
          version: p.a.version.data,
          signerScopes: [p.a.coverageSigner],
          authorityEvents: [],
        },
      ],
    });
    expect(c.correspondence).toEqual([]);
    expect(c.policySources).toEqual([]);
    expect(view.dependencyDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('the fixed safety literals never depend on completeness: a bare case, an incomplete reply and a complete one carry the same four values', async () => {
    const w = await world();
    const bare = await createCase(w.agency.data.id);
    const r = await replyWorld('B');
    const views = [
      await context(bare.data.id),
      await context(bare.data.id, { taskType: 'NMI_REPLY' }),
      await context(r.caseId, REPLY(r)),
      await context(r.caseId, REPLY(r, { generationMode: 'DRAFTING' })),
    ];
    for (const view of views) {
      expect([
        view.context.schemaVersion,
        view.context.sourcePrecedence,
        view.context.signatureState,
        view.context.externalAction,
        view.context.scannerVerification,
      ]).toEqual([
        'PFC-YT-EMAIL-v1.1',
        'CANONICAL_PRIMARY_RECORDS_OVER_APP_DERIVATIVES',
        'HUMAN_PENDING',
        'PROHIBITED',
        'DISABLED',
      ]);
    }
  });

  it("canonicalCaseId is only the case's canonical binding: null (no missing item) until a sourced code is bound; never the intake label or anything else", async () => {
    const p = await productionWorld();
    await patchCase(p.caseId, { intakeLabel: 'SYN-LOOKS-LIKE-A-CODE-001' });
    const before = await context(p.caseId, { authoritySelectionId: p.selection.id });
    expect(before.context.canonicalCaseId).toBeNull();
    expect(codes(before.context.missing)).not.toContain('CANONICAL_CASE_ID_ABSENT');
    await caseCommand('CanonicalBindingCase', p.caseId, 'canonical-binding', {
      canonicalCode: 'SYN-CASE-0042',
      sourceId: p.w.source.id,
      reason: 'SYNTHETIC canonical binding',
    });
    const after = await context(p.caseId, { authoritySelectionId: p.selection.id });
    expect(after.context.canonicalCaseId).toBe('SYN-CASE-0042');
    expect(after.contextRevision).toBe(before.contextRevision + 1);
    expect(after.dependencyDigest).not.toBe(before.dependencyDigest);
  });
});

describe('PARTY AND AUTHORITY — explicit route relationship, exact selection pinning, no currentness', () => {
  it("the party comes only from the bound route's association and the named selection: without a route, owner and subject are null (never the owner hint) and CASE_ROUTE_UNBOUND is listed", async () => {
    const w = await world();
    const unbound = await createCase(w.agency.data.id);
    await patchCase(unbound.data.id, { ownerHintId: w.owner.data.id });
    const view = await context(unbound.data.id);
    expect(view.context.party.ownerId).toBeNull();
    expect(view.context.party.legalSubjectId).toBeNull();
    expect(view.context.party.legalSubjectName).toBeNull();
    expect(codes(view.context.missing)).toContain('CASE_ROUTE_UNBOUND');
    expect(
      view.context.missing.find((entry) => entry.code === 'CASE_ROUTE_UNBOUND')?.fieldPath,
    ).toBe('party.legalSubjectId');
    await caseCommand('RouteBindingCase', unbound.data.id, 'route-binding', {
      routeId: w.route.data.id,
      reason: 'SYNTHETIC route binding',
    });
    const bound = await context(unbound.data.id);
    expect([bound.context.party.ownerId, bound.context.party.legalSubjectId]).toEqual([
      w.owner.data.id,
      w.subject.data.id,
    ]);
    expect(codes(bound.context.missing)).not.toContain('CASE_ROUTE_UNBOUND');
    // An agency without a recorded legal name: the name stays null, the display name is not used.
    const unnamed = await createAgency('N');
    const unnamedCase = await createCase(unnamed.data.id);
    expect((await context(unnamedCase.data.id)).context.party.agencyLegalName).toBeNull();
  });

  it("the route's default signer and preferred coverage never replace the selection: changing them changes neither the context nor its digest", async () => {
    const p = await productionWorld();
    const before = await context(p.caseId, { authoritySelectionId: p.selection.id });
    const otherSigner = await createSigner(p.w.agency.data.id, 'SYNTHETIC Other Signer');
    const preferred = await authority(p.w, { label: 'preferred', signerId: otherSigner.data.id });
    await patchRoute(p.w.route.data.id, {
      defaultSignerId: otherSigner.data.id,
      preferredCoverageId: preferred.coverage.data.id,
    });
    const after = await context(p.caseId, { authoritySelectionId: p.selection.id });
    expect(after.context.party.signerId).toBe(p.w.signer.data.id);
    expect(after.context.authority?.coverages.map((block) => block.coverage.id)).toEqual([
      p.a.coverage.data.id,
    ]);
    expect(after.context).toEqual(before.context);
    expect(after.dependencyDigest).toBe(before.dependencyDigest);
    // The route's row version moved (a diagnostic); its semantic fingerprint did not.
    const routeBefore = depOf(before, 'Route', p.w.route.data.id);
    const routeAfter = depOf(after, 'Route', p.w.route.data.id);
    expect(routeAfter?.rowVersion).toBeGreaterThan(routeBefore?.rowVersion ?? Infinity);
    expect(routeAfter?.fingerprint).toBe(routeBefore?.fingerprint);
    expect(deps(after)).not.toContain(`MandateCoverage:${preferred.coverage.data.id}`);
    expect(deps(after)).not.toContain(`Signer:${otherSigner.data.id}`);
  });

  it('exact version and coverage pinning: a successor version and coverage of the same route are not used, but their existence changes the digest; the pinned records stay as they are', async () => {
    const p = await productionWorld();
    const before = await context(p.caseId, { authoritySelectionId: p.selection.id });
    const successor = await createVersion(p.a.mandate.data.id, {
      changeKind: 'AMENDMENT',
      predecessorId: p.a.version.data.id,
      primarySourceId: p.w.source.id,
      documentState: 'SIGNED_APPEARING',
    });
    const successorCoverage = await createCoverage(successor.data.id, {
      routeId: p.w.route.data.id,
      basisSourceId: p.a.basis.id,
      predecessorCoverageId: p.a.coverage.data.id,
      coverageLabel: 'SYNTHETIC amended coverage',
    });
    await addCoverageSigner(successorCoverage.data.id, { signerId: p.w.signer.data.id });
    await freeze(successor.data.id);
    const after = await context(p.caseId, { authoritySelectionId: p.selection.id });
    expect(after.context.authority).toEqual(before.context.authority);
    expect(after.contextRevision).toBe(before.contextRevision);
    expect(after.dependencyDigest).not.toBe(before.dependencyDigest);
    expect(depOf(after, 'MandateVersion', p.a.version.data.id)?.fingerprint).not.toBe(
      depOf(before, 'MandateVersion', p.a.version.data.id)?.fingerprint,
    );
    expect(depOf(after, 'MandateCoverage', p.a.coverage.data.id)?.fingerprint).not.toBe(
      depOf(before, 'MandateCoverage', p.a.coverage.data.id)?.fingerprint,
    );
    expect(deps(after)).not.toContain(`MandateVersion:${successor.data.id}`);
    expect(deps(after)).not.toContain(`MandateCoverage:${successorCoverage.data.id}`);
  });

  it('authority events recorded after the selection: a whole-mandate event and one scoped to a pinned coverage are in the context, in recording order, and change the digest without touching the case; an event scoped to another coverage of the same mandate is not; nothing is judged current, expired, valid or invalid', async () => {
    const w = await world();
    const owner = await createOwner('Y');
    const subject = await createSubject('M');
    const association = await link(owner.data.id, subject.data.id);
    const otherRoute = await createRoute({
      agencyId: w.agency.data.id,
      ownerSubjectId: association.data.id,
    });
    const mandate = await createMandate(w.agency.data.id);
    const basis = await createSource({ agencyId: w.agency.data.id, title: 'SYNTHETIC basis' });
    const version = await createVersion(mandate.data.id, {
      primarySourceId: w.source.id,
      documentState: 'SIGNED_APPEARING',
    });
    const pinned = await createCoverage(version.data.id, {
      routeId: w.route.data.id,
      basisSourceId: basis.id,
      actionScope: ['PREPARE_NOTICE'],
    });
    // A coverage basis counts as its route owner's material: the other route needs its own.
    const otherBasis = await createSource({
      agencyId: w.agency.data.id,
      title: 'SYNTHETIC other basis',
    });
    const other = await createCoverage(version.data.id, {
      routeId: otherRoute.data.id,
      basisSourceId: otherBasis.id,
      coverageLabel: 'SYNTHETIC other route coverage',
    });
    await addCoverageSigner(pinned.data.id, { signerId: w.signer.data.id, sourceId: basis.id });
    await freeze(version.data.id);
    const created = await createCase(w.agency.data.id, { routeId: w.route.data.id });
    const selection = await select(created.data.id, choose(w, [pinned.data.id]));
    const read = () => context(created.data.id, { authoritySelectionId: selection.id });
    const before = await read();
    const caseBefore = await getCase(created.data.id);
    const letter = await createSource({
      agencyId: w.agency.data.id,
      title: 'SYNTHETIC termination letter',
    });

    t.clock.advance(1000);
    await recordEvent(mandate.data.id, {
      eventType: 'REVOCATION',
      sourceId: otherBasis.id,
      coverageId: other.data.id,
      scopeText: 'SYNTHETIC other coverage only',
    });
    const unrelated = await read();
    expect(unrelated.context).toEqual(before.context);
    expect(unrelated.dependencyDigest).toBe(before.dependencyDigest);

    t.clock.advance(1000);
    const termination = await recordEvent(mandate.data.id, {
      eventType: 'TERMINATION',
      sourceId: letter.id,
      effectiveOn: '2026-01-31',
    });
    t.clock.advance(1000);
    const scoped = await recordEvent(mandate.data.id, {
      eventType: 'CURRENTNESS_RECORDED',
      sourceId: letter.id,
      coverageId: pinned.data.id,
      scopeText: 'SYNTHETIC pinned coverage',
    });
    const after = await read();
    expect((await getCase(created.data.id)).data.rowVersion).toBe(caseBefore.data.rowVersion);
    expect(after.contextRevision).toBe(before.contextRevision);
    expect(after.context.authority?.coverages[0]?.authorityEvents).toEqual([termination, scoped]);
    expect(after.context.authority?.selection).toEqual(before.context.authority?.selection);
    expect(after.dependencyDigest).not.toBe(before.dependencyDigest);
    expect(depOf(after, 'AuthorityEvent', termination.id)?.rowVersion).toBeNull();
    expect(after.context.sources.map((entry) => entry.sourceId)).toContain(letter.id);
    expect(after.context.missing).toEqual(before.context.missing);
    expect(after.context.conflicts).toEqual(before.context.conflicts);
    expect(JSON.stringify(after.context.authority)).not.toMatch(
      /"(current|expired|valid|invalid|isCurrent|g1\w*)"\s*:/i,
    );
  });

  it('administrative states after the selection do not rewrite it: an ENDED signer and an archived mandate stay in the context as selected; their changed state changes the digest', async () => {
    const p = await productionWorld();
    const before = await context(p.caseId, { authoritySelectionId: p.selection.id });
    const signer = await getSigner(p.w.signer.data.id);
    expect(
      (
        await command('setSignerState', `/signers/${signer.data.id}/state`, signer.etag, {
          state: 'ENDED',
          reason: 'SYNTHETIC ended',
        })
      ).status,
    ).toBe(200);
    const ended = await context(p.caseId, { authoritySelectionId: p.selection.id });
    expect(ended.context.party.signerId).toBe(p.w.signer.data.id);
    expect(ended.context.party.signerFullLegalName).toBe(p.w.signer.data.fullLegalName);
    expect(ended.context.authority).toEqual(before.context.authority);
    expect(ended.dependencyDigest).not.toBe(before.dependencyDigest);
    const mandate = await getMandate(p.a.mandate.data.id);
    expect(
      (await command('archiveMandate', `/mandates/${mandate.data.id}/archive`, mandate.etag))
        .status,
    ).toBe(200);
    const archived = await context(p.caseId, { authoritySelectionId: p.selection.id });
    expect(archived.context.authority).toEqual(before.context.authority);
    expect(archived.dependencyDigest).not.toBe(ended.dependencyDigest);
  });
});

describe('AUTHORITY SOURCES — pinned revisions, never followed', () => {
  it("the version's primary source and the coverage basis stay the exact revisions the pinned records name: newer revisions are not listed or used, and their existence changes the digest, never the authority block", async () => {
    const p = await productionWorld();
    const read = () => context(p.caseId, { authoritySelectionId: p.selection.id });
    const before = await read();
    const newerPrimary = await reviseSource(p.w.source.id, {
      agencyId: p.w.agency.data.id,
      title: 'SYNTHETIC agency record, revision 2',
      sourceRole: 'CANONICAL_RECORD',
    });
    const newerBasis = await reviseSource(p.a.basis.id, {
      agencyId: p.w.agency.data.id,
      title: 'SYNTHETIC coverage basis, revision 2',
    });
    const after = await read();
    expect(after.context.authority).toEqual(before.context.authority);
    expect(after.context.authority?.coverages[0]?.version.primarySourceId).toBe(p.w.source.id);
    expect(after.context.authority?.coverages[0]?.coverage.basisSourceId).toBe(p.a.basis.id);
    expect(after.context.authority?.coverages[0]?.signerScopes[0]?.sourceId).toBe(p.a.basis.id);
    const ids = after.context.sources.map((entry) => entry.sourceId);
    expect(ids).toEqual(before.context.sources.map((entry) => entry.sourceId));
    expect(ids).not.toContain(newerPrimary.id);
    expect(ids).not.toContain(newerBasis.id);
    expect(changed(after, before)).toEqual(
      [`SourceReference:${p.w.source.id}`, `SourceReference:${p.a.basis.id}`].sort(),
    );
    expect(after.dependencyDigest).not.toBe(before.dependencyDigest);
    expect(after.contextRevision).toBe(before.contextRevision);
  });
});

describe('INTAKE RECORDS — exact records of this case; archived ones only when an included record still names them', () => {
  it("reported items, works and mappings are the case's unarchived records exactly as stored, in recording order; an archived record nothing names is left out; one a fact or mapping still names is kept as recorded and listed as a conflict, never silently resurrected or dropped", async () => {
    const p = await productionWorld();
    t.clock.advance(1000);
    const second = await createItem(p.caseId, { rawUrl: itemUrl('abcdefghijk') });
    t.clock.advance(1000);
    const spare = await createWork(p.caseId, { title: 'SYNTHETIC spare work' });
    const read = () => context(p.caseId, { authoritySelectionId: p.selection.id });
    const before = await read();
    expect(before.context.reportedItems.map((row) => row.id)).toEqual([
      p.item.data.id,
      second.data.id,
    ]);
    expect(before.context.works.map((row) => row.id)).toEqual([p.work.data.id, spare.data.id]);
    expect(before.context.missing).toEqual([
      {
        code: 'REPORTED_ITEM_UNMAPPED',
        message: `No use mapping is recorded for reported item ${second.data.id}.`,
        fieldPath: 'reportedItems[1]',
      },
    ]);
    // Archived and named by nothing: gone from the context and from its dependencies.
    await archiveChild('works', p.caseId, spare.data.id);
    await archiveChild('reported-items', p.caseId, second.data.id);
    const pruned = await read();
    expect(pruned.context.works.map((row) => row.id)).toEqual([p.work.data.id]);
    expect(pruned.context.reportedItems.map((row) => row.id)).toEqual([p.item.data.id]);
    expect(deps(pruned)).not.toContain(`CaseWork:${spare.data.id}`);
    expect(deps(pruned)).not.toContain(`ReportedItem:${second.data.id}`);
    expect(pruned.context.missing).toEqual([]);
    expect(pruned.context.conflicts).toEqual([]);
    // A USE-scoped fact names the mapping; the mapping names the work and the item. Archiving all
    // three keeps them (a fact still names them), each listed as a conflict, and the gaps show.
    const useFact = await createFact(p.caseId, {
      factType: 'AV_COMPARISON',
      scopeKind: 'USE',
      mappingId: p.mapping.data.id,
      provenance: 'OPERATOR_REPORTED',
    });
    await archiveChild('mappings', p.caseId, p.mapping.data.id);
    await archiveChild('works', p.caseId, p.work.data.id);
    await archiveChild('reported-items', p.caseId, p.item.data.id);
    const kept = await read();
    const mapping = (await getMapping(p.caseId, p.mapping.data.id)).data;
    const work = (await getWork(p.caseId, p.work.data.id)).data;
    const item = (await getItem(p.caseId, p.item.data.id)).data;
    expect(mapping.archivedAt).not.toBeNull();
    expect(kept.context.mappings).toEqual([mapping]);
    expect(kept.context.works).toEqual([work]);
    expect(kept.context.reportedItems).toEqual([item]);
    expect(codes(kept.context.missing)).toEqual([
      'REPORTED_ITEMS_ABSENT',
      'WORKS_ABSENT',
      'USE_MAPPINGS_ABSENT',
    ]);
    expect(kept.context.conflicts).toEqual([
      {
        code: 'ARCHIVED_RECORD_REFERENCED',
        message: `Reported item ${item.id} is archived; it is kept because use mapping ${mapping.id} still names it.`,
        fieldPath: 'reportedItems[0]',
      },
      {
        code: 'ARCHIVED_RECORD_REFERENCED',
        message: `Work ${work.id} is archived; it is kept because use mapping ${mapping.id} still names it.`,
        fieldPath: 'works[0]',
      },
      {
        code: 'ARCHIVED_RECORD_REFERENCED',
        message: `Use mapping ${mapping.id} is archived; it is kept because fact ${useFact.id} still names it.`,
        fieldPath: 'mappings[0]',
      },
    ]);
    // DRAFTING refuses (reported items, works and mappings are required content); nothing is filled in.
    const drafting = await readContext(p.caseId, {
      authoritySelectionId: p.selection.id,
      generationMode: 'DRAFTING',
    });
    expect(outcome(drafting)).toEqual([422, 'DRAFTING_INPUT_MISSING']);
    expect(detailsOf(drafting)['missing']).toEqual([
      'REPORTED_ITEMS_ABSENT',
      'WORKS_ABSENT',
      'USE_MAPPINGS_ABSENT',
    ]);
    // Values exactly as stored: nothing about infringement, ownership or copying is added.
    const serialized = JSON.stringify(kept.context.mappings);
    expect(serialized).not.toMatch(/infring|owner|copied|verdict|finding/i);
  });

  it('a mapping recorded with provenance CONFLICT is kept as recorded and listed as a conflict; its basis source stays the exact revision it names', async () => {
    const p = await productionWorld();
    t.clock.advance(1000);
    const other = await createItem(p.caseId, { rawUrl: itemUrl('zyxwvutsrqp') });
    const conflicting = await createMapping(p.caseId, {
      caseWorkId: p.work.data.id,
      reportedItemId: other.data.id,
      basisSourceId: p.basis.id,
      provenance: 'CONFLICT',
    });
    const newer = await reviseSource(p.basis.id, {
      agencyId: p.w.agency.data.id,
      title: 'SYNTHETIC basis, revision 2',
    });
    const view = await context(p.caseId, { authoritySelectionId: p.selection.id });
    expect(view.context.mappings).toEqual([p.mapping.data, conflicting.data]);
    expect(view.context.mappings.map((row) => row.basisSourceId)).toEqual([p.basis.id, p.basis.id]);
    expect(view.context.conflicts).toEqual([
      {
        code: 'MAPPING_PROVENANCE_CONFLICT',
        message: `Use mapping ${conflicting.data.id} is recorded with provenance CONFLICT.`,
        fieldPath: 'mappings[1]',
      },
    ]);
    const ids = view.context.sources.map((entry) => entry.sourceId);
    expect(ids).toContain(p.basis.id);
    expect(ids).not.toContain(newer.id);
    expect(deps(view)).not.toContain(`SourceReference:${newer.id}`);
  });
});

describe('FACTS AND SOURCES — chain heads, provenance as recorded, pinned supports, closure-only manifests', () => {
  it('facts: only the head of each chain is read as current; earlier revisions stay unchanged and readable (WITHDRAWN deletes no history); each revision moves the revision and the digest; supports of earlier revisions are not carried over', async () => {
    const p = await productionWorld();
    const read = () => context(p.caseId, { authoritySelectionId: p.selection.id });
    const first = await read();
    const second = await reviseFact(p.caseId, p.fact.id, {
      factType: 'RIGHTS_BASIS',
      provenance: 'OPERATOR_REPORTED',
      changeReason: 'SYNTHETIC second reading',
      value: { ...FACT_VALUES['RIGHTS_BASIS'], assertion: 'SYNTHETIC second assertion' },
      sources: [support(p.linked.data.id)],
    });
    const middle = await read();
    expect(middle.context.facts).toEqual([second]);
    expect(middle.contextRevision).toBe(first.contextRevision + 1);
    expect(middle.dependencyDigest).not.toBe(first.dependencyDigest);
    const third = await reviseFact(p.caseId, second.id, {
      factType: 'RIGHTS_BASIS',
      provenance: 'MISSING',
      resolutionState: 'WITHDRAWN',
      changeReason: 'SYNTHETIC withdrawn by the operator',
      sources: [],
    });
    const last = await read();
    expect(last.context.facts).toEqual([third]);
    expect(third.supersedesFactId).toBe(second.id);
    expect(last.context.facts[0]?.resolutionState).toBe('WITHDRAWN');
    expect(deps(last)).not.toContain(`CaseFact:${p.fact.id}`);
    expect(deps(last)).not.toContain(`CaseFact:${second.id}`);
    expect(last.dependencies.filter((d) => d.entityType === 'FactSource')).toEqual([]);
    expect(codes(last.context.missing)).toEqual(['FACT_PROVENANCE_MISSING']);
    expect(await getFact(p.caseId, p.fact.id)).toEqual(p.fact);
    expect(await getFact(p.caseId, second.id)).toEqual(second);
    // The still-LINKED evidence stays a case source of the context; nothing is re-pointed.
    expect(last.context.sources.map((entry) => entry.sourceId)).toContain(p.evidence.id);
  });

  it('every provenance class and resolution state is kept as recorded: MISSING is listed as missing (never false), CONFLICT as a conflict (never resolved), UNASSESSED is not support, WITHDRAWN stays visible, DOCUMENT_REVIEWED only as recorded — a support never upgrades anything', async () => {
    const p = await productionWorld();
    const reviewed = await createSource({
      agencyId: p.w.agency.data.id,
      title: 'SYNTHETIC reviewed record',
      reportedProvenance: 'DOCUMENT_REVIEWED',
      reviewedByLabel: 'SYNTHETIC Reviewer',
      reviewedAt: '2026-09-20T10:00:00Z',
    });
    const reviewedLink = await linkSource(p.caseId, reviewed.id);
    const facts: CaseFact[] = [p.fact];
    for (const body of [
      {
        factType: 'WORK_IDENTIFICATION',
        provenance: 'DOCUMENT_REVIEWED',
        resolutionState: 'SUPPORTED_FOR_SCOPE',
        sources: [support(reviewedLink.data.id)],
      },
      // Supported by a reviewed source, recorded as reported: stays OPERATOR_REPORTED.
      {
        factType: 'REPORTED_IDENTIFICATION',
        provenance: 'OPERATOR_REPORTED',
        sources: [support(reviewedLink.data.id)],
      },
      { factType: 'AV_COMPARISON', provenance: 'ANALYSIS' },
      { factType: 'PERMISSION', provenance: 'MISSING' },
      { factType: 'EXCEPTION_REVIEW', provenance: 'CONFLICT', resolutionState: 'CONFLICT' },
      {
        factType: 'DUPLICATE_REVIEW',
        provenance: 'OPERATOR_REPORTED',
        resolutionState: 'WITHDRAWN',
      },
    ]) {
      t.clock.advance(1000);
      facts.push(await createFact(p.caseId, body));
    }
    const view = await context(p.caseId, { authoritySelectionId: p.selection.id });
    expect(view.context.facts).toEqual(facts);
    expect(view.context.facts.map((fact) => [fact.provenance, fact.resolutionState])).toEqual([
      ['OPERATOR_REPORTED', 'UNASSESSED'],
      ['DOCUMENT_REVIEWED', 'SUPPORTED_FOR_SCOPE'],
      ['OPERATOR_REPORTED', 'UNASSESSED'],
      ['ANALYSIS', 'UNASSESSED'],
      ['MISSING', 'UNASSESSED'],
      ['CONFLICT', 'CONFLICT'],
      ['OPERATOR_REPORTED', 'WITHDRAWN'],
    ]);
    // MISSING permission: the recorded value (finding UNKNOWN) — never "no permission" or false.
    expect(view.context.facts[4]?.value).toEqual(FACT_VALUES['PERMISSION']);
    expect(view.context.missing).toEqual([
      {
        code: 'FACT_PROVENANCE_MISSING',
        message: `Fact ${facts[4]?.id} (PERMISSION) is recorded with provenance MISSING. It is not read as false, absent or negative.`,
        fieldPath: 'facts[4]',
      },
    ]);
    expect(view.context.conflicts).toEqual([
      {
        code: 'FACT_PROVENANCE_CONFLICT',
        message: `Fact ${facts[5]?.id} (EXCEPTION_REVIEW) is recorded with provenance CONFLICT.`,
        fieldPath: 'facts[5]',
      },
      {
        code: 'FACT_RESOLUTION_CONFLICT',
        message: `Fact ${facts[5]?.id} (EXCEPTION_REVIEW) is recorded with resolution state CONFLICT.`,
        fieldPath: 'facts[5]',
      },
    ]);
    const entry = view.context.sources.find((source) => source.sourceId === reviewed.id);
    expect(entry?.provenance).toBe('DOCUMENT_REVIEWED');
    expect(
      view.context.sources.find((source) => source.sourceId === p.evidence.id)?.provenance,
    ).toBe('OPERATOR_REPORTED');
    // Every support is a dependency, exactly the rows recorded for these revisions.
    const stored = await prisma.factSource.findMany({
      where: { factId: { in: facts.map((fact) => fact.id) } },
      select: { id: true },
    });
    expect(
      view.dependencies
        .filter((d) => d.entityType === 'FactSource')
        .map((d) => d.entityId)
        .sort(),
    ).toEqual(stored.map((row) => row.id).sort());
  });

  it('a support stays pinned to the exact source revision its link names: a newer revision is never followed, but its existence changes the digest; a PAUSED or UNLINKED link keeps the recorded support, is listed as a conflict and changes the digest', async () => {
    const p = await productionWorld();
    const read = () => context(p.caseId, { authoritySelectionId: p.selection.id });
    const before = await read();
    const newer = await reviseSource(p.evidence.id, {
      agencyId: p.w.agency.data.id,
      title: 'SYNTHETIC evidence, revision 2',
      canonicalUrl: 'https://evidence.example.invalid/record-2',
      scopeText: 'SYNTHETIC revised scope',
    });
    const revised = await read();
    expect(revised.context).toEqual(before.context);
    expect(revised.contextRevision).toBe(before.contextRevision);
    expect(revised.context.sources.map((entry) => entry.sourceId)).not.toContain(newer.id);
    expect(deps(revised)).not.toContain(`SourceReference:${newer.id}`);
    expect(depOf(revised, 'SourceReference', p.evidence.id)?.fingerprint).not.toBe(
      depOf(before, 'SourceReference', p.evidence.id)?.fingerprint,
    );
    expect(revised.dependencyDigest).not.toBe(before.dependencyDigest);

    await setLinkState(p.linked.data.id, 'PAUSED');
    const paused = await read();
    expect(paused.context.facts).toEqual([p.fact]);
    expect(deps(paused)).toContain(`CaseSource:${p.linked.data.id}`);
    expect(paused.context.sources.map((entry) => entry.sourceId)).toContain(p.evidence.id);
    const supportRow = paused.dependencies.find((d) => d.entityType === 'FactSource');
    expect(supportRow).toBeDefined();
    expect(paused.context.conflicts).toEqual([
      {
        code: 'SUPPORT_LINK_NOT_LINKED',
        message: `A recorded support of fact ${p.fact.id} names case source ${p.linked.data.id}, which is now PAUSED. The support is kept as recorded.`,
        fieldPath: 'facts[0]',
      },
    ]);
    expect(paused.dependencyDigest).not.toBe(revised.dependencyDigest);
    await setLinkState(p.linked.data.id, 'UNLINKED');
    const unlinked = await read();
    expect(unlinked.context.conflicts[0]?.message).toContain('which is now UNLINKED');
    expect(unlinked.dependencies.find((d) => d.entityType === 'FactSource')).toEqual(supportRow);
    expect(unlinked.dependencyDigest).not.toBe(paused.dependencyDigest);
    // The fact's recorded provenance is unchanged by any of this.
    expect(unlinked.context.facts[0]?.provenance).toBe('OPERATOR_REPORTED');
  });

  it("the source manifest is exactly the sources of the closure, by id, with the recorded fields: an unrelated registry source, another case's link and an unlinked, unsupported source are absent; the order is deterministic", async () => {
    const p = await productionWorld();
    const unrelated = await createSource({
      agencyId: p.w.agency.data.id,
      title: 'SYNTHETIC unrelated registry source',
      canonicalUrl: 'https://evidence.example.invalid/record-1',
    });
    const otherCase = await createCase(p.w.agency.data.id, { routeId: p.w.route.data.id });
    const otherOnly = await createSource({
      agencyId: p.w.agency.data.id,
      title: 'SYNTHETIC other case source',
    });
    await linkSource(otherCase.data.id, otherOnly.id);
    const dropped = await createSource({
      agencyId: p.w.agency.data.id,
      title: 'SYNTHETIC dropped link',
    });
    const droppedLink = await linkSource(p.caseId, dropped.id);
    await setLinkState(droppedLink.data.id, 'UNLINKED');
    const hashed = await createSource({
      agencyId: p.w.agency.data.id,
      title: 'SYNTHETIC hashed file',
      contentSha256: 'a'.repeat(64),
      hashTarget: 'RAW_FILE',
      limitations: 'SYNTHETIC limitation as recorded',
    });
    await linkSource(p.caseId, hashed.id);
    const view = await context(p.caseId, { authoritySelectionId: p.selection.id });
    const ids = view.context.sources.map((entry) => entry.sourceId);
    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([p.basis.id, p.evidence.id, p.w.source.id, p.a.basis.id, hashed.id].sort());
    for (const absent of [unrelated.id, otherOnly.id, dropped.id]) {
      expect(ids).not.toContain(absent);
      expect(deps(view)).not.toContain(`SourceReference:${absent}`);
    }
    expect(view.context.sources.find((entry) => entry.sourceId === hashed.id)).toEqual({
      sourceId: hashed.id,
      role: 'OPERATOR_INPUT',
      canonicalUrl: null,
      contentSha256: 'a'.repeat(64),
      hashTarget: 'RAW_FILE',
      provenance: 'OPERATOR_REPORTED',
      scopeText: SOURCE_BASE.scopeText,
      limitations: 'SYNTHETIC limitation as recorded',
    });
    // A hash and a URL are recorded values, never a review: provenance stays as recorded.
    expect(view.context.sources.every((entry) => entry.provenance === 'OPERATOR_REPORTED')).toBe(
      true,
    );
    const again = await context(p.caseId, { authoritySelectionId: p.selection.id });
    expect(again).toEqual(view);
  });

  it("policySources: only POLICY_REFERENCE sources explicitly LINKED to this case — never a registry sweep, never another case's link; an empty set is the truthful answer", async () => {
    const p = await productionWorld();
    const policy = await createSource({
      agencyId: p.w.agency.data.id,
      title: 'SYNTHETIC platform policy page',
      sourceRole: 'POLICY_REFERENCE',
      canonicalUrl: 'https://policy.example.invalid/copyright',
    });
    await createSource({
      title: 'SYNTHETIC unlinked policy reference',
      sourceRole: 'POLICY_REFERENCE',
    });
    const otherCase = await createCase(p.w.agency.data.id);
    const otherPolicy = await createSource({
      agencyId: p.w.agency.data.id,
      title: 'SYNTHETIC other case policy',
      sourceRole: 'POLICY_REFERENCE',
    });
    await linkSource(otherCase.data.id, otherPolicy.id);
    const none = await context(p.caseId, { authoritySelectionId: p.selection.id });
    expect(none.context.policySources).toEqual([]);
    expect(codes(none.context.missing)).toEqual([]);
    const policyLink = await linkSource(p.caseId, policy.id, 'SYNTHETIC_POLICY');
    const linked = await context(p.caseId, { authoritySelectionId: p.selection.id });
    expect(linked.context.policySources).toEqual([
      {
        sourceId: policy.id,
        role: 'POLICY_REFERENCE',
        canonicalUrl: 'https://policy.example.invalid/copyright',
        contentSha256: null,
        hashTarget: null,
        provenance: 'OPERATOR_REPORTED',
        scopeText: SOURCE_BASE.scopeText,
        limitations: null,
      },
    ]);
    expect(linked.context.sources.map((entry) => entry.sourceId)).not.toContain(policy.id);
    expect(linked.dependencyDigest).not.toBe(none.dependencyDigest);
    await setLinkState(policyLink.data.id, 'PAUSED');
    const paused = await context(p.caseId, { authoritySelectionId: p.selection.id });
    expect(paused.context.policySources).toEqual([]);
    expect(paused.context.sources.map((entry) => entry.sourceId)).not.toContain(policy.id);
  });

  it('source text a manifest entry cannot hold is never cut: the source stays a dependency and a missing item says so; an access check recorded as unavailable and a source recorded as CONFLICT are listed', async () => {
    const p = await productionWorld();
    const long = await createSource({
      agencyId: p.w.agency.data.id,
      title: 'SYNTHETIC long scope',
      scopeText: 'S'.repeat(5001),
    });
    const longLimits = await createSource({
      agencyId: p.w.agency.data.id,
      title: 'SYNTHETIC long limitations',
      limitations: 'L'.repeat(5001),
    });
    const edge = await createSource({
      agencyId: p.w.agency.data.id,
      title: 'SYNTHETIC scope at the bound',
      scopeText: 'E'.repeat(5000),
    });
    const unavailable = await createSource({
      agencyId: p.w.agency.data.id,
      title: 'SYNTHETIC unavailable',
      accessState: 'UNAVAILABLE_AT_CHECK',
    });
    const conflicting = await createSource({
      agencyId: p.w.agency.data.id,
      title: 'SYNTHETIC conflicting',
      reportedProvenance: 'CONFLICT',
    });
    for (const source of [long, longLimits, edge, unavailable, conflicting]) {
      await linkSource(p.caseId, source.id);
    }
    const view = await context(p.caseId, { authoritySelectionId: p.selection.id });
    const ids = view.context.sources.map((entry) => entry.sourceId);
    expect(ids).not.toContain(long.id);
    expect(ids).not.toContain(longLimits.id);
    expect(ids).toContain(edge.id);
    expect(
      view.context.sources.find((entry) => entry.sourceId === edge.id)?.scopeText,
    ).toHaveLength(5000);
    expect(deps(view)).toContain(`SourceReference:${long.id}`);
    expect(deps(view)).toContain(`SourceReference:${longLimits.id}`);
    const tooLong = view.context.missing.filter(
      (entry) => entry.code === 'SOURCE_MANIFEST_TEXT_TOO_LONG',
    );
    expect(tooLong.map((entry) => entry.fieldPath)).toEqual(['sources', 'sources']);
    expect(tooLong.map((entry) => entry.message).join('\n')).toContain(
      `Source ${long.id} is part of this context, but its recorded scope text (5001 characters)`,
    );
    expect(tooLong.map((entry) => entry.message).join('\n')).toContain(
      `Source ${longLimits.id} is part of this context, but its recorded limitations (5001 characters)`,
    );
    const unavailableIndex = ids.indexOf(unavailable.id);
    expect(view.context.missing).toContainEqual({
      code: 'SOURCE_UNAVAILABLE_AT_CHECK',
      message: `Source ${unavailable.id} is recorded as unavailable at its access check.`,
      fieldPath: `sources[${unavailableIndex}]`,
    });
    expect(view.context.conflicts).toEqual([
      {
        code: 'SOURCE_PROVENANCE_CONFLICT',
        message: `Source ${conflicting.id} is recorded with provenance CONFLICT.`,
        fieldPath: `sources[${ids.indexOf(conflicting.id)}]`,
      },
    ]);
  });
});

describe('CORRESPONDENCE — explicit bindings only, one entry per message, capture posture as recorded', () => {
  const byId = <T extends { readonly id: string }>(rows: readonly T[]) =>
    [...rows].sort((x, y) => (x.id < y.id ? -1 : 1));

  it("a reply context holds exactly the named parent and prior bindings' messages as captured: OPERATOR_REPORTED stays OPERATOR_REPORTED (listed as limited, never verified), a full-text parent is not flagged; no outcome, receipt or verification is added", async () => {
    const r = await replyWorld();
    const view = await context(r.caseId, REPLY(r));
    expect(view.context.parentBindingId).toBe(r.nmi.id);
    expect(view.context.priorCorrespondenceIds).toEqual([r.sentMessage.id]);
    expect(byId(view.context.correspondence)).toEqual(
      byId([await getCorrespondence(r.nmiMessage.id), await getCorrespondence(r.sentMessage.id)]),
    );
    const sent = view.context.correspondence.find((row) => row.id === r.sentMessage.id);
    expect([sent?.direction, sent?.captureMode, sent?.bodyRole, sent?.bodyText]).toEqual([
      'OUTBOUND',
      'OPERATOR_REPORTED',
      'UNKNOWN',
      null,
    ]);
    expect(view.context.missing).toEqual([
      {
        code: 'PRIOR_AS_SENT_RAW_SOURCE_ABSENT',
        message: `The prior transmission ${r.sentMessage.id} is recorded as OPERATOR_REPORTED: the exact message as sent (raw source) is not captured, so its wording and attachments stay at their recorded level.`,
        fieldPath: `correspondence[${view.context.correspondence.findIndex((row) => row.id === r.sentMessage.id)}]`,
      },
    ]);
    expect(deps(view)).toEqual(
      expect.arrayContaining([
        `CorrespondenceBinding:${r.nmi.id}`,
        `CorrespondenceBinding:${r.sent.id}`,
        `Correspondence:${r.nmiMessage.id}`,
        `Correspondence:${r.sentMessage.id}`,
      ]),
    );
    const text = JSON.stringify(view.context);
    expect(text).not.toMatch(
      /"(outcome|delivered|received|verified|transmissionVerified|platformStatus)"\s*:/,
    );
    // No outcome from silence: nothing was bound as OUTCOME, and nothing says otherwise.
    expect(text).not.toMatch(/REMOVED|REINSTATED|REJECTED|RETRACTED/);
  });

  it('an EXCERPT parent is listed as lacking its full text; a RAW_SOURCE prior is not listed and its raw and attachment sources join the manifest; attachment observations are kept exactly as recorded', async () => {
    const r = await replyWorld();
    const excerpt = await capture(r.w.agency.data.id, {
      subject: 'SYNTHETIC NMI (excerpt)',
      captureMode: 'EXCERPT',
      bodyRole: 'EXCERPT',
      bodyText: 'SYNTHETIC … please provide …',
    });
    const excerptBinding = await bind(r.caseId, { correspondenceId: excerpt.id, eventType: 'NMI' });
    const raw = await createSource({
      agencyId: r.w.agency.data.id,
      title: 'SYNTHETIC raw message file',
    });
    const attachment = await createSource({
      agencyId: r.w.agency.data.id,
      title: 'SYNTHETIC attachment',
    });
    const rawSent = await capture(r.w.agency.data.id, {
      direction: 'OUTBOUND',
      subject: 'SYNTHETIC notice as sent (raw)',
      captureMode: 'RAW_SOURCE',
      rawSourceId: raw.id,
      attachmentsManifest: [
        {
          fileName: 'SYNTHETIC-licence.pdf',
          sourceId: attachment.id,
          state: 'OBSERVED_IN_RAW_MIME',
        },
        { fileName: 'SYNTHETIC-claimed.txt', state: 'COPIED_TEXT_ALLEGATION' },
      ],
    });
    const rawBinding = await bind(r.caseId, {
      correspondenceId: rawSent.id,
      eventType: 'INITIAL_AS_SENT',
      reportedItemId: r.item.data.id,
    });
    const view = await context(r.caseId, {
      ...REPLY(r),
      parentBindingId: excerptBinding.id,
      priorBindingIds: [rawBinding.id],
    });
    expect(byId(view.context.correspondence)).toEqual(
      byId([await getCorrespondence(excerpt.id), await getCorrespondence(rawSent.id)]),
    );
    expect(
      view.context.correspondence.find((row) => row.id === rawSent.id)?.attachmentsManifest,
    ).toEqual([
      { fileName: 'SYNTHETIC-licence.pdf', sourceId: attachment.id, state: 'OBSERVED_IN_RAW_MIME' },
      { fileName: 'SYNTHETIC-claimed.txt', state: 'COPIED_TEXT_ALLEGATION' },
    ]);
    expect(codes(view.context.missing)).toEqual(['REPLY_PARENT_FULL_TEXT_ABSENT']);
    expect(view.context.missing[0]?.message).toContain(
      `The NMI message ${excerpt.id} is recorded as EXCERPT`,
    );
    const ids = view.context.sources.map((entry) => entry.sourceId);
    expect(ids).toContain(raw.id);
    expect(ids).toContain(attachment.id);
    // The messages of bindings not named are not part of this context.
    expect(view.context.correspondence.map((row) => row.id)).not.toContain(r.nmiMessage.id);
    expect(view.context.correspondence.map((row) => row.id)).not.toContain(r.sentMessage.id);
  });

  it('one message with several bindings is one message: named twice as prior transmissions it appears once in priorCorrespondenceIds and correspondence, both bindings are dependencies; the order the priors are named in does not matter; a different set of priors is a different context', async () => {
    const r = await replyWorld();
    t.clock.advance(1000);
    const second = await createItem(r.caseId, { rawUrl: itemUrl('abcdefghijk') });
    const again = await bind(r.caseId, {
      correspondenceId: r.sentMessage.id,
      eventType: 'INITIAL_AS_SENT',
      reportedItemId: second.data.id,
    });
    const both = await context(r.caseId, REPLY(r, { priorBindingIds: [r.sent.id, again.id] }));
    expect(both.context.priorCorrespondenceIds).toEqual([r.sentMessage.id]);
    expect(both.context.correspondence.filter((row) => row.id === r.sentMessage.id)).toHaveLength(
      1,
    );
    expect(both.context.correspondence).toHaveLength(2);
    expect(deps(both)).toEqual(
      expect.arrayContaining([
        `CorrespondenceBinding:${r.sent.id}`,
        `CorrespondenceBinding:${again.id}`,
      ]),
    );
    expect(
      codes(both.context.missing).filter((c) => c === 'PRIOR_AS_SENT_RAW_SOURCE_ABSENT'),
    ).toHaveLength(1);
    const reversed = await context(r.caseId, REPLY(r, { priorBindingIds: [again.id, r.sent.id] }));
    expect(reversed).toEqual(both);
    const one = await context(r.caseId, REPLY(r));
    expect(one.dependencyDigest).not.toBe(both.dependencyDigest);
    expect(one.context.priorCorrespondenceIds).toEqual(both.context.priorCorrespondenceIds);
  });

  it("no automatic latest: a newer NMI, a later AS_SENT and an OUTCOME recorded afterwards are never added or used instead of the named bindings; the case's moved revision is the only change", async () => {
    const r = await replyWorld();
    const before = await context(r.caseId, REPLY(r));
    t.clock.advance(60_000);
    const newerNmi = await capture(r.w.agency.data.id, { subject: 'SYNTHETIC second NMI' });
    await bind(r.caseId, { correspondenceId: newerNmi.id, eventType: 'NMI' });
    const laterSent = await capture(r.w.agency.data.id, {
      direction: 'OUTBOUND',
      subject: 'SYNTHETIC later reply',
    });
    await bind(r.caseId, { correspondenceId: laterSent.id, eventType: 'REPLY_AS_SENT' });
    const outcomeMessage = await capture(r.w.agency.data.id, { subject: 'SYNTHETIC outcome' });
    await bind(r.caseId, {
      correspondenceId: outcomeMessage.id,
      eventType: 'OUTCOME',
      reportedItemId: r.item.data.id,
      outcome: 'REMOVED',
    });
    const after = await context(r.caseId, REPLY(r));
    expect(after.context.parentBindingId).toBe(r.nmi.id);
    expect(after.context.priorCorrespondenceIds).toEqual([r.sentMessage.id]);
    expect(after.context.correspondence.map((row) => row.id).sort()).toEqual(
      [r.nmiMessage.id, r.sentMessage.id].sort(),
    );
    expect(after.context.caseContextRevision).toBe(before.context.caseContextRevision + 3);
    expect(deps(after)).toEqual(deps(before));
    expect({ ...after.context, caseContextRevision: 0 }).toEqual({
      ...before.context,
      caseContextRevision: 0,
    });
    expect(JSON.stringify(after.context)).not.toContain('REMOVED');
  });
});

describe('DEPENDENCIES AND DIGEST — the complete closure, deterministic, never a row version or a clock', () => {
  it('the dependencies are exactly the closure of a reply context, in (entityType, entityId) order; row versions only for version-checked records, matching the records; repeated reads are identical', async () => {
    const r = await replyWorld();
    const view = await context(r.caseId, REPLY(r));
    const pinned = await prisma.caseAuthorityCoverage.findMany({
      where: { selectionId: r.selection.id },
    });
    const supports = await prisma.factSource.findMany({ where: { factId: r.fact.id } });
    expect(deps(view).sort()).toEqual(
      [
        `CaseRecord:${r.caseId}`,
        `Agency:${r.w.agency.data.id}`,
        `Route:${r.w.route.data.id}`,
        `OwnerSubject:${r.w.association.data.id}`,
        `Owner:${r.w.owner.data.id}`,
        `LegalSubject:${r.w.subject.data.id}`,
        `CaseAuthoritySelection:${r.selection.id}`,
        `Signer:${r.w.signer.data.id}`,
        ...pinned.map((row) => `CaseAuthorityCoverage:${row.id}`),
        `MandateCoverage:${r.a.coverage.data.id}`,
        `MandateVersion:${r.a.version.data.id}`,
        `Mandate:${r.a.mandate.data.id}`,
        `CoverageSigner:${r.a.coverageSigner.id}`,
        `ReportedItem:${r.item.data.id}`,
        `CaseWork:${r.work.data.id}`,
        `UseMapping:${r.mapping.data.id}`,
        `CaseFact:${r.fact.id}`,
        ...supports.map((row) => `FactSource:${row.id}`),
        `CaseSource:${r.linked.data.id}`,
        `SourceReference:${r.basis.id}`,
        `SourceReference:${r.evidence.id}`,
        `SourceReference:${r.w.source.id}`,
        `SourceReference:${r.a.basis.id}`,
        `CorrespondenceBinding:${r.nmi.id}`,
        `CorrespondenceBinding:${r.sent.id}`,
        `Correspondence:${r.nmiMessage.id}`,
        `Correspondence:${r.sentMessage.id}`,
      ].sort(),
    );
    const order = view.dependencies.map((d) => [d.entityType, d.entityId] as const);
    const sorted = [...order].sort(([ta, ia], [tb, ib]) =>
      ta < tb ? -1 : ta > tb ? 1 : ia < ib ? -1 : ia > ib ? 1 : 0,
    );
    expect(order).toEqual(sorted);
    const versionChecked = new Set([
      'CaseRecord',
      'Agency',
      'Route',
      'OwnerSubject',
      'Owner',
      'LegalSubject',
      'Signer',
      'MandateCoverage',
      'MandateVersion',
      'Mandate',
      'CoverageSigner',
      'ReportedItem',
      'CaseWork',
      'UseMapping',
      'CaseSource',
    ]);
    for (const dependency of view.dependencies) {
      expect(dependency.fingerprint).toMatch(/^[0-9a-f]{64}$/);
      if (versionChecked.has(dependency.entityType))
        expect(dependency.rowVersion).toBeGreaterThanOrEqual(1);
      else expect(dependency.rowVersion).toBeNull();
    }
    const current = await getCase(r.caseId);
    expect(depOf(view, 'CaseRecord', r.caseId)?.rowVersion).toBe(current.data.rowVersion);
    expect(depOf(view, 'ReportedItem', r.item.data.id)?.rowVersion).toBe(
      (await getItem(r.caseId, r.item.data.id)).data.rowVersion,
    );
    expect(new Set(view.dependencies.map((d) => d.fingerprint)).size).toBe(
      view.dependencies.length,
    );
    expect(await context(r.caseId, REPLY(r))).toEqual(view);
  });

  it("what the context does not rely on changes nothing: the case's notes, a work's notes, a clock advance and records of other cases or of the registry leave the digest unchanged (row versions may move)", async () => {
    const p = await productionWorld();
    const read = () => context(p.caseId, { authoritySelectionId: p.selection.id });
    const before = await read();
    await patchCase(p.caseId, { notes: 'SYNTHETIC case notes' });
    const current = await getWork(p.caseId, p.work.data.id);
    expect(
      (
        await client.write(
          'patchCaseWork',
          'PATCH',
          `/cases/${p.caseId}/works/${p.work.data.id}`,
          { notes: 'SYNTHETIC work notes' },
          { ifMatch: current.etag },
        )
      ).status,
    ).toBe(200);
    // Within the session's idle window; the read itself uses no clock.
    t.clock.advance(20 * 60 * 1000);
    const other = await productionWorld('B');
    await createFact(other.caseId, { factType: 'PERMISSION', provenance: 'CONFLICT' });
    await createSource({
      agencyId: p.w.agency.data.id,
      title: 'SYNTHETIC unrelated registry source',
    });
    const after = await read();
    expect(after.contextRevision).toBe(before.contextRevision);
    expect(changed(after, before)).toEqual([]);
    expect(after.dependencyDigest).toBe(before.dependencyDigest);
    expect(after.context.works[0]?.notes).toBe('SYNTHETIC work notes');
    expect(depOf(after, 'CaseRecord', p.caseId)?.fingerprint).toBe(
      depOf(before, 'CaseRecord', p.caseId)?.fingerprint,
    );
    expect(depOf(after, 'CaseRecord', p.caseId)?.rowVersion).toBeGreaterThan(
      depOf(before, 'CaseRecord', p.caseId)?.rowVersion ?? Infinity,
    );
    expect(depOf(after, 'CaseWork', p.work.data.id)?.fingerprint).toBe(
      depOf(before, 'CaseWork', p.work.data.id)?.fingerprint,
    );
    expect(deps(after)).toEqual(deps(before));
  });

  it('what the context relies on changes the digest: a new intake record, a fact revision, a link state, the context revision of the case, the selection named, the task and the mode; the same scope read again gives the same digest', async () => {
    const p = await productionWorld();
    const scope = { authoritySelectionId: p.selection.id };
    const digests = new Map<string, string>();
    const note = async (label: string, query: ContextQuery = scope) => {
      const view = await context(p.caseId, query);
      digests.set(label, view.dependencyDigest);
      return view;
    };
    await note('start');
    expect((await context(p.caseId, scope)).dependencyDigest).toBe(digests.get('start'));
    await note('no selection', {});
    await note('drafting', { ...scope, generationMode: 'DRAFTING' });
    await note('reply task', { ...scope, taskType: 'NMI_REPLY' });
    t.clock.advance(1000);
    await createItem(p.caseId, { rawUrl: itemUrl('abcdefghijk') });
    await note('item');
    await reviseFact(p.caseId, p.fact.id, {
      factType: 'RIGHTS_BASIS',
      provenance: 'CONFLICT',
      sources: [],
    });
    await note('fact');
    await setLinkState(p.linked.data.id, 'PAUSED');
    await note('link');
    // The intake label is case context in P4A (it moves contextRevision), and the context carries
    // that revision, so the digest moves with it.
    await patchCase(p.caseId, { intakeLabel: 'SYNTHETIC relabelled intake' });
    await note('label');
    const later = await select(
      p.caseId,
      choose(p.w, [p.a.coverage.data.id], { selectionNote: 'SYNTHETIC second selection' }),
    );
    await note('same selection after another one was recorded');
    await note('later selection', { authoritySelectionId: later.id });
    expect(digests.size).toBe(10);
    expect(new Set(digests.values()).size).toBe(10);
  });
});

describe('CONSISTENT SNAPSHOT — one snapshot per read; concurrent commits are never mixed in', () => {
  it('writes committed while a read is in flight (after its first row) are not in that read — no new revision with old children or old selection with new rows; the next read has all of them', async () => {
    const p = await productionWorld();
    const read = () => context(p.caseId, { authoritySelectionId: p.selection.id });
    const baseline = await read();
    const written: Record<string, string> = {};
    observer.hook = async (caseId) => {
      // Runs inside the read's snapshot, on other connections, and commits before the read goes on.
      const fact = await createFact(caseId, { factType: 'PERMISSION', provenance: 'CONFLICT' });
      const item = await createItem(caseId, { rawUrl: itemUrl('abcdefghijk') });
      const event = await recordEvent(p.a.mandate.data.id, {
        eventType: 'TERMINATION',
        sourceId: p.a.basis.id,
      });
      const newer = await reviseSource(p.evidence.id, {
        agencyId: p.w.agency.data.id,
        title: 'SYNTHETIC evidence r2',
      });
      await setLinkState(p.linked.data.id, 'PAUSED');
      Object.assign(written, {
        fact: fact.id,
        item: item.data.id,
        event: event.id,
        newer: newer.id,
      });
    };
    const inFlight = await read();
    expect(observer.calls).toBe(2);
    expect(Object.keys(written)).toHaveLength(4);
    // The committed writes are real (a fresh read of the case sees them) ...
    const current = await getCase(p.caseId);
    expect(current.data.contextRevision).toBeGreaterThan(baseline.contextRevision);
    // ... but the in-flight read is exactly the state its snapshot began with.
    expect(inFlight).toEqual(baseline);
    const next = await read();
    expect(next.contextRevision).toBe(current.data.contextRevision);
    expect(next.context.facts.map((fact) => fact.id)).toContain(written['fact']);
    expect(next.context.reportedItems.map((row) => row.id)).toContain(written['item']);
    expect(next.context.authority?.coverages[0]?.authorityEvents.map((event) => event.id)).toEqual([
      written['event'],
    ]);
    expect(codes(next.context.conflicts)).toEqual(
      expect.arrayContaining(['FACT_PROVENANCE_CONFLICT', 'SUPPORT_LINK_NOT_LINKED']),
    );
    expect(next.dependencyDigest).not.toBe(baseline.dependencyDigest);
  });

  it("a selection recorded while a read is in flight does not move the case pointer inside that read; a refused read in flight stays refused with the snapshot's view", async () => {
    const p = await productionWorld();
    const baseline = await context(p.caseId, { authoritySelectionId: p.selection.id });
    let later: CaseAuthoritySelection | undefined;
    observer.hook = async (caseId) => {
      later = await select(
        caseId,
        choose(p.w, [p.a.coverage.data.id], { selectionNote: 'SYNTHETIC concurrent selection' }),
      );
    };
    const inFlight = await context(p.caseId, { authoritySelectionId: p.selection.id });
    expect(later).toBeDefined();
    expect(inFlight).toEqual(baseline);
    // The concurrent selection exists now but did not exist in the in-flight snapshot.
    let latest: CaseAuthoritySelection | undefined;
    observer.hook = async (caseId) => {
      latest = await select(
        caseId,
        choose(p.w, [p.a.coverage.data.id], { selectionNote: 'SYNTHETIC third selection' }),
      );
    };
    const refused = await readContext(p.caseId, { authoritySelectionId: randomUUID() });
    expect(outcome(refused)).toEqual([422, 'REFERENCE_NOT_FOUND']);
    expect(latest).toBeDefined();
    const named = await context(p.caseId, { authoritySelectionId: later?.id });
    expect(named.context.authority?.selection.id).toBe(later?.id);
  });
});

describe('READ-ONLY — a context read writes nothing, whatever its outcome', () => {
  it('repeated successful, refused and DRAFTING reads leave every table byte-identical: no audit event, idempotency record, revision or row version moves, and nothing of a later phase exists', async () => {
    const r = await replyWorld();
    const other = await productionWorld('B');
    const before = await suiteDump();
    const caseBefore = await getCase(r.caseId);
    const queries: Array<ContextQuery | string> = [
      {},
      { authoritySelectionId: r.selection.id },
      { authoritySelectionId: r.selection.id, generationMode: 'DRAFTING' },
      REPLY(r),
      REPLY(r, { generationMode: 'DRAFTING' }),
      { taskType: 'NMI_REPLY', generationMode: 'DRAFTING' },
      { authoritySelectionId: other.selection.id },
      { authoritySelectionId: randomUUID() },
      REPLY(r, { parentBindingId: r.sent.id }),
      REPLY(r, { priorBindingIds: [r.nmi.id] }),
      { parentBindingId: r.nmi.id },
      '?taskType=INITIAL',
      '?taskType=INITIAL&generationMode=PREPARATION&unknown=1',
    ];
    const statuses: number[] = [];
    for (let round = 0; round < 3; round += 1) {
      for (const query of queries) statuses.push((await readContext(r.caseId, query)).status);
      statuses.push((await readContext(randomUUID(), {})).status);
    }
    expect([...new Set(statuses)].sort()).toEqual([200, 400, 404, 422]);
    expect(await suiteDump()).toEqual(before);
    const caseAfter = await getCase(r.caseId);
    expect([caseAfter.data.rowVersion, caseAfter.data.contextRevision]).toEqual([
      caseBefore.data.rowVersion,
      caseBefore.data.contextRevision,
    ]);
    await expectNoLaterRecords();
  });
});

/** A second case of a production world's agency and route, with its own intake and selection. */
async function sibling(p: ProductionWorld, label = 'B') {
  const created = await createCase(p.w.agency.data.id, {
    routeId: p.w.route.data.id,
    intakeLabel: `SYNTHETIC ${label} intake`,
  });
  const caseId = created.data.id;
  const selection = await select(caseId, choose(p.w, [p.a.coverage.data.id]));
  // The same video as the first case: one item per video within a case, never across cases.
  const item = await createItem(caseId, { displayTitle: `SYNTHETIC ${label} reported video` });
  const work = await createWork(caseId, { title: `SYNTHETIC ${label} work` });
  const basis = await createSource({
    agencyId: p.w.agency.data.id,
    title: `SYNTHETIC ${label} mapping basis`,
  });
  const mapping = await createMapping(caseId, {
    caseWorkId: work.data.id,
    reportedItemId: item.data.id,
    basisSourceId: basis.id,
    provenance: 'OPERATOR_REPORTED',
  });
  // The same URL as the first case's evidence, recorded as a separate source.
  const evidence = await createSource({
    agencyId: p.w.agency.data.id,
    title: `SYNTHETIC ${label} evidence`,
    canonicalUrl: 'https://evidence.example.invalid/record-1',
  });
  const linked = await linkSource(caseId, evidence.id);
  const fact = await createFact(caseId, {
    factType: 'RIGHTS_BASIS',
    provenance: 'OPERATOR_REPORTED',
    sources: [support(linked.data.id)],
  });
  return { caseId, selection, item, work, basis, mapping, evidence, linked, fact };
}

describe('CONTAMINATION — nothing of one case appears in, supports or changes another case', () => {
  it("two cases of one agency, owner and route, with the same video, the same source URL and one message bound to both: each context holds only its own case's records, and no finding of one case answers a gap of the other", async () => {
    const p = await productionWorld();
    const b = await sibling(p);
    const permission = await createFact(p.caseId, {
      factType: 'PERMISSION',
      provenance: 'OPERATOR_REPORTED',
      value: {
        finding: 'PERMISSION_GRANTED',
        assertion: 'SYNTHETIC licence reported for case A only',
        reviewScope: 'SYNTHETIC case A scope',
      },
    });
    const av = await createFact(p.caseId, {
      factType: 'AV_COMPARISON',
      scopeKind: 'USE',
      mappingId: p.mapping.data.id,
      provenance: 'OPERATOR_REPORTED',
      value: {
        finding: 'HUMAN_REVIEW_REPORTED',
        method: 'SYNTHETIC side-by-side',
        assertion: 'SYNTHETIC match reported for case A only',
        limitations: '',
      },
    });
    const policy = await createSource({
      agencyId: p.w.agency.data.id,
      title: 'SYNTHETIC policy linked to case A',
      sourceRole: 'POLICY_REFERENCE',
    });
    const policyLink = await linkSource(p.caseId, policy.id, 'SYNTHETIC_POLICY');
    const message = await capture(p.w.agency.data.id, {
      subject: 'SYNTHETIC NMI about both cases',
    });
    const nmiA = await bind(p.caseId, { correspondenceId: message.id, eventType: 'NMI' });
    const nmiB = await bind(b.caseId, { correspondenceId: message.id, eventType: 'NMI' });
    const sent = await capture(p.w.agency.data.id, {
      direction: 'OUTBOUND',
      subject: 'SYNTHETIC A notice',
    });
    const sentA = await bind(p.caseId, {
      correspondenceId: sent.id,
      eventType: 'INITIAL_AS_SENT',
      reportedItemId: p.item.data.id,
    });
    const gapB = await createFact(b.caseId, { factType: 'PERMISSION', provenance: 'MISSING' });

    const viewA = await context(p.caseId, {
      taskType: 'NMI_REPLY',
      authoritySelectionId: p.selection.id,
      parentBindingId: nmiA.id,
      priorBindingIds: [sentA.id],
    });
    const viewB = await context(b.caseId, {
      taskType: 'NMI_REPLY',
      authoritySelectionId: b.selection.id,
      parentBindingId: nmiB.id,
    });
    const supportIds = async (factIds: string[]) =>
      (await prisma.factSource.findMany({ where: { factId: { in: factIds } } })).map(
        (row) => row.id,
      );
    const pinnedIds = async (selectionId: string) =>
      (await prisma.caseAuthorityCoverage.findMany({ where: { selectionId } })).map(
        (row) => row.id,
      );
    const onlyA = [
      p.caseId,
      p.selection.id,
      ...(await pinnedIds(p.selection.id)),
      p.item.data.id,
      p.work.data.id,
      p.mapping.data.id,
      p.basis.id,
      p.evidence.id,
      p.linked.data.id,
      p.fact.id,
      permission.id,
      av.id,
      ...(await supportIds([p.fact.id])),
      policy.id,
      policyLink.data.id,
      nmiA.id,
      sentA.id,
      sent.id,
    ];
    const onlyB = [
      b.caseId,
      b.selection.id,
      ...(await pinnedIds(b.selection.id)),
      b.item.data.id,
      b.work.data.id,
      b.mapping.data.id,
      b.basis.id,
      b.evidence.id,
      b.linked.data.id,
      b.fact.id,
      gapB.id,
      ...(await supportIds([b.fact.id])),
      nmiB.id,
    ];
    const textA = JSON.stringify(viewA);
    const textB = JSON.stringify(viewB);
    for (const id of onlyA) expect(textB, `case A record ${id} in case B`).not.toContain(id);
    for (const id of onlyB) expect(textA, `case B record ${id} in case A`).not.toContain(id);
    expect(textB).not.toContain('SYNTHETIC licence reported for case A only');
    expect(textB).not.toContain('SYNTHETIC match reported for case A only');
    // B's own gap stays a gap: A's reported permission answers nothing in B.
    expect(viewB.context.missing).toContainEqual(
      expect.objectContaining({
        code: 'FACT_PROVENANCE_MISSING',
        message: expect.stringContaining(gapB.id),
      }),
    );
    expect(viewB.context.facts.map((fact) => fact.id).sort()).toEqual([b.fact.id, gapB.id].sort());
    expect(viewB.context.policySources).toEqual([]);
    expect(viewA.context.policySources.map((entry) => entry.sourceId)).toEqual([policy.id]);
    // One message, two cases: each context has it through its own binding only.
    expect(viewB.context.correspondence.map((row) => row.id)).toEqual([message.id]);
    expect(deps(viewB)).toContain(`CorrespondenceBinding:${nmiB.id}`);
    expect(deps(viewB)).not.toContain(`CorrespondenceBinding:${nmiA.id}`);
    // The same video and the same URL stay separate records of each case.
    expect(viewA.context.reportedItems[0]?.externalItemId).toBe(
      viewB.context.reportedItems[0]?.externalItemId,
    );
    expect(viewA.context.reportedItems[0]?.id).not.toBe(viewB.context.reportedItems[0]?.id);
    const urlOf = (view: ContextView, id: string) =>
      view.context.sources.find((entry) => entry.sourceId === id)?.canonicalUrl;
    expect(urlOf(viewA, p.evidence.id)).toBe(urlOf(viewB, b.evidence.id));
    // Another case's selectors are refused in both directions, never used.
    for (const [caseId, query, field] of [
      [b.caseId, { authoritySelectionId: p.selection.id }, 'authoritySelectionId'],
      [p.caseId, { authoritySelectionId: b.selection.id }, 'authoritySelectionId'],
      [b.caseId, { taskType: 'NMI_REPLY', parentBindingId: nmiA.id }, 'parentBindingId'],
      [p.caseId, { taskType: 'NMI_REPLY', parentBindingId: nmiB.id }, 'parentBindingId'],
      [
        b.caseId,
        { taskType: 'NMI_REPLY', parentBindingId: nmiB.id, priorBindingIds: [sentA.id] },
        'priorBindingIds.0',
      ],
    ] as const) {
      const refused = await readContext(caseId, query);
      expect(outcome(refused), JSON.stringify(query)).toEqual([422, 'CROSS_CASE_REFERENCE']);
      expect(detailsOf(refused)['field']).toBe(field);
    }
  });

  it("changes to one case never change another case's context or digest", async () => {
    const p = await productionWorld();
    const b = await sibling(p);
    const readB = () => context(b.caseId, { authoritySelectionId: b.selection.id });
    const before = await readB();
    t.clock.advance(1000);
    await createItem(p.caseId, { rawUrl: itemUrl('abcdefghijk') });
    await reviseFact(p.caseId, p.fact.id, {
      factType: 'RIGHTS_BASIS',
      provenance: 'CONFLICT',
      sources: [],
    });
    await setLinkState(p.linked.data.id, 'PAUSED');
    await select(
      p.caseId,
      choose(p.w, [p.a.coverage.data.id], { selectionNote: 'SYNTHETIC A again' }),
    );
    const message = await capture(p.w.agency.data.id);
    await bind(p.caseId, { correspondenceId: message.id, eventType: 'NMI' });
    await createFact(p.caseId, { factType: 'PERMISSION', provenance: 'OPERATOR_REPORTED' });
    await archiveChild('works', p.caseId, p.work.data.id);
    await patchCase(p.caseId, { driveFolderUrl: 'https://drive.example.invalid/case-a' });
    const after = await readB();
    expect(after).toEqual(before);
  });
});

describe('BOUNDS — a context is never cut to fit the contract', () => {
  it('100 reported items are returned; the 101st makes the read 409 PRODUCTION_CONTEXT_TOO_LARGE naming the bound, and the refusal writes nothing', async () => {
    const p = await productionWorld();
    const userId = client.session.userId;
    const rows = (from: number, count: number) =>
      Array.from({ length: count }, (_, index) => {
        const id = `SYN${String(from + index).padStart(8, '0')}`;
        return {
          caseId: p.caseId,
          rawUrl: `https://www.youtube.com/watch?v=${id}`,
          normalizedUrl: `https://www.youtube.com/watch?v=${id}`,
          externalItemId: id,
          createdById: userId,
          updatedById: userId,
        };
      });
    // Synthetic rows inserted directly: the bound, not the write path, is under test.
    await prisma.reportedItem.createMany({ data: rows(1, 99) });
    const full = await context(p.caseId, { authoritySelectionId: p.selection.id });
    expect(full.context.reportedItems).toHaveLength(100);
    expect(codes(full.context.missing).filter((c) => c === 'REPORTED_ITEM_UNMAPPED')).toHaveLength(
      99,
    );
    await prisma.reportedItem.createMany({ data: rows(100, 1) });
    const before = await suiteDump();
    const refused = await readContext(p.caseId, { authoritySelectionId: p.selection.id });
    expect(outcome(refused)).toEqual([409, 'PRODUCTION_CONTEXT_TOO_LARGE']);
    expect(detailsOf(refused)).toEqual({ field: 'reportedItems', count: 101, maximum: 100 });
    expect(await suiteDump()).toEqual(before);
  });
});

describe('SECURITY AND ISOLATION — session-protected, read-only, no network, nothing of a later phase', () => {
  it('requires a session (401 without one or with an unknown one); every answer is Cache-Control: no-store without an ETag; only GET is routed', async () => {
    const p = await productionWorld();
    const path = `/api/v1${contextPath(p.caseId, { authoritySelectionId: p.selection.id })}`;
    const anonymous = await http(t.port, 'GET', path, {
      headers: { 'X-Requested-With': 'TB-APP' },
    });
    expect([anonymous.status, code(anonymous)]).toEqual([401, 'SESSION_REQUIRED']);
    expect(anonymous.headers['cache-control']).toBe('no-store');
    const forged = await http(t.port, 'GET', path, {
      headers: { 'X-Requested-With': 'TB-APP', ...cookieHeader('A'.repeat(43)) },
    });
    expect(forged.status).toBe(401);
    expect(anonymous.text).not.toContain(p.selection.id);
    const ok = await readContext(p.caseId, { authoritySelectionId: p.selection.id });
    expect(ok.status).toBe(200);
    expect(ok.headers['cache-control']).toBe('no-store');
    expect(ok.headers['etag']).toBeUndefined();
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const response = await unrouted(method, `/cases/${p.caseId}/production-context`);
      expect([response.status, code(response)], method).toEqual([404, 'NOT_FOUND']);
    }
  });

  it('a context read opens no outbound connection and calls no fetch, even with URLs, addresses and a Drive folder in the records', async () => {
    const r = await replyWorld();
    await patchCase(r.caseId, {
      driveFolderUrl: 'https://drive.example.invalid/folders/synthetic',
    });
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
      await context(r.caseId, REPLY(r));
      await context(r.caseId, REPLY(r, { generationMode: 'DRAFTING' }));
      await context(r.caseId, { authoritySelectionId: r.selection.id });
      await new Promise<void>((resolve, reject) => {
        const probe = net.connect(t.port, '127.0.0.1', () => {
          probe.destroy();
          resolve();
        });
        probe.on('error', reject);
      });
    } finally {
      fetchCalls = fetchSpy.mock.calls.length;
      fetchSpy.mockRestore();
      connectSpy.mockRestore();
    }
    expect(fetchCalls).toBe(0);
    expect(connections).toContain(`127.0.0.1:${t.port}`);
    expect(
      connections.filter((target) => !/^(127\.0\.0\.1|localhost|::1):\d+$/.test(target)),
    ).toEqual([]);
  });

  it('candidates, validation, assessments, readiness and unsigned export stay unrouted; P4D creates no later-phase record', async () => {
    const p = await productionWorld();
    const id = p.caseId;
    const other = randomUUID();
    const before = await suiteDump();
    // Prompts are routed since P4E (tests/db/p4e-http.test.ts); P4D still generates none.
    const paths: Array<['GET' | 'POST', string]> = [
      ['POST', `/cases/${id}/candidates`],
      ['GET', `/cases/${id}/candidates`],
      ['GET', `/candidates/${other}`],
      ['POST', `/candidates/${other}/revisions`],
      ['POST', `/candidates/${other}/supersede`],
      ['POST', `/candidates/${other}/validation-runs`],
      ['GET', `/candidates/${other}/validation-runs`],
      ['GET', `/validation-runs/${other}/issues`],
      ['POST', `/candidates/${other}/assessments`],
      ['GET', `/candidates/${other}/assessments`],
      ['GET', `/candidates/${other}/readiness`],
      ['POST', `/candidates/${other}/unsigned-exports`],
      ['GET', '/audit-events'],
      ['POST', `/cases/${id}/send`],
      ['POST', `/cases/${id}/sign`],
      ['POST', `/cases/${id}/g1`],
    ];
    for (const [method, path] of paths) {
      const response = await unrouted(method, path);
      expect([response.status, code(response)], `${method} ${path}`).toEqual([404, 'NOT_FOUND']);
    }
    expect(await suiteDump()).toEqual(before);
    await expectNoLaterRecords();
  });

  it('every collected response matches its operation: declared status, contract schema, no ETag on the context, no readiness, approval or verification vocabulary; getProductionContext was exercised', () => {
    const byId = new Map<string, (typeof operations)[number]>(
      operations.map((operation) => [operation.operationId, operation]),
    );
    const seen = new Set<string>();
    // Verdict keys only: recorded fields such as a version's validityModel are data, not a verdict.
    const forbiddenKey =
      /"(g[1-7]\w*|ready\w*|eligib\w*|authori[sz]ed\w*|infring\w*|verified\w*|approved\w*|isCurrent\w*|currentAuthority\w*|valid|validated|isValid\w*)"\s*:/i;
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
        if (operationId === 'getProductionContext') {
          expect(result.text, label).not.toMatch(forbiddenKey);
          expect(result.text, label).not.toMatch(/READY_FOR_SIGNER|G[1-7]_PASS|"PASS"/);
        }
      } else {
        expect(operation.errors as readonly string[], label).toContain(String(result.status));
        expect(OperationErrorSchema.safeParse(result.json).success, label).toBe(true);
      }
      expect(result.headers['cache-control'], label).toBe('no-store');
    }
    expect(seen.has('getProductionContext')).toBe(true);
    const production = operations
      .filter((operation) => (operation.tags as readonly string[]).includes('Production'))
      .map((operation) => operation.operationId);
    expect(production).toContain('getProductionContext');
    expect(
      collected.filter((entry) => entry.operationId === 'getProductionContext').length,
    ).toBeGreaterThan(100);
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
