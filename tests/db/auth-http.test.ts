// P1 authentication over real HTTP against tb_notice_test (yarn test:db).
//
// Each test boots the real AppModule + configureApp pipeline (request policy → JSON parser →
// global AuthGuard → controllers → ApiExceptionFilter) on an ephemeral loopback port, with
// Prisma pointed at tb_notice_test, a synthetic HMAC secret, a controllable clock and a counting
// hasher. Users and passwords are synthetic. Every test deletes the rows it created.
import { createHash } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../apps/api/generated/prisma/client.js';
import {
  deriveCsrfToken,
  generateSessionToken,
} from '../../apps/api/src/modules/auth/session-tokens.js';
import {
  GetHealthResponseSchema,
  GetSessionResponseSchema,
  LoginResponseSchema,
  OperationErrorSchema,
  operations,
} from '../../packages/contracts/src/index.js';
import { DISABLED_ACTOR_MARKER } from '../../scripts/db/seed-data.mjs';
import {
  ALLOWED_ORIGIN,
  assertAuthTablesEmpty,
  cleanAuthTables,
  cookieHeader,
  http,
  insertUser,
  login,
  loginHeaders,
  openTestPrisma,
  SECOND_ALLOWED_ORIGIN,
  sessionTokenFrom,
  setCookies,
  startTestApp,
  TEST_SESSION_SECRET,
  type HttpResult,
  type TestApp,
} from './auth-support.js';

const PASSWORD = 'synthetic-P1-http-password-0001';
const EMAIL = 'p1-http-admin@example.invalid';
const MINUTE = 60_000;

let prisma: PrismaClient;
let t: TestApp;
const collected: Array<{ operationId: string; result: HttpResult }> = [];

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

function record(operationId: string, result: HttpResult): HttpResult {
  collected.push({ operationId, result });
  return result;
}

async function loggedIn(email = EMAIL, password = PASSWORD) {
  const result = record('login', await login(t.port, email, password));
  expect(result.status).toBe(200);
  const token = sessionTokenFrom(result);
  if (!token) throw new Error('login did not set tb_session_dev');
  const csrfToken = (result.json as { data: { csrfToken: string } }).data.csrfToken;
  return { result, token, csrfToken };
}

/** GET /auth/session as the web client sends it (with X-Requested-With: TB-APP). */
const getSession = async (token: string, extra: Record<string, string> = {}) =>
  record(
    'getSession',
    await http(t.port, 'GET', '/api/v1/auth/session', {
      headers: { ...cookieHeader(token), 'X-Requested-With': 'TB-APP', ...extra },
    }),
  );

const logout = async (
  token: string,
  csrfToken: string | undefined,
  extra: Record<string, string> = {},
) =>
  record(
    'logout',
    await http(t.port, 'POST', '/api/v1/auth/logout', {
      headers: {
        Origin: ALLOWED_ORIGIN,
        ...cookieHeader(token),
        ...(csrfToken === undefined ? {} : { 'X-CSRF-Token': csrfToken }),
        ...extra,
      },
    }),
  );

const errorCode = (result: HttpResult) =>
  (result.json as { error?: { code?: string } }).error?.code;

beforeAll(async () => {
  ({ prisma } = openTestPrisma());
  await assertAuthTablesEmpty(prisma);
});

beforeEach(async () => {
  t = await startTestApp(prisma);
});

afterEach(async () => {
  await t.close();
  await cleanAuthTables(prisma);
});

afterAll(async () => {
  if (!prisma) return;
  try {
    await assertAuthTablesEmpty(prisma);
  } finally {
    await prisma.$disconnect();
  }
});

