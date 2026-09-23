# TB Notice Production System — Repository Blueprint v1

Release: **TB-ARCH-v1.0.0**. One private repository; Yarn Workspaces only.
The reported branch `bootstrap/p0-local` and commit `1d4103d` come from the operator-provided Claude report, not a fresh GitHub inspection by the pack author. The implementation agent must inspect current Git state before any action.

## 1. Target layout

```text
tb-notice-production-system/
  apps/
    web/                         # @tb/web, minimal React/Vite shell in P0
      src/app/
      src/main.tsx
      package.json
      vite.config.ts
    api/                         # @tb/api, Nest shell + health + Prisma in P0
      src/main.ts
      src/app.module.ts
      src/infrastructure/database/
      src/modules/health/
      prisma/schema.prisma
      prisma/migrations/
      prisma/seed.ts
      prisma.config.ts
      generated/prisma/          # runtime-generated, ignored
      package.json
  packages/
    contracts/                   # @tb/contracts, no dependencies on either app
      src/api/                   # editable Zod wire shapes
      src/api/operations.ts      # editable operation metadata, not duplicated DTOs
      src/domain/                # shared vocabulary checked against storage
      src/production/pfc-youtube-email-v1_1/
      src/index.ts
      schemas/                   # generated JSON Schema, committed
      openapi/                   # generated JSON/YAML, committed
      package.json
  scripts/
    contracts-generate.ts
    contracts-check.ts
    verify-reference-integrity.*
    db-structural-tests.*
  tests/                         # executable synthetic infrastructure tests
  docs/
    product/PRODUCT_DEFINITION_v1.md
    domain/DOMAIN_MODEL_v1.md
    contracts/PRODUCTION_FORM_CONTRACT_v1.md
    architecture/                # this pack's active specifications
    decisions/                  # implementation ADRs, not fake pre-approved decisions
    verification/p0/            # actual redacted execution reports after P0
    reference/
      database-api-v1/TB_DATABASE_SCHEMA_API_CONTRACT_v1/  # frozen original
      architecture-v1/TB_ARCHITECTURE_SPECIFICATION_PACK_v1/ # frozen pack copy
  .github/workflows/ci.yml
  CLAUDE.md
  README.md
  .nvmrc
  .yarnrc.yml
  .gitattributes
  .gitignore
  .env.example
  compose.yaml
  package.json
  yarn.lock
  tsconfig.base.json
```

A directory in this blueprint is a responsibility boundary, not a demand for empty folders. P0 need not create future Agency/Case/Candidate feature modules. Existing README/.nvmrc must be preserved and extended intentionally, not silently overwritten by an import script.

## 2. Frozen reference handling

Do not rename, move, normalize, reformat or run writing generators inside `docs/reference/database-api-v1/`. Keep all original files and the checksum manifest. Use working copies in active paths. Do not run `verify_contracts.py` in place.

This new pack's importer adds a full frozen copy under `docs/reference/architecture-v1/` and copies the seven active specs plus SOURCE_REGISTER into their final docs paths. Existing differing files cause refusal before copying, not overwriting. It does not initialize the app, edit root config, install packages, commit or push.

Avoid whole-repository formatting/linting/generation sweeps that change reference artifacts. Exclude both frozen reference trees from formatter, linter, TS compilation and auto-generated import discovery. Verify their manifests separately.

## 3. LF and exact bytes

Repository source uses UTF-8 and LF. Suggested `.gitattributes` added during approved P0:

```gitattributes
* text=auto eol=lf
docs/reference/** -text
*.zip -text
*.png -text
*.jpg -text
*.pdf -text
```

The explicit frozen-reference exception preserves original checksum bytes instead of re-normalizing archive material. No `git add --renormalize .` across the repository. Candidate/prompt/correspondence hashes apply to exact stored application text, not Git line-ending treatment of source files.

## 4. Ignore policy before installing packages

Create root `.gitignore` first in approved implementation. Cover node_modules, local .env variants, build outputs, coverage, logs, runtime-generated Prisma client, temporary files, local database dumps/volumes and AI auth/session state. Preserve exceptions for `.env.example`.

