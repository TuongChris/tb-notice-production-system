// Technical ruleset TB-TECHNICAL-RULESET-v1 (P4G) without a database: the pinned inventory, every
// rule on its own with exact synthetic inputs (the P4E context fixtures, cloned and adjusted), the
// executed / not-executed / error accounting, the deterministic result aggregation, the separation
// of deterministic checks and heuristic signals, the exact hashes (against the frozen reference
// helper), the pending signature slot, the envelope, thread and document-plan rules, the internal
// markers (kept in step with the rendered prompt), the recorded gaps and conflicts, drift from the
// prompt snapshot, and the sources of the validation module: no clock, randomness, network or AI
// provider. The database behaviour is covered over HTTP in tests/db/p4g-http.test.ts.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ContextView, Dependency } from '../../packages/contracts/src/index.js';
import { PENDING_SIGNATURE } from '../../apps/api/src/infrastructure/integrity/tb-canonical-json.js';
import {
  candidateArtifact,
  candidateArtifactSha256,
  type StoredDocumentPlan,
  type StoredEnvelope,
} from '../../apps/api/src/modules/candidates/candidate-artifact.js';
import { renderPrompt } from '../../apps/api/src/modules/prompts/prompt-renderer.js';
import {
  DECLARATION_PLACEHOLDER,
  evaluateCandidate,
  PROMPT_STRUCTURE_MARKERS,
  REQUIRED_RULES,
  RULE_ERROR_MESSAGE,
  TECHNICAL_RULES,
  TECHNICAL_RULESET_VERSION,
  type Evaluation,
  type PlanSourceRecord,
  type TechnicalRule,
  type ValidationInput,
} from '../../apps/api/src/modules/validation/technical-ruleset.js';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const FROZEN_HELPER = path.join(
  repoRoot,
  'docs/reference/database-api-v1/TB_DATABASE_SCHEMA_API_CONTRACT_v1/contracts/consistency-reference.mjs',
);
const VALIDATION_MODULE = path.join(repoRoot, 'apps/api/src/modules/validation');

interface FrozenHelper {
  readonly PENDING_SIGNATURE: string;
  canonicalSha256(value: unknown): string;
  exactTextSha256(value: string): string;
}
const frozen = (await import(pathToFileURL(FROZEN_HELPER).href)) as FrozenHelper;

const fixtures = JSON.parse(
  readFileSync(path.join(import.meta.dirname, 'fixtures/p4e-prompt-contexts.json'), 'utf8'),
) as { initial: ContextView; reply: ContextView; replyDrafting: ContextView };

const CANDIDATE_ID = '99999999-9999-4999-8999-999999999999';
const PROMPT_ID = '88888888-8888-4888-8888-888888888888';
const OTHER_ID = '77777777-7777-4777-8777-777777777777';
const PROMPT_SHA = 'c'.repeat(64);
const HASH_A = 'a'.repeat(64);
const SENDER = 'synthetic-sender@example.invalid';
const PLATFORM = 'synthetic-platform@example.invalid';
const SIGNER = 'SYNTHETIC A Signer Person';

/** The pinned inventory of TB-TECHNICAL-RULESET-v1 (kind D = DETERMINISTIC, H = HEURISTIC). */
const INVENTORY = [
  ['ARTIFACT.TEXT_EXACT', 'D'],
  ['ARTIFACT.SHAPE', 'D'],
  ['ARTIFACT.BODY_SHA256', 'D'],
  ['ARTIFACT.ARTIFACT_SHA256', 'D'],
  ['ARTIFACT.SIGNATURE_STATE', 'D'],
  ['SIGNATURE.PENDING_SLOT_ONCE', 'D'],
  ['SIGNATURE.SLOT_LOOKALIKE', 'H'],
  ['SIGNATURE.ADOPTION_WORDING', 'H'],
  ['SIGNATURE.NAME_AFTER_SLOT', 'H'],
  ['ENVELOPE.PROMPT_CASE_TASK', 'D'],
  ['ENVELOPE.THREAD', 'D'],
  ['ENVELOPE.SENDER', 'D'],
  ['ENVELOPE.REPLY_RECIPIENT', 'D'],
  ['PLAN.SOURCE_EXISTS', 'D'],
  ['PLAN.SOURCE_APPLIES', 'D'],
  ['PLAN.SOURCE_IN_CONTEXT', 'D'],
  ['PLAN.SOURCE_LATEST_REVISION', 'D'],
  ['PLAN.CONTENT_SHA256', 'D'],
  ['PLAN.PREVIOUSLY_SUPPLIED', 'D'],
  ['WORDING.ATTACHMENT_CLAIM', 'H'],
  ['MARKER.DECLARATION_PLACEHOLDER', 'D'],
  ['MARKER.INPUT_PLACEHOLDERS', 'D'],
  ['MARKER.PROMPT_STRUCTURE', 'D'],
  ['MARKER.INTERNAL_IDENTIFIERS', 'D'],
  ['MARKER.GATE_LABELS', 'H'],
  ['CONTEXT.GENERATION_MODE', 'D'],
  ['CONTEXT.MISSING', 'D'],
  ['CONTEXT.CONFLICTS', 'D'],
  ['CONTEXT.PROMPT_DRIFT', 'D'],
] as const;
const kindOf = (letter: 'D' | 'H') => (letter === 'D' ? 'DETERMINISTIC' : 'HEURISTIC');

/** A synthetic context of `fixture` with no recorded gap or conflict, in DRAFTING mode. */
function cleanView(fixture: 'initial' | 'reply' = 'initial'): ContextView {
  const view = structuredClone(fixture === 'initial' ? fixtures.initial : fixtures.replyDrafting);
  view.context.generationMode = 'DRAFTING';
  view.context.missing = [];
  view.context.conflicts = [];
  return view;
}

const sourceIdsOf = (view: ContextView) =>
  view.dependencies
    .filter((dependency) => dependency.entityType === 'SourceReference')
    .map((dependency) => dependency.entityId);

function plan(sourceId: string, overrides: Partial<StoredDocumentPlan> = {}): StoredDocumentPlan {
  return {
    sourceId,
    purpose: 'SYNTHETIC purpose of the planned document',
    state: 'REFERENCE_ONLY',
    fileName: null,
    contentSha256: null,
    disclosureReview: 'PENDING',
    limitations: null,
    ...overrides,
  };
}

const BODY = `SYNTHETIC notice body.\nI, ${SIGNER}, act for the recorded agency.\n\nSincerely,\n${PENDING_SIGNATURE}\n`;

interface Draft {
  subject?: string;
  bodyText?: string;
  envelope?: StoredEnvelope;
  preparedDocuments?: StoredDocumentPlan[];
}

interface Build {
  view?: ContextView;
  draft?: Draft;
  /** Override stored values after the hashes were computed (integrity injections). */
  stored?: Partial<ValidationInput['candidate']>;
  prompt?: Partial<ValidationInput['prompt']>;
  planSources?: Map<string, PlanSourceRecord | null>;
  parentCorrespondenceId?: string | null;
}

