# ADR-0001 — Manual MySQL semantics in Prisma migrations

Status: **ACCEPTED** — 2026-09-23, by the operator at review gate R1 (result PASS_WITH_NOTES). Proposed at P0-C4 on 2026-09-23.
Scope: `apps/api/prisma/migrations/**` for MySQL 8.4 with Prisma 7.10.0.
Acceptance boundary: this approves an engineering migration strategy only. It creates no legal or factual authority, no case finding and no readiness state.

## Context

The frozen TB-SCHEMA-API-v1.0.0 design requires database semantics that `schema.prisma` cannot express:

1. Binary collation `utf8mb4_0900_bin` on every domain table (case-sensitive identifiers such as YouTube video IDs; no accent/case folding of exact text).
2. Thirty CHECK constraints from the frozen SQL preview: seven domain/time rules (interval ordering, millisecond safe-integer bound, boundary-convention vocabulary, unsigned-only `signature_state = 'HUMAN_PENDING'`, session and validation-run time ordering) and twenty-three version/revision/occurrence lower bounds.

`prisma migrate dev --create-only` produced a draft with `COLLATE utf8mb4_unicode_ci` (case/accent-insensitive) on all 33 tables and no CHECK constraints. Prisma's documented workflow for unsupported database features is to customize a draft migration before it is applied (Source Register TECH-07). The architecture requires the separate shadow schema and forbids `db push` (AR-010, P0 Bootstrap Contract §6).

## Decision

1. **Where the semantics live.** Collation/engine and CHECK constraints live in reviewed migration SQL, recorded in `docs/verification/p0/CONSTRAINT_INVENTORY.md`, and are verified against the frozen preview with `scripts/db/sql-semantic-compare.mjs`. `schema.prisma` remains the editable model for everything Prisma can express.
2. **How the draft is augmented.** Only two edit classes are allowed on a generated draft, both before first apply:
   - M1: replace the generated table options with `ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin` on every domain table;
   - M2: append `ALTER TABLE … ADD CONSTRAINT <frozen name> CHECK (<frozen expression>)` statements copied verbatim from the frozen preview.
   Generated column/index/FK statements are not edited. A header comment in the migration lists the augmentations.
3. **Semantic, not textual, equivalence.** Acceptance is zero semantic differences from the frozen preview (tables, columns, types, unsignedness, nullability, defaults, PK, unique keys, indexes, FK targets/actions, CHECK expressions, engine/charset/collation). Statement order and naming are recorded but not semantic (AR-011).
4. **History is append-only once applied.** After the reviewed initial migration is applied anywhere shared, a correction is a new migration; applied migration files are never edited to make drift disappear. Rebuilding a truly disposable, unshared rehearsal is a separately reported operation.
5. **Future schema changes.** Any later migration that recreates or alters a table must re-state the binary collation and must not drop or weaken these CHECK constraints; the semantic comparison and structural tests are the guard. New CHECK rules require an explicit design decision, not a silent addition.
6. **Drift tooling is not trusted blindly.** Prisma's drift/shadow comparison does not model CHECK constraints and may not model table collation. C5 must exercise the shadow/drift workflow, record any warnings, and verify enforcement from MySQL metadata (`information_schema.CHECK_CONSTRAINTS`, `TABLES.TABLE_COLLATION`, `COLUMNS.COLLATION_NAME`) and negative inserts. A drift report proposing to drop these constraints is a stop condition, not something to accept.

## Consequences

- The migration file differs from Prisma's raw output; reviewers must read the header and the M2 section.
- `schema.prisma` alone is insufficient to reproduce the database; migration history is authoritative for these rules (hence no `db push`).
- The runtime session collation is set to `utf8mb4_0900_bin` by the API driver configuration so literal comparisons in application sessions are also binary.
- Prisma's `_prisma_migrations` table keeps Prisma's own collation; it holds no domain data.

## Alternatives considered

- **Generated-only migration (no augmentation):** rejected; loses case sensitivity and all CHECK constraints required by the frozen design.
- **Applying the frozen preview SQL directly:** rejected by P0 Bootstrap Contract §6 (the preview is review input, not a migration).
- **Separate follow-up migration for checks/collation:** rejected for the initial schema; it would create a window in history where the schema violates the design, and table-collation changes after creation are costlier. It remains the correct pattern for any change after the initial migration is applied.
