// P1.1 local recovery commands against tb_notice_test (yarn test:db): the real CLI runner
// (arguments, stdin, output) with the store pointed at the test schema, and the real HTTP pipeline
// to observe the effect on sessions and logins. Synthetic users only; every test deletes its rows.
import { randomUUID } from 'node:crypto';
import { Readable, Writable } from 'node:stream';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../apps/api/generated/prisma/client.js';
import { ADMIN_COMMANDS } from '../../apps/api/src/cli/admin-args.js';
import { runAdminCli, type AdminCliDeps } from '../../apps/api/src/cli/admin-cli.js';
import { productionAdminCliDeps } from '../../apps/api/src/cli/admin-production.js';
import { resolveCliTarget } from '../../apps/api/src/cli/cli-target.js';
import { PasswordHasher } from '../../apps/api/src/modules/auth/password-hasher.js';
import { SYNTHETIC_ACTOR } from '../../scripts/db/seed-data.mjs';
import {
  assertAuthTablesEmpty,
  cleanAuthTables,
  cookieHeader,
  http,
  insertUser,
  login,
  openTestPrisma,
  sessionTokenFrom,
  startTestApp,
  TEST_SESSION_SECRET,
  type TestApp,
} from './auth-support.js';

const EMAIL = 'p1-recovery-admin@example.invalid';
const OTHER = 'p1-recovery-other@example.invalid';
const OLD_PASSWORD = 'synthetic recovery password 0001';
const NEW_PASSWORD = 'synthetic recovery password 0002';
const MINUTE = 60_000;
const RECOVERY_ACTIONS = [
  'USER_PASSWORD_RESET_LOCAL_CLI',
  'USER_DISABLED_LOCAL_CLI',
  'USER_ENABLED_LOCAL_CLI',
  'USER_SESSIONS_REVOKED_LOCAL_CLI',
];

let prisma: PrismaClient;
let t: TestApp;
/** Every token, CSRF token and digest seen in a test, checked against output and audit rows. */
let sessionMaterial: string[] = [];

async function cli(argv: string[], stdinText = '') {
  const out: string[] = [];
  const err: string[] = [];
  const deps: AdminCliDeps = {
    env: {},
    stdin: Object.assign(Readable.from([stdinText]), { isTTY: false }),
    stdout: new Writable({
      write(chunk, _encoding, callback) {
        out.push(String(chunk));
        callback();
      },
    }),
    stderr: { write: (text: string) => err.push(text) },
    // Test scope: the store is tb_notice_test; the production resolver is covered separately.
    resolveTarget: async () => ({
      pool: {} as never,
      label: 'tb_migrate@127.0.0.1:3307/tb_notice_test (test scope)',
    }),
    openDatabase: () => ({ client: prisma, close: async () => undefined }),
    clock: t.clock,
    hasher: new PasswordHasher(),
    newRequestId: randomUUID,
  };
  const code = await runAdminCli(argv, deps);
  return { code, stdout: out.join(''), stderr: err.join('') };
}

async function signIn(email: string, password: string) {
  const result = await login(t.port, email, password);
  expect(result.status).toBe(200);
  const token = sessionTokenFrom(result) ?? '';
  const csrfToken = (result.json as { data: { csrfToken: string } }).data.csrfToken;
  sessionMaterial.push(token, csrfToken);
  return { token, csrfToken };
}

const sessionStatus = async (token: string) =>
  (
    await http(t.port, 'GET', '/api/v1/auth/session', {
      headers: { ...cookieHeader(token), 'X-Requested-With': 'TB-APP' },
    })
  ).status;

async function insertP0Actor(overrides: { enabled?: boolean } = {}) {
  return prisma.user.create({
    data: {
      id: SYNTHETIC_ACTOR.id,
      email: SYNTHETIC_ACTOR.email,
      displayName: SYNTHETIC_ACTOR.displayName,
      passwordHash: SYNTHETIC_ACTOR.passwordHash,
      enabled: overrides.enabled ?? false,
      sessionEpoch: SYNTHETIC_ACTOR.sessionEpoch,
      disabledAt: new Date('2026-09-23T00:00:00.000Z'),
    },
  });
}

