# PROPOSAL — TB-SCHEMA-API-v1.4.0: additive read of the AssessmentSource rows of one candidate assessment

> **PROPOSED FUTURE DELTA ONLY — NOT ACTIVE.** This is not a release record and not an amendment.
>
> - `CONTRACT_BASELINE` stays `TB-SCHEMA-API-v1.3.0`.
> - No `packages/contracts/**` file, generated artifact, `docs/contracts/TB-SCHEMA-API-v1.4.0/`, `amendment.json`, parity test or route exists for it.
> - The active wire contract is TB-SCHEMA-API-v1.3.0: 289 schemas, 144 operations, 99 paths.

| | |
|---|---|
| Proposed release | **TB-SCHEMA-API-v1.4.0** — additive (semantic minor) |
| Base | **TB-SCHEMA-API-v1.3.0** (`docs/contracts/TB-SCHEMA-API-v1.3.0`, ADR-0006, accepted at R14 final). Record sha256 `6b74c09aba024dcf8cb2e0a0c6e374bbce17b45298d2aec83cc2e3ab166a1630`. Its documents: `api-schemas.json` `5868d90e…6a8c`, `openapi.json` `3743fba3…dd36`, `openapi.yaml` `ad80e8ad…0ded` (that record's `result.files`) |
| Decision | ADR-0009 (**PROPOSED**); the freshness rules the capture needs are in ADR-0008 (**PROPOSED**) |
| Finding | R14-AUD-006 (the AssessmentSource read-back) — DESIGN_PROPOSED_PENDING_INDEPENDENT_REVIEW |
| Recorded | 2026-09-28, mission TB_PRE_ASSESSMENT_AUD005_AUD006_ARCHITECTURE (architecture only) |
| Design record | `docs/architecture/PRE_ASSESSMENT_AUD005_AUD006_ARCHITECTURE.md` §10–§14 |

## Why

- `captureCandidateAssessment` accepts `sources: AssessmentSupport[1..100]` and would write one `assessment_sources` row per support.
- No operation of TB-SCHEMA-API-v1.0.0 through v1.3.0 returns those rows: the capture and list responses carry the `CandidateAssessment` only.
- Without this read, the source-to-conclusion relation of every assessment would be write-only for an API client after a reload. CandidateAssessment is therefore not routed until this read exists.
- AuditEvent parsing, client-remembered responses, database queries from the UI, uncontracted fields in existing responses and present-state reconstruction are excluded.

## The exact proposed change

| Item | Proposed addition |
|---|---|
| Operation | `getCandidateAssessmentSources` — `GET /candidates/{candidateId}/assessments/{id}/sources` |
| Tag | `Assessment` |
| Summary | "Read the exact AssessmentSource rows recorded for one assessment of this candidate; a stored historical record, not proof, a review or a gate result." |
| Parameters | path `candidateId` (uuid, 36 characters, required); path `id` (uuid, 36 characters, required). No query parameter, no header parameter beyond the shared session, no request body |
| Success | `200` `GetCandidateAssessmentSourcesResponse` |
| Errors | `400`, `401`, `403`, `404`, `409`, `413`, `422`, `429`, `500` — those of `listCandidateAssessments`, through the shared `Error` response |
| Security | `session` (the session cookie) |
| `x-idempotent-write` | `false` |
| `x-precondition-target` | `null` |
| Schema | `CandidateAssessmentSourcesView` — strict, `{ assessmentId: uuid (36), sources: AssessmentSource[1..100] }` |
| Schema | `GetCandidateAssessmentSourcesResponse` — strict, `{ data: CandidateAssessmentSourcesView, meta: ResponseMeta }` |
| Document | OpenAPI `info.version` 1.3.0 → 1.4.0 |

Proposed description of `CandidateAssessmentSourcesView`, which carries the meaning on the wire:

> The exact stored AssessmentSource rows recorded for one CandidateAssessment (assessmentId) of this candidate, in ascending createdAt, then id order; every captured assessment has at least one. A historical record only: never proof or truth of a supported conclusion, a document review, an ownership, authority, permission, infringement or exception finding, currentness, G1–G7 or readiness.

**Placement** (the composition's insertion points, as recorded in the earlier amendments):

- `schemas.insertAfter`: `ListCandidateAssessmentsResponse`, followed by `CandidateAssessmentSourcesView` then `GetCandidateAssessmentSourcesResponse`, before `GetCandidateReadinessResponse`;
- `operations.insertAfterPath`: `/candidates/{candidateId}/assessments`, so the new path precedes `/candidates/{candidateId}/readiness`;
- the operation follows `listCandidateAssessments` and precedes `getCandidateReadiness`.

Both schemas reference only unchanged v1.0.0 schemas: `AssessmentSource` (already in the catalog, returned by no operation until now) and `ResponseMeta`.

## Expected future inventory

The selected design is exactly 1 operation + 2 schemas + 1 path:

| | v1.3.0 (active) | v1.4.0 (proposed) |
|---|---|---|
| Schemas | 289 | **291** |
| Operations | 144 | **145** |
| Paths | 99 | **100** |

Measured on the committed `packages/contracts/openapi/openapi.json` (v1.3.0) on 2026-09-28:

- `AssessmentSource` is an existing component schema;
- neither new schema name exists;
- the path `/candidates/{candidateId}/assessments/{id}/sources` does not exist.

## Semantics (normative for the implementation; ADR-0009 §4)

- **What the read returns.**
  - Only the path's candidate's assessment with that id.
  - Exactly its stored rows, every field unchanged: `id`, `assessmentId`, `caseSourceId`, `supportedConclusion`, `createdAt`, `createdById`.
  - In ascending `(createdAt, id)` order. The capture assigns ids ascending in request order, so this is the submitted order; the order carries no meaning.
- **Bounds.** 1–100 in one response, never a page.
- **Historical.** Nothing is resolved from present-day state:
  - no link state, current source revision or source metadata;
  - no re-pointing, merging across supersession or annotation.
- **Scope.** An unknown candidate, an unknown or malformed assessment, and another candidate's assessment are the same 404.
- **Integrity.** It is a 500, never returned, if a stored row names another case's CaseSource, or an assessment holds more than 100 rows or none.
- **Read only.** No ETag, If-Match or Idempotency-Key; no write, no audit event.

## Unchanged

- Every one of the 289 schemas, 144 operations and 99 paths of v1.3.0 stays byte-identical and in order, including every assessment, support, capture and readiness schema. Strict v1.0.0–v1.3.0 clients keep validating every existing response.
- `$id` (`urn:tb:api-contract:v1`), OpenAPI 3.1.1, servers, tags, security, and shared parameters and responses are unchanged.
- `PFC-YT-EMAIL-v1.1` and `AppMeta.schemaRelease` (`TB-SCHEMA-API-v1.0.0`, as recorded) are unchanged.
- No database change and no migration.
- The v1.1.0, v1.2.0 and v1.3.0 records and ADR-0004–ADR-0007 are byte-identical.

## Activation (a later, separately approved step — not this proposal)

1. The operator accepts ADR-0009, after the independent review.
2. An approved mission, recommended as the first step of P4H before any assessment is routed:
   - writes `docs/contracts/TB-SCHEMA-API-v1.4.0/amendment.json` and `README.md`, with this delta and the base identity above;
   - edits `packages/contracts/src/**` with the `tb` builders;
   - runs `yarn contracts:generate`;
   - adds the release to `tests/contracts/release.ts` with `tests/contracts/release-v1-4-0.test.ts` (the amendment digest, the base identity, byte-identity, the itemized inventory, three-way runtime parity);
   - sets `CONTRACT_BASELINE = 'TB-SCHEMA-API-v1.4.0'`.
3. **Known consequences at activation** (from the accepted ADR-0006 and ADR-0007 couplings):
   - Every current production-context digest changes (`contract` is in the preimage). A kept preview is refused once with 412 `CONTEXT_CHANGED`.
   - New prompts record `contractVersion` `TB-SCHEMA-API-v1.4.0`. A candidate drafted from an earlier prompt validates REVIEW_REQUIRED with a version-only `CONTEXT.PROMPT_DRIFT` issue. That asks a person to review; it is not a mandatory re-draft. Under ADR-0008's readiness baseline it is not TECHNICAL_PASS.
   - `TB-TECHNICAL-RULESET-v2` pins its marker vocabulary without `TB-SCHEMA-API-v1.4.0`. The unit test "a later identifier needs a new ruleset version" then fails until the activation records a new ruleset version (for example `TB-TECHNICAL-RULESET-v3`, whose vocabulary includes the new release) or an explicit operator decision. Neither is made or created here.
   - The API routes the read only with the P4H implementation. Until then the operation is contracted but unrouted, like the other assessment operations.

## Not in this proposal

- `getCandidateAssessment` (a single-assessment read): not needed for the round trip; `listCandidateAssessments` returns full `CandidateAssessment` items.
- Any change to capture, list, readiness or export schemas.
- Any field naming a ValidationRun, a validation issue or a disposition. A future issue-disposition mechanism would need its own ADR and release (ADR-0008 §9).
