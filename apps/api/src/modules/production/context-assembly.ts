// Assembly of the production context (PFC-YT-EMAIL-v1.1) from the rows of one snapshot — a pure
// function: no database, clock, network or randomness, so the same rows and scope always give the
// same context, dependencies and digest.
//
// The context is recorded input a later production step may inspect, never a legal conclusion: it
// assembles records exactly as stored and adjudicates nothing — no G1–G7 decision, currentness,
// validity, ownership, permission, infringement or readiness is computed, and no value is filled in
// to make it look complete. What is materially absent for the requested task is listed in
// `missing`; what the records themselves record as conflicting (or structurally contradict) is
// listed in `conflicts`. Neither list is resolved, shortened or turned into a verdict.
import {
  codePointLength,
  PFC_SCHEMA_VERSION,
  type ContextView,
  type Correspondence,
  type MissingItem,
  type ProductionContext,
  type SourceManifestEntry,
} from '@tb/contracts';
import type { SourceReference } from '../../../generated/prisma/client.js';
import { apiErrors } from '../../infrastructure/http/api-error.js';
import { toSelectionView } from '../cases/case-views.js';
import {
  toCaseFactView,
  toCaseWorkView,
  toReportedItemView,
  toUseMappingView,
} from '../cases/intake-views.js';
import { toCorrespondenceView } from '../correspondence/correspondence-views.js';
import {
  toAuthorityEventView,
  toCoverageSignerView,
  toCoverageView,
  toMandateVersionView,
} from '../representation/authority-views.js';
import { dependenciesOf, dependencyDigest } from './context-dependencies.js';
import type { ContextRows } from './context-snapshot.js';
import type { ContextScope } from './context-scope.js';

/**
 * Missing-item codes without which DRAFTING cannot proceed: the "Required content" of the Production
 * Form Contract §4 (Party: namespace, legal subject and proposed signer; Authority: the exact
 * selection; Case: reported items, works and use mappings; Task: the explicit parent NMI of a reply)
 * and INVARIANTS §4 ("Reply generation requires explicit parent NMI binding and prior AS_SENT
 * selections"). PREPARATION returns the same context with them listed; nothing is manufactured.
 */
export const DRAFTING_BLOCKING_CODES: readonly string[] = [
  'CASE_ROUTE_UNBOUND',
  'AUTHORITY_SELECTION_NOT_SELECTED',
  'REPORTED_ITEMS_ABSENT',
  'WORKS_ABSENT',
  'USE_MAPPINGS_ABSENT',
  'REPLY_PARENT_NOT_SELECTED',
  'PRIOR_AS_SENT_NOT_SELECTED',
];

/** Largest scope text / limitations a SourceManifestEntry holds (code points, contract). */
export const MANIFEST_TEXT_MAXIMUM = 5000;

export interface AssembledContext {
  readonly view: ContextView;
  /** The DRAFTING-blocking codes present in `view.context.missing`, in list order. */
  readonly blocking: readonly string[];
}

const item = (code: string, message: string, fieldPath: string): MissingItem => ({
  code,
  message,
  fieldPath,
});

