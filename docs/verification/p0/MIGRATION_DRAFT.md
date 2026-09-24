# P0-C3/C4 initial migration draft — review gate R1

Recorded 2026-09-23 on the first PC. **The migration has not been applied to any database.** C5 (apply, replay, drift, structural tests) has not started.

> Status update (2026-09-23, after review gate R1 PASS_WITH_NOTES): C5/C7 applied this exact file (SHA-256 unchanged) to test, replay and dev and verified it; see `C5_C7_DATABASE_RUNTIME.md`. The statement above describes the R1 state. The migration file's own header comment ("NOT YET APPLIED") is part of the applied, checksummed file and is intentionally left unchanged.

## Draft

| Item | Value |
|---|---|
| Path | `apps/api/prisma/migrations/20260923103912_initial_schema/migration.sql` |
| Lock file | `apps/api/prisma/migrations/migration_lock.toml` (`provider = "mysql"`) |
| Prisma-generated SHA-256 (before augmentation) | `ac155f3183f4f539d429f070868958f777725d625d51ad6c4135e9605fa81f53` (1197 lines) |
| Reviewed/augmented SHA-256 | `b54c36fdaada7bdd31e08558a93d70e9e40fd4c48348681c9c2a124503426515` |
| Augmentations | M1 engine + `utf8mb4_0900_bin` on 33 tables; M2 30 CHECK constraints from the frozen preview (see CONSTRAINT_INVENTORY.md, ADR-0001) |

## C3 — how the draft was produced

`yarn db:migrate:create initial_schema` → `scripts/db/prisma-guarded.mjs` validated:

```
[guard] migration target: tb_migrate@127.0.0.1:3307/tb_notice_dev
[guard] shadow target:    tb_migrate@127.0.0.1:3307/tb_notice_shadow
```

then ran `prisma migrate dev --create-only --name initial_schema --config prisma.config.ts` (exit 0): "Prisma Migrate created the following migration without applying it 20260923103912_initial_schema".

Database side effects observed after C3:

| Schema | State |
|---|---|
| `tb_notice_dev` | only Prisma's `_prisma_migrations` table, **0 rows** (no migration recorded or applied) |
| `tb_notice_shadow` | 0 tables (used and cleaned by Prisma during draft computation) |
| `tb_notice_test`, `tb_notice_replay` | untouched, 0 tables |

Cross-check without any database: `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script` produced the same SQL (differs only by one trailing newline).

### Incident: an earlier, identically generated draft with a wrong name

While running negative tests of the target guard, one test case was mis-constructed and invoked a *valid* `migrate-create p0_guard_probe` instead of an invalid one. It ran the same guarded create-only command and wrote `20260923103841_p0_guard_probe/migration.sql` plus `migration_lock.toml`, and created the empty `_prisma_migrations` table. Nothing was applied (0 rows). The untracked, unapplied draft directory was moved out of the repository to the session scratchpad (not deleted) before the properly named draft was created; the two generated `migration.sql` files are byte-identical (`cmp` equal), which also demonstrates deterministic generation. No further database effect.

Guard negative tests that were correctly constructed all refused before Prisma ran: non-allowlisted schema, wrong allowlisted schema for the dev role, shadow equal to dev, non-loopback host, wrong port, `root` user, runtime `tb_dev` user used for migration, missing shadow URL, invalid migration name, unsupported command (`reset`).

## C4 — semantic comparison against the frozen preview

Tool: `scripts/db/sql-semantic-compare.mjs` (text parser; never connects to a database; fails closed on unknown DDL). Command: `yarn db:compare:preview`.

| Scope | Frozen preview | Generated draft (before C4) | Reviewed draft (after C4) |
|---|---|---|---|
| Tables | 33 | 33 | 33 |
| Columns | 541 | 541 | 541 |
| Unique keys | 50 | 50 | 50 |
| Secondary indexes | 34 | 34 | 34 |
| Foreign keys | 125 (all RESTRICT/RESTRICT) | 125 (all RESTRICT/RESTRICT) | 125 |
| CHECK constraints | 30 | 0 | 30 |
| Table engine | InnoDB ×33 | not stated ×33 | InnoDB ×33 |
| Table collation | utf8mb4_0900_bin ×33 | utf8mb4_unicode_ci ×33 | utf8mb4_0900_bin ×33 |
| **Semantic differences** | — | **96** (33 engine, 33 collation, 30 missing CHECK) | **0** |
| Name/order differences | — | 0 | 0 |

Compared per table: column type and size (INTEGER≡INT normalization), UNSIGNED, nullability, defaults (`true`≡`TRUE`≡1), ON UPDATE, AUTO_INCREMENT, column collation/charset, primary key, unique key column tuples, index column tuples, FK column tuple + target table + target columns + ON DELETE/ON UPDATE, normalized CHECK expressions, table engine/charset/collation.

Comparator self-test (mutated copies in the scratchpad; each must yield a semantic difference and exit 1): NOT NULL→NULL, VARCHAR size, UNSIGNED removed, default changed, FK RESTRICT→CASCADE, CHECK weakened (`>= 0`), signature CHECK removed, one table collation reverted, unique key removed, composite FK column order swapped — **10/10 detected**.

Known differences that are not semantic and are accepted: statement layout (both files create all tables first and then add the 125 FKs with `ALTER TABLE`; the order of individual FK statements differs), the placement of CHECK constraints (inline in the preview's `CREATE TABLE`, appended `ALTER TABLE … ADD CONSTRAINT` in the draft), whitespace and backtick spacing, and the header/section comments added by C4.

Items the text comparison cannot prove (deferred to C5 with a real MySQL): that MySQL accepts every statement, that CHECK constraints are enforced (`information_schema.CHECK_CONSTRAINTS`, negative inserts), actual table/column collation in metadata, composite-FK enforcement, and Prisma drift/shadow behavior with the customized SQL.
