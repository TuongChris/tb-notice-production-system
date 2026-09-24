# P2 — Directory (first PC)

Mission TB_P2_DIRECTORY_TO_R5 on `feature/p2-directory`, branched from the accepted P1.1 head `8fe96aea5a30bb01fa24c987e30689f4e6532164` after review gate R4.1 was accepted (2026-09-24). Recorded 2026-09-24 (UTC) on the first PC. Stopped at review gate R5; no Route, Mandate, Case, SourceReference authoring, correspondence, prompt, candidate, readiness, G1–G7, signing, sending or external action was started. **R5 result (operator, 2026-09-24): PASS_WITH_ONE_REMEDIATION** — the remediation and the closeout are recorded in §15; sections 1–14 are the record as submitted at R5, annotated where R5 changed a decision.

## Status by scope (not collapsed)

| Scope | Status | Basis |
|---|---|---|
| **P2_FIRST_PC** | **PASS** | All automated checks in §11 executed on the first PC and passed; repeated after the R5 remediation (§15) |
| **P2_CI** | **PASS** for `cbfd640` (run 35948987435), `a885b96` (run 35950151963) and the remediation `4b67fff` (run 35953912083), both jobs success each time; the closeout documentation run is reported with the closeout | A commit cannot record its own run. CI covers `yarn test`, `yarn test:db`, `smoke:local`, `smoke:auth` and the compiled `smoke:directory` round trip (`evidence/p2-ci-run-35948987435.txt`) |
| **P2_BROWSER (Playwright MCP)** | **PASS** (14/14 at R5, supplemental) + the identity-lock scenarios re-run after the remediation (5/5) | Isolated test browser against the compiled API on the disposable `tb_notice_test` (`evidence/p2-playwright-mcp-verification.txt`, `evidence/p2-playwright-mcp-r5-identity-lock.txt`) |
| **R5 review** | **PASS_WITH_ONE_REMEDIATION** (operator, 2026-09-24) | Interpretations A–E accepted; the empty-identity-field interpretation overridden (§12, §15) |
| **R5 remediation** | **IMPLEMENTED and verified** | §15; operator confirmation of the closeout pending |
| **P1_WINDOWS_BROWSER** | **NOT_RUN** (not reported) | Unchanged |
| **P0_SECOND_PC** / **P0_TWO_PC_ACCEPTANCE** / **P0_SINGLE_PC_BASELINE** / **P0_OVERALL** | **DEFERRED_BY_OPERATOR** / **NOT_COMPLETED** / **VERIFIED** / **NOT_COMPLETE** against the original two-PC contract | ADR-0003 (2026-09-24) |

`EXTERNAL_LEGAL_ACTIONS=0` · `REAL_CASE_MUTATIONS=0` · `G7_CREATED=0` · `DEPLOYMENTS=0` · `REAL_TB_DATA_IN_GIT=0` · `REAL_ACCOUNTS_CREATED_BY_ENGINEER=0` · `RECORDS_WRITTEN_TO_OPERATOR_DB=0` · `SCHEMA_CHANGES=0` · `NEW_DEPENDENCIES=0`.

Directory records are administrative. No directory record or state grants legal authority, satisfies G1–G7, signs, adopts or sends anything; a Signer record is never an application User and an application User is never a Signer.

## 1. Operation implementation matrix (contract-first)

Generated from the active `@tb/contracts` operation metadata (wire baseline `TB-SCHEMA-API-v1.0.0`, unchanged; `contracts:check` OK). 40 directory operations: **36 implemented**, **4 deferred**.

