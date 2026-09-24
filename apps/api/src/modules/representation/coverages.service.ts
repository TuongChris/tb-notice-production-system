// MandateCoverage (P3B) — the documented scope of one MandateVersion over one exact Route
// (DOMAIN_MODEL_v1 §9: "Connect one exact MandateVersion to one exact Route. Preserve
// coveredWorksScope, territorialScope, actionScope, exclusions, conditions, exclusivity, dates and
// basis source. Scope for one subject is not transferred to another."). A coverage row is explicit
// and stored exactly as supplied; nothing is derived from the Agency, Owner, OwnerSubject, a similar
// route, the platform, names or an earlier coverage, and a coverage is not a G1 decision.
//
//   create  POST /mandate-versions/{versionId}/coverages with the version's If-Match; the version is
//           DRAFT (409 FROZEN_VERSION), its Mandate and Agency unarchived. The Route exists (422),
//           belongs to the version's Agency (422 CROSS_AGENCY_REFERENCE; composite FK as backstop)
//           and neither it nor its agency, owner or legal subject is archived (409). Its link state
//           is not a condition: a coverage records what a document covers. One coverage per (route,
//           version, label) → 409 DUPLICATE_COVERAGE. The basis source must apply to the route
//           (agency, subject and owner material; source-scope.ts). predecessorCoverageId, when
//           given, is a coverage of the same Route and the same Mandate in a FROZEN version (422
//           AUTHORITY_SCOPE_UNRESOLVED / 409 VERSION_NOT_FROZEN): lineage only, it inherits nothing.
//   patch   DRAFT parent only; routeId and predecessorCoverageId are not in PatchCoverage (a coverage
//           never moves to another route or lineage); a no-op PATCH writes nothing.
//   Every mutation locks the parent version, asserts DRAFT and increments the parent's row version
//   (INVARIANTS §5), so freeze and child edits serialize and a version's ETag covers its children.
// Lock order: Agency (share) → LegalSubject → Owner → OwnerSubject → Route (share) → Mandate
// (share) → MandateVersion (update) → MandateCoverage (update) → SourceReference.
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  CreateCoverage,
  MandateCoverage as MandateCoverageView,
  PatchCoverage,
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
import { storabilityProblem } from '../../infrastructure/write/storability.js';
import {
  WriteExecutor,
  type WriteReply,
  type WriteRequester,
} from '../../infrastructure/write/write-executor.js';
import { changedFields, presentFields } from '../directory/changes.js';
import { created, unchanged, updated } from '../directory/outcomes.js';
import { lockForShare } from '../directory/records.js';
import { assertSourcesUsable } from '../sources/source-scope.js';
import {
  assertDraft,
  assertMandateUsable,
  coverageParents,
  lockCoverage,
  lockMandate,
  lockUnarchivedAgencies,
  lockVersion,
  routeContext,
  routeTarget,
  touchVersion,
  versionParents,
  type RouteContext,
} from './authority-chain.js';
import { authorityAuditFields, authorityWriteData, dateRangeProblem } from './authority-rules.js';
import { toCoverageView } from './authority-views.js';

const ENTITY = 'MandateCoverage';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Writable scope fields (PatchCoverage; create adds routeId and predecessorCoverageId). */
const SCOPE_FIELDS = [
  'coverageLabel',
  'coveredWorksScope',
  'territorialScope',
  'actionScope',
  'exclusions',
  'conditions',
  'exclusivity',
  'effectiveOn',
  'expiresOn',
  'basisSourceId',
] as const;
const DATE_FIELDS = ['effectiveOn', 'expiresOn'];

