// The technical ruleset TB-TECHNICAL-RULESET-v1 (P4G, validateCandidate) and its engine: a pure
// function of exact stored values — the candidate, its prompt snapshot, the current production
// context the run evaluates and the stored source revisions its document plan names. No database,
// clock, randomness, locale, environment or network: the same input always gives the same rule
// records, findings, coverage and result.
//
// A technical validation checks structure, exact bytes and hashes, exact identifiers and recorded
// relationships, and scans the text for a few bounded, documented patterns. It is not a substantive
// review: it decides no G1–G6 gate (authority, rights, identification, evidence, permission or
// exceptions, human adoption of the text), no legal validity or sufficiency, no signer eligibility,
// no readiness, READY_FOR_SIGNER or G7, and a TECHNICAL_PASS approves nothing. Every run records
// semanticReviewRequired = true.
//
//   DETERMINISTIC  exact comparisons of stored values: the finding follows from the values alone.
//   HEURISTIC      bounded pattern scans of free text: a signal a person must read, never a finding
//                  about what the text means. A heuristic never reports a BLOCKER.
//
// Rule outcomes: EXECUTED (with zero or more findings; a passed rule stores no issue), NOT_EXECUTED
// (its input cannot be evaluated as defined — recorded as a REVIEW_REQUIRED issue with the reason)
// and ERROR (it failed while running — recorded as a BLOCKER issue with the error's name only).
// Every required rule that did not execute is listed in notExecutedRuleIds; none is ever passed.
//
// Result (deterministic): ERROR when any rule failed; else BLOCKED when any BLOCKER; else
// REVIEW_REQUIRED when any REVIEW_REQUIRED finding or any required rule not executed; else
// TECHNICAL_PASS — the configured technical rules executed and found no technical blocker or
// review-required technical issue under this ruleset. WARNING and INFO findings do not change it.
//
// The ruleset identifier is an implementation identifier: not a wire-contract release, not a
// Production Form Contract version, not a legal or policy certification and not a G1–G6 review
// version. Any change to a rule's meaning, kind, severity or to the inventory needs a new identifier.
import {
  CONTRACT_BASELINE,
  CreateCandidateSchema,
  EnvelopeSchema,
  PFC_SCHEMA_VERSION,
  type ContextView,
  type CoverageManifest,
  type Dependency,
} from '@tb/contracts';
import {
  exactTextSha256,
  PENDING_SIGNATURE,
} from '../../infrastructure/integrity/tb-canonical-json.js';
import {
  ARTIFACT_ALGORITHM,
  CANDIDATE_SIGNATURE_STATE,
  candidateArtifactSha256,
  type StoredDocumentPlan,
  type StoredEnvelope,
} from '../candidates/candidate-artifact.js';
import { DRAFTING_BLOCKING_CODES } from '../production/context-assembly.js';
import { DEPENDENCY_DIGEST_ALGORITHM } from '../production/context-dependencies.js';
import { PROMPT_TEMPLATE_VERSION } from '../prompts/prompt-template.js';
import { exactOccurrences, located, patternMatches, type Found } from './text-scan.js';

export const TECHNICAL_RULESET_VERSION = 'TB-TECHNICAL-RULESET-v1';

export type CheckKind = 'DETERMINISTIC' | 'HEURISTIC';
export type IssueSeverity = 'BLOCKER' | 'REVIEW_REQUIRED' | 'WARNING' | 'INFO';
export type TechnicalResult = 'TECHNICAL_PASS' | 'BLOCKED' | 'REVIEW_REQUIRED' | 'ERROR';
export type RuleOutcome = 'EXECUTED' | 'NOT_EXECUTED' | 'ERROR';

/** One finding of a rule, as it is stored as a ValidationIssue. */
export interface Finding {
  readonly ruleId: string;
  readonly checkKind: CheckKind;
  readonly severity: IssueSeverity;
  readonly fieldPath: string | null;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>> | null;
}

/** A source revision a document plan names, as read in the validation's snapshot. */
export interface PlanSourceRecord {
  readonly id: string;
  /** The SHA-256 recorded on this revision (its hash target says what it covers), or null. */
  readonly contentSha256: string | null;
  /** The latest revision of its source group (its own id when it is the latest). */
  readonly headId: string;
  /** Why it does not apply to the candidate's case under the source rules; null when it applies. */
  readonly scopeProblem: {
    readonly code: string;
    readonly reason?: string;
    readonly ownerId?: string;
  } | null;
}

/** Everything the rules read: exact stored values, as read in one snapshot. */
export interface ValidationInput {
  readonly candidate: {
    readonly id: string;
    readonly caseId: string;
    readonly taskType: string;
    readonly subject: string;
    readonly bodyText: string;
    readonly bodySha256: string;
    readonly artifactSha256: string;
    readonly signatureState: string;
    /** The stored envelope and document plan JSON exactly as read — not re-shaped. */
    readonly envelope: unknown;
    readonly preparedDocuments: unknown;
  };
  readonly prompt: {
    readonly id: string;
    readonly caseId: string;
    readonly taskType: string;
    readonly generationMode: string;
    readonly parentBindingId: string | null;
    readonly dependencyDigest: string;
    readonly dependencyManifest: readonly Dependency[];
    readonly promptSha256: string;
  };
  /** The current production context of the prompt's scope: what this run evaluates. */
  readonly evaluated: ContextView;
  /** The captured message the prompt's parent binding names (null when it names none). */
  readonly parentCorrespondenceId: string | null;
  /** Each source id the document plan names → its stored revision, or null when none exists. */
  readonly planSources: ReadonlyMap<string, PlanSourceRecord | null>;
}

type RuleFinding = Omit<Finding, 'ruleId' | 'checkKind'>;
type Check =
  | { readonly outcome: 'EXECUTED'; readonly findings: readonly RuleFinding[] }
  | { readonly outcome: 'NOT_EXECUTED'; readonly reason: string };

export interface TechnicalRule {
  readonly id: string;
  readonly checkKind: CheckKind;
  /** What the rule checks and how it reports (the ruleset's documentation). */
  readonly checks: string;
  check(input: ValidationInput): Check;
}

const executed = (findings: readonly RuleFinding[]): Check => ({ outcome: 'EXECUTED', findings });
const notExecuted = (reason: string): Check => ({ outcome: 'NOT_EXECUTED', reason });
const finding = (
  severity: IssueSeverity,
  fieldPath: string | null,
  message: string,
  details: Readonly<Record<string, unknown>> | null = null,
): RuleFinding => ({ severity, fieldPath, message, details });

/** The candidate's outgoing text — what a human would send after review: its subject and body. */
const outgoing = (input: ValidationInput): Array<readonly [string, string]> => [
  ['subject', input.candidate.subject],
  ['bodyText', input.candidate.bodyText],
];

// ---- exact text ----------------------------------------------------------------------------------

function textProblem(value: string): 'NUL' | 'UNPAIRED_SURROGATE' | null {
  if (value.includes('\u0000')) return 'NUL';
  if (/\p{Surrogate}/u.test(value)) return 'UNPAIRED_SURROGATE';
  return null;
}

/** Every string of a stored JSON value with its dotted path, in stored order. */
function strings(value: unknown, path: string, out: Array<readonly [string, string]>): void {
  if (typeof value === 'string') out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((item, i) => strings(item, `${path}.${i}`, out));
  else if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) strings(item, `${path}.${key}`, out);
  }
}

function artifactTexts(input: ValidationInput): Array<readonly [string, string]> {
  const texts: Array<readonly [string, string]> = [...outgoing(input)];
  strings(input.candidate.envelope, 'envelope', texts);
  strings(input.candidate.preparedDocuments, 'preparedDocuments', texts);
  return texts;
}

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const textOrNull = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';

/** The stored envelope in its stored form (every contracted key, text or null), else null. */
function storedEnvelopeOf(value: unknown): StoredEnvelope | null {
  const envelope = record(value);
  if (envelope === null) return null;
  const { from, to, replyTo, parentBindingId } = envelope;
  if (typeof from !== 'string' || typeof to !== 'string') return null;
  if (!textOrNull(replyTo) || !textOrNull(parentBindingId)) return null;
  return { from, to, replyTo, parentBindingId };
}

