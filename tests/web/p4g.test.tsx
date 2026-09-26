// @vitest-environment happy-dom
// UI (P4G): technical validation on the notice candidate page against the synthetic in-memory API
// (support.tsx; the fake evaluates nothing — each test states the run's result). Covers the values
// shown before a run (the exact artifact SHA-256, the task, the prompt's mode, the ruleset and the
// current dependency digest, read only when asked, for exactly the prompt snapshot's scope); a run
// recorded against exactly that read; the result with its permanent qualifier (TECHNICAL PASS,
// BLOCKED with the technical blockers, REVIEW REQUIRED with why, ERROR with the safe diagnostic);
// the coverage manifest (required, executed and not-executed rules, semantic review required); the
// issues with rule, kind, severity, field and message, deterministic checks and heuristic signals
// apart, paged; a changed context or artifact (412) shown exactly, never retried, a new read
// required; a lost reply replayed with the same Idempotency-Key into one run; recorded runs listed
// newest first, kept after supersession, per candidate only; an archived case read-only; keyboard
// focus; and that no approve, ready, sign, send or export action and no readiness, approval or G1–G6
// claim appears. All data is synthetic.
import { describe, expect, it } from 'vitest';
import type { ContextView, ProductionContext } from '../../packages/contracts/src/index.js';
import {
  ContextViewSchema,
  PromptSnapshotSchema,
  ValidateCandidateSchema,
  ValidationIssueSchema,
  ValidationRunSchema,
  ValidationRunSummarySchema,
} from '../../packages/contracts/src/index.js';
import {
  RUN_VALIDATION_LABEL,
  TECHNICAL_QUALIFIER,
  VALIDATION_ARTIFACT_CHANGED,
  VALIDATION_BOUNDARY,
  VALIDATION_CONTEXT_CHANGED,
  VALIDATION_DIGEST_STALE,
} from '../../apps/web/src/app/cases/validation.js';
import {
  all,
  claimTexts,
  click,
  FakeDirectory,
  json,
  NOW,
  q,
  render,
  TECHNICAL_RULE_IDS,
  unmount,
  until,
  waitFor,
  type ValidationOutcome,
} from './support.js';

const SENDER = 'synthetic-sender@example.invalid';
const DIGEST_READ = 'b'.repeat(64);
const DIGEST_LATER = 'c'.repeat(64);
const meta = { requestId: 'synthetic', affectedResources: [] };

/** Claims a validation page never makes (a run is technical only). */
const FORBIDDEN_STATES =
  /\b(approved|signed|ready for signer|ready_for_signer|ready to sign|sent|legally valid|verified|g[1-7] pass(?:ed)?|authori[sz]ed signer|eligible|adopted)\b/i;
/** Actions the validation section never offers. */
const FORBIDDEN_ACTIONS =
  /\b(approve|ready|sign|send|export|submit|publish|email|retract|attach|adopt|verify rights|legal validation)\b/i;

