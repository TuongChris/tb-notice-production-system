// Readiness (P4I; ADR-0011, accepted by the operator with the independent review deferred): the pure
// rules that derive a candidate's readiness from records already read in one consistent snapshot —
// no database, clock, randomness, locale, environment or network (the evaluation instant is an
// argument). READY_FOR_SIGNER is a derived, currently evaluated, pre-signature state: "ready for
// authorized human signer review". It is never stored, never a legal approval, a finding of
// ownership, permission or infringement, G7, a signature, an adoption or permission to send; the
// candidate stays unsigned and unsent (signatureState HUMAN_PENDING, externalAction PROHIBITED).
//
//   epoch      E = (candidateId, artifactSha256, dependencyDigest, rulesetVersion) (ADR-0008): the
//              candidate's stored artifact, the CURRENT digest of exactly its prompt snapshot's
//              scope and the ruleset the server runs now. Every counted input binds exactly E.
//   run        only runs of exactly E count. Equivalent runs (same result, coverage manifest and
//              deterministic issues as rule, kind, severity and field) → the latest recorded one,
//              (createdAt DESC, id DESC); runs that disagree → TECHNICAL_RUN_CONFLICT, none counts.
//              READY needs a counted TECHNICAL_PASS with every required rule executed (no waiver:
//              D-6 stays deferred; PLAN.SOURCE_IN_CONTEXT is never cleared by an assessment).
//   gates      per gate the heads of the candidate's supersession chains whose epoch is exactly E:
//              none → UNASSESSED, several → CONFLICT (never the latest or a convenient PASS), one →
//              its result; a PASS counts only when scope-confirmed, attributable, with intact
//              supports, answered NMI asks (G6) and a G1 review not overtaken by a captured
//              temporal boundary. Six PASS gates are needed: nothing compensates for one.
//   time       only captured boundaries of the selected authority stale the G1 review; time alone
//              never does (no age rule). A date is the interval in which it is that date somewhere
//              on earth (UTC−12:00 … UTC+14:00); no midnight or timezone is invented.
//   status     the strongest tier present (ADR-0011 Decision 3); READY_FOR_SIGNER exactly when no
//              reason code is present. Reason codes are stable identifiers in a pinned order and
//              never carry record content.
import type { ExportUnsigned, GateSummary, Readiness } from '@tb/contracts';
import { apiErrors, type ApiError } from '../../infrastructure/http/api-error.js';
import {
  exactTextSha256,
  PENDING_SIGNATURE,
  tbCanonicalSha256,
} from '../../infrastructure/integrity/tb-canonical-json.js';
import {
  currentHeads,
  GATES,
  sameEpoch,
  supersessionIntegrity,
  type AssessmentEpoch,
  type ChainRecord,
  type Gate,
} from '../assessments/assessment-rules.js';
import {
  CANDIDATE_SIGNATURE_STATE,
  candidateArtifactSha256,
} from '../candidates/candidate-artifact.js';
import { storedEnvelopeOf, storedPlansOf } from '../validation/technical-ruleset.js';
import { exactOccurrences } from '../validation/text-scan.js';

export type ReadinessStatus = Readiness['status'];
export type GateStatus = GateSummary['status'];
export type TechnicalResult = NonNullable<Readiness['technicalResult']>;

/** The two constants of every readiness: G7 stays human and outside; nothing external happens. */
export const READINESS_SIGNATURE_STATE = 'HUMAN_PENDING';
export const READINESS_EXTERNAL_ACTION = 'PROHIBITED';

// ---- reason codes ----------------------------------------------------------------------------------

/** The status of a non-PASS gate as named in the readiness list, strongest first. */
const GATE_STATUS_ORDER = ['BLOCKED', 'CONFLICT', 'MISSING', 'HOLD', 'UNASSESSED'] as const;

/** The causes a gate summary names besides its status code (also listed once in the readiness). */
const GATE_CAUSES = [
  'ASSESSMENT_INTEGRITY_FAILED',
  'ASSESSMENT_STALE',
  'G1_TEMPORAL_REVIEW_STALE',
  'GATE_HEADS_UNRECONCILED',
  'SCOPE_NOT_CONFIRMED',
  'ASSESSMENT_RECORD_INCOMPLETE',
  'ASSESSMENT_PROVENANCE_UNSUPPORTED',
  'G1_REVIEW_TIME_UNKNOWN',
  'TEMPORAL_BOUNDARY_AMBIGUOUS',
  'G6_ASK_DISPOSITIONS_MISSING',
  'G6_ASK_LEGAL_REVIEW_REQUIRED',
  'G6_ASK_SOURCE_NOT_APPLICABLE',
] as const;

