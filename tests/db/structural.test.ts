// P0-C7 database structural tests on tb_notice_test (P0 Bootstrap Contract §7).
//
// Scope: behaviour that MySQL itself enforces for the reviewed initial migration — foreign keys
// (simple and composite same-agency/same-case), unique keys, RESTRICT, binary collation, Unicode
// storage, transactions and the 30 CHECK constraints (representative members per family; the
// metadata verifier proves every constraint exists and is ENFORCED).
//
// Not in scope and never claimed here: API/service rules from INVARIANTS §3 (scope consistency,
// freeze lifecycle, source authorization, successor rules, snapshot delete guards, readiness).
// The "service-layer" block below demonstrates that MySQL ACCEPTS such rows, i.e. those rules are
// NOT database-enforced and remain later-phase service obligations.
//
// Every test body runs inside a transaction that is always rolled back; data is synthetic.
import type { Connection } from 'mariadb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  audit,
  candidate,
  countRows,
  DISABLED_ACTOR_MARKER,
  ER_CHECK_CONSTRAINT_VIOLATED,
  ER_DATA_TOO_LONG,
  ER_DUP_ENTRY,
  ER_NO_REFERENCED_ROW_2,
  ER_ROW_IS_REFERENCED_2,
  ER_WARN_DATA_OUT_OF_RANGE,
  expectSqlError,
  id,
  inRolledBackTransaction,
  insert,
  mapping,
  openTestConnection,
  promptSnapshot,
  reportedItem,
  seedGraph,
  validationRun,
} from './support.js';

const DOMAIN_TABLES = [
  'agencies',
  'assessment_sources',
  'audit_events',
  'auth_sessions',
  'authority_events',
  'candidate_assessments',
  'case_authority_coverages',
  'case_authority_selections',
  'case_facts',
  'case_sources',
  'case_works',
  'cases',
  'correspondence',
  'correspondence_bindings',
  'coverage_signers',
  'fact_sources',
  'idempotency_records',
  'legal_subjects',
  'mandate_coverages',
  'mandate_versions',
  'mandates',
  'notice_candidates',
  'owner_subjects',
  'owners',
  'prompt_snapshots',
  'reported_items',
  'routes',
  'signers',
  'source_references',
  'use_mappings',
  'users',
  'validation_issues',
  'validation_runs',
];

let conn: Connection;

async function totalDomainRows(): Promise<number> {
  let total = 0;
  for (const table of DOMAIN_TABLES) total += await countRows(conn, table);
  return total;
}

beforeAll(async () => {
  ({ conn } = await openTestConnection());
  const [session] = (await conn.query(
    'SELECT DATABASE() AS db, CURRENT_USER() AS user, @@session.time_zone AS tz, @@session.collation_connection AS coll',
  )) as Array<{ db: string; user: string; tz: string; coll: string }>;
  expect(session).toEqual({
    db: 'tb_notice_test',
    user: 'tb_migrate@%',
    tz: '+00:00',
    coll: 'utf8mb4_0900_bin',
  });
  expect(DOMAIN_TABLES).toHaveLength(33);
  // Fail closed: the tests only ever touch rows they create, and they start from an empty schema.
  expect(await totalDomainRows()).toBe(0);
});

afterAll(async () => {
  if (!conn) return;
  try {
    // Every test rolled back: no synthetic row may remain.
    expect(await totalDomainRows()).toBe(0);
  } finally {
    await conn.end();
  }
});

const tx = (fn: () => Promise<void>) => () => inRolledBackTransaction(conn, fn);

describe('S01 simple foreign keys', () => {
  it(
    'rejects a child row whose parent does not exist (fk_auth_sessions_user, fk_agencies_created_by)',
    tx(async () => {
      const g = await seedGraph(conn);
      const session = (userId: string) => ({
        id: id(),
        user_id: userId,
        token_hash: id().replace(/-/g, '').padEnd(64, '0'),
        csrf_token_hash: 'e'.repeat(64),
        expires_at: new Date(Date.now() + 3_600_000),
        last_seen_at: new Date(),
      });
      await insert(conn, 'auth_sessions', session(g.actor)); // positive control
      await expectSqlError(
        insert(conn, 'auth_sessions', session(id())),
        ER_NO_REFERENCED_ROW_2,
        'fk_auth_sessions_user',
      );
      await expectSqlError(
        insert(conn, 'agencies', { id: id(), display_name: 'SYNTHETIC orphan', ...audit(id()) }),
        ER_NO_REFERENCED_ROW_2,
        'fk_agencies_created_by',
      );
    }),
  );
});

