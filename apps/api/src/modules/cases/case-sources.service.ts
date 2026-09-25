// CaseSource (P4A) — the explicit association of one SourceReference with one Case. A link means
// only "this SourceReference is associated with this case": it does not mean the document was
// reviewed, that what it allegedly supports is true, that infringement is proven, that permission is
// absent or that authority is valid, and it never changes the source's provenance.
//
//   link        POST /cases/{caseId}/sources with the case's If-Match (the case's context changes:
//               rowVersion and contextRevision +1). The case is unarchived (409); the source exists
//               (422) and applies to this case (source-scope.ts: case, agency, subject and owner
//               dimensions — a source scoped to another case is 422 CROSS_CASE_REFERENCE). One row per
//               (case, source, useRole) → 409 DUPLICATE_CASE_SOURCE naming the existing row, whatever
//               its state (a relink uses the link-state command). Any revision can be linked and stays
//               pinned: a newer revision never re-points a link. No placeholder source, no copy of
//               another case's links.
//   link-state  POST /case-sources/{id}/link-state with the link's If-Match: LINKED | PAUSED |
//               UNLINKED with a reason (same state 409; archived case 409). The row and the source
//               are never deleted; an unlinked source is not false or invalid, only no longer linked.
//               Returning to LINKED re-checks the source's applicability in the case's current context.
//               The case's rowVersion and contextRevision move with every state change.
// Lock order: CaseRecord (update) → CaseSource (update) → SourceReference.
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { CaseSource as CaseSourceView, LinkCaseSource, LinkStateRequest } from '@tb/contracts';
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
import { auditFields } from '../directory/changes.js';
import { created, updated } from '../directory/outcomes.js';
import { lockForUpdate } from '../directory/records.js';
import { assertSourcesUsable } from '../sources/source-scope.js';
import { assertCaseWritable, CASE_ENTITY, caseTarget, lockCase, touchCase } from './case-rules.js';
import { toCaseSourceView } from './case-views.js';

const ENTITY = 'CaseSource';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LINK_FIELDS = ['linkState', 'stateReason'] as const;

