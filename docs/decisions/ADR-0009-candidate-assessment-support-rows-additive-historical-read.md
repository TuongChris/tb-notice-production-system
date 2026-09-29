# ADR-0009 — Candidate assessment support rows require an additive historical read

Status: **ACCEPTED_BY_OPERATOR · INDEPENDENT_REVIEW_DEFERRED** — accepted for implementation by the operator on 2026-09-28 (mission TB_P4H_CANDIDATE_ASSESSMENT_FAST_TRACK_IMPLEMENTATION, an operator-authorized fast track), on the architecture committed at `5afd2ec`; the open decisions D-1…D-6 are resolved in ADR-0008 ("Operator acceptance"). The independent Astra review was **deferred by the operator**: no independent review has taken place, and nothing here is independently verified. Proposed 2026-09-28 by mission TB_PRE_ASSESSMENT_AUD005_AUD006_ARCHITECTURE (architecture and specification only).
- The wire delta it needs, **TB-SCHEMA-API-v1.4.0**, was proposed in `docs/proposals/TB-SCHEMA-API-v1.4.0-assessment-support-readback.md` and is **activated by the same mission** as the release record `docs/contracts/TB-SCHEMA-API-v1.4.0/` (amendment and README), exactly as proposed (Decision 2).
- The activation records the new technical ruleset version the release requires: `TB-TECHNICAL-RULESET-v3` (ADR-0010).

Addresses: the Astra finding **R14-AUD-006** (a future AssessmentSource read-back; FUTURE_ASSESSMENT_PREREQUISITE, it blocked CandidateAssessment implementation). Proposed as DESIGN_PROPOSED_PENDING_INDEPENDENT_REVIEW; after the operator's acceptance it is implemented by P4H (status in `docs/verification/p4h/P4H_CANDIDATE_ASSESSMENT.md`), with the independent review deferred.
Acceptance boundary: an engineering contract design only. It creates no legal or factual authority, no finding, no proof, no review, no G1–G7 decision and no readiness.
Scope: the read of the AssessmentSource rows of one CandidateAssessment (P4H) and the capture rules that the read depends on. D-3 (ADR-0008, "Operator acceptance") settles the non-PASS citation rule of Decision 6 as proposed.
Related: ADR-0002 §6 (an intentional wire change needs a new approved release + ADR); ADR-0004, ADR-0005 (`getCaseFactSources`, the pattern followed) and ADR-0006 (`getValidationRun`); ADR-0008 (the assessment epoch; the other pre-assessment prerequisite); frozen INVARIANTS §3 ("AssessmentSource links a CaseSource from the same Case", a transactional service check) and §4; API_CONTRACT_v1 §5–§6; PFC §10.
Design record: `docs/architecture/PRE_ASSESSMENT_AUD005_AUD006_ARCHITECTURE.md` §10–§16, §19. Verification of this mission: `docs/verification/pre-assessment/PRE_ASSESSMENT_ARCHITECTURE_VERIFICATION.md`.

## Context

- **What a future capture writes.** `captureCandidateAssessment` (`POST /candidates/{candidateId}/assessments`, unrouted) accepts `CaptureAssessment.sources: AssessmentSupport[1..100]`: `{caseSourceId, supportedConclusion (1–8,000)}`. The storage writes:
  - one `candidate_assessments` row;
  - one `assessment_sources` row per support: `id`, `assessmentId`, `caseSourceId`, `supportedConclusion`, `createdAt`, `createdById`.

  The unique `(assessment_id, case_source_id)` key allows one row per link per assessment.
- **Root cause.** TB-SCHEMA-API-v1.0.0 through v1.3.0 define `AssessmentSource` in the schema catalog, but no operation returns it.
  - `CaptureCandidateAssessmentResponse` returns the `CandidateAssessment` only.
  - `ListCandidateAssessmentsResponse` returns `CandidateAssessment` items only.

  After a reload no contracted read can show which linked sources an assessment cited, or for which conclusion. The relation would be write-only on the wire — the read-back gap earlier closed for FactSource (ADR-0005) and ValidationRun (ADR-0006).
- **Excluded workarounds:**
  - AuditEvent parsing;
  - client-remembered POST responses or state;
  - database queries from the UI;
  - uncontracted fields in existing responses;
  - rebuilding supports from present-day CaseSource or SourceReference state.
- **Gate.** An intentional wire change needs a new approved release + ADR. The accepted v1.1.0, v1.2.0 and v1.3.0 records are never edited, and the frozen v1.0.0 pack is never edited.

## Decision

1. **A new additive read in a future minor release, TB-SCHEMA-API-v1.4.0** (proposed, inactive).
   - It consists of TB-SCHEMA-API-v1.3.0, unchanged, plus one amendment, to be written only when the release is activated by an approved mission.
   - The exact delta is recorded in the proposal document, not in `docs/contracts/`: no `amendment.json` exists until activation.
