# Final-audit remediation — R14-AUD-015 … R14-AUD-020 (home PC)

Mission **TB_FINAL_CLOSEOUT_SCOPED_REMEDIATION_AUD015_TO_AUD020** (operator, 2026-09-29): remediate exactly the six blockers the independent Astra final whole-system audit found at `abc31fc350311aa21945776ec266ef48935e46c9` (FINAL_ENGINEERING_AUDIT = HOLD, SYSTEM_SETUP_STATUS = NOT_VERIFIED_COMPLETE). Branch `feature/final-audit-remediation-aud015-aud020`, created from that exact `main` head.

> **This mission remediates; it does not close the final audit.** Every status below is self-verified engineering by the implementer — not an independent review and not independent assurance. The next step is the **independent Astra re-audit of the exact remediation SHA**. No pull request, merge, tag or release was made or is authorized by this mission.

**Recorded later (2026-09-29): the independent re-audit and the final acceptance.** The independent Astra re-audit of this record's head `3d432688a20266548447d71029830a4bbf85e38d` recommended PASS; the operator accepted it (mission TB_FINAL_ACCEPTANCE_CLOSEOUT_MERGE_AND_POST_MAIN_VERIFICATION).
- R14-AUD-015 … -020: **CLOSED_VERIFIED_WITH_LIMITS**.
- FINAL_ENGINEERING_AUDIT: **PASS**.
- SYSTEM_SETUP_STATUS: **VERIFIED_COMPLETE · ACCEPTED_SINGLE_PC_ENGINEERING_SCOPE**.

The record is `docs/verification/final-audit/FINAL_ENGINEERING_AUDIT_CLOSEOUT.md`; §22 below points to it. The status table's rows before its two "recorded later" rows and the statuses in §1–§21 are those of their time. The one exception: the §5 fixture sentence (and its summary in §17), corrected as the re-audit observed.

## Status by scope (not collapsed)

