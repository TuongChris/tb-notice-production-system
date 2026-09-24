# TB Notice Production System — P0 Bootstrap Contract v1

Release: **TB-ARCH-v1.0.0** · Mission: **TB-P0-LOCAL-BOOTSTRAP**.
This is the implementation contract to use **after** a separately approved plan. Importing this pack or completing read-only reinspection does not start implementation.

## 1. Objective and staged completion

Prove a reproducible local foundation: a clean clone can install the locked toolchain, start MySQL, apply the committed migration, seed synthetic rows, run structural/contract tests, build and launch minimal web/API shells.

Report separate states:

- **P0_LOCAL_IMPLEMENTATION**: first PC actual local tests.
- **P0_CI**: configured, not run, passed or failed, with real run evidence.
- **P0_SECOND_PC_REPRODUCTION**: pending, passed or failed on a fresh clone.
- **P0_OVERALL**: not complete until all required scopes have passed.

A first-PC PASS can be recorded while the second PC remains pending. Do not hold independent preparation work hostage to the second PC, but do not call overall P0 VERIFIED_COMPLETE early. No P1 feature work begins automatically.

## 2. Read order and baseline

Read ARCHITECTURE_RESOLUTIONS first, then Product Definition, Domain Model, Production Form Contract, Technology Architecture, Repository Blueprint, this contract and the frozen Database/API README/API_CONTRACT/INVARIANTS/schema/fixtures.

Verify current branch/worktree before writing. Preserve existing README/.nvmrc/specs and all frozen manifests. The existing SQL preview is not a migration to run. Prior reported 46/27 checks are historical artifact checks, not tests of this workstation or app.

## 3. Authorized scope when implementation is approved

Create workspaces, root safety/config files, app shells, shared contracts infrastructure, the active Prisma schema/config/client, a real initial migration, synthetic fixture seed, structural tests, build/typecheck/lint scripts, documented commands and CI. One MySQL Docker service; application processes run in WSL.

No business CRUD, authentication/login/admin UI, actual prompt generator, candidate readiness/export endpoint, legal-rule engine, mailbox/Drive/AI integration, real data ingestion or production deployment. Future tables may exist in the initial migration without future endpoints being implemented.

Development-only official documentation/registry/image downloads are allowed after implementation approval. Never send customer sources, legal facts, private correspondence or secrets to tools as part of package verification.

## 4. Phase P0-A — safety and toolchain inventory

Create root .gitignore and frozen-reference-aware .gitattributes before package installation. Do not normalize or stage old reference files. Inspect available Node, Corepack/Yarn, Git, Docker client/server/Compose in WSL, without changing system-wide settings unnecessarily.

Target Node 24; select exact compatible stable Yarn 4, TypeScript, React/Vite, Nest/Express, Prisma 7 client/CLI/adapter, Zod 4, Ajv 8/formats, test/lint/format tools. Use official package/release metadata, engines and peer dependencies. Record exact tested versions and image digest. Never rely on earlier invented “latest” claims. No automatic major upgrades or silent Node downgrade.

Pin packageManager and commit lockfile in the authorized commit step. First resolve/install can create the lockfile; subsequently immutable install must pass. Do not commit a placeholder `yarn@4.x.x` as an installable version.

## 5. Phase P0-B — local infrastructure and minimal app

Use fixed loopback ports from Technology Architecture. Initialize one pinned MySQL8.4 container and the named dev/shadow/test/replay databases with scoped users. Store generated credentials only locally. Do not connect to any production/external database.

API: only the minimal `/api/v1/health` service, backed by an actual bounded DB connectivity query. Preserve the existing Health data shape `{status: 'ok' | 'unavailable'}` and shared response envelope. Do not introduce an undocumented public field for DB internals or credentials. When DB is unavailable, return the documented unavailable state; if a different HTTP status/body shape is desired, report the proposed contract change rather than silently modifying the frozen API. Operational failures are distinguishable through redacted internal logs/tests, not fake health PASS.

