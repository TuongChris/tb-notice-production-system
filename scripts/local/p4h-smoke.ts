// yarn smoke:p4h --email <email> < password — P4H round trip against the COMPILED API, for CI only.
//
// It writes synthetic Directory, SourceReference, authority, case, intake, prompt, notice-candidate,
// validation-run and candidate-assessment records into the target database and leaves them there
// (authority records, prompt snapshots, candidates, validation runs and assessments are append-only
// history), so it refuses to run unless CI=true: CI's tb_notice_dev is disposable, the operator's is
// not. The account is the synthetic CI admin created by `yarn admin:create`; the password is read
// from standard input. Requires a prior `yarn build`. No external requests: an assessment records
// one attributable G1–G6 review of one exact candidate artifact at one evaluation epoch — never G7,
// a signature, notice adoption, readiness or permission to send; nothing is exported, signed or
// sent; port 3000 is released.
//
// Flow (every response is checked against the ACTIVE contract TB-SCHEMA-API-v1.5.0 and for
// Cache-Control: no-store):
//   the three assessment operations without a session (401) → login → Agency → Owner,
//   LegalSubject and their link → Route → Signer → Mandate → version → coverage → coverage signer →
//   freeze → case A and case B bound to the route, each with its own selection, reported item, work,
//   mapping and linked source → an INITIAL DRAFTING prompt and a candidate of each → the current
//   context of case A's prompt scope (its digest names TB-SCHEMA-API-v1.5.0) → a TECHNICAL_PASS run
//   of exactly that artifact and digest → capture a G1 PASS citing case A's link at that epoch (201:
//   the candidate, its stored artifact, the current digest and TB-TECHNICAL-RULESET-v4 recorded,
//   the texts exactly; the candidate and the run unchanged) → the same key again (the stored
//   assessment, nothing new) → the same key with another body (409) → a wrong artifact (412
//   ARTIFACT_CHANGED), another ruleset (422 RULESET_NOT_CURRENT), case B's link (422
//   CROSS_CASE_REFERENCE), an unknown link (422 REFERENCE_NOT_FOUND), an AI-assisted document review
//   (422 REVIEW_UNSUPPORTED) — nothing written → a second source linked to case A, then another
//   owner's coverage citing it (it no longer applies to case A) → the earlier digest (412
//   CONTEXT_CHANGED) → the current digest without a run of its epoch (422 VALIDATION_RUN_REQUIRED)
//   → a run of the new epoch (REVIEW_REQUIRED: a run need not pass) → a PASS citing the inapplicable
//   link (422 CROSS_OWNER_REFERENCE, nothing written) → a G2 HOLD citing it (201: a truthful
//   negative may cite it) → a G1 successor of the first PASS across epochs → a second successor of
//   it (409 ASSESSMENT_ALREADY_SUPERSEDED) and a successor of another gate (422
//   REVISION_SCOPE_CHANGE) → the list (newest first, exact q) → the support rows read back
//   (getCandidateAssessmentSources: exactly the stored rows, each assessment its own, no ETag) →
//   case A's first link paused: the rows read back unchanged, the present state a separate read →
//   case B's candidate superseded, then validated and assessed as the historical artifact it is →
//   another candidate's assessment, an unknown assessment and an unknown candidate are 404 → the
//   first run read back unchanged → every accepted capture wrote one assessment, its support rows,
//   one audit event and one idempotency record; refusals, replays and reads nothing (row counts read
//   through the runtime account) → no assessment read by id, update or deletion, signing or sending
//   route exists (404; readiness and the unsigned export are routed since P4I, smoke:p4i) → logout.
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { connect } from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createConnection } from 'mariadb';
import { argValue, repoRoot } from '../contracts/paths.ts';
import { assertLocalTarget } from '../db/allowlist.mjs';
import { loadRootEnv } from '../db/lib/targets.mjs';

const API = 'http://127.0.0.1:3000/api/v1';
const RULESET = 'TB-TECHNICAL-RULESET-v4';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let api: ChildProcess | undefined;
let exited = false;
let checks = 0;

/** Tables whose row counts the smoke follows: assessments, their neighbours and the runs. */
const COUNTED_TABLES = [
  'candidate_assessments',
  'assessment_sources',
  'audit_events',
  'idempotency_records',
  'validation_runs',
  'validation_issues',
  'notice_candidates',
  'prompt_snapshots',
] as const;
type Counts = Record<(typeof COUNTED_TABLES)[number], number>;

const SLOT = '[PENDING AUTHORIZED SIGNER — FULL LEGAL NAME REQUIRED]';