/** A clean, hash-consistent candidate of the view's case and task, with its prompt and inputs. */
function inputOf(build: Build = {}): ValidationInput {
  const view = build.view ?? cleanView();
  const reply = view.context.taskType === 'NMI_REPLY';
  const parent = reply ? view.context.parentBindingId : null;
  const [firstSource] = sourceIdsOf(view);
  if (firstSource === undefined) throw new Error('the fixture has no source');
  const draft = {
    subject: build.draft?.subject ?? 'SYNTHETIC notice subject',
    bodyText: build.draft?.bodyText ?? BODY,
    envelope: build.draft?.envelope ?? {
      from: SENDER,
      to: reply ? 'synthetic-reply-here@example.invalid' : PLATFORM,
      replyTo: null,
      parentBindingId: parent,
    },
    preparedDocuments: build.draft?.preparedDocuments ?? [plan(firstSource)],
  };
  const planSources =
    build.planSources ??
    new Map(
      draft.preparedDocuments.map((entry) => [
        entry.sourceId,
        { id: entry.sourceId, contentSha256: null, headId: entry.sourceId, scopeProblem: null },
      ]),
    );
  return {
    candidate: {
      id: CANDIDATE_ID,
      caseId: view.context.caseId,
      taskType: view.context.taskType,
      subject: draft.subject,
      bodyText: draft.bodyText,
      bodySha256: frozen.exactTextSha256(draft.bodyText),
      artifactSha256: candidateArtifactSha256(draft),
      signatureState: 'HUMAN_PENDING',
      envelope: draft.envelope,
      preparedDocuments: draft.preparedDocuments,
      ...build.stored,
    },
    prompt: {
      id: PROMPT_ID,
      caseId: view.context.caseId,
      taskType: view.context.taskType,
      generationMode: 'DRAFTING',
      parentBindingId: parent,
      dependencyDigest: view.dependencyDigest,
      dependencyManifest: view.dependencies,
      promptSha256: PROMPT_SHA,
      ...build.prompt,
    },
    evaluated: view,
    parentCorrespondenceId:
      build.parentCorrespondenceId !== undefined
        ? build.parentCorrespondenceId
        : reply
          ? (view.context.correspondence.find(
              (message) => !view.context.priorCorrespondenceIds.includes(message.id),
            )?.id ?? null)
          : null,
    planSources,
  };
}

const findingsOf = (evaluation: Evaluation, ruleId: string) =>
  evaluation.findings.filter((item) => item.ruleId === ruleId);
/** [severity, fieldPath] of every finding of one rule. */
const shapeOf = (evaluation: Evaluation, ruleId: string) =>
  findingsOf(evaluation, ruleId).map((item) => [item.severity, item.fieldPath]);
const ruleIdsWithFindings = (evaluation: Evaluation) => [
  ...new Set(evaluation.findings.map((item) => item.ruleId)),
];

