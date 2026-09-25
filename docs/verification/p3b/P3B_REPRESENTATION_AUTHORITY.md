# P3B — Representation authority (home PC)

Mission TB_P3B_REPRESENTATION_AUTHORITY_TO_R7 on `feature/p3b-representation-authority`, branched from `main` `adea2bc` (post-P3A merge) and started at the R6 closeout head `c8da59f`. Recorded 2026-09-24 (UTC) on the home PC, the primary development workstation (ADR-0003). The mission stops at review gate **R7** and is submitted as **PENDING**. Cases and every later phase were **not started**. No case, CaseAuthoritySelection, reported item, case work, use mapping, case fact, correspondence, prompt, NoticeCandidate, ValidationRun workflow, CandidateAssessment, G1–G7 readiness, READY_FOR_SIGNER, signing, adoption, sending, retraction, counter-notification, uploader contact, Drive write, mailbox or other external action exists.

> **R7 (operator, 2026-09-24): PASS_WITH_ONE_REMEDIATION.** P3B is functionally accepted; the accepted decisions and the one remediation (SourceReference instant storability, `ee31fa3`) are recorded in §21.
>
> **R7 closeout (operator, 2026-09-24): PASS** — P3B is VERIFIED_COMPLETE and MERGED_TO_MAIN (pull request #2, merge commit `3649bef`); the closeout is §22. Sections 1–20 are the record as submitted at R7 and §21 the remediation record; they are not rewritten.

## Status by scope (not collapsed)

| Scope | Status | Basis |
|---|---|---|
| **P3B_FIRST_PC** | **PASS** | All automated checks in §14 executed on the home PC and passed |
| **P3B_CI** | **PASS** for the code head `04b8528` (push run 35990960584, both jobs success, `smoke:p3b` 36 checks) and for `f79aa0a` (run 35980464772) | CI runs `yarn test`, `yarn test:db`, `smoke:local`, `smoke:auth`, `smoke:directory`, `smoke:p3a` and the new compiled `smoke:p3b` flow (§14). A commit cannot record its own run; the final run of the submitted documentation head is reported with R7 |
| **P3B_BROWSER (Playwright MCP)** | **PASS** 20/20 (supplemental); three UI findings found and fixed (`04b8528`) | Isolated test browser against the compiled API on the disposable `tb_notice_test` (`evidence/p3b-playwright-mcp-verification.txt`, §12) |
| **P3B_NEGATIVE_CONTROLS** | **PASS** 51/51 | Every disabled protection made its responsible suites fail; files restored byte-identically (§13, `evidence/p3b-negative-controls.txt`) |
| **R7 review** | **PASS** (operator, 2026-09-24, closeout) — first **PASS_WITH_ONE_REMEDIATION**: P3B functionally accepted; decisions accepted (§21.1) | The one remediation — SourceReference instant storability — implemented (`ee31fa3`) and verified (§21); closeout and merge §22; submitted as PENDING |
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
- **Latent P3A defect (observed and reported; not changed — outside this mission).** The contract's `date-time` format admits instants MySQL cannot store exactly. P3B refuses them for its own fields (422 `VALIDATION_FAILED`), but P3A's source capture does not: on the compiled API (`yarn ui:sandbox`, synthetic data), a source `observedAt` or `reviewedAt` with a leap second (`…T23:59:60Z`) returns **500 `INTERNAL_ERROR`** (nothing persisted), a microsecond `observedAt` is accepted and silently truncated to milliseconds, and year 0999 is accepted. Proposed remediation for the operator's decision: the same storability check in P3A source capture, with tests and a negative control. Evidence: `evidence/p3b-observation-p3a-source-instants.txt`. **Remediated at R7 — §21** (the defect class turned out wider; one shared rule now serves both phases).
- Cosmetic items left unchanged (evidence file): generic "Mandate" breadcrumbs on some creation pages, "its 0 coverages" in the freeze dialog of an empty version, and the list-table scroll frame of earlier phases not being focusable itself.
- `smoke:p3b` writes records and runs only in CI (`CI=true`); on the home PC the same operations were exercised through the browser pass on `yarn ui:sandbox` and the DB suite.
- Session-row and idempotency-record retention cleanup remain DEFERRED (unchanged, non-blocking).
- Context7 was not used (no version-specific library question arose); the optional frontend-design skill (§33) was not used — the P3B pages reuse the P2/P3A design system. The headless browser used Linux fallback fonts.

## 19. Blockers

None.

## 20. Proposed next phase (not started)

**P4A — Case core and case authority selection** (gate R8, needs its own explicit, approved mission): `Case` (list, create, get, patch, delete-unused, archive, restore, workflow, route binding, canonical binding), case-scoped SourceReference links (`listCaseSources`, `linkCaseSource`, `getCaseSource`, `setCaseSourceLinkState`, which lifts the current refusal of `caseIds`), and `CaseAuthoritySelection` (`selectCaseAuthority`, `listCaseAuthoritySelections`) — the first place where case authority is determined from a frozen coverage and its recorded signers. Excluded: reported items, case works, use mappings, case facts, correspondence, prompts, NoticeCandidate, ValidationRun, assessments, readiness, G1–G7, signing, sending and any external action. Nothing of it is started.

## 21. R7 result and remediation (2026-09-24, home PC)

**R7 result (operator): PASS_WITH_ONE_REMEDIATION.** P3B Representation Authority is functionally accepted. The one blocking remediation before the R7 closeout was the latent P3A SourceReference timestamp-storability defect found during P3B (§18). Mission: TB_R7_SOURCE_TIMESTAMP_STORABILITY_REMEDIATION, on `feature/p3b-representation-authority` from the submitted head `8e513f0`. P4A was **not** started; nothing was merged to `main`.

### 21.1 R7 decisions accepted (operator)

1. A Mandate has no established-identity lock: it is a representation/appointment container, not a LegalSubject identity record.
2. An archived Mandate stays read-only, including no new AuthorityEvent. A historical or retroactive event is recorded by restoring the Mandate administratively, recording the event with its actual supplied effective/occurred date, and archiving again if appropriate. `recordedAt` is never substituted for `effectiveAt`.
3. UNTIL_TERMINATED together with an `expiresOn` value may be preserved as supplied documentary facts. The system infers no currentness, expiry or contradiction resolution from that combination.
4. A PAUSED Route and a PAUSED Signer may take part in P3B documentary records where the contract allows them. PAUSED is administrative state and neither proves nor disproves legal authority.
5. A truthful incomplete DRAFT MandateVersion may be frozen. FROZEN means an immutable snapshot only — not complete, legally approved, current authority, G1 PASS, owner-confirmed or signer-adopted.
6. `Route.preferredCoverageId` is not cleared automatically when its parent Mandate is later archived. The recorded operational preference is preserved; any later Case/authority-selection workflow must revalidate whether the Coverage is usable.
7. The conservative owner-material source-scope extension stays accepted until a more explicit owner-scope model exists.
8. Permanent semantics: Coverage ≠ G1 PASS; CoverageSigner ≠ G7; an AuthorityEvent's existence is not proof by itself; an application User is not a Signer.

No contract amendment is authorized by these decisions.

### 21.2 Remediation (commit `ee31fa3`)

**Accepted rule (R7).** If a supplied timestamp cannot be stored and read back exactly under the current database representation, it is refused deterministically before persistence: no 500, no silent truncation, no silent date change.

**Root cause (measured; `evidence/p3b-r7-source-instants-root-cause.txt`).** The contract's `date-time` format (ajv-formats 3.0.1 "full", the wire oracle) admits leap seconds, any number of fraction digits, years 0000–9999, the offsets `±HHMM` and `±HH`, any single whitespace character as separator, and — through its leap-second arithmetic — hour-24 / minute-overflow forms with an offset. `observed_at` and `reviewed_at` are `DATETIME(3)` (UTC). P3A's `captureProblem` never checked these fields, and `captureData` handed the request string to Prisma:

| Defect | Mechanism |
|---|---|
| A. leap second → 500 | Prisma's DateTime validation accepts `…23:59:60…`; the adapter's JS `Date` of it is Invalid and is formatted as `'0NaN-NaN-NaN NaN:NaN:NaN'`; MySQL error 1292; the unmapped Prisma error became 500 `INTERNAL_ERROR` (nothing persisted) |
| B. sub-millisecond digits silently cut | The adapter converts to a JS `Date`, which keeps whole milliseconds: `.123456` and `.123999` were stored as `.123` (cut, not rounded) |
| C. years outside MySQL's range accepted | `0999-…` was stored (outside MySQL's supported range); years `0000–0099` were stored but read back shifted by the driver (`0050` → `1950`, `0000-01-01` → `2000-01-01`) |
| further members of the same class (all 500) | A UTC instant after 9999 through an offset (`9999-12-31T23:59:59-01:00` → 1292); spellings Prisma's parser refuses: `+05`, `+0530`, TAB / LF / NO-BREAK SPACE / IDEOGRAPHIC SPACE separators, `24:59:30+01:00` |

