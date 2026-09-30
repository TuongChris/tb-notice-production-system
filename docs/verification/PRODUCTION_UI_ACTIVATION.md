# Production UI activation

Mission: `TB_PRODUCTION_UI_ACTIVATION_AND_STALE_COPY_CLEANUP` (2026-09-30).

Baseline: `origin/main` fetched and verified at
`3d44ba0e4ddf5533742fe2bfd19e7b3ee171d91d`. The checkout was clean before creating
`feature/production-ui-activation` at that exact commit.

## Implemented scope

The protected shell now links to `/production` instead of showing an inert
“Production — Not implemented” item. The lazy-loaded landing page reuses the
existing `listCases` API and `DirectoryList` search, pagination, loading, empty
and error states. Each case row opens its records or its existing Production
Context, Prompts and Candidates pages. Choosing a link is the explicit case
choice; there is no remembered or automatically selected case and no production
context is loaded merely by listing cases.

Unbound cases can inspect their recorded context and gaps. Archived cases retain
read-only history navigation. These links do not calculate eligibility; the
existing pages and server continue to enforce their prerequisites.

The landing page explains the flow through outside drafting, candidate import,
technical validation, separate G1–G6 review, current derived readiness and an
unsigned handoff only when READY_FOR_SIGNER. HomePage describes those implemented
capabilities instead of saying prompts and candidates are unimplemented.

No backend, database schema, migration, API contract, authentication, domain,
authority, evidence, hashing, digest, technical ruleset, readiness or G1–G7
semantics changed. No signing or sending was added. Application User is not a
Signer; technical PASS is not G1–G6 PASS; READY_FOR_SIGNER is not G7 or permission
to send. Actual authorized human adoption, signature and sending remain outside
the application. No UI framework, dependency or endpoint was added.

## Verification executed locally

Node 24.21.0 / Yarn 4.18.0, existing WSL Ubuntu checkout and dependencies.

| Check | Result |
| --- | --- |
| `yarn reference:check` | PASS; both frozen trees and pinned identity intact |
| `yarn contracts:check` | PASS; 3 generated outputs match |
| `yarn typecheck` | PASS |
| `yarn lint` | PASS; 0 warnings, 0 errors |
| `yarn format:check` | PASS |
| `yarn test` | PASS; 1,739 tests, 58 files |
| `yarn vitest run tests/web` | PASS; 217 tests, 16 files |
| `yarn build` | PASS; API and web built, no bundle-size advisory |
| `git diff --check` | PASS |

Three new focused regression tests cover reachable active Production navigation,
removal of obsolete HomePage claims, explicit safety boundaries, exact case IDs
in every workflow link, opening both cases' prompt history without carried state,
unbound/archived history navigation, empty/search states and absence of writes.
The existing shell regression now expects the active Production link. The first
focused run exposed an asynchronous test wait (the old case label was still
visible during lazy navigation); the test now waits for the destination page.

The full web suite retains existing happy-dom FormData diagnostics in unrelated
tests. The new Production tests emit no such diagnostics in the final run.

## Earlier browser and local smoke checkpoint (implementation head)

`yarn smoke:local` refused before any check (0 checks): port 3000 was already in
use. `yarn ui:sandbox --password-file /tmp/tb-ui-sandbox-password` also refused
before startup, with cleanup disarmed. Existing `scripts/local/dev.ts` processes
own ports 3000 and 5173. No browser operation was performed against that dev
database. Browser verification is pending temporary release of those ports;
this is not a browser PASS.

## Verification continuation (2026-09-30)

The operator subsequently authorized temporarily stopping the existing `yarn dev`
session for QA and restoring it afterwards. Starting head:
`ce1bc5df1661f058e0468e05ad65b325ce49821e`. After `git fetch origin`, PR #15 was
OPEN/DRAFT on `feature/production-ui-activation`, local and remote heads matched,
and the working tree was clean. There were no unexpected branch changes.

The recorded dev supervisor was PID 1008209, with API PID 1008279 on 3000 and Vite
PID 1008280 on 5173. SIGINT to that supervisor used its normal child shutdown
handler. Both ports were released. Docker/MySQL was not stopped or reset.

`yarn smoke:local`: **PASS, 73 checks, exit 0**; its processes stopped and both
ports were released. This is independently executed local evidence, separate
from the earlier PR CI.

### Browser observations

The existing `yarn ui:sandbox` ran the compiled API on allowlisted
`tb_notice_test`, with its synthetic user, in an isolated Chrome context.
Fixtures were 26 explicitly synthetic cases, including unbound Alpha and
archived Beta, one PREPARATION prompt and one unsigned candidate for Alpha.
Fixture creation used the existing API, not database edits or real case data.
Fixture setup initially received expected 412/422 refusals for a manually
constructed ETag and an omitted required array; using the returned ETag and
explicit empty `priorBindingIds` corrected the setup. These were not UI defects.