/** The stored document plan in its stored form (every contracted key of every entry), else null. */
function storedPlansOf(value: unknown): StoredDocumentPlan[] | null {
  if (!Array.isArray(value)) return null;
  const plans: StoredDocumentPlan[] = [];
  for (const entry of value) {
    const plan = record(entry);
    if (plan === null) return null;
    const { sourceId, purpose, state, fileName, contentSha256, disclosureReview, limitations } =
      plan;
    if (
      typeof sourceId !== 'string' ||
      typeof purpose !== 'string' ||
      typeof state !== 'string' ||
      typeof disclosureReview !== 'string' ||
      !textOrNull(fileName) ||
      !textOrNull(contentSha256) ||
      !textOrNull(limitations)
    ) {
      return null;
    }
    plans.push({
      sourceId,
      purpose,
      state: state as StoredDocumentPlan['state'],
      fileName,
      contentSha256,
      disclosureReview: disclosureReview as StoredDocumentPlan['disclosureReview'],
      limitations,
    });
  }
  return plans;
}

/** The stored plan entries that can be read (an object naming a source id), with their index. */
function planEntries(
  input: ValidationInput,
): Array<{ index: number; plan: Record<string, unknown>; sourceId: string }> {
  const plans = input.candidate.preparedDocuments;
  if (!Array.isArray(plans)) return [];
  return plans.flatMap((entry, index) => {
    const plan = record(entry);
    return plan !== null && typeof plan['sourceId'] === 'string'
      ? [{ index, plan, sourceId: plan['sourceId'] }]
      : [];
  });
}

const NOT_EXACT_TEXT =
  'The stored text contains a character import refuses (a NUL or an unpaired UTF-16 surrogate), so it is not exact text; the SHA-256 of its exact UTF-8 bytes is not defined for it.';

// ---- rules -----------------------------------------------------------------------------------------

const TEXT_EXACT: TechnicalRule = {
  id: 'ARTIFACT.TEXT_EXACT',
  checkKind: 'DETERMINISTIC',
  checks:
    'Every stored text of the artifact — subject, body, envelope and document plan — is exact text: no NUL and no unpaired UTF-16 surrogate (INVARIANTS §6). A violation is a BLOCKER for that field: import refuses such text, so the stored record is not what was imported.',
  check(input) {
    return executed(
      artifactTexts(input).flatMap(([path, text]) => {
        const problem = textProblem(text);
        return problem === null
          ? []
          : [
              finding(
                'BLOCKER',
                path,
                problem === 'NUL'
                  ? 'The stored text contains a NUL character. Import refuses it, so this stored text is not what was imported: an integrity failure. Nothing is repaired.'
                  : 'The stored text contains an unpaired UTF-16 surrogate. Import refuses it, so this stored text is not what was imported: an integrity failure. Nothing is repaired.',
                { problem },
              ),
            ];
      }),
    );
  },
};

const SHAPE: TechnicalRule = {
  id: 'ARTIFACT.SHAPE',
  checkKind: 'DETERMINISTIC',
  checks:
    'The stored subject, body, envelope and document plan match their contract schemas (TB-SCHEMA-API-v1.2.0 CreateCandidate: lengths in code points, formats, the four DocumentPlan states, at most 100 plans, no other keys). Each difference is a BLOCKER at its field; nothing is trimmed or rewritten to fit.',
  check(input) {
    const { candidate } = input;
    const shapes: Array<
      readonly [
        string,
        {
          safeParse(value: unknown): {
            success: boolean;
            error?: {
              issues: ReadonlyArray<{
                path: readonly PropertyKey[];
                message: string;
                code: string;
              }>;
            };
          };
        },
        unknown,
      ]
    > = [
      ['subject', CreateCandidateSchema.shape.subject, candidate.subject],
      ['bodyText', CreateCandidateSchema.shape.bodyText, candidate.bodyText],
      ['envelope', EnvelopeSchema, candidate.envelope],
      [
        'preparedDocuments',
        CreateCandidateSchema.shape.preparedDocuments,
        candidate.preparedDocuments,
      ],
    ];
    const findings: RuleFinding[] = [];
    for (const [base, schema, value] of shapes) {
      const parsed = schema.safeParse(value);
      if (parsed.success || parsed.error === undefined) continue;
      for (const issue of parsed.error.issues) {
        const path = [base, ...issue.path.map(String)].join('.');
        const isState = base === 'preparedDocuments' && issue.path.at(-1) === 'state';
        findings.push(
          finding(
            'BLOCKER',
            path,
            isState
              ? 'The stored planned state is not one of the four DocumentPlan states (REFERENCE_ONLY, PREPARED_FOR_ATTACHMENT, PREVIOUSLY_SUPPLIED, UNKNOWN). No state records an attachment made: ACTUALLY_ATTACHED does not exist.'
              : 'The stored value does not match its contract schema; nothing is trimmed or rewritten to fit.',
            { schemaIssue: issue.code, rule: issue.message },
          ),
        );
      }
    }
    return executed(findings);
  },
};

const BODY_SHA256: TechnicalRule = {
  id: 'ARTIFACT.BODY_SHA256',
  checkKind: 'DETERMINISTIC',
  checks:
    "The SHA-256 of the exact UTF-8 bytes of the stored body equals the stored bodySha256 (the frozen helper's exactTextSha256; no trimming, newline or Unicode normalization). A difference is a BLOCKER (integrity failure; no hash is repaired). NOT_EXECUTED when the stored body is not exact text.",
  check(input) {
    const { bodyText, bodySha256 } = input.candidate;
    if (textProblem(bodyText) !== null) return notExecuted(NOT_EXACT_TEXT);
    const recomputed = exactTextSha256(bodyText);
    return executed(
      recomputed === bodySha256
        ? []
        : [
            finding(
              'BLOCKER',
              'bodySha256',
              'The stored body SHA-256 is not the SHA-256 of the exact UTF-8 bytes of the stored body: an integrity failure. Neither the hash nor the body is repaired.',
              { stored: bodySha256, recomputed },
            ),
          ],
    );
  },
};

const ARTIFACT_SHA256: TechnicalRule = {
  id: 'ARTIFACT.ARTIFACT_SHA256',
  checkKind: 'DETERMINISTIC',
  checks: `The ${ARTIFACT_ALGORITHM} hash recomputed from the stored subject, body, envelope, ordered document plan and the HUMAN_PENDING state and slot equals the stored artifactSha256. A difference is a BLOCKER (integrity failure). NOT_EXECUTED when a stored text is not exact text or the stored envelope or plan is not in its stored form.`,
  check(input) {
    const { candidate } = input;
    const envelope = storedEnvelopeOf(candidate.envelope);
    const plans = storedPlansOf(candidate.preparedDocuments);
    if (envelope === null || plans === null) {
      return notExecuted(
        `The stored envelope or document plan is not in its stored form (every contracted key present, as text or null), so the ${ARTIFACT_ALGORITHM} object cannot be formed; ARTIFACT.SHAPE reports what differs.`,
      );
    }
    if (artifactTexts(input).some(([, text]) => textProblem(text) !== null)) {
      return notExecuted(NOT_EXACT_TEXT);
    }
    const recomputed = candidateArtifactSha256({
      subject: candidate.subject,
      bodyText: candidate.bodyText,
      envelope,
      preparedDocuments: plans,
    });
    return executed(
      recomputed === candidate.artifactSha256
        ? []
        : [
            finding(
              'BLOCKER',
              'artifactSha256',
              `The stored artifact SHA-256 is not the ${ARTIFACT_ALGORITHM} hash of the stored artifact: an integrity failure. Neither the hash nor the artifact is repaired.`,
              { stored: candidate.artifactSha256, recomputed },
            ),
          ],
    );
  },
};

