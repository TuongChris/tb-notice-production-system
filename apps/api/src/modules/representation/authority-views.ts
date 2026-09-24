// Contract wire views of the representation-authority rows (strict objects): timestamps as ISO 8601
// UTC strings, DATE columns as the contract's YYYY-MM-DD (stored and read as UTC midnight; the
// session time zone is UTC), JSON columns as stored (validated by the contract when written).
import type {
  AuthorityEvent as AuthorityEventView,
  CoverageSigner as CoverageSignerView,
  Mandate as MandateView,
  MandateCoverage as MandateCoverageView,
  MandateVersion as MandateVersionView,
} from '@tb/contracts';
import type {
  AuthorityEvent,
  CoverageSigner,
  Mandate,
  MandateCoverage,
  MandateVersion,
} from '../../../generated/prisma/client.js';

const iso = (value: Date | null): string | null => (value === null ? null : value.toISOString());

/** A DATE column value as YYYY-MM-DD. */
export const dateOnly = (value: Date | null): string | null =>
  value === null ? null : value.toISOString().slice(0, 10);

export function toMandateView(row: Mandate): MandateView {
  return {
    id: row.id,
    agencyId: row.agencyId,
    label: row.label,
    externalReference: row.externalReference,
    description: row.description,
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

export function toMandateVersionView(row: MandateVersion): MandateVersionView {
  return {
    id: row.id,
    mandateId: row.mandateId,
    agencyId: row.agencyId,
    version: row.version,
    versionState: row.versionState,
    changeKind: row.changeKind,
    predecessorId: row.predecessorId,
    primarySourceId: row.primarySourceId,
    additionalSourceRefs: row.additionalSourceRefs as MandateVersionView['additionalSourceRefs'],
    documentState: row.documentState,
    sourceReviewState: row.sourceReviewState,
    signedDatesRaw: row.signedDatesRaw as MandateVersionView['signedDatesRaw'],
    validityModel: row.validityModel,
    effectiveOn: dateOnly(row.effectiveOn),
    expiresOn: dateOnly(row.expiresOn),
    validityNotes: row.validityNotes,
    frozenAt: iso(row.frozenAt),
    changeReason: row.changeReason,
    createdAt: row.createdAt.toISOString(),
    createdById: row.createdById,
    updatedAt: row.updatedAt.toISOString(),
    updatedById: row.updatedById,
    rowVersion: row.rowVersion,
  };
}

export function toCoverageView(row: MandateCoverage): MandateCoverageView {
  return {
    id: row.id,
    mandateVersionId: row.mandateVersionId,
    routeId: row.routeId,
    agencyId: row.agencyId,
    coverageLabel: row.coverageLabel,
    coveredWorksScope: row.coveredWorksScope,
    territorialScope: row.territorialScope,
    actionScope: row.actionScope as MandateCoverageView['actionScope'],
    exclusions: row.exclusions,
    conditions: row.conditions,
    exclusivity: row.exclusivity,
    effectiveOn: dateOnly(row.effectiveOn),
    expiresOn: dateOnly(row.expiresOn),
    basisSourceId: row.basisSourceId,
    predecessorCoverageId: row.predecessorCoverageId,
    createdAt: row.createdAt.toISOString(),
    createdById: row.createdById,
    updatedAt: row.updatedAt.toISOString(),
    updatedById: row.updatedById,
    rowVersion: row.rowVersion,
  };
}

export function toCoverageSignerView(row: CoverageSigner): CoverageSignerView {
  return {
    id: row.id,
    coverageId: row.coverageId,
    agencyId: row.agencyId,
    signerId: row.signerId,
    capacity: row.capacity,
    actionScope: row.actionScope as CoverageSignerView['actionScope'],
    sourceId: row.sourceId,
    effectiveOn: dateOnly(row.effectiveOn),
    endsOn: dateOnly(row.endsOn),
    limitations: row.limitations,
    createdAt: row.createdAt.toISOString(),
    createdById: row.createdById,
    updatedAt: row.updatedAt.toISOString(),
    updatedById: row.updatedById,
    rowVersion: row.rowVersion,
  };
}

/** An AuthorityEvent is append-only: no row version, so no ETag. */
export function toAuthorityEventView(row: AuthorityEvent): AuthorityEventView {
  return {
    id: row.id,
    mandateId: row.mandateId,
    agencyId: row.agencyId,
    coverageId: row.coverageId,
    eventType: row.eventType,
    sourceId: row.sourceId,
    provenance: row.provenance,
    effectiveOn: dateOnly(row.effectiveOn),
    effectiveAt: iso(row.effectiveAt),
    rawEffectiveText: row.rawEffectiveText,
    scopeText: row.scopeText,
    supersedesEventId: row.supersedesEventId,
    interpretation: row.interpretation,
    createdAt: row.createdAt.toISOString(),
    createdById: row.createdById,
  };
}