describe('S02 composite same-agency foreign keys', () => {
  it(
    'rejects a route default signer from another agency (fk_routes_default_signer)',
    tx(async () => {
      const g = await seedGraph(conn);
      // Second route for the same owner-subject in agency B with agency A's signer.
      await expectSqlError(
        insert(conn, 'routes', {
          id: id(),
          agency_id: g.agencyB,
          owner_subject_id: g.ownerSubject,
          default_signer_id: g.signerA,
          ...audit(g.actor),
        }),
        ER_NO_REFERENCED_ROW_2,
        'fk_routes_default_signer',
      );
      // Positive control: agency B route with agency B signer.
      await insert(conn, 'routes', {
        id: id(),
        agency_id: g.agencyB,
        owner_subject_id: g.ownerSubject,
        default_signer_id: g.signerB,
        ...audit(g.actor),
      });
    }),
  );

  it(
    'rejects coverage signers and coverages that mix agencies (fk_coverage_signers_*, fk_mandate_coverages_route)',
    tx(async () => {
      const g = await seedGraph(conn);
      const coverageSigner = (agencyId: string, signerId: string) => ({
        id: id(),
        coverage_id: g.coverageA,
        agency_id: agencyId,
        signer_id: signerId,
        capacity: 'synthetic capacity',
        ...audit(g.actor),
      });
      await expectSqlError(
        insert(conn, 'coverage_signers', coverageSigner(g.agencyA, g.signerB)),
        ER_NO_REFERENCED_ROW_2,
        'fk_coverage_signers_signer',
      );
      await expectSqlError(
        insert(conn, 'coverage_signers', coverageSigner(g.agencyB, g.signerB)),
        ER_NO_REFERENCED_ROW_2,
        'fk_coverage_signers_coverage',
      );
      await insert(conn, 'coverage_signers', coverageSigner(g.agencyA, g.signerA)); // positive
      await expectSqlError(
        insert(conn, 'mandate_coverages', {
          id: id(),
          mandate_version_id: g.versionB,
          route_id: g.routeA,
          agency_id: g.agencyB,
          coverage_label: 'cross-agency attempt',
          ...audit(g.actor),
        }),
        ER_NO_REFERENCED_ROW_2,
        'fk_mandate_coverages_route',
      );
    }),
  );
});

describe('S03 composite same-case foreign keys', () => {
  it(
    'rejects a use mapping whose work or reported item belongs to another case',
    tx(async () => {
      const g = await seedGraph(conn);
      await expectSqlError(
        insert(conn, 'use_mappings', mapping(g, { case_id: g.caseB, reported_item_id: g.itemB })),
        ER_NO_REFERENCED_ROW_2,
        'fk_use_mappings_work',
      );
      await expectSqlError(
        insert(conn, 'use_mappings', mapping(g, { reported_item_id: g.itemB })),
        ER_NO_REFERENCED_ROW_2,
        'fk_use_mappings_reported_item',
      );
      await insert(conn, 'use_mappings', mapping(g)); // positive control, same case
    }),
  );

  it(
    'rejects a candidate or validation run bound to another case (fk_notice_candidates_prompt, fk_validation_runs_candidate)',
    tx(async () => {
      const g = await seedGraph(conn);
      await expectSqlError(
        insert(conn, 'notice_candidates', candidate(g, id(), g.caseB, g.promptA)),
        ER_NO_REFERENCED_ROW_2,
        'fk_notice_candidates_prompt',
      );
      await expectSqlError(
        insert(conn, 'validation_runs', validationRun(g, { case_id: g.caseB })),
        ER_NO_REFERENCED_ROW_2,
        'fk_validation_runs_candidate',
      );
      await insert(conn, 'validation_runs', validationRun(g)); // positive control
    }),
  );
});

