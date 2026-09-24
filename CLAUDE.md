# CLAUDE.md — TB Notice Production System

Read this first in every session. It summarizes binding decisions; the documents it points to are authoritative.

## Product boundary

- Internal, local-first tool that prepares a case-specific **unsigned** YouTube copyright notice or NMI reply from structured facts and attributable sources.
- Terminal output is an unsigned `NoticeCandidate` with the single pending slot `[PENDING AUTHORIZED SIGNER — FULL LEGAL NAME REQUIRED]`. `READY_FOR_SIGNER` is **derived**, never a column, never a PATCH/UI action.
- A human signer reviews, adopts, signs and sends **outside** the app. There is no G7, signing, sending, email/SMTP, Drive writing, uploader contact or AI-provider API — do not add them.
- Technical validation (`ValidationRun`) is not substantive review; G1–G6 are separate sourced `CandidateAssessment`s.
- Google Drive holds canonical evidence; the app DB holds working data, references and snapshots. Git is not an evidence archive: never commit real case/owner/authority data, LOAs, raw mail, tokens or secrets. Fixtures are synthetic only.

## Read order and sources of truth

1. `docs/architecture/ARCHITECTURE_RESOLUTIONS_v1.md` (precedence rules), then `docs/product/PRODUCT_DEFINITION_v1.md`, `docs/domain/DOMAIN_MODEL_v1.md`, `docs/contracts/PRODUCTION_FORM_CONTRACT_v1.md`, `docs/architecture/TECHNOLOGY_ARCHITECTURE_v1.md`, `REPOSITORY_BLUEPRINT_v1.md`, `P0_BOOTSTRAP_CONTRACT_v1.md`.
2. Decisions: `docs/decisions/ADR-0001-mysql-manual-migration-semantics.md`, `ADR-0002-zod-first-contract-authoring.md` (both ACCEPTED).
3. Frozen DB/API baseline `TB-SCHEMA-API-v1.0.0`: `docs/reference/database-api-v1/…/docs/INVARIANTS.md`, `API_CONTRACT_v1.md`.
4. State: `docs/CURRENT_STATE.md`; evidence: `docs/verification/p0/`, `docs/verification/p1/`, `docs/verification/p2/`.

**Frozen trees — never edit, move, format, lint-fix or generate into:** `docs/reference/**`. Verify with `yarn reference:check`. Never run `docs/reference/…/tests/verify_contracts.py` (it writes files).

## Architecture (modular monolith)

- `apps/web` (`@tb/web`): React 19 + Vite 8, `127.0.0.1:5173`, proxies `/api`.
- `apps/api` (`@tb/api`): NestJS 12 + Express, REST `/api/v1`, `127.0.0.1:3000`. P1 exposes `GET /api/v1/health` (public) and `POST /api/v1/auth/login`, `GET /api/v1/auth/session`, `POST /api/v1/auth/logout`. P2 adds the 36 contracted directory operations (Agency, Owner, LegalSubject, OwnerSubject, Signer); the four `bindCanonical*` operations stay unrouted until SourceReference authoring exists. A global guard makes every other route session-protected by default.
- `packages/contracts` (`@tb/contracts`): Zod wire schemas + operation metadata; depends on no app, Nest, React or Prisma.
- One MySQL 8.4 container. Yarn Workspaces only. No Nx/Turborepo/Lerna, queues, Redis, GraphQL/tRPC, microservices, generic BaseCrud layers.

## Toolchain (exact; change only by explicit decision)