/** Every code a readiness may list, in the order it lists them (a unit test pins it). */
export const READINESS_REASON_ORDER: readonly string[] = [
  'CANDIDATE_SUPERSEDED',
  'CASE_ARCHIVED',
  'PREPARATION_MODE',
  'CONTEXT_INPUT_MISSING',
  'CONTEXT_TOO_LARGE',
  'ARTIFACT_INTEGRITY_FAILED',
  'SIGNATURE_SLOT_INVALID',
  'VALIDATION_MISSING',
  'VALIDATION_STALE',
  'VALIDATION_BLOCKED',
  'VALIDATION_ERROR',
  'TECHNICAL_RUN_CONFLICT',
  'VALIDATION_REVIEW_REQUIRED',
  'PLAN_SOURCE_NOT_IN_CONTEXT',
  'VALIDATION_COVERAGE_INCOMPLETE',
  'CONTEXT_MISSING_ITEMS',
  'CONTEXT_CONFLICTS',
  'AUTHORITY_EFFECTIVE_DATE_NOT_REACHED',
  ...GATES.flatMap((gate) => GATE_STATUS_ORDER.map((status) => `${gate}_${status}`)),
  ...GATE_CAUSES,
];

/** Every code a gate summary may list, in the order it lists them (a unit test pins it). */
export const GATE_REASON_ORDER: readonly string[] = [
  ...GATE_STATUS_ORDER.map((status) => `GATE_${status}`),
  ...GATE_CAUSES,
];

/** The codes present, in `order` (each once); a code outside the order is a programming error. */
function ordered(codes: ReadonlySet<string>, order: readonly string[]): string[] {
  for (const code of codes) {
    if (!order.includes(code)) throw new Error(`Unknown readiness reason code ${code}`);
  }
  return order.filter((code) => codes.has(code));
}

/**
 * The status tiers, strongest first (ADR-0011 Decision 3). The first tier with a code present
 * decides; any other code needs a review (REVIEW_REQUIRED); no code at all is READY_FOR_SIGNER.
 */
const STATUS_TIERS: ReadonlyArray<readonly [ReadinessStatus, readonly string[]]> = [
  ['SUPERSEDED', ['CANDIDATE_SUPERSEDED']],
  [
    'BLOCKED',
    [
      'CASE_ARCHIVED',
      'PREPARATION_MODE',
      'CONTEXT_INPUT_MISSING',
      'CONTEXT_TOO_LARGE',
      'ARTIFACT_INTEGRITY_FAILED',
      'SIGNATURE_SLOT_INVALID',
    ],
  ],
  ['UNVALIDATED', ['VALIDATION_MISSING']],
  ['STALE_REVALIDATION_REQUIRED', ['VALIDATION_STALE']],
  [
    'BLOCKED',
    [
      'VALIDATION_BLOCKED',
      'VALIDATION_ERROR',
      'ASSESSMENT_INTEGRITY_FAILED',
      ...GATES.map((gate) => `${gate}_BLOCKED`),
    ],
  ],
  ['STALE_REVALIDATION_REQUIRED', ['ASSESSMENT_STALE', 'G1_TEMPORAL_REVIEW_STALE']],
];

/** The status the reason codes decide (see STATUS_TIERS). */
export function statusOf(codes: ReadonlySet<string>): ReadinessStatus {
  for (const [status, tier] of STATUS_TIERS) {
    if (tier.some((code) => codes.has(code))) return status;
  }
  return codes.size === 0 ? 'READY_FOR_SIGNER' : 'REVIEW_REQUIRED';
}

// ---- inputs ----------------------------------------------------------------------------------------

/** The candidate exactly as stored (P4F): immutable content, its hashes and its supersession. */
export interface ReadinessCandidate {
  readonly id: string;
  readonly subject: string;
  readonly bodyText: string;
  readonly bodySha256: string;
  readonly artifactSha256: string;
  /** The stored envelope JSON (every contracted key, text or null). */
  readonly envelope: unknown;
  /** The stored document plan JSON. */
  readonly preparedDocuments: unknown;
  readonly signatureState: string;
  readonly superseded: boolean;
}

/**
 * A captured temporal boundary of the selected authority: an exact instant, or a civil date in no
 * known timezone ('YYYY-MM-DD').
 */
export type TemporalBoundary =
  | { readonly kind: 'INSTANT'; readonly at: Date }
  | { readonly kind: 'DATE'; readonly date: string };

/** The dates and instants of the context's authority rows (DATE columns as 'YYYY-MM-DD'). */
export interface AuthorityRecordTimes {
  /** The pinned MandateVersions. */
  readonly versions: ReadonlyArray<{
    readonly effectiveOn: string | null;
    readonly expiresOn: string | null;
  }>;
  /** The pinned MandateCoverages. */
  readonly coverages: ReadonlyArray<{
    readonly effectiveOn: string | null;
    readonly expiresOn: string | null;
  }>;
  /** The selected signer's CoverageSigner rows under the pinned coverages. */
  readonly coverageSigners: ReadonlyArray<{
    readonly effectiveOn: string | null;
    readonly endsOn: string | null;
  }>;
  /** The AuthorityEvents of the context (whole-mandate and pinned-coverage events). */
  readonly events: ReadonlyArray<{
    readonly id: string;
    readonly supersedesEventId: string | null;
    readonly effectiveAt: Date | null;
    readonly effectiveOn: string | null;
  }>;
}