The P3B rule had a related gap: it judged and converted `effectiveAt` with V8's `Date` parser, whose legacy fallback (any separator other than `T`/`t`) reads years `0000–0099` as `1950–2049` — `0050-06-30 10:00:00Z` would have been accepted and stored as **1950**-06-30.

**Shared implementation (`apps/api/src/infrastructure/write/storability.ts`).** One exact parser of the contract `date-time` grammar computes the instant from its components (no V8 or Prisma string parsing):

- `storableInstant(value)` → the exact `Date` a `DATETIME(3)` column stores and reads back unchanged, or null: a real time of day (no second 60, no hour 24, no minute overflow), no non-zero digit after the milliseconds, a calendar date, and a UTC instant within MySQL's supported DATETIME range with a fractional part.
- `storabilityProblem(body, dateFields, timestampFields)` — moved unchanged in signature and date behaviour from `authority-rules.ts` → 422 `VALIDATION_FAILED` naming every unstorable field, before any idempotency claim or write.
- `toDbInstant(value)` — the exact `Date` that is written; a value that was never checked fails (500) rather than being written altered.
- Users: P3A `captureProblem` (`observedAt`, `reviewedAt`; checked first, so the result is deterministic) and `captureData` (writes the exact `Date`); P3B `recordAuthorityEvent` (`effectiveAt`, now written with `toDbInstant` instead of `new Date(string)`) and the P3B date checks of versions, coverages and coverage signers (unchanged).

