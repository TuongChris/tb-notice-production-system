# P0 final report — first PC, CI and Windows browser

Mission TB-P0-LOCAL-BOOTSTRAP. Recorded 2026-09-23 on the first PC after P0-E (review gate R3); updated 2026-09-23 at the Windows-browser checkpoint with the operator-reported Windows-browser result. This report covers first-PC, GitHub Actions and operator-reported evidence. The second-PC reproduction has **not** been run.

## Status by scope (not collapsed)

| Scope | Status | Basis |
|---|---|---|
| **P0_FIRST_PC** | **PASS** | P0-A…P0-E implemented and executed on the first PC; all automated checks below pass (the Windows-browser check is its own scope) |
| **P0_CI** | **PASS** | GitHub Actions runs `35863416044` (commit `0dfc7a5`) and `35864210436` (commit `f6f5a96`, documentation-only), both jobs success on the first attempt, cold install |
| **P0_WINDOWS_BROWSER** | **PASS — OPERATOR_REPORTED** | Runbook §11 performed manually by the operator on the first (home) Windows PC, reported 2026-09-23; not automated or document-reviewed evidence (see *Windows-browser verification*) |
| **P0_SECOND_PC** | **NOT_RUN** | Pending operator run of `docs/architecture/SECOND_PC_REPRODUCTION_RUNBOOK_v1.md` on the `P0_REPRODUCTION_BASELINE` commit |
| **P0_OVERALL** | **NOT_COMPLETE** | Second-PC reproduction outstanding (P0-26, P0-27) |

> **Addendum 2026-09-24 — development topology (ADR-0003).** The operator made the home PC (the first PC above) the primary development workstation and deferred the second-PC reproduction. Current statuses: `P0_SECOND_PC = DEFERRED_BY_OPERATOR`, `P0_TWO_PC_ACCEPTANCE = NOT_COMPLETED`, `P0_SINGLE_PC_BASELINE = VERIFIED`. `P0_OVERALL` stays NOT_COMPLETE against the original two-PC acceptance contract. The table above is kept as recorded on 2026-09-23. The runbook is unchanged and remains valid for any future workstation. Current state: `docs/CURRENT_STATE.md`.

`P0_REPRODUCTION_BASELINE` is the documentation-only commit that records the Windows-browser checkpoint, designated once its branch CI run succeeds. Its SHA is reported with the checkpoint (a commit cannot contain its own SHA); `feature/p1-auth-shell` branches from this commit, the second-PC reproduction checks it out, and `bootstrap/p0-local` takes no P1 application code.

`EXTERNAL_LEGAL_ACTIONS=0` · `REAL_CASE_MUTATIONS=0` · `G7_CREATED=0` · `DEPLOYMENTS=0` · `REAL_TB_DATA_IN_GIT=0`.

## Phase evidence index

| Phase | Evidence |
|---|---|
| P0-A toolchain | `TOOLCHAIN.md` |
| P0-B infrastructure/shells | `DOCKER_MYSQL.md`, `PRISMA.md` |
| P0-C1–C4 schema/migration draft | `PRISMA.md`, `MIGRATION_DRAFT.md`, `CONSTRAINT_INVENTORY.md`, ADR-0001 |
| P0-C5/C7 migration runtime + structural tests | `C5_C7_DATABASE_RUNTIME.md`, `metadata/*.json`, `evidence/c5-*.txt`, `evidence/c7-*.txt` |
| P0-D contracts | `P0_D_CONTRACTS.md`, ADR-0002, `evidence/p0d-*` |
| P0-E (this report) | sections below, `evidence/p0e-ci-run-35863416044.txt` |
| Windows-browser checkpoint | *Windows-browser verification (operator-reported)* below |

## P0-E results (first PC)

