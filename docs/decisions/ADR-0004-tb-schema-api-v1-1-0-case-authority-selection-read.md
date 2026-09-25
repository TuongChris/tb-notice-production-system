# ADR-0004 — TB-SCHEMA-API-v1.1.0: additive read of a case authority selection with its pinned coverages

Status: **ACCEPTED** — operator, 2026-09-25, at review gate **R8 (final)**, whose result is **PASS** (mission TB_R8_MERGE_CLOSEOUT_AND_P4B_CASE_INTAKE_TO_R9). **TB-SCHEMA-API-v1.1.0 is the active wire contract**; TB-SCHEMA-API-v1.0.0 stays the frozen historical reference. Proposed 2026-09-25 with the R8 remediation. The change itself was directed by the operator in the first R8 review result (PASS_WITH_ONE_CONTRACT_REMEDIATION; mission TB_R8_CASE_AUTHORITY_SELECTION_READBACK_REMEDIATION), which names the gap, the preferred operation and the expected release identifier.
Acceptance boundary: an engineering contract change only. It creates no legal or factual authority, no case finding, no G1–G7 decision and no readiness implication.
Scope: `packages/contracts/src/**` (two schemas, one operation, the document version, the release constants), the generated artifacts `packages/contracts/{schemas,openapi}/**`, the release record `docs/contracts/TB-SCHEMA-API-v1.1.0/`, the parity tests `tests/contracts/**`, and the API/UI that implement the read.
Related: ADR-0002 §6 (an intentional wire change needs a new approved baseline: release + ADR), P4A report §9 and §21 (the gap), AR-002.

## Context

- P4A implemented `selectCaseAuthority`, which writes one `CaseAuthoritySelection` and one `CaseAuthorityCoverage` per explicitly chosen coverage (the exact `coverageId` and the `applicationScope` entered for it), and `listCaseAuthoritySelections`, which returns selection rows only.
- **Root cause.** TB-SCHEMA-API-v1.0.0 defines `CaseAuthorityCoverage` in its schema catalog, but no operation returns it. `CaseAuthoritySelection` and `CaseAuthoritySelectionPage` carry the selection row only, and the ids of the created coverage rows appear only in the create response's `meta.affectedResources`. The only frozen schema that embeds a selection with coverages, `ProductionContext.authority`, belongs to the unimplemented production context. It also resolves each coverage to MandateCoverage / MandateVersion / CoverageSigner / AuthorityEvent records rather than returning the stored `CaseAuthorityCoverage` rows. So after a reload the product cannot read back which coverages, and which application scopes, a historical selection pinned. The rows in the database are correct, but traceability — the reason a selection exists — is broken on the wire.
- **Excluded workarounds.** Parsing AuditEvents, client-side remembered state, an uncontracted route or an uncontracted field.
- **Gate.** ADR-0002 §6: the active source must reproduce the approved baseline exactly. An intentional wire change therefore needs a new approved baseline (release + ADR), never a test tweak. The frozen v1.0.0 pack is never edited (`docs/reference/**`).

## Decision

1. **New release `TB-SCHEMA-API-v1.1.0`** (semantic minor: additive only).
   - It consists of the frozen TB-SCHEMA-API-v1.0.0 reference, unchanged, plus one reviewed amendment: `docs/contracts/TB-SCHEMA-API-v1.1.0/amendment.json` (sha256 `2f4df69739926d4b50c22a1ba123ede51edec04bafb86459bb6bacb2d1dfda85`), described in `README.md` there.
   - The v1.0.0 pack stays the immutable historical reference, and nothing is written under `docs/reference`.
   - The generated artifacts (`api-schemas.json`, `openapi.json`, `openapi.yaml`) are the release's documents.
2. **The amendment (exact).**
   - **Operation `getCaseAuthoritySelection`** — `GET /cases/{caseId}/authority-selections/{id}`:
     - tag `Case`; path parameters `caseId` and `id` (uuid, 36 characters);
     - `200` `GetCaseAuthoritySelectionResponse`; errors 400/401/403/404/409/413/422/429/500 (those of the other case-child reads);
     - security: the session cookie; `x-precondition-target: null`, `x-idempotent-write: false`; no request body.
   - **Schemas.**
     - `CaseAuthoritySelectionView` = `{ selection: CaseAuthoritySelection, coverages: CaseAuthorityCoverage[1..20] }`, strict (unknown keys rejected), with a description of its meaning.
     - `GetCaseAuthoritySelectionResponse` = `{ data: CaseAuthoritySelectionView, meta: ResponseMeta }`, strict.
     - Both reference only the unchanged v1.0.0 row schemas.
   - **Document:** OpenAPI `info.version` 1.0.0 → 1.1.0.
   - **Placement:** the schemas follow `ListCaseAuthoritySelectionsResponse` and the path follows `/cases/{caseId}/authority-selections`.
3. **Naming follows the contract's conventions** (the mission allows this and asks for it to be recorded).
   - The path parameter is `{id}`, as in every contracted case-child read — `getReportedItem`, `getCaseWork`, `getUseMapping` and `getCaseFact` are all `/cases/{caseId}/…/{id}` — rather than the mission's `{selectionId}`. The meaning is identical: `{id}` is the selection id.
   - The operationId is `getCaseAuthoritySelection`, as preferred.
   - The composite read model is named `*View`, like `ContextView` and `SessionView`.
   - The pair `selection` + `coverages` (1–20) follows the frozen `ProductionContext.authority` and `SelectAuthority`.
   - The envelope is `{data, meta}`, like every `Get*Response`.