describe('S04 unique constraints', () => {
  it(
    'rejects duplicate association, route, per-case item, mandate version and mapping occurrence',
    tx(async () => {
      const g = await seedGraph(conn);
      const a = audit(g.actor);
      await expectSqlError(
        insert(conn, 'owner_subjects', {
          id: id(),
          owner_id: g.owner,
          legal_subject_id: g.subject,
          ...a,
        }),
        ER_DUP_ENTRY,
        'owner_subjects_owner_id_legal_subject_id_key',
      );
      await expectSqlError(
        insert(conn, 'routes', {
          id: id(),
          agency_id: g.agencyA,
          owner_subject_id: g.ownerSubject,
          platform: 'YOUTUBE',
          ...a,
        }),
        ER_DUP_ENTRY,
        'routes_agency_id_owner_subject_id_platform_key',
      );
      await expectSqlError(
        insert(conn, 'reported_items', reportedItem(g, id(), g.caseA, 'P0synthA001')),
        ER_DUP_ENTRY,
        'reported_items_case_id_external_item_id_key',
      );
      await expectSqlError(
        insert(conn, 'mandate_versions', {
          id: id(),
          mandate_id: g.mandateA,
          agency_id: g.agencyA,
          version: 1,
          change_kind: 'AMENDMENT',
          change_reason: 'duplicate version attempt',
          ...a,
        }),
        ER_DUP_ENTRY,
        'mandate_versions_mandate_id_version_key',
      );
      await expectSqlError(
        insert(conn, 'use_mappings', mapping(g, { occurrence: 1 })),
        ER_DUP_ENTRY,
        'use_mappings_case_work_id_reported_item_id_occurrence_key',
      );
      // Uniqueness of a video is case-scoped, never global: the same ID in another case is accepted.
      await insert(conn, 'reported_items', reportedItem(g, id(), g.caseB, 'P0synthA001'));
    }),
  );
});

describe('S05 RESTRICT on referenced parents', () => {
  it(
    'rejects deleting referenced parents and updating referenced keys; allows unreferenced delete',
    tx(async () => {
      const g = await seedGraph(conn);
      await expectSqlError(
        conn.query('DELETE FROM agencies WHERE id = ?', [g.agencyA]),
        ER_ROW_IS_REFERENCED_2,
        'a foreign key constraint fails',
      );
      await expectSqlError(
        conn.query('DELETE FROM users WHERE id = ?', [g.actor]),
        ER_ROW_IS_REFERENCED_2,
        'a foreign key constraint fails',
      );
      await expectSqlError(
        conn.query('DELETE FROM reported_items WHERE id = ?', [g.itemA]),
        ER_ROW_IS_REFERENCED_2,
        'fk_use_mappings_reported_item',
      );
      // ON UPDATE RESTRICT: a referenced signer cannot be moved to another agency in place.
      await expectSqlError(
        conn.query('UPDATE signers SET agency_id = ? WHERE id = ?', [g.agencyB, g.signerA]),
        ER_ROW_IS_REFERENCED_2,
        'fk_routes_default_signer',
      );
      const unreferenced = id();
      await insert(conn, 'owners', {
        id: unreferenced,
        display_name: 'SYNTHETIC unreferenced owner',
        ...audit(g.actor),
      });
      await conn.query('DELETE FROM owners WHERE id = ?', [unreferenced]);
      expect(await countRows(conn, 'owners', 'id = ?', [unreferenced])).toBe(0);
    }),
  );
});

describe('S06 binary collation for external identifiers', () => {
  it(
    'treats video IDs case-sensitively and without trailing-space padding (utf8mb4_0900_bin)',
    tx(async () => {
      const g = await seedGraph(conn);
      for (const externalId of ['P0SynthCase', 'P0SYNTHCASE', 'p0synthcase', 'P0SynthCase ']) {
        await insert(conn, 'reported_items', reportedItem(g, id(), g.caseA, externalId));
      }
      await expectSqlError(
        insert(conn, 'reported_items', reportedItem(g, id(), g.caseA, 'P0SynthCase')),
        ER_DUP_ENTRY,
        'reported_items_case_id_external_item_id_key',
      );
      const match = (value: string) =>
        countRows(conn, 'reported_items', 'case_id = ? AND external_item_id = ?', [g.caseA, value]);
      expect(await match('P0SynthCase')).toBe(1);
      expect(await match('p0synthcase')).toBe(1);
      expect(await match('P0SYNTHCASE')).toBe(1);
      expect(await match('P0SynthCase ')).toBe(1);
      expect(await match('P0SYNTHcase')).toBe(0);
    }),
  );
});

