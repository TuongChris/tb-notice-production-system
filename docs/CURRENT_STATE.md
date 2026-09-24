# Current engineering state

Observed project engineering state only. Not legal, canonical or case evidence; it does not supersede Drive records, the specifications or the frozen references. Updated at P3A review gate R6 (2026-09-24 UTC, home PC = the first PC of the P0–P3A records).

| Item | State |
|---|---|
| Branches | `bootstrap/p0-local` — the P0 branch at the P0 reproduction baseline; it takes **no P1 application code**. `feature/p1-auth-shell` — P1/P1.1, accepted at R4.1, head `8fe96ae`, unchanged since. `feature/p2-directory` — P2 directory work and its R5 closeout, head `31db581`, branched from the accepted P1.1 head `8fe96aea5a30bb01fa24c987e30689f4e6532164`, unchanged since. `feature/p3a-sources-route` — P3A (this state), branched from the R5 closeout head `31db581`; pull request #1 (`feature/p3a-sources-route` → `main`) was opened by the repository owner on 2026-09-24 and is not merged. `main` untouched at `1d4103d` |
| Completed | P0-A, P0-B, P0-C1–C7, P0-D, P0-E (first PC and CI); P0 Windows-browser checkpoint (operator-reported); P1 authentication + application shell (R4 **PASS_WITH_NOTES**, 2026-09-23; `docs/verification/p1/P1_AUTH_SHELL.md`); P1.1 local recovery commands (R4.1 **ACCEPTED**, operator, 2026-09-24; `docs/verification/p1/P1_1_AUTH_RECOVERY.md`); P2 Directory (R5 **PASS_WITH_ONE_REMEDIATION**, operator, 2026-09-24; the identity-lock remediation is implemented and verified — `docs/verification/p2/P2_DIRECTORY.md` §15; R5 then closed by the operator: "R5 review result: PASS", `P2_STATUS = VERIFIED_COMPLETE_FOR_CURRENT_SCOPE`); P3A Sources, canonical bindings and Route implemented and verified on the home PC and in CI, waiting at R6 (`docs/verification/p3a/P3A_SOURCES_ROUTE.md`) |
| Current mission | TB_P3A_SOURCES_CANONICAL_BINDINGS_AND_ROUTE_TO_R6 on `feature/p3a-sources-route` — the 17 P3A operations and their UI; stops at review gate R6. Its final branch CI result is reported with R6 |
| Development topology (ADR-0003) | `PRIMARY_DEVELOPMENT_WORKSTATION = HOME_PC` (the first PC). The second-PC reproduction is **DEFERRED_BY_OPERATOR**; the runbook is preserved and stays valid for any future workstation. GitHub is the source of truth for code, branches, committed migrations and CI verification; local database volumes are never copied or synchronized through Git |
| R4 decisions (accepted) | Frozen-contract status mapping kept (403 INVALID_CREDENTIALS, 400 login validation/oversized public request); both exact dev origins kept — canonical Windows-browser origin `http://localhost:5173`, `http://127.0.0.1:5173` for WSL tools, cookies are per hostname and never shared; 12 h absolute / 30 min idle; password policy 15–256 code points, NFKC, current Argon2id; session-row retention cleanup DEFERRED (not blocking P2) |
| P2 scope decisions (operator, mission TB_P2_DIRECTORY_TO_R5) | D1 OwnerSubject included; D2 operations needing a SourceReference that the product cannot yet author are DEFERRED to the Source phase (no placeholder sources); D3 "established" Agency/LegalSubject = ACTIVE, canonically bound or referenced by another persisted record; D4 fieldAttributions checks; D5 hard delete only for unused, unbound DRAFT rows; D6 minimal protected Directory pages |
| R5 decisions (operator, 2026-09-24) | Accepted: A restore returns an archived record to DRAFT; B archived records are read-only except the explicit restore; C Signer administrative state carries no legal-authority meaning (no mandate coverage, eligibility, G7, signature authority or notice adoption); D an agency-less SourceReference satisfies an Agency/Signer reference only when explicitly scoped to that agency; E accent-insensitive matching only for discovery search, never for identity equality, canonical matching, duplicate determination, unique keys or legal/entity equivalence. Overridden and remediated: once established, **every** identity-defining field is locked against generic PATCH, empty ones included; a future correction/supplement workflow is not invented |
| P0 reproduction baseline | `P0_REPRODUCTION_BASELINE` = `b9eea3755a87490636cbb0f2e7aec1a59e15d64c` (documentation-only Windows-browser checkpoint; branch CI run `35873152877` success). `feature/p1-auth-shell` branches from it; it remains the commit named for the deferred second-PC reproduction (ADR-0003) |
| Not started | P3B (see *Next phases*), Cases and every later phase — each needs explicit approval |
| External legal actions | 0 |
| Real case data | 0 (synthetic fixtures only) |
| Accounts | No real application account exists in any committed or CI artefact. The operator manages local accounts with `yarn admin:create`, `admin:password`, `admin:disable`, `admin:enable` and `admin:revoke-sessions` (own passwords; never committed). CI creates and recovers only a synthetic account in its disposable database |
| Deployment | none |
| Latest CI-verified code commit | P3A code head: `85c2839c079c6b8403e3bef4ee7a183a3be2310d` (push run `35966162924`, both jobs success, incl. the compiled `smoke:directory` and `smoke:p3a` round trips; pull_request run `35966165567` success). P2 R5 remediation: `4b67fff631fa8b51a243fbecd64d43f76ce79d97` (run `35953912083`). P2 at R5: `cbfd640` (run `35948987435`). P1.1: `8fe96ae` (run `35894704102`). P1: `5507726` (run `35885393358`). P0: `0dfc7a5` (run `35863416044`) |
| Initial migration | `20260923103912_initial_schema`, sha256 `b54c36fdaada7bdd31e08558a93d70e9e40fd4c48348681c9c2a124503426515` — still the only migration (P1, P1.1, P2, the R5 remediation and P3A made no schema change) |
| Contract baseline | Wire compatibility `TB-SCHEMA-API-v1.0.0`; PFC wire id `PFC-YT-EMAIL-v1.1`; active Zod source per ADR-0002 (ACCEPTED); generated artefacts unchanged since P0 (`contracts:check` OK). P2 implements 36 directory operations; P3A adds the 4 directory `bindCanonical*` operations (deferred by D2 until sources existed), the 4 source operations and the 9 route operations — 53 business operations routed; mandate operations (P3B) are not routed. No wire change |
| Database image | `mysql:8.4.11@sha256:0744ee5ef89ce6ccfa13de3e579fe6b9e27f93dd70da9c06d2c908b1b193fb8d` on `127.0.0.1:3307` |
| Seed | Disabled synthetic actor `00000000-0000-4000-8000-00000000a0c7`; canonical digest `0ee26dc3ee5f3a1030fb78a6cadaf4dabef1f5a296b58163248584e1e0bfb775` (first PC = CI; unchanged by P1) |
| Toolchain | Node 24.21.0, Yarn 4.18.0, TypeScript 7.0.2, Prisma 7.10.0, Zod 4.6.5, ajv 8.20.0, ajv-formats 3.0.1; P1 adds argon2 0.45.1, react-router 8.4.0, @nestjs/testing 12.0.4, happy-dom 20.14.5 (see `CLAUDE.md`); P2 and P3A add no dependency (lockfile unchanged) |
| Local env | Root `.env` now also needs `TB_SESSION_SECRET` and `TB_ALLOWED_WEB_ORIGINS`; `yarn env:init` adds missing P1 keys (and replaces empty/placeholder P1 values) without touching any other line (first PC: done 2026-09-23) |
| Decisions | ADR-0001 manual MySQL migration semantics (ACCEPTED); ADR-0002 Zod-first contract authoring (ACCEPTED); ADR-0003 single-PC development baseline (ACCEPTED, operator, 2026-09-24); P1 interpretations listed in `P1_AUTH_SHELL.md` §4 (accepted at R4); P2 interpretations in `P2_DIRECTORY.md` §12 (decided at R5); P3A interpretations in `P3A_SOURCES_ROUTE.md` §16 (for R6) |

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
| P3A_CI | PASS for `73fa223` (run 35962967984), `9481bd0` (run 35963513064) and the code head `85c2839` (push run 35966162924; pull_request run 35966165567). `afeb012` / `0c289be` failed CI on a stale `smoke:local` expectation fixed in `73fa223`. The documentation commit's run is reported with R6 |
| P3A_BROWSER | PASS 21/21 — Playwright MCP isolated browser against the compiled API on the disposable `tb_notice_test` (`yarn ui:sandbox`); one copy defect found and fixed (`85c2839`); supplemental to the test suites |
| P3A_NEGATIVE_CONTROLS | PASS 28/28 (every disabled protection failed its responsible suites; files restored byte-identically) |
| R6 review | PENDING (operator) |

