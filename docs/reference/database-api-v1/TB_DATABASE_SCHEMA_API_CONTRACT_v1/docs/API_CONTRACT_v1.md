# API Contract v1 — TB Notice Production System

Release: **TB-SCHEMA-API-v1.0.0** · OpenAPI **3.1.1** · Local-first · **NOT_IMPLEMENTED / NOT_DEPLOYED**.

Normative machine interface: `contracts/openapi.yaml` (JSON equivalent also included). Requests/response shapes are under components.schemas. Generated `api.types.ts` supplies TypeScript types; `zod.schemas.ts` supplies strict runtime adapters. `INVARIANTS.md` is equally mandatory: type-valid input is not sufficient for authorization, source support, valid state transitions or readiness.

## 1. Changes from the earlier technology draft

1. Choose MySQL **8.4** as the local database target, not a vague MySQL/MariaDB interchangeable pair. Production engine/hosting is intentionally unverified at this stage. Changing engine requires migration rehearsal and compatibility tests.
2. Prisma schema uses v7 layout with connection URL in root `prisma.config.ts`; this package does not assert a latest version of React/NestJS/Prisma. Actual installation versions must be resolved from official release/package metadata, pinned and committed by the bootstrap mission. No unverified prior "latest version" claim is inherited.
3. In this delivery the API JSON Schema catalog is normative and Zod/Types are generated adapters. The previous Zod-authoring-first proposal is replaced here to avoid pretending arbitrary Zod refinements have a lossless JSON Schema equivalent. One authoring direction only; never edit all representations independently. Cross-field relational/semantic checks live in INVARIANTS.md, not in claims about automatic schema conversion. Generated adapters still require actual Zod runtime/typecheck on the chosen package versions.
4. ValidationRun is a technical result. CandidateAssessment records attributable G1–G6 reviews. READY_FOR_SIGNER requires both, exact artifact binding and fresh applicable context. G7/signing/sending stay outside the product.
5. All earlier legal/policy wording snapshots need current source review in the policy ruleset before real case use. This schema release creates no legal declaration, authority or review fact.

## 2. Origin and transport

Local production-like base: `http://localhost:3000/api/v1`.
Development UI on `localhost:5173` proxies `/api` to the backend. Browser requests stay same-origin to the development UI; the dev proxy is explicitly allowlisted. Bind dev web/API/MySQL ports to loopback, not 0.0.0.0 by default. Avoid mixing localhost with 127.0.0.1 in the same browser session.

HTTPS/Secure cookies are mandatory for any non-loopback deployment. Reverse-proxy trust is configured only for actual trusted proxies. No public registration, payment, OAuth, mail-send, signature or AI-generation endpoint exists.

## 3. Session and CSRF contract

- POST `/auth/login`: strict JSON email/password. Check exact allowlisted Origin (reject null/missing for browser login), require `X-Requested-With: TB-APP`, deny CORS, rate-limit and return generic credential errors. Password comparison uses Argon2id in the implementation. Rotate the opaque session on successful login.
- Session cookie contains a random opaque token; DB stores only its digest. Production cookie: `__Host-tb_session`, Secure, HttpOnly, Path=/, SameSite=Strict, no Domain. Loopback-only HTTP cookie: `tb_session_dev`, HttpOnly, SameSite=Strict; Secure is intentionally false only in local config. Never hardcode the dev exception into production.
- Session CSRF token is derived via HMAC with a server-only key and the opaque session token; its digest can be stored for validation. This lets GET `/auth/session` return the same session-bound CSRF token after refresh without exposing the session secret. Cookie and CSRF tokens are not equal. CSRF token is not logged.
- All authenticated unsafe methods require exact Origin + JSON where body is present + X-CSRF-Token. SameSite alone is not the whole defense.
- GET `/auth/session` and all private responses use `Cache-Control: no-store`.
- POST `/auth/logout` revokes the session and clears cookie. No idempotency record stores credentials/tokens; login/logout are exempt from Idempotency-Key. POST signup is absent.
- App User/recording role never grants legal signature authority. Do not infer G7 from a login, session or successful command.

## 4. Representation rules

