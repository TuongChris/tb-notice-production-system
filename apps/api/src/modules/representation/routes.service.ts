// Route (P3A) — the operational path Agency + OwnerSubject + Platform (DOMAIN_MODEL_v1 §8). A route
// is a relationship record, not authority: creating, linking, pausing, unlinking or binding a route
// establishes no mandate, coverage, copyright ownership, representation authority, signer
// eligibility, G1–G7 or readiness, and unlinking revokes nothing (INVARIANTS §4).
//
//   create      explicit agencyId + ownerSubjectId (+ platform, YOUTUBE only): the agency, the
//               association and both of its parties exist (422) and are not archived (409); the
//               association is LINKED (409). One route per (agency, association, platform) →
//               409 DUPLICATE_ROUTE with the existing id (unique key as backstop). Nothing is
//               inferred from names, agencies or other owners' routes.
//   identity    agencyId, ownerSubjectId and platform are not in PatchRoute: a PATCH cannot move a
//               route (unknown field → 422); a different path is a different route.
//   defaults    defaultSignerId: an existing Signer of the same agency (composite FK as backstop),
//               not archived and not ENDED — a future selection suggestion only.
//               preferredCoverageId (P3B; INVARIANTS §3 "Route.preferredCoverageId belongs to the
//               same Route — transactional service check"): an existing coverage (422) of the same
//               agency (422 CROSS_AGENCY_REFERENCE) and of THIS route (422
//               AUTHORITY_SCOPE_UNRESOLVED), in a FROZEN version (409 VERSION_NOT_FROZEN) of an
//               unarchived Mandate (409). A new route has no coverage yet, so createRoute accepts
//               only null. null clears it. It is an operational default only: it adjudicates no
//               authority, passes no G1 and selects nothing for a case; recorded authority events
//               are not interpreted here.
//   link-state  LINKED | PAUSED | UNLINKED with a reason; same state 409. UNLINKED records
//               unlinkedAt; relinking clears it (the audit trail keeps the history). Returning to
//               LINKED needs the agency, owner and subject unarchived and the association LINKED —
//               it must not reactivate an archived party. Pause and unlink are always possible.
//   archive     orthogonal administrative flag (archivedAt / archiveReason); an archived route is
//               read-only except restore; restore clears the flag, keeps the link state and is
//               refused while the agency, owner or subject is archived.
//   delete      only an unused route: not archived, no canonical binding, no case / selection /
//               coverage reference and no JSON snapshot reference → otherwise 409 with blockers.
//   canonical   canonical-binding.ts with the route's agency, owner and subject as source scope.
// Lock order: Agency → LegalSubject → Owner → OwnerSubject (share) → Route (update) → Signer
// (share) → Mandate → MandateVersion → MandateCoverage (share) → SourceReference.
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  ArchiveRequest,
  CanonicalBindingRequest,
  CreateRoute,
  LinkStateRequest,
  PatchRoute,
  Route as RouteView,
} from '@tb/contracts';
import { Prisma, type Route } from '../../../generated/prisma/client.js';
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
import { applyCanonicalBinding } from '../directory/canonical-binding.js';
import { auditFields, changedFields, presentFields, writeData } from '../directory/changes.js';
import { created, deleted, unchanged, updated } from '../directory/outcomes.js';
import {
  dependencyReasons,
  hasCanonicalBinding,
  lockForShare,
  lockForUpdate,
} from '../directory/records.js';
import { toRouteView } from './route-views.js';

const ENTITY = 'Route';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Writable PatchRoute fields (the relationship identity is not among them). */
const PATCH_FIELDS = ['defaultSignerId', 'preferredCoverageId', 'casePrefixHint', 'notes'] as const;
const LINK_FIELDS = ['linkState', 'unlinkedAt', 'stateReason'] as const;
const ARCHIVE_FIELDS = ['archivedAt', 'archiveReason'] as const;

/** The route's parties, share-locked in the lock order. */
interface Parties {
  readonly agencyArchived: boolean;
  readonly ownerId: string;
  readonly ownerArchived: boolean;
  readonly legalSubjectId: string;
  readonly subjectArchived: boolean;
  readonly linkState: string;
}