Node **24.21.0** (`.nvmrc` = 24) · Yarn **4.18.0** via Corepack, `nodeLinker: node-modules`, default 24 h npm age gate (never weaken), build scripts disabled · TypeScript 7.0.2 · NestJS 12.0.4 (+ @nestjs/testing 12.0.4) · React 19.3.0 · React Router 8.4.0 · Vite 8.3.0 · argon2 0.45.1 (node-argon2, shipped N-API prebuilds) · happy-dom 20.14.5 (UI tests) · Prisma 7.10.0 + `@prisma/adapter-mariadb` 7.10.0 (driver only; the server is MySQL) · Zod 4.6.5 · ajv 8.20.0 · ajv-formats 3.0.1 (**runtime dependency of @tb/contracts; any version change is contract-sensitive and needs the full parity suite**) · yaml 2.9.1 · Vitest 5.0.1 · Prettier 3.9.8 · oxlint 1.85.0 · MySQL image `mysql:8.4.11@sha256:0744ee5ef89ce6ccfa13de3e579fe6b9e27f93dd70da9c06d2c908b1b193fb8d`.
npm `prisma@latest` currently points at an 8.x release candidate — always pin explicitly. Scripts `*.ts` run with Node's type stripping: erasable TypeScript only (no `enum`, namespaces, parameter properties).

## Authentication (P1; details `docs/verification/p1/P1_AUTH_SHELL.md`)

- An application User is **not** a Signer: login confers no legal authority, satisfies no G1–G7 gate and signs/adopts/sends nothing. No signup or user-management endpoint.
- Accounts only through the local admin CLI (`yarn admin:create | admin:password | admin:disable | admin:enable | admin:revoke-sessions`): allowlist-guarded to `tb_notice_dev` with the `tb_dev` account in the wrapper and again in the compiled entry; passwords via hidden prompt or `--password-stdin` (pipe/file only), never argv/env; `create` never modifies an existing user and recovery commands never create one; every change plus its audit event is one transaction and state changes increment `session_epoch`. The P0 synthetic actor and non-credential (`!`) fixtures are never modified (disable only reports). Never create, recover or change a real account on the operator's behalf; tests use synthetic users in `tb_notice_test`.
- Sessions: 256-bit opaque token only in cookie `tb_session_dev` (HttpOnly, SameSite=Strict, Path=/, no Domain; Secure=false is the loopback-HTTP dev exception only). DB stores SHA-256 digests. 12 h absolute + 30 min idle; login rotates; logout revokes.
- CSRF token = HMAC-SHA256(`TB_SESSION_SECRET`, session id ‖ `users.session_epoch` ‖ token); incrementing the epoch (or rotating the secret) invalidates sessions. Unsafe methods need an exact allowlisted Origin (`TB_ALLOWED_WEB_ORIGINS`: canonical Windows browser `http://localhost:5173`, plus `http://127.0.0.1:5173` for WSL tools; cookies are per hostname, never shared), JSON bodies and `X-CSRF-Token`; login needs the Origin plus `X-Requested-With: TB-APP`. CORS is never enabled.
- Credential failures are one identical `403 INVALID_CREDENTIALS`; in-memory throttle (5/account, 100 overall per 15 min). Never log or store passwords, tokens, CSRF tokens or their hashes; every API response is `Cache-Control: no-store`. These P1 decisions were accepted at R4 (PASS_WITH_NOTES); session-row retention is DEFERRED.
- The production cookie (`__Host-tb_session`, Secure, HTTPS) is not implemented; a non-loopback or HTTPS origin makes the API refuse to start. Do not reuse the dev exception.

## Directory and business writes (P2; details `docs/verification/p2/P2_DIRECTORY.md`)

