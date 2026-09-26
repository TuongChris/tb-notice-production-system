# P4E — Prompt generation and PromptSnapshot (home PC)

Mission **TB_R11_CLOSEOUT_MERGE_AND_P4E_PROMPT_SNAPSHOT_TO_R12**, steps 10–12. Branch `feature/p4e-prompt-snapshot`, created from the exact post-P4D `main` `b7878b7` (merge commit of PR #7), with the R11 closeout checkpoint `3e53bbf` (documentation only). P4E implements **three** contracted operations — `generatePrompt`, `listCasePrompts` and `getPrompt` — and the prompt pages of a case.

**R12 result (operator, 2026-09-26): PASS.** P4E = **VERIFIED_COMPLETE**; the active wire contract stays **TB-SCHEMA-API-v1.2.0** and `TB-PROMPT-TEMPLATE-v1` is the accepted internal prompt template. P4E is authorized for merge to `main` by a normal merge commit (mission TB_R12_CLOSEOUT_MERGE_AND_P4F_NOTICE_CANDIDATE_TO_R13; §29). P4F (NoticeCandidate) is **NOT_STARTED** at this record. No AI provider, signature, sending, mailbox or Drive action exists.

Persistent rules (they stay in force after R12; `CLAUDE.md` carries them):

- **A prompt snapshot is not a notice.** It is input for a later drafting step outside the application — a person, or a drafting tool the operator chooses. It is never a notice, a candidate, an approval, a readiness decision, a signature or a transmission.
- **A prompt snapshot is not a legal conclusion.** Nothing in it decides a G1–G7 gate, READY_FOR_SIGNER, ownership, permission, infringement, current authority or signer eligibility, and the prompt tells its reader so (rules R7–R10).
- **Deterministic rendering.** One pure renderer (template `TB-PROMPT-TEMPLATE-v1`): no clock, randomness, locale, environment, database or network. The same context gives byte-identical text; unit tests pin the bytes of fixed inputs; any change to the rendered structure or wording needs a new template identifier.
- **Exact context freeze.** A snapshot stores exactly the context its generation rebuilt — equal to the context the operator reviewed, or nothing is stored — with its revision, digest, dependency manifest, source manifest, missing items, conflicts, the rendered text and its SHA-256. Nothing is recomputed on read.
- **Exact dependency freeze.** `dependencyManifest` is the context's dependency closure with each record's fingerprint as of generation. A later change never touches it; it changes only what a new generation would see.
- **Stale context is refused.** A generation names the revision and digest the operator reviewed. Any difference is 412 `CONTEXT_CHANGED` naming the field — nothing is written, nothing is rebuilt silently, nothing is retried; the page requires reading the current context before another generation.
- **No AI provider.** No AI-provider, network, mail or Drive call exists in the prompts module, its service or the prompt pages; no workspace depends on a provider SDK. Tests guard all three.
- **No G1–G7, no readiness, no signature, no external action.** The prompt carries exactly one signature slot, `[PENDING AUTHORIZED SIGNER — FULL LEGAL NAME REQUIRED]`, and writes no legal declaration (`[REVIEWED DECLARATION TEXT REQUIRED]` instead). Generating sends, fetches, contacts or signs nothing.
- **Untrusted content is delimited.** Recorded text — names, titles, URLs, captured messages, source texts, fact values — appears only inside the case-data block as JSON string values, between two marker lines that carry the SHA-256 of that block; the prompt's rules name instruction-like text there as quoted case content.
- **Historical snapshots are immutable.** No update or delete route and no ETag; a new generation is a new version; a replay of the same Idempotency-Key returns the stored snapshot, never a fresher one.

## Status by scope (not collapsed)

| Scope | Status |
|---|---|
| R11 closeout (steps 1–9) | **DONE** — R11 = PASS recorded; P4D merged to `main` by PR #7 (merge commit `b7878b7`); post-merge `main` CI green; branch created from `b7878b7`; checkpoint `3e53bbf` (§2; `P4D_PRODUCTION_CONTEXT.md` §29–§30) |
| P4E implementation (step 10) | **IMPLEMENTED** on `feature/p4e-prompt-snapshot` — code head `cc0d62d` (§3) |
| P4E home-PC automated tests | **PASS** — `yarn test` 1431 / 44 files, `yarn test:db` 455 / 12 files (P4E: 33 DB, 25 unit, 8 web) (§21) |
| Consistency / transaction tests | **PASS** — one transaction view, SERIALIZABLE, concurrent version allocation (§4, §21) |
| Browser verification (Playwright MCP, `tb_notice_test`) | **PASS** — 30/30; one finding (F1) fixed and re-verified; one limitation of the automation profile recorded (§19) |
| Negative controls | **PASS** — 30/30 on `cc0d62d`, all 38 responsible commands failing on an AssertionError (§20) |
| Full regression (§48 of the mission) | **PASS** — 21/21 steps exit 0 on `cc0d62d`, lint 0 warnings (§21, `evidence/p4e-first-pc-sweep.txt`) |
| Exact final branch CI | **PASS** — push run 36208469062 on the R12 submission head `5e57dbc`, both jobs (§29.2); the code head's run: push run 36207244597 on `cc0d62d` — success, both jobs (`evidence/p4e-ci-run-36207244597.txt`) |
| Schema / migration | **No change** (§23) |
| Wire contract | **No change** — TB-SCHEMA-API-v1.2.0 (§24) |
| R12 review | **PASS** (operator, 2026-09-26) — no remediation (§29) |
| P4E_STATUS | **VERIFIED_COMPLETE** |
| P4E_MERGE | **NOT_MERGED at this record — AUTHORIZED_FOR_MERGE** (§29) |

## 1. Operation matrix and design (contract-first)

### 1.1 Exact contract scope

| Item | Contract (TB-SCHEMA-API-v1.2.0, verified in `packages/contracts/src/api/operations.ts` and the frozen OpenAPI) |
|---|---|
| `generatePrompt` | POST `/cases/{caseId}/prompts` · tag Production · session, CSRF, `Idempotency-Key` · **no** precondition target (no If-Match) · body `GeneratePrompt` {`taskType` INITIAL \| NMI_REPLY, `generationMode` PREPARATION \| DRAFTING, `expectedContextRevision` 1–4294967295, `expectedDependencyDigest` lowercase hex 64, `authoritySelectionId?` UUID \| null, `parentBindingId?` UUID \| null, `priorBindingIds` UUID[0..100]} · 201 `{data: PromptSnapshot, meta}` · errors 400 401 403 404 409 412 413 422 428 429 500 |
| `listCasePrompts` | GET `/cases/{caseId}/prompts` · session · query `limit` 1–100 (default 25), `cursor`, `q` (≤200) · 200 `{data: {items: PromptSnapshotSummary[], nextCursor}, meta}` · errors 400 401 403 404 409 413 422 429 500 |
| `getPrompt` | GET `/prompts/{id}` · session · 200 `{data: PromptSnapshot, meta}` · errors 400 401 403 404 409 413 422 429 500 |
| `PromptSnapshot` | id, caseId, taskType, generationMode, version, authoritySelectionId, parentBindingId, contractVersion (≤80), templateVersion (≤80), contextRevision, dependencyDigest, dependencyManifest[0..10000], contextJson (`ProductionContext`, PFC-YT-EMAIL-v1.1), sourceManifest[0..1000], missingItems[0..1000], conflicts[0..1000], renderedPrompt (≤1,000,000), promptSha256, createdAt, createdById — no rowVersion, no ETag |
| `PromptSnapshotSummary` | id, caseId, taskType, generationMode, version, contractVersion, templateVersion, contextRevision, dependencyDigest, promptSha256, createdAt — no prompt text, context or manifest |
| Not on the wire | the prior bindings of a snapshot (they are in its `contextJson.priorCorrespondenceIds` and in its digest's scope); no update, delete, approve, sign, send or export operation exists |

### 1.2 Frozen rules that decide the design

- INVARIANTS §5 "Prompt generation": "Generate checks expected contextRevision and dependencyDigest in a short SERIALIZABLE transaction, allocates the next per-case/task version while holding CaseRecord, freezes exact context/prompt and records its idempotent result. No AI call or network fetch occurs inside that transaction." Deadlock/serialization failures: bounded retries (3), the same key.
- INVARIANTS §5 "Source/context drift": the digest covers the complete closure (new relevant authority events, successors, changed bindings); "Original prompt/candidate remain immutable."
- INVARIANTS §6: exact text bytes — the SHA-256 of the exact UTF-8 bytes, no trimming, newline rewriting or normalization (the frozen helper's `exactTextSha256`).
- API_CONTRACT §9 step 7: "POST prompts with expected digest/revision. Copy to ChatGPT. No OpenAI API call is performed." §11: list endpoints return summary DTOs; full bodies come through detail endpoints.
- Production Form Contract §4 (required content, the DRAFTING gate P4D already applies) and §7 (one pending signature slot, the frozen `PENDING_SIGNATURE` text).
- P4D (accepted at R11): the context of one task and its digest; exact pinning; no latest/default substitution; MISSING stays missing, CONFLICT stays conflict; `*_AS_SENT` does not imply a verified package.

### 1.3 Design decisions

- **D1 Reuse P4D, never reimplement it.** The generation builds the request scope exactly as a `getProductionContext` read of the same selectors (`prompt-scope.ts`) and rebuilds the context with the P4D reader (`readContextRows`) and assembly (`assembleContext`). The P4D refusals (selector rules, bounds, DRAFTING gate) are one shared function, `assertDeliverable`, used by both operations — so both apply exactly the same gate. No P4D behaviour changed (a refactor plus exports; the P4D suites pass unchanged).
- **D2 Transaction.** One short Prisma interactive transaction at **SERIALIZABLE** (`maxWait` 2 s, `timeout` 5 s; the WriteExecutor's bounded deadlock retry, 3). The CaseRecord is locked FOR UPDATE first; the case row is locked, **not changed** — a prompt is not case context (it would invalidate the context it froze), but it makes the case history-bearing (§4).
- **D3 Stale context.** Two separate checks, both 412 `CONTEXT_CHANGED` `{field}`: the expected revision against the locked case row (before the rebuild) and against the rebuilt context; the expected digest against the rebuilt digest. The digest binds the mode and the selectors (a PREPARATION review does not stand in for DRAFTING).
- **D4 Version.** MAX(version)+1 for the case and task, read under the case lock; unique key `(case_id, task_type, version)` as the database backstop. Versions are per task, across modes.
- **D5 Template.** No accepted template existed; P4E defines **`TB-PROMPT-TEMPLATE-v1`** — an internal implementation identifier of the renderer as written: not a wire-contract release, not a PFC version, and no policy, legal or platform approval. The template contains no legal declaration (§10). A change of the rendered text needs a new identifier; the unit test pins the bytes.
- **D6 Freeze.** The snapshot stores the rebuilt `view` itself: `contextJson` = the context, `dependencyManifest` = its dependencies, `missingItems` / `conflicts` = the context's lists, `sourceManifest` = the context's sources and policy sources (§11), `renderedPrompt` = the renderer's text of that view, `promptSha256` = the exact-text hash of it.
- **D7 Replay.** The idempotency record keeps the status, meta and the snapshot's type and id — not a second copy of the prompt; a replay reads the immutable snapshot back (`WriteOptions.replayRecord`). A replay after the case changed returns the historical snapshot: it claims no freshness.
- **D8 Reads.** `getPrompt` is global by id, as the contract's path is; the detail page shows a snapshot only under its own case (another case's prompt is shown like an unknown one). The list is per case, summaries only.
- **D9 Error codes.** New implementation codes inside the free-string `code` with contracted statuses: `CONTEXT_CHANGED` (412) and `PROMPT_TOO_LARGE` (409); the P4D codes where they apply (`SELECTOR_NOT_FOR_TASK`, `REPLY_PARENT_REQUIRED`, `PRIOR_BINDING_NOT_AS_SENT`, `DRAFTING_INPUT_MISSING`, `PRODUCTION_CONTEXT_TOO_LARGE`) and the frozen/stable codes (`REFERENCE_NOT_FOUND`, `CROSS_CASE_REFERENCE`, `BINDING_ALREADY_SUPERSEDED`, `RECORD_STATE_CONFLICT`, `IDEMPOTENCY_CONFLICT`, `VALIDATION_FAILED`, `NOT_FOUND`).

## 2. R11 closeout and branch (mission steps 1–9)

Recorded in `docs/verification/p4d/P4D_PRODUCTION_CONTEXT.md` §29–§30 (verified with `git` and authenticated `gh`, not assumed):

| Item | Value |
|---|---|
| R11 | **PASS** (operator, 2026-09-26) — P4D VERIFIED_COMPLETE, no remediation; two non-functional hygiene items done (`c4797b0` P4A documentation reconciliation, `ca77ac0` web claim-scan hardening); closeout head `b9b42c4`, push run 36198085184 success |
| P4D pull request | [#7](https://github.com/TuongChris/tb-notice-production-system/pull/7) `feature/p4d-production-context` → `main`, head `b9b42c4`; pull_request run 36198618120 success |
| Merge | **merge commit** `b7878b764f12e3a567b6315dc90a1c08f7392a3f` (parents `ed5b3d7`, `b9b42c4`; tree identical to `b9b42c4`), merged 2026-09-25T22:58:03Z; no squash, rebase, `--admin` or branch deletion |
| Post-merge `main` CI | push run [36199089531](https://github.com/TuongChris/tb-notice-production-system/actions/runs/36199089531) on `b7878b7` — success (both jobs) |
| P4E start | `feature/p4e-prompt-snapshot` from the exact `origin/main` `b7878b7`; checkpoint commit `3e53bbf` (documentation only; P4E NOT_STARTED at that commit), push run 36199849335 success |

## 3. Implementation (commits)

| Commit | Content | CI |
|---|---|---|
| `3e53bbf` | R11 closeout checkpoint (documentation only) | run 36199849335 success |
| `2c5dcc5` | API: `modules/prompts/*` (scope, renderer, template id, snapshot rules, views, service, controller, module, generation observer seam); WriteExecutor options (isolation level, `replayRecord`); `contextChanged` / `promptTooLarge` errors; the frozen helper's `exactTextSha256` and `PENDING_SIGNATURE` ported into `tb-canonical-json.ts`; P4D `assertDeliverable` shared, `semantic` exported; `tests/db/p4e-http.test.ts` (33), `tests/api/prompt-rules.test.ts` (25) with synthetic fixtures; inventory and unrouted-path updates in earlier DB tests and smokes; four prompt checks in `smoke:local` | (pushed with `97f4e0c`) |
| `1effa4c` | Web: the prompt history, generate and detail pages (`apps/web/src/app/cases/prompts.tsx`), routes, the case page's Prompts section, API client, formatting, CSS; the P4D page's components exported for reuse (no P4D behaviour change); `tests/web/p4e.test.tsx` (8) | (pushed with `97f4e0c`) |
| `97f4e0c` | `yarn smoke:p4e` (CI only) and its CI step | run 36204659697 success — `smoke:p4e` 84 checks |
| `e1e2de6` | Fix from the browser pass (finding F1): "Prompt generated" said once, not again on reload + web test | run 36206226613 success |
| `9bffe24` | Test: the concurrency test counts the generations that passed the case lock (from the negative-control design) | (pushed with `cc0d62d`) |
| `cc0d62d` | Test: the stale-context and other-case web tests assert the outcome directly (from negative-control run 1) — the code head | run 36207244597 success (with `9bffe24`) |
| `5e57dbc` | R12 submission: this record, the evidence, `CLAUDE.md`, `CURRENT_STATE.md` (documentation only; the accepted head) | run 36208469062 success |

## 4. Generation transaction

`generate` (`prompts.service.ts`), in this order — each step's refusal writes nothing:

1. The contract body (422 `VALIDATION_FAILED`, before any claim); `promptScope`: a prior named twice (422 `VALIDATION_FAILED`), a parent or prior with INITIAL (422 `SELECTOR_NOT_FOR_TASK`).
2. The Idempotency-Key (400 missing/invalid) and its claim — a replay returns the stored snapshot (§14), a different body with the same key is 409 `IDEMPOTENCY_CONFLICT`.
3. SERIALIZABLE transaction: `lockCase` FOR UPDATE (404; an archived case 409 `RECORD_STATE_CONFLICT`).
4. The expected revision against the locked row (412 `CONTEXT_CHANGED` `{field: expectedContextRevision}`).
5. `readContextRows` + `assembleContext` — the P4D rebuild of exactly the requested scope (its selector refusals: 422 `REFERENCE_NOT_FOUND`, `CROSS_CASE_REFERENCE`, `REPLY_PARENT_REQUIRED` NOT_NMI, `PRIOR_BINDING_NOT_AS_SENT`; 409 `BINDING_ALREADY_SUPERSEDED`).
6. The expected revision against the rebuilt context, then the expected digest (412 `CONTEXT_CHANGED` `{field: expectedDependencyDigest}`).
7. `assertDeliverable` — the P4D bounds (409 `PRODUCTION_CONTEXT_TOO_LARGE`) and DRAFTING gate (422 `REPLY_PARENT_REQUIRED` NOT_SELECTED / `DRAFTING_INPUT_MISSING`, naming every blocking code).
8. The source manifest and the snapshot's array bounds (409 `PROMPT_TOO_LARGE` `{field, count, maximum}`).
9. The version: MAX+1 for the case and task (§6).
10. The renderer, then its size bound: above 1,000,000 code points 409 `PROMPT_TOO_LARGE` `{field: renderedPrompt}` — never truncated.
11. `promptSha256` = `exactTextSha256(renderedPrompt)`.
12. One `PromptSnapshot` insert, one `PROMPT_GENERATED` audit event (§15), the idempotency completion, commit; 201.

Why SERIALIZABLE (proved by a test that fails at READ COMMITTED, NC-P4E-21): InnoDB turns the plain reads of the rebuild into shared-locking reads, so a write to a record the context read — an authority event locks its **mandate**, never the case — waits until the snapshot committed. Without it, such a write could commit between the rebuild and the insert, and the snapshot would freeze a state already replaced. A write that locks the case first (a new reported item) waits for the case lock in any case. The test seam `PROMPT_GENERATION_OBSERVER` (`afterCaseLock`, `beforeInsert`; no-ops in the application) lets the consistency tests commit concurrent changes at exactly those points:

- a dependency change committed after the case lock but before the rebuild → 412, never a mixed snapshot (the digest of the rebuilt context no longer matches);
- a case-locking write started before the insert lands only after the snapshot committed (the snapshot holds the one item it read);
- an authority event started before the insert waits for the snapshot (SERIALIZABLE) — the snapshot is never older than a change committed before it;
- two concurrent generations: the second passes the case lock only after the first committed, and gets version 2.

A prompt makes its case history-bearing: `HISTORY` in `case-rules.ts` counts `PROMPT_SNAPSHOT` (a later route correction is 409 `BINDING_CORRECTION_REQUIRES_RECONCILIATION` naming it), and a case with a snapshot cannot be deleted (`REFERENCED_RECORD_CANNOT_DELETE`).

## 5. Stale-context behaviour (412 CONTEXT_CHANGED)

- Refused: a change of the case context revision (the intake label, a new reported item, a fact revision, a case-source state, a correspondence binding and its correction — each moves the revision); a change the revision does not see but the closure does (a new authority event of a pinned mandate, a newer revision of a source the context relies on, an ENDED signer). The response names the field; the key's claim is released (a 412 is never replayed); every table is unchanged.
- Not refused (P4D's irrelevant changes): the case's notes, a work's notes, a clock advance, another case's records, an unrelated registry source — the reviewed revision and digest stay valid (DB test).
- After a snapshot: a relevant change leaves the old snapshot byte-identical; its digest is refused for a new generation; a fresh review generates version 2 (DB test; browser items 17–20, 24).
- A corrected parent binding: the stale review is 412; a fresh review is the P4D refusal 409 `BINDING_ALREADY_SUPERSEDED` naming the correction, which is never used in its place.

## 6. Version allocation

Per case and task (INITIAL and NMI_REPLY count separately; PREPARATION and DRAFTING share the task's sequence), 1, 2, 3, never reused: MAX(version)+1 read under the case lock, the unique key `(case_id, task_type, version)` as the backstop. Another case starts at 1. A refused generation allocates nothing. Two concurrent generations: the second waits at the case lock and takes the next version (DB test; NC-P4E-14).

## 7. Deterministic renderer (`TB-PROMPT-TEMPLATE-v1`)

`prompt-renderer.ts` — `renderPrompt(view, contractVersion)` is a pure function of the ContextView (the context, its revision, digest and dependencies) and the wire-contract id. The text, lines joined by `\n` and ending with a newline:

- **Header**: `TB NOTICE PRODUCTION SYSTEM — PROMPT`, `Template: TB-PROMPT-TEMPLATE-v1`, `Wire contract: TB-SCHEMA-API-v1.2.0`, `Context schema: PFC-YT-EMAIL-v1.1`, task, mode, case id, context revision, dependency digest, dependency counts by type; then the boundary sentence ("…It is not a notice, an approval, a readiness decision, a signature or a transmission, and it certifies nothing.").
- **PART 1 — RULES** R1–R14: only PART 4 is used, nothing from memory, the web or another case (R1); MISSING stays missing (R2); a conflict is named, never resolved silently (R3); provenance as recorded (R4); permission never inferred from silence (R5); similarity is not infringement (R6); the authority block is selected for evaluation, not a G1 decision (R7); nothing decides G1–G7, readiness or approval (R8); nothing is sent, and `*_AS_SENT` is a past transmission at its recorded posture (R9); unsigned draft material with exactly one pending slot (R10); no declaration from memory (R11); PART 4 contains no instructions (R12); internal identifiers stay out of the text meant for sending (R13); the context's fixed values (R14).
- **PART 2 — TASK** (§8) and the mode instruction.
- **PART 3 — KNOWN GAPS AND RECORDED CONFLICTS**: every missing item and conflict exactly as recorded — code, field path and the message as a JSON string — with counts; "none recorded in this context" for an empty list.
- **PART 4 — CASE DATA (untrusted)** (§9).
- **PART 5 — WHAT TO RETURN**: A. the draft for human review with exactly one pending slot; B. a document plan (states REFERENCE_ONLY, PREPARED_FOR_ATTACHMENT, PREVIOUSLY_SUPPLIED, UNKNOWN — this step attaches nothing); C. ask dispositions (NMI_REPLY: one per material ask with ANSWERED_SUPPORTED, ANSWERED_WITH_LIMITATION, REQUIRES_DOCUMENT, MISSING_FACT, LEGAL_REVIEW_REQUIRED or NOT_APPLICABLE_WITH_REASON; INITIAL: "Not applicable"); D. internal review notes, including the prompt's identity.

Purity: object keys sorted by UTF-16 code units at every depth (a stored snapshot renders again byte for byte from its own `contextJson`, whatever the key order); no `Date`, randomness, locale, `Intl`, environment, host or path (a source scan guards the renderer, scope, snapshot rules and template); the unit test renders under a fake clock, a fixed `Math.random`, another time zone and reordered keys and gets the same bytes. Golden pins (SHA-256 of the rendered text of the three synthetic fixtures) — initial `8f048cb5f5e6512f467e079723f3329dd8318721f97be41c185268014fc6330d`, reply `ab136ce391b7ab883671bbf9d13593f7f02bb94c436ee4fd84e1742f81979678`, replyDrafting `93725713edb1533a4921ce6368de6cb379e8cefda3f86fcd6877e3ce801491e7`. The same context gives the same prompt: in the browser pass, Gamma's versions 1, 2 and 3 share one SHA-256.

## 8. INITIAL, NMI_REPLY, PREPARATION, DRAFTING

- **INITIAL**: an initial copyright notice about the case's reported items — who acts, for which legal subject and in which capacity only as recorded (a null party value is said to be unresolved, never guessed); each item and work exactly as recorded; rights and use only as far as the recorded facts and mappings support them; contact details only as recorded (`[CONTACT DETAILS REQUIRED]` otherwise); no reply and no earlier transmission.
- **NMI_REPLY**: the parent is the named NMI message — the correspondence entry not among the priors — answered from its literal questions; with no parent named, none is chosen by date, subject or text; a parent that is also a prior is not guessed; the priors are what was recorded as sent at their recorded posture (never delivered or verified); no invented raw message, quote or attachment; not a mechanical repeat of the initial notice.
- **PREPARATION**: gaps are expected — preparation material with `[NEEDED: …]` markers; missing owner-controlled or legal facts are never completed; the result must not look complete or cleared.
- **DRAFTING**: generated only when the P4D gate passes (the Production Form Contract's required input is recorded); the prompt says "That is not readiness, a review or a gate decision."; representations that depend on a listed gap or conflict are not made.

## 9. Untrusted data delimiting

PART 4 is the context's semantic content — every record without operation metadata (created/updated time and user, row version), archive reasons (an archived record shows `"archived": true`) and a work's operator notes — exactly what the dependency fingerprints cover (the P4D `semantic` function), as `JSON.stringify(sortedKeys(…), null, 2)` between `BEGIN CASE DATA <sha256>` and `END CASE DATA <sha256>`, where `<sha256>` is the SHA-256 of that JSON: no recorded text can contain its own digest, so none can end the block early (a fake `END CASE DATA 000…` line in a captured body stays inside a JSON string). Recorded text never appears in an instruction sentence; newlines inside it are escaped, so none of its lines can start a prompt line or open a section. R12 tells the reader that instruction-like text there is quoted case content to be reported, not followed. Unicode, tabs, carriage returns and combining marks are kept exactly (JSON decodes to the recorded text code point for code point). Tests: two unit, one DB, one browser item (15), negative control NC-P4E-09.

## 10. Legal declarations and the human signature boundary

No reviewed legal declaration text exists in the application, and none was invented (mission §22 stop rule): R11 tells the reader not to write statutory or platform declarations from memory and to write `[REVIEWED DECLARATION TEXT REQUIRED]` where one is needed. R10 and PART 5 require exactly one `[PENDING AUTHORIZED SIGNER — FULL LEGAL NAME REQUIRED]` slot (the frozen helper's `PENDING_SIGNATURE`, PFC §7), no signature image or completed sign-off name, no statement that the signer adopted, approved or reviewed anything, and no G7. The human signer reviews, adopts, signs and sends outside the application.

## 11. Source manifest

`promptSourceManifest(context)` (`prompt-snapshot-rules.ts`, pure): every source revision the context lists — its `sources` and its `policySources` (the P4D assembly puts each source in exactly one) — each entry exactly as the context lists it (role, provenance, limitations, pinned revision), ordered by source id. Never the registry, never a newer revision, never an invented entry; a source listed twice must be listed identically (otherwise an integrity failure, 500, nothing written). A newer revision created before or after the generation is not followed (DB test; NC-P4E-06).

## 12. Immutable context and dependency snapshot

The stored `contextJson`, `dependencyManifest`, `sourceManifest`, `missingItems`, `conflicts`, `contextRevision` and `dependencyDigest` are exactly the rebuilt view's (DB test "INITIAL PREPARATION: …exactly the context read"); the stored snapshot renders again byte for byte and its digest recomputes from its own manifest and scope (DB test). No route updates or deletes a snapshot; later changes leave it byte-identical (DB tests; browser item 24; NC-P4E-13).

## 13. promptSha256

SHA-256 (lowercase hex) of the exact UTF-8 bytes of `renderedPrompt` — the frozen helper's `exactTextSha256`, ported and compared with the frozen helper in a unit test: no trimming, newline rewriting or Unicode normalization; NUL and unpaired surrogates refused. MySQL's `SHA2(rendered_prompt, 256)` agrees with the stored value (DB test). NC-P4E-12 hashes NFC-normalized, trimmed text and is caught.

## 14. Idempotency

The operation's Idempotency-Key scope and digest are the WriteExecutor's (actor + operationId + key; operation, method, contract path, canonical body). The completed record stores `{meta}` plus the snapshot's type and id — no prompt, context or SHA-256 (DB test: under 1,000 characters, no `renderedPrompt` or `contextJson`). A replay reads the stored snapshot back: the same id, version and createdAt, no new row or audit event — even after the case changed. The same key with another body is 409 `IDEMPOTENCY_CONFLICT`. A 412 or any failure releases the claim; an audit failure rolls back the snapshot, the audit event and the idempotency record together (DB tests; browser items 21–22; NC-P4E-15).

## 15. Audit

One `PROMPT_GENERATED` event per snapshot, in the same transaction: case id, task, mode, version, contract and template versions, context revision, dependency digest, prompt SHA-256, the selection, parent and prior ids, the prompt's length in code points and the counts of dependencies, sources, missing items, conflicts, items, works, mappings, facts and correspondence — never the prompt, the context or any captured text (DB test compares the exact `after` object; NC-P4E-16). Reads write nothing.

## 16. List and get

- `listCasePrompts`: 404 for an unknown case; this case's snapshots only, newest first `(createdAt DESC, id DESC)`, keyset pages with HMAC cursors bound to the operation, case and `q`; summaries only (the 11 fields of §1.1); `q` matches exactly a snapshot id, a dependency digest or a prompt SHA-256 — never a search of the prompt text or the context (DB test; NC-P4E-24).
- `getPrompt`: the snapshot exactly as stored (JSON columns as stored, `createdAt` as ISO 8601 UTC); 404 for an unknown id; no ETag; reading recomputes and writes nothing.

## 17. UI and Copy prompt

`apps/web/src/app/cases/prompts.tsx`, three pages under a case, each rebuilt per case (React `key`):

- **History** `/cases/:id/prompts`: "Each prompt is an immutable snapshot. None is a notice, approval, readiness decision, signature, or transmission."; the summaries newest first with pages (task · version, mode, time, revision, digest, SHA-256); a "Generate a prompt" link. The case page has a Prompts section linking here.
- **Generate** `/cases/:id/prompts/new`: the P4D scope form and context view reused — nothing preselected; nothing read until a task and a mode are chosen; the context is read and shown first (revision, digest, missing context, recorded conflicts) with "The prompt is generated against this context revision and dependency digest. If anything the context relies on changed since this read, nothing is generated."; "Generate prompt from this context" sends exactly the task, mode, named selectors and that read's revision and digest with one Idempotency-Key per intent and no If-Match. A 412 shows exactly **"Context changed. Review the current context before generating again."**, keeps the refused read on screen, removes the generate action and offers "Read the current context" — nothing is re-read or retried by itself. A context the P4D rules refuse offers no generation ("No prompt can be generated from a context that was not returned.").
- **Detail** `/cases/:id/prompts/:promptId`: the boundary **"This is an immutable prompt snapshot. It is not a notice, approval, readiness decision, signature, or transmission."**; every frozen field; the frozen missing items and conflicts in their neutral treatments; the exact prompt text as plain text in a focusable, labelled, scrollable `<pre>` (never HTML); its SHA-256; **Copy prompt** — the stored text to the local clipboard only ("Copies the stored prompt text to this computer’s clipboard, for a drafting workflow outside this application. Nothing is sent, submitted or marked as used, and the stored prompt does not change."; an unavailable clipboard is said plainly). Another case's prompt is shown like an unknown one. After generating, focus moves to the heading and "Prompt generated: …, stored with its context." is said once (§19 F1).
- No approve, ready, sign, send, export or submit action and no readiness or G1–G7 claim on any prompt page (web test with the R11 `claimTexts` scans; browser item 29; NC-P4E-19).

## 18. No AI provider

- The prompts module has no network, mail, file, process or AI-provider call (unit source scan over every module file: `fetch(`, XMLHttpRequest, WebSocket, `node:http(s)`/`net`/`tls`/`dns`/`child_process`/`fs`…, undici, axios, nodemailer, SMTP/IMAP, googleapis, openai, anthropic, gemini, bedrock, vertex, mistral, cohere, ollama, langchain, `process.env`, `eval`).
- Generation, list and get open no outbound connection and call no `fetch` (DB test spying on `net.Socket.connect` and `globalThis.fetch`).
- The prompt pages reach only the application API (unit scan of the page and the client), and Copy prompt uses the local clipboard only.
- No workspace manifest depends on an AI-provider SDK and the lockfile resolves none (unit test).
- Negative controls NC-P4E-20a/b/c; browser item 30 (every request to localhost).

## 19. Browser verification (Playwright MCP, mission §37)

`evidence/p4e-playwright-mcp-verification.txt` and 26 screenshots in `evidence/screenshots/`. Isolated headless Chromium against `yarn ui:sandbox` (compiled API on `tb_notice_test`, synthetic user and data, full cleanup) — session 1 built from `97f4e0c`, session 2 from `e1e2de6` (bundle names identical to CI's). **30/30 PASS**:

- **Finding F1** (item 5): after a plain reload of the detail page, "Prompt generated: …" was announced again (the page read it from the navigation state, which the browser keeps in the history entry). Fixed in `e1e2de6` (the app's one-time flash, as record pages use) with a web test and negative control NC-P4E-26; re-verified in session 2 (a real reload and back/forward: no repeat, no request).
- **Limitation** (item 7): the isolated headless profile denies the clipboard, so the OS clipboard could not be read back. Verified instead: Copy prompt passed exactly the stored text to `navigator.clipboard.writeText` (its SHA-256 equals the stored one), made no request and showed its fallback message; the success path is covered by the web test.

Teardown after each session: sandbox rows deleted, `db:verify test --expect-empty` PASS (domain rows total 0), password files deleted, browser closed, ports free.

## 20. Negative controls (mission §43)

`evidence/p4e-negative-controls.txt`. 30 controls — the twenty listed kinds (with separate stored/rendered variants for MISSING and CONFLICT and API/web/manifest variants for the AI-provider guard) and six further P4E protections (not SERIALIZABLE, not history-bearing, truncation, list leak, other case's prompt, F1). Each disables one protection by an exact text replacement, runs every responsible command (each must fail and name a test; the first failure message is recorded), and restores the files byte-identically.

- **Final run on `cc0d62d`: 30/30 caught and restored, 38 commands, all 38 failing on an AssertionError, none through a 500; tree fingerprint identical; `db:verify test --expect-empty` PASS.**
- The unmutated baseline (32 distinct commands) passed right before it.
- Run 1 (on `9bffe24`) caught all 30, two of them by a wait timeout rather than an assertion; both web tests were strengthened in `cc0d62d`.
- Correction: `9bffe24` added a direct count of the generations holding the case, on the expectation that the concurrency test proved the lock only through the version numbers. A check after the runs showed the expectation — and the reason given in that commit message — wrong: with the lock removed, the original test (as of `e1e2de6`) failed 3/3 on its existing direct assertion that nothing commits while the first generation holds the case. `9bffe24` is a second direct assertion, not a needed fix (evidence file, History).

## 21. Tests, regression and CI

| Suite | Result |
|---|---|
| `yarn test` | 1431 passed / 44 files (P4E: `tests/api/prompt-rules.test.ts` 25, `tests/web/p4e.test.tsx` 8) |
| `yarn test:db` | 455 passed / 12 files (P4E: `tests/db/p4e-http.test.ts` 33 — operations and request rules 3, exact freeze 8, stale context 6, versions/idempotency/transactions 9, list and get 2, contamination 1, untrusted content/no outbound/later phases 4) |
| `yarn smoke:p4e` (CI only) | 84 checks — a synthetic case with a frozen authority chain, intake, facts (MISSING and CONFLICT) and correspondence; the INITIAL context read; a prompt generated against exactly that read (exact context, revision, digest, manifests, gaps and conflicts frozen; SHA-256 of the exact UTF-8 bytes; captured instruction-like text only inside the case data); the same key replayed; the same key with another body refused; read-back and summary list; a later authority event (case revision unchanged) makes the old expectation 412 with nothing written; version 2 from a fresh read with the first snapshot unchanged; an NMI_REPLY prompt with the named parent and prior (posture kept); expected refusals; row counts through the runtime account; no candidate, validation, readiness, export or prompt-update route |
| `smoke:local` | 52 checks (48 before; the "prompts not routed" probe became four prompt guard checks — 401 without a session, 403 without Origin, also through the web proxy — and a candidates probe) |
| Earlier smokes | unchanged counts except `smoke:p4d` 88 → 87: its "POST /cases/{caseId}/prompts not routed" probe was removed (prompts are routed since P4E); `smoke:p3a` 24, `smoke:p3b` 36, `smoke:p4a` 50, `smoke:p4b` 64, `smoke:p4c` 62 (their prompt probes now probe candidates) |
| Full regression (§48), 2026-09-26T01:07:18Z–01:14:23Z on `cc0d62d` | **21/21 steps exit 0** (`evidence/p4e-first-pc-sweep.txt`): `reference:check` and `reference:helper-tests` (27 pass), `contracts:check`, `install --immutable`, `typecheck`, `lint` and `oxlint --deny-warnings` ("Found 0 warnings and 0 errors."), `format:check`, `yarn test` 1431, `yarn test:db` 455, `db:verify test --expect-empty` and `db:verify dev` (metadata and a row count only), `db:status test` and `dev`, both drift diffs empty, `build` (entry 326.69 kB, prompt chunk 15.54 kB, no chunk advisory), `smoke:local` 52, `dev:verify-shutdown` 4/4, then `reference:check` and `db:verify test --expect-empty` again |

CI: run 36204659697 (`97f4e0c`, first run with `smoke:p4e`), run 36206226613 (`e1e2de6`), run 36207244597 (`cc0d62d`, the code head) — all success, both jobs (`evidence/p4e-ci-run-36207244597.txt`: the key lines of both jobs and every `smoke:p4e` check). The exact final head's run: push run 36208469062 on `5e57dbc`, success, both jobs (§29.2). `yarn test:transition-baseline` stays a documented historical oracle, not a gate.

## 22. Contamination tests

DB test "two cases of one agency, owner and route, the same video, the same source URL and one message bound to both", with a prompt generated for each case: case A's whole snapshot (prompt, context and manifests) contains none of case B's case id, selection, item, work, mapping basis, evidence source, case-source link, fact, NMI and AS_SENT bindings or B-only message, nor a registry-only source or the texts marked SYNTHETIC-B-ONLY / SYNTHETIC-REGISTRY-ONLY — so the same owner, route, video and source URL transfer nothing; the message bound to both cases appears in A's prompt only through A's own binding (and B's prompt names B's own parent); B's reported permission answers nothing in A; B's list shows only B's prompt; B's selection and bindings named in A are 422 `CROSS_CASE_REFERENCE`. Also: another case's selection, parent or prior binding is 422 `CROSS_CASE_REFERENCE` (DB test, browser item 16); another case's prompt is not listed and not shown under this case (DB and web tests, browser item 25); NC-P4E-17 (the shared reader's item query without its case filter) is caught.

## 23. Database changes

None. `20260923103912_initial_schema` stays the only migration (the `prompt_snapshots` table, its unique keys `(case_id, task_type, version)` and `(id, case_id)` and its foreign keys were part of it from the start); no DDL, no lockfile change. `tb_notice_dev` was never written by this work (`db:verify dev` reads metadata and a row count only).

## 24. Contract changes

None. The three operations are exactly the TB-SCHEMA-API-v1.2.0 definitions (inventory and parity tests; `contracts:check` finds no drift); `packages/contracts` is unchanged; `AppMeta.schemaRelease` stays as recorded; PFC wire id `PFC-YT-EMAIL-v1.1`. `TB-PROMPT-TEMPLATE-v1` is an implementation identifier stored in `templateVersion` (a free string of the contract), not a contract release.

## 25. Interpretations for R12 review

1. **Template identifier** `TB-PROMPT-TEMPLATE-v1` (D5) — an internal id with no legal or policy approval; its wording is the application's own boundary text, rules and task instructions, and it contains no legal declaration.
2. **The case row is locked, not changed** (D2): a generation moves neither `rowVersion` nor `contextRevision`; it makes the case history-bearing (route correction refused, case not deletable).
3. **Two revision checks and one digest check** (D3): the revision before the rebuild (early refusal under the case lock) and after it; the digest after it.
4. **Replay returns the historical snapshot** (D7), even after the case changed — it claims no freshness; a new generation needs a new key and a current review.
5. **`getPrompt` is global by id** (D8), as the contract path is; the page refuses to show another case's snapshot under a case.
6. **Versions per task across modes** (D4): PREPARATION and DRAFTING prompts of one task share one sequence.
7. **The P4D gate and bounds are shared, not duplicated** (D1): `assertDeliverable`; a PREPARATION review's digest does not stand in for DRAFTING (the digest binds the mode).
8. **Summaries only in the list** (API_CONTRACT §11): no prompt text, context or manifest.
9. **No declaration text** (§10): the mission's stop rule — a reviewed declaration would need human approval; the template does not invent one.

## 26. Deviations, warnings and limitations

- Browser item 7 (Copy prompt): the automation profile denies clipboard access, so the OS clipboard content could not be read back; the clipboard-API boundary and the web test were verified instead (§19).
- Browser: plain link navigation leaves keyboard focus on `<body>` (the app's convention on every page; the skip link works) — not changed by P4E.
- Test hardening during verification (test code only, no product change): `9bffe24` (concurrency test counts the lock holders), `cc0d62d` (two web tests assert the outcome directly). The reason given in the `9bffe24` commit message is wrong — the original concurrency test already caught a missing case lock (§20); the history was not rewritten, the correction is recorded here and in the negative-control evidence.
- `smoke:p4d` has 87 checks instead of 88 (its prompt probe removed because prompts are now routed); earlier smokes probe candidates instead of prompts.
- `install --immutable` reports the pre-existing YN0086 peer-dependency note (unchanged since P4B).
- `yarn test:transition-baseline` fails by design (historical oracle since the v1.1.0 edit) and is not a gate.

## 27. Blockers

None. No stop condition was reached: no authentication, GitHub approval, material Git conflict, schema or contract change, material semantic ambiguity, legal approval or irreversible external action was needed.

## 28. Proposed next phase (not started)

P4F — imported NoticeCandidate (`importCandidate` and its reads): the exact draft returned from the drafting step outside the application, stored as an immutable candidate artifact bound to one prompt snapshot, with its single pending signature slot. Not started; it needs its own approved mission. Validation, assessments, readiness and unsigned export follow in later phases; signing, sending and G7 never exist in the application. *(Authorized at R12 by mission TB_R12_CLOSEOUT_MERGE_AND_P4F_NOTICE_CANDIDATE_TO_R13 as P4F — NoticeCandidate, the five contracted operations `importCandidate`, `listCaseCandidates`, `getCandidate`, `reviseCandidate` and `supersedeCandidate`; NOT_STARTED at the R12 closeout, §29.)*

## 29. R12 — PASS and closeout (2026-09-26, home PC)

Mission TB_R12_CLOSEOUT_MERGE_AND_P4F_NOTICE_CANDIDATE_TO_R13. This section records the operator's R12 result and the R12 closeout before the P4E pull request. Sections 1–28 keep the state at their time.

### 29.1 Result (operator)

| Item | Recorded value |
|---|---|
| **R12** | **PASS** (2026-09-26) — no remediation |
| **P4E** | **VERIFIED_COMPLETE** — `generatePrompt`, `listCasePrompts`, `getPrompt` (§1.1) and the prompt pages |
| Merge | **AUTHORIZED_FOR_MERGE** — pull request `feature/p4e-prompt-snapshot` → `main`, normal GitHub merge commit (no squash, no rebase, no force-push, no admin bypass, the branch kept) after the exact closeout head and the pull request checks are green |
| **Active wire contract** | **TB-SCHEMA-API-v1.2.0**, unchanged by P4E; both release records pinned and never edited; the frozen historical reference TB-SCHEMA-API-v1.0.0 unchanged |
| PFC wire id | `PFC-YT-EMAIL-v1.1` (unchanged) |
| Prompt template | `TB-PROMPT-TEMPLATE-v1` — the accepted internal prompt template: an implementation identifier stored in `templateVersion`, not a wire or PFC release and no legal or policy approval (§7, §25 item 1) |
| Decisions | ADR-0001, ADR-0002, ADR-0003, ADR-0004 and ADR-0005 — all ACCEPTED; P4E adds no ADR |
| R12 semantics | The permanent P4E rules stay in force, unchanged in substance in `CLAUDE.md`: a PromptSnapshot is not a NoticeCandidate (nor a notice) and not a legal conclusion; deterministic prompt rendering; exact context freeze; exact dependency freeze; stale context is 412 `CONTEXT_CHANGED`, never a silent regeneration; historical PromptSnapshots are immutable; no AI provider; no G1–G7 decision; no READY_FOR_SIGNER; the signature stays HUMAN_PENDING (exactly one pending signature slot); no signature; no external action; untrusted data stays delimited. `CLAUDE.md` now names "NoticeCandidate", READY_FOR_SIGNER and HUMAN_PENDING in these rules explicitly |
| `yarn test:transition-baseline` | A historical opt-in oracle that fails by design since the v1.1.0 edit; not a gate and not "fixed" |
| P4F | **NOT_STARTED** at this record — NoticeCandidate (`importCandidate`, `listCaseCandidates`, `getCandidate`, `reviseCandidate`, `supersedeCandidate`), authorized by the same mission on `feature/p4f-notice-candidate`, created from the exact post-merge `main` once its CI is green; it stops at review gate R13 |

### 29.2 Heads

| Name | Commit |
|---|---|
| `P4E_ACCEPTED_CODE_HEAD` (named by the operator) | `5e57dbca0597159d045ceffcb5a81bec761d0caa` — the R12 submission, documentation on the code head `cc0d62d` |
| R12 final CI | push run [36208469062](https://github.com/TuongChris/tb-notice-production-system/actions/runs/36208469062) on `5e57dbc`, 2026-09-26T01:27:11Z–01:34:10Z, **success**: "Non-DB checks (cold install)" (job 108309928867) and "Database, seed and smoke (MySQL 8.4.11)" (job 108309929104) — `reference:check` and `contracts:check` OK, lint "Found 0 warnings and 0 errors.", Prettier clean, `yarn test` 1431 / 44 files, `yarn test:db` 455 / 12 files, both drift diffs empty, seed digest `0ee26dc3…b775`, `smoke:local` 52, `smoke:auth` 4, `smoke:directory` 14, `smoke:p3a` 24, `smoke:p3b` 36, `smoke:p4a` 50, `smoke:p4b` 64, `smoke:p4c` 62, `smoke:p4d` 87, `smoke:p4e` 84 |
| `P4E_R12_CLOSEOUT_HEAD` | the commit that adds this section (documentation); its CI run and the merge are recorded on `feature/p4f-notice-candidate` |

### 29.3 Closeout checks

Pre-flight on `5e57dbc`, after `git fetch origin`:

- branch `feature/p4e-prompt-snapshot` in sync with origin, worktree clean;
- `origin/main` = `b7878b764f12e3a567b6315dc90a1c08f7392a3f`, unchanged since the branch was created;
- no P4E pull request (pull requests #1–#7, all merged); `gh` authenticated as the repository owner's account; `main` has no branch protection and no rulesets;
- run 36208469062 completed with success;
- `reference:check` and `contracts:check` OK.

The closeout is one documentation-only commit: this section, the header and status rows, the commit table, the §21 and §28 pointers, `CURRENT_STATE.md` and `CLAUDE.md`. No product code, test, contract source, generated artefact, release record, `docs/reference/**`, migration or lockfile changes.

Checks on the complete closeout tree before committing:

- `reference:check` and `contracts:check` OK;
- `typecheck` OK;
- `lint` and `oxlint --deny-warnings --format default` report "Found 0 warnings and 0 errors.";
- `format:check` clean;
- `yarn test` 1431 passed in 44 files (unchanged).

`yarn test:db` was not rerun because no code changed; it runs in CI on the closeout head.
