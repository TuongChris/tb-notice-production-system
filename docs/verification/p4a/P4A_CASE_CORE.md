# P4A — Case core and case authority selection (home PC)

Mission TB_P4A_CASE_CORE_AND_AUTHORITY_SELECTION_TO_R8 on `feature/p4a-case-core`, branched from the post-P3B `main` head `3649bef` and started at the R7 closeout head `b97ac13`. Recorded 2026-09-24 (UTC) on the home PC, the primary development workstation (ADR-0003). The mission stops at review gate **R8** and is submitted as **PENDING**. Every later case phase was **not started**: no ReportedItem, CaseWork, UseMapping, CaseFact, audiovisual evidence conclusion, permission or exception finding, correspondence, PromptSnapshot, NoticeCandidate, ValidationRun workflow, CandidateAssessment, readiness gate, G1–G7, READY_FOR_SIGNER, signature, adoption, sending, retraction, counter-notification, uploader contact, Drive write, mailbox or other external action exists.

## Status by scope (not collapsed)

| Scope | Status | Basis |
|---|---|---|
| **P4A_FIRST_PC** | **PASS** | All automated checks in §14 executed on the home PC and passed; lint **0 warnings** |
| **P4A_CI** | **PASS** for the code head `61164fa` (push run 36028683469, both jobs success, `smoke:p4a` 47 checks) | CI runs `yarn test`, `yarn test:db`, `smoke:local`, `smoke:auth`, `smoke:directory`, `smoke:p3a`, `smoke:p3b` and the new compiled `smoke:p4a` flow (§14). A commit cannot record its own run; the run of the submitted head (the test-only commit `6330aeb` plus this documentation) is reported with R8 |
| **P4A_BROWSER (Playwright MCP)** | **PASS** 23/23 (mission §34); three UI findings found and fixed (F1–F3, §12) | Isolated test browser against the compiled API on the disposable `tb_notice_test` (`evidence/p4a-playwright-mcp-verification.txt`) |
| **P4A_NEGATIVE_CONTROLS** | **PASS** 24/24 | Every disabled protection made its responsible tests fail; files restored byte-identically (§13, `evidence/p4a-negative-controls.txt`) |
| **R8 review** | **PENDING** | Submitted with this report |
| **P1_WINDOWS_BROWSER** | **NOT_RUN** (not reported) | Unchanged |
| **P0_SECOND_PC** / **P0_TWO_PC_ACCEPTANCE** / **P0_SINGLE_PC_BASELINE** / **P0_OVERALL** | **DEFERRED_BY_OPERATOR** / **NOT_COMPLETED** / **VERIFIED** / **NOT_COMPLETE** against the original two-PC contract | ADR-0003; unchanged by P4A |

`EXTERNAL_LEGAL_ACTIONS=0` · `REAL_CASE_DATA=0` · `G1_DECISIONS=0` · `G7_CREATED=0` · `READINESS_COMPUTED=0` · `DRIVE_WRITES=0` · `DEPLOYMENTS=0` · `REAL_TB_DATA_IN_GIT=0` · `REAL_ACCOUNTS_CREATED_BY_ENGINEER=0` · `RECORDS_WRITTEN_TO_OPERATOR_DB=0` · `SCHEMA_CHANGES=0` · `WIRE_CONTRACT_CHANGES=0` · `NEW_DEPENDENCIES=0`.

Persistent rules established by P4A (recorded in `CLAUDE.md`):

- **Case isolation.** A case is the boundary of its case-specific records. Nothing recorded for one case — a source link, an authority selection, a canonical id, a workflow or archive state, a case-scoped source — supports, appears in or carries over to another case. A case-scoped source applies only to the cases it names.
- **A CaseSource link is not proof.** A link records only that one exact SourceReference revision is associated with one case in a role. It does not mean the document was reviewed, is true, proves infringement, shows the absence of permission or makes authority valid, and it never changes the source's provenance.
- **CaseAuthoritySelection ≠ G1.** A selection is "the authority chain selected/pinned for evaluation in this specific Case" — not G1 PASS, confirmed current authority, adjudicated validity, signer eligibility, G7 or readiness.
- **Exact selection pinning.** A selection pins the exact route, signer, coverages of FROZEN versions (each with its own application scope) and basis source revision that were chosen. It never follows a newer version, source revision, default signer or preferred coverage; history is append-only and the earlier chain is never erased.
- **No cross-case inheritance and no implicit selection.** Nothing is selected or inherited from another case, the route's default signer or preferred coverage, the latest or a frozen version, a missing end date, the same agency or matching names.
- **No readiness in P4A.** Nothing computes G1–G7, READY_FOR_SIGNER or readiness, and no workflow state implies any of them.

> §1 was written from the contract, the domain model and the invariants before any P4A code; §2–§20 record the implementation and its verification.

## 1. Operation matrix and design (contract-first, produced before coding)

### 1.1 Exact contract scope

Read from the active contract metadata (`packages/contracts/src/api/operations.ts`, via the built `@tb/contracts`): 141 operations, of which exactly these **16** are P4A. They match the list in the mission, including the capitalised operationIds `ArchiveCase`, `RestoreCase`, `WorkflowCase`, `RouteBindingCase` and `CanonicalBindingCase`, which stay exactly as contracted.

