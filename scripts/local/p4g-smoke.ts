// yarn smoke:p4g --email <email> < password — P4G round trip against the COMPILED API, for CI only.
//
// It writes synthetic Directory, SourceReference, authority, case, intake, prompt, notice-candidate
// and validation-run records into the target database and leaves them there (authority records,
// prompt snapshots, candidates and validation runs are append-only history), so it refuses to run
// unless CI=true: CI's tb_notice_dev is disposable, the operator's is not. The account is the
// synthetic CI admin created by `yarn admin:create`; the password is read from standard input.
// Requires a prior `yarn build`. No external requests: a validation run is the technical ruleset's
// result for one exact stored artifact — nothing is reviewed substantively, assessed, approved,
// signed, exported or sent; port 3000 is released.
//
// Flow (every response is checked against the ACTIVE contract and for Cache-Control: no-store):
//   login → Agency → Owner, LegalSubject and their link → Route → Signer → Mandate → version →
//   coverage → coverage signer → freeze → case A and case B bound to the route, each with its own
//   selection, reported item, work and mapping → an INITIAL DRAFTING prompt of each → a clean
//   candidate of case A (one pending slot) → the current context of its prompt's scope (its digest
//   is the prompt's) → validate against exactly that artifact and digest (201 TECHNICAL_PASS: the
//   ruleset TB-TECHNICAL-RULESET-v3, every one of the 29 rules executed, none not executed,
//   semanticReviewRequired true, the evaluated context equal to the read, no issue; the candidate
//   and the case unchanged) → the same key again (the stored run, nothing new) → the same key with
//   another body (409) → the run read back by its id (getValidationRun, TB-SCHEMA-API-v1.3.0:
//   exactly the stored run — artifact, digest, ruleset, result, coverage manifest, dependency
//   manifest and evaluated context; no ETag) → list the runs (summaries; exact q) and the issues
//   (none) → a candidate with two pending slots (BLOCKED: a DETERMINISTIC BLOCKER of
//   SIGNATURE.PENDING_SLOT_ONCE; read back with its counts and issues) → a candidate saying a
//   document is attached with none planned (REVIEW_REQUIRED: a HEURISTIC REVIEW_REQUIRED of
//   WORDING.ATTACHMENT_CLAIM, never a blocker) → another artifact SHA-256 (412 ARTIFACT_CHANGED) →
//   an authority event recorded on the pinned mandate → the earlier digest (412 CONTEXT_CHANGED,
//   nothing recorded) → a new read and run (the drift since the prompt is review required) → the
//   earlier run read back again: still exactly as recorded, its own digest, not the new context's
//   → case B's candidate validated against case B's context and read back; neither list shows the
//   other case's runs → an unknown run id (404) → each accepted run wrote one run, its issues and
//   one audit event; refusals, replays and reads nothing; no candidate, assessment or later-phase
//   record was written (row counts read through the runtime account) → current source
//   applicability (R14-AUD-009, R14-AUD-010): a mandate version whose annex is restricted to
//   another legal subject (an agency-level citation, valid when recorded), selected for case C →
//   case C's context lists the annex with SOURCE_NOT_APPLICABLE and nothing else → a source linked
//   to case A, applicable → another owner's DRAFT coverage citing it (a valid write touching
//   nothing of case A) → case A's context: the same revision, a new digest, SOURCE_NOT_APPLICABLE
//   (CROSS_OWNER_REFERENCE), no other owner named → a prompt and a validation against the earlier
//   digest (412 CONTEXT_CHANGED, nothing written) → case A's recorded runs read back unchanged →
//   the digest definition (R14-AUD-013): every digest checked is TB-PRODUCTION-CONTEXT-DIGEST-v2 of
//   its closure and scope, rebuilt with the frozen helper (the drift above within that one
//   definition); the current revision with the v1 digest of the unchanged closure — a preview of
//   the earlier definition — is 412 for a prompt and a validation, the case unchanged; case C: its
//   v1 digest is 412, its current v2 digest generates a PREPARATION prompt freezing the annex
//   conflict, read back exactly → no
//   run update or deletion by id, signing or sending route exists (404; assessments are routed
//   since P4H and readiness and the unsigned export since P4I, with their own smokes) → logout.
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
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let api: ChildProcess | undefined;
let exited = false;
let checks = 0;

/** Tables whose row counts the smoke follows: runs, their neighbours and later phases. */
const COUNTED_TABLES = [
  'validation_runs',
  'validation_issues',
  'audit_events',
  'idempotency_records',
  'notice_candidates',
  'prompt_snapshots',
  'candidate_assessments',
  'assessment_sources',
] as const;
type Counts = Record<(typeof COUNTED_TABLES)[number], number>;

/** The 29 rules of TB-TECHNICAL-RULESET-v3 (v1's and v2's inventory), in run and report order. */
const RULES = [
  'ARTIFACT.TEXT_EXACT',
  'ARTIFACT.SHAPE',
  'ARTIFACT.BODY_SHA256',
  'ARTIFACT.ARTIFACT_SHA256',
  'ARTIFACT.SIGNATURE_STATE',
  'SIGNATURE.PENDING_SLOT_ONCE',
  'SIGNATURE.SLOT_LOOKALIKE',
  'SIGNATURE.ADOPTION_WORDING',
  'SIGNATURE.NAME_AFTER_SLOT',
  'ENVELOPE.PROMPT_CASE_TASK',
  'ENVELOPE.THREAD',
  'ENVELOPE.SENDER',
  'ENVELOPE.REPLY_RECIPIENT',
  'PLAN.SOURCE_EXISTS',
  'PLAN.SOURCE_APPLIES',
  'PLAN.SOURCE_IN_CONTEXT',
  'PLAN.SOURCE_LATEST_REVISION',
  'PLAN.CONTENT_SHA256',
  'PLAN.PREVIOUSLY_SUPPLIED',
  'WORDING.ATTACHMENT_CLAIM',
  'MARKER.DECLARATION_PLACEHOLDER',
  'MARKER.INPUT_PLACEHOLDERS',
  'MARKER.PROMPT_STRUCTURE',
  'MARKER.INTERNAL_IDENTIFIERS',
  'MARKER.GATE_LABELS',
  'CONTEXT.GENERATION_MODE',
  'CONTEXT.MISSING',
  'CONTEXT.CONFLICTS',
  'CONTEXT.PROMPT_DRIFT',
] as const;