Web: a minimal React/Vite shell can display health through the dev proxy. No Agency/Case feature pages. Prove fixed ports, compiled API launch, web development page and production build output. Full single-process production-like static serving may be deferred; production hosting is not a P0 dependency.

## 6. Phase P0-C — Prisma and migration rehearsal

Copy the schema to the active API location; do not mutate reference bytes. Confirm config, ESM/client generation and official MySQL driver adapter with actual commands. Technical edits to syntax/import/build paths are permitted; a change to nullability, identity, cardinality, FK scope, delete behavior, byte semantics or readiness boundary is not silently permitted.

Migration-author workflow:

1. Confirm explicit disposable database allowlist and separate shadow URL.
2. Run actual format, validate and generate using active config.
3. Create a draft initial migration with `migrate dev --create-only` or the selected version's documented equivalent.
4. Review generated SQL. Add all required custom CHECK/collation clauses **before first apply**. Include **all** reference checks, not only the seven special ones; version/revision/occurrence lower bounds also matter.
5. Produce a constraint inventory and semantic comparison. Exact generated constraint names/order need not match the preview. Every mismatch in meaning needs a stated decision.
6. Apply the reviewed migration to empty local dev/test databases.
7. Inspect actual schema metadata and behavior; run negative and positive structural tests.
8. Replay migration history on a separate empty replay DB; run migrate deploy twice to show already-applied behavior.
9. Exercise the migration author's shadow/drift workflow without resetting real/developer work or dropping custom constraints. Record unsupported-feature warnings and explicit verification, not a cosmetic “zero warnings” target.
10. Preserve the tested migration. A repair after application is a new migration; do not edit applied shared history to make drift disappear. Rebuilding truly disposable unshared initial rehearsal is a separately reported operation, never automatic on an ambiguous target.

Prisma validate alone does not execute or prove MySQL constraints. Do not apply initial-schema.preview.sql as a substitute for a generated, reviewed migration. No `db push`, global privilege workaround, foreign-key disabling or automatic destructive reset.

## 7. Semantic comparison and structural tests

The inventory covers table/column names, storage types/sizes, unsignedness, nullability/defaults, PK, unique, FK targets/actions, indexes, CHECK meaning/enforcement and binary collation. Server-generated IDs vs ORM/client-generated UUIDs remain explicit.

Minimum behavior tests include valid inserts, invalid FK, cross-agency signer/coverage, cross-case mapping/candidate links, duplicate association/route/item-in-case, RESTRICT parent deletion, invalid version/revision, invalid interval/range, unsigned pending-state restriction, invalid date ordering and identifier case sensitivity.

Never test a non-database service rule and falsely say it is enforced by SQL. The baseline lists service-only scope, freeze, successor and snapshot-delete invariants; those remain later obligations. P0 structural tests can demonstrate transaction rollback at DB level, not claim API idempotency or freeze-race behavior that is unimplemented.

Run tests on `tb_notice_test` or replay, with guards against any non-local/unrecognized URL. Seeds and test data use clearly synthetic identifiers and no network dereferencing of source/video URLs.

## 8. P0 fixture actor versus P1 admin

Many reference tables require createdById. P0 may seed a **disabled synthetic actor User** with `enabled=false` and an unusable non-credential passwordHash marker for relational fixtures. It is not a human Signer, not an admin bootstrap flow, and cannot authenticate. Do not commit a usable test-admin password.

`db:seed` is idempotent, synthetic-only and protected by explicit environment/database checks. P1 will create actual local administrators through a reviewed local CLI, with a separately chosen password. This resolves the actor-FK requirement without implementing authentication in P0.

## 9. Phase P0-D — contract source migration and parity

The complete machine declarations (284 schemas/141 operations) remain compatibility input, not 141 services to implement. Port them to active sources according to AR-002; preserve exact public meanings. Generators are new P0 engineering work, not tools already included in the frozen bundle.