describe('the ruleset TB-TECHNICAL-RULESET-v1 — pinned inventory, coverage and aggregation', () => {
  it('is one identifier with a pinned inventory of 29 required rules; the implementations are exactly that inventory, in order, with the same kinds', () => {
    expect(TECHNICAL_RULESET_VERSION).toBe('TB-TECHNICAL-RULESET-v1');
    const pinned = INVENTORY.map(([id, kind]) => ({ id, checkKind: kindOf(kind) }));
    expect(REQUIRED_RULES).toEqual(pinned);
    expect(TECHNICAL_RULES.map((rule) => ({ id: rule.id, checkKind: rule.checkKind }))).toEqual(
      pinned,
    );
    expect(new Set(REQUIRED_RULES.map((rule) => rule.id)).size).toBe(29);
    for (const rule of TECHNICAL_RULES) {
      expect(rule.checks.length, rule.id).toBeGreaterThan(40);
      if (rule.checkKind === 'HEURISTIC') expect(rule.checks, rule.id).toMatch(/^Heuristic:/);
      else expect(rule.checks, rule.id).not.toMatch(/^Heuristic/);
    }
  });

  it('a clean candidate: every required rule executed, nothing found — TECHNICAL_PASS, no issue, semantic review still required', () => {
    const evaluation = evaluateCandidate(inputOf());
    expect(evaluation.result).toBe('TECHNICAL_PASS');
    expect(evaluation.findings).toEqual([]);
    expect(evaluation.counts).toEqual({ blocker: 0, reviewRequired: 0, warning: 0, info: 0 });
    expect(evaluation.rulesetVersion).toBe('TB-TECHNICAL-RULESET-v1');
    expect(evaluation.coverageManifest).toEqual({
      requiredRuleIds: INVENTORY.map(([id]) => id),
      executedRuleIds: INVENTORY.map(([id]) => id),
      notExecutedRuleIds: [],
      semanticReviewRequired: true,
    });
    expect(evaluation.records.every((record) => record.outcome === 'EXECUTED')).toBe(true);
  });

  it('is deterministic: the same input gives the same records, findings, coverage and result, and the input is not changed', () => {
    const input = inputOf({
      draft: { bodyText: `Please find attached.\nG2 [NEEDED: licence]\n${PENDING_SIGNATURE}` },
    });
    const before = structuredClone(input);
    const first = evaluateCandidate(input);
    const second = evaluateCandidate(input);
    expect(second).toEqual(first);
    expect(input).toEqual(before);
    expect(first.result).toBe('BLOCKED');
  });

  it('aggregation: ERROR before BLOCKED before REVIEW_REQUIRED before TECHNICAL_PASS; WARNING and INFO never change the result', () => {
    const rule = (id: string, check: TechnicalRule['check']): TechnicalRule => ({
      id,
      checkKind: 'DETERMINISTIC',
      checks: 'SYNTHETIC test rule',
      check,
    });
    const with_ = (severity: 'BLOCKER' | 'REVIEW_REQUIRED' | 'WARNING' | 'INFO') =>
      rule(`TEST.${severity}`, () => ({
        outcome: 'EXECUTED',
        findings: [{ severity, fieldPath: null, message: 'SYNTHETIC', details: null }],
      }));
    const failing = rule('TEST.ERROR', () => {
      throw new TypeError('SYNTHETIC private detail that must not be stored');
    });
    const run = (rules: TechnicalRule[]) =>
      evaluateCandidate(inputOf(), {
        rules,
        required: rules.map((entry) => ({ id: entry.id, checkKind: entry.checkKind })),
      });
    expect(run([with_('WARNING'), with_('INFO')]).result).toBe('TECHNICAL_PASS');
    expect(run([with_('WARNING'), with_('INFO')]).counts).toEqual({
      blocker: 0,
      reviewRequired: 0,
      warning: 1,
      info: 1,
    });
    expect(run([with_('REVIEW_REQUIRED'), with_('WARNING')]).result).toBe('REVIEW_REQUIRED');
    expect(run([with_('REVIEW_REQUIRED'), with_('BLOCKER')]).result).toBe('BLOCKED');
    const errored = run([with_('BLOCKER'), failing, with_('REVIEW_REQUIRED')]);
    expect(errored.result).toBe('ERROR');
    // The failing rule does not stop the others, and its diagnostic keeps only the error's name.
    expect(errored.records.map((record) => [record.ruleId, record.outcome])).toEqual([
      ['TEST.BLOCKER', 'EXECUTED'],
      ['TEST.ERROR', 'ERROR'],
      ['TEST.REVIEW_REQUIRED', 'EXECUTED'],
    ]);
    const diagnostic = findingsOf(errored, 'TEST.ERROR');
    expect(diagnostic).toEqual([
      {
        ruleId: 'TEST.ERROR',
        checkKind: 'DETERMINISTIC',
        severity: 'BLOCKER',
        fieldPath: null,
        message: RULE_ERROR_MESSAGE,
        details: { outcome: 'ERROR', errorName: 'TypeError' },
      },
    ]);
    expect(JSON.stringify(errored)).not.toContain('private detail');
    expect(errored.coverageManifest.notExecutedRuleIds).toEqual(['TEST.ERROR']);
  });

  it('NOT_EXECUTED is never passed: a rule that cannot run, a rule that is not run at all and a failing rule are listed as not executed, each with an issue', () => {
    const notRun: TechnicalRule = {
      id: 'TEST.NOT_EXECUTED',
      checkKind: 'DETERMINISTIC',
      checks: 'SYNTHETIC',
      check: () => ({ outcome: 'NOT_EXECUTED', reason: 'SYNTHETIC input unavailable.' }),
    };
    const evaluation = evaluateCandidate(inputOf(), {
      rules: [notRun],
      required: [
        { id: 'TEST.NOT_EXECUTED', checkKind: 'DETERMINISTIC' },
        { id: 'TEST.LEFT_OUT', checkKind: 'HEURISTIC' },
      ],
    });
    expect(evaluation.result).toBe('REVIEW_REQUIRED');
    expect(evaluation.coverageManifest).toEqual({
      requiredRuleIds: ['TEST.NOT_EXECUTED', 'TEST.LEFT_OUT'],
      executedRuleIds: [],
      notExecutedRuleIds: ['TEST.NOT_EXECUTED', 'TEST.LEFT_OUT'],
      semanticReviewRequired: true,
    });
    expect(evaluation.findings.map((item) => [item.ruleId, item.checkKind, item.severity])).toEqual(
      [
        ['TEST.NOT_EXECUTED', 'DETERMINISTIC', 'REVIEW_REQUIRED'],
        ['TEST.LEFT_OUT', 'HEURISTIC', 'REVIEW_REQUIRED'],
      ],
    );
    expect(evaluation.findings.map((item) => item.details)).toEqual([
      { outcome: 'NOT_EXECUTED' },
      { outcome: 'NOT_RUN' },
    ]);
    // A required rule of the ruleset left out of the implementations is caught the same way.
    const withoutSlot = evaluateCandidate(inputOf(), {
      rules: TECHNICAL_RULES.filter((rule) => rule.id !== 'SIGNATURE.PENDING_SLOT_ONCE'),
    });
    expect(withoutSlot.result).toBe('REVIEW_REQUIRED');
    expect(withoutSlot.coverageManifest.notExecutedRuleIds).toEqual([
      'SIGNATURE.PENDING_SLOT_ONCE',
    ]);
    // The application's test seam: a rule made to fail is an ERROR run, never a pass.
    const failed = evaluateCandidate(inputOf(), {
      beforeRule: (ruleId) => {
        if (ruleId === 'ENVELOPE.SENDER') throw new RangeError('SYNTHETIC');
      },
    });
    expect(failed.result).toBe('ERROR');
    expect(failed.coverageManifest.notExecutedRuleIds).toEqual(['ENVELOPE.SENDER']);
    expect(failed.coverageManifest.executedRuleIds).toHaveLength(28);
  });

  it('heuristic signals are never blockers and never labelled deterministic; every finding carries its rule’s inventory kind', () => {
    const view = cleanView('reply');
    const [source] = sourceIdsOf(view);
    const evaluation = evaluateCandidate(
      inputOf({
        view,
        draft: {
          subject: 'SYNTHETIC G1 subject — attachment: licence',
          bodyText: [
            'Please find attached the licence. The file is enclosed.',
            `/s/ ${SIGNER}`,
            'Electronically signed by the agency. Signature: done',
            '[PENDING SIGNER NAME]',
            'Gate 3 and G1–G6 were considered.',
            PENDING_SIGNATURE,
            SIGNER,
          ].join('\n'),
          preparedDocuments: [plan(source as string)],
        },
      }),
    );
    const heuristics = new Set(
      INVENTORY.filter(([, kind]) => kind === 'H').map(([id]) => id as string),
    );
    const found = ruleIdsWithFindings(evaluation);
    for (const id of heuristics) expect(found, id).toContain(id);
    for (const item of evaluation.findings) {
      const pinned = INVENTORY.find(([id]) => id === item.ruleId);
      expect(pinned, item.ruleId).toBeDefined();
      expect(item.checkKind, item.ruleId).toBe(kindOf((pinned as (typeof INVENTORY)[number])[1]));
      if (heuristics.has(item.ruleId)) {
        expect(['REVIEW_REQUIRED', 'WARNING'], item.ruleId).toContain(item.severity);
        expect(item.message, item.ruleId).toMatch(/[Hh]euristic signal/);
      }
    }
  });
});