const SIGNATURE_STATE: TechnicalRule = {
  id: 'ARTIFACT.SIGNATURE_STATE',
  checkKind: 'DETERMINISTIC',
  checks:
    'The stored signatureState is HUMAN_PENDING, the only state a candidate has (the database CHECK is the backstop). Anything else is a BLOCKER; no signed state is created or accepted.',
  check(input) {
    const { signatureState } = input.candidate;
    return executed(
      signatureState === CANDIDATE_SIGNATURE_STATE
        ? []
        : [
            finding(
              'BLOCKER',
              'signatureState',
              'The stored signature state is not HUMAN_PENDING. A candidate is unsigned: a human signs outside this application.',
              { stored: signatureState },
            ),
          ],
    );
  },
};

const PENDING_SLOT_ONCE: TechnicalRule = {
  id: 'SIGNATURE.PENDING_SLOT_ONCE',
  checkKind: 'DETERMINISTIC',
  checks: `The body contains the exact pending signer slot ${PENDING_SIGNATURE} exactly once, and the subject none. Zero or more than one in the body, or any in the subject, is a BLOCKER. It counts the exact token only: it does not establish that no other text implies a signature or an adoption, and nothing is inserted.`,
  check(input) {
    const findings: RuleFinding[] = [];
    const { bodyText, subject } = input.candidate;
    const inBody = exactOccurrences(bodyText, PENDING_SIGNATURE);
    if (inBody.length === 0) {
      findings.push(
        finding(
          'BLOCKER',
          'bodyText',
          'The body does not contain the pending signer slot. An unsigned draft carries it exactly once, where the signature belongs; nothing here inserts it.',
          { occurrences: 0 },
        ),
      );
    } else if (inBody.length > 1) {
      findings.push(
        finding(
          'BLOCKER',
          'bodyText',
          `The body contains the pending signer slot ${inBody.length} times; exactly one is expected.`,
          located(bodyText, inBody),
        ),
      );
    }
    const inSubject = exactOccurrences(subject, PENDING_SIGNATURE);
    if (inSubject.length > 0) {
      findings.push(
        finding(
          'BLOCKER',
          'subject',
          'The subject contains the pending signer slot; the slot belongs in the body, once.',
          located(subject, inSubject),
        ),
      );
    }
    return executed(findings);
  },
};

/** Bracketed text naming a signer, a signature or a pending state (not the exact slot). */
const BRACKETED = /\[[^[\]\n]{1,160}\]/gu;
const SIGNATURE_WORD = /\b(?:PENDING|SIGNER|SIGNATURE|SIGNED|SIGN)\b/iu;

const SLOT_LOOKALIKE: TechnicalRule = {
  id: 'SIGNATURE.SLOT_LOOKALIKE',
  checkKind: 'HEURISTIC',
  checks:
    'Heuristic: bracketed text in the subject or body that names a signer, a signature or a pending state but is not the exact pending signer slot (a mistyped or completed slot). REVIEW_REQUIRED per field; a person reads it.',
  check(input) {
    return executed(
      outgoing(input).flatMap(([path, text]) => {
        const found = patternMatches(text, BRACKETED).filter(
          (match) =>
            match.text !== PENDING_SIGNATURE &&
            !match.text.startsWith('[NEEDED:') &&
            SIGNATURE_WORD.test(match.text.slice(1, -1)),
        );
        return found.length === 0
          ? []
          : [
              finding(
                'REVIEW_REQUIRED',
                path,
                'Bracketed text resembles a signature placeholder but is not the exact pending signer slot. It may be a mistyped or a completed slot: a person reads it. (Heuristic signal, not a finding about the text.)',
                located(text, found),
              ),
            ];
      }),
    );
  },
};

/** Wording that may state or imply a completed signature or a personal adoption. */
const ADOPTION_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['conformed signature "/s/"', /(?<![^\s(])\/s\/(?=[ \t]*\S)/gu],
  ['"electronically/digitally signed"', /\b(?:electronically|digitally)\s+signed\b/giu],
  ['"e-signed"', /\be-signed\b/giu],
  ['"signed by / signed on behalf of"', /\bsigned\s+(?:by|on\s+behalf\s+of)\b/giu],
  [
    '"Signature:" followed by anything but the pending slot',
    /\bsignature\s*:[ \t]*(?!\[PENDING AUTHORIZED SIGNER — FULL LEGAL NAME REQUIRED\])\S/giu,
  ],
  [
    '"I have reviewed/approved/adopted/signed this notice"',
    /\bI\s+(?:have\s+)?(?:reviewed|approved|adopted|signed)\s+(?:this|the)\s+(?:notice|letter|e-?mail|message|text|draft)\b/giu,
  ],
];

const ADOPTION_WORDING: TechnicalRule = {
  id: 'SIGNATURE.ADOPTION_WORDING',
  checkKind: 'HEURISTIC',
  checks: `Heuristic: wording in the subject or body that may state or imply a completed signature or a personal adoption — ${ADOPTION_PATTERNS.map(([label]) => label).join('; ')}. REVIEW_REQUIRED per field. It cannot establish whether the text implies adoption (INVARIANTS §2 step 9).`,
  check(input) {
    return executed(
      outgoing(input).flatMap(([path, text]) => {
        const hits = ADOPTION_PATTERNS.map(
          ([label, pattern]) => [label, patternMatches(text, pattern)] as const,
        ).filter(([, found]) => found.length > 0);
        if (hits.length === 0) return [];
        return [
          finding(
            'REVIEW_REQUIRED',
            path,
            'Wording that may state or imply a completed signature or a personal adoption. A human signs and adopts the text outside this application: a person reads it. (Heuristic signal, not a finding about what the text means.)',
            {
              patterns: hits.map(([label]) => label),
              ...located(
                text,
                hits.flatMap(([, found]) => found),
              ),
            },
          ),
        ];
      }),
    );
  },
};

const NAME_AFTER_SLOT_LINES = 2;
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const NAME_AFTER_SLOT: TechnicalRule = {
  id: 'SIGNATURE.NAME_AFTER_SLOT',
  checkKind: 'HEURISTIC',
  checks:
    "Heuristic: the proposed signer's recorded full legal name (the evaluated context's party) on the pending slot's own line after the slot or on one of the next two non-empty lines — a completed sign-off name below the slot (PFC §7). REVIEW_REQUIRED. A name in an identity or capacity block elsewhere is allowed and is never read as a signature.",
  check(input) {
    const name = input.evaluated.context.party.signerFullLegalName;
    const { bodyText } = input.candidate;
    if (name === null || name === '') return executed([]);
    const pattern = new RegExp(escapeRegExp(name), 'iu');
    const found: Found[] = [];
    for (const slot of exactOccurrences(bodyText, PENDING_SIGNATURE)) {
      let offset = slot.index + PENDING_SIGNATURE.length;
      let nonEmpty = 0;
      const lines = bodyText.slice(offset).split('\n');
      for (const [position, line] of lines.entries()) {
        const inWindow = position === 0 || line.trim() !== '';
        if (inWindow) {
          const match = pattern.exec(line);
          if (match !== null) {
            found.push({ index: offset + match.index, text: match[0] });
            break;
          }
          if (position > 0) nonEmpty += 1;
        }
        if (nonEmpty >= NAME_AFTER_SLOT_LINES) break;
        offset += line.length + 1;
      }
    }
    return executed(
      found.length === 0
        ? []
        : [
            finding(
              'REVIEW_REQUIRED',
              'bodyText',
              "The proposed signer's recorded name directly follows the pending slot. A completed sign-off name below the slot may read as a signature (PFC §7); a name in an identity or capacity block is allowed and is not a signature. A person reads it. (Heuristic signal.)",
              located(bodyText, found),
            ),
          ],
    );
  },
};

// ---- envelope and thread -------------------------------------------------------------------------

const PROMPT_CASE_TASK: TechnicalRule = {
  id: 'ENVELOPE.PROMPT_CASE_TASK',
  checkKind: 'DETERMINISTIC',
  checks:
    "The candidate's case and task are its prompt snapshot's case and task (the composite foreign key is the case's backstop). A difference is a BLOCKER.",
  check(input) {
    const { candidate, prompt } = input;
    const findings: RuleFinding[] = [];
    if (candidate.caseId !== prompt.caseId) {
      findings.push(
        finding('BLOCKER', 'caseId', "The candidate's case is not its prompt snapshot's case.", {
          candidateCaseId: candidate.caseId,
          promptCaseId: prompt.caseId,
        }),
      );
    }
    if (candidate.taskType !== prompt.taskType) {
      findings.push(
        finding('BLOCKER', 'taskType', "The candidate's task is not its prompt snapshot's task.", {
          candidateTaskType: candidate.taskType,
          promptTaskType: prompt.taskType,
        }),
      );
    }
    return executed(findings);
  },
};

