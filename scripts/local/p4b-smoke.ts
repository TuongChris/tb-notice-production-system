// yarn smoke:p4b --email <email> < password — P4B round trip against the COMPILED API, for CI only.
//
// It writes synthetic Directory, SourceReference, case and case intake records into the target
// database and leaves them there (sources and fact revisions are append-only history), so it
// refuses to run unless CI=true: CI's tb_notice_dev is disposable, the operator's is not. The
// account is the synthetic CI admin created by `yarn admin:create`; the password is read from
// standard input. Requires a prior `yarn build`. No external requests (nothing fetches the reported
// address); port 3000 is released.
//
// Flow (every response is checked against the ACTIVE contract and for Cache-Control: no-store):
//   login → Agency + its own source → Owner + LegalSubject → link → Route → Case bound to the route
//   → ReportedItem (raw URL kept; video id derived, case preserved) → CaseWork → UseMapping
//   between them (exact millisecond strings) → case source link → CaseFact with a support →
//   revision 2 of the fact → the historical revision 1 read back unchanged → each revision reads
//   back exactly its own recorded supports (getCaseFactSources, TB-SCHEMA-API-v1.2.0) → a newer
//   source revision re-points neither the link nor the facts, and neither it nor a later paused
//   link changes or hides the recorded support → PATCH / archive / restore of the item →
//   expected refusals: another case's item and fact supports through this case (404), a mapping
//   with another case's work (422 CROSS_CASE_REFERENCE), a non-video address (422
//   REPORTED_URL_UNSUPPORTED), a stale ETag (412), a revision of the old head (409
//   REVISION_NOT_HEAD) → no readiness, G1–G7 or production route or field exists (404 / no such
//   keys) → logout. Nothing here is an infringement, ownership, permission or
//   exception finding, readiness, a notice, a signature or an external action.
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { connect } from 'node:net';
import path from 'node:path';
import { argValue, repoRoot } from '../contracts/paths.ts';
import { loadRootEnv } from '../db/lib/targets.mjs';

const API = 'http://127.0.0.1:3000/api/v1';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let api: ChildProcess | undefined;
let exited = false;
let checks = 0;

function pass(message: string): void {
  checks += 1;
  console.log(`[smoke:p4b] PASS ${message}`);
}

function fail(message: string): never {
  throw new Error(message);
}

function listening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port });
    socket.setTimeout(300);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks)
    .toString('utf8')
    .replace(/\r?\n$/, '');
}

interface Parser {
  safeParse(value: unknown): { success: boolean };
}

type Data = { readonly id: string } & Record<string, unknown>;

