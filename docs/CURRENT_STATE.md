# Current engineering state

Observed project engineering state only. Not legal, canonical or case evidence; it does not supersede Drive records, the specifications or the frozen references. Updated at the P4A submission for review gate R8 (2026-09-24 UTC, home PC = the first PC of the P0–P4A records).

| Item | State |
|---|---|
| Branches | `bootstrap/p0-local` — the P0 branch at the P0 reproduction baseline; it takes **no P1 application code**. `feature/p1-auth-shell` — P1/P1.1, accepted at R4.1, head `8fe96ae`, unchanged since. `feature/p2-directory` — P2 directory work and its R5 closeout, head `31db581`, branched from the accepted P1.1 head `8fe96aea5a30bb01fa24c987e30689f4e6532164`, unchanged since. `feature/p3a-sources-route` — P3A, branched from the R5 closeout head `31db581`, accepted head `c1b8d22`, unchanged since; merged into `main` by pull request #1 (merge commit `adea2bc`). `feature/p3b-representation-authority` — P3B, created from `adea2bc`; it holds the R6 closeout (`c8da59f`), the P3B implementation (`9e7e6f6`, `f79aa0a`, `be5cb4c`, `e23da02`, `04b8528`), the R7 submission documentation (`8e513f0`), the R7 remediation `ee31fa3` and its documentation; accepted head `05ce7b0`, unchanged since. `main` — at `3649bef4d83feeec3bcf6b8293757354af739ae4`, the merge commit of pull request #2 (merged by the repository owner 2026-09-24T13:50:21Z; parents `adea2bc` and `05ce7b0`; its tree is identical to `05ce7b0`). `feature/p4a-case-core` — created from that exact `main` head for P4A; it holds the R7 closeout records (`b97ac13`), the lint fix `d615297`, the P4A implementation (`2cae729`, `119c45b`, `b6aeeac`, `61164fa`, `6330aeb`) and its documentation; submitted at R8, not merged |
| Completed | P0-A, P0-B, P0-C1–C7, P0-D, P0-E (first PC and CI); P0 Windows-browser checkpoint (operator-reported); P1 authentication + application shell (R4 **PASS_WITH_NOTES**, 2026-09-23; `docs/verification/p1/P1_AUTH_SHELL.md`); P1.1 local recovery commands (R4.1 **ACCEPTED**, operator, 2026-09-24; `docs/verification/p1/P1_1_AUTH_RECOVERY.md`); P2 Directory (R5 **PASS_WITH_ONE_REMEDIATION**, operator, 2026-09-24; the identity-lock remediation is implemented and verified — `docs/verification/p2/P2_DIRECTORY.md` §15; R5 then closed by the operator: "R5 review result: PASS", `P2_STATUS = VERIFIED_COMPLETE_FOR_CURRENT_SCOPE`); P3A Sources, canonical bindings and Route (R6 **PASS**, operator, 2026-09-24; `P3A = VERIFIED_COMPLETE`, `MERGED_TO_MAIN` — `docs/verification/p3a/P3A_SOURCES_ROUTE.md` §19); P3B Representation authority (R7 **PASS_WITH_ONE_REMEDIATION**, then **PASS** at the closeout, operator, 2026-09-24; `P3B = VERIFIED_COMPLETE`, `MERGED_TO_MAIN` — `docs/verification/p3b/P3B_REPRESENTATION_AUTHORITY.md` §21–§22) |
| Current mission | TB_P4A_CASE_CORE_AND_AUTHORITY_SELECTION_TO_R8 — P4A (Case core, case sources, case authority selection; the 16 contracted operations) implemented and verified on `feature/p4a-case-core` and submitted at review gate **R8 (PENDING)**; no merge and no next phase until the R8 result. The final branch CI result is reported with the R8 submission |
| Development topology (ADR-0003) | `PRIMARY_DEVELOPMENT_WORKSTATION = HOME_PC` (the first PC). The second-PC reproduction is **DEFERRED_BY_OPERATOR**; the runbook is preserved and stays valid for any future workstation. GitHub is the source of truth for code, branches, committed migrations and CI verification; local database volumes are never copied or synchronized through Git |
| R4 decisions (accepted) | Frozen-contract status mapping kept (403 INVALID_CREDENTIALS, 400 login validation/oversized public request); both exact dev origins kept — canonical Windows-browser origin `http://localhost:5173`, `http://127.0.0.1:5173` for WSL tools, cookies are per hostname and never shared; 12 h absolute / 30 min idle; password policy 15–256 code points, NFKC, current Argon2id; session-row retention cleanup DEFERRED (not blocking P2) |
| P2 scope decisions (operator, mission TB_P2_DIRECTORY_TO_R5) | D1 OwnerSubject included; D2 operations needing a SourceReference that the product cannot yet author are DEFERRED to the Source phase (no placeholder sources); D3 "established" Agency/LegalSubject = ACTIVE, canonically bound or referenced by another persisted record; D4 fieldAttributions checks; D5 hard delete only for unused, unbound DRAFT rows; D6 minimal protected Directory pages |
| R5 decisions (operator, 2026-09-24) | Accepted: A restore returns an archived record to DRAFT; B archived records are read-only except the explicit restore; C Signer administrative state carries no legal-authority meaning (no mandate coverage, eligibility, G7, signature authority or notice adoption); D an agency-less SourceReference satisfies an Agency/Signer reference only when explicitly scoped to that agency; E accent-insensitive matching only for discovery search, never for identity equality, canonical matching, duplicate determination, unique keys or legal/entity equivalence. Overridden and remediated: once established, **every** identity-defining field is locked against generic PATCH, empty ones included; a future correction/supplement workflow is not invented |
| R6 decisions (operator, 2026-09-24) | Accepted: 1 a canonical binding requires a current CANONICAL_RECORD SourceReference; 2 a canonical binding cannot be replaced through the current workflow — correction needs a future reconciliation workflow; 3 a source revision keeps its owning Agency and scope; 4 a default Signer cannot be ENDED; 5 Route restore/relink is refused while a participating party is archived; 6 a canonically bound Signer's full legal name is identity-locked; 7 Owner source scope stays conservatively enforced against reuse of another Owner's material until a more explicit owner-scope model exists; 8 the source-aware P2 field-attribution/link validation stays active; 9 creating an Agency-owned SourceReference counts as a persisted reference and so establishes/locks that Agency under D3; 10 new operation-specific error codes only inside the existing free-string error `code` field, with the contracted HTTP statuses and response shapes. No contract change is authorized by this acceptance |
| R7 decisions (operator, 2026-09-24) | Accepted: 1 a Mandate has no established-identity lock (a representation/appointment container, not a LegalSubject identity record); 2 an archived Mandate stays read-only, including no new AuthorityEvent — a historical or retroactive event is recorded by restoring the Mandate administratively, recording the event with its actual supplied effective/occurred date and archiving again if appropriate; `recordedAt` is never substituted for `effectiveAt`; 3 UNTIL_TERMINATED plus an `expiresOn` may be preserved as supplied documentary facts, with no currentness, expiry or contradiction resolution inferred; 4 a PAUSED Route and a PAUSED Signer may take part in P3B documentary records where the contract allows (administrative state; proves or disproves no legal authority); 5 a truthful incomplete DRAFT MandateVersion may be frozen (FROZEN = immutable snapshot only — not complete, legally approved, current authority, G1 PASS, owner-confirmed or signer-adopted); 6 `Route.preferredCoverageId` is not cleared automatically when its Mandate is later archived — the recorded preference is kept and any later Case/authority-selection workflow must revalidate the Coverage; 7 the conservative owner-material source-scope extension stays until a more explicit owner-scope model exists; 8 permanent: Coverage ≠ G1 PASS, CoverageSigner ≠ G7, an AuthorityEvent's existence is not proof by itself, an application User is not a Signer. Required remediation: SourceReference timestamp storability (done, `ee31fa3`); R7 then closed as **PASS**. No contract amendment is authorized |
| DOCUMENT_REVIEWED (permanent rule) | A SourceReference row does not itself establish DOCUMENT_REVIEWED. DOCUMENT_REVIEWED means an actual human review of the document occurred; the system records that provenance only from an explicit, supported, human-entered fact representing that real review. A reviewer name, URL, source row, hash or canonical binding never by itself upgrades provenance to DOCUMENT_REVIEWED; defaults remain non-upgrading |
| P0 reproduction baseline | `P0_REPRODUCTION_BASELINE` = `b9eea3755a87490636cbb0f2e7aec1a59e15d64c` (documentation-only Windows-browser checkpoint; branch CI run `35873152877` success). `feature/p1-auth-shell` branches from it; it remains the commit named for the deferred second-PC reproduction (ADR-0003) |
| Not started | P4B (proposed; see *Next phases*), the later case phases and every later phase — each needs explicit approval |
| External legal actions | 0 |
| Real case data | 0 (synthetic fixtures only) |
| Accounts | No real application account exists in any committed or CI artefact. The operator manages local accounts with `yarn admin:create`, `admin:password`, `admin:disable`, `admin:enable` and `admin:revoke-sessions` (own passwords; never committed). CI creates and recovers only a synthetic account in its disposable database |
| Deployment | none |
| Latest CI-verified code commit | P4A code head on `feature/p4a-case-core`: `61164fab2b22b4a46462714f8d86b00adef4e77b` (push run `36028683469`, both jobs success, including the new compiled `smoke:p4a`, 47 checks); the test-only commit `6330aeb` and the documentation are covered by the run of the submitted head, reported with R8. Lint fix `d615297` (push run `36016274650`, "Found 0 warnings and 0 errors."). `main` after the P3B merge: `3649bef4d83feeec3bcf6b8293757354af739ae4` (push run `36008448885`, both jobs success). Accepted P3B head: `05ce7b06118182d6592a434a90f4b88ce53f6fa8` (push run `36004964689`, pull_request run `36006237155`, both success). R7 remediation: `ee31fa38bf398a56be0bf703409128cb0d6ef5b2` (push run `36002633201`, both jobs success); R7 submission head `8e513f0` (run `35991749458`, success). P3B code head: `04b852863705da8115c7d165eb852768afe3c976` (push run `35990960584`, both jobs success); P3B API + `smoke:p3b`: `f79aa0a` (run `35980464772`). `main` after the P3A merge: `adea2bc5b7ab5ed4cbc9fb309055b6f930d64cce` (push run `35968171532`, both jobs success). Accepted P3A head: `c1b8d22cc748d1b0be10be0ecf4a5f464d2c396e` (push run `35966993063`, pull_request run `35966987256`, both success). P3A code: `85c2839` (push run `35966162924`). P2 R5 remediation: `4b67fff631fa8b51a243fbecd64d43f76ce79d97` (run `35953912083`). P2 at R5: `cbfd640` (run `35948987435`). P1.1: `8fe96ae` (run `35894704102`). P1: `5507726` (run `35885393358`). P0: `0dfc7a5` (run `35863416044`) |
| Initial migration | `20260923103912_initial_schema`, sha256 `b54c36fdaada7bdd31e08558a93d70e9e40fd4c48348681c9c2a124503426515` — still the only migration (P1, P1.1, P2, the R5 remediation, P3A, P3B, the R7 remediation and P4A made no schema change) |
| Contract baseline | Wire compatibility `TB-SCHEMA-API-v1.0.0`; PFC wire id `PFC-YT-EMAIL-v1.1`; active Zod source per ADR-0002 (ACCEPTED); generated artefacts unchanged since P0 (`contracts:check` OK). P2 implements 36 directory operations; P3A adds the 4 directory `bindCanonical*` operations (deferred by D2 until sources existed), the 4 source operations and the 9 route operations; P3B adds the 23 representation-authority operations — 76; P4A adds the 16 case operations (Case 10, CaseSource 4, CaseAuthoritySelection 2) — 92 business operations routed; every later case operation is not routed. No wire change (the R7 remediation and P4A included). Contract gap reported at R8: no contracted operation reads a selection's pinned CaseAuthorityCoverage rows (`P4A_CASE_CORE.md` §9) |
| Database image | `mysql:8.4.11@sha256:0744ee5ef89ce6ccfa13de3e579fe6b9e27f93dd70da9c06d2c908b1b193fb8d` on `127.0.0.1:3307` |
| Seed | Disabled synthetic actor `00000000-0000-4000-8000-00000000a0c7`; canonical digest `0ee26dc3ee5f3a1030fb78a6cadaf4dabef1f5a296b58163248584e1e0bfb775` (first PC = CI; unchanged by P1) |
| Toolchain | Node 24.21.0, Yarn 4.18.0, TypeScript 7.0.2, Prisma 7.10.0, Zod 4.6.5, ajv 8.20.0, ajv-formats 3.0.1; P1 adds argon2 0.45.1, react-router 8.4.0, @nestjs/testing 12.0.4, happy-dom 20.14.5 (see `CLAUDE.md`); P2, P3A, P3B, the R7 remediation and P4A add no dependency (lockfile unchanged) |
| Local env | Root `.env` now also needs `TB_SESSION_SECRET` and `TB_ALLOWED_WEB_ORIGINS`; `yarn env:init` adds missing P1 keys (and replaces empty/placeholder P1 values) without touching any other line (first PC: done 2026-09-23) |
| Decisions | ADR-0001 manual MySQL migration semantics (ACCEPTED); ADR-0002 Zod-first contract authoring (ACCEPTED); ADR-0003 single-PC development baseline (ACCEPTED, operator, 2026-09-24); P1 interpretations listed in `P1_AUTH_SHELL.md` §4 (accepted at R4); P2 interpretations in `P2_DIRECTORY.md` §12 (decided at R5); P3A interpretations in `P3A_SOURCES_ROUTE.md` §16, accepted at R6 (§19); P3B interpretations in `P3B_REPRESENTATION_AUTHORITY.md` §17, accepted at R7 (§21.1; R7 closed as PASS, §22); P4A interpretations in `P4A_CASE_CORE.md` §17, submitted for R8 |