2. **The amendment (exact, proposed).**
   - **Operation `getCandidateAssessmentSources`** — `GET /candidates/{candidateId}/assessments/{id}/sources`:
     - tag `Assessment`;
     - path parameters `candidateId` and `id` (uuid, 36 characters); no query parameter; no request body;
     - `200` `GetCandidateAssessmentSourcesResponse`;
     - errors 400/401/403/404/409/413/422/429/500 (those of `listCandidateAssessments`);
     - security: the session cookie; `x-precondition-target: null`, `x-idempotent-write: false`.
   - **Schemas.**
     - `CandidateAssessmentSourcesView` = `{ assessmentId: uuid, sources: AssessmentSource[1..100] }`, strict (unknown keys rejected), with a description of its meaning.
     - `GetCandidateAssessmentSourcesResponse` = `{ data: CandidateAssessmentSourcesView, meta: ResponseMeta }`, strict.
     - Both reference only unchanged v1.0.0 schemas (`AssessmentSource`, `ResponseMeta`). No new row schema is added.
   - **Document:** OpenAPI `info.version` 1.3.0 → 1.4.0.
   - **Placement:** the schemas follow `ListCandidateAssessmentsResponse`; the path follows `/candidates/{candidateId}/assessments`; the operation follows `listCandidateAssessments` and precedes `getCandidateReadiness`.
   - **Inventory:** 289 → **291** schemas, 144 → **145** operations, 99 → **100** paths.
3. **Naming follows ADR-0005 §3.**
   - A `get*` that returns a `*View` holding a complete bounded set of stored rows, not a paginated `list*`. In this contract every `list*` takes `limit`, `cursor` and `q` and returns a page.
   - The path mirrors `/cases/{caseId}/facts/{id}/sources` under the frozen `/candidates/{candidateId}/assessments` collection, with `{id}` for the assessment.
   - `sources` mirrors the `sources` field of `CaptureAssessment`, through which the rows are written.
   - `assessmentId` names the assessment the rows belong to.
4. **Semantics.**
   - **What it returns.**
     - The assessment is found only by the path's candidate and id.
     - The response holds exactly the stored `assessment_sources` rows of that assessment, every stored field unchanged.
   - **Order: ascending `(createdAt, id)`.** Deterministic and storage-backed, independent of any present state (link state, source title, current revision, query order).
     - One assessment's rows share the capture instant, so the order is by `id`.
     - The capture assigns the row ids ascending in the order of the request's `sources` (Decision 6), so this is also the submitted order.
     - The order carries no meaning.
   - **Bounds: 1–100, complete, never a page.** Capture requires at least one and at most 100 supports, and capture is the only writer, so one response is always the whole set.
     - An empty list would falsely say "no support recorded". This differs on purpose from `CaseFactSourcesView` (0..100), where no support is legitimate.
   - **Historical pinning.**
     - Each row names its CaseSource link, and the link names one exact SourceReference revision. Both identities are immutable: a link's `sourceId`, `useRole` and `scopeNote` never change, and a revision never changes.
     - A later PAUSED or UNLINKED link, a newer source revision or group head, a newer assessment or supersession, and a changed case context each change nothing in these rows and hide none of them.
     - A successor assessment has only its own rows: nothing is merged or inherited across a supersession chain.
   - **What it never means:**
     - proof or truth of `supportedConclusion`;
     - a document review (DOCUMENT_REVIEWED);
     - an ownership, authority, permission, infringement or exception finding;
     - currentness, a G1–G7 result, readiness or READY_FOR_SIGNER.
   - **What it never does.** It resolves nothing from present-day state and states no link state: a client reads the current link state separately (`getCaseSource`) and shows it apart, as the current state. It never reads into or changes the assessment's provenance, result, scope state or epoch.
   - **Candidate scope.** An unknown candidate, an unknown or malformed assessment id, and another candidate's assessment (including any other case's) are the same `404 NOT_FOUND`. No existence, row count, CaseSource id or source metadata leaks across candidates or cases.
   - **Read only.**
     - Session-protected, no body.
     - No ETag: the rows are append-only, and API_CONTRACT_v1 §6 gives ETags to mutable resources only.
     - No If-Match, no Idempotency-Key, no write and no audit event. P1's session activity touch is not a record change.
   - **Integrity.** The response never breaks the contract or leaks. It is a 500, never returned, if:
     - a stored row names a CaseSource of another case (the write path forbids it; the table has no `case_id`, like `fact_sources`);
     - an assessment holds more than 100 rows;
     - an assessment holds no row.
5. **Storage is sufficient; no migration.**
   - The historical fact — "row X recorded `caseSourceId` Y supporting conclusion Z at T by U" — is exactly the stored row.
   - The current interpretation (whether link Y is now linked, applicable or the current revision) is never part of the read.
   - The link state at capture is known from the capture rule (LINKED). Later changes are visible through the case's audit trail and the epoch's staleness (ADR-0008).
