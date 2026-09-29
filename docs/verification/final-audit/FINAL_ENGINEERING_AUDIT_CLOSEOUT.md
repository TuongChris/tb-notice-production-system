# Final engineering audit — independent re-audit, acceptance closeout and merge (home PC)

Mission **TB_FINAL_ACCEPTANCE_CLOSEOUT_MERGE_AND_POST_MAIN_VERIFICATION** (operator, 2026-09-29), on `feature/final-audit-remediation-aud015-aud020`. This record holds the operator's final engineering acceptance decision and the closeout made before the pull request.

- **Primary source:** the operator's final acceptance decision (mission §0). It accepts the recommendation of the **independent Astra re-audit** of the exact target `3d432688a20266548447d71029830a4bbf85e38d` for engineering closeout.
- **The re-audit's own artifacts** were read on this workstation, read-only (§2). They are outside the repository: not committed, not copied, not modified.
- **Earlier records keep the state at their time.** Examples: "HOLD_FOR_REAUDIT" and "REMEDIATED_PENDING_INDEPENDENT_REVIEW" in `docs/verification/final-audit-remediation/FINAL_AUDIT_REMEDIATION_AUD015_AUD020.md`, and "INDEPENDENT_REVIEW_DEFERRED" in the P4H and P4I records. Each of those records now carries a pointer here.

> **Bounded engineering acceptance.** The independent recommendation applies to the **accepted single-PC engineering scope**. It is not legal approval, owner approval, real-case readiness, authority/ownership/permission/infringement confirmation, G7, a signature, sending or platform submission. It also claims no 100 % whole-repository semantic coverage and no second-PC verification (§3). No actual case was evaluated.

## Status by scope (not collapsed)

| Scope | Status |
|---|---|
| FINAL_ENGINEERING_AUDIT | **PASS** — the operator's decision, on the independent re-audit's recommendation at `3d43268` (§1) |
| SYSTEM_SETUP_STATUS | **VERIFIED_COMPLETE · ACCEPTED_SINGLE_PC_ENGINEERING_SCOPE** (§3, §15) |
| Current final-closeout blockers | **NONE IN REVIEWED SCOPE** (the re-audit: blocker count 0) |
| R14-AUD-015, -016, -017, -018, -019, -020 | **CLOSED_VERIFIED_WITH_LIMITS** (§4) |
| R14-AUD-005, -006 | **CLOSED_VERIFIED_WITH_LIMITS** (§5) |
| REV-FINAL-04 | **ACCEPTED_FOR_CURRENT_MODEL** (§6) |
| NMI_ASK_SET_COMPLETENESS | **ACCEPTABLE_HUMAN_G6_RESPONSIBILITY** (§6) |
| R14-AUD-021 (alias AUD018-RED-01), R14-AUD-022 | **LOW · NON_BLOCKING · OPEN_BACKLOG** — not implemented here (§7) |
| P4H | **VERIFIED_COMPLETE_FOR_ACCEPTED_SCOPE** |
| P4I | **VERIFIED_COMPLETE_FOR_ACCEPTED_SCOPE** |
| CandidateAssessment | **VERIFIED_COMPLETE_FOR_ACCEPTED_SCOPE** |
| Readiness | **VERIFIED_COMPLETE_FOR_ACCEPTED_SCOPE** |
| READY_FOR_SIGNER | **DERIVED_ONLY** — never stored; "Ready for authorized human signer review" only |
| Unsigned Export | **VERIFIED_COMPLETE_FOR_ACCEPTED_SCOPE** — HUMAN_PENDING, `sendPerformed` false, `externalAction` PROHIBITED |
| ADR-0008, ADR-0009, ADR-0010, ADR-0011 | **ACCEPTED** — independent final engineering audit **VERIFIED_WITH_LIMITS** at `3d43268` (§10) |
| Identifiers | `TB-SCHEMA-API-v1.4.0`, `TB-TECHNICAL-RULESET-v3`, `TB-PRODUCTION-CONTEXT-DIGEST-v2` **ACCEPTED / ACTIVE**; `TB-PROMPT-TEMPLATE-v1`, `TB-CANDIDATE-ARTIFACT-v1`, `PFC-YT-EMAIL-v1.1` **ACTIVE**; nothing bumped (§11) |
| Routes | 145 contracted, **144 routed**, only `getMeta` intentionally unrouted; `listAuditEvents` **ROUTED · VERIFIED_WITH_LIMITS** (§12) |
| G7 | **AUTHORIZED HUMAN ONLY · NOT IMPLEMENTED** (§13) |
| CONTROLLED REAL-CASE INTERNAL WORKFLOW | **ENGINEERING-CAPABLE SUBJECT TO CANONICAL RECORDS AND PER-CASE GATES** (§14) |
| CASE_READINESS_STATUS | **CASE-SPECIFIC** — no actual case evaluated (§13) |
| EXTERNAL_ACTION_STATUS | **PROHIBITED UNTIL ACTUAL G7 AND SEPARATE OPERATOR AUTHORIZATION** (§13) |
| Second PC | **DEFERRED_BY_OPERATOR** (ADR-0003 unchanged; two-PC acceptance NOT_COMPLETED) (§15) |
| Code, contract, schema, migration, dependency delta of this closeout | **NONE** — documentation only (§16) |
| Remediation merge | **PENDING** (§17) |
| Post-main CI | **PENDING** (§17) |

