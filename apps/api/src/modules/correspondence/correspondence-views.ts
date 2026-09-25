// Contract wire views of captured correspondence and its case bindings (P4C), exactly as stored:
// timestamps as ISO 8601 UTC strings, the JSON columns (references, attachment observations) as
// stored, every text exactly as recorded. Both records are append-only: no row version, no ETag.
// A list returns the summary DTO (no body, no manifest — API_CONTRACT_v1 §11); the full record is
// read by id.
import type {
  AttachmentObservation,
  Correspondence as CorrespondenceWire,
  CorrespondenceBinding as CorrespondenceBindingWire,
  CorrespondenceSummary,
} from '@tb/contracts';
import type { Correspondence, CorrespondenceBinding } from '../../../generated/prisma/client.js';

const iso = (value: Date | null): string | null => (value === null ? null : value.toISOString());

export function toCorrespondenceView(row: Correspondence): CorrespondenceWire {
  return {
    id: row.id,
    agencyId: row.agencyId,
    mailboxAddress: row.mailboxAddress,
    direction: row.direction,
    subject: row.subject,
    messageId: row.messageId,
    inReplyTo: row.inReplyTo,
    references: row.references as string[] | null,
    sourceIdentityHash: row.sourceIdentityHash,
    captureMode: row.captureMode,
    bodyRole: row.bodyRole,
    bodyText: row.bodyText,
    bodySha256: row.bodySha256,
    rawSourceId: row.rawSourceId,
    attachmentsManifest: row.attachmentsManifest as AttachmentObservation[] | null,
    headerDateRaw: row.headerDateRaw,
    occurredAt: iso(row.occurredAt),
    timestampPrecision: row.timestampPrecision,
    fromAddress: row.fromAddress,
    toAddress: row.toAddress,
    replyToAddress: row.replyToAddress,
    limitations: row.limitations,
    createdAt: row.createdAt.toISOString(),
    createdById: row.createdById,
  };
}

/** The columns of a list row (the summary DTO carries neither the body nor the manifest). */
export const SUMMARY_COLUMNS = {
  id: true,
  agencyId: true,
  mailboxAddress: true,
  direction: true,
  subject: true,
  messageId: true,
  captureMode: true,
  bodyRole: true,
  rawSourceId: true,
  occurredAt: true,
  createdAt: true,
} as const;

export function toCorrespondenceSummary(
  row: Pick<Correspondence, keyof typeof SUMMARY_COLUMNS>,
): CorrespondenceSummary {
  return {
    id: row.id,
    agencyId: row.agencyId,
    mailboxAddress: row.mailboxAddress,
    direction: row.direction,
    subject: row.subject,
    messageId: row.messageId,
    captureMode: row.captureMode,
    bodyRole: row.bodyRole,
    rawSourceId: row.rawSourceId,
    occurredAt: iso(row.occurredAt),
    createdAt: row.createdAt.toISOString(),
  };
}

/** One binding exactly as recorded: the operator's interpretation of one message for one case. */
export function toCorrespondenceBindingView(row: CorrespondenceBinding): CorrespondenceBindingWire {
  return {
    id: row.id,
    caseId: row.caseId,
    agencyId: row.agencyId,
    correspondenceId: row.correspondenceId,
    reportedItemId: row.reportedItemId,
    eventType: row.eventType,
    platformReference: row.platformReference,
    outcome: row.outcome,
    interpretation: row.interpretation,
    supersedesBindingId: row.supersedesBindingId,
    createdAt: row.createdAt.toISOString(),
    createdById: row.createdById,
  };
}
