// The dependency closure of one production context and its digest (INVARIANTS §5 "Source/context
// drift", §6 "Exact bytes / digest contract").
//
// One Dependency per record the context is assembled from — the case, its party records, the
// selected authority chain (selection, pinned rows, coverages, versions, mandates, the selected
// signer's coverage-signer rows and the relevant authority events), the included intake records,
// fact revisions and their supports, the case sources and source revisions, the selected bindings
// and the captured messages — in (entityType, entityId) order. Its fingerprint is the SHA-256 of
// the TB canonical JSON v1 of the record's semantic content: operation metadata (createdAt,
// updatedAt, createdById, updatedById, rowVersion) and UI-only text (notes, a work's notes, archive
// reasons) are left out; actual fact, event and as-of dates are kept. Where a later record changes
// what a pinned record means without changing the record itself, the fingerprint also covers that
// later record's existence: the head of a source's revision chain, successor versions and coverages
// of a pinned coverage, the successor of a selected binding. Nothing is re-pointed to them.
// `rowVersion` is reported for version-checked records as a diagnostic only.
//
// dependencyDigest = SHA-256 of the TB canonical JSON v1 of { algorithm, contract, schemaVersion,
// scope, dependencies: [{ entityType, entityId, fingerprint }] }: the complete closure plus the
// request scope (task, mode, the named selection, parent and prior bindings as a sorted set) and
// the active contract and PFC identifiers — never merely CaseRecord.rowVersion, never a clock.
import { CONTRACT_BASELINE, PFC_SCHEMA_VERSION, type Dependency } from '@tb/contracts';
import { tbCanonicalSha256 } from '../../infrastructure/integrity/tb-canonical-json.js';
import { toPinnedCoverageView, toSelectionView } from '../cases/case-views.js';
import {
  toCaseFactView,
  toCaseWorkView,
  toFactSourceView,
  toReportedItemView,
  toUseMappingView,
} from '../cases/intake-views.js';
import {
  toCorrespondenceBindingView,
  toCorrespondenceView,
} from '../correspondence/correspondence-views.js';
import {
  toAuthorityEventView,
  toCoverageSignerView,
  toCoverageView,
  toMandateVersionView,
} from '../representation/authority-views.js';
import { toSourceView } from '../sources/source-views.js';
import type { ContextRows } from './context-snapshot.js';
import type { ContextScope } from './context-scope.js';

/** Identifier of this closure and digest definition (part of the digest). */
export const DEPENDENCY_DIGEST_ALGORITHM = 'TB-PRODUCTION-CONTEXT-DIGEST-v1';

type Content = Record<string, unknown>;

interface Entry {
  readonly entityType: string;
  readonly id: string;
  readonly rowVersion: number | null;
  readonly content: Content;
}

/** Operation metadata: when and by whom a row was written, and its version counter. */
const OPERATION_METADATA = ['createdAt', 'createdById', 'updatedAt', 'updatedById', 'rowVersion'];

/** A wire view without the named keys; an archive timestamp and reason become one `archived` flag. */
function semantic(view: object, omit: readonly string[] = []): Content {
  const content: Content = {};
  for (const [key, value] of Object.entries(view)) {
    if (OPERATION_METADATA.includes(key) || omit.includes(key)) continue;
    if (key === 'archiveReason') continue;
    if (key === 'archivedAt') {
      content['archived'] = value !== null;
      continue;
    }
    content[key] = value;
  }
  return content;
}

