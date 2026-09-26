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
    subject: 'source' | 'fact' | 'binding' | 'candidate' = 'source',
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
} as const;
