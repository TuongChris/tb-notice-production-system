import type { Prisma } from '../../../generated/prisma/client.js';

export interface AuditEntry {
  readonly requestId: string;
  /** The acting application User, or null when no app user acted (e.g. the local admin CLI). */
  readonly actorUserId: string | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string | null;
  /** Minimal redacted before-state; never credentials, tokens or their digests. */
  readonly before?: Prisma.InputJsonObject;
  /** Minimal redacted after-state; never credentials, tokens or their digests. */
  readonly after?: Prisma.InputJsonObject;
  readonly reason?: string;
  /** Source references the recorded change cites (AuditEvent.sourceIds); never inferred. */
  readonly sourceIds?: readonly string[];
}

// Defensive guard: these key names must never appear in an audit payload (DATABASE_SCHEMA_v1
// AuditEvent: "Passwords, session tokens and raw confidential bodies excluded").
const FORBIDDEN_KEY = /password|token|secret|csrf|hash|cookie/i;

/**
 * Appends one application audit event inside the caller's transaction (INVARIANTS §5: audit is
 * written atomically with the change it records). The audit trail is not tamper-proof evidence.
 */
export async function appendAuditEvent(
  tx: Prisma.TransactionClient,
  entry: AuditEntry,
): Promise<void> {
  for (const key of [...Object.keys(entry.before ?? {}), ...Object.keys(entry.after ?? {})]) {
    if (FORBIDDEN_KEY.test(key)) throw new Error(`audit payload key "${key}" is not permitted`);
  }
  await tx.auditEvent.create({
    data: {
      requestId: entry.requestId,
      actorUserId: entry.actorUserId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      ...(entry.before === undefined ? {} : { beforeRedacted: entry.before }),
      ...(entry.after === undefined ? {} : { afterRedacted: entry.after }),
      ...(entry.reason === undefined ? {} : { reason: entry.reason }),
      ...(entry.sourceIds === undefined || entry.sourceIds.length === 0
        ? {}
        : { sourceIds: [...entry.sourceIds] }),
    },
  });
}
