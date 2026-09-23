// Support for P0 database structural tests (P0 Bootstrap Contract §7).
// Target: tb_notice_test only, via the tb_migrate tooling account (decision D3); resolved through
// the same allowlist as every other DB helper. All test data is synthetic and every test runs in a
// transaction that is always rolled back, so no test row survives.
import { randomUUID } from 'node:crypto';
import { createConnection, type Connection, type SqlError } from 'mariadb';
import { expect } from 'vitest';
import { driverConfig, loadRootEnv, resolveTarget } from '../../scripts/db/lib/targets.mjs';

export const ER_DUP_ENTRY = 1062;
export const ER_DATA_TOO_LONG = 1406;
export const ER_ROW_IS_REFERENCED_2 = 1451;
export const ER_NO_REFERENCED_ROW_2 = 1452;
export const ER_WARN_DATA_OUT_OF_RANGE = 1264;
export const ER_CHECK_CONSTRAINT_VIOLATED = 3819;

/** Marker stored in the synthetic actor's password_hash: not a hash, cannot authenticate. */
export const DISABLED_ACTOR_MARKER = '!P0-SYNTHETIC-DISABLED-ACTOR-NO-CREDENTIAL';

export async function openTestConnection(): Promise<{ conn: Connection; label: string }> {
  loadRootEnv();
  const resolved = resolveTarget('test', ['test']);
  const conn = await createConnection({ ...driverConfig(resolved), bigIntAsNumber: false });
  return { conn, label: resolved.label };
}

export const id = (): string => randomUUID();

type Row = Record<string, unknown>;

