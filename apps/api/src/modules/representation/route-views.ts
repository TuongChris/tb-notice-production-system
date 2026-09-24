// Contract wire view of a Route row (strict object, ISO 8601 UTC timestamps).
import type { Route as RouteView } from '@tb/contracts';
import type { Route } from '../../../generated/prisma/client.js';

const iso = (value: Date | null): string | null => (value === null ? null : value.toISOString());

export function toRouteView(row: Route): RouteView {
  return {
    id: row.id,
    agencyId: row.agencyId,
    ownerSubjectId: row.ownerSubjectId,
    platform: row.platform,
    linkState: row.linkState,
    defaultSignerId: row.defaultSignerId,
    preferredCoverageId: row.preferredCoverageId,
    casePrefixHint: row.casePrefixHint,
    unlinkedAt: iso(row.unlinkedAt),
    stateReason: row.stateReason,
    canonicalCode: row.canonicalCode,
    canonicalSourceId: row.canonicalSourceId,
    bindingState: row.bindingState,
    notes: row.notes,
    archivedAt: iso(row.archivedAt),
    archiveReason: row.archiveReason,
    createdAt: row.createdAt.toISOString(),
    createdById: row.createdById,
    updatedAt: row.updatedAt.toISOString(),
    updatedById: row.updatedById,
    rowVersion: row.rowVersion,
  };
}