describe('artifact integrity — exact bytes and hashes, recomputed and never repaired', () => {
  it('the body SHA-256 is recomputed over the exact UTF-8 bytes: a wrong stored hash is a BLOCKER naming both; CRLF, trailing spaces and decomposed letters are kept exactly', () => {
    for (const bodyText of [
      `line 1\r\nline 2\r\n${PENDING_SIGNATURE}`,
      `line 1\nline 2\n${PENDING_SIGNATURE}`,
      `Été trailing   \n${PENDING_SIGNATURE}`,
      `Été\n${PENDING_SIGNATURE}`,
    ]) {
      const clean = evaluateCandidate(inputOf({ draft: { bodyText } }));
      expect(findingsOf(clean, 'ARTIFACT.BODY_SHA256'), bodyText).toEqual([]);
    }
    const crlf = `line 1\r\n${PENDING_SIGNATURE}`;
    const lf = `line 1\n${PENDING_SIGNATURE}`;
    const wrong = evaluateCandidate(
      inputOf({ draft: { bodyText: crlf }, stored: { bodySha256: frozen.exactTextSha256(lf) } }),
    );
    expect(wrong.result).toBe('BLOCKED');
    expect(findingsOf(wrong, 'ARTIFACT.BODY_SHA256')).toEqual([
      expect.objectContaining({
        severity: 'BLOCKER',
        fieldPath: 'bodySha256',
        details: { stored: frozen.exactTextSha256(lf), recomputed: frozen.exactTextSha256(crlf) },
      }),
    ]);
    // NFC and NFD are different bodies with different hashes: nothing is normalized.
    expect(frozen.exactTextSha256('é')).not.toBe(frozen.exactTextSha256('é'));
  });

  it('the artifact SHA-256 is recomputed with TB-CANDIDATE-ARTIFACT-v1 (the frozen helper agrees): a wrong stored hash, or a reordered plan under the old hash, is a BLOCKER', () => {
    const view = cleanView();
    const [a, b] = sourceIdsOf(view);
    const plans = [plan(a as string), plan(b as string)];
    const input = inputOf({ view, draft: { preparedDocuments: plans } });
    expect(input.candidate.artifactSha256).toBe(
      frozen.canonicalSha256(
        candidateArtifact({
          subject: input.candidate.subject,
          bodyText: input.candidate.bodyText,
          envelope: input.candidate.envelope as StoredEnvelope,
          preparedDocuments: plans,
        }),
      ),
    );
    expect(findingsOf(evaluateCandidate(input), 'ARTIFACT.ARTIFACT_SHA256')).toEqual([]);
    const reordered = evaluateCandidate(
      inputOf({
        view,
        draft: { preparedDocuments: [...plans].reverse() },
        stored: { artifactSha256: input.candidate.artifactSha256 },
      }),
    );
    expect(shapeOf(reordered, 'ARTIFACT.ARTIFACT_SHA256')).toEqual([['BLOCKER', 'artifactSha256']]);
    const wrong = evaluateCandidate(inputOf({ stored: { artifactSha256: HASH_A } }));
    expect(findingsOf(wrong, 'ARTIFACT.ARTIFACT_SHA256')[0]?.details).toEqual({
      stored: HASH_A,
      recomputed: inputOf().candidate.artifactSha256,
    });
    expect(wrong.result).toBe('BLOCKED');
  });

  it('text that import refuses (a NUL, an unpaired surrogate) is a BLOCKER at its field, and the two hashes are then NOT_EXECUTED — listed, never passed', () => {
    const nul = evaluateCandidate(
      inputOf({ stored: { bodyText: `SYNTHETIC\u0000body\n${PENDING_SIGNATURE}` } }),
    );
    expect(shapeOf(nul, 'ARTIFACT.TEXT_EXACT')).toEqual([['BLOCKER', 'bodyText']]);
    expect(nul.coverageManifest.notExecutedRuleIds).toEqual([
      'ARTIFACT.BODY_SHA256',
      'ARTIFACT.ARTIFACT_SHA256',
    ]);
    expect(nul.result).toBe('BLOCKED');
    expect(findingsOf(nul, 'ARTIFACT.BODY_SHA256')).toEqual([
      expect.objectContaining({
        severity: 'REVIEW_REQUIRED',
        details: { outcome: 'NOT_EXECUTED' },
      }),
    ]);
    const envelope = {
      from: SENDER,
      to: PLATFORM,
      replyTo: 'x\uD800@example.invalid',
      parentBindingId: null,
    };
    const surrogate = evaluateCandidate(inputOf({ stored: { envelope } }));
    expect(shapeOf(surrogate, 'ARTIFACT.TEXT_EXACT')).toEqual([['BLOCKER', 'envelope.replyTo']]);
    expect(findingsOf(surrogate, 'ARTIFACT.TEXT_EXACT')[0]?.details).toEqual({
      problem: 'UNPAIRED_SURROGATE',
    });
  });

  it('the stored shape is re-validated against the contract: lengths in code points, formats, at most 100 plans, no other key — and no ACTUALLY_ATTACHED state', () => {
    const astral = '🎵'.repeat(998);
    expect(
      findingsOf(evaluateCandidate(inputOf({ draft: { subject: astral } })), 'ARTIFACT.SHAPE'),
    ).toEqual([]);
    const tooLong = evaluateCandidate(inputOf({ stored: { subject: 'x'.repeat(999) } }));
    expect(shapeOf(tooLong, 'ARTIFACT.SHAPE')).toEqual([['BLOCKER', 'subject']]);
    const view = cleanView();
    const [source] = sourceIdsOf(view);
    const attached = evaluateCandidate(
      inputOf({
        view,
        stored: {
          preparedDocuments: [{ ...plan(source as string), state: 'ACTUALLY_ATTACHED' }],
        },
      }),
    );
    expect(shapeOf(attached, 'ARTIFACT.SHAPE')).toEqual([['BLOCKER', 'preparedDocuments.0.state']]);
    expect(findingsOf(attached, 'ARTIFACT.SHAPE')[0]?.message).toMatch(
      /ACTUALLY_ATTACHED does not exist/,
    );
    const extra = evaluateCandidate(
      inputOf({
        stored: {
          envelope: {
            from: SENDER,
            to: PLATFORM,
            replyTo: null,
            parentBindingId: null,
            signedBy: 'x',
          },
        },
      }),
    );
    expect(findingsOf(extra, 'ARTIFACT.SHAPE').map((item) => item.severity)).toEqual(['BLOCKER']);
    const email = evaluateCandidate(
      inputOf({
        stored: {
          envelope: { from: 'not an address', to: PLATFORM, replyTo: null, parentBindingId: null },
        },
      }),
    );
    expect(shapeOf(email, 'ARTIFACT.SHAPE')).toEqual([['BLOCKER', 'envelope.from']]);
    const many = evaluateCandidate(
      inputOf({
        view,
        stored: { preparedDocuments: Array.from({ length: 101 }, () => plan(source as string)) },
      }),
    );
    expect(shapeOf(many, 'ARTIFACT.SHAPE')).toEqual([['BLOCKER', 'preparedDocuments']]);
  });

  it('the signature state is HUMAN_PENDING only: any other stored state is a BLOCKER; nothing signs', () => {
    expect(findingsOf(evaluateCandidate(inputOf()), 'ARTIFACT.SIGNATURE_STATE')).toEqual([]);
    const signed = evaluateCandidate(inputOf({ stored: { signatureState: 'SIGNED' } }));
    expect(shapeOf(signed, 'ARTIFACT.SIGNATURE_STATE')).toEqual([['BLOCKER', 'signatureState']]);
    expect(signed.result).toBe('BLOCKED');
  });
});