## P0 status (see `docs/verification/p0/P0_FINAL_REPORT.md`)

| Scope | Status |
|---|---|
| P0_FIRST_PC | PASS |
| P0_CI | PASS (runs 35863416044 @ `0dfc7a5`, 35864210436 @ `f6f5a96`; baseline run 35873152877 @ `b9eea37`) |
| P0_WINDOWS_BROWSER | PASS — OPERATOR_REPORTED (first PC, reported 2026-09-23; not automated evidence) |
| P0_SECOND_PC | DEFERRED_BY_OPERATOR (ADR-0003, 2026-09-24; never run, not passed) |
| P0_TWO_PC_ACCEPTANCE | NOT_COMPLETED (P0-26, P0-27) |
| P0_SINGLE_PC_BASELINE | VERIFIED (home PC + CI) |
| P0_OVERALL | NOT_COMPLETE against the original two-PC acceptance contract; development continues on the verified single-PC baseline |

## P1 status (see `docs/verification/p1/P1_AUTH_SHELL.md`, `P1_1_AUTH_RECOVERY.md`)

| Scope | Status |
|---|---|
| P1_FIRST_PC | PASS (automated) |
| P1_CI | PASS (run 35885393358 @ `5507726`) |
| R4 review | PASS_WITH_NOTES (operator, 2026-09-23) |
| P1_1_FIRST_PC | PASS (automated); the two port-bound checks left NOT RUN locally in the P1.1 record: PASS — OPERATOR_REPORTED (see below) |
| P1_1_CI | PASS (run 35894704102 @ `8fe96ae`, both jobs success) |
| R4.1 review | ACCEPTED (operator, 2026-09-24) |
| P1_WINDOWS_BROWSER | NOT_RUN (not reported by the operator; never inferred from tests or database traces) |