/** A source revision as a manifest entry, or the reason it cannot be one without being cut. */
function manifestEntry(source: SourceReference): SourceManifestEntry | { tooLong: string } {
  const scopeLength = codePointLength(source.scopeText);
  if (scopeLength < 1 || scopeLength > MANIFEST_TEXT_MAXIMUM) {
    return { tooLong: `scope text (${scopeLength} characters)` };
  }
  if (source.limitations !== null && codePointLength(source.limitations) > MANIFEST_TEXT_MAXIMUM) {
    return { tooLong: `limitations (${codePointLength(source.limitations)} characters)` };
  }
  return {
    sourceId: source.id,
    role: source.sourceRole,
    canonicalUrl: source.canonicalUrl,
    contentSha256: source.contentSha256,
    hashTarget: source.hashTarget,
    provenance: source.reportedProvenance,
    scopeText: source.scopeText,
    limitations: source.limitations,
  };
}

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function assembleContext(rows: ContextRows, scope: ContextScope): AssembledContext {
  const missing: MissingItem[] = [];
  const conflicts: MissingItem[] = [];
  const { caseRow, selection } = rows;

  // Intake records (the snapshot already holds exactly the included ones, in recording order).
  const reportedItems = rows.items.map(toReportedItemView);
  const works = rows.works.map(toCaseWorkView);
  const mappings = rows.mappings.map(toUseMappingView);
  const facts = rows.facts.map(toCaseFactView);

  // Correspondence: one row per captured message the selected bindings name, never one per binding.
  const correspondence: Correspondence[] = rows.correspondence.map(toCorrespondenceView);
  const priorCorrespondenceIds = [...new Set(rows.priors.map((b) => b.correspondenceId))].sort(
    byId,
  );

  // Source manifests: every source revision of the context exactly as pinned — the policy sources
  // explicitly LINKED to this case, and every other one in `sources`. Never the registry.
  const linkedPolicy = new Set(
    rows.caseSources
      .filter((link) => link.linkState === 'LINKED')
      .map((link) => link.sourceId)
      .filter(
        (id) => rows.sources.find((source) => source.id === id)?.sourceRole === 'POLICY_REFERENCE',
      ),
  );
  const ordered = [...rows.sources].sort((x, y) => byId(x.id, y.id));
  const sources: SourceManifestEntry[] = [];
  const policySources: SourceManifestEntry[] = [];
  const tooLong: Array<{
    source: SourceReference;
    field: 'sources' | 'policySources';
    why: string;
  }> = [];
  for (const source of ordered) {
    const field = linkedPolicy.has(source.id) ? 'policySources' : 'sources';
    const entry = manifestEntry(source);
    if ('tooLong' in entry) tooLong.push({ source, field, why: entry.tooLong });
    else (field === 'policySources' ? policySources : sources).push(entry);
  }

  // Authority: exactly the selection named and the chain it pinned.
  const coverageById = new Map(rows.coverages.map((row) => [row.id, row]));
  const versionById = new Map(rows.versions.map((row) => [row.id, row]));
  const authority: ProductionContext['authority'] =
    selection === null
      ? null
      : {
          selection: toSelectionView(selection),
          coverages: rows.pinned.map((pin) => {
            const coverage = coverageById.get(pin.coverageId);
            const version = coverage && versionById.get(coverage.mandateVersionId);
            if (!coverage || !version) throw new Error('pinned coverage chain not loaded');
            return {
              coverage: toCoverageView(coverage),
              version: toMandateVersionView(version),
              signerScopes: rows.coverageSigners
                .filter((row) => row.coverageId === coverage.id)
                .map(toCoverageSignerView),
              authorityEvents: rows.events
                .filter(
                  (event) =>
                    event.mandateId === version.mandateId &&
                    (event.coverageId === null || event.coverageId === coverage.id),
                )
                .map(toAuthorityEventView),
            };
          }),
        };

  // ---- missing: material absences for the requested task, never optional nulls ----
  if (caseRow.routeId === null) {
    missing.push(
      item(
        'CASE_ROUTE_UNBOUND',
        'No route is bound to this case: the owner namespace and the legal subject are not resolved. Nothing is inferred from names or from the owner hint.',
        'party.legalSubjectId',
      ),
    );
  }
  if (selection === null) {
    missing.push(
      item(
        'AUTHORITY_SELECTION_NOT_SELECTED',
        "No authority selection is named for this context, so it has no proposed signer and no authority chain. The case's recorded selections are not used unless one is named.",
        'authoritySelectionId',
      ),
    );
  }
  const activeItems = reportedItems.filter((row) => row.archivedAt === null);
  const activeMappings = mappings.filter((row) => row.archivedAt === null);
  if (activeItems.length === 0) {
    missing.push(
      item('REPORTED_ITEMS_ABSENT', 'No reported item is recorded for this case.', 'reportedItems'),
    );
  }
  if (!works.some((row) => row.archivedAt === null)) {
    missing.push(item('WORKS_ABSENT', 'No work is recorded for this case.', 'works'));
  }
  if (activeMappings.length === 0) {
    missing.push(
      item('USE_MAPPINGS_ABSENT', 'No use mapping is recorded for this case.', 'mappings'),
    );
  }
  reportedItems.forEach((row, index) => {
    if (row.archivedAt !== null) return;
    if (activeMappings.some((mapping) => mapping.reportedItemId === row.id)) return;
    missing.push(
      item(
        'REPORTED_ITEM_UNMAPPED',
        `No use mapping is recorded for reported item ${row.id}.`,
        `reportedItems[${index}]`,
      ),
    );
  });
  if (scope.taskType === 'NMI_REPLY') {
    if (rows.parent === null) {
      missing.push(
        item(
          'REPLY_PARENT_NOT_SELECTED',
          'No NMI binding is named as the parent of this reply. None is chosen by date, subject or text.',
          'parentBindingId',
        ),
      );
    }
    if (rows.priors.length === 0) {
      missing.push(
        item(
          'PRIOR_AS_SENT_NOT_SELECTED',
          'No prior transmission (a binding recorded as sent) is named for this reply. None is chosen automatically.',
          'priorCorrespondenceIds',
        ),
      );
    }
  }
  const parentMessageId = rows.parent?.correspondenceId ?? null;
  const priorMessageIds = new Set(rows.priors.map((binding) => binding.correspondenceId));
  correspondence.forEach((message, index) => {
    if (
      message.id === parentMessageId &&
      (message.captureMode === 'EXCERPT' || message.captureMode === 'OPERATOR_REPORTED')
    ) {
      missing.push(
        item(
          'REPLY_PARENT_FULL_TEXT_ABSENT',
          `The NMI message ${message.id} is recorded as ${message.captureMode}: its full text is not captured, so its literal questions may be incomplete.`,
          `correspondence[${index}]`,
        ),
      );
    }
    if (priorMessageIds.has(message.id) && message.captureMode !== 'RAW_SOURCE') {
      missing.push(
        item(
          'PRIOR_AS_SENT_RAW_SOURCE_ABSENT',
          `The prior transmission ${message.id} is recorded as ${message.captureMode}: the exact message as sent (raw source) is not captured, so its wording and attachments stay at their recorded level.`,
          `correspondence[${index}]`,
        ),
      );
    }
  });
  facts.forEach((fact, index) => {
    if (fact.provenance !== 'MISSING') return;
    missing.push(
      item(
        'FACT_PROVENANCE_MISSING',
        `Fact ${fact.id} (${fact.factType}) is recorded with provenance MISSING. It is not read as false, absent or negative.`,
        `facts[${index}]`,
      ),
    );
  });
  const accessOf = new Map(rows.sources.map((source) => [source.id, source.accessState]));
  for (const [field, list] of [
    ['sources', sources],
    ['policySources', policySources],
  ] as const) {
    list.forEach((entry, index) => {
      if (accessOf.get(entry.sourceId) !== 'UNAVAILABLE_AT_CHECK') return;
      missing.push(
        item(
          'SOURCE_UNAVAILABLE_AT_CHECK',
          `Source ${entry.sourceId} is recorded as unavailable at its access check.`,
          `${field}[${index}]`,
        ),
      );
    });
  }
  for (const { source, field, why } of tooLong) {
    missing.push(
      item(
        'SOURCE_MANIFEST_TEXT_TOO_LONG',
        `Source ${source.id} is part of this context, but its recorded ${why} exceeds the ${MANIFEST_TEXT_MAXIMUM} characters a manifest entry holds, so it is not listed rather than cut. Read it by its id.`,
        field,
      ),
    );
  }

  // ---- conflicts: recorded or structural, never resolved ----
  const referrers = (kind: 'item' | 'work' | 'mapping', id: string): string[] => [
    ...mappings
      .filter(
        (mapping) =>
          (kind === 'item' && mapping.reportedItemId === id) ||
          (kind === 'work' && mapping.caseWorkId === id),
      )
      .map((mapping) => `use mapping ${mapping.id}`),
    ...facts
      .filter(
        (fact) =>
          (kind === 'item' && fact.reportedItemId === id) ||
          (kind === 'work' && fact.caseWorkId === id) ||
          (kind === 'mapping' && fact.mappingId === id),
      )
      .map((fact) => `fact ${fact.id}`),
    ...[rows.parent, ...rows.priors]
      .filter((binding) => kind === 'item' && binding?.reportedItemId === id)
      .map((binding) => `binding ${binding?.id ?? ''}`),
  ];
  const archivedConflicts = (
    kind: 'item' | 'work' | 'mapping',
    label: string,
    field: string,
    list: ReadonlyArray<{ readonly id: string; readonly archivedAt: string | null }>,
  ) =>
    list.forEach((row, index) => {
      if (row.archivedAt === null) return;
      conflicts.push(
        item(
          'ARCHIVED_RECORD_REFERENCED',
          `${label} ${row.id} is archived; it is kept because ${referrers(kind, row.id).join(', ')} still names it.`,
          `${field}[${index}]`,
        ),
      );
    });
  archivedConflicts('item', 'Reported item', 'reportedItems', reportedItems);
  archivedConflicts('work', 'Work', 'works', works);
  archivedConflicts('mapping', 'Use mapping', 'mappings', mappings);
  mappings.forEach((mapping, index) => {
    if (mapping.provenance !== 'CONFLICT') return;
    conflicts.push(
      item(
        'MAPPING_PROVENANCE_CONFLICT',
        `Use mapping ${mapping.id} is recorded with provenance CONFLICT.`,
        `mappings[${index}]`,
      ),
    );
  });
  const linkById = new Map(rows.caseSources.map((link) => [link.id, link]));
  facts.forEach((fact, index) => {
    if (fact.provenance === 'CONFLICT') {
      conflicts.push(
        item(
          'FACT_PROVENANCE_CONFLICT',
          `Fact ${fact.id} (${fact.factType}) is recorded with provenance CONFLICT.`,
          `facts[${index}]`,
        ),
      );
    }
    if (fact.resolutionState === 'CONFLICT') {
      conflicts.push(
        item(
          'FACT_RESOLUTION_CONFLICT',
          `Fact ${fact.id} (${fact.factType}) is recorded with resolution state CONFLICT.`,
          `facts[${index}]`,
        ),
      );
    }
    for (const support of rows.factSources.filter((row) => row.factId === fact.id)) {
      const link = linkById.get(support.caseSourceId);
      if (!link || link.linkState === 'LINKED') continue;
      conflicts.push(
        item(
          'SUPPORT_LINK_NOT_LINKED',
          `A recorded support of fact ${fact.id} names case source ${link.id}, which is now ${link.linkState}. The support is kept as recorded.`,
          `facts[${index}]`,
        ),
      );
    }
  });
  for (const [field, list] of [
    ['sources', sources],
    ['policySources', policySources],
  ] as const) {
    list.forEach((entry, index) => {
      if (entry.provenance !== 'CONFLICT') return;
      conflicts.push(
        item(
          'SOURCE_PROVENANCE_CONFLICT',
          `Source ${entry.sourceId} is recorded with provenance CONFLICT.`,
          `${field}[${index}]`,
        ),
      );
    });
  }
  authority?.coverages.forEach((block, index) => {
    if (block.version.sourceReviewState === 'CONFLICT') {
      conflicts.push(
        item(
          'AUTHORITY_VERSION_REVIEW_CONFLICT',
          `Mandate version ${block.version.id} is recorded with source review state CONFLICT.`,
          `authority.coverages[${index}].version`,
        ),
      );
    }
    block.authorityEvents.forEach((event, eventIndex) => {
      if (event.provenance !== 'CONFLICT') return;
      conflicts.push(
        item(
          'AUTHORITY_EVENT_PROVENANCE_CONFLICT',
          `Authority event ${event.id} is recorded with provenance CONFLICT.`,
          `authority.coverages[${index}].authorityEvents[${eventIndex}]`,
        ),
      );
    });
  });

  const context: ProductionContext = {
    schemaVersion: PFC_SCHEMA_VERSION,
    caseId: caseRow.id,
    canonicalCaseId: caseRow.canonicalCaseId,
    taskType: scope.taskType,
    generationMode: scope.generationMode,
    caseContextRevision: caseRow.contextRevision,
    party: {
      agencyId: caseRow.agencyId,
      ownerId: rows.ownerSubject?.ownerId ?? null,
      legalSubjectId: rows.ownerSubject?.legalSubjectId ?? null,
      signerId: selection?.signerId ?? null,
      agencyLegalName: rows.agency.legalName,
      legalSubjectName: rows.legalSubject?.legalName ?? null,
      signerFullLegalName: rows.signer?.fullLegalName ?? null,
    },
    authoritySelectionId: selection?.id ?? null,
    reportedItems,
    works,
    mappings,
    facts,
    sources,
    parentBindingId: rows.parent?.id ?? null,
    priorCorrespondenceIds,
    missing,
    conflicts,
    sourcePrecedence: 'CANONICAL_PRIMARY_RECORDS_OVER_APP_DERIVATIVES',
    signatureState: 'HUMAN_PENDING',
    externalAction: 'PROHIBITED',
    scannerVerification: 'DISABLED',
    authority,
    correspondence,
    policySources,
  };
  const dependencies = dependenciesOf(rows);
  return {
    view: {
      contextRevision: caseRow.contextRevision,
      dependencyDigest: dependencyDigest(scope, dependencies),
      dependencies,
      context,
    },
    blocking: missing
      .map((entry) => entry.code)
      .filter((code) => DRAFTING_BLOCKING_CODES.includes(code)),
  };
}

