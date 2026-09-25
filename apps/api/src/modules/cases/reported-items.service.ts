// ReportedItem (P4B) — one reported YouTube video item of one case (DOMAIN_MODEL_v1 §11). It
// identifies reported material only: it is not a finding that infringement or copying occurred,
// that permission is absent, who the uploader is or who owns anything, and it is not a notice.
//
//   create   POST /cases/{caseId}/reported-items with the case's If-Match (the case's rowVersion and
//            contextRevision +1). rawUrl is stored exactly as supplied; normalizedUrl and
//            externalItemId are derived deterministically from it (reported-url.ts: a YouTube video
//            address only, the video id's case preserved; nothing is fetched) — any other address is
//            422 REPORTED_URL_UNSUPPORTED. displayTitle and observedAt are stored exactly as
//            supplied (observedAt: the R7 storability rule, 422 before anything else). One item per
//            video in a case (unique case + externalItemId, binary) → 409 DUPLICATE_REPORTED_ITEM
//            naming the existing item, archived or not; the same video in another case is that
//            case's own, separate record (no global uniqueness, nothing copied or linked).
//   patch    displayTitle and observedAt with the item's If-Match; the raw URL and what is derived
//            from it never change. A PATCH that changes nothing writes nothing.
//   archive  administrative flag with a reason (not "false", "withdrawn" or "removed"); nothing
//   restore  cascades; an archived item is read-only except restore.
// Every child is found through the exact case of the path: another case's item is 404.
// Lock order: CaseRecord (update) → ReportedItem (update).
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  ArchiveRequest,
  CreateReportedItem,
  PatchReportedItem,
  ReportedItem as ReportedItemView,
} from '@tb/contracts';
import { Prisma, type CaseRecord, type ReportedItem } from '../../../generated/prisma/client.js';
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
import { storabilityProblem, toDbInstant } from '../../infrastructure/write/storability.js';
import {
  WriteExecutor,
  type WriteContext,
  type WriteReply,
  type WriteRequester,
} from '../../infrastructure/write/write-executor.js';
import { auditFields, changedFields } from '../directory/changes.js';
import { created, unchanged, updated } from '../directory/outcomes.js';
import { assertCaseWritable, CASE_ENTITY, lockCase } from './case-rules.js';
import {
  assertChildWritable,
  caseAffected,
  caseVersions,
  lockCaseChild,
  touchCaseFor,
} from './intake-rules.js';
import { toReportedItemView } from './intake-views.js';
import { normalizeReportedUrl } from './reported-url.js';

const ENTITY = 'ReportedItem';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ITEM_FIELDS = ['rawUrl', 'normalizedUrl', 'externalItemId', 'displayTitle', 'observedAt'];
const ARCHIVE_FIELDS = ['archivedAt', 'archiveReason'] as const;

/** A PATCH body with observedAt as the exact instant it names (for comparison and writing). */
function comparablePatch(body: PatchReportedItem): Record<string, unknown> {
  const patch: Record<string, unknown> = { ...body };
  if (typeof body.observedAt === 'string') {
    patch['observedAt'] = toDbInstant(body.observedAt).toISOString();
  }
  return patch;
}