/** What readiness reads of the CURRENT production context of the candidate's prompt scope. */
export interface ReadinessContext {
  readonly caseArchived: boolean;
  readonly taskType: 'INITIAL' | 'NMI_REPLY';
  readonly generationMode: 'PREPARATION' | 'DRAFTING';
  /** The prompt's parent binding (an NMI_REPLY's parent; null for INITIAL). */
  readonly parentBindingId: string | null;
  /** The current digest of the scope (TB-PRODUCTION-CONTEXT-DIGEST-v2). */
  readonly dependencyDigest: string;
  /** The DRAFTING-blocking codes missing now (P4D's gate). */
  readonly blockingMissing: readonly string[];
  readonly missingCount: number;
  readonly conflictCount: number;
  /** Whether a list of the context exceeds a contracted bound. */
  readonly tooLarge: boolean;
  /** Each source the context lists → whether it applies to the case now (context-sources.ts). */
  readonly listedSourceApplies: ReadonlyMap<string, boolean>;
  readonly authority: AuthorityRecordTimes;
}

/** The ruleset the server runs now. */
export interface CurrentRuleset {
  readonly version: string;
  readonly requiredRuleIds: readonly string[];
}

/** A stored ValidationRun (the fields readiness reads). */
export interface RunRecord extends AssessmentEpoch {
  readonly id: string;
  readonly result: TechnicalResult;
  readonly coverageManifest: unknown;
  readonly createdAt: Date;
}

/** A stored ValidationIssue (the fields readiness compares). */
export interface IssueRecord {
  readonly ruleId: string;
  readonly checkKind: string;
  readonly severity: string;
  readonly fieldPath: string | null;
}

/** A stored CandidateAssessment (the fields readiness reads). */
export interface ReadinessAssessment extends ChainRecord, AssessmentEpoch {
  readonly result: 'PASS' | 'HOLD' | 'BLOCKED' | 'MISSING' | 'CONFLICT';
  readonly scopeState: 'RECORDED_NOT_ADOPTED' | 'SCOPE_CONFIRMED_FOR_CANDIDATE';
  readonly performerLabel: string;
  readonly rationale: string;
  readonly scopeText: string;
  readonly provenance: string;
  readonly assessedAt: Date | null;
  /** The stored ask dispositions JSON, or null. */
  readonly askDispositions: unknown;
}

/** One stored AssessmentSource row with its CaseSource as it is now. */
export interface SupportRecord {
  readonly caseSourceId: string;
  /** The case of the CaseSource. */
  readonly caseId: string;
  /** The present state of the link. */
  readonly linkState: string;
  readonly sourceId: string;
}

export interface ReadinessInput {
  readonly candidate: ReadinessCandidate;
  /** The candidate's case. */
  readonly caseId: string;
  readonly context: ReadinessContext;
  readonly ruleset: CurrentRuleset;
  /** Every run of the candidate, of any epoch (history). */
  readonly runs: readonly RunRecord[];
  /** The issues of each run of exactly E (every such run has an entry). */
  readonly issues: ReadonlyMap<string, readonly IssueRecord[]>;
  /** Every assessment of the candidate, of any epoch and gate. */
  readonly assessments: readonly ReadinessAssessment[];
  /** The stored supports of each countable head (countableHeads), by assessment id. */
  readonly supports: ReadonlyMap<string, readonly SupportRecord[]>;
  /** Each source a countable G6 head's ask dispositions cite → exists and applies to the case now. */
  readonly askSourceApplies: ReadonlyMap<string, boolean>;
}

// ---- epoch and runs ----------------------------------------------------------------------------------

/** The current epoch: derived by the server, never supplied by a client. */
export function readinessEpoch(
  candidate: Pick<ReadinessCandidate, 'id' | 'artifactSha256'>,
  context: Pick<ReadinessContext, 'dependencyDigest'>,
  ruleset: Pick<CurrentRuleset, 'version'>,
): AssessmentEpoch {
  return {
    candidateId: candidate.id,
    artifactSha256: candidate.artifactSha256,
    dependencyDigest: context.dependencyDigest,
    rulesetVersion: ruleset.version,
  };
}

/** Latest recorded first: (createdAt DESC, id DESC). */
function latestFirst<T extends { readonly createdAt: Date; readonly id: string }>(
  rows: readonly T[],
): T[] {
  return [...rows].sort(
    (a, b) =>
      b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
  );
}