/** Nothing sensitive in CLI output, audit rows or API logs. */
async function expectNoSecrets(outputs: string[], extraSecrets: string[] = []) {
  const users = await prisma.user.findMany();
  const sessions = await prisma.authSession.findMany();
  const secrets = [
    OLD_PASSWORD,
    NEW_PASSWORD,
    TEST_SESSION_SECRET.toString('base64url'),
    ...users.map((user) => user.passwordHash),
    ...sessions.flatMap((row) => [row.tokenHash, row.csrfTokenHash]),
    ...sessionMaterial,
    ...extraSecrets,
  ].filter((value) => value.length >= 12);
  const audit = await prisma.auditEvent.findMany({ where: { action: { in: RECOVERY_ACTIONS } } });
  const haystacks = [...outputs, JSON.stringify(audit), t.logs.join('\n')];
  for (const haystack of haystacks) {
    for (const secret of secrets) expect(haystack).not.toContain(secret);
  }
  for (const event of audit) {
    const keys = [
      ...Object.keys((event.beforeRedacted as object | null) ?? {}),
      ...Object.keys((event.afterRedacted as object | null) ?? {}),
    ];
    for (const key of keys) expect(key).not.toMatch(/password|token|secret|csrf|hash|cookie/i);
  }
}

const recoveryAudit = (action: string) => prisma.auditEvent.findMany({ where: { action } });

beforeAll(async () => {
  ({ prisma } = openTestPrisma());
  await assertAuthTablesEmpty(prisma);
});

