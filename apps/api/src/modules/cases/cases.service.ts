// CaseRecord (P4A) — the business Case (DOMAIN_MODEL_v1 §10): the boundary of every case-specific
// record. A case is not a legal verdict: creating, binding, closing or archiving one establishes no
// ownership, infringement, permission, authority, G1–G7, readiness, signature or external action.
// Nothing crosses from one case to another, even when two cases share an agency, owner, subject,
// route, mandate, coverage or signer.
//
//   create     only the supplied contracted fields: agencyId (existing, unarchived), intakeLabel,
//              optional ownerHintId (existing, unarchived), routeId (checked like a route binding),
//              caseClass, notes. workflowState INTAKE, contextRevision 1; no canonical id, source
//              link, selection or state is inferred (AC-019: no invented sequential code).
//   patch      intakeLabel, ownerHintId, packetSourceId, driveFolderUrl, notes with If-Match. The
//              agency, platform, class, route, canonical code, workflow state, archive flag and
//              selection pointer are not in PatchCase (unknown field → 422) and change only through
//              their own commands. While a route is bound the owner hint is null or the route's
//              owner (422 CROSS_OWNER_REFERENCE); a packet source must apply to the case
//              (source-scope.ts). A no-op writes nothing; notes alone do not move contextRevision.
//   delete     only an unused case: not archived, no canonical binding, no row referencing it and no
//              JSON snapshot reference → otherwise 409 REFERENCED_RECORD_CANNOT_DELETE; no dependency
//              is ever deleted to make room.
//   archive    administrative flag; links, selections, bindings and workflow state stay; nothing
//              cascades. An archived case is read-only except restore.
//   restore    clears the flag only; refused while the case's agency or bound route is archived; it
//              revives no route, link or authority and changes no selection.
//   workflow   any other WorkflowState with a reason (same state 409). CLOSED records closedAt and
//              closeReason; leaving CLOSED clears them (the audit trail keeps the history). No state
//              is gated on, or means, authority, infringement, readiness, submission or an outcome.
//   route      RouteBindingCase only: the route is the case's agency's, unarchived and LINKED with
//              usable parties (case-rules.ts). The same route again is 409; replacing a bound route
//              is refused once the case is history-bearing (409
//              BINDING_CORRECTION_REQUIRES_RECONCILIATION, INVARIANTS §4), and every source the case
//              relies on must fit the new route's context. A binding is an association only.
//   canonical  CanonicalBindingCase: the P3A binding rules with the case as the source target;
//              an identity/reference association only, never a review, provenance change or proof.
// Lock order: Agency (share) → LegalSubject → Owner → OwnerSubject → Route (share) → CaseRecord
// (update) → CaseSource → SourceReference.
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  ArchiveRequest,
  BindCaseRoute,
  CanonicalBindingRequest,
  CaseRecord as CaseRecordView,
  CaseWorkflowRequest,
  CreateCase,
  PatchCase,
} from '@tb/contracts';
import { Prisma, type CaseRecord } from '../../../generated/prisma/client.js';
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
  type WriteContext,
  type WriteReply,
  type WriteRequester,
} from '../../infrastructure/write/write-executor.js';
import { currentHead } from '../directory/canonical-binding.js';
import { auditFields, changedFields, presentFields, writeData } from '../directory/changes.js';
import { created, deleted, unchanged, updated } from '../directory/outcomes.js';
import { dependencyReasons, lockForShare } from '../directory/records.js';
import { routeContext } from '../representation/authority-chain.js';
import { assertSourcesUsable } from '../sources/source-scope.js';
import {
  assertCaseSourcesFit,
  assertCaseWritable,
  assertOwnerHintFits,
  assertOwnerHintUsable,
  assertRouteUsableForCase,
  CASE_ENTITY,
  caseTarget,
  historyBlockers,
  lockCase,
  lockParties,
  WORKFLOW_STATES,
} from './case-rules.js';
import { toCaseView } from './case-views.js';

const ENTITY = CASE_ENTITY;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Writable CreateCase fields besides the defaults (platform, caseClass) set explicitly. */
const CREATE_FIELDS = ['agencyId', 'intakeLabel', 'ownerHintId', 'routeId', 'notes'] as const;
/** PatchCase fields that change the case context (INVARIANTS §5 contextRevision); notes do not. */
const MATERIAL_PATCH_FIELDS = ['intakeLabel', 'ownerHintId', 'packetSourceId', 'driveFolderUrl'];
const ARCHIVE_FIELDS = ['archivedAt', 'archiveReason'] as const;
const WORKFLOW_FIELDS = ['workflowState', 'closedAt', 'closeReason'] as const;
const CANONICAL_FIELDS = ['canonicalCaseId', 'canonicalBindingSourceId'] as const;

