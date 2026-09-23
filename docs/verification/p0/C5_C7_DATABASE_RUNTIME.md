# P0-C5/C7 database runtime verification (first PC)

Recorded 2026-09-23. Scope: C5 migration runtime verification and C7 database structural tests only. P0-D, P0-E and P1 have not started. This is first-PC evidence; CI and second-PC reproduction are separate, not yet run.

Raw evidence: `metadata/tb_notice_{test,replay,dev}.json` (verifier output), `evidence/c5-migration-runtime.txt`, `evidence/c7-structural-tests.txt`, `evidence/c7-harness-sanity-negative-control.txt`.

## 1. Pre-flight (before any database mutation)

| Check | Result |
|---|---|
| Branch / worktree | `bootstrap/p0-local`, clean, in sync with origin |
| Frozen references | both manifests OK; Database/API manifest hash `42c2a419…`, architecture pack manifest hash `62b4d113…` |
| Migration file | `20260923103912_initial_schema/migration.sql` SHA-256 `b54c36fdaada7bdd31e08558a93d70e9e40fd4c48348681c9c2a124503426515` in worktree and HEAD = R1 reviewed hash |
| MySQL | container `tb-notice-mysql-1`, image `mysql:8.4.11@sha256:0744ee5e…fb8d` (image ID equals pinned digest), MySQL 8.4.11 Community Server, global `sql_mode` includes `STRICT_TRANS_TABLES` |
| Binding | `127.0.0.1:3307` only (Docker, WSL `ss`, Windows `netstat.exe`) |
| Schemas | test 0 tables; replay 0 tables; shadow 0 tables; dev only `_prisma_migrations` with 0 rows |

## 2. Migration runtime (order: test → replay → dev)

All commands ran through `scripts/db/prisma-guarded.mjs` (tb_migrate, allowlisted schema per target; no reset, db push or FK-check disabling).

| Target | Status before | Deploy | Status after | Metadata verification |
|---|---|---|---|---|
| `tb_notice_test` | pending `20260923103912_initial_schema` (exit 1) | applied, exit 0 | up to date (exit 0) | PASS |
| `tb_notice_replay` | pending (exit 1) | #1 applied, exit 0; **#2 "No pending migrations to apply."**, exit 0 | up to date (exit 0) | PASS |
| `tb_notice_dev` | pending (exit 1); pre-existing empty `_prisma_migrations`, 0 rows | applied, exit 0 | up to date (exit 0) | PASS |

MySQL accepted every statement of the reviewed migration on all three schemas. Applied checksum in `_prisma_migrations` on each schema: `b54c36fdaada7bdd31e08558a93d70e9e40fd4c48348681c9c2a124503426515` (equals the committed file), exactly one finished, not rolled-back row per schema. The full metadata inventories of test, replay and dev are identical (excluding schema name/connection/server block).

Post-migration runtime grants on dev: `tb_dev` can `SELECT` domain tables; `ALTER TABLE … DROP CHECK` and `DROP TABLE` are denied (1142); `tb_notice_test` is not readable by `tb_dev`.

## 3. MySQL metadata verification (`scripts/db/verify-metadata.mjs`)

Expected inventory is parsed from the committed reviewed migration and must equal the fixed counts (33/541/50/34/125/30) before comparison. Actual state comes only from `information_schema` (`TABLES`, `COLUMNS`, `STATISTICS`, `REFERENTIAL_CONSTRAINTS`, `KEY_COLUMN_USAGE`, `TABLE_CONSTRAINTS`, `CHECK_CONSTRAINTS`, `SCHEMATA`) and `_prisma_migrations`. Prisma's `_prisma_migrations` table is excluded from the domain inventory. Result on each of test, replay, dev:

