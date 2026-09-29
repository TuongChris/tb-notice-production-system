// Contract wire views of the unsigned export (P4I; ADR-0011 Decision 15): the candidate's stored
// subject, envelope, body and hashes exactly as stored — no trimming, normalization, newline
// rewrite, signer name or signature — with signatureState HUMAN_PENDING, sendPerformed false, the
// readiness evaluated for this export and the instant it was evaluated. An unsigned text handoff
// only: no attachment bytes, MIME, SIGNED, SENT or AS_SENT state exists, and nothing is stored.
import { ReadinessSchema, type Envelope, type Readiness, type UnsignedExport } from '@tb/contracts';
import type { NoticeCandidate, Prisma } from '../../../generated/prisma/client.js';
import { apiErrors } from '../../infrastructure/http/api-error.js';

export function toUnsignedExportView(
  candidate: NoticeCandidate,
  readiness: Readiness,
  exportedAt: Date,
): UnsignedExport {
  return {
    candidateId: candidate.id,
    artifactSha256: candidate.artifactSha256,
    bodySha256: candidate.bodySha256,
    subject: candidate.subject,
    envelope: candidate.envelopeJson as unknown as Envelope,
    bodyText: candidate.bodyText,
    signatureState: 'HUMAN_PENDING',
    sendPerformed: false,
    readiness,
    exportedAt: exportedAt.toISOString(),
  };
}

/** What an export's idempotency record keeps: the readiness evaluated and the instant — no text. */
export interface KeptExport {
  readonly readiness: Readiness;
  readonly exportedAt: string;
}

export function keptOf(data: UnsignedExport): Prisma.InputJsonObject {
  return {
    readiness: data.readiness as unknown as Prisma.InputJsonObject,
    exportedAt: data.exportedAt,
  };
}

/** The kept values of a completed export (a stored record that is not one is a 500). */
export function keptExport(kept: unknown): KeptExport {
  const value =
    kept !== null && typeof kept === 'object' && !Array.isArray(kept)
      ? (kept as Record<string, unknown>)
      : null;
  const readiness = ReadinessSchema.safeParse(value?.['readiness']);
  const exportedAt = value?.['exportedAt'];
  if (!readiness.success || typeof exportedAt !== 'string') throw apiErrors.internal();
  return { readiness: readiness.data, exportedAt };
}