| # | operationId | Method and path | Request | Success | If-Match target | Idempotency-Key | Mutates | Source / reference dependencies |
|---|---|---|---|---|---|---|---|---|
| 1 | `listCases` | GET `/cases` | query `limit`, `cursor`, `q`, `agencyId`, `routeId`, `workflowState` | 200 `ListCasesResponse` | — | — | — | — |
| 2 | `createCase` | POST `/cases` | `CreateCase` | 201 `CreateCaseResponse` | — | required | CaseRecord (insert) | Agency, optional Owner hint, optional Route (+ its parties) |
| 3 | `getCase` | GET `/cases/{caseId}` | — | 200 `GetCaseResponse` + ETag | — | — | — | — |
| 4 | `patchCase` | PATCH `/cases/{caseId}` | `PatchCase` | 200 `PatchCaseResponse` | CaseRecord | required | CaseRecord | Owner hint, packet SourceReference |
| 5 | `deleteUnusedCase` | DELETE `/cases/{caseId}` | — | 204 | CaseRecord | required | CaseRecord (delete) | every FK / JSON reference to the case blocks |
| 6 | `ArchiveCase` | POST `/cases/{caseId}/archive` | `ArchiveRequest` | 200 `ArchiveCaseResponse` | CaseRecord | required | CaseRecord | — |
| 7 | `RestoreCase` | POST `/cases/{caseId}/restore` | `ArchiveRequest` | 200 `RestoreCaseResponse` | CaseRecord | required | CaseRecord | Agency, bound Route (states) |
| 8 | `WorkflowCase` | POST `/cases/{caseId}/workflow` | `CaseWorkflowRequest` | 200 `WorkflowCaseResponse` | CaseRecord | required | CaseRecord | — |
| 9 | `RouteBindingCase` | POST `/cases/{caseId}/route-binding` | `BindCaseRoute` | 200 `RouteBindingCaseResponse` | CaseRecord | required | CaseRecord | Route + parties; the case's linked sources are re-checked |
| 10 | `CanonicalBindingCase` | POST `/cases/{caseId}/canonical-binding` | `CanonicalBindingRequest` | 200 `CanonicalBindingCaseResponse` | CaseRecord | required | CaseRecord | SourceReference (current CANONICAL_RECORD, case scope) |
| 11 | `listCaseSources` | GET `/cases/{caseId}/sources` | query `limit`, `cursor`, `q` | 200 `ListCaseSourcesResponse` | — | — | — | — |
| 12 | `linkCaseSource` | POST `/cases/{caseId}/sources` | `LinkCaseSource` | 201 `LinkCaseSourceResponse` + ETag | CaseRecord | required | CaseSource (insert), CaseRecord | SourceReference (case scope) |
| 13 | `getCaseSource` | GET `/case-sources/{id}` | — | 200 `GetCaseSourceResponse` + ETag | — | — | — | — |
| 14 | `setCaseSourceLinkState` | POST `/case-sources/{id}/link-state` | `LinkStateRequest` | 200 `SetCaseSourceLinkStateResponse` + ETag | CaseSource | required | CaseSource, CaseRecord | SourceReference re-checked on relink |
| 15 | `selectCaseAuthority` | POST `/cases/{caseId}/authority-selections` | `SelectAuthority` | 201 `SelectCaseAuthorityResponse` (no ETag) | CaseRecord | required | CaseAuthoritySelection + CaseAuthorityCoverage (insert), CaseRecord | Route, Signer, MandateCoverage → MandateVersion → Mandate, CoverageSigner, basis SourceReference |
| 16 | `listCaseAuthoritySelections` | GET `/cases/{caseId}/authority-selections` | query `limit`, `cursor`, `q` | 200 `ListCaseAuthoritySelectionsResponse` | — | — | — | — |

Every P4A write declares 400/401/403/404/409/412/413/422/428/429/500 (the two creates without a precondition omit 412/428); reads declare 400/401/403/404/409/413/422/429/500. The other 29 operations under `/cases/…` (reported items, case works, use mappings, case facts, correspondence bindings, production context, prompts, candidates) stay unrouted.

