// yarn smoke:p4d --email <email> < password — P4D round trip against the COMPILED API, for CI only.
//
// It writes synthetic Directory, SourceReference, authority, case, intake and correspondence records
// into the target database and leaves them there (authority records, facts, captures and bindings
// are append-only history), so it refuses to run unless CI=true: CI's tb_notice_dev is disposable,
// the operator's is not. The account is the synthetic CI admin created by `yarn admin:create`; the
// password is read from standard input. Requires a prior `yarn build`. No external requests: the
// production context is a read — nothing is generated, sent, fetched or signed; port 3000 is
// released.
//
// Flow (every response is checked against the ACTIVE contract and for Cache-Control: no-store):
//   login → Agency + its canonical record → Owner, LegalSubject and their link → Route → Signer →
//   Mandate → version (primary source) → coverage (basis source) → coverage signer → freeze → case
//   bound to the route → evidence source linked → authority selection → reported item, work and
//   mapping → facts (RIGHTS_BASIS supported by the link, PERMISSION recorded MISSING, AV_COMPARISON
//   recorded CONFLICT) → inbound NMI captured and bound → outbound notice (operator reported) bound
//   as INITIAL_AS_SENT, and once as OTHER → a second case with its own selection and NMI binding →
//   INITIAL + PREPARATION without a selection (gaps listed, nothing filled in) → with the selection
//   (the exact pinned chain; facts and supports as recorded; MISSING and CONFLICT kept) → the same
//   read again (identical, same digest) → INITIAL + DRAFTING → NMI_REPLY + DRAFTING with the
//   explicit parent and prior (posture kept) → the route's default signer and preferred coverage
//   set: context and digest unchanged → a later authority event: included, digest changed, case
//   unchanged → expected refusals (another case's selection and binding, OUTBOUND + OTHER as a prior,
//   a reply without its parent in DRAFTING, INITIAL with a parent, an unknown selection, no task) →
//   the reads wrote nothing (case versions and the audit, idempotency and later-phase row counts
//   unchanged, read-only through the runtime account) → no candidate, validation, readiness or
//   export route exists (404; prompts are routed since P4E, with their own smoke:p4e) → logout.
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { connect } from 'node:net';
import path from 'node:path';
import { createConnection } from 'mariadb';
import { argValue, repoRoot } from '../contracts/paths.ts';
import { assertLocalTarget } from '../db/allowlist.mjs';
import { loadRootEnv } from '../db/lib/targets.mjs';

const API = 'http://127.0.0.1:3000/api/v1';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let api: ChildProcess | undefined;
let exited = false;
let checks = 0;

/** Tables a context read must never write: the audit trail, idempotency and every later phase. */
const UNTOUCHED_TABLES = [
  'audit_events',
  'idempotency_records',
  'prompt_snapshots',
  'notice_candidates',
  'validation_runs',
  'validation_issues',
  'candidate_assessments',
  'assessment_sources',
] as const;

