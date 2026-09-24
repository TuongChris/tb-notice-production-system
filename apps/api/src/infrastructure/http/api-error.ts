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
  crossOwnerReference: (field: string, ownerId: string) =>
    new ApiError(
      422,
      'CROSS_OWNER_REFERENCE',
      "The referenced source is already recorded as another owner's material.",
      { field, ownerId },
    ),
  caseScopeUnavailable: (field: string) =>
    new ApiError(
      422,
      'CASE_SCOPE_UNAVAILABLE',
      'Case scope cannot be recorded before the Case phase exists.',
      { field },
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
  revisionNotHead: (headId: string | null) =>
    new ApiError(
      409,
      'REVISION_NOT_HEAD',
      'Only the current revision of a source can be revised.',
      headId === null ? {} : { headId },
    ),
  revisionScopeChange: (fields: readonly string[]) =>
    new ApiError(
      422,
      'REVISION_SCOPE_CHANGE',
      "A revision keeps the source's agency and scope; a different scope needs a new source.",
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
  bindingCorrectionRequiresReconciliation: (current: Readonly<Record<string, unknown>>) =>
    new ApiError(
      409,
      'BINDING_CORRECTION_REQUIRES_RECONCILIATION',
      'The record already has a canonical binding; changing it needs a reconciliation workflow.',
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
} as const;