Recorded boundaries: a SourceReference is metadata and a pointer, not evidence proof; a canonical binding is an identity/reference binding, not authority; a Route link is not authority; P3A contains no Mandate, MandateVersion, MandateCoverage, CoverageSigner or AuthorityEvent (P3B) and no case data. Session-row and idempotency-record retention cleanup remain DEFERRED and non-blocking (unchanged).

## Next phases (not started)

| Phase | Scope | Gate |
|---|---|---|
| **P3B — Representation authority** | Mandate, MandateVersion, MandateCoverage, CoverageSigner, AuthorityEvent (proposed scope in `P3A_SOURCES_ROUTE.md` §18). Never starts automatically after R6 | R7 |

Cases and all case-specific functions remain later phases. Each phase needs an explicit, approved mission.

## Remaining requirements

1. P0: the second-PC reproduction is deferred by the operator (ADR-0003). If a workstation is added later, it runs `docs/architecture/SECOND_PC_REPRODUCTION_RUNBOOK_v1.md`; only that evidence can change `P0_SECOND_PC` or `P0_TWO_PC_ACCEPTANCE`.
2. P3A: operator review at R6 (including the interpretations in `P3A_SOURCES_ROUTE.md` §16). P3B needs its own explicit mission after R6.
3. A manual Windows-browser sign-in is recorded as `P1_WINDOWS_BROWSER = PASS — OPERATOR_REPORTED` only when the operator reports it.