const THREAD: TechnicalRule = {
  id: 'ENVELOPE.THREAD',
  checkKind: 'DETERMINISTIC',
  checks:
    "envelope.parentBindingId is exactly the prompt snapshot's parent binding: none for an initial notice (no parent is invented) and for a reply prepared without one; for a reply the exact NMI binding the prompt named. A difference is a BLOCKER. NOT_EXECUTED when the stored envelope is not an object.",
  check(input) {
    const envelope = record(input.candidate.envelope);
    if (envelope === null) {
      return notExecuted('The stored envelope is not an object; ARTIFACT.SHAPE reports it.');
    }
    const stored =
      typeof envelope['parentBindingId'] === 'string' ? envelope['parentBindingId'] : null;
    const expected = input.prompt.parentBindingId;
    if (stored === expected) return executed([]);
    const reason =
      input.prompt.taskType === 'INITIAL'
        ? 'INITIAL_WITH_PARENT'
        : expected === null
          ? 'PARENT_NOT_IN_PROMPT'
          : stored === null
            ? 'PARENT_MISSING'
            : 'PARENT_DIFFERENT';
    return executed([
      finding(
        'BLOCKER',
        'envelope.parentBindingId',
        {
          INITIAL_WITH_PARENT:
            'An initial notice names a reply thread: its prompt snapshot names no parent message, and none is invented.',
          PARENT_NOT_IN_PROMPT:
            'The envelope names a reply thread its prompt snapshot does not name. The thread is never chosen here.',
          PARENT_MISSING:
            "The reply does not keep its prompt snapshot's thread: the envelope names no parent binding.",
          PARENT_DIFFERENT:
            "The reply names another thread than its prompt snapshot's parent binding. The thread is never changed silently.",
        }[reason],
        { reason, expected, stored },
      ),
    ]);
  },
};

const SENDER: TechnicalRule = {
  id: 'ENVELOPE.SENDER',
  checkKind: 'DETERMINISTIC',
  checks:
    "envelope.from is exactly the intended sender mailbox of the authority selection the prompt snapshot pinned (the evaluated context's selection): another address is a BLOCKER. Without a selection no selected mailbox backs the sender: REVIEW_REQUIRED (unbacked sender). NOT_EXECUTED when the stored envelope has no sender text.",
  check(input) {
    const envelope = record(input.candidate.envelope);
    const from = envelope?.['from'];
    if (typeof from !== 'string') {
      return notExecuted('The stored envelope has no sender text; ARTIFACT.SHAPE reports it.');
    }
    const selection = input.evaluated.context.authority?.selection ?? null;
    if (selection === null) {
      return executed([
        finding(
          'REVIEW_REQUIRED',
          'envelope.from',
          'The prompt snapshot names no authority selection, so no selected mailbox backs this sender. Whether it is the right sender needs review; nothing is chosen here.',
          { reason: 'UNBACKED_SENDER' },
        ),
      ]);
    }
    return executed(
      from === selection.intendedFromEmail
        ? []
        : [
            finding(
              'BLOCKER',
              'envelope.from',
              'The sender is not the intended mailbox of the authority selection the prompt snapshot pinned. Another mailbox needs its own selection and prompt.',
              {
                reason: 'NOT_SELECTED_MAILBOX',
                authoritySelectionId: selection.id,
                expected: selection.intendedFromEmail,
                stored: from,
              },
            ),
          ],
    );
  },
};

const REPLY_RECIPIENT: TechnicalRule = {
  id: 'ENVELOPE.REPLY_RECIPIENT',
  checkKind: 'DETERMINISTIC',
  checks:
    "For a reply with a parent binding: envelope.to is exactly the parent NMI's recorded Reply-To address, or its From address when no Reply-To is recorded (INVARIANTS §4: the Reply-To is never replaced for convenience). A difference, or no recorded address, is REVIEW_REQUIRED — an exact comparison with the record, never a judgement that a recipient is legally right. An initial notice's recipient has no exact record in the case: nothing is checked (its correctness is semantic review).",
  check(input) {
    const envelope = record(input.candidate.envelope);
    const to = envelope?.['to'];
    if (typeof to !== 'string') {
      return notExecuted('The stored envelope has no recipient text; ARTIFACT.SHAPE reports it.');
    }
    if (input.prompt.taskType !== 'NMI_REPLY' || input.parentCorrespondenceId === null) {
      return executed([]);
    }
    const parent = input.evaluated.context.correspondence.find(
      (message) => message.id === input.parentCorrespondenceId,
    );
    if (parent === undefined) {
      return notExecuted(
        "The parent binding's captured message is not part of the evaluated context.",
      );
    }
    const expected = parent.replyToAddress ?? parent.fromAddress;
    if (expected === null) {
      return executed([
        finding(
          'REVIEW_REQUIRED',
          'envelope.to',
          'The parent NMI records neither a Reply-To nor a From address, so the reply recipient cannot be compared with a record. It needs review.',
          { reason: 'PARENT_ADDRESS_NOT_RECORDED', parentCorrespondenceId: parent.id },
        ),
      ]);
    }
    return executed(
      to === expected
        ? []
        : [
            finding(
              'REVIEW_REQUIRED',
              'envelope.to',
              `The reply is not addressed to the parent NMI's recorded ${parent.replyToAddress !== null ? 'Reply-To' : 'From'} address. A reply keeps its parent's recipient unless the correspondence says otherwise: this needs review. It is not a judgement that either address is legally right.`,
              {
                reason: 'RECIPIENT_DIFFERS_FROM_PARENT',
                basis: parent.replyToAddress !== null ? 'REPLY_TO' : 'FROM',
                expected,
                stored: to,
                parentCorrespondenceId: parent.id,
              },
            ),
          ],
    );
  },
};

// ---- document plan --------------------------------------------------------------------------------

const PLAN_SOURCE_EXISTS: TechnicalRule = {
  id: 'PLAN.SOURCE_EXISTS',
  checkKind: 'DETERMINISTIC',
  checks:
    'Each planned document names an existing SourceReference revision (its exact id). A missing one is a BLOCKER; the other plan rules skip that entry.',
  check(input) {
    return executed(
      planEntries(input).flatMap(({ index, sourceId }) =>
        input.planSources.get(sourceId) == null
          ? [
              finding(
                'BLOCKER',
                `preparedDocuments.${index}.sourceId`,
                'The planned document names a source revision that does not exist.',
                { sourceId },
              ),
            ]
          : [],
      ),
    );
  },
};

const PLAN_SOURCE_APPLIES: TechnicalRule = {
  id: 'PLAN.SOURCE_APPLIES',
  checkKind: 'DETERMINISTIC',
  checks:
    "Each named source revision applies to the candidate's case under the current source rules (source-scope.ts, target Case: agency, case, subject and owner dimensions). One that does not is a BLOCKER naming the rule it fails.",
  check(input) {
    return executed(
      planEntries(input).flatMap(({ index, sourceId }) => {
        const source = input.planSources.get(sourceId);
        if (source == null || source.scopeProblem === null) return [];
        return [
          finding(
            'BLOCKER',
            `preparedDocuments.${index}.sourceId`,
            "The planned document's source revision does not apply to this case under the current source rules.",
            { sourceId, ...source.scopeProblem },
          ),
        ];
      }),
    );
  },
};

