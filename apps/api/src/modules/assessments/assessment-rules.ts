// Rules of a CandidateAssessment (P4H; ADR-0008 and ADR-0009, accepted by the operator with the
// independent review deferred) that need no database: the request-only checks run before an
// idempotency claim, and the pure epoch, head and supersession rules the capture uses now and a
// later readiness evaluation reuses. A CandidateAssessment records one attributable G1–G6 review of
// one exact candidate artifact, bound to one evaluation epoch. It decides nothing itself: recording
// is not counting, and nothing here derives readiness, READY_FOR_SIGNER, G7, a signature or
// permission to send.
//
//   text          every text is kept exactly as decoded from JSON: no trimming, newline,
//                 whitespace or Unicode normalization. NUL is refused (INVARIANTS §6; the request
//                 parser refuses unpaired surrogates) → 422 VALIDATION_FAILED, before a claim.
//   assessedAt    the actual assessment instant exactly as supplied (R7 storability, 422 otherwise)
//                 or null — never replaced by the recording time (INVARIANTS §2 step 5).
//   supports      each CaseSource once per assessment (422 VALIDATION_FAILED; the unique key
//                 (assessment, case source) is only the backstop); each ask of a parent message once.
//   provenance    D-4: an AI_ASSISTED performer never records DOCUMENT_REVIEWED (422
//                 REVIEW_UNSUPPORTED). A HUMAN performer, or a DOCUMENTED_EXTERNAL_REVIEW reported by
//                 the operator, records it only as the explicit statement of an actual review; it is
//                 never inferred from a source, link, file name, URL or metadata, and never upgraded.
//   epoch         E = (candidateId, artifactSha256, dependencyDigest, rulesetVersion) (ADR-0008
//                 Decision 3). The server derives the current epoch; the request states its
//                 expectations, and the ruleset identifier must be the one the server runs now.
//   supersession  a successor names the head of a chain of the same candidate and gate (D-2: its
//                 epoch may differ). Staleness is separate from supersession, and a supersession
//                 changes selection only: the predecessor and its supports never change.
//   applicability D-3: a PASS rests only on supports whose source applies to the case now; HOLD,
//                 BLOCKED, MISSING and CONFLICT may cite a linked source of the case that no longer
//                 applies, to record the problem truthfully.
import { codePointLength, type CaptureAssessment } from '@tb/contracts';
import {
  apiErrors,
  type ApiError,
  type ValidationIssue,
} from '../../infrastructure/http/api-error.js';
import { storabilityProblem } from '../../infrastructure/write/storability.js';

export const GATES = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6'] as const;
export type Gate = (typeof GATES)[number];
export type AssessmentResult = CaptureAssessment['result'];

/** The evaluation epoch an assessment or a technical run binds (ADR-0008 Decision 3). */
export interface AssessmentEpoch {
  readonly candidateId: string;
  readonly artifactSha256: string;
  readonly dependencyDigest: string;
  readonly rulesetVersion: string;
}

/** The epoch of a record (its four binding values, nothing else). */
export function epochOf(record: AssessmentEpoch): AssessmentEpoch {
  return {
    candidateId: record.candidateId,
    artifactSha256: record.artifactSha256,
    dependencyDigest: record.dependencyDigest,
    rulesetVersion: record.rulesetVersion,
  };
}

/** Exactly the same epoch: all four values equal. There is no partial match and no mixing. */
export function sameEpoch(a: AssessmentEpoch, b: AssessmentEpoch): boolean {
  return (
    a.candidateId === b.candidateId &&
    a.artifactSha256 === b.artifactSha256 &&
    a.dependencyDigest === b.dependencyDigest &&
    a.rulesetVersion === b.rulesetVersion
  );
}

/**
 * The exact ruleset binding: a new assessment records the ruleset the server runs now, never one
 * the caller chooses (a historical v1 or v2 identifier included).
 */
export function rulesetProblem(requested: string, current: string): ApiError | null {
  return requested === current ? null : apiErrors.rulesetNotCurrent(current);
}

/** D-3: the results whose every cited support must apply to the case now. */
export function supportsMustApply(result: AssessmentResult): boolean {
  return result === 'PASS';
}

/** D-4: the provenance a performer kind may never record. */
export function provenanceProblem(
  body: Pick<CaptureAssessment, 'performerKind' | 'provenance'>,
): ApiError | null {
  return body.performerKind === 'AI_ASSISTED' && body.provenance === 'DOCUMENT_REVIEWED'
    ? apiErrors.aiDocumentReviewUnsupported()
    : null;
}

function nulIssues(value: unknown, path: readonly string[], issues: ValidationIssue[]): void {
  if (typeof value === 'string') {
    if (value.includes('\u0000')) {
      issues.push({
        path: path.join('.'),
        message: 'Contains a NUL character, which is not stored',
      });
    }
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => nulIssues(item, [...path, String(index)], issues));
  } else if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) nulIssues(item, [...path, key], issues);
  }
}

/**
 * The request-only checks of a capture (no database), run before an idempotency claim: NUL
 * anywhere, a storable assessedAt, each CaseSource supported once, each ask of a parent message
 * once (422 VALIDATION_FAILED), then the D-4 provenance rule (422 REVIEW_UNSUPPORTED).
 */