CamelCase JSON ↔ camelCase Prisma fields ↔ lowercase snake_case SQL names.
UUIDs are opaque strings. Canonical IDs are separate and sourced. API never accepts client-created timestamps, row versions, computed hashes, technical validation results or READY states in generic create/update DTOs.

Dates use YYYY-MM-DD when only a date is known. Actual timestamps use ISO 8601 with an explicit UTC offset; stored normalized UTC plus raw text/precision as needed. No fake timestamp inferred from ingestion. Duration milliseconds use decimal **strings**, maximum 9007199254740991, converted to native BigInt at persistence boundaries. They are never SQL TIME or JSON BigInt.

Unknown fields are rejected. PATCH omission means preserve current value; explicit null clears only a nullable field. Empty PATCH returns 422. String trimming is field-specific: names may be validated/trimmed at data entry with original attribution retained; candidate/prompt/message body is never trimmed. Requests capped at 1 MiB JSON before parsing; bodyText candidate cap 200,000 characters and a bounded byte limit. Per-object constraints are in OpenAPI; service constraints also apply.

## 5. Responses and errors

Successful JSON response:

```json
{"data": {"id": "..."}, "meta": {"requestId": "...", "affectedResources": []}}
```

List response data: `items` plus nullable `nextCursor`. Default limit 25, maximum 100. V1 ordering is stable `(createdAt DESC, id DESC)` unless explicitly specified; cursor encodes version, sort tuple and filter fingerprint, is authenticated/tamper-checked, and cannot be reused with a different filter/scope. No unbounded expand/include queries. Case timelines may display occurredAt but retain capture order separately.

Error:

```json
{"error":{"code":"CROSS_CASE_REFERENCE","message":"The work does not belong to this case.","details":{"field":"caseWorkId"},"requestId":"..."}}
```

| HTTP | Meaning |
|---|---|
| 400 | Malformed input, missing idempotency key, bad cursor |
| 401 | No usable session |
| 403 | Authenticated but unauthorized, CSRF/origin failure |
| 404 | Resource unavailable in authorized scope; do not leak other scopes |
| 409 | Semantic conflict, duplicate identity, frozen record, binding conflict, idempotency payload conflict |
| 412 | Stale If-Match or context/artifact digest precondition |
| 413 | Payload limit |
| 422 | Schema/business validation failure |
| 428 | Required If-Match/current-context precondition omitted |
| 429 | Rate limit |
| 500 | Unexpected server failure; no stack/secrets in body |

Important stable codes: RECORD_VERSION_CONFLICT, CONTEXT_CHANGED, ARTIFACT_CHANGED, CROSS_AGENCY_REFERENCE, CROSS_CASE_REFERENCE, AUTHORITY_SCOPE_UNRESOLVED, FROZEN_VERSION, REFERENCED_RECORD_CANNOT_DELETE, CANONICAL_BINDING_UNSUPPORTED, BINDING_CORRECTION_REQUIRES_RECONCILIATION, DUPLICATE_ROUTE, IDEMPOTENCY_CONFLICT, IDEMPOTENCY_IN_PROGRESS, RETRYABLE_TRANSACTION_CONFLICT, MATERIAL_REVIEW_REQUIRED, CANDIDATE_NOT_READY, SOURCE_ROLE_NOT_VERIFICATION, REPLY_PARENT_REQUIRED, SIGNATURE_MUST_REMAIN_PENDING.

## 6. Conditional mutation

GET mutable resources returns a strong `ETag`, e.g. `"CaseRecord:<UUID>:v7"`.
PATCH, archive, restore, state commands and relevant nested creates send this exact value as If-Match. The OpenAPI extension `x-precondition-target` identifies which aggregate's ETag is required. A nested create of a work/fact uses the CaseRecord ETag; editing a mapping uses that mapping's ETag but still locks and increments the parent case's context revision. Adding a coverage uses the MandateVersion ETag and draft lifecycle.

Missing -> 428. Mismatch -> 412. Business errors -> 409/422. Do not silently fetch-and-overwrite a newer version. Responses identify affected root versions in meta; the UI invalidates/refetches affected queries.

Immutable endpoints have no generic body PATCH. `.../revisions` creates a successor, using unique revision/version allocation in a parent transaction. Old candidates can spawn explicitly new versions, but old results never move to a new candidate automatically.

## 7. Idempotency

