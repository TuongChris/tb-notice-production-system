# P4G — Technical validation (home PC)

Mission **TB_R13_CLOSEOUT_MERGE_AND_P4G_TECHNICAL_VALIDATION_TO_R14**, steps 9–11. Branch `feature/p4g-technical-validation`, created from the exact post-P4F `main` `5aa9248` (merge commit of PR #9), with the post-R13 checkpoint `b71a2e0` (documentation only). P4G implements **three** contracted operations — `validateCandidate`, `listValidationRuns` and `listValidationIssues` — and the technical-validation section of the candidate page.

**R14 result (operator, 2026-09-26): PASS_WITH_ONE_CONTRACT_REMEDIATION.** P4G is functionally accepted: interpretations V1–V12 and `ENVELOPE.REPLY_RECIPIENT` are ACCEPTED, and V13 is a CONFIRMED CONTRACT READ-BACK GAP (no contracted `GET /validation-runs/{id}`, §30). It is remediated by the mission TB_R14_POST_MERGE_RECONCILE_AND_VALIDATION_RUN_READBACK_REMEDIATION_TO_R14_FINAL (2026-09-26) on `feature/r14-validation-run-readback`: the additive contract release **TB-SCHEMA-API-v1.3.0** (ADR-0006, PROPOSED) and its one new read, `getValidationRun` (§35). The remediation is submitted for **R14 final (PENDING)**. Until the operator's final review, R14 stays **PASS_WITH_ONE_CONTRACT_REMEDIATION** and V13 is **REMEDIATION_IMPLEMENTED_PENDING_R14_FINAL_REVIEW**.

**Merged (2026-09-26, by the operator):** `P4G = MERGED_TO_MAIN` (`MERGED_TO_MAIN_FOR_IMPLEMENTED_SCOPE`) — pull request #10, merge commit `c73cbda` (parents `5aa9248` and the R14 submission head `6fc5605`); `main` push CI run 36242994330 success. `P4G_IMPLEMENTATION = VERIFIED_FOR_IMPLEMENTED_SCOPE` (§34). No CandidateAssessment, G1–G6 review, readiness, READY_FOR_SIGNER, unsigned export, G7, signature, sending, mailbox, Drive or AI-provider action exists.

**Astra audit (independent, operator; audit target `4a1618d`): R14 = HOLD_FOR_REMEDIATION**, ADR-0006 PROPOSED / REVISE_BEFORE_ACCEPTANCE, `ASTRA_AUDIT = PARTIAL`. Mission TB_R14_ASTRA_BLOCKER_REMEDIATION (2026-09-27) remediated the four authorized findings on the same branch (§36): R14-AUD-001 (a correspondence source restricted to another subject reached another case's production context as clean support), -003 (`TB-TECHNICAL-RULESET-v2` pins the internal-marker vocabulary), -004 (ui:sandbox cleanup ownership) and -008 (G6/G7 terminology) — each **REMEDIATED_PENDING_INDEPENDENT_REVIEW**. **R14 = HOLD_FOR_REVIEW**; ADR-0006 stays **PROPOSED** (revised); R14-AUD-002 and -007 are OPEN_BACKLOG, -005 and -006 FUTURE_ASSESSMENT_PREREQUISITE. P4G is not recorded as VERIFIED_COMPLETE, nor R14 as PASS.

**Astra audit continued (at `fdcda2b`; `ASTRA_AUDIT = PARTIAL`):** R14-AUD-001, -003, -004 and -008 **CLOSED_VERIFIED_WITH_LIMITS**; two further blockers of R14 final and of assessment implementation, R14-AUD-009 (a mandate version's sources and a whole-mandate event's source, checked at the agency level, reached the context of a case of another legal subject as clean) and R14-AUD-010 (a case-only citation made inapplicable by another owner's later records raised no conflict and left the digest unchanged). Mission TB_R14_ASTRA_REMAINING_BLOCKER_REMEDIATION (2026-09-27) remediated exactly those two on the same branch (§37): every source a context lists is checked against the case as it is now, and another owner's use of any of them joins its fingerprint — each **REMEDIATED_PENDING_INDEPENDENT_REVIEW**. **R14 = HOLD_FOR_REVIEW**; ADR-0006 stays **PROPOSED**; R14-AUD-011 and -012 are NON_BLOCKING_BACKLOG. No wire, schema, migration or ruleset change.

**Astra re-audit (at `e0a521a`):** R14-AUD-009 and -010 **CLOSED_VERIFIED_WITH_LIMITS**, together with -001, -003, -004 and -008. One further blocker of R14 final and of assessment implementation: R14-AUD-013. The digest definition identifier stayed `TB-PRODUCTION-CONTEXT-DIGEST-v1` while the context semantics changed, so a preview from an earlier deployment could authorize a prompt of a context never seen. Mission TB_R14_ASTRA_AUD013_SEMANTIC_DIGEST_REMEDIATION (2026-09-28) remediated exactly that on the same branch (§38): `TB-PRODUCTION-CONTEXT-DIGEST-v2` (ADR-0007, PROPOSED), one definition for every read and rebuild, stored digests kept as recorded — **REMEDIATED_PENDING_INDEPENDENT_REVIEW**. **R14 = HOLD_FOR_REVIEW**; ADR-0006 and ADR-0007 stay **PROPOSED**. No wire, schema or migration change; `TB-TECHNICAL-RULESET-v2` and `TB-PROMPT-TEMPLATE-v1` unchanged, with one named exception in the ruleset's guard test (§38.7).

**R14 final (operator, 2026-09-28): PASS.** On the recommendation of the independent Astra review of the exact head `c889e63`:
- P4G = **VERIFIED_COMPLETE**.
- R14-AUD-013 **CLOSED_VERIFIED_WITH_LIMITS** (with -001, -003, -004, -008, -009 and -010); R14-AUD-014 **CLOSED_DOCUMENTATION_ONLY**; current R14 blockers **NONE**.
- ADR-0006 and ADR-0007 **ACCEPTED WITH DOCUMENTED QUALIFICATION**. **TB-SCHEMA-API-v1.3.0** is the active wire contract; `TB-PRODUCTION-CONTEXT-DIGEST-v2` and `TB-TECHNICAL-RULESET-v2` are active; `PFC-YT-EMAIL-v1.1` is unchanged.
- A **bounded technical acceptance**: not legal approval, real-case authorization, a G1–G6 assessment, G7 or permission to send.
- The remediation branch is authorized for merge to `main` by a normal merge commit (mission TB_R14_FINAL_ACCEPTANCE_CLOSEOUT_AND_MERGE; §39).
- CandidateAssessment stays **NOT_STARTED**, on hold for R14-AUD-005 and -006.

**Merged (2026-09-28):** the R14 remediation and its closeout — pull request #11, merge commit `20367b9` (parents `c73cbda` and the closeout head `f1b6aaf`; its tree is identical to `f1b6aaf`); `main` push CI run 36399587944 success, both jobs, logs read. `P4G = VERIFIED_COMPLETE, MERGED_TO_MAIN`; `MAIN_POST_R14_CI = PASS` (§40).

The statuses in the paragraphs above are those of their time.

Persistent rules (they stay in force; `CLAUDE.md` carries them):

- **Technical validation ≠ substantive review.** A ValidationRun records what the technical ruleset found for one exact candidate artifact against the current recorded context: exact bytes and hashes, the envelope and thread, the document plan, internal markers, recorded gaps and drift. It reviews nothing substantively — no authority (G1), work-specific rights (G2), identification sufficiency (G3), audiovisual infringement (G4), permission or exceptions (G5), exact-artifact consistency and traceability QA (G6), legal validity or signer eligibility — and it is no G7, the actual human review, adoption, signature and sending outside the application. (Terminology corrected 2026-09-27, R14-AUD-008: this line first named "human adoption of the text" as G6; personal adoption is G7.)
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
| P4G home-PC automated tests | **PASS** — `yarn test` 1515 in 48 files and `yarn test:db` 520 in 14 files on the code head `608800e`; P4G: 36 rule-engine and 3 WriteExecutor unit tests, 11 web, 26 DB (§26). R14 remediation: `yarn test` 1532 in 49 files, `yarn test:db` 526 in 14 files on `31df6d7` (§35.6). Astra-audit remediation: `yarn test` 1559 in 52 files, `yarn test:db` 534 in 14 files on `2117fba` (§36.7). Remaining-blocker remediation: `yarn test` 1575 in 52 files, `yarn test:db` 544 in 14 files on `51c5f44` (§37.7). R14-AUD-013 remediation: `yarn test` 1580 in 52 files, `yarn test:db` 548 in 14 files on `be8d74b` (§38.8). R14 final closeout: `yarn test` 1580 in 52 files, unchanged (§39.8) |
| Consistency / transaction tests | **PASS** — capture in one REPEATABLE READ snapshot, the ruleset outside any lock, one short SERIALIZABLE commit with the rechecks: a change committed after the capture is 412 with nothing written, a dependency write that never locks the case waits for the commit, an audit failure rolls back the run, its issues and the idempotency record (DB tests; negative controls NC-P4G-18, -19, -20) (§6) |
| Browser verification (Playwright MCP, `tb_notice_test`) | **PASS** 32/32 — two sandbox sessions; one finding (F1) fixed in `3b56a41` and re-verified; limitations L1–L4 (§24). R14 read-back **PASS** 17/17 — one finding (the 390 px dependency table) fixed in `a5c22aa` and re-verified (§35.8). Astra-audit remediation **PASS** 14/14, no finding (§36.9). Remaining-blocker remediation **PASS** 18/18, no finding (§37.9). R14-AUD-013 remediation **PASS** 18/18, no finding (§38.10) |
| Negative controls | **PASS** 33/33 in the final run on `608800e` — all 22 control kinds of mission §43 plus 11 further; 60 responsible commands, each failing on an AssertionError (§25). R14 remediation **PASS** 24/24 on `31df6d7` — the 11 mandatory kinds plus 13 further; 32 commands, each failing on an AssertionError (§35.9). Astra-audit remediation **PASS** 18/18 on `2117fba` — the 9 mandatory kinds of mission §40 plus 9 further; 28 commands, each failing on an AssertionError (§36.10). Remaining-blocker remediation **PASS** 14/14 on the code of `51c5f44` — the 10 mandatory controls plus 4 further; 27 commands, each failing on an AssertionError (§37.10). R14-AUD-013 remediation **PASS** 15/15 on `be8d74b` — the 7 mission controls (NC-013-A…G, C in three variants) plus 6 further; 31 commands, each failing on an AssertionError (§38.11) |
| Full regression (mission §48) | **PASS** — 21/21 steps exit 0 on the code head `608800e` (§26). R14 remediation 21/21 on `31df6d7` (§35.10). Astra-audit remediation 21/21 on `2117fba` (§36.11). Remaining-blocker remediation 21/21 on `51c5f44` (§37.11). R14-AUD-013 remediation 21/21 on `be8d74b`, and each code commit on its own (§38.12) |
| Exact final branch CI | **PASS** for the code head `608800e` — push run 36233916154, both jobs success; the R14 submission head `6fc5605` — push run 36234677791 success. R14 remediation code head `31df6d7` — push run 36248642530, both jobs success (§35.10); the run of the remediation's documentation head is reported with the R14-final report. Astra-audit remediation code head `2117fba` — push run 36290145394, both jobs success (§36.11); its documentation head `fdcda2b` — push run 36291505391, both jobs success. Remaining-blocker remediation code head `51c5f44` — push run 36325665818, both jobs success (§37.11); its documentation head `e0a521a` — push run 36326570907, both jobs success (§38.1). R14-AUD-013 remediation code head `be8d74b` — push run 36375405502, both jobs success (§38.12); its documentation head `c889e63`, the head accepted at R14 final — push run 36378687232, both jobs success (§39.7). The R14 closeout head `f1b6aaf` — push run 36397635020 and pull_request run 36398531959; the post-merge `main` `20367b9` — push run 36399587944; all success, both jobs, logs read (§40) |
| Schema / migration | **No change** (§28; the R14 remediation made none either, §35.11, nor the Astra-audit remediations, §36.12, §37.12, §38.13, nor the R14 final closeout, §39) |
| Wire contract | **No change in P4G** — TB-SCHEMA-API-v1.2.0 (§29). The R14 remediation adds the additive release **TB-SCHEMA-API-v1.3.0** (one read, one envelope schema; ADR-0006 **ACCEPTED** with documented qualification at R14 final — the active wire contract, §35.3, §39). The Astra-audit remediations and the closeout changed no wire contract: the v1.3.0 amendment digest is unchanged (§36.12, §37.12, §38.13, §39.8) |
| R14 review | **PASS** (operator, 2026-09-28, R14 final; §39). First **PASS_WITH_ONE_CONTRACT_REMEDIATION** (operator, 2026-09-26): V1–V12 and `ENVELOPE.REPLY_RECIPIENT` ACCEPTED; V13 remediated on `feature/r14-validation-run-readback` (§34, §35) and accepted with ADR-0006. The operator's independent Astra audit of that submission (`4a1618d`) put **R14 = HOLD_FOR_REMEDIATION**; after the Astra-audit remediation, **R14 = HOLD_FOR_REVIEW** (§36); the audit continued at `fdcda2b` found R14-AUD-009 and -010, remediated in §37; the re-audit at `e0a521a` closed them with limits and found R14-AUD-013, remediated in §38; the independent review of `c889e63` recommended **R14 = PASS**. A bounded technical acceptance (§39.2) |
| Astra audit findings | R14-AUD-001, -003, -004, -008, -009, -010 and -013 **CLOSED_VERIFIED_WITH_LIMITS** (the continued audit at `fdcda2b`, the re-audit at `e0a521a` and the final review at `c889e63`; §36–§39); R14-AUD-014 **CLOSED_DOCUMENTATION_ONLY** (§39.4); R14-AUD-002 and -007 **OPEN_BACKLOG**; R14-AUD-011 and -012 **NON_BLOCKING_BACKLOG**; R14-AUD-005 and -006 **FUTURE_ASSESSMENT_PREREQUISITE**; current R14 blockers **NONE**. The final review is an independent, bounded review; no 100 % whole-repository semantic audit is claimed (§39.2) |
| P4G status / merge | **VERIFIED_COMPLETE** (R14 final, §39). P4G merged to `main` for its implemented scope — pull request #10, merge commit `c73cbda` (merge commit method; 2026-09-26T12:46:40Z); `main` push CI run 36242994330 success (§34). The R14 remediation and its closeout **MERGED_TO_MAIN** — pull request #11, merge commit `20367b9` (merge commit method; 2026-09-28T08:48:34Z); `main` push CI run 36399587944 success, both jobs (`MAIN_POST_R14_CI = PASS`, §40) |
| CandidateAssessment | **NOT_STARTED**, **HOLD_FOR_PRE_ASSESSMENT_PREREQUISITES** — R14-AUD-005 and -006 first (§39.6) |

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

New validations record `TB-TECHNICAL-RULESET-v2` since the Astra-audit remediation (§36.3): this inventory, the kinds, severities, order and aggregation are unchanged, and `MARKER.INTERNAL_IDENTIFIERS`' identifier strings are pinned instead of read from the active release. Runs recorded as v1 stay exactly as recorded.

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
- The context, closure, fingerprints and digest are P4D's, unchanged (`TB-PRODUCTION-CONTEXT-DIGEST-v1`; no second digest algorithm; _since R14-AUD-013 the one definition is `TB-PRODUCTION-CONTEXT-DIGEST-v2`, §38_). The caller's `expectedDependencyDigest` must be the current digest — never substituted — or the request is 412 `CONTEXT_CHANGED` with nothing written; the page then requires a new read (§22).
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

**CandidateAssessment (G1–G6 substantive review records)** — `captureCandidateAssessment` and `listCandidateAssessments` exactly as contracted in TB-SCHEMA-API-v1.2.0: human-performed, sourced assessments of one exact artifact (G1 authority through G6 exact-artifact consistency and traceability QA), each bound to its artifact and dependency digest [terminology corrected 2026-09-27, R14-AUD-008: first recorded naming human adoption as the G6 gate; personal adoption is G7, outside the application]; a technical pass stays separate and decides none of them. Readiness (`getCandidateReadiness`, READY_FOR_SIGNER derived) and the unsigned export come after it. Not started; it needs its own approved mission. Signing, sending and G7 never exist in the application.

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
- **Never edited:** the frozen v1.0.0 pack (`docs/reference/**`), the accepted v1.1.0 and v1.2.0 records, and ADR-0004 and ADR-0005. `PFC-YT-EMAIL-v1.1` and `TB-TECHNICAL-RULESET-v1` are unchanged (no rule semantics change), and no pre-existing operation or schema changed. [Corrected 2026-09-27 (Astra R14-AUD-003, §36.3): v1's `MARKER.INTERNAL_IDENTIFIERS` vocabulary followed `CONTRACT_BASELINE`, so v1's effective behaviour did change with this release; new validations run `TB-TECHNICAL-RULESET-v2`.]
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
  - Also unchanged: `$id` `urn:tb:api-contract:v1`, OpenAPI 3.1.1, servers, tags, security, shared parameters and responses; `PFC-YT-EMAIL-v1.1`; `TB-TECHNICAL-RULESET-v1` (its definition, not its effective behaviour — §36.3); `AppMeta.schemaRelease` (`'TB-SCHEMA-API-v1.0.0'`, as recorded); the database schema.
- **Compatibility: additive only.** No existing operation, path, parameter, schema, required field, enum, format, status code, header, security requirement or error code changed. A v1.0.0–v1.2.0 client keeps working. `listValidationRuns`, `listValidationIssues` and the `validateCandidate` response are unchanged (DB and release tests, §35.6).
- **Identifiers that follow the active release** (ADR-0006, Consequences; by the accepted P4D, P4E and P4G designs, not a change of them — for the operator's review, §35.12):
  - The P4D dependency digest hashes `contract: CONTRACT_BASELINE`, so an unchanged context has another digest under v1.3.0 than under v1.2.0.
  - A new prompt snapshot records `contractVersion` TB-SCHEMA-API-v1.3.0 and the header line "Wire contract: TB-SCHEMA-API-v1.3.0".
  - A candidate drafted from a v1.2.0-era prompt, when validated, gets one REVIEW_REQUIRED `CONTEXT.PROMPT_DRIFT` issue (change `IDENTIFIERS`).
  - `MARKER.INTERNAL_IDENTIFIERS` scans the v1.3.0 identifier string. [Corrected 2026-09-27: this was the R14-AUD-003 defect; `TB-TECHNICAL-RULESET-v2` pins the vocabulary, both release strings included (§36.3).]

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
2. **Identifiers that follow the active release** (§35.3; ADR-0006, Consequences). Under v1.3.0 the same context has another P4D dependency digest, and new prompts name v1.3.0. A candidate drafted from a v1.2.0-era prompt therefore validates as REVIEW_REQUIRED (one `CONTEXT.PROMPT_DRIFT` issue, change `IDENTIFIERS`) rather than TECHNICAL_PASS. [Corrected 2026-09-27 (mission TB_R14_ASTRA_BLOCKER_REMEDIATION §24, §48): as first recorded this sentence ended "until it is re-drafted from a v1.3.0 prompt". REVIEW_REQUIRED asks a person to review the version-only difference; it is not a mandatory re-draft, and by itself it says nothing about the candidate's content, owner facts, authority or rights (§36.3; ADR-0006, Consequences).] Stored digests, prompts and runs are never rewritten. This follows from the accepted designs; the operator's confirmation is asked.
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

## 36. Astra audit remediation — R14-AUD-001, -003, -004 and -008 (2026-09-27, home PC)

Mission TB_R14_ASTRA_BLOCKER_REMEDIATION (operator, 2026-09-27), on `feature/r14-validation-run-readback`. Primary source: the operator's independent Astra whole-system R14 pre-assessment audit of the R14-final submission head `4a1618d`, which put **R14 = HOLD_FOR_REMEDIATION** and ADR-0006 = PROPOSED / REVISE_BEFORE_ACCEPTANCE. `ASTRA_AUDIT = PARTIAL`: the audit continues from its saved checkpoint. Sections 1–35 keep the state at their time; where this mission corrected them, the correction is marked in place (the rule summary and §33 for the gate terminology; §35.1, §35.3 and §35.12 for the ruleset identity and version-only drift).

### 36.1 Scope, pre-flight and independent confirmation

| Item | Value |
|---|---|
| Authorized | exactly R14-AUD-001 (CONFIRMED_DEFECT / HIGH; blocks R14 final and assessment implementation), R14-AUD-003 (SPEC_CONFLICT / MEDIUM; blocks R14 final), R14-AUD-004 (CONFIRMED_DEFECT / MEDIUM; fixed before any further sandbox use) and R14-AUD-008 (SPEC_CONFLICT / LOW; documentation terminology) |
| Recorded only, unchanged | R14-AUD-002 and -007 **OPEN_BACKLOG**; R14-AUD-005 and -006 **FUTURE_ASSESSMENT_PREREQUISITE** (§36.6) |
| Not done (not authorized) | CandidateAssessment, AssessmentSource, G1–G6 capture, readiness, READY_FOR_SIGNER, unsigned export, G7, signature, sending, email, Drive, platform action, uploader contact, real-case work |
| Pre-flight (before any change) | `HEAD` = `4a1618dd40b19ba461828072fbd3f3576bdf89a3` on `feature/r14-validation-run-readback`, equal to its origin, worktree clean; `origin/main` = `c73cbdad1fe5d09813525930b4df9ed9123fd9de`; CI run 36249749190 on `4a1618d` success; the branch not merged; ADR-0006 PROPOSED; R14 not recorded as PASS |

Each finding was confirmed from the repository before it was changed, not from the audit's description:
- **AUD-001.** `captureCorrespondence` checks the raw and attachment sources with `assertSourcesUsable(…, { kind: 'Agency', agencyId })`: an Agency target has no case, subject or owner dimension, so a source restricted to Subject A is a valid capture. `bindCaseCorrespondence` checks only that the message belongs to the case's agency. `readContextRows` then read every source a selected message cites into the manifest and the closure, without evaluating it against the case.
- **AUD-003.** At `4a1618d`, `INTERNAL_IDENTIFIER_STRINGS` was `[PROMPT_TEMPLATE_VERSION, ARTIFACT_ALGORITHM, DEPENDENCY_DIGEST_ALGORITHM, TECHNICAL_RULESET_VERSION, CONTRACT_BASELINE, PFC_SCHEMA_VERSION]`. `CONTRACT_BASELINE` moved from `TB-SCHEMA-API-v1.2.0` (`c73cbda`) to v1.3.0 (`7972103`) while `TECHNICAL_RULESET_VERSION` stayed `TB-TECHNICAL-RULESET-v1`: a body naming TB-SCHEMA-API-v1.2.0 was found before and not after.
- **AUD-004.** In `ui-sandbox.ts` at `4a1618d`, the catch of the start sequence called `stop(1)`, and `stop` ran the cleanup (15 pointer UPDATEs, then DELETE FROM every sandbox table) unconditionally: after `assertEmpty` refused pre-existing rows, and on Ctrl+C or SIGTERM before that check.
- **AUD-008.** Active guidance named personal human adoption as the G6 gate in four places: `CLAUDE.md`'s P4G rule (the last item of its G1–G6 list), this record's rule summary (its G6 item) and §33 (the G1–G6 range of the proposed assessments), and the technical ruleset's header comment (the same list).

### 36.2 R14-AUD-001 — sources cited by a captured message, rechecked against the Case scope

**Root cause.** Capture-scope validity was used as production-case applicability. A capture is agency-level and reusable, and a binding checks only the agency, so nothing evaluated the sources a bound message cites against the case whose context lists them.

**Remediation** — at the current production applicability evaluation; the history is unchanged:
- `readContextRows` (`modules/production/context-snapshot.ts`) rechecks each source a selected message cites — its `rawSourceId`, then every `attachmentsManifest[*].sourceId` — against the case as the same REPEATABLE READ snapshot reads it: its agency, case scope, bound legal subject and owner (the case with its bound route, or the case without one).
- **The existing rules, read-only.** `applicabilityProblem` (`modules/sources/source-scope.ts`) is the read-only form of what `assertSourcesUsable` enforces at a write: `scopeProblem` (agency, case and subject dimensions), then `otherOwnerUsing` (the owner dimension) when the case has an owner. It makes plain reads in the caller's transaction: no FOR SHARE or FOR UPDATE, no write, no audit event, nothing read outside the snapshot. The technical validation's plan-source check now calls the same helper (the same two calls as before; behaviour unchanged).
- Each source is evaluated once per read; every citation of it is reported.
- Not done (mission §4): no capture, binding or source is edited; no source id is removed; nothing is copied per case; provenance and review state are unchanged; no "applicable" flag is stored on a binding; shared reuse stays possible.

**Representation — the existing `conflicts[]`, no wire change.** Each citation that does not apply is one conflict:

| Field | Value |
|---|---|
| `code` | `CORRESPONDENCE_SOURCE_NOT_APPLICABLE` |
| `message` | "Recorded source ‹source id›, the raw source of captured message ‹id› (or: the source of attachment observation ‹j› of captured message ‹id›), is not applicable to the current Case scope (‹reason›). The capture was checked against its agency only. The message and the source are kept as recorded; this is a source-scope condition, not a finding about what the source shows." |
| `fieldPath` | `correspondence[i].rawSourceId` or `correspondence[i].attachmentsManifest[j].sourceId` |
| reason | as the write refusals name it: `SOURCE_SCOPE_UNRESOLVED: SCOPED_TO_OTHER_SUBJECT`, `SOURCE_SCOPE_UNRESOLVED: CASE_SUBJECT_UNBOUND` (a case without a route: no subject is guessed), `CROSS_CASE_REFERENCE`, `CROSS_AGENCY_REFERENCE`, `CROSS_OWNER_REFERENCE` (no other owner named), or another `SOURCE_SCOPE_UNRESOLVED` reason of `scopeProblem` |

- **Traceability.** The source stays in `sources` exactly as recorded and in the dependency closure; the message stays exactly as captured. It is listed with the conflict, never as unqualified support.
- **Through the stack.** DRAFTING is not gated by it (a conflict is not a DRAFTING-blocking missing code; no new gate). A prompt freezes it in `conflicts` and PART 3 renders it (TB-PROMPT-TEMPLATE-v1 unchanged: PART 3 renders every recorded conflict). A technical validation evaluates the current context and reports it through `CONTEXT.CONFLICTS` (REVIEW_REQUIRED), so the run is not TECHNICAL_PASS while the condition remains. No P4G rule was added.
- **Digest completeness.** The recorded-scope reasons follow from records already in the closure (the source's scope bindings, the case, its route and association), so a change to them already changes the digest. The owner dimension depends on another owner's records outside the closure; their existence is added to the cited source's fingerprint as `otherOwnerMaterial: true`, present only then. Every other fingerprint, and every context without that condition, keeps its digest (§36.12, item 2).
- **Route and current scope** (mission §13). Applicability is derived from the case as each snapshot reads it. A first route binding may follow history, and the next read re-evaluates (its subject: no conflict; another subject: `SCOPED_TO_OTHER_SUBJECT`). A route replacement after history is 409 `BINDING_CORRECTION_REQUIRES_RECONCILIATION` (blockers `[CORRESPONDENCE_BINDING]`), so no other transition exists; the test proves both.
- **UI** (`apps/web/src/app/cases/production-context.tsx`). The conflict list names the new kind. Each flagged raw source and attachment observation carries the neutral tag "Not applicable to this case’s scope". The source manifest adds a "Case scope" row for flagged sources only: "Recorded source is not applicable to the current Case scope." (mission §42), with "The capture was checked against its agency only; see Recorded conflicts. The source is kept as recorded, and this says nothing about what it shows." The view derives nothing itself: it marks only what the context lists. No "invalid evidence", "unauthorized", "no authority", "infringement not proven" or gate wording appears.

**Tests** (mission §10–§14):

| Scenario | Test | Result |
|---|---|---|
| A — raw source restricted to Subject A, message bound to a Case routed to Subject B | DB `p4d-http` "raw source: …" — the capture stays valid; one conflict naming the source, the message and `SCOPED_TO_OTHER_SUBJECT`; the source listed as recorded and in the closure; the message unchanged; repeated reads identical and writing nothing; a direct link of the same source refused by the same rules (422 `SOURCE_SCOPE_UNRESOLVED`) | PASS |
| A — the same through an attachment observation | DB "attachment source: …" — the conflict at exactly attachment 2; an attachment without a source and an applicable one raise nothing | PASS |
| Valid shared reuse | DB "valid shared reuse …" — a source naming both subjects, an unrestricted agency source, and one message bound to two cases of different subjects (and owners): no conflict in either case | PASS |
| Unbound case | DB "a case without a route has no subject …" — `CASE_SUBJECT_UNBOUND`, no subject guessed (not even from the owner hint); an unrestricted source raises nothing | PASS |
| Route / current scope | DB "applicability is read from the case in each snapshot …" (above) | PASS |
| Owner isolation | DB "owner isolation: …" — once another owner's coverage cites the source, `CROSS_OWNER_REFERENCE` (no other owner named); exactly that source's fingerprint and the digest change, the revision does not | PASS |
| Through the stack | DB `p4g-http` "R14-AUD-001 — …" — context → prompt (its `conflicts`, PART 3's exact line, the source in its manifest) → validation: REVIEW_REQUIRED with exactly one issue, `CONTEXT.CONFLICTS`, 0 blockers, no rule not executed; read back unchanged; the same draft of a prompt whose raw source applies is TECHNICAL_PASS | PASS |
| Rules without a database | `source-rules` +5 (`applicabilityProblem`: recorded scope first, then the owner dimension, only the owner's plain reads, no lock or write), `production-context-rules` +3 (each citation to one conflict with its path and reason; the digest covers the owner condition exactly), `p4d.test.tsx` +1 (the tags, the Case scope row only where flagged, neutral wording) | PASS |

### 36.3 R14-AUD-003 — TB-TECHNICAL-RULESET-v2 with a pinned marker vocabulary

**Root cause.** `MARKER.INTERNAL_IDENTIFIERS` built part of its vocabulary from constants that follow the active release (`CONTRACT_BASELINE` among them), so a wire release changed what the rule detected under the same ruleset identifier.

**Remediation** (`modules/validation/technical-ruleset.ts`):
- New validations record **`TB-TECHNICAL-RULESET-v2`**: v1's 29 rules, kinds, severities, order and aggregation unchanged; `MARKER.INTERNAL_IDENTIFIERS` stays the same conceptual check.
- **The pinned vocabulary**, written out in the ruleset (`INTERNAL_IDENTIFIER_STRINGS`): `TB-PROMPT-TEMPLATE-v1`, `TB-CANDIDATE-ARTIFACT-v1`, `TB-PRODUCTION-CONTEXT-DIGEST-v1`, `TB-TECHNICAL-RULESET-v1`, `TB-TECHNICAL-RULESET-v2`, `TB-SCHEMA-API-v1.2.0`, `TB-SCHEMA-API-v1.3.0`, `PFC-YT-EMAIL-v1.1`. Derived from the pre-v1.3 behaviour: the six strings v1 detected with `CONTRACT_BASELINE` = v1.2.0 (main `c73cbda`), plus the v1.3.0 release and v2's own identifier. The other parts of the rule (record ids of the evaluated context, the candidate's and prompt's ids, the prompt SHA-256, digests and fingerprints, internal state codes) are unchanged.
- No rule reads `CONTRACT_BASELINE` or another value that follows the active release: the identifier alone reproduces the vocabulary. A future release (TB-SCHEMA-API-v1.4.0) does not change v2; an identifier the application starts to use makes a unit test fail, and a new ruleset version is then needed (mission §18).
- The web page's displayed ruleset and `smoke:p4g` name v2.

**History and compatibility.** Every run recorded as `TB-TECHNICAL-RULESET-v1` stays exactly as stored: `getValidationRun`, `listValidationRuns` and an idempotent replay return it as v1, and nothing is relabelled, re-executed or rewritten. A present-day evaluation is a new run under v2. `rulesetVersion` is the existing free string of the unchanged `ValidationRun`: no wire, schema or migration change.

**ADR-0006 revised before acceptance** (status stays **PROPOSED**): §4 and §5 no longer call v1 unchanged; new §8 records the finding, the decision, the vocabulary, the history rule, that the ruleset change is not a wire release and creates no legal or policy certification, and the three separate identifiers (wire release TB-SCHEMA-API-v1.3.0, technical ruleset of new validations TB-TECHNICAL-RULESET-v2, production form PFC-YT-EMAIL-v1.1, unchanged); an alternative "keep v1 and pin it" is recorded as rejected. The v1.3.0 README is qualified the same way. `amendment.json` is unchanged: sha256 `6b74c09aba024dcf8cb2e0a0c6e374bbce17b45298d2aec83cc2e3ab166a1630`.

**Release coupling and version-only drift** (mission §24, §48). `CONTRACT_BASELINE` stays in the P4D dependency digest: a contract release still gives a new digest, and nothing reuses or restores an old one. A v1.2-era prompt snapshot evaluated under the v1.3 current context can therefore produce one `CONTEXT.PROMPT_DRIFT` REVIEW_REQUIRED issue (change `IDENTIFIERS`) when the recorded context differs only by version identifiers. **REVIEW_REQUIRED is not a mandatory re-draft**: by itself it does not mean that the candidate's content is wrong, that it must be redrafted, or that owner facts, authority or rights changed. Whether unchanged bytes may continue is for a future authorized review or rebinding policy; none is implemented. (ADR-0006, Consequences; §35.12 item 2 corrected accordingly.)

**Tests** (mission §20–§21):

| Requirement | Test | Result |
|---|---|---|
| golden: TB-SCHEMA-API-v1.2.0 found | `validation-rules` "golden: TB-SCHEMA-API-v1.2.0 and TB-SCHEMA-API-v1.3.0 — and every other pinned identifier …" (exact finding, position, body and subject) | PASS |
| golden: TB-SCHEMA-API-v1.3.0 found | the same test | PASS |
| golden: lookalikes not found | "golden: lookalikes …" — v1.4.0, v1.1.0, v1.0.0, other letter case, a space, a prefix, `TB-TECHNICAL-RULESET-v3`, `PFC-YT-EMAIL-v1.2` | PASS |
| the vocabulary is pinned, not derived | "the vocabulary is exactly the pinned list …" (the list, its literal declaration, no active-release constant in the ruleset's code) and "a later identifier needs a new ruleset version …" | PASS |
| unchanged under a changed contract constant | `validation-ruleset-identity.test.ts` (new): `@tb/contracts`' `CONTRACT_BASELINE` replaced by `TB-SCHEMA-API-v9.9.9-SYNTHETIC` for that module graph; the rule still finds v1.2.0 and v1.3.0 and not the synthetic or a later release — no production constant changed at run time | PASS |
| new run records v2 (and its audit event) | DB `p4g-http` "R14-AUD-003: …" and every P4G DB test's `rulesetVersion` | PASS |
| a stored v1 run reads, lists and replays as v1 | the same DB test (a v1 row set directly in `tb_notice_test`); web `p4g.test.tsx` "R14-AUD-003: a run recorded under TB-TECHNICAL-RULESET-v1 opens exactly as recorded …" | PASS |
| no current run relabelled without executing | the same DB test: the replay adds no run; a new validation is a new v2 run | PASS |
| prompt drift unchanged | the existing `CONTEXT.PROMPT_DRIFT` unit and DB tests | PASS |

### 36.4 R14-AUD-004 — ui:sandbox cleanup disarmed until the empty start is verified

**Root cause.** The teardown did not know whether this run owned the rows: every exit path ran the cleanup, including a refused empty-start check.

**Remediation.** The ownership lifecycle lives in `scripts/local/sandbox-lifecycle.ts`; `ui-sandbox.ts` uses it for every exit path.
- The cleanup is **disarmed by default**. `claimEmptyStart()` arms it only after this run has itself verified that its connection is on `tb_notice_test` and that every sandbox table is empty — and never once a stop has begun (a signal during the check leaves it disarmed).
- One `stop()` for every exit path (signal, start-up error, refused guard), once: it closes what this process opened (the web child, the API, its own pool). Only when armed does it run the cleanup and the empty check after it; otherwise it logs "cleanup not armed: this run never verified an empty tb_notice_test, so no row was updated or deleted".
- The earlier guards (the target allowlist, ports, the build) fail before any database statement, as before. The target allowlist, the dev database and the migration tooling are unchanged (mission §29).

**Tests** (`tests/tooling/ui-sandbox-lifecycle.test.ts`, new, 8; a stand-in connection, no database):

| Mission §28 | Test | Result |
|---|---|---|
| 1 pre-existing row → refused, 0 cleanup SQL | "a row that was already in tb_notice_test refuses the start …": 0 UPDATE/DELETE, the rows stay, events stop → close own resources → not armed → disconnect → exit 1; also another schema: only `SELECT DATABASE()` | PASS |
| 2 signal/error before a successful check → 0 cleanup SQL | "Ctrl+C or SIGTERM before the empty-start check …": no statement at all; "a signal while the empty-start check is still running …": stays disarmed | PASS |
| 3 empty start → armed → expected cleanup | "an empty start arms the cleanup …": exactly the 15 pointer clears and 31 FK-ordered deletes, then the empty check; a signal after arming runs it once; a failed cleanup exits 1 | PASS |
| the script uses only the lifecycle | "the script cleans up only through the lifecycle …" (static) | PASS |

Supplemental disposable-database check (not the primary proof; `evidence/r14-astra-sandbox-refusal-check.txt`): on `2117fba`, one disabled, non-credential synthetic user row in `tb_notice_test`; `yarn ui:sandbox` then printed "FAIL tb_notice_test is not empty before start (users=1); refusing", "stopping…" and "cleanup not armed: this run never verified an empty tb_notice_test, so no row was updated or deleted", and exited 1 without writing a password file; the row read back unchanged and was then removed by the check itself (`db:verify test --expect-empty` PASS). The browser session afterwards (§36.9) was a run that verified its empty start: its teardown deleted every sandbox row.

### 36.5 R14-AUD-008 — G6/G7 terminology

- **Permanent terminology** (now in `CLAUDE.md`): G1 authority/standing · G2 work-specific rights · G3 reported-material identification · G4 evidence/audiovisual comparison · G5 permission/copyright exceptions · G6 exact candidate artifact consistency, traceability and whole-artifact QA (supported prose and material NMI asks where applicable) · G7 the actual authorized human review, adoption, signature and sending act, outside the application. AI cannot satisfy G7; personal adoption is G7, never G6.
- **Corrected:** `CLAUDE.md` (the P4G persistent rule, and the terminology line); this record's rule summary and §33, each with a dated correction note keeping what was first recorded; the header of `technical-ruleset.ts`. A search of the active documentation for G6, G7, human adoption, adoption, signature, exact artifact and traceability found no other misassignment; the production form contract already uses the correct terms (§10 "G6 exact artifact/traceability QA"). Legitimate statements (G6 needs human semantic QA of the artifact; G7 needs personal adoption and signature; a signer identity may appear while the signature stays pending) are unchanged. `docs/reference/**` is untouched.
- **Guard:** `tests/tooling/gate-terminology.test.ts` (new, 3) scans `CLAUDE.md`, `docs/**/*.md` (not `docs/reference` or evidence logs) and the app sources for the known misassignments, and proves its patterns match them and not the correct wording.

### 36.6 Backlog and future prerequisites (recorded, not implemented)

| Finding | Disposition | Unchanged here |
|---|---|---|
| R14-AUD-002 — a candidate import/revision replay after supersession returns the current lifecycle overlay, not the exact original response | **OPEN_BACKLOG** | WriteExecutor replay semantics, candidate replay storage, supersession, response snapshots |
| R14-AUD-007 — the validation-history UI stops after about 1,000 runs | **OPEN_BACKLOG** | "Load older", history pagination, exact-run search, `PICKER_PAGES` / `allPages` |
| R14-AUD-005 — a future plan-source freshness policy | **FUTURE_ASSESSMENT_PREREQUISITE** | no `planSourcesFingerprint`, ValidationRun schema or closure change; no assessment freshness design |
| R14-AUD-006 — a future AssessmentSource read-back | **FUTURE_ASSESSMENT_PREREQUISITE** | no assessment route, AssessmentSource read or TB-SCHEMA-API-v1.4.0 |

`captureCandidateAssessment` and `listCandidateAssessments` stay unrouted (the routed-inventory DB test lists 134 business operations and none of them; `smoke:p4f` and `smoke:p4g` probe the later phases as unavailable).

### 36.7 Tests and totals

| Suite | Change | Covers |
|---|---|---|
| `tests/api/source-rules.test.ts` | +5 | `applicabilityProblem`: the recorded scope first (a subject-scoped agency source a capture accepts does not apply to a case of another subject; no read needed), `CASE_SUBJECT_UNBOUND` for a case without a route, shared reuse (both subjects named, or none), owner isolation (`CROSS_OWNER_REFERENCE`), and only the owner dimension's plain reads (no lock or write) |
| `tests/api/production-context-rules.test.ts` | +3 | each citation the snapshot found is one conflict (raw source and attachment observation, with path and reason); a clean citation raises nothing; the digest covers the owner condition exactly and nothing else |
| `tests/web/p4d.test.tsx` | +1 | the tags beside the flagged raw source and attachment observation, the "Case scope" row only for flagged manifest entries, the neutral wording and no verdict wording |
| `tests/db/p4d-http.test.ts` | +6 | §36.2 scenarios: raw source, attachment source, valid shared reuse, unbound case, route and current scope, owner isolation |
| `tests/db/p4g-http.test.ts` | +2; v2 pins | the AUD-001 context → prompt → validation proof with its applicable contrast; the AUD-003 v2 / historical v1 test; every other P4G expectation names `TB-TECHNICAL-RULESET-v2` |
| `tests/api/validation-rules.test.ts` | +4; v2 pins | the pinned vocabulary, the golden findings (v1.2.0, v1.3.0, every identifier, body and subject), the lookalikes, the "new identifier needs a new ruleset" tripwire |
| `tests/api/validation-ruleset-identity.test.ts` | +2 (new) | the same findings under a synthetic later `CONTRACT_BASELINE` for the test's module graph |
| `tests/web/p4g.test.tsx`, `tests/web/support.tsx` | +1; v2 pins | a run recorded as v1 opens exactly as recorded while the panel names v2; the fake server records v2 |
| `tests/tooling/ui-sandbox-lifecycle.test.ts` | +8 (new) | §36.4 |
| `tests/tooling/gate-terminology.test.ts` | +3 (new) | §36.5 |
| `scripts/local/p4g-smoke.ts` (CI) | v2 pins (94 checks, unchanged count) | a new run records `TB-TECHNICAL-RULESET-v2` |

Totals: `yarn test` **1559** in 52 files (R14 remediation: 1532 in 49); `yarn test:db` **534** in 14 files (526) — home PC and CI identical. Each of the three code commits was also verified on its own before the push: typecheck, lint (0 warnings), format and `yarn test` (1541 in 49, 1548 in 50, 1556 in 51 files), plus the DB suites it touched (`p4d` and `p4g` 81 on `d75b7d6`; `p4g` 34 on `9a528bc`) — the appendix of `evidence/r14-astra-first-pc-sweep.txt`.

### 36.8 Commits

| Commit | Content | CI |
|---|---|---|
| `d75b7d6` | fix(production): the cited correspondence sources rechecked against the case (`source-scope.ts` `applicabilityProblem`, `context-snapshot.ts`, `context-assembly.ts`, `context-dependencies.ts`; the plan-source check uses the same helper); the context page's marking; unit, web and DB tests (R14-AUD-001) | (pushed with `2117fba`) |
| `9a528bc` | fix(validation): `TB-TECHNICAL-RULESET-v2` with the pinned vocabulary; the page's ruleset constant and `smoke:p4g`; golden, identity, DB and web tests; ADR-0006 revised (PROPOSED) and the v1.3.0 README qualified (R14-AUD-003) | (pushed with `2117fba`) |
| `2f5ec24` | fix(tooling): the sandbox ownership lifecycle (`scripts/local/sandbox-lifecycle.ts`, `ui-sandbox.ts`) and its stand-in-connection test (R14-AUD-004) | (pushed with `2117fba`) |
| `2117fba` | docs(gates): the G6/G7 terminology (`CLAUDE.md`, this record, the ruleset header), the guard test, the Astra backlog in `CURRENT_STATE.md` (R14-AUD-008) — the code head | push run 36290145394 success |
| (this record) | docs(r14): §36, the evidence `r14-astra-*` and screenshots, `CLAUDE.md`, `CURRENT_STATE.md`, the v1.3.0 README pointer (documentation only) | reported with the remediation report |

Nothing was amended, rebased, rewritten or force-pushed; no branch, tag, release or pull request was created. The branch moved `4a1618d..2117fba` by a normal push, and `origin/main` stays `c73cbda`.

### 36.9 Browser verification (Playwright MCP)

**14/14 PASS, no finding** (`evidence/r14-astra-playwright-mcp-verification.txt`; screenshots `evidence/screenshots/r14-astra-*`). Run only after the AUD-004 fix and its tests (mission §41). Target: `yarn ui:sandbox` built from `2117fba` on the disposable `tb_notice_test`, an isolated headless browser, synthetic data only.
- **The AUD-001 effect.** Same agency; Case B routed to Subject B; message N1 (raw source restricted to Subject A) and message S1 (attachment observations: shared A+B, Subject A only, unrestricted) bound to it and selected explicitly. The context lists "Recorded conflicts (2)" with the neutral messages; the tag appears beside N1's raw source and S1's attachment 1 only, and the "Case scope" row on those two manifest entries only; DRAFTING is delivered; no verdict wording.
- **Valid shared source.** Case A (Subject A), bound to the same N1: "Recorded conflicts (0)", no tag.
- **Through the stack.** The prompt snapshot shows the two conflicts and renders them in PART 3. The technical validation run on the candidate is REVIEW_REQUIRED (0 blockers; `CONTEXT.CONFLICTS` twice and one `CONTEXT.MISSING` from the operator-reported prior), with the permanent qualifier and `TB-TECHNICAL-RULESET-v2`.
- **History, actions, layout, keyboard.** After a reload, "Open run" reads the run from the server and shows it exactly as recorded. No assessment, readiness, approval, signing, sending or export action appears; `GET …/assessments` and `…/readiness` are 404. At 390 px the page does not scroll sideways and the tags fit. Enter on "Show context" and on "Open run" moves focus to the outcome.
- **Writes and cleanup.** Reads change nothing: the messages, bindings, sources, cases, prompt and candidate have identical fingerprints, and the run added one run, three issues, one audit event and one idempotency record. Sign-out gives 401. The owned teardown deleted every row: `db:verify test --expect-empty` PASS.

### 36.10 Negative controls

**18/18 caught and restored byte-identically** (`evidence/r14-astra-negative-controls.txt`), on `2117fba`, 2026-09-27T03:03Z–03:22Z: 28 responsible commands, every one failing with an AssertionError as its first failure; the working-tree fingerprint identical before and after; `tb_notice_test` empty afterwards. The unmutated baseline passed 22/22 distinct commands, each selecting at least one test (a first baseline attempt caught a harness filter that selected nothing — a regular-expression `+` — before any mutation; the filter was fixed in the scratchpad harness, no product or test change).

| Mission §40 | Control | Responsible tests |
|---|---|---|
| raw-source Case applicability disabled | NC-ASTRA-001-A | DB "raw source: …"; DB "R14-AUD-001 — …" (the stack) |
| attachment-source Case applicability disabled | NC-ASTRA-001-B | DB "attachment source: …"; DB "a case without a route …" |
| subject mismatch disabled | NC-ASTRA-001-C | unit "a subject-scoped agency source a capture accepts …"; DB "raw source: …" |
| valid shared reuse broken | NC-ASTRA-001-D | unit "shared reuse stays valid …"; DB "valid shared reuse …" |
| marker vocabulary from `CONTRACT_BASELINE` again | NC-ASTRA-003-A | unit "golden: …"; `validation-ruleset-identity.test.ts` |
| new behaviour labelled `TB-TECHNICAL-RULESET-v1` | NC-ASTRA-003-B | unit "is one identifier with a pinned inventory …"; DB "R14-AUD-003: …" |
| cleanup armed before the empty check succeeded | NC-ASTRA-004-A | tooling "a row that was already in tb_notice_test …" |
| a signal before ownership triggers the cleanup | NC-ASTRA-004-B | tooling "Ctrl+C or SIGTERM before the empty-start check …" |
| the misassignment of human adoption to G6 restored in active guidance | NC-ASTRA-008 | tooling "no active document or source assigns …" |
| also (mission §14 and further) | NC-ASTRA-001-E (owner dimension skipped), -F (another owner's use left out of the fingerprint), -G (the conflict dropped from the context), -H (evaluated at the capture scope, target Agency), -I (the UI marking not rendered), -J (the unbound-Case check disabled); NC-ASTRA-003-C (a v1 run relabelled on read), -D (TB-SCHEMA-API-v1.2.0 dropped from the vocabulary); NC-ASTRA-004-C (the script bypasses the lifecycle) | |

### 36.11 Regression sweep and CI

**Sweep** (mission §43): 2026-09-27T03:12:40Z–03:21:10Z on `2117fba`, after the targeted tests, the negative controls and the browser session. All 21 steps exit 0 (`evidence/r14-astra-first-pc-sweep.txt`).

| Command | Result |
|---|---|
| `yarn reference:check` (before and after) | frozen references intact (`MANIFEST.sha256` `42c2a419…` matches the pin) |
| `yarn reference:helper-tests` | 27 pass, 0 fail |
| `yarn contracts:check` | 3 generated outputs match the active source |
| `yarn install --immutable` | lockfile unchanged (pre-existing YN0086 note) |
| `yarn typecheck` · `yarn format:check` | exit 0 |
| `yarn lint` · `oxlint --deny-warnings --format default` | exit 0 · exit 0 — **0 warnings** ("Found 0 warnings and 0 errors." on 329 files) |
| `yarn test` | 1559 / 1559 in 52 files |
| `yarn test:db` | 534 / 534 in 14 files (`tb_notice_test`) |
| `yarn db:verify test --expect-empty` (before and after) | PASS, domain rows 0 |
| `yarn db:verify dev` | PASS (metadata and a row count only: 5, unchanged — nothing written to `tb_notice_dev`) |
| `yarn db:status test` / `dev` | up to date (1 migration) |
| `yarn db:drift:diff-migrations` / `db:drift:diff-datasource dev` | empty migration (no drift) |
| `yarn build` | exit 0, no chunk-size advisory (entry 329.93 kB; production-context chunk 32.87 kB, +1.54 kB; candidates 56.82 kB) |
| `yarn smoke:local` | 62 checks |
| `yarn dev:verify-shutdown` | 4 / 4 scenarios |

`smoke:auth`, `smoke:directory`, `smoke:p3a`, `smoke:p3b` and `smoke:p4a`–`smoke:p4g` write records and run only in CI; all are kept and pass there. `yarn test:transition-baseline` is not a gate and was not run.

**CI** (`evidence/r14-astra-ci-run-36290145394.txt`). Code head `2117fba`: push run [36290145394](https://github.com/TuongChris/tb-notice-production-system/actions/runs/36290145394) (2026-09-27T03:00:23Z–03:08:56Z), **success**, both jobs:
- "Non-DB checks (cold install)" (job 108538535068): the reference check and the 27 helper tests, `contracts:check`, lint "Found 0 warnings and 0 errors.", format, `yarn test` 1559 / 52 files, build, the frozen references and the working tree unchanged.
- "Database, seed and smoke (MySQL 8.4.11)" (job 108538534929): migration and metadata verification on test, replay and dev; `yarn test:db` 534 / 14 files; the seed twice with the canonical digest unchanged; both drift diffs empty; `smoke:local` 62; `smoke:auth` 4; `smoke:directory` 14; `smoke:p3a` 24; `smoke:p3b` 36; `smoke:p4a` 50; `smoke:p4b` 64; `smoke:p4c` 62; `smoke:p4d` 87; `smoke:p4e` 84; `smoke:p4f` 90; `smoke:p4g` 94 (a new run records `TB-TECHNICAL-RULESET-v2`); the P1.1 recovery commands; `yarn dev` clean shutdown 4 / 4.

The CI smokes cite only agency sources without a subject restriction in their captured messages, so none raises the new conflict and no smoke expectation changed. The documentation head's run is reported with the remediation report.

### 36.12 Schema, contract and dependencies

- **No migration, no Prisma schema change.** `20260923103912_initial_schema` is still the only migration; both drift diffs are empty.
- **No wire change.** TB-SCHEMA-API-v1.3.0 is unchanged: 289 schemas, 144 operations, 99 paths, `info.version` 1.3.0; `amendment.json` sha256 `6b74c09aba024dcf8cb2e0a0c6e374bbce17b45298d2aec83cc2e3ab166a1630`; `contracts:check` passes. The new conflict is a value of the existing free-string `code` in the existing `conflicts[]`.
- **Nothing else outside the change.** `git diff 4a1618d..2117fba` (29 files) touches nothing under `packages/`, `apps/api/prisma`, `docs/reference`, `docs/contracts/TB-SCHEMA-API-v1.1.0` or `-v1.2.0`, the v1.3.0 `amendment.json`, ADR-0004, ADR-0005, `yarn.lock`, `.yarnrc.yml`, `.nvmrc` or any `package.json`. No dependency was added. The target allowlist, the dev database and the migration tooling are unchanged.

### 36.13 Warnings and open items for the operator (not decided here)

1. **The dependency fingerprint of a cited source gains one conditional key** (§36.2). When another owner's records use a source a selected message cites, that source's fingerprint includes `otherOwnerMaterial: true`, so the digest changes when that condition arises. This is a narrow extension of what TB-PRODUCTION-CONTEXT-DIGEST-v1 fingerprints, following the design's rule that the existence of a later record changing a pinned record's meaning is fingerprinted. Contexts without the condition keep their digests; a new digest identifier would have changed every digest. The operator's confirmation is asked.
2. **Recorded-scope conflicts are derived, not fingerprinted.** They follow from records the closure already covers, so an unchanged context keeps its digest across this rule change while its next read lists the conflict. A prompt or validation after the change records or reports it; a page opened before the change shows it after a new read.
3. **Observation for the continued audit — not classified, not changed.** A mandate version's sources (primary, additional and signed-date sources) and whole-mandate event sources are checked in the mandate's agency context (P3B, accepted at R7), much like a capture. A pinned selection then brings them into a case's context without a case-scope recheck. Whether a subject-restricted authority source should raise the same kind of conflict is outside this mission's scope (AUD-001 names correspondence). It is left to the Astra audit, with no inference either way.
4. **Document-plan offers.** The candidate import page offers the prompt's source manifest (R13 decision 9), which can now include a correspondence source that does not apply to the case. `importCandidate` refuses such a plan entry with the source-scope reason, shown at its field. Pre-existing behaviour, not changed.
5. **ADR-0006** stays PROPOSED (revised, §8); its acceptance and TB-SCHEMA-API-v1.3.0's belong to the operator's review.
6. **Evidence limitations:**
   - the stored v1 run of the AUD-003 DB and web tests is set directly in `tb_notice_test` or the fake server (data the application no longer writes);
   - the supplemental AUD-004 check inserted one synthetic row directly;
   - the browser scenario was seeded through the compiled API.
7. **Pre-existing, non-blocking:** the YN0086 peer-dependency note; `yarn test:transition-baseline` fails by design (not run, not a gate).

### 36.14 Status (maximum claim of this mission)

| Scope | Status |
|---|---|
| `ASTRA_AUDIT` | **PARTIAL** — continues from its saved checkpoint |
| R14-AUD-001 · -003 · -004 · -008 | **REMEDIATED_PENDING_INDEPENDENT_REVIEW** each |
| R14-AUD-002 · -007 | **OPEN_BACKLOG** (unchanged) |
| R14-AUD-005 · -006 | **FUTURE_ASSESSMENT_PREREQUISITE** (unchanged) |
| R14 | **HOLD_FOR_REVIEW** — not PASS |
| ADR-0006 / TB-SCHEMA-API-v1.3.0 | **PROPOSED** (revised before acceptance; active on the remediation branch, `main` carries v1.2.0) |
| P4G | **MERGED_TO_MAIN_FOR_IMPLEMENTED_SCOPE** (`c73cbda`); not VERIFIED_COMPLETE |
| CandidateAssessment and later phases | **NOT_STARTED** / HOLD |
| External action | **NONE** |
| Database / wire contract / dependencies | **No change** |

## 37. Astra audit remediation — R14-AUD-009 and -010 (2026-09-27, home PC)

Mission TB_R14_ASTRA_REMAINING_BLOCKER_REMEDIATION (operator, 2026-09-27), on `feature/r14-validation-run-readback`. Primary source: the operator's independent Astra audit continued at the §36 documentation head `fdcda2b` (deliverables `TB_ASTRA_R14_CONTINUATION_fdcda2b` and `TB_ASTRA_R14_CRITICAL_COVERAGE_fdcda2b`). That audit classified R14-AUD-001, -003, -004 and -008 as **CLOSED_VERIFIED_WITH_LIMITS** and established two further blockers of R14 final and of assessment implementation: R14-AUD-009 and R14-AUD-010 (both CONFIRMED_DEFECT / HIGH). It reported bounded critical coverage (runtime API, Prisma schema and contracts 100 %, the web source except CSS 100 %, critical tests 65.47 %, the whole critical denominator 70.85 %); `ASTRA_AUDIT` stays **PARTIAL**. Sections 1–36 keep the state at their time. §36.13 item 3 recorded the AUD-009 observation for the audit; this section resolves it.

### 37.1 Scope, pre-flight and independent confirmation

| Item | Value |
|---|---|
| Authorized | exactly R14-AUD-009 and R14-AUD-010 |
| Kept as closed (not reopened) | R14-AUD-001, -003, -004, -008 **CLOSED_VERIFIED_WITH_LIMITS** — regression re-run (§37.6) |
| Recorded only, unchanged | R14-AUD-002, -007 **OPEN_BACKLOG**; R14-AUD-011 (source-revision timestamp precision in the UI), -012 (Owner picker retained hidden selection) **NON_BLOCKING_BACKLOG**; R14-AUD-005, -006 **FUTURE_ASSESSMENT_PREREQUISITE** |
| Not done (not authorized) | CandidateAssessment, AssessmentSource read, G1–G6 forms, readiness, READY_FOR_SIGNER, unsigned export, G7, signature, sending, email, Drive, uploader contact, platform action, real-case data |
| Pre-flight (before any change) | `HEAD` = `fdcda2bc47e2c033b4f6314d6e487b19b0b294cb`, equal to its origin, worktree clean; `origin/main` = `c73cbdad1fe5d09813525930b4df9ed9123fd9de`; no pull request of the branch; CI run 36291505391 on `fdcda2b` success, both jobs; ADR-0006 PROPOSED; R14 not PASS; assessment routes unrouted |

Both findings were confirmed from the source before any change, not from the audit's description:
- **AUD-009.** `versionSourceUses` (`authority-rules.ts`) lists a version's primary, additional and signed-date sources; `assertTermsSources` (`mandate-versions.service.ts`) checks them with `assertSourcesUsable(…, { kind: 'Agency', agencyId })`, at create, patch and freeze. `recordAuthorityEvent` keeps the Agency target when `coverageId` is null and uses the coverage's route only for a coverage-scoped event. An Agency target has no subject, case or owner dimension. `readContextRows` then read every one of these sources into the manifest and the closure (`authoritySourceIds`), and only the correspondence citations were evaluated against the case (`correspondenceSourceScope`).
- **AUD-010.** `linkCaseSource`, the case's canonical binding (`CanonicalBindingCase`), the packet source of `patchCase`, mapping bases and a selection's basis check the source against the case, including the owner dimension, when written. None of those records is owner material: `otherOwnerUsing` looks only at an owner's canonical source, OwnerSubject sources, route canonical sources, coverage bases, coverage signer sources and coverage-scoped event sources. So another owner's later coverage citing a case-linked source passes its own route check. The source then stops applying to the first case (`CROSS_OWNER_REFERENCE`), but its context did not re-evaluate it, and its fingerprint marked another owner's use only for a source a message cites (`otherOwnerMaterial`, R14-AUD-001). The digest, the revision and `generatePrompt`'s expectations stayed unchanged.

### 37.2 Root cause and remediation

**Root cause (common to both).** Valid when recorded was used as applicable to this case now, for every citation except a captured message's. A citation is checked against its own record's target when that record is written — an agency, a route or the case — and the case's production context listed the cited sources without checking them against the case as it is when read.

**Remediation — one evaluation for every listed source** (`apps/api/src/modules/production/context-sources.ts`, new):
- `sourceCitations(rows)`, a pure collector, names every citation of a source by a record of the context: `sourceId`, the kind, the citing record (`parentEntityType`, `parentEntityId`), the field (`fieldPath`) and the citation in words. The kinds, in their fixed order: `CASE_CANONICAL`, `CASE_PACKET`, `CASE_SOURCE`, `FACT_SUPPORT`, `MAPPING_BASIS`, `SELECTION_BASIS`, `MANDATE_VERSION_PRIMARY`, `MANDATE_VERSION_ADDITIONAL`, `MANDATE_VERSION_SIGNED_DATE`, `COVERAGE_BASIS`, `COVERAGE_SIGNER`, `MANDATE_EVENT` (whole-mandate), `COVERAGE_EVENT`, `CORRESPONDENCE_RAW`, `CORRESPONDENCE_ATTACHMENT`.
- `readContextRows` reads **exactly the cited sources**: the source ids are derived from the citations (the same set as before — no source is added to or dropped from any manifest). So every listed source has a citation, and none is listed without being evaluated. Unrelated registry sources and scalar directory source ids that the context does not list (an agency's, owner's, subject's, route's, signer's or mandate's canonical source) are not read.
- `currentSourceApplicability` evaluates every listed source **once per read**, in the read's REPEATABLE READ snapshot, with the existing `applicabilityProblem` (`source-scope.ts`: `scopeProblem`, then `otherOwnerUsing` when the case has an owner — the read-only form of `assertSourcesUsable`; plain reads, no lock, write, audit or idempotency record). The target is the case as the snapshot reads it — its agency, case id, and, through its bound route, owner and legal subject; without a route, a subject-scoped source is `CASE_SUBJECT_UNBOUND` and no subject is guessed. The existing source-scope rules stay the single source of truth; no parallel rule was written.
- `ContextRows` replaces `correspondenceSourceProblems` with `sourceCitations` and `sourceApplicability` (one result per listed source, null when it applies). The fingerprint and the assembly refuse a listed source without an evaluation (an internal error, never a clean listing).
- Not done (mission §8, §13, §26): no MandateVersion, AuthorityEvent, CaseSource, FactSource, UseMapping, selection, capture, binding, source revision, prompt, candidate or run is edited; nothing is stored as "applicable"; multi-route mandates and shared reuse stay possible; the write rules are unchanged, and no later write is refused to prevent the drift.

**Representation — the existing `conflicts[]`, no wire change.**

| Citation | Code | Granularity | `fieldPath` |
|---|---|---|---|
| a selected message's raw or attachment source (R14-AUD-001, unchanged) | `CORRESPONDENCE_SOURCE_NOT_APPLICABLE` | one per citation, the exact R14-AUD-001 message | `correspondence[i].rawSourceId` / `correspondence[i].attachmentsManifest[j].sourceId` |
| every other citation (R14-AUD-009, -010) | **`SOURCE_NOT_APPLICABLE`** | one per source, naming each other citing record | the source's manifest entry: `sources[i]` or `policySources[i]` (`sources` / `policySources` when its text is too long to be listed) |

The `SOURCE_NOT_APPLICABLE` message: "Recorded source ‹id› is not applicable to the current Case scope (‹reason›). This context cites it as ‹citations›. The citing records and the source are kept as recorded; this is a source-scope condition, not a finding about what the source shows or about any authority, right or gate." The reason is named as the write refusals name it (`SOURCE_SCOPE_UNRESOLVED: SCOPED_TO_OTHER_SUBJECT`, `… CASE_SUBJECT_UNBOUND`, `CROSS_CASE_REFERENCE`, `CROSS_AGENCY_REFERENCE`, `CROSS_OWNER_REFERENCE`), and no other owner's id appears. The citations are named in words (for example "the primary source of mandate version ‹id›", "additional source 0 of mandate version ‹id›", "the source of whole-mandate authority event ‹id›", "case source link ‹id› (‹role›)", "a recorded support of fact ‹id› (through case source link ‹id›)", "the basis source of use mapping ‹id›", "the basis source of authority selection ‹id›").

- **Each citation is reported exactly once.** A source a message cites keeps its per-citation R14-AUD-001 conflicts; its other citing records are named in one `SOURCE_NOT_APPLICABLE`. A source only a message cites raises no `SOURCE_NOT_APPLICABLE` (R14-AUD-001 exactly).
- **Deterministic and bounded.** Conflicts are emitted in manifest order; the citations of one source are sorted by kind, citing record and field, the same words once, at most 20 named and the rest counted ("; and ‹n› more citations"); one source cited hundreds of times is one conflict (`MissingItem.message` ≤ 8000 characters; `conflicts` ≤ 1000, never cut). Reversing every row array gives the same conflicts and digest (unit test).
- **Traceability.** Every listed source stays in `sources` or `policySources` exactly as recorded and in the dependency closure; its provenance and review state are unchanged. The authority block stays exactly the chain the selection pinned.
- **Authority and facts semantics** (mission §28–§29). A conflict inside the selected authority chain means only that a source a selected record cites does not apply to this case's scope under the recorded source-scope rules. It is not G1 FAIL, not an invalid mandate, coverage or signer, not unauthorized. A conflict on a case source changes no fact, provenance, rights, permission, comparison or exception record. No currentness or adjudication logic was added.
- **Through the stack.** No DRAFTING gate (a conflict is not a blocking missing code). A prompt freezes it in `conflicts` and PART 3 renders it (TB-PROMPT-TEMPLATE-v1 unchanged). A technical validation reports it through the existing `CONTEXT.CONFLICTS` (REVIEW_REQUIRED): a run is never TECHNICAL_PASS while it remains. No P4G rule was added or changed, so `TB-TECHNICAL-RULESET-v2` is unchanged (a new conflict code of the context is data the existing rule reports).

**Dependency digest** (mission §23–§25). The fingerprint closure determines each listed source's current applicability result:
- the recorded-scope part follows from records already in the closure — the source revision (its agency and scope bindings), the case (id, agency, route), its route and association (owner, legal subject);
- the owner part is the only input outside the closure: when another owner's records use a listed source, `otherOwnerMaterial: true` joins **that source's** fingerprint — whichever record of the context cites it, no longer only a message (generalizing R14-AUD-001). The key is present only then; no other fingerprint changes.

So any change in whether a listed source applies changes the digest, even when the source row, its head and the case's `contextRevision` are unchanged: `null → CROSS_OWNER_REFERENCE` on a case-only citation now changes the digest, and a prompt or validation against the earlier digest is 412 `CONTEXT_CHANGED`. The marker is a boolean — the same whichever other owner is found — so the digest does not depend on query order, and no other owner's identity enters this case's context. Contexts without the condition keep their digests, and R14-AUD-001's fingerprints are unchanged (the same key on the same sources). `TB-PRODUCTION-CONTEXT-DIGEST-v1`, the TB canonical JSON hashing, the digest's `CONTRACT_BASELINE` coupling and version-only drift (REVIEW_REQUIRED, not a mandatory re-draft) are unchanged. _(Qualified 2026-09-28, R14-AUD-013: keeping the v1 identifier while the recorded-scope result became part of the context let identical rows give the same digest for a different context. The definition is now `TB-PRODUCTION-CONTEXT-DIGEST-v2`, §38.)_

**Consistent snapshot.** The citations, the source rows, the case target and every `otherOwnerUsing` read come from the one snapshot of the read (for `generatePrompt`'s and `validateCandidate`'s rebuilds, their SERIALIZABLE transaction). `getProductionContext` stays business-read-only (P1's session activity touch aside).

**UI** (`apps/web/src/app/cases/production-context.tsx`). The page derives nothing; it marks what the context lists. `SOURCE_NOT_APPLICABLE` at `sources[i]` / `policySources[i]` marks that source: the tag "Not applicable to this case’s scope" beside every authority and mapping citation of it on the page (selection, coverage, version primary, coverage signer and event sources; mapping basis), and in both source lists the "Case scope" row "Recorded source is not applicable to the current Case scope." with "Recorded conflicts name every record of this context that cites it. The records and the source are kept as recorded, and this says nothing about what the source shows." The R14-AUD-001 marking and wording are unchanged. No invalid, unauthorized, no-authority, expired, revoked or gate wording.

### 37.3 R14-AUD-009 — the four agency-level authority paths

| Mission §31 | Test | Result |
|---|---|---|
| A — `MandateVersion.primarySourceId` restricted to Subject A (same agency and owner), case of Subject B | DB `p4d-http` "R14-AUD-009 A — …": the citation valid at the agency level; exactly one `SOURCE_NOT_APPLICABLE` at the source's manifest entry, naming "the primary source of mandate version ‹id›" and `SCOPED_TO_OTHER_SUBJECT`; the source listed exactly as recorded and in the closure; the authority block exactly the selected version, coverage and events; the mandate, version, event, source, case, link, support, mapping and selection rows unchanged; repeated reads identical and writing nothing; no G1, invalid or unauthorized wording; a direct case link of the same source refused (422 `SOURCE_SCOPE_UNRESOLVED`) | PASS |
| B — `additionalSourceRefs[].sourceId` | DB "R14-AUD-009 B — …" (the same assertions, "additional source 0 of mandate version ‹id›") | PASS |
| C — `signedDatesRaw[].sourceId` | DB "R14-AUD-009 C — …" ("the source of signed date 0 of mandate version ‹id›") | PASS |
| D — whole-mandate `AuthorityEvent.sourceId` (`coverageId` null) | DB "R14-AUD-009 D — …" ("the source of whole-mandate authority event ‹id›") | PASS |
| E, F, G — scoped to the case's subject, to both subjects, no subject restriction | DB "R14-AUD-009 controls: …": each scope as primary, additional, signed-date and whole-mandate event source at once; also a coverage-scoped event, the coverage basis and the coverage signer source of the case's own route: no conflict | PASS |
| H — legitimate multi-route mandate | DB "R14-AUD-009 control: a legitimate multi-route mandate …": one version (sources naming both subjects or none), a coverage per route: no conflict in a case of either route; each case lists only its own coverage's basis | PASS |
| Through the stack | DB `p4g-http` "R14-AUD-009: a mandate version annex …": context → prompt (its `conflicts`, `contextJson`, PART 3's exact line, the source in its manifest, the version in its authority block) → candidate → validation REVIEW_REQUIRED with exactly one issue `CONTEXT.CONFLICTS` (DETERMINISTIC, code `SOURCE_NOT_APPLICABLE`), 0 blockers, none not executed; read back unchanged; the mandate, version, coverage, source and selection rows unchanged; the same draft of a fresh prompt of a chain whose sources apply is TECHNICAL_PASS | PASS |

### 37.4 R14-AUD-010 — later owner material outside the case

| Mission §15–§17, §32 | Test | Result |
|---|---|---|
| The dynamic scenario over every case path | DB `p4d-http` "R14-AUD-010: each of the case’s own citation paths …": canonical binding, packet source, case source link, fact support (its link UNLINKED afterwards), linked POLICY_REFERENCE source, mapping basis and selection basis all apply at t0. Then another owner's DRAFT version gains one coverage per source, one at a time (valid writes touching nothing of the case). After each: the same `contextRevision`, a new digest, exactly that source's fingerprint changed, one more `SOURCE_NOT_APPLICABLE` naming that citation with `CROSS_OWNER_REFERENCE` at its manifest entry (`policySources[i]` for the policy source), no other owner's id in the context. The case row, its links, supports, mappings, selection and the sources are unchanged throughout; a new direct link of one of them is refused (422 `CROSS_OWNER_REFERENCE`) | PASS |
| t0 → t1: revision, digest, conflict, stale prompt, history | DB `p4g-http` "R14-AUD-010: a clean context at t0 …": a TECHNICAL_PASS run and its prompt at t0 (D0, H0); another owner's DRAFT coverage cites the case's linked source; t1: revision = D0, digest ≠ H0, only that source's fingerprint changed, exactly one `SOURCE_NOT_APPLICABLE` (`CROSS_OWNER_REFERENCE`, "case source link ‹id› (SYNTHETIC_SUPPORT)"); `generatePrompt` with (D0, H0) → **412 `CONTEXT_CHANGED` {field `expectedDependencyDigest`}**, no prompt written; `validateCandidate` with H0 → 412, no run written; the t0 prompt, run, its issues, the candidate, the case row, the link and the source byte-identical (database rows) and read back unchanged; a new read → a new prompt freezing the conflict and a REVIEW_REQUIRED run (`CONTEXT.CONFLICTS`, `CONTEXT.PROMPT_DRIFT`) | PASS |
| G, H — valid shared reuse; one owner's several uses | DB "R14-AUD-010 controls: …": one source linked to and the mapping basis of cases of two owners, while it is no owner's material: no conflict in either; one owner's source used as its coverage basis, a version annex, and as a case link, mapping basis and selection basis of its own case: no conflict, and a coverage of the other owner citing it is refused (422 `CROSS_OWNER_REFERENCE`) | PASS |
| The evaluator, digest and inventory without a database | unit `production-context-rules`: `sourceCitations` — one test per path group and a completeness test (every kind in its order, all 17 sources of the fixture, the words); `assembleContext` — one conflict per source at its manifest entry, correspondence parity and no duplicate, 20 named and the rest counted in a fixed order, an unevaluated source refused; `dependenciesOf` — another owner's use of a source cited only by a version, a whole-mandate event, a case link and mapping, a policy link or a message changes exactly that source's fingerprint and the digest; a recorded-scope reason changes none; no dependence on read order or on how often a source is cited | PASS |

### 37.5 Collector inventory (mission §33)

| Materialized source | Citation kind | Unit test | DB test |
|---|---|---|---|
| `CaseRecord.canonicalBindingSourceId` | `CASE_CANONICAL` | "the case’s canonical binding and packet sources" | AUD-010 paths |
| `CaseRecord.packetSourceId` | `CASE_PACKET` | the same | AUD-010 paths |
| CaseSource (LINKED, or named by a support) | `CASE_SOURCE` | "every case source link of the context, and every fact support …" | AUD-010 paths; AUD-010 t0 → t1 |
| FactSource → CaseSource | `FACT_SUPPORT` | the same | AUD-010 paths (the link UNLINKED) |
| POLICY_REFERENCE CaseSource | `CASE_SOURCE` (listed in `policySources`) | assembly "… (sources or policySources) …" | AUD-010 paths |
| `UseMapping.basisSourceId` | `MAPPING_BASIS` | "the basis of each use mapping and of the named authority selection" | AUD-010 paths |
| `CaseAuthoritySelection.basisSourceId` | `SELECTION_BASIS` | the same | AUD-010 paths |
| `MandateVersion.primarySourceId` | `MANDATE_VERSION_PRIMARY` | "a pinned mandate version’s primary, additional and signed-date sources" | AUD-009 A |
| `MandateVersion.additionalSourceRefs[].sourceId` | `MANDATE_VERSION_ADDITIONAL` | the same | AUD-009 B; stack |
| `MandateVersion.signedDatesRaw[].sourceId` | `MANDATE_VERSION_SIGNED_DATE` | the same | AUD-009 C |
| `MandateCoverage.basisSourceId` | `COVERAGE_BASIS` | "the coverage basis, the coverage signer row’s source, and each authority event’s source …" | AUD-009 controls |
| selected `CoverageSigner.sourceId` | `COVERAGE_SIGNER` | the same | AUD-009 controls |
| whole-mandate `AuthorityEvent.sourceId` | `MANDATE_EVENT` | the same | AUD-009 D |
| coverage-scoped `AuthorityEvent.sourceId` | `COVERAGE_EVENT` | the same | AUD-009 controls |
| a selected message's raw / attachment source | `CORRESPONDENCE_RAW` / `CORRESPONDENCE_ATTACHMENT` | "a selected message’s raw source and each attachment observation …" | R14-AUD-001 tests (§36.2) |

### 37.6 Regression of the closed findings

- **R14-AUD-001** (correspondence): every §36.2 test passes unchanged — raw source, attachment source, valid shared reuse, unbound case, route transition, owner isolation and the stack. The three R14-AUD-001 unit tests keep their exact expected conflicts and digests; their fixture now builds the citations with the production collector and passes one evaluation per source (behaviour parity: the same conflicts, messages, field paths and fingerprints). The web test's marking is unchanged. Two of its controls were re-run on the refactored code (NC-001-R1, -R2, §37.8).
- **R14-AUD-003:** new runs record `TB-TECHNICAL-RULESET-v2` (every P4G DB test; the smoke); a stored v1 run reads, lists and replays as v1; the pinned vocabulary tests and the synthetic-`CONTRACT_BASELINE` identity test pass. The ruleset is untouched.
- **R14-AUD-004:** `tests/tooling/ui-sandbox-lifecycle.test.ts` 8/8; the browser session verified its own empty start and its teardown emptied `tb_notice_test`.
- **R14-AUD-008:** `tests/tooling/gate-terminology.test.ts` 3/3 over the updated documentation.


### 37.7 Tests and totals

| Suite | Change | Covers |
|---|---|---|
| `tests/api/production-context-rules.test.ts` | +15 | `sourceCitations` (8): one test per path group — the case's canonical binding and packet sources; its case source links and the fact supports through them (a link no longer LINKED only through a support); the mapping and selection bases; a pinned version's primary, additional and signed-date sources; the coverage basis, the coverage signer row's source, whole-mandate and coverage-scoped event sources; a selected message's raw and attachment sources — plus the complete, fixed inventory and "nothing cited that no record names" (a support naming a link outside the rows is an internal error). `assembleContext` (4): one `SOURCE_NOT_APPLICABLE` per source at its manifest entry; correspondence parity without a duplicate; a source cited hundreds of times is one bounded conflict in a fixed order; an unevaluated source is an internal error. `dependenciesOf` (3): another owner's use changes exactly that source's fingerprint and the digest; a recorded-scope reason changes none; no dependence on read order or citation count. The three R14-AUD-001 tests: their fixture builds the citations with the production collector; expectations identical |
| `tests/web/p4d.test.tsx` | +1 | a `SOURCE_NOT_APPLICABLE` source (a version's primary source; a linked policy source) marked beside its citations and in both source lists; the R14-AUD-001 marking unchanged; no verdict wording |
| `tests/db/p4d-http.test.ts` | +8 | §37.3 A–D (one test per path), the controls E–G and the multi-route mandate H; §37.4 the seven-path dynamic scenario and the shared-reuse controls |
| `tests/db/p4g-http.test.ts` | +2 | the AUD-009 proof through the stack; the AUD-010 t0 → t1 proof |
| `scripts/local/p4g-smoke.ts` (CI) | one new section (133 checks; 94 before) | §37.11 |

Totals: `yarn test` **1575** in 52 files (1559 before); `yarn test:db` **544** in 14 files (534) — home PC and CI identical. Each code commit was verified on its own before the push: typecheck, lint (0 warnings), format and `yarn test` (1571, 1574, 1575 and 1575 in 52 files), plus the p4d and p4g DB suites on the two production commits (91 and 92 in 2 files) — the appendix of `evidence/r14-astra2-first-pc-sweep.txt`.

### 37.8 Commits

| Commit | Content | CI |
|---|---|---|
| `8b9fca5` | fix(production): every listed source checked against the current case — `context-sources.ts` (new: the collector and one evaluation per read), `context-snapshot.ts`, `context-assembly.ts` (`SOURCE_NOT_APPLICABLE`; the R14-AUD-001 conflicts rebuilt from the same citations), `context-dependencies.ts` (the owner marker still from message citations only), `source-scope.ts` (comments only); the collector and assembly unit tests, the AUD-009 and AUD-010 DB tests of `p4d-http` (without the digest assertions) and the AUD-009 stack test (R14-AUD-009, R14-AUD-010) | (pushed with `51c5f44`) |
| `de34c5d` | fix(production): another owner's use of any listed source joins that source's fingerprint (`context-dependencies.ts`); the fingerprint unit tests, the digest assertions of the seven-path DB test and the AUD-010 t0 → t1 test (R14-AUD-010) | (pushed with `51c5f44`) |
| `22a8f07` | fix(web): the context page marks every source the context records as not applicable (`production-context.tsx`); its web test (R14-AUD-009, R14-AUD-010) | (pushed with `51c5f44`) |
| `51c5f44` | test(smoke): `smoke:p4g` covers current source applicability — the code head | push run 36325665818 success |
| (this record) | docs(r14): §37, the evidence `r14-astra2-*` and screenshots, `CLAUDE.md`, `CURRENT_STATE.md` (documentation only) | reported with the remediation report |

Nothing was amended, rebased, rewritten or force-pushed; no branch, tag, release or pull request was created. The branch moved `fdcda2b..51c5f44` by a normal push, and `origin/main` stays `c73cbda`.

### 37.9 Browser verification (Playwright MCP)

**18/18 PASS, no finding** (`evidence/r14-astra2-playwright-mcp-verification.txt`; screenshots `evidence/screenshots/r14-astra2-*`). Target: `yarn ui:sandbox` built from `51c5f44` on the disposable `tb_notice_test`, under the R14-AUD-004 ownership guard; an isolated headless browser; synthetic data only, seeded and changed through the compiled API.
- **The AUD-009 effect.** One agency, one owner, Subjects A and B; one frozen multi-route mandate whose version cites an agreement naming both subjects (primary and signed date) and an annex restricted to Subject A (additional source), with a whole-mandate event citing a notice restricted to Subject A. Case B (Subject B), selecting its route's coverage: "Recorded conflicts (2)", `SOURCE_NOT_APPLICABLE` at the annex's and the event source's manifest entries with the neutral message; the tag beside the event's source in the authority block and the "Case scope" row on those two manifest entries only; the shared agreement, the coverage basis and signer source and the mapping basis unmarked; DRAFTING delivered; no verdict wording.
- **Applicable, no conflict.** Case A (Subject A), the same mandate and event: "Recorded conflicts (0)", no tag.
- **Through the stack.** Case B's prompt snapshot shows the two conflicts, frozen, and renders them in PART 3. Its candidate's technical validation is REVIEW_REQUIRED: 0 blockers, `CONTEXT.CONFLICTS` twice, the permanent qualifier, `TB-TECHNICAL-RULESET-v2`, no READY_FOR_SIGNER.
- **The AUD-010 drift.** Case A at t0: TECHNICAL_PASS against digest `b4b8babf…`. Another owner's valid DRAFT coverage then cites Case A's linked source (written through the compiled API; nothing of Case A changed, by row fingerprints). A validation against the t0 read is refused: 412 `CONTEXT_CHANGED` {field `expectedDependencyDigest`}, "Context changed. Read the current context before validating again." / "No validation run was recorded.", nothing written. The new read has the same revision 6 and a new digest `28e2cbf1…`, with one `SOURCE_NOT_APPLICABLE` (`CROSS_OWNER_REFERENCE`, "case source link … (SYNTHETIC_SUPPORT)") and no other owner named. The new run is REVIEW_REQUIRED (`CONTEXT.CONFLICTS`, `CONTEXT.PROMPT_DRIFT` on that source).
- **History, actions, layout, keyboard.** "Open run" reads the t0 run from the server and shows it exactly as recorded (TECHNICAL_PASS, digest `b4b8babf…`, "Nothing was checked again"). The t0 prompt still shows revision 6, `b4b8babf…` and no conflict. No assessment, readiness, approval, signing, sending or export action appears; `GET …/assessments` and `…/readiness` are 404. At 390 px nothing scrolls sideways. Enter on "Show context", "Read the current context", "Run technical validation" and "Open run" moves focus to the outcome.
- **Writes and cleanup.** Reads and the 412 change nothing (row fingerprints); each run adds one run, its issues, one audit event and one idempotency record. Sign-out gives 401. The owned teardown deleted every row: the fingerprint equals the empty start, and `db:verify test` PASS.

### 37.10 Negative controls

**14/14 caught and restored byte-identically** (`evidence/r14-astra2-negative-controls.txt`), 2026-09-27T13:42:25Z–13:43:39Z, on the final code before the commit split: every file at `51c5f44` has exactly the SHA-256 the harness tested. 27 responsible commands, every one failing with an AssertionError as its first failure; the working-tree fingerprint identical before and after. The unmutated baseline passed 20/20 distinct commands, each selecting at least one test.

| Mission | Control | Responsible tests |
|---|---|---|
| MandateVersion primary-source applicability disabled | NC-009-A | DB "R14-AUD-009 A"; unit "one SOURCE_NOT_APPLICABLE per source at its manifest entry …" |
| additionalSourceRefs applicability disabled | NC-009-B | DB "R14-AUD-009 B"; DB "R14-AUD-009: a mandate version annex …" (the stack) |
| signedDatesRaw source applicability disabled | NC-009-C | DB "R14-AUD-009 C" |
| whole-mandate event source applicability disabled | NC-009-D | DB "R14-AUD-009 D"; unit "one SOURCE_NOT_APPLICABLE per source …" |
| current Owner-material recheck disabled | NC-010-A | DB "R14-AUD-010: each of the case's own citation paths …"; DB "R14-AUD-010: a clean context at t0 …" |
| applicability removed from the dependency fingerprint | NC-010-B | the same two DB tests; unit "for a source cited only by a mandate version …" |
| canonical and packet sources omitted from the collector | NC-010-C | unit "the case's canonical binding and packet sources"; DB seven paths |
| CaseSource and FactSource omitted from the collector | NC-010-D | unit "every case source link of the context …"; DB seven paths |
| mapping and selection bases omitted from the collector | NC-010-E | unit "the basis of each use mapping …"; DB seven paths |
| legitimate shared use broken (positive control) | NC-010-F | DB "R14-AUD-010 controls: valid shared reuse …"; DB "R14-AUD-009 controls …" |
| further | NC-009-E (valid shared authority scope broken), NC-001-R1 and -R2 (R14-AUD-001's raw-source and attachment conflicts disabled in the refactored loop), NC-UI-01 (the page no longer marks a `SOURCE_NOT_APPLICABLE` source) | DB controls and multi-route; the R14-AUD-001 DB tests; web "R14-AUD-009 / R14-AUD-010 …" |

### 37.11 Regression sweep and CI

**Sweep:** 2026-09-27T14:12:21Z–14:21:20Z on `51c5f44`, after the targeted tests, the negative controls and the browser session and before the push. All 21 steps exit 0 (`evidence/r14-astra2-first-pc-sweep.txt`).

| Command | Result |
|---|---|
| `yarn reference:check` (before and after) | frozen references intact (`MANIFEST.sha256` `42c2a419…` matches the pin) |
| `yarn reference:helper-tests` | 27 pass, 0 fail |
| `yarn contracts:check` | 3 generated outputs match the active source |
| `yarn install --immutable` | lockfile unchanged (pre-existing YN0086 note) |
| `yarn typecheck` · `yarn format:check` | exit 0 |
| `yarn lint` · `oxlint --deny-warnings --format default` | exit 0 · exit 0 — **0 warnings** ("Found 0 warnings and 0 errors." on 330 files) |
| `yarn test` | 1575 / 1575 in 52 files |
| `yarn test:db` | 544 / 544 in 14 files (`tb_notice_test`) |
| `yarn db:verify test --expect-empty` (before and after) | PASS, domain rows 0 |
| `yarn db:verify dev` | PASS (metadata and a row count only: 5, unchanged — nothing written to `tb_notice_dev`) |
| `yarn db:status test` / `dev` | up to date (1 migration) |
| `yarn db:drift:diff-migrations` / `db:drift:diff-datasource dev` | empty migration (no drift) |
| `yarn build` | exit 0, no chunk-size advisory (entry 329.93 kB; production-context chunk 33.78 kB, +0.91 kB; candidates 56.82 kB; no Zod runtime in the page chunks) |
| `yarn smoke:local` | 62 checks |
| `yarn dev:verify-shutdown` | 4 / 4 scenarios |

`smoke:auth`, `smoke:directory`, `smoke:p3a`, `smoke:p3b` and `smoke:p4a`–`smoke:p4g` write records and run only in CI; all are kept and pass there. `yarn test:transition-baseline` is not a gate and was not run.

**`smoke:p4g` (extended, no new phase smoke).** After its existing flow, one section checks current source applicability through the compiled API. A version annex restricted to another subject of the same owner (valid when recorded) gives case C's context exactly one `SOURCE_NOT_APPLICABLE`, and the version's other sources and the coverage basis stay clean. A source linked to case A applies until another owner's valid DRAFT coverage cites it; then case A's context has the same revision, a new digest and `SOURCE_NOT_APPLICABLE` (`CROSS_OWNER_REFERENCE`), with no other owner named. A prompt and a validation against the earlier digest are 412 `CONTEXT_CHANGED` and write nothing, and case A's recorded runs read back unchanged. Checking the sources wrote no run, issue, prompt, candidate or assessment.

**CI** (`evidence/r14-astra2-ci-run-36325665818.txt`). Code head `51c5f44`: push run [36325665818](https://github.com/TuongChris/tb-notice-production-system/actions/runs/36325665818) (2026-09-27T14:22:18Z–14:31:10Z), **success**, both jobs:
- "Non-DB checks (cold install)" (job 108637839847): the reference check and the 27 helper tests, `contracts:check`, lint "Found 0 warnings and 0 errors.", format, `yarn test` 1575 / 52 files, build, the frozen references and the working tree unchanged.
- "Database, seed and smoke (MySQL 8.4.11)" (job 108637839688): migration and metadata verification on test, replay and dev; `yarn test:db` 544 / 14 files; the seed twice with the canonical digest unchanged; both drift diffs empty; `smoke:local` 62; `smoke:auth` 4; `smoke:directory` 14; `smoke:p3a` 24; `smoke:p3b` 36; `smoke:p4a` 50; `smoke:p4b` 64; `smoke:p4c` 62; `smoke:p4d` 87; `smoke:p4e` 84; `smoke:p4f` 90; `smoke:p4g` 133 (94 before: the new section, its record creations and reads included); the P1.1 recovery commands; `yarn dev` clean shutdown 4 / 4.

No other smoke was changed, and every smoke passes in CI. The documentation head's run is reported with the remediation report.

### 37.12 Schema, contract and dependencies

- **No migration, no Prisma schema change.** `20260923103912_initial_schema` is still the only migration; both drift diffs are empty.
- **No wire change.** TB-SCHEMA-API-v1.3.0 is unchanged: 289 schemas, 144 operations, 99 paths, `info.version` 1.3.0 (read from the generated OpenAPI document and schema bundle at `51c5f44`); `amendment.json` sha256 `6b74c09aba024dcf8cb2e0a0c6e374bbce17b45298d2aec83cc2e3ab166a1630`; `contracts:check` passes. `SOURCE_NOT_APPLICABLE` is a value of the existing free-string `code` of a `MissingItem` in the existing `conflicts[]` (code ≤ 100, message ≤ 8000, fieldPath ≤ 500 characters, at most 1000 entries); no query parameter, response field or schema was added, so `CONTRACT_CHANGE_REQUIRED` did not arise and no TB-SCHEMA-API-v1.4.0 exists.
- **The ruleset, template and digest identifiers are unchanged.** `TB-TECHNICAL-RULESET-v2` (no rule added or changed — `CONTEXT.CONFLICTS` reports the new code), `TB-PROMPT-TEMPLATE-v1`, `TB-CANDIDATE-ARTIFACT-v1`, `TB-PRODUCTION-CONTEXT-DIGEST-v1` with its `CONTRACT_BASELINE` coupling; version-only drift stays REVIEW_REQUIRED. _(Superseded for the digest by R14-AUD-013: `TB-PRODUCTION-CONTEXT-DIGEST-v2`, §38.)_
- **Nothing else outside the change.** `git diff fdcda2b..51c5f44` (11 files) touches nothing under `packages/`, `apps/api/prisma`, `docs/reference`, `docs/contracts`, `docs/decisions`, `yarn.lock`, `.yarnrc.yml`, `.nvmrc` or any `package.json`. No dependency was added. The write rules, the target allowlist, the dev database and the migration tooling are unchanged.

### 37.13 Warnings and open items for the operator (not decided here)

1. **The owner marker of a listed source now covers every citation** (§37.2). When another owner's records use any source the context lists, that source's fingerprint includes `otherOwnerMaterial: true`, so the digest changes when that condition arises or ends. This generalizes the R14-AUD-001 extension (§36.13 item 1) under the same identifier `TB-PRODUCTION-CONTEXT-DIGEST-v1`. Contexts without the condition keep their digests; a new digest identifier would have changed every digest. The operator's confirmation is asked. _(Answered by the re-audit, R14-AUD-013: the identifier had to change; see §38.)_
2. **A stored context may now read differently.** A context whose sources did not apply but that was read before this change keeps its stored digest when nothing it fingerprints changed (recorded-scope reasons are derived, not fingerprinted — §36.13 item 2). Its next read lists the conflicts. A prompt generated from it is not stale by digest; a later validation reports the conflicts through `CONTEXT.CONFLICTS`. A case whose listed source is another owner's material today gets a new digest at its next read, so a prompt or validation against an earlier read is 412.
3. **The authority block names the conflict, not a verdict.** A `SOURCE_NOT_APPLICABLE` on a source of the selected chain is shown beside that citation. The selection, coverage, version and signer rows are shown exactly as pinned. Whether the chain still supports this case is G1, a later human review; nothing here decides it.
4. **Candidate plan offers.** The candidate import page offers the prompt's source manifest (R13 decision 9), which can include a source this context records as not applicable. `importCandidate` refuses such a plan entry with the source-scope reason, and `PLAN.SOURCE_APPLIES` reports it. Pre-existing behaviour, not changed.
5. **ADR-0006** stays PROPOSED; its acceptance and TB-SCHEMA-API-v1.3.0's belong to the operator's review.
6. **Evidence limitations:**
   - the browser scenario and its later owner write were made through the compiled API by a scratchpad script, not through the directory and authority pages;
   - the stale prompt generation is proven by the DB test and `smoke:p4g`, not repeated in the browser;
   - the negative controls ran on the final working tree before the commit split (the committed files are byte-identical to it).
7. **Pre-existing, non-blocking:** the YN0086 peer-dependency note; `yarn test:transition-baseline` fails by design (not run, not a gate); R14-AUD-011 and -012 recorded as NON_BLOCKING_BACKLOG (§37.1), not changed.

### 37.14 Status (maximum claim of this mission)

| Scope | Status |
|---|---|
| `ASTRA_AUDIT` | **PARTIAL** — the independent re-audit of the exact new head decides |
| R14-AUD-009 · -010 | **REMEDIATED_PENDING_INDEPENDENT_REVIEW** each |
| R14-AUD-001 · -003 · -004 · -008 | **CLOSED_VERIFIED_WITH_LIMITS** (continued audit; not reopened; regression re-run, §37.6) |
| R14-AUD-002 · -007 | **OPEN_BACKLOG** (unchanged) |
| R14-AUD-011 · -012 | **NON_BLOCKING_BACKLOG** (unchanged) |
| R14-AUD-005 · -006 | **FUTURE_ASSESSMENT_PREREQUISITE** (unchanged) |
| R14 | **HOLD_FOR_REVIEW** — not PASS |
| ADR-0006 / TB-SCHEMA-API-v1.3.0 | **PROPOSED** (active on the remediation branch; `main` carries v1.2.0) |
| P4G | **MERGED_TO_MAIN_FOR_IMPLEMENTED_SCOPE** (`c73cbda`); not VERIFIED_COMPLETE |
| CandidateAssessment and later phases | **NOT_STARTED** |
| External action | **NONE** |
| Database / wire contract / dependencies | **No change** |

Recommended next action: **an independent Astra re-audit of the exact new head.**

## 38. Astra re-audit remediation — R14-AUD-013 (2026-09-28, home PC)

Mission TB_R14_ASTRA_AUD013_SEMANTIC_DIGEST_REMEDIATION (operator, 2026-09-28), on `feature/r14-validation-run-readback`. Primary source: the operator's independent Astra re-audit of the §37 documentation head `e0a521a`.
- It closed R14-AUD-009 and -010 **CLOSED_VERIFIED_WITH_LIMITS**, together with R14-AUD-001, -003, -004 and -008.
- It found one further blocker of R14 final and of assessment implementation: **R14-AUD-013** (CONFIRMED_DEFECT / HIGH).
- **R14 = HOLD_FOR_REMEDIATION**. TB-SCHEMA-API-v1.3.0 is supported as an additive historical read contract but not yet accepted as part of R14 final.

Sections 1–37 keep the state at their time. §7, §37.2, §37.12 and §37.13 item 1 carry a pointer here.

### 38.1 Scope, pre-flight and independent confirmation

| Item | Value |
|---|---|
| Authorized | exactly R14-AUD-013: version the production-context digest definition (the audit's option 1) |
| Kept as closed (not reopened) | R14-AUD-001, -003, -004, -008, -009, -010 **CLOSED_VERIFIED_WITH_LIMITS** — regression re-run (§38.6) |
| Recorded only, unchanged | R14-AUD-002, -007 **OPEN_BACKLOG**; R14-AUD-011, -012 **NON_BLOCKING_BACKLOG**; R14-AUD-005, -006 **FUTURE_ASSESSMENT_PREREQUISITE** |
| Not done (not authorized) | CandidateAssessment, AssessmentSource read, G1–G6 forms, readiness, READY_FOR_SIGNER, unsigned export, G7, signature, sending, email, Drive, uploader contact, platform action, real-case data. Also none of: a wire field or query parameter naming the algorithm, a v1 fallback, a backfill or rewrite of stored digests, a synthetic `contextRevision` write, an automatic redraft or rebinding workflow |
| Pre-flight (before any change) | `HEAD` = `e0a521aed087fa436f011dadd94082fc5f844958`, equal to its origin, worktree clean; `origin/main` = `c73cbdad1fe5d09813525930b4df9ed9123fd9de`; no pull request of the branch, no tag; CI run 36326570907 on `e0a521a` success, both jobs |
| Operator decision during the mission (2026-09-28) | The technical-ruleset identifier question (§38.7): keep `TB-TECHNICAL-RULESET-v2` byte-identical, with one named exception in the R14-AUD-003 guard |

The finding was confirmed from the source before any change:
- At `e0a521a`, `DEPENDENCY_DIGEST_ALGORITHM` was `TB-PRODUCTION-CONTEXT-DIGEST-v1`. The digest hashed `{algorithm, contract: CONTRACT_BASELINE, schemaVersion: PFC_SCHEMA_VERSION, scope, dependencies}`.
- A listed source's recorded-scope result (for example `SCOPED_TO_OTHER_SUBJECT` for a mandate version's annex) follows from records already in the closure. So no fingerprint changes when an evaluator starts to report it (§37.2).
- Only another owner's use adds a key (`otherOwnerMaterial`).
- `generatePrompt` compares the expected revision, then the rebuilt digest. `validateCandidate` compares the digest at its capture and again at its commit.
- Identical rows therefore passed both checks against a preview that listed no conflict, while the context now lists one.
- The real code of the earlier deployments reproduces this on identical rows (§38.3).

### 38.2 Root cause and remediation

**Root cause.** The digest identifies the persisted dependency state, but the definition identifier did not change when the application started to read that state differently. R14-AUD-001, -009 and -010 changed what a context derives from identical rows: the current applicability of every listed source, with `SOURCE_NOT_APPLICABLE` and `CORRESPONDENCE_SOURCE_NOT_APPLICABLE` conflicts. `Case.contextRevision` tracks persisted case mutations, not application semantics, so it could not detect this either.

**Remediation** (`apps/api/src/modules/production/context-dependencies.ts`; ADR-0007, PROPOSED):
- `DEPENDENCY_DIGEST_ALGORITHM` = **`TB-PRODUCTION-CONTEXT-DIGEST-v2`**. Everything else in the definition is unchanged: the preimage fields, TB canonical JSON v1, SHA-256 (lowercase 64 hex), the closure, the fingerprints, and row versions outside the digest.
- **One definition, one path.** `getProductionContext`, the `generatePrompt` rebuild, and the `validateCandidate` capture and commit rebuild all reach `assembleContext` → `dependencyDigest(scope, dependencies)`.
  - No parameter, option or fallback selects another definition.
  - A static unit test pins the identifier to one definition (plus the v1 string only in the unchanged ruleset vocabulary), the one call and the function's two parameters.
  - The v1 definition exists only in test code: the oracle `tests/support/context-digest-oracles.ts` and the compiled smokes' recomputation. Both are written out and hashed with the frozen reference helper.
- **The versioning rule** is documented at the definition, in CLAUDE.md and in ADR-0007.
  - The identifier changes whenever identical rows, request scope, `CONTRACT_BASELINE` and PFC identifier could give a materially different context: a new current-applicability semantic, a conflict or missing-item derivation, a closure interpretation, or any other evaluator change that no fingerprint reflects.
  - It never changes for a refactor with the same output, a UI, CSS, test, logging or performance change.
  - A wire release is no substitute.
- **Unchanged:**
  - the wire contract and the database;
  - `CONTRACT_BASELINE` in the preimage and the PFC identifier;
  - `TB-PROMPT-TEMPLATE-v1`: the renderer is not in the diff, and the same supplied context renders the same bytes;
  - `TB-TECHNICAL-RULESET-v2`: `technical-ruleset.ts` is not in the diff (§38.7);
  - `contextRevision`, which never moves for a deployment;
  - the P4D DRAFTING gate: a conflict is listed, not a gate.

**Consequence at deployment.** Every current digest changes once.
- A preview kept from before is refused once with 412 `CONTEXT_CHANGED` `{field: expectedDependencyDigest}`. The page shows its existing message and offers only a new read.
- The dependency manifest of an unchanged context is identical under v2; only the digest differs.
- A candidate of a prompt recorded under v1, validated now with every record it depends on unchanged, reports `CONTEXT.PROMPT_DRIFT` change `IDENTIFIERS` (REVIEW_REQUIRED), plus `CONTEXT.CONFLICTS` for a current conflict. A changed record gives its own ADDED / REMOVED / CHANGED drift issue instead of `IDENTIFIERS`; REVIEW_REQUIRED either way. REVIEW_REQUIRED is not a mandatory re-draft.

### 38.3 The cross-deployment reproduction with the real code of earlier deployments

A scratch experiment (never committed; `evidence/r14-astra3-cross-deploy-experiment.txt`) ran the real `readContextRows` + `assembleContext` of `fdcda2b` and of `e0a521a`, extracted with `git archive`, next to the current application. All three read the same rows of one fixture on `tb_notice_test`: the R14-AUD-013 case, whose mandate version cites an annex restricted to another legal subject of the same owner. No other owner's material was involved.

| Deployment | Identifier | contextRevision | Dependencies | Conflicts | Digest |
|---|---|---|---|---|---|
| `fdcda2b` (before R14-AUD-009/-010) | v1 | 8 | 23, identical | none | `ab076d9e…17b6` (H_v1) |
| `e0a521a` (the defect) | v1 | 8 | 23, identical | `SOURCE_NOT_APPLICABLE sources[2]` | `ab076d9e…17b6` — the same digest for a different context |
| this remediation | v2 | 8 | 23, identical | `SOURCE_NOT_APPLICABLE sources[2]` | `21c3518b…c305` (H_v2) |

- The legacy v1 oracle over the current dependencies gives exactly `ab076d9e…17b6`, and the v2 oracle exactly `21c3518b…c305`.
- The contexts are identical apart from the conflict.
- The earlier deployment's preview tokens (revision 8, H_v1) sent to the current `generatePrompt` gave 412 `CONTEXT_CHANGED` `{field: expectedDependencyDigest}`. No idempotency record for its key, nothing written (whole-suite dump equal), case row byte-identical.
- The current read's tokens then generated version 2 with the conflict frozen.
- **The defect over HTTP (second run).** A new fixture of the same shape was run with `DEPENDENCY_DIGEST_ALGORITHM` temporarily set back to `TB-PRODUCTION-CONTEXT-DIGEST-v1`, and the file was then restored byte-identically. `fdcda2b`, `e0a521a` and the application all gave `1c42f9c6…3a99`, the legacy oracle's value, while the application's context listed the conflict and `fdcda2b`'s did not. The earlier preview's tokens then gave **201**, a completed idempotency record and a stored snapshot of a context the preview never showed: R14-AUD-013 reproduced.

### 38.4 The guarantee in tests

| Mission § | Test | Result |
|---|---|---|
| §9, §16, §17 | Unit `production-context-rules` "golden: the written-out v2 preimage …": the TB canonical JSON text of the v2 preimage of a fixed NMI_REPLY scope is written out; its node:crypto SHA-256 is pinned (`68c080db…5ffc`); the oracle and `dependencyDigest` both give it, also with the priors reversed and other row versions | PASS |
| §9, §17 | Unit "the legacy v1 oracle reproduces the accepted v1 digest exactly …": the v1 preimage differs from the v2 text only in the identifier. Its SHA-256 (`df75eed4…bc9e`) is the value the accepted implementation at `e0a521a` computed for the same inputs, recorded before the change | PASS |
| §8, §17 | Unit "one implementation path": the identifier appears once in the application, in the one definition (the v1 string only in the unchanged ruleset vocabulary). One `dependencyDigest(` call, from the assembly every path uses. The function takes the scope and the closure only, and the preimage has one `algorithm:` key | PASS |
| §9 | Unit "R14-AUD-013: the same rows under a definition that did not evaluate these citations … and under the current one …": the same revision, closure and fingerprints; no conflict versus two; the v1 digest of both is equal and is never the current one | PASS |
| §9, §10, §11, §31, §32 | DB `p4g-http` "old semantic preview cannot authorize prompt generation after the digest definition changed …", for DRAFTING and PREPARATION, on the R14-AUD-009 fixture: | PASS |
| | — the earlier interpretation of the same snapshot rows (every listed source unevaluated) lists no conflict; its v1 digest is H_v1 | |
| | — the current read has the same revision, closure and fingerprints, lists `SOURCE_NOT_APPLICABLE`, and its digest is the v2 oracle's H_v2 ≠ H_v1 | |
| | — `generatePrompt` with (D, H_v1): 412 `CONTEXT_CHANGED` `{field: expectedDependencyDigest}`, twice under one key. No idempotency record for the key; a whole-suite dump equal (no snapshot, audit event or case change); the case row byte-identical | |
| | — a new key with (D, H_v2): 201, one snapshot and one `PROMPT_GENERATED`, the digest H_v2, the manifest and context exactly the read's, the conflict frozen in `conflicts` and PART 3, the case row unchanged | |
| §12 | DB "validateCandidate: the v1 digest of the unchanged closure is 412 …": 412 `CONTEXT_CHANGED` `{field: expectedDependencyDigest}` before any run, no idempotency record, a whole-suite dump equal. The current digest records a run with exactly that digest and manifest: REVIEW_REQUIRED by `CONTEXT.CONFLICTS` only | PASS |
| §13, §36 | DB "R14-AUD-010: a clean context at t0 …" (existing; extended): H0 and H1 are each the v2 oracle over their own dependencies. The move is the owner marker within one definition. The t0 prompt and validation against H0 are 412 | PASS |
| §27, §28, §29 | DB "history: a prompt snapshot and a validation run recorded under TB-PRODUCTION-CONTEXT-DIGEST-v1 …": see §38.5 | PASS |
| §8 | DB `p4d-http` "TB-PRODUCTION-CONTEXT-DIGEST-v2 (R14-AUD-013, ADR-0007): every read's digest is the v2 definition …": INITIAL PREPARATION and DRAFTING and NMI_REPLY with its parent and prior; the v1 value of each closure differs; nothing written | PASS |
| §33 | Web `p4e` "a context changed after the read …" (tightened): the refused request carried exactly the reviewed read's body; no context read happened between the 412 and the person's "Read the current context"; exactly one read after it; the next request carries exactly the new digest under a new key | PASS |
| §22 | Unit `validation-rules` "the one named exception …" (§38.7) | PASS |

### 38.5 History, idempotency and the case revision

- **Historical PromptSnapshot** (mission §27): a snapshot as a v1 deployment recorded it is set directly in `tb_notice_test`, since the application no longer computes a v1 digest. It carries the digest H_v1, the earlier context without the conflict, its rendered prompt (`renderPrompt` of that context, `TB-PROMPT-TEMPLATE-v1`) and SHA-256, and contract `TB-SCHEMA-API-v1.3.0`.
  - `getPrompt` returns it exactly, and `listCasePrompts?q=H_v1` finds it with H_v1.
  - No conflict is inserted and nothing is re-digested.
  - A new read is H_v2 with the conflict, and no prompt carries H_v2 until one is generated.
- **Historical ValidationRun** (§28): a TECHNICAL_PASS run of that snapshot's candidate as v1 recorded it (H_v1, the earlier context, `TB-TECHNICAL-RULESET-v2`, all 29 rules executed).
  - `getValidationRun` returns it exactly, with no issues, and `listValidationRuns?q=H_v1` finds it with H_v1.
  - A new validation with H_v1 is 412, and with the current read a **new** run: REVIEW_REQUIRED by `CONTEXT.CONFLICTS` and `CONTEXT.PROMPT_DRIFT` `{change: IDENTIFIERS, promptDependencyDigest: H_v1, currentDependencyDigest: H_v2}`.
  - The list shows both, newest first, each with its own digest. The stored prompt, run and candidate rows are byte-identical before and after.
- **Dependency manifest** (§29): for unchanged rows the v2 manifest equals the v1 manifest entry for entry, as the DB tests and §38.3 show. Only the digest differs.
- **Case revision** (§30): the revision is the same D in the earlier interpretation, in the current read, after the refused requests and after a generation. The case row is byte-identical throughout; a generation locks it and never changes it.
- **Idempotency** (§11): the refused request's claim is released, per the existing WriteExecutor semantics (the IN_PROGRESS row deleted, a 412 is not retried). The same key refused again is not a replay. A new key with H_v2 succeeds. The WriteExecutor is unchanged.

### 38.6 Regression of the closed findings

- **R14-AUD-001** (correspondence sources): its DB and unit tests pass unchanged, and its fingerprints are unchanged under the same key. Only the digest identifier moved.
- **R14-AUD-003** (`TB-TECHNICAL-RULESET-v2` identity): the golden vocabulary tests (`validation-rules`, `validation-ruleset-identity`) pass unchanged. New runs record v2, and a v1 run reads back as v1. The guard is narrowed only as §38.7 records. NC-013-I shows a silent widening of v2 is caught.
- **R14-AUD-004** (`ui:sandbox` ownership): the lifecycle test passes 8/8. The browser pass started only after a verified empty start, and its teardown ended empty (§38.10).
- **R14-AUD-008** (G6/G7 terminology): `gate-terminology.test.ts` passes 3/3 on the final records. It passed in the sweep's `yarn test` with the ADR and P4D/P4E edits present, and again in the `yarn test` run after `CLAUDE.md`, `CURRENT_STATE.md` and this section were written and corrected (1580 / 1580).
- **R14-AUD-009** (authority sources): the p4d A–D, controls and multi-route tests pass. The p4g stack test passes. NC-009-B-R is caught under v2.
- **R14-AUD-010** (later owner material): the p4d seven-path test and the p4g t0 → t1 test pass. The within-v2 move H0 → H1 is asserted. NC-010-B-R is caught under v2, so stale detection does not rely only on the v1 → v2 change.

### 38.7 The technical-ruleset identifier question (operator decision)

- **The conflict.** The R14-AUD-003 guard (`validation-rules.test.ts`, "a later identifier needs a new ruleset version …") required every identifier the application uses, `DEPENDENCY_DIGEST_ALGORITHM` included, to be in `TB-TECHNICAL-RULESET-v2`'s pinned `MARKER.INTERNAL_IDENTIFIERS` vocabulary. ADR-0006 §8 recorded that rule. The mission, however, forbade a ruleset bump for the digest change (§22) and asked to confirm v2 unchanged (report item 27).
- **The operator's decision (2026-09-28).** Keep `TB-TECHNICAL-RULESET-v2` byte-identical and name one exception:
  - the vocabulary still lists `TB-PRODUCTION-CONTEXT-DIGEST-v1`;
  - the guard checks the five other identifiers as before;
  - a new test pins `DEPENDENCY_DIGEST_ALGORITHM` as `TB-PRODUCTION-CONTEXT-DIGEST-v2`, outside v2's vocabulary.

  Any other new identifier, or a later digest identifier, still fails. Recorded in ADR-0006 §8 (a dated qualification) and ADR-0007 Decision 7.
- **Effect.** A candidate whose text contains the literal `TB-PRODUCTION-CONTEXT-DIGEST-v2` raises no `MARKER.INTERNAL_IDENTIFIERS` finding; the v1 literal still does. The application does not itself emit `TB-PRODUCTION-CONTEXT-DIGEST-v2` as generated metadata, template text or UI metadata. Captured or operator-supplied free text can nevertheless contain that literal and may flow through context/prompt/candidate text. `TB-TECHNICAL-RULESET-v2` intentionally does not detect that new literal; this is a documented bounded limitation, not evidence that the literal cannot appear. [Corrected 2026-09-28 (R14-AUD-014, documentation only; §39.4): as first recorded the second sentence read "The v2 string appears on no wire, in no prompt text and on no page, only in the hashed preimage."]
- **Backlog.** A ruleset that detects the new identifier needs a new ruleset version. So does clearer `CONTEXT.PROMPT_DRIFT` wording for a definition-only drift: the recorded message says "the digest's contract or context-schema identifiers differ", and the digest-definition identifier is one of the digest's identifiers.

### 38.8 Tests and totals

| Suite | Change | Covers |
|---|---|---|
| `tests/support/context-digest-oracles.ts` (new, test-only) | the v1 and v2 definitions written out and hashed with the frozen helper | the legacy oracle and the independent v2 oracle |
| `tests/api/production-context-rules.test.ts` | +4 (v2 golden, v1 oracle, one path, the R14-AUD-013 assembly case); the preimage test now names v2 | §38.4 |
| `tests/api/validation-rules.test.ts` | +1 (the named exception); the guard checks the five other identifiers | §38.7 |
| `tests/db/p4g-http.test.ts` | +3 (the cross-deploy prompt test, the validation test, the history test); the R14-AUD-010 test asserts both digests are v2 | §38.4, §38.5 |
| `tests/db/p4d-http.test.ts` | +1 (every read's digest is v2) | §38.4 |
| `tests/web/p4e.test.tsx` | the 412 test tightened (exact bodies, no silent re-read) | §38.4 |
| `scripts/local/p4d-smoke.ts`, `p4g-smoke.ts` | v2 recomputation, v1-token refusals, a fresh v2 generation keeping the conflict | §38.12 |

Totals: `yarn test` **1580 / 1580 in 52 files** (1575 before); `yarn test:db` **548 / 548 in 14 files** (544 before). Both are equal on the home PC and in CI.

### 38.9 Commits

| Commit | Content | CI |
|---|---|---|
| `453cc2b` | fix(production): the digest definition names the context semantics — `DEPENDENCY_DIGEST_ALGORITHM` = `TB-PRODUCTION-CONTEXT-DIGEST-v2` and the versioning rule at the definition (`context-dependencies.ts`); the test-only oracles (`tests/support/context-digest-oracles.ts`); the v2 golden, the legacy v1 oracle, the one-path scan and the assembly case (`production-context-rules`); the named ruleset exception (`validation-rules`) | (pushed with `be8d74b`) |
| `b239f96` | test(r14): the cross-deploy prompt, validation and history DB tests and the within-v2 assertions (`p4g-http`), every read's digest is v2 (`p4d-http`), the tightened 412 web test (`p4e`) | (pushed with `be8d74b`) |
| `be8d74b` | test(smoke): `smoke:p4d` and `smoke:p4g` rebuild the v2 digest with the frozen helper and refuse the v1 digest of the same closure — the code head | push run 36375405502 success |
| `c889e63` | docs(r14): ADR-0007 (new, PROPOSED), the ADR-0006 qualification, §38, P4D §31, P4E §31 with their pointers, the evidence `r14-astra3-*` and screenshots, `CLAUDE.md`, `CURRENT_STATE.md` (documentation only) — the head accepted at R14 final | push run 36378687232 success (§39.7) |

Nothing was amended, rebased or force-pushed; no pull request, merge, tag or release. `origin/main` stays `c73cbda`.

### 38.10 Browser verification (Playwright MCP)

**18/18 PASS, no finding** (`evidence/r14-astra3-playwright-mcp-verification.txt`; screenshots `evidence/screenshots/r14-astra3-*`).
- **Target.** `yarn ui:sandbox` built from `be8d74b` on the disposable `tb_notice_test`, under the R14-AUD-004 ownership guard. An isolated headless browser; synthetic data only, seeded through the compiled API. The web chunks are byte-identical to the §37 build: no web source changed.
- **Fixture.** One agency and owner X with Subjects A and M. A frozen mandate whose version cites an annex restricted to Subject M. Case A (Subject A) selects its route's coverage.
- **History as a v1 deployment recorded it.** Set directly in `tb_notice_test` with the tooling account, as the DB tests do, because the application no longer computes a v1 digest: prompt version 1 with digest H_v1 `322c636b…7b1e`, the context without the conflict and its rendered prompt; a candidate imported from it through the API; its TECHNICAL_PASS run with H_v1. The driver stored the scripted instants in local time, so they read back as 11:30 PM and 11:31 PM on Sep 27; the read-back is compared with the stored row.
- **The current read.** The context shows H_v2 `1d42b46d…13a1`, the independent v2 oracle's value, with `SOURCE_NOT_APPLICABLE sources[3]`, its tag and the "Case scope" row. Focus moves to the read's outcome.
- **History exact.**
  - The prompt history lists version 1 with H_v1. Its detail shows H_v1, 22 dependencies, no conflict, and prompt text whose in-browser SHA-256 is exactly the stored `f49e42bd…1a03`.
  - "Open run" on the v1-era run shows TECHNICAL PASS, "Dependency digest evaluated" H_v1, "Nothing was checked again", and a historical context without the conflict.
- **Fresh v2 work.**
  - Generation against the read (request body `expectedDependencyDigest` H_v2) gives 201. Version 2 stores H_v2 with the conflict frozen; "Prompt generated" is announced once.
  - A validation against a new read gives a new REVIEW_REQUIRED run: `CONTEXT.CONFLICTS`, plus `CONTEXT.PROMPT_DRIFT` "… the digest's contract or context-schema identifiers …". The TECHNICAL_PASS run stays listed below it.
- **Within-v2 drift and the non-silent 412.**
  - Another owner's later write cites Case A's linked source. Case A's revision stays 6 and its rows are byte-identical. The current digest H1 `8c973e68…2866` equals the v2 oracle, with two conflicts.
  - Generation with the pre-drift read gives 412 with the exact message in a focused alert and no retry or silent re-read in the network log.
  - After "Read the current context", generation carries exactly H1 under a new key; version 3 stores H1.
- **Actions, layout, later phases.** At 390 px nothing scrolls sideways on the prompt detail, candidate or context pages. No approve, ready, sign, send, export, assessment or adopt action appears, and READY_FOR_SIGNER is absent. `GET …/assessments`, `…/readiness` and `…/unsigned-exports` are 404.
- **Writes and cleanup.** The v1-era prompt, run and candidate rows and Case A's row are byte-identical after the session. Case A stays at revision 6 and row version 6. `candidate_assessments` is 0. The owned teardown deleted every row: the fingerprint equals the empty start, and `db:verify test --expect-empty` PASS.
- **Limitation.** No cross-deployment switch in the browser: one compiled runtime cannot serve a v1 read and then a v2 write, and a running server was not mutated to fake one. The v1 → v2 refusal is proven by the DB tests, the negative controls and §38.3. The browser shows v1-era history beside v2 reads, and the same non-silent 412 path that a stale preview of either kind takes (the page treats the digest as an opaque string).

### 38.11 Negative controls

**15/15 caught and restored byte-identically** (`evidence/r14-astra3-negative-controls.txt`), 2026-09-28T03:54:28Z–03:56:00Z, on the committed code head `be8d74b`.
- 31 responsible commands; every one failed with an AssertionError as its first failure.
- The code-path fingerprint was the empty-diff value before and after.
- The unmutated baseline passed 16/16 distinct commands, each selecting at least one test.
- A first invocation was stopped during its baseline, before any mutation (an unbalanced `(` in a `-t` pattern); every result is from the second invocation.

| Mission | Control | Responsible tests |
|---|---|---|
| revert the production algorithm constant to v1 | NC-013-A | DB cross-deploy prompt and validation tests; DB p4d "every read's digest is the v2 definition"; unit v2 golden; unit "the one named exception" |
| `generatePrompt` ignores `expectedDependencyDigest` | NC-013-B | DB cross-deploy prompt test (201 instead of 412); DB "R14-AUD-010: a clean context at t0 …" |
| v1 in one path, v2 in another | NC-013-C1 (the generation rebuild v1), NC-013-C2 (`getProductionContext` v1), NC-013-C3 (the validation commit rebuild v1) | DB cross-deploy prompt test; DB p4d v2 test; DB validation test |
| a historical PromptSnapshot digest rewritten on read | NC-013-D | DB history test |
| a historical ValidationRun digest rewritten on read | NC-013-E | DB history test |
| the identifier removed from the preimage | NC-013-F | unit v2 golden; unit one path; DB p4d v2 test; DB cross-deploy prompt test |
| `contextRevision` incremented to hide the problem (v1 kept) | NC-013-G | DB cross-deploy prompt test ("the same revision", 10 vs 9); unit "the production module issues no write" |
| further | NC-013-H (the legacy oracle computes v2), NC-013-I (the ruleset vocabulary silently widened with the v2 identifier), NC-013-J (`validateCandidate` ignores the digest at its capture), NC-013-K (the prompt page retries a 412 silently) | unit v1 oracle; unit named exception, vocabulary and ruleset identity; DB validation and history tests; web p4e 412 test |
| within-v2 regressions | NC-010-B-R (the owner marker removed), NC-009-B-R (the version annex's applicability disabled) | DB AUD-010 t0 → t1 and seven paths; DB cross-deploy prompt test, the AUD-009 stack test and p4d "R14-AUD-009 B" |

NC-013-A fails the cross-deploy DB test at its first v2 check (the current digest is not the v2 oracle's). The HTTP-level acceptance of an earlier preview under the v1 identifier is shown separately in §38.3's second run (`evidence/r14-astra3-cross-deploy-experiment.txt`, "Defect reproduced over HTTP"): with the constant reverted, the stale request gave 201, a completed idempotency record and a stored snapshot. The file was then restored byte-identically.

### 38.12 Regression sweep and CI

**Sweep:** 2026-09-28T03:57:48Z–04:07:20Z on `be8d74b`, after the targeted tests and the negative controls and before the browser session. All 21 steps exit 0 (`evidence/r14-astra3-first-pc-sweep.txt`). The uncommitted records in `docs/` are outside every checked code path, except the documentation scan of `gate-terminology.test.ts` (§38.6).

| Command | Result |
|---|---|
| `yarn reference:check` (before and after) | frozen references intact (`MANIFEST.sha256` `42c2a419…` matches the pin) |
| `yarn reference:helper-tests` | 27 pass, 0 fail |
| `yarn contracts:check` | 3 generated outputs match the active source |
| `yarn install --immutable` | lockfile unchanged (pre-existing YN0086 note) |
| `yarn typecheck` · `yarn format:check` | exit 0 |
| `yarn lint` · `oxlint --deny-warnings --format default` | exit 0 · exit 0 — **0 warnings** ("Found 0 warnings and 0 errors." on 331 files) |
| `yarn test` | 1580 / 1580 in 52 files |
| `yarn test:db` | 548 / 548 in 14 files (`tb_notice_test`) |
| `yarn db:verify test --expect-empty` (before and after) | PASS, domain rows 0 |
| `yarn db:verify dev` | PASS (metadata and a row count only: 5, unchanged — nothing written to `tb_notice_dev`) |
| `yarn db:status test` / `dev` | up to date (1 migration) |
| `yarn db:drift:diff-migrations` / `db:drift:diff-datasource dev` | empty migration (no drift) |
| `yarn build` | exit 0, no chunk-size advisory. Every chunk is byte-identical by name and size to §37's (entry 329.93 kB; production-context 33.78 kB; prompts 15.54 kB; candidates 56.82 kB); no Zod runtime in the page chunks |
| `yarn smoke:local` | 62 checks |
| `yarn dev:verify-shutdown` | 4 / 4 scenarios |

`smoke:auth`, `smoke:directory`, `smoke:p3a`, `smoke:p3b` and `smoke:p4a`–`smoke:p4g` write records and run only in CI. All are kept and pass there. `yarn test:transition-baseline` is not a gate and was not run.

**Each code commit on its own.** Each commit's exact tree was rebuilt in the working tree by checking out the later files at that commit's version, with every code path's blob compared with the commit (0 mismatches). It was verified, and then HEAD was restored (0 code differences afterwards). Results:
- `453cc2b`: typecheck exit 0; "Found 0 warnings and 0 errors."; format exit 0; `yarn test` 1580 / 52 files; the p4d + p4g DB suites 92 / 2 files (their R14-AUD-013 tests arrive in `b239f96`).
- `b239f96`: typecheck exit 0; 0 warnings; format exit 0; `yarn test` 1580 / 52 files. Its DB test files are identical at `be8d74b`, so the sweep's `yarn test:db` 548 / 14 files covers them.
- `be8d74b` (smokes only): the sweep above and CI (below).

**`smoke:p4d` and `smoke:p4g` (extended, no new phase smoke).**
- `smoke:p4d` rebuilds the digest of four reads with the frozen helper: INITIAL PREPARATION without and with the selection, INITIAL DRAFTING, and NMI_REPLY DRAFTING with its parent and prior. Each is the v2 definition, and the v1 value of the same closure differs.
- `smoke:p4g`:
  - the prompt's digest and the digests before and after another owner's write are v2 (the move is the owner marker within one definition);
  - a prompt and a validation with the current revision and the v1 digest of the unchanged closure are 412 `CONTEXT_CHANGED` `{field: expectedDependencyDigest}`, with the case revision, row version and current digest unchanged;
  - for case C, the v1 digest is 412 with nothing written, and the current v2 digest generates a PREPARATION prompt that freezes the `SOURCE_NOT_APPLICABLE` conflict, read back exactly.

**CI** (`evidence/r14-astra3-ci-run-36375405502.txt`). Code head `be8d74b`: push run [36375405502](https://github.com/TuongChris/tb-notice-production-system/actions/runs/36375405502) (2026-09-28T03:52:27Z–04:01:46Z), **success**, both jobs. Logs read:
- "Non-DB checks (cold install)" (job 108780107714): the reference check and the 27 helper tests, `contracts:check`, lint "Found 0 warnings and 0 errors.", format, `yarn test` 1580 / 52 files, build, the frozen references and the working tree unchanged.
- "Database, seed and smoke (MySQL 8.4.11)" (job 108780107670):
  - migration and metadata verification on test, replay and dev; `yarn test:db` 548 / 14 files; the seed twice with the canonical digest unchanged; both drift diffs empty;
  - smokes: `smoke:local` 62, `smoke:auth` 4, `smoke:directory` 14, `smoke:p3a` 24, `smoke:p3b` 36, `smoke:p4a` 50, `smoke:p4b` 64, `smoke:p4c` 62, `smoke:p4d` **88** (87 before; its R14-AUD-013 line is in the log), `smoke:p4e` 84, `smoke:p4f` 90, `smoke:p4g` **146** (133 before; four R14-AUD-013 lines);
  - the P1.1 recovery commands; `yarn dev` clean shutdown 4 / 4.

The documentation head's run is reported with the remediation report. _(Push run 36378687232 on `c889e63`, success, both jobs: §39.7.)_

### 38.13 Schema, contract and dependencies

- **Database:** no migration, schema change, backfill or new table. `20260923103912_initial_schema` is still the only migration, and both drift diffs are empty. No stored PromptSnapshot, ValidationRun, NoticeCandidate, CaseRecord, SourceReference, CaseSource, FactSource or AuthorityEvent is updated.
- **Wire contract:** no change. `dependencyDigest` stays the existing lowercase 64-hex string, with no new field, parameter or schema. TB-SCHEMA-API-v1.3.0 has **289 schemas, 144 operations, 99 paths**, OpenAPI `info.version` 1.3.0. The amendment `docs/contracts/TB-SCHEMA-API-v1.3.0/amendment.json` has sha256 `6b74c09aba024dcf8cb2e0a0c6e374bbce17b45298d2aec83cc2e3ab166a1630` (measured, byte-identical). No TB-SCHEMA-API-v1.4.0. `yarn contracts:check` passes.
- **Identifiers:**
  - `TB-PRODUCTION-CONTEXT-DIGEST-v2` is new (ADR-0007, PROPOSED).
  - Unchanged: `TB-TECHNICAL-RULESET-v2` (`technical-ruleset.ts` not in the diff), `TB-PROMPT-TEMPLATE-v1` (`apps/api/src/modules/prompts/**` not in the diff), `TB-CANDIDATE-ARTIFACT-v1`, `PFC-YT-EMAIL-v1.1`, `CONTRACT_BASELINE` = TB-SCHEMA-API-v1.3.0.
- **Dependencies:** none added; lockfile, `.yarnrc.yml`, `.nvmrc` and every `package.json` unchanged.
- **Nothing else outside the change.** `git diff e0a521a..be8d74b` (9 files, +1054 −11): one application file (`context-dependencies.ts`, the constant and its comments), five test files, one new test support file and two smoke scripts. Nothing under `packages/`, `apps/api/prisma`, `apps/api/src/modules/prompts`, `apps/api/src/modules/validation`, `apps/web`, `docs/reference`, `docs/contracts`, `yarn.lock`, `.yarnrc.yml`, `.nvmrc` or any `package.json`. The write rules, the WriteExecutor, the target allowlist, the dev database and the migration tooling are unchanged.

### 38.14 Warnings and open items for the operator (not decided here)

1. **Every current digest changes once at deployment** (§38.2).
   - Each preview kept from before is refused once with 412 and needs a new read.
   - A candidate of a prompt recorded under v1, validated afterwards, reports `CONTEXT.PROMPT_DRIFT` change `IDENTIFIERS` (REVIEW_REQUIRED) when nothing it depends on changed. A changed record gives its own ADDED / REMOVED / CHANGED drift issue instead; REVIEW_REQUIRED either way. A person reviews it; it is not a mandatory re-draft, and no rebinding workflow exists.
   - This is the intended effect of the remediation, not a new rule.
2. **The digest is not self-describing** (ADR-0007 Decision 5). No stored record names the definition that produced its digest. It is established by recomputing under each written-out definition, as the oracle does.
   - A field naming it would be a wire change; this mission forbade one, and none was made.
   - Whether a later contract release should expose it is the operator's decision.
3. **The versioning rule is a review discipline.**
   - The static test pins one definition and one path. It cannot detect a future evaluator change that should bump the identifier but does not.
   - A reviewer of any change to what a context derives from identical rows must apply the rule written at the definition, in CLAUDE.md and in ADR-0007.
4. **The ruleset exception** (§38.7).
   - `TB-TECHNICAL-RULESET-v2` does not flag the literal `TB-PRODUCTION-CONTEXT-DIGEST-v2` in a candidate's text. The application does not itself emit it as generated metadata, template text or UI metadata, but captured or operator-supplied free text can contain it and may flow through context, prompt and candidate text. This is a documented bounded limitation, not evidence that the literal cannot appear. [Corrected 2026-09-28 (R14-AUD-014, documentation only; §39.4): as first recorded this read "The string never reaches a prompt, page or wire, so a draft can only contain it by being typed."]
   - `CONTEXT.PROMPT_DRIFT`'s recorded wording covers a definition-only drift as one of "the digest's contract or context-schema identifiers".
   - Both need a new ruleset version if the operator wants them changed.
5. **ADR-0006 and ADR-0007** stay PROPOSED; their acceptance and TB-SCHEMA-API-v1.3.0's belong to the operator's review. _(Both accepted with documented qualification at R14 final, and TB-SCHEMA-API-v1.3.0 active: §39.)_
6. **Evidence limitations:**
   - the v1-era prompt snapshots and runs of the DB tests and the browser pass were inserted with the tooling account (the application cannot produce them any more);
   - the cross-deployment reproduction ran the earlier deployments' extracted code in a scratch test that was not committed (§38.3);
   - the browser pass shows the 412 path through a within-v2 drift, not a deployment switch (§38.10);
   - the browser seed's scripted instants were stored in local time by the driver (compared as stored).
7. **Pre-existing, non-blocking:** the YN0086 peer-dependency note; `yarn test:transition-baseline` fails by design (not run, not a gate); R14-AUD-011 and -012 recorded as NON_BLOCKING_BACKLOG (§38.1), not changed.

### 38.15 Status (maximum claim of this mission)

| Scope | Status |
|---|---|
| R14-AUD-013 | **REMEDIATED_PENDING_INDEPENDENT_REVIEW** |
| R14-AUD-001, -003, -004, -008, -009, -010 | **CLOSED_VERIFIED_WITH_LIMITS** (the re-audit at `e0a521a`; regressions green, §38.6) |
| R14-AUD-002, -007 | **OPEN_BACKLOG** (unchanged) |
| R14-AUD-011, -012 | **NON_BLOCKING_BACKLOG** (unchanged) |
| R14-AUD-005, -006 | **FUTURE_ASSESSMENT_PREREQUISITE** (unchanged; CandidateAssessment stays blocked until they are resolved) |
| R14 | **HOLD_FOR_REVIEW** — not PASS |
| ADR-0006 | **PROPOSED** (cross-referenced, §8 and the Consequences qualified) |
| ADR-0007 | **PROPOSED** |
| TB-SCHEMA-API-v1.3.0 | the additive historical ValidationRun read, proposed; not accepted as part of R14 final |
| P4G | not VERIFIED_COMPLETE |
| CandidateAssessment | **NOT_STARTED** (unrouted) |
| External action | **NONE** |
| Database / wire / dependencies | no change |

Recommended next action: **an independent Astra re-audit of the exact new head.** _(Done: the independent review of `c889e63` recommended R14 = PASS; R14 final = PASS, §39.)_

## 39. R14 final — PASS, acceptance closeout and merge authorization (2026-09-28, home PC)

Mission TB_R14_FINAL_ACCEPTANCE_CLOSEOUT_AND_MERGE (operator, 2026-09-28), on `feature/r14-validation-run-readback`. This section records the operator's R14 final decision and the closeout before the pull request.
- **Primary source:** the operator's final decision. It relays the recommendation of the independent Astra review of the exact head `c889e63d868b524909882e5e4c0a61620ee86c20`.
- This repository holds no copy of that review; its outcome is recorded here as the operator stated it.
- Sections 1–38 keep the state at their time (for example "R14 = HOLD_FOR_REVIEW" and "ADR-0006 and ADR-0007 PROPOSED" in §38.15).

### 39.1 Result (operator)

| Item | Recorded value |
|---|---|
| **R14** | **PASS** (R14 final, 2026-09-28) — first PASS_WITH_ONE_CONTRACT_REMEDIATION (2026-09-26, §34), then held for the Astra-audit remediations (§36–§38) |
| **P4G** | **VERIFIED_COMPLETE** — `validateCandidate`, `listValidationRuns`, `listValidationIssues`, `getValidationRun` and the technical-validation section of the candidate page; the remediation branch **READY_FOR_MERGE** |
| V13 | remediation **IMPLEMENTED AND VERIFIED** (§35) and **accepted** with ADR-0006 |
| Current R14 blockers | **NONE** |
| R14-AUD-013 | **CLOSED_VERIFIED_WITH_LIMITS** |
| R14-AUD-001, -003, -004, -008, -009, -010 | **CLOSED_VERIFIED_WITH_LIMITS** (unchanged) |
| R14-AUD-014 | **CLOSED_DOCUMENTATION_ONLY** — the documentation qualification of §39.4; not a runtime remediation |
| **ADR-0006** | **ACCEPTED WITH DOCUMENTED QUALIFICATION** — it accepts only the additive historical ValidationRun read `GET /validation-runs/{id}` and the TB-SCHEMA-API-v1.3.0 wire release; it does not define the production-context digest semantics, which ADR-0007 governs |
| **ADR-0007** | **ACCEPTED WITH DOCUMENTED QUALIFICATION** — `TB-PRODUCTION-CONTEXT-DIGEST-v2`, with Decision 7 worded as corrected for R14-AUD-014 |
| **TB-SCHEMA-API-v1.3.0** | **ACTIVE / ACCEPTED** — the accepted v1.2.0 + `docs/contracts/TB-SCHEMA-API-v1.3.0/amendment.json` (sha256 `6b74c09aba024dcf8cb2e0a0c6e374bbce17b45298d2aec83cc2e3ab166a1630`, measured byte-identical, §39.8) |
| `TB-PRODUCTION-CONTEXT-DIGEST-v2` | **ACTIVE** |
| `TB-TECHNICAL-RULESET-v2` | **ACTIVE** (unchanged; runs recorded as v1 stay exactly as recorded) |
| `PFC-YT-EMAIL-v1.1` | **UNCHANGED** |
| CandidateAssessment | **NOT_STARTED**, **HOLD_FOR_PRE_ASSESSMENT_PREREQUISITES** — R14-AUD-005 and -006 are FUTURE_ASSESSMENT_PREREQUISITE (§39.6) |
| Real-case operational use | **NOT authorized** by this engineering acceptance |
| G7 | human-controlled and outside the application |
| Merge | **AUTHORIZED** — pull request `feature/r14-validation-run-readback` → `main`, normal GitHub merge commit (no squash, rebase, force-push or bypass of a failed check; the branch kept), after the exact closeout head and the pull request checks are green. _(Done: pull request #11, merge commit `20367b9`; §40.)_ |
| External action | **NONE**; real case data **0** |

### 39.2 What this acceptance is

**BOUNDED TECHNICAL ACCEPTANCE.** R14 = PASS accepts the engineering scope of P4G, its read-back remediation and the Astra-audit remediations, as verified in §24–§38. It is not:

- whole-repository unconditional assurance;
- legal approval;
- real-case authorization;
- a G1–G6 substantive assessment;
- G7, the actual authorized human review, adoption, signature and sending, outside the application;
- permission to send.

**Astra's coverage, preserved as recorded.**
- The operator's decision describes the final review at `c889e63` as an independent, bounded review.
- The last coverage figures recorded in this repository are those of the continued audit at `fdcda2b` (§37): runtime API, Prisma schema and contracts 100 %; the web source except CSS 100 %; critical tests 65.47 %; the whole critical denominator 70.85 %; `ASTRA_AUDIT = PARTIAL`.
- The operator's decision gives no new figure for `c889e63`, and none is extended to it here.
- This record claims no 100 % whole-repository semantic audit. Every finding closed with limits keeps its limits.

### 39.3 Active engineering identifiers after R14

| Kind | Identifier |
|---|---|
| Wire contract | `TB-SCHEMA-API-v1.3.0` |
| Frozen reference | `TB-SCHEMA-API-v1.0.0` |
| Production form contract | `PFC-YT-EMAIL-v1.1` |
| Production context digest | `TB-PRODUCTION-CONTEXT-DIGEST-v2` |
| Prompt template | `TB-PROMPT-TEMPLATE-v1` |
| Technical ruleset | `TB-TECHNICAL-RULESET-v2` |

Also unchanged:
- `TB-CANDIDATE-ARTIFACT-v1`, the candidate artifact hash, accepted at R13;
- `AppMeta.schemaRelease` = `TB-SCHEMA-API-v1.0.0`, as recorded.

Each identifier names an engineering definition only. None is a legal approval, a policy certification, a G1–G6 review, readiness or READY_FOR_SIGNER.

### 39.4 R14-AUD-014 — the documentation qualification (CLOSED_DOCUMENTATION_ONLY)

- **Finding (as the operator relays it).** Two records overstated where the literal `TB-PRODUCTION-CONTEXT-DIGEST-v2` can appear, implying it cannot appear in a prompt, on the wire or on a page:
  - ADR-0007 Decision 7 and §38.7: it "appears on no wire, in no prompt text and on no page, only inside the hashed preimage";
  - §38.14 item 4: it "never reaches a prompt, page or wire, so a draft can only contain it by being typed".
- **Corrected wording** (the operator's required semantics): "The application does not itself emit `TB-PRODUCTION-CONTEXT-DIGEST-v2` as generated metadata, template text or UI metadata. Captured or operator-supplied free text can nevertheless contain that literal and may flow through context/prompt/candidate text. `TB-TECHNICAL-RULESET-v2` intentionally does not detect that new literal; this is a documented bounded limitation, not evidence that the literal cannot appear."
- **Checked against the source before the correction.**
  - `DEPENDENCY_DIGEST_ALGORITHM` is used once, in the preimage of `dependencyDigest` (`context-dependencies.ts`).
  - No response field, prompt template line or page names it; `apps/web/src` has no occurrence.
  - Recorded free text is carried on the wire, frozen into contexts and prompts, and shown on pages exactly as recorded, so it can contain any literal. Examples: a captured message's body, a candidate's subject and body.
- **Corrected in:**
  - ADR-0007 Decision 7, with its acceptance;
  - §38.7 "Effect";
  - §38.14 item 4;
  - the explanatory comment of the unit test that pins the exception (`tests/api/validation-rules.test.ts`, "the one named exception …") — a comment only; its name, assertions and result are unchanged.

  Each correction keeps what was first recorded.
- **Not changed:**
  - `TB-TECHNICAL-RULESET-v2`: `technical-ruleset.ts` is not in the diff, and there is no `TB-TECHNICAL-RULESET-v3`;
  - every rule and assertion;
  - the application code.

  A ruleset that detects the literal stays backlog (ADR-0007 Decision 7).

### 39.5 Finding dispositions after R14

| Finding | Disposition |
|---|---|
| R14-AUD-001, -003, -004, -008, -009, -010, -013 | **CLOSED_VERIFIED_WITH_LIMITS** |
| R14-AUD-014 | **CLOSED_DOCUMENTATION_ONLY** (§39.4) |
| R14-AUD-002 (a candidate replay after supersession returns the current lifecycle overlay), -007 (the validation-history UI stops after about 1,000 runs) | **OPEN_BACKLOG** — not implemented here |
| R14-AUD-011 (the Revise Source page drops the seconds and milliseconds), -012 (the Owner's legal-subject picker keeps a hidden earlier selection) | **NON_BLOCKING_BACKLOG** — not implemented here |
| R14-AUD-005 (a future plan-source freshness policy), -006 (a future AssessmentSource read-back) | **FUTURE_ASSESSMENT_PREREQUISITE** — not implemented here; they block CandidateAssessment |

### 39.6 CandidateAssessment — hard hold

- CandidateAssessment is **NOT_STARTED** and **HOLD_FOR_PRE_ASSESSMENT_PREREQUISITES**.
- `captureCandidateAssessment` and `listCandidateAssessments` stay unrouted. The API routes 134 business operations, and neither is one of them.
- Not implemented: an AssessmentSource read-back, an assessment UI, readiness, READY_FOR_SIGNER, the unsigned export.
- The next engineering mission after this merge addresses R14-AUD-005 and R14-AUD-006 only. Recommended: TB_PRE_ASSESSMENT_AUD005_AUD006_ARCHITECTURE — not started; it needs its own approval.
- CandidateAssessment is not ready to implement until both are resolved.

### 39.7 Heads

| Name | Commit |
|---|---|
| `R14_ACCEPTED_CODE_HEAD` (the exact head the independent review examined) | `c889e63d868b524909882e5e4c0a61620ee86c20` — the R14-AUD-013 documentation (§38) on the code head `be8d74b`; `git diff be8d74b c889e63` touches only `CLAUDE.md` and `docs/` |
| Its CI | push run [36378687232](https://github.com/TuongChris/tb-notice-production-system/actions/runs/36378687232), 2026-09-28T04:40:06Z–04:48:40Z, **success**, both jobs; logs read (below) |
| `R14_CLOSEOUT_HEAD` | the commit that adds this section (documentation, plus the one test comment of §39.4); its CI run, the pull request and the merge are recorded with the merge. _(Recorded in §40: `f1b6aaf`, push run 36397635020, pull_request run 36398531959, merge commit `20367b9`.)_ |

Run 36378687232, logs read:
- "Non-DB checks (cold install)" (job 108789697897): the reference check and the 27 helper tests, `contracts:check` (3 outputs match), lint "Found 0 warnings and 0 errors.", Prettier clean, `yarn test` 1580 / 52 files, the build, the frozen references and the working tree unchanged.
- "Database, seed and smoke (MySQL 8.4.11)" (job 108789697674):
  - `yarn test:db` 548 / 14 files;
  - the seed twice with the canonical digest `0ee26dc3…b775`; both drift diffs empty;
  - `smoke:local` 62, `smoke:auth` 4, `smoke:directory` 14, `smoke:p3a` 24, `smoke:p3b` 36, `smoke:p4a` 50, `smoke:p4b` 64, `smoke:p4c` 62, `smoke:p4d` 88, `smoke:p4e` 84, `smoke:p4f` 90, `smoke:p4g` 146;
  - the P1.1 recovery commands; `yarn dev` clean shutdown 4 / 4; the final reference check.

### 39.8 Closeout checks

Pre-flight (mission §1), after `git fetch origin`:
- branch `feature/r14-validation-run-readback` at `c889e63…`, equal to its origin, worktree clean;
- `origin/main` = `c73cbdad1fe5d09813525930b4df9ed9123fd9de`, unchanged since the branch was created; the branch 20 commits ahead and 0 behind;
- no pull request of the branch in any state;
- `gh` authenticated as the repository owner's account; `main` has no branch protection and no rulesets; the repository does not delete head branches on merge;
- run 36378687232 completed with success, both jobs;
- ADR-0006 and ADR-0007 PROPOSED; R14 not recorded as PASS.

Integrity (measured):
- `docs/contracts/TB-SCHEMA-API-v1.3.0/amendment.json`: sha256 `6b74c09aba024dcf8cb2e0a0c6e374bbce17b45298d2aec83cc2e3ab166a1630` before and after — byte-identical;
- unchanged, as ADR-0006 §5 lists them: the v1.2.0 and v1.1.0 records (`b5cae658…c294`, `2f4df697…da85`), their READMEs (`f18e69d0…`, `4856068f…`), ADR-0004 (`1c8061c4…`) and ADR-0005 (`f40a8c81…`);
- `docs/reference/**` untouched.

The closeout is one commit. It changes:
- ADR-0006 and ADR-0007: status, acceptance, and Decision 7's qualification;
- the v1.3.0 README's decision, verification and record-integrity lines;
- this record: this section, the header, the status table and the §38 pointers and corrections;
- `CURRENT_STATE.md` and `CLAUDE.md`;
- the one test comment of §39.4.

No product code, test assertion, contract source, generated artefact, release record, migration, lockfile or `docs/reference/**` changes.

Checks on the complete closeout tree before committing (2026-09-28T08:22:24Z–08:24:00Z; repeated after this paragraph was written, same results):
- `yarn reference:check` OK (`MANIFEST.sha256` `42c2a419…` matches the pin);
- `yarn contracts:check` OK (3 generated outputs match the active source);
- `yarn typecheck` exit 0;
- `yarn lint` and `oxlint --deny-warnings --format default`: "Found 0 warnings and 0 errors." (331 files) — **0 warnings**;
- `yarn format:check` clean ("All matched files use Prettier code style!"; one blank line in `CLAUDE.md` was added first, as Prettier's own output for that file showed);
- `yarn test` **1580 / 1580 in 52 files** — unchanged, including `gate-terminology.test.ts` (3 / 3 on the edited records) and "the one named exception …" with its corrected comment.

`yarn test:db` was not rerun because no code changed (the test file's change is a comment); it runs in CI on the closeout head, with every compiled smoke.

## 40. R14 closeout — merge reconciliation (2026-09-28, home PC)

Mission TB_PRE_ASSESSMENT_AUD005_AUD006_ARCHITECTURE (operator, 2026-09-28), first task, recorded on `feature/pre-assessment-aud005-aud006-architecture` after the merge. `P4G = VERIFIED_COMPLETE, MERGED_TO_MAIN`. This is reconciliation only: R14 is not reopened, and nothing of what R14 final accepted changes. Sections 1–39 keep the state at their time (for example "not merged at this record" in §39).

### 40.1 Merge reconciliation (verified with `git` and authenticated `gh`, not assumed)

| Item | Observed value |
|---|---|
| `R14_ACCEPTED_CODE_HEAD` | `c889e63d868b524909882e5e4c0a61620ee86c20` (§39.7) |
| `R14_CLOSEOUT_HEAD` | `f1b6aafbb95a3042d55865f7eb0fc3991dc444b6` — "docs(r14): accept final R14 review and digest v2 decision" (§39; documentation plus the one test comment of §39.4). Push run [36397635020](https://github.com/TuongChris/tb-notice-production-system/actions/runs/36397635020), 2026-09-28T08:29:11Z–08:36:44Z, success: "Non-DB checks (cold install)" (job 108847710764) and "Database, seed and smoke (MySQL 8.4.11)" (job 108847711162). Logs read: `reference:check` and `contracts:check` OK; the 27 helper tests; lint "Found 0 warnings and 0 errors."; Prettier clean; `yarn test` 1580 / 52 files; `yarn test:db` 548 / 14 files; `db:verify` PASS four times; the replay has no pending migration; `smoke:local` 62, `smoke:auth` 4, `smoke:directory` 14, `smoke:p3a` 24, `smoke:p3b` 36, `smoke:p4a` 50, `smoke:p4b` 64, `smoke:p4c` 62, `smoke:p4d` 88, `smoke:p4e` 84, `smoke:p4f` 90, `smoke:p4g` 146; `yarn dev` shutdown 4 / 4; no error annotation in either job |
| Pull request | [#11](https://github.com/TuongChris/tb-notice-production-system/pull/11) `feature/r14-validation-run-readback` → `main`, "R14: Validation read-back and production-context integrity closeout", opened 2026-09-28T08:38:05Z. `headRefOid` = `f1b6aaf` (21 commits); `main` unchanged at `c73cbda` since the branch was created. pull_request run [36398531959](https://github.com/TuongChris/tb-notice-production-system/actions/runs/36398531959), 2026-09-28T08:38:09Z–08:47:25Z, success: "Non-DB checks (cold install)" (job 108850592185) and "Database, seed and smoke (MySQL 8.4.11)" (job 108850592383), with the same results as the push run. Merge state CLEAN before the merge; no required review; `main` has no branch protection |
| `R14_MERGE_METHOD` | **merge commit** — `gh pr merge 11 --merge --match-head-commit f1b6aaf…`. Not squash, not rebase, no bypass of checks, branch not deleted. `20367b9` has two parents, `c73cbda` (previous `main`) and `f1b6aaf`. Message "Merge pull request #11 from TuongChris/feature/r14-validation-run-readback", committed by GitHub, merged 2026-09-28T08:48:34Z by the repository owner's authenticated account |
| `R14_MERGED_MAIN_HEAD` | `20367b92c1ff81415ffa639ddf238ccad1d6b218` |
| Ancestry / content | `git merge-base --is-ancestor f1b6aaf origin/main` → exit 0, and likewise for `c889e63`. The previous `main` `c73cbda` is an ancestor of `f1b6aaf` (the branch started there), so the merge introduced nothing else: the trees of `20367b9` and `f1b6aaf` are identical (`4cffdbfc57d866c9655708c619435b480ee38bdd`; `git diff f1b6aaf 20367b9` empty), and `git log f1b6aaf..origin/main` lists only the merge commit |
| `MAIN_POST_R14_CI` | **PASS** — push run [36399587944](https://github.com/TuongChris/tb-notice-production-system/actions/runs/36399587944) on `20367b9`, 2026-09-28T08:48:37Z–08:57:55Z: "Non-DB checks (cold install)" (job 108854023170) and "Database, seed and smoke (MySQL 8.4.11)" (job 108854022962) both success. Logs read, not only the status: `reference:check` OK (`MANIFEST.sha256` `42c2a419…` matches the pin); the 27 helper tests (27 pass, 0 fail); `contracts:check` OK (3 generated outputs match the active source); lint "Found 0 warnings and 0 errors."; Prettier clean; `yarn test` 1580 / 52 files; the build; `yarn test:db` 548 / 14 files; `db:verify` PASS four times; the replay's second deploy "No pending migrations to apply."; the seed's canonical digest `0ee26dc3…b775` each time; both drift diffs "-- This is an empty migration."; `smoke:local` 62, `smoke:auth` 4, `smoke:directory` 14, `smoke:p3a` 24, `smoke:p3b` 36, `smoke:p4a` 50, `smoke:p4b` 64, `smoke:p4c` 62, `smoke:p4d` 88, `smoke:p4e` 84, `smoke:p4f` 90, `smoke:p4g` 146; the P1.1 recovery commands; `yarn dev` shutdown "PASS (4/4 scenarios)"; the final reference and working-tree checks; no error annotation in either job |

### 40.2 History preserved

Nothing was amended, rebased, rewritten or force-pushed, and no tag or release was created. `feature/r14-validation-run-readback` stays at `f1b6aaf` (local and origin); every earlier phase branch is unchanged. The local `main` was not updated (it stays at `5aa9248`); no commit was made on it.

### 40.3 Status

| Scope | Status |
|---|---|
| R14 review | **PASS** (operator, 2026-09-28, R14 final; §39) |
| P4G_STATUS | **VERIFIED_COMPLETE** |
| P4G_MERGE | **MERGED_TO_MAIN** — P4G by PR #10 (merge commit `c73cbda`, §34) and the R14 remediation and closeout by PR #11 (merge commit `20367b9`, method: merge commit, merged 2026-09-28T08:48:34Z) |
| `MAIN_POST_R14_CI` | **PASS** — `main` push CI run 36399587944, both jobs success, logs read |
| Active contract | **TB-SCHEMA-API-v1.3.0** on `main` (ADR-0006 ACCEPTED with documented qualification; 289 schemas, 144 operations, 99 paths; frozen historical reference TB-SCHEMA-API-v1.0.0; PFC wire id `PFC-YT-EMAIL-v1.1`) |
| Active engineering identifiers | unchanged from §39.3: `TB-PRODUCTION-CONTEXT-DIGEST-v2` (ADR-0007 ACCEPTED with documented qualification), `TB-TECHNICAL-RULESET-v2`, `TB-PROMPT-TEMPLATE-v1`, `TB-CANDIDATE-ARTIFACT-v1` |
| Database / dependencies | **No change** — `20260923103912_initial_schema` is still the only migration; lockfile unchanged |
| Finding dispositions | unchanged from §39.5 — R14-AUD-005 and -006 **FUTURE_ASSESSMENT_PREREQUISITE** |
| CandidateAssessment | **NOT_STARTED**, **HOLD_FOR_PRE_ASSESSMENT_PREREQUISITES** — unrouted (§39.6) |
| Next | Branch `feature/pre-assessment-aud005-aud006-architecture` created from the exact `origin/main` `20367b9` (not from `feature/r14-validation-run-readback`) for mission TB_PRE_ASSESSMENT_AUD005_AUD006_ARCHITECTURE: architecture and specification of R14-AUD-005 and -006 only — no runtime, contract, schema or migration change and no pull request. Its records follow on this branch |
| External action | **NONE**; real case data **0** |
