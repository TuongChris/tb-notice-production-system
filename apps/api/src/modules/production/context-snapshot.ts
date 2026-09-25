// The production context's one consistent read (INVARIANTS §5 "Get context uses a consistent
// database snapshot"). The service runs `readContextRows` inside one REPEATABLE READ transaction:
// InnoDB fixes the snapshot at the first read — the case row — and every later read of the request
// sees that same snapshot, so a case revision, its intake records, the selected authority chain,
// the sources and the correspondence can never come from different moments. Only plain SELECTs are
// issued: no lock, no write, no audit event, no idempotency record. Nothing outside the database is
// read (no URL, Drive, mailbox or AI call).
//
// Explicit selectors are checked here, against the same snapshot, and nothing is chosen for the
// caller: an unknown record is 422 REFERENCE_NOT_FOUND, another case's is 422 CROSS_CASE_REFERENCE,
// a parent that is not an NMI binding is 422 REPLY_PARENT_REQUIRED, a prior binding that is not
// recorded as sent is 422 PRIOR_BINDING_NOT_AS_SENT (a message's direction never makes one), and a
// corrected binding is 409 BINDING_ALREADY_SUPERSEDED naming its correction — which is never used
// in its place.
import type {
  Agency,
  AuthorityEvent,
  CaseAuthorityCoverage,
  CaseAuthoritySelection,
  CaseFact,
  CaseRecord,
  CaseSource,
  CaseWork,
  Correspondence,
  CorrespondenceBinding,
  CoverageSigner,
  FactSource,
  LegalSubject,
  Mandate,
  MandateCoverage,
  MandateVersion,
  Owner,
  OwnerSubject,
  Prisma,
  ReportedItem,
  Route,
  Signer,
  SourceReference,
  UseMapping,
} from '../../../generated/prisma/client.js';
import { apiErrors } from '../../infrastructure/http/api-error.js';
import type { ContextReadObserver } from './context-read-observer.js';
import type { ContextScope } from './context-scope.js';

type Tx = Prisma.TransactionClient;

/** Event types that record a past transmission (P4C): the only kinds a reply's prior binding has. */
export const AS_SENT_EVENTS: readonly string[] = [
  'INITIAL_AS_SENT',
  'REPLY_AS_SENT',
  'SUPPLEMENT_AS_SENT',
  'CORRECTION_AS_SENT',
];

/** Supports a fact revision holds at most (CreateFact / ReviseFact `sources`, R9). */
const MAX_SUPPORTS = 100;

export interface VersionSuccessor {
  readonly id: string;
  readonly predecessorId: string | null;
  readonly versionState: string;
}

export interface CoverageSuccessor {
  readonly id: string;
  readonly predecessorCoverageId: string | null;
}

/** Every row the context is assembled from, read in one snapshot. Arrays are in a fixed order. */
export interface ContextRows {
  readonly caseRow: CaseRecord;
  readonly agency: Agency;
  readonly route: Route | null;
  readonly ownerSubject: OwnerSubject | null;
  readonly owner: Owner | null;
  readonly legalSubject: LegalSubject | null;
  readonly selection: CaseAuthoritySelection | null;
  readonly signer: Signer | null;
  /** The selection's pinned CaseAuthorityCoverage rows, ascending coverageId. */
  readonly pinned: readonly CaseAuthorityCoverage[];
  readonly coverages: readonly MandateCoverage[];
  readonly versions: readonly MandateVersion[];
  readonly mandates: readonly Mandate[];
  /** The selected signer's CoverageSigner rows under the pinned coverages. */
  readonly coverageSigners: readonly CoverageSigner[];
  /** Whole-mandate events and events of a pinned coverage, of the pinned coverages' mandates. */
  readonly events: readonly AuthorityEvent[];
  readonly versionSuccessors: readonly VersionSuccessor[];
  readonly coverageSuccessors: readonly CoverageSuccessor[];
  /** Unarchived records of the case, plus archived ones an included record still names. */
  readonly items: readonly ReportedItem[];
  readonly works: readonly CaseWork[];
  readonly mappings: readonly UseMapping[];
  /** The current revision (chain head) of every fact chain of the case. */
  readonly facts: readonly CaseFact[];
  readonly factSources: readonly FactSource[];
  /** The case's LINKED case sources plus any other link a recorded support names. */
  readonly caseSources: readonly CaseSource[];
  readonly sources: readonly SourceReference[];
  /** sourceGroupId → id of the group's latest revision (head awareness; nothing is re-pointed). */
  readonly sourceHeads: ReadonlyMap<string, string>;
  readonly parent: CorrespondenceBinding | null;
  readonly priors: readonly CorrespondenceBinding[];
  readonly correspondence: readonly Correspondence[];
}