/** The runs of exactly `epoch`, latest recorded first. A run of another epoch never counts. */
export function epochRuns<T extends RunRecord>(runs: readonly T[], epoch: AssessmentEpoch): T[] {
  return latestFirst(runs.filter((run) => sameEpoch(run, epoch)));
}

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const texts = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : null;

/**
 * Whether a run's coverage manifest shows every rule the current ruleset requires executed and no
 * rule not executed (INVARIANTS §2 step 4: ERROR / NOT_EXECUTED is never PASS).
 */
export function coverageComplete(manifest: unknown, requiredRuleIds: readonly string[]): boolean {
  const coverage = record(manifest);
  const executed = texts(coverage?.['executedRuleIds']);
  const notExecuted = texts(coverage?.['notExecutedRuleIds']);
  if (executed === null || notExecuted === null || notExecuted.length > 0) return false;
  const done = new Set(executed);
  return requiredRuleIds.every((id) => done.has(id));
}

/**
 * The material outcome of a run: its result, its coverage manifest as stored and its deterministic
 * issues as (rule id, check kind, severity, field path), as a multiset. Messages and details are
 * not compared (details may name what the digest does not fingerprint).
 */
function outcomeKey(run: RunRecord, issues: readonly IssueRecord[]): string {
  const deterministic = issues
    .filter((issue) => issue.checkKind === 'DETERMINISTIC')
    .map((issue) => [issue.ruleId, issue.checkKind, issue.severity, issue.fieldPath])
    .sort((a, b) => {
      const x = JSON.stringify(a);
      const y = JSON.stringify(b);
      return x < y ? -1 : x > y ? 1 : 0;
    });
  return tbCanonicalSha256({
    result: run.result,
    coverageManifest: run.coverageManifest ?? null,
    issues: deterministic,
  });
}

const RESULT_CODE: Readonly<Record<TechnicalResult, string | null>> = {
  TECHNICAL_PASS: null,
  BLOCKED: 'VALIDATION_BLOCKED',
  REVIEW_REQUIRED: 'VALIDATION_REVIEW_REQUIRED',
  ERROR: 'VALIDATION_ERROR',
};

/** What the technical runs of E contribute: the counted run (if any) and the reason codes. */
export interface TechnicalOutcome {
  readonly counted: RunRecord | null;
  readonly codes: ReadonlySet<string>;
}

/**
 * The technical baseline (ADR-0011 Decision 4–5): no run → VALIDATION_MISSING; runs but none of E
 * → VALIDATION_STALE; runs of E that disagree → TECHNICAL_RUN_CONFLICT with each disagreeing
 * result's code (none counts); else the latest equivalent run counts with its result's code, its
 * stored BLOCKER / REVIEW_REQUIRED issues whatever its result, PLAN_SOURCE_NOT_IN_CONTEXT when that
 * rule reported, and VALIDATION_COVERAGE_INCOMPLETE unless every required rule was executed.
 */
export function technicalOutcome(
  runs: readonly RunRecord[],
  issues: ReadonlyMap<string, readonly IssueRecord[]>,
  epoch: AssessmentEpoch,
  ruleset: CurrentRuleset,
): TechnicalOutcome {
  const codes = new Set<string>();
  if (runs.length === 0) return { counted: null, codes: new Set(['VALIDATION_MISSING']) };
  const current = epochRuns(runs, epoch);
  if (current.length === 0) return { counted: null, codes: new Set(['VALIDATION_STALE']) };
  const issuesOf = (run: RunRecord): readonly IssueRecord[] => {
    const found = issues.get(run.id);
    if (found === undefined) throw new Error(`The issues of run ${run.id} were not read`);
    return found;
  };
  const outcomes = new Set(current.map((run) => outcomeKey(run, issuesOf(run))));
  if (outcomes.size > 1) {
    codes.add('TECHNICAL_RUN_CONFLICT');
    for (const run of current) {
      const code = RESULT_CODE[run.result];
      if (code !== null) codes.add(code);
    }
    return { counted: null, codes };
  }
  const counted = current[0] as RunRecord;
  const resultCode = RESULT_CODE[counted.result];
  if (resultCode !== null) codes.add(resultCode);
  const countedIssues = issuesOf(counted);
  if (counted.result !== 'ERROR') {
    if (countedIssues.some((issue) => issue.severity === 'BLOCKER'))
      codes.add('VALIDATION_BLOCKED');
    if (countedIssues.some((issue) => issue.severity === 'REVIEW_REQUIRED')) {
      codes.add('VALIDATION_REVIEW_REQUIRED');
    }
  }
  if (
    countedIssues.some(
      (issue) =>
        issue.ruleId === 'PLAN.SOURCE_IN_CONTEXT' &&
        (issue.severity === 'BLOCKER' || issue.severity === 'REVIEW_REQUIRED'),
    )
  ) {
    codes.add('PLAN_SOURCE_NOT_IN_CONTEXT');
  }
  if (!coverageComplete(counted.coverageManifest, ruleset.requiredRuleIds)) {
    codes.add('VALIDATION_COVERAGE_INCOMPLETE');
  }
  return { counted, codes };
}

