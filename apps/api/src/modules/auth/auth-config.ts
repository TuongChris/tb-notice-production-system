// P1 authentication configuration (API_CONTRACT_v1 §3, TECHNOLOGY_ARCHITECTURE §5, §7).
//
// Read once at startup from the single root .env (loaded by main.ts / the CLI). Fails closed with
// actionable messages that name the variable but never print a secret value.
//
// Cookie: only the loopback-HTTP development cookie `tb_session_dev` (HttpOnly, SameSite=Strict,
// Path=/, no Domain, Secure=false) is implemented. That Secure=false exception is valid only because
// every allowed browser origin is a loopback HTTP origin, which this loader enforces. The production
// design (`__Host-tb_session`, Secure, HTTPS) is deliberately NOT implemented in P1: a non-loopback
// or HTTPS origin makes the API refuse to start instead of silently reusing the dev exception.
import { DEFAULT_LOGIN_THROTTLE, type LoginThrottleSettings } from './login-throttle.js';

export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

export const DEV_SESSION_COOKIE_NAME = 'tb_session_dev';

/** Session cookie attributes. `secure: false` is the documented loopback development exception. */
export interface SessionCookiePolicy {
  readonly name: string;
  readonly secure: boolean;
}

/** The only cookie policy implemented in P1 (API_CONTRACT_v1 §3 loopback-only HTTP cookie). */
export const LOOPBACK_DEV_COOKIE_POLICY: SessionCookiePolicy = Object.freeze({
  name: DEV_SESSION_COOKIE_NAME,
  secure: false,
});

/** Absolute session lifetime from login. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
/** A session unused for longer than this ends (tracked through AuthSession.lastSeenAt). */
export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
/** lastSeenAt is written at most this often per session to bound write load. */
export const LAST_SEEN_WRITE_INTERVAL_MS = 60 * 1000;

export interface AuthConfig {
  /** HMAC key for session-bound CSRF tokens (TB_SESSION_SECRET, never logged). */
  readonly sessionSecret: Buffer;
  /** Exact browser origins allowed for unsafe requests (TB_ALLOWED_WEB_ORIGINS). */
  readonly allowedOrigins: ReadonlySet<string>;
  readonly cookie: SessionCookiePolicy;
  readonly sessionTtlMs: number;
  readonly idleTimeoutMs: number;
  readonly lastSeenWriteIntervalMs: number;
  readonly throttle: LoginThrottleSettings;
}

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1']);
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const MIN_SECRET_BYTES = 32;

export function parseSessionSecret(raw: string | undefined): Buffer {
  const hint = 'Generate it with `yarn env:init` (adds missing keys to the root .env).';
  if (raw === undefined || raw === '') {
    throw new Error(`TB_SESSION_SECRET is not set. ${hint}`);
  }
  if (/REPLACE/i.test(raw) || !BASE64URL.test(raw)) {
    throw new Error(
      `TB_SESSION_SECRET must be a generated base64url value, not a placeholder. ${hint}`,
    );
  }
  const key = Buffer.from(raw, 'base64url');
  if (key.length < MIN_SECRET_BYTES || new Set(key).size < 16) {
    throw new Error(
      `TB_SESSION_SECRET must decode to at least ${MIN_SECRET_BYTES} random bytes. ${hint}`,
    );
  }
  return key;
}

/**
 * Parses the exact origin allowlist. Every entry must be a serialized loopback HTTP origin with an
 * explicit port (for example http://localhost:5173); wildcards, paths and HTTPS are rejected.
 */
export function parseAllowedOrigins(raw: string | undefined): ReadonlySet<string> {
  if (raw === undefined || raw.trim() === '') {
    throw new Error(
      'TB_ALLOWED_WEB_ORIGINS is not set. Run `yarn env:init` to add the local default ' +
        '(http://localhost:5173,http://127.0.0.1:5173).',
    );
  }
  const origins = new Set<string>();
  for (const entry of raw.split(',').map((value) => value.trim())) {
    const problem = originProblem(entry);
    if (problem) {
      throw new Error(`TB_ALLOWED_WEB_ORIGINS entry "${entry}" rejected: ${problem}.`);
    }
    origins.add(entry);
  }
  return origins;
}

function originProblem(entry: string): string | undefined {
  if (entry === '') return 'empty entry';
  let url: URL;
  try {
    url = new URL(entry);
  } catch {
    return 'not a valid origin';
  }
  if (url.protocol !== 'http:') {
    return (
      'only loopback HTTP origins are supported; the Secure=false development cookie exception ' +
      'must not be used for HTTPS/production (a production cookie policy is not implemented in P1)'
    );
  }
  if (!LOOPBACK_HOSTNAMES.has(url.hostname)) {
    return 'host must be localhost or 127.0.0.1 (loopback development only)';
  }
  if (url.port === '') return 'an explicit port is required';
  if (url.origin !== entry) return 'must be an exact origin (scheme://host:port, no path or slash)';
  return undefined;
}

/**
 * Returns the loopback development cookie policy, refusing when any allowed origin is not loopback
 * HTTP. This is the single place where the Secure=false exception is granted.
 */
export function resolveSessionCookiePolicy(origins: ReadonlySet<string>): SessionCookiePolicy {
  if (origins.size === 0) throw new Error('At least one allowed web origin is required.');
  for (const origin of origins) {
    const problem = originProblem(origin);
    if (problem) {
      throw new Error(
        `The development session cookie is refused for origin "${origin}": ${problem}.`,
      );
    }
  }
  return LOOPBACK_DEV_COOKIE_POLICY;
}

export function loadAuthConfig(env: NodeJS.ProcessEnv): AuthConfig {
  const allowedOrigins = parseAllowedOrigins(env['TB_ALLOWED_WEB_ORIGINS']);
  return Object.freeze({
    sessionSecret: parseSessionSecret(env['TB_SESSION_SECRET']),
    allowedOrigins,
    cookie: resolveSessionCookiePolicy(allowedOrigins),
    sessionTtlMs: SESSION_TTL_MS,
    idleTimeoutMs: SESSION_IDLE_TIMEOUT_MS,
    lastSeenWriteIntervalMs: LAST_SEEN_WRITE_INTERVAL_MS,
    throttle: DEFAULT_LOGIN_THROTTLE,
  });
}