const SLOT = '[PENDING AUTHORIZED SIGNER — FULL LEGAL NAME REQUIRED]';

function pass(message: string): void {
  checks += 1;
  console.log(`[smoke:p4g] PASS ${message}`);
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
  readonly caseId: string;
  readonly artifactSha256: string;
  readonly dependencyDigest: string;
  readonly dependencyManifest: unknown[];
  readonly evaluatedContextJson: Record<string, unknown>;
  readonly rulesetVersion: string;
  readonly result: string;
  readonly coverageManifest: {
    requiredRuleIds: string[];
    executedRuleIds: string[];
    notExecutedRuleIds: string[];
    semanticReviewRequired: boolean;
  };
  readonly blockerCount: number;
  readonly reviewRequiredCount: number;
  readonly warningCount: number;
}

interface Issue {
  readonly id: string;
  readonly runId: string;
  readonly ruleId: string;
  readonly checkKind: string;
  readonly severity: string;
  readonly fieldPath: string | null;
}

async function main(): Promise<void> {
  if (process.env['CI'] !== 'true') {
    fail(
      'smoke:p4g writes directory, source, authority, case, intake, prompt, candidate and ' +
        'validation records into the target database; it runs only in CI (CI=true) against the ' +
        'disposable CI database',
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

  // Verdict keys a technical run never carries (recorded context fields such as a version's
  // signedDatesRaw or validityModel are data, not verdicts, and are not matched).
  const forbiddenKey =
    /"(g[1-7]\w*|ready\w*|eligib\w*|infring\w*|authori[sz]ed\w*|verified\w*|approved\w*|isCurrent\w*|valid|isValid\w*|signedAt|signedBy\w*|adoptedAt|adoptedBy\w*|sentAt|legallyValid\w*|legalApproval\w*)"\s*:/i;

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
      const key = options.key === undefined ? `p4g-ci-${randomUUID()}` : options.key;
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
      fail(`${label}: carries a readiness, approval, signature or verdict key`);
    }
    if (expected < 400 && /READY_FOR_SIGNER"|G[1-7]_PASS|"PASS"/.test(text)) {
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
  const mailbox = `p4g-ci-${tag}@example.invalid`;
  const platform = `p4g-ci-platform-${tag}@example.invalid`;

  // Directory, route and authority ---------------------------------------------------------------
  const agency = await create('POST /agencies', '/agencies', contracts.CreateAgencyResponseSchema, {
    displayName: `P4G CI synthetic agency ${tag}`,
    legalName: `P4G CI Synthetic Agency ${tag} Ltd`,
  });
  const agencyId = agency.data.id;
  const source = (title: string, extra: Record<string, unknown> = {}) =>
    create('POST /sources', '/sources', contracts.CreateSourceResponseSchema, {
      agencyId,
      title: `P4G CI synthetic ${title} ${tag} (not evidence)`,
      sourceRole: 'OPERATOR_INPUT',
      scopeText: `Synthetic CI ${title}`,
      ...extra,
    });
  const record = await source('agency record', { sourceRole: 'CANONICAL_RECORD' });
  const owner = await create('POST /owners', '/owners', contracts.CreateOwnerResponseSchema, {
    displayName: `P4G CI synthetic brand ${tag}`,
  });
  const subject = await create(
    'POST /legal-subjects',
    '/legal-subjects',
    contracts.CreateLegalSubjectResponseSchema,
    { subjectType: 'LEGAL_ENTITY', legalName: `P4G CI Synthetic Subject ${tag} LLC` },
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
    fullLegalName: `P4G CI Synthetic Signer ${tag}`,
  });
  const mandate = await create(
    'POST /mandates',
    '/mandates',
    contracts.CreateMandateResponseSchema,
    { agencyId, label: `P4G CI synthetic mandate ${tag}` },
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
      coverageLabel: `P4G CI synthetic coverage ${tag}`,
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

  // Two cases, each with its own selection and intake --------------------------------------------
  const caseEtag = (id: string) => etagOf(`/cases/${id}`, contracts.GetCaseResponseSchema);
  const mappingBasis = await source('mapping basis');
  const setUpCase = async (label: string, video: string) => {
    const created = await create('POST /cases', '/cases', contracts.CreateCaseResponseSchema, {
      agencyId,
      routeId: route.data.id,
      intakeLabel: `P4G CI synthetic ${label} ${tag}`,
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
      { title: `P4G CI synthetic work ${label} ${tag}` },
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
    return { id, selection: selection.data.id };
  };
  const caseA = await setUpCase('case A', `P4gA${tag.slice(0, 4)}_Zz`);
  const caseB = await setUpCase('case B', `P4gB${tag.slice(0, 4)}_Zz`);

  // Prompts and candidates -----------------------------------------------------------------------
  const scopeQuery = (selection: string) =>
    new URLSearchParams({
      taskType: 'INITIAL',
      generationMode: 'DRAFTING',
      authoritySelectionId: selection,
    }).toString();
  const readContext = async (caseId: string, selection: string, label: string) =>
    (
      await call(
        `GET /cases/{caseId}/production-context (${label})`,
        'GET',
        `/cases/${caseId}/production-context?${scopeQuery(selection)}`,
        200,
        contracts.GetProductionContextResponseSchema,
      )
    ).data as unknown as ContextView;
  // The dependency digest rebuilt from its written-out definition (R14-AUD-013, ADR-0007) for an
  // INITIAL read of `selection`: TB-PRODUCTION-CONTEXT-DIGEST-v2 is the current definition; v1 is
  // what a deployment of the earlier definition computed for the same closure — the digest a
  // preview read there carried.
  type DigestDefinition = 'TB-PRODUCTION-CONTEXT-DIGEST-v1' | 'TB-PRODUCTION-CONTEXT-DIGEST-v2';
  const digestOf = (
    algorithm: DigestDefinition,
    view: ContextView,
    caseId: string,
    selection: string,
    generationMode = 'DRAFTING',
  ) =>
    frozen.canonicalSha256({
      algorithm,
      contract: 'TB-SCHEMA-API-v1.4.0',
      schemaVersion: 'PFC-YT-EMAIL-v1.1',
      scope: {
        caseId,
        taskType: 'INITIAL',
        generationMode,
        authoritySelectionId: selection,
        parentBindingId: null,
        priorBindingIds: [],
      },
      dependencies: (
        view.dependencies as ReadonlyArray<{
          entityType: string;
          entityId: string;
          fingerprint: string;
        }>
      ).map(({ entityType, entityId, fingerprint }) => ({ entityType, entityId, fingerprint })),
    });
  const generate = async (target: { id: string; selection: string }, label: string) => {
    const view = await readContext(target.id, target.selection, label);
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
  const importDraft = async (
    target: { id: string },
    promptId: string,
    label: string,
    bodyText: string,
  ) =>
    (
      await create(
        `POST /cases/{caseId}/candidates (${label})`,
        `/cases/${target.id}/candidates`,
        contracts.ImportCandidateResponseSchema,
        {
          promptSnapshotId: promptId,
          subject: `P4G CI synthetic notice ${tag}`,
          envelope: { from: mailbox, to: platform },
          bodyText,
          preparedDocuments: [],
        },
      )
    ).data as unknown as { id: string; caseId: string; artifactSha256: string };
  const clean = await importDraft(
    caseA,
    promptA.id,
    'clean draft',
    `Synthetic CI notice text for human review.\r\nThe recorded work appears in the reported video.\n\nSincerely,\n${SLOT}\n`,
  );

  // Validation -----------------------------------------------------------------------------------
  const runsPath = (candidateId: string) => `/candidates/${candidateId}/validation-runs`;
  const validate = async (
    candidate: { id: string; artifactSha256: string },
    digest: string,
    label: string,
    key?: string,
  ) =>
    (
      await call(
        `POST /candidates/{id}/validation-runs (${label})`,
        'POST',
        runsPath(candidate.id),
        201,
        contracts.ValidateCandidateResponseSchema,
        {
          body: {
            expectedArtifactSha256: candidate.artifactSha256,
            expectedDependencyDigest: digest,
          },
          ...(key === undefined ? {} : { key }),
        },
      )
    ).data as unknown as Run;
  const issuesOf = async (runId: string, label: string) =>
    (
      (
        await call(
          `GET /validation-runs/{id}/issues (${label})`,
          'GET',
          `/validation-runs/${runId}/issues?limit=100`,
          200,
          contracts.ListValidationIssuesResponseSchema,
        )
      ).data as unknown as { items: Issue[]; nextCursor: string | null }
    ).items;

  const before = await rowCounts();
  const candidatesBefore = before.notice_candidates;
  const readA = await readContext(caseA.id, caseA.selection, 'the candidate’s prompt scope');
  if (readA.dependencyDigest !== promptA.dependencyDigest) {
    fail('the current digest must be the prompt’s when nothing changed since it was generated');
  }
  pass('the current context of the prompt scope has the prompt’s dependency digest');
  if (
    readA.dependencyDigest !==
      digestOf('TB-PRODUCTION-CONTEXT-DIGEST-v2', readA, caseA.id, caseA.selection) ||
    digestOf('TB-PRODUCTION-CONTEXT-DIGEST-v1', readA, caseA.id, caseA.selection) ===
      readA.dependencyDigest
  ) {
    fail('the current digest must be TB-PRODUCTION-CONTEXT-DIGEST-v2 of the closure and scope');
  }
  pass(
    'R14-AUD-013: the current digest — the one the prompt was generated against — is TB-PRODUCTION-CONTEXT-DIGEST-v2 of the closure and scope (rebuilt with the frozen helper); the v1 digest of the same closure is another value',
  );
  const key = `p4g-ci-${randomUUID()}`;
  const passed = await validate(clean, readA.dependencyDigest, 'clean draft', key);
  if (
    passed.result !== 'TECHNICAL_PASS' ||
    passed.rulesetVersion !== 'TB-TECHNICAL-RULESET-v3' ||
    passed.candidateId !== clean.id ||
    passed.caseId !== caseA.id ||
    passed.artifactSha256 !== clean.artifactSha256 ||
    passed.dependencyDigest !== readA.dependencyDigest ||
    canonical(passed.evaluatedContextJson) !== canonical(readA.context) ||
    canonical(passed.dependencyManifest) !== canonical(readA.dependencies) ||
    canonical(passed.coverageManifest.requiredRuleIds) !== canonical(RULES) ||
    canonical(passed.coverageManifest.executedRuleIds) !== canonical(RULES) ||
    passed.coverageManifest.notExecutedRuleIds.length !== 0 ||
    passed.coverageManifest.semanticReviewRequired !== true ||
    passed.blockerCount + passed.reviewRequiredCount + passed.warningCount !== 0
  ) {
    fail('the clean draft must be a TECHNICAL_PASS bound to its exact artifact and read context');
  }
  pass(
    'TECHNICAL_PASS: technical checks only — all 29 rules executed, semantic review still required',
  );
  if ((await issuesOf(passed.id, 'technical pass')).length !== 0) {
    fail('a technical pass records no issue');
  }
  pass('a technical pass records no issue');
  const replay = await validate(clean, readA.dependencyDigest, 'the same key again', key);
  if (replay.id !== passed.id || canonical(replay) !== canonical(passed)) {
    fail('a replay must return the stored run');
  }
  pass('the same Idempotency-Key replays the stored run');
  // The run read back by its id (TB-SCHEMA-API-v1.3.0): exactly the stored run, no ETag — nothing
  // re-evaluated, rebuilt or current.
  const readBack = async (run: Run, label: string) => {
    const response = await call(
      `GET /validation-runs/{id} (${label})`,
      'GET',
      `/validation-runs/${run.id}`,
      200,
      contracts.GetValidationRunResponseSchema,
    );
    if (response.etag !== null) fail(`${label}: a stored run carries no ETag`);
    const read = response.data as unknown as Run;
    if (canonical(read) !== canonical(run)) fail(`${label}: the read-back is not the stored run`);
    return read;
  };
  const stored = await readBack(passed, 'the technical pass');
  if (
    stored.artifactSha256 !== clean.artifactSha256 ||
    stored.dependencyDigest !== readA.dependencyDigest ||
    stored.rulesetVersion !== 'TB-TECHNICAL-RULESET-v3' ||
    stored.result !== 'TECHNICAL_PASS' ||
    canonical(stored.coverageManifest) !==
      canonical({
        requiredRuleIds: RULES,
        executedRuleIds: RULES,
        notExecutedRuleIds: [],
        semanticReviewRequired: true,
      }) ||
    canonical(stored.dependencyManifest) !== canonical(readA.dependencies) ||
    canonical(stored.evaluatedContextJson) !== canonical(readA.context)
  ) {
    fail('the read-back must be exactly the recorded run');
  }
  pass(
    'the run read back by its id: the recorded artifact, digest, ruleset, result, coverage, dependency manifest and evaluated context',
  );
  const conflict = await call(
    'POST /candidates/{id}/validation-runs (the same key, another body)',
    'POST',
    runsPath(clean.id),
    409,
    null,
    {
      body: {
        expectedArtifactSha256: clean.artifactSha256,
        expectedDependencyDigest: '0'.repeat(64),
      },
      key,
    },
  );
  if (conflict.code !== 'IDEMPOTENCY_CONFLICT') fail('the same key with another body must be 409');
  const listed = (
    await call(
      'GET /candidates/{id}/validation-runs',
      'GET',
      `${runsPath(clean.id)}?q=${passed.id}`,
      200,
      contracts.ListValidationRunsResponseSchema,
    )
  ).data as unknown as { items: Array<Record<string, unknown>> };
  if (
    listed.items.length !== 1 ||
    listed.items[0]?.['id'] !== passed.id ||
    'evaluatedContextJson' in (listed.items[0] ?? {}) ||
    'coverageManifest' in (listed.items[0] ?? {})
  ) {
    fail('the run list must show the run as a summary only');
  }
  pass('the run list shows the run as a summary (no context, manifest or coverage)');

  const twoSlots = await importDraft(
    caseA,
    promptA.id,
    'two pending slots',
    `Synthetic CI text.\n${SLOT}\nMore text.\n${SLOT}\n`,
  );
  const blocked = await validate(twoSlots, readA.dependencyDigest, 'two pending slots');
  const blockedIssues = await issuesOf(blocked.id, 'blocked');
  if (
    blocked.result !== 'BLOCKED' ||
    !blockedIssues.some(
      (issue) =>
        issue.ruleId === 'SIGNATURE.PENDING_SLOT_ONCE' &&
        issue.checkKind === 'DETERMINISTIC' &&
        issue.severity === 'BLOCKER',
    )
  ) {
    fail('two pending slots must be BLOCKED by a deterministic blocker');
  }
  pass('two pending slots → BLOCKED (DETERMINISTIC BLOCKER of SIGNATURE.PENDING_SLOT_ONCE)');
  const blockedRead = await readBack(blocked, 'the blocked run');
  if (
    blockedRead.result !== 'BLOCKED' ||
    blockedRead.blockerCount !== blockedIssues.filter((i) => i.severity === 'BLOCKER').length ||
    blockedRead.coverageManifest.semanticReviewRequired !== true
  ) {
    fail('the blocked run must read back with its result, counts and coverage as recorded');
  }
  pass('the blocked run reads back with its recorded result, counts and coverage; issues apart');

  const wording = await importDraft(
    caseA,
    promptA.id,
    'attachment wording',
    `Synthetic CI text. Please find attached the licence.\n${SLOT}\n`,
  );
  const review = await validate(wording, readA.dependencyDigest, 'attachment wording');
  const reviewIssues = await issuesOf(review.id, 'review required');
  if (
    review.result !== 'REVIEW_REQUIRED' ||
    reviewIssues.length !== 1 ||
    reviewIssues[0]?.ruleId !== 'WORDING.ATTACHMENT_CLAIM' ||
    reviewIssues[0]?.checkKind !== 'HEURISTIC' ||
    reviewIssues[0]?.severity !== 'REVIEW_REQUIRED'
  ) {
    fail('attachment wording without a planned file must be a heuristic review signal');
  }
  pass('attachment wording → REVIEW_REQUIRED (HEURISTIC signal, never a blocker)');

  const artifactRefused = await call(
    'POST /candidates/{id}/validation-runs (another artifact SHA-256)',
    'POST',
    runsPath(clean.id),
    412,
    null,
    {
      body: {
        expectedArtifactSha256: 'a'.repeat(64),
        expectedDependencyDigest: readA.dependencyDigest,
      },
    },
  );
  if (artifactRefused.code !== 'ARTIFACT_CHANGED')
    fail('another artifact must be 412 ARTIFACT_CHANGED');

  // A relevant change: an authority event of the pinned mandate makes the read digest stale.
  await create(
    'POST /mandates/{id}/events',
    `/mandates/${mandate.data.id}/events`,
    contracts.RecordAuthorityEventResponseSchema,
    {
      eventType: 'TERMINATION',
      provenance: 'OPERATOR_REPORTED',
      sourceId: record.data.id,
      scopeText: 'Synthetic CI whole mandate',
      interpretation: 'Synthetic CI operator reading',
    },
    await mandateEtag(),
  );
  const stale = await call(
    'POST /candidates/{id}/validation-runs (the digest read before the event)',
    'POST',
    runsPath(clean.id),
    412,
    null,
    {
      body: {
        expectedArtifactSha256: clean.artifactSha256,
        expectedDependencyDigest: readA.dependencyDigest,
      },
    },
  );
  if (stale.code !== 'CONTEXT_CHANGED') fail('a stale digest must be 412 CONTEXT_CHANGED');
  const reread = await readContext(caseA.id, caseA.selection, 'after the authority event');
  if (reread.dependencyDigest === readA.dependencyDigest) fail('the event must change the digest');
  const drifted = await validate(clean, reread.dependencyDigest, 'the new read');
  const driftIssues = await issuesOf(drifted.id, 'drift');
  if (
    drifted.result !== 'REVIEW_REQUIRED' ||
    !driftIssues.some(
      (issue) => issue.ruleId === 'CONTEXT.PROMPT_DRIFT' && issue.severity === 'REVIEW_REQUIRED',
    )
  ) {
    fail('the drift since the prompt must be review required');
  }
  pass(
    'after a new read the run evaluates the current context; the drift since the prompt is review required',
  );
  // History: the earlier run does not follow the changed context.
  const kept = await readBack(passed, 'the technical pass after the authority event');
  if (
    kept.dependencyDigest !== readA.dependencyDigest ||
    kept.dependencyDigest === reread.dependencyDigest ||
    kept.result !== 'TECHNICAL_PASS'
  ) {
    fail('a stored run must keep its own digest and result after the context changed');
  }
  await readBack(drifted, 'the run of the new read');
  pass(
    'after the authority event the earlier run still reads back as recorded (its own digest and result); the new run records the new context',
  );

  // Case B -------------------------------------------------------------------------------------------
  const cleanB = await importDraft(
    caseB,
    promptB.id,
    'case B draft',
    `Synthetic CI notice text for case B.\n${SLOT}\n`,
  );
  const readB = await readContext(caseB.id, caseB.selection, 'case B');
  const runB = await validate(cleanB, readB.dependencyDigest, 'case B');
  if (runB.caseId !== caseB.id || JSON.stringify(runB).includes(caseA.id)) {
    fail('case B’s run must use only case B’s context');
  }
  const listB = (
    await call(
      'GET /candidates/{id}/validation-runs (case B)',
      'GET',
      runsPath(cleanB.id),
      200,
      contracts.ListValidationRunsResponseSchema,
    )
  ).data as unknown as { items: Array<{ id: string }> };
  const listA = (
    await call(
      'GET /candidates/{id}/validation-runs (case A clean draft)',
      'GET',
      runsPath(clean.id),
      200,
      contracts.ListValidationRunsResponseSchema,
    )
  ).data as unknown as { items: Array<{ id: string }> };
  if (
    canonical(listB.items.map((item) => item.id)) !== canonical([runB.id]) ||
    canonical(listA.items.map((item) => item.id).sort()) !==
      canonical([passed.id, drifted.id].sort())
  ) {
    fail('each candidate lists its own runs only');
  }
  pass('each candidate lists only its own runs; nothing of case A appears in case B’s run');
  const readRunB = await readBack(runB, 'case B');
  if (readRunB.caseId !== caseB.id || JSON.stringify(readRunB).includes(caseA.id)) {
    fail('case B’s run must read back with case B’s context only');
  }
  const unknownRun = await call(
    'GET /validation-runs/{id} (an unknown id)',
    'GET',
    `/validation-runs/${randomUUID()}`,
    404,
    null,
  );
  if (unknownRun.code !== 'NOT_FOUND') fail('an unknown run must be 404 NOT_FOUND');

  // Row counts ---------------------------------------------------------------------------------------
  const after = await rowCounts();
  const grew = (table: (typeof COUNTED_TABLES)[number]) => after[table] - before[table];
  const accepted = [passed, blocked, review, drifted, runB];
  const issueTotal = accepted.reduce(
    (sum, run) => sum + run.blockerCount + run.reviewRequiredCount + run.warningCount,
    0,
  );
  if (grew('validation_runs') !== accepted.length) fail('each accepted run wrote exactly one run');
  if (grew('validation_issues') !== issueTotal) fail('the issues written are the runs’ issues');
  // Three candidates were imported after the first count (two in case A, one in case B), each with
  // its audit event; the authority event wrote one more.
  if (after.notice_candidates - candidatesBefore !== 3) fail('validation writes no candidate');
  if (grew('audit_events') !== accepted.length + 3 + 1) {
    fail('each accepted run wrote one audit event; refusals, replays and reads none');
  }
  for (const table of [
    'prompt_snapshots',
    'candidate_assessments',
    'assessment_sources',
  ] as const) {
    if (grew(table) !== 0) fail(`${table} must not be written by a validation`);
  }
  pass(
    'five runs with their issues and audit events; no candidate, prompt, assessment or later-phase record from validation; reading a run wrote nothing',
  );

  // Current source applicability (R14-AUD-009, R14-AUD-010) ------------------------------------------
  // Every source a context lists is checked against the case as it is now: a version annex restricted
  // to another legal subject (valid when recorded: agency-level) is a SOURCE_NOT_APPLICABLE conflict
  // while the version's applicable sources stay clean; another owner's later coverage citing a source
  // linked to case A (a valid write that touches nothing of case A) changes case A's digest, not its
  // revision, and lists the conflict; a prompt against the earlier digest is 412; the runs recorded
  // before read back unchanged.
  type Conflict = { code: string; message: string; fieldPath?: string | null };
  type Listed = { sourceId: string };
  const conflictsOf = (view: ContextView) =>
    (view.context['conflicts'] as Conflict[]).filter(
      (entry) => entry.code === 'SOURCE_NOT_APPLICABLE',
    );
  const entryOf = (view: ContextView, sourceId: string) => {
    const index = (view.context['sources'] as Listed[]).findIndex((e) => e.sourceId === sourceId);
    return index < 0 ? null : `sources[${index}]`;
  };
  const scopeCounts = await rowCounts();
  const subjectM = await create(
    'POST /legal-subjects (a second subject)',
    '/legal-subjects',
    contracts.CreateLegalSubjectResponseSchema,
    { subjectType: 'LEGAL_ENTITY', legalName: `P4G CI Synthetic Subject M ${tag} LLC` },
  );
  const annex = await source('annex for subject M only', {
    scopeBindings: { legalSubjectIds: [subjectM.data.id] },
  });
  const annexMandate = await create(
    'POST /mandates (annex mandate)',
    '/mandates',
    contracts.CreateMandateResponseSchema,
    { agencyId, label: `P4G CI synthetic annex mandate ${tag}` },
  );
  const annexVersion = await create(
    'POST /mandates/{id}/versions (an annex of subject M: agency-level, valid)',
    `/mandates/${annexMandate.data.id}/versions`,
    contracts.CreateMandateVersionResponseSchema,
    {
      changeKind: 'NEW_AUTHORIZATION',
      changeReason: 'Synthetic CI capture',
      primarySourceId: record.data.id,
      documentState: 'SIGNED_APPEARING',
      additionalSourceRefs: [
        { sourceId: annex.data.id, role: 'SYNTHETIC_ANNEX', scopeText: 'Synthetic CI annex' },
      ],
    },
    await etagOf(`/mandates/${annexMandate.data.id}`, contracts.GetMandateResponseSchema),
  );
  const annexVersionEtag = () =>
    etagOf(`/mandate-versions/${annexVersion.data.id}`, contracts.GetMandateVersionResponseSchema);
  const annexBasis = await source('annex coverage basis');
  const annexCoverage = await create(
    'POST /mandate-versions/{id}/coverages (annex mandate)',
    `/mandate-versions/${annexVersion.data.id}/coverages`,
    contracts.CreateCoverageResponseSchema,
    {
      routeId: route.data.id,
      coverageLabel: `P4G CI synthetic annex coverage ${tag}`,
      basisSourceId: annexBasis.data.id,
      actionScope: ['PREPARE_NOTICE'],
    },
    await annexVersionEtag(),
  );
  await create(
    'POST /coverages/{id}/signers (annex mandate)',
    `/coverages/${annexCoverage.data.id}/signers`,
    contracts.CreateCoverageSignerResponseSchema,
    { signerId: signer.data.id, capacity: 'Synthetic CI capacity', sourceId: annexBasis.data.id },
    await etagOf(`/coverages/${annexCoverage.data.id}`, contracts.GetCoverageResponseSchema),
  );
  await call(
    'POST /mandate-versions/{id}/freeze (annex mandate)',
    'POST',
    `/mandate-versions/${annexVersion.data.id}/freeze`,
    200,
    contracts.FreezeMandateVersionResponseSchema,
    {
      body: { reason: 'Synthetic CI freeze of the recorded terms' },
      ifMatch: await annexVersionEtag(),
    },
  );
  const caseC = await create('POST /cases (case C)', '/cases', contracts.CreateCaseResponseSchema, {
    agencyId,
    routeId: route.data.id,
    intakeLabel: `P4G CI synthetic case C ${tag}`,
  });
  const selectionC = await create(
    'POST /cases/{caseId}/authority-selections (case C: the annex mandate)',
    `/cases/${caseC.data.id}/authority-selections`,
    contracts.SelectCaseAuthorityResponseSchema,
    {
      routeId: route.data.id,
      signerId: signer.data.id,
      taskType: 'INITIAL',
      intendedFromEmail: mailbox,
      selectionNote: `Synthetic CI selection ${tag}`,
      coverages: [{ coverageId: annexCoverage.data.id, applicationScope: `Synthetic CI ${tag}` }],
    },
    await caseEtag(caseC.data.id),
  );
  const readC = (
    await call(
      'GET /cases/{caseId}/production-context (case C, PREPARATION)',
      'GET',
      `/cases/${caseC.data.id}/production-context?${new URLSearchParams({
        taskType: 'INITIAL',
        generationMode: 'PREPARATION',
        authoritySelectionId: selectionC.data.id,
      }).toString()}`,
      200,
      contracts.GetProductionContextResponseSchema,
    )
  ).data as unknown as ContextView;
  const annexConflicts = conflictsOf(readC);
  if (
    annexConflicts.length !== 1 ||
    annexConflicts[0]?.fieldPath !== entryOf(readC, annex.data.id) ||
    !annexConflicts[0].message.includes('(SOURCE_SCOPE_UNRESOLVED: SCOPED_TO_OTHER_SUBJECT)') ||
    !annexConflicts[0].message.includes(
      `additional source 0 of mandate version ${annexVersion.data.id}`,
    ) ||
    entryOf(readC, record.data.id) === null ||
    entryOf(readC, annexBasis.data.id) === null
  ) {
    fail(
      'a version annex of another subject must be one SOURCE_NOT_APPLICABLE; the rest stays clean',
    );
  }
  pass(
    'R14-AUD-009: a version annex of another subject is listed with SOURCE_NOT_APPLICABLE; the version’s other sources and the coverage basis raise nothing',
  );

  const linkedA = await source('case A linked source');
  await create(
    'POST /cases/{caseId}/sources (case A)',
    `/cases/${caseA.id}/sources`,
    contracts.LinkCaseSourceResponseSchema,
    { sourceId: linkedA.data.id, useRole: 'SYNTHETIC_SUPPORT', scopeNote: 'Synthetic CI note' },
    await caseEtag(caseA.id),
  );
  const before0 = await readContext(caseA.id, caseA.selection, 'case A with its linked source');
  if (conflictsOf(before0).length !== 0) fail('a linked source of no other owner must apply');
  const ownerB = await create(
    'POST /owners (owner B)',
    '/owners',
    contracts.CreateOwnerResponseSchema,
    {
      displayName: `P4G CI synthetic brand B ${tag}`,
    },
  );
  const subjectB = await create(
    'POST /legal-subjects (owner B)',
    '/legal-subjects',
    contracts.CreateLegalSubjectResponseSchema,
    { subjectType: 'LEGAL_ENTITY', legalName: `P4G CI Synthetic Subject B ${tag} LLC` },
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
    {
      agencyId,
      ownerSubjectId: associationB.data.id,
    },
  );
  const mandateB = await create(
    'POST /mandates (owner B)',
    '/mandates',
    contracts.CreateMandateResponseSchema,
    { agencyId, label: `P4G CI synthetic mandate B ${tag}` },
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
    'POST /mandate-versions/{id}/coverages (owner B cites case A’s linked source)',
    `/mandate-versions/${versionB.data.id}/coverages`,
    contracts.CreateCoverageResponseSchema,
    {
      routeId: routeB.data.id,
      coverageLabel: `P4G CI synthetic coverage B ${tag}`,
      basisSourceId: linkedA.data.id,
      actionScope: ['PREPARE_NOTICE'],
    },
    await etagOf(
      `/mandate-versions/${versionB.data.id}`,
      contracts.GetMandateVersionResponseSchema,
    ),
  );
  const after0 = await readContext(caseA.id, caseA.selection, 'case A after owner B’s write');
  const ownerConflicts = conflictsOf(after0);
  if (
    after0.contextRevision !== before0.contextRevision ||
    after0.dependencyDigest === before0.dependencyDigest ||
    ownerConflicts.length !== 1 ||
    ownerConflicts[0]?.fieldPath !== entryOf(after0, linkedA.data.id) ||
    !ownerConflicts[0].message.includes('(CROSS_OWNER_REFERENCE)') ||
    JSON.stringify(after0.context).includes(ownerB.data.id)
  ) {
    fail(
      'another owner’s later use must change the digest (not the revision) and list the conflict',
    );
  }
  pass(
    'R14-AUD-010: another owner’s later coverage citing case A’s linked source: the same revision, a new digest and SOURCE_NOT_APPLICABLE (CROSS_OWNER_REFERENCE); no other owner named',
  );
  for (const view of [before0, after0]) {
    if (
      view.dependencyDigest !==
      digestOf('TB-PRODUCTION-CONTEXT-DIGEST-v2', view, caseA.id, caseA.selection)
    ) {
      fail(
        'both digests must be TB-PRODUCTION-CONTEXT-DIGEST-v2: the drift is within one definition',
      );
    }
  }
  pass(
    'R14-AUD-013: the digests before and after owner B’s write are both TB-PRODUCTION-CONTEXT-DIGEST-v2 — the owner marker moved the digest within one definition',
  );
  const staleCounts = await rowCounts();
  const stalePrompt = await call(
    'POST /cases/{caseId}/prompts (the digest read before owner B’s write)',
    'POST',
    `/cases/${caseA.id}/prompts`,
    412,
    null,
    {
      body: {
        taskType: 'INITIAL',
        generationMode: 'DRAFTING',
        expectedContextRevision: before0.contextRevision,
        expectedDependencyDigest: before0.dependencyDigest,
        authoritySelectionId: caseA.selection,
        priorBindingIds: [],
      },
    },
  );
  if (stalePrompt.code !== 'CONTEXT_CHANGED') fail('a prompt against a stale digest must be 412');
  const staleRun = await call(
    'POST /candidates/{id}/validation-runs (the digest read before owner B’s write)',
    'POST',
    runsPath(clean.id),
    412,
    null,
    {
      body: {
        expectedArtifactSha256: clean.artifactSha256,
        expectedDependencyDigest: before0.dependencyDigest,
      },
    },
  );
  if (staleRun.code !== 'CONTEXT_CHANGED') fail('a validation against a stale digest must be 412');
  // R14-AUD-013: the current revision with the v1 digest of the current closure — a preview read
  // under the earlier digest definition — authorizes neither a prompt nor a validation.
  const caseFields = async (label: string) => {
    const read = await call(
      `GET /cases/{caseId} (case A ${label})`,
      'GET',
      `/cases/${caseA.id}`,
      200,
      contracts.GetCaseResponseSchema,
    );
    return [read.data['contextRevision'], read.data['rowVersion']];
  };
  const caseBeforeV1 = await caseFields('before the v1-digest requests');
  const v1Digest = digestOf('TB-PRODUCTION-CONTEXT-DIGEST-v1', after0, caseA.id, caseA.selection);
  const v1Prompt = await call(
    'POST /cases/{caseId}/prompts (the current revision with the v1 digest of the current closure)',
    'POST',
    `/cases/${caseA.id}/prompts`,
    412,
    null,
    {
      body: {
        taskType: 'INITIAL',
        generationMode: 'DRAFTING',
        expectedContextRevision: after0.contextRevision,
        expectedDependencyDigest: v1Digest,
        authoritySelectionId: caseA.selection,
        priorBindingIds: [],
      },
    },
  );
  const v1Run = await call(
    'POST /candidates/{id}/validation-runs (the v1 digest of the current closure)',
    'POST',
    runsPath(clean.id),
    412,
    null,
    {
      body: {
        expectedArtifactSha256: clean.artifactSha256,
        expectedDependencyDigest: v1Digest,
      },
    },
  );
  for (const refused of [v1Prompt, v1Run]) {
    if (
      refused.code !== 'CONTEXT_CHANGED' ||
      refused.details['field'] !== 'expectedDependencyDigest'
    ) {
      fail('a v1 digest must be 412 CONTEXT_CHANGED on expectedDependencyDigest');
    }
  }
  const caseAfterV1 = await caseFields('after the v1-digest requests');
  const rereadA = await readContext(
    caseA.id,
    caseA.selection,
    'case A after the v1-digest requests',
  );
  if (
    canonical(caseAfterV1) !== canonical(caseBeforeV1) ||
    caseBeforeV1[0] !== after0.contextRevision ||
    rereadA.dependencyDigest !== after0.dependencyDigest
  ) {
    fail('the v1-digest requests must leave the case and its current digest unchanged');
  }
  pass(
    'R14-AUD-013: the current revision with the v1 digest of the unchanged closure is 412 CONTEXT_CHANGED (expectedDependencyDigest) for a prompt and a validation; the case revision, row version and current digest unchanged',
  );
  const afterStale = await rowCounts();
  for (const table of COUNTED_TABLES) {
    if (afterStale[table] !== staleCounts[table]) fail(`a refused request wrote ${table}`);
  }
  await readBack(passed, 'the technical pass after owner B’s write');
  await readBack(drifted, 'the run of the new read after owner B’s write');
  pass(
    'a prompt and a validation against the digest read before are 412 CONTEXT_CHANGED and write nothing; case A’s recorded runs read back exactly as recorded',
  );
  const scopeAfter = await rowCounts();
  for (const table of [
    'validation_runs',
    'validation_issues',
    'prompt_snapshots',
    'notice_candidates',
    'candidate_assessments',
    'assessment_sources',
  ] as const) {
    if (scopeAfter[table] !== scopeCounts[table]) fail(`${table} changed while checking sources`);
  }
  pass('checking the sources wrote no run, issue, prompt, candidate or assessment');

  // R14-AUD-013 on case C: a preview of its current context under the earlier digest definition
  // (case C's context lists the R14-AUD-009 annex conflict; under v1 the same rows gave the same
  // closure) is refused; the current read's v2 digest generates a PREPARATION prompt that freezes the
  // conflict — a conflict is no drafting gate and is never suppressed.
  const readC2 = (
    await call(
      'GET /cases/{caseId}/production-context (case C, PREPARATION, read again)',
      'GET',
      `/cases/${caseC.data.id}/production-context?${new URLSearchParams({
        taskType: 'INITIAL',
        generationMode: 'PREPARATION',
        authoritySelectionId: selectionC.data.id,
      }).toString()}`,
      200,
      contracts.GetProductionContextResponseSchema,
    )
  ).data as unknown as ContextView;
  const digestC = (algorithm: DigestDefinition) =>
    digestOf(algorithm, readC2, caseC.data.id, selectionC.data.id, 'PREPARATION');
  if (
    readC2.dependencyDigest !== readC.dependencyDigest ||
    readC2.dependencyDigest !== digestC('TB-PRODUCTION-CONTEXT-DIGEST-v2')
  ) {
    fail('case C’s current digest must be unchanged and TB-PRODUCTION-CONTEXT-DIGEST-v2');
  }
  const promptC = (digest: string) => ({
    taskType: 'INITIAL',
    generationMode: 'PREPARATION',
    expectedContextRevision: readC2.contextRevision,
    expectedDependencyDigest: digest,
    authoritySelectionId: selectionC.data.id,
    priorBindingIds: [],
  });
  const beforeC = await rowCounts();
  const v1C = await call(
    'POST /cases/{caseId}/prompts (case C, the v1 digest of its current closure)',
    'POST',
    `/cases/${caseC.data.id}/prompts`,
    412,
    null,
    { body: promptC(digestC('TB-PRODUCTION-CONTEXT-DIGEST-v1')) },
  );
  if (v1C.code !== 'CONTEXT_CHANGED' || v1C.details['field'] !== 'expectedDependencyDigest') {
    fail('case C: a v1 digest must be 412 CONTEXT_CHANGED on expectedDependencyDigest');
  }
  const afterV1C = await rowCounts();
  for (const table of COUNTED_TABLES) {
    if (afterV1C[table] !== beforeC[table]) fail(`a refused v1-digest request wrote ${table}`);
  }
  const generatedC = (
    await create(
      'POST /cases/{caseId}/prompts (case C, the current v2 digest)',
      `/cases/${caseC.data.id}/prompts`,
      contracts.GeneratePromptResponseSchema,
      promptC(readC2.dependencyDigest),
    )
  ).data;
  const frozenConflicts = (generatedC['conflicts'] as Conflict[]).filter(
    (entry) => entry.code === 'SOURCE_NOT_APPLICABLE',
  );
  if (
    generatedC['dependencyDigest'] !== readC2.dependencyDigest ||
    generatedC['generationMode'] !== 'PREPARATION' ||
    frozenConflicts.length !== 1 ||
    frozenConflicts[0]?.fieldPath !== entryOf(readC2, annex.data.id) ||
    canonical(generatedC['contextJson']) !== canonical(readC2.context)
  ) {
    fail('case C’s prompt must freeze exactly the current v2 read, the annex conflict included');
  }
  const promptCRead = await call(
    'GET /prompts/{id} (case C)',
    'GET',
    `/prompts/${generatedC.id}`,
    200,
    contracts.GetPromptResponseSchema,
  );
  if (canonical(promptCRead.data) !== canonical(generatedC) || promptCRead.etag !== null) {
    fail('case C’s prompt must read back exactly as generated');
  }
  pass(
    'R14-AUD-013: case C — the v1 digest of its current closure is 412 with nothing written; the current v2 digest generates a PREPARATION prompt that freezes the SOURCE_NOT_APPLICABLE conflict, read back exactly',
  );

  for (const [label, method, suffix] of [
    ['PATCH /validation-runs/{id}', 'PATCH', `/validation-runs/${passed.id}`],
    ['DELETE /validation-runs/{id}', 'DELETE', `/validation-runs/${passed.id}`],
    // Candidate assessments are routed since P4H (smoke:p4h) and readiness and the unsigned export
    // since P4I (smoke:p4i); P4G records none of them.
    ['POST /candidates/{id}/sign', 'POST', `/candidates/${clean.id}/sign`],
    ['POST /candidates/{id}/send', 'POST', `/candidates/${clean.id}/send`],
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
  console.error(`[smoke:p4g] FAIL ${error instanceof Error ? error.message : String(error)}`);
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
    console.error('[smoke:p4g] FAIL port 3000 still in use');
    process.exitCode = 1;
  }
  console.log(`[smoke:p4g] ${process.exitCode ? 'FAIL' : 'PASS'} (${checks} checks)`);
}