**Boundaries (UTC).**

| | Accepted | Refused |
|---|---|---|
| Lower | `1000-01-01T00:00:00.000Z`; a local date in 0999 only when its UTC instant is in range (`0999-12-31T23:30:00-01:00` = `1000-01-01T00:30:00.000Z`) | `0999-12-31T23:59:59.999Z`, `1000-01-01T00:30:00+01:00`, `0999-…`, `0000-…`, `0050-06-30 10:00:00Z` |
| Upper | `9999-12-31T23:59:59.499Z` | `9999-12-31T23:59:59.500Z`, `…23:59:59.999Z` (MySQL: "…'9999-12-31 23:59:59.499999'" with a fractional part), `9999-12-31T23:59:59-01:00` (UTC year 10000) |
| Time of day | `00:00:00`–`23:59:59.999` | `23:59:60` in any offset (`2016-12-31T15:59:60-08:00`), `24:59:30+01:00`, `23:99:60+00:40` |
| Fraction | up to 3 digits; further digits only zeros (`.123000` = `.123`) | any non-zero digit after the third (`.1234`, `.123456`, `.123999`, `.0005`) |
| Spelling | `Z`/`z`, `±HH:MM`, `±HHMM`, `±HH`, `-00:00`; separator `T`, `t` or one whitespace character — all stored as the same UTC instant | — (outside the contract format: already 422 at body parsing) |
| DATE (P3B) | `1000-01-01`…`9999-12-31` (unchanged) | outside (unchanged) |