const PLAN_SOURCE_IN_CONTEXT: TechnicalRule = {
  id: 'PLAN.SOURCE_IN_CONTEXT',
  checkKind: 'DETERMINISTIC',
  checks:
    "Each named source revision is part of the evaluated context's dependency closure (the case's linked sources and every source its records cite). One outside it is REVIEW_REQUIRED: the prompt's drafting did not see it, and its later changes would not make this validation stale.",
  check(input) {
    const inClosure = new Set(
      input.evaluated.dependencies
        .filter((dependency) => dependency.entityType === 'SourceReference')
        .map((dependency) => dependency.entityId),
    );
    return executed(
      planEntries(input).flatMap(({ index, sourceId }) =>
        input.planSources.get(sourceId) == null || inClosure.has(sourceId)
          ? []
          : [
              finding(
                'REVIEW_REQUIRED',
                `preparedDocuments.${index}.sourceId`,
                "The planned document's source revision is not part of the evaluated production context of this case: its later changes would not make this validation stale. Link it to the case, or have its use reviewed.",
                { sourceId },
              ),
            ],
      ),
    );
  },
};

const PLAN_SOURCE_LATEST: TechnicalRule = {
  id: 'PLAN.SOURCE_LATEST_REVISION',
  checkKind: 'DETERMINISTIC',
  checks:
    'Each named source revision is the latest revision of its source group. When a newer revision exists the plan still names exactly its own revision — nothing is re-pointed — and the difference is REVIEW_REQUIRED (which revision the document should be is a review question).',
  check(input) {
    return executed(
      planEntries(input).flatMap(({ index, sourceId }) => {
        const source = input.planSources.get(sourceId);
        if (source == null || source.headId === source.id) return [];
        return [
          finding(
            'REVIEW_REQUIRED',
            `preparedDocuments.${index}.sourceId`,
            'A newer revision of the planned source exists. The plan names exactly its own revision and is not re-pointed; which revision the document should be needs review.',
            { sourceId, latestRevisionId: source.headId },
          ),
        ];
      }),
    );
  },
};

const PLAN_CONTENT_SHA256: TechnicalRule = {
  id: 'PLAN.CONTENT_SHA256',
  checkKind: 'DETERMINISTIC',
  checks:
    'A contentSha256 named by a planned document is exactly the SHA-256 recorded on its source revision (whose hash target says what it covers). Any other hash — or one where the revision records none — is a BLOCKER.',
  check(input) {
    return executed(
      planEntries(input).flatMap(({ index, plan, sourceId }) => {
        const source = input.planSources.get(sourceId);
        const named = plan['contentSha256'];
        if (source == null || typeof named !== 'string' || named === source.contentSha256)
          return [];
        return [
          finding(
            'BLOCKER',
            `preparedDocuments.${index}.contentSha256`,
            'The planned document names a SHA-256 that its source revision does not record. A planned document names only the hash recorded on its revision.',
            { sourceId, named, recorded: source.contentSha256 },
          ),
        ];
      }),
    );
  },
};

const PLAN_PREVIOUSLY_SUPPLIED: TechnicalRule = {
  id: 'PLAN.PREVIOUSLY_SUPPLIED',
  checkKind: 'DETERMINISTIC',
  checks:
    "PREVIOUSLY_SUPPLIED only for a source that a prior transmission of the evaluated context (a binding recorded as sent) records among its captured attachments: none is a BLOCKER; one recorded only as COPIED_TEXT_ALLEGATION or UNKNOWN — not observed in the raw MIME — is REVIEW_REQUIRED (recorded posture, not verified). The parent NMI's attachments never count.",
  check(input) {
    const { context } = input.evaluated;
    const priors = new Set(context.priorCorrespondenceIds);
    const observations = new Map<string, string[]>();
    for (const message of context.correspondence) {
      if (!priors.has(message.id)) continue;
      for (const attachment of message.attachmentsManifest ?? []) {
        if (typeof attachment.sourceId !== 'string') continue;
        observations.set(attachment.sourceId, [
          ...(observations.get(attachment.sourceId) ?? []),
          attachment.state,
        ]);
      }
    }
    return executed(
      planEntries(input).flatMap(({ index, plan, sourceId }) => {
        if (plan['state'] !== 'PREVIOUSLY_SUPPLIED') return [];
        const states = observations.get(sourceId) ?? [];
        if (states.length === 0) {
          return [
            finding(
              'BLOCKER',
              `preparedDocuments.${index}.state`,
              'PREVIOUSLY_SUPPLIED names a source that no prior transmission of the evaluated context records among its captured attachments. A source, a sent message or a plan alone does not record that it was supplied.',
              { sourceId, reason: 'NOT_RECORDED_AS_SUPPLIED' },
            ),
          ];
        }
        if (states.includes('OBSERVED_IN_RAW_MIME')) return [];
        return [
          finding(
            'REVIEW_REQUIRED',
            `preparedDocuments.${index}.state`,
            'PREVIOUSLY_SUPPLIED rests only on an attachment recorded as copied-text allegation or unknown, not observed in the raw message: it is the recorded posture, not a verified supply.',
            { sourceId, reason: 'LIMITED_POSTURE', observedStates: [...new Set(states)].sort() },
          ),
        ];
      }),
    );
  },
};

// ---- wording -----------------------------------------------------------------------------------------

/** Wording that says a document is attached or enclosed. */
const ATTACHMENT_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  [
    '"is/are/has been/have been attached or enclosed"',
    /\b(?:is|are|has\s+been|have\s+been)\s+(?:attached|enclosed)\b/giu,
  ],
  [
    '"attached hereto/herewith/is/are"',
    /\battached\s+(?:hereto|herewith|please\s+find|is|are|you\s+will\s+find)\b/giu,
  ],
  [
    '"(please) find/see (the) attached/enclosed"',
    /\b(?:find|see)\s+(?:the\s+)?(?:attached|enclosed)\b/giu,
  ],
  ['"I/we (have) attached/enclosed"', /\b(?:I|we)\s+(?:have\s+)?(?:attached|enclosed)\b/giu],
  ['"enclosed herewith/is/are"', /\benclosed\s+(?:herewith|please\s+find|is|are)\b/giu],
  ['"Attachment(s):"', /\battachments?\s*:/giu],
  ['"in the attached file / attachment"', /\bin\s+the\s+attach(?:ed\s+file|ment)\b/giu],
];

const ATTACHMENT_CLAIM: TechnicalRule = {
  id: 'WORDING.ATTACHMENT_CLAIM',
  checkKind: 'HEURISTIC',
  checks: `Heuristic: wording in the subject or body that says a document is attached or enclosed — ${ATTACHMENT_PATTERNS.map(([label]) => label).join('; ')}. When no planned document is PREPARED_FOR_ATTACHMENT with a file name, REVIEW_REQUIRED (a Drive link or a reference is not an attachment, PFC §7); otherwise a WARNING that the prepared files must be attached outside this application when the message is composed. Nothing is ever marked attached.`,
  check(input) {
    const prepared = planEntries(input).some(
      ({ plan }) =>
        plan['state'] === 'PREPARED_FOR_ATTACHMENT' &&
        typeof plan['fileName'] === 'string' &&
        plan['fileName'] !== '',
    );
    return executed(
      outgoing(input).flatMap(([path, text]) => {
        const hits = ATTACHMENT_PATTERNS.map(
          ([label, pattern]) => [label, patternMatches(text, pattern)] as const,
        ).filter(([, found]) => found.length > 0);
        if (hits.length === 0) return [];
        const details = {
          patterns: hits.map(([label]) => label),
          preparedForAttachment: prepared,
          ...located(
            text,
            hits.flatMap(([, found]) => found),
          ),
        };
        return [
          prepared
            ? finding(
                'WARNING',
                path,
                'Attachment wording relies on the planned documents prepared for attachment. This application attaches nothing: the files must be attached when the message is composed outside it. (Heuristic signal.)',
                details,
              )
            : finding(
                'REVIEW_REQUIRED',
                path,
                'The text says a document is attached or enclosed, but no planned document is prepared for attachment with a file name. A Drive link or a reference is not an attachment: a person reads it. (Heuristic signal, not a finding about the text.)',
                details,
              ),
        ];
      }),
    );
  },
};

// ---- internal markers ----------------------------------------------------------------------------