| # | operationId | Method and path | Request | Success | ETag precondition (`If-Match`) | Idempotency-Key | P2 disposition |
|---|---|---|---|---|---|---|---|
| 1 | `listAgencies` | `GET /agencies` | — | 200 ListAgenciesResponse | — | — | IMPLEMENTED |
| 2 | `createAgency` | `POST /agencies` | CreateAgency | 201 CreateAgencyResponse | — | required | IMPLEMENTED |
| 3 | `getAgency` | `GET /agencies/{id}` | — | 200 GetAgencyResponse | — | — | IMPLEMENTED |
| 4 | `patchAgency` | `PATCH /agencies/{id}` | PatchAgency | 200 PatchAgencyResponse | Agency (428 missing / 412 stale) | required | IMPLEMENTED |
| 5 | `deleteUnusedAgency` | `DELETE /agencies/{id}` | — | 204 — | Agency (428 missing / 412 stale) | required | IMPLEMENTED |
| 6 | `archiveAgency` | `POST /agencies/{id}/archive` | ArchiveRequest | 200 ArchiveAgencyResponse | Agency (428 missing / 412 stale) | required | IMPLEMENTED |
| 7 | `restoreAgency` | `POST /agencies/{id}/restore` | ArchiveRequest | 200 RestoreAgencyResponse | Agency (428 missing / 412 stale) | required | IMPLEMENTED |
| 8 | `bindCanonicalAgency` | `POST /agencies/{id}/canonical-bindings` | CanonicalBindingRequest | 200 BindCanonicalAgencyResponse | Agency (428 missing / 412 stale) | required | **DEFERRED_WITH_REASON** (D2): requires `sourceId` of a SourceReference the product cannot author before the Source phase; not routed (404) |
| 9 | `setAgencyState` | `POST /agencies/{id}/state` | RecordStateRequest | 200 SetAgencyStateResponse | Agency (428 missing / 412 stale) | required | IMPLEMENTED |
| 10 | `listOwners` | `GET /owners` | — | 200 ListOwnersResponse | — | — | IMPLEMENTED |
| 11 | `createOwner` | `POST /owners` | CreateOwner | 201 CreateOwnerResponse | — | required | IMPLEMENTED |
| 12 | `getOwner` | `GET /owners/{id}` | — | 200 GetOwnerResponse | — | — | IMPLEMENTED |
| 13 | `patchOwner` | `PATCH /owners/{id}` | PatchOwner | 200 PatchOwnerResponse | Owner (428 missing / 412 stale) | required | IMPLEMENTED |
| 14 | `deleteUnusedOwner` | `DELETE /owners/{id}` | — | 204 — | Owner (428 missing / 412 stale) | required | IMPLEMENTED |
| 15 | `archiveOwner` | `POST /owners/{id}/archive` | ArchiveRequest | 200 ArchiveOwnerResponse | Owner (428 missing / 412 stale) | required | IMPLEMENTED |
| 16 | `restoreOwner` | `POST /owners/{id}/restore` | ArchiveRequest | 200 RestoreOwnerResponse | Owner (428 missing / 412 stale) | required | IMPLEMENTED |
| 17 | `bindCanonicalOwner` | `POST /owners/{id}/canonical-bindings` | CanonicalBindingRequest | 200 BindCanonicalOwnerResponse | Owner (428 missing / 412 stale) | required | **DEFERRED_WITH_REASON** (D2): requires `sourceId` of a SourceReference the product cannot author before the Source phase; not routed (404) |
| 18 | `setOwnerState` | `POST /owners/{id}/state` | RecordStateRequest | 200 SetOwnerStateResponse | Owner (428 missing / 412 stale) | required | IMPLEMENTED |
| 19 | `listLegalSubjects` | `GET /legal-subjects` | — | 200 ListLegalSubjectsResponse | — | — | IMPLEMENTED |
| 20 | `createLegalSubject` | `POST /legal-subjects` | CreateLegalSubject | 201 CreateLegalSubjectResponse | — | required | IMPLEMENTED |
| 21 | `getLegalSubject` | `GET /legal-subjects/{id}` | — | 200 GetLegalSubjectResponse | — | — | IMPLEMENTED |
| 22 | `patchLegalSubject` | `PATCH /legal-subjects/{id}` | PatchLegalSubject | 200 PatchLegalSubjectResponse | LegalSubject (428 missing / 412 stale) | required | IMPLEMENTED |
| 23 | `deleteUnusedLegalSubject` | `DELETE /legal-subjects/{id}` | — | 204 — | LegalSubject (428 missing / 412 stale) | required | IMPLEMENTED |
| 24 | `archiveLegalSubject` | `POST /legal-subjects/{id}/archive` | ArchiveRequest | 200 ArchiveLegalSubjectResponse | LegalSubject (428 missing / 412 stale) | required | IMPLEMENTED |
| 25 | `restoreLegalSubject` | `POST /legal-subjects/{id}/restore` | ArchiveRequest | 200 RestoreLegalSubjectResponse | LegalSubject (428 missing / 412 stale) | required | IMPLEMENTED |
| 26 | `bindCanonicalLegalSubject` | `POST /legal-subjects/{id}/canonical-bindings` | CanonicalBindingRequest | 200 BindCanonicalLegalSubjectResponse | LegalSubject (428 missing / 412 stale) | required | **DEFERRED_WITH_REASON** (D2): requires `sourceId` of a SourceReference the product cannot author before the Source phase; not routed (404) |
| 27 | `setLegalSubjectState` | `POST /legal-subjects/{id}/state` | RecordStateRequest | 200 SetLegalSubjectStateResponse | LegalSubject (428 missing / 412 stale) | required | IMPLEMENTED |
| 28 | `listSigners` | `GET /signers` | — | 200 ListSignersResponse | — | — | IMPLEMENTED |
| 29 | `createSigner` | `POST /signers` | CreateSigner | 201 CreateSignerResponse | — | required | IMPLEMENTED |
| 30 | `getSigner` | `GET /signers/{id}` | — | 200 GetSignerResponse | — | — | IMPLEMENTED |
| 31 | `patchSigner` | `PATCH /signers/{id}` | PatchSigner | 200 PatchSignerResponse | Signer (428 missing / 412 stale) | required | IMPLEMENTED |
| 32 | `deleteUnusedSigner` | `DELETE /signers/{id}` | — | 204 — | Signer (428 missing / 412 stale) | required | IMPLEMENTED |
| 33 | `archiveSigner` | `POST /signers/{id}/archive` | ArchiveRequest | 200 ArchiveSignerResponse | Signer (428 missing / 412 stale) | required | IMPLEMENTED |
| 34 | `restoreSigner` | `POST /signers/{id}/restore` | ArchiveRequest | 200 RestoreSignerResponse | Signer (428 missing / 412 stale) | required | IMPLEMENTED |
| 35 | `bindCanonicalSigner` | `POST /signers/{id}/canonical-bindings` | CanonicalBindingRequest | 200 BindCanonicalSignerResponse | Signer (428 missing / 412 stale) | required | **DEFERRED_WITH_REASON** (D2): requires `sourceId` of a SourceReference the product cannot author before the Source phase; not routed (404) |
| 36 | `setSignerState` | `POST /signers/{id}/state` | SignerStateRequest | 200 SetSignerStateResponse | Signer (428 missing / 412 stale) | required | IMPLEMENTED |
| 37 | `listOwnerSubjects` | `GET /owners/{ownerId}/subjects` | — | 200 ListOwnerSubjectsResponse | — | — | IMPLEMENTED |
| 38 | `linkOwnerSubject` | `POST /owners/{ownerId}/subjects` | LinkOwnerSubject | 201 LinkOwnerSubjectResponse | Owner (428 missing / 412 stale) | required | IMPLEMENTED |
| 39 | `getOwnerSubject` | `GET /owner-subjects/{id}` | — | 200 GetOwnerSubjectResponse | — | — | IMPLEMENTED |
| 40 | `setOwnerSubjectLinkState` | `POST /owner-subjects/{id}/link-state` | LinkStateRequest | 200 SetOwnerSubjectLinkStateResponse | OwnerSubject (428 missing / 412 stale) | required | IMPLEMENTED |