**Behaviour changes (all no-write refusals or exact stores; wire schemas unchanged).**

| Input | Before R7 | After |
|---|---|---|
| Source `observedAt`/`reviewedAt`: leap second, `24:59:30+01:00`, UTC year 10000 | 500 | 422 `VALIDATION_FAILED` |
| Source: `.123456` / `.1239` | 201, cut to `.123` | 422 |
| Source: years before 1000 (UTC), `0000`–`0099` shifted on read | 201 | 422 |
| Source: `…23:59:59.500Z`–`.999Z` on 9999-12-31 | 201 | 422 |
| Source: `+05`, `+0530`, TAB / LF / NBSP / U+3000 separator | 500 | 201, the exact instant |
| Event `effectiveAt`: `0050-06-30 10:00:00Z` (non-`T` separator, years 0000–0099) | 201, stored as 1950-06-30 | 422 |
| Event `effectiveAt`: `…23:59:59.500Z`–`.999Z` on 9999-12-31 | 201 | 422 |
| Event `effectiveAt`: `.123000` (zeros after the milliseconds), `+05` | 422 | 201, the exact instant |
| Refusal message for an unstorable instant | "…between years 1000 and 9999 (keep the exact wording in the raw text field)" | "Must be a real instant (no leap second) with at most millisecond precision, between 1000-01-01T00:00:00.000Z and 9999-12-31T23:59:59.499Z" |

Every value inside MySQL's documented supported range that was stored exactly before is still stored as the same instant. The previously accepted values now refused are those the storage path altered (cut fractions, shifted years) and those outside the documented range — years before 1000 in UTC and the last half-second of 9999-12-31, which the pinned server happens to store but MySQL does not support (the same "current MySQL contract" standard R7 applied to year 0999, which also happens to round-trip). No migration, no column change, no wire-contract change, no dependency change.

### 21.3 Tests added or extended

| Suite | Change | Covers |
|---|---|---|
| `tests/api/storability.test.ts` | **new, 47** | The shared rule: every case is proven wire-valid first (it reaches the rule); 19 stored spellings with their exact instants (fraction zeros, `±HH:MM`/`±HHMM`/`±HH`/`-00:00`, `t`/`z`, space/TAB/U+3000 separators, leap day, lowest `1000-01-01T00:00:00Z`, `0999-12-31T23:30:00-01:00` = UTC 1000, highest `9999-12-31T23:59:59.499Z`); 18 refusals, never altered (leap seconds in any offset, hour 24, minute 99, `.1234`/`.123456`/`.123999`/`.0005`, 0999, UTC 0999 through an offset, 0000, `0050-06-30 10:00:00Z`, `…59.500Z`, `…59.999Z`, UTC 10000); values outside the format; an oracle test against the ECMAScript-specified `Date.parse` over 6 930 canonical wire strings (years 0999–9999, fractions, offsets) — the stored instant equals it inside MySQL's range and nothing outside; a metamorphic test that 512 alternative spellings (offset forms and separators) name the canonical instant; date boundaries; every unstorable field reported in order |
| `tests/api/source-rules.test.ts` | +1 (36 → 37) | `captureProblem` refuses unstorable `observedAt`/`reviewedAt` per field and **first** (before any other capture rule), including an offset-written leap second; storable spellings and nulls pass |
| `tests/api/authority-rules.test.ts` | import path only | The P3B storability cases stay byte-identical as the regression guard of the accepted P3B semantics |
| `tests/db/p3a-http.test.ts` | +4 (41 → 45) | Over real HTTP on `tb_notice_test`: **create** stores 16 spellings as exactly their instant — checked in the response, by GET, in the audit record and in the column's own text (`CAST(observed_at AS CHAR)`, not Prisma's read path); **revise** stores each revision's own instants and leaves earlier revisions unchanged; **15 unstorable values × 2 fields × (create, revise)** are 422 `VALIDATION_FAILED` naming the field — never 500 — with no SourceReference row, no audit event and no idempotency record written and the head unchanged; the same refusal is deterministic; a refused request's Idempotency-Key keeps no result and then runs the corrected request once (exact replay returns it) |
| `tests/db/p3b-http.test.ts` | +1 (61 → 62) | `effectiveAt` under the shared rule: `.123000`, `+05`, TAB separator and both boundaries stored exactly (column text checked); `0050-06-30 10:00:00Z`, an offset-written leap second, `0000-…`, `…59.500Z`, `…59.999Z`, `24:59:30+01:00` refused with no event and no Mandate version change |

