// P3B — Mandate, MandateVersion, MandateCoverage, CoverageSigner and AuthorityEvent over real HTTP
// against tb_notice_test (yarn test:db).
//
// Each test boots the real AppModule + configureApp pipeline on an ephemeral loopback port with a
// synthetic signed-in application User, a controllable clock and an audit writer that can be made
// to fail. Every response is recorded and checked against the active contract at the end. All data
// is synthetic; every test deletes what it created. None of these records is authority: a mandate,
// a frozen version, a coverage, a coverage signer or an authority event is a structured record of
// what a cited (synthetic) source is reported to support — never G1, G7, readiness or a signature.
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Prisma, type PrismaClient } from '../../apps/api/generated/prisma/client.js';
import type {
  Agency,
  AuthorityEvent,
  CoverageSigner,
  LegalSubject,
  Mandate,
  MandateCoverage,
  MandateVersion,
  Owner,
  OwnerSubject,
  Route,
  Signer,
  SourceReference,
} from '../../packages/contracts/src/index.js';
import { OperationErrorSchema, operations } from '../../packages/contracts/src/index.js';
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
  DirectoryClient,
  errorOf,
  etagOf,
  FailingAuditWriter,
  insertSource,
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

interface Versioned<T> {
  readonly data: T;
  readonly etag: string;
}

interface Page<T> {
  readonly items: T[];
  readonly nextCursor: string | null;
}

const code = (result: HttpResult) => errorOf(result).code;
const outcome = (result: HttpResult) => [result.status, code(result)];

function versioned<T>(result: HttpResult, status: number): Versioned<T> {
  expect(result.status, result.text).toBe(status);
  return { data: dataOf<T>(result), etag: etagOf(result) };
}

/** An append-only or immutable resource (AuthorityEvent, SourceReference) or a list: no ETag. */
function immutable<T>(result: HttpResult, status: number): T {
  expect(result.status, result.text).toBe(status);
  expect(result.headers['etag']).toBeUndefined();
  return dataOf<T>(result);
}

const affectedOf = (result: HttpResult) =>
  (result.json as { meta: { affectedResources: unknown[] } }).meta.affectedResources;

const nowIso = () => new Date(t.clock.ms).toISOString();

/** What a replay must reproduce: status, data, affected resources and ETag (not the requestId). */
const replayView = (result: HttpResult) => {
  const body = result.json as
    { data?: unknown; meta?: { affectedResources?: unknown } } | undefined;
  return [result.status, body?.data, body?.meta?.affectedResources, result.headers['etag']];
};

/** Records of the Case phase and later: P3B never writes any of them. */
const CASE_TABLES = [
  'cases',
  'case_authority_selections',
  'case_authority_coverages',
  'reported_items',
  'case_works',
  'use_mappings',
  'case_sources',
  'case_facts',
  'fact_sources',
  'correspondence',
  'correspondence_bindings',
  'prompt_snapshots',
  'notice_candidates',
  'validation_runs',
  'validation_issues',
  'candidate_assessments',
  'assessment_sources',
];

async function expectNoCaseRecords(): Promise<void> {
  for (const table of CASE_TABLES) expect(await countRows(prisma, table), table).toBe(0);
}

