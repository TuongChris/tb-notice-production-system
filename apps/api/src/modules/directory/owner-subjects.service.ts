// OwnerSubject — the explicit association of one Owner namespace with one exact LegalSubject
// (decision D1, DOMAIN_MODEL_v1 §5). Owner is never collapsed into LegalSubject and a subject is
// never inferred from an Owner's name. LINKED is not appointment and creates no authority; UNLINKED
// revokes nothing and contacts no one (INVARIANTS §4).
//
//   link        one unique (ownerId, legalSubjectId) row — a second link of the same pair is 409
//               with the existing association's id (relink it instead). Precondition target: the
//               Owner ETag; the Owner's row version is incremented (the association set changed).
//   link-state  LINKED | PAUSED | UNLINKED with a reason. Unlink is refused while routes that use
//               the association are LINKED or PAUSED (no cascading unlink, AC-011). Relinking needs
//               both parties unarchived. History is kept: the row is never deleted and the previous
//               state is in the audit trail.
// Lock order: LegalSubject → Owner → OwnerSubject.
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  LinkOwnerSubject,
  LinkStateRequest,
  OwnerSubject as OwnerSubjectView,
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
import {
  WriteExecutor,
  type WriteReply,
  type WriteRequester,
} from '../../infrastructure/write/write-executor.js';
import { auditFields } from './changes.js';
import { created, updated } from './outcomes.js';
import { lockForUpdate } from './records.js';
import { assertSourcesUsable, sourceIdsOf, type SourceUse } from './sources.js';
import { toOwnerSubjectView } from './views.js';

const ENTITY = 'OwnerSubject';