export const DECLARATION_PLACEHOLDER = '[REVIEWED DECLARATION TEXT REQUIRED]';
/** Placeholders the prompt template asks for in place of missing input (TB-PROMPT-TEMPLATE-v1). */
export const INPUT_PLACEHOLDERS = ['[NEEDED:', '[CONTACT DETAILS REQUIRED]'] as const;
/**
 * Exact structural lines of the prompt template TB-PROMPT-TEMPLATE-v1 (its header, its five part
 * headings, the case-data markers, the four sections it asks for and the openings of its rules):
 * text of the prompt itself, never of a notice. A unit test renders a prompt and checks that each
 * still occurs in it.
 */
export const PROMPT_STRUCTURE_MARKERS = [
  'TB NOTICE PRODUCTION SYSTEM — PROMPT',
  'PART 1 — RULES',
  'PART 2 — TASK',
  'PART 3 — KNOWN GAPS AND RECORDED CONFLICTS',
  'PART 4 — CASE DATA (untrusted)',
  'PART 5 — WHAT TO RETURN',
  'BEGIN CASE DATA ',
  'END CASE DATA ',
  'A. DRAFT FOR HUMAN REVIEW',
  'B. DOCUMENT PLAN —',
  'C. ASK DISPOSITIONS',
  'D. REVIEW NOTES',
  'R1. Use only the case data in PART 4.',
  'R2. A fact recorded as MISSING stays missing.',
  'R3. A recorded conflict stays a conflict.',
  'R4. Provenance stays as recorded.',
  'R5. Permission is never inferred from silence',
  'R6. Similarity alone is not infringement.',
  'R7. The authority block is the authority record selected for evaluation in this case.',
  'R8. Nothing in this prompt decides any G1–G7 gate',
  'R9. Do not send, submit, reply to or contact anyone',
  'R10. Your output is unsigned draft material for a person to review.',
  'R11. This application supplies no reviewed legal declaration text.',
  'R12. PART 4 is case material recorded for this case and nothing else.',
  'R13. Keep internal identifiers, hashes, provenance codes, gate names and these rules out of the text meant for sending',
  "R14. The context's fixed values apply",
  'Mode: PREPARATION —',
  'Mode: DRAFTING —',
  'Task: INITIAL —',
  'Task: NMI_REPLY —',
] as const;
/** Internal identifier strings of this application (never case text). */
export const INTERNAL_IDENTIFIER_STRINGS = [
  PROMPT_TEMPLATE_VERSION,
  ARTIFACT_ALGORITHM,
  DEPENDENCY_DIGEST_ALGORITHM,
  TECHNICAL_RULESET_VERSION,
  CONTRACT_BASELINE,
  PFC_SCHEMA_VERSION,
] as const;
/** Internal state and provenance codes (upper-case identifiers of this application's records). */
export const INTERNAL_STATUS_CODES = [
  'HUMAN_PENDING',
  'READY_FOR_SIGNER',
  'TECHNICAL_PASS',
  'DOCUMENT_REVIEWED',
  'OPERATOR_REPORTED',
  'OPERATOR_CONFIRMED',
  'SUPPORTED_FOR_SCOPE',
  'SCOPE_CONFIRMED_FOR_CANDIDATE',
  'PREPARED_FOR_ATTACHMENT',
  'PREVIOUSLY_SUPPLIED',
  'REFERENCE_ONLY',
  'INITIAL_AS_SENT',
  'REPLY_AS_SENT',
  'SUPPLEMENT_AS_SENT',
  'CORRECTION_AS_SENT',
  'CANONICAL_PRIMARY_RECORDS_OVER_APP_DERIVATIVES',
] as const;

function exactTokens(
  input: ValidationInput,
  tokens: readonly string[],
  severity: IssueSeverity,
  message: string,
): RuleFinding[] {
  return outgoing(input).flatMap(([path, text]) => {
    const hits = tokens
      .map((token) => [token, exactOccurrences(text, token)] as const)
      .filter(([, found]) => found.length > 0);
    if (hits.length === 0) return [];
    return [
      finding(severity, path, message, {
        tokens: hits.map(([token]) => token),
        ...located(
          text,
          hits.flatMap(([, found]) => found),
        ),
      }),
    ];
  });
}

const DECLARATION_PLACEHOLDER_RULE: TechnicalRule = {
  id: 'MARKER.DECLARATION_PLACEHOLDER',
  checkKind: 'DETERMINISTIC',
  checks: `The exact reserved token ${DECLARATION_PLACEHOLDER} in the subject or body — the prompt's stand-in for declaration text that needs human-approved wording — is a BLOCKER: the draft is not complete. No declaration text is supplied, fetched or filled in.`,
  check(input) {
    return executed(
      exactTokens(
        input,
        [DECLARATION_PLACEHOLDER],
        'BLOCKER',
        'The draft still contains the placeholder for reviewed declaration text. It is not complete: the declaration wording needs human-approved text, which this application never supplies or invents.',
      ),
    );
  },
};

const INPUT_PLACEHOLDERS_RULE: TechnicalRule = {
  id: 'MARKER.INPUT_PLACEHOLDERS',
  checkKind: 'DETERMINISTIC',
  checks: `The prompt template's exact placeholders for missing input — ${INPUT_PLACEHOLDERS.join(' and ')} — in the subject or body are a BLOCKER: the draft still marks input it does not have. Nothing is filled in.`,
  check(input) {
    return executed(
      exactTokens(
        input,
        INPUT_PLACEHOLDERS,
        'BLOCKER',
        'The draft still contains a placeholder for missing input ([NEEDED: …] or [CONTACT DETAILS REQUIRED]). It is not complete; nothing is filled in here.',
      ),
    );
  },
};

const PROMPT_STRUCTURE: TechnicalRule = {
  id: 'MARKER.PROMPT_STRUCTURE',
  checkKind: 'DETERMINISTIC',
  checks:
    "The prompt template's exact structural lines (its header, part headings, case-data markers, the four sections it asks for — including the internal review notes — and the openings of its rules R1–R14) in the subject or body are a BLOCKER: prompt text leaked into the text meant for sending.",
  check(input) {
    return executed(
      exactTokens(
        input,
        PROMPT_STRUCTURE_MARKERS,
        'BLOCKER',
        'Text of the prompt itself — a heading, a case-data marker, a section it asks for (such as the internal review notes) or one of its rules — appears in the text meant for sending.',
      ),
    );
  },
};

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu;
const HEX64 = /\b[0-9a-f]{64}\b/giu;
const upperCodes = new RegExp(`\\b(?:${INTERNAL_STATUS_CODES.join('|')})\\b`, 'gu');

const INTERNAL_IDENTIFIERS: TechnicalRule = {
  id: 'MARKER.INTERNAL_IDENTIFIERS',
  checkKind: 'DETERMINISTIC',
  checks: `Exact internal identifiers in the subject or body: the id of a record of the evaluated context, of the candidate or of its prompt snapshot; the prompt SHA-256, a dependency digest or fingerprint; this application's identifier strings (${INTERNAL_IDENTIFIER_STRINGS.join(', ')}); its internal state and provenance codes (${INTERNAL_STATUS_CODES.join(', ')}). REVIEW_REQUIRED — they belong in the text meant for sending only when the correspondence itself needs them (PFC §7).`,
  check(input) {
    const ids = new Set(
      [
        input.candidate.id,
        input.candidate.caseId,
        input.prompt.id,
        ...input.evaluated.dependencies.map((dependency) => dependency.entityId),
        ...input.prompt.dependencyManifest.map((dependency) => dependency.entityId),
      ].map((id) => id.toLowerCase()),
    );
    const hashes = new Set(
      [
        input.prompt.promptSha256,
        input.prompt.dependencyDigest,
        input.evaluated.dependencyDigest,
        ...input.evaluated.dependencies.map((dependency) => dependency.fingerprint),
        ...input.prompt.dependencyManifest.map((dependency) => dependency.fingerprint),
      ].map((hash) => hash.toLowerCase()),
    );
    return executed(
      outgoing(input).flatMap(([path, text]) => {
        const found: Found[] = [
          ...patternMatches(text, UUID).filter((match) => ids.has(match.text.toLowerCase())),
          ...patternMatches(text, HEX64).filter((match) => hashes.has(match.text.toLowerCase())),
          ...INTERNAL_IDENTIFIER_STRINGS.flatMap((token) => exactOccurrences(text, token)),
          ...patternMatches(text, upperCodes),
        ];
        return found.length === 0
          ? []
          : [
              finding(
                'REVIEW_REQUIRED',
                path,
                'Internal identifiers of this application — a record id, a hash or digest, an identifier string or an internal state code — appear in the text meant for sending. They belong there only when the correspondence itself needs them.',
                located(text, found),
              ),
            ];
      }),
    );
  },
};

