import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../apps/api/generated/prisma/client.js';
import { openTestPrisma, startTestApp, type TestApp } from './auth-support.js';
import {
  assertSuiteTablesEmpty,
  cleanSuiteTables,
  dataOf,
  DirectoryClient,
  etagOf,
  signIn,
} from './directory-support.js';

let prisma: PrismaClient;
let app: TestApp;
let client: DirectoryClient;
let armed = false;
beforeAll(async () => {
  ({ prisma } = openTestPrisma());
  await assertSuiteTablesEmpty(prisma);
  armed = true;
});
beforeEach(async () => {
  app = await startTestApp(prisma);
  client = new DirectoryClient(app.port, await signIn(app.port, prisma), []);
});
afterEach(async () => {
  await app?.close();
  if (armed) await cleanSuiteTables(prisma);
});
afterAll(async () => {
  if (armed) await assertSuiteTablesEmpty(prisma);
  await prisma?.$disconnect();
});
type Row = { id: string; [key: string]: unknown };
async function create(operation: string, path: string, body: unknown, parent?: string) {
  const etag = parent ? etagOf(await client.get('get', parent)) : undefined;
  const r = await client.write(operation, 'POST', path, body, etag ? { ifMatch: etag } : {});
  expect(r.status, r.text).toBe(201);
  return dataOf<Row>(r);
}
async function command(operation: string, path: string, action: string, body: unknown) {
  const r = await client.write(operation, 'POST', path + '/' + action, body, {
    ifMatch: etagOf(await client.get('get', path)),
  });
  expect(r.status, r.text).toBe(200);
}
async function list(operation: string, path: string) {
  const r = await client.get(operation, path);
  expect(r.status, r.text).toBe(200);
  return dataOf<{ items: Row[]; nextCursor: string | null }>(r);
}
async function fixture() {
  const agencies = [];
  for (let i = 0; i < 3; i++)
    agencies.push(
      await create('createAgency', '/agencies', {
        displayName: 'SYNTHETIC Agency ' + i,
        legalName: 'SYNTHETIC Agency LLC ' + i,
      }),
    );
  const owner = await create('createOwner', '/owners', { displayName: 'SYNTHETIC Owner' });
  const subjects = [];
  const links = [];
  for (let i = 0; i < 3; i++) {
    const s = await create('createLegalSubject', '/legal-subjects', {
      legalName: i === 2 ? 'SYNTHETIC Historical LLC' : 'SYNTHETIC Individual ' + i,
      subjectType: i === 2 ? 'LEGAL_ENTITY' : 'INDIVIDUAL',
    });
    subjects.push(s);
    links.push(
      await create(
        'linkOwnerSubject',
        '/owners/' + owner.id + '/subjects',
        { legalSubjectId: s.id },
        '/owners/' + owner.id,
      ),
    );
  }
  const current: Row[] = [];
  const history: Row[] = [];
  for (const [a, s] of [
    [0, 0],
    [0, 1],
    [1, 0],
    [2, 0],
    [2, 1],
    [0, 2],
    [1, 2],
    [2, 2],
  ]) {
    const r = await create('createRoute', '/routes', {
      agencyId: agencies[a!]!.id,
      ownerSubjectId: links[s!]!.id,
      platform: 'YOUTUBE',
    });
    if (s === 2) {
      history.push(r);
      await command('setRouteLinkState', '/routes/' + r.id, 'link-state', {
        state: 'UNLINKED',
        reason: 'SYNTHETIC inactive',
      });
      await command('archiveRoute', '/routes/' + r.id, 'archive', { reason: 'SYNTHETIC history' });
    } else current.push(r);
  }
  await command('setOwnerSubjectLinkState', '/owner-subjects/' + links[2]!.id, 'link-state', {
    state: 'UNLINKED',
    reason: 'SYNTHETIC history',
  });
  await command('archiveLegalSubject', '/legal-subjects/' + subjects[2]!.id, 'archive', {
    reason: 'SYNTHETIC history',
  });
  return { agencies, owner, subjects, links, current, history };
}
describe('operational list queries over real HTTP and MySQL', () => {
  it('filters before pagination/search; retains default-all, history and exact historical GET; binds cursors to view', async () => {
    const f = await fixture();
    const before = await prisma.auditEvent.count();
    const idem = await prisma.idempotencyRecord.count();
    const first = await list('listRoutes', '/routes?view=operational&limit=2');
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const seen = [...first.items];
    let cursor = first.nextCursor;
    while (cursor) {
      const page = await list(
        'listRoutes',
        '/routes?view=operational&limit=2&cursor=' + encodeURIComponent(cursor),
      );
      seen.push(...page.items);
      cursor = page.nextCursor;
    }
    expect(seen.map((x) => x.id).sort()).toEqual(f.current.map((x) => x.id).sort());
    expect(new Set(seen.map((x) => x.id)).size).toBe(5);
    expect(
      (await list('listRoutes', '/routes?view=history')).items.map((x) => x.id).sort(),
    ).toEqual(f.history.map((x) => x.id).sort());
    expect((await list('listRoutes', '/routes')).items).toHaveLength(8);
    expect((await list('listRoutes', '/routes?view=all')).items).toHaveLength(8);
    expect((await list('listRoutes', '/routes?view=operational&q=Historical')).items).toHaveLength(
      0,
    );
    expect(
      (await list('listRoutes', '/routes?view=history&q=Historical&agencyId=' + f.agencies[0]!.id))
        .items,
    ).toHaveLength(1);
    expect(
      (
        await client.get(
          'listRoutes',
          '/routes?view=history&cursor=' + encodeURIComponent(first.nextCursor!),
        )
      ).status,
    ).toBe(400);
    expect((await client.get('listRoutes', '/routes?view=unknown')).status).toBe(400);
    for (const r of f.history)
      expect(dataOf<Row>(await client.get('getRoute', '/routes/' + r.id)).id).toBe(r.id);
    expect(
      (await list('listLegalSubjects', '/legal-subjects?view=operational')).items,
    ).toHaveLength(2);
    expect(
      (await list('listLegalSubjects', '/legal-subjects?view=history')).items.map((x) => x.id),
    ).toEqual([f.subjects[2]!.id]);
    expect(
      dataOf<Row>(await client.get('getLegalSubject', '/legal-subjects/' + f.subjects[2]!.id))
        .recordState,
    ).toBe('ARCHIVED');
    expect(
      (await list('listOwnerSubjects', '/owners/' + f.owner.id + '/subjects?view=operational'))
        .items,
    ).toHaveLength(2);
    expect(
      (
        await list('listOwnerSubjects', '/owners/' + f.owner.id + '/subjects?view=history')
      ).items.map((x) => x.id),
    ).toEqual([f.links[2]!.id]);
    expect(await prisma.auditEvent.count()).toBe(before);
    expect(await prisma.idempotencyRecord.count()).toBe(idem);
  });
  it('excludes each current-route blocker independently, including a non-archived entity without name matching', async () => {
    const f = await fixture();
    const r = f.current[0]!;
    await command('setRouteLinkState', '/routes/' + r.id, 'link-state', {
      state: 'PAUSED',
      reason: 'SYNTHETIC pause',
    });
    expect((await list('listRoutes', '/routes?view=operational')).items).toHaveLength(4);
    await command('setOwnerSubjectLinkState', '/owner-subjects/' + f.links[1]!.id, 'link-state', {
      state: 'PAUSED',
      reason: 'SYNTHETIC pause',
    });
    expect((await list('listRoutes', '/routes?view=operational')).items).toHaveLength(2);
    await command('archiveLegalSubject', '/legal-subjects/' + f.subjects[0]!.id, 'archive', {
      reason: 'SYNTHETIC archive',
    });
    expect((await list('listRoutes', '/routes?view=operational')).items).toHaveLength(0);
    const entity = await create('createLegalSubject', '/legal-subjects', {
      subjectType: 'LEGAL_ENTITY',
      legalName: 'SYNTHETIC No corporate suffix',
    });
    const link = await create(
      'linkOwnerSubject',
      '/owners/' + f.owner.id + '/subjects',
      { legalSubjectId: entity.id },
      '/owners/' + f.owner.id,
    );
    const route = await create('createRoute', '/routes', {
      agencyId: f.agencies[0]!.id,
      ownerSubjectId: link.id,
      platform: 'YOUTUBE',
    });
    expect((await list('listRoutes', '/routes?view=operational')).items).toHaveLength(0);
    expect((await list('listRoutes', '/routes?view=history')).items.map((x) => x.id)).toContain(
      route.id,
    );
  });
  it('keeps mixed documentary mandate labels and filters only archive state; history is readable and paginated', async () => {
    const agency = await create('createAgency', '/agencies', {
      displayName: 'SYNTHETIC Agency LLC',
    });
    const live: Row[] = [],
      old: Row[] = [];
    for (let i = 0; i < 4; i++) {
      const m = await create('createMandate', '/mandates', {
        agencyId: agency.id,
        label: 'SYNTHETIC mixed individual AND LLC ' + i,
      });
      if (i % 2) {
        old.push(m);
        await command('archiveMandate', '/mandates/' + m.id, 'archive', {
          reason: 'SYNTHETIC history',
        });
      } else live.push(m);
    }
    expect(
      (await list('listMandates', '/mandates?view=operational&q=LLC')).items
        .map((x) => x.id)
        .sort(),
    ).toEqual(live.map((x) => x.id).sort());
    const first = await list('listMandates', '/mandates?view=history&limit=1');
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).not.toBeNull();
    const second = await list(
      'listMandates',
      '/mandates?view=history&limit=1&cursor=' + encodeURIComponent(first.nextCursor!),
    );
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect((await list('listMandates', '/mandates')).items).toHaveLength(4);
    for (const m of old)
      expect(
        dataOf<Row>(await client.get('getMandate', '/mandates/' + m.id)).archivedAt,
      ).not.toBeNull();
  });
});
