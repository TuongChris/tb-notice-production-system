# P4H — Candidate assessment capture and historical support read-back (home PC)

Mission **TB_P4H_CANDIDATE_ASSESSMENT_FAST_TRACK_IMPLEMENTATION** (operator-authorized fast track, 2026-09-28/29). Branch `feature/p4h-candidate-assessment`, created from the exact pre-assessment architecture head `5afd2ec3052baf50c88778e39d4b1a1bf835a438` (`feature/pre-assessment-aud005-aud006-architecture`; `main` `20367b9` + four documentation commits).

> **INDEPENDENT ASTRA REVIEW DEFERRED BY OPERATOR.** The operator accepted ADR-0008, ADR-0009 and ADR-0010 for implementation without waiting for the independent review. **P4H is self-verified engineering implementation, not independent assurance.** Nothing here is recorded as independently verified.

P4H routes **three** operations and adds the G1–G6 review section of the candidate page:

- `captureCandidateAssessment` (POST `/candidates/{candidateId}/assessments`; TB-SCHEMA-API-v1.0.0, unrouted until now);
- `listCandidateAssessments` (GET `/candidates/{candidateId}/assessments`; TB-SCHEMA-API-v1.0.0);
- `getCandidateAssessmentSources` (GET `/candidates/{candidateId}/assessments/{id}/sources`; the additive release **TB-SCHEMA-API-v1.4.0**, ADR-0009).

It activates TB-SCHEMA-API-v1.4.0 and records new technical validation runs under **`TB-TECHNICAL-RULESET-v3`** (ADR-0010). No migration, no schema change.

**Merged (2026-09-29):** pull request #12, merge commit `19a7cb2` (parents `20367b9` and the closeout head `6a7fae7`; its tree is identical to `6a7fae7`); `main` push CI run 36514894511 success, both jobs, logs read. `P4H = IMPLEMENTED_SELF_VERIFIED, MERGED_TO_MAIN` (§23). The independent review stays deferred; nothing here is independently verified. The statuses in §1–§22 are those of their time.

Persistent rules (they stay in force; `CLAUDE.md` carries them):

- **An assessment is one attributable G1–G6 review record, not a decision about readiness.** A CandidateAssessment records one review of one gate — G1 authority/standing, G2 work-specific rights, G3 reported-material identification, G4 evidence/audiovisual comparison, G5 permission/copyright exceptions, G6 exact candidate artifact consistency, traceability and whole-artifact QA — of one exact candidate artifact at one evaluation epoch, as the operator records it, with the linked sources it rests on. Recording is not counting: it is never readiness, READY_FOR_SIGNER, G7 (the actual human review, adoption, signature and sending outside the application), a signature, legal approval or permission to send.
- **Exact epoch binding (ADR-0008, R14-AUD-005).** E = (candidateId, artifactSha256, dependencyDigest, rulesetVersion): the path's candidate, its stored artifact (412 `ARTIFACT_CHANGED` otherwise), the CURRENT digest of its prompt snapshot's scope (412 `CONTEXT_CHANGED`, never substituted), the ruleset the server runs now (422 `RULESET_NOT_CURRENT`) and a recorded ValidationRun of exactly E (422 `VALIDATION_RUN_REQUIRED`; its result may be anything — TECHNICAL_PASS is not required, and an assessment never changes a run or turns REVIEW_REQUIRED into TECHNICAL_PASS).
- **Supports are this case's LINKED sources; a PASS rests only on sources that apply now (D-3).** A support names a CaseSource of this case (422 `CROSS_CASE_REFERENCE`) that is LINKED (409); a PASS needs every cited source to apply to the case now (422 with its scope code, e.g. `CROSS_OWNER_REFERENCE`); HOLD, BLOCKED, MISSING and CONFLICT may cite a linked source that no longer applies, to record the problem truthfully. Every review cites at least one source (D-5).
- **DOCUMENT_REVIEWED is never inferred (D-4).** An AI_ASSISTED performer with DOCUMENT_REVIEWED is 422 `REVIEW_UNSUPPORTED` {reason `AI_ASSISTED_PERFORMER`}; a HUMAN or DOCUMENTED_EXTERNAL_REVIEW performer records it only as the operator's explicit statement of an actual review.
- **History is immutable.** No assessment or support row is updated or deleted (no ETag). A successor supersedes the head of the chain of the same candidate and gate, across epochs (D-2); the predecessor and its rows stay byte-identical, and a second successor is 409 `ASSESSMENT_ALREADY_SUPERSEDED`. A superseded candidate can be assessed as the historical artifact it is (D-1); it never counts.
- **Historical support read-back (ADR-0009, R14-AUD-006).** `getCandidateAssessmentSources` returns exactly the stored AssessmentSource rows of one assessment of this candidate — never the present link state, a newer source revision or a present-day applicability, which are separate reads shown apart.
- **No waiver, disposition, readiness, export, G7 or external action (D-6).** Nothing waives, disposes of or overrides a technical issue; readiness and the unsigned export stay unrouted (404); nothing is signed, adopted, sent, fetched or submitted; no AI provider, network, mail or Drive call exists.

## Status by scope (not collapsed)