All authenticated data-writing POST/PATCH/DELETE operations except login/logout require Idempotency-Key. Prefer an independently generated random UUID/string per intent. A retry keeps the original key and payload. Scope is actor + operationId + key; the digest includes normalized path parameters, method and payload. Same key/different target or payload -> 409. A concurrent in-progress intent -> 409 IDEMPOTENCY_IN_PROGRESS with retry information.

Replay horizon is seven days (internal operational choice, not a legal deadline). Unique relational constraints still apply after horizon expiry. Do not claim exactly-once delivery or permanent deduplication.

Original successful response/status is stored atomically with the write/audit. Every replay rechecks authentication/authorization. Unsigned export additionally rechecks current readiness and can reject stale cached handoff with 412/409; an earlier success does not entitle export after revoked authority or changed dependencies. Failed transactions do not become completed idempotency successes.

## 8. Business endpoint groups

See endpoint matrix below for exact routes/DTOs. All endpoints are contract declarations, not active services.

- Directory: Agency, Owner, LegalSubject, Signer. Small create DTOs allow DRAFT; activation remains administrative.
- Associations: OwnerSubject and Route; dedicated link-state commands, no legal revocation by unlink.
- Mandates: logic record -> draft version -> coverage/signer scope -> freeze. Source-backed later events are recorded separately.
- Case: intake, sourced canonical binding, route binding, authority selections, work/item/mapping/facts/source links, manual correspondence bindings.
- Production: consistent context -> immutable prompt -> immutable imported candidate -> technical run + scoped assessments -> derived readiness -> unsigned export.
- Audit: read-only to operators. No audit UPDATE/DELETE endpoint.

Canonical-bind commands attach an already established source-backed code. They do not allocate canonical numbers, create authority, change Drive or satisfy readiness. An actual future registrar integration is a different mission.

## 9. INITIAL workflow contract

1. Create/select Agency, Owner, LegalSubject and OwnerSubject; create a Route. Link alone adds no authority.
2. Create/import mandate metadata with source pointers, coverage and candidate Signer scope. Freeze the exact version after structural consistency checks; this is not legal clearance.
3. Create local intake Case. Bind to the real canonical case record only when a sourced existing/registrar code exists. No automatic frontend counter.
4. Create ReportedItems, Works and UseMappings. Link sources and record scoped CaseFacts. Collect actual sourced gate findings, not fake owner confirmations.
5. Select authority coverage(s) + signer + intended mailbox for INITIAL. The same intended human will later sign and send outside the application.
6. GET production-context with task and mode. PREPARATION remains possible with gaps. DRAFTING requires the input contract and truthful known limits; it is not READY_FOR_SIGNER.
7. POST prompts with expected digest/revision. Copy to ChatGPT. No OpenAI API call is performed.
8. Import exact ChatGPT draft via POST candidates. Store a subject/body/envelope/document-plan artifact. Missing signature remains one controlled pending slot.
9. POST validation-runs. A technical pass does not finish the case. Record/reference actual G1–G6 assessments and exact G6 prose review; source/applicability must be checked, not inferred from filenames or checkboxes.
10. GET readiness; when currently READY_FOR_SIGNER, POST unsigned-exports. Human personally reviews, adopts, signs and transmits outside this application. An export is never AS_SENT.

## 10. NMI REPLY workflow contract

Capture the real NMI/previous messages and exact source roles; bind to the case and affected items. Select explicit NMI parent and prior AS_SENT messages/attachments. Build reply context around literal ask -> proposed answer -> support -> unresolved remainder. A missing requested document remains unresolved when prose is removed or rewritten.

REPLY follows the same candidate/technical/substantive review/export pipeline. Some replies require additional/renewed authority, some do not; decide from actual scope, never a global date/status heuristic. The algorithm must not send to an earlier branch Reply-To merely because it shares the video ID. Do not require complete repetition of an INITIAL in every reply.

## 11. Index and scale policy

Keep one API + one MySQL instance. FK/unique/compound indexes are explicit in the schema; MySQL may create additional FK backing indexes. Query shape matters more than adding services. Heavy list endpoints use explicit summary DTOs for sources, facts, correspondence, prompts, candidates and validation runs. Full bodies/manifests are fetched through detail endpoints or a scoped production-context view. Do not silently return the full database row in place of a summary DTO.

