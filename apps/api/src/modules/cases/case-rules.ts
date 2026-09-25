// Rules shared by the case services (P4A): locking a case and the parties it names in the lock order
// of records.ts (identities → authority aggregate → CaseRecord → case children → SourceReference),
// the read-only rule of an archived case, the case's source-scope target, the route a case may be
// bound to or select authority under, and what makes a case history-bearing.
//
// A Case is the boundary of every case-specific record. Nothing here infers a party, a route, a
// source or authority from names, owners, agencies or another case: every relation is an explicit
// id checked against the exact records it names.
import type { CaseRecord, Prisma } from '../../../generated/prisma/client.js';
import { ApiError, apiErrors } from '../../infrastructure/http/api-error.js';
import type { WriteContext } from '../../infrastructure/write/write-executor.js';
import { lockForShare, lockForUpdate } from '../directory/records.js';
import { routeContext, type RouteContext } from '../representation/authority-chain.js';
import { assertSourcesUsable, type SourceTarget } from '../sources/source-scope.js';

export const CASE_ENTITY = 'CaseRecord';

/** The contract WorkflowState vocabulary: operational activity only, never a legal conclusion. */
export const WORKFLOW_STATES = [
  'INTAKE',
  'PREPARING',
  'DRAFTING',
  'AWAITING_HUMAN',
  'AWAITING_PLATFORM',
  'CLOSED',
] as const;

/** Locks the CaseRecord FOR UPDATE and loads it; 404 when it does not exist. */
export async function lockCase(tx: Prisma.TransactionClient, caseId: string): Promise<CaseRecord> {
  if (!(await lockForUpdate(tx, 'CaseRecord', caseId))) throw apiErrors.notFound();
  return tx.caseRecord.findUniqueOrThrow({ where: { id: caseId } });
}

/** 409: an archived case and everything under it are read-only except restore. */
export function assertCaseWritable(row: CaseRecord, operation: string): void {
  if (row.archivedAt !== null) {
    throw apiErrors.recordStateConflict({ record: 'CaseRecord', archived: true, operation });
  }
}

/**
 * Increments the case's row version — and its context revision when the change is material to the
 * case context (INVARIANTS §5: "For material case context changes, increment
 * CaseRecord.contextRevision in the same transaction") — and returns the updated row.
 */
export async function touchCase(
  context: WriteContext,
  row: CaseRecord,
  material: boolean,
): Promise<CaseRecord> {
  return context.tx.caseRecord.update({
    where: { id: row.id, rowVersion: row.rowVersion },
    data: {
      rowVersion: { increment: 1 },
      ...(material ? { contextRevision: { increment: 1 } } : {}),
      updatedAt: context.now,
      updatedById: context.actorUserId,
    },
  });
}

/** The source-scope target of a case: its agency and, once bound, its route's owner and subject. */
export async function caseTarget(
  tx: Prisma.TransactionClient,
  row: Pick<CaseRecord, 'id' | 'agencyId' | 'routeId'>,
): Promise<SourceTarget> {
  if (row.routeId === null) {
    return { kind: 'Case', caseId: row.id, agencyId: row.agencyId, route: null };
  }
  const route = await routeContext(tx, row.routeId);
  if (!route) throw new Error('case route missing');
  return caseTargetWith(row, route);
}

export function caseTargetWith(
  row: Pick<CaseRecord, 'id' | 'agencyId'>,
  route: RouteContext,
): SourceTarget {
  return {
    kind: 'Case',
    caseId: row.id,
    agencyId: row.agencyId,
    route: { ownerId: route.ownerId, legalSubjectId: route.legalSubjectId },
  };
}

/**
 * Share-locks, in the lock order, the parties a case write names: agencies (the case's, the route's
 * and any other), the route's legal subject, owners (the route's and an owner hint), the route's
 * association and the route. Missing rows are skipped; the caller reports them after the case lock.
 */
export async function lockParties(
  tx: Prisma.TransactionClient,
  parties: {
    readonly agencyIds: ReadonlyArray<string | null | undefined>;
    readonly ownerIds: ReadonlyArray<string | null | undefined>;
    readonly route: RouteContext | null;
  },
): Promise<void> {
  const sorted = (ids: ReadonlyArray<string | null | undefined>) =>
    [...new Set(ids.filter((id): id is string => typeof id === 'string'))].sort();
  for (const id of sorted([...parties.agencyIds, parties.route?.agencyId])) {
    await lockForShare(tx, 'Agency', id);
  }
  if (parties.route) await lockForShare(tx, 'LegalSubject', parties.route.legalSubjectId);
  for (const id of sorted([...parties.ownerIds, parties.route?.ownerId])) {
    await lockForShare(tx, 'Owner', id);
  }
  if (parties.route) {
    await lockForShare(tx, 'OwnerSubject', parties.route.ownerSubjectId);
    await lockForShare(tx, 'Route', parties.route.routeId);
  }
}

/** An owner hint names an existing (422) Owner that is not archived (409). */
export async function assertOwnerHintUsable(
  tx: Prisma.TransactionClient,
  ownerId: string,
  operation: string,
): Promise<void> {
  const owner = await tx.owner.findUnique({
    where: { id: ownerId },
    select: { recordState: true },
  });
  if (!owner) throw apiErrors.referenceNotFound('ownerHintId');
  if (owner.recordState === 'ARCHIVED') {
    throw apiErrors.recordStateConflict({
      record: 'Owner',
      state: 'ARCHIVED',
      operation,
      field: 'ownerHintId',
    });
  }
}

