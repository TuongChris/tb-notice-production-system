# TB-SCHEMA-API-v1.1.0 — additive contract release

| | |
|---|---|
| Release | **TB-SCHEMA-API-v1.1.0** — additive (semantic minor) |
| Base | **TB-SCHEMA-API-v1.0.0**, the frozen reference `docs/reference/database-api-v1/TB_DATABASE_SCHEMA_API_CONTRACT_v1` (never edited; `MANIFEST.sha256` digest `42c2a419…9c`) |
| Decision | `docs/decisions/ADR-0004-tb-schema-api-v1-1-0-case-authority-selection-read.md` — PROPOSED for acceptance at review gate R8 (final) |
| Recorded | 2026-09-25, R8 remediation (mission TB_R8_CASE_AUTHORITY_SELECTION_READBACK_REMEDIATION) |
| Record | `amendment.json` (this folder), sha256 `2f4df69739926d4b50c22a1ba123ede51edec04bafb86459bb6bacb2d1dfda85` |

The active wire contract is the frozen v1.0.0 reference plus exactly the amendment recorded here. The generated artifacts `packages/contracts/schemas/api-schemas.json` and `packages/contracts/openapi/openapi.{json,yaml}` are the release's documents. Their digests are in `amendment.json` (`result.files`).

`PFC-YT-EMAIL-v1.1` (the production-form wire identifier) is unrelated and unchanged.

## Why

`selectCaseAuthority` pins one `CaseAuthorityCoverage` row per chosen coverage, holding the exact `coverageId` and the `applicationScope` entered for it. TB-SCHEMA-API-v1.0.0 has no operation that returns those rows, so after a reload the product could not read back the exact chain a historical selection pinned. This was the one R8 blocker. AuditEvent parsing, client-remembered state and uncontracted routes or fields are excluded.

## The exact change

| Item | Addition |
|---|---|
| Operation | `getCaseAuthoritySelection` — `GET /cases/{caseId}/authority-selections/{id}`; tag `Case`; path `caseId`, `id` (uuid); `200` `GetCaseAuthoritySelectionResponse`; errors 400/401/403/404/409/413/422/429/500; session cookie; `x-precondition-target: null`; `x-idempotent-write: false`; no request body |
| Schema | `CaseAuthoritySelectionView` — `{ selection: CaseAuthoritySelection, coverages: CaseAuthorityCoverage[1..20] }`, strict |
| Schema | `GetCaseAuthoritySelectionResponse` — `{ data: CaseAuthoritySelectionView, meta: ResponseMeta }`, strict |
| Document | OpenAPI `info.version` 1.0.0 → 1.1.0 |

The additions are inserted after `ListCaseAuthoritySelectionsResponse` (schemas) and `/cases/{caseId}/authority-selections` (paths).

**What the read means.** "This is the exact authority chain that was selected/pinned for evaluation in this Case." It returns the stored selection row and its stored coverage rows as recorded, in ascending `coverageId` order. It is never a G1 decision, confirmed standing, current authority, signer eligibility, G7 or READY_FOR_SIGNER.

**What it never does.** It never substitutes a preferred coverage, follows a newer MandateVersion or SourceReference revision, unions application scopes or recomputes anything from present-day route or authority state.

**Case scope.** A selection of another case is `404`, the same as an unknown one.

## Unchanged

All 284 schemas and 141 operations of v1.0.0 stay byte-identical and in their order. So do:

- `$id` `urn:tb:api-contract:v1`, OpenAPI 3.1.1, servers, tags and security;
- shared parameters and responses;
- `PFC-YT-EMAIL-v1.1`;
- `AppMeta.schemaRelease` — the unrouted `GET /meta`; left as it is so the release stays additive; see ADR-0004;
- the database schema (no migration).

## Compatibility

Additive only. No existing operation, path, parameter, schema, required field, enum, format, status code, header, security requirement or error code changed. A v1.0.0 client keeps working unchanged, and every v1.0.0 response still validates against the v1.0.0 schemas.

## Generation and parity procedure

1. **Edit and generate.** Edit only the active source `packages/contracts/src/**`, then run `yarn contracts:generate` (writes the three artifacts) and `yarn contracts:check` (fails on drift and never repairs).
2. **`yarn test`** pins the release:
   - `tests/contracts/release-v1-1-0.test.ts`:
     - the amendment digest and its base identity;
     - generated JSON Schema bundle and OpenAPI JSON byte-identical to "frozen v1.0.0 + amendment", as composed by `tests/contracts/release.ts`;
     - the result digests of the three committed artifacts;
     - additivity: each frozen schema and operation unchanged and in place, and nothing beyond the amendment;
     - the added read is case-scoped, read-only and carries no G1/readiness field.
   - `tests/contracts/inventory-openapi.test.ts`: the itemized inventory of each of the 284 frozen schemas against the frozen reference itself and of the two additions against this record, plus each of the 141 frozen operations.
   - `tests/contracts/runtime-parity.test.ts`: three-way runtime parity (baseline Ajv, generated Ajv, Zod) for all 286 schemas, plus the 31 frozen fixtures against the frozen bundle itself.
3. **`yarn reference:check`** verifies the frozen v1.0.0 pack exactly as before.

## Record integrity

`amendment.json` is the reviewed release record. It was written once for this release from the reviewed source change, and its correctness is proven by the composition tests above, not by a generator. It is never edited: its digest is pinned in `tests/contracts/release-v1-1-0.test.ts`. A later wire change is a new release with its own record and ADR.