| Item | Verified |
|---|---|
| Domain tables | 33/33 present, `BASE TABLE`; no unexpected tables |
| Engine | InnoDB 33/33 |
| Table collation | `utf8mb4_0900_bin` 33/33; schema default `utf8mb4` / `utf8mb4_0900_bin` |
| Columns | 541/541: `COLUMN_TYPE`, nullability, default, `EXTRA` (only `DEFAULT_GENERATED` for `CURRENT_TIMESTAMP(3)` defaults), no unexpected columns, same column order |
| Column collation | all 391 character columns (173 CHAR, 108 VARCHAR, 56 LONGTEXT, 54 ENUM) `utf8mb4` / `utf8mb4_0900_bin`; the other 150 columns (DATETIME 78, JSON 32, INT 27, DATE 7, BIGINT 4, SMALLINT 1, TINYINT 1) report no charset/collation |
| Primary keys | 33/33 (`id`) |
| Unique keys | 50/50 by name and ordered column tuple |
| Secondary indexes | 34/34 by name and ordered column tuple |
| Implicit FK indexes | 97, each named exactly like its FK constraint (MySQL creates an index for an FK only when no usable index exists); any other extra index would fail |
| Foreign keys | 125/125 by name: columns, referenced table/columns (same schema), `DELETE_RULE = RESTRICT`, `UPDATE_RULE = RESTRICT`; 27 composite; no unexpected FKs |
| CHECK constraints | 30/30 by name, `ENFORCED = YES`, stored clause semantically equal to the reviewed expression (canonical expression tree; see note) |

Note on CHECK comparison: MySQL stores `CHECK_CLAUSE` in rewritten form (extra parentheses, lower-case keywords, `_utf8mb4` introducers, backslash-escaped quotes). The verifier undoes only the quote escaping and compares canonical expression trees; unsupported syntax or escapes fail closed. On the first run the verifier failed closed on the escaped quotes (tooling issue, no schema change); the fix is commit `12fc5e1`.

### All 30 CHECK constraints (ENFORCED and semantic match on test/replay/dev)

| # | Table | Constraint | ENFORCED (test/replay/dev) | Semantic match | Stored `CHECK_CLAUSE` (MySQL) |
|---|---|---|---|---|---|
| 1 | agencies | `ck_agencies_row_version` | YES/YES/YES | yes/yes/yes | `(`row_version` >= 1)` |
| 2 | auth_sessions | `ck_auth_sessions_session_time` | YES/YES/YES | yes/yes/yes | `(`expires_at` > `created_at`)` |
| 3 | case_facts | `ck_case_facts_revision` | YES/YES/YES | yes/yes/yes | `(`revision` >= 1)` |
| 4 | case_sources | `ck_case_sources_row_version` | YES/YES/YES | yes/yes/yes | `(`row_version` >= 1)` |
| 5 | case_works | `ck_case_works_row_version` | YES/YES/YES | yes/yes/yes | `(`row_version` >= 1)` |
| 6 | cases | `ck_cases_context_revision` | YES/YES/YES | yes/yes/yes | `(`context_revision` >= 1)` |
| 7 | cases | `ck_cases_row_version` | YES/YES/YES | yes/yes/yes | `(`row_version` >= 1)` |
| 8 | coverage_signers | `ck_coverage_signers_row_version` | YES/YES/YES | yes/yes/yes | `(`row_version` >= 1)` |
| 9 | legal_subjects | `ck_legal_subjects_row_version` | YES/YES/YES | yes/yes/yes | `(`row_version` >= 1)` |
| 10 | mandate_coverages | `ck_mandate_coverages_row_version` | YES/YES/YES | yes/yes/yes | `(`row_version` >= 1)` |
| 11 | mandate_versions | `ck_mandate_versions_row_version` | YES/YES/YES | yes/yes/yes | `(`row_version` >= 1)` |
| 12 | mandate_versions | `ck_mandate_versions_version` | YES/YES/YES | yes/yes/yes | `(`version` >= 1)` |
| 13 | mandates | `ck_mandates_row_version` | YES/YES/YES | yes/yes/yes | `(`row_version` >= 1)` |
| 14 | notice_candidates | `ck_notice_candidates_unsigned_only` | YES/YES/YES | yes/yes/yes | `(`signature_state` = _utf8mb4\'HUMAN_PENDING\')` |
| 15 | notice_candidates | `ck_notice_candidates_version` | YES/YES/YES | yes/yes/yes | `(`version` >= 1)` |
| 16 | owner_subjects | `ck_owner_subjects_row_version` | YES/YES/YES | yes/yes/yes | `(`row_version` >= 1)` |
| 17 | owners | `ck_owners_row_version` | YES/YES/YES | yes/yes/yes | `(`row_version` >= 1)` |
| 18 | prompt_snapshots | `ck_prompt_snapshots_context_revision` | YES/YES/YES | yes/yes/yes | `(`context_revision` >= 1)` |
| 19 | prompt_snapshots | `ck_prompt_snapshots_version` | YES/YES/YES | yes/yes/yes | `(`version` >= 1)` |
| 20 | reported_items | `ck_reported_items_row_version` | YES/YES/YES | yes/yes/yes | `(`row_version` >= 1)` |
| 21 | routes | `ck_routes_row_version` | YES/YES/YES | yes/yes/yes | `(`row_version` >= 1)` |
| 22 | signers | `ck_signers_row_version` | YES/YES/YES | yes/yes/yes | `(`row_version` >= 1)` |
| 23 | source_references | `ck_source_references_revision` | YES/YES/YES | yes/yes/yes | `(`revision` >= 1)` |
| 24 | use_mappings | `ck_use_mappings_boundary_convention` | YES/YES/YES | yes/yes/yes | `(`boundary_convention` in (_utf8mb4\'UNKNOWN\',_utf8mb4\'HALF_OPEN\',_utf8mb4\'INCLUSIVE\'))` |
| 25 | use_mappings | `ck_use_mappings_millisecond_bounds` | YES/YES/YES | yes/yes/yes | `((coalesce(`source_start_ms`,0) <= 9007199254740991) and (coalesce(`source_end_ms`,0) <= 9007199254740991) and (coalesce(`reported_start_ms`,0) <= 9007199254740991) and (coalesce(`reported_end_ms`,0) <= 9007199254740991))` |
| 26 | use_mappings | `ck_use_mappings_occurrence` | YES/YES/YES | yes/yes/yes | `(`occurrence` >= 1)` |
| 27 | use_mappings | `ck_use_mappings_reported_interval` | YES/YES/YES | yes/yes/yes | `((`reported_start_ms` is null) or (`reported_end_ms` is null) or (`reported_end_ms` > `reported_start_ms`))` |
| 28 | use_mappings | `ck_use_mappings_row_version` | YES/YES/YES | yes/yes/yes | `(`row_version` >= 1)` |
| 29 | use_mappings | `ck_use_mappings_source_interval` | YES/YES/YES | yes/yes/yes | `((`source_start_ms` is null) or (`source_end_ms` is null) or (`source_end_ms` > `source_start_ms`))` |
| 30 | validation_runs | `ck_validation_runs_completion_time` | YES/YES/YES | yes/yes/yes | `(`completed_at` >= `started_at`)` |