- Every contracted write goes through `WriteExecutor` (`apps/api/src/infrastructure/write`): contract body parse (422) → `Idempotency-Key` (400) → `If-Match` when the contract declares `x-precondition-target` (428 missing, 412 unless byte-identical to `"<Type>:<id>:v<rowVersion>"`) → idempotency claim → one READ COMMITTED transaction (row locks in alphabetical entity order, business rules, change with `rowVersion` +1, audit event, idempotency completion) → bounded deadlock retry (3). Failures release the claim; never store a failed request as a replay. Method, path and precondition target come from `@tb/contracts`, never hand-typed.
- Idempotency scope is actor + operationId + key; the digest covers operation, method, contract path and canonical body (not If-Match); replay horizon 7 days; 60 s lease for abandoned claims.
- Lists: keyset `(createdAt DESC, id DESC)`, default 25 / max 100, HMAC cursors bound to operation, scope and filters (400 `INVALID_CURSOR`). Only declared query parameters.
- Established Agency/LegalSubject (ACTIVE, canonically bound, or referenced through any FK or JSON snapshot/scope column): set identity values are immutable through PATCH. Hard delete only for unused, unbound DRAFT records. Archived records are read-only; restore returns DRAFT and revives nothing.
- Never create a SourceReference (or any placeholder) from directory code or UI; supplied source ids must exist and, for agency-owned records, belong to that agency or name it in `scopeBindings.agencyIds`. Provenance is stored as given, never upgraded.
- A new FK or JSON column must be added to `DIRECT_REFERENCES` / `SNAPSHOT_JSON_COLUMNS` in `modules/directory/records.ts`; a test parses the migration and fails otherwise.
- No generic BaseCrud: shared mechanics only (write executor, ETag, idempotency, cursor, audit writer); entity rules stay explicit per service.
- UI: capabilities that are not available (canonical binding, source attachment, known-ineligible delete) stay visible but inert (`aria-disabled` + reason); never simulate success. No new UI dependencies without a decision.
- Browser checks run only against `yarn ui:sandbox` (compiled API on `tb_notice_test`, synthetic user, full cleanup); never against `tb_notice_dev` or with a personal browser profile.

## Database safety

- MySQL publishes on **127.0.0.1:3307 only**. Schemas: `tb_notice_dev` (app + seed), `tb_notice_shadow` (Prisma shadow), `tb_notice_test` (structural tests), `tb_notice_replay` (migration replay). Accounts: `tb_dev` (runtime DML on dev only), `tb_migrate` (tooling, those four schemas only). `root` is init-only; the app never uses it.
- Every DB helper goes through `scripts/db/allowlist.mjs` / `scripts/db/lib/targets.mjs`; they fail closed on any other host, port, schema or account. Secrets (DB passwords, `TB_SESSION_SECRET`) live only in the git-ignored root `.env` (`yarn env:init` creates it, or adds missing P1 keys and replaces empty/placeholder P1 values without touching any other line; mode 600).
- Applied history: one migration `20260923103912_initial_schema` (sha256 `b54c36fdaada7bdd31e08558a93d70e9e40fd4c48348681c9c2a124503426515`). CHECK constraints and `utf8mb4_0900_bin` live in migration SQL (ADR-0001). Prisma drift output cannot see them; `yarn db:verify <test|replay|dev>` (information_schema) is authoritative.
- **Never**: `prisma db push`, `prisma migrate reset`, `FOREIGN_KEY_CHECKS=0`, editing an applied migration, dropping CHECK/FK/collation, applying `initial-schema.preview.sql`.
- Only the active feature writer creates migrations: `yarn db:migrate:create <name>` (create-only, reviewed and augmented before first apply). Every other PC runs `yarn db:migrate:deploy <target>` on the committed migration.

## Contract rules (ADR-0002)

- Editable source: `packages/contracts/src/**`. Build wire schemas with `tb.*` builders only; HTTP metadata lives in `src/api/operations.ts` and `src/api/openapi-document.ts`. The lowering rejects anything else.
- Generated, never hand-edited: `packages/contracts/schemas/api-schemas.json`, `packages/contracts/openapi/openapi.{json,yaml}` → `yarn contracts:generate`; drift → `yarn contracts:check` fails.
- Wire behaviour is pinned to `TB-SCHEMA-API-v1.0.0` by the parity tests in `yarn test`. An intentional wire change needs an approved new baseline/ADR, not a test tweak. PFC wire id stays **`PFC-YT-EMAIL-v1.1`**.
- `scripts/migrations/port-frozen-contract-v1.ts` is provenance only — do not re-run it over the source.