| Scope | Status |
|---|---|
| R14-AUD-020 (HIGH) — the export replay judged the records it read at an instant from before its reads | **REMEDIATED_PENDING_INDEPENDENT_REVIEW** (§3) |
| R14-AUD-016 (HIGH) — a G6 PASS of a reply counted with REQUIRES_DOCUMENT or MISSING_FACT asks | **REMEDIATED_PENDING_INDEPENDENT_REVIEW** (§4) |
| R14-AUD-015 (MEDIUM) — one ERROR run blocked its epoch for good | **REMEDIATED_PENDING_INDEPENDENT_REVIEW** (§5) |
| R14-AUD-017 (MEDIUM) — the G6 form could not record ask dispositions | **REMEDIATED_PENDING_INDEPENDENT_REVIEW** (§6) |
| R14-AUD-019 (MEDIUM) — READY and a handoff stayed shown after a same-page write | **REMEDIATED_PENDING_INDEPENDENT_REVIEW** (§7) |
| R14-AUD-018 (MEDIUM) — the contracted audit history read was unrouted | **REMEDIATED_PENDING_INDEPENDENT_REVIEW** (§8) |
| FINAL_ENGINEERING_AUDIT | **HOLD_FOR_REAUDIT** |
| SYSTEM_SETUP_STATUS | **NOT_VERIFIED_COMPLETE** |
| ADR-0011 | **ACCEPTED_BY_OPERATOR · INDEPENDENT_REVIEW_DEFERRED · REVISED_FOR_AUD_015_AUD_016 · PENDING_INDEPENDENT_REAUDIT** (§9) |
| Contract | **Unchanged** — TB-SCHEMA-API-v1.4.0 (291 schemas, 145 operations, 100 paths); routed: **144 of 145** (only `getMeta` unrouted), **140 business operations** (§10) |
| Engineering identifiers | **Unchanged** — `TB-TECHNICAL-RULESET-v3`, `TB-PRODUCTION-CONTEXT-DIGEST-v2`, `TB-PROMPT-TEMPLATE-v1`, `TB-CANDIDATE-ARTIFACT-v1`, `PFC-YT-EMAIL-v1.1` (§10) |
| Schema / migration | **None** (§10) |
| Automated tests | **PASS** — `yarn test` 1736 in 57 files, `yarn test:db` 635 in 16 files on the code head `2df10c8` (home PC and CI) (§15) |
| Negative controls (§52) | **PASS** — 15/15 caught by the responsible tests, every mutation restored byte-identically (§12) |
| Browser verification (§51) | **PASS** — scenarios A–E at 390 px with the keyboard, no sign/send/G7 action; two findings of the pass fixed and re-verified (UI-FINAL-01 MEDIUM, UI-FINAL-02 LOW) (§11) |
| Auditor probe cross-check | **The audited defects reproduce at `abc31fc` and are absent at the remediated source** (the auditor's own probe; §13) |
| `smoke:p4i` (§53) | **PASS** — 205 checks in CI run 36566591922 (139 at P4I); `smoke:local` 73; every other compiled smoke passing with its P4I total (§14) |
| Full regression (§54) | **PASS** — 21/21 steps exit 0 on the code head `2df10c8`, clean tree before and after (an earlier sweep of `742e9cc`: 20/21, the stale inventories) (§16) |
| Own code review (§55) | **DONE** — no BLOCKER or HIGH; MEDIUM REV-FINAL-01 and UI-FINAL-01 fixed; LOW items fixed or classified; not an independent review (§17) |
| Branch CI (§58) | run 36563980184 on `742e9cc` **FAILED** (two stale DB route inventories) → fixed in `2df10c8`: run **36566591922 success, both jobs**, logs read; the documentation head's own run is reported with the final report (§19) |
| G7 | **HUMAN_CONTROLLED, NOT IMPLEMENTED**; signature and send **NOT IMPLEMENTED**; external action **NONE** (§10) |
| Backlog R14-AUD-002, -007 / -011, -012 | **OPEN_BACKLOG / NON_BLOCKING_BACKLOG — unchanged** |
| Real-case use | **NOT AUTHORIZED** |
| Pull request / merge | **NONE** — not authorized by this mission (§59) |
| Independent re-audit of `3d43268` (recorded later) | **PASS** (bounded, accepted single-PC engineering scope): R14-AUD-015 … -020 **CLOSED_VERIFIED_WITH_LIMITS**; two new LOW, non-blocking findings R14-AUD-021 (= AUD018-RED-01) and R14-AUD-022 (backlog) (§22) |
| Final acceptance (recorded later) | FINAL_ENGINEERING_AUDIT **PASS**; SYSTEM_SETUP_STATUS **VERIFIED_COMPLETE · ACCEPTED_SINGLE_PC_ENGINEERING_SCOPE**. The pull request and a normal merge commit are authorized by the closeout mission; the merge and post-main CI are **PENDING** in the repository record (§22) |

## 1. Pre-flight and branch (mission §2–§3)

- `origin/main` = `abc31fc350311aa21945776ec266ef48935e46c9`: the P4I merge — pull request #13, a normal merge commit (parents `19a7cb2` and the P4I documentation head `c501d5a`; its tree `bb5e14d` equals `c501d5a`'s); `main` push CI run **36537325354** success, both jobs (07:33:17Z–07:45:23Z). The P4I merge is reconciled in `docs/verification/p4i/P4I_READINESS_UNSIGNED_EXPORT.md` §22.
- No open pull request. The branch was created from `origin/main` with `HEAD` = `abc31fc` before any change; `origin/main` was re-checked before every push and stayed `abc31fc`.

## 2. The audit evidence and the independent confirmation (mission §4)

Read first, as audit evidence, from the operator-provided folder `TB_FINAL_WHOLE_SYSTEM_AUDIT_abc31fc` (outside the repository; not committed): `00_FINAL_AUDIT_REPORT_VI.md` (sha256 `41482ab5…`), `01_FINDINGS.json` (`c9e5f2e9…`), `04_END_TO_END_TRACEABILITY_AND_SCENARIOS.md` (`906c52fb…`), `05_P4H_P4I_DECISION_REVIEW.md` (`797afa44…`), `06_READINESS_EXPORT_REVIEW.md` (`a7b79830…`), `07_ROUTE_CONTRACT_PARITY.md` (`af90ab51…`), `08_FINAL_SYSTEM_DECISION.md` (`17651d1c…`), `09_MINIMAL_REMEDIATION_PLAN.md` (`5d7e6462…`), `10_AUDIT_CHECKPOINT.md` (`e2671f10…`), `12_VERIFICATION_RESULTS.json` (`d6404a62…`), `13_AUDIT_MANIFEST.json` (`43affe5a…`).

Each finding was then confirmed from the exact source at `abc31fc` before any change. **None was disproved; no counter-evidence was found.**

| Finding | Confirmed at `abc31fc` |
|---|---|
| R14-AUD-020 | `write-executor.ts:189` samples `now` before the awaited claim; `:197` hands it to `replayGuarded`, which passes it to `release`; `readiness.service.ts:117` → `release(…, now)` (`:188–200`) opens a new transaction, reads the candidate and `scopedInput`, then evaluates with that earlier `now` — a boundary passing during the claim, the replay lookup or the reads is judged as not yet passed. The readiness GET (`:100`) and a new export (`:145`) sample the clock at their evaluation. |
| R14-AUD-016 | `readiness-rules.ts:669–736`: a counted G6 PASS of a reply is held only by no disposition, a foreign parent, `LEGAL_REVIEW_REQUIRED` or an inapplicable source; `REQUIRES_DOCUMENT` and `MISSING_FACT` add no cause, so READY_FOR_SIGNER and the export follow (`:791–838`, `:850–862`). PFC §6: "Longer prose and removal of inconvenient wording do not cure an outstanding material document/fact requirement." |
| R14-AUD-015 | `readiness-rules.ts:384–431`: every run of E enters the outcome comparison, an ERROR run included, so an ERROR run and a later completed TECHNICAL_PASS disagree for good (`TECHNICAL_RUN_CONFLICT`, BLOCKED with `VALIDATION_ERROR`); the ruleset itself states that nothing about the candidate follows from an execution ERROR. |
| R14-AUD-017 | `assessments.tsx:395–414` builds the capture body without `askDispositions`; the form has no field for them, so every G6 review of a reply recorded through the page is held (`G6_ASK_DISPOSITIONS_MISSING`), and a replacement through the same form cannot add them. The API accepts them (P4H). |
| R14-AUD-019 | `readiness.tsx:179–245`: the evaluation and the handoff are local state of `CandidateReadiness`; nothing on the candidate page (`candidates.tsx:60`, the supersession at `:362–368`, the review and run sections) clears them after a successful write, and a response to a request started before such a write still sets them. |
| R14-AUD-018 | `app.module.ts:1–55` registers no audit module: 143 of 145 contracted operations routed, `getMeta` and `listAuditEvents` unrouted (`packages/contracts/src/api/operations.ts:3646–3672` declares `listAuditEvents`, GET `/audit-events`, session-protected, `limit`/`cursor`/`q`/`entityType`/`entityId`, `AuditEventPage`). |

The auditor's offline probe reproduces R14-AUD-015, -016 and -020 at `abc31fc` (§13).

## 3. R14-AUD-020 — the replay's evaluation instant (mission §6–§10)

**Root cause (confirmed):** the guarded replay received the WriteExecutor's request instant, sampled before the idempotency claim and the replay lookup, and evaluated the readiness it read afterwards at that earlier instant.

**Fix** (`cc8c8b4`):
- `GuardedReplay.release(kept)` no longer receives an instant (`write-executor.ts`): the request's instant is never handed to a guard.
- `ReadinessService.release` samples `this.clock.now()` **after** `scopedInput` has read the replay's inputs, right before `evaluateReadiness` — the same semantics as GET and a new export (one REPEATABLE READ snapshot; the instant after its reads).
- The present readiness is only the guard: when it passes, the response stays exactly the historical one (subject, envelope, body, both hashes, the readiness evaluated for the original export and `exportedAt`); when it fails, the present refusal is returned and nothing is released or written.
- `READINESS_OBSERVER` gains two no-op test seams, `beforeReplayRead` (after the claim and the replay lookup) and `afterReplayInput` (after the reads, before the instant).

**Tests** (`tests/db/p4i-http.test.ts`, describe "R14-AUD-020"; the observer lets time pass at the named point):
- **A / F** — the boundary passes after the request's instant, while the replay waits in its claim and replay lookup → 409 `CANDIDATE_NOT_READY` STALE_REVALIDATION_REQUIRED (`G1_TEMPORAL_REVIEW_STALE`); no body, subject or hash in the response; no audit event, idempotency or business change.
- **B / F** — the boundary passes while the replay reads its input → still refused: an instant taken when the replay starts, before its reads, is not the evaluation instant.
- **C** — strong interleaving: G2 HOLD before the boundary, G1 stale from it on, a G2 PASS successor recorded only after it; the replay reads the PASS and still refuses (G1 stale at its evaluation) — no instant of the request was READY.
- **D / F** — a date-only boundary: the replay starts while the date lies ahead everywhere and is judged once the date may have begun somewhere (`TEMPORAL_BOUNDARY_AMBIGUOUS`, REVIEW_REQUIRED) or has ended everywhere (G1 stale).
- **E** — before the boundary, with nothing changed, the replay is allowed and returns exactly the original subject, envelope, body, readiness and `exportedAt`; no second audit event; the idempotency record unchanged.
- Unit: `tests/api/write-executor.test.ts` — every replay calls `release` with the kept values only (never an instant).

**Historical immutability:** the first export's audit event and idempotency record are byte-identical before and after every refused or allowed replay (A–F).

## 4. R14-AUD-016 — unresolved NMI asks hold G6 (mission §11–§18)

**Fix** (`1d3a43a`, `readiness-rules.ts`):
- `ASK_DISPOSITION_CAUSE` classifies each contracted disposition explicitly: `ANSWERED_SUPPORTED`, `ANSWERED_WITH_LIMITATION`, `NOT_APPLICABLE_WITH_REASON` → resolved (null); `REQUIRES_DOCUMENT` → `G6_ASK_REQUIRES_DOCUMENT`; `MISSING_FACT` → `G6_ASK_MISSING_FACT`; `LEGAL_REVIEW_REQUIRED` → `G6_ASK_LEGAL_REVIEW_REQUIRED`. The disposition is the ask's explicit recorded status; **no text is read** — the question, answer locator, unresolved remainder, limitations and rationale never change it (no keyword rule).
- `evaluateGate` (G6 of an NMI_REPLY): no disposition → `G6_ASK_DISPOSITIONS_MISSING`; each unresolved disposition adds its cause (HOLD, REVIEW_REQUIRED) — alone or beside answered asks; five PASS gates never compensate; a cited source that does not apply now → `G6_ASK_SOURCE_NOT_APPLICABLE`.
- Integrity (BLOCKED `ASSESSMENT_INTEGRITY_FAILED`): `storedDispositions` accepts only entries with an ask id, parent binding, source list and a contracted disposition (`Object.hasOwn`, never a prototype key); another parent; an ask recorded twice (`askRecordedTwice`, per parent binding and ask id). Capture already refuses all of them (422), so only a corrupt row carries one.
- The two new codes are pinned in `GATE_REASON_ORDER` / `READINESS_REASON_ORDER` and have neutral page copy (`readiness.tsx`).

**Ask completeness — `MATERIAL_SEMANTIC_AMBIGUITY` (recorded, not inferred).** Whether the dispositions cover every material ask of the parent message cannot be decided by software: the parent NMI is captured correspondence text and no structured record of its asks exists. The system enforces what it can — at least one disposition, exactly the prompt's parent, no ask twice, contracted values only, sources applying now — and leaves completeness to the G6 reviewer's attributable record (ADR-0011 Decision 8).

**Tests** — unit (`tests/api/readiness-rules.test.ts`, "G6 of a reply (R14-AUD-016)", 7) and DB/HTTP (`tests/db/p4i-http.test.ts`, "R14-AUD-016", 5):

| Mission item | Result |
|---|---|
| REQUIRES_DOCUMENT | G6 HOLD, readiness REVIEW_REQUIRED [`G6_HOLD`, `G6_ASK_REQUIRES_DOCUMENT`]; a fresh export 409 `CANDIDATE_NOT_READY`, nothing released |
| MISSING_FACT | G6 HOLD [`G6_HOLD`, `G6_ASK_MISSING_FACT`]; export refused |
| LEGAL_REVIEW_REQUIRED | G6 HOLD [`G6_HOLD`, `G6_ASK_LEGAL_REVIEW_REQUIRED`]; export refused (unchanged) |
| A mixed list (answered asks beside an unresolved one) | HOLD with the unresolved cause: answered asks never compensate |
| Positive: ANSWERED_SUPPORTED | counts — READY_FOR_SIGNER when everything else passes |
| Positive: ANSWERED_WITH_LIMITATION (a genuine limitation; its remainder never keyword-read) | counts |
| Positive: NOT_APPLICABLE_WITH_REASON (sourced) | counts |
| No disposition | HOLD `G6_ASK_DISPOSITIONS_MISSING` |
| Another parent / an ask twice / a source outside the case | refused at capture (422 `ASK_PARENT_MISMATCH` / 422 `VALIDATION_FAILED` / 422); a stored foreign, duplicate or unknown disposition never counts (BLOCKED) |
| Successor recovery | the stored G6 PASS recording REQUIRES_DOCUMENT stays unchanged and readable; only an explicit, sourced successor recording the asks resolved becomes the one head — then READY |
| Export replay | an export recorded while G6 was resolved releases nothing once a G6 successor records REQUIRES_DOCUMENT or MISSING_FACT: no text, no new audit event, no business change |

## 5. R14-AUD-015 — same-epoch run recovery (mission §19–§22)

**Fix** (`d4f8cd0`, `readiness-rules.ts`):
- `runCompleted(run)`: result ≠ ERROR and a coverage manifest with every required rule executed and none not executed. A run that did not complete is a diagnostic — no finding about the candidate.
- `technicalOutcome`: the runs of E, latest first `(createdAt DESC, id DESC)`. **Completed** runs are compared by their material outcome (result, coverage manifest, deterministic issues); if they disagree → `TECHNICAL_RUN_CONFLICT`, no counted run, each disagreeing completed run's result code (plus the latest run's own codes when it did not complete) — never "the latest PASS wins". Otherwise **the latest run counts**: a latest ERROR → BLOCKED (`VALIDATION_ERROR`, `VALIDATION_COVERAGE_INCOMPLETE`), a latest run with a rule not executed → `VALIDATION_COVERAGE_INCOMPLETE` — never READY, no older PASS relied on; an earlier diagnostic stays history and poisons nothing.
- The page copy of `VALIDATION_ERROR`, `VALIDATION_COVERAGE_INCOMPLETE` and `TECHNICAL_RUN_CONFLICT` says what now holds ("the latest technical validation run of the current epoch…", "Completed technical validation runs…").

