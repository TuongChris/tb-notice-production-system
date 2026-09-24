# P3B — Representation authority (home PC)

Mission TB_P3B_REPRESENTATION_AUTHORITY_TO_R7 on `feature/p3b-representation-authority`, branched from `main` `adea2bc` (post-P3A merge) and started at the R6 closeout head `c8da59f`. Recorded 2026-09-24 (UTC) on the home PC, the primary development workstation (ADR-0003). The mission stops at review gate **R7** and is submitted as **PENDING**. Cases and every later phase were **not started**. No case, CaseAuthoritySelection, reported item, case work, use mapping, case fact, correspondence, prompt, NoticeCandidate, ValidationRun workflow, CandidateAssessment, G1–G7 readiness, READY_FOR_SIGNER, signing, adoption, sending, retraction, counter-notification, uploader contact, Drive write, mailbox or other external action exists.

## Status by scope (not collapsed)

| Scope | Status | Basis |
|---|---|---|
| **P3B_FIRST_PC** | **PASS** | All automated checks in §14 executed on the home PC and passed |
| **P3B_CI** | **PASS** for the code head `04b8528` (push run 35990960584, both jobs success, `smoke:p3b` 36 checks) and for `f79aa0a` (run 35980464772) | CI runs `yarn test`, `yarn test:db`, `smoke:local`, `smoke:auth`, `smoke:directory`, `smoke:p3a` and the new compiled `smoke:p3b` flow (§14). A commit cannot record its own run; the final run of the submitted documentation head is reported with R7 |
| **P3B_BROWSER (Playwright MCP)** | **PASS** 20/20 (supplemental); three UI findings found and fixed (`04b8528`) | Isolated test browser against the compiled API on the disposable `tb_notice_test` (`evidence/p3b-playwright-mcp-verification.txt`, §12) |
| **P3B_NEGATIVE_CONTROLS** | **PASS** 51/51 | Every disabled protection made its responsible suites fail; files restored byte-identically (§13, `evidence/p3b-negative-controls.txt`) |
| **R7 review** | **PENDING** | — |
| **P1_WINDOWS_BROWSER** | **NOT_RUN** (not reported) | Unchanged |
| **P0_SECOND_PC** / **P0_TWO_PC_ACCEPTANCE** / **P0_SINGLE_PC_BASELINE** / **P0_OVERALL** | **DEFERRED_BY_OPERATOR** / **NOT_COMPLETED** / **VERIFIED** / **NOT_COMPLETE** against the original two-PC contract | ADR-0003; unchanged by P3B |

`EXTERNAL_LEGAL_ACTIONS=0` · `REAL_CASE_MUTATIONS=0` · `G1_DECISIONS=0` · `G7_CREATED=0` · `DRIVE_WRITES=0` · `DEPLOYMENTS=0` · `REAL_TB_DATA_IN_GIT=0` · `REAL_ACCOUNTS_CREATED_BY_ENGINEER=0` · `RECORDS_WRITTEN_TO_OPERATOR_DB=0` · `SCHEMA_CHANGES=0` · `WIRE_CONTRACT_CHANGES=0` · `NEW_DEPENDENCIES=0`.

Persistent rules established by P3B (recorded in `CLAUDE.md`):

- **Authority records are not self-proving.** A Mandate, MandateVersion, MandateCoverage, CoverageSigner or AuthorityEvent is a structured record of what cited sources are reported to support. Existing, being complete, being frozen or being the latest proves nothing.
- **A frozen version is not approval.** FROZEN means only that the system record is immutable. It is not a signature, legal approval, owner confirmation, G1 decision, notice adoption or current authority; there is no unfreeze.
- **Coverage ≠ G1.** A MandateCoverage is the documented scope of one version over one exact Route; it adjudicates nothing. Case authority is determined later.
- **CoverageSigner ≠ G7.** A coverage signer is a Signer recorded under one coverage — not signature authority, G7 clearance or eligibility for any notice; it never transfers to another coverage, route or case. An application User is never a Signer.
- **An AuthorityEvent is not proof by existence.** It records what an operator reports a cited source supports, with an explicit provenance, append-only; nothing creates one automatically.
- **Source revision pinning.** Versions, coverages, coverage signers and events cite exact SourceReference revisions and never follow a newer revision.
- **No currentness from dates or silence.** Nothing computes "currently authorized" — not from dates, a frozen state, the highest version number, a missing end date, the absence of an event or the latest source.

> §1 was written from the contract before any P3B code; §2–§20 record the implementation and its verification.

## 1. Operation matrix (contract-first, produced before coding)

Source: the active `@tb/contracts` operation metadata (`packages/contracts/src/api/operations.ts`, wire baseline `TB-SCHEMA-API-v1.0.0`, `contracts:check` OK at the start) cross-checked against the frozen `endpoint-catalog.json`: **23** operations carry the `Mandate` tag, identical in both (method, path, request, response, precondition target, idempotency). The frozen catalog's only other authority operations, `selectCaseAuthority` and `listCaseAuthoritySelections` (`/cases/{caseId}/authority-selections`), belong to the Case phase and are **not** part of P3B.

