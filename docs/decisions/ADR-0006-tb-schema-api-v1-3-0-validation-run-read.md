# ADR-0006 — TB-SCHEMA-API-v1.3.0: additive read of one stored ValidationRun

Status: **PROPOSED** — 2026-09-26, with the R14 remediation (mission TB_R14_POST_MERGE_RECONCILE_AND_VALIDATION_RUN_READBACK_REMEDIATION_TO_R14_FINAL), for the operator's review at gate **R14 final**. The change itself was directed by the operator in the R14 review result (PASS_WITH_ONE_CONTRACT_REMEDIATION). That result confirms observation V13 as a contract read-back gap and names the path, the preferred operationId, the response shape, the release identifier and this ADR's number. Until it is accepted, `main` carries the accepted TB-SCHEMA-API-v1.2.0 (ADR-0005); the remediation branch `feature/r14-validation-run-readback` generates v1.3.0.
Acceptance boundary: an engineering contract change only. It creates no legal or factual authority, no finding, no review, no G1–G7 decision and no readiness implication.
Scope: `packages/contracts/src/**` (one schema, one operation, the document version, the release constant), the generated artifacts `packages/contracts/{schemas,openapi}/**`, the release record `docs/contracts/TB-SCHEMA-API-v1.3.0/`, the parity tests `tests/contracts/**`, and the API/UI that implement the read.
Related: ADR-0002 §6 (an intentional wire change needs a new approved baseline: release + ADR), ADR-0004 and ADR-0005 (the releases this one extends and the pattern it follows), API_CONTRACT_v1 §6 (ETags for mutable resources only) and §11 ("Full bodies/manifests are fetched through detail endpoints"), P4G report §29–§30 (V13, the gap).
Verification: P4G report §35 — implemented on `feature/r14-validation-run-readback` (code head `31df6d7`); tests, browser pass, negative controls, regression sweep and CI recorded there and in `docs/verification/p4g/evidence/r14-*`; the R14 result and the P4G merge in §34.

## Context

- **What P4G writes.** `validateCandidate` stores one `ValidationRun` row per run, in one transaction with its `ValidationIssue` rows:
  - the exact `artifactSha256` and `dependencyDigest` it evaluated;
  - the `dependencyManifest` and `evaluatedContextJson` (JSON columns);
  - `rulesetVersion` and `result`;
  - the `coverageManifest`: `requiredRuleIds`, `executedRuleIds`, `notExecutedRuleIds` and `semanticReviewRequired` (always true);
  - the issue counts, `startedAt`, `completedAt`, `createdAt` and `createdById`.
- **Root cause.** TB-SCHEMA-API-v1.0.0 (and v1.1.0, v1.2.0) define `ValidationRun` but return it only in the `201` (and replay) response of `validateCandidate`.
  - `listValidationRuns` returns `ValidationRunSummary`. That is correct: the summary DTO carries no context, manifest or coverage (API_CONTRACT_v1 §11).
  - `listValidationIssues` returns only the issues.
  - API_CONTRACT_v1 §11 says full manifests are fetched through detail endpoints, but the frozen endpoint matrix has none for validation runs.
  - So after a reload the product cannot read back which rules were required, executed and not executed, that semantic review is required, which dependencies were evaluated, or the context as evaluated. The rows are correct in the database, but the historical technical record is incomplete on the wire.
  - The operator confirmed this at R14 as V13.
- **Excluded workarounds.** Parsing AuditEvents (they keep counts and the not-executed ids only), client-side remembered POST responses, querying the database from the UI, uncontracted fields in the summary or the issue list, and rebuilding a run from the current context or by re-running the ruleset.
- **Gate.** ADR-0002 §6, ADR-0004 §7 and ADR-0005 §7: an intentional wire change needs a new approved release + ADR.
  - The accepted v1.1.0 and v1.2.0 records (`docs/contracts/TB-SCHEMA-API-v1.1.0/amendment.json`, `docs/contracts/TB-SCHEMA-API-v1.2.0/amendment.json`) are never edited.
  - The frozen v1.0.0 pack (`docs/reference/**`) is never edited.

## Decision