## 4. Structural tests on `tb_notice_test` (`yarn test:db`, Vitest 5.0.1)

Guard: the runner and the suite both require `TEST_DATABASE_URL` = `tb_migrate@127.0.0.1:3307/tb_notice_test`; the suite asserts session `DATABASE()=tb_notice_test`, `CURRENT_USER()=tb_migrate@%`, time zone `+00:00`, `collation_connection=utf8mb4_0900_bin`, and that all 33 domain tables are empty before and after the run. Every test body runs inside a transaction that is always rolled back; data is synthetic (`SYNTHETIC …`, `example.invalid`, disabled actor). `FOREIGN_KEY_CHECKS` is never touched. Each negative assertion checks the MySQL error number **and** the specific constraint/key name in the message.

Result: **22 passed, 0 failed** (1 file). Domain rows after the run: 0 (asserted in `afterAll` and by `db:verify test --expect-empty`).

| ID | Required item | Test | Evidence (MySQL errno + name) | Result |
|---|---|---|---|---|
| S01 | 1 simple FK rejection | unknown parent user / creator | 1452 `fk_auth_sessions_user`, 1452 `fk_agencies_created_by`; valid session accepted | PASS |
| S02a | 2 composite same-agency FK | agency-B route whose default signer belongs to agency A | 1452 `fk_routes_default_signer`; agency-B route with agency-B signer accepted | PASS |
| S02b | 2 composite same-agency FK | coverage signer/coverage mixing agencies | 1452 `fk_coverage_signers_signer`, 1452 `fk_coverage_signers_coverage`, 1452 `fk_mandate_coverages_route`; same-agency accepted | PASS |
| S03a | 3 composite same-case FK | mapping with work/item from another case | 1452 `fk_use_mappings_work`, 1452 `fk_use_mappings_reported_item`; same-case accepted | PASS |
| S03b | 3 composite same-case FK | candidate/validation run bound to another case | 1452 `fk_notice_candidates_prompt`, 1452 `fk_validation_runs_candidate`; valid run accepted | PASS |
| S04 | 4 unique rejection | duplicate owner-subject, route, per-case video, mandate version, mapping occurrence | 1062 on `owner_subjects_owner_id_legal_subject_id_key`, `routes_agency_id_owner_subject_id_platform_key`, `reported_items_case_id_external_item_id_key`, `mandate_versions_mandate_id_version_key`, `use_mappings_case_work_id_reported_item_id_occurrence_key`; same video ID in another case accepted (no global uniqueness) | PASS |
| S05 | 5 RESTRICT parent delete | delete referenced agency/user/reported item; move referenced signer to another agency | 1451 ×3 (reported item: `fk_use_mappings_reported_item`); UPDATE → 1451 `fk_routes_default_signer` (ON UPDATE RESTRICT); unreferenced owner deletable | PASS |
| S06 | 6 binary/case-sensitive identifiers | `P0SynthCase`, `P0SYNTHCASE`, `p0synthcase`, `P0SynthCase␠` in one case | all 4 accepted as distinct; exact duplicate 1062; equality lookups case-exact and NO PAD (trailing space significant) | PASS |
| S07a | 7 Unicode round-trip | emoji, ZWJ sequence, composed vs decomposed é, CJK, RTL, NBSP, tab, CRLF/LF, leading/trailing spaces in LONGTEXT | exact string, `HEX()` = UTF-8 bytes, `CHAR_LENGTH` = code points, `LENGTH` = bytes; NFD form not equal | PASS |
| S07b | 7 Unicode (length semantics) | 200 vs 201 × U+1F600 in `VARCHAR(200)` | 200 accepted (200 chars / 800 bytes); 201 → 1406 data too long | PASS |
| S08 | 8 transaction rollback | insert then ROLLBACK; multi-row INSERT with one CHECK-violating row | row visible in-transaction, absent after rollback; failing multi-row statement inserted nothing (3819 `ck_agencies_row_version`) while earlier statement persisted until rollback | PASS |
| S09 | 9 interval end > start | equal and reversed source/reported intervals | 3819 `ck_use_mappings_source_interval` ×2, 3819 `ck_use_mappings_reported_interval`; valid and NULL-endpoint rows accepted | PASS |
| S10 | 10 safe-millisecond bound | 9007199254740992 in end/start | 3819 `ck_use_mappings_millisecond_bounds` ×2; 9007199254740991 accepted and read back exactly; >24 h values accepted; −1 rejected by UNSIGNED type (1264) | PASS |
| S11 | 11 boundary convention | `CLOSED`, `half_open`, empty | 3819 `ck_use_mappings_boundary_convention` ×3; `UNKNOWN`/`HALF_OPEN`/`INCLUSIVE` accepted | PASS |
| S12 | 12 HUMAN_PENDING | `SIGNED`, `human_pending`, `READY_FOR_SIGNER`, empty on insert; `SIGNED` on update | 3819 `ck_notice_candidates_unsigned_only` ×5; default reads `HUMAN_PENDING` | PASS |
| S13 | 13 completedAt ≥ startedAt | completed 1 ms before started | 3819 `ck_validation_runs_completion_time`; equal and later accepted | PASS |
| S13b | (extra) session time | `expires_at = created_at` | 3819 `ck_auth_sessions_session_time` | PASS |
| S14 | 14 lower bounds | 0 for row_version (insert and update), version, revision, context_revision, occurrence | 3819 `ck_agencies_row_version`, `ck_routes_row_version`, `ck_mandate_versions_version`, `ck_notice_candidates_version`, `ck_source_references_revision`, `ck_case_facts_revision`, `ck_cases_context_revision`, `ck_prompt_snapshots_context_revision`, `ck_use_mappings_occurrence`; value 1 accepted | PASS |
| A01 | AR-013 fixture actor | synthetic actor row | `enabled = 0`, password_hash is the non-credential marker (not an Argon2 hash) | PASS |
| D01 | documentation | NULL in composite FK columns | MySQL **accepts** an unbound case in agency B (route_id NULL) and a `WORK`-scoped fact with NULL work key | PASS (accepted as expected) |
| D02 | documentation | `routes.preferred_coverage_id` → coverage of another route/agency | MySQL **accepts** (simple FK) | PASS (accepted as expected) |
| D03 | documentation | `cases.current_authority_selection_id` → another case's selection | MySQL **accepts** (simple FK) | PASS (accepted as expected) |

