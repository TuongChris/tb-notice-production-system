// Contract wire views of a ValidationRun and its ValidationIssues (P4G), exactly as stored: the
// evaluated context, dependency manifest and coverage manifest (JSON columns) as recorded when the
// run was committed, the instants as ISO 8601 UTC strings. A run and its issues never change: no
// row version, no ETag, no update or delete. A list of runs returns the summary DTO (no context,
// manifest or coverage — API_CONTRACT_v1 §11); nothing here recomputes a result.
import type {
  CoverageManifest,
  Dependency,
  ProductionContext,
  ValidationIssue as ValidationIssueWire,
  ValidationRun as ValidationRunWire,
  ValidationRunSummary,
} from '@tb/contracts';
import type { ValidationIssue, ValidationRun } from '../../../generated/prisma/client.js';

export function toValidationRunView(row: ValidationRun): ValidationRunWire {
  return {
    id: row.id,
    candidateId: row.candidateId,
    caseId: row.caseId,
    artifactSha256: row.artifactSha256,
    dependencyDigest: row.dependencyDigest,
    dependencyManifest: row.dependencyManifest as unknown as Dependency[],
    evaluatedContextJson: row.evaluatedContextJson as unknown as ProductionContext,
    rulesetVersion: row.rulesetVersion,
    result: row.result,
    coverageManifest: row.coverageManifest as unknown as CoverageManifest,
    blockerCount: row.blockerCount,
    reviewRequiredCount: row.reviewRequiredCount,
    warningCount: row.warningCount,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    createdById: row.createdById,
  };
}

/** The columns of a run summary: never the evaluated context, a manifest or the coverage. */
export const RUN_SUMMARY_COLUMNS = {
  id: true,
  candidateId: true,
  caseId: true,
  artifactSha256: true,
  dependencyDigest: true,
  rulesetVersion: true,
  result: true,
  blockerCount: true,
  reviewRequiredCount: true,
  warningCount: true,
  startedAt: true,
  completedAt: true,
  createdAt: true,
} as const;

export function toValidationRunSummary(
  row: Pick<ValidationRun, keyof typeof RUN_SUMMARY_COLUMNS>,
): ValidationRunSummary {
  return {
    id: row.id,
    candidateId: row.candidateId,
    caseId: row.caseId,
    artifactSha256: row.artifactSha256,
    dependencyDigest: row.dependencyDigest,
    rulesetVersion: row.rulesetVersion,
    result: row.result,
    blockerCount: row.blockerCount,
    reviewRequiredCount: row.reviewRequiredCount,
    warningCount: row.warningCount,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toValidationIssueView(row: ValidationIssue): ValidationIssueWire {
  return {
    id: row.id,
    runId: row.runId,
    ruleId: row.ruleId,
    checkKind: row.checkKind,
    severity: row.severity,
    fieldPath: row.fieldPath,
    message: row.message,
    details: (row.details ?? null) as ValidationIssueWire['details'],
    createdAt: row.createdAt.toISOString(),
    createdById: row.createdById,
  };
}