Operator report at R4.1 acceptance (2026-09-24), recorded as stated: "the remaining first-PC verification checks have passed". The report does not name the commands, the commit or any output. The P1.1 record had left `yarn smoke:local` and `yarn dev:verify-shutdown` NOT RUN locally because the operator's own `yarn dev` held ports 3000/5173. This is OPERATOR_REPORTED, not automated evidence, and it is not read as a Windows-browser sign-in report.

## P2 status (see `docs/verification/p2/P2_DIRECTORY.md`)

| Scope | Status |
|---|---|
| P2_FIRST_PC | PASS (automated; R5 closeout sweep repeated after the remediation) |
| P2_CI | PASS for `cbfd640` (run 35948987435), `a885b96` (run 35950151963) and the remediation `4b67fff` (run 35953912083); the closeout documentation run is reported with the closeout |
| P2_BROWSER | PASS 14/14 at R5, plus the identity-lock scenarios re-run after the remediation — Playwright MCP isolated browser against the compiled API on the disposable `tb_notice_test` (`yarn ui:sandbox`); supplemental to the test suites |
| R5 review | PASS_WITH_ONE_REMEDIATION (operator, 2026-09-24), then **PASS / CLOSED** with the remediation accepted (operator, P3A mission, 2026-09-24) |
| P2_STATUS | VERIFIED_COMPLETE_FOR_CURRENT_SCOPE (operator) |