function world(api: FakeDirectory) {
  const agency = api.seed('Agency', {
    displayName: 'SYNTHETIC Agency A',
    legalName: 'SYNTHETIC A Agency Legal Name Ltd',
  });
  const owner = api.seed('Owner', { displayName: 'SYNTHETIC Brand X' });
  const subject = api.seed('LegalSubject', { legalName: 'SYNTHETIC Subject L LLC' });
  const association = api.seed('OwnerSubject', { ownerId: owner.id, legalSubjectId: subject.id });
  const route = api.seed('Route', { agencyId: agency.id, ownerSubjectId: association.id });
  const signer = api.seed('Signer', {
    agencyId: agency.id,
    fullLegalName: 'SYNTHETIC Signer Person',
  });
  const primary = api.seedSource({ agencyId: agency.id, title: 'SYNTHETIC agency record' });
  const mandate = api.seed('Mandate', { agencyId: agency.id, label: 'SYNTHETIC mandate' });
  const version = api.seed('MandateVersion', {
    mandateId: mandate.id,
    agencyId: agency.id,
    versionState: 'FROZEN',
    primarySourceId: primary.id,
    documentState: 'SIGNED_APPEARING',
    frozenAt: NOW,
  });
  const coverage = api.seed('MandateCoverage', {
    mandateVersionId: version.id,
    routeId: route.id,
    agencyId: agency.id,
    coverageLabel: 'SYNTHETIC coverage',
    basisSourceId: primary.id,
    actionScope: ['PREPARE_NOTICE'],
  });
  const coverageSigner = api.seed('CoverageSigner', {
    coverageId: coverage.id,
    agencyId: agency.id,
    signerId: signer.id,
    capacity: 'SYNTHETIC capacity',
    sourceId: primary.id,
  });
  const caseA = api.seed('CaseRecord', {
    agencyId: agency.id,
    intakeLabel: 'SYNTHETIC Case A',
    routeId: route.id,
    contextRevision: 7,
  });
  const caseB = api.seed('CaseRecord', {
    agencyId: agency.id,
    intakeLabel: 'SYNTHETIC Case B',
    routeId: route.id,
    contextRevision: 2,
  });
  const selection = api.seedSelection(
    {
      caseId: caseA.id,
      agencyId: agency.id,
      routeId: route.id,
      signerId: signer.id,
      intendedFromEmail: SENDER,
    },
    [{ coverageId: coverage.id, applicationScope: 'SYNTHETIC application scope A' }],
  );
  const nmiMessage = api.seedCorrespondence({
    agencyId: agency.id,
    subject: 'SYNTHETIC request for more information',
    bodyText: 'SYNTHETIC question: please provide the licence.',
  });
  const nmi = api.seedBinding({
    caseId: caseA.id,
    agencyId: agency.id,
    correspondenceId: nmiMessage.id,
    eventType: 'NMI',
  });
  const outbound = api.seedCorrespondence({
    agencyId: agency.id,
    direction: 'OUTBOUND',
    subject: 'SYNTHETIC notice',
    captureMode: 'OPERATOR_REPORTED',
  });
  const asSent = api.seedBinding({
    caseId: caseA.id,
    agencyId: agency.id,
    correspondenceId: outbound.id,
    eventType: 'INITIAL_AS_SENT',
  });
  return {
    agency,
    owner,
    subject,
    signer,
    primary,
    version,
    coverage,
    coverageSigner,
    caseA,
    caseB,
    selection,
    nmiMessage,
    nmi,
    outbound,
    asSent,
  };
}
type World = ReturnType<typeof world>;

/** A contract-valid context view of case A (the fake assembles nothing). */
function viewOf(
  w: World,
  digest: string,
  context: Partial<ProductionContext> = {},
  caseId: string = w.caseA.id,
): ContextView {
  return ContextViewSchema.parse({
    contextRevision: 7,
    dependencyDigest: digest,
    dependencies: [],
    context: {
      schemaVersion: 'PFC-YT-EMAIL-v1.1',
      caseId,
      canonicalCaseId: null,
      taskType: 'INITIAL',
      generationMode: 'DRAFTING',
      caseContextRevision: 7,
      party: {
        agencyId: w.agency.id,
        ownerId: w.owner.id,
        legalSubjectId: w.subject.id,
        signerId: w.signer.id,
        agencyLegalName: 'SYNTHETIC A Agency Legal Name Ltd',
        legalSubjectName: 'SYNTHETIC Subject L LLC',
        signerFullLegalName: 'SYNTHETIC Signer Person',
      },
      authoritySelectionId: w.selection.id,
      reportedItems: [],
      works: [],
      mappings: [],
      facts: [],
      sources: [],
      parentBindingId: null,
      priorCorrespondenceIds: [],
      missing: [],
      conflicts: [],
      sourcePrecedence: 'CANONICAL_PRIMARY_RECORDS_OVER_APP_DERIVATIVES',
      signatureState: 'HUMAN_PENDING',
      externalAction: 'PROHIBITED',
      scannerVerification: 'DISABLED',
      authority: {
        selection: w.selection,
        coverages: [
          {
            coverage: w.coverage,
            version: w.version,
            signerScopes: [w.coverageSigner],
            authorityEvents: [],
          },
        ],
      },
      correspondence: [],
      policySources: [],
      ...context,
    },
  });
}

const answer = (view: ContextView) => () => json(200, { data: view, meta });

