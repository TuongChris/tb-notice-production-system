// SourceReference registry (P3A): list, create, get and revise. A SourceReference is immutable
// capture metadata (append-only): there is no update and no delete; a change is a new revision.
//
//   revision chain  sourceGroupId groups the revisions; revision 1, 2, …; supersedesSourceId points
//                   at the predecessor. Only the current head can be revised (INVARIANTS §4: "Revision
//                   request must target the current head. Unique supersedes ID prevents two accepted
//                   successors") → 409 REVISION_NOT_HEAD. A revision keeps the agency and the scope
//                   bindings ("does not fork or change scope") → 422 REVISION_SCOPE_CHANGE; a
//                   different scope is a new source. Earlier revisions stay unchanged and every record
//                   that cites one keeps pointing at it (no silent re-pointing).
//   list            current heads only (a superseded revision is reached by id or through its chain);
//                   `agencyId` = sources of that agency or explicitly shared with it; `q` = literal,
//                   case- and accent-insensitive substring of title, URL or provider file id, or the
//                   exact id / sourceGroupId (to find the current head of a chain).
//   no ETag         immutable records carry no row version (API_CONTRACT_v1 §6) and revise has no
//                   If-Match precondition in the contract; the head check is the concurrency guard.
// Lock order: owning agency (share) → the revised SourceReference (FOR UPDATE).
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  CreateSource,
  ReviseSource,
  SourceReference as SourceView,
  SourceReferenceSummary,
} from '@tb/contracts';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { apiErrors } from '../../infrastructure/http/api-error.js';
import { CursorCodec } from '../../infrastructure/write/cursor.js';
import { isUniqueViolation } from '../../infrastructure/write/database-errors.js';
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
import { writeData } from '../directory/changes.js';
import { created } from '../directory/outcomes.js';
import { lockForShare } from '../directory/records.js';
import {
  assertScopeRecords,
  CAPTURE_FIELDS,
  CAPTURE_INSTANT_FIELDS,
  CAPTURE_JSON_FIELDS,
  captureProblem,
  sameScopeBindings,
  sourceAuditRecord,
  type SourceCapture,
} from './source-rules.js';
import { toSourceSummary, toSourceView } from './source-views.js';

const ENTITY = 'SourceReference';

