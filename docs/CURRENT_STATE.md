# Current engineering state

Observed project engineering state only. Not legal, canonical or case evidence; it does not supersede Drive records, the specifications or the frozen references. Updated at P1 review gate R4 (2026-09-23, first PC).

| Item | State |
|---|---|
| Branches | `bootstrap/p0-local` — the P0 branch at the P0 reproduction baseline; it takes **no P1 application code**. `feature/p1-auth-shell` — P1 implementation (this state). `main` untouched at `1d4103d` |
| Completed | P0-A, P0-B, P0-C1–C7, P0-D, P0-E (first PC and CI); P0 Windows-browser checkpoint (operator-reported); **P1 authentication + application shell implemented on the first PC** (`docs/verification/p1/P1_AUTH_SHELL.md`) |
| Current mission | TB_P1_AUTHENTICATION_AND_APP_SHELL_TO_R4 — stopped at review gate R4; the P1 branch CI result is reported with R4 |
| P0 reproduction baseline | `P0_REPRODUCTION_BASELINE` = `b9eea3755a87490636cbb0f2e7aec1a59e15d64c` (documentation-only Windows-browser checkpoint; branch CI run `35873152877` success). `feature/p1-auth-shell` branches from it; the second PC reproduces this commit, not P1 |
| Not started | P2+ (business-directory CRUD and every later feature) — needs explicit approval |
| External legal actions | 0 |
| Real case data | 0 (synthetic fixtures only) |
| Accounts | No real application account exists in any committed or CI artefact. The operator creates the local administrator with `yarn admin:create` (own password; never committed). CI creates only a synthetic account in its disposable database |
| Deployment | none |
| Latest CI-verified code commit | P0: `0dfc7a5497fff67df936d3309fe618831e745c61` (run `35863416044`). P1 branch run: reported with R4 |
| Initial migration | `20260923103912_initial_schema`, sha256 `b54c36fdaada7bdd31e08558a93d70e9e40fd4c48348681c9c2a124503426515` — still the only migration (P1 made no schema change) |
| Contract baseline | Wire compatibility `TB-SCHEMA-API-v1.0.0`; PFC wire id `PFC-YT-EMAIL-v1.1`; active Zod source per ADR-0002 (ACCEPTED); generated artefacts unchanged in P1 (`contracts:check` OK) |
| Database image | `mysql:8.4.11@sha256:0744ee5ef89ce6ccfa13de3e579fe6b9e27f93dd70da9c06d2c908b1b193fb8d` on `127.0.0.1:3307` |
| Seed | Disabled synthetic actor `00000000-0000-4000-8000-00000000a0c7`; canonical digest `0ee26dc3ee5f3a1030fb78a6cadaf4dabef1f5a296b58163248584e1e0bfb775` (first PC = CI; unchanged by P1) |
| Toolchain | Node 24.21.0, Yarn 4.18.0, TypeScript 7.0.2, Prisma 7.10.0, Zod 4.6.5, ajv 8.20.0, ajv-formats 3.0.1; P1 adds argon2 0.45.1, react-router 8.4.0, @nestjs/testing 12.0.4, happy-dom 20.14.5 (see `CLAUDE.md`) |
| Local env | Root `.env` now also needs `TB_SESSION_SECRET` and `TB_ALLOWED_WEB_ORIGINS`; `yarn env:init` adds missing P1 keys (and replaces empty/placeholder P1 values) without touching any other line (first PC: done 2026-09-23) |
| Decisions | ADR-0001 manual MySQL migration semantics (ACCEPTED); ADR-0002 Zod-first contract authoring (ACCEPTED); P1 interpretations listed in `P1_AUTH_SHELL.md` §4 for R4 review |

## P0 status (see `docs/verification/p0/P0_FINAL_REPORT.md`)

| Scope | Status |
|---|---|
| P0_FIRST_PC | PASS |
| P0_CI | PASS (runs 35863416044 @ `0dfc7a5`, 35864210436 @ `f6f5a96`; baseline run 35873152877 @ `b9eea37`) |
| P0_WINDOWS_BROWSER | PASS — OPERATOR_REPORTED (first PC, reported 2026-09-23; not automated evidence) |
| P0_SECOND_PC | NOT_RUN |
| P0_OVERALL | NOT_COMPLETE |

## P1 status (see `docs/verification/p1/P1_AUTH_SHELL.md`)

| Scope | Status |
|---|---|
| P1_FIRST_PC | PASS (automated) |
| P1_CI | reported at R4 |
| P1 manual browser sign-in | NOT_RUN |

## Remaining requirements

1. P0: second physical PC clean-clone reproduction of `P0_REPRODUCTION_BASELINE` per `docs/architecture/SECOND_PC_REPRODUCTION_RUNBOOK_v1.md` (P0-26, P0-27); P0_OVERALL can only become VERIFIED_COMPLETE after it passes.
2. P1: operator review at R4 (including the interpretations in `P1_AUTH_SHELL.md` §4); optional manual Windows-browser sign-in after the operator creates a local administrator.