Do not ignore yarn.lock, real Prisma migrations, or generated schemas/OpenAPI intentionally designated committed outputs. Ignore `.yarn/install-state.gz` and local tool state as appropriate; do not blanket-delete existing files. `.gitignore` cannot remove already tracked secrets; inspect the staged diff before every authorized commit.

## 5. Root command contract

| Command | Required behavior |
|---|---|
| `yarn dev` | Start web/API in WSL on fixed loopback ports; clean shutdown of both |
| `yarn build` | Build shared contracts, web and API with actual production compiler behavior |
| `yarn typecheck` | Strict typecheck active workspaces, not frozen reference trees |
| `yarn lint` | Lint active source and scripts |
| `yarn format:check` | Check only, never rewrite files |
| `yarn test` | Pure/helper/contract tests without requiring production resources |
| `yarn test:db` | Structural tests only on an explicitly disposable local MySQL target |
| `yarn contracts:generate` | Regenerate designated active committed contract outputs |
| `yarn contracts:check` | Compare temporary generation, fail on drift without modifying the tree |
| `yarn reference:check` | Verify frozen reference integrity without running their writing verifier |
| `yarn db:validate` | Run actual Prisma validation using active config |
| `yarn db:generate` | Generate the local client from active schema |
| `yarn db:migrate:dev` | Migration-author workflow only on explicitly disposable dev/shadow DBs |
| `yarn db:migrate:deploy` | Apply already committed migrations; no generation/reset |
| `yarn db:seed` | Idempotent synthetic-only seed with local guards |
| `yarn smoke:local` | Launch/check compiled API + DB-dependent health and local web shell |

No no-op script may print PASS to satisfy the command list. A command requiring Docker must fail with an actionable prerequisite message if unavailable. P1 `admin:create` and later `test:e2e` are not P0 runtime features.

## 6. Generator/check locations

Script source is versioned and readable. No undocumented generator that only exists in an AI session. Build output is not the editable source. Handwritten operation metadata plus Zod definitions produce OpenAPI; a generated spec must not be edited independently from its source.

The existing SQL preview is review-only. The implementation schema is edited in `apps/api/prisma/schema.prisma`, and custom database semantics are preserved in migration SQL plus a checked inventory. A full model-catalog -> Prisma -> docs generator is not required in P0.

## 7. CLAUDE.md content

Create CLAUDE.md only during approved P0. It must state: read-order/source precedence; exact commands; one-writer rule; frozen references; local-only data/network scope; no real facts/sign/send/G7; no readiness-from-technical-PASS; migration and secret safety; package-version verification; required stop conditions; actual-reporting policy; and no automatic move to P1.

Do not embed customer records, authentication tokens, real owner statements, personal signatures or session history. Phase state may be recorded in a small `docs/CURRENT_STATE.md`, but it must not supersede legal sources or pretend to synchronize local databases.

## 8. Git and two-PC handling

One feature writer creates the initial migration and commits it after review. The other PC pulls the same commit and runs migrate deploy. No USB/Drive copy of working clones or Docker volumes; no .env in Git. A branch with a checkpoint is safer than uncommitted work left on another PC.

No commit, push or merge occurs during read-only reinspection. The docs import is a separate explicit documentation operation. P0 implementation also must not push/merge or rewrite history without permission. Store actual test results with the exact commit and environment, not screenshots of unrelated past checks.

## 9. CI

Prepare GitHub Actions for the reviewed branch: pinned Node/Yarn, immutable install, frozen reference check, contract parity/drift checks, formatting/lint/typecheck/tests/build, and a disposable matching MySQL job for migration/structural checks. The CI service may use a CI-specific database port while preserving engine/image/schema semantics; never change local ports to make CI work.

A workflow file existing does not mean CI has run. Record CONFIGURED_NOT_RUN until a real run has been observed. CI cannot use production credentials. No auto-deploy step. No passing placeholders for future service/E2E tests.

## 10. Evidence of completion

Expected P0 artifacts include toolchain selection/versions, actual migration and semantic-comparison report, raw redacted command logs, test reports, OpenAPI parity results, reference integrity checks and first-/second-PC reproduction reports. Distinguish authoring-container checks of this documentation pack from application implementation tests.
