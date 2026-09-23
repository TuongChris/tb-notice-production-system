# Initial migration constraint inventory (P0-C4)

Migration: `apps/api/prisma/migrations/20260923103912_initial_schema/migration.sql`
Status: **REVIEWED DRAFT — NOT APPLIED to any database.** Enforcement is asserted only after the C5 apply and structural tests; this inventory records what the SQL declares.

Baseline: frozen `docs/reference/database-api-v1/TB_DATABASE_SCHEMA_API_CONTRACT_v1/prisma/initial-schema.preview.sql` (TB-SCHEMA-API-v1.0.0) and `docs/DATABASE_SCHEMA_v1.md` → "Additional CHECK constraints in SQL preview".

## 1. Manual augmentations (not expressible in `schema.prisma`)

### M1 — Table engine and binary collation (33 rules)

Prisma 7.10.0 emitted `) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;` for every table. `utf8mb4_unicode_ci` is case- and accent-insensitive, which would violate the frozen design (case-sensitive `externalItemId`, exact identifiers). Every one of the 33 occurrences was replaced by:

```sql
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;
```

Prisma emits no column-level `COLLATE`, so every character column (including ENUM columns) inherits `utf8mb4_0900_bin`. Composite FKs therefore join columns of identical charset/collation.

| # | Table | Engine | Charset | Collation |
|---|---|---|---|---|
| 1–33 | `users`, `auth_sessions`, `agencies`, `owners`, `legal_subjects`, `owner_subjects`, `signers`, `routes`, `mandates`, `mandate_versions`, `mandate_coverages`, `coverage_signers`, `authority_events`, `cases`, `case_authority_selections`, `case_authority_coverages`, `reported_items`, `case_works`, `use_mappings`, `source_references`, `case_sources`, `case_facts`, `fact_sources`, `correspondence`, `correspondence_bindings`, `prompt_snapshots`, `notice_candidates`, `validation_runs`, `validation_issues`, `candidate_assessments`, `assessment_sources`, `audit_events`, `idempotency_records` | InnoDB | utf8mb4 | utf8mb4_0900_bin |

Schema defaults already match (created with `utf8mb4_0900_bin` by the init script), and the server default is `utf8mb4_0900_bin`; the table clause makes the migration independent of those defaults. Prisma's own `_prisma_migrations` bookkeeping table is created by Prisma with `utf8mb4_unicode_ci`; it is not a domain table and is left as Prisma creates it.

### M2 — CHECK constraints (30 rules)

All 30 CHECK constraints of the frozen preview, with the preview's exact names and expressions, appended as `ALTER TABLE … ADD CONSTRAINT … CHECK (…)` after the generated foreign keys.