Measured pagination, index plans, request limits and baseline E2E performance tests precede production. There is no claim that an untested schema is guaranteed to handle a particular case count/throughput. The full endpoint catalog does not require one screen or one microservice per endpoint; implement by feature phases.

## 12. Two-PC local workflow

Both Windows PCs use the same private Git repository, pinned toolchain/DB image, committed migrations and synthetic fixtures. Each PC has its own .env and database. Only the active feature writer creates migrations. The other PC applies them; never regenerate or edit an applied migration to make local drift disappear.

Git synchronizes code/specs, not database volumes or uncommitted data. WIP commits belong to a branch; no production credentials, private evidence, raw mail or real owner confirmations in seed files. No production deployment or shared database is created by this contract.

## 13. Full endpoint matrix

| Method | Path (under /api/v1) | Request DTO | Success DTO | ETag target |
|---|---|---|---|---|
| GET | `/health` | `—` | `Health` | Digest/latest-head where applicable |
| GET | `/meta` | `—` | `AppMeta` | Digest/latest-head where applicable |
| POST | `/auth/login` | `LoginRequest` | `SessionView` | Digest/latest-head where applicable |
| GET | `/auth/session` | `—` | `SessionView` | Digest/latest-head where applicable |
| POST | `/auth/logout` | `—` | `204` | Digest/latest-head where applicable |
| GET | `/agencies` | `—` | `AgencyPage` | Digest/latest-head where applicable |
| POST | `/agencies` | `CreateAgency` | `Agency` | Digest/latest-head where applicable |
| GET | `/agencies/{id}` | `—` | `Agency` | Digest/latest-head where applicable |
| PATCH | `/agencies/{id}` | `PatchAgency` | `Agency` | Agency |
| DELETE | `/agencies/{id}` | `—` | `204` | Agency |
| POST | `/agencies/{id}/archive` | `ArchiveRequest` | `Agency` | Agency |
| POST | `/agencies/{id}/restore` | `ArchiveRequest` | `Agency` | Agency |
| POST | `/agencies/{id}/canonical-bindings` | `CanonicalBindingRequest` | `Agency` | Agency |
| POST | `/agencies/{id}/state` | `RecordStateRequest` | `Agency` | Agency |
| GET | `/owners` | `—` | `OwnerPage` | Digest/latest-head where applicable |
| POST | `/owners` | `CreateOwner` | `Owner` | Digest/latest-head where applicable |
| GET | `/owners/{id}` | `—` | `Owner` | Digest/latest-head where applicable |
| PATCH | `/owners/{id}` | `PatchOwner` | `Owner` | Owner |
| DELETE | `/owners/{id}` | `—` | `204` | Owner |
| POST | `/owners/{id}/archive` | `ArchiveRequest` | `Owner` | Owner |
| POST | `/owners/{id}/restore` | `ArchiveRequest` | `Owner` | Owner |
| POST | `/owners/{id}/canonical-bindings` | `CanonicalBindingRequest` | `Owner` | Owner |
| POST | `/owners/{id}/state` | `RecordStateRequest` | `Owner` | Owner |
| GET | `/legal-subjects` | `—` | `LegalSubjectPage` | Digest/latest-head where applicable |
| POST | `/legal-subjects` | `CreateLegalSubject` | `LegalSubject` | Digest/latest-head where applicable |
| GET | `/legal-subjects/{id}` | `—` | `LegalSubject` | Digest/latest-head where applicable |
| PATCH | `/legal-subjects/{id}` | `PatchLegalSubject` | `LegalSubject` | LegalSubject |
| DELETE | `/legal-subjects/{id}` | `—` | `204` | LegalSubject |
| POST | `/legal-subjects/{id}/archive` | `ArchiveRequest` | `LegalSubject` | LegalSubject |
| POST | `/legal-subjects/{id}/restore` | `ArchiveRequest` | `LegalSubject` | LegalSubject |
| POST | `/legal-subjects/{id}/canonical-bindings` | `CanonicalBindingRequest` | `LegalSubject` | LegalSubject |
| POST | `/legal-subjects/{id}/state` | `RecordStateRequest` | `LegalSubject` | LegalSubject |
| GET | `/signers` | `—` | `SignerPage` | Digest/latest-head where applicable |
| POST | `/signers` | `CreateSigner` | `Signer` | Digest/latest-head where applicable |
| GET | `/signers/{id}` | `—` | `Signer` | Digest/latest-head where applicable |
| PATCH | `/signers/{id}` | `PatchSigner` | `Signer` | Signer |
| DELETE | `/signers/{id}` | `—` | `204` | Signer |
| POST | `/signers/{id}/archive` | `ArchiveRequest` | `Signer` | Signer |
| POST | `/signers/{id}/restore` | `ArchiveRequest` | `Signer` | Signer |
| POST | `/signers/{id}/canonical-bindings` | `CanonicalBindingRequest` | `Signer` | Signer |
| POST | `/signers/{id}/state` | `SignerStateRequest` | `Signer` | Signer |
| GET | `/routes` | `—` | `RoutePage` | Digest/latest-head where applicable |
| POST | `/routes` | `CreateRoute` | `Route` | Digest/latest-head where applicable |
| GET | `/routes/{id}` | `—` | `Route` | Digest/latest-head where applicable |
| PATCH | `/routes/{id}` | `PatchRoute` | `Route` | Route |
| DELETE | `/routes/{id}` | `—` | `204` | Route |
| POST | `/routes/{id}/archive` | `ArchiveRequest` | `Route` | Route |
| POST | `/routes/{id}/restore` | `ArchiveRequest` | `Route` | Route |
| POST | `/routes/{id}/canonical-bindings` | `CanonicalBindingRequest` | `Route` | Route |
| POST | `/routes/{id}/link-state` | `LinkStateRequest` | `Route` | Route |
| GET | `/mandates` | `—` | `MandatePage` | Digest/latest-head where applicable |
| POST | `/mandates` | `CreateMandate` | `Mandate` | Digest/latest-head where applicable |
| GET | `/mandates/{id}` | `—` | `Mandate` | Digest/latest-head where applicable |
| PATCH | `/mandates/{id}` | `PatchMandate` | `Mandate` | Mandate |
| DELETE | `/mandates/{id}` | `—` | `204` | Mandate |
| POST | `/mandates/{id}/archive` | `ArchiveRequest` | `Mandate` | Mandate |
| POST | `/mandates/{id}/restore` | `ArchiveRequest` | `Mandate` | Mandate |
| POST | `/mandates/{id}/canonical-bindings` | `CanonicalBindingRequest` | `Mandate` | Mandate |
| GET | `/owners/{ownerId}/subjects` | `—` | `OwnerSubjectPage` | Digest/latest-head where applicable |
| POST | `/owners/{ownerId}/subjects` | `LinkOwnerSubject` | `OwnerSubject` | Owner |
| GET | `/owner-subjects/{id}` | `—` | `OwnerSubject` | Digest/latest-head where applicable |
| POST | `/owner-subjects/{id}/link-state` | `LinkStateRequest` | `OwnerSubject` | OwnerSubject |
| GET | `/mandates/{mandateId}/versions` | `—` | `MandateVersionPage` | Digest/latest-head where applicable |
| POST | `/mandates/{mandateId}/versions` | `CreateMandateVersion` | `MandateVersion` | Mandate |
| GET | `/mandate-versions/{id}` | `—` | `MandateVersion` | Digest/latest-head where applicable |
| PATCH | `/mandate-versions/{id}` | `PatchMandateVersion` | `MandateVersion` | MandateVersion |
| POST | `/mandate-versions/{id}/freeze` | `ArchiveRequest` | `MandateVersion` | MandateVersion |
| GET | `/mandate-versions/{versionId}/coverages` | `—` | `MandateCoveragePage` | Digest/latest-head where applicable |
| POST | `/mandate-versions/{versionId}/coverages` | `CreateCoverage` | `MandateCoverage` | MandateVersion |
| GET | `/coverages/{id}` | `—` | `MandateCoverage` | Digest/latest-head where applicable |
| PATCH | `/coverages/{id}` | `PatchCoverage` | `MandateCoverage` | MandateCoverage |
| GET | `/coverages/{coverageId}/signers` | `—` | `CoverageSignerPage` | Digest/latest-head where applicable |
| POST | `/coverages/{coverageId}/signers` | `CreateCoverageSigner` | `CoverageSigner` | MandateCoverage |
| GET | `/coverage-signers/{id}` | `—` | `CoverageSigner` | Digest/latest-head where applicable |
| DELETE | `/coverage-signers/{id}` | `—` | `204` | CoverageSigner |
| POST | `/mandates/{mandateId}/events` | `CreateAuthorityEvent` | `AuthorityEvent` | Mandate |
| GET | `/mandates/{mandateId}/events` | `—` | `AuthorityEventPage` | Digest/latest-head where applicable |
| GET | `/cases` | `—` | `CaseRecordPage` | Digest/latest-head where applicable |
| POST | `/cases` | `CreateCase` | `CaseRecord` | Digest/latest-head where applicable |
| GET | `/cases/{caseId}` | `—` | `CaseRecord` | Digest/latest-head where applicable |
| PATCH | `/cases/{caseId}` | `PatchCase` | `CaseRecord` | CaseRecord |
| DELETE | `/cases/{caseId}` | `—` | `204` | CaseRecord |
| POST | `/cases/{caseId}/archive` | `ArchiveRequest` | `CaseRecord` | CaseRecord |
| POST | `/cases/{caseId}/restore` | `ArchiveRequest` | `CaseRecord` | CaseRecord |
| POST | `/cases/{caseId}/workflow` | `CaseWorkflowRequest` | `CaseRecord` | CaseRecord |
| POST | `/cases/{caseId}/route-binding` | `BindCaseRoute` | `CaseRecord` | CaseRecord |
| POST | `/cases/{caseId}/canonical-binding` | `CanonicalBindingRequest` | `CaseRecord` | CaseRecord |
| POST | `/cases/{caseId}/authority-selections` | `SelectAuthority` | `CaseAuthoritySelection` | CaseRecord |
| GET | `/cases/{caseId}/authority-selections` | `—` | `CaseAuthoritySelectionPage` | Digest/latest-head where applicable |
| GET | `/cases/{caseId}/reported-items` | `—` | `ReportedItemPage` | Digest/latest-head where applicable |
| POST | `/cases/{caseId}/reported-items` | `CreateReportedItem` | `ReportedItem` | CaseRecord |
| GET | `/cases/{caseId}/reported-items/{id}` | `—` | `ReportedItem` | Digest/latest-head where applicable |
| PATCH | `/cases/{caseId}/reported-items/{id}` | `PatchReportedItem` | `ReportedItem` | ReportedItem |
| POST | `/cases/{caseId}/reported-items/{id}/archive` | `ArchiveRequest` | `ReportedItem` | ReportedItem |
| POST | `/cases/{caseId}/reported-items/{id}/restore` | `ArchiveRequest` | `ReportedItem` | ReportedItem |
| GET | `/cases/{caseId}/works` | `—` | `CaseWorkPage` | Digest/latest-head where applicable |
| POST | `/cases/{caseId}/works` | `CreateCaseWork` | `CaseWork` | CaseRecord |
| GET | `/cases/{caseId}/works/{id}` | `—` | `CaseWork` | Digest/latest-head where applicable |
| PATCH | `/cases/{caseId}/works/{id}` | `PatchCaseWork` | `CaseWork` | CaseWork |
| POST | `/cases/{caseId}/works/{id}/archive` | `ArchiveRequest` | `CaseWork` | CaseWork |
| POST | `/cases/{caseId}/works/{id}/restore` | `ArchiveRequest` | `CaseWork` | CaseWork |
| GET | `/cases/{caseId}/mappings` | `—` | `UseMappingPage` | Digest/latest-head where applicable |
| POST | `/cases/{caseId}/mappings` | `CreateUseMapping` | `UseMapping` | CaseRecord |
| GET | `/cases/{caseId}/mappings/{id}` | `—` | `UseMapping` | Digest/latest-head where applicable |
| PATCH | `/cases/{caseId}/mappings/{id}` | `PatchUseMapping` | `UseMapping` | UseMapping |
| POST | `/cases/{caseId}/mappings/{id}/archive` | `ArchiveRequest` | `UseMapping` | UseMapping |
| POST | `/cases/{caseId}/mappings/{id}/restore` | `ArchiveRequest` | `UseMapping` | UseMapping |
| GET | `/sources` | `—` | `SourceReferencePage` | Digest/latest-head where applicable |
| POST | `/sources` | `CreateSource` | `SourceReference` | Digest/latest-head where applicable |
| GET | `/sources/{id}` | `—` | `SourceReference` | Digest/latest-head where applicable |
| POST | `/sources/{id}/revisions` | `ReviseSource` | `SourceReference` | Digest/latest-head where applicable |
| GET | `/cases/{caseId}/sources` | `—` | `CaseSourcePage` | Digest/latest-head where applicable |
| POST | `/cases/{caseId}/sources` | `LinkCaseSource` | `CaseSource` | CaseRecord |
| GET | `/case-sources/{id}` | `—` | `CaseSource` | Digest/latest-head where applicable |
| POST | `/case-sources/{id}/link-state` | `LinkStateRequest` | `CaseSource` | CaseSource |
| GET | `/cases/{caseId}/facts` | `—` | `CaseFactPage` | Digest/latest-head where applicable |
| POST | `/cases/{caseId}/facts` | `CreateFact` | `CaseFact` | CaseRecord |
| GET | `/cases/{caseId}/facts/{id}` | `—` | `CaseFact` | Digest/latest-head where applicable |
| POST | `/cases/{caseId}/facts/{id}/revisions` | `ReviseFact` | `CaseFact` | CaseRecord |
| GET | `/correspondence` | `—` | `CorrespondencePage` | Digest/latest-head where applicable |
| POST | `/correspondence` | `CreateCorrespondence` | `Correspondence` | Digest/latest-head where applicable |
| GET | `/correspondence/{id}` | `—` | `Correspondence` | Digest/latest-head where applicable |
| POST | `/cases/{caseId}/correspondence-bindings` | `BindCorrespondence` | `CorrespondenceBinding` | CaseRecord |
| GET | `/cases/{caseId}/correspondence-bindings` | `—` | `CorrespondenceBindingPage` | Digest/latest-head where applicable |
| GET | `/cases/{caseId}/production-context` | `—` | `ContextView` | Digest/latest-head where applicable |
| POST | `/cases/{caseId}/prompts` | `GeneratePrompt` | `PromptSnapshot` | Digest/latest-head where applicable |
| GET | `/cases/{caseId}/prompts` | `—` | `PromptSnapshotPage` | Digest/latest-head where applicable |
| GET | `/prompts/{id}` | `—` | `PromptSnapshot` | Digest/latest-head where applicable |
| POST | `/cases/{caseId}/candidates` | `CreateCandidate` | `NoticeCandidate` | Digest/latest-head where applicable |
| GET | `/cases/{caseId}/candidates` | `—` | `NoticeCandidatePage` | Digest/latest-head where applicable |
| GET | `/candidates/{id}` | `—` | `NoticeCandidate` | Digest/latest-head where applicable |
| POST | `/candidates/{id}/revisions` | `ReviseCandidate` | `NoticeCandidate` | Digest/latest-head where applicable |
| POST | `/candidates/{id}/supersede` | `ArchiveRequest` | `NoticeCandidate` | Digest/latest-head where applicable |
| POST | `/candidates/{candidateId}/validation-runs` | `ValidateCandidate` | `ValidationRun` | Digest/latest-head where applicable |
| GET | `/candidates/{candidateId}/validation-runs` | `—` | `ValidationRunPage` | Digest/latest-head where applicable |
| GET | `/validation-runs/{id}/issues` | `—` | `ValidationIssuePage` | Digest/latest-head where applicable |
| POST | `/candidates/{candidateId}/assessments` | `CaptureAssessment` | `CandidateAssessment` | Digest/latest-head where applicable |
| GET | `/candidates/{candidateId}/assessments` | `—` | `CandidateAssessmentPage` | Digest/latest-head where applicable |
| GET | `/candidates/{candidateId}/readiness` | `—` | `Readiness` | Digest/latest-head where applicable |
| POST | `/candidates/{candidateId}/unsigned-exports` | `ExportUnsigned` | `UnsignedExport` | Digest/latest-head where applicable |
| GET | `/audit-events` | `—` | `AuditEventPage` | Digest/latest-head where applicable |
