# TB-SCHEMA-API-v1.3.0 — additive contract release

| | |
|---|---|
| Release | **TB-SCHEMA-API-v1.3.0** — additive (semantic minor) |
| Base | **TB-SCHEMA-API-v1.2.0** (`docs/contracts/TB-SCHEMA-API-v1.2.0`, ADR-0005, accepted at R9 final; record sha256 `b5cae658…c294`), which is TB-SCHEMA-API-v1.1.0 plus its amendment, itself the frozen TB-SCHEMA-API-v1.0.0 reference plus its amendment. The frozen pack `docs/reference/database-api-v1/TB_DATABASE_SCHEMA_API_CONTRACT_v1` is never edited. |
| Decision | `docs/decisions/ADR-0006-tb-schema-api-v1-3-0-validation-run-read.md` — **PROPOSED** (R14 remediation), for the operator's review at gate R14 final |
| Recorded | 2026-09-26, R14 remediation (mission TB_R14_POST_MERGE_RECONCILE_AND_VALIDATION_RUN_READBACK_REMEDIATION_TO_R14_FINAL) |
| Record | `amendment.json` (this folder), sha256 `6b74c09aba024dcf8cb2e0a0c6e374bbce17b45298d2aec83cc2e3ab166a1630` |
| Verification | `docs/verification/p4g/P4G_TECHNICAL_VALIDATION.md` §34 (R14 result and merge reconciliation) and §35 (R14 remediation; evidence `docs/verification/p4g/evidence/r14-*`) |

The wire contract of this release is TB-SCHEMA-API-v1.2.0, unchanged, plus exactly the amendment recorded here. The generated artifacts `packages/contracts/schemas/api-schemas.json` and `packages/contracts/openapi/openapi.{json,yaml}` are the release's documents. Their digests are in `amendment.json` (`result.files`).