The implemented routes use the contract's own schemas at the edge: request bodies are parsed with the operation's strict request schema (422 `VALIDATION_FAILED`, unknown fields and empty PATCH included), path ids with the contract parameter schema (404 when a value can never name a record), and query strings accept only the declared parameters with one value each (400 `INVALID_QUERY_PARAMETER`). Every response of the integration suite is checked against the operation's declared status set and response schema.

## 2. Decisions D1–D6 as implemented

| Decision | Implementation |
|---|---|
| D1 OwnerSubject included | All four OwnerSubject operations. One unique `(ownerId, legalSubjectId)` row; Owner is never collapsed into LegalSubject and nothing is inferred from names |
| D2 SourceReference dependency | `bindCanonical*` not routed. Optional source ids (fieldAttributions, Signer identity/delegation, OwnerSubject `sourceId`) must name an existing SourceReference; none is ever created. The UI offers no way to attach one and shows canonical binding as unavailable with its reason. Tests insert synthetic SourceReference fixtures directly into `tb_notice_test` |
| D3 Established identity | Agency / LegalSubject are established when `recordState = ACTIVE`, when canonically bound (`canonicalCode`, `canonicalSourceId` or `bindingState ≠ LOCAL_ONLY`), or when another persisted record references them (every FK of the reviewed migration, plus JSON snapshot/scope columns). Evaluated under the row lock; no column. Identity-defining fields: Agency `legalName`, `organizationType`, `jurisdictionCountry`, `registrationAuthority`, `registrationNumber`; LegalSubject `legalName`, `legalForm`, `jurisdictionCountry`, `registrationAuthority`, `registrationNumber` (`subjectType` is not in PatchLegalSubject at all). Once established, a set value cannot be changed or cleared by PATCH (409 `ESTABLISHED_IDENTITY_IMMUTABLE`, with the fields and the reasons). **R5: an empty (null) identity field is locked too** — see §15 |
| D4 fieldAttributions | Wire shape by the contract; `field` must be an attributable data field of that entity (identity/contact/links; not notes, lifecycle or binding fields); every source id must exist (422 `REFERENCE_NOT_FOUND`); for the agency-owned Agency the source must belong to that agency or name it in `scopeBindings.agencyIds` (422 `CROSS_AGENCY_REFERENCE` / `SOURCE_SCOPE_UNRESOLVED`); `DOCUMENT_REVIEWED` needs ≥ 1 source (422 `FIELD_ATTRIBUTION_INVALID`); provenance stored exactly as sent (MISSING and CONFLICT stay); no source required otherwise |
| D5 Hard delete | Only when the record is DRAFT (Signer: operational state DRAFT and not archived), has no canonical binding, no FK reference and no JSON snapshot/scope reference; otherwise 409 `REFERENCED_RECORD_CANNOT_DELETE` with `details.blockers` (e.g. `NOT_DRAFT`, `ARCHIVED`, `CANONICAL_BINDING`, `REFERENCED_BY:signers.agency_id`, `SNAPSHOT_REFERENCE:source_references`) |
| D6 UI | Protected Directory pages (§8) |

## 3. Shared ETag and preconditions