@Injectable()
export class SourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly writes: WriteExecutor,
    private readonly cursors: CursorCodec,
  ) {}

  async list(
    query: QueryValues,
  ): Promise<{ items: SourceReferenceSummary[]; nextCursor: string | null }> {
    const q = searchText(query);
    const agencyId = typeof query['agencyId'] === 'string' ? query['agencyId'] : null;
    const page = pageRequest(contractOperation('listSources'), query, this.cursors, {
      q,
      agencyId,
    });
    const agency =
      agencyId === null
        ? Prisma.empty
        : Prisma.sql`AND (s.agency_id = ${agencyId} OR (s.agency_id IS NULL
            AND JSON_CONTAINS(s.scope_bindings, JSON_QUOTE(${agencyId}), '$.agencyIds')))`;
    const match =
      q === null
        ? Prisma.empty
        : Prisma.sql`AND (s.title COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!'
            OR s.canonical_url COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!'
            OR s.provider_file_id COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!'
            OR s.id = ${q} OR s.source_group_id = ${q})`;
    const ids = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT s.id FROM source_references s
        WHERE NOT EXISTS (SELECT 1 FROM source_references n WHERE n.supersedes_source_id = s.id)
        ${agency} ${match} ${keysetAfter(page.after, 's')}
        ORDER BY s.created_at DESC, s.id DESC ${pageLimit(page)}`,
    );
    const rows = await this.prisma.sourceReference.findMany({
      where: { id: { in: ids.map((row) => row.id) } },
    });
    return toPage(inIdOrder(ids, rows), page, this.cursors, toSourceSummary);
  }

  /** Any revision by id (superseded revisions stay readable). */
  async get(id: string): Promise<SourceView> {
    const row = await this.prisma.sourceReference.findUnique({ where: { id } });
    if (!row) throw apiErrors.notFound();
    return toSourceView(row);
  }

  /** A new source: revision 1 of a new chain, with exactly the supplied metadata. */
  create(requester: WriteRequester, body: CreateSource): Promise<WriteReply> {
    const problem = captureProblem(body);
    if (problem) throw problem;
    return this.writes.execute(
      { operationId: 'createSource', pathParams: {}, body, requester },
      async (context) => {
        await assertScopeRecords(context.tx, body, 'createSource');
        const id = randomUUID();
        const row = await context.tx.sourceReference.create({
          data: {
            ...captureData(body),
            id,
            sourceGroupId: randomUUID(),
            revision: 1,
            supersedesSourceId: null,
            createdAt: context.now,
            createdById: context.actorUserId,
          } as Prisma.SourceReferenceUncheckedCreateInput,
        });
        await context.audit({
          action: 'SOURCE_CREATED',
          entityType: ENTITY,
          entityId: id,
          after: sourceAuditRecord(row),
        });
        return created(ENTITY, toSourceView(row));
      },
    );
  }

  /** The next revision of the chain whose current head is `id`. */
  revise(requester: WriteRequester, id: string, body: ReviseSource): Promise<WriteReply> {
    const problem = captureProblem(body);
    if (problem) throw problem;
    return this.writes.execute(
      { operationId: 'reviseSource', pathParams: { id }, body, requester },
      async (context) => {
        const { tx } = context;
        // Capture rows never change, so reading the target before locking is safe; it gives the
        // owning agency, which is locked first (Agency sorts before SourceReference).
        const target = await tx.sourceReference.findUnique({ where: { id } });
        if (!target) throw apiErrors.notFound();
        if (target.agencyId !== null) await lockForShare(tx, 'Agency', target.agencyId);
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM source_references WHERE id = ${id} FOR UPDATE`,
        );
        const successor = await tx.sourceReference.findUnique({
          where: { supersedesSourceId: id },
          select: { id: true },
        });
        if (successor) {
          const head = await tx.sourceReference.findFirst({
            where: { sourceGroupId: target.sourceGroupId },
            orderBy: { revision: 'desc' },
            select: { id: true },
          });
          throw apiErrors.revisionNotHead(head?.id ?? null);
        }
        const changedScope: string[] = [];
        if ((body.agencyId ?? null) !== target.agencyId) changedScope.push('agencyId');
        if (!sameScopeBindings(target.scopeBindings, body.scopeBindings ?? null)) {
          changedScope.push('scopeBindings');
        }
        if (changedScope.length > 0) throw apiErrors.revisionScopeChange(changedScope);
        if (target.agencyId !== null) {
          const agency = await tx.agency.findUniqueOrThrow({
            where: { id: target.agencyId },
            select: { recordState: true },
          });
          if (agency.recordState === 'ARCHIVED') {
            throw apiErrors.recordStateConflict({
              record: 'Agency',
              state: 'ARCHIVED',
              operation: 'reviseSource',
            });
          }
        }
        const revisionId = randomUUID();
        const row = await tx.sourceReference
          .create({
            data: {
              ...captureData(body),
              id: revisionId,
              sourceGroupId: target.sourceGroupId,
              revision: target.revision + 1,
              supersedesSourceId: target.id,
              createdAt: context.now,
              createdById: context.actorUserId,
            } as Prisma.SourceReferenceUncheckedCreateInput,
          })
          .catch((error: unknown) => {
            // A concurrent revision of the same head won the unique (supersedes / revision) keys.
            if (isUniqueViolation(error)) throw apiErrors.revisionNotHead(null);
            throw error;
          });
        await context.audit({
          action: 'SOURCE_REVISED',
          entityType: ENTITY,
          entityId: revisionId,
          before: { id: target.id, revision: target.revision },
          after: sourceAuditRecord(row),
        });
        return created(ENTITY, toSourceView(row));
      },
    );
  }
}

function captureData(body: SourceCapture): Record<string, unknown> {
  const data = writeData(body, CAPTURE_FIELDS, CAPTURE_JSON_FIELDS);
  // The exact instant captureProblem accepted, never the request string (storability.ts).
  for (const field of CAPTURE_INSTANT_FIELDS) {
    const value = body[field];
    if (typeof value === 'string') data[field] = toDbInstant(value);
  }
  return data;
}