@Injectable()
export class CoveragesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly writes: WriteExecutor,
    private readonly cursors: CursorCodec,
  ) {}

  /**
   * Coverages of one version (404 for an unknown version). `q`: the exact coverage or route id, or
   * a case- and accent-insensitive substring of the coverage label.
   */
  async list(
    versionId: string,
    query: QueryValues,
  ): Promise<{ items: MandateCoverageView[]; nextCursor: string | null }> {
    const version = await this.prisma.mandateVersion.findUnique({
      where: { id: versionId },
      select: { id: true },
    });
    if (!version) throw apiErrors.notFound();
    const q = searchText(query);
    const page = pageRequest(contractOperation('listVersionCoverages'), query, this.cursors, {
      versionId,
      q,
    });
    const exact =
      q !== null && UUID.test(q) ? Prisma.sql`OR c.id = ${q} OR c.route_id = ${q}` : Prisma.empty;
    const match =
      q === null
        ? Prisma.empty
        : Prisma.sql`AND (c.coverage_label COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!'
            ${exact})`;
    const ids = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT c.id FROM mandate_coverages c WHERE c.mandate_version_id = ${versionId}
        ${match} ${keysetAfter(page.after, 'c')}
        ORDER BY c.created_at DESC, c.id DESC ${pageLimit(page)}`,
    );
    const rows = await this.prisma.mandateCoverage.findMany({
      where: { id: { in: ids.map((row) => row.id) } },
    });
    return toPage(inIdOrder(ids, rows), page, this.cursors, toCoverageView);
  }

  async get(id: string): Promise<MandateCoverageView> {
    const row = await this.prisma.mandateCoverage.findUnique({ where: { id } });
    if (!row) throw apiErrors.notFound();
    return toCoverageView(row);
  }

  /** A new coverage of one draft version over one exact route, stored exactly as supplied. */
  create(requester: WriteRequester, versionId: string, body: CreateCoverage): Promise<WriteReply> {
    const problem =
      storabilityProblem(body, DATE_FIELDS) ??
      dateRangeProblem('effectiveOn', body.effectiveOn, 'expiresOn', body.expiresOn);
    if (problem) throw problem;
    return this.writes.execute(
      { operationId: 'createCoverage', pathParams: { versionId }, body, requester },
      async (context) => {
        const { tx } = context;
        const parents = await versionParents(tx, versionId);
        if (!parents) throw apiErrors.notFound();
        // Route columns never change: read them to lock the route's parties in the lock order.
        const route = await routeContext(tx, body.routeId);
        for (const id of [
          ...new Set([parents.agencyId, route?.agencyId ?? parents.agencyId]),
        ].sort()) {
          await lockForShare(tx, 'Agency', id);
        }
        if (route) {
          await lockForShare(tx, 'LegalSubject', route.legalSubjectId);
          await lockForShare(tx, 'Owner', route.ownerId);
          await lockForShare(tx, 'OwnerSubject', route.ownerSubjectId);
          await lockForShare(tx, 'Route', route.routeId);
        }
        const mandate = await lockMandate(tx, parents.mandateId, 'share');
        const version = await lockVersion(tx, versionId);
        context.checkPrecondition({
          entityType: 'MandateVersion',
          id: versionId,
          rowVersion: version.rowVersion,
        });
        assertMandateUsable(mandate, 'createCoverage');
        assertDraft(version, 'createCoverage');
        await lockUnarchivedAgencies(
          tx,
          [{ id: version.agencyId, field: 'agencyId' }],
          'createCoverage',
        );
        if (!route) throw apiErrors.referenceNotFound('routeId');
        if (route.agencyId !== version.agencyId) {
          throw apiErrors.crossAgencyReference('routeId', 'record');
        }
        await assertRouteUsable(tx, route);
        const duplicate = await tx.mandateCoverage.findFirst({
          where: {
            routeId: route.routeId,
            mandateVersionId: versionId,
            coverageLabel: body.coverageLabel,
          },
          select: { id: true },
        });
        if (duplicate) throw apiErrors.duplicateCoverage(duplicate.id);
        if (body.predecessorCoverageId) {
          await assertPredecessorCoverage(
            tx,
            body.predecessorCoverageId,
            mandate.id,
            route.routeId,
          );
        }
        if (body.basisSourceId) {
          await assertSourcesUsable(
            tx,
            [{ field: 'basisSourceId', sourceId: body.basisSourceId }],
            routeTarget(route),
          );
        }
        const id = randomUUID();
        const row = await tx.mandateCoverage
          .create({
            data: {
              ...authorityWriteData(body, SCOPE_FIELDS),
              id,
              mandateVersionId: versionId,
              routeId: route.routeId,
              agencyId: version.agencyId,
              predecessorCoverageId: body.predecessorCoverageId ?? null,
              createdAt: context.now,
              createdById: context.actorUserId,
              updatedAt: context.now,
              updatedById: context.actorUserId,
            } as Prisma.MandateCoverageUncheckedCreateInput,
          })
          .catch((error: unknown) => {
            if (isUniqueViolation(error)) throw apiErrors.duplicateCoverage(null);
            throw error;
          });
        const versionRowVersion = await touchVersion(context, version);
        await context.audit({
          action: 'MANDATE_COVERAGE_CREATED',
          entityType: ENTITY,
          entityId: id,
          before: { versionRowVersion: version.rowVersion },
          after: {
            ...authorityAuditFields(row, presentFields(body)),
            mandateVersionId: versionId,
            rowVersion: row.rowVersion,
            versionRowVersion,
          },
          sourceIds: body.basisSourceId ? [body.basisSourceId] : [],
        });
        return created(ENTITY, toCoverageView(row), [
          { type: 'MandateVersion', id: versionId, rowVersion: versionRowVersion },
        ]);
      },
    );
  }

  /** Edits a coverage of a DRAFT version; the route and lineage never change. */
  patch(requester: WriteRequester, id: string, body: PatchCoverage): Promise<WriteReply> {
    const problem = storabilityProblem(body, DATE_FIELDS);
    if (problem) throw problem;
    return this.writes.execute(
      { operationId: 'patchDraftCoverage', pathParams: { id }, body, requester },
      async (context) => {
        const { tx } = context;
        const parents = await coverageParents(tx, id);
        if (!parents) throw apiErrors.notFound();
        const mandate = await lockMandate(tx, parents.mandateId, 'share');
        const version = await lockVersion(tx, parents.mandateVersionId);
        const current = await lockCoverage(tx, id);
        context.checkPrecondition({ entityType: ENTITY, id, rowVersion: current.rowVersion });
        assertMandateUsable(mandate, 'patchDraftCoverage');
        assertDraft(version, 'patchDraftCoverage');
        const view = toCoverageView(current);
        const changed = changedFields(view, body);
        if (changed.length === 0) return unchanged(ENTITY, view);
        const dates = dateRangeProblem(
          'effectiveOn',
          body.effectiveOn === undefined ? view.effectiveOn : body.effectiveOn,
          'expiresOn',
          body.expiresOn === undefined ? view.expiresOn : body.expiresOn,
        );
        if (dates) throw dates;
        if (changed.includes('coverageLabel') && body.coverageLabel !== undefined) {
          const duplicate = await tx.mandateCoverage.findFirst({
            where: {
              routeId: current.routeId,
              mandateVersionId: current.mandateVersionId,
              coverageLabel: body.coverageLabel,
              id: { not: id },
            },
            select: { id: true },
          });
          if (duplicate) throw apiErrors.duplicateCoverage(duplicate.id);
        }
        if (changed.includes('basisSourceId') && body.basisSourceId) {
          const route = await routeContext(tx, current.routeId);
          if (!route) throw new Error('coverage route missing');
          await assertSourcesUsable(
            tx,
            [{ field: 'basisSourceId', sourceId: body.basisSourceId }],
            routeTarget(route),
          );
        }
        const row = await tx.mandateCoverage
          .update({
            where: { id, rowVersion: current.rowVersion },
            data: {
              ...authorityWriteData(body, changed),
              rowVersion: { increment: 1 },
              updatedAt: context.now,
              updatedById: context.actorUserId,
            },
          })
          .catch((error: unknown) => {
            if (isUniqueViolation(error)) throw apiErrors.duplicateCoverage(null);
            throw error;
          });
        const versionRowVersion = await touchVersion(context, version);
        await context.audit({
          action: 'MANDATE_COVERAGE_UPDATED',
          entityType: ENTITY,
          entityId: id,
          before: {
            ...authorityAuditFields(current, changed),
            rowVersion: current.rowVersion,
            versionRowVersion: version.rowVersion,
          },
          after: {
            ...authorityAuditFields(row, changed),
            rowVersion: row.rowVersion,
            versionRowVersion,
          },
          sourceIds:
            changed.includes('basisSourceId') && body.basisSourceId ? [body.basisSourceId] : [],
        });
        return updated(ENTITY, toCoverageView(row), [
          { type: 'MandateVersion', id: current.mandateVersionId, rowVersion: versionRowVersion },
        ]);
      },
    );
  }
}

/** A coverage never names an archived route, agency, owner or legal subject (all share-locked). */
async function assertRouteUsable(tx: Prisma.TransactionClient, route: RouteContext): Promise<void> {
  const row = await tx.route.findUniqueOrThrow({
    where: { id: route.routeId },
    select: { archivedAt: true },
  });
  const owner = await tx.owner.findUniqueOrThrow({
    where: { id: route.ownerId },
    select: { recordState: true },
  });
  const subject = await tx.legalSubject.findUniqueOrThrow({
    where: { id: route.legalSubjectId },
    select: { recordState: true },
  });
  const archived =
    row.archivedAt !== null
      ? 'Route'
      : subject.recordState === 'ARCHIVED'
        ? 'LegalSubject'
        : owner.recordState === 'ARCHIVED'
          ? 'Owner'
          : null;
  if (archived !== null) {
    throw apiErrors.recordStateConflict({
      record: archived,
      archived: true,
      operation: 'createCoverage',
      field: 'routeId',
    });
  }
}

/**
 * A predecessor coverage is lineage within one authority chain: a coverage of the same Route and
 * the same Mandate in a FROZEN version (a frozen version never changes, so this stays true).
 */
async function assertPredecessorCoverage(
  tx: Prisma.TransactionClient,
  predecessorCoverageId: string,
  mandateId: string,
  routeId: string,
): Promise<void> {
  const predecessor = await tx.mandateCoverage.findUnique({
    where: { id: predecessorCoverageId },
    select: {
      routeId: true,
      mandateVersionId: true,
      version: { select: { mandateId: true, versionState: true } },
    },
  });
  if (!predecessor) throw apiErrors.referenceNotFound('predecessorCoverageId');
  if (predecessor.version.mandateId !== mandateId) {
    throw apiErrors.authorityScopeUnresolved('predecessorCoverageId', 'OTHER_MANDATE');
  }
  if (predecessor.routeId !== routeId) {
    throw apiErrors.authorityScopeUnresolved('predecessorCoverageId', 'OTHER_ROUTE');
  }
  if (predecessor.version.versionState !== 'FROZEN') {
    throw apiErrors.versionNotFrozen('predecessorCoverageId', predecessor.mandateVersionId);
  }
}