- ETag = `"<EntityType>:<id>:v<rowVersion>"` (contract §6 example format), sent by every GET of one record and every successful mutation that returns a record (not by lists or 204).
- `If-Match` is required exactly where the contract declares `x-precondition-target`: missing or empty → **428** `PRECONDITION_REQUIRED`; anything other than the byte-identical current ETag of that target (stale version, weak validator, `*`, a list, another entity's ETag) → **412** `RECORD_VERSION_CONFLICT`. Nothing is overwritten silently; the server never re-reads and overwrites.
- The executor derives the precondition target from the contract and fails closed (500, rollback) if an operation's work does not check it, or checks another entity type. The check happens after the target row is locked.
- `linkOwnerSubject` uses the Owner ETag (contract target) and increments the Owner's row version (the association set changed); `setOwnerSubjectLinkState` uses the OwnerSubject ETag.
- Two-tab AC-055 is tested at HTTP level (`tests/db`), in the UI (`tests/web`) and in the browser (Playwright check 11).

## 4. Idempotency (existing `IdempotencyRecord` model)

- Key: header `Idempotency-Key`, 16–100 of `[A-Za-z0-9_-]` (missing 400 `IDEMPOTENCY_KEY_REQUIRED`, malformed 400 `IDEMPOTENCY_KEY_INVALID`). Scope = authenticated actor + operationId + key (the table's unique key).
- Request digest = SHA-256 of canonical JSON of operationId, method, the contract path with its parameters substituted, and the canonical body (sorted keys). `If-Match` is not part of the digest, so a retry after a lost response replays even though the version moved on.
- Claim → complete → release: an `IN_PROGRESS` row is inserted before the business transaction; the business transaction completes it (`COMPLETED`, status, response body, resource) in the **same** transaction as the change and its audit event; any failure deletes the claim, so no failed request is ever stored as a success.
- Same key + same digest + COMPLETED → the stored result is replayed (same status, data and ETag; the current request id); same key + other payload or target → 409 `IDEMPOTENCY_CONFLICT`; a live `IN_PROGRESS` claim → 409 `IDEMPOTENCY_IN_PROGRESS` with `Retry-After: 1`; a claim older than 60 s is treated as abandoned and taken over (a live claim cannot be that old: 2 s acquire, 5 s run, 3 attempts).
- Replay horizon 7 days (`expiresAt`); after it the key starts a new intent. Every replay passes the global guard again (session, CSRF, Origin); a disabled user or a missing session gets 401.
- Expired records are replaced on reuse; there is no purge job (retention DEFERRED, like session rows).

## 5. Transactions and audit

- One Prisma interactive transaction per write, `READ COMMITTED`, `maxWait` 2 s, `timeout` 5 s: lock the target row(s) `FOR UPDATE`, check If-Match, apply business rules, write with a compare-and-set on `rowVersion` (+1 exactly once per changing mutation), append the audit event, complete the idempotency record, commit.
- Lock order is alphabetical by entity type (Agency → LegalSubject → Owner → OwnerSubject → Signer). `createSigner` share-locks its Agency; `linkOwnerSubject` locks LegalSubject then Owner; `setOwnerSubjectLinkState` locks LegalSubject, Owner, then the association. A concurrent insert that references a locked row waits for the lock (foreign-key check), so reference checks see every committed reference.
- Deadlock (MySQL 1213 / Prisma P2034) and lock-wait timeout (1205) are retried with the same claim, at most 3 attempts, then 409 `RETRYABLE_TRANSACTION_CONFLICT`. Nothing outside the database happens inside a transaction.
- A PATCH that changes nothing succeeds without a write, an audit event or a version increment.
- Audit (append-only): `actorUserId` = the authenticated application User, `requestId`, action (`AGENCY_CREATED|UPDATED|ARCHIVED|RESTORED|STATE_CHANGED|DELETED`, likewise `OWNER_*`, `LEGAL_SUBJECT_*`, `SIGNER_*`, `OWNER_SUBJECT_LINKED`, `OWNER_SUBJECT_LINK_STATE_CHANGED`), before/after of the changed fields only plus the row version, `reason` for archive/restore/state/link-state, `sourceIds` of cited sources. Notes are recorded only as `{ redacted: true, codePoints }`. The P1 key guard (`password|token|secret|csrf|hash|cookie`) still applies. The audit writer is an injectable provider; a failing audit insert rolls back the change and the claim (AC-056, tested for create, update, link and delete).

## 6. Lists and cursors

- Default 25, maximum 100 (the contract `limit` parameter); order `(createdAt DESC, id DESC)` by keyset, never offsets.
- Cursor = base64url JSON `{v, o (operationId), f (fingerprint of path scope and filters), t (createdAt ms), i (id)}` + `.` + HMAC-SHA256 under a key derived from `TB_SESSION_SECRET` with a separate label. Tampered, truncated, foreign-operation, other-filter or other-scope cursors → 400 `INVALID_CURSOR`. The payload holds only values the client already received; no SQL offset or server state. Rotating the secret invalidates cursors.
- `q` is a literal substring (LIKE wildcards escaped), case- and accent-insensitive (`utf8mb4_0900_ai_ci` on the compared columns only): Agency displayName/legalName; Owner displayName/aliases; LegalSubject legalName/aliases/registrationNumber; Signer fullLegalName/title (+ exact `agencyId` filter); OwnerSubject relationship label or the linked subject's legal name, within one Owner (404 for an unknown Owner).

## 7. Directory behaviour by entity

- **Agency** — created DRAFT with only the supplied fields (displayName required); `bindingState LOCAL_ONLY`; creating or activating creates no authority. PATCH: optimistic concurrency and the D3 identity lock; label/contact/link corrections stay editable. State: DRAFT ⇄ ACTIVE with a reason (same state 409; ARCHIVED is not a state-command target). Archive: → ARCHIVED with `archivedAt`/`archiveReason`, read-only (PATCH/state 409). Restore: → DRAFT, archive fields cleared (kept in audit), never revives authority. Delete: D5.
- **Owner** — a client/brand namespace, not the claimant; may exist without any LegalSubject; aliases and channels stored verbatim; no identity lock (not in D3); same lifecycle as Agency; archiving does not touch shared LegalSubjects or associations; delete blocked while associations exist.
- **LegalSubject** — INDIVIDUAL / LEGAL_ENTITY / OTHER kept exactly; `subjectType` can never be patched (422); D3 identity lock (AC-005); `identityReviewState` stays UNREVIEWED (no DTO writes it); delete blocked while linked.
- **OwnerSubject** — link: 404 unknown Owner, 422 unknown subject (`legalSubjectId`), 409 for archived parties, 409 `DUPLICATE_OWNER_SUBJECT` with the existing id (unique key as backstop), optional existing `sourceId`. Link-state: LINKED ⇄ PAUSED ⇄ UNLINKED with a reason; UNLINKED sets `unlinkedAt`/`unlinkReason`, relinking clears them (the audit trail keeps every earlier state); unlink refused with 409 `DEPENDENT_ROUTES_LINKED` while routes using the association are LINKED or PAUSED (AC-011, no cascade); relinking needs both parties unarchived. The row is never deleted.
- **Signer** — belongs to one existing, non-archived Agency (422 unknown, 409 archived); `agencyId` is not in PatchSigner, so a move is rejected as an unknown field and nothing changes (AC-006); identity/delegation sources must exist and belong to the Signer's Agency or be explicitly scoped to it; operational state DRAFT/AVAILABLE/PAUSED/ENDED changes only by the state command with a reason; archive/restore is an orthogonal flag that leaves the operational state unchanged; archived signers are read-only; delete: DRAFT, not archived, unbound, unreferenced. No CoverageSigner, eligibility, G7 or signature.

## 8. Directory UI

React pages under the existing authenticated shell (React 19, React Router 8, plain CSS; **no new dependency**): `/directory/{agencies,owners,legal-subjects,signers}` with list, search (`?q=`), keyset pages, detail, create and edit; `/directory/owner-subjects/:id`; the owner page manages its legal-subject links.

- Loading, empty, validation (focused summary linking to the fields, `aria-invalid`, described-by), API-error, version-conflict (412: focused notice, "Load latest version") and session-ended states are explicit.
- Writes send the CSRF token, one Idempotency-Key per intent (reused only for an identical resubmission) and the exact If-Match; a rejected CSRF token is refreshed once and the same intent retried; a 401 returns to Login.
- Archive/restore/state/link-state go through reason dialogs that state what the action does not do; delete-draft uses a confirmation with the safe choice focused; a refusal is explained in plain language; when the page already lists a record's signers or links, "Delete draft" is shown as unavailable with the reason.
- Canonical binding and source attachment are visibly unavailable (aria-disabled with the reason), never simulated.
- Native modal dialogs (focus in, Escape cancels, focus returns to the opener), visible focus rings, labelled controls, skip link, light/dark tokens, no motion; works at 390 px.
- Design direction (frontend-design): a registry-extract header (condensed record name, double-ruled state stamp, version, binding) as the one bold element; sheets divided by rules; local fonts only (no external font requests).

## 9. Tests

| Suite | P2 tests | Covers |
|---|---|---|
| `tests/db/directory-http.test.ts` (tb_notice_test, real AppModule over HTTP) | 60 | AC-001…006, AC-011, AC-055…058; every conditional operation 428/412 (table-driven, compared with the contract list); idempotency replay/conflict/in-progress/abandoned lease/actor+operation scope/7-day expiry/failed request/replay auth/concurrent duplicates; atomicity (create, update, link, delete); cursors (order, default/max, tamper, filter/scope binding, invalid parameters); D3/D4/D5 rules; OwnerSubject link/state/history/duplicates/archived parties/list scope; Signer agency, sources, states, delete, filter; security (no session, CSRF, Origin → no write); unknown fields; deferred operations 404; exact route inventory; no-store; contract conformance of every collected response; a full tour of all 36 operations |
| `tests/api/write-primitives.test.ts` | 13 | ETag/If-Match, key format, 7-day horizon, canonical JSON and digest binding, cursor round trip/tamper/secret rotation, error classification |
| `tests/api/directory-rules.test.ts` | 14 | Contract parsing (body/path/query), frozen request cases, attribution rules, change detection and redaction, lifecycle transitions, LIKE escaping, **migration-derived guards** that every FK to a directory table and every JSON column is in the dependency inventories |
| `tests/api/write-executor.test.ts` | 7 | Atomic completion, bounded deadlock retries, give-up with 409 and claim release, no retry of other failures, 400/428 before any claim, fail-closed precondition-target check, non-idempotent operation refused |
| `tests/web/directory.test.tsx` (happy-dom) | 19 | UI states, create/validation/edit/no-op, 412 notice and reload, dialogs and focus, delete confirmation/refusal/known blocker, canonical binding inert, paging/search, CSRF refresh with the same key, 401 → Login, linking, duplicates, signer and subject type fixed, identity lock, no sign/send/adopt actions |

Changed P1 tests (counts unchanged): the route inventory test now asserts the four P1 routes plus only directory routes (the exact directory inventory is in the P2 suite). Its 404 probe list used `POST /api/v1/signers` as an example of a forbidden signing route; that path is now the contracted `createSigner`, so the probes name `POST /signers/{id}/sign` and `POST /candidates/{id}/send` instead (both still 404). The shell test expects Directory as the one reachable business module. `tests/db/auth-support.ts` lets a test replace the audit writer (used for AC-056).

Counts as submitted at R5 (the closeout adds 13 tests, §15). Totals on the first PC (2026-09-24 sweep) and in CI run 35948987435: `yarn test` **1035** tests in 26 files (P1.1: 982 in 22, so +53 in the 4 new files above); `yarn test:db` **138** tests in 5 files (P1.1: 78 in 4, so +60 in `directory-http.test.ts`). P2 adds 113 tests; no earlier test was removed. Per-file counts were confirmed with `vitest list`. All tests use synthetic data: the DB suites run on `tb_notice_test`, which `db:verify test --expect-empty` shows empty afterwards.

## 10. Negative controls

Each control disables exactly one protection in the source, runs the suite responsible for it, expects that suite to **fail**, then restores the file and verifies it byte-identical by SHA-256 (runner in the engineering scratchpad; log `evidence/p2-negative-controls.txt`, 2026-09-24 UTC, first PC, synthetic data on `tb_notice_test`). A control passes only if the suite fails and the file is restored. In every control only the targeted tests failed; no control broke a whole suite.

| # | Protection disabled | File | Suite run | Result | Restored (SHA-256) |
|---|---|---|---|---|---|
| NC01 | If-Match comparison skipped (stale ETags accepted) | `apps/api/src/infrastructure/write/write-executor.ts` | `tests/db/directory-http.test.ts` | 4 of 60 failed | yes |
| NC02 | PATCH does not increment rowVersion | `apps/api/src/modules/directory/agencies.service.ts` | `tests/db/directory-http.test.ts` | 3 of 60 failed | yes |
| NC03 | Idempotency payload digest not compared (key reuse with another payload replays) | `apps/api/src/infrastructure/write/idempotency.ts` | `tests/db/directory-http.test.ts` | 1 of 60 failed | yes |
| NC04 | Concurrent IN_PROGRESS duplicate not reported (treated as a new claim) | `apps/api/src/infrastructure/write/idempotency.ts` | `tests/db/directory-http.test.ts` | 2 of 60 failed | yes |
| NC05 | Audit failure swallowed (business write commits without its audit event) | `apps/api/src/infrastructure/write/write-executor.ts` | `tests/db/directory-http.test.ts` | 2 of 60 failed | yes |
| NC06 | Failed request keeps its claim (not released) | `apps/api/src/infrastructure/write/write-executor.ts` | `tests/db/directory-http.test.ts` | 4 of 60 failed | yes |
| NC07 | Cursor HMAC not verified (forged cursors accepted) | `apps/api/src/infrastructure/write/cursor.ts` | `tests/db/directory-http.test.ts` | 1 of 60 failed | yes |
| NC08 | Cursor filter fingerprint not checked (cursor reusable with other filters/scope) | `apps/api/src/infrastructure/write/cursor.ts` | `tests/db/directory-http.test.ts` | 1 of 60 failed | yes |
| NC09 | Established Agency identity not locked | `apps/api/src/modules/directory/agencies.service.ts` | `tests/db/directory-http.test.ts` | 2 of 60 failed | yes |
| NC10 | Delete ignores relational and snapshot dependencies | `apps/api/src/modules/directory/agencies.service.ts` | `tests/db/directory-http.test.ts` | 1 of 60 failed | yes |
| NC11 | Snapshot/scope JSON references not scanned | `apps/api/src/modules/directory/records.ts` | `tests/db/directory-http.test.ts` | 2 of 60 failed | yes |
| NC12 | Duplicate OwnerSubject pre-check removed | `apps/api/src/modules/directory/owner-subjects.service.ts` | `tests/db/directory-http.test.ts` | 1 of 60 failed | yes |
| NC13 | Unlink allowed while dependent routes are LINKED/PAUSED | `apps/api/src/modules/directory/owner-subjects.service.ts` | `tests/db/directory-http.test.ts` | 1 of 60 failed | yes |
| NC14 | Supplied source ids not checked for existence | `apps/api/src/modules/directory/sources.ts` | `tests/db/directory-http.test.ts` | 4 of 60 failed | yes |
| NC15 | Cross-agency source accepted | `apps/api/src/modules/directory/sources.ts` | `tests/db/directory-http.test.ts` | 2 of 60 failed | yes |
| NC16 | DOCUMENT_REVIEWED accepted without a source | `apps/api/src/modules/directory/attributions.ts` | `tests/db/directory-http.test.ts` | 1 of 60 failed | yes |
| NC17 | Unknown body fields tolerated (a Signer agencyId PATCH passes through) | `apps/api/src/infrastructure/write/request-parsing.ts` | `tests/db/directory-http.test.ts` | 4 of 60 failed | yes |
| NC18 | Archived records stay editable | `apps/api/src/modules/directory/lifecycle.ts` | `tests/db/directory-http.test.ts` | 2 of 60 failed | yes |
| NC19 | Signer may be created in an archived Agency | `apps/api/src/modules/directory/signers.service.ts` | `tests/db/directory-http.test.ts` | 1 of 60 failed | yes |
| NC20 | CSRF token not required for directory writes (guard) | `apps/api/src/modules/auth/auth.guard.ts` | `tests/db/directory-http.test.ts` | 1 of 60 failed | yes |
| NC21 | Retry classification disabled (deadlocks surface as errors, no bounded retry) | `apps/api/src/infrastructure/write/database-errors.ts` | `tests/api/write-executor.test.ts` + `write-primitives.test.ts` | 3 of 20 failed | yes |
| NC22 | Web client does not send If-Match | `apps/web/src/app/api/client.ts` | `tests/web/directory.test.tsx` | 9 of 19 failed | yes |
| NC23 | Web CSRF retry uses a new Idempotency-Key | `apps/web/src/app/directory/hooks.tsx` | `tests/web/directory.test.tsx` | 1 of 19 failed | yes |
| NC24 | Reference inventory guard (a directory FK missing from DIRECT_REFERENCES) | `apps/api/src/modules/directory/records.ts` | `tests/api/directory-rules.test.ts` | 1 of 14 failed | yes |

The R5 closeout adds NC25–NC30 (§15). **Result at R5: 24/24 controls failed their suite as expected; all files restored** (`git status` afterwards showed no source change). Server-side behaviour that the UI cannot enforce (idempotency, identity lock, dependency checks) is controlled against the HTTP suite; the web controls (NC22, NC23) show that the UI tests detect a client that stops sending `If-Match` or retries a CSRF refresh under a new key.

## 11. First-PC regression sweep

Run 2026-09-24T03:02:05Z–03:04:03Z on the first PC, source tree identical to `cbfd640` (only this documentation uncommitted); log `evidence/p2-first-pc-sweep.txt`.

| Command (mission §19 order) | Result |
|---|---|
| `yarn reference:check` | exit 0 — frozen references intact |
| `yarn reference:helper-tests` | exit 0 — 27 pass, 0 fail; references intact afterwards |
| `yarn contracts:check` | exit 0 — 3 generated outputs match the active source |
| `yarn install --immutable` | exit 0 — lockfile unchanged |
| `yarn typecheck` | exit 0 |
| `yarn lint` | exit 0 |
| `yarn format:check` | exit 0 |
| `yarn test` | exit 0 — 1035 / 1035 in 26 files |
| `yarn test:db` | exit 0 — 138 / 138 in 5 files (`tb_notice_test`) |
| `yarn db:verify test --expect-empty` | exit 0 — PASS, domain rows 0 |
| `yarn db:verify dev` | exit 0 — PASS (metadata and a row count only; no row content read) |
| `yarn build` | exit 0 |
| `yarn smoke:local` | exit 0 — 23 checks, including 9 directory boundary checks |
| `yarn dev:verify-shutdown` | exit 0 — 4 / 4 scenarios |
| `yarn reference:check` (after) | exit 0 |

Supplementary read-only checks: `db:status` test and dev up to date; both Prisma drift diffs empty; `git diff 8fe96ae..HEAD` shows no change under `apps/api/prisma`, `packages/**`, `docs/reference/**` or `yarn.lock` (`package.json` adds only the scripts `smoke:directory` and `ui:sandbox`); the working tree afterwards held only this documentation.

Unlike the P1.1 sweep, `smoke:local` and `dev:verify-shutdown` ran locally: ports 3000/5173 were free. Nothing was written to `tb_notice_dev`; the authenticated compiled round trip (`smoke:directory`) runs in CI only (§14).

## 12. Interpretations for R5 review (with the R5 decisions)

| Topic | Decision taken | Why | R5 decision (operator, 2026-09-24) |
|---|---|---|---|
| Empty identity field of an established record | Can be completed once; a set value cannot be changed or cleared | D3 forbids *changing* identity; the domain model lets legal details "remain absent during onboarding" and forbids forcing fabrication. Blocking completion would force guessing before activation or linking | **OVERRIDDEN** — every identity field of an established record is locked, empty ones included; remediated (§15) |
| Agency `displayName` | Not identity-defining | "Same-entity contact/name corrections are audited; a different legal entity needs a different Agency record" — the legal entity is the legal fields | Not separately ruled on (P2 accepted with one remediation) |
| Restore target state | DRAFT (Agency/Owner/LegalSubject) | No previous state is stored; restoring never re-activates or revives anything by itself | **ACCEPTED** (A) |
| Archived records | Read-only (PATCH/state 409) until restored | Archive preserves history; edits need an explicit restore | **ACCEPTED** (B): read-only except the explicit restore |
| Signer archive vs operational state | Independent; restore leaves the operational state | Contract has both `operationalState` and archive fields | Not separately ruled on; consistent with C |
| Signer state transitions | Any other state with a reason; same state 409 | The contract enumerates the states without transition rules; no rule was invented | **ACCEPTED** (C): the state is administrative only and implies no coverage, eligibility, G7, signature authority or notice adoption |
| Same-state / no-op commands | State commands: 409; PATCH without changes: 200 without write | A command asserts a transition; a PATCH describes a target state | Not separately ruled on |
| Status codes | Body schema/business validation 422; query 400; unknown/invalid path id 404; reference not found 422; state/identity/duplicate/delete conflicts 409 | API_CONTRACT §5 status table and each operation's declared statuses | Not separately ruled on |
| Source scope for agency-less sources | Accepted for an Agency/Signer only when `scopeBindings.agencyIds` names that agency | INVARIANTS §3 "no global access from null agency"; Owner/LegalSubject/OwnerSubject have no agency, so only existence is checked (scope review is Source-phase work) | **ACCEPTED** (D) |
| Owner version on link | Incremented | The contract precondition target of `linkOwnerSubject` is the Owner; its ETag then reflects the association set | Not separately ruled on |
| Search semantics | Case- and accent-insensitive literal substring | The contract only declares `q`; Vietnamese names need accent-insensitive search | **ACCEPTED** (E) for discovery only; never identity equality, canonical matching, duplicate determination, unique keys or entity equivalence (guard test, §15) |
| Unknown query parameters | 400 | Strict input like bodies; prevents silently unfiltered lists | Not separately ruled on |
| Unpaired UTF-16 surrogates | 422 | utf8mb4 cannot store them exactly; storing a replacement would silently change data | Not separately ruled on |

## 13. Database changes

**None** (also none for the R5 remediation). No migration was created or applied; `20260923103912_initial_schema` (sha256 `b54c36fd…6515`) remains the only migration; `db:verify` passes on test (empty) and dev. The existing schema was sufficient for every implemented rule.

## 14. Limitations

- Canonical binding and source attachment wait for the Source phase (P3A); fieldAttributions with `DOCUMENT_REVIEWED` can therefore not be recorded through the product yet.
- Since R5, an established record's identity cannot be corrected or completed at all through the product; that needs a future dedicated workflow with source, provenance and audit, which was not invented.
- The UI cannot see every reference that blocks a delete (routes, cases, snapshots are later phases); the server decides and the UI explains its refusal.
- LegalSubject pages cannot list their owners (the contract has no such operation); links are managed from each owner.
- Expired idempotency records and cursors are not purged or revoked (retention DEFERRED); rotating `TB_SESSION_SECRET` invalidates cursors and sessions.
- The compiled authenticated round trip (`smoke:directory`) runs only in CI: no account or record may be created in the operator's `tb_notice_dev`. On the first PC the compiled directory API was exercised through `yarn ui:sandbox` on `tb_notice_test` (Playwright checks and the same round trip).
- The headless browser used Linux fallback fonts; the Windows faces of the design (Bahnschrift, Segoe UI) were not rendered in this verification.

## 15. R5 closeout (2026-09-24, home PC)

**R5 result (operator): PASS_WITH_ONE_REMEDIATION.** P2 is accepted subject to one correction. Interpretations A–E are accepted as recorded in §12. The empty-identity-field interpretation is overridden. Mission: TB_R5_CLOSEOUT_AND_SINGLE_PC_DEVELOPMENT_BASELINE. The development topology decided with it is ADR-0003.

### 15.1 Remediation (commit `4b67fff`)

- **Rule.** Once an Agency or LegalSubject is established, generic PATCH refuses any change to any identity-defining field, whether its current value is populated, null or empty. "Established" means ACTIVE, canonically bound, or referenced by another persisted business record; it is still derived under the row lock and has no column. The refusal is 409 `ESTABLISHED_IDENTITY_IMMUTABLE`, with `details.fields` (the identity fields the request would change) and `details.establishedBy` (the reasons). The whole request is refused, so a mixed identity + contact PATCH writes nothing. Label and contact fields stay editable. Repeating a field's current value is not a change, so it is not refused.
- **API.** `agencies.service.ts` and `legal-subjects.service.ts` no longer exempt fields whose current value is null. The error message now reads "cannot be set, changed or cleared".
- **UI.** The agency and legal-subject edit forms lock every identity field (read-only, with the reason) as soon as the page knows the record is established (active or canonically bound). When only the server knows (a reference), its refusal locks every identity field, restores their values and explains why; other changes can be saved again.
- **No workflow invented.** Correcting or supplementing an established identity is left to a future dedicated workflow.
- **Interpretation C.** The Signer state dialog and service comment state that no state implies mandate coverage, eligibility, G7, signature authority or notice adoption. A test shows that AVAILABLE creates no mandate, coverage, coverage-signer or authority-selection row.
- **Interpretation E.** A guard test scans the whole API source: every case/accent-insensitive collation must be a `LIKE` search on the `q` pattern. Duplicate detection (ids), unique keys (binary collation) and identity comparison (exact values) never use it.
- **No change elsewhere.** No migration, no wire-contract change (`contracts:check` OK), no dependency change.

### 15.2 Tests added (13)

| Suite | Added | Covers |
|---|---|---|
| `tests/db/directory-http.test.ts` | +9 (60 → 69) | A draft, unreferenced Agency and LegalSubject fill empty identity fields. For each establishment reason — ACTIVE, referenced (a Signer / an owner link), canonically bound (a synthetic source set directly in `tb_notice_test`, since binding operations are deferred), scope-referenced (`scopeBindings`) — an Agency (4 tests) and a LegalSubject (4 tests) refuse filling an empty identity field, alone or mixed with a contact change. Afterwards the record, version and ETag are unchanged, there is no new audit event and no idempotency record is kept; a contact change then succeeds with version +1. Updated: the ACTIVE-agency test also refuses filling an empty field; AC-005 also refuses empty `legalForm`/`jurisdictionCountry`; the Signer state test asserts AVAILABLE creates no authority rows |
| `tests/web/directory.test.tsx` | +3 (19 → 22) | ACTIVE agency: every identity field locked, empty ones included, and a contact change sent alone (rewritten test). Referenced draft agency: the server refusal locks and restores all identity fields, and the contact change still saves. ACTIVE legal subject: every identity field locked. Signer state dialog wording (C) |
| `tests/api/directory-rules.test.ts` | +1 (14 → 15) | Accent-insensitive collation only in `LIKE` search (E) |

Totals: `yarn test` 1039 in 26 files (R5: 1035); `yarn test:db` 147 in 5 files (R5: 138).

### 15.3 Negative controls NC25–NC30 (`evidence/p2-negative-controls-r5.txt`)

Same method as §10, and this run also records the failing tests. The restored files' SHA-256 values equal the committed `4b67fff` versions.

| # | Hole re-opened | Suite | Result (only the targeted tests failed) |
|---|---|---|---|
| NC25 | Agency: empty identity fields of an established record fillable again (the pre-R5 rule) | directory-http | 5 of 69 failed: the ACTIVE-lock test and the four Agency establishment cases |
| NC26 | LegalSubject: the same | directory-http | 5 of 69 failed: the four LegalSubject cases and AC-005 |
| NC27 | Agency form: empty identity fields of an established agency editable again | web directory | 2 of 22 failed: the ACTIVE-lock and server-refusal tests |
| NC28 | LegalSubject form: the same | web directory | 1 of 22 failed: the ACTIVE legal subject test |
| NC29 | Agency form: a server refusal does not lock the fields | web directory | 1 of 22 failed: the server-refusal test |
| NC30 | Accent-insensitive collation used for an equality match | directory-rules | 1 of 15 failed: the E guard |

**6/6 controls failed their targeted tests; all files restored byte-identical.**

### 15.4 Playwright re-run of the affected scenarios (`evidence/p2-playwright-mcp-r5-identity-lock.txt`)

Same isolated test browser, compiled API on the disposable `tb_notice_test` (`yarn ui:sandbox` on the `4b67fff` tree), synthetic data, cleaned up afterwards (`db:verify test --expect-empty` PASS). Five scenarios, all PASS:

- R1: a draft, unreferenced agency fills an empty registration number.
- R2: an ACTIVE agency locks all five identity fields, including three empty ones; a phone change is sent alone (screenshot 08).
- R3: a draft agency with a signer gets the real 409 when a field is filled; all identity fields lock and revert; the phone change saves and the refused request did not bump the version (screenshot 09).
- R4: the same refusal and lock on a legal subject linked to an owner.
- R5: the Signer state dialog shows the interpretation-C wording.

The other R5 browser checks do not depend on the identity lock.

### 15.5 Closeout regression sweep (`evidence/p2-closeout-sweep.txt`)

2026-09-24T04:07–04:09Z on the home PC, tree = `4b67fff` plus uncommitted documentation. All exit 0:

- `reference:check`, then `reference:helper-tests` (27/27) and `contracts:check`
- `install --immutable`, `typecheck`, `lint`, `format:check`
- `test` 1039/1039 and `test:db` 147/147
- `db:verify test --expect-empty` (0 rows) and `db:verify dev` (metadata PASS)
- `build`, `smoke:local` (23 checks) and `dev:verify-shutdown` (4/4)
- `reference:check` again at the end

The read-only checks also pass: `db:status` up to date on test and dev, and both Prisma drift diffs are empty.

### 15.6 CI

The remediation `4b67fff` passed in run 35953912083: both jobs success; `yarn test` 1039, `yarn test:db` 147, `smoke:local` 23 checks, `smoke:auth`, `smoke:directory` 14 checks and `dev:verify-shutdown` 4/4 (`evidence/p2-ci-run-35953912083.txt`). The closeout documentation commit's run is reported with the closeout; a commit cannot record its own run.

### 15.7 Notes for the operator

- **Interpretation B in detail.** An archived record itself accepts only restore. An owner–subject association whose Owner or LegalSubject is archived can still be paused or unlinked: the association is its own record, and the archived party does not change. New links and relinks to an archived party are refused. This is unchanged since R5.
- **Cosmetic.** When a record is established, the same lock note repeats under each of the five identity fields. It is accurate and accessible; one note for the fieldset would read more quietly. It is not changed in this closeout.
- **Next phases** (recorded in `docs/CURRENT_STATE.md`, not started):
  - **P3A** — Sources, canonical bindings and Route; gate R6.
  - **P3B** — representation authority; gate R7; not automatic after R6.
  - Cases come later.