**Contract gap (reported for R8, not worked around).** `CaseAuthorityCoverage` is defined in the schema catalog, but no contracted response contains it: `CaseAuthoritySelection` and its page carry the selection row only. `selectCaseAuthority` pins the chosen coverages in `case_authority_coverages` (the IDs of the created rows appear in the response's `meta.affectedResources`), but no operation reads a past selection's coverages back. The UI can therefore show a selection's chosen chain while it is being made, and for history only the contracted selection fields. Reading pinned coverages back needs an approved contract amendment; no wire change is made here.

### 1.2 Design decisions (service level; the contract is silent on them)

**Case identity and context.** `agencyId`, `platform` and `caseClass` are fixed at creation: none is in `PatchCase`, so a PATCH naming one is 422 (unknown field). `routeId` changes only through `RouteBindingCase`, the canonical code only through `CanonicalBindingCase`, `workflowState` only through `WorkflowCase`, the archive flag only through `ArchiveCase`/`RestoreCase`, and `currentAuthoritySelectionId` only through `selectCaseAuthority`. `PatchCase` (intakeLabel, ownerHintId, packetSourceId, driveFolderUrl, notes) cannot move a case. No additional "established Case" lock is invented: the contract already keeps every identity-defining field out of the generic PATCH.

**Creation.** Only the supplied contracted fields are stored: `workflowState` INTAKE, `contextRevision` 1, and no canonical ID, route, source link, selection, fact or state are inferred. The agency exists (422) and is unarchived (409). An owner hint exists (422) and is unarchived (409). A route given at creation passes the same checks as `RouteBindingCase`.

**Owner hint.** It is a hint, not a binding: while no route is bound it is checked only for existence and archive state. Once a route is bound it can only be null or that route's owner (422 `CROSS_OWNER_REFERENCE`), so a PATCH can never make the case's context contradict its route. A route whose owner differs from a set hint is refused the same way.

**Route binding** (`INVARIANTS` §3–§4, AC-020/021).
- **Route checks.** The route exists (422). It belongs to the case's agency and platform (422 `CROSS_AGENCY_REFERENCE`; composite FK as backstop). It is unarchived and LINKED, its agency, owner and legal subject are unarchived, and its association is LINKED (409). DOMAIN §8: "Pause/unlink prevents inappropriate new selection".
- **Same route or correction.** Binding the same route again is 409. Replacing a bound route (a correction) is allowed only while the case has no authority selection, fact, prompt snapshot, correspondence binding or candidate; otherwise 409 `BINDING_CORRECTION_REQUIRES_RECONCILIATION` (INVARIANTS §4).
- **Re-checks.** The case's LINKED/PAUSED source links, canonical source and packet source must fit the new route context (owner, subject and case dimensions, below); otherwise 422, nothing written.
- **What a binding is.** It records only "this is the route associated with this case": no authority, preferred coverage, G1 or ownership.

**Canonical binding.**
- **Checks.** These are the P3A rules with the case as the source target: not archived (409); already bound → 409 `BINDING_CORRECTION_REQUIRES_RECONCILIATION`; the source exists and applies to the case (422); it is the current revision (409 `SOURCE_NOT_CURRENT`); its role is CANONICAL_RECORD (422 `SOURCE_ROLE_NOT_VERIFICATION`); the code is unused by another case (binary unique key → 409 `DUPLICATE_CANONICAL_CODE`).
- **What it is.** An identity/reference association only. No provenance changes, and nothing is reviewed, proven or made ready.

**Workflow.** Any state to any other state with a reason; the same state is 409. CLOSED records `closedAt` = now and `closeReason` = the reason. Leaving CLOSED clears both (the audit trail keeps the history). No state is gated on sources, authority or readiness, and no state means infringement, authority, G1–G7, READY_FOR_SIGNER, submission or an outcome.

**Archive and restore.**
- **Archive** is an administrative flag. It keeps links, selections, bindings and workflow state, cascades nothing, and makes the case read-only except restore.
- **Restore** clears the flag only. It is refused while the case's agency or bound route is archived (409). It re-activates no route, link or authority, and changes no selection.

**Delete.** Only an unused case: not archived, no canonical binding, no row referencing it through any foreign key (source links, selections and every later case child), and no JSON snapshot reference (for example a source whose scope names the case). Otherwise 409 `REFERENCED_RECORD_CANNOT_DELETE` with the blockers, and no dependency is ever deleted to make room. The case's own route binding, owner hint, packet source and workflow state are its own data, not dependents.

**Case sources.**
- **What a link means.** "This SourceReference is associated with this case" — never reviewed, true, proven, permitted or authoritative.
- **Link checks.**
  - The case is unarchived (409). The source exists (422) and applies to the case (scope below).
  - One row per (case, source, useRole); a second link is 409 `DUPLICATE_CASE_SOURCE` naming the existing row, whatever its state. A relink goes through the link-state command.
  - Any revision can be linked and stays pinned: a newer revision never re-points a link.
- **Link state.** `setCaseSourceLinkState` moves LINKED ⇄ PAUSED ⇄ UNLINKED with a reason; the same state is 409. The row and the source are never deleted. A return to LINKED re-checks the case state and the source's applicability in the case's current context.
- **Versions.** Linking and state changes move the case's `rowVersion` and `contextRevision` (INVARIANTS §5: "case children lock CaseRecord before the child"). The case ETag is the precondition of `linkCaseSource`, the case-source ETag that of the state change.

**Source scope for a Case** (extends `source-scope.ts`; one rule set):
- **Case dimension.** A case-scoped source (`scopeBindings.caseIds`) applies only to the cases it names; another case is 422 `CROSS_CASE_REFERENCE`. Case-scoped sources still apply to no non-case record.
- **Agency dimension.** Unless the source names the case, the rule is that of an agency record: the case's agency's own source, or an agency-less source naming that agency (INVARIANTS §3 "no global access from null agency").
- **Subject dimension.**
  - With a bound route, a subject-scoped source must name the route's subject.
  - Without a route, a subject-scoped source cannot be checked, so it is refused with SOURCE_SCOPE_UNRESOLVED (`CASE_SUBJECT_UNBOUND`); bind the route first.
- **Owner dimension.** With a bound route, another owner's material is 422 `CROSS_OWNER_REFERENCE` (R6 interpretation 7). The owner-material definition is not extended to case links.
- **Creating case-scoped sources (P3A lifted).** `createSource` may now name cases, and `CASE_SCOPE_UNAVAILABLE` is retired. Each named case must exist (422) and be unarchived (409), and an agency's own source may name only that agency's cases (422 `CROSS_AGENCY_REFERENCE`). A revision keeps the same scope (unchanged rule).

**Case authority selection.** "The authority chain selected/pinned for evaluation in this specific Case." It is not G1 PASS, confirmed current authority, adjudicated validity, signer eligibility, G7 or readiness.
- **Case and route.** The case is unarchived (409) and has a bound route. `routeId` must equal the case's route (422 `AUTHORITY_SCOPE_UNRESOLVED`: CASE_ROUTE_UNBOUND / NOT_CASE_ROUTE; INVARIANTS §3 "Current authority selection pointer belongs to the Case and the same current Route"). The route is unarchived and LINKED and its parties are usable (409).
- **Signer.** It exists (422), acts for the case's agency (422 `CROSS_AGENCY_REFERENCE`; composite FK as backstop), and is neither archived nor ENDED (409; PAUSED/DRAFT are administrative, R6 decision 4 / R7 decision 4).
- **Each selected coverage** (1–20, no duplicates → 422):
  - It exists (422), belongs to the case's agency (422 `CROSS_AGENCY_REFERENCE`) and names the case's route (422 `AUTHORITY_SCOPE_UNRESOLVED` OTHER_ROUTE).
  - It sits in a FROZEN version (409 `VERSION_NOT_FROZEN`; INVARIANTS §4 "A selection may reference only FROZEN versions") of an unarchived Mandate of an unarchived agency (409; R7 decision 6 "revalidate whether the Coverage is usable").
  - The signer is recorded under it as a CoverageSigner (422 `AUTHORITY_SCOPE_UNRESOLVED` SIGNER_NOT_RECORDED; INVARIANTS §4 "The selected signer must match … relevant coverage-signer record(s)"). Each coverage keeps its own `applicationScope`, and there is no union.
- **Basis source.** Optional; if given, it exists and applies to the case.
- **What is not evaluated.**
  - No currentness from dates, expiry, UNTIL_TERMINATED, freeze, "latest" or the absence of events (INVARIANTS §2 step 8 belongs to later readiness).
  - No mapping from `taskType` to the coverage's or signer's ActionScope vocabulary: none is defined. The task type is recorded as supplied for later G1 scope review.
  - `Route.preferredCoverageId` is never used to select anything.
- **Effect.** One append-only selection row plus one CaseAuthorityCoverage row per coverage, exactly as chosen. The case's `currentAuthoritySelectionId` moves to the new selection with `rowVersion` and `contextRevision` +1. Earlier selections and their coverage rows are never changed.

**Shared mechanics.** Every write goes through `WriteExecutor`: contract parse (422) → Idempotency-Key (400) → If-Match (428/412) → claim → one READ COMMITTED transaction → audit → completion, with bounded retry. There are no new list, cursor, ETag or audit mechanics.
- **Lock order.** Directory identities (Agency, LegalSubject, Owner, OwnerSubject, Route, Signer) → authority aggregate (Mandate, MandateVersion, MandateCoverage, CoverageSigner) → CaseRecord → case children (CaseSource, CaseAuthoritySelection) → SourceReference last. INVARIANTS §5: "parent identities/versions … before cases sorted by ID, then children".
- **Audit and the User.** Audit keeps ids and metadata; notes, scope notes, selection notes and application scopes are recorded as their length only. The application User is only the actor (`createdById`/`updatedById`, audit): never a Signer, owner confirmation, reviewer or legal fact.

## 2. Implementation (commits)

| Commit | Content |
|---|---|
| `d615297` | Lint (first commit of the mission, before any P4A code): guard the optional chain in the R7 source-instant test helper — the one oxlint warning since `ee31fa3` (P3B report §22.6); lint target of this mission: zero warnings |
| `2cae729` | API: the 16 operations (`apps/api/src/modules/cases/{cases,case-sources,case-authority}.service.ts`, `case-rules.ts`, `case-views.ts`, `cases.controller.ts`, `cases.module.ts`); the case target in `modules/sources/source-scope.ts` and case scope on `createSource` (`source-rules.ts`); `CROSS_CASE_REFERENCE`, `DUPLICATE_CASE_SOURCE` and the route wording of `BINDING_CORRECTION_REQUIRES_RECONCILIATION` (`api-error.ts`; `CASE_SCOPE_UNAVAILABLE` retired); the case tables in `DIRECT_REFERENCES` and the case free text in the audit redaction; tests `tests/db/p4a-http.test.ts` (38) and 17 case rows in `tests/api/source-rules.test.ts`; the routed inventories (`auth-http`, `directory-http`) and the `smoke:local` / `smoke:p3a` / `smoke:p3b` boundaries now include the 16 case operations |
| `119c45b` | CI: compiled `yarn smoke:p4a` flow and its workflow step |
| `b6aeeac` | UI: Cases (list, create, detail, edit and the action dialogs), linked sources, authority selection for evaluation, the source form's "Cases named"; `tests/web/p4a.test.tsx` (15); includes the browser-pass fixes F1–F3 (§12) |
| `61164fa` | `yarn ui:sandbox` guards and cleans the case tables |
| `6330aeb` | Test: `createSource` naming cases — the archived-case and other-agency-case refusals were implemented in `2cae729` but untested (found while writing this report); the new DB test and negative controls NC-14b/NC-14c cover them |

Lock order used by every P4A write (extends P2–P3B): directory identities in alphabetical order (Agency, LegalSubject, Owner, OwnerSubject, Route, Signer) → Mandate → MandateVersion → MandateCoverage → CoverageSigner → CaseRecord → case children (CaseSource, CaseAuthoritySelection) → SourceReference.

## 3. Case semantics

- **What a case is.** A CaseRecord is the boundary of one case's records for one Agency on one platform (YOUTUBE). It stores exactly the supplied `intakeLabel`, `caseClass` (WORKING_INTAKE unless another contracted class is chosen), optional `ownerHintId`, `routeId` and `notes`, and later — by PATCH — `packetSourceId` and `driveFolderUrl`. It is created in INTAKE with row version 1 and context revision 1. Nothing is inferred or created alongside it: no route from the owner hint, no canonical id, source link, selection, fact or state (test "create: exactly the supplied fields…").
- **Not a verdict.** A case establishes no ownership, infringement, permission, authority or readiness; the case page says so.
- **Identity and commands.** `agencyId`, `platform` and `caseClass` are fixed at creation (a PATCH naming one is 422). PATCH changes only the intake label, owner hint, packet source, Drive folder and notes; route, canonical id, workflow, archive and selection change only through their own commands.
- **Two counters.** `rowVersion` (the ETag) moves with every change. `contextRevision` moves with every change to what the case relies on — route, canonical id, source links and their states, authority selection, owner hint, packet source and Drive folder — but not with the intake label or notes. The UI shows both.
- **Owner hint.** A hint, not a binding: checked for existence and archive state; once a route is bound it can only be null or the route's owner (422 `CROSS_OWNER_REFERENCE`, "The route belongs to another owner than the case's owner hint.").
- **Packet source and Drive folder.** The packet source must apply to the case (§7). The Drive folder URL is stored as a pointer: the application never fetches it and never writes to Drive.
- **Lists.** Keyset `(createdAt DESC, id DESC)`, filters `agencyId`, `routeId` and `workflowState` (an unknown state is 400), `q` accent-insensitive over the intake label and the canonical case id (discovery only) or an exact case / owner-hint id; signed cursors bound to their filters.

## 4. Workflow and lifecycle

- **Workflow.** INTAKE, PREPARING, DRAFTING, AWAITING_HUMAN, AWAITING_PLATFORM and CLOSED: any state to any other with a reason; the same state is 409. CLOSED records `closedAt` and `closeReason`; leaving CLOSED clears both, and the audit trail keeps the history. No transition is gated on sources, authority or readiness, and no state means infringement, authority, G1–G7, READY_FOR_SIGNER, submission or an outcome (the dialog says so).
- **Archive.** An administrative flag: links, selections, bindings and the workflow state stay unchanged, nothing cascades, and an archived case and everything under it are read-only except restore (PATCH, workflow, bindings, links, link states and selections → 409 `RECORD_STATE_CONFLICT`; also observed in the browser).
- **Restore.** Clears the flag only; refused while the agency or the bound route is archived (409); revives no route, link or authority and changes no selection.
- **Delete.** Only an unused case: not archived, no canonical binding, and no row or JSON scope that refers to it (case sources, selections, every later case table, a source whose scope names the case). Otherwise 409 `REFERENCED_RECORD_CANNOT_DELETE` with the blockers; nothing is deleted to make room. The UI shows the delete of a known-ineligible case as inert with the reason (archived, canonical binding) and explains the server's refusal otherwise.

## 5. Route binding and canonical binding

- **Route binding** (`RouteBindingCase`, reason required). One explicit route of the case's agency and platform (422 `CROSS_AGENCY_REFERENCE`; the composite foreign key is the backstop), unarchived and LINKED with unarchived parties and a LINKED association (409), and — with an owner hint — of that owner (422 `CROSS_OWNER_REFERENCE`). The same route again is 409. A correction replaces the route only while the case has no authority selection, fact, prompt snapshot, correspondence binding or candidate; afterwards 409 `BINDING_CORRECTION_REQUIRES_RECONCILIATION` ("The case already has history on its bound route; changing the route needs a reconciliation workflow."). Every linked, canonical and packet source of the case must fit the new route (422 otherwise). A binding records only which route the case uses: no selection, coverage or preference is inferred, and the route's default signer and preferred coverage are never used.
- **Canonical binding** (`CanonicalBindingCase`). The current revision (409 `SOURCE_NOT_CURRENT`) of a CANONICAL_RECORD source (422 `SOURCE_ROLE_NOT_VERIFICATION`) that applies to the case (§7), with a code unique among cases (binary unique key, 409 `DUPLICATE_CANONICAL_CODE`). A binding is never replaced (409 `BINDING_CORRECTION_REQUIRES_RECONCILIATION`) and no reconciliation workflow is invented. It is an identity reference only: the source and its provenance are unchanged and nothing is reviewed, proven or made ready.

## 6. CaseSource

- **Link** (`linkCaseSource`, the case's `If-Match`). One exact source revision, a use role and a scope note, stored exactly as supplied (the form trims the role before sending). The case must be unarchived (409) and the source must exist (422) and apply to the case (§7). One row per (case, source, role): a second link is 409 `DUPLICATE_CASE_SOURCE` naming the existing link, which is changed through its link state instead. Any revision can be linked and stays pinned; a newer revision never re-points a link.
- **Link state** (`setCaseSourceLinkState`, the link's own `If-Match`, a reason). LINKED, PAUSED and UNLINKED in any direction; the same state is 409. The row and the source are never deleted. Returning to LINKED re-checks the case state and the source's applicability in the case's current context.
- **What a link is.** An explicit association only. The source's provenance, review state, revision and scope never change (NC-10), and the UI uses "Linked source", "Recorded provenance" and "Source reference (exact revision)" — never "Evidence proves…".
- **Reads.** `listCaseSources` shows one case's links only (keyset, `q` over role and scope note); `getCaseSource` returns the link with its ETag; unknown ids are 404.

## 7. Source-scope enforcement

One rule set (`modules/sources/source-scope.ts`) serves every case citation — a link, the canonical and packet sources, a selection's basis source — mirrored on the client (`apps/web/src/app/sources/scope.ts`) so pickers offer only applicable sources; the server decides.

- **Case dimension.** A source whose `scopeBindings.caseIds` is non-empty applies only to the cases it names (another case: 422 `CROSS_CASE_REFERENCE`) and to no directory, route or authority record (`CASE_SCOPED_SOURCE`, unchanged). Naming the case is explicit scope for its agency, but an agency's own source stays its own (`CROSS_AGENCY_REFERENCE`) and an agency restriction that leaves out the case's agency is not overridden (`NOT_SCOPED_TO_AGENCY`).
- **Agency dimension.** Otherwise as for an agency record: the case's agency's own source, or an agency-less source naming that agency.
- **Subject dimension.** A subject-scoped source needs a bound route whose legal subject it names (`SCOPED_TO_OTHER_SUBJECT`); without a route there is nothing to check it against (`CASE_SUBJECT_UNBOUND`).
- **Owner dimension.** With a bound route, another owner's material is 422 `CROSS_OWNER_REFERENCE`. A case link does not itself make a source any owner's material.
- **createSource.** May now name cases: each must exist (422) and be unarchived (409), and an agency's own source may name only that agency's cases (422 `CROSS_AGENCY_REFERENCE`). A revision keeps its scope (unchanged). `CASE_SCOPE_UNAVAILABLE` is retired.
- Tests: the applicability matrix (`tests/api/source-rules.test.ts`, 54 rows including 17 for cases) and the DB tests for links, canonical bindings, packet sources, selections and createSource ("createSource names only existing, unarchived cases…", and the P3A unknown-case refusal); negative controls NC-01, NC-04, NC-14, NC-14b and NC-14c.

## 8. CaseAuthoritySelection

"The authority chain selected/pinned for evaluation in this specific Case" — never G1 PASS, confirmed current authority, adjudicated validity, signer eligibility, G7 or readiness (API comments, UI copy and this report).

- **Explicit request only.** Nothing selects authority implicitly: not a route binding, a freeze, the route's preferred coverage or default signer, the latest or only version, the same agency or matching names. The form preselects nothing.
- **Checks** (all under the case's `If-Match`; every refusal writes nothing): the case is unarchived and has a bound route; `routeId` equals it (422 `AUTHORITY_SCOPE_UNRESOLVED` CASE_ROUTE_UNBOUND / NOT_CASE_ROUTE), unarchived and LINKED with usable parties (409). The signer exists, acts for the case's agency (422 `CROSS_AGENCY_REFERENCE`) and is neither archived nor ENDED (409). Each of 1–20 distinct coverages exists, belongs to the case's agency (422 `CROSS_AGENCY_REFERENCE`), names the case's route (422 `AUTHORITY_SCOPE_UNRESOLVED` OTHER_ROUTE), sits in a FROZEN version (409 `VERSION_NOT_FROZEN`) of an unarchived mandate of an unarchived agency (409), and records the signer as a CoverageSigner (422 `AUTHORITY_SCOPE_UNRESOLVED` SIGNER_NOT_RECORDED). The optional basis source applies to the case (§7).
- **No currentness.** Dates, expiry, UNTIL_TERMINATED, a freeze, "latest" and the absence of events are not evaluated; an expired or superseded frozen version is pinned exactly as chosen (test "no currentness…"). `taskType` is recorded as supplied; no mapping to the coverage's action-scope vocabulary is invented.
- **Effect.** One append-only selection row and one CaseAuthorityCoverage row per chosen coverage (§9); the case's `currentAuthoritySelectionId` moves to it with `rowVersion` and `contextRevision` +1. No authority record changes — mandate, version, coverage, coverage signer, signer and route keep their row versions (test, NC-11a). The selection has no ETag and no update or delete.
- **History.** `listCaseAuthoritySelections` lists every selection of the case, newest first; the UI marks the one the case points to as "In use for evaluation" and the others as "Earlier selection". Earlier selections and their pinned coverage rows never change (NC-06a), and a case with history keeps its route (NC-06b).

## 9. CaseAuthorityCoverage

- One row per chosen coverage, created only by `selectCaseAuthority`: the selection, the exact `coverageId` and the `applicationScope` stored exactly as entered. Each coverage keeps its own application scope; nothing is combined, unioned or computed.
- Rows are never updated or deleted; a newer version or coverage never re-points them (test "exact ids stay pinned…").
- **Contract gap (reported, not worked around).** No contracted operation reads these rows back: `CaseAuthoritySelection` and its page carry the selection row only; the ids of the created rows appear in the create response's `meta.affectedResources`. The UI therefore shows the chosen chain while a selection is being made and, in the history, the contracted selection fields; it states the limitation ("The coverages a selection pins are stored with it, but the contract has no operation that reads them back yet…"). The DB tests verify the rows directly. Reading them back needs an approved contract amendment.

## 10. Case isolation

- **Server.** Every read and write is keyed by the case id in its path; links and selections of one case are listed only for that case; a case-scoped source applies only to the cases it names; a case never reaches another agency's route, signer, coverage or source, even with identical names (CONTAMINATION tests, §15).
- **UI.** The case page, the link form and the selection form are rebuilt per case (React `key` on the case id, loaders keyed by it), so no link, selection, status message, open dialog, entered text or source choice of case A appears in case B (web test "switching from case A to case B…", NC-12 / NC-12b; browser scenario 17 with in-place navigation).

## 11. Shared write layer: ETag, idempotency, audit

- All 11 P4A writes go through `WriteExecutor`: contract parse (422) → Idempotency-Key (400) → `If-Match` for the 10 conditional operations (428 missing; 412 stale, foreign or a child's ETag; 404 before 412) → claim → one READ COMMITTED transaction with row locks in the lock order, the business rules, the change with `rowVersion` +1, the audit event and the idempotency completion → bounded deadlock retry. Failures release the claim.
- ETags: `"CaseRecord:<id>:v<n>"` and `"CaseSource:<id>:v<n>"`; a selection has none (append-only).
- Audit: CASE_CREATED, CASE_UPDATED, CASE_DELETED, CASE_ARCHIVED, CASE_RESTORED, CASE_WORKFLOW_CHANGED, CASE_ROUTE_BOUND, CASE_CANONICAL_BOUND, CASE_SOURCE_LINKED, CASE_SOURCE_LINK_STATE_CHANGED and CASE_AUTHORITY_SELECTED — ids and metadata; notes, scope notes, selection notes and application scopes only as `{redacted, codePoints}`; no source content is copied.
- Tests ("SHARED WRITE LAYER"): the 10 conditional operations (428/412/404, nothing written); Idempotency-Key for every write family (required; an exact replay returns the stored result once; another payload is 409); a running claim is 409 with Retry-After; refused requests are never stored; two tabs and concurrent writers (one winner, the others 412); a failing audit insert rolls back every P4A write — no row, no version change, no idempotency record (NC-07, NC-08, NC-09).
- Error codes: only codes that already exist where they fit — the frozen stable codes (`CROSS_CASE_REFERENCE` is one of them) and the codes introduced in P2–P3B — namely `CROSS_AGENCY_REFERENCE`, `CROSS_CASE_REFERENCE`, `CROSS_OWNER_REFERENCE`, `AUTHORITY_SCOPE_UNRESOLVED`, `SOURCE_SCOPE_UNRESOLVED`, `RECORD_STATE_CONFLICT`, `RECORD_VERSION_CONFLICT`, `REFERENCED_RECORD_CANNOT_DELETE`, `BINDING_CORRECTION_REQUIRES_RECONCILIATION`, `SOURCE_NOT_CURRENT`, `SOURCE_ROLE_NOT_VERIFICATION`, `DUPLICATE_CANONICAL_CODE`, `VERSION_NOT_FROZEN` and `IDEMPOTENCY_*`; plus one new implementation code inside the free-string `code` field with a contracted status (R6 decision 10): `DUPLICATE_CASE_SOURCE` (409).

## 12. UI and browser verification

Pages (React, no new dependency; the P2–P3B design system): **Cases** in the shell navigation (Production stays "Not implemented"); the Cases list (search over intake label and canonical case id, agency and workflow filters, keyset pages); New case; the case page with Case context, Workflow, Route, Canonical case id, Linked sources, Selected authority records for evaluation, Notes and Record sections; Edit case; Link a source; Select authority materials for evaluation; dialogs for workflow, archive, restore, delete, route binding, canonical binding and link state. The source form can name cases ("Cases named").

- **Wording.** "A case is the boundary of its case-specific records. It is not a legal verdict…"; "A linked source is associated with this case — nothing more…"; "Selected authority record"; the prominent "This selection records which authority materials will be evaluated for this Case. It is not a G1 decision." on the case page, the selection form and its chain summary. Stamps are neutral (workflow states, Archived, In use for evaluation, Earlier selection). There is no AUTHORIZED, APPROVED, VALID AUTHORITY, CURRENT AUTHORITY, READY, ELIGIBLE, G1/G7 PASS, verified, confidence or trust label.
- **Explicit choices.** The route picker offers only the case agency's routes (unavailable ones inert with the reason); the selection form preselects nothing — the route's default signer and preferred coverage are shown as suggestions only, draft-version coverage is counted but not offered, and coverage that does not record the chosen signer is inert with the reason; each chosen coverage needs its own application scope.
- **Inspectable chain.** While a selection is made: Agency, Route (owner · legal subject · platform) and, for each coverage, Mandate → Version (Frozen) → Coverage with its recorded dates, action scope and recorded signers, plus a summary of the chain to be pinned. In the history (the contracted selection fields, §9): Agency, Route, the signer named, task type, intended sender, basis source with its recorded provenance, note and "Recorded by you (application user)".
- **Unavailable actions** stay visible but inert (`aria-disabled` + reason); refusals are explained and focus moves to them.

**Playwright MCP (mission §34): 23/23 PASS** on `yarn ui:sandbox` (compiled API on the disposable `tb_notice_test`, isolated headless browser, synthetic data only; rows deleted and `db:verify test --expect-empty` PASS afterwards). Details, forced-request refusals, console summary and 18 screenshots: `evidence/p4a-playwright-mcp-verification.txt`, `evidence/screenshots/`. Three findings were fixed in `b6aeeac` with web tests and negative controls, and re-verified in the browser:

- **F1** The route-binding dialog opened with focus on the document body (its route options load after it opens). Now the route fieldset takes the dialog's first focus.
- **F2** The link form's hidden search label read "Find a source for source". The field is now "Source to link".
- **F3** At 390px the case page scrolled sideways: the link table's visually hidden "Actions" header (absolutely positioned) escaped the table's scroll frame. The header is now visible text, as in the P2 tables; all six case pages were re-measured without horizontal page scroll.

## 13. Negative controls

Scratchpad runner (outside Git): each control disables exactly one protection by an exact text replacement (or injects the forbidden behaviour), runs every responsible suite — each must FAIL — then restores the file and verifies it byte-identical by SHA-256. Final run 2026-09-24T16:46:25Z–16:47:32Z on the final code head `6330aeb`; the working-tree fingerprint (tracked diff plus untracked files) was identical before and after, and `db:verify test --expect-empty` passed afterwards. An earlier full run (22 controls, 16:26:12Z–16:27:26Z) on the code before `6330aeb` gave the same result. Log with the replacements and the failing test names: `evidence/p4a-negative-controls.txt`.

**Result: 24/24 controls made every responsible suite fail as expected; all files were restored byte-identically.**

| Mission area | Controls |
|---|---|
| case isolation / case scope | NC-01 case dimension of the source scope disabled; NC-14 createSource accepts unknown cases; NC-14b … archived cases; NC-14c … another agency's cases for an agency's own source |
| route binding | NC-02 another agency's route; NC-03 owner hint and route owner disagree |
| CaseSource scope | NC-04 a source that does not apply is linked |
| chain compatibility | NC-05a signer not recorded under the coverage; NC-05b coverage of another route; NC-05c coverage of a draft version |
| history | NC-06a earlier selections change; NC-06b a history-bearing case's route is replaced |
| ETag / idempotency / audit | NC-07 PATCH ignores If-Match; NC-08 a replay repeats the write; NC-09 an audit failure is swallowed |
| provenance no-upgrade | NC-10 linking a source upgrades it to DOCUMENT_REVIEWED |
| selection ≠ G1 | NC-11a selecting writes back to the coverage; NC-11b the UI calls a selection approved authority |
| UI isolation | NC-12 the case page is not rebuilt per case; NC-12b the link form is not rebuilt per case |
| delete safety | NC-13 dependency blockers ignored |
| browser findings | NC-15 route dialog without initial focus (F1); NC-16 the "Source" label (F2); NC-17 the hidden header (F3) |

## 14. Tests, regression and CI

| Suite | P4A tests | Covers |
|---|---|---|
| `tests/db/p4a-http.test.ts` (tb_notice_test, real AppModule over HTTP) | 39 (new) | CASES (create exactly as supplied; with route and hint; refusals; get/list/filters/keyset; PATCH fields and the two counters; owner hint vs route; packet source); WORKFLOW; ARCHIVE, RESTORE AND DELETE; ROUTE BINDING (binding, refusals, correction before history only, sources re-checked, owner material); CANONICAL BINDING; CASE SOURCES (createSource naming cases, exact pinned link, scope refusals, link states, reads); AUTHORITY SELECTION (exact pinning with no authority change, no currentness, never implicit, the exact chain, append-only history, pinned ids); CONTAMINATION (§15); SHARED WRITE LAYER (§11); SECURITY / CONTRACT (no session, CSRF and Origin refusals write nothing; later case phases, readiness, signing and sending unrouted; every collected response conforms to its operation, no readiness vocabulary, all 16 operations exercised) |
| `tests/api/source-rules.test.ts` | +17 (54) | Case rows of the applicability matrix: named / another case, agency restriction, own agency naming another agency's case, subject with and without a bound route, owner material |
| `tests/web/p4a.test.tsx` (happy-dom) | 15 (new) | Navigation and list filters; create from explicit choices only; the case page's meaning and no authority badge; route binding (and F1 focus); a refused correction; workflow; archive read-only and restore; stale ETag; linking only applicable sources (and F2); link states with the link's ETag (and F3); no selection without a route; the selection form (nothing preselected, exact chain, not G1); a refused selection; case A → case B isolation |
| Earlier suites (adjusted, none removed) | ±0 | `auth-http` / `directory-http`: the routed inventory 76 → 92 operations; `p3a-http`: createSource naming cases (unknown 422, archived 409, another agency's case 422); `web/app`: the Cases navigation |

Totals (home PC, 2026-09-24; per-file counts from JSON-reporter runs with output outside the repository, `evidence/p4a-first-pc-sweep.txt`): `yarn test` **1228** in 32 files (pre-P4A head `d615297`: 1196 in 31; +15 web p4a, +17 source-rules); `yarn test:db` **295** in 8 files (`d615297`: 256 in 7; +39 p4a-http; 294 at the code head `61164fa`, +1 with `6330aeb`). No earlier test was removed. All tests use synthetic data.

**Compiled P4A flow in CI** (`scripts/local/p4a-smoke.ts`, `yarn smoke:p4a`, mission §41): login → Agency + its own sources → Owner + LegalSubject → link → Route → Signer → Mandate → version → coverage → coverage signer → freeze → the route's preferred coverage → Case (only the supplied fields) → PATCH → route binding (the preferred coverage is not selected) → case source link → paused and linked again with the link's own ETag → canonical case id → authority selection (pinned for evaluation; no ETag; the case points to it) → lists → workflow → **expected refusals**: another agency's route (422 `CROSS_AGENCY_REFERENCE`), another case's source (422 `CROSS_CASE_REFERENCE`), the application User as signer (422 `REFERENCE_NOT_FOUND`), a stale case ETag (412) and a link on an archived case (409) → archive / restore → deletion of an unused case → provenance unchanged → later case phases not routed (404) → logout. Every response is checked against the contract and for `Cache-Control: no-store`. It refuses to run unless `CI=true` (verified locally) and leaves its synthetic records in the disposable CI `tb_notice_dev` only. `smoke:local` now also checks the case collections without a session (401, also through the web proxy), a selection without Origin (403) and a later case phase (404).

**Regression sweep** (mission §42; 2026-09-24T16:47:43Z–16:51:50Z, the final code head `6330aeb` plus the uncommitted documentation; `evidence/p4a-first-pc-sweep.txt`) — all 21 steps exit 0. An earlier full sweep (16:28:04Z–16:32:11Z) on the code later committed as `2cae729`–`61164fa` also passed every step (`yarn test:db` 294).

| Command | Result |
|---|---|
| `yarn reference:check` (before and after) | frozen references intact |
| `yarn reference:helper-tests` | 27 pass, 0 fail |
| `yarn contracts:check` | 3 generated outputs match the active source |
| `yarn install --immutable` | lockfile unchanged (with the pre-existing YN0086 peer-dependency warning, as before P4A) |
| `yarn typecheck` · `yarn format:check` | exit 0 |
| `yarn lint` · `oxlint --deny-warnings` | exit 0 · exit 0 — **0 warnings** (the R7-era warning was fixed in `d615297`; CI prints "Found 0 warnings and 0 errors.") |
| `yarn test` | 1228 / 1228 in 32 files |
| `yarn test:db` | 295 / 295 in 8 files (`tb_notice_test`) |
| `yarn db:verify test --expect-empty` (before and after) | PASS, domain rows 0 |
| `yarn db:verify dev` | PASS (metadata and a row count only: 5, as at R5–R7; no row content read) |
| `yarn db:status test` / `dev` | up to date (1 migration) |
| `yarn db:drift:diff-migrations` / `db:drift:diff-datasource dev` | empty migration (no drift) |
| `yarn build` | exit 0 (Vite advisory on the bundle size, §18) |
| `yarn smoke:local` | 36 checks (P3B: 33) |
| `yarn dev:verify-shutdown` | 4 / 4 scenarios |

`git diff d615297..6330aeb` shows no change under `apps/api/prisma`, `packages/**`, `docs/reference/**`, `yarn.lock`, `.yarnrc.yml` or `.nvmrc`; `package.json` adds only the script `smoke:p4a`. Nothing was written to `tb_notice_dev`.

**CI** — push run [36028683469](https://github.com/TuongChris/tb-notice-production-system/actions/runs/36028683469) for the code head `61164fa` (2026-09-24T16:37:39Z–16:44:39Z): **success**, both jobs (`evidence/p4a-ci-run-36028683469.txt`). Non-DB job (cold install): reference check and the 27 helper tests, `contracts:check`, lint "Found 0 warnings and 0 errors.", format, `yarn test` 1228 / 1228 in 32 files, build, frozen references and working tree unchanged. DB job: migration and metadata verification on test, replay (second deploy a no-op) and dev; `yarn test:db` 294 / 294 in 8 files; synthetic seed twice (canonical digest unchanged); both Prisma drift diffs empty; `smoke:local` 36 checks; `smoke:auth` 4; `smoke:directory` 14; `smoke:p3a` 24; `smoke:p3b` 36; **`smoke:p4a` 47 checks, including the five expected refusals**; P1.1 recovery commands; `yarn dev` clean shutdown 4 / 4; frozen references unchanged. The test-only commit `6330aeb` and the documentation commit are pushed together; a commit cannot record its own run, so the run of the submitted head is reported with R8.

## 15. Contamination tests (mission §37 of the P3B pattern; mission §10, §16 and §32 here)

| Requirement | Test (`tests/db/p4a-http.test.ts` unless noted) |
|---|---|
| Nothing of case A appears in or supports case B | "two cases on one route: links, selections, canonical ids, workflow and archive stay with their own case"; web "switching from case A to case B…"; browser scenario 17 |
| A case-scoped source never supports another case | "link refuses sources that do not apply…"; "refuses a superseded revision, … another case's source…"; source-rules matrix; `smoke:p4a` refusal (422 `CROSS_CASE_REFERENCE`) |
| A case never reaches another agency's records, even with identical names | "two agencies with identical names: a case never reaches the other agency's route, signer, coverage or source"; `smoke:p4a` refusal (another agency's route) |
| Another owner's material never follows a case | "another owner's material cannot follow a case onto a route of that owner's rival" |
| No selection is implicit or inherited | "never implicit: the route's preferred coverage is not selected…"; "exact ids stay pinned: a newer source revision, a new default signer or a new preferred coverage changes no selection" |
| The application User is never a Signer, owner, reviewer or case fact | "the application User is only the actor…"; `smoke:p4a` refusal (the User as signer → 422 `REFERENCE_NOT_FOUND`) |
| No later case record exists | "later case phases, readiness, signing and sending stay unrouted"; `smoke:local` / `smoke:p4a` (404) |

## 16. Database changes

**None.** No migration was needed, created or applied: the existing schema (`20260923103912_initial_schema`, sha256 `b54c36fd…6515`, still the only migration) already holds every P4A table, field, CHECK and foreign key, including the composite same-agency keys used as backstops. `db:verify` passes on test (empty) and dev; both Prisma drift diffs are empty (§14). No `db push`, `migrate reset`, FK disabling or applied-migration edit.

## 17. Interpretations for R8 review

| Topic | Decision taken | Why |
|---|---|---|
| Established case lock | No extra identity lock beyond the contract: agency, platform and class are not in `PatchCase`; route, canonical id, workflow and selection have their own commands | The contract already keeps every identity-defining field out of the generic PATCH |
| Owner hint | Checked only for existence and archive state while no route is bound; afterwards null or the route's owner | A hint is not a binding, but the case context must not contradict its route |
| Route correction | Allowed only before the case has history (selection, fact, prompt, correspondence, candidate); every source the case relies on is re-checked | INVARIANTS §4; the prior authority chain must never be erased |
| Selection route | `routeId` must equal the case's bound route | INVARIANTS §3 ("…belongs to the Case and the same current Route") |
| Paused / draft signer | A PAUSED or DRAFT signer may be named; archived or ENDED is refused | R6 decision 4 / R7 decision 4: administrative state, not legal authority |
| Coverage usability | FROZEN version of an unarchived mandate of an unarchived agency, of the case's route, recording the signer | INVARIANTS §4; R7 decision 6 (revalidate the coverage) |
| Task type | Recorded as supplied; not mapped to the coverage's or signer's action-scope vocabulary | No mapping is defined; scope review belongs to later G1 evaluation |
| Link uniqueness | One link per (case, source, role); a relink goes through the link state | The unique key; history of one association stays on one row |
| Delete blockers | Any foreign key or JSON scope reference, a canonical binding or the archive flag | "Never delete dependencies just to make Case deletion succeed" |
| Case-scoped sources | An agency's own source may name only its agency's cases; naming a case does not override an agency restriction | INVARIANTS §3 "no global access from null agency" |
| Context revision | Moves with route, canonical id, links and their states, selection, owner hint, packet source and Drive folder; not with the label or notes | It signals a change of what the case relies on |

## 18. Deviations, warnings and limitations

- **Contract gap — CaseAuthorityCoverage is not readable** (§9). Reported for R8; no wire change was made. The UI states the limitation.
- **Build advisory (new).** `vite build` warns that the web bundle exceeds 500 kB after minification: 548.82 kB (gzip 151.26 kB) against 495.26 kB at `d615297`, the P4A pages adding about 54 kB. It is a Vite advisory, not a lint finding or error. The limit was not raised and no code splitting was added (an architecture choice outside this mission); route-level code splitting can be decided separately.
- **Pre-existing UI observations (unchanged):** the shared `ReasonDialog` focuses its Reason field even when a select precedes it (here the workflow dialog; the accepted P3A route link-state dialog behaves the same); the source picker fetches each listed source after the list; the source form's case and subject checklists briefly show "Not recorded" while loading; the list-table scroll frame of earlier phases is not itself focusable.
- **Browser tool artefact.** Two targeted Playwright MCP snapshots showed a stale "Loading applicable sources…" view while the full snapshot and in-page evaluation showed the list loaded (§12 evidence). Not an application defect.
- `yarn install` still reports the pre-existing YN0086 peer-dependency warning (present before P4A; lockfile unchanged).
- `smoke:p4a` writes records and runs only in CI (`CI=true`); on the home PC the same operations were exercised through the browser pass on `yarn ui:sandbox` and the DB suite.
- Session-row and idempotency-record retention cleanup remain DEFERRED (unchanged, non-blocking).
- Context7 was not used (no version-specific library question arose); the optional frontend-design skill was not used — the P4A pages reuse the P2–P3B design system. The headless browser used Linux fallback fonts.

## 19. Blockers

None.

## 20. Proposed next phase (not started)

**P4B — Case intake material** (gate R9; needs its own explicit, approved mission): the contracted ReportedItem (6: list, create, get, patch, archive, restore), CaseWork (6), UseMapping (6) and CaseFact (4: list, create, get, revise) operations — the case-specific material that later evaluation and production rely on, recorded exactly as supplied with sources pinned to this case, and none of it a finding of infringement, permission, exception or fair use. Excluded: correspondence, production context, prompts, candidates, validation, assessments, readiness, G1–G7, READY_FOR_SIGNER, signing, sending and any external action. Nothing of it is started.