describe('S07 Unicode storage', () => {
  it(
    'round-trips exact UTF-8 text without normalization, trimming or newline changes',
    tx(async () => {
      const g = await seedGraph(conn);
      const text =
        ' leading space; emoji 😀 𝄞; ZWJ 👩‍💻; composed é vs decomposed é; CJK 著作権; RTL עברית; ' +
        'NBSP ; tab\t; CRLF\r\nLF\n; trailing spaces   ';
      const agency = id();
      await insert(conn, 'agencies', {
        id: agency,
        display_name: 'SYNTHETIC Unicode',
        notes: text,
        ...audit(g.actor),
      });
      const [row] = (await conn.query(
        {
          sql: 'SELECT notes, HEX(notes) AS hex, CHAR_LENGTH(notes) AS chars, LENGTH(notes) AS bytes FROM agencies WHERE id = ?',
          bigIntAsNumber: true,
        },
        [agency],
      )) as Array<{ notes: string; hex: string; chars: number; bytes: number }>;
      expect(row?.notes).toBe(text);
      expect(row?.hex).toBe(Buffer.from(text, 'utf8').toString('hex').toUpperCase());
      expect(row?.chars).toBe(Array.from(text).length);
      expect(row?.bytes).toBe(Buffer.byteLength(text, 'utf8'));
      // Composed and decomposed forms are different stored values under the binary collation.
      expect(
        await countRows(conn, 'agencies', 'id = ? AND notes = ?', [agency, text.normalize('NFD')]),
      ).toBe(0);
    }),
  );

  it(
    'counts VARCHAR length in code points: 200 supplementary characters fit VARCHAR(200), 201 do not',
    tx(async () => {
      const g = await seedGraph(conn);
      const agency = id();
      await insert(conn, 'agencies', {
        id: agency,
        display_name: '😀'.repeat(200),
        ...audit(g.actor),
      });
      const [row] = (await conn.query(
        {
          sql: 'SELECT CHAR_LENGTH(display_name) AS chars, LENGTH(display_name) AS bytes FROM agencies WHERE id = ?',
          bigIntAsNumber: true,
        },
        [agency],
      )) as Array<{ chars: number; bytes: number }>;
      expect(row).toEqual({ chars: 200, bytes: 800 });
      await expectSqlError(
        insert(conn, 'agencies', { id: id(), display_name: '😀'.repeat(201), ...audit(g.actor) }),
        ER_DATA_TOO_LONG,
        "Data too long for column 'display_name'",
      );
    }),
  );
});

describe('S08 transactions', () => {
  it('rolls back a whole transaction, and a failing statement does not leave partial rows', async () => {
    const agency = id();
    let actor = '';
    await conn.beginTransaction();
    try {
      const g = await seedGraph(conn);
      actor = g.actor;
      await insert(conn, 'agencies', {
        id: agency,
        display_name: 'SYNTHETIC rollback',
        ...audit(g.actor),
      });
      expect(await countRows(conn, 'agencies', 'id = ?', [agency])).toBe(1);
      // Statement-level atomicity: a multi-row INSERT whose second row violates a CHECK inserts nothing.
      const first = id();
      await expectSqlError(
        conn.query(
          'INSERT INTO agencies (id, display_name, created_by_id, updated_at, updated_by_id, row_version) VALUES (?, ?, ?, NOW(3), ?, 1), (?, ?, ?, NOW(3), ?, 0)',
          [
            first,
            'SYNTHETIC ok row',
            g.actor,
            g.actor,
            id(),
            'SYNTHETIC bad row',
            g.actor,
            g.actor,
          ],
        ),
        ER_CHECK_CONSTRAINT_VIOLATED,
        'ck_agencies_row_version',
      );
      expect(await countRows(conn, 'agencies', 'id = ?', [first])).toBe(0);
      // The earlier statement in the same transaction is still present until rollback.
      expect(await countRows(conn, 'agencies', 'id = ?', [agency])).toBe(1);
    } finally {
      await conn.rollback();
    }
    expect(await countRows(conn, 'agencies', 'id = ?', [agency])).toBe(0);
    expect(await countRows(conn, 'users', 'id = ?', [actor])).toBe(0);
  });
});

