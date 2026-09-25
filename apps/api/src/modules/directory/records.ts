// Row locks and dependency checks of directory, representation, authority and case records.
//
// Lock order (INVARIANTS §5 "parent identities/versions sorted by stable type+ID before cases sorted
// by ID, then children"; "Mandate children always lock MandateVersion before the child; case
// children lock CaseRecord before the child"):
//   1. the directory and route identities in the alphabetical order of their entity type — Agency,
//      LegalSubject, Owner, OwnerSubject, Route, Signer;
//   2. the authority aggregate parent before child — Mandate, MandateVersion, MandateCoverage,
//      CoverageSigner (P3B);
//   3. CaseRecord, then its children — CaseSource, CaseAuthoritySelection (P4A), then the intake
//      material (P4B) parent before child: CaseWork, ReportedItem, UseMapping, CaseFact (a mapping
//      names a work and an item; a fact names a work, an item or a mapping). Every P4B write locks
//      its CaseRecord FOR UPDATE first, so the writes of one case are serialized;
//   4. SourceReference last.
// Rows of one type are locked in id order, and a transaction never locks a type that comes before
// one it already holds. Immutable columns (a version's mandate, a coverage's version and route, a
// route's agency and association) may be read before locking to find what to lock.
//
// Dependencies: a record is referenced when another persisted business record points at it through
// a foreign key (the complete FK inventory of the reviewed migration, guarded by a test) or through
// a JSON snapshot/history column (INVARIANTS §7: "inspect JSON snapshot references before deleting
// an otherwise unreferenced local draft"). Audit events and idempotency records are the record's
// own history and are not dependencies. With the target row locked FOR UPDATE, a concurrent insert
// that references it waits for the lock (its foreign-key check needs a shared lock on the row), and
// READ COMMITTED reads see every reference committed before the lock was granted.
import { Prisma } from '../../../generated/prisma/client.js';

export type RecordEntity =
  | 'Agency'
  | 'LegalSubject'
  | 'Owner'
  | 'OwnerSubject'
  | 'Route'
  | 'Signer'
  | 'Mandate'
  | 'MandateVersion'
  | 'MandateCoverage'
  | 'CoverageSigner'
  | 'CaseRecord'
  | 'CaseSource'
  | 'CaseAuthoritySelection'
  | 'CaseWork'
  | 'ReportedItem'
  | 'UseMapping'
  | 'CaseFact';

/** Table of every lockable record type (directory, representation, authority and case records). */
export const DIRECTORY_TABLES: Readonly<Record<RecordEntity, string>> = {
  Agency: 'agencies',
  LegalSubject: 'legal_subjects',
  Owner: 'owners',
  OwnerSubject: 'owner_subjects',
  Route: 'routes',
  Signer: 'signers',
  Mandate: 'mandates',
  MandateVersion: 'mandate_versions',
  MandateCoverage: 'mandate_coverages',
  CoverageSigner: 'coverage_signers',
  CaseRecord: 'cases',
  CaseSource: 'case_sources',
  CaseAuthoritySelection: 'case_authority_selections',
  CaseWork: 'case_works',
  ReportedItem: 'reported_items',
  UseMapping: 'use_mappings',
  CaseFact: 'case_facts',
};

export interface ColumnReference {
  readonly table: string;
  readonly column: string;
}