## 1. Operator final acceptance decision (mission §0)

The independent Astra re-audit of `3d432688a20266548447d71029830a4bbf85e38d` completed. The operator accepts its recommendation for engineering closeout:

| Item | Recorded value |
|---|---|
| FINAL_ENGINEERING_AUDIT | **PASS** |
| SYSTEM_SETUP_STATUS | **VERIFIED_COMPLETE · ACCEPTED_SINGLE_PC_ENGINEERING_SCOPE** |
| Current final-closeout blockers | **NONE IN REVIEWED SCOPE** |
| R14-AUD-015 … -020 | **CLOSED_VERIFIED_WITH_LIMITS** |
| R14-AUD-005, -006 | **CLOSED_VERIFIED_WITH_LIMITS** |
| P4H, P4I, CandidateAssessment, Readiness, Unsigned Export | **VERIFIED_COMPLETE_FOR_ACCEPTED_SCOPE** |
| TB-SCHEMA-API-v1.4.0, TB-TECHNICAL-RULESET-v3, TB-PRODUCTION-CONTEXT-DIGEST-v2 | **ACCEPTED / ACTIVE** |
| TB-PROMPT-TEMPLATE-v1, TB-CANDIDATE-ARTIFACT-v1, PFC-YT-EMAIL-v1.1 | **ACTIVE** |
| Real-case readiness | **No blanket real-case readiness is granted**; CASE_READINESS_STATUS stays case-specific |
| G7 | authorized human only |
| External action | prohibited until actual G7 and a separately authorized operator action |

## 2. The independent re-audit and its artifacts (mission §6)

