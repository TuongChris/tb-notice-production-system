// The sources a production context lists, why each is there, and whether each applies to the case
// now (R14-AUD-009, R14-AUD-010; the correspondence part since R14-AUD-001).
//
// A context lists exactly the SourceReference revisions its records cite — never the registry — and
// `sourceCitations` names every such citation: one record of the context and the field that names
// the source. readContextRows reads exactly the cited sources, so every source a context lists has
// at least one citation, and `currentSourceApplicability` evaluates every one of them: nothing is
// listed without being checked against the case.
//
// Each citation was checked when its record was written, against that record's own target:
//   a mandate version's primary, additional and signed-date sources and a whole-mandate authority
//     event's source against the mandate's agency only (a mandate may span several routes and
//     legal subjects);
//   a captured message's raw and attachment sources against its agency only (a capture may be
//     bound into several cases);
//   a coverage's basis, a coverage signer's source and a coverage-scoped event's source against the
//     coverage's route;
//   the case's own citations — its canonical binding and packet sources, its case source links (and
//     so the fact supports naming them), mapping and selection bases — against the case.
// Valid when recorded is not the same as applicable to this case now: a source may be restricted to
// another legal subject than the one the case is bound to, and another owner's records may have
// started to use it since, by a valid later write outside this case. So every listed source is
// evaluated again, in the read's snapshot, against the case as that snapshot reads it — its agency,
// case scope, bound legal subject and owner — with the rules of a direct case citation
// (source-scope.ts applicabilityProblem: plain reads; nothing is locked, written or re-pointed). A
// source that does not apply is reported, never dropped, rewritten or refused, and nothing about
// the citing record or the source changes. The result is a source-scope condition only: never a
// finding about what the source shows, about authority, rights or any gate.
import type {
  AuthorityEvent,
  CaseAuthoritySelection,
  CaseRecord,
  CaseSource,
  Correspondence,
  CoverageSigner,
  FactSource,
  MandateCoverage,
  MandateVersion,
  Prisma,
  SourceReference,
  UseMapping,
} from '../../../generated/prisma/client.js';
import {
  applicabilityProblem,
  type ApplicabilityProblem,
  type SourceTarget,
} from '../sources/source-scope.js';

/** Every way a record of a context cites a source, in the order citations are collected. */
export const SOURCE_CITATION_KINDS = [
  'CASE_CANONICAL',
  'CASE_PACKET',
  'CASE_SOURCE',
  'FACT_SUPPORT',
  'MAPPING_BASIS',
  'SELECTION_BASIS',
  'MANDATE_VERSION_PRIMARY',
  'MANDATE_VERSION_ADDITIONAL',
  'MANDATE_VERSION_SIGNED_DATE',
  'COVERAGE_BASIS',
  'COVERAGE_SIGNER',
  'MANDATE_EVENT',
  'COVERAGE_EVENT',
  'CORRESPONDENCE_RAW',
  'CORRESPONDENCE_ATTACHMENT',
] as const;
export type SourceCitationKind = (typeof SOURCE_CITATION_KINDS)[number];

/** Citations by a captured message: reported one by one (CORRESPONDENCE_SOURCE_NOT_APPLICABLE). */
export const CORRESPONDENCE_CITATION_KINDS: ReadonlySet<SourceCitationKind> = new Set([
  'CORRESPONDENCE_RAW',
  'CORRESPONDENCE_ATTACHMENT',
]);

/** One record of the context naming one source. */
export interface SourceCitation {
  readonly sourceId: string;
  readonly kind: SourceCitationKind;
  /** The citing record: always a dependency of the context. */
  readonly parentEntityType: string;
  readonly parentEntityId: string;
  /** The field of that record naming the source (a fact support names its case source link). */
  readonly fieldPath: string;
  /** The citation in words, as a conflict message names it. */
  readonly description: string;
}

