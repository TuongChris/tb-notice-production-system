# P4C — Correspondence capture and case bindings (home PC)

Mission TB_R9_POST_MERGE_CLOSEOUT_AND_P4C_CORRESPONDENCE_TO_R10 on `feature/p4c-correspondence`, created from the exact post-merge `main` head `d2b6f0030f9b7e53b612eaf1fa6dffffb98e4395` (the R9 remediation merged by pull request #5; `P4B_CASE_INTAKE.md` §26). Recorded 2026-09-25 (UTC) on the home PC, the primary development workstation (ADR-0003). The mission stops at review gate **R10**, submitted with the documentation commit that adds this record, on the code head `b9fcaf2`. Every later case phase is **not started**: no ProductionContext, PromptSnapshot, NoticeCandidate, ValidationRun workflow, CandidateAssessment, readiness gate, G1–G7, READY_FOR_SIGNER, signature, adoption, sending, reply, uploader contact, platform submission, retraction, counter-notification, YouTube fetch, Drive write, mailbox connection or other external action exists.

**R10 review: PENDING.** No P4C pull request is opened and nothing of P4C is merged (mission §44). The branch waits for the operator's R10 decision.

## Status by scope (not collapsed)

| Scope | Status | Basis |
|---|---|---|
| **R9_CLOSEOUT** | **RECORDED** — R9 final = PASS, P4B = VERIFIED_COMPLETE, ADR-0005 = ACCEPTED, TB-SCHEMA-API-v1.2.0 active; pull request #5 and `main` reconciled with `git` and authenticated `gh`; checkpoint `abad3ee` (documentation only, before any P4C code; push run 36129721720 success) | §2; `P4B_CASE_INTAKE.md` §26 |
| **P4C_FIRST_PC** | **PASS** — `yarn test` 1377 in 39 files, `yarn test:db` 380 in 10 files; regression sweep 21/21 on the code head `b9fcaf2` | §21, `evidence/p4c-first-pc-sweep.txt`; lint **0 warnings** |
| **P4C_CI** | **PASS** for the branch at creation `d2b6f00` (push run 36129072727), the R9 closeout checkpoint `abad3ee` (push run 36129721720), the API with the new compiled `smoke:p4c` `48ceebd` (push run 36133062817; `smoke:p4c` 62 checks), the UI `0038c56` (push run 36135445880) and the code head `b9fcaf2` (push run 36139089683), all success, both jobs. A commit cannot record its own run: the run of this documentation commit is reported with the R10 report | §21, `evidence/p4c-ci-run-36139089683.txt`; CI runs `yarn test`, `yarn test:db`, `smoke:local`, `smoke:auth`, `smoke:directory`, `smoke:p3a`, `smoke:p3b`, `smoke:p4a`, `smoke:p4b` and the new `smoke:p4c` |
| **P4C_BROWSER (Playwright MCP)** | **PASS** 29/29 (every item of mission §31); no finding | §19, `evidence/p4c-playwright-mcp-verification.txt` |
| **P4C_NEGATIVE_CONTROLS** | **PASS** 38/38 in the final run — all 21 control kinds of mission §36 plus one extra (run 1: 36/37, one defect of a control, not of a protection; §20) | Every disabled protection made its responsible tests fail; files restored byte-identically; working tree identical before and after; `tb_notice_test` empty afterwards (`evidence/p4c-negative-controls.txt`) |
| **P4C_CONTRACT** | **NO WIRE CHANGE** — TB-SCHEMA-API-v1.2.0 stays the active contract; no release record, generated artefact or frozen reference changed; no contract gap found | §24; `contracts:check` OK |
| **P4C_DATABASE** | **NO MIGRATION** — both tables and all their keys exist in the initial schema | §23; `db:verify`, both drift diffs |
| **R10 review** | **PENDING** — submitted with this record | — |
| **P4C_STATUS** | **IMPLEMENTED_AND_VERIFIED — SUBMITTED_FOR_R10** (the five contracted correspondence operations); not accepted until the operator decides | §3–§22 |
| **P4C_MERGE** | **NOT_MERGED** — no pull request (mission §44) | — |
| **P1_WINDOWS_BROWSER** | **NOT_RUN** (not reported) | Unchanged |
| **P0_SECOND_PC** / **P0_TWO_PC_ACCEPTANCE** / **P0_SINGLE_PC_BASELINE** / **P0_OVERALL** | **DEFERRED_BY_OPERATOR** / **NOT_COMPLETED** / **VERIFIED** / **NOT_COMPLETE** against the original two-PC contract | ADR-0003; unchanged by P4C |

`EXTERNAL_LEGAL_ACTIONS=0` · `EMAILS_SENT=0` · `REPLIES_SENT=0` · `MAILBOX_CONNECTIONS=0` · `MAILBOX_MUTATIONS=0` (nothing marked read, moved, labelled or deleted) · `SMTP_IMAP_CONNECTIONS=0` · `UPLOADER_CONTACTS=0` · `PLATFORM_SUBMISSIONS_RETRACTIONS_COUNTER_NOTICES=0` · `OUTBOUND_REQUESTS_BY_P4C_CODE=0` · `REAL_CORRESPONDENCE=0` · `REAL_CASE_DATA=0` · `YOUTUBE_FETCHES=0` · `DRIVE_WRITES=0` · `G1_DECISIONS=0` · `G7_CREATED=0` · `READINESS_COMPUTED=0` · `DEPLOYMENTS=0` · `REAL_TB_DATA_IN_GIT=0` · `REAL_ACCOUNTS_CREATED_BY_ENGINEER=0` · `RECORDS_WRITTEN_TO_OPERATOR_DB=0` · `SCHEMA_CHANGES=0` · `WIRE_CONTRACT_CHANGES=0` · `FROZEN_REFERENCE_CHANGES=0` · `ACCEPTED_RELEASE_RECORD_CHANGES=0` · `NEW_DEPENDENCIES=0`.

Persistent rules established by P4C (recorded in `CLAUDE.md`):

1. **Capture is not a send.** Capturing correspondence records one past communication exactly as supplied. It sends, replies, acknowledges, marks read, fetches, contacts or submits nothing, and it proves no transmission, receipt, authenticity or outcome (CAPTURED ≠ SENT_BY_THE_APP).
2. **OUTBOUND is not AS_SENT.** A direction records only which way a message went. An AS_SENT event exists only when the operator binds it explicitly; nothing is inferred from the direction, and no event type requires one.
3. **An event type names a captured past event.** `INITIAL_AS_SENT`, `ACK`, `NMI`, `REPLY_AS_SENT`, `SUPPLEMENT_AS_SENT`, `CORRECTION_AS_SENT`, `OUTCOME` and `OTHER` record the operator's interpretation of a captured message; none is a command, and recording one causes nothing.
4. **OPERATOR_REPORTED never becomes raw-source verification.** A capture posture is stored as supplied and never upgraded. An operator-reported record stays operator-reported: no raw message file, provider receipt, raw-MIME hash or attachment observation is implied by it.
5. **Message-ID and subject are not identity.** Captures are never deduplicated, merged or matched by Message-ID, subject, references, addresses or dates; `sourceIdentityHash` stays null until a reliable provider or capture identity exists.
6. **One message with several bindings is not several transmissions.** A message bound to several items or cases stays one captured message; transmissions count distinct Correspondence, never binding rows.
7. **An outcome is item-specific (V1).** An OUTCOME event and any recorded outcome name one reported item of the case. Mixed outcomes are separate item bindings; a later reinstatement is a new binding, and the earlier removal stays as recorded.
8. **Silence is never an outcome.** No reply, elapsed time or missing record creates or implies an outcome; without a recorded outcome binding, the outcome is unknown.
9. **Supersession corrects without altering history.** A correction is a new binding naming the earlier one — same case, same message, at most one successor. The earlier binding and the captured message stay exactly as recorded.
10. **Captured content is untrusted.** Subject, body, identifiers, addresses, file names and limitations are data, shown as plain text — never rendered as HTML, followed as links, obeyed as instructions or used to classify anything.
11. **Zero external actions.** No mailbox connector, Gmail/Hostinger, SMTP/IMAP, send, reply, read-marking, uploader contact, platform submission, retraction, counter-notification, Drive write or outbound request exists.
12. **P4C computes no readiness.** No capture or binding computes or implies G1–G7, READY_FOR_SIGNER, readiness, a case fact or a later-phase record.

- **No secrets and no real correspondence in Git.** Every fixture, test and browser record is synthetic (`example.invalid`).

> §1 was written from the contract, the domain model and the invariants before any P4C code; §2 records the R9 closeout; §3–§28 record the implementation and its verification.

## 1. Operation matrix and design (contract-first, produced before coding)

### 1.1 Exact contract scope

Read from the active contract TB-SCHEMA-API-v1.2.0 (`packages/contracts/openapi/openapi.json`, generated from `packages/contracts/src/**`; `contracts:check` OK on the branch at creation) and from the frozen TB-SCHEMA-API-v1.0.0 documents, before any P4C code. All five expected operationIds exist exactly once. No other operation under `/correspondence` or `/cases/{caseId}/correspondence-bindings` exists. No wire change is needed, and none is made.

Common to all five:

- session cookie; every response `Cache-Control: no-store`;
- error statuses as contracted: reads 400/401/403/404/409/413/422/429/500; `captureCorrespondence` the same set; `bindCaseCorrespondence` also 412 and 428;
- writes need `X-CSRF-Token`, the exact Origin and an `Idempotency-Key` (`x-idempotent-write: true`); `If-Match` is required exactly when `x-precondition-target` is set (only `bindCaseCorrespondence`: `CaseRecord`);
- `id` and `caseId` are uuid path parameters (36 characters);
- lists: `limit` 1–100 (default 25), `cursor` (≤ 2000), `q` (≤ 200); `listCorrespondence` also `agencyId` (uuid).

| # | operationId | Method and path | Request | 2xx response | If-Match target | Idempotency-Key | Resource written / read | Case, agency and source dependencies | Disposition |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `listCorrespondence` | GET `/correspondence` | query `limit`, `cursor`, `q`, `agencyId` | 200 `ListCorrespondenceResponse` (`CorrespondencePage` of `CorrespondenceSummary` — no body, no manifest) | — | — | reads `correspondence` | optional exact agency filter | IMPLEMENT |
| 2 | `captureCorrespondence` | POST `/correspondence` | `CreateCorrespondence` {agencyId, mailboxAddress, direction, subject, captureMode; optional messageId, inReplyTo, references, bodyRole, bodyText, rawSourceId, attachmentsManifest, headerDateRaw, occurredAt, timestampPrecision, fromAddress, toAddress, replyToAddress, limitations} | 201 `CaptureCorrespondenceResponse` (`Correspondence`; no row version, no ETag) | — (none contracted) | required | writes one `correspondence` row + one audit event | agency exists and is not archived; `rawSourceId` and each attachment `sourceId` an existing SourceReference that applies to that agency; no case | IMPLEMENT |
| 3 | `getCorrespondence` | GET `/correspondence/{id}` | — | 200 `GetCorrespondenceResponse` (`Correspondence`; no ETag) | — | — | reads one `correspondence` row | — | IMPLEMENT |
| 4 | `bindCaseCorrespondence` | POST `/cases/{caseId}/correspondence-bindings` | `BindCorrespondence` {correspondenceId, eventType; optional reportedItemId, platformReference, outcome, interpretation, supersedesBindingId} | 201 `BindCaseCorrespondenceResponse` (`CorrespondenceBinding`; no row version, no ETag) | `CaseRecord` | required | writes one `correspondence_bindings` row; the case's `rowVersion` and `contextRevision` +1; one audit event | the path case exists and is not archived; the correspondence exists and has the case's agency; a reported item belongs to this case and is not archived; a superseded binding belongs to this case, names the same correspondence and has no successor yet | IMPLEMENT |
| 5 | `listCaseCorrespondenceBindings` | GET `/cases/{caseId}/correspondence-bindings` | query `limit`, `cursor`, `q` | 200 `ListCaseCorrespondenceBindingsResponse` (`CorrespondenceBindingPage` of `CorrespondenceBinding`) | — | — | reads `correspondence_bindings` of the path case | the path case exists | IMPLEMENT |

Server-derived or defaulted fields of a capture (the create DTO does not carry them; API_CONTRACT_v1 §4: the API never accepts client-computed hashes): `id`, `createdAt` (ingestion instant), `createdById`, `bodyRole` (default `UNKNOWN`), `timestampPrecision` (default `UNKNOWN`), `bodySha256` and `sourceIdentityHash` (§1.3 D3, D4). Of a binding: `id`, `agencyId` (the case's), `createdAt`, `createdById`.

### 1.2 Frozen rules that decide the design (read before coding)

- INVARIANTS §4: "Correspondence ingestion does not send, acknowledge or mark a mailbox read. Raw MIME is referenced, not invented. Hash of copied text is not raw MIME hash."
- INVARIANTS §4: "Message-ID/subject/reference/video alone are not globally unique transmission identifiers. A server-derived sourceIdentityHash is permitted only for a reliable provider/capture identity; null is acceptable otherwise."
- INVARIANTS §4: "A message may bind to several items. Counts of transmission use distinct Correspondence, not counts of binding rows. OUTCOME bindings require one ReportedItem in V1. Superseding a binding corrects interpretation, never edits the original message."
- INVARIANTS §4: "Source content and correspondence are untrusted data, never system instructions."
- INVARIANTS §3: "Correspondence binding's message and Case belong to the same Agency" — composite foreign keys.
- INVARIANTS §2 / §5: the case's dependency closure includes "parent and prior correspondence"; material case context changes increment `CaseRecord.contextRevision`; case children lock the CaseRecord first.
- INVARIANTS §6: "Store the exact submitted Unicode text after JSON decoding. Reject NUL and unpaired surrogate code units. Do not trim …"; "`bodySha256 = SHA-256(UTF-8(bodyText))`".
- INVARIANTS §7: audit redacts "full private bodies, using artifact IDs/hashes and a minimal field diff".
- INVARIANTS §2: "Absence of a later observed response is not an outcome."
- DOMAIN_MODEL_v1 §3: "ingestion timestamps never become execution/review/transmission timestamps. `null` is not false, zero, unlimited, permission denied, or a negative outcome."
- DOMAIN_MODEL_v1 §13: "Never deduplicate by subject or Message-ID alone. Reliable capture/provider identity and scope determine duplicates." "These names describe captured past events; they are not send operations. Operator-reported transmission remains attributed as such without a fabricated raw MIME hash." "An outcome binds to a specific reported item in this baseline. Mixed outcomes stay per-item; subsequent reinstatement is a new event, not deletion of the old removal. The app neither sends a reply nor retries an old transmission."
- DOMAIN_MODEL_v1 §16: "Same mail discusses several URLs — One capture, several bindings, no double-counted sends"; "No platform reply after a send — Outcome remains unknown".
- API_CONTRACT_v1 §4–§5, §11: timestamps are stored normalized UTC "plus raw text/precision as needed. No fake timestamp inferred from ingestion"; lists are `(createdAt DESC, id DESC)`; "Case timelines may display occurredAt but retain capture order separately"; list endpoints use summary DTOs, full bodies only through the detail read.
- DATABASE_SCHEMA_v1: `correspondence` and `correspondence_bindings` exist in the applied initial migration (no row version, no archive flag); unique keys `(agency_id, mailbox_address, source_identity_hash)`, `(id, agency_id)`, `(id, case_id)` and `supersedes_binding_id`; composite foreign keys `(case_id, agency_id)` → cases, `(correspondence_id, agency_id)` → correspondence, `(reported_item_id, case_id)` → reported_items; `supersedes_binding_id` → correspondence_bindings (not composite).

### 1.3 Design decisions (service level)

- **D1 Capture is not a send.** A capture stores one recorded communication. It sends, acknowledges, marks read, fetches, contacts or submits nothing: the module has no network, mail or Drive client. No capture creates a binding, a case fact, an outcome or any case change. `CAPTURED ≠ SENT_BY_THE_APP`.
- **D2 Stored exactly as supplied.** Every contracted field is stored as received after JSON decoding. Text (subject, body, identifiers, addresses, limitations) is not trimmed, case-folded or normalized. `references` and `attachmentsManifest` keep their order and exact items. Nothing absent is invented: no header, address, Message-ID or date is derived from the subject or body. Unpaired surrogates are refused (the existing rule). A NUL in `bodyText` is refused (INVARIANTS §6, the digest-bearing field).
- **D3 `bodySha256`.** `bodySha256 = SHA-256(UTF-8(bodyText))` when body text is recorded, otherwise null (INVARIANTS §6). It is the hash of the recorded text only — whatever the capture mode — and is never labelled or used as a raw-MIME hash. No raw-MIME hash is computed: the app never has the raw bytes.
- **D4 `sourceIdentityHash` stays null.** The contracted capture input carries no reliable provider or capture identity: there is no mailbox connector and no provider message identity field. Message-ID, subject, references, addresses, timestamps and video URLs are not identities. So the server derives no `sourceIdentityHash`, and no capture is deduplicated or merged: two captures with the same Message-ID or subject are two records. The unique key `(agency_id, mailbox_address, source_identity_hash)` stays the backstop for a future reliable identity (NULLs never collide).
- **D5 Capture posture is recorded, never upgraded, and not contradicted.** `captureMode` (`RAW_SOURCE`, `COPIED_FULL_TEXT`, `EXCERPT`, `OPERATOR_REPORTED`) and `bodyRole` are stored as supplied (default `UNKNOWN`). Only these combinations are refused, each derived from a frozen rule and none making a record look stronger (422 `CAPTURE_POSTURE_UNSUPPORTED` with the field and a reason):
  - `RAW_SOURCE` without a `rawSourceId` → `RAW_SOURCE_NOT_REFERENCED` ("Raw MIME is referenced, not invented");
  - an attachment observation `OBSERVED_IN_RAW_MIME` while the capture references no raw source → `RAW_MIME_NOT_REFERENCED` (same rule);
  - an `EXCERPT` capture with body role `FULL_MESSAGE` → `EXCERPT_NOT_FULL_MESSAGE` (an excerpt is not the full message).

  Nothing else is required: no body text, raw source, date or address is demanded for any mode, and a raw source pointer with a weaker mode is kept as recorded.
- **D6 Raw source and attachment sources.** `rawSourceId` and each attachment observation's `sourceId` must name an existing SourceReference (422 `REFERENCE_NOT_FOUND`) that applies to the correspondence's agency under the existing rule set (`modules/sources/source-scope.ts`, target Agency): the agency's own source or an agency-less source naming the agency (422 `CROSS_AGENCY_REFERENCE` / `SOURCE_SCOPE_UNRESOLVED`). A case-scoped source is refused (`CASE_SCOPED_SOURCE`): a capture is agency-level and can be bound into several cases, so one case's material must not travel with it. The exact revision cited stays pinned. The pointer proves nothing: not a review, DOCUMENT_REVIEWED, authenticity, transmission, receipt or the presence of an attachment. Nothing is fetched.
- **D7 Attachment observations** are stored exactly as supplied (`fileName`, `state` `OBSERVED_IN_RAW_MIME` / `COPIED_TEXT_ALLEGATION` / `UNKNOWN`, optional `sha256`, optional `sourceId`). A state is never changed (an allegation in copied text never becomes an observation), and no attachment bytes or SourceReference are created.
- **D8 Dates.** `createdAt` is the ingestion instant only — never a sent, received or occurred time. `headerDateRaw` is raw text and is never parsed. `occurredAt` is stored only when supplied, under the R7 storability rule (422 before any claim), and is never derived from `headerDateRaw` or `createdAt`. A missing `occurredAt` stays null. `timestampPrecision` is stored as supplied (1–40 characters; no vocabulary is defined, so none is imposed), default `UNKNOWN`.
- **D9 Agency.** The agency must exist (422 `REFERENCE_NOT_FOUND`) and not be archived (409 `RECORD_STATE_CONFLICT`), like a new SourceReference or Case: an archived record takes no new records under it. A capture is recorded by restoring the agency first. A capture changes no agency or case version. It does make the agency "referenced" for the existing delete-safety check (`correspondence.agency_id`).
- **D10 Binding = explicit interpretation.** A binding records the operator's explicit interpretation of one captured message for one case: an event type (`INITIAL_AS_SENT`, `ACK`, `NMI`, `REPLY_AS_SENT`, `SUPPLEMENT_AS_SENT`, `CORRECTION_AS_SENT`, `OUTCOME`, `OTHER`), optionally a reported item, a platform reference, an outcome and an interpretation text. The event types name captured past events; none is a command.
  - Nothing is inferred: not from direction, subject, body keywords, Message-ID, sender or timing.
  - There is no NMI or outcome classifier.
  - Direction and event type are independent: no AS_SENT is created because a message is OUTBOUND, and no event type requires a direction. The contract and domain are silent on a direction rule, so none is invented.
- **D11 Binding checks.**
  - The path case must exist (404) and match the If-Match (428/412). It must not be archived (409).
  - The correspondence must exist (422 `REFERENCE_NOT_FOUND`) and belong to the case's agency (422 `CROSS_AGENCY_REFERENCE`; the composite foreign key is the backstop).
  - A reported item must exist (422), belong to this case (422 `CROSS_CASE_REFERENCE`; composite foreign key) and not be archived (409), like a new mapping or fact.
- **D12 Outcomes are item-specific.**
  - `eventType` `OUTCOME` requires a `reportedItemId` (INVARIANTS §4).
  - Any `outcome` value requires a `reportedItemId` too (DOMAIN_MODEL_v1 §13: "An outcome binds to a specific reported item"), so no case-wide outcome can be recorded through another event type.
  - Both refusals are 422 `OUTCOME_ITEM_REQUIRED` with the field `reportedItemId` and a reason.
  - An OUTCOME binding may leave `outcome` null (not classified). The domain is silent on restricting outcome values to the OUTCOME event type, so no such rule is added.
  - Mixed outcomes are separate item-scoped bindings. A later reinstatement is a new binding; the earlier removal stays unchanged.
  - Silence, elapsed time or a missing reply never creates or implies an outcome.
- **D13 Supersession.** `supersedesBindingId` records a corrected interpretation. The superseded binding must:
  - exist (422 `REFERENCE_NOT_FOUND`);
  - belong to this case (422 `CROSS_CASE_REFERENCE` — its foreign key is not composite, so the service rule is the protection);
  - name the same correspondence (422 `REVISION_SCOPE_CHANGE`: a correction of interpretation never re-points to another message);
  - have no successor yet (409 `BINDING_ALREADY_SUPERSEDED`; the unique `supersedes_binding_id` key is the backstop).

  The successor may change the event type, item, outcome, platform reference and interpretation. Nothing is edited or deleted: the earlier binding and the correspondence stay exactly as recorded. A cycle cannot form, because a binding can only name an existing, earlier binding and is never edited. All bindings of one case are serialized by the case lock.
- **D14 One message, several bindings.** A captured message may be bound several times — to several items, cases of the same agency or event types. Each binding is explicit and case-specific. There is no duplicate rule (the contract and domain are silent). Transmissions are counted by distinct Correspondence, never by binding rows. Nothing of a binding in one case appears in or transfers to another case.
- **D15 Case context.** A binding moves the case's `rowVersion` and `contextRevision` (correspondence is part of the case's dependency closure) and makes the case history-bearing: the P4A route correction already counts correspondence bindings. Reads and refused writes change nothing. A capture changes no case.
- **D16 Lists.**
  - `listCorrespondence`: capture order `(createdAt DESC, id DESC)`; `agencyId` exact; `q` = the exact id, or a literal, case- and accent-insensitive substring of the subject, mailbox, Message-ID, sender or recipient address (discovery only — nothing is merged or matched as an identity).
  - `listCaseCorrespondenceBindings`: every binding of the case, superseded ones included (the history; there is no other read of a binding), newest recorded first; `q` = the exact id of a binding, its correspondence, reported item or superseded binding, or a literal, case- and accent-insensitive substring of the platform reference.
  - Occurred time is shown beside the recorded order, never used to reorder it.
- **D17 Lock order.**
  - Capture: Agency (share) → SourceReference (share).
  - Binding: CaseRecord (update) → ReportedItem (share).
  - Correspondence rows and earlier bindings are immutable and are only read.
- **D18 Audit.** One event per write, in the same transaction; a failing audit rolls everything back. The event keeps identifiers, modes, states, the body hash and lengths only. The body, subject, Message-ID, addresses, raw header date, limitations and interpretation are recorded as their length. Attachment file names are not copied (only their count and states), and cited source ids go into `sourceIds`.
- **D19 Error codes.**
  - New P4C implementation codes, in the free-string `code` field with the contracted statuses (R6 interpretation 10): `CAPTURE_POSTURE_UNSUPPORTED` (422), `OUTCOME_ITEM_REQUIRED` (422), `BINDING_ALREADY_SUPERSEDED` (409).
  - Reused: `REFERENCE_NOT_FOUND`, `CROSS_AGENCY_REFERENCE`, `CROSS_CASE_REFERENCE` (frozen stable), `SOURCE_SCOPE_UNRESOLVED`, `RECORD_STATE_CONFLICT`, `REVISION_SCOPE_CHANGE`, `VALIDATION_FAILED`, `PRECONDITION_REQUIRED`, `RECORD_VERSION_CONFLICT`, the idempotency codes.
- **D20 No migration, no wire change.** Both tables and all their keys exist in the applied initial migration. `records.ts` already lists `correspondence.agency_id`, `correspondence_bindings.case_id` and `correspondence_bindings.reported_item_id` as direct references, and `correspondence.references` / `attachments_manifest` as snapshot JSON columns.

## 2. R9 post-merge reconciliation and branch (mission §0–§2)

The R9 closeout is recorded in `P4B_CASE_INTAKE.md` §26, verified with `git` and the authenticated `gh` before any P4C code:

- **R9 final = PASS** (operator, 2026-09-25): P4B = VERIFIED_COMPLETE; the remediation was accepted; ADR-0005 = ACCEPTED; the active wire contract is TB-SCHEMA-API-v1.2.0 (frozen historical reference TB-SCHEMA-API-v1.0.0; PFC wire id `PFC-YT-EMAIL-v1.1`).
- **Pull request #5** (`feature/r9-fact-support-readback` → `main`, head `a31ad90`) was merged by the repository owner's account at 2026-09-25T10:58:02Z with a merge commit: `d2b6f00`, parents `eb83b19` and `a31ad90`. Its tree is identical to `a31ad90`.
- **Post-merge `main` CI:** run 36126817873 success, both jobs.
- **Branch:** `feature/p4c-correspondence` was created from the exact `origin/main` `d2b6f00` — not from `feature/r9-fact-support-readback` or `feature/p4b-case-intake` — and pushed with upstream. Branch-creation run 36129072727 (2026-09-25T11:22:58Z–11:28:13Z): success, both jobs.
- **Checkpoint:** `abad3ee` "docs: R9 closeout — R9 final PASS, ADR-0005 accepted, TB-SCHEMA-API-v1.2.0 active; P4C branch opened". It is documentation only: `CLAUDE.md`, `docs/CURRENT_STATE.md`, the v1.2.0 README, ADR-0005 and `P4B_CASE_INTAKE.md` §26. Push run 36129721720 (11:30:05Z–11:35:21Z): success, both jobs. This is the run that the P4B record says is reported here.

Nothing was amended, rebased, force-pushed, tagged or released. Every earlier phase branch is unchanged.

## 3. Implementation (commits)

| Commit | Content |
|---|---|
| `abad3ee` | R9 closeout checkpoint (documentation only; before any P4C code; §2) |
| `fa4f98e` | API: the five operations — `modules/correspondence/` (controller, module, capture service, binding service, rules, views), the three P4C error codes (`api-error.ts`) and the audit redaction of private correspondence text (`directory/changes.ts`). Tests: `tests/db/p4c-http.test.ts` and `tests/api/correspondence-rules.test.ts`. The existing route inventories, the unrouted-phase checks and the general, P3A, P3B, P4A and P4B smokes now route correspondence and name production/prompts as the first unrouted phase. The DB test cleanup includes the two correspondence tables |
| `9514769` | CI: the compiled `smoke:p4c` flow (CI only; `package.json`, `.github/workflows/ci.yml`, `scripts/local/p4c-smoke.ts`) |
| `48ceebd` | `ui:sandbox` guards and cleans the correspondence tables |
| `0038c56` | UI: the correspondence registry, capture form and captured-record page; the case page's correspondence history and the binding page. Tests: `tests/web/p4c.test.tsx`, plus fake correspondence endpoints in `tests/web/support.tsx` |
| `b9fcaf2` | Web test: the binding form preselects nothing for a subject asking for more information (makes the §36 control "auto-NMI from subject/body" decidable in the UI) |
| R10 submission commit | This record, the evidence, `CLAUDE.md`, `CURRENT_STATE.md` (documentation only) |

Nothing was merged, tagged or released, and no history was rewritten. No dependency was added: the lockfile is unchanged.

## 4. Capture semantics

`POST /correspondence` (`captureCorrespondence`) takes an Idempotency-Key and no If-Match: the contract declares no precondition target. It stores one immutable row and one audit event and returns 201 with no ETag. §1.3 D1–D9 apply:

- **Stored exactly as supplied** after JSON decoding: nothing is trimmed, case-folded or newline- or Unicode-normalized, and nothing absent is invented. A NUL in `bodyText` and an unpaired surrogate are refused (422 before any claim).
- **Agency:** it must exist (422 `REFERENCE_NOT_FOUND`) and must not be archived (409 `RECORD_STATE_CONFLICT`).
- **Case independence:** a capture creates no binding, no case fact, no outcome and no case change. Capture ≠ send; the module has no network, mail, Drive or process client (a unit test scans its imports and the API package's dependencies).
- **Reads:**
  - `GET /correspondence/{id}` (`getCorrespondence`) returns the record exactly as stored; an unknown id is 404.
  - `GET /correspondence` (`listCorrespondence`) returns the summary DTO (no body, no attachment observations) in capture order, `(createdAt DESC, id DESC)`.
  - `agencyId` is an exact filter. `q` is the exact id, or a literal, case- and accent-insensitive substring of the subject, mailbox, Message-ID, sender or recipient. This is discovery search only: nothing is merged or matched as an identity.
  - Cursors are bound to their filters.
  - Reads write nothing: no read-marking and no version move.

## 5. Capture mode and body role

`captureMode` (`RAW_SOURCE`, `COPIED_FULL_TEXT`, `EXCERPT`, `OPERATOR_REPORTED`) and `bodyRole` (`FULL_MESSAGE`, `AUTHORED_BODY`, `QUOTED_HISTORY`, `EXCERPT`, `UNKNOWN`; default `UNKNOWN`) are stored as supplied and never upgraded.

Only three combinations are refused, each because the record would contradict itself (422 `CAPTURE_POSTURE_UNSUPPORTED`, with the field and a reason):

- `RAW_SOURCE` without a `rawSourceId` (`RAW_SOURCE_NOT_REFERENCED`);
- an attachment `OBSERVED_IN_RAW_MIME` without a raw source (`RAW_MIME_NOT_REFERENCED`);
- an `EXCERPT` capture with `FULL_MESSAGE` (`EXCERPT_NOT_FULL_MESSAGE`).

Nothing else is demanded to make a record look stronger: no body, raw source, date or address is required for any mode. A raw source pointer given with a weaker mode is kept as recorded.

The UI shows the posture verbatim — "Raw source captured", "Copied full text", "Excerpt", "Operator reported" — each with its meaning; it never says "verified", "authentic" or "confirmed".

## 6. Raw source, hashes and no deduplication

- **Cited sources:** `rawSourceId` and each attachment `sourceId` must name an existing SourceReference (422 `REFERENCE_NOT_FOUND`) that applies to the capture's agency under the one source-scope rule set (target Agency). Refusals, each 422 on the field (`rawSourceId` or `attachmentsManifest.<i>.sourceId`): another agency's source → `CROSS_AGENCY_REFERENCE`; an agency-less source not naming the agency → `SOURCE_SCOPE_UNRESOLVED` with reason `NOT_SCOPED_TO_AGENCY`; a case-scoped source → `SOURCE_SCOPE_UNRESOLVED` with reason `CASE_SCOPED_SOURCE`.
- **What a pointer is:** the exact revision cited stays pinned. A pointer proves nothing, is not fetched and creates no SourceReference.
- **`bodySha256`** = SHA-256(UTF-8(`bodyText`)), or null without a body. It covers the recorded text only, whatever the capture mode, and is never presented as a raw-MIME hash. The UI labels it "SHA-256 of the recorded body text" and explains that it "is not a hash of a raw message (MIME) file, and it does not show that the text is complete or authentic". No raw-MIME hash is computed: the app never has the raw bytes.
- **`sourceIdentityHash`** stays null (D4): the contracted input carries no reliable provider or capture identity.
- **No deduplication:** two captures with identical Message-ID, subject, addresses and dates are two records, in one agency and across agencies. The unique key `(agency_id, mailbox_address, source_identity_hash)` stays the backstop for a future reliable identity (NULLs never collide).

## 7. Timestamps

- **`createdAt`** is the ingestion instant (the app clock), shown as "Recorded in TB". It is never a sent, received or occurred time.
- **`occurredAt`** is stored only when supplied, under the shared R7 storability rule: `storability.ts`, 422 `VALIDATION_FAILED` before any claim for a leap second, sub-millisecond digits or a value out of range, written as the exact instant. It is never derived from `headerDateRaw` or `createdAt`; a missing one stays null and shows as "Not recorded".
- **`headerDateRaw`** is raw text, never parsed or checked as a date, shown as "Raw header date (text, not parsed)".
- **`timestampPrecision`** is stored as supplied (1–40 characters; no vocabulary is defined, so none is imposed), default `UNKNOWN`.
- **Case history:** it shows "Occurred" beside "Recorded in TB" for every binding and keeps the recorded order; occurrence never reorders it.

## 8. Attachment observations

`attachmentsManifest` is stored exactly as supplied, in order: `fileName`, `state` (`OBSERVED_IN_RAW_MIME`, `COPIED_TEXT_ALLEGATION`, `UNKNOWN`), an optional `sha256` and an optional `sourceId`.

- A state is never changed: an allegation in copied text never becomes an observation.
- `OBSERVED_IN_RAW_MIME` needs the capture's raw source (§5).
- A `sourceId` follows §6.
- No attachment bytes, hashes or SourceReferences are created.

The audit keeps only the count and the states, not the file names. The UI labels the states "Recorded as observed in the raw message", "Mentioned in copied text only" and "Unknown", and shows every file name as plain text.

## 9. Bindings

`POST /cases/{caseId}/correspondence-bindings` (`bindCaseCorrespondence`) takes the case's If-Match (target `CaseRecord`) and an Idempotency-Key. It records one explicit, append-only interpretation of one captured message for one case and returns 201 with no ETag. §1.3 D10–D17 apply.

Refusals:

- the path case: 404 when unknown; 428 without If-Match, 412 when stale; 409 when archived;
- the correspondence: 422 `REFERENCE_NOT_FOUND` when unknown; 422 `CROSS_AGENCY_REFERENCE` when it belongs to another agency (the composite foreign key is the backstop);
- a reported item: 422 when unknown; 422 `CROSS_CASE_REFERENCE` when it belongs to another case (composite key); 409 when archived.

What is stored:

- the event type, reported item, platform reference, outcome and interpretation, exactly as supplied;
- the agency, taken from the case.

The case's `rowVersion` and `contextRevision` each move once (§16).

`GET /cases/{caseId}/correspondence-bindings` (`listCaseCorrespondenceBindings`) returns every binding of the case, superseded ones included (the history), newest recorded first.

- `q` is the exact id of a binding, its message, its item or the binding it corrects, or a literal, case- and accent-insensitive substring of the platform reference.
- An unknown case is 404, and the list writes nothing.

There is no update, delete, send, reply, read-marking or contact route; a test asserts that each one is unrouted.

## 10. AS_SENT

`INITIAL_AS_SENT`, `REPLY_AS_SENT`, `SUPPLEMENT_AS_SENT` and `CORRECTION_AS_SENT` are recorded only when the operator chooses them.

- An outbound capture creates no binding, and an outbound message bound as `OTHER` stays `OTHER`.
- Every event type is accepted for inbound and outbound messages alike: there is no direction rule (D10).
- Recording an AS_SENT binding sends nothing and creates nothing else. The HTTP suite spies on `fetch` and on every socket connection and finds none beyond loopback. The browser pass saw only same-origin requests.
- In the UI, the binding form preselects no event, whatever the message's direction or subject. When an "as sent" event is chosen, and in the history, it shows: "Recorded as a past transmission. Capturing this record did not send anything."
- For an `OPERATOR_REPORTED` message, the UI adds the limited posture ("…no raw message file, provider receipt or attachment observation is implied by it").
- There is no Send button, and never "Sent by Takedown Bureau application".

## 11. NMI, ACK and the other inbound events

`NMI`, `ACK` and `OTHER` are explicit interpretations like every other event type. There is no classifier:

- a subject "Need more info — NMI" creates no NMI binding;
- a body "Request Resolved … Outcome: REMOVED" creates no OUTCOME;
- an "ACK:" subject creates no ACK;
- the operator may record any interpretation, including one the text does not suggest.

The UI labels the events "Initial notice (recorded as sent)", "Acknowledgement", "Request for more information (NMI)", "Reply (recorded as sent)", "Supplement (recorded as sent)", "Correction notice (recorded as sent)", "Outcome" and "Other".

## 12. Outcomes

- **Item required:** an `OUTCOME` event and any `outcome` value (`REMOVED`, `REINSTATED`, `REJECTED`, `RETRACTED`, `OTHER`) name one reported item of the case. Otherwise the answer is 422 `OUTCOME_ITEM_REQUIRED`, on the field `reportedItemId` with a reason, checked before any claim (INVARIANTS §4; DOMAIN_MODEL_v1 §13).
- **Unclassified OUTCOME:** an OUTCOME binding may leave `outcome` null.
- **Mixed and later outcomes:** mixed outcomes stay item-specific, and item A's outcome never appears on item B. A later reinstatement is a new binding; the earlier removal stays unchanged.
- **No outcome from silence:** thirty days of silence after an AS_SENT binding (the app clock advanced) leave exactly the bindings the operator recorded.
- **UI wording:** "Recorded outcome" and never "Current platform status". A removal followed by a reinstatement shows both, and a case without outcome bindings states: "…without a recorded outcome binding, the outcome is unknown."

## 13. Supersession

`supersedesBindingId` records a corrected interpretation. The earlier binding must:

- exist (422);
- belong to this case (422 `CROSS_CASE_REFERENCE`; its foreign key is not composite, so this service rule is the protection);
- name the same message (422 `REVISION_SCOPE_CHANGE`);
- have no successor yet (409 `BINDING_ALREADY_SUPERSEDED`, naming the successor; the unique `supersedes_binding_id` key is the backstop).

The correction may change the event type, item, outcome, platform reference and interpretation. Nothing is edited or deleted: the earlier binding and the message stay byte-identical.

- **Concurrency:** competing corrections of one binding keep exactly one successor, because every binding write of a case holds the case lock.
- **Other cases:** a supersession in case A leaves case B's bindings, version and context revision untouched.
- **UI:** the history shows both bindings, "Corrects an earlier interpretation" / "Corrected by a later interpretation". The correction form keeps the message and is prefilled from the earlier binding. A corrected binding offers no further correction ("A binding history does not fork…").

## 14. One message, several items

One message may be bound several times: to several items, to several cases of its agency, or with several event types. Each binding is explicit and case-specific, and there is no duplicate-binding rule (the contract and the domain are silent).

- Binding one message to three items and to two cases leaves it one Correspondence row.
- Transmissions are counted by distinct Correspondence.
- The case page shows, for example, "3 bindings of 2 captured messages. Bindings are interpretations, not transmissions: one message bound several times is still one message."

## 15. Case and agency isolation

- **Case isolation:** a case lists only its own bindings, and another case's binding never appears in it.
- **References through a binding:** another case's reported item and another case's binding are 422 `CROSS_CASE_REFERENCE`. Another agency's message is 422 `CROSS_AGENCY_REFERENCE`, and nothing is written.
- **Captures across agencies:** a capture is agency-level. The same Message-ID in two agencies is two captures, each bindable only into its own agency's cases.
- **UI:** the binding form offers only this case's reported items and only messages captured for the case's agency, even when the page address names another agency's message; a notice then says it is not offered. Case pages are rebuilt per case id.

## 16. contextRevision

- A binding moves its case's `rowVersion` and `contextRevision` once each: correspondence is part of the case's dependency closure (INVARIANTS §2/§5).
- A capture changes no case.
- Reads, refused writes and replays change nothing.
- A binding makes the case history-bearing: a later route correction is 409 `BINDING_CORRECTION_REQUIRES_RECONCILIATION`, naming correspondence. The P4A rule already counted correspondence bindings.

## 17. Shared write layer: idempotency, ETag, audit

Both writes go through `WriteExecutor`: contract body parse (422) → Idempotency-Key (400) → If-Match for the binding (428/412) → claim → one READ COMMITTED transaction → audit → completion.

- **Lock order:** Agency (share) → SourceReference (share) for a capture; CaseRecord (update) → ReportedItem (share) for a binding.
- **Idempotency:**
  - an exact replay returns the stored result once — no second row, audit or version move;
  - the same key with another body is 409 `IDEMPOTENCY_CONFLICT`;
  - a refused request is never stored;
  - concurrent captures with one key record one message, and concurrent binds with one case ETag record one binding.
- **Audit:**
  - a failing audit insert rolls back a capture and a binding completely: no row, no case version move, no idempotency record;
  - `CORRESPONDENCE_CAPTURED` keeps identifiers, modes, states, the body hash and lengths. The body, subject, Message-ID, In-Reply-To, mailbox and message addresses, raw header date and limitations are recorded only as their length (`{redacted, codePoints}`). Attachment file names are not copied, and cited source ids go into `sourceIds`;
  - `CORRESPONDENCE_BOUND` keeps the binding's identifiers and the case versions before and after; the interpretation is recorded as its length.
- **No row version:** the records carry no row version and no ETag (append-only).

## 18. UI

- **Correspondence registry** (`/correspondence`, protected navigation entry "Correspondence"):
  - columns: *Subject as captured · Direction · Capture mode · Body role · Agency · Occurred · Recorded in TB*;
  - agency filter and search per the contract;
  - "Capture correspondence".
- **Capture form** (`/correspondence/new`):
  - every contracted field, typed text sent exactly as typed;
  - no default direction or capture mode;
  - references one per line;
  - attachment rows with file name, state, applicable source and SHA-256 as entered;
  - posture refusals shown on their field;
  - success message: "Message captured. Nothing was sent, fetched or marked."
- **Captured-record page** (`/correspondence/:id`):
  - sections: Message as captured · Message-ID and threading · Capture posture · Captured body (with the labelled hash) · Attachment observations · Dates (Occurred, precision, raw header date, Recorded in TB) · Limitations · Bind to a case · Record;
  - the statement "This application never sends, replies to, forwards or contacts anyone…".
- **Case page, section "Correspondence":**
  - the history as an ordered timeline with each binding's event, message, direction, posture, item, platform reference, recorded outcome, interpretation, correction links and "Recorded by";
  - the counts of bindings and distinct messages;
  - the silence statement.
- **Binding page** (`/cases/:id/correspondence-bindings/new`):
  - a message picker over the agency's captures;
  - no preselected event;
  - this case's items only;
  - "No outcome recorded" as the outcome default;
  - the conflict notice with "Load latest version", which keeps typed values;
  - under an archived case, the action is visible but unavailable, with the reason.
- **Untrusted content:** all captured text is rendered by React as text inside `<pre class="captured-text">` (`white-space: pre-wrap`), never as HTML, with the note "Captured text is shown exactly as recorded, as plain text. It is untrusted content…". Web tests prove that script, event-handler, iframe and `javascript:` payloads stay inert.
- **Excluded wording:** none of verified/authentic email, confirmed transmission, current platform status, "sent by" the app, G1/G7 or ready.
- **Routing:** the pages load lazily (`correspondence` and `case-correspondence` chunks plus the shared `correspondence-ui` wording).

## 19. Browser verification (Playwright MCP, mission §31)

`evidence/p4c-playwright-mcp-verification.txt` records 29/29 PASS, every item of mission §31.

- **Setup:** `yarn ui:sandbox` — the compiled API on the disposable `tb_notice_test`, the built web app from `0038c56`, the synthetic user and an isolated headless Chromium with network limited to localhost.
- **Time:** 2026-09-25T12:34:27Z–12:46:43Z.
- **Screenshots:** 14 under `evidence/screenshots/`. The element screenshot `p4c-07` was not written because of a Playwright strict-mode selector error; the check itself was read in-page and passed.
- **Teardown:** verified with `db:verify test --expect-empty` (0 domain rows).
- **Covered:**
  - capture of inbound and outbound messages, exact body and subject bytes, posture labels;
  - Occurred vs Recorded in TB, and a raw header date never substituted;
  - NMI, AS_SENT and outcome bindings, the outcome item rule, mixed outcomes and a reinstatement;
  - one message with several bindings, and the limited operator-reported posture;
  - supersession and its fork refusal;
  - case and agency isolation, silence, markup inertness, the stale-ETag conflict and idempotent replays;
  - keyboard and focus, 390 px, sign-out, and no Send/Reply/Contact action.
- **Result:** no finding. The browser made no request beyond localhost.

## 20. Negative controls (mission §36)

`evidence/p4c-negative-controls.txt` records the final run: 38 controls, 38 caught and restored.

- **Coverage:** every one of the 21 control kinds of mission §36, plus one extra (an outbound request on capture).
- **Commands:** 48 responsible commands, every one failing and naming a test. The first failure was 46 AssertionErrors plus 2 web waits/lookups for an element the mutation removed.
- **Restoration:** every file was restored byte-identically (SHA-256). The working-tree fingerprint was identical before and after, and `tb_notice_test` was empty afterwards.
- **Run 1** (same head and tree) caught 36/37. The auto-outcome-from-silence control measured thirty days with the wall clock while the test advances the app clock, so its mutation never fired. That was a defect of the control; run 2 uses the app's injected clock.
- **Sharpened controls:** three run-1 controls were caught only through a backstop. They were sharpened to prove the protection itself: the copied-text digest as source identity, a stale ETag split into 18a/18b, and the idempotency-key rewrite.
- **Backstops still visible in run 2:** five controls fail with a 500 where the contracted answer is asserted (07a, 08, 13b's second command, 15, 18b). Composite foreign keys, a unique index and the executor's unchecked-precondition refusal still stop the forbidden write (details in the evidence file).

## 21. Tests, regression and CI

New tests (all synthetic, `example.invalid`):

| File | Tests | Covers |
|---|---|---|
| `tests/db/p4c-http.test.ts` | 40 | The five operations over real HTTP on `tb_notice_test`. **Capture 12**: exact storage, defaults, timestamps, storability, no dedupe, posture, source applicability, agency, untrusted body, refused client-computed fields, list, get, audit. **Bindings 15**: NMI, every event type, AS_SENT explicit, OUTCOME item rule, mixed outcomes, one message/several bindings, cross-agency, cross-case items, case isolation, supersession and its rules, supersession isolation, If-Match, context revision, history-bearing, list. **Transmission/outcome 3**: no outbound connection or fetch, silence, text never classifies. **Contamination 2**. **Shared write layer 3**: idempotency, concurrency, audit rollback. **Security/contract 3**: session/CSRF/Origin, unrouted actions and later phases, every response checked against its contract operation with all five exercised |
| `tests/api/correspondence-rules.test.ts` | 14 | Capture posture, exact body digest and NUL, storability of `occurredAt`, cited sources, item-specific outcomes, audit redaction, and the module's imports and the API package's dependencies (no network, mail, Drive or process client) |
| `tests/web/p4c.test.tsx` | 17 | The registry, capture form, record page, case history and binding page against the synthetic in-memory API: exact payloads, no defaults or preselection, posture refusals on their field, inert markup, Occurred vs Recorded, hash label, idempotent retry, "as sent" copy, outcome item rule, mixed outcomes, one message/two items, supersession, case isolation, agency-only messages, conflict reload, archived case |

Totals on the code head `b9fcaf2`: **`yarn test` 1377 in 39 files** (R9 final: 1346 in 37) and **`yarn test:db` 380 in 10 files** (R9 final: 340 in 9). The home PC and CI give the same counts.

Regression sweep (mission §41; `evidence/p4c-first-pc-sweep.txt`), 2026-09-25T13:06:30Z–13:11:56Z on `b9fcaf2`, every step exit 0 (**21/21**):

- static and contract checks: `reference:check`, `reference:helper-tests` (27/27), `contracts:check`, `install --immutable`, `typecheck`, `lint` and `oxlint --deny-warnings --format default` ("Found 0 warnings and 0 errors."), `format:check`;
- tests: `test` and `test:db`;
- databases: `db:verify test --expect-empty`, `db:verify dev` (5 domain rows, unchanged since R8 — nothing written to `tb_notice_dev`), `db:status test` / `dev`, both drift diffs (empty migrations);
- build and runtime: `build` (no Vite chunk-size advisory: entry `index-Cbv12950.js` 323.25 kB, gzip 100.69 kB, plus 24 lazily loaded chunks — the P4C ones `correspondence` 18.83 kB, `case-correspondence` 17.22 kB and the shared `correspondence-ui` 4.17 kB), `smoke:local` (46 checks, including the correspondence routes behind session and Origin and prompts unrouted), `dev:verify-shutdown` (4/4);
- then `reference:check` and `db:verify test --expect-empty` again.

`yarn test:transition-baseline` is not a gate and fails by design (ADR-0004); it was not run as a gate and not "fixed".

CI (`evidence/p4c-ci-run-36139089683.txt`): push runs on this branch, all success, both jobs:

- 36129072727 (`d2b6f00`);
- 36129721720 (`abad3ee`);
- 36133062817 (`48ceebd`: the API, `smoke:p4c` 62 checks);
- 36135445880 (`0038c56`: the UI);
- 36139089683 (`b9fcaf2`, 2026-09-25T13:08:30Z–13:18:39Z): lint "Found 0 warnings and 0 errors.", `yarn test` 1377 / 39 files, `yarn test:db` 380 / 10 files, build (entry 323.25 kB, no bundle advisory), seed digest unchanged, both drift diffs empty, `smoke:local` 46, `smoke:auth` 4, `smoke:directory` 14, `smoke:p3a` 24, `smoke:p3b` 36, `smoke:p4a` 50, `smoke:p4b` 64, `smoke:p4c` 62, the P1.1 recovery checks, clean `yarn dev` shutdown 4/4.

The compiled `smoke:p4c` is CI only, because it writes synthetic records into CI's disposable `tb_notice_dev`. It runs:

1. login → agencies A and B, a raw-message source of A, two cases of A with reported items;
2. captures: an inbound NMI (copied full text; exact text, body hash of the recorded text, raw header date not parsed), an outbound historical transmission (raw source), an inbound decision on two videos and an agency-B message; a `RAW_SOURCE` capture without its raw source is 422;
3. capture created no binding and changed no case;
4. NMI bound explicitly (the context revision moved once); the outbound message bound explicitly as `INITIAL_AS_SENT` to two items; OUTCOME A REMOVED and B REJECTED; a correction supersedes the NMI binding, and a second correction is 409;
5. history kept: 6 bindings, the superseded one unchanged; one message with two bindings; three captures for agency A with no body in the list;
6. refusals: OUTCOME without an item 422, agency B's message in A's case 422, another case's item 422, a stale case ETag 412; the refusals wrote nothing;
7. send, reply, PATCH and DELETE of a message, readiness, production context and prompts are all unrouted (404);
8. logout.

## 22. Contamination tests (mission §35)

Every mandatory item has a test:

| Mission §35 item | Test |
|---|---|
| Agency A correspondence cannot bind into an agency-B case | DB "cross-agency" (422 `CROSS_AGENCY_REFERENCE`, nothing written); web "the binding form never offers … another agency's message"; browser 21 |
| Case A's reported item cannot be used in a case-B binding | DB "reported items: another case's item is 422 CROSS_CASE_REFERENCE"; web "never offers another case's reported item"; browser 20 |
| Case A's interpretation does not appear in case B | DB "case isolation"; web "case isolation: case B shows none of case A's bindings"; browser 19 |
| The same Message-ID in different capture scopes is not merged | DB "the same Message-ID in two agencies is two captures, never merged" and "no deduplication by Message-ID, subject, addresses or dates" |
| The same subject is not a duplicate identity | DB "no deduplication …" (identical metadata captured twice is two records) |
| One correspondence with several bindings stays one correspondence | DB "one message, several bindings"; web "one message bound to two reported items is one message"; browser 14 |
| Item A's outcome does not transfer to item B | DB "mixed outcomes stay item-specific … item A's outcome never appears on item B"; web "mixed outcomes stay item-specific"; browser 12–13 |
| Supersession in case A does not touch case B | DB "a supersession in case A leaves case B untouched" |
| Correspondence content never becomes a CaseFact automatically | DB "correspondence content never becomes a case fact, a readiness state or a later-phase record" |
| No correspondence creates readiness or G1–G7 state | Same test (no readiness or G1–G7 key anywhere); DB security/contract "production, prompts, candidates and readiness stay unrouted; P4C creates no later-phase record"; the response check (no readiness or transmission-verdict vocabulary) |

## 23. Database changes

None: no migration, no schema change, no new dependency. `20260923103912_initial_schema` (sha256 `b54c36fd…426515`) stays the only migration.

`correspondence` and `correspondence_bindings` already existed with every key used (§1.2):

- the unique `(agency_id, mailbox_address, source_identity_hash)`, `(id, agency_id)`, `(id, case_id)` and `supersedes_binding_id`;
- the composite foreign keys `(case_id, agency_id)` → cases, `(correspondence_id, agency_id)` → correspondence and `(reported_item_id, case_id)` → reported_items.

`records.ts` already listed their references and JSON columns. `db:verify` (test and dev) and both drift diffs pass (§21). Mission §38's stop condition (a required schema change) did not occur.

## 24. Contract changes

**None.** TB-SCHEMA-API-v1.2.0 is unchanged and active:

- the v1.1.0 and v1.2.0 release records and `docs/reference/**` are untouched;
- the generated artefacts are unchanged (`contracts:check`), and `AppMeta.schemaRelease` is unchanged;
- the five operations were implemented exactly as contracted — methods, paths, schemas, statuses, If-Match target, idempotency and no ETag — and every collected response is checked against its contract operation.

The three new codes live in the free-string error `code` field with contracted statuses and shapes (R6 interpretation 10): `CAPTURE_POSTURE_UNSUPPORTED` 422, `OUTCOME_ITEM_REQUIRED` 422, `BINDING_ALREADY_SUPERSEDED` 409.

No contract gap was found. Mission §39's stop condition (a required contract change) did not occur.

## 25. Interpretations for R10 review

1. `sourceIdentityHash` is always null: no reliable provider or capture identity is part of the contracted input, so nothing is deduplicated (D4).
2. `bodySha256` is computed for any recorded body, whatever the capture mode. It is labelled as the hash of the recorded text only, never as a raw-MIME hash (D3).
3. Only three capture postures are refused, each self-contradictory. Nothing is demanded to strengthen a record (D5).
4. A case-scoped source is refused as a raw or attachment source, because a capture is agency-level and can be bound into several cases (D6).
5. Capturing into an archived agency is 409, like other new records under an archived parent (D9).
6. A NUL in `bodyText` is refused (INVARIANTS §6, the digest-bearing field) (D2).
7. Any `outcome` value, not only the OUTCOME event, requires a reported item. An OUTCOME may leave `outcome` null (D12).
8. There is no direction rule for event types and no duplicate-binding rule; the contract and domain are silent (D10, D14).
9. The bindings list includes superseded bindings: it is the only read of a binding, and the history is kept (D16).
10. `timestampPrecision` is free text (1–40 characters) with the default `UNKNOWN`: no vocabulary is defined (D8).
11. A binding moves the case's `contextRevision` and makes the case history-bearing for the P4A route-correction rule (D15).

## 26. Deviations, warnings and limitations

- **UI input limits:**
  - the browser's text box stores line breaks as LF, so a CR cannot be typed in the capture form (the API stores any CR exactly);
  - browser email inputs drop surrounding spaces;
  - `datetime-local` gives minute precision (the API accepts milliseconds).
- **No reverse read:** the captured-record page cannot list the cases a message is bound to, because no contracted read returns a message's bindings across cases. The bindings are read per case.
- **Web fake:** `tests/web/support.tsx` mirrors only the server rules the pages rely on; the server rules themselves are proven over HTTP.
- **Duplicated helper:** `useKept` (keep typed values across a reload) is duplicated in `case-correspondence.tsx` rather than refactored out of `facts.tsx`, which keeps the P4B file untouched.
- **Negative-control history:** run 1 (36/37) is kept in the evidence history (§20). Five run-2 catches surface through backstops as 500s where the contracted status is asserted.
- **Missing screenshot:** `p4c-07` was not written (§19).
- **Transition baseline:** `yarn test:transition-baseline` fails by design since the first contract edit (ADR-0004); it is not a gate and was not "fixed".
- **Own CI run:** a commit cannot record its own CI run, so the run of the R10 submission (documentation) commit is reported with the R10 report.

## 27. Blockers

None for R10. No stop condition of the mission occurred:

- AUTHENTICATION_REQUIRED
- MATERIAL_GIT_CONFLICT
- SCHEMA_CHANGE_REQUIRED
- CONTRACT_CHANGE_REQUIRED
- LEGAL_APPROVAL_REQUIRED
- IRREVERSIBLE_EXTERNAL_ACTION

## 28. Proposed next phase (not started)

**P4D — Production context** (proposed name; it needs its own explicit, approved mission and gate, for example R11):

- **Scope:** the one contracted read `getProductionContext` (GET `/cases/{caseId}/production-context`).
- **What it returns:** the case-specific input a later production would rely on, read from exactly what the case records and pins:
  - the party and the selected authority chain;
  - reported items, works, mappings, and facts with their supports and sources;
  - the parent correspondence binding and prior correspondence;
  - what is missing or conflicting;
  - the case's context revision.
- **Rules:** the same isolation and pinning rules; nothing is followed, inferred or upgraded.
- **Excluded:** readiness, G1–G7 decisions, READY_FOR_SIGNER, signature and external action. The prompts (`generatePrompt`, `listCasePrompts`, `getPrompt`), candidates, validation, assessments, readiness and unsigned export also stay later, as do any AI-provider call and any signing or sending.

Whether any P4C interpretation (§25) must change first is the operator's decision at R10. Nothing of this phase is started.
