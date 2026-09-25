# ADR-0005 — TB-SCHEMA-API-v1.2.0: additive read of the FactSource rows recorded for one case fact revision

Status: **PROPOSED** — 2026-09-25, with the R9 remediation (mission TB_R9_FACT_SOURCE_READBACK_REMEDIATION_TO_R9_FINAL), for the operator's review at gate **R9 final**. The change itself was directed by the operator in the R9 review result (PASS_WITH_ONE_CONTRACT_REMEDIATION), which names the gap, the preferred path and the expected release identifier. Until it is accepted, `main` carries the accepted TB-SCHEMA-API-v1.1.0 (ADR-0004); the remediation branch `feature/r9-fact-support-readback` generates v1.2.0.
Acceptance boundary: an engineering contract change only. It creates no legal or factual authority, no case finding, no proof, no review, no G1–G7 decision and no readiness implication.
Scope: `packages/contracts/src/**` (two schemas, one operation, the document version, the release constant), the generated artifacts `packages/contracts/{schemas,openapi}/**`, the release record `docs/contracts/TB-SCHEMA-API-v1.2.0/`, the parity tests `tests/contracts/**`, and the API/UI that implement the read.
Related: ADR-0002 §6 (an intentional wire change needs a new approved baseline: release + ADR), ADR-0004 (the release this one extends and the pattern it follows), P4B report §1.2 and §19 (the gap), INVARIANTS §3 ("FactSource links a CaseSource from the same Case").

## Context

- **What P4B writes.** `createCaseFact` and `reviseCaseFact` accept `sources: FactSupport[]` (0–100). For each support they write one `FactSource` row with the exact `caseSourceId`, `supportRole` and `supportedAssertion`, in the same transaction as the fact revision. Each support names a LINKED CaseSource of the same case, whose link cites one exact SourceReference revision.
- **Root cause.** TB-SCHEMA-API-v1.0.0 (and v1.1.0) define `FactSource` in the schema catalog, but no operation returns it.
  - `getCaseFact` returns only the CaseFact row, and `listCaseFacts` returns summaries.
  - The create and revise responses name the new rows only as ids in `meta.affectedResources`.
  - The only frozen schema that carries facts in bulk, `ProductionContext.facts`, belongs to the unimplemented production context. It carries CaseFact rows only, with sources as `SourceManifestEntry`, not FactSource.
  - So after a reload the product cannot show which linked sources a revision cited, in which role and for which assertion. The rows in the database are correct, but traceability — the reason supports exist — is broken on the wire.
- **Excluded workarounds.** Parsing AuditEvents, client-side remembered state, querying the database from the UI, embedding uncontracted data into `GetCaseFactResponse`, and inferring supports from present-day source state.
- **Gate.** ADR-0002 §6 and ADR-0004 §7: an intentional wire change needs a new approved release + ADR.
  - The accepted v1.1.0 record (`docs/contracts/TB-SCHEMA-API-v1.1.0/amendment.json`) is never edited.
  - The frozen v1.0.0 pack (`docs/reference/**`) is never edited.

## Decision

1. **New release `TB-SCHEMA-API-v1.2.0`** (semantic minor: additive only).
   - It consists of TB-SCHEMA-API-v1.1.0, unchanged (the frozen v1.0.0 reference plus the ADR-0004 amendment), plus one reviewed amendment: `docs/contracts/TB-SCHEMA-API-v1.2.0/amendment.json` (sha256 `b5cae658a3f47639500e2220e4a91fcfb81c34972d8426a4fa9fd1146cdbc294`), described in `README.md` there.
   - The record identifies its base by the v1.1.0 record's digest and the digests of the v1.1.0 documents, and records only its own delta.
   - The generated artifacts (`api-schemas.json`, `openapi.json`, `openapi.yaml`) are the release's documents.
2. **The amendment (exact).**
   - **Operation `getCaseFactSources`** — `GET /cases/{caseId}/facts/{id}/sources`:
     - tag `Fact`; path parameters `caseId` and `id` (uuid, 36 characters); no query parameter;
     - `200` `GetCaseFactSourcesResponse`; errors 400/401/403/404/409/413/422/429/500 (those of `getCaseFact`);
     - security: the session cookie; `x-precondition-target: null`, `x-idempotent-write: false`; no request body.
   - **Schemas.**
     - `CaseFactSourcesView` = `{ factId: uuid, sources: FactSource[0..100] }`, strict (unknown keys rejected), with a description of its meaning.
     - `GetCaseFactSourcesResponse` = `{ data: CaseFactSourcesView, meta: ResponseMeta }`, strict.
     - Both reference only unchanged v1.0.0 schemas (`FactSource`, `ResponseMeta`).
   - **Document:** OpenAPI `info.version` 1.1.0 → 1.2.0.
   - **Placement:** the schemas follow `GetCaseFactResponse`; the path follows `/cases/{caseId}/facts/{id}`; the operation follows `getCaseFact`.
