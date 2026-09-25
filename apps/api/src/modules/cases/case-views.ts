// Contract wire views of the case records (strict objects): timestamps as ISO 8601 UTC strings.
// A CaseAuthoritySelection and the CaseAuthorityCoverage rows it pins are append-only: no row
// version, so no ETag. The pinned rows are read back only with their selection
// (getCaseAuthoritySelection, TB-SCHEMA-API-v1.1.0, ADR-0004), exactly as stored.
import type {
  CaseAuthorityCoverage as PinnedCoverageWire,
  CaseAuthoritySelection as SelectionWire,
  CaseRecord as CaseRecordView,
  CaseSource as CaseSourceView,
} from '@tb/contracts';
import type {
  CaseAuthorityCoverage,
  CaseAuthoritySelection,
  CaseRecord,
  CaseSource,
} from '../../../generated/prisma/client.js';

const iso = (value: Date | null): string | null => (value === null ? null : value.toISOString());

export function toCaseView(row: CaseRecord): CaseRecordView {
  return {
    id: row.id,
    agencyId: row.agencyId,
    platform: row.platform,
    intakeLabel: row.intakeLabel,
    ownerHintId: row.ownerHintId,
    routeId: row.routeId,
    canonicalCaseId: row.canonicalCaseId,
    canonicalBindingSourceId: row.canonicalBindingSourceId,
    caseClass: row.caseClass,
    workflowState: row.workflowState,
    currentAuthoritySelectionId: row.currentAuthoritySelectionId,
    packetSourceId: row.packetSourceId,
    driveFolderUrl: row.driveFolderUrl,
    contextRevision: row.contextRevision,
    closedAt: iso(row.closedAt),
    closeReason: row.closeReason,
    archivedAt: iso(row.archivedAt),
    archiveReason: row.archiveReason,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    createdById: row.createdById,
    updatedAt: row.updatedAt.toISOString(),
    updatedById: row.updatedById,
    rowVersion: row.rowVersion,
  };
}

export function toCaseSourceView(row: CaseSource): CaseSourceView {
  return {
    id: row.id,
    caseId: row.caseId,
    sourceId: row.sourceId,
    useRole: row.useRole,
    scopeNote: row.scopeNote,
    linkState: row.linkState,
    stateReason: row.stateReason,
    createdAt: row.createdAt.toISOString(),
    createdById: row.createdById,
    updatedAt: row.updatedAt.toISOString(),
    updatedById: row.updatedById,
    rowVersion: row.rowVersion,
  };
}

export function toSelectionView(row: CaseAuthoritySelection): SelectionWire {
  return {
    id: row.id,
    caseId: row.caseId,
    agencyId: row.agencyId,
    routeId: row.routeId,
    signerId: row.signerId,
    taskType: row.taskType,
    intendedFromEmail: row.intendedFromEmail,
    basisSourceId: row.basisSourceId,
    selectionNote: row.selectionNote,
    createdAt: row.createdAt.toISOString(),
    createdById: row.createdById,
  };
}

/** One CaseAuthorityCoverage row exactly as stored: the coverage id and application scope pinned. */
export function toPinnedCoverageView(row: CaseAuthorityCoverage): PinnedCoverageWire {
  return {
    id: row.id,
    selectionId: row.selectionId,
    caseId: row.caseId,
    agencyId: row.agencyId,
    routeId: row.routeId,
    coverageId: row.coverageId,
    applicationScope: row.applicationScope,
    createdAt: row.createdAt.toISOString(),
    createdById: row.createdById,
  };
}
