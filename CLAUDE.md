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
2. Decisions: `docs/decisions/ADR-0001-mysql-manual-migration-semantics.md`, `ADR-0002-zod-first-contract-authoring.md`, `ADR-0003-single-pc-development-baseline.md` (all ACCEPTED).
3. Frozen DB/API baseline `TB-SCHEMA-API-v1.0.0`: `docs/reference/database-api-v1/…/docs/INVARIANTS.md`, `API_CONTRACT_v1.md`.
4. State: `docs/CURRENT_STATE.md`; evidence: `docs/verification/p0/`, `docs/verification/p1/`, `docs/verification/p2/`, `docs/verification/p3a/`, `docs/verification/p3b/`.

**Frozen trees — never edit, move, format, lint-fix or generate into:** `docs/reference/**`. Verify with `yarn reference:check`. Never run `docs/reference/…/tests/verify_contracts.py` (it writes files).

## Architecture (modular monolith)

- `apps/web` (`@tb/web`): React 19 + Vite 8, `127.0.0.1:5173`, proxies `/api`.
- `apps/api` (`@tb/api`): NestJS 12 + Express, REST `/api/v1`, `127.0.0.1:3000`. P1 exposes `GET /api/v1/health` (public) and `POST /api/v1/auth/login`, `GET /api/v1/auth/session`, `POST /api/v1/auth/logout`. P2 adds the 36 contracted directory operations (Agency, Owner, LegalSubject, OwnerSubject, Signer); P3A adds 17: the SourceReference registry (4), the four directory `bindCanonical*` operations and Route (9, including `bindCanonicalRoute`); P3B adds the 23 representation-authority operations (Mandate 8, MandateVersion 5, MandateCoverage 4, CoverageSigner 4, AuthorityEvent 2) — 76 business operations. Cases and every later operation stay unrouted. A global guard makes every other route session-protected by default.
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
- Dates and instants (R7, all phases): every DATE / DATETIME(3) value from a request goes through `apps/api/src/infrastructure/write/storability.ts` — refused with 422 `VALIDATION_FAILED` before any idempotency claim or write unless the column stores and reads back exactly the same value (no leap second, no hour 24 or minute overflow, no non-zero digit after the milliseconds; UTC `1000-01-01T00:00:00.000Z`…`9999-12-31T23:59:59.499Z`, MySQL's supported DATETIME range with a fraction; DATE `1000-01-01`…`9999-12-31`), and written as the exact `Date` it computes (`toDbInstant`), never the request string: Prisma's and V8's string parsers disagree with the wire oracle (500s, cut fractions, shifted years). Never add a second date validator.
- Idempotency scope is actor + operationId + key; the digest covers operation, method, contract path and canonical body (not If-Match); replay horizon 7 days; 60 s lease for abandoned claims.
- Lists: keyset `(createdAt DESC, id DESC)`, default 25 / max 100, HMAC cursors bound to operation, scope and filters (400 `INVALID_CURSOR`). Only declared query parameters.
- Established Agency/LegalSubject (ACTIVE, canonically bound, or referenced through any FK or JSON snapshot/scope column — an agency-owned SourceReference counts, R6): **every** identity-defining field is immutable through generic PATCH — populated, null or empty (R5). Correcting or supplementing an established identity needs a future dedicated workflow with source/provenance/audit; do not invent it. Hard delete only for unused, unbound DRAFT records. Archived records are read-only except the explicit restore, which returns DRAFT and revives nothing.
- Signer operational state is administrative only: no state implies mandate coverage, eligibility, G7, signature authority or notice adoption.
- Accent-insensitive collation (`utf8mb4_0900_ai_ci`) is only for `q` discovery search (LIKE); never for identity equality, canonical matching, duplicate determination, unique keys or legal/entity equivalence (a test scans the API source).
- SourceReferences are created only by `createSource`/`reviseSource` (P3A); never create one (or a placeholder) from directory, route or binding code. Every cited source must exist and apply to the record (`modules/sources/source-scope.ts`, below). Provenance is stored as given, never upgraded.
- A new FK or JSON column must be added to `DIRECT_REFERENCES` / `SNAPSHOT_JSON_COLUMNS` in `modules/directory/records.ts`; a test parses the migration and fails otherwise.
- No generic BaseCrud: shared mechanics only (write executor, ETag, idempotency, cursor, audit writer); entity rules stay explicit per service.
- UI: capabilities that are not available (source attachment for attributions, Signer sources and link sources, known-ineligible delete) stay visible but inert (`aria-disabled` + reason); never simulate success. No new UI dependencies without a decision.
- Browser checks run only against `yarn ui:sandbox` (compiled API on `tb_notice_test`, synthetic user, full cleanup); never against `tb_notice_dev` or with a personal browser profile.

## Sources, canonical bindings and routes (P3A, R6 PASS, merged to `main`; details `docs/verification/p3a/P3A_SOURCES_ROUTE.md`)

- A SourceReference is an immutable pointer with capture metadata (no PATCH, no ETag) — not evidence, review proof, permission or authority; Drive keeps the evidence. Store exactly what was supplied: omitted `accessState`/`reportedProvenance` default to NOT_CHECKED/OPERATOR_REPORTED; never fetch the URL, compute or invent a hash (a hash needs its `hashTarget`), infer provenance or add provenance values; DOCUMENT_REVIEWED needs `reviewedByLabel`; `caseIds` are refused until Cases exist; `observedAt`/`reviewedAt` are stored as exactly the supplied instant or refused (R7 storability rule; on `main` since the P3B merge `3649bef`). Audit keeps metadata only (scope text, excerpt, limitations as `{redacted, codePoints}`).
- DOCUMENT_REVIEWED (permanent rule, R6): a SourceReference row does not itself establish it. It means an actual human review of the document occurred and is recorded only from an explicit, supported, human-entered fact representing that review. A reviewer name, URL, source row, hash or canonical binding never by itself upgrades provenance; defaults never upgrade.
- Revisions: only the current head is revised (409 `REVISION_NOT_HEAD`); a revision keeps `agencyId` and `scopeBindings` (422 `REVISION_SCOPE_CHANGE`), never changes earlier revisions and never re-points bindings; lists show current heads only.
- Applicability (one rule set for attributions, Signer sources, link sources and bindings): Agency, Signer and Route need their agency's own source or an agency-less source naming the agency in `scopeBindings.agencyIds`; Owner, LegalSubject and OwnerSubject need an agency-less, unrestricted source; a LegalSubject must be named, a subject-scoped source for a Route/OwnerSubject must name its subject, an Owner refuses subject-scoped sources; material recorded for one Owner never supports another (`CROSS_OWNER_REFERENCE`); case-scoped sources apply to nothing.
- Canonical binding = identity/reference only (no ownership, authority, mandate, eligibility, G1–G7 or readiness): current revision, role CANONICAL_RECORD, applicable scope, code unique per kind (binary), archived targets refused, an existing binding is never replaced (409 `BINDING_CORRECTION_REQUIRES_RECONCILIATION`; no reconciliation workflow exists — do not invent it); DIVERGENT is never set. A bound Agency/LegalSubject is established (identity lock); a bound Signer's `fullLegalName` locks.
- Route = Agency + OwnerSubject + YOUTUBE, not authority: explicit, existing, unarchived parties and a LINKED association; one per (agency, association, platform); PATCH cannot move it; `defaultSignerId` = a non-archived, non-ENDED Signer of the same agency; non-null `preferredCoverageId` → 422 `PREFERRED_COVERAGE_UNAVAILABLE` until P3B; LINKED needs unarchived parties and a LINKED association; archive is a separate flag and restore is refused while a party is archived; delete only unused routes.
- OwnerSubject with an archived Owner or LegalSubject (R5 closeout rule): no new link and no relink; PAUSE and UNLINK stay allowed; the row is never deleted.
- Never show AUTHORIZED, READY, ELIGIBLE, G1 PASS or "verified" badges for sources, bindings or routes. `smoke:p3a` writes records and runs only in CI.

## Representation authority (P3B, R7 PASS, merged to `main`; details `docs/verification/p3b/P3B_REPRESENTATION_AUTHORITY.md`, R7 §21–§22)

Persistent rules (never weaken; UI copy follows them):

- **Authority records are not self-proving.** A Mandate, MandateVersion, MandateCoverage, CoverageSigner or AuthorityEvent records what cited sources are reported to support; existing, completeness, a frozen state or being the latest proves nothing.
- **A frozen version is not approval.** FROZEN = the system record is immutable; not a signature, legal approval, owner confirmation, G1 decision, notice adoption or current authority. No unfreeze; every later change of the version or its coverage/signers is 409 `FROZEN_VERSION`; a correction is a successor version.
- **Coverage ≠ G1.** A coverage is the documented scope of one version over one exact Route, stored exactly as supplied and never derived; case authority is determined later.
- **CoverageSigner ≠ G7.** A Signer recorded under one coverage (same agency, not archived or ENDED; duplicates refused); not signature authority, G7 clearance or eligibility; never transfers to another coverage, route or case. An application User is never a Signer. Wording: "Associated signer", "Coverage signer", "Recorded under this coverage" — never AUTHORIZED/APPROVED SIGNER, READY TO SIGN or ELIGIBLE FOR NOTICE.
- **An AuthorityEvent is not proof by existence.** Append-only (no ETag, update or delete), exactly as reported with an explicit provenance; nothing creates one automatically; recordedAt is never an effective date; supersession keeps mandate and scope, at most one successor, the earlier event unchanged.
- **Source revision pinning.** Versions, coverages, signers and events cite exact SourceReference revisions and never follow a newer one.
- **No currentness from dates or silence.** Nothing computes "currently authorized" — not from dates, a frozen state, the highest version, a missing end date, a missing event or the latest source. Dates are stored only as supplied; start > end is 422 `DATE_RANGE_INVALID`.

Implementation rules:

- Mandate = container of one Agency (agency fixed; no identity lock; archive is a flag — an archived mandate and everything under it are read-only except restore; an archived Agency blocks new authority records, freeze and restore; delete only unused).
- Versions: number max+1; predecessor = FROZEN version of the same mandate without a successor (no fork, no cycle); DRAFT-only edits; DRAFT/SIGNED_APPEARING need the primary source; REVIEWED_WITH_LIMITS and a DOCUMENT_REVIEWED event need a cited source recorded as DOCUMENT_REVIEWED — citing one never upgrades anything.
- Parent ETags cover children: create version / record event increment the Mandate; coverage and signer changes increment the version (signers also the coverage). Freeze locks the version FOR UPDATE, re-validates the structure, changes the version once and audits once.
- `Route.preferredCoverageId` = frozen coverage of the same route in an unarchived mandate (operational default only; no cascade on a later archive — R7: the recorded preference is kept, and any later Case/authority-selection workflow must revalidate that the coverage is usable).
- R7 decisions (accepted): no identity lock on a Mandate (a representation/appointment container, not a LegalSubject identity); an archived Mandate records no new event — a historical or retroactive event is recorded by restoring it administratively, recording the event with its actual supplied effective/occurred date and archiving again if appropriate (`recordedAt` never replaces `effectiveAt`); UNTIL_TERMINATED with an `expiresOn` is preserved as supplied, with no currentness, expiry or contradiction resolution inferred; PAUSED Routes and Signers may take part where the contract allows (administrative state, not legal authority); a truthful incomplete DRAFT version may be frozen (immutable snapshot only — not complete, approved, current, G1 PASS, owner-confirmed or signer-adopted); the conservative owner-material scope extension stays until an explicit owner-scope model exists. No contract amendment is authorized by them.
- Source applicability: mandate context (Agency) for version and whole-mandate event citations; route context for coverage basis, signer and coverage-scoped event sources, which also count as that route owner's material (`CROSS_OWNER_REFERENCE`).
- Error codes: frozen stable codes where they fit; P3B implementation codes `VERSION_NOT_FROZEN`, `VERSION_SUCCESSOR_EXISTS`, `DATE_RANGE_INVALID`, `DOCUMENT_STATE_UNSUPPORTED`, `REVIEW_UNSUPPORTED`, `DUPLICATE_COVERAGE`, `DUPLICATE_COVERAGE_SIGNER`, `EVENT_ALREADY_SUPERSEDED` (free-string `code`, contracted statuses). `PREFERRED_COVERAGE_UNAVAILABLE` is retired.
- Never show AUTHORIZED, APPROVED, VALID, CURRENT AUTHORITY, READY, ELIGIBLE or G1/G7 PASS labels for authority records. `smoke:p3b` writes records and runs only in CI.

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
- Operation-specific error codes are allowed only inside the existing free-string error `code` field, with the contracted HTTP statuses and response shapes (R6); use the frozen stable codes where they fit.
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
| `yarn test:db`                                                                             | DB structural, P1 HTTP/CLI, P2, P3A and P3B HTTP tests (`tb_notice_test`) |
| `yarn build` · `yarn smoke:local`                                                          | Build everything · build + run API/web, health, shell, auth bounds        |
| `yarn smoke:auth --email <e> [--expect-rejected] < pw`                                     | Compiled login round trip (or expected rejection), CI synthetic           |
| `yarn smoke:directory --email <e> < pw`                                                    | Compiled directory round trip; refuses unless `CI=true`                   |
| `yarn smoke:p3a --email <e> < pw`                                                          | Compiled source → binding → route round trip; refuses unless `CI=true`    |
| `yarn smoke:p3b --email <e> < pw`                                                          | Compiled mandate → coverage → freeze → event; refuses unless `CI=true`    |
| `yarn ui:sandbox --password-file <path outside repo>`                                      | Compiled API on `tb_notice_test` + built web, synthetic user              |
| `yarn dev` · `yarn dev:verify-shutdown`                                                    | Dev servers (Ctrl+C stops both) · verify clean shutdown                   |

Before any commit: `yarn reference:check && yarn contracts:check && yarn typecheck && yarn lint && yarn format:check && yarn test` (plus `yarn test:db` when DB code changes). Report actual results; a skipped command is never PASS.

## Git workflow

- Branches: `bootstrap/p0-local` is the P0 branch and takes no P1 application code; P1/P1.1 are on `feature/p1-auth-shell` (accepted at R4.1, unchanged since); P2 work went on `feature/p2-directory`, branched from the accepted P1.1 head `8fe96ae`; P3A on `feature/p3a-sources-route` (from `31db581`), merged into `main` by PR #1 (merge commit `adea2bc`) after R6; P3B on `feature/p3b-representation-authority` (from that exact `main` head `adea2bc`, with the R7 remediation `ee31fa3`), merged into `main` by PR #2 (merge commit `3649bef`) after the R7 closeout; P4A work goes on `feature/p4a-case-core`, branched from that exact `main` head `3649bef`. One active writer per branch; small, scoped commits; review `git diff --cached` before committing; never `git add .` blindly.
- Development topology (ADR-0003): the home PC (the "first PC" of the records) is the primary development workstation; the second-PC reproduction is DEFERRED_BY_OPERATOR. GitHub is the source of truth for code, branches, committed migrations and CI verification. Never copy or synchronize local database volumes through Git; a workstation rebuilds its databases from committed migrations and the synthetic seed.
- No merge to `main`, force-push, history rewrite, tags or releases without explicit operator approval.

## Phase boundaries and stop conditions

- P0-A…P0-E delivered on the first (home) PC and in CI; Windows-browser check PASS (operator-reported); second-PC reproduction **DEFERRED_BY_OPERATOR** (ADR-0003): the two-PC acceptance is NOT_COMPLETED, the single-PC baseline is VERIFIED, and P0 overall stays **NOT_COMPLETE** against the original two-PC contract — never describe it otherwise. P1 (authentication + app shell) passed review gate R4 with notes; P1.1 (local recovery commands) was accepted at R4.1. P2 (Directory) passed R5 with one remediation (the identity lock), implemented on `feature/p2-directory`; R5 is closed. P3A (Sources, canonical bindings, Route) passed R6 (PASS; VERIFIED_COMPLETE) and is merged to `main` (`adea2bc`, `main` CI green); the failed CI of its first two commits `afeb012`/`0c289be` stays as historical evidence — never rewrite history to make it green.
- P3B (Mandate, MandateVersion, MandateCoverage, CoverageSigner, AuthorityEvent; no migration) passed R7 (PASS_WITH_ONE_REMEDIATION, then **PASS** after the SourceReference instant-storability remediation `ee31fa3`; VERIFIED_COMPLETE) and is merged to `main` (`3649bef`, PR #2, merge commit; `main` CI green).
- Next, each needing an explicit approved mission: **P4A** — Case Core and Case Authority Selection, gate R8 — expected 16 contracted operations (Case 10, CaseSource 4, CaseAuthoritySelection 2; `P3B_REPRESENTATION_AUTHORITY.md` §22.4), to be verified against the current contract before implementation; its branch is prepared but no P4A code or migration exists until its mission starts. CaseAuthoritySelection = the authority chain selected/pinned for evaluation in one specific Case — never G1 PASS, confirmed current authority, adjudicated legal validity, signer eligibility, G7 or notice readiness (G1 evaluation is a later readiness phase). Reported items, case works, use mappings, case facts, correspondence, prompts, candidates, validation, assessments and readiness come in later phases (signing, sending and G7 never exist in the app — product boundary).
- Stop and ask on: missing credentials/permissions, a package incompatibility needing an architecture change, any domain-semantic conflict, an unsafe or unrecognized database target, or any destructive plan.
- Forbidden substitutions: MariaDB/SQLite/Postgres servers; `db push`; Zod built-in format validators or `z.toJSONSchema` for wire contracts; hand-edited generated contracts; Python in app/CI; Yarn Classic/PnP, npm or pnpm installs; binding services to `0.0.0.0`; writable readiness/signature fields.
