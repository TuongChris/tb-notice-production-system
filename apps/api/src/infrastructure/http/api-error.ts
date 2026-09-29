// Intentional API errors, rendered by ApiExceptionFilter as the contract OperationError envelope
// `{ error: { code, message, details, requestId } }` (API_CONTRACT_v1 §5). Messages are fixed text:
// they never include request values, credentials, tokens or internal error messages.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Readonly<Record<string, unknown>> = {},
    readonly headers: Readonly<Record<string, string>> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

export const apiErrors = {
  malformedRequest: () => new ApiError(400, 'MALFORMED_REQUEST', 'The request body is malformed.'),
  unsupportedContentType: () =>
    new ApiError(400, 'UNSUPPORTED_CONTENT_TYPE', 'Request bodies must be application/json.'),
  validationFailed: (issues: readonly ValidationIssue[]) =>
    new ApiError(400, 'VALIDATION_FAILED', 'The request body does not match the contract.', {
      issues,
    }),
  sessionRequired: () => new ApiError(401, 'SESSION_REQUIRED', 'A valid session is required.'),
  originRejected: () =>
    new ApiError(
      403,
      'ORIGIN_REJECTED',
      'The request origin is not an allowed application origin.',
    ),
  requestedWithRequired: () =>
    new ApiError(
      403,
      'REQUESTED_WITH_REQUIRED',
      'The X-Requested-With: TB-APP header is required.',
    ),
  csrfTokenInvalid: () =>
    new ApiError(403, 'CSRF_TOKEN_INVALID', 'A valid X-CSRF-Token header is required.'),
  invalidCredentials: () =>
    new ApiError(403, 'INVALID_CREDENTIALS', 'The email address or password is not accepted.'),
  notFound: () => new ApiError(404, 'NOT_FOUND', 'The requested resource does not exist.'),
  payloadTooLarge: () =>
    new ApiError(413, 'PAYLOAD_TOO_LARGE', 'The request body exceeds the 1 MiB limit.'),
  /** Same condition for operations whose contract does not declare 413 (see ApiExceptionFilter). */
  payloadTooLargeAs400: () =>
    new ApiError(400, 'PAYLOAD_TOO_LARGE', 'The request body exceeds the 1 MiB limit.'),
  loginRateLimited: (retryAfterSeconds: number) =>
    new ApiError(
      429,
      'LOGIN_RATE_LIMITED',
      'Too many sign-in attempts. Try again later.',
      { retryAfterSeconds },
      { 'Retry-After': String(retryAfterSeconds) },
    ),
  internal: () => new ApiError(500, 'INTERNAL_ERROR', 'The server could not complete the request.'),

  // Business operations (P2). 422 is declared for every directory operation: schema and business
  // validation failures use it (API_CONTRACT_v1 §5; "Empty PATCH returns 422", §4).
  bodyValidationFailed: (issues: readonly ValidationIssue[]) =>
    new ApiError(422, 'VALIDATION_FAILED', 'The request body does not match the contract.', {
      issues,
    }),
  invalidQueryParameter: (parameter: string) =>
    new ApiError(400, 'INVALID_QUERY_PARAMETER', 'A query parameter is invalid.', { parameter }),
  invalidCursor: () =>
    new ApiError(400, 'INVALID_CURSOR', 'The pagination cursor is not valid for this list.'),
  idempotencyKeyRequired: () =>
    new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'An Idempotency-Key header is required.'),
  idempotencyKeyInvalid: () =>
    new ApiError(
      400,
      'IDEMPOTENCY_KEY_INVALID',
      'The Idempotency-Key must be 16–100 characters from A–Z, a–z, 0–9, "_" and "-".',
    ),
  idempotencyConflict: () =>
    new ApiError(
      409,
      'IDEMPOTENCY_CONFLICT',
      'This Idempotency-Key was already used for a different request.',
    ),
  idempotencyInProgress: (retryAfterSeconds: number) =>
    new ApiError(
      409,
      'IDEMPOTENCY_IN_PROGRESS',
      'A request with this Idempotency-Key is still in progress. Retry with the same key.',
      { retryAfterSeconds },
      { 'Retry-After': String(retryAfterSeconds) },
    ),
  retryableTransactionConflict: () =>
    new ApiError(
      409,
      'RETRYABLE_TRANSACTION_CONFLICT',
      'The change collided with a concurrent change. Retry with the same Idempotency-Key.',
    ),
  preconditionRequired: () =>
    new ApiError(
      428,
      'PRECONDITION_REQUIRED',
      'An If-Match header with the current ETag of the record is required.',
    ),
  recordVersionConflict: () =>
    new ApiError(
      412,
      'RECORD_VERSION_CONFLICT',
      'The record changed after it was read. Reload it; nothing was changed.',
    ),
  referenceNotFound: (field: string) =>
    new ApiError(422, 'REFERENCE_NOT_FOUND', 'A referenced record does not exist.', { field }),
  crossAgencyReference: (field: string, subject: 'source' | 'record' | 'scope' = 'source') =>
    new ApiError(
      422,
      'CROSS_AGENCY_REFERENCE',
      {
        source: 'The referenced source belongs to another agency.',
        record: 'The referenced record belongs to another agency.',
        scope: "An agency's own source cannot be scoped to another agency.",
      }[subject],
      { field },
    ),
  sourceScopeUnresolved: (field: string, reason: string) =>
    new ApiError(
      422,
      'SOURCE_SCOPE_UNRESOLVED',
      "The referenced source's recorded scope does not include this record.",
      { field, reason },
    ),
  fieldAttributionInvalid: (issues: readonly ValidationIssue[]) =>
    new ApiError(422, 'FIELD_ATTRIBUTION_INVALID', 'A field attribution is not acceptable.', {
      issues,
    }),
  recordStateConflict: (details: Readonly<Record<string, unknown>>) =>
    new ApiError(
      409,
      'RECORD_STATE_CONFLICT',
      "The operation is not allowed in the record's current state.",
      details,
    ),
  establishedIdentityImmutable: (fields: readonly string[], establishedBy: readonly string[]) =>
    new ApiError(
      409,
      'ESTABLISHED_IDENTITY_IMMUTABLE',
      'Identity fields of an established record cannot be set, changed or cleared by a generic update.',
      { fields, establishedBy },
    ),
  referencedRecordCannotDelete: (blockers: readonly string[]) =>
    new ApiError(
      409,
      'REFERENCED_RECORD_CANNOT_DELETE',
      'Only an unused, unbound local draft can be deleted. Archive the record instead.',
      { blockers },
    ),
  duplicateOwnerSubject: (ownerSubjectId: string | null) =>
    new ApiError(
      409,
      'DUPLICATE_OWNER_SUBJECT',
      'This owner and legal subject are already associated. Use the existing association.',
      ownerSubjectId === null ? {} : { ownerSubjectId },
    ),
  dependentRoutesLinked: (routes: number) =>
    new ApiError(
      409,
      'DEPENDENT_ROUTES_LINKED',
      'Linked or paused routes still depend on this association; it cannot be unlinked.',
      { routes },
    ),

  // Sources, canonical bindings and routes (P3A).
  crossOwnerReference: (field: string, ownerId: string, subject: 'source' | 'route' = 'source') =>
    new ApiError(
      422,
      'CROSS_OWNER_REFERENCE',
      {
        source: "The referenced source is already recorded as another owner's material.",
        route: "The route belongs to another owner than the case's owner hint.",
      }[subject],
      { field, ownerId },
    ),
  contentHashIncomplete: (field: string) =>
    new ApiError(
      422,
      'CONTENT_HASH_INCOMPLETE',
      'A content hash needs its hash target, and a hash target needs its content hash.',
      { field },
    ),
  reviewUnattributed: (field: string) =>
    new ApiError(
      422,
      'REVIEW_UNATTRIBUTED',
      'DOCUMENT_REVIEWED is only recorded with the reviewer who reviewed the document.',
      { field },
    ),
  revisionNotHead: (headId: string | null, subject: 'source' | 'fact' | 'candidate' = 'source') =>
    new ApiError(
      409,
      'REVISION_NOT_HEAD',
      {
        source: 'Only the current revision of a source can be revised.',
        fact: 'Only the current revision of a case fact can be revised.',
        candidate:
          'Only the latest version of a candidate chain can be revised: a candidate history does not fork. Revise the latest version instead.',
      }[subject],
      headId === null ? {} : { headId },
    ),
  revisionScopeChange: (
    fields: readonly string[],
    subject: 'source' | 'fact' | 'binding' | 'candidate' | 'assessment' = 'source',
  ) =>
    new ApiError(
      422,
      'REVISION_SCOPE_CHANGE',
      {
        source:
          "A revision keeps the source's agency and scope; a different scope needs a new source.",
        fact: "A revision keeps the fact's type and scope; a different type or scope needs a new fact.",
        binding:
          'A correction keeps the captured message of the binding it corrects; another message needs its own binding.',
        candidate:
          "A revision keeps the candidate's case and task: its prompt snapshot must be of the same case and task. A draft for another task needs its own candidate.",
        assessment:
          'A successor keeps the candidate and the gate of the assessment it supersedes; a review of another candidate or gate is its own assessment.',
      }[subject],
      { fields },
    ),
  sourceNotCurrent: (field: string, currentSourceId: string) =>
    new ApiError(
      409,
      'SOURCE_NOT_CURRENT',
      'The referenced source has a newer revision; bind the current revision.',
      { field, currentSourceId },
    ),
  sourceRoleNotVerification: (field: string, sourceRole: string) =>
    new ApiError(
      422,
      'SOURCE_ROLE_NOT_VERIFICATION',
      'A canonical binding needs a source recorded as a canonical record.',
      { field, sourceRole },
    ),
  bindingCorrectionRequiresReconciliation: (
    current: Readonly<Record<string, unknown>>,
    binding: 'canonical' | 'route' = 'canonical',
  ) =>
    new ApiError(
      409,
      'BINDING_CORRECTION_REQUIRES_RECONCILIATION',
      {
        canonical:
          'The record already has a canonical binding; changing it needs a reconciliation workflow.',
        route:
          'The case already has history on its bound route; changing the route needs a reconciliation workflow.',
      }[binding],
      current,
    ),
  duplicateCanonicalCode: (recordId: string | null) =>
    new ApiError(
      409,
      'DUPLICATE_CANONICAL_CODE',
      'Another record of this kind already has this canonical code.',
      recordId === null ? {} : { recordId },
    ),
  duplicateRoute: (routeId: string | null) =>
    new ApiError(
      409,
      'DUPLICATE_ROUTE',
      'A route for this agency, association and platform already exists. Use that route.',
      routeId === null ? {} : { routeId },
    ),

  // Representation authority (P3B). FROZEN_VERSION and AUTHORITY_SCOPE_UNRESOLVED are frozen stable
  // codes (API_CONTRACT_v1 §5); the others are operation-specific codes in the free-string `code`
  // field with the contracted statuses (R6 interpretation 10).
  frozenVersion: (details: Readonly<Record<string, unknown>>) =>
    new ApiError(
      409,
      'FROZEN_VERSION',
      'The mandate version is frozen: it and its coverages and signers can no longer change. Record a successor version or an authority event instead.',
      details,
    ),
  versionNotFrozen: (field: string, versionId: string) =>
    new ApiError(
      409,
      'VERSION_NOT_FROZEN',
      'The referenced mandate version is still a draft; only a frozen version can be used here.',
      { field, versionId },
    ),
  versionSuccessorExists: (field: string, successorId: string) =>
    new ApiError(
      409,
      'VERSION_SUCCESSOR_EXISTS',
      'The predecessor version already has a successor; a version chain does not fork.',
      { field, successorId },
    ),
  authorityScopeUnresolved: (field: string, reason: string) =>
    new ApiError(
      422,
      'AUTHORITY_SCOPE_UNRESOLVED',
      'The referenced authority record belongs to another mandate, route or scope.',
      { field, reason },
    ),
  dateRangeInvalid: (fields: readonly string[], details: Readonly<Record<string, unknown>> = {}) =>
    new ApiError(422, 'DATE_RANGE_INVALID', 'A start date is after its end date.', {
      fields,
      ...details,
    }),
  documentStateUnsupported: (field: string) =>
    new ApiError(
      422,
      'DOCUMENT_STATE_UNSUPPORTED',
      'A document state describes a document: cite the primary source it describes.',
      { field },
    ),
  reviewUnsupported: (field: string, reason: string) =>
    new ApiError(
      422,
      'REVIEW_UNSUPPORTED',
      'A review is recorded only when a cited source records who reviewed the document (DOCUMENT_REVIEWED with its reviewer).',
      { field, reason },
    ),
  duplicateCoverage: (coverageId: string | null) =>
    new ApiError(
      409,
      'DUPLICATE_COVERAGE',
      'This version already has a coverage with this label for this route.',
      coverageId === null ? {} : { coverageId },
    ),
  duplicateCoverageSigner: (coverageSignerId: string | null) =>
    new ApiError(
      409,
      'DUPLICATE_COVERAGE_SIGNER',
      'This signer is already recorded under this coverage in this capacity.',
      coverageSignerId === null ? {} : { coverageSignerId },
    ),
  eventAlreadySuperseded: (successorId: string | null) =>
    new ApiError(
      409,
      'EVENT_ALREADY_SUPERSEDED',
      'The referenced authority event already has a successor; an event history does not fork.',
      successorId === null ? {} : { successorId },
    ),

  // Case core and case authority selection (P4A). CROSS_CASE_REFERENCE is a frozen stable code
  // (API_CONTRACT_v1 §5); DUPLICATE_CASE_SOURCE is an operation-specific code (R6 interpretation 10).
  crossCaseReference: (field: string, subject: 'source' | 'record' = 'source') =>
    new ApiError(
      422,
      'CROSS_CASE_REFERENCE',
      {
        source: 'The referenced source is scoped to another case, so it cannot support this case.',
        record: 'The referenced record belongs to another case.',
      }[subject],
      { field },
    ),
  duplicateCaseSource: (caseSourceId: string | null) =>
    new ApiError(
      409,
      'DUPLICATE_CASE_SOURCE',
      'This source is already linked to this case in this role. Change the existing link instead.',
      caseSourceId === null ? {} : { caseSourceId },
    ),

  // Case intake material (P4B): operation-specific codes in the free-string `code` field with the
  // contracted statuses (R6 interpretation 10); CROSS_CASE_REFERENCE and REVISION_NOT_HEAD above
  // are reused.
  reportedUrlUnsupported: (field: string, reason: string) =>
    new ApiError(
      422,
      'REPORTED_URL_UNSUPPORTED',
      'Only a YouTube video address (youtube.com/watch?v=…, youtu.be/…, youtube.com/shorts/… or youtube.com/live/…) can be recorded as a reported item. Nothing was fetched.',
      { field, reason },
    ),
  duplicateReportedItem: (reportedItemId: string | null) =>
    new ApiError(
      409,
      'DUPLICATE_REPORTED_ITEM',
      'This case already has a reported item for this video. Use the existing reported item.',
      reportedItemId === null ? {} : { reportedItemId },
    ),
  duplicateUseMapping: (useMappingId: string | null) =>
    new ApiError(
      409,
      'DUPLICATE_USE_MAPPING',
      'This work, reported item and occurrence are already mapped. Use the existing mapping or another occurrence number.',
      useMappingId === null ? {} : { useMappingId },
    ),
  timeRangeInvalid: (fields: readonly string[]) =>
    new ApiError(422, 'TIME_RANGE_INVALID', 'A known end time must be after its start time.', {
      fields,
    }),
  factScopeInvalid: (field: string, scopeKind: string, reason: string) =>
    new ApiError(
      422,
      'FACT_SCOPE_INVALID',
      'A fact names exactly the record of its scope: none for CASE, the work for WORK, the reported item for REPORTED_ITEM, the mapping for USE.',
      { field, scopeKind, reason },
    ),

  // Correspondence capture and case bindings (P4C): operation-specific codes in the free-string
  // `code` field with the contracted statuses (R6 interpretation 10); CROSS_AGENCY_REFERENCE,
  // CROSS_CASE_REFERENCE, REFERENCE_NOT_FOUND and REVISION_SCOPE_CHANGE above are reused.
  capturePostureUnsupported: (field: string, reason: string) =>
    new ApiError(
      422,
      'CAPTURE_POSTURE_UNSUPPORTED',
      'The recorded capture posture is not supported by this record: a raw-source capture and a raw-MIME attachment observation reference the raw source, and an excerpt is not the full message.',
      { field, reason },
    ),
  outcomeItemRequired: (reason: 'OUTCOME_EVENT' | 'OUTCOME_VALUE') =>
    new ApiError(
      422,
      'OUTCOME_ITEM_REQUIRED',
      'An outcome is recorded for one specific reported item of the case; name the reported item.',
      { field: 'reportedItemId', reason },
    ),
  bindingAlreadySuperseded: (successorId: string | null) =>
    new ApiError(
      409,
      'BINDING_ALREADY_SUPERSEDED',
      'The referenced binding already has a correction; a binding history does not fork. Correct the latest binding instead.',
      successorId === null ? {} : { successorId },
    ),

  // Production context (P4D, read-only): REPLY_PARENT_REQUIRED is a frozen stable code
  // (API_CONTRACT_v1 §5); SELECTOR_NOT_FOR_TASK, PRIOR_BINDING_NOT_AS_SENT, DRAFTING_INPUT_MISSING
  // and PRODUCTION_CONTEXT_TOO_LARGE are operation-specific codes in the free-string `code` field
  // with the contracted statuses (R6 interpretation 10). REFERENCE_NOT_FOUND, CROSS_CASE_REFERENCE
  // and BINDING_ALREADY_SUPERSEDED above are reused.
  selectorNotForTask: (field: string, taskType: string) =>
    new ApiError(
      422,
      'SELECTOR_NOT_FOR_TASK',
      'An INITIAL context has no parent message and no prior transmissions: parentBindingId and priorBindingIds apply to an NMI_REPLY context only.',
      { field, taskType },
    ),
  replyParentRequired: (details: Readonly<Record<string, unknown>>) =>
    new ApiError(
      422,
      'REPLY_PARENT_REQUIRED',
      'A reply starts from the exact binding of the NMI it answers: name a binding of this case recorded as NMI. Nothing is chosen for you.',
      details,
    ),
  priorBindingNotAsSent: (field: string, eventType: string) =>
    new ApiError(
      422,
      'PRIOR_BINDING_NOT_AS_SENT',
      "A prior transmission is a binding recorded as sent (INITIAL_AS_SENT, REPLY_AS_SENT, SUPPLEMENT_AS_SENT or CORRECTION_AS_SENT); another event type, or a message's direction, is not one.",
      { field, eventType },
    ),
  selectedBindingSuperseded: (field: string, successorId: string) =>
    new ApiError(
      409,
      'BINDING_ALREADY_SUPERSEDED',
      'The named binding has been corrected by a later binding of this case. The correction is not used in its place: name it explicitly to use the corrected interpretation.',
      { field, successorId },
    ),
  draftingInputMissing: (missing: readonly string[]) =>
    new ApiError(
      422,
      'DRAFTING_INPUT_MISSING',
      'DRAFTING needs the recorded input the Production Form Contract requires. PREPARATION returns the same context with what is missing; nothing is filled in.',
      { missing },
    ),
  productionContextTooLarge: (field: string, count: number, maximum: number) =>
    new ApiError(
      409,
      'PRODUCTION_CONTEXT_TOO_LARGE',
      'The recorded context exceeds a contracted bound of the production context. Nothing is cut off, so it cannot be returned.',
      { field, count, maximum },
    ),
  /** A prompt is generated only against the exact context revision and digest the caller reviewed. */
  contextChanged: (field: 'expectedContextRevision' | 'expectedDependencyDigest') =>
    new ApiError(
      412,
      'CONTEXT_CHANGED',
      'The recorded context changed after it was read. Review the current context before generating again; no prompt was generated.',
      { field },
    ),
  promptTooLarge: (field: string, count: number, maximum: number) =>
    new ApiError(
      409,
      'PROMPT_TOO_LARGE',
      'The prompt snapshot would exceed a contracted bound. Nothing is cut off, so no prompt was generated.',
      { field, count, maximum },
    ),

  // Notice candidates (P4F): REFERENCE_NOT_FOUND, CROSS_CASE_REFERENCE, REPLY_PARENT_REQUIRED,
  // REVISION_NOT_HEAD and REVISION_SCOPE_CHANGE above are reused. ENVELOPE_PARENT_MISMATCH,
  // ENVELOPE_SENDER_MISMATCH, DOCUMENT_PLAN_UNSUPPORTED and CANDIDATE_ALREADY_SUPERSEDED are
  // operation-specific codes in the free-string `code` field with the contracted statuses (R6
  // interpretation 10).
  envelopeParentMismatch: (promptParentBindingId: string | null) =>
    new ApiError(
      422,
      'ENVELOPE_PARENT_MISMATCH',
      "A candidate keeps the reply thread of its prompt snapshot: envelope.parentBindingId must be the prompt's parent binding, and none when the prompt named none. Nothing is chosen for you.",
      { field: 'envelope.parentBindingId', promptParentBindingId },
    ),
  envelopeSenderMismatch: (authoritySelectionId: string) =>
    new ApiError(
      422,
      'ENVELOPE_SENDER_MISMATCH',
      'The prompt snapshot pinned an authority selection: envelope.from must be exactly its intended sender mailbox. Another mailbox needs its own selection and prompt.',
      { field: 'envelope.from', authoritySelectionId },
    ),
  documentPlanUnsupported: (
    field: string,
    reason: 'HASH_NOT_RECORDED' | 'NOT_RECORDED_AS_SUPPLIED',
  ) =>
    new ApiError(
      422,
      'DOCUMENT_PLAN_UNSUPPORTED',
      {
        HASH_NOT_RECORDED:
          'A planned document names only the SHA-256 recorded on its source revision, whose hash target says what that hash covers. Any other hash is not recorded anywhere.',
        NOT_RECORDED_AS_SUPPLIED:
          "PREVIOUSLY_SUPPLIED needs a prior transmission in the prompt snapshot's context whose captured attachments name this exact source. A source, a sent message or a plan alone does not record that it was supplied.",
      }[reason],
      { field, reason },
    ),
  candidateAlreadySuperseded: (supersededAt: string) =>
    new ApiError(
      409,
      'CANDIDATE_ALREADY_SUPERSEDED',
      'This draft artifact is already superseded. A supersession is recorded once and never changed.',
      { supersededAt },
    ),

  // Technical validation (P4G): the frozen stable codes ARTIFACT_CHANGED and CONTEXT_CHANGED (412,
  // "context/artifact digest precondition", API_CONTRACT_v1 §5).
  /** A run is recorded only for exactly the artifact the caller expects (a candidate never changes). */
  artifactChanged: (field: 'expectedArtifactSha256') =>
    new ApiError(
      412,
      'ARTIFACT_CHANGED',
      'The expected artifact SHA-256 is not the stored artifact of this candidate. A candidate never changes: read it again, or validate the candidate whose artifact you reviewed. No validation run was recorded.',
      { field },
    ),
  /** A run is recorded only against exactly the current context the caller reviewed. */
  validationContextChanged: (field: 'expectedDependencyDigest' | 'preparedDocuments') =>
    new ApiError(
      412,
      'CONTEXT_CHANGED',
      'The recorded context changed after it was read. Read the current context before validating again; no validation run was recorded.',
      { field },
    ),

  // Candidate assessments (P4H; ADR-0008, ADR-0009): the frozen stable codes ARTIFACT_CHANGED and
  // CONTEXT_CHANGED (412); REFERENCE_NOT_FOUND, CROSS_CASE_REFERENCE, RECORD_STATE_CONFLICT,
  // REVIEW_UNSUPPORTED and REVISION_SCOPE_CHANGE above are reused. RULESET_NOT_CURRENT,
  // VALIDATION_RUN_REQUIRED, ASK_PARENT_MISMATCH (422) and ASSESSMENT_ALREADY_SUPERSEDED (409) are
  // operation-specific codes in the free-string `code` field with the contracted statuses (R6
  // interpretation 10).
  /** An assessment is recorded only for exactly the artifact the reviewer expects. */
  assessmentArtifactChanged: () =>
    new ApiError(
      412,
      'ARTIFACT_CHANGED',
      'The expected artifact SHA-256 is not the stored artifact of this candidate. A candidate never changes: read it again, or record the review on the candidate whose artifact was reviewed. No assessment was recorded.',
      { field: 'expectedArtifactSha256' },
    ),
  /** An assessment is recorded only against exactly the current context of the candidate's scope. */
  assessmentContextChanged: () =>
    new ApiError(
      412,
      'CONTEXT_CHANGED',
      'The recorded context changed after it was read. Read the current context before recording an assessment again; no assessment was recorded.',
      { field: 'expectedDependencyDigest' },
    ),
  /** The epoch's ruleset is the one the server runs now; a caller never chooses another one. */
  rulesetNotCurrent: (currentRulesetVersion: string) =>
    new ApiError(
      422,
      'RULESET_NOT_CURRENT',
      'An assessment binds the technical ruleset the server runs now. Another ruleset identifier is never recorded for a new assessment.',
      { field: 'rulesetVersion', currentRulesetVersion },
    ),
  /** No completed technical run of exactly this candidate, artifact, digest and ruleset exists. */
  validationRunRequired: (epoch: {
    readonly artifactSha256: string;
    readonly dependencyDigest: string;
    readonly rulesetVersion: string;
  }) =>
    new ApiError(
      422,
      'VALIDATION_RUN_REQUIRED',
      'An assessment is recorded against an evaluation epoch that has a recorded technical validation run: run the technical validation of this candidate against the current context first. The run need not pass; no assessment was recorded.',
      { epoch },
    ),
  /** D-4 (ADR-0008): DOCUMENT_REVIEWED needs an actual human document review. */
  aiDocumentReviewUnsupported: () =>
    new ApiError(
      422,
      'REVIEW_UNSUPPORTED',
      'DOCUMENT_REVIEWED requires an actual human document review. An AI-assisted performer cannot record it, and it is never inferred from a source, link, file name, URL or metadata.',
      { field: 'provenance', reason: 'AI_ASSISTED_PERFORMER' },
    ),
  /** An ask disposition answers an ask of the exact parent message the candidate's prompt named. */
  askParentMismatch: (field: string, promptParentBindingId: string | null) =>
    new ApiError(
      422,
      'ASK_PARENT_MISMATCH',
      "An ask disposition answers an ask of the parent message the candidate's prompt snapshot named (none for an initial notice). Another message's asks are not this candidate's.",
      { field, promptParentBindingId },
    ),
  assessmentAlreadySuperseded: (successorId: string | null) =>
    new ApiError(
      409,
      'ASSESSMENT_ALREADY_SUPERSEDED',
      'The referenced assessment already has a successor; an assessment history does not fork. Supersede the latest assessment of its chain instead.',
      successorId === null ? {} : { successorId },
    ),

  // Readiness and the unsigned export (P4I; ADR-0011): the frozen stable codes CANDIDATE_NOT_READY
  // (409), ARTIFACT_CHANGED and CONTEXT_CHANGED (412); BINDING_ALREADY_SUPERSEDED (409) is reused.
  // VALIDATION_RUN_CHANGED (412) is an operation-specific code in the free-string `code` field with
  // the contracted status (R6). Nothing in these refusals is signed, sent or released.
  /** A binding the prompt named was corrected since: the candidate's scope has no readiness. */
  readinessScopeUnavailable: (field: string, successorId: string) =>
    new ApiError(
      409,
      'BINDING_ALREADY_SUPERSEDED',
      "A binding the candidate's prompt snapshot named has been corrected by a later binding of this case, so the candidate's scope cannot be evaluated any more and no readiness is derived. The correction is never used in its place: a new prompt snapshot and candidate are needed.",
      { field, successorId },
    ),
  /** The export re-evaluated readiness and it is not READY_FOR_SIGNER now. */
  candidateNotReady: (status: string, reasonCodes: readonly string[]) =>
    new ApiError(
      409,
      'CANDIDATE_NOT_READY',
      'The candidate is not ready for authorized human signer review under the current captured records. Nothing was exported, signed or sent.',
      { status, reasonCodes: [...reasonCodes] },
    ),
  exportArtifactChanged: () =>
    new ApiError(
      412,
      'ARTIFACT_CHANGED',
      'The expected artifact SHA-256 is not the stored artifact of this candidate. Evaluate the readiness again; nothing was exported.',
      { field: 'expectedArtifactSha256' },
    ),
  exportContextChanged: () =>
    new ApiError(
      412,
      'CONTEXT_CHANGED',
      'The recorded context changed after the readiness was read. Evaluate the readiness again before preparing the unsigned handoff; nothing was exported.',
      { field: 'expectedDependencyDigest' },
    ),
  validationRunChanged: () =>
    new ApiError(
      412,
      'VALIDATION_RUN_CHANGED',
      'The named validation run is not the run the current readiness counts. Evaluate the readiness again; nothing was exported.',
      { field: 'validationRunId' },
    ),
} as const;