/** Gate labels: G1–G7 as words, "gate 1", ranges such as "G1–G6". */
const GATE_LABEL = /\bG[1-7]\b|\bgates?\s+G?[1-7]\b/gu;

const GATE_LABELS: TechnicalRule = {
  id: 'MARKER.GATE_LABELS',
  checkKind: 'HEURISTIC',
  checks:
    'Heuristic: internal gate labels (G1 to G7 as a word, "gate 1") in the subject or body. REVIEW_REQUIRED per field — the same letters can mean something else, so a person reads it.',
  check(input) {
    return executed(
      outgoing(input).flatMap(([path, text]) => {
        const found = patternMatches(text, GATE_LABEL);
        return found.length === 0
          ? []
          : [
              finding(
                'REVIEW_REQUIRED',
                path,
                'Text that looks like an internal gate label (G1 to G7) appears in the text meant for sending. Gate names stay internal unless the correspondence needs them: a person reads it. (Heuristic signal.)',
                located(text, found),
              ),
            ];
      }),
    );
  },
};

// ---- the recorded context --------------------------------------------------------------------------

const GENERATION_MODE: TechnicalRule = {
  id: 'CONTEXT.GENERATION_MODE',
  checkKind: 'DETERMINISTIC',
  checks:
    "The candidate's prompt snapshot was generated in DRAFTING mode. A PREPARATION prompt's candidate is draft material only (PFC §3: preparation must not produce a falsely cleared final candidate): a BLOCKER. It is stored and readable; a draft of a DRAFTING prompt is imported as a revision.",
  check(input) {
    return executed(
      input.prompt.generationMode === 'DRAFTING'
        ? []
        : [
            finding(
              'BLOCKER',
              'promptSnapshotId',
              'This candidate was drafted from a PREPARATION prompt snapshot: it is draft material only, not a candidate for production. A draft of a DRAFTING prompt snapshot is imported as a revision.',
              { promptSnapshotId: input.prompt.id, generationMode: input.prompt.generationMode },
            ),
          ],
    );
  },
};

const CONTEXT_MISSING: TechnicalRule = {
  id: 'CONTEXT.MISSING',
  checkKind: 'DETERMINISTIC',
  checks: `Each item the evaluated context records as missing: a DRAFTING-blocking code (${DRAFTING_BLOCKING_CODES.join(', ')}) is a BLOCKER, any other REVIEW_REQUIRED. A missing item stays missing; nothing is filled in or resolved.`,
  check(input) {
    return executed(
      input.evaluated.context.missing.map((item, index) =>
        finding(
          DRAFTING_BLOCKING_CODES.includes(item.code) ? 'BLOCKER' : 'REVIEW_REQUIRED',
          `evaluatedContextJson.missing.${index}`,
          DRAFTING_BLOCKING_CODES.includes(item.code)
            ? `The evaluated context lacks input a draft requires (${item.code}). It stays missing; nothing is filled in.`
            : `The evaluated context records a missing item (${item.code}). It stays missing; how the draft treats it needs review.`,
          { code: item.code, contextFieldPath: item.fieldPath ?? null, recorded: item.message },
        ),
      ),
    );
  },
};

const CONTEXT_CONFLICTS: TechnicalRule = {
  id: 'CONTEXT.CONFLICTS',
  checkKind: 'DETERMINISTIC',
  checks:
    'Each conflict the evaluated context records is REVIEW_REQUIRED. A recorded conflict stays a conflict: it is never resolved or decided here.',
  check(input) {
    return executed(
      input.evaluated.context.conflicts.map((item, index) =>
        finding(
          'REVIEW_REQUIRED',
          `evaluatedContextJson.conflicts.${index}`,
          `The evaluated context records a conflict (${item.code}). It stays a conflict; nothing decides it here.`,
          { code: item.code, contextFieldPath: item.fieldPath ?? null, recorded: item.message },
        ),
      ),
    );
  },
};

const byKey = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const PROMPT_DRIFT: TechnicalRule = {
  id: 'CONTEXT.PROMPT_DRIFT',
  checkKind: 'DETERMINISTIC',
  checks:
    "The prompt snapshot's frozen dependency manifest against the evaluated current one: each record added, removed or changed since the prompt was generated (by its fingerprint) is REVIEW_REQUIRED — the draft was written from the earlier context. When only the digest's identifiers differ, one REVIEW_REQUIRED says so. The prompt snapshot itself never changes.",
  check(input) {
    if (input.prompt.dependencyDigest === input.evaluated.dependencyDigest) return executed([]);
    const key = (dependency: Dependency) => `${dependency.entityType}:${dependency.entityId}`;
    const before = new Map(input.prompt.dependencyManifest.map((d) => [key(d), d]));
    const now = new Map(input.evaluated.dependencies.map((d) => [key(d), d]));
    const keys = [...new Set([...before.keys(), ...now.keys()])].sort(byKey);
    const findings: RuleFinding[] = [];
    for (const k of keys) {
      const was = before.get(k);
      const is = now.get(k);
      if (was !== undefined && is !== undefined && was.fingerprint === is.fingerprint) continue;
      const change = was === undefined ? 'ADDED' : is === undefined ? 'REMOVED' : 'CHANGED';
      const dependency = (is ?? was) as Dependency;
      findings.push(
        finding(
          'REVIEW_REQUIRED',
          `dependencyManifest.${k}`,
          {
            ADDED: `A record the prompt snapshot did not include is now part of the context (${dependency.entityType}): the draft was written without it.`,
            REMOVED: `A record the prompt snapshot included is no longer part of the context (${dependency.entityType}).`,
            CHANGED: `A record of the context changed since the prompt snapshot was generated (${dependency.entityType}): the draft was written from its earlier content.`,
          }[change],
          {
            change,
            entityType: dependency.entityType,
            entityId: dependency.entityId,
            promptFingerprint: was?.fingerprint ?? null,
            currentFingerprint: is?.fingerprint ?? null,
          },
        ),
      );
    }
    if (findings.length === 0) {
      findings.push(
        finding(
          'REVIEW_REQUIRED',
          'dependencyDigest',
          "The prompt snapshot's dependency digest differs from the evaluated one although every record is unchanged: the digest's contract or context-schema identifiers differ.",
          {
            change: 'IDENTIFIERS',
            promptDependencyDigest: input.prompt.dependencyDigest,
            currentDependencyDigest: input.evaluated.dependencyDigest,
          },
        ),
      );
    }
    return executed(findings);
  },
};

// ---- the ruleset and its engine ----------------------------------------------------------------------

/** The rules of TB-TECHNICAL-RULESET-v1, in the order they run and report. */
export const TECHNICAL_RULES: readonly TechnicalRule[] = [
  TEXT_EXACT,
  SHAPE,
  BODY_SHA256,
  ARTIFACT_SHA256,
  SIGNATURE_STATE,
  PENDING_SLOT_ONCE,
  SLOT_LOOKALIKE,
  ADOPTION_WORDING,
  NAME_AFTER_SLOT,
  PROMPT_CASE_TASK,
  THREAD,
  SENDER,
  REPLY_RECIPIENT,
  PLAN_SOURCE_EXISTS,
  PLAN_SOURCE_APPLIES,
  PLAN_SOURCE_IN_CONTEXT,
  PLAN_SOURCE_LATEST,
  PLAN_CONTENT_SHA256,
  PLAN_PREVIOUSLY_SUPPLIED,
  ATTACHMENT_CLAIM,
  DECLARATION_PLACEHOLDER_RULE,
  INPUT_PLACEHOLDERS_RULE,
  PROMPT_STRUCTURE,
  INTERNAL_IDENTIFIERS,
  GATE_LABELS,
  GENERATION_MODE,
  CONTEXT_MISSING,
  CONTEXT_CONFLICTS,
  PROMPT_DRIFT,
];