1. **New release `TB-SCHEMA-API-v1.3.0`** (semantic minor: additive only).
   - It consists of TB-SCHEMA-API-v1.2.0, unchanged (the frozen v1.0.0 reference plus the ADR-0004 and ADR-0005 amendments), plus one reviewed amendment: `docs/contracts/TB-SCHEMA-API-v1.3.0/amendment.json` (sha256 `6b74c09aba024dcf8cb2e0a0c6e374bbce17b45298d2aec83cc2e3ab166a1630`), described in `README.md` there.
   - The record identifies its base by the v1.2.0 record's digest (`b5cae658…c294`) and the digests of the v1.2.0 documents, and records only its own delta.
   - The generated artifacts (`api-schemas.json`, `openapi.json`, `openapi.yaml`) are the release's documents.
2. **The amendment (exact).**
   - **Operation `getValidationRun`** — `GET /validation-runs/{id}`:
     - tag `Validation`; path parameter `id` (uuid, 36 characters); no query parameter;
     - `200` `GetValidationRunResponse`; errors 400/401/403/404/409/413/422/429/500 (those of `getCandidate` and `getPrompt`);
     - security: the session cookie; `x-precondition-target: null`, `x-idempotent-write: false`; no request body.
   - **Schema `GetValidationRunResponse`** = `{ data: ValidationRun, meta: ResponseMeta }`, strict (unknown keys rejected).
     - It is the envelope convention of every read: in v1.2.0 each of the 134 operations with a response body has its own `<OperationId>Response`, and no response schema is shared between operations.
     - It references only the unchanged v1.0.0 `ValidationRun` and `ResponseMeta`, and is the same shape as `ValidateCandidateResponse`, the `201` body of the run's own write.
     - No new semantic schema is added: `ValidationRun` is reused exactly.
   - **Document:** OpenAPI `info.version` 1.2.0 → 1.3.0.
   - **Placement:** the schema follows `ListValidationRunsResponse`; the path follows `/candidates/{candidateId}/validation-runs`; the operation follows `listValidationRuns` and precedes `listValidationIssues`.
3. **Naming** is the mission's and follows the contract's conventions:
   - `getValidationRun` is a `get*` by id, like `getPrompt` and `getCandidate`; it returns one record, not a page.
   - `/validation-runs/{id}` is the collection the frozen `/validation-runs/{id}/issues` already addresses by the run's id.
   - `GetValidationRunResponse` follows the per-operation envelope convention above.
4. **Semantics.**
   - **What it returns.**
     - The run is found only by its id.
     - The response is exactly the stored row as the wire `ValidationRun`, every field unchanged: `id`, `candidateId`, `caseId`, `artifactSha256`, `dependencyDigest`, `dependencyManifest`, `evaluatedContextJson`, `rulesetVersion`, `result`, `coverageManifest`, `blockerCount`, `reviewRequiredCount`, `warningCount`, `startedAt`, `completedAt`, `createdAt`, `createdById`.
     - It is the same mapping as the run's `201` and replay responses.
   - **Historical only: nothing is evaluated again.** The read never:
     - runs TB-TECHNICAL-RULESET-v1 or recomputes the result, the coverage or the counts;
     - rebuilds the current production context or makes a freshness decision;
     - follows a newer authority record or source revision;
     - replaces the stored digest;
     - hides a not-executed rule;
     - derives readiness.

     A later change to the case, its sources, its authority records or the candidate (its supersession included) never alters a stored run: a present-day evaluation is a new run.
   - **What a result means is unchanged.** TECHNICAL_PASS means only: "The configured technical rules executed and found no technical blocker or review-required technical issue under the recorded ruleset."
     - It is never G1–G6, legal approval, proven ownership or permission, valid authority, signer eligibility, READY_FOR_SIGNER, a signature or permission to send.
     - `coverageManifest.semanticReviewRequired` is returned as stored; the frozen `CoverageManifest` makes it the constant `true`.
   - **Issues** are not embedded. They stay with `listValidationIssues`, which is unchanged; a page combines the two reads.
   - **Scope.**
     - Global by id, like `getPrompt` and `getCandidate` (R13 decision 12). An unknown id is `404 NOT_FOUND`.
     - Session-protected: without a session it is `401`, and nothing is read.
     - No case data is copied between runs or cases. The case pages keep case isolation and list only the runs of the candidate they show.
   - **Read only.**
     - No body, no ETag (a run is immutable; API_CONTRACT_v1 §6 gives ETags to mutable resources only), no If-Match and no Idempotency-Key.
     - No write, audit event or idempotency record. The authenticated session's activity touch (P1 global behaviour) is not a change to any run.
   - **Integrity.** The stored JSON columns are returned as stored; nothing is repaired or normalized.
