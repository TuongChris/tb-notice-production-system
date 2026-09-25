// Rules of a correspondence capture (P4C). A Correspondence row is one captured, recorded
// communication (DOMAIN_MODEL_v1 §13): it never sends, acknowledges, marks read, fetches, contacts or
// submits anything, and capturing it proves no transmission, receipt, authenticity or outcome —
// CAPTURED is not SENT_BY_THE_APP (INVARIANTS §4: "Correspondence ingestion does not send,
// acknowledge or mark a mailbox read").
//
//   stored as supplied   every contracted field after JSON decoding: no trimming, case folding,
//                        newline or Unicode normalization; nothing absent is invented (no header,
//                        address, Message-ID or date is derived from the subject or the body)
//   bodySha256           SHA-256(UTF-8(bodyText)) when body text is recorded, else null
//                        (INVARIANTS §6). It covers the recorded text only, whatever the capture
//                        mode, and is never a raw-MIME hash ("Hash of copied text is not raw MIME
//                        hash"); a NUL in the body is refused (§6)             → 422 VALIDATION_FAILED
//   sourceIdentityHash   null: the contracted input carries no reliable provider or capture identity,
//                        and Message-ID, subject, references, addresses, dates and video URLs are not
//                        identities (INVARIANTS §4) — nothing is deduplicated or merged
//   capture posture      captureMode and bodyRole as supplied (default UNKNOWN), never upgraded;
//                        refused only where the record would contradict itself:
//                          RAW_SOURCE without rawSourceId         (raw MIME is referenced, not invented)
//                          an OBSERVED_IN_RAW_MIME attachment without rawSourceId          (same rule)
//                          an EXCERPT capture with bodyRole FULL_MESSAGE  (an excerpt is not the whole)
//                                                                 → 422 CAPTURE_POSTURE_UNSUPPORTED
//   dates                occurredAt only when supplied (R7 storability rule, 422 before any claim);
//                        never derived from headerDateRaw, which is raw text and never parsed, nor
//                        from createdAt, the ingestion instant; timestampPrecision as supplied,
//                        default UNKNOWN
//   sources              rawSourceId and each attachment sourceId name an existing SourceReference
//                        that applies to the correspondence's agency (source-scope.ts, target
//                        Agency); a case-scoped source is refused: a capture is agency-level and
//                        may be bound into several cases. A pointer proves nothing and is not fetched.
import { createHash } from 'node:crypto';
import type { CreateCorrespondence } from '@tb/contracts';
import type { Correspondence, Prisma } from '../../../generated/prisma/client.js';
import { apiErrors, type ApiError } from '../../infrastructure/http/api-error.js';
import { storabilityProblem } from '../../infrastructure/write/storability.js';
import { auditFields } from '../directory/changes.js';
import type { SourceUse } from '../sources/source-scope.js';

/** Capture instants (DATETIME(3) columns), written as the exact instant storability.ts accepted. */
export const CAPTURE_INSTANT_FIELDS = ['occurredAt'] as const;

/** The request-only checks of a capture (no database), run before an idempotency claim is taken. */
export function captureProblem(body: CreateCorrespondence): ApiError | null {
  const unstorable = storabilityProblem(body, [], CAPTURE_INSTANT_FIELDS);
  if (unstorable) return unstorable;
  if (typeof body.bodyText === 'string' && body.bodyText.includes('\u0000')) {
    return apiErrors.bodyValidationFailed([
      { path: 'bodyText', message: 'Contains a NUL character, which is not stored' },
    ]);
  }
  const rawSourceId = body.rawSourceId ?? null;
  if (body.captureMode === 'RAW_SOURCE' && rawSourceId === null) {
    return apiErrors.capturePostureUnsupported('rawSourceId', 'RAW_SOURCE_NOT_REFERENCED');
  }
  if (rawSourceId === null) {
    const index = (body.attachmentsManifest ?? []).findIndex(
      (attachment) => attachment.state === 'OBSERVED_IN_RAW_MIME',
    );
    if (index >= 0) {
      return apiErrors.capturePostureUnsupported(
        `attachmentsManifest.${index}.state`,
        'RAW_MIME_NOT_REFERENCED',
      );
    }
  }
  if (body.captureMode === 'EXCERPT' && body.bodyRole === 'FULL_MESSAGE') {
    return apiErrors.capturePostureUnsupported('bodyRole', 'EXCERPT_NOT_FULL_MESSAGE');
  }
  return null;
}

/** SHA-256 of the exact UTF-8 bytes of the recorded body text (INVARIANTS §6), or null. */
export function bodySha256(bodyText: string | null): string | null {
  return bodyText === null ? null : createHash('sha256').update(bodyText, 'utf8').digest('hex');
}

/** Every SourceReference a capture cites: its raw source and each attachment's source. */
export function captureSourceUses(body: CreateCorrespondence): SourceUse[] {
  const uses: SourceUse[] = [];
  if (typeof body.rawSourceId === 'string') {
    uses.push({ field: 'rawSourceId', sourceId: body.rawSourceId });
  }
  (body.attachmentsManifest ?? []).forEach((attachment, index) => {
    if (typeof attachment.sourceId === 'string') {
      uses.push({ field: `attachmentsManifest.${index}.sourceId`, sourceId: attachment.sourceId });
    }
  });
  return uses;
}

/**
 * The audit record of a capture: identifiers, modes, the body hash and lengths only. The body,
 * subject, Message-ID, In-Reply-To, addresses, raw header date and limitations keep only their
 * length (changes.ts); references and attachments only their count and, for attachments, the
 * recorded states — never a file name (INVARIANTS §7).
 */
export function captureAuditRecord(row: Correspondence): Prisma.InputJsonObject {
  const references = Array.isArray(row.references) ? row.references : null;
  const attachments = Array.isArray(row.attachmentsManifest) ? row.attachmentsManifest : null;
  const states: Record<string, number> = {};
  for (const attachment of attachments ?? []) {
    const state = (attachment as { state?: unknown } | null)?.state;
    if (typeof state === 'string') states[state] = (states[state] ?? 0) + 1;
  }
  return {
    ...auditFields(row, [
      'agencyId',
      'mailboxAddress',
      'direction',
      'subject',
      'messageId',
      'inReplyTo',
      'captureMode',
      'bodyRole',
      'bodyText',
      'bodySha256',
      'rawSourceId',
      'headerDateRaw',
      'occurredAt',
      'timestampPrecision',
      'fromAddress',
      'toAddress',
      'replyToAddress',
      'limitations',
    ]),
    references: references === null ? null : { redacted: true, count: references.length },
    attachments: attachments === null ? null : { count: attachments.length, states },
  };
}
