// MandateVersion (P3B) — a versioned documentary/terms snapshot of one Mandate (DOMAIN_MODEL_v1 §9).
// VersionState is DRAFT | FROZEN. A version is pinned to the exact SourceReference revisions it
// cites and never follows a newer revision; adopting a newer source needs an edit of a draft or a
// new version. Completeness does not make a draft "adopted", and FROZEN means only that the system
// record is immutable — not a signature, legal approval, owner confirmation, G1 decision or current
// authority. Nothing here computes or implies currentness: not from a frozen state, a start date, a
// missing end date, the highest version number, the Mandate or the latest source.
//
//   create    POST /mandates/{mandateId}/versions with the Mandate's If-Match (its version set
//             changes: Mandate rowVersion +1). The Mandate and its Agency are unarchived. The number
//             is the Mandate's highest + 1 (allocated under the Mandate lock; unique key as
//             backstop). predecessorId is optional; when given it must be a FROZEN version of the
//             same Mandate that has no successor yet — a chain does not fork, a draft is edited
//             rather than succeeded, and no cycle can form (a new version only points at an older
//             one and the pointer never changes). No coverage, signer or event is copied or created.
//   patch     DRAFT only (409 FROZEN_VERSION), contracted fields only (changeKind and predecessorId
//             are fixed at creation); a no-op PATCH writes nothing.
//   freeze    DRAFT → FROZEN with a reason, If-Match of the version. Under the locks it re-validates
//             exactly the structural invariants (INVARIANTS §4: "validate its primary/source metadata
//             and every coverage/signer link structurally"): Mandate and Agency unarchived, the chain,
//             dates, document/review claims, every cited source's existence and applicability, each
//             coverage's dates, basis source and predecessor, each coverage signer's dates and
//             source. The administrative state of routes and signers (archived, ENDED) was checked
//             when each association was recorded and is not re-evaluated as a legal status. The
//             version row changes once (rowVersion +1, frozenAt); its children have no state column
//             and are frozen through it. No authority event is created.
// Lock order: Agency (share) → Mandate (update for create, share otherwise) → MandateVersion
// (update) → SourceReference.
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  ArchiveRequest,
  CreateMandateVersion,
  MandateVersion as MandateVersionView,
  PatchMandateVersion,
} from '@tb/contracts';
import { Prisma, type MandateVersion } from '../../../generated/prisma/client.js';
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
import { storabilityProblem } from '../../infrastructure/write/storability.js';
import {
  WriteExecutor,
  type WriteContext,
  type WriteReply,
  type WriteRequester,
} from '../../infrastructure/write/write-executor.js';
import { changedFields, presentFields } from '../directory/changes.js';
import { created, unchanged, updated } from '../directory/outcomes.js';
import { lockForShare } from '../directory/records.js';
import {
  assertSourcesUsable,
  lockSourcesForUpdate,
  sourceIdsOf,
  type SourceUse,
} from '../sources/source-scope.js';
import {
  assertDraft,
  assertMandateUsable,
  lockMandate,
  lockUnarchivedAgencies,
  lockVersion,
  routeContext,
  routeTarget,
  versionParents,
} from './authority-chain.js';
import {
  authorityAuditFields,
  authorityWriteData,
  dateRangeProblem,
  versionReviewProblem,
  versionSourceUses,
  versionTermsProblem,
  type VersionTerms,
} from './authority-rules.js';
import { dateOnly, toMandateVersionView } from './authority-views.js';

const ENTITY = 'MandateVersion';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Writable terms of a version (PatchMandateVersion; create adds changeKind and predecessorId). */
const TERM_FIELDS = [
  'primarySourceId',
  'additionalSourceRefs',
  'documentState',
  'sourceReviewState',
  'signedDatesRaw',
  'validityModel',
  'effectiveOn',
  'expiresOn',
  'validityNotes',
  'changeReason',
] as const;
const DATE_FIELDS = ['effectiveOn', 'expiresOn'];