Lower-bound families: metadata proves all 23 lower-bound constraints exist with `ENFORCED = YES`; DML exercised 9 representative members across every family (row_version, version, revision, context_revision, occurrence).

Harness negative control: a temporary test file (not committed; deleted after the run) asserted a rejection for a valid insert and the wrong constraint name for a real violation; both tests failed as they must (`evidence/c7-harness-sanity-negative-control.txt`), showing the assertions are not vacuous.

## 5. MySQL NULL semantics do not replace service-layer rules

InnoDB composite foreign keys use MATCH SIMPLE: when any referencing column is NULL the FK is not evaluated (D01). Several links are simple single-column FKs that prove existence, not scope (D02, D03). CHECK constraints evaluate to "not false" for NULL operands, which is why unknown interval endpoints are accepted (S09). None of this implements the INVARIANTS §3 service rules; the database is not claimed to enforce them.

Rules that remain **service-layer only** (later phases), each confirmed or consistent with the D-tests above:

- FactScope consistency: `scope_kind` must match exactly the non-NULL work/reported-item/mapping key (D01 shows the DB accepts a mismatch).
- `routes.preferred_coverage_id` must belong to the same route (D02).
- `cases.current_authority_selection_id` must belong to the case and its current route (D03).
- `authority_events.coverage_id` must belong to the event's mandate, not merely the same agency.
- `fact_sources` / `assessment_sources` must link a `case_sources` row of the same case (simple FKs only).
- Source authorization and explicit shared scope for NULL-agency sources.
- Frozen `mandate_versions` children (coverages, coverage signers) immutable after freeze; freeze/edit serialization.
- Unique successor / non-forking revision chains beyond the declared unique keys, and scope-preserving revisions.
- Delete guards for records referenced only from JSON snapshots.
- Unbound-intake route binding rules, selection coverage applicability, readiness derivation, G1–G6 assessment currency — all service/domain logic. G7, signing and sending do not exist.

