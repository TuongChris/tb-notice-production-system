// Contract wire views of SourceReference rows: the full record for GET/create/revise and the
// SourceReferenceSummary DTO for lists (API_CONTRACT_v1 §11: heavy lists use summary DTOs, never the
// full row). Timestamps are ISO 8601 UTC strings; JSON is returned as stored.
import type {
  SourceReference as SourceView,
  SourceReferenceSummary as SourceSummaryView,
} from '@tb/contracts';
import type { SourceReference } from '../../../generated/prisma/client.js';

const iso = (value: Date | null): string | null => (value === null ? null : value.toISOString());

export function toSourceView(row: SourceReference): SourceView {
  return {
    id: row.id,
    agencyId: row.agencyId,
    sourceGroupId: row.sourceGroupId,
    revision: row.revision,
    supersedesSourceId: row.supersedesSourceId,
    title: row.title,
    canonicalUrl: row.canonicalUrl,
    providerFileId: row.providerFileId,
    providerRevisionId: row.providerRevisionId,
    sourceRole: row.sourceRole,
    accessState: row.accessState,
    contentSha256: row.contentSha256,
    hashTarget: row.hashTarget,
    reportedProvenance: row.reportedProvenance,
    rawProvenance: row.rawProvenance,
    scopeText: row.scopeText,
    scopeBindings: row.scopeBindings as SourceView['scopeBindings'],
    observedAt: iso(row.observedAt),
    reviewedByLabel: row.reviewedByLabel,
    reviewedAt: iso(row.reviewedAt),
    excerpt: row.excerpt,
    excerptLocator: row.excerptLocator,
    limitations: row.limitations,
    createdAt: row.createdAt.toISOString(),
    createdById: row.createdById,
  };
}

export function toSourceSummary(row: SourceReference): SourceSummaryView {
  return {
    id: row.id,
    agencyId: row.agencyId,
    sourceGroupId: row.sourceGroupId,
    revision: row.revision,
    supersedesSourceId: row.supersedesSourceId,
    title: row.title,
    canonicalUrl: row.canonicalUrl,
    sourceRole: row.sourceRole,
    accessState: row.accessState,
    contentSha256: row.contentSha256,
    hashTarget: row.hashTarget,
    reportedProvenance: row.reportedProvenance,
    observedAt: iso(row.observedAt),
    reviewedAt: iso(row.reviewedAt),
    createdAt: row.createdAt.toISOString(),
  };
}