6. **Capture requirements the read depends on** (for P4H; mirrors the accepted fact-support rules, `case-facts.service.ts`).
   - Every support names an existing CaseSource (422 `REFERENCE_NOT_FOUND`) of the assessment's case (422 `CROSS_CASE_REFERENCE`) that is LINKED at capture (409: a paused or unlinked link supports nothing new).
   - Each link at most once. The unique key is checked before any insert, as a 422 at the support's field.
   - Every row is written in the capture transaction, with the assessment's write instant and actor, and ids ascending in request order.
   - `supportedConclusion` is stored exactly: no trimming or normalization, a NUL refused before the claim.
   - Owner and scope dimension for a PASS (the design record §16): every cited source applies to the case in the capture snapshot (`applicabilityProblem` null), else a 422 with the scope code. A non-PASS finding may cite such a LINKED link of this case to record a problem truthfully (an open point for the review, D-3).
   - No service path updates or deletes a row. A superseding assessment writes only its own rows.
   - The capture response names the new rows only as ids in `meta.affectedResources`; their content is read back through this operation.
7. **Unchanged.**
   - All 289 schemas, 144 operations and 99 paths of v1.3.0 stay byte-identical and in order, including `CandidateAssessment`, `AssessmentSource`, `AssessmentSupport`, `CaptureAssessment`, `CaptureCandidateAssessmentResponse`, `CandidateAssessmentPage` and `ListCandidateAssessmentsResponse`.
   - `$id`, OpenAPI 3.1.1, servers, tags, security, and shared parameters and responses are unchanged.
   - `PFC-YT-EMAIL-v1.1` is unchanged. `AppMeta.schemaRelease` is unchanged (ADR-0004).
   - The database is unchanged.
   - The v1.1.0–v1.3.0 records and ADR-0004–ADR-0007 are byte-identical.
8. **Activation is a separate, approved step** (recommended at the start of the P4H mission, before any assessment exists). It needs:
   - the release record `docs/contracts/TB-SCHEMA-API-v1.4.0/{amendment.json,README.md}`;
   - the contract source change and generation;
   - the parity tests (`tests/contracts/release-v1-4-0.test.ts`, `release.ts` gaining the release);
   - `CONTRACT_BASELINE = 'TB-SCHEMA-API-v1.4.0'`;
   - this ADR's acceptance.

   Its known consequences are listed in the proposal:
   - every current digest changes, because the contract is in the preimage (ADR-0006/ADR-0007);
   - candidates of earlier prompts validate REVIEW_REQUIRED (version-only drift);
   - the pinned vocabulary of `TB-TECHNICAL-RULESET-v2` lacks the new release identifier, so a new ruleset version, or an explicit operator decision, must be recorded with the activation.

## Consequences

- **Compatibility: additive only.** No existing operation, path, parameter, schema, required field, enum, format, status code, header, security requirement or error code changes. One additional read.
- **Routing.** After activation and P4H, the API would route 137 business operations: today's 134 plus capture, list and this read. Until then 134, and every assessment operation stays unrouted.
- **Round trip (the acceptance scenario).** Capture with `[{S1, C1}, {S2, C2}]`, then a full reload. `listCandidateAssessments` plus this read recover the assessment's identity, S1→C1, S2→C2, `createdAt` and `createdById`, without audit parsing, client memory, database access or present-state reconstruction.
- **R14-AUD-006** becomes DESIGN_PROPOSED_PENDING_INDEPENDENT_REVIEW, pending the independent review. CandidateAssessment stays NOT_STARTED and on hold.

## Alternatives considered

- **Embed `sources` in `CandidateAssessment` or `CaptureCandidateAssessmentResponse`.** This changes strict frozen schemas, breaks strict clients and the byte-identity rule, and is excluded by the mission. Rejected.
- **A global detail aggregate `GET /assessments/{id}` → `{assessment, sources}`.** It duplicates `CandidateAssessment` into a second semantic schema and grows the response, and it gives up the candidate path scope that support reads use (ADR-0005). Rejected.
- **A paginated `listAssessmentSources`** (`limit`, `cursor`, `q`, a page schema). It would split a bounded, historically fixed set of at most 100 rows across pages. It needs cursor state and an ascending order the list convention does not use, and it invites hidden page loss. Rejected.
- **`sources: AssessmentSource[0..100]`** (the mission's design candidate). An empty list is impossible for a captured assessment and would read as "no support". The 1..100 bound states the write contract's truth, and a zero-row store is an integrity 500. Rejected in favour of 1..100; the inventory is the same.
- **Resolve each row to the current link state, a newer source revision or the source's metadata.** That is present-day state, not the stored record. Rejected: the UI reads the current link state separately.
- **A separate collection** (for example `GET /assessment-sources?assessmentId=…`). Not scoped by the candidate path. Rejected.
- **Freeze CaseSource or SourceReference state into new columns.** Not needed: the link's source identity is immutable, and the state at capture is LINKED by rule. A migration without need. Rejected.