async function auditRows(entityId: string) {
  return prisma.auditEvent.findMany({
    where: { entityId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
}

const auditCount = (action: string, entityId?: string) =>
  prisma.auditEvent.count({ where: { action, ...(entityId ? { entityId } : {}) } });

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

// directory records (P2/P3A) --------------------------------------------------------------------

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
const createSigner = async (agencyId: string, name = 'SYNTHETIC Signer Person') =>
  versioned<Signer>(
    await client.write('createSigner', 'POST', '/signers', { agencyId, fullLegalName: name }),
    201,
  );
const getAgency = async (id: string) =>
  versioned<Agency>(await client.get('getAgency', `/agencies/${id}`), 200);
const getOwner = async (id: string) =>
  versioned<Owner>(await client.get('getOwner', `/owners/${id}`), 200);
const getSubject = async (id: string) =>
  versioned<LegalSubject>(await client.get('getLegalSubject', `/legal-subjects/${id}`), 200);
const getSigner = async (id: string) =>
  versioned<Signer>(await client.get('getSigner', `/signers/${id}`), 200);
const getRoute = async (id: string) =>
  versioned<Route>(await client.get('getRoute', `/routes/${id}`), 200);
const getSource = async (id: string) =>
  immutable<SourceReference>(await client.get('getSource', `/sources/${id}`), 200);

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

const patchRoute = (id: string, etag: string, body: Record<string, unknown>) =>
  client.write('patchRoute', 'PATCH', `/routes/${id}`, body, { ifMatch: etag });

/** A further route of an agency: a new Owner – LegalSubject association and its route. */
async function anotherRoute(agencyId: string, label: string) {
  const owner = await createOwner(label);
  const subject = await createSubject(label);
  const association = await link(owner.data.id, subject.data.id);
  const route = await createRoute({ agencyId, ownerSubjectId: association.data.id });
  return { owner, subject, association, route };
}

async function archive(operationId: string, path: string, etag: string) {
  return client.write(
    operationId,
    'POST',
    `${path}/archive`,
    { reason: 'SYNTHETIC archive' },
    {
      ifMatch: etag,
    },
  );
}

const SOURCE_BASE = {
  title: 'SYNTHETIC agreement record (test only; not evidence)',
  sourceRole: 'CANONICAL_RECORD',
  scopeText: 'Synthetic scope description',
};

const createSource = async (body: Record<string, unknown> = {}) =>
  immutable<SourceReference>(
    await client.write('createSource', 'POST', '/sources', { ...SOURCE_BASE, ...body }),
    201,
  );

const reviseSource = (id: string, body: Record<string, unknown>) =>
  client.write('reviseSource', 'POST', `/sources/${id}/revisions`, { ...SOURCE_BASE, ...body });

/** A source that records an attributed human review (explicitly DOCUMENT_REVIEWED). */
const reviewedSource = (agencyId: string) =>
  createSource({
    agencyId,
    title: 'SYNTHETIC reviewed agreement',
    reportedProvenance: 'DOCUMENT_REVIEWED',
    reviewedByLabel: 'SYNTHETIC Reviewer',
  });

// authority records (P3B) -----------------------------------------------------------------------

const MANDATE = { label: 'SYNTHETIC Representation agreement' };
const VERSION = { changeKind: 'NEW_AUTHORIZATION', changeReason: 'SYNTHETIC capture' };
const COVERAGE = { coverageLabel: 'SYNTHETIC coverage' };
const EVENT = {
  eventType: 'CURRENTNESS_RECORDED',
  provenance: 'OPERATOR_REPORTED',
  scopeText: 'SYNTHETIC whole mandate',
  interpretation: 'SYNTHETIC operator reading',
};
const FREEZE = { reason: 'SYNTHETIC freeze of the recorded terms' };

const postMandate = (body: Record<string, unknown>, options: WriteOptions = {}) =>
  client.write('createMandate', 'POST', '/mandates', { ...MANDATE, ...body }, options);
const createMandate = async (agencyId: string, body: Record<string, unknown> = {}) =>
  versioned<Mandate>(await postMandate({ agencyId, ...body }), 201);
const getMandate = async (id: string) =>
  versioned<Mandate>(await client.get('getMandate', `/mandates/${id}`), 200);
const patchMandate = (id: string, etag: string, body: Record<string, unknown>) =>
  client.write('patchMandate', 'PATCH', `/mandates/${id}`, body, { ifMatch: etag });

const postVersion = (
  mandateId: string,
  etag: string | null,
  body: Record<string, unknown> = {},
  options: WriteOptions = {},
) =>
  client.write(
    'createMandateVersion',
    'POST',
    `/mandates/${mandateId}/versions`,
    { ...VERSION, ...body },
    { ifMatch: etag, ...options },
  );
async function createVersion(mandateId: string, body: Record<string, unknown> = {}) {
  const mandate = await getMandate(mandateId);
  return versioned<MandateVersion>(await postVersion(mandateId, mandate.etag, body), 201);
}
const getVersion = async (id: string) =>
  versioned<MandateVersion>(await client.get('getMandateVersion', `/mandate-versions/${id}`), 200);
const patchVersion = (
  id: string,
  etag: string | null,
  body: Record<string, unknown>,
  options: WriteOptions = {},
) =>
  client.write('patchDraftMandateVersion', 'PATCH', `/mandate-versions/${id}`, body, {
    ifMatch: etag,
    ...options,
  });
const freezeVersion = (
  id: string,
  etag: string | null,
  body: Record<string, unknown> = FREEZE,
  options: WriteOptions = {},
) =>
  client.write('freezeMandateVersion', 'POST', `/mandate-versions/${id}/freeze`, body, {
    ifMatch: etag,
    ...options,
  });
async function freeze(id: string) {
  const version = await getVersion(id);
  return versioned<MandateVersion>(await freezeVersion(id, version.etag), 200);
}

const postCoverage = (
  versionId: string,
  etag: string | null,
  body: Record<string, unknown>,
  options: WriteOptions = {},
) =>
  client.write(
    'createCoverage',
    'POST',
    `/mandate-versions/${versionId}/coverages`,
    { ...COVERAGE, ...body },
    { ifMatch: etag, ...options },
  );
async function createCoverage(versionId: string, body: Record<string, unknown>) {
  const version = await getVersion(versionId);
  return versioned<MandateCoverage>(await postCoverage(versionId, version.etag, body), 201);
}
const getCoverage = async (id: string) =>
  versioned<MandateCoverage>(await client.get('getCoverage', `/coverages/${id}`), 200);
const patchCoverage = (
  id: string,
  etag: string | null,
  body: Record<string, unknown>,
  options: WriteOptions = {},
) =>
  client.write('patchDraftCoverage', 'PATCH', `/coverages/${id}`, body, {
    ifMatch: etag,
    ...options,
  });

const postCoverageSigner = (
  coverageId: string,
  etag: string | null,
  body: Record<string, unknown>,
  options: WriteOptions = {},
) =>
  client.write(
    'createCoverageSigner',
    'POST',
    `/coverages/${coverageId}/signers`,
    { capacity: 'SYNTHETIC capacity', ...body },
    { ifMatch: etag, ...options },
  );
async function addCoverageSigner(coverageId: string, body: Record<string, unknown>) {
  const coverage = await getCoverage(coverageId);
  return versioned<CoverageSigner>(await postCoverageSigner(coverageId, coverage.etag, body), 201);
}
const getCoverageSigner = async (id: string) =>
  versioned<CoverageSigner>(await client.get('getCoverageSigner', `/coverage-signers/${id}`), 200);
const deleteCoverageSigner = (id: string, etag: string | null, options: WriteOptions = {}) =>
  client.write('deleteDraftCoverageSigner', 'DELETE', `/coverage-signers/${id}`, undefined, {
    ifMatch: etag,
    ...options,
  });

const postEvent = (
  mandateId: string,
  etag: string | null,
  body: Record<string, unknown>,
  options: WriteOptions = {},
) =>
  client.write(
    'recordAuthorityEvent',
    'POST',
    `/mandates/${mandateId}/events`,
    { ...EVENT, ...body },
    { ifMatch: etag, ...options },
  );
async function recordEvent(mandateId: string, body: Record<string, unknown>) {
  const mandate = await getMandate(mandateId);
  return immutable<AuthorityEvent>(await postEvent(mandateId, mandate.etag, body), 201);
}

async function listOf<T>(operationId: string, path: string): Promise<Page<T>> {
  return immutable<Page<T>>(await client.get(operationId, path), 200);
}

/**
 * Agency A with one agency-owned source, Owner X – LegalSubject L (LINKED), the route of A over that
 * association, a Signer of A and an empty Mandate of A. Nothing else.
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
  const signer = await createSigner(agency.data.id);
  const source = await createSource({
    agencyId: agency.data.id,
    title: `SYNTHETIC ${label} representation agreement`,
  });
  const mandate = await createMandate(agency.data.id);
  return { agency, owner, subject, association, route, signer, source, mandate };
}

/**
 * world() plus a version citing the agency source, one coverage of the route with that source as
 * basis and the Signer recorded under it; frozen on request.
 */
async function chain(label = 'A', options: { frozen?: boolean } = {}) {
  const w = await world(label);
  const created = await createVersion(w.mandate.data.id, {
    primarySourceId: w.source.id,
    documentState: 'SIGNED_APPEARING',
  });
  const coverage = await createCoverage(created.data.id, {
    routeId: w.route.data.id,
    basisSourceId: w.source.id,
    actionScope: ['PREPARE_NOTICE'],
  });
  const coverageSigner = await addCoverageSigner(coverage.data.id, {
    signerId: w.signer.data.id,
    sourceId: w.source.id,
  });
  if (options.frozen) await freeze(created.data.id);
  return {
    ...w,
    mandate: await getMandate(w.mandate.data.id),
    version: await getVersion(created.data.id),
    coverage: await getCoverage(coverage.data.id),
    coverageSigner: await getCoverageSigner(coverageSigner.data.id),
  };
}

/** Row versions of the chain's records, to prove that a refused or unrelated write changed nothing. */
async function versionsOf(ids: {
  mandate?: string;
  version?: string;
  coverage?: string;
  coverageSigner?: string;
  route?: string;
}) {
  return {
    mandate: ids.mandate ? (await getMandate(ids.mandate)).data.rowVersion : null,
    version: ids.version ? (await getVersion(ids.version)).data.rowVersion : null,
    coverage: ids.coverage ? (await getCoverage(ids.coverage)).data.rowVersion : null,
    coverageSigner: ids.coverageSigner
      ? (await getCoverageSigner(ids.coverageSigner)).data.rowVersion
      : null,
    route: ids.route ? (await getRoute(ids.route)).data.rowVersion : null,
  };
}

// ---------------------------------------------------------------------------------------------

describe('MANDATE — a container of one agency, not authority', () => {
  it('create: exactly the supplied fields; a "FINAL"/"signed" label proves nothing and nothing is created alongside', async () => {
    const agency = await createAgency();
    const result = await postMandate({
      agencyId: agency.data.id,
      label: 'SYNTHETIC Agreement FINAL signed',
      externalReference: 'SYN-REF-001',
      description: 'SYNTHETIC-DESCRIPTION quoted clause',
      notes: 'SYNTHETIC-NOTE private remark',
    });
    const mandate = versioned<Mandate>(result, 201);
    expect(mandate.data).toEqual({
      id: mandate.data.id,
      agencyId: agency.data.id,
      label: 'SYNTHETIC Agreement FINAL signed',
      externalReference: 'SYN-REF-001',
      description: 'SYNTHETIC-DESCRIPTION quoted clause',
      canonicalCode: null,
      canonicalSourceId: null,
      bindingState: 'LOCAL_ONLY',
      notes: 'SYNTHETIC-NOTE private remark',
      archivedAt: null,
      archiveReason: null,
      createdAt: nowIso(),
      createdById: client.session.userId,
      updatedAt: nowIso(),
      updatedById: client.session.userId,
      rowVersion: 1,
    });
    expect(mandate.etag).toBe(`"Mandate:${mandate.data.id}:v1"`);
    expect(affectedOf(result)).toEqual([{ type: 'Mandate', id: mandate.data.id, rowVersion: 1 }]);
    // No version, date, scope, platform, signer, status or event is inferred or created.
    for (const table of [
      'mandate_versions',
      'mandate_coverages',
      'coverage_signers',
      'authority_events',
    ]) {
      expect(await countRows(prisma, table), table).toBe(0);
    }
    await expectNoCaseRecords();
    expect((await getAgency(agency.data.id)).data).toMatchObject({
      recordState: 'DRAFT',
      rowVersion: 1,
    });
    const [event] = await auditRows(mandate.data.id);
    expect(event).toMatchObject({
      action: 'MANDATE_CREATED',
      entityType: 'Mandate',
      actorUserId: client.session.userId,
    });
    expect(event?.afterRedacted).toMatchObject({
      agencyId: agency.data.id,
      label: 'SYNTHETIC Agreement FINAL signed',
      description: { redacted: true, codePoints: 35 },
      notes: { redacted: true, codePoints: 29 },
      rowVersion: 1,
    });
    const audit = JSON.stringify(event);
    expect(audit).not.toContain('SYNTHETIC-DESCRIPTION');
    expect(audit).not.toContain('SYNTHETIC-NOTE');
  });

  it('create needs an explicit, existing, unarchived agency; a status, dates, owner or platform are not fields', async () => {
    const agency = await createAgency();
    const cases: Array<[Record<string, unknown>, number, string]> = [
      [{ agencyId: undefined }, 422, 'VALIDATION_FAILED'],
      [{ agencyId: randomUUID() }, 422, 'REFERENCE_NOT_FOUND'],
      [{ agencyId: agency.data.id, label: '' }, 422, 'VALIDATION_FAILED'],
      [{ agencyId: agency.data.id, status: 'AUTHORIZED' }, 422, 'VALIDATION_FAILED'],
      [{ agencyId: agency.data.id, recordState: 'ACTIVE' }, 422, 'VALIDATION_FAILED'],
      [{ agencyId: agency.data.id, effectiveOn: '2026-01-01' }, 422, 'VALIDATION_FAILED'],
      [{ agencyId: agency.data.id, ownerId: randomUUID() }, 422, 'VALIDATION_FAILED'],
      [{ agencyId: agency.data.id, platform: 'YOUTUBE' }, 422, 'VALIDATION_FAILED'],
      [{ agencyId: agency.data.id, signerId: randomUUID() }, 422, 'VALIDATION_FAILED'],
    ];
    for (const [body, status, errorCode] of cases) {
      const result = await postMandate(body);
      expect(outcome(result), JSON.stringify(body)).toEqual([status, errorCode]);
    }
    versioned(await archive('archiveAgency', `/agencies/${agency.data.id}`, agency.etag), 200);
    const onArchived = await postMandate({ agencyId: agency.data.id });
    expect([onArchived.status, errorOf(onArchived)]).toMatchObject([
      409,
      {
        code: 'RECORD_STATE_CONFLICT',
        details: { record: 'Agency', state: 'ARCHIVED', field: 'agencyId' },
      },
    ]);
    expect(await countRows(prisma, 'mandates')).toBe(0);
  });

  it('list and get: agency filter, accent-insensitive label / reference / code search, exact id, signed cursors', async () => {
    const a = await createAgency('A');
    const b = await createAgency('B');
    const first = await createMandate(a.data.id, {
      label: 'SYNTHETIC Hợp tác kênh',
      externalReference: 'SYN-EXT-7',
    });
    t.clock.advance(1_000);
    const second = await createMandate(a.data.id, { label: 'SYNTHETIC Second agreement' });
    t.clock.advance(1_000);
    const third = await createMandate(b.data.id, { label: 'SYNTHETIC Other agency' });
    const ids = async (query: string) =>
      (await listOf<Mandate>('listMandates', `/mandates${query}`)).items.map((item) => item.id);
    expect(await ids('')).toEqual([third.data.id, second.data.id, first.data.id]);
    expect(await ids(`?agencyId=${a.data.id}`)).toEqual([second.data.id, first.data.id]);
    expect(await ids(`?q=${encodeURIComponent('hop tac')}`)).toEqual([first.data.id]);
    expect(await ids('?q=syn-ext-7')).toEqual([first.data.id]);
    expect(await ids(`?q=${second.data.id}`)).toEqual([second.data.id]);
    expect(await ids(`?agencyId=${b.data.id}&q=Second`)).toEqual([]);
    const page = await listOf<Mandate>('listMandates', '/mandates?limit=2');
    expect(page.items.map((item) => item.id)).toEqual([third.data.id, second.data.id]);
    const cursor = page.nextCursor ?? '';
    const next = await listOf<Mandate>(
      'listMandates',
      `/mandates?limit=2&cursor=${encodeURIComponent(cursor)}`,
    );
    expect([next.items.map((item) => item.id), next.nextCursor]).toEqual([[first.data.id], null]);
    const tampered = await client.get(
      'listMandates',
      `/mandates?cursor=${encodeURIComponent(`${cursor.slice(0, -2)}xx`)}`,
    );
    expect(outcome(tampered)).toEqual([400, 'INVALID_CURSOR']);
    const refiltered = await client.get(
      'listMandates',
      `/mandates?agencyId=${a.data.id}&cursor=${encodeURIComponent(cursor)}`,
    );
    expect(outcome(refiltered)).toEqual([400, 'INVALID_CURSOR']);
    const undeclared = await client.get('listMandates', '/mandates?status=AUTHORIZED');
    expect(outcome(undeclared)).toEqual([400, 'INVALID_QUERY_PARAMETER']);
    const got = await getMandate(first.data.id);
    expect(got.data).toEqual(first.data);
    expect(got.etag).toBe(first.etag);
    const missing = await client.get('getMandate', `/mandates/${randomUUID()}`);
    expect(outcome(missing)).toEqual([404, 'NOT_FOUND']);
  });

  it('patch: label, reference, description and notes with If-Match; the agency never changes; a no-op writes nothing', async () => {
    const agency = await createAgency();
    const mandate = await createMandate(agency.data.id);
    const patched = versioned<Mandate>(
      await patchMandate(mandate.data.id, mandate.etag, {
        label: 'SYNTHETIC Renamed agreement',
        externalReference: null,
        notes: 'SYNTHETIC-NOTE changed',
      }),
      200,
    );
    expect(patched.data).toMatchObject({
      label: 'SYNTHETIC Renamed agreement',
      externalReference: null,
      notes: 'SYNTHETIC-NOTE changed',
      agencyId: agency.data.id,
      rowVersion: 2,
    });
    const noop = versioned<Mandate>(
      await patchMandate(mandate.data.id, patched.etag, { label: 'SYNTHETIC Renamed agreement' }),
      200,
    );
    expect(noop.data.rowVersion).toBe(2);
    const other = await createAgency('Other');
    for (const body of [
      { agencyId: other.data.id },
      { canonicalCode: 'SYN-X' },
      { archivedAt: null },
      { status: 'CURRENT' },
      {},
    ]) {
      const refused = await patchMandate(mandate.data.id, patched.etag, body);
      expect(outcome(refused), JSON.stringify(body)).toEqual([422, 'VALIDATION_FAILED']);
    }
    expect(await auditCount('MANDATE_UPDATED', mandate.data.id)).toBe(1);
    const [, update] = await auditRows(mandate.data.id);
    expect(update?.beforeRedacted).toMatchObject({
      label: 'SYNTHETIC Representation agreement',
      rowVersion: 1,
    });
    expect(JSON.stringify(update)).not.toContain('SYNTHETIC-NOTE');
    const missing = await patchMandate(randomUUID(), patched.etag, { label: 'x' });
    expect(outcome(missing)).toEqual([404, 'NOT_FOUND']);
  });

  it('archive/restore: an administrative flag only — nothing is revoked or recorded; archived is read-only; restore needs an unarchived agency', async () => {
    const c = await chain('A', { frozen: true });
    const event = await recordEvent(c.mandate.data.id, { sourceId: c.source.id });
    const draft = await createVersion(c.mandate.data.id, {
      changeKind: 'AMENDMENT',
      predecessorId: c.version.data.id,
    });
    const mandate = await getMandate(c.mandate.data.id);
    const before = await versionsOf({
      version: c.version.data.id,
      coverage: c.coverage.data.id,
      coverageSigner: c.coverageSigner.data.id,
    });
    const archived = versioned<Mandate>(
      await archive('archiveMandate', `/mandates/${mandate.data.id}`, mandate.etag),
      200,
    );
    expect(archived.data).toMatchObject({
      archivedAt: nowIso(),
      archiveReason: 'SYNTHETIC archive',
      rowVersion: mandate.data.rowVersion + 1,
    });
    // Versions, coverages, signers and events are untouched; no event records the archive.
    expect(
      await versionsOf({
        version: c.version.data.id,
        coverage: c.coverage.data.id,
        coverageSigner: c.coverageSigner.data.id,
      }),
    ).toEqual(before);
    const events = await listOf<AuthorityEvent>(
      'listAuthorityEvents',
      `/mandates/${mandate.data.id}/events`,
    );
    expect(events.items).toEqual([event]);
    // Archived is read-only except restore.
    const draftNow = await getVersion(draft.data.id);
    const refusals: Array<[string, HttpResult]> = [
      ['patch', await patchMandate(mandate.data.id, archived.etag, { label: 'x' })],
      ['archive', await archive('archiveMandate', `/mandates/${mandate.data.id}`, archived.etag)],
      ['version', await postVersion(mandate.data.id, archived.etag)],
      ['event', await postEvent(mandate.data.id, archived.etag, { sourceId: c.source.id })],
      ['draft patch', await patchVersion(draft.data.id, draftNow.etag, { validityNotes: 'x' })],
      ['freeze', await freezeVersion(draft.data.id, draftNow.etag)],
      ['coverage', await postCoverage(draft.data.id, draftNow.etag, { routeId: c.route.data.id })],
    ];
    for (const [label, refused] of refusals) {
      expect(outcome(refused), label).toEqual([409, 'RECORD_STATE_CONFLICT']);
    }
    const restored = versioned<Mandate>(
      await client.write(
        'restoreMandate',
        'POST',
        `/mandates/${mandate.data.id}/restore`,
        { reason: 'SYNTHETIC restore' },
        { ifMatch: archived.etag },
      ),
      200,
    );
    expect(restored.data).toMatchObject({
      archivedAt: null,
      archiveReason: null,
      rowVersion: archived.data.rowVersion + 1,
    });
    const again = await client.write(
      'restoreMandate',
      'POST',
      `/mandates/${mandate.data.id}/restore`,
      { reason: 'SYNTHETIC restore' },
      { ifMatch: restored.etag },
    );
    expect(outcome(again)).toEqual([409, 'RECORD_STATE_CONFLICT']);
    // Restoring revives nothing and is refused while the agency is archived.
    const rearchived = versioned<Mandate>(
      await archive('archiveMandate', `/mandates/${mandate.data.id}`, restored.etag),
      200,
    );
    const agency = await getAgency(c.agency.data.id);
    versioned(await archive('archiveAgency', `/agencies/${agency.data.id}`, agency.etag), 200);
    const underArchivedAgency = await client.write(
      'restoreMandate',
      'POST',
      `/mandates/${mandate.data.id}/restore`,
      { reason: 'SYNTHETIC restore' },
      { ifMatch: rearchived.etag },
    );
    expect([underArchivedAgency.status, errorOf(underArchivedAgency)]).toMatchObject([
      409,
      { code: 'RECORD_STATE_CONFLICT', details: { record: 'Agency', state: 'ARCHIVED' } },
    ]);
    expect(await countRows(prisma, 'authority_events')).toBe(1);
    expect(await auditCount('MANDATE_ARCHIVED', mandate.data.id)).toBe(2);
    expect(await auditCount('MANDATE_RESTORED', mandate.data.id)).toBe(1);
  });

  it('delete: only an unused mandate; a version, an event, a binding or the archive flag keeps it', async () => {
    const agency = await createAgency();
    const source = await createSource({ agencyId: agency.data.id });
    const unused = await createMandate(agency.data.id);
    const deletion = await client.write(
      'deleteUnusedMandate',
      'DELETE',
      `/mandates/${unused.data.id}`,
      undefined,
      { ifMatch: unused.etag },
    );
    expect([deletion.status, deletion.text]).toEqual([204, '']);
    expect(await countRows(prisma, 'mandates')).toBe(0);
    expect(await auditCount('MANDATE_DELETED', unused.data.id)).toBe(1);

    const blockers = async (id: string) => {
      const current = await getMandate(id);
      const refused = await client.write(
        'deleteUnusedMandate',
        'DELETE',
        `/mandates/${id}`,
        undefined,
        { ifMatch: current.etag },
      );
      expect(outcome(refused)).toEqual([409, 'REFERENCED_RECORD_CANNOT_DELETE']);
      return errorOf(refused).details['blockers'];
    };
    const withVersion = await createMandate(agency.data.id, { label: 'SYNTHETIC with version' });
    await createVersion(withVersion.data.id);
    expect(await blockers(withVersion.data.id)).toEqual([
      'REFERENCED_BY:mandate_versions.mandate_id',
    ]);
    const withEvent = await createMandate(agency.data.id, { label: 'SYNTHETIC with event' });
    await recordEvent(withEvent.data.id, { sourceId: source.id });
    expect(await blockers(withEvent.data.id)).toEqual([
      'REFERENCED_BY:authority_events.mandate_id',
    ]);
    const bound = await createMandate(agency.data.id, { label: 'SYNTHETIC bound' });
    versioned(
      await client.write(
        'bindCanonicalMandate',
        'POST',
        `/mandates/${bound.data.id}/canonical-bindings`,
        { canonicalCode: 'SYN-MANDATE-1', sourceId: source.id, reason: 'synthetic' },
        { ifMatch: bound.etag },
      ),
      200,
    );
    expect(await blockers(bound.data.id)).toEqual(['CANONICAL_BINDING']);
    const archivedOne = await createMandate(agency.data.id, { label: 'SYNTHETIC archived' });
    versioned(
      await archive('archiveMandate', `/mandates/${archivedOne.data.id}`, archivedOne.etag),
      200,
    );
    expect(await blockers(archivedOne.data.id)).toEqual(['ARCHIVED']);
    expect(await countRows(prisma, 'mandates')).toBe(4);
  });

  it('canonical binding: identity/reference only, with a current canonical source of the mandate’s agency', async () => {
    const agency = await createAgency();
    const other = await createAgency('Other');
    const mandate = await createMandate(agency.data.id);
    const path = `/mandates/${mandate.data.id}/canonical-bindings`;
    const bind = (etag: string, body: Record<string, unknown>) =>
      client.write(
        'bindCanonicalMandate',
        'POST',
        path,
        { reason: 'synthetic canonical code check', ...body },
        { ifMatch: etag },
      );
    const inapplicable: Array<[SourceReference, string, string | undefined]> = [
      [await createSource({ agencyId: other.data.id }), 'CROSS_AGENCY_REFERENCE', undefined],
      [await createSource(), 'SOURCE_SCOPE_UNRESOLVED', 'NOT_SCOPED_TO_AGENCY'],
      [
        await createSource({ scopeBindings: { agencyIds: [other.data.id] } }),
        'SOURCE_SCOPE_UNRESOLVED',
        'NOT_SCOPED_TO_AGENCY',
      ],
    ];
    for (const [source, errorCode, reason] of inapplicable) {
      const refused = await bind(mandate.etag, { canonicalCode: 'SYN-M-1', sourceId: source.id });
      expect(outcome(refused)).toEqual([422, errorCode]);
      if (reason) expect(errorOf(refused).details['reason']).toBe(reason);
    }
    const operatorInput = await createSource({
      agencyId: agency.data.id,
      sourceRole: 'OPERATOR_INPUT',
    });
    const wrongRole = await bind(mandate.etag, {
      canonicalCode: 'SYN-M-1',
      sourceId: operatorInput.id,
    });
    expect(outcome(wrongRole)).toEqual([422, 'SOURCE_ROLE_NOT_VERIFICATION']);
    const source = await createSource({ agencyId: agency.data.id });
    const revised = immutable<SourceReference>(
      await reviseSource(source.id, { agencyId: agency.data.id, title: 'SYNTHETIC rev 2' }),
      201,
    );
    const stale = await bind(mandate.etag, { canonicalCode: 'SYN-M-1', sourceId: source.id });
    expect([stale.status, errorOf(stale)]).toMatchObject([
      409,
      { code: 'SOURCE_NOT_CURRENT', details: { currentSourceId: revised.id } },
    ]);
    const bound = versioned<Mandate>(
      await bind(mandate.etag, { canonicalCode: 'SYN-M-1', sourceId: revised.id }),
      200,
    );
    expect(bound.data).toMatchObject({
      canonicalCode: 'SYN-M-1',
      canonicalSourceId: revised.id,
      bindingState: 'SOURCE_REFERENCED',
      rowVersion: 2,
    });
    // A binding is never replaced, codes are unique per kind, and nothing else follows from it:
    // no version, no event, no provenance upgrade of the source.
    const replace = await bind(bound.etag, { canonicalCode: 'SYN-M-2', sourceId: revised.id });
    expect(outcome(replace)).toEqual([409, 'BINDING_CORRECTION_REQUIRES_RECONCILIATION']);
    const second = await createMandate(agency.data.id, { label: 'SYNTHETIC second' });
    const duplicate = await client.write(
      'bindCanonicalMandate',
      'POST',
      `/mandates/${second.data.id}/canonical-bindings`,
      { canonicalCode: 'SYN-M-1', sourceId: revised.id, reason: 'synthetic' },
      { ifMatch: second.etag },
    );
    expect(outcome(duplicate)).toEqual([409, 'DUPLICATE_CANONICAL_CODE']);
    expect((await getSource(revised.id)).reportedProvenance).toBe('OPERATOR_REPORTED');
    expect(await countRows(prisma, 'mandate_versions')).toBe(0);
    expect(await countRows(prisma, 'authority_events')).toBe(0);
    expect(await auditCount('MANDATE_CANONICAL_BOUND', mandate.data.id)).toBe(1);
  });
});

describe('MANDATE VERSIONS — pinned documentary snapshots, a linear chain', () => {
  it('create: version 1, DRAFT, exactly the supplied terms; the Mandate moves on; nothing is inferred or copied', async () => {
    const w = await world();
    const annex = await createSource({ agencyId: w.agency.data.id, title: 'SYNTHETIC annex' });
    const result = await postVersion(w.mandate.data.id, w.mandate.etag, {
      changeKind: 'NEW_AUTHORIZATION',
      changeReason: 'SYNTHETIC-CHANGE-REASON first capture',
      primarySourceId: w.source.id,
      additionalSourceRefs: [
        { sourceId: annex.id, role: 'SYNTHETIC annex', scopeText: 'SYNTHETIC-ANNEX-SCOPE §4' },
      ],
      documentState: 'SIGNED_APPEARING',
      signedDatesRaw: [
        {
          subjectLabel: 'SYNTHETIC party',
          dateRaw: 'SYNTHETIC-RAW-DATE 3 March',
          sourceId: w.source.id,
        },
      ],
      validityModel: 'FIXED_TERM',
      effectiveOn: '2025-03-03',
      expiresOn: '2027-03-02',
      validityNotes: 'SYNTHETIC-VALIDITY-NOTE',
    });
    const version = versioned<MandateVersion>(result, 201);
    expect(version.data).toEqual({
      id: version.data.id,
      mandateId: w.mandate.data.id,
      agencyId: w.agency.data.id,
      version: 1,
      versionState: 'DRAFT',
      changeKind: 'NEW_AUTHORIZATION',
      predecessorId: null,
      primarySourceId: w.source.id,
      additionalSourceRefs: [
        { sourceId: annex.id, role: 'SYNTHETIC annex', scopeText: 'SYNTHETIC-ANNEX-SCOPE §4' },
      ],
      documentState: 'SIGNED_APPEARING',
      sourceReviewState: 'UNREVIEWED',
      signedDatesRaw: [
        {
          subjectLabel: 'SYNTHETIC party',
          dateRaw: 'SYNTHETIC-RAW-DATE 3 March',
          sourceId: w.source.id,
        },
      ],
      validityModel: 'FIXED_TERM',
      effectiveOn: '2025-03-03',
      expiresOn: '2027-03-02',
      validityNotes: 'SYNTHETIC-VALIDITY-NOTE',
      frozenAt: null,
      changeReason: 'SYNTHETIC-CHANGE-REASON first capture',
      createdAt: nowIso(),
      createdById: client.session.userId,
      updatedAt: nowIso(),
      updatedById: client.session.userId,
      rowVersion: 1,
    });
    expect(version.etag).toBe(`"MandateVersion:${version.data.id}:v1"`);
    expect(affectedOf(result)).toEqual([
      { type: 'Mandate', id: w.mandate.data.id, rowVersion: 2 },
      { type: 'MandateVersion', id: version.data.id, rowVersion: 1 },
    ]);
    expect((await getMandate(w.mandate.data.id)).data.rowVersion).toBe(2);
    for (const table of ['mandate_coverages', 'coverage_signers', 'authority_events']) {
      expect(await countRows(prisma, table), table).toBe(0);
    }
    const [event] = await auditRows(version.data.id);
    expect(event).toMatchObject({
      action: 'MANDATE_VERSION_CREATED',
      sourceIds: [w.source.id, annex.id],
      beforeRedacted: { mandateRowVersion: 1 },
    });
    expect(event?.afterRedacted).toMatchObject({
      version: 1,
      versionState: 'DRAFT',
      effectiveOn: '2025-03-03',
      additionalSourceRefs: { count: 1, sourceIds: [annex.id] },
      signedDatesRaw: { count: 1, sourceIds: [w.source.id] },
      mandateRowVersion: 2,
    });
    const audit = JSON.stringify(event);
    for (const marker of [
      'SYNTHETIC-CHANGE-REASON',
      'SYNTHETIC-ANNEX-SCOPE',
      'SYNTHETIC-RAW-DATE',
      'SYNTHETIC-VALIDITY-NOTE',
      'SYNTHETIC party',
    ]) {
      expect(audit).not.toContain(marker);
    }
    // Omitted terms stay unknown: no date is taken from the capture or today, no state upgraded.
    const minimal = await createVersion(w.mandate.data.id, { changeKind: 'DOCUMENT_CAPTURE' });
    expect(minimal.data).toMatchObject({
      version: 2,
      predecessorId: null,
      primarySourceId: null,
      additionalSourceRefs: null,
      documentState: 'UNKNOWN',
      sourceReviewState: 'UNREVIEWED',
      signedDatesRaw: null,
      validityModel: 'UNKNOWN',
      effectiveOn: null,
      expiresOn: null,
      validityNotes: null,
    });
  });

  it('the chain: numbers are max+1; a predecessor is a FROZEN version of the same mandate without a successor (no fork, no cycle)', async () => {
    const w = await world();
    const mandateId = w.mandate.data.id;
    const etag = async () => (await getMandate(mandateId)).etag;
    const v1 = await createVersion(mandateId);
    // A draft is edited, not succeeded.
    const onDraft = await postVersion(mandateId, await etag(), {
      changeKind: 'AMENDMENT',
      predecessorId: v1.data.id,
    });
    expect([onDraft.status, errorOf(onDraft)]).toEqual([
      409,
      {
        code: 'VERSION_NOT_FROZEN',
        details: { field: 'predecessorId', versionId: v1.data.id },
        message: expect.any(String),
        requestId: expect.any(String),
      },
    ]);
    await freeze(v1.data.id);
    t.clock.advance(1_000);
    const v2 = await createVersion(mandateId, {
      changeKind: 'AMENDMENT',
      predecessorId: v1.data.id,
    });
    expect(v2.data).toMatchObject({ version: 2, predecessorId: v1.data.id, versionState: 'DRAFT' });
    const fork = await postVersion(mandateId, await etag(), {
      changeKind: 'AMENDMENT',
      predecessorId: v1.data.id,
    });
    expect([fork.status, errorOf(fork).code, errorOf(fork).details]).toEqual([
      409,
      'VERSION_SUCCESSOR_EXISTS',
      { field: 'predecessorId', successorId: v2.data.id },
    ]);
    const other = await createMandate(w.agency.data.id, { label: 'SYNTHETIC other mandate' });
    const foreign = await createVersion(other.data.id);
    await freeze(foreign.data.id);
    const cross = await postVersion(mandateId, await etag(), { predecessorId: foreign.data.id });
    expect([cross.status, errorOf(cross).code, errorOf(cross).details]).toEqual([
      422,
      'AUTHORITY_SCOPE_UNRESOLVED',
      { field: 'predecessorId', reason: 'OTHER_MANDATE' },
    ]);
    const unknown = await postVersion(mandateId, await etag(), { predecessorId: randomUUID() });
    expect([unknown.status, errorOf(unknown).details]).toEqual([422, { field: 'predecessorId' }]);
    // An independent version continues the numbering; numbers are never reused or reordered.
    t.clock.advance(1_000);
    const v3 = await createVersion(mandateId, { changeKind: 'DOCUMENT_CAPTURE' });
    expect(v3.data).toMatchObject({ version: 3, predecessorId: null });
    // The pointer is fixed at creation, so no later edit can close a cycle.
    const repoint = await patchVersion(v2.data.id, (await getVersion(v2.data.id)).etag, {
      predecessorId: v3.data.id,
    });
    expect(outcome(repoint)).toEqual([422, 'VALIDATION_FAILED']);
    const history = await listOf<MandateVersion>(
      'listMandateVersions',
      `/mandates/${mandateId}/versions`,
    );
    expect(history.items.map((item) => [item.version, item.versionState])).toEqual([
      [3, 'DRAFT'],
      [2, 'DRAFT'],
      [1, 'FROZEN'],
    ]);
    // The earlier version is unchanged by its successor.
    expect((await getVersion(v1.data.id)).data).toMatchObject({
      versionState: 'FROZEN',
      rowVersion: 2,
    });
    expect((await getMandate(mandateId)).data.rowVersion).toBe(4);
  });

  it('concurrent creates on one Mandate ETag: exactly one version; concurrent successors of one predecessor: exactly one', async () => {
    const w = await world();
    const mandateId = w.mandate.data.id;
    const results = await Promise.all(
      ['A', 'B', 'C'].map((label) =>
        postVersion(mandateId, w.mandate.etag, { changeReason: `SYNTHETIC ${label}` }),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([201, 412, 412]);
    expect(await countRows(prisma, 'mandate_versions')).toBe(1);
    const [only] = (
      await listOf<MandateVersion>('listMandateVersions', `/mandates/${mandateId}/versions`)
    ).items;
    expect(only?.version).toBe(1);
    await freeze(only?.id ?? '');
    const mandate = await getMandate(mandateId);
    const successors = await Promise.all(
      ['A', 'B'].map((label) =>
        postVersion(mandateId, mandate.etag, {
          changeKind: 'AMENDMENT',
          predecessorId: only?.id,
          changeReason: `SYNTHETIC successor ${label}`,
        }),
      ),
    );
    expect(successors.map((result) => result.status).sort()).toEqual([201, 412]);
    expect(await prisma.mandateVersion.count({ where: { predecessorId: only?.id ?? '' } })).toBe(1);
  });

  it('patch: DRAFT only, contracted terms only; claims are checked against the merged terms; a no-op writes nothing', async () => {
    const w = await world();
    const version = await createVersion(w.mandate.data.id, {
      primarySourceId: w.source.id,
      documentState: 'DRAFT',
      effectiveOn: '2025-01-01',
    });
    const patched = versioned<MandateVersion>(
      await patchVersion(version.data.id, version.etag, {
        validityModel: 'UNTIL_TERMINATED',
        changeReason: 'SYNTHETIC corrected capture',
        validityNotes: 'SYNTHETIC-VALIDITY-NOTE',
      }),
      200,
    );
    expect(patched.data).toMatchObject({
      validityModel: 'UNTIL_TERMINATED',
      changeReason: 'SYNTHETIC corrected capture',
      documentState: 'DRAFT',
      effectiveOn: '2025-01-01',
      expiresOn: null,
      versionState: 'DRAFT',
      rowVersion: 2,
    });
    expect(
      affectedOf(
        await patchVersion(version.data.id, patched.etag, { validityModel: 'UNTIL_TERMINATED' }),
      ),
    ).toEqual([]);
    expect((await getVersion(version.data.id)).data.rowVersion).toBe(2);
    // Fixed at creation or owned by other operations.
    for (const body of [
      { changeKind: 'AMENDMENT' },
      { predecessorId: randomUUID() },
      { versionState: 'FROZEN' },
      { frozenAt: '2026-01-01T00:00:00.000Z' },
      { version: 7 },
      { mandateId: randomUUID() },
      {},
    ]) {
      const refused = await patchVersion(version.data.id, patched.etag, body);
      expect(outcome(refused), JSON.stringify(body)).toEqual([422, 'VALIDATION_FAILED']);
    }
    const unsupported = await patchVersion(version.data.id, patched.etag, {
      primarySourceId: null,
    });
    expect([unsupported.status, errorOf(unsupported).code, errorOf(unsupported).details]).toEqual([
      422,
      'DOCUMENT_STATE_UNSUPPORTED',
      { field: 'documentState' },
    ]);
    const inverted = await patchVersion(version.data.id, patched.etag, { expiresOn: '2024-12-31' });
    expect([inverted.status, errorOf(inverted).code, errorOf(inverted).details]).toEqual([
      422,
      'DATE_RANGE_INVALID',
      { fields: ['effectiveOn', 'expiresOn'] },
    ]);
    const both = versioned<MandateVersion>(
      await patchVersion(version.data.id, patched.etag, {
        primarySourceId: null,
        documentState: 'MISSING',
      }),
      200,
    );
    expect(both.data).toMatchObject({
      primarySourceId: null,
      documentState: 'MISSING',
      rowVersion: 3,
    });
    const [, , update] = await auditRows(version.data.id);
    expect(update).toMatchObject({ action: 'MANDATE_VERSION_UPDATED' });
    expect(JSON.stringify(await auditRows(version.data.id))).not.toContain(
      'SYNTHETIC-VALIDITY-NOTE',
    );
  });

  it('document and review claims: a document state needs its document; a review needs a cited source recording a review; CONFLICT and MISSING stay truthful', async () => {
    const w = await world();
    const agencyId = w.agency.data.id;
    const reviewed = await reviewedSource(agencyId);
    const plain = await createSource({ agencyId, title: 'SYNTHETIC unreviewed copy' });
    const annex = (sourceId: string) => [
      { sourceId, role: 'SYNTHETIC annex', scopeText: 'Synthetic' },
    ];
    const refusals: Array<[Record<string, unknown>, string, Record<string, unknown>]> = [
      [
        { documentState: 'SIGNED_APPEARING' },
        'DOCUMENT_STATE_UNSUPPORTED',
        { field: 'documentState' },
      ],
      [{ documentState: 'DRAFT' }, 'DOCUMENT_STATE_UNSUPPORTED', { field: 'documentState' }],
      [
        { sourceReviewState: 'REVIEWED_WITH_LIMITS' },
        'REVIEW_UNSUPPORTED',
        { field: 'sourceReviewState', reason: 'NO_REVIEWED_SOURCE' },
      ],
      [
        { sourceReviewState: 'REVIEWED_WITH_LIMITS', primarySourceId: plain.id },
        'REVIEW_UNSUPPORTED',
        { field: 'sourceReviewState', reason: 'NO_REVIEWED_SOURCE' },
      ],
      [
        {
          sourceReviewState: 'REVIEWED_WITH_LIMITS',
          signedDatesRaw: [
            { subjectLabel: 'SYNTHETIC', dateRaw: 'SYNTHETIC', sourceId: reviewed.id },
          ],
        },
        'REVIEW_UNSUPPORTED',
        { field: 'sourceReviewState', reason: 'NO_REVIEWED_SOURCE' },
      ],
    ];
    for (const [body, errorCode, details] of refusals) {
      const refused = await postVersion(
        w.mandate.data.id,
        (await getMandate(w.mandate.data.id)).etag,
        body,
      );
      expect(
        [refused.status, errorOf(refused).code, errorOf(refused).details],
        JSON.stringify(body),
      ).toEqual([422, errorCode, details]);
    }
    expect(await countRows(prisma, 'mandate_versions')).toBe(0);
    const missing = await createVersion(w.mandate.data.id, { documentState: 'MISSING' });
    expect(missing.data).toMatchObject({ documentState: 'MISSING', primarySourceId: null });
    const conflict = await createVersion(w.mandate.data.id, {
      sourceReviewState: 'CONFLICT',
      primarySourceId: plain.id,
      additionalSourceRefs: annex(reviewed.id),
      validityNotes: 'SYNTHETIC two copies disagree on the end date',
    });
    expect(conflict.data.sourceReviewState).toBe('CONFLICT');
    const limited = await createVersion(w.mandate.data.id, {
      sourceReviewState: 'REVIEWED_WITH_LIMITS',
      primarySourceId: plain.id,
      additionalSourceRefs: annex(reviewed.id),
    });
    expect(limited.data.sourceReviewState).toBe('REVIEWED_WITH_LIMITS');
    // Citing a reviewed source does not make the version reviewed: states are stored as given.
    const cites = await createVersion(w.mandate.data.id, { primarySourceId: reviewed.id });
    expect(cites.data).toMatchObject({ sourceReviewState: 'UNREVIEWED', documentState: 'UNKNOWN' });
    expect((await getSource(plain.id)).reportedProvenance).toBe('OPERATOR_REPORTED');
    expect((await getSource(reviewed.id)).reportedProvenance).toBe('DOCUMENT_REVIEWED');
  });

  it('dates: stored exactly as given; a start after its end is refused; dates the database cannot store are refused', async () => {
    const w = await world();
    const mandateId = w.mandate.data.id;
    const refusals: Array<[Record<string, unknown>, string]> = [
      [{ effectiveOn: '2026-02-30' }, 'VALIDATION_FAILED'],
      [{ effectiveOn: '2026-1-1' }, 'VALIDATION_FAILED'],
      [{ effectiveOn: '0999-12-31' }, 'VALIDATION_FAILED'],
      [{ effectiveOn: '2026-01-02', expiresOn: '2026-01-01' }, 'DATE_RANGE_INVALID'],
    ];
    for (const [body, errorCode] of refusals) {
      const refused = await postVersion(mandateId, (await getMandate(mandateId)).etag, body);
      expect(outcome(refused), JSON.stringify(body)).toEqual([422, errorCode]);
    }
    const oneDay = await createVersion(mandateId, {
      effectiveOn: '2028-02-29',
      expiresOn: '2028-02-29',
    });
    expect([oneDay.data.effectiveOn, oneDay.data.expiresOn]).toEqual(['2028-02-29', '2028-02-29']);
    // An end date without a start date keeps the start unknown; a start without an end is not "no end".
    const endOnly = await createVersion(mandateId, { expiresOn: '9999-12-31' });
    expect([endOnly.data.effectiveOn, endOnly.data.expiresOn]).toEqual([null, '9999-12-31']);
    const startOnly = await createVersion(mandateId, {
      effectiveOn: '1000-01-01',
      validityModel: 'FIXED_TERM',
    });
    expect([startOnly.data.effectiveOn, startOnly.data.expiresOn]).toEqual(['1000-01-01', null]);
    // The contract is silent on UNTIL_TERMINATED with an end date: recorded as given, not resolved.
    const ambiguous = await createVersion(mandateId, {
      validityModel: 'UNTIL_TERMINATED',
      expiresOn: '2030-06-30',
    });
    expect(ambiguous.data).toMatchObject({
      validityModel: 'UNTIL_TERMINATED',
      expiresOn: '2030-06-30',
    });
    expect((await getVersion(ambiguous.data.id)).data.expiresOn).toBe('2030-06-30');
  });

  it('version citations apply to the mandate’s agency only; unknown, other-agency and case-scoped sources are refused per field', async () => {
    const w = await world();
    const other = await createAgency('Other');
    const agencyId = w.agency.data.id;
    const shared = await createSource({
      title: 'SYNTHETIC shared registry',
      scopeBindings: { agencyIds: [agencyId] },
    });
    const caseScoped = await insertSource(prisma, client.session.userId, {
      scopeBindings: { caseIds: [randomUUID()], agencyIds: [agencyId] },
    });
    const otherSource = await createSource({ agencyId: other.data.id });
    const annex = (sourceId: string) => ({ sourceId, role: 'SYNTHETIC', scopeText: 'Synthetic' });
    const refusals: Array<[Record<string, unknown>, string, Record<string, unknown>]> = [
      [{ primarySourceId: otherSource.id }, 'CROSS_AGENCY_REFERENCE', { field: 'primarySourceId' }],
      [
        { primarySourceId: (await createSource()).id },
        'SOURCE_SCOPE_UNRESOLVED',
        { field: 'primarySourceId', reason: 'NOT_SCOPED_TO_AGENCY' },
      ],
      [
        { primarySourceId: caseScoped },
        'SOURCE_SCOPE_UNRESOLVED',
        { field: 'primarySourceId', reason: 'CASE_SCOPED_SOURCE' },
      ],
      [
        { additionalSourceRefs: [annex(w.source.id), annex(randomUUID())] },
        'REFERENCE_NOT_FOUND',
        { field: 'additionalSourceRefs.1.sourceId' },
      ],
      [
        {
          signedDatesRaw: [
            { subjectLabel: 'SYNTHETIC', dateRaw: 'SYNTHETIC', sourceId: otherSource.id },
          ],
        },
        'CROSS_AGENCY_REFERENCE',
        { field: 'signedDatesRaw.0.sourceId' },
      ],
    ];
    for (const [body, errorCode, details] of refusals) {
      const refused = await postVersion(
        w.mandate.data.id,
        (await getMandate(w.mandate.data.id)).etag,
        body,
      );
      expect(
        [refused.status, errorOf(refused).code, errorOf(refused).details],
        JSON.stringify(body),
      ).toEqual([422, errorCode, details]);
    }
    const accepted = await createVersion(w.mandate.data.id, {
      primarySourceId: shared.id,
      additionalSourceRefs: [annex(w.source.id)],
    });
    expect(accepted.data.primarySourceId).toBe(shared.id);
    const patchRefused = await patchVersion(accepted.data.id, accepted.etag, {
      primarySourceId: otherSource.id,
    });
    expect(outcome(patchRefused)).toEqual([422, 'CROSS_AGENCY_REFERENCE']);
    expect(await countRows(prisma, 'mandate_versions')).toBe(1);
  });

  it('pinning: versions and coverages keep the exact revision they cite; revising a source repoints nothing and records nothing', async () => {
    const c = await chain('A', { frozen: true });
    const agencyId = c.agency.data.id;
    const before = await versionsOf({
      mandate: c.mandate.data.id,
      version: c.version.data.id,
      coverage: c.coverage.data.id,
      coverageSigner: c.coverageSigner.data.id,
    });
    const revision = immutable<SourceReference>(
      await reviseSource(c.source.id, { agencyId, title: 'SYNTHETIC agreement (rev 2)' }),
      201,
    );
    expect(revision.supersedesSourceId).toBe(c.source.id);
    expect((await getVersion(c.version.data.id)).data.primarySourceId).toBe(c.source.id);
    expect((await getCoverage(c.coverage.data.id)).data.basisSourceId).toBe(c.source.id);
    expect((await getCoverageSigner(c.coverageSigner.data.id)).data.sourceId).toBe(c.source.id);
    expect(
      await versionsOf({
        mandate: c.mandate.data.id,
        version: c.version.data.id,
        coverage: c.coverage.data.id,
        coverageSigner: c.coverageSigner.data.id,
      }),
    ).toEqual(before);
    // A frozen version cannot be repointed; adopting the revision needs a new version.
    const repoint = await patchVersion(c.version.data.id, c.version.etag, {
      primarySourceId: revision.id,
    });
    expect(outcome(repoint)).toEqual([409, 'FROZEN_VERSION']);
    const successor = await createVersion(c.mandate.data.id, {
      changeKind: 'DOCUMENT_CAPTURE',
      predecessorId: c.version.data.id,
      primarySourceId: revision.id,
      documentState: 'SIGNED_APPEARING',
    });
    expect(successor.data.primarySourceId).toBe(revision.id);
    // Pinning, not currency: a draft may deliberately cite the earlier revision.
    const earlier = versioned<MandateVersion>(
      await patchVersion(successor.data.id, successor.etag, { primarySourceId: c.source.id }),
      200,
    );
    expect(earlier.data.primarySourceId).toBe(c.source.id);
    expect(await countRows(prisma, 'authority_events')).toBe(0);
    expect((await getSource(revision.id)).reportedProvenance).toBe('OPERATOR_REPORTED');
  });

  it('list and get: per mandate, by number, id or change-reason words; unknown mandates and versions are 404', async () => {
    const w = await world();
    const v1 = await createVersion(w.mandate.data.id, { changeReason: 'SYNTHETIC Bản gốc' });
    await freeze(v1.data.id);
    t.clock.advance(1_000);
    const v2 = await createVersion(w.mandate.data.id, {
      changeKind: 'AMENDMENT',
      predecessorId: v1.data.id,
      changeReason: 'SYNTHETIC amendment',
    });
    const path = `/mandates/${w.mandate.data.id}/versions`;
    const ids = async (query: string) =>
      (await listOf<MandateVersion>('listMandateVersions', `${path}${query}`)).items.map(
        (item) => item.id,
      );
    expect(await ids('')).toEqual([v2.data.id, v1.data.id]);
    expect(await ids('?q=1')).toEqual([v1.data.id]);
    expect(await ids(`?q=${encodeURIComponent('ban goc')}`)).toEqual([v1.data.id]);
    expect(await ids(`?q=${v1.data.id}`)).toEqual([v2.data.id, v1.data.id]);
    const page = await listOf<MandateVersion>('listMandateVersions', `${path}?limit=1`);
    const next = await listOf<MandateVersion>(
      'listMandateVersions',
      `${path}?limit=1&cursor=${encodeURIComponent(page.nextCursor ?? '')}`,
    );
    expect([...page.items, ...next.items].map((item) => item.id)).toEqual([v2.data.id, v1.data.id]);
    const other = await createMandate(w.agency.data.id, { label: 'SYNTHETIC other' });
    const crossCursor = await client.get(
      'listMandateVersions',
      `/mandates/${other.data.id}/versions?cursor=${encodeURIComponent(page.nextCursor ?? '')}`,
    );
    expect(outcome(crossCursor)).toEqual([400, 'INVALID_CURSOR']);
    const got = await getVersion(v1.data.id);
    expect(got.etag).toBe(`"MandateVersion:${v1.data.id}:v2"`);
    for (const [operationId, path404] of [
      ['listMandateVersions', `/mandates/${randomUUID()}/versions`],
      ['getMandateVersion', `/mandate-versions/${randomUUID()}`],
    ] as const) {
      expect(outcome(await client.get(operationId, path404))).toEqual([404, 'NOT_FOUND']);
    }
  });
});

describe('FREEZE — the system record becomes immutable; not a signature, approval, G1 or currentness', () => {
  it('freeze: DRAFT → FROZEN once, with a reason; the children are frozen through it; nothing else is created or changed', async () => {
    const c = await chain();
    t.clock.advance(60_000);
    const before = await versionsOf({
      mandate: c.mandate.data.id,
      coverage: c.coverage.data.id,
      coverageSigner: c.coverageSigner.data.id,
      route: c.route.data.id,
    });
    const result = await freezeVersion(c.version.data.id, c.version.etag);
    const frozen = versioned<MandateVersion>(result, 200);
    expect(frozen.data).toEqual({
      ...c.version.data,
      versionState: 'FROZEN',
      frozenAt: nowIso(),
      updatedAt: nowIso(),
      rowVersion: c.version.data.rowVersion + 1,
    });
    expect(frozen.etag).toBe(
      `"MandateVersion:${c.version.data.id}:v${c.version.data.rowVersion + 1}"`,
    );
    expect(affectedOf(result)).toEqual([
      { type: 'MandateVersion', id: c.version.data.id, rowVersion: c.version.data.rowVersion + 1 },
    ]);
    expect(
      await versionsOf({
        mandate: c.mandate.data.id,
        coverage: c.coverage.data.id,
        coverageSigner: c.coverageSigner.data.id,
        route: c.route.data.id,
      }),
    ).toEqual(before);
    const [event] = (await auditRows(c.version.data.id)).filter(
      (row) => row.action === 'MANDATE_VERSION_FROZEN',
    );
    expect(event).toMatchObject({
      reason: FREEZE.reason,
      sourceIds: [c.source.id],
      beforeRedacted: { versionState: 'DRAFT', rowVersion: c.version.data.rowVersion },
      afterRedacted: {
        versionState: 'FROZEN',
        frozenAt: nowIso(),
        rowVersion: c.version.data.rowVersion + 1,
        coverages: 1,
        coverageSigners: 1,
      },
    });
    // Freezing records no event, selects nothing for a case, changes no signer or source.
    expect(await countRows(prisma, 'authority_events')).toBe(0);
    await expectNoCaseRecords();
    expect((await getSigner(c.signer.data.id)).data).toEqual(c.signer.data);
    expect((await getSource(c.source.id)).reportedProvenance).toBe('OPERATOR_REPORTED');
    expect((await getRoute(c.route.data.id)).data.preferredCoverageId).toBeNull();
  });

  it('a frozen version never changes: its terms, coverages and coverage signers are refused with FROZEN_VERSION; there is no unfreeze', async () => {
    const c = await chain('A', { frozen: true });
    const before = await versionsOf({
      mandate: c.mandate.data.id,
      version: c.version.data.id,
      coverage: c.coverage.data.id,
      coverageSigner: c.coverageSigner.data.id,
    });
    const attempts: Array<[string, HttpResult]> = [
      [
        'patch version',
        await patchVersion(c.version.data.id, c.version.etag, { validityNotes: 'x' }),
      ],
      ['freeze again', await freezeVersion(c.version.data.id, c.version.etag)],
      [
        'create coverage',
        await postCoverage(c.version.data.id, c.version.etag, {
          routeId: c.route.data.id,
          coverageLabel: 'SYNTHETIC late coverage',
        }),
      ],
      [
        'patch coverage',
        await patchCoverage(c.coverage.data.id, c.coverage.etag, { territorialScope: 'x' }),
      ],
      [
        'add coverage signer',
        await postCoverageSigner(c.coverage.data.id, c.coverage.etag, {
          signerId: c.signer.data.id,
          capacity: 'SYNTHETIC second capacity',
        }),
      ],
      [
        'remove coverage signer',
        await deleteCoverageSigner(c.coverageSigner.data.id, c.coverageSigner.etag),
      ],
    ];
    for (const [label, refused] of attempts) {
      expect(
        [refused.status, errorOf(refused).code, errorOf(refused).details['versionId']],
        label,
      ).toEqual([409, 'FROZEN_VERSION', c.version.data.id]);
    }
    expect(
      await versionsOf({
        mandate: c.mandate.data.id,
        version: c.version.data.id,
        coverage: c.coverage.data.id,
        coverageSigner: c.coverageSigner.data.id,
      }),
    ).toEqual(before);
    expect(await countRows(prisma, 'mandate_coverages')).toBe(1);
    expect(await countRows(prisma, 'coverage_signers')).toBe(1);
    // No unfreeze, state edit, approval or deletion of history is routed.
    for (const [method, path] of [
      ['POST', `/mandate-versions/${c.version.data.id}/unfreeze`],
      ['POST', `/mandate-versions/${c.version.data.id}/approve`],
      ['POST', `/mandate-versions/${c.version.data.id}/state`],
      ['DELETE', `/mandate-versions/${c.version.data.id}`],
      ['DELETE', `/coverages/${c.coverage.data.id}`],
      ['POST', `/coverage-signers/${c.coverageSigner.data.id}/sign`],
    ] as const) {
      const result = await unrouted(method, path);
      expect([result.status, code(result)], `${method} ${path}`).toEqual([404, 'NOT_FOUND']);
    }
  });

  it('two concurrent freezes with one ETag: exactly one transition, one audit event, rowVersion +1 once; a later freeze is FROZEN_VERSION', async () => {
    const c = await chain();
    const results = await Promise.all([
      freezeVersion(c.version.data.id, c.version.etag),
      freezeVersion(c.version.data.id, c.version.etag),
      freezeVersion(c.version.data.id, c.version.etag),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 412, 412]);
    for (const refused of results.filter((result) => result.status === 412)) {
      expect(code(refused)).toBe('RECORD_VERSION_CONFLICT');
    }
    const after = await getVersion(c.version.data.id);
    expect(after.data).toMatchObject({
      versionState: 'FROZEN',
      rowVersion: c.version.data.rowVersion + 1,
    });
    expect(await auditCount('MANDATE_VERSION_FROZEN', c.version.data.id)).toBe(1);
    const again = await freezeVersion(c.version.data.id, after.etag);
    expect(outcome(again)).toEqual([409, 'FROZEN_VERSION']);
    expect((await getVersion(c.version.data.id)).data.rowVersion).toBe(after.data.rowVersion);
  });

  it('AC-017: a child edit racing a freeze serializes on the version — one wins, the other is refused; a frozen version never gains or changes a child', async () => {
    for (let round = 0; round < 3; round += 1) {
      const c = await chain(`R${round}`);
      const [frozen, added] = await Promise.all([
        freezeVersion(c.version.data.id, c.version.etag),
        postCoverage(c.version.data.id, c.version.etag, {
          routeId: c.route.data.id,
          coverageLabel: 'SYNTHETIC racing coverage',
        }),
      ]);
      const statuses = [frozen.status, added.status];
      expect(
        statuses.filter((status) => status === 412),
        JSON.stringify(statuses),
      ).toHaveLength(1);
      const version = await getVersion(c.version.data.id);
      const coverages = await prisma.mandateCoverage.count({
        where: { mandateVersionId: c.version.data.id },
      });
      if (frozen.status === 200) {
        expect([version.data.versionState, coverages]).toEqual(['FROZEN', 1]);
      } else {
        expect([version.data.versionState, coverages]).toEqual(['DRAFT', 2]);
      }
      const [froze, patched] = await Promise.all([
        freezeVersion(version.data.id, version.etag),
        patchCoverage(c.coverage.data.id, c.coverage.etag, { territorialScope: 'SYNTHETIC late' }),
      ]);
      const coverage = await getCoverage(c.coverage.data.id);
      const finalVersion = await getVersion(c.version.data.id);
      if (patched.status === 200) {
        // The edit came first: the freeze saw a moved version ETag (or the version was frozen before).
        expect(froze.status === 412 || froze.status === 409, String(froze.status)).toBe(true);
        expect(coverage.data.territorialScope).toBe('SYNTHETIC late');
      } else {
        expect(code(patched)).toBe('FROZEN_VERSION');
        expect(finalVersion.data.versionState).toBe('FROZEN');
        expect(coverage.data.territorialScope).toBeNull();
      }
    }
  });

  it('freeze re-validates the structure under its locks: rows changed outside the API, archived parents and agencies block it', async () => {
    const c = await chain();
    const other = await createAgency('Other');
    const otherSource = await createSource({ agencyId: other.data.id });
    const refuse = async (errorCode: string, details: Record<string, unknown>) => {
      const version = await getVersion(c.version.data.id);
      const refused = await freezeVersion(version.data.id, version.etag);
      expect([refused.status, errorOf(refused).code]).toEqual([
        errorCode === 'RECORD_STATE_CONFLICT' ? 409 : 422,
        errorCode,
      ]);
      expect(errorOf(refused).details).toMatchObject(details);
      expect((await getVersion(c.version.data.id)).data).toMatchObject({
        versionState: 'DRAFT',
        rowVersion: version.data.rowVersion,
      });
    };
    // Synthetic direct writes stand in for rows that bypassed the API's checks.
    await prisma.mandateCoverage.update({
      where: { id: c.coverage.data.id },
      data: { basisSourceId: otherSource.id },
    });
    await refuse('CROSS_AGENCY_REFERENCE', {
      field: `coverages.${c.coverage.data.id}.basisSourceId`,
    });
    await prisma.mandateCoverage.update({
      where: { id: c.coverage.data.id },
      data: {
        basisSourceId: c.source.id,
        effectiveOn: new Date('2026-02-01T00:00:00.000Z'),
        expiresOn: new Date('2026-01-31T00:00:00.000Z'),
      },
    });
    await refuse('DATE_RANGE_INVALID', {
      fields: ['effectiveOn', 'expiresOn'],
      coverageId: c.coverage.data.id,
    });
    await prisma.mandateCoverage.update({
      where: { id: c.coverage.data.id },
      data: { effectiveOn: null, expiresOn: null },
    });
    await prisma.coverageSigner.update({
      where: { id: c.coverageSigner.data.id },
      data: { sourceId: otherSource.id },
    });
    await refuse('CROSS_AGENCY_REFERENCE', {
      field: `coverageSigners.${c.coverageSigner.data.id}.sourceId`,
    });
    await prisma.coverageSigner.update({
      where: { id: c.coverageSigner.data.id },
      data: { sourceId: c.source.id },
    });
    await prisma.mandateVersion.update({
      where: { id: c.version.data.id },
      data: { primarySourceId: null },
    });
    await refuse('DOCUMENT_STATE_UNSUPPORTED', { field: 'documentState' });
    await prisma.mandateVersion.update({
      where: { id: c.version.data.id },
      data: { primarySourceId: c.source.id },
    });
    const agency = await getAgency(c.agency.data.id);
    versioned(await archive('archiveAgency', `/agencies/${agency.data.id}`, agency.etag), 200);
    await refuse('RECORD_STATE_CONFLICT', { record: 'Agency', state: 'ARCHIVED' });
    expect(await auditCount('MANDATE_VERSION_FROZEN')).toBe(0);
  });

  it('a truthful incomplete draft can be frozen: nothing beyond the contract is required and freezing asserts nothing', async () => {
    const w = await world();
    const version = await createVersion(w.mandate.data.id, { documentState: 'MISSING' });
    const frozen = versioned<MandateVersion>(
      await freezeVersion(version.data.id, version.etag),
      200,
    );
    expect(frozen.data).toMatchObject({
      versionState: 'FROZEN',
      primarySourceId: null,
      documentState: 'MISSING',
      sourceReviewState: 'UNREVIEWED',
      validityModel: 'UNKNOWN',
      effectiveOn: null,
      expiresOn: null,
    });
    expect(await countRows(prisma, 'mandate_coverages')).toBe(0);
    expect(await countRows(prisma, 'authority_events')).toBe(0);
    expect((await getMandate(w.mandate.data.id)).data.rowVersion).toBe(2);
    const noReason = await freezeVersion(version.data.id, frozen.etag, {});
    expect(outcome(noReason)).toEqual([422, 'VALIDATION_FAILED']);
    const missing = await freezeVersion(randomUUID(), frozen.etag);
    expect(outcome(missing)).toEqual([404, 'NOT_FOUND']);
  });
});

describe('COVERAGES — explicit scope over one exact route; not G1', () => {
  it('create: one exact route of the version’s agency, stored exactly as supplied; the version moves on; nothing derived', async () => {
    const w = await world();
    // The route's default signer is not a coverage signer; nothing is derived from the route.
    const route = await getRoute(w.route.data.id);
    const withDefault = versioned<Route>(
      await patchRoute(route.data.id, route.etag, { defaultSignerId: w.signer.data.id }),
      200,
    );
    const version = await createVersion(w.mandate.data.id);
    const result = await postCoverage(version.data.id, version.etag, {
      routeId: w.route.data.id,
      coverageLabel: 'SYNTHETIC YouTube channel coverage',
      coveredWorksScope: 'SYNTHETIC-WORKS-SCOPE catalogue 2025',
      territorialScope: 'SYNTHETIC-TERRITORY',
      actionScope: ['SUBMIT_NOTICE', 'PREPARE_NOTICE'],
      exclusions: 'SYNTHETIC-EXCLUSIONS',
      conditions: 'SYNTHETIC-CONDITIONS',
      exclusivity: 'NON_EXCLUSIVE',
      effectiveOn: '2025-01-01',
      expiresOn: '2025-12-31',
      basisSourceId: w.source.id,
    });
    const coverage = versioned<MandateCoverage>(result, 201);
    expect(coverage.data).toEqual({
      id: coverage.data.id,
      mandateVersionId: version.data.id,
      routeId: w.route.data.id,
      agencyId: w.agency.data.id,
      coverageLabel: 'SYNTHETIC YouTube channel coverage',
      coveredWorksScope: 'SYNTHETIC-WORKS-SCOPE catalogue 2025',
      territorialScope: 'SYNTHETIC-TERRITORY',
      actionScope: ['SUBMIT_NOTICE', 'PREPARE_NOTICE'],
      exclusions: 'SYNTHETIC-EXCLUSIONS',
      conditions: 'SYNTHETIC-CONDITIONS',
      exclusivity: 'NON_EXCLUSIVE',
      effectiveOn: '2025-01-01',
      expiresOn: '2025-12-31',
      basisSourceId: w.source.id,
      predecessorCoverageId: null,
      createdAt: nowIso(),
      createdById: client.session.userId,
      updatedAt: nowIso(),
      updatedById: client.session.userId,
      rowVersion: 1,
    });
    expect(coverage.etag).toBe(`"MandateCoverage:${coverage.data.id}:v1"`);
    expect(affectedOf(result)).toEqual([
      { type: 'MandateVersion', id: version.data.id, rowVersion: 2 },
      { type: 'MandateCoverage', id: coverage.data.id, rowVersion: 1 },
    ]);
    expect((await getVersion(version.data.id)).data.rowVersion).toBe(2);
    expect(await countRows(prisma, 'coverage_signers')).toBe(0);
    expect((await getRoute(w.route.data.id)).data).toEqual(withDefault.data);
    await expectNoCaseRecords();
    const [event] = await auditRows(coverage.data.id);
    expect(event).toMatchObject({
      action: 'MANDATE_COVERAGE_CREATED',
      sourceIds: [w.source.id],
      beforeRedacted: { versionRowVersion: 1 },
      afterRedacted: {
        routeId: w.route.data.id,
        actionScope: ['SUBMIT_NOTICE', 'PREPARE_NOTICE'],
        effectiveOn: '2025-01-01',
        versionRowVersion: 2,
      },
    });
    const audit = JSON.stringify(event);
    for (const marker of [
      'SYNTHETIC-WORKS-SCOPE',
      'SYNTHETIC-TERRITORY',
      'SYNTHETIC-EXCLUSIONS',
      'SYNTHETIC-CONDITIONS',
    ]) {
      expect(audit).not.toContain(marker);
    }
    // Omitted scope stays unknown.
    const minimal = await createCoverage(version.data.id, {
      routeId: w.route.data.id,
      coverageLabel: 'SYNTHETIC minimal',
    });
    expect(minimal.data).toMatchObject({
      coveredWorksScope: null,
      territorialScope: null,
      actionScope: null,
      exclusivity: 'UNKNOWN',
      effectiveOn: null,
      expiresOn: null,
      basisSourceId: null,
    });
  });

  it('create refuses another agency’s route, unknown references, unsupported fields, inverted dates and duplicate labels', async () => {
    const a = await world('A');
    const b = await world('B');
    const version = await createVersion(a.mandate.data.id);
    const etag = async () => (await getVersion(version.data.id)).etag;
    const routeId = a.route.data.id;
    const refusals: Array<[Record<string, unknown>, number, string, Record<string, unknown>?]> = [
      [{ routeId: b.route.data.id }, 422, 'CROSS_AGENCY_REFERENCE', { field: 'routeId' }],
      [{ routeId: randomUUID() }, 422, 'REFERENCE_NOT_FOUND', { field: 'routeId' }],
      [
        { routeId, effectiveOn: '2025-02-01', expiresOn: '2025-01-31' },
        422,
        'DATE_RANGE_INVALID',
        { fields: ['effectiveOn', 'expiresOn'] },
      ],
      [{ routeId, actionScope: ['SIGN_ALL'] }, 422, 'VALIDATION_FAILED'],
      [{ routeId, platform: 'YOUTUBE' }, 422, 'VALIDATION_FAILED'],
      [{ routeId, ownerId: a.owner.data.id }, 422, 'VALIDATION_FAILED'],
      [{ routeId, routeIds: [b.route.data.id] }, 422, 'VALIDATION_FAILED'],
      [{ routeId, status: 'G1_PASS' }, 422, 'VALIDATION_FAILED'],
      [
        { routeId, basisSourceId: b.source.id },
        422,
        'CROSS_AGENCY_REFERENCE',
        { field: 'basisSourceId' },
      ],
      [
        { routeId, basisSourceId: randomUUID() },
        422,
        'REFERENCE_NOT_FOUND',
        { field: 'basisSourceId' },
      ],
      [
        { routeId, predecessorCoverageId: randomUUID() },
        422,
        'REFERENCE_NOT_FOUND',
        { field: 'predecessorCoverageId' },
      ],
    ];
    for (const [body, status, errorCode, details] of refusals) {
      const refused = await postCoverage(version.data.id, await etag(), body);
      expect(outcome(refused), JSON.stringify(body)).toEqual([status, errorCode]);
      if (details) expect(errorOf(refused).details).toEqual(details);
    }
    expect((await getVersion(version.data.id)).data.rowVersion).toBe(1);
    const first = await createCoverage(version.data.id, {
      routeId,
      coverageLabel: 'SYNTHETIC dup',
    });
    const duplicate = await postCoverage(version.data.id, await etag(), {
      routeId,
      coverageLabel: 'SYNTHETIC dup',
    });
    expect([duplicate.status, errorOf(duplicate).code, errorOf(duplicate).details]).toEqual([
      409,
      'DUPLICATE_COVERAGE',
      { coverageId: first.data.id },
    ]);
    // The same label over another route of the agency is a different coverage.
    const second = await anotherRoute(a.agency.data.id, 'Second');
    await createCoverage(version.data.id, {
      routeId: second.route.data.id,
      coverageLabel: 'SYNTHETIC dup',
    });
    expect(await countRows(prisma, 'mandate_coverages')).toBe(2);
    const missing = await postCoverage(randomUUID(), await etag(), { routeId });
    expect(outcome(missing)).toEqual([404, 'NOT_FOUND']);
  });

  it('archived routes, owners and legal subjects are refused; a paused route still records what a document covers', async () => {
    const w = await world();
    const version = await createVersion(w.mandate.data.id);
    const etag = async () => (await getVersion(version.data.id)).etag;
    const paused = await anotherRoute(w.agency.data.id, 'Paused');
    versioned(
      await client.write(
        'setRouteLinkState',
        'POST',
        `/routes/${paused.route.data.id}/link-state`,
        { state: 'PAUSED', reason: 'SYNTHETIC pause' },
        { ifMatch: paused.route.etag },
      ),
      200,
    );
    await createCoverage(version.data.id, { routeId: paused.route.data.id });
    const archivedRoute = await anotherRoute(w.agency.data.id, 'ArchivedRoute');
    versioned(
      await archive(
        'archiveRoute',
        `/routes/${archivedRoute.route.data.id}`,
        archivedRoute.route.etag,
      ),
      200,
    );
    const archivedOwner = await anotherRoute(w.agency.data.id, 'ArchivedOwner');
    versioned(
      await archive(
        'archiveOwner',
        `/owners/${archivedOwner.owner.data.id}`,
        (await getOwner(archivedOwner.owner.data.id)).etag,
      ),
      200,
    );
    const archivedSubject = await anotherRoute(w.agency.data.id, 'ArchivedSubject');
    versioned(
      await archive(
        'archiveLegalSubject',
        `/legal-subjects/${archivedSubject.subject.data.id}`,
        (await getSubject(archivedSubject.subject.data.id)).etag,
      ),
      200,
    );
    for (const [record, routeId] of [
      ['Route', archivedRoute.route.data.id],
      ['Owner', archivedOwner.route.data.id],
      ['LegalSubject', archivedSubject.route.data.id],
    ] as const) {
      const refused = await postCoverage(version.data.id, await etag(), { routeId });
      expect([refused.status, errorOf(refused).code, errorOf(refused).details], record).toEqual([
        409,
        'RECORD_STATE_CONFLICT',
        { record, archived: true, operation: 'createCoverage', field: 'routeId' },
      ]);
    }
    expect(await countRows(prisma, 'mandate_coverages')).toBe(1);
  });

  it('the basis source must apply to the route: agency, subject and owner material; case scope applies to nothing', async () => {
    const w = await world();
    const agencyId = w.agency.data.id;
    const y = await anotherRoute(agencyId, 'Y');
    const version = await createVersion(w.mandate.data.id);
    const etag = async () => (await getVersion(version.data.id)).etag;
    const other = await createAgency('Other');
    // Owner Y's material: the canonical source of Y's route.
    const yMaterial = await createSource({ agencyId, title: 'SYNTHETIC Y route registry' });
    versioned(
      await client.write(
        'bindCanonicalRoute',
        'POST',
        `/routes/${y.route.data.id}/canonical-bindings`,
        { canonicalCode: 'SYN-Y-ROUTE', sourceId: yMaterial.id, reason: 'synthetic' },
        { ifMatch: y.route.etag },
      ),
      200,
    );
    const caseScoped = await insertSource(prisma, client.session.userId, {
      agencyId,
      scopeBindings: { caseIds: [randomUUID()] },
    });
    const refusals: Array<[string, string, Record<string, unknown>]> = [
      [(await createSource({ agencyId: other.data.id })).id, 'CROSS_AGENCY_REFERENCE', {}],
      [(await createSource()).id, 'SOURCE_SCOPE_UNRESOLVED', { reason: 'NOT_SCOPED_TO_AGENCY' }],
      [
        (
          await createSource({
            scopeBindings: { agencyIds: [agencyId], legalSubjectIds: [y.subject.data.id] },
          })
        ).id,
        'SOURCE_SCOPE_UNRESOLVED',
        { reason: 'SCOPED_TO_OTHER_SUBJECT' },
      ],
      [caseScoped, 'SOURCE_SCOPE_UNRESOLVED', { reason: 'CASE_SCOPED_SOURCE' }],
      [yMaterial.id, 'CROSS_OWNER_REFERENCE', { ownerId: y.owner.data.id }],
    ];
    for (const [basisSourceId, errorCode, details] of refusals) {
      const refused = await postCoverage(version.data.id, await etag(), {
        routeId: w.route.data.id,
        basisSourceId,
      });
      expect(outcome(refused), errorCode).toEqual([422, errorCode]);
      expect(errorOf(refused).details).toMatchObject({ field: 'basisSourceId', ...details });
    }
    const subjectSource = await createSource({
      scopeBindings: { agencyIds: [agencyId], legalSubjectIds: [w.subject.data.id] },
    });
    const accepted = await createCoverage(version.data.id, {
      routeId: w.route.data.id,
      basisSourceId: subjectSource.id,
    });
    expect(accepted.data.basisSourceId).toBe(subjectSource.id);
  });

  it('predecessorCoverageId is lineage within one mandate and one route, from a frozen version; it inherits nothing', async () => {
    const w = await world();
    const second = await anotherRoute(w.agency.data.id, 'Second');
    const v1 = await createVersion(w.mandate.data.id);
    const c1 = await createCoverage(v1.data.id, {
      routeId: w.route.data.id,
      territorialScope: 'SYNTHETIC territory of v1',
      actionScope: ['PREPARE_NOTICE'],
      basisSourceId: w.source.id,
    });
    const c1b = await createCoverage(v1.data.id, { routeId: second.route.data.id });
    await freeze(v1.data.id);
    const foreignMandate = await createMandate(w.agency.data.id, { label: 'SYNTHETIC other' });
    const fv = await createVersion(foreignMandate.data.id);
    const foreign = await createCoverage(fv.data.id, { routeId: w.route.data.id });
    await freeze(fv.data.id);
    const v2 = await createVersion(w.mandate.data.id, {
      changeKind: 'AMENDMENT',
      predecessorId: v1.data.id,
    });
    const c2 = await createCoverage(v2.data.id, {
      routeId: w.route.data.id,
      predecessorCoverageId: c1.data.id,
    });
    expect(c2.data).toMatchObject({
      predecessorCoverageId: c1.data.id,
      territorialScope: null,
      actionScope: null,
      basisSourceId: null,
    });
    const etag = async () => (await getVersion(v2.data.id)).etag;
    const refusals: Array<[string, number, string, Record<string, unknown>]> = [
      [c1b.data.id, 422, 'AUTHORITY_SCOPE_UNRESOLVED', { reason: 'OTHER_ROUTE' }],
      [foreign.data.id, 422, 'AUTHORITY_SCOPE_UNRESOLVED', { reason: 'OTHER_MANDATE' }],
      [c2.data.id, 409, 'VERSION_NOT_FROZEN', { versionId: v2.data.id }],
    ];
    for (const [predecessorCoverageId, status, errorCode, details] of refusals) {
      const refused = await postCoverage(v2.data.id, await etag(), {
        routeId: w.route.data.id,
        coverageLabel: `SYNTHETIC lineage ${predecessorCoverageId.slice(0, 8)}`,
        predecessorCoverageId,
      });
      expect(outcome(refused), errorCode).toEqual([status, errorCode]);
      expect(errorOf(refused).details).toMatchObject({
        field: 'predecessorCoverageId',
        ...details,
      });
    }
    const current = await getCoverage(c2.data.id);
    for (const body of [
      { predecessorCoverageId: null },
      { routeId: second.route.data.id },
      { mandateVersionId: v1.data.id },
      { agencyId: randomUUID() },
    ]) {
      const refused = await patchCoverage(c2.data.id, current.etag, body);
      expect(outcome(refused), JSON.stringify(body)).toEqual([422, 'VALIDATION_FAILED']);
    }
    // The predecessor is unchanged by its successor.
    expect((await getCoverage(c1.data.id)).data).toEqual(c1.data);
  });

  it('patch: draft parent only; dates checked against stored values; labels unique per route and version; the version moves on', async () => {
    const w = await world();
    const other = await createAgency('Other');
    const version = await createVersion(w.mandate.data.id);
    const coverage = await createCoverage(version.data.id, {
      routeId: w.route.data.id,
      effectiveOn: '2026-01-01',
    });
    const sibling = await createCoverage(version.data.id, {
      routeId: w.route.data.id,
      coverageLabel: 'SYNTHETIC sibling',
    });
    const versionBefore = await getVersion(version.data.id);
    const result = await patchCoverage(coverage.data.id, coverage.etag, {
      territorialScope: 'SYNTHETIC-TERRITORY-NEW',
      expiresOn: '2026-06-30',
      exclusivity: 'EXCLUSIVE',
    });
    const patched = versioned<MandateCoverage>(result, 200);
    expect(patched.data).toMatchObject({
      territorialScope: 'SYNTHETIC-TERRITORY-NEW',
      effectiveOn: '2026-01-01',
      expiresOn: '2026-06-30',
      exclusivity: 'EXCLUSIVE',
      rowVersion: 2,
    });
    expect(affectedOf(result)).toEqual([
      {
        type: 'MandateVersion',
        id: version.data.id,
        rowVersion: versionBefore.data.rowVersion + 1,
      },
      { type: 'MandateCoverage', id: coverage.data.id, rowVersion: 2 },
    ]);
    const noop = await patchCoverage(coverage.data.id, patched.etag, { exclusivity: 'EXCLUSIVE' });
    expect([noop.status, affectedOf(noop)]).toEqual([200, []]);
    expect((await getVersion(version.data.id)).data.rowVersion).toBe(
      versionBefore.data.rowVersion + 1,
    );
    const inverted = await patchCoverage(coverage.data.id, patched.etag, {
      expiresOn: '2025-12-31',
    });
    expect(outcome(inverted)).toEqual([422, 'DATE_RANGE_INVALID']);
    const relabel = await patchCoverage(coverage.data.id, patched.etag, {
      coverageLabel: 'SYNTHETIC sibling',
    });
    expect([relabel.status, errorOf(relabel).code, errorOf(relabel).details]).toEqual([
      409,
      'DUPLICATE_COVERAGE',
      { coverageId: sibling.data.id },
    ]);
    const crossSource = await patchCoverage(coverage.data.id, patched.etag, {
      basisSourceId: (await createSource({ agencyId: other.data.id })).id,
    });
    expect(outcome(crossSource)).toEqual([422, 'CROSS_AGENCY_REFERENCE']);
    const empty = await patchCoverage(coverage.data.id, patched.etag, {});
    expect(outcome(empty)).toEqual([422, 'VALIDATION_FAILED']);
    expect((await getCoverage(coverage.data.id)).data.rowVersion).toBe(2);
    expect(await auditCount('MANDATE_COVERAGE_UPDATED', coverage.data.id)).toBe(1);
    expect(JSON.stringify(await auditRows(coverage.data.id))).not.toContain(
      'SYNTHETIC-TERRITORY-NEW',
    );
    const missing = await patchCoverage(randomUUID(), patched.etag, { exclusivity: 'UNKNOWN' });
    expect(outcome(missing)).toEqual([404, 'NOT_FOUND']);
  });

  it('list and get: per version, by label words or an exact coverage or route id; unknown ids are 404', async () => {
    const w = await world();
    const second = await anotherRoute(w.agency.data.id, 'Second');
    const version = await createVersion(w.mandate.data.id);
    const first = await createCoverage(version.data.id, {
      routeId: w.route.data.id,
      coverageLabel: 'SYNTHETIC Phạm vi kênh',
    });
    t.clock.advance(1_000);
    const other = await createCoverage(version.data.id, {
      routeId: second.route.data.id,
      coverageLabel: 'SYNTHETIC second route',
    });
    const path = `/mandate-versions/${version.data.id}/coverages`;
    const ids = async (query: string) =>
      (await listOf<MandateCoverage>('listVersionCoverages', `${path}${query}`)).items.map(
        (item) => item.id,
      );
    expect(await ids('')).toEqual([other.data.id, first.data.id]);
    expect(await ids(`?q=${encodeURIComponent('pham vi')}`)).toEqual([first.data.id]);
    expect(await ids(`?q=${second.route.data.id}`)).toEqual([other.data.id]);
    expect(await ids(`?q=${first.data.id}`)).toEqual([first.data.id]);
    const page = await listOf<MandateCoverage>('listVersionCoverages', `${path}?limit=1`);
    const tampered = await client.get(
      'listVersionCoverages',
      `${path}?cursor=${encodeURIComponent(`${(page.nextCursor ?? '').slice(0, -2)}xx`)}`,
    );
    expect(outcome(tampered)).toEqual([400, 'INVALID_CURSOR']);
    expect((await getCoverage(first.data.id)).etag).toBe(`"MandateCoverage:${first.data.id}:v1"`);
    for (const [operationId, path404] of [
      ['listVersionCoverages', `/mandate-versions/${randomUUID()}/coverages`],
      ['getCoverage', `/coverages/${randomUUID()}`],
    ] as const) {
      expect(outcome(await client.get(operationId, path404))).toEqual([404, 'NOT_FOUND']);
    }
  });
});

describe('COVERAGE SIGNERS — a Signer recorded under one coverage; not G7, not the User', () => {
  it('create: a same-agency Signer with its recorded limits; coverage and version move on; the Signer and the User are untouched', async () => {
    const w = await world();
    const version = await createVersion(w.mandate.data.id);
    const coverage = await createCoverage(version.data.id, { routeId: w.route.data.id });
    const signersBefore = await countRows(prisma, 'signers');
    const result = await postCoverageSigner(coverage.data.id, coverage.etag, {
      signerId: w.signer.data.id,
      capacity: 'SYNTHETIC Director',
      actionScope: ['SIGN_NOTICE'],
      sourceId: w.source.id,
      effectiveOn: '2025-01-01',
      endsOn: '2025-12-31',
      limitations: 'SYNTHETIC-LIMITATIONS YouTube only',
    });
    const association = versioned<CoverageSigner>(result, 201);
    expect(association.data).toEqual({
      id: association.data.id,
      coverageId: coverage.data.id,
      agencyId: w.agency.data.id,
      signerId: w.signer.data.id,
      capacity: 'SYNTHETIC Director',
      actionScope: ['SIGN_NOTICE'],
      sourceId: w.source.id,
      effectiveOn: '2025-01-01',
      endsOn: '2025-12-31',
      limitations: 'SYNTHETIC-LIMITATIONS YouTube only',
      createdAt: nowIso(),
      createdById: client.session.userId,
      updatedAt: nowIso(),
      updatedById: client.session.userId,
      rowVersion: 1,
    });
    expect(association.etag).toBe(`"CoverageSigner:${association.data.id}:v1"`);
    expect(affectedOf(result)).toEqual([
      { type: 'MandateVersion', id: version.data.id, rowVersion: 3 },
      { type: 'MandateCoverage', id: coverage.data.id, rowVersion: 2 },
      { type: 'CoverageSigner', id: association.data.id, rowVersion: 1 },
    ]);
    // Recording a signer grants nothing: the Signer's own record and state are unchanged, the
    // acting User is only the recorder, and no signer appears for the User.
    expect((await getSigner(w.signer.data.id)).data).toEqual(w.signer.data);
    expect(association.data.signerId).not.toBe(client.session.userId);
    expect(await countRows(prisma, 'signers')).toBe(signersBefore);
    await expectNoCaseRecords();
    const [event] = await auditRows(association.data.id);
    expect(event).toMatchObject({
      action: 'COVERAGE_SIGNER_CREATED',
      sourceIds: [w.source.id],
      afterRedacted: {
        signerId: w.signer.data.id,
        capacity: 'SYNTHETIC Director',
        limitations: { redacted: true, codePoints: 34 },
        coverageRowVersion: 2,
        versionRowVersion: 3,
      },
    });
    expect(JSON.stringify(event)).not.toContain('SYNTHETIC-LIMITATIONS');
  });

  it('create refuses another agency’s signer, unknown signers (the User is not one), archived or ENDED signers, duplicates and inverted dates', async () => {
    const a = await world('A');
    const b = await world('B');
    const version = await createVersion(a.mandate.data.id);
    const coverage = await createCoverage(version.data.id, { routeId: a.route.data.id });
    const etag = async () => (await getCoverage(coverage.data.id)).etag;
    const ended = await createSigner(a.agency.data.id, 'SYNTHETIC Ended Person');
    versioned(
      await client.write(
        'setSignerState',
        'POST',
        `/signers/${ended.data.id}/state`,
        { state: 'ENDED', reason: 'SYNTHETIC' },
        { ifMatch: ended.etag },
      ),
      200,
    );
    const archivedSigner = await createSigner(a.agency.data.id, 'SYNTHETIC Archived Person');
    versioned(
      await archive('archiveSigner', `/signers/${archivedSigner.data.id}`, archivedSigner.etag),
      200,
    );
    const refusals: Array<[Record<string, unknown>, number, string, Record<string, unknown>]> = [
      [{ signerId: b.signer.data.id }, 422, 'CROSS_AGENCY_REFERENCE', { field: 'signerId' }],
      [{ signerId: randomUUID() }, 422, 'REFERENCE_NOT_FOUND', { field: 'signerId' }],
      [{ signerId: client.session.userId }, 422, 'REFERENCE_NOT_FOUND', { field: 'signerId' }],
      [
        { signerId: ended.data.id },
        409,
        'RECORD_STATE_CONFLICT',
        { record: 'Signer', state: 'ENDED', field: 'signerId' },
      ],
      [
        { signerId: archivedSigner.data.id },
        409,
        'RECORD_STATE_CONFLICT',
        { record: 'Signer', archived: true, field: 'signerId' },
      ],
      [
        { signerId: a.signer.data.id, sourceId: b.source.id },
        422,
        'CROSS_AGENCY_REFERENCE',
        { field: 'sourceId' },
      ],
      [
        { signerId: a.signer.data.id, effectiveOn: '2025-02-01', endsOn: '2025-01-31' },
        422,
        'DATE_RANGE_INVALID',
        { fields: ['effectiveOn', 'endsOn'] },
      ],
      [{ signerId: a.signer.data.id, capacity: '' }, 422, 'VALIDATION_FAILED', {}],
      [{ signerId: a.signer.data.id, eligible: true }, 422, 'VALIDATION_FAILED', {}],
      [{ signerId: a.signer.data.id, userId: client.session.userId }, 422, 'VALIDATION_FAILED', {}],
    ];
    for (const [body, status, errorCode, details] of refusals) {
      const refused = await postCoverageSigner(coverage.data.id, await etag(), body);
      expect(outcome(refused), JSON.stringify(body)).toEqual([status, errorCode]);
      expect(errorOf(refused).details).toMatchObject(details);
    }
    expect(await countRows(prisma, 'coverage_signers')).toBe(0);
    const first = await addCoverageSigner(coverage.data.id, { signerId: a.signer.data.id });
    const duplicate = await postCoverageSigner(coverage.data.id, await etag(), {
      signerId: a.signer.data.id,
    });
    expect([duplicate.status, errorOf(duplicate).code, errorOf(duplicate).details]).toEqual([
      409,
      'DUPLICATE_COVERAGE_SIGNER',
      { coverageSignerId: first.data.id },
    ]);
    // Another capacity is another recorded association; a PAUSED signer is administratively usable.
    const paused = await createSigner(a.agency.data.id, 'SYNTHETIC Paused Person');
    versioned(
      await client.write(
        'setSignerState',
        'POST',
        `/signers/${paused.data.id}/state`,
        { state: 'PAUSED', reason: 'SYNTHETIC' },
        { ifMatch: paused.etag },
      ),
      200,
    );
    await addCoverageSigner(coverage.data.id, {
      signerId: a.signer.data.id,
      capacity: 'SYNTHETIC second capacity',
    });
    await addCoverageSigner(coverage.data.id, { signerId: paused.data.id });
    expect(await countRows(prisma, 'coverage_signers')).toBe(3);
    const missing = await postCoverageSigner(randomUUID(), await etag(), {
      signerId: a.signer.data.id,
    });
    expect(outcome(missing)).toEqual([404, 'NOT_FOUND']);
  });

  it('the source must apply to the coverage’s route, and an association never transfers to another coverage', async () => {
    const w = await world();
    const second = await anotherRoute(w.agency.data.id, 'Second');
    const version = await createVersion(w.mandate.data.id);
    const c1 = await createCoverage(version.data.id, { routeId: w.route.data.id });
    const c2 = await createCoverage(version.data.id, { routeId: second.route.data.id });
    const subjectOnly = await createSource({
      scopeBindings: { agencyIds: [w.agency.data.id], legalSubjectIds: [second.subject.data.id] },
    });
    const refused = await postCoverageSigner(c1.data.id, (await getCoverage(c1.data.id)).etag, {
      signerId: w.signer.data.id,
      sourceId: subjectOnly.id,
    });
    expect([refused.status, errorOf(refused).code, errorOf(refused).details]).toEqual([
      422,
      'SOURCE_SCOPE_UNRESOLVED',
      { field: 'sourceId', reason: 'SCOPED_TO_OTHER_SUBJECT' },
    ]);
    const recorded = await addCoverageSigner(c1.data.id, { signerId: w.signer.data.id });
    // The same Signer under c2 needs its own explicit association; nothing carries over.
    const underC2 = await listOf<CoverageSigner>(
      'listCoverageSigners',
      `/coverages/${c2.data.id}/signers`,
    );
    expect(underC2.items).toEqual([]);
    const underC1 = await listOf<CoverageSigner>(
      'listCoverageSigners',
      `/coverages/${c1.data.id}/signers`,
    );
    expect(underC1.items).toEqual([recorded.data]);
    await freeze(version.data.id);
    expect(
      (await listOf<CoverageSigner>('listCoverageSigners', `/coverages/${c2.data.id}/signers`))
        .items,
    ).toEqual([]);
    const accepted = await addCoverageSigner(
      (
        await createCoverage((await createVersion(w.mandate.data.id)).data.id, {
          routeId: second.route.data.id,
        })
      ).data.id,
      { signerId: w.signer.data.id, sourceId: subjectOnly.id },
    );
    expect(accepted.data.sourceId).toBe(subjectOnly.id);
  });

  it('delete: a draft association only, with If-Match; the parents move on; the audit keeps what was removed', async () => {
    const c = await chain();
    const before = await versionsOf({ version: c.version.data.id, coverage: c.coverage.data.id });
    const noMatch = await deleteCoverageSigner(c.coverageSigner.data.id, null);
    expect(outcome(noMatch)).toEqual([428, 'PRECONDITION_REQUIRED']);
    const result = await deleteCoverageSigner(c.coverageSigner.data.id, c.coverageSigner.etag);
    expect([result.status, result.text]).toEqual([204, '']);
    expect(await countRows(prisma, 'coverage_signers')).toBe(0);
    expect(await versionsOf({ version: c.version.data.id, coverage: c.coverage.data.id })).toEqual({
      ...before,
      version: (before.version ?? 0) + 1,
      coverage: (before.coverage ?? 0) + 1,
    });
    const [, removed] = await auditRows(c.coverageSigner.data.id);
    expect(removed).toMatchObject({
      action: 'COVERAGE_SIGNER_DELETED',
      beforeRedacted: {
        coverageId: c.coverage.data.id,
        signerId: c.signer.data.id,
        sourceId: c.source.id,
        rowVersion: 1,
      },
    });
    expect((await getSigner(c.signer.data.id)).data).toEqual(c.signer.data);
    const gone = await deleteCoverageSigner(c.coverageSigner.data.id, c.coverageSigner.etag);
    expect(outcome(gone)).toEqual([404, 'NOT_FOUND']);
    const readGone = await client.get(
      'getCoverageSigner',
      `/coverage-signers/${c.coverageSigner.data.id}`,
    );
    expect(outcome(readGone)).toEqual([404, 'NOT_FOUND']);
  });

  it('list and get: per coverage, by capacity words or an exact row or signer id; unknown coverages are 404', async () => {
    const c = await chain();
    const second = await createSigner(c.agency.data.id, 'SYNTHETIC Second Person');
    t.clock.advance(1_000);
    const other = await addCoverageSigner(c.coverage.data.id, {
      signerId: second.data.id,
      capacity: 'SYNTHETIC Giám đốc',
    });
    const path = `/coverages/${c.coverage.data.id}/signers`;
    const ids = async (query: string) =>
      (await listOf<CoverageSigner>('listCoverageSigners', `${path}${query}`)).items.map(
        (item) => item.id,
      );
    expect(await ids('')).toEqual([other.data.id, c.coverageSigner.data.id]);
    expect(await ids(`?q=${encodeURIComponent('giam doc')}`)).toEqual([other.data.id]);
    expect(await ids(`?q=${c.signer.data.id}`)).toEqual([c.coverageSigner.data.id]);
    expect(await ids(`?q=${other.data.id}`)).toEqual([other.data.id]);
    const got = await getCoverageSigner(other.data.id);
    expect(got.data).toEqual(other.data);
    expect(
      outcome(await client.get('listCoverageSigners', `/coverages/${randomUUID()}/signers`)),
    ).toEqual([404, 'NOT_FOUND']);
  });
});

describe('AUTHORITY EVENTS — append-only history, exactly as reported; not proof by existence', () => {
  it('record: a whole-mandate event stored exactly as given — no date is inferred; the Mandate moves on; no ETag, no update or delete', async () => {
    const w = await world();
    t.clock.advance(5_000);
    const result = await postEvent(w.mandate.data.id, w.mandate.etag, {
      eventType: 'CURRENTNESS_RECORDED',
      sourceId: w.source.id,
      provenance: 'OPERATOR_REPORTED',
      scopeText: 'SYNTHETIC-EVENT-SCOPE whole mandate',
      interpretation: 'SYNTHETIC-INTERPRETATION operator reading',
    });
    const event = immutable<AuthorityEvent>(result, 201);
    expect(event).toEqual({
      id: event.id,
      mandateId: w.mandate.data.id,
      agencyId: w.agency.data.id,
      coverageId: null,
      eventType: 'CURRENTNESS_RECORDED',
      sourceId: w.source.id,
      provenance: 'OPERATOR_REPORTED',
      // Never the capture date, the recording time or today.
      effectiveOn: null,
      effectiveAt: null,
      rawEffectiveText: null,
      scopeText: 'SYNTHETIC-EVENT-SCOPE whole mandate',
      supersedesEventId: null,
      interpretation: 'SYNTHETIC-INTERPRETATION operator reading',
      createdAt: nowIso(),
      createdById: client.session.userId,
    });
    expect(affectedOf(result)).toEqual([
      { type: 'Mandate', id: w.mandate.data.id, rowVersion: 2 },
      { type: 'AuthorityEvent', id: event.id, rowVersion: null },
    ]);
    expect((await getMandate(w.mandate.data.id)).data.rowVersion).toBe(2);
    const dated = await recordEvent(w.mandate.data.id, {
      eventType: 'TERMINATION',
      sourceId: w.source.id,
      effectiveOn: '2025-06-30',
      effectiveAt: '2025-06-30T10:15:00.123Z',
      rawEffectiveText: 'SYNTHETIC-RAW as of 30 June 2025, 10:15',
    });
    expect(dated).toMatchObject({
      effectiveOn: '2025-06-30',
      effectiveAt: '2025-06-30T10:15:00.123Z',
      rawEffectiveText: 'SYNTHETIC-RAW as of 30 June 2025, 10:15',
      createdAt: nowIso(),
    });
    // An offset names the same instant; the exact wording belongs in the raw text.
    const offset = await recordEvent(w.mandate.data.id, {
      eventType: 'CORRECTION',
      sourceId: w.source.id,
      effectiveAt: '2025-06-30T17:15:00.123+07:00',
    });
    expect(offset.effectiveAt).toBe('2025-06-30T10:15:00.123Z');
    const [audit] = await auditRows(event.id);
    expect(audit).toMatchObject({
      action: 'AUTHORITY_EVENT_RECORDED',
      entityType: 'AuthorityEvent',
      sourceIds: [w.source.id],
      beforeRedacted: { mandateRowVersion: 1 },
      afterRedacted: {
        eventType: 'CURRENTNESS_RECORDED',
        provenance: 'OPERATOR_REPORTED',
        coverageId: null,
        scopeText: { redacted: true, codePoints: 35 },
        mandateRowVersion: 2,
      },
    });
    const trail = JSON.stringify(
      await prisma.auditEvent.findMany({ where: { entityType: 'AuthorityEvent' } }),
    );
    for (const marker of ['SYNTHETIC-EVENT-SCOPE', 'SYNTHETIC-INTERPRETATION', 'SYNTHETIC-RAW']) {
      expect(trail).not.toContain(marker);
    }
    // Append-only: no route changes or removes an event.
    for (const [method, path] of [
      ['PATCH', `/mandates/${w.mandate.data.id}/events/${event.id}`],
      ['DELETE', `/mandates/${w.mandate.data.id}/events/${event.id}`],
      ['GET', `/authority-events/${event.id}`],
      ['DELETE', `/authority-events/${event.id}`],
    ] as const) {
      const response = await unrouted(method, path);
      expect([response.status, code(response)], `${method} ${path}`).toEqual([404, 'NOT_FOUND']);
    }
    expect(await countRows(prisma, 'authority_events')).toBe(3);
  });

  it('refuses unknown fields, a missing source, unstorable instants and unsupported provenance vocabulary', async () => {
    const w = await world();
    const refusals: Array<[Record<string, unknown>, string]> = [
      [{ sourceId: undefined }, 'VALIDATION_FAILED'],
      [{ sourceId: w.source.id, scopeText: '' }, 'VALIDATION_FAILED'],
      [{ sourceId: w.source.id, interpretation: '' }, 'VALIDATION_FAILED'],
      [{ sourceId: w.source.id, eventType: 'AUTHORIZED' }, 'VALIDATION_FAILED'],
      [{ sourceId: w.source.id, provenance: 'VERIFIED' }, 'VALIDATION_FAILED'],
      [{ sourceId: w.source.id, provenance: 'OPERATOR_CONFIRMED' }, 'VALIDATION_FAILED'],
      [{ sourceId: w.source.id, provenance: 'INFERRED' }, 'VALIDATION_FAILED'],
      [{ sourceId: w.source.id, provenance: 'ASSUMED' }, 'VALIDATION_FAILED'],
      [{ sourceId: w.source.id, effectiveAt: '2016-12-31T23:59:60Z' }, 'VALIDATION_FAILED'],
      [{ sourceId: w.source.id, effectiveAt: '2025-06-30T10:15:00.123456Z' }, 'VALIDATION_FAILED'],
      [
        { sourceId: w.source.id, effectiveAt: '9999-12-31T23:59:59.000-01:00' },
        'VALIDATION_FAILED',
      ],
      [{ sourceId: w.source.id, effectiveOn: '0999-12-31' }, 'VALIDATION_FAILED'],
      [{ sourceId: w.source.id, recordedAt: '2025-01-01T00:00:00Z' }, 'VALIDATION_FAILED'],
      [{ sourceId: w.source.id, revokes: w.mandate.data.id }, 'VALIDATION_FAILED'],
      [{ sourceId: randomUUID() }, 'REFERENCE_NOT_FOUND'],
    ];
    for (const [body, errorCode] of refusals) {
      const refused = await postEvent(w.mandate.data.id, w.mandate.etag, body);
      expect(outcome(refused), JSON.stringify(body)).toEqual([422, errorCode]);
    }
    expect(await countRows(prisma, 'authority_events')).toBe(0);
    expect((await getMandate(w.mandate.data.id)).data.rowVersion).toBe(1);
    const missing = await postEvent(randomUUID(), w.mandate.etag, { sourceId: w.source.id });
    expect(outcome(missing)).toEqual([404, 'NOT_FOUND']);
  });

  it('coverage-scoped events need a frozen coverage of this mandate, and a source that applies to its route', async () => {
    const c = await chain();
    const other = await chain('B', { frozen: true });
    const draftRefused = await postEvent(c.mandate.data.id, c.mandate.etag, {
      coverageId: c.coverage.data.id,
      sourceId: c.source.id,
    });
    expect([
      draftRefused.status,
      errorOf(draftRefused).code,
      errorOf(draftRefused).details,
    ]).toEqual([409, 'VERSION_NOT_FROZEN', { field: 'coverageId', versionId: c.version.data.id }]);
    await freeze(c.version.data.id);
    const mandate = await getMandate(c.mandate.data.id);
    const second = await anotherRoute(c.agency.data.id, 'Second');
    const refusals: Array<[Record<string, unknown>, string, Record<string, unknown>]> = [
      [
        { coverageId: other.coverage.data.id, sourceId: c.source.id },
        'AUTHORITY_SCOPE_UNRESOLVED',
        { field: 'coverageId', reason: 'OTHER_MANDATE' },
      ],
      [
        { coverageId: randomUUID(), sourceId: c.source.id },
        'REFERENCE_NOT_FOUND',
        { field: 'coverageId' },
      ],
      [
        { coverageId: c.coverage.data.id, sourceId: other.source.id },
        'CROSS_AGENCY_REFERENCE',
        { field: 'sourceId' },
      ],
      [
        {
          coverageId: c.coverage.data.id,
          sourceId: (
            await createSource({
              scopeBindings: {
                agencyIds: [c.agency.data.id],
                legalSubjectIds: [second.subject.data.id],
              },
            })
          ).id,
        },
        'SOURCE_SCOPE_UNRESOLVED',
        { field: 'sourceId', reason: 'SCOPED_TO_OTHER_SUBJECT' },
      ],
    ];
    for (const [body, errorCode, details] of refusals) {
      const refused = await postEvent(c.mandate.data.id, mandate.etag, body);
      expect([refused.status, errorOf(refused).code, errorOf(refused).details], errorCode).toEqual([
        422,
        errorCode,
        details,
      ]);
    }
    const before = await versionsOf({
      version: c.version.data.id,
      coverage: c.coverage.data.id,
      coverageSigner: c.coverageSigner.data.id,
      route: c.route.data.id,
    });
    const scoped = await recordEvent(c.mandate.data.id, {
      eventType: 'REVOCATION',
      coverageId: c.coverage.data.id,
      sourceId: c.source.id,
      scopeText: 'SYNTHETIC coverage of subject L only',
    });
    expect(scoped.coverageId).toBe(c.coverage.data.id);
    // An event changes no version, coverage, signer or route — a revocation is a record, not an action.
    expect(
      await versionsOf({
        version: c.version.data.id,
        coverage: c.coverage.data.id,
        coverageSigner: c.coverageSigner.data.id,
        route: c.route.data.id,
      }),
    ).toEqual(before);
    expect((await getCoverage(c.coverage.data.id)).data).toEqual(c.coverage.data);
  });

  it('supersession: an event is superseded at most once, by an event of the same scope and mandate; the earlier event never changes', async () => {
    const c = await chain('A', { frozen: true });
    const other = await chain('B', { frozen: true });
    const first = await recordEvent(c.mandate.data.id, { sourceId: c.source.id });
    const foreign = await recordEvent(other.mandate.data.id, { sourceId: other.source.id });
    const successor = await recordEvent(c.mandate.data.id, {
      eventType: 'CORRECTION',
      sourceId: c.source.id,
      supersedesEventId: first.id,
    });
    expect(successor.supersedesEventId).toBe(first.id);
    const mandate = await getMandate(c.mandate.data.id);
    const refusals: Array<[Record<string, unknown>, number, string, Record<string, unknown>]> = [
      [
        { supersedesEventId: first.id },
        409,
        'EVENT_ALREADY_SUPERSEDED',
        { successorId: successor.id },
      ],
      [
        { supersedesEventId: successor.id, coverageId: c.coverage.data.id },
        422,
        'AUTHORITY_SCOPE_UNRESOLVED',
        { field: 'supersedesEventId', reason: 'SCOPE_CHANGE' },
      ],
      [
        { supersedesEventId: foreign.id },
        422,
        'AUTHORITY_SCOPE_UNRESOLVED',
        { field: 'supersedesEventId', reason: 'OTHER_MANDATE' },
      ],
      [
        { supersedesEventId: randomUUID() },
        422,
        'REFERENCE_NOT_FOUND',
        { field: 'supersedesEventId' },
      ],
    ];
    for (const [body, status, errorCode, details] of refusals) {
      const refused = await postEvent(c.mandate.data.id, mandate.etag, {
        sourceId: c.source.id,
        ...body,
      });
      expect([refused.status, errorOf(refused).code, errorOf(refused).details], errorCode).toEqual([
        status,
        errorCode,
        details,
      ]);
    }
    // Two successors racing on one Mandate ETag: exactly one is recorded.
    const racing = await Promise.all(
      ['A', 'B'].map((label) =>
        postEvent(c.mandate.data.id, mandate.etag, {
          sourceId: c.source.id,
          supersedesEventId: successor.id,
          interpretation: `SYNTHETIC racing ${label}`,
        }),
      ),
    );
    expect(racing.map((result) => result.status).sort()).toEqual([201, 412]);
    const history = await listOf<AuthorityEvent>(
      'listAuthorityEvents',
      `/mandates/${c.mandate.data.id}/events`,
    );
    expect(history.items).toHaveLength(3);
    expect(history.items.find((item) => item.id === first.id)).toEqual(first);
    expect(await prisma.authorityEvent.count({ where: { supersedesEventId: successor.id } })).toBe(
      1,
    );
  });

  it('provenance is stored exactly as given; DOCUMENT_REVIEWED needs a source recording an attributed review; nothing upgrades', async () => {
    const w = await world();
    const reviewed = await reviewedSource(w.agency.data.id);
    for (const provenance of ['OPERATOR_REPORTED', 'ANALYSIS', 'MISSING', 'CONFLICT']) {
      const event = await recordEvent(w.mandate.data.id, { sourceId: w.source.id, provenance });
      expect(event.provenance, provenance).toBe(provenance);
    }
    const unsupported = await postEvent(
      w.mandate.data.id,
      (await getMandate(w.mandate.data.id)).etag,
      {
        sourceId: w.source.id,
        provenance: 'DOCUMENT_REVIEWED',
      },
    );
    expect([unsupported.status, errorOf(unsupported).code, errorOf(unsupported).details]).toEqual([
      422,
      'REVIEW_UNSUPPORTED',
      { field: 'provenance', reason: 'SOURCE_NOT_REVIEWED' },
    ]);
    const documented = await recordEvent(w.mandate.data.id, {
      sourceId: reviewed.id,
      provenance: 'DOCUMENT_REVIEWED',
    });
    expect(documented.provenance).toBe('DOCUMENT_REVIEWED');
    // A reviewed source does not upgrade an event reported otherwise, and MISSING stays MISSING.
    const reported = await recordEvent(w.mandate.data.id, {
      sourceId: reviewed.id,
      provenance: 'OPERATOR_REPORTED',
    });
    expect(reported.provenance).toBe('OPERATOR_REPORTED');
    const events = await listOf<AuthorityEvent>(
      'listAuthorityEvents',
      `/mandates/${w.mandate.data.id}/events`,
    );
    expect(events.items.map((item) => item.provenance).sort()).toEqual(
      [
        'ANALYSIS',
        'CONFLICT',
        'DOCUMENT_REVIEWED',
        'MISSING',
        'OPERATOR_REPORTED',
        'OPERATOR_REPORTED',
      ].sort(),
    );
    expect((await getSource(w.source.id)).reportedProvenance).toBe('OPERATOR_REPORTED');
    expect((await getSource(reviewed.id)).reportedProvenance).toBe('DOCUMENT_REVIEWED');
  });

  it('nothing else creates an event: sources, revisions, versions, freeze, coverage, signers, preferences, bindings, archive and restore', async () => {
    const c = await chain('A', { frozen: true });
    immutable(
      await reviseSource(c.source.id, { agencyId: c.agency.data.id, title: 'SYNTHETIC rev 2' }),
      201,
    );
    const route = await getRoute(c.route.data.id);
    versioned(
      await patchRoute(route.data.id, route.etag, { preferredCoverageId: c.coverage.data.id }),
      200,
    );
    const mandate = await getMandate(c.mandate.data.id);
    const canonical = await createSource({
      agencyId: c.agency.data.id,
      title: 'SYNTHETIC canonical',
    });
    const bound = versioned<Mandate>(
      await client.write(
        'bindCanonicalMandate',
        'POST',
        `/mandates/${mandate.data.id}/canonical-bindings`,
        { canonicalCode: 'SYN-NO-EVENT', sourceId: canonical.id, reason: 'synthetic' },
        { ifMatch: mandate.etag },
      ),
      200,
    );
    const archived = versioned<Mandate>(
      await archive('archiveMandate', `/mandates/${mandate.data.id}`, bound.etag),
      200,
    );
    versioned(
      await client.write(
        'restoreMandate',
        'POST',
        `/mandates/${mandate.data.id}/restore`,
        { reason: 'SYNTHETIC' },
        { ifMatch: archived.etag },
      ),
      200,
    );
    const signer = await getSigner(c.signer.data.id);
    versioned(
      await client.write(
        'setSignerState',
        'POST',
        `/signers/${signer.data.id}/state`,
        { state: 'ENDED', reason: 'SYNTHETIC' },
        { ifMatch: signer.etag },
      ),
      200,
    );
    expect(await countRows(prisma, 'authority_events')).toBe(0);
    expect(
      (await listOf<AuthorityEvent>('listAuthorityEvents', `/mandates/${mandate.data.id}/events`))
        .items,
    ).toEqual([]);
  });

  it('list: newest recording first; by type, coverage, source or superseded id, or words; recordedAt is not an effective date', async () => {
    const c = await chain('A', { frozen: true });
    const first = await recordEvent(c.mandate.data.id, {
      sourceId: c.source.id,
      effectiveOn: '2024-01-01',
      interpretation: 'SYNTHETIC Hiệu lực ban đầu',
    });
    t.clock.advance(1_000);
    const scoped = await recordEvent(c.mandate.data.id, {
      eventType: 'REVOCATION',
      coverageId: c.coverage.data.id,
      sourceId: c.source.id,
    });
    t.clock.advance(1_000);
    const successor = await recordEvent(c.mandate.data.id, {
      eventType: 'CORRECTION',
      sourceId: c.source.id,
      supersedesEventId: first.id,
    });
    const path = `/mandates/${c.mandate.data.id}/events`;
    const ids = async (query: string) =>
      (await listOf<AuthorityEvent>('listAuthorityEvents', `${path}${query}`)).items.map(
        (item) => item.id,
      );
    expect(await ids('')).toEqual([successor.id, scoped.id, first.id]);
    expect(await ids('?q=REVOCATION')).toEqual([scoped.id]);
    expect(await ids(`?q=${c.coverage.data.id}`)).toEqual([scoped.id]);
    expect(await ids(`?q=${first.id}`)).toEqual([successor.id, first.id]);
    expect(await ids(`?q=${encodeURIComponent('hieu luc')}`)).toEqual([first.id]);
    expect(await ids(`?q=${c.source.id}`)).toEqual([successor.id, scoped.id, first.id]);
    // The recording time differs from the recorded effective date and is never substituted for it.
    expect([first.createdAt, first.effectiveOn, scoped.effectiveOn]).toEqual([
      new Date(t.clock.ms - 2_000).toISOString(),
      '2024-01-01',
      null,
    ]);
    const page = await listOf<AuthorityEvent>('listAuthorityEvents', `${path}?limit=2`);
    const next = await listOf<AuthorityEvent>(
      'listAuthorityEvents',
      `${path}?limit=2&cursor=${encodeURIComponent(page.nextCursor ?? '')}`,
    );
    expect([...page.items, ...next.items].map((item) => item.id)).toEqual([
      successor.id,
      scoped.id,
      first.id,
    ]);
    expect(
      outcome(await client.get('listAuthorityEvents', `/mandates/${randomUUID()}/events`)),
    ).toEqual([404, 'NOT_FOUND']);
  });
});

describe('ROUTE PREFERRED COVERAGE — an operational default, not adjudicated authority', () => {
  it('a frozen coverage of this exact route can be preferred and removed with If-Match; nothing else changes', async () => {
    const c = await chain('A', { frozen: true });
    const route = await getRoute(c.route.data.id);
    const before = await versionsOf({
      mandate: c.mandate.data.id,
      version: c.version.data.id,
      coverage: c.coverage.data.id,
      coverageSigner: c.coverageSigner.data.id,
    });
    const preferred = versioned<Route>(
      await patchRoute(route.data.id, route.etag, { preferredCoverageId: c.coverage.data.id }),
      200,
    );
    expect(preferred.data).toEqual({
      ...route.data,
      preferredCoverageId: c.coverage.data.id,
      rowVersion: route.data.rowVersion + 1,
    });
    const [, update] = await auditRows(route.data.id);
    expect(update).toMatchObject({
      action: 'ROUTE_UPDATED',
      afterRedacted: { preferredCoverageId: c.coverage.data.id },
    });
    // A preference selects nothing for a case, records no event and changes no authority record.
    expect(
      await versionsOf({
        mandate: c.mandate.data.id,
        version: c.version.data.id,
        coverage: c.coverage.data.id,
        coverageSigner: c.coverageSigner.data.id,
      }),
    ).toEqual(before);
    expect(await countRows(prisma, 'authority_events')).toBe(0);
    await expectNoCaseRecords();
    const stale = await patchRoute(route.data.id, route.etag, { preferredCoverageId: null });
    expect(outcome(stale)).toEqual([412, 'RECORD_VERSION_CONFLICT']);
    const removed = versioned<Route>(
      await patchRoute(route.data.id, preferred.etag, { preferredCoverageId: null }),
      200,
    );
    expect(removed.data).toMatchObject({
      preferredCoverageId: null,
      rowVersion: route.data.rowVersion + 2,
    });
    // A preference is kept (not cascaded) when the mandate is archived later; it can still be cleared.
    const again = versioned<Route>(
      await patchRoute(route.data.id, removed.etag, { preferredCoverageId: c.coverage.data.id }),
      200,
    );
    const mandate = await getMandate(c.mandate.data.id);
    versioned(await archive('archiveMandate', `/mandates/${mandate.data.id}`, mandate.etag), 200);
    expect((await getRoute(route.data.id)).data).toEqual(again.data);
    const otherField = versioned<Route>(
      await patchRoute(route.data.id, again.etag, { casePrefixHint: 'SYN-P' }),
      200,
    );
    expect(otherField.data.preferredCoverageId).toBe(c.coverage.data.id);
    versioned(await patchRoute(route.data.id, otherField.etag, { preferredCoverageId: null }), 200);
  });

  it('refuses another agency’s coverage, another route’s coverage, a draft coverage, an archived mandate’s coverage and unknown ids', async () => {
    const a = await chain('A', { frozen: true });
    const b = await chain('B', { frozen: true });
    const second = await anotherRoute(a.agency.data.id, 'Second');
    const otherRouteVersion = await createVersion(a.mandate.data.id, {
      changeKind: 'AMENDMENT',
      predecessorId: a.version.data.id,
    });
    const otherRouteCoverage = await createCoverage(otherRouteVersion.data.id, {
      routeId: second.route.data.id,
    });
    const draftCoverage = await createCoverage(otherRouteVersion.data.id, {
      routeId: a.route.data.id,
      coverageLabel: 'SYNTHETIC draft coverage',
    });
    await freeze(otherRouteVersion.data.id);
    const draftMandate = await createMandate(a.agency.data.id, {
      label: 'SYNTHETIC draft mandate',
    });
    const draftVersion = await createVersion(draftMandate.data.id);
    const unfrozen = await createCoverage(draftVersion.data.id, { routeId: a.route.data.id });
    const archivedMandate = await createMandate(a.agency.data.id, { label: 'SYNTHETIC archived' });
    const archivedVersion = await createVersion(archivedMandate.data.id);
    const archivedCoverage = await createCoverage(archivedVersion.data.id, {
      routeId: a.route.data.id,
    });
    await freeze(archivedVersion.data.id);
    const archivedEtag = (await getMandate(archivedMandate.data.id)).etag;
    versioned(
      await archive('archiveMandate', `/mandates/${archivedMandate.data.id}`, archivedEtag),
      200,
    );
    const route = await getRoute(a.route.data.id);
    const refusals: Array<[string, number, string, Record<string, unknown>]> = [
      [b.coverage.data.id, 422, 'CROSS_AGENCY_REFERENCE', { field: 'preferredCoverageId' }],
      [
        otherRouteCoverage.data.id,
        422,
        'AUTHORITY_SCOPE_UNRESOLVED',
        { field: 'preferredCoverageId', reason: 'OTHER_ROUTE' },
      ],
      [
        unfrozen.data.id,
        409,
        'VERSION_NOT_FROZEN',
        { field: 'preferredCoverageId', versionId: draftVersion.data.id },
      ],
      [
        archivedCoverage.data.id,
        409,
        'RECORD_STATE_CONFLICT',
        { record: 'Mandate', archived: true, field: 'preferredCoverageId' },
      ],
      [randomUUID(), 422, 'REFERENCE_NOT_FOUND', { field: 'preferredCoverageId' }],
    ];
    for (const [preferredCoverageId, status, errorCode, details] of refusals) {
      const refused = await patchRoute(route.data.id, route.etag, { preferredCoverageId });
      expect(outcome(refused), errorCode).toEqual([status, errorCode]);
      expect(errorOf(refused).details).toMatchObject(details);
    }
    expect((await getRoute(route.data.id)).data).toEqual(route.data);
    // The draft coverage of the frozen successor version is frozen now and applies to this route.
    versioned(
      await patchRoute(route.data.id, route.etag, { preferredCoverageId: draftCoverage.data.id }),
      200,
    );
    // A new route has no coverage yet, so it cannot prefer one at creation.
    const fresh = await anotherRoute(a.agency.data.id, 'Fresh');
    const onCreate = await client.write('createRoute', 'POST', '/routes', {
      agencyId: a.agency.data.id,
      ownerSubjectId: (await link(fresh.owner.data.id, (await createSubject('Fresh-2')).data.id))
        .data.id,
      preferredCoverageId: a.coverage.data.id,
    });
    expect([onCreate.status, errorOf(onCreate).code, errorOf(onCreate).details]).toEqual([
      422,
      'AUTHORITY_SCOPE_UNRESOLVED',
      { field: 'preferredCoverageId', reason: 'OTHER_ROUTE' },
    ]);
    const crossOnCreate = await client.write('createRoute', 'POST', '/routes', {
      agencyId: a.agency.data.id,
      ownerSubjectId: (await link(fresh.owner.data.id, (await createSubject('Fresh-3')).data.id))
        .data.id,
      preferredCoverageId: b.coverage.data.id,
    });
    expect(outcome(crossOnCreate)).toEqual([422, 'CROSS_AGENCY_REFERENCE']);
  });
});

describe('DOCUMENT_REVIEWED — never upgraded by a reviewer name, a hash, a binding, a revision or a P3B record', () => {
  it('1. a reviewer name without an explicit DOCUMENT_REVIEWED does not upgrade provenance', async () => {
    const w = await world();
    const named = await createSource({
      agencyId: w.agency.data.id,
      reviewedByLabel: 'SYNTHETIC Reviewer Name',
      reviewedAt: '2026-01-01T00:00:00.000Z',
    });
    expect([named.reportedProvenance, named.reviewedByLabel]).toEqual([
      'OPERATOR_REPORTED',
      'SYNTHETIC Reviewer Name',
    ]);
    const claim = await postVersion(w.mandate.data.id, w.mandate.etag, {
      primarySourceId: named.id,
      sourceReviewState: 'REVIEWED_WITH_LIMITS',
    });
    expect(outcome(claim)).toEqual([422, 'REVIEW_UNSUPPORTED']);
    const event = await postEvent(w.mandate.data.id, w.mandate.etag, {
      sourceId: named.id,
      provenance: 'DOCUMENT_REVIEWED',
    });
    expect(outcome(event)).toEqual([422, 'REVIEW_UNSUPPORTED']);
    expect((await getSource(named.id)).reportedProvenance).toBe('OPERATOR_REPORTED');
  });

  it('2. a hash or hash target alone is refused as incomplete, and a complete hash still does not upgrade provenance', async () => {
    const w = await world();
    const sha = 'a'.repeat(64);
    const hashOnly = await client.write('createSource', 'POST', '/sources', {
      ...SOURCE_BASE,
      agencyId: w.agency.data.id,
      contentSha256: sha,
    });
    expect([hashOnly.status, errorOf(hashOnly).code, errorOf(hashOnly).details]).toEqual([
      422,
      'CONTENT_HASH_INCOMPLETE',
      { field: 'hashTarget' },
    ]);
    const targetOnly = await client.write('createSource', 'POST', '/sources', {
      ...SOURCE_BASE,
      agencyId: w.agency.data.id,
      hashTarget: 'RAW_FILE',
    });
    expect([targetOnly.status, errorOf(targetOnly).code, errorOf(targetOnly).details]).toEqual([
      422,
      'CONTENT_HASH_INCOMPLETE',
      { field: 'contentSha256' },
    ]);
    const hashed = await createSource({
      agencyId: w.agency.data.id,
      contentSha256: sha,
      hashTarget: 'RAW_FILE',
    });
    expect([hashed.reportedProvenance, hashed.contentSha256, hashed.hashTarget]).toEqual([
      'OPERATOR_REPORTED',
      sha,
      'RAW_FILE',
    ]);
    const claim = await postVersion(w.mandate.data.id, w.mandate.etag, {
      primarySourceId: hashed.id,
      sourceReviewState: 'REVIEWED_WITH_LIMITS',
    });
    expect(outcome(claim)).toEqual([422, 'REVIEW_UNSUPPORTED']);
    const event = await postEvent(w.mandate.data.id, w.mandate.etag, {
      sourceId: hashed.id,
      provenance: 'DOCUMENT_REVIEWED',
    });
    expect(outcome(event)).toEqual([422, 'REVIEW_UNSUPPORTED']);
    expect((await getSource(hashed.id)).reportedProvenance).toBe('OPERATOR_REPORTED');
  });

  it('3. a canonical binding does not upgrade provenance', async () => {
    const w = await world();
    const bound = versioned<Mandate>(
      await client.write(
        'bindCanonicalMandate',
        'POST',
        `/mandates/${w.mandate.data.id}/canonical-bindings`,
        { canonicalCode: 'SYN-DR-3', sourceId: w.source.id, reason: 'synthetic' },
        { ifMatch: w.mandate.etag },
      ),
      200,
    );
    expect(bound.data.canonicalSourceId).toBe(w.source.id);
    expect((await getSource(w.source.id)).reportedProvenance).toBe('OPERATOR_REPORTED');
    const event = await postEvent(w.mandate.data.id, bound.etag, {
      sourceId: w.source.id,
      provenance: 'DOCUMENT_REVIEWED',
    });
    expect(outcome(event)).toEqual([422, 'REVIEW_UNSUPPORTED']);
  });

  it('4. a source revision does not upgrade provenance, in either direction of the chain', async () => {
    const w = await world();
    const agencyId = w.agency.data.id;
    const reviewed = await reviewedSource(agencyId);
    const revision = immutable<SourceReference>(
      await reviseSource(reviewed.id, { agencyId, title: 'SYNTHETIC reviewed agreement (rev 2)' }),
      201,
    );
    // The review of revision 1 is not inherited by revision 2 …
    expect(revision.reportedProvenance).toBe('OPERATOR_REPORTED');
    expect((await getSource(reviewed.id)).reportedProvenance).toBe('DOCUMENT_REVIEWED');
    const event = await postEvent(w.mandate.data.id, w.mandate.etag, {
      sourceId: revision.id,
      provenance: 'DOCUMENT_REVIEWED',
    });
    expect(outcome(event)).toEqual([422, 'REVIEW_UNSUPPORTED']);
    // … and revising an unreviewed source upgrades neither revision.
    const plainRevision = immutable<SourceReference>(
      await reviseSource(w.source.id, { agencyId, title: 'SYNTHETIC rev 2' }),
      201,
    );
    expect([
      (await getSource(w.source.id)).reportedProvenance,
      plainRevision.reportedProvenance,
    ]).toEqual(['OPERATOR_REPORTED', 'OPERATOR_REPORTED']);
  });

  it('5. P3B records never upgrade a source or a version: freeze, coverage basis, signer source and events leave provenance as captured', async () => {
    const c = await chain();
    const reviewed = await reviewedSource(c.agency.data.id);
    const version = await createVersion(c.mandate.data.id, {
      primarySourceId: reviewed.id,
      additionalSourceRefs: [{ sourceId: c.source.id, role: 'SYNTHETIC', scopeText: 'Synthetic' }],
    });
    await freeze(c.version.data.id);
    await freeze(version.data.id);
    await recordEvent(c.mandate.data.id, { sourceId: c.source.id });
    expect((await getVersion(version.data.id)).data.sourceReviewState).toBe('UNREVIEWED');
    expect((await getSource(c.source.id)).reportedProvenance).toBe('OPERATOR_REPORTED');
    expect((await getSource(reviewed.id)).reportedProvenance).toBe('DOCUMENT_REVIEWED');
    const provenances = await prisma.sourceReference.groupBy({
      by: ['reportedProvenance'],
      _count: { _all: true },
    });
    expect(
      Object.fromEntries(provenances.map((row) => [row.reportedProvenance, row._count._all])),
    ).toEqual({ OPERATOR_REPORTED: 1, DOCUMENT_REVIEWED: 1 });
  });
});

describe('CONTAMINATION — no transfer across agencies, owners, routes, coverages or cases; the User is not a Signer', () => {
  it('a Mandate of Agency A never supports Agency B: routes, signers, sources, preferences, predecessors and bindings', async () => {
    const a = await chain('A', { frozen: true });
    const b = await chain('B', { frozen: true });
    const draft = await createVersion(a.mandate.data.id, {
      changeKind: 'AMENDMENT',
      predecessorId: a.version.data.id,
    });
    const draftCoverage = await createCoverage(draft.data.id, {
      routeId: a.route.data.id,
      coverageLabel: 'SYNTHETIC A draft',
    });
    const bDraft = await createVersion(b.mandate.data.id, {
      changeKind: 'AMENDMENT',
      predecessorId: b.version.data.id,
    });
    const attempts: Array<[string, () => Promise<HttpResult>, number, string]> = [
      [
        'B route under an A version',
        async () =>
          postCoverage(draft.data.id, (await getVersion(draft.data.id)).etag, {
            routeId: b.route.data.id,
          }),
        422,
        'CROSS_AGENCY_REFERENCE',
      ],
      [
        'B signer under an A coverage',
        () =>
          postCoverageSigner(draftCoverage.data.id, draftCoverage.etag, {
            signerId: b.signer.data.id,
          }),
        422,
        'CROSS_AGENCY_REFERENCE',
      ],
      [
        'B source cited by an A version',
        async () =>
          patchVersion(draft.data.id, (await getVersion(draft.data.id)).etag, {
            primarySourceId: b.source.id,
          }),
        422,
        'CROSS_AGENCY_REFERENCE',
      ],
      [
        'B source for an A event',
        async () =>
          postEvent(a.mandate.data.id, (await getMandate(a.mandate.data.id)).etag, {
            sourceId: b.source.id,
          }),
        422,
        'CROSS_AGENCY_REFERENCE',
      ],
      [
        'A coverage preferred by a B route',
        async () =>
          patchRoute(b.route.data.id, (await getRoute(b.route.data.id)).etag, {
            preferredCoverageId: a.coverage.data.id,
          }),
        422,
        'CROSS_AGENCY_REFERENCE',
      ],
      [
        'an A version as predecessor in B',
        async () =>
          postVersion(b.mandate.data.id, (await getMandate(b.mandate.data.id)).etag, {
            changeKind: 'AMENDMENT',
            predecessorId: a.version.data.id,
          }),
        422,
        'AUTHORITY_SCOPE_UNRESOLVED',
      ],
      [
        'an A coverage as lineage of a B coverage',
        async () =>
          postCoverage(bDraft.data.id, (await getVersion(bDraft.data.id)).etag, {
            routeId: b.route.data.id,
            coverageLabel: 'SYNTHETIC B lineage',
            predecessorCoverageId: a.coverage.data.id,
          }),
        422,
        'AUTHORITY_SCOPE_UNRESOLVED',
      ],
      [
        'an A coverage in a B event',
        async () =>
          postEvent(b.mandate.data.id, (await getMandate(b.mandate.data.id)).etag, {
            coverageId: a.coverage.data.id,
            sourceId: b.source.id,
          }),
        422,
        'AUTHORITY_SCOPE_UNRESOLVED',
      ],
      [
        'a B source as the A mandate binding',
        async () =>
          client.write(
            'bindCanonicalMandate',
            'POST',
            `/mandates/${a.mandate.data.id}/canonical-bindings`,
            { canonicalCode: 'SYN-CROSS', sourceId: b.source.id, reason: 'synthetic' },
            { ifMatch: (await getMandate(a.mandate.data.id)).etag },
          ),
        422,
        'CROSS_AGENCY_REFERENCE',
      ],
    ];
    for (const [label, run, status, errorCode] of attempts) {
      expect(outcome(await run()), label).toEqual([status, errorCode]);
    }
    // Nothing of A appears under B.
    const bCoverages = await prisma.mandateCoverage.findMany({
      where: { agencyId: b.agency.data.id },
    });
    expect(bCoverages.map((row) => row.routeId)).toEqual([b.route.data.id]);
    const bSigners = await prisma.coverageSigner.findMany({
      where: { agencyId: b.agency.data.id },
    });
    expect(bSigners.map((row) => row.signerId)).toEqual([b.signer.data.id]);
    expect((await getRoute(b.route.data.id)).data.preferredCoverageId).toBeNull();
    expect(await countRows(prisma, 'authority_events')).toBe(0);
  });

  it('one Owner’s authority chain never transfers to another Owner: route-level material stays with its owner', async () => {
    const x = await world('X');
    const agencyId = x.agency.data.id;
    const y = await anotherRoute(agencyId, 'Y');
    const version = await createVersion(x.mandate.data.id, { primarySourceId: x.source.id });
    const xCoverage = await createCoverage(version.data.id, {
      routeId: x.route.data.id,
      basisSourceId: x.source.id,
    });
    const yCoverage = await createCoverage(version.data.id, {
      routeId: y.route.data.id,
      coverageLabel: 'SYNTHETIC Y coverage',
    });
    // Material recorded for Owner X's route cannot support Owner Y's route.
    const basis = await patchCoverage(yCoverage.data.id, yCoverage.etag, {
      basisSourceId: x.source.id,
    });
    expect([basis.status, errorOf(basis).code, errorOf(basis).details]).toEqual([
      422,
      'CROSS_OWNER_REFERENCE',
      { field: 'basisSourceId', ownerId: x.owner.data.id },
    ]);
    const signer = await postCoverageSigner(yCoverage.data.id, yCoverage.etag, {
      signerId: x.signer.data.id,
      sourceId: x.source.id,
    });
    expect(outcome(signer)).toEqual([422, 'CROSS_OWNER_REFERENCE']);
    await freeze(version.data.id);
    const event = await postEvent(x.mandate.data.id, (await getMandate(x.mandate.data.id)).etag, {
      coverageId: yCoverage.data.id,
      sourceId: x.source.id,
    });
    expect(outcome(event)).toEqual([422, 'CROSS_OWNER_REFERENCE']);
    const yRoute = await getRoute(y.route.data.id);
    const binding = await client.write(
      'bindCanonicalRoute',
      'POST',
      `/routes/${y.route.data.id}/canonical-bindings`,
      { canonicalCode: 'SYN-Y', sourceId: x.source.id, reason: 'synthetic' },
      { ifMatch: yRoute.etag },
    );
    expect(outcome(binding)).toEqual([422, 'CROSS_OWNER_REFERENCE']);
    const preference = await patchRoute(y.route.data.id, yRoute.etag, {
      preferredCoverageId: xCoverage.data.id,
    });
    expect(outcome(preference)).toEqual([422, 'AUTHORITY_SCOPE_UNRESOLVED']);
    // The version-level citation is agency material of the mandate and stays usable for its
    // whole-mandate events; X's coverage itself is unchanged.
    const whole = await recordEvent(x.mandate.data.id, { sourceId: x.source.id });
    expect(whole.coverageId).toBeNull();
    expect((await getCoverage(xCoverage.data.id)).data).toEqual(xCoverage.data);
    expect((await getCoverage(yCoverage.data.id)).data.basisSourceId).toBeNull();
  });

  it('a coverage never broadens to another route, and no case-scoped fact or source is used anywhere', async () => {
    const c = await chain();
    const second = await anotherRoute(c.agency.data.id, 'Second');
    const listed = await listOf<MandateCoverage>(
      'listVersionCoverages',
      `/mandate-versions/${c.version.data.id}/coverages?q=${second.route.data.id}`,
    );
    expect(listed.items).toEqual([]);
    const caseScoped = await insertSource(prisma, client.session.userId, {
      agencyId: c.agency.data.id,
      sourceRole: 'CANONICAL_RECORD',
      scopeBindings: { caseIds: [randomUUID()] },
    });
    const version = await getVersion(c.version.data.id);
    const annex = [{ sourceId: caseScoped, role: 'SYNTHETIC', scopeText: 'Synthetic' }];
    const signedDate = [{ subjectLabel: 'SYNTHETIC', dateRaw: 'SYNTHETIC', sourceId: caseScoped }];
    const attempts: Array<[string, () => Promise<HttpResult>]> = [
      [
        'version primary',
        () => patchVersion(version.data.id, version.etag, { primarySourceId: caseScoped }),
      ],
      [
        'version annex',
        () => patchVersion(version.data.id, version.etag, { additionalSourceRefs: annex }),
      ],
      [
        'signed date',
        () => patchVersion(version.data.id, version.etag, { signedDatesRaw: signedDate }),
      ],
      [
        'coverage basis',
        () => patchCoverage(c.coverage.data.id, c.coverage.etag, { basisSourceId: caseScoped }),
      ],
      [
        'coverage signer',
        () =>
          postCoverageSigner(c.coverage.data.id, c.coverage.etag, {
            signerId: c.signer.data.id,
            capacity: 'SYNTHETIC other',
            sourceId: caseScoped,
          }),
      ],
      ['event', () => postEvent(c.mandate.data.id, c.mandate.etag, { sourceId: caseScoped })],
      [
        'mandate binding',
        () =>
          client.write(
            'bindCanonicalMandate',
            'POST',
            `/mandates/${c.mandate.data.id}/canonical-bindings`,
            { canonicalCode: 'SYN-CASE', sourceId: caseScoped, reason: 'synthetic' },
            { ifMatch: c.mandate.etag },
          ),
      ],
    ];
    for (const [label, run] of attempts) {
      const refused = await run();
      expect(
        [refused.status, errorOf(refused).code, errorOf(refused).details['reason']],
        label,
      ).toEqual([422, 'SOURCE_SCOPE_UNRESOLVED', 'CASE_SCOPED_SOURCE']);
    }
    await expectNoCaseRecords();
  });

  it('the application User is never substituted for a Signer anywhere in the chain', async () => {
    const c = await chain('A', { frozen: true });
    const route = await getRoute(c.route.data.id);
    versioned(
      await patchRoute(route.data.id, route.etag, { preferredCoverageId: c.coverage.data.id }),
      200,
    );
    await recordEvent(c.mandate.data.id, { sourceId: c.source.id });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: client.session.userId } });
    const signers = await prisma.signer.findMany();
    expect(signers.map((row) => row.id)).toEqual([c.signer.data.id]);
    expect(signers.some((row) => row.id === user.id)).toBe(false);
    const associations = await prisma.coverageSigner.findMany();
    expect(associations.map((row) => row.signerId)).toEqual([c.signer.data.id]);
    // The User appears only as the recorder of each row, never as a party.
    for (const row of [
      ...(await prisma.mandate.findMany()),
      ...(await prisma.mandateVersion.findMany()),
      ...(await prisma.mandateCoverage.findMany()),
      ...associations,
    ]) {
      expect(row.createdById).toBe(user.id);
    }
    const asSigner = await postCoverageSigner(c.coverage.data.id, c.coverage.etag, {
      signerId: user.id,
    });
    expect(outcome(asSigner)).toEqual([409, 'FROZEN_VERSION']);
    const draft = await createVersion(c.mandate.data.id, {
      changeKind: 'AMENDMENT',
      predecessorId: c.version.data.id,
    });
    const draftCoverage = await createCoverage(draft.data.id, { routeId: c.route.data.id });
    const userAsSigner = await postCoverageSigner(draftCoverage.data.id, draftCoverage.etag, {
      signerId: user.id,
    });
    expect([
      userAsSigner.status,
      errorOf(userAsSigner).code,
      errorOf(userAsSigner).details,
    ]).toEqual([422, 'REFERENCE_NOT_FOUND', { field: 'signerId' }]);
  });
});

describe('SHARED WRITE LAYER — If-Match, Idempotency-Key, atomic audit', () => {
  /** The 13 P3B operations with a contracted precondition, each with a valid request. */
  async function conditionalWrites() {
    const c = await chain();
    const spare = await createMandate(c.agency.data.id, { label: 'SYNTHETIC spare' });
    const canonical = await createSource({ agencyId: c.agency.data.id, title: 'SYNTHETIC code' });
    const writes: Array<{
      operationId: string;
      method: 'POST' | 'PATCH' | 'DELETE';
      path: string;
      body?: Record<string, unknown>;
      target: string;
    }> = [
      {
        operationId: 'patchMandate',
        method: 'PATCH',
        path: `/mandates/${c.mandate.data.id}`,
        body: { label: 'x' },
        target: `Mandate:${c.mandate.data.id}`,
      },
      {
        operationId: 'deleteUnusedMandate',
        method: 'DELETE',
        path: `/mandates/${spare.data.id}`,
        target: `Mandate:${spare.data.id}`,
      },
      {
        operationId: 'archiveMandate',
        method: 'POST',
        path: `/mandates/${c.mandate.data.id}/archive`,
        body: { reason: 'x' },
        target: `Mandate:${c.mandate.data.id}`,
      },
      {
        operationId: 'restoreMandate',
        method: 'POST',
        path: `/mandates/${c.mandate.data.id}/restore`,
        body: { reason: 'x' },
        target: `Mandate:${c.mandate.data.id}`,
      },
      {
        operationId: 'bindCanonicalMandate',
        method: 'POST',
        path: `/mandates/${c.mandate.data.id}/canonical-bindings`,
        body: { canonicalCode: 'SYN-PRE', sourceId: canonical.id, reason: 'x' },
        target: `Mandate:${c.mandate.data.id}`,
      },
      {
        operationId: 'createMandateVersion',
        method: 'POST',
        path: `/mandates/${c.mandate.data.id}/versions`,
        body: VERSION,
        target: `Mandate:${c.mandate.data.id}`,
      },
      {
        operationId: 'recordAuthorityEvent',
        method: 'POST',
        path: `/mandates/${c.mandate.data.id}/events`,
        body: { ...EVENT, sourceId: c.source.id },
        target: `Mandate:${c.mandate.data.id}`,
      },
      {
        operationId: 'patchDraftMandateVersion',
        method: 'PATCH',
        path: `/mandate-versions/${c.version.data.id}`,
        body: { validityNotes: 'x' },
        target: `MandateVersion:${c.version.data.id}`,
      },
      {
        operationId: 'freezeMandateVersion',
        method: 'POST',
        path: `/mandate-versions/${c.version.data.id}/freeze`,
        body: FREEZE,
        target: `MandateVersion:${c.version.data.id}`,
      },
      {
        operationId: 'createCoverage',
        method: 'POST',
        path: `/mandate-versions/${c.version.data.id}/coverages`,
        body: { routeId: c.route.data.id, coverageLabel: 'SYNTHETIC precondition' },
        target: `MandateVersion:${c.version.data.id}`,
      },
      {
        operationId: 'patchDraftCoverage',
        method: 'PATCH',
        path: `/coverages/${c.coverage.data.id}`,
        body: { territorialScope: 'x' },
        target: `MandateCoverage:${c.coverage.data.id}`,
      },
      {
        operationId: 'createCoverageSigner',
        method: 'POST',
        path: `/coverages/${c.coverage.data.id}/signers`,
        body: { signerId: c.signer.data.id, capacity: 'SYNTHETIC precondition' },
        target: `MandateCoverage:${c.coverage.data.id}`,
      },
      {
        operationId: 'deleteDraftCoverageSigner',
        method: 'DELETE',
        path: `/coverage-signers/${c.coverageSigner.data.id}`,
        target: `CoverageSigner:${c.coverageSigner.data.id}`,
      },
    ];
    return { c, spare, writes };
  }

  it('the 13 conditional operations: 428 without If-Match, 412 for a stale or another record’s ETag; nothing is written', async () => {
    const { c, spare, writes } = await conditionalWrites();
    const contracted = operations
      .filter(
        (operation) =>
          (operation.tags as readonly string[]).includes('Mandate') && operation.preconditionTarget,
      )
      .map((operation) => operation.operationId)
      .sort();
    expect(writes.map((write) => write.operationId).sort()).toEqual(contracted);
    const ids = {
      mandate: c.mandate.data.id,
      version: c.version.data.id,
      coverage: c.coverage.data.id,
      coverageSigner: c.coverageSigner.data.id,
    };
    const before = await versionsOf(ids);
    const counts = async () =>
      Promise.all(
        [
          'mandates',
          'mandate_versions',
          'mandate_coverages',
          'coverage_signers',
          'authority_events',
        ].map((table) => countRows(prisma, table)),
      );
    const countsBefore = await counts();
    for (const write of writes) {
      const noMatch = await client.write(write.operationId, write.method, write.path, write.body);
      expect(outcome(noMatch), write.operationId).toEqual([428, 'PRECONDITION_REQUIRED']);
      const [type, id] = write.target.split(':');
      const stale = await client.write(write.operationId, write.method, write.path, write.body, {
        ifMatch: `"${type}:${id}:v99"`,
      });
      expect(outcome(stale), write.operationId).toEqual([412, 'RECORD_VERSION_CONFLICT']);
      const foreign = await client.write(write.operationId, write.method, write.path, write.body, {
        ifMatch: `"Agency:${c.agency.data.id}:v1"`,
      });
      expect(outcome(foreign), write.operationId).toEqual([412, 'RECORD_VERSION_CONFLICT']);
    }
    expect(await versionsOf(ids)).toEqual(before);
    expect(await counts()).toEqual(countsBefore);
    expect((await getMandate(spare.data.id)).data.rowVersion).toBe(1);
    expect(
      await prisma.idempotencyRecord.count({
        where: { state: 'COMPLETED', responseStatus: { gte: 400 } },
      }),
    ).toBe(0);
  });

  it('Idempotency-Key per write family: required; an exact replay returns the stored result once; another payload is 409', async () => {
    const c = await chain();
    const draft = await createVersion(c.mandate.data.id, { changeKind: 'DOCUMENT_CAPTURE' });
    const families: Array<{
      label: string;
      send: (key: string | null, variant?: boolean) => Promise<HttpResult>;
      status: number;
      table: string;
      action: string;
    }> = [];
    const mandateEtag = (await getMandate(c.mandate.data.id)).etag;
    const draftEtag = (await getVersion(draft.data.id)).etag;
    families.push(
      {
        label: 'create Mandate',
        send: (key, variant) =>
          postMandate(
            { agencyId: c.agency.data.id, label: variant ? 'SYNTHETIC B' : 'SYNTHETIC A' },
            { key },
          ),
        status: 201,
        table: 'mandates',
        action: 'MANDATE_CREATED',
      },
      {
        label: 'create MandateVersion',
        send: (key, variant) =>
          postVersion(
            c.mandate.data.id,
            mandateEtag,
            { changeReason: variant ? 'B' : 'A' },
            { key },
          ),
        status: 201,
        table: 'mandate_versions',
        action: 'MANDATE_VERSION_CREATED',
      },
      {
        label: 'create Coverage',
        send: (key, variant) =>
          postCoverage(
            draft.data.id,
            draftEtag,
            { routeId: c.route.data.id, coverageLabel: variant ? 'SYNTHETIC B' : 'SYNTHETIC A' },
            { key },
          ),
        status: 201,
        table: 'mandate_coverages',
        action: 'MANDATE_COVERAGE_CREATED',
      },
      {
        label: 'create CoverageSigner',
        send: (key, variant) =>
          postCoverageSigner(
            c.coverage.data.id,
            c.coverage.etag,
            { signerId: c.signer.data.id, capacity: variant ? 'SYNTHETIC B' : 'SYNTHETIC A' },
            { key },
          ),
        status: 201,
        table: 'coverage_signers',
        action: 'COVERAGE_SIGNER_CREATED',
      },
    );
    for (const family of families) {
      const missing = await family.send(null);
      expect(outcome(missing), family.label).toEqual([400, 'IDEMPOTENCY_KEY_REQUIRED']);
      const key = newKey();
      const rowsBefore = await countRows(prisma, family.table);
      const first = await family.send(key);
      expect(first.status, `${family.label} ${first.text}`).toBe(family.status);
      const replay = await family.send(key);
      expect(replayView(replay), family.label).toEqual(replayView(first));
      expect(await countRows(prisma, family.table), family.label).toBe(rowsBefore + 1);
      const id = (first.json as { data: { id: string } }).data.id;
      expect(await auditCount(family.action, id), family.label).toBe(1);
      const conflict = await family.send(key, true);
      expect(outcome(conflict), family.label).toEqual([409, 'IDEMPOTENCY_CONFLICT']);
    }
    // Freeze, coverage-signer removal and event recording replay the same way.
    const version = await getVersion(draft.data.id);
    const freezeKey = newKey();
    const frozen = await freezeVersion(draft.data.id, version.etag, FREEZE, { key: freezeKey });
    expect(frozen.status).toBe(200);
    const frozenReplay = await freezeVersion(draft.data.id, version.etag, FREEZE, {
      key: freezeKey,
    });
    expect(replayView(frozenReplay)).toEqual(replayView(frozen));
    expect(await auditCount('MANDATE_VERSION_FROZEN', draft.data.id)).toBe(1);
    const freezeConflict = await freezeVersion(
      draft.data.id,
      version.etag,
      { reason: 'other' },
      { key: freezeKey },
    );
    expect(outcome(freezeConflict)).toEqual([409, 'IDEMPOTENCY_CONFLICT']);
    const association = await getCoverageSigner(c.coverageSigner.data.id);
    const removeKey = newKey();
    const removed = await deleteCoverageSigner(association.data.id, association.etag, {
      key: removeKey,
    });
    const removedReplay = await deleteCoverageSigner(association.data.id, association.etag, {
      key: removeKey,
    });
    expect([removed.status, removedReplay.status, removedReplay.text]).toEqual([204, 204, '']);
    expect(await auditCount('COVERAGE_SIGNER_DELETED', association.data.id)).toBe(1);
    const mandate = await getMandate(c.mandate.data.id);
    const eventKey = newKey();
    const event = await postEvent(
      c.mandate.data.id,
      mandate.etag,
      { sourceId: c.source.id },
      { key: eventKey },
    );
    const eventReplay = await postEvent(
      c.mandate.data.id,
      mandate.etag,
      { sourceId: c.source.id },
      { key: eventKey },
    );
    expect(event.status).toBe(201);
    expect(replayView(eventReplay)).toEqual(replayView(event));
    expect(await countRows(prisma, 'authority_events')).toBe(1);
    const eventConflict = await postEvent(
      c.mandate.data.id,
      mandate.etag,
      { sourceId: c.source.id, interpretation: 'SYNTHETIC other reading' },
      { key: eventKey },
    );
    expect(outcome(eventConflict)).toEqual([409, 'IDEMPOTENCY_CONFLICT']);
  });

  it('in progress and failures: a running claim is 409 with Retry-After and writes nothing; a refused request is never stored', async () => {
    const w = await world();
    const key = newKey();
    const first = versioned<MandateVersion>(
      await postVersion(w.mandate.data.id, w.mandate.etag, {}, { key }),
      201,
    );
    // Turn the completed record back into a fresh claim and undo its effect: a request in flight.
    const record = await prisma.idempotencyRecord.findFirstOrThrow({
      where: { idempotencyKey: key },
    });
    await prisma.mandateVersion.delete({ where: { id: first.data.id } });
    await prisma.mandate.update({ where: { id: w.mandate.data.id }, data: { rowVersion: 1 } });
    await prisma.idempotencyRecord.update({
      where: { id: record.id },
      data: {
        state: 'IN_PROGRESS',
        responseStatus: null,
        responseJson: Prisma.DbNull,
        createdAt: new Date(t.clock.ms),
      },
    });
    const busy = await postVersion(w.mandate.data.id, w.mandate.etag, {}, { key });
    expect([busy.status, code(busy), busy.headers['retry-after']]).toEqual([
      409,
      'IDEMPOTENCY_IN_PROGRESS',
      '1',
    ]);
    expect(await countRows(prisma, 'mandate_versions')).toBe(0);
    await prisma.idempotencyRecord.update({
      where: { id: record.id },
      data: { createdAt: new Date(t.clock.ms - 61_000) },
    });
    const resumed = versioned<MandateVersion>(
      await postVersion(w.mandate.data.id, w.mandate.etag, {}, { key }),
      201,
    );
    expect(resumed.data.id).not.toBe(first.data.id);
    expect(await countRows(prisma, 'mandate_versions')).toBe(1);
    // A refusal releases its claim: once the cause is gone, the same key and body succeed.
    const version = await getVersion(resumed.data.id);
    const coverage = await createCoverage(version.data.id, { routeId: w.route.data.id });
    const signerKey = newKey();
    const archivedSigner = await createSigner(w.agency.data.id, 'SYNTHETIC Archived Person');
    const archived = versioned<Signer>(
      await archive('archiveSigner', `/signers/${archivedSigner.data.id}`, archivedSigner.etag),
      200,
    );
    const body = { signerId: archivedSigner.data.id };
    const refused = await postCoverageSigner(coverage.data.id, coverage.etag, body, {
      key: signerKey,
    });
    expect(outcome(refused)).toEqual([409, 'RECORD_STATE_CONFLICT']);
    expect(await prisma.idempotencyRecord.count({ where: { idempotencyKey: signerKey } })).toBe(0);
    versioned(
      await client.write(
        'restoreSigner',
        'POST',
        `/signers/${archivedSigner.data.id}/restore`,
        { reason: 'SYNTHETIC' },
        { ifMatch: archived.etag },
      ),
      200,
    );
    versioned(
      await postCoverageSigner(coverage.data.id, coverage.etag, body, { key: signerKey }),
      201,
    );
  });

  it('replays re-check the security context: keys are scoped to their actor; no session or CSRF token is refused before any replay', async () => {
    const agency = await createAgency();
    const key = newKey();
    const body = { agencyId: agency.data.id, label: 'SYNTHETIC scoped key' };
    const mine = versioned<Mandate>(await postMandate(body, { key }), 201);
    const other = new DirectoryClient(t.port, await signIn(t.port, prisma), collected);
    const theirs = versioned<Mandate>(
      await other.write('createMandate', 'POST', '/mandates', { ...MANDATE, ...body }, { key }),
      201,
    );
    expect(theirs.data.id).not.toBe(mine.data.id);
    expect(theirs.data.createdById).toBe(other.session.userId);
    const noSession = await http(t.port, 'POST', '/api/v1/mandates', {
      headers: {
        Origin: ALLOWED_ORIGIN,
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
      },
      body: JSON.stringify({ ...MANDATE, ...body }),
    });
    expect(noSession.status).toBe(401);
    const badCsrf = await postMandate(body, { key, headers: { 'X-CSRF-Token': 'not-the-token' } });
    expect(outcome(badCsrf)).toEqual([403, 'CSRF_TOKEN_INVALID']);
    const wrongOrigin = await postMandate(body, {
      key,
      headers: { Origin: 'http://evil.example.invalid' },
    });
    expect(wrongOrigin.status).toBe(403);
    expect(await countRows(prisma, 'mandates')).toBe(2);
  });

  it('two tabs: a write with an ETag read before another tab’s change is 412 — mandate, draft version, freeze, coverage and coverage signer', async () => {
    const c = await chain();
    // Mandate.
    const tab1 = await getMandate(c.mandate.data.id);
    const tab2 = await getMandate(c.mandate.data.id);
    versioned(await patchMandate(tab1.data.id, tab1.etag, { label: 'SYNTHETIC tab 1' }), 200);
    const lost = await patchMandate(tab2.data.id, tab2.etag, { notes: 'SYNTHETIC tab 2' });
    expect(outcome(lost)).toEqual([412, 'RECORD_VERSION_CONFLICT']);
    expect((await getMandate(c.mandate.data.id)).data).toMatchObject({
      label: 'SYNTHETIC tab 1',
      notes: null,
    });
    // Draft version, and a freeze of a version someone just edited.
    const v1 = await getVersion(c.version.data.id);
    versioned(await patchVersion(v1.data.id, v1.etag, { validityNotes: 'SYNTHETIC tab 1' }), 200);
    expect(
      outcome(await patchVersion(v1.data.id, v1.etag, { validityModel: 'FIXED_TERM' })),
    ).toEqual([412, 'RECORD_VERSION_CONFLICT']);
    expect(outcome(await freezeVersion(v1.data.id, v1.etag))).toEqual([
      412,
      'RECORD_VERSION_CONFLICT',
    ]);
    expect((await getVersion(v1.data.id)).data).toMatchObject({
      versionState: 'DRAFT',
      validityNotes: 'SYNTHETIC tab 1',
      validityModel: 'UNKNOWN',
    });
    // Coverage: an edit, and a signer added against the old coverage ETag.
    const cov = await getCoverage(c.coverage.data.id);
    versioned(await patchCoverage(cov.data.id, cov.etag, { conditions: 'SYNTHETIC tab 1' }), 200);
    expect(outcome(await patchCoverage(cov.data.id, cov.etag, { exclusions: 'x' }))).toEqual([
      412,
      'RECORD_VERSION_CONFLICT',
    ]);
    expect(
      outcome(
        await postCoverageSigner(cov.data.id, cov.etag, {
          signerId: c.signer.data.id,
          capacity: 'SYNTHETIC tab 2',
        }),
      ),
    ).toEqual([412, 'RECORD_VERSION_CONFLICT']);
    // A child edit moves the version: a version ETag read before it is stale for the freeze.
    const beforeChild = await getVersion(c.version.data.id);
    versioned(
      await patchCoverage(cov.data.id, (await getCoverage(cov.data.id)).etag, {
        exclusions: 'SYNTHETIC tab 1',
      }),
      200,
    );
    expect(outcome(await freezeVersion(beforeChild.data.id, beforeChild.etag))).toEqual([
      412,
      'RECORD_VERSION_CONFLICT',
    ]);
    // Coverage signer: the second tab's removal finds it gone.
    const association = await getCoverageSigner(c.coverageSigner.data.id);
    expect((await deleteCoverageSigner(association.data.id, association.etag)).status).toBe(204);
    expect(outcome(await deleteCoverageSigner(association.data.id, association.etag))).toEqual([
      404,
      'NOT_FOUND',
    ]);
  });

  it('a failing audit insert rolls back every P3B write: no row, no version change, no idempotency record', async () => {
    const c = await chain();
    const frozenChain = await chain('F', { frozen: true });
    const canonical = await createSource({ agencyId: c.agency.data.id, title: 'SYNTHETIC code' });
    const spare = await createMandate(c.agency.data.id, { label: 'SYNTHETIC spare' });
    const ids = {
      mandate: c.mandate.data.id,
      version: c.version.data.id,
      coverage: c.coverage.data.id,
      coverageSigner: c.coverageSigner.data.id,
      route: frozenChain.route.data.id,
    };
    const before = await versionsOf(ids);
    const tables = [
      'mandates',
      'mandate_versions',
      'mandate_coverages',
      'coverage_signers',
      'authority_events',
    ];
    const counts = async () => Promise.all(tables.map((table) => countRows(prisma, table)));
    const countsBefore = await counts();
    const route = await getRoute(frozenChain.route.data.id);
    const idempotencyBefore = await prisma.idempotencyRecord.count();
    const attempts: Array<[string, () => Promise<HttpResult>]> = [
      ['createMandate', () => postMandate({ agencyId: c.agency.data.id })],
      ['patchMandate', () => patchMandate(c.mandate.data.id, c.mandate.etag, { label: 'x' })],
      [
        'archiveMandate',
        () => archive('archiveMandate', `/mandates/${c.mandate.data.id}`, c.mandate.etag),
      ],
      [
        'bindCanonicalMandate',
        () =>
          client.write(
            'bindCanonicalMandate',
            'POST',
            `/mandates/${c.mandate.data.id}/canonical-bindings`,
            { canonicalCode: 'SYN-ROLLBACK', sourceId: canonical.id, reason: 'x' },
            { ifMatch: c.mandate.etag },
          ),
      ],
      [
        'deleteUnusedMandate',
        () =>
          client.write('deleteUnusedMandate', 'DELETE', `/mandates/${spare.data.id}`, undefined, {
            ifMatch: spare.etag,
          }),
      ],
      ['createMandateVersion', () => postVersion(c.mandate.data.id, c.mandate.etag)],
      [
        'patchDraftMandateVersion',
        () => patchVersion(c.version.data.id, c.version.etag, { validityNotes: 'x' }),
      ],
      ['freezeMandateVersion', () => freezeVersion(c.version.data.id, c.version.etag)],
      [
        'createCoverage',
        () =>
          postCoverage(c.version.data.id, c.version.etag, {
            routeId: c.route.data.id,
            coverageLabel: 'SYNTHETIC rollback',
          }),
      ],
      [
        'patchDraftCoverage',
        () => patchCoverage(c.coverage.data.id, c.coverage.etag, { conditions: 'x' }),
      ],
      [
        'createCoverageSigner',
        () =>
          postCoverageSigner(c.coverage.data.id, c.coverage.etag, {
            signerId: c.signer.data.id,
            capacity: 'SYNTHETIC rollback',
          }),
      ],
      [
        'deleteDraftCoverageSigner',
        () => deleteCoverageSigner(c.coverageSigner.data.id, c.coverageSigner.etag),
      ],
      [
        'recordAuthorityEvent',
        () => postEvent(c.mandate.data.id, c.mandate.etag, { sourceId: c.source.id }),
      ],
      [
        'patchRoute',
        () =>
          patchRoute(route.data.id, route.etag, {
            preferredCoverageId: frozenChain.coverage.data.id,
          }),
      ],
    ];
    auditWriter.armed = true;
    for (const [label, run] of attempts) {
      expect(outcome(await run()), label).toEqual([500, 'INTERNAL_ERROR']);
    }
    auditWriter.armed = false;
    expect(auditWriter.failures).toBe(attempts.length);
    expect(await versionsOf(ids)).toEqual(before);
    expect(await counts()).toEqual(countsBefore);
    expect((await getRoute(route.data.id)).data.preferredCoverageId).toBeNull();
    expect((await getMandate(spare.data.id)).data.rowVersion).toBe(1);
    // Every failed request released its claim: no idempotency record was added.
    expect(await prisma.idempotencyRecord.count()).toBe(idempotencyBefore);
  });
});

describe('SECURITY / CONTRACT', () => {
  it('no session, a bad CSRF token or a wrong Origin stops every kind of P3B write before any mutation', async () => {
    const c = await chain();
    const targets: Array<
      [string, 'POST' | 'PATCH' | 'DELETE', string, Record<string, unknown> | undefined, string]
    > = [
      ['createMandate', 'POST', '/mandates', { ...MANDATE, agencyId: c.agency.data.id }, ''],
      [
        'createMandateVersion',
        'POST',
        `/mandates/${c.mandate.data.id}/versions`,
        VERSION,
        c.mandate.etag,
      ],
      [
        'freezeMandateVersion',
        'POST',
        `/mandate-versions/${c.version.data.id}/freeze`,
        FREEZE,
        c.version.etag,
      ],
      [
        'createCoverage',
        'POST',
        `/mandate-versions/${c.version.data.id}/coverages`,
        { ...COVERAGE, routeId: c.route.data.id, coverageLabel: 'SYNTHETIC security' },
        c.version.etag,
      ],
      [
        'deleteDraftCoverageSigner',
        'DELETE',
        `/coverage-signers/${c.coverageSigner.data.id}`,
        undefined,
        c.coverageSigner.etag,
      ],
      [
        'recordAuthorityEvent',
        'POST',
        `/mandates/${c.mandate.data.id}/events`,
        { ...EVENT, sourceId: c.source.id },
        c.mandate.etag,
      ],
    ];
    const before = await versionsOf({
      mandate: c.mandate.data.id,
      version: c.version.data.id,
      coverage: c.coverage.data.id,
      coverageSigner: c.coverageSigner.data.id,
    });
    for (const [operationId, method, path, body, etag] of targets) {
      const text = body === undefined ? undefined : JSON.stringify(body);
      const noSession = await http(t.port, method, `/api/v1${path}`, {
        headers: {
          Origin: ALLOWED_ORIGIN,
          'Idempotency-Key': newKey(),
          ...(etag ? { 'If-Match': etag } : {}),
          ...(text === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(text === undefined ? {} : { body: text }),
      });
      expect(noSession.status, operationId).toBe(401);
      const badCsrf = await client.write(operationId, method, path, body, {
        ifMatch: etag || null,
        headers: { 'X-CSRF-Token': 'not-the-token' },
      });
      expect(outcome(badCsrf), operationId).toEqual([403, 'CSRF_TOKEN_INVALID']);
      const wrongOrigin = await client.write(operationId, method, path, body, {
        ifMatch: etag || null,
        headers: { Origin: 'http://evil.example.invalid' },
      });
      expect(wrongOrigin.status, operationId).toBe(403);
    }
    expect(
      await versionsOf({
        mandate: c.mandate.data.id,
        version: c.version.data.id,
        coverage: c.coverage.data.id,
        coverageSigner: c.coverageSigner.data.id,
      }),
    ).toEqual(before);
    expect(await countRows(prisma, 'mandates')).toBe(1);
    expect(await countRows(prisma, 'authority_events')).toBe(0);
  });

  it('a full synthetic tour: source → mandate → version → coverage → coverage signer → freeze → preferred coverage → event, plus expected refusals', async () => {
    const w = await world('Tour');
    const version = await createVersion(w.mandate.data.id, {
      primarySourceId: w.source.id,
      documentState: 'SIGNED_APPEARING',
      effectiveOn: '2025-01-01',
    });
    const coverage = await createCoverage(version.data.id, {
      routeId: w.route.data.id,
      basisSourceId: w.source.id,
      actionScope: ['PREPARE_NOTICE', 'SUBMIT_NOTICE'],
    });
    const association = await addCoverageSigner(coverage.data.id, {
      signerId: w.signer.data.id,
      sourceId: w.source.id,
    });
    const frozen = await freeze(version.data.id);
    expect(frozen.data.versionState).toBe('FROZEN');
    // Expected refusal: a frozen version gains no coverage.
    const late = await postCoverage(version.data.id, frozen.etag, {
      routeId: w.route.data.id,
      coverageLabel: 'SYNTHETIC late',
    });
    expect(outcome(late)).toEqual([409, 'FROZEN_VERSION']);
    const route = await getRoute(w.route.data.id);
    const preferred = versioned<Route>(
      await patchRoute(route.data.id, route.etag, { preferredCoverageId: coverage.data.id }),
      200,
    );
    expect(preferred.data.preferredCoverageId).toBe(coverage.data.id);
    const event = await recordEvent(w.mandate.data.id, {
      coverageId: coverage.data.id,
      sourceId: w.source.id,
      eventType: 'CURRENTNESS_RECORDED',
      effectiveOn: '2025-06-01',
    });
    expect(event).toMatchObject({ coverageId: coverage.data.id, effectiveOn: '2025-06-01' });
    // Expected refusal: another agency's coverage cannot become this route's preference.
    const other = await chain('Other', { frozen: true });
    const crossPreference = await patchRoute(route.data.id, preferred.etag, {
      preferredCoverageId: other.coverage.data.id,
    });
    expect(outcome(crossPreference)).toEqual([422, 'CROSS_AGENCY_REFERENCE']);
    expect(association.data.signerId).toBe(w.signer.data.id);
    await expectNoCaseRecords();
    expect((await getSource(w.source.id)).reportedProvenance).toBe('OPERATOR_REPORTED');
  });

  it('every collected response matches its operation: declared status, contract schema, ETag rules; all 23 P3B operations were exercised', () => {
    const byId = new Map<string, (typeof operations)[number]>(
      operations.map((operation) => [operation.operationId, operation]),
    );
    const seen = new Set<string>();
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
          // Lists, 204, SourceReferences and AuthorityEvents carry no ETag.
          expect(result.headers['etag'], label).toBeUndefined();
        }
      } else {
        expect(operation.errors as readonly string[], label).toContain(String(result.status));
        expect(OperationErrorSchema.safeParse(result.json).success, label).toBe(true);
      }
      expect(result.headers['cache-control'], label).toBe('no-store');
    }
    const p3b = operations
      .filter((operation) => (operation.tags as readonly string[]).includes('Mandate'))
      .map((operation) => operation.operationId);
    expect(p3b).toHaveLength(23);
    expect(p3b.filter((operationId) => !seen.has(operationId))).toEqual([]);
  });
});
