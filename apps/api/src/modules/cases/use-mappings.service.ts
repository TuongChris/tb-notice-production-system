// UseMapping (P4B) — an observed/recorded association of ONE CaseWork with ONE ReportedItem of the
// same case, per occurrence (DOMAIN_MODEL_v1 §11). It records where a work is reported to appear;
// it is not a finding of infringement, copying or audiovisual identity: similarity, equal
// durations or matching endpoints prove nothing, and nothing here compares media.
//
//   create   POST /cases/{caseId}/mappings with the case's If-Match (the case's rowVersion and
//            contextRevision +1). caseWorkId and reportedItemId must both be records of THIS case
//            (422 REFERENCE_NOT_FOUND / CROSS_CASE_REFERENCE; the composite foreign keys (id,
//            case_id) are the backstop — AC-024) and unarchived (409). occurrence is explicit; one
//            mapping per (work, item, occurrence) → 409 DUPLICATE_USE_MAPPING (AC-025: one work
//            three times in one video = three mappings).
//            Times: unsigned millisecond decimal strings ≤ 9007199254740991 stored as BIGINT
//            UNSIGNED (AC-026: never SQL TIME); unknown bounds stay null; a known end must exceed its
//            known start (422 TIME_RANGE_INVALID, AC-027; the CHECKs are the backstop). rawTimecodes
//            are kept exactly as supplied and never parsed, reconciled or reinterpreted;
//            boundaryConvention is UNKNOWN (default), HALF_OPEN or INCLUSIVE, as supplied.
//            provenance is explicit (default MISSING, never upgraded); basisSourceId, when set, must
//            apply to this case (source-scope.ts). DOCUMENT_REVIEWED needs a basis source that itself
//            records an attributed review (422 REVIEW_UNSUPPORTED) — the permanent R6 rule; nothing
//            infers it.
//   patch    times, raw timecodes, boundary convention, provenance, basis source and limitations
//            with the mapping's If-Match (API_CONTRACT_v1 §6: it still locks and increments the
//            case's context revision). The work, item and occurrence never change. Checks run on the
//            merged state. A mapping whose work or item is archived is not edited (409).
//   archive  administrative flag with a reason; nothing cascades; archived = read-only except
//   restore  restore. Restore needs the work and item unarchived and re-checks the basis source.
// Every child is found through the exact case of the path: another case's mapping is 404.
// Lock order: CaseRecord (update) → CaseWork (share) → ReportedItem (share) → UseMapping (update) →
// SourceReference.
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  ArchiveRequest,
  CreateUseMapping,
  PatchUseMapping,
  UseMapping as UseMappingView,
} from '@tb/contracts';
import {
  Prisma,
  type CaseRecord,
  type Provenance,
  type UseMapping,
} from '../../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { apiErrors } from '../../infrastructure/http/api-error.js';
import { CursorCodec } from '../../infrastructure/write/cursor.js';
import { isUniqueViolation } from '../../infrastructure/write/database-errors.js';
import {
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
import { auditFields, changedFields, presentFields } from '../directory/changes.js';
import { created, unchanged, updated } from '../directory/outcomes.js';
import { lockForShare, lockForUpdate } from '../directory/records.js';
import { eventReviewProblem } from '../representation/authority-rules.js';
import { assertSourcesUsable } from '../sources/source-scope.js';
import { assertCaseWritable, CASE_ENTITY, caseTarget, lockCase } from './case-rules.js';
import {
  assertBodyChild,
  assertChildWritable,
  caseAffected,
  caseVersions,
  childCase,
  intervalProblem,
  mappingValueProblem,
  MILLISECOND_FIELDS,
  toMilliseconds,
  touchCaseFor,
  type MillisecondField,
} from './intake-rules.js';
import { toUseMappingView } from './intake-views.js';

const ENTITY = 'UseMapping';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CREATE_FIELDS = [
  'caseWorkId',
  'reportedItemId',
  'occurrence',
  ...MILLISECOND_FIELDS,
  'rawTimecodes',
  'boundaryConvention',
  'provenance',
  'basisSourceId',
  'limitations',
] as const;
const ARCHIVE_FIELDS = ['archivedAt', 'archiveReason'] as const;

/** Prisma data for mapping fields: milliseconds as BIGINT, a cleared JSON column as SQL NULL. */
function mappingData(
  source: Readonly<Record<string, unknown>>,
  fields: readonly string[],
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const field of fields) {
    const value = source[field];
    if (value === undefined) continue;
    if ((MILLISECOND_FIELDS as readonly string[]).includes(field)) {
      data[field] = toMilliseconds(value as string | null);
    } else if (field === 'rawTimecodes') {
      data[field] = value === null ? Prisma.DbNull : value;
    } else {
      data[field] = value;
    }
  }
  return data;
}