| Item | Result |
|---|---|
| ADR-0002 | ACCEPTED 2026-09-23 at R2; ajv-formats 3.0.1 kept exact-pinned as a runtime dependency; version changes are contract-sensitive |
| Architecture correction | Active `TECHNOLOGY_ARCHITECTURE_v1.md` §9: dated P0-D verification correction (Zod 4.6.5 string limits count code points; TB keeps its own helper; parity tests authoritative). Frozen pack copy unchanged |
| Transition-only assertion | Isolated in `tests/transition/` → `yarn test:transition-baseline` (opt-in; not in `yarn test`/CI; passes at this commit, expected to fail after the first approved contract edit). Port determinism, docs/reference refusal and fail-closed translation (unsupported constructs) stay in `yarn test` |
| `yarn test` | 7 files, **858 passed**, 0 failed (contract parity incl. 27 379 three-way payloads with 0 divergences, tooling, port fail-closed, seed guard) |
| `yarn test:db` | **22 passed** on `tb_notice_test` |
| `yarn db:seed` | Inserted, then `unchanged (already canonical)`; rows=1; canonical digest `0ee26dc3ee5f3a1030fb78a6cadaf4dabef1f5a296b58163248584e1e0bfb775`; drift of `display_name`/`enabled` restored; 11 forbidden targets refused before connecting |
| `yarn smoke:local` | `[smoke] PASS (9 checks)`: MySQL healthy + runtime query, build, API and `vite preview` on loopback, health valid against the active contract directly and via proxy, web shell + bundle via `http://localhost:5173`, ports released. Negative controls: MySQL stopped → exit 1; port 3000 occupied → exit 1 |
| `yarn dev` shutdown | Yarn `foreach` orchestration failed the top-only SIGINT case (API and Vite left running). Replaced by `scripts/local/dev.ts`. `yarn dev:verify-shutdown`: terminal Ctrl+C, top-only SIGINT and SIGTERM (wrapper) and Ctrl+C on `yarn dev` → 4/4 PASS, exit 0 in ≈0.6 s, ports released, no leftovers. Limitation: a signal sent only to the top `yarn` PID is not forwarded by Yarn; tools that signal one PID should run `node scripts/local/dev.ts` |
| Reference/contract integrity | `reference:check` OK before/after; both manifests unchanged; `contracts:check` OK; `reference:helper-tests` 27/27 |
| Static checks | `typecheck` (all workspaces, tests, scripts), `lint`, `format:check`, `build` — exit 0 |

## CI (GitHub Actions)

- Workflow: `.github/workflows/ci.yml` — push (all branches) and pull_request; `permissions: contents: read`; `ubuntu-24.04`; Node **24.21.0**; `actions/checkout` v7.0.1 and `actions/setup-node` v7.0.0 pinned by commit SHA; no dependency cache; bash with pipefail; no deploy, no cloud/production credentials, no db push/reset/FK disabling.
- Run **35863416044** — https://github.com/TuongChris/tb-notice-production-system/actions/runs/35863416044 — commit `0dfc7a5497fff67df936d3309fe618831e745c61`, 12:53:50Z → 12:56:11Z, **success** on the first attempt; no failures, no fixes needed.
  - Job *Non-DB checks (cold install)* (107188923142): Yarn cache folder **absent (cold)** before install; `308 packages were added (+ 391.4 MiB)` in ~14 s; reference:check, helper tests 27/27, contracts:check, typecheck, lint, format:check, test (7 files passed), build, tree unchanged.
  - Job *Database, seed and smoke (MySQL 8.4.11)* (107188923525): synthetic `.env` generated and masked; committed compose.yaml → `mysql:8.4.11@sha256:0744ee5e…` healthy on `127.0.0.1:3307`; migrate deploy test/replay/dev (second replay deploy `No pending migrations to apply.`), `db:verify` PASS ×4 (33/541/50/34/125/30, checksum `b54c36fd…`), test:db 22/22, seed digest identical to the first PC, both Prisma diffs empty, smoke 9/9, dev shutdown 4/4, references and tree unchanged.
- Run **35864210436** — https://github.com/TuongChris/tb-notice-production-system/actions/runs/35864210436 — commit `f6f5a960baec483b0299f219ca7924593e83fcf1` (documentation-only), 13:01:10Z → 13:04:29Z, **success** on the first attempt.
  - Job *Non-DB checks (cold install)* (107191581233): cache **absent (cold)**, 308 packages; helper tests 27/27, contracts:check OK, 7 files / 858 tests passed, references intact.
  - Job *Database, seed and smoke (MySQL 8.4.11)* (107191580983): test:db 22/22, second replay deploy `No pending migrations to apply.`, seed `inserted` then `unchanged (already canonical)` with digest `0ee26dc3…b775`, smoke 9/9, dev shutdown 4/4, references intact.
- The checkpoint commit's own run is reported with the checkpoint (a commit cannot record its own run).
- Log review (both runs): the only masked values are GitHub's own `GITHUB_TOKEN` in action inputs; no database secret appears.

## Windows-browser verification (operator-reported)

Evidence class **OPERATOR_REPORTED**: the operator performed the manual check (runbook §11) on the first (home) Windows PC and reported the result on 2026-09-23. It is not automated evidence and not document-reviewed: no screenshot, browser log or other artefact was supplied or reviewed, and the engineer did not observe the browser.

The operator reports:

- `http://localhost:5173` loaded successfully in the Windows browser;
- the P0 shell was visible;
- API health reported `ok`;
- `http://localhost:3000/api/v1/health` returned the expected JSON response;
- Ctrl+C was used to stop the local dev process.

Not stated in the report:

- the browser name/version (runbook §11 asks for it) and the time;
- the commit under test. The first-PC checkout was `f6f5a96`, clean and equal to origin, when the checkpoint began; the checkpoint commit changes documentation only;
- a port check after Ctrl+C. Port release after Ctrl+C is covered by the automated `yarn dev:verify-shutdown` (4/4, first PC and CI).

