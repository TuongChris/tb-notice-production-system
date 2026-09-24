// Which SourceReference may support which record (P3A). One rule set for every place a write cites
// a source: field attributions, Signer identity/delegation sources, the OwnerSubject link source and
// the canonical bindings of Agency, Owner, LegalSubject, Signer and Route.
//
// A SourceReference is a pointer with capture metadata, not evidence, permission or authority. Its
// applicability comes only from its recorded scope (INVARIANTS §3: "A source is authorized for this
// Agency/Subject/Case, including explicit shared scope … no global access from null agency"; the
// schema dictionary: "Null agency only for public/shared-scoped sources, not permission to cross
// agencies"). Nothing is inferred from titles, URLs, file names or the source merely existing.
//
//   agency dimension
//     Agency-scoped records (an Agency, a Signer through its Agency, a Route through its Agency):
//       the source belongs to that agency, or it has no agency and names that agency in
//       scopeBindings.agencyIds (R5 interpretation D). Another agency's source → CROSS_AGENCY_REFERENCE.
//     Shared records without an agency (LegalSubject, Owner, OwnerSubject): only a source without an
//       agency that is not restricted to particular agencies — an agency's own material must not
//       become part of a record every agency uses.
//   subject dimension (scopeBindings.legalSubjectIds)
//     LegalSubject: the source must name that subject.
//     Route / OwnerSubject: a subject-scoped source must name the association's subject.
//     Owner: a subject-scoped source is subject material, not the Owner namespace's.
//   owner dimension (checked in the database, see assertSourcesUsable)
//     A source already recorded as one Owner's material — that Owner's canonical source, the source
//     of one of its OwnerSubject links, or the canonical source of a Route through one of its links —
//     is not used for another Owner's records (CROSS_OWNER_REFERENCE).
//   case dimension
//     Case scope does not exist before the Case phase: a case-scoped source applies to nothing here.
import { Prisma } from '../../../generated/prisma/client.js';
import { apiErrors } from '../../infrastructure/http/api-error.js';

/** The record a source would support, with the scope dimensions that record has. */
export type SourceTarget =
  | { readonly kind: 'Agency'; readonly agencyId: string }
  | {
      readonly kind: 'Route';
      readonly agencyId: string;
      readonly ownerId: string;
      readonly legalSubjectId: string;
    }
  | { readonly kind: 'LegalSubject'; readonly legalSubjectId: string }
  | { readonly kind: 'Owner'; readonly ownerId: string }
  | { readonly kind: 'OwnerSubject'; readonly ownerId: string; readonly legalSubjectId: string };

export interface SourceUse {
  /** Request path of the id, reported back on failure (e.g. `fieldAttributions.0.sourceIds.1`). */
  readonly field: string;
  readonly sourceId: string;
}

/** The contract ScopeBindings object as stored (validated by the contract schema when written). */
export interface ScopeBindings {
  readonly caseIds: readonly string[];
  readonly legalSubjectIds: readonly string[];
  readonly agencyIds: readonly string[];
  readonly limitation: string | null;
}

export function scopeBindingsOf(value: Prisma.JsonValue | null | undefined): ScopeBindings {
  const object =
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const ids = (key: string): string[] => {
    const list = object[key];
    return Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : [];
  };
  const limitation = object['limitation'];
  return {
    caseIds: ids('caseIds'),
    legalSubjectIds: ids('legalSubjectIds'),
    agencyIds: ids('agencyIds'),
    limitation: typeof limitation === 'string' ? limitation : null,
  };
}

/** Why a source does not apply to a target (null when it applies). */
export type ScopeProblem =
  | { readonly code: 'CROSS_AGENCY_REFERENCE' }
  | {
      readonly code: 'SOURCE_SCOPE_UNRESOLVED';
      readonly reason:
        | 'CASE_SCOPED_SOURCE'
        | 'NOT_SCOPED_TO_AGENCY'
        | 'AGENCY_OWNED_SOURCE'
        | 'AGENCY_RESTRICTED_SOURCE'
        | 'NOT_SCOPED_TO_SUBJECT'
        | 'SCOPED_TO_OTHER_SUBJECT'
        | 'SUBJECT_SPECIFIC_SOURCE';
    };

export interface ScopedSource {
  readonly agencyId: string | null;
  readonly scopeBindings: Prisma.JsonValue | null;
}