beforeEach(async () => {
  t = await startTestApp(prisma);
  sessionMaterial = [];
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

describe('admin:password', () => {
  it('replaces the Argon2id hash, bumps the epoch and revokes every session in one transaction', async () => {
    const { id } = await insertUser(prisma, EMAIL, OLD_PASSWORD);
    const before = await prisma.user.findUniqueOrThrow({ where: { id } });
    const first = await signIn(EMAIL, OLD_PASSWORD);
    await signIn(EMAIL, OLD_PASSWORD);
    t.clock.advance(MINUTE);
    const result = await cli(
      [
        'password',
        '--email',
        EMAIL.toUpperCase(),
        '--password-stdin',
        '--reason',
        'synthetic drill',
      ],
      `${NEW_PASSWORD}\n`,
    );
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain(`password replaced for application user ${id} (${EMAIL})`);
    expect(result.stdout).toContain('session epoch 1 → 2; 2 active session(s) revoked');
    expect(result.stdout).toContain('The account stays enabled');
    expect(result.stdout).toMatch(/no Signer, authority or business record was changed/);

    const after = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(after.passwordHash).toMatch(/^\$argon2id\$v=19\$m=65536,/);
    expect(after.passwordHash).not.toBe(before.passwordHash);
    expect(await new PasswordHasher().verify(after.passwordHash, NEW_PASSWORD)).toBe(true);
    expect(after.passwordChangedAt?.getTime()).toBe(t.clock.ms);
    expect(after.sessionEpoch).toBe(2);
    // Only the password hash, its change time and the epoch changed.
    const stable = (user: typeof after) => ({
      ...user,
      passwordHash: '',
      passwordChangedAt: null,
      sessionEpoch: 0,
    });
    expect(stable(after)).toEqual(stable(before));
    const sessions = await prisma.authSession.findMany({ where: { userId: id } });
    expect(sessions.map((row) => row.revokedAt?.getTime())).toEqual([t.clock.ms, t.clock.ms]);

    expect(await sessionStatus(first.token)).toBe(401);
    const oldLogin = await login(t.port, EMAIL, OLD_PASSWORD);
    expect(oldLogin.status).toBe(403);
    expect((oldLogin.json as { error: { code: string } }).error.code).toBe('INVALID_CREDENTIALS');
    await signIn(EMAIL, NEW_PASSWORD);

    const [event] = await recoveryAudit('USER_PASSWORD_RESET_LOCAL_CLI');
    expect(event).toMatchObject({
      actorUserId: null,
      entityType: 'User',
      entityId: id,
      beforeRedacted: { sessionEpoch: 1 },
      afterRedacted: {
        email: EMAIL,
        credentialChangedAt: new Date(t.clock.ms).toISOString(),
        sessionEpoch: 2,
        revokedSessions: 2,
      },
    });
    expect(event?.reason).toMatch(
      /yarn admin:password.*not a Signer.*Operator reason: synthetic drill/,
    );
    await expectNoSecrets([result.stdout, result.stderr], [before.passwordHash]);
  });

  it('keeps a disabled account disabled', async () => {
    const { id } = await insertUser(prisma, EMAIL, OLD_PASSWORD, {
      enabled: false,
      disabledAt: new Date(t.clock.ms),
    });
    const result = await cli(['password', '--email', EMAIL, '--password-stdin'], NEW_PASSWORD);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain('The account stays disabled');
    expect((await prisma.user.findUniqueOrThrow({ where: { id } })).enabled).toBe(false);
    expect((await login(t.port, EMAIL, NEW_PASSWORD)).status).toBe(403);
  });

  it('refuses unknown users, policy violations and protected fixtures without any change', async () => {
    await insertUser(prisma, EMAIL, OLD_PASSWORD);
    await insertP0Actor();
    const snapshot = async () => prisma.user.findMany({ orderBy: { email: 'asc' } });
    const before = await snapshot();
    const cases: Array<[string[], string, RegExp]> = [
      [
        ['password', '--email', 'p1-nobody@example.invalid', '--password-stdin'],
        NEW_PASSWORD,
        /no application user matches/,
      ],
      [['password', '--email', EMAIL, '--password-stdin'], 'too-short-01', /at least 15/],
      [['password', '--email', EMAIL, '--password-stdin'], EMAIL, /must not equal the email/],
      [
        ['password', '--email', SYNTHETIC_ACTOR.email, '--password-stdin'],
        NEW_PASSWORD,
        /protected/,
      ],
    ];
    for (const [argv, stdin, message] of cases) {
      const result = await cli(argv, stdin);
      expect(result.code, argv.join(' ')).toBe(1);
      expect(result.stderr).toMatch(message);
      expect(`${result.stdout}${result.stderr}`).not.toContain(NEW_PASSWORD);
    }
    expect(await snapshot()).toEqual(before);
    expect(await prisma.auditEvent.count({ where: { action: { in: RECOVERY_ACTIONS } } })).toBe(0);
  });
});

describe('admin:disable', () => {
  it('disables an enabled user: sessions end, login fails generically, the row is kept', async () => {
    const { id } = await insertUser(prisma, EMAIL, OLD_PASSWORD);
    const first = await signIn(EMAIL, OLD_PASSWORD);
    await signIn(EMAIL, OLD_PASSWORD);
    t.clock.advance(MINUTE);
    const result = await cli(['disable', '--email', EMAIL, '--reason', 'synthetic offboarding']);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      `disabled application user ${id} (${EMAIL}); session epoch 1 → 2; 2 active session(s) revoked. The user row is kept.`,
    );
    const after = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(after).toMatchObject({ enabled: false, sessionEpoch: 2 });
    expect(after.disabledAt?.getTime()).toBe(t.clock.ms);
    expect(await prisma.authSession.count({ where: { userId: id, revokedAt: null } })).toBe(0);
    expect(await sessionStatus(first.token)).toBe(401);
    const attempt = await login(t.port, EMAIL, OLD_PASSWORD);
    expect(attempt.status).toBe(403);
    expect((attempt.json as { error: { code: string } }).error.code).toBe('INVALID_CREDENTIALS');
    const [event] = await recoveryAudit('USER_DISABLED_LOCAL_CLI');
    expect(event).toMatchObject({
      entityId: id,
      beforeRedacted: { enabled: true, disabledAt: null, sessionEpoch: 1 },
      afterRedacted: {
        email: EMAIL,
        enabled: false,
        disabledAt: new Date(t.clock.ms).toISOString(),
        sessionEpoch: 2,
        revokedSessions: 2,
      },
    });
    expect(event?.reason).toContain('Operator reason: synthetic offboarding');
    await expectNoSecrets([result.stdout, result.stderr]);
  });

  it('repeated disable is a safe no-op, and a partly disabled row is completed', async () => {
    const { id } = await insertUser(prisma, EMAIL, OLD_PASSWORD);
    expect((await cli(['disable', '--email', EMAIL])).code).toBe(0);
    const again = await cli(['disable', '--email', EMAIL]);
    expect(again.code).toBe(0);
    expect(again.stdout).toContain(
      `application user ${id} (${EMAIL}) is already disabled; nothing changed.`,
    );
    expect((await prisma.user.findUniqueOrThrow({ where: { id } })).sessionEpoch).toBe(2);
    expect(await recoveryAudit('USER_DISABLED_LOCAL_CLI')).toHaveLength(1);

    const partial = await insertUser(prisma, OTHER, OLD_PASSWORD, {
      enabled: false,
      disabledAt: null,
    });
    expect((await cli(['disable', '--email', OTHER])).code).toBe(0);
    const completed = await prisma.user.findUniqueOrThrow({ where: { id: partial.id } });
    expect(completed.disabledAt?.getTime()).toBe(t.clock.ms);
    expect(completed.sessionEpoch).toBe(2);
  });

  it('only reports the P0 synthetic actor and never modifies it', async () => {
    const before = await insertP0Actor();
    const result = await cli(['disable', '--email', SYNTHETIC_ACTOR.email]);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      'is already disabled; nothing changed. (protected P0 synthetic actor: never modified)',
    );
    expect(await prisma.user.findUniqueOrThrow({ where: { id: before.id } })).toEqual(before);

    await prisma.user.update({ where: { id: before.id }, data: { enabled: true } });
    const tampered = await prisma.user.findUniqueOrThrow({ where: { id: before.id } });
    const refused = await cli(['disable', '--email', SYNTHETIC_ACTOR.email]);
    expect(refused.code).toBe(1);
    expect(refused.stderr).toMatch(/protected.*restore it with yarn db:seed/);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: before.id } })).toEqual(tampered);
    expect(await prisma.auditEvent.count()).toBe(0);
  });
});

