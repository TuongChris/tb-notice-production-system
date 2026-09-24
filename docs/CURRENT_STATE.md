# Current engineering state

Observed project engineering state only. Not legal, canonical or case evidence; it does not supersede Drive records, the specifications or the frozen references. Updated at the start of P2 (2026-09-24 UTC, first PC), after the operator accepted review gate R4.1.

| Item | State |
|---|---|
| Branches | `bootstrap/p0-local` — the P0 branch at the P0 reproduction baseline; it takes **no P1 application code**. `feature/p1-auth-shell` — P1/P1.1, accepted at R4.1, head `8fe96ae`, unchanged since. `feature/p2-directory` — P2 directory work (this state), branched from the accepted P1.1 head `8fe96aea5a30bb01fa24c987e30689f4e6532164`. `main` untouched at `1d4103d` |
| Completed | P0-A, P0-B, P0-C1–C7, P0-D, P0-E (first PC and CI); P0 Windows-browser checkpoint (operator-reported); P1 authentication + application shell (R4 **PASS_WITH_NOTES**, 2026-09-23; `docs/verification/p1/P1_AUTH_SHELL.md`); P1.1 local recovery commands (R4.1 **ACCEPTED**, operator, 2026-09-24; `docs/verification/p1/P1_1_AUTH_RECOVERY.md`) |
| Current mission | TB_P2_DIRECTORY_TO_R5 on `feature/p2-directory` — P2 Directory (Agency, Owner, LegalSubject, OwnerSubject, Signer); stops at review gate R5 |
| R4 decisions (accepted) | Frozen-contract status mapping kept (403 INVALID_CREDENTIALS, 400 login validation/oversized public request); both exact dev origins kept — canonical Windows-browser origin `http://localhost:5173`, `http://127.0.0.1:5173` for WSL tools, cookies are per hostname and never shared; 12 h absolute / 30 min idle; password policy 15–256 code points, NFKC, current Argon2id; session-row retention cleanup DEFERRED (not blocking P2) |
| P2 scope decisions (operator, mission TB_P2_DIRECTORY_TO_R5) | D1 OwnerSubject included; D2 operations needing a SourceReference that the product cannot yet author are DEFERRED to the Source phase (no placeholder sources); D3 "established" Agency/LegalSubject = ACTIVE, canonically bound or referenced by another persisted record; D4 fieldAttributions checks; D5 hard delete only for unused, unbound DRAFT rows; D6 minimal protected Directory pages |
| P0 reproduction baseline | `P0_REPRODUCTION_BASELINE` = `b9eea3755a87490636cbb0f2e7aec1a59e15d64c` (documentation-only Windows-browser checkpoint; branch CI run `35873152877` success). `feature/p1-auth-shell` branches from it; the second PC reproduces this commit, not P1 or P2 |
| Not started | P3+ (Route, Mandate and versions/coverage, Case, SourceReference authoring, correspondence, prompt/candidate production, readiness) — needs explicit approval |
| External legal actions | 0 |
| Real case data | 0 (synthetic fixtures only) |
| Accounts | No real application account exists in any committed or CI artefact. The operator manages local accounts with `yarn admin:create`, `admin:password`, `admin:disable`, `admin:enable` and `admin:revoke-sessions` (own passwords; never committed). CI creates and recovers only a synthetic account in its disposable database |
| Deployment | none |
| Latest CI-verified code commit | P1.1: `8fe96aea5a30bb01fa24c987e30689f4e6532164` (run `35894704102`, both jobs success, verified with `gh run view`). P1: `5507726` (run `35885393358`). P0: `0dfc7a5` (run `35863416044`) |
| Initial migration | `20260923103912_initial_schema`, sha256 `b54c36fdaada7bdd31e08558a93d70e9e40fd4c48348681c9c2a124503426515` — still the only migration (P1 and P1.1 made no schema change) |
| Contract baseline | Wire compatibility `TB-SCHEMA-API-v1.0.0`; PFC wire id `PFC-YT-EMAIL-v1.1`; active Zod source per ADR-0002 (ACCEPTED); generated artefacts unchanged since P0 (`contracts:check` OK) |
| Database image | `mysql:8.4.11@sha256:0744ee5ef89ce6ccfa13de3e579fe6b9e27f93dd70da9c06d2c908b1b193fb8d` on `127.0.0.1:3307` |
| Seed | Disabled synthetic actor `00000000-0000-4000-8000-00000000a0c7`; canonical digest `0ee26dc3ee5f3a1030fb78a6cadaf4dabef1f5a296b58163248584e1e0bfb775` (first PC = CI; unchanged by P1) |
| Toolchain | Node 24.21.0, Yarn 4.18.0, TypeScript 7.0.2, Prisma 7.10.0, Zod 4.6.5, ajv 8.20.0, ajv-formats 3.0.1; P1 adds argon2 0.45.1, react-router 8.4.0, @nestjs/testing 12.0.4, happy-dom 20.14.5 (see `CLAUDE.md`) |
| Local env | Root `.env` now also needs `TB_SESSION_SECRET` and `TB_ALLOWED_WEB_ORIGINS`; `yarn env:init` adds missing P1 keys (and replaces empty/placeholder P1 values) without touching any other line (first PC: done 2026-09-23) |
| Decisions | ADR-0001 manual MySQL migration semantics (ACCEPTED); ADR-0002 Zod-first contract authoring (ACCEPTED); P1 interpretations listed in `P1_AUTH_SHELL.md` §4 (accepted at R4) |

## P0 status (see `docs/verification/p0/P0_FINAL_REPORT.md`)

| Scope | Status |
|---|---|
| P0_FIRST_PC | PASS |
| P0_CI | PASS (runs 35863416044 @ `0dfc7a5`, 35864210436 @ `f6f5a96`; baseline run 35873152877 @ `b9eea37`) |
| P0_WINDOWS_BROWSER | PASS — OPERATOR_REPORTED (first PC, reported 2026-09-23; not automated evidence) |
| P0_SECOND_PC | NOT_RUN |
| P0_OVERALL | NOT_COMPLETE |

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

## Remaining requirements

1. P0: second physical PC clean-clone reproduction of `P0_REPRODUCTION_BASELINE` per `docs/architecture/SECOND_PC_REPRODUCTION_RUNBOOK_v1.md` (P0-26, P0-27); P0_OVERALL can only become VERIFIED_COMPLETE after it passes.
2. P2: implement the Directory on `feature/p2-directory` and stop at review gate R5.
3. A manual Windows-browser sign-in is recorded as `P1_WINDOWS_BROWSER = PASS — OPERATOR_REPORTED` only when the operator reports it.