describe('LOGIN', () => {
  it('a valid enabled user logs in: 200 LoginResponse, opaque cookie, database holds digests only', async () => {
    const user = await insertUser(prisma, EMAIL, PASSWORD);
    const { result, token, csrfToken } = await loggedIn();
    const body = LoginResponseSchema.parse(result.json);
    expect(body.data.user).toMatchObject({
      id: user.id,
      email: EMAIL,
      enabled: true,
      disabledAt: null,
    });
    expect(Object.keys(body.data.user).sort()).toEqual(
      [
        'createdAt',
        'disabledAt',
        'displayName',
        'email',
        'enabled',
        'id',
        'passwordChangedAt',
      ].sort(),
    );
    expect(result.text).not.toMatch(/passwordHash|password_hash|sessionEpoch|\$argon2/);
    expect(body.data.expiresAt).toBe(new Date(t.clock.ms + 12 * 60 * MINUTE).toISOString());

    const rows = await prisma.authSession.findMany();
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row?.userId).toBe(user.id);
    expect(row?.tokenHash).toBe(sha256(token));
    expect(row?.csrfTokenHash).toBe(sha256(csrfToken));
    expect(row?.revokedAt).toBeNull();
    expect(row?.lastSeenAt.getTime()).toBe(t.clock.ms);
    expect(row?.createdAt.getTime()).toBe(t.clock.ms);
    const stored = JSON.stringify(row);
    expect(stored).not.toContain(token);
    expect(stored).not.toContain(csrfToken);
    // The CSRF token is the documented HMAC binding of this session (epoch 1).
    expect(csrfToken).toBe(
      deriveCsrfToken(TEST_SESSION_SECRET, {
        sessionId: row?.id ?? '',
        sessionEpoch: 1,
        sessionToken: token,
      }),
    );

    const audit = await prisma.auditEvent.findMany();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: 'AUTH_LOGIN_SUCCEEDED',
      actorUserId: user.id,
      entityType: 'AuthSession',
      entityId: row?.id,
    });
  });

  it('treats the email case-insensitively (users.email has a binary collation)', async () => {
    await insertUser(prisma, EMAIL, PASSWORD);
    expect((await login(t.port, EMAIL.toUpperCase(), PASSWORD)).status).toBe(200);
  });

  it('wrong password, unknown email and disabled accounts all get the same generic 403 after the same work', async () => {
    await insertUser(prisma, EMAIL, PASSWORD);
    await insertUser(prisma, 'p1-disabled@example.invalid', PASSWORD, {
      enabled: false,
      disabledAt: new Date(),
    });
    await insertUser(prisma, 'p1-disabled-at@example.invalid', PASSWORD, {
      disabledAt: new Date(),
    });
    await insertUser(prisma, 'p1-marker@example.invalid', PASSWORD, {
      enabled: false,
      passwordHash: DISABLED_ACTOR_MARKER,
    });
    const attempts = [
      await login(t.port, EMAIL, 'synthetic-wrong-password-0001'),
      await login(t.port, 'p1-nobody@example.invalid', PASSWORD),
      await login(t.port, 'p1-disabled@example.invalid', PASSWORD),
      await login(t.port, 'p1-disabled-at@example.invalid', PASSWORD),
      await login(t.port, 'p1-marker@example.invalid', PASSWORD),
    ];
    for (const result of attempts) record('login', result);
    const shapes = attempts.map((result) => {
      const body = OperationErrorSchema.parse(result.json);
      return {
        status: result.status,
        code: body.error.code,
        message: body.error.message,
        details: body.error.details,
        headers: Object.keys(result.headers)
          .filter((name) => !['date', 'content-length'].includes(name))
          .sort(),
        cacheControl: result.headers['cache-control'],
      };
    });
    expect(shapes[0]).toEqual({
      status: 403,
      code: 'INVALID_CREDENTIALS',
      message: 'The email address or password is not accepted.',
      details: {},
      headers: expect.any(Array),
      cacheControl: 'no-store',
    });
    for (const shape of shapes) expect(shape).toEqual(shapes[0]);
    for (const result of attempts) expect(setCookies(result)).toEqual([]);
    expect(t.hasher.verifyCalls).toBe(attempts.length);
    expect(await prisma.authSession.count()).toBe(0);
    // The failure path writes nothing to the database (no account-dependent write).
    expect(await prisma.auditEvent.count()).toBe(0);
  });

  it('rotates on success: a presented session is revoked and a fresh token is issued', async () => {
    await insertUser(prisma, EMAIL, PASSWORD);
    const first = await loggedIn();
    const second = record('login', await login(t.port, EMAIL, PASSWORD, cookieHeader(first.token)));
    expect(second.status).toBe(200);
    const secondToken = sessionTokenFrom(second) ?? '';
    expect(secondToken).not.toBe(first.token);
    const revoked = await prisma.authSession.findUnique({
      where: { tokenHash: sha256(first.token) },
    });
    expect(revoked?.revokedAt).not.toBeNull();
    expect((await getSession(first.token)).status).toBe(401);
    expect((await getSession(secondToken)).status).toBe(200);
    const audit = await prisma.auditEvent.findMany({ orderBy: { createdAt: 'asc' } });
    expect(
      audit
        .map((event) => (event.afterRedacted as { rotatedSessions: number }).rotatedSessions)
        .sort(),
    ).toEqual([0, 1]);
  });

  it('never adopts a presented token (session fixation)', async () => {
    await insertUser(prisma, EMAIL, PASSWORD);
    const planted = generateSessionToken();
    const result = await login(t.port, EMAIL, PASSWORD, cookieHeader(planted));
    expect(result.status).toBe(200);
    expect(sessionTokenFrom(result)).not.toBe(planted);
    expect(await prisma.authSession.count({ where: { tokenHash: sha256(planted) } })).toBe(0);
  });

  it('rejects malformed, non-JSON and contract-invalid bodies with 400 before any credential check', async () => {
    await insertUser(prisma, EMAIL, PASSWORD);
    const post = (body: string, extra: Record<string, string> = {}) =>
      http(t.port, 'POST', '/api/v1/auth/login', { headers: loginHeaders(extra), body });
    const cases: Array<[string, HttpResult, string]> = [
      ['missing password', await post(JSON.stringify({ email: EMAIL })), 'VALIDATION_FAILED'],
      [
        'unknown field',
        await post(JSON.stringify({ email: EMAIL, password: PASSWORD, admin: true })),
        'VALIDATION_FAILED',
      ],
      [
        'invalid email',
        await post(JSON.stringify({ email: 'not-an-email', password: PASSWORD })),
        'VALIDATION_FAILED',
      ],
      [
        'over-long password',
        await post(JSON.stringify({ email: EMAIL, password: 'x'.repeat(257) })),
        'VALIDATION_FAILED',
      ],
      ['array body', await post('[]'), 'VALIDATION_FAILED'],
      [
        'malformed JSON',
        await post(`{"email":"${EMAIL}","password":"${PASSWORD}"`),
        'MALFORMED_REQUEST',
      ],
      [
        'text/plain',
        await post(JSON.stringify({ email: EMAIL, password: PASSWORD }), {
          'Content-Type': 'text/plain',
        }),
        'UNSUPPORTED_CONTENT_TYPE',
      ],
      [
        'form encoded',
        await post(`email=${EMAIL}&password=${PASSWORD}`, {
          'Content-Type': 'application/x-www-form-urlencoded',
        }),
        'UNSUPPORTED_CONTENT_TYPE',
      ],
    ];
    for (const [label, result, code] of cases) {
      record('login', result);
      expect(result.status, label).toBe(400);
      expect(errorCode(result), label).toBe(code);
      // The body is never echoed, not even inside a JSON parser message.
      expect(result.text, label).not.toContain(PASSWORD);
    }
    expect(t.hasher.verifyCalls).toBe(0);
    expect(await prisma.authSession.count()).toBe(0);
  });
});

