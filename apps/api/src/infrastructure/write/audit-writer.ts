import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import { appendAuditEvent, type AuditEntry } from '../audit/audit-log.js';

/**
 * Appends business audit events inside the caller's transaction. A provider (rather than a bare
 * function) so the integration tests can make an audit insert fail and prove that the business
 * write rolls back with it (AC-056).
 */
@Injectable()
export class AuditWriter {
  append(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
    return appendAuditEvent(tx, entry);
  }
}
