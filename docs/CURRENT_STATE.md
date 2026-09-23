# Current engineering state

Observed project engineering state only. Not legal, canonical or case evidence; it does not supersede Drive records, the specifications or the frozen references. Updated at the P0 Windows-browser checkpoint (2026-09-23, first PC).

| Item | State |
|---|---|
| Branches | `bootstrap/p0-local` — the P0 branch; it takes **no P1 application code**. `feature/p1-auth-shell` — P1 work, created from the P0 reproduction baseline once this checkpoint's branch CI succeeds. `main` untouched at `1d4103d` |
| Completed | P0-A, P0-B, P0-C1–C7 (C6 seed delivered in P0-E), P0-D, P0-E (first PC and CI; R3 report delivered 2026-09-23) |
| Current mission | P0 Windows-browser checkpoint (TB_P0_WINDOWS_BROWSER_CHECKPOINT_AND_P1_BRANCH): record the operator-reported Windows-browser result, designate the P0 reproduction baseline, create `feature/p1-auth-shell`. No P1 implementation |
| P0 reproduction baseline | `P0_REPRODUCTION_BASELINE` = the documentation-only commit that records this checkpoint, designated once its branch CI run succeeds. Its SHA is reported with the checkpoint (a commit cannot contain its own SHA); `feature/p1-auth-shell` branches from this commit, and the second-PC reproduction checks it out |
| Not started | P1+ (local admin, sessions/CSRF, business features) |
| External legal actions | 0 |
| Real case data | 0 (synthetic fixtures only) |
| Deployment | none |
| Latest CI-verified code commit | `0dfc7a5497fff67df936d3309fe618831e745c61` — GitHub Actions run `35863416044`, conclusion **success** (both jobs, first attempt). Documentation-only commits since: `f6f5a96` — run `35864210436`, success (both jobs, first attempt); the checkpoint commit's own run is reported with the checkpoint |
| Initial migration | `20260923103912_initial_schema`, sha256 `b54c36fdaada7bdd31e08558a93d70e9e40fd4c48348681c9c2a124503426515` (applied on first-PC test/replay/dev and in CI) |
| Contract baseline | Wire compatibility `TB-SCHEMA-API-v1.0.0`; PFC wire id `PFC-YT-EMAIL-v1.1`; active Zod source per ADR-0002 (ACCEPTED); generated `api-schemas.json`/`openapi.json` byte-identical to the frozen files |
| Database image | `mysql:8.4.11@sha256:0744ee5ef89ce6ccfa13de3e579fe6b9e27f93dd70da9c06d2c908b1b193fb8d` on `127.0.0.1:3307` |
| Seed | Disabled synthetic actor `00000000-0000-4000-8000-00000000a0c7`; canonical digest `0ee26dc3ee5f3a1030fb78a6cadaf4dabef1f5a296b58163248584e1e0bfb775` (first PC = CI) |
| Toolchain | Node 24.21.0, Yarn 4.18.0, TypeScript 7.0.2, Prisma 7.10.0, Zod 4.6.5, ajv 8.20.0, ajv-formats 3.0.1 (see `CLAUDE.md`) |
| Decisions | ADR-0001 manual MySQL migration semantics (ACCEPTED); ADR-0002 Zod-first contract authoring (ACCEPTED) |

## P0 status (see `docs/verification/p0/P0_FINAL_REPORT.md`)

| Scope | Status |
|---|---|
| P0_FIRST_PC | PASS |
| P0_CI | PASS (runs 35863416044 @ `0dfc7a5`, 35864210436 @ `f6f5a96`) |
| P0_WINDOWS_BROWSER | PASS — OPERATOR_REPORTED (first PC, reported 2026-09-23; not automated evidence) |
| P0_SECOND_PC | NOT_RUN |
| P0_OVERALL | NOT_COMPLETE |

## Remaining P0 requirements

1. Second physical PC: clean-clone reproduction of the `P0_REPRODUCTION_BASELINE` commit per `docs/architecture/SECOND_PC_REPRODUCTION_RUNBOOK_v1.md` (P0-26, P0-27), applying the committed migration.
2. Final P0 report update with the second-PC results; P0_OVERALL can only become VERIFIED_COMPLETE after item 1 passes.
