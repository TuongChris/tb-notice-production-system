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
  crossAgencyReference: (field: string) =>
    new ApiError(
      422,
      'CROSS_AGENCY_REFERENCE',
      'The referenced source belongs to another agency.',
      {
        field,
      },
    ),
  sourceScopeUnresolved: (field: string) =>
    new ApiError(
      422,
      'SOURCE_SCOPE_UNRESOLVED',
      'The referenced source has no agency and is not explicitly scoped to this agency.',
      { field },
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
      'Identity fields of an established record cannot be changed or cleared by a generic update.',
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
} as const;