describe('COOKIE', () => {
  it('sets tb_session_dev with HttpOnly, SameSite=Strict, Path=/, Max-Age and neither Domain nor Secure', async () => {
    await insertUser(prisma, EMAIL, PASSWORD);
    const { result, token } = await loggedIn();
    const cookies = setCookies(result);
    expect(cookies).toHaveLength(1);
    const [name, ...attributes] = (cookies[0] ?? '').split(';').map((part) => part.trim());
    expect(name).toBe(`tb_session_dev=${token}`);
    const lower = attributes.map((attribute) => attribute.toLowerCase());
    expect(lower).toContain('httponly');
    expect(lower).toContain('samesite=strict');
    expect(lower).toContain('path=/');
    expect(lower).toContain('max-age=43200');
    expect(lower.some((attribute) => attribute.startsWith('domain'))).toBe(false);
    expect(lower).not.toContain('secure');
  });
});

describe('SESSION', () => {
  it('GET /auth/session returns the SessionView with the same session-bound CSRF token', async () => {
    await insertUser(prisma, EMAIL, PASSWORD);
    const { result, token, csrfToken } = await loggedIn();
    const session = await getSession(token);
    expect(session.status).toBe(200);
    const body = GetSessionResponseSchema.parse(session.json);
    expect(body.data.csrfToken).toBe(csrfToken);
    expect(body.data.expiresAt).toBe(
      (result.json as { data: { expiresAt: string } }).data.expiresAt,
    );
    expect(body.data.user.email).toBe(EMAIL);
    expect(session.headers['cache-control']).toBe('no-store');
    expect(setCookies(session)).toEqual([]);
  });

  it('missing cookie → 401 SESSION_REQUIRED without touching cookies', async () => {
    const result = record('getSession', await http(t.port, 'GET', '/api/v1/auth/session'));
    expect(result.status).toBe(401);
    expect(errorCode(result)).toBe('SESSION_REQUIRED');
    expect(setCookies(result)).toEqual([]);
  });

  it('malformed, unknown and duplicated cookies → 401 and the cookie is cleared', async () => {
    await insertUser(prisma, EMAIL, PASSWORD);
    const { token } = await loggedIn();
    const headers = [
      { Cookie: 'tb_session_dev=garbage' },
      cookieHeader(generateSessionToken()),
      { Cookie: `tb_session_dev=${token}; tb_session_dev=${generateSessionToken()}` },
      { Cookie: `tb_session_dev="${token}"` },
    ];
    for (const header of headers) {
      const result = record(
        'getSession',
        await http(t.port, 'GET', '/api/v1/auth/session', { headers: header }),
      );
      expect(result.status).toBe(401);
      expect(errorCode(result)).toBe('SESSION_REQUIRED');
      expect(setCookies(result)).toEqual([
        'tb_session_dev=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; HttpOnly; SameSite=Strict',
      ]);
    }
    expect((await getSession(token)).status).toBe(200);
  });

  it('a revoked session → 401', async () => {
    await insertUser(prisma, EMAIL, PASSWORD);
    const { token } = await loggedIn();
    await prisma.authSession.updateMany({ data: { revokedAt: new Date(t.clock.ms) } });
    expect((await getSession(token)).status).toBe(401);
  });

  it('activity keeps a session alive, but the absolute 12 h expiry is enforced', async () => {
    await insertUser(prisma, EMAIL, PASSWORD);
    const { token } = await loggedIn();
    for (let elapsed = 25; elapsed < 12 * 60; elapsed += 25) {
      t.clock.advance(25 * MINUTE);
      expect((await getSession(token)).status, `${elapsed} min`).toBe(200);
    }
    t.clock.advance(25 * MINUTE); // now past 12 h
    const expired = await getSession(token);
    expect(expired.status).toBe(401);
    expect(setCookies(expired)).toHaveLength(1);
  });

  it('about 30 minutes without activity ends the session', async () => {
    await insertUser(prisma, EMAIL, PASSWORD);
    const { token } = await loggedIn();
    t.clock.advance(29 * MINUTE);
    expect((await getSession(token)).status).toBe(200);
    t.clock.advance(29 * MINUTE);
    expect((await getSession(token)).status).toBe(200);
    t.clock.advance(31 * MINUTE);
    expect((await getSession(token)).status).toBe(401);
  });

  it('only application requests count as activity: plain same-site loads cannot keep a session alive', async () => {
    await insertUser(prisma, EMAIL, PASSWORD);
    const { token, csrfToken } = await loggedIn();
    const lastSeen = async () =>
      (
        await prisma.authSession.findFirstOrThrow({ where: { revokedAt: null } })
      ).lastSeenAt.getTime();
    const loginAt = t.clock.ms;
    t.clock.advance(20 * MINUTE);
    // Like an <img>/<script> load from another page on the same host: no app header.
    const plain = record(
      'getSession',
      await http(t.port, 'GET', '/api/v1/auth/session', { headers: cookieHeader(token) }),
    );
    expect(plain.status).toBe(200);
    expect(await lastSeen()).toBe(loginAt);
    // A rejected unsafe request (wrong CSRF token) does not count either.
    expect((await logout(token, 'x'.repeat(43))).status).toBe(403);
    expect(await lastSeen()).toBe(loginAt);
    t.clock.advance(11 * MINUTE); // 31 minutes after the last application activity
    expect((await getSession(token)).status).toBe(401);
    expect(csrfToken).toBeTruthy();
  });

  it('an application request (web client header) records activity', async () => {
    await insertUser(prisma, EMAIL, PASSWORD);
    const { token } = await loggedIn();
    t.clock.advance(20 * MINUTE);
    expect((await getSession(token)).status).toBe(200);
    const row = await prisma.authSession.findFirstOrThrow();
    expect(row.lastSeenAt.getTime()).toBe(t.clock.ms);
  });

  it('a user disabled after login cannot use the session', async () => {
    const user = await insertUser(prisma, EMAIL, PASSWORD);
    const first = await loggedIn();
    await prisma.user.update({ where: { id: user.id }, data: { enabled: false } });
    expect((await getSession(first.token)).status).toBe(401);
    await prisma.user.update({
      where: { id: user.id },
      data: { enabled: true, disabledAt: new Date(t.clock.ms) },
    });
    expect((await getSession(first.token)).status).toBe(401);
    expect((await login(t.port, EMAIL, PASSWORD)).status).toBe(403);
  });

  it('incrementing users.session_epoch invalidates every existing session; a new login works', async () => {
    const user = await insertUser(prisma, EMAIL, PASSWORD);
    const a = await loggedIn();
    const b = await loggedIn();
    await prisma.user.update({ where: { id: user.id }, data: { sessionEpoch: { increment: 1 } } });
    for (const token of [a.token, b.token]) {
      const result = await getSession(token);
      expect(result.status).toBe(401);
      expect(setCookies(result)).toHaveLength(1);
    }
    const fresh = await loggedIn();
    expect((await getSession(fresh.token)).status).toBe(200);
    expect(fresh.csrfToken).not.toBe(a.csrfToken);
  });

  it('rotating the server HMAC secret invalidates existing sessions', async () => {
    await insertUser(prisma, EMAIL, PASSWORD);
    const { token } = await loggedIn();
    const rotated = await startTestApp(prisma, {
      secret: Buffer.from(generateSessionToken(), 'base64url'),
      clock: t.clock,
    });
    try {
      const result = await http(rotated.port, 'GET', '/api/v1/auth/session', {
        headers: cookieHeader(token),
      });
      expect(result.status).toBe(401);
    } finally {
      await rotated.close();
    }
  });
});

