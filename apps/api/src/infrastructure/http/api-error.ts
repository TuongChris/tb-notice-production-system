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
} as const;
