# Post-merge document reconciliation — 2026-09-30

MISSION: `TB_FINAL_POST_MERGE_DOCUMENT_RECONCILIATION`.

This is an engineering/audit ledger under the operator-authorized mission
`TB_PR15_MERGE_POST_MAIN_CLOSEOUT_AND_DOCUMENT_RECONCILIATION`. It creates no
legal or evidentiary facts and does not widen the accepted audit scope.

## Starting state

The existing home-PC checkout was clean at reviewed PR #15 head
`b24789870c254553ba5196f11afb472935e6c857`; implementation head
`ce1bc5df1661f058e0468e05ad65b325ce49821e` was its ancestor. Fetched main was
`3d44ba0e4ddf5533742fe2bfd19e7b3ee171d91d`. PR #15 was open, ready and mergeable,
with no reviews, unresolved threads or comments. PR CI 36666533596 and push CI
36666530269 both succeeded on that exact reviewed head, both jobs each.

The normal local dev supervisor remained active on loopback during reconciliation;
no operator account, environment file, MySQL data or Docker volume was reset.

## Verified PR #14 facts

Read directly from GitHub again on 2026-09-30:

| Item | Observed value |
| --- | --- |
| PR | [#14](https://github.com/TuongChris/tb-notice-production-system/pull/14), MERGED |
| Head | `ccfd4e83f7d295ceaa420ca2ce09c0438de11baa` |
| Merge | `3d44ba0e4ddf5533742fe2bfd19e7b3ee171d91d` |
| Merged at | `2026-09-29T16:13:47Z` |
| Parents | `abc31fc350311aa21945776ec266ef48935e46c9`, `ccfd4e83f7d295ceaa420ca2ce09c0438de11baa` |
| PR-head CI | [36594712585](https://github.com/TuongChris/tb-notice-production-system/actions/runs/36594712585), SUCCESS, both jobs |
| Exact post-main CI | [36596184655](https://github.com/TuongChris/tb-notice-production-system/actions/runs/36596184655), SUCCESS, both jobs |

Post-main job steps and logs were read: 1,736 tests in 57 files; 635 DB tests
in 16 files; required install, reference, contracts, typecheck, lint, format,
build, migrations, replay, drift, smoke and shutdown steps succeeded. This is
read CI evidence, not a claim that those historical runs were rerun locally.

## Verified PR #15 facts

| Item | Observed value |
| --- | --- |
| PR | [#15](https://github.com/TuongChris/tb-notice-production-system/pull/15), MERGED |
| Reviewed head | `b24789870c254553ba5196f11afb472935e6c857` |
| Merge | `02a63920ac19ed75e906355b0a20e1c9321aca2d` |
| Merged at | `2026-09-30T04:43:17Z` |
| Parents | `3d44ba0e4ddf5533742fe2bfd19e7b3ee171d91d`, `b24789870c254553ba5196f11afb472935e6c857` |
| Tree | `b0a547cff2ec61b61718d904dceb2f21155b77ce`, identical to the reviewed head |
| Exact post-main CI | [36670110263](https://github.com/TuongChris/tb-notice-production-system/actions/runs/36670110263), SUCCESS |
| Non-DB checks (cold install) | SUCCESS |
| Database, seed and smoke (MySQL 8.4.11) | SUCCESS |

Normal merge commit with exact-head matching; feature branch preserved. No squash,
rebase, force push or bypass. All required steps succeeded: immutable install,
references/helper tests, contracts, typecheck, lint, format, 1,739 tests in 58 files,
build, migration metadata, DB tests, replay/no pending migration, seed idempotence,
drift checks, smoke:local, P1 through P4I smoke, recovery, clean shutdown and frozen
reference/working-tree checks. The failure-only MySQL diagnostics step was skipped.
CI observations are separate from the previously recorded local/browser QA.

## Mutations and files reconciled

Documentation branch: `docs/post-merge-reconciliation-20260930`, based on exact
main `02a63920ac19ed75e906355b0a20e1c9321aca2d`, created only after its CI succeeded.

- `README.md`: replace the obsolete P0 development status with the bounded local-first status.
- `CLAUDE.md`: current handoff, verified PR14/PR15 state and evidence pointers.
- `docs/CURRENT_STATE.md`: current integration/UI state; explicitly label earlier mission checkpoints as history.
- `docs/verification/final-audit/FINAL_ENGINEERING_AUDIT_CLOSEOUT.md`: current merge/CI table and dated §19; retain historical pre-merge §17–§18.
- `docs/verification/final-audit-remediation/FINAL_AUDIT_REMEDIATION_AUD015_AUD020.md`: later-recorded merge status in §22; retain §1–§21 history.
- `docs/verification/p4h/P4H_CANDIDATE_ASSESSMENT.md`: later acceptance table now records the merged correction.
- `docs/verification/p4i/P4I_READINESS_UNSIGNED_EXPORT.md`: later acceptance table now records the merged corrections.
- `docs/verification/PRODUCTION_UI_ACTIVATION.md`: append actual merge/main CI; preserve pre-merge/browser evidence.
- This ledger.

No source, tests, runtime, API, contract, schema, migration, package or lockfile is
changed. No semantics of authentication, evidence, authority, hashing, digest,
technical ruleset, readiness, G1–G6 or G7 is changed.

## Verification and provenance

Searches preceded editing. Historical PENDING values and the old P4D navigation
description remain explicitly historical; no global replacement was performed.
The source diff was reviewed for intended documentation-only changes and
historical accuracy; `git diff --check` passed. Locally executed `reference:check`,
`contracts:check`, `typecheck`, `lint`, `format:check`, `test` and `build` all passed
(1,739 tests in 58 files; lint 0 warnings/errors). No DB suite was rerun locally
for this documentation delta. The reconciliation PR's exact head/merge CI is
recorded after execution on that PR and in the final operational readback; this
source commit does not preclaim its own future merge or CI.

## Current engineering status and boundaries

- FINAL_ENGINEERING_AUDIT = **PASS**: the accepted bounded re-audit, not a new whole-repository review.
- SYSTEM_SETUP_STATUS = **VERIFIED_COMPLETE · ACCEPTED_SINGLE_PC_ENGINEERING_SCOPE · MERGED_TO_MAIN**.
- PRODUCTION_UI_ACTIVATION = **MERGED_TO_MAIN · POST_MAIN_CI_VERIFIED**.
- CASE_READINESS_STATUS remains **CASE-SPECIFIC**; no new real case evaluated.
- OWNER_STATUS remains **OWNER-SPECIFIC / NOT GLOBALLY ASSERTED**.
- G7 remains **AUTHORIZED_HUMAN_ONLY · NOT_IMPLEMENTED**.
- EXTERNAL_ACTION_STATUS = **NO EXTERNAL ACTION AUTHORIZED OR PERFORMED BY THIS ENGINEERING RECONCILIATION**.
- Second-PC reproduction remains **DEFERRED_BY_OPERATOR**.
- No legal/evidentiary facts were created; no public deployment, signing, sending,
  submission, uploader contact or AS_SENT creation occurred.

After this documentation PR's exact post-main CI, the existing home-PC checkout
must be synchronized with final main, DB metadata verified read-only, and normal
dev runtime restored and checked from Windows/browser. Those later observations
belong to the final operational readback; the earlier sandbox QA is not a substitute.
The recommended next mission is `TB_FIRST_CONTROLLED_REAL_CASE_INGESTION`, requiring
its own authorization and not started by this mission.
