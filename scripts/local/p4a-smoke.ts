// yarn smoke:p4a --email <email> < password — P4A round trip against the COMPILED API, for CI only.
//
// It writes synthetic Directory, SourceReference, representation-authority and case records into
// the target database and leaves them there (sources are append-only, a frozen version and an
// authority selection are history), so it refuses to run unless CI=true: CI's tb_notice_dev is
// disposable, the operator's is not. The account is the synthetic CI admin created by
// `yarn admin:create`; the password is read from standard input. Requires a prior `yarn build`. No
// external requests; port 3000 is released.
//
// Flow (every response is checked against the ACTIVE contract and for Cache-Control: no-store):
//   login → Agency + its own sources → Owner + LegalSubject → link → Route → Signer → Mandate →
//   version → coverage over the route → coverage signer → freeze → the route's preferred coverage →
//   Case (only the supplied fields; no route, selection or canonical id inferred) → PATCH →
//   route binding (the preferred coverage is NOT selected) → case source link → its state paused
//   and linked again with the link's own ETag → canonical case id → authority selection (pins the
//   chain for evaluation; no ETag; the case points to it) → its read-back with the exact pinned
//   coverage row (TB-SCHEMA-API-v1.1.0, ADR-0004) → lists → workflow → expected refusals: another
//   agency's route (422 CROSS_AGENCY_REFERENCE), another case's source (422 CROSS_CASE_REFERENCE),
//   the selection read through another case (404), the application User as signer (422
//   REFERENCE_NOT_FOUND), a stale case ETag (412) and a link on an archived case (409) → archive /
//   restore → deletion of an unused case → provenance unchanged → later case phases are not routed
//   (404) → logout. Nothing here is authority, a G1–G7 decision, readiness, a signature or an
//   external action.
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
  console.log(`[smoke:p4a] PASS ${message}`);
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
      'smoke:p4a writes directory, source, authority and case records into the target database; ' +
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
      headers['Idempotency-Key'] = `p4a-ci-${randomUUID()}`;
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
    { body: { displayName: `P4A CI synthetic agency ${tag}` } },
  );
  const source = await call(
    'POST /sources (agency record)',
    'POST',
    '/sources',
    201,
    contracts.CreateSourceResponseSchema,
    {
      body: {
        agencyId: agency.data.id,
        title: `P4A CI synthetic agreement ${tag} (not evidence)`,
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
    {
      body: { displayName: `P4A CI synthetic brand ${tag}` },
    },
  );
  const subject = await call(
    'POST /legal-subjects',
    'POST',
    '/legal-subjects',
    201,
    contracts.CreateLegalSubjectResponseSchema,
    { body: { subjectType: 'LEGAL_ENTITY', legalName: `P4A CI synthetic subject ${tag}` } },
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
    {
      body: { agencyId: agency.data.id, ownerSubjectId: link.data.id },
    },
  );
  const signer = await call(
    'POST /signers',
    'POST',
    '/signers',
    201,
    contracts.CreateSignerResponseSchema,
    {
      body: { agencyId: agency.data.id, fullLegalName: `P4A CI synthetic signer ${tag}` },
    },
  );
  const mandate = await call(
    'POST /mandates',
    'POST',
    '/mandates',
    201,
    contracts.CreateMandateResponseSchema,
    { body: { agencyId: agency.data.id, label: `P4A CI synthetic agreement ${tag}` } },
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
        changeReason: 'P4A CI synthetic capture',
        primarySourceId: source.data.id,
        documentState: 'SIGNED_APPEARING',
      },
      ifMatch: mandate.etag ?? '',
    },
  );
  const coverage = await call(
    'POST /mandate-versions/{id}/coverages',
    'POST',
    `/mandate-versions/${version.data.id}/coverages`,
    201,
    contracts.CreateCoverageResponseSchema,
    {
      body: {
        routeId: route.data.id,
        coverageLabel: `P4A CI synthetic coverage ${tag}`,
        actionScope: ['PREPARE_NOTICE'],
        basisSourceId: source.data.id,
      },
      ifMatch: version.etag ?? '',
    },
  );
  await call(
    'POST /coverages/{id}/signers',
    'POST',
    `/coverages/${coverage.data.id}/signers`,
    201,
    contracts.CreateCoverageSignerResponseSchema,
    {
      body: { signerId: signer.data.id, capacity: 'P4A CI synthetic capacity' },
      ifMatch: coverage.etag ?? '',
    },
  );
  const draft = await call(
    'GET /mandate-versions/{id}',
    'GET',
    `/mandate-versions/${version.data.id}`,
    200,
    contracts.GetMandateVersionResponseSchema,
  );
  await call(
    'POST /mandate-versions/{id}/freeze',
    'POST',
    `/mandate-versions/${version.data.id}/freeze`,
    200,
    contracts.FreezeMandateVersionResponseSchema,
    { body: { reason: 'P4A CI synthetic freeze' }, ifMatch: draft.etag ?? '' },
  );
  await call(
    'PATCH /routes/{id} preferredCoverageId (operational default)',
    'PATCH',
    `/routes/${route.data.id}`,
    200,
    contracts.PatchRouteResponseSchema,
    { body: { preferredCoverageId: coverage.data.id }, ifMatch: route.etag ?? '' },
  );

  // The case: exactly the supplied fields.
  const created = await call(
    'POST /cases',
    'POST',
    '/cases',
    201,
    contracts.CreateCaseResponseSchema,
    {
      body: { agencyId: agency.data.id, intakeLabel: `P4A CI synthetic intake ${tag}` },
    },
  );
  if (
    created.data['routeId'] !== null ||
    created.data['currentAuthoritySelectionId'] !== null ||
    created.data['canonicalCaseId'] !== null ||
    created.data['workflowState'] !== 'INTAKE' ||
    created.data['contextRevision'] !== 1
  ) {
    fail('a new case infers no route, selection, canonical id or state');
  }
  const caseId = created.data.id;
  const patched = await call(
    'PATCH /cases/{id}',
    'PATCH',
    `/cases/${caseId}`,
    200,
    contracts.PatchCaseResponseSchema,
    { body: { notes: 'P4A CI synthetic note' }, ifMatch: created.etag ?? '' },
  );
  const bound = await call(
    'POST /cases/{id}/route-binding',
    'POST',
    `/cases/${caseId}/route-binding`,
    200,
    contracts.RouteBindingCaseResponseSchema,
    {
      body: { routeId: route.data.id, reason: 'P4A CI synthetic binding' },
      ifMatch: patched.etag ?? '',
    },
  );
  if (bound.data['currentAuthoritySelectionId'] !== null) {
    fail('a route binding selects nothing (not even the preferred coverage)');
  }
  const linked = await call(
    'POST /cases/{id}/sources',
    'POST',
    `/cases/${caseId}/sources`,
    201,
    contracts.LinkCaseSourceResponseSchema,
    {
      body: {
        sourceId: source.data.id,
        useRole: 'PACKET',
        scopeNote: 'P4A CI synthetic scope note',
      },
      ifMatch: bound.etag ?? '',
    },
  );
  const linkNow = await call(
    'GET /case-sources/{id}',
    'GET',
    `/case-sources/${linked.data.id}`,
    200,
    contracts.GetCaseSourceResponseSchema,
  );
  const paused = await call(
    'POST /case-sources/{id}/link-state PAUSED',
    'POST',
    `/case-sources/${linked.data.id}/link-state`,
    200,
    contracts.SetCaseSourceLinkStateResponseSchema,
    { body: { state: 'PAUSED', reason: 'P4A CI synthetic pause' }, ifMatch: linkNow.etag ?? '' },
  );
  await call(
    'POST /case-sources/{id}/link-state LINKED',
    'POST',
    `/case-sources/${linked.data.id}/link-state`,
    200,
    contracts.SetCaseSourceLinkStateResponseSchema,
    { body: { state: 'LINKED', reason: 'P4A CI synthetic relink' }, ifMatch: paused.etag ?? '' },
  );
  const beforeCanonical = await call(
    'GET /cases/{id}',
    'GET',
    `/cases/${caseId}`,
    200,
    contracts.GetCaseResponseSchema,
  );
  const canonical = await call(
    'POST /cases/{id}/canonical-binding',
    'POST',
    `/cases/${caseId}/canonical-binding`,
    200,
    contracts.CanonicalBindingCaseResponseSchema,
    {
      body: {
        canonicalCode: `P4A-CI-${tag}`,
        sourceId: source.data.id,
        reason: 'P4A CI synthetic code',
      },
      ifMatch: beforeCanonical.etag ?? '',
    },
  );
  const selection = await call(
    'POST /cases/{id}/authority-selections',
    'POST',
    `/cases/${caseId}/authority-selections`,
    201,
    contracts.SelectCaseAuthorityResponseSchema,
    {
      body: {
        routeId: route.data.id,
        signerId: signer.data.id,
        taskType: 'INITIAL',
        intendedFromEmail: 'p4a-ci-sender@example.invalid',
        selectionNote: 'P4A CI synthetic selection for evaluation',
        coverages: [{ coverageId: coverage.data.id, applicationScope: 'P4A CI synthetic scope' }],
      },
      ifMatch: canonical.etag ?? '',
    },
  );
  if (selection.etag !== null) fail('an append-only selection carries no ETag');
  if (selection.data['signerId'] === userId) fail('the application User is not a Signer');
  const afterSelection = await call(
    'GET /cases/{id} (after the selection)',
    'GET',
    `/cases/${caseId}`,
    200,
    contracts.GetCaseResponseSchema,
  );
  if (afterSelection.data['currentAuthoritySelectionId'] !== selection.data.id) {
    fail('the case points to the selection it recorded');
  }
  pass('the selection pins the chosen chain for evaluation; nothing else changed state');
  // TB-SCHEMA-API-v1.1.0 (ADR-0004): the selection reads back with exactly the row it pinned.
  const readBack = await call(
    'GET /cases/{id}/authority-selections/{id} (read-back)',
    'GET',
    `/cases/${caseId}/authority-selections/${selection.data.id}`,
    200,
    contracts.GetCaseAuthoritySelectionResponseSchema,
  );
  if (readBack.etag !== null) fail('the read-back of an append-only selection carries no ETag');
  const pinned = readBack.data as unknown as {
    selection: Data;
    coverages: Array<Record<string, unknown>>;
  };
  if (JSON.stringify(pinned.selection) !== JSON.stringify(selection.data)) {
    fail('the read-back returns the stored selection exactly');
  }
  const [pinnedRow, ...morePinned] = pinned.coverages;
  if (
    morePinned.length > 0 ||
    pinnedRow?.['coverageId'] !== coverage.data.id ||
    pinnedRow['applicationScope'] !== 'P4A CI synthetic scope' ||
    pinnedRow['selectionId'] !== selection.data.id ||
    pinnedRow['caseId'] !== caseId
  ) {
    fail('the read-back returns the one pinned coverage row exactly as stored');
  }
  pass('the selection reads back with the exact coverage and application scope it pinned');

  const lists: Array<[string, string, Parser]> = [
    [
      'GET /cases?agencyId=',
      `/cases?agencyId=${agency.data.id}`,
      contracts.ListCasesResponseSchema,
    ],
    [
      'GET /cases/{id}/sources',
      `/cases/${caseId}/sources`,
      contracts.ListCaseSourcesResponseSchema,
    ],
    [
      'GET /cases/{id}/authority-selections',
      `/cases/${caseId}/authority-selections`,
      contracts.ListCaseAuthoritySelectionsResponseSchema,
    ],
  ];
  for (const [label, listPath, schema] of lists) {
    const page = await call(label, 'GET', listPath, 200, schema);
    const items = (page.data as unknown as { items: unknown[] }).items;
    if (items.length !== 1) fail(`${label}: expected exactly one item, got ${items.length}`);
  }
  const moved = await call(
    'POST /cases/{id}/workflow',
    'POST',
    `/cases/${caseId}/workflow`,
    200,
    contracts.WorkflowCaseResponseSchema,
    {
      body: { state: 'PREPARING', reason: 'P4A CI synthetic workflow' },
      ifMatch: afterSelection.etag ?? '',
    },
  );

  // Expected refusals.
  const otherAgency = await call(
    'POST /agencies (second agency)',
    'POST',
    '/agencies',
    201,
    contracts.CreateAgencyResponseSchema,
    { body: { displayName: `P4A CI synthetic agency B ${tag}` } },
  );
  const foreignCase = await call(
    'POST /cases (second agency)',
    'POST',
    '/cases',
    201,
    contracts.CreateCaseResponseSchema,
    { body: { agencyId: otherAgency.data.id, intakeLabel: `P4A CI synthetic intake B ${tag}` } },
  );
  const crossAgency = await call(
    'second agency case binds the first agency route (expected refusal)',
    'POST',
    `/cases/${foreignCase.data.id}/route-binding`,
    422,
    null,
    {
      body: { routeId: route.data.id, reason: 'P4A CI cross agency' },
      ifMatch: foreignCase.etag ?? '',
    },
  );
  if (crossAgency.code !== 'CROSS_AGENCY_REFERENCE') fail(`cross-agency code ${crossAgency.code}`);
  const sibling = await call(
    'POST /cases (sibling case)',
    'POST',
    '/cases',
    201,
    contracts.CreateCaseResponseSchema,
    { body: { agencyId: agency.data.id, intakeLabel: `P4A CI synthetic sibling ${tag}` } },
  );
  const throughSibling = await call(
    'the selection read through another case (expected refusal)',
    'GET',
    `/cases/${sibling.data.id}/authority-selections/${selection.data.id}`,
    404,
    null,
  );
  if (throughSibling.code !== 'NOT_FOUND') fail(`cross-case read code ${throughSibling.code}`);
  const siblingSource = await call(
    'POST /sources (scoped to the sibling case)',
    'POST',
    '/sources',
    201,
    contracts.CreateSourceResponseSchema,
    {
      body: {
        title: `P4A CI synthetic sibling record ${tag}`,
        sourceRole: 'OPERATOR_INPUT',
        scopeText: 'Synthetic CI scope',
        scopeBindings: { caseIds: [sibling.data.id] },
      },
    },
  );
  const crossCase = await call(
    'link another case’s source (expected refusal)',
    'POST',
    `/cases/${caseId}/sources`,
    422,
    null,
    {
      body: { sourceId: siblingSource.data.id, useRole: 'CONTEXT', scopeNote: 'P4A CI cross case' },
      ifMatch: moved.etag ?? '',
    },
  );
  if (crossCase.code !== 'CROSS_CASE_REFERENCE') fail(`cross-case code ${crossCase.code}`);
  const userAsSigner = await call(
    'the application User as signer (expected refusal)',
    'POST',
    `/cases/${caseId}/authority-selections`,
    422,
    null,
    {
      body: {
        routeId: route.data.id,
        signerId: userId,
        taskType: 'INITIAL',
        intendedFromEmail: 'p4a-ci-sender@example.invalid',
        selectionNote: 'P4A CI synthetic refusal',
        coverages: [{ coverageId: coverage.data.id, applicationScope: 'P4A CI synthetic scope' }],
      },
      ifMatch: moved.etag ?? '',
    },
  );
  if (userAsSigner.code !== 'REFERENCE_NOT_FOUND') fail(`user-as-signer code ${userAsSigner.code}`);
  const stale = await call(
    'a write with a stale case ETag (expected refusal)',
    'PATCH',
    `/cases/${caseId}`,
    412,
    null,
    { body: { notes: 'P4A CI stale' }, ifMatch: created.etag ?? '' },
  );
  if (stale.code !== 'RECORD_VERSION_CONFLICT') fail(`stale code ${stale.code}`);
  const archived = await call(
    'POST /cases/{id}/archive',
    'POST',
    `/cases/${caseId}/archive`,
    200,
    contracts.ArchiveCaseResponseSchema,
    { body: { reason: 'P4A CI synthetic archive' }, ifMatch: moved.etag ?? '' },
  );
  const readOnly = await call(
    'a link on the archived case (expected refusal)',
    'POST',
    `/cases/${caseId}/sources`,
    409,
    null,
    {
      body: { sourceId: source.data.id, useRole: 'CONTEXT', scopeNote: 'P4A CI archived' },
      ifMatch: archived.etag ?? '',
    },
  );
  if (readOnly.code !== 'RECORD_STATE_CONFLICT') fail(`archived code ${readOnly.code}`);
  await call(
    'POST /cases/{id}/restore',
    'POST',
    `/cases/${caseId}/restore`,
    200,
    contracts.RestoreCaseResponseSchema,
    { body: { reason: 'P4A CI synthetic restore' }, ifMatch: archived.etag ?? '' },
  );
  await call(
    'DELETE /cases/{id} (unused second-agency case)',
    'DELETE',
    `/cases/${foreignCase.data.id}`,
    204,
    null,
    {
      ifMatch: foreignCase.etag ?? '',
    },
  );
  const sourceNow = await call(
    'GET /sources/{id}',
    'GET',
    `/sources/${source.data.id}`,
    200,
    contracts.GetSourceResponseSchema,
  );
  if (sourceNow.data['reportedProvenance'] !== 'OPERATOR_REPORTED') {
    fail('no case record may upgrade a source provenance');
  }
  pass('the source provenance is unchanged by link, canonical binding and selection');
  await call(
    'POST /cases/{caseId}/reported-items (later phase, not routed)',
    'POST',
    `/cases/${caseId}/reported-items`,
    404,
    null,
    { body: {} },
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
  console.error(`[smoke:p4a] FAIL ${error instanceof Error ? error.message : String(error)}`);
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
    console.error('[smoke:p4a] FAIL port 3000 still in use');
    process.exitCode = 1;
  }
  console.log(`[smoke:p4a] ${process.exitCode ? 'FAIL' : 'PASS'} (${checks} checks)`);
}