function pass(message: string): void {
  checks += 1;
  console.log(`[smoke:p4h] PASS ${message}`);
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

/** Row counts of the followed tables, read through the runtime account (SELECT only). */
async function rowCounts(): Promise<Counts> {
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

type Data = { readonly id: string } & Record<string, unknown>;

interface ContextView {
  readonly contextRevision: number;
  readonly dependencyDigest: string;
  readonly dependencies: unknown[];
  readonly context: Record<string, unknown>;
}

interface Run {
  readonly id: string;
  readonly candidateId: string;
  readonly artifactSha256: string;
  readonly dependencyDigest: string;
  readonly rulesetVersion: string;
  readonly result: string;
}

interface Assessment {
  readonly id: string;
  readonly candidateId: string;
  readonly caseId: string;
  readonly gate: string;
  readonly result: string;
  readonly artifactSha256: string;
  readonly dependencyDigest: string;
  readonly rulesetVersion: string;
  readonly scopeState: string;
  readonly performerKind: string;
  readonly performerLabel: string;
  readonly assessedAt: string | null;
  readonly provenance: string;
  readonly rationale: string;
  readonly scopeText: string;
  readonly limitations: string | null;
  readonly askDispositions: unknown[] | null;
  readonly supersedesAssessmentId: string | null;
  readonly createdAt: string;
  readonly createdById: string;
}

interface SupportRow {
  readonly id: string;
  readonly assessmentId: string;
  readonly caseSourceId: string;
  readonly supportedConclusion: string;
  readonly createdAt: string;
  readonly createdById: string;
}

async function main(): Promise<void> {
  if (process.env['CI'] !== 'true') {
    fail(
      'smoke:p4h writes directory, source, authority, case, intake, prompt, candidate, validation ' +
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
  // The frozen reference helper (read-only): the independent oracle of the digest definition.
  const frozen = (await import(
    pathToFileURL(
      path.join(
        repoRoot,
        'docs/reference/database-api-v1/TB_DATABASE_SCHEMA_API_CONTRACT_v1/contracts/consistency-reference.mjs',
      ),
    ).href
  )) as { canonicalSha256(value: unknown): string };

  api = spawn(process.execPath, [entry], { cwd: path.join(repoRoot, 'apps/api'), stdio: 'ignore' });
  api.on('exit', () => {
    exited = true;
  });
  for (let waited = 0; !(await listening(3000)); waited += 250) {
    if (exited || waited > 30_000) fail('compiled API did not start');
    await sleep(250);
  }

  // The three assessment operations are session-protected like every other business route.
  const someId = randomUUID();
  for (const [label, method, route] of [
    ['GET /candidates/{id}/assessments', 'GET', `/candidates/${someId}/assessments`],
    [
      'GET /candidates/{id}/assessments/{id}/sources',
      'GET',
      `/candidates/${someId}/assessments/${randomUUID()}/sources`,
    ],
    ['POST /candidates/{id}/assessments', 'POST', `/candidates/${someId}/assessments`],
  ] as const) {
    const response = await fetch(`${API}${route}`, {
      method,
      headers: {
        'X-Requested-With': 'TB-APP',
        ...(method === 'POST'
          ? {
              Origin: origin as string,
              'Content-Type': 'application/json',
              'Idempotency-Key': `p4h-ci-${randomUUID()}`,
            }
          : {}),
      },
      ...(method === 'POST' ? { body: '{}' } : {}),
    });
    const body = (await response.json()) as { error?: { code?: string } };
    if (response.status !== 401 || body.error?.code !== 'SESSION_REQUIRED') {
      fail(`${label} without a session: expected 401 SESSION_REQUIRED, got ${response.status}`);
    }
    if (response.headers.get('cache-control') !== 'no-store') fail(`${label}: missing no-store`);
    pass(`${label} without a session → 401 SESSION_REQUIRED`);
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

  // Verdict keys an assessment, a run or a read never carries (recorded context fields such as a
  // version's signedDatesRaw are data, not verdicts, and are not matched).
  const forbiddenKey =
    /"(g[1-7]\w*|ready\w*|eligib\w*|infring\w*|authori[sz]ed\w*|verified\w*|approved\w*|isCurrent\w*|valid|isValid\w*|signedAt|signedBy\w*|adoptedAt|adoptedBy\w*|sentAt|legallyValid\w*|legalApproval\w*|waive\w*|waiver\w*|override\w*|disposed\w*)"\s*:/i;

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
      const key = options.key === undefined ? `p4h-ci-${randomUUID()}` : options.key;
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
    if (checker && !checker.safeParse(body).success)
      fail(`${label}: response violates the contract`);
    if (expected < 400 && forbiddenKey.test(text)) {
      fail(`${label}: carries a readiness, approval, signature, waiver or verdict key`);
    }
    // A recorded review result ("PASS") is data of an assessment only; no readiness value anywhere.
    if (
      expected < 400 &&
      (/READY_FOR_SIGNER|G[1-7]_PASS/.test(text) ||
        (!route.includes('/assessments') && /"PASS"/.test(text)))
    ) {
      fail(`${label}: carries a readiness or gate value`);
    }
    pass(`${label} → ${expected}`);
    const envelope = body as
      { data?: Data; error?: { code: string; details?: Record<string, unknown> } } | undefined;
    return {
      data: (envelope?.data ?? { id: '' }) as Data,
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

  const tag = randomUUID().slice(0, 8);
  const mailbox = `p4h-ci-${tag}@example.invalid`;
  const platform = `p4h-ci-platform-${tag}@example.invalid`;

  // Directory, route and authority ---------------------------------------------------------------
  const agency = await create('POST /agencies', '/agencies', contracts.CreateAgencyResponseSchema, {
    displayName: `P4H CI synthetic agency ${tag}`,
    legalName: `P4H CI Synthetic Agency ${tag} Ltd`,
  });
  const agencyId = agency.data.id;
  const source = (title: string, extra: Record<string, unknown> = {}) =>
    create('POST /sources', '/sources', contracts.CreateSourceResponseSchema, {
      agencyId,
      title: `P4H CI synthetic ${title} ${tag} (not evidence)`,
      sourceRole: 'OPERATOR_INPUT',
      scopeText: `Synthetic CI ${title}`,
      ...extra,
    });
  const record = await source('agency record', { sourceRole: 'CANONICAL_RECORD' });
  const owner = await create('POST /owners', '/owners', contracts.CreateOwnerResponseSchema, {
    displayName: `P4H CI synthetic brand ${tag}`,
  });
  const subject = await create(
    'POST /legal-subjects',
    '/legal-subjects',
    contracts.CreateLegalSubjectResponseSchema,
    { subjectType: 'LEGAL_ENTITY', legalName: `P4H CI Synthetic Subject ${tag} LLC` },
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
    fullLegalName: `P4H CI Synthetic Signer ${tag}`,
  });
  const mandate = await create(
    'POST /mandates',
    '/mandates',
    contracts.CreateMandateResponseSchema,
    { agencyId, label: `P4H CI synthetic mandate ${tag}` },
  );
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
    await etagOf(`/mandates/${mandate.data.id}`, contracts.GetMandateResponseSchema),
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
      coverageLabel: `P4H CI synthetic coverage ${tag}`,
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

  // Two cases, each with its own selection, intake and linked source ----------------------------
  const caseEtag = (id: string) => etagOf(`/cases/${id}`, contracts.GetCaseResponseSchema);
  const mappingBasis = await source('mapping basis');
  const link = async (caseId: string, sourceId: string, label: string) =>
    (
      await create(
        `POST /cases/{caseId}/sources (${label})`,
        `/cases/${caseId}/sources`,
        contracts.LinkCaseSourceResponseSchema,
        { sourceId, useRole: 'SYNTHETIC_SUPPORT', scopeNote: `Synthetic CI note ${tag}` },
        await caseEtag(caseId),
      )
    ).data;
  const setUpCase = async (label: string, video: string) => {
    const created = await create('POST /cases', '/cases', contracts.CreateCaseResponseSchema, {
      agencyId,
      routeId: route.data.id,
      intakeLabel: `P4H CI synthetic ${label} ${tag}`,
    });
    const id = created.data.id;
    const selection = await create(
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
      { title: `P4H CI synthetic work ${label} ${tag}` },
      await caseEtag(id),
    );
    await create(
      'POST /cases/{caseId}/mappings',
      `/cases/${id}/mappings`,
      contracts.CreateUseMappingResponseSchema,
      {
        caseWorkId: work.data.id,
        reportedItemId: item.data.id,
        occurrence: 1,
        basisSourceId: mappingBasis.data.id,
        provenance: 'OPERATOR_REPORTED',
      },
      await caseEtag(id),
    );
    const evidence = await source(`${label} licence record`);
    const linked = await link(id, evidence.data.id, label);
    return { id, selection: selection.data.id, link: linked.id, sourceId: evidence.data.id };
  };
  const caseA = await setUpCase('case A', `P4hA${tag.slice(0, 4)}_Zz`);
  const caseB = await setUpCase('case B', `P4hB${tag.slice(0, 4)}_Zz`);

  // Prompts, candidates and the epoch's run -------------------------------------------------------
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
  const promptA = await generate(caseA, 'case A INITIAL + DRAFTING');
  const promptB = await generate(caseB, 'case B INITIAL + DRAFTING');
  const importDraft = async (target: { id: string }, promptId: string, label: string) =>
    (
      await create(
        `POST /cases/{caseId}/candidates (${label})`,
        `/cases/${target.id}/candidates`,
        contracts.ImportCandidateResponseSchema,
        {
          promptSnapshotId: promptId,
          subject: `P4H CI synthetic notice ${tag}`,
          envelope: { from: mailbox, to: platform },
          // The label makes each case's draft its own artifact (another content, another SHA-256).
          bodyText: `Synthetic CI notice text for human review (${label}).\nThe recorded work appears in the reported video.\n\nSincerely,\n${SLOT}\n`,
          preparedDocuments: [],
        },
      )
    ).data as unknown as { id: string; caseId: string; artifactSha256: string };
  const candidateA = await importDraft(caseA, promptA.id, 'case A');
  const candidateB = await importDraft(caseB, promptB.id, 'case B');
  if (candidateB.artifactSha256 === candidateA.artifactSha256) {
    fail('the two cases’ drafts must be different artifacts');
  }
  const validate = async (
    candidate: { id: string; artifactSha256: string },
    digest: string,
    label: string,
  ) =>
    (
      await call(
        `POST /candidates/{id}/validation-runs (${label})`,
        'POST',
        `/candidates/${candidate.id}/validation-runs`,
        201,
        contracts.ValidateCandidateResponseSchema,
        {
          body: {
            expectedArtifactSha256: candidate.artifactSha256,
            expectedDependencyDigest: digest,
          },
        },
      )
    ).data as unknown as Run;
  const readRun = async (runId: string, label: string) =>
    (
      await call(
        `GET /validation-runs/{id} (${label})`,
        'GET',
        `/validation-runs/${runId}`,
        200,
        contracts.GetValidationRunResponseSchema,
      )
    ).data;
  const readCandidate = async (candidateId: string, label: string) =>
    (
      await call(
        `GET /candidates/{id} (${label})`,
        'GET',
        `/candidates/${candidateId}`,
        200,
        contracts.GetCandidateResponseSchema,
      )
    ).data;

  const readA1 = await readContext(caseA, 'the candidate’s prompt scope');
  if (readA1.dependencyDigest !== promptA.dependencyDigest) {
    fail('the current digest must be the prompt’s when nothing changed since it was generated');
  }
  const digestV2 = frozen.canonicalSha256({
    algorithm: 'TB-PRODUCTION-CONTEXT-DIGEST-v2',
    contract: 'TB-SCHEMA-API-v1.5.0',
    schemaVersion: 'PFC-YT-EMAIL-v1.1',
    scope: {
      caseId: caseA.id,
      taskType: 'INITIAL',
      generationMode: 'DRAFTING',
      authoritySelectionId: caseA.selection,
      parentBindingId: null,
      priorBindingIds: [],
    },
    dependencies: (
      readA1.dependencies as ReadonlyArray<{
        entityType: string;
        entityId: string;
        fingerprint: string;
      }>
    ).map(({ entityType, entityId, fingerprint }) => ({ entityType, entityId, fingerprint })),
  });
  if (digestV2 !== readA1.dependencyDigest) {
    fail('the current digest must be TB-PRODUCTION-CONTEXT-DIGEST-v2 naming TB-SCHEMA-API-v1.5.0');
  }
  pass(
    'the current digest is TB-PRODUCTION-CONTEXT-DIGEST-v2 of the closure and scope under the active contract TB-SCHEMA-API-v1.5.0 (rebuilt with the frozen helper)',
  );
  const run1 = await validate(candidateA, readA1.dependencyDigest, 'case A, epoch 1');
  if (run1.result !== 'TECHNICAL_PASS' || run1.rulesetVersion !== RULESET) {
    fail('case A’s clean candidate must be a TECHNICAL_PASS under TB-TECHNICAL-RULESET-v4');
  }
  pass(
    'a TECHNICAL_PASS run of exactly the candidate artifact and the current digest (ruleset v4)',
  );
  const run1Stored = await readRun(run1.id, 'epoch 1 run before any assessment');
  const candidateAStored = await readCandidate(candidateA.id, 'case A before any assessment');

  // Capture ---------------------------------------------------------------------------------------
  const assessmentsPath = (candidateId: string) => `/candidates/${candidateId}/assessments`;
  const reviewBody = (
    candidate: { artifactSha256: string },
    digest: string,
    overrides: Record<string, unknown> = {},
  ) => ({
    gate: 'G1',
    result: 'PASS',
    expectedArtifactSha256: candidate.artifactSha256,
    expectedDependencyDigest: digest,
    rulesetVersion: RULESET,
    scopeState: 'RECORDED_NOT_ADOPTED',
    performerKind: 'HUMAN',
    performerLabel: `P4H CI synthetic reviewer ${tag}`,
    provenance: 'OPERATOR_REPORTED',
    rationale: `Synthetic CI rationale ${tag}\r\n  kept exactly as sent  `,
    scopeText: `Synthetic CI scope of the review ${tag}`,
    sources: [{ caseSourceId: caseA.link, supportedConclusion: `Synthetic CI conclusion ${tag}` }],
    ...overrides,
  });
  const capture = async (
    candidateId: string,
    body: Record<string, unknown>,
    label: string,
    key?: string,
  ) => {
    const response = await call(
      `POST /candidates/{id}/assessments (${label})`,
      'POST',
      assessmentsPath(candidateId),
      201,
      contracts.CaptureCandidateAssessmentResponseSchema,
      { body, ...(key === undefined ? {} : { key }) },
    );
    if (response.etag !== null) fail(`${label}: an assessment carries no ETag`);
    return response.data as unknown as Assessment;
  };
  const refuse = async (
    label: string,
    candidateId: string,
    body: Record<string, unknown>,
    status: number,
    code: string,
    details: Record<string, unknown>,
  ) => {
    const before = await rowCounts();
    const refused = await call(
      `POST /candidates/{id}/assessments (${label})`,
      'POST',
      assessmentsPath(candidateId),
      status,
      null,
      { body },
    );
    if (refused.code !== code) fail(`${label}: expected ${code}, got ${refused.code}`);
    for (const [field, value] of Object.entries(details)) {
      if (canonical(refused.details[field]) !== canonical(value)) {
        fail(`${label}: details.${field} is ${canonical(refused.details[field])}`);
      }
    }
    expectWrites(label, before, await rowCounts());
    pass(`${label}: ${status} ${code}, nothing written`);
    return refused;
  };

  const beforeFirst = await rowCounts();
  const key = `p4h-ci-${randomUUID()}`;
  const firstBody = reviewBody(candidateA, readA1.dependencyDigest);
  const first = await capture(candidateA.id, firstBody, 'case A, G1 PASS at epoch 1', key);
  if (
    first.candidateId !== candidateA.id ||
    first.caseId !== caseA.id ||
    first.artifactSha256 !== candidateA.artifactSha256 ||
    first.dependencyDigest !== readA1.dependencyDigest ||
    first.rulesetVersion !== RULESET ||
    first.gate !== 'G1' ||
    first.result !== 'PASS' ||
    first.scopeState !== 'RECORDED_NOT_ADOPTED' ||
    first.performerKind !== 'HUMAN' ||
    first.performerLabel !== firstBody.performerLabel ||
    first.provenance !== 'OPERATOR_REPORTED' ||
    first.rationale !== firstBody.rationale ||
    first.scopeText !== firstBody.scopeText ||
    first.limitations !== null ||
    first.assessedAt !== null ||
    first.askDispositions !== null ||
    first.supersedesAssessmentId !== null ||
    first.createdById !== userId
  ) {
    fail('the capture must record exactly the review at the epoch the server derived');
  }
  pass(
    'capture: the G1 PASS is recorded exactly (texts byte-identical, no default filled in) at the epoch (candidate, stored artifact, current digest, TB-TECHNICAL-RULESET-v4)',
  );
  expectWrites('the first capture', beforeFirst, await rowCounts(), {
    candidate_assessments: 1,
    assessment_sources: 1,
    audit_events: 1,
    idempotency_records: 1,
  });
  pass(
    'the capture wrote one assessment, one support row, one audit event and one idempotency record',
  );
  if (
    canonical(await readCandidate(candidateA.id, 'case A after the capture')) !==
      canonical(candidateAStored) ||
    canonical(await readRun(run1.id, 'epoch 1 run after the capture')) !== canonical(run1Stored)
  ) {
    fail('a capture must change neither the candidate nor the validation run');
  }
  pass('the candidate and the TECHNICAL_PASS run read back unchanged after the capture');

  const beforeReplay = await rowCounts();
  const replay = await capture(candidateA.id, firstBody, 'the same key again', key);
  if (canonical(replay) !== canonical(first)) fail('a replay must return the stored assessment');
  expectWrites('the replay', beforeReplay, await rowCounts());
  pass('the same Idempotency-Key replays the stored assessment; nothing new is written');
  const conflict = await call(
    'POST /candidates/{id}/assessments (the same key, another body)',
    'POST',
    assessmentsPath(candidateA.id),
    409,
    null,
    { body: { ...firstBody, gate: 'G2' }, key },
  );
  if (conflict.code !== 'IDEMPOTENCY_CONFLICT') fail('the same key with another body must be 409');

  await refuse(
    'another candidate’s artifact',
    candidateA.id,
    reviewBody(candidateA, readA1.dependencyDigest, {
      expectedArtifactSha256: candidateB.artifactSha256,
    }),
    412,
    'ARTIFACT_CHANGED',
    { field: 'expectedArtifactSha256' },
  );
  await refuse(
    'a ruleset that is not the current one',
    candidateA.id,
    reviewBody(candidateA, readA1.dependencyDigest, { rulesetVersion: 'TB-TECHNICAL-RULESET-v2' }),
    422,
    'RULESET_NOT_CURRENT',
    { field: 'rulesetVersion', currentRulesetVersion: RULESET },
  );
  await refuse(
    'case B’s linked source',
    candidateA.id,
    reviewBody(candidateA, readA1.dependencyDigest, {
      sources: [{ caseSourceId: caseB.link, supportedConclusion: 'Synthetic CI foreign support' }],
    }),
    422,
    'CROSS_CASE_REFERENCE',
    { field: 'sources.0.caseSourceId' },
  );
  await refuse(
    'an unknown linked source',
    candidateA.id,
    reviewBody(candidateA, readA1.dependencyDigest, {
      sources: [{ caseSourceId: randomUUID(), supportedConclusion: 'Synthetic CI support' }],
    }),
    422,
    'REFERENCE_NOT_FOUND',
    { field: 'sources.0.caseSourceId' },
  );
  await refuse(
    'an AI-assisted performer recording DOCUMENT_REVIEWED',
    candidateA.id,
    reviewBody(candidateA, readA1.dependencyDigest, {
      performerKind: 'AI_ASSISTED',
      provenance: 'DOCUMENT_REVIEWED',
    }),
    422,
    'REVIEW_UNSUPPORTED',
    { field: 'provenance', reason: 'AI_ASSISTED_PERFORMER' },
  );

  // A new epoch: a second linked source, then another owner's later use of it -------------------
  type Conflict = { code: string; message: string; fieldPath?: string | null };
  const restricted = await source('case A second linked source');
  const restrictedLink = await link(caseA.id, restricted.data.id, 'case A, a second source');
  const ownerB = await create(
    'POST /owners (owner B)',
    '/owners',
    contracts.CreateOwnerResponseSchema,
    { displayName: `P4H CI synthetic brand B ${tag}` },
  );
  const subjectB = await create(
    'POST /legal-subjects (owner B)',
    '/legal-subjects',
    contracts.CreateLegalSubjectResponseSchema,
    { subjectType: 'LEGAL_ENTITY', legalName: `P4H CI Synthetic Subject B ${tag} LLC` },
  );
  const associationB = await create(
    'POST /owners/{id}/subjects (owner B)',
    `/owners/${ownerB.data.id}/subjects`,
    contracts.LinkOwnerSubjectResponseSchema,
    { legalSubjectId: subjectB.data.id },
    await etagOf(`/owners/${ownerB.data.id}`, contracts.GetOwnerResponseSchema),
  );
  const routeB = await create(
    'POST /routes (owner B)',
    '/routes',
    contracts.CreateRouteResponseSchema,
    { agencyId, ownerSubjectId: associationB.data.id },
  );
  const mandateB = await create(
    'POST /mandates (owner B)',
    '/mandates',
    contracts.CreateMandateResponseSchema,
    { agencyId, label: `P4H CI synthetic mandate B ${tag}` },
  );
  const versionB = await create(
    'POST /mandates/{id}/versions (owner B, draft)',
    `/mandates/${mandateB.data.id}/versions`,
    contracts.CreateMandateVersionResponseSchema,
    {
      changeKind: 'NEW_AUTHORIZATION',
      changeReason: 'Synthetic CI capture',
      primarySourceId: record.data.id,
      documentState: 'SIGNED_APPEARING',
    },
    await etagOf(`/mandates/${mandateB.data.id}`, contracts.GetMandateResponseSchema),
  );
  await create(
    'POST /mandate-versions/{id}/coverages (owner B cites case A’s second source)',
    `/mandate-versions/${versionB.data.id}/coverages`,
    contracts.CreateCoverageResponseSchema,
    {
      routeId: routeB.data.id,
      coverageLabel: `P4H CI synthetic coverage B ${tag}`,
      basisSourceId: restricted.data.id,
      actionScope: ['PREPARE_NOTICE'],
    },
    await etagOf(
      `/mandate-versions/${versionB.data.id}`,
      contracts.GetMandateVersionResponseSchema,
    ),
  );
  const readA2 = await readContext(caseA, 'case A after owner B’s use of its second source');
  const notApplicable = (readA2.context['conflicts'] as Conflict[]).filter(
    (entry) => entry.code === 'SOURCE_NOT_APPLICABLE' && entry.message.includes(restricted.data.id),
  );
  if (readA2.dependencyDigest === readA1.dependencyDigest || notApplicable.length !== 1) {
    fail('the second source must no longer apply to case A (a new digest and the conflict)');
  }
  pass(
    'a new epoch: case A’s context lists its second source as SOURCE_NOT_APPLICABLE under a new digest',
  );
  await refuse(
    'the earlier digest',
    candidateA.id,
    reviewBody(candidateA, readA1.dependencyDigest),
    412,
    'CONTEXT_CHANGED',
    { field: 'expectedDependencyDigest' },
  );
  await refuse(
    'the current digest without a run of its epoch',
    candidateA.id,
    reviewBody(candidateA, readA2.dependencyDigest),
    422,
    'VALIDATION_RUN_REQUIRED',
    {
      epoch: {
        artifactSha256: candidateA.artifactSha256,
        dependencyDigest: readA2.dependencyDigest,
        rulesetVersion: RULESET,
      },
    },
  );
  const run2 = await validate(candidateA, readA2.dependencyDigest, 'case A, epoch 2');
  if (run2.result !== 'REVIEW_REQUIRED' || run2.dependencyDigest !== readA2.dependencyDigest) {
    fail('the run of the new epoch must record REVIEW_REQUIRED (its conflict and drift)');
  }
  pass('a run of the new epoch records REVIEW_REQUIRED (it need not pass for an assessment)');
  await refuse(
    'a PASS citing the source that no longer applies',
    candidateA.id,
    reviewBody(candidateA, readA2.dependencyDigest, {
      sources: [
        { caseSourceId: caseA.link, supportedConclusion: 'Synthetic CI support' },
        { caseSourceId: restrictedLink.id, supportedConclusion: 'Synthetic CI other support' },
      ],
    }),
    422,
    'CROSS_OWNER_REFERENCE',
    { field: 'sources.1.caseSourceId' },
  );
  const beforeHold = await rowCounts();
  const hold = await capture(
    candidateA.id,
    reviewBody(candidateA, readA2.dependencyDigest, {
      gate: 'G2',
      result: 'HOLD',
      provenance: 'CONFLICT',
      sources: [
        {
          caseSourceId: restrictedLink.id,
          supportedConclusion: `Synthetic CI: recorded as another owner’s material ${tag}`,
        },
      ],
    }),
    'case A, G2 HOLD citing the source that no longer applies',
  );
  if (hold.result !== 'HOLD' || hold.dependencyDigest !== readA2.dependencyDigest) {
    fail('a truthful HOLD must be recorded at the new epoch');
  }
  expectWrites('the HOLD', beforeHold, await rowCounts(), {
    candidate_assessments: 1,
    assessment_sources: 1,
    audit_events: 1,
    idempotency_records: 1,
  });
  pass('D-3: a HOLD may cite a linked source that no longer applies; it is recorded with it');
  const successor = await capture(
    candidateA.id,
    reviewBody(candidateA, readA2.dependencyDigest, { supersedesAssessmentId: first.id }),
    'case A, a G1 successor of the first PASS at the new epoch',
  );
  if (successor.supersedesAssessmentId !== first.id || successor.gate !== 'G1') {
    fail('the successor must name the head of the G1 chain across epochs');
  }
  pass('D-2: a successor names the head of the same candidate and gate across epochs');
  const fork = await refuse(
    'a second successor of the same assessment',
    candidateA.id,
    reviewBody(candidateA, readA2.dependencyDigest, { supersedesAssessmentId: first.id }),
    409,
    'ASSESSMENT_ALREADY_SUPERSEDED',
    { successorId: successor.id },
  );
  if (fork.details['successorId'] !== successor.id) fail('the fork must name the successor');
  await refuse(
    'a successor of another gate',
    candidateA.id,
    reviewBody(candidateA, readA2.dependencyDigest, {
      gate: 'G2',
      result: 'HOLD',
      supersedesAssessmentId: successor.id,
    }),
    422,
    'REVISION_SCOPE_CHANGE',
    { fields: ['gate'] },
  );

  // The list and the support read-back -----------------------------------------------------------
  const listed = async (candidateId: string, q: string | null, label: string) =>
    (
      (
        await call(
          `GET /candidates/{id}/assessments (${label})`,
          'GET',
          `${assessmentsPath(candidateId)}?limit=100${q === null ? '' : `&q=${encodeURIComponent(q)}`}`,
          200,
          contracts.ListCandidateAssessmentsResponseSchema,
        )
      ).data as unknown as { items: Assessment[] }
    ).items;
  const beforeReads = await rowCounts();
  const all = await listed(candidateA.id, null, 'case A');
  if (
    canonical(all.map((entry) => entry.id)) !== canonical([successor.id, hold.id, first.id]) ||
    canonical(all[2]) !== canonical(first)
  ) {
    fail('the list must show this candidate’s assessments newest first, exactly as stored');
  }
  pass('the list shows the three assessments newest first; the first reads back exactly');
  for (const [q, expected] of [
    ['G2', [hold.id]],
    ['PASS', [successor.id, first.id]],
    [first.id, [first.id]],
    [readA2.dependencyDigest, [successor.id, hold.id]],
    ['G', []],
  ] as const) {
    const found = await listed(candidateA.id, q, `q=${q.slice(0, 12)}`);
    if (canonical(found.map((entry) => entry.id)) !== canonical(expected)) {
      fail(`q=${q} must match exactly`);
    }
  }
  pass('q matches exactly an id, a gate, a result or a digest — never a prefix');
  const supports = async (candidateId: string, assessmentId: string, label: string) => {
    const response = await call(
      `GET /candidates/{id}/assessments/{id}/sources (${label})`,
      'GET',
      `${assessmentsPath(candidateId)}/${assessmentId}/sources`,
      200,
      contracts.GetCandidateAssessmentSourcesResponseSchema,
    );
    if (response.etag !== null) fail(`${label}: a support read carries no ETag`);
    return response.data as unknown as { assessmentId: string; sources: SupportRow[] };
  };
  const firstRows = await supports(candidateA.id, first.id, 'the first PASS');
  const holdRows = await supports(candidateA.id, hold.id, 'the HOLD');
  const successorRows = await supports(candidateA.id, successor.id, 'the successor');
  const only = (view: { assessmentId: string; sources: SupportRow[] }, id: string) =>
    view.assessmentId === id && view.sources.every((row) => row.assessmentId === id);
  if (
    !only(firstRows, first.id) ||
    firstRows.sources.length !== 1 ||
    firstRows.sources[0]?.caseSourceId !== caseA.link ||
    firstRows.sources[0]?.supportedConclusion !== `Synthetic CI conclusion ${tag}` ||
    firstRows.sources[0]?.createdById !== userId ||
    !only(holdRows, hold.id) ||
    holdRows.sources.length !== 1 ||
    holdRows.sources[0]?.caseSourceId !== restrictedLink.id ||
    !only(successorRows, successor.id) ||
    successorRows.sources.length !== 1 ||
    successorRows.sources[0]?.id === firstRows.sources[0]?.id
  ) {
    fail('each assessment must read back exactly its own stored support rows');
  }
  pass(
    'the support rows read back exactly as stored, each assessment its own (the successor inherits none), the same-case links named',
  );
  expectWrites('the lists and reads', beforeReads, await rowCounts());
  pass('the lists and support reads wrote nothing');

  // A later link state never alters the stored rows ------------------------------------------------
  const linkRoute = `/case-sources/${caseA.link}`;
  await call(
    'POST /case-sources/{id}/link-state (pause case A’s first link)',
    'POST',
    `${linkRoute}/link-state`,
    200,
    contracts.SetCaseSourceLinkStateResponseSchema,
    {
      body: { state: 'PAUSED', reason: 'Synthetic CI pause after the review' },
      ifMatch: await etagOf(linkRoute, contracts.GetCaseSourceResponseSchema),
    },
  );
  const afterPause = await supports(candidateA.id, first.id, 'the first PASS after the pause');
  const present = (
    await call(
      'GET /case-sources/{id} (present state)',
      'GET',
      linkRoute,
      200,
      contracts.GetCaseSourceResponseSchema,
    )
  ).data;
  if (canonical(afterPause) !== canonical(firstRows) || present['linkState'] !== 'PAUSED') {
    fail('a later link state must not alter the stored support rows');
  }
  pass(
    'the link paused later: the stored support rows read back unchanged; the present state (PAUSED) is a separate read',
  );

  // D-1: a superseded candidate is assessed as the historical artifact it is ---------------------
  await call(
    'POST /candidates/{id}/supersede (case B)',
    'POST',
    `/candidates/${candidateB.id}/supersede`,
    200,
    contracts.SupersedeCandidateResponseSchema,
    { body: { reason: 'Synthetic CI: a later draft artifact is the active one' } },
  );
  const readB = await readContext(caseB, 'case B');
  await validate(candidateB, readB.dependencyDigest, 'case B, superseded candidate');
  const candidateBStored = await readCandidate(candidateB.id, 'case B before its assessment');
  const reviewB = await capture(
    candidateB.id,
    reviewBody(candidateB, readB.dependencyDigest, {
      gate: 'G3',
      result: 'MISSING',
      provenance: 'MISSING',
      sources: [
        { caseSourceId: caseB.link, supportedConclusion: 'Synthetic CI: checked, missing' },
      ],
    }),
    'case B, a historical G3 MISSING of the superseded candidate',
  );
  if (
    reviewB.candidateId !== candidateB.id ||
    canonical(await readCandidate(candidateB.id, 'case B after its assessment')) !==
      canonical(candidateBStored)
  ) {
    fail('a superseded candidate is assessed as it is, and stays unchanged');
  }
  pass('D-1: a superseded candidate’s review is recorded as history; the candidate is unchanged');

  // Isolation and the hard stops --------------------------------------------------------------------
  for (const [label, route] of [
    [
      'another candidate’s assessment through case A’s candidate',
      `${assessmentsPath(candidateA.id)}/${reviewB.id}/sources`,
    ],
    [
      'case A’s assessment through case B’s candidate',
      `${assessmentsPath(candidateB.id)}/${first.id}/sources`,
    ],
    ['an unknown assessment', `${assessmentsPath(candidateA.id)}/${randomUUID()}/sources`],
    ['an unknown candidate', assessmentsPath(randomUUID())],
  ] as const) {
    const missing = await call(`GET ${label}`, 'GET', route, 404, null);
    if (missing.code !== 'NOT_FOUND') fail(`${label} must be 404`);
  }
  if ((await listed(candidateA.id, reviewB.id, 'case B’s id in case A’s list')).length !== 0) {
    fail('case A’s list must never show case B’s assessment');
  }
  pass('another candidate’s assessments are 404 like unknown ones and never listed');
  if (canonical(await readRun(run1.id, 'epoch 1 run at the end')) !== canonical(run1Stored)) {
    fail('assessments must never change a recorded run');
  }
  pass('the TECHNICAL_PASS run reads back unchanged after every assessment');

  const firstRoute = `${assessmentsPath(candidateA.id)}/${first.id}`;
  for (const [label, method, suffix] of [
    ['GET /candidates/{id}/assessments/{id}', 'GET', firstRoute],
    ['PATCH /candidates/{id}/assessments/{id}', 'PATCH', firstRoute],
    ['DELETE /candidates/{id}/assessments/{id}', 'DELETE', firstRoute],
    ['POST /candidates/{id}/assessments/{id}/sources', 'POST', `${firstRoute}/sources`],
    // Readiness and the unsigned export are routed since P4I (smoke:p4i).
    ['POST /candidates/{id}/sign', 'POST', `/candidates/${candidateA.id}/sign`],
    ['POST /candidates/{id}/send', 'POST', `/candidates/${candidateA.id}/send`],
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
  console.error(`[smoke:p4h] FAIL ${error instanceof Error ? error.message : String(error)}`);
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
    console.error('[smoke:p4h] FAIL port 3000 still in use');
    process.exitCode = 1;
  }
  console.log(`[smoke:p4h] ${process.exitCode ? 'FAIL' : 'PASS'} (${checks} checks)`);
}
