// Loading and locking the representation-authority aggregate (P3B) in the lock order of records.ts:
// directory identities (Agency … Route, Signer) → Mandate → MandateVersion → MandateCoverage →
// CoverageSigner → SourceReference. The parent columns of a child never change (a version's mandate
// and agency, a coverage's version, route and agency, a coverage signer's coverage), so they are read
// before locking to know what to lock.
//
// State rules shared by the authority services:
//   archived Mandate  read-only except restore (R5 interpretation B): every write under it → 409
//   frozen version    the version and its coverage / coverage-signer children never change again
//                     (INVARIANTS §3 "A frozen version's coverage/signer rows cannot be changed";
//                     §5 "All coverage and coverage-signer mutations lock the parent MandateVersion,
//                     assert DRAFT, increment the parent's rowVersion and then mutate the child")
//                     → 409 FROZEN_VERSION
//   archived Agency   no new authority record (mandate, version, coverage, coverage signer, event)
//                     and no freeze or restore under it → 409
import type {
  Mandate,
  MandateCoverage,
  MandateVersion,
  Prisma,
} from '../../../generated/prisma/client.js';
import { apiErrors } from '../../infrastructure/http/api-error.js';
import type { WriteContext } from '../../infrastructure/write/write-executor.js';
import { lockForShare, lockForUpdate } from '../directory/records.js';

export interface VersionParents {
  readonly mandateId: string;
  readonly agencyId: string;
}

export interface CoverageParents extends VersionParents {
  readonly mandateVersionId: string;
  readonly routeId: string;
}

/** The immutable parents of a version (unlocked read); null when the version does not exist. */
export async function versionParents(
  tx: Prisma.TransactionClient,
  versionId: string,
): Promise<VersionParents | null> {
  return tx.mandateVersion.findUnique({
    where: { id: versionId },
    select: { mandateId: true, agencyId: true },
  });
}

/** The immutable parents of a coverage (unlocked read); null when the coverage does not exist. */
export async function coverageParents(
  tx: Prisma.TransactionClient,
  coverageId: string,
): Promise<CoverageParents | null> {
  const coverage = await tx.mandateCoverage.findUnique({
    where: { id: coverageId },
    select: {
      mandateVersionId: true,
      routeId: true,
      agencyId: true,
      version: { select: { mandateId: true } },
    },
  });
  if (!coverage) return null;
  return {
    mandateVersionId: coverage.mandateVersionId,
    routeId: coverage.routeId,
    agencyId: coverage.agencyId,
    mandateId: coverage.version.mandateId,
  };
}

/** Share-locks agencies in id order and refuses archived ones (a new authority record needs them). */
export async function lockUnarchivedAgencies(
  tx: Prisma.TransactionClient,
  agencies: ReadonlyArray<{ readonly id: string; readonly field: string }>,
  operation: string,
): Promise<void> {
  const byId = new Map<string, string>();
  for (const { id, field } of agencies) if (!byId.has(id)) byId.set(id, field);
  for (const id of [...byId.keys()].sort()) {
    if (!(await lockForShare(tx, 'Agency', id))) {
      throw apiErrors.referenceNotFound(byId.get(id) ?? 'agencyId');
    }
  }
  for (const id of [...byId.keys()].sort()) {
    const agency = await tx.agency.findUniqueOrThrow({
      where: { id },
      select: { recordState: true },
    });
    if (agency.recordState === 'ARCHIVED') {
      throw apiErrors.recordStateConflict({
        record: 'Agency',
        state: 'ARCHIVED',
        operation,
        field: byId.get(id),
      });
    }
  }
}

/** Locks the Mandate (FOR UPDATE or FOR SHARE) and loads it; 404 when it does not exist. */
export async function lockMandate(
  tx: Prisma.TransactionClient,
  mandateId: string,
  mode: 'update' | 'share',
): Promise<Mandate> {
  const locked =
    mode === 'update'
      ? await lockForUpdate(tx, 'Mandate', mandateId)
      : await lockForShare(tx, 'Mandate', mandateId);
  if (!locked) throw apiErrors.notFound();
  return tx.mandate.findUniqueOrThrow({ where: { id: mandateId } });
}

/** Locks the MandateVersion FOR UPDATE and loads it (its Mandate is already locked). */
export async function lockVersion(
  tx: Prisma.TransactionClient,
  versionId: string,
): Promise<MandateVersion> {
  if (!(await lockForUpdate(tx, 'MandateVersion', versionId))) throw apiErrors.notFound();
  return tx.mandateVersion.findUniqueOrThrow({ where: { id: versionId } });
}

/** Locks the MandateCoverage FOR UPDATE and loads it (its version is already locked). */
export async function lockCoverage(
  tx: Prisma.TransactionClient,
  coverageId: string,
): Promise<MandateCoverage> {
  if (!(await lockForUpdate(tx, 'MandateCoverage', coverageId))) throw apiErrors.notFound();
  return tx.mandateCoverage.findUniqueOrThrow({ where: { id: coverageId } });
}

/** 409 unless the Mandate is unarchived (archived records are read-only except restore). */
export function assertMandateUsable(mandate: Mandate, operation: string): void {
  if (mandate.archivedAt !== null) {
    throw apiErrors.recordStateConflict({ record: 'Mandate', archived: true, operation });
  }
}

/** 409 FROZEN_VERSION unless the version is still a draft. */
export function assertDraft(version: MandateVersion, operation: string): void {
  if (version.versionState !== 'DRAFT') {
    throw apiErrors.frozenVersion({ versionId: version.id, operation });
  }
}

/**
 * Increments the parent version's row version inside a child mutation (INVARIANTS §5) and returns
 * the new value for the response's affected resources and the audit record.
 */
export async function touchVersion(
  context: WriteContext,
  version: MandateVersion,
): Promise<number> {
  const row = await context.tx.mandateVersion.update({
    where: { id: version.id, rowVersion: version.rowVersion },
    data: {
      rowVersion: { increment: 1 },
      updatedAt: context.now,
      updatedById: context.actorUserId,
    },
    select: { rowVersion: true },
  });
  return row.rowVersion;
}

/** The owner and legal subject behind a route (immutable columns of the route and association). */
export interface RouteContext {
  readonly routeId: string;
  readonly agencyId: string;
  readonly ownerSubjectId: string;
  readonly ownerId: string;
  readonly legalSubjectId: string;
}

export async function routeContext(
  tx: Prisma.TransactionClient,
  routeId: string,
): Promise<RouteContext | null> {
  const route = await tx.route.findUnique({
    where: { id: routeId },
    select: {
      agencyId: true,
      ownerSubjectId: true,
      ownerSubject: { select: { ownerId: true, legalSubjectId: true } },
    },
  });
  if (!route) return null;
  return {
    routeId,
    agencyId: route.agencyId,
    ownerSubjectId: route.ownerSubjectId,
    ownerId: route.ownerSubject.ownerId,
    legalSubjectId: route.ownerSubject.legalSubjectId,
  };
}

/** The source-scope target of a route-level authority citation (source-scope.ts). */
export function routeTarget(route: RouteContext) {
  return {
    kind: 'Route' as const,
    agencyId: route.agencyId,
    ownerId: route.ownerId,
    legalSubjectId: route.legalSubjectId,
  };
}