/** The documentary state a create request describes (schema defaults for omitted states). */
function createdTerms(body: CreateMandateVersion): VersionTerms {
  return {
    primarySourceId: body.primarySourceId ?? null,
    additionalSourceRefs: body.additionalSourceRefs ?? null,
    signedDatesRaw: body.signedDatesRaw ?? null,
    documentState: body.documentState ?? 'UNKNOWN',
    sourceReviewState: body.sourceReviewState ?? 'UNREVIEWED',
    effectiveOn: body.effectiveOn ?? null,
    expiresOn: body.expiresOn ?? null,
  };
}

/** The documentary state of a stored version, with a PATCH applied (omitted fields kept). */
function mergedTerms(current: MandateVersionView, patch: PatchMandateVersion = {}): VersionTerms {
  const pick = <K extends keyof VersionTerms>(field: K): VersionTerms[K] =>
    (patch[field] === undefined ? current[field] : patch[field]) as VersionTerms[K];
  return {
    primarySourceId: pick('primarySourceId'),
    additionalSourceRefs: pick('additionalSourceRefs'),
    signedDatesRaw: pick('signedDatesRaw'),
    documentState: pick('documentState'),
    sourceReviewState: pick('sourceReviewState'),
    effectiveOn: pick('effectiveOn'),
    expiresOn: pick('expiresOn'),
  };
}

