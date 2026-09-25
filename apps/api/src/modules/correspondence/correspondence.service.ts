// Correspondence (P4C) — captured communications of one agency's mailbox, recorded exactly as
// supplied (DOMAIN_MODEL_v1 §13; rules in correspondence-rules.ts). Capture is not a send: nothing
// here sends, acknowledges, marks read, fetches, contacts or submits anything, and no capture
// creates a case binding, a case fact, an outcome or any case change.
//
//   list     capture order (createdAt DESC, id DESC) — the ingestion order, not the order the
//            messages occurred in; `agencyId`: exact filter; `q`: the exact id, or a literal, case-
//            and accent-insensitive substring of the subject, mailbox, Message-ID, sender or
//            recipient address (discovery only: nothing is merged or matched as an identity). The
//            summary DTO carries neither the body nor the attachment observations.
//   capture  POST /correspondence with an Idempotency-Key and no If-Match (the contract declares no
//            precondition target): the agency exists (422) and is not archived (409); the raw source
//            and attachment sources exist and apply to that agency (422); one immutable row and one
//            audit event, no ETag. Two captures of the same Message-ID or subject are two records.
//   get      any correspondence by id, exactly as stored (the body is untrusted content: returned
//            as recorded, never interpreted).
// Lock order: Agency (share) → SourceReference (share).
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  Correspondence as CorrespondenceView,
  CorrespondenceSummary,
  CreateCorrespondence,
} from '@tb/contracts';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { apiErrors } from '../../infrastructure/http/api-error.js';
import { CursorCodec } from '../../infrastructure/write/cursor.js';
import {
  containsPattern,
  inIdOrder,
  keysetAfter,
  pageLimit,
  pageRequest,
  searchText,
  toPage,
} from '../../infrastructure/write/pagination.js';
import { contractOperation, type QueryValues } from '../../infrastructure/write/request-parsing.js';
import { toDbInstant } from '../../infrastructure/write/storability.js';
import {
  WriteExecutor,
  type WriteReply,
  type WriteRequester,
} from '../../infrastructure/write/write-executor.js';
import { created } from '../directory/outcomes.js';
import { lockForShare } from '../directory/records.js';
import { assertSourcesUsable, sourceIdsOf } from '../sources/source-scope.js';
import {
  bodySha256,
  captureAuditRecord,
  captureProblem,
  captureSourceUses,
} from './correspondence-rules.js';
import {
  SUMMARY_COLUMNS,
  toCorrespondenceSummary,
  toCorrespondenceView,
} from './correspondence-views.js';

const ENTITY = 'Correspondence';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A nullable JSON request value as Prisma data: absent or null is SQL NULL, never JSON null. */
function jsonColumn(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === undefined || value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

@Injectable()
export class CorrespondenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly writes: WriteExecutor,
    private readonly cursors: CursorCodec,
  ) {}

  async list(
    query: QueryValues,
  ): Promise<{ items: CorrespondenceSummary[]; nextCursor: string | null }> {
    const q = searchText(query);
    const agencyId = typeof query['agencyId'] === 'string' ? query['agencyId'] : null;
    const page = pageRequest(contractOperation('listCorrespondence'), query, this.cursors, {
      q,
      agencyId,
    });
    const agency = agencyId === null ? Prisma.empty : Prisma.sql`AND c.agency_id = ${agencyId}`;
    const exact = q !== null && UUID.test(q) ? Prisma.sql`OR c.id = ${q}` : Prisma.empty;
    const match =
      q === null
        ? Prisma.empty
        : Prisma.sql`AND (c.subject COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!'
            OR c.mailbox_address COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!'
            OR c.message_id COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!'
            OR c.from_address COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!'
            OR c.to_address COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!'
            ${exact})`;
    const ids = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT c.id FROM correspondence c WHERE TRUE ${agency} ${match}
        ${keysetAfter(page.after, 'c')}
        ORDER BY c.created_at DESC, c.id DESC ${pageLimit(page)}`,
    );
    const rows = await this.prisma.correspondence.findMany({
      where: { id: { in: ids.map((row) => row.id) } },
      select: SUMMARY_COLUMNS,
    });
    return toPage(inIdOrder(ids, rows), page, this.cursors, toCorrespondenceSummary);
  }

  /** One captured correspondence by id, exactly as stored; 404 when there is none. */
  async get(id: string): Promise<CorrespondenceView> {
    const row = await this.prisma.correspondence.findUnique({ where: { id } });
    if (!row) throw apiErrors.notFound();
    return toCorrespondenceView(row);
  }

  /** One recorded communication, exactly as supplied. Nothing is sent, fetched or bound. */
  capture(requester: WriteRequester, body: CreateCorrespondence): Promise<WriteReply> {
    const problem = captureProblem(body);
    if (problem) throw problem;
    return this.writes.execute(
      { operationId: 'captureCorrespondence', pathParams: {}, body, requester },
      async (context) => {
        const { tx } = context;
        if (!(await lockForShare(tx, 'Agency', body.agencyId))) {
          throw apiErrors.referenceNotFound('agencyId');
        }
        const agency = await tx.agency.findUniqueOrThrow({
          where: { id: body.agencyId },
          select: { recordState: true },
        });
        if (agency.recordState === 'ARCHIVED') {
          throw apiErrors.recordStateConflict({
            record: 'Agency',
            state: 'ARCHIVED',
            operation: 'captureCorrespondence',
            field: 'agencyId',
          });
        }
        const uses = captureSourceUses(body);
        await assertSourcesUsable(tx, uses, { kind: 'Agency', agencyId: body.agencyId });
        const id = randomUUID();
        const bodyText = body.bodyText ?? null;
        const row = await tx.correspondence.create({
          data: {
            id,
            agencyId: body.agencyId,
            mailboxAddress: body.mailboxAddress,
            direction: body.direction,
            subject: body.subject,
            messageId: body.messageId ?? null,
            inReplyTo: body.inReplyTo ?? null,
            references: jsonColumn(body.references),
            // No reliable provider or capture identity is part of the contracted input.
            sourceIdentityHash: null,
            captureMode: body.captureMode,
            bodyRole: body.bodyRole ?? 'UNKNOWN',
            bodyText,
            bodySha256: bodySha256(bodyText),
            rawSourceId: body.rawSourceId ?? null,
            attachmentsManifest: jsonColumn(body.attachmentsManifest),
            headerDateRaw: body.headerDateRaw ?? null,
            occurredAt: typeof body.occurredAt === 'string' ? toDbInstant(body.occurredAt) : null,
            timestampPrecision: body.timestampPrecision ?? 'UNKNOWN',
            fromAddress: body.fromAddress ?? null,
            toAddress: body.toAddress ?? null,
            replyToAddress: body.replyToAddress ?? null,
            limitations: body.limitations ?? null,
            createdAt: context.now,
            createdById: context.actorUserId,
          },
        });
        await context.audit({
          action: 'CORRESPONDENCE_CAPTURED',
          entityType: ENTITY,
          entityId: id,
          after: captureAuditRecord(row),
          sourceIds: sourceIdsOf(uses),
        });
        return created(ENTITY, toCorrespondenceView(row));
      },
    );
  }
}