Totals: `yarn test` 1196 in 31 files (R7 submission: 1148 in 30); `yarn test:db` 256 in 7 files (R7 submission: 251).

### 21.4 No write on rejection

The check runs in the service before `WriteExecutor.execute` — before the idempotency claim, the transaction and the audit writer — so a refused value cannot write anything. The HTTP suites prove it: after every refusal, `source_references`, `audit_events` and `idempotency_records` are unchanged (P3A) and `authority_events` and the Mandate's `rowVersion` are unchanged (P3B); no response is 500. `tb_notice_test` was verified empty after every DB suite, negative control and the sandbox session.

### 21.5 Negative controls R7-NC01–R7-NC08 (`evidence/p3b-r7-negative-controls.txt`) — 8/8 PASS on `ee31fa3`

| Control | Disabled protection | Responsible suites (all failed) |
|---|---|---|
| R7-NC01 | leap-second rejection (`second > 59` → `> 60`) | storability, source-rules, p3a-http, p3b-http |
| R7-NC02 | refusal of digits after the milliseconds (silent truncation) | storability, source-rules, authority-rules, p3a-http, p3b-http |
| R7-NC03 | the DB year bounds (any UTC year accepted) | storability, source-rules, authority-rules, p3a-http, p3b-http |
| R7-NC04 | the P3A capture check (the original gap) | source-rules, p3a-http (unchecked values fail closed as 500, never stored) |
| R7-NC05 | the exact write of P3A (request string to Prisma) | p3a-http (`+0530` etc. → 500) |
| R7-NC06 | the exact write of P3B (`new Date(string)`) | p3b-http (`+05` → 500) |
| R7-NC07 | the whole pre-remediation P3A capture code (8e513f0) | source-rules, p3a-http — reproduces `observedAt "2016-12-31T23:59:60Z" → [500, INTERNAL_ERROR]` and `+0530` → 500 |
| R7-NC08 | the pre-remediation P3B rule as the shared rule (V8 parsing) | storability, p3a-http, p3b-http — reproduces `0050-06-30 10:00:00Z` → **1950-06-30** |

Every file was restored byte-identically (SHA-256) and `tb_notice_test` was empty after every control. A first run found one gap: with only the explicit check removed (R7-NC01), a leap second written as local `23:59:60` is still refused (it rolls into the next day, which the calendar check refuses), so only an offset-written leap second exposes it — and only two suites contained one. Offset-written leap seconds were added to the source-rules, P3A and P3B suites before the commit, and the final run repeated all eight controls (the first run is kept in the evidence file).

### 21.6 P3B date regression