describe('the pending signature slot — exactly one exact token; a name elsewhere is not a signature', () => {
  const slotBody = (count: number) =>
    `SYNTHETIC body\n${Array.from({ length: count }, () => PENDING_SIGNATURE).join('\n')}\n`;

  it('zero is a BLOCKER, one passes, two are a BLOCKER listing both, the slot in the subject is a BLOCKER', () => {
    const zero = evaluateCandidate(inputOf({ draft: { bodyText: slotBody(0) } }));
    expect(findingsOf(zero, 'SIGNATURE.PENDING_SLOT_ONCE')).toEqual([
      expect.objectContaining({
        severity: 'BLOCKER',
        fieldPath: 'bodyText',
        details: { occurrences: 0 },
      }),
    ]);
    expect(zero.result).toBe('BLOCKED');
    expect(evaluateCandidate(inputOf({ draft: { bodyText: slotBody(1) } })).result).toBe(
      'TECHNICAL_PASS',
    );
    const two = evaluateCandidate(inputOf({ draft: { bodyText: slotBody(2) } }));
    expect(findingsOf(two, 'SIGNATURE.PENDING_SLOT_ONCE')[0]?.details).toEqual({
      occurrences: 2,
      matches: [
        { text: PENDING_SIGNATURE, line: 2, column: 1 },
        { text: PENDING_SIGNATURE, line: 3, column: 1 },
      ],
    });
    const subject = evaluateCandidate(inputOf({ draft: { subject: `Re ${PENDING_SIGNATURE}` } }));
    expect(shapeOf(subject, 'SIGNATURE.PENDING_SLOT_ONCE')).toEqual([['BLOCKER', 'subject']]);
  });

  it('a lookalike slot is not the slot: it counts zero, and the heuristic asks a person to read it', () => {
    const lookalike = PENDING_SIGNATURE.replace('—', '-');
    const evaluation = evaluateCandidate(inputOf({ draft: { bodyText: `Body\n${lookalike}\n` } }));
    expect(shapeOf(evaluation, 'SIGNATURE.PENDING_SLOT_ONCE')).toEqual([['BLOCKER', 'bodyText']]);
    expect(findingsOf(evaluation, 'SIGNATURE.SLOT_LOOKALIKE')).toEqual([
      expect.objectContaining({
        checkKind: 'HEURISTIC',
        severity: 'REVIEW_REQUIRED',
        details: { occurrences: 1, matches: [{ text: lookalike, line: 2, column: 1 }] },
      }),
    ]);
  });

  it('the proposed signer’s name in an identity block is allowed and never read as a signature; directly after the slot it is a heuristic signal; no rule completes a signature or G7', () => {
    const identity = evaluateCandidate(inputOf());
    expect(BODY).toContain(SIGNER);
    expect(identity.result).toBe('TECHNICAL_PASS');
    const after = evaluateCandidate(
      inputOf({ draft: { bodyText: `Body\nSincerely,\n${PENDING_SIGNATURE}\n\n${SIGNER}\n` } }),
    );
    expect(findingsOf(after, 'SIGNATURE.NAME_AFTER_SLOT')).toEqual([
      expect.objectContaining({
        checkKind: 'HEURISTIC',
        severity: 'REVIEW_REQUIRED',
        fieldPath: 'bodyText',
      }),
    ]);
    const far = evaluateCandidate(
      inputOf({
        draft: { bodyText: `Body\n${PENDING_SIGNATURE}\nline a\nline b\n${SIGNER}\n` },
      }),
    );
    expect(findingsOf(far, 'SIGNATURE.NAME_AFTER_SLOT')).toEqual([]);
    for (const item of [...identity.findings, ...after.findings]) {
      expect(item.message).not.toMatch(/\b(signed|adopted|G7 (?:pass|complete)|approved)\b/i);
    }
  });

  it('wording that may imply a completed signature or adoption is a heuristic signal only; “Signature:” before the slot is not', () => {
    const adoption = evaluateCandidate(
      inputOf({
        draft: {
          bodyText: `Body\n/s/ ${SIGNER}\nElectronically signed by the agency.\nI have reviewed this notice.\n${PENDING_SIGNATURE}`,
        },
      }),
    );
    const [item] = findingsOf(adoption, 'SIGNATURE.ADOPTION_WORDING');
    expect(item).toEqual(
      expect.objectContaining({
        checkKind: 'HEURISTIC',
        severity: 'REVIEW_REQUIRED',
        fieldPath: 'bodyText',
      }),
    );
    // Matches are listed in text order; overlapping patterns are each listed.
    const details = item?.details as
      { occurrences: number; matches: Array<{ text: string }> } | undefined;
    expect(details?.occurrences).toBe(4);
    expect(details?.matches.map((m) => m.text)).toEqual([
      '/s/',
      'Electronically signed',
      'signed by',
      'I have reviewed this notice',
    ]);
    const labelled = evaluateCandidate(
      inputOf({ draft: { bodyText: `Body\nSignature: ${PENDING_SIGNATURE}\n` } }),
    );
    expect(findingsOf(labelled, 'SIGNATURE.ADOPTION_WORDING')).toEqual([]);
  });
});

describe('envelope and thread — exact relationships with the prompt snapshot; recipients never approved', () => {
  it('the case and task are the prompt’s: another is a BLOCKER', () => {
    const evaluation = evaluateCandidate(
      inputOf({ prompt: { caseId: OTHER_ID, taskType: 'NMI_REPLY' } }),
    );
    expect(shapeOf(evaluation, 'ENVELOPE.PROMPT_CASE_TASK')).toEqual([
      ['BLOCKER', 'caseId'],
      ['BLOCKER', 'taskType'],
    ]);
  });

  it('INITIAL: no parent is invented — a thread in the envelope is a BLOCKER', () => {
    const envelope = { from: SENDER, to: PLATFORM, replyTo: null, parentBindingId: OTHER_ID };
    const evaluation = evaluateCandidate(inputOf({ draft: { envelope } }));
    expect(findingsOf(evaluation, 'ENVELOPE.THREAD')[0]?.details).toEqual({
      reason: 'INITIAL_WITH_PARENT',
      expected: null,
      stored: OTHER_ID,
    });
  });

  it('NMI_REPLY: exactly the prompt’s parent passes; a missing or another parent is a BLOCKER; a thread the prompt did not name is a BLOCKER', () => {
    const view = cleanView('reply');
    const parent = view.context.parentBindingId as string;
    const exact = evaluateCandidate(inputOf({ view }));
    expect(findingsOf(exact, 'ENVELOPE.THREAD')).toEqual([]);
    const reason = (parentBindingId: string | null, promptParent: string | null = parent) =>
      findingsOf(
        evaluateCandidate(
          inputOf({
            view,
            draft: {
              envelope: {
                from: SENDER,
                to: 'synthetic-reply-here@example.invalid',
                replyTo: null,
                parentBindingId,
              },
            },
            prompt: { parentBindingId: promptParent },
          }),
        ),
        'ENVELOPE.THREAD',
      ).map((item) => (item.details as { reason: string }).reason);
    expect(reason(null)).toEqual(['PARENT_MISSING']);
    expect(reason(OTHER_ID)).toEqual(['PARENT_DIFFERENT']);
    expect(reason(OTHER_ID, null)).toEqual(['PARENT_NOT_IN_PROMPT']);
    expect(reason(parent)).toEqual([]);
  });

  it('the sender is exactly the pinned selection’s mailbox (another is a BLOCKER); without a selection the sender is unbacked — review required, nothing chosen', () => {
    const other = evaluateCandidate(
      inputOf({
        draft: {
          envelope: {
            from: 'someone@example.invalid',
            to: PLATFORM,
            replyTo: null,
            parentBindingId: null,
          },
        },
      }),
    );
    expect(findingsOf(other, 'ENVELOPE.SENDER')[0]).toEqual(
      expect.objectContaining({
        severity: 'BLOCKER',
        fieldPath: 'envelope.from',
        details: expect.objectContaining({ reason: 'NOT_SELECTED_MAILBOX', expected: SENDER }),
      }),
    );
    const view = cleanView();
    view.context.authority = null;
    const unbacked = evaluateCandidate(inputOf({ view }));
    expect(shapeOf(unbacked, 'ENVELOPE.SENDER')).toEqual([['REVIEW_REQUIRED', 'envelope.from']]);
    expect(findingsOf(unbacked, 'ENVELOPE.SENDER')[0]?.details).toEqual({
      reason: 'UNBACKED_SENDER',
    });
  });

  it('a reply is compared with its parent’s recorded Reply-To (or From): a difference or no record is review required — never a BLOCKER and never an approval; an initial notice’s recipient is not assessed', () => {
    const view = cleanView('reply');
    const parentId = view.context.correspondence.find(
      (message) => !view.context.priorCorrespondenceIds.includes(message.id),
    )?.id as string;
    const parentMessage = view.context.correspondence.find((message) => message.id === parentId);
    if (!parentMessage) throw new Error('fixture parent missing');
    const recipient = (to: string, replyTo: string | null, from: string | null) => {
      const adjusted = structuredClone(view);
      const message = adjusted.context.correspondence.find((entry) => entry.id === parentId);
      if (!message) throw new Error('fixture parent missing');
      message.replyToAddress = replyTo;
      message.fromAddress = from;
      return findingsOf(
        evaluateCandidate(
          inputOf({
            view: adjusted,
            draft: {
              envelope: {
                from: SENDER,
                to,
                replyTo: null,
                parentBindingId: adjusted.context.parentBindingId,
              },
            },
          }),
        ),
        'ENVELOPE.REPLY_RECIPIENT',
      );
    };
    expect(
      recipient('reply@example.invalid', 'reply@example.invalid', 'from@example.invalid'),
    ).toEqual([]);
    expect(recipient('from@example.invalid', null, 'from@example.invalid')).toEqual([]);
    const differs = recipient(
      'from@example.invalid',
      'reply@example.invalid',
      'from@example.invalid',
    );
    expect(differs).toEqual([
      expect.objectContaining({
        severity: 'REVIEW_REQUIRED',
        details: expect.objectContaining({
          reason: 'RECIPIENT_DIFFERS_FROM_PARENT',
          basis: 'REPLY_TO',
        }),
      }),
    ]);
    expect(differs[0]?.message).toMatch(/not a judgement that either address is legally right/);
    expect(recipient('any@example.invalid', null, null)[0]?.details).toEqual(
      expect.objectContaining({ reason: 'PARENT_ADDRESS_NOT_RECORDED' }),
    );
    const initial = evaluateCandidate(
      inputOf({
        draft: {
          envelope: {
            from: SENDER,
            to: 'any-address@example.invalid',
            replyTo: null,
            parentBindingId: null,
          },
        },
      }),
    );
    expect(findingsOf(initial, 'ENVELOPE.REPLY_RECIPIENT')).toEqual([]);
    for (const item of initial.findings)
      expect(item.message).not.toMatch(/approved|correct recipient/i);
  });
});

