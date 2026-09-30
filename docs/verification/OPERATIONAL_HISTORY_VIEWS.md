# Operational defaults with retained history — verification

Mission: `TB_OPERATIONAL_ONLY_DEFAULT_VIEWS_WITH_HISTORY_ACCESS`.

Baseline: `268311581b172b09960b66abe7e6f107e4ca7559`, fetched `origin/main`; the operator checkout was clean. Implementation branch: `feature/operational-history-filters`, isolated checkout. This record does not authorize merge or record acceptance.

## Behaviour

The UI explicitly requests `view=operational`. Routes, LegalSubjects, Mandates and OwnerSubjects offer Operational, History / inactive and All. Omitted API view remains all; direct historical GET-by-ID is unchanged. Predicates run on the server before keyset pagination and LIMIT. Search, agency and owner scope remain combined with the selected view; cursor fingerprints reject cross-view reuse. Switching views, including a round trip, resets the page.

Routes require not archived, LINKED, exact OwnerSubject LINKED, non-archived INDIVIDUAL LegalSubject, and non-archived Agency/Owner. Subjects and Mandates use their own archive state, not document names or corporate suffixes. Owner relationships separate current individual links from inactive/history. Duplicate-link and delete eligibility consider all of that Owner's relationships, independently of the displayed page. Case create/bind selectors request operational Routes. Existing Case and authority guards are unchanged. No record is chosen automatically.

Agency corporate identities remain visible. An unarchived mixed documentary Mandate remains visible even when its label mentions LLC. These projections express operator scope, not legal validity, evidence sufficiency, authority, G1–G7 or readiness.

## Versioning and authorized extension

ADR-0012 / TB-SCHEMA-API-v1.5.0 adds four optional typed query parameters only. The 291 schemas, 145 operations and response/write contracts are unchanged. Earlier release amendments are byte-identical and their artifacts reproduce accepted hashes. The new amendment SHA-256 is `6ba99bdceaf1a3f73ee6bd7f57e416257e5c2bd896c20c7902d9583492f270c8`.

The operator separately authorized the technical ruleset update required by the pinned-identifier invariant: v4 retains v3's vocabulary and adds only the v1.5.0 wire identifier and its own v4 identifier. All 29 rule bodies, kinds, severities, order and aggregation stay the same. API and UI name v4 consistently. No silent extension of v3. Stored v1/v2/v3 runs remain exact historical reads and idempotent replays.

The conservative contract-version policy is preserved: activating v1.5.0 changes current dependency digests and current PromptSnapshot contractVersion. Stale previews require refresh; existing prompts may produce REVIEW_REQUIRED version drift. Current validation/assessment epochs use v4, so previous epochs can require re-evaluation. This is not mandatory re-drafting. The digest algorithm, candidate hashing, authority, readiness and G1–G7 evaluators are unchanged.

## Verification method

- Real HTTP/MySQL tests create only synthetic records through authenticated business APIs in `tb_notice_test`; the existing guarded harness provides infrastructure and cleanup. Five operational and three historical routes are checked across pages, search and agency filters. Unknown views and cross-view cursors are refused. Historical direct reads, current links, mixed Mandates and read-only audit/idempotency counts are verified.
- Web regressions cover defaults/history/all, historical URLs, current relationships, Case options, pagination round trips and duplicate-link eligibility outside the displayed view. The new tests failed before implementation. The pagination and duplicate-choice regressions were separately observed failing before their fixes.
- Current-v4 tests pin all identifiers, verify isolation from a mocked future CONTRACT_BASELINE, and check historical v1/v2/v3 readback. Previous v1.4.0 digest golden is retained alongside v1.5.0.
- Independent read-only code review found a cursor-reset corner case and stale current-version handoff wording; both were corrected and re-reviewed with no remaining actionable findings. Reviewer did not execute tests or access the database.

Private screenshots and database hash inventories stay outside Git; no operational names, IDs, contacts or source content are added to this record.

## Executed results — 2026-09-30