const archived = (row: { readonly archivedAt: Date | null }) => row.archivedAt !== null;

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The context's dependencies in (entityType, entityId) order, each with its fingerprint. */
export function dependenciesOf(rows: ContextRows): Dependency[] {
  const entries: Entry[] = [];
  const add = (entityType: string, id: string, rowVersion: number | null, content: Content) =>
    entries.push({ entityType, id, rowVersion, content });

  const c = rows.caseRow;
  add('CaseRecord', c.id, c.rowVersion, {
    id: c.id,
    agencyId: c.agencyId,
    platform: c.platform,
    caseClass: c.caseClass,
    routeId: c.routeId,
    ownerHintId: c.ownerHintId,
    canonicalCaseId: c.canonicalCaseId,
    canonicalBindingSourceId: c.canonicalBindingSourceId,
    currentAuthoritySelectionId: c.currentAuthoritySelectionId,
    packetSourceId: c.packetSourceId,
    driveFolderUrl: c.driveFolderUrl,
    contextRevision: c.contextRevision,
    archived: archived(c),
  });

  const a = rows.agency;
  add('Agency', a.id, a.rowVersion, {
    id: a.id,
    legalName: a.legalName,
    organizationType: a.organizationType,
    jurisdictionCountry: a.jurisdictionCountry,
    registrationAuthority: a.registrationAuthority,
    registrationNumber: a.registrationNumber,
    recordState: a.recordState,
    canonicalCode: a.canonicalCode,
    canonicalSourceId: a.canonicalSourceId,
    bindingState: a.bindingState,
    archived: archived(a),
  });

  const route = rows.route;
  if (route) {
    // Defaults (default signer, preferred coverage) are operational suggestions the context never
    // uses: they are not part of the route's fingerprint.
    add('Route', route.id, route.rowVersion, {
      id: route.id,
      agencyId: route.agencyId,
      ownerSubjectId: route.ownerSubjectId,
      platform: route.platform,
      linkState: route.linkState,
      canonicalCode: route.canonicalCode,
      canonicalSourceId: route.canonicalSourceId,
      bindingState: route.bindingState,
      archived: archived(route),
    });
  }
  const association = rows.ownerSubject;
  if (association) {
    add('OwnerSubject', association.id, association.rowVersion, {
      id: association.id,
      ownerId: association.ownerId,
      legalSubjectId: association.legalSubjectId,
      sourceId: association.sourceId,
      linkState: association.linkState,
    });
  }
  const owner = rows.owner;
  if (owner) {
    add('Owner', owner.id, owner.rowVersion, {
      id: owner.id,
      recordState: owner.recordState,
      canonicalCode: owner.canonicalCode,
      canonicalSourceId: owner.canonicalSourceId,
      bindingState: owner.bindingState,
      archived: archived(owner),
    });
  }
  const subject = rows.legalSubject;
  if (subject) {
    add('LegalSubject', subject.id, subject.rowVersion, {
      id: subject.id,
      subjectType: subject.subjectType,
      legalName: subject.legalName,
      legalForm: subject.legalForm,
      jurisdictionCountry: subject.jurisdictionCountry,
      registrationAuthority: subject.registrationAuthority,
      registrationNumber: subject.registrationNumber,
      identityReviewState: subject.identityReviewState,
      recordState: subject.recordState,
      canonicalCode: subject.canonicalCode,
      canonicalSourceId: subject.canonicalSourceId,
      bindingState: subject.bindingState,
      archived: archived(subject),
    });
  }

  if (rows.selection) {
    add(
      'CaseAuthoritySelection',
      rows.selection.id,
      null,
      semantic(toSelectionView(rows.selection)),
    );
  }
  const signer = rows.signer;
  if (signer) {
    add('Signer', signer.id, signer.rowVersion, {
      id: signer.id,
      agencyId: signer.agencyId,
      fullLegalName: signer.fullLegalName,
      title: signer.title,
      identitySourceId: signer.identitySourceId,
      delegationSourceId: signer.delegationSourceId,
      operationalState: signer.operationalState,
      canonicalCode: signer.canonicalCode,
      canonicalSourceId: signer.canonicalSourceId,
      bindingState: signer.bindingState,
      archived: archived(signer),
    });
  }
  for (const row of rows.pinned) {
    add('CaseAuthorityCoverage', row.id, null, semantic(toPinnedCoverageView(row)));
  }
  for (const row of rows.coverages) {
    add('MandateCoverage', row.id, row.rowVersion, {
      ...semantic(toCoverageView(row)),
      successorCoverageIds: rows.coverageSuccessors
        .filter((successor) => successor.predecessorCoverageId === row.id)
        .map((successor) => successor.id)
        .sort(byId),
    });
  }
  for (const row of rows.versions) {
    add('MandateVersion', row.id, row.rowVersion, {
      ...semantic(toMandateVersionView(row)),
      successorVersions: rows.versionSuccessors
        .filter((successor) => successor.predecessorId === row.id)
        .map((successor) => ({ id: successor.id, versionState: successor.versionState }))
        .sort((x, y) => byId(x.id, y.id)),
    });
  }
  for (const row of rows.mandates) {
    add('Mandate', row.id, row.rowVersion, {
      id: row.id,
      agencyId: row.agencyId,
      label: row.label,
      externalReference: row.externalReference,
      canonicalCode: row.canonicalCode,
      canonicalSourceId: row.canonicalSourceId,
      bindingState: row.bindingState,
      archived: archived(row),
    });
  }
  for (const row of rows.coverageSigners) {
    add('CoverageSigner', row.id, row.rowVersion, semantic(toCoverageSignerView(row)));
  }
  for (const row of rows.events) {
    add('AuthorityEvent', row.id, null, semantic(toAuthorityEventView(row)));
  }

  for (const row of rows.items) {
    add('ReportedItem', row.id, row.rowVersion, semantic(toReportedItemView(row)));
  }
  for (const row of rows.works) {
    // A work's notes are not case context (P4B): they move neither contextRevision nor the digest.
    add('CaseWork', row.id, row.rowVersion, semantic(toCaseWorkView(row), ['notes']));
  }
  for (const row of rows.mappings) {
    add('UseMapping', row.id, row.rowVersion, semantic(toUseMappingView(row)));
  }
  for (const row of rows.facts) {
    add('CaseFact', row.id, null, semantic(toCaseFactView(row)));
  }
  for (const row of rows.factSources) {
    add('FactSource', row.id, null, semantic(toFactSourceView(row)));
  }
  for (const row of rows.caseSources) {
    add('CaseSource', row.id, row.rowVersion, {
      id: row.id,
      caseId: row.caseId,
      sourceId: row.sourceId,
      useRole: row.useRole,
      scopeNote: row.scopeNote,
      linkState: row.linkState,
    });
  }
  for (const row of rows.sources) {
    add('SourceReference', row.id, null, {
      ...semantic(toSourceView(row)),
      headId: rows.sourceHeads.get(row.sourceGroupId) ?? row.id,
    });
  }
  for (const binding of [rows.parent, ...rows.priors]) {
    if (!binding) continue;
    // Selected bindings are the current interpretation when read (a corrected one is refused);
    // `successorId` records that, so a later correction changes the fingerprint.
    add('CorrespondenceBinding', binding.id, null, {
      ...semantic(toCorrespondenceBindingView(binding)),
      successorId: null,
    });
  }
  for (const row of rows.correspondence) {
    add('Correspondence', row.id, null, semantic(toCorrespondenceView(row)));
  }

  return entries
    .map((entry) => ({
      entityType: entry.entityType,
      entityId: entry.id,
      rowVersion: entry.rowVersion,
      fingerprint: tbCanonicalSha256({ entityType: entry.entityType, ...entry.content }),
    }))
    .sort((x, y) => byId(x.entityType, y.entityType) || byId(x.entityId, y.entityId));
}

/** The digest of the complete closure, the request scope and the active contract identifiers. */
export function dependencyDigest(scope: ContextScope, dependencies: readonly Dependency[]): string {
  return tbCanonicalSha256({
    algorithm: DEPENDENCY_DIGEST_ALGORITHM,
    contract: CONTRACT_BASELINE,
    schemaVersion: PFC_SCHEMA_VERSION,
    scope: {
      caseId: scope.caseId,
      taskType: scope.taskType,
      generationMode: scope.generationMode,
      authoritySelectionId: scope.authoritySelectionId,
      parentBindingId: scope.parentBindingId,
      priorBindingIds: [...scope.priorBindingIds].sort(byId),
    },
    dependencies: dependencies.map((dependency) => ({
      entityType: dependency.entityType,
      entityId: dependency.entityId,
      fingerprint: dependency.fingerprint,
    })),
  });
}
