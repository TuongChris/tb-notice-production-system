// yarn smoke:p4i --email <email> < password — P4I round trip against the COMPILED API, for CI only.
//
// It writes synthetic Directory, SourceReference, authority, case, intake, prompt, notice-candidate,
// validation-run and candidate-assessment records into the target database and leaves them there
// (append-only history), so it refuses to run unless CI=true: CI's tb_notice_dev is disposable, the
// operator's is not. The account is the synthetic CI admin created by `yarn admin:create`; the
// password is read from standard input. Requires a prior `yarn build`. No external requests.
// READY_FOR_SIGNER is derived on every read and every export (ADR-0011): "ready for authorized human
// signer review" — never stored, never G7, a signature, an adoption or permission to send. The
// unsigned export hands over the stored text exactly; nothing is signed, adopted or sent, and port
// 3000 is released.
//
// Flow (every response is checked against the ACTIVE contract TB-SCHEMA-API-v1.5.0 and for
// Cache-Control: no-store):
//   readiness and the export without a session (401) and the export without Origin (403) → login
//   → Agency → Owner, LegalSubject and their link → Route → Signer → mandate 1 (version, coverage,
//   coverage signer, freeze) → case A bound to the route with its selection, item, work, mapping
//   and linked source → an INITIAL DRAFTING prompt and a clean candidate → readiness UNVALIDATED
//   (no run) → a TECHNICAL_PASS run → REVIEW_REQUIRED (six gates never assessed) → five confirmed
//   PASS reviews: still REVIEW_REQUIRED (G6_UNASSESSED — no compensation) → the sixth →
//   READY_FOR_SIGNER (the server's epoch, the counted run, the six heads, HUMAN_PENDING, PROHIBITED)
//   → reads wrote nothing → an export naming another artifact (412 ARTIFACT_CHANGED), another digest
//   (412 CONTEXT_CHANGED), another run (412 VALIDATION_RUN_CHANGED) — nothing written → the export
//   (200: the stored subject, envelope and body exactly, both hashes, HUMAN_PENDING, sendPerformed
//   false, the readiness evaluated; one audit event, one idempotency record) → the same key again
//   (the same response, nothing new) → the same key with another body (409) → R14-AUD-015: a
//   synthetic ERROR run of the same epoch recorded as the newest run (a CI-only stand-in written
//   through the runtime account — the compiled API has no failure seam): BLOCKED (VALIDATION_ERROR),
//   the export and the first key refused (409), then a real TECHNICAL_PASS recovers READY and the
//   first key names a run that no longer counts (412 VALIDATION_RUN_CHANGED) → a second G3 PASS
//   (two heads: CONFLICT, REVIEW_REQUIRED) → the export (409 CANDIDATE_NOT_READY) and the first key
//   again (409: the old export releases nothing) → a candidate with an unresolved placeholder
//   (BLOCKED run → BLOCKED) and one with attachment wording (REVIEW_REQUIRED run → REVIEW_REQUIRED)
//   → R14-AUD-016: case R's NMI reply (an NMI captured as full text, a prior transmission captured
//   from a raw source and bound as sent, an NMI_REPLY DRAFTING prompt, a TECHNICAL_PASS reply, five
//   PASS gates): a G6 PASS recording an ask as REQUIRES_DOCUMENT holds G6 (REVIEW_REQUIRED, the
//   export 409), a sourced successor recording it answered makes it READY and exportable
//   → a REVOCATION event of mandate 1 (the digest moves: STALE_REVALIDATION_REQUIRED; the first key
//   again 412 CONTEXT_CHANGED) → case T with its own mandate 2 whose event takes effect seconds
//   later, READY, exported, then the boundary passes: STALE_REVALIDATION_REQUIRED with the same
//   digest (G1_TEMPORAL_REVIEW_STALE) and its export key again 409, judged at the replay's own
//   instant (R14-AUD-020; the claim and read interleavings are proven by the database tests) →
//   R14-AUD-018: the audit history read (GET /audit-events: 401 without a session; the exports'
//   and reviews' events recoverable exactly, their texts only as lengths; a cursor bound to its
//   filters; reading writes nothing) → no signing, sending, submission, adoption, AS_SENT, export
//   listing or G7 route (404) → every export wrote exactly one audit event and one
//   idempotency record, refusals, replays and reads nothing (row counts read through the runtime
//   account) → logout.
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { connect } from 'node:net';
import path from 'node:path';
import { createConnection } from 'mariadb';
import { argValue, repoRoot } from '../contracts/paths.ts';
import { assertLocalTarget } from '../db/allowlist.mjs';
import { loadRootEnv } from '../db/lib/targets.mjs';

const API = 'http://127.0.0.1:3000/api/v1';
const RULESET = 'TB-TECHNICAL-RULESET-v4';
const GATES = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6'] as const;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
let api: ChildProcess | undefined;
let exited = false;
let checks = 0;

/** Tables whose row counts the smoke follows. */
const COUNTED_TABLES = [
  'audit_events',
  'idempotency_records',
  'candidate_assessments',
  'assessment_sources',
  'validation_runs',
  'validation_issues',
  'notice_candidates',
  'prompt_snapshots',
  'correspondence_bindings',
] as const;
type Counts = Record<(typeof COUNTED_TABLES)[number], number>;

const SLOT = '[PENDING AUTHORIZED SIGNER — FULL LEGAL NAME REQUIRED]';