describe('CSRF / ORIGIN', () => {
  it('login accepts both allowlisted loopback origins', async () => {
    await insertUser(prisma, EMAIL, PASSWORD);
    for (const origin of [ALLOWED_ORIGIN, SECOND_ALLOWED_ORIGIN]) {
      expect((await login(t.port, EMAIL, PASSWORD, { Origin: origin })).status, origin).toBe(200);
    }
  });

  it('login rejects missing, null and non-allowlisted origins before any credential check', async () => {
    await insertUser(prisma, EMAIL, PASSWORD);
    const origins = [
      undefined,
      'null',
      'http://evil.example',
      'http://localhost:5174',
      'http://127.0.0.1:3000',
      'http://localhost:5173.evil.example',
      'https://localhost:5173',
    ];
    for (const origin of origins) {
      const headers = loginHeaders();
      if (origin === undefined) delete headers['Origin'];
      else headers['Origin'] = origin;
      const result = record(
        'login',
        await http(t.port, 'POST', '/api/v1/auth/login', {
          headers,
          body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
        }),
      );
      expect(result.status, String(origin)).toBe(403);
      expect(errorCode(result), String(origin)).toBe('ORIGIN_REJECTED');
    }
    expect(t.hasher.verifyCalls).toBe(0);
    expect(await prisma.authSession.count()).toBe(0);
  });

  it('login requires exactly X-Requested-With: TB-APP', async () => {
    await insertUser(prisma, EMAIL, PASSWORD);
    for (const value of [undefined, 'XMLHttpRequest', 'tb-app', '']) {
      const headers = loginHeaders();
      if (value === undefined) delete headers['X-Requested-With'];
      else headers['X-Requested-With'] = value;
      const result = record(
        'login',
        await http(t.port, 'POST', '/api/v1/auth/login', {
          headers,
          body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
        }),
      );
      expect(result.status, String(value)).toBe(403);
      expect(errorCode(result)).toBe('REQUESTED_WITH_REQUIRED');
    }
    expect(t.hasher.verifyCalls).toBe(0);
  });

  it('an unsafe authenticated request without a valid CSRF token → 403, and the session stays valid', async () => {
    await insertUser(prisma, EMAIL, PASSWORD);
    const { token, csrfToken } = await loggedIn();
    const other = await loggedIn();
    const wrongTokens: Array<string | undefined> = [
      undefined,
      'abc',
      'x'.repeat(43),
      token, // the session token itself is never a CSRF token
      other.csrfToken, // another session's CSRF token
      csrfToken.toUpperCase() === csrfToken ? `${csrfToken}x` : csrfToken.toUpperCase(),
    ];
    for (const wrong of wrongTokens) {
      const result = await logout(token, wrong);
      expect(result.status, String(wrong)).toBe(403);
      expect(errorCode(result)).toBe('CSRF_TOKEN_INVALID');
      expect(setCookies(result)).toEqual([]);
    }
    expect((await getSession(token)).status).toBe(200);
    expect(await prisma.authSession.count({ where: { revokedAt: { not: null } } })).toBe(0);
  });

  it('an unsafe authenticated request from a wrong or missing Origin → 403 even with the right CSRF token', async () => {
    await insertUser(prisma, EMAIL, PASSWORD);
    const { token, csrfToken } = await loggedIn();
    for (const origin of ['http://evil.example', 'null']) {
      const result = await logout(token, csrfToken, { Origin: origin });
      expect(result.status).toBe(403);
      expect(errorCode(result)).toBe('ORIGIN_REJECTED');
    }
    const noOrigin = record(
      'logout',
      await http(t.port, 'POST', '/api/v1/auth/logout', {
        headers: { ...cookieHeader(token), 'X-CSRF-Token': csrfToken },
      }),
    );
    expect(noOrigin.status).toBe(403);
    expect((await getSession(token)).status).toBe(200);
  });

  it('the CSRF token is not the session token and a cross-origin read is refused', async () => {
    await insertUser(prisma, EMAIL, PASSWORD);
    const { token, csrfToken } = await loggedIn();
    expect(csrfToken).not.toBe(token);
    expect(csrfToken).not.toContain(token);
    expect(token).not.toContain(csrfToken);
    const crossOrigin = await getSession(token, { Origin: 'http://evil.example' });
    expect(crossOrigin.status).toBe(403);
    expect(crossOrigin.text).not.toContain(csrfToken);
  });

  it('never enables CORS: no Access-Control-Allow-* header on preflight or responses', async () => {
    await insertUser(prisma, EMAIL, PASSWORD);
    const preflight = await http(t.port, 'OPTIONS', '/api/v1/auth/login', {
      headers: { Origin: ALLOWED_ORIGIN, 'Access-Control-Request-Method': 'POST' },
    });
    const { result } = await loggedIn();
    for (const response of [preflight, result]) {
      expect(
        Object.keys(response.headers).filter((name) => name.startsWith('access-control-')),
      ).toEqual([]);
    }
  });
});