describe('S09–S13 domain and time CHECK constraints', () => {
  it(
    'S09 rejects known intervals whose end is not after start (ck_use_mappings_*_interval)',
    tx(async () => {
      const g = await seedGraph(conn);
      await expectSqlError(
        insert(
          conn,
          'use_mappings',
          mapping(g, { source_start_ms: '5000', source_end_ms: '5000' }),
        ),
        ER_CHECK_CONSTRAINT_VIOLATED,
        'ck_use_mappings_source_interval',
      );
      await expectSqlError(
        insert(
          conn,
          'use_mappings',
          mapping(g, { source_start_ms: '6000', source_end_ms: '5000' }),
        ),
        ER_CHECK_CONSTRAINT_VIOLATED,
        'ck_use_mappings_source_interval',
      );
      await expectSqlError(
        insert(
          conn,
          'use_mappings',
          mapping(g, { reported_start_ms: '9000', reported_end_ms: '1000' }),
        ),
        ER_CHECK_CONSTRAINT_VIOLATED,
        'ck_use_mappings_reported_interval',
      );
      await insert(
        conn,
        'use_mappings',
        mapping(g, { occurrence: 2, source_start_ms: '0', source_end_ms: '1' }),
      );
      // Missing endpoints stay NULL (unknown), not 0, and are accepted.
      await insert(conn, 'use_mappings', mapping(g, { occurrence: 3, source_start_ms: '5000' }));
      await insert(conn, 'use_mappings', mapping(g, { occurrence: 4, reported_end_ms: '5000' }));
    }),
  );

  it(
    'S10 enforces the JS safe-integer millisecond bound (ck_use_mappings_millisecond_bounds)',
    tx(async () => {
      const g = await seedGraph(conn);
      await expectSqlError(
        insert(
          conn,
          'use_mappings',
          mapping(g, { source_start_ms: '0', source_end_ms: '9007199254740992' }),
        ),
        ER_CHECK_CONSTRAINT_VIOLATED,
        'ck_use_mappings_millisecond_bounds',
      );
      await expectSqlError(
        insert(conn, 'use_mappings', mapping(g, { reported_start_ms: '9007199254740992' })),
        ER_CHECK_CONSTRAINT_VIOLATED,
        'ck_use_mappings_millisecond_bounds',
      );
      const maxId = id();
      await insert(
        conn,
        'use_mappings',
        mapping(g, {
          id: maxId,
          occurrence: 2,
          source_start_ms: '0',
          source_end_ms: '9007199254740991',
        }),
      );
      // More than 24 hours is an ordinary millisecond value, not a wrapped TIME.
      await insert(
        conn,
        'use_mappings',
        mapping(g, { occurrence: 3, reported_start_ms: '86400000', reported_end_ms: '90061001' }),
      );
      const [row] = (await conn.query(
        'SELECT CAST(source_end_ms AS CHAR) AS v FROM use_mappings WHERE id = ?',
        [maxId],
      )) as Array<{ v: string }>;
      expect(row?.v).toBe('9007199254740991');
      // Negative values are rejected by the UNSIGNED type itself (strict SQL mode), before any CHECK.
      await expectSqlError(
        insert(conn, 'use_mappings', mapping(g, { occurrence: 5, source_start_ms: '-1' })),
        ER_WARN_DATA_OUT_OF_RANGE,
        "Out of range value for column 'source_start_ms'",
      );
    }),
  );

  it(
    'S11 restricts boundary_convention to the exact vocabulary (ck_use_mappings_boundary_convention)',
    tx(async () => {
      const g = await seedGraph(conn);
      for (const bad of ['CLOSED', 'half_open', '']) {
        await expectSqlError(
          insert(conn, 'use_mappings', mapping(g, { boundary_convention: bad })),
          ER_CHECK_CONSTRAINT_VIOLATED,
          'ck_use_mappings_boundary_convention',
        );
      }
      let occurrence = 2;
      for (const good of ['UNKNOWN', 'HALF_OPEN', 'INCLUSIVE']) {
        await insert(
          conn,
          'use_mappings',
          mapping(g, { occurrence: occurrence++, boundary_convention: good }),
        );
      }
    }),
  );

  it(
    'S12 keeps every stored candidate unsigned (ck_notice_candidates_unsigned_only)',
    tx(async () => {
      const g = await seedGraph(conn);
      for (const bad of ['SIGNED', 'human_pending', 'READY_FOR_SIGNER', '']) {
        await expectSqlError(
          insert(
            conn,
            'notice_candidates',
            candidate(g, id(), g.caseA, g.promptA, { version: 2, signature_state: bad }),
          ),
          ER_CHECK_CONSTRAINT_VIOLATED,
          'ck_notice_candidates_unsigned_only',
        );
      }
      const [row] = (await conn.query(
        'SELECT signature_state AS s FROM notice_candidates WHERE id = ?',
        [g.candidateA],
      )) as Array<{ s: string }>;
      expect(row?.s).toBe('HUMAN_PENDING'); // column default
      await expectSqlError(
        conn.query("UPDATE notice_candidates SET signature_state = 'SIGNED' WHERE id = ?", [
          g.candidateA,
        ]),
        ER_CHECK_CONSTRAINT_VIOLATED,
        'ck_notice_candidates_unsigned_only',
      );
    }),
  );

  it(
    'S13 requires validation completed_at >= started_at (ck_validation_runs_completion_time)',
    tx(async () => {
      const g = await seedGraph(conn);
      await expectSqlError(
        insert(
          conn,
          'validation_runs',
          validationRun(g, {
            started_at: new Date('2026-09-23T10:00:00.001Z'),
            completed_at: new Date('2026-09-23T10:00:00.000Z'),
          }),
        ),
        ER_CHECK_CONSTRAINT_VIOLATED,
        'ck_validation_runs_completion_time',
      );
      await insert(conn, 'validation_runs', validationRun(g)); // equal instants accepted
      await insert(
        conn,
        'validation_runs',
        validationRun(g, { completed_at: new Date('2026-09-23T10:00:05.000Z') }),
      );
    }),
  );

  it(
    'S13b requires auth session expiry after creation (ck_auth_sessions_session_time)',
    tx(async () => {
      const g = await seedGraph(conn);
      const at = new Date('2026-09-23T10:00:00.000Z');
      await expectSqlError(
        insert(conn, 'auth_sessions', {
          id: id(),
          user_id: g.actor,
          token_hash: 'f'.repeat(64),
          csrf_token_hash: 'e'.repeat(64),
          created_at: at,
          expires_at: at,
          last_seen_at: at,
        }),
        ER_CHECK_CONSTRAINT_VIOLATED,
        'ck_auth_sessions_session_time',
      );
    }),
  );
});