The record names its base by the digest of the v1.2.0 record (`base.amendmentSha256`) and the digests of the v1.2.0 documents (`base.files`, equal to that record's `result.files`). The tests reproduce those documents from "frozen + v1.1.0 + v1.2.0" to exactly those digests.

`PFC-YT-EMAIL-v1.1` (the production-form wire identifier) and `TB-TECHNICAL-RULESET-v1` (the technical ruleset, an implementation identifier) are unrelated and unchanged.

## Why

`validateCandidate` stores one `ValidationRun` per run: the exact artifact SHA-256 and dependency digest it evaluated, the dependency manifest, the evaluated context, the ruleset, the result, the coverage manifest (required, executed and not-executed rule ids; `semanticReviewRequired`), the issue counts and the times.

TB-SCHEMA-API-v1.2.0 returns that record only in the run's `201` (and replay) response:

- `listValidationRuns` returns summaries (API_CONTRACT_v1 §11);
- `listValidationIssues` returns only the issues.

So after a reload the product could not show a run's coverage manifest, dependency manifest or evaluated context. This was observation V13, confirmed at R14 as the one contract remediation. AuditEvent parsing, client-remembered POST responses, database queries from the UI, uncontracted fields in the summary or issue list, and rebuilding a run from present-day state are excluded.

## The exact change

| Item | Addition |
|---|---|
| Operation | `getValidationRun` — `GET /validation-runs/{id}`; tag `Validation`; path `id` (uuid); no query parameter; `200` `GetValidationRunResponse`; errors 400/401/403/404/409/413/422/429/500 (those of `getCandidate` and `getPrompt`); session cookie; `x-precondition-target: null`; `x-idempotent-write: false`; no request body |
| Schema | `GetValidationRunResponse` — `{ data: ValidationRun, meta: ResponseMeta }`, strict; the same shape as `ValidateCandidateResponse` |
| Document | OpenAPI `info.version` 1.2.0 → 1.3.0 |

The schema is inserted after `ListValidationRunsResponse`, and the path after `/candidates/{candidateId}/validation-runs`, so it precedes `/validation-runs/{id}/issues`. No new semantic schema is added: the unchanged v1.0.0 `ValidationRun` is the response's `data`. The envelope follows the contract's convention: every operation with a body has its own `<OperationId>Response` (ADR-0006 §2–§3).

**What the read means.** "This is the exact ValidationRun recorded for this id." Every stored field is returned unchanged:

- the artifact SHA-256 and the dependency digest;
- the dependency manifest and the evaluated context;
- the ruleset, the result and the coverage manifest;
- the counts and the times.

**What it never does.** It never:

- runs the technical ruleset again or recomputes the result, the coverage or the counts;
- rebuilds the current production context;
- follows a newer authority record or source revision;
- replaces the stored digest;
- hides a not-executed rule;
- derives readiness.

A later change to the case or the candidate (its supersession included) never alters a stored run.

**What a result never means.** TECHNICAL_PASS means only: "The configured technical rules executed and found no technical blocker or review-required technical issue under the recorded ruleset." It is not:

- G1–G6 or legal approval;
- proven ownership or permission, valid authority or signer eligibility;
- READY_FOR_SIGNER, a signature, or permission to send.

`semanticReviewRequired` is returned as stored (always `true`).

**Scope.** The read is global by id, like `getPrompt` and `getCandidate`; an unknown id is `404`. It is read-only:

- no ETag (a run is immutable);
- no If-Match or Idempotency-Key;
- no write and no audit event.

The issues stay with `listValidationIssues`.

## Unchanged

All 288 schemas and 143 operations of v1.2.0 stay byte-identical and in their order, and so do the 286 schemas and 142 operations of v1.1.0 and the 284 schemas and 141 operations of v1.0.0. This includes `ValidationRun`, `ValidationRunSummary`, `CoverageManifest`, `ValidateCandidateResponse` and the three P4G operations. So do:

- `$id` `urn:tb:api-contract:v1`, OpenAPI 3.1.1, servers, tags and security;
- shared parameters and responses;
- `PFC-YT-EMAIL-v1.1` and `TB-TECHNICAL-RULESET-v1`;
- `AppMeta.schemaRelease` — the unrouted `GET /meta`; left as recorded (ADR-0004, ADR-0005, ADR-0006);
- the database schema (no migration);
- the v1.1.0 and v1.2.0 release folders and ADR-0004 and ADR-0005 (byte-identical).

## Compatibility

Additive only. No existing operation, path, parameter, schema, required field, enum, format, status code, header, security requirement or error code changed. v1.0.0–v1.2.0 clients keep working unchanged, and every existing response still validates against their schemas.

The identifiers that name the active release follow it, as the accepted P4D, P4E and P4G designs define (ADR-0006, Consequences):

- the P4D dependency digest;
- a new prompt snapshot's `contractVersion` and header line;
- the internal identifier strings scanned by the technical ruleset.

Stored digests, prompts and runs are never rewritten.

## Generation and parity procedure

1. **Edit and generate.** Edit only the active source `packages/contracts/src/**`, then run `yarn contracts:generate` (writes the three artifacts) and `yarn contracts:check` (fails on drift and never repairs).
2. **`yarn test`** pins the release:
   - `tests/contracts/release-v1-3-0.test.ts`:
     - this amendment's digest and its base identity (the v1.2.0 record digest and documents);
     - generated JSON Schema bundle and OpenAPI JSON byte-identical to "frozen v1.0.0 + v1.1.0 + v1.2.0 + v1.3.0", as composed by `tests/contracts/release.ts`;
     - the committed artifacts (YAML included) equal to the rendered release, with its digests;
     - additivity over v1.2.0, v1.1.0 and v1.0.0: every schema and operation unchanged and in place, and nothing beyond this amendment;
     - the added read is by id, read-only, not a list, and returns the unchanged `ValidationRun` in the envelope of the run's own write, with no new semantic schema and no current, re-evaluated, readiness or G1–G6 field.
   - `tests/contracts/release-v1-2-0.test.ts` and `release-v1-1-0.test.ts`: the accepted records, unchanged, still reproduce their documents to the digests recorded at acceptance, and their additions are unchanged in the active contract.
   - `tests/contracts/inventory-openapi.test.ts`: the itemized inventory of each of the 284 frozen schemas against the frozen reference itself and of each of the five additions against its own amendment, plus each of the 141 frozen operations.
   - `tests/contracts/runtime-parity.test.ts`: three-way runtime parity (baseline Ajv, generated Ajv, Zod) for all 289 schemas, plus the 31 frozen fixtures against the frozen bundle itself.
3. **`yarn reference:check`** verifies the frozen v1.0.0 pack exactly as before.

## Record integrity

`amendment.json` is the release record, written once for this release from the reviewed source change and the accepted v1.2.0 record and proposed with ADR-0006 for R14 final. Its correctness is proven by the composition tests above, not by a generator. It is never edited: its digest is pinned in `tests/contracts/release-v1-3-0.test.ts`. A later wire change is a new release with its own record and ADR.