const RECORDING_ORDER = [{ createdAt: 'asc' as const }, { id: 'asc' as const }];

const distinct = <T>(values: readonly T[]): T[] => [...new Set(values)];
const present = <T>(value: T | null | undefined): value is T =>
  value !== null && value !== undefined;

/** A stored reference the schema or the writing service guarantees is broken: never shown. */
function integrity(holds: boolean): void {
  if (!holds) throw apiErrors.internal();
}

/** (createdAt, id) ascending, the order the rows were recorded in. */
export function byRecording<T extends { readonly createdAt: Date; readonly id: string }>(
  rows: readonly T[],
): T[] {
  return [...rows].sort(
    (a, b) =>
      a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

export async function readContextRows(
  tx: Tx,
  scope: ContextScope,
  observer: ContextReadObserver,
): Promise<ContextRows> {
  const caseRow = await tx.caseRecord.findUnique({ where: { id: scope.caseId } });
  if (!caseRow) throw apiErrors.notFound();
  await observer.afterSnapshot(scope.caseId);

  const selection =
    scope.authoritySelectionId === null
      ? null
      : await namedSelection(tx, caseRow.id, scope.authoritySelectionId);
  const parent =
    scope.parentBindingId === null
      ? null
      : await namedBinding(tx, caseRow.id, scope.parentBindingId, 'parentBindingId', 'parent');
  const priors: CorrespondenceBinding[] = [];
  for (const [index, id] of scope.priorBindingIds.entries()) {
    priors.push(await namedBinding(tx, caseRow.id, id, `priorBindingIds.${index}`, 'prior'));
  }

  // Party: the case's own agency and, only through its bound route, the route's association.
  const agency = await tx.agency.findUniqueOrThrow({ where: { id: caseRow.agencyId } });
  const route =
    caseRow.routeId === null
      ? null
      : await tx.route.findUniqueOrThrow({ where: { id: caseRow.routeId } });
  const ownerSubject =
    route === null
      ? null
      : await tx.ownerSubject.findUniqueOrThrow({ where: { id: route.ownerSubjectId } });
  const owner =
    ownerSubject === null
      ? null
      : await tx.owner.findUniqueOrThrow({ where: { id: ownerSubject.ownerId } });
  const legalSubject =
    ownerSubject === null
      ? null
      : await tx.legalSubject.findUniqueOrThrow({ where: { id: ownerSubject.legalSubjectId } });

  const authority = selection === null ? null : await authorityChain(tx, caseRow, selection);
  const bindings = [parent, ...priors].filter(present);
  const intake = await intakeRecords(tx, caseRow.id, bindings);
  const supports = await factSupports(tx, caseRow.id, intake.facts);
  const correspondence = await selectedCorrespondence(tx, caseRow.agencyId, bindings);

  const sourceIds = distinct(
    [
      caseRow.canonicalBindingSourceId,
      caseRow.packetSourceId,
      ...supports.caseSources.map((link) => link.sourceId),
      ...intake.mappings.map((mapping) => mapping.basisSourceId),
      selection?.basisSourceId,
      ...(authority === null ? [] : authoritySourceIds(authority)),
      ...correspondence.flatMap(correspondenceSourceIds),
    ].filter(present),
  );
  const sources =
    sourceIds.length === 0
      ? []
      : await tx.sourceReference.findMany({ where: { id: { in: sourceIds } } });
  integrity(sources.length === sourceIds.length);

  return {
    caseRow,
    agency,
    route,
    ownerSubject,
    owner,
    legalSubject,
    selection,
    signer: authority?.signer ?? null,
    pinned: authority?.pinned ?? [],
    coverages: authority?.coverages ?? [],
    versions: authority?.versions ?? [],
    mandates: authority?.mandates ?? [],
    coverageSigners: authority?.coverageSigners ?? [],
    events: authority?.events ?? [],
    versionSuccessors: authority?.versionSuccessors ?? [],
    coverageSuccessors: authority?.coverageSuccessors ?? [],
    ...intake,
    ...supports,
    sources,
    sourceHeads: await sourceHeads(tx, sources),
    parent,
    priors,
    correspondence,
  };
}

/** The selection the caller named: it must exist and be one of this case's. */
async function namedSelection(tx: Tx, caseId: string, id: string): Promise<CaseAuthoritySelection> {
  const row = await tx.caseAuthoritySelection.findUnique({ where: { id } });
  if (!row) throw apiErrors.referenceNotFound('authoritySelectionId');
  if (row.caseId !== caseId) throw apiErrors.crossCaseReference('authoritySelectionId', 'record');
  return row;
}

/**
 * A binding the caller named: it exists, is one of this case's, has the task's event type (the
 * parent an NMI, a prior binding one recorded as sent) and is the current interpretation of its
 * message — a corrected binding is refused, naming its correction, which is never used instead.
 */
async function namedBinding(
  tx: Tx,
  caseId: string,
  id: string,
  field: string,
  role: 'parent' | 'prior',
): Promise<CorrespondenceBinding> {
  const row = await tx.correspondenceBinding.findUnique({ where: { id } });
  if (!row) throw apiErrors.referenceNotFound(field);
  if (row.caseId !== caseId) throw apiErrors.crossCaseReference(field, 'record');
  if (role === 'parent' && row.eventType !== 'NMI') {
    throw apiErrors.replyParentRequired({ field, reason: 'NOT_NMI', eventType: row.eventType });
  }
  if (role === 'prior' && !AS_SENT_EVENTS.includes(row.eventType)) {
    throw apiErrors.priorBindingNotAsSent(field, row.eventType);
  }
  const successor = await tx.correspondenceBinding.findUnique({
    where: { supersedesBindingId: row.id },
    select: { id: true },
  });
  if (successor) throw apiErrors.selectedBindingSuperseded(field, successor.id);
  return row;
}

interface AuthorityRows {
  readonly signer: Signer;
  readonly pinned: CaseAuthorityCoverage[];
  readonly coverages: MandateCoverage[];
  readonly versions: MandateVersion[];
  readonly mandates: Mandate[];
  readonly coverageSigners: CoverageSigner[];
  readonly events: AuthorityEvent[];
  readonly versionSuccessors: VersionSuccessor[];
  readonly coverageSuccessors: CoverageSuccessor[];
}

/**
 * Exactly the chain the selection pinned (P4A): its signer, its CaseAuthorityCoverage rows and the
 * exact coverages and versions they name — never the route's preferred coverage or default signer,
 * a newer version or coverage, or a union of anything else. Relevant authority events are included
 * whenever they were recorded, before or after the selection: whole-mandate events and those of a
 * pinned coverage. Successor versions and coverages are read only to make their existence part of
 * the pinned records' fingerprints; they are not used in place of the pinned records.
 */
async function authorityChain(
  tx: Tx,
  caseRow: CaseRecord,
  selection: CaseAuthoritySelection,
): Promise<AuthorityRows> {
  // A selection pins the case's own route (P4A), which never changes once the case has history.
  integrity(selection.agencyId === caseRow.agencyId && selection.routeId === caseRow.routeId);
  const signer = await tx.signer.findUniqueOrThrow({ where: { id: selection.signerId } });
  const pinned = await tx.caseAuthorityCoverage.findMany({
    where: { selectionId: selection.id },
    orderBy: [{ coverageId: 'asc' }],
  });
  integrity(pinned.length >= 1);
  const coverageIds = pinned.map((row) => row.coverageId);
  const coverages = await tx.mandateCoverage.findMany({ where: { id: { in: coverageIds } } });
  integrity(coverages.length === coverageIds.length);
  const versionIds = distinct(coverages.map((row) => row.mandateVersionId));
  const versions = await tx.mandateVersion.findMany({ where: { id: { in: versionIds } } });
  integrity(versions.length === versionIds.length);
  const mandateIds = distinct(versions.map((row) => row.mandateId));
  const mandates = await tx.mandate.findMany({ where: { id: { in: mandateIds } } });
  integrity(mandates.length === mandateIds.length);
  const coverageSigners = await tx.coverageSigner.findMany({
    where: { coverageId: { in: coverageIds }, signerId: selection.signerId },
    orderBy: RECORDING_ORDER,
  });
  const events = await tx.authorityEvent.findMany({
    where: {
      mandateId: { in: mandateIds },
      OR: [{ coverageId: null }, { coverageId: { in: coverageIds } }],
    },
    orderBy: RECORDING_ORDER,
  });
  const versionSuccessors = await tx.mandateVersion.findMany({
    where: { predecessorId: { in: versionIds } },
    select: { id: true, predecessorId: true, versionState: true },
  });
  const coverageSuccessors = await tx.mandateCoverage.findMany({
    where: { predecessorCoverageId: { in: coverageIds } },
    select: { id: true, predecessorCoverageId: true },
  });
  return {
    signer,
    pinned,
    coverages,
    versions,
    mandates,
    coverageSigners,
    events,
    versionSuccessors,
    coverageSuccessors,
  };
}

function authoritySourceIds(authority: AuthorityRows): Array<string | null | undefined> {
  const listed = (value: unknown): string[] =>
    Array.isArray(value)
      ? value
          .map((entry) => (entry as { sourceId?: unknown }).sourceId)
          .filter((id): id is string => typeof id === 'string')
      : [];
  return [
    ...authority.versions.flatMap((version) => [
      version.primarySourceId,
      ...listed(version.additionalSourceRefs),
      ...listed(version.signedDatesRaw),
    ]),
    ...authority.coverages.map((coverage) => coverage.basisSourceId),
    ...authority.coverageSigners.map((row) => row.sourceId),
    ...authority.events.map((event) => event.sourceId),
  ];
}

function correspondenceSourceIds(row: Correspondence): Array<string | null | undefined> {
  const attachments = Array.isArray(row.attachmentsManifest) ? row.attachmentsManifest : [];
  return [
    row.rawSourceId,
    ...attachments.map((entry) => {
      const id = (entry as { sourceId?: unknown }).sourceId;
      return typeof id === 'string' ? id : null;
    }),
  ];
}

interface IntakeRows {
  readonly items: ReportedItem[];
  readonly works: CaseWork[];
  readonly mappings: UseMapping[];
  readonly facts: CaseFact[];
}

/**
 * The case's unarchived reported items, works and use mappings and the current revision of each
 * fact chain. An archived record is not part of the context unless an included record still names
 * it — a fact's scope, a mapping's work or item, a selected binding's item — and then it is kept,
 * with its archive state as recorded, rather than silently dropped. Every row is of this case.
 */
async function intakeRecords(
  tx: Tx,
  caseId: string,
  bindings: readonly CorrespondenceBinding[],
): Promise<IntakeRows> {
  const items = await tx.reportedItem.findMany({
    where: { caseId, archivedAt: null },
    orderBy: RECORDING_ORDER,
  });
  const works = await tx.caseWork.findMany({
    where: { caseId, archivedAt: null },
    orderBy: RECORDING_ORDER,
  });
  const mappings = await tx.useMapping.findMany({
    where: { caseId, archivedAt: null },
    orderBy: RECORDING_ORDER,
  });
  const facts = await tx.caseFact.findMany({
    where: { caseId, caseFact_supersedesFact: { is: null } },
    orderBy: RECORDING_ORDER,
  });

  const mappingIds = new Set(mappings.map((row) => row.id));
  const keptMappingIds = distinct(
    facts
      .map((fact) => fact.mappingId)
      .filter((id): id is string => present(id) && !mappingIds.has(id)),
  );
  const keptMappings = await kept(keptMappingIds, (ids) =>
    tx.useMapping.findMany({ where: { id: { in: ids }, caseId } }),
  );
  const allMappings = [...mappings, ...keptMappings];

  const workIds = new Set(works.map((row) => row.id));
  const keptWorkIds = distinct(
    [...allMappings.map((row) => row.caseWorkId), ...facts.map((fact) => fact.caseWorkId)].filter(
      (id): id is string => present(id) && !workIds.has(id),
    ),
  );
  const keptWorks = await kept(keptWorkIds, (ids) =>
    tx.caseWork.findMany({ where: { id: { in: ids }, caseId } }),
  );

  const itemIds = new Set(items.map((row) => row.id));
  const keptItemIds = distinct(
    [
      ...allMappings.map((row) => row.reportedItemId),
      ...facts.map((fact) => fact.reportedItemId),
      ...bindings.map((binding) => binding.reportedItemId),
    ].filter((id): id is string => present(id) && !itemIds.has(id)),
  );
  const keptItems = await kept(keptItemIds, (ids) =>
    tx.reportedItem.findMany({ where: { id: { in: ids }, caseId } }),
  );

  return {
    items: byRecording([...items, ...keptItems]),
    works: byRecording([...works, ...keptWorks]),
    mappings: byRecording(allMappings),
    facts,
  };
}

/** Records named by included records: each must exist in this case (composite keys guarantee it). */
async function kept<T>(
  ids: readonly string[],
  load: (ids: string[]) => Promise<T[]>,
): Promise<T[]> {
  if (ids.length === 0) return [];
  const rows = await load([...ids]);
  integrity(rows.length === ids.length);
  return rows;
}

interface SupportRows {
  readonly factSources: FactSource[];
  readonly caseSources: CaseSource[];
}

/**
 * The FactSource rows of the included fact revisions (R9: exactly as recorded, never merged across
 * revisions) and the case sources of the context: every LINKED link of the case and any link a
 * support names whatever its present state — a paused or unlinked link does not erase a recorded
 * support. A support naming another case's link, or more than 100 on a revision, is never shown.
 */
async function factSupports(
  tx: Tx,
  caseId: string,
  facts: readonly CaseFact[],
): Promise<SupportRows> {
  const factSources =
    facts.length === 0
      ? []
      : await tx.factSource.findMany({
          where: { factId: { in: facts.map((fact) => fact.id) } },
          orderBy: RECORDING_ORDER,
        });
  const perFact = new Map<string, number>();
  for (const row of factSources) perFact.set(row.factId, (perFact.get(row.factId) ?? 0) + 1);
  integrity([...perFact.values()].every((count) => count <= MAX_SUPPORTS));
  const linked = await tx.caseSource.findMany({
    where: { caseId, linkState: 'LINKED' },
    orderBy: RECORDING_ORDER,
  });
  const linkedIds = new Set(linked.map((row) => row.id));
  const citedIds = distinct(
    factSources.map((row) => row.caseSourceId).filter((id) => !linkedIds.has(id)),
  );
  const cited =
    citedIds.length === 0 ? [] : await tx.caseSource.findMany({ where: { id: { in: citedIds } } });
  integrity(cited.length === citedIds.length && cited.every((row) => row.caseId === caseId));
  return { factSources, caseSources: byRecording([...linked, ...cited]) };
}

/** The captured messages the selected bindings name (one row per message, of the case's agency). */
async function selectedCorrespondence(
  tx: Tx,
  agencyId: string,
  bindings: readonly CorrespondenceBinding[],
): Promise<Correspondence[]> {
  const ids = distinct(bindings.map((binding) => binding.correspondenceId));
  if (ids.length === 0) return [];
  const rows = await tx.correspondence.findMany({
    where: { id: { in: ids } },
    orderBy: RECORDING_ORDER,
  });
  integrity(rows.length === ids.length && rows.every((row) => row.agencyId === agencyId));
  return rows;
}

/** The latest revision of each source group in the context (read only to be fingerprinted). */
async function sourceHeads(
  tx: Tx,
  sources: readonly SourceReference[],
): Promise<Map<string, string>> {
  const groups = distinct(sources.map((source) => source.sourceGroupId));
  const heads = new Map<string, { id: string; revision: number }>();
  if (groups.length > 0) {
    const revisions = await tx.sourceReference.findMany({
      where: { sourceGroupId: { in: groups } },
      select: { id: true, sourceGroupId: true, revision: true },
    });
    for (const row of revisions) {
      const head = heads.get(row.sourceGroupId);
      if (!head || row.revision > head.revision) {
        heads.set(row.sourceGroupId, { id: row.id, revision: row.revision });
      }
    }
  }
  return new Map([...heads].map(([group, head]) => [group, head.id]));
}