describe('admin:enable', () => {
  it('enables a disabled user; sessions from before stay unusable; the unchanged password works', async () => {
    const { id } = await insertUser(prisma, EMAIL, OLD_PASSWORD);
    const earlier = await signIn(EMAIL, OLD_PASSWORD);
    // Disabled out of band (for example directly in SQL), without revoking the session row.
    await prisma.user.update({
      where: { id },
      data: { enabled: false, disabledAt: new Date(t.clock.ms) },
    });
    t.clock.advance(MINUTE);
    const result = await cli(['enable', '--email', EMAIL]);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      `enabled application user ${id} (${EMAIL}); session epoch 1 → 2 (sessions from before stay unusable); 1 active session(s) revoked.`,
    );
    const after = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(after).toMatchObject({ enabled: true, disabledAt: null, sessionEpoch: 2 });
    expect(await sessionStatus(earlier.token)).toBe(401);
    const fresh = await signIn(EMAIL, OLD_PASSWORD);
    expect(await sessionStatus(fresh.token)).toBe(200);
    const [event] = await recoveryAudit('USER_ENABLED_LOCAL_CLI');
    expect(event).toMatchObject({
      entityId: id,
      afterRedacted: {
        email: EMAIL,
        enabled: true,
        disabledAt: null,
        sessionEpoch: 2,
        revokedSessions: 1,
      },
    });
    await expectNoSecrets([result.stdout, result.stderr]);
  });

  it('a disable → enable cycle leaves every earlier session unusable', async () => {
    await insertUser(prisma, EMAIL, OLD_PASSWORD);
    const earlier = await signIn(EMAIL, OLD_PASSWORD);
    expect((await cli(['disable', '--email', EMAIL])).code).toBe(0);
    expect((await cli(['enable', '--email', EMAIL])).code).toBe(0);
    expect(await sessionStatus(earlier.token)).toBe(401);
    await signIn(EMAIL, OLD_PASSWORD);
  });

  it('repeated enable is a safe no-op', async () => {
    const { id } = await insertUser(prisma, EMAIL, OLD_PASSWORD);
    const result = await cli(['enable', '--email', EMAIL]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(
      `application user ${id} (${EMAIL}) is already enabled; nothing changed.`,
    );
    expect((await prisma.user.findUniqueOrThrow({ where: { id } })).sessionEpoch).toBe(1);
    expect(await prisma.auditEvent.count()).toBe(0);
  });

  it('the P0 synthetic actor and other non-credential fixtures can never be enabled', async () => {
    const actor = await insertP0Actor();
    const fixture = await insertUser(prisma, 'p1-fixture@example.invalid', OLD_PASSWORD, {
      enabled: false,
      disabledAt: new Date(t.clock.ms),
      passwordHash: '!P1-TEST-NON-CREDENTIAL-MARKER',
    });
    const before = await prisma.user.findMany({ orderBy: { email: 'asc' } });
    for (const email of [
      SYNTHETIC_ACTOR.email,
      SYNTHETIC_ACTOR.email.toUpperCase(),
      'p1-fixture@example.invalid',
    ]) {
      const result = await cli(['enable', '--email', email]);
      expect(result.code, email).toBe(1);
      expect(result.stderr).toMatch(/protected; admin commands never modify it/);
    }
    expect(await prisma.user.findMany({ orderBy: { email: 'asc' } })).toEqual(before);
    expect([actor.enabled, fixture.id.length]).toEqual([false, 36]);
    expect(await prisma.auditEvent.count()).toBe(0);
  });
});

