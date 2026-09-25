# P4D — Production context (home PC)

Mission **TB_R10_CLOSEOUT_MERGE_AND_P4D_PRODUCTION_CONTEXT_TO_R11**, steps 9–11. Branch `feature/p4d-production-context`, created from the exact post-P4C `main` `ed5b3d7` (merge commit of PR #6), with the R10 closeout checkpoint `ca3d7cd` (documentation only). P4D implements **one** contracted operation, `getProductionContext` (GET `/cases/{caseId}/production-context`, TB-SCHEMA-API-v1.2.0), and its page. It is a **read**: it assembles recorded case context for one task and determines nothing.

Submitted for review gate **R11 — PENDING**. No P4D pull request, no merge, and nothing of a later phase (prompts, candidates, validation, assessments, readiness, unsigned export) is started.

Persistent rules (they stay in force after R11; `CLAUDE.md` carries them):

- **Context = recorded input, not a legal conclusion.** It is what a later production step may inspect. It is never a G1–G7 decision, READY_FOR_SIGNER, legal approval, an ownership, permission or infringement finding, a current-authority adjudication or signer eligibility.
- **Exact case isolation.** Only the path case's own records; another case's selection or binding is refused (422 `CROSS_CASE_REFERENCE`), nothing of one case is used, copied or inherited by another.
- **Exact authority pinning.** The authority block is exactly the named selection and the chain it pinned — never the route's default signer or preferred coverage, a newer version, coverage or source revision, or a union of anything else.
- **No latest/default substitution.** Nothing is chosen for the caller: no current selection, latest NMI, default binding or later transmission stands in for a selector that was not named.
- **MISSING stays missing; CONFLICT stays conflict.** A MISSING fact is listed as missing and never read as false or negative; recorded conflicts are listed and never resolved or dropped.
- **Correspondence posture stays visible; `*_AS_SENT` does not imply a verified package.** Capture mode and body role are shown as recorded; an OPERATOR_REPORTED transmission keeps its limited posture.
- **One consistent snapshot per read; a complete dependency closure; the digest is never merely `Case.rowVersion`.**
- **No readiness and no external action.** The read writes nothing (no audit event, idempotency record, revision or row version) and sends, fetches, contacts, drafts or signs nothing.

## Status by scope (not collapsed)

| Scope | Status |
|---|---|
| R10 closeout (steps 1–8) | **DONE** — R10 = PASS recorded; P4C merged to `main` by PR #6 (merge commit `ed5b3d7`); post-merge `main` CI green; branch created from `ed5b3d7`; checkpoint `ca3d7cd` (§2) |
| P4D implementation (step 9) | **IMPLEMENTED** on `feature/p4d-production-context` — code head `1b012bd` (§3) |
| P4D home-PC automated tests | **PASS** — `yarn test` 1397 / 41 files, `yarn test:db` 422 / 11 files (P4D: 42 DB, 12 unit, 8 web) (§21) |
| Consistent-snapshot test | **PASS** (§4, §21) |
| Browser verification (Playwright MCP, `tb_notice_test`) | **PASS** — 32/32, one keyboard-focus finding fixed and re-verified (§19) |
| Negative controls | **PASS** — 22/22 on `1b012bd` (the first run found one test weakness, fixed) (§20) |
| Full regression (§54 of the mission) | **PASS** — 21/21 steps exit 0 on `1b012bd`, lint 0 warnings (§21, `evidence/p4d-first-pc-sweep.txt`) |
| Exact final branch CI | Recorded in the R11 report (the final head is the commit that adds this record) |
| Schema / migration | **No change** (§23) |
| Wire contract | **No change** — TB-SCHEMA-API-v1.2.0 (§24) |
| R11 review | **PENDING** — no pull request, no merge |

## 1. Operation matrix and design (contract-first)

### 1.1 Exact contract scope

| Item | Contract (TB-SCHEMA-API-v1.2.0, verified in `packages/contracts/src/api/operations.ts` and the frozen OpenAPI) |
|---|---|
| Operation | `getProductionContext` · GET `/cases/{caseId}/production-context` · tag Production · session-protected |
| Path | `caseId` UUID |
| Query | `taskType` **required** `INITIAL` \| `NMI_REPLY`; `generationMode` **required** `PREPARATION` \| `DRAFTING`; `authoritySelectionId` UUID, optional; `parentBindingId` UUID, optional; `priorBindingIds` UUID array 0–100, form style, exploded (the key repeated once per id); nothing else |
| Success | 200 `{ data: ContextView, meta }`; no ETag; `Cache-Control: no-store` |
| Errors | 400 401 403 404 409 413 422 429 500 (no 412/428: no precondition target, no idempotent write) |
| ContextView | `{ contextRevision, dependencyDigest (hex 64), dependencies[0..1000] {entityType, entityId, rowVersion?, fingerprint}, context }` |
| context | ProductionContext `PFC-YT-EMAIL-v1.1`: schemaVersion, caseId, canonicalCaseId, taskType, generationMode, caseContextRevision, party, authoritySelectionId, reportedItems ≤100, works ≤100, mappings ≤1000, facts ≤1000, sources ≤1000, parentBindingId, priorCorrespondenceIds ≤100, missing ≤1000, conflicts ≤1000, the four fixed literals, authority (selection + coverages 1–20 with signerScopes and authorityEvents) \| null, correspondence ≤100, policySources ≤100 |
| Not on the wire | the selection's per-coverage `applicationScope`, FactSource rows, a case-source link's present state — they are dependencies (fingerprints) of the context; the page reads them through the existing contracted reads and shows them apart |

The 121 earlier business operations are unchanged; P4D routes one more (122). Every later operation — `generatePrompt`, prompts, candidates, validation, assessments, readiness, unsigned export — stays unrouted (404; tested).

### 1.2 Frozen rules that decide the design

- INVARIANTS §5: "Get context uses a consistent database snapshot"; source/context drift is detected by the dependency closure; §6 exact bytes/digest contract (TB canonical JSON v1, the frozen `consistency-reference.mjs`).
- INVARIANTS §4: "Reply generation requires explicit parent NMI binding and prior AS_SENT selections."
- Production Form Contract §4 "Required content" (party namespace, legal subject and proposed signer; the exact authority selection; reported items, works and use mappings; the reply's parent NMI).
- P4A: a selection is the authority chain selected/pinned for evaluation in one case — never G1; nothing auto-selects; no currentness. P4B: a CaseFact is recorded with its provenance as supplied; MISSING is never false; supports stay pinned. P4C: capture ≠ send; OUTBOUND ≠ AS_SENT; one message with several bindings is one message; OPERATOR_REPORTED is never upgraded.

### 1.3 Design decisions

- **D1 Snapshot.** One Prisma interactive transaction at REPEATABLE READ (`maxWait` 2 s, `timeout` 5 s). InnoDB fixes the consistent snapshot at the first read — the case row — and every later read of the request goes through the same transaction. Only plain SELECTs; no lock, no write. A test seam (`CONTEXT_READ_OBSERVER.afterSnapshot`, a no-op in the application) runs right after the case row; the snapshot test binds an observer that commits concurrent changes at exactly that point.
- **D2 Explicit selectors only.** No fallback to the case's current selection, the latest NMI or any AS_SENT binding. Unknown → 422 `REFERENCE_NOT_FOUND`; another case's → 422 `CROSS_CASE_REFERENCE`; a parent or prior binding with INITIAL → 422 `SELECTOR_NOT_FOR_TASK` (refused, never ignored); a parent that is not an NMI binding → 422 `REPLY_PARENT_REQUIRED` `{reason: NOT_NMI}`; a prior binding not recorded as sent (`INITIAL_AS_SENT`, `REPLY_AS_SENT`, `SUPPLEMENT_AS_SENT`, `CORRECTION_AS_SENT`) → 422 `PRIOR_BINDING_NOT_AS_SENT` — a message's direction never makes one; a corrected (superseded) parent or prior → 409 `BINDING_ALREADY_SUPERSEDED` `{field, successorId}` — the correction is not used in its place; a prior named twice → 400 `INVALID_QUERY_PARAMETER`.
- **D3 DRAFTING gate.** The same assembly for both modes. DRAFTING is refused when a blocking missing code is present: `CASE_ROUTE_UNBOUND`, `AUTHORITY_SELECTION_NOT_SELECTED`, `REPORTED_ITEMS_ABSENT`, `WORKS_ABSENT`, `USE_MAPPINGS_ABSENT`, `REPLY_PARENT_NOT_SELECTED`, `PRIOR_AS_SENT_NOT_SELECTED` (PFC §4 required content and the INVARIANTS §4 reply rule). A reply without its parent → 422 `REPLY_PARENT_REQUIRED` `{field, reason: NOT_SELECTED, missing}`; otherwise 422 `DRAFTING_INPUT_MISSING` `{missing}` — both name every blocking code. PREPARATION returns the context with the gaps listed. Neither mode is readiness.
- **D4 Never cut.** A context above a contracted bound is refused whole: 409 `PRODUCTION_CONTEXT_TOO_LARGE` `{field, count, maximum}`. A source whose scope text or limitations exceed the 5,000 code points a manifest entry holds is not listed rather than cut: it stays a dependency and a `SOURCE_MANIFEST_TEXT_TOO_LONG` missing item names it.
- **D5 Digest.** SHA-256 of the TB canonical JSON v1 of `{algorithm: TB-PRODUCTION-CONTEXT-DIGEST-v1, contract: TB-SCHEMA-API-v1.2.0, schemaVersion: PFC-YT-EMAIL-v1.1, scope, dependencies[{entityType, entityId, fingerprint}]}` — row versions excluded (a diagnostic only), no clock.
- **D6 Error codes.** New implementation codes inside the free-string `code` with contracted statuses: `SELECTOR_NOT_FOR_TASK`, `REPLY_PARENT_REQUIRED`, `PRIOR_BINDING_NOT_AS_SENT`, `DRAFTING_INPUT_MISSING`, `PRODUCTION_CONTEXT_TOO_LARGE`; frozen/stable codes where they fit (`REFERENCE_NOT_FOUND`, `CROSS_CASE_REFERENCE`, `BINDING_ALREADY_SUPERSEDED`, `INVALID_QUERY_PARAMETER`, `NOT_FOUND`).

## 2. R10 closeout and branch (mission steps 1–8)

Recorded in `docs/verification/p4c/P4C_CORRESPONDENCE.md` §29–§30 (verified with `git` and authenticated `gh`, not assumed):

| Item | Value |
|---|---|
| R10 | **PASS** (operator, 2026-09-25) — P4C VERIFIED_COMPLETE |
| P4C pull request | [#6](https://github.com/TuongChris/tb-notice-production-system/pull/6) `feature/p4c-correspondence` → `main`, head `edebb80`; pull_request run 36152011037 success |
| Merge | **merge commit** `ed5b3d743c8c64dc1c54b38e2e13bd9aa80d5921` (parents `d2b6f00`, `edebb80`; tree identical to `edebb80`), merged 2026-09-25T15:17:05Z; no squash, rebase, `--admin` or branch deletion |
| Post-merge `main` CI | push run [36153127772](https://github.com/TuongChris/tb-notice-production-system/actions/runs/36153127772) on `ed5b3d7` — success (both jobs) |
| P4D start | `feature/p4d-production-context` from the exact `origin/main` `ed5b3d7`; checkpoint commit `ca3d7cd` (documentation only; P4D NOT_STARTED at that commit) |

## 3. Implementation (commits)

| Commit | Content | CI |
|---|---|---|
| `ca3d7cd` | R10 closeout checkpoint (documentation only) | — |
| `75f07c2` | API: `modules/production/*` (scope, snapshot, assembly, dependencies, service, controller, module, observer seam), TB canonical JSON v1 port (`infrastructure/integrity/tb-canonical-json.ts`), six error builders, array/required query parsing (`request-parsing.ts`); `tests/db/p4d-http.test.ts` (42), `tests/api/production-context-rules.test.ts` (12); inventory and unrouted-path updates in earlier DB tests and smokes; two 401 checks in `smoke:local` | run 36160776299 success |
| `8206bbf` | Web: the production context page (`apps/web/src/app/cases/production-context.tsx`), its route, the case page link, API client, formatting helpers, CSS; `tests/web/p4d.test.tsx` (7) | (pushed with `c7df48b`) |
| `c7df48b` | `yarn smoke:p4d` (CI only) and its CI step | run 36162478106 success — `smoke:p4d` 88 checks |
| `6bbba3a` | Fix from the browser pass: keyboard focus follows a requested read to its outcome (§18) + web test (8) | run 36165581902 success |
| `bfeb9f1` | Test: the forbidden-claims scan also on an authority block without recorded events (from the negative-control design) | (local; pushed with the record) |
| `1b012bd` | Test: the claim scans read text nodes joined by spaces (from negative-control run 1) | (local; pushed with the record) |

40 files changed against `ed5b3d7` before this record. No migration, no generated contract artifact, no dependency or lockfile change.

## 4. Consistent snapshot

`ProductionContextService.get` parses the scope (request-only rules, no database), then runs `readContextRows` inside `$transaction(…, {isolationLevel: RepeatableRead})`. The first statement reads the case row (404 if absent), which fixes the snapshot; the observer seam follows; every selector check and every other read uses the same transaction. Assembly, the bounds check and the DRAFTING gate run on the rows after the transaction; nothing long or external happens inside it.

Tests (`CONSISTENT SNAPSHOT`): an observer commits, after the first row, a new fact revision, a reported item, an authority event, a source revision and a link pause — the in-flight result equals the baseline and the next read has all of them; a selection recorded in flight does not move the case pointer inside that read, and a refused read in flight stays refused with the snapshot's view. Negative control NC-P4D-16 (READ COMMITTED) is caught.

## 5. Request scope and selectors

`contextScope` (before any database access): required task and mode (contract), priors each named once (400), INITIAL with a parent or priors → 422 `SELECTOR_NOT_FOR_TASK`. In the snapshot: the selection must exist and be this case's; each binding must exist, be this case's, have the task's event type (parent NMI; prior `*_AS_SENT`) and be the current interpretation of its message (no successor). Nothing is chosen for an omitted selector.

## 6. Party resolution

`party.agencyId` and `agencyLegalName` from the case's agency (as recorded). `ownerId`, `legalSubjectId` and `legalSubjectName` only through the case's **bound route** (its OwnerSubject association) — never from the owner hint or from names; without a route they are null and `CASE_ROUTE_UNBOUND` is listed. `signerId` and `signerFullLegalName` only from the **named selection's** signer; without one they are null and `AUTHORITY_SELECTION_NOT_SELECTED` is listed.

## 7. Canonical case id

`canonicalCaseId` is exactly the case's canonical binding code (P4A) or null. A null is not a missing item (no PFC required content names it); nothing else (the intake label, a Drive folder, an external reference) is used.

## 8. Intake records

Included: the case's **unarchived** reported items, works and use mappings, in recording order `(createdAt, id)`, exactly as stored. An archived record is left out unless an included record still names it — a fact's scope, a mapping's work or item, a selected binding's item — and then it is kept with its archive state as recorded and listed as an `ARCHIVED_RECORD_REFERENCED` conflict (never silently dropped). Nothing of another case (composite keys guarantee the kept records are of this case; an integrity check refuses otherwise).

## 9. CaseFact heads and revisions

`facts` are the **chain heads** of the case (the revision no other revision supersedes), in recording order, exactly as recorded — a WITHDRAWN head stays visible with its resolution state. Earlier revisions are neither listed nor dependencies; each revision moves the case revision and the digest. Supports: the FactSource rows of the included revisions exactly as recorded (R9), never merged across revisions, never re-pointed; a support whose link is now PAUSED or UNLINKED is kept and listed as `SUPPORT_LINK_NOT_LINKED`; more than 100 supports on a revision or a support naming another case's link is an integrity failure (500), never shown. Provenance and resolution state are never upgraded: a support by a DOCUMENT_REVIEWED source does not make a fact DOCUMENT_REVIEWED (NC-P4D-11).

## 10. Source manifest and policySources

`sources` is exactly the source revisions of the closure — the case's canonical binding source and packet source, the sources of the case's LINKED links and of every link a recorded support names, mapping basis sources, the selection's basis source, the authority chain's sources (version primary and additional sources, signed-date sources, coverage bases, coverage-signer sources, event sources) and the selected messages' raw and attachment sources — ordered by id, each entry with its recorded role, canonical URL (never opened), content hash and target as entered, recorded provenance, scope text and limitations. A newer revision of a source is never followed; its existence is part of the source's fingerprint (`headId`). Never a registry sweep: an unrelated source, another case's link, an unlinked and unsupported source are absent.

`policySources`: only POLICY_REFERENCE sources **explicitly LINKED to this case**; an empty list is the truthful answer. `SOURCE_UNAVAILABLE_AT_CHECK` (missing) and `SOURCE_PROVENANCE_CONFLICT` (conflict) are listed where the records say so.

## 11. Authority selection and events

Only when `authoritySelectionId` is named: the selection as recorded and one block per pinned coverage (ascending coverage id) — the coverage and its version exactly as pinned, the selected signer's coverage-signer rows under that coverage, and the authority events of that mandate that are whole-mandate or scoped to that coverage, **whenever recorded** (before or after the selection), in recording order. An event scoped to another coverage is not included. Successor versions and coverages are read only to make their existence part of the pinned records' fingerprints; they are never used. The route's default signer and preferred coverage are neither used nor part of the route's fingerprint. Administrative states after the selection (an ENDED signer, an archived mandate) do not rewrite it; the changed state changes the digest. Nothing computes currentness, expiry or validity; `AUTHORITY_VERSION_REVIEW_CONFLICT` and `AUTHORITY_EVENT_PROVENANCE_CONFLICT` are listed where recorded.

## 12. INITIAL, NMI_REPLY, prior transmissions and correspondence posture

- **INITIAL:** no parent message and no prior transmissions — named ones are refused (422 `SELECTOR_NOT_FOR_TASK`); `correspondence` and `priorCorrespondenceIds` are empty.
- **NMI_REPLY:** the parent is exactly the named NMI binding; without one, PREPARATION lists `REPLY_PARENT_NOT_SELECTED` (no NMI is chosen by date, subject or text) and DRAFTING is 422 `REPLY_PARENT_REQUIRED`. `priorBindingIds` are exactly the named bindings recorded as sent; unnamed AS_SENT bindings are never added; without one, `PRIOR_AS_SENT_NOT_SELECTED` is listed.
- **Correspondence:** one row per captured message the selected bindings name (a message bound twice appears once; both bindings are dependencies); `priorCorrespondenceIds` is the sorted set of the priors' messages. Capture mode, body role and attachment observations are exactly as recorded. A parent captured as EXCERPT or OPERATOR_REPORTED is listed as `REPLY_PARENT_FULL_TEXT_ABSENT`; a prior not captured as RAW_SOURCE as `PRIOR_AS_SENT_RAW_SOURCE_ABSENT` — its wording and attachments stay at their recorded level. No outcome, receipt, delivery or verification is implied.

## 13. Missing rules (`context.missing`)

Material absences for the requested task, never optional nulls; each item `{code, message, fieldPath}`: `CASE_ROUTE_UNBOUND`\*, `AUTHORITY_SELECTION_NOT_SELECTED`\*, `REPORTED_ITEMS_ABSENT`\*, `WORKS_ABSENT`\*, `USE_MAPPINGS_ABSENT`\*, `REPORTED_ITEM_UNMAPPED` (per unarchived item without a mapping), `REPLY_PARENT_NOT_SELECTED`\* and `PRIOR_AS_SENT_NOT_SELECTED`\* (NMI_REPLY), `REPLY_PARENT_FULL_TEXT_ABSENT`, `PRIOR_AS_SENT_RAW_SOURCE_ABSENT`, `FACT_PROVENANCE_MISSING` ("It is not read as false, absent or negative."), `SOURCE_UNAVAILABLE_AT_CHECK`, `SOURCE_MANIFEST_TEXT_TOO_LONG`. \* = DRAFTING-blocking. Nothing is filled in to close a gap.

## 14. Conflict rules (`context.conflicts`)

What the records themselves record as conflicting, or structurally contradict — never resolved, shortened or turned into a verdict: `ARCHIVED_RECORD_REFERENCED`, `MAPPING_PROVENANCE_CONFLICT`, `FACT_PROVENANCE_CONFLICT`, `FACT_RESOLUTION_CONFLICT`, `SUPPORT_LINK_NOT_LINKED`, `SOURCE_PROVENANCE_CONFLICT`, `AUTHORITY_VERSION_REVIEW_CONFLICT`, `AUTHORITY_EVENT_PROVENANCE_CONFLICT`.

## 15. PREPARATION vs DRAFTING

The same context either way. PREPARATION always returns it (200) with its gaps; DRAFTING returns it only when no blocking code is present, otherwise the 422s of D3 naming every blocking code. The bounds check (409) comes first. A DRAFTING 200 means only that the required input is recorded — not readiness, not a G1–G7 decision.

## 16. Dependency closure, fingerprints and digest

**Closure** (one Dependency per record, in `(entityType, entityId)` order): CaseRecord, Agency, Route, OwnerSubject, Owner, LegalSubject, CaseAuthoritySelection, Signer, CaseAuthorityCoverage, MandateCoverage, MandateVersion, Mandate, CoverageSigner, AuthorityEvent, ReportedItem, CaseWork, UseMapping, CaseFact, FactSource, CaseSource, SourceReference, CorrespondenceBinding, Correspondence — each only when part of the context. `rowVersion` is reported for version-checked records (CaseRecord, Agency, Route, OwnerSubject, Owner, LegalSubject, Signer, MandateCoverage, MandateVersion, Mandate, CoverageSigner, ReportedItem, CaseWork, UseMapping, CaseSource) as a diagnostic only, null for the others.

**Fingerprint** = SHA-256 of the TB canonical JSON v1 (the exact port of the frozen helper; unit-tested against it) of `{entityType, …semantic content}`: operation metadata (createdAt, createdById, updatedAt, updatedById, rowVersion) and archive reasons are left out, an archive timestamp becomes an `archived` flag; the route leaves out its default signer and preferred coverage; a work leaves out its notes; the case record keeps its context-relevant fields and `contextRevision` (not the label, notes or workflow state as fields). Where a later record changes what a pinned record means without changing it, the fingerprint covers that record's existence: a source's head revision, successor versions and coverages, a selected binding's successor (always none when read — a corrected binding is refused).

**Digest** = D5. Tests: the dependencies are exactly the closure of a reply context in order, repeated reads identical; what the context does not rely on (the case's notes, a work's notes, a clock advance, other cases' and registry records) leaves the digest unchanged while row versions may move; what it relies on changes it (a new intake record, a fact revision, a link state, the case's context revision, the named selection, task and mode, a later authority event, a source's newer revision, an administrative state of a pinned record). The unit test recomputes the digest with the frozen helper. Negative controls NC-P4D-13 (row version only), NC-P4D-14 (event omitted) and NC-P4D-15 (random order) are caught.

## 17. Zero-write guarantee

The module issues no write, lock, raw SQL, audit or idempotency call, reads no clock and opens no network, mail, Drive or process client (source scan, unit test). `READ-ONLY` (DB test): repeated successful, refused and DRAFTING reads leave every table byte-identical — no audit event, idempotency record, revision or row version moves, and no later-phase record exists. `smoke:p4d` compares audit, idempotency and later-phase row counts around the read-only spans (CI). Browser: per-table content digests of `tb_notice_test` unchanged across a burst of reads (§19, item 27). The only write any authenticated GET can cause is the P1 session activity touch (`auth_sessions.last_seen_at`, at most once a minute) — not a context write. No response carries an ETag; every one is `Cache-Control: no-store`. No outbound connection or `fetch` happens during a read, even with URLs, addresses and a Drive folder in the records (spied in the DB test).

## 18. UI

Route `/cases/:id/production-context`, opened from the case page's "Production context" section ("Open the production context"). Rebuilt per case (React `key`).

- Header: "Production context", the case, "Case context revision N"; the permanent boundary "This view assembles recorded case context. It does not determine G1–G7 or readiness." and "Showing the context only reads it: no record, revision or history changes, and nothing is sent."
- Scope form: task and mode radios with **nothing preselected**; "Authority selection (optional)" starting at "No selection named" (the case's current selection is only labelled); for NMI_REPLY a parent picker offering only this case's NMI bindings (a corrected one disabled) and prior-transmission checkboxes offering only bindings recorded as sent (never OUTBOUND + OTHER), none ticked; choosing INITIAL drops them. The scope lives in the address; nothing is read before a task and a mode are chosen.
- Refusal: "The context was not returned." with the reason and code; DRAFTING refusals list each gap and offer "Show the preparation context".
- Result sections: Context (task, mode, form contract, context revision, dependency digest, canonical case id, "Read again"), Missing context (dashed neutral rule, "Missing context" tag), Recorded conflicts (solid caution rule, "Recorded conflict" tag — neither styled as a failure), Party, Authority ("Selected for evaluation; not a G1 decision."; the pinned blocks with the application scope read back through `getCaseAuthoritySelection`; events as recorded; "That does not make it current."), Reported items / Works / Use mappings, Facts (heads, provenance and resolution as recorded; a MISSING fact shows its recorded value), Sources and Policy sources (URLs as text, never links; "This record cites revision N; the source now has revision M. The citation does not move to it."), Correspondence (capture posture beside each message, "Parent: request for more information" / "Prior transmission" tags, the AS_SENT copy "Recorded as a past transmission. Capturing this record did not send anything.", captured text in `<pre>` as plain text), Fixed values with their meanings, Dependencies.
- No generate, approve, ready, sign, send, export or submit action; the module navigation keeps "Production — Not implemented".
- Keyboard: after a read asked for on the page (Show context, Read again, Show the preparation context) focus moves to the read's outcome, because the control that asked is replaced while reading; arriving on the page moves nothing (`6bbba3a`, found in the browser pass).

## 19. Browser verification (Playwright MCP, mission §40)

`evidence/p4d-playwright-mcp-verification.txt` and 16 screenshots in `evidence/screenshots/`. Isolated headless Chromium against `yarn ui:sandbox` (compiled API on `tb_notice_test`, synthetic user and data, full cleanup) — session 1 built from `c7df48b`, session 2 from `6bbba3a` (bundle names identical to CI's). **32/32 PASS**; item 30 (keyboard) found that focus fell to `<body>` after a requested read — fixed in `6bbba3a` and re-verified in session 2. Teardown after each session: sandbox rows deleted, `yarn db:verify test --expect-empty` PASS, password files deleted.

## 20. Negative controls (mission §49)

`evidence/p4d-negative-controls.txt`. 22 controls (the 19 listed kinds; UI variants for auto-latest NMI, OUTBOUND-as-AS_SENT and currentness) — each disables one protection by an exact text replacement, runs every responsible command (each must fail and name a test; the first failure message is recorded), restores the files byte-identically. **Final run on `1b012bd`: 22/22 caught and restored, 28 commands, all 28 failing on an AssertionError, none through a 500; tree fingerprint identical; `db:verify test --expect-empty` PASS afterwards.** History kept: the design found the UI currentness gap (`bfeb9f1`); run 1 on `bfeb9f1` did not catch NC-P4D-18 (a "G1 PASS" tag fused with the next label escaped the word-boundary scan of `textContent`) — fixed by `1b012bd`.

## 21. Tests, regression and CI

| Suite | Result |
|---|---|
| `yarn test` | 1397 passed / 41 files (P4D: `tests/api/production-context-rules.test.ts` 12, `tests/web/p4d.test.tsx` 8) |
| `yarn test:db` | 422 passed / 11 files (P4D: `tests/db/p4d-http.test.ts` 42 — query and task scope 8, context content 3, party and authority 5, authority sources 1, intake records 2, facts and sources 6, correspondence 4, dependencies and digest 3, consistent snapshot 2, read-only 1, contamination 2, bounds 1, security and isolation 4) |
| `yarn smoke:p4d` (CI only) | 88 checks — directory → mandate/version/coverage/signer/freeze → two cases → links → selections → item/work/mapping → facts and supports → captures and bindings; INITIAL/PREPARATION, NMI_REPLY and DRAFTING reads; exact pinning (route defaults leave the digest, a later event changes it); seven refusals including cross-case; audit, idempotency and later-phase row counts unchanged around the read-only spans; six later-phase paths unrouted |
| `smoke:local` | 48 checks (two new: the production context is 401 without a session, directly and through the web proxy) |
| Full regression (§54), 2026-09-25T17:32:58Z–17:39:17Z on `1b012bd` | **21/21 steps exit 0** (`evidence/p4d-first-pc-sweep.txt`): `reference:check` and `reference:helper-tests` (27 pass), `contracts:check`, `install --immutable`, `typecheck`, `lint` and `oxlint --deny-warnings` ("Found 0 warnings and 0 errors."), `format:check`, `yarn test`, `yarn test:db`, `db:verify test --expect-empty` and `db:verify dev` (metadata and a row count only), `db:status test` and `dev`, both drift diffs empty, `build` (entry 325.73 kB, no chunk advisory), `smoke:local` 48, `dev:verify-shutdown`, then `reference:check` and `db:verify test --expect-empty` again |

CI: run 36160776299 (`75f07c2`), run 36162478106 (`c7df48b`, first run with `smoke:p4d`), run 36165581902 (`6bbba3a`) — all success, both jobs (`evidence/p4d-ci-run-36165581902.txt`: the key lines of both jobs and every `smoke:p4d` check). The exact final head's run is reported at R11. `yarn test:transition-baseline` stays a documented historical oracle, not a gate.

## 22. Contamination tests

`CONTAMINATION` (DB): two cases of one agency, owner and route with the same video, the same source URL and one message bound to both — each context holds only its own case's records (every id of one case is absent from the other's context text), one case's reported permission answers nothing in the other (its MISSING gap stays), the policy source linked to one case is absent from the other, the shared message appears in each context only through that case's binding, and another case's selection, parent or prior is refused in both directions (422 `CROSS_CASE_REFERENCE`). Changes to one case (an item, a fact revision, a link pause, a selection, a binding, a fact, an archive, a case patch) never change the other's context or digest. Web: another case's page starts with no scope and offers only its own selections and bindings. Browser item 16. Negative controls NC-P4D-01…04 are caught by these tests' own assertions.

## 23. Database changes

None. `20260923103912_initial_schema` is still the only migration; no table, column or index was added (no persistence or cache for the read). `yarn db:verify` passes on test and dev; both drift diffs are empty.

## 24. Contract changes

None. `getProductionContext` is used exactly as contracted in TB-SCHEMA-API-v1.2.0; no field, requiredness, enum, query parameter, release record or PFC version changed; `yarn contracts:check` passes. The new error codes live in the free-string `code` with contracted statuses. `AppMeta.schemaRelease` unchanged.

## 25. Interpretations for R11 review

1. No fallback to the case's current selection when `authoritySelectionId` is omitted (P4A "nothing auto-selects"; the contract makes it optional): the context then has no authority, no signer and a blocking gap.
2. A corrected parent or prior binding is refused (409, naming its correction) rather than silently replaced by the correction or accepted as historical input.
3. The DRAFTING gate uses the PFC §4 required content plus the INVARIANTS §4 reply rule; `REPORTED_ITEM_UNMAPPED`, `REPLY_PARENT_FULL_TEXT_ABSENT`, `PRIOR_AS_SENT_RAW_SOURCE_ABSENT`, `FACT_PROVENANCE_MISSING` and the source items are listed but do not block DRAFTING.
4. Authority events are included whenever recorded (before or after the selection) for the pinned mandates and coverages; the selection does not freeze the event list, the digest records it.
5. `canonicalCaseId` null is not a missing item.
6. Archived intake records are kept only when an included record names them, as a recorded conflict.
7. Manifest text above 5,000 code points is not listed rather than cut, with a missing item; the source stays a dependency.
8. The case record's fingerprint carries `contextRevision`, not the label or notes as fields — so the digest follows whatever P4A counts as case context (see §26, observation 1).

## 26. Deviations, warnings and limitations

1. **Pre-existing P4A documentation discrepancy (not changed).** `P4A_CASE_CORE.md` §149 and `CLAUDE.md` say the intake label does not move `contextRevision`; the accepted P4A implementation (`MATERIAL_PATCH_FIELDS` includes `intakeLabel`) and its accepted test (a rename moves `contextRevision` to 2) do. P4D follows the implementation (a rename therefore changes the digest through `contextRevision`). The operator decides which is intended.
2. **Test weakness in accepted earlier phases (not changed).** 18 forbidden-claims scans in the P3A–P4C web tests read `textContent`, where adjacent elements run together and a claim fused with the next word escapes a word-boundary pattern (found by NC-P4D-18; P4D's own scans were fixed).
3. **Efficiency.** Each source citation on the page fetches its own record (the existing citation component, no cache): a full reply context issues about forty GETs. Correctness is unaffected.
4. The browser pass's one finding (keyboard focus) was fixed before R11 (`6bbba3a`).
5. The P1 session activity touch is the only write an authenticated GET can cause (§17); it predates P4D.
6. P0 second-PC reproduction stays DEFERRED_BY_OPERATOR (ADR-0003); everything here ran on the home PC and in CI.

## 27. Blockers

None. No schema change, contract change, semantic ambiguity outside the accepted rules, authentication, approval or external action was needed.

## 28. Proposed next phase (not started)

Prompt generation (`generatePrompt`, PromptSnapshot persistence) from an exact production context (its digest and dependencies pinned) — only by a separately approved mission after R11. Candidates, validation, assessments, readiness and unsigned export follow in later phases; signing, sending and G7 never exist in the app.
