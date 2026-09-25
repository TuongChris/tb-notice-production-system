// yarn smoke:p4c --email <email> < password — P4C round trip against the COMPILED API, for CI only.
//
// It writes synthetic Directory, SourceReference, case, reported-item, correspondence and
// correspondence-binding records into the target database and leaves them there (captures and
// bindings are append-only history), so it refuses to run unless CI=true: CI's tb_notice_dev is
// disposable, the operator's is not. The account is the synthetic CI admin created by
// `yarn admin:create`; the password is read from standard input. Requires a prior `yarn build`. No
// external requests: nothing is sent, fetched, acknowledged or marked read; port 3000 is released.
//
// Flow (every response is checked against the ACTIVE contract and for Cache-Control: no-store):
//   login → Agency A + its raw-message source → Agency B → case of A with two reported items →
//   another case of A with its own item → inbound NMI captured (copied full text, exact body,
//   raw header date only: occurredAt stays null, body hash = SHA-256 of the recorded text, no
//   identity hash) → outbound historical transmission captured (raw source, attachment
//   observations) → a capture creates no binding and changes no case → NMI bound to the case (case
//   context revision +1) → the outbound message bound explicitly as INITIAL_AS_SENT to both items
//   (one message, two bindings) → item-specific outcomes (A REMOVED, B REJECTED) from a decision
//   message → a corrective binding supersedes the NMI binding; the earlier one stays, a second
//   correction of it is 409 → history read back; the captures are unchanged and still three →
//   expected refusals: an OUTCOME without an item (422 OUTCOME_ITEM_REQUIRED), agency B's message
//   in A's case (422 CROSS_AGENCY_REFERENCE), another case's item (422 CROSS_CASE_REFERENCE), a
//   stale case ETag (412), RAW_SOURCE without a raw source (422 CAPTURE_POSTURE_UNSUPPORTED) → no
//   send, reply, update, delete, readiness or production route exists (404) and no response
//   carries a transmission-verdict or readiness key → logout. Nothing here sends anything, contacts
//   anyone, computes readiness or takes an external action.
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
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
  console.log(`[smoke:p4c] PASS ${message}`);
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
      'smoke:p4c writes directory, source, case and correspondence records into the target ' +
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
  pass('login → 200 with a session cookie and CSRF token');

  const forbiddenKey =
    /"(g[1-7]\w*|ready\w*|eligib\w*|infring\w*|authori[sz]ed\w*|verified\w*|approved\w*|sent\w*|transmitted\w*|delivered\w*)"\s*:/i;

  async function call(
    label: string,
    method: string,
    route: string,
    expected: number,
    schema: Parser | null,
    options: { body?: unknown; ifMatch?: string } = {},
  ): Promise<{ data: Data; etag: string | null; code: string | null; text: string }> {
    const headers: Record<string, string> = { Cookie: cookie, 'X-Requested-With': 'TB-APP' };
    if (method !== 'GET') {
      headers['Origin'] = origin as string;
      headers['X-CSRF-Token'] = csrf;
      headers['Idempotency-Key'] = `p4c-ci-${randomUUID()}`;
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
    if (expected < 400 && forbiddenKey.test(text)) {
      fail(`${label}: carries a transmission-verdict or readiness key`);
    }
    pass(`${label} → ${expected}`);
    const envelope = body as { data?: Data; error?: { code: string } } | undefined;
    return {
      data: (envelope?.data ?? { id: '' }) as Data,
      etag: response.headers.get('etag'),
      code: envelope?.error?.code ?? null,
      text,
    };
  }

  const tag = randomUUID().slice(0, 8);
  const mailbox = `p4c-ci-${tag}@example.invalid`;

  // Directory and case context -------------------------------------------------------------------
  const agency = await call(
    'POST /agencies (A)',
    'POST',
    '/agencies',
    201,
    contracts.CreateAgencyResponseSchema,
    { body: { displayName: `P4C CI synthetic agency A ${tag}` } },
  );
  const rawSource = await call(
    'POST /sources (A raw message file)',
    'POST',
    '/sources',
    201,
    contracts.CreateSourceResponseSchema,
    {
      body: {
        agencyId: agency.data.id,
        title: `P4C CI synthetic raw message ${tag} (not evidence)`,
        sourceRole: 'PRIMARY_CORRESPONDENCE',
        scopeText: 'Synthetic CI raw message file',
      },
    },
  );
  const agencyB = await call(
    'POST /agencies (B)',
    'POST',
    '/agencies',
    201,
    contracts.CreateAgencyResponseSchema,
    { body: { displayName: `P4C CI synthetic agency B ${tag}` } },
  );
  const created = await call(
    'POST /cases (A)',
    'POST',
    '/cases',
    201,
    contracts.CreateCaseResponseSchema,
    { body: { agencyId: agency.data.id, intakeLabel: `P4C CI synthetic intake ${tag}` } },
  );
  const caseId = created.data.id;
  const refreshCase = async (id = caseId) =>
    call('GET /cases/{caseId}', 'GET', `/cases/${id}`, 200, contracts.GetCaseResponseSchema);
  const createItem = async (id: string, videoId: string) =>
    call(
      'POST /cases/{caseId}/reported-items',
      'POST',
      `/cases/${id}/reported-items`,
      201,
      contracts.CreateReportedItemResponseSchema,
      {
        body: { rawUrl: `https://www.youtube.com/watch?v=${videoId}` },
        ifMatch: (await refreshCase(id)).etag ?? '',
      },
    );
  const itemA = await createItem(caseId, `P4cA${tag.slice(0, 4)}_Zz`);
  const itemB = await createItem(caseId, `P4cB${tag.slice(0, 4)}-Yy`);
  const otherCase = await call(
    'POST /cases (another case of A)',
    'POST',
    '/cases',
    201,
    contracts.CreateCaseResponseSchema,
    { body: { agencyId: agency.data.id, intakeLabel: `P4C CI synthetic other intake ${tag}` } },
  );
  const otherItem = await createItem(otherCase.data.id, `P4cC${tag.slice(0, 4)}_Xx`);
  const caseBeforeCaptures = await refreshCase();

  // Captures -------------------------------------------------------------------------------------
  const nmiBody = `Hello,\r\n\r\nWe need more information about your request.\r\n  Café — ${tag}\n> quoted history\n`;
  const nmi = await call(
    'POST /correspondence (inbound NMI, copied full text)',
    'POST',
    '/correspondence',
    201,
    contracts.CaptureCorrespondenceResponseSchema,
    {
      body: {
        agencyId: agency.data.id,
        mailboxAddress: mailbox,
        direction: 'INBOUND',
        subject: `  Need more information [${tag}]  `,
        messageId: `<p4c-ci-nmi-${tag}@example.invalid>`,
        captureMode: 'COPIED_FULL_TEXT',
        bodyRole: 'FULL_MESSAGE',
        bodyText: nmiBody,
        headerDateRaw: 'Tue, 01 Sep 2026 10:00:00 +0000',
        fromAddress: 'platform-support@example.invalid',
        toAddress: mailbox,
      },
    },
  );
  if (nmi.etag !== null) fail('a captured correspondence is append-only and carries no ETag');
  if (
    nmi.data['bodyText'] !== nmiBody ||
    nmi.data['subject'] !== `  Need more information [${tag}]  ` ||
    nmi.data['bodySha256'] !== createHash('sha256').update(nmiBody, 'utf8').digest('hex') ||
    nmi.data['sourceIdentityHash'] !== null ||
    nmi.data['occurredAt'] !== null ||
    nmi.data['headerDateRaw'] !== 'Tue, 01 Sep 2026 10:00:00 +0000' ||
    nmi.data['captureMode'] !== 'COPIED_FULL_TEXT'
  ) {
    fail('the inbound capture is not stored exactly as supplied');
  }
  pass('inbound capture: exact text, body hash of the recorded text, raw header date not parsed');
  const outboundBody = `Please remove the two videos listed below. ${tag}`;
  const outbound = await call(
    'POST /correspondence (outbound historical transmission, raw source)',
    'POST',
    '/correspondence',
    201,
    contracts.CaptureCorrespondenceResponseSchema,
    {
      body: {
        agencyId: agency.data.id,
        mailboxAddress: mailbox,
        direction: 'OUTBOUND',
        subject: `Copyright removal request [${tag}]`,
        messageId: `<p4c-ci-initial-${tag}@example.invalid>`,
        captureMode: 'RAW_SOURCE',
        bodyRole: 'AUTHORED_BODY',
        bodyText: outboundBody,
        rawSourceId: rawSource.data.id,
        attachmentsManifest: [
          { fileName: 'authorization.pdf', state: 'OBSERVED_IN_RAW_MIME' },
          { fileName: 'licence.pdf', state: 'COPIED_TEXT_ALLEGATION' },
        ],
        occurredAt: '2026-08-31T09:30:00.000+07:00',
        timestampPrecision: 'SECOND',
        toAddress: 'copyright@example.invalid',
      },
    },
  );
  if (
    outbound.data['occurredAt'] !== '2026-08-31T02:30:00.000Z' ||
    outbound.data['rawSourceId'] !== rawSource.data.id ||
    outbound.data['createdAt'] === outbound.data['occurredAt']
  ) {
    fail('the outbound capture must keep its supplied occurrence apart from its ingestion time');
  }
  const decision = await call(
    'POST /correspondence (inbound decision on two videos)',
    'POST',
    '/correspondence',
    201,
    contracts.CaptureCorrespondenceResponseSchema,
    {
      body: {
        agencyId: agency.data.id,
        mailboxAddress: mailbox,
        direction: 'INBOUND',
        subject: `Request resolved [${tag}]`,
        captureMode: 'EXCERPT',
        bodyRole: 'EXCERPT',
        bodyText: 'Request Resolved: one video removed; the other request was not accepted.',
      },
    },
  );
  const foreign = await call(
    'POST /correspondence (agency B)',
    'POST',
    '/correspondence',
    201,
    contracts.CaptureCorrespondenceResponseSchema,
    {
      body: {
        agencyId: agencyB.data.id,
        mailboxAddress: mailbox,
        direction: 'INBOUND',
        subject: `Agency B message [${tag}]`,
        captureMode: 'OPERATOR_REPORTED',
      },
    },
  );
  const noPosture = await call(
    'POST /correspondence (RAW_SOURCE without a raw source)',
    'POST',
    '/correspondence',
    422,
    null,
    {
      body: {
        agencyId: agency.data.id,
        mailboxAddress: mailbox,
        direction: 'INBOUND',
        subject: 'x',
        captureMode: 'RAW_SOURCE',
      },
    },
  );
  if (noPosture.code !== 'CAPTURE_POSTURE_UNSUPPORTED') fail('RAW_SOURCE needs its raw source');

  const empty = await call(
    'GET /cases/{caseId}/correspondence-bindings (after capture)',
    'GET',
    `/cases/${caseId}/correspondence-bindings`,
    200,
    contracts.ListCaseCorrespondenceBindingsResponseSchema,
  );
  const beforeBinding = await refreshCase();
  if ((empty.data as unknown as { items: unknown[] }).items.length !== 0) {
    fail('a capture must create no binding');
  }
  if (
    beforeBinding.data['rowVersion'] !== caseBeforeCaptures.data['rowVersion'] ||
    beforeBinding.data['contextRevision'] !== caseBeforeCaptures.data['contextRevision']
  ) {
    fail('a capture must not change the case');
  }
  pass('capture created no binding and changed no case');

  // Bindings -------------------------------------------------------------------------------------
  const bindTo = async (label: string, body: Record<string, unknown>, id = caseId) =>
    call(
      label,
      'POST',
      `/cases/${id}/correspondence-bindings`,
      201,
      contracts.BindCaseCorrespondenceResponseSchema,
      { body, ifMatch: (await refreshCase(id)).etag ?? '' },
    );
  const nmiBinding = await bindTo('POST /cases/{caseId}/correspondence-bindings (NMI)', {
    correspondenceId: nmi.data.id,
    eventType: 'NMI',
    platformReference: `P4C-CI-${tag}`,
    interpretation: 'Synthetic: the platform asks for more information',
  });
  if (nmiBinding.etag !== null) fail('a binding is append-only and carries no ETag');
  const afterBinding = await refreshCase();
  if (
    afterBinding.data['contextRevision'] !==
    (beforeBinding.data['contextRevision'] as number) + 1
  ) {
    fail('a binding must move the case context revision once');
  }
  pass('NMI bound explicitly; the case context revision moved once');
  for (const item of [itemA, itemB]) {
    const asSent = await bindTo(
      'POST /cases/{caseId}/correspondence-bindings (INITIAL_AS_SENT, explicit)',
      {
        correspondenceId: outbound.data.id,
        eventType: 'INITIAL_AS_SENT',
        reportedItemId: item.data.id,
      },
    );
    if (asSent.data['eventType'] !== 'INITIAL_AS_SENT') fail('the event type must be as chosen');
  }
  pass('one outbound message bound explicitly as INITIAL_AS_SENT to two items');
  const removed = await bindTo('POST /cases/{caseId}/correspondence-bindings (OUTCOME A)', {
    correspondenceId: decision.data.id,
    eventType: 'OUTCOME',
    outcome: 'REMOVED',
    reportedItemId: itemA.data.id,
  });
  await bindTo('POST /cases/{caseId}/correspondence-bindings (OUTCOME B)', {
    correspondenceId: decision.data.id,
    eventType: 'OUTCOME',
    outcome: 'REJECTED',
    reportedItemId: itemB.data.id,
  });
  pass('mixed outcomes recorded per item (A REMOVED, B REJECTED)');
  const correction = await bindTo(
    'POST /cases/{caseId}/correspondence-bindings (correction supersedes the NMI binding)',
    {
      correspondenceId: nmi.data.id,
      eventType: 'NMI',
      platformReference: `P4C-CI-${tag}`,
      interpretation: 'Synthetic corrected reading: the platform asks for the licence chain',
      supersedesBindingId: nmiBinding.data.id,
    },
  );
  if (correction.data['supersedesBindingId'] !== nmiBinding.data.id) {
    fail('the correction must name the binding it supersedes');
  }
  const again = await call(
    'POST /cases/{caseId}/correspondence-bindings (second correction of one binding)',
    'POST',
    `/cases/${caseId}/correspondence-bindings`,
    409,
    null,
    {
      body: {
        correspondenceId: nmi.data.id,
        eventType: 'OTHER',
        supersedesBindingId: nmiBinding.data.id,
      },
      ifMatch: (await refreshCase()).etag ?? '',
    },
  );
  if (again.code !== 'BINDING_ALREADY_SUPERSEDED') fail('a binding history does not fork');

  // History --------------------------------------------------------------------------------------
  const history = await call(
    'GET /cases/{caseId}/correspondence-bindings (history)',
    'GET',
    `/cases/${caseId}/correspondence-bindings?limit=100`,
    200,
    contracts.ListCaseCorrespondenceBindingsResponseSchema,
  );
  const bindings = (history.data as unknown as { items: Array<Record<string, unknown>> }).items;
  const ids = bindings.map((binding) => binding['id']);
  if (
    bindings.length !== 6 ||
    !ids.includes(nmiBinding.data.id) ||
    !ids.includes(removed.data.id)
  ) {
    fail('the history must keep every binding, the superseded one included');
  }
  const original = bindings.find((binding) => binding['id'] === nmiBinding.data.id);
  if (JSON.stringify(original) !== JSON.stringify(nmiBinding.data)) {
    fail('the superseded binding must stay exactly as recorded');
  }
  const outboundBindings = bindings.filter(
    (binding) => binding['correspondenceId'] === outbound.data.id,
  );
  if (outboundBindings.length !== 2) fail('the outbound message has two bindings');
  pass('history kept: 6 bindings, the superseded one unchanged; one message, two bindings');
  const messageNow = await call(
    'GET /correspondence/{id}',
    'GET',
    `/correspondence/${nmi.data.id}`,
    200,
    contracts.GetCorrespondenceResponseSchema,
  );
  if (JSON.stringify(messageNow.data) !== JSON.stringify(nmi.data)) {
    fail('a binding or correction must never edit the captured message');
  }
  const listed = await call(
    'GET /correspondence?agencyId (agency A)',
    'GET',
    `/correspondence?agencyId=${agency.data.id}&limit=100`,
    200,
    contracts.ListCorrespondenceResponseSchema,
  );
  const captures = (listed.data as unknown as { items: Array<{ id: string }> }).items;
  if (captures.length !== 3 || captures.some((item) => item.id === foreign.data.id)) {
    fail('agency A has exactly its three captures: bindings are not transmissions');
  }
  if (listed.text.includes(nmiBody)) fail('the list summary must not carry the body');
  pass('three captures for agency A, no body in the list; bindings did not multiply messages');

  // Expected refusals ----------------------------------------------------------------------------
  const refusals: Array<[string, Record<string, unknown>, number, string]> = [
    [
      'OUTCOME without a reported item',
      { correspondenceId: decision.data.id, eventType: 'OUTCOME', outcome: 'REMOVED' },
      422,
      'OUTCOME_ITEM_REQUIRED',
    ],
    [
      "agency B's message in A's case",
      { correspondenceId: foreign.data.id, eventType: 'NMI' },
      422,
      'CROSS_AGENCY_REFERENCE',
    ],
    [
      "another case's reported item",
      {
        correspondenceId: decision.data.id,
        eventType: 'OUTCOME',
        outcome: 'REMOVED',
        reportedItemId: otherItem.data.id,
      },
      422,
      'CROSS_CASE_REFERENCE',
    ],
  ];
  for (const [label, body, status, errorCode] of refusals) {
    const refused = await call(
      `POST /cases/{caseId}/correspondence-bindings (${label})`,
      'POST',
      `/cases/${caseId}/correspondence-bindings`,
      status,
      null,
      { body, ifMatch: (await refreshCase()).etag ?? '' },
    );
    if (refused.code !== errorCode) fail(`${label}: expected ${errorCode}, got ${refused.code}`);
  }
  const stale = await call(
    'POST /cases/{caseId}/correspondence-bindings (stale case ETag)',
    'POST',
    `/cases/${caseId}/correspondence-bindings`,
    412,
    null,
    {
      body: { correspondenceId: nmi.data.id, eventType: 'ACK' },
      ifMatch: created.etag ?? '',
    },
  );
  if (stale.code !== 'RECORD_VERSION_CONFLICT') fail('a stale case ETag must be refused');
  // After the NMI binding: two AS_SENT, two OUTCOME and one correction moved the case once each;
  // the refused second correction, the three refusals and the stale request moved nothing.
  const finalCase = await refreshCase();
  if (finalCase.data['rowVersion'] !== (afterBinding.data['rowVersion'] as number) + 5) {
    fail('refused writes must not move the case');
  }
  pass('refusals wrote nothing: the case moved only with the five recorded bindings');

  // Nothing sends, edits, deletes or computes readiness ------------------------------------------
  for (const [label, method, suffix] of [
    ['POST /correspondence/{id}/send', 'POST', `/correspondence/${outbound.data.id}/send`],
    ['POST /correspondence/{id}/reply', 'POST', `/correspondence/${nmi.data.id}/reply`],
    ['PATCH /correspondence/{id}', 'PATCH', `/correspondence/${nmi.data.id}`],
    ['DELETE /correspondence/{id}', 'DELETE', `/correspondence/${nmi.data.id}`],
    ['GET /cases/{caseId}/readiness', 'GET', `/cases/${caseId}/readiness`],
    ['GET /cases/{caseId}/production-context', 'GET', `/cases/${caseId}/production-context`],
    ['POST /cases/{caseId}/prompts', 'POST', `/cases/${caseId}/prompts`],
  ] as const) {
    const refused = await call(
      `${label} (not routed)`,
      method,
      suffix,
      404,
      null,
      method === 'POST' || method === 'PATCH' ? { body: {} } : {},
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
  console.error(`[smoke:p4c] FAIL ${error instanceof Error ? error.message : String(error)}`);
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
    console.error('[smoke:p4c] FAIL port 3000 still in use');
    process.exitCode = 1;
  }
  console.log(`[smoke:p4c] ${process.exitCode ? 'FAIL' : 'PASS'} (${checks} checks)`);
}