Use restricted Zod wire definitions plus operation metadata to produce JSON Schema/OpenAPI. TypeScript types come from the same definitions. Add explicit lowering/parity for code-point string length refinements, nullable/optional behavior, format validation, numeric bounds, object strictness, named references, ETag/security and operation extensions.

Run the actual Zod package typecheck/runtime and Ajv draft-2020-12 conformance on the original 31 request fixtures plus targeted edge cases. Verify all declared schema names and all method/path/operationId metadata are retained. A coverage-count test alone is insufficient. Unsupported conversion fails closed; a concrete semantic conflict is reported rather than softened to unknown/any.

`contracts:generate` writes designated active outputs. `contracts:check` creates temporary outputs and compares without mutation. Deliberately change a generated active output in a disposable test clone, demonstrate check failure and verify the checker did not repair it. Never perform that negative test in the frozen reference directory.

Keep original Python verifier reference-only; do not execute it in place. Do not merely check the old manifest and label that a working active generation pipeline.

## 10. Phase P0-E — checks, CI and handoff

Required local commands: reference:check, contracts:check, db:validate, db:generate, db:migrate:deploy, db:seed, test:db, format:check, lint, typecheck, test, build and smoke:local. Record exact command, cwd, environment identity, exit code and redacted output. No command is PASS when skipped or replaced by a mocked print statement.

Configure CI to perform matching checks with disposable databases and locked dependencies. Observe an actual CI run only after an authorized push; otherwise report CONFIGURED_NOT_RUN. A created YAML file is not a passing run.

First PC: record commit/lockfile/image and actual checks. Second PC: clean clone of the same commit, same locked dependencies/image, its own local secrets/database, migrate deploy (not migrate dev), seed, checks/build and Windows-browser test. Do not copy the first PC's node_modules, client output, volumes or .env.

## 11. Deferred tests and phase allocation

| Requirement | Implementation phase |
|---|---|
| Local schema/FK/unique/CHECK/collation and migration replay | P0 |
| Contract generation/parity and root build/health | P0 |
| Sessions, CSRF, Origin, local admin creation | P1 |
| Directory HTTP CRUD, ETag/idempotency behavior | Directory phase when endpoints are added |
| Authority freeze/edit race; same-scope services | Representation phase |
| Case source/fact scoping and immutable correspondence | Case phase |
| Prompt consistency and candidate semantic review/readiness/export | Production phases |
| Full browser E2E, restoration drills and production hardening | Later hardening phase |

The older full 60-scenario acceptance file remains a future backlog. Do not reclassify its unexecuted service tests as P0 PASS. Database backup/restore production procedures are deferred; preserve any non-disposable developer data before destructive operations regardless of phase.

## 12. Stop conditions

Stop only the affected branch for missing credentials/permissions, untrusted downloaded source, package incompatibility needing an architectural change, domain-semantic conflict, unsafe database target or an unexpected destructive plan. Continue independent safe inspection/tests where possible. Do not fix missing rights facts or missing policy support by hardcoding answers.

Do not install frameworks during the read-only plan mission, and do not commit/push/merge without the approved operation scope. P0 completion never starts P1 automatically.

## 13. Required report

Report exact versions and compatibility evidence; migration ID/hash and custom SQL; semantic comparison; commands/test results with counts only for actual tests; deviations/warnings; first-PC/CI/second-PC statuses separately; current branch/commit/worktree; frozen reference integrity; remaining blockers; next exact action. Include `EXTERNAL_LEGAL_ACTIONS=0`, `REAL_CASE_MUTATIONS=0`, `G7_CREATED=0` when those are true.

Use the supplied acceptance matrix for statuses `NOT_RUN`, `PASS`, `FAIL`, `BLOCKED` or `DEFERRED` with evidence. Its initial values are all NOT_RUN or DEFERRED; this pack does not prepopulate implementation success.
