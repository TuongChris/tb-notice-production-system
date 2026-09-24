// P3A — SourceReference registry, canonical bindings and Route, over real HTTP against
// tb_notice_test (yarn test:db).
//
// Each test boots the real AppModule + configureApp pipeline on an ephemeral loopback port with a
// synthetic signed-in application User, a controllable clock and an audit writer that can be made
// to fail. Every response is recorded and checked against the active contract at the end. All data
// is synthetic; every test deletes what it created. A SourceReference here is a synthetic pointer:
// it is not evidence, and nothing in this suite is real case, owner or authority data.
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Prisma, type PrismaClient } from '../../apps/api/generated/prisma/client.js';
import type {
  Agency,
  LegalSubject,
  Owner,
  OwnerSubject,
  Route,
  Signer,
  SourceReference,
  SourceReferenceSummary,
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

const code = (result: HttpResult) => errorOf(result).code;

function versioned<T>(result: HttpResult, status: number): Versioned<T> {
  expect(result.status, result.text).toBe(status);
  return { data: dataOf<T>(result), etag: etagOf(result) };
}

/** An immutable resource: no ETag. */
function immutable<T>(result: HttpResult, status: number): T {
  expect(result.status, result.text).toBe(status);
  expect(result.headers['etag']).toBeUndefined();
  return dataOf<T>(result);
}

const AUTHORITY_TABLES = [
  'mandates',
  'mandate_versions',
  'mandate_coverages',
  'coverage_signers',
  'authority_events',
  'case_authority_selections',
];

async function expectNoAuthority(): Promise<void> {
  for (const table of AUTHORITY_TABLES) expect(await countRows(prisma, table), table).toBe(0);
}

async function auditRows(entityId: string) {
  return prisma.auditEvent.findMany({
    where: { entityId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
}

const createAgency = async (body: Record<string, unknown> = {}) =>
  versioned<Agency>(
    await client.write('createAgency', 'POST', '/agencies', {
      displayName: 'SYNTHETIC Agency',
      ...body,
    }),
    201,
  );
const createOwner = async (body: Record<string, unknown> = {}) =>
  versioned<Owner>(
    await client.write('createOwner', 'POST', '/owners', {
      displayName: 'SYNTHETIC Owner',
      ...body,
    }),
    201,
  );
const createSubject = async (body: Record<string, unknown> = {}) =>
  versioned<LegalSubject>(
    await client.write('createLegalSubject', 'POST', '/legal-subjects', {
      subjectType: 'LEGAL_ENTITY',
      legalName: 'SYNTHETIC Subject LLC',
      ...body,
    }),
    201,
  );
const createSigner = async (agencyId: string, body: Record<string, unknown> = {}) =>
  versioned<Signer>(
    await client.write('createSigner', 'POST', '/signers', {
      agencyId,
      fullLegalName: 'SYNTHETIC Signer Person',
      ...body,
    }),
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

async function link(ownerId: string, legalSubjectId: string, body: Record<string, unknown> = {}) {
  const owner = await getOwner(ownerId);
  return versioned<OwnerSubject>(
    await client.write(
      'linkOwnerSubject',
      'POST',
      `/owners/${ownerId}/subjects`,
      { legalSubjectId, ...body },
      { ifMatch: owner.etag },
    ),
    201,
  );
}

const SOURCE_BASE = {
  title: 'SYNTHETIC canonical registry record (test only)',
  sourceRole: 'CANONICAL_RECORD',
  scopeText: 'Synthetic scope description',
};

const createSource = async (body: Record<string, unknown> = {}) =>
  immutable<SourceReference>(
    await client.write('createSource', 'POST', '/sources', { ...SOURCE_BASE, ...body }),
    201,
  );

const reviseSource = (id: string, body: Record<string, unknown>, key?: string) =>
  client.write(
    'reviseSource',
    'POST',
    `/sources/${id}/revisions`,
    { ...SOURCE_BASE, ...body },
    key === undefined ? {} : { key },
  );

/** Agency A, Owner X, LegalSubject L, the LINKED association X–L. */
async function graph(label = 'A') {
  const agency = await createAgency({ displayName: `SYNTHETIC Agency ${label}` });
  const owner = await createOwner({ displayName: `SYNTHETIC Brand ${label}` });
  const subject = await createSubject({ legalName: `SYNTHETIC Subject ${label} LLC` });
  const association = await link(owner.data.id, subject.data.id);
  return { agency, owner, subject, association };
}

const createRoute = async (body: Record<string, unknown>) =>
  versioned<Route>(await client.write('createRoute', 'POST', '/routes', body), 201);

const bind = (
  operationId: string,
  path: string,
  etag: string,
  body: Record<string, unknown>,
  key?: string,
) =>
  client.write(
    operationId,
    'POST',
    `${path}/canonical-bindings`,
    { reason: 'synthetic canonical code check', ...body },
    { ifMatch: etag, ...(key === undefined ? {} : { key }) },
  );

// ---------------------------------------------------------------------------------------------

describe('SOURCES — capture metadata, not evidence', () => {
  it('create: revision 1 of a new chain, exactly the supplied metadata, defaults, no ETag', async () => {
    const result = await client.write('createSource', 'POST', '/sources', {
      title: 'SYNTHETIC Drive document',
      sourceRole: 'OPERATOR_INPUT',
      scopeText: 'Synthetic: covers the whole document',
      canonicalUrl: 'https://drive.example.invalid/file/SYNTHETIC-1',
      providerFileId: 'SYNTHETIC-FILE-1',
    });
    const source = immutable<SourceReference>(result, 201);
    expect(source).toMatchObject({
      agencyId: null,
      revision: 1,
      supersedesSourceId: null,
      canonicalUrl: 'https://drive.example.invalid/file/SYNTHETIC-1',
      // Defaults of the schema; nothing is upgraded because a URL or file id is present.
      accessState: 'NOT_CHECKED',
      reportedProvenance: 'OPERATOR_REPORTED',
      // The app has no bytes: no hash is computed, least of all from the URL.
      contentSha256: null,
      hashTarget: null,
      reviewedByLabel: null,
      reviewedAt: null,
      createdById: client.session.userId,
    });
    expect(source.sourceGroupId).not.toBe(source.id);
    expect((result.json as { meta: unknown }).meta).toMatchObject({
      affectedResources: [{ type: 'SourceReference', id: source.id, rowVersion: null }],
    });
    // Capturing a source creates nothing else and changes nothing else.
    for (const table of ['agencies', 'owners', 'legal_subjects', 'signers', 'routes']) {
      expect(await countRows(prisma, table), table).toBe(0);
    }
    await expectNoAuthority();
  });

  it('audit records metadata only: scope text, excerpt and limitations are never copied', async () => {
    const source = await createSource({
      scopeText: 'SYNTHETIC-SCOPE-TEXT confidential passage',
      excerpt: 'SYNTHETIC-EXCERPT quoted words',
      limitations: 'SYNTHETIC-LIMITATION note',
      scopeBindings: { limitation: 'SYNTHETIC-SCOPE-LIMITATION text' },
    });
    const [event] = await auditRows(source.id);
    expect(event).toMatchObject({ action: 'SOURCE_CREATED', actorUserId: client.session.userId });
    expect(event?.afterRedacted).toMatchObject({
      title: SOURCE_BASE.title,
      scopeText: { redacted: true, codePoints: 41 },
      excerpt: { redacted: true, codePoints: 30 },
      limitations: { redacted: true, codePoints: 25 },
      scopeBindings: { limitation: { redacted: true, codePoints: 31 } },
      revision: 1,
    });
    const text = JSON.stringify(event);
    for (const secret of ['SYNTHETIC-SCOPE-TEXT', 'SYNTHETIC-EXCERPT', 'SYNTHETIC-LIMITATION']) {
      expect(text).not.toContain(secret);
    }
  });

  it('create refuses unknown fields, case scope, incomplete hashes and unattributed review', async () => {
    const cases: Array<[Record<string, unknown>, number, string, Record<string, unknown>?]> = [
      [{ fetchNow: true }, 422, 'VALIDATION_FAILED'],
      [{ canonicalUrl: 'ftp://example.invalid/x' }, 422, 'VALIDATION_FAILED'],
      [{ reportedProvenance: 'OPERATOR_CONFIRMED' }, 422, 'VALIDATION_FAILED'],
      [{ scopeText: '' }, 422, 'VALIDATION_FAILED'],
      [{ title: 'x'.repeat(501) }, 422, 'VALIDATION_FAILED'],
      [{ contentSha256: 'A'.repeat(64), hashTarget: 'RAW_FILE' }, 422, 'VALIDATION_FAILED'],
      [
        { scopeBindings: { caseIds: [randomUUID()] } },
        422,
        'CASE_SCOPE_UNAVAILABLE',
        { field: 'scopeBindings.caseIds' },
      ],
      [{ contentSha256: 'a'.repeat(64) }, 422, 'CONTENT_HASH_INCOMPLETE', { field: 'hashTarget' }],
      [{ hashTarget: 'RAW_FILE' }, 422, 'CONTENT_HASH_INCOMPLETE', { field: 'contentSha256' }],
      [
        { reportedProvenance: 'DOCUMENT_REVIEWED' },
        422,
        'REVIEW_UNATTRIBUTED',
        { field: 'reviewedByLabel' },
      ],
      [
        { reportedProvenance: 'DOCUMENT_REVIEWED', reviewedByLabel: '   ' },
        422,
        'REVIEW_UNATTRIBUTED',
      ],
      [{ agencyId: randomUUID() }, 422, 'REFERENCE_NOT_FOUND', { field: 'agencyId' }],
      [
        { scopeBindings: { legalSubjectIds: [randomUUID()] } },
        422,
        'REFERENCE_NOT_FOUND',
        { field: 'scopeBindings.legalSubjectIds.0' },
      ],
    ];
    for (const [body, status, errorCode, details] of cases) {
      const result = await client.write('createSource', 'POST', '/sources', {
        ...SOURCE_BASE,
        ...body,
      });
      expect([result.status, code(result)], JSON.stringify(body)).toEqual([status, errorCode]);
      if (details) expect(errorOf(result).details).toMatchObject(details);
    }
    expect(await countRows(prisma, 'source_references')).toBe(0);
    expect(await countRows(prisma, 'idempotency_records')).toBe(0);
  });

  it('an attributable review report and a supplied content hash are stored exactly as given', async () => {
    const source = await createSource({
      reportedProvenance: 'DOCUMENT_REVIEWED',
      reviewedByLabel: 'SYNTHETIC reviewer label',
      rawProvenance: 'OPERATOR_CONFIRMED',
      contentSha256: 'b'.repeat(64),
      hashTarget: 'RAW_FILE',
      accessState: 'ACCESSIBLE_AT_CHECK',
      observedAt: '2026-09-01T08:00:00+07:00',
    });
    expect(source).toMatchObject({
      reportedProvenance: 'DOCUMENT_REVIEWED',
      reviewedByLabel: 'SYNTHETIC reviewer label',
      // An unknown review time stays null: nothing is invented.
      reviewedAt: null,
      rawProvenance: 'OPERATOR_CONFIRMED',
      contentSha256: 'b'.repeat(64),
      hashTarget: 'RAW_FILE',
      accessState: 'ACCESSIBLE_AT_CHECK',
      observedAt: '2026-09-01T01:00:00.000Z',
    });
  });

  it('agency and scope records must exist, be unarchived, and an agency source stays with its agency', async () => {
    const agencyA = await createAgency({ displayName: 'SYNTHETIC Agency A' });
    const agencyB = await createAgency({ displayName: 'SYNTHETIC Agency B' });
    const cross = await client.write('createSource', 'POST', '/sources', {
      ...SOURCE_BASE,
      agencyId: agencyA.data.id,
      scopeBindings: { agencyIds: [agencyA.data.id, agencyB.data.id] },
    });
    expect(errorOf(cross)).toMatchObject({
      code: 'CROSS_AGENCY_REFERENCE',
      details: { field: 'scopeBindings.agencyIds.1' },
    });
    const archived = versioned<Agency>(
      await client.write(
        'archiveAgency',
        'POST',
        `/agencies/${agencyB.data.id}/archive`,
        { reason: 'synthetic archive' },
        { ifMatch: agencyB.etag },
      ),
      200,
    );
    for (const body of [
      { agencyId: archived.data.id },
      { scopeBindings: { agencyIds: [archived.data.id] } },
    ]) {
      const refused = await client.write('createSource', 'POST', '/sources', {
        ...SOURCE_BASE,
        ...body,
      });
      expect([refused.status, code(refused)], JSON.stringify(body)).toEqual([
        409,
        'RECORD_STATE_CONFLICT',
      ]);
    }
    // An agency's own source may name that agency; a shared source may name several agencies.
    await createSource({
      agencyId: agencyA.data.id,
      scopeBindings: { agencyIds: [agencyA.data.id] },
    });
    await createSource({ scopeBindings: { agencyIds: [agencyA.data.id] } });
    expect(await countRows(prisma, 'source_references')).toBe(2);
  });

  it('get returns any revision in full, without ETag; unknown ids are 404', async () => {
    const source = await createSource({ excerpt: 'SYNTHETIC excerpt', excerptLocator: 'p. 1' });
    expect(await getSource(source.id)).toEqual(source);
    const missing = await client.get('getSource', `/sources/${randomUUID()}`);
    expect([missing.status, code(missing)]).toEqual([404, 'NOT_FOUND']);
  });
});

describe('SOURCE REVISIONS — append-only chains', () => {
  it('revise creates the next revision; the earlier revision is unchanged and stays readable', async () => {
    const first = await createSource({ providerRevisionId: 'SYN-REV-1' });
    const second = immutable<SourceReference>(
      await reviseSource(first.id, {
        providerRevisionId: 'SYN-REV-2',
        contentSha256: 'c'.repeat(64),
        hashTarget: 'EXTRACTED_TEXT',
        scopeText: 'Synthetic scope refined in revision 2',
      }),
      201,
    );
    expect(second).toMatchObject({
      sourceGroupId: first.sourceGroupId,
      revision: 2,
      supersedesSourceId: first.id,
      providerRevisionId: 'SYN-REV-2',
    });
    expect(second.id).not.toBe(first.id);
    expect(await getSource(first.id)).toEqual(first);
    const [event] = await auditRows(second.id);
    expect(event).toMatchObject({
      action: 'SOURCE_REVISED',
      beforeRedacted: { id: first.id, revision: 1 },
      afterRedacted: { revision: 2, supersedesSourceId: first.id },
    });
  });

  it('only the current head can be revised: an earlier revision is 409 REVISION_NOT_HEAD with the head id', async () => {
    const first = await createSource();
    const second = immutable<SourceReference>(await reviseSource(first.id, {}), 201);
    const stale = await reviseSource(first.id, { title: 'SYNTHETIC fork attempt' });
    expect([stale.status, errorOf(stale)]).toEqual([
      409,
      expect.objectContaining({ code: 'REVISION_NOT_HEAD', details: { headId: second.id } }),
    ]);
    const third = immutable<SourceReference>(await reviseSource(second.id, {}), 201);
    expect(third.revision).toBe(3);
    expect(await countRows(prisma, 'source_references')).toBe(3);
  });

  it('a revision keeps the agency and the scope bindings; a different scope needs a new source', async () => {
    const agency = await createAgency();
    const subject = await createSubject();
    const owned = await createSource({
      agencyId: agency.data.id,
      scopeBindings: { legalSubjectIds: [subject.data.id], limitation: 'SYNTHETIC limit' },
    });
    for (const [body, fields] of [
      [
        { scopeBindings: { legalSubjectIds: [subject.data.id], limitation: 'SYNTHETIC limit' } },
        ['agencyId'],
      ],
      [{ agencyId: agency.data.id, scopeBindings: null }, ['scopeBindings']],
      [
        {
          agencyId: agency.data.id,
          scopeBindings: { legalSubjectIds: [subject.data.id], limitation: 'SYNTHETIC wider' },
        },
        ['scopeBindings'],
      ],
    ] as const) {
      const refused = await reviseSource(owned.id, body);
      expect(errorOf(refused), JSON.stringify(body)).toMatchObject({
        code: 'REVISION_SCOPE_CHANGE',
        details: { fields },
      });
    }
    // The same scope (ids compared as a set) is accepted.
    const kept = immutable<SourceReference>(
      await reviseSource(owned.id, {
        agencyId: agency.data.id,
        scopeBindings: { limitation: 'SYNTHETIC limit', legalSubjectIds: [subject.data.id] },
      }),
      201,
    );
    expect(kept).toMatchObject({ agencyId: agency.data.id, revision: 2 });
  });

  it('a source of an archived agency is not revised; unknown ids are 404', async () => {
    const agency = await createAgency();
    const source = await createSource({ agencyId: agency.data.id });
    versioned(
      await client.write(
        'archiveAgency',
        'POST',
        `/agencies/${agency.data.id}/archive`,
        { reason: 'synthetic' },
        { ifMatch: agency.etag },
      ),
      200,
    );
    const refused = await reviseSource(source.id, { agencyId: agency.data.id });
    expect([refused.status, code(refused)]).toEqual([409, 'RECORD_STATE_CONFLICT']);
    const missing = await reviseSource(randomUUID(), {});
    expect([missing.status, code(missing)]).toEqual([404, 'NOT_FOUND']);
  });

  it('two concurrent revisions of one head: exactly one is accepted', async () => {
    const head = await createSource();
    const results = await Promise.all([
      reviseSource(head.id, { title: 'SYNTHETIC concurrent A' }),
      reviseSource(head.id, { title: 'SYNTHETIC concurrent B' }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    const refused = results.find((result) => result.status === 409);
    expect(refused && code(refused)).toBe('REVISION_NOT_HEAD');
    expect(await countRows(prisma, 'source_references')).toBe(2);
  });

  it('revise idempotency: an exact replay returns the same revision; another payload is 409; a refusal keeps the key usable', async () => {
    const head = await createSource();
    const key = newKey();
    const first = immutable<SourceReference>(
      await reviseSource(head.id, { title: 'R2' }, key),
      201,
    );
    const replay = immutable<SourceReference>(
      await reviseSource(head.id, { title: 'R2' }, key),
      201,
    );
    expect(replay).toEqual(first);
    expect(await countRows(prisma, 'source_references')).toBe(2);
    expect((await auditRows(first.id)).length).toBe(1);
    const conflict = await reviseSource(head.id, { title: 'R2 changed' }, key);
    expect([conflict.status, code(conflict)]).toEqual([409, 'IDEMPOTENCY_CONFLICT']);
    // A refused request (stale head) is not stored as a result: the same key works on the head.
    const staleKey = newKey();
    expect((await reviseSource(head.id, { title: 'R3' }, staleKey)).status).toBe(409);
    expect((await reviseSource(first.id, { title: 'R3' }, staleKey)).status).toBe(201);
  });

  it('in progress: a running claim is 409 IDEMPOTENCY_IN_PROGRESS for create and bind and writes nothing; an abandoned claim runs once', async () => {
    // A first request whose claim is committed but not completed: run it, undo its effect and turn
    // its record back into a fresh IN_PROGRESS claim.
    const inFlight = async (key: string, undo: () => Promise<unknown>) => {
      const record = await prisma.idempotencyRecord.findFirstOrThrow({
        where: { idempotencyKey: key },
      });
      await undo();
      await prisma.idempotencyRecord.update({
        where: { id: record.id },
        data: {
          state: 'IN_PROGRESS',
          responseStatus: null,
          responseJson: Prisma.DbNull,
          createdAt: new Date(t.clock.ms),
        },
      });
      return record.id;
    };
    const body = { ...SOURCE_BASE, title: 'SYNTHETIC in-flight source' };
    const sourceKey = newKey();
    const first = immutable<SourceReference>(
      await client.write('createSource', 'POST', '/sources', body, { key: sourceKey }),
      201,
    );
    const claim = await inFlight(sourceKey, () =>
      prisma.sourceReference.delete({ where: { id: first.id } }),
    );
    const busy = await client.write('createSource', 'POST', '/sources', body, { key: sourceKey });
    expect([busy.status, code(busy), busy.headers['retry-after']]).toEqual([
      409,
      'IDEMPOTENCY_IN_PROGRESS',
      '1',
    ]);
    expect(await countRows(prisma, 'source_references')).toBe(0);
    // 61 s later the claim counts as abandoned: the same intent executes exactly once.
    await prisma.idempotencyRecord.update({
      where: { id: claim },
      data: { createdAt: new Date(t.clock.ms - 61_000) },
    });
    const resumed = immutable<SourceReference>(
      await client.write('createSource', 'POST', '/sources', body, { key: sourceKey }),
      201,
    );
    expect(resumed.id).not.toBe(first.id);
    expect(await countRows(prisma, 'source_references')).toBe(1);

    const agency = await createAgency();
    const source = await createSource({ agencyId: agency.data.id });
    const bindKey = newKey();
    const bindBody = { canonicalCode: 'SYN-IN-FLIGHT', sourceId: source.id };
    const path = `/agencies/${agency.data.id}`;
    versioned<Agency>(await bind('bindCanonicalAgency', path, agency.etag, bindBody, bindKey), 200);
    await inFlight(bindKey, () =>
      prisma.agency.update({
        where: { id: agency.data.id },
        data: {
          canonicalCode: null,
          canonicalSourceId: null,
          bindingState: 'LOCAL_ONLY',
          rowVersion: 1,
        },
      }),
    );
    const busyBind = await bind('bindCanonicalAgency', path, agency.etag, bindBody, bindKey);
    expect([busyBind.status, code(busyBind)]).toEqual([409, 'IDEMPOTENCY_IN_PROGRESS']);
    expect((await getAgency(agency.data.id)).data).toMatchObject({
      canonicalCode: null,
      canonicalSourceId: null,
      bindingState: 'LOCAL_ONLY',
      rowVersion: 1,
    });
  });

  it('a failing audit insert rolls back create and revise: no row, no event, no idempotency record', async () => {
    const head = await createSource();
    auditWriter.armed = true;
    const create = await client.write('createSource', 'POST', '/sources', SOURCE_BASE);
    const revise = await reviseSource(head.id, {});
    auditWriter.armed = false;
    expect([create.status, revise.status]).toEqual([500, 500]);
    expect(await countRows(prisma, 'source_references')).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: 'SOURCE_CREATED' } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: 'SOURCE_REVISED' } })).toBe(0);
    expect(await prisma.idempotencyRecord.count({ where: { operationId: 'reviseSource' } })).toBe(
      0,
    );
    // Only the head's own successful create left an idempotency record.
    expect(await prisma.idempotencyRecord.count({ where: { operationId: 'createSource' } })).toBe(
      1,
    );
  });
});

describe('SOURCE LIST — current heads, summaries, scoped filters, signed cursors', () => {
  it('lists current revisions as summaries; `q` finds title words accent-insensitively or a chain by id', async () => {
    const first = await createSource({ title: 'SYNTHETIC Hợp tác đầu tiên' });
    const second = immutable<SourceReference>(
      await reviseSource(first.id, { title: 'SYNTHETIC Hợp tác đầu tiên (rev 2)' }),
      201,
    );
    await createSource({ title: 'SYNTHETIC unrelated record' });
    const all = immutable<{ items: SourceReferenceSummary[] }>(
      await client.get('listSources', '/sources'),
      200,
    );
    expect(all.items.map((item) => item.id)).not.toContain(first.id);
    expect(all.items.map((item) => item.id)).toContain(second.id);
    expect(Object.keys(all.items[0] ?? {})).not.toContain('scopeText');
    expect(Object.keys(all.items[0] ?? {})).not.toContain('excerpt');
    const byWord = immutable<{ items: SourceReferenceSummary[] }>(
      await client.get('listSources', `/sources?q=${encodeURIComponent('HOP TAC')}`),
      200,
    );
    expect(byWord.items.map((item) => item.id)).toEqual([second.id]);
    const byChain = immutable<{ items: SourceReferenceSummary[] }>(
      await client.get('listSources', `/sources?q=${first.sourceGroupId}`),
      200,
    );
    expect(byChain.items.map((item) => item.id)).toEqual([second.id]);
  });

  it('`agencyId` lists that agency’s sources and sources explicitly shared with it — never another agency’s', async () => {
    const agencyA = await createAgency({ displayName: 'SYNTHETIC Agency A' });
    const agencyB = await createAgency({ displayName: 'SYNTHETIC Agency B' });
    const ownA = await createSource({ agencyId: agencyA.data.id, title: 'SYNTHETIC own A' });
    const sharedA = await createSource({
      scopeBindings: { agencyIds: [agencyA.data.id] },
      title: 'SYNTHETIC shared with A',
    });
    await createSource({ agencyId: agencyB.data.id, title: 'SYNTHETIC own B' });
    await createSource({ title: 'SYNTHETIC public' });
    const listed = immutable<{ items: SourceReferenceSummary[] }>(
      await client.get('listSources', `/sources?agencyId=${agencyA.data.id}`),
      200,
    );
    expect(listed.items.map((item) => item.id).sort()).toEqual([ownA.id, sharedA.id].sort());
  });

  it('cursor pages cover every head once; tampered or re-filtered cursors are 400', async () => {
    const ids: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      ids.push((await createSource({ title: `SYNTHETIC page source ${index}` })).id);
    }
    const seen: string[] = [];
    let cursor: string | null = null;
    let lastCursor = '';
    do {
      const path: string =
        cursor === null
          ? '/sources?limit=2'
          : `/sources?limit=2&cursor=${encodeURIComponent(cursor)}`;
      const page = immutable<{ items: SourceReferenceSummary[]; nextCursor: string | null }>(
        await client.get('listSources', path),
        200,
      );
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
      if (cursor !== null) lastCursor = cursor;
    } while (cursor !== null);
    expect(seen).toHaveLength(5);
    expect(new Set(seen)).toEqual(new Set(ids));
    const tampered = await client.get(
      'listSources',
      `/sources?cursor=${encodeURIComponent(`${lastCursor.slice(0, -2)}xx`)}`,
    );
    expect([tampered.status, code(tampered)]).toEqual([400, 'INVALID_CURSOR']);
    const refiltered = await client.get(
      'listSources',
      `/sources?q=page&cursor=${encodeURIComponent(lastCursor)}`,
    );
    expect([refiltered.status, code(refiltered)]).toEqual([400, 'INVALID_CURSOR']);
  });
});

// ---------------------------------------------------------------------------------------------

type BindTarget = {
  readonly label: string;
  readonly operationId: string;
  readonly entityType: string;
  readonly path: string;
  readonly etag: () => Promise<string>;
  readonly read: () => Promise<Record<string, unknown>>;
  /** A source that applies to this target. */
  readonly applicable: () => Promise<SourceReference>;
  /** Sources that do not apply, with the expected error code and reason. */
  readonly inapplicable: () => Promise<Array<[SourceReference, string, string | undefined]>>;
  readonly auditAction: string;
};

async function bindTargets(): Promise<BindTarget[]> {
  const { agency, owner, subject, association } = await graph('Bind');
  const other = await createAgency({ displayName: 'SYNTHETIC Agency Other' });
  const signer = await createSigner(agency.data.id);
  const route = await createRoute({
    agencyId: agency.data.id,
    ownerSubjectId: association.data.id,
  });
  const otherAgencySource = () => createSource({ agencyId: other.data.id });
  const agencyTargets = (entity: {
    label: string;
    operationId: string;
    entityType: string;
    path: string;
    etag: () => Promise<string>;
    read: () => Promise<Record<string, unknown>>;
    auditAction: string;
  }): BindTarget => ({
    ...entity,
    applicable: () => createSource({ agencyId: agency.data.id }),
    inapplicable: async () => [
      [await otherAgencySource(), 'CROSS_AGENCY_REFERENCE', undefined],
      [await createSource(), 'SOURCE_SCOPE_UNRESOLVED', 'NOT_SCOPED_TO_AGENCY'],
      [
        await createSource({ scopeBindings: { agencyIds: [other.data.id] } }),
        'SOURCE_SCOPE_UNRESOLVED',
        'NOT_SCOPED_TO_AGENCY',
      ],
    ],
  });
  return [
    agencyTargets({
      label: 'Agency',
      operationId: 'bindCanonicalAgency',
      entityType: 'Agency',
      path: `/agencies/${agency.data.id}`,
      etag: async () => (await getAgency(agency.data.id)).etag,
      read: async () => (await getAgency(agency.data.id)).data,
      auditAction: 'AGENCY_CANONICAL_BOUND',
    }),
    agencyTargets({
      label: 'Signer',
      operationId: 'bindCanonicalSigner',
      entityType: 'Signer',
      path: `/signers/${signer.data.id}`,
      etag: async () => (await getSigner(signer.data.id)).etag,
      read: async () => (await getSigner(signer.data.id)).data,
      auditAction: 'SIGNER_CANONICAL_BOUND',
    }),
    {
      label: 'LegalSubject',
      operationId: 'bindCanonicalLegalSubject',
      entityType: 'LegalSubject',
      path: `/legal-subjects/${subject.data.id}`,
      etag: async () => (await getSubject(subject.data.id)).etag,
      read: async () => (await getSubject(subject.data.id)).data,
      applicable: () => createSource({ scopeBindings: { legalSubjectIds: [subject.data.id] } }),
      inapplicable: async () => [
        [await createSource(), 'SOURCE_SCOPE_UNRESOLVED', 'NOT_SCOPED_TO_SUBJECT'],
        [
          await createSource({
            agencyId: agency.data.id,
            scopeBindings: { legalSubjectIds: [subject.data.id] },
          }),
          'SOURCE_SCOPE_UNRESOLVED',
          'AGENCY_OWNED_SOURCE',
        ],
        [
          await createSource({
            scopeBindings: {
              legalSubjectIds: [subject.data.id],
              agencyIds: [agency.data.id],
            },
          }),
          'SOURCE_SCOPE_UNRESOLVED',
          'AGENCY_RESTRICTED_SOURCE',
        ],
      ],
      auditAction: 'LEGAL_SUBJECT_CANONICAL_BOUND',
    },
    {
      label: 'Owner',
      operationId: 'bindCanonicalOwner',
      entityType: 'Owner',
      path: `/owners/${owner.data.id}`,
      etag: async () => (await getOwner(owner.data.id)).etag,
      read: async () => (await getOwner(owner.data.id)).data,
      applicable: () => createSource(),
      inapplicable: async () => [
        [
          await createSource({ agencyId: agency.data.id }),
          'SOURCE_SCOPE_UNRESOLVED',
          'AGENCY_OWNED_SOURCE',
        ],
        [
          await createSource({ scopeBindings: { legalSubjectIds: [subject.data.id] } }),
          'SOURCE_SCOPE_UNRESOLVED',
          'SUBJECT_SPECIFIC_SOURCE',
        ],
      ],
      auditAction: 'OWNER_CANONICAL_BOUND',
    },
    {
      label: 'Route',
      operationId: 'bindCanonicalRoute',
      entityType: 'Route',
      path: `/routes/${route.data.id}`,
      etag: async () => (await getRoute(route.data.id)).etag,
      read: async () => (await getRoute(route.data.id)).data,
      applicable: () =>
        createSource({
          agencyId: agency.data.id,
          scopeBindings: { legalSubjectIds: [subject.data.id] },
        }),
      inapplicable: async () => [
        [await otherAgencySource(), 'CROSS_AGENCY_REFERENCE', undefined],
        [
          await createSource({
            agencyId: agency.data.id,
            scopeBindings: { legalSubjectIds: [(await createSubject()).data.id] },
          }),
          'SOURCE_SCOPE_UNRESOLVED',
          'SCOPED_TO_OTHER_SUBJECT',
        ],
      ],
      auditAction: 'ROUTE_CANONICAL_BOUND',
    },
  ];
}

describe('CANONICAL BINDINGS — identity/reference only', () => {
  it('each of the five targets binds its applicable current canonical source exactly; nothing else changes', async () => {
    for (const target of await bindTargets()) {
      const before = await target.read();
      const source = await target.applicable();
      const code = `SYN-${target.label.toUpperCase()}-001`;
      const result = await bind(target.operationId, target.path, await target.etag(), {
        canonicalCode: code,
        sourceId: source.id,
      });
      const bound = versioned<Record<string, unknown>>(result, 200);
      expect(bound.data, target.label).toMatchObject({
        canonicalCode: code,
        canonicalSourceId: source.id,
        bindingState: 'SOURCE_REFERENCED',
        rowVersion: (before['rowVersion'] as number) + 1,
      });
      // Administrative state, link state and operational state are untouched.
      for (const field of ['recordState', 'linkState', 'operationalState', 'archivedAt']) {
        expect(bound.data[field], `${target.label}.${field}`).toEqual(before[field]);
      }
      expect(bound.etag).toBe(
        `"${target.entityType}:${String(before['id'])}:v${String(bound.data['rowVersion'])}"`,
      );
      const events = await auditRows(String(before['id']));
      expect(events.at(-1), target.label).toMatchObject({
        action: target.auditAction,
        reason: 'synthetic canonical code check',
        sourceIds: [source.id],
        beforeRedacted: { canonicalCode: null, bindingState: 'LOCAL_ONLY' },
        afterRedacted: { canonicalCode: code, bindingState: 'SOURCE_REFERENCED' },
      });
      // The source is unchanged: binding records a reference, it does not review the source.
      expect(await getSource(source.id)).toEqual(source);
    }
    await expectNoAuthority();
    expect(await countRows(prisma, 'cases')).toBe(0);
  });

  it('inapplicable sources are refused per target, and an unknown source is 422', async () => {
    for (const target of await bindTargets()) {
      for (const [source, errorCode, reason] of await target.inapplicable()) {
        const refused = await bind(target.operationId, target.path, await target.etag(), {
          canonicalCode: 'SYN-REFUSED',
          sourceId: source.id,
        });
        expect([refused.status, code(refused)], `${target.label} ${reason ?? errorCode}`).toEqual([
          422,
          errorCode,
        ]);
        if (reason) expect(errorOf(refused).details['reason']).toBe(reason);
      }
      const unknown = await bind(target.operationId, target.path, await target.etag(), {
        canonicalCode: 'SYN-REFUSED',
        sourceId: randomUUID(),
      });
      expect([unknown.status, errorOf(unknown)], target.label).toEqual([
        422,
        expect.objectContaining({ code: 'REFERENCE_NOT_FOUND', details: { field: 'sourceId' } }),
      ]);
      expect(await target.read(), target.label).toMatchObject({
        canonicalCode: null,
        canonicalSourceId: null,
        bindingState: 'LOCAL_ONLY',
      });
    }
  });

  it('only the current revision, with the CANONICAL_RECORD role, can be bound', async () => {
    const agency = await createAgency();
    const first = await createSource({ agencyId: agency.data.id });
    const second = immutable<SourceReference>(
      await reviseSource(first.id, { agencyId: agency.data.id }),
      201,
    );
    const superseded = await bind(
      'bindCanonicalAgency',
      `/agencies/${agency.data.id}`,
      agency.etag,
      {
        canonicalCode: 'SYN-A-1',
        sourceId: first.id,
      },
    );
    expect([superseded.status, errorOf(superseded)]).toEqual([
      409,
      expect.objectContaining({
        code: 'SOURCE_NOT_CURRENT',
        details: { field: 'sourceId', currentSourceId: second.id },
      }),
    ]);
    const input = await createSource({ agencyId: agency.data.id, sourceRole: 'OPERATOR_INPUT' });
    const wrongRole = await bind(
      'bindCanonicalAgency',
      `/agencies/${agency.data.id}`,
      agency.etag,
      {
        canonicalCode: 'SYN-A-1',
        sourceId: input.id,
      },
    );
    expect([wrongRole.status, errorOf(wrongRole)]).toEqual([
      422,
      expect.objectContaining({
        code: 'SOURCE_ROLE_NOT_VERIFICATION',
        details: { field: 'sourceId', sourceRole: 'OPERATOR_INPUT' },
      }),
    ]);
    versioned(
      await bind('bindCanonicalAgency', `/agencies/${agency.data.id}`, agency.etag, {
        canonicalCode: 'SYN-A-1',
        sourceId: second.id,
      }),
      200,
    );
  });

  it('a binding is never replaced by another binding; codes are unique per kind; archived records are read-only', async () => {
    const agencyA = await createAgency({ displayName: 'SYNTHETIC Agency A' });
    const agencyB = await createAgency({ displayName: 'SYNTHETIC Agency B' });
    const sourceA = await createSource({ agencyId: agencyA.data.id });
    const boundA = versioned<Agency>(
      await bind('bindCanonicalAgency', `/agencies/${agencyA.data.id}`, agencyA.etag, {
        canonicalCode: 'SYN-CODE-1',
        sourceId: sourceA.id,
      }),
      200,
    );
    const again = await bind('bindCanonicalAgency', `/agencies/${agencyA.data.id}`, boundA.etag, {
      canonicalCode: 'SYN-CODE-2',
      sourceId: sourceA.id,
    });
    expect([again.status, errorOf(again)]).toEqual([
      409,
      expect.objectContaining({
        code: 'BINDING_CORRECTION_REQUIRES_RECONCILIATION',
        details: {
          canonicalCode: 'SYN-CODE-1',
          canonicalSourceId: sourceA.id,
          bindingState: 'SOURCE_REFERENCED',
        },
      }),
    ]);
    const sourceB = await createSource({ agencyId: agencyB.data.id });
    const duplicate = await bind(
      'bindCanonicalAgency',
      `/agencies/${agencyB.data.id}`,
      agencyB.etag,
      {
        canonicalCode: 'SYN-CODE-1',
        sourceId: sourceB.id,
      },
    );
    expect([duplicate.status, errorOf(duplicate)]).toEqual([
      409,
      expect.objectContaining({
        code: 'DUPLICATE_CANONICAL_CODE',
        details: { recordId: agencyA.data.id },
      }),
    ]);
    // Codes compare exactly (binary collation): a different case is a different code.
    versioned(
      await bind('bindCanonicalAgency', `/agencies/${agencyB.data.id}`, agencyB.etag, {
        canonicalCode: 'syn-code-1',
        sourceId: sourceB.id,
      }),
      200,
    );
    // The same code on another kind of record is independent.
    const owner = await createOwner();
    versioned(
      await bind('bindCanonicalOwner', `/owners/${owner.data.id}`, owner.etag, {
        canonicalCode: 'SYN-CODE-1',
        sourceId: (await createSource()).id,
      }),
      200,
    );
    const archivedAgency = await createAgency({ displayName: 'SYNTHETIC Archived' });
    // The source is captured while the agency is active; archiving then makes the agency read-only.
    const archivedSource = await createSource({ agencyId: archivedAgency.data.id });
    const archived = versioned<Agency>(
      await client.write(
        'archiveAgency',
        'POST',
        `/agencies/${archivedAgency.data.id}/archive`,
        { reason: 'synthetic' },
        { ifMatch: archivedAgency.etag },
      ),
      200,
    );
    const refused = await bind(
      'bindCanonicalAgency',
      `/agencies/${archivedAgency.data.id}`,
      archived.etag,
      { canonicalCode: 'SYN-ARCHIVED', sourceId: archivedSource.id },
    );
    expect([refused.status, code(refused)]).toEqual([409, 'RECORD_STATE_CONFLICT']);
  });

  it('If-Match and Idempotency-Key: 428, 412, 400, exact replay, payload conflict', async () => {
    const agency = await createAgency();
    const source = await createSource({ agencyId: agency.data.id });
    const body = { canonicalCode: 'SYN-IDEM-1', sourceId: source.id, reason: 'synthetic' };
    const path = `/agencies/${agency.data.id}/canonical-bindings`;
    const noMatch = await client.write('bindCanonicalAgency', 'POST', path, body);
    expect([noMatch.status, code(noMatch)]).toEqual([428, 'PRECONDITION_REQUIRED']);
    const stale = await client.write('bindCanonicalAgency', 'POST', path, body, {
      ifMatch: `"Agency:${agency.data.id}:v9"`,
    });
    expect([stale.status, code(stale)]).toEqual([412, 'RECORD_VERSION_CONFLICT']);
    const noKey = await client.write('bindCanonicalAgency', 'POST', path, body, {
      ifMatch: agency.etag,
      key: null,
    });
    expect([noKey.status, code(noKey)]).toEqual([400, 'IDEMPOTENCY_KEY_REQUIRED']);
    const key = newKey();
    const first = versioned<Agency>(
      await client.write('bindCanonicalAgency', 'POST', path, body, { ifMatch: agency.etag, key }),
      200,
    );
    // The replay returns the stored result even though the version has moved on.
    const replay = versioned<Agency>(
      await client.write('bindCanonicalAgency', 'POST', path, body, { ifMatch: agency.etag, key }),
      200,
    );
    expect(replay.data).toEqual(first.data);
    expect(replay.etag).toBe(first.etag);
    expect(
      (await auditRows(agency.data.id)).filter((e) => e.action === 'AGENCY_CANONICAL_BOUND'),
    ).toHaveLength(1);
    const conflict = await client.write(
      'bindCanonicalAgency',
      'POST',
      path,
      { ...body, canonicalCode: 'SYN-IDEM-2' },
      { ifMatch: agency.etag, key },
    );
    expect([conflict.status, code(conflict)]).toEqual([409, 'IDEMPOTENCY_CONFLICT']);
  });

  it('a failing audit insert rolls back a binding: no binding, no version change, no idempotency record', async () => {
    const agency = await createAgency();
    const source = await createSource({ agencyId: agency.data.id });
    auditWriter.armed = true;
    const failed = await bind('bindCanonicalAgency', `/agencies/${agency.data.id}`, agency.etag, {
      canonicalCode: 'SYN-ROLLBACK',
      sourceId: source.id,
    });
    auditWriter.armed = false;
    expect(failed.status).toBe(500);
    expect((await getAgency(agency.data.id)).data).toMatchObject({
      canonicalCode: null,
      canonicalSourceId: null,
      bindingState: 'LOCAL_ONLY',
      rowVersion: 1,
    });
    expect(
      await prisma.idempotencyRecord.count({ where: { operationId: 'bindCanonicalAgency' } }),
    ).toBe(0);
  });

  it('a binding establishes identity: Agency and LegalSubject identity and a Signer’s name lock; contact stays editable', async () => {
    const agency = await createAgency({ legalName: 'SYNTHETIC Bound Agency Ltd' });
    const subject = await createSubject();
    const signer = await createSigner(agency.data.id);
    const boundAgency = versioned<Agency>(
      await bind('bindCanonicalAgency', `/agencies/${agency.data.id}`, agency.etag, {
        canonicalCode: 'SYN-AG-LOCK',
        sourceId: (await createSource({ agencyId: agency.data.id })).id,
      }),
      200,
    );
    const boundSubject = versioned<LegalSubject>(
      await bind('bindCanonicalLegalSubject', `/legal-subjects/${subject.data.id}`, subject.etag, {
        canonicalCode: 'SYN-LS-LOCK',
        sourceId: (await createSource({ scopeBindings: { legalSubjectIds: [subject.data.id] } }))
          .id,
      }),
      200,
    );
    const boundSigner = versioned<Signer>(
      await bind('bindCanonicalSigner', `/signers/${signer.data.id}`, signer.etag, {
        canonicalCode: 'SYN-SG-LOCK',
        sourceId: (await createSource({ agencyId: agency.data.id })).id,
      }),
      200,
    );
    for (const [operationId, path, etag, change, fields] of [
      [
        'patchAgency',
        `/agencies/${agency.data.id}`,
        boundAgency.etag,
        { registrationNumber: 'X' },
        ['registrationNumber'],
      ],
      [
        'patchAgency',
        `/agencies/${agency.data.id}`,
        boundAgency.etag,
        { legalName: 'Other Ltd' },
        ['legalName'],
      ],
      [
        'patchLegalSubject',
        `/legal-subjects/${subject.data.id}`,
        boundSubject.etag,
        { legalForm: 'X' },
        ['legalForm'],
      ],
      [
        'patchSigner',
        `/signers/${signer.data.id}`,
        boundSigner.etag,
        { fullLegalName: 'Other Person' },
        ['fullLegalName'],
      ],
    ] as const) {
      const refused = await client.write(operationId, 'PATCH', path, change, { ifMatch: etag });
      expect(errorOf(refused), `${operationId} ${JSON.stringify(change)}`).toMatchObject({
        code: 'ESTABLISHED_IDENTITY_IMMUTABLE',
        details: { fields, establishedBy: expect.arrayContaining(['CANONICAL_BINDING']) },
      });
    }
    versioned(
      await client.write(
        'patchAgency',
        'PATCH',
        `/agencies/${agency.data.id}`,
        { phone: '+84 28 0000 0009' },
        { ifMatch: boundAgency.etag },
      ),
      200,
    );
    versioned(
      await client.write(
        'patchSigner',
        'PATCH',
        `/signers/${signer.data.id}`,
        { title: 'SYNTHETIC title' },
        { ifMatch: boundSigner.etag },
      ),
      200,
    );
    // An Owner is a namespace: binding it does not turn it into a legal subject or lock a label.
    const owner = await createOwner();
    const boundOwner = versioned<Owner>(
      await bind('bindCanonicalOwner', `/owners/${owner.data.id}`, owner.etag, {
        canonicalCode: 'SYN-OW-1',
        sourceId: (await createSource()).id,
      }),
      200,
    );
    versioned(
      await client.write(
        'patchOwner',
        'PATCH',
        `/owners/${owner.data.id}`,
        { displayName: 'SYNTHETIC relabelled brand' },
        { ifMatch: boundOwner.etag },
      ),
      200,
    );
    expect(await countRows(prisma, 'legal_subjects')).toBe(1);
    // A bound, unused draft is no longer a discardable draft.
    const deletion = await client.write(
      'deleteUnusedOwner',
      'DELETE',
      `/owners/${owner.data.id}`,
      undefined,
      { ifMatch: (await getOwner(owner.data.id)).etag },
    );
    expect(errorOf(deletion).details['blockers']).toContain('CANONICAL_BINDING');
  });
});

// ---------------------------------------------------------------------------------------------

describe('SCOPE / CONTAMINATION', () => {
  it('an agency source never silently supports another agency: attributions, signer sources and bindings', async () => {
    const agencyA = await createAgency({ displayName: 'SYNTHETIC Agency A' });
    const agencyB = await createAgency({ displayName: 'SYNTHETIC Agency B' });
    const sourceA = await createSource({ agencyId: agencyA.data.id });
    const attribution = await client.write(
      'patchAgency',
      'PATCH',
      `/agencies/${agencyB.data.id}`,
      {
        fieldAttributions: [
          {
            field: 'displayName',
            provenance: 'OPERATOR_REPORTED',
            sourceIds: [sourceA.id],
            scopeText: 'x',
          },
        ],
      },
      { ifMatch: agencyB.etag },
    );
    expect(code(attribution)).toBe('CROSS_AGENCY_REFERENCE');
    const signerB = await client.write('createSigner', 'POST', '/signers', {
      agencyId: agencyB.data.id,
      fullLegalName: 'SYNTHETIC Signer B',
      identitySourceId: sourceA.id,
    });
    expect(code(signerB)).toBe('CROSS_AGENCY_REFERENCE');
    const bindingB = await bind(
      'bindCanonicalAgency',
      `/agencies/${agencyB.data.id}`,
      agencyB.etag,
      {
        canonicalCode: 'SYN-B',
        sourceId: sourceA.id,
      },
    );
    expect(code(bindingB)).toBe('CROSS_AGENCY_REFERENCE');
    // Explicitly shared with both agencies: applies to both.
    const shared = await createSource({
      scopeBindings: { agencyIds: [agencyA.data.id, agencyB.data.id] },
    });
    versioned(
      await bind('bindCanonicalAgency', `/agencies/${agencyA.data.id}`, agencyA.etag, {
        canonicalCode: 'SYN-A',
        sourceId: shared.id,
      }),
      200,
    );
    versioned(
      await bind('bindCanonicalAgency', `/agencies/${agencyB.data.id}`, agencyB.etag, {
        canonicalCode: 'SYN-B',
        sourceId: shared.id,
      }),
      200,
    );
  });

  it('owner material does not transfer to another owner: binding, association source and route binding', async () => {
    const x = await graph('X');
    const y = await graph('Y');
    const ownerMaterial = await createSource();
    versioned(
      await bind(
        'bindCanonicalOwner',
        `/owners/${x.owner.data.id}`,
        (await getOwner(x.owner.data.id)).etag,
        {
          canonicalCode: 'SYN-X',
          sourceId: ownerMaterial.id,
        },
      ),
      200,
    );
    const toY = await bind(
      'bindCanonicalOwner',
      `/owners/${y.owner.data.id}`,
      (await getOwner(y.owner.data.id)).etag,
      {
        canonicalCode: 'SYN-Y',
        sourceId: ownerMaterial.id,
      },
    );
    expect([toY.status, errorOf(toY)]).toEqual([
      422,
      expect.objectContaining({
        code: 'CROSS_OWNER_REFERENCE',
        details: { field: 'sourceId', ownerId: x.owner.data.id },
      }),
    ]);
    // Citing X's material for a new association of Y is refused as well.
    const otherSubject = await createSubject({ legalName: 'SYNTHETIC Y second subject' });
    const yOwner = await getOwner(y.owner.data.id);
    const linkY = await client.write(
      'linkOwnerSubject',
      'POST',
      `/owners/${y.owner.data.id}/subjects`,
      { legalSubjectId: otherSubject.data.id, sourceId: ownerMaterial.id },
      { ifMatch: yOwner.etag },
    );
    expect(code(linkY)).toBe('CROSS_OWNER_REFERENCE');
    // X may reuse its own material for its own association.
    const xSecond = await createSubject({ legalName: 'SYNTHETIC X second subject' });
    const reused = await link(x.owner.data.id, xSecond.data.id, { sourceId: ownerMaterial.id });
    expect(reused.data.sourceId).toBe(ownerMaterial.id);
    // A route source bound for X's route is X's material; Y's route of the same agency cannot use it.
    const routeX = await createRoute({
      agencyId: x.agency.data.id,
      ownerSubjectId: x.association.data.id,
    });
    const routeSource = await createSource({ agencyId: x.agency.data.id });
    versioned(
      await bind('bindCanonicalRoute', `/routes/${routeX.data.id}`, routeX.etag, {
        canonicalCode: 'SYN-RX',
        sourceId: routeSource.id,
      }),
      200,
    );
    const routeY = await createRoute({
      agencyId: x.agency.data.id,
      ownerSubjectId: y.association.data.id,
    });
    const refused = await bind('bindCanonicalRoute', `/routes/${routeY.data.id}`, routeY.etag, {
      canonicalCode: 'SYN-RY',
      sourceId: routeSource.id,
    });
    expect(code(refused)).toBe('CROSS_OWNER_REFERENCE');
  });

  it('case scope does not exist in P3A: a case-scoped fixture applies to no record', async () => {
    const agency = await createAgency();
    const caseScoped = await insertSource(prisma, client.session.userId, {
      agencyId: agency.data.id,
      sourceRole: 'CANONICAL_RECORD',
      scopeBindings: { caseIds: [randomUUID()] },
    });
    const refused = await bind('bindCanonicalAgency', `/agencies/${agency.data.id}`, agency.etag, {
      canonicalCode: 'SYN-CASE',
      sourceId: caseScoped,
    });
    expect(errorOf(refused)).toMatchObject({
      code: 'SOURCE_SCOPE_UNRESOLVED',
      details: { reason: 'CASE_SCOPED_SOURCE' },
    });
    expect(await countRows(prisma, 'cases')).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------

describe('ROUTES — a relationship record, not authority', () => {
  it('create: Agency + OwnerSubject + YOUTUBE, LINKED, audited; no mandate, coverage or case appears', async () => {
    const { agency, association } = await graph();
    const signer = await createSigner(agency.data.id);
    const result = await client.write('createRoute', 'POST', '/routes', {
      agencyId: agency.data.id,
      ownerSubjectId: association.data.id,
      defaultSignerId: signer.data.id,
      casePrefixHint: 'SYN',
      notes: 'SYNTHETIC private route note',
    });
    const route = versioned<Route>(result, 201);
    expect(route.data).toMatchObject({
      platform: 'YOUTUBE',
      linkState: 'LINKED',
      defaultSignerId: signer.data.id,
      preferredCoverageId: null,
      unlinkedAt: null,
      stateReason: null,
      bindingState: 'LOCAL_ONLY',
      rowVersion: 1,
    });
    expect(route.etag).toBe(`"Route:${route.data.id}:v1"`);
    const [event] = await auditRows(route.data.id);
    expect(event).toMatchObject({ action: 'ROUTE_CREATED', actorUserId: client.session.userId });
    expect(JSON.stringify(event)).not.toContain('private route note');
    await expectNoAuthority();
    expect(await countRows(prisma, 'cases')).toBe(0);
    // Creating a route neither activates nor changes the parties.
    expect((await getAgency(agency.data.id)).data.recordState).toBe('DRAFT');
    expect((await getSigner(signer.data.id)).data.operationalState).toBe('DRAFT');
  });

  it('create refuses missing, archived, paused, cross-agency and future-phase references', async () => {
    const { agency, association } = await graph('Main');
    const other = await createAgency({ displayName: 'SYNTHETIC Other agency' });
    const otherSigner = await createSigner(other.data.id);
    const endedSigner = await createSigner(agency.data.id);
    versioned(
      await client.write(
        'setSignerState',
        'POST',
        `/signers/${endedSigner.data.id}/state`,
        { state: 'ENDED', reason: 'synthetic' },
        { ifMatch: endedSigner.etag },
      ),
      200,
    );
    const base = { agencyId: agency.data.id, ownerSubjectId: association.data.id };
    const cases: Array<[Record<string, unknown>, number, string]> = [
      [{ ...base, agencyId: randomUUID() }, 422, 'REFERENCE_NOT_FOUND'],
      [{ ...base, ownerSubjectId: randomUUID() }, 422, 'REFERENCE_NOT_FOUND'],
      [{ ...base, defaultSignerId: otherSigner.data.id }, 422, 'CROSS_AGENCY_REFERENCE'],
      [{ ...base, defaultSignerId: endedSigner.data.id }, 409, 'RECORD_STATE_CONFLICT'],
      [{ ...base, defaultSignerId: randomUUID() }, 422, 'REFERENCE_NOT_FOUND'],
      // P3A refused every preferred coverage (PREFERRED_COVERAGE_UNAVAILABLE); P3B validates it
      // against MandateCoverage, so an unknown id is now a missing reference (p3b-http.test.ts).
      [{ ...base, preferredCoverageId: randomUUID() }, 422, 'REFERENCE_NOT_FOUND'],
      [{ ...base, platform: 'TIKTOK' }, 422, 'VALIDATION_FAILED'],
      [{ ...base, linkState: 'LINKED' }, 422, 'VALIDATION_FAILED'],
    ];
    for (const [body, status, errorCode] of cases) {
      const result = await client.write('createRoute', 'POST', '/routes', body);
      expect([result.status, code(result)], JSON.stringify(body)).toEqual([status, errorCode]);
    }
    // A paused association cannot start a new route; an archived party cannot either.
    const paused = versioned<OwnerSubject>(
      await client.write(
        'setOwnerSubjectLinkState',
        'POST',
        `/owner-subjects/${association.data.id}/link-state`,
        { state: 'PAUSED', reason: 'synthetic' },
        {
          ifMatch: (await client.get('getOwnerSubject', `/owner-subjects/${association.data.id}`))
            .headers['etag'] as string,
        },
      ),
      200,
    );
    expect(paused.data.linkState).toBe('PAUSED');
    const onPaused = await client.write('createRoute', 'POST', '/routes', base);
    expect([onPaused.status, code(onPaused)]).toEqual([409, 'RECORD_STATE_CONFLICT']);
    const second = await graph('Second');
    versioned(
      await client.write(
        'archiveOwner',
        'POST',
        `/owners/${second.owner.data.id}/archive`,
        { reason: 'synthetic' },
        { ifMatch: (await getOwner(second.owner.data.id)).etag },
      ),
      200,
    );
    const onArchived = await client.write('createRoute', 'POST', '/routes', {
      agencyId: agency.data.id,
      ownerSubjectId: second.association.data.id,
    });
    expect([onArchived.status, errorOf(onArchived)]).toEqual([
      409,
      expect.objectContaining({
        code: 'RECORD_STATE_CONFLICT',
        details: expect.objectContaining({ record: 'Owner' }),
      }),
    ]);
    expect(await countRows(prisma, 'routes')).toBe(0);
  });

  it('one route per agency, association and platform: a duplicate is 409 with the existing id, also concurrently', async () => {
    const { agency, association } = await graph();
    const body = { agencyId: agency.data.id, ownerSubjectId: association.data.id };
    const results = await Promise.all([
      client.write('createRoute', 'POST', '/routes', body),
      client.write('createRoute', 'POST', '/routes', body),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    const existing = dataOf<Route>(results.find((result) => result.status === 201) as HttpResult);
    const duplicate = await client.write('createRoute', 'POST', '/routes', body);
    expect([duplicate.status, errorOf(duplicate)]).toEqual([
      409,
      expect.objectContaining({ code: 'DUPLICATE_ROUTE', details: { routeId: existing.id } }),
    ]);
    // The same association under another agency is a separate route (no blanket uniqueness).
    const other = await createAgency({ displayName: 'SYNTHETIC other agency' });
    versioned(
      await client.write('createRoute', 'POST', '/routes', { ...body, agencyId: other.data.id }),
      201,
    );
    expect(await countRows(prisma, 'routes')).toBe(2);
  });

  it('the relationship identity is immutable: PATCH cannot move a route; allowed fields change with If-Match', async () => {
    const { agency, association } = await graph();
    const other = await graph('Other');
    const route = await createRoute({
      agencyId: agency.data.id,
      ownerSubjectId: association.data.id,
    });
    for (const change of [
      { agencyId: other.agency.data.id },
      { ownerSubjectId: other.association.data.id },
      { platform: 'YOUTUBE' },
      { linkState: 'PAUSED' },
      { canonicalCode: 'X' },
    ]) {
      const refused = await client.write(
        'patchRoute',
        'PATCH',
        `/routes/${route.data.id}`,
        change,
        {
          ifMatch: route.etag,
        },
      );
      expect([refused.status, code(refused)], JSON.stringify(change)).toEqual([
        422,
        'VALIDATION_FAILED',
      ]);
    }
    const signer = await createSigner(agency.data.id);
    const patched = versioned<Route>(
      await client.write(
        'patchRoute',
        'PATCH',
        `/routes/${route.data.id}`,
        {
          casePrefixHint: 'SYN-2',
          defaultSignerId: signer.data.id,
          notes: 'SYNTHETIC note',
          preferredCoverageId: null,
        },
        { ifMatch: route.etag },
      ),
      200,
    );
    expect(patched.data).toMatchObject({
      agencyId: agency.data.id,
      ownerSubjectId: association.data.id,
      casePrefixHint: 'SYN-2',
      defaultSignerId: signer.data.id,
      rowVersion: 2,
    });
    const noop = versioned<Route>(
      await client.write(
        'patchRoute',
        'PATCH',
        `/routes/${route.data.id}`,
        { casePrefixHint: 'SYN-2' },
        { ifMatch: patched.etag },
      ),
      200,
    );
    expect(noop.data.rowVersion).toBe(2);
    const coverage = await client.write(
      'patchRoute',
      'PATCH',
      `/routes/${route.data.id}`,
      { preferredCoverageId: randomUUID() },
      { ifMatch: patched.etag },
    );
    // Since P3B an unknown coverage is a missing reference (was PREFERRED_COVERAGE_UNAVAILABLE).
    expect([coverage.status, code(coverage)]).toEqual([422, 'REFERENCE_NOT_FOUND']);
    expect(errorOf(coverage).details).toMatchObject({ field: 'preferredCoverageId' });
    const empty = await client.write(
      'patchRoute',
      'PATCH',
      `/routes/${route.data.id}`,
      {},
      { ifMatch: patched.etag },
    );
    expect([empty.status, code(empty)]).toEqual([422, 'VALIDATION_FAILED']);
  });

  it('AC-055 two tabs: the second write with the old ETag is 412 and nothing is overwritten', async () => {
    const { agency, association } = await graph();
    const route = await createRoute({
      agencyId: agency.data.id,
      ownerSubjectId: association.data.id,
    });
    versioned(
      await client.write(
        'patchRoute',
        'PATCH',
        `/routes/${route.data.id}`,
        { casePrefixHint: 'TAB-1' },
        { ifMatch: route.etag },
      ),
      200,
    );
    const second = await client.write(
      'patchRoute',
      'PATCH',
      `/routes/${route.data.id}`,
      { casePrefixHint: 'TAB-2' },
      { ifMatch: route.etag },
    );
    expect([second.status, code(second)]).toEqual([412, 'RECORD_VERSION_CONFLICT']);
    expect((await getRoute(route.data.id)).data.casePrefixHint).toBe('TAB-1');
  });

  it('link state: pause, unlink and relink with reasons; relink needs linked, unarchived parties; no cascade', async () => {
    const { agency, owner, association } = await graph();
    const route = await createRoute({
      agencyId: agency.data.id,
      ownerSubjectId: association.data.id,
    });
    const setState = (state: string, etag: string) =>
      client.write(
        'setRouteLinkState',
        'POST',
        `/routes/${route.data.id}/link-state`,
        { state, reason: `synthetic ${state}` },
        { ifMatch: etag },
      );
    const paused = versioned<Route>(await setState('PAUSED', route.etag), 200);
    expect(paused.data).toMatchObject({
      linkState: 'PAUSED',
      stateReason: 'synthetic PAUSED',
      unlinkedAt: null,
    });
    const same = await setState('PAUSED', paused.etag);
    expect([same.status, code(same)]).toEqual([409, 'RECORD_STATE_CONFLICT']);
    // The association cannot be unlinked while the route is PAUSED (P2 rule, no cascade).
    const associationEtag = (
      await client.get('getOwnerSubject', `/owner-subjects/${association.data.id}`)
    ).headers['etag'] as string;
    const unlinkAssociation = await client.write(
      'setOwnerSubjectLinkState',
      'POST',
      `/owner-subjects/${association.data.id}/link-state`,
      { state: 'UNLINKED', reason: 'synthetic' },
      { ifMatch: associationEtag },
    );
    expect(code(unlinkAssociation)).toBe('DEPENDENT_ROUTES_LINKED');
    const unlinked = versioned<Route>(await setState('UNLINKED', paused.etag), 200);
    expect(unlinked.data.linkState).toBe('UNLINKED');
    expect(unlinked.data.unlinkedAt).not.toBeNull();
    // Now the association can be unlinked; the route cannot be relinked through it.
    versioned(
      await client.write(
        'setOwnerSubjectLinkState',
        'POST',
        `/owner-subjects/${association.data.id}/link-state`,
        { state: 'UNLINKED', reason: 'synthetic' },
        { ifMatch: associationEtag },
      ),
      200,
    );
    const relinkOnUnlinked = await setState('LINKED', unlinked.etag);
    expect([relinkOnUnlinked.status, errorOf(relinkOnUnlinked)]).toEqual([
      409,
      expect.objectContaining({
        code: 'RECORD_STATE_CONFLICT',
        details: expect.objectContaining({ record: 'OwnerSubject' }),
      }),
    ]);
    const associationNow = (
      await client.get('getOwnerSubject', `/owner-subjects/${association.data.id}`)
    ).headers['etag'] as string;
    versioned(
      await client.write(
        'setOwnerSubjectLinkState',
        'POST',
        `/owner-subjects/${association.data.id}/link-state`,
        { state: 'LINKED', reason: 'synthetic relink' },
        { ifMatch: associationNow },
      ),
      200,
    );
    const relinked = versioned<Route>(await setState('LINKED', unlinked.etag), 200);
    expect(relinked.data).toMatchObject({
      linkState: 'LINKED',
      unlinkedAt: null,
      stateReason: 'synthetic LINKED',
    });
    // An archived owner: pause and unlink stay possible, relink is refused.
    versioned(
      await client.write(
        'archiveOwner',
        'POST',
        `/owners/${owner.data.id}/archive`,
        { reason: 'synthetic' },
        { ifMatch: (await getOwner(owner.data.id)).etag },
      ),
      200,
    );
    const pausedAgain = versioned<Route>(await setState('PAUSED', relinked.etag), 200);
    const blocked = await setState('LINKED', pausedAgain.etag);
    expect([blocked.status, errorOf(blocked)]).toEqual([
      409,
      expect.objectContaining({
        details: expect.objectContaining({ record: 'Owner', state: 'ARCHIVED' }),
      }),
    ]);
    versioned(await setState('UNLINKED', pausedAgain.etag), 200);
    const events = (await auditRows(route.data.id)).filter(
      (event) => event.action === 'ROUTE_LINK_STATE_CHANGED',
    );
    expect(events.map((event) => event.reason)).toEqual([
      'synthetic PAUSED',
      'synthetic UNLINKED',
      'synthetic LINKED',
      'synthetic PAUSED',
      'synthetic UNLINKED',
    ]);
    await expectNoAuthority();
  });

  it('archive/restore: archived is read-only; restore keeps the link state and never reactivates an archived party', async () => {
    const { agency, association } = await graph();
    const route = await createRoute({
      agencyId: agency.data.id,
      ownerSubjectId: association.data.id,
    });
    const archived = versioned<Route>(
      await client.write(
        'archiveRoute',
        'POST',
        `/routes/${route.data.id}/archive`,
        { reason: 'synthetic archive' },
        { ifMatch: route.etag },
      ),
      200,
    );
    expect(archived.data).toMatchObject({
      archiveReason: 'synthetic archive',
      linkState: 'LINKED',
    });
    for (const [operationId, method, suffix, body] of [
      ['patchRoute', 'PATCH', '', { notes: 'x' }],
      ['setRouteLinkState', 'POST', '/link-state', { state: 'PAUSED', reason: 'x' }],
      ['archiveRoute', 'POST', '/archive', { reason: 'x' }],
      [
        'bindCanonicalRoute',
        'POST',
        '/canonical-bindings',
        { canonicalCode: 'X', sourceId: randomUUID(), reason: 'x' },
      ],
    ] as const) {
      const refused = await client.write(
        operationId,
        method,
        `/routes/${route.data.id}${suffix}`,
        body,
        { ifMatch: archived.etag },
      );
      expect([refused.status, code(refused)], operationId).toEqual([409, 'RECORD_STATE_CONFLICT']);
    }
    versioned(
      await client.write(
        'archiveAgency',
        'POST',
        `/agencies/${agency.data.id}/archive`,
        { reason: 'synthetic' },
        { ifMatch: (await getAgency(agency.data.id)).etag },
      ),
      200,
    );
    const blocked = await client.write(
      'restoreRoute',
      'POST',
      `/routes/${route.data.id}/restore`,
      { reason: 'synthetic' },
      { ifMatch: archived.etag },
    );
    expect([blocked.status, errorOf(blocked)]).toEqual([
      409,
      expect.objectContaining({
        details: expect.objectContaining({ record: 'Agency', state: 'ARCHIVED' }),
      }),
    ]);
    versioned(
      await client.write(
        'restoreAgency',
        'POST',
        `/agencies/${agency.data.id}/restore`,
        { reason: 'synthetic' },
        { ifMatch: (await getAgency(agency.data.id)).etag },
      ),
      200,
    );
    const restored = versioned<Route>(
      await client.write(
        'restoreRoute',
        'POST',
        `/routes/${route.data.id}/restore`,
        { reason: 'synthetic restore' },
        { ifMatch: archived.etag },
      ),
      200,
    );
    expect(restored.data).toMatchObject({
      archivedAt: null,
      archiveReason: null,
      linkState: 'LINKED',
    });
    const again = await client.write(
      'restoreRoute',
      'POST',
      `/routes/${route.data.id}/restore`,
      { reason: 'x' },
      { ifMatch: restored.etag },
    );
    expect([again.status, code(again)]).toEqual([409, 'RECORD_STATE_CONFLICT']);
  });

  it('deleteUnused: an unused route is deleted; archived, bound, referenced or snapshot-referenced routes are refused', async () => {
    const { agency, association } = await graph();
    const unused = await createRoute({
      agencyId: agency.data.id,
      ownerSubjectId: association.data.id,
    });
    const gone = await client.write(
      'deleteUnusedRoute',
      'DELETE',
      `/routes/${unused.data.id}`,
      undefined,
      { ifMatch: unused.etag },
    );
    expect(gone.status).toBe(204);
    expect((await auditRows(unused.data.id)).at(-1)?.action).toBe('ROUTE_DELETED');
    const blockers = async (routeId: string, etag: string) => {
      const refused = await client.write(
        'deleteUnusedRoute',
        'DELETE',
        `/routes/${routeId}`,
        undefined,
        { ifMatch: etag },
      );
      expect(refused.status).toBe(409);
      return errorOf(refused).details['blockers'];
    };
    const route = await createRoute({
      agencyId: agency.data.id,
      ownerSubjectId: association.data.id,
    });
    const archived = versioned<Route>(
      await client.write(
        'archiveRoute',
        'POST',
        `/routes/${route.data.id}/archive`,
        { reason: 'x' },
        { ifMatch: route.etag },
      ),
      200,
    );
    expect(await blockers(route.data.id, archived.etag)).toEqual(['ARCHIVED']);
    const other = await createAgency({ displayName: 'SYNTHETIC bound route agency' });
    const boundRoute = await createRoute({
      agencyId: other.data.id,
      ownerSubjectId: association.data.id,
    });
    const bound = versioned<Route>(
      await bind('bindCanonicalRoute', `/routes/${boundRoute.data.id}`, boundRoute.etag, {
        canonicalCode: 'SYN-ROUTE-BOUND',
        sourceId: (await createSource({ agencyId: other.data.id })).id,
      }),
      200,
    );
    expect(await blockers(boundRoute.data.id, bound.etag)).toEqual(['CANONICAL_BINDING']);
    // A synthetic case fixture referencing a route (test-only row; no Case feature exists).
    const third = await createAgency({ displayName: 'SYNTHETIC referenced route agency' });
    const referenced = await createRoute({
      agencyId: third.data.id,
      ownerSubjectId: association.data.id,
    });
    await prisma.caseRecord.create({
      data: {
        id: randomUUID(),
        agencyId: third.data.id,
        platform: 'YOUTUBE',
        routeId: referenced.data.id,
        intakeLabel: 'SYNTHETIC case fixture (test only)',
        createdById: client.session.userId,
        updatedById: client.session.userId,
      },
    });
    expect(await blockers(referenced.data.id, referenced.etag)).toEqual([
      'REFERENCED_BY:cases.route_id',
    ]);
    await prisma.caseRecord.deleteMany({});
    const fourth = await createAgency({ displayName: 'SYNTHETIC snapshot route agency' });
    const snapshot = await createRoute({
      agencyId: fourth.data.id,
      ownerSubjectId: association.data.id,
    });
    await insertSource(prisma, client.session.userId, {
      scopeBindings: { limitation: `mentions route ${snapshot.data.id}` },
    });
    expect(await blockers(snapshot.data.id, snapshot.etag)).toEqual([
      'SNAPSHOT_REFERENCE:source_references',
    ]);
  });

  it('lists routes by agency and by owner, subject, agency or prefix text; an association id finds its routes', async () => {
    const x = await graph('Xứ');
    const y = await graph('Yên');
    const routeX = await createRoute({
      agencyId: x.agency.data.id,
      ownerSubjectId: x.association.data.id,
      casePrefixHint: 'PFX-X',
    });
    const routeY = await createRoute({
      agencyId: y.agency.data.id,
      ownerSubjectId: y.association.data.id,
    });
    const list = async (query: string) =>
      (
        versioned0(await client.get('listRoutes', `/routes${query}`)) as { items: Route[] }
      ).items.map((route) => route.id);
    expect(await list(`?agencyId=${x.agency.data.id}`)).toEqual([routeX.data.id]);
    expect(await list(`?q=${encodeURIComponent('brand xu')}`)).toEqual([routeX.data.id]);
    expect(await list(`?q=${encodeURIComponent('subject yen')}`)).toEqual([routeY.data.id]);
    expect(await list(`?q=pfx-x`)).toEqual([routeX.data.id]);
    expect(await list(`?q=${y.association.data.id}`)).toEqual([routeY.data.id]);
    expect((await list('')).sort()).toEqual([routeX.data.id, routeY.data.id].sort());
    const missing = await client.get('getRoute', `/routes/${randomUUID()}`);
    expect([missing.status, code(missing)]).toEqual([404, 'NOT_FOUND']);
  });

  it('route cursor pages cover every route once; tampered or re-filtered cursors are 400', async () => {
    const { agency, owner } = await graph('Pages');
    const ids: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      const subject = await createSubject({ legalName: `SYNTHETIC Page Subject ${index} LLC` });
      const association = await link(owner.data.id, subject.data.id);
      const route = await createRoute({
        agencyId: agency.data.id,
        ownerSubjectId: association.data.id,
      });
      ids.push(route.data.id);
    }
    const filter = `agencyId=${agency.data.id}`;
    const seen: string[] = [];
    let cursor: string | null = null;
    let lastCursor = '';
    do {
      const path: string =
        cursor === null
          ? `/routes?limit=2&${filter}`
          : `/routes?limit=2&${filter}&cursor=${encodeURIComponent(cursor)}`;
      const page = versioned0(await client.get('listRoutes', path)) as {
        items: Route[];
        nextCursor: string | null;
      };
      seen.push(...page.items.map((route) => route.id));
      cursor = page.nextCursor;
      if (cursor !== null) lastCursor = cursor;
    } while (cursor !== null);
    expect(seen).toHaveLength(5);
    expect(new Set(seen)).toEqual(new Set(ids));
    const tampered = await client.get(
      'listRoutes',
      `/routes?${filter}&cursor=${encodeURIComponent(`${lastCursor.slice(0, -2)}xx`)}`,
    );
    expect([tampered.status, code(tampered)]).toEqual([400, 'INVALID_CURSOR']);
    const refiltered = await client.get(
      'listRoutes',
      `/routes?cursor=${encodeURIComponent(lastCursor)}`,
    );
    expect([refiltered.status, code(refiltered)]).toEqual([400, 'INVALID_CURSOR']);
  });

  it('a failing audit insert rolls back route create, patch, link state and delete', async () => {
    const { agency, association } = await graph();
    const route = await createRoute({
      agencyId: agency.data.id,
      ownerSubjectId: association.data.id,
    });
    const other = await createAgency({ displayName: 'SYNTHETIC rollback agency' });
    const keysBefore = await prisma.idempotencyRecord.count();
    auditWriter.armed = true;
    const results = [
      await client.write('createRoute', 'POST', '/routes', {
        agencyId: other.data.id,
        ownerSubjectId: association.data.id,
      }),
      await client.write(
        'patchRoute',
        'PATCH',
        `/routes/${route.data.id}`,
        { casePrefixHint: 'ROLLBACK' },
        { ifMatch: route.etag },
      ),
      await client.write(
        'setRouteLinkState',
        'POST',
        `/routes/${route.data.id}/link-state`,
        { state: 'PAUSED', reason: 'x' },
        { ifMatch: route.etag },
      ),
      await client.write('deleteUnusedRoute', 'DELETE', `/routes/${route.data.id}`, undefined, {
        ifMatch: route.etag,
      }),
    ];
    auditWriter.armed = false;
    expect(results.map((result) => result.status)).toEqual([500, 500, 500, 500]);
    expect(await countRows(prisma, 'routes')).toBe(1);
    expect((await getRoute(route.data.id)).data).toMatchObject({
      rowVersion: 1,
      linkState: 'LINKED',
      casePrefixHint: null,
    });
    // None of the four failed requests left an idempotency record.
    expect(await prisma.idempotencyRecord.count()).toBe(keysBefore);
  });
});

function versioned0(result: HttpResult): unknown {
  expect(result.status, result.text).toBe(200);
  return dataOf(result);
}

// ---------------------------------------------------------------------------------------------

describe('SECURITY / CONTRACT', () => {
  it('no session, a bad CSRF token or a wrong Origin stops every P3A write before any mutation', async () => {
    const agency = await createAgency();
    const body = { ...SOURCE_BASE, agencyId: agency.data.id };
    const noSession = await http(t.port, 'POST', '/api/v1/sources', {
      headers: {
        Origin: ALLOWED_ORIGIN,
        'Content-Type': 'application/json',
        'Idempotency-Key': newKey(),
      },
      body: JSON.stringify(body),
    });
    expect(noSession.status).toBe(401);
    const badCsrf = await http(t.port, 'POST', '/api/v1/sources', {
      headers: {
        Origin: ALLOWED_ORIGIN,
        ...cookieHeader(client.session.token),
        'X-CSRF-Token': 'not-the-token',
        'Content-Type': 'application/json',
        'Idempotency-Key': newKey(),
      },
      body: JSON.stringify(body),
    });
    expect([badCsrf.status, code(badCsrf)]).toEqual([403, 'CSRF_TOKEN_INVALID']);
    const wrongOrigin = await client.write('createSource', 'POST', '/sources', body, {
      headers: { Origin: 'http://evil.example.invalid' },
    });
    expect(wrongOrigin.status).toBe(403);
    expect(await countRows(prisma, 'source_references')).toBe(0);
  });

  it('a full synthetic tour: source → bindings → association → route → route binding, plus an expected refusal', async () => {
    const { agency, owner, subject, association } = await graph('Tour');
    const agencySource = await createSource({
      agencyId: agency.data.id,
      title: 'SYNTHETIC agency registry',
    });
    versioned(
      await bind(
        'bindCanonicalAgency',
        `/agencies/${agency.data.id}`,
        (await getAgency(agency.data.id)).etag,
        { canonicalCode: 'SYN-TOUR-AG', sourceId: agencySource.id },
      ),
      200,
    );
    versioned(
      await bind(
        'bindCanonicalOwner',
        `/owners/${owner.data.id}`,
        (await getOwner(owner.data.id)).etag,
        {
          canonicalCode: 'SYN-TOUR-OW',
          sourceId: (await createSource({ title: 'SYNTHETIC brand registry' })).id,
        },
      ),
      200,
    );
    versioned(
      await bind(
        'bindCanonicalLegalSubject',
        `/legal-subjects/${subject.data.id}`,
        (await getSubject(subject.data.id)).etag,
        {
          canonicalCode: 'SYN-TOUR-LS',
          sourceId: (await createSource({ scopeBindings: { legalSubjectIds: [subject.data.id] } }))
            .id,
        },
      ),
      200,
    );
    const signer = await createSigner(agency.data.id);
    versioned(
      await bind('bindCanonicalSigner', `/signers/${signer.data.id}`, signer.etag, {
        canonicalCode: 'SYN-TOUR-SG',
        sourceId: (await createSource({ agencyId: agency.data.id })).id,
      }),
      200,
    );
    const route = await createRoute({
      agencyId: agency.data.id,
      ownerSubjectId: association.data.id,
      defaultSignerId: signer.data.id,
    });
    const routeSource = await createSource({
      agencyId: agency.data.id,
      title: 'SYNTHETIC route registry',
    });
    const bound = versioned<Route>(
      await bind('bindCanonicalRoute', `/routes/${route.data.id}`, route.etag, {
        canonicalCode: 'SYN-TOUR-RT',
        sourceId: routeSource.id,
      }),
      200,
    );
    expect(bound.data.canonicalSourceId).toBe(routeSource.id);
    const revised = immutable<SourceReference>(
      await reviseSource(routeSource.id, {
        agencyId: agency.data.id,
        title: 'SYNTHETIC route registry (rev 2)',
      }),
      201,
    );
    // The route keeps pointing at the revision it was bound to.
    expect((await getRoute(route.data.id)).data.canonicalSourceId).toBe(routeSource.id);
    expect(revised.supersedesSourceId).toBe(routeSource.id);
    // Expected refusal: the agency's source cannot become another agency's canonical source.
    const outsider = await createAgency({ displayName: 'SYNTHETIC outsider' });
    const refused = await bind(
      'bindCanonicalAgency',
      `/agencies/${outsider.data.id}`,
      outsider.etag,
      { canonicalCode: 'SYN-OUT', sourceId: agencySource.id },
    );
    expect([refused.status, code(refused)]).toEqual([422, 'CROSS_AGENCY_REFERENCE']);
    await expectNoAuthority();
  });

  it('every collected response matches its operation: declared status, contract schema, ETag rules', () => {
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
        const versionedResource = typeof data?.rowVersion === 'number';
        if (versionedResource) {
          expect(result.headers['etag'], label).toMatch(/^"[A-Za-z]+:[0-9a-f-]{36}:v\d+"$/);
        } else {
          // Lists, 204 and immutable SourceReferences carry no ETag.
          expect(result.headers['etag'], label).toBeUndefined();
        }
      } else {
        expect(operation.errors as readonly string[], label).toContain(String(result.status));
        expect(OperationErrorSchema.safeParse(result.json).success, label).toBe(true);
      }
      expect(result.headers['cache-control'], label).toBe('no-store');
    }
    const p3a = [
      'listSources',
      'createSource',
      'getSource',
      'reviseSource',
      'bindCanonicalAgency',
      'bindCanonicalOwner',
      'bindCanonicalLegalSubject',
      'bindCanonicalSigner',
      'listRoutes',
      'createRoute',
      'getRoute',
      'patchRoute',
      'deleteUnusedRoute',
      'archiveRoute',
      'restoreRoute',
      'bindCanonicalRoute',
      'setRouteLinkState',
    ];
    expect(p3a.filter((operationId) => !seen.has(operationId))).toEqual([]);
  });
});