describe('document plan — exact revisions, recorded hashes, applicability and recorded supply posture', () => {
  const view = cleanView('reply');
  const [inContext] = sourceIdsOf(view);
  const outside = '66666666-6666-4666-8666-666666666666';
  const record = (id: string, overrides: Partial<PlanSourceRecord> = {}): PlanSourceRecord => ({
    id,
    contentSha256: null,
    headId: id,
    scopeProblem: null,
    ...overrides,
  });

  it('a missing revision is a BLOCKER (the other plan rules skip it); one outside the evaluated context is review required; a newer revision is review required and nothing is re-pointed', () => {
    const plans = [plan(inContext as string), plan(OTHER_ID), plan(outside)];
    const evaluation = evaluateCandidate(
      inputOf({
        view,
        draft: { preparedDocuments: plans },
        planSources: new Map([
          [inContext as string, record(inContext as string, { headId: outside })],
          [OTHER_ID, null],
          [outside, record(outside)],
        ]),
      }),
    );
    expect(shapeOf(evaluation, 'PLAN.SOURCE_EXISTS')).toEqual([
      ['BLOCKER', 'preparedDocuments.1.sourceId'],
    ]);
    expect(shapeOf(evaluation, 'PLAN.SOURCE_IN_CONTEXT')).toEqual([
      ['REVIEW_REQUIRED', 'preparedDocuments.2.sourceId'],
    ]);
    expect(findingsOf(evaluation, 'PLAN.SOURCE_LATEST_REVISION')).toEqual([
      expect.objectContaining({
        severity: 'REVIEW_REQUIRED',
        fieldPath: 'preparedDocuments.0.sourceId',
        details: { sourceId: inContext, latestRevisionId: outside },
      }),
    ]);
  });

  it('a revision that does not apply to the case is a BLOCKER naming the rule it fails; a hash other than the recorded one is a BLOCKER', () => {
    const evaluation = evaluateCandidate(
      inputOf({
        view,
        draft: { preparedDocuments: [plan(inContext as string, { contentSha256: HASH_A })] },
        planSources: new Map([
          [
            inContext as string,
            record(inContext as string, {
              contentSha256: 'b'.repeat(64),
              scopeProblem: { code: 'CROSS_CASE_REFERENCE' },
            }),
          ],
        ]),
      }),
    );
    expect(findingsOf(evaluation, 'PLAN.SOURCE_APPLIES')[0]?.details).toEqual({
      sourceId: inContext,
      code: 'CROSS_CASE_REFERENCE',
    });
    expect(findingsOf(evaluation, 'PLAN.CONTENT_SHA256')[0]).toEqual(
      expect.objectContaining({
        severity: 'BLOCKER',
        fieldPath: 'preparedDocuments.0.contentSha256',
        details: { sourceId: inContext, named: HASH_A, recorded: 'b'.repeat(64) },
      }),
    );
  });

  it('PREVIOUSLY_SUPPLIED: none recorded by a prior transmission is a BLOCKER; recorded only as copied-text allegation is review required; observed in the raw MIME passes; the parent NMI’s attachments never count', () => {
    const supplied = (state: string | null, onParent = false) => {
      const adjusted = structuredClone(view);
      const priors = adjusted.context.priorCorrespondenceIds;
      for (const message of adjusted.context.correspondence) {
        const isPrior = priors.includes(message.id);
        message.attachmentsManifest =
          state !== null && isPrior !== onParent
            ? [
                {
                  fileName: 'synthetic.pdf',
                  sourceId: inContext as string,
                  state: state as 'UNKNOWN',
                },
              ]
            : [];
      }
      return findingsOf(
        evaluateCandidate(
          inputOf({
            view: adjusted,
            draft: {
              preparedDocuments: [plan(inContext as string, { state: 'PREVIOUSLY_SUPPLIED' })],
            },
          }),
        ),
        'PLAN.PREVIOUSLY_SUPPLIED',
      );
    };
    expect(supplied(null)[0]).toEqual(
      expect.objectContaining({
        severity: 'BLOCKER',
        details: { sourceId: inContext, reason: 'NOT_RECORDED_AS_SUPPLIED' },
      }),
    );
    expect(supplied('OBSERVED_IN_RAW_MIME', true)[0]?.severity).toBe('BLOCKER');
    expect(supplied('COPIED_TEXT_ALLEGATION')[0]).toEqual(
      expect.objectContaining({
        severity: 'REVIEW_REQUIRED',
        details: {
          sourceId: inContext,
          reason: 'LIMITED_POSTURE',
          observedStates: ['COPIED_TEXT_ALLEGATION'],
        },
      }),
    );
    expect(supplied('OBSERVED_IN_RAW_MIME')).toEqual([]);
  });

  it('REFERENCE_ONLY, PREPARED_FOR_ATTACHMENT and UNKNOWN are plans only: no plan rule reports them; the stored order is the reported order', () => {
    const states = ['REFERENCE_ONLY', 'PREPARED_FOR_ATTACHMENT', 'UNKNOWN'] as const;
    const evaluation = evaluateCandidate(
      inputOf({
        view,
        draft: {
          preparedDocuments: states.map((state) =>
            plan(inContext as string, { state, fileName: 'synthetic.pdf' }),
          ),
        },
      }),
    );
    expect(ruleIdsWithFindings(evaluation).filter((id) => id.startsWith('PLAN.'))).toEqual([]);
  });
});

