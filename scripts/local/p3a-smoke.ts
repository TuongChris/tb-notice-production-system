// yarn smoke:p3a --email <email> < password — P3A round trip against the COMPILED API, for CI only.
//
// It writes synthetic Directory, SourceReference and Route records into the target database and
// leaves them there (sources are append-only and a bound record is not a discardable draft), so it
// refuses to run unless CI=true: CI's tb_notice_dev is disposable, the operator's is not. The
// account is the synthetic CI admin created by `yarn admin:create`; the password is read from
// standard input. Requires a prior `yarn build`. No external requests; port 3000 is released.
//
// Flow (every response is checked against the ACTIVE contract and for Cache-Control: no-store):
//   login → Agency + its own canonical-record source → bind the Agency → Owner + LegalSubject →
//   link them (Owner ETag) → a source scoped to the subject → bind the subject → a public source →
//   bind the Owner → Route (Agency + link + YouTube) → a route source → bind the Route → revise the
//   route source (the Route keeps pointing at revision 1) → expected refusal: another Agency cannot
//   bind the first Agency's source (422 CROSS_AGENCY_REFERENCE) → list by agency and by link →
//   mandates (P3B) are not routed (404) → logout. No mandate, coverage, case, signing or sending
//   exists in this flow.
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
  console.log(`[smoke:p3a] PASS ${message}`);
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
      'smoke:p3a writes directory, source and route records into the target database; it runs ' +
        'only in CI (CI=true) against the disposable CI database',
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
      headers['Idempotency-Key'] = `p3a-ci-${randomUUID()}`;
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
  const source = async (label: string, body: Record<string, unknown>) => {
    const created = await call(
      label,
      'POST',
      '/sources',
      201,
      contracts.CreateSourceResponseSchema,
      {
        body: {
          title: `P3A CI synthetic source ${tag} (not evidence)`,
          sourceRole: 'CANONICAL_RECORD',
          scopeText: 'Synthetic CI scope',
          ...body,
        },
      },
    );
    if (created.etag !== null) fail(`${label}: an immutable source must not carry an ETag`);
    if (created.data['reportedProvenance'] !== 'OPERATOR_REPORTED') {
      fail(`${label}: provenance must stay OPERATOR_REPORTED unless reported otherwise`);
    }
    return created.data;
  };
  const bind = async (
    label: string,
    route: string,
    etag: string,
    sourceId: string,
    schema: Parser,
    code: string,
  ) => {
    const bound = await call(label, 'POST', `${route}/canonical-bindings`, 200, schema, {
      body: { canonicalCode: `${code}-${tag}`, sourceId, reason: 'P3A CI synthetic binding' },
      ifMatch: etag,
    });
    if (bound.data['canonicalSourceId'] !== sourceId) fail(`${label}: wrong canonical source`);
    if (bound.data['bindingState'] !== 'SOURCE_REFERENCED') fail(`${label}: not source-referenced`);
    return bound;
  };

  const agency = await call(
    'POST /agencies',
    'POST',
    '/agencies',
    201,
    contracts.CreateAgencyResponseSchema,
    {
      body: { displayName: `P3A CI synthetic agency ${tag}` },
    },
  );
  const agencySource = await source('POST /sources (agency canonical record)', {
    agencyId: agency.data.id,
  });
  const boundAgency = await bind(
    'bind Agency',
    `/agencies/${agency.data.id}`,
    agency.etag ?? '',
    agencySource.id,
    contracts.BindCanonicalAgencyResponseSchema,
    'SYN-AG',
  );
  if (boundAgency.data['recordState'] !== 'DRAFT') fail('binding must not change the record state');

  const owner = await call(
    'POST /owners',
    'POST',
    '/owners',
    201,
    contracts.CreateOwnerResponseSchema,
    {
      body: { displayName: `P3A CI synthetic brand ${tag}` },
    },
  );
  const subject = await call(
    'POST /legal-subjects',
    'POST',
    '/legal-subjects',
    201,
    contracts.CreateLegalSubjectResponseSchema,
    { body: { subjectType: 'LEGAL_ENTITY', legalName: `P3A CI synthetic subject ${tag}` } },
  );
  const link = await call(
    'POST /owners/{id}/subjects (link)',
    'POST',
    `/owners/${owner.data.id}/subjects`,
    201,
    contracts.LinkOwnerSubjectResponseSchema,
    { body: { legalSubjectId: subject.data.id }, ifMatch: owner.etag ?? '' },
  );
  const subjectSource = await source('POST /sources (scoped to the subject)', {
    scopeBindings: { legalSubjectIds: [subject.data.id] },
  });
  await bind(
    'bind LegalSubject',
    `/legal-subjects/${subject.data.id}`,
    subject.etag ?? '',
    subjectSource.id,
    contracts.BindCanonicalLegalSubjectResponseSchema,
    'SYN-LS',
  );
  const ownerNow = await call(
    'GET /owners/{id}',
    'GET',
    `/owners/${owner.data.id}`,
    200,
    contracts.GetOwnerResponseSchema,
  );
  const publicSource = await source('POST /sources (public, owner namespace)', {});
  await bind(
    'bind Owner',
    `/owners/${owner.data.id}`,
    ownerNow.etag ?? '',
    publicSource.id,
    contracts.BindCanonicalOwnerResponseSchema,
    'SYN-OW',
  );

  const route = await call(
    'POST /routes',
    'POST',
    '/routes',
    201,
    contracts.CreateRouteResponseSchema,
    {
      body: { agencyId: agency.data.id, ownerSubjectId: link.data.id },
    },
  );
  if (route.data['linkState'] !== 'LINKED' || route.data['platform'] !== 'YOUTUBE') {
    fail('a new route is LINKED on YOUTUBE');
  }
  const routeSource = await source('POST /sources (route record)', {
    agencyId: agency.data.id,
    scopeBindings: { legalSubjectIds: [subject.data.id] },
  });
  await bind(
    'bind Route',
    `/routes/${route.data.id}`,
    route.etag ?? '',
    routeSource.id,
    contracts.BindCanonicalRouteResponseSchema,
    'SYN-RT',
  );
  const revised = await call(
    'POST /sources/{id}/revisions',
    'POST',
    `/sources/${routeSource.id}/revisions`,
    201,
    contracts.ReviseSourceResponseSchema,
    {
      body: {
        agencyId: agency.data.id,
        scopeBindings: { legalSubjectIds: [subject.data.id] },
        title: `P3A CI synthetic source ${tag} (revision 2, not evidence)`,
        sourceRole: 'CANONICAL_RECORD',
        scopeText: 'Synthetic CI scope',
      },
    },
  );
  if (revised.data['revision'] !== 2 || revised.data['supersedesSourceId'] !== routeSource.id) {
    fail('the revision is not the successor of revision 1');
  }
  const routeNow = await call(
    'GET /routes/{id}',
    'GET',
    `/routes/${route.data.id}`,
    200,
    contracts.GetRouteResponseSchema,
  );
  if (routeNow.data['canonicalSourceId'] !== routeSource.id) {
    fail('a revision must not re-point an existing binding');
  }
  pass('the route keeps pointing at revision 1 after the source was revised');

  // Expected refusal: the first agency's own source cannot support another agency.
  const other = await call(
    'POST /agencies (second agency)',
    'POST',
    '/agencies',
    201,
    contracts.CreateAgencyResponseSchema,
    {
      body: { displayName: `P3A CI synthetic agency B ${tag}` },
    },
  );
  const refused = await call(
    'bind Agency B with Agency A’s source (expected refusal)',
    'POST',
    `/agencies/${other.data.id}/canonical-bindings`,
    422,
    null,
    {
      body: { canonicalCode: `SYN-B-${tag}`, sourceId: agencySource.id, reason: 'P3A CI refusal' },
      ifMatch: other.etag ?? '',
    },
  );
  if (refused.code !== 'CROSS_AGENCY_REFERENCE') fail(`refusal code ${refused.code}`);

  const byAgency = await call(
    'GET /sources?agencyId=',
    'GET',
    `/sources?agencyId=${agency.data.id}`,
    200,
    contracts.ListSourcesResponseSchema,
  );
  const heads = (byAgency.data as unknown as { items: Array<{ id: string }> }).items.map(
    (item) => item.id,
  );
  if (
    !heads.includes(agencySource.id) ||
    !heads.includes(revised.data.id) ||
    heads.includes(routeSource.id)
  ) {
    fail('the agency source list must show current revisions only');
  }
  const byLink = await call(
    'GET /routes?q=<link id>',
    'GET',
    `/routes?q=${link.data.id}`,
    200,
    contracts.ListRoutesResponseSchema,
  );
  if ((byLink.data as unknown as { items: Array<{ id: string }> }).items[0]?.id !== route.data.id) {
    fail('the route of the link is not listed');
  }
  await call('POST /mandates (P3B, not routed)', 'POST', '/mandates', 404, null, { body: {} });

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
  console.error(`[smoke:p3a] FAIL ${error instanceof Error ? error.message : String(error)}`);
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
    console.error('[smoke:p3a] FAIL port 3000 still in use');
    process.exitCode = 1;
  }
  console.log(`[smoke:p3a] ${process.exitCode ? 'FAIL' : 'PASS'} (${checks} checks)`);
}
