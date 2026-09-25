# P4B — Case intake material (home PC)

Mission TB_R8_MERGE_CLOSEOUT_AND_P4B_CASE_INTAKE_TO_R9 on `feature/p4b-case-intake`, created from the exact post-merge `main` head `1d91c41` (P4A merged by pull request #3; `P4A_CASE_CORE.md` §23). Recorded 2026-09-25 (UTC) on the home PC, the primary development workstation (ADR-0003). The mission stops at review gate **R9**, submitted with the documentation commit that adds this record, on the code head `35cf552`. Every later case phase is **not started**: no correspondence or correspondence binding, ProductionContext, PromptSnapshot, NoticeCandidate, ValidationRun workflow, CandidateAssessment, readiness gate, G1–G7, READY_FOR_SIGNER, signature, adoption, sending, uploader contact, YouTube fetch, Drive write, mailbox or other external action exists.

**R9 result (operator, 2026-09-25): PASS_WITH_ONE_CONTRACT_REMEDIATION.** P4B is functionally accepted. The one blocker was the FactSource read-back gap (§1.2, §19). It is remediated by the mission TB_R9_FACT_SOURCE_READBACK_REMEDIATION_TO_R9_FINAL (2026-09-25) on `feature/r9-fact-support-readback`: the additive contract release **TB-SCHEMA-API-v1.2.0** (ADR-0005, PROPOSED) and its one new read, `getCaseFactSources` (§25). The remediation is submitted for **R9 final (PENDING)**; R9 stays **PASS_WITH_ONE_CONTRACT_REMEDIATION** until the operator's final review.

**Merged (2026-09-25, by the operator):** `P4B = MERGED_TO_MAIN` — pull request #4, merge commit `eb83b19` (parents `1d91c41` and the R9 submission head `6ff6775`); `main` push CI run 36106838217 success. `P4B_STATUS = VERIFIED_COMPLETE_FOR_IMPLEMENTED_SCOPE` (§24). P4C is **not started**.

## Status by scope (not collapsed)

| Scope | Status | Basis |
|---|---|---|
| **P4B_FIRST_PC** | **PASS** — `yarn test` 1326 in 36 files, `yarn test:db` 333 in 9 files; regression sweep 21/21 on the code head `35cf552`. R9 remediation: `yarn test` 1346 in 37 files, `yarn test:db` 340 in 9 files, sweep 21/21 on `b862cf7` (§25.10) | §16, `evidence/p4b-first-pc-sweep.txt`, `evidence/r9-first-pc-sweep.txt`; lint **0 warnings** |
| **P4B_CI** | **PASS** for `e2ce11d` (push run 36097731802; the new compiled `smoke:p4b`, 54 checks), `aa9ee2c` (push run 36099915631), the code head `35cf552` (push run 36104287781, both jobs success, `smoke:p4b` 54 checks) and the R9 submission head `6ff6775` (push run 36105169096; pull_request run 36106823445), all success; the post-merge `main` `eb83b19` (push run 36106838217, success, §24); the R9 remediation code head `b862cf7` (push run 36116320128, both jobs success, `smoke:p4b` 64 checks, §25.10). A commit cannot record its own run: the run of the R9 remediation documentation commit is reported with the R9-final report | CI runs `yarn test`, `yarn test:db`, `smoke:local`, `smoke:auth`, `smoke:directory`, `smoke:p3a`, `smoke:p3b`, `smoke:p4a` and the new compiled `smoke:p4b` (§16) |
| **P4B_BROWSER (Playwright MCP)** | **PASS** 27/27 (mission §27), with the reading-back of fact supports in scenario 15 **BLOCKED** by the reported contract gap (§1.2); one UI finding found and fixed (F1, §14). R9 read-back **PASS** 12/12 — the blocked part now verified (§25.8) | Isolated test browser against the compiled API on the disposable `tb_notice_test` (`evidence/p4b-playwright-mcp-verification.txt`, `evidence/r9-playwright-mcp-verification.txt`) |
| **P4B_NEGATIVE_CONTROLS** | **PASS** 63/63 (§15); R9 remediation **PASS** 21/21 (§25.9) | Every disabled protection made its responsible tests fail; files restored byte-identically; working tree identical before and after; `tb_notice_test` empty afterwards (`evidence/p4b-negative-controls.txt`, `evidence/r9-negative-controls.txt`) |
| **P4B_CONTRACT** | **NO WIRE CHANGE** in P4B — TB-SCHEMA-API-v1.1.0 stayed the active contract; one gap **REPORTED, not worked around**: no operation returns a fact's FactSource rows (§1.2, §19). Remediated by the additive release **TB-SCHEMA-API-v1.2.0** (R9 remediation, ADR-0005 **PROPOSED**, §25) | `contracts:check` OK; release and parity tests (§25.3) |
| **P4B_DATABASE** | **NO MIGRATION** — the initial schema already holds the five intake tables (§18); the R9 remediation made none either (§25.11) | `db:verify`, both drift diffs |
| **R9 review** | **PASS_WITH_ONE_CONTRACT_REMEDIATION** (operator, 2026-09-25) — P4B functionally accepted; the one remediation, the fact-support read-back (TB-SCHEMA-API-v1.2.0), is **IMPLEMENTED AND VERIFIED** on `feature/r9-fact-support-readback` (§25) and submitted for **R9 final (PENDING)** | §24, §25 |
| **P4B_STATUS** | **VERIFIED_COMPLETE_FOR_IMPLEMENTED_SCOPE** (the 22 contracted intake operations) | §24 |
| **P4B_MERGE** | **MERGED_TO_MAIN** — pull request #4, merge commit `eb83b19` (method: merge commit; merged by the operator 2026-09-25T07:16:46Z); `main` push CI run 36106838217 success. The R9 remediation is **not merged** | §24 |
| **P1_WINDOWS_BROWSER** | **NOT_RUN** (not reported) | Unchanged |
| **P0_SECOND_PC** / **P0_TWO_PC_ACCEPTANCE** / **P0_SINGLE_PC_BASELINE** / **P0_OVERALL** | **DEFERRED_BY_OPERATOR** / **NOT_COMPLETED** / **VERIFIED** / **NOT_COMPLETE** against the original two-PC contract | ADR-0003; unchanged by P4B |

`EXTERNAL_LEGAL_ACTIONS=0` · `REAL_CASE_DATA=0` · `YOUTUBE_FETCHES=0` · `G1_DECISIONS=0` · `G7_CREATED=0` · `READINESS_COMPUTED=0` · `DRIVE_WRITES=0` · `DEPLOYMENTS=0` · `REAL_TB_DATA_IN_GIT=0` · `REAL_ACCOUNTS_CREATED_BY_ENGINEER=0` · `RECORDS_WRITTEN_TO_OPERATOR_DB=0` · `SCHEMA_CHANGES=0` · `WIRE_CONTRACT_CHANGES=1` (the R9 remediation only: the additive release TB-SCHEMA-API-v1.2.0 with one read and two schemas, ADR-0005, §25; P4B itself made none) · `FROZEN_REFERENCE_CHANGES=0` · `ACCEPTED_RELEASE_RECORD_CHANGES=0` · `NEW_DEPENDENCIES=0`.

Persistent rules established by P4B (recorded in `CLAUDE.md`):

- **A ReportedItem is not an infringement finding.** It identifies one reported YouTube video item of one case — not that copying or infringement occurred, that permission is absent, who uploaded it or who owns anything.
- **A CaseWork is not ownership proof.** It records a work named for one case; it establishes no ownership, authorship, registration, standing or G2. Rights assertions are separate, scoped CaseFacts.
- **A UseMapping is not an infringement finding.** It records, as entered, which part of one work is reported to appear in which part of one reported item of the same case — not copying, infringement or audiovisual identity.
- **A CaseFact is explicit, case-specific, structured information.** It is recorded by an operator with its provenance exactly as supplied; nothing manufactures a fact.
- **Permission is never inferred from silence.** No permission source found is not "no permission"; a PERMISSION fact records only what was explicitly reported or reviewed.
- **Similarity alone is never infringement.** Equal durations, matching endpoints or an AV_COMPARISON record prove nothing by themselves.
- **Facts never cross Case boundaries.** Nothing of one case's intake material — item, work, mapping, fact or support — is read, used, copied or inherited by another case.
- **Revisions preserve history.** A fact is revised only at its current head; every earlier revision and its supports stay exactly as recorded and readable.
- **Source and provenance are pinned.** A support cites the exact source revision behind its case source link and a mapping its exact basis revision; a newer revision re-points nothing; provenance is never upgraded — DOCUMENT_REVIEWED only with a cited source that itself records a review.
- **P4B computes no readiness.** No intake record or state computes or implies G1–G7, READY_FOR_SIGNER or readiness.
- **TB-SCHEMA-API-v1.1.0 remains active.** P4B changed no wire contract; the FactSource read-back gap is reported for a separately approved release. (The R9 remediation proposes that release, TB-SCHEMA-API-v1.2.0 with ADR-0005, for R9 final; §25.)
- **Supports are read back exactly as recorded** (R9 remediation, §25). The supports of one fact revision are returned exactly as stored, for that revision only: never merged across revisions, never hidden after the link is paused or unlinked, never following a newer source revision, and never proof, a document review, SUPPORTED_FOR_SCOPE, a finding, G1–G7 or readiness.
- **No secrets and no real case data in Git.** Every fixture, test and browser record is synthetic.

> §1 was written from the contract, the domain model and the invariants before any P4B code; §2–§23 record the implementation and its verification; §24 records the R9 result and the merge, §25 the R9 remediation. Sections 1–23 keep the state at their time (for example "R9 PENDING" and the support gap).

## 1. Operation matrix and design (contract-first, produced before coding)

### 1.1 Exact contract scope

Read from the active contract TB-SCHEMA-API-v1.1.0 (`packages/contracts/openapi/openapi.json`, generated from `packages/contracts/src/**`; `contracts:check` OK) before any P4B code. All 22 expected operationIds exist exactly once; no other operation under `/cases/{caseId}/reported-items`, `/works`, `/mappings` or `/facts` exists. No wire change is needed or made.

Common to all 22: session cookie; every response `Cache-Control: no-store`; error statuses as contracted (reads 400/401/403/404/409/413/422/429/500; writes also 412 and 428); writes need `X-CSRF-Token`, the exact Origin and an `Idempotency-Key` (`x-idempotent-write: true`); `If-Match` is required exactly when `x-precondition-target` is set. `caseId` and `id` are uuid path parameters (36 characters). Lists: `limit` 1–100 (default 25), `cursor` (≤ 2000), `q` (≤ 200); `listCaseFacts` also `factType` (≤ 100).

| # | operationId | Method and path | Request | 2xx response | If-Match target | Idempotency-Key | Affected resource (meta) | References and sources | Disposition |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `listCaseReportedItems` | GET `/cases/{caseId}/reported-items` | — | 200 `ListCaseReportedItemsResponse` (`ReportedItemPage` of `ReportedItem`) | — | — | — | the path case | IMPLEMENT |
| 2 | `createReportedItem` | POST `/cases/{caseId}/reported-items` | `CreateReportedItem` {rawUrl, displayTitle?, observedAt?} | 201 `CreateReportedItemResponse` | `CaseRecord` | required | CaseRecord (row version) + ReportedItem | the path case; no source | IMPLEMENT |
| 3 | `getReportedItem` | GET `/cases/{caseId}/reported-items/{id}` | — | 200 `GetReportedItemResponse` + ETag | — | — | — | item of the path case | IMPLEMENT |
| 4 | `patchReportedItem` | PATCH `/cases/{caseId}/reported-items/{id}` | `PatchReportedItem` {displayTitle?, observedAt?} (≥ 1 field) | 200 `PatchReportedItemResponse` | `ReportedItem` | required | CaseRecord + ReportedItem | item of the path case | IMPLEMENT |
| 5 | `archiveReportedItem` | POST `/cases/{caseId}/reported-items/{id}/archive` | `ArchiveRequest` {reason} | 200 `ArchiveReportedItemResponse` | `ReportedItem` | required | CaseRecord + ReportedItem | item of the path case | IMPLEMENT |
| 6 | `restoreReportedItem` | POST `/cases/{caseId}/reported-items/{id}/restore` | `ArchiveRequest` {reason} | 200 `RestoreReportedItemResponse` | `ReportedItem` | required | CaseRecord + ReportedItem | item of the path case | IMPLEMENT |
| 7 | `listCaseCaseWorks` | GET `/cases/{caseId}/works` | — | 200 `ListCaseCaseWorksResponse` (`CaseWorkPage` of `CaseWork`) | — | — | — | the path case | IMPLEMENT |
| 8 | `createCaseWork` | POST `/cases/{caseId}/works` | `CreateCaseWork` {title, sourceUrl?, externalWorkId?, workType?, notes?} | 201 `CreateCaseWorkResponse` | `CaseRecord` | required | CaseRecord + CaseWork | the path case; no source | IMPLEMENT |
| 9 | `getCaseWork` | GET `/cases/{caseId}/works/{id}` | — | 200 `GetCaseWorkResponse` + ETag | — | — | — | work of the path case | IMPLEMENT |
| 10 | `patchCaseWork` | PATCH `/cases/{caseId}/works/{id}` | `PatchCaseWork` (the five fields, ≥ 1) | 200 `PatchCaseWorkResponse` | `CaseWork` | required | CaseWork (+ CaseRecord when material) | work of the path case | IMPLEMENT |
| 11 | `archiveCaseWork` | POST `/cases/{caseId}/works/{id}/archive` | `ArchiveRequest` | 200 `ArchiveCaseWorkResponse` | `CaseWork` | required | CaseRecord + CaseWork | work of the path case | IMPLEMENT |
| 12 | `restoreCaseWork` | POST `/cases/{caseId}/works/{id}/restore` | `ArchiveRequest` | 200 `RestoreCaseWorkResponse` | `CaseWork` | required | CaseRecord + CaseWork | work of the path case | IMPLEMENT |
| 13 | `listCaseUseMappings` | GET `/cases/{caseId}/mappings` | — | 200 `ListCaseUseMappingsResponse` (`UseMappingPage` of `UseMapping`) | — | — | — | the path case | IMPLEMENT |
| 14 | `createUseMapping` | POST `/cases/{caseId}/mappings` | `CreateUseMapping` {caseWorkId, reportedItemId, occurrence, source/reported Start/End Ms?, rawTimecodes?, boundaryConvention?, provenance?, basisSourceId?, limitations?} | 201 `CreateUseMappingResponse` | `CaseRecord` | required | CaseRecord + UseMapping | work AND item of the path case; basis SourceReference applicable to the case | IMPLEMENT |
| 15 | `getUseMapping` | GET `/cases/{caseId}/mappings/{id}` | — | 200 `GetUseMappingResponse` + ETag | — | — | — | mapping of the path case | IMPLEMENT |
| 16 | `patchUseMapping` | PATCH `/cases/{caseId}/mappings/{id}` | `PatchUseMapping` (times, rawTimecodes, boundaryConvention, provenance, basisSourceId, limitations; ≥ 1; work, item and occurrence are not patchable) | 200 `PatchUseMappingResponse` | `UseMapping` | required | CaseRecord + UseMapping | mapping of the path case; basis source | IMPLEMENT |
| 17 | `archiveUseMapping` | POST `/cases/{caseId}/mappings/{id}/archive` | `ArchiveRequest` | 200 `ArchiveUseMappingResponse` | `UseMapping` | required | CaseRecord + UseMapping | mapping of the path case | IMPLEMENT |
| 18 | `restoreUseMapping` | POST `/cases/{caseId}/mappings/{id}/restore` | `ArchiveRequest` | 200 `RestoreUseMappingResponse` | `UseMapping` | required | CaseRecord + UseMapping | mapping, its work and item unarchived; basis source re-checked | IMPLEMENT |
| 19 | `listCaseFacts` | GET `/cases/{caseId}/facts` | — | 200 `ListCaseFactsResponse` (`CaseFactPage` of `CaseFactSummary`) | — | — | — | the path case | IMPLEMENT |
| 20 | `createCaseFact` | POST `/cases/{caseId}/facts` | `CreateFact` (oneOf by `factType`: scope, typed `value`, provenance, resolution state, assertion metadata, `sources` 0–100 `FactSupport`) | 201 `CreateCaseFactResponse` (`CaseFact`, no ETag) | `CaseRecord` | required | CaseRecord + CaseFact (+ FactSource rows) | scope target of the path case; each `FactSupport.caseSourceId` a LINKED CaseSource of the path case | IMPLEMENT |
| 21 | `getCaseFact` | GET `/cases/{caseId}/facts/{id}` | — | 200 `GetCaseFactResponse` (any revision; no ETag) | — | — | — | fact of the path case | IMPLEMENT |
| 22 | `reviseCaseFact` | POST `/cases/{caseId}/facts/{id}/revisions` | `ReviseFact` (same shape as `CreateFact`) | 201 `ReviseCaseFactResponse` (`CaseFact`) | `CaseRecord` | required | CaseRecord + CaseFact (+ FactSource rows) | the current head of a chain of the path case; same fact type and scope | IMPLEMENT |

### 1.2 Contract gap found before coding (reported, not worked around)

`FactSource` — the stored support row of a fact (`id`, `factId`, `caseSourceId`, `supportRole`, `supportedAssertion`, `createdAt`, `createdById`) — is defined in the v1.1.0 schema catalog, but **no schema references it and no operation returns it**. `CaseFact`, `CaseFactSummary`, the create/revise responses and even `ProductionContext` carry no `sources`. `createCaseFact` and `reviseCaseFact` accept `sources` (contracted write), so the support rows are written and validated, but after the write the product cannot read back which case sources support a fact revision. This is the same class of gap as R8's CaseAuthorityCoverage read-back. As the mission directs (§36, stop condition D), the dependent branch — reading fact support back on the wire and showing it in the UI after a reload — is **stopped and reported** (§19); no uncontracted route or field, no AuditEvent parsing and no client-remembered state is used. Everything else in P4B is independent of it and proceeds.

### 1.3 Design decisions (service level; the contract is silent on them)

- **D1 URL normalization — recognize or reject (mission §13).** The contract fixes only that `rawUrl` is an http(s) URI; the frozen schema (DATABASE_SCHEMA_v1 ReportedItem, DOMAIN_MODEL_v1 §11, INVARIANTS §4) fixes that V1 accepts only YouTube video items, that `externalItemId` is the video id, case-sensitive and unique within one case, never globally, that host names may normalize to lowercase and that the raw URL is retained. The mission requires a STOP if normalization cannot be specified safely; it can, as a closed, offline recognizer (`apps/api/src/modules/cases/reported-url.ts`): accepted are `http(s)://(www.|m.)youtube.com/watch?…v=<id>…` with exactly one literally written `v` parameter, `…/shorts/<id>`, `…/live/<id>` and `http(s)://youtu.be/<id>`, where `<id>` is exactly 11 characters of `A–Z a–z 0–9 _ -`. Everything else is refused with 422 `REPORTED_URL_UNSUPPORTED` and a reason (`UNPARSEABLE`, `CREDENTIALS_IN_URL`, `PORT_IN_URL`, `NOT_YOUTUBE`, `NOT_A_VIDEO_URL`, `AMBIGUOUS_VIDEO_ID`, `INVALID_VIDEO_ID`) — never guessed (no `music.`, `youtube-nocookie`, `/embed/`, `/v/`, look-alike or percent-encoded forms). The id keeps its character case; only the host is lowercased (by the URL parser). `normalizedUrl` = `https://www.youtube.com/watch?v=<id>`; other query parameters and the fragment stay only in the raw URL. Nothing is fetched: no availability, title, channel or uploader is looked up.
- **D2 One item per video within a case.** A second item for the same `externalItemId` in the same case (archived or not, any spelling) is 409 `DUPLICATE_REPORTED_ITEM` naming the existing item (the binary unique key `(case_id, external_item_id)` is the backstop). The same video in another case is that case's own, independent record — nothing is linked, copied or matched across cases.
- **D3 Materiality and the case's context revision (mission §23).** Every intake write locks the case and moves its `rowVersion`. Its `contextRevision` moves with every material change: every create, archive, restore and fact revision, every reported-item and mapping edit, and a work edit of `title`, `sourceUrl`, `externalWorkId` or `workType`. A work's `notes` alone are not case context (like the case's own notes) and leave the case untouched. A PATCH that changes nothing writes nothing, reads never write.
- **D4 Lock order.** CaseRecord (FOR UPDATE, always first) → CaseSource → CaseWork → ReportedItem → UseMapping → CaseFact → SourceReference (`modules/directory/records.ts`), so the writes of one case are serialized and a child's state read under the case lock is current.
- **D5 Children through their case.** Every read and write of a child finds it only through the case of the path: another case's child is 404, identical to an unknown one, before any precondition. A record named in a body (a mapping's work and item, a fact's scope target, a support's case source) must exist (422 `REFERENCE_NOT_FOUND`), belong to this case (422 `CROSS_CASE_REFERENCE`, the frozen stable code) and, for work, item and mapping, be unarchived (409 `RECORD_STATE_CONFLICT`); for a mapping's parties and a fact's scope target the composite foreign keys `(…_id, case_id)` are the backstop, for a support's case source only the service rule (§18).
- **D6 Timecodes.** Unsigned integer milliseconds as decimal strings: the contract pattern admits up to 16 digits, the service refuses values above 9007199254740991 (422 `VALIDATION_FAILED`; the database CHECK is the backstop); BIGINT UNSIGNED storage, never SQL TIME. Unknown bounds stay null and are never fabricated; a known end must exceed its known start (422 `TIME_RANGE_INVALID` naming both fields), checked on the merged state of a PATCH. `rawTimecodes` are kept as supplied and never parsed or reconciled; `boundaryConvention` is `UNKNOWN` (default), `HALF_OPEN` or `INCLUSIVE`. `occurrence` is explicit (≥ 1); one mapping per (work, item, occurrence) — 409 `DUPLICATE_USE_MAPPING` naming the existing mapping.
- **D7 Provenance.** Stored exactly as supplied; a mapping without one is `MISSING`, a fact's resolution state without one is `UNASSESSED`. `DOCUMENT_REVIEWED` needs a cited source that itself records an attributed review — a mapping's basis source (422 `REVIEW_UNSUPPORTED` `NO_BASIS_SOURCE` / `SOURCE_NOT_REVIEWED`), at least one of a fact's supporting sources (`NO_REVIEWED_SOURCE`) — the permanent R6 rule. Citing a reviewed source upgrades nothing: neither the record's provenance or resolution state nor the source.
- **D8 Fact scope and revisions.** `CASE` names no record; `WORK`, `REPORTED_ITEM` and `USE` name exactly their record (422 `FACT_SCOPE_INVALID` `TARGET_REQUIRED` / `TARGET_NOT_ALLOWED`). A revision is recorded only at the current head of its chain (409 `REVISION_NOT_HEAD` naming the head) and keeps the chain's fact type and scope (422 `REVISION_SCOPE_CHANGE` naming the fields — a different type or scope is a new fact, not a reparenting). Revision + 1 supersedes the head; earlier revisions and their supports never change. The list shows each chain's current head (a superseded revision is reached by id, or by `q=<factGroupId>` which finds the head); `getCaseFact` returns any revision of this case.
- **D9 Fact supports.** Each support names a LINKED CaseSource of this case (PAUSED / UNLINKED 409), each (case source, support role) once (422), and the source revision behind the link must still apply to the case (`source-scope.ts`). The support is pinned through the link, which itself pins one exact source revision.
- **D10 DUPLICATE_REVIEW.** `relatedCaseIds` must name other existing cases, each once (422 / 422 `REFERENCE_NOT_FOUND`); nothing of them is read, copied or changed. Being named makes the related case "referenced" for the delete-safety check (the fact's JSON value is a snapshot column).
- **D11 Archive.** Administrative, with a reason, no cascade: mappings and facts that name an archived work or item stay as they are. An archived record is read-only except restore, and no new mapping or fact can name it. A mapping is not edited or restored while its work or item is archived; restore re-checks its basis source. Under an archived case everything is read-only.
- **D12 Route correction.** A P4A route correction (allowed only before history) now also re-checks the basis source of every unarchived mapping, like every other source the case relies on.
- **D13 Audit.** One audit event per write, in the same transaction (a failing audit rolls back the write, its supports, the case version and the idempotency claim). Free text that may quote case material keeps only its length: a work's notes, a mapping's limitations, a fact's scope text, limitations and change reason, a support's supported assertion; a fact's typed value is recorded as its length.
- **D14 Error codes.** P4B implementation codes in the free-string `code` field with the contracted statuses (R6 interpretation 10): `REPORTED_URL_UNSUPPORTED` (422), `DUPLICATE_REPORTED_ITEM` (409), `DUPLICATE_USE_MAPPING` (409), `TIME_RANGE_INVALID` (422), `FACT_SCOPE_INVALID` (422). Reused: `CROSS_CASE_REFERENCE` (frozen stable), `REFERENCE_NOT_FOUND`, `RECORD_STATE_CONFLICT`, `REVISION_NOT_HEAD`, `REVISION_SCOPE_CHANGE`, `REVIEW_UNSUPPORTED`, `VALIDATION_FAILED`, `PRECONDITION_REQUIRED`, `RECORD_VERSION_CONFLICT`.
- **D15 No migration.** The initial schema already has `reported_items`, `case_works`, `use_mappings`, `case_facts` and `fact_sources` with unique `(id, case_id)` keys, composite foreign keys, the other unique keys and the CHECKs (§18). `records.ts` gained the four intake types in the lock order and their direct references, so delete safety counts intake references (a case with intake material is not an unused case).

## 2. Implementation (commits)

| Commit | Content |
|---|---|
| `e77f809` | R8 closeout checkpoint (documentation only; before any P4B code) |
| `99e6907` | API: the 22 operations — services, rules, views, controller, error codes, lock order and references; `tests/db/p4b-http.test.ts`, `tests/api/intake-rules.test.ts` |
| `b3a948c` | CI: the compiled `smoke:p4b` flow (CI only); the P4A and general smokes now name correspondence as the first unrouted phase |
| `e2ce11d` | `ui:sandbox` guards and cleans the intake tables |
| `64c33d4` | UI: the four intake sections, detail/new/edit pages, fact revisions and history; `tests/web/p4b.test.tsx`, fake intake endpoints in `tests/web/support.tsx` |
| `aa9ee2c` | Route-level code splitting of the page modules (§13); `tests/web/routing.test.tsx` |
| `f952b73` | Browser finding F1: "Load latest version" keeps typed entries and clears the conflict notice |
| `900c0ea` | Tests that make the §33 negative controls decidable: every admitted instant spelling round-trips exactly, a reviewed support or basis upgrades nothing, a newer source revision re-points no mapping basis, the UI sends provenance and resolution as chosen |
| `35cf552` | `ui:sandbox` header comment names the case intake pages (comment only) |
| R9 submission commit | This record, the evidence, `CLAUDE.md`, `CURRENT_STATE.md` (documentation only) |

Nothing was merged, tagged or released; no history was rewritten.

## 3. ReportedItem semantics

`POST /cases/{caseId}/reported-items` with the case's If-Match. `rawUrl` is stored exactly as supplied (the UI trims only the spaces typed around it before sending); `normalizedUrl` and `externalItemId` are derived by D1; `displayTitle` and `observedAt` are stored as supplied (`observedAt`: the R7 storability rule — every spelling the format admits is stored as exactly its instant, anything the column cannot hold is 422 before any write). PATCH changes only `displayTitle` and `observedAt` with the item's own If-Match (an equal instant in another spelling is a no-op); the URL and what is derived from it never change. Archive/restore per D11. The list returns one case's items, archived included, newest first; `q` = exact item id or video id (case-sensitive), or a literal, case- and accent-insensitive substring of the title or raw URL (discovery only). No infringement, permission, uploader, ownership or notice meaning; nothing else is created.

## 4. URL normalization

D1. Unit tests (`tests/api/intake-rules.test.ts`) cover every accepted shape (both hosts' variants, `/shorts/`, `/live/`, `youtu.be`, extra parameters, a fragment) and every refusal reason, including look-alike hosts (`www.youtube.com.evil.example.invalid`, a Cyrillic `у`), `youtube.com.`, `music.youtube.com`, `youtube-nocookie`, `/embed/`, `/v/`, `/watch/<id>`, `?V=`, `/WATCH`, credentials, ports, a repeated or percent-encoded `v`, and ids of the wrong length or alphabet. The HTTP suite checks the same over the wire and that two ids differing only in case are two items. The UI shows the reason on the field ("That is not the address of one video … Nothing was fetched.").

## 5. CaseWork semantics

`title`, `sourceUrl`, `externalWorkId`, `workType` and `notes` exactly as supplied; nothing is inferred (no owner, subject, rights holder or registration) and nothing is matched or de-duplicated by title or URL, within a case or across cases — two identical-looking works are two records. PATCH with the work's If-Match; D3 for materiality. Archive/restore per D11. The UI states that a work "does not establish ownership, authorship, registration or any right: rights assertions are separate, scoped facts".

## 6. UseMapping and timecodes

One work and one reported item of the same case, an explicit occurrence, times per D6, provenance and basis per D7, limitations as supplied. PATCH (times, raw timecodes, convention, provenance, basis, limitations) with the mapping's If-Match — the work, item and occurrence are not patchable; it still moves the case's context revision (API_CONTRACT_v1 §6). The UI turns typed clock text ("1:02:03.5", "25:01:01.001") into exact milliseconds only by an explicit "Use … ms" action (BigInt arithmetic, no floating point, no rounding), keeps the text as stated next to the value, refuses non-whole milliseconds and an end not after its start before sending, and shows each bound as `h:mm:ss.mmm (N ms) — as stated: "…"`. A mapping is "shown as recorded, not as an infringement verdict: similarity alone is never infringement".

## 7. CaseFact types and revisions

The nine contracted fact types, each with its typed value validated by the contract (`RIGHTS_BASIS`, `RIGHTS_SCOPE`, `PERMISSION`, `AV_COMPARISON`, `EXCEPTION_REVIEW`, `WORK_IDENTIFICATION`, `REPORTED_IDENTIFICATION`, `DUPLICATE_REVIEW`, `AUTHORITY_CURRENTNESS`), the four scope kinds (D8), provenance and `rawProvenance`, `resolutionState` as supplied (default `UNASSESSED`; a MISSING or CONFLICT provenance and a CONFLICT resolution stay exactly that; `SUPPORTED_FOR_SCOPE` is never set automatically), `assertedByLabel`, `assertedAsOf` (R7 storability), `scopeText`, `limitations` and a required `changeReason`. Facts are immutable (no ETag); create and revise take the case's If-Match. Revisions per D8; WITHDRAWN is a revision, not a deletion. AUTHORITY_CURRENTNESS is a recorded assertion — nothing computes currentness, and its `asOf` is kept as the supplied string. The UI offers exactly the value fields of the chosen type (enumerations as choices, text as entered, instants in local time with an untouched recorded instant sent back exactly), locks type and scope on a revision, marks earlier revisions "Superseded revision" with the revise action unavailable, and lists the chain's history.

## 8. Provenance and source rules

D7, D9. Mapping basis and fact supports go through the one source-scope rule set (`modules/sources/source-scope.ts`): an agency's own source or an agency-less source naming the agency, a case-scoped source only for the cases it names (`CROSS_CASE_REFERENCE`), a subject-scoped source only with a bound route naming its subject, never another owner's material. A newer SourceReference revision re-points no link, support or basis (tested over HTTP and in the browser, scenario 18). The UI offers only LINKED links of this case as supports and only sources whose scope includes the case as basis, labels every source with its exact revision and recorded provenance, keeps "Document reviewed" unavailable until a reviewed source is chosen, and says "A support never upgrades provenance".

## 9. Case isolation

D5 on every read and write; lists filter by the path's case; the only cross-case reference P4B accepts is a DUPLICATE_REVIEW's `relatedCaseIds` (D10), which reads nothing of the other case. In the UI every intake page is keyed by its case (and record) id, so nothing loaded, chosen or typed for one case is shown for another (§12, negative controls NC-P4B-16a/b); the case page's intake sections are loaded per case id and version.

## 10. contextRevision

D3. The HTTP suite checks, one write at a time, that each material create, edit, archive, restore and revision moves the case's `rowVersion` and `contextRevision` exactly once, and that reads, no-ops, a work's notes and refused writes move nothing (NC-P4B-14a–c).

## 11. Shared write layer: ETag, idempotency, audit

All 14 conditional P4B writes go through `WriteExecutor`: the contract body parse (422), `Idempotency-Key` (400), `If-Match` exactly as contracted — the case's ETag for the three creates and the two fact writes, the record's own for patch/archive/restore (428 missing; 412 stale, foreign, weak or parent/child mismatch) — then one READ COMMITTED transaction with the lock order (D4), the business rules, the change, the case touch, the audit event and the idempotency completion. An exact replay returns the stored result once (a fact replay creates no second support row); the same key with another body is 409; a refused request is never stored; a running claim is 409 with Retry-After. A failing audit insert rolls back every one of the 14 writes. Two tabs: one winner per ETag; three competing fact revisions keep one head; a case change and a child creation with one case ETag never interleave.

## 12. UI

The case page shows four sections — **Reported items**, **Works**, **Use mappings**, **Facts** — each with its neutral meaning, its records of this case only, and an unavailable (not hidden) add action with its reason when it cannot be used (an archived case; no work or item yet for a mapping). Pages: new / detail / edit for items, works and mappings; new / detail (with the revision history) / new revision for facts (12 routes under `/cases/:id/…`). Tables: *Reported item · Video id · Address as entered · Observed · State*; *Work as recorded · Work type · External work id · Source address · State*; *Work → reported item (as recorded) · Occurrence · In the work · In the reported item · Recorded provenance*; *Fact type · About · Recorded provenance · Resolution state (as recorded) · Revision · Recorded*, with a fact-type filter. Wording never says infringing, owned, verified, authorized, approved, valid, G1/G7, ready or eligible (web tests scan pages and stamps). The fact page states the contract gap for supports (§1.2) instead of pretending. Accessibility and resilience follow P2–P4A: labelled fields with hints and errors, focus to the first invalid field or to the alert, modal reason dialogs, conflict notices with "Load latest version" (F1), safe not-found for another case's record, 390px without page scroll.

## 13. Bundle and code splitting (mission §25)

Measured with `yarn build` (Vite 8, rolldown):

| Build | JavaScript | Vite advisory |
|---|---|---|
| P4A head `ab56139` (before P4B) | one chunk 552.78 kB (gzip 152.05 kB) | > 500 kB warning |
| P4B UI `64c33d4`, before splitting | one chunk 635.01 kB (gzip 169.83 kB) | > 500 kB warning |
| `aa9ee2c`, route-level lazy loading | entry 319.26 kB (gzip 99.57 kB) + 21 lazily loaded chunks of 2.60–38.82 kB | none |
| code head `35cf552` (after F1) | entry `index-CBAh7S6o.js` 319.26 kB (gzip 99.57 kB) + 21 lazily loaded chunks of 2.60–38.82 kB; the P4B ones: works 12.05, reported-items 13.04, mappings 19.93, facts 27.45 kB, the shared intake wording 5.18 kB | none |

The 21 lazily loaded chunks are the page modules plus three UI modules they share (`case-ui`, `intake-ui`, `authority-ui`); the `aa9ee2c` commit message says "22 page chunks" — it counted every JavaScript file including the entry (history is not rewritten). The threshold was not raised. Page modules load through `React.lazy` (one small `pagesOf(import)` helper in `App.tsx`); the login page, session check, shell, home page, the directory and representation layouts and the providers stay in the entry. Suspense boundaries sit in the shell's main area and in the two layouts ("Loading page…"). `tests/web/routing.test.tsx` checks a direct address of a lazily loaded page, the redirect to Login without a session (no page module's records requested) and history back/forward between pages of different modules; the browser pass confirmed the same (scenarios 19, 27) and that `smoke:local` still finds everything it checks in the entry chunk.

## 14. Browser verification (Playwright MCP, mission §27)

`evidence/p4b-playwright-mcp-verification.txt`: 27/27 scenarios on `yarn ui:sandbox` (compiled API, disposable `tb_notice_test`, synthetic user, isolated headless browser), 2026-09-25T05:47Z–06:08Z, 18 screenshots under `evidence/screenshots/`, teardown verified (`db:verify test --expect-empty`, 0 domain rows). Scenario 15 shows provenance exactly; showing supports after a reload is BLOCKED by §1.2 and the page says so. **F1** (scenario 24): after a stale case ETag on a new item, work or mapping, "Load latest version" kept the typed entries but not the notice's dismissal, and the new-fact form lost what was typed — fixed in `f952b73` (the create pages clear the submission state on reload; the fact pages keep the loaded context while the case reloads), covered by two web tests and NC-P4B-17a/b, re-verified in the browser.

## 15. Negative controls (mission §33)

`evidence/p4b-negative-controls.txt`: 63 controls, each disabling exactly one protection (or injecting the forbidden behaviour) in the API, the shared write layer or the UI; every responsible command failed and named the failing test, and every file was restored byte-identically (SHA-256). Groups: child case filter (9), cross-case references (3), URL normalization (4), timestamp storability (6), millisecond bounds/order (4), provenance auto-upgrade (7), DOCUMENT_REVIEWED support check (4), fact scope/target (3), fact history (4), source revision auto-follow (2), ETag (4), idempotency (2), audit rollback (2), contextRevision (3), the "UseMapping = infringement" wording guard (2), UI Case A/B state contamination (2), F1 (2). Before the run, the tests were strengthened where a control showed that no test would have caught the forbidden behaviour (`900c0ea`): an instant written through V8's or Prisma's string parser, provenance or resolution upgraded by a reviewed support or basis, a mapping basis following a newer source revision, and the UI sending an upgraded provenance or resolution.

## 16. Tests, regression and CI

New tests (all synthetic):

| File | Tests | Covers |
|---|---|---|
| `tests/db/p4b-http.test.ts` | 32 | The 22 operations over real HTTP on `tb_notice_test`: reported items 5, works 3, mappings 5, facts 8, context revision 1, contamination 2, shared write layer 5 (If-Match for all 14 conditional writes, Idempotency-Key for every write family, in-progress claims, two tabs and concurrent writers, audit rollback of all 14), security/contract 3 (session, CSRF and Origin before any mutation; later phases unrouted and no later-phase record written; every collected response checked against its contract operation — status, schema, ETag rules, no readiness vocabulary — and all 22 operations exercised) |
| `tests/api/intake-rules.test.ts` | 56 | URL normalization (every accepted shape and refusal reason), millisecond bound and interval rules, boundary conventions, fact scope and request-only checks, audit redaction of a support's assertion |
| `tests/web/p4b.test.tsx` | 20 | The intake UI against the synthetic in-memory API: exact payloads and preconditions, addresses and times as entered, this case's records only, provenance as chosen, fact revisions and history, the support gap notice, neutral wording, safe not-found, case A/B isolation, an archived case, F1 |
| `tests/web/routing.test.tsx` | 3 | Route-level code splitting: direct address, auth redirect, back/forward |

Totals on the code head `35cf552`: **`yarn test` 1326 in 36 files** (R8 final: 1247 in 33) and **`yarn test:db` 333 in 9 files** (R8 final: 301 in 8) — home PC and CI identical.

Regression sweep (mission §37; `evidence/p4b-first-pc-sweep.txt`), 2026-09-25T06:45:27Z–06:50:27Z on `35cf552`, every step exit 0 (**21/21**): `reference:check`, `reference:helper-tests` (27/27), `contracts:check`, `install --immutable`, `typecheck`, `lint` and `oxlint --deny-warnings --format default` ("Found 0 warnings and 0 errors."), `format:check`, `test`, `test:db`, `db:verify test --expect-empty`, `db:verify dev` (5 domain rows, unchanged since R8 — nothing written to `tb_notice_dev`), `db:status test` / `dev`, both drift diffs (empty migrations), `build` (no advisory), `smoke:local` (41 checks, including the intake routes behind session and Origin and correspondence unrouted), `dev:verify-shutdown` (4/4), then `reference:check` and `db:verify test --expect-empty` again. `yarn test:transition-baseline` is not a gate and fails by design (ADR-0004); it was not "fixed".

CI (`evidence/p4b-ci-run-36104287781.txt`): push runs on this branch 36094782736 (`1d91c41`), 36095162287 (`e77f809`), 36097731802 (`e2ce11d`, `smoke:p4b` 54 checks), 36099915631 (`aa9ee2c`) and 36104287781 (`35cf552`: lint 0 warnings, `yarn test` 1326, `yarn test:db` 333, `smoke:local` 41, `smoke:auth` 4, `smoke:directory` 14, `smoke:p3a` 24, `smoke:p3b` 36, `smoke:p4a` 50, `smoke:p4b` 54, clean `yarn dev` shutdown 4/4) — all success. The compiled `smoke:p4b` (CI only; it writes synthetic records into CI's disposable `tb_notice_dev`) runs login → agency, source, owner, subject, route → case bound to the route → reported item (raw URL kept; id derived, case kept) → work → mapping (exact millisecond strings) → case source link → fact with a support → revision 2 → revision 1 read back unchanged → a newer source revision re-points neither the link nor the facts → item PATCH/archive/restore → refusals (another case's item 404, another case's work 422 `CROSS_CASE_REFERENCE`, a non-video address 422 `REPORTED_URL_UNSUPPORTED`, a stale ETag 412, a revision of the old head 409 `REVISION_NOT_HEAD`) → no readiness, G1–G7, production or correspondence route or field → logout; nothing fetches the reported address.

## 17. Contamination tests (mission §32)

`tests/db/p4b-http.test.ts` › CONTAMINATION, on two cases of one agency and one route with the same video and the same work title: A's item, work, mapping and fact are 404 through B exactly like unknown records; every write through B (patch, archive, revision) is 404 before any precondition; B cannot use A's work or item in a mapping, A's work, item or mapping as a fact scope, or A's source link as a support (422 `CROSS_CASE_REFERENCE` each, nothing written); B's lists show only B's own same-video item and same-title work, no mapping and no fact; archiving and revising in A change nothing in B. Also: a case's fact never scopes to another case's child (FACT scope test), a newer source revision re-points nothing, and a route correction re-checks the mapping basis sources. In the UI: the case page and every intake form rebuilt per case (A's typed entries and choices never offered in B), and another case's record address shows a safe not-found with nothing of the record.

## 18. Database changes

None. No migration, no schema change, no new dependency; `20260923103912_initial_schema` (sha256 `b54c36fd…426515`) stays the only migration. The intake tables already existed: `reported_items` (unique `(case_id, external_item_id)` binary), `case_works`, `use_mappings` (unique `(case_work_id, reported_item_id, occurrence)`; CHECKs for both intervals, the millisecond bound, the boundary convention, occurrence ≥ 1), `case_facts` (unique `(fact_group_id, revision)` and `supersedes_fact_id`) and `fact_sources` (unique `(fact_id, case_source_id, support_role)`). Each intake child carries a unique `(id, case_id)` key; a mapping's work and item and a fact's work, item or mapping are composite foreign keys `(…_id, case_id)` onto it, so the database itself cannot store a reference to another case's record. `fact_sources.case_source_id` is a single-column foreign key: that a support's CaseSource belongs to the fact's case is a service rule (INVARIANTS §3), enforced and tested (NC-P4B-02b). `db:verify` (test and dev) and both drift diffs pass (§16).

## 19. Contract changes and the reported gap

**None** — TB-SCHEMA-API-v1.1.0 is unchanged and active; `amendment.json` untouched; `AppMeta.schemaRelease` unchanged; the generated artefacts are unchanged (`contracts:check`). The one gap (§1.2) stops only its dependent branch: a fact's supports are written, validated and audited, but cannot be read back. **Proposed (not implemented, needs an approved additive release, e.g. TB-SCHEMA-API-v1.2.0 with an ADR):** a read-only, case-scoped `GET /cases/{caseId}/facts/{id}/sources` returning exactly the stored FactSource rows of that one revision (`id`, `factId`, `caseSourceId`, `supportRole`, `supportedAssertion`, `createdAt`, `createdById`, in a deterministic order), 404 for another case's fact exactly like an unknown one, no ETag, nothing resolved or followed (the link's pinned source revision is read through `getCaseSource`). Until then the UI says the supports cannot be shown.

## 20. Interpretations for R9 review

1. URL normalization as a closed recognizer (D1): only the four YouTube shapes; everything else refused with a reason rather than guessed.
2. One reported item per video within a case, archived or not (D2); across cases no uniqueness.
3. A work's notes are not case context (D3), like the case's own notes; every other intake change is.
4. The millisecond bound 9007199254740991 is enforced by the service (the contract pattern admits 16 digits), with the database CHECK as backstop (D6).
5. `DOCUMENT_REVIEWED` on a fact needs at least one supporting source that records a review (D7); on a mapping, its basis source.
6. The fact list shows current heads only; `q=<factGroupId>` finds a chain's head; `getCaseFact` returns any revision (D8).
7. A DUPLICATE_REVIEW's related case counts as referenced for delete safety (D10).
8. Restoring a mapping needs its work and item unarchived and re-checks its basis (D11); a route correction re-checks mapping basis sources (D12).
9. The FactSource read-back gap is reported, not worked around (§19).

## 21. Deviations, warnings and limitations

- **Contract gap** (§1.2, §19): fact supports cannot be read back; scenario 15's support display is BLOCKED.
- **Observation (not fixed; P4A scope):** the P4A "Link a source" page keeps its conflict notice after "Load latest version" — the F1 pattern (`case-sources.tsx`). Recorded for a later fix.
- MySQL's JSON type returns `rawTimecodes` object keys in its own order; values are exact and the UI reads them by name.
- `yarn test:transition-baseline` fails by design since the first contract edit (ADR-0004); not a gate, not "fixed".
- Mission §24 asks the fact UI to show the source supports: they are entered and sent with the fact, but cannot be shown after a reload (contract gap); the page says so instead.
- The browser pass's prerequisite script (scratchpad) failed on the final logout's empty 204 body after every record was created; the ids were read back with a read-only script — nothing was created twice (evidence file).
- Negative controls: runs 1 and 2 are kept in the evidence history; the final is run 3, after a diagnostics-only change to the P4B DB test helpers (§15).
- A commit cannot record its own CI run: the run of the R9 submission (documentation) commit is reported with the R9 report.

## 22. Blockers

None for R9. The contract gap blocks only the reading-back of fact supports (§19), which needs an approved contract release.

## 23. Proposed next phase (not started)

**P4C — Correspondence** (proposed name; gate R10; needs its own explicit, approved mission): the five contracted Correspondence operations — `captureCorrespondence` (POST `/correspondence`), `listCorrespondence`, `getCorrespondence`, `bindCaseCorrespondence` (POST `/cases/{caseId}/correspondence-bindings`) and `listCaseCorrespondenceBindings` — recording correspondence exactly as supplied and binding it to one case (and, where the contract allows, to that case's reported items) under the same case-isolation, pinning and provenance rules; no mailbox access, SMTP, sending, uploader contact or Drive write. Excluded: production context, prompts, candidates, validation, assessments, readiness, G1–G7, READY_FOR_SIGNER, signing and sending. Whether the FactSource read-back (§19) is added first — as an R9 remediation in an additive release with an ADR, like R8's — is the operator's decision at R9. Nothing of it is started.

## 24. R9 result and merge reconciliation (2026-09-25, home PC)

Mission TB_R9_FACT_SOURCE_READBACK_REMEDIATION_TO_R9_FINAL, §1–§2. Recorded on `feature/r9-fact-support-readback`. Sections 1–23 keep the state at their time.

### 24.1 Result (operator)

| Item | Recorded value |
|---|---|
| **R9** | **PASS_WITH_ONE_CONTRACT_REMEDIATION** (2026-09-25) — P4B functionally accepted; the one blocker is the FactSource read-back gap (§1.2, §19) |
| Remediation | Directed: the smallest additive read under a new additive release with an ADR (expected TB-SCHEMA-API-v1.2.0) — implemented in §25, submitted for **R9 final (PENDING)** |
| **P4B** | **VERIFIED_COMPLETE_FOR_IMPLEMENTED_SCOPE** (the 22 contracted intake operations) and **MERGED_TO_MAIN**; R9 stays **PASS_WITH_ONE_CONTRACT_REMEDIATION** until the operator's final review |
| Constraints | The merge is not reverted or rewritten; P4C is not started |

### 24.2 Merge reconciliation (verified with `git` and authenticated `gh`, not assumed)

| Item | Observed value |
|---|---|
| `P4B_SUBMITTED_HEAD` | `6ff6775d6d93bb7feaf5b024445bffb0788bcfcc` — the R9 submission (documentation on the code head `35cf552`); push run [36105169096](https://github.com/TuongChris/tb-notice-production-system/actions/runs/36105169096) success (2026-09-25T06:56:24Z–07:01:51Z, both jobs) |
| Pull request | [#4](https://github.com/TuongChris/tb-notice-production-system/pull/4) `feature/p4b-case-intake` → `main`, "Feature/p4b case intake", 10 commits, `headRefOid` = `6ff6775`; opened 2026-09-25T07:16:32Z and merged 07:16:46Z by the repository owner's account. Its pull_request run [36106823445](https://github.com/TuongChris/tb-notice-production-system/actions/runs/36106823445) started 07:16:37Z and completed **success** at 07:22:09Z — after the merge; the exact head had already passed its push run above |
| `P4B_MERGE_METHOD` | **merge commit** (not squash, not rebase): `eb83b19` has two parents, `1d91c41` (previous `main`) and `6ff6775`; message "Merge pull request #4 from TuongChris/feature/p4b-case-intake" |
| `P4B_MERGED_MAIN_HEAD` | `eb83b19d224c0c7e6bf1bd7de5c21bd3c2e0c361` |
| Ancestry / content | `1d91c41` is an ancestor of `6ff6775` (the branch started there), so the merge introduced nothing else: the trees of `eb83b19` and `6ff6775` are identical (`80a3f4fd62b2ce0ec11176b60d7e224c8dcef0a3`), and `git log 6ff6775..origin/main` lists only the merge commit |
| `MAIN_POST_P4B_CI` | **PASS** — push run [36106838217](https://github.com/TuongChris/tb-notice-production-system/actions/runs/36106838217) on `eb83b19`, 2026-09-25T07:16:48Z–07:22:01Z: "Non-DB checks (cold install)" (job 107981183058) and "Database, seed and smoke (MySQL 8.4.11)" (job 107981183086) both success — `reference:check` OK, `contracts:check` OK, lint "Found 0 warnings and 0 errors.", `yarn test` 1326 / 36 files, `yarn test:db` 333 / 9 files, migration replay and metadata verification, seed digest unchanged, both drift diffs empty, `smoke:local` 41, `smoke:auth` 4, `smoke:directory` 14, `smoke:p3a` 24, `smoke:p3b` 36, `smoke:p4a` 50, `smoke:p4b` 54, the P1.1 recovery checks, `yarn dev` clean shutdown 4/4 (`evidence/r9-ci-run-36116320128.txt` §1) |

Nothing was amended, rebased, rewritten or force-pushed, and no tag or release was created. `feature/p4b-case-intake` stays at `6ff6775`. The local `main` branch was not updated (it stays at `1d91c41`); the remediation branch was created from `origin/main` (`eb83b19`). No commit was made on `main`.

## 25. R9 remediation — the fact-support read-back (TB-SCHEMA-API-v1.2.0)

Mission TB_R9_FACT_SOURCE_READBACK_REMEDIATION_TO_R9_FINAL, 2026-09-25 (UTC), home PC. Submitted for **R9 final (PENDING)**: no merge of the remediation and no P4C.

### 25.1 Scope and branch

- **Directed** (R9 result): the smallest additive read, preferred `GET /cases/{caseId}/facts/{id}/sources`, in a new additive release with an ADR composed on the accepted v1.1.0. The frozen v1.0.0 pack (`docs/reference/**`) and the accepted v1.1.0 record (`docs/contracts/TB-SCHEMA-API-v1.1.0/amendment.json`) are never edited; `PFC-YT-EMAIL-v1.1` and `AppMeta.schemaRelease` are unchanged; `GetCaseFactResponse` is not modified.
- **Excluded, and not used:** AuditEvent parsing, client-side remembered state, database queries from the UI, uncontracted data in `GetCaseFact`, present-day source inference.
- **Branch.** `feature/r9-fact-support-readback`, created from the exact `origin/main` `eb83b19` (not from `feature/p4b-case-intake`) and pushed with upstream. At creation local and origin pointed at `eb83b19`, the worktree was clean, and `reference:check` and `contracts:check` passed; branch-creation push run [36113092678](https://github.com/TuongChris/tb-notice-production-system/actions/runs/36113092678) success.

### 25.2 The new operation (exact)

| Item | Value |
|---|---|
| operationId | `getCaseFactSources` (tag `Fact`) |
| Method and path | GET `/cases/{caseId}/facts/{id}/sources` — path parameters `caseId`, `id` (uuid, 36 characters; `id` is the fact revision, as in `getCaseFact` and `reviseCaseFact`) |
| Request | none (no body, no query) |
| Success | 200 `GetCaseFactSourcesResponse` = `{ data: CaseFactSourcesView, meta: ResponseMeta }` (strict) |
| Read model | `CaseFactSourcesView` = `{ factId: uuid, sources: FactSource[0..100] }` (strict; references only the unchanged v1.0.0 `FactSource` and `ResponseMeta`) |
| Errors | 400/401/403/404/409/413/422/429/500 (those of `getCaseFact`) |
| Security | session cookie; `x-precondition-target: null`; `x-idempotent-write: false` |
| ETag / If-Match / Idempotency-Key | none / none / none — a read; nothing is mutated |

**Naming follows the contract's conventions** (ADR-0005 decision 3). It is a `get*` returning a `*View`, like v1.1.0's `getCaseAuthoritySelection`, not a paginated `list*`: every one of the 27 frozen `list*` operations takes `limit`, `cursor` and `q` and returns `{ items, nextCursor }`, whereas this read returns the complete, bounded set of one revision's rows. `sources` mirrors the `sources` field of `CreateFact` / `ReviseFact`, through which the rows are written; `factId` names the revision, so an empty list still says which revision has none. The path is the mission's preferred one.

### 25.3 Release, immutability and compatibility

- **New release.** **TB-SCHEMA-API-v1.2.0**, additive (semantic minor) = the accepted TB-SCHEMA-API-v1.1.0, unchanged (the frozen v1.0.0 reference + the ADR-0004 amendment), plus `docs/contracts/TB-SCHEMA-API-v1.2.0/amendment.json` (sha256 `b5cae658a3f47639500e2220e4a91fcfb81c34972d8426a4fa9fd1146cdbc294`) and its `README.md`.
  - Decision: `docs/decisions/ADR-0005-tb-schema-api-v1-2-0-case-fact-sources-read.md`, **PROPOSED** for acceptance at R9 final.
  - The record names its base by the v1.1.0 record's digest (`2f4df69739926d4b50c22a1ba123ede51edec04bafb86459bb6bacb2d1dfda85`) and the digests of the v1.1.0 documents, and records only its own delta: two schemas after `GetCaseFactResponse`, one path after `/cases/{caseId}/facts/{id}`, OpenAPI `info.version` 1.1.0 → 1.2.0.
  - Result: 288 schemas (286 + 2) and 143 operations (142 + 1). Generated artifacts, byte-identical to "frozen v1.0.0 + v1.1.0 + v1.2.0": `api-schemas.json` `f4b8d7e1fb6fe85be8bd89b9a4d514fc5e805f924da3edb89f2af14389ed5ef4`, `openapi.json` `0391b408344f0f09811d444b4df3ec061eeaf6b639b59867548e4e182e10a511`, `openapi.yaml` `9c305a974eb47acf3329e0d73629355a7660602e5af4e180a9f63a9e6309083e`.
  - `@tb/contracts` exports `CONTRACT_BASELINE = 'TB-SCHEMA-API-v1.2.0'` and `FROZEN_REFERENCE_RELEASE = 'TB-SCHEMA-API-v1.0.0'`.
- **v1.0.0 and v1.1.0 records immutable** (mission §10, §22 item 6).
  - `git diff eb83b19..b862cf7` touches nothing under `docs/reference`, `docs/contracts/TB-SCHEMA-API-v1.1.0` or ADR-0004: `amendment.json` is still `2f4df697…dfda85`, its `README.md` `4856068f…ecb56d`.
  - `yarn reference:check` passes before and after (`MANIFEST.sha256` `42c2a419…6e9c` matches the pin); nothing is generated into `docs/reference`; `verify_contracts.py` was not run.
  - `tests/contracts/release-v1-1-0.test.ts` still pins the v1.1.0 record digest and reproduces the v1.1.0 documents from "frozen + v1.1.0" to the digests recorded at acceptance; `release-v1-2-0.test.ts` pins this record, its base identity and byte identity with the generated artifacts (§25.6). Negative controls NC-R9-07a–d fail them (§25.9).
- **Unchanged.** All 286 schemas and 142 operations of v1.1.0 — so all 284 schemas and 141 operations of v1.0.0 — are byte-identical and in their order, including `GetCaseFactResponse` and every other fact schema; `$id` `urn:tb:api-contract:v1`, OpenAPI 3.1.1, servers, tags, security, shared parameters and responses; `PFC-YT-EMAIL-v1.1`; `AppMeta.schemaRelease` (`'TB-SCHEMA-API-v1.0.0'`, as recorded); the database schema.
- **Compatibility: additive only.** No existing operation, path, parameter, schema, required field, enum, format, status code, header, security requirement or error code changed. A v1.0.0 or v1.1.0 client keeps working, and `getCaseFact` still returns exactly the CaseFact row.
- **Transition oracle.** `yarn test:transition-baseline` fails by design, as it has since the v1.1.0 edit (`evidence/r9-first-pc-sweep.txt`). It is not a gate and is not "fixed".

### 25.4 Read semantics

- **Meaning, only this.** "These are the exact source-support rows recorded for this exact CaseFact revision." Never truth or proof of the fact, a document review (DOCUMENT_REVIEWED), SUPPORTED_FOR_SCOPE, an infringement, ownership, permission or exception conclusion, G1–G7 or readiness.
- **Implementation** (`apps/api/src/modules/cases/case-facts.service.ts` `sources`, `intake-views.ts` `toFactSourceView`, `intake.controller.ts`).
  - The route is session-protected by the global guard; the path parameters are parsed by the contract (a malformed id is a 404).
  - The revision is found with `findFirst({ where: { id, caseId } })` — only under the case of the path.
  - Its rows are selected by that exact `factId`, in ascending `createdAt`, then `id` order, and returned field by field as stored: `id`, `factId`, `caseSourceId`, `supportRole`, `supportedAssertion`, `createdAt`, `createdById`. `resourceReply` sends no ETag.
- **Order.** Deterministic: ascending `(createdAt, id)`. One revision's rows are written in one transaction with one `createdAt`, so within a revision this is `id` order — not the submission order, which is not stored (no migration was made to store it). No semantic order (for example by `supportRole`) is invented.
- **Zero supports.** `{ factId, sources: [] }` is a normal answer (`CreateFact` / `ReviseFact` allow zero supports): it means only that no FactSource row was recorded for that revision — not unsupported, false, missing or MISSING. The R8 rule "at least one row" of `CaseAuthoritySelectionView` is deliberately not copied (`minItems: 0`).
- **Historical pinning.** Each row names its CaseSource link, which pins one exact SourceReference revision. A newer source revision re-points nothing. A PAUSED or UNLINKED link keeps every row readable: the read does not filter by link state, and the link's present state is its own record (read with `getCaseSource` and shown apart in the UI).
- **Revisions.** Each revision reads only its own rows; nothing is merged or carried across revisions (a revision form starts without supports).
- **Case isolation.** Another case's fact, an unknown fact, an unknown case and a malformed id give the same 404 `NOT_FOUND` body; no fact existence, support count, CaseSource id or assertion crosses.
- **Read-only.** No ETag, If-Match or Idempotency-Key; the WriteExecutor is not involved and no audit event is written. The fact's provenance and resolution state are neither read into nor changed. `getCaseFact` is unchanged.
- **Integrity.** A stored row that names another case's CaseSource (impossible through the API: the write checks the link's case, INVARIANTS §3; `fact_sources.case_source_id` is a single-column foreign key, §18) or a revision with more than 100 rows gives 500 `INTERNAL_ERROR`, never the rows.

### 25.5 UI

- **The fact page's "Supporting sources"** (`apps/web/src/app/cases/facts.tsx`) replaces the gap notice (`FACT_SUPPORT_GAP` removed). It reads the supports of exactly the revision shown (`getCaseFactSources`), keyed by case and fact id, and shows:
  - "Each support is recorded with this revision exactly as entered: a linked source of this case and what it was entered to support. It records what was cited — it does not establish that the fact is true, it is not a review of the document, and it never changes the provenance or resolution state recorded for the fact.";
  - each support ("Support n", in the server's order): **Support role**, **What it supports** (whitespace and line breaks kept), **Cited source (the exact revision its link cites)** — the source's title, role, revision, scope and recorded provenance, with "This record cites revision n; the source now has revision m. The citation does not move to it." when the source has since been revised — and **Linked to this case as** (the link's role and id);
  - apart from the record, **"The link today — not part of this record"**: the link's present state and reason and, for a paused or unlinked link, "This link is now paused/unlinked. The support above stays recorded for this revision exactly as it was.";
  - with no row: "No supporting source was recorded for this revision.";
  - "A support stays with the revision it was recorded for and keeps citing the exact source revision of its link. A newer source revision, a later change of the link's state or a newer revision of this fact never changes it."
- **Revision form.** "Supports are entered for each revision: the earlier revision keeps its own supports, shown on its page, and they are not copied here."
- **A fact not found in this case** shows the case-scoped not-found notice; its supports are never requested.
- **Wording.** Neutral: no proof, verified fact, infringement, permission-denied, SUPPORTED_FOR_SCOPE, G1/G7 or readiness claim; stamps are only revision and link states.
- **Unchanged.** No new UI dependency; route-level splitting keeps the entry at 319.34 kB (gzip 99.58 kB), with the fact page chunk at 29.80 kB (P4B: 27.45 kB); no bundle advisory.
- **F1 pattern in the P4A "Link a source" page** (§21): not touched — the remediation does not change `case-sources.tsx`, so it stays documented and unfixed, as the mission directs (§17).

### 25.6 Tests

| Suite | R9 change | Covers |
|---|---|---|
| `tests/db/p4b-http.test.ts` | +7 (39) | FACT SOURCES READ-BACK: **zero supports** (an empty list naming the revision; no ETag, no precondition, session only, nothing written); **one and several supports** (the stored row exactly; roles and assertions byte for byte — spaces, CRLF, tab, quotes, a backslash and JSON text, NFC/NFD, 8000 code points; equal to the stored rows; `(createdAt, id)` order; repeated reads identical); **revisions keep their own supports** (three revisions: two supports, another one, none; nothing merged); **historical pinning** (a newer source revision, a paused link, two unlinked links: the read-back is byte-identical and the link still cites the pinned revision); **case isolation** (eight refusal paths, one identical 404 body, no text of another case); **read only and neutral** (four provenance/resolution pairs with a reviewed source cited stay as recorded; `getCaseFact` strictly the v1.0.0 response with no support list; every suite table unchanged); **integrity** (a foreign link or 101 rows → 500, nothing leaks). The conformance test checks every collected response against its operation and exercises the R9 read |
| `tests/db/directory-http.test.ts`, `auth-http` | ±0 | the routed inventory: 40 case operations, 116 business operations |
| `tests/contracts/release-v1-2-0.test.ts` | +13 (new) | record digest and base identity (the v1.1.0 record and documents reproduced to their recorded digests); constants; byte-identical composition (bundle, OpenAPI) and the committed artifacts (YAML included); every v1.0.0 and v1.1.0 schema and operation unchanged and in place; every fact schema an existing client validates unchanged; the added read (GET under the case and fact, session only, no body/If-Match/Idempotency-Key; exact response 0–100 rows; no proof, review, G1, readiness, currentness, validity or link-state field) |
| `tests/contracts/release-v1-1-0.test.ts` | 13 → 12 (restructured) | the v1.1.0 record pinned and reproduced to its recorded digests; its three byte-identity tests against the generated artifacts became one test against the composed v1.1.0 documents (the generated artifacts are v1.2.0 and are pinned by `release-v1-2-0`); the active-release constant test moved to `release-v1-2-0`; new: the active contract carries the v1.1.0 operation and schemas exactly as released. No protection was removed (NC-R9-07a/b/d) |
| `tests/contracts/inventory-openapi.test.ts` | +2 (443) | compared with the v1.2.0 release; itemized inventory of each addition against its own amendment |
| `tests/contracts/runtime-parity.test.ts` | +2 (321) | three-way parity (baseline Ajv, generated Ajv, Zod) for all 288 schemas; the 31 frozen fixtures against the frozen bundle |
| `tests/web/p4b.test.tsx` | +4 (24) | **create and revise with supports, then unmount and reload** — the historical revision still shows exactly its own supports, read back from the server, the newer one only its own; **paused/unlinked link and a newer source revision** — supports stay shown as recorded, the link today apart, the citation not followed, no upgraded provenance; **zero supports**; **another case's fact** — not found, its supports never requested. Two P4B tests were updated (the gap notice replaced by the read-back); `tests/web/support.tsx` serves the case-scoped read |
| `scripts/local/p4b-smoke.ts` (CI) | +10 checks (64) | revision 1 reads back exactly its one support, revision 2 none; unchanged after a newer source revision and after a pause; the read through another case → 404 |
| `scripts/local/smoke.ts` | +1 check (42) | the supports read without a session → 401 |

**Mission §14, item by item:**

| # | Requirement | Covered by |
|---|---|---|
| 1 | Zero supports → empty list | DB "zero supports"; web "…without supports…"; browser 10; release test (`minItems` 0); NC-R9-08a/b |
| 2 | One FactSource round-trips exactly | DB "one support reads back exactly…" |
| 3 | Several FactSources round-trip exactly | DB "…several read back byte for byte…"; browser 1 |
| 4 | `supportRole` exactly | DB "one support…" (spaces, case, accents) |
| 5 | `supportedAssertion` exactly | DB "one support…" (CRLF, tab, quotes, JSON text, NFC/NFD, 8000 code points); browser 1 (a line break) |
| 6 | Deterministic order | DB "one support…" (id order, three repeated reads); NC-R9-09a |
| 7 | An earlier revision retains its supports | DB "revisions keep their own supports"; web "create and revise … unmount and reload"; browser 5 |
| 8 | A newer revision has only its own | DB "revisions keep…"; web; browser 4, 6; `smoke:p4b` |
| 9 | A SourceReference revision re-points nothing | DB "historical pinning"; web "…a newer source revision is not followed"; browser 7; `smoke:p4b`; NC-R9-02a/b |
| 10 | A CaseSource pause erases nothing | DB "historical pinning"; web; browser 8; `smoke:p4b`; NC-R9-03a/b |
| 11 | A CaseSource unlink erases nothing | DB "historical pinning"; web; browser 8; NC-R9-03a/b |
| 12 | Another case cannot read the supports | DB "case isolation"; web "another case's fact…"; browser 9; `smoke:p4b`; NC-R9-01a–c |
| 13 | Unknown fact → safe 404 | DB "case isolation" (unknown fact, unknown case, malformed id: one body); browser 9 |
| 14 | No writes | DB "zero supports", "read only and neutral" (every suite table compared); browser (case ETag v8 before and after five reads); NC-R9-06a/b |
| 15 | Provenance not upgraded | DB "read only and neutral"; web (NC-R9-05b); browser 1; NC-R9-05a |
| 16 | `resolutionState` not changed | DB "read only and neutral" (UNASSESSED, CONFLICT, WITHDRAWN kept) |
| 17 | `getCaseFact` backward compatible | DB "read only and neutral" (the strict v1.1.0 response, no `sources`); release test "an existing client keeps working…"; NC-R9-10a |
| UI | create/revise → unmount/reload → historical revision → exact supports | web "create and revise with supports, then unmount and reload…"; browser 2, 5 |

Totals: `yarn test` **1346** in 37 files (P4B: 1326 in 36); `yarn test:db` **340** in 9 files (P4B: 333) — home PC and CI identical.

### 25.7 Commits

| Commit | Content |
|---|---|
| `fbcd8ae` | Contract: TB-SCHEMA-API-v1.2.0 — `CaseFactSourcesView`, `GetCaseFactSourcesResponse`, `getCaseFactSources`, `info.version` 1.2.0, the release constant; regenerated artifacts; the release record (`docs/contracts/TB-SCHEMA-API-v1.2.0/`) and ADR-0005; `tests/contracts/release.ts` (releases composed in order), `release-v1-2-0.test.ts` (13), `release-v1-1-0.test.ts` restructured; inventory and runtime parity against v1.2.0 |
| `02332da` | API: the read (`case-facts.service.ts`, `intake-views.ts`, `intake.controller.ts`); DB tests (+7) and the routed inventories; `smoke:p4b` read-back and cross-case refusal; `smoke:local` boundary |
| `b862cf7` | UI: the supports recorded with each revision on the fact page, the link's present state apart, the revision-form hint; the web API client; web tests (+4) and the test API's case-scoped read |
| documentation commit | This section and §24, the evidence files `r9-*` and screenshots `r9-*`, `CURRENT_STATE.md`, `CLAUDE.md` (documentation only; its CI run is reported with the R9-final report) |

### 25.8 Browser verification (Playwright MCP)

**12/12 PASS** — every item of mission §16 (`evidence/r9-playwright-mcp-verification.txt`; screenshots `evidence/screenshots/r9-01…r9-07`). Target: `yarn ui:sandbox` built from `b862cf7` (the compiled API on the disposable `tb_notice_test` and the built web app, the same bundle names as CI), an isolated headless browser, synthetic data only; 2026-09-25T09:11Z–09:17Z.

- **Recorded and reloaded.** A fact with two supports (entered PACKET/PRIMARY, then LICENCE/CONTEXT with a line break): the page equals the wire (200, no ETag, no-store, no affected resources), the rows in id order (the licence first), provenance "Operator reported" and resolution "Unassessed" kept although a reviewed source is cited. A new document load of the address shows the same.
- **Revisions.** Revision 2 with one REVISED support shows only it; revision 1 ("Superseded revision") keeps its two supports and not the REVISED one.
- **Pinning.** The packet revised to revision 2 in the browser: the row ids are unchanged, the link still cites revision 1, and the page says "This record cites revision 1; the source now has revision 2. The citation does not move to it."
- **Pause and unlink.** The packet link paused and the licence link unlinked through the P4A dialog: both supports still shown with the same roles and assertions; the records carry no state; each "The link today — not part of this record" box shows the state and reason.
- **Case isolation.** Case Beta's address for Alpha's fact: not found, nothing of Alpha, the supports never requested (the page requested only session, health, case and fact); forced cross-case and unknown reads → identical 404 bodies.
- **Zero supports, wording, layout, keyboard.** A Permission fact without supports: `sources: []`, "No supporting source was recorded for this revision.", provenance "Missing". No affirmative proof/G1/readiness wording on the fact pages (the case page's "proves"/"proven" only inside the P4A negations). No horizontal scroll at 390px. Tab reaches both citations with a visible 2px outline; Enter opens the cited revision 1.
- **Reads write nothing.** Five reads left Alpha at ETag `…:v8`, row version 8, context revision 8.
- **Cleanup.** Sandbox rows deleted; `db:verify test --expect-empty` PASS; password file deleted; ports free.

### 25.9 Negative controls

**21/21 caught and restored byte-identically** (`evidence/r9-negative-controls.txt`). Final run 2 on `b862cf7`, 2026-09-25T09:22:32Z–09:23:31Z: every one of the 28 responsible commands failed and named its test (first failure: 25 AssertionError, 3 web "timed out waiting for …"); the working-tree fingerprint was identical before and after; `tb_notice_test` was empty afterwards. The unmutated baseline right before it passed (13 distinct commands, each selecting at least one test).

| Mission §15 control | Controls |
|---|---|
| cross-case support leakage | NC-R9-01a (the read's case filter), 01b (the foreign-link integrity guard), 01c (UI requests another case's supports) |
| following the latest source revision | NC-R9-02a (a source revision re-points links), 02b (UI cites the newest revision) |
| hiding supports after CaseSource pause/unlink | NC-R9-03a (the read filters to LINKED), 03b (UI hides non-LINKED supports) |
| merging supports from different revisions | NC-R9-04a (the read merges the chain's rows), 04b (UI shows the head's supports on an earlier revision) |
| provenance auto-upgrade | NC-R9-05a (the read upgrades the fact), 05b (UI shows an upgraded provenance) |
| a read causing a write/audit | NC-R9-06a (an audit event), 06b (the case version bumped) |
| the release modifying v1.1.0 | NC-R9-07a (a v1.1.0 schema bound), 07b (the v1.1.0 operation), 07c (the committed OpenAPI artifact), 07d (the v1.1.0 record itself, temporarily, restored) |
| also | NC-R9-08a/b (zero rows refused / `minItems` 1), 09a (order reversed), 10a (`getCaseFact` embeds supports) |

Run 1 (09:08:22Z–09:09:24Z, same head, before the browser pass) was also 21/21; its summary column captured vitest's "Failed Tests" banner instead of the final summary line — the CAUGHT decision never used that column; the runner was corrected for run 2 (evidence file).

### 25.10 Regression sweep and CI

**Sweep** (mission §19): 2026-09-25T09:24:14Z–09:29:05Z on `b862cf7`. All 21 steps exit 0 (`evidence/r9-first-pc-sweep.txt`).

| Command | Result |
|---|---|
| `yarn reference:check` (before and after) | frozen references intact (`MANIFEST.sha256` `42c2a419…` matches the pin) |
| `yarn reference:helper-tests` | 27 pass, 0 fail |
| `yarn contracts:check` | 3 generated outputs match the active source |
| `yarn install --immutable` | lockfile unchanged (pre-existing YN0086 warning) |
| `yarn typecheck` · `yarn format:check` | exit 0 |
| `yarn lint` · `oxlint --deny-warnings --format default` | exit 0 · exit 0 — **0 warnings** ("Found 0 warnings and 0 errors." on 256 files) |
| `yarn test` | 1346 / 1346 in 37 files |
| `yarn test:db` | 340 / 340 in 9 files (`tb_notice_test`) |
| `yarn db:verify test --expect-empty` (before and after) | PASS, domain rows 0 |
| `yarn db:verify dev` | PASS (metadata and a row count only: 5, unchanged — nothing written to `tb_notice_dev`) |
| `yarn db:status test` / `dev` | up to date (1 migration) |
| `yarn db:drift:diff-migrations` / `db:drift:diff-datasource dev` | empty migration (no drift) |
| `yarn build` | exit 0, no bundle advisory (entry 319.34 kB) |
| `yarn smoke:local` | 42 checks (P4B: 41) |
| `yarn dev:verify-shutdown` | 4 / 4 scenarios |

`smoke:auth`, `smoke:directory`, `smoke:p3a`, `smoke:p3b`, `smoke:p4a` and `smoke:p4b` write records and run only in CI; they are retained and pass there.

**CI** (`evidence/r9-ci-run-36116320128.txt`).

- **Code head `b862cf7`:** push run [36116320128](https://github.com/TuongChris/tb-notice-production-system/actions/runs/36116320128) (2026-09-25T09:03:39Z–09:08:53Z), **success**, both jobs: "Non-DB checks (cold install)" (job 108011169030) — reference check and the 27 helper tests, `contracts:check`, lint "Found 0 warnings and 0 errors.", format, `yarn test` 1346 / 37 files, build (entry 319.34 kB, no advisory), frozen references unchanged; "Database, seed and smoke (MySQL 8.4.11)" (job 108011169424) — migration and metadata verification on test, replay and dev; `yarn test:db` 340 / 9 files; seed twice with the canonical digest unchanged; both drift diffs empty; `smoke:local` 42; `smoke:auth` 4; `smoke:directory` 14; `smoke:p3a` 24; `smoke:p3b` 36; `smoke:p4a` 50; **`smoke:p4b` 64** (the read-back, its pinning and its cross-case refusal included); the P1.1 recovery commands; `yarn dev` clean shutdown 4 / 4.
- **Earlier runs:** the post-merge `main` `eb83b19` (run 36106838217, §24.2) and the branch at creation (run 36113092678), both success.
- **Documentation head:** its run is reported with the R9-final report.

### 25.11 Schema, migration and dependencies

- **None changed.** No migration was needed, created or applied: `fact_sources` already holds every field returned. `20260923103912_initial_schema` is still the only migration, and both drift diffs are empty. No `db push`, `migrate reset`, FK disabling or applied-migration edit.
- **Nothing else outside the change.** `git diff eb83b19..b862cf7` (30 files) touches nothing under `apps/api/prisma`, `docs/reference`, `docs/contracts/TB-SCHEMA-API-v1.1.0`, ADR-0004, `yarn.lock`, `.yarnrc.yml`, `.nvmrc` or any `package.json`. No dependency was added.

### 25.12 Warnings and open items for the operator (not decided here)

1. **Acceptance of ADR-0005** (PROPOSED) and of TB-SCHEMA-API-v1.2.0 as the active release, at R9 final. Until then `main` carries v1.1.0.
2. **`AppMeta.schemaRelease`** stays `'TB-SCHEMA-API-v1.0.0'` as recorded (ADR-0004, ADR-0005).
3. **The transition oracle** fails by design (§25.3).
4. **Pre-existing, non-blocking:** the YN0086 peer-dependency warning of `yarn install`; the P4A "Link a source" page keeps its conflict notice after "Load latest version" (the F1 pattern, §21; not touched, mission §17).
5. **Submission order of supports** is not stored, so the read returns `(createdAt, id)` order (§25.4). Storing it would need a migration; none was made.

### 25.13 Status

| Scope | Status |
|---|---|
| R9 review | **PASS_WITH_ONE_CONTRACT_REMEDIATION** (operator, 2026-09-25) — until the operator's R9-final review; not marked PASS here |
| R9 remediation | **IMPLEMENTED AND VERIFIED** on `feature/r9-fact-support-readback` (code head `b862cf7`), submitted for **R9 final (PENDING)**; not merged |
| ADR-0005 / TB-SCHEMA-API-v1.2.0 | **PROPOSED** (active on the remediation branch; `main` carries the accepted v1.1.0) |
| P4B | **VERIFIED_COMPLETE_FOR_IMPLEMENTED_SCOPE**, **MERGED_TO_MAIN** (`eb83b19`) |
| Database / dependencies | **No change** |
| P4C | **NOT_STARTED** |
