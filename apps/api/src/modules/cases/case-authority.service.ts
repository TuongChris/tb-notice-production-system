// CaseAuthoritySelection (P4A) — "the authority chain selected/pinned for evaluation in this specific
// Case". A selection is NOT a G1 PASS, confirmed current authority, adjudicated legal validity,
// signer eligibility, G7 or notice readiness: actual G1 evaluation is a later readiness phase. It pins
// exact records; it decides nothing about them.
//
//   select  POST /cases/{caseId}/authority-selections with the case's If-Match. Append-only
//           (DATABASE_SCHEMA_v1: "Immutable explicit selection; a new default signer does not rewrite
//           this selection"): one CaseAuthoritySelection row plus one CaseAuthorityCoverage row per
//           chosen coverage, exactly as chosen; the case's currentAuthoritySelectionId moves to it
//           (rowVersion and contextRevision +1). Earlier selections and their coverage rows are never
//           changed, and nothing is selected implicitly — not from the route's preferred coverage,
//           another case, the latest version or a matching name.
//     case      unarchived (409), with a bound route; routeId must be that route (422
//               AUTHORITY_SCOPE_UNRESOLVED CASE_ROUTE_UNBOUND / NOT_CASE_ROUTE — INVARIANTS §3
//               "Current authority selection pointer belongs to the Case and the same current
//               Route"), and the route is still unarchived and LINKED with usable parties (409).
//     signer    exists (422), acts for the case's agency (422 CROSS_AGENCY_REFERENCE; composite FK as
//               backstop), neither archived nor ENDED (409). An application User is never a Signer.
//     coverage  each (1–20, each once — 422) exists (422), belongs to the case's agency (422
//               CROSS_AGENCY_REFERENCE) and names the case's route (422 AUTHORITY_SCOPE_UNRESOLVED
//               OTHER_ROUTE; composite FK as backstop), in a FROZEN version (409 VERSION_NOT_FROZEN;
//               INVARIANTS §4 "A selection may reference only FROZEN versions") of an unarchived
//               Mandate (409), with the signer recorded under it as a CoverageSigner (422
//               SIGNER_NOT_RECORDED: "The selected signer must match … relevant coverage-signer
//               record(s)"). Each coverage keeps its own applicationScope; there is no union.
//     basis     an optional basis source that exists and applies to the case (source-scope.ts).
//     not evaluated: currentness (dates, expiry, UNTIL_TERMINATED, the absence of an event, the
//     highest version), the ActionScope vocabulary against taskType (no mapping is defined) and any
//     G1–G7 or readiness question. taskType and intendedFromEmail are stored as supplied.
//   list    the history of one case, newest first; every selection stays readable.
// Lock order: Agency (share) → LegalSubject → Owner → OwnerSubject → Route (share) → Signer (share) →
// Mandate (share) → MandateVersion (share) → MandateCoverage (share) → CaseRecord (update) →
// CaseAuthoritySelection (insert) → SourceReference.
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  CaseAuthoritySelection as CaseAuthoritySelectionView,
  SelectAuthority,
} from '@tb/contracts';
import { codePointLength } from '@tb/contracts';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { apiErrors, type ValidationIssue } from '../../infrastructure/http/api-error.js';
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
  type WriteReply,
  type WriteRequester,
} from '../../infrastructure/write/write-executor.js';
import { auditValue } from '../directory/changes.js';
import { created } from '../directory/outcomes.js';
import { lockForShare } from '../directory/records.js';
import { routeContext } from '../representation/authority-chain.js';
import { assertSourcesUsable } from '../sources/source-scope.js';
import {
  assertCaseWritable,
  assertRouteUsableForCase,
  CASE_ENTITY,
  caseTargetWith,
  lockCase,
  lockParties,
} from './case-rules.js';
import { toSelectionView } from './case-views.js';

const ENTITY = 'CaseAuthoritySelection';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TASK_TYPES = new Set(['INITIAL', 'NMI_REPLY']);

/** Request-only check: each coverage is chosen once (the unique key is the backstop). */
export function duplicateCoverageProblem(body: SelectAuthority) {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  body.coverages.forEach((coverage, index) => {
    if (seen.has(coverage.coverageId)) {
      issues.push({
        path: `coverages.${index}.coverageId`,
        message: 'Each coverage can be selected only once',
      });
    }
    seen.add(coverage.coverageId);
  });
  return issues.length === 0 ? null : apiErrors.bodyValidationFailed(issues);
}