describe('S14 lower-bound CHECK families (representative members)', () => {
  it(
    'rejects 0 for row_version, version, revision, context_revision and occurrence',
    tx(async () => {
      const g = await seedGraph(conn);
      const a = audit(g.actor);
      await expectSqlError(
        insert(conn, 'agencies', { id: id(), display_name: 'SYNTHETIC', row_version: 0, ...a }),
        ER_CHECK_CONSTRAINT_VIOLATED,
        'ck_agencies_row_version',
      );
      await expectSqlError(
        conn.query('UPDATE routes SET row_version = 0 WHERE id = ?', [g.routeA]),
        ER_CHECK_CONSTRAINT_VIOLATED,
        'ck_routes_row_version',
      );
      await expectSqlError(
        insert(conn, 'mandate_versions', {
          id: id(),
          mandate_id: g.mandateA,
          agency_id: g.agencyA,
          version: 0,
          change_kind: 'AMENDMENT',
          change_reason: 'synthetic',
          ...a,
        }),
        ER_CHECK_CONSTRAINT_VIOLATED,
        'ck_mandate_versions_version',
      );
      await expectSqlError(
        insert(conn, 'notice_candidates', candidate(g, id(), g.caseA, g.promptA, { version: 0 })),
        ER_CHECK_CONSTRAINT_VIOLATED,
        'ck_notice_candidates_version',
      );
      await expectSqlError(
        insert(conn, 'source_references', {
          id: id(),
          source_group_id: id(),
          revision: 0,
          title: 'SYNTHETIC source',
          source_role: 'OPERATOR_INPUT',
          scope_text: 'synthetic',
          created_by_id: g.actor,
        }),
        ER_CHECK_CONSTRAINT_VIOLATED,
        'ck_source_references_revision',
      );
      await expectSqlError(
        insert(conn, 'case_facts', {
          id: id(),
          case_id: g.caseA,
          fact_group_id: id(),
          revision: 0,
          fact_type: 'PERMISSION',
          scope_kind: 'CASE',
          value: '{}',
          provenance: 'MISSING',
          scope_text: 'synthetic',
          change_reason: 'synthetic',
          created_by_id: g.actor,
        }),
        ER_CHECK_CONSTRAINT_VIOLATED,
        'ck_case_facts_revision',
      );
      await expectSqlError(
        conn.query('UPDATE cases SET context_revision = 0 WHERE id = ?', [g.caseA]),
        ER_CHECK_CONSTRAINT_VIOLATED,
        'ck_cases_context_revision',
      );
      await expectSqlError(
        insert(
          conn,
          'prompt_snapshots',
          promptSnapshot(g, id(), g.caseA, { version: 2, context_revision: 0 }),
        ),
        ER_CHECK_CONSTRAINT_VIOLATED,
        'ck_prompt_snapshots_context_revision',
      );
      await expectSqlError(
        insert(conn, 'use_mappings', mapping(g, { occurrence: 0 })),
        ER_CHECK_CONSTRAINT_VIOLATED,
        'ck_use_mappings_occurrence',
      );
      // Positive control: the value 1 is accepted for each family.
      await insert(conn, 'source_references', {
        id: id(),
        source_group_id: id(),
        revision: 1,
        title: 'SYNTHETIC source',
        source_role: 'OPERATOR_INPUT',
        scope_text: 'synthetic',
        created_by_id: g.actor,
      });
    }),
  );
});

