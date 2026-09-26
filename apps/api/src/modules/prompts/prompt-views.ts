// Contract wire views of a PromptSnapshot (P4E), exactly as stored: the JSON columns (dependency
// manifest, context, source manifest, missing items, conflicts) as stored, the rendered prompt as
// stored, the creation instant as an ISO 8601 UTC string. A snapshot is immutable: no row version, no
// ETag. A list returns the summary DTO (no prompt text, context or manifests — API_CONTRACT_v1 §11);
// the full snapshot is read by id.
import type {
  Dependency,
  MissingItem,
  ProductionContext,
  PromptSnapshot as PromptSnapshotWire,
  PromptSnapshotSummary,
  SourceManifestEntry,
} from '@tb/contracts';
import type { PromptSnapshot } from '../../../generated/prisma/client.js';

export function toPromptSnapshotView(row: PromptSnapshot): PromptSnapshotWire {
  return {
    id: row.id,
    caseId: row.caseId,
    taskType: row.taskType,
    generationMode: row.generationMode,
    version: row.version,
    authoritySelectionId: row.authoritySelectionId,
    parentBindingId: row.parentBindingId,
    contractVersion: row.contractVersion,
    templateVersion: row.templateVersion,
    contextRevision: row.contextRevision,
    dependencyDigest: row.dependencyDigest,
    dependencyManifest: row.dependencyManifest as unknown as Dependency[],
    contextJson: row.contextJson as unknown as ProductionContext,
    sourceManifest: row.sourceManifest as unknown as SourceManifestEntry[],
    missingItems: row.missingItems as unknown as MissingItem[],
    conflicts: row.conflicts as unknown as MissingItem[],
    renderedPrompt: row.renderedPrompt,
    promptSha256: row.promptSha256,
    createdAt: row.createdAt.toISOString(),
    createdById: row.createdById,
  };
}

/** The columns of a summary: never the prompt text, the context or a manifest. */
export const SUMMARY_COLUMNS = {
  id: true,
  caseId: true,
  taskType: true,
  generationMode: true,
  version: true,
  contractVersion: true,
  templateVersion: true,
  contextRevision: true,
  dependencyDigest: true,
  promptSha256: true,
  createdAt: true,
} as const;

export function toPromptSnapshotSummary(
  row: Pick<PromptSnapshot, keyof typeof SUMMARY_COLUMNS>,
): PromptSnapshotSummary {
  return {
    id: row.id,
    caseId: row.caseId,
    taskType: row.taskType,
    generationMode: row.generationMode,
    version: row.version,
    contractVersion: row.contractVersion,
    templateVersion: row.templateVersion,
    contextRevision: row.contextRevision,
    dependencyDigest: row.dependencyDigest,
    promptSha256: row.promptSha256,
    createdAt: row.createdAt.toISOString(),
  };
}