@Injectable()
export class CaseAuthorityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly writes: WriteExecutor,
    private readonly cursors: CursorCodec,
  ) {}

  /**
   * The selections of one case (404 for an unknown case), newest first. `q`: an exact selection,
   * route, signer or basis-source id, an exact task type, or a case- and accent-insensitive
   * substring of the selection note or intended sender address.
   */
  async list(
    caseId: string,
    query: QueryValues,
  ): Promise<{ items: CaseAuthoritySelectionView[]; nextCursor: string | null }> {
    const owner = await this.prisma.caseRecord.findUnique({
      where: { id: caseId },
      select: { id: true },
    });
    if (!owner) throw apiErrors.notFound();
    const q = searchText(query);
    const page = pageRequest(
      contractOperation('listCaseAuthoritySelections'),
      query,
      this.cursors,
      {
        caseId,
        q,
      },
    );
    const exact =
      q === null
        ? Prisma.empty
        : UUID.test(q)
          ? Prisma.sql`OR a.id = ${q} OR a.route_id = ${q} OR a.signer_id = ${q}
              OR a.basis_source_id = ${q}`
          : TASK_TYPES.has(q)
            ? Prisma.sql`OR a.task_type = ${q}`
            : Prisma.empty;
    const match =
      q === null
        ? Prisma.empty
        : Prisma.sql`AND (a.selection_note COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!'
            OR a.intended_from_email COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!'
            ${exact})`;
    const ids = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT a.id FROM case_authority_selections a WHERE a.case_id = ${caseId} ${match}
        ${keysetAfter(page.after, 'a')}
        ORDER BY a.created_at DESC, a.id DESC ${pageLimit(page)}`,
    );
    const rows = await this.prisma.caseAuthoritySelection.findMany({
      where: { id: { in: ids.map((row) => row.id) } },
    });
    return toPage(inIdOrder(ids, rows), page, this.cursors, toSelectionView);
  }

  /** Appends one explicit selection that pins exactly the chosen records for this case. */
  select(requester: WriteRequester, caseId: string, body: SelectAuthority): Promise<WriteReply> {
    const problem = duplicateCoverageProblem(body);
    if (problem) throw problem;
    return this.writes.execute(
      { operationId: 'selectCaseAuthority', pathParams: { caseId }, body, requester },
      async (context) => {
        const { tx } = context;
        const operation = 'selectCaseAuthority';
        // Immutable columns — a case's agency, a route's agency and association, a signer's agency,
        // a coverage's route, agency, version and mandate — are read first to lock in the lock order.
        const parent = await tx.caseRecord.findUnique({
          where: { id: caseId },
          select: { agencyId: true },
        });
        if (!parent) throw apiErrors.notFound();
        const route = await routeContext(tx, body.routeId);
        const signer = await tx.signer.findUnique({
          where: { id: body.signerId },
          select: { agencyId: true },
        });
        const coverageIds = body.coverages.map((coverage) => coverage.coverageId);
        const coverages = await tx.mandateCoverage.findMany({
          where: { id: { in: coverageIds } },
          select: {
            id: true,
            routeId: true,
            agencyId: true,
            mandateVersionId: true,
            version: { select: { mandateId: true } },
          },
        });
        await lockParties(tx, {
          agencyIds: [
            parent.agencyId,
            signer?.agencyId,
            ...coverages.map((coverage) => coverage.agencyId),
          ],
          ownerIds: [],
          route,
        });
        if (signer) await lockForShare(tx, 'Signer', body.signerId);
        const sorted = (ids: readonly string[]) => [...new Set(ids)].sort();
        for (const id of sorted(coverages.map((coverage) => coverage.version.mandateId))) {
          await lockForShare(tx, 'Mandate', id);
        }
        for (const id of sorted(coverages.map((coverage) => coverage.mandateVersionId))) {
          await lockForShare(tx, 'MandateVersion', id);
        }
        for (const id of sorted(coverages.map((coverage) => coverage.id))) {
          await lockForShare(tx, 'MandateCoverage', id);
        }
        const current = await lockCase(tx, caseId);
        context.checkPrecondition({
          entityType: CASE_ENTITY,
          id: caseId,
          rowVersion: current.rowVersion,
        });
        assertCaseWritable(current, operation);

        // The case's own route, as bound now.
        if (current.routeId === null) {
          throw apiErrors.authorityScopeUnresolved('routeId', 'CASE_ROUTE_UNBOUND');
        }
        if (current.routeId !== body.routeId || route === null) {
          throw apiErrors.authorityScopeUnresolved('routeId', 'NOT_CASE_ROUTE');
        }
        await assertRouteUsableForCase(tx, route, current.agencyId, operation);

        // The signer: a Signer record of the case's agency (never the application User).
        if (!signer) throw apiErrors.referenceNotFound('signerId');
        if (signer.agencyId !== current.agencyId) {
          throw apiErrors.crossAgencyReference('signerId', 'record');
        }
        const signerRow = await tx.signer.findUniqueOrThrow({
          where: { id: body.signerId },
          select: { archivedAt: true, operationalState: true },
        });
        if (signerRow.archivedAt !== null) {
          throw apiErrors.recordStateConflict({
            record: 'Signer',
            archived: true,
            operation,
            field: 'signerId',
          });
        }
        if (signerRow.operationalState === 'ENDED') {
          throw apiErrors.recordStateConflict({
            record: 'Signer',
            state: 'ENDED',
            operation,
            field: 'signerId',
          });
        }

        // Each chosen coverage, in request order: the exact chain Case → Route → Agency →
        // Mandate → frozen MandateVersion → MandateCoverage, with the signer recorded under it.
        const byId = new Map(coverages.map((coverage) => [coverage.id, coverage]));
        for (const [index, chosen] of body.coverages.entries()) {
          const field = `coverages.${index}.coverageId`;
          const coverage = byId.get(chosen.coverageId);
          if (!coverage) throw apiErrors.referenceNotFound(field);
          if (coverage.agencyId !== current.agencyId) {
            throw apiErrors.crossAgencyReference(field, 'record');
          }
          if (coverage.routeId !== current.routeId) {
            throw apiErrors.authorityScopeUnresolved(field, 'OTHER_ROUTE');
          }
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
              operation,
              field,
            });
          }
          const recorded = await tx.coverageSigner.findFirst({
            where: { coverageId: coverage.id, signerId: body.signerId },
            select: { id: true },
          });
          if (!recorded) throw apiErrors.authorityScopeUnresolved(field, 'SIGNER_NOT_RECORDED');
        }

        const basisSourceId = body.basisSourceId ?? null;
        if (basisSourceId !== null) {
          await assertSourcesUsable(
            tx,
            [{ field: 'basisSourceId', sourceId: basisSourceId }],
            caseTargetWith(current, route),
          );
        }

        const id = randomUUID();
        const selection = await tx.caseAuthoritySelection.create({
          data: {
            id,
            caseId,
            agencyId: current.agencyId,
            routeId: current.routeId,
            signerId: body.signerId,
            taskType: body.taskType,
            intendedFromEmail: body.intendedFromEmail,
            basisSourceId,
            selectionNote: body.selectionNote,
            createdAt: context.now,
            createdById: context.actorUserId,
          },
        });
        const pinned: Array<{ id: string; coverageId: string; applicationScope: string }> = [];
        for (const chosen of body.coverages) {
          const pinnedId = randomUUID();
          await tx.caseAuthorityCoverage.create({
            data: {
              id: pinnedId,
              selectionId: id,
              caseId,
              agencyId: current.agencyId,
              routeId: current.routeId,
              coverageId: chosen.coverageId,
              applicationScope: chosen.applicationScope,
              createdAt: context.now,
              createdById: context.actorUserId,
            },
          });
          pinned.push({ id: pinnedId, ...chosen });
        }
        const caseRow = await tx.caseRecord.update({
          where: { id: caseId, rowVersion: current.rowVersion },
          data: {
            currentAuthoritySelectionId: id,
            rowVersion: { increment: 1 },
            contextRevision: { increment: 1 },
            updatedAt: context.now,
            updatedById: context.actorUserId,
          },
        });
        await context.audit({
          action: 'CASE_AUTHORITY_SELECTED',
          entityType: ENTITY,
          entityId: id,
          before: {
            previousSelectionId: current.currentAuthoritySelectionId,
            caseRowVersion: current.rowVersion,
            caseContextRevision: current.contextRevision,
          },
          after: {
            caseId,
            routeId: selection.routeId,
            signerId: selection.signerId,
            taskType: selection.taskType,
            intendedFromEmail: selection.intendedFromEmail,
            basisSourceId: selection.basisSourceId,
            selectionNote: auditValue('selectionNote', selection.selectionNote),
            coverages: pinned.map((row) => ({
              caseAuthorityCoverageId: row.id,
              coverageId: row.coverageId,
              applicationScope: {
                redacted: true,
                codePoints: codePointLength(row.applicationScope),
              },
            })),
            caseRowVersion: caseRow.rowVersion,
            caseContextRevision: caseRow.contextRevision,
          },
          sourceIds: basisSourceId === null ? [] : [basisSourceId],
        });
        return created(ENTITY, toSelectionView(selection), [
          { type: CASE_ENTITY, id: caseId, rowVersion: caseRow.rowVersion },
          ...pinned.map((row) => ({
            type: 'CaseAuthorityCoverage',
            id: row.id,
            rowVersion: null,
          })),
        ]);
      },
    );
  }
}
