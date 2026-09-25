// P4B — ReportedItem, CaseWork, UseMapping and CaseFact over real HTTP against tb_notice_test
// (yarn test:db).
//
// Each test boots the real AppModule + configureApp pipeline on an ephemeral loopback port with a
// synthetic signed-in application User, a controllable clock and an audit writer that can be made
// to fail. Every response is recorded and checked against the active contract at the end. All data
// is synthetic; every test deletes what it created.
//
// Case intake material is case-specific and never a legal finding: a reported item is not an
// infringement finding, a work is not ownership proof, a use mapping is not an infringement or
// audiovisual-identity finding, and a case fact is an explicit, attributed assertion — never
// inferred from silence, similarity, a URL, a publication or a source's existence. Nothing crosses
// from one case to another, and nothing here computes G1–G7 or readiness. The R9 remediation
// (TB-SCHEMA-API-v1.2.0, ADR-0005) reads back the FactSource rows recorded for one fact revision:
// exactly as stored, zero rows included, never merged, re-pointed or hidden.
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Prisma, type PrismaClient } from '../../apps/api/generated/prisma/client.js';
import type {
  Agency,
  CaseFact,
  CaseFactSourcesView,
  CaseFactSummary,
  CaseRecord,
  CaseSource,
  CaseWork,
  LegalSubject,
  Owner,
  OwnerSubject,
  ReportedItem,
  Route,
  SourceReference,
  UseMapping,
} from '../../packages/contracts/src/index.js';
import {
  GetCaseFactResponseSchema,
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
  FailingAuditWriter,
  newKey,
  signIn,
  type Recorded,
  type WriteOptions,
} from './directory-support.js';

let prisma: PrismaClient;
let t: TestApp;
let auditWriter: FailingAuditWriter;
let client: DirectoryClient;
const collected: Recorded[] = [];

beforeAll(async () => {
  ({ prisma } = openTestPrisma());
  await assertSuiteTablesEmpty(prisma);
});