function pass(message: string): void {
  checks += 1;
  console.log(`[smoke:p4d] PASS ${message}`);
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

/** Row counts of the untouched tables, read through the runtime account (SELECT only). */
async function rowCounts(): Promise<Record<string, number>> {
  const raw = process.env['DATABASE_URL'];
  const target = assertLocalTarget('DATABASE_URL', raw, {
    expectedSchema: 'tb_notice_dev',
    forbidUser: 'tb_migrate',
  });
  const url = new URL(raw as string);
  const conn = await createConnection({
    host: url.hostname,
    port: Number(url.port),
    user: target.user,
    password: decodeURIComponent(url.password),
    database: target.schema,
    connectTimeout: 5000,
    allowPublicKeyRetrieval: true,
  });
  try {
    const counts: Record<string, number> = {};
    for (const table of UNTOUCHED_TABLES) {
      const [row] = (await conn.query(`SELECT COUNT(*) AS n FROM \`${table}\``)) as Array<{
        n: bigint | number;
      }>;
      counts[table] = Number(row?.n ?? -1);
    }
    return counts;
  } finally {
    await conn.end();
  }
}

interface Parser {
  safeParse(value: unknown): { success: boolean };
}

type Data = { readonly id: string } & Record<string, unknown>;

interface ContextView {
  readonly contextRevision: number;
  readonly dependencyDigest: string;
  readonly dependencies: ReadonlyArray<{ entityType: string; entityId: string }>;
  readonly context: Record<string, unknown> & {
    readonly missing: ReadonlyArray<{ code: string }>;
    readonly conflicts: ReadonlyArray<{ code: string }>;
    readonly party: Record<string, unknown>;
    readonly authority: null | {
      readonly selection: Data;
      readonly coverages: ReadonlyArray<{
        readonly coverage: Data;
        readonly version: Data;
        readonly signerScopes: readonly Data[];
        readonly authorityEvents: readonly Data[];
      }>;
    };
    readonly facts: readonly Data[];
    readonly sources: ReadonlyArray<{ sourceId: string; provenance: string }>;
    readonly correspondence: readonly Data[];
    readonly priorCorrespondenceIds: readonly string[];
  };
}

async function main(): Promise<void> {
  if (process.env['CI'] !== 'true') {
    fail(
      'smoke:p4d writes directory, source, authority, case, intake and correspondence records ' +
        'into the target database; it runs only in CI (CI=true) against the disposable CI database',
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
    /"(g[1-7]\w*|ready\w*|eligib\w*|infring\w*|authori[sz]ed\w*|verified\w*|approved\w*|isCurrent\w*|valid|isValid\w*)"\s*:/i;

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
      headers['Idempotency-Key'] = `p4d-ci-${randomUUID()}`;
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
      fail(`${label}: carries a readiness, approval or verdict key`);
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
  const create = (label: string, route: string, schema: Parser, body: unknown, ifMatch?: string) =>
    call(label, 'POST', route, 201, schema, {
      body,
      ...(ifMatch === undefined ? {} : { ifMatch }),
    });
  const etagOf = async (route: string, schema: Parser) =>
    (await call(`GET ${route}`, 'GET', route, 200, schema)).etag ?? '';

  const tag = randomUUID().slice(0, 8);
  const mailbox = `p4d-ci-${tag}@example.invalid`;

  // Directory, route and authority ---------------------------------------------------------------
  const agency = await create('POST /agencies', '/agencies', contracts.CreateAgencyResponseSchema, {
    displayName: `P4D CI synthetic agency ${tag}`,
    legalName: `P4D CI Synthetic Agency ${tag} Ltd`,
  });
  const agencyId = agency.data.id;
  const source = (title: string, extra: Record<string, unknown> = {}) =>
    create('POST /sources', '/sources', contracts.CreateSourceResponseSchema, {
      agencyId,
      title: `P4D CI synthetic ${title} ${tag} (not evidence)`,
      sourceRole: 'OPERATOR_INPUT',
      scopeText: `Synthetic CI ${title}`,
      ...extra,
    });
  const record = await source('agency record', { sourceRole: 'CANONICAL_RECORD' });
  const owner = await create('POST /owners', '/owners', contracts.CreateOwnerResponseSchema, {
    displayName: `P4D CI synthetic brand ${tag}`,
  });
  const subject = await create(
    'POST /legal-subjects',
    '/legal-subjects',
    contracts.CreateLegalSubjectResponseSchema,
    { subjectType: 'LEGAL_ENTITY', legalName: `P4D CI Synthetic Subject ${tag} LLC` },
  );
  const association = await create(
    'POST /owners/{id}/subjects',
    `/owners/${owner.data.id}/subjects`,
    contracts.LinkOwnerSubjectResponseSchema,
    { legalSubjectId: subject.data.id },
    await etagOf(`/owners/${owner.data.id}`, contracts.GetOwnerResponseSchema),
  );
  const route = await create('POST /routes', '/routes', contracts.CreateRouteResponseSchema, {
    agencyId,
    ownerSubjectId: association.data.id,
  });
  const signer = await create('POST /signers', '/signers', contracts.CreateSignerResponseSchema, {
    agencyId,
    fullLegalName: `P4D CI Synthetic Signer ${tag}`,
  });
  const mandate = await create(
    'POST /mandates',
    '/mandates',
    contracts.CreateMandateResponseSchema,
    {
      agencyId,
      label: `P4D CI synthetic mandate ${tag}`,
    },
  );
  const mandateEtag = () =>
    etagOf(`/mandates/${mandate.data.id}`, contracts.GetMandateResponseSchema);
  const version = await create(
    'POST /mandates/{id}/versions',
    `/mandates/${mandate.data.id}/versions`,
    contracts.CreateMandateVersionResponseSchema,
    {
      changeKind: 'NEW_AUTHORIZATION',
      changeReason: 'Synthetic CI capture',
      primarySourceId: record.data.id,
      documentState: 'SIGNED_APPEARING',
    },
    await mandateEtag(),
  );
  const versionEtag = () =>
    etagOf(`/mandate-versions/${version.data.id}`, contracts.GetMandateVersionResponseSchema);
  const basis = await source('coverage basis');
  const coverage = await create(
    'POST /mandate-versions/{id}/coverages',
    `/mandate-versions/${version.data.id}/coverages`,
    contracts.CreateCoverageResponseSchema,
    {
      routeId: route.data.id,
      coverageLabel: `P4D CI synthetic coverage ${tag}`,
      basisSourceId: basis.data.id,
      actionScope: ['PREPARE_NOTICE'],
    },
    await versionEtag(),
  );
  await create(
    'POST /coverages/{id}/signers',
    `/coverages/${coverage.data.id}/signers`,
    contracts.CreateCoverageSignerResponseSchema,
    { signerId: signer.data.id, capacity: 'Synthetic CI capacity', sourceId: basis.data.id },
    await etagOf(`/coverages/${coverage.data.id}`, contracts.GetCoverageResponseSchema),
  );
  await call(
    'POST /mandate-versions/{id}/freeze',
    'POST',
    `/mandate-versions/${version.data.id}/freeze`,
    200,
    contracts.FreezeMandateVersionResponseSchema,
    { body: { reason: 'Synthetic CI freeze of the recorded terms' }, ifMatch: await versionEtag() },
  );

  // Cases, intake and correspondence -------------------------------------------------------------
  const newCase = (label: string) =>
    create('POST /cases', '/cases', contracts.CreateCaseResponseSchema, {
      agencyId,
      routeId: route.data.id,
      intakeLabel: `P4D CI synthetic ${label} ${tag}`,
    });
  const caseEtag = (id: string) => etagOf(`/cases/${id}`, contracts.GetCaseResponseSchema);
  const created = await newCase('intake');
  const caseId = created.data.id;
  const other = await newCase('other intake');
  const selectFor = async (id: string) =>
    create(
      'POST /cases/{caseId}/authority-selections',
      `/cases/${id}/authority-selections`,
      contracts.SelectCaseAuthorityResponseSchema,
      {
        routeId: route.data.id,
        signerId: signer.data.id,
        taskType: 'INITIAL',
        intendedFromEmail: mailbox,
        selectionNote: `Synthetic CI selection ${tag}`,
        coverages: [
          { coverageId: coverage.data.id, applicationScope: `Synthetic CI scope ${tag}` },
        ],
      },
      await caseEtag(id),
    );
  const evidence = await source('evidence', {
    canonicalUrl: `https://evidence.example.invalid/p4d-${tag}`,
  });
  const linked = await create(
    'POST /cases/{caseId}/sources',
    `/cases/${caseId}/sources`,
    contracts.LinkCaseSourceResponseSchema,
    { sourceId: evidence.data.id, useRole: 'SYNTHETIC_SUPPORT', scopeNote: 'Synthetic CI link' },
    await caseEtag(caseId),
  );
  const selection = await selectFor(caseId);
  const otherSelection = await selectFor(other.data.id);
  const item = await create(
    'POST /cases/{caseId}/reported-items',
    `/cases/${caseId}/reported-items`,
    contracts.CreateReportedItemResponseSchema,
    { rawUrl: `https://www.youtube.com/watch?v=P4dA${tag.slice(0, 4)}_Zz` },
    await caseEtag(caseId),
  );
  const work = await create(
    'POST /cases/{caseId}/works',
    `/cases/${caseId}/works`,
    contracts.CreateCaseWorkResponseSchema,
    { title: `P4D CI synthetic work ${tag}` },
    await caseEtag(caseId),
  );
  const mappingBasis = await source('mapping basis');
  await create(
    'POST /cases/{caseId}/mappings',
    `/cases/${caseId}/mappings`,
    contracts.CreateUseMappingResponseSchema,
    {
      caseWorkId: work.data.id,
      reportedItemId: item.data.id,
      occurrence: 1,
      basisSourceId: mappingBasis.data.id,
      provenance: 'OPERATOR_REPORTED',
    },
    await caseEtag(caseId),
  );
  const fact = async (body: Record<string, unknown>) =>
    call(
      'POST /cases/{caseId}/facts',
      'POST',
      `/cases/${caseId}/facts`,
      201,
      contracts.CreateCaseFactResponseSchema,
      {
        body: {
          scopeKind: 'CASE',
          scopeText: 'Synthetic CI scope of this fact',
          changeReason: 'Synthetic CI intake',
          sources: [],
          ...body,
        },
        ifMatch: await caseEtag(caseId),
      },
    );
  await fact({
    factType: 'RIGHTS_BASIS',
    value: { basis: 'UNKNOWN', assertion: 'Synthetic CI basis as reported', limitations: null },
    provenance: 'OPERATOR_REPORTED',
    sources: [
      {
        caseSourceId: linked.data.id,
        supportRole: 'SYNTHETIC_SUPPORT',
        supportedAssertion: 'Synthetic CI supported assertion',
      },
    ],
  });
  const permission = await fact({
    factType: 'PERMISSION',
    value: { finding: 'UNKNOWN', assertion: '', reviewScope: 'Not reviewed' },
    provenance: 'MISSING',
  });
  const comparison = await fact({
    factType: 'AV_COMPARISON',
    value: { finding: 'CONFLICT', method: '', assertion: '', limitations: '' },
    provenance: 'CONFLICT',
    resolutionState: 'CONFLICT',
  });
  const capture = (label: string, body: Record<string, unknown>) =>
    create(label, '/correspondence', contracts.CaptureCorrespondenceResponseSchema, {
      agencyId,
      mailboxAddress: mailbox,
      direction: 'INBOUND',
      captureMode: 'COPIED_FULL_TEXT',
      bodyRole: 'FULL_MESSAGE',
      ...body,
    });
  const bind = async (id: string, body: Record<string, unknown>) =>
    create(
      'POST /cases/{caseId}/correspondence-bindings',
      `/cases/${id}/correspondence-bindings`,
      contracts.BindCaseCorrespondenceResponseSchema,
      body,
      await caseEtag(id),
    );
  const nmiMessage = await capture('POST /correspondence (inbound NMI)', {
    subject: `Need more information [${tag}]`,
    bodyText: 'Synthetic CI question: please provide the licence.',
  });
  const nmi = await bind(caseId, { correspondenceId: nmiMessage.data.id, eventType: 'NMI' });
  const notice = await capture('POST /correspondence (outbound notice, operator reported)', {
    direction: 'OUTBOUND',
    subject: `Copyright notice [${tag}]`,
    captureMode: 'OPERATOR_REPORTED',
    bodyRole: 'UNKNOWN',
    limitations: 'Synthetic CI: reported by the operator; no raw message kept',
  });
  const sent = await bind(caseId, {
    correspondenceId: notice.data.id,
    eventType: 'INITIAL_AS_SENT',
    reportedItemId: item.data.id,
  });
  const outboundOther = await bind(caseId, {
    correspondenceId: notice.data.id,
    eventType: 'OTHER',
  });
  const otherNmi = await bind(other.data.id, {
    correspondenceId: nmiMessage.data.id,
    eventType: 'NMI',
  });

  // Production context ---------------------------------------------------------------------------
  const contextRoute = (query: Record<string, string | readonly string[]>, id = caseId) => {
    const params = new URLSearchParams();
    for (const [name, value] of Object.entries(query)) {
      for (const item of typeof value === 'string' ? [value] : value) params.append(name, item);
    }
    return `/cases/${id}/production-context?${params.toString()}`;
  };
  const read = async (label: string, query: Record<string, string | readonly string[]>) => {
    const result = await call(
      `GET /cases/{caseId}/production-context (${label})`,
      'GET',
      contextRoute(query),
      200,
      contracts.GetProductionContextResponseSchema,
    );
    if (result.etag !== null) fail(`${label}: a production context carries no ETag`);
    return result.data as unknown as ContextView;
  };
  const refuse = async (
    label: string,
    query: Record<string, string | readonly string[]>,
    status: number,
    code: string,
  ) => {
    const result = await call(
      `GET /cases/{caseId}/production-context (${label})`,
      'GET',
      contextRoute(query),
      status,
      null,
    );
    if (result.code !== code) fail(`${label}: expected ${code}, got ${result.code}`);
  };
  const codes = (list: ReadonlyArray<{ code: string }>) => list.map((entry) => entry.code);
  const caseBefore = (
    await call(
      'GET /cases/{caseId}',
      'GET',
      `/cases/${caseId}`,
      200,
      contracts.GetCaseResponseSchema,
    )
  ).data;
  const countsBefore = await rowCounts();
  const unchanged = async (label: string, before: Record<string, number>) => {
    const after = await rowCounts();
    if (JSON.stringify(after) !== JSON.stringify(before)) {
      fail(`${label} wrote rows: before ${JSON.stringify(before)}, after ${JSON.stringify(after)}`);
    }
    pass(`${label} wrote nothing (audit, idempotency and later-phase row counts unchanged)`);
  };

  const bare = await read('INITIAL + PREPARATION, no selection named', {
    taskType: 'INITIAL',
    generationMode: 'PREPARATION',
  });
  if (bare.context.authority !== null || bare.context.party['signerId'] !== null) {
    fail('without a named selection the context has no authority and no signer');
  }
  if (!codes(bare.context.missing).includes('AUTHORITY_SELECTION_NOT_SELECTED')) {
    fail('the missing selection must be listed');
  }
  pass(
    'no selection named: none is filled in (not even the case’s current one); the gap is listed',
  );

  const initialScope = {
    taskType: 'INITIAL',
    generationMode: 'PREPARATION',
    authoritySelectionId: selection.data.id,
  };
  const initial = await read('INITIAL + PREPARATION', initialScope);
  const block = initial.context.authority?.coverages[0];
  if (
    initial.context.authority?.selection.id !== selection.data.id ||
    initial.context.authority.coverages.length !== 1 ||
    block?.coverage.id !== coverage.data.id ||
    block.version.id !== version.data.id ||
    block.signerScopes.length !== 1 ||
    initial.context.party['signerId'] !== signer.data.id ||
    initial.context.party['legalSubjectId'] !== subject.data.id
  ) {
    fail('the context must hold exactly the selected, pinned authority chain and the route party');
  }
  pass('exact selected authority: the pinned coverage, its frozen version and the signer’s row');
  const factOf = (id: string) => initial.context.facts.find((row) => row.id === id);
  if (
    factOf(permission.data.id)?.['provenance'] !== 'MISSING' ||
    factOf(comparison.data.id)?.['provenance'] !== 'CONFLICT' ||
    !codes(initial.context.missing).includes('FACT_PROVENANCE_MISSING') ||
    !codes(initial.context.conflicts).includes('FACT_PROVENANCE_CONFLICT') ||
    !codes(initial.context.conflicts).includes('FACT_RESOLUTION_CONFLICT')
  ) {
    fail('MISSING and CONFLICT must stay exactly as recorded and be listed');
  }
  if (
    !initial.context.sources.some(
      (entry) => entry.sourceId === evidence.data.id && entry.provenance === 'OPERATOR_REPORTED',
    )
  ) {
    fail('the linked evidence must be in the manifest with its recorded provenance');
  }
  pass('facts as recorded: MISSING listed as missing, CONFLICT listed as a recorded conflict');
  const again = await read('INITIAL + PREPARATION, read again', initialScope);
  if (JSON.stringify(again) !== JSON.stringify(initial))
    fail('an unchanged read must be identical');
  pass(`repeated read identical (digest ${initial.dependencyDigest.slice(0, 12)}…)`);
  await read('INITIAL + DRAFTING', { ...initialScope, generationMode: 'DRAFTING' });
  const reply = await read('NMI_REPLY + DRAFTING, explicit parent and prior', {
    taskType: 'NMI_REPLY',
    generationMode: 'DRAFTING',
    authoritySelectionId: selection.data.id,
    parentBindingId: nmi.data.id,
    priorBindingIds: [sent.data.id],
  });
  const sentCapture = reply.context.correspondence.find((row) => row.id === notice.data.id);
  if (
    reply.context['parentBindingId'] !== nmi.data.id ||
    reply.context.priorCorrespondenceIds.join() !== notice.data.id ||
    sentCapture?.['captureMode'] !== 'OPERATOR_REPORTED' ||
    !codes(reply.context.missing).includes('PRIOR_AS_SENT_RAW_SOURCE_ABSENT') ||
    reply.dependencyDigest === initial.dependencyDigest
  ) {
    fail('the reply context must hold exactly the named bindings with their posture as recorded');
  }
  pass('reply: explicit parent and prior only; OPERATOR_REPORTED kept and listed as limited');
  await unchanged('five context reads', countsBefore);

  // Route defaults change nothing; a later relevant authority event changes the digest ------------
  await call(
    'PATCH /routes/{id} (default signer, preferred coverage)',
    'PATCH',
    `/routes/${route.data.id}`,
    200,
    contracts.PatchRouteResponseSchema,
    {
      body: { defaultSignerId: signer.data.id, preferredCoverageId: coverage.data.id },
      ifMatch: await etagOf(`/routes/${route.data.id}`, contracts.GetRouteResponseSchema),
    },
  );
  const afterDefaults = await read('INITIAL + PREPARATION after route defaults', initialScope);
  if (afterDefaults.dependencyDigest !== initial.dependencyDigest) {
    fail('route defaults are not used by the context and must not change its digest');
  }
  pass('route default signer and preferred coverage: context digest unchanged');
  const event = await create(
    'POST /mandates/{id}/events (TERMINATION, as reported)',
    `/mandates/${mandate.data.id}/events`,
    contracts.RecordAuthorityEventResponseSchema,
    {
      eventType: 'TERMINATION',
      sourceId: record.data.id,
      provenance: 'OPERATOR_REPORTED',
      scopeText: 'Synthetic CI whole mandate',
      interpretation: 'Synthetic CI operator reading',
    },
    await mandateEtag(),
  );
  const countsAfterWrites = await rowCounts();
  const afterEvent = await read(
    'INITIAL + PREPARATION after a later authority event',
    initialScope,
  );
  const events = afterEvent.context.authority?.coverages[0]?.authorityEvents ?? [];
  if (
    events.length !== 1 ||
    events[0]?.id !== event.data.id ||
    afterEvent.dependencyDigest === initial.dependencyDigest ||
    afterEvent.contextRevision !== initial.contextRevision
  ) {
    fail('a later relevant authority event must be in the context and its digest');
  }
  pass('later authority event included; digest changed while the case revision did not');

  // Expected refusals ----------------------------------------------------------------------------
  await refuse(
    'another case’s selection',
    { ...initialScope, authoritySelectionId: otherSelection.data.id },
    422,
    'CROSS_CASE_REFERENCE',
  );
  await refuse(
    'another case’s NMI binding',
    { taskType: 'NMI_REPLY', generationMode: 'PREPARATION', parentBindingId: otherNmi.data.id },
    422,
    'CROSS_CASE_REFERENCE',
  );
  await refuse(
    'OUTBOUND + OTHER named as a prior transmission',
    {
      taskType: 'NMI_REPLY',
      generationMode: 'PREPARATION',
      parentBindingId: nmi.data.id,
      priorBindingIds: [outboundOther.data.id],
    },
    422,
    'PRIOR_BINDING_NOT_AS_SENT',
  );
  await refuse(
    'a reply without its parent in DRAFTING',
    { taskType: 'NMI_REPLY', generationMode: 'DRAFTING', authoritySelectionId: selection.data.id },
    422,
    'REPLY_PARENT_REQUIRED',
  );
  await refuse(
    'INITIAL with a parent binding',
    { ...initialScope, parentBindingId: nmi.data.id },
    422,
    'SELECTOR_NOT_FOR_TASK',
  );
  await refuse(
    'an unknown selection',
    { ...initialScope, authoritySelectionId: randomUUID() },
    422,
    'REFERENCE_NOT_FOUND',
  );
  await refuse('no task named', { generationMode: 'PREPARATION' }, 400, 'INVALID_QUERY_PARAMETER');

  // The reads wrote nothing ----------------------------------------------------------------------
  const caseAfter = (
    await call(
      'GET /cases/{caseId}',
      'GET',
      `/cases/${caseId}`,
      200,
      contracts.GetCaseResponseSchema,
    )
  ).data;
  if (
    caseAfter['rowVersion'] !== caseBefore['rowVersion'] ||
    caseAfter['contextRevision'] !== caseBefore['contextRevision']
  ) {
    fail('a context read must not change the case');
  }
  await unchanged('the later context reads and every refused read', countsAfterWrites);
  pass('the reads left the case unchanged (row version and context revision)');

  for (const [label, method, suffix] of [
    ['POST /cases/{caseId}/production-context', 'POST', `/cases/${caseId}/production-context`],
    ['POST /cases/{caseId}/candidates', 'POST', `/cases/${caseId}/candidates`],
    [
      'POST /candidates/{id}/validation-runs',
      'POST',
      `/candidates/${randomUUID()}/validation-runs`,
    ],
    ['GET /candidates/{id}/readiness', 'GET', `/candidates/${randomUUID()}/readiness`],
    [
      'POST /candidates/{id}/unsigned-exports',
      'POST',
      `/candidates/${randomUUID()}/unsigned-exports`,
    ],
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
  console.error(`[smoke:p4d] FAIL ${error instanceof Error ? error.message : String(error)}`);
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
    console.error('[smoke:p4d] FAIL port 3000 still in use');
    process.exitCode = 1;
  }
  console.log(`[smoke:p4d] ${process.exitCode ? 'FAIL' : 'PASS'} (${checks} checks)`);
}