// ---- time --------------------------------------------------------------------------------------------

const HOUR_MS = 3_600_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * The instants at which civil date `date` is the date somewhere on earth: from the start of the
 * date at UTC+14:00 ((D−1)T10:00:00.000Z) inclusive to its end at UTC−12:00 ((D+1)T12:00:00.000Z)
 * exclusive. Before `start` it is before the date everywhere; from `end` on, after it everywhere.
 */
export function dateWindow(date: string): { readonly start: number; readonly end: number } {
  const midnight = DATE_PATTERN.test(date) ? Date.parse(`${date}T00:00:00.000Z`) : Number.NaN;
  if (Number.isNaN(midnight)) throw new Error('A stored date is not a calendar date');
  return { start: midnight - 14 * HOUR_MS, end: midnight + 36 * HOUR_MS };
}

/**
 * The captured temporal boundaries of the selected authority: the pinned versions' and coverages'
 * effective and expiry dates, the selected signer's association dates and every AuthorityEvent
 * without a successor among the events (a corrected event is replaced by its correction) at its
 * exact instant, else its date. A missing date is no boundary (UNKNOWN, never perpetual); no event
 * type is interpreted.
 */
export function temporalBoundaries(times: AuthorityRecordTimes): TemporalBoundary[] {
  const boundaries: TemporalBoundary[] = [];
  const date = (value: string | null) => {
    if (value !== null) boundaries.push({ kind: 'DATE', date: value });
  };
  for (const version of times.versions) {
    date(version.effectiveOn);
    date(version.expiresOn);
  }
  for (const coverage of times.coverages) {
    date(coverage.effectiveOn);
    date(coverage.expiresOn);
  }
  for (const signer of times.coverageSigners) {
    date(signer.effectiveOn);
    date(signer.endsOn);
  }
  const corrected = new Set(
    times.events.map((event) => event.supersedesEventId).filter((id): id is string => id !== null),
  );
  for (const event of times.events) {
    if (corrected.has(event.id)) continue;
    if (event.effectiveAt !== null) boundaries.push({ kind: 'INSTANT', at: event.effectiveAt });
    else date(event.effectiveOn);
  }
  return boundaries;
}

/**
 * The start dates of the selected authority records not reached at `now`: ahead everywhere →
 * AUTHORITY_EFFECTIVE_DATE_NOT_REACHED; possibly reached (the evaluation instant falls on the
 * date somewhere) → TEMPORAL_BOUNDARY_AMBIGUOUS. No legal invalidity is stated.
 */
export function effectiveDateCodes(times: AuthorityRecordTimes, now: Date): Set<string> {
  const codes = new Set<string>();
  const starts = [
    ...times.versions.map((row) => row.effectiveOn),
    ...times.coverages.map((row) => row.effectiveOn),
    ...times.coverageSigners.map((row) => row.effectiveOn),
  ].filter((value): value is string => value !== null);
  for (const start of starts) {
    const window = dateWindow(start);
    if (now.getTime() < window.start) codes.add('AUTHORITY_EFFECTIVE_DATE_NOT_REACHED');
    else if (now.getTime() < window.end) codes.add('TEMPORAL_BOUNDARY_AMBIGUOUS');
  }
  return codes;
}

/** How a G1 review at `assessedAt` stands against one boundary at `now`. */
export type ReviewTiming = 'FRESH' | 'STALE' | 'AMBIGUOUS' | 'UNKNOWN';

/**
 * One boundary against the counted G1 review (ADR-0011 Decision 9). An instant `e`: stale when
 * assessedAt < e ≤ now. A date: a review after its window is post-boundary; one inside it is
 * ambiguous; one before it is stale once `now` is after the window, ambiguous while `now` is inside
 * it and fresh while the window lies ahead. A review time that is unknown — null, or after the
 * evaluation instant (no actual review lies in the future) — is never replaced by the recording
 * time: with the boundary possibly or surely reached, the review cannot be placed (UNKNOWN).
 */
