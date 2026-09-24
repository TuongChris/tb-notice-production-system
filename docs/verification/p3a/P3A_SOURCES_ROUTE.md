# P3A — Sources, canonical bindings and Route (home PC)

Mission TB_P3A_SOURCES_CANONICAL_BINDINGS_AND_ROUTE_TO_R6 on `feature/p3a-sources-route`, branched from the R5 closeout head `31db581` after R5 was closed (P2 = VERIFIED_COMPLETE_FOR_CURRENT_SCOPE). Recorded 2026-09-24 (UTC) on the home PC, the primary development workstation (ADR-0003). The mission stops at review gate **R6**. P3B (Mandate, MandateVersion, MandateCoverage, CoverageSigner, AuthorityEvent), Cases and every later phase were **not started**. No correspondence, prompt, NoticeCandidate, ValidationRun workflow, assessment, readiness, G1–G7, signing, sending, Drive write or other external action exists.

## Status by scope (not collapsed)

| Scope | Status | Basis |
|---|---|---|
| **P3A_FIRST_PC** | **PASS** | All automated checks in §13 executed on the home PC and passed |
| **P3A_CI** | **PASS** for the code head `85c2839` (push run 35966162924, both jobs success; the pull_request run 35966165567 of PR #1 also success), `9481bd0` (35963513064) and `73fa223` (35962967984). The first two P3A commits `afeb012` / `0c289be` failed CI (35959934247, 35961207473) on the stale P2 expectation in `smoke:local`, fixed in `73fa223` | CI covers `yarn test`, `yarn test:db`, `smoke:local` (28 checks), `smoke:auth`, `smoke:directory` and the new compiled `smoke:p3a` flow (24 checks, `evidence/p3a-ci-run-35966162924.txt`). A commit cannot record its own run; the documentation commit's run is reported with R6 |
| **P3A_BROWSER (Playwright MCP)** | **PASS** 21/21 (supplemental), one copy defect found and fixed | Isolated test browser against the compiled API on the disposable `tb_notice_test` (`evidence/p3a-playwright-mcp-verification.txt`, §11) |
| **P3A_NEGATIVE_CONTROLS** | **PASS** 28/28 | Every disabled protection made its responsible suites fail; all files restored byte-identically (`evidence/p3a-negative-controls.txt`, §12) |
| **R6 review** | **PENDING** (operator) | This record |
| **P1_WINDOWS_BROWSER** | **NOT_RUN** (not reported) | Unchanged |
| **P0_SECOND_PC** / **P0_TWO_PC_ACCEPTANCE** / **P0_SINGLE_PC_BASELINE** / **P0_OVERALL** | **DEFERRED_BY_OPERATOR** / **NOT_COMPLETED** / **VERIFIED** / **NOT_COMPLETE** against the original two-PC contract | ADR-0003; unchanged by P3A |

`EXTERNAL_LEGAL_ACTIONS=0` · `REAL_CASE_MUTATIONS=0` · `G7_CREATED=0` · `DRIVE_WRITES=0` · `DEPLOYMENTS=0` · `REAL_TB_DATA_IN_GIT=0` · `REAL_ACCOUNTS_CREATED_BY_ENGINEER=0` · `RECORDS_WRITTEN_TO_OPERATOR_DB=0` · `SCHEMA_CHANGES=0` · `WIRE_CONTRACT_CHANGES=0` · `NEW_DEPENDENCIES=0`.

Boundaries that hold throughout P3A:

- A **SourceReference** is a pointer with capture metadata. It is not evidence, not proof of review, not a permission and not authority. The canonical evidence stays in Google Drive; the database is not a second evidence archive.
- A **canonical binding** records which SourceReference holds a record's canonical code — an identity/reference association only. It establishes no ownership, rights, representation authority, mandate, signer eligibility, G1–G7 or readiness. An Owner binding is not legal ownership; a Signer binding is not signing authority.
- A **Route** (Agency + OwnerSubject + Platform) is a relationship record. Linking, pausing, unlinking, relinking or binding a route is not authority and revokes nothing.
- An application **User** is not a **Signer**.

## 1. Operation implementation matrix (contract-first)

Generated from the active `@tb/contracts` operation metadata (wire baseline `TB-SCHEMA-API-v1.0.0`, unchanged; `contracts:check` OK). **17 of 17 implemented**; together with P2 the API serves 53 business operations (the route-inventory test asserts exactly these). Mandate operations (P3B) are not routed (404, checked by `smoke:local` and `smoke:p3a`).

| # | operationId | Method and path | Request | Success | ETag precondition (`If-Match`) | Idempotency-Key | Query |
|---|---|---|---|---|---|---|---|
| 1 | `listSources` | `GET /sources` | — | 200 ListSourcesResponse | — | — | `q`, `agencyId`, `limit`, `cursor` |
| 2 | `createSource` | `POST /sources` | CreateSource | 201 CreateSourceResponse (no ETag) | — | required | — |
| 3 | `getSource` | `GET /sources/{id}` | — | 200 GetSourceResponse (no ETag) | — | — | — |
| 4 | `reviseSource` | `POST /sources/{id}/revisions` | ReviseSource | 201 ReviseSourceResponse (no ETag) | — | required | — |
| 5 | `bindCanonicalAgency` | `POST /agencies/{id}/canonical-bindings` | CanonicalBindingRequest | 200 BindCanonicalAgencyResponse | Agency (428 missing / 412 stale) | required | — |
| 6 | `bindCanonicalOwner` | `POST /owners/{id}/canonical-bindings` | CanonicalBindingRequest | 200 BindCanonicalOwnerResponse | Owner (428 / 412) | required | — |
| 7 | `bindCanonicalLegalSubject` | `POST /legal-subjects/{id}/canonical-bindings` | CanonicalBindingRequest | 200 BindCanonicalLegalSubjectResponse | LegalSubject (428 / 412) | required | — |
| 8 | `bindCanonicalSigner` | `POST /signers/{id}/canonical-bindings` | CanonicalBindingRequest | 200 BindCanonicalSignerResponse | Signer (428 / 412) | required | — |
| 9 | `listRoutes` | `GET /routes` | — | 200 ListRoutesResponse | — | — | `q`, `agencyId`, `limit`, `cursor` |
| 10 | `createRoute` | `POST /routes` | CreateRoute | 201 CreateRouteResponse | — | required | — |
| 11 | `getRoute` | `GET /routes/{id}` | — | 200 GetRouteResponse | — | — | — |
| 12 | `patchRoute` | `PATCH /routes/{id}` | PatchRoute | 200 PatchRouteResponse | Route (428 / 412) | required | — |
| 13 | `deleteUnusedRoute` | `DELETE /routes/{id}` | — | 204 | Route (428 / 412) | required | — |
| 14 | `archiveRoute` | `POST /routes/{id}/archive` | ArchiveRequest | 200 ArchiveRouteResponse | Route (428 / 412) | required | — |
| 15 | `restoreRoute` | `POST /routes/{id}/restore` | ArchiveRequest | 200 RestoreRouteResponse | Route (428 / 412) | required | — |
| 16 | `bindCanonicalRoute` | `POST /routes/{id}/canonical-bindings` | CanonicalBindingRequest | 200 BindCanonicalRouteResponse | Route (428 / 412) | required | — |
| 17 | `setRouteLinkState` | `POST /routes/{id}/link-state` | LinkStateRequest | 200 SetRouteLinkStateResponse | Route (428 / 412) | required | — |

As in P2, request bodies are parsed with the operation's strict contract schema (422 `VALIDATION_FAILED`, unknown fields included), path ids with the contract parameter schema, and only the declared query parameters are accepted (400). Every response collected by the HTTP suite is checked against the operation's declared status set and response schema.

Code: `apps/api/src/modules/sources/` (`source-rules.ts`, `source-scope.ts`, `source-views.ts`, `sources.service.ts`, `sources.controller.ts`), `apps/api/src/modules/directory/canonical-binding.ts` (one binding routine for the five targets), `apps/api/src/modules/representation/` (`routes.service.ts`, `routes.controller.ts`, `route-views.ts`). The shared write layer moved into its own `WriteModule` (`apps/api/src/infrastructure/write/write.module.ts`) so the Directory, Sources and Representation modules use one executor; the P2 `directory/sources.ts` checks were replaced by the single rule set in `source-scope.ts`.

## 2. SourceReference semantics

- **Stored as supplied.** Every CreateSource field is stored exactly as sent; nothing is derived from the title, URL, file id, role or the row's existence. Omitted `accessState` / `reportedProvenance` take the schema defaults NOT_CHECKED / OPERATOR_REPORTED — nothing is upgraded, and no REVIEWED / APPROVED / VERIFIED / AUTHORIZED / READY state exists or is set.
- **Provenance.** The canonical vocabulary only (DOCUMENT_REVIEWED, OPERATOR_REPORTED, ANALYSIS, MISSING, CONFLICT); an imported label such as OPERATOR_CONFIRMED can be kept only as `rawProvenance` text. DOCUMENT_REVIEWED is an attributable report of a review done outside the app: it needs `reviewedByLabel` (422 `REVIEW_UNATTRIBUTED`); the app reviews nothing itself.
- **Hashes.** Never computed or fetched; a supplied `contentSha256` must come with its `hashTarget` and vice versa (422 `CONTENT_HASH_INCOMPLETE`). An address is never hashed as content.
- **No fetching, no Drive access.** The URL is a pointer; the app never opens it. No Drive write, upload or edit exists.
- **Immutable.** No PATCH; responses carry no ETag. A change is a new revision (§3).
- **Scope records.** The owning agency and every agency or legal subject named in `scopeBindings` must exist (422 `REFERENCE_NOT_FOUND`) and not be archived (409); an agency-owned source cannot also be shared with other agencies (422 `CROSS_AGENCY_REFERENCE`, field `scopeBindings.agencyIds.N`). `caseIds` are refused until Cases exist (422 `CASE_SCOPE_UNAVAILABLE`).
- **Audit = metadata only.** `SOURCE_CREATED` / `SOURCE_REVISED` record the capture fields; `scopeText`, `excerpt`, `limitations` and the scope limitation are recorded as `{redacted: true, codePoints}`; the supplied digest is recorded under guard-safe keys (`contentDigest: {sha256, target}`) because the P1 audit guard refuses any key naming a hash. No source content is copied into the audit trail.
- **Lists.** `listSources` shows current revisions only, as summaries; `q` is a literal, accent-insensitive substring of title, address or provider file id, or an exact source id or chain id; `agencyId` returns the agency's own sources plus agency-less sources that name it in `scopeBindings.agencyIds`.

## 3. Revision and history

- A chain is identified by `sourceGroupId`; revision 1, 2, … ; `supersedesSourceId` points to the predecessor. The database's unique keys on `supersedes_source_id` and `(source_group_id, revision)` are the backstop.
- Only the current head can be revised: an earlier revision → 409 `REVISION_NOT_HEAD` with the head's id; two concurrent revisions of one head → exactly one is accepted.
- A revision keeps `agencyId` and `scopeBindings` (422 `REVISION_SCOPE_CHANGE` with the fields); a different scope needs a new source record. A source of an archived agency is not revised (409).
- Earlier revisions are never changed and stay readable by id; the list shows heads only; `q` with a chain id finds the head.
- A revision never re-points existing references: a record bound to revision 1 keeps pointing at revision 1 (tested, and shown in the UI as "a newer revision exists"). New bindings need the current revision (409 `SOURCE_NOT_CURRENT`).
- The frozen contract ("`.../revisions` creates a successor, using unique revision/version allocation in a parent transaction"; "Immutable endpoints have no generic body PATCH") and the schema (predecessor pointer, group, revision number) were sufficient; no history semantics were invented.

## 4. Source-scope enforcement

One rule set (`apps/api/src/modules/sources/source-scope.ts`) serves every place a write cites a source: Agency and LegalSubject field attributions, Signer identity/delegation sources, the OwnerSubject link source and the five canonical bindings. Source rows are locked (FOR UPDATE for owner-context targets, FOR SHARE otherwise; SourceReference sorts last in the lock order).

| Target | A source applies only when | Refusal |
|---|---|---|
| Agency, Signer (through its agency), Route (through its agency) | it belongs to that agency, or has no agency and names the agency in `scopeBindings.agencyIds` (R5 decision D) | 422 `CROSS_AGENCY_REFERENCE` (another agency's source) / `SOURCE_SCOPE_UNRESOLVED` `NOT_SCOPED_TO_AGENCY` |
| Owner, LegalSubject, OwnerSubject (shared records) | it has no agency and is not restricted to agencies | `SOURCE_SCOPE_UNRESOLVED` `AGENCY_OWNED_SOURCE` / `AGENCY_RESTRICTED_SOURCE` |
| LegalSubject | it names that subject | `NOT_SCOPED_TO_SUBJECT` |
| Route, OwnerSubject | a subject-scoped source names the association's subject | `SCOPED_TO_OTHER_SUBJECT` |
| Owner | it is not subject-scoped | `SUBJECT_SPECIFIC_SOURCE` |
| Owner, OwnerSubject, Route (owner context) | it is not already recorded as another Owner's material (that Owner's canonical source, one of its link sources, or the canonical source of a route through one of its links) | 422 `CROSS_OWNER_REFERENCE` |
| any | it is not case-scoped (no Case exists before the Case phase) | `CASE_SCOPED_SOURCE` |

Nothing broadens applicability because a document looks relevant; the UI pickers use a page-side copy of the same rules and the server checks again.

## 5. Canonical bindings (Agency, Owner, LegalSubject, Signer, Route)

All five use one routine (`canonical-binding.ts`) inside the shared write executor: body `{canonicalCode, sourceId, reason}`, If-Match of the target, Idempotency-Key, target row locked FOR UPDATE, then in order:

1. archived target → 409 `RECORD_STATE_CONFLICT` (archived records are read-only);
2. already bound (any code, source or binding state) → 409 `BINDING_CORRECTION_REQUIRES_RECONCILIATION` — a binding is never replaced by generic CRUD; the reconciliation workflow does not exist and was not invented;
3. the source exists (422 `REFERENCE_NOT_FOUND`) and applies to the target (§4);
4. the source is the current revision of its chain → otherwise 409 `SOURCE_NOT_CURRENT` with the head id;
5. the source role is `CANONICAL_RECORD` → otherwise 422 `SOURCE_ROLE_NOT_VERIFICATION`;
6. the code is unused by another record of the same kind (exact binary comparison; the table's unique key is the backstop) → otherwise 409 `DUPLICATE_CANONICAL_CODE`.

Then `canonicalCode`, `canonicalSourceId` (= the exact SourceReference id) and `bindingState SOURCE_REFERENCED` are written with `rowVersion` +1 and one audit event (`AGENCY_CANONICAL_BOUND`, `OWNER_CANONICAL_BOUND`, `LEGAL_SUBJECT_CANONICAL_BOUND`, `SIGNER_CANONICAL_BOUND`, `ROUTE_CANONICAL_BOUND`) with the reason and `sourceIds`. Nothing else changes: record state, link state, operational state, archive fields and the source itself are untouched (tested per target); DIVERGENT is never set; no mandate, coverage, authority selection or case row appears.

| Target | Scope (§4) | Additional effect |
|---|---|---|
| Agency | agency-scoped | Established (D3): every identity field locks, empty ones included (R5) |
| Owner | shared, not subject-scoped, not another owner's material | None; an Owner has no identity lock. Not ownership |
| LegalSubject | shared, must name the subject | Established: identity fields lock; `identityReviewState` stays UNREVIEWED |
| Signer | the signer's agency | `fullLegalName` locks (409 `ESTABLISHED_IDENTITY_IMMUTABLE`); title and contact stay editable; operational state unchanged. Not signing authority; a User is never a Signer |
| Route | the route's agency, subject and owner context | A bound route is not "unused" (delete refused) |

## 6. Route

- **Create** — explicit `agencyId` + `ownerSubjectId` (+ `platform`, YOUTUBE only, the default): the agency and the association with both parties exist (422 `REFERENCE_NOT_FOUND`), none is archived (409), the association is LINKED (409); one route per (agency, association, platform) → 409 `DUPLICATE_ROUTE` with the existing id (unique key as backstop); nothing is inferred from names, agencies or other owners' routes. Created LINKED, audited (`ROUTE_CREATED`).
- **Identity** — `agencyId`, `ownerSubjectId` and `platform` are not in PatchRoute: a PATCH naming them is 422 and changes nothing; a different path is a different route.
- **PATCH** — `defaultSignerId`, `preferredCoverageId`, `casePrefixHint`, `notes` with If-Match; only changed fields are written; a no-op PATCH writes nothing. `defaultSignerId` must be an existing Signer of the same agency (422 `CROSS_AGENCY_REFERENCE`, composite FK as backstop), not archived and not ENDED (409) — a selection suggestion only.
- **Link state** — LINKED / PAUSED / UNLINKED with a reason; the same state → 409; UNLINKED records `unlinkedAt`, relinking clears it (the audit trail keeps every state); returning to LINKED needs the agency, owner and subject unarchived and the association LINKED, so it never reactivates an archived party; pause and unlink are always possible; nothing cascades.
- **Archive / restore** — an administrative flag orthogonal to the link state (`archivedAt`, `archiveReason`); an archived route is read-only except restore; restore clears the flag, keeps the link state and is refused while the agency, owner or subject is archived. Routes have no DRAFT/ACTIVE record state, so the Directory restore-to-DRAFT rule does not apply.
- **Delete unused** — only a route that is not archived, not canonically bound, not referenced by any FK (cases, authority selections, coverages …) and not named in a JSON snapshot → otherwise 409 `REFERENCED_RECORD_CANNOT_DELETE` with `blockers` (`ARCHIVED`, `CANONICAL_BINDING`, `REFERENCED_BY:<table.column>`, `SNAPSHOT_REFERENCE:<table>`).
- **Lists** — keyset pages, signed cursors bound to operation and filters; `agencyId` filter; `q` = literal accent-insensitive substring of owner display name, subject legal name, agency display name, case prefix hint or canonical code, or an exact route / association id (the routes of one association).
- **Lock order** — Agency → LegalSubject → Owner → OwnerSubject (share) → Route (update) → Signer (share) → SourceReference.

## 7. P3B-dependent Route fields

| Field | Handling | Why |
|---|---|---|
| `preferredCoverageId` | `null` accepted; any non-null value on create or PATCH → **422 `PREFERRED_COVERAGE_UNAVAILABLE`** (`details.field`), checked before any idempotency claim, nothing written. The UI shows "A preferred coverage needs mandate coverage, which is not available yet." and offers no control | MandateCoverage does not exist before P3B; a value could not be validated truthfully and no coverage is fabricated. The wire schema is unchanged |
| `defaultSignerId` | Accepted with the same-agency / not-archived / not-ENDED checks | Signers exist since P2; the field is a suggestion and implies no coverage, eligibility or G7 |
| `casePrefixHint` | Stored as supplied | A hint only; no Case or case number is created or allocated |
| Delete blockers from later phases (cases, authority selections, coverages, snapshots) | Checked generically from the migration's FK and JSON-column inventory | None can exist yet; the check is ready when they do |

## 8. OwnerSubject with an archived party (R5 closeout rule)

If an Owner or LegalSubject is archived: a new OwnerSubject link is refused (409 `RECORD_STATE_CONFLICT`, the archived record named); relinking a PAUSED or UNLINKED association is refused because it would reactivate an archived party; PAUSE and UNLINK stay allowed; the association row is never deleted and the archived party is not modified. Implemented in P2 (`owner-subjects.service.ts`); P3A adds an explicit test for both parties (`directory-http.test.ts`: "R5 closeout rule, archived Owner / LegalSubject …", pause, unlink, relink from PAUSED and from UNLINKED, rows and versions kept).

## 9. Shared mechanics reused (ETag, idempotency, transactions, audit)

- **One executor.** Every P3A write goes through the P2 `WriteExecutor`: contract body parse (422) → `Idempotency-Key` (400) → `If-Match` where the contract declares `x-precondition-target` (428 / 412) → claim → one READ COMMITTED transaction (row locks in the lock order, business rules, change with `rowVersion` +1 exactly once, audit event, idempotency completion) → bounded deadlock retry. Failures release the claim; no failed request is stored as a replay. No second implementation exists.
- **Extension for immutable resources.** `WireEntity.rowVersion` is optional: a reply carries an ETag only when the entity has a row version, so sources (immutable, no precondition target in the contract) are served without an ETag while the reply, replay and audit paths stay shared.
- **Idempotency** — actor + operation + key scope; exact replay returns the stored result (a revision replay returns the same revision, a binding replay the same version and ETag); another payload → 409 `IDEMPOTENCY_CONFLICT`; a live claim → 409 `IDEMPOTENCY_IN_PROGRESS` with `Retry-After: 1`; an abandoned claim (> 60 s) runs once; a refused request keeps the key usable. 7-day horizon and replay re-authentication are the shared P2 behaviour (tested in the P2 suite on the same executor).
- **Audit** — append-only, same writer and key guard (`password|token|secret|csrf|hash|cookie` refused): no password, hash, session token, CSRF token, cookie or secret; source text redacted (§2). A failing audit insert rolls back the source, binding and route writes and their claims (tested).
- **Cursors / pagination / errors** — the P2 HMAC cursors, keyset pages and error envelope, unchanged.

## 10. UI

React pages under the existing authenticated shell (plain CSS, **no new dependency**; the design system established with the frontend-design pass in P2 is reused):

- **Sources** (`/sources`, `/sources/new`, `/sources/:id`, `/sources/:id/revise`): list with search, agency filter (own and shared) and keyset pages; capture form grouped as What it is / Where it is / Scope / Access and content / Provenance as reported / Excerpt and limitations, with the statements "Recording it proves nothing, reviews nothing and fetches nothing", "It is stored as a pointer and never opened", "The app never computes one, and an address is never hashed as content", "Recorded exactly as you report it and never upgraded"; detail with Current revision / Superseded stamps, revision history and "A newer revision exists … Records that cite this revision keep pointing at it"; revise form that keeps agency and scope.
- **Canonical identity source** sections on Agency, Owner, LegalSubject and Signer pages and on the Route page: the neutral meaning, the bound code and source (and whether that source has a newer revision), or "Bind canonical source" — a dialog that offers only current canonical records whose recorded scope includes the record (and says how many were not offered), asks for the code exactly as written in the source and a reason, and handles 409/412/422 in plain language; archived records show the action disabled with the reason. The repeated identity-lock note is now one section-level notice (§17 of the mission).
- **Representation → Routes** (`/representation/routes…`): list (owner · legal subject, agency, platform, link, canonical code), search, agency filter, pages; create from explicit choices (agency, owner, exact linked subject link, YouTube, default signer of that agency only); detail with the path Agency → YouTube → Owner → Legal subject and "An operational path only: it creates no mandate, coverage, authority or signer eligibility"; edit of the supported fields with the path fixed; link-state, archive and restore dialogs with reasons; delete-unused with confirmation (or disabled with the reason); canonical binding; version-conflict notice with "Load latest version". "Mandates" is shown as not available.
- Nowhere is AUTHORIZED, READY, ELIGIBLE, G1 PASS or a verified/approved badge shown (asserted in the web tests; negative control P3A-NC27).
- No source picker exists for field attributions, Signer identity/delegation sources or the OwnerSubject link source; these stay visibly unavailable with their reason (the API accepts and checks them).
- Found in the browser pass and fixed (`85c2839`): with an agency filter active and no match, the lists said "No routes yet." / "No sources recorded yet."; they now say "No routes for this agency." / "No sources belong to this agency or are shared with it." and offer the full list.

## 11. Browser verification (Playwright MCP)

21/21 PASS; details, request bodies and headers in `evidence/p3a-playwright-mcp-verification.txt`; 11 synthetic screenshots in `evidence/screenshots/`. Isolated headless browser (no personal profile, network limited to localhost), `yarn ui:sandbox` on `tb_notice_test`, synthetic data only, cleaned up afterwards (`db:verify test --expect-empty` PASS, ports released, password file deleted).

| # | Check | Result |
|---|---|---|
| 1–5 | Source list, create, detail, revise (revision/history), validation failure | PASS |
| 6–9 | Bind Agency, Owner, LegalSubject, Signer (only applicable current canonical records offered) | PASS |
| 10 | Identity locked after binding (one notice; server 409 on a direct PATCH; Signer name locked) | PASS |
| 11–13 | Route create, list/detail/search, PATCH of an allowed field (only the changed field sent) | PASS |
| 14 | Two tabs: stale ETag → 412, nothing saved, "Load latest version" | PASS |
| 15–16 | Link state (pause, relink), archive/restore | PASS |
| 17–19 | Route binding; bound route delete refused (UI and server 409); unused route deleted (204) | PASS |
| 20 | Keyboard focus in dialogs; 390 px viewport without horizontal overflow | PASS |
| 21 | Sign out → Login | PASS |

## 12. Negative controls

Each control disables one protection, runs every listed responsible suite, requires **each** to fail, restores the file and verifies it byte-identical by SHA-256; baseline runs first proved every suite passes unmutated; `tb_notice_test` was verified empty after every DB control; the contract-level control (NC18) rebuilt `packages/contracts/dist` before the run and after the restore (dist tree hash identical). Afterwards `git status` was empty and `git diff --exit-code` 0. Log: `evidence/p3a-negative-controls.txt` (2026-09-24 06:19Z, head `9481bd0`). In every control only the targeted tests failed.

| # | Protection disabled | Suites (failed / total) |
|---|---|---|
| NC01 | An agency-owned source supports another agency | p3a-http 3/41; source-rules 2/36 |
| NC02 | An agency-less source that does not name the agency supports it | p3a-http 1/41; source-rules 2/36 |
| NC03 | Another owner's recorded material is accepted | p3a-http 1/41 |
| NC04 | A case-scoped source applies | p3a-http 1/41; source-rules 3/36 |
| NC05 | An earlier revision can be revised (head check removed; unique key remains) | p3a-http 1/41 |
| NC06 | A revision may change agency or scope bindings | p3a-http 1/41 |
| NC07 | The source list shows superseded revisions | p3a-http 1/41 |
| NC08 | An omitted provenance is stored as DOCUMENT_REVIEWED (auto-upgrade) | p3a-http 1/41 |
| NC09 | DOCUMENT_REVIEWED accepted without a reviewer | p3a-http 1/41; source-rules 2/36 |
| NC10 | The excerpt text is copied into the audit record | p3a-http 1/41; source-rules 1/36 |
| NC11 | A superseded revision can be bound | p3a-http 1/41 |
| NC12 | A non-CANONICAL_RECORD source can be bound | p3a-http 1/41 |
| NC13 | An existing binding is silently replaced | p3a-http 1/41 |
| NC14 | A bound Agency/LegalSubject is not established (identity lock) | p3a-http 1/41 |
| NC15 | A bound Signer's legal name can be patched | p3a-http 1/41 |
| NC16 | Binding a Signer makes it AVAILABLE (authority inference) | p3a-http 1/41 |
| NC17 | A default signer of another agency is accepted (composite FK remains) | p3a-http 1/41 |
| NC18 | PatchRoute accepts `agencyId` / `ownerSubjectId` (identity immutability, contract) | p3a-http 1/41 |
| NC19 | A route is created on a PAUSED/UNLINKED association | p3a-http 1/41 |
| NC20 | Relinking a route while a party is archived | p3a-http 1/41 |
| NC21 | Duplicate-route check removed (unique key remains) | p3a-http 1/41 |
| NC22 | `preferredCoverageId` accepted before MandateCoverage exists | p3a-http 1/41 |
| NC23 | A canonically bound route can be deleted | p3a-http 1/41 |
| NC24 | If-Match not compared (stale ETags accepted) | p3a-http 2/41 |
| NC25 | Idempotency payload digest not compared | p3a-http 2/41 |
| NC26 | An audit failure is swallowed | p3a-http 3/41 |
| NC27 | UI: a linked route is labelled as authorized | web p3a 1/17 |
| NC28 | UI: binding pickers offer inapplicable sources | web p3a 2/17 |

**Result: 28/28 controls failed their suites as expected; all files restored byte-identically.** The mission's required areas map as: source scope NC01–NC04; history/revision NC05–NC07; provenance NC08–NC09 (and content boundary NC10); binding applicability NC11–NC13; identity lock NC14–NC15; no authority inference NC16, NC27; route same-agency/domain integrity NC17, NC19–NC21; route identity NC18; P3B boundary NC22; delete eligibility NC23; ETag NC24; idempotency NC25; audit rollback NC26; UI applicability NC28. The empty-state fix (§10) has its own test, which fails when the fix is reverted.

## 13. Tests and regression

| Suite | P3A tests | Covers |
|---|---|---|
| `tests/db/p3a-http.test.ts` (tb_notice_test, real AppModule over HTTP) | 41 (new) | Source create/get/list/revise, exact supplied metadata and defaults, no ETag, unknown fields, validation limits, case scope, hash pairing, unattributed review, scope records, audit redaction; revision chains (head only, scope kept, concurrent revisions, archived agency), replay/conflict/in-progress/abandoned claim, audit rollback; current-head list, accent-insensitive `q`, chain/id search, `agencyId` own + shared, signed cursors; bindings of all five targets (exact source, nothing else changes, no authority rows), inapplicable sources per target, current revision + role, no rebinding, code uniqueness, archived targets, 428/412/400/replay/conflict, audit rollback, identity locks; contamination (§14); Route create/refusals/duplicates (also concurrent), identity immutability, PATCH, two-tab 412, link state, archive/restore, delete eligibility, lists/search/cursors, audit rollback; security (no session, CSRF, Origin → no write); a full tour; contract conformance of every collected response |
| `tests/db/directory-http.test.ts` | +2 (69 → 71) | R5 closeout rule for an archived Owner and an archived LegalSubject (§8). Three P2 tests re-scoped: subject attributions now scope-checked, canonical bindings routed (unknown source refused, nothing bound), route inventory 36 → 53 operations |
| `tests/api/source-rules.test.ts` | 36 (new) | The scope matrix (every target × every source shape), tolerant scope reading, request-only capture checks, revision scope comparison, audit record redaction and guard-safe digest keys |
| `tests/web/p3a.test.tsx` (happy-dom) | 18 (new) | Source list/create (exact body, no upgrade)/revise/stale revision; binding pickers per target, owner-material refusal, one lock notice, Signer name lock, 412 in the dialog, newer-revision notice, archived records, keyboard; route create from explicit choices, duplicate, link state/archive/restore with the ETag, delete confirmation and bound-route refusal, edit (changed fields only, fixed path, 412), link page, filtered empty states, mandates shown as unavailable; no authority wording on stamps |

Totals (home PC, 2026-09-24, and CI run 35966162924): `yarn test` **1093** in 28 files (R5 closeout 1039 in 26: +36 source-rules, +18 web p3a); `yarn test:db` **190** in 6 files (R5 closeout 147 in 5: +41 p3a-http, +2 directory-http). No earlier test was removed. Per-file counts from a JSON-reporter run (output outside the repository). All tests use synthetic data; `db:verify test --expect-empty` shows `tb_notice_test` empty afterwards.

**Compiled P3A flow in CI** (`scripts/local/p3a-smoke.ts`, `yarn smoke:p3a`, mission §35): login → Agency + its own canonical-record source → bind the Agency → Owner + LegalSubject → link → subject-scoped source → bind the subject → public source → bind the Owner → Route (Agency + link + YouTube) → route source → bind the Route → revise the route source (the Route keeps pointing at revision 1) → **expected refusal**: another Agency cannot bind the first Agency's source (422 `CROSS_AGENCY_REFERENCE`) → current-revision list → routes of the link → `POST /mandates` not routed (404) → logout. Every response is checked against the contract and for `Cache-Control: no-store`. It refuses to run unless `CI=true`; on the home PC the same flow ran against `yarn ui:sandbox` on `tb_notice_test` through a scratchpad copy (24/24; a mutated copy expecting the wrong refusal code failed as intended; rows deleted afterwards). `smoke:local` now checks the P3A collections (401 without a session, also through the web proxy; 403 without Origin), the served canonical-binding routes (401) and that mandates are not routed (404); `smoke:directory`'s old "binding not routed" check now expects 404 for the deleted agency.

**Regression sweep** (2026-09-24T06:46:48Z–06:49:42Z, tree `85c2839` plus this uncommitted folder; `evidence/p3a-first-pc-sweep.txt`) — all exit 0:

| Command | Result |
|---|---|
| `yarn reference:check` | frozen references intact (also after the sweep) |
| `yarn reference:helper-tests` | 27 pass, 0 fail |
| `yarn contracts:check` | 3 generated outputs match the active source |
| `yarn install --immutable` | lockfile unchanged |
| `yarn typecheck` · `yarn lint` · `yarn format:check` | exit 0 |
| `yarn test` | 1093 / 1093 in 28 files |
| `yarn test:db` | 190 / 190 in 6 files (`tb_notice_test`) |
| `yarn db:verify test --expect-empty` | PASS, domain rows 0 |
| `yarn db:verify dev` | PASS (metadata and a row count only: 5, as at R5; no row content read) |
| `yarn db:status test` / `dev` | up to date (1 migration) |
| `yarn db:drift:diff-migrations` / `db:drift:diff-datasource dev` | empty migration (no drift) |
| `yarn build` | exit 0 |
| `yarn smoke:local` | 28 checks, including 14 business-boundary checks |
| `yarn dev:verify-shutdown` | 4 / 4 scenarios |

`git diff 31db581..HEAD` shows no change under `apps/api/prisma`, `packages/**`, `docs/reference/**` or `yarn.lock`; `package.json` adds only the script `smoke:p3a`. Nothing was written to `tb_notice_dev`.

## 14. Contamination and scope tests

| Mission requirement (§31) | Test (`tests/db/p3a-http.test.ts` unless noted) |
|---|---|
| A source of Agency A cannot silently support Agency B | "an agency source never silently supports another agency: attributions, signer sources and bindings"; the CI flow's expected refusal (`smoke:p3a`, 422 `CROSS_AGENCY_REFERENCE`) |
| Signer source scope matches the Signer's agency | same test (identity/delegation sources and the Signer binding); `source-rules.test.ts` matrix |
| A route cannot combine Agency A with context requiring Agency B | "create refuses missing, archived, paused, cross-agency and future-phase references" (default signer of another agency → 422 `CROSS_AGENCY_REFERENCE`); route binding with another agency's source → 422 |
| Owner-specific material does not transfer to another Owner | "owner material does not transfer to another owner: binding, association source and route binding" |
| No case data or inference | "case scope does not exist in P3A: a case-scoped fixture applies to no record"; `caseIds` refused on create; authority/case tables stay empty after every binding and route (`expectNoAuthority`) |

## 15. Database changes

**None.** No migration was created or applied; `20260923103912_initial_schema` (sha256 `b54c36fd…6515`) remains the only migration; `db:verify` passes on test (empty) and dev, and both Prisma drift diffs are empty. The existing schema was sufficient for every P3A rule; no part of the source-history, binding or route semantics was ambiguous enough to stop.

## 16. Interpretations for R6 review

| Topic | Decision taken | Why |
|---|---|---|
| Owner source scope | No owner field exists on SourceReference; an Owner/OwnerSubject/Route accepts only unrestricted agency-less sources (or the route agency's own) and refuses material already recorded for another Owner | "owner-specific source context cannot silently transfer to another owner" without inventing an owner scope column |
| Binding role | Only `CANONICAL_RECORD` sources can be bound (422 `SOURCE_ROLE_NOT_VERIFICATION`) | A canonical binding designates the canonical identity record; the frozen stable code names this refusal |
| No rebinding, no DIVERGENT | An existing binding is never replaced (409 `BINDING_CORRECTION_REQUIRES_RECONCILIATION`); DIVERGENT is never set | Correction needs reconciliation; that workflow is not invented |
| Binding of a later revision | Bindings need the current revision; a revision does not move existing bindings | History is preserved; the record keeps citing what it was bound to |
| Source list | Current heads only; `q` also matches an exact source or chain id | Superseded revisions stay reachable by id and through the chain |
| `agencyId` source filter | The agency's own sources plus agency-less sources shared with it | The contract names one agency filter; shared sources are the ones that apply to that agency |
| DOCUMENT_REVIEWED | Accepted only with `reviewedByLabel` | The app cannot review; the value must be an attributable report |
| Hash pairing | `contentSha256` and `hashTarget` together or neither | A hash without its target does not say which bytes it covers |
| Revision scope | A revision keeps `agencyId` and `scopeBindings` | Changing applicability through a revision would silently move history; a new scope needs a new source |
| Default signer | Must be of the same agency, not archived and not ENDED | An ENDED signer cannot be a future selection suggestion |
| Route restore / relink | Refused while the agency, owner or subject is archived | Never reactivates an archived party (R5 rule applied to routes) |
| Bound Signer | `fullLegalName` locks | The binding records the source of the person's identity |
| Tightened P2 rules | LegalSubject attributions and the OwnerSubject link source now use the P3A applicability rules (P2 checked only existence) | One rule set for every cited source |
| Agency established by its own sources | Recording an agency-owned SourceReference makes the Agency "referenced" (FK `source_references.agency_id`), so its identity fields lock (observed in the browser pass) | Follows D3/R5 as written; the operator may want to confirm this consequence |
| Additional error codes | `CASE_SCOPE_UNAVAILABLE`, `CONTENT_HASH_INCOMPLETE`, `REVIEW_UNATTRIBUTED`, `REVISION_NOT_HEAD`, `REVISION_SCOPE_CHANGE`, `SOURCE_NOT_CURRENT`, `SOURCE_SCOPE_UNRESOLVED`, `CROSS_OWNER_REFERENCE`, `DUPLICATE_CANONICAL_CODE`, `PREFERRED_COVERAGE_UNAVAILABLE` are implementation codes in the contract's free-string `code` field; the frozen stable codes are used where they fit (`CROSS_AGENCY_REFERENCE`, `BINDING_CORRECTION_REQUIRES_RECONCILIATION`, `DUPLICATE_ROUTE`, `SOURCE_ROLE_NOT_VERIFICATION`, `REFERENCED_RECORD_CANNOT_DELETE`, `IDEMPOTENCY_*`) | No wire change; statuses follow API_CONTRACT §5 |
| Excerpt size | `excerpt`, `scopeText` and `limitations` are stored exactly as supplied up to the contract limits; the UI asks for only the passage needed; audit keeps lengths | The wire schema defines the limits; the app never copies source content itself |
| UI source pickers | None for attributions, Signer sources or link sources | Kept to the mission's UI scope; the API supports and checks them |

## 17. Limitations

- No reconciliation workflow exists for correcting a canonical binding or an established identity; both are refused rather than invented.
- The UI offers source pickers only for canonical bindings (see §16).
- `smoke:p3a` writes records and runs only in CI (`CI=true`); on the home PC the same flow was exercised against `yarn ui:sandbox` on `tb_notice_test` (24 checks) and through the browser pass.
- Session-row and idempotency-record retention cleanup remain DEFERRED (unchanged, non-blocking since R4/R5); expired records are replaced on reuse.
- Context7 was not used in P3A (no version-specific library question arose); the frontend-design skill was not re-run — the P3A pages reuse the P2 design system.
- The headless browser used Linux fallback fonts; the Windows faces were not rendered.

## 18. Proposed P3B scope (for R7; not started)

Representation authority only, each needing its own approved mission: **Mandate**, **MandateVersion** (with its revision/predecessor model and document capture through SourceReference), **MandateCoverage** (scope of a version over routes/agency/owner context; afterwards `Route.preferredCoverageId` can be validated), **CoverageSigner** (signers under a coverage), **AuthorityEvent** (auditable authority history), the contracted operations for these five entities, the UI they need, and the P3A binding/applicability rules extended to their sources. Excluded from P3B: Cases and everything case-specific, correspondence, prompts, NoticeCandidate, ValidationRun, assessments, readiness, G1–G7, signing, sending and any external action.
