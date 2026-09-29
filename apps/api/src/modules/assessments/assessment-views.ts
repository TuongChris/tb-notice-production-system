// Contract wire views of a CandidateAssessment and its AssessmentSource rows (P4H), exactly as
// stored: the texts as recorded, the instants as ISO 8601 UTC strings, the ask dispositions as the
// JSON recorded (null when none were supplied). Both records are append-only: no row version, no
// ETag, no update or delete. Nothing here resolves present-day state — no link state, source
// revision, applicability or staleness is ever added to a stored record.
import type {
  AskDisposition,
  AssessmentSource as AssessmentSourceWire,
  CandidateAssessment as CandidateAssessmentWire,
} from '@tb/contracts';
import type { AssessmentSource, CandidateAssessment } from '../../../generated/prisma/client.js';

export function toCandidateAssessmentView(row: CandidateAssessment): CandidateAssessmentWire {
  return {
    id: row.id,
    candidateId: row.candidateId,
    caseId: row.caseId,
    gate: row.gate,
    result: row.result,
    artifactSha256: row.artifactSha256,
    dependencyDigest: row.dependencyDigest,
    rulesetVersion: row.rulesetVersion,
    scopeState: row.scopeState,
    performerKind: row.performerKind,
    performerLabel: row.performerLabel,
    assessedAt: row.assessedAt === null ? null : row.assessedAt.toISOString(),
    provenance: row.provenance,
    rationale: row.rationale,
    scopeText: row.scopeText,
    limitations: row.limitations,
    askDispositions: (row.askDispositions ?? null) as AskDisposition[] | null,
    supersedesAssessmentId: row.supersedesAssessmentId,
    createdAt: row.createdAt.toISOString(),
    createdById: row.createdById,
  };
}

export function toAssessmentSourceView(row: AssessmentSource): AssessmentSourceWire {
  return {
    id: row.id,
    assessmentId: row.assessmentId,
    caseSourceId: row.caseSourceId,
    supportedConclusion: row.supportedConclusion,
    createdAt: row.createdAt.toISOString(),
    createdById: row.createdById,
  };
}