| # | Table | Constraint | Expression | Column definitions (generated) | Rule class |
|---|---|---|---|---|---|
| 1 | auth_sessions | `ck_auth_sessions_session_time` | `` `expires_at` > `created_at` `` | `expires_at DATETIME(3) NOT NULL`; `created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)` | time ordering (one of the 7 special checks) |
| 2 | agencies | `ck_agencies_row_version` | `` `row_version` >= 1 `` | `INT UNSIGNED NOT NULL DEFAULT 1` | version lower bound |
| 3 | owners | `ck_owners_row_version` | `` `row_version` >= 1 `` | same | version lower bound |
| 4 | legal_subjects | `ck_legal_subjects_row_version` | `` `row_version` >= 1 `` | same | version lower bound |
| 5 | owner_subjects | `ck_owner_subjects_row_version` | `` `row_version` >= 1 `` | same | version lower bound |
| 6 | signers | `ck_signers_row_version` | `` `row_version` >= 1 `` | same | version lower bound |
| 7 | routes | `ck_routes_row_version` | `` `row_version` >= 1 `` | same | version lower bound |
| 8 | mandates | `ck_mandates_row_version` | `` `row_version` >= 1 `` | same | version lower bound |
| 9 | mandate_versions | `ck_mandate_versions_version` | `` `version` >= 1 `` | `version INT UNSIGNED NOT NULL` | version lower bound |
| 10 | mandate_versions | `ck_mandate_versions_row_version` | `` `row_version` >= 1 `` | `INT UNSIGNED NOT NULL DEFAULT 1` | version lower bound |
| 11 | mandate_coverages | `ck_mandate_coverages_row_version` | `` `row_version` >= 1 `` | same | version lower bound |
| 12 | coverage_signers | `ck_coverage_signers_row_version` | `` `row_version` >= 1 `` | same | version lower bound |
| 13 | cases | `ck_cases_context_revision` | `` `context_revision` >= 1 `` | `INT UNSIGNED NOT NULL DEFAULT 1` | revision lower bound |
| 14 | cases | `ck_cases_row_version` | `` `row_version` >= 1 `` | `INT UNSIGNED NOT NULL DEFAULT 1` | version lower bound |
| 15 | reported_items | `ck_reported_items_row_version` | `` `row_version` >= 1 `` | same | version lower bound |
| 16 | case_works | `ck_case_works_row_version` | `` `row_version` >= 1 `` | same | version lower bound |
| 17 | use_mappings | `ck_use_mappings_source_interval` | `` (`source_start_ms` IS NULL OR `source_end_ms` IS NULL OR `source_end_ms` > `source_start_ms`) `` | both `BIGINT UNSIGNED NULL` | known interval end > start (special) |
| 18 | use_mappings | `ck_use_mappings_reported_interval` | `` (`reported_start_ms` IS NULL OR `reported_end_ms` IS NULL OR `reported_end_ms` > `reported_start_ms`) `` | both `BIGINT UNSIGNED NULL` | known interval end > start (special) |
| 19 | use_mappings | `ck_use_mappings_millisecond_bounds` | `` COALESCE(`source_start_ms`,0) <= 9007199254740991 AND COALESCE(`source_end_ms`,0) <= 9007199254740991 AND COALESCE(`reported_start_ms`,0) <= 9007199254740991 AND COALESCE(`reported_end_ms`,0) <= 9007199254740991 `` | four `BIGINT UNSIGNED NULL` | JS safe-integer millisecond bound (special) |
| 20 | use_mappings | `ck_use_mappings_boundary_convention` | `` `boundary_convention` IN ('UNKNOWN','HALF_OPEN','INCLUSIVE') `` | `VARCHAR(40) NOT NULL DEFAULT 'UNKNOWN'` | closed vocabulary (special) |
| 21 | use_mappings | `ck_use_mappings_occurrence` | `` `occurrence` >= 1 `` | `INT UNSIGNED NOT NULL` | occurrence lower bound |
| 22 | use_mappings | `ck_use_mappings_row_version` | `` `row_version` >= 1 `` | `INT UNSIGNED NOT NULL DEFAULT 1` | version lower bound |
| 23 | source_references | `ck_source_references_revision` | `` `revision` >= 1 `` | `INT UNSIGNED NOT NULL` | revision lower bound |
| 24 | case_sources | `ck_case_sources_row_version` | `` `row_version` >= 1 `` | `INT UNSIGNED NOT NULL DEFAULT 1` | version lower bound |
| 25 | case_facts | `ck_case_facts_revision` | `` `revision` >= 1 `` | `INT UNSIGNED NOT NULL` | revision lower bound |
| 26 | prompt_snapshots | `ck_prompt_snapshots_version` | `` `version` >= 1 `` | `INT UNSIGNED NOT NULL` | version lower bound |
| 27 | prompt_snapshots | `ck_prompt_snapshots_context_revision` | `` `context_revision` >= 1 `` | `INT UNSIGNED NOT NULL` | revision lower bound |
| 28 | notice_candidates | `ck_notice_candidates_unsigned_only` | `` `signature_state` = 'HUMAN_PENDING' `` | `VARCHAR(40) NOT NULL DEFAULT 'HUMAN_PENDING'` | unsigned-only / pending signature (special) |
| 29 | notice_candidates | `ck_notice_candidates_version` | `` `version` >= 1 `` | `INT UNSIGNED NOT NULL` | version lower bound |
| 30 | validation_runs | `ck_validation_runs_completion_time` | `` `completed_at` >= `started_at` `` | both `DATETIME(3) NOT NULL` | time ordering (special) |