3. **Naming follows the contract's conventions** (the mission asks for this and for it to be recorded).
   - **Why not `listCaseFactSources`** (the mission's likely name). In this contract a `list*` operation is always a cursor-paginated collection. All 25 frozen `list*` operations take `limit`, `cursor` and `q` and return `{ items, nextCursor }` (API_CONTRACT_v1 §5: default 25, maximum 100, `(createdAt DESC, id DESC)`). This read returns the complete, bounded set of one revision's rows in one response, never a page. A `list*` name would promise paging, a cursor and a search that it does not have.
   - **What it follows instead.** The v1.1.0 read `getCaseAuthoritySelection`: a `get*` that returns a `*View` holding a bounded set of stored rows. Hence:
     - operationId `getCaseFactSources`: the fact read `getCaseFact` plus what it returns;
     - `GetCaseFactSourcesResponse`, like every `Get*Response`;
     - `CaseFactSourcesView`, like `CaseAuthoritySelectionView`, `ContextView` and `SessionView`.
   - **The path is the mission's preferred one:** `/cases/{caseId}/facts/{id}/sources`, with `{id}` for the fact revision as in `getCaseFact` and `reviseCaseFact`.
   - **Field names.**
     - `sources` mirrors the `sources` field of `CreateFact` / `ReviseFact`, through which the rows are written.
     - `factId` names the revision the rows belong to, so an empty list still says which revision has none.
4. **Semantics.**
   - **What it returns.**
     - The fact revision is found only by the path's case and id.
     - The response holds exactly the stored FactSource rows whose `factId` is that revision, every stored field unchanged: `id`, `factId`, `caseSourceId`, `supportRole`, `supportedAssertion`, `createdAt`, `createdById`.
   - **Order: ascending `(createdAt, id)`.**
     - The rows of one revision are written in one transaction with the same `createdAt`, so within a revision the order is by `id`: deterministic, but not the order in which the supports were submitted.
     - That order is not stored, and no migration is made to store it.
     - No semantic order (for example by `supportRole`) is invented.
   - **Zero rows.**
     - `CreateFact` and `ReviseFact` allow zero supports, so an empty `sources` is a normal answer.
     - It means only "no FactSource row was recorded for this revision": not unsupported, false, missing or MISSING provenance.
     - This differs on purpose from the 1–20 coverage rows of `CaseAuthoritySelectionView`.
   - **Historical pinning.**
     - Each row names its CaseSource link, which cites one exact SourceReference revision.
     - A newer source revision, a PAUSED or UNLINKED link, or a newer fact revision changes nothing in these rows and hides none of them.
     - A newer fact revision has only its own rows: supports are never merged or carried across revisions.
   - **What it never means.** Proof or truth of the fact, a document review (DOCUMENT_REVIEWED), SUPPORTED_FOR_SCOPE, an infringement, ownership, permission or exception/fair-use conclusion, G1–G7 or readiness.
   - **What it never does.**
     - It never reads into or changes the fact's provenance or resolution state.
     - It resolves nothing from present-day state: not a current link state, not a newer source revision.
   - **Case scope.** Another case's fact, an unknown fact and an unknown case are the same `404 NOT_FOUND`. No fact existence, support count, CaseSource id or source metadata leaks across cases.
   - **Read only.**
     - Session-protected, with no body.
     - No ETag: the rows are append-only, and API_CONTRACT_v1 §6 gives ETags to mutable resources only.
     - No If-Match, no Idempotency-Key, no write and no audit event.
   - **Integrity.** The response never breaks the contract or leaks: it is a 500, never returned, if a stored row names another case's CaseSource (the write path forbids it, INVARIANTS §3) or a revision holds more than 100 rows.
5. **Unchanged.**
   - All 286 schemas and 142 operations of v1.1.0 — and so all 284 schemas and 141 operations of v1.0.0 — stay byte-identical and in their order. This includes `GetCaseFactResponse` and every other fact schema, so a strict v1.0.0 or v1.1.0 client keeps validating the existing responses unchanged.
   - `$id` stays `urn:tb:api-contract:v1`. OpenAPI 3.1.1, servers, tags, security, shared parameters and responses are unchanged.
   - `PFC-YT-EMAIL-v1.1` is unchanged.
   - `AppMeta.schemaRelease` is unchanged: the unrouted `GET /meta` constant `'TB-SCHEMA-API-v1.0.0'`, kept as recorded. Changing it would not be additive, and the operator's decision at R8 final stands.
   - The database schema is unchanged (no migration).
   - The v1.1.0 release folder (`amendment.json` sha256 `2f4df697…`, `README.md` sha256 `4856068f…`) and ADR-0004 are byte-identical. Their statements are as of R8 final.
6. **Generation and parity procedure** (the v1.2.0 form of the ADR-0002 §6 gate).
   - **Workflow (as before).** Only `packages/contracts/src/**` is edited; `yarn contracts:generate` writes the artifacts and `yarn contracts:check` detects drift.
   - **The composition.** `tests/contracts/release.ts` composes a release from the frozen v1.0.0 JSON files and the amendments in release order; each amendment must name the previous release as its base.
   - **What `yarn test` requires** (`tests/contracts/release-v1-2-0.test.ts`, `release-v1-1-0.test.ts`, `inventory-openapi.test.ts`, `runtime-parity.test.ts`):
     - the v1.2.0 amendment digest and its base identity (the v1.1.0 record digest and the v1.1.0 documents' digests);
     - the v1.1.0 documents (JSON Schema, OpenAPI JSON and YAML) reproduced from "frozen + v1.1.0" to the digests recorded at their acceptance;
     - byte-identity of the generated JSON Schema bundle and OpenAPI JSON with "frozen + v1.1.0 + v1.2.0";
     - the committed artifacts, YAML included, equal to the rendered release, with the v1.2.0 digests;
     - the itemized inventory of each of the 284 frozen schemas against the frozen reference, and of each of the 4 additions against its own amendment;
     - each of the 141 frozen and 142 v1.1.0 operations unchanged and in order;
     - three-way runtime parity (baseline Ajv, generated Ajv, Zod) for all 288 schemas, plus the 31 frozen fixtures against the frozen bundle itself.
   - **The frozen pack.** `yarn reference:check` verifies the v1.0.0 pack exactly as before.
7. **Later changes.** A later wire change is a new release with its own record and ADR. Once accepted, this amendment record is never edited; its digest is pinned in `tests/contracts/release-v1-2-0.test.ts`.

## Consequences

- **Compatibility: additive only.** No existing operation, path, parameter, schema, required field, enum, format, status code, header, security requirement or error code changed. v1.0.0 and v1.1.0 clients keep working unchanged, and `getCaseFact` still returns exactly the CaseFact row. The new capability is one additional read.
- **The API routes 116 business operations** (P4B's 115 plus this read); every later case operation stays unrouted.
- **Release constants.** `@tb/contracts` exports `CONTRACT_BASELINE = 'TB-SCHEMA-API-v1.2.0'` and `FROZEN_REFERENCE_RELEASE = 'TB-SCHEMA-API-v1.0.0'`.
- **Transition check.** `yarn test:transition-baseline` keeps failing by design, as it has since the v1.1.0 edit. It is a historical oracle, not a gate, and is never "fixed".
- **`AppMeta.schemaRelease`** stays open exactly as recorded in ADR-0004.
- **Until acceptance** the status is PROPOSED. After acceptance the release record is fixed and never edited.

## Alternatives considered

- **Add `sources` to `CaseFact` or `GetCaseFactResponse`.** This changes existing schemas, and strict v1.0.0/v1.1.0 validators would reject the new field. It is also excluded by the mission. Rejected.
- **A paginated `listCaseFactSources`** (`limit`, `cursor`, `q`, a `FactSourcePage`). It would match the list convention, but it would:
  - split a bounded, historically fixed set of at most 100 rows across pages;
  - need an order the list convention does not use (ascending);
  - need cursor state, and a search with no meaning here.
  
  Rejected: the smallest exact read returns the whole set at once.
- **A separate collection** (for example `GET /fact-sources?factId=…`). It is not scoped by the case path. Rejected.
- **Resolve each row to the current link state or the newest source revision.** That is present-day state, not the stored record. Rejected; the UI shows the current link state separately, from the existing `getCaseSource` read.
- **Embed the fact in the view (`{ fact, sources }`).** It duplicates `getCaseFact` and grows the response; `factId` identifies the revision. Rejected.
- **AuditEvent parsing, client-remembered state or database queries from the UI.** Excluded by the mission.
- **A full copy of the v1.2.0 artifacts as another frozen pack.** Rejected for the reasons in ADR-0004.
