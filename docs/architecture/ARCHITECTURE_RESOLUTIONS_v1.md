# TB Notice Production System — Architecture Resolutions v1

Release: **TB-ARCH-v1.0.0** · Date: **2026-09-23**.
Purpose: resolve the operator-provided Claude read-only report before P0; correct cross-document drift explicitly, not by silently editing the frozen release.

## 0. Authority, scope and precedence

This is a **proposed engineering baseline prepared at the operator's request**. It is not legal evidence, an owner confirmation, source authentication or implementation authorization. Read-only reinspection must report remaining contradictions; then the operator approves the plan before code changes.

For engineering interpretation, use this pack's explicit scoped resolutions over conflicting older prose. Keep **TB-SCHEMA-API-v1.0.0** as storage/public-wire compatibility baseline for details not expressly changed here. Current canonical evidence/control still governs legal facts and actual case readiness. Neither a chat summary nor this pack changes a signed instrument or a case finding.

Precedence is by subject: product boundary from Product Definition/PFC; storage/HTTP contract from the frozen schema/API plus explicit amendments; P0 work authorization and exit tests from P0 Bootstrap Contract; toolchain from Technology Architecture and later actually validated version lock. A new file/date does not automatically invalidate all older requirements.

## AR-001 — Missing specifications

Deliver the seven active product/domain/PFC/technology/repository/P0/resolution files, plus a source register. A prior promise to create a pack is not a delivered artifact. Import docs, verify checksums, and let Claude reread before implementation. The source register identifies source-derived rules, design decisions and unverified runtime items.

## AR-002 — Contract source of truth and missing generators

The frozen API_CONTRACT explicitly chooses JSON Schema-first. The later architecture discussion chose Zod-first. This pack makes the transition explicit: active editable **Zod4 wire definitions + operation metadata** generate JSON Schema/OpenAPI, subject to parity with the frozen interface. It does not falsely call the old Zod file authoritative in its original release.

Do not edit frozen files or author the same property in three independent representations. OpenAPI generation also needs method/path/parameters/security/response metadata; Zod alone does not supply it. Active TypeScript types are inferred from Zod. Cross-field/domain predicates remain named implementation checks unless they have an explicitly reviewed schema lowering.

The frozen adapter contains code-point length `.refine` predicates. Preserve their behavior with a reviewed Unicode primitive/lowering and edge tests; do not lose those checks through default conversion or substitute UTF-16-length limits. Unsupported/lossy conversion fails the compatibility gate. Preserve 284 schemas and 141 operation declarations without implementing all endpoints.

Prisma source ownership is separate: active schema + custom migration SQL are the editable database model; old model-catalog/SQL preview/dictionary are frozen comparison inputs. A full model-to-docs code generator is not mandatory P0 work. New contract-generation/check scripts must actually exist and run; no claim that the omitted generators are already supplied.

## AR-003 — Two Windows PCs and WSL

Each physical Windows PC uses WSL2 Ubuntu as its Linux development environment; two WSL installations on two physical PCs count as the two-PC target. Git synchronizes source/specs/fixtures/migrations only. Keep source in Linux home filesystem. LF/UTF-8 apply to active source, with `docs/reference/** -text` protecting frozen bytes. Application text hashing is independent of Git checkout line-ending rules.

## AR-004 — MySQL provisioning

Docker Desktop + WSL integration; one official MySQL8.4 container, no native MySQL/MariaDB substitute. P0 records a real pulled image patch/digest, never invents one. Named volume local only. Host publication is 127.0.0.1:3307 to container 3306. No public/network database or production access.

## AR-005 — Node version and old verification provenance

Node24 is the selected runtime major. Reference checks on Node22/TypeScript5.8.3 record a past author's environment, not a new runtime requirement. P0 tests its actually chosen compatible dependencies on Node24. Keep major24 in .nvmrc and record exact tested patch for the second PC/CI. No silent downgrade.

## AR-006 — Yarn version/mode

Yarn Modern4, exact packageManager version selected and pinned in P0; nodeLinker=node-modules. No Classic or PnP. First resolve produces the lockfile; later installs use immutable mode. Both PCs follow the same lockfile. No fake placeholder version counts as pinned.

## AR-007 — Monorepo layout

Yarn Workspaces only: apps/web, apps/api, packages/contracts with private names @tb/web, @tb/api, @tb/contracts. Active docs at product/domain/contracts/architecture/decisions. Shared contracts depend on neither app nor Prisma. No Nx/Turborepo/Lerna or generic repository framework.

## AR-008 — Frozen bundle versus working copies

Keep docs/reference/database-api-v1/TB_DATABASE_SCHEMA_API_CONTRACT_v1 byte-identical. Working copies go to active paths. Exclude frozen trees from format/lint/TS/generator sweeps. New architecture pack is also archived in its own reference subtree. No in-place editing or moving of original artifacts.

## AR-009 — Prisma runtime, adapter and module system

Target Prisma7 with the official MySQL-capable adapter verified at P0; adapter-mariadb naming does not change the chosen MySQL server. Preferred app/contracts ESM and NodeNext build paths must be proven using the generated client and compiled Nest app. Do not assume any claimed latest Nest feature or automatic schema integration exists.

