// CaseWork (P4B) — a copyrighted work asserted/recorded for one case (DOMAIN_MODEL_v1 §11: "exact
// source-work identification"). The record does not establish copyright ownership, authorship,
// registration, standing or G2: a publication or source URL is not title to any right, and
// work-specific rights assertions are separate, scoped CaseFacts.
//
//   create   POST /cases/{caseId}/works with the case's If-Match (the case's rowVersion and
//            contextRevision +1): title, sourceUrl, externalWorkId, workType and notes exactly as
//            supplied. No owner, subject or rights holder is inferred, and nothing is matched or
//            de-duplicated by title or URL — within a case or across cases (two cases recording
//            the same title keep two independent works).
//   patch    the same five fields with the work's If-Match. Title, source URL, external id and
//            work type are case context (the case's contextRevision moves); notes alone are not
//            (as for the case's own notes) and leave the case untouched. A no-op writes nothing.
//   archive  administrative flag with a reason; nothing cascades — mappings and facts that name
//   restore  the work stay as they are, and archiving is not a finding that the work is not
//            the operator's or not infringed. An archived work is read-only except restore, and
//            no new mapping or fact can name it.
// Every child is found through the exact case of the path: another case's work is 404.
// Lock order: CaseRecord (update) → CaseWork (update).
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  ArchiveRequest,
  CaseWork as CaseWorkView,
  CreateCaseWork,
  PatchCaseWork,
} from '@tb/contracts';
import { Prisma, type CaseRecord, type CaseWork } from '../../../generated/prisma/client.js';
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
import {
  WriteExecutor,
  type WriteContext,
  type WriteReply,
  type WriteRequester,
} from '../../infrastructure/write/write-executor.js';
import { auditFields, changedFields, presentFields, writeData } from '../directory/changes.js';
import { created, unchanged, updated } from '../directory/outcomes.js';
import { assertCaseWritable, CASE_ENTITY, lockCase } from './case-rules.js';
import {
  assertChildWritable,
  caseAffected,
  caseVersions,
  lockCaseChild,
  touchCaseFor,
} from './intake-rules.js';
import { toCaseWorkView } from './intake-views.js';

const ENTITY = 'CaseWork';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const WORK_FIELDS = ['title', 'sourceUrl', 'externalWorkId', 'workType', 'notes'] as const;
/** PatchCaseWork fields that change the case context; notes do not. */
const MATERIAL_FIELDS: readonly string[] = ['title', 'sourceUrl', 'externalWorkId', 'workType'];
const ARCHIVE_FIELDS = ['archivedAt', 'archiveReason'] as const;

