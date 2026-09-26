# P4G — Technical validation (home PC)

Mission **TB_R13_CLOSEOUT_MERGE_AND_P4G_TECHNICAL_VALIDATION_TO_R14**, steps 9–11. Branch `feature/p4g-technical-validation`, created from the exact post-P4F `main` `5aa9248` (merge commit of PR #9), with the post-R13 checkpoint `b71a2e0` (documentation only). P4G implements **three** contracted operations — `validateCandidate`, `listValidationRuns` and `listValidationIssues` — and the technical-validation section of the candidate page.

**R14 result (operator, 2026-09-26): PASS_WITH_ONE_CONTRACT_REMEDIATION.** P4G is functionally accepted: interpretations V1–V12 and `ENVELOPE.REPLY_RECIPIENT` are ACCEPTED, and V13 is a CONFIRMED CONTRACT READ-BACK GAP (no contracted `GET /validation-runs/{id}`, §30). It is remediated by the mission TB_R14_POST_MERGE_RECONCILE_AND_VALIDATION_RUN_READBACK_REMEDIATION_TO_R14_FINAL (2026-09-26) on `feature/r14-validation-run-readback`: the additive contract release **TB-SCHEMA-API-v1.3.0** (ADR-0006, PROPOSED) and its one new read, `getValidationRun` (§35). The remediation is submitted for **R14 final (PENDING)**. Until the operator's final review, R14 stays **PASS_WITH_ONE_CONTRACT_REMEDIATION** and V13 is **REMEDIATION_IMPLEMENTED_PENDING_R14_FINAL_REVIEW**.

**Merged (2026-09-26, by the operator):** `P4G = MERGED_TO_MAIN` (`MERGED_TO_MAIN_FOR_IMPLEMENTED_SCOPE`) — pull request #10, merge commit `c73cbda` (parents `5aa9248` and the R14 submission head `6fc5605`); `main` push CI run 36242994330 success. `P4G_IMPLEMENTATION = VERIFIED_FOR_IMPLEMENTED_SCOPE` (§34). No CandidateAssessment, G1–G6 review, readiness, READY_FOR_SIGNER, unsigned export, G7, signature, sending, mailbox, Drive or AI-provider action exists.

Persistent rules (they stay in force; `CLAUDE.md` carries them):

- **Technical validation ≠ substantive review.** A ValidationRun records what the technical ruleset found for one exact candidate artifact against the current recorded context: exact bytes and hashes, the envelope and thread, the document plan, internal markers, recorded gaps and drift. It reviews nothing substantively — no authority (G1), work-specific rights (G2), identification sufficiency (G3), audiovisual infringement (G4), permission or exceptions (G5), human adoption of the text (G6), legal validity or signer eligibility.
- **TECHNICAL_PASS ≠ G1–G6, ≠ readiness.** TECHNICAL_PASS means only: the configured technical rules executed and found no technical blocker or review-required technical issue under this ruleset. It is not a G1–G6 result, an approval, readiness, READY_FOR_SIGNER, a signature or permission to send. Every run records `semanticReviewRequired = true`. UI: "Technical checks only. This is not G1–G6 review, legal approval, readiness, signature, or permission to send."
- **Deterministic checks and heuristic signals apart.** A DETERMINISTIC check follows from exact stored values alone; a HEURISTIC signal is a bounded, documented pattern in free text for a person to read — never a finding about what the text means, never a BLOCKER, never labelled deterministic.
- **Exact artifact binding.** A run targets exactly the candidate named in the path (no latest, no parent or child followed) and the artifact the caller reviewed (`expectedArtifactSha256` must be the stored one, else 412 `ARTIFACT_CHANGED`); nothing is recomputed from client text, repaired or normalized.
- **Fresh dependency binding.** A run evaluates the CURRENT production context of exactly its prompt snapshot's scope (task, mode, selection, parent binding and the prior bindings of its frozen manifest), with the P4D reader, digest and gate unchanged. The caller's `expectedDependencyDigest` must be that current digest (412 `CONTEXT_CHANGED` — never substituted); the context is rechecked in a short SERIALIZABLE transaction before the run is committed, so no run is published against mixed snapshots.
- **A complete coverage manifest; NOT_EXECUTED ≠ PASS.** `coverageManifest` lists every required rule, the executed rules and the rules not executed; a rule that cannot run, is not run or fails is listed as not executed and is never passed (an issue records why; a failure makes the run ERROR).
- **No CandidateAssessment, no readiness, no G7, no external action.** Validation creates no assessment and changes no candidate, fact or case record; nothing is signed, adopted, exported, sent or fetched; no AI provider is called.

## Status by scope (not collapsed)

| Scope | Status |
|---|---|
| R13 closeout, merge and branch (steps 1–8) | **DONE** — R13 = PASS recorded (`85d0aed`); P4F merged to `main` by PR #9 (merge commit `5aa9248`); post-merge `main` CI green; branch created from `5aa9248`; checkpoint `b71a2e0` (`P4F_NOTICE_CANDIDATE.md` §28–§29; §2) |
| P4G implementation (step 9) | **IMPLEMENTED** on `feature/p4g-technical-validation` — code head `608800e` (§3) |
| P4G home-PC automated tests | **PASS** — `yarn test` 1515 in 48 files and `yarn test:db` 520 in 14 files on the code head `608800e`; P4G: 36 rule-engine and 3 WriteExecutor unit tests, 11 web, 26 DB (§26). R14 remediation: `yarn test` 1532 in 49 files, `yarn test:db` 526 in 14 files on `31df6d7` (§35.6) |
| Consistency / transaction tests | **PASS** — capture in one REPEATABLE READ snapshot, the ruleset outside any lock, one short SERIALIZABLE commit with the rechecks: a change committed after the capture is 412 with nothing written, a dependency write that never locks the case waits for the commit, an audit failure rolls back the run, its issues and the idempotency record (DB tests; negative controls NC-P4G-18, -19, -20) (§6) |
| Browser verification (Playwright MCP, `tb_notice_test`) | **PASS** 32/32 — two sandbox sessions; one finding (F1) fixed in `3b56a41` and re-verified; limitations L1–L4 (§24). R14 read-back **PASS** 17/17 — one finding (the 390 px dependency table) fixed in `a5c22aa` and re-verified (§35.8) |
| Negative controls | **PASS** 33/33 in the final run on `608800e` — all 22 control kinds of mission §43 plus 11 further; 60 responsible commands, each failing on an AssertionError (§25). R14 remediation **PASS** 24/24 on `31df6d7` — the 11 mandatory kinds plus 13 further; 32 commands, each failing on an AssertionError (§35.9) |
| Full regression (mission §48) | **PASS** — 21/21 steps exit 0 on the code head `608800e` (§26). R14 remediation 21/21 on `31df6d7` (§35.10) |
| Exact final branch CI | **PASS** for the code head `608800e` — push run 36233916154, both jobs success; the R14 submission head `6fc5605` — push run 36234677791 success. R14 remediation code head `31df6d7` — push run 36248642530, both jobs success (§35.10); the run of the remediation's documentation head is reported with the R14-final report |
| Schema / migration | **No change** (§28; the R14 remediation made none either, §35.11) |
| Wire contract | **No change in P4G** — TB-SCHEMA-API-v1.2.0 (§29). The R14 remediation adds the additive release **TB-SCHEMA-API-v1.3.0** (one read, one envelope schema; ADR-0006 **PROPOSED**, §35.3) |
| R14 review | **PASS_WITH_ONE_CONTRACT_REMEDIATION** (operator, 2026-09-26) — V1–V12 and `ENVELOPE.REPLY_RECIPIENT` ACCEPTED; V13 **REMEDIATION_IMPLEMENTED_PENDING_R14_FINAL_REVIEW** on `feature/r14-validation-run-readback`, submitted for **R14 final (PENDING)** (§34, §35) |
| P4G status / merge | **MERGED_TO_MAIN_FOR_IMPLEMENTED_SCOPE** — pull request #10, merge commit `c73cbda` (merge commit method; 2026-09-26T12:46:40Z); `main` push CI run 36242994330 success; `P4G_IMPLEMENTATION = VERIFIED_FOR_IMPLEMENTED_SCOPE`. The R14 remediation is **not merged** (§34) |

## 1. Operation matrix and design (contract-first)

### 1.1 Exact contract scope

| operationId | Method and path | Request | Response | If-Match | Idempotency-Key | Affected | Disposition |
|---|---|---|---|---|---|---|---|
| `validateCandidate` | POST `/candidates/{candidateId}/validation-runs` | `ValidateCandidate` {`expectedArtifactSha256` 64 hex, `expectedDependencyDigest` 64 hex} | 201 `{data: ValidationRun, meta}` | none (no precondition target: the two expectations are the precondition) | required | one ValidationRun, its ValidationIssues and one audit event; the candidate and the CaseRecord unchanged (the case row is locked) | IMPLEMENTED |
| `listValidationRuns` | GET `/candidates/{candidateId}/validation-runs` | query `limit` 1–100 (25), `cursor` ≤2,000, `q` ≤200 | 200 `{data: {items: ValidationRunSummary[], nextCursor}, meta}` | — | — | read only | IMPLEMENTED |
| `listValidationIssues` | GET `/validation-runs/{id}/issues` | query `limit` 1–100 (25), `cursor` ≤2,000, `q` ≤200 | 200 `{data: {items: ValidationIssue[], nextCursor}, meta}` | — | — | read only | IMPLEMENTED |

Contracted errors: `validateCandidate` 400 401 403 404 409 412 413 422 428 429 500; the two lists 400 401 403 404 409 413 422 429 500. `ValidationRun`: id, candidateId, caseId, artifactSha256, dependencyDigest, dependencyManifest, evaluatedContextJson, rulesetVersion, result (TECHNICAL_PASS \| BLOCKED \| REVIEW_REQUIRED \| ERROR), coverageManifest {requiredRuleIds, executedRuleIds, notExecutedRuleIds, semanticReviewRequired: literal true}, blockerCount, reviewRequiredCount, warningCount, startedAt, completedAt, createdAt, createdById — no rowVersion, no ETag. `ValidationRunSummary`: the same without the dependency manifest, the evaluated context, the coverage manifest and createdById. `ValidationIssue`: id, runId, ruleId, checkKind (DETERMINISTIC \| HEURISTIC), severity (BLOCKER \| REVIEW_REQUIRED \| WARNING \| INFO), fieldPath, message, details, createdAt, createdById. There is no contracted read of one stored run (`getValidationRun` does not exist; §30 V13). Every later candidate operation (`captureCandidateAssessment`, `listCandidateAssessments`, `getCandidateReadiness`, `exportUnsignedCandidate`) stays unrouted (404).

### 1.2 Frozen rules that decide the design

- INVARIANTS §5: "Validation captures context, runs bounded deterministic checks outside any long-lived lock, then rechecks the dependency digest in a short transaction before committing the completed ValidationRun/Issues. If dependencies changed, return 412 CONTEXT_CHANGED; never publish a PASS against mixed snapshots. For ERROR runs preserve diagnostics with no ready promotion."
- INVARIANTS §2.4: a completed ValidationRun matches the exact artifactSha256, dependencyDigest and the applicable rulesetVersion; the coverage manifest lists every required deterministic rule as executed; ERROR/NOT_EXECUTED is never PASS; HEURISTIC findings are review signals. §2.9: the pending slot exactly once; a name in an identity block is allowed and is not a signature; a regex cannot conclusively identify adoption. §3: "For any rule not enforceable by current tooling, return NOT_EXECUTED/REVIEW_REQUIRED, not a cosmetic PASS."
- INVARIANTS §6 (exact text; `bodySha256` over the exact UTF-8 bytes; the artifact hash over TB canonical JSON v1) and §7 (audit redacts private bodies — identifiers, hashes and counts).
- API_CONTRACT §5: the frozen stable codes `CONTEXT_CHANGED` and `ARTIFACT_CHANGED` (412 = "stale If-Match or context/artifact digest precondition"); §11: validation runs are listed as summaries.
- Production Form Contract §3 (PREPARATION "must not produce a falsely cleared final candidate"), §7 (a Drive link or a reference is not an attachment; the slot validator proves the count only; no internal gate ids, hashes, review codes or operator notes in external copy), §9 (check kinds; "do not label unsupported-assertion detection in arbitrary free text as fully deterministic"), §12 (genuine blockers are never downgraded).
- Acceptance scenarios AC-049 (a technical pass without G1–G6 is not readiness — a later phase) and AC-050 (a required rule not executed → no technical pass).
- DATABASE_SCHEMA: `validation_runs` (FK `(candidate_id, case_id)` → `notice_candidates(id, case_id)`, CHECK `completed_at >= started_at`, index `(candidate_id, created_at)`, unique `(id, candidate_id)`), `validation_issues` (FK `run_id`, index `(run_id, severity)`) — both already in the applied migration.

### 1.3 Design decisions (as implemented)

- **V1 The exact candidate, also when superseded.** A run targets exactly the candidate of the path (404 when unknown); no latest version, parent or child is followed. A superseded candidate may be validated — no frozen rule forbids it and supersession is independent of lineage (R13 decision 10): the run checks that exact historical artifact and does not make it active again; the page says so.
- **V2 Artifact expectation → 412 `ARTIFACT_CHANGED`** {field `expectedArtifactSha256`} when it is not the stored `artifactSha256` (a frozen stable code). Nothing is recomputed from client text.
- **V3 Digest expectation → 412 `CONTEXT_CHANGED`** {field `expectedDependencyDigest`} when it is not the current digest of the scope — never substituted. A binding the prompt named that has been corrected since (the P4D reader's 409 `BINDING_ALREADY_SUPERSEDED`) is the same 412: the context the caller reviewed cannot be current any more; a fresh read then names the correction.
- **V4 Scope = the prompt snapshot's scope.** Task, mode, authority selection and parent binding as the snapshot stores them; the prior bindings are the `CorrespondenceBinding` entries of its frozen dependency manifest other than the parent (a binding enters the P4D closure only as the named parent or a named prior, so this is exact; a manifest that contradicts the snapshot's own selectors is a 500). The P4D reader, assembly, digest, bounds and DRAFTING gate are used unchanged — no second digest algorithm.
- **V5 Archived case → 409** (read-only, like every write of an archived case); its recorded runs stay readable.
- **V6 PREPARATION → deterministic BLOCKER** (`CONTEXT.GENERATION_MODE`; PFC §3). The mode is recorded in the run (its evaluated context and the audit event).
- **V7 Recorded gaps and drift.** Each missing item of the evaluated (current) context: a DRAFTING-blocking code is a BLOCKER, any other REVIEW_REQUIRED; each recorded conflict REVIEW_REQUIRED (never resolved); each dependency added, removed or changed since the prompt snapshot REVIEW_REQUIRED (the draft was written from the earlier context). The prompt's own gaps stay in the prompt snapshot.
- **V8 All 29 rules are required** (heuristics included). A rule that cannot run is NOT_EXECUTED (a REVIEW_REQUIRED issue with the reason); a required rule that is not run at all is listed the same way (NOT_RUN); a rule that fails while running is ERROR (an issue with the error's name only). None is ever passed.
- **V9 Aggregation**: ERROR > BLOCKED > REVIEW_REQUIRED (any REVIEW_REQUIRED issue or any rule not executed) > TECHNICAL_PASS; WARNING and INFO never change the result.
- **V10 Issue order** = rule order, then the order a rule reported them; ids are assigned in descending order so the standard `(createdAt DESC, id DESC)` keyset lists them in that order.
- **V11 Two phases.** The WriteExecutor gains an optional `prepare(now)` step: after a new idempotency claim and before the transaction (never on a replay; a failure releases the claim like any refusal). Capture = one REPEATABLE READ read-only snapshot + the pure ruleset outside any transaction; commit = one short SERIALIZABLE transaction with the rechecks (§6).
- **V12 Times.** `startedAt` = `createdAt` = the write instant; `completedAt` = the clock after the rules ran, never earlier than `startedAt` (the CHECK).
- **V13 No read of one stored run.** The contract has no `getValidationRun`; a run's full coverage manifest is returned in the 201 response (and its replay). A recorded run is shown by its summary and its issues, which name every rule not executed (each has an issue). Not worked around (no route or field added).
- **V14 Pages.** The candidate detail page gains a "Technical validation" section (`apps/web/src/app/cases/validation.tsx`); it imports only types from `@tb/contracts`.

## 2. R13 closeout and branch (mission steps 1–8)

Recorded in `docs/verification/p4f/P4F_NOTICE_CANDIDATE.md` §28–§29 (verified with `git` and authenticated `gh`, not assumed):

| Item | Value |
|---|---|
| R13 | **PASS** (operator, 2026-09-26) — P4F VERIFIED_COMPLETE, no remediation; closeout head `85d0aed`, push run 36226531126 success |
| P4F pull request | [#9](https://github.com/TuongChris/tb-notice-production-system/pull/9) `feature/p4f-notice-candidate` → `main`, head `85d0aed`; pull_request run 36227333647 success |
| Merge | **merge commit** `5aa9248` (parents `79db09b`, `85d0aed`), merged 2026-09-26T07:46:08Z; no squash, rebase, `--admin` or branch deletion |
| Post-merge `main` CI | push run [36227787808](https://github.com/TuongChris/tb-notice-production-system/actions/runs/36227787808) on `5aa9248` — success (both jobs) |
| P4G start | `feature/p4g-technical-validation` from the exact `origin/main` `5aa9248` (push run 36228202205); checkpoint commit `b71a2e0` (documentation only; P4G NOT_STARTED at that commit), push run 36228816157 success |

## 3. Implementation (commits)

| Commit | Content | CI |
|---|---|---|
| `b71a2e0` | Post-R13 checkpoint (documentation only) | run 36228816157 success |
| `bb00732` | Web: the "Technical validation" section of the candidate detail page (`apps/web/src/app/cases/validation.tsx`: the run panel, result with its qualifier, coverage manifest, issues and the run history), API client methods, CSS; `tests/web/p4g.test.tsx` (11) and the fake API's validation routes (`tests/web/support.tsx`); the P4F archived-case test lists the inert run action | (pushed with `779860a`) |
| `21ddcf0` | API: `modules/validation/*` (ruleset and engine, text scan, plan-source inputs, scope, views, observer seam, service, controller, module); the WriteExecutor's `prepare` step; `ARTIFACT_CHANGED` and the validation `CONTEXT_CHANGED` errors; `tests/api/validation-rules.test.ts` (36), three WriteExecutor tests, `tests/db/p4g-http.test.ts` (25); earlier DB tests' and smokes' unrouted probes moved to assessments onward (`smoke:p4f` 92 → 90 checks: its two probes that validation is unrouted); the UI sandbox cleans runs and issues | (pushed with `779860a`) |
| `779860a` | `yarn smoke:p4g` (CI only) and its CI step; four validation guard checks in `smoke:local` | run 36230803847 success — `smoke:p4g` 86 checks, `smoke:local` 61 |
| `1774bf1` | Test: the contamination test covers every mission §42 item | (pushed with `e7088bb`) |
| `e7088bb` | Test: the shared suite cleanup covers the later-phase assessment tables; the run list test proves each candidate lists only its own runs (from negative-control run 1; test code only; §25) | run 36231351812 success |
| `d663804` | Fix: a heuristic rule that fails while running records a REVIEW_REQUIRED diagnostic, never a BLOCKER (a deterministic rule's stays a BLOCKER); unit and DB tests | run 36231800661 success |
| `3b56a41` | Fix from the browser pass (finding F1): after a 412 `CONTEXT_CHANGED` the run panel no longer shows the earlier read's digest as the current one; web test | run 36232850574 success |
| `23f921a` | Test: the 412 web test fails on its own assertion when the refusal is not shown (from the final control run 3; test code only) | run 36233264177 success |
| `608800e` | Test: a DRAFTING candidate whose context lost a blocking input meets the P4D gate (pins interpretation V4; test code only) — the code head | run 36233916154 success |
| (this record) | R14 submission: this record, the evidence, `CLAUDE.md`, `CURRENT_STATE.md` (documentation only) | reported with the R14 report |

## 4. Ruleset `TB-TECHNICAL-RULESET-v1` and its inventory

`TB-TECHNICAL-RULESET-v1` is an **implementation identifier**: not a wire-contract release, not a Production Form Contract version, not a legal or policy certification and not a G1–G6 review version. Its name claims no external or legal approval. Any change to a rule's meaning, kind or severity, or to the inventory, needs a new identifier (`technical-ruleset.ts` header; a unit test pins the inventory). No earlier ruleset existed in the repository. All 29 rules are **required** and run in this order (D = DETERMINISTIC, H = HEURISTIC; B = BLOCKER, RR = REVIEW_REQUIRED, W = WARNING):

| # | Rule | Kind | Reports | What it checks |
|---|---|---|---|---|
| 1 | `ARTIFACT.TEXT_EXACT` | D | B | every stored text (subject, body, envelope, plan) is exact text: no NUL, no unpaired surrogate |
| 2 | `ARTIFACT.SHAPE` | D | B | the stored subject, body, envelope and plan match their contract schemas (code-point lengths, formats, the four DocumentPlan states — no ACTUALLY_ATTACHED — at most 100 plans, no other key); nothing trimmed to fit |
| 3 | `ARTIFACT.BODY_SHA256` | D | B | SHA-256 of the exact UTF-8 bytes of the stored body = stored `bodySha256` (frozen helper; no normalization); NOT_EXECUTED when the body is not exact text |
| 4 | `ARTIFACT.ARTIFACT_SHA256` | D | B | the `TB-CANDIDATE-ARTIFACT-v1` hash recomputed from the stored subject, body, envelope, ordered plan and the HUMAN_PENDING state and slot = stored `artifactSha256`; NOT_EXECUTED when a text is not exact or the envelope or plan is not in its stored form |
| 5 | `ARTIFACT.SIGNATURE_STATE` | D | B | the stored `signatureState` is HUMAN_PENDING |
| 6 | `SIGNATURE.PENDING_SLOT_ONCE` | D | B | the exact slot `[PENDING AUTHORIZED SIGNER — FULL LEGAL NAME REQUIRED]` exactly once in the body and never in the subject (zero, two or more, or any in the subject: a BLOCKER listing the positions); it counts the token only |
| 7 | `SIGNATURE.SLOT_LOOKALIKE` | H | RR | bracketed text naming a signer, signature or pending state that is not the exact slot |
| 8 | `SIGNATURE.ADOPTION_WORDING` | H | RR | wording that may state or imply a completed signature or a personal adoption (`/s/`, "electronically/digitally signed", "e-signed", "signed by / on behalf of", "Signature:" followed by anything but the slot, "I have reviewed/approved/adopted/signed this notice") |
| 9 | `SIGNATURE.NAME_AFTER_SLOT` | H | RR | the proposed signer's recorded full legal name on the slot's line after it or on one of the next two non-empty lines; a name in an identity or capacity block elsewhere is allowed and never read as a signature |
| 10 | `ENVELOPE.PROMPT_CASE_TASK` | D | B | the candidate's case and task are its prompt snapshot's |
| 11 | `ENVELOPE.THREAD` | D | B | `envelope.parentBindingId` is exactly the prompt's parent binding (none for INITIAL — no parent is invented; the exact NMI binding for a reply) |
| 12 | `ENVELOPE.SENDER` | D | B / RR | `envelope.from` is exactly the intended mailbox of the selection the prompt pinned (another: BLOCKER; no selection: REVIEW_REQUIRED, unbacked) |
| 13 | `ENVELOPE.REPLY_RECIPIENT` | D | RR | for a reply: `envelope.to` is exactly the parent NMI's recorded Reply-To (or From when none) — an exact record comparison, never a judgement of the right recipient; an initial notice's recipient is not assessed |
| 14 | `PLAN.SOURCE_EXISTS` | D | B | each plan names an existing source revision |
| 15 | `PLAN.SOURCE_APPLIES` | D | B | each named revision applies to the case under the current source rules (`source-scope.ts`, target Case), naming the rule it fails |
| 16 | `PLAN.SOURCE_IN_CONTEXT` | D | RR | each named revision is part of the evaluated context's closure (else its later changes would not make the validation stale) |
| 17 | `PLAN.SOURCE_LATEST_REVISION` | D | RR | each named revision is the latest of its group; nothing is re-pointed |
| 18 | `PLAN.CONTENT_SHA256` | D | B | a named `contentSha256` equals the one recorded on that exact revision |
| 19 | `PLAN.PREVIOUSLY_SUPPLIED` | D | B / RR | PREVIOUSLY_SUPPLIED only for a source a prior transmission of the evaluated context records among its captured attachments (none: BLOCKER; recorded only as COPIED_TEXT_ALLEGATION or UNKNOWN: REVIEW_REQUIRED); the parent NMI's attachments never count |
| 20 | `WORDING.ATTACHMENT_CLAIM` | H | RR / W | attachment wording (seven documented patterns: "is/are/has been/have been attached or enclosed", "attached hereto/herewith/is/are", "(please) find/see (the) attached/enclosed", "I/we (have) attached/enclosed", "enclosed herewith/is/are", "Attachment(s):", "in the attached file / attachment") with no plan PREPARED_FOR_ATTACHMENT with a file name: REVIEW_REQUIRED; with one: a WARNING that it must be attached outside the application |
| 21 | `MARKER.DECLARATION_PLACEHOLDER` | D | B | the exact reserved token `[REVIEWED DECLARATION TEXT REQUIRED]` in the subject or body |
| 22 | `MARKER.INPUT_PLACEHOLDERS` | D | B | the prompt template's exact placeholders `[NEEDED:` and `[CONTACT DETAILS REQUIRED]` |
| 23 | `MARKER.PROMPT_STRUCTURE` | D | B | exact structural lines of `TB-PROMPT-TEMPLATE-v1` (header, part headings, case-data markers, the four sections it asks for — including "D. REVIEW NOTES" — rule openings R1–R14, mode and task lines); a unit test renders prompts and checks each still occurs in them |
| 24 | `MARKER.INTERNAL_IDENTIFIERS` | D | RR | exact internal identifiers: a record id of the evaluated context, the candidate's or prompt's id, the prompt SHA-256, a digest or fingerprint, the application's identifier strings, its internal state and provenance codes |
| 25 | `MARKER.GATE_LABELS` | H | RR | internal gate labels (G1–G7 as a word, "gate 1") |
| 26 | `CONTEXT.GENERATION_MODE` | D | B | the prompt snapshot was generated in DRAFTING mode (PREPARATION: draft material only) |
| 27 | `CONTEXT.MISSING` | D | B / RR | each missing item of the evaluated context: a DRAFTING-blocking code a BLOCKER, any other REVIEW_REQUIRED; nothing filled in |
| 28 | `CONTEXT.CONFLICTS` | D | RR | each recorded conflict; never resolved |
| 29 | `CONTEXT.PROMPT_DRIFT` | D | RR | each dependency added, removed or changed (fingerprint) between the prompt's frozen manifest and the evaluated current one; one signal when only the digest's identifiers differ; the prompt never changes |

Every rule's `checks` text in the source is its documentation; the inventory, kinds and order are pinned by the unit test "is one identifier with a pinned inventory of 29 required rules".

## 5. Deterministic checks and heuristic signals

- **DETERMINISTIC** (24 rules): exact comparisons of stored values — bytes, hashes, identifiers, recorded relationships, exact reserved tokens and template lines; the finding follows from the values alone.
- **HEURISTIC** (5 rules: `SIGNATURE.SLOT_LOOKALIKE`, `SIGNATURE.ADOPTION_WORDING`, `SIGNATURE.NAME_AFTER_SLOT`, `WORDING.ATTACHMENT_CLAIM`, `MARKER.GATE_LABELS`): bounded, documented pattern scans of free text. Each finding says "(Heuristic signal, not a finding about the text.)" and is REVIEW_REQUIRED or WARNING — never a BLOCKER, also when the rule fails while running (its diagnostic is REVIEW_REQUIRED; `d663804`). No arbitrary prose, legal sufficiency, adoption or recipient correctness is decided by any rule.
- Every issue carries its rule's inventory kind (unit test); the page labels them "Deterministic check — follows from exact stored values alone" and "Heuristic signal — a pattern in free text for a person to read — not a finding about what the text means", with a dashed, italic badge for the heuristic kind (never the solid treatment of a finding).
- Where an exact machine-readable contradiction exists, the check is deterministic (the declaration placeholder, the input placeholders, the prompt's structural lines, an exact internal identifier); arbitrary semantic contamination is heuristic (gate labels).

## 6. Validation transaction (capture → evaluate → commit)

INVARIANTS §5 "Validation captures context, runs bounded deterministic checks outside any long-lived lock, then rechecks the dependency digest in a short transaction before committing" (`validation.service.ts`):

1. **Request** — the contract body (`expectedArtifactSha256`, `expectedDependencyDigest`, 64 lowercase hex each; anything else 422), then the Idempotency-Key (400 without), then the claim. No If-Match (the contract declares no precondition target).
2. **Capture** (the WriteExecutor's new `prepare` step: after a new claim, outside the write transaction, never on a replay; a failure releases the claim) — one short REPEATABLE READ read-only snapshot: the exact candidate of the path (404) → its case (archived → 409) → the expected artifact SHA-256 is the stored one (412 `ARTIFACT_CHANGED` {field expectedArtifactSha256}; nothing recomputed from client text) → its prompt snapshot → the prompt's scope (V4) → the current context rows of that scope with the P4D reader (a named binding corrected since → 412 `CONTEXT_CHANGED`) → the plan's source revisions (`validation-inputs.ts`). Outside the snapshot: the P4D assembly; the expected digest must be the current one (412 `CONTEXT_CHANGED` {field expectedDependencyDigest}); the P4D bounds and DRAFTING gate (`assertDeliverable`, shared with `getProductionContext`).
3. **Evaluate** — the pure ruleset (`evaluateCandidate`): no transaction, no lock, no clock, randomness, locale, environment, database or network.
4. **Commit** — one short SERIALIZABLE transaction: `lockCase` FOR UPDATE (archived meanwhile → 409) → the candidate still has the evaluated artifact (412 `ARTIFACT_CHANGED`) → the context of the same scope is rebuilt and its digest must be the evaluated one (412 `CONTEXT_CHANGED`) → the plan's source revisions must read as evaluated (their fingerprint; 412 `CONTEXT_CHANGED` {field preparedDocuments}: a plan may name a source outside the closure) → one `validation_runs` row with exactly the evaluated context, dependency manifest, digest, ruleset, result, coverage manifest and counts → its `validation_issues` → one audit event → the idempotency record → commit.
5. The case row is locked, never changed (no `rowVersion` or `contextRevision` move); the candidate is never changed; no assessment, readiness, signature or export record exists.

SERIALIZABLE matters for the same reason as in P4E: a dependency write that never locks the case (an authority event locks its mandate) waits for the run's commit, so what the commit rechecked stays as read until it commits. The test seam `VALIDATION_OBSERVER` (`afterCapture`, `afterCaseLock`, `beforeInsert`, `beforeRule`; no-ops in the app) serves the consistency and ERROR tests.

## 7. Fresh context and the dependency digest

- The scope is exactly the prompt snapshot's (V4): its task, mode, authority selection and parent binding, and the prior bindings of its frozen manifest. Nothing latest, newer or default is chosen.
- The context, closure, fingerprints and digest are P4D's, unchanged (`TB-PRODUCTION-CONTEXT-DIGEST-v1`; no second digest algorithm). The caller's `expectedDependencyDigest` must be the current digest — never substituted — or the request is 412 `CONTEXT_CHANGED` with nothing written; the page then requires a new read (§22).
- Relevant changes that stale a read (DB test, 412 each, nothing written): a new AuthorityEvent, a new SourceReference head, a case-source link state, a fact revision, a mapping edit, and a correction of the prompt's parent binding (the fresh read then names the correction: 409 `BINDING_ALREADY_SUPERSEDED`). Changes P4D leaves out of the fingerprint do not stale it: a work's notes and the case's notes (DB test; browser item 19).
- The run stores exactly what it evaluated: `evaluatedContextJson` = the current context, `dependencyManifest` = its closure, `dependencyDigest` = its digest — never reconstructed later. A change committed between capture and commit is caught by the commit's rebuild (DB test "no run is published against mixed snapshots").

## 8. Candidate and artifact integrity

The run targets exactly the path's candidate and the reviewed artifact (V1, V2). The body hash is recomputed over the exact UTF-8 bytes of the stored body and the artifact hash with `TB-CANDIDATE-ARTIFACT-v1` (the frozen helper agrees, unit test). A difference is a deterministic BLOCKER naming both values; nothing is repaired or normalized (CRLF, trailing spaces and decomposed letters are kept — unit test). Text import refuses (a NUL, an unpaired surrogate) is a BLOCKER at its field, and the two hash rules are then NOT_EXECUTED — listed, never passed (unit test; browser item 26). The stored shape is re-validated against the contract (lengths in code points, formats, at most 100 plans, no other key, no ACTUALLY_ATTACHED).

## 9. Pending signature slot and HUMAN_PENDING

`SIGNATURE.PENDING_SLOT_ONCE` counts the exact token only: zero, two or more in the body, or any in the subject, is a BLOCKER (listing each position); exactly one passes. It proves the count and nothing else: no implied signature elsewhere, no human adoption, no G7, no signer identity. Wording that may imply a signature or adoption, a lookalike slot and the signer's name directly after the slot are heuristic REVIEW_REQUIRED signals; a name in an identity block is allowed. `ARTIFACT.SIGNATURE_STATE`: anything but HUMAN_PENDING is a BLOCKER; no signed state is created or accepted. Nothing is inserted.

## 10. Envelope and thread

Revalidated against the exact prompt snapshot: the case and task are the prompt's (`ENVELOPE.PROMPT_CASE_TASK`); the thread is exactly the prompt's parent binding — INITIAL invents none, a reply keeps exactly the NMI the prompt selected (`ENVELOPE.THREAD`); the sender is exactly the pinned selection's intended mailbox, or REVIEW_REQUIRED (unbacked) without a selection (`ENVELOPE.SENDER`). Recipients are never judged: a reply's `to` is compared exactly with the parent's recorded Reply-To (or From) and a difference is REVIEW_REQUIRED only; an initial notice's recipient has no exact record and is not assessed (its correctness is semantic review).

## 11. Document plan

Each plan names an existing revision (BLOCKER otherwise; the other plan rules skip it), that applies to the case under the current source rules (BLOCKER naming the rule), inside the evaluated context (REVIEW_REQUIRED otherwise), the latest of its group (REVIEW_REQUIRED otherwise — nothing re-pointed), with a named hash only as recorded on that revision (BLOCKER), and PREVIOUSLY_SUPPLIED only as recorded by a prior transmission of the evaluated context (BLOCKER when none; REVIEW_REQUIRED when only COPIED_TEXT_ALLEGATION or UNKNOWN — recorded posture, not verified). PREPARED_FOR_ATTACHMENT is never turned into attached; no transmission package is inferred; REFERENCE_ONLY, PREPARED_FOR_ATTACHMENT and UNKNOWN are plans only.

## 12. Attachment wording (heuristic)

`WORDING.ATTACHMENT_CLAIM` scans the subject and body for the seven documented attachment patterns (§4). Without a plan PREPARED_FOR_ATTACHMENT with a file name, a match is a HEURISTIC REVIEW_REQUIRED signal ("A Drive link or a reference is not an attachment: a person reads it."); with one, a WARNING that the prepared files must be attached outside the application. It is never a BLOCKER, never labelled deterministic and never a G6 result; unrelated wording is not matched (unit test). The details list each match (line, column, the matched words) — never the body.

## 13. Prompt text and internal markers

Exact reserved tokens and template lines are deterministic: the reviewed-declaration placeholder (BLOCKER — no declaration text is supplied, fetched or invented), the input placeholders (BLOCKER), the prompt's structural lines including the internal "D. REVIEW NOTES" section (BLOCKER), and exact internal identifiers — context record ids, the prompt SHA-256, digests and fingerprints, the application's identifier strings and internal codes (REVIEW_REQUIRED: they belong in the text meant for sending only when the correspondence itself needs them, PFC §7). Gate labels are heuristic (the same letters can mean something else).

## 14. PREPARATION prompts

A PREPARATION prompt snapshot's candidate is a valid stored artifact (R13 decision 3). Technical validation records the mode (the evaluated context and the audit event) and reports `CONTEXT.GENERATION_MODE` as a deterministic BLOCKER — PFC §3 ("must not produce a falsely cleared final candidate") supports a non-production blocker, so no REVIEW_REQUIRED downgrade. The page says "Prompt mode: Preparation (PREPARATION)" before the run and the candidate page says it is draft material only. No readiness semantics are invented.

## 15. Result aggregation

Deterministic, in `evaluateCandidate`: **ERROR** when any rule failed while running; else **BLOCKED** when any BLOCKER; else **REVIEW_REQUIRED** when any REVIEW_REQUIRED issue or any required rule not executed; else **TECHNICAL_PASS**. WARNING and INFO never change the result. TECHNICAL_PASS means only: "the configured technical validation rules executed and found no technical blocker or review-required technical issue under this ruleset" — not ready, legally sufficient, rights proven, permission reviewed, fair use rejected, authority valid or approved.

## 16. Coverage manifest

`coverageManifest` = {`requiredRuleIds` (all 29, in order), `executedRuleIds` (the rules that ran to completion), `notExecutedRuleIds` (every required rule that did not: NOT_EXECUTED, not run at all, or ERROR), `semanticReviewRequired`: true}. A required rule never disappears: a rule left out of the implementations is listed as not executed with a NOT_RUN issue (unit test; negative control NC-P4G-13). A TECHNICAL_PASS needs every required rule executed. The page shows the three lists with their counts and "Semantic review required: Yes — this run performed no G1–G6 or legal review".

## 17. ValidationIssue semantics

One issue per finding: `ruleId`, `checkKind` (the rule's inventory kind), `severity` (BLOCKER, REVIEW_REQUIRED, WARNING; INFO is not used by this ruleset), `fieldPath` (the stored field, e.g. `bodyText`, `envelope.from`, `preparedDocuments.0.state`, `dependencyManifest.<type>:<id>`; null for rule-level issues), `message` (a fixed text per finding — never the body) and `details` (located matches, stored and recomputed hashes, identifiers; never a full text). A passed rule stores no issue (no padding). Issues are listed in rule order, then report order (V10). An issue is immutable; the run's counts are its BLOCKER, REVIEW_REQUIRED and WARNING totals.

## 18. ERROR runs

A request refusal before validation (a bad expectation, an archived case, a stale digest, a gate refusal) records nothing: 4xx, the claim released. A rule that fails while running after validation began makes an **ERROR** run: the rule is listed as not executed, its diagnostic issue keeps the error's **name only** (`details {outcome ERROR, errorName}`; the message says the rule could not be completed and nothing about the candidate follows) — a BLOCKER for a deterministic rule, REVIEW_REQUIRED for a heuristic one — and the other rules still run. No stack trace, error message or private content is stored, logged or audited (DB test: a secret marker in the thrown error appears nowhere). An ERROR run is never a pass and promotes nothing.

## 19. Idempotency

The WriteExecutor as for every write: scope actor + operationId + key; the digest covers the operation, method, contract path and canonical body. A replay of the same key and body returns the stored run (201, byte-identical body) — `replayRecord` reads it back by id, the idempotency record keeps no copy — even after the context changed; `prepare` never runs on a replay. The same key with another body is 409 `IDEMPOTENCY_CONFLICT`. A failure (a 412, a gate refusal, an audit failure) releases the claim and stores nothing (DB tests; browser items 20–21).

## 20. Audit

One `VALIDATION_RUN_RECORDED` event per run (entity ValidationRun), in the same transaction: candidate, case and prompt snapshot ids, task, generation mode, artifact SHA-256, dependency digest, ruleset, result, issue counts (total, blocker, review required, warning, info), rule counts (required, executed, not executed) and the not-executed rule ids, `semanticReviewRequired: true`, the dependency count, started/completed instants and the duration. Never the subject, body, addresses, plan text, issue messages or details (DB test; negative control NC-P4G-22; browser item 28 scanned the stored events). An audit failure rolls back the run, its issues and the idempotency record (DB test).

## 21. Lists

- `listValidationRuns` — that candidate's runs (404 for an unknown candidate), newest first by keyset `(createdAt DESC, id DESC)`, summaries only (no evaluated context, manifest or coverage — API_CONTRACT §11); a superseded candidate's runs stay listed; `q` = exactly a run id, a dependency digest or a result; HMAC cursors bound to the operation and filters (400 `INVALID_CURSOR`).
- `listValidationIssues` — that run's issues (404 for an unknown run), in the ruleset's order; `q` = exactly an issue id, a rule id, a severity or a check kind.
- Reads write nothing. No run is read, updated or deleted by id (no route; 404).

## 22. UI (`apps/web/src/app/cases/validation.tsx`)

- A "Technical validation" section on the candidate detail page, after the artifact hash. The only action is **"Run technical validation"** — no Approve, Verify rights, Legal validation, ready, sign, send or export action. The boundary note says what a technical validation checks and that it reviews nothing substantively.
- Before a run: the artifact SHA-256, candidate task, prompt mode, ruleset version and the current dependency digest ("Not read yet" until the operator reads the context of the prompt's scope with "Read the current context"; nothing is read or written until asked). A run is recorded against exactly the shown artifact and that read's digest.
- A 412 is shown exactly — "Context changed. Read the current context before validating again." (or the artifact message), "No validation run was recorded." — never retried; only a new read is offered, and the earlier digest is no longer shown as the current one (F1, `3b56a41`).
- The result: "TECHNICAL PASS" / "BLOCKED" / "REVIEW REQUIRED" / "ERROR" with the permanent qualifier "Technical checks only. This is not G1–G6 review, legal approval, readiness, signature, or permission to send."; why (REVIEW REQUIRED), the technical blockers (BLOCKED), the safe diagnostic (ERROR); the coverage manifest; the issues (rule id, kind, severity, field, message; details on request). READY_FOR_SIGNER is never displayed.
- Focus moves to the read's outcome, then to the result heading. The run history lists every run of the candidate newest first with its qualifier, digest and issues on request (the contract has no read of one stored run: V13). A superseded candidate's section says a run checks the exact historical artifact only. An archived case shows the action inert with its reason. Another case's candidate is shown like an unknown one.
- The page imports only types from `@tb/contracts` (the candidates chunk 52.60 kB, no Zod).

## 23. No AI provider or network

No AI-provider, network, mail, file-system or process call exists in the validation module (unit test scanning every module file; negative control NC-P4G-26); a DB test spies on sockets and `fetch` around a validation (no outbound connection, no fetch). The web page reaches only the application API (unit test). The browser pass found no request outside the application origin and no outbound socket of the sandbox API (browser item 29). No provider SDK is in any manifest (the P4E guard).

## 24. Browser verification (Playwright MCP, mission §36)

**PASS — 32/32**, two sandbox sessions on the disposable `tb_notice_test` (`yarn ui:sandbox`, the compiled API and the built web app; isolated headless Chromium; the synthetic sandbox user). Session 1 ran items 1–32 on a build of `d663804`; session 2 re-verified the fix of finding F1 on a fresh build of `3b56a41`. Full log: `evidence/p4g-playwright-mcp-verification.txt`; screenshots: `evidence/screenshots/` (35 element screenshots of the validation section, a not-found page and the login page — never the body or the evaluated context, mission §47).

| # | Item | Result |
|---|---|---|
| 1 | Candidate detail before validation | artifact SHA-256, task, prompt mode, ruleset, digest "Not read yet"; only "Read the current context" |
| 2 | Run against the exact artifact and current digest | request body = the shown artifact and the read digest; Idempotency-Key, no If-Match |
| 3 | TECHNICAL_PASS with the qualifier | "TECHNICAL PASS" + "Technical checks only. This is not G1–G6 review, legal approval, readiness, signature, or permission to send." |
| 4, 5 | Zero / two pending slots | BLOCKED — `SIGNATURE.PENDING_SLOT_ONCE` (positions listed) |
| 6 | Declaration placeholder | BLOCKED — `MARKER.DECLARATION_PLACEHOLDER` (deterministic, exact reserved token) |
| 7 | PREPARATION candidate | "Prompt mode: Preparation"; BLOCKED — `CONTEXT.GENERATION_MODE`; no readiness wording |
| 8–13 | Integrity, thread, sender, source, PREVIOUSLY_SUPPLIED injections | BLOCKED — the matching deterministic rule each (the evidence log, items 8–13) |
| 14 | Attachment wording | REVIEW REQUIRED — `WORDING.ATTACHMENT_CLAIM`, "Heuristic signal", never a BLOCKER |
| 15 | Internal marker | BLOCKED — `MARKER.PROMPT_STRUCTURE` ("D. REVIEW NOTES") |
| 16–18 | AuthorityEvent / source head / parent correction after the read | 412 "Context changed. …", no run, never retried, only a new read; the new read then shows the drift (or, for the corrected parent, is refused naming the correction) |
| 19 | Case notes changed after the read | not stale — TECHNICAL PASS against the same digest |
| 20, 21 | Idempotency (in-page API call) | the same run replayed byte-identically; another body 409 `IDEMPOTENCY_CONFLICT` |
| 22, 23 | Run and issue lists | newest first, summaries; issues in rule order, paged; exact `q`; forged cursor 400; unknown run 404 |
| 24 | After supersession | runs kept; the superseded candidate validated as its exact historical artifact |
| 25 | Case A → case B | no Alpha run, issue or id on Beta's page or in Beta's stored run; another case's candidate shown like an unknown one |
| 26 | Coverage manifest | 29/29/0 and, for a stored body with a NUL, 29/27/2 with both rules named |
| 27, 28 | No G1–G6/READY state; no assessment | later-phase routes 404; no readiness column; `candidate_assessments` 0 |
| 29 | No external action | browser requests only to the application origin; the API's sockets only MySQL and its listener |
| 30 | 390px | no page-level horizontal scroll; the issues table scrolls in its frame |
| 31 | Keyboard and focus | read → outcome focused → Run → result heading focused; the history toggle by keyboard |
| 32 | Sign out | Login; the API 401 `SESSION_REQUIRED` |

**Finding F1 (fixed, `3b56a41`).** After a 412 `CONTEXT_CHANGED`, the run panel kept showing the earlier read's digest under "Current dependency digest", although the server had just said it is no longer current (the alert, the refusal of a retry and the new-read requirement were correct). The row now reads "Changed since the last read: not known until the current context is read again." until a new read; the web test asserts it (negative control NC-P4G-32); session 2 re-verified the flow.

## 25. Negative controls (mission §43)

**PASS — 33/33** in the final run on the code head `608800e` (2026-09-26T09:46Z–09:48Z): all 22 control kinds of mission §43 plus 11 further P4G protections; 60 responsible commands, every one failed and named a test, every first failure an AssertionError (no timeout, crash or backstop); files restored byte-identically; the working tree identical before and after; `tb_notice_test` empty afterwards (`evidence/p4g-negative-controls.txt`).

| Mission §43 kind | Control |
|---|---|
| artifact hash mismatch ignored | NC-P4G-01 |
| dependency mismatch ignored | NC-P4G-02 |
| relevant AuthorityEvent omitted | NC-P4G-03 |
| pending slot rule disabled | NC-P4G-04 |
| declaration placeholder rule disabled | NC-P4G-05 |
| HUMAN_PENDING rule disabled | NC-P4G-06 |
| wrong parent accepted | NC-P4G-07 |
| wrong sender accepted | NC-P4G-08 |
| source revision auto-follow | NC-P4G-09 |
| PREVIOUSLY_SUPPLIED fabricated | NC-P4G-10 |
| heuristic labelled deterministic | NC-P4G-11 |
| required rule silently omitted | NC-P4G-13 |
| NOT_EXECUTED treated PASS | NC-P4G-14 |
| ERROR treated PASS | NC-P4G-15 |
| run committed after dependency changed | NC-P4G-18 |
| mixed context/run snapshot | NC-P4G-19 (READ COMMITTED instead of SERIALIZABLE), NC-P4G-20 (plan sources not rechecked) |
| audit stores candidate body | NC-P4G-22 |
| cross-case run leak | NC-P4G-23 |
| UI says "Approved" | NC-P4G-27 |
| UI hides notExecutedRuleIds | NC-P4G-28 |
| validation creates assessment/readiness | NC-P4G-24 (a G1 PASS CandidateAssessment), NC-P4G-25 (the run claims readyForSigner) |
| outbound network introduced | NC-P4G-26 |
| further | NC-P4G-12 (a heuristic reports a BLOCKER), NC-P4G-31 (a failing heuristic's diagnostic a BLOCKER), NC-P4G-16 (semanticReviewRequired false), NC-P4G-17 (PREPARATION portrayed as ready), NC-P4G-21 (the prompt's priors dropped from the scope), NC-P4G-29 (the qualifier removed), NC-P4G-30 (a 412 shown as a generic failure), NC-P4G-32 (the stale digest shown as current), NC-P4G-33 (the DRAFTING gate bypassed by the validation) |

Earlier runs found test weaknesses, each fixed in test code (`e7088bb`, `23f921a`): run 1 (30 controls, 26 caught) — the DB-suite cleanup did not know the assessment tables, so NC-P4G-24's row poisoned the next suites' emptiness backstop (NC-P4G-25/26 judged on it), and the run-list test had only one candidate's runs (NC-P4G-23); run 3 (32 controls, 32 caught) — NC-P4G-30 was caught only by a wait helper's timeout. The product fixes `d663804` and `3b56a41` added NC-P4G-31 and NC-P4G-32; the V4 test (`608800e`) added NC-P4G-33.

## 26. Tests, regression and CI

- **P4G tests**: `tests/api/validation-rules.test.ts` 36 (inventory, aggregation, NOT_EXECUTED/ERROR, heuristics, integrity, slot, envelope, plan, wording, markers, mode, gaps, drift, module guards), `tests/api/write-executor.test.ts` +3 (`prepare`), `tests/web/p4g.test.tsx` 11, `tests/db/p4g-http.test.ts` 26 (contract, transaction, consistency, SERIALIZABLE, idempotency, ERROR, stored integrity, envelope and plan injections, recipient, PREPARATION, the DRAFTING gate after a lost input, drift, supersession, archive, lists, audit, contamination, outbound, unrouted, collected-response contract parity).
- **Totals** on the code head `608800e`: `yarn test` 1515 passed in 48 files, `yarn test:db` 520 passed in 14 files.
- **Full regression (mission §48)**: **21/21 steps exit 0** on the code head `608800e` (2026-09-26T09:49:18Z–09:57:54Z; `evidence/p4g-first-pc-sweep.txt`): `reference:check`, `reference:helper-tests`, `contracts:check`, `install --immutable`, `typecheck`, `lint` and `oxlint --deny-warnings --format default` ("Found 0 warnings and 0 errors."), `format:check`, `test`, `test:db`, `db:verify test --expect-empty`, `db:verify dev`, `db:status test` and `dev`, both drift diffs (empty migrations), `build` (entry chunk 329.85 kB, candidates chunk 52.60 kB, no chunk-size advisory), `smoke:local` (61 checks), `dev:verify-shutdown` (4/4), then `reference:check` and `db:verify test --expect-empty` again. The same sweep on the previous head `23f921a` also passed 21/21 (`test:db` 519 before the V4 test).
- **CI** (`evidence/p4g-ci-run-36233916154.txt`): push run [36233916154](https://github.com/TuongChris/tb-notice-production-system/actions/runs/36233916154) on the code head `608800e` — success, both jobs (created 2026-09-26T09:49:07Z, completed 09:57:23Z). Non-DB (cold install): `reference:check`, `reference:helper-tests` (27 pass), `contracts:check`, typecheck, lint, `format:check`, `yarn test` 1515 in 48 files, build, the working tree and the frozen references unchanged. Database: migrations and metadata verification on test, replay and dev, `test:db` 520 in 14 files, the synthetic seed twice, `smoke:local` 61, `smoke:auth`, `smoke:directory` 14, `smoke:p3a` 24, `smoke:p3b` 36, `smoke:p4a` 50, `smoke:p4b` 64, `smoke:p4c` 62, `smoke:p4d` 87, `smoke:p4e` 84, `smoke:p4f` 90 (92 at R13; its two probes that validation is unrouted left it in `21ddcf0`), `smoke:p4g` 86; every earlier P4G commit's run also succeeded (§3)
- `yarn test:transition-baseline` stays non-gating and was not run (it fails by design since the accepted v1.1.0 edit).

## 27. Contamination tests (mission §42)

DB test "two cases of one agency, owner and route" (`1774bf1`): case B has its own fact, a B-scoped source and its link, a captured message and its binding; A's and B's candidates carry byte-identical artifacts (same subject, body, envelope and plan — the same `artifactSha256`).

| Mission §42 item | Evidence |
|---|---|
| A's validation uses no B facts / sources / authority / correspondence | A's stored run (evaluated context and dependency manifest) contains none of B's fact, source, link, selection, message or binding ids, and B's none of A's |
| another candidate's run never appears | each candidate lists exactly its own runs (and the list test, `e7088bb`) |
| the same artifact hash in two cases does not transfer a run | identical `artifactSha256` in A and B; each run names its own candidate and case; no run is shared or listed across |
| the same owner and route do not transfer issues or review | both cases use one agency, route, owner, signer and mandate coverage; B's issues all name B's run; a change of A (a fact revision after B's read) leaves B's reviewed digest current |
| no technical PASS creates a CandidateAssessment | `candidate_assessments` and `assessment_sources` stay empty (also asserted by every DB suite, `e7088bb`) |
| no technical PASS changes a CaseFact | `case_facts`, `fact_sources`, `cases`, `case_sources`, `notice_candidates`, `prompt_snapshots`, `correspondence_bindings` unchanged row for row |
| no technical PASS creates readiness | no readiness or approval key in any response (collected-response test); no readiness route or column |

Browser item 25 repeats the case isolation through the pages.

## 28. Database changes

**None.** No migration, no schema change: `validation_runs` and `validation_issues` are part of the initial migration (`20260923103912_initial_schema`), including the composite foreign key to the candidate and its case, the `completed_at >= started_at` CHECK and the ENUM result, check-kind and severity columns. `yarn db:verify` PASS (test, dev); `db:status` and both drift diffs clean (§26).

## 29. Contract changes

**None.** TB-SCHEMA-API-v1.2.0 stays the active wire contract; the three operations are used exactly as contracted (paths, bodies, responses, statuses, query parameters); `yarn contracts:check` PASS; no generated artifact changed. `ARTIFACT_CHANGED` and `CONTEXT_CHANGED` are frozen stable codes (API_CONTRACT §5). `TB-TECHNICAL-RULESET-v1` is an implementation identifier, not a release. The missing read of one stored run is recorded as an observation (V13), not worked around.

## 30. Interpretations for R14 review

The design decisions of §1.3 that need the operator's acceptance:

1. **V1** A superseded candidate may be validated; the run checks that exact historical artifact and makes nothing active again.
2. **V2/V3** A wrong artifact expectation is 412 `ARTIFACT_CHANGED`, a wrong digest 412 `CONTEXT_CHANGED` (frozen stable codes); a binding the prompt named that has been corrected since is also 412 `CONTEXT_CHANGED`.
3. **V4** The evaluated scope is the prompt snapshot's (its priors recovered from its frozen manifest); the P4D reader, digest and gate unchanged. For a DRAFTING scope whose current context misses a blocking input, the P4D gate refuses the validation (422 `DRAFTING_INPUT_MISSING`, nothing recorded) exactly as it refuses the context read; a caller holding an earlier read gets 412 first (DB test "… whose context lost a blocking input …", `608800e`; negative control NC-P4G-33). The candidate is never validated against a context the gate refuses and never downgraded to PREPARATION.
4. **V5** An archived case is read-only: 409, nothing recorded; its runs stay readable.
5. **V6** A PREPARATION prompt's candidate is a deterministic BLOCKER (`CONTEXT.GENERATION_MODE`, PFC §3).
6. **V7** The current context's missing items: DRAFTING-blocking codes BLOCKER, others REVIEW_REQUIRED; conflicts REVIEW_REQUIRED; drift since the prompt REVIEW_REQUIRED per changed dependency.
7. **V8** All 29 rules are required, heuristics included; NOT_EXECUTED and not-run rules are REVIEW_REQUIRED issues; a failing rule's diagnostic is a BLOCKER (deterministic) or REVIEW_REQUIRED (heuristic) and the run is ERROR.
8. **V9** Aggregation ERROR > BLOCKED > REVIEW_REQUIRED > TECHNICAL_PASS; WARNING and INFO never change the result.
9. **V10** Issues are listed in rule order (ids assigned in descending order under the standard keyset).
10. **V11** Two phases through the WriteExecutor's new `prepare` step (capture outside the transaction; SERIALIZABLE commit with the rechecks, including the plan's sources outside the closure).
11. **V12** `startedAt` = `createdAt` = the write instant; `completedAt` after the rules ran.
12. **`ENVELOPE.REPLY_RECIPIENT`** is an exact comparison with the parent's recorded Reply-To (or From), REVIEW_REQUIRED only; an initial notice's recipient is not assessed.
13. **V13** No contracted read of one stored run: a run's full coverage manifest is in its 201 (and replay) response; recorded runs show their summaries and issues. A future additive contract release could add a read — not done here.

## 31. Deviations, warnings and limitations

- **Deviations**: none from the mission's scope. Two product fixes after the first implementation, both before this submission: `d663804` (a failing heuristic rule's diagnostic is review required, found while documenting the engine) and `3b56a41` (browser finding F1).
- **Warnings**: lint 0 warnings; no build advisory (entry 329.85 kB; the candidates chunk 52.60 kB, no Zod); `install --immutable` reports the pre-existing YN0086 peer-dependency note (P4G adds no dependency; the lockfile is unchanged). `smoke:p4f` now reports 90 checks (92 at R13): its two probes that the validation routes are unrouted were removed when P4G routed them (`21ddcf0`); `smoke:p4g` covers those routes and the P4F smoke still probes the later-phase routes.
- **Limitations**: (L1) browser items 20–21 and 27 used in-page API calls in the signed-in browser session — the page sends a fresh Idempotency-Key per click by design and the later phases have no page; (L2) items 8–13 and 26 inject data the application never writes directly into `tb_notice_test` (rehashed with the frozen helper where the artifact must stay consistent); (L3) the evidence of item 29 is the browser's request list plus the sandbox processes' sockets at that moment, not a packet capture; (L4) cosmetic: at desktop width long rule ids wrap inside the narrow Rule column of the issues table.
- `smoke:p4g` and the earlier compiled smokes run only in CI (`CI=true`), as recorded for every phase.

## 32. Blockers

None. No schema change, contract change, legal approval, credential or external action was needed.

## 33. Proposed next phase (not started)

**CandidateAssessment (G1–G6 substantive review records)** — `captureCandidateAssessment` and `listCandidateAssessments` exactly as contracted in TB-SCHEMA-API-v1.2.0: human-performed, sourced assessments of one exact artifact (G1 authority through G6 human adoption), each bound to its artifact and dependency digest; a technical pass stays separate and decides none of them. Readiness (`getCandidateReadiness`, READY_FOR_SIGNER derived) and the unsigned export come after it. Not started; it needs its own approved mission. Signing, sending and G7 never exist in the application.

## 34. R14 result and merge reconciliation (2026-09-26, home PC)

Mission TB_R14_POST_MERGE_RECONCILE_AND_VALIDATION_RUN_READBACK_REMEDIATION_TO_R14_FINAL, §0–§3. Recorded on `feature/r14-validation-run-readback`. Sections 1–33 keep the state at their time (the R14 submission).

### 34.1 Result (operator)

| Item | Recorded value |
|---|---|
| **R14** | **PASS_WITH_ONE_CONTRACT_REMEDIATION** (2026-09-26) — P4G functionally accepted; the one gap is V13 (§30) |
| Interpretations (§30) | V1–V12 **ACCEPTED**; `ENVELOPE.REPLY_RECIPIENT` **ACCEPTED**; V13 **CONFIRMED CONTRACT READ-BACK GAP** — there is no contracted `GET /validation-runs/{id}`, so after a reload the exact stored dependency manifest, evaluated context and coverage manifest (required, executed and not-executed rule ids, `semanticReviewRequired`) and the other full ValidationRun fields cannot be read back from the API |
| Remediation | Directed: the smallest additive historical read, `GET /validation-runs/{id}` (`getValidationRun`), returning the unchanged `ValidationRun`, in the additive release TB-SCHEMA-API-v1.3.0 with ADR-0006 — implemented in §35 and submitted for **R14 final (PENDING)** |
| **P4G** | **MERGED_TO_MAIN** (`MERGED_TO_MAIN_FOR_IMPLEMENTED_SCOPE`); `P4G_IMPLEMENTATION = VERIFIED_FOR_IMPLEMENTED_SCOPE` (the three contracted validation operations). P4G is not recorded as VERIFIED_COMPLETE, and R14 not as PASS, until the operator accepts the remediation at R14 final |
| **V13** | **REMEDIATION_IMPLEMENTED_PENDING_R14_FINAL_REVIEW** (§35) |
| Constraints | The merged `feature/p4g-technical-validation` takes no remediation commit and is neither rewritten nor force-pushed; no CandidateAssessment, readiness, export, signing or sending |

### 34.2 Merge reconciliation (verified with `git` and authenticated `gh`, not assumed)

| Item | Observed value |
|---|---|
| `P4G_SUBMITTED_HEAD` | `6fc5605db61c5f15798b0ba3abc03e293b8a6a32` — the R14 submission (documentation on the code head `608800e`); push run [36234677791](https://github.com/TuongChris/tb-notice-production-system/actions/runs/36234677791) success (2026-09-26T10:04:31Z–10:12:56Z, both jobs) |
| Pull request | [#10](https://github.com/TuongChris/tb-notice-production-system/pull/10) `feature/p4g-technical-validation` → `main`, "Feature/p4g technical validation", 11 commits, `headRefOid` = `6fc5605`; opened 2026-09-26T12:15:37Z and merged 12:46:40Z by the repository owner's account. Its pull_request run [36241362949](https://github.com/TuongChris/tb-notice-production-system/actions/runs/36241362949) succeeded before the merge (12:15:42Z–12:23:58Z) |
| `P4G_MERGE_METHOD` | **merge commit** (not squash, not rebase): `c73cbda` has two parents, `5aa9248` (previous `main`) and `6fc5605`; message "Merge pull request #10 from TuongChris/feature/p4g-technical-validation"; committed through GitHub 2026-09-26T19:46:39+07:00 |
| `P4G_MERGED_MAIN_HEAD` | `c73cbdad1fe5d09813525930b4df9ed9123fd9de` |
| Ancestry / content | `git merge-base --is-ancestor 6fc5605 origin/main` exits 0. `5aa9248` is an ancestor of `6fc5605` (the branch started there), so the merge introduced nothing else: the trees of `c73cbda` and `6fc5605` are identical (`b4322b193d9f7d18e19af4eb39a897fa59bd16db`), and `git log 6fc5605..origin/main` lists only the merge commit |
| `MAIN_POST_P4G_CI` | **PASS** — push run [36242994330](https://github.com/TuongChris/tb-notice-production-system/actions/runs/36242994330) on `c73cbda`, 2026-09-26T12:46:42Z–12:54:53Z. At the operator's review it was still in progress; before any remediation step it was verified completed with both jobs success (mission §1): "Non-DB checks (cold install)" (job 108406905313, 12:46:45Z–12:49:11Z) and "Database, seed and smoke (MySQL 8.4.11)" (job 108406905408, 12:46:45Z–12:54:52Z) — `reference:check` OK and the 27 helper tests, `contracts:check` OK, lint "Found 0 warnings and 0 errors.", `yarn test` 1515 / 48 files, `yarn test:db` 520 / 14 files, migration replay and metadata verification, the seed digest unchanged, both drift diffs empty, `smoke:local` 61, `smoke:auth` 4, `smoke:directory` 14, `smoke:p3a` 24, `smoke:p3b` 36, `smoke:p4a` 50, `smoke:p4b` 64, `smoke:p4c` 62, `smoke:p4d` 87, `smoke:p4e` 84, `smoke:p4f` 90, `smoke:p4g` 86, `yarn dev` clean shutdown 4/4 (`evidence/r14-ci-run-36248642530.txt` §0) |

Nothing was amended, rebased, rewritten or force-pushed, and no tag or release was created. `feature/p4g-technical-validation` stays at `6fc5605`. The local `main` branch was not updated (it stays at `5aa9248`); the remediation branch was created from `origin/main` (`c73cbda`). No commit was made on `main`.

## 35. R14 remediation — ValidationRun read-back (TB-SCHEMA-API-v1.3.0)

Mission TB_R14_POST_MERGE_RECONCILE_AND_VALIDATION_RUN_READBACK_REMEDIATION_TO_R14_FINAL, 2026-09-26 (UTC), home PC. Submitted for **R14 final (PENDING)**: no merge of the remediation and no later phase.

### 35.1 Scope and branch

- **Directed** (R14 result): the smallest additive historical read, `GET /validation-runs/{id}` (`getValidationRun`), returning the existing `ValidationRun` in `{data, meta}`, in the new additive release TB-SCHEMA-API-v1.3.0 with ADR-0006, composed on the accepted v1.2.0.
- **Never edited:** the frozen v1.0.0 pack (`docs/reference/**`), the accepted v1.1.0 and v1.2.0 records, and ADR-0004 and ADR-0005. `PFC-YT-EMAIL-v1.1` and `TB-TECHNICAL-RULESET-v1` are unchanged (no rule semantics change), and no pre-existing operation or schema changed.
- **Excluded, and not used:** AuditEvent parsing, client-remembered POST responses, database queries from the UI, uncontracted fields in the summary or the issue list, and rebuilding a run from present-day state or by re-running the ruleset.
- **Branch.** `feature/r14-validation-run-readback`, created from the exact `origin/main` `c73cbda` once its CI was green (not from `feature/p4g-technical-validation`) and pushed with upstream.
  - At creation, local and origin pointed at `c73cbda` and the worktree was clean.
  - Branch-creation push run [36244685180](https://github.com/TuongChris/tb-notice-production-system/actions/runs/36244685180): success, both jobs (13:17:46Z–13:26:02Z).

### 35.2 The new operation (exact)

| Item | Value |
|---|---|
| operationId | `getValidationRun` (tag `Validation`) |
| Method and path | GET `/validation-runs/{id}` — path parameter `id` (uuid, 36 characters), the run id already used by `listValidationIssues` (`/validation-runs/{id}/issues`) |
| Request | none (no body, no query) |
| Success | 200 `GetValidationRunResponse` = `{ data: ValidationRun, meta: ResponseMeta }` (strict), the same shape as `ValidateCandidateResponse` |
| Read model | the unchanged v1.0.0 `ValidationRun` — no new semantic schema |
| Errors | 400/401/403/404/409/413/422/429/500 (those of `getCandidate` and `getPrompt`) |
| Security | session cookie; `x-precondition-target: null`; `x-idempotent-write: false` |
| ETag / If-Match / Idempotency-Key | none / none / none — a read of an immutable record; nothing is mutated |

**Naming and shape follow the contract's conventions** (ADR-0006 §2–§3).
- It is a `get*` by id like `getPrompt` and `getCandidate`, and returns one record, not a page.
- Every operation with a response body has its own `<OperationId>Response` envelope; in v1.2.0 that is 134 operations, none sharing one. So the only added schema is that envelope.

### 35.3 Release, immutability and compatibility

- **New release.** **TB-SCHEMA-API-v1.3.0**, additive (semantic minor). It is the accepted TB-SCHEMA-API-v1.2.0, unchanged (the frozen v1.0.0 reference + the ADR-0004 and ADR-0005 amendments), plus `docs/contracts/TB-SCHEMA-API-v1.3.0/amendment.json` (sha256 `6b74c09aba024dcf8cb2e0a0c6e374bbce17b45298d2aec83cc2e3ab166a1630`) and its `README.md`.
  - Decision: `docs/decisions/ADR-0006-tb-schema-api-v1-3-0-validation-run-read.md`, **PROPOSED** for acceptance at R14 final.
  - Base identity: the record names its base by the v1.2.0 record's digest (`b5cae658a3f47639500e2220e4a91fcfb81c34972d8426a4fa9fd1146cdbc294`) and the digests of the v1.2.0 documents.
  - Delta (the record holds only its own): `GetValidationRunResponse` after `ListValidationRunsResponse`; the path `/validation-runs/{id}` (get) after `/candidates/{candidateId}/validation-runs`, so it precedes `/validation-runs/{id}/issues`; OpenAPI `info.version` 1.2.0 → 1.3.0.
  - Result: 289 schemas (288 + 1), 144 operations (143 + 1) and 99 paths (98 + 1).
  - Generated artifacts, byte-identical to "frozen v1.0.0 + v1.1.0 + v1.2.0 + v1.3.0": `api-schemas.json` `5868d90ee84356643fe4c368a44a1b3a200502c40bb5e294146127423e956a8c`, `openapi.json` `3743fba314fb5b976be17d6368c9ce3316ad35b97cf97d7a7591c9384312dd36`, `openapi.yaml` `ad80e8ad27c5128807cd0688270d469efb2ef423c5d22e7c821c8f5b919c0ded` (v1.2.0: `f4b8d7e1…5ef4`, `0391b408…e10a511`, `9c305a97…083e`).
  - `@tb/contracts` exports `CONTRACT_BASELINE = 'TB-SCHEMA-API-v1.3.0'` and `FROZEN_REFERENCE_RELEASE = 'TB-SCHEMA-API-v1.0.0'`.
- **v1.0.0, v1.1.0 and v1.2.0 immutable** (mission §7, §9).
  - `git diff c73cbda..31df6d7` touches nothing under `docs/reference`, `docs/contracts/TB-SCHEMA-API-v1.1.0` or `docs/contracts/TB-SCHEMA-API-v1.2.0`, and neither ADR-0004 nor ADR-0005.
  - Their digests are unchanged: v1.1.0 `amendment.json` `2f4df697…dfda85` and `README.md` `4856068f…ecb56d`; v1.2.0 `amendment.json` `b5cae658…c294` and `README.md` `f18e69d0…6eba`; ADR-0004 `1c8061c4…2b3d`; ADR-0005 `f40a8c81…886c`.
  - `yarn reference:check` passes before and after (`MANIFEST.sha256` `42c2a419…6e9c` matches the pin). Nothing is generated into `docs/reference`, and `verify_contracts.py` was not run.
  - `release-v1-2-0.test.ts` and `release-v1-1-0.test.ts` pin the accepted records and reproduce their documents from their compositions to the digests recorded at acceptance. `release-v1-3-0.test.ts` pins this record, its base identity and byte identity with the generated artifacts, and proves additivity over all three earlier releases (§35.6).
  - Negative controls NC-R14-13 (one word of the v1.2.0 record) and NC-R14-14 (the v1.1.0 record) fail them (§35.9).
- **Unchanged.**
  - All 288 schemas and 143 operations of v1.2.0 are byte-identical and in their order, and therefore all of v1.1.0 (286 / 142) and v1.0.0 (284 / 141) too. This includes `ValidationRun`, `ValidationRunSummary`, `CoverageManifest`, `ValidateCandidateResponse` and the three P4G operations.
  - Also unchanged: `$id` `urn:tb:api-contract:v1`, OpenAPI 3.1.1, servers, tags, security, shared parameters and responses; `PFC-YT-EMAIL-v1.1`; `TB-TECHNICAL-RULESET-v1`; `AppMeta.schemaRelease` (`'TB-SCHEMA-API-v1.0.0'`, as recorded); the database schema.
- **Compatibility: additive only.** No existing operation, path, parameter, schema, required field, enum, format, status code, header, security requirement or error code changed. A v1.0.0–v1.2.0 client keeps working. `listValidationRuns`, `listValidationIssues` and the `validateCandidate` response are unchanged (DB and release tests, §35.6).
- **Identifiers that follow the active release** (ADR-0006, Consequences; by the accepted P4D, P4E and P4G designs, not a change of them — for the operator's review, §35.12):
  - The P4D dependency digest hashes `contract: CONTRACT_BASELINE`, so an unchanged context has another digest under v1.3.0 than under v1.2.0.
  - A new prompt snapshot records `contractVersion` TB-SCHEMA-API-v1.3.0 and the header line "Wire contract: TB-SCHEMA-API-v1.3.0".
  - A candidate drafted from a v1.2.0-era prompt, when validated, gets one REVIEW_REQUIRED `CONTEXT.PROMPT_DRIFT` issue (change `IDENTIFIERS`).
  - `MARKER.INTERNAL_IDENTIFIERS` scans the v1.3.0 identifier string.

  No stored digest, prompt or run is rewritten. The tests that pin these identifiers now name v1.3.0:
  - the P4D, P4E and P4F DB tests' `contractVersion`;
  - the P4D rule tests' contract;
  - `smoke:p4e`.

  The TB-PROMPT-TEMPLATE-v1 byte pin renders with the explicit argument `'TB-SCHEMA-API-v1.2.0'` and keeps its hashes, so the template bytes are unchanged.
- **Transition oracle.** `yarn test:transition-baseline` fails by design, as it has since the v1.1.0 edit. It is not a gate and was not run.

### 35.4 Read semantics

- **Meaning, only this.** "This is the exact ValidationRun recorded for this id." Never a present-day evaluation, a freshness decision, G1–G6, legal approval, readiness, READY_FOR_SIGNER, a signature or permission to send. TECHNICAL_PASS keeps exactly its P4G meaning, and `semanticReviewRequired` is returned as stored (`true`).
- **Implementation** (`apps/api/src/modules/validation/validation.service.ts` `get`, `validation.controller.ts`):
  - The route is session-protected by the global guard (401 without a session; nothing is read).
  - The path parameter is parsed by the contract; a malformed id is 404.
  - The run is `findUnique({ where: { id } })`, 404 `NOT_FOUND` when absent, then `toValidationRunView` — the same mapping as the run's 201 and replay responses. No other table is read: no case, candidate, prompt, production context, authority event or source.
  - `resourceReply` sends no ETag.
- **Historical only.** The read never runs the ruleset, recomputes the result, coverage or counts, rebuilds the current context, follows a newer authority record or source revision, replaces the stored digest, hides a not-executed rule or derives readiness. A later change to the case, its sources, its authority records or the candidate (its supersession included) never alters a stored run. A present-day evaluation is a new run against a new read.
- **Scope.** Global by id, like `getPrompt` and `getCandidate` (R13 decision 12). An unknown id, a malformed id and a candidate's id are the same 404 `NOT_FOUND`. The case pages keep case isolation: they list and open only the runs of the candidate they show.
- **Issues** are not embedded; `listValidationIssues` is unchanged and the page combines the two reads.
- **Read-only.** No ETag, If-Match or Idempotency-Key; the WriteExecutor is not involved.
  - Nothing is written: no run, issue, audit event or idempotency record, no case `rowVersion` or `contextRevision`, and no candidate, prompt or source change.
  - The only row a read can change is P1's session activity touch: `auth_sessions.last_seen_at`, at most once per `LAST_SEEN_WRITE_INTERVAL_MS` (60 s), as for every authenticated request. It is not a change to any run (DB test "reading writes nothing").
- **Integrity.** The stored JSON columns are returned as stored; nothing is repaired or normalized.

### 35.5 UI

`apps/web/src/app/cases/validation.tsx`; the page still imports only types from `@tb/contracts`.
- **Opening a run.** Each run of "Recorded runs of this candidate" has **Open run** (`aria-expanded`, `aria-controls`; "Close run" while open).
- **The read.** Opening it reads `GET /validation-runs/{id}` from the server every time — keyed by the run id, nothing kept from the validation's POST response. It says it is reading until the reply arrives.
- **The guard.** A run whose id, candidate or case is not this page's is not shown: "This run could not be shown here: it is not a recorded run of this candidate."
- **The recorded run.** Focus moves to the heading "Recorded technical validation result: …". The view shows:
  - the permanent qualifier "Technical checks only. This is not G1–G6 review, legal approval, readiness, signature, or permission to send.";
  - the note "Read back exactly as this run recorded it. Nothing was checked again: later changes to the case, its sources, its authority records or this candidate do not change a recorded run. Only a new run checks the context as it is now.";
  - the result's meaning, the ruleset, the artifact SHA-256 and "Dependency digest evaluated";
  - the started, completed and recorded instants, "Recorded by", the issue counts and the run id;
  - the **coverage manifest**: required, executed and not-executed rules ("None" only when the stored list is empty) and "Semantic review required", rendered from the stored value;
  - the **dependency manifest**: collapsed, a table of record, id, row version ("None recorded" when absent) and fingerprint, with the note that the records are not looked up again and nothing says whether they are current. No link is offered and nothing is resolved;
  - the **evaluated context**: under "Historical context captured by this validation run. It is not a current legal-status determination.", a collapsed, focusable `<pre>` of the stored JSON. It is plain text: no HTML, link, request or script;
  - the run's **issues** from `listValidationIssues`, unchanged.
- **The fresh result** after a run uses the same view.
- **Readable at 390 px.** Browser finding (§35.8): the table's ids wrapped to about two characters per line at 390 px. Fixed in `a5c22aa` (CSS only): ids break only at their hyphens, and the table scrolls inside its frame.
- **Wording.** Neutral: no current, valid, approved, ready or G1–G6 claim, and no action beyond Open/Close run and the existing "Run technical validation".
- **Bundle.** The candidates chunk is 56.83 kB (P4G: 52.60 kB), with no Zod; the entry is 329.93 kB; no chunk-size advisory.

### 35.6 Tests

| Suite | R14 change | Covers |
|---|---|---|
| `tests/db/p4g-http.test.ts` | +6 (32) | R14 getValidationRun:<br>• **TECHNICAL_PASS read back later**: every stored field equals the write's, its replay's and the stored row's, with no ETag; the summary and the issue list are unchanged.<br>• **BLOCKED, REVIEW_REQUIRED and ERROR read back exactly**: result, counts, every required, executed and not-executed rule and `semanticReviewRequired`. This includes a stored body with a NUL (2 rules not executed) and an ERROR run; the counts agree with the unchanged issue list.<br>• **A run under another ruleset**: a historical row set directly in `tb_notice_test`, read back exactly — nothing re-evaluated under the current ruleset.<br>• **A stored run is history**: after a new authority event, a newer source revision, a paused case source, a fact revision, a mapping edit and the candidate's supersession, the read is deep-equal and byte-equal each time, while a new run records the changed context.<br>• **Reading writes nothing**: every suite table plus `auth_sessions` and `users` stay byte-identical, except P1's `last_seen_at` touch once per interval.<br>• **Unknown or malformed id**: 404 like any unknown record (a candidate's id is not a run's); 401 without a session.<br>The contamination test also reads A's and B's runs back; the boundaries test keeps PATCH and DELETE unrouted; the collected-response test checks the four validation operations |
| `tests/db/directory-http.test.ts` | ±0 (updated) | the routed inventory: four validation operations, 134 business operations |
| `tests/db/p4d-http`, `p4e-http`, `p4f-http` | ±0 (updated) | the pinned `contractVersion` / `CONTRACT_BASELINE` is TB-SCHEMA-API-v1.3.0 |
| `tests/contracts/release-v1-3-0.test.ts` | +13 (new) | • the record digest and base identity (the v1.2.0 record and documents reproduced to their recorded digests);<br>• the constants;<br>• byte-identical composition (bundle, OpenAPI) and the committed artifacts (YAML included);<br>• every v1.0.0, v1.1.0 and v1.2.0 schema and operation unchanged and in place, with only this amendment's additions;<br>• only `info.version` changed at document level;<br>• every validation schema and operation an existing client uses unchanged since v1.0.0;<br>• the added read: GET by id, session only, no body, If-Match or Idempotency-Key, not a list, the same parameters and responses as `getCandidate` and `getPrompt`;<br>• the response is exactly the unchanged `ValidationRun` in `{data, meta}`, equal to `ValidateCandidateResponse`;<br>• no new semantic schema and no current, re-evaluated, readiness, G1–G6, approval or issue field |
| `tests/contracts/release-v1-2-0.test.ts` | 13 → 12 (rewritten) | the accepted v1.2.0 record pinned and its documents reproduced to their recorded digests; its additions unchanged in the active contract (a historical accepted-release test, as `release-v1-1-0`) |
| `tests/contracts/release-v1-1-0.test.ts` | ±0 (12) | unchanged apart from its header comment |
| `tests/contracts/inventory-openapi.test.ts` | +1 (444) | compared with the v1.3.0 release; itemized inventory of each of the five additions against its own amendment; 144 operations |
| `tests/contracts/runtime-parity.test.ts` | +1 (322) | three-way parity (baseline Ajv, generated Ajv, Zod) for all 289 schemas |
| `tests/api/prompt-rules.test.ts`, `production-context-rules.test.ts` | ±0 (updated) | the TB-PROMPT-TEMPLATE-v1 byte pin rendered with the explicit `'TB-SCHEMA-API-v1.2.0'` argument (hashes unchanged); the header line and the P4D contract name v1.3.0 |
| `tests/web/p4g.test.tsx` | +3 (14) | **After a reload a recorded run is read back from the server, never remembered**: validate; unmount; reload; the history shows summaries only and nothing is read; "Open run" requests `GET /validation-runs/{id}` (held: only "reading" shown, nothing from memory); then the stored ERROR run — result, qualifier, note, ruleset, artifact, digest, the three instants, counts, run id, every required, executed and not-executed rule (`ENVELOPE.SENDER`), semantic review, the dependency rows, the context JSON, its issues; focus on the heading; no context read or write.<br>**The evaluated context is inert text**: markup, a link and instruction-like case text shown as characters — no element, link, request or script.<br>**A recorded run stays history**: after the context changed and the candidate was superseded, the reopened run shows its recorded digest and result, with no currentness or readiness claim; a run read back with another candidate is not shown. `tests/web/support.tsx` serves the read and can hold it |
| `scripts/local/p4g-smoke.ts` (CI) | 86 → 94 checks | the pass, the blocked run, the pass after the authority event, the run of a new read and case B's run read back by id and compared exactly (no ETag); an unknown id → 404; reading wrote nothing; PATCH and DELETE of a run stay unrouted (the earlier "GET not routed" probe removed) |
| `scripts/local/smoke.ts` | +1 check (62) | the read without a session → 401 |

**Mission §19, item by item:**

| # | Requirement | Covered by |
|---|---|---|
| 1 | TECHNICAL_PASS read-back | DB "TECHNICAL_PASS read back later"; web "a recorded run stays history"; browser 1–3; `smoke:p4g` |
| 2 | BLOCKED read-back | DB "BLOCKED, REVIEW_REQUIRED and ERROR …"; browser 6 (the NUL run); `smoke:p4g` |
| 3 | REVIEW_REQUIRED read-back | DB "BLOCKED, REVIEW_REQUIRED and ERROR …" |
| 4 | ERROR read-back | DB "BLOCKED, REVIEW_REQUIRED and ERROR …"; web "after a reload …" (an ERROR run) |
| 5 | exact artifactSha256 | DB "TECHNICAL_PASS …" (equal to the write, the replay and the stored row); web; browser 3; `smoke:p4g` |
| 6 | exact dependencyDigest | DB "TECHNICAL_PASS …", "a stored run is history"; web; browser 13; NC-R14-08 |
| 7 | exact rulesetVersion | DB "TECHNICAL_PASS …", "a run recorded under another ruleset"; NC-R14-01 |
| 8 | exact dependencyManifest | DB "TECHNICAL_PASS …", "a stored run is history"; web; browser 9; NC-R14-07 |
| 9 | exact evaluatedContextJson | DB "TECHNICAL_PASS …", "a stored run is history"; web (and "inert"); browser 10; NC-R14-02 |
| 10 | exact coverageManifest | DB "BLOCKED …", "another ruleset"; web; browser 4–7; NC-R14-01 |
| 11 | exact requiredRuleIds | DB "BLOCKED …", "another ruleset" (the stored list of another ruleset); web; browser 4 |
| 12 | exact executedRuleIds | DB "BLOCKED …", "another ruleset"; web; browser 5, 6 |
| 13 | exact notExecutedRuleIds | DB "BLOCKED …" (2 rules not executed; the ERROR run), "another ruleset"; web (`ENVELOPE.SENDER`); browser 6; NC-R14-03, -04 |
| 14 | exact semanticReviewRequired | DB (every read-back test; the collected-response contract check); web; browser 7; NC-R14-05, -06 |
| 15 | exact issue counts | DB "BLOCKED …" (the counts agree with the unchanged issue list), "another ruleset" |
| 16 | exact timestamps | DB "TECHNICAL_PASS …", "another ruleset" (2026-01-02T03:04:05.678Z); web (the stored instants) |
| 17 | unknown run 404 | DB "an unknown or malformed id is 404 …"; browser (probes); `smoke:p4g` |
| 18 | repeated reads, no business writes | DB "reading writes nothing"; browser (fingerprints before and after); `smoke:p4g`; NC-R14-10, -11 |
| 19 | a current dependency change does not alter the run | DB "a stored run is history"; web "a recorded run stays history"; browser 11–13; `smoke:p4g`; NC-R14-02, -07, -08, -09 |
| 20 | candidate supersession does not alter the run | DB "a stored run is history"; web; browser (supersession); NC-R14-21 |
| 21 | an old run remains readable | DB "another ruleset", "a stored run is history"; browser 12–13 |
| 22 | listValidationRuns backward compatible | DB "TECHNICAL_PASS …" (the summary unchanged) and the unchanged P4G list tests; release test "an existing client keeps working …" |
| 23 | listValidationIssues backward compatible | DB "TECHNICAL_PASS …", "BLOCKED …" (the issue list unchanged); release test |
| 24 | validation POST response unchanged | DB "TECHNICAL_PASS …" (the read equals the write and its replay); release test (`ValidateCandidateResponse` and `ValidationRun` unchanged; the read's response has the write's shape); the unchanged P4G validation tests |
| UI (§20) | validate → unmount → reload → list → open the exact run → GET → coverage, not-executed rules, semantic review, issues; not from remembered POST data | web "after a reload a recorded run is read back from the server, never remembered" (the read held until released: nothing shown from memory); browser 1–8; NC-R14-12 |

Totals: `yarn test` **1532** in 49 files (P4G: 1515 in 48); `yarn test:db` **526** in 14 files (P4G: 520) — home PC and CI identical.

### 35.7 Commits

| Commit | Content | CI |
|---|---|---|
| `7972103` | Contract: TB-SCHEMA-API-v1.3.0 — `GetValidationRunResponse`, `getValidationRun`, `info.version` 1.3.0, `CONTRACT_BASELINE`; regenerated artifacts; the release record (`docs/contracts/TB-SCHEMA-API-v1.3.0/`) and ADR-0006 (PROPOSED); `tests/contracts/release.ts` (three releases composed in order), `release-v1-3-0.test.ts` (new), `release-v1-2-0.test.ts` (rewritten as a historical accepted-release test), inventory and runtime parity against v1.3.0; the identifier pins that follow the active release (prompt byte pin with an explicit contract argument, P4D rule tests, `smoke:p4e`) | (pushed with `60a15e1`) |
| `11bdf0f` | API: the read (`validation.service.ts` `get`, `validation.controller.ts`, `validation.module.ts`); DB tests (+6) and the routed inventories (four validation operations, 134 business operations); the other DB suites' `contractVersion` pins; `smoke:p4g` read-backs and `smoke:local`'s 401 boundary | (pushed with `60a15e1`) |
| `60a15e1` | UI: "Open run" reads a recorded run back from the server (`validation.tsx`, API client, CSS); web tests (+3) and the fake API's held run reads (`tests/web/support.tsx`) | run 36247026781 success — `smoke:p4g` 94 checks, `smoke:local` 62 |
| `a5c22aa` | Fix from the browser pass: the recorded dependency ids stay readable at 390 px (CSS only) | run 36248047310 success |
| `31df6d7` | Test: the read-back web tests fail on their own assertion (from negative-control run 1; test code only) — the code head | run 36248642530 success |
| (this record) | R14-final submission: §34–§35, the evidence `r14-*` and screenshots, ADR-0006 and v1.3.0 README verification pointers, `CLAUDE.md`, `CURRENT_STATE.md` (documentation only) | reported with the R14-final report |

### 35.8 Browser verification (Playwright MCP)

**17/17 PASS** — every item of mission §21 (`evidence/r14-playwright-mcp-verification.txt`; screenshots `evidence/screenshots/r14-*`). Target: `yarn ui:sandbox` (the compiled API on the disposable `tb_notice_test` and the built web app), an isolated headless browser, synthetic data only. Two sessions: session 1 built from `60a15e1` (items 1–17), session 2 from `a5c22aa` (the fix of the one finding; items 1, 2 and 15 again).

- **Recorded, reloaded, opened.**
  - A TECHNICAL_PASS run, then a full reload: a fresh document, no run held and none read.
  - "Open run" then read `GET /validation-runs/{id}` — 200, no ETag, `no-store`, and no body, If-Match, Idempotency-Key or CSRF token in the request.
  - The response equals the stored `validation_runs` row in all 17 fields, with no extra field.
- **Coverage and issues.** The pass shows 29 required and 29 executed rules, "Not executed (0) — None" and "Semantic review required: Yes — this run performed no G1–G6 or legal review".
  - A run of a candidate whose stored body was given a NUL in `tb_notice_test` (BLOCKED) shows after a reload "Not executed (2)" (ARTIFACT.BODY_SHA256, ARTIFACT.ARTIFACT_SHA256), 27 executed rules and its 5 issues in rule order.
- **Dependency manifest and evaluated context.**
  - The dependency manifest opens as a table of the 21 recorded dependencies, with no link and no request.
  - The evaluated context opens as a `<pre>` with no child element. The work title's `<img … onerror>`, a drive.example.invalid URL and instruction-like text are shown as characters; the handler never ran.
- **History stays history.**
  - After a new authority event and a new source revision, the reopened run's `data` is byte-identical to the first read. The panel's current digest (`4c85…6df9`) and the run's evaluated digest (`3955…b3e8`) are shown apart.
  - After the candidate's supersession, the run is byte-identical again, and the stored row's SHA-256 is unchanged.
  - No current or readiness wording appears.
- **One finding, fixed.** At 390 px the page did not scroll sideways, but the dependency table's Id column shrank to about two characters per line (22 lines per id). This was the global `code { overflow-wrap: anywhere }` in an automatic table layout. Fixed in `a5c22aa` (ids break only at hyphens: 4 lines; the table scrolls inside its frame) and re-verified.
- **Keyboard.** Tab reaches "Open run"; Enter moves focus to the recorded heading. Both summaries open with Enter, the context `<pre>` takes focus and scrolls with PageDown, and "Close run" keeps focus.
- **Sign-out.** Sign-out leads to the login page, a candidate URL then redirects to it, and the read is 401 SESSION_REQUIRED.
- **Reads write nothing.** The fingerprint of runs, issues, candidates and cases and the counts of audit events and idempotency records are identical before and after the reads. The audit log holds exactly one VALIDATION_RUN_RECORDED per run.
- **Cleanup.** Sandbox rows were deleted, `db:verify test --expect-empty` PASS after each session, and both password files were deleted.

### 35.9 Negative controls

**24/24 caught and restored byte-identically** (`evidence/r14-negative-controls.txt`).
- **Final run 2** on `31df6d7`, 2026-09-26T14:27:17Z–14:28:40Z: every one of the 32 responsible commands failed and named its test, each first failure an AssertionError. The working-tree fingerprint was identical before and after, and `tb_notice_test` was empty afterwards.
- The unmutated baseline before each run passed (13 distinct commands, each selecting at least one test).

| Mission §22 control | Controls |
|---|---|
| historical coverage rebuilt from current ruleset | NC-R14-01 |
| historical context rebuilt from current Case state | NC-R14-02 |
| notExecuted rules hidden on reload | NC-R14-03 (API), NC-R14-04 (UI) |
| semanticReviewRequired dropped | NC-R14-05 (API), NC-R14-06 (UI) |
| dependencyManifest rebuilt current | NC-R14-07 |
| historical digest rewritten | NC-R14-08 |
| current ruleset result substituted for stored result | NC-R14-09 |
| read writes AuditEvent | NC-R14-10 |
| read mutates Case | NC-R14-11 |
| UI uses cached POST response rather than GET | NC-R14-12 |
| v1.2.0 amended in place | NC-R14-13 (and NC-R14-14: v1.1.0) |
| also | NC-R14-15 (a present-day field added to the read's schema), 16 (`CONTRACT_BASELINE` left at v1.2.0), 17 (the read not routed), 18 (the read without a session), 19 (an ETag on an immutable run), 20 (issues embedded in the read), 21 (a superseded candidate's run hidden), 22 (the evaluated context rendered as HTML), 23 (another candidate's run shown), 24 (the dependency manifest resolved to present-day records) |

Run 1 (on `a5c22aa`) also caught 24/24, but three commands failed on a wait helper's timeout rather than an assertion: NC-R14-12 in two tests and NC-R14-23. The fix `31df6d7` (test code only) makes both tests wait for a neutral outcome and then assert. A re-run of the two controls and the final run 2 then failed on AssertionErrors only.

### 35.10 Regression sweep and CI

**Sweep** (mission §25): 2026-09-26T14:29:29Z–14:38:12Z on `31df6d7`. All 21 steps exit 0 (`evidence/r14-first-pc-sweep.txt`).

| Command | Result |
|---|---|
| `yarn reference:check` (before and after) | frozen references intact (`MANIFEST.sha256` `42c2a419…` matches the pin) |
| `yarn reference:helper-tests` | 27 pass, 0 fail |
| `yarn contracts:check` | 3 generated outputs match the active source |
| `yarn install --immutable` | lockfile unchanged (pre-existing YN0086 note) |
| `yarn typecheck` · `yarn format:check` | exit 0 |
| `yarn lint` · `oxlint --deny-warnings --format default` | exit 0 · exit 0 — **0 warnings** ("Found 0 warnings and 0 errors." on 325 files) |
| `yarn test` | 1532 / 1532 in 49 files |
| `yarn test:db` | 526 / 526 in 14 files (`tb_notice_test`) |
| `yarn db:verify test --expect-empty` (before and after) | PASS, domain rows 0 |
| `yarn db:verify dev` | PASS (metadata and a row count only: 5, unchanged — nothing written to `tb_notice_dev`) |
| `yarn db:status test` / `dev` | up to date (1 migration) |
| `yarn db:drift:diff-migrations` / `db:drift:diff-datasource dev` | empty migration (no drift) |
| `yarn build` | exit 0, no chunk-size advisory (entry 329.93 kB, candidates chunk 56.82 kB) |
| `yarn smoke:local` | 62 checks (P4G: 61; the new one: the read without a session → 401) |
| `yarn dev:verify-shutdown` | 4 / 4 scenarios |

`smoke:auth`, `smoke:directory`, `smoke:p3a`, `smoke:p3b` and `smoke:p4a`–`smoke:p4g` write records and run only in CI. They are all kept and pass there.

**CI** (`evidence/r14-ci-run-36248642530.txt`).

- **Code head `31df6d7`:** push run [36248642530](https://github.com/TuongChris/tb-notice-production-system/actions/runs/36248642530) (2026-09-26T14:28:50Z–14:35:44Z), **success**, both jobs:
  - "Non-DB checks (cold install)" (job 108422410416): the reference check and the 27 helper tests, `contracts:check`, lint "Found 0 warnings and 0 errors.", format, `yarn test` 1532 / 49 files, build, the frozen references and the working tree unchanged.
  - "Database, seed and smoke (MySQL 8.4.11)" (job 108422410339): migration and metadata verification on test, replay and dev; `yarn test:db` 526 / 14 files; the seed twice with the canonical digest unchanged; both drift diffs empty; `smoke:local` 62; `smoke:auth` 4; `smoke:directory` 14; `smoke:p3a` 24; `smoke:p3b` 36; `smoke:p4a` 50; `smoke:p4b` 64; `smoke:p4c` 62; `smoke:p4d` 87; `smoke:p4e` 84; `smoke:p4f` 90; **`smoke:p4g` 94** (the read-backs included); the P1.1 recovery commands; `yarn dev` clean shutdown 4 / 4.
- **Earlier runs, all success, both jobs** (each commit pushed only after the previous run finished):
  - the post-merge `main` `c73cbda` (run 36242994330, §34.2);
  - the branch at creation (run 36244685180);
  - `60a15e1` (run 36247026781: the contract, API and UI commits; `smoke:p4g` 94 and `smoke:local` 62 for the first time);
  - `a5c22aa` (run 36248047310).
- **Documentation head:** its run is reported with the R14-final report.

### 35.11 Schema, migration and dependencies

- **None changed.** No migration was needed, created or applied: `validation_runs` already holds every returned field. `20260923103912_initial_schema` is still the only migration, and both drift diffs are empty. No `db push`, `migrate reset`, FK disabling or applied-migration edit.
- **Nothing else outside the change.** `git diff c73cbda..31df6d7` (36 files) touches nothing under `apps/api/prisma`, `docs/reference`, `docs/contracts/TB-SCHEMA-API-v1.1.0`, `docs/contracts/TB-SCHEMA-API-v1.2.0`, ADR-0004, ADR-0005, `yarn.lock`, `.yarnrc.yml`, `.nvmrc` or any `package.json`. No dependency was added.

### 35.12 Warnings and open items for the operator (not decided here)

1. **Acceptance of ADR-0006** (PROPOSED) and of TB-SCHEMA-API-v1.3.0 as the active release, at R14 final. Until then `main` carries v1.2.0.
2. **Identifiers that follow the active release** (§35.3; ADR-0006, Consequences). Under v1.3.0 the same context has another P4D dependency digest, and new prompts name v1.3.0. A candidate drafted from a v1.2.0-era prompt therefore validates as REVIEW_REQUIRED (one `CONTEXT.PROMPT_DRIFT` issue, change `IDENTIFIERS`) rather than TECHNICAL_PASS until it is re-drafted from a v1.3.0 prompt. Stored digests, prompts and runs are never rewritten. This follows from the accepted designs; the operator's confirmation is asked.
3. **`AppMeta.schemaRelease`** stays `'TB-SCHEMA-API-v1.0.0'` as recorded (ADR-0004–ADR-0006).
4. **The transition oracle** fails by design (§35.3).
5. **Pre-existing, non-blocking:**
   - the YN0086 peer-dependency note of `yarn install`;
   - P4G limitation L4: long rule ids wrap in the narrow Rule column of the issues table, which the recorded run's issue list reuses;
   - the accepted count wording "1 blockers".
6. **Evidence limitations:**
   - the BLOCKED run with not-executed rules came from a NUL written directly into a stored synthetic body in `tb_notice_test`, as P4G limitation L2 did;
   - the historical-row DB test sets one run under another ruleset identifier directly in `tb_notice_test` (data the application never writes).

### 35.13 Status

| Scope | Status |
|---|---|
| R14 review | **PASS_WITH_ONE_CONTRACT_REMEDIATION** (operator, 2026-09-26) — until the operator's R14-final review; not marked PASS here |
| V13 | **REMEDIATION_IMPLEMENTED_PENDING_R14_FINAL_REVIEW** — implemented and verified on `feature/r14-validation-run-readback` (code head `31df6d7`), submitted for **R14 final (PENDING)**; not merged |
| ADR-0006 / TB-SCHEMA-API-v1.3.0 | **PROPOSED** (active on the remediation branch; `main` carries the accepted v1.2.0) |
| P4G | **MERGED_TO_MAIN_FOR_IMPLEMENTED_SCOPE** (`c73cbda`), `P4G_IMPLEMENTATION = VERIFIED_FOR_IMPLEMENTED_SCOPE`; not VERIFIED_COMPLETE until R14 final |
| Database / dependencies | **No change** |
| CandidateAssessment and later phases | **NOT_STARTED** |