Totals: 7 special domain/time checks named in DATABASE_SCHEMA_v1.md (#1, 17, 18, 19, 20, 28, 30) plus 23 version/revision/occurrence lower bounds. Nothing was added beyond the preview, and nothing from the preview was omitted.

Compatibility notes to confirm at C5 (by MySQL itself, not assumed): MySQL rejects CHECK constraints on columns used by FK referential actions other than RESTRICT/NO ACTION — all 125 FKs here are `ON DELETE RESTRICT ON UPDATE RESTRICT`; no CHECK uses a non-deterministic function or an AUTO_INCREMENT column; CHECK constraint names are schema-unique (`ck_<table>_<rule>`).

## 2. Generated structure (unchanged by augmentation)

Parsed counts, identical in the draft and the frozen preview: 33 tables, 541 columns, 50 unique keys, 34 secondary indexes, 125 foreign keys (all `RESTRICT`/`RESTRICT`), primary key `id` on each table. Constraint and index names are also identical to the preview.

### Composite same-agency / same-case foreign keys (27)

These are the relational guards for cross-agency and cross-case references (INVARIANTS §3, "Composite FK" rows).

| Table | Constraint | Columns → target |
|---|---|---|
| routes | `fk_routes_default_signer` | (default_signer_id, agency_id) → signers(id, agency_id) |
| mandate_versions | `fk_mandate_versions_mandate` | (mandate_id, agency_id) → mandates(id, agency_id) |
| mandate_coverages | `fk_mandate_coverages_version` | (mandate_version_id, agency_id) → mandate_versions(id, agency_id) |
| mandate_coverages | `fk_mandate_coverages_route` | (route_id, agency_id) → routes(id, agency_id) |
| coverage_signers | `fk_coverage_signers_coverage` | (coverage_id, agency_id) → mandate_coverages(id, agency_id) |
| coverage_signers | `fk_coverage_signers_signer` | (signer_id, agency_id) → signers(id, agency_id) |
| authority_events | `fk_authority_events_mandate` | (mandate_id, agency_id) → mandates(id, agency_id) |
| authority_events | `fk_authority_events_coverage` | (coverage_id, agency_id) → mandate_coverages(id, agency_id) |
| cases | `fk_cases_route` | (route_id, agency_id, platform) → routes(id, agency_id, platform) |
| case_authority_selections | `fk_case_authority_selections_case_record` | (case_id, agency_id) → cases(id, agency_id) |
| case_authority_selections | `fk_case_authority_selections_route` | (route_id, agency_id) → routes(id, agency_id) |
| case_authority_selections | `fk_case_authority_selections_signer` | (signer_id, agency_id) → signers(id, agency_id) |
| case_authority_coverages | `fk_case_authority_coverages_selection` | (selection_id, case_id, agency_id, route_id) → case_authority_selections(id, case_id, agency_id, route_id) |
| case_authority_coverages | `fk_case_authority_coverages_coverage` | (coverage_id, route_id, agency_id) → mandate_coverages(id, route_id, agency_id) |
| use_mappings | `fk_use_mappings_work` | (case_work_id, case_id) → case_works(id, case_id) |
| use_mappings | `fk_use_mappings_reported_item` | (reported_item_id, case_id) → reported_items(id, case_id) |
| case_facts | `fk_case_facts_work` | (case_work_id, case_id) → case_works(id, case_id) |
| case_facts | `fk_case_facts_reported_item` | (reported_item_id, case_id) → reported_items(id, case_id) |
| case_facts | `fk_case_facts_mapping` | (mapping_id, case_id) → use_mappings(id, case_id) |
| correspondence_bindings | `fk_correspondence_bindings_case_record` | (case_id, agency_id) → cases(id, agency_id) |
| correspondence_bindings | `fk_correspondence_bindings_correspondence` | (correspondence_id, agency_id) → correspondence(id, agency_id) |
| correspondence_bindings | `fk_correspondence_bindings_reported_item` | (reported_item_id, case_id) → reported_items(id, case_id) |
| prompt_snapshots | `fk_prompt_snapshots_authority_selection` | (authority_selection_id, case_id) → case_authority_selections(id, case_id) |
| prompt_snapshots | `fk_prompt_snapshots_parent_binding` | (parent_binding_id, case_id) → correspondence_bindings(id, case_id) |
| notice_candidates | `fk_notice_candidates_prompt` | (prompt_snapshot_id, case_id) → prompt_snapshots(id, case_id) |
| validation_runs | `fk_validation_runs_candidate` | (candidate_id, case_id) → notice_candidates(id, case_id) |
| candidate_assessments | `fk_candidate_assessments_candidate` | (candidate_id, case_id) → notice_candidates(id, case_id) |

MySQL/InnoDB composite FKs use MATCH SIMPLE semantics: if any referencing column is NULL the FK is not checked. This is intentional for nullable links (for example unbound intake `cases.route_id`), and it is why INVARIANTS §3 keeps FactScope key consistency as an API/service rule ("do not assume null composite FK validates this"). C5 tests must not claim SQL enforcement for those service rules.

## 3. Rules that remain service-level (not in this migration, by design)

From INVARIANTS §3: `Route.preferredCoverageId` belongs to the same route; current authority-selection pointer consistency; AuthorityEvent coverage belongs to its mandate; FactScope/nullable-key consistency; FactSource/AssessmentSource same-case links; source authorization scope; frozen-version immutability; unique successor/non-forking revisions beyond declared unique keys; snapshot-reference delete guards. These are later-phase obligations and are not represented as SQL here.