describe('LOGOUT', () => {
  it('revokes the session, clears the cookie, and the old cookie cannot restore it', async () => {
    const user = await insertUser(prisma, EMAIL, PASSWORD);
    const { token, csrfToken } = await loggedIn();
    const result = await logout(token, csrfToken);
    expect(result.status).toBe(204);
    expect(result.text).toBe('');
    expect(result.headers['cache-control']).toBe('no-store');
    expect(setCookies(result)).toEqual([
      'tb_session_dev=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; HttpOnly; SameSite=Strict',
    ]);
    const row = await prisma.authSession.findUnique({ where: { tokenHash: sha256(token) } });
    expect(row?.revokedAt?.getTime()).toBe(t.clock.ms);
    const audit = await prisma.auditEvent.findFirst({ where: { action: 'AUTH_LOGOUT' } });
    expect(audit).toMatchObject({
      actorUserId: user.id,
      entityType: 'AuthSession',
      entityId: row?.id,
    });
    expect((await getSession(token)).status).toBe(401);
    expect((await logout(token, csrfToken)).status).toBe(401);
  });

  it('logout without a session → 401', async () => {
    const result = record(
      'logout',
      await http(t.port, 'POST', '/api/v1/auth/logout', {
        headers: { Origin: ALLOWED_ORIGIN, 'X-CSRF-Token': 'x'.repeat(43) },
      }),
    );
    expect(result.status).toBe(401);
    expect(errorCode(result)).toBe('SESSION_REQUIRED');
  });
});