/** Contracted maximum sizes of the arrays of a ContextView (TB-SCHEMA-API-v1.2.0). */
const LIMITS: ReadonlyArray<[string, (view: ContextView) => readonly unknown[][], number]> = [
  ['dependencies', (view) => [view.dependencies], 1000],
  ['reportedItems', (view) => [view.context.reportedItems], 100],
  ['works', (view) => [view.context.works], 100],
  ['mappings', (view) => [view.context.mappings], 1000],
  ['facts', (view) => [view.context.facts], 1000],
  ['sources', (view) => [view.context.sources], 1000],
  ['priorCorrespondenceIds', (view) => [view.context.priorCorrespondenceIds], 100],
  ['missing', (view) => [view.context.missing], 1000],
  ['conflicts', (view) => [view.context.conflicts], 1000],
  ['correspondence', (view) => [view.context.correspondence], 100],
  ['policySources', (view) => [view.context.policySources], 100],
  ['authority.coverages', (view) => [view.context.authority?.coverages ?? []], 20],
  [
    'authority.coverages.signerScopes',
    (view) => (view.context.authority?.coverages ?? []).map((block) => block.signerScopes),
    1000,
  ],
  [
    'authority.coverages.authorityEvents',
    (view) => (view.context.authority?.coverages ?? []).map((block) => block.authorityEvents),
    1000,
  ],
];