@Injectable()
export class ReportedItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly writes: WriteExecutor,
    private readonly cursors: CursorCodec,
  ) {}

  /**
   * The reported items of one case (404 for an unknown case), archived ones included, newest
   * first. `q`: the exact item id or video id (case-sensitive), or a literal, case- and
   * accent-insensitive substring of the display title or raw URL (discovery only).
   */
  async list(
    caseId: string,
    query: QueryValues,
  ): Promise<{ items: ReportedItemView[]; nextCursor: string | null }> {
    const owner = await this.prisma.caseRecord.findUnique({
      where: { id: caseId },
      select: { id: true },
    });
    if (!owner) throw apiErrors.notFound();
    const q = searchText(query);
    const page = pageRequest(contractOperation('listCaseReportedItems'), query, this.cursors, {
      caseId,
      q,
    });
    const exact = q !== null && UUID.test(q) ? Prisma.sql`OR r.id = ${q}` : Prisma.empty;
    const match =
      q === null
        ? Prisma.empty
        : Prisma.sql`AND (r.display_title COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!'
            OR r.raw_url COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!'
            OR r.external_item_id = ${q} ${exact})`;
    const ids = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT r.id FROM reported_items r WHERE r.case_id = ${caseId} ${match}
        ${keysetAfter(page.after, 'r')}
        ORDER BY r.created_at DESC, r.id DESC ${pageLimit(page)}`,
    );
    const rows = await this.prisma.reportedItem.findMany({
      where: { id: { in: ids.map((row) => row.id) } },
    });
    return toPage(inIdOrder(ids, rows), page, this.cursors, toReportedItemView);
  }

  /** One item of this case; another case's item is 404 exactly like an unknown one. */
  async get(caseId: string, id: string): Promise<ReportedItemView> {
    const row = await this.prisma.reportedItem.findFirst({ where: { id, caseId } });
    if (!row) throw apiErrors.notFound();
    return toReportedItemView(row);
  }

  create(requester: WriteRequester, caseId: string, body: CreateReportedItem): Promise<WriteReply> {
    const problem = storabilityProblem(body, [], ['observedAt']);
    if (problem) throw problem;
    const url = normalizeReportedUrl(body.rawUrl);
    if (!url.ok) throw apiErrors.reportedUrlUnsupported('rawUrl', url.reason);
    return this.writes.execute(
      { operationId: 'createReportedItem', pathParams: { caseId }, body, requester },
      async (context) => {
        const { tx } = context;
        const current = await lockCase(tx, caseId);
        context.checkPrecondition({
          entityType: CASE_ENTITY,
          id: caseId,
          rowVersion: current.rowVersion,
        });
        assertCaseWritable(current, 'createReportedItem');
        const duplicate = await tx.reportedItem.findFirst({
          where: { caseId, externalItemId: url.externalItemId },
          select: { id: true },
        });
        if (duplicate) throw apiErrors.duplicateReportedItem(duplicate.id);
        const id = randomUUID();
        const row = await tx.reportedItem
          .create({
            data: {
              id,
              caseId,
              rawUrl: body.rawUrl,
              normalizedUrl: url.normalizedUrl,
              externalItemId: url.externalItemId,
              displayTitle: body.displayTitle ?? null,
              observedAt: typeof body.observedAt === 'string' ? toDbInstant(body.observedAt) : null,
              createdAt: context.now,
              createdById: context.actorUserId,
              updatedAt: context.now,
              updatedById: context.actorUserId,
            },
          })
          .catch((error: unknown) => {
            // The unique (case, video id) key is the backstop; the case lock serializes writers.
            if (isUniqueViolation(error)) throw apiErrors.duplicateReportedItem(null);
            throw error;
          });
        const caseRow = await touchCaseFor(context, current);
        await context.audit({
          action: 'REPORTED_ITEM_CREATED',
          entityType: ENTITY,
          entityId: id,
          before: caseVersions(current),
          after: {
            caseId,
            ...auditFields(row, ITEM_FIELDS),
            rowVersion: row.rowVersion,
            ...caseVersions(caseRow),
          },
        });
        return created(ENTITY, toReportedItemView(row), [caseAffected(caseRow)]);
      },
    );
  }

  patch(
    requester: WriteRequester,
    caseId: string,
    id: string,
    body: PatchReportedItem,
  ): Promise<WriteReply> {
    const problem = storabilityProblem(body, [], ['observedAt']);
    if (problem) throw problem;
    return this.writes.execute(
      { operationId: 'patchReportedItem', pathParams: { caseId, id }, body, requester },
      async (context) => {
        const { tx } = context;
        const caseRow = await lockCaseChild(tx, ENTITY, caseId, id);
        const current = await tx.reportedItem.findUniqueOrThrow({ where: { id } });
        context.checkPrecondition({ entityType: ENTITY, id, rowVersion: current.rowVersion });
        assertCaseWritable(caseRow, 'patchReportedItem');
        assertChildWritable(current, ENTITY, 'patchReportedItem');
        const view = toReportedItemView(current);
        const patch = comparablePatch(body);
        const changed = changedFields(view, patch);
        if (changed.length === 0) return unchanged(ENTITY, view);
        const data: Prisma.ReportedItemUncheckedUpdateInput = {};
        if (changed.includes('displayTitle')) data.displayTitle = body.displayTitle ?? null;
        if (changed.includes('observedAt')) {
          data.observedAt =
            typeof body.observedAt === 'string' ? toDbInstant(body.observedAt) : null;
        }
        const row = await tx.reportedItem.update({
          where: { id, rowVersion: current.rowVersion },
          data: {
            ...data,
            rowVersion: { increment: 1 },
            updatedAt: context.now,
            updatedById: context.actorUserId,
          },
        });
        const touched = await touchCaseFor(context, caseRow);
        await context.audit({
          action: 'REPORTED_ITEM_UPDATED',
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
        return updated(ENTITY, toReportedItemView(row), [caseAffected(touched)]);
      },
    );
  }

  /** Administrative archive: nothing cascades, nothing is withdrawn, found false or removed. */
  archive(
    requester: WriteRequester,
    caseId: string,
    id: string,
    body: ArchiveRequest,
  ): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'archiveReportedItem', pathParams: { caseId, id }, body, requester },
      async (context) => {
        const { caseRow, current } = await this.lockWritable(context, caseId, id, 'archive');
        if (current.archivedAt !== null) {
          throw apiErrors.recordStateConflict({ archived: true, operation: 'archive' });
        }
        return this.setArchive(context, caseRow, current, 'REPORTED_ITEM_ARCHIVED', body.reason, {
          archivedAt: context.now,
          archiveReason: body.reason,
        });
      },
    );
  }

  /** Clears the archive flag only; the item is exactly as it was. */
  restore(
    requester: WriteRequester,
    caseId: string,
    id: string,
    body: ArchiveRequest,
  ): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'restoreReportedItem', pathParams: { caseId, id }, body, requester },
      async (context) => {
        const { caseRow, current } = await this.lockWritable(context, caseId, id, 'restore');
        if (current.archivedAt === null) {
          throw apiErrors.recordStateConflict({ archived: false, operation: 'restore' });
        }
        return this.setArchive(context, caseRow, current, 'REPORTED_ITEM_RESTORED', body.reason, {
          archivedAt: null,
          archiveReason: null,
        });
      },
    );
  }

  /** Locks the case and the item (404 first), checks If-Match (412), then the case state (409). */
  private async lockWritable(
    context: WriteContext,
    caseId: string,
    id: string,
    operation: string,
  ): Promise<{ caseRow: CaseRecord; current: ReportedItem }> {
    const caseRow = await lockCaseChild(context.tx, ENTITY, caseId, id);
    const current = await context.tx.reportedItem.findUniqueOrThrow({ where: { id } });
    context.checkPrecondition({ entityType: ENTITY, id, rowVersion: current.rowVersion });
    assertCaseWritable(caseRow, operation);
    return { caseRow, current };
  }

  private async setArchive(
    context: WriteContext,
    caseRow: CaseRecord,
    current: ReportedItem,
    action: string,
    reason: string,
    change: Pick<ReportedItem, 'archivedAt' | 'archiveReason'>,
  ) {
    const row = await context.tx.reportedItem.update({
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
    return updated(ENTITY, toReportedItemView(row), [caseAffected(touched)]);
  }
}