function millisecondsOf(
  state: Readonly<Record<string, unknown>>,
): Record<MillisecondField, string | null> {
  const result = {} as Record<MillisecondField, string | null>;
  for (const field of MILLISECOND_FIELDS) {
    const value = state[field];
    result[field] = typeof value === 'string' ? value : null;
  }
  return result;
}

@Injectable()
export class UseMappingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly writes: WriteExecutor,
    private readonly cursors: CursorCodec,
  ) {}

  /**
   * The mappings of one case (404 for an unknown case), archived ones included, newest first.
   * `q`: the exact id of a mapping, or of its work or reported item (the mappings of that work or
   * item in this case only).
   */
  async list(
    caseId: string,
    query: QueryValues,
  ): Promise<{ items: UseMappingView[]; nextCursor: string | null }> {
    const owner = await this.prisma.caseRecord.findUnique({
      where: { id: caseId },
      select: { id: true },
    });
    if (!owner) throw apiErrors.notFound();
    const q = searchText(query);
    const page = pageRequest(contractOperation('listCaseUseMappings'), query, this.cursors, {
      caseId,
      q,
    });
    const match =
      q === null
        ? Prisma.empty
        : UUID.test(q)
          ? Prisma.sql`AND (m.id = ${q} OR m.case_work_id = ${q} OR m.reported_item_id = ${q})`
          : Prisma.sql`AND 1 = 0`;
    const ids = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT m.id FROM use_mappings m WHERE m.case_id = ${caseId} ${match}
        ${keysetAfter(page.after, 'm')}
        ORDER BY m.created_at DESC, m.id DESC ${pageLimit(page)}`,
    );
    const rows = await this.prisma.useMapping.findMany({
      where: { id: { in: ids.map((row) => row.id) } },
    });
    return toPage(inIdOrder(ids, rows), page, this.cursors, toUseMappingView);
  }

  /** One mapping of this case; another case's mapping is 404 exactly like an unknown one. */
  async get(caseId: string, id: string): Promise<UseMappingView> {
    const row = await this.prisma.useMapping.findFirst({ where: { id, caseId } });
    if (!row) throw apiErrors.notFound();
    return toUseMappingView(row);
  }

  create(requester: WriteRequester, caseId: string, body: CreateUseMapping): Promise<WriteReply> {
    const problem =
      mappingValueProblem(body) ??
      intervalProblem(millisecondsOf(body as unknown as Record<string, unknown>));
    if (problem) throw problem;
    return this.writes.execute(
      { operationId: 'createUseMapping', pathParams: { caseId }, body, requester },
      async (context) => {
        const { tx } = context;
        const operation = 'createUseMapping';
        const current = await lockCase(tx, caseId);
        context.checkPrecondition({
          entityType: CASE_ENTITY,
          id: caseId,
          rowVersion: current.rowVersion,
        });
        assertCaseWritable(current, operation);
        await assertBodyChild(tx, 'CaseWork', caseId, body.caseWorkId, 'caseWorkId', operation);
        await assertBodyChild(
          tx,
          'ReportedItem',
          caseId,
          body.reportedItemId,
          'reportedItemId',
          operation,
        );
        const duplicate = await tx.useMapping.findFirst({
          where: {
            caseWorkId: body.caseWorkId,
            reportedItemId: body.reportedItemId,
            occurrence: body.occurrence,
          },
          select: { id: true },
        });
        if (duplicate) throw apiErrors.duplicateUseMapping(duplicate.id);
        await this.assertBasis(
          tx,
          current,
          body.provenance ?? 'MISSING',
          body.basisSourceId ?? null,
        );
        const id = randomUUID();
        const row = await tx.useMapping
          .create({
            data: {
              ...mappingData(body as unknown as Record<string, unknown>, CREATE_FIELDS),
              id,
              caseId,
              createdAt: context.now,
              createdById: context.actorUserId,
              updatedAt: context.now,
              updatedById: context.actorUserId,
            } as Prisma.UseMappingUncheckedCreateInput,
          })
          .catch((error: unknown) => {
            // The unique (work, item, occurrence) key is the backstop; the case lock serializes.
            if (isUniqueViolation(error)) throw apiErrors.duplicateUseMapping(null);
            throw error;
          });
        const caseRow = await touchCaseFor(context, current);
        const view = toUseMappingView(row);
        await context.audit({
          action: 'USE_MAPPING_CREATED',
          entityType: ENTITY,
          entityId: id,
          before: caseVersions(current),
          after: {
            caseId,
            ...auditFields(view, [
              ...presentFields(body as unknown as Record<string, unknown>),
              'boundaryConvention',
              'provenance',
            ]),
            rowVersion: row.rowVersion,
            ...caseVersions(caseRow),
          },
          sourceIds: row.basisSourceId === null ? [] : [row.basisSourceId],
        });
        return created(ENTITY, view, [caseAffected(caseRow)]);
      },
    );
  }

  patch(
    requester: WriteRequester,
    caseId: string,
    id: string,
    body: PatchUseMapping,
  ): Promise<WriteReply> {
    const problem = mappingValueProblem(body);
    if (problem) throw problem;
    return this.writes.execute(
      { operationId: 'patchUseMapping', pathParams: { caseId, id }, body, requester },
      async (context) => {
        const { tx } = context;
        const operation = 'patchUseMapping';
        const { caseRow, current } = await this.lockMapping(context, caseId, id);
        assertCaseWritable(caseRow, operation);
        assertChildWritable(current, ENTITY, operation);
        await this.assertPartiesUnarchived(tx, current, operation);
        const view = toUseMappingView(current);
        const changed = changedFields(view, body);
        if (changed.length === 0) return unchanged(ENTITY, view);
        const merged: Record<string, unknown> = { ...view };
        for (const field of changed) merged[field] = (body as Record<string, unknown>)[field];
        const range = intervalProblem(millisecondsOf(merged));
        if (range) throw range;
        if (changed.includes('provenance') || changed.includes('basisSourceId')) {
          await this.assertBasis(
            tx,
            caseRow,
            merged['provenance'] as Provenance,
            (merged['basisSourceId'] as string | null) ?? null,
            changed.includes('basisSourceId'),
          );
        }
        const row = await tx.useMapping.update({
          where: { id, rowVersion: current.rowVersion },
          data: {
            ...mappingData(body as Record<string, unknown>, changed),
            rowVersion: { increment: 1 },
            updatedAt: context.now,
            updatedById: context.actorUserId,
          },
        });
        const touched = await touchCaseFor(context, caseRow);
        const next = toUseMappingView(row);
        await context.audit({
          action: 'USE_MAPPING_UPDATED',
          entityType: ENTITY,
          entityId: id,
          before: {
            ...auditFields(view, changed),
            rowVersion: current.rowVersion,
            ...caseVersions(caseRow),
          },
          after: {
            ...auditFields(next, changed),
            rowVersion: row.rowVersion,
            ...caseVersions(touched),
          },
          sourceIds: row.basisSourceId === null ? [] : [row.basisSourceId],
        });
        return updated(ENTITY, next, [caseAffected(touched)]);
      },
    );
  }

  /** Administrative archive: facts that name the mapping stay exactly as they are. */
  archive(
    requester: WriteRequester,
    caseId: string,
    id: string,
    body: ArchiveRequest,
  ): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'archiveUseMapping', pathParams: { caseId, id }, body, requester },
      async (context) => {
        const { caseRow, current } = await this.lockMapping(context, caseId, id);
        assertCaseWritable(caseRow, 'archive');
        if (current.archivedAt !== null) {
          throw apiErrors.recordStateConflict({ archived: true, operation: 'archive' });
        }
        return this.setArchive(context, caseRow, current, 'USE_MAPPING_ARCHIVED', body.reason, {
          archivedAt: context.now,
          archiveReason: body.reason,
        });
      },
    );
  }

  /**
   * Clears the archive flag only. Refused while the mapping's work or reported item is archived;
   * the basis source must still apply to the case in its current context.
   */
  restore(
    requester: WriteRequester,
    caseId: string,
    id: string,
    body: ArchiveRequest,
  ): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'restoreUseMapping', pathParams: { caseId, id }, body, requester },
      async (context) => {
        const { tx } = context;
        const { caseRow, current } = await this.lockMapping(context, caseId, id);
        assertCaseWritable(caseRow, 'restore');
        if (current.archivedAt === null) {
          throw apiErrors.recordStateConflict({ archived: false, operation: 'restore' });
        }
        await this.assertPartiesUnarchived(tx, current, 'restoreUseMapping');
        if (current.basisSourceId !== null) {
          await assertSourcesUsable(
            tx,
            [{ field: 'basisSourceId', sourceId: current.basisSourceId }],
            await caseTarget(tx, caseRow),
          );
        }
        return this.setArchive(context, caseRow, current, 'USE_MAPPING_RESTORED', body.reason, {
          archivedAt: null,
          archiveReason: null,
        });
      },
    );
  }

  /**
   * The basis source applies to this case (source-scope.ts) when it is set and new, and a mapping
   * recorded as DOCUMENT_REVIEWED cites a basis source that itself records an attributed review
   * (422 REVIEW_UNSUPPORTED; citing one never upgrades anything).
   */
  private async assertBasis(
    tx: Prisma.TransactionClient,
    caseRow: CaseRecord,
    provenance: Provenance,
    basisSourceId: string | null,
    checkScope = true,
  ): Promise<void> {
    if (basisSourceId !== null && checkScope) {
      await assertSourcesUsable(
        tx,
        [{ field: 'basisSourceId', sourceId: basisSourceId }],
        await caseTarget(tx, caseRow),
      );
    }
    if (provenance !== 'DOCUMENT_REVIEWED') return;
    if (basisSourceId === null) throw apiErrors.reviewUnsupported('provenance', 'NO_BASIS_SOURCE');
    const source = await tx.sourceReference.findUniqueOrThrow({
      where: { id: basisSourceId },
      select: { reportedProvenance: true },
    });
    const problem = eventReviewProblem(provenance, source.reportedProvenance);
    if (problem) throw problem;
  }

  /** 409 while the mapping's work or reported item is archived (read-only material). */
  private async assertPartiesUnarchived(
    tx: Prisma.TransactionClient,
    row: UseMapping,
    operation: string,
  ): Promise<void> {
    const work = await tx.caseWork.findUniqueOrThrow({
      where: { id: row.caseWorkId },
      select: { archivedAt: true },
    });
    if (work.archivedAt !== null) {
      throw apiErrors.recordStateConflict({
        record: 'CaseWork',
        archived: true,
        operation,
        field: 'caseWorkId',
      });
    }
    const item = await tx.reportedItem.findUniqueOrThrow({
      where: { id: row.reportedItemId },
      select: { archivedAt: true },
    });
    if (item.archivedAt !== null) {
      throw apiErrors.recordStateConflict({
        record: 'ReportedItem',
        archived: true,
        operation,
        field: 'reportedItemId',
      });
    }
  }

  /**
   * Locks in the lock order — the case, the mapping's work and item (share), the mapping — and
   * checks If-Match (404 before 412). A mapping's case, work and item never change, so they are
   * read before locking.
   */
  private async lockMapping(
    context: WriteContext,
    caseId: string,
    id: string,
  ): Promise<{ caseRow: CaseRecord; current: UseMapping }> {
    const { tx } = context;
    if ((await childCase(tx, 'UseMapping', id)) !== caseId) throw apiErrors.notFound();
    const parties = await tx.useMapping.findUniqueOrThrow({
      where: { id },
      select: { caseWorkId: true, reportedItemId: true },
    });
    const caseRow = await lockCase(tx, caseId);
    await lockForShare(tx, 'CaseWork', parties.caseWorkId);
    await lockForShare(tx, 'ReportedItem', parties.reportedItemId);
    if (!(await lockForUpdate(tx, 'UseMapping', id))) throw apiErrors.notFound();
    const current = await tx.useMapping.findUniqueOrThrow({ where: { id } });
    context.checkPrecondition({ entityType: ENTITY, id, rowVersion: current.rowVersion });
    return { caseRow, current };
  }

  private async setArchive(
    context: WriteContext,
    caseRow: CaseRecord,
    current: UseMapping,
    action: string,
    reason: string,
    change: Pick<UseMapping, 'archivedAt' | 'archiveReason'>,
  ) {
    const row = await context.tx.useMapping.update({
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
    return updated(ENTITY, toUseMappingView(row), [caseAffected(touched)]);
  }
}