/**
 * The route a case is bound to or selects authority under (INVARIANTS §3 "Bound Case Agency/Platform
 * matches Route"; DOMAIN_MODEL_v1 §8 "Pause/unlink prevents inappropriate new selection"): the case's
 * agency (422 CROSS_AGENCY_REFERENCE; the composite FK on agency and platform is the backstop —
 * YOUTUBE is the only platform), not archived and LINKED, with unarchived agency, owner and legal
 * subject and a LINKED association (409). The parties are already share-locked.
 */
export async function assertRouteUsableForCase(
  tx: Prisma.TransactionClient,
  route: RouteContext,
  caseAgencyId: string,
  operation: string,
): Promise<void> {
  const field = 'routeId';
  if (route.agencyId !== caseAgencyId) throw apiErrors.crossAgencyReference(field, 'record');
  const row = await tx.route.findUniqueOrThrow({
    where: { id: route.routeId },
    select: { archivedAt: true, linkState: true },
  });
  if (row.archivedAt !== null) {
    throw apiErrors.recordStateConflict({ record: 'Route', archived: true, operation, field });
  }
  if (row.linkState !== 'LINKED') {
    throw apiErrors.recordStateConflict({
      record: 'Route',
      linkState: row.linkState,
      operation,
      field,
    });
  }
  const agency = await tx.agency.findUniqueOrThrow({
    where: { id: route.agencyId },
    select: { recordState: true },
  });
  const subject = await tx.legalSubject.findUniqueOrThrow({
    where: { id: route.legalSubjectId },
    select: { recordState: true },
  });
  const owner = await tx.owner.findUniqueOrThrow({
    where: { id: route.ownerId },
    select: { recordState: true },
  });
  const archived =
    agency.recordState === 'ARCHIVED'
      ? 'Agency'
      : subject.recordState === 'ARCHIVED'
        ? 'LegalSubject'
        : owner.recordState === 'ARCHIVED'
          ? 'Owner'
          : null;
  if (archived !== null) {
    throw apiErrors.recordStateConflict({ record: archived, state: 'ARCHIVED', operation, field });
  }
  const association = await tx.ownerSubject.findUniqueOrThrow({
    where: { id: route.ownerSubjectId },
    select: { linkState: true },
  });
  if (association.linkState !== 'LINKED') {
    throw apiErrors.recordStateConflict({
      record: 'OwnerSubject',
      linkState: association.linkState,
      operation,
      field,
    });
  }
}

/** A set owner hint must be the route's owner: the case's context never contradicts its route. */
export function assertOwnerHintFits(
  ownerHintId: string | null,
  route: RouteContext,
  field: string,
): void {
  if (ownerHintId !== null && ownerHintId !== route.ownerId) {
    throw apiErrors.crossOwnerReference(field, route.ownerId, 'route');
  }
}

/**
 * What makes a case history-bearing (INVARIANTS §4: a route binding "can be corrected … only before
 * facts, authority selections, snapshots or correspondence make it history-bearing"), plus notice
 * candidates, which only exist after a snapshot.
 */
const HISTORY: ReadonlyArray<
  readonly [string, (tx: Prisma.TransactionClient, caseId: string) => Promise<number>]
> = [
  ['AUTHORITY_SELECTION', (tx, caseId) => tx.caseAuthoritySelection.count({ where: { caseId } })],
  ['CASE_FACT', (tx, caseId) => tx.caseFact.count({ where: { caseId } })],
  ['PROMPT_SNAPSHOT', (tx, caseId) => tx.promptSnapshot.count({ where: { caseId } })],
  ['CORRESPONDENCE_BINDING', (tx, caseId) => tx.correspondenceBinding.count({ where: { caseId } })],
  ['NOTICE_CANDIDATE', (tx, caseId) => tx.noticeCandidate.count({ where: { caseId } })],
];

export async function historyBlockers(
  tx: Prisma.TransactionClient,
  caseId: string,
): Promise<string[]> {
  const blockers: string[] = [];
  for (const [label, count] of HISTORY) {
    if ((await count(tx, caseId)) > 0) blockers.push(label);
  }
  return blockers;
}

/**
 * Every source the case already relies on — its LINKED and PAUSED source links, its canonical
 * binding source and its packet source — must still apply after its route changes (the new owner,
 * legal subject and case scope). A refusal names `routeId` (the request field) and the conflicting
 * source; nothing is written.
 */
export async function assertCaseSourcesFit(
  tx: Prisma.TransactionClient,
  row: CaseRecord,
  route: RouteContext,
): Promise<void> {
  const target = caseTargetWith(row, route);
  const links = await tx.caseSource.findMany({
    where: { caseId: row.id, linkState: { in: ['LINKED', 'PAUSED'] } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, sourceId: true },
  });
  const uses: Array<{ readonly conflict: string; readonly sourceId: string }> = [];
  if (row.canonicalBindingSourceId !== null) {
    uses.push({ conflict: 'canonicalBindingSourceId', sourceId: row.canonicalBindingSourceId });
  }
  if (row.packetSourceId !== null) {
    uses.push({ conflict: 'packetSourceId', sourceId: row.packetSourceId });
  }
  for (const link of links)
    uses.push({ conflict: `caseSource:${link.id}`, sourceId: link.sourceId });
  for (const use of uses) {
    try {
      await assertSourcesUsable(tx, [{ field: 'routeId', sourceId: use.sourceId }], target);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 422) throw error;
      throw new ApiError(422, error.code, error.message, {
        ...error.details,
        field: 'routeId',
        conflict: use.conflict,
        sourceId: use.sourceId,
      });
    }
  }
}