export async function insert(conn: Connection, table: string, row: Row): Promise<void> {
  const columns = Object.keys(row);
  const sql =
    `INSERT INTO \`${table}\` (${columns.map((c) => `\`${c}\``).join(', ')}) ` +
    `VALUES (${columns.map(() => '?').join(', ')})`;
  await conn.query(sql, Object.values(row));
}

/** Runs `fn` inside a transaction that is always rolled back. */
export async function inRolledBackTransaction(
  conn: Connection,
  fn: () => Promise<void>,
): Promise<void> {
  await conn.beginTransaction();
  try {
    await fn();
  } finally {
    await conn.rollback();
  }
}

/** Asserts that `action` fails with MySQL `errno` and that the message names `mention`. */
export async function expectSqlError(
  action: Promise<unknown>,
  errno: number,
  mention: string,
): Promise<SqlError> {
  let error: unknown;
  try {
    await action;
  } catch (caught) {
    error = caught;
  }
  if (error === undefined) {
    throw new Error(`Expected MySQL error ${errno} (${mention}) but the statement succeeded.`);
  }
  const sqlError = error as SqlError;
  expect(sqlError.errno, sqlError.message).toBe(errno);
  expect(sqlError.sqlMessage ?? sqlError.message).toContain(mention);
  return sqlError;
}

const now = (): Date => new Date();
const sha = (ch: string): string => ch.repeat(64);

/** Synthetic fixture graph used by the structural tests (created inside the test transaction). */
export interface Graph {
  actor: string;
  agencyA: string;
  agencyB: string;
  owner: string;
  subject: string;
  ownerSubject: string;
  signerA: string;
  signerB: string;
  routeA: string;
  mandateA: string;
  versionA: string;
  mandateB: string;
  versionB: string;
  coverageA: string;
  caseA: string;
  caseB: string;
  workA: string;
  itemA: string;
  itemB: string;
  mappingA: string;
  promptA: string;
  candidateA: string;
}

export const audit = (actor: string): Row => ({
  created_by_id: actor,
  updated_at: now(),
  updated_by_id: actor,
});

export async function seedGraph(conn: Connection): Promise<Graph> {
  const g: Graph = {
    actor: id(),
    agencyA: id(),
    agencyB: id(),
    owner: id(),
    subject: id(),
    ownerSubject: id(),
    signerA: id(),
    signerB: id(),
    routeA: id(),
    mandateA: id(),
    versionA: id(),
    mandateB: id(),
    versionB: id(),
    coverageA: id(),
    caseA: id(),
    caseB: id(),
    workA: id(),
    itemA: id(),
    itemB: id(),
    mappingA: id(),
    promptA: id(),
    candidateA: id(),
  };
  // Disabled synthetic actor for createdBy/updatedBy FKs only (AR-013); not an admin or signer.
  await insert(conn, 'users', {
    id: g.actor,
    email: `p0-structural-${g.actor}@example.invalid`,
    display_name: 'P0 structural test actor (synthetic, disabled)',
    password_hash: DISABLED_ACTOR_MARKER,
    enabled: false,
  });
  const a = audit(g.actor);
  await insert(conn, 'agencies', { id: g.agencyA, display_name: 'SYNTHETIC Agency A', ...a });
  await insert(conn, 'agencies', { id: g.agencyB, display_name: 'SYNTHETIC Agency B', ...a });
  await insert(conn, 'owners', { id: g.owner, display_name: 'SYNTHETIC Owner', ...a });
  await insert(conn, 'legal_subjects', {
    id: g.subject,
    subject_type: 'LEGAL_ENTITY',
    legal_name: 'SYNTHETIC Subject One',
    ...a,
  });
  await insert(conn, 'owner_subjects', {
    id: g.ownerSubject,
    owner_id: g.owner,
    legal_subject_id: g.subject,
    ...a,
  });
  await insert(conn, 'signers', {
    id: g.signerA,
    agency_id: g.agencyA,
    full_legal_name: 'SYNTHETIC Signer A',
    ...a,
  });
  await insert(conn, 'signers', {
    id: g.signerB,
    agency_id: g.agencyB,
    full_legal_name: 'SYNTHETIC Signer B',
    ...a,
  });
  await insert(conn, 'routes', {
    id: g.routeA,
    agency_id: g.agencyA,
    owner_subject_id: g.ownerSubject,
    default_signer_id: g.signerA,
    ...a,
  });
  await insert(conn, 'mandates', {
    id: g.mandateA,
    agency_id: g.agencyA,
    label: 'SYNTHETIC mandate A',
    ...a,
  });
  await insert(conn, 'mandate_versions', {
    id: g.versionA,
    mandate_id: g.mandateA,
    agency_id: g.agencyA,
    version: 1,
    change_kind: 'NEW_AUTHORIZATION',
    change_reason: 'synthetic fixture',
    ...a,
  });
  await insert(conn, 'mandates', {
    id: g.mandateB,
    agency_id: g.agencyB,
    label: 'SYNTHETIC mandate B',
    ...a,
  });
  await insert(conn, 'mandate_versions', {
    id: g.versionB,
    mandate_id: g.mandateB,
    agency_id: g.agencyB,
    version: 1,
    change_kind: 'NEW_AUTHORIZATION',
    change_reason: 'synthetic fixture',
    ...a,
  });
  await insert(conn, 'mandate_coverages', {
    id: g.coverageA,
    mandate_version_id: g.versionA,
    route_id: g.routeA,
    agency_id: g.agencyA,
    coverage_label: 'synthetic coverage A',
    ...a,
  });
  await insert(conn, 'cases', {
    id: g.caseA,
    agency_id: g.agencyA,
    intake_label: 'SYNTHETIC case A',
    route_id: g.routeA,
    ...a,
  });
  await insert(conn, 'cases', {
    id: g.caseB,
    agency_id: g.agencyA,
    intake_label: 'SYNTHETIC case B (unbound intake)',
    ...a,
  });
  await insert(conn, 'case_works', {
    id: g.workA,
    case_id: g.caseA,
    title: 'SYNTHETIC work A',
    ...a,
  });
  await insert(conn, 'reported_items', reportedItem(g, g.itemA, g.caseA, 'P0synthA001'));
  await insert(conn, 'reported_items', reportedItem(g, g.itemB, g.caseB, 'P0synthB001'));
  await insert(conn, 'use_mappings', {
    id: g.mappingA,
    case_id: g.caseA,
    case_work_id: g.workA,
    reported_item_id: g.itemA,
    occurrence: 1,
    ...a,
  });
  await insert(conn, 'prompt_snapshots', promptSnapshot(g, g.promptA, g.caseA));
  await insert(conn, 'notice_candidates', candidate(g, g.candidateA, g.caseA, g.promptA));
  return g;
}

export function reportedItem(g: Graph, itemId: string, caseId: string, externalId: string): Row {
  // Synthetic identifiers only; URLs are stored text and are never dereferenced.
  return {
    id: itemId,
    case_id: caseId,
    raw_url: `https://www.youtube.com/watch?v=${externalId}`,
    normalized_url: `https://www.youtube.com/watch?v=${externalId}`,
    external_item_id: externalId,
    ...audit(g.actor),
  };
}

