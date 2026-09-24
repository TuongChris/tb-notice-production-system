// Validation of SourceReference ids supplied by directory writes (decisions D2/D4). Directory
// operations only POINT at sources; they never create one (SourceReference authoring is the later
// Source phase, and no placeholder source is ever invented).
//
//   every supplied id must name an existing SourceReference      → 422 REFERENCE_NOT_FOUND
//   for agency-owned records (the Agency itself, a Signer of it):
//     a source of another agency                                  → 422 CROSS_AGENCY_REFERENCE
//     a source without an agency that is not explicitly scoped to
//     this agency through scopeBindings.agencyIds                 → 422 SOURCE_SCOPE_UNRESOLVED
//       (INVARIANTS §3: "no global access from null agency")
// Owner, LegalSubject and OwnerSubject carry no agency in the current model, so only existence can
// be checked for them; source scope review for those records belongs to the Source phase.
import type { Prisma } from '../../../generated/prisma/client.js';
import { apiErrors } from '../../infrastructure/http/api-error.js';

export interface SourceUse {
  /** Request path of the id, reported back on failure (e.g. `fieldAttributions.0.sourceIds.1`). */
  readonly field: string;
  readonly sourceId: string;
}

/** The agency that owns the record the sources are attached to; null when it has none. */
export type SourceScope = { readonly agencyId: string } | null;

function explicitAgencyIds(scopeBindings: Prisma.JsonValue | null): readonly string[] {
  if (typeof scopeBindings !== 'object' || scopeBindings === null || Array.isArray(scopeBindings)) {
    return [];
  }
  const agencyIds = (scopeBindings as Record<string, unknown>)['agencyIds'];
  return Array.isArray(agencyIds) ? agencyIds.filter((id) => typeof id === 'string') : [];
}

export async function assertSourcesUsable(
  tx: Prisma.TransactionClient,
  uses: readonly SourceUse[],
  scope: SourceScope,
): Promise<void> {
  if (uses.length === 0) return;
  const ids = [...new Set(uses.map((use) => use.sourceId))];
  const rows = await tx.sourceReference.findMany({
    where: { id: { in: ids } },
    select: { id: true, agencyId: true, scopeBindings: true },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const use of uses) {
    const source = byId.get(use.sourceId);
    if (!source) throw apiErrors.referenceNotFound(use.field);
    if (scope === null) continue;
    if (source.agencyId !== null) {
      if (source.agencyId !== scope.agencyId) throw apiErrors.crossAgencyReference(use.field);
    } else if (!explicitAgencyIds(source.scopeBindings).includes(scope.agencyId)) {
      throw apiErrors.sourceScopeUnresolved(use.field);
    }
  }
}

/** Distinct source ids of a set of uses (for AuditEvent.sourceIds). */
export function sourceIdsOf(uses: readonly SourceUse[]): string[] {
  return [...new Set(uses.map((use) => use.sourceId))];
}