4. **Semantics.**
   - **What it returns.** Exactly the stored rows: the `CaseAuthoritySelection` whose id and case are the path's, and the `CaseAuthorityCoverage` rows with that `selectionId` and `caseId`, in ascending `coverageId` order. `coverageId` is unique within a selection (unique key `case_authority_coverages_selection_id_coverage_id_key`); the request order is not stored.
   - **What it never does.** Nothing is resolved, followed (a newer version, source revision, default signer or preferred coverage), unioned or recomputed from present-day route or authority state, and nothing current, valid, eligible, G1 or ready is stated.
   - **Case scope.** A selection of another case is `404 NOT_FOUND`, the same as an unknown one.
   - **No ETag.** The selection is an append-only record; API_CONTRACT_v1 §6 gives ETags to mutable resources only.
   - **Meaning.** The read model means only "this is the exact authority chain that was selected/pinned for evaluation in this Case".
5. **Unchanged.**
   - All 284 schemas and 141 operations of v1.0.0 stay byte-identical and in their order.
   - `$id` stays `urn:tb:api-contract:v1`. OpenAPI 3.1.1, servers, tags, security, shared parameters and responses are unchanged.
   - `PFC-YT-EMAIL-v1.1` and `AppMeta.schemaRelease` are unchanged (see Consequences).
   - The database schema is unchanged (no migration).
6. **Generation and parity procedure** (the v1.1.0 form of the ADR-0002 §6 gate).
   - **Workflow (as before).** Only `packages/contracts/src/**` is edited; `yarn contracts:generate` writes the artifacts and `yarn contracts:check` detects drift.
   - **The composition.** `tests/contracts/release.ts` composes the release documents from the frozen v1.0.0 JSON files and the amendment.
   - **What `yarn test` requires:**
     - the amendment digest and its base identity (the frozen `MANIFEST.sha256` digest and file digests);
     - byte-identity of the generated JSON Schema bundle and OpenAPI JSON with the composition;
     - the release digests of the three committed artifacts (YAML included);
     - the itemized inventory of each of the 284 frozen schemas against the frozen reference itself, and of the two additions against the amendment;
     - each of the 141 frozen operations unchanged;
     - three-way runtime parity (baseline Ajv, generated Ajv, Zod) for all 286 schemas, plus the 31 frozen fixtures against the frozen bundle itself.
   - **The frozen pack.** `yarn reference:check` verifies the v1.0.0 pack exactly as before.
7. **Later changes.** A later wire change is a new release with its own record and ADR (for example v1.2.0 if additive, v2.0.0 if breaking). This amendment record is never edited; its digest is pinned in `tests/contracts/release-v1-1-0.test.ts`.

## Consequences

- **Compatibility: additive only.** No existing operation, path, parameter, schema, required field, enum, format, status code, header, security requirement or error code changed. A v1.0.0 client keeps working unchanged, and every v1.0.0 response validates against the v1.0.0 schemas as before. The new capability is one additional read.
- **The API routes 93 business operations** (P4A's 16 plus this read); every later case operation stays unrouted.
- **Release constants.** `@tb/contracts` exports `CONTRACT_BASELINE = 'TB-SCHEMA-API-v1.1.0'` and `FROZEN_REFERENCE_RELEASE = 'TB-SCHEMA-API-v1.0.0'`.
- **Transition check.** `yarn test:transition-baseline` (the opt-in historical check of ADR-0002 §6) now fails, as that ADR predicted for the first approved contract edit. It passed at `7a11ce4`, before the edit. It is a historical transition oracle, not part of `yarn test`, CI or any success gate, and must not be "fixed" by reverting the amendment, editing the frozen v1.0.0 baseline or re-running the port (confirmed at acceptance).
- **`AppMeta.schemaRelease` (open; stays as recorded).** In the unrouted `GET /meta` it is the constant `'TB-SCHEMA-API-v1.0.0'` of v1.0.0. Changing it would alter an existing schema, which is not additive, so v1.1.0 leaves it as it is. Nothing emits it today. At acceptance the operator kept it as currently recorded until a separately approved future contract decision (for example when `getMeta` is implemented).
- **The release record is fixed.** Since acceptance, `docs/contracts/TB-SCHEMA-API-v1.1.0/amendment.json` is a reviewed, pinned release record and is never edited.
- **Port script.** `scripts/migrations/port-frozen-contract-v1.ts` and its tests stay valid as provenance of the v1.0.0 transition.

## Alternatives considered

- **Add `coverages` to `CaseAuthoritySelection` or its page.** This changes existing schemas: strict v1.0.0 validators would reject the new field, and lists would grow by up to 20 rows per item. Rejected.
- **A separate collection** (for example `GET /case-authority-coverages?selectionId=…`). It is not scoped by the case path, and one read model would need two lookups. Rejected.
- **`{selectionId}` as the path parameter** (the mission's preferred spelling). Replaced by `{id}` to follow the contract's case-child convention; the behaviour is identical.
- **Resolve each coverage to the current MandateCoverage / MandateVersion / CoverageSigner / AuthorityEvent records** (as the frozen `ProductionContext.authority` does). That is present-day authority state, not the stored pin. Rejected for this read.
- **AuditEvent parsing or client-remembered state.** Excluded by the mission.
- **A full copy of the v1.1.0 artifacts as a second frozen pack.** Under `docs/reference` it would write into the frozen tree, which is forbidden. Elsewhere it would duplicate about 1.8 MB and prove additivity only indirectly. Composing "frozen + amendment" proves additivity directly and keeps the exact delta reviewable in one small file.
