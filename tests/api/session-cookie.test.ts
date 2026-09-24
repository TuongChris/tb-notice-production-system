// COOKIE: the loopback development cookie tb_session_dev (API_CONTRACT_v1 §3).
import { describe, expect, it } from 'vitest';
import { LOOPBACK_DEV_COOKIE_POLICY } from '../../apps/api/src/modules/auth/auth-config.js';
import {
  readCookieValues,
  serializeClearedSessionCookie,
  serializeSessionCookie,
} from '../../apps/api/src/modules/auth/session-cookie.js';
import { generateSessionToken } from '../../apps/api/src/modules/auth/session-tokens.js';

function attributes(header: string): Map<string, string | true> {
  const [, ...parts] = header.split(';').map((part) => part.trim());
  return new Map<string, string | true>(
    parts.map((part): [string, string | true] => {
      const separator = part.indexOf('=');
      return separator < 0
        ? [part.toLowerCase(), true]
        : [part.slice(0, separator).toLowerCase(), part.slice(separator + 1)];
    }),
  );
}

describe('session cookie serialization', () => {
  const token = generateSessionToken();

  it('uses tb_session_dev with HttpOnly, SameSite=Strict, Path=/, Max-Age, no Domain and no Secure', () => {
    const header = serializeSessionCookie(LOOPBACK_DEV_COOKIE_POLICY, token, 43_200);
    expect(header.startsWith(`tb_session_dev=${token};`)).toBe(true);
    const attrs = attributes(header);
    expect(attrs.get('httponly')).toBe(true);
    expect(attrs.get('samesite')).toBe('Strict');
    expect(attrs.get('path')).toBe('/');
    expect(attrs.get('max-age')).toBe('43200');
    expect(attrs.has('domain')).toBe(false);
    expect(attrs.has('secure')).toBe(false);
    expect([...attrs.keys()].sort()).toEqual(['httponly', 'max-age', 'path', 'samesite']);
  });

  it('emits Secure only for a policy that requires it (the production policy is not implemented)', () => {
    const header = serializeSessionCookie({ name: 'x', secure: true }, token, 60);
    expect(attributes(header).get('secure')).toBe(true);
  });

  it('clears the cookie with the same attributes and Max-Age=0', () => {
    const header = serializeClearedSessionCookie(LOOPBACK_DEV_COOKIE_POLICY);
    expect(header.startsWith('tb_session_dev=;')).toBe(true);
    const attrs = attributes(header);
    expect(attrs.get('max-age')).toBe('0');
    expect(attrs.get('httponly')).toBe(true);
    expect(attrs.get('samesite')).toBe('Strict');
    expect(attrs.get('path')).toBe('/');
    expect(attrs.has('domain')).toBe(false);
  });

  it('refuses unsafe values and lifetimes', () => {
    expect(() => serializeSessionCookie(LOOPBACK_DEV_COOKIE_POLICY, 'a;b', 60)).toThrow();
    expect(() => serializeSessionCookie(LOOPBACK_DEV_COOKIE_POLICY, token, 0)).toThrow();
  });
});

describe('Cookie header parsing', () => {
  it('returns every value of the session cookie in order', () => {
    expect(readCookieValues(undefined, 'tb_session_dev')).toEqual([]);
    expect(readCookieValues('other=1', 'tb_session_dev')).toEqual([]);
    expect(readCookieValues('a=1; tb_session_dev=abc; b=2', 'tb_session_dev')).toEqual(['abc']);
    expect(readCookieValues('tb_session_dev=one; tb_session_dev=two', 'tb_session_dev')).toEqual([
      'one',
      'two',
    ]);
    expect(readCookieValues('xtb_session_dev=abc; tb_session_devx=def', 'tb_session_dev')).toEqual(
      [],
    );
  });
});
