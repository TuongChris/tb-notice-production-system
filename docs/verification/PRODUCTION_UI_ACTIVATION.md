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

## Browser and local smoke checkpoint

`yarn smoke:local` refused before any check (0 checks): port 3000 was already in
use. `yarn ui:sandbox --password-file /tmp/tb-ui-sandbox-password` also refused
before startup, with cleanup disarmed. Existing `scripts/local/dev.ts` processes
own ports 3000 and 5173. No browser operation was performed against that dev
database. Browser verification is pending temporary release of those ports;
this is not a browser PASS.

## Review boundary

This is UI integration only. No real-case readiness or legal conclusion follows
from this change. Review the PR and its checks before deciding whether to merge;
this mission does not merge it.