describe('THROTTLING', () => {
  it('after 5 failures the account gets 429 + Retry-After even with the right password, then recovers', async () => {
    await insertUser(prisma, EMAIL, PASSWORD);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await login(t.port, EMAIL, `synthetic-wrong-${attempt}-password`)).status).toBe(403);
    }
    const throttled = record('login', await login(t.port, EMAIL, PASSWORD));
    expect(throttled.status).toBe(429);
    expect(errorCode(throttled)).toBe('LOGIN_RATE_LIMITED');
    expect(throttled.headers['retry-after']).toBe('900');
    expect(t.hasher.verifyCalls).toBe(5); // the throttled attempt was not verified
    t.clock.advance(15 * MINUTE);
    expect((await login(t.port, EMAIL, PASSWORD)).status).toBe(200);
  });

  it('unknown accounts are throttled exactly like existing ones', async () => {
    await insertUser(prisma, EMAIL, PASSWORD);
    const bodies: unknown[] = [];
    for (const email of [EMAIL, 'p1-unknown@example.invalid']) {
      for (let attempt = 0; attempt < 5; attempt += 1)
        await login(t.port, email, 'synthetic-wrong-password');
      const result = await login(t.port, email, PASSWORD);
      expect(result.status).toBe(429);
      const body = OperationErrorSchema.parse(result.json);
      bodies.push({ ...body.error, requestId: 'x', retryAfter: result.headers['retry-after'] });
    }
    expect(bodies[0]).toEqual(bodies[1]);
  });

  it('a global failure budget stops spraying across many emails', async () => {
    await t.close();
    t = await startTestApp(prisma, { throttle: { maxFailuresGlobal: 3 } });
    for (let index = 0; index < 3; index += 1) {
      expect(
        (await login(t.port, `p1-spray-${index}@example.invalid`, 'synthetic-wrong-password'))
          .status,
      ).toBe(403);
    }
    expect(
      (await login(t.port, 'p1-spray-fresh@example.invalid', 'synthetic-wrong-password')).status,
    ).toBe(429);
  });
});

