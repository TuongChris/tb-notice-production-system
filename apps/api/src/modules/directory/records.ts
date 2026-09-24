// Row locks and dependency checks of directory records.
//
// Lock order (INVARIANTS §5 "parent identities … sorted by stable type+ID"): rows are locked in the
// alphabetical order of their entity type — Agency, LegalSubject, Owner, OwnerSubject, Signer — and
// a transaction never locks a type that sorts before one it already holds.
//
// Dependencies: a record is referenced when another persisted business record points at it through
// a foreign key (the complete FK inventory of the reviewed migration, guarded by a test) or through
// a JSON snapshot/history column (INVARIANTS §7: "inspect JSON snapshot references before deleting
// an otherwise unreferenced local draft"). Audit events and idempotency records are the record's
// own history and are not dependencies. With the target row locked FOR UPDATE, a concurrent insert
// that references it waits for the lock (its foreign-key check needs a shared lock on the row), and
// READ COMMITTED reads see every reference committed before the lock was granted.
import { Prisma } from '../../../generated/prisma/client.js';

export type DirectoryEntity = 'Agency' | 'LegalSubject' | 'Owner' | 'OwnerSubject' | 'Signer';

export const DIRECTORY_TABLES: Readonly<Record<DirectoryEntity, string>> = {
  Agency: 'agencies',
  LegalSubject: 'legal_subjects',
  Owner: 'owners',
  OwnerSubject: 'owner_subjects',
  Signer: 'signers',
};

export interface ColumnReference {
  readonly table: string;
  readonly column: string;
}

/** Every foreign key of the reviewed migration that points at a directory table. */
export const DIRECT_REFERENCES: Readonly<Record<DirectoryEntity, readonly ColumnReference[]>> = {
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
  Signer: [
    { table: 'case_authority_selections', column: 'signer_id' },
    { table: 'coverage_signers', column: 'signer_id' },
    { table: 'routes', column: 'default_signer_id' },
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
  entity: DirectoryEntity,
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
  entity: DirectoryEntity,
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
  entity: DirectoryEntity,
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
  entity: DirectoryEntity,
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