@Injectable()
export class CaseSourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly writes: WriteExecutor,
    private readonly cursors: CursorCodec,
  ) {}

  /**
   * The source links of one case (404 for an unknown case), every link state included, newest
   * first. `q`: the exact link or source id, or a case- and accent-insensitive substring of the use
   * role or scope note.
   */
  async list(
    caseId: string,
    query: QueryValues,
  ): Promise<{ items: CaseSourceView[]; nextCursor: string | null }> {
    const owner = await this.prisma.caseRecord.findUnique({
      where: { id: caseId },
      select: { id: true },
    });
    if (!owner) throw apiErrors.notFound();
    const q = searchText(query);
    const page = pageRequest(contractOperation('listCaseSources'), query, this.cursors, {
      caseId,
      q,
    });
    const exact =
      q !== null && UUID.test(q) ? Prisma.sql`OR s.id = ${q} OR s.source_id = ${q}` : Prisma.empty;
    const match =
      q === null
        ? Prisma.empty
        : Prisma.sql`AND (s.use_role COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!'
            OR s.scope_note COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!'
            ${exact})`;
    const ids = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT s.id FROM case_sources s WHERE s.case_id = ${caseId} ${match}
        ${keysetAfter(page.after, 's')}
        ORDER BY s.created_at DESC, s.id DESC ${pageLimit(page)}`,
    );
    const rows = await this.prisma.caseSource.findMany({
      where: { id: { in: ids.map((row) => row.id) } },
    });
    return toPage(inIdOrder(ids, rows), page, this.cursors, toCaseSourceView);
  }

  async get(id: string): Promise<CaseSourceView> {
    const row = await this.prisma.caseSource.findUnique({ where: { id } });
    if (!row) throw apiErrors.notFound();
    return toCaseSourceView(row);
  }

  /** Links one existing, applicable source to one case, exactly as requested. */
  link(requester: WriteRequester, caseId: string, body: LinkCaseSource): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'linkCaseSource', pathParams: { caseId }, body, requester },
      async (context) => {
        const { tx } = context;
        const current = await lockCase(tx, caseId);
        context.checkPrecondition({
          entityType: CASE_ENTITY,
          id: caseId,
          rowVersion: current.rowVersion,
        });
        assertCaseWritable(current, 'linkCaseSource');
        const duplicate = await tx.caseSource.findFirst({
          where: { caseId, sourceId: body.sourceId, useRole: body.useRole },
          select: { id: true },
        });
        if (duplicate) throw apiErrors.duplicateCaseSource(duplicate.id);
        await assertSourcesUsable(
          tx,
          [{ field: 'sourceId', sourceId: body.sourceId }],
          await caseTarget(tx, current),
        );
        const id = randomUUID();
        const row = await tx.caseSource
          .create({
            data: {
              id,
              caseId,
              sourceId: body.sourceId,
              useRole: body.useRole,
              scopeNote: body.scopeNote,
              createdAt: context.now,
              createdById: context.actorUserId,
              updatedAt: context.now,
              updatedById: context.actorUserId,
            },
          })
          .catch((error: unknown) => {
            // A concurrent link of the same (case, source, role) won the unique key.
            if (isUniqueViolation(error)) throw apiErrors.duplicateCaseSource(null);
            throw error;
          });
        const caseRow = await touchCase(context, current, true);
        await context.audit({
          action: 'CASE_SOURCE_LINKED',
          entityType: ENTITY,
          entityId: id,
          before: {
            caseRowVersion: current.rowVersion,
            caseContextRevision: current.contextRevision,
          },
          after: {
            ...auditFields(row, ['caseId', 'sourceId', 'useRole', 'scopeNote', 'linkState']),
            rowVersion: row.rowVersion,
            caseRowVersion: caseRow.rowVersion,
            caseContextRevision: caseRow.contextRevision,
          },
          sourceIds: [body.sourceId],
        });
        return created(ENTITY, toCaseSourceView(row), [
          { type: CASE_ENTITY, id: caseId, rowVersion: caseRow.rowVersion },
        ]);
      },
    );
  }

  /** Pauses, unlinks or relinks one link; the link row and the source are always kept. */
  setLinkState(requester: WriteRequester, id: string, body: LinkStateRequest): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'setCaseSourceLinkState', pathParams: { id }, body, requester },
      async (context) => {
        const { tx } = context;
        // A link's case never changes: read it first to lock the case before the link.
        const link = await tx.caseSource.findUnique({ where: { id }, select: { caseId: true } });
        if (!link) throw apiErrors.notFound();
        const caseRow = await lockCase(tx, link.caseId);
        if (!(await lockForUpdate(tx, 'CaseSource', id))) throw apiErrors.notFound();
        const current = await tx.caseSource.findUniqueOrThrow({ where: { id } });
        context.checkPrecondition({ entityType: ENTITY, id, rowVersion: current.rowVersion });
        assertCaseWritable(caseRow, 'setCaseSourceLinkState');
        if (current.linkState === body.state) {
          throw apiErrors.recordStateConflict({
            linkState: current.linkState,
            requested: body.state,
            operation: 'link-state',
          });
        }
        if (body.state === 'LINKED') {
          await assertSourcesUsable(
            tx,
            [{ field: 'sourceId', sourceId: current.sourceId }],
            await caseTarget(tx, caseRow),
          );
        }
        const row = await tx.caseSource.update({
          where: { id, rowVersion: current.rowVersion },
          data: {
            linkState: body.state,
            stateReason: body.reason,
            rowVersion: { increment: 1 },
            updatedAt: context.now,
            updatedById: context.actorUserId,
          },
        });
        const touched = await touchCase(context, caseRow, true);
        await context.audit({
          action: 'CASE_SOURCE_LINK_STATE_CHANGED',
          entityType: ENTITY,
          entityId: id,
          before: {
            ...auditFields(current, LINK_FIELDS),
            rowVersion: current.rowVersion,
            caseRowVersion: caseRow.rowVersion,
          },
          after: {
            ...auditFields(row, LINK_FIELDS),
            rowVersion: row.rowVersion,
            caseRowVersion: touched.rowVersion,
          },
          reason: body.reason,
          sourceIds: [current.sourceId],
        });
        return updated(ENTITY, toCaseSourceView(row), [
          { type: CASE_ENTITY, id: caseRow.id, rowVersion: touched.rowVersion },
        ]);
      },
    );
  }
}