/** The recorded-scope part of the rules (no database access; the owner dimension is separate). */
export function scopeProblem(source: ScopedSource, target: SourceTarget): ScopeProblem | null {
  const scope = scopeBindingsOf(source.scopeBindings);
  const unresolved = (reason: Extract<ScopeProblem, { reason: unknown }>['reason']) =>
    ({ code: 'SOURCE_SCOPE_UNRESOLVED', reason }) as const;
  if (scope.caseIds.length > 0) return unresolved('CASE_SCOPED_SOURCE');

  if (target.kind === 'Agency' || target.kind === 'Route') {
    if (source.agencyId !== null) {
      if (source.agencyId !== target.agencyId) return { code: 'CROSS_AGENCY_REFERENCE' };
    } else if (!scope.agencyIds.includes(target.agencyId)) {
      return unresolved('NOT_SCOPED_TO_AGENCY');
    }
  } else {
    if (source.agencyId !== null) return unresolved('AGENCY_OWNED_SOURCE');
    if (scope.agencyIds.length > 0) return unresolved('AGENCY_RESTRICTED_SOURCE');
  }

  switch (target.kind) {
    case 'LegalSubject':
      if (!scope.legalSubjectIds.includes(target.legalSubjectId)) {
        return unresolved('NOT_SCOPED_TO_SUBJECT');
      }
      break;
    case 'Route':
    case 'OwnerSubject':
      if (
        scope.legalSubjectIds.length > 0 &&
        !scope.legalSubjectIds.includes(target.legalSubjectId)
      ) {
        return unresolved('SCOPED_TO_OTHER_SUBJECT');
      }
      break;
    case 'Owner':
      if (scope.legalSubjectIds.length > 0) return unresolved('SUBJECT_SPECIFIC_SOURCE');
      break;
    case 'Agency':
      break;
  }
  return null;
}

function ownerOf(target: SourceTarget): string | null {
  return target.kind === 'Owner' || target.kind === 'OwnerSubject' || target.kind === 'Route'
    ? target.ownerId
    : null;
}

/**
 * The first Owner other than `ownerId` for which the source is already recorded as material: its
 * canonical source, the source of one of its OwnerSubject links, or the canonical source of a Route
 * through one of its links. Null when there is none.
 */
export async function otherOwnerUsing(
  tx: Prisma.TransactionClient,
  sourceId: string,
  ownerId: string,
): Promise<string | null> {
  const owner = await tx.owner.findFirst({
    where: { canonicalSourceId: sourceId, id: { not: ownerId } },
    select: { id: true },
  });
  if (owner) return owner.id;
  const link = await tx.ownerSubject.findFirst({
    where: { sourceId, ownerId: { not: ownerId } },
    select: { ownerId: true },
  });
  if (link) return link.ownerId;
  const route = await tx.route.findFirst({
    where: { canonicalSourceId: sourceId, ownerSubject: { ownerId: { not: ownerId } } },
    select: { ownerSubject: { select: { ownerId: true } } },
  });
  return route ? route.ownerSubject.ownerId : null;
}

export interface UsableSource {
  readonly id: string;
  readonly sourceGroupId: string;
  readonly agencyId: string | null;
  readonly scopeBindings: Prisma.JsonValue | null;
  readonly sourceRole: string;
}

/**
 * Checks every cited source: it exists (422 REFERENCE_NOT_FOUND) and applies to the target record
 * (422 CROSS_AGENCY_REFERENCE / SOURCE_SCOPE_UNRESOLVED / CROSS_OWNER_REFERENCE). The source rows
 * are locked — FOR UPDATE when the target has an Owner, so two concurrent uses of one source for
 * two different Owners are serialized — and SourceReference sorts last in the lock order. Returns
 * the sources in the order of `uses`.
 */
export async function assertSourcesUsable(
  tx: Prisma.TransactionClient,
  uses: readonly SourceUse[],
  target: SourceTarget,
): Promise<UsableSource[]> {
  if (uses.length === 0) return [];
  const ids = [...new Set(uses.map((use) => use.sourceId))].sort();
  const owner = ownerOf(target);
  const lock = Prisma.raw(owner === null ? 'FOR SHARE' : 'FOR UPDATE');
  for (const id of ids) {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM source_references WHERE id = ${id} ${lock}`);
  }
  const rows = await tx.sourceReference.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      sourceGroupId: true,
      agencyId: true,
      scopeBindings: true,
      sourceRole: true,
    },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const result: UsableSource[] = [];
  for (const use of uses) {
    const source = byId.get(use.sourceId);
    if (!source) throw apiErrors.referenceNotFound(use.field);
    const problem = scopeProblem(source, target);
    if (problem?.code === 'CROSS_AGENCY_REFERENCE') throw apiErrors.crossAgencyReference(use.field);
    if (problem?.code === 'SOURCE_SCOPE_UNRESOLVED') {
      throw apiErrors.sourceScopeUnresolved(use.field, problem.reason);
    }
    if (owner !== null) {
      const other = await otherOwnerUsing(tx, source.id, owner);
      if (other !== null) throw apiErrors.crossOwnerReference(use.field, other);
    }
    result.push(source);
  }
  return result;
}

/** Distinct source ids of a set of uses (for AuditEvent.sourceIds). */
export function sourceIdsOf(uses: readonly SourceUse[]): string[] {
  return [...new Set(uses.map((use) => use.sourceId))];
}