export function reviewTiming(
  boundary: TemporalBoundary,
  assessedAt: Date | null,
  now: Date,
): ReviewTiming {
  const at = now.getTime();
  const reached =
    boundary.kind === 'INSTANT' ? boundary.at.getTime() : dateWindow(boundary.date).start;
  if (assessedAt === null || assessedAt.getTime() > at) return reached <= at ? 'UNKNOWN' : 'FRESH';
  const reviewed = assessedAt.getTime();
  if (boundary.kind === 'INSTANT') {
    const effective = boundary.at.getTime();
    return reviewed < effective && effective <= at ? 'STALE' : 'FRESH';
  }
  const window = dateWindow(boundary.date);
  if (reviewed >= window.end) return 'FRESH';
  if (reviewed >= window.start) return 'AMBIGUOUS';
  if (at >= window.end) return 'STALE';
  return at >= window.start ? 'AMBIGUOUS' : 'FRESH';
}

const TIMING_CODE: Readonly<Record<Exclude<ReviewTiming, 'FRESH'>, string>> = {
  STALE: 'G1_TEMPORAL_REVIEW_STALE',
  AMBIGUOUS: 'TEMPORAL_BOUNDARY_AMBIGUOUS',
  UNKNOWN: 'G1_REVIEW_TIME_UNKNOWN',
};

/** The temporal causes of the counted G1 review (none while it is fresh against every boundary). */
export function g1TemporalCauses(
  boundaries: readonly TemporalBoundary[],
  assessedAt: Date | null,
  now: Date,
): Set<string> {
  const causes = new Set<string>();
  for (const boundary of boundaries) {
    const timing = reviewTiming(boundary, assessedAt, now);
    if (timing !== 'FRESH') causes.add(TIMING_CODE[timing]);
  }
  return causes;
}

// ---- gates -------------------------------------------------------------------------------------------

/** A stored ask disposition (the fields readiness reads). */
interface StoredDisposition {
  readonly parentBindingId: string;
  readonly disposition: string;
  readonly sourceIds: readonly string[];
}

/** The stored ask dispositions: [] for none, null when the stored value is not in its stored form. */
export function storedDispositions(value: unknown): StoredDisposition[] | null {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const dispositions: StoredDisposition[] = [];
  for (const entry of value) {
    const item = record(entry);
    const sourceIds = texts(item?.['sourceIds']);
    if (
      item === null ||
      typeof item['parentBindingId'] !== 'string' ||
      typeof item['disposition'] !== 'string' ||
      sourceIds === null
    ) {
      return null;
    }
    dispositions.push({
      parentBindingId: item['parentBindingId'],
      disposition: item['disposition'],
      sourceIds,
    });
  }
  return dispositions;
}

/** A PASS head that may count: the one current head of its gate, PASS and scope-confirmed. */
function countable(head: ReadinessAssessment): boolean {
  return head.result === 'PASS' && head.scopeState === 'SCOPE_CONFIRMED_FOR_CANDIDATE';
}

/**
 * The heads the loader reads supports (and, for G6, ask sources) for: per gate the single current
 * head of E when it is a scope-confirmed PASS.
 */
export function countableHeads(
  assessments: readonly ReadinessAssessment[],
  epoch: AssessmentEpoch,
): ReadinessAssessment[] {
  return GATES.flatMap((gate) => {
    const heads = currentHeads(assessments, gate, epoch);
    const head = heads[0];
    return heads.length === 1 && head !== undefined && countable(head) ? [head] : [];
  });
}

/** The sources a countable G6 head's ask dispositions cite (a malformed record cites none). */
export function askSourceIds(head: ReadinessAssessment): string[] {
  const dispositions = storedDispositions(head.askDispositions) ?? [];
  return [...new Set(dispositions.flatMap((disposition) => [...disposition.sourceIds]))].sort();
}

const visible = (value: string) => /\S/u.test(value);

const MAX_SUPPORTS = 100;

/** The gate evaluation: the wire summary plus its causes (each also listed once by the readiness). */
export interface GateEvaluation {
  readonly summary: GateSummary;
  readonly causes: ReadonlySet<string>;
}

function gateEvaluation(
  gate: Gate,
  status: GateStatus,
  assessmentId: string | null,
  causes: readonly string[],
): GateEvaluation {
  const reported = status === 'PASS' ? [] : causes;
  const codes = new Set<string>(status === 'PASS' ? [] : [`GATE_${status}`, ...reported]);
  return {
    summary: { gate, status, assessmentId, reasonCodes: ordered(codes, GATE_REASON_ORDER) },
    causes: new Set(reported),
  };
}

/** Why a countable head's stored supports cannot carry a PASS now (INVARIANTS §2 step 5). */
function supportsIntact(
  supports: readonly SupportRecord[] | undefined,
  caseId: string,
  listedSourceApplies: ReadonlyMap<string, boolean>,
): boolean {
  if (supports === undefined || supports.length < 1 || supports.length > MAX_SUPPORTS) return false;
  return supports.every(
    (support) =>
      support.caseId === caseId &&
      support.linkState === 'LINKED' &&
      listedSourceApplies.get(support.sourceId) === true,
  );
}