Runbook §11 step 4 names the proxied URL `http://localhost:5173/api/v1/health`; the operator reported the direct API URL. The page's own health line is requested through the web proxy: the relative `/api/v1/health` request in `apps/web/src/app/App.tsx`.

## Acceptance matrix (active copy of the frozen P0_ACCEPTANCE_MATRIX)

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| P0-01 | Reference manifests and branch/worktree inspected | PASS | pre-flight of every phase; `reference:check` |
| P0-02 | Root ignore and reference-aware text policy before installs | PASS | commit `5da474b` |
| P0-03 | Exact versions from official metadata | PASS | `TOOLCHAIN.md` |
| P0-04 | Yarn workspaces, one-way contracts graph | PASS | `package.json`, `@tb/contracts` deps |
| P0-05 | Lockfile from fresh resolution; immutable install | PASS | first PC + CI cold install |
| P0-06 | Pinned MySQL 8.4, scoped schemas/users, loopback, UTC | PASS | `DOCKER_MYSQL.md`, CI |
| P0-07 | Prisma format/validate/generate | PASS | `PRISMA.md` |
| P0-08 | Generated ESM client in compiled Nest | PASS | `PRISMA.md`, smoke |
| P0-09 | Draft migration compared; custom checks/collation | PASS | `MIGRATION_DRAFT.md`, `CONSTRAINT_INVENTORY.md` |
| P0-10 | Migration applied to empty DBs without the preview | PASS | `C5_C7_DATABASE_RUNTIME.md`, CI |
| P0-11 | FK and composite same-agency/case rejection | PASS | test:db S01–S03 |
| P0-12 | Unique, RESTRICT, range, version, signature/time CHECKs | PASS | test:db S04–S14, metadata |
| P0-13 | Collation and Unicode preservation | PASS | test:db S06–S07 |
| P0-14 | Replay; second deploy creates nothing | PASS | first PC + CI |
| P0-15 | Shadow/drift preserves custom SQL; no reset path | PASS | drift diffs/probe empty; no reset/push command exists; guard refusals |
| P0-16 | Idempotent synthetic seed, disabled actor only | PASS | this report, CI |
| P0-17 | 284 schemas / 141 operations preserved | PASS | `P0_D_CONTRACTS.md` |
| P0-18 | Zod typecheck/runtime + Ajv 2020 parity | PASS | `yarn test` |
| P0-19 | Generate works; check detects drift without mutation | PASS | `yarn test`, disposable-clone tamper |
| P0-20 | Format/lint/typecheck/tests/build pass | PASS | first PC + CI |
| P0-21 | DB-backed health; unavailable DB not healthy | PASS | `PRISMA.md`, smoke |
| P0-22 | Web proxy / compiled API / **Windows browser** smoke | PASS (browser part OPERATOR_REPORTED) | automated proxy/API/web checks PASS (smoke, CI); Windows-browser part reported PASS by the operator on the first PC, 2026-09-23 — not automated evidence |
| P0-23 | Diff reviewed; no secrets, real cases or reference drift | PASS | secret scans per commit; reference:check |
| P0-24 | CI workflow without deploy/production credentials | PASS | `.github/workflows/ci.yml` |
| P0-25 | Actual CI run passes, commit/run recorded | PASS | run 35863416044 @ `0dfc7a5`; run 35864210436 @ `f6f5a96` |
| P0-26 | Second PC fresh clone of the same commit | NOT_RUN | runbook, on the `P0_REPRODUCTION_BASELINE` commit |
| P0-27 | Second PC deploys committed migration, seed/check/test/build/run | NOT_RUN | runbook |
| P0-28 | Final report distinguishes scopes | PASS (first-PC/CI/browser version) | this report; to be updated after P0-26/27 |

Deferred groups (P1 auth/admin/CSRF, P2+ HTTP CRUD/ETag/idempotency, P3+ freeze races, P4+ case/source scope, P5+ prompt/candidate/readiness/export, hardening E2E/restore/deployment) remain **DEFERRED**.

## Known limitations and warnings

- Second-PC reproducibility is unproven until the operator runs the runbook. The Windows-browser result is operator-reported: P0 has no automated browser test, and no browser name/version was reported.
- `yarn dev` in a terminal stops cleanly on Ctrl+C; a supervisor that signals only the `yarn` PID must use `node scripts/local/dev.ts`.
- Prisma downloads its schema engine on first CLI use (build scripts are disabled by Yarn's default); CI and the second PC need network access to Prisma's engine distribution for that.
- The frozen `openapi.yaml` uses YAML anchors/aliases (default `yaml` limits refuse it); the generated YAML has none.
- The generated contract JSON files intentionally have no trailing newline (byte identity with the frozen files).