/** Every foreign key of the reviewed migration that points at one of the tables above. */
export const DIRECT_REFERENCES: Readonly<Record<RecordEntity, readonly ColumnReference[]>> = {
  Agency: [
    { table: 'cases', column: 'agency_id' },
    { table: 'correspondence', column: 'agency_id' },
    { table: 'mandates', column: 'agency_id' },
    { table: 'routes', column: 'agency_id' },
    { table: 'signers', column: 'agency_id' },
    { table: 'source_references', column: 'agency_id' },
  ],
  LegalSubject: [{ table: 'owner_subjects', column: 'legal_subject_id' }],
  Owner: [
    { table: 'cases', column: 'owner_hint_id' },
    { table: 'owner_subjects', column: 'owner_id' },
  ],
  OwnerSubject: [{ table: 'routes', column: 'owner_subject_id' }],
  Route: [
    { table: 'case_authority_selections', column: 'route_id' },
    { table: 'cases', column: 'route_id' },
    { table: 'mandate_coverages', column: 'route_id' },
  ],
  Signer: [
    { table: 'case_authority_selections', column: 'signer_id' },
    { table: 'coverage_signers', column: 'signer_id' },
    { table: 'routes', column: 'default_signer_id' },
  ],
  Mandate: [
    { table: 'authority_events', column: 'mandate_id' },
    { table: 'mandate_versions', column: 'mandate_id' },
  ],
  MandateVersion: [
    { table: 'mandate_coverages', column: 'mandate_version_id' },
    { table: 'mandate_versions', column: 'predecessor_id' },
  ],
  MandateCoverage: [
    { table: 'authority_events', column: 'coverage_id' },
    { table: 'case_authority_coverages', column: 'coverage_id' },
    { table: 'coverage_signers', column: 'coverage_id' },
    { table: 'mandate_coverages', column: 'predecessor_coverage_id' },
    { table: 'routes', column: 'preferred_coverage_id' },
  ],
  CoverageSigner: [],
  CaseRecord: [
    { table: 'case_authority_selections', column: 'case_id' },
    { table: 'case_facts', column: 'case_id' },
    { table: 'case_sources', column: 'case_id' },
    { table: 'case_works', column: 'case_id' },
    { table: 'correspondence_bindings', column: 'case_id' },
    { table: 'notice_candidates', column: 'case_id' },
    { table: 'prompt_snapshots', column: 'case_id' },
    { table: 'reported_items', column: 'case_id' },
    { table: 'use_mappings', column: 'case_id' },
  ],
  CaseSource: [
    { table: 'assessment_sources', column: 'case_source_id' },
    { table: 'fact_sources', column: 'case_source_id' },
  ],
  CaseAuthoritySelection: [
    { table: 'case_authority_coverages', column: 'selection_id' },
    { table: 'cases', column: 'current_authority_selection_id' },
    { table: 'prompt_snapshots', column: 'authority_selection_id' },
  ],
  CaseWork: [
    { table: 'case_facts', column: 'case_work_id' },
    { table: 'use_mappings', column: 'case_work_id' },
  ],
  ReportedItem: [
    { table: 'case_facts', column: 'reported_item_id' },
    { table: 'correspondence_bindings', column: 'reported_item_id' },
    { table: 'use_mappings', column: 'reported_item_id' },
  ],
  UseMapping: [{ table: 'case_facts', column: 'mapping_id' }],
  CaseFact: [
    { table: 'case_facts', column: 'supersedes_fact_id' },
    { table: 'fact_sources', column: 'fact_id' },
  ],
};

/**
 * JSON columns that can hold a snapshot, manifest or scope reference to a directory record: every
 * JSON column of the reviewed migration except the directory records' own data and the audit /
 * idempotency history (guarded by a test).
 */
export const SNAPSHOT_JSON_COLUMNS: readonly {
  readonly table: string;
  readonly columns: readonly string[];
}[] = [
  { table: 'candidate_assessments', columns: ['ask_dispositions'] },
  { table: 'case_facts', columns: ['value'] },
  { table: 'correspondence', columns: ['references', 'attachments_manifest'] },
  { table: 'coverage_signers', columns: ['action_scope'] },
  { table: 'mandate_coverages', columns: ['action_scope'] },
  { table: 'mandate_versions', columns: ['additional_source_refs', 'signed_dates_raw'] },
  { table: 'notice_candidates', columns: ['envelope_json', 'prepared_documents'] },
  {
    table: 'prompt_snapshots',
    columns: [
      'dependency_manifest',
      'context_json',
      'source_manifest',
      'missing_items',
      'conflicts',
    ],
  },
  { table: 'source_references', columns: ['scope_bindings'] },
  { table: 'use_mappings', columns: ['raw_timecodes'] },
  { table: 'validation_issues', columns: ['details'] },
  {
    table: 'validation_runs',
    columns: ['dependency_manifest', 'evaluated_context_json', 'coverage_manifest'],
  },
];