/** The records of one snapshot that can cite a source. */
export interface CitingRows {
  readonly caseRow: Pick<CaseRecord, 'id' | 'canonicalBindingSourceId' | 'packetSourceId'>;
  readonly caseSources: ReadonlyArray<Pick<CaseSource, 'id' | 'sourceId' | 'useRole'>>;
  readonly factSources: ReadonlyArray<Pick<FactSource, 'id' | 'factId' | 'caseSourceId'>>;
  readonly mappings: ReadonlyArray<Pick<UseMapping, 'id' | 'basisSourceId'>>;
  readonly selection: Pick<CaseAuthoritySelection, 'id' | 'basisSourceId'> | null;
  readonly versions: ReadonlyArray<
    Pick<MandateVersion, 'id' | 'primarySourceId' | 'additionalSourceRefs' | 'signedDatesRaw'>
  >;
  readonly coverages: ReadonlyArray<Pick<MandateCoverage, 'id' | 'basisSourceId'>>;
  readonly coverageSigners: ReadonlyArray<Pick<CoverageSigner, 'id' | 'sourceId'>>;
  readonly events: ReadonlyArray<Pick<AuthorityEvent, 'id' | 'sourceId' | 'coverageId'>>;
  readonly correspondence: ReadonlyArray<
    Pick<Correspondence, 'id' | 'rawSourceId' | 'attachmentsManifest'>
  >;
}

/** The source ids of a stored list of `{ sourceId }` entries, with their positions. */
function listedSources(value: Prisma.JsonValue | null): Array<[string, number]> {
  if (!Array.isArray(value)) return [];
  const listed: Array<[string, number]> = [];
  value.forEach((entry, index) => {
    const id = (entry as { sourceId?: unknown } | null)?.sourceId;
    if (typeof id === 'string') listed.push([id, index]);
  });
  return listed;
}

/**
 * Every citation of a source by the records of one snapshot, in a fixed order: the kinds in
 * SOURCE_CITATION_KINDS order, each in the order its rows are read (a message's raw source before
 * its attachments, in manifest order). A pure function: the same rows give the same citations.
 */
