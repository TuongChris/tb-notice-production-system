# TB-SCHEMA-API-v1.4.0 — additive contract release

| | |
|---|---|
| Release | **TB-SCHEMA-API-v1.4.0** — additive (semantic minor) |
| Base | **TB-SCHEMA-API-v1.3.0** (`docs/contracts/TB-SCHEMA-API-v1.3.0`, ADR-0006, accepted at R14 final; record sha256 `6b74c09aba024dcf8cb2e0a0c6e374bbce17b45298d2aec83cc2e3ab166a1630`). Its documents: `api-schemas.json` `5868d90e…6a8c`, `openapi.json` `3743fba3…dd36`, `openapi.yaml` `ad80e8ad…0ded` (that record's `result.files`). v1.3.0 is v1.2.0 plus its amendment, v1.2.0 is v1.1.0 plus its amendment, and v1.1.0 is the frozen TB-SCHEMA-API-v1.0.0 reference plus its amendment. The frozen pack `docs/reference/database-api-v1/TB_DATABASE_SCHEMA_API_CONTRACT_v1` is never edited. |
| Decision | `docs/decisions/ADR-0009-candidate-assessment-support-rows-additive-historical-read.md` — **ACCEPTED** (operator, 2026-09-29, mission TB_FINAL_ACCEPTANCE_CLOSEOUT_MERGE_AND_POST_MAIN_VERIFICATION). The independent final engineering audit is **VERIFIED_WITH_LIMITS** at `3d432688a20266548447d71029830a4bbf85e38d`: the independent Astra re-audit, a bounded review of the accepted single-PC engineering scope, with R14-AUD-006 CLOSED_VERIFIED_WITH_LIMITS. This release is **ACCEPTED / ACTIVE**, the active wire contract. Earlier: ACCEPTED_BY_OPERATOR · INDEPENDENT_REVIEW_DEFERRED (operator, 2026-09-28, fast track, mission TB_P4H_CANDIDATE_ASSESSMENT_FAST_TRACK_IMPLEMENTATION), when the independent review had not taken place |
| Finding | R14-AUD-006 (the AssessmentSource read-back) |
| Recorded | 2026-09-28, P4H (mission TB_P4H_CANDIDATE_ASSESSMENT_FAST_TRACK_IMPLEMENTATION) |
| Record | `amendment.json` (this folder), sha256 `fb6b14a9781980f06ab7d1e41952feb478ee37f4df9df54f09d2fe941ff15c85` |
| Proposal | `docs/proposals/TB-SCHEMA-API-v1.4.0-assessment-support-readback.md` (the proposed delta of mission TB_PRE_ASSESSMENT_AUD005_AUD006_ARCHITECTURE; activated by this release) |
| Verification | `docs/verification/p4h/P4H_CANDIDATE_ASSESSMENT.md`; the final acceptance `docs/verification/final-audit/FINAL_ENGINEERING_AUDIT_CLOSEOUT.md` |

The wire contract of this release is TB-SCHEMA-API-v1.3.0, unchanged, plus exactly the amendment recorded here. The generated artifacts `packages/contracts/schemas/api-schemas.json` and `packages/contracts/openapi/openapi.{json,yaml}` are the release's documents. Their digests are in `amendment.json` (`result.files`):

| Document | sha256 |
|---|---|
| `packages/contracts/schemas/api-schemas.json` | `bd2cbf509af6958e13f6a8fc7988f8a28d34cd35eebe00c9616e015f7e5087a4` |
| `packages/contracts/openapi/openapi.json` | `ea24df81c6e707957d746ec80ebc39bf82bdda2f333410af5729a001a96fb8fe` |
| `packages/contracts/openapi/openapi.yaml` | `e22ec29ea67aa481cfa8762e295bcf67a80a6265f4bf460ff60b16b86868c149` |

The record names its base by the digest of the v1.3.0 record (`base.amendmentSha256`) and the digests of the v1.3.0 documents (`base.files`, equal to that record's `result.files`). The tests reproduce those documents from "frozen + v1.1.0 + v1.2.0 + v1.3.0" to exactly those digests.

`PFC-YT-EMAIL-v1.1` (the production-form wire identifier) is unrelated and unchanged. The technical ruleset is an implementation identifier, not part of this release: new validation runs record `TB-TECHNICAL-RULESET-v3` (ADR-0010), whose pinned internal-identifier vocabulary includes `TB-SCHEMA-API-v1.4.0`; runs recorded as v1 or v2 stay as recorded.

## Why

- `captureCandidateAssessment` accepts `sources: AssessmentSupport[1..100]` and writes one `assessment_sources` row per support.
- No operation of TB-SCHEMA-API-v1.0.0 through v1.3.0 returns those rows: the capture and list responses carry the `CandidateAssessment` only.
- Without this read, the source-to-conclusion relation of every assessment would be write-only for an API client after a reload. CandidateAssessment was therefore not routed until this read existed (R14-AUD-006).
- AuditEvent parsing, client-remembered responses, database queries from the UI, uncontracted fields in existing responses and present-state reconstruction are excluded.

## The exact change

| Item | Addition |
|---|---|
| Operation | `getCandidateAssessmentSources` — `GET /candidates/{candidateId}/assessments/{id}/sources`; tag `Assessment`; path `candidateId` and `id` (uuid, 36 characters, required); no query parameter; no request body; `200` `GetCandidateAssessmentSourcesResponse`; errors 400/401/403/404/409/413/422/429/500 (those of `listCandidateAssessments`); session cookie; `x-precondition-target: null`; `x-idempotent-write: false` |
| Schema | `CandidateAssessmentSourcesView` — strict, `{ assessmentId: uuid (36), sources: AssessmentSource[1..100] }`, with the description below |
| Schema | `GetCandidateAssessmentSourcesResponse` — strict, `{ data: CandidateAssessmentSourcesView, meta: ResponseMeta }` |
| Document | OpenAPI `info.version` 1.3.0 → 1.4.0 |

The schemas are inserted after `ListCandidateAssessmentsResponse` (before `GetCandidateReadinessResponse`), and the path after `/candidates/{candidateId}/assessments`, so it precedes `/candidates/{candidateId}/readiness`. Both schemas reference only unchanged v1.0.0 schemas: `AssessmentSource` (in the catalog since v1.0.0, returned by no operation until now) and `ResponseMeta`.

The description of `CandidateAssessmentSourcesView`, which carries the meaning on the wire:

> The exact stored AssessmentSource rows recorded for one CandidateAssessment (assessmentId) of this candidate, in ascending createdAt, then id order; every captured assessment has at least one. A historical record only: never proof or truth of a supported conclusion, a document review by itself, an ownership, authority, permission, infringement or exception finding, currentness, G1–G7 or readiness.

One wording difference from the proposal: the proposal said "a document review"; the release says "a document review by itself", as the P4H mission (§5) required the description to state. The shape, placement, operation and counts are exactly the proposal's.

**What the read returns.**

- Only the path candidate's assessment with that id.
- Exactly its stored rows, every field unchanged: `id`, `assessmentId`, `caseSourceId`, `supportedConclusion`, `createdAt`, `createdById`.
- In ascending `(createdAt, id)` order. The capture assigns ids ascending in request order at one instant, so this is the submitted order; the order carries no meaning.
- 1–100 rows in one response, never a page.

**What it never does.** It never:

- resolves present-day state — no link state, current source revision, source metadata or applicability;
- re-points a row to a newer source revision, merges rows across a supersession chain or annotates a row;
- decides proof, a document review, G1–G7, readiness or currentness.

The present state of a supporting CaseSource is read separately (the case's source links) and shown apart, labelled as present state.

**Scope and integrity.**

- An unknown candidate, an unknown or malformed assessment, and another candidate's assessment are the same `404`.
- A stored row naming another case's CaseSource, or an assessment holding no row or more than 100 rows, is a `500` — never a partial answer.
- Read only: no ETag, If-Match or Idempotency-Key; no write, no audit event, no idempotency record.

## Unchanged

All 289 schemas and 144 operations of v1.3.0 stay byte-identical and in their order, and so do the 288 schemas and 143 operations of v1.2.0, the 286 schemas and 142 operations of v1.1.0 and the 284 schemas and 141 operations of v1.0.0. This includes `CandidateAssessment`, `AssessmentSource`, `AssessmentSupport`, `AskDisposition`, `CaptureAssessment`, `CaptureCandidateAssessmentResponse`, `CandidateAssessmentPage`, `ListCandidateAssessmentsResponse`, `Readiness`, `GateSummary` and `ExportUnsigned`, and the capture, list, readiness and export operations. So do:

- `$id` `urn:tb:api-contract:v1`, OpenAPI 3.1.1, servers, tags and security;
- shared parameters and responses;
- `PFC-YT-EMAIL-v1.1`;
- `AppMeta.schemaRelease` — the unrouted `GET /meta`; left as recorded (ADR-0004, ADR-0005, ADR-0006, ADR-0009);
- the database schema (no migration);
- the v1.1.0, v1.2.0 and v1.3.0 release folders and ADR-0004–ADR-0007 (byte-identical).

## Compatibility

Additive only. No existing operation, path, parameter, schema, required field, enum, format, status code, header, security requirement or error code changed. v1.0.0–v1.3.0 clients keep working unchanged, and every existing response still validates against their schemas.

The identifiers that name the active release follow it, as the accepted P4D, P4E and P4G designs define (ADR-0006, Consequences; ADR-0007):

- the P4D dependency digest: `contract` is in its preimage, so every current digest changes once at activation. The digest definition stays `TB-PRODUCTION-CONTEXT-DIGEST-v2` (the wire release is no substitute for a semantic version, ADR-0007). A preview read before activation is refused once with 412 `CONTEXT_CHANGED`;
- a new prompt snapshot's `contractVersion` and header line (`TB-SCHEMA-API-v1.4.0`). A candidate drafted from an earlier prompt validates REVIEW_REQUIRED with a version-only `CONTEXT.PROMPT_DRIFT` issue: a request for a person to review, not a mandatory re-draft; no automatic re-draft or rebinding exists.

The technical ruleset does not follow the release: `TB-TECHNICAL-RULESET-v3` pins its vocabulary (ADR-0010). Stored digests, prompts, runs and assessments are never rewritten, and `contextRevision` never moves for a deployment.

## Generation and parity procedure

1. **Edit and generate.** Edit only the active source `packages/contracts/src/**` with the `tb` builders, then run `yarn contracts:generate` (writes the three artifacts) and `yarn contracts:check` (fails on drift and never repairs).
2. **`yarn test`** pins the release:
   - `tests/contracts/release-v1-4-0.test.ts`:
     - this amendment's digest and its base identity (the v1.3.0 record digest and documents);
     - generated JSON Schema bundle and OpenAPI JSON byte-identical to "frozen v1.0.0 + v1.1.0 + v1.2.0 + v1.3.0 + v1.4.0", as composed by `tests/contracts/release.ts`;
     - the committed artifacts (YAML included) equal to the rendered release, with its digests; 291 schemas, 145 operations, 100 paths;
     - additivity over v1.3.0, v1.2.0, v1.1.0 and v1.0.0: every schema and operation unchanged and in place, and nothing beyond this amendment;
     - the added read is under the candidate and the assessment, read-only, not a list, and returns only the assessment id and the unchanged v1.0.0 `AssessmentSource` rows (1–100), with no present-day, proof, review, gate or readiness field.
   - `tests/contracts/release-v1-3-0.test.ts`, `release-v1-2-0.test.ts` and `release-v1-1-0.test.ts`: the accepted records, unchanged, still reproduce their documents to the digests recorded at acceptance, and their additions are unchanged in the active contract.
   - `tests/contracts/inventory-openapi.test.ts`: the itemized inventory of each of the 284 frozen schemas against the frozen reference itself and of each of the seven additions against its own amendment, plus each of the 141 frozen operations.
   - `tests/contracts/runtime-parity.test.ts`: three-way runtime parity (baseline Ajv, generated Ajv, Zod) for all 291 schemas, plus the 31 frozen fixtures against the frozen bundle itself.
3. **`yarn reference:check`** verifies the frozen v1.0.0 pack exactly as before.

## Record integrity

`amendment.json` is the release record, written once for this release from the reviewed source change and the accepted v1.3.0 record. Its correctness is proven by the composition tests above, not by a generator. It is never edited: its digest is pinned in `tests/contracts/release-v1-4-0.test.ts`. A later wire change is a new release with its own record and ADR.

ADR-0009 was first accepted by the operator's fast track, for implementation, with the independent review deferred (2026-09-28). The independent final engineering audit took place later: the independent Astra re-audit of `3d432688a20266548447d71029830a4bbf85e38d` is **VERIFIED_WITH_LIMITS**, and the operator accepted ADR-0009 and this release on its recommendation (2026-09-29). It is a bounded review. It claims no 100 % whole-repository coverage, and it verified the contract package byte-identical rather than regenerating it standalone. `amendment.json` is byte-identical at that acceptance.