## P3A status (see `docs/verification/p3a/P3A_SOURCES_ROUTE.md`)

| Scope | Status |
|---|---|
| P3A_FIRST_PC | PASS (automated: `yarn test` 1093, `yarn test:db` 190, full regression sweep with drift checks) |
| P3A_CI | PASS for `73fa223` (run 35962967984), `9481bd0` (run 35963513064), the code head `85c2839` (push run 35966162924; pull_request run 35966165567) and the accepted head `c1b8d22` (push run 35966993063; pull_request run 35966987256). The failed checks of `afeb012` (run 35959934247) and `0c289be` (run 35961207473) — a stale `smoke:local` expectation, fixed in `73fa223` — are preserved as historical evidence; no history was rewritten |
| P3A_BROWSER | PASS 21/21 — Playwright MCP isolated browser against the compiled API on the disposable `tb_notice_test` (`yarn ui:sandbox`); one copy defect found and fixed (`85c2839`); supplemental to the test suites |
| P3A_NEGATIVE_CONTROLS | PASS 28/28 (every disabled protection failed its responsible suites; files restored byte-identically) |
| R6 review | **PASS** (operator, 2026-09-24); the interpretations were accepted (see *R6 decisions* above) |
| P3A_STATUS | VERIFIED_COMPLETE |
| P3A_MERGE | MERGED_TO_MAIN — pull request #1, GitHub merge commit `adea2bc` (method: merge commit, not squash or rebase), merged 2026-09-24T07:10:08Z; `main` push CI run 35968171532 success |