/**
 * One gate (ADR-0011 Decisions 6–9): the heads of its chains at exactly E. None → UNASSESSED (with
 * ASSESSMENT_STALE when the gate has assessments of other epochs); several → CONFLICT; one → its
 * result, a PASS counting only when scope-confirmed, attributable (visible performer, rationale and
 * scope text; a provenance that does not contradict it), with intact supports, answered NMI asks
 * (G6) and a fresh G1 review. Among several causes: BLOCKED > UNASSESSED (a stale G1 review) > HOLD.
 */
export function evaluateGate(
  gate: Gate,
  input: Pick<
    ReadinessInput,
    'assessments' | 'supports' | 'askSourceApplies' | 'caseId' | 'context'
  >,
  epoch: AssessmentEpoch,
  now: Date,
): GateEvaluation {
  const history = input.assessments.filter(
    (assessment) => assessment.candidateId === epoch.candidateId && assessment.gate === gate,
  );
  const heads = currentHeads(input.assessments, gate, epoch);
  if (heads.length === 0) {
    return gateEvaluation(gate, 'UNASSESSED', null, history.length > 0 ? ['ASSESSMENT_STALE'] : []);
  }
  const head = heads[0] as ReadinessAssessment;
  if (heads.length > 1) {
    return gateEvaluation(gate, 'CONFLICT', null, ['GATE_HEADS_UNRECONCILED']);
  }
  if (head.result !== 'PASS') return gateEvaluation(gate, head.result, head.id, []);
  if (!countable(head)) return gateEvaluation(gate, 'HOLD', head.id, ['SCOPE_NOT_CONFIRMED']);

  const { context } = input;
  const causes = new Set<string>();
  if (!supportsIntact(input.supports.get(head.id), input.caseId, context.listedSourceApplies)) {
    causes.add('ASSESSMENT_INTEGRITY_FAILED');
  }
  const dispositions = storedDispositions(head.askDispositions);
  if (
    dispositions === null ||
    (context.taskType === 'INITIAL' && dispositions.length > 0) ||
    dispositions.some((disposition) => disposition.parentBindingId !== context.parentBindingId)
  ) {
    causes.add('ASSESSMENT_INTEGRITY_FAILED');
  }
  if (!visible(head.performerLabel) || !visible(head.rationale) || !visible(head.scopeText)) {
    causes.add('ASSESSMENT_RECORD_INCOMPLETE');
  }
  if (head.provenance === 'MISSING' || head.provenance === 'CONFLICT') {
    causes.add('ASSESSMENT_PROVENANCE_UNSUPPORTED');
  }
  if (gate === 'G6' && context.taskType === 'NMI_REPLY' && dispositions !== null) {
    if (dispositions.length === 0) causes.add('G6_ASK_DISPOSITIONS_MISSING');
    if (dispositions.some((disposition) => disposition.disposition === 'LEGAL_REVIEW_REQUIRED')) {
      causes.add('G6_ASK_LEGAL_REVIEW_REQUIRED');
    }
    if (
      dispositions.some((disposition) =>
        disposition.sourceIds.some((sourceId) => input.askSourceApplies.get(sourceId) !== true),
      )
    ) {
      causes.add('G6_ASK_SOURCE_NOT_APPLICABLE');
    }
  }
  if (gate === 'G1') {
    const boundaries = temporalBoundaries(context.authority);
    for (const cause of g1TemporalCauses(boundaries, head.assessedAt, now)) causes.add(cause);
  }
  const status: GateStatus = causes.has('ASSESSMENT_INTEGRITY_FAILED')
    ? 'BLOCKED'
    : causes.has('G1_TEMPORAL_REVIEW_STALE')
      ? 'UNASSESSED'
      : causes.size > 0
        ? 'HOLD'
        : 'PASS';
  return gateEvaluation(gate, status, head.id, [...causes]);
}

// ---- the candidate itself ----------------------------------------------------------------------------

/**
 * The stored text still hashes to its recorded hashes: the body with exactTextSha256 and the
 * artifact with TB-CANDIDATE-ARTIFACT-v1 (a text that is not exact text never hashes).
 */
export function artifactIntact(candidate: ReadinessCandidate): boolean {
  const envelope = storedEnvelopeOf(candidate.envelope);
  const preparedDocuments = storedPlansOf(candidate.preparedDocuments);
  if (envelope === null || preparedDocuments === null) return false;
  try {
    return (
      exactTextSha256(candidate.bodyText) === candidate.bodySha256 &&
      candidateArtifactSha256({
        subject: candidate.subject,
        bodyText: candidate.bodyText,
        envelope,
        preparedDocuments,
      }) === candidate.artifactSha256
    );
  } catch {
    return false;
  }
}