/** Tables whose JSON is deliberately not scanned (the records' own data and history). */
export const JSON_SCAN_EXCLUDED_TABLES: readonly string[] = [
  'agencies',
  'audit_events',
  'idempotency_records',
  'legal_subjects',
  'owners',
];

const quote = (identifier: string) => Prisma.raw(`\`${identifier}\``);

/** Locks the row FOR UPDATE; false when it does not exist. */
export async function lockForUpdate(
  tx: Prisma.TransactionClient,
  entity: RecordEntity,
  id: string,
): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT id FROM ${quote(DIRECTORY_TABLES[entity])} WHERE id = ${id} FOR UPDATE`,
  );
  return rows.length === 1;
}

/** Locks the row FOR SHARE (it may be referenced but not changed meanwhile); false when absent. */
export async function lockForShare(
  tx: Prisma.TransactionClient,
  entity: RecordEntity,
  id: string,
): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT id FROM ${quote(DIRECTORY_TABLES[entity])} WHERE id = ${id} FOR SHARE`,
  );
  return rows.length === 1;
}

/** `table.column` labels of the foreign keys through which another record references `id`. */
export async function directReferences(
  tx: Prisma.TransactionClient,
  entity: RecordEntity,
  id: string,
): Promise<string[]> {
  const found: string[] = [];
  for (const { table, column } of DIRECT_REFERENCES[entity]) {
    const rows = await tx.$queryRaw<Array<{ one: number }>>(
      Prisma.sql`SELECT 1 AS one FROM ${quote(table)} WHERE ${quote(column)} = ${id} LIMIT 1`,
    );
    if (rows.length > 0) found.push(`${table}.${column}`);
  }
  return found;
}

/** Tables whose snapshot/manifest JSON mentions `id` (a UUID: no LIKE wildcard characters). */
export async function snapshotReferences(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<string[]> {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('snapshotReferences expects a lowercase UUID');
  const pattern = `%${id}%`;
  const found: string[] = [];
  for (const { table, columns } of SNAPSHOT_JSON_COLUMNS) {
    const conditions = Prisma.join(
      columns.map((column) => Prisma.sql`CAST(${quote(column)} AS CHAR) LIKE ${pattern}`),
      ' OR ',
    );
    const rows = await tx.$queryRaw<Array<{ one: number }>>(
      Prisma.sql`SELECT 1 AS one FROM ${quote(table)} WHERE ${conditions} LIMIT 1`,
    );
    if (rows.length > 0) found.push(table);
  }
  return found;
}

export interface CanonicalFields {
  readonly canonicalCode: string | null;
  readonly canonicalSourceId: string | null;
  readonly bindingState: string;
}

export function hasCanonicalBinding(row: CanonicalFields): boolean {
  return (
    row.canonicalCode !== null ||
    row.canonicalSourceId !== null ||
    row.bindingState !== 'LOCAL_ONLY'
  );
}

/** Every relational and snapshot dependency of `id`, as delete blockers / establishment reasons. */
export async function dependencyReasons(
  tx: Prisma.TransactionClient,
  entity: RecordEntity,
  id: string,
): Promise<string[]> {
  const reasons = (await directReferences(tx, entity, id)).map((ref) => `REFERENCED_BY:${ref}`);
  for (const table of await snapshotReferences(tx, id)) reasons.push(`SNAPSHOT_REFERENCE:${table}`);
  return reasons;
}

/**
 * Why an Agency or LegalSubject is ESTABLISHED (decision D3): administrative state ACTIVE, an
 * existing canonical binding, or another persisted business record referencing it. Empty when it is
 * not established. There is no "established" column; this is evaluated under the row lock.
 */
export async function establishedBy(
  tx: Prisma.TransactionClient,
  entity: 'Agency' | 'LegalSubject',
  row: CanonicalFields & { readonly id: string; readonly recordState: string },
): Promise<string[]> {
  const reasons: string[] = [];
  if (row.recordState === 'ACTIVE') reasons.push('ACTIVE');
  if (hasCanonicalBinding(row)) reasons.push('CANONICAL_BINDING');
  reasons.push(...(await dependencyReasons(tx, entity, row.id)));
  return reasons;
}
