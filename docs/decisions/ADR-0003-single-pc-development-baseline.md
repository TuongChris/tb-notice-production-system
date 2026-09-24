# ADR-0003 — Single-PC development baseline; second-PC reproduction deferred by the operator

Status: **ACCEPTED** — 2026-09-24, operator decision recorded with the R5 review result (mission TB_R5_CLOSEOUT_AND_SINGLE_PC_DEVELOPMENT_BASELINE).
Acceptance boundary: this is an engineering / development-topology decision only. It creates no legal or factual authority, no case finding and no readiness state, and it changes no product, domain, contract, database or security rule.
Scope: which workstation development uses, how reproducibility is evidenced, and the status of the P0 second-PC acceptance rows (P0-26, P0-27).
Related: AR-003 (two Windows PCs and WSL), `docs/architecture/P0_BOOTSTRAP_CONTRACT_v1.md` (P0-26/P0-27), `docs/architecture/SECOND_PC_REPRODUCTION_RUNBOOK_v1.md`, `docs/verification/p0/P0_FINAL_REPORT.md`.

## Context

- AR-003 set a two-PC target: two WSL2 Ubuntu installations on two physical Windows PCs, with Git synchronizing source, specifications, fixtures and migrations only.
- P0 was implemented and verified on the first (home) PC and in GitHub Actions. The second-PC clean-clone reproduction (P0-26, P0-27) was never run, so `P0_SECOND_PC` stayed NOT_RUN and `P0_OVERALL` NOT_COMPLETE. P1, P1.1 and P2 were developed on the same PC and verified in branch CI.
- The operator has changed the development strategy: the home PC is the primary development workstation, and the operator may choose not to develop on the second (company) PC.

## Decision

1. **`PRIMARY_DEVELOPMENT_WORKSTATION = HOME_PC`**: the PC recorded as the "first PC" in the P0–P2 evidence. Development continues there.
2. **The second-PC reproduction is `DEFERRED_BY_OPERATOR`.** It was not run and did not pass, and it is not waived as evidence. The original two-PC acceptance (P0-26, P0-27) is **NOT_COMPLETED**, and `P0_OVERALL` is never described as having satisfied the original two-PC acceptance contract.
3. **The single-PC baseline is `VERIFIED`.** The P0 exit checks passed on the home PC and in CI, and the Windows-browser check passed there (operator-reported). Every later phase was verified on the same PC and in branch CI.
4. **GitHub remains the source of truth** for code, branches, committed migrations and CI verification. **Local database volumes are never copied or synchronized through Git**, and no other channel stands in for committed migrations. A workstation's databases are rebuilt from the committed migrations and the synthetic seed.
5. **The runbook is preserved unchanged and stays valid.** If the operator later adds a workstation (the company PC or any other), `SECOND_PC_REPRODUCTION_RUNBOOK_v1.md` is run on a named, CI-verified baseline commit before development starts there. `P0_SECOND_PC` and `P0_TWO_PC_ACCEPTANCE` change only on that evidence.
6. **Nothing else changes.** AR-003's per-workstation rules still apply to the home PC and to any future workstation: WSL2 with the source in the Linux filesystem, LF/UTF-8, loopback-only MySQL on 127.0.0.1:3307, the pinned toolchain and the immutable lockfile. CI remains the independent clean-environment check.

## Status matrix

| Scope | Status |
|---|---|
| P0_FIRST_PC | PASS |
| P0_CI | PASS |
| P0_WINDOWS_BROWSER | PASS — OPERATOR_REPORTED (evidence class unchanged) |
| P0_SECOND_PC | DEFERRED_BY_OPERATOR |
| P0_TWO_PC_ACCEPTANCE | NOT_COMPLETED |
| P0_SINGLE_PC_BASELINE | VERIFIED |
| P0_OVERALL | NOT_COMPLETE against the original two-PC acceptance contract; development continues on the verified single-PC baseline |

## Consequences

- Until another workstation is actually set up, reproducibility beyond the home PC is evidenced only by CI (clean runner, cold install, committed migration, synthetic seed). CI is not a Windows/WSL workstation, so Windows-browser and WSL-specific behaviour is verified on the home PC only.
- The home PC holds the only local development database. That database holds working data only: canonical evidence stays in Google Drive, and the schema is rebuilt from migrations. Local application accounts are created by the operator with the admin CLI on each workstation; they are never copied.
- The one-writer-per-branch rule, the review gates and the CI requirements are unchanged.

## Alternatives considered

- **Record the second PC as PASS on the strength of CI:** rejected. CI is not a second workstation, so the record would be false.
- **Keep blocking development until the second-PC run:** rejected by the operator's topology decision.
- **Retire the runbook:** rejected. It is kept for any future workstation.