function pass(message: string): void {
  checks += 1;
  console.log(`[smoke:p4i] PASS ${message}`);
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

/**
 * A connection through the runtime account: row counts and audit actions, and the one CI-only
 * synthetic ERROR run of R14-AUD-015 (insertSyntheticErrorRun).
 */
async function runtimeConnection() {
  const raw = process.env['DATABASE_URL'];
  const target = assertLocalTarget('DATABASE_URL', raw, {
    expectedSchema: 'tb_notice_dev',
    forbidUser: 'tb_migrate',
  });
  const url = new URL(raw as string);
  return createConnection({
    host: url.hostname,
    port: Number(url.port),
    user: target.user,
    password: decodeURIComponent(url.password),
    database: target.schema,
    connectTimeout: 5000,
    allowPublicKeyRetrieval: true,
  });
}

async function rowCounts(): Promise<Counts> {
  const conn = await runtimeConnection();
  try {
    const counts = {} as Counts;
    for (const table of COUNTED_TABLES) {
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

/** The audit actions recorded for one entity, in recording order. */
async function auditActions(entityId: string): Promise<string[]> {
  const conn = await runtimeConnection();
  try {
    const rows = (await conn.query(
      'SELECT action FROM audit_events WHERE entity_id = ? ORDER BY created_at, id',
      [entityId],
    )) as Array<{ action: string }>;
    return rows.map((row) => row.action);
  } finally {
    await conn.end();
  }
}

/**
 * CI only (R14-AUD-015): a synthetic stand-in for a technical validation run whose rule failed while
 * running — the compiled API has no failure seam. A copy of the recorded run `templateRunId` of the
 * same epoch, as ERROR with `coverageManifest` (one required rule not executed) and its diagnostic
 * issue, recorded at `recordedAt` (a UTC "YYYY-MM-DD HH:MM:SS.mmm" text, never a driver Date).
 */
async function insertSyntheticErrorRun(
  templateRunId: string,
  coverageManifest: unknown,
  failedRule: string,
  recordedAt: string,
): Promise<string> {
  const conn = await runtimeConnection();
  try {
    const id = randomUUID();
    await conn.query(
      `INSERT INTO validation_runs (id, candidate_id, case_id, artifact_sha256, dependency_digest,
         dependency_manifest, evaluated_context_json, ruleset_version, result, coverage_manifest,
         blocker_count, review_required_count, warning_count, started_at, completed_at, created_at,
         created_by_id)
       SELECT ?, candidate_id, case_id, artifact_sha256, dependency_digest, dependency_manifest,
         evaluated_context_json, ruleset_version, 'ERROR', ?, 1, 0, 0, ?, ?, ?, created_by_id
       FROM validation_runs WHERE id = ?`,
      [id, JSON.stringify(coverageManifest), recordedAt, recordedAt, recordedAt, templateRunId],
    );
    await conn.query(
      `INSERT INTO validation_issues (id, run_id, rule_id, check_kind, severity, field_path, message,
         details, created_at, created_by_id)
       SELECT ?, ?, ?, 'DETERMINISTIC', 'BLOCKER', NULL,
         'Synthetic CI stand-in: the rule failed while running (TypeError).', NULL, ?, created_by_id
       FROM validation_runs WHERE id = ?`,
      [randomUUID(), id, failedRule, recordedAt, templateRunId],
    );
    return id;
  } finally {
    await conn.end();
  }
}

/** Fails unless exactly the given tables moved, each by exactly its delta (all others by none). */
function expectWrites(
  label: string,
  before: Counts,
  after: Counts,
  delta: Partial<Counts> = {},
): void {
  for (const table of COUNTED_TABLES) {
    const moved = after[table] - before[table];
    if (moved !== (delta[table] ?? 0)) {
      fail(`${label}: ${table} moved by ${moved}, expected ${delta[table] ?? 0}`);
    }
  }
}

/** JSON text with object keys sorted at every depth: equality regardless of key order. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const entries = Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`);
  return `{${entries.join(',')}}`;
}

interface Parser {
  safeParse(value: unknown): { success: boolean };
}

type Data = Record<string, unknown>;

interface ContextView {
  readonly contextRevision: number;
  readonly dependencyDigest: string;
}

interface GateSummary {
  readonly gate: string;
  readonly status: string;
  readonly assessmentId: string | null;
  readonly reasonCodes: string[];
}

interface Readiness {
  readonly candidateId: string;
  readonly artifactSha256: string;
  readonly dependencyDigest: string;
  readonly rulesetVersion: string;
  readonly status: string;
  readonly technicalResult: string | null;
  readonly validationRunId: string | null;
  readonly gates: GateSummary[];
  readonly reasonCodes: string[];
  readonly signatureState: string;
  readonly externalAction: string;
  readonly evaluatedAt: string;
}

interface UnsignedExport {
  readonly candidateId: string;
  readonly artifactSha256: string;
  readonly bodySha256: string;
  readonly subject: string;
  readonly envelope: Record<string, unknown>;
  readonly bodyText: string;
  readonly signatureState: string;
  readonly sendPerformed: boolean;
  readonly readiness: Readiness;
  readonly exportedAt: string;
}

async function main(): Promise<void> {
  if (process.env['CI'] !== 'true') {
    fail(
      'smoke:p4i writes directory, source, authority, case, intake, prompt, candidate, validation ' +
        'and assessment records into the target database; it runs only in CI (CI=true) against ' +
        'the disposable CI database',
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
  if (contracts.CONTRACT_BASELINE !== 'TB-SCHEMA-API-v1.5.0') {
    fail(`the active contract must be TB-SCHEMA-API-v1.5.0 (got ${contracts.CONTRACT_BASELINE})`);
  }

  api = spawn(process.execPath, [entry], { cwd: path.join(repoRoot, 'apps/api'), stdio: 'ignore' });
  api.on('exit', () => {
    exited = true;
  });
  for (let waited = 0; !(await listening(3000)); waited += 250) {
    if (exited || waited > 30_000) fail('compiled API did not start');
    await sleep(250);
  }

  // Session protection: readiness and the export are behind the global guard like every route.
  const someId = randomUUID();
  for (const [label, method, headers, expected, expectedCode] of [
    ['GET /candidates/{id}/readiness without a session', 'GET', {}, 401, 'SESSION_REQUIRED'],
    [
      'POST /candidates/{id}/unsigned-exports without a session',
      'POST',
      { Origin: origin as string, 'Content-Type': 'application/json' },
      401,
      'SESSION_REQUIRED',
    ],
    [
      'POST /candidates/{id}/unsigned-exports without Origin',
      'POST',
      { 'Content-Type': 'application/json' },
      403,
      'ORIGIN_REJECTED',
    ],
  ] as const) {
    const suffix = method === 'GET' ? 'readiness' : 'unsigned-exports';
    const response = await fetch(`${API}/candidates/${someId}/${suffix}`, {
      method,
      headers: {
        'X-Requested-With': 'TB-APP',
        'Idempotency-Key': `p4i-ci-${randomUUID()}`,
        ...headers,
      },
      ...(method === 'POST' ? { body: '{}' } : {}),
    });
    const body = (await response.json()) as { error?: { code?: string } };
    if (response.status !== expected || body.error?.code !== expectedCode) {
      fail(`${label}: expected ${expected} ${expectedCode}, got ${response.status}`);
    }
    if (response.headers.get('cache-control') !== 'no-store') fail(`${label}: missing no-store`);
    pass(`${label} → ${expected} ${expectedCode}`);
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

  // Keys no readiness or export ever carries (a signature, adoption, approval or sending verdict).
  const forbiddenKey =
    /"(approved\w*|adopted\w*|signedAt|signedBy\w*|authori[sz]ed\w*|verified\w*|infring\w*|legallyValid\w*|legalApproval\w*|eligib\w*|sentAt|submitted\w*|g7\w*)"\s*:/i;

  async function call(
    label: string,
    method: string,
    route: string,
    expected: number,
    schema: Parser | null,
    options: { body?: unknown; ifMatch?: string; key?: string | null } = {},
  ): Promise<{
    data: Data;
    etag: string | null;
    code: string | null;
    details: Record<string, unknown>;
    text: string;
  }> {
    const headers: Record<string, string> = { Cookie: cookie, 'X-Requested-With': 'TB-APP' };
    if (method !== 'GET') {
      headers['Origin'] = origin as string;
      headers['X-CSRF-Token'] = csrf;
      const key = options.key === undefined ? `p4i-ci-${randomUUID()}` : options.key;
      if (key !== null) headers['Idempotency-Key'] = key;
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
    if (checker && !checker.safeParse(body).success) {
      fail(`${label}: response violates the contract`);
    }
    if (expected < 400 && forbiddenKey.test(text)) {
      fail(`${label}: carries a signature, adoption, approval or sending key`);
    }
    pass(`${label} → ${expected}`);
    const envelope = body as
      { data?: Data; error?: { code: string; details?: Record<string, unknown> } } | undefined;
    return {
      data: envelope?.data ?? {},
      etag: response.headers.get('etag'),
      code: envelope?.error?.code ?? null,
      details: envelope?.error?.details ?? {},
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
  const idOf = (result: { data: Data }) => String(result.data['id']);

  const tag = randomUUID().slice(0, 8);
  const mailbox = `p4i-ci-${tag}@example.invalid`;
  const platform = `p4i-ci-platform-${tag}@example.invalid`;

  // Directory, route and authority ---------------------------------------------------------------
  const agency = await create('POST /agencies', '/agencies', contracts.CreateAgencyResponseSchema, {
    displayName: `P4I CI synthetic agency ${tag}`,
    legalName: `P4I CI Synthetic Agency ${tag} Ltd`,
  });
  const agencyId = idOf(agency);
  const source = (title: string, extra: Record<string, unknown> = {}) =>
    create('POST /sources', '/sources', contracts.CreateSourceResponseSchema, {
      agencyId,
      title: `P4I CI synthetic ${title} ${tag} (not evidence)`,
      sourceRole: 'OPERATOR_INPUT',
      scopeText: `Synthetic CI ${title}`,
      ...extra,
    });
  const record = await source('agency record', { sourceRole: 'CANONICAL_RECORD' });
  const owner = await create('POST /owners', '/owners', contracts.CreateOwnerResponseSchema, {
    displayName: `P4I CI synthetic brand ${tag}`,
  });
  const subject = await create(
    'POST /legal-subjects',
    '/legal-subjects',
    contracts.CreateLegalSubjectResponseSchema,
    { subjectType: 'LEGAL_ENTITY', legalName: `P4I CI Synthetic Subject ${tag} LLC` },
  );
  const association = await create(
    'POST /owners/{id}/subjects',
    `/owners/${idOf(owner)}/subjects`,
    contracts.LinkOwnerSubjectResponseSchema,
    { legalSubjectId: idOf(subject) },
    await etagOf(`/owners/${idOf(owner)}`, contracts.GetOwnerResponseSchema),
  );
  const route = await create('POST /routes', '/routes', contracts.CreateRouteResponseSchema, {
    agencyId,
    ownerSubjectId: idOf(association),
  });
  const signer = await create('POST /signers', '/signers', contracts.CreateSignerResponseSchema, {
    agencyId,
    fullLegalName: `P4I CI Synthetic Signer ${tag}`,
  });
  const mandateEtag = (id: string) => etagOf(`/mandates/${id}`, contracts.GetMandateResponseSchema);
  /** One frozen mandate version with one coverage of the route recording the signer. */
  const authority = async (label: string) => {
    const mandate = await create(
      `POST /mandates (${label})`,
      '/mandates',
      contracts.CreateMandateResponseSchema,
      { agencyId, label: `P4I CI synthetic ${label} ${tag}` },
    );
    const version = await create(
      `POST /mandates/{id}/versions (${label})`,
      `/mandates/${idOf(mandate)}/versions`,
      contracts.CreateMandateVersionResponseSchema,
      {
        changeKind: 'NEW_AUTHORIZATION',
        changeReason: 'Synthetic CI capture',
        primarySourceId: idOf(record),
        documentState: 'SIGNED_APPEARING',
      },
      await mandateEtag(idOf(mandate)),
    );
    const versionEtag = () =>
      etagOf(`/mandate-versions/${idOf(version)}`, contracts.GetMandateVersionResponseSchema);
    const basis = await source(`${label} coverage basis`);
    const coverage = await create(
      `POST /mandate-versions/{id}/coverages (${label})`,
      `/mandate-versions/${idOf(version)}/coverages`,
      contracts.CreateCoverageResponseSchema,
      {
        routeId: idOf(route),
        coverageLabel: `P4I CI synthetic ${label} coverage ${tag}`,
        basisSourceId: idOf(basis),
        actionScope: ['PREPARE_NOTICE'],
      },
      await versionEtag(),
    );
    await create(
      `POST /coverages/{id}/signers (${label})`,
      `/coverages/${idOf(coverage)}/signers`,
      contracts.CreateCoverageSignerResponseSchema,
      { signerId: idOf(signer), capacity: 'Synthetic CI capacity', sourceId: idOf(basis) },
      await etagOf(`/coverages/${idOf(coverage)}`, contracts.GetCoverageResponseSchema),
    );
    await call(
      `POST /mandate-versions/{id}/freeze (${label})`,
      'POST',
      `/mandate-versions/${idOf(version)}/freeze`,
      200,
      contracts.FreezeMandateVersionResponseSchema,
      {
        body: { reason: 'Synthetic CI freeze of the recorded terms' },
        ifMatch: await versionEtag(),
      },
    );
    return { mandateId: idOf(mandate), coverageId: idOf(coverage) };
  };
  const recordEvent = async (mandateId: string, label: string, fields: Record<string, unknown>) =>
    create(
      `POST /mandates/{id}/events (${label})`,
      `/mandates/${mandateId}/events`,
      contracts.RecordAuthorityEventResponseSchema,
      {
        eventType: 'CURRENTNESS_RECORDED',
        provenance: 'OPERATOR_REPORTED',
        sourceId: idOf(record),
        scopeText: `Synthetic CI whole mandate ${tag}`,
        interpretation: `Synthetic CI operator reading ${tag}`,
        ...fields,
      },
      await mandateEtag(mandateId),
    );
  const mandate1 = await authority('mandate 1');

  // A case with its selection, intake and linked source; a prompt; candidates ----------------------
  const caseEtag = (id: string) => etagOf(`/cases/${id}`, contracts.GetCaseResponseSchema);
  const mappingBasis = await source('mapping basis');
  const setUpCase = async (label: string, video: string, coverageId: string) => {
    const created = await create('POST /cases', '/cases', contracts.CreateCaseResponseSchema, {
      agencyId,
      routeId: idOf(route),
      intakeLabel: `P4I CI synthetic ${label} ${tag}`,
    });
    const id = idOf(created);
    const selection = await create(
      'POST /cases/{caseId}/authority-selections',
      `/cases/${id}/authority-selections`,
      contracts.SelectCaseAuthorityResponseSchema,
      {
        routeId: idOf(route),
        signerId: idOf(signer),
        taskType: 'INITIAL',
        intendedFromEmail: mailbox,
        selectionNote: `Synthetic CI selection ${tag}`,
        coverages: [{ coverageId, applicationScope: `Synthetic CI scope ${tag}` }],
      },
      await caseEtag(id),
    );
    const item = await create(
      'POST /cases/{caseId}/reported-items',
      `/cases/${id}/reported-items`,
      contracts.CreateReportedItemResponseSchema,
      { rawUrl: `https://www.youtube.com/watch?v=${video}` },
      await caseEtag(id),
    );
    const work = await create(
      'POST /cases/{caseId}/works',
      `/cases/${id}/works`,
      contracts.CreateCaseWorkResponseSchema,
      { title: `P4I CI synthetic work ${label} ${tag}` },
      await caseEtag(id),
    );
    await create(
      'POST /cases/{caseId}/mappings',
      `/cases/${id}/mappings`,
      contracts.CreateUseMappingResponseSchema,
      {
        caseWorkId: idOf(work),
        reportedItemId: idOf(item),
        occurrence: 1,
        basisSourceId: idOf(mappingBasis),
        provenance: 'OPERATOR_REPORTED',
      },
      await caseEtag(id),
    );
    const evidence = await source(`${label} licence record`);
    const linked = await create(
      `POST /cases/{caseId}/sources (${label})`,
      `/cases/${id}/sources`,
      contracts.LinkCaseSourceResponseSchema,
      { sourceId: idOf(evidence), useRole: 'SYNTHETIC_SUPPORT', scopeNote: `Synthetic CI ${tag}` },
      await caseEtag(id),
    );
    return {
      id,
      selection: idOf(selection),
      link: idOf(linked),
      item: idOf(item),
      evidence: idOf(evidence),
    };
  };
  const scopeQuery = (selection: string) =>
    new URLSearchParams({
      taskType: 'INITIAL',
      generationMode: 'DRAFTING',
      authoritySelectionId: selection,
    }).toString();
  const readContext = async (target: { id: string; selection: string }, label: string) =>
    (
      await call(
        `GET /cases/{caseId}/production-context (${label})`,
        'GET',
        `/cases/${target.id}/production-context?${scopeQuery(target.selection)}`,
        200,
        contracts.GetProductionContextResponseSchema,
      )
    ).data as unknown as ContextView;
  const generate = async (target: { id: string; selection: string }, label: string) => {
    const view = await readContext(target, label);
    return (
      await create(
        `POST /cases/{caseId}/prompts (${label})`,
        `/cases/${target.id}/prompts`,
        contracts.GeneratePromptResponseSchema,
        {
          taskType: 'INITIAL',
          generationMode: 'DRAFTING',
          expectedContextRevision: view.contextRevision,
          expectedDependencyDigest: view.dependencyDigest,
          authoritySelectionId: target.selection,
          priorBindingIds: [],
        },
      )
    ).data as unknown as { id: string; dependencyDigest: string };
  };
  const cleanBody = (label: string) =>
    `Synthetic CI notice text for human review (${label}). \r\nThe recorded work appears in the reported video (café).\n\nSincerely,\n${SLOT}\n`;
  const importDraft = async (caseId: string, promptId: string, label: string, bodyText: string) =>
    (
      await create(
        `POST /cases/{caseId}/candidates (${label})`,
        `/cases/${caseId}/candidates`,
        contracts.ImportCandidateResponseSchema,
        {
          promptSnapshotId: promptId,
          subject: `P4I CI synthetic notice ${tag} — ${label}`,
          envelope: { from: mailbox, to: platform },
          bodyText,
          preparedDocuments: [],
        },
      )
    ).data as unknown as { id: string; caseId: string; artifactSha256: string };
  const validate = async (
    candidate: { id: string; artifactSha256: string },
    target: { id: string; selection: string },
    label: string,
  ) => {
    const view = await readContext(target, label);
    return (
      await call(
        `POST /candidates/{id}/validation-runs (${label})`,
        'POST',
        `/candidates/${candidate.id}/validation-runs`,
        201,
        contracts.ValidateCandidateResponseSchema,
        {
          body: {
            expectedArtifactSha256: candidate.artifactSha256,
            expectedDependencyDigest: view.dependencyDigest,
          },
        },
      )
    ).data as unknown as { id: string; result: string; dependencyDigest: string };
  };
  const passReview = async (
    candidate: { id: string; artifactSha256: string },
    digest: string,
    gate: string,
    link: string,
    extra: Record<string, unknown> = {},
  ) =>
    (
      await create(
        `POST /candidates/{id}/assessments (${gate} PASS)`,
        `/candidates/${candidate.id}/assessments`,
        contracts.CaptureCandidateAssessmentResponseSchema,
        {
          gate,
          result: 'PASS',
          expectedArtifactSha256: candidate.artifactSha256,
          expectedDependencyDigest: digest,
          rulesetVersion: RULESET,
          scopeState: 'SCOPE_CONFIRMED_FOR_CANDIDATE',
          performerKind: 'HUMAN',
          performerLabel: `P4I CI synthetic reviewer ${gate} ${tag}`,
          provenance: 'OPERATOR_REPORTED',
          rationale: `Synthetic CI ${gate} rationale ${tag}`,
          scopeText: `Synthetic CI ${gate} scope ${tag}`,
          assessedAt: new Date().toISOString(),
          sources: [{ caseSourceId: link, supportedConclusion: `Synthetic CI ${gate} ${tag}` }],
          ...extra,
        },
      )
    ).data as unknown as { id: string };
  const readiness = async (candidateId: string, label: string): Promise<Readiness> => {
    const result = await call(
      `GET /candidates/{id}/readiness (${label})`,
      'GET',
      `/candidates/${candidateId}/readiness`,
      200,
      contracts.GetCandidateReadinessResponseSchema,
    );
    if (result.etag !== null) fail(`${label}: a readiness has no ETag`);
    const current = result.data as unknown as Readiness;
    if (current.signatureState !== 'HUMAN_PENDING' || current.externalAction !== 'PROHIBITED') {
      fail(`${label}: a readiness is always HUMAN_PENDING and PROHIBITED`);
    }
    return current;
  };
  const exportRoute = (candidateId: string) => `/candidates/${candidateId}/unsigned-exports`;
  const exportBody = (current: Readiness, extra: Record<string, unknown> = {}) => ({
    expectedArtifactSha256: current.artifactSha256,
    expectedDependencyDigest: current.dependencyDigest,
    validationRunId: current.validationRunId ?? randomUUID(),
    format: 'PLAIN_TEXT',
    ...extra,
  });
  const expectStatus = (current: Readiness, status: string, codes: string[], label: string) => {
    if (current.status !== status || canonical(current.reasonCodes) !== canonical(codes)) {
      fail(
        `${label}: expected ${status} ${JSON.stringify(codes)}, got ${current.status} ${JSON.stringify(current.reasonCodes)}`,
      );
    }
    pass(`${label}: ${status} ${codes.join(', ') || '(no reason)'}`);
  };

  const caseA = await setUpCase('case A', `P4iA${tag.slice(0, 4)}_Zz`, mandate1.coverageId);
  const promptA = await generate(caseA, 'case A INITIAL + DRAFTING');
  const bodyA = cleanBody('case A');
  const candidateA = await importDraft(caseA.id, promptA.id, 'case A clean', bodyA);

  // UNVALIDATED → REVIEW_REQUIRED → no compensation → READY_FOR_SIGNER ------------------------------
  const unassessed = GATES.map((gate) => `${gate}_UNASSESSED`);
  expectStatus(
    await readiness(candidateA.id, 'no run'),
    'UNVALIDATED',
    ['VALIDATION_MISSING', ...unassessed],
    'a candidate without a run',
  );
  const run1 = await validate(candidateA, caseA, 'case A clean');
  if (run1.result !== 'TECHNICAL_PASS') fail('case A’s clean candidate must be a TECHNICAL_PASS');
  expectStatus(
    await readiness(candidateA.id, 'run, no review'),
    'REVIEW_REQUIRED',
    unassessed,
    'a TECHNICAL_PASS with six gates never assessed',
  );
  const heads: Record<string, string> = {};
  for (const gate of GATES.slice(0, 5)) {
    heads[gate] = (await passReview(candidateA, run1.dependencyDigest, gate, caseA.link)).id;
  }
  expectStatus(
    await readiness(candidateA.id, 'five PASS gates'),
    'REVIEW_REQUIRED',
    ['G6_UNASSESSED'],
    'five PASS gates and one never assessed (nothing compensates)',
  );
  heads['G6'] = (await passReview(candidateA, run1.dependencyDigest, 'G6', caseA.link)).id;
  const countsReady = await rowCounts();
  const ready = await readiness(candidateA.id, 'six PASS gates');
  expectStatus(ready, 'READY_FOR_SIGNER', [], 'a full TECHNICAL_PASS and six confirmed PASS heads');
  if (
    ready.candidateId !== candidateA.id ||
    ready.artifactSha256 !== candidateA.artifactSha256 ||
    ready.dependencyDigest !== run1.dependencyDigest ||
    ready.dependencyDigest !== promptA.dependencyDigest ||
    ready.rulesetVersion !== RULESET ||
    ready.technicalResult !== 'TECHNICAL_PASS' ||
    ready.validationRunId !== run1.id ||
    canonical(ready.gates.map((gate) => [gate.gate, gate.status, gate.assessmentId])) !==
      canonical(GATES.map((gate) => [gate, 'PASS', heads[gate]]))
  ) {
    fail('READY_FOR_SIGNER must report the server’s epoch, the counted run and the six heads');
  }
  pass('READY_FOR_SIGNER reports the current epoch, the counted run and the six PASS heads');
  await readiness(candidateA.id, 'again');
  expectWrites('readiness reads', countsReady, await rowCounts());
  pass('readiness reads wrote nothing (row counts unchanged)');

  // Export refusals, the export, its replay -----------------------------------------------------
  const refusals: Array<[string, Record<string, unknown>, number, string]> = [
    ['another artifact', { expectedArtifactSha256: 'a'.repeat(64) }, 412, 'ARTIFACT_CHANGED'],
    ['another digest', { expectedDependencyDigest: 'b'.repeat(64) }, 412, 'CONTEXT_CHANGED'],
    ['another run', { validationRunId: randomUUID() }, 412, 'VALIDATION_RUN_CHANGED'],
  ];
  for (const [label, extra, status, code] of refusals) {
    const refused = await call(
      `POST /candidates/{id}/unsigned-exports (${label})`,
      'POST',
      exportRoute(candidateA.id),
      status,
      null,
      { body: exportBody(ready, extra) },
    );
    if (refused.code !== code) fail(`${label}: expected ${code}, got ${refused.code}`);
    if (refused.text.includes('Synthetic CI notice text')) fail(`${label}: released the body`);
  }
  expectWrites('the refused exports', countsReady, await rowCounts());
  pass('refused exports released and wrote nothing');

  const key1 = `p4i-ci-${randomUUID()}`;
  // Bindings this smoke records after `countsReady` (the reply's NMI and its prior transmission).
  let bindingsRecorded = 0;
  const exported = await call(
    'POST /candidates/{id}/unsigned-exports (READY)',
    'POST',
    exportRoute(candidateA.id),
    200,
    contracts.ExportUnsignedCandidateResponseSchema,
    { body: exportBody(ready), key: key1 },
  );
  if (exported.etag !== null) fail('an unsigned export has no ETag');
  const handoff = exported.data as unknown as UnsignedExport;
  const stored = (
    await call(
      'GET /candidates/{id}',
      'GET',
      `/candidates/${candidateA.id}`,
      200,
      contracts.GetCandidateResponseSchema,
    )
  ).data;
  if (
    handoff.bodyText !== bodyA ||
    handoff.bodyText !== stored['bodyText'] ||
    handoff.subject !== stored['subject'] ||
    canonical(handoff.envelope) !== canonical(stored['envelopeJson']) ||
    handoff.bodySha256 !== sha256(bodyA) ||
    handoff.bodySha256 !== stored['bodySha256'] ||
    handoff.artifactSha256 !== stored['artifactSha256'] ||
    handoff.signatureState !== 'HUMAN_PENDING' ||
    handoff.sendPerformed !== false ||
    handoff.readiness.status !== 'READY_FOR_SIGNER' ||
    handoff.readiness.validationRunId !== run1.id ||
    handoff.exportedAt !== handoff.readiness.evaluatedAt
  ) {
    fail('the unsigned export must hand over the stored text exactly, unsigned and unsent');
  }
  if (handoff.bodyText.split(SLOT).length !== 2) fail('the pending slot must stay exactly once');
  pass(
    'the export hands over the stored subject, envelope and body exactly (CRLF, trailing space, é), both hashes, HUMAN_PENDING, sendPerformed false and the readiness evaluated',
  );
  const countsExported = await rowCounts();
  expectWrites('the export', countsReady, countsExported, {
    audit_events: 1,
    idempotency_records: 1,
  });
  const actions = await auditActions(candidateA.id);
  if (
    !actions.includes('EXPORT_UNSIGNED') ||
    actions.some((action) => /(^|_)SIGNED|_SENT|SUBMITTED/.test(action))
  ) {
    fail(`the export audit must be EXPORT_UNSIGNED only, got ${JSON.stringify(actions)}`);
  }
  pass('the export wrote one EXPORT_UNSIGNED audit event and one idempotency record, nothing else');

  const replayed = await call(
    'POST /candidates/{id}/unsigned-exports (the same key and body)',
    'POST',
    exportRoute(candidateA.id),
    200,
    contracts.ExportUnsignedCandidateResponseSchema,
    { body: exportBody(ready), key: key1 },
  );
  if (canonical(replayed.data) !== canonical(exported.data)) {
    fail('a replay while still READY must return the exact historical response');
  }
  expectWrites('the replay', countsExported, await rowCounts());
  pass('the replay returned the historical response and wrote nothing');
  const conflicting = await call(
    'POST /candidates/{id}/unsigned-exports (the same key, another body)',
    'POST',
    exportRoute(candidateA.id),
    409,
    null,
    { body: exportBody(ready, { validationRunId: randomUUID() }), key: key1 },
  );
  if (conflicting.code !== 'IDEMPOTENCY_CONFLICT') fail('the same key with another body is 409');

  // A transient ERROR run never poisons its epoch (R14-AUD-015) -----------------------------------
  const run1Stored = (
    await call(
      'GET /validation-runs/{id} (run 1)',
      'GET',
      `/validation-runs/${run1.id}`,
      200,
      contracts.GetValidationRunResponseSchema,
    )
  ).data as unknown as { coverageManifest: { executedRuleIds: string[] } };
  const failedRule = 'ENVELOPE.SENDER';
  const beforeError = await readiness(candidateA.id, 'before the ERROR run');
  expectStatus(beforeError, 'READY_FOR_SIGNER', [], 'case A before its newest run');
  const countsBeforeError = await rowCounts();
  const recordedAt = new Date(Date.parse(beforeError.evaluatedAt) + 1)
    .toISOString()
    .replace('T', ' ')
    .replace('Z', '');
  const errorRunId = await insertSyntheticErrorRun(
    run1.id,
    {
      ...run1Stored.coverageManifest,
      executedRuleIds: run1Stored.coverageManifest.executedRuleIds.filter(
        (ruleId) => ruleId !== failedRule,
      ),
      notExecutedRuleIds: [failedRule],
    },
    failedRule,
    recordedAt,
  );
  const errored = await readiness(candidateA.id, 'the newest run is ERROR');
  expectStatus(
    errored,
    'BLOCKED',
    ['VALIDATION_ERROR', 'VALIDATION_COVERAGE_INCOMPLETE'],
    'the newest run of the epoch is ERROR: it counts, and no older PASS is relied on',
  );
  if (errored.validationRunId !== errorRunId || errored.technicalResult !== 'ERROR') {
    fail('the newest ERROR run must be the counted run');
  }
  const erroredExport = await call(
    'POST /candidates/{id}/unsigned-exports (the newest run is ERROR)',
    'POST',
    exportRoute(candidateA.id),
    409,
    null,
    { body: exportBody(ready) },
  );
  const erroredReplay = await call(
    'POST /candidates/{id}/unsigned-exports (the first key while the newest run is ERROR)',
    'POST',
    exportRoute(candidateA.id),
    409,
    null,
    { body: exportBody(ready), key: key1 },
  );
  for (const refused of [erroredExport, erroredReplay]) {
    if (
      refused.code !== 'CANDIDATE_NOT_READY' ||
      refused.details['status'] !== 'BLOCKED' ||
      refused.text.includes('Synthetic CI notice text')
    ) {
      fail('a newest ERROR run must refuse the export and its replay, releasing nothing');
    }
  }
  expectWrites('the refusals while the newest run is ERROR', countsBeforeError, await rowCounts(), {
    validation_runs: 1,
    validation_issues: 1,
  });
  pass(
    'a newest ERROR run: the export and the first key refused (409), nothing released or written',
  );
  const run2 = await validate(candidateA, caseA, 'case A after the ERROR run');
  if (run2.result !== 'TECHNICAL_PASS' || run2.dependencyDigest !== run1.dependencyDigest) {
    fail('the rerun of the same epoch must be a TECHNICAL_PASS');
  }
  const recovered = await readiness(candidateA.id, 'a later completed PASS');
  expectStatus(
    recovered,
    'READY_FOR_SIGNER',
    [],
    'ERROR → a later completed TECHNICAL_PASS of the same epoch: the ERROR poisons nothing',
  );
  if (recovered.validationRunId !== run2.id)
    fail('the later completed run must be the counted run');
  const renamed = await call(
    'POST /candidates/{id}/unsigned-exports (the first key names run 1)',
    'POST',
    exportRoute(candidateA.id),
    412,
    null,
    { body: exportBody(ready), key: key1 },
  );
  if (
    renamed.code !== 'VALIDATION_RUN_CHANGED' ||
    renamed.text.includes('Synthetic CI notice text')
  ) {
    fail('the first key named run 1, which no longer counts: 412 VALIDATION_RUN_CHANGED');
  }
  pass(
    'after the recovery the first key names a run that no longer counts (412), nothing released',
  );

  // Gate conflict: the old export releases nothing -----------------------------------------------
  await passReview(candidateA, run1.dependencyDigest, 'G3', caseA.link, {
    performerLabel: `P4I CI synthetic second G3 reviewer ${tag}`,
  });
  const conflicted = await readiness(candidateA.id, 'two G3 heads');
  expectStatus(
    conflicted,
    'REVIEW_REQUIRED',
    ['G3_CONFLICT', 'GATE_HEADS_UNRECONCILED'],
    'two current G3 heads (never the latest PASS)',
  );
  const notReady = await call(
    'POST /candidates/{id}/unsigned-exports (gate conflict)',
    'POST',
    exportRoute(candidateA.id),
    409,
    null,
    { body: exportBody(conflicted, { validationRunId: run1.id }) },
  );
  if (notReady.code !== 'CANDIDATE_NOT_READY' || notReady.details['status'] !== 'REVIEW_REQUIRED') {
    fail('a candidate that is not ready is 409 CANDIDATE_NOT_READY with its status');
  }
  const replayConflict = await call(
    'POST /candidates/{id}/unsigned-exports (the first key after the conflict)',
    'POST',
    exportRoute(candidateA.id),
    409,
    null,
    { body: exportBody(ready), key: key1 },
  );
  if (
    replayConflict.code !== 'CANDIDATE_NOT_READY' ||
    replayConflict.text.includes('Synthetic CI notice text')
  ) {
    fail('an old export must never release its body once the candidate is not ready');
  }
  pass('the first export key no longer releases anything (409, the present refusal)');

  // BLOCKED and REVIEW_REQUIRED runs ----------------------------------------------------------------
  const blocked = await importDraft(
    caseA.id,
    promptA.id,
    'case A placeholder',
    `Synthetic CI text [REVIEWED DECLARATION TEXT REQUIRED]\n${SLOT}\n`,
  );
  const blockedRun = await validate(blocked, caseA, 'case A placeholder');
  if (blockedRun.result !== 'BLOCKED') fail('an unresolved placeholder is a BLOCKED run');
  const blockedReadiness = await readiness(blocked.id, 'a BLOCKED run');
  if (
    blockedReadiness.status !== 'BLOCKED' ||
    !blockedReadiness.reasonCodes.includes('VALIDATION_BLOCKED')
  ) {
    fail('a BLOCKED run of the current epoch is BLOCKED');
  }
  pass('a BLOCKED run of the current epoch → BLOCKED (VALIDATION_BLOCKED)');
  const worded = await importDraft(
    caseA.id,
    promptA.id,
    'case A wording',
    `Please find attached the licence (${tag}).\n${SLOT}\n`,
  );
  const wordedRun = await validate(worded, caseA, 'case A wording');
  if (wordedRun.result !== 'REVIEW_REQUIRED') fail('attachment wording is a REVIEW_REQUIRED run');
  const wordedReadiness = await readiness(worded.id, 'a REVIEW_REQUIRED run');
  if (
    wordedReadiness.status !== 'REVIEW_REQUIRED' ||
    !wordedReadiness.reasonCodes.includes('VALIDATION_REVIEW_REQUIRED')
  ) {
    fail('a REVIEW_REQUIRED run is REVIEW_REQUIRED');
  }
  pass('a REVIEW_REQUIRED run of the current epoch → REVIEW_REQUIRED (no waiver)');

  // An NMI reply: an unresolved ask holds G6 (R14-AUD-016) -----------------------------------------
  const caseR = await setUpCase('case R', `P4iR${tag.slice(0, 4)}_Zz`, mandate1.coverageId);
  const captureMessage = (label: string, fields: Record<string, unknown>) =>
    create(
      `POST /correspondence (${label})`,
      '/correspondence',
      contracts.CaptureCorrespondenceResponseSchema,
      {
        agencyId,
        mailboxAddress: mailbox,
        direction: 'INBOUND',
        subject: `P4I CI synthetic ${label} ${tag}`,
        captureMode: 'COPIED_FULL_TEXT',
        bodyRole: 'FULL_MESSAGE',
        bodyText: `Synthetic CI ${label} body ${tag}`,
        ...fields,
      },
    );
  const bindMessage = async (label: string, body: Record<string, unknown>) =>
    create(
      `POST /cases/{caseId}/correspondence-bindings (${label})`,
      `/cases/${caseR.id}/correspondence-bindings`,
      contracts.BindCaseCorrespondenceResponseSchema,
      body,
      await caseEtag(caseR.id),
    );
  const replyTo = `p4i-ci-reply-${tag}@example.invalid`;
  const nmiMessage = await captureMessage('NMI', {
    bodyText: `Synthetic CI question 1: please provide the licence (${tag}).`,
    fromAddress: `p4i-ci-review-${tag}@example.invalid`,
    replyToAddress: replyTo,
  });
  const nmi = idOf(
    await bindMessage('NMI', { correspondenceId: idOf(nmiMessage), eventType: 'NMI' }),
  );
  const rawFile = await source('raw message file', {
    scopeBindings: { legalSubjectIds: [idOf(subject)] },
  });
  const sentMessage = await captureMessage('notice as sent (raw)', {
    direction: 'OUTBOUND',
    captureMode: 'RAW_SOURCE',
    rawSourceId: idOf(rawFile),
  });
  const sent = idOf(
    await bindMessage('INITIAL_AS_SENT', {
      correspondenceId: idOf(sentMessage),
      eventType: 'INITIAL_AS_SENT',
      reportedItemId: caseR.item,
    }),
  );
  bindingsRecorded += 2;
  const replyQuery = new URLSearchParams({
    taskType: 'NMI_REPLY',
    generationMode: 'DRAFTING',
    authoritySelectionId: caseR.selection,
    parentBindingId: nmi,
    priorBindingIds: sent,
  }).toString();
  const readReplyContext = async (label: string) =>
    (
      await call(
        `GET /cases/{caseId}/production-context (${label})`,
        'GET',
        `/cases/${caseR.id}/production-context?${replyQuery}`,
        200,
        contracts.GetProductionContextResponseSchema,
      )
    ).data as unknown as ContextView;
  const replyView = await readReplyContext('case R NMI_REPLY + DRAFTING');
  const replyPrompt = (
    await create(
      'POST /cases/{caseId}/prompts (case R NMI_REPLY)',
      `/cases/${caseR.id}/prompts`,
      contracts.GeneratePromptResponseSchema,
      {
        taskType: 'NMI_REPLY',
        generationMode: 'DRAFTING',
        expectedContextRevision: replyView.contextRevision,
        expectedDependencyDigest: replyView.dependencyDigest,
        authoritySelectionId: caseR.selection,
        parentBindingId: nmi,
        priorBindingIds: [sent],
      },
    )
  ).data as unknown as { id: string };
  const replyCandidate = (
    await create(
      'POST /cases/{caseId}/candidates (case R reply)',
      `/cases/${caseR.id}/candidates`,
      contracts.ImportCandidateResponseSchema,
      {
        promptSnapshotId: replyPrompt.id,
        subject: `P4I CI synthetic reply ${tag}`,
        envelope: { from: mailbox, to: replyTo, parentBindingId: nmi },
        bodyText: cleanBody('case R reply'),
        preparedDocuments: [],
      },
    )
  ).data as unknown as { id: string; artifactSha256: string };
  const replyRun = (
    await call(
      'POST /candidates/{id}/validation-runs (case R reply)',
      'POST',
      `/candidates/${replyCandidate.id}/validation-runs`,
      201,
      contracts.ValidateCandidateResponseSchema,
      {
        body: {
          expectedArtifactSha256: replyCandidate.artifactSha256,
          expectedDependencyDigest: (await readReplyContext('case R before its run'))
            .dependencyDigest,
        },
      },
    )
  ).data as unknown as { id: string; result: string; dependencyDigest: string };
  if (replyRun.result !== 'TECHNICAL_PASS') {
    fail(`case R’s reply must be a TECHNICAL_PASS, got ${replyRun.result}`);
  }
  for (const gate of GATES.slice(0, 5)) {
    await passReview(replyCandidate, replyRun.dependencyDigest, gate, caseR.link);
  }
  const askOf = (disposition: string, extra: Record<string, unknown> = {}) => ({
    askId: 'Q1',
    questionText: `Synthetic CI question 1: please provide the licence (${tag}).`,
    parentBindingId: nmi,
    disposition,
    sourceIds: [],
    ...extra,
  });
  const unresolved = await passReview(replyCandidate, replyRun.dependencyDigest, 'G6', caseR.link, {
    askDispositions: [askOf('REQUIRES_DOCUMENT')],
  });
  const held = await readiness(replyCandidate.id, 'case R: the ask requires a document');
  expectStatus(
    held,
    'REVIEW_REQUIRED',
    ['G6_HOLD', 'G6_ASK_REQUIRES_DOCUMENT'],
    'a G6 PASS recording an NMI ask as REQUIRES_DOCUMENT holds G6 (five PASS gates never compensate)',
  );
  const heldExport = await call(
    'POST /candidates/{id}/unsigned-exports (case R, an unresolved ask)',
    'POST',
    exportRoute(replyCandidate.id),
    409,
    null,
    { body: exportBody(held, { validationRunId: replyRun.id }) },
  );
  if (
    heldExport.code !== 'CANDIDATE_NOT_READY' ||
    heldExport.text.includes('Synthetic CI notice text')
  ) {
    fail('an unresolved ask must refuse the export and release nothing');
  }
  await passReview(replyCandidate, replyRun.dependencyDigest, 'G6', caseR.link, {
    supersedesAssessmentId: unresolved.id,
    askDispositions: [
      askOf('ANSWERED_SUPPORTED', {
        answerLocator: 'Synthetic CI second paragraph of the reply',
        sourceIds: [caseR.evidence],
      }),
    ],
  });
  const replyReady = await readiness(replyCandidate.id, 'case R: the ask answered');
  expectStatus(
    replyReady,
    'READY_FOR_SIGNER',
    [],
    'a sourced G6 successor recording the ask answered: READY_FOR_SIGNER',
  );
  const replyHandoff = (
    await call(
      'POST /candidates/{id}/unsigned-exports (case R READY)',
      'POST',
      exportRoute(replyCandidate.id),
      200,
      contracts.ExportUnsignedCandidateResponseSchema,
      { body: exportBody(replyReady) },
    )
  ).data as unknown as UnsignedExport;
  if (
    replyHandoff.envelope['parentBindingId'] !== nmi ||
    replyHandoff.sendPerformed !== false ||
    replyHandoff.signatureState !== 'HUMAN_PENDING'
  ) {
    fail('the reply is handed over unsigned and unsent, in the thread of its parent');
  }
  pass('the reply is exported unsigned and unsent once its ask is recorded resolved');

  // A revocation moves the digest: stale, and the first key refuses ----------------------------------
  await recordEvent(mandate1.mandateId, 'REVOCATION of mandate 1', { eventType: 'REVOCATION' });
  const revoked = await readiness(candidateA.id, 'after the revocation');
  if (
    revoked.status !== 'STALE_REVALIDATION_REQUIRED' ||
    revoked.dependencyDigest === ready.dependencyDigest ||
    revoked.reasonCodes[0] !== 'VALIDATION_STALE'
  ) {
    fail('a new authority event must move the digest and stale the run and the reviews');
  }
  pass('a REVOCATION event → STALE_REVALIDATION_REQUIRED with a new digest (VALIDATION_STALE)');
  const replayRevoked = await call(
    'POST /candidates/{id}/unsigned-exports (the first key after the revocation)',
    'POST',
    exportRoute(candidateA.id),
    412,
    null,
    { body: exportBody(ready), key: key1 },
  );
  if (replayRevoked.code !== 'CONTEXT_CHANGED') fail('the drifted replay must be 412');

  // A timestamp boundary passes: stale with the same digest ------------------------------------------
  const mandate2 = await authority('mandate 2');
  const caseT = await setUpCase('case T', `P4iT${tag.slice(0, 4)}_Zz`, mandate2.coverageId);
  // The event is recorded before the prompt (it is part of the context from the start); it takes
  // effect seconds later, after the reviews and the export.
  const effectiveAt = new Date(Date.now() + 20_000);
  await recordEvent(mandate2.mandateId, 'a boundary seconds ahead', {
    effectiveAt: effectiveAt.toISOString(),
  });
  const promptT = await generate(caseT, 'case T INITIAL + DRAFTING');
  const candidateT = await importDraft(caseT.id, promptT.id, 'case T clean', cleanBody('case T'));
  const runT = await validate(candidateT, caseT, 'case T clean');
  if (runT.result !== 'TECHNICAL_PASS') fail('case T’s clean candidate must be a TECHNICAL_PASS');
  for (const gate of GATES) await passReview(candidateT, runT.dependencyDigest, gate, caseT.link);
  const readyT = await readiness(candidateT.id, 'case T before the boundary');
  if (new Date(readyT.evaluatedAt) >= effectiveAt) {
    fail('case T was evaluated after its boundary: the setup took longer than 20 s');
  }
  expectStatus(readyT, 'READY_FOR_SIGNER', [], 'case T before its authority event takes effect');
  const keyT = `p4i-ci-${randomUUID()}`;
  await call(
    'POST /candidates/{id}/unsigned-exports (case T READY)',
    'POST',
    exportRoute(candidateT.id),
    200,
    contracts.ExportUnsignedCandidateResponseSchema,
    { body: exportBody(readyT), key: keyT },
  );
  await sleep(Math.max(0, effectiveAt.getTime() - Date.now()) + 1500);
  const staleT = await readiness(candidateT.id, 'case T after the boundary');
  if (staleT.dependencyDigest !== readyT.dependencyDigest)
    fail('time alone never moves the digest');
  expectStatus(
    staleT,
    'STALE_REVALIDATION_REQUIRED',
    ['G1_UNASSESSED', 'G1_TEMPORAL_REVIEW_STALE'],
    'the G1 review predates a boundary that has now passed (the same digest)',
  );
  const replayT = await call(
    'POST /candidates/{id}/unsigned-exports (case T key after the boundary)',
    'POST',
    exportRoute(candidateT.id),
    409,
    null,
    { body: exportBody(readyT), key: keyT },
  );
  if (replayT.code !== 'CANDIDATE_NOT_READY' || replayT.text.includes('Synthetic CI notice text')) {
    fail('an export replay after a temporal boundary must release nothing');
  }
  if (
    replayT.details['status'] !== 'STALE_REVALIDATION_REQUIRED' ||
    !(replayT.details['reasonCodes'] as string[]).includes('G1_TEMPORAL_REVIEW_STALE')
  ) {
    fail('the replay must be judged at its own instant (R14-AUD-020): G1 stale');
  }
  pass('case T’s export key no longer releases anything once the boundary passed (judged now)');

  // The audit history (R14-AUD-018) ----------------------------------------------------------------
  const anonymousAudit = await fetch(`${API}/audit-events`, {
    headers: { 'X-Requested-With': 'TB-APP' },
  });
  const anonymousBody = (await anonymousAudit.json()) as { error?: { code?: string } };
  if (anonymousAudit.status !== 401 || anonymousBody.error?.code !== 'SESSION_REQUIRED') {
    fail(`GET /audit-events without a session: expected 401, got ${anonymousAudit.status}`);
  }
  if (anonymousAudit.headers.get('cache-control') !== 'no-store')
    fail('audit 401: missing no-store');
  pass('GET /audit-events without a session → 401 SESSION_REQUIRED');
  const countsBeforeAudit = await rowCounts();
  interface AuditPage {
    readonly items: Array<{
      readonly action: string;
      readonly entityType: string;
      readonly entityId: string | null;
      readonly afterRedacted: Record<string, unknown> | null;
    }>;
    readonly nextCursor: string | null;
  }
  const auditRead = async (label: string, query: Record<string, string>) => {
    const result = await call(
      `GET /audit-events (${label})`,
      'GET',
      `/audit-events?${new URLSearchParams(query).toString()}`,
      200,
      contracts.ListAuditEventsResponseSchema,
    );
    if (result.etag !== null) fail(`${label}: an audit page has no ETag`);
    for (const privateText of [
      'Synthetic CI notice text',
      'Synthetic CI question 1',
      `rationale ${tag}`,
    ]) {
      if (result.text.includes(privateText)) {
        fail(`${label}: an audit page must never carry a draft, a question or a rationale`);
      }
    }
    return result.data as unknown as AuditPage;
  };
  const exportsOfA = await auditRead('the exports of case A', {
    entityId: candidateA.id,
    q: 'EXPORT_UNSIGNED',
  });
  if (
    exportsOfA.items.length !== 1 ||
    exportsOfA.items[0]?.entityType !== 'NoticeCandidate' ||
    canonical(exportsOfA.items[0]?.afterRedacted?.['bodyText']) !==
      canonical({ redacted: true, codePoints: [...bodyA].length })
  ) {
    fail('case A’s one EXPORT_UNSIGNED event must be recoverable, its body only as a length');
  }
  pass('case A’s EXPORT_UNSIGNED event is recoverable exactly, its body only as a length');
  const reviews = await auditRead('the captured reviews', {
    entityType: 'CandidateAssessment',
    q: 'CANDIDATE_ASSESSMENT_CAPTURED',
    limit: '100',
  });
  if (
    reviews.items.length < 7 ||
    reviews.items.some((item) => {
      const rationale = item.afterRedacted?.['rationale'] as Record<string, unknown> | undefined;
      return rationale?.['redacted'] !== true || typeof rationale['codePoints'] !== 'number';
    })
  ) {
    fail('the captured reviews must be recoverable, each rationale only as a length');
  }
  pass('the CANDIDATE_ASSESSMENT_CAPTURED events are recoverable, their texts only as lengths');
  const firstPage = await auditRead('one event', { limit: '1' });
  if (firstPage.items.length !== 1 || firstPage.nextCursor === null) {
    fail('a one-event page must carry a cursor');
  }
  const foreign = await call(
    'GET /audit-events (a cursor of another filter set)',
    'GET',
    `/audit-events?${new URLSearchParams({ cursor: firstPage.nextCursor, entityType: 'NoticeCandidate' }).toString()}`,
    400,
    null,
  );
  if (foreign.code !== 'INVALID_CURSOR')
    fail('a cursor is bound to its filters: 400 INVALID_CURSOR');
  expectWrites('the audit reads', countsBeforeAudit, await rowCounts());
  pass('the audit reads wrote nothing (no audit event about reading, no idempotency record)');

  // No G7: nothing signs, adopts or sends ---------------------------------------------------------
  const countsBeforeProbes = await rowCounts();
  for (const [label, method, suffix] of [
    ['POST /candidates/{id}/sign', 'POST', `/candidates/${candidateA.id}/sign`],
    ['POST /candidates/{id}/adopt', 'POST', `/candidates/${candidateA.id}/adopt`],
    ['POST /candidates/{id}/send', 'POST', `/candidates/${candidateA.id}/send`],
    ['POST /candidates/{id}/submit', 'POST', `/candidates/${candidateA.id}/submit`],
    ['POST /candidates/{id}/signature', 'POST', `/candidates/${candidateA.id}/signature`],
    ['POST /candidates/{id}/as-sent', 'POST', `/candidates/${candidateA.id}/as-sent`],
    ['POST /cases/{caseId}/send', 'POST', `/cases/${caseA.id}/send`],
    ['POST /audit-events', 'POST', '/audit-events'],
    ['DELETE /audit-events', 'DELETE', '/audit-events'],
    ['POST /candidates/{id}/readiness', 'POST', `/candidates/${candidateA.id}/readiness`],
    ['GET /candidates/{id}/unsigned-exports', 'GET', exportRoute(candidateA.id)],
    ['POST /cases/{caseId}/g7', 'POST', `/cases/${caseA.id}/g7`],
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
  expectWrites('the route probes', countsBeforeProbes, await rowCounts());
  if (
    (await rowCounts()).correspondence_bindings !==
    countsReady.correspondence_bindings + bindingsRecorded
  ) {
    fail('an export never records a transmission');
  }
  pass(
    'no signing, adoption, sending, submission, AS_SENT, export listing, audit write or G7 route exists; no export recorded a transmission',
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
  console.error(`[smoke:p4i] FAIL ${error instanceof Error ? error.message : String(error)}`);
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
    console.error('[smoke:p4i] FAIL port 3000 still in use');
    process.exitCode = 1;
  }
  console.log(`[smoke:p4i] ${process.exitCode ? 'FAIL' : 'PASS'} (${checks} checks)`);
}
