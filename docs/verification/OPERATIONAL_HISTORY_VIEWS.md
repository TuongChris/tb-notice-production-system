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
