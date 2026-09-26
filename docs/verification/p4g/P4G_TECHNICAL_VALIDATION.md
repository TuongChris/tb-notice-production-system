# P4G — Technical validation (home PC)

Mission **TB_R13_CLOSEOUT_MERGE_AND_P4G_TECHNICAL_VALIDATION_TO_R14**, steps 9–11. Branch `feature/p4g-technical-validation`, created from the exact post-P4F `main` `5aa9248` (merge commit of PR #9), with the post-R13 checkpoint `b71a2e0` (documentation only). P4G implements **three** contracted operations — `validateCandidate`, `listValidationRuns` and `listValidationIssues` — and the technical-validation section of the candidate page.

**Submitted for review gate R14 (PENDING).** No P4G pull request or merge. No CandidateAssessment, G1–G6 review, readiness, READY_FOR_SIGNER, unsigned export, G7, signature, sending, mailbox, Drive or AI-provider action exists.

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
| P4G home-PC automated tests | **PASS** — `yarn test` 1515 in 48 files and `yarn test:db` 520 in 14 files on the code head `608800e`; P4G: 36 rule-engine and 3 WriteExecutor unit tests, 11 web, 26 DB (§26) |
| Consistency / transaction tests | **PASS** — capture in one REPEATABLE READ snapshot, the ruleset outside any lock, one short SERIALIZABLE commit with the rechecks: a change committed after the capture is 412 with nothing written, a dependency write that never locks the case waits for the commit, an audit failure rolls back the run, its issues and the idempotency record (DB tests; negative controls NC-P4G-18, -19, -20) (§6) |
| Browser verification (Playwright MCP, `tb_notice_test`) | **PASS** 32/32 — two sandbox sessions; one finding (F1) fixed in `3b56a41` and re-verified; limitations L1–L4 (§24) |
| Negative controls | **PASS** 33/33 in the final run on `608800e` — all 22 control kinds of mission §43 plus 11 further; 60 responsible commands, each failing on an AssertionError (§25) |
| Full regression (mission §48) | **PASS** — 21/21 steps exit 0 on the code head `608800e` (§26) |
| Exact final branch CI | **PASS** for the code head `608800e` — push run 36233916154, both jobs success; the run of this record's own commit (the R14 submission head, documentation only) is reported with the R14 report, since a commit cannot record its own run (§26) |
| Schema / migration | **No change** (§28) |
| Wire contract | **No change** — TB-SCHEMA-API-v1.2.0 (§29) |
| R14 review | **PENDING** |

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