| # | operationId | Method and path | Request | Success | If-Match target (428 / 412) | Idempotency-Key |
|---|---|---|---|---|---|---|
| 1 | `listMandates` | `GET /mandates` | — (query `limit`, `cursor`, `q`, `agencyId`) | 200 ListMandatesResponse | — | — |
| 2 | `createMandate` | `POST /mandates` | CreateMandate | 201 CreateMandateResponse | — | required |
| 3 | `getMandate` | `GET /mandates/{id}` | — | 200 GetMandateResponse (+ ETag) | — | — |
| 4 | `patchMandate` | `PATCH /mandates/{id}` | PatchMandate | 200 PatchMandateResponse | Mandate | required |
| 5 | `deleteUnusedMandate` | `DELETE /mandates/{id}` | — | 204 | Mandate | required |
| 6 | `archiveMandate` | `POST /mandates/{id}/archive` | ArchiveRequest | 200 ArchiveMandateResponse | Mandate | required |
| 7 | `restoreMandate` | `POST /mandates/{id}/restore` | ArchiveRequest | 200 RestoreMandateResponse | Mandate | required |
| 8 | `bindCanonicalMandate` | `POST /mandates/{id}/canonical-bindings` | CanonicalBindingRequest | 200 BindCanonicalMandateResponse | Mandate | required |
| 9 | `listMandateVersions` | `GET /mandates/{mandateId}/versions` | — (query `limit`, `cursor`, `q`) | 200 ListMandateVersionsResponse | — | — |
| 10 | `createMandateVersion` | `POST /mandates/{mandateId}/versions` | CreateMandateVersion | 201 CreateMandateVersionResponse | Mandate | required |
| 11 | `getMandateVersion` | `GET /mandate-versions/{id}` | — | 200 GetMandateVersionResponse (+ ETag) | — | — |
| 12 | `patchDraftMandateVersion` | `PATCH /mandate-versions/{id}` | PatchMandateVersion | 200 PatchDraftMandateVersionResponse | MandateVersion | required |
| 13 | `freezeMandateVersion` | `POST /mandate-versions/{id}/freeze` | ArchiveRequest | 200 FreezeMandateVersionResponse | MandateVersion | required |
| 14 | `listVersionCoverages` | `GET /mandate-versions/{versionId}/coverages` | — (query `limit`, `cursor`, `q`) | 200 ListVersionCoveragesResponse | — | — |
| 15 | `createCoverage` | `POST /mandate-versions/{versionId}/coverages` | CreateCoverage | 201 CreateCoverageResponse | MandateVersion | required |
| 16 | `getCoverage` | `GET /coverages/{id}` | — | 200 GetCoverageResponse (+ ETag) | — | — |
| 17 | `patchDraftCoverage` | `PATCH /coverages/{id}` | PatchCoverage | 200 PatchDraftCoverageResponse | MandateCoverage | required |
| 18 | `listCoverageSigners` | `GET /coverages/{coverageId}/signers` | — (query `limit`, `cursor`, `q`) | 200 ListCoverageSignersResponse | — | — |
| 19 | `createCoverageSigner` | `POST /coverages/{coverageId}/signers` | CreateCoverageSigner | 201 CreateCoverageSignerResponse | MandateCoverage | required |
| 20 | `getCoverageSigner` | `GET /coverage-signers/{id}` | — | 200 GetCoverageSignerResponse (+ ETag) | — | — |
| 21 | `deleteDraftCoverageSigner` | `DELETE /coverage-signers/{id}` | — | 204 | CoverageSigner | required |
| 22 | `recordAuthorityEvent` | `POST /mandates/{mandateId}/events` | CreateAuthorityEvent | 201 RecordAuthorityEventResponse (immutable: no ETag) | Mandate | required |
| 23 | `listAuthorityEvents` | `GET /mandates/{mandateId}/events` | — (query `limit`, `cursor`, `q`) | 200 ListAuthorityEventsResponse | — | — |

Entity/state effect, reference and source dependencies, and disposition (all 23: **IMPLEMENT**; no operation is deferred):