describe('admin:revoke-sessions', () => {
  it("revokes only this user's active sessions, keeps history and bumps the epoch", async () => {
    const { id } = await insertUser(prisma, EMAIL, OLD_PASSWORD);
    await insertUser(prisma, OTHER, OLD_PASSWORD);
    const active = [
      await signIn(EMAIL, OLD_PASSWORD),
      await signIn(EMAIL, OLD_PASSWORD),
      await signIn(EMAIL, OLD_PASSWORD),
    ];
    // A session ended by logout earlier (historical, revoked) ...
    const loggedOut = await signIn(EMAIL, OLD_PASSWORD);
    const logout = await http(t.port, 'POST', '/api/v1/auth/logout', {
      headers: {
        Origin: 'http://localhost:5173',
        ...cookieHeader(loggedOut.token),
        'X-CSRF-Token': loggedOut.csrfToken,
      },
    });
    expect(logout.status).toBe(204);
    const loggedOutRow = await prisma.authSession.findFirstOrThrow({
      where: { userId: id, revokedAt: { not: null } },
    });
    // ... and an expired, never revoked row (historical).
    const expired = await prisma.authSession.create({
      data: {
        userId: id,
        tokenHash: 'e'.repeat(64),
        csrfTokenHash: 'f'.repeat(64),
        createdAt: new Date(t.clock.ms - 13 * 60 * MINUTE),
        lastSeenAt: new Date(t.clock.ms - 13 * 60 * MINUTE),
        expiresAt: new Date(t.clock.ms - 60 * MINUTE),
      },
    });
    const other = await signIn(OTHER, OLD_PASSWORD);
    t.clock.advance(MINUTE);

    const result = await cli([
      'revoke-sessions',
      '--email',
      EMAIL,
      '--reason',
      'synthetic device lost',
    ]);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      `3 active session(s) revoked for application user ${id} (${EMAIL}); session epoch 1 → 2 (every earlier session is unusable).`,
    );
    for (const session of active) expect(await sessionStatus(session.token)).toBe(401);
    expect(await sessionStatus(other.token)).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: OTHER } })).sessionEpoch).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id } })).sessionEpoch).toBe(2);
    expect(await prisma.authSession.findUniqueOrThrow({ where: { id: loggedOutRow.id } })).toEqual(
      loggedOutRow,
    );
    expect(await prisma.authSession.findUniqueOrThrow({ where: { id: expired.id } })).toEqual(
      expired,
    );
    expect(await prisma.authSession.count({ where: { userId: id } })).toBe(5);
    const [event] = await recoveryAudit('USER_SESSIONS_REVOKED_LOCAL_CLI');
    expect(event).toMatchObject({
      entityId: id,
      beforeRedacted: { sessionEpoch: 1 },
      afterRedacted: { email: EMAIL, sessionEpoch: 2, revokedSessions: 3 },
    });
    await expectNoSecrets([result.stdout, result.stderr]);
  });

  it('succeeds with zero sessions', async () => {
    const { id } = await insertUser(prisma, EMAIL, OLD_PASSWORD);
    const result = await cli(['revoke-sessions', '--email', EMAIL]);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain('0 active session(s) revoked');
    expect((await prisma.user.findUniqueOrThrow({ where: { id } })).sessionEpoch).toBe(2);
    expect(
      (await recoveryAudit('USER_SESSIONS_REVOKED_LOCAL_CLI'))[0]?.afterRedacted,
    ).toMatchObject({
      revokedSessions: 0,
    });
  });

  it('refuses unknown users and protected fixtures', async () => {
    const actor = await insertP0Actor();
    for (const email of ['p1-nobody@example.invalid', SYNTHETIC_ACTOR.email]) {
      const result = await cli(['revoke-sessions', '--email', email]);
      expect(result.code, email).toBe(1);
      expect(result.stderr).toMatch(/no application user matches|protected/);
    }
    expect(await prisma.user.findUniqueOrThrow({ where: { id: actor.id } })).toEqual(actor);
    expect(await prisma.auditEvent.count()).toBe(0);
  });
});