/** Seeds one contract-valid prompt snapshot of case A with the given frozen context. */
async function seedPrompt(
  api: FakeDirectory,
  view: ContextView,
  fields: Record<string, unknown> = {},
) {
  const { context } = view;
  const prompt = await api.seedPrompt({
    caseId: context.caseId,
    taskType: context.taskType,
    generationMode: context.generationMode,
    authoritySelectionId: context.authoritySelectionId,
    parentBindingId: context.parentBindingId,
    contextRevision: 7,
    dependencyDigest: view.dependencyDigest,
    dependencyManifest: view.dependencies,
    contextJson: context,
    sourceManifest: [],
    ...fields,
  });
  expect(PromptSnapshotSchema.safeParse(prompt).success).toBe(true);
  return prompt;
}

/** An INITIAL DRAFTING prompt of case A, its candidate, and the current context answering reads. */
async function initialCandidate(api: FakeDirectory, w: World, digest = DIGEST_READ) {
  const prompt = await seedPrompt(api, viewOf(w, digest));
  const candidate = await api.seedCandidate({
    caseId: w.caseA.id,
    promptSnapshotId: prompt.id,
    bodyText: 'SYNTHETIC body\n[PENDING AUTHORIZED SIGNER — FULL LEGAL NAME REQUIRED]\n',
  });
  api.contextReplies.set(w.caseA.id, answer(viewOf(w, digest)));
  return { prompt, candidate };
}

async function openCandidate(caseId: string, candidateId: string) {
  await render(api_, `/cases/${caseId}/candidates/${candidateId}`);
  await waitFor(() => q('[data-testid="validation-run-panel"]') !== null, 'the validation panel');
}
let api_: FakeDirectory;

async function readContext() {
  await click(q('[data-testid="validation-read-context"]') as HTMLElement);
  await waitFor(() => q('[data-testid="validation-current-digest"]') !== null, 'the read digest');
}

async function runValidation() {
  const before = api_.writes().length;
  await click(q('[data-testid="validation-run-button"]') as HTMLElement);
  await waitFor(
    () =>
      api_.writes().length > before &&
      q('[data-testid="validation-run-button"]')?.hasAttribute('disabled') !== true,
    'the run request',
  );
}

const runRequests = (candidateId: string) =>
  api_.requests.filter(
    (request) =>
      request.method === 'POST' &&
      request.path === `/api/v1/candidates/${candidateId}/validation-runs`,
  );
const contextReads = () =>
  api_.requests.filter((request) => request.path.includes('/production-context?'));
const texts = (selector: string) => all(selector).map((element) => element.textContent?.trim());

function expectNoClaimsOrActions() {
  const section = q('[data-testid="validation-run-panel"]')?.closest('section') ?? null;
  expect(section).not.toBeNull();
  const clone = section?.cloneNode(true) as HTMLElement;
  // The permanent qualifier and boundary name what a run is not; stored details are data.
  for (const text of claimTexts(clone)) {
    const scan = text.split(TECHNICAL_QUALIFIER).join(' | ').split(VALIDATION_BOUNDARY).join(' | ');
    expect(scan).not.toMatch(FORBIDDEN_STATES);
    expect(scan).not.toMatch(/READY_FOR_SIGNER|G1 PASS|APPROVED/);
  }
  const actions = [...(section?.querySelectorAll('button, a') ?? [])].map(
    (element) => element.textContent?.trim() ?? '',
  );
  expect(actions.filter((label) => FORBIDDEN_ACTIONS.test(label))).toEqual([]);
  for (const request of api_.requests) expect(request.path.startsWith('/api/v1/')).toBe(true);
}

function outcomeOf(
  result: ValidationOutcome['result'],
  issues: ValidationOutcome['issues'],
  notExecuted: string[] = [],
): ValidationOutcome {
  return {
    result,
    coverageManifest: {
      requiredRuleIds: TECHNICAL_RULE_IDS,
      executedRuleIds: TECHNICAL_RULE_IDS.filter((id) => !notExecuted.includes(id)),
      notExecutedRuleIds: notExecuted,
      semanticReviewRequired: true,
    },
    issues,
  };
}