/** The first contracted array bound the view exceeds, or null (a context is never cut to fit). */
export function exceededLimit(
  view: ContextView,
): { field: string; count: number; maximum: number } | null {
  for (const [field, lists, maximum] of LIMITS) {
    for (const list of lists(view)) {
      if (list.length > maximum) return { field, count: list.length, maximum };
    }
  }
  return null;
}

/**
 * The refusals a production step applies to an assembled context before using it: a context above
 * a contracted bound is refused whole (409 PRODUCTION_CONTEXT_TOO_LARGE), never cut; DRAFTING needs
 * the Production Form Contract's required input — a reply without its named NMI parent is 422
 * REPLY_PARENT_REQUIRED, any other missing required input 422 DRAFTING_INPUT_MISSING, both naming
 * every blocking missing code. PREPARATION is never refused for gaps. Shared by
 * getProductionContext (P4D) and generatePrompt (P4E), so both apply exactly the same gate.
 */
export function assertDeliverable(
  view: ContextView,
  scope: ContextScope,
  blocking: readonly string[],
): void {
  const exceeded = exceededLimit(view);
  if (exceeded) {
    throw apiErrors.productionContextTooLarge(exceeded.field, exceeded.count, exceeded.maximum);
  }
  if (scope.generationMode === 'DRAFTING' && blocking.length > 0) {
    if (blocking.includes('REPLY_PARENT_NOT_SELECTED')) {
      throw apiErrors.replyParentRequired({
        field: 'parentBindingId',
        reason: 'NOT_SELECTED',
        missing: blocking,
      });
    }
    throw apiErrors.draftingInputMissing(blocking);
  }
}