| Area | Observed result |
| --- | --- |
| Authentication | PASS: login form, synthetic login, authenticated shell and API health rendered |
| Navigation | PASS: Production active and reachable at `/production`; correct `aria-current`; obsolete unavailable label absent |
| Overview | PASS: implemented workflow described; User/Signer, technical/G1–G6, READY_FOR_SIGNER/G7/send boundaries retained |
| List/search/paging | PASS: 26 cases paginated 25 + 1; Previous returned 25; Alpha search returned exactly one row; no automatic selection |
| Read-only navigation | PASS: observed list/search/paging requests were GET only; no context/candidate read from listing; later case navigation requests also GET only. Normal authenticated session activity is not a business-record write |
| Exact links | PASS: both Alpha and Beta's Context/Prompts/Candidates links carried their exact case IDs |
| Isolation | PASS: after explicitly reading Alpha's INITIAL/PREPARATION context, Beta's context had no selected task/mode or Alpha result. Beta's histories were empty; Alpha's own prompt/candidate appeared only under Alpha |
| Existing workflow | PASS: opened Alpha's Case, Context, Prompts, Candidates and candidate detail. Technical validation, G1–G6 review record and Readiness remained separate sections |
| Readiness/handoff | PASS: explicit evaluation returned BLOCKED (PREPARATION_MODE, missing validation/context and unassessed gates); no Prepare unsigned handoff control. No Sign, Send, Complete G7 or Mark ready control |
| Archived/incomplete | PASS: Beta labelled Archived — read-only, case detail explained read-only scope, candidate import disabled with restore explanation. Alpha's context truthfully showed five missing items. Landing rows labelled neither case ready |
| Narrow viewport | PASS: actual emulated viewport 390×844; document width 390 on Production and candidate detail; Production table client/scroll width both 358; sidebar wrapped, links remained reachable, no critical horizontal clipping. Screenshot inspected |
| Console | PASS: no browser error/warning messages during the QA flow; no new application diagnostic. An auditor inspection expression lost its temporary page variable after navigation and was corrected; this was a tool-side probe error, not an application console error |

The browser exercised the negative handoff branch, not a fabricated ready case.
The unchanged existing readiness guard and web regressions cover positive
READY_FOR_SIGNER visibility and revalidated handoff behavior. No substantive
review conclusion was entered or automatically filled to obtain a ready result.
No UI defect requiring a code/test change was found.

### Cleanup, restoration and readback

The isolated sandbox tab was closed. SIGINT stopped the sandbox; it exited 0 and
reported `sandbox rows deleted; tb_notice_test is empty again`. Both ports were
released before restoring normal `yarn dev`. The restored API health returned
`ok`, and `http://localhost:5173/` returned the application HTML. No operator
account was changed, no operational data was reset, and no Docker volume,
migration or schema was changed.

Post-QA working tree was still clean. This continuation changes only this
verification document. The final repeat of `reference:check`, `contracts:check`,
`typecheck`, `lint` (0 warnings/errors), `format:check`, `test` (1,739 tests in
58 files), `build` and `git diff --check` passed. Exact resulting SHA and final-head CI run/results are recorded on PR #15
after the commit exists. PR readiness requires those checks and CI to pass;
merging remains outside this mission.

## Review boundary

This is UI integration only. No real-case readiness or legal conclusion follows
from this change. Review the PR and its checks before deciding whether to merge;
this mission does not merge it.

## Post-merge reconciliation (2026-09-30; later authorized mission)

Mission `TB_PR15_MERGE_POST_MAIN_CLOSEOUT_AND_DOCUMENT_RECONCILIATION` explicitly authorized the merge after exact-head guards. Earlier pre-merge and browser-QA sections remain unchanged historical evidence.

- PR [#15](https://github.com/TuongChris/tb-notice-production-system/pull/15): **MERGED**, `2026-09-30T04:43:17Z`, normal merge commit `02a63920ac19ed75e906355b0a20e1c9321aca2d`.
- Reviewed head: `b24789870c254553ba5196f11afb472935e6c857`; implementation head: `ce1bc5df1661f058e0468e05ad65b325ce49821e`.
- Parents: `3d44ba0e4ddf5533742fe2bfd19e7b3ee171d91d` and `b24789870c254553ba5196f11afb472935e6c857`.
- Tree: `b0a547cff2ec61b61718d904dceb2f21155b77ce`, identical to the reviewed head. Feature branch preserved; no squash, rebase, force or bypass.
- Exact merge-head main CI [36670110263](https://github.com/TuongChris/tb-notice-production-system/actions/runs/36670110263): **SUCCESS**. Both **Non-DB checks (cold install)** and **Database, seed and smoke (MySQL 8.4.11)** succeeded; required steps inspected separately from pre-merge CI.

PRODUCTION_UI_ACTIVATION = **MERGED_TO_MAIN · POST_MAIN_CI_VERIFIED**. Presentation/navigation only; no case readiness or legal state changed. Existing sandbox browser evidence above is not substituted for the later final-main/operator-runtime readback. See [the reconciliation ledger](final-audit/POST_MERGE_DOCUMENT_RECONCILIATION_2026-09-30.md).