describe('P4G technical validation on the candidate page', () => {
  it('before a run: the boundary, the exact artifact SHA-256, task, prompt mode and ruleset are shown; the digest is not read and nothing is written until asked', async () => {
    api_ = new FakeDirectory();
    const w = world(api_);
    const { candidate } = await initialCandidate(api_, w);
    await openCandidate(w.caseA.id, candidate.id);
    expect(q('[data-testid="validation-boundary"]')?.textContent).toBe(VALIDATION_BOUNDARY);
    expect(q('[data-testid="validation-artifact-sha256"]')?.textContent).toBe(
      candidate['artifactSha256'],
    );
    expect(q('[data-testid="validation-prompt-mode"]')?.textContent).toContain('(DRAFTING)');
    expect(q('[data-testid="validation-ruleset"]')?.textContent).toBe('TB-TECHNICAL-RULESET-v1');
    expect(q('[data-testid="validation-expected"]')?.textContent).toContain('(INITIAL)');
    expect(q('[data-testid="validation-digest-unread"]')?.textContent).toBe('Not read yet');
    expect(q('[data-testid="validation-run-button"]')).toBeNull();
    await until('No validation run is recorded for this candidate.');
    expect(contextReads()).toEqual([]);
    expect(api_.writes()).toEqual([]);
    expectNoClaimsOrActions();
  });

  it('a run is recorded against exactly the read: the shown artifact and the read digest; TECHNICAL PASS with its qualifier and the full coverage manifest; focus on the result; the run is listed', async () => {
    api_ = new FakeDirectory();
    const w = world(api_);
    const { candidate } = await initialCandidate(api_, w);
    await openCandidate(w.caseA.id, candidate.id);
    await readContext();
    expect(q('[data-testid="validation-current-digest"]')?.textContent).toBe(DIGEST_READ);
    expect(document.activeElement).toBe(q('[data-testid="validation-outcome"]'));
    const [read] = contextReads();
    const query = new URL(read?.path ?? '', 'http://app.invalid').searchParams;
    expect([...query.entries()]).toEqual([
      ['taskType', 'INITIAL'],
      ['generationMode', 'DRAFTING'],
      ['authoritySelectionId', w.selection.id],
    ]);
    expect(q('[data-testid="validation-run-button"]')?.textContent).toBe(RUN_VALIDATION_LABEL);
    await runValidation();
    await waitFor(() => q('[data-testid="validation-result"]') !== null, 'the result');
    const [post] = runRequests(candidate.id);
    expect(post?.body).toEqual({
      expectedArtifactSha256: candidate['artifactSha256'],
      expectedDependencyDigest: DIGEST_READ,
    });
    expect(ValidateCandidateSchema.safeParse(post?.body).success).toBe(true);
    expect(post?.headers['Idempotency-Key']).toBeTruthy();
    expect(post?.headers['If-Match']).toBeUndefined();
    expect(q('[data-testid="validation-result-label"]')?.textContent).toBe('TECHNICAL PASS');
    expect(q('[data-testid="validation-qualifier"]')?.textContent).toBe(
      'Technical checks only. This is not G1–G6 review, legal approval, readiness, signature, or permission to send.',
    );
    expect(q('[data-testid="validation-result-digest"]')?.textContent).toBe(DIGEST_READ);
    expect(texts('[data-testid="validation-required-rules"] li')).toEqual([...TECHNICAL_RULE_IDS]);
    expect(texts('[data-testid="validation-executed-rules"] li')).toEqual([...TECHNICAL_RULE_IDS]);
    expect(q('[data-testid="validation-not-executed-rules"]')?.textContent).toBe('None');
    expect(q('[data-testid="validation-semantic-review"]')?.textContent).toBe(
      'Yes — this run performed no G1–G6 or legal review',
    );
    await waitFor(() => q('[data-testid="validation-no-issues"]') !== null, 'the issues');
    expect(document.activeElement).toBe(q('[data-testid="validation-result-heading"]'));
    await waitFor(() => all('[data-testid="validation-history-run"]').length === 1, 'the history');
    expect(texts('[data-testid="validation-history-result"]')).toEqual(['TECHNICAL PASS']);
    // The fake's stored run and the page's lists are contract-shaped.
    const [stored] = api_.validationRuns;
    expect(ValidationRunSchema.safeParse(stored).success).toBe(true);
    const list = api_.requests.filter((request) =>
      request.path.startsWith(`/api/v1/candidates/${candidate.id}/validation-runs?`),
    );
    expect(list.length).toBeGreaterThan(0);
    expectNoClaimsOrActions();
  });

  it('a reply prompt: the read names exactly its parent and the prior bindings of its frozen manifest', async () => {
    api_ = new FakeDirectory();
    const w = world(api_);
    const replyContext = {
      taskType: 'NMI_REPLY' as const,
      parentBindingId: w.nmi.id,
      priorCorrespondenceIds: [w.outbound.id],
    };
    const promptView = {
      ...viewOf(w, DIGEST_READ, replyContext),
      dependencies: [
        { entityType: 'CorrespondenceBinding', entityId: w.nmi.id, fingerprint: 'e'.repeat(64) },
        { entityType: 'CorrespondenceBinding', entityId: w.asSent.id, fingerprint: 'e'.repeat(64) },
        { entityType: 'CaseRecord', entityId: w.caseA.id, fingerprint: 'e'.repeat(64) },
      ],
    };
    const prompt = await seedPrompt(api_, promptView);
    const candidate = await api_.seedCandidate({
      caseId: w.caseA.id,
      promptSnapshotId: prompt.id,
      taskType: 'NMI_REPLY',
      envelopeJson: { from: SENDER, to: SENDER, replyTo: null, parentBindingId: w.nmi.id },
    });
    api_.contextReplies.set(w.caseA.id, answer(viewOf(w, DIGEST_READ, replyContext)));
    await openCandidate(w.caseA.id, candidate.id);
    await readContext();
    const query = new URL(contextReads()[0]?.path ?? '', 'http://app.invalid').searchParams;
    expect(query.get('taskType')).toBe('NMI_REPLY');
    expect(query.get('parentBindingId')).toBe(w.nmi.id);
    expect(query.getAll('priorBindingIds')).toEqual([w.asSent.id]);
    await runValidation();
    await waitFor(() => q('[data-testid="validation-result"]') !== null, 'the result');
    expect(api_.validationRuns).toHaveLength(1);
  });

  it('BLOCKED lists the technical blockers; deterministic checks and heuristic signals are shown apart; not-executed rules are visible', async () => {
    api_ = new FakeDirectory();
    const w = world(api_);
    const { candidate } = await initialCandidate(api_, w);
    api_.validationOutcome = outcomeOf(
      'BLOCKED',
      [
        {
          ruleId: 'SIGNATURE.PENDING_SLOT_ONCE',
          checkKind: 'DETERMINISTIC',
          severity: 'BLOCKER',
          fieldPath: 'bodyText',
          message: 'The body contains the pending signer slot 2 times; exactly one is expected.',
          details: { occurrences: 2 },
        },
        {
          ruleId: 'WORDING.ATTACHMENT_CLAIM',
          checkKind: 'HEURISTIC',
          severity: 'REVIEW_REQUIRED',
          fieldPath: 'bodyText',
          message:
            'SYNTHETIC attachment wording signal. (Heuristic signal, not a finding about the text.)',
        },
        {
          ruleId: 'ARTIFACT.BODY_SHA256',
          checkKind: 'DETERMINISTIC',
          severity: 'REVIEW_REQUIRED',
          message: 'The rule was not executed: SYNTHETIC. It is not passed.',
          details: { outcome: 'NOT_EXECUTED' },
        },
      ],
      ['ARTIFACT.BODY_SHA256'],
    );
    await openCandidate(w.caseA.id, candidate.id);
    await readContext();
    await runValidation();
    await waitFor(() => all('[data-testid="validation-issue"]').length === 3, 'the issues');
    expect(q('[data-testid="validation-result-label"]')?.textContent).toBe('BLOCKED');
    expect(q('[data-testid="validation-qualifier"]')?.textContent).toBe(TECHNICAL_QUALIFIER);
    expect(q('[data-testid="validation-result-meaning"]')?.textContent).toMatch(
      /Technical blockers were found/,
    );
    const rows = all('[data-testid="validation-issue"]').map((row) => [
      row.querySelector('td code')?.textContent,
      row.querySelector('[data-testid="validation-issue-kind"]')?.textContent,
      row.querySelector('[data-testid="validation-issue-severity"]')?.textContent,
      row.querySelectorAll('td')[3]?.textContent,
    ]);
    expect(rows).toEqual([
      ['SIGNATURE.PENDING_SLOT_ONCE', 'Deterministic check', 'Blocker', 'bodyText'],
      ['WORDING.ATTACHMENT_CLAIM', 'Heuristic signal', 'Review required', 'bodyText'],
      ['ARTIFACT.BODY_SHA256', 'Deterministic check', 'Review required', 'None'],
    ]);
    const heuristic = all('[data-testid="validation-issue"]')[1];
    expect(heuristic?.className).toContain('issue-heuristic');
    expect(heuristic?.textContent).toContain('not a finding about what the text means');
    expect(texts('[data-testid="validation-not-executed-rules"] li')).toEqual([
      'ARTIFACT.BODY_SHA256',
    ]);
    expect(texts('[data-testid="validation-executed-rules"] li')).toHaveLength(28);
    expectNoClaimsOrActions();
  });

  it('REVIEW REQUIRED says why; ERROR shows only the safe diagnostic', async () => {
    api_ = new FakeDirectory();
    const w = world(api_);
    const { candidate } = await initialCandidate(api_, w);
    api_.validationOutcome = outcomeOf('REVIEW_REQUIRED', [
      {
        ruleId: 'MARKER.GATE_LABELS',
        checkKind: 'HEURISTIC',
        severity: 'REVIEW_REQUIRED',
        fieldPath: 'bodyText',
        message: 'SYNTHETIC gate label signal. (Heuristic signal.)',
      },
    ]);
    await openCandidate(w.caseA.id, candidate.id);
    await readContext();
    await runValidation();
    await waitFor(() => all('[data-testid="validation-issue"]').length === 1, 'the issue');
    expect(q('[data-testid="validation-result-label"]')?.textContent).toBe('REVIEW REQUIRED');
    expect(q('[data-testid="validation-result-meaning"]')?.textContent).toMatch(
      /issues a person must review/,
    );
    await unmount();
    api_.validationOutcome = outcomeOf(
      'ERROR',
      [
        {
          ruleId: 'ENVELOPE.SENDER',
          checkKind: 'DETERMINISTIC',
          severity: 'BLOCKER',
          message:
            'The rule could not be completed: an internal error occurred while it ran. It produced no finding and is not passed; the run result is ERROR, and nothing about the candidate follows from it.',
          details: { outcome: 'ERROR', errorName: 'TypeError' },
        },
      ],
      ['ENVELOPE.SENDER'],
    );
    await openCandidate(w.caseA.id, candidate.id);
    await readContext();
    await runValidation();
    await waitFor(() => all('[data-testid="validation-issue"]').length === 1, 'the diagnostic');
    expect(q('[data-testid="validation-result-label"]')?.textContent).toBe('ERROR');
    expect(q('[data-testid="validation-result-meaning"]')?.textContent).toMatch(
      /nothing about the candidate follows from this run/,
    );
    expect(q('[data-testid="validation-issues"]')?.textContent).toContain(
      '"errorName": "TypeError"',
    );
    expect(texts('[data-testid="validation-not-executed-rules"] li')).toEqual(['ENVELOPE.SENDER']);
    await waitFor(() => all('[data-testid="validation-history-run"]').length === 2, 'the history');
    expect(texts('[data-testid="validation-history-result"]')).toEqual([
      'ERROR',
      'REVIEW REQUIRED',
    ]);
  });

  it('a changed context (412) is shown exactly: no run recorded, only a new read offered, never retried; the next run uses the new read', async () => {
    api_ = new FakeDirectory();
    const w = world(api_);
    const { candidate } = await initialCandidate(api_, w);
    await openCandidate(w.caseA.id, candidate.id);
    await readContext();
    // Recorded context changes after the read (e.g. an authority event).
    api_.contextReplies.set(w.caseA.id, answer(viewOf(w, DIGEST_LATER)));
    await runValidation();
    await waitFor(() => q('[data-testid="validation-context-changed"]') !== null, 'the refusal');
    expect(q('[data-testid="validation-context-changed"] strong')?.textContent).toBe(
      VALIDATION_CONTEXT_CHANGED,
    );
    expect(VALIDATION_CONTEXT_CHANGED).toBe(
      'Context changed. Read the current context before validating again.',
    );
    expect(q('[data-testid="validation-context-changed"]')?.textContent).toContain(
      'No validation run was recorded.',
    );
    expect(q('[data-testid="validation-run-button"]')).toBeNull();
    expect(q('[data-testid="validation-read-context"]')).not.toBeNull();
    expect(document.activeElement).toBe(q('[data-testid="validation-outcome"]'));
    // The earlier read's digest is no longer shown as the current one.
    expect(q('[data-testid="validation-current-digest"]')).toBeNull();
    expect(q('[data-testid="validation-expected"]')?.textContent).not.toContain(DIGEST_READ);
    expect(q('[data-testid="validation-digest-stale"]')?.textContent).toBe(VALIDATION_DIGEST_STALE);
    expect(runRequests(candidate.id)).toHaveLength(1);
    expect(api_.validationRuns).toEqual([]);
    await readContext();
    expect(q('[data-testid="validation-digest-stale"]')).toBeNull();
    expect(q('[data-testid="validation-current-digest"]')?.textContent).toBe(DIGEST_LATER);
    await runValidation();
    await waitFor(() => q('[data-testid="validation-result"]') !== null, 'the result');
    expect(runRequests(candidate.id).map((request) => request.body)).toEqual([
      {
        expectedArtifactSha256: candidate['artifactSha256'],
        expectedDependencyDigest: DIGEST_READ,
      },
      {
        expectedArtifactSha256: candidate['artifactSha256'],
        expectedDependencyDigest: DIGEST_LATER,
      },
    ]);
    expect(api_.validationRuns).toHaveLength(1);
  });

  it('an artifact that is not the shown one (412) is shown with its own message; neither a run nor a read is offered', async () => {
    api_ = new FakeDirectory();
    const w = world(api_);
    const { candidate } = await initialCandidate(api_, w);
    await openCandidate(w.caseA.id, candidate.id);
    await readContext();
    candidate['artifactSha256'] = 'f'.repeat(64);
    await runValidation();
    await waitFor(() => q('[data-testid="validation-artifact-changed"]') !== null, 'the refusal');
    expect(q('[data-testid="validation-artifact-changed"] strong')?.textContent).toBe(
      VALIDATION_ARTIFACT_CHANGED,
    );
    expect(q('[data-testid="validation-run-button"]')).toBeNull();
    expect(q('[data-testid="validation-read-context"]')).toBeNull();
    expect(api_.validationRuns).toEqual([]);
  });

  it('a lost reply is replayed with the same Idempotency-Key into the one recorded run', async () => {
    api_ = new FakeDirectory();
    const w = world(api_);
    const { candidate } = await initialCandidate(api_, w);
    await openCandidate(w.caseA.id, candidate.id);
    await readContext();
    api_.loseNextReply = true;
    await runValidation();
    await waitFor(
      () => q('[data-testid="validation-outcome"] [role="alert"]') !== null,
      'the error',
    );
    expect(api_.validationRuns).toHaveLength(1);
    await runValidation();
    await waitFor(() => q('[data-testid="validation-result"]') !== null, 'the result');
    const keys = runRequests(candidate.id).map((request) => request.headers['Idempotency-Key']);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(1);
    expect(api_.validationRuns).toHaveLength(1);
    expect(q('[data-testid="validation-result"]')?.textContent).toContain(
      api_.validationRuns[0]?.id,
    );
  });

  it('runs stay listed after supersession, which the section states; another candidate never shows them', async () => {
    api_ = new FakeDirectory();
    const w = world(api_);
    const { candidate, prompt } = await initialCandidate(api_, w);
    await openCandidate(w.caseA.id, candidate.id);
    await readContext();
    await runValidation();
    await waitFor(() => all('[data-testid="validation-history-run"]').length === 1, 'the history');
    await unmount();
    candidate['supersededAt'] = NOW;
    candidate['supersedeReason'] = 'SYNTHETIC superseded';
    await openCandidate(w.caseA.id, candidate.id);
    expect(q('[data-testid="validation-superseded"]')?.textContent).toMatch(
      /checks this exact historical artifact only/,
    );
    await waitFor(() => all('[data-testid="validation-history-run"]').length === 1, 'the history');
    await unmount();
    // Another candidate of the same case and another case's candidate: no run of the first.
    const second = await api_.seedCandidate({
      caseId: w.caseA.id,
      promptSnapshotId: prompt.id,
      subject: 'SYNTHETIC second',
    });
    const promptB = await seedPrompt(api_, viewOf(w, DIGEST_READ, {}, w.caseB.id), {
      caseId: w.caseB.id,
    });
    const other = await api_.seedCandidate({ caseId: w.caseB.id, promptSnapshotId: promptB.id });
    for (const [caseId, id] of [
      [w.caseA.id, second.id],
      [w.caseB.id, other.id],
    ] as const) {
      await openCandidate(caseId, id);
      await until('No validation run is recorded for this candidate.');
      const listed = api_.requests.filter((request) => request.path.includes('/validation-runs'));
      expect(listed.at(-1)?.path.startsWith(`/api/v1/candidates/${id}/validation-runs`)).toBe(true);
      await unmount();
    }
    // Case B's page for case A's candidate shows it like an unknown one: no validation section,
    // and nothing of that candidate's validation is requested.
    const runListsOf = () =>
      api_.requests.filter((request) =>
        request.path.startsWith(`/api/v1/candidates/${candidate.id}/validation-runs`),
      ).length;
    const before = runListsOf();
    await render(api_, `/cases/${w.caseB.id}/candidates/${candidate.id}`);
    await waitFor(() => q('[data-testid="candidate-not-found"]') !== null, 'the unknown candidate');
    expect(q('[data-testid="validation-run-panel"]')).toBeNull();
    expect(runListsOf()).toBe(before);
  });

  it('the issues of a run are paged through, in reported order', async () => {
    api_ = new FakeDirectory();
    const w = world(api_);
    const { candidate } = await initialCandidate(api_, w);
    api_.validationOutcome = outcomeOf(
      'REVIEW_REQUIRED',
      Array.from({ length: 150 }, (_, index) => ({
        ruleId: 'CONTEXT.PROMPT_DRIFT',
        checkKind: 'DETERMINISTIC' as const,
        severity: 'REVIEW_REQUIRED' as const,
        fieldPath: `dependencyManifest.SYNTHETIC:${String(index).padStart(3, '0')}`,
        message: `SYNTHETIC drift ${index}`,
      })),
    );
    await openCandidate(w.caseA.id, candidate.id);
    await readContext();
    await runValidation();
    await waitFor(() => all('[data-testid="validation-issue"]').length === 150, 'every issue');
    const fields = all('[data-testid="validation-issue"]').map(
      (row) => row.querySelectorAll('td')[3]?.textContent,
    );
    expect(fields[0]).toBe('dependencyManifest.SYNTHETIC:000');
    expect(fields[149]).toBe('dependencyManifest.SYNTHETIC:149');
    const [run] = api_.validationRuns;
    const pages = api_.requests.filter((request) =>
      request.path.startsWith(`/api/v1/validation-runs/${run?.id}/issues?`),
    );
    // Every page is requested with the maximum limit, following the cursor (StrictMode may repeat a load).
    const params = pages.map((request) => new URL(request.path, 'http://x').searchParams);
    expect([...new Set(params.map((query) => query.get('cursor')))]).toEqual([null, 'p100']);
    expect(new Set(params.map((query) => query.get('limit')))).toEqual(new Set(['100']));
    for (const issue of api_.validationIssues.get(run?.id ?? '') ?? []) {
      expect(ValidationIssueSchema.safeParse(issue).success).toBe(true);
    }
    const summaries = await api_.fetch(`/api/v1/candidates/${candidate.id}/validation-runs`, {});
    const page = (await summaries.json()) as { data: { items: unknown[] } };
    for (const item of page.data.items) {
      expect(ValidationRunSummarySchema.strict().safeParse(item).success).toBe(true);
    }
  });

  it('an archived case: the run is inert with its reason; recorded runs stay listed; nothing is read or written', async () => {
    api_ = new FakeDirectory();
    const w = world(api_);
    const { candidate } = await initialCandidate(api_, w);
    await openCandidate(w.caseA.id, candidate.id);
    await readContext();
    await runValidation();
    await waitFor(() => all('[data-testid="validation-history-run"]').length === 1, 'the history');
    await unmount();
    w.caseA['archivedAt'] = NOW;
    const writes = api_.writes().length;
    const reads = contextReads().length;
    await render(api_, `/cases/${w.caseA.id}/candidates/${candidate.id}`);
    await waitFor(() => all('[data-testid="validation-history-run"]').length === 1, 'the history');
    const inert = all('article.sheet [aria-disabled="true"]').map((action) => action.textContent);
    expect(inert[0]).toBe(RUN_VALIDATION_LABEL);
    expect(q('[data-testid="validation-read-context"]')).toBeNull();
    expect(api_.writes()).toHaveLength(writes);
    expect(contextReads()).toHaveLength(reads);
  });
});