@Injectable()
export class OwnerSubjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly writes: WriteExecutor,
    private readonly cursors: CursorCodec,
  ) {}

  /**
   * Associations of one Owner (404 when the Owner does not exist). `q`: case- and accent-insensitive
   * substring of the relationship label or of the linked subject's legal name.
   */
  async list(
    ownerId: string,
    query: QueryValues,
  ): Promise<{ items: OwnerSubjectView[]; nextCursor: string | null }> {
    const owner = await this.prisma.owner.findUnique({
      where: { id: ownerId },
      select: { id: true },
    });
    if (!owner) throw apiErrors.notFound();
    const q = searchText(query);
    const page = pageRequest(contractOperation('listOwnerSubjects'), query, this.cursors, {
      ownerId,
      q,
    });
    const match =
      q === null
        ? Prisma.empty
        : Prisma.sql`AND (os.relationship_label COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!'
            OR ls.legal_name COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!')`;
    const ids = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT os.id AS id FROM owner_subjects os
        JOIN legal_subjects ls ON ls.id = os.legal_subject_id
        WHERE os.owner_id = ${ownerId} ${match} ${keysetAfter(page.after, 'os')}
        ORDER BY os.created_at DESC, os.id DESC ${pageLimit(page)}`,
    );
    const rows = await this.prisma.ownerSubject.findMany({
      where: { id: { in: ids.map((r) => r.id) } },
    });
    return toPage(inIdOrder(ids, rows), page, this.cursors, toOwnerSubjectView);
  }

  async get(id: string): Promise<OwnerSubjectView> {
    const row = await this.prisma.ownerSubject.findUnique({ where: { id } });
    if (!row) throw apiErrors.notFound();
    return toOwnerSubjectView(row);
  }

  link(requester: WriteRequester, ownerId: string, body: LinkOwnerSubject): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'linkOwnerSubject', pathParams: { ownerId }, body, requester },
      async (context) => {
        const { tx } = context;
        const subjectFound = await lockForUpdate(tx, 'LegalSubject', body.legalSubjectId);
        if (!(await lockForUpdate(tx, 'Owner', ownerId))) throw apiErrors.notFound();
        const owner = await tx.owner.findUniqueOrThrow({ where: { id: ownerId } });
        context.checkPrecondition({
          entityType: 'Owner',
          id: ownerId,
          rowVersion: owner.rowVersion,
        });
        if (!subjectFound) throw apiErrors.referenceNotFound('legalSubjectId');
        const subject = await tx.legalSubject.findUniqueOrThrow({
          where: { id: body.legalSubjectId },
          select: { recordState: true },
        });
        if (owner.recordState === 'ARCHIVED') {
          throw apiErrors.recordStateConflict({
            record: 'Owner',
            state: 'ARCHIVED',
            operation: 'link',
          });
        }
        if (subject.recordState === 'ARCHIVED') {
          throw apiErrors.recordStateConflict({
            record: 'LegalSubject',
            state: 'ARCHIVED',
            operation: 'link',
          });
        }
        const existing = await tx.ownerSubject.findUnique({
          where: {
            ownerId_legalSubjectId: { ownerId, legalSubjectId: body.legalSubjectId },
          },
          select: { id: true },
        });
        if (existing) throw apiErrors.duplicateOwnerSubject(existing.id);
        const uses: SourceUse[] = body.sourceId
          ? [{ field: 'sourceId', sourceId: body.sourceId }]
          : [];
        await assertSourcesUsable(tx, uses, null);
        const id = randomUUID();
        const row = await tx.ownerSubject
          .create({
            data: {
              id,
              ownerId,
              legalSubjectId: body.legalSubjectId,
              relationshipLabel: body.relationshipLabel ?? null,
              sourceId: body.sourceId ?? null,
              createdAt: context.now,
              createdById: context.actorUserId,
              updatedAt: context.now,
              updatedById: context.actorUserId,
            },
          })
          .catch((error: unknown) => {
            // Backstop of the unique (ownerId, legalSubjectId) key; the row locks make it unreachable.
            throw isUniqueViolation(error) ? apiErrors.duplicateOwnerSubject(null) : error;
          });
        const ownerRow = await tx.owner.update({
          where: { id: ownerId, rowVersion: owner.rowVersion },
          data: {
            rowVersion: { increment: 1 },
            updatedAt: context.now,
            updatedById: context.actorUserId,
          },
        });
        await context.audit({
          action: 'OWNER_SUBJECT_LINKED',
          entityType: ENTITY,
          entityId: id,
          after: {
            ...auditFields(row, [
              'ownerId',
              'legalSubjectId',
              'relationshipLabel',
              'sourceId',
              'linkState',
            ]),
            rowVersion: row.rowVersion,
            ownerRowVersion: ownerRow.rowVersion,
          },
          sourceIds: sourceIdsOf(uses),
        });
        return created(ENTITY, toOwnerSubjectView(row), [
          { type: 'Owner', id: ownerId, rowVersion: ownerRow.rowVersion },
        ]);
      },
    );
  }

  setLinkState(requester: WriteRequester, id: string, body: LinkStateRequest): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'setOwnerSubjectLinkState', pathParams: { id }, body, requester },
      async (context) => {
        const { tx } = context;
        const parties = await tx.ownerSubject.findUnique({
          where: { id },
          select: { ownerId: true, legalSubjectId: true },
        });
        if (!parties) throw apiErrors.notFound();
        await lockForUpdate(tx, 'LegalSubject', parties.legalSubjectId);
        await lockForUpdate(tx, 'Owner', parties.ownerId);
        if (!(await lockForUpdate(tx, ENTITY, id))) throw apiErrors.notFound();
        const current = await tx.ownerSubject.findUniqueOrThrow({
          where: { id },
          include: {
            owner: { select: { recordState: true } },
            legalSubject: { select: { recordState: true } },
          },
        });
        context.checkPrecondition({ entityType: ENTITY, id, rowVersion: current.rowVersion });
        if (current.linkState === body.state) {
          throw apiErrors.recordStateConflict({
            state: current.linkState,
            requested: body.state,
            operation: 'link-state',
          });
        }
        if (body.state === 'UNLINKED') {
          const routes = await tx.route.count({
            where: { ownerSubjectId: id, linkState: { in: ['LINKED', 'PAUSED'] } },
          });
          if (routes > 0) throw apiErrors.dependentRoutesLinked(routes);
        }
        if (body.state === 'LINKED') {
          for (const [record, state] of [
            ['Owner', current.owner.recordState],
            ['LegalSubject', current.legalSubject.recordState],
          ] as const) {
            if (state === 'ARCHIVED') {
              throw apiErrors.recordStateConflict({ record, state, operation: 'link-state' });
            }
          }
        }
        const unlinked = body.state === 'UNLINKED';
        const row = await tx.ownerSubject.update({
          where: { id, rowVersion: current.rowVersion },
          data: {
            linkState: body.state,
            unlinkedAt: unlinked ? context.now : null,
            unlinkReason: unlinked ? body.reason : null,
            rowVersion: { increment: 1 },
            updatedAt: context.now,
            updatedById: context.actorUserId,
          },
        });
        const fields = ['linkState', 'unlinkedAt', 'unlinkReason'];
        await context.audit({
          action: 'OWNER_SUBJECT_LINK_STATE_CHANGED',
          entityType: ENTITY,
          entityId: id,
          before: { ...auditFields(current, fields), rowVersion: current.rowVersion },
          after: { ...auditFields(row, fields), rowVersion: row.rowVersion },
          reason: body.reason,
        });
        return updated(ENTITY, toOwnerSubjectView(row));
      },
    );
  }
}
