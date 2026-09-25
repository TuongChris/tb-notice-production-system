// P4A — Case, CaseSource and CaseAuthoritySelection over real HTTP against tb_notice_test
// (yarn test:db).
//
// Each test boots the real AppModule + configureApp pipeline on an ephemeral loopback port with a
// synthetic signed-in application User, a controllable clock and an audit writer that can be made
// to fail. Every response is recorded and checked against the active contract at the end. All data
// is synthetic; every test deletes what it created.
//
// A Case is the boundary of every case-specific record, not a legal verdict. A case source link is
// an association, not proof. A CaseAuthoritySelection is "the authority chain selected/pinned for
// evaluation in this specific Case": never G1 PASS, confirmed current authority, adjudicated
// validity, confirmed owner rights, signer eligibility, G7 or READY_FOR_SIGNER.
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Prisma, type PrismaClient } from '../../apps/api/generated/prisma/client.js';
import type {
  Agency,
  AuthorityEvent,
  CaseAuthorityCoverage,
  CaseAuthoritySelection,
  CaseAuthoritySelectionView,
  CaseRecord,
  CaseSource,
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
  DIRECTORY_SUITE_TABLES,
  DirectoryClient,
  errorOf,
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

/**
 * TB-SCHEMA-API-v1.1.0 (ADR-0004, R8 remediation): the read-back of one selection with the exact
 * CaseAuthorityCoverage rows it pinned.
 */
const R8_OPERATIONS = ['getCaseAuthoritySelection'] as const;

/** The 16 P4A operations of TB-SCHEMA-API-v1, capitalisation exactly as contracted. */
const P4A_OPERATIONS = [
  'listCases',
  'createCase',
  'getCase',
  'patchCase',
  'deleteUnusedCase',
  'ArchiveCase',
  'RestoreCase',
  'WorkflowCase',
  'RouteBindingCase',
  'CanonicalBindingCase',
  'listCaseSources',
  'linkCaseSource',
  'getCaseSource',
  'setCaseSourceLinkState',
  'selectCaseAuthority',
  'listCaseAuthoritySelections',
] as const;

/** Case records of later phases: P4A never writes any of them. */
const LATER_CASE_TABLES = [
  'reported_items',
  'case_works',
  'use_mappings',
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

const code = (result: HttpResult) => errorOf(result).code;
const outcome = (result: HttpResult) => [result.status, code(result)];

function versioned<T>(result: HttpResult, status: number): Versioned<T> {
  expect(result.status, result.text).toBe(status);
  return { data: dataOf<T>(result), etag: etagOf(result) };
}

/** An append-only or immutable resource (selection, SourceReference) or a list: no ETag. */
function immutable<T>(result: HttpResult, status: number): T {
  expect(result.status, result.text).toBe(status);
  expect(result.headers['etag']).toBeUndefined();
  return dataOf<T>(result);
}

const affectedOf = (result: HttpResult) =>
  (result.json as { meta: { affectedResources: unknown[] } }).meta.affectedResources;

const nowIso = () => new Date(t.clock.ms).toISOString();
const codePoints = (text: string) => [...text].length;

/** What a replay must reproduce: status, data, affected resources and ETag (not the requestId). */
const replayView = (result: HttpResult) => {
  const body = result.json as
    { data?: unknown; meta?: { affectedResources?: unknown } } | undefined;
  return [result.status, body?.data, body?.meta?.affectedResources, result.headers['etag']];
};

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

async function listOf<T>(operationId: string, path: string): Promise<Page<T>> {
  return immutable<Page<T>>(await client.get(operationId, path), 200);
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
const getSigner = async (id: string) =>
  versioned<Signer>(await client.get('getSigner', `/signers/${id}`), 200);
const getRoute = async (id: string) =>
  versioned<Route>(await client.get('getRoute', `/routes/${id}`), 200);
const getAssociation = async (id: string) =>
  versioned<OwnerSubject>(await client.get('getOwnerSubject', `/owner-subjects/${id}`), 200);
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

/** archive / restore of any directory or authority record (If-Match of the record). */
const command = (
  operationId: string,
  path: string,
  etag: string,
  body: Record<string, unknown> = { reason: 'SYNTHETIC administrative change' },
) => client.write(operationId, 'POST', path, body, { ifMatch: etag });

async function setRouteState(routeId: string, state: 'LINKED' | 'PAUSED' | 'UNLINKED') {
  const route = await getRoute(routeId);
  return versioned<Route>(
    await command('setRouteLinkState', `/routes/${routeId}/link-state`, route.etag, {
      state,
      reason: `SYNTHETIC route ${state}`,
    }),
    200,
  );
}

const SOURCE_BASE = {
  title: 'SYNTHETIC case record (test only; not evidence)',
  sourceRole: 'CANONICAL_RECORD',
  scopeText: 'Synthetic scope description',
};

const postSource = (body: Record<string, unknown>) =>
  client.write('createSource', 'POST', '/sources', { ...SOURCE_BASE, ...body });
const createSource = async (body: Record<string, unknown> = {}) =>
  immutable<SourceReference>(await postSource(body), 201);
const reviseSource = async (id: string, body: Record<string, unknown> = {}) =>
  immutable<SourceReference>(
    await client.write('reviseSource', 'POST', `/sources/${id}/revisions`, {
      ...SOURCE_BASE,
      ...body,
    }),
    201,
  );

// authority records (P3B) -----------------------------------------------------------------------

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
const getCoverageSigner = async (id: string) =>
  versioned<CoverageSigner>(await client.get('getCoverageSigner', `/coverage-signers/${id}`), 200);

/**
 * Agency A with one agency-owned source, Owner X – LegalSubject L (LINKED), the route of A over
 * that association and a Signer of A. Nothing else.
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
  const signer = await createSigner(agency.data.id, `SYNTHETIC ${label} Signer Person`);
  const source = await createSource({
    agencyId: agency.data.id,
    title: `SYNTHETIC ${label} agency record`,
  });
  return { agency, owner, subject, association, route, signer, source };
}
type World = Awaited<ReturnType<typeof world>>;

/**
 * One mandate of the world's agency with one version (primary source: the agency source), one
 * coverage of a route (default: the world's) whose basis is a new agency source, and a signer
 * (default: the world's) recorded under it. Frozen unless `frozen: false`.
 */
async function authority(
  w: World,
  options: {
    frozen?: boolean;
    routeId?: string;
    signerId?: string;
    label?: string;
    version?: Record<string, unknown>;
  } = {},
) {
  const label = options.label ?? 'mandate';
  const mandate = await createMandate(w.agency.data.id, `SYNTHETIC ${label}`);
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
    coverageSigner: await getCoverageSigner(coverageSigner.data.id),
    basis,
  };
}
type Authority = Awaited<ReturnType<typeof authority>>;

// case records (P4A) ----------------------------------------------------------------------------

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
const patchCase = (
  id: string,
  etag: string | null,
  body: Record<string, unknown>,
  options: WriteOptions = {},
) => client.write('patchCase', 'PATCH', `/cases/${id}`, body, { ifMatch: etag, ...options });
const deleteCase = (id: string, etag: string | null, options: WriteOptions = {}) =>
  client.write('deleteUnusedCase', 'DELETE', `/cases/${id}`, undefined, {
    ifMatch: etag,
    ...options,
  });

/** A POST command on a case with the case's If-Match. */
const caseCommand = (
  operationId: string,
  caseId: string,
  etag: string | null,
  suffix: string,
  body: Record<string, unknown>,
  options: WriteOptions = {},
) =>
  client.write(operationId, 'POST', `/cases/${caseId}/${suffix}`, body, {
    ifMatch: etag,
    ...options,
  });
const archiveCase = (id: string, etag: string | null, options: WriteOptions = {}) =>
  caseCommand('ArchiveCase', id, etag, 'archive', { reason: 'SYNTHETIC archive' }, options);
const restoreCase = (id: string, etag: string | null, options: WriteOptions = {}) =>
  caseCommand('RestoreCase', id, etag, 'restore', { reason: 'SYNTHETIC restore' }, options);
const setWorkflow = (id: string, etag: string | null, state: string, options: WriteOptions = {}) =>
  caseCommand(
    'WorkflowCase',
    id,
    etag,
    'workflow',
    { state, reason: `SYNTHETIC move to ${state}` },
    options,
  );
const bindRoute = (id: string, etag: string | null, routeId: string, options: WriteOptions = {}) =>
  caseCommand(
    'RouteBindingCase',
    id,
    etag,
    'route-binding',
    { routeId, reason: 'SYNTHETIC route binding' },
    options,
  );
const bindCanonical = (
  id: string,
  etag: string | null,
  body: Record<string, unknown>,
  options: WriteOptions = {},
) =>
  caseCommand(
    'CanonicalBindingCase',
    id,
    etag,
    'canonical-binding',
    { reason: 'SYNTHETIC canonical binding', ...body },
    options,
  );

const LINK = { useRole: 'SYNTHETIC_PACKET', scopeNote: 'SYNTHETIC scope note' };
const postLink = (
  caseId: string,
  etag: string | null,
  body: Record<string, unknown>,
  options: WriteOptions = {},
) => caseCommand('linkCaseSource', caseId, etag, 'sources', { ...LINK, ...body }, options);
async function linkSource(caseId: string, sourceId: string, body: Record<string, unknown> = {}) {
  const current = await getCase(caseId);
  return versioned<CaseSource>(await postLink(caseId, current.etag, { sourceId, ...body }), 201);
}
const getLink = async (id: string) =>
  versioned<CaseSource>(await client.get('getCaseSource', `/case-sources/${id}`), 200);
const setLinkState = (
  id: string,
  etag: string | null,
  state: 'LINKED' | 'PAUSED' | 'UNLINKED',
  options: WriteOptions = {},
) =>
  client.write(
    'setCaseSourceLinkState',
    'POST',
    `/case-sources/${id}/link-state`,
    { state, reason: `SYNTHETIC link ${state}` },
    { ifMatch: etag, ...options },
  );

const SELECTION = {
  taskType: 'INITIAL',
  intendedFromEmail: 'synthetic-sender@example.invalid',
  selectionNote: 'SYNTHETIC selection note',
};
const postSelection = (
  caseId: string,
  etag: string | null,
  body: Record<string, unknown>,
  options: WriteOptions = {},
) =>
  caseCommand(
    'selectCaseAuthority',
    caseId,
    etag,
    'authority-selections',
    { ...SELECTION, ...body },
    options,
  );

/** The selection request of the world's route and signer over the given coverages. */
const choose = (w: World, coverageIds: readonly string[], body: Record<string, unknown> = {}) => ({
  routeId: w.route.data.id,
  signerId: w.signer.data.id,
  coverages: coverageIds.map((coverageId, index) => ({
    coverageId,
    applicationScope: `SYNTHETIC application scope ${index + 1}`,
  })),
  ...body,
});

async function select(caseId: string, body: Record<string, unknown>) {
  const current = await getCase(caseId);
  return immutable<CaseAuthoritySelection>(await postSelection(caseId, current.etag, body), 201);
}

/** A world with one frozen coverage chain and a case of its agency bound to its route. */
async function caseWorld(label = 'A') {
  const w = await world(label);
  const a = await authority(w);
  const created = await createCase(w.agency.data.id, { routeId: w.route.data.id });
  return { w, a, case: created };
}

/** Row versions of authority and directory records, to prove that a case write changed none. */
async function authorityVersions(w: World, a: Authority) {
  return {
    agency: (await getAgency(w.agency.data.id)).data.rowVersion,
    route: (await getRoute(w.route.data.id)).data.rowVersion,
    signer: (await getSigner(w.signer.data.id)).data.rowVersion,
    association: (await getAssociation(w.association.data.id)).data.rowVersion,
    mandate: (await getMandate(a.mandate.data.id)).data.rowVersion,
    version: (await getVersion(a.version.data.id)).data.rowVersion,
    coverage: (await getCoverage(a.coverage.data.id)).data.rowVersion,
    coverageSigner: (await getCoverageSigner(a.coverageSigner.data.id)).data.rowVersion,
  };
}

const pinnedCoverages = (selectionId: string) =>
  prisma.caseAuthorityCoverage.findMany({
    where: { selectionId },
    orderBy: [{ coverageId: 'asc' }],
  });

/** getCaseAuthoritySelection (TB-SCHEMA-API-v1.1.0): the stored selection and its pinned rows. */
const readSelection = (caseId: string, id: string) =>
  client.get('getCaseAuthoritySelection', `/cases/${caseId}/authority-selections/${id}`);
const getSelection = async (caseId: string, id: string) =>
  immutable<CaseAuthoritySelectionView>(await readSelection(caseId, id), 200);

/** The stored CaseAuthorityCoverage rows of a selection in their wire form. */
async function storedPinned(selectionId: string): Promise<CaseAuthorityCoverage[]> {
  return (await pinnedCoverages(selectionId)).map((row) => ({
    id: row.id,
    selectionId: row.selectionId,
    caseId: row.caseId,
    agencyId: row.agencyId,
    routeId: row.routeId,
    coverageId: row.coverageId,
    applicationScope: row.applicationScope,
    createdAt: row.createdAt.toISOString(),
    createdById: row.createdById,
  }));
}

/** Every row of every table the suite writes, to prove that a read wrote nothing. */
async function tableDump(): Promise<Record<string, string[]>> {
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

// ---------------------------------------------------------------------------------------------

describe('CASES — the boundary of case-specific records; not a legal verdict', () => {
  it('create: exactly the supplied fields with the contract defaults; ETag v1, audited; nothing is inferred or created alongside', async () => {
    const w = await world();
    const agencyBefore = await getAgency(w.agency.data.id);
    const routeBefore = await getRoute(w.route.data.id);
    const note = 'SYNTHETIC-CASE-NOTE private remark';
    const result = await postCase({
      agencyId: w.agency.data.id,
      intakeLabel: 'SYNTHETIC intake Été',
      notes: note,
    });
    const created = versioned<CaseRecord>(result, 201);
    expect(created.data).toEqual({
      id: created.data.id,
      agencyId: w.agency.data.id,
      platform: 'YOUTUBE',
      intakeLabel: 'SYNTHETIC intake Été',
      ownerHintId: null,
      routeId: null,
      canonicalCaseId: null,
      canonicalBindingSourceId: null,
      caseClass: 'WORKING_INTAKE',
      workflowState: 'INTAKE',
      currentAuthoritySelectionId: null,
      packetSourceId: null,
      driveFolderUrl: null,
      contextRevision: 1,
      closedAt: null,
      closeReason: null,
      archivedAt: null,
      archiveReason: null,
      notes: note,
      createdAt: nowIso(),
      createdById: client.session.userId,
      updatedAt: nowIso(),
      updatedById: client.session.userId,
      rowVersion: 1,
    });
    expect(created.etag).toBe(`"CaseRecord:${created.data.id}:v1"`);
    expect(affectedOf(result)).toEqual([
      { type: 'CaseRecord', id: created.data.id, rowVersion: 1 },
    ]);
    const [event] = await auditRows(created.data.id);
    expect(event).toMatchObject({
      action: 'CASE_CREATED',
      entityType: 'CaseRecord',
      actorUserId: client.session.userId,
      afterRedacted: {
        agencyId: w.agency.data.id,
        intakeLabel: 'SYNTHETIC intake Été',
        notes: { redacted: true, codePoints: codePoints(note) },
        platform: 'YOUTUBE',
        caseClass: 'WORKING_INTAKE',
        workflowState: 'INTAKE',
        contextRevision: 1,
        rowVersion: 1,
      },
    });
    expect(JSON.stringify(event)).not.toContain('SYNTHETIC-CASE-NOTE');
    // Nothing is inferred: no link, selection, route, canonical id or later-phase record, and the
    // agency and its route are untouched.
    for (const table of ['case_sources', 'case_authority_selections', 'case_authority_coverages']) {
      expect(await countRows(prisma, table), table).toBe(0);
    }
    await expectNoLaterPhaseRecords();
    expect((await getAgency(w.agency.data.id)).data.rowVersion).toBe(agencyBefore.data.rowVersion);
    expect((await getRoute(w.route.data.id)).data.rowVersion).toBe(routeBefore.data.rowVersion);
    // An identical label is another case: no identity is inferred from labels (AC-019: no
    // invented sequential code either).
    const twin = await createCase(w.agency.data.id, { intakeLabel: 'SYNTHETIC intake Été' });
    expect(twin.data.id).not.toBe(created.data.id);
    expect(twin.data.canonicalCaseId).toBeNull();
  });

  it('create with a route and an owner hint: stored exactly; the route passes the binding checks; no authority is selected', async () => {
    const w = await world();
    const a = await authority(w);
    // The route prefers a frozen coverage: the case still selects nothing implicitly.
    const route = await getRoute(w.route.data.id);
    versioned(
      await patchRoute(route.data.id, route.etag, { preferredCoverageId: a.coverage.data.id }),
      200,
    );
    const created = await createCase(w.agency.data.id, {
      routeId: w.route.data.id,
      ownerHintId: w.owner.data.id,
      caseClass: 'RECOVERED_HISTORY',
      platform: 'YOUTUBE',
    });
    expect(created.data).toMatchObject({
      routeId: w.route.data.id,
      ownerHintId: w.owner.data.id,
      caseClass: 'RECOVERED_HISTORY',
      workflowState: 'INTAKE',
      contextRevision: 1,
      currentAuthoritySelectionId: null,
    });
    expect(await countRows(prisma, 'case_authority_selections')).toBe(0);
    expect(await countRows(prisma, 'case_authority_coverages')).toBe(0);
  });

  it('create refuses uncontracted fields, missing or archived parties, other agencies’ and other owners’ routes and unusable routes; nothing is written', async () => {
    const w = await world();
    const other = await world('B');
    const archivedAgency = await createAgency('Archived');
    versioned(
      await command(
        'archiveAgency',
        `/agencies/${archivedAgency.data.id}/archive`,
        archivedAgency.etag,
      ),
      200,
    );
    const archivedOwner = await createOwner('Archived');
    versioned(
      await command('archiveOwner', `/owners/${archivedOwner.data.id}/archive`, archivedOwner.etag),
      200,
    );
    const paused = await anotherRoute(w.agency.data.id, 'Paused');
    await setRouteState(paused.route.data.id, 'PAUSED');
    const archived = await anotherRoute(w.agency.data.id, 'Archived route');
    versioned(
      await command(
        'archiveRoute',
        `/routes/${archived.route.data.id}/archive`,
        archived.route.etag,
      ),
      200,
    );
    const agencyId = w.agency.data.id;
    const refusals: Array<[Record<string, unknown>, number, string, Record<string, unknown>?]> = [
      [{ agencyId: randomUUID() }, 422, 'REFERENCE_NOT_FOUND', { field: 'agencyId' }],
      [
        { agencyId: archivedAgency.data.id },
        409,
        'RECORD_STATE_CONFLICT',
        { record: 'Agency', field: 'agencyId' },
      ],
      [
        { agencyId, ownerHintId: randomUUID() },
        422,
        'REFERENCE_NOT_FOUND',
        { field: 'ownerHintId' },
      ],
      [
        { agencyId, ownerHintId: archivedOwner.data.id },
        409,
        'RECORD_STATE_CONFLICT',
        { record: 'Owner', field: 'ownerHintId' },
      ],
      [{ agencyId, routeId: randomUUID() }, 422, 'REFERENCE_NOT_FOUND', { field: 'routeId' }],
      [
        { agencyId, routeId: other.route.data.id },
        422,
        'CROSS_AGENCY_REFERENCE',
        { field: 'routeId' },
      ],
      [
        { agencyId, routeId: w.route.data.id, ownerHintId: other.owner.data.id },
        422,
        'CROSS_OWNER_REFERENCE',
        { field: 'routeId', ownerId: w.owner.data.id },
      ],
      [
        { agencyId, routeId: paused.route.data.id },
        409,
        'RECORD_STATE_CONFLICT',
        { record: 'Route', linkState: 'PAUSED', field: 'routeId' },
      ],
      [
        { agencyId, routeId: archived.route.data.id },
        409,
        'RECORD_STATE_CONFLICT',
        { record: 'Route', archived: true, field: 'routeId' },
      ],
      // Uncontracted or later-phase fields: the contract body is strict.
      [{ agencyId, workflowState: 'CLOSED' }, 422, 'VALIDATION_FAILED'],
      [{ agencyId, canonicalCaseId: 'SYN-1' }, 422, 'VALIDATION_FAILED'],
      [{ agencyId, currentAuthoritySelectionId: randomUUID() }, 422, 'VALIDATION_FAILED'],
      [{ agencyId, contextRevision: 7 }, 422, 'VALIDATION_FAILED'],
      [{ agencyId, g1Status: 'PASS' }, 422, 'VALIDATION_FAILED'],
      [{ agencyId, readyForSigner: true }, 422, 'VALIDATION_FAILED'],
      [{ agencyId, platform: 'TIKTOK' }, 422, 'VALIDATION_FAILED'],
      [{ agencyId, caseClass: 'VERIFIED' }, 422, 'VALIDATION_FAILED'],
      [{ agencyId, intakeLabel: '' }, 422, 'VALIDATION_FAILED'],
    ];
    for (const [body, status, errorCode, details] of refusals) {
      const result = await postCase(body);
      expect([result.status, code(result)], JSON.stringify(body)).toEqual([status, errorCode]);
      if (details) expect(errorOf(result).details, JSON.stringify(body)).toMatchObject(details);
    }
    expect(await countRows(prisma, 'cases')).toBe(0);
    expect(
      await prisma.idempotencyRecord.count({
        where: { state: 'COMPLETED', responseStatus: { gte: 400 } },
      }),
    ).toBe(0);
  });

  it('get and list: 404 for an unknown case; exact filters, literal search and keyset pages bound to their filters', async () => {
    const w = await world();
    const other = await world('B');
    const first = await createCase(w.agency.data.id, { intakeLabel: 'SYNTHETIC Élan intake' });
    t.clock.advance(1000);
    const bound = await createCase(w.agency.data.id, {
      intakeLabel: 'SYNTHETIC bound intake',
      routeId: w.route.data.id,
    });
    t.clock.advance(1000);
    const closed = await createCase(w.agency.data.id, { intakeLabel: 'SYNTHETIC 100% closed' });
    versioned(await setWorkflow(closed.data.id, closed.etag, 'CLOSED'), 200);
    t.clock.advance(1000);
    const foreign = await createCase(other.agency.data.id, { intakeLabel: 'SYNTHETIC foreign' });
    const ids = (page: Page<CaseRecord>) => page.items.map((item) => item.id);

    expect(outcome(await client.get('getCase', `/cases/${randomUUID()}`))).toEqual([
      404,
      'NOT_FOUND',
    ]);
    expect(ids(await listOf('listCases', '/cases'))).toEqual([
      foreign.data.id,
      closed.data.id,
      bound.data.id,
      first.data.id,
    ]);
    expect(ids(await listOf('listCases', `/cases?agencyId=${w.agency.data.id}`))).toEqual([
      closed.data.id,
      bound.data.id,
      first.data.id,
    ]);
    expect(ids(await listOf('listCases', `/cases?routeId=${w.route.data.id}`))).toEqual([
      bound.data.id,
    ]);
    expect(ids(await listOf('listCases', '/cases?workflowState=CLOSED'))).toEqual([closed.data.id]);
    // Accent- and case-insensitive discovery search only; the id matches exactly; % is literal.
    expect(ids(await listOf('listCases', '/cases?q=elan'))).toEqual([first.data.id]);
    expect(ids(await listOf('listCases', `/cases?q=${bound.data.id}`))).toEqual([bound.data.id]);
    expect(ids(await listOf('listCases', `/cases?q=${encodeURIComponent('100%')}`))).toEqual([
      closed.data.id,
    ]);
    expect(ids(await listOf('listCases', `/cases?q=${encodeURIComponent('%')}`))).toEqual([
      closed.data.id,
    ]);
    for (const query of ['workflowState=READY_FOR_SIGNER', 'agencyId=not-a-uuid', 'status=OPEN']) {
      expect(outcome(await client.get('listCases', `/cases?${query}`)), query).toEqual([
        400,
        'INVALID_QUERY_PARAMETER',
      ]);
    }
    const page1 = await listOf<CaseRecord>(
      'listCases',
      `/cases?agencyId=${w.agency.data.id}&limit=2`,
    );
    expect(ids(page1)).toEqual([closed.data.id, bound.data.id]);
    expect(page1.nextCursor).not.toBeNull();
    const cursor = encodeURIComponent(page1.nextCursor ?? '');
    const page2 = await listOf<CaseRecord>(
      'listCases',
      `/cases?agencyId=${w.agency.data.id}&limit=2&cursor=${cursor}`,
    );
    expect([ids(page2), page2.nextCursor]).toEqual([[first.data.id], null]);
    expect(
      outcome(
        await client.get('listCases', `/cases?agencyId=${other.agency.data.id}&cursor=${cursor}`),
      ),
    ).toEqual([400, 'INVALID_CURSOR']);
  });

  it('patch: only the contracted fields; context fields move contextRevision, notes do not; a no-op writes nothing', async () => {
    const w = await world();
    const created = await createCase(w.agency.data.id);
    const renamed = versioned<CaseRecord>(
      await patchCase(created.data.id, created.etag, { intakeLabel: 'SYNTHETIC renamed intake' }),
      200,
    );
    expect(renamed.data).toMatchObject({
      intakeLabel: 'SYNTHETIC renamed intake',
      rowVersion: 2,
      contextRevision: 2,
    });
    const noted = versioned<CaseRecord>(
      await patchCase(created.data.id, renamed.etag, { notes: 'SYNTHETIC-PATCH-NOTE' }),
      200,
    );
    expect(noted.data).toMatchObject({
      notes: 'SYNTHETIC-PATCH-NOTE',
      rowVersion: 3,
      contextRevision: 2,
    });
    const noOp = await patchCase(created.data.id, noted.etag, {
      intakeLabel: 'SYNTHETIC renamed intake',
      notes: 'SYNTHETIC-PATCH-NOTE',
    });
    expect(versioned<CaseRecord>(noOp, 200).data.rowVersion).toBe(3);
    expect(affectedOf(noOp)).toEqual([]);
    const folder = versioned<CaseRecord>(
      await patchCase(created.data.id, noted.etag, {
        driveFolderUrl: 'https://drive.example.invalid/synthetic-folder',
      }),
      200,
    );
    expect(folder.data).toMatchObject({ rowVersion: 4, contextRevision: 3 });
    expect((await auditRows(created.data.id)).map((row) => row.action)).toEqual([
      'CASE_CREATED',
      'CASE_UPDATED',
      'CASE_UPDATED',
      'CASE_UPDATED',
    ]);
    expect(JSON.stringify(await auditRows(created.data.id))).not.toContain('SYNTHETIC-PATCH-NOTE');
    // Identity, lifecycle and pointer fields change only through their own commands.
    for (const body of [
      { agencyId: randomUUID() },
      { routeId: w.route.data.id },
      { platform: 'YOUTUBE' },
      { caseClass: 'CURRENT_OPERATION' },
      { workflowState: 'CLOSED' },
      { canonicalCaseId: 'SYN-PATCH' },
      { canonicalBindingSourceId: w.source.id },
      { currentAuthoritySelectionId: randomUUID() },
      { archivedAt: nowIso() },
      { contextRevision: 1 },
      { rowVersion: 1 },
      {},
      { driveFolderUrl: 'ftp://drive.example.invalid/x' },
      { intakeLabel: '' },
    ]) {
      expect(
        outcome(await patchCase(created.data.id, folder.etag, body)),
        JSON.stringify(body),
      ).toEqual([422, 'VALIDATION_FAILED']);
    }
    const archivedOwner = await createOwner('Archived hint');
    versioned(
      await command('archiveOwner', `/owners/${archivedOwner.data.id}/archive`, archivedOwner.etag),
      200,
    );
    expect(
      errorOf(await patchCase(created.data.id, folder.etag, { ownerHintId: randomUUID() })),
    ).toMatchObject({ code: 'REFERENCE_NOT_FOUND', details: { field: 'ownerHintId' } });
    expect(
      outcome(
        await patchCase(created.data.id, folder.etag, { ownerHintId: archivedOwner.data.id }),
      ),
    ).toEqual([409, 'RECORD_STATE_CONFLICT']);
    expect((await getCase(created.data.id)).data).toEqual(folder.data);
  });

  it('patch: with a bound route the owner hint is null or the route’s owner; a packet source must apply to this case', async () => {
    const w = await world();
    const other = await world('B');
    const created = await createCase(w.agency.data.id, { routeId: w.route.data.id });
    const refusedHint = await patchCase(created.data.id, created.etag, {
      ownerHintId: other.owner.data.id,
    });
    expect(errorOf(refusedHint)).toMatchObject({
      code: 'CROSS_OWNER_REFERENCE',
      details: { field: 'ownerHintId', ownerId: w.owner.data.id },
    });
    const hinted = versioned<CaseRecord>(
      await patchCase(created.data.id, created.etag, { ownerHintId: w.owner.data.id }),
      200,
    );
    const siblingCase = await createCase(w.agency.data.id);
    const scopedElsewhere = await createSource({
      agencyId: w.agency.data.id,
      scopeBindings: { caseIds: [siblingCase.data.id] },
    });
    const packetRefusals: Array<[string, string, Record<string, unknown>]> = [
      [randomUUID(), 'REFERENCE_NOT_FOUND', { field: 'packetSourceId' }],
      [other.source.id, 'CROSS_AGENCY_REFERENCE', { field: 'packetSourceId' }],
      [scopedElsewhere.id, 'CROSS_CASE_REFERENCE', { field: 'packetSourceId' }],
    ];
    for (const [packetSourceId, errorCode, details] of packetRefusals) {
      const refused = await patchCase(created.data.id, hinted.etag, { packetSourceId });
      expect(errorOf(refused), errorCode).toMatchObject({ code: errorCode, details });
    }
    const sourceBefore = await getSource(w.source.id);
    const packet = versioned<CaseRecord>(
      await patchCase(created.data.id, hinted.etag, { packetSourceId: w.source.id }),
      200,
    );
    expect(packet.data).toMatchObject({
      packetSourceId: w.source.id,
      contextRevision: hinted.data.contextRevision + 1,
    });
    expect((await auditRows(created.data.id)).at(-1)).toMatchObject({
      action: 'CASE_UPDATED',
      sourceIds: [w.source.id],
    });
    // Citing a source changes nothing about it: no review, no provenance upgrade.
    expect(await getSource(w.source.id)).toEqual(sourceBefore);
  });
});

// ---------------------------------------------------------------------------------------------

describe('WORKFLOW — operational activity only; no state is a legal, authority or readiness conclusion', () => {
  it('any state to any other with a reason; CLOSED records closedAt and closeReason and reopening clears them; the same state is 409', async () => {
    const w = await world();
    const created = await createCase(w.agency.data.id);
    let etag = created.etag;
    // No state is gated on a route, a source link or an authority selection: this case has none.
    const path = ['PREPARING', 'DRAFTING', 'AWAITING_HUMAN', 'AWAITING_PLATFORM', 'CLOSED'];
    for (const [index, state] of path.entries()) {
      t.clock.advance(1000);
      const moved = versioned<CaseRecord>(await setWorkflow(created.data.id, etag, state), 200);
      expect(moved.data).toMatchObject({
        workflowState: state,
        rowVersion: index + 2,
        contextRevision: 1,
        closedAt: state === 'CLOSED' ? nowIso() : null,
        closeReason: state === 'CLOSED' ? 'SYNTHETIC move to CLOSED' : null,
      });
      etag = moved.etag;
    }
    const same = await setWorkflow(created.data.id, etag, 'CLOSED');
    expect(errorOf(same)).toMatchObject({
      code: 'RECORD_STATE_CONFLICT',
      details: { workflowState: 'CLOSED', requested: 'CLOSED', operation: 'workflow' },
    });
    const reopened = versioned<CaseRecord>(await setWorkflow(created.data.id, etag, 'INTAKE'), 200);
    expect(reopened.data).toMatchObject({
      workflowState: 'INTAKE',
      closedAt: null,
      closeReason: null,
    });
    const events = (await auditRows(created.data.id)).filter(
      (row) => row.action === 'CASE_WORKFLOW_CHANGED',
    );
    expect(events.map((row) => row.reason)).toEqual([
      ...path.map((state) => `SYNTHETIC move to ${state}`),
      'SYNTHETIC move to INTAKE',
    ]);
    // Workflow vocabulary is closed: no readiness, authority or outcome state exists.
    for (const state of ['READY_FOR_SIGNER', 'G1_PASS', 'AUTHORIZED', 'SUBMITTED', 'SIGNED']) {
      expect(outcome(await setWorkflow(created.data.id, reopened.etag, state)), state).toEqual([
        422,
        'VALIDATION_FAILED',
      ]);
    }
    expect(
      outcome(
        await caseCommand('WorkflowCase', created.data.id, reopened.etag, 'workflow', {
          state: 'DRAFTING',
        }),
      ),
    ).toEqual([422, 'VALIDATION_FAILED']);
    for (const table of ['case_sources', 'case_authority_selections']) {
      expect(await countRows(prisma, table), table).toBe(0);
    }
    await expectNoLaterPhaseRecords();
  });
});

// ---------------------------------------------------------------------------------------------

describe('ARCHIVE, RESTORE AND DELETE — administrative flags; history is never removed to make room', () => {
  it('archive: the case becomes read-only except restore; its links, selection and bindings stay; restore changes nothing else', async () => {
    const { w, a, case: created } = await caseWorld();
    const linked = await linkSource(created.data.id, w.source.id);
    const selection = await select(created.data.id, choose(w, [a.coverage.data.id]));
    const before = await getCase(created.data.id);
    const archived = versioned<CaseRecord>(await archiveCase(created.data.id, before.etag), 200);
    expect(archived.data).toMatchObject({
      archivedAt: nowIso(),
      archiveReason: 'SYNTHETIC archive',
      workflowState: 'INTAKE',
      routeId: w.route.data.id,
      currentAuthoritySelectionId: selection.id,
      contextRevision: before.data.contextRevision,
      rowVersion: before.data.rowVersion + 1,
    });
    const second = await anotherRoute(w.agency.data.id, 'Second');
    const canonical = await createSource({ agencyId: w.agency.data.id, title: 'SYNTHETIC code' });
    const link = await getLink(linked.data.id);
    const attempts: Array<[string, () => Promise<HttpResult>]> = [
      ['patchCase', () => patchCase(created.data.id, archived.etag, { notes: 'x' })],
      ['WorkflowCase', () => setWorkflow(created.data.id, archived.etag, 'PREPARING')],
      ['RouteBindingCase', () => bindRoute(created.data.id, archived.etag, second.route.data.id)],
      [
        'CanonicalBindingCase',
        () =>
          bindCanonical(created.data.id, archived.etag, {
            canonicalCode: 'SYN-ARCHIVED',
            sourceId: canonical.id,
          }),
      ],
      [
        'linkCaseSource',
        () => postLink(created.data.id, archived.etag, { sourceId: canonical.id }),
      ],
      ['setCaseSourceLinkState', () => setLinkState(link.data.id, link.etag, 'PAUSED')],
      [
        'selectCaseAuthority',
        () => postSelection(created.data.id, archived.etag, choose(w, [a.coverage.data.id])),
      ],
      ['ArchiveCase', () => archiveCase(created.data.id, archived.etag)],
    ];
    for (const [label, run] of attempts) {
      expect(outcome(await run()), label).toEqual([409, 'RECORD_STATE_CONFLICT']);
    }
    const blocked = await deleteCase(created.data.id, archived.etag);
    expect(errorOf(blocked)).toMatchObject({
      code: 'REFERENCED_RECORD_CANNOT_DELETE',
      details: {
        blockers: [
          'ARCHIVED',
          'REFERENCED_BY:case_authority_selections.case_id',
          'REFERENCED_BY:case_sources.case_id',
        ],
      },
    });
    expect((await getCase(created.data.id)).data).toEqual(archived.data);
    expect((await getLink(linked.data.id)).data).toEqual(link.data);
    const restored = versioned<CaseRecord>(await restoreCase(created.data.id, archived.etag), 200);
    expect(restored.data).toEqual({
      ...archived.data,
      archivedAt: null,
      archiveReason: null,
      rowVersion: archived.data.rowVersion + 1,
    });
    expect(outcome(await restoreCase(created.data.id, restored.etag))).toEqual([
      409,
      'RECORD_STATE_CONFLICT',
    ]);
    const history = await listOf<CaseAuthoritySelection>(
      'listCaseAuthoritySelections',
      `/cases/${created.data.id}/authority-selections`,
    );
    expect(history.items).toEqual([selection]);
    expect((await auditRows(created.data.id)).map((row) => row.action)).toEqual(
      expect.arrayContaining(['CASE_ARCHIVED', 'CASE_RESTORED']),
    );
  });

  it('restore is refused while the agency or the bound route is archived, and re-activates neither', async () => {
    const w = await world();
    const created = await createCase(w.agency.data.id, { routeId: w.route.data.id });
    const archived = versioned<CaseRecord>(await archiveCase(created.data.id, created.etag), 200);
    const route = await getRoute(w.route.data.id);
    const archivedRoute = versioned<Route>(
      await command('archiveRoute', `/routes/${route.data.id}/archive`, route.etag),
      200,
    );
    expect(errorOf(await restoreCase(created.data.id, archived.etag))).toMatchObject({
      code: 'RECORD_STATE_CONFLICT',
      details: { record: 'Route', archived: true, operation: 'RestoreCase' },
    });
    expect((await getRoute(route.data.id)).data.archivedAt).not.toBeNull();
    versioned(
      await command('restoreRoute', `/routes/${route.data.id}/restore`, archivedRoute.etag),
      200,
    );
    const agency = await getAgency(w.agency.data.id);
    versioned(
      await command('archiveAgency', `/agencies/${agency.data.id}/archive`, agency.etag),
      200,
    );
    expect(errorOf(await restoreCase(created.data.id, archived.etag))).toMatchObject({
      code: 'RECORD_STATE_CONFLICT',
      details: { record: 'Agency', state: 'ARCHIVED', operation: 'RestoreCase' },
    });
    expect((await getAgency(w.agency.data.id)).data.recordState).toBe('ARCHIVED');
    expect((await getCase(created.data.id)).data).toEqual(archived.data);
  });

  it('delete: only an unused, unbound case; every reference blocks it and nothing is deleted to make room', async () => {
    const { w, a } = await caseWorld();
    // Unused — the route binding and owner hint are the case's own data, not dependents.
    const unused = await createCase(w.agency.data.id, {
      routeId: w.route.data.id,
      ownerHintId: w.owner.data.id,
    });
    const routeBefore = await getRoute(w.route.data.id);
    const removed = await deleteCase(unused.data.id, unused.etag);
    expect([removed.status, removed.text]).toEqual([204, '']);
    expect(outcome(await client.get('getCase', `/cases/${unused.data.id}`))).toEqual([
      404,
      'NOT_FOUND',
    ]);
    expect((await auditRows(unused.data.id)).map((row) => row.action)).toEqual([
      'CASE_CREATED',
      'CASE_DELETED',
    ]);
    expect((await getRoute(w.route.data.id)).data).toEqual(routeBefore.data);

    const blockers = async (caseId: string) => {
      const current = await getCase(caseId);
      const refused = await deleteCase(caseId, current.etag);
      expect(outcome(refused)).toEqual([409, 'REFERENCED_RECORD_CANNOT_DELETE']);
      return errorOf(refused).details['blockers'];
    };
    const linkedCase = await createCase(w.agency.data.id);
    await linkSource(linkedCase.data.id, w.source.id);
    expect(await blockers(linkedCase.data.id)).toEqual(['REFERENCED_BY:case_sources.case_id']);

    const selectedCase = await createCase(w.agency.data.id, { routeId: w.route.data.id });
    await select(selectedCase.data.id, choose(w, [a.coverage.data.id]));
    expect(await blockers(selectedCase.data.id)).toEqual([
      'REFERENCED_BY:case_authority_selections.case_id',
    ]);

    const boundCase = await createCase(w.agency.data.id);
    const bound = await getCase(boundCase.data.id);
    versioned(
      await bindCanonical(boundCase.data.id, bound.etag, {
        canonicalCode: 'SYN-DELETE-BOUND',
        sourceId: w.source.id,
      }),
      200,
    );
    expect(await blockers(boundCase.data.id)).toEqual(['CANONICAL_BINDING']);

    const scopedCase = await createCase(w.agency.data.id);
    await createSource({
      agencyId: w.agency.data.id,
      scopeBindings: { caseIds: [scopedCase.data.id] },
    });
    expect(await blockers(scopedCase.data.id)).toEqual(['SNAPSHOT_REFERENCE:source_references']);

    // Nothing was removed to make room.
    expect(await countRows(prisma, 'case_sources')).toBe(1);
    expect(await countRows(prisma, 'case_authority_selections')).toBe(1);
    expect(await countRows(prisma, 'case_authority_coverages')).toBe(1);
    expect(await countRows(prisma, 'cases')).toBe(5);
  });
});

// ---------------------------------------------------------------------------------------------

describe('ROUTE BINDING — an explicit association with one compatible route; not authority', () => {
  it('binds one exact route of the case’s agency: contextRevision moves; no selection, coverage or preference is inferred', async () => {
    const w = await world();
    const a = await authority(w);
    const route = await getRoute(w.route.data.id);
    versioned(
      await patchRoute(route.data.id, route.etag, { preferredCoverageId: a.coverage.data.id }),
      200,
    );
    const versionsBefore = await authorityVersions(w, a);
    const created = await createCase(w.agency.data.id);
    const result = await bindRoute(created.data.id, created.etag, w.route.data.id);
    const bound = versioned<CaseRecord>(result, 200);
    expect(bound.data).toMatchObject({
      routeId: w.route.data.id,
      rowVersion: 2,
      contextRevision: 2,
      currentAuthoritySelectionId: null,
      ownerHintId: null,
    });
    expect(affectedOf(result)).toEqual([
      { type: 'CaseRecord', id: created.data.id, rowVersion: 2 },
    ]);
    expect((await auditRows(created.data.id)).at(-1)).toMatchObject({
      action: 'CASE_ROUTE_BOUND',
      reason: 'SYNTHETIC route binding',
      beforeRedacted: { routeId: null, contextRevision: 1, rowVersion: 1 },
      afterRedacted: { routeId: w.route.data.id, contextRevision: 2, rowVersion: 2 },
    });
    // A binding is an association only: the preferred coverage is not selected, nothing moves.
    expect(await countRows(prisma, 'case_authority_selections')).toBe(0);
    expect(await authorityVersions(w, a)).toEqual(versionsBefore);
    const again = await bindRoute(created.data.id, bound.etag, w.route.data.id);
    expect(errorOf(again)).toMatchObject({
      code: 'RECORD_STATE_CONFLICT',
      details: { routeId: w.route.data.id, operation: 'route-binding' },
    });
  });

  it('refuses unknown, other-agency (even identically named), paused, archived and party-archived routes, a paused association and a route of another owner than the hint', async () => {
    const w = await world('Twin');
    const twin = await world('Twin');
    expect(twin.agency.data.displayName).toBe(w.agency.data.displayName);
    const paused = await anotherRoute(w.agency.data.id, 'Paused');
    await setRouteState(paused.route.data.id, 'PAUSED');
    const archived = await anotherRoute(w.agency.data.id, 'Archived route');
    versioned(
      await command(
        'archiveRoute',
        `/routes/${archived.route.data.id}/archive`,
        archived.route.etag,
      ),
      200,
    );
    const ownerArchived = await anotherRoute(w.agency.data.id, 'Archived owner');
    const owner = await getOwner(ownerArchived.owner.data.id);
    versioned(await command('archiveOwner', `/owners/${owner.data.id}/archive`, owner.etag), 200);
    const associationPaused = await anotherRoute(w.agency.data.id, 'Paused association');
    const association = await getAssociation(associationPaused.association.data.id);
    versioned(
      await command(
        'setOwnerSubjectLinkState',
        `/owner-subjects/${association.data.id}/link-state`,
        association.etag,
        {
          state: 'PAUSED',
          reason: 'SYNTHETIC pause',
        },
      ),
      200,
    );
    const hinted = await anotherRoute(w.agency.data.id, 'Hinted');
    const created = await createCase(w.agency.data.id, { ownerHintId: hinted.owner.data.id });
    const refusals: Array<[string, string, number, string, Record<string, unknown>]> = [
      ['unknown', randomUUID(), 422, 'REFERENCE_NOT_FOUND', { field: 'routeId' }],
      [
        'identically named agency',
        twin.route.data.id,
        422,
        'CROSS_AGENCY_REFERENCE',
        { field: 'routeId' },
      ],
      [
        'paused',
        paused.route.data.id,
        409,
        'RECORD_STATE_CONFLICT',
        { record: 'Route', linkState: 'PAUSED' },
      ],
      [
        'archived',
        archived.route.data.id,
        409,
        'RECORD_STATE_CONFLICT',
        { record: 'Route', archived: true },
      ],
      [
        'archived owner',
        ownerArchived.route.data.id,
        409,
        'RECORD_STATE_CONFLICT',
        { record: 'Owner', state: 'ARCHIVED' },
      ],
      [
        'paused association',
        associationPaused.route.data.id,
        409,
        'RECORD_STATE_CONFLICT',
        { record: 'OwnerSubject', linkState: 'PAUSED' },
      ],
      [
        'another owner than the hint',
        w.route.data.id,
        422,
        'CROSS_OWNER_REFERENCE',
        { field: 'routeId', ownerId: w.owner.data.id },
      ],
    ];
    for (const [label, routeId, status, errorCode, details] of refusals) {
      const refused = await bindRoute(created.data.id, created.etag, routeId);
      expect([refused.status, code(refused)], label).toEqual([status, errorCode]);
      expect(errorOf(refused).details, label).toMatchObject(details);
    }
    expect((await getCase(created.data.id)).data).toEqual(created.data);
    // The hinted owner's own route is accepted.
    versioned(await bindRoute(created.data.id, created.etag, hinted.route.data.id), 200);
  });

  it('a correction replaces the route only before the case has history; afterwards 409 BINDING_CORRECTION_REQUIRES_RECONCILIATION', async () => {
    const w = await world();
    const second = await anotherRoute(w.agency.data.id, 'Second');
    const a2 = await authority(w, { routeId: second.route.data.id, label: 'second route' });
    const created = await createCase(w.agency.data.id, { routeId: w.route.data.id });
    const corrected = versioned<CaseRecord>(
      await bindRoute(created.data.id, created.etag, second.route.data.id),
      200,
    );
    expect(corrected.data).toMatchObject({ routeId: second.route.data.id, contextRevision: 2 });
    expect((await auditRows(created.data.id)).at(-1)).toMatchObject({
      action: 'CASE_ROUTE_BOUND',
      beforeRedacted: { routeId: w.route.data.id },
      afterRedacted: { routeId: second.route.data.id },
    });
    const selection = await select(
      created.data.id,
      choose(w, [a2.coverage.data.id], { routeId: second.route.data.id }),
    );
    const current = await getCase(created.data.id);
    const refused = await bindRoute(created.data.id, current.etag, w.route.data.id);
    expect(errorOf(refused)).toMatchObject({
      code: 'BINDING_CORRECTION_REQUIRES_RECONCILIATION',
      details: { routeId: second.route.data.id, blockers: ['AUTHORITY_SELECTION'] },
    });
    expect((await getCase(created.data.id)).data).toEqual(current.data);
    expect(current.data.currentAuthoritySelectionId).toBe(selection.id);
  });

  it('every source the case relies on must fit a corrected route: a contradicting link, canonical or packet source is refused', async () => {
    const w = await world();
    const second = await anotherRoute(w.agency.data.id, 'Second');
    const subjectScoped = await createSource({
      agencyId: w.agency.data.id,
      title: 'SYNTHETIC subject-scoped record',
      scopeBindings: { legalSubjectIds: [w.subject.data.id] },
    });
    const created = await createCase(w.agency.data.id, { routeId: w.route.data.id });
    const linked = await linkSource(created.data.id, subjectScoped.id);
    const before = await getCase(created.data.id);
    const refused = await bindRoute(created.data.id, before.etag, second.route.data.id);
    expect(errorOf(refused)).toMatchObject({
      code: 'SOURCE_SCOPE_UNRESOLVED',
      details: {
        field: 'routeId',
        reason: 'SCOPED_TO_OTHER_SUBJECT',
        conflict: `caseSource:${linked.data.id}`,
        sourceId: subjectScoped.id,
      },
    });
    // A paused link still counts; an unlinked one is history, not reliance.
    const pausedLink = versioned<CaseSource>(
      await setLinkState(linked.data.id, linked.etag, 'PAUSED'),
      200,
    );
    const stillRefused = await bindRoute(
      created.data.id,
      (await getCase(created.data.id)).etag,
      second.route.data.id,
    );
    expect(code(stillRefused)).toBe('SOURCE_SCOPE_UNRESOLVED');
    const unlinked = versioned<CaseSource>(
      await setLinkState(linked.data.id, pausedLink.etag, 'UNLINKED'),
      200,
    );
    const moved = versioned<CaseRecord>(
      await bindRoute(created.data.id, (await getCase(created.data.id)).etag, second.route.data.id),
      200,
    );
    expect(moved.data.routeId).toBe(second.route.data.id);
    // Relinking re-checks the source in the case's current context.
    const relink = await setLinkState(linked.data.id, unlinked.etag, 'LINKED');
    expect(errorOf(relink)).toMatchObject({
      code: 'SOURCE_SCOPE_UNRESOLVED',
      details: { field: 'sourceId', reason: 'SCOPED_TO_OTHER_SUBJECT' },
    });
    // A packet source and a canonical source are re-checked the same way.
    const packetCase = await createCase(w.agency.data.id, { routeId: w.route.data.id });
    const withPacket = versioned<CaseRecord>(
      await patchCase(packetCase.data.id, packetCase.etag, { packetSourceId: subjectScoped.id }),
      200,
    );
    expect(
      errorOf(await bindRoute(packetCase.data.id, withPacket.etag, second.route.data.id)),
    ).toMatchObject({
      code: 'SOURCE_SCOPE_UNRESOLVED',
      details: { conflict: 'packetSourceId', sourceId: subjectScoped.id },
    });
    const canonicalCase = await createCase(w.agency.data.id, { routeId: w.route.data.id });
    const withCanonical = versioned<CaseRecord>(
      await bindCanonical(canonicalCase.data.id, canonicalCase.etag, {
        canonicalCode: 'SYN-RECHECK',
        sourceId: subjectScoped.id,
      }),
      200,
    );
    expect(
      errorOf(await bindRoute(canonicalCase.data.id, withCanonical.etag, second.route.data.id)),
    ).toMatchObject({
      code: 'SOURCE_SCOPE_UNRESOLVED',
      details: { conflict: 'canonicalBindingSourceId', sourceId: subjectScoped.id },
    });
  });

  it('another owner’s material cannot follow a case onto a route of that owner’s rival', async () => {
    const w = await world();
    const a = await authority(w);
    const rival = await anotherRoute(w.agency.data.id, 'Rival');
    // The coverage basis is recorded as material of the route's owner (P3B route context).
    const created = await createCase(w.agency.data.id, { routeId: w.route.data.id });
    const linked = await linkSource(created.data.id, a.basis.id);
    const refused = await bindRoute(
      created.data.id,
      (await getCase(created.data.id)).etag,
      rival.route.data.id,
    );
    expect(errorOf(refused)).toMatchObject({
      code: 'CROSS_OWNER_REFERENCE',
      details: { field: 'routeId', conflict: `caseSource:${linked.data.id}`, sourceId: a.basis.id },
    });
    const rivalCase = await createCase(w.agency.data.id, { routeId: rival.route.data.id });
    expect(
      errorOf(await postLink(rivalCase.data.id, rivalCase.etag, { sourceId: a.basis.id })),
    ).toMatchObject({ code: 'CROSS_OWNER_REFERENCE', details: { field: 'sourceId' } });
  });
});

// ---------------------------------------------------------------------------------------------

describe('CANONICAL BINDING — an identity reference; never a review, a provenance change or proof', () => {
  it('binds the current CANONICAL_RECORD revision with a unique code; the source is unchanged; a binding is never replaced', async () => {
    const w = await world();
    const created = await createCase(w.agency.data.id);
    const sourceBefore = await getSource(w.source.id);
    const bound = versioned<CaseRecord>(
      await bindCanonical(created.data.id, created.etag, {
        canonicalCode: 'SYN-CASE-001',
        sourceId: w.source.id,
      }),
      200,
    );
    expect(bound.data).toMatchObject({
      canonicalCaseId: 'SYN-CASE-001',
      canonicalBindingSourceId: w.source.id,
      rowVersion: 2,
      contextRevision: 2,
    });
    expect((await auditRows(created.data.id)).at(-1)).toMatchObject({
      action: 'CASE_CANONICAL_BOUND',
      reason: 'SYNTHETIC canonical binding',
      sourceIds: [w.source.id],
      beforeRedacted: { canonicalCaseId: null, canonicalBindingSourceId: null },
      afterRedacted: { canonicalCaseId: 'SYN-CASE-001', canonicalBindingSourceId: w.source.id },
    });
    expect(await getSource(w.source.id)).toEqual(sourceBefore);
    const replaced = await bindCanonical(created.data.id, bound.etag, {
      canonicalCode: 'SYN-CASE-002',
      sourceId: w.source.id,
    });
    expect(errorOf(replaced)).toMatchObject({
      code: 'BINDING_CORRECTION_REQUIRES_RECONCILIATION',
      details: { canonicalCaseId: 'SYN-CASE-001', canonicalBindingSourceId: w.source.id },
    });
    const sibling = await createCase(w.agency.data.id);
    const duplicate = await bindCanonical(sibling.data.id, sibling.etag, {
      canonicalCode: 'SYN-CASE-001',
      sourceId: w.source.id,
    });
    expect(errorOf(duplicate)).toMatchObject({
      code: 'DUPLICATE_CANONICAL_CODE',
      details: { recordId: created.data.id },
    });
    // Codes are compared exactly (binary), never case- or accent-insensitively.
    const lower = versioned<CaseRecord>(
      await bindCanonical(sibling.data.id, sibling.etag, {
        canonicalCode: 'syn-case-001',
        sourceId: w.source.id,
      }),
      200,
    );
    expect(lower.data.canonicalCaseId).toBe('syn-case-001');
  });

  it('refuses a superseded revision, a non-canonical role, another agency’s source, another case’s source and unknown sources', async () => {
    const w = await world();
    const other = await world('B');
    const created = await createCase(w.agency.data.id);
    const sibling = await createCase(w.agency.data.id);
    const operatorInput = await createSource({
      agencyId: w.agency.data.id,
      sourceRole: 'OPERATOR_INPUT',
    });
    const superseded = await createSource({ agencyId: w.agency.data.id, title: 'SYNTHETIC rev 1' });
    const head = await reviseSource(superseded.id, {
      agencyId: w.agency.data.id,
      title: 'SYNTHETIC rev 2',
    });
    const otherCase = await createSource({ scopeBindings: { caseIds: [sibling.data.id] } });
    const refusals: Array<[string, number, string, Record<string, unknown>]> = [
      [randomUUID(), 422, 'REFERENCE_NOT_FOUND', { field: 'sourceId' }],
      [superseded.id, 409, 'SOURCE_NOT_CURRENT', { field: 'sourceId', currentSourceId: head.id }],
      [operatorInput.id, 422, 'SOURCE_ROLE_NOT_VERIFICATION', { sourceRole: 'OPERATOR_INPUT' }],
      [other.source.id, 422, 'CROSS_AGENCY_REFERENCE', { field: 'sourceId' }],
      [otherCase.id, 422, 'CROSS_CASE_REFERENCE', { field: 'sourceId' }],
    ];
    for (const [sourceId, status, errorCode, details] of refusals) {
      const refused = await bindCanonical(created.data.id, created.etag, {
        canonicalCode: 'SYN-REFUSED',
        sourceId,
      });
      expect([refused.status, code(refused)], errorCode).toEqual([status, errorCode]);
      expect(errorOf(refused).details, errorCode).toMatchObject(details);
    }
    expect((await getCase(created.data.id)).data).toEqual(created.data);
    // An agency-less source scoped to exactly this case applies to it.
    const ownCase = await createSource({ scopeBindings: { caseIds: [created.data.id] } });
    versioned(
      await bindCanonical(created.data.id, created.etag, {
        canonicalCode: 'SYN-OWN',
        sourceId: ownCase.id,
      }),
      200,
    );
  });
});

// ---------------------------------------------------------------------------------------------

describe('CASE SOURCES — an explicit association of one source with one case; not proof', () => {
  it('createSource names only existing, unarchived cases, and an agency’s own source only its own agency’s cases; nothing is written on refusal', async () => {
    const w = await world();
    const other = await world('B');
    const own = await createCase(w.agency.data.id);
    const foreign = await createCase(other.agency.data.id);
    const archived = await createCase(w.agency.data.id);
    versioned(await archiveCase(archived.data.id, archived.etag), 200);
    const ownNow = await getCase(own.data.id);
    const foreignNow = await getCase(foreign.data.id);
    const sourcesBefore = await prisma.sourceReference.count();
    const refusals: Array<[Record<string, unknown>, number, string, Record<string, unknown>]> = [
      [
        { agencyId: w.agency.data.id, scopeBindings: { caseIds: [foreign.data.id] } },
        422,
        'CROSS_AGENCY_REFERENCE',
        { field: 'scopeBindings.caseIds.0' },
      ],
      [
        { agencyId: w.agency.data.id, scopeBindings: { caseIds: [own.data.id, archived.data.id] } },
        409,
        'RECORD_STATE_CONFLICT',
        { record: 'CaseRecord', archived: true, field: 'scopeBindings.caseIds.1' },
      ],
      [
        { scopeBindings: { caseIds: [randomUUID()] } },
        422,
        'REFERENCE_NOT_FOUND',
        { field: 'scopeBindings.caseIds.0' },
      ],
    ];
    for (const [body, status, errorCode, details] of refusals) {
      const refused = await postSource(body);
      expect([refused.status, code(refused)], errorCode).toEqual([status, errorCode]);
      expect(errorOf(refused).details, errorCode).toMatchObject(details);
    }
    expect(await prisma.sourceReference.count()).toBe(sourcesBefore);
    // Accepted: an agency's own source naming its own case, and an agency-less source naming cases
    // of two agencies. The scope is stored exactly as given; the cases themselves do not change.
    const ownScoped = await createSource({
      agencyId: w.agency.data.id,
      scopeBindings: { caseIds: [own.data.id] },
    });
    expect(ownScoped.scopeBindings).toMatchObject({ caseIds: [own.data.id] });
    const shared = await createSource({
      scopeBindings: { caseIds: [own.data.id, foreign.data.id] },
    });
    expect(shared.scopeBindings).toMatchObject({ caseIds: [own.data.id, foreign.data.id] });
    expect((await getCase(own.data.id)).data).toEqual(ownNow.data);
    expect((await getCase(foreign.data.id)).data).toEqual(foreignNow.data);
  });

  it('link: exactly as requested and pinned to the exact revision; the case context moves; the source is never changed', async () => {
    const w = await world();
    const reviewed = await createSource({
      agencyId: w.agency.data.id,
      title: 'SYNTHETIC reviewed record',
      reportedProvenance: 'DOCUMENT_REVIEWED',
      reviewedByLabel: 'SYNTHETIC Reviewer',
    });
    const created = await createCase(w.agency.data.id, { routeId: w.route.data.id });
    const sourceBefore = await getSource(w.source.id);
    const reviewedBefore = await getSource(reviewed.id);
    const scopeNote = 'SYNTHETIC-SCOPE-NOTE: pages 1–3 of the packet';
    const result = await postLink(created.data.id, created.etag, {
      sourceId: w.source.id,
      useRole: 'SYNTHETIC_PACKET',
      scopeNote,
    });
    const linked = versioned<CaseSource>(result, 201);
    expect(linked.data).toEqual({
      id: linked.data.id,
      caseId: created.data.id,
      sourceId: w.source.id,
      useRole: 'SYNTHETIC_PACKET',
      scopeNote,
      linkState: 'LINKED',
      stateReason: null,
      createdAt: nowIso(),
      createdById: client.session.userId,
      updatedAt: nowIso(),
      updatedById: client.session.userId,
      rowVersion: 1,
    });
    expect(linked.etag).toBe(`"CaseSource:${linked.data.id}:v1"`);
    expect(affectedOf(result)).toEqual([
      { type: 'CaseRecord', id: created.data.id, rowVersion: 2 },
      { type: 'CaseSource', id: linked.data.id, rowVersion: 1 },
    ]);
    expect((await getCase(created.data.id)).data).toMatchObject({
      rowVersion: 2,
      contextRevision: 2,
    });
    const [event] = await auditRows(linked.data.id);
    expect(event).toMatchObject({
      action: 'CASE_SOURCE_LINKED',
      entityType: 'CaseSource',
      sourceIds: [w.source.id],
      afterRedacted: {
        caseId: created.data.id,
        sourceId: w.source.id,
        useRole: 'SYNTHETIC_PACKET',
        scopeNote: { redacted: true, codePoints: codePoints(scopeNote) },
        linkState: 'LINKED',
      },
    });
    expect(JSON.stringify(event)).not.toContain('SYNTHETIC-SCOPE-NOTE');
    // The same source in another role is another link; the same role again is refused.
    await linkSource(created.data.id, w.source.id, { useRole: 'SYNTHETIC_CONTEXT' });
    const duplicate = await postLink(created.data.id, (await getCase(created.data.id)).etag, {
      sourceId: w.source.id,
      useRole: 'SYNTHETIC_PACKET',
    });
    expect(errorOf(duplicate)).toMatchObject({
      code: 'DUPLICATE_CASE_SOURCE',
      details: { caseSourceId: linked.data.id },
    });
    // Linking never upgrades or downgrades provenance, reviews nothing and changes no source.
    await linkSource(created.data.id, reviewed.id);
    expect(await getSource(w.source.id)).toEqual(sourceBefore);
    expect(await getSource(reviewed.id)).toEqual(reviewedBefore);
    expect(sourceBefore.reportedProvenance).toBe('OPERATOR_REPORTED');
    // A newer revision never re-points a link.
    const head = await reviseSource(w.source.id, {
      agencyId: w.agency.data.id,
      title: 'SYNTHETIC agency record rev 2',
    });
    expect((await getLink(linked.data.id)).data.sourceId).toBe(w.source.id);
    const links = await listOf<CaseSource>('listCaseSources', `/cases/${created.data.id}/sources`);
    expect(links.items.map((item) => item.sourceId)).not.toContain(head.id);
    await expectNoLaterPhaseRecords();
  });

  it('link refuses sources that do not apply to this case; accepted scopes are the agency’s, a named case and the bound subject', async () => {
    const w = await world();
    const other = await world('B');
    const unbound = await createCase(w.agency.data.id);
    const bound = await createCase(w.agency.data.id, { routeId: w.route.data.id });
    const sibling = await createCase(w.agency.data.id);
    const otherSubject = await createSubject('M');
    const sources = {
      public: await createSource({ title: 'SYNTHETIC unscoped public record' }),
      shared: await createSource({ scopeBindings: { agencyIds: [w.agency.data.id] } }),
      sibling: await createSource({ scopeBindings: { caseIds: [sibling.data.id] } }),
      unboundOwn: await createSource({ scopeBindings: { caseIds: [unbound.data.id] } }),
      subject: await createSource({
        agencyId: w.agency.data.id,
        scopeBindings: { legalSubjectIds: [w.subject.data.id] },
      }),
      otherSubject: await createSource({
        agencyId: w.agency.data.id,
        scopeBindings: { legalSubjectIds: [otherSubject.data.id] },
      }),
    };
    const refusals: Array<[string, CaseRecord, string, string, string?]> = [
      ['unknown', unbound.data, randomUUID(), 'REFERENCE_NOT_FOUND'],
      ['other agency', unbound.data, other.source.id, 'CROSS_AGENCY_REFERENCE'],
      [
        'unscoped public',
        unbound.data,
        sources.public.id,
        'SOURCE_SCOPE_UNRESOLVED',
        'NOT_SCOPED_TO_AGENCY',
      ],
      ['another case', unbound.data, sources.sibling.id, 'CROSS_CASE_REFERENCE'],
      [
        'subject without a route',
        unbound.data,
        sources.subject.id,
        'SOURCE_SCOPE_UNRESOLVED',
        'CASE_SUBJECT_UNBOUND',
      ],
      [
        'another subject',
        bound.data,
        sources.otherSubject.id,
        'SOURCE_SCOPE_UNRESOLVED',
        'SCOPED_TO_OTHER_SUBJECT',
      ],
    ];
    for (const [label, target, sourceId, errorCode, reason] of refusals) {
      const current = await getCase(target.id);
      const refused = await postLink(target.id, current.etag, { sourceId });
      expect([refused.status, code(refused)], label).toEqual([422, errorCode]);
      expect(errorOf(refused).details, label).toMatchObject({
        field: 'sourceId',
        ...(reason ? { reason } : {}),
      });
    }
    expect(await countRows(prisma, 'case_sources')).toBe(0);
    expect((await getCase(unbound.data.id)).data.rowVersion).toBe(1);
    expect((await getCase(bound.data.id)).data.rowVersion).toBe(1);
    await linkSource(unbound.data.id, sources.shared.id);
    await linkSource(unbound.data.id, sources.unboundOwn.id);
    await linkSource(bound.data.id, sources.subject.id);
    expect(await countRows(prisma, 'case_sources')).toBe(3);
  });

  it('link state: PAUSED, UNLINKED and LINKED again with a reason and the link’s own ETag; the row and the source are never deleted', async () => {
    const w = await world();
    const created = await createCase(w.agency.data.id);
    const linked = await linkSource(created.data.id, w.source.id);
    expect(outcome(await setLinkState(linked.data.id, null, 'PAUSED'))).toEqual([
      428,
      'PRECONDITION_REQUIRED',
    ]);
    const caseEtag = (await getCase(created.data.id)).etag;
    expect(outcome(await setLinkState(linked.data.id, caseEtag, 'PAUSED'))).toEqual([
      412,
      'RECORD_VERSION_CONFLICT',
    ]);
    const result = await setLinkState(linked.data.id, linked.etag, 'PAUSED');
    const paused = versioned<CaseSource>(result, 200);
    expect(paused.data).toMatchObject({
      linkState: 'PAUSED',
      stateReason: 'SYNTHETIC link PAUSED',
      rowVersion: 2,
    });
    expect(affectedOf(result)).toEqual([
      { type: 'CaseRecord', id: created.data.id, rowVersion: 3 },
      { type: 'CaseSource', id: linked.data.id, rowVersion: 2 },
    ]);
    expect(errorOf(await setLinkState(linked.data.id, paused.etag, 'PAUSED'))).toMatchObject({
      code: 'RECORD_STATE_CONFLICT',
      details: { linkState: 'PAUSED', requested: 'PAUSED' },
    });
    const unlinked = versioned<CaseSource>(
      await setLinkState(linked.data.id, paused.etag, 'UNLINKED'),
      200,
    );
    expect(unlinked.data.linkState).toBe('UNLINKED');
    // Unlinked is not deleted, false or invalid: the row and the source stay readable.
    const listed = await listOf<CaseSource>('listCaseSources', `/cases/${created.data.id}/sources`);
    expect(listed.items).toEqual([unlinked.data]);
    await getSource(w.source.id);
    const relinked = versioned<CaseSource>(
      await setLinkState(linked.data.id, unlinked.etag, 'LINKED'),
      200,
    );
    expect(relinked.data).toMatchObject({ linkState: 'LINKED', rowVersion: 4 });
    expect((await getCase(created.data.id)).data).toMatchObject({
      rowVersion: 5,
      contextRevision: 5,
    });
    expect((await auditRows(linked.data.id)).map((row) => [row.action, row.reason])).toEqual([
      ['CASE_SOURCE_LINKED', null],
      ['CASE_SOURCE_LINK_STATE_CHANGED', 'SYNTHETIC link PAUSED'],
      ['CASE_SOURCE_LINK_STATE_CHANGED', 'SYNTHETIC link UNLINKED'],
      ['CASE_SOURCE_LINK_STATE_CHANGED', 'SYNTHETIC link LINKED'],
    ]);
    for (const [method, path] of [
      ['DELETE', `/case-sources/${linked.data.id}`],
      ['PATCH', `/case-sources/${linked.data.id}`],
      ['DELETE', `/cases/${created.data.id}/sources/${linked.data.id}`],
    ] as const) {
      const response = await unrouted(method, path);
      expect([response.status, code(response)], `${method} ${path}`).toEqual([404, 'NOT_FOUND']);
    }
    expect(await countRows(prisma, 'case_sources')).toBe(1);
  });

  it('list and get: one case’s links only, newest first; 404 for an unknown case or link', async () => {
    const w = await world();
    const caseA = await createCase(w.agency.data.id, { intakeLabel: 'SYNTHETIC case A' });
    const caseB = await createCase(w.agency.data.id, { intakeLabel: 'SYNTHETIC case B' });
    const extra = await createSource({ agencyId: w.agency.data.id, title: 'SYNTHETIC extra' });
    const first = await linkSource(caseA.data.id, w.source.id, { useRole: 'SYNTHETIC_PACKET' });
    t.clock.advance(1000);
    const second = await linkSource(caseA.data.id, extra.id, {
      useRole: 'SYNTHETIC_CONTEXT',
      scopeNote: 'SYNTHETIC Überblick',
    });
    const inB = await linkSource(caseB.data.id, w.source.id);
    const idsOf = (page: Page<CaseSource>) => page.items.map((item) => item.id);
    expect(idsOf(await listOf('listCaseSources', `/cases/${caseA.data.id}/sources`))).toEqual([
      second.data.id,
      first.data.id,
    ]);
    expect(idsOf(await listOf('listCaseSources', `/cases/${caseB.data.id}/sources`))).toEqual([
      inB.data.id,
    ]);
    expect(
      idsOf(await listOf('listCaseSources', `/cases/${caseA.data.id}/sources?q=context`)),
    ).toEqual([second.data.id]);
    expect(
      idsOf(await listOf('listCaseSources', `/cases/${caseA.data.id}/sources?q=uberblick`)),
    ).toEqual([second.data.id]);
    expect(
      idsOf(await listOf('listCaseSources', `/cases/${caseA.data.id}/sources?q=${extra.id}`)),
    ).toEqual([second.data.id]);
    const page1 = await listOf<CaseSource>(
      'listCaseSources',
      `/cases/${caseA.data.id}/sources?limit=1`,
    );
    expect(idsOf(page1)).toEqual([second.data.id]);
    const cursor = encodeURIComponent(page1.nextCursor ?? '');
    expect(
      idsOf(
        await listOf('listCaseSources', `/cases/${caseA.data.id}/sources?limit=1&cursor=${cursor}`),
      ),
    ).toEqual([first.data.id]);
    expect(
      outcome(
        await client.get(
          'listCaseSources',
          `/cases/${caseB.data.id}/sources?limit=1&cursor=${cursor}`,
        ),
      ),
    ).toEqual([400, 'INVALID_CURSOR']);
    expect(outcome(await client.get('listCaseSources', `/cases/${randomUUID()}/sources`))).toEqual([
      404,
      'NOT_FOUND',
    ]);
    expect(outcome(await client.get('getCaseSource', `/case-sources/${randomUUID()}`))).toEqual([
      404,
      'NOT_FOUND',
    ]);
    expect((await getLink(first.data.id)).data).toEqual(first.data);
  });
});

// ---------------------------------------------------------------------------------------------

describe('AUTHORITY SELECTION — pins the chain to evaluate for this case; not a G1 decision', () => {
  it('select: pins exactly the chosen route, signer, frozen coverages and basis source; the case pointer and context move; no authority record changes', async () => {
    const { w, a, case: created } = await caseWorld();
    const b = await authority(w, { label: 'second mandate' });
    const versionsBefore = await authorityVersions(w, a);
    const bBefore = await getCoverage(b.coverage.data.id);
    const sourceBefore = await getSource(w.source.id);
    const note = 'SYNTHETIC-SELECTION-NOTE evaluate both agreements';
    const body = {
      routeId: w.route.data.id,
      signerId: w.signer.data.id,
      taskType: 'INITIAL',
      intendedFromEmail: 'synthetic-sender@example.invalid',
      basisSourceId: w.source.id,
      selectionNote: note,
      coverages: [
        { coverageId: a.coverage.data.id, applicationScope: 'SYNTHETIC-SCOPE-A channel uploads' },
        { coverageId: b.coverage.data.id, applicationScope: 'SYNTHETIC-SCOPE-B music' },
      ],
    };
    const result = await postSelection(created.data.id, created.etag, body);
    const selection = immutable<CaseAuthoritySelection>(result, 201);
    expect(selection).toEqual({
      id: selection.id,
      caseId: created.data.id,
      agencyId: w.agency.data.id,
      routeId: w.route.data.id,
      signerId: w.signer.data.id,
      taskType: 'INITIAL',
      intendedFromEmail: 'synthetic-sender@example.invalid',
      basisSourceId: w.source.id,
      selectionNote: note,
      createdAt: nowIso(),
      createdById: client.session.userId,
    });
    const pinned = await prisma.caseAuthorityCoverage.findMany({
      where: { selectionId: selection.id },
    });
    expect(
      pinned
        .map((row) => ({
          selectionId: row.selectionId,
          caseId: row.caseId,
          agencyId: row.agencyId,
          routeId: row.routeId,
          coverageId: row.coverageId,
          applicationScope: row.applicationScope,
          createdById: row.createdById,
        }))
        .sort((x, y) => x.applicationScope.localeCompare(y.applicationScope)),
    ).toEqual([
      {
        selectionId: selection.id,
        caseId: created.data.id,
        agencyId: w.agency.data.id,
        routeId: w.route.data.id,
        coverageId: a.coverage.data.id,
        applicationScope: 'SYNTHETIC-SCOPE-A channel uploads',
        createdById: client.session.userId,
      },
      {
        selectionId: selection.id,
        caseId: created.data.id,
        agencyId: w.agency.data.id,
        routeId: w.route.data.id,
        coverageId: b.coverage.data.id,
        applicationScope: 'SYNTHETIC-SCOPE-B music',
        createdById: client.session.userId,
      },
    ]);
    const affected = affectedOf(result) as Array<{
      type: string;
      id: string;
      rowVersion: number | null;
    }>;
    expect(affected[0]).toEqual({ type: 'CaseRecord', id: created.data.id, rowVersion: 2 });
    expect(affected.at(-1)).toEqual({
      type: 'CaseAuthoritySelection',
      id: selection.id,
      rowVersion: null,
    });
    expect(
      affected
        .filter((entry) => entry.type === 'CaseAuthorityCoverage')
        .map((entry) => [entry.id, entry.rowVersion])
        .sort(),
    ).toEqual(pinned.map((row) => [row.id, null]).sort());
    expect((await getCase(created.data.id)).data).toMatchObject({
      currentAuthoritySelectionId: selection.id,
      rowVersion: 2,
      contextRevision: 2,
      workflowState: 'INTAKE',
    });
    const [event] = await auditRows(selection.id);
    expect(event).toMatchObject({
      action: 'CASE_AUTHORITY_SELECTED',
      entityType: 'CaseAuthoritySelection',
      sourceIds: [w.source.id],
      beforeRedacted: { previousSelectionId: null, caseRowVersion: 1, caseContextRevision: 1 },
      afterRedacted: {
        caseId: created.data.id,
        routeId: w.route.data.id,
        signerId: w.signer.data.id,
        taskType: 'INITIAL',
        selectionNote: { redacted: true, codePoints: codePoints(note) },
        caseRowVersion: 2,
        caseContextRevision: 2,
      },
    });
    for (const marker of ['SYNTHETIC-SELECTION-NOTE', 'SYNTHETIC-SCOPE-A', 'SYNTHETIC-SCOPE-B']) {
      expect(JSON.stringify(event)).not.toContain(marker);
    }
    // Pinning changes no authority or directory record and no source: nothing is approved, made
    // current, eligible or reviewed by selecting it.
    expect(await authorityVersions(w, a)).toEqual(versionsBefore);
    expect((await getCoverage(b.coverage.data.id)).data).toEqual(bBefore.data);
    expect(await getSource(w.source.id)).toEqual(sourceBefore);
    expect(await countRows(prisma, 'authority_events')).toBe(0);
    await expectNoLaterPhaseRecords();
  });

  it('no currentness: an expired, superseded frozen version is pinned exactly as chosen, and the latest version is never substituted', async () => {
    const w = await world();
    const expired = await authority(w, {
      label: 'expired agreement',
      version: { validityModel: 'FIXED_TERM', effectiveOn: '2019-01-01', expiresOn: '2020-12-31' },
    });
    const successor = await createVersion(expired.mandate.data.id, {
      changeKind: 'AMENDMENT',
      predecessorId: expired.version.data.id,
      primarySourceId: w.source.id,
      documentState: 'SIGNED_APPEARING',
      validityModel: 'UNTIL_TERMINATED',
    });
    const successorCoverage = await createCoverage(successor.data.id, {
      routeId: w.route.data.id,
      basisSourceId: expired.basis.id,
      coverageLabel: 'SYNTHETIC successor coverage',
    });
    await addCoverageSigner(successorCoverage.data.id, {
      signerId: w.signer.data.id,
      sourceId: expired.basis.id,
    });
    await freeze(successor.data.id);
    const created = await createCase(w.agency.data.id, { routeId: w.route.data.id });
    const oldChoice = await select(created.data.id, choose(w, [expired.coverage.data.id]));
    expect((await pinnedCoverages(oldChoice.id)).map((row) => row.coverageId)).toEqual([
      expired.coverage.data.id,
    ]);
    // Nothing on the selection claims currentness or validity.
    expect(Object.keys(oldChoice).sort()).toEqual(
      [
        'id',
        'caseId',
        'agencyId',
        'routeId',
        'signerId',
        'taskType',
        'intendedFromEmail',
        'basisSourceId',
        'selectionNote',
        'createdAt',
        'createdById',
      ].sort(),
    );
    // The newer version is used only when it is explicitly chosen.
    t.clock.advance(1000);
    const newChoice = await select(
      created.data.id,
      choose(w, [successorCoverage.data.id], { taskType: 'NMI_REPLY' }),
    );
    expect((await pinnedCoverages(newChoice.id)).map((row) => row.coverageId)).toEqual([
      successorCoverage.data.id,
    ]);
    expect((await pinnedCoverages(oldChoice.id)).map((row) => row.coverageId)).toEqual([
      expired.coverage.data.id,
    ]);
  });

  it('never implicit: the route’s preferred coverage is not selected, an empty choice is refused and the explicit choice wins', async () => {
    const w = await world();
    const preferred = await authority(w, { label: 'preferred' });
    const chosen = await authority(w, { label: 'chosen' });
    const route = await getRoute(w.route.data.id);
    versioned(
      await patchRoute(route.data.id, route.etag, {
        preferredCoverageId: preferred.coverage.data.id,
      }),
      200,
    );
    const created = await createCase(w.agency.data.id, { routeId: w.route.data.id });
    expect(created.data.currentAuthoritySelectionId).toBeNull();
    for (const body of [
      choose(w, []),
      { routeId: w.route.data.id, signerId: w.signer.data.id },
      {
        ...choose(w, [chosen.coverage.data.id]),
        coverages: [{ coverageId: chosen.coverage.data.id }],
      },
    ]) {
      expect(
        outcome(await postSelection(created.data.id, created.etag, body)),
        JSON.stringify(body),
      ).toEqual([422, 'VALIDATION_FAILED']);
    }
    const selection = await select(created.data.id, choose(w, [chosen.coverage.data.id]));
    expect((await pinnedCoverages(selection.id)).map((row) => row.coverageId)).toEqual([
      chosen.coverage.data.id,
    ]);
    expect((await getRoute(w.route.data.id)).data.preferredCoverageId).toBe(
      preferred.coverage.data.id,
    );
  });

  it('the chain must be exact — route, signer, coverage, frozen version, unarchived mandate, recorded signer, applicable basis; every refusal writes nothing', async () => {
    const { w, a, case: created } = await caseWorld();
    const other = await world('B');
    const otherAuthority = await authority(other, { label: 'other agency' });
    const second = await anotherRoute(w.agency.data.id, 'Second');
    const secondRoute = await authority(w, {
      routeId: second.route.data.id,
      label: 'second route',
    });
    const draft = await authority(w, { frozen: false, label: 'draft' });
    const unrecordedSigner = await createSigner(w.agency.data.id, 'SYNTHETIC Unrecorded Person');
    const notRecorded = await authority(w, {
      label: 'other signer',
      signerId: unrecordedSigner.data.id,
    });
    const archivedMandate = await authority(w, { label: 'archived mandate' });
    versioned(
      await command(
        'archiveMandate',
        `/mandates/${archivedMandate.mandate.data.id}/archive`,
        archivedMandate.mandate.etag,
      ),
      200,
    );
    const archivedSigner = await createSigner(w.agency.data.id, 'SYNTHETIC Archived Person');
    versioned(
      await command(
        'archiveSigner',
        `/signers/${archivedSigner.data.id}/archive`,
        archivedSigner.etag,
      ),
      200,
    );
    const endedSigner = await createSigner(w.agency.data.id, 'SYNTHETIC Ended Person');
    versioned(
      await command('setSignerState', `/signers/${endedSigner.data.id}/state`, endedSigner.etag, {
        state: 'ENDED',
        reason: 'SYNTHETIC ended',
      }),
      200,
    );
    const unbound = await createCase(w.agency.data.id);
    const sibling = await createCase(w.agency.data.id);
    const siblingScoped = await createSource({ scopeBindings: { caseIds: [sibling.data.id] } });
    const good = choose(w, [a.coverage.data.id]);
    const coverage = (coverageId: string) => ({
      coverages: [{ coverageId, applicationScope: 'SYNTHETIC application scope' }],
    });
    const refusals: Array<
      [string, string, Record<string, unknown>, number, string, Record<string, unknown>?]
    > = [
      [
        'case without a route',
        unbound.data.id,
        good,
        422,
        'AUTHORITY_SCOPE_UNRESOLVED',
        { field: 'routeId', reason: 'CASE_ROUTE_UNBOUND' },
      ],
      [
        'another route of the agency',
        created.data.id,
        { ...good, routeId: second.route.data.id },
        422,
        'AUTHORITY_SCOPE_UNRESOLVED',
        { field: 'routeId', reason: 'NOT_CASE_ROUTE' },
      ],
      [
        'an unknown route',
        created.data.id,
        { ...good, routeId: randomUUID() },
        422,
        'AUTHORITY_SCOPE_UNRESOLVED',
        { reason: 'NOT_CASE_ROUTE' },
      ],
      [
        'an unknown signer',
        created.data.id,
        { ...good, signerId: randomUUID() },
        422,
        'REFERENCE_NOT_FOUND',
        { field: 'signerId' },
      ],
      [
        'the application User as signer',
        created.data.id,
        { ...good, signerId: client.session.userId },
        422,
        'REFERENCE_NOT_FOUND',
        { field: 'signerId' },
      ],
      [
        'another agency’s signer',
        created.data.id,
        { ...good, signerId: other.signer.data.id },
        422,
        'CROSS_AGENCY_REFERENCE',
        { field: 'signerId' },
      ],
      [
        'an archived signer',
        created.data.id,
        { ...good, signerId: archivedSigner.data.id },
        409,
        'RECORD_STATE_CONFLICT',
        { record: 'Signer', archived: true, field: 'signerId' },
      ],
      [
        'an ENDED signer',
        created.data.id,
        { ...good, signerId: endedSigner.data.id },
        409,
        'RECORD_STATE_CONFLICT',
        { record: 'Signer', state: 'ENDED', field: 'signerId' },
      ],
      [
        'an unknown coverage',
        created.data.id,
        { ...good, ...coverage(randomUUID()) },
        422,
        'REFERENCE_NOT_FOUND',
        { field: 'coverages.0.coverageId' },
      ],
      [
        'another agency’s coverage',
        created.data.id,
        { ...good, ...coverage(otherAuthority.coverage.data.id) },
        422,
        'CROSS_AGENCY_REFERENCE',
        { field: 'coverages.0.coverageId' },
      ],
      [
        'another route’s coverage',
        created.data.id,
        { ...good, ...coverage(secondRoute.coverage.data.id) },
        422,
        'AUTHORITY_SCOPE_UNRESOLVED',
        { field: 'coverages.0.coverageId', reason: 'OTHER_ROUTE' },
      ],
      [
        'a draft version',
        created.data.id,
        { ...good, ...coverage(draft.coverage.data.id) },
        409,
        'VERSION_NOT_FROZEN',
        { field: 'coverages.0.coverageId', versionId: draft.version.data.id },
      ],
      [
        'an archived mandate',
        created.data.id,
        { ...good, ...coverage(archivedMandate.coverage.data.id) },
        409,
        'RECORD_STATE_CONFLICT',
        { record: 'Mandate', archived: true, field: 'coverages.0.coverageId' },
      ],
      [
        'a signer not recorded under the coverage',
        created.data.id,
        { ...good, ...coverage(notRecorded.coverage.data.id) },
        422,
        'AUTHORITY_SCOPE_UNRESOLVED',
        { field: 'coverages.0.coverageId', reason: 'SIGNER_NOT_RECORDED' },
      ],
      [
        'the second coverage is not usable',
        created.data.id,
        choose(w, [a.coverage.data.id, draft.coverage.data.id]),
        409,
        'VERSION_NOT_FROZEN',
        { field: 'coverages.1.coverageId' },
      ],
      [
        'the same coverage twice',
        created.data.id,
        choose(w, [a.coverage.data.id, a.coverage.data.id]),
        422,
        'VALIDATION_FAILED',
      ],
      [
        'another agency’s basis source',
        created.data.id,
        { ...good, basisSourceId: other.source.id },
        422,
        'CROSS_AGENCY_REFERENCE',
        { field: 'basisSourceId' },
      ],
      [
        'another case’s basis source',
        created.data.id,
        { ...good, basisSourceId: siblingScoped.id },
        422,
        'CROSS_CASE_REFERENCE',
        { field: 'basisSourceId' },
      ],
      [
        'an unknown basis source',
        created.data.id,
        { ...good, basisSourceId: randomUUID() },
        422,
        'REFERENCE_NOT_FOUND',
        { field: 'basisSourceId' },
      ],
      ['a G1 claim', created.data.id, { ...good, g1Status: 'PASS' }, 422, 'VALIDATION_FAILED'],
      [
        'a currentness claim',
        created.data.id,
        { ...good, currentAuthority: true },
        422,
        'VALIDATION_FAILED',
      ],
      [
        'an eligibility claim',
        created.data.id,
        { ...good, signerEligible: true },
        422,
        'VALIDATION_FAILED',
      ],
      [
        'an unknown task type',
        created.data.id,
        { ...good, taskType: 'SUBMIT_NOTICE' },
        422,
        'VALIDATION_FAILED',
      ],
      [
        'a malformed sender',
        created.data.id,
        { ...good, intendedFromEmail: 'not-an-address' },
        422,
        'VALIDATION_FAILED',
      ],
    ];
    for (const [label, caseId, body, status, errorCode, details] of refusals) {
      const current = await getCase(caseId);
      const refused = await postSelection(caseId, current.etag, body);
      expect([refused.status, code(refused)], label).toEqual([status, errorCode]);
      if (details) expect(errorOf(refused).details, label).toMatchObject(details);
    }
    const duplicate = await postSelection(
      created.data.id,
      created.etag,
      choose(w, [a.coverage.data.id, a.coverage.data.id]),
    );
    expect(errorOf(duplicate).details).toMatchObject({
      issues: [
        { path: 'coverages.1.coverageId', message: 'Each coverage can be selected only once' },
      ],
    });
    // A paused route cannot take a new selection (DOMAIN §8).
    await setRouteState(w.route.data.id, 'PAUSED');
    expect(errorOf(await postSelection(created.data.id, created.etag, good))).toMatchObject({
      code: 'RECORD_STATE_CONFLICT',
      details: { record: 'Route', linkState: 'PAUSED', field: 'routeId' },
    });
    await setRouteState(w.route.data.id, 'LINKED');
    expect(await countRows(prisma, 'case_authority_selections')).toBe(0);
    expect(await countRows(prisma, 'case_authority_coverages')).toBe(0);
    expect((await getCase(created.data.id)).data).toEqual(created.data);
    // With the chain intact, the same case selects.
    await select(created.data.id, good);
  });

  it('history is append-only: a new selection moves the pointer; earlier selections and their pinned coverages never change', async () => {
    const { w, a, case: created } = await caseWorld();
    const b = await authority(w, { label: 'second mandate' });
    const first = await select(created.data.id, choose(w, [a.coverage.data.id]));
    const firstPinned = await pinnedCoverages(first.id);
    const staleEtag = (await getCase(created.data.id)).etag;
    t.clock.advance(1000);
    const second = await select(
      created.data.id,
      choose(w, [b.coverage.data.id], {
        taskType: 'NMI_REPLY',
        intendedFromEmail: 'synthetic-nmi@example.invalid',
        selectionNote: 'SYNTHETIC reply selection',
      }),
    );
    const after = await getCase(created.data.id);
    expect(after.data).toMatchObject({
      currentAuthoritySelectionId: second.id,
      rowVersion: 3,
      contextRevision: 3,
    });
    expect((await auditRows(second.id))[0]).toMatchObject({
      beforeRedacted: { previousSelectionId: first.id },
    });
    const history = await listOf<CaseAuthoritySelection>(
      'listCaseAuthoritySelections',
      `/cases/${created.data.id}/authority-selections`,
    );
    expect(history.items).toEqual([second, first]);
    expect(await pinnedCoverages(first.id)).toEqual(firstPinned);
    // A write with the ETag read before the second selection is stale.
    expect(
      outcome(await postSelection(created.data.id, staleEtag, choose(w, [a.coverage.data.id]))),
    ).toEqual([412, 'RECORD_VERSION_CONFLICT']);
    const search = async (q: string) =>
      (
        await listOf<CaseAuthoritySelection>(
          'listCaseAuthoritySelections',
          `/cases/${created.data.id}/authority-selections?q=${encodeURIComponent(q)}`,
        )
      ).items.map((item) => item.id);
    expect(await search(first.id)).toEqual([first.id]);
    expect(await search('NMI_REPLY')).toEqual([second.id]);
    expect(await search('synthetic-nmi')).toEqual([second.id]);
    expect(await search('reply selection')).toEqual([second.id]);
    expect(await search(w.signer.data.id)).toEqual([second.id, first.id]);
    expect(
      outcome(
        await client.get(
          'listCaseAuthoritySelections',
          `/cases/${randomUUID()}/authority-selections`,
        ),
      ),
    ).toEqual([404, 'NOT_FOUND']);
    // No route changes, removes or approves a selection.
    for (const [method, path] of [
      ['PATCH', `/cases/${created.data.id}/authority-selections/${first.id}`],
      ['DELETE', `/cases/${created.data.id}/authority-selections/${first.id}`],
      ['GET', `/case-authority-selections/${first.id}`],
      ['POST', `/cases/${created.data.id}/authority-selections/${first.id}/approve`],
      ['DELETE', `/cases/${created.data.id}/authority-selections`],
    ] as const) {
      const response = await unrouted(method, path);
      expect([response.status, code(response)], `${method} ${path}`).toEqual([404, 'NOT_FOUND']);
    }
    expect(await countRows(prisma, 'case_authority_selections')).toBe(2);
  });

  it('exact ids stay pinned: a newer source revision, a new default signer or a new preferred coverage changes no selection', async () => {
    const { w, a, case: created } = await caseWorld();
    const b = await authority(w, { label: 'later preference' });
    const selection = await select(
      created.data.id,
      choose(w, [a.coverage.data.id], { basisSourceId: w.source.id }),
    );
    const pinned = await pinnedCoverages(selection.id);
    const caseBefore = await getCase(created.data.id);
    await reviseSource(w.source.id, {
      agencyId: w.agency.data.id,
      title: 'SYNTHETIC agency record rev 2',
    });
    const otherSigner = await createSigner(w.agency.data.id, 'SYNTHETIC Default Person');
    const route = await getRoute(w.route.data.id);
    versioned(
      await patchRoute(route.data.id, route.etag, {
        defaultSignerId: otherSigner.data.id,
        preferredCoverageId: b.coverage.data.id,
      }),
      200,
    );
    const history = await listOf<CaseAuthoritySelection>(
      'listCaseAuthoritySelections',
      `/cases/${created.data.id}/authority-selections`,
    );
    expect(history.items).toEqual([selection]);
    expect(await pinnedCoverages(selection.id)).toEqual(pinned);
    expect((await getCase(created.data.id)).data).toEqual(caseBefore.data);
  });
});

// ---------------------------------------------------------------------------------------------

describe('SELECTION READ-BACK (TB-SCHEMA-API-v1.1.0, R8) — the exact chain pinned for evaluation in this case', () => {
  /** An error body without its per-request id: equal bodies are indistinguishable refusals. */
  const refusal = (result: HttpResult) => {
    const {
      code: errorCode,
      message,
      details,
    } = (result.json as { error: { code: string; message: string; details: unknown } }).error;
    return { code: errorCode, message, details };
  };

  it('one coverage: reads back exactly the stored selection and its one pinned row; no ETag, no precondition, nothing written', async () => {
    const { w, a, case: created } = await caseWorld();
    const result = await postSelection(
      created.data.id,
      created.etag,
      choose(w, [a.coverage.data.id], { basisSourceId: w.source.id }),
    );
    const selection = immutable<CaseAuthoritySelection>(result, 201);
    const pinnedIds = (affectedOf(result) as Array<{ type: string; id: string }>)
      .filter((entry) => entry.type === 'CaseAuthorityCoverage')
      .map((entry) => entry.id);
    expect(pinnedIds).toHaveLength(1);
    const before = await tableDump();
    const read = await readSelection(created.data.id, selection.id);
    const view = immutable<CaseAuthoritySelectionView>(read, 200);
    expect(view).toEqual({
      selection,
      coverages: [
        {
          id: pinnedIds[0],
          selectionId: selection.id,
          caseId: created.data.id,
          agencyId: w.agency.data.id,
          routeId: w.route.data.id,
          coverageId: a.coverage.data.id,
          applicationScope: 'SYNTHETIC application scope 1',
          createdAt: selection.createdAt,
          createdById: client.session.userId,
        },
      ],
    });
    expect(view.coverages).toEqual(await storedPinned(selection.id));
    expect(affectedOf(read)).toEqual([]);
    // Read-only: sent without If-Match or Idempotency-Key, repeatable, and nothing changed — no
    // row, version, audit event or idempotency record anywhere.
    expect(await getSelection(created.data.id, selection.id)).toEqual(view);
    expect(await tableDump()).toEqual(before);
    expect((await getCase(created.data.id)).data).toMatchObject({
      rowVersion: 2,
      contextRevision: 2,
      currentAuthoritySelectionId: selection.id,
    });
    // Session-protected like every business read.
    const anonymous = await http(
      t.port,
      'GET',
      `/api/v1/cases/${created.data.id}/authority-selections/${selection.id}`,
    );
    expect([anonymous.status, code(anonymous)]).toEqual([401, 'SESSION_REQUIRED']);
  });

  it('several coverages: every pinned row reads back in ascending coverageId order, each with its own application scope exactly as entered', async () => {
    const { w, a, case: created } = await caseWorld();
    const b = await authority(w, { label: 'second mandate' });
    const c = await authority(w, { label: 'third mandate' });
    const prefix = 'SYNTHETIC-SCOPE-C ';
    const scopes = new Map([
      [a.coverage.data.id, '  SYNTHETIC-SCOPE-A leading and trailing spaces  '],
      [
        b.coverage.data.id,
        'SYNTHETIC-SCOPE-B line one\r\nline two\ttab — “quotes” \\ {"json": true} café / café',
      ],
      [c.coverage.data.id, `${prefix}${'𝄞'.repeat(6000 - codePoints(prefix))}`],
    ]);
    expect(codePoints(scopes.get(c.coverage.data.id) ?? '')).toBe(6000);
    // Submitted in descending coverageId order: the read order is the stored order, not the request's.
    const ascending = [...scopes.keys()].sort();
    const selection = await select(created.data.id, {
      ...choose(w, []),
      coverages: [...ascending].reverse().map((coverageId) => ({
        coverageId,
        applicationScope: scopes.get(coverageId),
      })),
    });
    const view = await getSelection(created.data.id, selection.id);
    expect(view.selection).toEqual(selection);
    expect(view.coverages.map((row) => row.coverageId)).toEqual(ascending);
    for (const row of view.coverages) {
      // Each coverage keeps its own scope, byte for byte: nothing trimmed, normalized or combined.
      expect(row.applicationScope).toBe(scopes.get(row.coverageId));
      expect(row).toMatchObject({
        selectionId: selection.id,
        caseId: created.data.id,
        agencyId: w.agency.data.id,
        routeId: w.route.data.id,
        createdById: client.session.userId,
      });
    }
    expect(new Set(view.coverages.map((row) => row.id)).size).toBe(3);
    expect(view.coverages).toEqual(await storedPinned(selection.id));
    // Deterministic: every read returns the same rows in the same order.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(await getSelection(created.data.id, selection.id)).toEqual(view);
    }
  });

  it('historical pinning: a new preferred coverage, newer authority records, newer source revisions and an archived mandate leave the read-back unchanged', async () => {
    const { w, a, case: created } = await caseWorld();
    const selection = await select(
      created.data.id,
      choose(w, [a.coverage.data.id], { basisSourceId: w.source.id }),
    );
    const before = await readSelection(created.data.id, selection.id);
    const pinnedBefore = immutable<CaseAuthoritySelectionView>(before, 200);
    // Present-day authority state moves on. A newer frozen version of the same mandate, with its own
    // coverage of the route recording the same signer:
    const successor = await createVersion(a.mandate.data.id, {
      changeKind: 'AMENDMENT',
      predecessorId: a.version.data.id,
      primarySourceId: w.source.id,
      documentState: 'SIGNED_APPEARING',
    });
    const successorCoverage = await createCoverage(successor.data.id, {
      routeId: w.route.data.id,
      basisSourceId: a.basis.id,
      coverageLabel: 'SYNTHETIC successor coverage',
    });
    await addCoverageSigner(successorCoverage.data.id, {
      signerId: w.signer.data.id,
      sourceId: a.basis.id,
    });
    await freeze(successor.data.id);
    // another mandate's coverage becomes the route's preferred coverage, with a new default signer;
    const preferred = await authority(w, { label: 'later preference' });
    const otherSigner = await createSigner(w.agency.data.id, 'SYNTHETIC Default Person');
    const route = await getRoute(w.route.data.id);
    versioned(
      await patchRoute(route.data.id, route.etag, {
        preferredCoverageId: preferred.coverage.data.id,
        defaultSignerId: otherSigner.data.id,
      }),
      200,
    );
    // the basis source and the coverage basis get newer revisions;
    const revised = await reviseSource(w.source.id, {
      agencyId: w.agency.data.id,
      title: 'SYNTHETIC agency record rev 2',
    });
    await reviseSource(a.basis.id, {
      agencyId: w.agency.data.id,
      title: 'SYNTHETIC coverage basis rev 2',
    });
    // a later event is reported for the mandate, and the mandate is archived.
    await recordEvent(a.mandate.data.id, { sourceId: revised.id });
    const mandate = await getMandate(a.mandate.data.id);
    versioned(
      await command('archiveMandate', `/mandates/${mandate.data.id}/archive`, mandate.etag),
      200,
    );
    t.clock.advance(60_000);
    // The historical selection reads back byte for byte as before: no substitution, no following.
    const after = await readSelection(created.data.id, selection.id);
    expect(immutable<CaseAuthoritySelectionView>(after, 200)).toEqual(pinnedBefore);
    expect(JSON.stringify(dataOf(after))).toBe(JSON.stringify(dataOf(before)));
    expect(pinnedBefore.selection.basisSourceId).toBe(w.source.id);
    expect(revised.supersedesSourceId).toBe(w.source.id);
    expect(pinnedBefore.coverages.map((row) => row.coverageId)).toEqual([a.coverage.data.id]);
    expect(pinnedBefore.coverages.map((row) => row.coverageId)).not.toContain(
      successorCoverage.data.id,
    );
    expect(pinnedBefore.coverages.map((row) => row.coverageId)).not.toContain(
      preferred.coverage.data.id,
    );
    expect(pinnedBefore.selection.signerId).toBe(w.signer.data.id);
    expect((await getCase(created.data.id)).data.currentAuthoritySelectionId).toBe(selection.id);
  });

  it('case isolation: another case’s selection is 404 through this case, exactly like an unknown selection or case; each case reads only its own', async () => {
    const { w, a, case: caseA } = await caseWorld();
    const caseB = await createCase(w.agency.data.id, { routeId: w.route.data.id });
    const selectionA = await select(
      caseA.data.id,
      choose(w, [a.coverage.data.id], { selectionNote: 'SYNTHETIC-A-ONLY selection note' }),
    );
    const selectionB = await select(
      caseB.data.id,
      choose(w, [a.coverage.data.id], { selectionNote: 'SYNTHETIC-B-ONLY selection note' }),
    );
    const other = await caseWorld('Other');
    const selectionC = await select(
      other.case.data.id,
      choose(other.w, [other.a.coverage.data.id]),
    );
    const unknown = refusal(await readSelection(caseA.data.id, randomUUID()));
    expect(unknown).toEqual({
      code: 'NOT_FOUND',
      message: 'The requested resource does not exist.',
      details: {},
    });
    for (const [caseId, id] of [
      [caseB.data.id, selectionA.id],
      [caseA.data.id, selectionB.id],
      [caseA.data.id, selectionC.id],
      [other.case.data.id, selectionA.id],
      [randomUUID(), selectionA.id],
      [caseA.data.id, caseA.data.id],
      [caseA.data.id, 'not-a-selection-id'],
    ] as const) {
      const refused = await readSelection(caseId, id);
      expect(refused.status, `${caseId} ${id}`).toBe(404);
      expect(refusal(refused), `${caseId} ${id}`).toEqual(unknown);
      expect(refused.text).not.toContain('SYNTHETIC-A-ONLY');
      expect(refused.text).not.toContain('SYNTHETIC-B-ONLY');
    }
    // Each case reads its own selection and only its own pinned rows.
    const viewA = await getSelection(caseA.data.id, selectionA.id);
    const viewB = await getSelection(caseB.data.id, selectionB.id);
    expect(viewA.selection.selectionNote).toBe('SYNTHETIC-A-ONLY selection note');
    expect(viewB.selection.selectionNote).toBe('SYNTHETIC-B-ONLY selection note');
    expect(viewA.coverages.map((row) => [row.caseId, row.selectionId])).toEqual([
      [caseA.data.id, selectionA.id],
    ]);
    expect(viewB.coverages.map((row) => [row.caseId, row.selectionId])).toEqual([
      [caseB.data.id, selectionB.id],
    ]);
    expect(viewA.coverages[0]?.id).not.toBe(viewB.coverages[0]?.id);
    expect(JSON.stringify(viewB)).not.toContain(selectionA.id);
  });

  it('adds no G1, readiness or currentness field, and the list is unchanged: selection rows only, newest first', async () => {
    const { w, a, case: created } = await caseWorld();
    const b = await authority(w, { label: 'second mandate' });
    const first = await select(created.data.id, choose(w, [a.coverage.data.id]));
    t.clock.advance(1000);
    const second = await select(
      created.data.id,
      choose(w, [a.coverage.data.id, b.coverage.data.id], { taskType: 'NMI_REPLY' }),
    );
    const view = await getSelection(created.data.id, second.id);
    expect(Object.keys(view)).toEqual(['selection', 'coverages']);
    expect(Object.keys(view.selection).sort()).toEqual(
      [
        'id',
        'caseId',
        'agencyId',
        'routeId',
        'signerId',
        'taskType',
        'intendedFromEmail',
        'basisSourceId',
        'selectionNote',
        'createdAt',
        'createdById',
      ].sort(),
    );
    for (const row of view.coverages) {
      expect(Object.keys(row).sort()).toEqual(
        [
          'id',
          'selectionId',
          'caseId',
          'agencyId',
          'routeId',
          'coverageId',
          'applicationScope',
          'createdAt',
          'createdById',
        ].sort(),
      );
    }
    expect(JSON.stringify(view)).not.toMatch(
      /"(g[1-7]\w*|ready\w*|readiness|eligib\w*|authori[sz]ed\w*|current\w*|isCurrent\w*|valid\w*|approved\w*|verified\w*|status)"\s*:/i,
    );
    // The list is backward compatible: the same response as before, selection rows only.
    const history = await listOf<CaseAuthoritySelection>(
      'listCaseAuthoritySelections',
      `/cases/${created.data.id}/authority-selections`,
    );
    expect(history.items).toEqual([second, first]);
    for (const item of history.items) {
      expect(Object.keys(item)).not.toContain('coverages');
      expect((await getSelection(created.data.id, item.id)).selection).toEqual(item);
    }
    expect(
      (await getSelection(created.data.id, first.id)).coverages.map((row) => row.coverageId),
    ).toEqual([a.coverage.data.id]);
    expect(
      (await getSelection(created.data.id, second.id)).coverages.map((row) => row.coverageId),
    ).toEqual([a.coverage.data.id, b.coverage.data.id].sort());
  });

  it('a stored selection without its pinned rows is never shown as a chain: 500, nothing invented', async () => {
    const { w, case: created } = await caseWorld();
    const bare = randomUUID();
    // Not reachable through the API (a selection and its rows are one transaction): a direct insert.
    await prisma.caseAuthoritySelection.create({
      data: {
        id: bare,
        caseId: created.data.id,
        agencyId: w.agency.data.id,
        routeId: w.route.data.id,
        signerId: w.signer.data.id,
        taskType: 'INITIAL',
        intendedFromEmail: 'synthetic-sender@example.invalid',
        basisSourceId: null,
        selectionNote: 'SYNTHETIC integrity probe',
        createdAt: new Date(t.clock.ms),
        createdById: client.session.userId,
      },
    });
    expect(outcome(await readSelection(created.data.id, bare))).toEqual([500, 'INTERNAL_ERROR']);
    expect(await prisma.caseAuthorityCoverage.count()).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------

describe('CONTAMINATION — nothing crosses from one case to another, or from another agency', () => {
  it('two cases on one route: links, selections, canonical ids, workflow and archive stay with their own case', async () => {
    const { w, a, case: caseA } = await caseWorld();
    const caseB = await createCase(w.agency.data.id, { routeId: w.route.data.id });
    // Material recorded for case A only (named while A is open).
    const scopedToA = await createSource({ scopeBindings: { caseIds: [caseA.data.id] } });
    const linkA = await linkSource(caseA.data.id, w.source.id);
    const selectionA = await select(caseA.data.id, choose(w, [a.coverage.data.id]));
    const aNow = await getCase(caseA.data.id);
    versioned(
      await bindCanonical(caseA.data.id, aNow.etag, {
        canonicalCode: 'SYN-A',
        sourceId: w.source.id,
      }),
      200,
    );
    versioned(await setWorkflow(caseA.data.id, (await getCase(caseA.data.id)).etag, 'CLOSED'), 200);
    versioned(await archiveCase(caseA.data.id, (await getCase(caseA.data.id)).etag), 200);
    // Case B saw none of it.
    expect((await getCase(caseB.data.id)).data).toEqual(caseB.data);
    expect(
      (await listOf<CaseSource>('listCaseSources', `/cases/${caseB.data.id}/sources`)).items,
    ).toEqual([]);
    expect(
      (
        await listOf<CaseAuthoritySelection>(
          'listCaseAuthoritySelections',
          `/cases/${caseB.data.id}/authority-selections`,
        )
      ).items,
    ).toEqual([]);
    // A's material scoped to A never supports B, and A's canonical code is A's.
    expect(code(await postLink(caseB.data.id, caseB.etag, { sourceId: scopedToA.id }))).toBe(
      'CROSS_CASE_REFERENCE',
    );
    expect(
      code(
        await postSelection(
          caseB.data.id,
          caseB.etag,
          choose(w, [a.coverage.data.id], { basisSourceId: scopedToA.id }),
        ),
      ),
    ).toBe('CROSS_CASE_REFERENCE');
    expect(
      code(
        await bindCanonical(caseB.data.id, caseB.etag, {
          canonicalCode: 'SYN-B',
          sourceId: scopedToA.id,
        }),
      ),
    ).toBe('CROSS_CASE_REFERENCE');
    expect(
      code(
        await bindCanonical(caseB.data.id, caseB.etag, {
          canonicalCode: 'SYN-A',
          sourceId: w.source.id,
        }),
      ),
    ).toBe('DUPLICATE_CANONICAL_CODE');
    // B remains fully writable while A is archived, and selects its own chain explicitly.
    const selectionB = await select(caseB.data.id, choose(w, [a.coverage.data.id]));
    expect(selectionB.id).not.toBe(selectionA.id);
    expect((await getCase(caseA.data.id)).data.currentAuthoritySelectionId).toBe(selectionA.id);
    expect((await getCase(caseB.data.id)).data.currentAuthoritySelectionId).toBe(selectionB.id);
    expect((await getLink(linkA.data.id)).data.caseId).toBe(caseA.data.id);
    expect(await prisma.caseAuthorityCoverage.count({ where: { caseId: caseB.data.id } })).toBe(1);
    expect(await prisma.caseAuthorityCoverage.count({ where: { caseId: caseA.data.id } })).toBe(1);
  });

  it('two agencies with identical names: a case never reaches the other agency’s route, signer, coverage or source', async () => {
    const { w, a, case: created } = await caseWorld('Twin');
    const twin = await world('Twin');
    const twinAuthority = await authority(twin, { label: 'twin' });
    expect(twin.agency.data.displayName).toBe(w.agency.data.displayName);
    expect(code(await bindRoute(created.data.id, created.etag, twin.route.data.id))).toBe(
      'CROSS_AGENCY_REFERENCE',
    );
    expect(
      code(
        await postSelection(
          created.data.id,
          created.etag,
          choose(w, [a.coverage.data.id], { signerId: twin.signer.data.id }),
        ),
      ),
    ).toBe('CROSS_AGENCY_REFERENCE');
    expect(
      code(
        await postSelection(
          created.data.id,
          created.etag,
          choose(w, [twinAuthority.coverage.data.id]),
        ),
      ),
    ).toBe('CROSS_AGENCY_REFERENCE');
    expect(code(await postLink(created.data.id, created.etag, { sourceId: twin.source.id }))).toBe(
      'CROSS_AGENCY_REFERENCE',
    );
    expect((await getCase(created.data.id)).data).toEqual(created.data);
  });

  it('the application User is only the actor: never a Signer, owner, reviewer or case fact', async () => {
    const { w, a, case: created } = await caseWorld();
    const signersBefore = await countRows(prisma, 'signers');
    const coverageSignersBefore = await countRows(prisma, 'coverage_signers');
    const refused = await postSelection(
      created.data.id,
      created.etag,
      choose(w, [a.coverage.data.id], { signerId: client.session.userId }),
    );
    expect(errorOf(refused)).toMatchObject({
      code: 'REFERENCE_NOT_FOUND',
      details: { field: 'signerId' },
    });
    expect(
      code(await patchCase(created.data.id, created.etag, { ownerHintId: client.session.userId })),
    ).toBe('REFERENCE_NOT_FOUND');
    const selection = await select(created.data.id, choose(w, [a.coverage.data.id]));
    expect(selection.createdById).toBe(client.session.userId);
    expect(selection.signerId).toBe(w.signer.data.id);
    expect(await countRows(prisma, 'signers')).toBe(signersBefore);
    expect(await countRows(prisma, 'coverage_signers')).toBe(coverageSignersBefore);
    expect((await getSource(w.source.id)).reviewedByLabel).toBeNull();
    await expectNoLaterPhaseRecords();
  });
});

// ---------------------------------------------------------------------------------------------

describe('SHARED WRITE LAYER — If-Match, Idempotency-Key, atomic audit', () => {
  /** The 10 P4A operations with a contracted precondition, each with a valid request. */
  async function conditionalWrites() {
    const { w, a, case: created } = await caseWorld();
    const spare = await createCase(w.agency.data.id, { intakeLabel: 'SYNTHETIC spare' });
    const archivedCase = await createCase(w.agency.data.id, { intakeLabel: 'SYNTHETIC archived' });
    versioned(await archiveCase(archivedCase.data.id, archivedCase.etag), 200);
    const unbound = await createCase(w.agency.data.id, { intakeLabel: 'SYNTHETIC unbound' });
    const extra = await createSource({ agencyId: w.agency.data.id, title: 'SYNTHETIC extra' });
    const linked = await linkSource(spare.data.id, w.source.id);
    const writes: Array<{
      operationId: string;
      method: 'POST' | 'PATCH' | 'DELETE';
      path: string;
      body?: Record<string, unknown>;
      target: string;
    }> = [
      {
        operationId: 'patchCase',
        method: 'PATCH',
        path: `/cases/${created.data.id}`,
        body: { notes: 'x' },
        target: `CaseRecord:${created.data.id}`,
      },
      {
        operationId: 'deleteUnusedCase',
        method: 'DELETE',
        path: `/cases/${unbound.data.id}`,
        target: `CaseRecord:${unbound.data.id}`,
      },
      {
        operationId: 'ArchiveCase',
        method: 'POST',
        path: `/cases/${created.data.id}/archive`,
        body: { reason: 'x' },
        target: `CaseRecord:${created.data.id}`,
      },
      {
        operationId: 'RestoreCase',
        method: 'POST',
        path: `/cases/${archivedCase.data.id}/restore`,
        body: { reason: 'x' },
        target: `CaseRecord:${archivedCase.data.id}`,
      },
      {
        operationId: 'WorkflowCase',
        method: 'POST',
        path: `/cases/${created.data.id}/workflow`,
        body: { state: 'PREPARING', reason: 'x' },
        target: `CaseRecord:${created.data.id}`,
      },
      {
        operationId: 'RouteBindingCase',
        method: 'POST',
        path: `/cases/${unbound.data.id}/route-binding`,
        body: { routeId: w.route.data.id, reason: 'x' },
        target: `CaseRecord:${unbound.data.id}`,
      },
      {
        operationId: 'CanonicalBindingCase',
        method: 'POST',
        path: `/cases/${created.data.id}/canonical-binding`,
        body: { canonicalCode: 'SYN-PRE', sourceId: w.source.id, reason: 'x' },
        target: `CaseRecord:${created.data.id}`,
      },
      {
        operationId: 'linkCaseSource',
        method: 'POST',
        path: `/cases/${created.data.id}/sources`,
        body: { ...LINK, sourceId: extra.id },
        target: `CaseRecord:${created.data.id}`,
      },
      {
        operationId: 'setCaseSourceLinkState',
        method: 'POST',
        path: `/case-sources/${linked.data.id}/link-state`,
        body: { state: 'PAUSED', reason: 'x' },
        target: `CaseSource:${linked.data.id}`,
      },
      {
        operationId: 'selectCaseAuthority',
        method: 'POST',
        path: `/cases/${created.data.id}/authority-selections`,
        body: { ...SELECTION, ...choose(w, [a.coverage.data.id]) },
        target: `CaseRecord:${created.data.id}`,
      },
    ];
    return { w, a, created, spare, archivedCase, unbound, linked, writes };
  }

  it('the 10 conditional operations: 428 without If-Match, 412 for a stale, foreign or child ETag; 404 before 412; nothing is written', async () => {
    const { created, spare, archivedCase, unbound, linked, writes } = await conditionalWrites();
    const contracted = operations
      .filter(
        (operation) =>
          (P4A_OPERATIONS as readonly string[]).includes(operation.operationId) &&
          operation.preconditionTarget,
      )
      .map((operation) => operation.operationId)
      .sort();
    expect(writes.map((write) => write.operationId).sort()).toEqual(contracted);
    const snapshot = async () => ({
      cases: await Promise.all(
        [created, spare, archivedCase, unbound].map(
          async (row) => (await getCase(row.data.id)).data,
        ),
      ),
      link: (await getLink(linked.data.id)).data,
      counts: await Promise.all(
        ['cases', 'case_sources', 'case_authority_selections', 'case_authority_coverages'].map(
          (table) => countRows(prisma, table),
        ),
      ),
    });
    const before = await snapshot();
    for (const write of writes) {
      const noMatch = await client.write(write.operationId, write.method, write.path, write.body);
      expect(outcome(noMatch), write.operationId).toEqual([428, 'PRECONDITION_REQUIRED']);
      const [type, id] = write.target.split(':');
      const stale = await client.write(write.operationId, write.method, write.path, write.body, {
        ifMatch: `"${type}:${id}:v99"`,
      });
      expect(outcome(stale), write.operationId).toEqual([412, 'RECORD_VERSION_CONFLICT']);
      const foreign = await client.write(write.operationId, write.method, write.path, write.body, {
        ifMatch: `"CaseRecord:${spare.data.id}:v${spare.data.rowVersion}"`,
      });
      expect(outcome(foreign), write.operationId).toEqual([412, 'RECORD_VERSION_CONFLICT']);
    }
    // A link's state change needs the link's ETag, never its case's; a link needs the case's.
    const caseEtag = (await getCase(spare.data.id)).etag;
    expect(outcome(await setLinkState(linked.data.id, caseEtag, 'PAUSED'))).toEqual([
      412,
      'RECORD_VERSION_CONFLICT',
    ]);
    expect(
      outcome(
        await postLink(spare.data.id, linked.etag, {
          sourceId: linked.data.sourceId,
          useRole: 'OTHER',
        }),
      ),
    ).toEqual([412, 'RECORD_VERSION_CONFLICT']);
    // An unknown record is 404 whatever the ETag.
    const ghost = randomUUID();
    expect(outcome(await patchCase(ghost, `"CaseRecord:${ghost}:v1"`, { notes: 'x' }))).toEqual([
      404,
      'NOT_FOUND',
    ]);
    expect(outcome(await setLinkState(ghost, `"CaseSource:${ghost}:v1"`, 'PAUSED'))).toEqual([
      404,
      'NOT_FOUND',
    ]);
    expect(await snapshot()).toEqual(before);
    expect(
      await prisma.idempotencyRecord.count({
        where: { state: 'COMPLETED', responseStatus: { gte: 400 } },
      }),
    ).toBe(0);
  });

  it('Idempotency-Key for every P4A write family: required; an exact replay returns the stored result once; another payload is 409', async () => {
    const { w, a, case: created } = await caseWorld();
    const b = await authority(w, { label: 'second mandate' });
    const extra = await createSource({ agencyId: w.agency.data.id, title: 'SYNTHETIC extra' });
    const canonical = await createSource({
      agencyId: w.agency.data.id,
      title: 'SYNTHETIC canonical',
    });
    const creates: Array<{
      label: string;
      send: (key: string | null, variant?: boolean) => Promise<HttpResult>;
      table: string;
      action: string;
    }> = [
      {
        label: 'createCase',
        send: (key, variant) =>
          postCase(
            { agencyId: w.agency.data.id, intakeLabel: variant ? 'SYNTHETIC B' : 'SYNTHETIC A' },
            { key },
          ),
        table: 'cases',
        action: 'CASE_CREATED',
      },
      {
        label: 'linkCaseSource',
        send: (key, variant) =>
          postLink(
            created.data.id,
            created.etag,
            { sourceId: extra.id, useRole: variant ? 'B' : 'A' },
            { key },
          ),
        table: 'case_sources',
        action: 'CASE_SOURCE_LINKED',
      },
    ];
    for (const family of creates) {
      expect(outcome(await family.send(null)), family.label).toEqual([
        400,
        'IDEMPOTENCY_KEY_REQUIRED',
      ]);
      const key = newKey();
      const rowsBefore = await countRows(prisma, family.table);
      const first = await family.send(key);
      expect(first.status, `${family.label} ${first.text}`).toBe(201);
      const replay = await family.send(key);
      expect(replayView(replay), family.label).toEqual(replayView(first));
      expect(await countRows(prisma, family.table), family.label).toBe(rowsBefore + 1);
      const id = (first.json as { data: { id: string } }).data.id;
      expect(await auditCount(family.action, id), family.label).toBe(1);
      expect(outcome(await family.send(key, true)), family.label).toEqual([
        409,
        'IDEMPOTENCY_CONFLICT',
      ]);
    }
    // A selection replays with its pinned coverage rows: one selection, one set of pins.
    const current = await getCase(created.data.id);
    const selectKey = newKey();
    const selectBody = choose(w, [a.coverage.data.id]);
    expect(
      outcome(await postSelection(created.data.id, current.etag, selectBody, { key: null })),
    ).toEqual([400, 'IDEMPOTENCY_KEY_REQUIRED']);
    const selected = await postSelection(created.data.id, current.etag, selectBody, {
      key: selectKey,
    });
    expect(selected.status).toBe(201);
    const selectedReplay = await postSelection(created.data.id, current.etag, selectBody, {
      key: selectKey,
    });
    expect(replayView(selectedReplay)).toEqual(replayView(selected));
    expect(await countRows(prisma, 'case_authority_selections')).toBe(1);
    expect(await countRows(prisma, 'case_authority_coverages')).toBe(1);
    expect(
      outcome(
        await postSelection(created.data.id, current.etag, choose(w, [b.coverage.data.id]), {
          key: selectKey,
        }),
      ),
    ).toEqual([409, 'IDEMPOTENCY_CONFLICT']);
    // Commands on the case and on a link replay the same way.
    const commandFamilies: Array<{
      label: string;
      send: (etag: string, key: string, variant?: boolean) => Promise<HttpResult>;
      etag: () => Promise<string>;
      action: string;
    }> = [
      {
        label: 'patchCase',
        send: (etag, key, variant) =>
          patchCase(created.data.id, etag, { notes: variant ? 'B' : 'A' }, { key }),
        etag: async () => (await getCase(created.data.id)).etag,
        action: 'CASE_UPDATED',
      },
      {
        label: 'WorkflowCase',
        send: (etag, key, variant) =>
          setWorkflow(created.data.id, etag, variant ? 'DRAFTING' : 'PREPARING', { key }),
        etag: async () => (await getCase(created.data.id)).etag,
        action: 'CASE_WORKFLOW_CHANGED',
      },
      {
        label: 'CanonicalBindingCase',
        send: (etag, key, variant) =>
          bindCanonical(
            created.data.id,
            etag,
            { canonicalCode: variant ? 'SYN-IDEM-B' : 'SYN-IDEM-A', sourceId: canonical.id },
            { key },
          ),
        etag: async () => (await getCase(created.data.id)).etag,
        action: 'CASE_CANONICAL_BOUND',
      },
      {
        label: 'setCaseSourceLinkState',
        send: async (etag, key, variant) => {
          const [linkRow] = (
            await listOf<CaseSource>('listCaseSources', `/cases/${created.data.id}/sources`)
          ).items;
          return setLinkState(linkRow?.id ?? randomUUID(), etag, variant ? 'UNLINKED' : 'PAUSED', {
            key,
          });
        },
        etag: async () => {
          const [linkRow] = (
            await listOf<CaseSource>('listCaseSources', `/cases/${created.data.id}/sources`)
          ).items;
          return (await getLink(linkRow?.id ?? randomUUID())).etag;
        },
        action: 'CASE_SOURCE_LINK_STATE_CHANGED',
      },
      {
        label: 'ArchiveCase',
        send: (etag, key, variant) =>
          caseCommand(
            'ArchiveCase',
            created.data.id,
            etag,
            'archive',
            { reason: variant ? 'B' : 'A' },
            { key },
          ),
        etag: async () => (await getCase(created.data.id)).etag,
        action: 'CASE_ARCHIVED',
      },
      {
        label: 'RestoreCase',
        send: (etag, key, variant) =>
          caseCommand(
            'RestoreCase',
            created.data.id,
            etag,
            'restore',
            { reason: variant ? 'B' : 'A' },
            { key },
          ),
        etag: async () => (await getCase(created.data.id)).etag,
        action: 'CASE_RESTORED',
      },
    ];
    for (const family of commandFamilies) {
      const etag = await family.etag();
      const key = newKey();
      const first = await family.send(etag, key);
      expect(first.status, `${family.label} ${first.text}`).toBe(200);
      const actionsBefore = await auditCount(family.action);
      const replay = await family.send(etag, key);
      expect(replayView(replay), family.label).toEqual(replayView(first));
      expect(await auditCount(family.action), family.label).toBe(actionsBefore);
      expect(outcome(await family.send(etag, key, true)), family.label).toEqual([
        409,
        'IDEMPOTENCY_CONFLICT',
      ]);
    }
    // Route binding and deletion.
    const unbound = await createCase(w.agency.data.id, { intakeLabel: 'SYNTHETIC unbound' });
    const bindKey = newKey();
    const boundResult = await bindRoute(unbound.data.id, unbound.etag, w.route.data.id, {
      key: bindKey,
    });
    expect(boundResult.status).toBe(200);
    expect(
      replayView(await bindRoute(unbound.data.id, unbound.etag, w.route.data.id, { key: bindKey })),
    ).toEqual(replayView(boundResult));
    expect(await auditCount('CASE_ROUTE_BOUND', unbound.data.id)).toBe(1);
    const doomed = await createCase(w.agency.data.id, { intakeLabel: 'SYNTHETIC doomed' });
    const deleteKey = newKey();
    const removed = await deleteCase(doomed.data.id, doomed.etag, { key: deleteKey });
    const removedReplay = await deleteCase(doomed.data.id, doomed.etag, { key: deleteKey });
    expect([removed.status, removedReplay.status, removedReplay.text]).toEqual([204, 204, '']);
    expect(await auditCount('CASE_DELETED', doomed.data.id)).toBe(1);
  });

  it('in progress and failures: a running claim is 409 with Retry-After and writes nothing; a refused request is never stored', async () => {
    const { w, a, case: created } = await caseWorld();
    const key = newKey();
    const body = { agencyId: w.agency.data.id, intakeLabel: 'SYNTHETIC in flight' };
    const first = versioned<CaseRecord>(await postCase(body, { key }), 201);
    // Turn the completed record back into a fresh claim and undo its effect: a request in flight.
    const record = await prisma.idempotencyRecord.findFirstOrThrow({
      where: { idempotencyKey: key },
    });
    await prisma.caseRecord.delete({ where: { id: first.data.id } });
    await prisma.idempotencyRecord.update({
      where: { id: record.id },
      data: {
        state: 'IN_PROGRESS',
        responseStatus: null,
        responseJson: Prisma.DbNull,
        createdAt: new Date(t.clock.ms),
      },
    });
    const busy = await postCase(body, { key });
    expect([busy.status, code(busy), busy.headers['retry-after']]).toEqual([
      409,
      'IDEMPOTENCY_IN_PROGRESS',
      '1',
    ]);
    expect(await countRows(prisma, 'cases')).toBe(1);
    await prisma.idempotencyRecord.update({
      where: { id: record.id },
      data: { createdAt: new Date(t.clock.ms - 61_000) },
    });
    const resumed = versioned<CaseRecord>(await postCase(body, { key }), 201);
    expect(resumed.data.id).not.toBe(first.data.id);
    expect(await countRows(prisma, 'cases')).toBe(2);
    // A refusal releases its claim: once the cause is gone, the same key and body succeed.
    const signer = await getSigner(w.signer.data.id);
    const archived = versioned<Signer>(
      await command('archiveSigner', `/signers/${signer.data.id}/archive`, signer.etag),
      200,
    );
    const selectKey = newKey();
    const selectBody = choose(w, [a.coverage.data.id]);
    const refused = await postSelection(created.data.id, created.etag, selectBody, {
      key: selectKey,
    });
    expect(outcome(refused)).toEqual([409, 'RECORD_STATE_CONFLICT']);
    expect(await prisma.idempotencyRecord.count({ where: { idempotencyKey: selectKey } })).toBe(0);
    versioned(
      await command('restoreSigner', `/signers/${signer.data.id}/restore`, archived.etag),
      200,
    );
    immutable(
      await postSelection(created.data.id, created.etag, selectBody, { key: selectKey }),
      201,
    );
  });

  it('two tabs and concurrent writers: one ETag, one winner; the others are 412 and change nothing', async () => {
    const { w, a, case: created } = await caseWorld();
    const b = await authority(w, { label: 'second mandate' });
    // Two tabs editing the case.
    const tab1 = await getCase(created.data.id);
    const tab2 = await getCase(created.data.id);
    versioned(await patchCase(created.data.id, tab1.etag, { intakeLabel: 'SYNTHETIC tab 1' }), 200);
    expect(
      outcome(await patchCase(created.data.id, tab2.etag, { notes: 'SYNTHETIC tab 2' })),
    ).toEqual([412, 'RECORD_VERSION_CONFLICT']);
    expect(outcome(await postLink(created.data.id, tab2.etag, { sourceId: w.source.id }))).toEqual([
      412,
      'RECORD_VERSION_CONFLICT',
    ]);
    expect((await getCase(created.data.id)).data).toMatchObject({
      intakeLabel: 'SYNTHETIC tab 1',
      notes: null,
    });
    // Concurrent selections with one ETag: exactly one selection and one audit event.
    const etag = (await getCase(created.data.id)).etag;
    const results = await Promise.all([
      postSelection(created.data.id, etag, choose(w, [a.coverage.data.id])),
      postSelection(created.data.id, etag, choose(w, [b.coverage.data.id])),
      postSelection(created.data.id, etag, choose(w, [a.coverage.data.id, b.coverage.data.id])),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 412, 412]);
    expect(await countRows(prisma, 'case_authority_selections')).toBe(1);
    expect(await auditCount('CASE_AUTHORITY_SELECTED')).toBe(1);
    const winner = dataOf<CaseAuthoritySelection>(
      results.find((result) => result.status === 201) as HttpResult,
    );
    expect((await getCase(created.data.id)).data.currentAuthoritySelectionId).toBe(winner.id);
    // Concurrent route bindings of one unbound case: one binding.
    const second = await anotherRoute(w.agency.data.id, 'Second');
    const unbound = await createCase(w.agency.data.id);
    const bindings = await Promise.all([
      bindRoute(unbound.data.id, unbound.etag, w.route.data.id),
      bindRoute(unbound.data.id, unbound.etag, second.route.data.id),
    ]);
    expect(bindings.map((result) => result.status).sort()).toEqual([200, 412]);
    expect(await auditCount('CASE_ROUTE_BOUND', unbound.data.id)).toBe(1);
    // Concurrent link-state changes with one link ETag: one change.
    const linked = await linkSource(unbound.data.id, w.source.id);
    const states = await Promise.all([
      setLinkState(linked.data.id, linked.etag, 'PAUSED'),
      setLinkState(linked.data.id, linked.etag, 'UNLINKED'),
    ]);
    expect(states.map((result) => result.status).sort()).toEqual([200, 412]);
    expect((await getLink(linked.data.id)).data.rowVersion).toBe(2);
    // Concurrent canonical bindings of one code on two cases: one holder.
    const c1 = await createCase(w.agency.data.id);
    const c2 = await createCase(w.agency.data.id);
    const codes = await Promise.all([
      bindCanonical(c1.data.id, c1.etag, { canonicalCode: 'SYN-RACE', sourceId: w.source.id }),
      bindCanonical(c2.data.id, c2.etag, { canonicalCode: 'SYN-RACE', sourceId: w.source.id }),
    ]);
    expect(codes.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(code(codes.find((result) => result.status === 409) as HttpResult)).toBe(
      'DUPLICATE_CANONICAL_CODE',
    );
    expect(await prisma.caseRecord.count({ where: { canonicalCaseId: 'SYN-RACE' } })).toBe(1);
  });

  it('a failing audit insert rolls back every P4A write: no row, no version change, no idempotency record', async () => {
    const { w, a, case: created } = await caseWorld();
    const linked = await linkSource(created.data.id, w.source.id);
    const extra = await createSource({ agencyId: w.agency.data.id, title: 'SYNTHETIC extra' });
    const archivedCase = await createCase(w.agency.data.id);
    versioned(await archiveCase(archivedCase.data.id, archivedCase.etag), 200);
    const unbound = await createCase(w.agency.data.id);
    const current = await getCase(created.data.id);
    const link = await getLink(linked.data.id);
    const archivedNow = await getCase(archivedCase.data.id);
    const snapshot = async () => ({
      cases: await Promise.all(
        [created, archivedCase, unbound].map(async (row) => (await getCase(row.data.id)).data),
      ),
      link: (await getLink(linked.data.id)).data,
      counts: await Promise.all(
        ['cases', 'case_sources', 'case_authority_selections', 'case_authority_coverages'].map(
          (table) => countRows(prisma, table),
        ),
      ),
    });
    const before = await snapshot();
    const idempotencyBefore = await prisma.idempotencyRecord.count();
    const attempts: Array<[string, () => Promise<HttpResult>]> = [
      ['createCase', () => postCase({ agencyId: w.agency.data.id })],
      ['patchCase', () => patchCase(created.data.id, current.etag, { notes: 'x' })],
      ['deleteUnusedCase', () => deleteCase(unbound.data.id, unbound.etag)],
      ['ArchiveCase', () => archiveCase(created.data.id, current.etag)],
      ['RestoreCase', () => restoreCase(archivedCase.data.id, archivedNow.etag)],
      ['WorkflowCase', () => setWorkflow(created.data.id, current.etag, 'PREPARING')],
      ['RouteBindingCase', () => bindRoute(unbound.data.id, unbound.etag, w.route.data.id)],
      [
        'CanonicalBindingCase',
        () =>
          bindCanonical(created.data.id, current.etag, {
            canonicalCode: 'SYN-ROLLBACK',
            sourceId: w.source.id,
          }),
      ],
      ['linkCaseSource', () => postLink(created.data.id, current.etag, { sourceId: extra.id })],
      ['setCaseSourceLinkState', () => setLinkState(link.data.id, link.etag, 'PAUSED')],
      [
        'selectCaseAuthority',
        () => postSelection(created.data.id, current.etag, choose(w, [a.coverage.data.id])),
      ],
    ];
    auditWriter.armed = true;
    for (const [label, run] of attempts) {
      expect(outcome(await run()), label).toEqual([500, 'INTERNAL_ERROR']);
    }
    auditWriter.armed = false;
    expect(auditWriter.failures).toBe(attempts.length);
    expect(await snapshot()).toEqual(before);
    expect(await prisma.idempotencyRecord.count()).toBe(idempotencyBefore);
  });
});

// ---------------------------------------------------------------------------------------------

describe('SECURITY / CONTRACT', () => {
  it('no session, a bad CSRF token or a wrong Origin stops every kind of P4A write before any mutation', async () => {
    const { w, a, case: created } = await caseWorld();
    const linked = await linkSource(created.data.id, w.source.id);
    const current = await getCase(created.data.id);
    const targets: Array<
      [string, 'POST' | 'PATCH' | 'DELETE', string, Record<string, unknown> | undefined, string]
    > = [
      ['createCase', 'POST', '/cases', { intakeLabel: 'x', agencyId: w.agency.data.id }, ''],
      ['patchCase', 'PATCH', `/cases/${created.data.id}`, { notes: 'x' }, current.etag],
      [
        'WorkflowCase',
        'POST',
        `/cases/${created.data.id}/workflow`,
        { state: 'CLOSED', reason: 'x' },
        current.etag,
      ],
      [
        'linkCaseSource',
        'POST',
        `/cases/${created.data.id}/sources`,
        { ...LINK, sourceId: w.source.id, useRole: 'Z' },
        current.etag,
      ],
      [
        'setCaseSourceLinkState',
        'POST',
        `/case-sources/${linked.data.id}/link-state`,
        { state: 'PAUSED', reason: 'x' },
        linked.etag,
      ],
      [
        'selectCaseAuthority',
        'POST',
        `/cases/${created.data.id}/authority-selections`,
        { ...SELECTION, ...choose(w, [a.coverage.data.id]) },
        current.etag,
      ],
      ['deleteUnusedCase', 'DELETE', `/cases/${created.data.id}`, undefined, current.etag],
    ];
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
    expect((await getCase(created.data.id)).data).toEqual(current.data);
    expect((await getLink(linked.data.id)).data).toEqual(linked.data);
    expect(await countRows(prisma, 'cases')).toBe(1);
    expect(await countRows(prisma, 'case_authority_selections')).toBe(0);
  });

  it('later case phases, readiness, signing and sending stay unrouted', async () => {
    const { case: created } = await caseWorld();
    const id = created.data.id;
    const paths: Array<['GET' | 'POST' | 'PATCH' | 'DELETE', string]> = [
      ['GET', `/cases/${id}/reported-items`],
      ['POST', `/cases/${id}/reported-items`],
      ['GET', `/cases/${id}/works`],
      ['POST', `/cases/${id}/works`],
      ['GET', `/cases/${id}/mappings`],
      ['POST', `/cases/${id}/facts`],
      ['GET', `/cases/${id}/facts`],
      ['POST', `/cases/${id}/correspondence-bindings`],
      ['GET', `/cases/${id}/production-context`],
      ['POST', `/cases/${id}/prompts`],
      ['POST', `/cases/${id}/candidates`],
      ['GET', `/candidates/${randomUUID()}/readiness`],
      ['POST', `/cases/${id}/readiness`],
      ['POST', `/cases/${id}/sign`],
      ['POST', `/cases/${id}/send`],
      ['POST', `/cases/${id}/g1`],
      ['GET', '/correspondence'],
    ];
    for (const [method, path] of paths) {
      const response = await unrouted(method, path);
      expect([response.status, code(response)], `${method} ${path}`).toEqual([404, 'NOT_FOUND']);
    }
    await expectNoLaterPhaseRecords();
  });

  it('every collected response matches its operation: declared status, contract schema, ETag rules, no readiness vocabulary; all 16 P4A operations and the v1.1.0 read were exercised', () => {
    const byId = new Map<string, (typeof operations)[number]>(
      operations.map((operation) => [operation.operationId, operation]),
    );
    const CASE_OPERATIONS: readonly string[] = [...P4A_OPERATIONS, ...R8_OPERATIONS];
    const contracted = operations
      .filter((operation) => CASE_OPERATIONS.includes(operation.operationId))
      .map((operation) => operation.operationId)
      .sort();
    expect(contracted).toEqual([...CASE_OPERATIONS].sort());
    const seen = new Set<string>();
    const forbiddenKey =
      /"(g[1-7]\w*|ready\w*|eligib\w*|authori[sz]ed\w*|currentAuthority|isCurrent\w*|approved\w*|verified\w*)"\s*:/i;
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
          // Lists, 204, SourceReferences and CaseAuthoritySelections (with their pinned rows)
          // carry no ETag.
          expect(result.headers['etag'], label).toBeUndefined();
        }
        if (CASE_OPERATIONS.includes(operationId)) {
          expect(result.text, label).not.toMatch(forbiddenKey);
        }
      } else {
        expect(operation.errors as readonly string[], label).toContain(String(result.status));
        expect(OperationErrorSchema.safeParse(result.json).success, label).toBe(true);
      }
      expect(result.headers['cache-control'], label).toBe('no-store');
    }
    expect(CASE_OPERATIONS.filter((operationId) => !seen.has(operationId))).toEqual([]);
  });
});
