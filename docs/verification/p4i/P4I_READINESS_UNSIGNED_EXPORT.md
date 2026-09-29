# P4I — Derived readiness and unsigned signer handoff (home PC)

Mission **TB_P4I_READINESS_AND_UNSIGNED_EXPORT_FAST_TRACK** (operator-authorized fast track, 2026-09-29). Branch `feature/p4i-readiness-unsigned-export`, created from the exact `main` head `19a7cb2ee2ce4e88d89e9dedfa286eecdac39b0e` (the P4H merge, pull request #12).

> **INDEPENDENT REVIEW DEFERRED BY OPERATOR** — until the final whole-system audit. The operator accepted ADR-0011 for implementation without an independent review. **P4I is self-verified engineering implementation, not independent assurance.** Nothing here is recorded as independently verified.

**Final engineering acceptance (2026-09-29, recorded later, §24).** The independent Astra final whole-system audit of `abc31fc` put the system on HOLD (§23). Its re-audit of the remediation head `3d43268` recommended PASS; it is a bounded review of the accepted single-PC engineering scope, and the operator accepted it:
- `P4I = VERIFIED_COMPLETE_FOR_ACCEPTED_SCOPE`;
- Readiness and the Unsigned Export **VERIFIED_COMPLETE_FOR_ACCEPTED_SCOPE**; READY_FOR_SIGNER **DERIVED_ONLY**;
- ADR-0011 **ACCEPTED**.

The blockquote above, the status table's rows before its last row ("Final engineering acceptance") and the statuses in §1–§23 describe their time.

P4I routes the **two** contracted, until now unrouted operations of TB-SCHEMA-API-v1.0.0 (unchanged in the active TB-SCHEMA-API-v1.4.0) and adds the readiness section of the candidate page:

- `getCandidateReadiness` (GET `/candidates/{candidateId}/readiness`);
- `exportUnsignedCandidate` (POST `/candidates/{candidateId}/unsigned-exports`).

No wire release, no migration, no schema change; `TB-TECHNICAL-RULESET-v3`, `TB-PRODUCTION-CONTEXT-DIGEST-v2`, `TB-PROMPT-TEMPLATE-v1`, `TB-CANDIDATE-ARTIFACT-v1` and `PFC-YT-EMAIL-v1.1` unchanged. The same mission carries one bounded remediation: the P4B CaseFact `meta.affectedResources` (§9).

Persistent rules (they stay in force; `CLAUDE.md` carries them):

- **READY_FOR_SIGNER is derived, current and pre-signature.** Derived on every read and every export from the current captured records; never stored; never a legal approval, G7, a signature, an adoption, permission to send, a finding of ownership or infringement or a platform outcome. It means only "Ready for authorized human signer review": the candidate stays unsigned and unsent, `signatureState` HUMAN_PENDING, `externalAction` PROHIBITED.
- **One current epoch, derived by the server; nothing latest, default or replacing is chosen; no waiver (D-6 deferred); the six gates are non-compensatory; temporal freshness only from captured boundaries (no age rule).**
- **The unsigned export re-evaluates and hands over exact bytes; a replay rechecks before it releases anything.** No G7, signature, adoption, send, email, SMTP, submission, Drive write, uploader contact or AS_SENT record exists.

## Status by scope (not collapsed)

| Scope | Status |
|---|---|
| P4H merge reconciliation | **DONE** — `P4H_CANDIDATE_ASSESSMENT.md` §23 (commit `6b91bd7`; branch push run 36521490606 success, both jobs) |
| ADR-0011 | **ACCEPTED_BY_OPERATOR · INDEPENDENT_REVIEW_DEFERRED** (§2) |
| Contract | **Unchanged** — TB-SCHEMA-API-v1.4.0 active; 291 schemas, 145 operations, 100 paths; no `CONTRACT_BASELINE` or generated-artifact change (§3) |
| P4I implementation | **IMPLEMENTED_SELF_VERIFIED, READY_FOR_MERGE** — code head `045684a` (§16, §21) |
| Automated tests | **PASS** — `yarn test` 1705 in 57 files, `yarn test:db` 613 in 16 files on the code head `045684a` (§14) |
| Consistency / replay race (§42–§43) | **PASS** (§8) |
| Negative controls (§56) | **PASS** — 14/14 caught on the tests' own assertions, every mutation restored byte-identically (§12); plus one control for each of the two later fixes (§11, §19) |
| Browser verification (§60) | **PASS** — the 15 checks plus supplementary checks; one UI finding (UI-P4I-01, MEDIUM) fixed in `c6d2173` and re-verified in the browser (§11) |
| `smoke:p4i` (§61) | **PASS** — 139 checks in CI (runs 36528861375, 36532150372 and 36533432462) (§13) |
| Full regression (§62) | **PASS** — 21/21 steps exit 0 on the code head `045684a` (and on `c6d2173`), clean tree before and after (§15) |
| Own code review (§63) | **DONE** — no unresolved BLOCKER or HIGH; one MEDIUM (UI-P4I-01) and one LOW (REV-P4I-01) fixed, one LOW backlog, one documented limitation, one open question for the final audit (§19) |
| Branch CI (§65) | **PASS** — the code head `045684a`: push run 36533432462, both jobs success, logs read (§17) |
| Schema / migration | **No change** (§18) |
| Readiness | **IMPLEMENTED** — derived only; never stored |
| READY_FOR_SIGNER | **DERIVED_ONLY** — ready for authorized human signer review; not G7, a signature or permission to send |
| Unsigned export | **IMPLEMENTED** — an unsigned text handoff; nothing is signed or sent |
| G1–G6 | **CAPTURED (P4H) / EVALUATED THROUGH CURRENT RECORDS (P4I)** |
| G7 | **HUMAN_CONTROLLED, NOT IMPLEMENTED** |
| Signature / send | **NOT IMPLEMENTED** |
| External action | **NONE**; real case data **0** |
| Real-case production authorization | **NOT GRANTED** by this mission |
| P4I merge (recorded later) | **MERGED_TO_MAIN** — pull request #13, merge commit `abc31fc`, `main` CI run 36537325354 success, both jobs (§22) |
| Final whole-system audit (recorded later) | **HOLD** at `abc31fc` — R14-AUD-015, -016, -019 and -020 concern P4I; remediated by the final-audit remediation mission, then **pending independent re-audit** (§23); closed at the independent re-audit of `3d43268` (§24) |
| Final engineering acceptance (recorded later) | **P4I = VERIFIED_COMPLETE_FOR_ACCEPTED_SCOPE**; Readiness and Unsigned Export **VERIFIED_COMPLETE_FOR_ACCEPTED_SCOPE**; READY_FOR_SIGNER **DERIVED_ONLY**; R14-AUD-015, -016, -019 and -020 **CLOSED_VERIFIED_WITH_LIMITS**; ADR-0011 **ACCEPTED**. On the independent re-audit of `3d43268`, accepted by the operator 2026-09-29 (§24) |

## 1. Starting point and P4H merge reconciliation

- `origin/main` = `19a7cb2` (the P4H merge commit of pull request #12, parents `20367b9` and `6a7fae7`) at the start and throughout the mission (re-checked before every push); the branch was created from it.
- The reconciliation (mission §4) is recorded in `docs/verification/p4h/P4H_CANDIDATE_ASSESSMENT.md` §23 and committed as `6b91bd7` ("docs(p4h): reconcile PR 12 merge and main CI"): pull request #12 merged with a normal merge commit, the merge tree identical to the closeout head, `main` push CI run 36514894511 success (both jobs, logs read). `P4H = IMPLEMENTED_SELF_VERIFIED, MERGED_TO_MAIN`. Its branch push run 36521490606: success, both jobs.

## 2. Architecture record — ADR-0011

`docs/decisions/ADR-0011-derived-readiness-and-revalidated-unsigned-export.md`, **ACCEPTED_BY_OPERATOR · INDEPENDENT_REVIEW_DEFERRED**. It records: one current epoch; the status precedence; the technical baseline; non-compensatory gates; conflict and head handling; what a PASS head needs; G6 and NMI asks; temporal review freshness (no universal stale age); the exact signature-slot rule; readiness read-only; the export's re-evaluation and refusal order; the replay's re-evaluation; no-store; no G7. Governing sources: frozen INVARIANTS §1–§2 and §5, PFC §8–§12, API_CONTRACT_v1 §5–§7, ADR-0006/0007/0008/0009/0010.

## 3. Contract (no wire release)

Both operations, their request (`ExportUnsigned`) and responses (`Readiness`, `GateSummary`, `UnsignedExport`) exist unchanged since TB-SCHEMA-API-v1.0.0. `yarn contracts:check`: "3 generated outputs match the active source"; the release, inventory and parity tests pass unchanged (291 schemas, 145 operations, 100 paths; the DB boundary test asserts 145). Error codes use the free-string `code` with contracted statuses: the frozen stable `CANDIDATE_NOT_READY` (409), `ARTIFACT_CHANGED` and `CONTEXT_CHANGED` (412); the implementation code `VALIDATION_RUN_CHANGED` (412); `BINDING_ALREADY_SUPERSEDED` (409) reused. No `CONTRACT_CHANGE_REQUIRED` arose. Routed business operations: **139** (137 + 2).

## 4. The readiness algorithm (`modules/readiness/readiness-rules.ts`, pure)

- **Epoch (Decision 1).** E = (candidateId, the stored `artifactSha256`, the CURRENT digest of exactly the prompt snapshot's scope — `validationScope` → `readContextRows` → `assembleContext`, `TB-PRODUCTION-CONTEXT-DIGEST-v2` — and `TB-TECHNICAL-RULESET-v3`). A corrected named binding leaves no readable scope: GET 409 `BINDING_ALREADY_SUPERSEDED`, export 412 `CONTEXT_CHANGED` (Decision 2).
- **Status precedence (Decision 3; `STATUS_TIERS`).** SUPERSEDED (`CANDIDATE_SUPERSEDED`) > BLOCKED (`CASE_ARCHIVED`, `PREPARATION_MODE`, `CONTEXT_INPUT_MISSING`, `CONTEXT_TOO_LARGE`, `ARTIFACT_INTEGRITY_FAILED`, `SIGNATURE_SLOT_INVALID`) > UNVALIDATED (`VALIDATION_MISSING`) > STALE_REVALIDATION_REQUIRED (`VALIDATION_STALE`) > BLOCKED (`VALIDATION_BLOCKED`, `VALIDATION_ERROR`, `ASSESSMENT_INTEGRITY_FAILED`, `G<n>_BLOCKED`) > STALE_REVALIDATION_REQUIRED (`ASSESSMENT_STALE`, `G1_TEMPORAL_REVIEW_STALE`) > REVIEW_REQUIRED (any other code) > READY_FOR_SIGNER exactly when no code is present.
- **Technical baseline (Decisions 4–5).** Only runs of exactly E count (`epochRuns`, latest first by `(createdAt DESC, id DESC)`). No run → `VALIDATION_MISSING`; none of E → `VALIDATION_STALE`. Runs of E are compared by result, coverage manifest and deterministic issues (rule, kind, severity, field path); disagreeing runs → `TECHNICAL_RUN_CONFLICT`, none counts, each run's result code added (R-28). The counted run: BLOCKED → `VALIDATION_BLOCKED`; ERROR → `VALIDATION_ERROR` and `VALIDATION_COVERAGE_INCOMPLETE`; REVIEW_REQUIRED → `VALIDATION_REVIEW_REQUIRED`; a stored BLOCKER or REVIEW_REQUIRED issue is never overlooked; `PLAN.SOURCE_IN_CONTEXT` → `PLAN_SOURCE_NOT_IN_CONTEXT` (never waived); a TECHNICAL_PASS needs every required rule executed and none not executed (`VALIDATION_COVERAGE_INCOMPLETE`, R-08). No waiver, disposition or override exists (D-6).
- **Gates (Decisions 6–7).** Per gate the heads of its chains at exactly E (`currentHeads`): none → UNASSESSED (+`ASSESSMENT_STALE` with history, R-17); several → CONFLICT `GATE_HEADS_UNRECONCILED`, no id (R-15; never the latest PASS); one → its recorded result; a PASS counts only when SCOPE_CONFIRMED_FOR_CANDIDATE (else HOLD `SCOPE_NOT_CONFIRMED`, R-18), with visible performer, rationale and scope — at least one code point that is not white space, a control character or a default-ignorable code point (`ASSESSMENT_RECORD_INCOMPLETE`; REV-P4I-01, `045684a`), a provenance other than MISSING/CONFLICT (`ASSESSMENT_PROVENANCE_UNSUPPORTED`) and intact supports — 1–100 rows naming LINKED links of this case whose sources the current context lists as applying (else BLOCKED `ASSESSMENT_INTEGRITY_FAILED`). Another candidate's assessments never count (R-19). Non-compensation: five PASS gates and one HOLD, BLOCKED, MISSING, CONFLICT or UNASSESSED are never READY (R-10…R-14).
- **G6 and NMI asks (Decision 8).** G6 is independent of the run. For an NMI_REPLY a counted G6 PASS needs ask dispositions (`G6_ASK_DISPOSITIONS_MISSING`), each of exactly the prompt's parent binding (else `ASSESSMENT_INTEGRITY_FAILED`), none `LEGAL_REVIEW_REQUIRED` (`G6_ASK_LEGAL_REVIEW_REQUIRED`), every cited source applying now (`G6_ASK_SOURCE_NOT_APPLICABLE`); an INITIAL candidate carries none. Nothing is fabricated.
- **Temporal freshness (Decision 9).** Boundaries: the pinned versions' and coverages' `effectiveOn`/`expiresOn`, the selected signer's coverage-signer `effectiveOn`/`endsOn`, each uncorrected event at its `effectiveAt`, else `effectiveOn`. An instant: stale exactly when `assessedAt < e ≤ now` (R-23/R-24, digest unchanged). A date D = `[(D−1)T10:00Z, (D+1)T12:00Z)`: a review inside it, or an evaluation inside it with an earlier review, → `TEMPORAL_BOUNDARY_AMBIGUOUS` (R-25). A null or future `assessedAt` is never `createdAt` → `G1_REVIEW_TIME_UNKNOWN`. A selected start date ahead → `AUTHORITY_EFFECTIVE_DATE_NOT_REACHED`. No age rule (R-26: a year later with no boundary, unchanged).
- **Signature slot (Decision 10).** HUMAN_PENDING and the exact slot exactly once in the body, never in the subject (the token and counting of `SIGNATURE.PENDING_SLOT_ONCE`); the body and artifact hashes recomputed (`ARTIFACT_INTEGRITY_FAILED`) (R-21).
- **Reason codes (Decision 12).** `READINESS_REASON_ORDER` and `GATE_REASON_ORDER` are pinned by unit tests (the mission's §29 minimum set included); a gate lists `GATE_<STATUS>` plus its causes and is empty exactly when PASS; the readiness lists the candidate-, context- and run-level codes, then `G<n>_<STATUS>` plus the causes. No code carries record content.

## 5. Read-only proof (R-27)

GET is one REPEATABLE READ snapshot of plain reads. DB test R-27: repeated reads leave every business row byte-identical — no audit event, idempotency record, row version or context revision; P1's session activity touch is the only write. No readiness table, column, flag or `approvedAt` exists (the test scans the schema's tables and columns); no migration.

## 6. The unsigned export (Decisions 14–16)

- One short SERIALIZABLE transaction through the WriteExecutor (≤ 3 retries): the candidate (404) → its CaseRecord FOR UPDATE → the candidate FOR SHARE → the same loader and rules at the write instant → 412 `ARTIFACT_CHANGED` → 412 `CONTEXT_CHANGED` → 409 `CANDIDATE_NOT_READY` {status, reasonCodes} → 412 `VALIDATION_RUN_CHANGED` → audit → response. Lock order CaseRecord → NoticeCandidate; the case row is never changed; nothing external happens in the transaction or a retry.
- **Exact bytes (E-05…E-11).** The stored subject, envelope and body — CRLF, trailing spaces, NFD — both hashes (recomputed in the test), HUMAN_PENDING, `sendPerformed` false, the readiness evaluated and `exportedAt` = its instant.
- **Audit (E-12/E-13).** Exactly one `EXPORT_UNSIGNED` per export: identifiers, both hashes, digest, ruleset, run, status, the six gates' assessment ids, format, HUMAN_PENDING, `sendPerformed` false, `externalAction` PROHIBITED, the instant; subject and body only as `{redacted, codePoints}`. No SIGNED, SENT, SUBMITTED, NOTICE_SENT or AS_SENT record; no export table (E-20).
- **No-store (E-19).** Every response `Cache-Control: no-store`; the export sets it once more.

## 7. Replay (Decision 17; mission §39)

`WriteOptions.guardedReplay` (this operation only): the idempotency record keeps `{meta, kept: {readiness, exportedAt}}` — never the subject, envelope or body. Every replay re-evaluates the current readiness (one REPEATABLE READ snapshot), applies the same refusals to the original request and returns the historical response rebuilt from the immutable candidate only while it is still READY_FOR_SIGNER with the same artifact, digest and run; otherwise the present refusal — nothing released, nothing written (E-14…E-18). The same key with another body is 409 `IDEMPOTENCY_CONFLICT` (E-15). Unit tests: two `guardedReplay` tests in `tests/api/write-executor.test.ts`.

## 8. Consistency and races (§42–§43)

DB tests with the `READINESS_OBSERVER` seam:

- **§42** — t0 READY, export with key K; t1 a REVOCATION event (digest moves): the same request with K → 412 `CONTEXT_CHANGED`, no body or hash in the response, the first export's audit event and completed record unchanged; after a passed timestamp boundary (digest unchanged) → 409 `CANDIDATE_NOT_READY`; after the candidate's supersession → 409 SUPERSEDED.
- **A/D** — a newer source revision or a new authority event committed after the case lock is seen by the export and refused 412; one attempted after the export read the records waits for its commit (SERIALIZABLE).
- **B** — a successor assessment recorded before the export is re-evaluated (the old PASS head does not slip through); one attempted during the export waits for the case lock.
- **C** — a candidate superseded before the export is never exported; a supersession attempted during the export waits, and a replay afterwards refuses.
- A failed audit rolls the export back and keeps nothing for the key.

## 9. P4B `affectedResources` remediation (§46)

Pre-existing MEDIUM (found during P4H): a CaseFact create or revision listed the fact, the case and one FactSource per support, so 99 or 100 supports produced 101 or 102 entries — over ResponseMeta's 100. API_CONTRACT_v1 §6 says responses "identify affected root versions in meta"; the response now names the affected roots only — the CaseFact and the CaseRecord (`created()` adds the primary; `caseAffected` the case). The FactSource rows are stored, audited and read back (`getCaseFactSources`) exactly as before; nothing is truncated; no bound changes; no client read the child entries. No `CONTRACT_SEMANTICS_CONFLICT`. DB test: 0, 98, 99 and 100 supports for a create and a revision, every response valid against `ResponseMetaSchema` with exactly `[CaseRecord, CaseFact]`, every support recorded and read back.

## 10. UI (`apps/web/src/app/cases/readiness.tsx`)

- The "Readiness" section of the candidate page (after the G1–G6 review record). Nothing is read until "Evaluate current readiness"; the three qualifiers are always shown.
- The status in words — READY_FOR_SIGNER only as "Ready for authorized human signer review" with "This candidate remains unsigned and unsent. An authorized human must review, adopt, sign and send outside this application." and "Human review/adoption/signature/send are still required outside the application." — in a neutral ruled box (no success or approval treatment). The artifact, digest, ruleset, instant, HUMAN_PENDING and PROHIBITED; the technical result and counted run apart from the six gate summaries; every reason code with neutral copy (an unknown code as it is).
- "Prepare unsigned handoff" only while the evaluation shown is READY_FOR_SIGNER, sent with exactly its artifact, digest and run. A 412 or 409 is shown exactly ("Context changed. Evaluate the current readiness before preparing the handoff again." / "Not ready now. The server evaluated the readiness again: …" with its reasons, then "No unsigned handoff was prepared."), never retried; the outdated evaluation is no longer shown — never as current: "The earlier evaluation is no longer current, so it is not shown. Evaluate the current readiness again." (UI-P4I-01, `c6d2173`) — and only a new evaluation is offered. A lost reply is replayed with the same key.
- The handoff: UNSIGNED and NOT SENT labels; From, To, Reply-To; subject and body as plain text (the body in a focusable `<pre>`); both hashes; "Send performed: No — nothing was sent"; the readiness evaluated (status, digest, run, counted reviews, instant) and when it was prepared; "Copy body text" to the local clipboard only. A new evaluation clears it. No send, sign, approve or G7 action.
- Focus moves to the evaluation's outcome and to the handoff's outcome; reason codes and ids wrap (a list, not a table). The assessment section's two table scrollers became focusable named regions (the `.table-frame` backlog, where these tables are touched).
- Web tests `tests/web/p4i.test.tsx` (10); the fake server re-reads a stated readiness on every export attempt and replay (`tests/web/support.tsx`).

## 11. Browser verification (Playwright MCP, mission §60)

Evidence: `evidence/p4i-playwright-mcp-verification.txt`, screenshots `evidence/screenshots/p4i-01…07-*.png`. `yarn ui:sandbox` only (the compiled API on `tb_notice_test` plus the built web app; the synthetic sandbox user; the Playwright MCP isolated headless profile), 2026-09-29 06:14–06:29 UTC, two sandbox runs: run 1 built from `22fbd19`, run 2 from `c6d2173`. Three synthetic worlds seeded through the compiled API (a scratchpad script, not committed): a DRAFTING prompt, a candidate whose body carries CRLF, trailing spaces, NFD and the slot once, a TECHNICAL_PASS run under `TB-TECHNICAL-RULESET-v3` and six PASS reviews at that exact epoch; "mutate" records one authority event on the pinned mandate.

- **The 15 checks — PASS.** DRAFTING candidate (1); the TECHNICAL_PASS v3 run (2); six PASS reviews at the evaluated digest (3); nothing read before "Evaluate current readiness", then READY_FOR_SIGNER as "Ready for authorized human signer review" with its qualifiers, the technical result apart from the six gates, no success treatment (4, 5); the handoff — UNSIGNED, NOT SENT, From/To/Reply-To, the body whose displayed text hashes to the stored body SHA-256 with the slot exactly once, "Send performed: No — nothing was sent" (6–8); after "mutate" the evaluation is STALE_REVALIDATION_REQUIRED with the new digest, VALIDATION_STALE and every gate UNASSESSED/ASSESSMENT_STALE (9, 10); the first export's key replayed after the change → 412 `CONTEXT_CHANGED` with only `{error}` — no body, slot, subject or address (11); the run, the six reviews and the candidate unchanged after a reload (12); no sign, send, adopt, approve, submit, retract or G7 control (13); 390 px without horizontal page scroll for the stale evaluation and the handoff (14); keyboard only from the previous control: Tab/Enter to evaluate (focus on the outcome), to prepare (focus on the handoff), to the focusable body and "Copy body text" (15; the copy itself was not activated, to leave this computer's clipboard untouched — covered by the web tests).
- **Supplementary.** A same-key export while READY returned the same historical response twice (one audit event); a read-only count afterwards found exactly three `EXPORT_UNSIGNED` events for the three first exports (each `sendPerformed` false, `externalAction` PROHIBITED, HUMAN_PENDING), three completed idempotency records and nothing from the replay or the refusals; every browser request stayed on http://localhost:5173/; console errors only the expected pre-login 401s and deliberate 412s.
- **Finding UI-P4I-01 (MEDIUM, own finding, FIXED).** Refusing a handoff (412 after "mutate") left the earlier evaluation on screen as "Current readiness: Ready for authorized human signer review" with its "Current dependency digest", only annotated as changed — although the server had just refused because it was no longer current (the P4G rule: an earlier digest is never shown as current). Fix `c6d2173`: the evaluation is replaced by "The earlier evaluation is no longer current, so it is not shown. Evaluate the current readiness again."; the two refusal web tests assert that no status, digest or READY wording remains (negative control: the old rendering fails both on that assertion; restored byte-identically); re-verified in sandbox run 2 (screenshot 07).
- Cleanup: each run ended with "sandbox rows deleted; tb_notice_test is empty again"; `yarn db:verify test --expect-empty` PASS (0 domain rows); the password file deleted, the browser closed; no password, cookie or CSRF token recorded.

## 12. Negative controls (mission §56)

Evidence: `evidence/p4i-negative-controls.txt`. Each control mutated the implementation of the working tree equal to `a1fb97e`, ran the tests that must catch it (unit and DB) and restored the file byte-identically (SHA-256 compared). **14/14 caught on the tests' own assertions:** 01 the latest PASS among conflicting heads (R-15) · 02 assessments of a stale epoch · 03 a REVIEW_REQUIRED run counted · 04 `notExecutedRuleIds` ignored · 05 five of six gates · 06 a null `assessedAt` replaced by `createdAt` · 07 temporal boundary crossings ignored · 08 the signature-slot check removed · 09 readiness cached per candidate (the current-drift test) · 10 an export without the current readiness · 11 a replay releasing the old export without a recheck · 12 `sendPerformed` true · 13 a SENT audit action instead of `EXPORT_UNSIGNED` · 14 every FactSource child in `affectedResources` (the P4B bound test). Reruns are recorded, not hidden: 05's first unit filter matched nothing (`-t` is a regular expression); 13's first DB run failed in a query helper, so the test was strengthened to assert the candidate's exact audit actions (`22fbd19`) and caught it on that assertion; 01 was refined into a faithful "latest PASS" mutation. The UI fix `c6d2173` has its own control (§11).

## 13. `smoke:p4i` (mission §61)

`scripts/local/p4i-smoke.ts` (`yarn smoke:p4i`, CI only: it writes synthetic records into the disposable CI `tb_notice_dev`, and refuses unless `CI=true`), run after `smoke:p4h` in the database job against the compiled API. **139 checks, PASS** in every branch run (36528861375 on `a1fb97e`, 36532150372 on `c6d2173`, 36533432462 on `045684a`; every check line in `evidence/p4i-ci-run-36533432462.txt`):

- session protection (401 without a session, 403 without Origin) and login;
- UNVALIDATED (`VALIDATION_MISSING` and G1…G6 UNASSESSED) → REVIEW_REQUIRED (a run, no reviews) → five PASS reviews → only `G6_UNASSESSED` (no compensation) → six → READY_FOR_SIGNER with the exact epoch, run and heads;
- reads write nothing (audit, idempotency and every counted table unchanged); the stale artifact, stale digest and wrong run refused 412 and writing nothing;
- the export: exact bytes (CRLF, trailing space, "café", the slot once), both hashes, HUMAN_PENDING, `sendPerformed` false, one `EXPORT_UNSIGNED` audit event and one idempotency record; the same key replayed equal; another body with that key 409 `IDEMPOTENCY_CONFLICT`;
- a second G3 PASS head → `G3_CONFLICT` and `GATE_HEADS_UNRECONCILED`; the export 409 and the old key's replay 409 without a body; a BLOCKED-run candidate and a REVIEW_REQUIRED-run candidate never READY;
- a REVOCATION event → STALE, the old key's replay 412; a second world whose authority event takes effect after the review: READY, an export, then past the boundary STALE (`G1_UNASSESSED`, `G1_TEMPORAL_REVIEW_STALE`) with the same digest and the old key 409;
- 404 for sign, adopt, send, POST readiness, GET unsigned-exports and a case G7 route; `Cache-Control: no-store` on every response; logout.

The earlier smokes' totals changed only by their probes of the now-routed operations: `smoke:p4d` 85, `smoke:p4e` 81 and `smoke:p4f` 88 (86, 82 and 89 at P4H: two "readiness/export unrouted" probes removed, one `POST /candidates/{id}/send` 404 probe added); `smoke:p4g` 143 and `smoke:p4h` 149 (145 and 151: two removed); `smoke:p4b` 64 and `smoke:p4c` 62 unchanged (one unsigned-export probe replaced by a send probe); `smoke:local` 71 (67: the readiness/export boundaries became session and Origin checks, plus sign and send 404 probes).

## 14. Tests and totals

New: `tests/api/readiness-rules.test.ts` (57), two `guardedReplay` tests in `tests/api/write-executor.test.ts`, `tests/db/p4i-http.test.ts` (32), the P4B boundary test (1), `tests/web/p4i.test.tsx` (10), `scripts/local/p4i-smoke.ts`. Updated: the earlier DB suites' and smokes' unrouted probes (the readiness and export routes are routed; sign, adopt and send probes stay 404), the route inventory (139 business operations), `smoke:local`'s P4I session boundaries.

On the working tree equal to `a1fb97e`, before those commits: `yarn test` **1705 in 57 files**; `yarn test:db` **613 in 16 files** (600 s); `yarn typecheck`, `yarn lint` / `oxlint --deny-warnings` ("Found 0 warnings and 0 errors."), `format:check`, `reference:check`, `contracts:check` — all exit 0. The same totals on the code head `045684a` in the sweep (§15) and in CI (§17): the later commits strengthened existing tests and added no test case.

## 15. Full regression sweep (mission §62)

Evidence: `evidence/p4i-first-pc-sweep.txt`. The code head `045684a` checked out clean in a scratchpad worktree (`yarn install --immutable`), the 21 steps of the earlier sweeps, 2026-09-29 06:52–07:05 UTC: **21/21 exit 0**, the tree clean before and after — `reference:check` and `reference:helper-tests` (27/27), `contracts:check`, `typecheck`, `lint` and `oxlint --deny-warnings` ("Found 0 warnings and 0 errors."), `format:check`, `yarn test` 1705 in 57 files, `yarn test:db` 613 in 16 files, `db:verify test --expect-empty` and `db:verify dev` PASS, `db:status` test and dev up to date, both drift diffs empty, `build` (entry chunk 332.70 kB, candidates chunk 100.88 kB; no Zod runtime marker in any chunk), `smoke:local` 71 checks, `dev:verify-shutdown` 4/4, `reference:check` and `db:verify test --expect-empty` again after. The same 21 steps passed on `c6d2173` (06:35–06:47 UTC) with the same totals. Nothing was written to `tb_notice_dev`; the compiled smokes that write records run only in CI (§17). `yarn test:transition-baseline` is not a gate and was not run.

## 16. Commits

| Commit | Content |
|---|---|
| `baec060` | docs(p4i): ADR-0011 |
| `d28565d` | feat(p4i): the readiness module, the WriteExecutor's `guardedReplay`, the error builders, the unit tests |
| `c7b23ab` | fix(p4b): CaseFact `affectedResources` — the affected roots only, with the boundary test |
| `dd86be8` | test(p4i): `tests/db/p4i-http.test.ts`, the earlier suites' route inventories, the readiness observer seam |
| `e82bf8d` | test(p4i): `smoke:p4i`, its CI step and package script; the earlier smokes and `smoke:local` |
| `a1fb97e` | feat(p4i): the readiness section and unsigned handoff; web tests |
| `22fbd19` | test(p4i): the export audit test asserts the candidate's exact audit actions (from NC-P4I-13) |
| `c6d2173` | fix(p4i): a refused handoff no longer shows the outdated evaluation as current (UI-P4I-01) |
| `045684a` | fix(p4i): invisible-only attribution never counts as visible text (REV-P4I-01) — **the code head** |

The first six commits were verified together on the working tree equal to `a1fb97e` (§14), not one by one: between `d28565d` and `dd86be8` the earlier DB suites still expect the readiness and export routes to be 404, so those intermediate trees fail those tests. The later three were verified on their own trees: `22fbd19` (test only) by the NC-P4I-13 rerun against the database and, pushed together with `c6d2173`, by that head's sweep and CI; `c6d2173` and `045684a` each by a full sweep and a branch CI run (§15, §17). The documentation follows in a documentation commit.

## 17. Branch CI (mission §65)

Evidence: `evidence/p4i-ci-run-36533432462.txt` (extracted from both job logs with `gh api …/actions/jobs/<id>/logs`). Every push waited for the previous run to finish.

| Head | Run | Result |
|---|---|---|
| `6b91bd7` (the P4H reconciliation) | 36521490606 | success, both jobs |
| `a1fb97e` | 36528861375 | success, both jobs; `smoke:p4i` 139 checks |
| `c6d2173` | 36532150372 | success, both jobs; the same totals as below |
| `045684a` — **the code head** | **36533432462** | **success, both jobs** (06:53:01Z–07:05:01Z), logs read |

On `045684adc114462f58ffab2382fd885cc53050ea`: `yarn test` 1705 in 57 files; `yarn test:db` 613 in 16 files; `smoke:p4i` 139 checks and every other compiled smoke passing (auth 4, directory 14, p3a 24, p3b 36, p4a 50, p4b 64, p4c 62, p4d 85, p4e 81, p4f 88, p4g 143, p4h 149), `smoke:local` 71, the P1 admin recovery checks; lint "Found 0 warnings and 0 errors."; `format:check`, `reference:check`, `reference:helper-tests` 27/27 and `contracts:check` ("3 generated outputs match the active source") OK; both drift diffs empty; the seed canonical (digest `0ee26dc3…b775`, idempotent on the second run); `dev:verify-shutdown` 4/4; the last step's `git diff --exit-code` and porcelain check passed (the working tree stayed clean); no "FAIL" line in either log. The documentation commit after the code head, its run, the pull request's run and the post-main run are reported with the mission's final report (a commit cannot record its own run).

## 18. Schema, migration, contract and dependencies

- **Schema / migration: none.** `20260923103912_initial_schema` (sha256 `b54c36fd…6515`) is still the only migration; no readiness or export table, column or flag.
- **Contract: none** (§3). **Dependencies: none** (lockfile unchanged).

## 19. Own code review (mission §63)

Evidence: `evidence/p4i-own-code-review.txt`. Claude's own review of its own implementation, not an independent review. The web page, smokes, CI step, P4B change and error builders were reviewed directly; the API readiness rules, loader, service and `guardedReplay` by an adversarial read-only subagent pass instructed with ADR-0011 as the authority, whose every item I verified against the code, the ADR, the mission, INVARIANTS §2 and PFC §6 before classifying it. **No unresolved BLOCKER or HIGH finding.**

| Id | Severity | Finding | Disposition |
|---|---|---|---|
| UI-P4I-01 | MEDIUM | After a refused handoff the earlier evaluation stayed on screen as "Current readiness: Ready…" with its "Current dependency digest" | **FIXED** `c6d2173` (web tests, negative control, browser re-check; §11) |
| REV-P4I-01 | LOW | The attribution check `/\S/u` counted zero-width, bidi, soft-hyphen, BOM, control and filler code points as visible text, so a PASS whose texts showed nothing could count (ADR-0011 Decision 7) | **FIXED** `045684a`: visible = a code point that is not White_Space, Cc or Default_Ignorable_Code_Point; unit test with a negative control; capture unchanged (such a review stays recorded and is HOLD `ASSESSMENT_RECORD_INCOMPLETE`) |
| REV-P4I-02 | LOW | Under SERIALIZABLE the export's first candidate read is share-locked before the case's FOR UPDATE, while `supersedeCandidate` locks case then candidate: a possible deadlock, detected by InnoDB and retried by the WriteExecutor (≤ 3, then 409 `RETRYABLE_TRANSACTION_CONFLICT`); correctness holds; the same pattern as P4H's capture | **BACKLOG** (reasoned, not reproduced) |
| OBS-P4I-01 | limitation | One ERROR run and a later TECHNICAL_PASS run of the same epoch disagree → `TECHNICAL_RUN_CONFLICT`, BLOCKED until the epoch changes (ADR-0011 Decision 4) | **DOCUMENTED** (§20) |
| OBS-P4I-02 | question | A counted G6 PASS on a reply accepts REQUIRES_DOCUMENT and MISSING_FACT dispositions; only LEGAL_REVIEW_REQUIRED holds it (mission §21, ADR-0011 Decision 8). PFC §6 ("… do not cure an outstanding material document/fact requirement") could be read to hold those too | **OPEN** for the operator / the final independent audit; no domain decision taken here |

## 20. Warnings, backlog and limitations

- **Independent review deferred.** Every P4I status is self-verified.
- **Captured records only.** Readiness is only as current as the captured records: a source or authority change that was never captured cannot be detected (the page says so).
- **Permanent gate CONFLICT at one epoch (backlog).** Two supersession chains of one gate at the same epoch cannot be merged (a successor supersedes one predecessor, D-2), so the gate stays CONFLICT until the epoch changes; a reconciliation workflow needs its own ADR.
- **Baseline strictness (P4H W-2).** READY_FOR_SIGNER needs the prompt's context to be the current context; after any context change a new run and new reviews (and, when the context changed after the prompt, a new prompt and candidate) are needed while D-6 stays deferred.
- **A G1 review time is required** once the selected authority carries a reached boundary; a missing time is never guessed.
- **One ERROR run blocks its epoch (OBS-P4I-01).** An ERROR run and a later TECHNICAL_PASS run of the same epoch disagree (`TECHNICAL_RUN_CONFLICT`); the epoch stays BLOCKED until it changes. An ERROR run arises only when a rule throws while running. *(Confirmed by the final audit as R14-AUD-015 and remediated since, pending independent re-audit — §23.)*
- **G6 asks with an outstanding document or fact (OBS-P4I-02, open question).** REQUIRES_DOCUMENT and MISSING_FACT do not hold a counted G6 PASS on a reply; only LEGAL_REVIEW_REQUIRED does (ADR-0011 Decision 8). Whether PFC §6 requires more is left to the operator and the final independent audit. *(Answered by the final audit as R14-AUD-016, HIGH: they must hold G6; remediated since, pending independent re-audit — §23.)*
- **Lock-order retry (REV-P4I-02, LOW backlog).** A concurrent supersession can deadlock with an export; InnoDB detects it and the WriteExecutor retries (at most 3 attempts). The same pattern as P4H's capture.
- **Visible text (REV-P4I-01, bounded).** A character Unicode classes as a graphic symbol but that renders blank in common fonts (e.g. U+2800) still counts as visible.
- P4H backlog unchanged: W-3 (the `PLAN.SOURCE_IN_CONTEXT` message text; the readiness copy never presents a review as clearing it), O-1, O-3; R14-AUD-002 and -007 OPEN_BACKLOG; R14-AUD-011 and -012 NON_BLOCKING_BACKLOG. The `.table-frame` backlog is closed where the readiness and assessment tables are touched; other pages' scrollers are unchanged.

## 21. Status (maximum claim of this mission)

Before the merge: `P4I = IMPLEMENTED_SELF_VERIFIED, READY_FOR_MERGE`. After the merge and post-main CI: `P4I = IMPLEMENTED_SELF_VERIFIED, MERGED_TO_MAIN` — never independently verified. Next mission (recommended, not started): **TB_FINAL_WHOLE_SYSTEM_INDEPENDENT_AUDIT_AND_CLOSEOUT**.

## 22. P4I merge reconciliation (recorded by mission TB_FINAL_CLOSEOUT_SCOPED_REMEDIATION_AUD015_TO_AUD020)

- Pull request #13 (`feature/p4i-readiness-unsigned-export` → `main`, "P4I: Derived readiness and unsigned signer handoff") was merged with a normal merge commit **`abc31fc350311aa21945776ec266ef48935e46c9`** at 2026-09-29T07:33:15Z; parents `19a7cb2` (the P4H merge) and the P4I documentation head `c501d5a` ("docs(p4i): readiness and unsigned export record, evidence and state"). The merge tree `bb5e14d` is identical to `c501d5a`'s: nothing but the reviewed branch entered `main`. The branch is kept.
- `main` push CI run **36537325354**: success, both jobs ("Database, seed and smoke (MySQL 8.4.11)" 07:33:20Z–07:45:22Z; "Non-DB checks (cold install)" 07:33:20Z–07:35:55Z).
- `P4I = IMPLEMENTED_SELF_VERIFIED, MERGED_TO_MAIN` — never independently verified.

## 23. The final whole-system audit and its remediation (cross-reference)

The independent Astra final whole-system audit of `abc31fc` returned **FINAL_ENGINEERING_AUDIT = HOLD**, **SYSTEM_SETUP_STATUS = NOT_VERIFIED_COMPLETE**, with six confirmed blockers; four concern P4I directly:

| Finding | P4I subject |
|---|---|
| R14-AUD-015 (MEDIUM) | OBS-P4I-01 — one ERROR run blocked its epoch for good (ADR-0011 Decision 4) |
| R14-AUD-016 (HIGH) | OBS-P4I-02 — a G6 PASS of a reply counted with REQUIRES_DOCUMENT or MISSING_FACT asks (Decision 8) |
| R14-AUD-019 (MEDIUM) | the readiness section kept a READY evaluation and a handoff after a same-page write (§10) |
| R14-AUD-020 (HIGH) | the export replay evaluated its reads at the request's earlier instant (§7, Decision 17) |

(R14-AUD-017 concerns the P4H review form, `P4H_CANDIDATE_ASSESSMENT.md` §25; R14-AUD-018 the unrouted contracted audit read.) All six were remediated by mission TB_FINAL_CLOSEOUT_SCOPED_REMEDIATION_AUD015_TO_AUD020 on `feature/final-audit-remediation-aud015-aud020`, with ADR-0011 revised (**REVISED_FOR_AUD_015_AUD_016 · PENDING_INDEPENDENT_REAUDIT**): each **REMEDIATED_PENDING_INDEPENDENT_REVIEW**; FINAL_ENGINEERING_AUDIT **HOLD_FOR_REAUDIT**; SYSTEM_SETUP_STATUS **NOT_VERIFIED_COMPLETE**. The P4I sections above describe the behaviour as merged at `abc31fc` and are not rewritten; the corrected behaviour and its evidence are in `docs/verification/final-audit-remediation/FINAL_AUDIT_REMEDIATION_AUD015_AUD020.md`.

## 24. Final engineering acceptance (2026-09-29)

Recorded by mission TB_FINAL_ACCEPTANCE_CLOSEOUT_MERGE_AND_POST_MAIN_VERIFICATION (`docs/verification/final-audit/FINAL_ENGINEERING_AUDIT_CLOSEOUT.md`); §1–§23 are unchanged.

**The review.** The independent Astra re-audit of `3d432688a20266548447d71029830a4bbf85e38d` — the final-audit remediation head — recommended PASS, and the operator accepted it.
- It is a bounded review of the accepted single-PC engineering scope: whole-critical coverage 73.18 %, the whole repository PARTIAL.
- The auditor re-ran no CI, test suite, application or database.

| Scope | Final status |
|---|---|
| P4I | **VERIFIED_COMPLETE_FOR_ACCEPTED_SCOPE** — on `main` since `abc31fc`; its corrections (R14-AUD-015, -016, -019, -020) reach `main` with the closeout merge (PENDING in the repository record) |
| Readiness | **VERIFIED_COMPLETE_FOR_ACCEPTED_SCOPE** — derived on every read from the current captured records, never stored |
| READY_FOR_SIGNER | **DERIVED_ONLY** — "Ready for authorized human signer review"; never G7, a signature, an adoption, legal approval or permission to send |
| Unsigned Export | **VERIFIED_COMPLETE_FOR_ACCEPTED_SCOPE** — an unsigned text handoff: HUMAN_PENDING, `sendPerformed` false, `externalAction` PROHIBITED |
| R14-AUD-015 (OBS-P4I-01), -016 (OBS-P4I-02), -019, -020 | **CLOSED_VERIFIED_WITH_LIMITS** |
| ADR-0011 | **ACCEPTED** — independent final re-audit **VERIFIED_WITH_LIMITS** at `3d43268`, for its reviewed engineering semantics. Human G6 truth and completeness stay an attributable human responsibility; the application sees only captured state; uncaptured external changes are not automatically detectable |
| REV-FINAL-04 / ask-set completeness | **ACCEPTED_FOR_CURRENT_MODEL** / **ACCEPTABLE_HUMAN_G6_RESPONSIBILITY** — no presence rule, no NLP |
| New finding in this phase's export path | **R14-AUD-022** (LOW, NON_BLOCKING, OPEN_BACKLOG): a late export response can clear a newer export's idempotency key before the generation guard. It releases no stale handoff and bypasses no readiness check |
| Backlog | unchanged: REV-P4I-02 (lock-order retry); two independent assessment heads of one gate at one epoch (CONFLICT until an explicit reconciliation or an epoch change); D-6 deferred; the U+2800 visible-text observation; the remaining app-wide `.table-frame` scope |
| G7 / external action | **AUTHORIZED HUMAN ONLY · NOT IMPLEMENTED**; signature and send **NOT IMPLEMENTED** / **PROHIBITED** until actual G7 and a separate operator authorization; CASE_READINESS_STATUS case-specific; no actual case evaluated |