@Injectable()
export class MandateVersionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly writes: WriteExecutor,
    private readonly cursors: CursorCodec,
  ) {}

  /**
   * Versions of one Mandate (404 for an unknown Mandate). `q`: an exact version number, an exact
   * version id or predecessor id, or a case- and accent-insensitive substring of the change reason.
   */
  async list(
    mandateId: string,
    query: QueryValues,
  ): Promise<{ items: MandateVersionView[]; nextCursor: string | null }> {
    const mandate = await this.prisma.mandate.findUnique({
      where: { id: mandateId },
      select: { id: true },
    });
    if (!mandate) throw apiErrors.notFound();
    const q = searchText(query);
    const page = pageRequest(contractOperation('listMandateVersions'), query, this.cursors, {
      mandateId,
      q,
    });
    const exact =
      q === null
        ? Prisma.empty
        : /^[1-9][0-9]{0,9}$/.test(q)
          ? Prisma.sql`OR v.version = ${Number(q)}`
          : UUID.test(q)
            ? Prisma.sql`OR v.id = ${q} OR v.predecessor_id = ${q}`
            : Prisma.empty;
    const match =
      q === null
        ? Prisma.empty
        : Prisma.sql`AND (v.change_reason COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!'
            ${exact})`;
    const ids = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT v.id FROM mandate_versions v WHERE v.mandate_id = ${mandateId} ${match}
        ${keysetAfter(page.after, 'v')}
        ORDER BY v.created_at DESC, v.id DESC ${pageLimit(page)}`,
    );
    const rows = await this.prisma.mandateVersion.findMany({
      where: { id: { in: ids.map((row) => row.id) } },
    });
    return toPage(inIdOrder(ids, rows), page, this.cursors, toMandateVersionView);
  }

  async get(id: string): Promise<MandateVersionView> {
    const row = await this.prisma.mandateVersion.findUnique({ where: { id } });
    if (!row) throw apiErrors.notFound();
    return toMandateVersionView(row);
  }

  /** A new DRAFT version with exactly the supplied terms; nothing is inferred or copied. */
  create(
    requester: WriteRequester,
    mandateId: string,
    body: CreateMandateVersion,
  ): Promise<WriteReply> {
    const terms = createdTerms(body);
    const problem = storabilityProblem(body, DATE_FIELDS) ?? versionTermsProblem(terms);
    if (problem) throw problem;
    return this.writes.execute(
      { operationId: 'createMandateVersion', pathParams: { mandateId }, body, requester },
      async (context) => {
        const { tx } = context;
        const parent = await tx.mandate.findUnique({
          where: { id: mandateId },
          select: { agencyId: true },
        });
        if (!parent) throw apiErrors.notFound();
        await lockForShare(tx, 'Agency', parent.agencyId);
        const mandate = await lockMandate(tx, mandateId, 'update');
        context.checkPrecondition({
          entityType: 'Mandate',
          id: mandateId,
          rowVersion: mandate.rowVersion,
        });
        assertMandateUsable(mandate, 'createMandateVersion');
        await lockUnarchivedAgencies(
          tx,
          [{ id: mandate.agencyId, field: 'agencyId' }],
          'createMandateVersion',
        );
        if (body.predecessorId) await this.assertPredecessor(tx, mandateId, body.predecessorId);
        const uses = versionSourceUses(terms);
        await this.assertTermsSources(tx, mandate.agencyId, terms, uses);
        const highest = await tx.mandateVersion.aggregate({
          where: { mandateId },
          _max: { version: true },
        });
        const id = randomUUID();
        const row = await tx.mandateVersion.create({
          data: {
            ...authorityWriteData(body, TERM_FIELDS),
            id,
            mandateId,
            agencyId: mandate.agencyId,
            version: (highest._max.version ?? 0) + 1,
            versionState: 'DRAFT',
            changeKind: body.changeKind,
            predecessorId: body.predecessorId ?? null,
            createdAt: context.now,
            createdById: context.actorUserId,
            updatedAt: context.now,
            updatedById: context.actorUserId,
          } as Prisma.MandateVersionUncheckedCreateInput,
        });
        const parentRow = await tx.mandate.update({
          where: { id: mandateId, rowVersion: mandate.rowVersion },
          data: {
            rowVersion: { increment: 1 },
            updatedAt: context.now,
            updatedById: context.actorUserId,
          },
          select: { rowVersion: true },
        });
        await context.audit({
          action: 'MANDATE_VERSION_CREATED',
          entityType: ENTITY,
          entityId: id,
          before: { mandateRowVersion: mandate.rowVersion },
          after: {
            ...authorityAuditFields(row, presentFields(body)),
            mandateId,
            version: row.version,
            versionState: row.versionState,
            rowVersion: row.rowVersion,
            mandateRowVersion: parentRow.rowVersion,
          },
          sourceIds: sourceIdsOf(uses),
        });
        return created(ENTITY, toMandateVersionView(row), [
          { type: 'Mandate', id: mandateId, rowVersion: parentRow.rowVersion },
        ]);
      },
    );
  }

  /** Edits a DRAFT version's terms; a frozen version never changes (409 FROZEN_VERSION). */
  patch(requester: WriteRequester, id: string, body: PatchMandateVersion): Promise<WriteReply> {
    const problem = storabilityProblem(body, DATE_FIELDS);
    if (problem) throw problem;
    return this.writes.execute(
      { operationId: 'patchDraftMandateVersion', pathParams: { id }, body, requester },
      async (context) => {
        const { tx } = context;
        const parents = await versionParents(tx, id);
        if (!parents) throw apiErrors.notFound();
        const mandate = await lockMandate(tx, parents.mandateId, 'share');
        const current = await this.lockChecked(context, id);
        assertMandateUsable(mandate, 'patchDraftMandateVersion');
        assertDraft(current, 'patchDraftMandateVersion');
        const view = toMandateVersionView(current);
        const changed = changedFields(view, body);
        if (changed.length === 0) return unchanged(ENTITY, view);
        const terms = mergedTerms(view, body);
        const termsProblem = versionTermsProblem(terms);
        if (termsProblem) throw termsProblem;
        const uses = versionSourceUses(terms);
        await this.assertTermsSources(tx, current.agencyId, terms, uses);
        const row = await tx.mandateVersion.update({
          where: { id, rowVersion: current.rowVersion },
          data: {
            ...authorityWriteData(body, changed),
            rowVersion: { increment: 1 },
            updatedAt: context.now,
            updatedById: context.actorUserId,
          },
        });
        await context.audit({
          action: 'MANDATE_VERSION_UPDATED',
          entityType: ENTITY,
          entityId: id,
          before: { ...authorityAuditFields(current, changed), rowVersion: current.rowVersion },
          after: { ...authorityAuditFields(row, changed), rowVersion: row.rowVersion },
          sourceIds: sourceIdsOf(uses),
        });
        return updated(ENTITY, toMandateVersionView(row));
      },
    );
  }

  /**
   * DRAFT → FROZEN after the structural re-validation described above. Freezing makes the system
   * record immutable; it is not a signature, legal approval, G1 decision or notice adoption.
   */
  freeze(requester: WriteRequester, id: string, body: ArchiveRequest): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'freezeMandateVersion', pathParams: { id }, body, requester },
      async (context) => {
        const { tx } = context;
        const parents = await versionParents(tx, id);
        if (!parents) throw apiErrors.notFound();
        await lockForShare(tx, 'Agency', parents.agencyId);
        const mandate = await lockMandate(tx, parents.mandateId, 'share');
        const current = await this.lockChecked(context, id);
        assertMandateUsable(mandate, 'freezeMandateVersion');
        assertDraft(current, 'freezeMandateVersion');
        await lockUnarchivedAgencies(
          tx,
          [{ id: current.agencyId, field: 'agencyId' }],
          'freezeMandateVersion',
        );
        if (current.predecessorId !== null) {
          await this.assertPredecessor(tx, current.mandateId, current.predecessorId, current.id);
        }
        const terms = mergedTerms(toMandateVersionView(current));
        const termsProblem = versionTermsProblem(terms);
        if (termsProblem) throw termsProblem;
        const coverages = await tx.mandateCoverage.findMany({
          where: { mandateVersionId: id },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });
        const signers = await tx.coverageSigner.findMany({
          where: { coverageId: { in: coverages.map((coverage) => coverage.id) } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });
        const versionUses = versionSourceUses(terms);
        const cited = [
          ...versionUses.map((use) => use.sourceId),
          ...coverages.flatMap((coverage) =>
            coverage.basisSourceId === null ? [] : [coverage.basisSourceId],
          ),
          ...signers.flatMap((signer) => (signer.sourceId === null ? [] : [signer.sourceId])),
        ];
        await lockSourcesForUpdate(tx, cited);
        await this.assertTermsSources(tx, current.agencyId, terms, versionUses);
        for (const coverage of coverages) {
          const dates = dateRangeProblem(
            'effectiveOn',
            dateOnly(coverage.effectiveOn),
            'expiresOn',
            dateOnly(coverage.expiresOn),
            { coverageId: coverage.id },
          );
          if (dates) throw dates;
          const route = await routeContext(tx, coverage.routeId);
          if (!route) throw new Error('coverage route missing');
          if (coverage.basisSourceId !== null) {
            await assertSourcesUsable(
              tx,
              [
                {
                  field: `coverages.${coverage.id}.basisSourceId`,
                  sourceId: coverage.basisSourceId,
                },
              ],
              routeTarget(route),
            );
          }
          if (coverage.predecessorCoverageId !== null) {
            const predecessor = await tx.mandateCoverage.findUniqueOrThrow({
              where: { id: coverage.predecessorCoverageId },
              select: {
                routeId: true,
                version: { select: { mandateId: true, versionState: true } },
              },
            });
            if (
              predecessor.routeId !== coverage.routeId ||
              predecessor.version.mandateId !== current.mandateId ||
              predecessor.version.versionState !== 'FROZEN'
            ) {
              throw apiErrors.authorityScopeUnresolved(
                `coverages.${coverage.id}.predecessorCoverageId`,
                'PREDECESSOR_COVERAGE_INVALID',
              );
            }
          }
          for (const signer of signers.filter((item) => item.coverageId === coverage.id)) {
            const signerDates = dateRangeProblem(
              'effectiveOn',
              dateOnly(signer.effectiveOn),
              'endsOn',
              dateOnly(signer.endsOn),
              { coverageSignerId: signer.id },
            );
            if (signerDates) throw signerDates;
            if (signer.sourceId !== null) {
              await assertSourcesUsable(
                tx,
                [{ field: `coverageSigners.${signer.id}.sourceId`, sourceId: signer.sourceId }],
                routeTarget(route),
              );
            }
          }
        }
        const row = await tx.mandateVersion.update({
          where: { id, rowVersion: current.rowVersion },
          data: {
            versionState: 'FROZEN',
            frozenAt: context.now,
            rowVersion: { increment: 1 },
            updatedAt: context.now,
            updatedById: context.actorUserId,
          },
        });
        await context.audit({
          action: 'MANDATE_VERSION_FROZEN',
          entityType: ENTITY,
          entityId: id,
          before: { versionState: current.versionState, rowVersion: current.rowVersion },
          after: {
            versionState: row.versionState,
            frozenAt: context.now.toISOString(),
            rowVersion: row.rowVersion,
            coverages: coverages.length,
            coverageSigners: signers.length,
          },
          reason: body.reason,
          sourceIds: [...new Set(cited)],
        });
        return updated(ENTITY, toMandateVersionView(row));
      },
    );
  }

  /**
   * A predecessor is a FROZEN version of the same Mandate whose only successor is `successorId`
   * (none yet when creating): chains do not fork and a draft is edited rather than succeeded.
   */
  private async assertPredecessor(
    tx: Prisma.TransactionClient,
    mandateId: string,
    predecessorId: string,
    successorId: string | null = null,
  ): Promise<void> {
    const predecessor = await tx.mandateVersion.findUnique({
      where: { id: predecessorId },
      select: { id: true, mandateId: true, versionState: true },
    });
    if (!predecessor) throw apiErrors.referenceNotFound('predecessorId');
    if (predecessor.mandateId !== mandateId) {
      throw apiErrors.authorityScopeUnresolved('predecessorId', 'OTHER_MANDATE');
    }
    if (predecessor.versionState !== 'FROZEN') {
      throw apiErrors.versionNotFrozen('predecessorId', predecessor.id);
    }
    const successor = await tx.mandateVersion.findFirst({
      where: {
        predecessorId,
        ...(successorId === null ? {} : { id: { not: successorId } }),
      },
      select: { id: true },
    });
    if (successor) throw apiErrors.versionSuccessorExists('predecessorId', successor.id);
  }

  /**
   * Every source the terms cite exists and applies to the Mandate's agency (source-scope.ts), and a
   * review claim is supported by a cited source that records an attributed review.
   */
  private async assertTermsSources(
    tx: Prisma.TransactionClient,
    agencyId: string,
    terms: VersionTerms,
    uses: readonly SourceUse[],
  ): Promise<void> {
    await assertSourcesUsable(tx, uses, { kind: 'Agency', agencyId });
    const reviewed = await tx.sourceReference.findMany({
      where: { id: { in: sourceIdsOf(uses) }, reportedProvenance: 'DOCUMENT_REVIEWED' },
      select: { id: true },
    });
    const problem = versionReviewProblem(terms, new Set(reviewed.map((source) => source.id)));
    if (problem) throw problem;
  }

  /** Locks the version (its Mandate is already locked), loads it and checks If-Match. */
  private async lockChecked(context: WriteContext, id: string): Promise<MandateVersion> {
    const current = await lockVersion(context.tx, id);
    context.checkPrecondition({ entityType: ENTITY, id, rowVersion: current.rowVersion });
    return current;
  }
}
