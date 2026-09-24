// CoverageSigner (P3B) — a Signer recorded under one coverage (DOMAIN_MODEL_v1 §9: "CoverageSigner
// binds a same-agency Signer to coverage and its recorded limits. Adding a row does not grant real
// authority."). It refers only to a Signer record: an application User is never a Signer, and the
// actor of the request is never used as one. A coverage signer does not satisfy G7, sign or adopt
// anything, make the person eligible for other routes or cases, or carry over to another coverage.
//
//   create  POST /coverages/{coverageId}/signers with the coverage's If-Match; the parent version is
//           DRAFT (409 FROZEN_VERSION), the Mandate and Agency unarchived. The Signer exists (422),
//           acts for the coverage's Agency (422 CROSS_AGENCY_REFERENCE; composite FK as backstop)
//           and is neither archived nor ENDED (409; the same administrative rule as a route's
//           default signer). One row per (coverage, signer, capacity) → 409 DUPLICATE_COVERAGE_SIGNER.
//           The source must apply to the coverage's route (agency, subject, owner material).
//           Nothing is inferred from the signer's agency, a route default, names or another coverage.
//   delete  only while the parent version is DRAFT (the contract's deleteDraftCoverageSigner); a row
//           named in a snapshot is kept (409 REFERENCED_RECORD_CANNOT_DELETE); the audit trail keeps
//           the removed association.
//   Both change the coverage's signer set: the coverage's and the parent version's row versions are
//   incremented (the coverage is the contract's precondition target of create; INVARIANTS §5).
// Lock order: Agency (share) → Signer (share) → Mandate (share) → MandateVersion (update) →
// MandateCoverage (update) → CoverageSigner (update) → SourceReference.
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { CoverageSigner as CoverageSignerView, CreateCoverageSigner } from '@tb/contracts';
import { Prisma, type MandateCoverage } from '../../../generated/prisma/client.js';
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
import { presentFields } from '../directory/changes.js';
import { created, deleted } from '../directory/outcomes.js';
import { dependencyReasons, lockForShare, lockForUpdate } from '../directory/records.js';
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
} from './authority-chain.js';
import {
  authorityAuditFields,
  authorityWriteData,
  dateRangeProblem,
  storabilityProblem,
} from './authority-rules.js';
import { toCoverageSignerView } from './authority-views.js';

const ENTITY = 'CoverageSigner';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Writable fields of CreateCoverageSigner (there is no PATCH: a change is remove + add). */
const FIELDS = [
  'signerId',
  'capacity',
  'actionScope',
  'sourceId',
  'effectiveOn',
  'endsOn',
  'limitations',
] as const;
const DATE_FIELDS = ['effectiveOn', 'endsOn'];