export function captureRequestProblem(body: CaptureAssessment): ApiError | null {
  const issues: ValidationIssue[] = [];
  nulIssues(body, [], issues);
  if (issues.length > 0) return apiErrors.bodyValidationFailed(issues);
  const storability = storabilityProblem(body, [], ['assessedAt']);
  if (storability) return storability;
  const supports = new Set<string>();
  body.sources.forEach((support, index) => {
    if (supports.has(support.caseSourceId)) {
      issues.push({
        path: `sources.${index}.caseSourceId`,
        message: 'Each case source supports an assessment once',
      });
    }
    supports.add(support.caseSourceId);
  });
  const asks = new Set<string>();
  (body.askDispositions ?? []).forEach((disposition, index) => {
    const key = `${disposition.parentBindingId}\u0000${disposition.askId}`;
    if (asks.has(key)) {
      issues.push({
        path: `askDispositions.${index}.askId`,
        message: 'Each ask of a parent message has one disposition',
      });
    }
    asks.add(key);
  });
  if (issues.length > 0) return apiErrors.bodyValidationFailed(issues);
  return provenanceProblem(body);
}

/** One link of a supersession chain (the fields the chain rules read). */
export interface ChainRecord {
  readonly id: string;
  readonly caseId: string;
  readonly candidateId: string;
  readonly gate: Gate;
  readonly supersedesAssessmentId: string | null;
}

/**
 * Why `predecessor` cannot be superseded by a new assessment of `successor`'s candidate and gate
 * (null when it can): another case's (422 CROSS_CASE_REFERENCE), another candidate's or another
 * gate's (422 REVISION_SCOPE_CHANGE), or not the head of its chain (409
 * ASSESSMENT_ALREADY_SUPERSEDED naming its successor). The epochs may differ (D-2).
 */
export function supersessionProblem(
  predecessor: ChainRecord,
  successor: { readonly caseId: string; readonly candidateId: string; readonly gate: Gate },
  existingSuccessorId: string | null,
): ApiError | null {
  const field = 'supersedesAssessmentId';
  if (predecessor.caseId !== successor.caseId) {
    return apiErrors.crossCaseReference(field, 'record');
  }
  if (predecessor.candidateId !== successor.candidateId) {
    return apiErrors.revisionScopeChange(['candidateId'], 'assessment');
  }
  if (predecessor.gate !== successor.gate) {
    return apiErrors.revisionScopeChange(['gate'], 'assessment');
  }
  return existingSuccessorId === null
    ? null
    : apiErrors.assessmentAlreadySuperseded(existingSuccessorId);
}

/**
 * The heads of the supersession chains of one candidate and gate: its assessments that no
 * assessment supersedes, in the order given. Several heads are unreconciled conclusions (a later
 * readiness evaluation reports CONFLICT), never resolved here by taking the latest.
 */
export function assessmentHeads<T extends ChainRecord>(
  records: readonly T[],
  candidateId: string,
  gate: Gate,
): T[] {
  const superseded = new Set(
    records
      .map((record) => record.supersedesAssessmentId)
      .filter((id): id is string => id !== null),
  );
  return records.filter(
    (record) =>
      record.candidateId === candidateId && record.gate === gate && !superseded.has(record.id),
  );
}

/**
 * The current heads of one gate at one epoch: the heads of the gate's chains whose epoch is exactly
 * `epoch`. A head of another epoch is stale and never counts; staleness needs no supersession.
 */
export function currentHeads<T extends ChainRecord & AssessmentEpoch>(
  records: readonly T[],
  gate: Gate,
  epoch: AssessmentEpoch,
): T[] {
  return assessmentHeads(records, epoch.candidateId, gate).filter((record) =>
    sameEpoch(record, epoch),
  );
}

/**
 * The integrity of stored supersession chains: every supersedesAssessmentId names a record of the
 * set of the same case, candidate and gate, no record has two successors, and no chain loops. The
 * problems found, in a fixed order (none for sound chains); a reader treats any as a 500.
 */
export function supersessionIntegrity(records: readonly ChainRecord[]): string[] {
  const byId = new Map(records.map((record) => [record.id, record]));
  const problems: string[] = [];
  const successors = new Map<string, string[]>();
  for (const record of records) {
    const predecessorId = record.supersedesAssessmentId;
    if (predecessorId === null) continue;
    const predecessor = byId.get(predecessorId);
    if (predecessor === undefined) {
      problems.push(`${record.id}: supersedes an assessment outside the set`);
      continue;
    }
    if (
      predecessor.caseId !== record.caseId ||
      predecessor.candidateId !== record.candidateId ||
      predecessor.gate !== record.gate
    ) {
      problems.push(`${record.id}: supersedes another case, candidate or gate`);
    }
    successors.set(predecessorId, [...(successors.get(predecessorId) ?? []), record.id]);
  }
  for (const [predecessorId, ids] of successors) {
    if (ids.length > 1) problems.push(`${predecessorId}: has ${ids.length} successors`);
  }
  for (const record of records) {
    const seen = new Set<string>();
    let current: ChainRecord | undefined = record;
    while (current !== undefined && current.supersedesAssessmentId !== null) {
      if (seen.has(current.id)) {
        problems.push(`${record.id}: its chain loops`);
        break;
      }
      seen.add(current.id);
      current = byId.get(current.supersedesAssessmentId);
    }
  }
  return problems;
}

/** A free text in audit: only its length (INVARIANTS §7 "Audit redact ... full private bodies"). */
export const textLength = (value: string) => ({
  redacted: true,
  codePoints: codePointLength(value),
});