async function main(): Promise<void> {
  if (process.env['CI'] !== 'true') {
    fail(
      'smoke:p4b writes directory, source, authority and case records into the target database; ' +
        'it runs only in CI (CI=true) against the disposable CI database',
    );
  }
  loadRootEnv();
  const email = argValue(process.argv.slice(2), '--email');
  if (!email) fail('--email is required (the password is read from standard input)');
  const password = await readStdin();
  if (!password) fail('no password on standard input');
  const origin = (process.env['TB_ALLOWED_WEB_ORIGINS'] ?? '').split(',')[0]?.trim();
  if (!origin) fail('TB_ALLOWED_WEB_ORIGINS is not set; run yarn env:init');
  const entry = path.join(repoRoot, 'apps/api/dist/src/main.js');
  if (!existsSync(entry)) fail('compiled API missing; run yarn build first');
  if (await listening(3000)) fail('port 3000 is already in use');
  const contracts = await import('../../packages/contracts/dist/index.js');

  api = spawn(process.execPath, [entry], { cwd: path.join(repoRoot, 'apps/api'), stdio: 'ignore' });
  api.on('exit', () => {
    exited = true;
  });
  for (let waited = 0; !(await listening(3000)); waited += 250) {
    if (exited || waited > 30_000) fail('compiled API did not start');
    await sleep(250);
  }

  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { Origin: origin, 'X-Requested-With': 'TB-APP', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const loginBody = contracts.LoginResponseSchema.safeParse(await login.json());
  if (login.status !== 200 || !loginBody.success) fail(`login: HTTP ${login.status}`);
  const cookieHeader = login.headers
    .getSetCookie()
    .find((value) => value.startsWith('tb_session_dev='));
  if (!cookieHeader) fail('login set no session cookie');
  const cookie = cookieHeader.split(';')[0] ?? '';
  const csrf = loginBody.data.data.csrfToken;
  pass('login → 200 with a session cookie and CSRF token');

  async function call(
    label: string,
    method: string,
    route: string,
    expected: number,
    schema: Parser | null,
    options: { body?: unknown; ifMatch?: string } = {},
  ): Promise<{ data: Data; etag: string | null; code: string | null }> {
    const headers: Record<string, string> = { Cookie: cookie, 'X-Requested-With': 'TB-APP' };
    if (method !== 'GET') {
      headers['Origin'] = origin as string;
      headers['X-CSRF-Token'] = csrf;
      headers['Idempotency-Key'] = `p4b-ci-${randomUUID()}`;
    }
    if (options.ifMatch !== undefined) headers['If-Match'] = options.ifMatch;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${API}${route}`, {
      method,
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    const text = await response.text();
    const body: unknown = text === '' ? undefined : JSON.parse(text);
    if (response.status !== expected) {
      fail(`${label}: expected ${expected}, got ${response.status} ${text.slice(0, 300)}`);
    }
    if (response.headers.get('cache-control') !== 'no-store') fail(`${label}: missing no-store`);
    const checker = schema ?? (expected >= 400 ? contracts.OperationErrorSchema : null);
    if (checker && !checker.safeParse(body).success)
      fail(`${label}: response violates the contract`);
    pass(`${label} → ${expected}`);
    const envelope = body as { data?: Data; error?: { code: string } } | undefined;
    return {
      data: (envelope?.data ?? { id: '' }) as Data,
      etag: response.headers.get('etag'),
      code: envelope?.error?.code ?? null,
    };
  }

  const tag = randomUUID().slice(0, 8);
  const forbiddenKey =
    /"(g[1-7]\w*|ready\w*|eligib\w*|infring\w*|authori[sz]ed\w*|verified\w*|approved\w*)"\s*:/i;
  function noFinding(label: string, value: unknown): void {
    if (forbiddenKey.test(JSON.stringify(value)))
      fail(`${label}: carries a finding or readiness key`);
  }

  const agency = await call(
    'POST /agencies',
    'POST',
    '/agencies',
    201,
    contracts.CreateAgencyResponseSchema,
    { body: { displayName: `P4B CI synthetic agency ${tag}` } },
  );
  const source = await call(
    'POST /sources (agency material)',
    'POST',
    '/sources',
    201,
    contracts.CreateSourceResponseSchema,
    {
      body: {
        agencyId: agency.data.id,
        title: `P4B CI synthetic material ${tag} (not evidence)`,
        sourceRole: 'OPERATOR_INPUT',
        scopeText: 'Synthetic CI scope',
      },
    },
  );
  const owner = await call(
    'POST /owners',
    'POST',
    '/owners',
    201,
    contracts.CreateOwnerResponseSchema,
    { body: { displayName: `P4B CI synthetic brand ${tag}` } },
  );
  const subject = await call(
    'POST /legal-subjects',
    'POST',
    '/legal-subjects',
    201,
    contracts.CreateLegalSubjectResponseSchema,
    { body: { subjectType: 'LEGAL_ENTITY', legalName: `P4B CI synthetic subject ${tag}` } },
  );
  const link = await call(
    'POST /owners/{id}/subjects (link)',
    'POST',
    `/owners/${owner.data.id}/subjects`,
    201,
    contracts.LinkOwnerSubjectResponseSchema,
    { body: { legalSubjectId: subject.data.id }, ifMatch: owner.etag ?? '' },
  );
  const route = await call(
    'POST /routes',
    'POST',
    '/routes',
    201,
    contracts.CreateRouteResponseSchema,
    { body: { agencyId: agency.data.id, ownerSubjectId: link.data.id } },
  );
  const created = await call(
    'POST /cases (bound to the route)',
    'POST',
    '/cases',
    201,
    contracts.CreateCaseResponseSchema,
    {
      body: {
        agencyId: agency.data.id,
        routeId: route.data.id,
        intakeLabel: `P4B CI synthetic intake ${tag}`,
      },
    },
  );
  const caseId = created.data.id;
  let caseEtag = created.etag ?? '';
  const refreshCase = async () => {
    const current = await call(
      'GET /cases/{caseId}',
      'GET',
      `/cases/${caseId}`,
      200,
      contracts.GetCaseResponseSchema,
    );
    caseEtag = current.etag ?? '';
    return current;
  };

  // Reported item: the raw URL exactly as supplied; the video id derived with its case kept.
  const videoId = `P4b${tag.slice(0, 4)}_-Zz`;
  const rawUrl = `https://WWW.YouTube.com/watch?feature=share&v=${videoId}&t=42s`;
  const item = await call(
    'POST /cases/{caseId}/reported-items',
    'POST',
    `/cases/${caseId}/reported-items`,
    201,
    contracts.CreateReportedItemResponseSchema,
    {
      body: {
        rawUrl,
        displayTitle: `P4B CI synthetic reported video ${tag}`,
        observedAt: '2026-09-20T10:15:30.123+07:00',
      },
      ifMatch: caseEtag,
    },
  );
  if (
    item.data['rawUrl'] !== rawUrl ||
    item.data['externalItemId'] !== videoId ||
    item.data['normalizedUrl'] !== `https://www.youtube.com/watch?v=${videoId}` ||
    item.data['observedAt'] !== '2026-09-20T03:15:30.123Z'
  ) {
    fail('the reported item is not stored exactly with its derived id');
  }
  pass('reported item: raw URL kept, video id derived with its case, observedAt exact');
  noFinding('reported item', item.data);
  const caseAfterItem = await refreshCase();
  if (caseAfterItem.data['contextRevision'] !== (created.data['contextRevision'] as number) + 1) {
    fail('creating a reported item must move the case context revision once');
  }
  pass('the case context revision moved once');

  const work = await call(
    'POST /cases/{caseId}/works',
    'POST',
    `/cases/${caseId}/works`,
    201,
    contracts.CreateCaseWorkResponseSchema,
    {
      body: {
        title: `P4B CI synthetic work ${tag}`,
        sourceUrl: 'https://example.invalid/p4b-ci-publication',
        workType: 'SYNTHETIC recording',
      },
      ifMatch: (await refreshCase()).etag ?? '',
    },
  );
  noFinding('case work', work.data);
  const mapping = await call(
    'POST /cases/{caseId}/mappings',
    'POST',
    `/cases/${caseId}/mappings`,
    201,
    contracts.CreateUseMappingResponseSchema,
    {
      body: {
        caseWorkId: work.data.id,
        reportedItemId: item.data.id,
        occurrence: 1,
        sourceStartMs: '0',
        sourceEndMs: '108000000',
        reportedStartMs: '60000',
        reportedEndMs: '9007199254740991',
        rawTimecodes: { sourceStart: '0:00', sourceEnd: '30:00:00' },
        boundaryConvention: 'HALF_OPEN',
        provenance: 'OPERATOR_REPORTED',
        basisSourceId: source.data.id,
      },
      ifMatch: (await refreshCase()).etag ?? '',
    },
  );
  if (
    mapping.data['sourceEndMs'] !== '108000000' ||
    mapping.data['reportedEndMs'] !== '9007199254740991' ||
    mapping.data['provenance'] !== 'OPERATOR_REPORTED'
  ) {
    fail('the mapping is not stored exactly');
  }
  pass('use mapping: millisecond strings round-trip exactly (beyond 24 h and at the bound)');
  noFinding('use mapping', mapping.data);
  const mappingRead = await call(
    'GET /cases/{caseId}/mappings/{id}',
    'GET',
    `/cases/${caseId}/mappings/${mapping.data.id}`,
    200,
    contracts.GetUseMappingResponseSchema,
  );
  if (JSON.stringify(mappingRead.data) !== JSON.stringify(mapping.data)) {
    fail('the mapping read back differs');
  }

  const caseSource = await call(
    'POST /cases/{caseId}/sources',
    'POST',
    `/cases/${caseId}/sources`,
    201,
    contracts.LinkCaseSourceResponseSchema,
    {
      body: { sourceId: source.data.id, useRole: 'P4B_CI_SUPPORT', scopeNote: 'Synthetic' },
      ifMatch: (await refreshCase()).etag ?? '',
    },
  );
  const fact = await call(
    'POST /cases/{caseId}/facts',
    'POST',
    `/cases/${caseId}/facts`,
    201,
    contracts.CreateCaseFactResponseSchema,
    {
      body: {
        factType: 'PERMISSION',
        value: { finding: 'UNKNOWN', assertion: '', reviewScope: 'Not reviewed' },
        scopeKind: 'USE',
        mappingId: mapping.data.id,
        provenance: 'MISSING',
        scopeText: 'P4B CI synthetic scope',
        changeReason: 'P4B CI initial intake',
        sources: [
          {
            caseSourceId: caseSource.data.id,
            supportRole: 'P4B_CI_CONTEXT',
            supportedAssertion: 'Synthetic: the operator has not reviewed any permission',
          },
        ],
      },
      ifMatch: (await refreshCase()).etag ?? '',
    },
  );
  if (fact.etag !== null) fail('a fact revision is append-only and carries no ETag');
  if (fact.data['provenance'] !== 'MISSING' || fact.data['resolutionState'] !== 'UNASSESSED') {
    fail('a MISSING fact must stay MISSING and UNASSESSED');
  }
  pass('case fact: stored exactly; MISSING stays MISSING; no ETag');
  noFinding('case fact', fact.data);
  const revised = await call(
    'POST /cases/{caseId}/facts/{id}/revisions',
    'POST',
    `/cases/${caseId}/facts/${fact.data.id}/revisions`,
    201,
    contracts.ReviseCaseFactResponseSchema,
    {
      body: {
        factType: 'PERMISSION',
        value: {
          finding: 'NO_PERMISSION_REPORTED',
          assertion: 'Synthetic: the owner reports no licence',
          reviewScope: 'Synthetic owner statement only',
        },
        scopeKind: 'USE',
        mappingId: mapping.data.id,
        provenance: 'OPERATOR_REPORTED',
        scopeText: 'P4B CI synthetic scope',
        changeReason: 'P4B CI explicit revision',
        sources: [],
      },
      ifMatch: (await refreshCase()).etag ?? '',
    },
  );
  if (
    revised.data['revision'] !== 2 ||
    revised.data['supersedesFactId'] !== fact.data.id ||
    revised.data['factGroupId'] !== fact.data['factGroupId']
  ) {
    fail('the revision must supersede the head within its chain');
  }
  pass('fact revision 2 supersedes revision 1 in the same chain');
  const historical = await call(
    'GET /cases/{caseId}/facts/{id} (historical revision)',
    'GET',
    `/cases/${caseId}/facts/${fact.data.id}`,
    200,
    contracts.GetCaseFactResponseSchema,
  );
  if (JSON.stringify(historical.data) !== JSON.stringify(fact.data)) {
    fail('the historical revision changed');
  }
  pass('the historical revision reads back unchanged');
  const heads = await call(
    'GET /cases/{caseId}/facts',
    'GET',
    `/cases/${caseId}/facts`,
    200,
    contracts.ListCaseFactsResponseSchema,
  );
  const headIds = (heads.data as unknown as { items: Array<{ id: string }> }).items.map(
    (row) => row.id,
  );
  if (headIds.length !== 1 || headIds[0] !== revised.data.id)
    fail('the list must show the head only');
  pass('the fact list shows the current head only');

  // TB-SCHEMA-API-v1.2.0 (ADR-0005): each revision reads back exactly the supports recorded for it.
  async function readSupports(label: string, factId: string) {
    const read = await call(
      `GET /cases/{caseId}/facts/{id}/sources (${label})`,
      'GET',
      `/cases/${caseId}/facts/${factId}/sources`,
      200,
      contracts.GetCaseFactSourcesResponseSchema,
    );
    if (read.etag !== null) fail('recorded supports are append-only and carry no ETag');
    noFinding('recorded supports', read.data);
    return read.data as unknown as { factId: string; sources: Array<Record<string, unknown>> };
  }
  const firstSupports = await readSupports('revision 1', fact.data.id);
  const [recorded] = firstSupports.sources;
  if (
    firstSupports.factId !== fact.data.id ||
    firstSupports.sources.length !== 1 ||
    recorded?.['factId'] !== fact.data.id ||
    recorded['caseSourceId'] !== caseSource.data.id ||
    recorded['supportRole'] !== 'P4B_CI_CONTEXT' ||
    recorded['supportedAssertion'] !== 'Synthetic: the operator has not reviewed any permission'
  ) {
    fail('revision 1 must read back exactly its one recorded support');
  }
  pass('revision 1 reads back exactly its one recorded support');
  const secondSupports = await readSupports('revision 2', revised.data.id);
  if (secondSupports.factId !== revised.data.id || secondSupports.sources.length !== 0) {
    fail('revision 2 recorded no support and must read back none');
  }
  pass('revision 2 reads back no support: nothing is carried over from revision 1');

  // Pinning: a newer source revision re-points neither the case source link nor the facts.
  await call(
    'POST /sources/{id}/revisions',
    'POST',
    `/sources/${source.data.id}/revisions`,
    201,
    contracts.ReviseSourceResponseSchema,
    {
      body: {
        agencyId: agency.data.id,
        title: `P4B CI synthetic material ${tag}, revision 2`,
        sourceRole: 'OPERATOR_INPUT',
        scopeText: 'Synthetic CI scope',
      },
    },
  );
  const linkNow = await call(
    'GET /case-sources/{id}',
    'GET',
    `/case-sources/${caseSource.data.id}`,
    200,
    contracts.GetCaseSourceResponseSchema,
  );
  if (linkNow.data['sourceId'] !== source.data.id) fail('the link moved to a newer revision');
  const factNow = await call(
    'GET /cases/{caseId}/facts/{id}',
    'GET',
    `/cases/${caseId}/facts/${fact.data.id}`,
    200,
    contracts.GetCaseFactResponseSchema,
  );
  if (JSON.stringify(factNow.data) !== JSON.stringify(fact.data)) fail('the fact changed');
  pass('a newer source revision re-points neither the link nor the fact');
  const unchangedSupports = async (label: string) => {
    const now = await readSupports(`revision 1, ${label}`, fact.data.id);
    if (JSON.stringify(now) !== JSON.stringify(firstSupports)) {
      fail(`${label}: the recorded support must stay exactly as it was`);
    }
  };
  await unchangedSupports('after a newer source revision');
  pass('a newer source revision leaves the recorded support unchanged');
  // A link paused later is a state of the link, not of the support recorded through it.
  await call(
    'POST /case-sources/{id}/link-state (pause)',
    'POST',
    `/case-sources/${caseSource.data.id}/link-state`,
    200,
    contracts.SetCaseSourceLinkStateResponseSchema,
    { body: { state: 'PAUSED', reason: 'P4B CI synthetic pause' }, ifMatch: linkNow.etag ?? '' },
  );
  await unchangedSupports('link paused');
  pass('a paused link leaves the recorded support visible and unchanged');

  // Item edits with its own ETag; archive and restore are administrative.
  const patched = await call(
    'PATCH /cases/{caseId}/reported-items/{id}',
    'PATCH',
    `/cases/${caseId}/reported-items/${item.data.id}`,
    200,
    contracts.PatchReportedItemResponseSchema,
    { body: { displayTitle: `P4B CI corrected title ${tag}` }, ifMatch: item.etag ?? '' },
  );
  const stale = await call(
    'PATCH /cases/{caseId}/reported-items/{id} with a stale ETag',
    'PATCH',
    `/cases/${caseId}/reported-items/${item.data.id}`,
    412,
    null,
    { body: { displayTitle: 'x' }, ifMatch: item.etag ?? '' },
  );
  if (stale.code !== 'RECORD_VERSION_CONFLICT')
    fail('a stale ETag must be RECORD_VERSION_CONFLICT');
  const archived = await call(
    'POST /cases/{caseId}/reported-items/{id}/archive',
    'POST',
    `/cases/${caseId}/reported-items/${item.data.id}/archive`,
    200,
    contracts.ArchiveReportedItemResponseSchema,
    { body: { reason: 'P4B CI administrative archive' }, ifMatch: patched.etag ?? '' },
  );
  await call(
    'POST /cases/{caseId}/reported-items/{id}/restore',
    'POST',
    `/cases/${caseId}/reported-items/${item.data.id}/restore`,
    200,
    contracts.RestoreReportedItemResponseSchema,
    { body: { reason: 'P4B CI restore' }, ifMatch: archived.etag ?? '' },
  );
  await call(
    'GET /cases/{caseId}/reported-items',
    'GET',
    `/cases/${caseId}/reported-items`,
    200,
    contracts.ListCaseReportedItemsResponseSchema,
  );
  await call(
    'GET /cases/{caseId}/works',
    'GET',
    `/cases/${caseId}/works`,
    200,
    contracts.ListCaseCaseWorksResponseSchema,
  );
  await call(
    'GET /cases/{caseId}/mappings',
    'GET',
    `/cases/${caseId}/mappings`,
    200,
    contracts.ListCaseUseMappingsResponseSchema,
  );

  // Case isolation: another case of the same agency and route.
  const other = await call(
    'POST /cases (a second case on the same route)',
    'POST',
    '/cases',
    201,
    contracts.CreateCaseResponseSchema,
    {
      body: {
        agencyId: agency.data.id,
        routeId: route.data.id,
        intakeLabel: `P4B CI second intake ${tag}`,
      },
    },
  );
  const otherItem = await call(
    'POST /cases/{caseId}/reported-items (the same video in the second case)',
    'POST',
    `/cases/${other.data.id}/reported-items`,
    201,
    contracts.CreateReportedItemResponseSchema,
    { body: { rawUrl }, ifMatch: other.etag ?? '' },
  );
  if (otherItem.data.id === item.data.id)
    fail('the same video in another case must be its own record');
  const crossRead = await call(
    'GET /cases/{caseId}/reported-items/{id} through another case',
    'GET',
    `/cases/${other.data.id}/reported-items/${item.data.id}`,
    404,
    null,
  );
  if (crossRead.code !== 'NOT_FOUND') fail('another case’s item must be 404');
  const crossSupports = await call(
    'GET /cases/{caseId}/facts/{id}/sources through another case',
    'GET',
    `/cases/${other.data.id}/facts/${fact.data.id}/sources`,
    404,
    null,
  );
  if (crossSupports.code !== 'NOT_FOUND') fail('another case’s fact supports must be 404');
  const otherNow = await call(
    'GET /cases/{caseId} (second case)',
    'GET',
    `/cases/${other.data.id}`,
    200,
    contracts.GetCaseResponseSchema,
  );
  const crossMapping = await call(
    'POST /cases/{caseId}/mappings with another case’s work',
    'POST',
    `/cases/${other.data.id}/mappings`,
    422,
    null,
    {
      body: { caseWorkId: work.data.id, reportedItemId: otherItem.data.id, occurrence: 1 },
      ifMatch: otherNow.etag ?? '',
    },
  );
  if (crossMapping.code !== 'CROSS_CASE_REFERENCE') fail('a cross-case mapping must be refused');
  const channel = await call(
    'POST /cases/{caseId}/reported-items with a channel address',
    'POST',
    `/cases/${other.data.id}/reported-items`,
    422,
    null,
    { body: { rawUrl: 'https://www.youtube.com/@p4b-ci-channel' }, ifMatch: otherNow.etag ?? '' },
  );
  if (channel.code !== 'REPORTED_URL_UNSUPPORTED') fail('a non-video address must be refused');
  const oldHead = await call(
    'POST /cases/{caseId}/facts/{id}/revisions of a superseded revision',
    'POST',
    `/cases/${caseId}/facts/${fact.data.id}/revisions`,
    409,
    null,
    {
      body: {
        factType: 'PERMISSION',
        value: { finding: 'UNKNOWN', assertion: '', reviewScope: '' },
        scopeKind: 'USE',
        mappingId: mapping.data.id,
        provenance: 'MISSING',
        scopeText: 'x',
        changeReason: 'x',
        sources: [],
      },
      ifMatch: (await refreshCase()).etag ?? '',
    },
  );
  if (oldHead.code !== 'REVISION_NOT_HEAD') fail('only the head of a fact chain can be revised');

  // No readiness, G1–G7 or production write route exists (correspondence is routed since P4C and
  // has its own smoke, smoke:p4c; the GET-only production context since P4D, smoke:p4d; prompts
  // since P4E, smoke:p4e).
  for (const [label, method, suffix] of [
    ['GET /cases/{caseId}/readiness', 'GET', `/cases/${caseId}/readiness`],
    ['POST /cases/{caseId}/production-context', 'POST', `/cases/${caseId}/production-context`],
    [
      'POST /candidates/{id}/validation-runs',
      'POST',
      `/candidates/${randomUUID()}/validation-runs`,
    ],
    ['POST /cases/{caseId}/g1', 'POST', `/cases/${caseId}/g1`],
  ] as const) {
    const refused = await call(
      `${label} (not routed)`,
      method,
      suffix,
      404,
      null,
      method === 'POST' ? { body: {} } : {},
    );
    if (refused.code !== 'NOT_FOUND') fail(`${label} must not exist`);
  }

  const logout = await fetch(`${API}/auth/logout`, {
    method: 'POST',
    headers: { Cookie: cookie, Origin: origin, 'X-CSRF-Token': csrf },
  });
  if (logout.status !== 204) fail(`logout: HTTP ${logout.status}`);
  pass('logout → 204');
}

try {
  await main();
} catch (error) {
  console.error(`[smoke:p4b] FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  if (api && !exited) {
    api.kill('SIGTERM');
    for (let waited = 0; !exited && waited < 10_000; waited += 100) await sleep(100);
    if (!exited) {
      api.kill('SIGKILL');
      process.exitCode = 1;
    }
  }
  if (api && (await listening(3000))) {
    console.error('[smoke:p4b] FAIL port 3000 still in use');
    process.exitCode = 1;
  }
  console.log(`[smoke:p4b] ${process.exitCode ? 'FAIL' : 'PASS'} (${checks} checks)`);
}
