// P2 Directory over real HTTP against tb_notice_test (yarn test:db).
//
// Each test boots the real AppModule + configureApp pipeline (request policy → JSON parser → global
// AuthGuard → directory controllers → ApiExceptionFilter) on an ephemeral loopback port, with a
// synthetic signed-in application User, a controllable clock and an audit writer that can be made
// to fail. Every response is recorded and checked against the active contract at the end. All data
// is synthetic; every test deletes what it created.
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Prisma, type PrismaClient } from '../../apps/api/generated/prisma/client.js';
import type {
  Agency,
  LegalSubject,
  Owner,
  OwnerSubject,
  Signer,
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

const MISSING_ID = '00000000-0000-4000-8000-00000000dead';
const staleEtag = (type: string, id: string) => `"${type}:${id}:v999"`;
const code = (result: HttpResult) => errorOf(result).code;

interface Created<T> {
  readonly data: T;
  readonly etag: string;
}

async function created<T>(result: HttpResult): Promise<Created<T>> {
  expect(result.status, result.text).toBe(201);
  return { data: dataOf<T>(result), etag: etagOf(result) };
}

async function ok<T>(result: HttpResult): Promise<Created<T>> {
  expect(result.status, result.text).toBe(200);
  return { data: dataOf<T>(result), etag: etagOf(result) };
}

const createAgency = async (body: Record<string, unknown> = {}, c = client) =>
  created<Agency>(
    await c.write('createAgency', 'POST', '/agencies', {
      displayName: 'SYNTHETIC Agency',
      ...body,
    }),
  );
const createOwner = async (body: Record<string, unknown> = {}, c = client) =>
  created<Owner>(
    await c.write('createOwner', 'POST', '/owners', { displayName: 'SYNTHETIC Owner', ...body }),
  );
const createSubject = async (body: Record<string, unknown> = {}, c = client) =>
  created<LegalSubject>(
    await c.write('createLegalSubject', 'POST', '/legal-subjects', {
      subjectType: 'LEGAL_ENTITY',
      legalName: 'SYNTHETIC Subject LLC',
      ...body,
    }),
  );
const createSigner = async (agencyId: string, body: Record<string, unknown> = {}, c = client) =>
  created<Signer>(
    await c.write('createSigner', 'POST', '/signers', {
      agencyId,
      fullLegalName: 'SYNTHETIC Signer Person',
      ...body,
    }),
  );
const link = async (owner: Created<Owner>, legalSubjectId: string, body = {}, c = client) =>
  created<OwnerSubject>(
    await c.write(
      'linkOwnerSubject',
      'POST',
      `/owners/${owner.data.id}/subjects`,
      { legalSubjectId, ...body },
      { ifMatch: owner.etag },
    ),
  );
const getAgency = async (id: string) =>
  ok<Agency>(await client.get('getAgency', `/agencies/${id}`));
const getOwner = async (id: string) => ok<Owner>(await client.get('getOwner', `/owners/${id}`));
const getSubject = async (id: string) =>
  ok<LegalSubject>(await client.get('getLegalSubject', `/legal-subjects/${id}`));
const getSigner = async (id: string) => ok<Signer>(await client.get('getSigner', `/signers/${id}`));

async function auditRows(entityId: string) {
  return prisma.auditEvent.findMany({
    where: { entityId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
}

/** A route row inserted directly (Route operations are not part of P2). */
async function insertRoute(agencyId: string, ownerSubjectId: string, linkState = 'LINKED') {
  const id = randomUUID();
  await prisma.route.create({
    data: {
      id,
      agencyId,
      ownerSubjectId,
      linkState: linkState as 'LINKED' | 'PAUSED' | 'UNLINKED',
      createdById: client.session.userId,
      updatedById: client.session.userId,
    },
  });
  return id;
}

describe('AGENCY', () => {
  it('AC-001: an Agency created with displayName only is a DRAFT; nothing is inferred or bound', async () => {
    const result = await client.write('createAgency', 'POST', '/agencies', {
      displayName: 'SYNTHETIC Agency A',
    });
    const { data, etag } = await created<Agency>(result);
    expect(data).toMatchObject({
      displayName: 'SYNTHETIC Agency A',
      legalName: null,
      registrationNumber: null,
      fieldAttributions: null,
      recordState: 'DRAFT',
      canonicalCode: null,
      canonicalSourceId: null,
      bindingState: 'LOCAL_ONLY',
      archivedAt: null,
      rowVersion: 1,
      createdById: client.session.userId,
      updatedById: client.session.userId,
    });
    expect(etag).toBe(`"Agency:${data.id}:v1"`);
    expect((result.json as { meta: unknown }).meta).toMatchObject({
      affectedResources: [{ type: 'Agency', id: data.id, rowVersion: 1 }],
    });
    const audit = await auditRows(data.id);
    expect(audit.map((row) => [row.action, row.actorUserId])).toEqual([
      ['AGENCY_CREATED', client.session.userId],
    ]);
    expect(audit[0]?.afterRedacted).toMatchObject({
      displayName: 'SYNTHETIC Agency A',
      recordState: 'DRAFT',
      rowVersion: 1,
    });
    // No authority, signer, route, mandate or case is created by creating an Agency.
    for (const table of ['signers', 'routes', 'mandates', 'cases', 'source_references']) {
      expect(await countRows(prisma, table), table).toBe(0);
    }
    const record = await prisma.idempotencyRecord.findFirstOrThrow();
    expect(record).toMatchObject({
      actorUserId: client.session.userId,
      operationId: 'createAgency',
      state: 'COMPLETED',
      responseStatus: 201,
      resourceType: 'Agency',
      resourceId: data.id,
    });
  });

  it('GET returns the record with its strong row-version ETag; unknown and malformed ids are 404', async () => {
    const agency = await createAgency();
    const read = await getAgency(agency.data.id);
    expect(read.etag).toBe(agency.etag);
    expect(read.data).toEqual(agency.data);
    expect((await client.get('getAgency', `/agencies/${MISSING_ID}`)).status).toBe(404);
    const malformed = await client.get('getAgency', '/agencies/not-a-uuid');
    expect([malformed.status, code(malformed)]).toEqual([404, 'NOT_FOUND']);
  });

  it('PATCH: omitted fields are preserved, explicit null clears, and a no-op changes nothing', async () => {
    const agency = await createAgency({
      legalName: 'SYNTHETIC Agency Ltd',
      phone: '+84 000 000',
      postalAddress: { city: 'Synthetic City', country: 'VN' },
    });
    const patched = await ok<Agency>(
      await client.write(
        'patchAgency',
        'PATCH',
        `/agencies/${agency.data.id}`,
        { phone: null, copyrightEmail: 'copyright@example.invalid', postalAddress: null },
        { ifMatch: agency.etag },
      ),
    );
    expect(patched.data).toMatchObject({
      legalName: 'SYNTHETIC Agency Ltd',
      phone: null,
      postalAddress: null,
      copyrightEmail: 'copyright@example.invalid',
      rowVersion: 2,
    });
    expect(patched.etag).toBe(`"Agency:${agency.data.id}:v2"`);
    const [, update] = await auditRows(agency.data.id);
    expect(update?.action).toBe('AGENCY_UPDATED');
    expect(update?.beforeRedacted).toEqual({
      phone: '+84 000 000',
      copyrightEmail: null,
      postalAddress: { city: 'Synthetic City', country: 'VN' },
      rowVersion: 1,
    });
    expect(update?.afterRedacted).toEqual({
      phone: null,
      copyrightEmail: 'copyright@example.invalid',
      postalAddress: null,
      rowVersion: 2,
    });
    // Same values again: 200, no version increment, no audit event.
    const noop = await ok<Agency>(
      await client.write(
        'patchAgency',
        'PATCH',
        `/agencies/${agency.data.id}`,
        { phone: null, legalName: 'SYNTHETIC Agency Ltd' },
        { ifMatch: patched.etag },
      ),
    );
    expect(noop.data.rowVersion).toBe(2);
    expect(await auditRows(agency.data.id)).toHaveLength(2);
  });

  it('notes are redacted in audit: only their length is recorded', async () => {
    const agency = await createAgency({ notes: 'private operator note ✓' });
    const [createdEvent] = await auditRows(agency.data.id);
    expect(createdEvent?.afterRedacted).toMatchObject({
      notes: { redacted: true, codePoints: 23 },
    });
    expect(JSON.stringify(createdEvent)).not.toContain('private operator note');
  });

  it('identity is locked once ACTIVE: identity fields cannot be set, changed or cleared; label and contact stay editable', async () => {
    const agency = await createAgency({
      legalName: 'SYNTHETIC Legal Name Ltd',
      registrationNumber: 'SYN-001',
    });
    // Before establishment, identity fields are editable.
    const draftEdit = await ok<Agency>(
      await client.write(
        'patchAgency',
        'PATCH',
        `/agencies/${agency.data.id}`,
        { legalName: 'SYNTHETIC Legal Name Ltd (corrected)' },
        { ifMatch: agency.etag },
      ),
    );
    const active = await ok<Agency>(
      await client.write(
        'setAgencyState',
        'POST',
        `/agencies/${agency.data.id}/state`,
        { state: 'ACTIVE', reason: 'synthetic activation' },
        { ifMatch: draftEdit.etag },
      ),
    );
    for (const change of [
      { legalName: 'SYNTHETIC Other Entity Ltd' },
      { legalName: null },
      { registrationNumber: 'SYN-999' },
      // R5: an identity field that is still empty cannot be filled in either.
      { jurisdictionCountry: 'VN' },
    ]) {
      const refused = await client.write(
        'patchAgency',
        'PATCH',
        `/agencies/${agency.data.id}`,
        change,
        { ifMatch: active.etag },
      );
      expect(refused.status, JSON.stringify(change)).toBe(409);
      expect(errorOf(refused)).toMatchObject({
        code: 'ESTABLISHED_IDENTITY_IMMUTABLE',
        details: { fields: Object.keys(change), establishedBy: ['ACTIVE'] },
      });
    }
    expect((await getAgency(agency.data.id)).data.legalName).toBe(
      'SYNTHETIC Legal Name Ltd (corrected)',
    );
    // Same-entity label and contact corrections are allowed.
    const edited = await ok<Agency>(
      await client.write(
        'patchAgency',
        'PATCH',
        `/agencies/${agency.data.id}`,
        {
          displayName: 'SYNTHETIC Agency (renamed label)',
          verificationEmail: 'verify@example.invalid',
        },
        { ifMatch: active.etag },
      ),
    );
    expect(edited.data).toMatchObject({
      displayName: 'SYNTHETIC Agency (renamed label)',
      verificationEmail: 'verify@example.invalid',
      jurisdictionCountry: null,
      legalName: 'SYNTHETIC Legal Name Ltd (corrected)',
    });
    // Returning to DRAFT without references or binding un-establishes it (decision D3).
    const draft = await ok<Agency>(
      await client.write(
        'setAgencyState',
        'POST',
        `/agencies/${agency.data.id}/state`,
        { state: 'DRAFT', reason: 'synthetic deactivation' },
        { ifMatch: edited.etag },
      ),
    );
    await ok<Agency>(
      await client.write(
        'patchAgency',
        'PATCH',
        `/agencies/${agency.data.id}`,
        { legalName: 'SYNTHETIC Legal Name Ltd' },
        { ifMatch: draft.etag },
      ),
    );
  });

  it('a Signer reference, a canonical binding or a scope/snapshot reference each establish a DRAFT Agency', async () => {
    const referenced = await createAgency({ legalName: 'SYNTHETIC Referenced Ltd' });
    await createSigner(referenced.data.id);
    const byReference = await client.write(
      'patchAgency',
      'PATCH',
      `/agencies/${referenced.data.id}`,
      { legalName: 'SYNTHETIC Swapped Ltd' },
      { ifMatch: referenced.etag },
    );
    expect(errorOf(byReference)).toMatchObject({
      code: 'ESTABLISHED_IDENTITY_IMMUTABLE',
      details: { establishedBy: ['REFERENCED_BY:signers.agency_id'] },
    });

    const bound = await createAgency({ legalName: 'SYNTHETIC Bound Ltd' });
    await prisma.agency.update({
      where: { id: bound.data.id },
      data: { canonicalCode: 'SYN-CANONICAL-1', bindingState: 'SOURCE_REFERENCED' },
    });
    const byBinding = await client.write(
      'patchAgency',
      'PATCH',
      `/agencies/${bound.data.id}`,
      { legalName: 'SYNTHETIC Swapped Ltd' },
      { ifMatch: bound.etag },
    );
    expect(errorOf(byBinding)).toMatchObject({
      code: 'ESTABLISHED_IDENTITY_IMMUTABLE',
      details: { establishedBy: ['CANONICAL_BINDING'] },
    });

    const scoped = await createAgency({ legalName: 'SYNTHETIC Scoped Ltd' });
    await insertSource(prisma, client.session.userId, {
      scopeBindings: { agencyIds: [scoped.data.id] },
    });
    const byScope = await client.write(
      'patchAgency',
      'PATCH',
      `/agencies/${scoped.data.id}`,
      { legalName: 'SYNTHETIC Swapped Ltd' },
      { ifMatch: scoped.etag },
    );
    expect(errorOf(byScope)).toMatchObject({
      code: 'ESTABLISHED_IDENTITY_IMMUTABLE',
      details: { establishedBy: ['SNAPSHOT_REFERENCE:source_references'] },
    });
  });

  it('state DRAFT ⇄ ACTIVE is administrative: reason audited, same state 409, no authority created', async () => {
    const agency = await createAgency();
    const active = await ok<Agency>(
      await client.write(
        'setAgencyState',
        'POST',
        `/agencies/${agency.data.id}/state`,
        { state: 'ACTIVE', reason: 'synthetic onboarding complete' },
        { ifMatch: agency.etag },
      ),
    );
    expect(active.data).toMatchObject({ recordState: 'ACTIVE', rowVersion: 2 });
    const again = await client.write(
      'setAgencyState',
      'POST',
      `/agencies/${agency.data.id}/state`,
      { state: 'ACTIVE', reason: 'again' },
      { ifMatch: active.etag },
    );
    expect([again.status, code(again)]).toEqual([409, 'RECORD_STATE_CONFLICT']);
    const events = await auditRows(agency.data.id);
    expect(events.at(-1)).toMatchObject({
      action: 'AGENCY_STATE_CHANGED',
      reason: 'synthetic onboarding complete',
      beforeRedacted: { recordState: 'DRAFT', rowVersion: 1 },
      afterRedacted: { recordState: 'ACTIVE', rowVersion: 2 },
    });
    for (const table of ['mandates', 'mandate_versions', 'mandate_coverages', 'routes']) {
      expect(await countRows(prisma, table), table).toBe(0);
    }
    // ARCHIVED is not a state-command target (contract RecordStateRequest: DRAFT | ACTIVE).
    const archivedState = await client.write(
      'setAgencyState',
      'POST',
      `/agencies/${agency.data.id}/state`,
      { state: 'ARCHIVED', reason: 'not allowed here' },
      { ifMatch: active.etag },
    );
    expect([archivedState.status, code(archivedState)]).toEqual([422, 'VALIDATION_FAILED']);
  });

  it('archive/restore keep history: archived is read-only, restore returns to DRAFT, repeats are 409', async () => {
    const agency = await createAgency();
    const archived = await ok<Agency>(
      await client.write(
        'archiveAgency',
        'POST',
        `/agencies/${agency.data.id}/archive`,
        { reason: 'synthetic duplicate record' },
        { ifMatch: agency.etag },
      ),
    );
    expect(archived.data).toMatchObject({
      recordState: 'ARCHIVED',
      archiveReason: 'synthetic duplicate record',
      rowVersion: 2,
    });
    expect(archived.data.archivedAt).toBe(new Date(t.clock.ms).toISOString());
    for (const [operationId, method, path, body] of [
      ['patchAgency', 'PATCH', '', { displayName: 'x' }],
      ['setAgencyState', 'POST', '/state', { state: 'ACTIVE', reason: 'x' }],
      ['archiveAgency', 'POST', '/archive', { reason: 'x' }],
    ] as const) {
      const refused = await client.write(
        operationId,
        method,
        `/agencies/${agency.data.id}${path}`,
        body,
        { ifMatch: archived.etag },
      );
      expect([refused.status, code(refused)], operationId).toEqual([409, 'RECORD_STATE_CONFLICT']);
    }
    const restored = await ok<Agency>(
      await client.write(
        'restoreAgency',
        'POST',
        `/agencies/${agency.data.id}/restore`,
        { reason: 'synthetic restore' },
        { ifMatch: archived.etag },
      ),
    );
    expect(restored.data).toMatchObject({
      recordState: 'DRAFT',
      archivedAt: null,
      archiveReason: null,
      rowVersion: 3,
    });
    const restoreAgain = await client.write(
      'restoreAgency',
      'POST',
      `/agencies/${agency.data.id}/restore`,
      { reason: 'x' },
      { ifMatch: restored.etag },
    );
    expect(code(restoreAgain)).toBe('RECORD_STATE_CONFLICT');
    const actions = (await auditRows(agency.data.id)).map((row) => [row.action, row.reason]);
    expect(actions).toEqual([
      ['AGENCY_CREATED', null],
      ['AGENCY_ARCHIVED', 'synthetic duplicate record'],
      ['AGENCY_RESTORED', 'synthetic restore'],
    ]);
    const restoreEvent = (await auditRows(agency.data.id)).at(-1);
    expect(restoreEvent?.beforeRedacted).toMatchObject({
      recordState: 'ARCHIVED',
      archiveReason: 'synthetic duplicate record',
    });
  });

  it('D5: only an unused, unbound DRAFT is deleted; every other Agency is refused with its blockers', async () => {
    const unused = await createAgency();
    const deleted = await client.write(
      'deleteUnusedAgency',
      'DELETE',
      `/agencies/${unused.data.id}`,
      undefined,
      { ifMatch: unused.etag },
    );
    expect([deleted.status, deleted.text, deleted.headers['etag']]).toEqual([204, '', undefined]);
    expect(await prisma.agency.findUnique({ where: { id: unused.data.id } })).toBeNull();
    expect((await auditRows(unused.data.id)).map((row) => row.action)).toEqual([
      'AGENCY_CREATED',
      'AGENCY_DELETED',
    ]);

    const active = await createAgency();
    const activated = await ok<Agency>(
      await client.write(
        'setAgencyState',
        'POST',
        `/agencies/${active.data.id}/state`,
        { state: 'ACTIVE', reason: 'x' },
        { ifMatch: active.etag },
      ),
    );
    const referenced = await createAgency();
    await createSigner(referenced.data.id);
    const bound = await createAgency();
    await prisma.agency.update({
      where: { id: bound.data.id },
      data: { canonicalCode: 'SYN-CANONICAL-2', bindingState: 'SOURCE_REFERENCED' },
    });
    const scoped = await createAgency();
    await insertSource(prisma, client.session.userId, {
      scopeBindings: { agencyIds: [scoped.data.id] },
    });
    const archivedDraft = await createAgency();
    const archived = await ok<Agency>(
      await client.write(
        'archiveAgency',
        'POST',
        `/agencies/${archivedDraft.data.id}/archive`,
        { reason: 'x' },
        { ifMatch: archivedDraft.etag },
      ),
    );
    for (const [record, etag, blockers] of [
      [active, activated.etag, ['NOT_DRAFT']],
      [referenced, referenced.etag, ['REFERENCED_BY:signers.agency_id']],
      [bound, bound.etag, ['CANONICAL_BINDING']],
      [scoped, scoped.etag, ['SNAPSHOT_REFERENCE:source_references']],
      [archivedDraft, archived.etag, ['ARCHIVED']],
    ] as const) {
      const refused = await client.write(
        'deleteUnusedAgency',
        'DELETE',
        `/agencies/${record.data.id}`,
        undefined,
        { ifMatch: etag },
      );
      expect(refused.status).toBe(409);
      expect(errorOf(refused)).toMatchObject({
        code: 'REFERENCED_RECORD_CANNOT_DELETE',
        details: { blockers },
      });
      expect(await prisma.agency.findUnique({ where: { id: record.data.id } })).not.toBeNull();
    }
  });

  it('D4 fieldAttributions: field names, DOCUMENT_REVIEWED sources and agency scope are enforced; provenance is stored verbatim', async () => {
    const agency = await createAgency();
    const otherAgency = await createAgency({ displayName: 'SYNTHETIC Other Agency' });
    const ownSource = await insertSource(prisma, client.session.userId, {
      agencyId: agency.data.id,
    });
    const otherSource = await insertSource(prisma, client.session.userId, {
      agencyId: otherAgency.data.id,
    });
    const unscoped = await insertSource(prisma, client.session.userId);
    const shared = await insertSource(prisma, client.session.userId, {
      scopeBindings: { agencyIds: [agency.data.id] },
    });
    const attribution = (overrides: Record<string, unknown>) => ({
      field: 'legalName',
      provenance: 'OPERATOR_REPORTED',
      sourceIds: [],
      scopeText: 'Synthetic attribution scope',
      ...overrides,
    });
    const patch = (fieldAttributions: unknown[]) =>
      client.write(
        'patchAgency',
        'PATCH',
        `/agencies/${agency.data.id}`,
        { fieldAttributions },
        { ifMatch: agency.etag },
      );
    const cases: Array<[unknown[], number, string, Record<string, unknown>]> = [
      [[attribution({ field: 'notes' })], 422, 'FIELD_ATTRIBUTION_INVALID', {}],
      [[attribution({ field: 'ownsAllWorks' })], 422, 'FIELD_ATTRIBUTION_INVALID', {}],
      [[attribution({ provenance: 'DOCUMENT_REVIEWED' })], 422, 'FIELD_ATTRIBUTION_INVALID', {}],
      [
        [attribution({ provenance: 'DOCUMENT_REVIEWED', sourceIds: [MISSING_ID] })],
        422,
        'REFERENCE_NOT_FOUND',
        { field: 'fieldAttributions.0.sourceIds.0' },
      ],
      [
        [attribution({ sourceIds: [otherSource] })],
        422,
        'CROSS_AGENCY_REFERENCE',
        { field: 'fieldAttributions.0.sourceIds.0' },
      ],
      [
        [attribution({ sourceIds: [unscoped] })],
        422,
        'SOURCE_SCOPE_UNRESOLVED',
        { field: 'fieldAttributions.0.sourceIds.0' },
      ],
    ];
    for (const [list, status, errorCode, details] of cases) {
      const refused = await patch(list);
      expect([refused.status, code(refused)], JSON.stringify(list)).toEqual([status, errorCode]);
      expect(errorOf(refused).details).toMatchObject(details);
    }
    expect((await getAgency(agency.data.id)).data.rowVersion).toBe(1);
    const accepted = [
      attribution({ provenance: 'DOCUMENT_REVIEWED', sourceIds: [ownSource] }),
      attribution({ field: 'registrationNumber', provenance: 'MISSING' }),
      attribution({ field: 'websiteUrl', provenance: 'CONFLICT', sourceIds: [shared] }),
      attribution({ field: 'phone', provenance: 'ANALYSIS', limitations: 'Synthetic limit' }),
    ];
    const saved = await ok<Agency>(await patch(accepted));
    expect(saved.data.fieldAttributions).toEqual(accepted);
    const [, event] = await auditRows(agency.data.id);
    expect(event?.sourceIds).toEqual([ownSource, shared]);
  });

  it('list search is case- and accent-insensitive on displayName/legalName and treats wildcards literally', async () => {
    await createAgency({ displayName: 'Công ty SYNTHETIC Nguyễn' });
    t.clock.advance(1000);
    await createAgency({ displayName: 'Other', legalName: 'SYNTHETIC 100% Owned Ltd' });
    t.clock.advance(1000);
    await createAgency({ displayName: 'Unrelated_Name' });
    const search = async (q: string) =>
      dataOf<{ items: Agency[] }>(
        await client.get('listAgencies', `/agencies?q=${encodeURIComponent(q)}`),
      ).items.map((item) => item.displayName);
    expect(await search('nguyen')).toEqual(['Công ty SYNTHETIC Nguyễn']);
    expect(await search('100%')).toEqual(['Other']);
    expect(await search('%')).toEqual(['Other']);
    expect(await search('_')).toEqual(['Unrelated_Name']);
    expect(await search('synthetic')).toEqual(['Other', 'Công ty SYNTHETIC Nguyễn']);
  });
});

describe('OWNER', () => {
  it('AC-002: an Owner exists without any LegalSubject; aliases and channels are stored verbatim, nothing inferred', async () => {
    const owner = await createOwner({
      aliases: ['SYNTHETIC Brand', 'Thương hiệu SYNTHETIC'],
      sourceChannels: [
        { platform: 'YOUTUBE', url: 'https://www.youtube.com/@synthetic-brand', channelId: null },
      ],
      contactName: 'SYNTHETIC Contact (not necessarily the rights holder)',
    });
    expect(owner.data).toMatchObject({
      recordState: 'DRAFT',
      aliases: ['SYNTHETIC Brand', 'Thương hiệu SYNTHETIC'],
      sourceChannels: [
        { platform: 'YOUTUBE', url: 'https://www.youtube.com/@synthetic-brand', channelId: null },
      ],
    });
    // No LegalSubject or association is created or inferred from the Owner's names or channel.
    expect(await countRows(prisma, 'legal_subjects')).toBe(0);
    expect(await countRows(prisma, 'owner_subjects')).toBe(0);
    const subjects = await client.get('listOwnerSubjects', `/owners/${owner.data.id}/subjects`);
    expect(dataOf(subjects)).toEqual({ items: [], nextCursor: null });
  });

  it('an Owner has no identity lock: an ACTIVE, linked Owner can still be relabelled', async () => {
    const owner = await createOwner();
    const subject = await createSubject();
    await link(owner, subject.data.id);
    const current = await getOwner(owner.data.id);
    const active = await ok<Owner>(
      await client.write(
        'setOwnerState',
        'POST',
        `/owners/${owner.data.id}/state`,
        { state: 'ACTIVE', reason: 'synthetic' },
        { ifMatch: current.etag },
      ),
    );
    const renamed = await ok<Owner>(
      await client.write(
        'patchOwner',
        'PATCH',
        `/owners/${owner.data.id}`,
        { displayName: 'SYNTHETIC Owner (renamed)', aliases: null },
        { ifMatch: active.etag },
      ),
    );
    expect(renamed.data).toMatchObject({ displayName: 'SYNTHETIC Owner (renamed)', aliases: null });
  });

  it('archiving an Owner archives only the namespace; a referenced Owner cannot be deleted', async () => {
    const owner = await createOwner();
    const subject = await createSubject();
    const association = await link(owner, subject.data.id);
    const current = await getOwner(owner.data.id);
    const refused = await client.write(
      'deleteUnusedOwner',
      'DELETE',
      `/owners/${owner.data.id}`,
      undefined,
      { ifMatch: current.etag },
    );
    expect(errorOf(refused)).toMatchObject({
      code: 'REFERENCED_RECORD_CANNOT_DELETE',
      details: { blockers: ['REFERENCED_BY:owner_subjects.owner_id'] },
    });
    await ok<Owner>(
      await client.write(
        'archiveOwner',
        'POST',
        `/owners/${owner.data.id}/archive`,
        { reason: 'synthetic brand retired' },
        { ifMatch: current.etag },
      ),
    );
    expect((await getSubject(subject.data.id)).data.recordState).toBe('DRAFT');
    const kept = await ok<OwnerSubject>(
      await client.get('getOwnerSubject', `/owner-subjects/${association.data.id}`),
    );
    expect(kept.data.linkState).toBe('LINKED');
  });

  it('an unused DRAFT Owner is deleted; ACTIVE is refused', async () => {
    const unused = await createOwner();
    const deleted = await client.write(
      'deleteUnusedOwner',
      'DELETE',
      `/owners/${unused.data.id}`,
      undefined,
      { ifMatch: unused.etag },
    );
    expect(deleted.status).toBe(204);
    const active = await createOwner();
    const activated = await ok<Owner>(
      await client.write(
        'setOwnerState',
        'POST',
        `/owners/${active.data.id}/state`,
        { state: 'ACTIVE', reason: 'x' },
        { ifMatch: active.etag },
      ),
    );
    const refused = await client.write(
      'deleteUnusedOwner',
      'DELETE',
      `/owners/${active.data.id}`,
      undefined,
      { ifMatch: activated.etag },
    );
    expect(errorOf(refused).details).toEqual({ blockers: ['NOT_DRAFT'] });
  });
});

describe('LEGAL SUBJECT', () => {
  it('INDIVIDUAL, LEGAL_ENTITY and OTHER are kept exactly; subjectType can never be patched', async () => {
    for (const subjectType of ['INDIVIDUAL', 'LEGAL_ENTITY', 'OTHER'] as const) {
      const subject = await createSubject({ subjectType, legalName: `SYNTHETIC ${subjectType}` });
      expect(subject.data).toMatchObject({
        subjectType,
        identityReviewState: 'UNREVIEWED',
        recordState: 'DRAFT',
      });
      const refused = await client.write(
        'patchLegalSubject',
        'PATCH',
        `/legal-subjects/${subject.data.id}`,
        { subjectType: 'LEGAL_ENTITY' },
        { ifMatch: subject.etag },
      );
      expect([refused.status, code(refused)]).toEqual([422, 'VALIDATION_FAILED']);
      expect((await getSubject(subject.data.id)).data.subjectType).toBe(subjectType);
    }
  });

  it('AC-005: an established (linked) subject cannot be turned into another legal entity by PATCH', async () => {
    const subject = await createSubject({
      legalName: 'SYNTHETIC Entity A LLC',
      registrationAuthority: 'SYNTHETIC Registry',
      registrationNumber: 'SYN-A-1',
    });
    const owner = await createOwner();
    await link(owner, subject.data.id);
    const current = await getSubject(subject.data.id);
    for (const change of [
      { legalName: 'SYNTHETIC Entity B LLC' },
      { registrationNumber: 'SYN-B-2' },
      { registrationAuthority: null },
      // R5: empty identity fields cannot be filled in once the subject is established.
      { legalForm: 'SYNTHETIC joint stock company' },
      { jurisdictionCountry: 'VN' },
    ]) {
      const refused = await client.write(
        'patchLegalSubject',
        'PATCH',
        `/legal-subjects/${subject.data.id}`,
        change,
        { ifMatch: current.etag },
      );
      expect(errorOf(refused)).toMatchObject({
        code: 'ESTABLISHED_IDENTITY_IMMUTABLE',
        details: {
          fields: Object.keys(change),
          establishedBy: ['REFERENCED_BY:owner_subjects.legal_subject_id'],
        },
      });
    }
    const contact = await ok<LegalSubject>(
      await client.write(
        'patchLegalSubject',
        'PATCH',
        `/legal-subjects/${subject.data.id}`,
        { contactEmail: 'legal@example.invalid' },
        { ifMatch: current.etag },
      ),
    );
    expect(contact.data).toMatchObject({
      legalName: 'SYNTHETIC Entity A LLC',
      registrationNumber: 'SYN-A-1',
      contactEmail: 'legal@example.invalid',
      legalForm: null,
      jurisdictionCountry: null,
    });
  });

  it('attributions on a subject: sources must exist and be scoped to the subject (P3A); MISSING and CONFLICT stay as recorded', async () => {
    const subject = await createSubject();
    // Since P3A a source supports a LegalSubject only when its scope names that subject.
    const source = await insertSource(prisma, client.session.userId, {
      scopeBindings: { legalSubjectIds: [subject.data.id] },
    });
    for (const [unscoped, reason] of [
      [await insertSource(prisma, client.session.userId), 'NOT_SCOPED_TO_SUBJECT'],
      [
        await insertSource(prisma, client.session.userId, {
          agencyId: (await createAgency()).data.id,
          scopeBindings: { legalSubjectIds: [subject.data.id] },
        }),
        'AGENCY_OWNED_SOURCE',
      ],
    ] as const) {
      const refused = await client.write(
        'patchLegalSubject',
        'PATCH',
        `/legal-subjects/${subject.data.id}`,
        {
          fieldAttributions: [
            {
              field: 'legalName',
              provenance: 'DOCUMENT_REVIEWED',
              sourceIds: [unscoped],
              scopeText: 'Synthetic extract',
            },
          ],
        },
        { ifMatch: subject.etag },
      );
      expect(errorOf(refused), reason).toMatchObject({
        code: 'SOURCE_SCOPE_UNRESOLVED',
        details: { field: 'fieldAttributions.0.sourceIds.0', reason },
      });
    }
    const attributions = [
      {
        field: 'legalName',
        provenance: 'DOCUMENT_REVIEWED',
        sourceIds: [source],
        scopeText: 'Synthetic registry extract',
        asOf: '2026-09-01T00:00:00Z',
      },
      { field: 'registrationNumber', provenance: 'MISSING', sourceIds: [], scopeText: 'Unknown' },
      { field: 'aliases', provenance: 'CONFLICT', sourceIds: [], scopeText: 'Two spellings' },
    ];
    const saved = await ok<LegalSubject>(
      await client.write(
        'patchLegalSubject',
        'PATCH',
        `/legal-subjects/${subject.data.id}`,
        { fieldAttributions: attributions },
        { ifMatch: subject.etag },
      ),
    );
    expect(saved.data.fieldAttributions).toEqual(attributions);
    const missing = await client.write('createLegalSubject', 'POST', '/legal-subjects', {
      subjectType: 'INDIVIDUAL',
      legalName: 'SYNTHETIC Person',
      fieldAttributions: [
        {
          field: 'legalName',
          provenance: 'OPERATOR_REPORTED',
          sourceIds: [MISSING_ID],
          scopeText: 'x',
        },
      ],
    });
    expect(errorOf(missing)).toMatchObject({
      code: 'REFERENCE_NOT_FOUND',
      details: { field: 'fieldAttributions.0.sourceIds.0' },
    });
  });

  it('delete: an unused DRAFT subject is deleted; a linked one is refused', async () => {
    const unused = await createSubject();
    expect(
      (
        await client.write(
          'deleteUnusedLegalSubject',
          'DELETE',
          `/legal-subjects/${unused.data.id}`,
          undefined,
          { ifMatch: unused.etag },
        )
      ).status,
    ).toBe(204);
    const linked = await createSubject();
    await link(await createOwner(), linked.data.id);
    const refused = await client.write(
      'deleteUnusedLegalSubject',
      'DELETE',
      `/legal-subjects/${linked.data.id}`,
      undefined,
      { ifMatch: linked.etag },
    );
    expect(errorOf(refused)).toMatchObject({
      code: 'REFERENCED_RECORD_CANNOT_DELETE',
      details: { blockers: ['REFERENCED_BY:owner_subjects.legal_subject_id'] },
    });
  });
});

describe('IDENTITY LOCK (R5): an empty identity field of an established record is locked too', () => {
  /** Makes a record established one way; returns the reason the server must report. */
  interface Establisher {
    readonly reason: string;
    readonly establish: (id: string, etag: string) => Promise<void>;
  }

  async function bindCanonically(table: 'agency' | 'legalSubject', id: string): Promise<void> {
    // The canonical-binding operations are deferred (D2), so the binding is a test fixture: a
    // synthetic source referenced directly in tb_notice_test.
    const source = await insertSource(prisma, client.session.userId);
    const data = {
      canonicalCode: `SYN-CANONICAL-${id.slice(0, 8)}`,
      canonicalSourceId: source,
      bindingState: 'SOURCE_REFERENCED' as const,
    };
    if (table === 'agency') await prisma.agency.update({ where: { id }, data });
    else await prisma.legalSubject.update({ where: { id }, data });
  }

  const agencyEstablishers: readonly Establisher[] = [
    {
      reason: 'ACTIVE',
      establish: async (id, etag) => {
        await ok<Agency>(
          await client.write(
            'setAgencyState',
            'POST',
            `/agencies/${id}/state`,
            { state: 'ACTIVE', reason: 'synthetic activation' },
            { ifMatch: etag },
          ),
        );
      },
    },
    {
      reason: 'REFERENCED_BY:signers.agency_id',
      establish: async (id) => {
        await createSigner(id);
      },
    },
    { reason: 'CANONICAL_BINDING', establish: (id) => bindCanonically('agency', id) },
    {
      reason: 'SNAPSHOT_REFERENCE:source_references',
      establish: async (id) => {
        await insertSource(prisma, client.session.userId, { scopeBindings: { agencyIds: [id] } });
      },
    },
  ];

  const subjectEstablishers: readonly Establisher[] = [
    {
      reason: 'ACTIVE',
      establish: async (id, etag) => {
        await ok<LegalSubject>(
          await client.write(
            'setLegalSubjectState',
            'POST',
            `/legal-subjects/${id}/state`,
            { state: 'ACTIVE', reason: 'synthetic activation' },
            { ifMatch: etag },
          ),
        );
      },
    },
    {
      reason: 'REFERENCED_BY:owner_subjects.legal_subject_id',
      establish: async (id) => {
        await link(await createOwner(), id);
      },
    },
    { reason: 'CANONICAL_BINDING', establish: (id) => bindCanonically('legalSubject', id) },
    {
      reason: 'SNAPSHOT_REFERENCE:source_references',
      establish: async (id) => {
        await insertSource(prisma, client.session.userId, {
          scopeBindings: { legalSubjectIds: [id] },
        });
      },
    },
  ];

  it('a DRAFT, unreferenced, unbound Agency or LegalSubject may fill initially empty identity fields', async () => {
    const agency = await createAgency();
    expect(agency.data).toMatchObject({ legalName: null, registrationNumber: null });
    const agencyFill = {
      legalName: 'SYNTHETIC Filled Agency Ltd',
      organizationType: 'SYNTHETIC limited liability company',
      jurisdictionCountry: 'VN',
      registrationAuthority: 'SYNTHETIC Registry',
      registrationNumber: 'SYN-FILL-A1',
    };
    const filledAgency = await ok<Agency>(
      await client.write('patchAgency', 'PATCH', `/agencies/${agency.data.id}`, agencyFill, {
        ifMatch: agency.etag,
      }),
    );
    expect(filledAgency.data).toMatchObject({ ...agencyFill, recordState: 'DRAFT', rowVersion: 2 });

    const subject = await createSubject();
    const subjectFill = {
      legalForm: 'SYNTHETIC joint stock company',
      jurisdictionCountry: 'VN',
      registrationAuthority: 'SYNTHETIC Registry',
      registrationNumber: 'SYN-FILL-S1',
    };
    const filledSubject = await ok<LegalSubject>(
      await client.write(
        'patchLegalSubject',
        'PATCH',
        `/legal-subjects/${subject.data.id}`,
        subjectFill,
        { ifMatch: subject.etag },
      ),
    );
    expect(filledSubject.data).toMatchObject({
      ...subjectFill,
      recordState: 'DRAFT',
      rowVersion: 2,
    });
  });

  for (const { reason, establish } of agencyEstablishers) {
    it(`Agency established by ${reason}: an empty identity field cannot be filled; nothing is written; contact stays editable`, async () => {
      const agency = await createAgency({ legalName: 'SYNTHETIC Established Agency Ltd' });
      await establish(agency.data.id, agency.etag);
      const before = await getAgency(agency.data.id);
      expect(before.data.registrationNumber).toBeNull();
      const auditBefore = (await auditRows(agency.data.id)).length;
      const keysBefore = await prisma.idempotencyRecord.count();

      for (const change of [
        { registrationNumber: 'SYN-FILL-X1' },
        { organizationType: 'SYNTHETIC limited liability company', phone: '+84 28 0000 0001' },
      ]) {
        const refused = await client.write(
          'patchAgency',
          'PATCH',
          `/agencies/${agency.data.id}`,
          change,
          { ifMatch: before.etag },
        );
        expect(refused.status, JSON.stringify(change)).toBe(409);
        expect(errorOf(refused)).toMatchObject({
          code: 'ESTABLISHED_IDENTITY_IMMUTABLE',
          details: {
            fields: Object.keys(change).filter((field) => field !== 'phone'),
            establishedBy: [reason],
          },
        });
      }
      // The refusal changed nothing: same record, same version and ETag, no audit event, and no
      // idempotency record kept for the refused requests.
      const after = await getAgency(agency.data.id);
      expect(after.etag).toBe(before.etag);
      expect(after.data).toEqual(before.data);
      expect(await auditRows(agency.data.id)).toHaveLength(auditBefore);
      expect(await prisma.idempotencyRecord.count()).toBe(keysBefore);

      const contact = await ok<Agency>(
        await client.write(
          'patchAgency',
          'PATCH',
          `/agencies/${agency.data.id}`,
          { phone: '+84 28 0000 0002', copyrightEmail: 'copyright@example.invalid' },
          { ifMatch: before.etag },
        ),
      );
      expect(contact.data).toMatchObject({
        phone: '+84 28 0000 0002',
        copyrightEmail: 'copyright@example.invalid',
        registrationNumber: null,
        organizationType: null,
        rowVersion: before.data.rowVersion + 1,
      });
    });
  }

  for (const { reason, establish } of subjectEstablishers) {
    it(`LegalSubject established by ${reason}: an empty identity field cannot be filled; nothing is written; contact stays editable`, async () => {
      const subject = await createSubject({ legalName: 'SYNTHETIC Established Subject LLC' });
      await establish(subject.data.id, subject.etag);
      const before = await getSubject(subject.data.id);
      expect(before.data.legalForm).toBeNull();
      const auditBefore = (await auditRows(subject.data.id)).length;
      const keysBefore = await prisma.idempotencyRecord.count();

      for (const change of [
        { legalForm: 'SYNTHETIC joint stock company' },
        { registrationNumber: 'SYN-FILL-X2', contactEmail: 'subject@example.invalid' },
      ]) {
        const refused = await client.write(
          'patchLegalSubject',
          'PATCH',
          `/legal-subjects/${subject.data.id}`,
          change,
          { ifMatch: before.etag },
        );
        expect(refused.status, JSON.stringify(change)).toBe(409);
        expect(errorOf(refused)).toMatchObject({
          code: 'ESTABLISHED_IDENTITY_IMMUTABLE',
          details: {
            fields: Object.keys(change).filter((field) => field !== 'contactEmail'),
            establishedBy: [reason],
          },
        });
      }
      const after = await getSubject(subject.data.id);
      expect(after.etag).toBe(before.etag);
      expect(after.data).toEqual(before.data);
      expect(await auditRows(subject.data.id)).toHaveLength(auditBefore);
      expect(await prisma.idempotencyRecord.count()).toBe(keysBefore);

      const contact = await ok<LegalSubject>(
        await client.write(
          'patchLegalSubject',
          'PATCH',
          `/legal-subjects/${subject.data.id}`,
          { contactEmail: 'subject@example.invalid' },
          { ifMatch: before.etag },
        ),
      );
      expect(contact.data).toMatchObject({
        contactEmail: 'subject@example.invalid',
        legalForm: null,
        registrationNumber: null,
        rowVersion: before.data.rowVersion + 1,
      });
    });
  }
});

describe('OWNER SUBJECT', () => {
  it('link: 201 with the association ETag, the Owner version moves once, and a second link of the pair is 409', async () => {
    const owner = await createOwner();
    const subject = await createSubject();
    const result = await client.write(
      'linkOwnerSubject',
      'POST',
      `/owners/${owner.data.id}/subjects`,
      { legalSubjectId: subject.data.id, relationshipLabel: 'brand operated by' },
      { ifMatch: owner.etag },
    );
    const association = await created<OwnerSubject>(result);
    expect(association.data).toMatchObject({
      ownerId: owner.data.id,
      legalSubjectId: subject.data.id,
      relationshipLabel: 'brand operated by',
      sourceId: null,
      linkState: 'LINKED',
      unlinkedAt: null,
      rowVersion: 1,
    });
    expect(association.etag).toBe(`"OwnerSubject:${association.data.id}:v1"`);
    expect((result.json as { meta: unknown }).meta).toMatchObject({
      affectedResources: [
        { type: 'Owner', id: owner.data.id, rowVersion: 2 },
        { type: 'OwnerSubject', id: association.data.id, rowVersion: 1 },
      ],
    });
    const ownerNow = await getOwner(owner.data.id);
    expect(ownerNow.data.rowVersion).toBe(2);
    const duplicate = await client.write(
      'linkOwnerSubject',
      'POST',
      `/owners/${owner.data.id}/subjects`,
      { legalSubjectId: subject.data.id },
      { ifMatch: ownerNow.etag },
    );
    expect(errorOf(duplicate)).toEqual({
      code: 'DUPLICATE_OWNER_SUBJECT',
      message: expect.any(String),
      details: { ownerSubjectId: association.data.id },
      requestId: expect.any(String),
    });
    expect(await countRows(prisma, 'owner_subjects')).toBe(1);
    // Linking creates no authority, route or mandate.
    for (const table of ['routes', 'mandates', 'mandate_coverages', 'coverage_signers']) {
      expect(await countRows(prisma, table), table).toBe(0);
    }
  });

  it('link needs the Owner ETag (428/412), an existing subject (422) and an existing Owner (404)', async () => {
    const owner = await createOwner();
    const subject = await createSubject();
    const path = `/owners/${owner.data.id}/subjects`;
    const body = { legalSubjectId: subject.data.id };
    const missing = await client.write('linkOwnerSubject', 'POST', path, body);
    expect([missing.status, code(missing)]).toEqual([428, 'PRECONDITION_REQUIRED']);
    const stale = await client.write('linkOwnerSubject', 'POST', path, body, {
      ifMatch: staleEtag('Owner', owner.data.id),
    });
    expect([stale.status, code(stale)]).toEqual([412, 'RECORD_VERSION_CONFLICT']);
    const wrongTarget = await client.write('linkOwnerSubject', 'POST', path, body, {
      ifMatch: subject.etag,
    });
    expect(wrongTarget.status).toBe(412);
    const noSubject = await client.write(
      'linkOwnerSubject',
      'POST',
      path,
      { legalSubjectId: MISSING_ID },
      { ifMatch: owner.etag },
    );
    expect(errorOf(noSubject)).toMatchObject({
      code: 'REFERENCE_NOT_FOUND',
      details: { field: 'legalSubjectId' },
    });
    const noOwner = await client.write(
      'linkOwnerSubject',
      'POST',
      `/owners/${MISSING_ID}/subjects`,
      body,
      { ifMatch: owner.etag },
    );
    expect(noOwner.status).toBe(404);
    const badSource = await client.write(
      'linkOwnerSubject',
      'POST',
      path,
      { ...body, sourceId: MISSING_ID },
      { ifMatch: owner.etag },
    );
    expect(errorOf(badSource)).toMatchObject({
      code: 'REFERENCE_NOT_FOUND',
      details: { field: 'sourceId' },
    });
    expect(await countRows(prisma, 'owner_subjects')).toBe(0);
  });

  it('AC-003: one legal entity operating two owner brands is one subject with two associations', async () => {
    const entity = await createSubject({ legalName: 'SYNTHETIC Media Group JSC' });
    const brandA = await createOwner({ displayName: 'SYNTHETIC Brand A' });
    const brandB = await createOwner({ displayName: 'SYNTHETIC Brand B' });
    const a = await link(brandA, entity.data.id);
    const b = await link(brandB, entity.data.id);
    expect(a.data.legalSubjectId).toBe(entity.data.id);
    expect(b.data.legalSubjectId).toBe(entity.data.id);
    expect(await countRows(prisma, 'legal_subjects')).toBe(1);
    expect(await countRows(prisma, 'owner_subjects')).toBe(2);
  });

  it('AC-004: an individual and an LLC sharing a brand stay two subjects; nothing is merged', async () => {
    const brand = await createOwner({ displayName: 'SYNTHETIC Shared Brand' });
    const person = await createSubject({
      subjectType: 'INDIVIDUAL',
      legalName: 'SYNTHETIC Nguyễn Văn A',
    });
    const llc = await createSubject({
      subjectType: 'LEGAL_ENTITY',
      legalName: 'SYNTHETIC Nguyễn Văn A LLC',
    });
    await link(brand, person.data.id, { relationshipLabel: 'creator' });
    const current = await getOwner(brand.data.id);
    await link(current, llc.data.id, { relationshipLabel: 'company' });
    const page = dataOf<{ items: OwnerSubject[] }>(
      await client.get('listOwnerSubjects', `/owners/${brand.data.id}/subjects`),
    );
    expect(page.items.map((item) => item.legalSubjectId).sort()).toEqual(
      [person.data.id, llc.data.id].sort(),
    );
    expect((await getSubject(person.data.id)).data.subjectType).toBe('INDIVIDUAL');
    expect((await getSubject(llc.data.id)).data.subjectType).toBe('LEGAL_ENTITY');
  });

  it('link-state: pause, unlink and relink keep the row and record every prior state in the audit trail', async () => {
    const owner = await createOwner();
    const subject = await createSubject();
    const association = await link(owner, subject.data.id);
    const setState = (state: string, reason: string, ifMatch: string) =>
      client.write(
        'setOwnerSubjectLinkState',
        'POST',
        `/owner-subjects/${association.data.id}/link-state`,
        { state, reason },
        { ifMatch },
      );
    const paused = await ok<OwnerSubject>(
      await setState('PAUSED', 'synthetic pause', association.etag),
    );
    expect(paused.data).toMatchObject({ linkState: 'PAUSED', unlinkedAt: null, rowVersion: 2 });
    const unlinked = await ok<OwnerSubject>(
      await setState('UNLINKED', 'synthetic end', paused.etag),
    );
    expect(unlinked.data).toMatchObject({
      linkState: 'UNLINKED',
      unlinkReason: 'synthetic end',
      unlinkedAt: new Date(t.clock.ms).toISOString(),
    });
    const again = await setState('UNLINKED', 'again', unlinked.etag);
    expect(code(again)).toBe('RECORD_STATE_CONFLICT');
    const relinked = await ok<OwnerSubject>(
      await setState('LINKED', 'synthetic relink', unlinked.etag),
    );
    expect(relinked.data).toMatchObject({
      linkState: 'LINKED',
      unlinkedAt: null,
      unlinkReason: null,
    });
    expect(await countRows(prisma, 'owner_subjects')).toBe(1);
    const events = await auditRows(association.data.id);
    expect(events.map((event) => [event.action, event.reason])).toEqual([
      ['OWNER_SUBJECT_LINKED', null],
      ['OWNER_SUBJECT_LINK_STATE_CHANGED', 'synthetic pause'],
      ['OWNER_SUBJECT_LINK_STATE_CHANGED', 'synthetic end'],
      ['OWNER_SUBJECT_LINK_STATE_CHANGED', 'synthetic relink'],
    ]);
    // The relink event still carries the unlink facts it replaced.
    expect(events.at(-1)?.beforeRedacted).toMatchObject({
      linkState: 'UNLINKED',
      unlinkReason: 'synthetic end',
    });
  });

  it('AC-011: unlink is refused while a dependent route is LINKED or PAUSED; no cascade', async () => {
    const agency = await createAgency();
    const owner = await createOwner();
    const subject = await createSubject();
    const association = await link(owner, subject.data.id);
    const routeId = await insertRoute(agency.data.id, association.data.id, 'PAUSED');
    const refused = await client.write(
      'setOwnerSubjectLinkState',
      'POST',
      `/owner-subjects/${association.data.id}/link-state`,
      { state: 'UNLINKED', reason: 'synthetic' },
      { ifMatch: association.etag },
    );
    expect(errorOf(refused)).toMatchObject({
      code: 'DEPENDENT_ROUTES_LINKED',
      details: { routes: 1 },
    });
    expect((await prisma.route.findUniqueOrThrow({ where: { id: routeId } })).linkState).toBe(
      'PAUSED',
    );
    await prisma.route.update({ where: { id: routeId }, data: { linkState: 'UNLINKED' } });
    const allowed = await client.write(
      'setOwnerSubjectLinkState',
      'POST',
      `/owner-subjects/${association.data.id}/link-state`,
      { state: 'UNLINKED', reason: 'synthetic' },
      { ifMatch: association.etag },
    );
    expect(allowed.status).toBe(200);
    expect(await prisma.route.findUnique({ where: { id: routeId } })).not.toBeNull();
  });

  it('archived parties cannot be linked or relinked; pausing and unlinking stay possible', async () => {
    const owner = await createOwner();
    const subject = await createSubject();
    const association = await link(owner, subject.data.id);
    const subjectNow = await getSubject(subject.data.id);
    await ok<LegalSubject>(
      await client.write(
        'archiveLegalSubject',
        'POST',
        `/legal-subjects/${subject.data.id}/archive`,
        { reason: 'synthetic' },
        { ifMatch: subjectNow.etag },
      ),
    );
    const other = await createOwner();
    const linkArchived = await client.write(
      'linkOwnerSubject',
      'POST',
      `/owners/${other.data.id}/subjects`,
      { legalSubjectId: subject.data.id },
      { ifMatch: other.etag },
    );
    expect(errorOf(linkArchived)).toMatchObject({
      code: 'RECORD_STATE_CONFLICT',
      details: { record: 'LegalSubject', state: 'ARCHIVED' },
    });
    const paused = await ok<OwnerSubject>(
      await client.write(
        'setOwnerSubjectLinkState',
        'POST',
        `/owner-subjects/${association.data.id}/link-state`,
        { state: 'PAUSED', reason: 'synthetic' },
        { ifMatch: association.etag },
      ),
    );
    const relink = await client.write(
      'setOwnerSubjectLinkState',
      'POST',
      `/owner-subjects/${association.data.id}/link-state`,
      { state: 'LINKED', reason: 'synthetic' },
      { ifMatch: paused.etag },
    );
    expect(errorOf(relink)).toMatchObject({
      code: 'RECORD_STATE_CONFLICT',
      details: { record: 'LegalSubject', state: 'ARCHIVED' },
    });
  });

  it.each(['Owner', 'LegalSubject'] as const)(
    'R5 closeout rule, archived %s: no new link, no relink from PAUSED or UNLINKED; PAUSE and UNLINK stay allowed; rows are kept',
    async (archived) => {
      // Two associations share the party that gets archived: one is paused, the other unlinked.
      const owners = [await createOwner(), await createOwner()];
      const subjects = [await createSubject(), await createSubject()];
      const pairs: Array<[Created<Owner>, string]> =
        archived === 'Owner'
          ? [
              [owners[0]!, subjects[0]!.data.id],
              [owners[0]!, subjects[1]!.data.id],
            ]
          : [
              [owners[0]!, subjects[0]!.data.id],
              [owners[1]!, subjects[0]!.data.id],
            ];
      const associations: Array<Created<OwnerSubject>> = [];
      for (const [owner, subjectId] of pairs) {
        associations.push(await link(await getOwner(owner.data.id), subjectId));
      }
      const [paused, unlinked] = associations as [Created<OwnerSubject>, Created<OwnerSubject>];
      const partyId = archived === 'Owner' ? owners[0]!.data.id : subjects[0]!.data.id;
      const party = archived === 'Owner' ? await getOwner(partyId) : await getSubject(partyId);
      const archivedParty = await ok<Owner | LegalSubject>(
        await client.write(
          archived === 'Owner' ? 'archiveOwner' : 'archiveLegalSubject',
          'POST',
          `/${archived === 'Owner' ? 'owners' : 'legal-subjects'}/${partyId}/archive`,
          { reason: 'synthetic' },
          { ifMatch: party.etag },
        ),
      );
      const conflict = {
        code: 'RECORD_STATE_CONFLICT',
        details: { record: archived, state: 'ARCHIVED' },
      };

      // A new link to or from the archived party is refused.
      const newLink =
        archived === 'Owner'
          ? await client.write(
              'linkOwnerSubject',
              'POST',
              `/owners/${partyId}/subjects`,
              { legalSubjectId: (await createSubject()).data.id },
              { ifMatch: archivedParty.etag },
            )
          : await (async () => {
              const other = await createOwner();
              return client.write(
                'linkOwnerSubject',
                'POST',
                `/owners/${other.data.id}/subjects`,
                { legalSubjectId: partyId },
                { ifMatch: other.etag },
              );
            })();
      expect(errorOf(newLink)).toMatchObject(conflict);

      // PAUSE and UNLINK reduce or close the relationship: allowed.
      const setLinkState = (association: Created<OwnerSubject>, state: string) =>
        client.write(
          'setOwnerSubjectLinkState',
          'POST',
          `/owner-subjects/${association.data.id}/link-state`,
          { state, reason: 'synthetic' },
          { ifMatch: association.etag },
        );
      const pausedNow = await ok<OwnerSubject>(await setLinkState(paused, 'PAUSED'));
      const unlinkedNow = await ok<OwnerSubject>(await setLinkState(unlinked, 'UNLINKED'));
      expect(unlinkedNow.data.unlinkedAt).not.toBeNull();

      // Relinking either one would reactivate the archived party: refused, nothing written.
      for (const association of [pausedNow, unlinkedNow]) {
        expect(errorOf(await setLinkState(association, 'LINKED'))).toMatchObject(conflict);
      }
      const rows = await prisma.ownerSubject.findMany({
        where: { id: { in: [paused.data.id, unlinked.data.id] } },
      });
      const kept = new Map(rows.map((row) => [row.id, [row.linkState, row.rowVersion]]));
      expect(kept.get(paused.data.id)).toEqual(['PAUSED', pausedNow.data.rowVersion]);
      expect(kept.get(unlinked.data.id)).toEqual(['UNLINKED', unlinkedNow.data.rowVersion]);
      // The archived party itself is untouched by the link-state changes.
      const partyNow = archived === 'Owner' ? await getOwner(partyId) : await getSubject(partyId);
      expect(partyNow.etag).toBe(archivedParty.etag);
      expect(partyNow.data.recordState).toBe('ARCHIVED');
    },
  );

  it('listOwnerSubjects is scoped to one Owner, searches label or subject name, and 404s an unknown Owner', async () => {
    const owner = await createOwner();
    const otherOwner = await createOwner();
    const alpha = await createSubject({ legalName: 'SYNTHETIC Alpha Holdings' });
    const beta = await createSubject({ legalName: 'SYNTHETIC Beta Studio' });
    await link(owner, alpha.data.id, { relationshipLabel: 'parent company' });
    t.clock.advance(1000);
    await link(await getOwner(owner.data.id), beta.data.id, { relationshipLabel: 'licensor' });
    await link(otherOwner, alpha.data.id);
    const list = async (query = '') =>
      dataOf<{ items: OwnerSubject[] }>(
        await client.get('listOwnerSubjects', `/owners/${owner.data.id}/subjects${query}`),
      ).items.map((item) => item.legalSubjectId);
    expect(await list()).toEqual([beta.data.id, alpha.data.id]);
    expect(await list('?q=ALPHA')).toEqual([alpha.data.id]);
    expect(await list('?q=licensor')).toEqual([beta.data.id]);
    const unknown = await client.get('listOwnerSubjects', `/owners/${MISSING_ID}/subjects`);
    expect(unknown.status).toBe(404);
  });
});

describe('SIGNER', () => {
  it('a Signer is a DRAFT capacity record in one existing Agency; it is not a User and grants nothing', async () => {
    const agency = await createAgency();
    const usersBefore = await prisma.user.findMany({ orderBy: { id: 'asc' } });
    const signer = await createSigner(agency.data.id, { title: 'SYNTHETIC Director' });
    expect(signer.data).toMatchObject({
      agencyId: agency.data.id,
      operationalState: 'DRAFT',
      identitySourceId: null,
      delegationSourceId: null,
      bindingState: 'LOCAL_ONLY',
      rowVersion: 1,
    });
    expect(await prisma.user.findMany({ orderBy: { id: 'asc' } })).toEqual(usersBefore);
    for (const table of ['coverage_signers', 'case_authority_selections', 'routes']) {
      expect(await countRows(prisma, table), table).toBe(0);
    }
    const unknownAgency = await client.write('createSigner', 'POST', '/signers', {
      agencyId: MISSING_ID,
      fullLegalName: 'SYNTHETIC Nobody',
    });
    expect(errorOf(unknownAgency)).toMatchObject({
      code: 'REFERENCE_NOT_FOUND',
      details: { field: 'agencyId' },
    });
    const archived = await createAgency();
    await client.write(
      'archiveAgency',
      'POST',
      `/agencies/${archived.data.id}/archive`,
      { reason: 'synthetic' },
      { ifMatch: archived.etag },
    );
    const inArchived = await client.write('createSigner', 'POST', '/signers', {
      agencyId: archived.data.id,
      fullLegalName: 'SYNTHETIC Late Signer',
    });
    expect(errorOf(inArchived)).toMatchObject({
      code: 'RECORD_STATE_CONFLICT',
      details: { record: 'Agency', state: 'ARCHIVED' },
    });
  });

  it('AC-006: a Signer cannot be moved to another Agency; the original capacity record is preserved', async () => {
    const agencyA = await createAgency({ displayName: 'SYNTHETIC Agency A' });
    const agencyB = await createAgency({ displayName: 'SYNTHETIC Agency B' });
    const signer = await createSigner(agencyA.data.id);
    const moved = await client.write(
      'patchSigner',
      'PATCH',
      `/signers/${signer.data.id}`,
      { agencyId: agencyB.data.id },
      { ifMatch: signer.etag },
    );
    expect([moved.status, code(moved)]).toEqual([422, 'VALIDATION_FAILED']);
    const mixed = await client.write(
      'patchSigner',
      'PATCH',
      `/signers/${signer.data.id}`,
      { agencyId: agencyB.data.id, title: 'SYNTHETIC Title' },
      { ifMatch: signer.etag },
    );
    expect(mixed.status).toBe(422);
    const now = await getSigner(signer.data.id);
    expect(now.data).toEqual(signer.data);
  });

  it('identity/delegation sources must exist and belong to the Signer’s Agency (or be explicitly scoped to it)', async () => {
    const agency = await createAgency();
    const other = await createAgency({ displayName: 'SYNTHETIC Other' });
    const own = await insertSource(prisma, client.session.userId, { agencyId: agency.data.id });
    const foreign = await insertSource(prisma, client.session.userId, { agencyId: other.data.id });
    const unscoped = await insertSource(prisma, client.session.userId);
    const shared = await insertSource(prisma, client.session.userId, {
      scopeBindings: { agencyIds: [agency.data.id] },
    });
    for (const [body, errorCode, field] of [
      [{ identitySourceId: MISSING_ID }, 'REFERENCE_NOT_FOUND', 'identitySourceId'],
      [{ delegationSourceId: foreign }, 'CROSS_AGENCY_REFERENCE', 'delegationSourceId'],
      [{ identitySourceId: unscoped }, 'SOURCE_SCOPE_UNRESOLVED', 'identitySourceId'],
    ] as const) {
      const refused = await client.write('createSigner', 'POST', '/signers', {
        agencyId: agency.data.id,
        fullLegalName: 'SYNTHETIC Signer',
        ...body,
      });
      expect([refused.status, errorOf(refused).code, errorOf(refused).details['field']]).toEqual([
        422,
        errorCode,
        field,
      ]);
    }
    expect(await countRows(prisma, 'signers')).toBe(0);
    const signer = await createSigner(agency.data.id, {
      identitySourceId: own,
      delegationSourceId: shared,
    });
    expect(signer.data).toMatchObject({ identitySourceId: own, delegationSourceId: shared });
    const [event] = await auditRows(signer.data.id);
    expect(event?.sourceIds).toEqual([own, shared]);
    const patchForeign = await client.write(
      'patchSigner',
      'PATCH',
      `/signers/${signer.data.id}`,
      { identitySourceId: foreign },
      { ifMatch: signer.etag },
    );
    expect(code(patchForeign)).toBe('CROSS_AGENCY_REFERENCE');
  });

  it('operational state changes need a reason; archive/restore leave the operational state alone', async () => {
    const agency = await createAgency();
    const signer = await createSigner(agency.data.id);
    const setState = (state: string, ifMatch: string) =>
      client.write(
        'setSignerState',
        'POST',
        `/signers/${signer.data.id}/state`,
        { state, reason: `synthetic ${state}` },
        { ifMatch },
      );
    const available = await ok<Signer>(await setState('AVAILABLE', signer.etag));
    expect(available.data.operationalState).toBe('AVAILABLE');
    // AVAILABLE is administrative (R5 interpretation C): no coverage, eligibility or authority.
    for (const table of [
      'mandates',
      'mandate_coverages',
      'coverage_signers',
      'case_authority_selections',
    ]) {
      expect(await countRows(prisma, table), table).toBe(0);
    }
    expect(code(await setState('AVAILABLE', available.etag))).toBe('RECORD_STATE_CONFLICT');
    const archived = await ok<Signer>(
      await client.write(
        'archiveSigner',
        'POST',
        `/signers/${signer.data.id}/archive`,
        { reason: 'synthetic left the agency' },
        { ifMatch: available.etag },
      ),
    );
    expect(archived.data).toMatchObject({
      operationalState: 'AVAILABLE',
      archiveReason: 'synthetic left the agency',
    });
    expect(code(await setState('PAUSED', archived.etag))).toBe('RECORD_STATE_CONFLICT');
    const patchArchived = await client.write(
      'patchSigner',
      'PATCH',
      `/signers/${signer.data.id}`,
      { title: 'x' },
      { ifMatch: archived.etag },
    );
    expect(code(patchArchived)).toBe('RECORD_STATE_CONFLICT');
    const restored = await ok<Signer>(
      await client.write(
        'restoreSigner',
        'POST',
        `/signers/${signer.data.id}/restore`,
        { reason: 'synthetic' },
        { ifMatch: archived.etag },
      ),
    );
    expect(restored.data).toMatchObject({ operationalState: 'AVAILABLE', archivedAt: null });
    const ended = await ok<Signer>(await setState('ENDED', restored.etag));
    expect(ended.data.operationalState).toBe('ENDED');
  });

  it('delete: only an unused, unarchived DRAFT Signer; route default use and state block it', async () => {
    const agency = await createAgency();
    const unused = await createSigner(agency.data.id);
    const deleted = await client.write(
      'deleteUnusedSigner',
      'DELETE',
      `/signers/${unused.data.id}`,
      undefined,
      { ifMatch: unused.etag },
    );
    expect(deleted.status).toBe(204);
    const used = await createSigner(agency.data.id);
    const owner = await createOwner();
    const association = await link(owner, (await createSubject()).data.id);
    const routeId = await insertRoute(agency.data.id, association.data.id);
    await prisma.route.update({ where: { id: routeId }, data: { defaultSignerId: used.data.id } });
    const available = await createSigner(agency.data.id);
    const availableNow = await ok<Signer>(
      await client.write(
        'setSignerState',
        'POST',
        `/signers/${available.data.id}/state`,
        { state: 'AVAILABLE', reason: 'x' },
        { ifMatch: available.etag },
      ),
    );
    for (const [id, etag, blockers] of [
      [used.data.id, used.etag, ['REFERENCED_BY:routes.default_signer_id']],
      [available.data.id, availableNow.etag, ['NOT_DRAFT']],
    ] as const) {
      const refused = await client.write(
        'deleteUnusedSigner',
        'DELETE',
        `/signers/${id}`,
        undefined,
        {
          ifMatch: etag,
        },
      );
      expect(errorOf(refused)).toMatchObject({
        code: 'REFERENCED_RECORD_CANNOT_DELETE',
        details: { blockers },
      });
    }
  });

  it('listSigners filters by agencyId and searches name or title', async () => {
    const agencyA = await createAgency();
    const agencyB = await createAgency();
    await createSigner(agencyA.data.id, {
      fullLegalName: 'SYNTHETIC Trần Thị B',
      title: 'Giám đốc',
    });
    t.clock.advance(1000);
    await createSigner(agencyB.data.id, { fullLegalName: 'SYNTHETIC Lê Văn C' });
    const names = async (query: string) =>
      dataOf<{ items: Signer[] }>(await client.get('listSigners', `/signers${query}`)).items.map(
        (item) => item.fullLegalName,
      );
    expect(await names('')).toEqual(['SYNTHETIC Lê Văn C', 'SYNTHETIC Trần Thị B']);
    expect(await names(`?agencyId=${agencyA.data.id}`)).toEqual(['SYNTHETIC Trần Thị B']);
    expect(await names('?q=tran')).toEqual(['SYNTHETIC Trần Thị B']);
    expect(await names(`?agencyId=${agencyB.data.id}&q=giam`)).toEqual([]);
    expect(await names(`?agencyId=${MISSING_ID}`)).toEqual([]);
  });
});

describe('ETAG / CONCURRENCY', () => {
  it('AC-055 two tabs: both read v1, the first write wins, the second gets 412 and nothing is overwritten', async () => {
    const agency = await createAgency({ phone: '+84 1' });
    const tabA = await getAgency(agency.data.id);
    const tabB = await getAgency(agency.data.id);
    expect(tabA.etag).toBe(tabB.etag);
    const first = await client.write(
      'patchAgency',
      'PATCH',
      `/agencies/${agency.data.id}`,
      { phone: '+84 tab A' },
      { ifMatch: tabA.etag },
    );
    expect(first.status).toBe(200);
    const second = await client.write(
      'patchAgency',
      'PATCH',
      `/agencies/${agency.data.id}`,
      { phone: '+84 tab B' },
      { ifMatch: tabB.etag },
    );
    expect([second.status, code(second)]).toEqual([412, 'RECORD_VERSION_CONFLICT']);
    const final = await getAgency(agency.data.id);
    expect(final.data).toMatchObject({ phone: '+84 tab A', rowVersion: 2 });
    expect((await auditRows(agency.data.id)).map((row) => row.action)).toEqual([
      'AGENCY_CREATED',
      'AGENCY_UPDATED',
    ]);
  });

  it('every conditional directory operation: missing If-Match → 428, stale/weak/wildcard → 412, nothing written', async () => {
    const agency = await createAgency();
    const owner = await createOwner();
    const subject = await createSubject();
    const signer = await createSigner(agency.data.id);
    const association = await link(owner, subject.data.id);
    const ownerNow = await getOwner(owner.data.id);
    const subjectNow = await getSubject(subject.data.id);
    const targets: Array<[string, 'POST' | 'PATCH' | 'DELETE', string, unknown, string]> = [];
    for (const [prefix, type, record, etag] of [
      ['agencies', 'Agency', agency.data.id, agency.etag],
      ['owners', 'Owner', owner.data.id, ownerNow.etag],
      ['legal-subjects', 'LegalSubject', subject.data.id, subjectNow.etag],
      ['signers', 'Signer', signer.data.id, signer.etag],
    ] as const) {
      const name = type === 'LegalSubject' ? 'LegalSubject' : type;
      const state = type === 'Signer' ? 'AVAILABLE' : 'ACTIVE';
      targets.push(
        [`patch${name}`, 'PATCH', `/${prefix}/${record}`, { notes: 'x' }, etag],
        [`deleteUnused${name}`, 'DELETE', `/${prefix}/${record}`, undefined, etag],
        [`archive${name}`, 'POST', `/${prefix}/${record}/archive`, { reason: 'x' }, etag],
        [`restore${name}`, 'POST', `/${prefix}/${record}/restore`, { reason: 'x' }, etag],
        [`set${name}State`, 'POST', `/${prefix}/${record}/state`, { state, reason: 'x' }, etag],
      );
    }
    targets.push(
      [
        'linkOwnerSubject',
        'POST',
        `/owners/${owner.data.id}/subjects`,
        { legalSubjectId: (await createSubject()).data.id },
        ownerNow.etag,
      ],
      [
        'setOwnerSubjectLinkState',
        'POST',
        `/owner-subjects/${association.data.id}/link-state`,
        { state: 'PAUSED', reason: 'x' },
        association.etag,
      ],
    );
    const conditional = operations.filter(
      (operation) =>
        operation.preconditionTarget !== null &&
        /^\/(agencies|owners|legal-subjects|signers|owner-subjects)/.test(operation.path) &&
        !operation.operationId.startsWith('bindCanonical'),
    );
    expect(targets.map(([operationId]) => operationId).sort()).toEqual(
      conditional.map((operation) => operation.operationId).sort(),
    );
    const versionsBefore = await Promise.all([
      getAgency(agency.data.id),
      getOwner(owner.data.id),
      getSubject(subject.data.id),
      getSigner(signer.data.id),
    ]).then((reads) => reads.map((read) => read.data.rowVersion));
    for (const [operationId, method, path, body, etag] of targets) {
      const missing = await client.write(operationId, method, path, body, { ifMatch: null });
      expect([missing.status, code(missing)], operationId).toEqual([428, 'PRECONDITION_REQUIRED']);
      const [, type, id] = /^"([A-Za-z]+):([^:]+):v\d+"$/.exec(etag) ?? [];
      for (const bad of [`"${type}:${id}:v999"`, `W/${etag}`, '*', `${etag}, ${etag}`]) {
        const stale = await client.write(operationId, method, path, body, { ifMatch: bad });
        expect([stale.status, code(stale)], `${operationId} ${bad}`).toEqual([
          412,
          'RECORD_VERSION_CONFLICT',
        ]);
      }
    }
    const versionsAfter = await Promise.all([
      getAgency(agency.data.id),
      getOwner(owner.data.id),
      getSubject(subject.data.id),
      getSigner(signer.data.id),
    ]).then((reads) => reads.map((read) => read.data.rowVersion));
    expect(versionsAfter).toEqual(versionsBefore);
    expect(await countRows(prisma, 'owner_subjects')).toBe(1);
    expect(await prisma.idempotencyRecord.count({ where: { state: 'IN_PROGRESS' } })).toBe(0);
  });
});

describe('IDEMPOTENCY', () => {
  it('a missing or malformed Idempotency-Key is 400 and writes nothing', async () => {
    const missing = await client.write(
      'createAgency',
      'POST',
      '/agencies',
      { displayName: 'x' },
      {
        key: null,
      },
    );
    expect([missing.status, code(missing)]).toEqual([400, 'IDEMPOTENCY_KEY_REQUIRED']);
    for (const key of ['short', 'has spaces in the key!', 'x'.repeat(101), 'bad/char-0123456789']) {
      const invalid = await client.write(
        'createAgency',
        'POST',
        '/agencies',
        { displayName: 'x' },
        {
          key,
        },
      );
      expect([invalid.status, code(invalid)], key).toEqual([400, 'IDEMPOTENCY_KEY_INVALID']);
    }
    expect(await countRows(prisma, 'agencies')).toBe(0);
    expect(await countRows(prisma, 'idempotency_records')).toBe(0);
  });

  it('an exact replay returns the stored result without executing again', async () => {
    const key = newKey();
    const body = { displayName: 'SYNTHETIC Replayed Agency' };
    const first = await client.write('createAgency', 'POST', '/agencies', body, { key });
    const replay = await client.write('createAgency', 'POST', '/agencies', body, { key });
    expect(replay.status).toBe(201);
    expect(dataOf(replay)).toEqual(dataOf(first));
    expect(etagOf(replay)).toBe(etagOf(first));
    const meta = (result: HttpResult) =>
      (result.json as { meta: { requestId: string; affectedResources: unknown } }).meta;
    expect(meta(replay).affectedResources).toEqual(meta(first).affectedResources);
    expect(meta(replay).requestId).not.toBe(meta(first).requestId);
    expect(await countRows(prisma, 'agencies')).toBe(1);
    expect(await countRows(prisma, 'audit_events')).toBe(
      1 + 1, // AUTH_LOGIN_SUCCEEDED + AGENCY_CREATED
    );
    // Keys are compared after canonicalisation: the same fields in another order replay too.
    const agency = dataOf<Agency>(first);
    const patchKey = newKey();
    const patch = await client.write(
      'patchAgency',
      'PATCH',
      `/agencies/${agency.id}`,
      { phone: '1', notes: 'n' },
      { key: patchKey, ifMatch: etagOf(first) },
    );
    // A retry after a lost response still carries the old If-Match: it replays instead of 412.
    const retried = await client.write(
      'patchAgency',
      'PATCH',
      `/agencies/${agency.id}`,
      { notes: 'n', phone: '1' },
      { key: patchKey, ifMatch: etagOf(first) },
    );
    expect(retried.status).toBe(200);
    expect(dataOf(retried)).toEqual(dataOf(patch));
    expect((await getAgency(agency.id)).data.rowVersion).toBe(2);
  });

  it('the same key with a different payload or target is 409 IDEMPOTENCY_CONFLICT', async () => {
    const key = newKey();
    await client.write(
      'createAgency',
      'POST',
      '/agencies',
      { displayName: 'SYNTHETIC One' },
      { key },
    );
    const otherPayload = await client.write(
      'createAgency',
      'POST',
      '/agencies',
      { displayName: 'SYNTHETIC Two' },
      { key },
    );
    expect([otherPayload.status, code(otherPayload)]).toEqual([409, 'IDEMPOTENCY_CONFLICT']);
    const a = await createAgency();
    const b = await createAgency();
    const archiveKey = newKey();
    await client.write(
      'archiveAgency',
      'POST',
      `/agencies/${a.data.id}/archive`,
      { reason: 'x' },
      {
        key: archiveKey,
        ifMatch: a.etag,
      },
    );
    const otherTarget = await client.write(
      'archiveAgency',
      'POST',
      `/agencies/${b.data.id}/archive`,
      { reason: 'x' },
      { key: archiveKey, ifMatch: b.etag },
    );
    expect(code(otherTarget)).toBe('IDEMPOTENCY_CONFLICT');
    expect((await getAgency(b.data.id)).data.recordState).toBe('DRAFT');
    expect(await countRows(prisma, 'agencies')).toBe(3);
  });

  it('a concurrent in-progress duplicate is 409 IDEMPOTENCY_IN_PROGRESS; an abandoned claim is reclaimed after the lease', async () => {
    const key = newKey();
    const body = { displayName: 'SYNTHETIC In Flight' };
    // Simulate the first request's claim, committed but not yet completed.
    const first = await client.write('createAgency', 'POST', '/agencies', body, { key });
    const record = await prisma.idempotencyRecord.findFirstOrThrow({
      where: { idempotencyKey: key },
    });
    await prisma.agency.deleteMany({});
    await prisma.idempotencyRecord.update({
      where: { id: record.id },
      data: {
        state: 'IN_PROGRESS',
        responseStatus: null,
        responseJson: Prisma.DbNull,
        createdAt: new Date(t.clock.ms),
      },
    });
    const busy = await client.write('createAgency', 'POST', '/agencies', body, { key });
    expect([busy.status, code(busy), busy.headers['retry-after']]).toEqual([
      409,
      'IDEMPOTENCY_IN_PROGRESS',
      '1',
    ]);
    expect(await countRows(prisma, 'agencies')).toBe(0);
    // 61 s later the claim counts as abandoned: the same intent executes once.
    await prisma.idempotencyRecord.update({
      where: { id: record.id },
      data: { createdAt: new Date(t.clock.ms - 61_000) },
    });
    const resumed = await client.write('createAgency', 'POST', '/agencies', body, { key });
    expect(resumed.status).toBe(201);
    expect(dataOf<Agency>(resumed).id).not.toBe(dataOf<Agency>(first).id);
    expect(await countRows(prisma, 'agencies')).toBe(1);
  });

  it('truly concurrent duplicates execute exactly once', async () => {
    const key = newKey();
    const body = { displayName: 'SYNTHETIC Race' };
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        client.write('createAgency', 'POST', '/agencies', body, { key }),
      ),
    );
    for (const result of results) {
      expect([201, 409]).toContain(result.status);
      if (result.status === 409) expect(code(result)).toBe('IDEMPOTENCY_IN_PROGRESS');
    }
    expect(results.some((result) => result.status === 201)).toBe(true);
    expect(await countRows(prisma, 'agencies')).toBe(1);
    const ids = new Set(results.filter((r) => r.status === 201).map((r) => dataOf<Agency>(r).id));
    expect(ids.size).toBe(1);
  });

  it('the scope is actor + operation + key: another user or another operation executes independently', async () => {
    const key = newKey();
    const other = new DirectoryClient(t.port, await signIn(t.port, prisma), collected);
    await client.write(
      'createAgency',
      'POST',
      '/agencies',
      { displayName: 'SYNTHETIC A' },
      { key },
    );
    const otherUser = await other.write(
      'createAgency',
      'POST',
      '/agencies',
      { displayName: 'SYNTHETIC A' },
      { key },
    );
    expect(otherUser.status).toBe(201);
    const otherOperation = await client.write(
      'createOwner',
      'POST',
      '/owners',
      { displayName: 'SYNTHETIC A' },
      { key },
    );
    expect(otherOperation.status).toBe(201);
    expect(await countRows(prisma, 'agencies')).toBe(2);
    expect(await countRows(prisma, 'owners')).toBe(1);
    const records = await prisma.idempotencyRecord.findMany({ where: { idempotencyKey: key } });
    expect(records.map((r) => [r.actorUserId, r.operationId]).sort()).toEqual(
      [
        [client.session.userId, 'createAgency'],
        [client.session.userId, 'createOwner'],
        [other.session.userId, 'createAgency'],
      ].sort(),
    );
  });

  it('the replay horizon is 7 days: an expired key starts a new intent', async () => {
    const key = newKey();
    const body = { displayName: 'SYNTHETIC Expiring' };
    const first = await client.write('createAgency', 'POST', '/agencies', body, { key });
    const record = await prisma.idempotencyRecord.findFirstOrThrow({
      where: { idempotencyKey: key },
    });
    expect(record.expiresAt.getTime() - record.createdAt.getTime()).toBe(7 * 24 * 3600 * 1000);
    await prisma.idempotencyRecord.update({
      where: { id: record.id },
      data: { expiresAt: new Date(t.clock.ms) },
    });
    const again = await client.write('createAgency', 'POST', '/agencies', body, { key });
    expect(again.status).toBe(201);
    expect(dataOf<Agency>(again).id).not.toBe(dataOf<Agency>(first).id);
    expect(await countRows(prisma, 'agencies')).toBe(2);
    expect(await prisma.idempotencyRecord.count({ where: { idempotencyKey: key } })).toBe(1);
  });

  it('a failed request never becomes a replay record: the key stays usable', async () => {
    const agency = await createAgency();
    const key = newKey();
    const stale = await client.write(
      'patchAgency',
      'PATCH',
      `/agencies/${agency.data.id}`,
      { phone: '1' },
      { key, ifMatch: staleEtag('Agency', agency.data.id) },
    );
    expect(stale.status).toBe(412);
    expect(await prisma.idempotencyRecord.count({ where: { idempotencyKey: key } })).toBe(0);
    const retried = await client.write(
      'patchAgency',
      'PATCH',
      `/agencies/${agency.data.id}`,
      { phone: '1' },
      { key, ifMatch: agency.etag },
    );
    expect(retried.status).toBe(200);
    const conflict = await client.write(
      'setAgencyState',
      'POST',
      `/agencies/${agency.data.id}/state`,
      { state: 'DRAFT', reason: 'already draft' },
      { ifMatch: etagOf(retried) },
    );
    expect(code(conflict)).toBe('RECORD_STATE_CONFLICT');
    expect(await prisma.idempotencyRecord.count({ where: { operationId: 'setAgencyState' } })).toBe(
      0,
    );
  });

  it('a replay re-checks authentication; a replayed delete answers 204 again', async () => {
    const agency = await createAgency();
    const key = newKey();
    const deleted = await client.write(
      'deleteUnusedAgency',
      'DELETE',
      `/agencies/${agency.data.id}`,
      undefined,
      { key, ifMatch: agency.etag },
    );
    expect(deleted.status).toBe(204);
    const replay = await client.write(
      'deleteUnusedAgency',
      'DELETE',
      `/agencies/${agency.data.id}`,
      undefined,
      { key, ifMatch: agency.etag },
    );
    expect([replay.status, replay.text]).toEqual([204, '']);
    const anonymous = await http(t.port, 'DELETE', `/api/v1/agencies/${agency.data.id}`, {
      headers: { Origin: ALLOWED_ORIGIN, 'Idempotency-Key': key, 'If-Match': agency.etag },
    });
    expect(anonymous.status).toBe(401);
    await prisma.user.update({
      where: { id: client.session.userId },
      data: { enabled: false, disabledAt: new Date(t.clock.ms) },
    });
    const disabled = await client.write(
      'deleteUnusedAgency',
      'DELETE',
      `/agencies/${agency.data.id}`,
      undefined,
      { key, ifMatch: agency.etag },
    );
    expect(disabled.status).toBe(401);
  });
});

describe('ATOMICITY (AC-056)', () => {
  it('a failing audit insert rolls back a create: no row, no audit event, no idempotency record', async () => {
    auditWriter.armed = true;
    const key = newKey();
    const result = await client.write(
      'createAgency',
      'POST',
      '/agencies',
      { displayName: 'SYNTHETIC Never Stored' },
      { key },
    );
    expect([result.status, code(result)]).toEqual([500, 'INTERNAL_ERROR']);
    expect(result.text).not.toContain('synthetic audit failure');
    expect(auditWriter.failures).toBe(1);
    expect(await countRows(prisma, 'agencies')).toBe(0);
    expect(await prisma.auditEvent.count({ where: { entityType: 'Agency' } })).toBe(0);
    expect(await prisma.idempotencyRecord.count({ where: { idempotencyKey: key } })).toBe(0);
    // The same intent can be retried once auditing works again.
    auditWriter.armed = false;
    const retried = await client.write(
      'createAgency',
      'POST',
      '/agencies',
      { displayName: 'SYNTHETIC Never Stored' },
      { key },
    );
    expect(retried.status).toBe(201);
  });

  it('a failing audit insert rolls back an update, a link and a delete', async () => {
    const agency = await createAgency({ phone: 'before' });
    const owner = await createOwner();
    const subject = await createSubject();
    auditWriter.armed = true;
    const patch = await client.write(
      'patchAgency',
      'PATCH',
      `/agencies/${agency.data.id}`,
      { phone: 'after' },
      { ifMatch: agency.etag },
    );
    expect(patch.status).toBe(500);
    const linkAttempt = await client.write(
      'linkOwnerSubject',
      'POST',
      `/owners/${owner.data.id}/subjects`,
      { legalSubjectId: subject.data.id },
      { ifMatch: owner.etag },
    );
    expect(linkAttempt.status).toBe(500);
    const deleteAttempt = await client.write(
      'deleteUnusedAgency',
      'DELETE',
      `/agencies/${agency.data.id}`,
      undefined,
      { ifMatch: agency.etag },
    );
    expect(deleteAttempt.status).toBe(500);
    auditWriter.armed = false;
    expect((await getAgency(agency.data.id)).data).toMatchObject({
      phone: 'before',
      rowVersion: 1,
    });
    expect((await getOwner(owner.data.id)).data.rowVersion).toBe(1);
    expect(await countRows(prisma, 'owner_subjects')).toBe(0);
    expect(await prisma.idempotencyRecord.count({ where: { state: 'IN_PROGRESS' } })).toBe(0);
    expect(auditWriter.failures).toBe(3);
  });
});

describe('CURSORS', () => {
  async function seedAgencies(count: number): Promise<string[]> {
    const ids: string[] = [];
    for (let index = 0; index < count; index += 1) {
      ids.push((await createAgency({ displayName: `SYNTHETIC Page ${index}` })).data.id);
      if (index % 2 === 0) t.clock.advance(1000); // pairs share a timestamp: id breaks the tie
    }
    return ids;
  }

  it('pages follow (createdAt DESC, id DESC) without gaps or duplicates; the last page has no cursor', async () => {
    await seedAgencies(5);
    const expected = await prisma.agency.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const query: string = `?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const page = dataOf<{ items: Agency[]; nextCursor: string | null }>(
        await client.get('listAgencies', `/agencies${query}`),
      );
      expect(page.items.length).toBeLessThanOrEqual(2);
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor !== null && pages < 10);
    expect(pages).toBe(3);
    expect(seen).toEqual(expected.map((row) => row.id));
    const all = dataOf<{ items: Agency[]; nextCursor: string | null }>(
      await client.get('listAgencies', '/agencies'),
    );
    expect(all.items).toHaveLength(5);
    expect(all.nextCursor).toBeNull();
  });

  it('default page size is 25 and the maximum is 100', async () => {
    const rows = Array.from({ length: 30 }, (_, index) => ({
      id: randomUUID(),
      displayName: `SYNTHETIC Bulk ${index}`,
      createdById: client.session.userId,
      updatedById: client.session.userId,
    }));
    await prisma.agency.createMany({ data: rows });
    const page = dataOf<{ items: Agency[]; nextCursor: string | null }>(
      await client.get('listAgencies', '/agencies'),
    );
    expect(page.items).toHaveLength(25);
    expect(page.nextCursor).not.toBeNull();
    const big = dataOf<{ items: Agency[] }>(
      await client.get('listAgencies', '/agencies?limit=100'),
    );
    expect(big.items).toHaveLength(30);
    const over = await client.get('listAgencies', '/agencies?limit=101');
    expect([over.status, code(over)]).toEqual([400, 'INVALID_QUERY_PARAMETER']);
  });

  it('a tampered, truncated or foreign cursor is 400 INVALID_CURSOR', async () => {
    await seedAgencies(3);
    const first = dataOf<{ nextCursor: string }>(
      await client.get('listAgencies', '/agencies?limit=1'),
    );
    const cursor = first.nextCursor;
    const [body = '', mac = ''] = cursor.split('.');
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    const forged = Buffer.from(JSON.stringify({ ...payload, t: 0 })).toString('base64url');
    const variants = [
      `${forged}.${mac}`,
      `${body}.${mac.slice(0, -2)}`,
      cursor.slice(0, -1),
      body,
      'not-a-cursor',
      `${body}.${mac}.extra`,
    ];
    for (const variant of variants) {
      const result = await client.get(
        'listAgencies',
        `/agencies?limit=1&cursor=${encodeURIComponent(variant)}`,
      );
      expect([result.status, code(result)], variant).toEqual([400, 'INVALID_CURSOR']);
    }
    const owners = await client.get('listOwners', `/owners?cursor=${encodeURIComponent(cursor)}`);
    expect(code(owners)).toBe('INVALID_CURSOR');
  });

  it('a cursor is bound to its filters and scope', async () => {
    const agency = await createAgency();
    for (let index = 0; index < 3; index += 1) {
      await createSigner(agency.data.id, { fullLegalName: `SYNTHETIC Signer ${index}` });
      t.clock.advance(1000);
    }
    const first = dataOf<{ nextCursor: string }>(
      await client.get('listSigners', `/signers?limit=1&q=signer&agencyId=${agency.data.id}`),
    );
    const cursor = encodeURIComponent(first.nextCursor);
    const same = await client.get(
      'listSigners',
      `/signers?limit=1&q=signer&agencyId=${agency.data.id}&cursor=${cursor}`,
    );
    expect(same.status).toBe(200);
    for (const query of [
      `?limit=1&q=other&agencyId=${agency.data.id}&cursor=${cursor}`,
      `?limit=1&q=signer&cursor=${cursor}`,
      `?limit=1&agencyId=${agency.data.id}&cursor=${cursor}`,
    ]) {
      const result = await client.get('listSigners', `/signers${query}`);
      expect([result.status, code(result)], query).toEqual([400, 'INVALID_CURSOR']);
    }
    const ownerA = await createOwner();
    const ownerB = await createOwner();
    for (let index = 0; index < 2; index += 1) {
      await link(await getOwner(ownerA.data.id), (await createSubject()).data.id);
    }
    const scoped = dataOf<{ nextCursor: string }>(
      await client.get('listOwnerSubjects', `/owners/${ownerA.data.id}/subjects?limit=1`),
    );
    const otherScope = await client.get(
      'listOwnerSubjects',
      `/owners/${ownerB.data.id}/subjects?cursor=${encodeURIComponent(scoped.nextCursor)}`,
    );
    expect(code(otherScope)).toBe('INVALID_CURSOR');
  });

  it('invalid, unknown or repeated query parameters are 400 INVALID_QUERY_PARAMETER', async () => {
    for (const query of [
      '?limit=0',
      '?limit=abc',
      '?limit=1.5',
      '?limit=-1',
      '?limit=010',
      '?limit=',
      '?limit=1&limit=2',
      '?unknown=1',
      `?q=${'x'.repeat(201)}`,
      '?agencyId=1',
    ]) {
      const path = query.startsWith('?agencyId') ? '/signers' : '/agencies';
      const result = await client.get(
        path === '/signers' ? 'listSigners' : 'listAgencies',
        `${path}${query}`,
      );
      expect([result.status, code(result)], query).toEqual([400, 'INVALID_QUERY_PARAMETER']);
    }
    const agencyFilterOnAgencies = await client.get(
      'listAgencies',
      `/agencies?agencyId=${MISSING_ID}`,
    );
    expect(code(agencyFilterOnAgencies)).toBe('INVALID_QUERY_PARAMETER');
  });
});

describe('SECURITY / VALIDATION / CONTRACT', () => {
  it('AC-057: no session, a bad CSRF token or a wrong Origin stops every write before any mutation', async () => {
    const agency = await createAgency();
    const auditBefore = await countRows(prisma, 'audit_events');
    const idempotencyBefore = await countRows(prisma, 'idempotency_records');
    const body = JSON.stringify({ displayName: 'SYNTHETIC Forged' });
    const base = {
      'Content-Type': 'application/json',
      'Idempotency-Key': newKey(),
      'If-Match': agency.etag,
    };
    const attempts: Array<[string, Record<string, string>, number, string]> = [
      ['no session', { ...base, Origin: ALLOWED_ORIGIN }, 401, 'SESSION_REQUIRED'],
      [
        'no CSRF token',
        { ...base, Origin: ALLOWED_ORIGIN, ...cookieHeader(client.session.token) },
        403,
        'CSRF_TOKEN_INVALID',
      ],
      [
        'wrong CSRF token',
        {
          ...base,
          Origin: ALLOWED_ORIGIN,
          ...cookieHeader(client.session.token),
          'X-CSRF-Token': 'x'.repeat(43),
        },
        403,
        'CSRF_TOKEN_INVALID',
      ],
      [
        'foreign Origin',
        {
          ...base,
          Origin: 'http://evil.example',
          ...cookieHeader(client.session.token),
          'X-CSRF-Token': client.session.csrfToken,
        },
        403,
        'ORIGIN_REJECTED',
      ],
      [
        'missing Origin',
        {
          ...base,
          ...cookieHeader(client.session.token),
          'X-CSRF-Token': client.session.csrfToken,
        },
        403,
        'ORIGIN_REJECTED',
      ],
    ];
    for (const [label, headers, status, errorCode] of attempts) {
      for (const [method, path] of [
        ['POST', '/api/v1/agencies'],
        ['PATCH', `/api/v1/agencies/${agency.data.id}`],
        ['DELETE', `/api/v1/agencies/${agency.data.id}`],
      ] as const) {
        const result = await http(t.port, method, path, {
          headers,
          ...(method === 'DELETE' ? {} : { body }),
        });
        expect([result.status, code(result)], `${label} ${method}`).toEqual([status, errorCode]);
      }
    }
    expect(await countRows(prisma, 'agencies')).toBe(1);
    expect((await getAgency(agency.data.id)).data.rowVersion).toBe(1);
    expect(await countRows(prisma, 'audit_events')).toBe(auditBefore);
    expect(await countRows(prisma, 'idempotency_records')).toBe(idempotencyBefore);
    // Reads without a session are refused too.
    expect((await http(t.port, 'GET', '/api/v1/agencies')).status).toBe(401);
  });

  it('AC-058: readiness, signature, state and server fields are unknown fields (422), never writable', async () => {
    const agency = await createAgency();
    const signer = await createSigner(agency.data.id);
    for (const [operationId, method, path, body, ifMatch] of [
      ['createAgency', 'POST', '/agencies', { displayName: 'x', recordState: 'ACTIVE' }, undefined],
      [
        'createAgency',
        'POST',
        '/agencies',
        { displayName: 'x', canonicalCode: 'SYN-1' },
        undefined,
      ],
      ['patchAgency', 'PATCH', `/agencies/${agency.data.id}`, { rowVersion: 7 }, agency.etag],
      [
        'patchSigner',
        'PATCH',
        `/signers/${signer.data.id}`,
        { signedAt: '2026-09-24T00:00:00Z' },
        signer.etag,
      ],
      ['patchSigner', 'PATCH', `/signers/${signer.data.id}`, { readyForSigner: true }, signer.etag],
      [
        'patchSigner',
        'PATCH',
        `/signers/${signer.data.id}`,
        { operationalState: 'AVAILABLE' },
        signer.etag,
      ],
      [
        'createSigner',
        'POST',
        '/signers',
        { agencyId: agency.data.id, fullLegalName: 'x', userId: MISSING_ID },
        undefined,
      ],
    ] as const) {
      const result = await client.write(
        operationId,
        method,
        path,
        body,
        ifMatch === undefined ? {} : { ifMatch },
      );
      expect([result.status, code(result)], JSON.stringify(body)).toEqual([
        422,
        'VALIDATION_FAILED',
      ]);
      expect(errorOf(result).details['issues']).toEqual(
        expect.arrayContaining([{ path: '(body)', message: 'Unknown field' }]),
      );
    }
    expect((await getSigner(signer.data.id)).data).toEqual(signer.data);
    expect(await countRows(prisma, 'agencies')).toBe(1);
  });

  it('empty PATCH, malformed values, a DELETE body and unstorable text are 422; malformed JSON 400; over 1 MiB 413', async () => {
    const agency = await createAgency();
    const cases: Array<[string, 'POST' | 'PATCH' | 'DELETE', string, unknown, string | undefined]> =
      [
        ['patchAgency', 'PATCH', `/agencies/${agency.data.id}`, {}, agency.etag],
        ['createAgency', 'POST', '/agencies', { displayName: '' }, undefined],
        ['createAgency', 'POST', '/agencies', { displayName: 'x'.repeat(201) }, undefined],
        [
          'createAgency',
          'POST',
          '/agencies',
          { displayName: 'x', copyrightEmail: 'not-an-email' },
          undefined,
        ],
        [
          'createAgency',
          'POST',
          '/agencies',
          { displayName: 'x', websiteUrl: 'ftp://example.invalid' },
          undefined,
        ],
        ['createAgency', 'POST', '/agencies', { displayName: 'bad \ud800 text' }, undefined],
        [
          'createLegalSubject',
          'POST',
          '/legal-subjects',
          { subjectType: 'COMPANY', legalName: 'x' },
          undefined,
        ],
        [
          'deleteUnusedAgency',
          'DELETE',
          `/agencies/${agency.data.id}`,
          { force: true },
          agency.etag,
        ],
      ];
    for (const [operationId, method, path, body, ifMatch] of cases) {
      const result = await client.write(
        operationId,
        method,
        path,
        body,
        ifMatch === undefined ? {} : { ifMatch },
      );
      expect([result.status, code(result)], JSON.stringify(body)).toEqual([
        422,
        'VALIDATION_FAILED',
      ]);
    }
    const malformed = await client.write('createAgency', 'POST', '/agencies', undefined, {
      rawBody: '{"displayName": ',
    });
    expect([malformed.status, code(malformed)]).toEqual([400, 'MALFORMED_REQUEST']);
    const oversized = await client.write('createAgency', 'POST', '/agencies', undefined, {
      rawBody: JSON.stringify({ displayName: 'x', notes: 'n'.repeat(1024 * 1024) }),
    });
    expect([oversized.status, code(oversized)]).toEqual([413, 'PAYLOAD_TOO_LARGE']);
    expect(await countRows(prisma, 'agencies')).toBe(1);
    expect((await getAgency(agency.data.id)).data.rowVersion).toBe(1);
  });

  it('canonical-binding operations are routed since P3A; an unknown source is refused and nothing is bound', async () => {
    const agency = await createAgency();
    const owner = await createOwner();
    const subject = await createSubject();
    const signer = await createSigner(agency.data.id);
    for (const [operationId, path, etag] of [
      ['bindCanonicalAgency', `/agencies/${agency.data.id}/canonical-bindings`, agency.etag],
      ['bindCanonicalOwner', `/owners/${owner.data.id}/canonical-bindings`, owner.etag],
      [
        'bindCanonicalLegalSubject',
        `/legal-subjects/${subject.data.id}/canonical-bindings`,
        subject.etag,
      ],
      ['bindCanonicalSigner', `/signers/${signer.data.id}/canonical-bindings`, signer.etag],
    ] as const) {
      const result = await client.write(
        operationId,
        'POST',
        path,
        { canonicalCode: 'SYN-CODE', sourceId: randomUUID(), reason: 'synthetic' },
        { ifMatch: etag },
      );
      expect([result.status, code(result)], operationId).toEqual([422, 'REFERENCE_NOT_FOUND']);
    }
    for (const record of [
      (await getAgency(agency.data.id)).data,
      (await getOwner(owner.data.id)).data,
      (await getSubject(subject.data.id)).data,
      (await getSigner(signer.data.id)).data,
    ]) {
      expect(record).toMatchObject({
        canonicalCode: null,
        canonicalSourceId: null,
        bindingState: 'LOCAL_ONLY',
        rowVersion: 1,
      });
    }
    expect(await countRows(prisma, 'source_references')).toBe(0);
  });

  it('exposes exactly the P1 routes plus the 76 directory, source, route and authority operations and the 40 case operations', async () => {
    const express = t.app.getHttpAdapter().getInstance() as {
      router: { stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }> };
    };
    const routes = express.router.stack
      .filter((layer) => layer.route)
      .flatMap((layer) =>
        Object.keys(layer.route?.methods ?? {}).map(
          (method) => `${method.toUpperCase()} ${layer.route?.path}`,
        ),
      )
      .sort();
    // P2: the 36 directory operations; P3A: the 4 canonical bindings, 4 source and 9 route
    // operations; P3B: the 23 Mandate-tagged operations; P4A: the 16 Case, CaseSource and
    // CaseAuthoritySelection operations, plus the read-back getCaseAuthoritySelection of
    // TB-SCHEMA-API-v1.1.0 (ADR-0004, R8); P4B: the 22 ReportedItem, CaseWork, UseMapping and
    // CaseFact operations, plus the read-back getCaseFactSources of TB-SCHEMA-API-v1.2.0 (ADR-0005,
    // R9). No other case operation, correspondence, production or validation is routed.
    const directory = operations
      .filter((operation) =>
        /^\/(agencies|owners|legal-subjects|signers|owner-subjects|sources|routes|mandates|mandate-versions|coverages|coverage-signers)(\/|$)/.test(
          operation.path,
        ),
      )
      .map(
        (operation) =>
          `${operation.method.toUpperCase()} /api/v1${operation.path.replace(/\{([A-Za-z]+)\}/g, ':$1')}`,
      );
    expect(directory).toHaveLength(76);
    const caseOperations = new Set([
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
      'getCaseAuthoritySelection',
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
      'getCaseFactSources',
      'reviseCaseFact',
    ]);
    const cases = operations
      .filter((operation) => caseOperations.has(operation.operationId))
      .map(
        (operation) =>
          `${operation.method.toUpperCase()} /api/v1${operation.path.replace(/\{([A-Za-z]+)\}/g, ':$1')}`,
      );
    expect(cases).toHaveLength(40);
    expect(
      operations.filter((operation) => (operation.tags as readonly string[]).includes('Mandate')),
    ).toHaveLength(23);
    expect(routes).toEqual(
      [
        'GET /api/v1/auth/session',
        'GET /api/v1/health',
        'POST /api/v1/auth/login',
        'POST /api/v1/auth/logout',
        ...directory,
        ...cases,
      ].sort(),
    );
  });

  it('an application User is not a Signer: directory writes never create or change users or sessions', async () => {
    const usersBefore = await prisma.user.findMany({ orderBy: { id: 'asc' } });
    const sessionsBefore = await prisma.authSession.count();
    const agency = await createAgency();
    await createSigner(agency.data.id, {
      fullLegalName: 'SYNTHETIC Person',
      contactEmail: client.session.email,
    });
    expect(await prisma.user.findMany({ orderBy: { id: 'asc' } })).toEqual(usersBefore);
    expect(await prisma.authSession.count()).toBe(sessionsBefore);
    const signer = await prisma.signer.findFirstOrThrow();
    expect(Object.keys(signer)).not.toContain('userId');
  });

  it('a full tour succeeds once through every implemented directory operation', async () => {
    const agency = await createAgency();
    const signer = await createSigner(agency.data.id);
    const patchedSigner = await ok<Signer>(
      await client.write(
        'patchSigner',
        'PATCH',
        `/signers/${signer.data.id}`,
        { title: 'SYNTHETIC Title' },
        { ifMatch: signer.etag },
      ),
    );
    expect(patchedSigner.data.title).toBe('SYNTHETIC Title');
    const owner = await createOwner();
    const listedOwners = await client.get('listOwners', '/owners?limit=5');
    expect(dataOf<{ items: Owner[] }>(listedOwners).items.map((item) => item.id)).toContain(
      owner.data.id,
    );
    const archivedOwner = await ok<Owner>(
      await client.write(
        'archiveOwner',
        'POST',
        `/owners/${owner.data.id}/archive`,
        { reason: 'synthetic tour' },
        { ifMatch: owner.etag },
      ),
    );
    await ok<Owner>(
      await client.write(
        'restoreOwner',
        'POST',
        `/owners/${owner.data.id}/restore`,
        { reason: 'synthetic tour' },
        { ifMatch: archivedOwner.etag },
      ),
    );
    const subject = await createSubject();
    const listedSubjects = await client.get('listLegalSubjects', '/legal-subjects?q=subject');
    expect(dataOf<{ items: LegalSubject[] }>(listedSubjects).items).toHaveLength(1);
    const activeSubject = await ok<LegalSubject>(
      await client.write(
        'setLegalSubjectState',
        'POST',
        `/legal-subjects/${subject.data.id}/state`,
        { state: 'ACTIVE', reason: 'synthetic tour' },
        { ifMatch: subject.etag },
      ),
    );
    const archivedSubject = await ok<LegalSubject>(
      await client.write(
        'archiveLegalSubject',
        'POST',
        `/legal-subjects/${subject.data.id}/archive`,
        { reason: 'synthetic tour' },
        { ifMatch: activeSubject.etag },
      ),
    );
    const restoredSubject = await ok<LegalSubject>(
      await client.write(
        'restoreLegalSubject',
        'POST',
        `/legal-subjects/${subject.data.id}/restore`,
        { reason: 'synthetic tour' },
        { ifMatch: archivedSubject.etag },
      ),
    );
    expect(restoredSubject.data.recordState).toBe('DRAFT');
  });

  it('Cache-Control: no-store on every response of this suite', () => {
    expect(collected.length).toBeGreaterThan(200);
    for (const { operationId, result } of collected) {
      expect(result.headers['cache-control'], `${operationId} ${result.status}`).toBe('no-store');
    }
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
        const listing = operation.method === 'get' && operationId.startsWith('list');
        if (listing || operation.success.status === '204') {
          expect(result.headers['etag'], label).toBeUndefined();
        } else {
          expect(result.headers['etag'], label).toMatch(/^"[A-Za-z]+:[0-9a-f-]{36}:v\d+"$/);
        }
      } else {
        expect(operation.errors as readonly string[], label).toContain(String(result.status));
        expect(OperationErrorSchema.safeParse(result.json).success, label).toBe(true);
      }
    }
    const implemented = operations
      .filter(
        (operation) =>
          /^\/(agencies|owners|legal-subjects|signers|owner-subjects)/.test(operation.path) &&
          !operation.operationId.startsWith('bindCanonical'),
      )
      .map((operation) => operation.operationId);
    expect([...implemented].filter((operationId) => !seen.has(operationId))).toEqual([]);
  });
});