R7 remediation (`ee31fa3`, on `main` since the P3B merge `3649bef`): SourceReference `observedAt`/`reviewedAt` are stored as exactly the supplied instant or refused with 422 before any write — see `P3B_REPRESENTATION_AUTHORITY.md` §21.

Recorded boundaries: a SourceReference is metadata and a pointer, not evidence proof; a canonical binding is an identity/reference binding, not authority; a Route link is not authority; P3A contains no Mandate, MandateVersion, MandateCoverage, CoverageSigner or AuthorityEvent (P3B) and no case data. Session-row and idempotency-record retention cleanup remain DEFERRED and non-blocking (unchanged).

## P3B status (see `docs/verification/p3b/P3B_REPRESENTATION_AUTHORITY.md`)

| Scope | Status |
|---|---|
| P3B_FIRST_PC | PASS (automated: `yarn test` 1148, `yarn test:db` 251, full regression sweep with drift checks) |
| P3B_CI | PASS for `f79aa0a` (run 35980464772), the code head `04b8528` (push run 35990960584; both jobs success, including the new compiled `smoke:p3b`, 36 checks), the R7 submission head `8e513f0` (run 35991749458), the remediation `ee31fa3` (run 36002633201) and the accepted head `05ce7b0` (push run 36004964689; pull_request run 36006237155). The branch-creation run 35970356174 (`adea2bc`) was cancelled by the concurrency group when `c8da59f` was pushed; it stays as it is |
| P3B_BROWSER | PASS 20/20 — Playwright MCP isolated browser against the compiled API on the disposable `tb_notice_test` (`yarn ui:sandbox`); three UI findings found and fixed (`04b8528`); supplemental to the test suites |
| P3B_NEGATIVE_CONTROLS | PASS 51/51 (every disabled protection failed its responsible suites; files restored byte-identically; `tb_notice_test` empty after every DB control; the timing-dependent concurrent-freeze control detected 3/3) |
| R7 review | **PASS** (operator, 2026-09-24) — first **PASS_WITH_ONE_REMEDIATION** (functionally accepted; decisions accepted, see *R7 decisions*), closed as PASS after the remediation |
| P3B_R7_REMEDIATION | **IMPLEMENTED AND VERIFIED**, accepted at the closeout — SourceReference instant storability, one shared rule with P3B (`ee31fa3`): tests (`yarn test` 1196, `yarn test:db` 256), negative controls 8/8, regression sweep 19/19, targeted browser re-check 7/7, CI run 36002633201 success (`P3B_REPRESENTATION_AUTHORITY.md` §21) |
| P3B_STATUS | VERIFIED_COMPLETE |
| P3B_MERGE | MERGED_TO_MAIN — pull request #2, GitHub merge commit `3649bef` (method: merge commit, not squash or rebase), merged 2026-09-24T13:50:21Z; `main` push CI run 36008448885 success (`P3B_REPRESENTATION_AUTHORITY.md` §22) |