## 6. Prisma drift compatibility

| Check | Command (guarded) | Result |
|---|---|---|
| Migration history vs schema | `migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script --exit-code` (history replayed into `tb_notice_shadow`) | exit 0, `-- This is an empty migration.` |
| Live test vs schema | `migrate diff --from-config-datasource --to-schema … --exit-code` | exit 0, empty |
| Live replay vs schema | same | exit 0, empty |
| Live dev vs schema | same | exit 0, empty |
| Create-only drift probe on dev | `migrate dev --create-only --name drift_probe` (dev + separate shadow) | exit 0, **no reset prompt** (no drift between dev and replayed history). Created untracked `20260923112706_drift_probe/migration.sql` = `-- This is an empty migration.` (30 bytes, 0 SQL statements, sha256 `122d743a…2eec`); not applied (dev still 1 migration row). Verified empty, then only that directory was removed; dev re-verified PASS and status up to date |
| Introspection (read-only) | `db pull --print` against test (stdout only; `schema.prisma` hash unchanged `5b9b1ce5…64e6`) | 33 models; **no** representation of CHECK constraints or `utf8mb4_0900_bin`; Prisma warns "These constraints are not supported by Prisma Client, because Prisma currently does not fully support check constraints" and lists all 30 `ck_*` names |

Limitations (why MySQL metadata remains authoritative): Prisma's schema diff does not model CHECK constraints or table/column collation, so an empty Prisma diff proves only that the Prisma-modelled structure (tables, columns, types, keys, indexes, FKs) agrees; it cannot detect a dropped/weakened CHECK or a collation change. Those are guarded by `yarn db:verify <target>` (information_schema) and the structural tests. No Prisma command proposed dropping a CHECK, changing collation or any destructive change. No `migrate reset`, `db push` or `FOREIGN_KEY_CHECKS=0` was used.

## 7. State after C5/C7

| Schema | Domain tables | `_prisma_migrations` rows | Domain rows |
|---|---|---|---|
| `tb_notice_test` | 33 | 1 (reviewed checksum) | 0 |
| `tb_notice_replay` | 33 | 1 (reviewed checksum) | 0 |
| `tb_notice_dev` | 33 | 1 (reviewed checksum) | 0 |
| `tb_notice_shadow` | 33 (left by Prisma's last shadow replay; disposable, reset by Prisma on next use) | — | — |
