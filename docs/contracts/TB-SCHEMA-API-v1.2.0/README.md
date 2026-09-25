# TB-SCHEMA-API-v1.2.0 — additive contract release

| | |
|---|---|
| Release | **TB-SCHEMA-API-v1.2.0** — additive (semantic minor) |
| Base | **TB-SCHEMA-API-v1.1.0** (`docs/contracts/TB-SCHEMA-API-v1.1.0`, ADR-0004, accepted at R8 final; record sha256 `2f4df697…85`), which is the frozen TB-SCHEMA-API-v1.0.0 reference plus its amendment. The frozen pack `docs/reference/database-api-v1/TB_DATABASE_SCHEMA_API_CONTRACT_v1` is never edited. |
| Decision | `docs/decisions/ADR-0005-tb-schema-api-v1-2-0-case-fact-sources-read.md` — **PROPOSED** (R9 remediation), for the operator's review at gate R9 final |
| Recorded | 2026-09-25, R9 remediation (mission TB_R9_FACT_SOURCE_READBACK_REMEDIATION_TO_R9_FINAL) |
| Record | `amendment.json` (this folder), sha256 `b5cae658a3f47639500e2220e4a91fcfb81c34972d8426a4fa9fd1146cdbc294` |

The wire contract of this release is TB-SCHEMA-API-v1.1.0, unchanged, plus exactly the amendment recorded here. The generated artifacts `packages/contracts/schemas/api-schemas.json` and `packages/contracts/openapi/openapi.{json,yaml}` are the release's documents. Their digests are in `amendment.json` (`result.files`).

The record names its base by the digest of the v1.1.0 record (`base.amendmentSha256`) and the digests of the v1.1.0 documents (`base.files`, equal to that record's `result.files`). The tests reproduce those documents from "frozen + v1.1.0" to exactly those digests.

`PFC-YT-EMAIL-v1.1` (the production-form wire identifier) is unrelated and unchanged.

## Why

`createCaseFact` and `reviseCaseFact` write one `FactSource` row per supplied support: the exact `caseSourceId`, `supportRole` and `supportedAssertion`. TB-SCHEMA-API-v1.1.0 has no operation that returns those rows, so after a reload the product could not show which linked sources a fact revision cited, or for what. This was the one R9 contract remediation. AuditEvent parsing, client-remembered state, database queries from the UI, uncontracted fields in `GetCaseFactResponse` and present-day source inference are excluded.

## The exact change

| Item | Addition |
|---|---|
| Operation | `getCaseFactSources` — `GET /cases/{caseId}/facts/{id}/sources`; tag `Fact`; path `caseId`, `id` (uuid); no query parameter; `200` `GetCaseFactSourcesResponse`; errors 400/401/403/404/409/413/422/429/500 (those of `getCaseFact`); session cookie; `x-precondition-target: null`; `x-idempotent-write: false`; no request body |
| Schema | `CaseFactSourcesView` — `{ factId: uuid, sources: FactSource[0..100] }`, strict |
| Schema | `GetCaseFactSourcesResponse` — `{ data: CaseFactSourcesView, meta: ResponseMeta }`, strict |
| Document | OpenAPI `info.version` 1.1.0 → 1.2.0 |

The schemas are inserted after `GetCaseFactResponse`; the path after `/cases/{caseId}/facts/{id}`. The bound 0–100 is the bound of the `sources` of `CreateFact` / `ReviseFact`, the only writers of FactSource rows. It is a `get*` returning a `*View`, not a paginated `list*` (ADR-0005 §3).

**What the read means.** "These are the exact source-support rows recorded for this exact CaseFact revision." Every stored field is returned unchanged, in ascending `(createdAt, id)` order. Because one revision's rows share their `createdAt`, that is `id` order; the submission order is not stored.

**An empty `sources`** means only that no FactSource row was recorded for that revision. It does not mean unsupported, false, missing or MISSING provenance.

**What it never means.** Proof or truth of the fact, a document review, SUPPORTED_FOR_SCOPE, an infringement, ownership, permission or exception conclusion, G1–G7 or readiness.

**What it never does.**

- It never reads into or changes provenance or the resolution state.
- It never follows a newer SourceReference revision.
- It never hides a row because its link was later paused or unlinked.
- It never merges the supports of different revisions.

**Case scope.** A fact of another case is `404`, the same as an unknown fact or case.

## Unchanged

All 286 schemas and 142 operations of v1.1.0 — and so the 284 schemas and 141 operations of v1.0.0 — stay byte-identical and in their order, including `GetCaseFactResponse`. So do:

- `$id` `urn:tb:api-contract:v1`, OpenAPI 3.1.1, servers, tags and security;
- shared parameters and responses;
- `PFC-YT-EMAIL-v1.1`;
- `AppMeta.schemaRelease` — the unrouted `GET /meta`; left as recorded (ADR-0004, ADR-0005);
- the database schema (no migration);
- the v1.1.0 release folder and ADR-0004 (byte-identical).

## Compatibility

Additive only. No existing operation, path, parameter, schema, required field, enum, format, status code, header, security requirement or error code changed. v1.0.0 and v1.1.0 clients keep working unchanged, and every existing response still validates against their schemas.

## Generation and parity procedure

1. **Edit and generate.** Edit only the active source `packages/contracts/src/**`, then run `yarn contracts:generate` (writes the three artifacts) and `yarn contracts:check` (fails on drift and never repairs).
2. **`yarn test`** pins the release:
   - `tests/contracts/release-v1-2-0.test.ts`:
     - this amendment's digest and its base identity (the v1.1.0 record digest and documents);
     - generated JSON Schema bundle and OpenAPI JSON byte-identical to "frozen v1.0.0 + v1.1.0 + v1.2.0", as composed by `tests/contracts/release.ts`;
     - the committed artifacts (YAML included) equal to the rendered release, with its digests;
     - additivity over v1.1.0 and v1.0.0: every schema and operation unchanged and in place, and nothing beyond this amendment;
     - the added read is case-scoped, read-only, allows zero rows and carries no proof, review, G1/readiness or link-state field.
   - `tests/contracts/release-v1-1-0.test.ts`: the accepted v1.1.0 record, unchanged, still reproduces its documents to the digests recorded at acceptance.
   - `tests/contracts/inventory-openapi.test.ts`: the itemized inventory of each of the 284 frozen schemas against the frozen reference itself and of each of the four additions against its own amendment, plus each of the 141 frozen operations.
   - `tests/contracts/runtime-parity.test.ts`: three-way runtime parity (baseline Ajv, generated Ajv, Zod) for all 288 schemas, plus the 31 frozen fixtures against the frozen bundle itself.
3. **`yarn reference:check`** verifies the frozen v1.0.0 pack exactly as before.

## Record integrity

`amendment.json` is the release record proposed with ADR-0005 for R9 final. It was written once for this release from the reviewed source change and the accepted v1.1.0 record, and its correctness is proven by the composition tests above, not by a generator. Once accepted it is never edited: its digest is pinned in `tests/contracts/release-v1-2-0.test.ts`. A later wire change is a new release with its own record and ADR.