Recorded boundaries (persistent, see `CLAUDE.md`; carried forward at the closeout, §22.3): authority records are not self-proving; a Mandate is a representation container, not a legal identity; a frozen version is an immutable snapshot, not completeness, human or legal approval, current authority or G1 PASS; Coverage is not G1; CoverageSigner is not G7 and a User is never a Signer; an AuthorityEvent is not proof by existence; `Route.preferredCoverageId` is an operational preference only; citations are pinned to exact source revisions; no authority currentness is inferred from dates or silence; DOCUMENT_REVIEWED is never inferred; dates and instants that cannot round-trip exactly are refused before persistence. No case data exists; Case operations are not routed.

## P4A status (see `docs/verification/p4a/P4A_CASE_CORE.md`)

| Scope | Status |
|---|---|
| P4A_FIRST_PC | PASS (automated: `yarn test` 1228 in 32 files, `yarn test:db` 295 in 8 files, full regression sweep with drift checks; lint **0 warnings**) |
| P4A_CI | PASS for the code head `61164fa` (push run 36028683469; both jobs success, including the new compiled `smoke:p4a`, 47 checks). The run of the submitted head (test-only commit `6330aeb` plus the documentation) is reported with R8 |
| P4A_BROWSER | PASS 23/23 — Playwright MCP isolated browser against the compiled API on the disposable `tb_notice_test` (`yarn ui:sandbox`); three UI findings found and fixed (F1 route-dialog focus, F2 hidden label, F3 horizontal scroll at 390px); supplemental to the test suites |
| P4A_NEGATIVE_CONTROLS | PASS 24/24 (every disabled protection failed its responsible tests; files restored byte-identically; working tree identical before and after; `tb_notice_test` empty afterwards) |
| R8 review | **PENDING** — submitted 2026-09-24 |

Recorded boundaries (persistent, see `CLAUDE.md`): case isolation — nothing of one case supports, appears in or carries over to another, and a case-scoped source applies only to the cases it names; a CaseSource link is an association, not proof, and never changes provenance; CaseAuthoritySelection is the authority chain selected/pinned for evaluation in one specific Case — not G1 PASS, current authority, validity, signer eligibility, G7 or readiness; a selection pins exact records (the case's route, one signer, coverages of frozen versions recording that signer, the basis source revision), is append-only and never follows newer records; nothing is selected implicitly or inherited across cases; P4A computes no readiness. No real case data exists; every later case operation is unrouted.

## Next phases (not started)

| Phase | Scope | Gate |
|---|---|---|
| **P4B — Case intake material** (proposed at R8; not started) | The contracted ReportedItem (6: list, create, get, patch, archive, restore), CaseWork (6) and UseMapping (6) operations under `/cases/{caseId}` and CaseFact (4: list, create, get, revise) — case-specific material recorded exactly as supplied with sources pinned to the case; none of it a finding of infringement, permission, exception or fair use. Excludes correspondence, production context, prompts, candidates, validation, assessments, readiness, G1–G7, READY_FOR_SIGNER, signing and sending. Needs its own explicit, approved mission after the R8 result | R9 |

**CaseAuthoritySelection (semantic note, operator, recorded for P4A and implemented there):** "the authority chain selected/pinned for evaluation in this specific Case". It does not mean G1 PASS, current authority confirmed, legally valid authority adjudicated, signer eligibility confirmed, G7 or notice readiness; actual G1 evaluation is a later readiness phase.

Everything else case-specific (correspondence, prompts, candidates, validation, assessments, readiness) remains later. Each phase needs an explicit, approved mission.

## Remaining requirements

1. P0: the second-PC reproduction is deferred by the operator (ADR-0003). If a workstation is added later, it runs `docs/architecture/SECOND_PC_REPRODUCTION_RUNBOOK_v1.md`; only that evidence can change `P0_SECOND_PC` or `P0_TWO_PC_ACCEPTANCE`.
2. P4A: submitted at R8 (PENDING) — wait for the operator's R8 result; no merge to `main` and no next phase before it.
3. A manual Windows-browser sign-in is recorded as `P1_WINDOWS_BROWSER = PASS — OPERATOR_REPORTED` only when the operator reports it.
4. Resolved: the lint warning reported since `ee31fa3` was fixed in `d615297` (first commit of the P4A mission); `yarn lint` reports 0 warnings (CI run 36016274650: "Found 0 warnings and 0 errors.").
5. For the operator's decision (reported at R8, non-blocking): reading a selection's pinned CaseAuthorityCoverage rows back needs a contract amendment (`P4A_CASE_CORE.md` §9); the web bundle now exceeds Vite's 500 kB advisory (548.8 kB; route-level code splitting would be a separate decision, §18).