@Injectable()
export class RoutesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly writes: WriteExecutor,
    private readonly cursors: CursorCodec,
  ) {}

  /**
   * `agencyId`: exact agency filter. `q`: literal, case- and accent-insensitive substring of the
   * owner's display name, the subject's legal name, the agency's display name, the case prefix hint
   * or the canonical code — or the exact route / association id (the routes of one association).
   */
  async list(query: QueryValues): Promise<{ items: RouteView[]; nextCursor: string | null }> {
    const q = searchText(query);
    const agencyId = typeof query['agencyId'] === 'string' ? query['agencyId'] : null;
    const page = pageRequest(contractOperation('listRoutes'), query, this.cursors, {
      q,
      agencyId,
    });
    const agency = agencyId === null ? Prisma.empty : Prisma.sql`AND r.agency_id = ${agencyId}`;
    const exact =
      q !== null && UUID.test(q)
        ? Prisma.sql`OR r.id = ${q} OR r.owner_subject_id = ${q}`
        : Prisma.empty;
    const match =
      q === null
        ? Prisma.empty
        : Prisma.sql`AND (o.display_name COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!'
            OR ls.legal_name COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!'
            OR a.display_name COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!'
            OR r.case_prefix_hint COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!'
            OR r.canonical_code COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!'
            ${exact})`;
    const ids = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT r.id FROM routes r
        JOIN owner_subjects os ON os.id = r.owner_subject_id
        JOIN owners o ON o.id = os.owner_id
        JOIN legal_subjects ls ON ls.id = os.legal_subject_id
        JOIN agencies a ON a.id = r.agency_id
        WHERE 1 = 1 ${agency} ${match} ${keysetAfter(page.after, 'r')}
        ORDER BY r.created_at DESC, r.id DESC ${pageLimit(page)}`,
    );
    const rows = await this.prisma.route.findMany({
      where: { id: { in: ids.map((row) => row.id) } },
    });
    return toPage(inIdOrder(ids, rows), page, this.cursors, toRouteView);
  }

  async get(id: string): Promise<RouteView> {
    const row = await this.prisma.route.findUnique({ where: { id } });
    if (!row) throw apiErrors.notFound();
    return toRouteView(row);
  }

  create(requester: WriteRequester, body: CreateRoute): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'createRoute', pathParams: {}, body, requester },
      async (context) => {
        const { tx } = context;
        const parties = await lockParties(tx, body.agencyId, body.ownerSubjectId, 'create');
        assertPartiesUsable(parties, 'createRoute');
        if (parties.linkState !== 'LINKED') {
          throw apiErrors.recordStateConflict({
            record: 'OwnerSubject',
            linkState: parties.linkState,
            operation: 'createRoute',
          });
        }
        const platform = body.platform ?? 'YOUTUBE';
        const existing = await tx.route.findUnique({
          where: {
            agencyId_ownerSubjectId_platform: {
              agencyId: body.agencyId,
              ownerSubjectId: body.ownerSubjectId,
              platform,
            },
          },
          select: { id: true },
        });
        if (existing) throw apiErrors.duplicateRoute(existing.id);
        if (body.defaultSignerId) {
          await assertDefaultSigner(tx, body.defaultSignerId, body.agencyId, 'createRoute');
        }
        if (body.preferredCoverageId) {
          // A coverage names an existing route, so none can belong to a route not yet created.
          await assertPreferredCoverage(tx, body.preferredCoverageId, {
            id: null,
            agencyId: body.agencyId,
          });
        }
        const id = randomUUID();
        const row = await tx.route
          .create({
            data: {
              ...writeData(body, ['agencyId', 'ownerSubjectId', ...PATCH_FIELDS], []),
              id,
              platform,
              createdAt: context.now,
              createdById: context.actorUserId,
              updatedAt: context.now,
              updatedById: context.actorUserId,
            } as Prisma.RouteUncheckedCreateInput,
          })
          .catch((error: unknown) => {
            if (isUniqueViolation(error)) throw apiErrors.duplicateRoute(null);
            throw error;
          });
        await context.audit({
          action: 'ROUTE_CREATED',
          entityType: ENTITY,
          entityId: id,
          after: {
            ...auditFields(row, presentFields(body)),
            platform: row.platform,
            linkState: row.linkState,
            rowVersion: row.rowVersion,
          },
        });
        return created(ENTITY, toRouteView(row));
      },
    );
  }

  patch(requester: WriteRequester, id: string, body: PatchRoute): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'patchRoute', pathParams: { id }, body, requester },
      async (context) => {
        const current = await this.lock(context, id);
        assertNotArchived(current, 'patch');
        const changed = changedFields(current, body);
        if (changed.includes('defaultSignerId') && body.defaultSignerId) {
          await assertDefaultSigner(
            context.tx,
            body.defaultSignerId,
            current.agencyId,
            'patchRoute',
          );
        }
        if (changed.includes('preferredCoverageId') && body.preferredCoverageId) {
          await assertPreferredCoverage(context.tx, body.preferredCoverageId, current);
        }
        if (changed.length === 0) return unchanged(ENTITY, toRouteView(current));
        const row = await context.tx.route.update({
          where: { id, rowVersion: current.rowVersion },
          data: {
            ...writeData(body, changed, []),
            rowVersion: { increment: 1 },
            updatedAt: context.now,
            updatedById: context.actorUserId,
          },
        });
        await context.audit({
          action: 'ROUTE_UPDATED',
          entityType: ENTITY,
          entityId: id,
          before: { ...auditFields(current, changed), rowVersion: current.rowVersion },
          after: { ...auditFields(row, changed), rowVersion: row.rowVersion },
        });
        return updated(ENTITY, toRouteView(row));
      },
    );
  }

  delete(requester: WriteRequester, id: string): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'deleteUnusedRoute', pathParams: { id }, body: null, requester },
      async (context) => {
        const current = await this.lock(context, id);
        const blockers: string[] = [];
        if (current.archivedAt !== null) blockers.push('ARCHIVED');
        if (hasCanonicalBinding(current)) blockers.push('CANONICAL_BINDING');
        blockers.push(...(await dependencyReasons(context.tx, ENTITY, id)));
        if (blockers.length > 0) throw apiErrors.referencedRecordCannotDelete(blockers);
        await context.tx.route.delete({ where: { id, rowVersion: current.rowVersion } });
        await context.audit({
          action: 'ROUTE_DELETED',
          entityType: ENTITY,
          entityId: id,
          before: {
            ...auditFields(current, ['agencyId', 'ownerSubjectId', 'platform', 'linkState']),
            rowVersion: current.rowVersion,
          },
        });
        return deleted(ENTITY, id);
      },
    );
  }

  archive(requester: WriteRequester, id: string, body: ArchiveRequest): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'archiveRoute', pathParams: { id }, body, requester },
      async (context) => {
        const current = await this.lock(context, id);
        if (current.archivedAt !== null) {
          throw apiErrors.recordStateConflict({ archived: true, operation: 'archive' });
        }
        return this.write(context, current, ARCHIVE_FIELDS, 'ROUTE_ARCHIVED', body.reason, {
          archivedAt: context.now,
          archiveReason: body.reason,
        });
      },
    );
  }

  /** Clears the archive flag; the link state is unchanged and no party is reactivated. */
  restore(requester: WriteRequester, id: string, body: ArchiveRequest): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'restoreRoute', pathParams: { id }, body, requester },
      async (context) => {
        const parties = await this.lockPartiesOf(context, id);
        const current = await this.lock(context, id);
        if (current.archivedAt === null) {
          throw apiErrors.recordStateConflict({ archived: false, operation: 'restore' });
        }
        assertPartiesUsable(parties, 'restoreRoute');
        return this.write(context, current, ARCHIVE_FIELDS, 'ROUTE_RESTORED', body.reason, {
          archivedAt: null,
          archiveReason: null,
        });
      },
    );
  }

  setLinkState(requester: WriteRequester, id: string, body: LinkStateRequest): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'setRouteLinkState', pathParams: { id }, body, requester },
      async (context) => {
        const parties = await this.lockPartiesOf(context, id);
        const current = await this.lock(context, id);
        assertNotArchived(current, 'link-state');
        if (current.linkState === body.state) {
          throw apiErrors.recordStateConflict({
            linkState: current.linkState,
            requested: body.state,
            operation: 'link-state',
          });
        }
        if (body.state === 'LINKED') {
          assertPartiesUsable(parties, 'link-state');
          if (parties.linkState !== 'LINKED') {
            throw apiErrors.recordStateConflict({
              record: 'OwnerSubject',
              linkState: parties.linkState,
              operation: 'link-state',
            });
          }
        }
        const unlinked = body.state === 'UNLINKED';
        return this.write(context, current, LINK_FIELDS, 'ROUTE_LINK_STATE_CHANGED', body.reason, {
          linkState: body.state,
          unlinkedAt: unlinked ? context.now : null,
          stateReason: body.reason,
        });
      },
    );
  }

  bindCanonical(
    requester: WriteRequester,
    id: string,
    body: CanonicalBindingRequest,
  ): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'bindCanonicalRoute', pathParams: { id }, body, requester },
      async (context) => {
        const current = await this.lock(context, id);
        // The association's parties are immutable columns: read, not locked.
        const link = await context.tx.ownerSubject.findUniqueOrThrow({
          where: { id: current.ownerSubjectId },
          select: { ownerId: true, legalSubjectId: true },
        });
        const row = await applyCanonicalBinding(context, {
          entity: ENTITY,
          operation: 'bindCanonicalRoute',
          current,
          archived: current.archivedAt !== null,
          body,
          scope: {
            kind: 'Route',
            agencyId: current.agencyId,
            ownerId: link.ownerId,
            legalSubjectId: link.legalSubjectId,
          },
          codeHolder: async (code) =>
            (
              await context.tx.route.findFirst({
                where: { canonicalCode: code },
                select: { id: true },
              })
            )?.id ?? null,
          update: (data) =>
            context.tx.route.update({ where: { id, rowVersion: current.rowVersion }, data }),
        });
        return updated(ENTITY, toRouteView(row));
      },
    );
  }

  /** Writes a lifecycle change with one version increment and one audit event. */
  private async write(
    context: WriteContext,
    current: Route,
    fields: readonly string[],
    action: string,
    reason: string,
    change: Partial<Pick<Route, 'archivedAt' | 'archiveReason' | 'linkState' | 'unlinkedAt'>> & {
      readonly stateReason?: string;
    },
  ) {
    const row = await context.tx.route.update({
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
    return updated(ENTITY, toRouteView(row));
  }

  /**
   * Share-locks the parties of an existing route before the route itself (lock order). The route's
   * agency and association never change, so reading them first without a lock is safe.
   */
  private async lockPartiesOf(context: WriteContext, id: string): Promise<Parties> {
    const route = await context.tx.route.findUnique({
      where: { id },
      select: { agencyId: true, ownerSubjectId: true },
    });
    if (!route) throw apiErrors.notFound();
    return lockParties(context.tx, route.agencyId, route.ownerSubjectId, 'existing');
  }

  /** Locks the Route row, loads it and checks If-Match (404 before 412). */
  private async lock(context: WriteContext, id: string): Promise<Route> {
    if (!(await lockForUpdate(context.tx, ENTITY, id))) throw apiErrors.notFound();
    const current = await context.tx.route.findUniqueOrThrow({ where: { id } });
    context.checkPrecondition({ entityType: ENTITY, id, rowVersion: current.rowVersion });
    return current;
  }
}

function assertNotArchived(current: Route, operation: string): void {
  if (current.archivedAt !== null) {
    throw apiErrors.recordStateConflict({ archived: true, operation });
  }
}

/**
 * Share-locks Agency → LegalSubject → Owner → OwnerSubject of a route and returns their states. For
 * a new route a missing agency or association is 422 REFERENCE_NOT_FOUND.
 */
async function lockParties(
  tx: Prisma.TransactionClient,
  agencyId: string,
  ownerSubjectId: string,
  purpose: 'create' | 'existing',
): Promise<Parties> {
  if (!(await lockForShare(tx, 'Agency', agencyId))) {
    if (purpose === 'create') throw apiErrors.referenceNotFound('agencyId');
    throw new Error('route agency missing');
  }
  const link = await tx.ownerSubject.findUnique({
    where: { id: ownerSubjectId },
    select: { ownerId: true, legalSubjectId: true },
  });
  if (!link) {
    if (purpose === 'create') throw apiErrors.referenceNotFound('ownerSubjectId');
    throw new Error('route association missing');
  }
  await lockForShare(tx, 'LegalSubject', link.legalSubjectId);
  await lockForShare(tx, 'Owner', link.ownerId);
  await lockForShare(tx, 'OwnerSubject', ownerSubjectId);
  // One connection per interactive transaction: the reads run one after another.
  const agency = await tx.agency.findUniqueOrThrow({
    where: { id: agencyId },
    select: { recordState: true },
  });
  const subject = await tx.legalSubject.findUniqueOrThrow({
    where: { id: link.legalSubjectId },
    select: { recordState: true },
  });
  const owner = await tx.owner.findUniqueOrThrow({
    where: { id: link.ownerId },
    select: { recordState: true },
  });
  const association = await tx.ownerSubject.findUniqueOrThrow({
    where: { id: ownerSubjectId },
    select: { linkState: true },
  });
  return {
    agencyArchived: agency.recordState === 'ARCHIVED',
    ownerId: link.ownerId,
    ownerArchived: owner.recordState === 'ARCHIVED',
    legalSubjectId: link.legalSubjectId,
    subjectArchived: subject.recordState === 'ARCHIVED',
    linkState: association.linkState,
  };
}

/** A route never activates an archived agency, owner or subject. */
function assertPartiesUsable(parties: Parties, operation: string): void {
  const archived = parties.agencyArchived
    ? 'Agency'
    : parties.subjectArchived
      ? 'LegalSubject'
      : parties.ownerArchived
        ? 'Owner'
        : null;
  if (archived !== null) {
    throw apiErrors.recordStateConflict({ record: archived, state: 'ARCHIVED', operation });
  }
}

/**
 * A preferred coverage is a coverage of this exact route (same agency) in a FROZEN version of an
 * unarchived Mandate. The coverage's mandate, version and coverage rows are share-locked after the
 * route (lock order), so a concurrent archive or draft edit cannot slip in; a frozen version never
 * changes afterwards. `route.id` is null for a route being created (no coverage can name it yet).
 */
async function assertPreferredCoverage(
  tx: Prisma.TransactionClient,
  coverageId: string,
  route: { readonly id: string | null; readonly agencyId: string },
): Promise<void> {
  const field = 'preferredCoverageId';
  const coverage = await tx.mandateCoverage.findUnique({
    where: { id: coverageId },
    select: {
      routeId: true,
      agencyId: true,
      mandateVersionId: true,
      version: { select: { mandateId: true } },
    },
  });
  if (!coverage) throw apiErrors.referenceNotFound(field);
  if (coverage.agencyId !== route.agencyId) throw apiErrors.crossAgencyReference(field, 'record');
  if (coverage.routeId !== route.id) throw apiErrors.authorityScopeUnresolved(field, 'OTHER_ROUTE');
  await lockForShare(tx, 'Mandate', coverage.version.mandateId);
  await lockForShare(tx, 'MandateVersion', coverage.mandateVersionId);
  await lockForShare(tx, 'MandateCoverage', coverageId);
  const version = await tx.mandateVersion.findUniqueOrThrow({
    where: { id: coverage.mandateVersionId },
    select: { versionState: true },
  });
  if (version.versionState !== 'FROZEN') {
    throw apiErrors.versionNotFrozen(field, coverage.mandateVersionId);
  }
  const mandate = await tx.mandate.findUniqueOrThrow({
    where: { id: coverage.version.mandateId },
    select: { archivedAt: true },
  });
  if (mandate.archivedAt !== null) {
    throw apiErrors.recordStateConflict({
      record: 'Mandate',
      archived: true,
      operation: 'preferredCoverage',
      field,
    });
  }
}

/** A default signer is a Signer of the route's agency that is neither archived nor ENDED. */
async function assertDefaultSigner(
  tx: Prisma.TransactionClient,
  signerId: string,
  agencyId: string,
  operation: string,
): Promise<void> {
  if (!(await lockForShare(tx, 'Signer', signerId))) {
    throw apiErrors.referenceNotFound('defaultSignerId');
  }
  const signer = await tx.signer.findUniqueOrThrow({
    where: { id: signerId },
    select: { agencyId: true, archivedAt: true, operationalState: true },
  });
  if (signer.agencyId !== agencyId)
    throw apiErrors.crossAgencyReference('defaultSignerId', 'record');
  if (signer.archivedAt !== null) {
    throw apiErrors.recordStateConflict({
      record: 'Signer',
      archived: true,
      operation,
      field: 'defaultSignerId',
    });
  }
  if (signer.operationalState === 'ENDED') {
    throw apiErrors.recordStateConflict({
      record: 'Signer',
      state: 'ENDED',
      operation,
      field: 'defaultSignerId',
    });
  }
}