## Commands

| Command                                                                                    | Purpose                                                                   |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `yarn install --immutable`                                                                 | Install from the committed lockfile                                       |
| `yarn env:init` / `yarn db:up`                                                             | Create or complete local `.env` (random secrets) / start MySQL            |
| `yarn db:migrate:deploy <test\|replay\|dev>` · `yarn db:status <t>` · `yarn db:verify <t>` | Apply committed migrations · status · metadata verification               |
| `yarn db:seed`                                                                             | Idempotent synthetic seed (dev only; disabled synthetic actor)            |
| `yarn admin:create`                                                                        | Create one local application user (operator only; see above)              |
| `yarn admin:password\|disable\|enable\|revoke-sessions --email <e>`                        | Local recovery of one application user (operator only; see above)         |
| `yarn reference:check` · `yarn reference:helper-tests`                                     | Frozen reference integrity · original 27 frozen Node helper tests         |
| `yarn contracts:generate` · `yarn contracts:check`                                         | Regenerate / verify generated contract artifacts                          |
| `yarn typecheck` · `yarn lint` · `yarn format:check`                                       | Static checks (format:check never rewrites)                               |
| `yarn test`                                                                                | All non-database tests (contract parity, tooling, API units, UI)          |
| `yarn test:db`                                                                             | DB structural, P1 HTTP/CLI and P2 directory HTTP tests (`tb_notice_test`) |
| `yarn build` · `yarn smoke:local`                                                          | Build everything · build + run API/web, health, shell, auth bounds        |
| `yarn smoke:auth --email <e> [--expect-rejected] < pw`                                     | Compiled login round trip (or expected rejection), CI synthetic           |
| `yarn smoke:directory --email <e> < pw`                                                    | Compiled directory round trip; refuses unless `CI=true`                   |
| `yarn ui:sandbox --password-file <path outside repo>`                                      | Compiled API on `tb_notice_test` + built web, synthetic user              |
| `yarn dev` · `yarn dev:verify-shutdown`                                                    | Dev servers (Ctrl+C stops both) · verify clean shutdown                   |

Before any commit: `yarn reference:check && yarn contracts:check && yarn typecheck && yarn lint && yarn format:check && yarn test` (plus `yarn test:db` when DB code changes). Report actual results; a skipped command is never PASS.

## Git workflow

- Branches: `bootstrap/p0-local` is the P0 branch and takes no P1 application code; P1/P1.1 are on `feature/p1-auth-shell` (accepted at R4.1, unchanged since); P2 work goes on `feature/p2-directory`, branched from the accepted P1.1 head `8fe96ae`. One active writer per branch; small, scoped commits; review `git diff --cached` before committing; never `git add .` blindly.
- No merge to `main`, force-push, history rewrite, tags or releases without explicit operator approval.

## Phase boundaries and stop conditions

- P0-A…P0-E delivered on the first PC and in CI; Windows-browser check PASS (operator-reported); second-PC reproduction pending — P0 overall **NOT_COMPLETE**. P1 (authentication + app shell) passed review gate R4 with notes; P1.1 (local recovery commands) was accepted at R4.1. P2 (Directory) is implemented on `feature/p2-directory` and stops at review gate R5. P3 (Route, Mandate, Case, SourceReference authoring and everything later) is **not started** and needs explicit approval.
- Stop and ask on: missing credentials/permissions, a package incompatibility needing an architecture change, any domain-semantic conflict, an unsafe or unrecognized database target, or any destructive plan.
- Forbidden substitutions: MariaDB/SQLite/Postgres servers; `db push`; Zod built-in format validators or `z.toJSONSchema` for wire contracts; hand-edited generated contracts; Python in app/CI; Yarn Classic/PnP, npm or pnpm installs; binding services to `0.0.0.0`; writable readiness/signature fields.
