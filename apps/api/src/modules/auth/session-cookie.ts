// Session cookie serialization and parsing (API_CONTRACT_v1 §3).
//
// Attributes: HttpOnly, SameSite=Strict, Path=/, never a Domain attribute (host-only cookie).
// Secure is emitted only when the policy requires it; the one implemented policy is the loopback
// development cookie `tb_session_dev` whose Secure=false exception is granted in auth-config.ts.
import type { SessionCookiePolicy } from './auth-config.js';

const COOKIE_VALUE = /^[A-Za-z0-9_-]+$/;

function attributes(policy: SessionCookiePolicy): string {
  return `Path=/; HttpOnly; SameSite=Strict${policy.secure ? '; Secure' : ''}`;
}

export function serializeSessionCookie(
  policy: SessionCookiePolicy,
  token: string,
  maxAgeSeconds: number,
): string {
  if (!COOKIE_VALUE.test(token)) throw new Error('session token is not cookie-safe');
  if (!Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds <= 0) {
    throw new Error('session cookie Max-Age must be a positive integer');
  }
  return `${policy.name}=${token}; Max-Age=${maxAgeSeconds}; ${attributes(policy)}`;
}

/** Instructs the browser to delete the session cookie. */
export function serializeClearedSessionCookie(policy: SessionCookiePolicy): string {
  return `${policy.name}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; ${attributes(policy)}`;
}

/**
 * Every value of cookie `name` in a Cookie request header, in header order. More than one value
 * means an ambiguous (possibly injected) cookie; callers treat that as no usable session.
 */
export function readCookieValues(header: string | undefined, name: string): string[] {
  if (header === undefined || header === '') return [];
  const values: string[] = [];
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) values.push(part.slice(separator + 1).trim());
  }
  return values;
}