Read on this workstation, never modified: `C:\Users\Admin\Documents\Codex\2026-09-26\github-plugin-github-claude-plugins-official-2\outputs\TB_FINAL_BLOCKER_REAUDIT_3d43268\` (WSL `/mnt/c/Users/Admin/Documents/Codex/2026-09-26/github-plugin-github-claude-plugins-official-2/outputs/TB_FINAL_BLOCKER_REAUDIT_3d43268/`) and the ZIP beside it.

| Item | Value |
|---|---|
| ZIP | `TB_FINAL_BLOCKER_REAUDIT_3d43268.zip` — **sha256 `be44b598fa892541b33f2aa48fd3312507c4b5d27a6c75a8bab7e1d71efe35e2`**, 192,441 bytes, 14 members |
| ZIP ↔ folder | every one of the 14 members byte-identical to the folder's file (sha256 compared) |
| ZIP ↔ manifest | the 13 hashed members equal `13_AUDIT_MANIFEST.json`'s `deliverables[].sha256`; the manifest excludes itself by design ("to avoid recursion"; its own sha256 `f34ca7b984372602bbabee3294cd318e9ab305e1820b73e75ec5eab1eb5c6089`) |
| Key files | `00_FINAL_REAUDIT_REPORT_VI.md` (`6e33ba32…b1a8`), `01_FINDINGS.json` (`4e3e6857…8a2a`), `08_FINAL_SYSTEM_DECISION.md` (`62c3d32a…fb45`), `13_AUDIT_MANIFEST.json` (`f34ca7b9…6089`) |
| Audit mission | `TB_FINAL_WHOLE_SYSTEM_BLOCKER_REAUDIT_AUD015_TO_AUD020`, created 2026-09-29T13:37:56Z |
| Exact target | `3d432688a20266548447d71029830a4bbf85e38d` (tree `b0f96e29d19d18052306567cebfbf9bf646536be`, verified locally); code head `2df10c85ae4189c1ecd81748f0a41fb2fef47e4a`; previous target `abc31fc350311aa21945776ec266ef48935e46c9` (11 ahead, 0 behind) |
| Verdict | `PASS_BOUNDED_ENGINEERING_SCOPE` (findings) / `PASS_BOUNDED_ACCEPTED_ENGINEERING_SCOPE` (manifest); blocker count **0**; `repository_mutated: false`; `whole_repository_review: PARTIAL` |
| New findings | R14-AUD-021, R14-AUD-022 — both LOW, NON_BLOCKING (§7) |
| Recommended next exact action (`08`) | "FINAL ACCEPTANCE CLOSEOUT + MERGE REMEDIATION BRANCH + POST-MAIN CI" — a recommendation, not an approval; the closeout must record the exact target, the review, the LOW backlog and the scope, and read the CI of the exact merge SHA after merging |

- **Report language.** The report and decision are in Vietnamese; `01_FINDINGS.json` carries English fields for the new findings. Paraphrases here are translations. The artifacts are authoritative.
- **Method, as the report states it.**
  - Source was read through GitHub's read APIs: commit, tree, history and CI.
  - An exact-SHA archive sat in the auditor's own area. All 880 blobs and 152 trees were recomputed and matched their Git object ids.
  - Earlier coverage was inherited only for byte-identical blobs.
- **What the auditor did not do.**
  - It re-ran no CI, repository test suite, application, browser or database. It read the exact-head CI logs.
  - It ran offline static route/contract composition, hashes and synthetic pure probes extracted from the exact source.
  - The negative controls it cites are **recorded implementer evidence it read, not auditor-executed**.

## 3. Coverage and what the acceptance is (mission §1)

Coverage as the re-audit reports it (`00_FINAL_REAUDIT_REPORT_VI.md`, "Coverage và phạm vi chấp nhận"):

| Scope | Full files | Lines read / total | Coverage |
|---|---:|---:|---:|
| changed runtime | 8/8 | 1,754/1,754 | 100.00 % |
| changed UI | 5/5 | 6,567/6,567 | 100.00 % |
| AUD-015…020 direct tests | 11/11 | 21,408/21,408 | 100.00 % |
| runtime, schema, contracts | 181/181 | 38,354/38,354 | 100.00 % |
| production UI including CSS | 54/54 | 30,451/30,451 | 100.00 % |
| critical tests | 33/61 | 29,590/54,641 | 54.15 % |
| **whole critical** | **327/383** | **117,915/161,139** | **73.18 %** |
| whole text | 375/609 | 122,030/358,399 | 34.05 % |

- **Cumulative critical coverage: 73.18 %. The whole repository stays PARTIAL.** This does not block the accepted engineering closeout.
- **Fresh semantic review:** 79 files / 35,681 unique lines. No material gap remains in the remediation-critical scope.
- **Not counted as a semantic read:** enumeration, search, hashes and generated structural parity.

**What the acceptance does not mean** (mission §1; each item is outside it):
- 100 % whole-repository semantic coverage;
- second-PC verification;
- legal approval;
- blanket owner approval;
- blanket real-case readiness;
- automatic authority confirmation;
- ownership, permission or infringement confirmation;
- G7, a signature, sending or platform submission.

## 4. The six blockers (mission §7)

Every disposition is **CLOSED_VERIFIED_WITH_LIMITS**. The basis is paraphrased from the re-audit's table; the limits are its own.

| Finding | Basis (re-audit) | Limits (re-audit) |
|---|---|---|
| R14-AUD-015 (MEDIUM) — one ERROR run blocked its epoch | The runs of E are ordered `(createdAt DESC, id DESC)`. An older diagnostic does not poison E; the newest diagnostic still blocks; completed, non-error runs that disagree stay a conflict | The general limits of the method (§2) |
| R14-AUD-016 (HIGH) — a G6 PASS of a reply counted with REQUIRES_DOCUMENT / MISSING_FACT asks | The three unresolved dispositions always hold G6 and refuse the export and its replay. The three resolved ones count under an attributable review. A malformed, duplicate or foreign-parent disposition is never ready | The general limits of the method; ask-set completeness is the human G6 reviewer's (§6) |
| R14-AUD-017 (MEDIUM) — the G6 form could not record ask dispositions | The normal NMI + G6 workflow has the editor with all seven fields, the parent fixed from the prompt and no default disposition. The round trip is POST → storage → reload → history, and a 412 is never retried automatically | No fresh browser, DB or test run by the auditor; web readiness is supplied by a fake in the web tests; completeness of every material ask stays the attributable G6 reviewer's responsibility |
| R14-AUD-018 (MEDIUM) — `listAuditEvents` unrouted | The GET route is exactly as contracted: authenticated and no-store, with a narrowly scoped cursor and `q`. It returns history as stored and writes nothing (no business, audit or idempotency write) | Historical events contain R14-AUD-021's pre-existing issue. P1's session activity (`lastSeenAt`) lies outside the business read-only invariant |
| R14-AUD-019 (MEDIUM) — READY and a handoff stayed shown after a same-page write | A shared generation drops the current evaluation, handoff and copy control after a successful write, and late GET or export responses (success or error) are discarded. R14-AUD-022 is a different retry defect and restores no stale handoff | A failed write whose committed outcome is unknown does not invalidate (REV-FINAL-06, display backlog; the server's export guards stay intact). No abort controller. No cross-tab or polling claim |
| R14-AUD-020 (HIGH) — the export replay judged its reads at the request's earlier instant | The clock is sampled after the awaited `scopedInput`, right before the evaluation. The current guard only decides whether to release; a valid response keeps its history | Static review, exact-head CI logs and an offline probe; no auditor HTTP, database or concurrency run. The snapshot guard cannot discover unrecorded external events |

## 5. R14-AUD-005 and R14-AUD-006 — final disposition

- **R14-AUD-005 — CLOSED_VERIFIED_WITH_LIMITS** (ADR-0008, Model A).
  - Closed for Model A at this target: no longer an unimplemented CandidateAssessment prerequisite.
  - The plan-source closure stays non-waivable: `PLAN.SOURCE_IN_CONTEXT` is never waived.
- **R14-AUD-006 — CLOSED_VERIFIED_WITH_LIMITS** (ADR-0009). The exact historical 1–100 AssessmentSource read-back is closed at this target, and the existing storage is sufficient.
- **The re-audit's basis:** the limits reviewed before, and this time the cross-regression byte identity and traces.
  - No new implementation mission is opened, because CandidateAssessment exists.
  - Nothing waives `PLAN.SOURCE_IN_CONTEXT` or a technical REVIEW_REQUIRED.
  - Version-only prompt drift stays a conservative REVIEW_REQUIRED, not a mandatory re-draft. No rebinding or override workflow is created.

## 6. Policy decisions — REV-FINAL-04 and NMI ask-set completeness (mission §7)

**REV-FINAL-04 = ACCEPTED_FOR_CURRENT_MODEL** (the re-audit's choice `A_VALID_WITH_SUBSTANTIVE_CANDIDATE_AND_G6_RECORD`; NON_BLOCKING).
- No frozen rule requires `sourceIds.length > 0` for each answered ask, or a separate limitation or not-applicable-reason field.
- The evidence lies in:
  - the exact candidate;
  - the G6 review's rationale, scope and limitations;
  - its AssessmentSupport rows.
- A non-empty source list does not prove that a document answers the ask, and a missing separate field does not prove that evidence is absent.
- **Not imposed:** `sourceIds.length > 0` for every ANSWERED_SUPPORTED disposition merely to make a checkbox look stronger. Source presence is not proof.

**NMI_ASK_SET_COMPLETENESS = ACCEPTABLE_HUMAN_G6_RESPONSIBILITY** (the re-audit's choice `A_ACCEPTABLE_HUMAN_G6_RESPONSIBILITY`; `NON_BLOCKING_LIMITATION_OF_AUTOMATED_VERIFICATION`).
- The software validates the structured dispositions actually recorded:
  - at least one;
  - exactly the prompt's parent;
  - no ask twice;
  - contracted values only;
  - cited sources applying now.
- The attributable human G6 reviewer stays responsible for reading the whole parent NMI and ensuring every material ask is addressed. No canonical structured registry of a parent's asks exists.
- **No automated ask-set completeness is claimed and no NLP extraction is introduced.** A future structured ask registry would need its own design and contract decision.

## 7. New LOW findings — R14-AUD-021 and R14-AUD-022 (mission §8–§9)

Neither is implemented in this mission. Implementing either would change production code after the independently reviewed target.

| Finding | Record |
|---|---|
| **R14-AUD-021** (alias **AUD018-RED-01**) | **LOW · NON_BLOCKING · OPEN_BACKLOG**. The Agency / LegalSubject audit writer can store nested attribution free text (`fieldAttributions[].scopeText`, `.limitations`) raw in `AGENCY_CREATED`/`_UPDATED` and `LEGAL_SUBJECT_CREATED`/`_UPDATED` events: `auditValue` redacts only top-level strings, not inside the array (pre-existing since P2; the routed audit read returns the rows exactly as stored). Current impact: authenticated local operator boundary; no demonstrated credential, session or body leak; not a final-closeout blocker; historical audit rows must not be silently rewritten. **Future remediation principle:** redact nested free text at the **writer**, for **new** audit events only, keeping identifiers, provenance, source ids, `asOf` values and useful length metadata; historical rows stay as stored (a retroactive purge would need a separately authorized policy) |
| **R14-AUD-022** | **LOW · NON_BLOCKING · OPEN_BACKLOG**. A late response of export request A can call `intent.done()` before the generation guard (`apps/web/src/app/cases/readiness.tsx`) and clear the idempotency key of a newer export B. If B committed but its response was lost, a retry of B can allocate another key and may record a duplicate `EXPORT_UNSIGNED` audit event. The re-audit found **no** stale handoff release, readiness bypass, signing, sending or external action (both B and any retry are evaluated by the server against fresh captured records). **Future minimal remediation:** the generation guard before `intent.done()`, plus a late-A / lost-B / same-key-retry regression test |

## 8. Evidence observations and the one documentation correction (mission §11)

| Observation (re-audit) | Classification | Handling |
|---|---|---|
| DOC-OBS-ERROR-FIXTURE-DESCRIPTION | LOW documentation inaccuracy, non-blocking | **Corrected here, documentation only.** The remediation record §5 said the DB tests and `smoke:p4i` both wrote the ERROR run as a synthetic stored row. Checked against the code: the DB tests produce ERROR runs through the injected `VALIDATION_OBSERVER` seam (`beforeRule` throws at a named rule, `tests/db/p4i-http.test.ts` 127–136) and the normal `POST /candidates/{id}/validation-runs` (1799–1811). Only the compiled `smoke:p4i` inserts its synthetic ERROR run with SQL (`insertSyntheticErrorRun`, `scripts/local/p4i-smoke.ts` 170–206), because the compiled API has no failure seam. The DB tests' separately labelled "synthetic corruption" updates of stored rows are unchanged: in the R14-AUD-015 scope, R-28's result and the not-executed-rule coverage (`p4i-http.test.ts` 1426/1434 and 1928); elsewhere, for example R-08 (1151/1160) and a G6 test's corrupt ask dispositions (2143). Corrected in the remediation record (§5 and the §17 observation summary), with a correction note under OBS-FINAL-02 in `evidence/final-audit-own-code-review.txt`. No runtime or test behaviour changed |
| REV-FINAL-05 | non-blocking test limitation, documented | unchanged: `smoke:p4i`'s replay-after-boundary check does not discriminate; the DB tests A–D and NC-FINAL-020-A/B carry the proof |
| NC-FINAL-016-C-SCOPE | evidence scope only, non-blocking | NC-FINAL-016-C / -C2 prove the no-disposition and duplicate guards — structural recorded-ask coverage, not that every literal material ask of the parent was counted (§6) |

## 9. Backlog carried unchanged (mission §10)

Nothing in the backlog is closed because the final engineering audit passed.

| Item | Status |
|---|---|
| R14-AUD-002 — a candidate import/revision replay after supersession returns the current lifecycle overlay | **OPEN_BACKLOG** |
| R14-AUD-007 — the validation-history UI stops after about 1,000 runs | **OPEN_BACKLOG** |
| R14-AUD-011 — the Revise Source page drops seconds and milliseconds | **NON_BLOCKING_BACKLOG** (LOW) |
| R14-AUD-012 — the Owner's legal-subject picker keeps a hidden earlier selection | **NON_BLOCKING_BACKLOG** (MEDIUM) |
| R14-AUD-021, R14-AUD-022 | **OPEN_BACKLOG** (LOW, NON_BLOCKING; §7) |
| REV-P4I-02 — lock-order deadlock retry between an export and a supersession | LOW, retry-availability backlog |
| Two independent assessment heads of one gate at one epoch | **CONFLICT** until an explicit reconciliation workflow (its own ADR) or an epoch change |
| D-6 — a waiver or disposition of technical REVIEW_REQUIRED | **deferred** (none exists) |
| W-2 (baseline strictness), W-3 (the `PLAN.SOURCE_IN_CONTEXT` message text), O-1 (another owner's id in an issue's details), O-3 (a plan source reachable only through a paused link) | backlog, unchanged |
| REV-FINAL-02 (ask dispositions accepted on G1–G5), REV-FINAL-03 (no `(created_at, id)` index for the audit read), REV-FINAL-06 (no invalidation after an unknown-outcome write) | backlog, unchanged |
| U+2800 visible-text observation (REV-P4I-01's bounded rule counts a blank-rendering graphic symbol as visible) | observation, unchanged |
| The remaining app-wide `.table-frame` accessibility scope (scrollers on pages not touched by P4H/P4I) | backlog, unchanged |
| `getMeta` | contracted, intentionally unrouted; non-blocking (`AppMeta.schemaRelease` stays `TB-SCHEMA-API-v1.0.0` as recorded) |
| The other open items of `docs/CURRENT_STATE.md` "Remaining requirements" | unchanged |

## 10. Decisions — final status of ADR-0008 … ADR-0011 (mission §12–§15)

Each ADR gets a new status line. Each also gets an "Acceptance history" section that keeps its earlier status text verbatim and the operator's decisions unchanged. No ADR is rewritten as though the independent review had happened before its implementation. ADR-0006 and ADR-0007 (accepted at R14 final with documented qualification) are unchanged.

| ADR | Final status | Recorded with it |
|---|---|---|
| ADR-0008 — candidate assessment freshness uses the current dependency epoch | **ACCEPTED**; independent final engineering audit **VERIFIED_WITH_LIMITS** at `3d43268` | R14-AUD-005 **CLOSED_VERIFIED_WITH_LIMITS**; D-1…D-6 unchanged (D-6 deferred) |
| ADR-0009 — candidate assessment support rows require an additive historical read | **ACCEPTED**; independent final engineering audit **VERIFIED_WITH_LIMITS** at `3d43268` | R14-AUD-006 **CLOSED_VERIFIED_WITH_LIMITS**; TB-SCHEMA-API-v1.4.0 **ACCEPTED / ACTIVE** (the release README's status lines follow; `amendment.json` byte-identical, sha256 `fb6b14a9…5c85`) |
| ADR-0010 — TB-TECHNICAL-RULESET-v3 | **ACCEPTED**; independent final engineering audit **VERIFIED_WITH_LIMITS** at `3d43268` — v3 recommended for its reviewed engineering semantics, accepted by the operator | the 29-rule identity, v1/v2 run immutability, the pinned vocabulary and the technical-only meaning (no G1–G7 implication) unchanged |
| ADR-0011 — derived readiness and revalidated unsigned export | **ACCEPTED**; independent final re-audit **VERIFIED_WITH_LIMITS** at `3d43268` | accepted for its reviewed engineering semantics. Human G6 truth and completeness stay an attributable human responsibility; the application sees only captured state; uncaptured external changes are not automatically detectable. The P4I acceptance, the HOLD at `abc31fc` and the revision for R14-AUD-015/016 are kept |

## 11. Active engineering identifiers (mission §16)

| Kind | Identifier | Status |
|---|---|---|
| Frozen reference | `TB-SCHEMA-API-v1.0.0` | frozen (never edited) |
| Active wire contract | `TB-SCHEMA-API-v1.4.0` — 291 schemas, 145 operations, 100 paths | **ACCEPTED / ACTIVE** |
| Production form contract | `PFC-YT-EMAIL-v1.1` | **ACTIVE** |
| Production-context digest | `TB-PRODUCTION-CONTEXT-DIGEST-v2` | **ACCEPTED / ACTIVE** |
| Prompt template | `TB-PROMPT-TEMPLATE-v1` | **ACTIVE** |
| Candidate artifact | `TB-CANDIDATE-ARTIFACT-v1` | **ACTIVE** |
| Technical ruleset | `TB-TECHNICAL-RULESET-v3` | **ACCEPTED / ACTIVE** (runs recorded as v1 or v2 stay as recorded) |

- **No identifier is bumped.** The re-audit recommends keeping the existing identifiers: the readiness corrections consume immutable runs and assessments and change no technical rule, marker vocabulary or context semantics.
- **What the identifiers are.** Each names an engineering definition only. None is a legal approval, a G1–G6 review, readiness or READY_FOR_SIGNER. `AppMeta.schemaRelease` stays `TB-SCHEMA-API-v1.0.0` as recorded.

## 12. Route status (mission §17)

| Item | Value |
|---|---|
| Contract operations | **145** |
| Runtime routed | **144** — 140 business operations plus the four P1 routes |
| Intentionally unrouted | **`getMeta`** — not routed during closeout |
| `listAuditEvents` | **ROUTED · VERIFIED_WITH_LIMITS** (R14-AUD-018) |
| Routes outside the contract | **none** |
| sign, send, submit, G7, AS_SENT-from-export | **no route exists** |

Asserted by `tests/db/p4i-http.test.ts` "route parity: every contracted operation but getMeta is routed (144 of 145), no route outside the contract exists, and no sign, send, submit, AS_SENT or G7 route". It is part of `yarn test:db`, 635 / 16 files in run 36568539343 on the exact target, and runs again in every later CI run.

## 13. Status boundaries and G7 (mission §3–§4, §31–§32)

These statuses are kept separate and never collapsed:

| Status | Value |
|---|---|
| SYSTEM_SETUP_STATUS | **VERIFIED_COMPLETE** (accepted single-PC engineering scope) |
| OWNER_STATUS | **OWNER-SPECIFIC / NOT GLOBALLY ASSERTED** — the system closeout grants no OWNER_STATUS = PASS for any owner |
| CASE_READINESS_STATUS | **CASE-SPECIFIC** — derived independently for each exact case by `getCandidateReadiness` from its current captured records; no actual case was evaluated |
| EXTERNAL_ACTION_STATUS | **PROHIBITED UNTIL ACTUAL G7 / SEPARATE OPERATOR AUTHORIZATION** |

- **G1–G6.** The application records attributable reviews (CandidateAssessment) and evaluates them through the current captured records (readiness).
- **G7 — AUTHORIZED HUMAN ONLY · NOT IMPLEMENTED.** The actual authorized human review, adoption, signature and sending happen outside the application.
- **What the application never does:**
  - sign, adopt, certify or swear;
  - send or submit;
  - contact an uploader;
  - retract or respond to a counter-notification;
  - create an AS_SENT record without an actual transmission.
- **The unsigned export stays** HUMAN_PENDING, with `sendPerformed` false and `externalAction` PROHIBITED.
- **Signature and send: NOT IMPLEMENTED.**

## 14. Controlled real-case internal workflow (mission §2, §31)

**CONTROLLED REAL-CASE INTERNAL WORKFLOW = ENGINEERING-CAPABLE SUBJECT TO CANONICAL RECORDS AND PER-CASE GATES.**

The application may technically support controlled internal processing of a real case only when:
- the canonical Drive records exist;
- the current captured records are accurate;
- the exact case_id / owner_id scope is used;
- the per-case G1–G6 gates are actually performed;
- the current technical and readiness state is evaluated;
- the human-controlled requirements are satisfied where required.

It does **not** mean that any actual case is READY. No actual case was evaluated by the re-audit or by this closeout.

An actual case still needs:
- its exact case packet;
- canonical evidence;
- current records;
- G1–G6;
- the current technical state;
- case-specific readiness;
- authorized human G7.

Never reported: "all real cases ready" or "production legally approved".

## 15. Second PC and the single-PC scope (mission §1)

The second-PC reproduction stays **DEFERRED_BY_OPERATOR**, and ADR-0003 is unchanged.
- `P0_SECOND_PC` = DEFERRED_BY_OPERATOR.
- `P0_TWO_PC_ACCEPTANCE` = NOT_COMPLETED.
- `P0_OVERALL` stays NOT_COMPLETE against the original two-PC contract.
- `SYSTEM_SETUP_STATUS = VERIFIED_COMPLETE` names the accepted single-PC engineering scope only. No two-PC acceptance is claimed.

## 16. Documentation delta and closeout checks (mission §20–§22)

**Expected and actual delta: documentation only.** None of the following changed:
- production code, test code or contract source;
- generated contract artifacts or `amendment.json` (sha256 `fb6b14a9781980f06ab7d1e41952feb478ee37f4df9df54f09d2fe941ff15c85`, before and after);
- the Prisma schema or migrations (`20260923103912_initial_schema`, sha256 `b54c36fd…6515`, still the only one);
- `package.json` or the lockfile;
- `docs/reference/**`.

Changed files:
- `docs/verification/final-audit/FINAL_ENGINEERING_AUDIT_CLOSEOUT.md` — new, this record;
- `docs/verification/final-audit-remediation/FINAL_AUDIT_REMEDIATION_AUD015_AUD020.md` — the pointer here, the "recorded later" status rows, §22, the §5 and §17 fixture wording (§8);
- `docs/verification/final-audit-remediation/evidence/final-audit-own-code-review.txt` — a correction note under OBS-FINAL-02 (the original text kept);
- `docs/decisions/ADR-0008-…`, `ADR-0009-…`, `ADR-0010-…`, `ADR-0011-…` — the final status lines and "Acceptance history" (§10);
- `docs/contracts/TB-SCHEMA-API-v1.4.0/README.md` — the decision and verification lines and the closing paragraph. This follows the R14 final precedent for the v1.3.0 README (`f1b6aaf`); `amendment.json` is untouched;
- `docs/verification/p4h/P4H_CANDIDATE_ASSESSMENT.md` and `docs/verification/p4i/P4I_READINESS_UNSIGNED_EXPORT.md` — a pointer paragraph, a "recorded later" status row and a final-acceptance section each;
- `docs/CURRENT_STATE.md` and `CLAUDE.md`.

Pre-flight (mission §5), after `git fetch origin`:
- branch `feature/final-audit-remediation-aud015-aud020` at `3d432688a20266548447d71029830a4bbf85e38d`, equal to its origin;
- `origin/main` = `abc31fc350311aa21945776ec266ef48935e46c9`; the worktree clean;
- no pull request of the branch in any state;
- `gh` authenticated as the repository owner's account;
- run 36568539343 on the exact target completed with **success, both jobs** (logs read, below).

**Exact-target CI, run [36568539343](https://github.com/TuongChris/tb-notice-production-system/actions/runs/36568539343)** (push, 2026-09-29T12:30:18Z–12:42:25Z), logs read:
- "Non-DB checks (cold install)" (job 109406427039, 12:30:20Z–12:32:37Z):
  - `reference:check` OK (`MANIFEST.sha256` `42c2a419…`); the 27 helper tests pass;
  - `contracts:check` "3 generated outputs match the active source."; lint "Found 0 warnings and 0 errors."; Prettier clean;
  - `yarn test` **1736 in 57 files**; the working tree clean.
- "Database, seed and smoke (MySQL 8.4.11)" (job 109406427235, 12:30:20Z–12:42:24Z):
  - `db:verify` PASS (foreign keys 125/125, CHECK constraints 30/30, domain rows 0); `yarn test:db` **635 in 16 files**;
  - the replay deploy "No pending migrations to apply."; the seed canonical (`0ee26dc3…b775`); both drift diffs "-- This is an empty migration.";
  - `smoke:local` 73, `smoke:auth` 4, `smoke:directory` 14, `smoke:p3a` 24, `smoke:p3b` 36, `smoke:p4a` 50, `smoke:p4b` 64, `smoke:p4c` 62, `smoke:p4d` 85, `smoke:p4e` 81, `smoke:p4f` 88, `smoke:p4g` 143, `smoke:p4h` 149, **`smoke:p4i` 205**;
  - the P1 admin and recovery checks; `yarn dev` shutdown "PASS (4/4 scenarios)"; the working tree clean; `reference:check` after the run.

**Closeout checks** on the complete closeout tree before the commit (2026-09-29T15:27:30Z–15:28:43Z; repeated after this paragraph and the review fixes were written — the results are recorded at the end of this section):
- `yarn reference:check` OK (`MANIFEST.sha256` `42c2a419…` matches the pin);
- `yarn contracts:check` OK ("3 generated outputs match the active source.");
- `yarn typecheck` exit 0;
- `yarn lint` exit 0, and `oxlint --deny-warnings --format default` "Found 0 warnings and 0 errors." (358 files) — **0 warnings**;
- `yarn format:check` "All matched files use Prettier code style!";
- `yarn test` **1736 / 1736 in 57 files** — the same totals as on the audited target, since no test changed. It includes `tests/tooling/gate-terminology.test.ts` (3 / 3), which scans the edited records.

`yarn test:db` and the compiled smokes were not run locally: no code, test, contract or schema changed. They run in CI on the closeout head (§17).

A read-only review of this documentation diff (Claude's own review through a subagent — not an independent review) checked:
- the claims against the audit artifacts and the code;
- the section references and the verbatim preservation of the ADRs' earlier status text;
- over-claims and gate terminology.

Its findings and their handling are recorded below.

| Own-review finding (documentation) | Handling |
|---|---|
| 1 — ADR-0010's acceptance was credited to the audit ("the independent final engineering audit accepted v3"). §10 and the Decisions row of `CURRENT_STATE.md` also left out "VERIFIED_WITH_LIMITS at `3d43268`" | **Fixed**: the audit recommends and the operator accepts; the audit result is stated with it |
| 2 — `CLAUDE.md` summarized P4H, P4I, Readiness, the Unsigned Export and CandidateAssessment as "VERIFIED_WITH_LIMITS", not their recorded labels | **Fixed**: VERIFIED_COMPLETE_FOR_ACCEPTED_SCOPE for those; CLOSED_VERIFIED_WITH_LIMITS for the findings; ACCEPTED for the ADRs; the audit's VERIFIED_WITH_LIMITS as their basis |
| 3 — superseded statuses could still read as current in three places: the unnumbered status tables of the P4H, P4I and remediation records, and the "Completed" row of `CURRENT_STATE.md` | **Fixed**: each record's note covers the older table rows; "then" markers and pointers to the acceptance are added |
| 4 — a placeholder promised check results that were not recorded | **Fixed**: this section records them |
| Note — the corrected fixture sentence said "the DB tests' only direct row changes …", true only in the R14-AUD-015 scope | **Fixed**: scoped to the R14-AUD-015 tests and R-28; the other labelled synthetic-corruption updates are named (§8) |
| Found before the review, by re-reading | The abbreviated sha256 of `00_FINAL_REAUDIT_REPORT_VI.md` was mistyped (`…b3a8`); **fixed** to `…b1a8`. Every abbreviated hash was then checked against the full values |

The review also re-derived the following and found them correct:
- the ZIP and member hashes, the manifest and the coverage arithmetic;
- the verdict strings, the six blocker bases and limits, and the new findings;
- the cited test and script line ranges and every section reference;
- each ADR's earlier status text, preserved verbatim;
- zero gate-terminology hits, intact tables, and the merge and post-main CI PENDING everywhere.

**Checks repeated on the tree with every review fix** (2026-09-29T15:45:11Z–15:46:16Z). The same six commands all exit 0 with the same results:
- `reference:check` OK;
- `contracts:check` OK;
- `typecheck`;
- `lint` / oxlint "Found 0 warnings and 0 errors." (358 files);
- `format:check` clean;
- `yarn test` **1736 / 1736 in 57 files**, gate terminology 3 / 3.

After this paragraph was added, `format:check`, `yarn test` and the gate-terminology test were run once more on the final tree (reported with the final report).

## 17. Heads, pull request, merge and post-main CI (mission §23–§29)

| Name | Value |
|---|---|
| `INDEPENDENTLY_AUDITED_HEAD` | `3d432688a20266548447d71029830a4bbf85e38d` — the remediation documentation on the code head `2df10c8` |
| `AUDITED_CODE_HEAD` | `2df10c85ae4189c1ecd81748f0a41fb2fef47e4a` |
| Previous `main` | `abc31fc350311aa21945776ec266ef48935e46c9` (the P4I merge, pull request #13) |
| `FINAL_ACCEPTANCE_CLOSEOUT_HEAD` | the documentation commit that adds this record. A commit cannot record its own SHA or run; both are reported with the mission's final report |
| Closeout-head CI | **PENDING** |
| Pull request (`feature/final-audit-remediation-aud015-aud020` → `main`) | **PENDING** — authorized by this mission only after the closeout-head CI is green. The commits after the independently audited target are documentation-only acceptance records |
| PR-head CI | **PENDING** |
| Merge | **PENDING** — authorized as a **normal merge commit** only (`gh pr merge <n> --merge --match-head-commit <closeout head>`). No squash, rebase, force-push or admin bypass; the branch is kept |
| `FINAL_MERGE_COMMIT` | **PENDING** — not written before it exists |
| Post-main CI | **PENDING** |

The pull request, the merge commit, its parents and tree and the post-main CI are observed after this commit. They are reported with the mission's final report and reconciled in the repository by a later mission, as for earlier closeouts. Until then, this record is an accepted independent review of the remediation branch, **not yet proof of merge or `main` integration**.

## 18. Status (maximum claim of this mission)

**Before the merge** (this record): FINAL_ENGINEERING_AUDIT = **PASS**; SYSTEM_SETUP_STATUS = **VERIFIED_COMPLETE · ACCEPTED_SINGLE_PC_ENGINEERING_SCOPE**; P4H, P4I, CandidateAssessment, Readiness and Unsigned Export = **VERIFIED_COMPLETE_FOR_ACCEPTED_SCOPE**; remediation merge **PENDING**; post-main CI **PENDING**.

**Only after the exact post-main CI succeeds** may the final report add **MERGED_TO_MAIN**:
- SYSTEM_SETUP_STATUS = VERIFIED_COMPLETE · ACCEPTED_SINGLE_PC_ENGINEERING_SCOPE · MERGED_TO_MAIN;
- P4H and P4I = VERIFIED_COMPLETE_FOR_ACCEPTED_SCOPE · MERGED_TO_MAIN.

If the post-main CI fails, SYSTEM_SETUP_STATUS is not reported as merged VERIFIED_COMPLETE.

**The strongest claim this closeout allows:**
- FINAL_ENGINEERING_AUDIT = PASS;
- SYSTEM_SETUP_STATUS = VERIFIED_COMPLETE · ACCEPTED_SINGLE_PC_ENGINEERING_SCOPE (· MERGED_TO_MAIN after the green post-main CI);
- CONTROLLED REAL-CASE INTERNAL WORKFLOW = ENGINEERING-CAPABLE SUBJECT TO CANONICAL RECORDS AND PER-CASE GATES;
- CASE_READINESS_STATUS = CASE-SPECIFIC;
- G7 = AUTHORIZED HUMAN ONLY;
- EXTERNAL_ACTION_STATUS = PROHIBITED UNTIL ACTUAL G7 AND SEPARATE OPERATOR AUTHORIZATION.

No stronger legal or case-specific claim is authorized.

**After the post-main CI: no further feature implementation.** Not started without a separate authorization:
- the AUD-021 or AUD-022 remediation;
- `getMeta`;
- G7, sign or send;
- the second-PC reproduction;
- deployment;
- real-case ingestion.

Any later activity is a separately authorized operational, maintenance, backlog, deployment, second-PC or real-case mission.