describe('SECURITY', () => {
  it('responses, logs and audit rows never contain passwords, tokens or hashes', async () => {
    await insertUser(prisma, EMAIL, PASSWORD);
    const { result: loginResult, token, csrfToken } = await loggedIn();
    const sessionResult = await getSession(token);
    const responses = [
      await logout(token, 'x'.repeat(43)),
      await logout(token, csrfToken),
      await login(t.port, EMAIL, 'synthetic-wrong-password-0002'),
      await login(t.port, 'p1-nobody@example.invalid', PASSWORD),
      await http(t.port, 'POST', '/api/v1/auth/login', {
        headers: loginHeaders(),
        body: `{"email":"${EMAIL}","password":"${PASSWORD}"`,
      }),
    ];
    const passwordHash = (await prisma.user.findFirstOrThrow()).passwordHash;
    const sessionRows = await prisma.authSession.findMany();
    const secrets = [
      PASSWORD,
      passwordHash,
      token,
      ...sessionRows.flatMap((row) => [row.tokenHash, row.csrfTokenHash]),
    ];
    const serialized = (result: HttpResult) => `${JSON.stringify(result.headers)}\n${result.text}`;
    for (const response of responses) {
      for (const secret of [...secrets, csrfToken])
        expect(serialized(response)).not.toContain(secret);
    }
    // Login carries the token only in Set-Cookie; login and GET session carry the CSRF token only in
    // the contract SessionView body.
    for (const secret of secrets) {
      expect(loginResult.text).not.toContain(secret);
      expect(serialized(sessionResult)).not.toContain(secret);
    }
    expect(loginResult.text).toContain(csrfToken);
    expect(sessionResult.text).toContain(csrfToken);
    const logText = t.logs.join('\n');
    for (const secret of [...secrets, csrfToken, EMAIL, 'p1-nobody@example.invalid']) {
      expect(logText).not.toContain(secret);
    }
    expect(logText).toContain('Login rejected');
    const auditText = JSON.stringify(await prisma.auditEvent.findMany());
    for (const secret of [...secrets, csrfToken]) expect(auditText).not.toContain(secret);
  });

  it("caps JSON bodies at 1 MiB before parsing, within each operation's declared statuses", async () => {
    await insertUser(prisma, EMAIL, PASSWORD);
    const { token, csrfToken } = await loggedIn();
    const oversized = JSON.stringify({ email: EMAIL, password: 'x'.repeat(1_100_000) });
    // login declares no 413: the same condition is reported as 400 PAYLOAD_TOO_LARGE.
    const tooLarge = record(
      'login',
      await http(t.port, 'POST', '/api/v1/auth/LOGIN/', {
        headers: loginHeaders(),
        body: oversized,
      }),
    );
    expect(tooLarge.status).toBe(400);
    expect(errorCode(tooLarge)).toBe('PAYLOAD_TOO_LARGE');
    expect(tooLarge.text).not.toContain('xxxxxxxx');
    // logout declares 413.
    const tooLargeLogout = record(
      'logout',
      await http(t.port, 'POST', '/api/v1/auth/logout', {
        headers: {
          Origin: ALLOWED_ORIGIN,
          'Content-Type': 'application/json',
          ...cookieHeader(token),
          'X-CSRF-Token': csrfToken,
        },
        body: oversized,
      }),
    );
    expect(tooLargeLogout.status).toBe(413);
    expect(errorCode(tooLargeLogout)).toBe('PAYLOAD_TOO_LARGE');
    expect((await getSession(token)).status).toBe(200); // rejected before the handler ran
    expect(t.hasher.verifyCalls).toBe(1); // only the login above, never the oversized attempt
    const health = await http(t.port, 'GET', '/api/v1/health');
    for (const response of [tooLarge, tooLargeLogout, health]) {
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['x-powered-by']).toBeUndefined();
      expect(response.headers['etag']).toBeUndefined();
    }
  });

  it('unexpected failures return a generic 500 without stack traces or internal messages', async () => {
    await insertUser(prisma, EMAIL, PASSWORD);
    t.clock.failNext = true;
    const result = record('login', await login(t.port, EMAIL, PASSWORD));
    expect(result.status).toBe(500);
    expect(OperationErrorSchema.parse(result.json).error).toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'The server could not complete the request.',
      details: {},
    });
    expect(result.text).not.toMatch(/SECRET-MESSAGE|\bat \S+ \(|\.ts:\d+|node:internal/);
    const logText = t.logs.join('\n');
    expect(logText).toContain('Unhandled Error');
    expect(logText).not.toContain('SECRET-MESSAGE-MUST-NOT-LEAK');
  });

  it('Cache-Control: no-store on every API response', () => {
    expect(collected.length).toBeGreaterThan(30);
    for (const { operationId, result } of collected) {
      expect(result.headers['cache-control'], `${operationId} ${result.status}`).toBe('no-store');
    }
  });

  it('every collected response matches the contract status set and schema of its operation', () => {
    const byId = new Map<string, (typeof operations)[number]>(
      operations.map((operation) => [operation.operationId, operation]),
    );
    for (const { operationId, result } of collected) {
      const operation = byId.get(operationId);
      if (!operation) throw new Error(`unknown operation ${operationId}`);
      const label = `${operationId} ${result.status}`;
      if (result.status === Number(operation.success.status)) {
        if ('schema' in operation.success) {
          expect(operation.success.schema.safeParse(result.json).success, label).toBe(true);
        } else {
          expect(result.text, label).toBe('');
        }
      } else {
        expect(operation.errors as readonly string[], label).toContain(String(result.status));
        expect(OperationErrorSchema.safeParse(result.json).success, label).toBe(true);
      }
    }
  });

  it('exposes the four auth/health routes and no signup, user-management, signing or sending route', async () => {
    const express = t.app.getHttpAdapter().getInstance() as {
      router: { stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }> };
    };
    const routes = express.router.stack
      .filter((layer) => layer.route)
      .flatMap((layer) =>
        Object.keys(layer.route?.methods ?? {}).map(
          (method) => `${method.toUpperCase()} ${layer.route?.path}`,
        ),
      )
      .sort();
    // P2 adds the directory routes, P3A the source and route operations, P3B the mandate,
    // version, coverage and coverage-signer operations, P4A the case, case-source and authority
    // selection operations, R8 the selection read-back of TB-SCHEMA-API-v1.1.0, P4B the case intake
    // operations, R9 the fact-source read-back of TB-SCHEMA-API-v1.2.0, P4C the correspondence
    // capture and case-binding operations, P4D the read-only production context, P4E the prompt
    // operations, P4F the candidate operations and P4G the technical validation operations (exact
    // inventory: directory-http.test.ts); nothing else (a candidate has no send route: see below).
    const directory =
      /^[A-Z]+ \/api\/v1\/(agencies|owners|legal-subjects|signers|owner-subjects|sources|routes|mandates|mandate-versions|coverages|coverage-signers|cases|case-sources|correspondence|prompts|candidates|validation-runs)(\/|$)/;
    expect(routes.filter((route) => !directory.test(route))).toEqual([
      'GET /api/v1/auth/session',
      'GET /api/v1/health',
      'POST /api/v1/auth/login',
      'POST /api/v1/auth/logout',
    ]);
    for (const path of [
      '/api/v1/auth/signup',
      '/api/v1/auth/register',
      '/api/v1/users',
      '/api/v1/signers/00000000-0000-4000-8000-000000000001/sign',
      '/api/v1/candidates/00000000-0000-4000-8000-000000000001/send',
      '/api/v1/correspondence/00000000-0000-4000-8000-000000000001/send',
      '/api/v1/correspondence/00000000-0000-4000-8000-000000000001/reply',
      '/api/v1/coverage-signers/00000000-0000-4000-8000-000000000001/sign',
      '/api/v1/mandate-versions/00000000-0000-4000-8000-000000000001/approve',
    ]) {
      const result = await http(t.port, 'POST', path, { headers: loginHeaders(), body: '{}' });
      expect(result.status, path).toBe(404);
      expect(errorCode(result)).toBe('NOT_FOUND');
    }
    // The contract itself declares no public registration/sign/send operation.
    const publicWrites = operations.filter(
      (operation) => operation.security === 'none' && operation.method !== 'get',
    );
    expect(publicWrites.map((operation) => operation.operationId)).toEqual(['login']);
    expect(
      operations.some((operation) => /signup|register|sign$|send|adopt/i.test(operation.path)),
    ).toBe(false);
  });

  it('health stays public and valid; logging in touches no business table (a User is not a Signer)', async () => {
    const health = await http(t.port, 'GET', '/api/v1/health');
    expect(health.status).toBe(200);
    expect(GetHealthResponseSchema.parse(health.json).data.status).toBe('ok');
    await insertUser(prisma, EMAIL, PASSWORD);
    const { token, csrfToken } = await loggedIn();
    expect((await logout(token, csrfToken)).status).toBe(204);
    const business = [
      'agencies',
      'owners',
      'legal_subjects',
      'signers',
      'routes',
      'mandates',
      'cases',
      'notice_candidates',
      'candidate_assessments',
      'idempotency_records',
    ];
    for (const table of business) {
      const [row] = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT COUNT(*) AS n FROM \`${table}\``,
      );
      expect(Number(row?.n), table).toBe(0);
    }
  });
});
