// Contract wire views of the case intake material (P4B), exactly as stored: timestamps as ISO 8601
// UTC strings, millisecond columns (BIGINT UNSIGNED) as decimal strings, JSON columns as stored.
// ReportedItem, CaseWork and UseMapping are version-checked mutable records (ETag from rowVersion);
// a CaseFact revision is append-only (no row version, no ETag).
import type {
  CaseFact as CaseFactWire,
  CaseFactSummary,
  CaseWork as CaseWorkWire,
  RawTimecodes,
  ReportedItem as ReportedItemWire,
  UseMapping as UseMappingWire,
} from '@tb/contracts';
import type {
  CaseFact,
  CaseWork,
  ReportedItem,
  UseMapping,
} from '../../../generated/prisma/client.js';

const iso = (value: Date | null): string | null => (value === null ? null : value.toISOString());
const decimal = (value: bigint | null): string | null => (value === null ? null : value.toString());

export function toReportedItemView(row: ReportedItem): ReportedItemWire {
  return {
    id: row.id,
    caseId: row.caseId,
    rawUrl: row.rawUrl,
    normalizedUrl: row.normalizedUrl,
    externalItemId: row.externalItemId,
    displayTitle: row.displayTitle,
    observedAt: iso(row.observedAt),
    archivedAt: iso(row.archivedAt),
    archiveReason: row.archiveReason,
    createdAt: row.createdAt.toISOString(),
    createdById: row.createdById,
    updatedAt: row.updatedAt.toISOString(),
    updatedById: row.updatedById,
    rowVersion: row.rowVersion,
  };
}

export function toCaseWorkView(row: CaseWork): CaseWorkWire {
  return {
    id: row.id,
    caseId: row.caseId,
    title: row.title,
    sourceUrl: row.sourceUrl,
    externalWorkId: row.externalWorkId,
    workType: row.workType,
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

export function toUseMappingView(row: UseMapping): UseMappingWire {
  return {
    id: row.id,
    caseId: row.caseId,
    caseWorkId: row.caseWorkId,
    reportedItemId: row.reportedItemId,
    occurrence: row.occurrence,
    sourceStartMs: decimal(row.sourceStartMs),
    sourceEndMs: decimal(row.sourceEndMs),
    reportedStartMs: decimal(row.reportedStartMs),
    reportedEndMs: decimal(row.reportedEndMs),
    rawTimecodes: row.rawTimecodes as RawTimecodes | null,
    boundaryConvention: row.boundaryConvention,
    provenance: row.provenance,
    basisSourceId: row.basisSourceId,
    limitations: row.limitations,
    archivedAt: iso(row.archivedAt),
    archiveReason: row.archiveReason,
    createdAt: row.createdAt.toISOString(),
    createdById: row.createdById,
    updatedAt: row.updatedAt.toISOString(),
    updatedById: row.updatedById,
    rowVersion: row.rowVersion,
  };
}

/** One fact revision exactly as stored; `value` is the typed value it was recorded with. */
export function toCaseFactView(row: CaseFact): CaseFactWire {
  return {
    id: row.id,
    caseId: row.caseId,
    factGroupId: row.factGroupId,
    revision: row.revision,
    supersedesFactId: row.supersedesFactId,
    factType: row.factType,
    scopeKind: row.scopeKind,
    caseWorkId: row.caseWorkId,
    reportedItemId: row.reportedItemId,
    mappingId: row.mappingId,
    value: row.value,
    provenance: row.provenance,
    rawProvenance: row.rawProvenance,
    resolutionState: row.resolutionState,
    assertedByLabel: row.assertedByLabel,
    assertedAsOf: iso(row.assertedAsOf),
    scopeText: row.scopeText,
    limitations: row.limitations,
    changeReason: row.changeReason,
    createdAt: row.createdAt.toISOString(),
    createdById: row.createdById,
  } as CaseFactWire;
}

export function toCaseFactSummary(row: CaseFact): CaseFactSummary {
  return {
    id: row.id,
    caseId: row.caseId,
    factGroupId: row.factGroupId,
    revision: row.revision,
    supersedesFactId: row.supersedesFactId,
    factType: row.factType,
    scopeKind: row.scopeKind,
    caseWorkId: row.caseWorkId,
    reportedItemId: row.reportedItemId,
    mappingId: row.mappingId,
    provenance: row.provenance,
    resolutionState: row.resolutionState,
    createdAt: row.createdAt.toISOString(),
  };
}