@Injectable()
export class CaseWorksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly writes: WriteExecutor,
    private readonly cursors: CursorCodec,
  ) {}

  /**
   * The works of one case (404 for an unknown case), archived ones included, newest first. `q`:
   * the exact work id, or a literal, case- and accent-insensitive substring of the title, external
   * work id, work type or source URL (discovery only; never identity or ownership matching).
   */
  async list(
    caseId: string,
    query: QueryValues,
  ): Promise<{ items: CaseWorkView[]; nextCursor: string | null }> {
    const owner = await this.prisma.caseRecord.findUnique({
      where: { id: caseId },
      select: { id: true },
    });
    if (!owner) throw apiErrors.notFound();
    const q = searchText(query);
    const page = pageRequest(contractOperation('listCaseCaseWorks'), query, this.cursors, {
      caseId,
      q,
    });
    const exact = q !== null && UUID.test(q) ? Prisma.sql`OR w.id = ${q}` : Prisma.empty;
    const match =
      q === null
        ? Prisma.empty
        : Prisma.sql`AND (w.title COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!'
            OR w.external_work_id COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!'
            OR w.work_type COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!'
            OR w.source_url COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!'
            ${exact})`;
    const ids = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT w.id FROM case_works w WHERE w.case_id = ${caseId} ${match}
        ${keysetAfter(page.after, 'w')}
        ORDER BY w.created_at DESC, w.id DESC ${pageLimit(page)}`,
    );
    const rows = await this.prisma.caseWork.findMany({
      where: { id: { in: ids.map((row) => row.id) } },
    });
    return toPage(inIdOrder(ids, rows), page, this.cursors, toCaseWorkView);
  }

  /** One work of this case; another case's work is 404 exactly like an unknown one. */
  async get(caseId: string, id: string): Promise<CaseWorkView> {
    const row = await this.prisma.caseWork.findFirst({ where: { id, caseId } });
    if (!row) throw apiErrors.notFound();
    return toCaseWorkView(row);
  }

  create(requester: WriteRequester, caseId: string, body: CreateCaseWork): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'createCaseWork', pathParams: { caseId }, body, requester },
      async (context) => {
        const { tx } = context;
        const current = await lockCase(tx, caseId);
        context.checkPrecondition({
          entityType: CASE_ENTITY,
          id: caseId,
          rowVersion: current.rowVersion,
        });
        assertCaseWritable(current, 'createCaseWork');
        const id = randomUUID();
        const row = await tx.caseWork.create({
          data: {
            ...writeData(body, WORK_FIELDS, []),
            id,
            caseId,
            createdAt: context.now,
            createdById: context.actorUserId,
            updatedAt: context.now,
            updatedById: context.actorUserId,
          } as Prisma.CaseWorkUncheckedCreateInput,
        });
        const caseRow = await touchCaseFor(context, current);
        await context.audit({
          action: 'CASE_WORK_CREATED',
          entityType: ENTITY,
          entityId: id,
          before: caseVersions(current),
          after: {
            caseId,
            ...auditFields(row, presentFields(body)),
            rowVersion: row.rowVersion,
            ...caseVersions(caseRow),
          },
        });
        return created(ENTITY, toCaseWorkView(row), [caseAffected(caseRow)]);
      },
    );
  }

  patch(
    requester: WriteRequester,
    caseId: string,
    id: string,
    body: PatchCaseWork,
  ): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'patchCaseWork', pathParams: { caseId, id }, body, requester },
      async (context) => {
        const { tx } = context;
        const caseRow = await lockCaseChild(tx, ENTITY, caseId, id);
        const current = await tx.caseWork.findUniqueOrThrow({ where: { id } });
        context.checkPrecondition({ entityType: ENTITY, id, rowVersion: current.rowVersion });
        assertCaseWritable(caseRow, 'patchCaseWork');
        assertChildWritable(current, ENTITY, 'patchCaseWork');
        const view = toCaseWorkView(current);
        const changed = changedFields(view, body);
        if (changed.length === 0) return unchanged(ENTITY, view);
        const row = await tx.caseWork.update({
          where: { id, rowVersion: current.rowVersion },
          data: {
            ...writeData(body, changed, []),
            rowVersion: { increment: 1 },
            updatedAt: context.now,
            updatedById: context.actorUserId,
          },
        });
        const material = changed.some((field) => MATERIAL_FIELDS.includes(field));
        const touched = material ? await touchCaseFor(context, caseRow) : caseRow;
        await context.audit({
          action: 'CASE_WORK_UPDATED',
          entityType: ENTITY,
          entityId: id,
          before: {
            ...auditFields(current, changed),
            rowVersion: current.rowVersion,
            ...caseVersions(caseRow),
          },
          after: {
            ...auditFields(row, changed),
            rowVersion: row.rowVersion,
            ...caseVersions(touched),
          },
        });
        return updated(ENTITY, toCaseWorkView(row), material ? [caseAffected(touched)] : []);
      },
    );
  }

  /** Administrative archive: mappings and facts naming the work are kept exactly as they are. */
  archive(
    requester: WriteRequester,
    caseId: string,
    id: string,
    body: ArchiveRequest,
  ): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'archiveCaseWork', pathParams: { caseId, id }, body, requester },
      async (context) => {
        const { caseRow, current } = await this.lockWritable(context, caseId, id, 'archive');
        if (current.archivedAt !== null) {
          throw apiErrors.recordStateConflict({ archived: true, operation: 'archive' });
        }
        return this.setArchive(context, caseRow, current, 'CASE_WORK_ARCHIVED', body.reason, {
          archivedAt: context.now,
          archiveReason: body.reason,
        });
      },
    );
  }

  /** Clears the archive flag only; the work is exactly as it was. */
  restore(
    requester: WriteRequester,
    caseId: string,
    id: string,
    body: ArchiveRequest,
  ): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'restoreCaseWork', pathParams: { caseId, id }, body, requester },
      async (context) => {
        const { caseRow, current } = await this.lockWritable(context, caseId, id, 'restore');
        if (current.archivedAt === null) {
          throw apiErrors.recordStateConflict({ archived: false, operation: 'restore' });
        }
        return this.setArchive(context, caseRow, current, 'CASE_WORK_RESTORED', body.reason, {
          archivedAt: null,
          archiveReason: null,
        });
      },
    );
  }

  private async lockWritable(
    context: WriteContext,
    caseId: string,
    id: string,
    operation: string,
  ): Promise<{ caseRow: CaseRecord; current: CaseWork }> {
    const caseRow = await lockCaseChild(context.tx, ENTITY, caseId, id);
    const current = await context.tx.caseWork.findUniqueOrThrow({ where: { id } });
    context.checkPrecondition({ entityType: ENTITY, id, rowVersion: current.rowVersion });
    assertCaseWritable(caseRow, operation);
    return { caseRow, current };
  }

  private async setArchive(
    context: WriteContext,
    caseRow: CaseRecord,
    current: CaseWork,
    action: string,
    reason: string,
    change: Pick<CaseWork, 'archivedAt' | 'archiveReason'>,
  ) {
    const row = await context.tx.caseWork.update({
      where: { id: current.id, rowVersion: current.rowVersion },
      data: {
        ...change,
        rowVersion: { increment: 1 },
        updatedAt: context.now,
        updatedById: context.actorUserId,
      },
    });
    const touched = await touchCaseFor(context, caseRow);
    await context.audit({
      action,
      entityType: ENTITY,
      entityId: current.id,
      before: {
        ...auditFields(current, ARCHIVE_FIELDS),
        rowVersion: current.rowVersion,
        ...caseVersions(caseRow),
      },
      after: {
        ...auditFields(row, ARCHIVE_FIELDS),
        rowVersion: row.rowVersion,
        ...caseVersions(touched),
      },
      reason,
    });
    return updated(ENTITY, toCaseWorkView(row), [caseAffected(touched)]);
  }
}
