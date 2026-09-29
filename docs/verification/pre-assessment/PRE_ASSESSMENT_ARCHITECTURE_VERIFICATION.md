# Pre-assessment architecture — verification (home PC)

Mission **TB_PRE_ASSESSMENT_AUD005_AUD006_ARCHITECTURE** (operator, 2026-09-28): the architecture and contract design of R14-AUD-005 and R14-AUD-006 only.

- Branch `feature/pre-assessment-aud005-aud006-architecture`, created from the exact `main` `20367b92c1ff81415ffa639ddf238ccad1d6b218`.
- Documentation only. No pull request, no merge.
- This record verifies the mission's own claims. It is not the independent review, which decides whether the findings are closed.

## 1. Maximum claims of this mission

| Scope | Status |
|---|---|
| R14 | **PASS** (unchanged; not reopened) |
| P4G | **VERIFIED_COMPLETE**, **MERGED_TO_MAIN** (PR #11, merge commit `20367b9`; `P4G_TECHNICAL_VALIDATION.md` §40) |
| `MAIN_POST_R14_CI` | **PASS** — run 36399587944, both jobs, logs read |
| R14-AUD-005 | **DESIGN_PROPOSED_PENDING_INDEPENDENT_REVIEW** (ADR-0008) |
| R14-AUD-006 | **DESIGN_PROPOSED_PENDING_INDEPENDENT_REVIEW** (ADR-0009) |
| ADR-0008 | **PROPOSED** |
| ADR-0009 | **PROPOSED** |
| TB-SCHEMA-API-v1.4.0 | **PROPOSED FUTURE DELTA ONLY — NOT ACTIVE** |
| CandidateAssessment | **NOT_STARTED**, **HOLD** (unrouted) |
| External action | **NONE**; real case data **0** |

## 2. Pre-flight (mission §2)

Measured 2026-09-28, after `git fetch origin`:

- `origin/main` = `20367b92c1ff81415ffa639ddf238ccad1d6b218`, the expected SHA.
- The worktree was clean; no pull request was open.
- `gh` was authenticated as the repository owner's account (scopes `repo`, `workflow`, `read:org`, `gist`).
- Run 36399587944 on `20367b9`: success, both jobs.
- The new branch was created from `origin/main` with `git switch -c`. Its accidental upstream `origin/main` was removed before any push. It was first pushed with its own upstream, after the first commit.

## 3. First task — R14 merge reconciliation (mission §4)

Verified independently with `git` and authenticated `gh`, and recorded in `P4G_TECHNICAL_VALIDATION.md` §40:

| Fact | Result |
|---|---|
| PR | #11, MERGED at 2026-09-28T08:48:34Z by the repository owner's account |
| PR head | `f1b6aafbb95a3042d55865f7eb0fc3991dc444b6` |
| Merge commit | `20367b92c1ff81415ffa639ddf238ccad1d6b218` |
| Parents | `c73cbda` and `f1b6aaf`; a normal merge commit |
| Tree | `4cffdbfc…` identical to `f1b6aaf`'s |
| Ancestry | `f1b6aaf` and `c889e63` ancestors of `origin/main` |
| Closeout CI | Push run 36397635020 and pull_request run 36398531959, both jobs success |
| Post-merge CI | Run 36399587944, both jobs success, logs read: `yarn test` 1580 / 52; `yarn test:db` 548 / 14; `db:verify` PASS ×4; both drift diffs "-- This is an empty migration."; every compiled smoke with its recorded count; `yarn dev` shutdown 4 / 4; 0 error annotations |

- The reconciliation commit is `b39842a` ("docs(r14): reconcile PR 11 merge and main CI"), touching `CLAUDE.md`, `docs/CURRENT_STATE.md` and the P4G record.
- Its CI, push run [36421333294](https://github.com/TuongChris/tb-notice-production-system/actions/runs/36421333294) (2026-09-28T12:21:44Z–12:29:57Z), succeeded on both jobs, logs read:
  - "Non-DB checks (cold install)" (job 108924520888): the reference check and the 27 helper tests; `contracts:check` OK; lint "Found 0 warnings and 0 errors."; Prettier clean; `yarn test` 1580 / 52 files.
  - "Database, seed and smoke (MySQL 8.4.11)" (job 108924520493): `yarn test:db` 548 / 14 files; the replay has no pending migration; both drift diffs empty; `smoke:local` 62, `smoke:auth` 4, `smoke:directory` 14, `smoke:p3a` 24, `smoke:p3b` 36, `smoke:p4a` 50, `smoke:p4b` 64, `smoke:p4c` 62, `smoke:p4d` 88, `smoke:p4e` 84, `smoke:p4f` 90, `smoke:p4g` 146; `yarn dev` shutdown 4 / 4.
  - 0 error annotations.

## 4. Deliverables

| Record | Path | Commit |
|---|---|---|
| R14 merge reconciliation | `docs/verification/p4g/P4G_TECHNICAL_VALIDATION.md` §40 (+ header and status rows), `docs/CURRENT_STATE.md`, `CLAUDE.md` | `b39842a` |
| ADR-0008 (PROPOSED) — R14-AUD-005 | `docs/decisions/ADR-0008-candidate-assessment-freshness-current-dependency-epoch.md` | `4f47f81` |
| Principal design record | `docs/architecture/PRE_ASSESSMENT_AUD005_AUD006_ARCHITECTURE.md` (§1–§20, Appendices A–D: traceability, readiness preconditions, open decisions and observations, files reviewed) | `4f47f81` |
| ADR-0009 (PROPOSED) — R14-AUD-006 | `docs/decisions/ADR-0009-candidate-assessment-support-rows-additive-historical-read.md` | `5221135` |
| Inactive wire proposal | `docs/proposals/TB-SCHEMA-API-v1.4.0-assessment-support-readback.md`, `docs/proposals/README.md` | `5221135` |
| This record and the state | `docs/verification/pre-assessment/PRE_ASSESSMENT_ARCHITECTURE_VERIFICATION.md`, `docs/CURRENT_STATE.md`, `CLAUDE.md` | the commit that adds this record |

**Decisions in brief.**

- **AUD-005: Model A**, closure-only clearance.
  - The epoch `E = (candidateId, artifactSha256, dependencyDigest, rulesetVersion)`.
  - `PLAN.SOURCE_IN_CONTEXT` REVIEW_REQUIRED is non-waivable.
  - Recording is not counting.
  - No technical-review override; the readiness baseline is TECHNICAL_PASS.
  - No persistence, wire or migration change.
- **AUD-006:** `getCandidateAssessmentSources` — `GET /candidates/{candidateId}/assessments/{id}/sources` → `{assessmentId, sources: AssessmentSource[1..100]}`.
  - Ascending `(createdAt, id)`.
  - 404 alike for foreign or unknown assessments; 500 on an integrity breach.
  - Read-only; storage sufficient.
  - The expected future inventory is 291 schemas, 145 operations, 100 paths.

## 5. Diff safety check (mission §48)

`git diff --stat 20367b9..HEAD` and `git diff --name-only 20367b9..HEAD` over the complete branch, before this record's commit:

- **Changed:** `CLAUDE.md`, `docs/CURRENT_STATE.md` and `docs/verification/p4g/P4G_TECHNICAL_VALIDATION.md`.
- **New:** the two ADRs, the design record and the two proposal files. 8 files, 1104 insertions and 18 deletions.
- **Outside `CLAUDE.md` and `docs/`: none.**
  - `git diff --name-only 20367b9..HEAD -- packages apps tests scripts yarn.lock package.json docs/contracts docs/reference .github` is empty.

| Delta | Expected | Observed |
|---|---|---|
| Production code (`apps/**`) | none | none |
| Active contract source (`packages/contracts/src/**`, including `core.ts` and `operations.ts`) | none | none (sha256 of `core.ts`, `operations.ts` and `index.ts` unchanged) |
| Generated artifacts | none | none: `api-schemas.json` `5868d90e…`, `openapi.json` `3743fba3…`, `openapi.yaml` `ad80e8ad…`, equal to v1.3.0's `result.files` |
| Prisma schema | none | none (`schema.prisma` sha256 `5b9b1ce5…` unchanged) |
| Migrations | none | none: one migration, `20260923103912_initial_schema` (sha256 `b54c36fd…6515`) |
| Accepted release records | none | none: v1.1.0 `2f4df697…da85`, v1.2.0 `b5cae658…c294`, v1.3.0 `6b74c09a…1630` and their READMEs unchanged |
| ADR-0001 … ADR-0007 | none | byte-identical |
| Tests and scripts | none | none; no `release-v1-4-0` test exists |
| Lockfile | none | unchanged |
| `docs/reference/**` | none | untouched (`yarn reference:check` OK) |

Method: the sha256 of every file above, and the identifier constants, were recorded before the first architecture record and again after the last. The sorted lists are identical.

## 6. Contract and identifiers (mission §43–§44)

- **`CONTRACT_BASELINE` = `TB-SCHEMA-API-v1.3.0`** (`packages/contracts/src/index.ts:15`), unchanged.
- **Inventory** measured on the committed `openapi.json`: `info.version` 1.3.0, **289 schemas, 144 operations, 99 paths**, unchanged.
  - Of the proposed additions: `AssessmentSource` already exists; `CandidateAssessmentSourcesView`, `GetCandidateAssessmentSourcesResponse` and the path `/candidates/{candidateId}/assessments/{id}/sources` do not exist.
- **No v1.4.0 artefact exists** except the proposal document: no `docs/contracts/TB-SCHEMA-API-v1.4.0/`, no `amendment.json`, no contract source, generated output, release test or route.
- **Identifiers, unchanged:**

| Kind | Identifier | Where |
|---|---|---|
| Wire contract | `TB-SCHEMA-API-v1.3.0` | `CONTRACT_BASELINE` |
| Frozen reference | `TB-SCHEMA-API-v1.0.0` | `FROZEN_REFERENCE_RELEASE` |
| Production form contract | `PFC-YT-EMAIL-v1.1` | `PFC_SCHEMA_VERSION` |
| Production-context digest | `TB-PRODUCTION-CONTEXT-DIGEST-v2` | `DEPENDENCY_DIGEST_ALGORITHM` |
| Technical ruleset | `TB-TECHNICAL-RULESET-v2` | `TECHNICAL_RULESET_VERSION` |
| Prompt template | `TB-PROMPT-TEMPLATE-v1` | `PROMPT_TEMPLATE_VERSION` |
| Candidate artifact | `TB-CANDIDATE-ARTIFACT-v1` | `ARTIFACT_ALGORITHM` |

None is a legal approval, a G1–G6 review, readiness or READY_FOR_SIGNER.

## 7. Checks (mission §47)

- **Per commit.** Before each of the four commits, the complete tree passed:
  - `yarn reference:check`, `yarn contracts:check`, `yarn typecheck`, `yarn lint`, `yarn format:check`, `yarn test`;
  - lint also through `yarn oxlint --deny-warnings --format default`.
- **Final run.** On the tree of this record's commit, before this record was written (2026-09-28T12:53:06Z–12:54:07Z):
  - `yarn reference:check` OK (`MANIFEST.sha256` `42c2a419…` matches the pin);
  - `yarn contracts:check` OK ("3 generated outputs match the active source");
  - `yarn typecheck` exit 0;
  - `yarn lint` exit 0; `oxlint --deny-warnings --format default`: "Found 0 warnings and 0 errors." (331 files) — **0 warnings**;
  - `yarn format:check`: "All matched files use Prettier code style!" (`docs/` is outside Prettier's scope by `.prettierignore`; `CLAUDE.md` is inside it and clean);
  - `yarn test`: **1580 / 1580 in 52 files**, unchanged.
- **Gate-terminology guard.** `tests/tooling/gate-terminology.test.ts`, which scans every active `docs/**/*.md`, passed 3 / 3 with the new records in place, also run on its own.
- **Not run locally: `yarn test:db`.** No code changed, and no source claim needed a database run. It runs in CI on the pushed head, with every compiled smoke.
- Repeated after this record was written, with the same results.

## 8. Branch CI

- The reconciliation commit's run is in §3.
- The final head of this branch is pushed with the documentation commits after it. Its run cannot be recorded inside the commit it tests. It is reported with the mission's final report, and by the next mission's reconciliation, as for earlier closeout heads.

## 9. Warnings and open items for the review (not decided here)

The design record's Appendix C lists them:

- the open decisions D-1 … D-6: capture on superseded candidates, cross-epoch supersession, non-PASS citations of non-applicable sources, DOCUMENT_REVIEWED from an AI-assisted performer, support-less negative findings, and the G6 disposition of technical REVIEW_REQUIRED issues;
- the warnings W-1 … W-3: the v1.4.0 activation changes every digest and needs a technical-ruleset decision; the baseline needs a new prompt and candidate after any context change; the wording of `PLAN.SOURCE_IN_CONTEXT`;
- the observations O-1 … O-5, including that `PLAN.SOURCE_APPLIES` stores the other owner's id in its issue details.

## 10. Recommended next action

**Independent Astra review of the pre-assessment architecture** (recommended mission TB_ASTRA_PRE_ASSESSMENT_AUD005_AUD006_ARCHITECTURE_REVIEW). It decides:

- whether AUD-005 is closed by Model A;
- whether the AUD-006 read-back is complete;
- whether the proposed v1.4.0 is minimal and additive;
- whether current storage is sufficient and no migration is required;
- whether CandidateAssessment implementation may begin.

Not implementation.

## 11. After this mission — operator fast-track acceptance and P4H (2026-09-28/29)

The statuses in §1–§10 are those of this mission. What followed:

- **Branch CI of this mission's final head.** `5afd2ec` — push run 36425099649, both jobs success (status read with `gh` by the P4H mission; reported here as §8 said it would be).
- **The recommended independent review did not take place.** The operator chose a fast track (mission TB_P4H_CANDIDATE_ASSESSMENT_FAST_TRACK_IMPLEMENTATION): the architecture at `5afd2ec` was accepted for implementation and the independent Astra review was **deferred by the operator**. Nothing of this architecture is independently verified.
- **Decisions.** ADR-0008 and ADR-0009 **ACCEPTED_BY_OPERATOR · INDEPENDENT_REVIEW_DEFERRED**; the open decisions D-1…D-6 (§9) are resolved in ADR-0008 "Operator acceptance". Warning W-1 (the v1.4.0 activation and the technical ruleset) is decided by **ADR-0010** (`TB-TECHNICAL-RULESET-v3`, ACCEPTED_BY_OPERATOR · INDEPENDENT_REVIEW_DEFERRED). W-2 and W-3 stay open for the readiness phase; O-2 (`q` semantics) is designed and O-4/O-5 are implemented as service checks by P4H; O-1 and O-3 stay backlog.
- **Contract.** TB-SCHEMA-API-v1.4.0 is **activated** exactly as proposed (`docs/contracts/TB-SCHEMA-API-v1.4.0/`, amendment sha256 `fb6b14a9…5c85`; 291 schemas, 145 operations, 100 paths); the proposal file is kept as the historical design text.
- **Findings.** R14-AUD-005 and R14-AUD-006 **IMPLEMENTED_SELF_VERIFIED · INDEPENDENT_REVIEW_DEFERRED**; CandidateAssessment **IMPLEMENTED_FOR_CAPTURE_AND_HISTORY** (`docs/verification/p4h/P4H_CANDIDATE_ASSESSMENT.md`). No migration or schema change was needed (the storage conclusion of the design record held).
- Readiness, READY_FOR_SIGNER and the unsigned export stay **NOT_STARTED**; G7 stays human and outside the application.