describe('wording and markers — bounded, documented detection', () => {
  const view = cleanView();
  const [source] = sourceIdsOf(view);

  it('attachment wording without a planned file prepared for attachment is a heuristic review signal; with one, a warning that it must be attached outside the application; unrelated wording is not matched', () => {
    const body = `Please find attached the licence.\n${PENDING_SIGNATURE}`;
    const unsupported = evaluateCandidate(inputOf({ view, draft: { bodyText: body } }));
    expect(findingsOf(unsupported, 'WORDING.ATTACHMENT_CLAIM')).toEqual([
      expect.objectContaining({
        checkKind: 'HEURISTIC',
        severity: 'REVIEW_REQUIRED',
        fieldPath: 'bodyText',
      }),
    ]);
    expect(unsupported.result).toBe('REVIEW_REQUIRED');
    const prepared = evaluateCandidate(
      inputOf({
        view,
        draft: {
          bodyText: body,
          preparedDocuments: [
            plan(source as string, {
              state: 'PREPARED_FOR_ATTACHMENT',
              fileName: 'synthetic-licence.pdf',
            }),
          ],
        },
      }),
    );
    expect(shapeOf(prepared, 'WORDING.ATTACHMENT_CLAIM')).toEqual([['WARNING', 'bodyText']]);
    expect(prepared.result).toBe('TECHNICAL_PASS');
    const noFile = evaluateCandidate(
      inputOf({
        view,
        draft: {
          bodyText: body,
          preparedDocuments: [plan(source as string, { state: 'PREPARED_FOR_ATTACHMENT' })],
        },
      }),
    );
    expect(shapeOf(noFile, 'WORDING.ATTACHMENT_CLAIM')).toEqual([['REVIEW_REQUIRED', 'bodyText']]);
    const unrelated = evaluateCandidate(
      inputOf({
        view,
        draft: { bodyText: `The work is not attached to any other claim.\n${PENDING_SIGNATURE}` },
      }),
    );
    expect(findingsOf(unrelated, 'WORDING.ATTACHMENT_CLAIM')).toEqual([]);
  });

  it('the reviewed-declaration placeholder and the input placeholders are deterministic BLOCKERs; nothing is filled in', () => {
    const declaration = evaluateCandidate(
      inputOf({ draft: { bodyText: `Body\n${DECLARATION_PLACEHOLDER}\n${PENDING_SIGNATURE}` } }),
    );
    expect(findingsOf(declaration, 'MARKER.DECLARATION_PLACEHOLDER')).toEqual([
      expect.objectContaining({
        checkKind: 'DETERMINISTIC',
        severity: 'BLOCKER',
        fieldPath: 'bodyText',
      }),
    ]);
    expect(declaration.result).toBe('BLOCKED');
    const input = evaluateCandidate(
      inputOf({
        draft: {
          subject: '[CONTACT DETAILS REQUIRED]',
          bodyText: `[NEEDED: the licence]\n${PENDING_SIGNATURE}`,
        },
      }),
    );
    expect(shapeOf(input, 'MARKER.INPUT_PLACEHOLDERS')).toEqual([
      ['BLOCKER', 'subject'],
      ['BLOCKER', 'bodyText'],
    ]);
  });

  it('every prompt-structure marker occurs in prompts rendered by TB-PROMPT-TEMPLATE-v1; each in a draft is a BLOCKER', () => {
    const rendered = [
      renderPrompt(fixtures.initial, 'TB-SCHEMA-API-v1.2.0'),
      renderPrompt(fixtures.reply, 'TB-SCHEMA-API-v1.2.0'),
      renderPrompt(fixtures.replyDrafting, 'TB-SCHEMA-API-v1.2.0'),
    ].join('\n');
    for (const marker of PROMPT_STRUCTURE_MARKERS) expect(rendered, marker).toContain(marker);
    for (const marker of [
      'D. REVIEW NOTES',
      'BEGIN CASE DATA ',
      'R10. Your output is unsigned draft material for a person to review.',
    ]) {
      const evaluation = evaluateCandidate(
        inputOf({ draft: { bodyText: `Body\n${marker}\n${PENDING_SIGNATURE}` } }),
      );
      expect(shapeOf(evaluation, 'MARKER.PROMPT_STRUCTURE'), marker).toEqual([
        ['BLOCKER', 'bodyText'],
      ]);
    }
  });

  it('internal identifiers — a record id of the context, a digest or fingerprint, an identifier string, an internal code — are deterministic review signals; an unknown id is not', () => {
    const [dependency] = view.dependencies as [Dependency];
    const cases = [
      view.context.caseId.toUpperCase(),
      view.dependencyDigest,
      dependency.fingerprint,
      'TB-PROMPT-TEMPLATE-v1',
      'HUMAN_PENDING',
      'READY_FOR_SIGNER',
    ];
    for (const token of cases) {
      const evaluation = evaluateCandidate(
        inputOf({ view, draft: { bodyText: `Ref ${token}\n${PENDING_SIGNATURE}` } }),
      );
      expect(findingsOf(evaluation, 'MARKER.INTERNAL_IDENTIFIERS'), token).toEqual([
        expect.objectContaining({ checkKind: 'DETERMINISTIC', severity: 'REVIEW_REQUIRED' }),
      ]);
    }
    const unknown = evaluateCandidate(
      inputOf({
        view,
        draft: {
          bodyText: `Ref 12345678-1234-4234-8234-123456789012 ${HASH_A}\n${PENDING_SIGNATURE}`,
        },
      }),
    );
    expect(findingsOf(unknown, 'MARKER.INTERNAL_IDENTIFIERS')).toEqual([]);
  });

  it('gate labels are a heuristic review signal (the same letters can mean something else)', () => {
    const gates = evaluateCandidate(
      inputOf({ draft: { bodyText: `G1 and gate 5 were reviewed.\n${PENDING_SIGNATURE}` } }),
    );
    expect(findingsOf(gates, 'MARKER.GATE_LABELS')).toEqual([
      expect.objectContaining({
        checkKind: 'HEURISTIC',
        severity: 'REVIEW_REQUIRED',
        details: expect.objectContaining({ occurrences: 2 }),
      }),
    ]);
  });
});

