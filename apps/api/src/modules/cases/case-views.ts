// Contract wire views of the case records (strict objects): timestamps as ISO 8601 UTC strings.
// A CaseAuthoritySelection is append-only: no row version, so no ETag. The CaseAuthorityCoverage
// rows a selection pins have no contracted read view (see P4A_CASE_CORE.md §1.1).
import type {
  CaseAuthoritySelection as CaseAuthoritySelectionView,
  CaseRecord as CaseRecordView,
  CaseSource as CaseSourceView,
} from '@tb/contracts';
import type {
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

export function toSelectionView(row: CaseAuthoritySelection): CaseAuthoritySelectionView {
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