**Tests** — unit ("same-epoch run recovery (R14-AUD-015)", 9, and R-28) and DB/HTTP ("R14-AUD-015", 4, and R-28):

| Mission item (§22) | Result |
|---|---|
| ERROR only | BLOCKED; the latest ERROR counts as the diagnostic it is (ERROR runs are never compared with each other) |
| ERROR → a run with a rule not executed | never READY: the latest run counts and is incomplete |
| ERROR → a completed TECHNICAL_PASS | READY_FOR_SIGNER, exported with the PASS; the ERROR run stays readable, byte-identical history |
| PASS → a newer ERROR | BLOCKED: the ERROR counts; a fresh export refused and a replay of an earlier export releases nothing |
| PASS → a newer run with a rule not executed | never READY (synthetic corruption of a stored PASS); a later completed run recovers |
| PASS → ERROR → PASS | the latest completed PASS counts; an earlier request's replay then releases again only while READY with the same run |
| Equal `createdAt` | `id DESC` decides the latest, whatever the input order; the run the history lists first is the one that counts |
| Completed runs that disagree (PASS vs BLOCKED, PASS vs REVIEW_REQUIRED, a deterministic field or coverage difference) | `TECHNICAL_RUN_CONFLICT`, no counted run, even when the PASS is the latest (R-28); a BLOCKED one decides BLOCKED; a diagnostic neither resolves nor hides the conflict; messages and heuristic issues are not compared |
| Readiness and export use one derivation | ERROR → PASS is READY and exportable with the PASS; PASS → newer ERROR is BLOCKED and refused |