| Check | Result |
|---|---|
| `yarn reference:check` | PASS; 31 + 18 frozen manifest entries unchanged |
| `yarn contracts:check` | PASS; all 3 generated artifacts match |
| `yarn typecheck` | PASS |
| `yarn lint` | PASS; 0 errors, 0 warnings |
| `yarn format:check` | PASS |
| `yarn test` | PASS; 1,749 tests, 60 files |
| Guarded DB runner `node scripts/db/run-db-tests.mjs` | PASS; 638 tests, 17 files, real local MySQL `tb_notice_test`; client/contracts had already been generated/built by required checks |
| Focused new contract/web run | PASS; 8 tests before the additional owner-picker regression; final suite includes all 6 operational-view web tests and all 3 new HTTP/MySQL tests |
| `yarn build` | PASS |
| `yarn smoke:local` | PASS; 73 checks, compiled API/web, shutdown verified |
| `git diff --check` | PASS |

Browser: compiled feature branch served by the guarded `ui:sandbox`, normal synthetic login form, 51 authenticated API fixture/create/readback operations. Routes: 5 operational, 3 Archived/Unlinked history, 8 All. Subjects: 2 operational, 1 archived history. Owner: one current individual relationship and one unlinked historical entity relationship in their separate views. Mandates: 7 current, 2 archived history; mixed documentary labels remain visible. New case: explicit Agency choice offers only its two eligible individual Routes; no Route is preselected. Historical Route, Subject and Mandate direct URLs load their retained records. No case was created in browser QA.

Actual 390×844 mobile emulation checked all new-filter surfaces and New case: document scrollWidth = 390, controls remain available, wide tables scroll inside their existing containers. Desktop Routes screenshot records the five current rows. Page console checks returned 0 errors and 0 warnings. The mobile automation select helper timed out; normal DOM change events exercised the same React controls successfully. Screenshot file-path export was unavailable in the browser tool; returned image bytes were saved in the separate local evidence area.

The operator browser session had expired. As permitted by the mission, feature browser QA used synthetic data instead of requesting/using an operational password. Actual operational records were inspected read-only separately; their count/hash comparison across all 34 tables found **zero changed tables** (489 rows total, secret columns excluded from hashes). No Drive tool was called. No operational record was deleted or rewritten. Both the DB suite and sandbox cleanup returned test business/auth tables to empty; only the existing `_prisma_migrations` infrastructure row remains.

Normal `yarn dev` was restored from the clean operator main checkout at the original baseline. Proxied API health returned `ok`. The feature remains on its review branch, not installed into main or accepted by this record.

## Boundaries

No migration, schema, frozen reference, dependency package/lockfile, Drive mutation, business-data conversion or historical rewrite. No change to authority guards, readiness logic, gate semantics, authentication, signing or sending. G7 remains authorized-human-only and outside the application. Operational database comparison covers row counts and hashes; any ordinary session activity is distinguished from business data. Test-harness fixture cleanup is confined to `tb_notice_test`. The PR must remain unmerged; normal operator runtime is restored from the unchanged main checkout after feature-branch browser QA.

## CI remediation continuation — 2026-09-30

The earlier local results above remain the evidence available at that time. They did **not** include the compiled P4D–P4I chain and did not establish remote CI success.

Starting state was rechecked after fetching origin: PR #17 was open, ready for review and unmerged at `a2cdadd7f040497e0c5c2512a4b9ce6ac04447bf`; the feature checkout was clean. `origin/main` remained `268311581b172b09960b66abe7e6f107e4ca7559`. The operator's normal main runtime was already active.

Direct GitHub job-log evidence:

- PR run [36718912779](https://github.com/TuongChris/tb-notice-production-system/actions/runs/36718912779): Non-DB checks SUCCESS; Database, seed and smoke FAILURE (job `109898694838`).
- Push run [36718816889](https://github.com/TuongChris/tb-notice-production-system/actions/runs/36718816889): Non-DB checks SUCCESS; Database, seed and smoke FAILURE (job `109898376440`).
- Both runs target the exact old head above. Both stopped at P4D with `FAIL INITIAL + PREPARATION, no selection named: the digest must be TB-PRODUCTION-CONTEXT-DIGEST-v2 of its closure and scope` (`FAIL (62 checks)`). P4E–P4I were not reached in those runs.

### Verified cause and narrow correction

The application digest correctly includes the active `CONTRACT_BASELINE` (v1.5.0). The independent P4D oracle still pinned `contract` to v1.4.0, so it hashed a different preimage. P4E also still expected a newly generated PromptSnapshot's `contractVersion` to be v1.4.0. Both current-release expectations now pin v1.5.0. P4D still independently reconstructs the closure/scope preimage and uses the frozen canonical SHA helper; no product implementation or digest definition changed.

Before editing, both failures were reproduced locally against the existing compiled branch: P4D failed at 62 checks with the exact remote message; P4E failed at 49 checks with `INITIAL + PREPARATION: the snapshot must freeze exactly the context read`. Both exited 1. The source delta is exactly one literal in each of `scripts/local/p4d-smoke.ts` and `scripts/local/p4e-smoke.ts`, plus this chronology.

All executable smoke/test occurrences of v1.4.0 and ruleset v3 were inspected, including broader version-string searches. No further stale executable current-active expectation was found. Historical release records and replay/read-back tests, the prior v1.4.0 digest golden, generic stored-epoch fixtures, and retained marker vocabulary remain unchanged. Existing descriptive comments about earlier phases were not mechanically rewritten.

### Local rerun isolation

The compiled CI smokes explicitly require a disposable CI `tb_notice_dev` schema and loopback port 3307. To respect those guards without touching the operator database, the rerun used a separate pinned MySQL 8.4.11 container with tmpfs storage, `network=none` and no published ports. A Node 24.21.0 / Yarn 4.18.0 runner shared only that container's network namespace, with fresh synthetic secrets masking the checkout's operational `.env`. The repository's normal migration, metadata verification, seed and admin bootstrap paths prepared this disposable instance. The guarded DB suite used its `tb_notice_test`; P4D–P4I used its disposable `tb_notice_dev`, the same synthetic account and sequential execution, with no reset between stages. The compiled API/web came from the required fresh build. No smoke guard was bypassed or changed.

### Rerun results at the remediation commit

| Check | Result |
|---|---|
| `yarn reference:check` | PASS; frozen manifests unchanged |
| `yarn reference:helper-tests` | PASS; 27 tests |
| `yarn contracts:check` | PASS; 3 generated artifacts match |
| `yarn typecheck` | PASS |
| `yarn lint` | PASS; 0 errors, 0 warnings |
| `yarn format:check` | PASS |
| `yarn test` | PASS; 1,749 tests, 60 files |
| `yarn build` | PASS |
| `yarn test:db` | PASS; 638 tests, 17 files; guarded isolated `tb_notice_test` |
| `yarn db:verify test --expect-empty` | PASS after the DB suite; 0 domain rows, migration retained |
| `yarn smoke:local` | PASS; 72 checks in the isolated runner; direct MySQL query verified 8.4.11. Docker Compose is unavailable inside this runner, so the script's existing fallback omits its one optional Compose-health check; no source change or guard bypass. The earlier host run had 73 checks. |
| `yarn smoke:p4d` | PASS; 85 checks |
| `yarn smoke:p4e` | PASS; 81 checks |
| `yarn smoke:p4f` | PASS; 88 checks |
| `yarn smoke:p4g` | PASS; 143 checks |
| `yarn smoke:p4h` | PASS; 149 checks |
| `yarn smoke:p4i` | PASS; 205 checks |
| `git diff --check` | PASS |

P4D–P4I completed in that order, exiting 0 in the same disposable database instance. No stage was skipped after P4D. The test runner and disposable MySQL container were removed afterward; their MySQL data lived only in tmpfs. Temporary synthetic credential files were deleted. No operator MySQL volume was reset, removed or mounted into the runner.

The operational DB's before/after read-only inventories were identical across all 34 tables (489 rows; secret columns excluded from hashes). The operator main checkout remained clean at `268311581b172b09960b66abe7e6f107e4ca7559`; its existing normal dev supervisor was never stopped. Its proxied `/api/v1/health` returned `ok`.

This correction does not change product API behavior, the v2 digest algorithm or dependency closure, authority/readiness/G1–G7 semantics, candidate hashing, or any historical record. Historical v1/v2/v3 assertions and v1.4.0 release/golden expectations remain historical, not relabelled. Remote push and PR CI must still be read on the exact new commit after it is pushed; these local rerun results are not a claim of remote success. PR #17 must remain unmerged.
