// SESSION / CSRF primitives: opaque tokens, digests and the session-bound CSRF derivation.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  deriveCsrfToken,
  generateSessionToken,
  isWellFormedSessionToken,
  matchesDigest,
  sha256Hex,
} from '../../apps/api/src/modules/auth/session-tokens.js';

const SECRET = Buffer.from('p1-unit-test-secret-not-real-0123456789abcdef', 'utf8');
const OTHER_SECRET = Buffer.from('p1-unit-test-other-secret-not-real-9876543210', 'utf8');

describe('opaque session tokens', () => {
  it('are 256-bit base64url strings, unique per call', () => {
    const tokens = new Set(Array.from({ length: 200 }, generateSessionToken));
    expect(tokens.size).toBe(200);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(token, 'base64url')).toHaveLength(32);
      expect(isWellFormedSessionToken(token)).toBe(true);
    }
  });

  it('rejects malformed cookie values before any lookup', () => {
    for (const value of ['', 'short', `${'a'.repeat(42)}=`, 'a'.repeat(44), `${'a'.repeat(42)}+`]) {
      expect(isWellFormedSessionToken(value), value).toBe(false);
    }
  });

  it('are stored only as a SHA-256 hex digest that differs from the token', () => {
    const token = generateSessionToken();
    const digest = sha256Hex(token);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).toBe(createHash('sha256').update(token).digest('hex'));
    expect(digest).not.toContain(token);
    expect(matchesDigest(token, digest)).toBe(true);
    expect(matchesDigest(generateSessionToken(), digest)).toBe(false);
    expect(matchesDigest(token, 'not-hex')).toBe(false);
  });
});

describe('session-bound CSRF token', () => {
  const binding = {
    sessionId: '11111111-1111-4111-8111-111111111111',
    sessionEpoch: 1,
    sessionToken: generateSessionToken(),
  };

  it('is deterministic for the same session, so GET /auth/session can return it again', () => {
    expect(deriveCsrfToken(SECRET, binding)).toBe(deriveCsrfToken(SECRET, binding));
  });

  it('satisfies the contract Csrf bounds and is never equal to (or derived visibly from) the session token', () => {
    const csrf = deriveCsrfToken(SECRET, binding);
    expect(csrf.length).toBeGreaterThanOrEqual(20);
    expect(csrf.length).toBeLessThanOrEqual(200);
    expect(csrf).not.toBe(binding.sessionToken);
    expect(csrf).not.toContain(binding.sessionToken);
    expect(binding.sessionToken).not.toContain(csrf);
    expect(csrf).not.toBe(sha256Hex(binding.sessionToken));
  });

  it('changes when the session, the sessionEpoch, the token or the server secret changes', () => {
    const base = deriveCsrfToken(SECRET, binding);
    const variants = [
      deriveCsrfToken(SECRET, { ...binding, sessionId: '22222222-2222-4222-8222-222222222222' }),
      deriveCsrfToken(SECRET, { ...binding, sessionEpoch: 2 }),
      deriveCsrfToken(SECRET, { ...binding, sessionToken: generateSessionToken() }),
      deriveCsrfToken(OTHER_SECRET, binding),
    ];
    expect(new Set([base, ...variants]).size).toBe(5);
  });
});
