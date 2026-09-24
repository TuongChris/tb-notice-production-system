// Opaque session tokens and session-bound CSRF tokens (API_CONTRACT_v1 §3).
//
// - The browser cookie carries a 256-bit random token (base64url). The database stores only its
//   SHA-256 digest (AuthSession.tokenHash); the raw token is never persisted or logged.
// - The CSRF token is HMAC-SHA256(TB_SESSION_SECRET, session id ‖ user sessionEpoch ‖ session token).
//   Only its SHA-256 digest is stored (AuthSession.csrfTokenHash). Because it is derived, GET
//   /auth/session can return the same token after a page refresh without exposing the session token,
//   and it is never equal to the cookie value.
// - Binding the user's sessionEpoch into the derivation means an epoch increment (or rotating the
//   server secret) makes every earlier session fail validation, without an extra column.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const SESSION_TOKEN_BYTES = 32;
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const CSRF_DERIVATION_LABEL = 'tb/session-csrf/v1';

export function generateSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
}

/** Shape check before any database lookup (43 base64url characters = 256 bits). */
export function isWellFormedSessionToken(value: string): boolean {
  return SESSION_TOKEN_PATTERN.test(value);
}

/** Lowercase hex SHA-256 of the UTF-8 value (64 characters, fits VARCHAR(64)). */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export interface CsrfBinding {
  readonly sessionId: string;
  readonly sessionEpoch: number;
  readonly sessionToken: string;
}

export function deriveCsrfToken(secret: Buffer, binding: CsrfBinding): string {
  return createHmac('sha256', secret)
    .update(
      [
        CSRF_DERIVATION_LABEL,
        binding.sessionId,
        String(binding.sessionEpoch),
        binding.sessionToken,
      ].join('\u0000'),
      'utf8',
    )
    .digest('base64url');
}

/** Constant-time check that SHA-256(value) equals the stored hex digest. */
export function matchesDigest(value: string, expectedHex: string): boolean {
  const actual = createHash('sha256').update(value, 'utf8').digest();
  const expected = Buffer.from(expectedHex, 'hex');
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