describe('the recorded context — mode, gaps, conflicts and drift since the prompt; nothing resolved', () => {
  it('a PREPARATION prompt’s candidate is draft material only: a deterministic BLOCKER — it is never portrayed as production-ready', () => {
    const evaluation = evaluateCandidate(inputOf({ prompt: { generationMode: 'PREPARATION' } }));
    expect(findingsOf(evaluation, 'CONTEXT.GENERATION_MODE')).toEqual([
      expect.objectContaining({
        severity: 'BLOCKER',
        details: { promptSnapshotId: PROMPT_ID, generationMode: 'PREPARATION' },
      }),
    ]);
    expect(evaluation.result).toBe('BLOCKED');
  });

  it('recorded missing items stay missing: a DRAFTING-blocking code is a BLOCKER, any other review required; recorded conflicts are review required and never decided', () => {
    const view = structuredClone(fixtures.reply);
    view.context.generationMode = 'DRAFTING';
    view.context.missing = [
      ...view.context.missing,
      { code: 'WORKS_ABSENT', message: 'No work is recorded for this case.', fieldPath: 'works' },
    ];
    const evaluation = evaluateCandidate(inputOf({ view }));
    expect(shapeOf(evaluation, 'CONTEXT.MISSING')).toEqual([
      ['REVIEW_REQUIRED', 'evaluatedContextJson.missing.0'],
      ['BLOCKER', 'evaluatedContextJson.missing.1'],
    ]);
    expect(findingsOf(evaluation, 'CONTEXT.MISSING')[0]?.details).toEqual({
      code: 'PRIOR_AS_SENT_RAW_SOURCE_ABSENT',
      contextFieldPath: view.context.missing[0]?.fieldPath,
      recorded: view.context.missing[0]?.message,
    });
    expect(
      findingsOf(evaluation, 'CONTEXT.CONFLICTS').map(
        (item) => (item.details as { code: string }).code,
      ),
    ).toEqual(['MAPPING_PROVENANCE_CONFLICT', 'FACT_RESOLUTION_CONFLICT']);
    expect(
      findingsOf(evaluation, 'CONTEXT.CONFLICTS').every(
        (item) => item.severity === 'REVIEW_REQUIRED',
      ),
    ).toBe(true);
  });

  it('drift since the prompt snapshot: each record added, removed or changed is review required; an identical digest reports nothing; only the identifiers differing is one signal', () => {
    const view = cleanView();
    const [first, second] = view.dependencies as [Dependency, Dependency];
    const promptManifest = [
      { ...first, fingerprint: HASH_A },
      ...view.dependencies.slice(1).filter((dependency) => dependency !== second),
      { entityType: 'AuthorityEvent', entityId: OTHER_ID, rowVersion: null, fingerprint: HASH_A },
    ];
    const evaluation = evaluateCandidate(
      inputOf({ view, prompt: { dependencyDigest: HASH_A, dependencyManifest: promptManifest } }),
    );
    const changes = findingsOf(evaluation, 'CONTEXT.PROMPT_DRIFT').map((item) => {
      const details = item.details as { change: string; entityType: string; entityId: string };
      return [item.severity, details.change, details.entityType, details.entityId];
    });
    expect(changes).toEqual(
      [
        ['REVIEW_REQUIRED', 'REMOVED', 'AuthorityEvent', OTHER_ID],
        ['REVIEW_REQUIRED', 'CHANGED', first.entityType, first.entityId],
        ['REVIEW_REQUIRED', 'ADDED', second.entityType, second.entityId],
      ].sort((a, b) => (`${a[2]}:${a[3]}` < `${b[2]}:${b[3]}` ? -1 : 1)),
    );
    expect(findingsOf(evaluateCandidate(inputOf({ view })), 'CONTEXT.PROMPT_DRIFT')).toEqual([]);
    const identifiers = evaluateCandidate(inputOf({ view, prompt: { dependencyDigest: HASH_A } }));
    expect(
      findingsOf(identifiers, 'CONTEXT.PROMPT_DRIFT').map(
        (item) => (item.details as { change: string }).change,
      ),
    ).toEqual(['IDENTIFIERS']);
  });
});

describe('the validation module — no clock, randomness, network, AI provider or later-phase record', () => {
  const files = readdirSync(VALIDATION_MODULE).filter((file) => file.endsWith('.ts'));
  const source = (file: string) => readFileSync(path.join(VALIDATION_MODULE, file), 'utf8');

  it('no module file opens a network, mail, file, process or AI-provider call', () => {
    expect(files.length).toBeGreaterThanOrEqual(9);
    for (const file of files) {
      const text = source(file);
      expect(text, file).not.toMatch(
        /\bfetch\(|node:(?:http|https|net|tls|dgram|child_process|fs)|\baxios\b|\bopenai\b|\banthropic\b|nodemailer|smtp|imap|googleapis|gmail|drive\.|process\.env|execSync|spawn\(/i,
      );
    }
  });

  it('the rules read no clock, randomness, locale or environment; only the service reads the injected clock', () => {
    for (const file of files) {
      const text = source(file);
      expect(text, file).not.toMatch(/Date\.now\(|Math\.random\(|new Date\(|Intl\.|toLocale/);
      if (file !== 'validation.service.ts') expect(text, file).not.toMatch(/clock\.now\(/);
    }
  });

  it('the web validation page names the same ruleset, reaches only the application API and never renders stored text as HTML', () => {
    const page = readFileSync(path.join(repoRoot, 'apps/web/src/app/cases/validation.tsx'), 'utf8');
    expect(page).toContain(
      `export const TECHNICAL_RULESET_VERSION = '${TECHNICAL_RULESET_VERSION}';`,
    );
    expect(page).not.toMatch(
      /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|openai|anthropic|gemini|generativelanguage|bedrock|mistral|cohere|ollama|langchain|https?:\/\/|dangerouslySetInnerHTML|innerHTML|\beval\s*\(/i,
    );
    expect(page).not.toMatch(/^import (?!type )[^;]*from '@tb\/contracts'/m);
    const client = readFileSync(path.join(repoRoot, 'apps/web/src/app/api/directory.ts'), 'utf8');
    const start = client.indexOf('      validation: {');
    const validation = client.slice(start, client.indexOf('    reportedItems: child', start));
    expect(validation).toMatch(
      /api\.request<ValidationRun>\(\s*'POST',\s*`\/api\/v1\/candidates\/\$\{candidateId\}\/validation-runs`/,
    );
    expect(validation).toContain('`/api/v1/validation-runs/${runId}/issues${queryString(query)}`');
    expect(validation).not.toMatch(/\bfetch\s*\(|https?:\/\//);
  });

  it('nothing writes an assessment, a readiness, a signature or an export; the only records written are the run, its issues and the audit event', () => {
    const service = source('validation.service.ts');
    expect(
      [
        ...service.matchAll(
          /tx\.(\w+)\.(create|createMany|update|updateMany|delete|deleteMany|upsert)\(/g,
        ),
      ].map((match) => `${match[1]}.${match[2]}`),
    ).toEqual(['validationRun.create', 'validationIssue.createMany']);
    for (const file of files) {
      expect(source(file), file).not.toMatch(
        /candidateAssessment|assessmentSource|readiness\w*\.(?:create|update)/,
      );
    }
  });
});