Technical import/config/output-path fixes are allowed in the approved plan. Dropping composite FK/RESTRICT, changing cardinality, removing independent review or switching engines requires a separate semantic decision. P0 must run actual format/validate/generate, not just a text scan.

## AR-010 — Manual SQL, checks and shadow/drift behavior

Create initial migration as a draft, inspect, add required CHECKs/collation before apply, and test on disposable schemas. Preserve **all** preview checks, including version/revision/occurrence lower bounds beyond the seven special domain/time checks. Verify enforcement in MySQL metadata and negative tests.

Use a dedicated shadow DB with scoped migration credentials, never the same URL as dev. Replay history and exercise the selected toolchain's drift/shadow behavior after customization. Unsupported features may require explicit SQL verification; warnings must be reported, not hidden by removing constraints. Never edit shared applied history or reset unrecognized databases. Record an ADR for manual MySQL semantics.

## AR-011 — Preview comparison

Require semantic equivalence of tables/columns/types/nullability/defaults/PK/unique/FK actions/indexes/CHECKs/collation, not identical SQL order or names. Record differences and test implications. An identical textual preview is neither necessary nor sufficient for a successful migration.

## AR-012 — Python verifier mutates the frozen bundle

Do not run verify_contracts.py in place. Retain it as reference only. New active contract generation/check tools are Node/TypeScript; check generates temporarily and never fixes files on failure. Original Node pure-helper tests can run read-only. Python is not a backend or required application CI dependency.

## AR-013 — Admin bootstrap versus required actor rows

Full administrator bootstrap/authentication is P1, with a separately reviewed local CLI; no public signup. P0 may create an explicitly disabled synthetic User solely to satisfy fixture createdBy FKs, using an unusable non-credential passwordHash marker. This is not a usable admin or signer account. No committed passwords or fabricated human review records.

## AR-014 — Hosts, ports, timezone, privileges and env paths

Web 127.0.0.1:5173; API 127.0.0.1:3000; DB host 127.0.0.1:3307. Browser uses 127.0.0.1 consistently with a fixed dev proxy. UTC is verified at DB/session/application boundaries.

One root .env is explicitly loaded regardless of cwd. Runtime uses DATABASE_URL/tb_dev DML scope. CLI uses MIGRATION_DATABASE_URL plus separate SHADOW_DATABASE_URL/tb_migrate DDL scope limited to named dev/shadow/test/replay schemas. This refines the old single-DATABASE_URL config example; it changes no domain/wire field. Root is initialization-only and never the runtime login. CI may use a documented disposable service port override without changing local defaults.

## AR-015 — P0 exit criteria versus future service tests

P0 implements safety/config, locked tooling, app shells/health, real Prisma/MySQL migration, DB structural tests, synthetic seed, contract parity/generation/check and CI. Existing full application scenarios remain planned, not passed.

Freeze/edit service races, HTTP ETag/idempotency/session/CSRF, substantive source review, prompt/readiness/export behavior, full E2E and production restore drills are deferred to their feature/hardening phases. Report first-PC, CI and second-PC evidence separately. P0 overall is not complete merely because the first PC builds.

## AR-016 — Root .gitignore

Create before installation in approved P0. Exclude secrets/env variants, build/runtime artifacts, node_modules, logs, dumps, volumes, local AI auth/session files. Keep .env.example, lockfile, migrations and designated generated contracts tracked. Do not use git add . blindly, or assume ignore rules remove previously committed secrets.

## Additional compatibility clarifications from actual artifact review

| ID | Clarification | Effect |
|---|---|---|
| AR-017 | ProductionContext already uses PFC-YT-EMAIL-v1.1 | Preserve wire identifier; pack document filenames stay v1 |
| AR-018 | NoticeCandidate has no persisted readiness/candidateState field | Derived readiness stays in Readiness response; no READY PATCH |
| AR-019 | TechnicalResult/IssueSeverity include REVIEW_REQUIRED | Preserve enum names, not old generic PASSED/BLOCKED only |
| AR-020 | Provenance enum lacks OPERATOR_CONFIRMED | Preserve original label via rawProvenance; do not add or elevate silently |
| AR-021 | Video milliseconds are BIGINT/string with explicit safe bound | Do not regress to signed INT or JSON BigInt/number |
| AR-022 | Health payload is status-only in frozen OpenAPI | P0 checks DB without undocumented public fields; change proposal if necessary |
| AR-023 | SourceRole/DocumentPlan names differ from old conceptual lists | Use exact machine names; no ad hoc source_type/ACTUALLY_ATTACHED field |
| AR-024 | Arbitrary free-text assertions cannot be proved by regex | Technical/heuristic findings remain separate from source-bound G1–G6 assessments |
| AR-025 | Package access is not a customer/legal external action | Official dev downloads allowed after implementation approval; no private data transmission |

These clarifications preserve the delivered Database/API semantics. They do not introduce new legal facts, widen implementation scope or declare the schema runtime-valid.

## What Claude should do next

Read only, map the original 16 items to these resolutions, identify remaining concrete blockers versus runtime checks, propose a file/command-level P0 plan and stop. Do not treat “no unresolved design blocker” as a passing test suite or permission to begin coding. Use the supplied reinspection prompt.