describe('SYNTHETIC ACTOR (AR-013)', () => {
  it(
    'the fixture actor is stored disabled with a non-credential marker',
    tx(async () => {
      const g = await seedGraph(conn);
      const [row] = (await conn.query(
        'SELECT enabled, password_hash AS marker FROM users WHERE id = ?',
        [g.actor],
      )) as Array<{ enabled: number; marker: string }>;
      expect(Number(row?.enabled)).toBe(0);
      expect(row?.marker).toBe(DISABLED_ACTOR_MARKER);
      expect(row?.marker.startsWith('$argon2')).toBe(false);
    }),
  );
});

describe('SERVICE-LAYER RULES are NOT database-enforced (documentation: MySQL accepts these rows)', () => {
  it(
    'D01 composite FKs are not checked when a referencing column is NULL (MATCH SIMPLE)',
    tx(async () => {
      const g = await seedGraph(conn);
      // An unbound intake case (route_id NULL) is accepted for any agency: fk_cases_route is not evaluated.
      await insert(conn, 'cases', {
        id: id(),
        agency_id: g.agencyB,
        intake_label: 'SYNTHETIC unbound',
        ...audit(g.actor),
      });
      // FactScope consistency is an API/service rule: scope_kind WORK with no work key is accepted.
      await insert(conn, 'case_facts', {
        id: id(),
        case_id: g.caseA,
        fact_group_id: id(),
        revision: 1,
        fact_type: 'WORK_IDENTIFICATION',
        scope_kind: 'WORK',
        value: '{}',
        provenance: 'MISSING',
        scope_text: 'synthetic',
        change_reason: 'synthetic',
        created_by_id: g.actor,
      });
    }),
  );

  it(
    'D02 routes.preferred_coverage_id may point at a coverage of another route (simple FK only)',
    tx(async () => {
      const g = await seedGraph(conn);
      const otherRoute = id();
      await insert(conn, 'routes', {
        id: otherRoute,
        agency_id: g.agencyB,
        owner_subject_id: g.ownerSubject,
        preferred_coverage_id: g.coverageA, // coverage of route A in agency A
        ...audit(g.actor),
      });
    }),
  );

  it(
    'D03 cases.current_authority_selection_id may point at another case’s selection (simple FK only)',
    tx(async () => {
      const g = await seedGraph(conn);
      const selectionOfCaseB = id();
      await insert(conn, 'case_authority_selections', {
        id: selectionOfCaseB,
        case_id: g.caseB,
        agency_id: g.agencyA,
        route_id: g.routeA,
        signer_id: g.signerA,
        task_type: 'INITIAL',
        intended_from_email: 'synthetic-sender@example.invalid',
        selection_note: 'synthetic',
        created_by_id: g.actor,
      });
      await conn.query('UPDATE cases SET current_authority_selection_id = ? WHERE id = ?', [
        selectionOfCaseB,
        g.caseA,
      ]);
    }),
  );
});