5. **Unchanged.**
   - All 288 schemas and 143 operations of v1.2.0 stay byte-identical and in their order, and so all of v1.1.0 and v1.0.0 do. This includes `ValidationRun`, `ValidationRunSummary`, `CoverageManifest`, `ValidateCandidateResponse` and the three P4G operations, so a strict v1.0.0–v1.2.0 client keeps validating every existing response.
   - `$id` stays `urn:tb:api-contract:v1`. OpenAPI 3.1.1, servers, tags, security, shared parameters and responses are unchanged.
   - `PFC-YT-EMAIL-v1.1` is unchanged.
   - `TB-TECHNICAL-RULESET-v1` is unchanged: no rule's meaning, kind, severity or the inventory changes.
   - `AppMeta.schemaRelease` is unchanged: the unrouted `GET /meta` constant `'TB-SCHEMA-API-v1.0.0'`, kept as recorded (ADR-0004, ADR-0005).
   - The database schema is unchanged (no migration: the run's columns exist since the initial migration).
   - These files are byte-identical:
     - the v1.1.0 release folder: `amendment.json` sha256 `2f4df697…`, `README.md` `4856068f…`;
     - the v1.2.0 release folder: `amendment.json` `b5cae658…`, `README.md` `f18e69d0…`;
     - ADR-0004 (`1c8061c4…`) and ADR-0005 (`f40a8c81…`). Their statements are as of their acceptance.
6. **Generation and parity procedure** (the v1.3.0 form of the ADR-0002 §6 gate).
   - **Workflow (as before).** Only `packages/contracts/src/**` is edited; `yarn contracts:generate` writes the artifacts and `yarn contracts:check` detects drift.
   - **The composition.** `tests/contracts/release.ts` composes a release from the frozen v1.0.0 JSON files and the amendments in release order; each amendment must name the previous release as its base.
   - **What `yarn test` requires** (`tests/contracts/release-v1-3-0.test.ts`, `release-v1-2-0.test.ts`, `release-v1-1-0.test.ts`, `inventory-openapi.test.ts`, `runtime-parity.test.ts`):
     - the v1.3.0 amendment digest and its base identity (the v1.2.0 record digest and the v1.2.0 documents' digests);
     - the v1.2.0 and v1.1.0 documents (JSON Schema, OpenAPI JSON and YAML) reproduced from their compositions to the digests recorded at their acceptance;
     - byte-identity of the generated JSON Schema bundle and OpenAPI JSON with "frozen + v1.1.0 + v1.2.0 + v1.3.0";
     - the committed artifacts, YAML included, equal to the rendered release, with the v1.3.0 digests;
     - the itemized inventory of each of the 284 frozen schemas against the frozen reference, and of each of the 5 additions against its own amendment;
     - each of the 141 frozen, 142 v1.1.0 and 143 v1.2.0 operations unchanged and in order;
     - three-way runtime parity (baseline Ajv, generated Ajv, Zod) for all 289 schemas, plus the 31 frozen fixtures against the frozen bundle itself.
   - **The frozen pack.** `yarn reference:check` verifies the v1.0.0 pack exactly as before.
7. **Later changes.** A later wire change is a new release with its own record and ADR. Once accepted, this amendment record is never edited; its digest is pinned in `tests/contracts/release-v1-3-0.test.ts`.

## Consequences

- **Compatibility: additive only.**
  - No existing operation, path, parameter, schema, required field, enum, format, status code, header, security requirement or error code changed.
  - v1.0.0–v1.2.0 clients keep working unchanged.
  - The new capability is one additional read.
- **The API routes 134 business operations** (P4G's 133 plus this read); every later case operation stays unrouted.
- **Release constants.** `@tb/contracts` exports `CONTRACT_BASELINE = 'TB-SCHEMA-API-v1.3.0'` and `FROZEN_REFERENCE_RELEASE = 'TB-SCHEMA-API-v1.0.0'`.
- **Identifiers that follow the active release** (by the accepted P4D, P4E and P4G designs, unchanged here). Listed for the operator's review:
  - **The P4D dependency digest names the active contract.** TB-PRODUCTION-CONTEXT-DIGEST-v1 hashes `contract: CONTRACT_BASELINE` with the PFC identifier, the scope and the closure. The same unchanged context therefore has another digest when read under v1.3.0 than under v1.2.0. No stored digest (prompt snapshot, validation run) is rewritten.
  - **Prompts name the active release.** A new prompt snapshot records `contractVersion` TB-SCHEMA-API-v1.3.0, and its header line reads "Wire contract: TB-SCHEMA-API-v1.3.0". TB-PROMPT-TEMPLATE-v1 is unchanged: its bytes for a given contract argument are pinned exactly as before (the pin now names its identifier explicitly). A stored snapshot keeps its text: "a later release never rewrites an old snapshot's text" (P4E).
  - **Validating a candidate drafted from an earlier-release prompt** reports the release change, as P4G's `CONTEXT.PROMPT_DRIFT` was designed to do. When every record is unchanged, the rule reports one REVIEW_REQUIRED issue ("the digest's contract or context-schema identifiers differ", change `IDENTIFIERS`), so such a run is REVIEW_REQUIRED rather than TECHNICAL_PASS. The rule itself is unchanged.
  - **`MARKER.INTERNAL_IDENTIFIERS`** scans for the application's identifier strings, which include the active contract identifier; from v1.3.0 that string is `TB-SCHEMA-API-v1.3.0`.
- **Transition check.** `yarn test:transition-baseline` keeps failing by design, as it has since the v1.1.0 edit. It is a historical oracle, not a gate, and is never "fixed".
- **`AppMeta.schemaRelease`** stays open exactly as recorded in ADR-0004.
- **The release record is fixed once accepted.** From R14 final acceptance, `docs/contracts/TB-SCHEMA-API-v1.3.0/amendment.json` (sha256 `6b74c09a…1630`) is a reviewed, pinned release record and is never edited; the same holds for the v1.1.0 and v1.2.0 records.

## Alternatives considered

- **Add the manifests and the coverage to `ValidationRunSummary` or to `listValidationRuns`.**
  - This changes existing schemas, which strict v1.0.0–v1.2.0 validators would reject.
  - It also breaks the summary-DTO rule of API_CONTRACT_v1 §11.
  
  Rejected.
- **Embed the issues in the read (`{ run, issues }`).**
  - It duplicates `listValidationIssues`, whose issues are paged and unbounded in number, and grows the response without bound.
  - The mission excludes it: the detail read does not embed issue rows.
  
  Rejected.
- **A candidate- or case-scoped path** (`/candidates/{candidateId}/validation-runs/{id}`, `/cases/{caseId}/…`). The frozen contract already addresses a run globally by its id (`/validation-runs/{id}/issues`), as `getPrompt` and `getCandidate` do, and the mission prefers `/validation-runs/{id}`. Rejected.
- **A new view schema** (`ValidationRunView`, `ValidationRunDetail`). It would duplicate `ValidationRun` into a second semantic schema; the mission excludes it. Rejected.
- **Annotate the read with present-day state** (a current digest, a "stale" or "current" flag, a re-evaluated result).
  - That is present-day state, not the stored record.
  - Freshness is decided only by recording a new run, against a new read of the current context.
  
  Rejected.
- **AuditEvent parsing, client-remembered POST responses or database queries from the UI.** Excluded by the mission.
- **Keep `CONTRACT_BASELINE` at v1.2.0 while serving v1.3.0**, or give the digest its own contract identifier.
  - The first would make digests, prompts and snapshots name a release that lacks an operation the server serves.
  - The second would change the accepted P4D digest definition.
  
  Rejected; the identifiers follow the active release as designed (Consequences).
- **A full copy of the v1.3.0 artifacts as another frozen pack.** Rejected for the reasons in ADR-0004.