export function mapping(g: Graph, overrides: Row = {}): Row {
  return {
    id: id(),
    case_id: g.caseA,
    case_work_id: g.workA,
    reported_item_id: g.itemA,
    occurrence: 2,
    ...audit(g.actor),
    ...overrides,
  };
}

export function promptSnapshot(
  g: Graph,
  promptId: string,
  caseId: string,
  overrides: Row = {},
): Row {
  return {
    id: promptId,
    case_id: caseId,
    task_type: 'INITIAL',
    generation_mode: 'PREPARATION',
    version: 1,
    contract_version: 'PFC-YT-EMAIL-v1.1',
    template_version: 'SYNTHETIC-TEST',
    context_revision: 1,
    dependency_digest: sha('a'),
    dependency_manifest: '{}',
    context_json: '{}',
    source_manifest: '[]',
    missing_items: '[]',
    conflicts: '[]',
    rendered_prompt: 'SYNTHETIC structural-test prompt',
    prompt_sha256: sha('b'),
    created_by_id: g.actor,
    ...overrides,
  };
}

export function candidate(
  g: Graph,
  candidateId: string,
  caseId: string,
  promptId: string,
  overrides: Row = {},
): Row {
  return {
    id: candidateId,
    case_id: caseId,
    prompt_snapshot_id: promptId,
    version: 1,
    task_type: 'INITIAL',
    subject: 'SYNTHETIC structural-test subject',
    envelope_json: '{}',
    body_text: 'SYNTHETIC body\n[PENDING AUTHORIZED SIGNER — FULL LEGAL NAME REQUIRED]\n',
    body_sha256: sha('c'),
    artifact_sha256: sha('d'),
    prepared_documents: '[]',
    created_by_id: g.actor,
    ...overrides,
  };
}

export function validationRun(g: Graph, overrides: Row = {}): Row {
  const started = new Date('2026-09-23T10:00:00.000Z');
  return {
    id: id(),
    candidate_id: g.candidateA,
    case_id: g.caseA,
    artifact_sha256: sha('d'),
    dependency_digest: sha('a'),
    dependency_manifest: '{}',
    evaluated_context_json: '{}',
    ruleset_version: 'SYNTHETIC-TEST',
    result: 'ERROR',
    coverage_manifest: '{}',
    blocker_count: 0,
    review_required_count: 0,
    warning_count: 0,
    started_at: started,
    completed_at: started,
    created_by_id: g.actor,
    ...overrides,
  };
}

export async function countRows(
  conn: Connection,
  table: string,
  where = '1=1',
  params: unknown[] = [],
) {
  const [row] = (await conn.query(
    { sql: `SELECT COUNT(*) AS n FROM \`${table}\` WHERE ${where}`, bigIntAsNumber: true },
    params,
  )) as Array<{ n: number }>;
  return Number(row?.n ?? 0);
}
