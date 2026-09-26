// Contract wire views of a NoticeCandidate (P4F), exactly as stored: the subject and body text as
// stored, the envelope and the document plans (JSON columns) as stored, the hashes computed at
// insert, the instants as ISO 8601 UTC strings. A candidate's content never changes and it carries
// no row version or ETag; only its dedicated supersession sets supersededAt and supersedeReason. A
// list returns the summary DTO (no body, envelope or document plan — API_CONTRACT_v1 §11); the full
// candidate is read by id. Nothing here recomputes a hash or derives a readiness state.
import type {
  DocumentPlan,
  Envelope,
  NoticeCandidate as NoticeCandidateWire,
  NoticeCandidateSummary,
} from '@tb/contracts';
import type { NoticeCandidate } from '../../../generated/prisma/client.js';

export function toCandidateView(row: NoticeCandidate): NoticeCandidateWire {
  return {
    id: row.id,
    caseId: row.caseId,
    promptSnapshotId: row.promptSnapshotId,
    parentCandidateId: row.parentCandidateId,
    version: row.version,
    taskType: row.taskType,
    subject: row.subject,
    envelopeJson: row.envelopeJson as unknown as Envelope,
    bodyText: row.bodyText,
    bodySha256: row.bodySha256,
    artifactSha256: row.artifactSha256,
    preparedDocuments: row.preparedDocuments as unknown as DocumentPlan[],
    signatureState: row.signatureState,
    authoringTool: row.authoringTool,
    revisionReason: row.revisionReason,
    supersededAt: row.supersededAt === null ? null : row.supersededAt.toISOString(),
    supersedeReason: row.supersedeReason,
    createdAt: row.createdAt.toISOString(),
    createdById: row.createdById,
  };
}

/** The columns of a summary: never the body, the envelope or a document plan. */
export const SUMMARY_COLUMNS = {
  id: true,
  caseId: true,
  promptSnapshotId: true,
  version: true,
  taskType: true,
  subject: true,
  bodySha256: true,
  artifactSha256: true,
  signatureState: true,
  supersededAt: true,
  createdAt: true,
} as const;

export function toCandidateSummary(
  row: Pick<NoticeCandidate, keyof typeof SUMMARY_COLUMNS>,
): NoticeCandidateSummary {
  return {
    id: row.id,
    caseId: row.caseId,
    promptSnapshotId: row.promptSnapshotId,
    version: row.version,
    taskType: row.taskType,
    subject: row.subject,
    bodySha256: row.bodySha256,
    artifactSha256: row.artifactSha256,
    signatureState: row.signatureState,
    supersededAt: row.supersededAt === null ? null : row.supersededAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}