export function sourceCitations(rows: CitingRows): SourceCitation[] {
  const cited: SourceCitation[] = [];
  const cite = (
    sourceId: string,
    kind: SourceCitationKind,
    parentEntityType: string,
    parentEntityId: string,
    fieldPath: string,
    description: string,
  ) => cited.push({ sourceId, kind, parentEntityType, parentEntityId, fieldPath, description });

  const c = rows.caseRow;
  if (c.canonicalBindingSourceId !== null) {
    cite(
      c.canonicalBindingSourceId,
      'CASE_CANONICAL',
      'CaseRecord',
      c.id,
      'canonicalBindingSourceId',
      'the canonical binding source of the case',
    );
  }
  if (c.packetSourceId !== null) {
    cite(
      c.packetSourceId,
      'CASE_PACKET',
      'CaseRecord',
      c.id,
      'packetSourceId',
      'the packet source of the case',
    );
  }
  for (const link of rows.caseSources) {
    cite(
      link.sourceId,
      'CASE_SOURCE',
      'CaseSource',
      link.id,
      'sourceId',
      `case source link ${link.id} (${link.useRole})`,
    );
  }
  const linkById = new Map(rows.caseSources.map((link) => [link.id, link]));
  for (const support of rows.factSources) {
    const link = linkById.get(support.caseSourceId);
    if (link === undefined) throw new Error('a fact support names a case source outside the rows');
    cite(
      link.sourceId,
      'FACT_SUPPORT',
      'FactSource',
      support.id,
      'caseSourceId',
      `a recorded support of fact ${support.factId} (through case source link ${link.id})`,
    );
  }
  for (const mapping of rows.mappings) {
    if (mapping.basisSourceId === null) continue;
    cite(
      mapping.basisSourceId,
      'MAPPING_BASIS',
      'UseMapping',
      mapping.id,
      'basisSourceId',
      `the basis source of use mapping ${mapping.id}`,
    );
  }
  const selection = rows.selection;
  if (selection !== null && selection.basisSourceId !== null) {
    cite(
      selection.basisSourceId,
      'SELECTION_BASIS',
      'CaseAuthoritySelection',
      selection.id,
      'basisSourceId',
      `the basis source of authority selection ${selection.id}`,
    );
  }
  for (const version of rows.versions) {
    if (version.primarySourceId !== null) {
      cite(
        version.primarySourceId,
        'MANDATE_VERSION_PRIMARY',
        'MandateVersion',
        version.id,
        'primarySourceId',
        `the primary source of mandate version ${version.id}`,
      );
    }
    for (const [sourceId, index] of listedSources(version.additionalSourceRefs)) {
      cite(
        sourceId,
        'MANDATE_VERSION_ADDITIONAL',
        'MandateVersion',
        version.id,
        `additionalSourceRefs[${index}].sourceId`,
        `additional source ${index} of mandate version ${version.id}`,
      );
    }
    for (const [sourceId, index] of listedSources(version.signedDatesRaw)) {
      cite(
        sourceId,
        'MANDATE_VERSION_SIGNED_DATE',
        'MandateVersion',
        version.id,
        `signedDatesRaw[${index}].sourceId`,
        `the source of signed date ${index} of mandate version ${version.id}`,
      );
    }
  }
  for (const coverage of rows.coverages) {
    if (coverage.basisSourceId === null) continue;
    cite(
      coverage.basisSourceId,
      'COVERAGE_BASIS',
      'MandateCoverage',
      coverage.id,
      'basisSourceId',
      `the basis source of mandate coverage ${coverage.id}`,
    );
  }
  for (const row of rows.coverageSigners) {
    if (row.sourceId === null) continue;
    cite(
      row.sourceId,
      'COVERAGE_SIGNER',
      'CoverageSigner',
      row.id,
      'sourceId',
      `the source of coverage signer row ${row.id}`,
    );
  }
  for (const event of rows.events) {
    if (event.coverageId === null) {
      cite(
        event.sourceId,
        'MANDATE_EVENT',
        'AuthorityEvent',
        event.id,
        'sourceId',
        `the source of whole-mandate authority event ${event.id}`,
      );
    } else {
      cite(
        event.sourceId,
        'COVERAGE_EVENT',
        'AuthorityEvent',
        event.id,
        'sourceId',
        `the source of authority event ${event.id} of mandate coverage ${event.coverageId}`,
      );
    }
  }
  for (const message of rows.correspondence) {
    if (message.rawSourceId !== null) {
      cite(
        message.rawSourceId,
        'CORRESPONDENCE_RAW',
        'Correspondence',
        message.id,
        'rawSourceId',
        `the raw source of captured message ${message.id}`,
      );
    }
    for (const [sourceId, index] of listedSources(message.attachmentsManifest)) {
      cite(
        sourceId,
        'CORRESPONDENCE_ATTACHMENT',
        'Correspondence',
        message.id,
        `attachmentsManifest[${index}].sourceId`,
        `the source of attachment observation ${index} of captured message ${message.id}`,
      );
    }
  }
  return cited;
}

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Whether each listed source applies to the case now: one result per source (null when it
 * applies), however often it is cited, evaluated in the caller's snapshot against `target` — the
 * case with its bound route, or without one (a subject-scoped source is then CASE_SUBJECT_UNBOUND
 * and no subject is guessed). Plain reads only.
 */
export async function currentSourceApplicability(
  tx: Prisma.TransactionClient,
  sources: readonly SourceReference[],
  target: SourceTarget,
): Promise<Map<string, ApplicabilityProblem | null>> {
  const results = new Map<string, ApplicabilityProblem | null>();
  for (const source of [...sources].sort((x, y) => byId(x.id, y.id))) {
    results.set(source.id, await applicabilityProblem(tx, source, target));
  }
  return results;
}