Unchanged, and proven by the unchanged P3B suites — the 61 earlier P3B HTTP tests are untouched and the 38 P3B unit tests differ only in the import path of `storabilityProblem`; all pass: MandateVersion `effectiveOn`/`expiresOn` (same DATE range check and `toDbDate`), signed dates (`signedDatesRaw` stays JSON text, never converted), coverage and coverage-signer periods (same DATE checks, `DATE_RANGE_INVALID`), AuthorityEvent `effectiveOn` and `rawEffectiveText` (stored as supplied), and the `recordedAt` ≠ `effectiveAt` distinction (the event's `createdAt` is the app clock; the browser re-check shows the two separately). `effectiveAt` changed only as listed in §21.2 (exact write; `.123000`/`+05` accepted; V8-shifted years and `…59.500Z`–`.999Z` refused). No accepted P3B decision was changed to share the helper.

### 21.7 Regression, browser re-check and CI

- **Regression sweep** (`evidence/p3b-r7-remediation-sweep.txt`, `ee31fa3`, 13:08–13:12Z): `reference:check`, `reference:helper-tests` (27/27), `contracts:check`, `install --immutable`, `typecheck`, `lint`, `format:check`, `yarn test` 1196, `yarn test:db` 256, `db:verify test --expect-empty`, `db:verify dev`, `db:status` test/dev, both drift diffs empty, `build`, `smoke:local` (33 checks), `dev:verify-shutdown` (4/4), `reference:check` again — **19/19 exit 0**. `smoke:directory`, `smoke:p3a` and `smoke:p3b` run in CI only.
- **Targeted browser re-check** (`evidence/p3b-r7-playwright-mcp-verification.txt`, 7/7 PASS, supplemental): on `yarn ui:sandbox` (compiled API, `tb_notice_test`), the source form refuses an Observed-at year 0999 with the field-linked message and saves nothing, then stores the corrected local time exactly; forced requests to the compiled API refuse every unstorable create/revise value with 422 and store `+0530`, `.123000` and both boundaries exactly; the event form refuses an offset-written leap second and `0050-06-30 10:00:00Z` and records `2025-06-30T15:15:00+05` as `2025-06-30T10:15:00.000Z`. The UI code is unchanged (only the message text it displays changed).
- **CI** — push run **36002633201** on `ee31fa3`: **success**, both jobs (`evidence/p3b-r7-ci-run-36002633201.txt`): `yarn test` 1196, `yarn test:db` 256, `smoke:local` 33, `smoke:auth`, `smoke:directory` 14, `smoke:p3a` 24, `smoke:p3b` 36, seed canonical, `dev:verify-shutdown` 4/4, frozen references and working tree unchanged. A commit cannot record its own run: the run of this documentation commit is reported with the R7 closeout.

### 21.8 Status

| Scope | Status |
|---|---|
| R7 review | **PASS_WITH_ONE_REMEDIATION** (operator, 2026-09-24) |
| R7 remediation (SourceReference instant storability) | **IMPLEMENTED AND VERIFIED** — `ee31fa3`; tests, 8/8 negative controls, 19/19 sweep, 7/7 browser re-check, CI 36002633201 success |
| Database / wire contract / dependencies | **No change** (no migration; `20260923103912_initial_schema` still the only one; columns unchanged; `contracts:check` OK; PFC wire id `PFC-YT-EMAIL-v1.1`; lockfile unchanged) |
| Merge to `main` | **Not merged**; `main` keeps the pre-fix P3A capture path until an approved merge |
| P4A | **Not started** |
| Recommendation | R7 closeout: **PASS** — P3B accepted, the one remediation delivered; merge only on explicit operator approval |

## 22. R7 closeout (2026-09-24, home PC)

**R7 result (operator): PASS.** P3B — Representation Authority — is accepted: `P3B = VERIFIED_COMPLETE`, `P3B = MERGED_TO_MAIN`, with the accepted R7 remediation (§21) included. Mission: TB_R7_POST_MERGE_CLOSEOUT_AND_P4A_BRANCH — reconciliation and branch preparation only.

### 22.1 Merge reconciliation (verified with `git` and authenticated `gh`, not assumed)

| Item | Observed value |
|---|---|
| `P3B_ACCEPTED_HEAD` | `05ce7b06118182d6592a434a90f4b88ce53f6fa8` |
| Pull request | #2 `feature/p3b-representation-authority` → `main`, opened 2026-09-24T13:31:19Z, state MERGED, merged 2026-09-24T13:50:21Z by the repository owner; `headRefOid` = `05ce7b0` (nothing was added after the accepted head); 9 commits (`c8da59f`…`05ce7b0`), 88 files |
| `P3B_MERGE_METHOD` | **merge commit** (GitHub "Create a merge commit"): `3649bef` has two parents, `adea2bc` (previous `main`) and `05ce7b0`; message "Merge pull request #2 from TuongChris/feature/p3b-representation-authority"; committed by GitHub; the pull request's `merged` timeline event names `3649bef`. Not squash, not rebase |
| `P3B_MERGED_MAIN_HEAD` | `3649bef4d83feeec3bcf6b8293757354af739ae4` |
| Ancestry / content | `git merge-base --is-ancestor 05ce7b0 origin/main` → exit 0. The branch started at the previous `main` `adea2bc` (the merge base of both parents), so the merge introduced nothing else: the trees of `3649bef` and `05ce7b0` are identical (`c758d3d2242d5b5c0564c5182d7d01f51d42b188`; `git diff 05ce7b0 3649bef` empty), and `git log 05ce7b0..origin/main` lists only the merge commit |
| `main` CI after the merge | The workflow runs on every push (`push: branches: ['**']`) and on pull requests. Push run **36008448885** on `3649bef` — **success**, both jobs (https://github.com/TuongChris/tb-notice-production-system/actions/runs/36008448885): `yarn test` 1196 in 31 files, `yarn test:db` 256 in 7 files, `smoke:local` 33 checks, `smoke:auth` 4, `smoke:directory` 14, `smoke:p3a` 24, `smoke:p3b` 36 (including its expected refusals), the P1.1 recovery checks, seed canonical digest `0ee26dc3…b775`, both Prisma drift diffs empty, `dev:verify-shutdown` 4/4, `reference:check`, `reference:helper-tests` 27/27, `contracts:check`, `typecheck`, `lint` (0 errors, 1 warning — §22.6), `format:check`, `build`, frozen references and working tree unchanged. Both check runs on `3649bef` are `completed / success` (the legacy commit-status API holds no statuses) |
| Accepted head CI | `05ce7b0`: push run 36004964689 success; pull_request run 36006237155 (PR #2) success. Remediation `ee31fa3`: run 36002633201 success; R7 submission head `8e513f0`: run 35991749458 success |

### 22.2 History preserved

Nothing was amended, rebased, rewritten or force-pushed, and no tag or release was created. `feature/p3b-representation-authority` stays at the accepted head `05ce7b0` (local and origin); `bootstrap/p0-local`, `feature/p1-auth-shell`, `feature/p2-directory` and `feature/p3a-sources-route` are unchanged. Sections 1–21 keep the state at their time (for example §21.8 "Not merged"). The branch's only run that is not green — run 35970356174, the branch-creation push of `adea2bc`, `cancelled` by the workflow's concurrency group when the R6 closeout `c8da59f` was pushed — stays as it is; every other run of the branch succeeded.

### 22.3 Accepted semantics carried forward (unchanged; no new legal conclusion)

- A Mandate is a representation container, not a legal identity.
- An archived Mandate is read-only until an explicit restore.
- UNTIL_TERMINATED and `expiresOn` values are preserved as documentary facts; no authority currentness is inferred.
- A PAUSED Route or Signer may remain usable where the contract permits; PAUSED is administrative only.
- A FROZEN MandateVersion is an immutable snapshot only: FROZEN ≠ complete, FROZEN ≠ approved, FROZEN ≠ current authority, FROZEN ≠ G1 PASS.
- Coverage ≠ G1 PASS. CoverageSigner ≠ G7. An AuthorityEvent's existence is not proof by itself.
- `Route.preferredCoverageId` is an operational preference only.
- An application User is not a Signer.
- DOCUMENT_REVIEWED is never inferred.
- A SourceReference revision never silently re-points existing citations.
- Date and time values that cannot round-trip exactly through the current database representation are refused before persistence (§21.2).

### 22.4 Next phase recorded (not started)

**P4A — Case Core and Case Authority Selection**, gate **R8**; it needs its own explicit, approved mission. Expected contracted operations, as listed at the closeout:

| Family | Expected operations |
|---|---|
| Case — 10 | `listCases`, `createCase`, `getCase`, `patchCase`, `deleteUnusedCase`, `ArchiveCase`, `RestoreCase`, `WorkflowCase`, `RouteBindingCase`, `CanonicalBindingCase` |
| CaseSource — 4 | `listCaseSources`, `linkCaseSource`, `getCaseSource`, `setCaseSourceLinkState` |
| CaseAuthoritySelection — 2 | `selectCaseAuthority`, `listCaseAuthoritySelections` |

Expected total: 16. Before implementation, the P4A mission verifies this against the current contract rather than trusting the remembered count. (A read-only look at `packages/contracts/src/api/operations.ts` on `3649bef` during this closeout found each of the 16 operationIds exactly once, spelled as above; it does not replace that verification.) P4A excludes ReportedItem, CaseWork, UseMapping, CaseFact, correspondence, prompt production, candidates, validation, assessments, G1–G7, READY_FOR_SIGNER, signing and sending.

**CaseAuthoritySelection — semantic note (operator, recorded for P4A).** It means "the authority chain selected/pinned for evaluation in this specific Case". It does **not** mean G1 PASS, current authority confirmed, legally valid authority adjudicated, signer eligibility confirmed, G7 or notice readiness. Actual G1 evaluation is a later readiness phase. §20's phrase "the first place where case authority is determined" is read with this note: a selection pins a chain for evaluation; it confirms or adjudicates no authority. R7 decision 6 applies: the selection workflow revalidates whether a Route's preferred coverage is usable.

### 22.5 P4A branch

`feature/p4a-case-core` was created from the exact current `origin/main` head `3649bef` (not from `feature/p3b-representation-authority`) and pushed with upstream. At creation, local and origin both pointed at `3649bef`, the worktree was clean, `reference:check` reported the frozen references intact and `contracts:check` passed; the branch-creation push run 36011769204 on `3649bef` succeeded (both jobs). Before this documentation commit, `install --immutable`, `reference:check`, `reference:helper-tests` (27/27), `contracts:check`, `typecheck`, `lint` (the §22.6 warning only), `format:check` and `yarn test` (1196 in 31 files) all exited 0 on the branch. The branch carries this closeout documentation only. **P4A = NOT_STARTED**: no Case, CaseSource, CaseAuthoritySelection, reported item, case work, use mapping, case fact, correspondence, prompt, NoticeCandidate, validation, readiness, G1–G7, signing or sending code and no migration exist.

### 22.6 Observation — one lint warning since `ee31fa3` (not fixed here)

`yarn lint` has reported one warning since the R7 remediation commit: `tests/api/source-rules.test.ts:183:15` eslint(no-unsafe-optional-chaining), in the R7 test's helper (`(problem?.details['issues'] as …).map(…)`). Lint exits 0 (warnings do not fail the gate); CI runs 36002633201 (`ee31fa3`) and 36008448885 (`3649bef`) show "Found 1 warning and 0 errors", run 35991749458 (`8e513f0`) "Found 0 warnings". The R7 sweep and report recorded `lint` as exit 0 without naming it. It is test code only and changes no assertion: when `problem` is absent, the preceding `expect(problem?.code).toBe('VALIDATION_FAILED')` fails first. This closeout changes documentation only, so the warning stays; the one-line fix belongs to the next approved code change.

### 22.7 Status

| Scope | Status |
|---|---|
| R7 review | **PASS** (operator, 2026-09-24) |
| P3B_STATUS | **VERIFIED_COMPLETE** |
| P3B_MERGE | **MERGED_TO_MAIN** — PR #2, merge commit `3649bef` (method: merge commit), merged 2026-09-24T13:50:21Z; `main` push CI run 36008448885 success |
| Database / wire contract / dependencies | **No change** — `20260923103912_initial_schema` is still the only migration; `contracts:check` OK; PFC wire id `PFC-YT-EMAIL-v1.1`; lockfile unchanged |
| P4A | **NOT_STARTED** — branch `feature/p4a-case-core` from `main` `3649bef` |