| # | Entity / state effect | Reference and source dependencies |
|---|---|---|
| 1 | read (keyset list) | — |
| 2 | new Mandate of one Agency (administrative container; archive flag clear) | existing, unarchived Agency |
| 3 | read | — |
| 4 | label, externalReference, description, notes; `rowVersion` +1 | Mandate not archived |
| 5 | hard delete of an unused Mandate only | not archived, not canonically bound, no version, no authority event, no snapshot reference |
| 6 | archive flag set; versions, coverages, signers and events untouched; no event created | — |
| 7 | archive flag cleared; nothing revived | Agency not archived |
| 8 | canonical code + exact source; `bindingState` SOURCE_REFERENCED | current CANONICAL_RECORD source applicable to the Mandate's Agency; never replaces a binding |
| 9 | read | Mandate exists (404) |
| 10 | new DRAFT version, number = highest + 1; Mandate `rowVersion` +1 (its version set changed) | Mandate and Agency unarchived; predecessor (optional) of the same Mandate, FROZEN, without an existing successor; cited sources exist and apply to the Agency |
| 11 | read | — |
| 12 | DRAFT terms and source citations; `rowVersion` +1 | DRAFT only (409 FROZEN_VERSION); Mandate unarchived; cited sources exist and apply |
| 13 | DRAFT → FROZEN, `frozenAt`; the version and every coverage / coverage-signer child become immutable; `rowVersion` +1 once | Mandate and Agency unarchived; structural re-validation of the version and all children; no event created |
| 14 | read | version exists (404) |
| 15 | new coverage (one exact Route); parent version `rowVersion` +1 | version DRAFT; Mandate / Agency unarchived; Route of the same Agency, route and its parties unarchived; basis source applies to the Route context; predecessor coverage (optional) of the same Route and Mandate in a FROZEN version |
| 16 | read | — |
| 17 | scope fields; coverage and parent version `rowVersion` +1 | parent version DRAFT; Mandate unarchived; basis source applies |
| 18 | read | coverage exists (404) |
| 19 | new Signer association under one coverage; coverage and version `rowVersion` +1 | parent version DRAFT; Mandate / Agency unarchived; Signer of the same Agency, not archived, not ENDED; source applies to the Route context |
| 20 | read | — |
| 21 | association removed while the version is DRAFT; coverage and version `rowVersion` +1 | parent version DRAFT; Mandate unarchived |
| 22 | new append-only AuthorityEvent; Mandate `rowVersion` +1 (its event history changed); nothing else changes state | Mandate and Agency unarchived; source exists and applies (the coverage's Route context, or the Agency for a whole-mandate event); coverage (optional) of this Mandate in a FROZEN version; superseded event (optional) of this Mandate with the same scope and no successor |
| 23 | read | Mandate exists (404) |

Related contracted field enabled in P3B (no new operation): `Route.preferredCoverageId` on `createRoute` / `patchRoute` — P3A refused every non-null value (422 `PREFERRED_COVERAGE_UNAVAILABLE`); P3B validates it against MandateCoverage (§9).

## 2. Implementation (commits)

| Commit | Content |
|---|---|
| `9e7e6f6` | API: the 23 operations (`apps/api/src/modules/representation/{mandates,mandate-versions,coverages,coverage-signers,authority-events}.service.ts`, controllers, `authority-rules.ts`, `authority-chain.ts`, `authority-views.ts`), `Route.preferredCoverageId` validation, the P3B owner-material extension of `source-scope.ts`, the new error codes; tests `tests/db/p3b-http.test.ts` (61) and `tests/api/authority-rules.test.ts` (38); P2/P3A tests adjusted to the routed inventory |
| `f79aa0a` | CI: compiled `yarn smoke:p3b` flow and its workflow step |
| `be5cb4c` | UI: mandates, versions, freeze dialog, coverage, coverage signers, authority events, the route's preferred-coverage picker; `tests/web/p3b.test.tsx` |
| `e23da02` | `yarn ui:sandbox` guards and cleans the P3B tables |
| `04b8528` | UI fixes from the browser pass (§12): frozen guards on direct creation URLs, zoned effective times, accurate picker copy |

Lock order used by every P3B write (extends P2/P3A): directory identities in alphabetical order (Agency, LegalSubject, Owner, OwnerSubject, Route, Signer) → Mandate → MandateVersion → MandateCoverage → CoverageSigner → SourceReference.

## 3. Mandate semantics

- A Mandate is the container of one Agency's representation record: `agencyId` (explicit, existing, unarchived; never changes) and an administrative `label`, plus `externalReference`, `description` and `notes` exactly as supplied. Nothing is inferred from the label (a "FINAL" or "signed" label proves nothing) and nothing is created alongside it — no version, date, scope, platform, signer or status.
- It has no state beyond the administrative archive flag. **Archive** is a flag only: versions, coverage, coverage signers and events stay unchanged, nothing is revoked, terminated or recorded as an event, and an archived mandate and everything under it are read-only except **restore**. Restore revives nothing and is refused while the agency is archived.
- **Delete** only an unused mandate (not archived, not bound, no version, no event, no snapshot reference) → otherwise 409 `REFERENCED_RECORD_CANNOT_DELETE` with blockers; historic records are never hard-deleted.
- **Canonical binding** (P3A mechanism): identity/reference only, a current CANONICAL_RECORD source applicable to the mandate's agency; never replaced.
- Lists: keyset `(createdAt DESC, id DESC)`, `agencyId` filter, accent-insensitive `q` over label, external reference and canonical code, exact id.

## 4. MandateVersion and the version chain

- A version is a documentary snapshot of one Mandate: `changeKind`, `predecessorId`, `primarySourceId`, `additionalSourceRefs`, `signedDatesRaw` (who signed, the date exactly as written, the source showing it — never converted to a date), `documentState`, `sourceReviewState`, `validityModel`, `effectiveOn`, `expiresOn`, `validityNotes`, `changeReason` — stored exactly as supplied; defaults are UNKNOWN / UNREVIEWED / no dates.
- **Create** needs the Mandate's `If-Match` (the version set changes: Mandate `rowVersion` +1); number = highest + 1 under the Mandate lock (unique key as backstop); new versions are DRAFT. Nothing is copied from an earlier version.
- **Chain**: `predecessorId` is optional; when given it is a FROZEN version of the same Mandate without a successor. A draft is edited, not succeeded (409 `VERSION_NOT_FROZEN`); a chain does not fork (409 `VERSION_SUCCESSOR_EXISTS`); another mandate's version is 422 `AUTHORITY_SCOPE_UNRESOLVED` (OTHER_MANDATE). No cycle can form (a new version only points to an older one and the pointer never changes). Concurrent creates on one Mandate ETag produce exactly one version; concurrent successors of one predecessor produce exactly one.
- **Patch**: DRAFT only (409 `FROZEN_VERSION`); `changeKind` and `predecessorId` are fixed; only changed fields are written; a no-op writes nothing.
- **Claims are checked, never upgraded**: `DRAFT`/`SIGNED_APPEARING` document states need the primary source (422 `DOCUMENT_STATE_UNSUPPORTED`); `REVIEWED_WITH_LIMITS` needs a cited primary or additional source whose provenance is DOCUMENT_REVIEWED (422 `REVIEW_UNSUPPORTED`); citing a reviewed source never marks a version reviewed by itself; CONFLICT and MISSING are kept as stated.
- **Dates** are never inferred (a signature date is not a start date; an empty end date does not mean "no end"); start after end is 422 `DATE_RANGE_INVALID`; values the database cannot store exactly (years outside 1000–9999, more than millisecond precision, leap seconds) are 422 `VALIDATION_FAILED` rather than altered.
- **Pinning**: every citation names an exact source revision; revising a source repoints nothing and records nothing (the UI says "This record cites revision N; the source now has revision M. The citation does not move to it.").

## 5. Freeze and concurrency

- `POST /mandate-versions/{id}/freeze` with the version's `If-Match`, a reason and an Idempotency-Key: DRAFT → FROZEN once, `frozenAt`, `rowVersion` +1 exactly once, one `MANDATE_VERSION_FROZEN` audit event in the same transaction. The children (coverage, coverage signers) have no state column and are frozen through the version; every later change of the version or a child is 409 `FROZEN_VERSION`. There is no unfreeze.
- Under its locks the freeze re-validates the structure: Mandate and Agency unarchived, the chain, dates, document/review claims, every cited source's existence and applicability, each coverage's dates, basis source and predecessor, each coverage signer's dates and source. The administrative state of routes and signers was checked when each association was recorded and is not re-evaluated as a legal status. A truthful incomplete draft (no coverage, no source) can be frozen: freezing asserts nothing.
- Freezing is not a signature, legal approval, owner confirmation, G1 decision, notice adoption or current authority; it creates no event, selects nothing for a case and changes no signer, source or route.
- **Concurrency**: the version row is locked FOR UPDATE and the `If-Match` is checked under the lock. Three concurrent freezes with one ETag → exactly one 200 and two 412 `RECORD_VERSION_CONFLICT`, one audit event, `rowVersion` +1 once (DB test; also observed in the browser with two requests and an idempotent replay of the winner). A child edit racing a freeze serializes on the version (AC-017): one wins, the other is refused; a frozen version never gains or changes a child. A stale freeze from another tab is 412.

## 6. MandateCoverage

- One coverage connects one version to **one exact Route** chosen explicitly: `coverageLabel`, `coveredWorksScope`, `territorialScope`, `actionScope`, `exclusions`, `conditions`, `exclusivity`, `effectiveOn`, `expiresOn`, `basisSourceId`, `predecessorCoverageId` — exactly as supplied; nothing is derived from the Agency, Owner, OwnerSubject, platform, names, a similar route or an earlier coverage. A coverage is not a G1 decision.
- Create needs the version's `If-Match`, a DRAFT version, an unarchived Mandate and Agency, a Route of the version's agency (422 `CROSS_AGENCY_REFERENCE`, composite FK as backstop) whose route, owner and legal subject are unarchived (409 `RECORD_STATE_CONFLICT`); the link state is not a condition (a paused route can still be covered — the record states what a document covers). One coverage per (route, version, label) → 409 `DUPLICATE_COVERAGE`. The basis source must apply to the route (agency, subject and owner material). Every coverage mutation increments the parent version's `rowVersion` so the version ETag covers its children.
- `predecessorCoverageId` is lineage only: a coverage of the same Route and Mandate in a FROZEN version (422 `AUTHORITY_SCOPE_UNRESOLVED` OTHER_MANDATE / OTHER_ROUTE, 409 `VERSION_NOT_FROZEN`); nothing is inherited from it.
- Patch: DRAFT parent only; `routeId` and `predecessorCoverageId` are not patchable (a coverage never moves to another route or lineage).

## 7. CoverageSigner

- A Signer recorded under one coverage with its recorded limits (`capacity`, `actionScope`, `sourceId`, `effectiveOn`, `endsOn`, `limitations`). It refers only to a Signer record: the acting application User is never a Signer (a User id as `signerId` is 422 `REFERENCE_NOT_FOUND`) and the actor is only the recorder.
- Create needs the coverage's `If-Match`, a DRAFT parent version, an unarchived Mandate and Agency, a Signer of the coverage's agency (422 `CROSS_AGENCY_REFERENCE`) that is neither archived nor ENDED (409 `RECORD_STATE_CONFLICT`; a PAUSED signer is accepted, as for a route's default signer); one row per (coverage, signer, capacity) → 409 `DUPLICATE_COVERAGE_SIGNER`; the source must apply to the coverage's route. Delete only while the parent is DRAFT, with `If-Match`; the audit keeps what was removed. Both increment the coverage and the version.
- Neutral wording everywhere: "Associated signer", "Coverage signer", "Recorded under this coverage". Never AUTHORIZED SIGNER, APPROVED SIGNER, READY TO SIGN or ELIGIBLE FOR NOTICE. Recording a signer changes nothing on the Signer (state, row version) and carries over to no other coverage.

## 8. AuthorityEvent

- Append-only history of one Mandate: `eventType` (CURRENTNESS_RECORDED, REVOCATION, TERMINATION, SUPERSESSION, RESIGNATION, CORRECTION), `coverageId` (null = whole mandate, only when the source supports that scope), `sourceId` (required), `provenance` (stored exactly as given), `effectiveOn` / `effectiveAt` / `rawEffectiveText` (only as supplied), `scopeText`, `interpretation`, `supersedesEventId`. No ETag, no update, no delete.
- Record needs the Mandate's `If-Match` (its history changes: Mandate `rowVersion` +1), an unarchived Mandate and Agency, a source that applies (the coverage's route, or the mandate's agency), a coverage of this mandate in a FROZEN version (422 OTHER_MANDATE, 409 `VERSION_NOT_FROZEN`). A superseding event has the same mandate and scope (422 SCOPE_CHANGE) and supersedes an event without a successor (409 `EVENT_ALREADY_SUPERSEDED`, unique key as backstop); the earlier event never changes.
- DOCUMENT_REVIEWED needs a source whose provenance is DOCUMENT_REVIEWED (422 `REVIEW_UNSUPPORTED`); a reviewed source never upgrades an event reported otherwise.
- Nothing else creates an event: not a source, a revision, a version, a freeze, a coverage, a signer, a preference, a binding, an archive or a restore. The recording time (`createdAt`) is never an effective date, and a missing event means nothing was recorded — not that authority continues or ended.

## 9. Route preferredCoverage

- `Route.preferredCoverageId` (contracted in P3A, refused there with `PREFERRED_COVERAGE_UNAVAILABLE`) is now validated on `createRoute` / `patchRoute`: a coverage of **this exact route** (same agency) in a **FROZEN** version of an **unarchived** Mandate. Refusals: another agency's coverage 422 `CROSS_AGENCY_REFERENCE`; another route's coverage 422 `AUTHORITY_SCOPE_UNRESOLVED` OTHER_ROUTE; a draft version's coverage 409 `VERSION_NOT_FROZEN`; an archived mandate's coverage 409 `RECORD_STATE_CONFLICT`; an unknown id 422 `REFERENCE_NOT_FOUND`. It can be removed with `If-Match`; a stale ETag is 412. A new route has no coverage yet, so a non-null value on create is refused.
- It is an operational default only ("Preferred coverage is an operational default. Case authority is determined later."): setting it changes no coverage, version, mandate, signer or case, and a later archive of the mandate does not cascade to the route.

## 10. Sources, provenance and DOCUMENT_REVIEWED

- One applicability rule set (`modules/sources/source-scope.ts`) extended to P3B citations: **mandate context** (target Agency = the mandate's agency) for a version's primary, additional and signed-date sources and a whole-mandate event's source — agency material, not owner-checked; **route context** (target Route = agency + owner + legal subject) for a coverage basis, a coverage signer's source and a coverage-scoped event's source.
- The owner dimension now also counts route-level authority citations as that Owner's material: a coverage basis, a coverage signer's source or a coverage-scoped event's source recorded for one Owner's route is refused for another Owner (422 `CROSS_OWNER_REFERENCE`), extending R6 interpretation 7 conservatively.
- Provenance is stored exactly as given and never upgraded — not by a reviewer name, a hash or hash target, a canonical binding, a source revision or any P3B record. Only the canonical provenance vocabulary is used; P3B adds no value.
- Explicit DOCUMENT_REVIEWED regression tests (`tests/db/p3b-http.test.ts`, "DOCUMENT_REVIEWED — never upgraded …"): **1** a reviewer name without an explicit DOCUMENT_REVIEWED does not upgrade (and supports neither REVIEWED_WITH_LIMITS nor a DOCUMENT_REVIEWED event); **2** a hash or hash target alone is refused as incomplete, and a complete hash still does not upgrade; **3** a canonical binding does not upgrade; **4** a source revision does not upgrade, in either direction of the chain; **5** P3B records (freeze, coverage basis, signer source, events) leave provenance as captured. Negative controls NC32–NC36 inject each upgrade and the tests fail.

## 11. Shared write layer

- Every contracted write goes through `WriteExecutor`: contract parse (422) → Idempotency-Key (400) → `If-Match` for the 13 conditional operations (428 missing, 412 stale or another record's ETag) → claim → one READ COMMITTED transaction with row locks in the lock order, business rules, the change with `rowVersion` +1, the audit event and the idempotency completion → bounded deadlock retry. Failures release the claim.
- Tests: the 13 conditional operations (428/412, nothing written); Idempotency-Key per write family (required; an exact replay returns the stored result once; another payload is 409; in-progress 409 with Retry-After; refused requests are never stored; keys scoped to their actor); two tabs (412 for mandate, draft version, freeze, coverage and coverage signer); a failing audit insert rolls back every P3B write (no row, no version change, no idempotency record).
- Error codes: frozen stable codes where they fit (`FROZEN_VERSION`, `AUTHORITY_SCOPE_UNRESOLVED`, `CROSS_AGENCY_REFERENCE`, `REFERENCED_RECORD_CANNOT_DELETE`, `RECORD_STATE_CONFLICT`, `RECORD_VERSION_CONFLICT`, `IDEMPOTENCY_*`); P3B implementation codes inside the free-string `code` field with the contracted statuses (R6 decision 10): `VERSION_NOT_FROZEN`, `VERSION_SUCCESSOR_EXISTS`, `DATE_RANGE_INVALID`, `DOCUMENT_STATE_UNSUPPORTED`, `REVIEW_UNSUPPORTED`, `DUPLICATE_COVERAGE`, `DUPLICATE_COVERAGE_SIGNER`, `EVENT_ALREADY_SUPERSEDED`. `PREFERRED_COVERAGE_UNAVAILABLE` is retired.

## 12. UI and browser verification

Pages (React, no new dependency; the P2/P3A design system): Representation → Mandates (list with agency filter and search), mandate detail with the hierarchy **Agency → Mandate → Version → Coverage → Coverage signer** and the authority-event timeline, mandate create/edit (also from the agency page's "Mandates of this agency"), version create (predecessor picker: frozen versions without a successor) / detail / edit draft, the freeze dialog, coverage create/detail/edit, coverage-signer add/remove, authority-event record, and the route's preferred-coverage picker.

- The freeze dialog states: "Freezing makes this system record immutable. … Freezing is **not** a signature, legal approval, owner confirmation, G1 decision or notice adoption, and it does not make any authority current."
- The timeline separates "Recorded" (when the application recorded the event) from "Effective (as recorded)" (only what the source states: a calendar date, an instant with its time-zone name, or the source's wording), or "No effective date recorded".
- Pickers offer only applicable records: routes and signers of the mandate's agency (unarchived; signers not ENDED), sources whose recorded scope includes the record (the server additionally checks owner material), event scopes of frozen versions, supersedable events of the same scope, and for a route only frozen coverage of that route in an unarchived mandate ("Preferred coverage is an operational default. Case authority is determined later.").
- Stamps are neutral: Draft, Frozen (a neutral tone, not the green of an active record), Archived. No AUTHORIZED / APPROVED / VALID / CURRENT AUTHORITY / READY / ELIGIBLE / G1 PASS wording; every page states what the record is not.
- Unavailable actions stay visible but inert with a reason (e.g. a frozen version's successor action when a successor exists); every refusal is explained and focus moves to it.

**Playwright MCP (mission §35)**: 20/20 PASS on `yarn ui:sandbox` (compiled API on the disposable `tb_notice_test`, isolated headless browser, synthetic data only; rows deleted and `db:verify test --expect-empty` PASS afterwards). Details, forced-request refusals, console summary and 14 screenshots: `evidence/p3b-playwright-mcp-verification.txt`. Three findings were fixed in `04b8528` with UI tests and re-verified in the browser: **F1** the add-coverage and add-signer pages of a frozen version, opened by URL, still rendered their forms (the API refused with 409); **F2** the locked preferred-coverage picker said no frozen coverage existed when its mandate was archived; **F3** an event's `effectiveAt` was shown without a time zone.

## 13. Negative controls

Scratchpad runner (outside Git): each control disables exactly one protection by an exact text replacement (or injects the forbidden behaviour, e.g. a provenance upgrade), runs every responsible suite — each must FAIL — then restores the file and verifies it byte-identical by SHA-256; after every DB control `db:verify test --expect-empty` must pass. Baseline first: `tests/db/p3b-http.test.ts` 61/61, `tests/api/authority-rules.test.ts` 38/38, `tests/web/p3b.test.tsx` 17/17. Full log with the failing test names: `evidence/p3b-negative-controls.txt`.

**Result: 51/51 controls made every responsible suite fail as expected; all files were restored byte-identically (SHA-256); `tb_notice_test` was empty after every DB control; NC15 (timing-dependent) was repeated twice more and detected each time (3/3). `git status` showed no source change afterwards.**

| Mission §38 area | Controls |
|---|---|
| cross-agency mandate / coverage | NC01 coverage route, NC02 coverage signer, NC03 preferred coverage |
| source applicability | NC04 mandate context, NC05 route context (coverage basis), NC06 event source, NC07 owner material |
| frozen-version immutability | NC08 version patch, NC09 new coverage, NC10 signer delete; NC11 archived mandate read-only |
| version predecessor / head rule | NC12 fork, NC13 draft predecessor, NC14 other mandate's predecessor |
| concurrent freeze | NC15 version row read without its FOR UPDATE lock (repeated, see below) |
| coverage scope | NC16 lineage on another route, NC17 archived route/party, NC18 duplicate coverage |
| CoverageSigner compatibility | NC19 ENDED, NC20 archived, NC21 duplicate association |
| Route preferredCoverage scope | NC22 another route, NC23 draft version, NC24 archived mandate (and NC03) |
| audit rollback | NC25 audit failure swallowed |
| ETag | NC26 createCoverage without the version If-Match, NC27 recordAuthorityEvent without the Mandate If-Match |
| idempotency | NC28 digest ignores the body |
| provenance no-upgrade | NC29 event takes the source's DOCUMENT_REVIEWED, NC30 REVIEWED_WITH_LIMITS without a reviewed source, NC31 DOCUMENT_REVIEWED event with an unreviewed source |
| DOCUMENT_REVIEWED reviewer / hash regression | NC32 reviewer name, NC33 hash, NC34 hash target, NC35 source revision, NC36 canonical binding — each injected upgrade makes the explicit regression tests fail |
| no G1 / G7 side effects | NC37 recording a coverage signer changes the Signer (G7), NC38 freezing sets the routes' preferred coverage (G1) |
| dates / no inference (additional) | NC39 event dated with the recording time, NC40 start after end accepted, NC41 unstorable instants accepted |
| append-only history / event scope (additional) | NC42 double supersession, NC43 event on a draft version's coverage, NC44 scope change on supersession |
| UI (additional) | NC45 frozen guards (F1), NC46 freeze-dialog meaning, NC47 picker offers draft coverage, NC48 "Document reviewed" with any source, NC49 "Approved" stamp, NC50 "Authorized signer" label, NC51 missing effective date filled from the recording time |

## 14. Tests, regression and CI

| Suite | P3B tests | Covers |
|---|---|---|
| `tests/db/p3b-http.test.ts` (tb_notice_test, real AppModule over HTTP) | 61 (new) | MANDATE (explicit agency, exact fields and nothing created alongside, lists / `q` / agency filter / signed cursors, patch, archive and restore as a flag only, delete of unused mandates only, canonical binding); MANDATE VERSIONS (numbering under the Mandate lock, the linear chain — fork, draft and other-mandate predecessors, concurrent creates and successors —, pinned citations, document/review claims, dates and storability); FREEZE (DRAFT → FROZEN once, immutability of the version and its children, structural re-validation, three concurrent freezes, a child edit racing a freeze, no event and no side effect); COVERAGES; COVERAGE SIGNERS; AUTHORITY EVENTS; ROUTE PREFERRED COVERAGE; DOCUMENT_REVIEWED regression (§10); CONTAMINATION (§15); SHARED WRITE LAYER (the 13 conditional operations 428/412, Idempotency-Key per write family, two tabs, audit rollback of every P3B write); SECURITY / CONTRACT (no session, CSRF and Origin refusals write nothing; every collected response conforms to the contract) |
| `tests/api/authority-rules.test.ts` | 38 (new) | Date ranges (only a known start after a known end is refused), storability (years outside 1000–9999, sub-millisecond precision, leap seconds — refused, never altered), version claims and their support, DOCUMENT_REVIEWED event support, write data and audit redaction (free text as its length, citations as count and ids) |
| `tests/web/p3b.test.tsx` (happy-dom) | 17 (new) | Mandates (list, hierarchy, create from an explicit agency, archive dialog); versions (create with the Mandate ETag and in-scope pickers, a refused claim explained, the freeze dialog's meaning, a stale freeze, frozen read-only, pinned citations); coverage over one exact route, coverage signers with neutral wording, frozen coverage read-only, creation URLs of a frozen version (F1); events (scope, DOCUMENT_REVIEWED only with a reviewed source, recorded vs effective dates with the time zone, F3); the route's preferred-coverage picker, an archived mandate (F2), a refused preference |
| Earlier suites (adjusted, none removed) | ±0 | `auth-http` / `directory-http`: the routed inventory 53 → 76 operations (23 Mandate-tagged) and two more unrouted action paths (`POST /coverage-signers/{id}/sign`, `POST /mandate-versions/{id}/approve` → 404); `p3a-http`: an unknown `preferredCoverageId` is now 422 `REFERENCE_NOT_FOUND` (was `PREFERRED_COVERAGE_UNAVAILABLE`); `web/p3a`: the new route's preferred-coverage text and the Representation navigation (Mandates now offered) |

Totals (home PC, 2026-09-24): `yarn test` **1148** in 30 files (P3A at R6: 1093 in 28; +38 authority-rules, +17 web p3b); `yarn test:db` **251** in 7 files (P3A at R6: 190 in 6; +61 p3b-http). No earlier test was removed. Per-file counts from a JSON-reporter run (output outside the repository) are in `evidence/p3b-first-pc-sweep.txt`. All tests use synthetic data; `db:verify test --expect-empty` shows `tb_notice_test` empty afterwards.

**Compiled P3B flow in CI** (`scripts/local/p3b-smoke.ts`, `yarn smoke:p3b`, mission §41): login → Agency + its own agreement source → Owner + LegalSubject → link → Route → Signer → Mandate → MandateVersion (pinned to the source; version 1, DRAFT, no inferred review or date) → MandateCoverage over the route → CoverageSigner (not the User) → freeze with the version's `If-Match` → **expected refusals**: a frozen version gains no coverage (409 `FROZEN_VERSION`) and a freeze with the pre-freeze ETag is 412 `RECORD_VERSION_CONFLICT` → Route `preferredCoverageId` (operational default) → AuthorityEvent scoped to the coverage (no ETag; dates exactly as supplied) → **expected refusals**: a DOCUMENT_REVIEWED event on an unreviewed source (422 `REVIEW_UNSUPPORTED`) and another agency's route preferring this coverage (422 `CROSS_AGENCY_REFERENCE`) → the five lists (one item each) → the source's provenance unchanged (OPERATOR_REPORTED) → `POST /cases` not routed (404) → logout. Every response is checked against the contract and for `Cache-Control: no-store`. It refuses to run unless `CI=true` and leaves its synthetic records in the disposable CI `tb_notice_dev` only. `smoke:local` now checks the P3B collections (401 without a session, also through the web proxy; the freeze without Origin 403) and that Case operations are not routed (404); `smoke:p3a` checks `POST /cases` instead of `POST /mandates`.

**Regression sweep** (mission §40; 2026-09-24T11:02:38Z–11:06:17Z, tree `04b8528` plus the uncommitted documentation and evidence; `evidence/p3b-first-pc-sweep.txt`) — all 19 steps exit 0:

| Command | Result |
|---|---|
| `yarn reference:check` | frozen references intact (also after the sweep) |
| `yarn reference:helper-tests` | 27 pass, 0 fail |
| `yarn contracts:check` | 3 generated outputs match the active source |
| `yarn install --immutable` | lockfile unchanged |
| `yarn typecheck` · `yarn lint` · `yarn format:check` | exit 0 |
| `yarn test` | 1148 / 1148 in 30 files |
| `yarn test:db` | 251 / 251 in 7 files (`tb_notice_test`) |
| `yarn db:verify test --expect-empty` | PASS, domain rows 0 |
| `yarn db:verify dev` | PASS (metadata and a row count only: 5, as at R5 and R6; no row content read) |
| `yarn db:status test` / `dev` | up to date (1 migration) |
| `yarn db:drift:diff-migrations` / `db:drift:diff-datasource dev` | empty migration (no drift) |
| `yarn build` | exit 0 |
| `yarn smoke:local` | 33 checks, including 19 business-boundary checks |
| `yarn dev:verify-shutdown` | 4 / 4 scenarios |

`git diff c8da59f..HEAD` shows no change under `apps/api/prisma`, `packages/**`, `docs/reference/**`, `yarn.lock`, `.yarnrc.yml` or `.nvmrc`; `package.json` adds only the script `smoke:p3b`. Nothing was written to `tb_notice_dev`.

**CI** — push run [35990960584](https://github.com/TuongChris/tb-notice-production-system/actions/runs/35990960584) for the code head `04b8528`: **success**, both jobs (`evidence/p3b-ci-run-35990960584.txt`). Non-DB job (cold install): reference check and the 27 helper tests, `contracts:check`, lint, format, `yarn test` 1148 / 1148 in 30 files, build, frozen references and working tree unchanged. DB job: migration and metadata verification on test, replay (second deploy a no-op) and dev; `yarn test:db` 251 / 251 in 7 files; synthetic seed twice (canonical digest unchanged); both Prisma drift diffs empty; `smoke:local` 33 checks; `smoke:auth` 4; `smoke:directory` 14; `smoke:p3a` 24; **`smoke:p3b` 36 checks, including the four expected refusals**; P1.1 recovery commands; `yarn dev` clean shutdown 4 / 4; frozen references unchanged. The earlier P3B run 35980464772 (`f79aa0a`) also succeeded. The documentation commit that records this evidence gets its own run; a commit cannot record its own run, so that final run of the submitted head is reported with R7.

## 15. Contamination tests (mission §37)

| Requirement | Test (`tests/db/p3b-http.test.ts`, "CONTAMINATION" unless noted) |
|---|---|
| A Mandate for Agency A never supports Agency B | "a Mandate of Agency A never supports Agency B: routes, signers, sources, preferences, predecessors and bindings"; CI flow refusal (another agency's route preferring the coverage → 422 `CROSS_AGENCY_REFERENCE`) |
| One Owner's authority chain never transfers to another Owner | "one Owner’s authority chain never transfers to another Owner: route-level material stays with its owner" (coverage basis, signer source and coverage-scoped event source) |
| Coverage cannot silently broaden to another Route/context | "a coverage never broadens to another route, and no case-scoped fact or source is used anywhere"; lineage tests (`predecessorCoverageId` OTHER_ROUTE); preferred-coverage OTHER_ROUTE refusal |
| CoverageSigner does not transfer across coverages | "the source must apply to the coverage’s route, and an association never transfers to another coverage" (COVERAGE SIGNERS) |
| Source scope remains isolated | "version citations apply to the mandate’s agency only; unknown, other-agency and case-scoped sources are refused per field"; "the basis source must apply to the route: agency, subject and owner material; case scope applies to nothing"; `source-rules` matrix (P3A) |
| No case-specific facts exist or are reused | every write test ends with `expectNoCaseRecords()` (all case tables empty); case-scoped sources apply to nothing; `POST /cases` is not routed (404, `smoke:local`, `smoke:p3a`, `smoke:p3b`) |
| The application User is never substituted for a Signer | "the application User is never substituted for a Signer anywhere in the chain" |

## 16. Database changes

**None.** No migration was needed, created or applied: the existing schema (`20260923103912_initial_schema`, sha256 `b54c36fd…6515`, still the only migration) already holds every P3B field, CHECK and FK, including the composite same-agency foreign keys used as backstops. `db:verify` passes on test (empty) and dev; both Prisma drift diffs are empty (§14). No `db push`, `migrate reset`, FK disabling or applied-migration edit.

## 17. Interpretations for R7 review

| Topic | Decision taken | Why |
|---|---|---|
| Mandate identity | No identity lock on the Mandate: label, external reference, description and notes stay editable (the agency never changes; a canonical binding is never replaced) | The Mandate is an administrative container; the documentary identity lives in pinned version citations |
| Archived Mandate / Agency | An archived Mandate and everything under it are read-only except restore — no new version, coverage, signer, **event** or freeze; an archived Agency blocks new authority records, freeze and restore | Archive is an administrative flag (R5 decision B); recording history on an archived container would reactivate it silently |
| Parent row versions | `createMandateVersion` and `recordAuthorityEvent` increment the Mandate; coverage and coverage-signer mutations increment the version (signers also the coverage) | INVARIANTS §5: the parent ETag covers its children, so freeze and child edits serialize and a stale tab is detected |
| Linear chain | Versions are numbered max+1; a predecessor is a FROZEN version of the same mandate without a successor; independent versions (no predecessor) are allowed | "no forks or cycles"; a draft is edited rather than succeeded |
| Document and review claims | DRAFT / SIGNED_APPEARING need the primary source; REVIEWED_WITH_LIMITS needs a cited primary/additional source recorded as DOCUMENT_REVIEWED; a DOCUMENT_REVIEWED event needs such a source | A claim about a document needs the document; the review claim must rest on an attributed human review (permanent DOCUMENT_REVIEWED rule) |
| UNTIL_TERMINATED with an `expiresOn` | Accepted and stored as given; conflicts belong in `validityNotes` | A document can state an open-ended term and a long-stop or review date; the app records, it does not reconcile or choose a reading |
| Freeze re-validation | Structural invariants only (chain, dates, claims, source existence/applicability, lineage); the administrative state of routes and signers is not re-evaluated; an incomplete draft can be frozen | INVARIANTS §4; administrative state is not legal status; freezing asserts nothing |
| Coverage route state | Route, owner and legal subject must be unarchived; the link state is not a condition (a PAUSED route can be covered); a PAUSED signer can be recorded (ENDED / archived refused) | A coverage records what a document covers; the same administrative rule as a route's default signer (R6 decision 4) |
| Coverage-scoped events | Only for coverage of a FROZEN version | A draft is edited, not evented |
| Supersession | Same mandate and same scope; one successor per event | "no forks"; a successor never widens or narrows scope |
| Preferred coverage | Frozen coverage of the same route in an unarchived mandate; a later archive does not cascade (the route keeps the value; the UI shows it as "no longer offered") | Operational default only; changing the route silently would be a side effect |
| Storability | Dates outside 1000–9999, more than millisecond precision or leap seconds → 422 `VALIDATION_FAILED` | The stored value must equal the accepted value (MySQL DATE/DATETIME(3)) |
| Owner material | Route-level authority citations (coverage basis, coverage-signer source, coverage-scoped event source) count as the route owner's material | R6 decision 7 applied to P3B, conservatively |
| Signed dates | `signedDatesRaw` keeps the date exactly as written with who signed and the source; never converted | A signature date is not a start date, and the wording may be ambiguous |

## 18. Deviations, warnings and limitations

- **§41 flow order.** The mission lists "MandateVersion → freeze → MandateCoverage → CoverageSigner". Because a frozen version is immutable (§8), coverage and coverage signers are recorded **before** the freeze; `smoke:p3b` then shows `createCoverage` on the frozen version as an expected refusal (409 `FROZEN_VERSION`). Every listed step is covered; only the order differs.
- **Latent P3A defect (observed and reported; not changed — outside this mission).** The contract's `date-time` format admits instants MySQL cannot store exactly. P3B refuses them for its own fields (422 `VALIDATION_FAILED`), but P3A's source capture does not: on the compiled API (`yarn ui:sandbox`, synthetic data), a source `observedAt` or `reviewedAt` with a leap second (`…T23:59:60Z`) returns **500 `INTERNAL_ERROR`** (nothing persisted), a microsecond `observedAt` is accepted and silently truncated to milliseconds, and year 0999 is accepted. Proposed remediation for the operator's decision: the same storability check in P3A source capture, with tests and a negative control. Evidence: `evidence/p3b-observation-p3a-source-instants.txt`.
- Cosmetic items left unchanged (evidence file): generic "Mandate" breadcrumbs on some creation pages, "its 0 coverages" in the freeze dialog of an empty version, and the list-table scroll frame of earlier phases not being focusable itself.
- `smoke:p3b` writes records and runs only in CI (`CI=true`); on the home PC the same operations were exercised through the browser pass on `yarn ui:sandbox` and the DB suite.
- Session-row and idempotency-record retention cleanup remain DEFERRED (unchanged, non-blocking).
- Context7 was not used (no version-specific library question arose); the optional frontend-design skill (§33) was not used — the P3B pages reuse the P2/P3A design system. The headless browser used Linux fallback fonts.

## 19. Blockers

None.

## 20. Proposed next phase (not started)

**P4A — Case core and case authority selection** (gate R8, needs its own explicit, approved mission): `Case` (list, create, get, patch, delete-unused, archive, restore, workflow, route binding, canonical binding), case-scoped SourceReference links (`listCaseSources`, `linkCaseSource`, `getCaseSource`, `setCaseSourceLinkState`, which lifts the current refusal of `caseIds`), and `CaseAuthoritySelection` (`selectCaseAuthority`, `listCaseAuthoritySelections`) — the first place where case authority is determined from a frozen coverage and its recorded signers. Excluded: reported items, case works, use mappings, case facts, correspondence, prompts, NoticeCandidate, ValidationRun, assessments, readiness, G1–G7, signing, sending and any external action. Nothing of it is started.