@Injectable()
export class CasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly writes: WriteExecutor,
    private readonly cursors: CursorCodec,
  ) {}

  /**
   * `agencyId`, `routeId`, `workflowState`: exact filters (an unknown workflow state is 400). `q`:
   * literal, case- and accent-insensitive substring of the intake label or canonical case id, or
   * the exact case or owner-hint id.
   */
  async list(query: QueryValues): Promise<{ items: CaseRecordView[]; nextCursor: string | null }> {
    const q = searchText(query);
    const agencyId = typeof query['agencyId'] === 'string' ? query['agencyId'] : null;
    const routeId = typeof query['routeId'] === 'string' ? query['routeId'] : null;
    const workflowState =
      typeof query['workflowState'] === 'string' ? query['workflowState'] : null;
    if (workflowState !== null && !(WORKFLOW_STATES as readonly string[]).includes(workflowState)) {
      throw apiErrors.invalidQueryParameter('workflowState');
    }
    const page = pageRequest(contractOperation('listCases'), query, this.cursors, {
      q,
      agencyId,
      routeId,
      workflowState,
    });
    const agency = agencyId === null ? Prisma.empty : Prisma.sql`AND c.agency_id = ${agencyId}`;
    const route = routeId === null ? Prisma.empty : Prisma.sql`AND c.route_id = ${routeId}`;
    const state =
      workflowState === null ? Prisma.empty : Prisma.sql`AND c.workflow_state = ${workflowState}`;
    const exact =
      q !== null && UUID.test(q)
        ? Prisma.sql`OR c.id = ${q} OR c.owner_hint_id = ${q}`
        : Prisma.empty;
    const match =
      q === null
        ? Prisma.empty
        : Prisma.sql`AND (c.intake_label COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!'
            OR c.canonical_case_id COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!'
            ${exact})`;
    const ids = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT c.id FROM cases c WHERE 1 = 1 ${agency} ${route} ${state} ${match}
        ${keysetAfter(page.after, 'c')}
        ORDER BY c.created_at DESC, c.id DESC ${pageLimit(page)}`,
    );
    const rows = await this.prisma.caseRecord.findMany({
      where: { id: { in: ids.map((row) => row.id) } },
    });
    return toPage(inIdOrder(ids, rows), page, this.cursors, toCaseView);
  }

  async get(id: string): Promise<CaseRecordView> {
    const row = await this.prisma.caseRecord.findUnique({ where: { id } });
    if (!row) throw apiErrors.notFound();
    return toCaseView(row);
  }

  /** A new local case with exactly the supplied fields; nothing is inferred or created with it. */
  create(requester: WriteRequester, body: CreateCase): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'createCase', pathParams: {}, body, requester },
      async (context) => {
        const { tx } = context;
        const routeId = body.routeId ?? null;
        const ownerHintId = body.ownerHintId ?? null;
        // Route columns never change: read them to lock the route's parties in the lock order.
        const route = routeId === null ? null : await routeContext(tx, routeId);
        await lockParties(tx, { agencyIds: [body.agencyId], ownerIds: [ownerHintId], route });
        const agency = await tx.agency.findUnique({
          where: { id: body.agencyId },
          select: { recordState: true },
        });
        if (!agency) throw apiErrors.referenceNotFound('agencyId');
        if (agency.recordState === 'ARCHIVED') {
          throw apiErrors.recordStateConflict({
            record: 'Agency',
            state: 'ARCHIVED',
            operation: 'createCase',
            field: 'agencyId',
          });
        }
        if (ownerHintId !== null) await assertOwnerHintUsable(tx, ownerHintId, 'createCase');
        if (routeId !== null) {
          if (!route) throw apiErrors.referenceNotFound('routeId');
          await assertRouteUsableForCase(tx, route, body.agencyId, 'createCase');
          assertOwnerHintFits(ownerHintId, route, 'routeId');
        }
        const id = randomUUID();
        const row = await tx.caseRecord.create({
          data: {
            ...writeData(body, CREATE_FIELDS, []),
            id,
            platform: body.platform ?? 'YOUTUBE',
            caseClass: body.caseClass ?? 'WORKING_INTAKE',
            createdAt: context.now,
            createdById: context.actorUserId,
            updatedAt: context.now,
            updatedById: context.actorUserId,
          } as Prisma.CaseRecordUncheckedCreateInput,
        });
        await context.audit({
          action: 'CASE_CREATED',
          entityType: ENTITY,
          entityId: id,
          after: {
            ...auditFields(row, presentFields(body)),
            platform: row.platform,
            caseClass: row.caseClass,
            workflowState: row.workflowState,
            contextRevision: row.contextRevision,
            rowVersion: row.rowVersion,
          },
        });
        return created(ENTITY, toCaseView(row));
      },
    );
  }

  patch(requester: WriteRequester, id: string, body: PatchCase): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'patchCase', pathParams: { caseId: id }, body, requester },
      async (context) => {
        const { tx } = context;
        if (!(await tx.caseRecord.findUnique({ where: { id }, select: { id: true } }))) {
          throw apiErrors.notFound();
        }
        // An owner is locked before any case (lock order); a hint that does not exist is reported
        // after the If-Match check.
        if (typeof body.ownerHintId === 'string') {
          await lockForShare(tx, 'Owner', body.ownerHintId);
        }
        const current = await lockCase(tx, id);
        context.checkPrecondition({ entityType: ENTITY, id, rowVersion: current.rowVersion });
        assertCaseWritable(current, 'patchCase');
        const view = toCaseView(current);
        const changed = changedFields(view, body);
        if (changed.length === 0) return unchanged(ENTITY, view);
        if (changed.includes('ownerHintId') && body.ownerHintId) {
          await assertOwnerHintUsable(tx, body.ownerHintId, 'patchCase');
          if (current.routeId !== null) {
            const route = await routeContext(tx, current.routeId);
            if (!route) throw new Error('case route missing');
            assertOwnerHintFits(body.ownerHintId, route, 'ownerHintId');
          }
        }
        const packet = changed.includes('packetSourceId') ? (body.packetSourceId ?? null) : null;
        if (packet !== null) {
          await assertSourcesUsable(
            tx,
            [{ field: 'packetSourceId', sourceId: packet }],
            await caseTarget(tx, current),
          );
        }
        const material = changed.some((field) => MATERIAL_PATCH_FIELDS.includes(field));
        const row = await tx.caseRecord.update({
          where: { id, rowVersion: current.rowVersion },
          data: {
            ...writeData(body, changed, []),
            rowVersion: { increment: 1 },
            ...(material ? { contextRevision: { increment: 1 } } : {}),
            updatedAt: context.now,
            updatedById: context.actorUserId,
          },
        });
        await context.audit({
          action: 'CASE_UPDATED',
          entityType: ENTITY,
          entityId: id,
          before: {
            ...auditFields(current, changed),
            contextRevision: current.contextRevision,
            rowVersion: current.rowVersion,
          },
          after: {
            ...auditFields(row, changed),
            contextRevision: row.contextRevision,
            rowVersion: row.rowVersion,
          },
          sourceIds: packet === null ? [] : [packet],
        });
        return updated(ENTITY, toCaseView(row));
      },
    );
  }

  /** Discards an unused case; anything that refers to it (history included) blocks deletion. */
  delete(requester: WriteRequester, id: string): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'deleteUnusedCase', pathParams: { caseId: id }, body: null, requester },
      async (context) => {
        const current = await lockCase(context.tx, id);
        context.checkPrecondition({ entityType: ENTITY, id, rowVersion: current.rowVersion });
        const blockers: string[] = [];
        if (current.archivedAt !== null) blockers.push('ARCHIVED');
        if (current.canonicalCaseId !== null || current.canonicalBindingSourceId !== null) {
          blockers.push('CANONICAL_BINDING');
        }
        blockers.push(...(await dependencyReasons(context.tx, ENTITY, id)));
        if (blockers.length > 0) throw apiErrors.referencedRecordCannotDelete(blockers);
        await context.tx.caseRecord.delete({ where: { id, rowVersion: current.rowVersion } });
        await context.audit({
          action: 'CASE_DELETED',
          entityType: ENTITY,
          entityId: id,
          before: {
            ...auditFields(current, [
              'agencyId',
              'intakeLabel',
              'ownerHintId',
              'routeId',
              'caseClass',
              'workflowState',
            ]),
            rowVersion: current.rowVersion,
          },
        });
        return deleted(ENTITY, id);
      },
    );
  }

  /** Administrative archive: links, selections and bindings stay; nothing cascades or is revoked. */
  archive(requester: WriteRequester, id: string, body: ArchiveRequest): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'ArchiveCase', pathParams: { caseId: id }, body, requester },
      async (context) => {
        const current = await this.lock(context, id);
        if (current.archivedAt !== null) {
          throw apiErrors.recordStateConflict({ archived: true, operation: 'archive' });
        }
        return this.write(context, current, ARCHIVE_FIELDS, 'CASE_ARCHIVED', body.reason, {
          archivedAt: context.now,
          archiveReason: body.reason,
        });
      },
    );
  }

  /**
   * Clears the archive flag only. Refused while the agency or the bound route is archived (restore
   * never re-activates them); links, selections and bindings are exactly as they were. The agency
   * and route states are read under the case lock: archiving either afterwards is an ordinary later
   * change, so they need no lock of their own.
   */
  restore(requester: WriteRequester, id: string, body: ArchiveRequest): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'RestoreCase', pathParams: { caseId: id }, body, requester },
      async (context) => {
        const { tx } = context;
        const current = await this.lock(context, id);
        if (current.archivedAt === null) {
          throw apiErrors.recordStateConflict({ archived: false, operation: 'restore' });
        }
        const agency = await tx.agency.findUniqueOrThrow({
          where: { id: current.agencyId },
          select: { recordState: true },
        });
        if (agency.recordState === 'ARCHIVED') {
          throw apiErrors.recordStateConflict({
            record: 'Agency',
            state: 'ARCHIVED',
            operation: 'RestoreCase',
          });
        }
        if (current.routeId !== null) {
          const route = await tx.route.findUniqueOrThrow({
            where: { id: current.routeId },
            select: { archivedAt: true },
          });
          if (route.archivedAt !== null) {
            throw apiErrors.recordStateConflict({
              record: 'Route',
              archived: true,
              operation: 'RestoreCase',
            });
          }
        }
        return this.write(context, current, ARCHIVE_FIELDS, 'CASE_RESTORED', body.reason, {
          archivedAt: null,
          archiveReason: null,
        });
      },
    );
  }

  /** Operational workflow state only: no state is a legal, authority or readiness conclusion. */
  setWorkflow(
    requester: WriteRequester,
    id: string,
    body: CaseWorkflowRequest,
  ): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'WorkflowCase', pathParams: { caseId: id }, body, requester },
      async (context) => {
        const current = await this.lock(context, id);
        assertCaseWritable(current, 'WorkflowCase');
        if (current.workflowState === body.state) {
          throw apiErrors.recordStateConflict({
            workflowState: current.workflowState,
            requested: body.state,
            operation: 'workflow',
          });
        }
        const closing = body.state === 'CLOSED';
        return this.write(context, current, WORKFLOW_FIELDS, 'CASE_WORKFLOW_CHANGED', body.reason, {
          workflowState: body.state,
          closedAt: closing ? context.now : null,
          closeReason: closing ? body.reason : null,
        });
      },
    );
  }

  /** Associates the case with one exact compatible route (RouteBindingCase); no authority. */
  bindRoute(requester: WriteRequester, id: string, body: BindCaseRoute): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'RouteBindingCase', pathParams: { caseId: id }, body, requester },
      async (context) => {
        const { tx } = context;
        // A case's agency never changes: read it first to lock the parties in the lock order.
        const parent = await tx.caseRecord.findUnique({
          where: { id },
          select: { agencyId: true },
        });
        if (!parent) throw apiErrors.notFound();
        const route = await routeContext(tx, body.routeId);
        await lockParties(tx, { agencyIds: [parent.agencyId], ownerIds: [], route });
        const current = await this.lock(context, id);
        assertCaseWritable(current, 'RouteBindingCase');
        if (!route) throw apiErrors.referenceNotFound('routeId');
        if (current.routeId === route.routeId) {
          throw apiErrors.recordStateConflict({
            routeId: current.routeId,
            operation: 'route-binding',
          });
        }
        if (current.routeId !== null) {
          const blockers = await historyBlockers(tx, id);
          if (blockers.length > 0) {
            throw apiErrors.bindingCorrectionRequiresReconciliation(
              { routeId: current.routeId, blockers },
              'route',
            );
          }
        }
        await assertRouteUsableForCase(tx, route, current.agencyId, 'RouteBindingCase');
        assertOwnerHintFits(current.ownerHintId, route, 'routeId');
        await assertCaseSourcesFit(tx, current, route);
        const row = await tx.caseRecord.update({
          where: { id, rowVersion: current.rowVersion },
          data: {
            routeId: route.routeId,
            rowVersion: { increment: 1 },
            contextRevision: { increment: 1 },
            updatedAt: context.now,
            updatedById: context.actorUserId,
          },
        });
        await context.audit({
          action: 'CASE_ROUTE_BOUND',
          entityType: ENTITY,
          entityId: id,
          before: {
            routeId: current.routeId,
            contextRevision: current.contextRevision,
            rowVersion: current.rowVersion,
          },
          after: {
            routeId: row.routeId,
            contextRevision: row.contextRevision,
            rowVersion: row.rowVersion,
          },
          reason: body.reason,
        });
        return updated(ENTITY, toCaseView(row));
      },
    );
  }

  /**
   * Records which SourceReference holds the case's canonical case id (CanonicalBindingCase): an
   * identity/reference association only. It is never replaced here.
   */
  bindCanonical(
    requester: WriteRequester,
    id: string,
    body: CanonicalBindingRequest,
  ): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'CanonicalBindingCase', pathParams: { caseId: id }, body, requester },
      async (context) => {
        const { tx } = context;
        const current = await this.lock(context, id);
        assertCaseWritable(current, 'CanonicalBindingCase');
        if (current.canonicalCaseId !== null || current.canonicalBindingSourceId !== null) {
          throw apiErrors.bindingCorrectionRequiresReconciliation({
            canonicalCaseId: current.canonicalCaseId,
            canonicalBindingSourceId: current.canonicalBindingSourceId,
          });
        }
        const [source] = await assertSourcesUsable(
          tx,
          [{ field: 'sourceId', sourceId: body.sourceId }],
          await caseTarget(tx, current),
        );
        if (source === undefined) throw apiErrors.referenceNotFound('sourceId');
        const head = await currentHead(tx, source.id, source.sourceGroupId);
        if (head !== source.id) throw apiErrors.sourceNotCurrent('sourceId', head);
        if (source.sourceRole !== 'CANONICAL_RECORD') {
          throw apiErrors.sourceRoleNotVerification('sourceId', source.sourceRole);
        }
        const holder = await tx.caseRecord.findFirst({
          where: { canonicalCaseId: body.canonicalCode },
          select: { id: true },
        });
        if (holder !== null && holder.id !== id) throw apiErrors.duplicateCanonicalCode(holder.id);
        const row = await tx.caseRecord
          .update({
            where: { id, rowVersion: current.rowVersion },
            data: {
              canonicalCaseId: body.canonicalCode,
              canonicalBindingSourceId: source.id,
              rowVersion: { increment: 1 },
              contextRevision: { increment: 1 },
              updatedAt: context.now,
              updatedById: context.actorUserId,
            },
          })
          .catch((error: unknown) => {
            // A concurrent binding of the same code won the unique canonical_case_id key.
            if (isUniqueViolation(error)) throw apiErrors.duplicateCanonicalCode(null);
            throw error;
          });
        await context.audit({
          action: 'CASE_CANONICAL_BOUND',
          entityType: ENTITY,
          entityId: id,
          before: {
            ...auditFields(current, CANONICAL_FIELDS),
            contextRevision: current.contextRevision,
            rowVersion: current.rowVersion,
          },
          after: {
            ...auditFields(row, CANONICAL_FIELDS),
            contextRevision: row.contextRevision,
            rowVersion: row.rowVersion,
          },
          reason: body.reason,
          sourceIds: [source.id],
        });
        return updated(ENTITY, toCaseView(row));
      },
    );
  }

  /** Writes an archive or workflow change with one version increment and one audit event. */
  private async write(
    context: WriteContext,
    current: CaseRecord,
    fields: readonly string[],
    action: string,
    reason: string,
    change: Partial<
      Pick<
        CaseRecord,
        'archivedAt' | 'archiveReason' | 'workflowState' | 'closedAt' | 'closeReason'
      >
    >,
  ) {
    const row = await context.tx.caseRecord.update({
      where: { id: current.id, rowVersion: current.rowVersion },
      data: {
        ...change,
        rowVersion: { increment: 1 },
        updatedAt: context.now,
        updatedById: context.actorUserId,
      },
    });
    await context.audit({
      action,
      entityType: ENTITY,
      entityId: current.id,
      before: { ...auditFields(current, fields), rowVersion: current.rowVersion },
      after: { ...auditFields(row, fields), rowVersion: row.rowVersion },
      reason,
    });
    return updated(ENTITY, toCaseView(row));
  }

  /** Locks the case, loads it and checks If-Match (404 before 412). */
  private async lock(context: WriteContext, id: string): Promise<CaseRecord> {
    const current = await lockCase(context.tx, id);
    context.checkPrecondition({ entityType: ENTITY, id, rowVersion: current.rowVersion });
    return current;
  }
}