/**
 * The required inventory of TB-TECHNICAL-RULESET-v1: every rule, with its kind. Kept apart from the
 * implementations on purpose — a rule that is not run (left out, NOT_EXECUTED or failed) still
 * appears here and so in notExecutedRuleIds; unit tests pin this list and the implementations to it.
 */
export const REQUIRED_RULES: ReadonlyArray<{ readonly id: string; readonly checkKind: CheckKind }> =
  [
    { id: 'ARTIFACT.TEXT_EXACT', checkKind: 'DETERMINISTIC' },
    { id: 'ARTIFACT.SHAPE', checkKind: 'DETERMINISTIC' },
    { id: 'ARTIFACT.BODY_SHA256', checkKind: 'DETERMINISTIC' },
    { id: 'ARTIFACT.ARTIFACT_SHA256', checkKind: 'DETERMINISTIC' },
    { id: 'ARTIFACT.SIGNATURE_STATE', checkKind: 'DETERMINISTIC' },
    { id: 'SIGNATURE.PENDING_SLOT_ONCE', checkKind: 'DETERMINISTIC' },
    { id: 'SIGNATURE.SLOT_LOOKALIKE', checkKind: 'HEURISTIC' },
    { id: 'SIGNATURE.ADOPTION_WORDING', checkKind: 'HEURISTIC' },
    { id: 'SIGNATURE.NAME_AFTER_SLOT', checkKind: 'HEURISTIC' },
    { id: 'ENVELOPE.PROMPT_CASE_TASK', checkKind: 'DETERMINISTIC' },
    { id: 'ENVELOPE.THREAD', checkKind: 'DETERMINISTIC' },
    { id: 'ENVELOPE.SENDER', checkKind: 'DETERMINISTIC' },
    { id: 'ENVELOPE.REPLY_RECIPIENT', checkKind: 'DETERMINISTIC' },
    { id: 'PLAN.SOURCE_EXISTS', checkKind: 'DETERMINISTIC' },
    { id: 'PLAN.SOURCE_APPLIES', checkKind: 'DETERMINISTIC' },
    { id: 'PLAN.SOURCE_IN_CONTEXT', checkKind: 'DETERMINISTIC' },
    { id: 'PLAN.SOURCE_LATEST_REVISION', checkKind: 'DETERMINISTIC' },
    { id: 'PLAN.CONTENT_SHA256', checkKind: 'DETERMINISTIC' },
    { id: 'PLAN.PREVIOUSLY_SUPPLIED', checkKind: 'DETERMINISTIC' },
    { id: 'WORDING.ATTACHMENT_CLAIM', checkKind: 'HEURISTIC' },
    { id: 'MARKER.DECLARATION_PLACEHOLDER', checkKind: 'DETERMINISTIC' },
    { id: 'MARKER.INPUT_PLACEHOLDERS', checkKind: 'DETERMINISTIC' },
    { id: 'MARKER.PROMPT_STRUCTURE', checkKind: 'DETERMINISTIC' },
    { id: 'MARKER.INTERNAL_IDENTIFIERS', checkKind: 'DETERMINISTIC' },
    { id: 'MARKER.GATE_LABELS', checkKind: 'HEURISTIC' },
    { id: 'CONTEXT.GENERATION_MODE', checkKind: 'DETERMINISTIC' },
    { id: 'CONTEXT.MISSING', checkKind: 'DETERMINISTIC' },
    { id: 'CONTEXT.CONFLICTS', checkKind: 'DETERMINISTIC' },
    { id: 'CONTEXT.PROMPT_DRIFT', checkKind: 'DETERMINISTIC' },
  ];

export interface RuleRecord {
  readonly ruleId: string;
  readonly checkKind: CheckKind;
  readonly outcome: RuleOutcome;
}

export interface Evaluation {
  readonly rulesetVersion: string;
  readonly result: TechnicalResult;
  readonly records: readonly RuleRecord[];
  readonly findings: readonly Finding[];
  readonly coverageManifest: CoverageManifest;
  readonly counts: {
    readonly blocker: number;
    readonly reviewRequired: number;
    readonly warning: number;
    readonly info: number;
  };
}

export interface EvaluationOptions {
  /** The rules to run (the ruleset's by default; unit tests pass others). */
  readonly rules?: readonly TechnicalRule[];
  /** The required inventory (the ruleset's by default). */
  readonly required?: ReadonlyArray<{ readonly id: string; readonly checkKind: CheckKind }>;
  /** Called before each rule runs: the application's test seam (a no-op there). */
  readonly beforeRule?: (ruleId: string) => void;
}

export const RULE_ERROR_MESSAGE =
  'The rule could not be completed: an internal error occurred while it ran. It produced no finding and is not passed; the run result is ERROR, and nothing about the candidate follows from it.';
const NOT_RUN_REASON = 'the rule is required by this ruleset but was not run';

export function evaluateCandidate(
  input: ValidationInput,
  options: EvaluationOptions = {},
): Evaluation {
  const rules = options.rules ?? TECHNICAL_RULES;
  const required = options.required ?? REQUIRED_RULES;
  const records: RuleRecord[] = [];
  const findings: Finding[] = [];
  for (const rule of rules) {
    const identity = { ruleId: rule.id, checkKind: rule.checkKind };
    let check: Check;
    try {
      options.beforeRule?.(rule.id);
      check = rule.check(input);
    } catch (error) {
      records.push({ ...identity, outcome: 'ERROR' });
      findings.push({
        ...identity,
        severity: 'BLOCKER',
        fieldPath: null,
        message: RULE_ERROR_MESSAGE,
        details: { outcome: 'ERROR', errorName: error instanceof Error ? error.name : 'Error' },
      });
      continue;
    }
    if (check.outcome === 'NOT_EXECUTED') {
      records.push({ ...identity, outcome: 'NOT_EXECUTED' });
      findings.push({
        ...identity,
        severity: 'REVIEW_REQUIRED',
        fieldPath: null,
        message: `The rule was not executed: ${check.reason} It is not passed.`,
        details: { outcome: 'NOT_EXECUTED' },
      });
      continue;
    }
    records.push({ ...identity, outcome: 'EXECUTED' });
    for (const item of check.findings) findings.push({ ...identity, ...item });
  }
  const ran = new Set(records.map((entry) => entry.ruleId));
  for (const rule of required) {
    if (ran.has(rule.id)) continue;
    findings.push({
      ruleId: rule.id,
      checkKind: rule.checkKind,
      severity: 'REVIEW_REQUIRED',
      fieldPath: null,
      message: `The rule was not executed: ${NOT_RUN_REASON}. It is not passed.`,
      details: { outcome: 'NOT_RUN' },
    });
  }
  const executedIds = new Set(
    records.filter((entry) => entry.outcome === 'EXECUTED').map((entry) => entry.ruleId),
  );
  const coverageManifest: CoverageManifest = {
    requiredRuleIds: required.map((rule) => rule.id),
    executedRuleIds: records
      .filter((entry) => entry.outcome === 'EXECUTED')
      .map((entry) => entry.ruleId),
    notExecutedRuleIds: required.map((rule) => rule.id).filter((id) => !executedIds.has(id)),
    semanticReviewRequired: true,
  };
  const count = (severity: IssueSeverity) =>
    findings.filter((item) => item.severity === severity).length;
  const counts = {
    blocker: count('BLOCKER'),
    reviewRequired: count('REVIEW_REQUIRED'),
    warning: count('WARNING'),
    info: count('INFO'),
  };
  const result: TechnicalResult = records.some((entry) => entry.outcome === 'ERROR')
    ? 'ERROR'
    : counts.blocker > 0
      ? 'BLOCKED'
      : counts.reviewRequired > 0 || coverageManifest.notExecutedRuleIds.length > 0
        ? 'REVIEW_REQUIRED'
        : 'TECHNICAL_PASS';
  return {
    rulesetVersion: TECHNICAL_RULESET_VERSION,
    result,
    records,
    findings,
    coverageManifest,
    counts,
  };
}
