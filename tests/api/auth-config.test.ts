// P1 configuration: secret validation, exact loopback origin allowlist, and the rule that the
// Secure=false development cookie exception is granted only for loopback HTTP origins.
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  loadAuthConfig,
  parseAllowedOrigins,
  parseSessionSecret,
  resolveSessionCookiePolicy,
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_TTL_MS,
} from '../../apps/api/src/modules/auth/auth-config.js';

const syntheticSecret = () => randomBytes(32).toString('base64url');

describe('TB_SESSION_SECRET', () => {
  it('accepts a generated 32-byte base64url value', () => {
    expect(parseSessionSecret(syntheticSecret())).toHaveLength(32);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['.env.example placeholder', 'REPLACE_WITH_yarn_env:init_GENERATED_VALUE'],
    ['placeholder-looking base64url', 'REPLACE_WITH_LOCAL_RANDOM_BASE64URL_32_BYTES'],
    ['too short', randomBytes(16).toString('base64url')],
    ['low entropy', Buffer.alloc(32).toString('base64url')],
    ['not base64url', `${syntheticSecret()}!`],
  ])('rejects %s without printing the value', (_label, value) => {
    let message = '';
    try {
      parseSessionSecret(value);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/TB_SESSION_SECRET/);
    if (value) expect(message).not.toContain(value);
  });
});

describe('TB_ALLOWED_WEB_ORIGINS', () => {
  it('accepts exact loopback HTTP origins', () => {
    expect([...parseAllowedOrigins('http://localhost:5173,http://127.0.0.1:5173')]).toEqual([
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ]);
    expect([...parseAllowedOrigins(' http://127.0.0.1:5173 ')]).toEqual(['http://127.0.0.1:5173']);
  });

  it.each([
    ['missing', undefined],
    ['empty entry', 'http://localhost:5173,'],
    ['wildcard', '*'],
    ['null origin', 'null'],
    ['HTTPS (production cookie not implemented)', 'https://localhost:5173'],
    ['non-loopback host', 'http://192.168.1.20:5173'],
    ['public host', 'http://tb.example.com:5173'],
    ['subdomain wildcard', 'http://*.localhost:5173'],
    ['no explicit port', 'http://localhost'],
    ['trailing slash', 'http://localhost:5173/'],
    ['path', 'http://localhost:5173/app'],
    ['credentials', 'http://user@localhost:5173'],
  ])('rejects %s', (_label, value) => {
    expect(() => parseAllowedOrigins(value)).toThrow(/TB_ALLOWED_WEB_ORIGINS/);
  });
});

describe('session cookie policy', () => {
  it('grants the Secure=false tb_session_dev exception only for loopback HTTP origins', () => {
    const policy = resolveSessionCookiePolicy(new Set(['http://localhost:5173']));
    expect(policy).toEqual({ name: 'tb_session_dev', secure: false });
    for (const origin of [
      'https://tb.example.com',
      'http://10.0.0.5:5173',
      'https://localhost:5173',
    ]) {
      expect(() => resolveSessionCookiePolicy(new Set(['http://localhost:5173', origin]))).toThrow(
        /development session cookie is refused/,
      );
    }
    expect(() => resolveSessionCookiePolicy(new Set())).toThrow();
  });

  it('loads a complete configuration from the environment', () => {
    const config = loadAuthConfig({
      TB_SESSION_SECRET: syntheticSecret(),
      TB_ALLOWED_WEB_ORIGINS: 'http://localhost:5173',
    });
    expect(config.cookie.name).toBe('tb_session_dev');
    expect(config.cookie.secure).toBe(false);
    expect(config.sessionTtlMs).toBe(SESSION_TTL_MS);
    expect(config.idleTimeoutMs).toBe(SESSION_IDLE_TIMEOUT_MS);
    expect(SESSION_TTL_MS).toBe(12 * 3600 * 1000);
    expect(SESSION_IDLE_TIMEOUT_MS).toBe(30 * 60 * 1000);
    expect(() => loadAuthConfig({ TB_ALLOWED_WEB_ORIGINS: 'http://localhost:5173' })).toThrow(
      /TB_SESSION_SECRET/,
    );
  });
});