The DB tests produce each ERROR run through the injected test seam `VALIDATION_OBSERVER` — its `beforeRule` throws at a named rule — and the normal validation route (`POST /candidates/{id}/validation-runs`), so the runtime's own ERROR path records it. The runtime never records one any other way. Only the compiled `smoke:p4i` inserts its ERROR run of the same epoch as a synthetic stored row with SQL (`insertSyntheticErrorRun`), because the compiled API has no failure seam. In these R14-AUD-015 DB tests and R-28, the only direct row changes are the "synthetic corruption" of a stored completed run named in the table above (the not-executed rule, R-28). Other DB tests of the suite (for example R-08 and a G6 test's corrupt ask dispositions) make their own labelled synthetic-corruption updates of stored rows. *(Corrected at the final acceptance closeout — the independent re-audit's observation DOC-OBS-ERROR-FIXTURE-DESCRIPTION. This sentence first said that the DB tests also wrote the ERROR run as a stored row; `docs/verification/final-audit/FINAL_ENGINEERING_AUDIT_CLOSEOUT.md` §8.)*

## 6. R14-AUD-017 — the G6 ask-disposition editor (mission §23–§28)

**Fix** (`72e612e`, `apps/web/src/app/cases/assessments.tsx`):
- The editor "Ask dispositions of the parent message" is offered **only for G6 of an NMI_REPLY candidate**. The parent binding is fixed from the prompt snapshot (`prompt.parentBindingId`) and shown — "Parent binding (fixed by the prompt snapshot, not chosen here)" — never chosen; a reply prompt without a parent says that no disposition can be recorded.
- No ask and no disposition is preselected. Each ask row: ask identifier, question (as recorded), a disposition chosen explicitly from exactly the six contracted values, each with neutral copy (`DISPOSITION_MEANING`: the three unresolved ones say "the ask stays unresolved"), answer locator, sources checked, unresolved remainder; rows can be added and removed.
- Sources: only the sources the read context offers; a source the context records as not applicable is disabled with its note ("This source is not currently applicable to the Case scope; an ask disposition cannot cite it."), whatever the result.
- Client checks before anything is sent: an ask needs its identifier, question and a chosen disposition, and each identifier once; the error summary takes focus once per refused submission (typing a correction keeps the focus in the field); server refusals are shown at their ask fields.
- The body sends each ask exactly as entered (`askId`, `questionText`, the prompt's `parentBindingId`, `disposition`, `sourceIds` in offered order, `answerLocator` / `unresolvedRemainder` only when entered); a removed ask is not sent. The history shows the dispositions as the server stored them, in a focusable, named table region.
- A 412 after the context read is shown exactly and never retried; the asks entered stay and are sent again only by an explicit record after a new read.
- The page infers nothing from the texts: the server classifies the recorded dispositions (§4).

**Tests** (`tests/web/p4h.test.tsx`, "R14-AUD-017", 7): the editor only for G6 of a reply with the fixed parent; exact round trip; **every contracted disposition round-tripped through the form** — REQUIRES_DOCUMENT, MISSING_FACT and LEGAL_REVIEW_REQUIRED sent exactly, shown from the server after a reload, and the readiness the server derives for them shown as derived (REVIEW_REQUIRED, `G6_HOLD` with its cause, no handoff), the three resolved dispositions (with the positive supported answer, the limited answer and the not-applicable reason) shown as READY for authorized human signer review; client checks; keyboard focus; inapplicable sources and the server's source refusal; the wrong/stale context 412. The browser pass (§11 A) did the same against the compiled API.

## 7. R14-AUD-019 — invalidating the readiness shown after a write (mission §29–§33)

**Fix** (`6ba2bf4`):
- `candidates.tsx` owns a readiness **generation**; every successful write on the candidate page that can change the readiness starts a new one: the supersession, a technical validation run (`validation.tsx` `onRecorded`), a G1–G6 review (`assessments.tsx` `onRecorded`). Reads (opening a run, reading the context, showing supports) start none.
- `CandidateReadiness` (`readiness.tsx`) drops the evaluation, the handoff and its copy control and the focus target as soon as it renders with a new generation (before anything is shown with it), and returns to "Not evaluated yet…"; nothing is inferred in their place and nothing is read by itself.
- In-flight responses: `evaluate()` and `prepare()` remember the generation they started under (a ref updated on every render) and discard a response or an error that arrives under a newer generation — a delayed READY or a delayed handoff can never be shown or copied.
- Server refusals (412/409) keep their P4I handling.

**Tests** (`tests/web/p4h.test.tsx`, "R14-AUD-019", 7; the fake server can hold a response): A READY with a handoff, then supersede → the evaluation, the handoff and the copy control gone at once, nothing read by itself, a new evaluation shows SUPERSEDED; B a G6 HOLD successor → READY gone, a new evaluation shows the review required; C a parallel head of one gate → gone, then the conflict; D a new validation run → gone, a new evaluation reads the server again; E a delayed readiness response from before a write → discarded, never READY; F a delayed export response from before a write → the handoff discarded, never shown or copyable; reads start no generation. Browser: scenarios B, C and D (§11).

## 8. R14-AUD-018 — the contracted audit history read (mission §34–§43)

**Fix** (`8b17535`; `apps/api/src/modules/audit/` — `audit.module.ts`, `audit-events.controller.ts`, `audit-events.service.ts`; `app.module.ts`):
- Exactly the contracted `listAuditEvents` (GET `/audit-events`), parsed against the contract (`parseQuery`: only `limit`, `cursor`, `q`, `entityType`, `entityId`; invalid values 400/422 as contracted). No other audit route: no read by id, create, update or delete; no admin console; no contract change; no migration.
- Order `(createdAt DESC, id DESC)`, keyset pagination (default 25, max 100); the HMAC cursor is bound to the operation **and** to `q`, `entityType` and `entityId` (a cursor of another filter set, or of another list, is 400 `INVALID_CURSOR`).
- `entityType`, `entityId`: exact equality. `q`: exactly an event id, a request id, an action, an entity type, an entity id or an actor user id — never a text search of reasons or recorded state.
- Each row exactly as stored (`toAuditEventView`: the stored before/after, reason and source ids; never enriched from a present-day record, re-redacted or rewritten).
- Session-protected by the global guard (401 without a session; no CSRF for a GET); no tenant ACL exists or is claimed — any signed-in application user reads the whole history, as every other record. A read writes nothing (no audit event about reading, no idempotency record, no row version or context revision); `Cache-Control: no-store`.
- Route parity: **144 of 145** contracted operations routed; only `getMeta` stays unrouted; no route outside the contract; sign, send, submit, AS_SENT creation and G7 stay 404.

**Redaction review (mission §39).** Every audit row is written through one insert (`appendAuditEvent`, `audit-log.ts`), guarded against the key names password/token/secret/csrf/hash/cookie; free text is stored as `{redacted, codePoints}` through `auditValue` / `textLength` / `authorityAuditValue`. A read-only inventory of all 94 action strings (65 business audit sites, 2 auth, 5 admin CLI) confirmed, and the DB tests assert on real rows:

| §39 item | Stored? |
|---|---|
| password or password hash | **No** (CLI rows hold email, display name, epochs and flags) |
| session token or its digest | **No** (the session row id, user, expiry only) |
| CSRF token | **No** |
| full candidate subject or body | **No** — lengths only (`CANDIDATE_IMPORTED`/`_REVISED`, `EXPORT_UNSIGNED`) |
| full correspondence body, subject, Message-ID, addresses | **No** — lengths only |
| full supported conclusion / assertion | **No** — lengths only |
| full rationale, scope text, limitations, performer label | **No** — lengths only; ask dispositions as counts per disposition, no ask text |

One pre-existing deviation is **classified separately, not silently redacted at read time (§39)**: **AUD018-RED-01 (LOW, pre-existing since P2, not changed here)** — `fieldAttributions[].scopeText` and `.limitations` of an Agency or LegalSubject are stored raw in `AGENCY_CREATED`/`_UPDATED` and `LEGAL_SUBJECT_CREATED`/`_UPDATED`: `REDACTED_FIELDS` names `scopeText` and `limitations`, but `auditValue` does not look inside the attribution array (`modules/directory/changes.ts`). It is directory attribution text (what a source is recorded to support for a field), not a password, token, candidate or correspondence body, supported conclusion or rationale; the same text is returned in full by the contracted directory reads to the same signed-in users, so the audit read adds only its history. The audit read returns the rows exactly as stored; changing what future writes store is a write-side decision outside this mission (backlog). Also recorded (OBS-FINAL-04): the audit read shows every signed-in user the local accounts' email and display name (`USER_*_LOCAL_CLI`, P1.1) and sign-in metadata (`AUTH_LOGIN_SUCCEEDED`: user id, the session row id — never the token or its digest — and expiry), within the authenticated operator boundary the contract gives the audit history to. Other raw free text is raw by the accepted conventions since P2: the `reason` column and the reasons copied into archive/link/close states, names, labels, contact data and URLs of directory and intake records.

**Tests** (`tests/db/p4i-http.test.ts`, "R14-AUD-018", 8): 401 without a session; an empty page for a filter nothing matches; limit 1, the default, 25 and 100; a stable keyset walk returning every stored event once, exactly as stored; the filters and q exactly; cursor/filter mismatch → 400 `INVALID_CURSOR`; unknown parameters and invalid limit, `entityId` or `q` refused; a real `CANDIDATE_ASSESSMENT_CAPTURED` and a real `EXPORT_UNSIGNED` recoverable exactly as recorded, texts as lengths; a whole reply life (capture, binding, facts, prompt, candidate, validation, reviews with ask dispositions, export, sign-in) with no password, session or CSRF token and no private text; reads write nothing and are no-store; route parity 144/145 with no sign, send, submit, AS_SENT or G7 route. `tests/db/p4d-http.test.ts` no longer expects GET `/audit-events` to be 404; `tests/db/auth-http.test.ts` and `tests/db/directory-http.test.ts` count it (`2df10c8`, after branch run 36563980184 failed on them; §19).

## 9. ADR-0011 revision (mission §44)

`docs/decisions/ADR-0011-derived-readiness-and-revalidated-unsigned-export.md` — status kept (**ACCEPTED_BY_OPERATOR · INDEPENDENT_REVIEW_DEFERRED**) with the revision line **REVISED_FOR_AUD_015_AUD_016 · PENDING_INDEPENDENT_REAUDIT**; never described as independently verified. The earlier wording of each revised decision is kept, marked as superseded.
- **Decision 4** (same-E runs): historical ERROR/incomplete diagnostics remain history; a later complete run recovers from an earlier transient diagnostic failure; a newer ERROR/incomplete run prevents relying on an older PASS until another complete run occurs; materially conflicting complete runs fail closed; no "latest PASS wins".
- **Decision 8** (NMI G6): dispositions are semantic statuses, not mere presence; REQUIRES_DOCUMENT, MISSING_FACT and LEGAL_REVIEW_REQUIRED are unresolved; the source and scope rules stay; no keyword-based legal inference; ask completeness is the reviewer's attributable record (`MATERIAL_SEMANTIC_AMBIGUITY`).
- **Decision 17** (the replay's instant, R14-AUD-020) and **Decision 18** (the page's invalidation, R14-AUD-019) record the corrected behaviour; tier rows 5 and 7, Consequences and Alternatives follow.

## 10. Versions, contract, schema, immutability and the G7 boundary (mission §45–§47)

- **No version bump was needed** (no `VERSION_DECISION_REQUIRED`): readiness is a downstream derivation. No technical rule's meaning, kind or severity and no marker vocabulary changed (`technical-ruleset.ts` and `text-scan.ts` byte-identical to `abc31fc`; `TB-TECHNICAL-RULESET-v3`), no ProductionContext semantics (`TB-PRODUCTION-CONTEXT-DIGEST-v2`, the context modules unchanged), no prompt template or artifact hash, no wire shape.
- **Contract:** `yarn contracts:check` "3 generated outputs match the active source"; no file under `packages/contracts` changed; 291 schemas, 145 operations, 100 paths. Routed: 144 of 145 (+`listAuditEvents`), 140 business operations (139 + 1).
- **Schema / migration:** none; `20260923103912_initial_schema` is still the only migration; no readiness, export or audit-read table or column.
- **Historical immutability (§46):** no stored run, issue, assessment, support row, candidate, prompt, audit event or idempotency record is rewritten, recomputed or relabelled. The tests compare stored rows byte for byte before and after (the ERROR run in §5, the G6 PASS with REQUIRES_DOCUMENT in §4, the first export's audit event and record in §3); the audit read returns rows as stored.
- **G7 hard stop (§47):** no sign, send, email, SMTP, YouTube submission, uploader contact, counter-notification, retraction, AS_SENT creation, adoption or Drive route, button or code path was added. The DB route-parity test and `smoke:p4i` / `smoke:local` probe sign, adopt, send, submit, signature, as-sent, G7 and audit-write routes as 404. `signatureState` HUMAN_PENDING, `sendPerformed` false and `externalAction` PROHIBITED are unchanged constants.

## 11. Browser verification (Playwright MCP, mission §51)

Evidence: `evidence/final-audit-playwright-mcp-verification.txt`, screenshots `evidence/screenshots/final-*.png`. `yarn ui:sandbox` only (the compiled API on the disposable `tb_notice_test`, the built web app, the synthetic sandbox user, the Playwright MCP isolated headless profile), 390×844, keyboard throughout, 2026-09-29 11:17–11:33 UTC; run 1 built from `37fc5cb`, run 2 from `64f4016`.

- **A — NMI G6 ask dispositions (AUD-017 with AUD-016): PASS.** Editor only for G6 of the reply, parent fixed and shown; keyboard error summary; REQUIRES_DOCUMENT recorded (body exactly as entered) → REVIEW_REQUIRED [`G6_HOLD`, `G6_ASK_REQUIRES_DOCUMENT`], no handoff; after a reload the history shows the stored disposition; an ANSWERED_SUPPORTED successor with the licence source → READY for authorized human signer review. Run 2: MISSING_FACT beside ANSWERED_WITH_LIMITATION → REVIEW_REQUIRED [`G6_HOLD`, `G6_ASK_MISSING_FACT`].
- **B — READY, handoff, supersede: PASS.** The evaluation, handoff and copy control gone at once; nothing read by itself; a fresh evaluation → SUPERSEDED.
- **C — READY, HOLD successor: PASS.** READY gone at once; a fresh evaluation → REVIEW_REQUIRED [`G2_HOLD`].
- **D — delayed responses: PASS**, through a deterministic seam in the automation page only (a `window.fetch` wrapper holding a response until released): a held READY readiness response released after a HOLD successor was recorded, and a held 200 export response released after the supersession, were both discarded — no READY, no handoff, no copy control.
- **E — the audit read as the browser sees it: PASS.** 200, no-store, 77 events, 27 actions; no private marker, body, subject, rationale, question, locator, remainder, supersede reason, password, cookie name or CSRF token in the response; `EXPORT_UNSIGNED` with texts as lengths, `sendPerformed` false, PROHIBITED, HUMAN_PENDING; ask dispositions as counts. No audit page exists in the UI.
- **No sign/send/G7 action: PASS** — the only matching control was the application's "Sign out"; a read-only query found no signature/send/adopt/G7/submit/retract audit action and no export/readiness/signature/send table.
- **Findings of the pass (fixed in `64f4016`, re-verified in run 2):** UI-FINAL-01 (MEDIUM, copy, pre-existing since P4I, made frequent by AUD-016) — `GATE_HOLD` said "The current review of this gate is recorded as HOLD." also for a recorded PASS the server holds → now "This gate is on hold: its current review is recorded as HOLD, or its recorded PASS does not count for the reasons listed with it." (web test + negative control); UI-FINAL-02 (LOW, layout, from AUD-017's columns) — the ask table squeezed the recorded question to a few characters per line at 390 px → free-text cells keep a minimum width and the table scrolls inside its focusable frame.
- Isolation and cleanup: `tb_notice_test` verified empty before and after each run; nothing of `tb_notice_dev` or the operator's `yarn dev` touched; every request to http://localhost:5173/; no password, cookie or CSRF token recorded.

## 12. Negative controls (mission §52)

Evidence: `evidence/final-audit-negative-controls.txt` (all re-run in one batch at the code head `742e9cc`). Each control: back up, one exact-once mutation, the responsible tests, restore, `sha256sum -c`. **15/15 caught; every mutation restored byte-identically**; the working tree clean afterwards.

| Control | Mutation (mission §52 intent) | Caught by |
|---|---|---|
| NC-FINAL-020-A | the replay evaluates at the release callback's earlier instant | DB R14-AUD-020 A–D (4 failed) |
| NC-FINAL-020-B | the instant sampled before `scopedInput` | DB B and D (2 failed) |
| NC-FINAL-016-A / -B | REQUIRES_DOCUMENT / MISSING_FACT no longer hold | unit 4 + DB 3 / unit 4 + DB 2 |
| NC-FINAL-016-C / -C2 | no disposition allowed to count / an ask recorded twice counts | unit 1 + DB 1 each |
| NC-FINAL-015-A | the old all-run conflict behaviour | unit 8 + DB 4 |
| NC-FINAL-015-B | the latest PASS wins over a complete BLOCKED | unit 3 + DB 1 |
| NC-FINAL-015-C | a newer ERROR after a PASS ignored | unit 4 + DB 2 |
| NC-FINAL-017 | the page omits `askDispositions` | web 5 |
| NC-FINAL-017-FOCUS | the issue list rebuilt every render (focus stolen while correcting) | web 2 |
| NC-FINAL-018 | the audit route removed (`AuditModule` unregistered) | DB R14-AUD-018, all 8 |
| NC-FINAL-019-A | a write no longer clears the readiness | web A–F (6) |
| NC-FINAL-019-B | the delayed-response guards removed | web E, F (2) |
| NC-UI-FINAL-01 | the old `GATE_HOLD` copy | web p4i (1) |

Every failing test fails on its own assertion, with two documented details: under NC-FINAL-019-A the delayed-readiness test E fails by the page never settling (its own control, NC-FINAL-019-B, fails it on its assertion); under NC-FINAL-018 an unrouted GET without a session is 404 (the router answers before the guard), so the 401 test fails on its status assertion.

## 13. Cross-check with the auditor's probe

Evidence: `evidence/final-audit-auditor-probe-crosscheck.txt`. The audit's own offline pure-source probe, run by the implementer against the `abc31fc` source and the remediated source (module hashes recorded; a documented two-line adaptation because R14-AUD-020 moved the lines the probe slices and added the observer seams — no expectation or fixture changed). At `abc31fc`: REQUIRES_DOCUMENT and MISSING_FACT → READY_FOR_SIGNER with the export allowed; ERROR → PASS → BLOCKED `TECHNICAL_RUN_CONFLICT`; the delayed replay released the body. Remediated: REVIEW_REQUIRED with their causes and the export refused; ERROR → PASS → READY counting the PASS, PASS → ERROR → BLOCKED counting the ERROR; the delayed replay refused (STALE_REVALIDATION_REQUIRED, nothing released). Everything else identical. Offline evidence of the pure evaluator only — not an independent re-audit.

## 14. `smoke:p4i` and `smoke:local` (mission §53)

`scripts/local/p4i-smoke.ts` (CI only; writes synthetic records into the disposable CI `tb_notice_dev`; refuses unless `CI=true`) keeps every earlier assertion and adds (`37fc5cb`):
- **R14-AUD-015:** a synthetic ERROR run of the same epoch recorded as the newest → BLOCKED (`VALIDATION_ERROR`), the export and the replay refused; a real TECHNICAL_PASS then recovers READY, and the first key, naming a run that no longer counts, is 412 `VALIDATION_RUN_CHANGED`.
- **R14-AUD-016:** an NMI reply whose G6 PASS records an ask as REQUIRES_DOCUMENT → G6 HOLD, the export refused; a sourced successor recording it answered → READY and exportable.
- **R14-AUD-020:** a replay after a temporal boundary is refused (STALE_REVALIDATION_REQUIRED, G1 stale) and releases nothing — end to end on the compiled API, but not discriminating: the replay is sent after the boundary, so the pre-fix instant was past it too (REV-FINAL-05). The compiled API has no seam to let time pass inside a replay; the DB tests A–D and NC-FINAL-020-A/B carry the proof.
- **R14-AUD-018:** GET `/audit-events` 401 without a session; the export and review events recoverable with texts as lengths; a cursor bound to its filters; reading writes nothing.
- More hard-stop probes: submit, signature, as-sent, a case send and audit writes all 404.

`smoke:local` adds the audit read's session boundary, direct and through the web proxy (401).

CI run 36566591922 on `2df10c8` (`evidence/final-audit-ci-run-36566591922.txt`, every `smoke:p4i` check line listed): **`smoke:p4i` 205 checks** (139 at P4I: +66 — the ERROR-run recovery, the reply with an unresolved ask and its resolved successor, the replay after the boundary, the audit reads and the added hard-stop probes); **`smoke:local` 73** (71: + the two audit-read boundaries); unchanged: `smoke:auth` 4, `smoke:directory` 14, `smoke:p3a` 24, `smoke:p3b` 36, `smoke:p4a` 50, `smoke:p4b` 64, `smoke:p4c` 62, `smoke:p4d` 85, `smoke:p4e` 81, `smoke:p4f` 88, `smoke:p4g` 143, `smoke:p4h` 149. The first branch run 36563980184 never reached the smokes (§19).

## 15. Tests and totals

New or changed tests: `tests/api/readiness-rules.test.ts` 57 → 73 (+16: AUD-015 9; AUD-016 7, replacing the earlier G6-reply test; a test that every reason code has page copy; R-28 rewritten for completed runs); `tests/api/write-executor.test.ts` 12 (one test rewritten for AUD-020); `tests/db/p4i-http.test.ts` 32 → 54 (+22: AUD-020 5, AUD-016 5, AUD-015 4, AUD-018 8; R-28 rewritten for completed runs); `tests/web/p4h.test.tsx` 16 → 30 (AUD-017 7, AUD-019 7); `tests/web/p4i.test.tsx` 10 → 11 (UI-FINAL-01); `tests/web/support.tsx` (the fake server's ask dispositions, held responses and readiness replies); `tests/db/p4d-http.test.ts` (GET `/audit-events` no longer a 404 probe); `tests/db/auth-http.test.ts` and `tests/db/directory-http.test.ts` (the route inventories, `2df10c8`).

- `yarn test`: **1736 in 57 files** (1705 at `abc31fc`; +31).
- `yarn test:db`: **635 in 16 files** (613 at `abc31fc`; +22), on the working tree equal to `2df10c8` (the full pre-commit set, 2026-09-29 12:01–12:12 UTC).

## 16. Full regression sweep (mission §54)

Evidence: `evidence/final-audit-first-pc-sweep.txt`. The code head `2df10c8` checked out clean in a scratchpad git worktree (`yarn install --immutable`), the 21 steps of the earlier sweeps, 2026-09-29 12:13–12:26 UTC: **21/21 exit 0**, the tree clean before and after — `reference:check` and `reference:helper-tests` (27/27), `contracts:check`, `typecheck`, `lint` and `oxlint --deny-warnings` ("Found 0 warnings and 0 errors."), `format:check`, `yarn test` 1736 in 57 files, `yarn test:db` 635 in 16 files, `db:verify test --expect-empty` and `db:verify dev` PASS, `db:status` test and dev up to date, both drift diffs empty, `build` (entry chunk 332.70 kB, candidates chunk 110.67 kB), `smoke:local` 73 checks, `dev:verify-shutdown` 4/4, `reference:check` and `db:verify test --expect-empty` again after. Nothing was written to `tb_notice_dev`; the compiled smokes that write records ran in CI (§14, §19). An earlier sweep of `742e9cc` (11:46–11:59 UTC) passed 20 of 21 steps: `yarn test:db` failed in the two stale route inventories (REV-FINAL-01). `yarn test:transition-baseline` is not a gate and was not run.

## 17. Own code review (mission §55)

Evidence: `evidence/final-audit-own-code-review.txt`. Claude's own review of its own remediation — **not an independent review**. Method: direct review against the mission, ADR-0011, INVARIANTS §2 and PFC §6; the browser pass; a read-only inventory of every audit writer (94 action strings); an adversarial read-only subagent pass over the whole diff with the mission's per-finding requirements as the authority (it found no BLOCKER, HIGH or MEDIUM), every item verified against the code before it was classified. **No BLOCKER or HIGH finding.**

| Id | Severity | Finding | Disposition |
|---|---|---|---|
| REV-FINAL-01 | MEDIUM | The audit read (`8b17535`) left the exact route inventories of `auth-http` and `directory-http` stale; commits A–F were verified with targeted tests and the full `yarn test:db` was not re-run after F, so branch run 36563980184 failed | **FIXED** `2df10c8`; full pre-commit set, sweep and CI green |
| UI-FINAL-01 | MEDIUM | `GATE_HOLD` copy claimed "recorded as HOLD" for a recorded PASS the server holds | **FIXED** `64f4016` (§11) |
| UI-FINAL-02 | LOW | The ask table unreadable at 390 px | **FIXED** `64f4016` (§11) |
| AUD018-RED-01 | LOW | Nested `fieldAttributions` text stored raw in Agency/LegalSubject CREATED/UPDATED events (pre-existing since P2) | **CLASSIFIED**, exposed as stored, never masked at read time; write-side backlog (§8) |
| REV-FINAL-02 | LOW | Capture accepts ask dispositions on G1–G5; readiness classifies them only for G6 of a reply (pre-existing) | **BACKLOG** (a decision on refusing or classifying them elsewhere) |
| REV-FINAL-03 | LOW | Unfiltered and `q` audit pages scan and sort the table (no `(created_at, id)` index) | **BACKLOG** (an index needs a migration) |
| REV-FINAL-04 | LOW | The three resolved dispositions count without a presence check (no ask-level source, limitation or reason text required) | **OPEN for the operator / re-audit** — not changed: the mission asks for the enum and source/scope checks and forbids presence as proof, and the contract names no field for a limitation or reason |
| REV-FINAL-05 | LOW | `smoke:p4i`'s replay-after-boundary check is not discriminating | **DOCUMENTED** (§14); the DB tests and NC-FINAL-020-A/B discriminate |
| REV-FINAL-06 | LOW | Readiness is invalidated only after a successful write; an unknown-outcome failure leaves it displayed (the server still re-evaluates every export) | **BACKLOG** (beyond §30) |
| OBS-FINAL-01…08 | observations | the replay's snapshot semantics; how the tests produce an ERROR run (the DB tests through the validation observer and the normal route, only `smoke:p4i` as a synthetic SQL row — corrected at the closeout, §5); field messages until resubmission; the audit read's exposure of account emails and sign-in metadata; the empty `entityType` filter; ask completeness; the web round trip proves display; tie-breaking by id | **RECORDED** |

## 18. Commits (mission §57)

| Commit | Content |
|---|---|
| `cc8c8b4` | A — fix(export): evaluate replay readiness at the current instant (R14-AUD-020) |
| `1d3a43a` | B — fix(readiness): hold unresolved NMI document and fact asks (R14-AUD-016) |
| `d4f8cd0` | C — fix(readiness): recover same-epoch validation after transient errors (R14-AUD-015) |
| `72e612e` | D — feat(web): record NMI ask dispositions in the G6 review form (R14-AUD-017) |
| `6ba2bf4` | E — fix(web): invalidate shown readiness after candidate-page writes (R14-AUD-019) |
| `8b17535` | F — feat(api): route the contracted audit history read (R14-AUD-018) |
| `37fc5cb` | test(smoke): cover the AUD-015/016/018/020 remediations in `smoke:p4i` (and `smoke:local`) |
| `64f4016` | fix(web): truthful gate-hold copy and a readable ask table at 390 px (UI-FINAL-01, UI-FINAL-02) |
| `742e9cc` | test(web): round-trip every NMI ask disposition through the G6 form (R14-AUD-017) |
| `2df10c8` | test(db): count the audit history read in the route inventories (R14-AUD-018) — after branch run 36563980184 failed on them |
| (the documentation head; reported with the final report) | G — docs(final-audit): this record, ADR-0011, the P4H/P4I records, `CURRENT_STATE.md`, `CLAUDE.md` |

No earlier history was rewritten; nothing was squashed, rebased or force-pushed. **Verification per commit (a deviation, recorded):** commits A–F and `37fc5cb` were verified with targeted unit, DB and web tests on their own trees (the full `yarn test` passed before F), not with the whole CLAUDE.md pre-commit set each time; that is how the stale route inventories reached `742e9cc` (REV-FINAL-01). `64f4016`, `742e9cc` and `2df10c8` passed the whole pre-commit set on their trees (`2df10c8` with the full `yarn test:db`); the code head `2df10c8` passed the full sweep (§16) and branch CI (§19). The negative controls ran at `742e9cc` (§12); `2df10c8` changes two test files only.

## 19. Branch CI (mission §58)

Evidence: `evidence/final-audit-ci-run-36566591922.txt` and `evidence/final-audit-ci-run-36563980184.txt` (extracted from both job logs with `gh api …/actions/jobs/<id>/logs`). Every push waited for the previous run to finish; `origin/main` stayed `abc31fc`.

| Head | Run | Result |
|---|---|---|
| `742e9cc` (the first push of the branch) | 36563980184 | **failure** — the database job's structural tests: 2 failed \| 633 passed (635), the two stale route inventories; steps 10–31 of that job skipped (no compiled smoke ran); the Non-DB job success |
| `2df10c8` — **the code head** | **36566591922** | **success, both jobs** (12:12:29Z–12:25:15Z), logs read |

On `2df10c85ae4189c1ecd81748f0a41fb2fef47e4a` (https://github.com/TuongChris/tb-notice-production-system/actions/runs/36566591922): `yarn test` 1736 in 57 files; `yarn test:db` 635 in 16 files; `smoke:p4i` 205 checks and every other compiled smoke passing (`smoke:local` 73, auth 4, directory 14, p3a 24, p3b 36, p4a 50, p4b 64, p4c 62, p4d 85, p4e 81, p4f 88, p4g 143, p4h 149); the P1 admin and P1.1 recovery checks; lint "Found 0 warnings and 0 errors."; `format:check`, `reference:check`, `reference:helper-tests` 27/27 and `contracts:check` ("3 generated outputs match the active source") OK; the committed migration deployed to test, replay (a no-op) and dev, each `[verify] PASS`; both drift diffs empty; the seed canonical (digest `0ee26dc3…b775`, unchanged on the second run); `dev:verify-shutdown` 4/4; `reference:check` after the run and the final `git diff --exit-code` / porcelain step passed (the working tree stayed clean); no "FAIL" line in either log. Route count: 144 of 145 contracted operations routed (the DB route-parity test and the inventories). The documentation commit after the code head and its run are reported with the mission's final report (a commit cannot record its own run).

## 20. Deviations, backlog and limitations

- **Independent re-audit pending.** Every status here is self-verified; nothing is independently verified.
- **Deviation — verification per commit (REV-FINAL-01).** Commits A–F were verified with targeted tests; the full `yarn test:db` was not re-run after the audit route (F), so branch run 36563980184 failed on two stale route inventories. Fixed in `2df10c8`; the failed run stays as recorded evidence (no history rewrite).
- **Ask completeness (`MATERIAL_SEMANTIC_AMBIGUITY`).** No structured record of an NMI's asks exists; the system enforces at least one disposition of exactly the parent, no ask twice, contracted values and applicable sources, and leaves completeness to the attributable G6 reviewer.
- **Resolved dispositions without a presence check (REV-FINAL-04, open for the operator).** A supported answer with no ask-level source, or a limitation or not-applicable disposition with no text, counts when everything else passes; deciding a presence rule needs the operator (the contract names no field for a limitation or a reason).
- **Smoke limit (REV-FINAL-05).** The compiled smoke cannot discriminate the replay's instant; the DB tests and negative controls do.
- **Backlog classified here:** AUD018-RED-01 (nested attribution text raw in directory audit events, pre-existing), REV-FINAL-02 (ask dispositions on G1–G5), REV-FINAL-03 (audit read index), REV-FINAL-06 (invalidation after an unknown-outcome write).
- **Unchanged backlog:** R14-AUD-002 and -007 OPEN_BACKLOG; R14-AUD-011 and -012 NON_BLOCKING_BACKLOG; P4I's REV-P4I-02 (lock-order retry) and the permanent gate CONFLICT at one epoch; P4H's W-2, W-3, O-1, O-3; D-6 deferred (no waiver).
- **Captured records only.** Readiness is only as current as the captured records (unchanged).
- **Real-case use is not authorized**; G7 stays human and outside the application.

## 21. Status (maximum claim of this mission)

R14-AUD-015, -016, -017, -018, -019 and -020 = **REMEDIATED_PENDING_INDEPENDENT_REVIEW**; FINAL_ENGINEERING_AUDIT = **HOLD_FOR_REAUDIT**; SYSTEM_SETUP_STATUS = **NOT_VERIFIED_COMPLETE**. Nothing here is independently verified, and nothing here is a PASS or VERIFIED_COMPLETE of the final system. Next (recommended, not started): **the independent Astra re-audit of the exact remediation SHA** — the head of `feature/final-audit-remediation-aud015-aud020` after the documentation commit that carries this record (on the code head `2df10c8`), reported with the mission's final report. No pull request or merge until the operator authorizes it after that re-audit.

## 22. The independent re-audit and the final acceptance (cross-reference)

Recorded by mission TB_FINAL_ACCEPTANCE_CLOSEOUT_MERGE_AND_POST_MAIN_VERIFICATION (operator, 2026-09-29) in `docs/verification/final-audit/FINAL_ENGINEERING_AUDIT_CLOSEOUT.md`. §1–§21 keep the state at their time, except the corrected fixture sentence of §5 and its summary in §17.

- **The re-audit.** The independent Astra re-audit of `3d432688a20266548447d71029830a4bbf85e38d` — this record's documentation head on the code head `2df10c8` — recommended FINAL_ENGINEERING_AUDIT = PASS with zero blockers. It is a bounded review: whole-critical coverage 73.18 %, the whole repository PARTIAL, and the auditor re-ran no CI, test suite, application or database. Its artifacts: ZIP sha256 `be44b598…35e2`, read on this workstation, not committed.
- **The decisions (the operator's, on that recommendation).**
  - R14-AUD-015, -016, -017, -018, -019 and -020: **CLOSED_VERIFIED_WITH_LIMITS**.
  - FINAL_ENGINEERING_AUDIT: **PASS**. SYSTEM_SETUP_STATUS: **VERIFIED_COMPLETE · ACCEPTED_SINGLE_PC_ENGINEERING_SCOPE**.
  - ADR-0011: **ACCEPTED**, independent final re-audit **VERIFIED_WITH_LIMITS** at `3d43268`.
- **Open items of this record, resolved.**
  - REV-FINAL-04: **ACCEPTED_FOR_CURRENT_MODEL** — no presence rule; source presence is not proof.
  - Ask completeness (`MATERIAL_SEMANTIC_AMBIGUITY`): **ACCEPTABLE_HUMAN_G6_RESPONSIBILITY**.
- **New findings.** AUD018-RED-01 is now **R14-AUD-021** (LOW, NON_BLOCKING, OPEN_BACKLOG: redact nested attribution text at the writer, for new events only). The re-audit also found **R14-AUD-022** (LOW, NON_BLOCKING, OPEN_BACKLOG: a late export response can clear a newer export's idempotency key before the generation guard). Neither is implemented by the closeout.
- **Backlog unchanged:** REV-FINAL-02, -03, -05 and -06; R14-AUD-002, -007, -011 and -012.
- **Merge.** The pull request and a normal merge commit are authorized by the closeout mission. The merge and post-main CI are reported with that mission's final report; in the repository record they stay **PENDING** until a later reconciliation.
