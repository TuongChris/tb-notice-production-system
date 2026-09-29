// The application audit history, read-only (listAuditEvents, GET /audit-events — contracted since
// TB-SCHEMA-API-v1.0.0 and unrouted until R14-AUD-018; no wire change). Every AuditEvent row is
// returned exactly as stored: its redacted before/after state, reason and source ids as the writer
// recorded them, never enriched from a present-day record, re-redacted or rewritten.
//
//   order    (createdAt DESC, id DESC), keyset pagination; the cursor is bound to the operation and
//            to q, entityType and entityId (a cursor of another filter set is 400 INVALID_CURSOR).
//   filters  entityType and entityId: exact equality (binary collation), each when given.
//   q        exactly an event id, a request id, an action, an entity type, an entity id or an actor
//            user id — never a text search of reasons or recorded state.
// A read writes nothing (no audit event about reading, no idempotency record, no row version); the
// response is `Cache-Control: no-store` like every API response. Session-protected by the global
// guard; there is no tenant ACL: any signed-in application user reads the whole history, as every
// other record of the application.
import { Injectable } from '@nestjs/common';
import type { AuditEvent as AuditEventView } from '@tb/contracts';
import { Prisma, type AuditEvent } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { CursorCodec } from '../../infrastructure/write/cursor.js';
import {
  inIdOrder,
  keysetAfter,
  pageLimit,
  pageRequest,
  searchText,
  toPage,
} from '../../infrastructure/write/pagination.js';
import { contractOperation, type QueryValues } from '../../infrastructure/write/request-parsing.js';

const OPERATION = contractOperation('listAuditEvents');

/** A stored event exactly as recorded (AuditEvent, TB-SCHEMA-API-v1.0.0). */
export function toAuditEventView(row: AuditEvent): AuditEventView {
  return {
    id: row.id,
    actorUserId: row.actorUserId,
    requestId: row.requestId,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    beforeRedacted: row.beforeRedacted as AuditEventView['beforeRedacted'],
    afterRedacted: row.afterRedacted as AuditEventView['afterRedacted'],
    reason: row.reason,
    sourceIds: row.sourceIds as AuditEventView['sourceIds'],
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class AuditEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cursors: CursorCodec,
  ) {}

  async list(query: QueryValues): Promise<{ items: AuditEventView[]; nextCursor: string | null }> {
    const q = searchText(query);
    const entityType = typeof query['entityType'] === 'string' ? query['entityType'] : null;
    const entityId = typeof query['entityId'] === 'string' ? query['entityId'] : null;
    const page = pageRequest(OPERATION, query, this.cursors, { q, entityType, entityId });
    const type = entityType === null ? Prisma.empty : Prisma.sql`AND e.entity_type = ${entityType}`;
    const entity = entityId === null ? Prisma.empty : Prisma.sql`AND e.entity_id = ${entityId}`;
    const match =
      q === null
        ? Prisma.empty
        : Prisma.sql`AND (e.id = ${q} OR e.request_id = ${q} OR e.action = ${q}
            OR e.entity_type = ${q} OR e.entity_id = ${q} OR e.actor_user_id = ${q})`;
    const ids = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT e.id FROM audit_events e WHERE TRUE ${type} ${entity} ${match}
        ${keysetAfter(page.after, 'e')}
        ORDER BY e.created_at DESC, e.id DESC ${pageLimit(page)}`,
    );
    const rows = await this.prisma.auditEvent.findMany({
      where: { id: { in: ids.map((row) => row.id) } },
    });
    return toPage(inIdOrder(ids, rows), page, this.cursors, toAuditEventView);
  }
}