beforeEach(async () => {
  auditWriter = new FailingAuditWriter();
  t = await startTestApp(prisma, { auditWriter });
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

/** The 22 P4B operations of TB-SCHEMA-API-v1.1.0, exactly as contracted. */
const P4B_OPERATIONS = [
  'listCaseReportedItems',
  'createReportedItem',
  'getReportedItem',
  'patchReportedItem',
  'archiveReportedItem',
  'restoreReportedItem',
  'listCaseCaseWorks',
  'createCaseWork',
  'getCaseWork',
  'patchCaseWork',
  'archiveCaseWork',
  'restoreCaseWork',
  'listCaseUseMappings',
  'createUseMapping',
  'getUseMapping',
  'patchUseMapping',
  'archiveUseMapping',
  'restoreUseMapping',
  'listCaseFacts',
  'createCaseFact',
  'getCaseFact',
  'reviseCaseFact',
] as const;

/** The R9 remediation read of TB-SCHEMA-API-v1.2.0 (ADR-0005). */
const R9_OPERATIONS = ['getCaseFactSources'] as const;

/** Case records of later phases: P4B never writes any of them. */
const LATER_CASE_TABLES = [
  'correspondence',
  'correspondence_bindings',
  'prompt_snapshots',
  'notice_candidates',
  'validation_runs',
  'validation_issues',
  'candidate_assessments',
  'assessment_sources',
];

async function expectNoLaterPhaseRecords(): Promise<void> {
  for (const table of LATER_CASE_TABLES) expect(await countRows(prisma, table), table).toBe(0);
}

interface Versioned<T> {
  readonly data: T;
  readonly etag: string;
}

interface Page<T> {
  readonly items: T[];
  readonly nextCursor: string | null;
}

/**
 * The error body of a refusal. A success has none: the helpers below then describe the success, so
 * a test that expected a refusal fails on the status it got, not on a missing property.
 */
const errorBody = (result: HttpResult) =>
  (result.json as { error?: { code: string; details: Record<string, unknown> } } | undefined)
    ?.error;
const code = (result: HttpResult) => errorBody(result)?.code ?? `(no error: HTTP ${result.status})`;
const outcome = (result: HttpResult) => [result.status, code(result)];
const detailsOf = (result: HttpResult) => errorBody(result)?.details ?? {};
/** The error body without its requestId: two refusals that must be indistinguishable. */
const refusalOf = (result: HttpResult) => {
  const { requestId: _requestId, ...rest } = (errorBody(result) ?? {
    noError: `HTTP ${result.status}`,
  }) as Record<string, unknown>;
  return rest;
};

function versioned<T>(result: HttpResult, status: number): Versioned<T> {
  expect(result.status, result.text).toBe(status);
  return { data: dataOf<T>(result), etag: etagOf(result) };
}

/** An append-only resource (a fact revision, a SourceReference) or a list: no ETag. */
function immutable<T>(result: HttpResult, status: number): T {
  expect(result.status, result.text).toBe(status);
  expect(result.headers['etag']).toBeUndefined();
  return dataOf<T>(result);
}

const affectedOf = (result: HttpResult) =>
  (result.json as { meta: { affectedResources: Array<Record<string, unknown>> } }).meta
    .affectedResources;

const codePoints = (text: string) => [...text].length;

/** What a replay must reproduce: status, data, affected resources and ETag (not the requestId). */
const replayView = (result: HttpResult) => {
  const body = result.json as
    { data?: unknown; meta?: { affectedResources?: unknown } } | undefined;
  return [result.status, body?.data, body?.meta?.affectedResources, result.headers['etag']];
};

const auditCount = (action: string, entityId?: string) =>
  prisma.auditEvent.count({ where: { action, ...(entityId ? { entityId } : {}) } });

async function auditRows(entityId: string) {
  return prisma.auditEvent.findMany({
    where: { entityId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
}

/** A request to a path that is not routed (not recorded: it has no contract operation). */
function unrouted(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string) {
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

async function listOf<T>(operationId: string, path: string): Promise<Page<T>> {
  return immutable<Page<T>>(await client.get(operationId, path), 200);
}

/** Every row of every table this suite can touch (audit and idempotency included). */
async function suiteDump(): Promise<Record<string, string[]>> {
  const dump: Record<string, string[]> = {};
  for (const table of DIRECTORY_SUITE_TABLES) {
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

/** Every row of every intake table and the cases, to prove that a request wrote nothing. */
async function intakeDump(): Promise<Record<string, string[]>> {
  const dump: Record<string, string[]> = {};
  for (const table of [
    'cases',
    'case_sources',
    'reported_items',
    'case_works',
    'use_mappings',
    'case_facts',
    'fact_sources',
  ]) {
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

// directory, source and case records (P2–P4A) ---------------------------------------------------

const createAgency = async (label = 'A') =>
  versioned<Agency>(
    await client.write('createAgency', 'POST', '/agencies', {
      displayName: `SYNTHETIC Agency ${label}`,
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
const createSubject = async (label = 'L') =>
  versioned<LegalSubject>(
    await client.write('createLegalSubject', 'POST', '/legal-subjects', {
      subjectType: 'LEGAL_ENTITY',
      legalName: `SYNTHETIC Subject ${label} LLC`,
    }),
    201,
  );
const getOwner = async (id: string) =>
  versioned<Owner>(await client.get('getOwner', `/owners/${id}`), 200);

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
  title: 'SYNTHETIC case material (test only; not evidence)',
  sourceRole: 'OPERATOR_INPUT',
  scopeText: 'Synthetic scope description',
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

const postCase = (body: Record<string, unknown>, options: WriteOptions = {}) =>
  client.write(
    'createCase',
    'POST',
    '/cases',
    { intakeLabel: 'SYNTHETIC intake', ...body },
    options,
  );
const createCase = async (agencyId: string, body: Record<string, unknown> = {}) =>
  versioned<CaseRecord>(await postCase({ agencyId, ...body }), 201);
const getCase = async (id: string) =>
  versioned<CaseRecord>(await client.get('getCase', `/cases/${id}`), 200);
const patchCase = (id: string, etag: string | null, body: Record<string, unknown>) =>
  client.write('patchCase', 'PATCH', `/cases/${id}`, body, { ifMatch: etag });
const archiveCase = (id: string, etag: string | null) =>
  client.write(
    'ArchiveCase',
    'POST',
    `/cases/${id}/archive`,
    { reason: 'SYNTHETIC archive' },
    { ifMatch: etag },
  );
const restoreCase = (id: string, etag: string | null) =>
  client.write(
    'RestoreCase',
    'POST',
    `/cases/${id}/restore`,
    { reason: 'SYNTHETIC restore' },
    { ifMatch: etag },
  );
const bindRoute = (id: string, etag: string | null, routeId: string) =>
  client.write(
    'RouteBindingCase',
    'POST',
    `/cases/${id}/route-binding`,
    { routeId, reason: 'SYNTHETIC route binding' },
    { ifMatch: etag },
  );

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

/**
 * Agency A with its own source, Owner X – LegalSubject L (LINKED), the route of A over that
 * association and one case of A bound to that route.
 */
async function world(label = 'A') {
  const agency = await createAgency(label);
  const owner = await createOwner(`${label}-X`);
  const subject = await createSubject(`${label}-L`);
  const association = await link(owner.data.id, subject.data.id);
  const route = await createRoute({
    agencyId: agency.data.id,
    ownerSubjectId: association.data.id,
  });
  const source = await createSource({
    agencyId: agency.data.id,
    title: `SYNTHETIC ${label} agency material`,
  });
  const created = await createCase(agency.data.id, {
    routeId: route.data.id,
    intakeLabel: `SYNTHETIC ${label} intake`,
  });
  return { agency, owner, subject, association, route, source, case: created };
}

// intake records (P4B) --------------------------------------------------------------------------

const VIDEO = 'dQw4w9WgXcQ';
const itemUrl = (id = VIDEO, extra = '') => `https://www.youtube.com/watch?v=${id}${extra}`;

/** A POST with the case's If-Match (a nested create). */
const caseChildCreate = (
  operationId: string,
  caseId: string,
  etag: string | null,
  collection: string,
  body: unknown,
  options: WriteOptions = {},
) =>
  client.write(operationId, 'POST', `/cases/${caseId}/${collection}`, body, {
    ifMatch: etag,
    ...options,
  });

const postItem = (
  caseId: string,
  etag: string | null,
  body: Record<string, unknown>,
  options: WriteOptions = {},
) =>
  caseChildCreate(
    'createReportedItem',
    caseId,
    etag,
    'reported-items',
    { rawUrl: itemUrl(), ...body },
    options,
  );
async function createItem(caseId: string, body: Record<string, unknown> = {}) {
  const current = await getCase(caseId);
  return versioned<ReportedItem>(await postItem(caseId, current.etag, body), 201);
}
const readItem = (caseId: string, id: string) =>
  client.get('getReportedItem', `/cases/${caseId}/reported-items/${id}`);
const getItem = async (caseId: string, id: string) =>
  versioned<ReportedItem>(await readItem(caseId, id), 200);
const patchItem = (
  caseId: string,
  id: string,
  etag: string | null,
  body: Record<string, unknown>,
  options: WriteOptions = {},
) =>
  client.write('patchReportedItem', 'PATCH', `/cases/${caseId}/reported-items/${id}`, body, {
    ifMatch: etag,
    ...options,
  });

const postWork = (
  caseId: string,
  etag: string | null,
  body: Record<string, unknown>,
  options: WriteOptions = {},
) =>
  caseChildCreate(
    'createCaseWork',
    caseId,
    etag,
    'works',
    { title: 'SYNTHETIC Work Title', ...body },
    options,
  );
async function createWork(caseId: string, body: Record<string, unknown> = {}) {
  const current = await getCase(caseId);
  return versioned<CaseWork>(await postWork(caseId, current.etag, body), 201);
}
const readWork = (caseId: string, id: string) =>
  client.get('getCaseWork', `/cases/${caseId}/works/${id}`);
const getWork = async (caseId: string, id: string) =>
  versioned<CaseWork>(await readWork(caseId, id), 200);
const patchWork = (
  caseId: string,
  id: string,
  etag: string | null,
  body: Record<string, unknown>,
  options: WriteOptions = {},
) =>
  client.write('patchCaseWork', 'PATCH', `/cases/${caseId}/works/${id}`, body, {
    ifMatch: etag,
    ...options,
  });

const postMapping = (
  caseId: string,
  etag: string | null,
  body: Record<string, unknown>,
  options: WriteOptions = {},
) =>
  caseChildCreate(
    'createUseMapping',
    caseId,
    etag,
    'mappings',
    { occurrence: 1, ...body },
    options,
  );
async function createMapping(caseId: string, body: Record<string, unknown>) {
  const current = await getCase(caseId);
  return versioned<UseMapping>(await postMapping(caseId, current.etag, body), 201);
}
const readMapping = (caseId: string, id: string) =>
  client.get('getUseMapping', `/cases/${caseId}/mappings/${id}`);
const getMapping = async (caseId: string, id: string) =>
  versioned<UseMapping>(await readMapping(caseId, id), 200);
const patchMapping = (
  caseId: string,
  id: string,
  etag: string | null,
  body: Record<string, unknown>,
  options: WriteOptions = {},
) =>
  client.write('patchUseMapping', 'PATCH', `/cases/${caseId}/mappings/${id}`, body, {
    ifMatch: etag,
    ...options,
  });

type ChildKind = 'reported-items' | 'works' | 'mappings';
const ARCHIVE_OPERATION: Record<ChildKind, [string, string]> = {
  'reported-items': ['archiveReportedItem', 'restoreReportedItem'],
  works: ['archiveCaseWork', 'restoreCaseWork'],
  mappings: ['archiveUseMapping', 'restoreUseMapping'],
};
/** archive / restore of an intake record with its own If-Match. */
const childCommand = (
  kind: ChildKind,
  action: 'archive' | 'restore',
  caseId: string,
  id: string,
  etag: string | null,
  options: WriteOptions = {},
  reason = `SYNTHETIC ${action}`,
) =>
  client.write(
    ARCHIVE_OPERATION[kind][action === 'archive' ? 0 : 1] as string,
    'POST',
    `/cases/${caseId}/${kind}/${id}/${action}`,
    { reason },
    { ifMatch: etag, ...options },
  );

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
const postFact = (
  caseId: string,
  etag: string | null,
  body: Record<string, unknown>,
  options: WriteOptions = {},
) => caseChildCreate('createCaseFact', caseId, etag, 'facts', factBody(body), options);
async function createFact(caseId: string, body: Record<string, unknown> = {}) {
  const current = await getCase(caseId);
  return immutable<CaseFact>(await postFact(caseId, current.etag, body), 201);
}
const readFact = (caseId: string, id: string) =>
  client.get('getCaseFact', `/cases/${caseId}/facts/${id}`);
const getFact = async (caseId: string, id: string) =>
  immutable<CaseFact>(await readFact(caseId, id), 200);
const postRevision = (
  caseId: string,
  id: string,
  etag: string | null,
  body: Record<string, unknown>,
  options: WriteOptions = {},
) =>
  client.write('reviseCaseFact', 'POST', `/cases/${caseId}/facts/${id}/revisions`, factBody(body), {
    ifMatch: etag,
    ...options,
  });
async function reviseFact(caseId: string, id: string, body: Record<string, unknown> = {}) {
  const current = await getCase(caseId);
  return immutable<CaseFact>(await postRevision(caseId, id, current.etag, body), 201);
}
const listFacts = (caseId: string, query = '') =>
  listOf<CaseFactSummary>('listCaseFacts', `/cases/${caseId}/facts${query}`);

/** The text MySQL itself holds in an intake DATETIME(3) column (not Prisma's read path). */
async function columnInstant(
  table: 'reported_items' | 'case_facts',
  column: 'observed_at' | 'asserted_as_of',
  id: string,
): Promise<string | null> {
  const [row] = await prisma.$queryRaw<Array<{ value: string | null }>>(
    Prisma.sql`SELECT CAST(${Prisma.raw(column)} AS CHAR) AS value FROM ${Prisma.raw(table)}
      WHERE id = ${id}`,
  );
  return row?.value ?? null;
}

/** '2025-06-30T10:15:00.123Z' → '2025-06-30 10:15:00.123', the column's UTC text. */
const columnText = (instant: string) => instant.replace('T', ' ').replace('Z', '');

/**
 * [wire value, the instant stored] — spellings the contract format admits that a string parser
 * gets wrong (R7): V8's Date parser refuses an hour-only offset; Prisma's DateTime parser refuses
 * ±HH and ±HHMM offsets and a TAB or ideographic-space separator. Each is stored as exactly its
 * instant, never as the request string or a parser's reading of it.
 */
const ADMITTED_SPELLINGS: Array<[string, string]> = [
  ['2025-06-30T15:15:00+05', '2025-06-30T10:15:00.000Z'],
  ['2025-06-30T15:45:00+0530', '2025-06-30T10:15:00.000Z'],
  ['2025-06-30\t10:15:00Z', '2025-06-30T10:15:00.000Z'],
  ['2025-06-30　10:15:00Z', '2025-06-30T10:15:00.000Z'],
  ['2025-06-30t10:15:00.5z', '2025-06-30T10:15:00.500Z'],
  ['0999-12-31T23:30:00-01:00', '1000-01-01T00:30:00.000Z'],
  ['9999-12-31T23:59:59.499Z', '9999-12-31T23:59:59.499Z'],
];

/**
 * The stored FactSource rows of a fact revision straight from the database (the P4B assertions;
 * the contracted read getCaseFactSources is checked against storedRows below).
 */
const storedSupports = (factId: string) =>
  prisma.factSource.findMany({
    where: { factId },
    orderBy: [{ caseSourceId: 'asc' }, { supportRole: 'asc' }],
    select: { factId: true, caseSourceId: true, supportRole: true, supportedAssertion: true },
  });

/** Every stored FactSource row of a revision, all fields, in the contract's (createdAt, id) order. */
const storedRows = async (factId: string) =>
  (
    await prisma.factSource.findMany({
      where: { factId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    })
  ).map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));

/** GET /cases/{caseId}/facts/{id}/sources (getCaseFactSources, TB-SCHEMA-API-v1.2.0). */
const readSupports = (caseId: string, id: string) =>
  client.get('getCaseFactSources', `/cases/${caseId}/facts/${id}/sources`);
const getSupports = async (caseId: string, id: string) =>
  immutable<CaseFactSourcesView>(await readSupports(caseId, id), 200);

/** A world plus one item, one work, one mapping between them and one LINKED case source. */
async function intakeWorld(label = 'A') {
  const w = await world(label);
  const item = await createItem(w.case.data.id, { displayTitle: `SYNTHETIC ${label} video` });
  const work = await createWork(w.case.data.id, { title: `SYNTHETIC ${label} work` });
  const mapping = await createMapping(w.case.data.id, {
    caseWorkId: work.data.id,
    reportedItemId: item.data.id,
  });
  const linked = await linkSource(w.case.data.id, w.source.id);
  return { w, item, work, mapping, linked };
}

// ---------------------------------------------------------------------------------------------

describe('REPORTED ITEMS — identification of reported material; not an infringement finding', () => {
  it('create: the raw URL exactly as supplied; the normalized URL and video id derived deterministically, id case preserved; the case context moves; audited', async () => {
    const w = await world();
    const before = await getCase(w.case.data.id);
    const raw = 'https://WWW.YouTube.COM/watch?feature=share&v=AbC_dEf-123&t=42s#frag';
    const result = await postItem(w.case.data.id, before.etag, {
      rawUrl: raw,
      displayTitle: '  SYNTHETIC Reported title — café  ',
      observedAt: '2026-09-20T10:15:30.123+07:00',
    });
    const item = versioned<ReportedItem>(result, 201);
    expect(item.data).toEqual({
      id: item.data.id,
      caseId: w.case.data.id,
      rawUrl: raw,
      normalizedUrl: 'https://www.youtube.com/watch?v=AbC_dEf-123',
      externalItemId: 'AbC_dEf-123',
      displayTitle: '  SYNTHETIC Reported title — café  ',
      observedAt: '2026-09-20T03:15:30.123Z',
      archivedAt: null,
      archiveReason: null,
      createdAt: new Date(t.clock.ms).toISOString(),
      createdById: client.session.userId,
      updatedAt: new Date(t.clock.ms).toISOString(),
      updatedById: client.session.userId,
      rowVersion: 1,
    });
    expect(item.etag).toBe(`"ReportedItem:${item.data.id}:v1"`);
    expect(await getItem(w.case.data.id, item.data.id)).toEqual(item);
    const after = await getCase(w.case.data.id);
    expect([after.data.rowVersion, after.data.contextRevision]).toEqual([
      before.data.rowVersion + 1,
      before.data.contextRevision + 1,
    ]);
    expect(affectedOf(result)).toEqual([
      { type: 'CaseRecord', id: w.case.data.id, rowVersion: after.data.rowVersion },
      { type: 'ReportedItem', id: item.data.id, rowVersion: 1 },
    ]);
    const [audit] = await auditRows(item.data.id);
    expect(audit).toMatchObject({ action: 'REPORTED_ITEM_CREATED', entityType: 'ReportedItem' });
    expect(audit?.afterRedacted).toMatchObject({
      caseId: w.case.data.id,
      rawUrl: raw,
      externalItemId: 'AbC_dEf-123',
      caseContextRevision: after.data.contextRevision,
    });
    // Every accepted shape names the same item identity; nothing is fetched or looked up.
    const shapes: Array<[string, string]> = [
      ['https://youtu.be/Zz_9-aB1cD2?si=share', 'Zz_9-aB1cD2'],
      ['http://m.youtube.com/watch?v=Yy_9-aB1cD2&list=PL1', 'Yy_9-aB1cD2'],
      ['https://youtube.com/shorts/Xx_9-aB1cD2', 'Xx_9-aB1cD2'],
      ['https://www.youtube.com/live/Ww_9-aB1cD2?feature=share', 'Ww_9-aB1cD2'],
    ];
    for (const [rawUrl, id] of shapes) {
      const shaped = await createItem(w.case.data.id, { rawUrl });
      expect([shaped.data.rawUrl, shaped.data.externalItemId, shaped.data.normalizedUrl]).toEqual([
        rawUrl,
        id,
        `https://www.youtube.com/watch?v=${id}`,
      ]);
      expect(shaped.data.displayTitle).toBeNull();
      expect(shaped.data.observedAt).toBeNull();
    }
    // Only the video id's own case matters: two ids differing in case are two items.
    const lower = await createItem(w.case.data.id, { rawUrl: itemUrl('abcdefghijk') });
    const upper = await createItem(w.case.data.id, { rawUrl: itemUrl('ABCDEFGHIJK') });
    expect([lower.data.externalItemId, upper.data.externalItemId]).toEqual([
      'abcdefghijk',
      'ABCDEFGHIJK',
    ]);
    await expectNoLaterPhaseRecords();
  });

  it('refuses addresses that are not a YouTube video item (422 REPORTED_URL_UNSUPPORTED) before anything is written; one item per video in a case; the same video in another case is its own record', async () => {
    const w = await world();
    const current = await getCase(w.case.data.id);
    const claims = await prisma.idempotencyRecord.count();
    const refused: Array<[string, string]> = [
      ['https://www.youtube.com/@SYNTHETIC-channel', 'NOT_A_VIDEO_URL'],
      ['https://www.youtube.com/playlist?list=PL123', 'NOT_A_VIDEO_URL'],
      ['https://www.youtube.com/embed/videoseries?list=PL123', 'NOT_A_VIDEO_URL'],
      ['https://www.youtube.com/watch?list=PL123', 'NOT_A_VIDEO_URL'],
      [`https://www.youtube.com/watch?v=${VIDEO}&v=${VIDEO}`, 'AMBIGUOUS_VIDEO_ID'],
      [`https://www.youtube.com/watch?%76=${VIDEO}`, 'AMBIGUOUS_VIDEO_ID'],
      ['https://www.youtube.com/watch?v=short', 'INVALID_VIDEO_ID'],
      [`https://www.youtube.com/watch?v=${VIDEO}X`, 'INVALID_VIDEO_ID'],
      ['https://www.youtube.com/watch?v=dQw4w9WgXc%51', 'INVALID_VIDEO_ID'],
      [`https://music.youtube.com/watch?v=${VIDEO}`, 'NOT_YOUTUBE'],
      [`https://www.youtube.com.example.invalid/watch?v=${VIDEO}`, 'NOT_YOUTUBE'],
      [`https://vimeo.com/${VIDEO}`, 'NOT_YOUTUBE'],
      [`https://user@www.youtube.com/watch?v=${VIDEO}`, 'CREDENTIALS_IN_URL'],
      [`https://www.youtube.com:8443/watch?v=${VIDEO}`, 'PORT_IN_URL'],
    ];
    for (const [rawUrl, reason] of refused) {
      const result = await postItem(w.case.data.id, current.etag, { rawUrl });
      expect([...outcome(result), detailsOf(result)], rawUrl).toEqual([
        422,
        'REPORTED_URL_UNSUPPORTED',
        { field: 'rawUrl', reason },
      ]);
    }
    // Contract shape: an address without http(s) is refused by the schema itself.
    expect(
      outcome(await postItem(w.case.data.id, current.etag, { rawUrl: 'ftp://x.invalid/a' })),
    ).toEqual([422, 'VALIDATION_FAILED']);
    expect(await countRows(prisma, 'reported_items')).toBe(0);
    expect(await prisma.idempotencyRecord.count()).toBe(claims);
    expect((await getCase(w.case.data.id)).data).toEqual(current.data);

    // One item per video in a case — whatever the spelling, archived or not.
    const first = await createItem(w.case.data.id);
    const again = await getCase(w.case.data.id);
    const duplicate = await postItem(w.case.data.id, again.etag, {
      rawUrl: `https://youtu.be/${VIDEO}?t=99`,
    });
    expect([...outcome(duplicate), detailsOf(duplicate)]).toEqual([
      409,
      'DUPLICATE_REPORTED_ITEM',
      { reportedItemId: first.data.id },
    ]);
    versioned(
      await childCommand('reported-items', 'archive', w.case.data.id, first.data.id, first.etag),
      200,
    );
    const archivedNow = await getCase(w.case.data.id);
    expect(outcome(await postItem(w.case.data.id, archivedNow.etag, {}))).toEqual([
      409,
      'DUPLICATE_REPORTED_ITEM',
    ]);
    // The same video in another case of the same agency and route: a separate record, nothing
    // copied or linked.
    const other = await createCase(w.agency.data.id, {
      routeId: w.route.data.id,
      intakeLabel: 'SYNTHETIC other intake',
    });
    const otherItem = await createItem(other.data.id);
    expect(otherItem.data.id).not.toBe(first.data.id);
    expect(otherItem.data).toMatchObject({ caseId: other.data.id, externalItemId: VIDEO });
    expect(otherItem.data.archivedAt).toBeNull();
    expect(await prisma.reportedItem.count({ where: { externalItemId: VIDEO } })).toBe(2);
  });

  it('observedAt is stored exactly as the supplied instant or refused before anything is written (R7); a PATCH compares instants, not spellings', async () => {
    const w = await world();
    const current = await getCase(w.case.data.id);
    for (const observedAt of [
      '2026-09-20T23:59:60Z',
      '2026-09-20T10:00:00.1234Z',
      '0999-12-31T23:59:59Z',
      '9999-12-31T23:59:59.9Z',
    ]) {
      const result = await postItem(w.case.data.id, current.etag, { observedAt });
      expect([...outcome(result), detailsOf(result)['issues']], observedAt).toEqual([
        422,
        'VALIDATION_FAILED',
        [
          {
            path: 'observedAt',
            message:
              'Must be a real instant (no leap second) with at most millisecond precision, between 1000-01-01T00:00:00.000Z and 9999-12-31T23:59:59.499Z',
          },
        ],
      ]);
    }
    expect(await countRows(prisma, 'reported_items')).toBe(0);
    for (const [index, [observedAt, instant]] of ADMITTED_SPELLINGS.entries()) {
      const spelled = await createItem(w.case.data.id, {
        rawUrl: itemUrl(`Spelling_0${index}`),
        observedAt,
      });
      expect(spelled.data.observedAt, observedAt).toBe(instant);
      expect(
        await columnInstant('reported_items', 'observed_at', spelled.data.id),
        observedAt,
      ).toBe(columnText(instant));
    }
    const item = await createItem(w.case.data.id, {
      observedAt: '2026-09-20T10:00:00.120000+02:00',
    });
    expect(item.data.observedAt).toBe('2026-09-20T08:00:00.120Z');
    const stored = await prisma.reportedItem.findUniqueOrThrow({ where: { id: item.data.id } });
    expect(stored.observedAt?.toISOString()).toBe('2026-09-20T08:00:00.120Z');
    // The same instant in another spelling changes nothing.
    const same = await patchItem(w.case.data.id, item.data.id, item.etag, {
      observedAt: '2026-09-20T08:00:00.12Z',
    });
    expect(versioned<ReportedItem>(same, 200).data).toEqual(item.data);
    expect(affectedOf(same)).toEqual([]);
    expect(await auditCount('REPORTED_ITEM_UPDATED')).toBe(0);
    // Another instant, in a spelling V8 cannot read, is stored as exactly that instant.
    const moved = versioned<ReportedItem>(
      await patchItem(w.case.data.id, item.data.id, item.etag, {
        observedAt: '2026-09-20T15:00:00+05',
      }),
      200,
    );
    expect(moved.data.observedAt).toBe('2026-09-20T10:00:00.000Z');
    expect(await columnInstant('reported_items', 'observed_at', item.data.id)).toBe(
      '2026-09-20 10:00:00.000',
    );
    // Clearing it is explicit.
    const cleared = versioned<ReportedItem>(
      await patchItem(w.case.data.id, item.data.id, moved.etag, { observedAt: null }),
      200,
    );
    expect([cleared.data.observedAt, cleared.data.rowVersion]).toEqual([null, 3]);
  });

  it('patch, archive and restore: the item’s own If-Match; the raw URL and derived id never change; archived is read-only except restore; nothing cascades', async () => {
    const { w, item, mapping } = await intakeWorld();
    const beforeCase = await getCase(w.case.data.id);
    const patched = versioned<ReportedItem>(
      await patchItem(w.case.data.id, item.data.id, item.etag, {
        displayTitle: 'SYNTHETIC corrected title',
      }),
      200,
    );
    expect(patched.data).toMatchObject({
      displayTitle: 'SYNTHETIC corrected title',
      rawUrl: item.data.rawUrl,
      externalItemId: item.data.externalItemId,
      rowVersion: 2,
    });
    const afterPatch = await getCase(w.case.data.id);
    expect(afterPatch.data.contextRevision).toBe(beforeCase.data.contextRevision + 1);
    // Not patchable: the URL and what is derived from it (unknown fields).
    for (const body of [
      { rawUrl: itemUrl('AAAAAAAAAAA') },
      { externalItemId: 'AAAAAAAAAAA' },
      { normalizedUrl: itemUrl('AAAAAAAAAAA') },
      {},
    ]) {
      expect(outcome(await patchItem(w.case.data.id, item.data.id, patched.etag, body))).toEqual([
        422,
        'VALIDATION_FAILED',
      ]);
    }
    const archived = versioned<ReportedItem>(
      await childCommand(
        'reported-items',
        'archive',
        w.case.data.id,
        item.data.id,
        patched.etag,
        {},
        'SYNTHETIC administrative archive (not a finding)',
      ),
      200,
    );
    expect(archived.data).toMatchObject({
      archivedAt: new Date(t.clock.ms).toISOString(),
      archiveReason: 'SYNTHETIC administrative archive (not a finding)',
      rowVersion: 3,
    });
    // Read-only except restore; the mapping that names it is unchanged.
    expect(
      outcome(await patchItem(w.case.data.id, item.data.id, archived.etag, { displayTitle: 'x' })),
    ).toEqual([409, 'RECORD_STATE_CONFLICT']);
    expect(
      outcome(
        await childCommand(
          'reported-items',
          'archive',
          w.case.data.id,
          item.data.id,
          archived.etag,
        ),
      ),
    ).toEqual([409, 'RECORD_STATE_CONFLICT']);
    expect((await getMapping(w.case.data.id, mapping.data.id)).data).toEqual(mapping.data);
    const restored = versioned<ReportedItem>(
      await childCommand('reported-items', 'restore', w.case.data.id, item.data.id, archived.etag),
      200,
    );
    expect(restored.data).toEqual({
      ...patched.data,
      rowVersion: 4,
      updatedAt: restored.data.updatedAt,
    });
    expect(
      outcome(
        await childCommand(
          'reported-items',
          'restore',
          w.case.data.id,
          item.data.id,
          restored.etag,
        ),
      ),
    ).toEqual([409, 'RECORD_STATE_CONFLICT']);
    expect((await auditRows(item.data.id)).map((row) => row.action)).toEqual([
      'REPORTED_ITEM_CREATED',
      'REPORTED_ITEM_UPDATED',
      'REPORTED_ITEM_ARCHIVED',
      'REPORTED_ITEM_RESTORED',
    ]);
    // Every change of the item moved the case context once.
    expect((await getCase(w.case.data.id)).data.contextRevision).toBe(
      beforeCase.data.contextRevision + 3,
    );
    // An archived case and everything under it are read-only.
    const caseNow = await getCase(w.case.data.id);
    const archivedCase = versioned<CaseRecord>(
      await archiveCase(w.case.data.id, caseNow.etag),
      200,
    );
    expect(
      outcome(await patchItem(w.case.data.id, item.data.id, restored.etag, { displayTitle: 'y' })),
    ).toEqual([409, 'RECORD_STATE_CONFLICT']);
    expect(
      outcome(
        await postItem(w.case.data.id, archivedCase.etag, { rawUrl: itemUrl('BBBBBBBBBBB') }),
      ),
    ).toEqual([409, 'RECORD_STATE_CONFLICT']);
    versioned(await restoreCase(w.case.data.id, archivedCase.etag), 200);
  });

  it('list and get: one case’s items only, archived included, newest first; exact and literal search; 404 for an unknown case or item and for another case’s item', async () => {
    const w = await world();
    const first = await createItem(w.case.data.id, { displayTitle: 'SYNTHETIC Café night' });
    t.clock.advance(1000);
    const second = await createItem(w.case.data.id, {
      rawUrl: itemUrl('Second_Item'),
      displayTitle: 'SYNTHETIC Morning',
    });
    versioned(
      await childCommand('reported-items', 'archive', w.case.data.id, second.data.id, second.etag),
      200,
    );
    const other = await createCase(w.agency.data.id, { intakeLabel: 'SYNTHETIC other' });
    const foreign = await createItem(other.data.id, { displayTitle: 'SYNTHETIC Café night' });
    const all = await listOf<ReportedItem>(
      'listCaseReportedItems',
      `/cases/${w.case.data.id}/reported-items`,
    );
    expect(all.items.map((row) => row.id)).toEqual([second.data.id, first.data.id]);
    expect(all.items[0]?.archivedAt).not.toBeNull();
    const search = async (q: string) =>
      (
        await listOf<ReportedItem>(
          'listCaseReportedItems',
          `/cases/${w.case.data.id}/reported-items?q=${encodeURIComponent(q)}`,
        )
      ).items.map((row) => row.id);
    expect(await search('cafe')).toEqual([first.data.id]);
    expect(await search(VIDEO)).toEqual([first.data.id]);
    // Discovery only: the raw-URL substring match ignores case; the video id is still exact.
    expect(await search(VIDEO.toLowerCase())).toEqual([first.data.id]);
    expect(await search('Second_Item')).toEqual([second.data.id]);
    expect(await search(second.data.id)).toEqual([second.data.id]);
    expect(await search(foreign.data.id)).toEqual([]);
    expect(await search('%')).toEqual([]);
    const page = await listOf<ReportedItem>(
      'listCaseReportedItems',
      `/cases/${w.case.data.id}/reported-items?limit=1`,
    );
    expect(page.items.map((row) => row.id)).toEqual([second.data.id]);
    const next = await listOf<ReportedItem>(
      'listCaseReportedItems',
      `/cases/${w.case.data.id}/reported-items?limit=1&cursor=${page.nextCursor}`,
    );
    expect(next.items.map((row) => row.id)).toEqual([first.data.id]);
    expect(
      outcome(
        await client.get(
          'listCaseReportedItems',
          `/cases/${other.data.id}/reported-items?cursor=${page.nextCursor}`,
        ),
      ),
    ).toEqual([400, 'INVALID_CURSOR']);
    expect(
      outcome(await client.get('listCaseReportedItems', `/cases/${randomUUID()}/reported-items`)),
    ).toEqual([404, 'NOT_FOUND']);
    const unknown = await readItem(w.case.data.id, randomUUID());
    const crossCase = await readItem(w.case.data.id, foreign.data.id);
    const unknownCase = await readItem(randomUUID(), first.data.id);
    for (const result of [unknown, crossCase, unknownCase]) {
      expect([result.status, refusalOf(result)]).toEqual([404, refusalOf(unknown)]);
      expect(result.headers['etag']).toBeUndefined();
    }
    expect(outcome(await readItem(w.case.data.id, 'not-a-uuid'))).toEqual([404, 'NOT_FOUND']);
  });
});

describe('CASE WORKS — recorded work identification; not ownership, authorship or standing', () => {
  it('create and patch: exactly the supplied fields; no owner, subject or rights holder inferred; notes alone leave the case context unchanged', async () => {
    const w = await world();
    const before = await getCase(w.case.data.id);
    const result = await postWork(w.case.data.id, before.etag, {
      title: '  SYNTHETIC Song — “Title” 𝄞  ',
      sourceUrl: 'https://example.invalid/synthetic-publication',
      externalWorkId: 'SYN-ISRC-0001',
      workType: 'SYNTHETIC sound recording',
      notes: 'SYNTHETIC operator note',
    });
    const work = versioned<CaseWork>(result, 201);
    expect(work.data).toEqual({
      id: work.data.id,
      caseId: w.case.data.id,
      title: '  SYNTHETIC Song — “Title” 𝄞  ',
      sourceUrl: 'https://example.invalid/synthetic-publication',
      externalWorkId: 'SYN-ISRC-0001',
      workType: 'SYNTHETIC sound recording',
      notes: 'SYNTHETIC operator note',
      archivedAt: null,
      archiveReason: null,
      createdAt: new Date(t.clock.ms).toISOString(),
      createdById: client.session.userId,
      updatedAt: new Date(t.clock.ms).toISOString(),
      updatedById: client.session.userId,
      rowVersion: 1,
    });
    expect(work.etag).toBe(`"CaseWork:${work.data.id}:v1"`);
    const created = await getCase(w.case.data.id);
    expect(created.data.contextRevision).toBe(before.data.contextRevision + 1);
    // No owner, subject or rights record appears; the case's owner hint is not filled in.
    expect(created.data.ownerHintId).toBe(before.data.ownerHintId);
    expect(await countRows(prisma, 'case_facts')).toBe(0);
    const [audit] = await auditRows(work.data.id);
    expect(audit?.afterRedacted).toMatchObject({
      title: '  SYNTHETIC Song — “Title” 𝄞  ',
      notes: { redacted: true, codePoints: codePoints('SYNTHETIC operator note') },
    });
    // Notes only: the work changes, the case does not.
    const noted = versioned<CaseWork>(
      await patchWork(w.case.data.id, work.data.id, work.etag, { notes: 'SYNTHETIC second note' }),
      200,
    );
    expect(noted.data.rowVersion).toBe(2);
    expect((await getCase(w.case.data.id)).data).toEqual(created.data);
    // Identification fields are case context.
    const retitled = await patchWork(w.case.data.id, work.data.id, noted.etag, {
      title: 'SYNTHETIC Corrected Title',
      sourceUrl: null,
    });
    expect(versioned<CaseWork>(retitled, 200).data).toMatchObject({
      title: 'SYNTHETIC Corrected Title',
      sourceUrl: null,
      rowVersion: 3,
    });
    const retitledCase = await getCase(w.case.data.id);
    expect([retitledCase.data.rowVersion, retitledCase.data.contextRevision]).toEqual([
      created.data.rowVersion + 1,
      created.data.contextRevision + 1,
    ]);
    // A no-op writes nothing; an empty title and unknown fields are refused.
    const current = await getWork(w.case.data.id, work.data.id);
    const noop = await patchWork(w.case.data.id, work.data.id, current.etag, {
      title: 'SYNTHETIC Corrected Title',
    });
    expect(versioned<CaseWork>(noop, 200).data).toEqual(current.data);
    for (const body of [{ title: '' }, { ownerId: randomUUID() }, { caseId: randomUUID() }, {}]) {
      expect(outcome(await patchWork(w.case.data.id, work.data.id, current.etag, body))).toEqual([
        422,
        'VALIDATION_FAILED',
      ]);
    }
    expect(outcome(await postWork(w.case.data.id, retitledCase.etag, { title: '' }))).toEqual([
      422,
      'VALIDATION_FAILED',
    ]);
  });

  it('identical-looking works stay independent: no de-duplication or matching by title or URL, within a case or across cases', async () => {
    const w = await world();
    const other = await createCase(w.agency.data.id, {
      routeId: w.route.data.id,
      intakeLabel: 'SYNTHETIC second case on the same route',
    });
    const same = { title: 'SYNTHETIC Same Title', sourceUrl: 'https://example.invalid/same' };
    const a1 = await createWork(w.case.data.id, same);
    const a2 = await createWork(w.case.data.id, same);
    const b1 = await createWork(other.data.id, same);
    expect(new Set([a1.data.id, a2.data.id, b1.data.id]).size).toBe(3);
    expect(b1.data.caseId).toBe(other.data.id);
    const patched = versioned<CaseWork>(
      await patchWork(w.case.data.id, a1.data.id, a1.etag, { title: 'SYNTHETIC Changed in A' }),
      200,
    );
    expect(patched.data.title).toBe('SYNTHETIC Changed in A');
    expect((await getWork(other.data.id, b1.data.id)).data).toEqual(b1.data);
    expect((await getWork(w.case.data.id, a2.data.id)).data).toEqual(a2.data);
    const listed = await listOf<CaseWork>('listCaseCaseWorks', `/cases/${other.data.id}/works`);
    expect(listed.items.map((row) => row.id)).toEqual([b1.data.id]);
  });

  it('archive and restore: administrative; mappings and facts naming the work stay as they are; no new mapping or fact can name an archived work', async () => {
    const { w, item, work, mapping } = await intakeWorld();
    const fact = await createFact(w.case.data.id, {
      factType: 'WORK_IDENTIFICATION',
      scopeKind: 'WORK',
      caseWorkId: work.data.id,
      provenance: 'OPERATOR_REPORTED',
    });
    const archived = versioned<CaseWork>(
      await childCommand('works', 'archive', w.case.data.id, work.data.id, work.etag),
      200,
    );
    expect(archived.data.archivedAt).not.toBeNull();
    expect((await getMapping(w.case.data.id, mapping.data.id)).data).toEqual(mapping.data);
    expect(await getFact(w.case.data.id, fact.id)).toEqual(fact);
    const caseNow = await getCase(w.case.data.id);
    const refusedMapping = await postMapping(w.case.data.id, caseNow.etag, {
      caseWorkId: work.data.id,
      reportedItemId: item.data.id,
      occurrence: 2,
    });
    expect([...outcome(refusedMapping), detailsOf(refusedMapping)]).toEqual([
      409,
      'RECORD_STATE_CONFLICT',
      { record: 'CaseWork', archived: true, operation: 'createUseMapping', field: 'caseWorkId' },
    ]);
    const refusedFact = await postFact(w.case.data.id, caseNow.etag, {
      factType: 'WORK_IDENTIFICATION',
      scopeKind: 'WORK',
      caseWorkId: work.data.id,
    });
    expect(outcome(refusedFact)).toEqual([409, 'RECORD_STATE_CONFLICT']);
    // An archived work is read-only except restore.
    expect(
      outcome(await patchWork(w.case.data.id, work.data.id, archived.etag, { notes: 'x' })),
    ).toEqual([409, 'RECORD_STATE_CONFLICT']);
    const restored = versioned<CaseWork>(
      await childCommand('works', 'restore', w.case.data.id, work.data.id, archived.etag),
      200,
    );
    expect(restored.data).toMatchObject({ archivedAt: null, archiveReason: null, rowVersion: 3 });
    expect(await auditCount('CASE_WORK_ARCHIVED', work.data.id)).toBe(1);
    expect(await auditCount('CASE_WORK_RESTORED', work.data.id)).toBe(1);
  });
});

describe('USE MAPPINGS — a recorded work ↔ reported item association within one case; not an infringement finding', () => {
  it('create: the exact work and item of this case; explicit occurrence; unsigned millisecond strings round-trip exactly (beyond 24 h, the safe-integer bound); unknown bounds stay null; raw timecodes and convention as supplied', async () => {
    const w = await world();
    const item = await createItem(w.case.data.id);
    const work = await createWork(w.case.data.id);
    const before = await getCase(w.case.data.id);
    const rawTimecodes = {
      sourceStart: '01:02:03.004',
      sourceEnd: '30:00:00:00 (as written by the operator)',
      reportedStart: 'about 1 min in',
      reportedEnd: null,
    };
    const result = await postMapping(w.case.data.id, before.etag, {
      caseWorkId: work.data.id,
      reportedItemId: item.data.id,
      occurrence: 3,
      sourceStartMs: '0',
      sourceEndMs: '108000000',
      reportedStartMs: '60000',
      reportedEndMs: '9007199254740991',
      rawTimecodes,
      boundaryConvention: 'HALF_OPEN',
      limitations: 'SYNTHETIC limitations of this observation',
    });
    const mapping = versioned<UseMapping>(result, 201);
    expect(mapping.data).toEqual({
      id: mapping.data.id,
      caseId: w.case.data.id,
      caseWorkId: work.data.id,
      reportedItemId: item.data.id,
      occurrence: 3,
      sourceStartMs: '0',
      sourceEndMs: '108000000',
      reportedStartMs: '60000',
      reportedEndMs: '9007199254740991',
      rawTimecodes,
      boundaryConvention: 'HALF_OPEN',
      provenance: 'MISSING',
      basisSourceId: null,
      limitations: 'SYNTHETIC limitations of this observation',
      archivedAt: null,
      archiveReason: null,
      createdAt: new Date(t.clock.ms).toISOString(),
      createdById: client.session.userId,
      updatedAt: new Date(t.clock.ms).toISOString(),
      updatedById: client.session.userId,
      rowVersion: 1,
    });
    const stored = await prisma.useMapping.findUniqueOrThrow({ where: { id: mapping.data.id } });
    expect([stored.sourceEndMs, stored.reportedEndMs]).toEqual([108000000n, 9007199254740991n]);
    expect((await getCase(w.case.data.id)).data.contextRevision).toBe(
      before.data.contextRevision + 1,
    );
    // Unknown bounds stay null: nothing is fabricated; the defaults are UNKNOWN and MISSING.
    const sparse = await createMapping(w.case.data.id, {
      caseWorkId: work.data.id,
      reportedItemId: item.data.id,
      occurrence: 1,
      sourceStartMs: '5000',
    });
    expect(sparse.data).toMatchObject({
      sourceStartMs: '5000',
      sourceEndMs: null,
      reportedStartMs: null,
      reportedEndMs: null,
      rawTimecodes: null,
      boundaryConvention: 'UNKNOWN',
      provenance: 'MISSING',
    });
    // One work three times in one video: three mappings (AC-025).
    await createMapping(w.case.data.id, {
      caseWorkId: work.data.id,
      reportedItemId: item.data.id,
      occurrence: 2,
    });
    expect(await prisma.useMapping.count({ where: { caseWorkId: work.data.id } })).toBe(3);
    // Nothing else is created: no fact, finding or later-phase record.
    expect(await countRows(prisma, 'case_facts')).toBe(0);
    await expectNoLaterPhaseRecords();
  });

  it('refuses another case’s or an unknown work or item, archived parties, a duplicate occurrence, a known end not after its start, values beyond the bound and unknown conventions; nothing is written', async () => {
    const w = await world();
    const item = await createItem(w.case.data.id);
    const work = await createWork(w.case.data.id);
    const other = await createCase(w.agency.data.id, {
      routeId: w.route.data.id,
      intakeLabel: 'SYNTHETIC other',
    });
    const foreignItem = await createItem(other.data.id);
    const foreignWork = await createWork(other.data.id, { title: 'SYNTHETIC Work Title' });
    await createMapping(w.case.data.id, { caseWorkId: work.data.id, reportedItemId: item.data.id });
    const current = await getCase(w.case.data.id);
    const dump = await intakeDump();
    const base = { caseWorkId: work.data.id, reportedItemId: item.data.id, occurrence: 2 };
    const cases: Array<[Record<string, unknown>, number, string, Record<string, unknown>?]> = [
      [
        { ...base, caseWorkId: foreignWork.data.id },
        422,
        'CROSS_CASE_REFERENCE',
        { field: 'caseWorkId' },
      ],
      [
        { ...base, reportedItemId: foreignItem.data.id },
        422,
        'CROSS_CASE_REFERENCE',
        { field: 'reportedItemId' },
      ],
      [{ ...base, caseWorkId: randomUUID() }, 422, 'REFERENCE_NOT_FOUND', { field: 'caseWorkId' }],
      [
        { ...base, reportedItemId: randomUUID() },
        422,
        'REFERENCE_NOT_FOUND',
        { field: 'reportedItemId' },
      ],
      [{ ...base, occurrence: 1 }, 409, 'DUPLICATE_USE_MAPPING'],
      [
        { ...base, sourceStartMs: '1000', sourceEndMs: '1000' },
        422,
        'TIME_RANGE_INVALID',
        { fields: ['sourceStartMs', 'sourceEndMs'] },
      ],
      [
        { ...base, reportedStartMs: '2000', reportedEndMs: '1999' },
        422,
        'TIME_RANGE_INVALID',
        { fields: ['reportedStartMs', 'reportedEndMs'] },
      ],
      [{ ...base, sourceEndMs: '9007199254740992' }, 422, 'VALIDATION_FAILED'],
      [{ ...base, sourceEndMs: '9999999999999999' }, 422, 'VALIDATION_FAILED'],
      [{ ...base, sourceEndMs: 1000 }, 422, 'VALIDATION_FAILED'],
      [{ ...base, sourceEndMs: '-1' }, 422, 'VALIDATION_FAILED'],
      [{ ...base, sourceEndMs: '01000' }, 422, 'VALIDATION_FAILED'],
      [{ ...base, sourceEndMs: '1.5' }, 422, 'VALIDATION_FAILED'],
      [{ ...base, boundaryConvention: 'CLOSED' }, 422, 'VALIDATION_FAILED'],
      [{ ...base, occurrence: 0 }, 422, 'VALIDATION_FAILED'],
      [{ ...base, rawTimecodes: { sourceStart: 1 } }, 422, 'VALIDATION_FAILED'],
      [{ ...base, provenance: 'VERIFIED' }, 422, 'VALIDATION_FAILED'],
    ];
    for (const [body, status, errorCode, details] of cases) {
      const result = await postMapping(w.case.data.id, current.etag, body);
      expect(outcome(result), JSON.stringify(body)).toEqual([status, errorCode]);
      if (details) expect(detailsOf(result), JSON.stringify(body)).toMatchObject(details);
    }
    // The occurrence is required and explicit: the server never numbers occurrences.
    const { occurrence: _occurrence, ...withoutOccurrence } = base;
    expect(
      outcome(
        await caseChildCreate(
          'createUseMapping',
          w.case.data.id,
          current.etag,
          'mappings',
          withoutOccurrence,
        ),
      ),
    ).toEqual([422, 'VALIDATION_FAILED']);
    // Archived parties.
    versioned(
      await childCommand(
        'reported-items',
        'archive',
        w.case.data.id,
        item.data.id,
        (await getItem(w.case.data.id, item.data.id)).etag,
      ),
      200,
    );
    const afterArchive = await getCase(w.case.data.id);
    const archivedItem = await postMapping(w.case.data.id, afterArchive.etag, base);
    expect([...outcome(archivedItem), detailsOf(archivedItem)]).toEqual([
      409,
      'RECORD_STATE_CONFLICT',
      {
        record: 'ReportedItem',
        archived: true,
        operation: 'createUseMapping',
        field: 'reportedItemId',
      },
    ]);
    const restoreEtag = (await getItem(w.case.data.id, item.data.id)).etag;
    versioned(
      await childCommand('reported-items', 'restore', w.case.data.id, item.data.id, restoreEtag),
      200,
    );
    const dumpAfter = await intakeDump();
    // Only the archive and restore above changed rows (the item and the case).
    expect(dumpAfter['use_mappings']).toEqual(dump['use_mappings']);
    expect(dumpAfter['case_facts']).toEqual(dump['case_facts']);
  });

  it('basis source and provenance: the basis must apply to this case; DOCUMENT_REVIEWED needs a basis source recorded as reviewed; provenance is stored as supplied and never upgraded', async () => {
    const w = await world();
    const item = await createItem(w.case.data.id);
    const work = await createWork(w.case.data.id);
    const other = await createCase(w.agency.data.id, { intakeLabel: 'SYNTHETIC other' });
    const otherAgency = await createAgency('B');
    const foreignAgencySource = await createSource({ agencyId: otherAgency.data.id });
    const otherCaseSource = await createSource({
      agencyId: w.agency.data.id,
      scopeBindings: { caseIds: [other.data.id], legalSubjectIds: [], agencyIds: [] },
    });
    const reviewed = await createSource({
      agencyId: w.agency.data.id,
      reportedProvenance: 'DOCUMENT_REVIEWED',
      reviewedByLabel: 'SYNTHETIC Reviewer',
      reviewedAt: '2026-09-20T10:00:00Z',
    });
    const current = await getCase(w.case.data.id);
    const base = { caseWorkId: work.data.id, reportedItemId: item.data.id };
    const refusals: Array<[Record<string, unknown>, string, Record<string, unknown>]> = [
      [
        { ...base, basisSourceId: otherCaseSource.id },
        'CROSS_CASE_REFERENCE',
        { field: 'basisSourceId' },
      ],
      [
        { ...base, basisSourceId: foreignAgencySource.id },
        'CROSS_AGENCY_REFERENCE',
        { field: 'basisSourceId' },
      ],
      [{ ...base, basisSourceId: randomUUID() }, 'REFERENCE_NOT_FOUND', { field: 'basisSourceId' }],
      [
        { ...base, provenance: 'DOCUMENT_REVIEWED' },
        'REVIEW_UNSUPPORTED',
        { field: 'provenance', reason: 'NO_BASIS_SOURCE' },
      ],
      [
        { ...base, provenance: 'DOCUMENT_REVIEWED', basisSourceId: w.source.id },
        'REVIEW_UNSUPPORTED',
        { field: 'provenance', reason: 'SOURCE_NOT_REVIEWED' },
      ],
    ];
    for (const [body, errorCode, details] of refusals) {
      const result = await postMapping(w.case.data.id, current.etag, body);
      expect([...outcome(result), detailsOf(result)], JSON.stringify(body)).toEqual([
        422,
        errorCode,
        details,
      ]);
    }
    expect(await countRows(prisma, 'use_mappings')).toBe(0);
    // Accepted: exactly as supplied.
    const operator = await createMapping(w.case.data.id, {
      ...base,
      provenance: 'OPERATOR_REPORTED',
      basisSourceId: w.source.id,
    });
    expect([operator.data.provenance, operator.data.basisSourceId]).toEqual([
      'OPERATOR_REPORTED',
      w.source.id,
    ]);
    const documented = await createMapping(w.case.data.id, {
      ...base,
      occurrence: 2,
      provenance: 'DOCUMENT_REVIEWED',
      basisSourceId: reviewed.id,
    });
    expect(documented.data.provenance).toBe('DOCUMENT_REVIEWED');
    // A reviewed basis source upgrades nothing: an omitted provenance stays MISSING, a supplied
    // one stays as supplied.
    const unstated = await createMapping(w.case.data.id, {
      ...base,
      occurrence: 3,
      basisSourceId: reviewed.id,
    });
    const reported = await createMapping(w.case.data.id, {
      ...base,
      occurrence: 4,
      provenance: 'OPERATOR_REPORTED',
      basisSourceId: reviewed.id,
    });
    expect([unstated.data.provenance, reported.data.provenance]).toEqual([
      'MISSING',
      'OPERATOR_REPORTED',
    ]);
    for (const [index, provenance] of ['ANALYSIS', 'CONFLICT', 'MISSING'].entries()) {
      const row = await createMapping(w.case.data.id, {
        ...base,
        occurrence: index + 10,
        provenance,
      });
      expect(row.data.provenance).toBe(provenance);
    }
    // The cited sources are unchanged: nothing upgrades or re-points them.
    expect((await client.get('getSource', `/sources/${w.source.id}`)).json).toMatchObject({
      data: { reportedProvenance: 'OPERATOR_REPORTED' },
    });
    // A PATCH to DOCUMENT_REVIEWED with an unreviewed basis is refused the same way.
    expect(
      outcome(
        await patchMapping(w.case.data.id, operator.data.id, operator.etag, {
          provenance: 'DOCUMENT_REVIEWED',
        }),
      ),
    ).toEqual([422, 'REVIEW_UNSUPPORTED']);
    const upgraded = versioned<UseMapping>(
      await patchMapping(w.case.data.id, operator.data.id, operator.etag, {
        provenance: 'DOCUMENT_REVIEWED',
        basisSourceId: reviewed.id,
      }),
      200,
    );
    expect([upgraded.data.provenance, upgraded.data.basisSourceId]).toEqual([
      'DOCUMENT_REVIEWED',
      reviewed.id,
    ]);
  });

  it('patch, archive and restore: the mapping’s If-Match; ordering checked on the merged state; the case context moves; the work, item and occurrence never change; archived parties block editing and restoring', async () => {
    const { w, item, work, mapping } = await intakeWorld();
    const before = await getCase(w.case.data.id);
    const timed = versioned<UseMapping>(
      await patchMapping(w.case.data.id, mapping.data.id, mapping.etag, {
        sourceStartMs: '1000',
        sourceEndMs: '5000',
        boundaryConvention: 'INCLUSIVE',
      }),
      200,
    );
    expect(timed.data).toMatchObject({
      sourceStartMs: '1000',
      sourceEndMs: '5000',
      boundaryConvention: 'INCLUSIVE',
      rowVersion: 2,
    });
    expect(timed.etag).toBe(`"UseMapping:${mapping.data.id}:v2"`);
    const afterPatch = await getCase(w.case.data.id);
    expect([afterPatch.data.rowVersion, afterPatch.data.contextRevision]).toEqual([
      before.data.rowVersion + 1,
      before.data.contextRevision + 1,
    ]);
    // Merged state: a new start beyond the stored end is refused; clearing the end is not.
    expect(
      outcome(
        await patchMapping(w.case.data.id, mapping.data.id, timed.etag, { sourceStartMs: '6000' }),
      ),
    ).toEqual([422, 'TIME_RANGE_INVALID']);
    const opened = versioned<UseMapping>(
      await patchMapping(w.case.data.id, mapping.data.id, timed.etag, {
        sourceStartMs: '6000',
        sourceEndMs: null,
      }),
      200,
    );
    expect([opened.data.sourceStartMs, opened.data.sourceEndMs]).toEqual(['6000', null]);
    // Raw timecodes are replaced exactly, and cleared explicitly.
    const raw = versioned<UseMapping>(
      await patchMapping(w.case.data.id, mapping.data.id, opened.etag, {
        rawTimecodes: { sourceStart: '0:06' },
      }),
      200,
    );
    expect(raw.data.rawTimecodes).toEqual({ sourceStart: '0:06' });
    const cleared = versioned<UseMapping>(
      await patchMapping(w.case.data.id, mapping.data.id, raw.etag, { rawTimecodes: null }),
      200,
    );
    expect(cleared.data.rawTimecodes).toBeNull();
    // Never patchable: the work, the item and the occurrence (unknown fields).
    for (const body of [
      { caseWorkId: work.data.id },
      { reportedItemId: item.data.id },
      { occurrence: 9 },
      {},
    ]) {
      expect(
        outcome(await patchMapping(w.case.data.id, mapping.data.id, cleared.etag, body)),
      ).toEqual([422, 'VALIDATION_FAILED']);
    }
    // A no-op writes nothing.
    const noop = await patchMapping(w.case.data.id, mapping.data.id, cleared.etag, {
      boundaryConvention: 'INCLUSIVE',
    });
    expect(versioned<UseMapping>(noop, 200).data).toEqual(cleared.data);
    // Archived work: the mapping is not edited or restored, but it can be archived.
    const workNow = await getWork(w.case.data.id, work.data.id);
    const archivedWork = versioned<CaseWork>(
      await childCommand('works', 'archive', w.case.data.id, work.data.id, workNow.etag),
      200,
    );
    expect(
      outcome(
        await patchMapping(w.case.data.id, mapping.data.id, cleared.etag, {
          limitations: 'SYNTHETIC',
        }),
      ),
    ).toEqual([409, 'RECORD_STATE_CONFLICT']);
    const archivedMapping = versioned<UseMapping>(
      await childCommand('mappings', 'archive', w.case.data.id, mapping.data.id, cleared.etag),
      200,
    );
    const blocked = await childCommand(
      'mappings',
      'restore',
      w.case.data.id,
      mapping.data.id,
      archivedMapping.etag,
    );
    expect([...outcome(blocked), detailsOf(blocked)]).toEqual([
      409,
      'RECORD_STATE_CONFLICT',
      {
        record: 'CaseWork',
        archived: true,
        operation: 'restoreUseMapping',
        field: 'caseWorkId',
      },
    ]);
    versioned(
      await childCommand('works', 'restore', w.case.data.id, work.data.id, archivedWork.etag),
      200,
    );
    const restored = versioned<UseMapping>(
      await childCommand(
        'mappings',
        'restore',
        w.case.data.id,
        mapping.data.id,
        archivedMapping.etag,
      ),
      200,
    );
    expect(restored.data).toMatchObject({
      caseWorkId: work.data.id,
      reportedItemId: item.data.id,
      occurrence: 1,
      archivedAt: null,
    });
    expect((await auditRows(mapping.data.id)).map((row) => row.action)).toEqual([
      'USE_MAPPING_CREATED',
      'USE_MAPPING_UPDATED',
      'USE_MAPPING_UPDATED',
      'USE_MAPPING_UPDATED',
      'USE_MAPPING_UPDATED',
      'USE_MAPPING_ARCHIVED',
      'USE_MAPPING_RESTORED',
    ]);
  });

  it('list and get: one case’s mappings only, newest first; exact-id search by mapping, work or item; another case’s mapping is 404 like an unknown one', async () => {
    const { w, item, work, mapping } = await intakeWorld();
    t.clock.advance(1000);
    const second = await createMapping(w.case.data.id, {
      caseWorkId: work.data.id,
      reportedItemId: item.data.id,
      occurrence: 2,
    });
    const b = await intakeWorld('B');
    const listed = await listOf<UseMapping>(
      'listCaseUseMappings',
      `/cases/${w.case.data.id}/mappings`,
    );
    expect(listed.items.map((row) => row.id)).toEqual([second.data.id, mapping.data.id]);
    const search = async (q: string) =>
      (
        await listOf<UseMapping>(
          'listCaseUseMappings',
          `/cases/${w.case.data.id}/mappings?q=${encodeURIComponent(q)}`,
        )
      ).items.map((row) => row.id);
    expect(await search(work.data.id)).toEqual([second.data.id, mapping.data.id]);
    expect(await search(mapping.data.id)).toEqual([mapping.data.id]);
    expect(await search(b.work.data.id)).toEqual([]);
    expect(await search('SYNTHETIC')).toEqual([]);
    const unknown = await readMapping(w.case.data.id, randomUUID());
    const crossCase = await readMapping(w.case.data.id, b.mapping.data.id);
    expect([crossCase.status, refusalOf(crossCase)]).toEqual([404, refusalOf(unknown)]);
    expect(unknown.status).toBe(404);
  });
});

describe('CASE FACTS — explicit, attributed, case-specific assertions; revisions preserve history', () => {
  it('every contracted fact type and every scope kind: stored exactly as supplied; MISSING stays MISSING; the resolution state is stored, never computed', async () => {
    const { w, item, work, mapping } = await intakeWorld();
    const factTypes = Object.keys(FACT_VALUES);
    expect(factTypes).toHaveLength(9);
    for (const factType of factTypes) {
      const before = await getCase(w.case.data.id);
      const result = await postFact(w.case.data.id, before.etag, {
        factType,
        scopeText: `SYNTHETIC ${factType} scope`,
      });
      const fact = immutable<CaseFact>(result, 201);
      expect(fact).toEqual({
        id: fact.id,
        caseId: w.case.data.id,
        factGroupId: fact.factGroupId,
        revision: 1,
        supersedesFactId: null,
        factType,
        scopeKind: 'CASE',
        caseWorkId: null,
        reportedItemId: null,
        mappingId: null,
        value: FACT_VALUES[factType],
        provenance: 'MISSING',
        rawProvenance: null,
        resolutionState: 'UNASSESSED',
        assertedByLabel: null,
        assertedAsOf: null,
        scopeText: `SYNTHETIC ${factType} scope`,
        limitations: null,
        changeReason: 'SYNTHETIC initial intake',
        createdAt: new Date(t.clock.ms).toISOString(),
        createdById: client.session.userId,
      });
      expect(fact.factGroupId).not.toBe(fact.id);
      expect(await getFact(w.case.data.id, fact.id)).toEqual(fact);
      const after = await getCase(w.case.data.id);
      expect([after.data.rowVersion, after.data.contextRevision]).toEqual([
        before.data.rowVersion + 1,
        before.data.contextRevision + 1,
      ]);
      expect(affectedOf(result)).toEqual([
        { type: 'CaseRecord', id: w.case.data.id, rowVersion: after.data.rowVersion },
        { type: 'CaseFact', id: fact.id, rowVersion: null },
      ]);
    }
    // Scope kinds: exactly their record.
    const scoped: Array<[string, Record<string, unknown>]> = [
      ['WORK', { caseWorkId: work.data.id }],
      ['REPORTED_ITEM', { reportedItemId: item.data.id }],
      ['USE', { mappingId: mapping.data.id }],
    ];
    for (const [scopeKind, target] of scoped) {
      const fact = await createFact(w.case.data.id, {
        factType: 'AV_COMPARISON',
        scopeKind,
        ...target,
      });
      expect(fact).toMatchObject({
        scopeKind,
        caseWorkId: null,
        reportedItemId: null,
        mappingId: null,
        ...target,
      });
    }
    // Resolution states and provenance are stored exactly as supplied — the operator's record.
    const supplied = await createFact(w.case.data.id, {
      factType: 'RIGHTS_BASIS',
      value: {
        basis: 'ASSIGNMENT',
        assertion: 'SYNTHETIC assignment as reported by the owner',
        limitations: 'SYNTHETIC not reviewed',
      },
      provenance: 'OPERATOR_REPORTED',
      rawProvenance: 'OPERATOR_CONFIRMED',
      resolutionState: 'SUPPORTED_FOR_SCOPE',
      assertedByLabel: 'SYNTHETIC Owner Contact',
      assertedAsOf: '2026-09-19T12:00:00.5+02:00',
      limitations: 'SYNTHETIC limitation',
    });
    expect(supplied).toMatchObject({
      provenance: 'OPERATOR_REPORTED',
      rawProvenance: 'OPERATOR_CONFIRMED',
      resolutionState: 'SUPPORTED_FOR_SCOPE',
      assertedByLabel: 'SYNTHETIC Owner Contact',
      assertedAsOf: '2026-09-19T10:00:00.500Z',
    });
    // Nothing is derived from any of it: no finding, readiness or later-phase record.
    expect(JSON.stringify(await getFact(w.case.data.id, supplied.id))).not.toMatch(
      /"(g[1-7]\w*|ready\w*|eligib\w*|infring\w*|verified\w*|approved\w*)"\s*:/i,
    );
    await expectNoLaterPhaseRecords();
    // A typed value must match its fact type; an unsupported type is refused (the frozen fixtures).
    const current = await getCase(w.case.data.id);
    for (const body of [
      { factType: 'PERMISSION', value: { verified: true } },
      { factType: 'SCANNER_PROVED_INFRINGEMENT', value: FACT_VALUES['PERMISSION'] },
      { factType: 'PERMISSION', value: FACT_VALUES['PERMISSION'], resolutionState: 'PASS' },
      { factType: 'PERMISSION', value: FACT_VALUES['PERMISSION'], scopeText: '' },
      { factType: 'PERMISSION', value: FACT_VALUES['PERMISSION'], changeReason: '' },
      { factType: 'PERMISSION', value: FACT_VALUES['PERMISSION'], g1: 'PASS' },
    ]) {
      expect(
        outcome(await postFact(w.case.data.id, current.etag, body)),
        JSON.stringify(body),
      ).toEqual([422, 'VALIDATION_FAILED']);
    }
  });

  it('scope: CASE names no record; WORK, REPORTED_ITEM and USE name exactly their record of this case; mismatches, other cases’ and archived records are refused', async () => {
    const { w, item, work, mapping } = await intakeWorld();
    const b = await intakeWorld('B');
    const current = await getCase(w.case.data.id);
    const cases: Array<[Record<string, unknown>, number, string, Record<string, unknown>]> = [
      [
        { scopeKind: 'CASE', caseWorkId: work.data.id },
        422,
        'FACT_SCOPE_INVALID',
        { field: 'caseWorkId', scopeKind: 'CASE', reason: 'TARGET_NOT_ALLOWED' },
      ],
      [
        { scopeKind: 'WORK' },
        422,
        'FACT_SCOPE_INVALID',
        { field: 'caseWorkId', scopeKind: 'WORK', reason: 'TARGET_REQUIRED' },
      ],
      [
        { scopeKind: 'WORK', caseWorkId: work.data.id, reportedItemId: item.data.id },
        422,
        'FACT_SCOPE_INVALID',
        { field: 'reportedItemId', scopeKind: 'WORK', reason: 'TARGET_NOT_ALLOWED' },
      ],
      [
        { scopeKind: 'REPORTED_ITEM', caseWorkId: work.data.id },
        422,
        'FACT_SCOPE_INVALID',
        { field: 'caseWorkId', scopeKind: 'REPORTED_ITEM', reason: 'TARGET_NOT_ALLOWED' },
      ],
      [
        { scopeKind: 'USE', mappingId: mapping.data.id, caseWorkId: work.data.id },
        422,
        'FACT_SCOPE_INVALID',
        { field: 'caseWorkId', scopeKind: 'USE', reason: 'TARGET_NOT_ALLOWED' },
      ],
      [
        { scopeKind: 'WORK', caseWorkId: b.work.data.id },
        422,
        'CROSS_CASE_REFERENCE',
        { field: 'caseWorkId' },
      ],
      [
        { scopeKind: 'REPORTED_ITEM', reportedItemId: b.item.data.id },
        422,
        'CROSS_CASE_REFERENCE',
        { field: 'reportedItemId' },
      ],
      [
        { scopeKind: 'USE', mappingId: b.mapping.data.id },
        422,
        'CROSS_CASE_REFERENCE',
        { field: 'mappingId' },
      ],
      [
        { scopeKind: 'USE', mappingId: randomUUID() },
        422,
        'REFERENCE_NOT_FOUND',
        { field: 'mappingId' },
      ],
    ];
    for (const [body, status, errorCode, details] of cases) {
      const result = await postFact(w.case.data.id, current.etag, body);
      expect([...outcome(result), detailsOf(result)], JSON.stringify(body)).toEqual([
        status,
        errorCode,
        details,
      ]);
    }
    const mappingNow = await getMapping(w.case.data.id, mapping.data.id);
    versioned(
      await childCommand('mappings', 'archive', w.case.data.id, mapping.data.id, mappingNow.etag),
      200,
    );
    const archivedNow = await getCase(w.case.data.id);
    const archived = await postFact(w.case.data.id, archivedNow.etag, {
      scopeKind: 'USE',
      mappingId: mapping.data.id,
    });
    expect([...outcome(archived), detailsOf(archived)]).toEqual([
      409,
      'RECORD_STATE_CONFLICT',
      { record: 'UseMapping', archived: true, operation: 'createCaseFact', field: 'mappingId' },
    ]);
    expect(await countRows(prisma, 'case_facts')).toBe(0);
  });

  it('source support: a LINKED case source of this case, each once per role, stored exactly; other cases’, unknown, paused and unlinked links are refused; DOCUMENT_REVIEWED needs a reviewed source; nothing is upgraded', async () => {
    const { w, linked } = await intakeWorld();
    const b = await intakeWorld('B');
    const second = await linkSource(
      w.case.data.id,
      (await createSource({ agencyId: w.agency.data.id, title: 'SYNTHETIC second material' })).id,
    );
    const support = (caseSourceId: string, supportRole = 'SYNTHETIC_PRIMARY') => ({
      caseSourceId,
      supportRole,
      supportedAssertion: `SYNTHETIC assertion supported by ${supportRole}`,
    });
    const before = await getCase(w.case.data.id);
    const result = await postFact(w.case.data.id, before.etag, {
      provenance: 'OPERATOR_REPORTED',
      sources: [
        support(linked.data.id),
        support(linked.data.id, 'SYNTHETIC_CONTEXT'),
        support(second.data.id),
      ],
    });
    const fact = immutable<CaseFact>(result, 201);
    // Supports upgrade nothing: the provenance and resolution state stay as supplied.
    expect([fact.provenance, fact.resolutionState]).toEqual(['OPERATOR_REPORTED', 'UNASSESSED']);
    expect(await storedSupports(fact.id)).toEqual(
      [
        { caseSourceId: linked.data.id, supportRole: 'SYNTHETIC_CONTEXT' },
        { caseSourceId: linked.data.id, supportRole: 'SYNTHETIC_PRIMARY' },
        { caseSourceId: second.data.id, supportRole: 'SYNTHETIC_PRIMARY' },
      ]
        .sort((x, y) =>
          x.caseSourceId === y.caseSourceId
            ? x.supportRole.localeCompare(y.supportRole)
            : x.caseSourceId.localeCompare(y.caseSourceId),
        )
        .map((row) => ({
          factId: fact.id,
          ...row,
          supportedAssertion: `SYNTHETIC assertion supported by ${row.supportRole}`,
        })),
    );
    const affected = affectedOf(result);
    expect(affected.filter((row) => row['type'] === 'FactSource')).toHaveLength(3);
    // The wire fact carries no support list — getCaseFactSources (TB-SCHEMA-API-v1.2.0) reads the
    // supports — so it keeps exactly the contracted fields.
    expect(Object.keys(fact).sort()).toEqual(
      [
        'id',
        'caseId',
        'factGroupId',
        'revision',
        'supersedesFactId',
        'factType',
        'scopeKind',
        'caseWorkId',
        'reportedItemId',
        'mappingId',
        'value',
        'provenance',
        'rawProvenance',
        'resolutionState',
        'assertedByLabel',
        'assertedAsOf',
        'scopeText',
        'limitations',
        'changeReason',
        'createdAt',
        'createdById',
      ].sort(),
    );
    const [audit] = await auditRows(fact.id);
    expect(audit?.afterRedacted).toMatchObject({
      sources: expect.arrayContaining([
        expect.objectContaining({
          caseSourceId: linked.data.id,
          sourceId: w.source.id,
          supportRole: 'SYNTHETIC_PRIMARY',
          supportedAssertion: {
            redacted: true,
            codePoints: codePoints('SYNTHETIC assertion supported by SYNTHETIC_PRIMARY'),
          },
        }),
      ]),
    });
    expect(audit?.sourceIds).toEqual(expect.arrayContaining([w.source.id]));
    // Refusals.
    const paused = await linkSource(
      w.case.data.id,
      (await createSource({ agencyId: w.agency.data.id, title: 'SYNTHETIC paused' })).id,
    );
    await setLinkState(paused.data.id, 'PAUSED');
    const unlinked = await linkSource(
      w.case.data.id,
      (await createSource({ agencyId: w.agency.data.id, title: 'SYNTHETIC unlinked' })).id,
    );
    await setLinkState(unlinked.data.id, 'UNLINKED');
    const current = await getCase(w.case.data.id);
    const refusals: Array<[Record<string, unknown>[], number, string, Record<string, unknown>]> = [
      [
        [support(b.linked.data.id)],
        422,
        'CROSS_CASE_REFERENCE',
        { field: 'sources.0.caseSourceId' },
      ],
      [[support(randomUUID())], 422, 'REFERENCE_NOT_FOUND', { field: 'sources.0.caseSourceId' }],
      [
        [support(linked.data.id), support(paused.data.id)],
        409,
        'RECORD_STATE_CONFLICT',
        {
          record: 'CaseSource',
          linkState: 'PAUSED',
          operation: 'createCaseFact',
          field: 'sources.1.caseSourceId',
        },
      ],
      [
        [support(unlinked.data.id)],
        409,
        'RECORD_STATE_CONFLICT',
        {
          record: 'CaseSource',
          linkState: 'UNLINKED',
          operation: 'createCaseFact',
          field: 'sources.0.caseSourceId',
        },
      ],
    ];
    for (const [sources, status, errorCode, details] of refusals) {
      const refused = await postFact(w.case.data.id, current.etag, { sources });
      expect([...outcome(refused), detailsOf(refused)]).toEqual([status, errorCode, details]);
    }
    const duplicate = await postFact(w.case.data.id, current.etag, {
      sources: [support(linked.data.id), support(linked.data.id)],
    });
    expect([...outcome(duplicate), detailsOf(duplicate)['issues']]).toEqual([
      422,
      'VALIDATION_FAILED',
      [
        {
          path: 'sources.1.supportRole',
          message: 'Each case source supports a fact once per support role',
        },
      ],
    ]);
    // DOCUMENT_REVIEWED: at least one supporting source must itself record an attributed review.
    const notReviewed = await postFact(w.case.data.id, current.etag, {
      provenance: 'DOCUMENT_REVIEWED',
      sources: [support(linked.data.id)],
    });
    expect([...outcome(notReviewed), detailsOf(notReviewed)]).toEqual([
      422,
      'REVIEW_UNSUPPORTED',
      { field: 'provenance', reason: 'NO_REVIEWED_SOURCE' },
    ]);
    const unsupported = await postFact(w.case.data.id, current.etag, {
      provenance: 'DOCUMENT_REVIEWED',
    });
    expect(outcome(unsupported)).toEqual([422, 'REVIEW_UNSUPPORTED']);
    expect(await prisma.caseFact.count()).toBe(1);
    const reviewedSource = await createSource({
      agencyId: w.agency.data.id,
      reportedProvenance: 'DOCUMENT_REVIEWED',
      reviewedByLabel: 'SYNTHETIC Reviewer',
      reviewedAt: '2026-09-20T10:00:00Z',
    });
    const reviewedLink = await linkSource(w.case.data.id, reviewedSource.id);
    const documented = await createFact(w.case.data.id, {
      provenance: 'DOCUMENT_REVIEWED',
      sources: [support(linked.data.id), support(reviewedLink.data.id)],
    });
    expect([documented.provenance, documented.resolutionState]).toEqual([
      'DOCUMENT_REVIEWED',
      'UNASSESSED',
    ]);
    // A reviewed support upgrades nothing supplied lower and never sets a resolution state.
    for (const provenance of ['OPERATOR_REPORTED', 'MISSING', 'CONFLICT']) {
      const lower = await createFact(w.case.data.id, {
        provenance,
        sources: [support(reviewedLink.data.id)],
      });
      expect([lower.provenance, lower.resolutionState], provenance).toEqual([
        provenance,
        'UNASSESSED',
      ]);
    }
    // The cited sources and links are unchanged.
    expect((await getLink(linked.data.id)).data).toEqual(linked.data);
    expect((await client.get('getSource', `/sources/${w.source.id}`)).json).toMatchObject({
      data: { reportedProvenance: 'OPERATOR_REPORTED', revision: 1 },
    });
  });

  it('revisions: only the current head, same fact type and scope; revision + 1 superseding it; earlier revisions and their supports never change; the list shows heads, history stays readable', async () => {
    const { w, work, linked } = await intakeWorld();
    const first = await createFact(w.case.data.id, {
      factType: 'PERMISSION',
      scopeKind: 'WORK',
      caseWorkId: work.data.id,
      provenance: 'CONFLICT',
      value: { finding: 'CONFLICT', assertion: 'SYNTHETIC two reports disagree', reviewScope: '' },
      resolutionState: 'CONFLICT',
      sources: [
        {
          caseSourceId: linked.data.id,
          supportRole: 'SYNTHETIC_FIRST',
          supportedAssertion: 'SYNTHETIC first report',
        },
      ],
    });
    const firstSupports = await storedSupports(first.id);
    const before = await getCase(w.case.data.id);
    const result = await postRevision(w.case.data.id, first.id, before.etag, {
      factType: 'PERMISSION',
      scopeKind: 'WORK',
      caseWorkId: work.data.id,
      provenance: 'OPERATOR_REPORTED',
      value: {
        finding: 'NO_PERMISSION_REPORTED',
        assertion: 'SYNTHETIC the owner reports no licence',
        reviewScope: 'SYNTHETIC owner statement only',
      },
      resolutionState: 'UNASSESSED',
      changeReason: 'SYNTHETIC explicit correction by the operator',
    });
    const second = immutable<CaseFact>(result, 201);
    expect(second).toMatchObject({
      factGroupId: first.factGroupId,
      revision: 2,
      supersedesFactId: first.id,
      factType: 'PERMISSION',
      scopeKind: 'WORK',
      caseWorkId: work.data.id,
      provenance: 'OPERATOR_REPORTED',
      resolutionState: 'UNASSESSED',
      changeReason: 'SYNTHETIC explicit correction by the operator',
    });
    expect(await storedSupports(second.id)).toEqual([]);
    // The earlier revision and its supports are untouched: CONFLICT stays CONFLICT there.
    expect(await getFact(w.case.data.id, first.id)).toEqual(first);
    expect(await storedSupports(first.id)).toEqual(firstSupports);
    expect((await getCase(w.case.data.id)).data.contextRevision).toBe(
      before.data.contextRevision + 1,
    );
    // Only the head can be revised; the refusal names the head.
    const now = await getCase(w.case.data.id);
    const stale = await postRevision(w.case.data.id, first.id, now.etag, {
      scopeKind: 'WORK',
      caseWorkId: work.data.id,
    });
    expect([...outcome(stale), detailsOf(stale)]).toEqual([
      409,
      'REVISION_NOT_HEAD',
      { headId: second.id },
    ]);
    // Same fact type and scope: a different type or scope is a new fact, not a reparenting.
    const changes: Array<[Record<string, unknown>, string[]]> = [
      [{ factType: 'AV_COMPARISON', scopeKind: 'WORK', caseWorkId: work.data.id }, ['factType']],
      [{ scopeKind: 'CASE' }, ['scopeKind', 'caseWorkId']],
      [
        {
          scopeKind: 'WORK',
          caseWorkId: (await createWork(w.case.data.id, { title: 'SYNTHETIC other work' })).data.id,
        },
        ['caseWorkId'],
      ],
    ];
    for (const [body, fields] of changes) {
      const current = await getCase(w.case.data.id);
      const refused = await postRevision(w.case.data.id, second.id, current.etag, body);
      expect([...outcome(refused), detailsOf(refused)], JSON.stringify(body)).toEqual([
        422,
        'REVISION_SCOPE_CHANGE',
        { fields },
      ]);
    }
    // A third revision retracts the assertion (WITHDRAWN): a retraction, not a deletion.
    const third = await reviseFact(w.case.data.id, second.id, {
      scopeKind: 'WORK',
      caseWorkId: work.data.id,
      resolutionState: 'WITHDRAWN',
      changeReason: 'SYNTHETIC withdrawn by the operator',
    });
    expect([third.revision, third.supersedesFactId, third.resolutionState]).toEqual([
      3,
      second.id,
      'WITHDRAWN',
    ]);
    // The list shows each chain's head only; every revision stays readable by id.
    const heads = await listFacts(w.case.data.id);
    expect(heads.items.map((row) => row.id)).toEqual([third.id]);
    expect(
      (await listFacts(w.case.data.id, `?q=${first.factGroupId}`)).items.map((row) => row.id),
    ).toEqual([third.id]);
    for (const revision of [first, second, third]) {
      expect((await getFact(w.case.data.id, revision.id)).revision).toBe(revision.revision);
    }
    expect(await prisma.caseFact.count({ where: { factGroupId: first.factGroupId } })).toBe(3);
    expect((await auditRows(second.id)).map((row) => row.action)).toEqual(['CASE_FACT_REVISED']);
    // Another case's fact cannot be revised through this case (404 like an unknown fact).
    const b = await intakeWorld('B');
    const foreign = await createFact(b.w.case.data.id);
    const mine = await getCase(w.case.data.id);
    const crossCase = await postRevision(w.case.data.id, foreign.id, mine.etag, {});
    const unknown = await postRevision(w.case.data.id, randomUUID(), mine.etag, {});
    expect([crossCase.status, refusalOf(crossCase)]).toEqual([404, refusalOf(unknown)]);
    expect(await getFact(b.w.case.data.id, foreign.id)).toEqual(foreign);
  });

  it('pinning: a newer SourceReference revision re-points neither the case source link, the fact support nor the mapping basis that cites it', async () => {
    const { w, item, work, linked } = await intakeWorld();
    const basis = await createMapping(w.case.data.id, {
      caseWorkId: work.data.id,
      reportedItemId: item.data.id,
      occurrence: 2,
      provenance: 'OPERATOR_REPORTED',
      basisSourceId: w.source.id,
    });
    const fact = await createFact(w.case.data.id, {
      provenance: 'OPERATOR_REPORTED',
      sources: [
        {
          caseSourceId: linked.data.id,
          supportRole: 'SYNTHETIC_PRIMARY',
          supportedAssertion: 'SYNTHETIC supported statement',
        },
      ],
    });
    const supportsBefore = await storedSupports(fact.id);
    const newer = await reviseSource(w.source.id, {
      agencyId: w.agency.data.id,
      title: 'SYNTHETIC agency material, revision 2',
    });
    expect(newer.revision).toBe(2);
    expect(await storedSupports(fact.id)).toEqual(supportsBefore);
    expect((await getLink(linked.data.id)).data.sourceId).toBe(w.source.id);
    expect(await getFact(w.case.data.id, fact.id)).toEqual(fact);
    const pinned = await prisma.factSource.findFirstOrThrow({
      where: { factId: fact.id },
      select: { caseSource: { select: { sourceId: true } } },
    });
    expect(pinned.caseSource.sourceId).toBe(w.source.id);
    expect((await getMapping(w.case.data.id, basis.data.id)).data).toEqual(basis.data);
  });

  it('DUPLICATE_REVIEW names other existing cases only, each once; nothing of them is read into, copied or changed', async () => {
    const w = await world();
    const other = await createCase(w.agency.data.id, { intakeLabel: 'SYNTHETIC related' });
    const current = await getCase(w.case.data.id);
    const review = (relatedCaseIds: string[]) => ({
      factType: 'DUPLICATE_REVIEW',
      value: {
        finding: 'POSSIBLE_OVERLAP',
        coverageDescription: 'SYNTHETIC checked the agency case list',
        observedThrough: '2026-09-20T00:00:00Z',
        relatedCaseIds,
        reasoning: 'SYNTHETIC the same video appears in another case',
      },
      provenance: 'OPERATOR_REPORTED',
    });
    const self = await postFact(w.case.data.id, current.etag, review([w.case.data.id]));
    expect([...outcome(self), detailsOf(self)['issues']]).toEqual([
      422,
      'VALIDATION_FAILED',
      [{ path: 'value.relatedCaseIds.0', message: 'Must name another case, each once' }],
    ]);
    const twice = await postFact(
      w.case.data.id,
      current.etag,
      review([other.data.id, other.data.id]),
    );
    expect(outcome(twice)).toEqual([422, 'VALIDATION_FAILED']);
    const unknown = await postFact(w.case.data.id, current.etag, review([randomUUID()]));
    expect([...outcome(unknown), detailsOf(unknown)]).toEqual([
      422,
      'REFERENCE_NOT_FOUND',
      { field: 'value.relatedCaseIds.0' },
    ]);
    const otherBefore = await getCase(other.data.id);
    const fact = await createFact(w.case.data.id, review([other.data.id]));
    expect(fact.value).toEqual(review([other.data.id]).value);
    expect((await getCase(other.data.id)).data).toEqual(otherBefore.data);
    expect(await prisma.caseFact.count({ where: { caseId: other.data.id } })).toBe(0);
    // The related case now counts as referenced: it is no longer an unused case.
    const deleted = await client.write(
      'deleteUnusedCase',
      'DELETE',
      `/cases/${other.data.id}`,
      undefined,
      {
        ifMatch: otherBefore.etag,
      },
    );
    expect(outcome(deleted)).toEqual([409, 'REFERENCED_RECORD_CANNOT_DELETE']);
  });

  it('assertedAsOf is stored exactly as the supplied instant or refused before anything is written (R7); AUTHORITY_CURRENTNESS is a recorded assertion, never a computed currentness', async () => {
    const w = await world();
    const current = await getCase(w.case.data.id);
    for (const assertedAsOf of ['2026-09-20T24:00:00Z', '2026-09-20T10:00:00.0001Z']) {
      expect(outcome(await postFact(w.case.data.id, current.etag, { assertedAsOf }))).toEqual([
        422,
        'VALIDATION_FAILED',
      ]);
    }
    expect(await countRows(prisma, 'case_facts')).toBe(0);
    for (const [assertedAsOf, instant] of ADMITTED_SPELLINGS) {
      const spelled = await createFact(w.case.data.id, { assertedAsOf });
      expect(spelled.assertedAsOf, assertedAsOf).toBe(instant);
      expect(await columnInstant('case_facts', 'asserted_as_of', spelled.id), assertedAsOf).toBe(
        columnText(instant),
      );
    }
    const recorded = await createFact(w.case.data.id, {
      factType: 'AUTHORITY_CURRENTNESS',
      value: {
        finding: 'REPORTED_CURRENT',
        assertion: 'SYNTHETIC the agency reports its appointment continues',
        asOf: '2026-09-01T00:00:00+07:00',
        limitations: 'SYNTHETIC operator report only',
      },
      provenance: 'OPERATOR_REPORTED',
      assertedAsOf: '2026-09-01T09:30:00.25+07:00',
    });
    expect(recorded.assertedAsOf).toBe('2026-09-01T02:30:00.250Z');
    // The value keeps the supplied string; nothing re-evaluates it at any later instant.
    expect((recorded.value as { asOf: string }).asOf).toBe('2026-09-01T00:00:00+07:00');
    // Later (within the session's idle limit): nothing about the stored fact is re-evaluated.
    t.clock.advance(20 * 60 * 1000);
    expect(await getFact(w.case.data.id, recorded.id)).toEqual(recorded);
    expect((await getCase(w.case.data.id)).data.currentAuthoritySelectionId).toBeNull();
  });

  it('list and get: heads of this case only, newest first; exact type filter (unknown 400), exact-id and literal scope-text search; another case’s fact is 404 like an unknown one', async () => {
    const { w, work } = await intakeWorld();
    const a1 = await createFact(w.case.data.id, {
      factType: 'PERMISSION',
      scopeText: 'SYNTHETIC Café permission scope',
    });
    t.clock.advance(1000);
    const a2 = await createFact(w.case.data.id, {
      factType: 'WORK_IDENTIFICATION',
      scopeKind: 'WORK',
      caseWorkId: work.data.id,
    });
    const b = await intakeWorld('B');
    await createFact(b.w.case.data.id, { scopeText: 'SYNTHETIC Café permission scope' });
    expect((await listFacts(w.case.data.id)).items.map((row) => row.id)).toEqual([a2.id, a1.id]);
    expect(
      (await listFacts(w.case.data.id, '?factType=PERMISSION')).items.map((row) => row.id),
    ).toEqual([a1.id]);
    expect(
      outcome(await client.get('listCaseFacts', `/cases/${w.case.data.id}/facts?factType=G1`)),
    ).toEqual([400, 'INVALID_QUERY_PARAMETER']);
    expect((await listFacts(w.case.data.id, '?q=cafe')).items.map((row) => row.id)).toEqual([
      a1.id,
    ]);
    expect(
      (await listFacts(w.case.data.id, `?q=${work.data.id}`)).items.map((row) => row.id),
    ).toEqual([a2.id]);
    const summary = (await listFacts(w.case.data.id)).items[1];
    expect(summary).toEqual({
      id: a1.id,
      caseId: w.case.data.id,
      factGroupId: a1.factGroupId,
      revision: 1,
      supersedesFactId: null,
      factType: 'PERMISSION',
      scopeKind: 'CASE',
      caseWorkId: null,
      reportedItemId: null,
      mappingId: null,
      provenance: 'MISSING',
      resolutionState: 'UNASSESSED',
      createdAt: a1.createdAt,
    });
    const b1 = (await listFacts(b.w.case.data.id)).items[0];
    const crossCase = await readFact(w.case.data.id, b1?.id ?? '');
    const unknown = await readFact(w.case.data.id, randomUUID());
    expect([crossCase.status, refusalOf(crossCase)]).toEqual([404, refusalOf(unknown)]);
    expect(crossCase.headers['etag']).toBeUndefined();
  });
});

describe('FACT SOURCES READ-BACK (TB-SCHEMA-API-v1.2.0, R9) — the exact supports recorded for one fact revision', () => {
  /** An error body without its per-request id: equal bodies are indistinguishable refusals. */
  const refusal = (result: HttpResult) => {
    const {
      code: errorCode,
      message,
      details,
    } = (result.json as { error: { code: string; message: string; details: unknown } }).error;
    return { code: errorCode, message, details };
  };
  const FACT_SOURCE_KEYS = [
    'caseSourceId',
    'createdAt',
    'createdById',
    'factId',
    'id',
    'supportRole',
    'supportedAssertion',
  ];

  it('zero supports: an empty list naming the revision — a normal answer, not a gap, an error or MISSING; no ETag, no precondition, session only, nothing written', async () => {
    const { w } = await intakeWorld();
    const fact = await createFact(w.case.data.id, { provenance: 'OPERATOR_REPORTED' });
    const before = await suiteDump();
    const read = await readSupports(w.case.data.id, fact.id);
    const view = immutable<CaseFactSourcesView>(read, 200);
    expect(view).toEqual({ factId: fact.id, sources: [] });
    expect(affectedOf(read)).toEqual([]);
    // Read-only: sent without If-Match or Idempotency-Key, repeatable, and nothing changed — no
    // row, version, audit event or idempotency record anywhere.
    expect(await getSupports(w.case.data.id, fact.id)).toEqual(view);
    expect(await suiteDump()).toEqual(before);
    // The fact is exactly as recorded: zero supports implies nothing about it.
    expect(await getFact(w.case.data.id, fact.id)).toEqual(fact);
    expect([fact.provenance, fact.resolutionState]).toEqual(['OPERATOR_REPORTED', 'UNASSESSED']);
    // Session-protected like every business read.
    const anonymous = await http(
      t.port,
      'GET',
      `/api/v1/cases/${w.case.data.id}/facts/${fact.id}/sources`,
    );
    expect([anonymous.status, code(anonymous)]).toEqual([401, 'SESSION_REQUIRED']);
  });

  it('one support reads back exactly the stored row; several read back byte for byte — role and assertion as entered — in (createdAt, id) order, the same on every read', async () => {
    const { w, linked } = await intakeWorld();
    const second = await linkSource(
      w.case.data.id,
      (await createSource({ agencyId: w.agency.data.id, title: 'SYNTHETIC second material' })).id,
    );
    // One support.
    const oneResult = await postFact(w.case.data.id, (await getCase(w.case.data.id)).etag, {
      provenance: 'OPERATOR_REPORTED',
      sources: [
        {
          caseSourceId: linked.data.id,
          supportRole: 'SYNTHETIC_PRIMARY',
          supportedAssertion: 'SYNTHETIC the material states this',
        },
      ],
    });
    const one = immutable<CaseFact>(oneResult, 201);
    const [createdSupport] = affectedOf(oneResult).filter((row) => row['type'] === 'FactSource');
    expect(await getSupports(w.case.data.id, one.id)).toEqual({
      factId: one.id,
      sources: [
        {
          id: createdSupport?.['id'],
          factId: one.id,
          caseSourceId: linked.data.id,
          supportRole: 'SYNTHETIC_PRIMARY',
          supportedAssertion: 'SYNTHETIC the material states this',
          createdAt: one.createdAt,
          createdById: client.session.userId,
        },
      ],
    });
    // Several supports: roles and assertions exactly as entered — spaces, case, line breaks,
    // tabs, quotes, both Unicode normal forms and 8000 code points (the contract maximum).
    const prefix = 'SYNTHETIC-LONG ';
    const entered = [
      {
        caseSourceId: linked.data.id,
        supportRole: '  synthetic role with spaces — Café  ',
        supportedAssertion: '  SYNTHETIC leading and trailing spaces  ',
      },
      {
        caseSourceId: linked.data.id,
        supportRole: 'SYNTHETIC_CONTEXT',
        supportedAssertion:
          'SYNTHETIC line one\r\nline two\ttab — “quotes” \\ {"json": true} café / café',
      },
      {
        caseSourceId: second.data.id,
        supportRole: 'SYNTHETIC_PRIMARY',
        supportedAssertion: `${prefix}${'𝄞'.repeat(8000 - codePoints(prefix))}`,
      },
    ];
    expect(codePoints(entered[2]?.supportedAssertion ?? '')).toBe(8000);
    const many = await createFact(w.case.data.id, {
      provenance: 'OPERATOR_REPORTED',
      sources: entered,
    });
    const view = await getSupports(w.case.data.id, many.id);
    expect(view.factId).toBe(many.id);
    expect(view.sources).toHaveLength(3);
    expect(view.sources).toEqual(await storedRows(many.id));
    for (const row of view.sources) {
      expect(Object.keys(row).sort()).toEqual(FACT_SOURCE_KEYS);
      expect(row).toMatchObject({
        factId: many.id,
        createdAt: many.createdAt,
        createdById: client.session.userId,
      });
    }
    const asEntered = (rows: ReadonlyArray<Record<string, unknown>>) =>
      rows
        .map((row) =>
          JSON.stringify([row['caseSourceId'], row['supportRole'], row['supportedAssertion']]),
        )
        .sort();
    expect(asEntered(view.sources)).toEqual(asEntered(entered));
    // Deterministic: one revision's rows share their createdAt, so the order is by id — never the
    // request's order or a role order — and every read returns the same rows in the same order.
    const ids = view.sources.map((row) => row.id);
    expect(ids).toEqual([...ids].sort());
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(await getSupports(w.case.data.id, many.id)).toEqual(view);
    }
  });

  it('revisions keep their own supports: the earlier revision still reads its rows, a newer one only its own (other or none); nothing is merged or carried over', async () => {
    const { w, linked } = await intakeWorld();
    const second = await linkSource(
      w.case.data.id,
      (await createSource({ agencyId: w.agency.data.id, title: 'SYNTHETIC second material' })).id,
    );
    const first = await createFact(w.case.data.id, {
      provenance: 'OPERATOR_REPORTED',
      sources: [
        {
          caseSourceId: linked.data.id,
          supportRole: 'SYNTHETIC_R1_PRIMARY',
          supportedAssertion: 'SYNTHETIC revision 1, first support',
        },
        {
          caseSourceId: second.data.id,
          supportRole: 'SYNTHETIC_R1_CONTEXT',
          supportedAssertion: 'SYNTHETIC revision 1, second support',
        },
      ],
    });
    const firstView = await getSupports(w.case.data.id, first.id);
    expect(firstView.sources.map((row) => row.supportRole).sort()).toEqual([
      'SYNTHETIC_R1_CONTEXT',
      'SYNTHETIC_R1_PRIMARY',
    ]);
    const revised = await reviseFact(w.case.data.id, first.id, {
      provenance: 'OPERATOR_REPORTED',
      changeReason: 'SYNTHETIC revision 2 with other supports',
      sources: [
        {
          caseSourceId: second.data.id,
          supportRole: 'SYNTHETIC_R2_PRIMARY',
          supportedAssertion: 'SYNTHETIC revision 2, its only support',
        },
      ],
    });
    const third = await reviseFact(w.case.data.id, revised.id, {
      provenance: 'OPERATOR_REPORTED',
      changeReason: 'SYNTHETIC revision 3 without supports',
    });
    // The earlier revision reads exactly what it read before; each later revision only its own.
    expect(await getSupports(w.case.data.id, first.id)).toEqual(firstView);
    const secondView = await getSupports(w.case.data.id, revised.id);
    expect(
      secondView.sources.map((row) => [row.factId, row.caseSourceId, row.supportRole]),
    ).toEqual([[revised.id, second.data.id, 'SYNTHETIC_R2_PRIMARY']]);
    expect(await getSupports(w.case.data.id, third.id)).toEqual({ factId: third.id, sources: [] });
    const allIds = [firstView, secondView].flatMap((view) => view.sources.map((row) => row.id));
    expect(new Set(allIds).size).toBe(3);
    expect(await prisma.factSource.count()).toBe(3);
  });

  it('historical pinning: a newer source revision, a paused link and an unlinked link change nothing in the recorded supports and hide none of them; the link’s present state is its own record', async () => {
    const { w, linked } = await intakeWorld();
    const secondSource = await createSource({
      agencyId: w.agency.data.id,
      title: 'SYNTHETIC second material',
    });
    const second = await linkSource(w.case.data.id, secondSource.id);
    const fact = await createFact(w.case.data.id, {
      provenance: 'OPERATOR_REPORTED',
      sources: [
        {
          caseSourceId: linked.data.id,
          supportRole: 'SYNTHETIC_PRIMARY',
          supportedAssertion: 'SYNTHETIC supported by revision 1 of the agency material',
        },
        {
          caseSourceId: second.data.id,
          supportRole: 'SYNTHETIC_CONTEXT',
          supportedAssertion: 'SYNTHETIC supported by the second material',
        },
      ],
    });
    const before = await readSupports(w.case.data.id, fact.id);
    const pinned = immutable<CaseFactSourcesView>(before, 200);
    const unchanged = async () => {
      const after = await readSupports(w.case.data.id, fact.id);
      expect(JSON.stringify(dataOf(after))).toBe(JSON.stringify(dataOf(before)));
    };
    // A newer revision of the cited source re-points neither the link nor the support.
    const newer = await reviseSource(w.source.id, {
      agencyId: w.agency.data.id,
      title: 'SYNTHETIC agency material, revision 2',
    });
    expect([newer.revision, newer.supersedesSourceId]).toEqual([2, w.source.id]);
    await unchanged();
    expect((await getLink(linked.data.id)).data.sourceId).toBe(w.source.id);
    // Pausing and unlinking later are states of the link, not of the historical support.
    await setLinkState(linked.data.id, 'PAUSED');
    await unchanged();
    await setLinkState(second.data.id, 'UNLINKED');
    await unchanged();
    await setLinkState(linked.data.id, 'UNLINKED');
    await unchanged();
    expect((await getLink(linked.data.id)).data).toMatchObject({
      linkState: 'UNLINKED',
      sourceId: w.source.id,
    });
    expect((await getLink(second.data.id)).data.linkState).toBe('UNLINKED');
    expect(pinned.sources.map((row) => row.caseSourceId).sort()).toEqual(
      [linked.data.id, second.data.id].sort(),
    );
    // A new revision cannot cite the unlinked links; the recorded supports stay as they were.
    const refused = await postRevision(
      w.case.data.id,
      fact.id,
      (await getCase(w.case.data.id)).etag,
      {
        provenance: 'OPERATOR_REPORTED',
        sources: [
          {
            caseSourceId: linked.data.id,
            supportRole: 'SYNTHETIC_PRIMARY',
            supportedAssertion: 'SYNTHETIC again',
          },
        ],
      },
    );
    expect(outcome(refused)).toEqual([409, 'RECORD_STATE_CONFLICT']);
    await unchanged();
    expect(await getFact(w.case.data.id, fact.id)).toEqual(fact);
  });

  it('case isolation: another case’s fact is 404 through this case, exactly like an unknown fact or case; no existence, count, link id or assertion crosses', async () => {
    const { w, linked } = await intakeWorld();
    const caseB = await createCase(w.agency.data.id, {
      routeId: w.route.data.id,
      intakeLabel: 'SYNTHETIC B intake',
    });
    const linkB = await linkSource(caseB.data.id, w.source.id);
    const factA = await createFact(w.case.data.id, {
      provenance: 'OPERATOR_REPORTED',
      sources: [
        {
          caseSourceId: linked.data.id,
          supportRole: 'SYNTHETIC_A_ROLE',
          supportedAssertion: 'SYNTHETIC-A-ONLY assertion',
        },
      ],
    });
    const factB = await createFact(caseB.data.id, {
      provenance: 'OPERATOR_REPORTED',
      sources: [
        {
          caseSourceId: linkB.data.id,
          supportRole: 'SYNTHETIC_B_ROLE',
          supportedAssertion: 'SYNTHETIC-B-ONLY assertion',
        },
      ],
    });
    const other = await intakeWorld('Other');
    const factC = await createFact(other.w.case.data.id, {
      provenance: 'OPERATOR_REPORTED',
      sources: [
        {
          caseSourceId: other.linked.data.id,
          supportRole: 'SYNTHETIC_C_ROLE',
          supportedAssertion: 'SYNTHETIC-C-ONLY assertion',
        },
      ],
    });
    const unknown = refusal(await readSupports(w.case.data.id, randomUUID()));
    expect(unknown).toEqual({
      code: 'NOT_FOUND',
      message: 'The requested resource does not exist.',
      details: {},
    });
    for (const [caseId, id] of [
      [caseB.data.id, factA.id],
      [w.case.data.id, factB.id],
      [w.case.data.id, factC.id],
      [other.w.case.data.id, factA.id],
      [randomUUID(), factA.id],
      [w.case.data.id, w.case.data.id],
      [w.case.data.id, linked.data.id],
      [w.case.data.id, 'not-a-fact-id'],
    ] as const) {
      const refused = await readSupports(caseId, id);
      expect(refused.status, `${caseId} ${id}`).toBe(404);
      expect(refusal(refused), `${caseId} ${id}`).toEqual(unknown);
      for (const secret of [
        'SYNTHETIC-A-ONLY',
        'SYNTHETIC-B-ONLY',
        'SYNTHETIC-C-ONLY',
        linked.data.id,
        linkB.data.id,
        other.linked.data.id,
      ]) {
        expect(refused.text, `${caseId} ${id}`).not.toContain(secret);
      }
    }
    // Each case reads its own fact's rows only.
    const viewA = await getSupports(w.case.data.id, factA.id);
    const viewB = await getSupports(caseB.data.id, factB.id);
    expect(viewA.sources.map((row) => [row.caseSourceId, row.supportedAssertion])).toEqual([
      [linked.data.id, 'SYNTHETIC-A-ONLY assertion'],
    ]);
    expect(viewB.sources.map((row) => [row.caseSourceId, row.supportedAssertion])).toEqual([
      [linkB.data.id, 'SYNTHETIC-B-ONLY assertion'],
    ]);
    expect(JSON.stringify(viewB)).not.toContain(factA.id);
    expect(JSON.stringify(viewA)).not.toContain(linkB.data.id);
  });

  it('read only and neutral: the fact keeps its provenance and resolution state as recorded — a reviewed support upgrades nothing; nothing is written; getCaseFact is unchanged (no support list)', async () => {
    const { w, linked } = await intakeWorld();
    const reviewedSource = await createSource({
      agencyId: w.agency.data.id,
      reportedProvenance: 'DOCUMENT_REVIEWED',
      reviewedByLabel: 'SYNTHETIC Reviewer',
      reviewedAt: '2026-09-20T10:00:00Z',
    });
    const reviewedLink = await linkSource(w.case.data.id, reviewedSource.id);
    const supports = [
      {
        caseSourceId: reviewedLink.data.id,
        supportRole: 'SYNTHETIC_REVIEWED',
        supportedAssertion: 'SYNTHETIC a reviewed source is cited',
      },
      {
        caseSourceId: linked.data.id,
        supportRole: 'SYNTHETIC_PRIMARY',
        supportedAssertion: 'SYNTHETIC an operator-reported source is cited',
      },
    ];
    const facts = [];
    for (const [provenance, resolutionState] of [
      ['OPERATOR_REPORTED', 'UNASSESSED'],
      ['MISSING', 'UNASSESSED'],
      ['CONFLICT', 'CONFLICT'],
      ['ANALYSIS', 'WITHDRAWN'],
    ] as const) {
      facts.push(
        await createFact(w.case.data.id, { provenance, resolutionState, sources: supports }),
      );
    }
    const before = await suiteDump();
    const caseBefore = await getCase(w.case.data.id);
    for (const fact of facts) {
      const view = await getSupports(w.case.data.id, fact.id);
      expect(Object.keys(view).sort()).toEqual(['factId', 'sources']);
      expect(view.sources).toHaveLength(2);
      // The rows carry no provenance, resolution, link state or review field of their own.
      for (const row of view.sources) expect(Object.keys(row).sort()).toEqual(FACT_SOURCE_KEYS);
    }
    for (const fact of facts) {
      const read = await readFact(w.case.data.id, fact.id);
      expect(read.status).toBe(200);
      // getCaseFact is exactly the v1.0.0/v1.1.0 response: the CaseFact row, strict, no supports.
      expect(GetCaseFactResponseSchema.safeParse(read.json).success).toBe(true);
      expect(Object.keys(dataOf<CaseFact>(read))).not.toContain('sources');
      expect(dataOf<CaseFact>(read)).toEqual(fact);
    }
    expect(facts.map((fact) => [fact.provenance, fact.resolutionState])).toEqual([
      ['OPERATOR_REPORTED', 'UNASSESSED'],
      ['MISSING', 'UNASSESSED'],
      ['CONFLICT', 'CONFLICT'],
      ['ANALYSIS', 'WITHDRAWN'],
    ]);
    // Nothing written by any read: no row, version, context revision, audit event or claim.
    expect(await suiteDump()).toEqual(before);
    expect((await getCase(w.case.data.id)).data).toEqual(caseBefore.data);
  });

  it('a stored support that names another case’s link, or more rows than a revision can hold, is never shown: 500, nothing leaks', async () => {
    const { w, linked } = await intakeWorld();
    const b = await intakeWorld('B');
    const fact = await createFact(w.case.data.id, { provenance: 'OPERATOR_REPORTED' });
    // Not reachable through the API (the write checks the link's case, INVARIANTS §3; a revision
    // takes at most 100 supports): direct inserts.
    await prisma.factSource.create({
      data: {
        id: randomUUID(),
        factId: fact.id,
        caseSourceId: b.linked.data.id,
        supportRole: 'SYNTHETIC_FOREIGN',
        supportedAssertion: 'SYNTHETIC-FOREIGN-ONLY assertion',
        createdAt: new Date(t.clock.ms),
        createdById: client.session.userId,
      },
    });
    const foreign = await readSupports(w.case.data.id, fact.id);
    expect(outcome(foreign)).toEqual([500, 'INTERNAL_ERROR']);
    expect(foreign.text).not.toContain(b.linked.data.id);
    expect(foreign.text).not.toContain('SYNTHETIC-FOREIGN-ONLY');
    const crowded = await createFact(w.case.data.id, { provenance: 'OPERATOR_REPORTED' });
    await prisma.factSource.createMany({
      data: Array.from({ length: 101 }, (_, index) => ({
        id: randomUUID(),
        factId: crowded.id,
        caseSourceId: linked.data.id,
        supportRole: `SYNTHETIC_${index}`,
        supportedAssertion: 'SYNTHETIC',
        createdAt: new Date(t.clock.ms),
        createdById: client.session.userId,
      })),
    });
    expect(outcome(await readSupports(w.case.data.id, crowded.id))).toEqual([
      500,
      'INTERNAL_ERROR',
    ]);
  });
});

describe('CONTEXT REVISION — material intake changes move the case context; reads and no-ops do not', () => {
  it('each material create, edit, archive, restore and revision moves the case’s version and context revision exactly once; reads, no-ops and a work’s notes do not', async () => {
    const { w, item, work, mapping } = await intakeWorld();
    const revision = async () => {
      const current = await getCase(w.case.data.id);
      return [current.data.rowVersion, current.data.contextRevision];
    };
    let [version, context] = await revision();
    const expectMoved = async (label: string, moved: boolean) => {
      const [nextVersion, nextContext] = await revision();
      expect([nextVersion, nextContext], label).toEqual(
        moved ? [(version ?? 0) + 1, (context ?? 0) + 1] : [version, context],
      );
      [version, context] = [nextVersion, nextContext];
    };
    // Reads never move anything.
    await listOf('listCaseReportedItems', `/cases/${w.case.data.id}/reported-items`);
    await listOf('listCaseCaseWorks', `/cases/${w.case.data.id}/works`);
    await listOf('listCaseUseMappings', `/cases/${w.case.data.id}/mappings`);
    await listFacts(w.case.data.id);
    await getItem(w.case.data.id, item.data.id);
    await expectMoved('reads', false);
    const itemNow = await getItem(w.case.data.id, item.data.id);
    versioned(
      await patchItem(w.case.data.id, item.data.id, itemNow.etag, { displayTitle: 'SYNTHETIC y' }),
      200,
    );
    await expectMoved('patchReportedItem', true);
    const itemAgain = await getItem(w.case.data.id, item.data.id);
    versioned(
      await patchItem(w.case.data.id, item.data.id, itemAgain.etag, {
        displayTitle: 'SYNTHETIC y',
      }),
      200,
    );
    await expectMoved('patchReportedItem no-op', false);
    versioned(
      await patchWork(w.case.data.id, work.data.id, work.etag, { notes: 'SYNTHETIC note' }),
      200,
    );
    await expectMoved('patchCaseWork notes only', false);
    const workNow = await getWork(w.case.data.id, work.data.id);
    versioned(
      await patchWork(w.case.data.id, work.data.id, workNow.etag, { workType: 'SYNTHETIC type' }),
      200,
    );
    await expectMoved('patchCaseWork identification', true);
    versioned(
      await patchMapping(w.case.data.id, mapping.data.id, mapping.etag, {
        limitations: 'SYNTHETIC limitation',
      }),
      200,
    );
    await expectMoved('patchUseMapping', true);
    const mappingNow = await getMapping(w.case.data.id, mapping.data.id);
    const archived = versioned<UseMapping>(
      await childCommand('mappings', 'archive', w.case.data.id, mapping.data.id, mappingNow.etag),
      200,
    );
    await expectMoved('archiveUseMapping', true);
    versioned(
      await childCommand('mappings', 'restore', w.case.data.id, mapping.data.id, archived.etag),
      200,
    );
    await expectMoved('restoreUseMapping', true);
    const fact = await createFact(w.case.data.id);
    await expectMoved('createCaseFact', true);
    await reviseFact(w.case.data.id, fact.id, { changeReason: 'SYNTHETIC revision' });
    await expectMoved('reviseCaseFact', true);
    // A refused write moves nothing.
    const current = await getCase(w.case.data.id);
    expect(outcome(await postFact(w.case.data.id, current.etag, { scopeKind: 'WORK' }))).toEqual([
      422,
      'FACT_SCOPE_INVALID',
    ]);
    await expectMoved('refused', false);
  });
});

describe('CONTAMINATION — nothing crosses from one case to another', () => {
  it('two cases on one agency and route with the same video and work title: separate records; each child is reachable only through its own case; nothing of one case can be used or changed through the other', async () => {
    const w = await world();
    const caseB = await createCase(w.agency.data.id, {
      routeId: w.route.data.id,
      intakeLabel: 'SYNTHETIC intake B',
    });
    const a = w.case.data.id;
    const b = caseB.data.id;
    const itemA = await createItem(a);
    const itemB = await createItem(b);
    const workA = await createWork(a, { title: 'SYNTHETIC Shared Title' });
    const workB = await createWork(b, { title: 'SYNTHETIC Shared Title' });
    const mappingA = await createMapping(a, {
      caseWorkId: workA.data.id,
      reportedItemId: itemA.data.id,
    });
    const linkA = await linkSource(a, w.source.id);
    const factA = await createFact(a, {
      factType: 'PERMISSION',
      scopeKind: 'WORK',
      caseWorkId: workA.data.id,
      provenance: 'OPERATOR_REPORTED',
      value: { finding: 'NO_PERMISSION_REPORTED', assertion: 'SYNTHETIC', reviewScope: '' },
      sources: [
        {
          caseSourceId: linkA.data.id,
          supportRole: 'SYNTHETIC_PRIMARY',
          supportedAssertion: 'SYNTHETIC A only',
        },
      ],
    });
    const bBefore = await intakeDump();
    // Reads through the other case are 404, exactly like unknown records.
    const reads: Array<[HttpResult, HttpResult]> = [
      [await readItem(b, itemA.data.id), await readItem(b, randomUUID())],
      [await readWork(b, workA.data.id), await readWork(b, randomUUID())],
      [await readMapping(b, mappingA.data.id), await readMapping(b, randomUUID())],
      [await readFact(b, factA.id), await readFact(b, randomUUID())],
    ];
    for (const [crossCase, unknown] of reads) {
      expect([crossCase.status, refusalOf(crossCase)]).toEqual([404, refusalOf(unknown)]);
    }
    // Writes through the other case are 404 before any precondition, and change nothing.
    const caseBNow = await getCase(b);
    const writes: HttpResult[] = [
      await patchItem(b, itemA.data.id, `"ReportedItem:${itemA.data.id}:v1"`, {
        displayTitle: 'x',
      }),
      await patchWork(b, workA.data.id, workA.etag, { title: 'x' }),
      await patchMapping(b, mappingA.data.id, mappingA.etag, { limitations: 'x' }),
      await childCommand('reported-items', 'archive', b, itemA.data.id, itemA.etag),
      await childCommand('works', 'archive', b, workA.data.id, workA.etag),
      await childCommand('mappings', 'archive', b, mappingA.data.id, mappingA.etag),
      await postRevision(b, factA.id, caseBNow.etag, {}),
    ];
    for (const result of writes) expect(outcome(result)).toEqual([404, 'NOT_FOUND']);
    // Case B cannot use case A's work, item, mapping or source link.
    const uses: Array<[HttpResult, string]> = [
      [
        await postMapping(b, caseBNow.etag, {
          caseWorkId: workA.data.id,
          reportedItemId: itemB.data.id,
        }),
        'caseWorkId',
      ],
      [
        await postMapping(b, caseBNow.etag, {
          caseWorkId: workB.data.id,
          reportedItemId: itemA.data.id,
        }),
        'reportedItemId',
      ],
      [
        await postFact(b, caseBNow.etag, { scopeKind: 'WORK', caseWorkId: workA.data.id }),
        'caseWorkId',
      ],
      [
        await postFact(b, caseBNow.etag, {
          scopeKind: 'REPORTED_ITEM',
          reportedItemId: itemA.data.id,
        }),
        'reportedItemId',
      ],
      [
        await postFact(b, caseBNow.etag, { scopeKind: 'USE', mappingId: mappingA.data.id }),
        'mappingId',
      ],
      [
        await postFact(b, caseBNow.etag, {
          sources: [
            {
              caseSourceId: linkA.data.id,
              supportRole: 'SYNTHETIC_PRIMARY',
              supportedAssertion: 'SYNTHETIC',
            },
          ],
        }),
        'sources.0.caseSourceId',
      ],
    ];
    for (const [result, field] of uses) {
      expect([...outcome(result), detailsOf(result)], field).toEqual([
        422,
        'CROSS_CASE_REFERENCE',
        { field },
      ]);
    }
    expect(await intakeDump()).toEqual(bBefore);
    // Nothing of A appears in B's lists; B's same-titled work and same video are B's own.
    expect(
      (await listOf<ReportedItem>('listCaseReportedItems', `/cases/${b}/reported-items`)).items.map(
        (row) => row.id,
      ),
    ).toEqual([itemB.data.id]);
    expect(
      (await listOf<CaseWork>('listCaseCaseWorks', `/cases/${b}/works`)).items.map((row) => row.id),
    ).toEqual([workB.data.id]);
    expect((await listOf<UseMapping>('listCaseUseMappings', `/cases/${b}/mappings`)).items).toEqual(
      [],
    );
    expect((await listFacts(b)).items).toEqual([]);
    // Archiving and revising in A changes nothing in B.
    const bSnapshot = {
      item: (await getItem(b, itemB.data.id)).data,
      work: (await getWork(b, workB.data.id)).data,
    };
    const itemANow = await getItem(a, itemA.data.id);
    versioned(
      await childCommand('reported-items', 'archive', a, itemA.data.id, itemANow.etag),
      200,
    );
    await reviseFact(a, factA.id, {
      factType: 'PERMISSION',
      scopeKind: 'WORK',
      caseWorkId: workA.data.id,
      provenance: 'CONFLICT',
      value: { finding: 'CONFLICT', assertion: 'SYNTHETIC', reviewScope: '' },
    });
    expect((await getItem(b, itemB.data.id)).data).toEqual(bSnapshot.item);
    expect((await getWork(b, workB.data.id)).data).toEqual(bSnapshot.work);
    expect(await prisma.caseFact.count({ where: { caseId: b } })).toBe(0);
    expect(await prisma.factSource.count({ where: { caseSource: { caseId: b } } })).toBe(0);
  });

  it('a route correction re-checks the basis sources of the case’s mappings like every other source it relies on', async () => {
    const agency = await createAgency('R');
    const ownerX = await createOwner('R-X');
    const subjectX = await createSubject('R-LX');
    const assocX = await link(ownerX.data.id, subjectX.data.id);
    const routeX = await createRoute({ agencyId: agency.data.id, ownerSubjectId: assocX.data.id });
    const ownerY = await createOwner('R-Y');
    const subjectY = await createSubject('R-LY');
    const assocY = await link(ownerY.data.id, subjectY.data.id);
    const routeY = await createRoute({ agencyId: agency.data.id, ownerSubjectId: assocY.data.id });
    const created = await createCase(agency.data.id, { routeId: routeX.data.id });
    const subjectSource = await createSource({
      agencyId: agency.data.id,
      scopeBindings: { caseIds: [], legalSubjectIds: [subjectX.data.id], agencyIds: [] },
    });
    const item = await createItem(created.data.id);
    const work = await createWork(created.data.id);
    await createMapping(created.data.id, {
      caseWorkId: work.data.id,
      reportedItemId: item.data.id,
      basisSourceId: subjectSource.id,
      provenance: 'OPERATOR_REPORTED',
    });
    const current = await getCase(created.data.id);
    const refused = await bindRoute(created.data.id, current.etag, routeY.data.id);
    expect(outcome(refused)).toEqual([422, 'SOURCE_SCOPE_UNRESOLVED']);
    expect(detailsOf(refused)).toMatchObject({ field: 'routeId', sourceId: subjectSource.id });
    expect((await getCase(created.data.id)).data.routeId).toBe(routeX.data.id);
  });
});

describe('SHARED WRITE LAYER — If-Match, Idempotency-Key, atomic audit', () => {
  /** The 14 P4B writes, each with a valid request and its contract precondition target. */
  async function intakeWrites() {
    const { w, item, work, mapping, linked } = await intakeWorld();
    const archivedItem = await createItem(w.case.data.id, { rawUrl: itemUrl('Archived_It') });
    const archivedWork = await createWork(w.case.data.id, { title: 'SYNTHETIC archived work' });
    const archivedMapping = await createMapping(w.case.data.id, {
      caseWorkId: work.data.id,
      reportedItemId: item.data.id,
      occurrence: 2,
    });
    const archived = {
      item: versioned<ReportedItem>(
        await childCommand(
          'reported-items',
          'archive',
          w.case.data.id,
          archivedItem.data.id,
          archivedItem.etag,
        ),
        200,
      ),
      work: versioned<CaseWork>(
        await childCommand(
          'works',
          'archive',
          w.case.data.id,
          archivedWork.data.id,
          archivedWork.etag,
        ),
        200,
      ),
      mapping: versioned<UseMapping>(
        await childCommand(
          'mappings',
          'archive',
          w.case.data.id,
          archivedMapping.data.id,
          archivedMapping.etag,
        ),
        200,
      ),
    };
    const fact = await createFact(w.case.data.id);
    const c = w.case.data.id;
    const writes: Array<{
      operationId: string;
      method: 'POST' | 'PATCH';
      path: string;
      body: Record<string, unknown>;
      target: string;
    }> = [
      {
        operationId: 'createReportedItem',
        method: 'POST',
        path: `/cases/${c}/reported-items`,
        body: { rawUrl: itemUrl('New_Item_01') },
        target: `CaseRecord:${c}`,
      },
      {
        operationId: 'patchReportedItem',
        method: 'PATCH',
        path: `/cases/${c}/reported-items/${item.data.id}`,
        body: { displayTitle: 'SYNTHETIC z' },
        target: `ReportedItem:${item.data.id}`,
      },
      {
        operationId: 'archiveReportedItem',
        method: 'POST',
        path: `/cases/${c}/reported-items/${item.data.id}/archive`,
        body: { reason: 'x' },
        target: `ReportedItem:${item.data.id}`,
      },
      {
        operationId: 'restoreReportedItem',
        method: 'POST',
        path: `/cases/${c}/reported-items/${archivedItem.data.id}/restore`,
        body: { reason: 'x' },
        target: `ReportedItem:${archivedItem.data.id}`,
      },
      {
        operationId: 'createCaseWork',
        method: 'POST',
        path: `/cases/${c}/works`,
        body: { title: 'SYNTHETIC new work' },
        target: `CaseRecord:${c}`,
      },
      {
        operationId: 'patchCaseWork',
        method: 'PATCH',
        path: `/cases/${c}/works/${work.data.id}`,
        body: { title: 'SYNTHETIC z' },
        target: `CaseWork:${work.data.id}`,
      },
      {
        operationId: 'archiveCaseWork',
        method: 'POST',
        path: `/cases/${c}/works/${work.data.id}/archive`,
        body: { reason: 'x' },
        target: `CaseWork:${work.data.id}`,
      },
      {
        operationId: 'restoreCaseWork',
        method: 'POST',
        path: `/cases/${c}/works/${archivedWork.data.id}/restore`,
        body: { reason: 'x' },
        target: `CaseWork:${archivedWork.data.id}`,
      },
      {
        operationId: 'createUseMapping',
        method: 'POST',
        path: `/cases/${c}/mappings`,
        body: { caseWorkId: work.data.id, reportedItemId: item.data.id, occurrence: 3 },
        target: `CaseRecord:${c}`,
      },
      {
        operationId: 'patchUseMapping',
        method: 'PATCH',
        path: `/cases/${c}/mappings/${mapping.data.id}`,
        body: { limitations: 'SYNTHETIC z' },
        target: `UseMapping:${mapping.data.id}`,
      },
      {
        operationId: 'archiveUseMapping',
        method: 'POST',
        path: `/cases/${c}/mappings/${mapping.data.id}/archive`,
        body: { reason: 'x' },
        target: `UseMapping:${mapping.data.id}`,
      },
      {
        operationId: 'restoreUseMapping',
        method: 'POST',
        path: `/cases/${c}/mappings/${archivedMapping.data.id}/restore`,
        body: { reason: 'x' },
        target: `UseMapping:${archivedMapping.data.id}`,
      },
      {
        operationId: 'createCaseFact',
        method: 'POST',
        path: `/cases/${c}/facts`,
        body: factBody({ scopeText: 'SYNTHETIC new fact' }),
        target: `CaseRecord:${c}`,
      },
      {
        operationId: 'reviseCaseFact',
        method: 'POST',
        path: `/cases/${c}/facts/${fact.id}/revisions`,
        body: factBody({ changeReason: 'SYNTHETIC revision' }),
        target: `CaseRecord:${c}`,
      },
    ];
    return { w, item, work, mapping, linked, fact, archived, writes };
  }

  /** The current strong ETag of a precondition target `Type:id` under the case `caseId`. */
  async function etagFor(target: string, caseId: string): Promise<string> {
    const [type, id] = target.split(':') as [string, string];
    const read: Record<string, () => Promise<HttpResult>> = {
      CaseRecord: () => client.get('getCase', `/cases/${id}`),
      ReportedItem: () => readItem(caseId, id),
      CaseWork: () => readWork(caseId, id),
      UseMapping: () => readMapping(caseId, id),
    };
    return etagOf(await (read[type] as () => Promise<HttpResult>)());
  }

  it('every conditional P4B write: 428 without If-Match, 412 for a stale, foreign or parent/child ETag; nothing is written; with the current ETag it succeeds', async () => {
    const { w, writes } = await intakeWrites();
    const contracted = operations
      .filter(
        (operation) =>
          (P4B_OPERATIONS as readonly string[]).includes(operation.operationId) &&
          operation.preconditionTarget,
      )
      .map((operation) => [operation.operationId, operation.preconditionTarget]);
    expect(contracted).toHaveLength(14);
    // Every contracted conditional P4B write is exercised, each with its declared target.
    expect(writes.map((write) => write.operationId).sort()).toEqual(
      contracted.map(([operationId]) => operationId).sort(),
    );
    for (const write of writes) {
      const [type] = write.target.split(':');
      expect(contracted).toContainEqual([write.operationId, type]);
    }
    const dump = await intakeDump();
    const foreignCase = (await createCase(w.agency.data.id, { intakeLabel: 'SYNTHETIC foreign' }))
      .etag;
    const dumpWithForeign = await intakeDump();
    for (const write of writes) {
      const label = write.operationId;
      const missing = await client.write(label, write.method, write.path, write.body);
      expect(outcome(missing), label).toEqual([428, 'PRECONDITION_REQUIRED']);
      const current = await etagFor(write.target, w.case.data.id);
      const stale = current.replace(
        /:v(\d+)"$/,
        (_match, version: string) => `:v${Number(version) + 7}"`,
      );
      for (const ifMatch of [stale, foreignCase, `W/${current}`]) {
        const result = await client.write(label, write.method, write.path, write.body, { ifMatch });
        expect(outcome(result), `${label} ${ifMatch}`).toEqual([412, 'RECORD_VERSION_CONFLICT']);
      }
      if (write.target.startsWith('CaseRecord')) {
        // A child's ETag is not the case's precondition.
        const childEtag = etagOf(
          await readItem(w.case.data.id, writes[1]?.path.split('/')[4] ?? ''),
        );
        expect(
          outcome(
            await client.write(label, write.method, write.path, write.body, { ifMatch: childEtag }),
          ),
          label,
        ).toEqual([412, 'RECORD_VERSION_CONFLICT']);
      } else {
        // The case's ETag is not a child's precondition.
        const caseEtag = await etagFor(`CaseRecord:${w.case.data.id}`, w.case.data.id);
        expect(
          outcome(
            await client.write(label, write.method, write.path, write.body, { ifMatch: caseEtag }),
          ),
          label,
        ).toEqual([412, 'RECORD_VERSION_CONFLICT']);
      }
    }
    expect(await intakeDump()).toEqual(dumpWithForeign);
    expect(dumpWithForeign['reported_items']).toEqual(dump['reported_items']);
    // With the current ETag each succeeds (later writes read their ETag afresh; archives last, so
    // no write needs a record another write archived).
    const archives = writes.filter((write) => write.path.endsWith('/archive'));
    for (const write of [...writes.filter((write) => !archives.includes(write)), ...archives]) {
      const ifMatch = await etagFor(write.target, w.case.data.id);
      const result = await client.write(write.operationId, write.method, write.path, write.body, {
        ifMatch,
      });
      expect(result.status, `${write.operationId} ${result.text}`).toBe(
        write.method === 'POST' &&
          !write.path.endsWith('archive') &&
          !write.path.endsWith('restore')
          ? 201
          : 200,
      );
    }
  });

  it('Idempotency-Key for every P4B write family: required; an exact replay returns the stored result once; the same key with another body is 409; a refused request is never stored', async () => {
    const { w, item, work, mapping, linked } = await intakeWorld();
    const c = w.case.data.id;
    // Required.
    const caseNow = await getCase(c);
    expect(
      outcome(await postItem(c, caseNow.etag, { rawUrl: itemUrl('No_Key_0001') }, { key: null })),
    ).toEqual([400, 'IDEMPOTENCY_KEY_REQUIRED']);
    // createReportedItem: exact replay, once.
    const key = newKey();
    const body = { rawUrl: itemUrl('Replay_0001'), displayTitle: 'SYNTHETIC replay' };
    const first = await postItem(c, caseNow.etag, body, { key });
    const replay = await postItem(c, caseNow.etag, body, { key });
    expect(replayView(replay)).toEqual(replayView(first));
    expect(await prisma.reportedItem.count({ where: { externalItemId: 'Replay_0001' } })).toBe(1);
    expect(await auditCount('REPORTED_ITEM_CREATED', dataOf<ReportedItem>(first).id)).toBe(1);
    const conflict = await postItem(c, caseNow.etag, { ...body, displayTitle: 'other' }, { key });
    expect(outcome(conflict)).toEqual([409, 'IDEMPOTENCY_CONFLICT']);
    // patchUseMapping and reviseCaseFact: exact replays, once.
    const patchKey = newKey();
    const patched = await patchMapping(
      c,
      mapping.data.id,
      mapping.etag,
      { occurrence: undefined, limitations: 'SYNTHETIC once' },
      { key: patchKey },
    );
    const patchReplay = await patchMapping(
      c,
      mapping.data.id,
      mapping.etag,
      { limitations: 'SYNTHETIC once' },
      { key: patchKey },
    );
    expect(replayView(patchReplay)).toEqual(replayView(patched));
    expect(await auditCount('USE_MAPPING_UPDATED', mapping.data.id)).toBe(1);
    const fact = await createFact(c);
    const reviseKey = newKey();
    const caseForRevision = await getCase(c);
    const revised = await postRevision(
      c,
      fact.id,
      caseForRevision.etag,
      { changeReason: 'SYNTHETIC once' },
      { key: reviseKey },
    );
    const revisedReplay = await postRevision(
      c,
      fact.id,
      caseForRevision.etag,
      { changeReason: 'SYNTHETIC once' },
      { key: reviseKey },
    );
    expect(replayView(revisedReplay)).toEqual(replayView(revised));
    expect(await prisma.caseFact.count({ where: { factGroupId: fact.factGroupId } })).toBe(2);
    // Archive/restore of a work: replay once.
    const archiveKey = newKey();
    const archivedWork = await childCommand('works', 'archive', c, work.data.id, work.etag, {
      key: archiveKey,
    });
    const archivedReplay = await childCommand('works', 'archive', c, work.data.id, work.etag, {
      key: archiveKey,
    });
    expect(replayView(archivedReplay)).toEqual(replayView(archivedWork));
    expect(await auditCount('CASE_WORK_ARCHIVED', work.data.id)).toBe(1);
    // A refused request is never stored: once the cause is gone, the same key and body succeed.
    const refusedKey = newKey();
    const caseForMapping = await getCase(c);
    const mappingBody = { caseWorkId: work.data.id, reportedItemId: item.data.id, occurrence: 5 };
    const refused = await postMapping(c, caseForMapping.etag, mappingBody, { key: refusedKey });
    expect(outcome(refused)).toEqual([409, 'RECORD_STATE_CONFLICT']);
    expect(await prisma.idempotencyRecord.count({ where: { idempotencyKey: refusedKey } })).toBe(0);
    versioned(await childCommand('works', 'restore', c, work.data.id, etagOf(archivedWork)), 200);
    const caseAfterRestore = await getCase(c);
    expect(
      (await postMapping(c, caseAfterRestore.etag, mappingBody, { key: refusedKey })).status,
    ).toBe(201);
    // createCaseFact with supports: a replay creates no second support row.
    const supportKey = newKey();
    const caseForFact = await getCase(c);
    const supported = factBody({
      provenance: 'OPERATOR_REPORTED',
      sources: [
        {
          caseSourceId: linked.data.id,
          supportRole: 'SYNTHETIC_ONCE',
          supportedAssertion: 'SYNTHETIC',
        },
      ],
    });
    const created = await caseChildCreate(
      'createCaseFact',
      c,
      caseForFact.etag,
      'facts',
      supported,
      { key: supportKey },
    );
    const createdReplay = await caseChildCreate(
      'createCaseFact',
      c,
      caseForFact.etag,
      'facts',
      supported,
      { key: supportKey },
    );
    expect(replayView(createdReplay)).toEqual(replayView(created));
    expect(await prisma.factSource.count({ where: { supportRole: 'SYNTHETIC_ONCE' } })).toBe(1);
  });

  it('in progress: a running claim is 409 with Retry-After and writes nothing; an abandoned claim can be resumed', async () => {
    const w = await world();
    const key = newKey();
    const current = await getCase(w.case.data.id);
    const body = { title: 'SYNTHETIC in flight' };
    const first = versioned<CaseWork>(
      await postWork(w.case.data.id, current.etag, body, { key }),
      201,
    );
    const record = await prisma.idempotencyRecord.findFirstOrThrow({
      where: { idempotencyKey: key },
    });
    // Turn the completed record back into a fresh claim and undo its effect: a request in flight.
    await prisma.auditEvent.deleteMany({ where: { entityId: first.data.id } });
    await prisma.caseWork.delete({ where: { id: first.data.id } });
    await prisma.caseRecord.update({
      where: { id: w.case.data.id },
      data: { rowVersion: current.data.rowVersion, contextRevision: current.data.contextRevision },
    });
    await prisma.idempotencyRecord.update({
      where: { id: record.id },
      data: {
        state: 'IN_PROGRESS',
        responseStatus: null,
        responseJson: Prisma.DbNull,
        createdAt: new Date(t.clock.ms),
      },
    });
    const busy = await postWork(w.case.data.id, current.etag, body, { key });
    expect([busy.status, code(busy), busy.headers['retry-after']]).toEqual([
      409,
      'IDEMPOTENCY_IN_PROGRESS',
      '1',
    ]);
    expect(await countRows(prisma, 'case_works')).toBe(0);
    await prisma.idempotencyRecord.update({
      where: { id: record.id },
      data: { createdAt: new Date(t.clock.ms - 61_000) },
    });
    const resumed = versioned<CaseWork>(
      await postWork(w.case.data.id, current.etag, body, { key }),
      201,
    );
    expect(resumed.data.id).not.toBe(first.data.id);
    expect(await countRows(prisma, 'case_works')).toBe(1);
  });

  it('two tabs and concurrent writers: one ETag, one winner; competing fact revisions keep one head; a case change and a child creation never interleave', async () => {
    const { w, item, work, mapping } = await intakeWorld();
    const c = w.case.data.id;
    // Two tabs editing one reported item, one work, one mapping.
    const pairs: Array<[() => Promise<HttpResult>, () => Promise<HttpResult>]> = [
      [
        () => patchItem(c, item.data.id, item.etag, { displayTitle: 'SYNTHETIC tab 1' }),
        () => patchItem(c, item.data.id, item.etag, { displayTitle: 'SYNTHETIC tab 2' }),
      ],
      [
        () => patchWork(c, work.data.id, work.etag, { title: 'SYNTHETIC tab 1' }),
        () => patchWork(c, work.data.id, work.etag, { title: 'SYNTHETIC tab 2' }),
      ],
      [
        () => patchMapping(c, mapping.data.id, mapping.etag, { sourceStartMs: '1' }),
        () => patchMapping(c, mapping.data.id, mapping.etag, { sourceStartMs: '2' }),
      ],
    ];
    for (const [one, two] of pairs) {
      const results = await Promise.all([one(), two()]);
      expect(results.map((result) => result.status).sort()).toEqual([200, 412]);
    }
    expect((await getItem(c, item.data.id)).data.rowVersion).toBe(2);
    expect((await getWork(c, work.data.id)).data.rowVersion).toBe(2);
    expect((await getMapping(c, mapping.data.id)).data.rowVersion).toBe(2);
    // Competing revisions of one fact with one case ETag: one revision, one head.
    const fact = await createFact(c);
    const etag = (await getCase(c)).etag;
    const revisions = await Promise.all([
      postRevision(c, fact.id, etag, { changeReason: 'SYNTHETIC revision A' }),
      postRevision(c, fact.id, etag, { changeReason: 'SYNTHETIC revision B' }),
      postRevision(c, fact.id, etag, { changeReason: 'SYNTHETIC revision C' }),
    ]);
    expect(revisions.map((result) => result.status).sort()).toEqual([201, 412, 412]);
    expect(await prisma.caseFact.count({ where: { factGroupId: fact.factGroupId } })).toBe(2);
    expect((await listFacts(c)).items).toHaveLength(1);
    // A later request for the old head (with a fresh case ETag) is REVISION_NOT_HEAD.
    const fresh = await getCase(c);
    expect(outcome(await postRevision(c, fact.id, fresh.etag, {}))).toEqual([
      409,
      'REVISION_NOT_HEAD',
    ]);
    // The case changes while a child is created with the same case ETag: one of them wins.
    const caseEtag = (await getCase(c)).etag;
    const race = await Promise.all([
      patchCase(c, caseEtag, { intakeLabel: 'SYNTHETIC renamed' }),
      postItem(c, caseEtag, { rawUrl: itemUrl('Race_Item_1') }),
      postWork(c, caseEtag, { title: 'SYNTHETIC race work' }),
      postFact(c, caseEtag, { scopeText: 'SYNTHETIC race fact' }),
    ]);
    expect(race.map((result) => result.status).filter((status) => status === 412)).toHaveLength(3);
    expect(race.filter((result) => result.status === 200 || result.status === 201)).toHaveLength(1);
    // Concurrent creates of the same video in one case with fresh ETags: one item.
    const tabs = await Promise.all([getCase(c), getCase(c)]);
    const videos = await Promise.all(
      tabs.map((tab) => postItem(c, tab.etag, { rawUrl: itemUrl('Same_Video1') })),
    );
    expect(videos.map((result) => result.status).sort()).toEqual([201, 412]);
    expect(await prisma.reportedItem.count({ where: { externalItemId: 'Same_Video1' } })).toBe(1);
  });

  it('a failing audit insert rolls back every P4B write: no row, no version or context change, no support row, no idempotency record', async () => {
    const { writes } = await intakeWrites();
    const before = await intakeDump();
    const idempotencyBefore = await prisma.idempotencyRecord.count();
    auditWriter.armed = true;
    for (const write of writes) {
      const [type, id] = write.target.split(':') as [string, string];
      const row =
        type === 'CaseRecord'
          ? await prisma.caseRecord.findUniqueOrThrow({ where: { id } })
          : type === 'ReportedItem'
            ? await prisma.reportedItem.findUniqueOrThrow({ where: { id } })
            : type === 'CaseWork'
              ? await prisma.caseWork.findUniqueOrThrow({ where: { id } })
              : await prisma.useMapping.findUniqueOrThrow({ where: { id } });
      const ifMatch = `"${type}:${id}:v${row.rowVersion}"`;
      const result = await client.write(write.operationId, write.method, write.path, write.body, {
        ifMatch,
      });
      expect(outcome(result), write.operationId).toEqual([500, 'INTERNAL_ERROR']);
    }
    auditWriter.armed = false;
    expect(auditWriter.failures).toBe(writes.length);
    expect(await intakeDump()).toEqual(before);
    expect(await prisma.idempotencyRecord.count()).toBe(idempotencyBefore);
  });
});

describe('SECURITY / CONTRACT', () => {
  it('no session, a bad CSRF token or a wrong Origin stops every P4B write before any mutation', async () => {
    const { w, item, work, mapping } = await intakeWorld();
    const fact = await createFact(w.case.data.id);
    const c = w.case.data.id;
    const caseEtag = (await getCase(c)).etag;
    const attempts: Array<[string, 'POST' | 'PATCH', string, unknown, string]> = [
      [
        'createReportedItem',
        'POST',
        `/cases/${c}/reported-items`,
        { rawUrl: itemUrl('Sec_Item_01') },
        caseEtag,
      ],
      [
        'patchReportedItem',
        'PATCH',
        `/cases/${c}/reported-items/${item.data.id}`,
        { displayTitle: 'x' },
        item.etag,
      ],
      ['createCaseWork', 'POST', `/cases/${c}/works`, { title: 'x' }, caseEtag],
      [
        'archiveCaseWork',
        'POST',
        `/cases/${c}/works/${work.data.id}/archive`,
        { reason: 'x' },
        work.etag,
      ],
      [
        'patchUseMapping',
        'PATCH',
        `/cases/${c}/mappings/${mapping.data.id}`,
        { limitations: 'x' },
        mapping.etag,
      ],
      ['createCaseFact', 'POST', `/cases/${c}/facts`, factBody(), caseEtag],
      ['reviseCaseFact', 'POST', `/cases/${c}/facts/${fact.id}/revisions`, factBody(), caseEtag],
    ];
    const before = await intakeDump();
    for (const [operationId, method, path, body, etag] of attempts) {
      const text = JSON.stringify(body);
      const noSession = await http(t.port, method, `/api/v1${path}`, {
        headers: {
          Origin: ALLOWED_ORIGIN,
          'X-Requested-With': 'TB-APP',
          'X-CSRF-Token': client.session.csrfToken,
          'Idempotency-Key': newKey(),
          'If-Match': etag,
          'Content-Type': 'application/json',
        },
        body: text,
      });
      expect(noSession.status, operationId).toBe(401);
      const badCsrf = await client.write(operationId, method, path, body, {
        ifMatch: etag,
        headers: { 'X-CSRF-Token': 'not-the-token' },
      });
      expect(outcome(badCsrf), operationId).toEqual([403, 'CSRF_TOKEN_INVALID']);
      const wrongOrigin = await client.write(operationId, method, path, body, {
        ifMatch: etag,
        headers: { Origin: 'http://evil.example.invalid' },
      });
      expect(wrongOrigin.status, operationId).toBe(403);
    }
    expect(await intakeDump()).toEqual(before);
  });

  it('correspondence, production, prompts, candidates, readiness, signing and sending stay unrouted; P4B creates no later-phase record', async () => {
    const { w } = await intakeWorld();
    const id = w.case.data.id;
    const paths: Array<['GET' | 'POST' | 'PATCH' | 'DELETE', string]> = [
      ['POST', `/cases/${id}/correspondence-bindings`],
      ['GET', `/cases/${id}/correspondence-bindings`],
      ['GET', `/cases/${id}/production-context`],
      ['POST', `/cases/${id}/prompts`],
      ['POST', `/cases/${id}/candidates`],
      ['GET', `/candidates/${randomUUID()}/readiness`],
      ['POST', `/cases/${id}/readiness`],
      ['POST', `/cases/${id}/sign`],
      ['POST', `/cases/${id}/send`],
      ['POST', `/cases/${id}/g1`],
      ['DELETE', `/cases/${id}/reported-items/${randomUUID()}`],
      ['DELETE', `/cases/${id}/facts/${randomUUID()}`],
      ['PATCH', `/cases/${id}/facts/${randomUUID()}`],
      ['GET', '/correspondence'],
    ];
    for (const [method, path] of paths) {
      const response = await unrouted(method, path);
      expect([response.status, code(response)], `${method} ${path}`).toEqual([404, 'NOT_FOUND']);
    }
    await expectNoLaterPhaseRecords();
  });

  it('every collected response matches its operation: declared status, contract schema, ETag rules, no readiness vocabulary; all 22 P4B operations and the R9 read were exercised', () => {
    const byId = new Map<string, (typeof operations)[number]>(
      operations.map((operation) => [operation.operationId, operation]),
    );
    const exercised: readonly string[] = [...P4B_OPERATIONS, ...R9_OPERATIONS];
    const contracted = operations
      .filter((operation) => exercised.includes(operation.operationId))
      .map((operation) => operation.operationId)
      .sort();
    expect(contracted).toEqual([...exercised].sort());
    const seen = new Set<string>();
    const forbiddenKey =
      /"(g[1-7]\w*|ready\w*|eligib\w*|authori[sz]ed\w*|infring\w*|isCurrent\w*|approved\w*|verified\w*)"\s*:/i;
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
          // Lists, fact revisions and SourceReferences carry no ETag.
          expect(result.headers['etag'], label).toBeUndefined();
        }
        if (exercised.includes(operationId)) {
          expect(result.text, label).not.toMatch(forbiddenKey);
        }
      } else {
        expect(operation.errors as readonly string[], label).toContain(String(result.status));
        expect(OperationErrorSchema.safeParse(result.json).success, label).toBe(true);
      }
      expect(result.headers['cache-control'], label).toBe('no-store');
    }
    expect(exercised.filter((operationId) => !seen.has(operationId))).toEqual([]);
  });
});