| Scope | Status |
|---|---|
| Operator fast-track acceptance | ADR-0008 and ADR-0009 **ACCEPTED_BY_OPERATOR · INDEPENDENT_REVIEW_DEFERRED** (D-1…D-6 recorded in ADR-0008, "Operator acceptance"); ADR-0010 **ACCEPTED_BY_OPERATOR · INDEPENDENT_REVIEW_DEFERRED** (§1) |
| TB-SCHEMA-API-v1.4.0 | **ACTIVE on the branch** (`CONTRACT_BASELINE`; 291 schemas, 145 operations, 100 paths; amendment sha256 `fb6b14a9…5c85`) (§2) |
| TB-TECHNICAL-RULESET-v3 | **ACTIVE on the branch** for new runs; v1/v2 runs stay as recorded (§3) |
| P4H implementation | **IMPLEMENTED_SELF_VERIFIED** — code head `1eff3f3` (§17) |
| Automated tests | **PASS** — `yarn test` 1636 in 55 files, `yarn test:db` 580 in 15 files (§15, §16) |
| Consistency / concurrency tests | **PASS** — §8 |
| Browser verification (Playwright MCP, `tb_notice_test`) | **PASS** 15/15 of mission §53 plus 3 supplementary; one LOW app-wide observation (§12) |
| Negative controls | **PASS** 13/13 (NC-P4H-01…13), restored byte-identically (§13) |
| `smoke:p4h` | **PASS (151 checks)** in branch CI (§14, §18) |
| Full regression (mission §55) | **PASS** — 21/21 steps exit 0 on the code head `1eff3f3` (§16) |
| Branch CI | **PASS** — push run 36511717843 on `1eff3f3`, both jobs success, logs read (§18). The closeout head `6a7fae7` — push run 36513211881 and pull_request run 36513959839; the post-merge `main` `19a7cb2` — push run 36514894511; all success, both jobs, logs read (§23) |
| Merge | **MERGED_TO_MAIN** — pull request #12, merge commit `19a7cb2` (merge commit method; 2026-09-29T02:56:10Z); `main` push CI run 36514894511 success, both jobs (`MAIN_POST_P4H_CI = PASS`, §23) |
| Schema / migration | **No change** (§19) |
| R14-AUD-005 | **IMPLEMENTED_SELF_VERIFIED · INDEPENDENT_REVIEW_DEFERRED** |
| R14-AUD-006 | **IMPLEMENTED_SELF_VERIFIED · INDEPENDENT_REVIEW_DEFERRED** |
| CandidateAssessment | **IMPLEMENTED_FOR_CAPTURE_AND_HISTORY** — not readiness, READY_FOR_SIGNER, G7, legal approval or send permission |
| Readiness / unsigned export | **NOT_STARTED** (unrouted, 404) |
| G7 | **HUMAN_CONTROLLED_NOT_IMPLEMENTED** |
| External action | **NONE**; real case data **0** |
| Real-case production authorization | **NOT GRANTED** by this mission |

## 1. Operator acceptance and decisions

The operator accepted the pre-assessment architecture committed at `5afd2ec` for implementation (ADR-0008 "Operator acceptance"), with the independent Astra architecture review deferred:

| Decision | Resolution (as implemented) |
|---|---|
| D-1 capture on a superseded candidate | Allowed as a historical review; never counts; the candidate's supersession is unchanged (DB test "D-1", web test "D-1") |
| D-2 cross-epoch supersession | A successor supersedes the head of the same candidate and gate whatever the epochs; staleness is separate |
| D-3 non-PASS citation of an inapplicable source | Allowed for HOLD, BLOCKED, MISSING, CONFLICT; refused for PASS (`assertSourcesUsable` with the case as target, `source-scope.ts` — the same locking check as the other writes: the recorded scope, then another owner's use) |
| D-4 AI_ASSISTED + DOCUMENT_REVIEWED | 422 `REVIEW_UNSUPPORTED` {reason `AI_ASSISTED_PERFORMER`} — a request-only rule, before the claim |
| D-5 support-less negatives | Not introduced: `sources` keeps `minItems` 1 |
| D-6 disposition of technical REVIEW_REQUIRED issues | Deferred: no waiver, disposition, override or rebinding exists |

ADR-0010 (`TB-TECHNICAL-RULESET-v3`) was decided with the activation: TB-SCHEMA-API-v1.4.0 is an identifier the application emits (a new prompt's header and `contractVersion`), which v2's pinned vocabulary cannot detect; extending v2 in place would repeat R14-AUD-003.

## 2. Contract TB-SCHEMA-API-v1.4.0 (ADR-0009)

- Release record `docs/contracts/TB-SCHEMA-API-v1.4.0/amendment.json`, sha256 `fb6b14a9781980f06ab7d1e41952feb478ee37f4df9df54f09d2fe941ff15c85`, base TB-SCHEMA-API-v1.3.0 (record `6b74c09a…1630`), exactly the delta proposed in `docs/proposals/TB-SCHEMA-API-v1.4.0-assessment-support-readback.md`: the operation `getCandidateAssessmentSources` and the schemas `CandidateAssessmentSourcesView` and `GetCandidateAssessmentSourcesResponse`.
- Generated artifacts (the release's `result.files`, reproduced by `yarn contracts:check` and the release test):
  - `packages/contracts/schemas/api-schemas.json` `bd2cbf509af6958e13f6a8fc7988f8a28d34cd35eebe00c9616e015f7e5087a4`;
  - `packages/contracts/openapi/openapi.json` `ea24df81c6e707957d746ec80ebc39bf82bdda2f333410af5729a001a96fb8fe`;
  - `packages/contracts/openapi/openapi.yaml` `e22ec29ea67aa481cfa8762e295bcf67a80a6265f4bf460ff60b16b86868c149`.
- Inventory: **291 schemas, 145 operations, 100 paths**; `info.version` 1.4.0; `CONTRACT_BASELINE` = `TB-SCHEMA-API-v1.4.0`. All 284 frozen, 286 v1.1.0, 288 v1.2.0 and 289 v1.3.0 schemas and all 141/142/143/144 earlier operations are byte-identical and in order; every assessment schema and operation is unchanged since v1.0.0 (`tests/contracts/release-v1-4-0.test.ts`, 13 tests). Each earlier release is still reproduced to the digests recorded at its acceptance.
- Routed business operations: **137** (134 + the three above); 141 handlers with health and the three auth operations. `AppMeta.schemaRelease` stays `TB-SCHEMA-API-v1.0.0` as recorded; `PFC-YT-EMAIL-v1.1` unchanged.
- **Every current digest changes once.** The `TB-PRODUCTION-CONTEXT-DIGEST-v2` preimage includes the contract identifier, so the activation changes every current digest (design record W-1). A preview digest computed under v1.3.0 is 412 for a prompt, a validation and a capture; prompts, runs and assessments recorded under v1.3.0 (ruleset v2) stay exactly as recorded; an earlier prompt's candidate validates with the version-only `CONTEXT.PROMPT_DRIFT` REVIEW_REQUIRED (DB test "the version transition"). No stored digest is recomputed or upgraded, and `contextRevision` never moves for a deployment.

## 3. TB-TECHNICAL-RULESET-v3 (ADR-0010)

- `TECHNICAL_RULESET_VERSION = 'TB-TECHNICAL-RULESET-v3'` (API) and the same constant on the validation page (a test pins them together).
- The rule inventory is unchanged: 29 required rules (24 deterministic, 5 heuristic) with the same ids, kinds, severities, order and aggregation. The documented `checks` text of every rule, with the vocabulary list masked, is byte-identical to v2's (a unit test pins its SHA-256).
- The one change: `MARKER.INTERNAL_IDENTIFIERS`' pinned vocabulary = v2's eight strings (unchanged, in order) + `TB-PRODUCTION-CONTEXT-DIGEST-v2` + `TB-TECHNICAL-RULESET-v3` + `TB-SCHEMA-API-v1.4.0` (eleven). Written out, never read from `CONTRACT_BASELINE` or another constant that follows the active release; a synthetic later release in the test's module graph changes nothing (`tests/api/validation-ruleset-identity.test.ts`). The R14-AUD-013 exception and R14-AUD-014's bounded limitation now describe v2 runs only.
- Runs recorded as v1 or v2 are read back, listed and replayed as recorded, never relabelled or re-executed. A candidate needs a new v3 run before an assessment can be recorded against it.

## 4. Service design and capture transaction order

`apps/api/src/modules/assessments/` — `assessments.service.ts` (the three operations), `assessment-rules.ts` (pure rules: request checks, the epoch, supersession, heads, redaction), `assessment-views.ts`, `assessment-write-observer.ts` (the test seam `ASSESSMENT_WRITE_OBSERVER`, no-ops in the app), controller and module.

Capture (POST, Idempotency-Key, no If-Match — the expected artifact and digest in the body are the precondition):

1. The body is parsed against the contract (422), then the request-only checks (`captureRequestProblem`): a NUL anywhere, an `assessedAt` MySQL cannot store exactly (R7 storability), a case source cited twice, an ask answered twice (422 `VALIDATION_FAILED` at the repeat), then D-4 (422 `REVIEW_UNSUPPORTED`). All before the idempotency claim.
2. The claim, then one short **SERIALIZABLE** transaction through the WriteExecutor:
   - the candidate of the path (404) → its CaseRecord locked FOR UPDATE (archived → 409) → the candidate share-locked and re-read (a superseded candidate is recorded as history, D-1);
   - the expected artifact SHA-256 is the stored one (412 `ARTIFACT_CHANGED`);
   - the prompt snapshot's scope → the CURRENT production context of that scope with the P4D reader and assembly (a named binding corrected since → 412 `CONTEXT_CHANGED`) → the expected digest is the current one (412 `CONTEXT_CHANGED`) → the P4D bounds and DRAFTING gate;
   - the ruleset is the one the server runs now (422 `RULESET_NOT_CURRENT` {field, currentRulesetVersion});
   - a recorded ValidationRun of exactly E (422 `VALIDATION_RUN_REQUIRED` {epoch});
   - the superseded assessment, when named: of this case (422 `CROSS_CASE_REFERENCE`), candidate and gate (422 `REVISION_SCOPE_CHANGE` {fields}), the head of its chain (409 `ASSESSMENT_ALREADY_SUPERSEDED` {successorId}); unknown 422 `REFERENCE_NOT_FOUND`;
   - each support: an existing CaseSource (422 `REFERENCE_NOT_FOUND`) of this case (422 `CROSS_CASE_REFERENCE`) that is LINKED (409 `RECORD_STATE_CONFLICT`); for a PASS each cited source applies now (422 with its scope code); ask dispositions name exactly the prompt's parent binding (422 `ASK_PARENT_MISMATCH`, another case's 422 `CROSS_CASE_REFERENCE`);
   - one CandidateAssessment, its AssessmentSource rows (in request order, at the write instant), one audit event `CANDIDATE_ASSESSMENT_CAPTURED`, the idempotency record → commit.
3. Lock order: CaseRecord → NoticeCandidate → CandidateAssessment → CaseSource → SourceReference. The case row is locked, never changed (no `rowVersion` or `contextRevision` move); no run, issue, candidate, prompt, source or link is written. `meta.affectedResources` lists only the assessment (100 supports would exceed the contract's bound of 100 entries).
4. Audit `CANDIDATE_ASSESSMENT_CAPTURED`: identifiers (candidate, case, the superseded assessment), the epoch (artifact SHA-256, digest, ruleset) and its run, gate, result, scope state, performer kind, provenance, `assessedAt`, whether the candidate is superseded, and per support its row id, link and source revision — the performer label, rationale, scope text, limitations, supported conclusions and ask texts only as their lengths.

## 5. Epoch binding (AUD-005)

DB test "AUD-005-I capture binding": a wrong artifact 412 `ARTIFACT_CHANGED`; a stale or unknown digest 412 `CONTEXT_CHANGED` (never substituted); a v1/v2 or arbitrary ruleset 422 `RULESET_NOT_CURRENT`; no run of exactly E 422 `VALIDATION_RUN_REQUIRED`; nothing written and the key released. "TECHNICAL_PASS is not required" (AUD-005-K): BLOCKED and REVIEW_REQUIRED runs' candidates are assessed at their epochs, and no run or issue changes. "AUD-005-L": two candidates with the same artifact never share runs or assessments. "AUD-005-J": HOLD, BLOCKED, MISSING and CONFLICT are recorded and read back exactly. The epoch comparison is exact on all four values (`tests/api/assessment-rules.test.ts`).

## 6. Supports, case isolation and applicability (AUD-006, D-3)

- Another case's link: 422 `CROSS_CASE_REFERENCE` with no assessment, row, audit event or completed key; another case's assessments never appear in this case's lists (AUD-006-F).
- A PAUSED or UNLINKED link supports nothing new (409); an unknown link 422 `REFERENCE_NOT_FOUND`.
- D-3: a linked source that another owner's later coverage makes `CROSS_OWNER_REFERENCE` is 422 for a PASS {field `sources.<i>.caseSourceId`, ownerId} with nothing written, and recordable for HOLD, BLOCKED, MISSING and CONFLICT.
- An applicability change during a PASS capture waits for it (the case lock); the context then lists the conflict and a new PASS on it is 422.

## 7. Provenance and assessedAt

- D-4 as above (unit and DB tests; NC-P4H-08).
- `assessedAt` is the actual assessment instant exactly as supplied, or null — never the recording time; an instant MySQL cannot store exactly is 422 before any claim.
- Every text (rationale, scope text, limitations, conclusions) is stored exactly as decoded: CRLF, trailing spaces, combining marks, astral characters and 8,000 code points come back byte-identical (AUD-006-B).

## 8. Supersession, heads and concurrency

- D-2: a successor names the head of a chain of the same candidate and gate, across epochs; the predecessor and its rows stay byte-identical; the successor has only its own rows (AUD-006-K); a second successor 409; another gate or candidate 422 `REVISION_SCOPE_CHANGE`; another case 422 `CROSS_CASE_REFERENCE`.
- Concurrency (DB tests, observer seam):
  - two captures of the same gate and epoch at once: serialized by the case lock, both recorded — two heads, never resolved by taking the latest;
  - two successors of one predecessor at once: exactly one recorded, the other 409 naming it, nothing written;
  - a link-state change during a capture waits for it: the capture records the link as it was, the pause then commits, the stored support never changes;
  - a digest change committed before the capture reads the context → 412 with nothing written; attempted after the read → the write waits for the commit (SERIALIZABLE).
- The pure head/staleness helpers (unit tests) are for the later readiness phase: a head of another epoch is stale; a superseded record never counts. Nothing uses them to compute readiness in P4H.

## 9. Idempotency

The same key and body replay the stored assessment (read back by id; the idempotency record keeps no copy) with no duplicate rows, even after the context changed; the same key with another body 409 `IDEMPOTENCY_CONFLICT`; a failed audit rolls everything back and leaves no record of the key. A lost reply in the page is replayed with the same key into the one assessment stored (web test).

## 10. List and historical support read-back (AUD-006)

- `listCandidateAssessments`: this candidate's assessments (404 unknown candidate), newest first, exactly as stored, superseded ones included; no head, currentness or staleness selected or added. `q` = exactly an assessment id, gate, result, scope state, dependency digest, ruleset identifier or performer label (design record O-2) — no fuzzy match; keyset pages.
- `getCandidateAssessmentSources`: the stored rows of one assessment of this candidate, ascending `(createdAt, id)` — `id`, `assessmentId`, `caseSourceId`, `supportedConclusion`, `createdAt`, `createdById`. Found only through its candidate: another candidate's assessment, an unknown assessment, an unknown candidate and malformed ids are the same 404 (AUD-006-E).
- AUD-006-A: after a restart and a new session the list and the read-back recover everything from the server alone. AUD-006-C/D: a link later PAUSED, then UNLINKED — the stored rows are unchanged and still listed; the present state is a separate read. AUD-006-G: a later source revision re-points nothing.
- AUD-006-I integrity: a stored row naming another case's link, an assessment with more than 100 rows or none is a 500 — never a partial answer (design record O-4: the service check plus this read check, no composite key; O-5: the successor check is a service check).
- AUD-006-J: reads write nothing (no row, audit event, idempotency record, row version or context revision). No ETag; `Cache-Control: no-store`.

## 11. UI (`apps/web/src/app/cases/assessments.tsx`)

- A "G1–G6 review record" section on the candidate page (after the technical validation), with the boundary note: recording a review "is not G7, a signature, notice adoption, readiness or permission to send, and it changes no technical validation run".
- Before a read: the artifact SHA-256, "Current dependency digest: Not read yet", the ruleset; no form. "Read the current context" reads the context of the prompt's scope and the runs of that digest; focus moves to the outcome. A read without a run of its epoch says so and cannot record.
- The form: every select starts on its placeholder (no default PASS, no default scope state); only this case's LINKED links; AI-assisted disables "Document reviewed"; a PASS unchecks and disables a support the context records as not applicable (the neutral warning stays for other results); "Supersedes" offers only the head of the chosen gate. Server refusals at their fields; a 412 is shown exactly and never retried.
- The history (newest first, exactly as stored, with the permanent qualifier); "Show recorded supports" reads `getCandidateAssessmentSources` every time — never remembered — and shows the rows as stored, with the present CaseSource state apart ("Present CaseSource state — not the state recorded by the historical assessment."). A superseded candidate: "This candidate is superseded. A review recorded here is historical and cannot count toward current readiness."
- Recorded text as plain text (`<pre>`); no readiness, G7, sign, send, waiver or disposition wording or action; the page imports only types from `@tb/contracts` (candidate chunk 82.15 kB).
- Error copy for the P4H codes in `describeError` (`RULESET_NOT_CURRENT`, `VALIDATION_RUN_REQUIRED`, `ASSESSMENT_ALREADY_SUPERSEDED`, `ASK_PARENT_MISMATCH`, the D-3 and D-4 refusals).

## 12. Browser verification (Playwright MCP, mission §53)

`evidence/p4h-playwright-mcp-verification.txt`, screenshots `evidence/screenshots/p4h-01…08-*.png`. `yarn ui:sandbox` on `tb_notice_test`, the synthetic sandbox user, an isolated headless Chromium; all 15 checks PASS plus three supplementary (isolation and unrouted-route probes, the written rows, sandbox safety). One LOW, app-wide observation: the `.table-frame` scrollers carry no tabindex (keyboard-reachable in the tested Chromium; backlog, unchanged by P4H). The sandbox teardown now owns the P4H tables (`scripts/local/sandbox-lifecycle.ts`; a tooling test checks every table of the migration is emptied in an order its foreign keys allow).

## 13. Negative controls (mission §54)

`evidence/p4h-negative-controls.txt`: NC-P4H-01…13 — each mutation caught by an AssertionError at its responsible test, each file restored byte-identically (SHA-256 checked).

## 14. `smoke:p4h` (mission §51) — PASS (151 checks) in branch CI

`scripts/local/p4h-smoke.ts` (`yarn smoke:p4h`, refuses unless `CI=true`; a CI step after P4G): the compiled API — the three routes need a session (401); the contract baseline v1.4.0 and the digest v2 recomputed with the frozen helper; a TECHNICAL_PASS v3 run and a G1 PASS captured on exactly its epoch with exact counted writes (one assessment, one support row, one audit event, one idempotency record; the candidate and run unchanged); replay and 409; stale artifact 412, v2 ruleset 422, a foreign link 422, an unknown link 422, AI + DOCUMENT_REVIEWED 422; another owner's DRAFT coverage makes a linked source inapplicable → stale digest 412, `VALIDATION_RUN_REQUIRED` {epoch}, a PASS citing it 422 `CROSS_OWNER_REFERENCE`, a G2 HOLD citing it 201; supersession across epochs, fork 409, another gate 422; the list and exact `q`; the read-back per assessment; a paused link leaves the rows unchanged; a superseded candidate's historical G3; 404s; readiness, unsigned export, sign and send unrouted (404); logout. Its run: **PASS (151 checks)** — branch CI run 36511717843 (§18).

## 15. Tests and totals

New: `tests/db/p4h-http.test.ts` (32), `tests/api/assessment-rules.test.ts` (21), `tests/contracts/release-v1-4-0.test.ts` (13), `tests/web/p4h.test.tsx` (16), a tooling test of the sandbox teardown. Updated for v1.4.0 and v3: the earlier release tests (each still reproduces its accepted digests), the inventory and runtime-parity tests, the digest goldens of the DB suites (the v1.3.0 goldens kept for the transition test), `tests/api/validation-ruleset-identity.test.ts`, the P4G web test (v1 and v2 runs shown as recorded), the P4F web test (the archived page's inert "Record assessment").

Totals on the final code: §16.

## 16. Full regression sweep (mission §55)

`evidence/p4h-first-pc-sweep.txt` — **21/21 steps exit 0** on the clean code head `1eff3f3` (a scratchpad worktree of this repository), 2026-09-29T02:14:27Z–02:24:49Z:

- `reference:check` (and after), `reference:helper-tests` (27 pass), `contracts:check`, `yarn install --immutable`, `typecheck` (0 error lines), `lint` and `oxlint --deny-warnings --format default` ("Found 0 warnings and 0 errors.", 343 files), `format:check`;
- `yarn test` **1636 in 55 files**; `yarn test:db` **580 in 15 files** (`tb_notice_test`);
- `db:verify test --expect-empty` (and after): domain rows 0; `db:verify dev` (read-only): PASS; `db:status test` / `dev`: up to date; both drift diffs: an empty migration;
- `yarn build`: no chunk-size advisory; the candidates chunk `candidates-BOmCwjJ5.js` 82.15 kB and the entry `index-DDDFP4Ut.js` 332.15 kB — the same content hashes as the Playwright session served; no Zod marker in any page chunk or the entry;
- `smoke:local` **PASS (67 checks)** — for P4H the three assessment routes are session-protected (401, 403 without Origin, also through the web proxy) and readiness and the unsigned export are unrouted (404);
- `dev:verify-shutdown` PASS (4/4 scenarios).

The compiled smokes that write records (`smoke:auth` … `smoke:p4h`) run only in CI (§18).

## 17. Commits

| Commit | Content | Verified before the commit (its exact tree: a scratchpad worktree at the parent plus the staged patch) |
|---|---|---|
| `b300c87` | docs(decisions): ADR-0008/0009 ACCEPTED_BY_OPERATOR · INDEPENDENT_REVIEW_DEFERRED; ADR-0010 | reference, contracts, typecheck, lint 0 warnings, format; `yarn test` 1580 in 52 files |
| `38f5a1c` | feat(p4h): the contract v1.4.0, ruleset v3, the assessments API, the API/contract/DB tests, the earlier smokes and `smoke:local` for v1.4.0, the sandbox teardown | the same, `yarn test` 1620 in 54 files and `yarn test:db` 580 in 15 files |
| `cb29d87` | feat(p4h): the G1–G6 review section of the candidate page and its web tests | the same, `yarn test` 1636 in 55 files (web only: no DB code) |
| `1eff3f3` | test(p4h): `smoke:p4h` and its CI step — **the code head** | the same, `yarn test` 1636 in 55 files (the smoke itself runs only in CI) |

Each patch was checked to equal the staged index byte for byte before its commit. Every file of the operator's safety stash is byte-identical in the code head; the only other differences from the stash are the post-recovery additions (`smoke:p4h`, its CI step and script, the sandbox teardown and its tooling test, a comment). The documentation (this record, the evidence, `CLAUDE.md`, `docs/CURRENT_STATE.md`, the pre-assessment record and the proposal index) follows in a documentation commit.

## 18. Branch CI (mission §59)

`evidence/p4h-ci-run-36511717843.txt` — the code head `1eff3f3dd653589e1201bd0bf4f0ee9925d2b3ea` (the four commits pushed together): **push run 36511717843, both jobs success**, 2026-09-29T02:15:11Z–02:25:59Z (https://github.com/TuongChris/tb-notice-production-system/actions/runs/36511717843). Logs read (job logs through the API), not only the status:

- Non-DB checks (cold install): `reference:check`, `reference:helper-tests` (27), `contracts:check`, `typecheck`, `lint` ("Found 0 warnings and 0 errors."), `format:check`, `yarn test` **1636 in 55 files**, `yarn build` (the same two chunks as locally), and the working tree unchanged by the run (`git status --porcelain` empty; frozen references intact).
- Database, seed and smoke: `tb_notice_test` migrated and verified (domain rows 0); `yarn test:db` **580 in 15 files** (P4H's DB tests included); the replay deploy a no-op; `tb_notice_dev` migrated; the synthetic seed twice (canonical digest `0ee26dc3…b775`, identical on every PC; the second run unchanged); both drift diffs an empty migration; `smoke:local` **67 checks** (the assessment session boundaries; readiness and the unsigned export 404).
- Compiled smokes: `smoke:auth` 4, `smoke:directory` 14, `smoke:p3a` 24, `smoke:p3b` 36, `smoke:p4a` 50, `smoke:p4b` 64, `smoke:p4c` 62, `smoke:p4d` 86, `smoke:p4e` 82, `smoke:p4f` 89, `smoke:p4g` 145 and **`smoke:p4h` 151** — all PASS. The four lower totals than at R14 (88, 84, 90, 146) are the probes that assessments are unrouted, removed now that P4H routes them; `smoke:p4b` and `smoke:p4c` probe the unsigned export instead. Every `smoke:p4h` check line is in the record.
- Then the P1.1 recovery commands, `dev:verify-shutdown` (4/4) and the final `reference:check` with the working-tree check — all success.

The documentation commit is pushed after this record is written; a commit cannot record its own run, so that run (and the pull request's) is reported with the mission's final report.

## 19. Schema, migration, contract and dependencies

- **Schema / migration: none.** `candidate_assessments` and `assessment_sources` are part of the initial migration `20260923103912_initial_schema` (sha256 `b54c36fd…6515`, still the only one); no `SCHEMA_CHANGE_REQUIRED` arose.
- **Contract:** the additive release TB-SCHEMA-API-v1.4.0 only (§2). No dependency added or changed.

## 20. Recovery after a power loss (2026-09-29)

The machine lost power during this mission, after the implementation and before any P4H commit. The operator created a safety stash of the working tree and re-applied it (`stash@{0}`, kept, never dropped). The recovery audit found the tree byte-identical to the stash and continued from it (no reset, clean, checkout or re-implementation). Docker was restarted; the lost scratchpad was rebuilt. An interrupted DB run had left 20 synthetic rows in `tb_notice_test` (fixtures such as `p2-directory-…@example.invalid` users and a SYNTHETIC agency); they were deleted with the sandbox teardown statements, guarded to `tb_notice_test` (`_prisma_migrations` kept), and `yarn db:verify test --expect-empty` then reported 0 domain rows. Every check in this record ran after the recovery.

## 21. Warnings, backlog and limitations

- **Independent review deferred.** Every P4H status is self-verified.
- **Own review before the pull request (mission §60), 2026-09-29.** I reviewed the P4H code diff `5afd2ec..1eff3f3` myself: the assessments module (service, rules, views, controller, observer), the new error builders, the ruleset v3 change and the page's capture and read-back paths. No unresolved HIGH or BLOCKER finding. This is Claude's own review, not an independent review. Classified findings:
  - the P4B `affectedResources` bound below, MEDIUM and pre-existing;
  - a cosmetic line break in the header comment of `validation.service.ts`, LOW;
  - the items below.
- **Backlog (P4B, found during P4H, not changed; MEDIUM, pre-existing since P4B).** A CaseFact write with 99 or 100 supports would list 101 or 102 `meta.affectedResources`: the fact, the case and one per support. `ResponseMeta.affectedResources` allows at most 100.
  - The write itself succeeds.
  - The web client does not validate responses at runtime.
  - P4H's own capture lists only the assessment for this reason.
- **W-2** (design record): under the baseline a candidate reaches TECHNICAL_PASS only when its prompt's context equals the current context; after any context change a new prompt and candidate are needed until D-6 is decided (readiness phase).
- **W-3**: the `PLAN.SOURCE_IN_CONTEXT` message still offers "or have its use reviewed" (v3 keeps v2's rule text). A review can be recorded but never clears it; the P4H page never presents a review as clearing an issue. Readiness copy must not either.
- **O-1** (`PLAN.SOURCE_APPLIES` stores the other owner's id in its issue details) and **O-3** (a plan source reachable only through a paused link counts as in context) — unchanged, backlog.
- **Backlog (UI, app-wide):** `.table-frame` scrollers carry no tabindex (§12).
- R14-AUD-002 and -007 OPEN_BACKLOG; R14-AUD-011 and -012 NON_BLOCKING_BACKLOG — unchanged.

## 22. Status (maximum claim of this mission)

See the status table. After a successful merge and post-main CI the maximum status is `P4H = IMPLEMENTED_SELF_VERIFIED, MERGED_TO_MAIN`, TB-SCHEMA-API-v1.4.0 and TB-TECHNICAL-RULESET-v3 ACTIVE; the merge and post-main CI are reported with the mission's final report and reconciled by the next mission, as for earlier closeouts. `GET /candidates/{id}/readiness` and `POST /candidates/{id}/unsigned-exports` stay unrouted (404). Next mission (not started): **TB_P4I_READINESS_ARCHITECTURE_AND_IMPLEMENTATION_FAST_TRACK**.

## 23. P4H closeout — merge reconciliation (2026-09-29, home PC)

Mission TB_P4I_READINESS_AND_UNSIGNED_EXPORT_FAST_TRACK (operator, 2026-09-29), first task, recorded on `feature/p4i-readiness-unsigned-export` after the merge. This is reconciliation only: nothing P4H implemented or the operator accepted changes, and the independent review stays deferred. Sections 1–22 keep the state at their time (for example "reported with the mission's final report" in §18 and §22).

### 23.1 Merge reconciliation (verified with `git` and authenticated `gh`, not assumed)

| Item | Observed value |
|---|---|
| `P4H_CODE_HEAD` | `1eff3f3dd653589e1201bd0bf4f0ee9925d2b3ea` (§17, §18) |
| `P4H_CLOSEOUT_HEAD` | `6a7fae733dcce7f417f22661f50304052bbd589e` — "docs(p4h): record P4H candidate assessments (self-verified; independent review deferred)" (documentation only). Push run [36513211881](https://github.com/TuongChris/tb-notice-production-system/actions/runs/36513211881), 2026-09-29T02:34:07Z–02:42:33Z, success: "Non-DB checks (cold install)" (job 109229698493) and "Database, seed and smoke (MySQL 8.4.11)" (job 109229698673). Logs read: `contracts:check` "3 generated outputs match the active source"; lint "Found 0 warnings and 0 errors."; Prettier clean; `yarn test` 1636 / 55 files; `yarn test:db` 580 / 15 files; the replay "No pending migrations to apply."; both drift diffs "-- This is an empty migration."; `smoke:local` 67, `smoke:auth` 4, `smoke:directory` 14, `smoke:p3a` 24, `smoke:p3b` 36, `smoke:p4a` 50, `smoke:p4b` 64, `smoke:p4c` 62, `smoke:p4d` 86, `smoke:p4e` 82, `smoke:p4f` 89, `smoke:p4g` 145, `smoke:p4h` 151; `yarn dev` shutdown "PASS (4/4 scenarios)"; no error annotation in either job |
| Pull request | [#12](https://github.com/TuongChris/tb-notice-production-system/pull/12) `feature/p4h-candidate-assessment` → `main`, "P4H: Candidate assessment capture and historical support read-back", opened 2026-09-29T02:43:52Z. `headRefOid` = `6a7fae7` (9 commits). pull_request run [36513959839](https://github.com/TuongChris/tb-notice-production-system/actions/runs/36513959839), 2026-09-29T02:43:55Z–02:55:00Z, success: "Non-DB checks (cold install)" (job 109232025136) and "Database, seed and smoke (MySQL 8.4.11)" (job 109232024963), with the same results as the push run (`yarn test` 1636 / 55, `yarn test:db` 580 / 15, every compiled smoke with the same totals, lint 0 warnings) |
| `P4H_MERGE_METHOD` | **merge commit** — not squash, not rebase, no bypass of checks, branch not deleted. `19a7cb2` has two parents, `20367b9` (previous `main`) and `6a7fae7`. Message "Merge pull request #12 from TuongChris/feature/p4h-candidate-assessment", committed by GitHub, merged 2026-09-29T02:56:10Z by the repository owner's authenticated account |
| `P4H_MERGED_MAIN_HEAD` | `19a7cb2ee2ce4e88d89e9dedfa286eecdac39b0e` |
| Ancestry / content | `git merge-base --is-ancestor 6a7fae7 origin/main` → exit 0, and likewise for `1eff3f3`. The previous `main` `20367b9` is an ancestor of `6a7fae7` (the branch started at `5afd2ec`, which descends from it), so the merge introduced nothing else: the trees of `19a7cb2` and `6a7fae7` are identical (`455f0ef7f8b496ee0c18e80edd0ca8f12896c839`; `git diff 6a7fae7 19a7cb2` empty), and `git log 6a7fae7..origin/main` lists only the merge commit |
| `MAIN_POST_P4H_CI` | **PASS** — push run [36514894511](https://github.com/TuongChris/tb-notice-production-system/actions/runs/36514894511) on `19a7cb2`, 2026-09-29T02:56:13Z–03:17:11Z: "Non-DB checks (cold install)" (job 109234880555) and "Database, seed and smoke (MySQL 8.4.11)" (job 109234880295) both success. Logs read, not only the status: `reference:check` OK (`MANIFEST.sha256` `42c2a419…` matches the pin); the 27 helper tests (27 pass, 0 fail); `contracts:check` OK (3 generated outputs match the active source); lint "Found 0 warnings and 0 errors."; Prettier clean; `yarn test` 1636 / 55 files; the build; `db:verify test --expect-empty` (foreign keys 125/125, CHECK constraints 30/30, domain rows 0); `yarn test:db` 580 / 15 files; the replay's second deploy "No pending migrations to apply."; the seed's canonical digest `0ee26dc3…b775` each time; both drift diffs "-- This is an empty migration."; `smoke:local` 67, `smoke:auth` 4, `smoke:directory` 14, `smoke:p3a` 24, `smoke:p3b` 36, `smoke:p4a` 50, `smoke:p4b` 64, `smoke:p4c` 62, `smoke:p4d` 86, `smoke:p4e` 82, `smoke:p4f` 89, `smoke:p4g` 145, `smoke:p4h` 151; the P1.1 recovery commands; `yarn dev` shutdown "PASS (4/4 scenarios)"; the final reference and working-tree checks; no error annotation in either job. The run took about 21 minutes (the two branch runs about 8 and 11): its `yarn test:db` step took about 16.5 minutes (02:57:42Z–03:14:12Z) against about 5.5 and 7 in the branch runs, with the same 580 passing tests |

### 23.2 History preserved

Nothing was amended, rebased, rewritten or force-pushed, and no tag or release was created. `feature/p4h-candidate-assessment` stays at `6a7fae7` (local and origin); every earlier phase branch is unchanged. The operator's safety stash (`stash@{0}`, §20) is kept, untouched. The local `main` was fast-forwarded to `19a7cb2` (no commit made on it), and `feature/p4i-readiness-unsigned-export` was created from exactly that commit.

### 23.3 Status

| Scope | Status |
|---|---|
| P4H_STATUS | **IMPLEMENTED_SELF_VERIFIED, MERGED_TO_MAIN** — self-verified engineering implementation; the independent Astra review stays **DEFERRED BY OPERATOR** (to the final whole-system audit); nothing is independently verified |
| P4H_MERGE | **MERGED_TO_MAIN** — pull request #12, merge commit `19a7cb2` (method: merge commit, merged 2026-09-29T02:56:10Z) |
| `MAIN_POST_P4H_CI` | **PASS** — `main` push CI run 36514894511, both jobs success, logs read |
| Active contract | **TB-SCHEMA-API-v1.4.0** on `main` (ADR-0009 ACCEPTED_BY_OPERATOR · INDEPENDENT_REVIEW_DEFERRED; 291 schemas, 145 operations, 100 paths; frozen historical reference TB-SCHEMA-API-v1.0.0; PFC wire id `PFC-YT-EMAIL-v1.1`) |
| Active engineering identifiers | `TB-PRODUCTION-CONTEXT-DIGEST-v2`, `TB-TECHNICAL-RULESET-v3` (ADR-0010), `TB-PROMPT-TEMPLATE-v1`, `TB-CANDIDATE-ARTIFACT-v1` |
| R14-AUD-005 / -006 | **IMPLEMENTED_SELF_VERIFIED · INDEPENDENT_REVIEW_DEFERRED** |
| CandidateAssessment | **IMPLEMENTED_FOR_CAPTURE_AND_HISTORY** |
| Database / dependencies | **No change** — `20260923103912_initial_schema` is still the only migration; lockfile unchanged |
| Readiness / unsigned export | Unrouted on `main` at `19a7cb2` (404); implemented next by mission TB_P4I_READINESS_AND_UNSIGNED_EXPORT_FAST_TRACK on `feature/p4i-readiness-unsigned-export` (`docs/verification/p4i/`) |
| External action | **NONE**; real case data **0** |

## 24. Later cross-reference — P4I (2026-09-29)

Recorded by mission TB_P4I_READINESS_AND_UNSIGNED_EXPORT_FAST_TRACK (`docs/verification/p4i/P4I_READINESS_UNSIGNED_EXPORT.md`); §1–§23 are unchanged.

- Readiness and the unsigned export, unrouted at P4H, are routed by P4I under ADR-0011. Readiness evaluates the recorded assessments at the current epoch (per gate the heads of its chains, never the latest PASS) and changes none of them; an assessment still decides nothing by being recorded.
- The P4H backlog item on CaseFact `meta.affectedResources` (102 entries for 100 supports) is remediated there (§9: the affected roots only — the CaseFact and the CaseRecord).
- The `.table-frame` observation is closed where the readiness and assessment tables are touched: the assessment section's two table scrollers are focusable named regions. Other pages' scrollers are unchanged.
- W-2, W-3, O-1 and O-3 stay backlog; D-6 (no waiver) stays deferred and READY_FOR_SIGNER never waives a technical issue.

## 25. Later cross-reference — the final whole-system audit (2026-09-29)

Recorded by mission TB_FINAL_CLOSEOUT_SCOPED_REMEDIATION_AUD015_TO_AUD020 (`docs/verification/final-audit-remediation/FINAL_AUDIT_REMEDIATION_AUD015_AUD020.md`); §1–§24 are unchanged.

- The independent Astra final whole-system audit of `abc31fc` confirmed **R14-AUD-017** (MEDIUM) against the G1–G6 review section of this phase: the page built the capture body without `askDispositions` and had no field for them, so every G6 review of an NMI reply recorded through the page was held (`G6_ASK_DISPOSITIONS_MISSING`) and a replacement through the same form could not add them. The API accepted them (§4); nothing false was made READY.
- Remediated on `feature/final-audit-remediation-aud015-aud020` (`72e612e`, `742e9cc`): the editor "Ask dispositions of the parent message", offered only for G6 of a reply — the parent binding fixed from the prompt snapshot and shown, never chosen; no ask or disposition preselected; the six contracted dispositions with neutral copy; sources only from the read context, the inapplicable ones disabled; client checks with one focus move per refused submission; the stored dispositions shown as the server recorded them. The server classifies them (R14-AUD-016): REQUIRES_DOCUMENT, MISSING_FACT and LEGAL_REVIEW_REQUIRED hold G6.
- Status: **REMEDIATED_PENDING_INDEPENDENT_REVIEW**. The capture API, its checks, D-1…D-6 and ADR-0008/0009 are unchanged: a review still decides nothing by being recorded.