/**
 * The pending signature slot (INVARIANTS §2 step 9): HUMAN_PENDING, the exact slot exactly once in
 * the body and never in the subject — the token and counting of SIGNATURE.PENDING_SLOT_ONCE. A
 * signer's name elsewhere is not a signature; nothing is inserted.
 */
export function signatureSlotValid(
  candidate: Pick<ReadinessCandidate, 'signatureState' | 'bodyText' | 'subject'>,
): boolean {
  return (
    candidate.signatureState === CANDIDATE_SIGNATURE_STATE &&
    exactOccurrences(candidate.bodyText, PENDING_SIGNATURE).length === 1 &&
    exactOccurrences(candidate.subject, PENDING_SIGNATURE).length === 0
  );
}

// ---- readiness -----------------------------------------------------------------------------------------

/** The derived readiness and what it counted (the wire object plus the counted records). */
export interface ReadinessEvaluation {
  readonly readiness: Readiness;
  readonly epoch: AssessmentEpoch;
  readonly countedRun: RunRecord | null;
}

/**
 * The readiness of one candidate at `now` from records read in one snapshot (ADR-0011). Corrupt
 * supersession chains are never evaluated (500), exactly like the P4H readers.
 */
export function evaluateReadiness(input: ReadinessInput, now: Date): ReadinessEvaluation {
  const { candidate, context } = input;
  const epoch = readinessEpoch(candidate, context, input.ruleset);
  if (supersessionIntegrity(input.assessments).length > 0) throw apiErrors.internal();

  const codes = new Set<string>();
  if (candidate.superseded) codes.add('CANDIDATE_SUPERSEDED');
  if (context.caseArchived) codes.add('CASE_ARCHIVED');
  if (context.generationMode === 'PREPARATION') codes.add('PREPARATION_MODE');
  if (context.generationMode === 'DRAFTING' && context.blockingMissing.length > 0) {
    codes.add('CONTEXT_INPUT_MISSING');
  }
  if (context.tooLarge) codes.add('CONTEXT_TOO_LARGE');
  if (!artifactIntact(candidate)) codes.add('ARTIFACT_INTEGRITY_FAILED');
  if (!signatureSlotValid(candidate)) codes.add('SIGNATURE_SLOT_INVALID');

  const technical = technicalOutcome(input.runs, input.issues, epoch, input.ruleset);
  for (const code of technical.codes) codes.add(code);
  if (context.missingCount > 0) codes.add('CONTEXT_MISSING_ITEMS');
  if (context.conflictCount > 0) codes.add('CONTEXT_CONFLICTS');
  for (const code of effectiveDateCodes(context.authority, now)) codes.add(code);

  const gates = GATES.map((gate) => evaluateGate(gate, input, epoch, now));
  for (const { summary, causes } of gates) {
    if (summary.status !== 'PASS') codes.add(`${summary.gate}_${summary.status}`);
    for (const cause of causes) codes.add(cause);
  }

  const counted = technical.counted;
  return {
    epoch,
    countedRun: counted,
    readiness: {
      candidateId: candidate.id,
      artifactSha256: epoch.artifactSha256,
      dependencyDigest: epoch.dependencyDigest,
      rulesetVersion: epoch.rulesetVersion,
      status: statusOf(codes),
      technicalResult: counted?.result ?? null,
      validationRunId: counted?.id ?? null,
      gates: gates.map(({ summary }) => summary),
      reasonCodes: ordered(codes, READINESS_REASON_ORDER),
      signatureState: READINESS_SIGNATURE_STATE,
      externalAction: READINESS_EXTERNAL_ACTION,
      evaluatedAt: now.toISOString(),
    },
  };
}

// ---- the unsigned export -------------------------------------------------------------------------------

/**
 * Why an unsigned export (or its replay) releases nothing under `readiness`, the readiness it just
 * re-evaluated (ADR-0011 Decisions 14 and 17), null when it may: the caller's view of the epoch
 * first — the artifact (412 ARTIFACT_CHANGED), the digest (412 CONTEXT_CHANGED) — then the status
 * (409 CANDIDATE_NOT_READY with the status and reason codes), then the counted run (412
 * VALIDATION_RUN_CHANGED). Nothing is substituted: an expectation either equals the current value
 * or the export is refused.
 */
export function exportRefusal(readiness: Readiness, body: ExportUnsigned): ApiError | null {
  if (readiness.artifactSha256 !== body.expectedArtifactSha256) {
    return apiErrors.exportArtifactChanged();
  }
  if (readiness.dependencyDigest !== body.expectedDependencyDigest) {
    return apiErrors.exportContextChanged();
  }
  if (readiness.status !== 'READY_FOR_SIGNER') {
    return apiErrors.candidateNotReady(readiness.status, readiness.reasonCodes);
  }
  if (readiness.validationRunId !== body.validationRunId) return apiErrors.validationRunChanged();
  return null;
}