describe('compiled-entry wiring', () => {
  it('the production dependencies use the shared allowlist guard and refuse before connecting', async () => {
    const production = productionAdminCliDeps();
    expect(production.resolveTarget).toBe(resolveCliTarget);
    for (const command of ADMIN_COMMANDS) {
      const openDatabase = vi.fn(production.openDatabase);
      const err: string[] = [];
      const argv =
        command === 'create'
          ? [command, '--email', EMAIL, '--display-name', 'Synthetic', '--password-stdin']
          : command === 'password'
            ? [command, '--email', EMAIL, '--password-stdin']
            : [command, '--email', EMAIL];
      const code = await runAdminCli(argv, {
        ...production,
        env: {
          DATABASE_URL: 'mysql://tb_dev:syntheticNotARealPassword000@127.0.0.1:3306/tb_notice_dev',
        },
        stdin: Object.assign(Readable.from(['']), { isTTY: false }),
        stdout: new Writable({ write: (_chunk, _encoding, callback) => callback() }),
        stderr: { write: (text: string) => err.push(text) },
        openDatabase,
      });
      expect(code, command).toBe(1);
      expect(err.join(''), command).toMatch(/DATABASE_URL rejected: port 3306 is not 3307/);
      expect(openDatabase, command).not.toHaveBeenCalled();
    }
  });
});
