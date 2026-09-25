// yarn smoke:p3b --email <email> < password — P3B round trip against the COMPILED API, for CI only.
//
// It writes synthetic Directory, SourceReference and representation-authority records into the
// target database and leaves them there (sources and authority events are append-only and a frozen
// version is history), so it refuses to run unless CI=true: CI's tb_notice_dev is disposable, the
// operator's is not. The account is the synthetic CI admin created by `yarn admin:create`; the
// password is read from standard input. Requires a prior `yarn build`. No external requests; port
// 3000 is released.
//
// Flow (every response is checked against the ACTIVE contract and for Cache-Control: no-store):
//   login → Agency + its own source → Owner + LegalSubject → link → Route → Signer → Mandate →
//   MandateVersion (pinned to the source) → MandateCoverage over the route → CoverageSigner →
//   freeze (If-Match) → expected refusals: a frozen version gains no coverage (409 FROZEN_VERSION)
//   and a freeze with the pre-freeze ETag is 412 → Route preferredCoverageId (an operational
//   default) → AuthorityEvent scoped to the coverage, exactly as reported → expected refusals:
//   DOCUMENT_REVIEWED on an unreviewed source (422 REVIEW_UNSUPPORTED) and another agency's route
//   preferring this coverage (422 CROSS_AGENCY_REFERENCE) → lists → provenance unchanged → later
//   case phases (reported items) are not routed (404) → logout. Nothing here is authority, a G1–G7
//   decision, readiness, a signature or an external action.
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
  console.log(`[smoke:p3b] PASS ${message}`);
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
      'smoke:p3b writes directory, source and representation-authority records into the target ' +
        'database; it runs only in CI (CI=true) against the disposable CI database',
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
  const userId = loginBody.data.data.user.id;
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
      headers['Idempotency-Key'] = `p3b-ci-${randomUUID()}`;
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
  const agency = await call(
    'POST /agencies',
    'POST',
    '/agencies',
    201,
    contracts.CreateAgencyResponseSchema,
    { body: { displayName: `P3B CI synthetic agency ${tag}` } },
  );
  const source = await call(
    'POST /sources (agency agreement record)',
    'POST',
    '/sources',
    201,
    contracts.CreateSourceResponseSchema,
    {
      body: {
        agencyId: agency.data.id,
        title: `P3B CI synthetic agreement ${tag} (not evidence)`,
        sourceRole: 'CANONICAL_RECORD',
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
    { body: { displayName: `P3B CI synthetic brand ${tag}` } },
  );
  const subject = await call(
    'POST /legal-subjects',
    'POST',
    '/legal-subjects',
    201,
    contracts.CreateLegalSubjectResponseSchema,
    { body: { subjectType: 'LEGAL_ENTITY', legalName: `P3B CI synthetic subject ${tag}` } },
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
  const signer = await call(
    'POST /signers',
    'POST',
    '/signers',
    201,
    contracts.CreateSignerResponseSchema,
    { body: { agencyId: agency.data.id, fullLegalName: `P3B CI synthetic signer ${tag}` } },
  );

  const mandate = await call(
    'POST /mandates',
    'POST',
    '/mandates',
    201,
    contracts.CreateMandateResponseSchema,
    { body: { agencyId: agency.data.id, label: `P3B CI synthetic agreement ${tag}` } },
  );
  const version = await call(
    'POST /mandates/{id}/versions',
    'POST',
    `/mandates/${mandate.data.id}/versions`,
    201,
    contracts.CreateMandateVersionResponseSchema,
    {
      body: {
        changeKind: 'NEW_AUTHORIZATION',
        changeReason: 'P3B CI synthetic capture',
        primarySourceId: source.data.id,
        documentState: 'SIGNED_APPEARING',
      },
      ifMatch: mandate.etag ?? '',
    },
  );
  if (version.data['versionState'] !== 'DRAFT' || version.data['version'] !== 1) {
    fail('a new version is version 1, DRAFT');
  }
  if (version.data['sourceReviewState'] !== 'UNREVIEWED' || version.data['effectiveOn'] !== null) {
    fail('a version infers no review and no date');
  }
  const coverage = await call(
    'POST /mandate-versions/{id}/coverages',
    'POST',
    `/mandate-versions/${version.data.id}/coverages`,
    201,
    contracts.CreateCoverageResponseSchema,
    {
      body: {
        routeId: route.data.id,
        coverageLabel: `P3B CI synthetic coverage ${tag}`,
        actionScope: ['PREPARE_NOTICE'],
        basisSourceId: source.data.id,
      },
      ifMatch: version.etag ?? '',
    },
  );
  const coverageSigner = await call(
    'POST /coverages/{id}/signers',
    'POST',
    `/coverages/${coverage.data.id}/signers`,
    201,
    contracts.CreateCoverageSignerResponseSchema,
    {
      body: { signerId: signer.data.id, capacity: 'P3B CI synthetic capacity' },
      ifMatch: coverage.etag ?? '',
    },
  );
  if (coverageSigner.data['signerId'] === userId) fail('the application User is not a Signer');
  const draft = await call(
    'GET /mandate-versions/{id}',
    'GET',
    `/mandate-versions/${version.data.id}`,
    200,
    contracts.GetMandateVersionResponseSchema,
  );
  const frozen = await call(
    'POST /mandate-versions/{id}/freeze',
    'POST',
    `/mandate-versions/${version.data.id}/freeze`,
    200,
    contracts.FreezeMandateVersionResponseSchema,
    { body: { reason: 'P3B CI synthetic freeze' }, ifMatch: draft.etag ?? '' },
  );
  if (frozen.data['versionState'] !== 'FROZEN') fail('the version is not frozen');

  // Expected refusals: a frozen version gains no coverage; a stale freeze is not a second freeze.
  const late = await call(
    'POST coverage on the frozen version (expected refusal)',
    'POST',
    `/mandate-versions/${version.data.id}/coverages`,
    409,
    null,
    {
      body: { routeId: route.data.id, coverageLabel: `P3B CI late ${tag}` },
      ifMatch: frozen.etag ?? '',
    },
  );
  if (late.code !== 'FROZEN_VERSION') fail(`frozen refusal code ${late.code}`);
  const stale = await call(
    'freeze with the pre-freeze ETag (expected refusal)',
    'POST',
    `/mandate-versions/${version.data.id}/freeze`,
    412,
    null,
    { body: { reason: 'P3B CI stale freeze' }, ifMatch: draft.etag ?? '' },
  );
  if (stale.code !== 'RECORD_VERSION_CONFLICT') fail(`stale freeze code ${stale.code}`);

  const preferred = await call(
    'PATCH /routes/{id} preferredCoverageId',
    'PATCH',
    `/routes/${route.data.id}`,
    200,
    contracts.PatchRouteResponseSchema,
    { body: { preferredCoverageId: coverage.data.id }, ifMatch: route.etag ?? '' },
  );
  if (preferred.data['preferredCoverageId'] !== coverage.data.id) fail('preference not recorded');

  const mandateNow = await call(
    'GET /mandates/{id}',
    'GET',
    `/mandates/${mandate.data.id}`,
    200,
    contracts.GetMandateResponseSchema,
  );
  const event = await call(
    'POST /mandates/{id}/events',
    'POST',
    `/mandates/${mandate.data.id}/events`,
    201,
    contracts.RecordAuthorityEventResponseSchema,
    {
      body: {
        coverageId: coverage.data.id,
        eventType: 'CURRENTNESS_RECORDED',
        sourceId: source.data.id,
        provenance: 'OPERATOR_REPORTED',
        effectiveOn: '2026-01-01',
        scopeText: 'P3B CI synthetic coverage scope',
        interpretation: 'P3B CI synthetic operator reading',
      },
      ifMatch: mandateNow.etag ?? '',
    },
  );
  if (event.etag !== null) fail('an append-only authority event carries no ETag');
  if (event.data['effectiveOn'] !== '2026-01-01' || event.data['effectiveAt'] !== null) {
    fail('event dates must be stored exactly as supplied');
  }

  // Expected refusals: no provenance upgrade; no cross-agency preference.
  const mandateAfterEvent = await call(
    'GET /mandates/{id} (after the event)',
    'GET',
    `/mandates/${mandate.data.id}`,
    200,
    contracts.GetMandateResponseSchema,
  );
  const unreviewed = await call(
    'DOCUMENT_REVIEWED event on an unreviewed source (expected refusal)',
    'POST',
    `/mandates/${mandate.data.id}/events`,
    422,
    null,
    {
      body: {
        eventType: 'CURRENTNESS_RECORDED',
        sourceId: source.data.id,
        provenance: 'DOCUMENT_REVIEWED',
        scopeText: 'P3B CI synthetic whole mandate',
        interpretation: 'P3B CI synthetic claim',
      },
      ifMatch: mandateAfterEvent.etag ?? '',
    },
  );
  if (unreviewed.code !== 'REVIEW_UNSUPPORTED') fail(`review refusal code ${unreviewed.code}`);
  const otherAgency = await call(
    'POST /agencies (second agency)',
    'POST',
    '/agencies',
    201,
    contracts.CreateAgencyResponseSchema,
    { body: { displayName: `P3B CI synthetic agency B ${tag}` } },
  );
  const otherSubject = await call(
    'POST /legal-subjects (second subject)',
    'POST',
    '/legal-subjects',
    201,
    contracts.CreateLegalSubjectResponseSchema,
    { body: { subjectType: 'LEGAL_ENTITY', legalName: `P3B CI synthetic subject B ${tag}` } },
  );
  const ownerNow = await call(
    'GET /owners/{id}',
    'GET',
    `/owners/${owner.data.id}`,
    200,
    contracts.GetOwnerResponseSchema,
  );
  const otherLink = await call(
    'POST /owners/{id}/subjects (second link)',
    'POST',
    `/owners/${owner.data.id}/subjects`,
    201,
    contracts.LinkOwnerSubjectResponseSchema,
    { body: { legalSubjectId: otherSubject.data.id }, ifMatch: ownerNow.etag ?? '' },
  );
  const otherRoute = await call(
    'POST /routes (second agency)',
    'POST',
    '/routes',
    201,
    contracts.CreateRouteResponseSchema,
    { body: { agencyId: otherAgency.data.id, ownerSubjectId: otherLink.data.id } },
  );
  const cross = await call(
    'second agency route prefers the first agency coverage (expected refusal)',
    'PATCH',
    `/routes/${otherRoute.data.id}`,
    422,
    null,
    { body: { preferredCoverageId: coverage.data.id }, ifMatch: otherRoute.etag ?? '' },
  );
  if (cross.code !== 'CROSS_AGENCY_REFERENCE') fail(`cross-agency refusal code ${cross.code}`);

  const lists: Array<[string, string, Parser]> = [
    [
      'GET /mandates?agencyId=',
      `/mandates?agencyId=${agency.data.id}`,
      contracts.ListMandatesResponseSchema,
    ],
    [
      'GET /mandates/{id}/versions',
      `/mandates/${mandate.data.id}/versions`,
      contracts.ListMandateVersionsResponseSchema,
    ],
    [
      'GET /mandate-versions/{id}/coverages',
      `/mandate-versions/${version.data.id}/coverages`,
      contracts.ListVersionCoveragesResponseSchema,
    ],
    [
      'GET /coverages/{id}/signers',
      `/coverages/${coverage.data.id}/signers`,
      contracts.ListCoverageSignersResponseSchema,
    ],
    [
      'GET /mandates/{id}/events',
      `/mandates/${mandate.data.id}/events`,
      contracts.ListAuthorityEventsResponseSchema,
    ],
  ];
  for (const [label, listPath, schema] of lists) {
    const page = await call(label, 'GET', listPath, 200, schema);
    const items = (page.data as unknown as { items: unknown[] }).items;
    if (items.length !== 1) fail(`${label}: expected exactly one item, got ${items.length}`);
  }
  const sourceNow = await call(
    'GET /sources/{id}',
    'GET',
    `/sources/${source.data.id}`,
    200,
    contracts.GetSourceResponseSchema,
  );
  if (sourceNow.data['reportedProvenance'] !== 'OPERATOR_REPORTED') {
    fail('no P3B record may upgrade a source provenance');
  }
  pass('the source provenance is unchanged by version, coverage, freeze and event');
  await call(
    'POST /cases/{caseId}/correspondence-bindings (later phase, not routed)',
    'POST',
    `/cases/${randomUUID()}/correspondence-bindings`,
    404,
    null,
    {
      body: {},
    },
  );

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
  console.error(`[smoke:p3b] FAIL ${error instanceof Error ? error.message : String(error)}`);
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
    console.error('[smoke:p3b] FAIL port 3000 still in use');
    process.exitCode = 1;
  }
  console.log(`[smoke:p3b] ${process.exitCode ? 'FAIL' : 'PASS'} (${checks} checks)`);
}
