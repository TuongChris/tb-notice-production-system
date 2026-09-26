# P4F — NoticeCandidate (home PC)

Mission **TB_R12_CLOSEOUT_MERGE_AND_P4F_NOTICE_CANDIDATE_TO_R13**, steps 9–11. Branch `feature/p4f-notice-candidate`, created from the exact post-P4E `main` `79db09b` (merge commit of PR #8), with the post-R12 checkpoint `a417b6a` (documentation only). P4F implements **five** contracted operations — `importCandidate`, `listCaseCandidates`, `getCandidate`, `reviseCandidate` and `supersedeCandidate` — and the candidate pages of a case.

**R13 result (operator, 2026-09-26): PASS.** P4F = **VERIFIED_COMPLETE**; the active wire contract stays **TB-SCHEMA-API-v1.2.0**; `TB-PROMPT-TEMPLATE-v1` and `TB-CANDIDATE-ARTIFACT-v1` are the accepted internal identifiers. P4F is authorized for merge to `main` by a normal merge commit (mission TB_R13_CLOSEOUT_MERGE_AND_P4G_TECHNICAL_VALIDATION_TO_R14; §28). P4G (technical validation) is **NOT_STARTED** at this record. No validation run, validation issue workflow, candidate assessment, readiness, unsigned export, G1–G7 decision, READY_FOR_SIGNER, signature, sending, mailbox, Drive or AI-provider action exists.

Persistent rules (they stay in force; `CLAUDE.md` carries them):

- **A candidate is the exact unsigned draft artifact, not a notice.** It is the subject, body, envelope and prepared-document plan drafted outside the application — by a person or a drafting tool the operator chose — from one prompt snapshot of its case, imported for later validation and human review. It is never approved, reviewed, legally sufficient, ready, signed, adopted or sent, and storing it proves nothing about its prose.
- **A candidate is not a legal conclusion, an approval or readiness.** Nothing about a candidate — its existence, its version, a later revision or a supersession — decides a G1–G7 gate, READY_FOR_SIGNER, ownership, permission, infringement, current authority or signer eligibility.
- **Exact prompt binding.** A candidate names exactly one prompt snapshot of its own case (another case's is 422 `CROSS_CASE_REFERENCE`); its task is the prompt's. Nothing latest, newest or current is substituted, and no freshness is required at import: the draft records what was drafted from that historical snapshot. A PREPARATION prompt's draft is stored as draft material only.
- **Exact text.** Subject, body and every other text are stored exactly as supplied — no trimming, newline rewriting, Unicode normalization or sanitizing; a NUL anywhere is refused before any claim. `bodySha256` is the SHA-256 of the exact UTF-8 bytes of the body.
- **The artifact hash binds the artifact.** `artifactSha256` = SHA-256 of TB canonical JSON v1 of `{algorithm TB-CANDIDATE-ARTIFACT-v1, subject, bodyText, envelope (from, to, replyTo, parentBindingId), preparedDocuments (in order), signatureState HUMAN_PENDING, signatureSlot}` — never the id, case, prompt, parent, version, task, authoring tool, reasons, supersession or times.
- **HUMAN_PENDING only.** The signature state is always `HUMAN_PENDING` (API constant, SQL CHECK backstop). Nothing inserts a signer name, signs or adopts; the human signer reviews, adopts, signs and sends outside the application. Whether the draft carries the pending slot exactly once is the later validator's rule, not import's (AC-047: the draft is retained for correction).
- **The envelope keeps its prompt's thread and sender.** `envelope.parentBindingId` is exactly the prompt's parent binding (none for INITIAL and for a reply prompt prepared without one); `envelope.from` is exactly the intended mailbox of the selection the prompt pinned. Nothing is chosen, resolved or sent; recipients are stored as entered.
- **A document plan is a plan.** Each entry names one exact source revision that applies to the case; a named `contentSha256` is only the one recorded on that revision (its hash target says what it covers); PREVIOUSLY_SUPPLIED only for a source a prior transmission in the prompt's context records among its captured attachments. No state means attached, uploaded, supplied or sent; there is no ACTUALLY_ATTACHED state.
- **Immutable artifacts, lineage without forks.** A candidate's content never changes. A revision is a new candidate naming the one it revises — same case and task, only the latest version of a chain (409 `REVISION_NOT_HEAD` naming it); the revised row stays byte-identical.
- **Supersession is internal, never a retraction.** "Supersede this draft artifact" records once that a candidate is no longer the active draft artifact (time and reason); it deletes, edits and creates nothing, contacts no platform and retracts nothing previously sent.
- **Case isolation and no case-context change.** A candidate is read and written only through its own case; nothing of one case appears in or is used by another. The case row is locked for every candidate write and never changed (no `rowVersion` or `contextRevision` move); a candidate makes the case history-bearing.
- **No AI provider, no validation or readiness, no external action.** Importing text calls no AI provider, fetches nothing and contacts no one; tests guard the module, the service's calls and the pages.

## Status by scope (not collapsed)

| Scope | Status |
|---|---|
| R12 closeout (steps 1–8) | **DONE** — R12 = PASS recorded (`db03b7a`); P4E merged to `main` by PR #8 (merge commit `79db09b`); post-merge `main` CI green; branch created from `79db09b`; checkpoint `a417b6a` (§2; `P4E_PROMPT_SNAPSHOT.md` §29–§30) |
| P4F implementation (step 9) | **IMPLEMENTED** on `feature/p4f-notice-candidate` — code head `dcc4289` (§3) |
| P4F home-PC automated tests | **PASS** — `yarn test` 1465 / 46 files, `yarn test:db` 494 / 13 files (P4F: 39 DB, 23 unit, 11 web) (§20) |
| Concurrency / transaction tests | **PASS** — concurrent imports (versions 1 and 2, the second waits for the case lock), concurrent revisions (one 409 `REVISION_NOT_HEAD`, no fork), concurrent supersessions (one 409); an audit failure rolls back the candidate, the audit event and the idempotency record (§10–§13, §20) |
| Browser verification (Playwright MCP, `tb_notice_test`) | **PASS** — 34/34; one build finding (F1) fixed before the pass; three limitations recorded (§18) |
| Negative controls | **PASS** — 29/29 on `dcc4289`, all 48 responsible commands failing on an AssertionError (§19) |
| Full regression (§48 of the mission) | **PASS** — 21/21 steps exit 0 on `dcc4289`, lint 0 warnings (§20, `evidence/p4f-first-pc-sweep.txt`) |
| Exact final branch CI | **PASS** — push run 36219605497 on the R13 submission head `ffadd40`, both jobs (§28.3); the code head's run: push run 36218703034 on `dcc4289` — success, both jobs (`evidence/p4f-ci-run-36218703034.txt`) |
| Schema / migration | **No change** (§22) |
| Wire contract | **No change** — TB-SCHEMA-API-v1.2.0 (§23) |
| R13 review | **PASS** (operator, 2026-09-26) — no remediation; the §24 interpretations accepted (§28) |

## 1. Operation matrix and design (contract-first)

### 1.1 Exact contract scope

| operationId | Method and path | Request | Response | If-Match | Idempotency-Key | Affected | Disposition |
|---|---|---|---|---|---|---|---|
| `importCandidate` | POST `/cases/{caseId}/candidates` | `CreateCandidate` {`promptSnapshotId` UUID, `subject` 1–998, `envelope` Envelope, `bodyText` 1–200,000, `preparedDocuments` DocumentPlan[0..100], `authoringTool?` ≤100 \| null, `revisionReason?` 1–2,000 \| null} | 201 `{data: NoticeCandidate, meta}` | none (no precondition target) | required | one NoticeCandidate (version N, no parent); the CaseRecord locked, not changed | IMPLEMENTED |
| `listCaseCandidates` | GET `/cases/{caseId}/candidates` | query `limit` 1–100 (25), `cursor` ≤2,000, `q` ≤200 | 200 `{data: {items: NoticeCandidateSummary[], nextCursor}, meta}` | — | — | read only | IMPLEMENTED |
| `getCandidate` | GET `/candidates/{id}` | — | 200 `{data: NoticeCandidate, meta}` | — | — | read only | IMPLEMENTED |
| `reviseCandidate` | POST `/candidates/{id}/revisions` | `ReviseCandidate` — as `CreateCandidate`, with `revisionReason` a required key (1–2,000 \| null) | 201 `{data: NoticeCandidate, meta}` | none | required | one new NoticeCandidate (parent = `{id}`); the revised row unchanged; the CaseRecord locked, not changed | IMPLEMENTED |
| `supersedeCandidate` | POST `/candidates/{id}/supersede` | `ArchiveRequest` {`reason` 1–2,000} | 200 `{data: NoticeCandidate, meta}` | none | required | `supersededAt` and `supersedeReason` of that candidate only | IMPLEMENTED |

Contracted errors: 400 401 403 404 409 413 422 429 500 for all five (no 412 or 428: no precondition target). `NoticeCandidate`: id, caseId, promptSnapshotId, parentCandidateId, version, taskType, subject, envelopeJson (Envelope), bodyText, bodySha256, artifactSha256, preparedDocuments, signatureState, authoringTool, revisionReason, supersededAt, supersedeReason, createdAt, createdById — no rowVersion, no ETag. `NoticeCandidateSummary`: id, caseId, promptSnapshotId, version, taskType, subject, bodySha256, artifactSha256, signatureState, supersededAt, createdAt. `Envelope`: from, to, replyTo?, parentBindingId?. `DocumentPlan`: sourceId, purpose, state (REFERENCE_ONLY \| PREPARED_FOR_ATTACHMENT \| PREVIOUSLY_SUPPLIED \| UNKNOWN), fileName?, contentSha256?, disclosureReview (PENDING \| REVIEWED_WITH_LIMITS), limitations?. Every later candidate operation (`validateCandidate`, `listValidationRuns`, `listValidationIssues`, `captureCandidateAssessment`, `listCandidateAssessments`, `getCandidateReadiness`, `exportUnsignedCandidate`) stays unrouted (404).

### 1.2 Frozen rules that decide the design

- INVARIANTS §3: "Candidate's Prompt belongs to Candidate Case — Composite FK"; "pending signature constant — SQL CHECK + API validation"; "A source/fact/candidate/event revision does not fork or change scope — unique successor where defined + transactional service check".
- INVARIANTS §4: candidate body, subject, envelope and prepared-document manifest are immutable; a change creates a new candidate and former checks remain historical; the signature placeholder is the single permitted intentional pending field; prepared files can justify planned attachment language but never create ACTUALLY_ATTACHED or AS_SENT; a reply never replaces the thread or Reply-To for convenience.
- INVARIANTS §5 (lock order, bounded retries, no external side effect inside a retryable transaction); §6 (exact text, NUL and unpaired surrogates refused, `bodySha256` over the exact UTF-8 bytes, `artifactSha256` over the canonical JSON of subject, exact body, envelope, ordered prepared-document manifest and signature state/slot, no creation time, TB canonical JSON v1); §7 (audit redacts full private bodies — identifiers, hashes and a minimal field diff).
- DATABASE_SCHEMA NoticeCandidate: content immutable at insert; only `supersededAt`/`supersedeReason` by a dedicated command; CHECK `signature_state = 'HUMAN_PENDING'`; unique `(case_id, task_type, version)` and `(id, case_id)`; FK `(prompt_snapshot_id, case_id)` → `prompt_snapshots(id, case_id)`; FK `parent_candidate_id` → `notice_candidates(id)` (not composite, no unique on the parent).
- DOMAIN_MODEL §14: no persisted READY_FOR_SIGNER or candidate state; supersession by a dedicated command without changing content. Production Form Contract §6–§8 (thread, recipient and referenced claim not silently changed; DocumentPlan states, no ACTUALLY_ATTACHED; one slot; the artifact contract).
- API_CONTRACT §3 (candidate text never trimmed; body cap 200,000), §9 step 8 ("Import exact ChatGPT draft … Missing signature remains one controlled pending slot"), §11 (list endpoints return summaries). Acceptance scenarios AC-044–AC-048; the frozen fixture "Draft import is not legal readiness" (a valid `CreateCandidate` without the slot; a client hash or `signedAt` refused as unknown fields).

### 1.3 Design decisions (as implemented)

- **D1 Case lock, no case change.** Every candidate write locks the CaseRecord FOR UPDATE first — import: the path case; revise and supersede: the candidate's case (read from its immutable `case_id`), then the candidate itself FOR UPDATE, re-read (lock order CaseRecord → NoticeCandidate). The case's `rowVersion` and `contextRevision` never move: a candidate is downstream of a prompt, not case context (it would otherwise change the very context its prompt froze). `NOTICE_CANDIDATE` was already in the case's `HISTORY` list: a candidate makes the case history-bearing.
- **D2 Prompt binding.** The named prompt snapshot exists (422 `REFERENCE_NOT_FOUND` {field promptSnapshotId}) and is of the path case (422 `CROSS_CASE_REFERENCE` {field promptSnapshotId}; the composite foreign key is the backstop); the task is the prompt's (the request has no task field). No freshness check: the prompt is used as stored, and nothing latest, newest or current is chosen.
- **D3 PREPARATION prompts** are accepted; their candidates are stored as draft material, and the pages say so. No readiness gate exists.
- **D4 Exact text.** Every stored text is kept exactly as decoded from JSON; a NUL anywhere → 422 `VALIDATION_FAILED` naming each field, before the idempotency claim (unpaired surrogates are refused by the request parser).
- **D5 Complete stored shape.** The stored envelope and plans carry every contracted key; an omitted optional field is stored as null (the contract gives omission and null one meaning, "none"), so a stored candidate's hash can be recomputed from exactly what `getCandidate` returns. Array order is kept.
- **D6 Hashes.** `bodySha256` = `exactTextSha256(bodyText)`; `artifactSha256` = `tbCanonicalSha256` of the object in §9 (`candidate-artifact.ts`, algorithm identifier `TB-CANDIDATE-ARTIFACT-v1`). Neither the prompt id nor the task is hashed: the frozen definition lists the artifact content only; lineage is bound by the row.
- **D7 Signature.** `signatureState` = the constant HUMAN_PENDING (DB CHECK backstop). The pending slot in the body is not required at import (AC-047; the frozen fixture) — its count is the later validator's rule (INVARIANTS §2 step 9). Nothing inserts a name.
- **D8 Envelope against the prompt.** `envelope.parentBindingId` must equal the prompt's `parentBindingId` (null for INITIAL and for a reply prepared without a parent): a reply prompt with a parent and an envelope without one → 422 `REPLY_PARENT_REQUIRED` {field envelope.parentBindingId, reason NOT_IN_ENVELOPE, promptParentBindingId}; any other difference → 422 `ENVELOPE_PARENT_MISMATCH` {field, promptParentBindingId}. When the prompt pinned an authority selection, `envelope.from` must equal its `intendedFromEmail` exactly → 422 `ENVELOPE_SENDER_MISMATCH` {field envelope.from, authoritySelectionId}; without a selection the sender is stored as entered and the pages say it is backed by no selection. `to` and `replyTo` are stored as entered (recipient semantics belong to validation and G6).
- **D9 Document plans.** Each `sourceId` exists and applies to the case (`source-scope.ts`, target Case: 422 `REFERENCE_NOT_FOUND` / `CROSS_CASE_REFERENCE` / `CROSS_AGENCY_REFERENCE` and the other scope refusals, naming `preparedDocuments.<i>.sourceId`); the exact revision is stored and never followed. A non-null `contentSha256` must equal that revision's recorded `contentSha256` → else 422 `DOCUMENT_PLAN_UNSUPPORTED` {reason HASH_NOT_RECORDED}. PREVIOUSLY_SUPPLIED needs a prior transmission of the prompt's frozen context (its `priorCorrespondenceIds`) whose captured attachment manifest names that exact source → else 422 `DOCUMENT_PLAN_UNSUPPORTED` {reason NOT_RECORDED_AS_SUPPLIED}; the parent NMI's attachments do not count. PREPARED_FOR_ATTACHMENT, REFERENCE_ONLY and UNKNOWN are plans only; body attachment wording is not checked here (validation, G6).
- **D10 Versions** per case and task: MAX+1 under the case lock (the unique key is the backstop); imports and revisions share the sequence of their case and task.
- **D11 Revision.** The parent exists (404) and its case is writable (409 when archived); the parent is its chain's latest version (no candidate names it as parent) → else 409 `REVISION_NOT_HEAD` {headId: the chain's latest}; the new prompt is of the same case (422 `CROSS_CASE_REFERENCE`) and task (422 `REVISION_SCOPE_CHANGE` {fields [promptSnapshotId]}); the parent row is never touched; a superseded latest version may be revised (no rule forbids it; the revision is a new artifact).
- **D12 Supersession.** The dedicated command with `ArchiveRequest` {reason}: `supersededAt` = the write instant and `supersedeReason` exactly, once → 409 `CANDIDATE_ALREADY_SUPERSEDED` {supersededAt}; content, hashes and lineage never change; no correspondence record, no retraction.
- **D13 Idempotency.** The WriteExecutor for all three writes (READ COMMITTED); `replayRecord` reads the candidate back by id (the idempotency record keeps no copy of the draft); the same key with another body → 409 `IDEMPOTENCY_CONFLICT`.
- **D14 Audit.** `CANDIDATE_IMPORTED`, `CANDIDATE_REVISED`, `CANDIDATE_SUPERSEDED` — identifiers, version, task, hashes, HUMAN_PENDING, counts and lengths, never a text (§14).
- **D15 List and get.** List: case-scoped (404 for an unknown case), newest first by keyset, summaries only, superseded ones included; `q` = exactly a candidate id, prompt snapshot id, body SHA-256 or artifact SHA-256. Get: global by id, exactly as stored; the pages show a candidate only under its own case.
- **D16 No AI provider or network** — guarded as in P4E: a source scan of the module, a socket and fetch spy in a DB test, a scan of the pages (§17).
- **D17 Pages.** The plan editor offers the chosen prompt's source manifest only (the exact source revisions its drafting context listed; the API accepts any source revision that applies to the case). A browser text box records line breaks as LF — the form says so and offers loading the body from a UTF-8 file, kept exactly (CRLF, byte order mark). The pages import only types from `@tb/contracts` (no contract code in the page chunk).

## 2. R12 closeout and branch (mission steps 1–8)

Recorded in `docs/verification/p4e/P4E_PROMPT_SNAPSHOT.md` §29–§30 (verified with `git` and authenticated `gh`, not assumed):

| Item | Value |
|---|---|
| R12 | **PASS** (operator, 2026-09-26) — P4E VERIFIED_COMPLETE, no remediation; closeout head `db03b7a`, push run 36212158654 success |
| P4E pull request | [#8](https://github.com/TuongChris/tb-notice-production-system/pull/8) `feature/p4e-prompt-snapshot` → `main`, head `db03b7a`; pull_request run 36212659975 success |
| Merge | **merge commit** `79db09b13de4177d6649d14d703e9327796fd1cc` (parents `b7878b7`, `db03b7a`; tree identical to `db03b7a`), merged 2026-09-26T02:52:12Z; no squash, rebase, `--admin` or branch deletion |
| Post-merge `main` CI | push run [36213030265](https://github.com/TuongChris/tb-notice-production-system/actions/runs/36213030265) on `79db09b` — success (both jobs) |
| P4F start | `feature/p4f-notice-candidate` from the exact `origin/main` `79db09b` (push run 36213422419 success); checkpoint commit `a417b6a` (documentation only; P4F NOT_STARTED at that commit), push run 36213970569 success |

## 3. Implementation (commits)

| Commit | Content | CI |
|---|---|---|
| `a417b6a` | Post-R12 checkpoint (documentation only) | run 36213970569 success |
| `8a964ce` | Web: the candidate history, import, detail (with supersession) and revision pages (`apps/web/src/app/cases/candidates.tsx`), routes, the case page's Candidates section, API client, formatting (planned-state and disclosure labels), CSS; `tests/web/p4f.test.tsx` (11) and the fake API's candidate routes (`tests/web/support.tsx`) | (pushed with `7b33d9c`) |
| `b798b59` | API: `modules/candidates/*` (artifact, rules, views, write observer seam, service, controller, module); the P4F error codes; `tests/api/candidate-rules.test.ts` (23) and `tests/db/p4f-http.test.ts` (39) with synthetic fixtures; unrouted-path probes of earlier DB tests and smokes moved to validation onward; five candidate guard checks in `smoke:local`; the UI sandbox cleans candidates | (pushed with `7b33d9c`) |
| `7b33d9c` | `yarn smoke:p4f` (CI only) and its CI step | run 36216834390 success — `smoke:p4f` 92 checks |
| `e1039b5` | Test: three candidate tests strengthened from negative-control run 1 (test code only; §19) | (pushed with `dcc4289`) |
| `dcc4289` | Fix from the first sandbox build (finding F1): the candidate page imports only types from `@tb/contracts` — its chunk 265.60 kB → 39.41 kB; no behaviour change — the code head | run 36218703034 success |
| `ffadd40` | R13 submission: this record, the evidence, `CLAUDE.md`, `CURRENT_STATE.md` (documentation only) — the accepted head | run 36219605497 success |
| (the R13 closeout) | §28, the header and status rows, this row, the §20 and §27 pointers, `CLAUDE.md`, `CURRENT_STATE.md` and the UI sandbox's header comment (documentation only) | recorded with the merge |

## 4. Candidate semantic and prompt binding

A candidate stores exactly what was drafted outside the application: subject, envelope, body and prepared-document plan, with the drafting tool's name when given (descriptive only; it establishes no provenance, review or adoption) and a reason when given. It is bound by composite foreign key to one prompt snapshot of its case; its task is the prompt's; its version is the next of its case and task. It is never a notice as sent, an approval or a readiness state (DB tests "INITIAL: subject, body …", "the task is the prompt’s …", "no freshness check and no substitution …": after the case context changed and a newer prompt exists, a draft of the older prompt is stored bound to that older prompt; "the prompt is this case’s …": unknown 422 `REFERENCE_NOT_FOUND`, another case's 422 `CROSS_CASE_REFERENCE`, an archived case 409, nothing written).

**PREPARATION prompts** (D3): a PREPARATION prompt of a bare case (no route, no selection, gaps listed) takes a draft, stored as a draft with HUMAN_PENDING and nothing more (DB test); the detail page says "Drafted from a preparation prompt, which works out what the recorded context is missing: this candidate is draft material only." (web test; browser item 10).

## 5. Subject and body exactness

Subject, body, envelope, plans, authoring tool and reasons are stored as decoded — CRLF, trailing spaces, tabs, NFD letters, HTML, instruction-like text and the pending slot survive byte for byte, and `getCandidate` returns them exactly (DB test "INITIAL: subject, body (CRLF, trailing space, tab, NFD, HTML, instruction-like text, the pending slot) …"; unit tests "ASCII, CRLF against LF, one trailing space, composed against decomposed letters …"; browser items 4–6 with a BOM + CRLF file). A NUL in any field is 422 `VALIDATION_FAILED` naming every such field, before the claim (unit + DB tests; negative control NC-P4F-04).

## 6. Envelope rules

See D8. DB tests: "INITIAL: no parent binding may be named — none is invented (422 ENVELOPE_PARENT_MISMATCH)"; "NMI_REPLY: the envelope names exactly the prompt’s parent — missing is 422 REPLY_PARENT_REQUIRED, another NMI of the case is 422 ENVELOPE_PARENT_MISMATCH …"; "a reply prompt prepared without its parent pins no thread …"; "the sender is exactly the mailbox the prompt’s selection names: the route’s default signer, another mailbox or another spelling is 422 ENVELOPE_SENDER_MISMATCH …". The pages show the thread from the prompt (never chosen) and lock From to the selection's mailbox (browser items 3, 11, 12).

## 7. Pending signature

`signatureState` is always HUMAN_PENDING: not a request field (a client `signatureState`, `signedAt`, hash, task, version, parent or readiness field is refused as unknown — DB test "the body is exactly the contract …"), written as the constant (unit scan "nothing writes a signed, adopted, approved, G7 or ready state …"), with the DB CHECK `ck_notice_candidates_unsigned_only` as backstop. Nothing inserts the signer's name (NC-P4F-09). A draft without the slot or with it completed is stored as supplied so that it can be corrected — the slot count is the later validator's rule (D7).

## 8. Prepared documents and document source checks

See D9. DB tests: "each plan names a source revision that applies to this case: unknown 422 REFERENCE_NOT_FOUND, another case’s 422 CROSS_CASE_REFERENCE, another agency’s 422 CROSS_AGENCY_REFERENCE — naming the plan"; "the exact revision is stored and never followed …"; "a content SHA-256 is the one recorded on the source revision …"; "PREVIOUSLY_SUPPLIED only for a source the captured attachments of a prior transmission in the prompt’s context name — not for INITIAL, not the parent NMI …"; "PREPARED_FOR_ATTACHMENT, REFERENCE_ONLY and UNKNOWN are stored as a plan in the given order — the order is part of the artifact; storing a plan creates no correspondence …". The contract's plan states have no ACTUALLY_ATTACHED, SENT or ATTACHED (unit test). The pages label the states "Reference only", "Prepared for attachment (planned, not attached)", "Previously supplied (as recorded)", "Unknown" (browser items 25–27).

## 9. bodySha256 and artifactSha256

- `bodySha256` = SHA-256 of the exact UTF-8 bytes of `bodyText` (the frozen helper's `exactTextSha256`).
- `artifactSha256` = SHA-256 of the TB canonical JSON v1 text of exactly `{algorithm: 'TB-CANDIDATE-ARTIFACT-v1', subject, bodyText, envelope: {from, to, replyTo, parentBindingId}, preparedDocuments: [{sourceId, purpose, state, fileName, contentSha256, disclosureReview, limitations}, …] in stored order, signatureState: 'HUMAN_PENDING', signatureSlot: '[PENDING AUTHORIZED SIGNER — FULL LEGAL NAME REQUIRED]'}`. Object keys are sorted by the encoding; array order is kept. It binds nothing else: no id, case, prompt, parent, version, task, authoring tool, revision reason, supersession or creation time.
- Oracle: unit tests pin both hashes of a fixed candidate against a hand-written canonical JSON text, recompute them with the frozen reference helper (`docs/reference/…/consistency-reference.mjs`, imported read-only) and show that every changed character (one space, CRLF for LF, a decomposed letter), the subject, the recipient, the plan and the plan order change the artifact (AC-044/AC-045); the DB tests recompute the stored hashes; `smoke:p4f` recomputes them with the frozen helper in CI; the browser pass recomputed a stored candidate's hashes independently (item 7).

## 10. Import transaction and version allocation

`import` (`candidates.service.ts`), in this order — each step's refusal writes nothing: the contract parse (422) → the NUL check (422) → the Idempotency-Key claim → one READ COMMITTED transaction: `lockCase` FOR UPDATE (404; archived 409) → the prompt (D2) → the envelope (D8) → the plans (D9) → version = MAX(version of this case and task) + 1 → both hashes → one insert (parent none, HUMAN_PENDING) → one audit event → the idempotency record → commit. Every candidate write of a case holds its case lock, so two imports never take one version: the second waits for the lock and allocates the next (DB test with the `CANDIDATE_WRITE_OBSERVER` seam: exactly one import past the lock while the first holds it, versions 1 and 2; NC-P4F-12). Versions: INITIAL 1, 2; a revision takes the next, 3; NMI_REPLY starts at 1; another case starts at 1 (DB test). A refused or failed write is never replayed as a success: a 422 releases the key; an audit failure rolls back the candidate, the audit event and the idempotency record (DB test).

## 11. Revision lineage and fork protection

A revision inserts a new candidate with `parentCandidateId` = the revised one, the next version and its own hashes and reason; the revised row stays byte-identical (DB test compares the whole stored row before and after, with every content field changed by the revision — strengthened in `e1039b5`; NC-P4F-10). Another prompt snapshot of the same case and task may be used and is bound; another task is 422 `REVISION_SCOPE_CHANGE`, another case's prompt 422 `CROSS_CASE_REFERENCE` (DB test; browser item 20). Only a chain's latest version is revised: revising one that already has a revision is 409 `REVISION_NOT_HEAD` naming the latest, also two levels down (DB test; NC-P4F-11). Two concurrent revisions of one candidate: the second waits for the case lock and is 409 `REVISION_NOT_HEAD` naming the first revision; exactly one successor exists (DB test; browser item 21). A superseded latest version may still be revised (DB test).

## 12. Supersession

`supersede` records `supersededAt` and the reason exactly — nothing else changes: content, hashes, lineage, the prompt and every correspondence record stay as they are (DB test compares the whole row; NC-P4F-14). A second supersession is 409 `CANDIDATE_ALREADY_SUPERSEDED` and changes nothing; the same key replays the original result; the same key with another reason is 409 `IDEMPOTENCY_CONFLICT` (DB test; NC-P4F-16). Two concurrent supersessions: one records its reason, the other is 409 (DB test). Superseding a version that has a revision leaves the revision unchanged; superseded candidates stay readable and listed (DB test). It is an internal artifact lifecycle step: the audit records `supersession INTERNAL_DRAFT_ARTIFACT`, `platformRetraction false`, `externalAction NONE` (NC-P4F-15); the page says "Superseding marks this candidate as no longer the active draft artifact. It does not contact the platform or retract anything previously sent." (web test; NC-P4F-28; browser items 22–24).

## 13. Idempotency

All three writes run through the WriteExecutor. The same key and body replay the stored candidate (same id, no new row or audit event), even after the case changed; the same key with another body is 409 `IDEMPOTENCY_CONFLICT` (DB test; NC-P4F-13; browser items 15–16). The replay reads the candidate back by id: the idempotency record keeps the response status, `meta` and the record's type and id (`WriteOptions.replayRecord`), never a copy of the draft.

## 14. Audit

| Event | Recorded |
|---|---|
| `CANDIDATE_IMPORTED` | caseId, promptSnapshotId, parentCandidateId (null), taskType, version, bodySha256, artifactSha256, signatureState, the envelope's parent binding, `preparedDocuments` {count, states}; subject, body, authoring tool and reason only as `{redacted: true, codePoints}`; `sourceIds` = the plans' distinct sources |
| `CANDIDATE_REVISED` | the same, plus `revisedArtifactSha256` and `samePromptSnapshot` |
| `CANDIDATE_SUPERSEDED` | before `{supersededAt: null}`; after caseId, taskType, version, artifactSha256, supersededAt, the reason as `{redacted, codePoints}`, `supersession INTERNAL_DRAFT_ARTIFACT`, `platformRetraction false`, `externalAction NONE` |

Never the subject, the body, an address or a plan's text (DB test "the audit events record identifiers, the version, the hashes, HUMAN_PENDING, plan counts and lengths — never the subject, the body, an address or a plan’s …"; NC-P4F-24).

## 15. List and get

List: this case's candidates only, newest first, as summaries (no body, envelope or plan), superseded ones included; pages with a cursor; `q` matches exactly a candidate id, a prompt snapshot id, a body SHA-256 or an artifact SHA-256 and never searches the text (DB test; NC-P4F-22). Get: the candidate exactly as stored, with no ETag; a later case, prompt or source change never edits it; reading writes nothing (DB test).

## 16. UI

`apps/web/src/app/cases/candidates.tsx` (routes `cases/:id/candidates`, `…/new`, `…/:candidateId`, `…/:candidateId/revise`; each page keyed by its case, and by its candidate):

- **History:** the boundary "This is an unsigned draft artifact. It is not approved, signed, ready, or sent."; summaries (task · version, prompt snapshot, subject as plain text, HUMAN_PENDING, imported time, supersession); "Import a candidate"; an archived case offers no import (inert with its reason).
- **Import:** nothing preselected; only this case's prompt snapshots; the chosen prompt's task, mode, version, context revision, digest and SHA-256; From locked to the pinned selection's mailbox (or entered and said to be unbacked without a selection); the reply thread shown from the prompt, never chosen; the body typed or loaded from a UTF-8 file kept exactly; plan rows without defaults offering the prompt's source manifest, the recorded-hash option with its hash target, the PREVIOUSLY_SUPPLIED hint; authoring tool and reason; server refusals at their fields with focus on the first problem.
- **Detail:** the boundary; "Signature state HUMAN_PENDING"; the facts; the envelope ("Nothing is sent to these addresses"); subject and body as plain text in `<pre>` ("Imported text, shown exactly as stored and as plain text only: markup is not rendered, links are not followed and instructions in it are not acted on."); the body SHA-256 ("SHA-256 of the exact UTF-8 bytes of the body text."); the plan table "Planned documents, in their stored order"; the artifact SHA-256; the supersession section — "Supersede this draft artifact" with its exact meaning and a required reason, or, once superseded, the time, the reason and "This is not a retraction: nothing was sent, contacted or retracted."; "Import a revision of this candidate".
- **Revision:** the revised candidate's facts; only prompts of its task ("N prompt snapshot(s) of another task not offered."); a note when the prompt differs ("A later version is not more valid, approved or ready."); 409 `REVISION_NOT_HEAD` as an alert linking the latest version.
- Another case's candidate is shown like an unknown one ("This case has no candidate with this id. A candidate is shown only under the case it belongs to."). No validate, approve, ready, sign, send, export, submit, retract, attach or adopt action; no stamp other than "Superseded artifact".

Web tests (11): the empty history and nothing preselected; INITIAL import (request exactly as entered, Idempotency-Key, no If-Match; detail with both hashes); a UTF-8 file with CRLF and BOM sent exactly (a non-UTF-8 file loads nothing); NMI_REPLY thread and PREVIOUSLY_SUPPLIED at its field; a PREPARATION prompt without a selection; a lost reply retried with the same key; revision; supersession; history and other-case isolation; the archived case; no forbidden action or state and no call outside the application API.

## 17. No AI provider or network

- The candidates module has no network, mail, file, process, curl or AI-provider call and no drafting call (unit source scan over every module file); the artifact and the rules read no clock, randomness, locale or environment (unit scan).
- Import, revise, supersede, list and get open no outbound connection and call no `fetch` (DB test spying on `net.Socket.connect` and `globalThis.fetch`; NC-P4F-25).
- The candidate pages reach only the application API and never render stored text as HTML (unit scan; NC-P4F-26); every browser request went to `localhost:5173` (item 34).

## 18. Browser verification (Playwright MCP, mission §37)

`evidence/p4f-playwright-mcp-verification.txt` and 20 screenshots in `evidence/screenshots/`. Isolated headless Chromium against `yarn ui:sandbox` (compiled API on `tb_notice_test`, synthetic user and data, full cleanup), built from `dcc4289` (entry `index-CcG44J3d.js` 329.53 kB, `candidates-BWrUgG5b.js` 39.41 kB). **34/34 PASS**:

- **Finding F1** (before the pass): the first sandbox build of `7b33d9c` showed the candidates chunk at 265.60 kB — the page's runtime import of `codePointLength` bundled the contracts package. Fixed in `dcc4289` (type-only import); no behaviour change.
- Items: empty history; import with nothing preselected; the chosen prompt's facts; INITIAL import with NFD/trailing spaces/markup/instruction-like text/two plans; exact subject and body after reload (and a BOM + CRLF file kept exactly); body SHA-256 = WebCrypto = node = the frozen helper; artifact SHA-256 = an independent recomputation with the frozen helper; HUMAN_PENDING; no approved/ready/sent state; PREPARATION draft material; NMI_REPLY with the prompt's thread; envelope refusals; wrong-case prompt and Beta-only source refused; concurrent imports versions 3 and 4; replay and key conflict; revision (parent byte-identical, `parentCandidateId`, other task and case refused, concurrent fork refused, the UI's not-head alert); supersession (empty reason refused locally, recorded once, content unchanged, replay, conflict); history keeps superseded candidates; "not a retraction" wording; plans only, never ACTUALLY_ATTACHED; PREVIOUSLY_SUPPLIED refused at its field and accepted as recorded; inert HTML; case isolation; no forbidden action; 390 px; keyboard and focus; sign-out; only `localhost:5173` requests.
- **Limitations:** L1 the plan editor offers the prompt's source manifest only, so the licence was linked and prompt v3 generated before item 4; L2 a text box records line breaks as LF (the form says so), CRLF/BOM exactness verified through the file path; L3 wrong envelopes, cross-case prompts, simultaneous requests and key reuse were sent by in-page fetch with the session CSRF token (the pages never produce them).

Teardown: sandbox rows deleted, `db:verify test --expect-empty` PASS (domain rows total 0), password and draft files deleted, browser closed, ports free.

## 19. Negative controls (mission §43)

`evidence/p4f-negative-controls.txt`. 29 controls — the twenty listed kinds and nine further P4F protections (second supersession, fabricated PREVIOUSLY_SUPPLIED, unrecorded hash, thread, sender, list leak, case context, retraction wording, another case's candidate shown). Each disables one protection by an exact text replacement, runs every responsible command (each must fail and name a test; the first failure message is recorded), and restores the files byte-identically.

- **Final run on `dcc4289`: 29/29 caught and restored, 48 commands, all 48 failing on an AssertionError; tree fingerprint identical; `db:verify test --expect-empty` PASS.** The unmutated baseline on the same head (39 distinct commands) passed right after it.
- In three controls a database backstop answered inside the failing DB assertion (the test asserts the contracted refusal): NC-P4F-01 (the composite foreign key (prompt, case) — 500 instead of 422 `CROSS_CASE_REFERENCE`), NC-P4F-04 (the exact-text hashing refuses NUL — 500 instead of 422; its unit test fails first), NC-P4F-08 (the CHECK `ck_notice_candidates_unsigned_only` — 500; its unit scan fails too).
- Run 1 (on `7b33d9c`) caught 27/29: NC-P4F-10 (the revision test's revision kept the parent's subject, so overwriting the parent's subject went unseen) and NC-P4F-28 (the web test's title interpolated the constant under test, so renaming it selected no test) were not caught, and NC-P4F-29 was caught by a wait timeout. `e1039b5` strengthened the three tests (test code only); re-run on `e1039b5`: 3/3 caught on assertions.

## 20. Tests, regression and CI

| Suite | Result |
|---|---|
| `yarn test` | 1465 passed / 46 files (P4F: `tests/api/candidate-rules.test.ts` 23, `tests/web/p4f.test.tsx` 11) |
| `yarn test:db` | 494 passed / 13 files (P4F: `tests/db/p4f-http.test.ts` 39 — operations and request rules 2, import 5, envelope 4, document plan 5, versions/idempotency/transactions 6, revision 5, supersession 3, list and get 2, case context/history/audit 2, contamination 1, untrusted content/no outbound/later phases 4) |
| `yarn smoke:p4f` (CI only) | 92 checks — a synthetic case pair with a frozen authority chain, intake and correspondence (an NMI; an outbound notice captured as operator reported with one attachment naming a source, bound as INITIAL_AS_SENT); three prompts; the INITIAL import (exact fields, version 1, HUMAN_PENDING, both hashes recomputed with the frozen helper, the case's row version and context revision unchanged); replay; key conflict; read-back and list; revision (the first unchanged byte for byte); a second revision of the first (409 naming version 2); the reply prompt for the INITIAL chain (422); the NMI_REPLY import with the prompt's thread and a PREVIOUSLY_SUPPLIED source; supersession (replay; a second one 409); expected refusals; case B lists nothing of case A; row counts (candidates +3, audit +4, nothing else) through the runtime account; no validation, assessment, readiness, export, candidate update or delete route (404) |
| `smoke:local` | 57 checks (52 before: the "candidates not routed" probe became five candidate guard checks — 401 without a session, 403 without Origin, also through the web proxy — and a "validation runs not routed" probe was added) |
| Earlier smokes | unchanged counts: `smoke:p3a` 24, `smoke:p3b` 36, `smoke:p4a` 50, `smoke:p4b` 64, `smoke:p4c` 62, `smoke:p4d` 87, `smoke:p4e` 84 (their candidate probes now probe validation runs and assessments) |
| Full regression (§48), 2026-09-26T04:43:30Z–04:51:26Z on `dcc4289` | **21/21 steps exit 0** (`evidence/p4f-first-pc-sweep.txt`): `reference:check` and `reference:helper-tests` (27 pass), `contracts:check`, `install --immutable`, `typecheck`, `lint` and `oxlint --deny-warnings` ("Found 0 warnings and 0 errors."), `format:check`, `yarn test` 1465, `yarn test:db` 494, `db:verify test --expect-empty` and `db:verify dev` (metadata and a row count only), `db:status test` and `dev`, both drift diffs empty, `build` (entry 329.53 kB, candidates chunk 39.41 kB, no chunk advisory), `smoke:local` 57, `dev:verify-shutdown` 4/4, then `reference:check` and `db:verify test --expect-empty` again; per-file counts: only the three P4F test files are new, every other file keeps its count |

CI: run 36216834390 (`7b33d9c`, first run with `smoke:p4f`, 92 checks) and run 36218703034 (`dcc4289`, the code head) — both success, both jobs (`evidence/p4f-ci-run-36218703034.txt`: the key lines of both jobs and every `smoke:p4f` check). The exact final head's run: push run 36219605497 on `ffadd40`, success, both jobs (§28.3). `yarn test:transition-baseline` stays a documented historical oracle, not a gate.

## 21. Contamination tests

DB test "two cases of one agency, owner and route": a prompt, a revision or a case-scoped source of the other case is refused (422 `CROSS_CASE_REFERENCE`); the same draft imported in both cases is two case-specific candidates with one artifact hash (the artifact binds content, not the case); each list shows its own; superseding in A changes nothing in B; no correspondence, AS_SENT, assessment or readiness record appears (NC-P4F-01, -17, -22). The pages show another case's candidate like an unknown one (web test, NC-P4F-29; browser item 29).

## 22. Database changes

None. `20260923103912_initial_schema` stays the only migration (the `notice_candidates` table with its CHECK, unique keys and foreign keys was part of it from the start); no DDL, no lockfile change. `tb_notice_dev` was never written by this work (`db:verify dev` reads metadata and a row count only).

## 23. Contract changes

None. The five operations are exactly the TB-SCHEMA-API-v1.2.0 definitions (inventory and parity tests; `contracts:check` finds no drift); `packages/contracts` is unchanged; `AppMeta.schemaRelease` stays as recorded; PFC wire id `PFC-YT-EMAIL-v1.1`. `TB-CANDIDATE-ARTIFACT-v1` is an implementation identifier of the artifact hash definition, not a contract release. The four new error codes use the free-string `code` field with contracted statuses.

## 24. Interpretations for R13 review

1. **The case row is locked, not changed** (D1): a candidate write moves neither `rowVersion` nor `contextRevision`; a candidate makes the case history-bearing.
2. **No freshness at import** (D2): a draft of an older prompt is stored bound to that prompt even after the case context changed or a newer prompt exists — it claims no currentness; later validation decides what a stale basis means.
3. **PREPARATION prompts accepted** (D3) as draft material only.
4. **The pending slot is not counted at import** (D7): AC-047 retains a draft without (or with a completed) slot for correction; the count is the validator's rule.
5. **The sender is the pinned selection's mailbox, exactly** (D8); a prompt without a selection pins none, and the sender is stored as entered and shown as unbacked.
6. **The thread is the prompt's parent exactly** (D8), none when the prompt named none.
7. **PREVIOUSLY_SUPPLIED** only from a prior transmission's captured attachments in the prompt's frozen context — as recorded, not verified; the parent NMI's attachments do not count (D9).
8. **A named content SHA-256** only as recorded on the source revision (D9).
9. **Plan sources in the UI** come from the prompt's source manifest; the API accepts any source revision that applies to the case (D17).
10. **A superseded latest version may be revised; a non-latest version may be superseded** (D11, D12): supersession and lineage are independent.
11. **Versions per case and task** are shared by imports and revisions (D10).
12. **`getCandidate` is global by id** (the contract path); the pages refuse to show another case's candidate under a case (D15).
13. **The artifact hash excludes the prompt, task and lineage** (D6): identical content in two cases or two chains has one artifact hash; the row binds the lineage.

## 25. Deviations, warnings and limitations

- F1 (build hygiene, found by the first sandbox build): a runtime contract import bundled the contracts package into the candidates chunk; fixed in `dcc4289` before the browser pass; no behaviour change.
- Test hardening during verification (test code only, no product change): `e1039b5` (three tests, from negative-control run 1, §19).
- Three negative controls show a database backstop answering 500 inside the failing DB assertion (§19); the API rules are the protections, the backstops remain.
- Browser limitations L1–L3 (§18).
- `smoke:local` has 57 checks instead of 52.
- The UI sandbox's header comment still lists the pages only through P4D (unchanged since P4E; its table list and cleanup include prompts and candidates) — documentation only, not changed. *(Corrected in the R13 closeout, §28.4.)*
- `install --immutable` reports the pre-existing YN0086 peer-dependency note.
- `yarn test:transition-baseline` fails by design (historical oracle since the v1.1.0 edit) and is not a gate.

## 26. Blockers

None. No stop condition was reached: no authentication, GitHub approval, material Git conflict, schema or contract change, material semantic ambiguity, legal approval or irreversible external action was needed.

## 27. Proposed next phase (not started)

P4G — technical validation of a candidate: `validateCandidate` (POST `/candidates/{candidateId}/validation-runs`), `listValidationRuns` and `listValidationIssues` — a recorded ValidationRun over one exact candidate artifact (its `artifactSha256`) with its ValidationIssues (for example the pending slot exactly once, attachment wording against the document plan, the envelope and thread, bounds). A technical validation is not a substantive review, a G1–G6 decision or readiness. Not started; it needs its own approved mission. Assessments, readiness and unsigned export follow in later phases; signing, sending and G7 never exist in the application. *(Authorized at R13 by mission TB_R13_CLOSEOUT_MERGE_AND_P4G_TECHNICAL_VALIDATION_TO_R14 as P4G — Technical Validation, the three contracted operations `validateCandidate`, `listValidationRuns` and `listValidationIssues`; NOT_STARTED at the R13 closeout, §28.)*

## 28. R13 — PASS and closeout (2026-09-26, home PC)

Mission TB_R13_CLOSEOUT_MERGE_AND_P4G_TECHNICAL_VALIDATION_TO_R14. This section records the operator's R13 result and the R13 closeout before the P4F pull request. Sections 1–27 keep the state at their time.

### 28.1 Result (operator)

| Item | Recorded value |
|---|---|
| **R13** | **PASS** (2026-09-26) — no remediation |
| **P4F** | **VERIFIED_COMPLETE** — `importCandidate`, `listCaseCandidates`, `getCandidate`, `reviseCandidate`, `supersedeCandidate` (§1.1) and the candidate pages |
| Merge | **AUTHORIZED_FOR_MERGE** — pull request `feature/p4f-notice-candidate` → `main`, normal GitHub merge commit (no squash, no rebase, no force-push, no bypass of failed checks, the branch kept) after the exact closeout head and the pull request checks are green |
| **Active wire contract** | **TB-SCHEMA-API-v1.2.0**, unchanged by P4F; both release records pinned and never edited; the frozen historical reference TB-SCHEMA-API-v1.0.0 unchanged |
| PFC wire id | `PFC-YT-EMAIL-v1.1` (unchanged) |
| Accepted internal identifiers | `TB-PROMPT-TEMPLATE-v1` (the prompt template, accepted at R12) and `TB-CANDIDATE-ARTIFACT-v1` (the candidate artifact hash definition, §9) — implementation identifiers, not wire or PFC releases and no legal or policy approval |
| Decisions | ADR-0001, ADR-0002, ADR-0003, ADR-0004 and ADR-0005 — all ACCEPTED; P4F adds no ADR |
| `yarn test:transition-baseline` | A historical opt-in oracle that fails by design since the v1.1.0 edit; not a gate and not "fixed" |
| P4G | **NOT_STARTED** at this record — Technical Validation (`validateCandidate`, `listValidationRuns`, `listValidationIssues`), authorized by the same mission on `feature/p4g-technical-validation`, created from the exact post-merge `main` once its CI is green; it stops at review gate R14 |

### 28.2 Accepted R13 interpretations (persistent)

The §24 interpretations are accepted as follows (the mission's wording):

1. Candidate writes lock CaseRecord but do not mutate `rowVersion` or `contextRevision`.
2. Import does not require current context freshness.
3. PREPARATION PromptSnapshots may produce stored draft candidates.
4. Pending signature-slot count belongs to later technical validation.
5. `Envelope.from` exactly matches the selected `intendedFromEmail` where a selection exists.
6. The envelope parent exactly follows `PromptSnapshot.parentBindingId`.
7. PREVIOUSLY_SUPPLIED means recorded historical attachment posture only.
8. A named document hash must match the exact SourceReference revision.
9. The UI uses the prompt's source manifest; the API may accept another exact source revision only when it applies to the Case under the current source rules.
10. Supersession and candidate lineage are independent lifecycle dimensions.
11. Versions are per Case + TaskType across imports and revisions.
12. `getCandidate` is global by id as contracted; Case pages preserve Case isolation.
13. `artifactSha256` binds artifact content, not Case, prompt, task or lineage.

Permanent boundaries (they stay in force; `CLAUDE.md` carries them):

- Candidate = exact unsigned draft artifact.
- Candidate ≠ approval.
- Candidate ≠ legal conclusion.
- Candidate ≠ G1–G6 result.
- Candidate ≠ READY_FOR_SIGNER.
- HUMAN_PENDING only.
- Supersede ≠ retraction.
- No external action.

### 28.3 Heads

| Name | Commit |
|---|---|
| `P4F_ACCEPTED_CODE_HEAD` (named by the operator) | `ffadd40ddc2c9f2a2b60610af0d44cffbf4037f7` — the R13 submission, documentation on the code head `dcc4289` |
| R13 final CI | push run [36219605497](https://github.com/TuongChris/tb-notice-production-system/actions/runs/36219605497) on `ffadd40`, 2026-09-26T05:02:20Z–05:09:27Z, **success**: "Non-DB checks (cold install)" (job 108342233564) and "Database, seed and smoke (MySQL 8.4.11)" (job 108342233497) — `reference:check` and `contracts:check` OK, lint "Found 0 warnings and 0 errors.", Prettier clean, `yarn test` 1465 / 46 files, `yarn test:db` 494 / 13 files, both drift diffs empty, seed digest `0ee26dc3…b775`, `smoke:local` 57, `smoke:auth` 4, `smoke:directory` 14, `smoke:p3a` 24, `smoke:p3b` 36, `smoke:p4a` 50, `smoke:p4b` 64, `smoke:p4c` 62, `smoke:p4d` 87, `smoke:p4e` 84, `smoke:p4f` 92 |
| `P4F_R13_CLOSEOUT_HEAD` | the commit that adds this section (documentation); its CI run and the merge are recorded on `feature/p4g-technical-validation` |

### 28.4 Closeout checks

Pre-flight on `ffadd40`, after `git fetch origin`:

- branch `feature/p4f-notice-candidate` in sync with origin, worktree clean;
- `origin/main` = `79db09b13de4177d6649d14d703e9327796fd1cc`, unchanged since the branch was created;
- no P4F pull request (pull requests #1–#8, all merged); `gh` authenticated as the repository owner's account;
- run 36219605497 completed with success;
- `reference:check` and `contracts:check` OK.

The closeout is one documentation-only commit: this section, the header and status rows, the commit table, the §20 and §27 pointers, `CURRENT_STATE.md`, `CLAUDE.md`, and the UI sandbox's header comment (mission §C: it now names the prompt and candidate pages; a comment only, no behaviour change — the §25 deviation is resolved). No product code, test, contract source, generated artefact, release record, `docs/reference/**`, migration or lockfile changes.

Checks on the complete closeout tree before committing (2026-09-26T07:20:03Z–07:21:06Z):

- `reference:check` and `contracts:check` OK;
- `typecheck` OK;
- `lint` and `oxlint --deny-warnings --format default` report "Found 0 warnings and 0 errors." (310 files);
- `format:check` clean;
- `yarn test` 1465 passed in 46 files (unchanged).

`yarn test:db` was not rerun because no code changed (the sandbox script's change is a comment); it runs in CI on the closeout head.