@Injectable()
export class CoverageSignersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly writes: WriteExecutor,
    private readonly cursors: CursorCodec,
  ) {}

  /**
   * Signers recorded under one coverage (404 for an unknown coverage). `q`: the exact row or signer
   * id, or a case- and accent-insensitive substring of the capacity.
   */
  async list(
    coverageId: string,
    query: QueryValues,
  ): Promise<{ items: CoverageSignerView[]; nextCursor: string | null }> {
    const coverage = await this.prisma.mandateCoverage.findUnique({
      where: { id: coverageId },
      select: { id: true },
    });
    if (!coverage) throw apiErrors.notFound();
    const q = searchText(query);
    const page = pageRequest(contractOperation('listCoverageSigners'), query, this.cursors, {
      coverageId,
      q,
    });
    const exact =
      q !== null && UUID.test(q) ? Prisma.sql`OR s.id = ${q} OR s.signer_id = ${q}` : Prisma.empty;
    const match =
      q === null
        ? Prisma.empty
        : Prisma.sql`AND (s.capacity COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!'
            ${exact})`;
    const ids = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT s.id FROM coverage_signers s WHERE s.coverage_id = ${coverageId}
        ${match} ${keysetAfter(page.after, 's')}
        ORDER BY s.created_at DESC, s.id DESC ${pageLimit(page)}`,
    );
    const rows = await this.prisma.coverageSigner.findMany({
      where: { id: { in: ids.map((row) => row.id) } },
    });
    return toPage(inIdOrder(ids, rows), page, this.cursors, toCoverageSignerView);
  }

  async get(id: string): Promise<CoverageSignerView> {
    const row = await this.prisma.coverageSigner.findUnique({ where: { id } });
    if (!row) throw apiErrors.notFound();
    return toCoverageSignerView(row);
  }

  /** Records one same-agency Signer under a coverage of a draft version (no authority granted). */
  create(
    requester: WriteRequester,
    coverageId: string,
    body: CreateCoverageSigner,
  ): Promise<WriteReply> {
    const problem =
      storabilityProblem(body, DATE_FIELDS) ??
      dateRangeProblem('effectiveOn', body.effectiveOn, 'endsOn', body.endsOn);
    if (problem) throw problem;
    return this.writes.execute(
      { operationId: 'createCoverageSigner', pathParams: { coverageId }, body, requester },
      async (context) => {
        const { tx } = context;
        const parents = await coverageParents(tx, coverageId);
        if (!parents) throw apiErrors.notFound();
        // A signer's agency never changes (not in PatchSigner): read it to lock in the lock order.
        const signer = await tx.signer.findUnique({
          where: { id: body.signerId },
          select: { agencyId: true },
        });
        for (const id of [
          ...new Set([parents.agencyId, signer?.agencyId ?? parents.agencyId]),
        ].sort()) {
          await lockForShare(tx, 'Agency', id);
        }
        if (signer) await lockForShare(tx, 'Signer', body.signerId);
        const mandate = await lockMandate(tx, parents.mandateId, 'share');
        const version = await lockVersion(tx, parents.mandateVersionId);
        const coverage = await lockCoverage(tx, coverageId);
        context.checkPrecondition({
          entityType: 'MandateCoverage',
          id: coverageId,
          rowVersion: coverage.rowVersion,
        });
        assertMandateUsable(mandate, 'createCoverageSigner');
        assertDraft(version, 'createCoverageSigner');
        await lockUnarchivedAgencies(
          tx,
          [{ id: coverage.agencyId, field: 'agencyId' }],
          'createCoverageSigner',
        );
        if (!signer) throw apiErrors.referenceNotFound('signerId');
        const person = await tx.signer.findUniqueOrThrow({
          where: { id: body.signerId },
          select: { agencyId: true, archivedAt: true, operationalState: true },
        });
        if (person.agencyId !== coverage.agencyId) {
          throw apiErrors.crossAgencyReference('signerId', 'record');
        }
        if (person.archivedAt !== null) {
          throw apiErrors.recordStateConflict({
            record: 'Signer',
            archived: true,
            operation: 'createCoverageSigner',
            field: 'signerId',
          });
        }
        if (person.operationalState === 'ENDED') {
          throw apiErrors.recordStateConflict({
            record: 'Signer',
            state: 'ENDED',
            operation: 'createCoverageSigner',
            field: 'signerId',
          });
        }
        const duplicate = await tx.coverageSigner.findFirst({
          where: { coverageId, signerId: body.signerId, capacity: body.capacity },
          select: { id: true },
        });
        if (duplicate) throw apiErrors.duplicateCoverageSigner(duplicate.id);
        if (body.sourceId) {
          const route = await routeContext(tx, coverage.routeId);
          if (!route) throw new Error('coverage route missing');
          await assertSourcesUsable(
            tx,
            [{ field: 'sourceId', sourceId: body.sourceId }],
            routeTarget(route),
          );
        }
        const id = randomUUID();
        const row = await tx.coverageSigner
          .create({
            data: {
              ...authorityWriteData(body, FIELDS),
              id,
              coverageId,
              agencyId: coverage.agencyId,
              createdAt: context.now,
              createdById: context.actorUserId,
              updatedAt: context.now,
              updatedById: context.actorUserId,
            } as Prisma.CoverageSignerUncheckedCreateInput,
          })
          .catch((error: unknown) => {
            if (isUniqueViolation(error)) throw apiErrors.duplicateCoverageSigner(null);
            throw error;
          });
        const versions = await this.touchParents(context, coverage, version);
        await context.audit({
          action: 'COVERAGE_SIGNER_CREATED',
          entityType: ENTITY,
          entityId: id,
          before: {
            coverageRowVersion: coverage.rowVersion,
            versionRowVersion: version.rowVersion,
          },
          after: {
            ...authorityAuditFields(row, presentFields(body)),
            coverageId,
            rowVersion: row.rowVersion,
            ...versions,
          },
          sourceIds: body.sourceId ? [body.sourceId] : [],
        });
        return created(ENTITY, toCoverageSignerView(row), [
          { type: 'MandateVersion', id: version.id, rowVersion: versions.versionRowVersion },
          { type: 'MandateCoverage', id: coverageId, rowVersion: versions.coverageRowVersion },
        ]);
      },
    );
  }

  /** Removes an association while its version is a draft; the audit trail keeps what it said. */
  delete(requester: WriteRequester, id: string): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'deleteDraftCoverageSigner', pathParams: { id }, body: null, requester },
      async (context) => {
        const { tx } = context;
        const association = await tx.coverageSigner.findUnique({
          where: { id },
          select: { coverageId: true },
        });
        if (!association) throw apiErrors.notFound();
        const parents = await coverageParents(tx, association.coverageId);
        if (!parents) throw new Error('coverage signer without coverage');
        const mandate = await lockMandate(tx, parents.mandateId, 'share');
        const version = await lockVersion(tx, parents.mandateVersionId);
        const coverage = await lockCoverage(tx, association.coverageId);
        if (!(await lockForUpdate(tx, ENTITY, id))) throw apiErrors.notFound();
        const current = await tx.coverageSigner.findUniqueOrThrow({ where: { id } });
        context.checkPrecondition({ entityType: ENTITY, id, rowVersion: current.rowVersion });
        assertMandateUsable(mandate, 'deleteDraftCoverageSigner');
        assertDraft(version, 'deleteDraftCoverageSigner');
        const blockers = await dependencyReasons(tx, ENTITY, id);
        if (blockers.length > 0) throw apiErrors.referencedRecordCannotDelete(blockers);
        await tx.coverageSigner.delete({ where: { id, rowVersion: current.rowVersion } });
        const versions = await this.touchParents(context, coverage, version);
        await context.audit({
          action: 'COVERAGE_SIGNER_DELETED',
          entityType: ENTITY,
          entityId: id,
          before: {
            ...authorityAuditFields(current, ['coverageId', ...FIELDS]),
            rowVersion: current.rowVersion,
            coverageRowVersion: coverage.rowVersion,
            versionRowVersion: version.rowVersion,
          },
          after: versions,
        });
        return deleted(ENTITY, id, [
          { type: 'MandateVersion', id: version.id, rowVersion: versions.versionRowVersion },
          { type: 'MandateCoverage', id: coverage.id, rowVersion: versions.coverageRowVersion },
        ]);
      },
    );
  }

  /** The coverage's signer set changed: its row version and its version's move on (once each). */
  private async touchParents(
    context: WriteContext,
    coverage: MandateCoverage,
    version: Parameters<typeof touchVersion>[1],
  ): Promise<{ coverageRowVersion: number; versionRowVersion: number }> {
    const row = await context.tx.mandateCoverage.update({
      where: { id: coverage.id, rowVersion: coverage.rowVersion },
      data: {
        rowVersion: { increment: 1 },
        updatedAt: context.now,
        updatedById: context.actorUserId,
      },
      select: { rowVersion: true },
    });
    const versionRowVersion = await touchVersion(context, version);
    return { coverageRowVersion: row.rowVersion, versionRowVersion };
  }
}
