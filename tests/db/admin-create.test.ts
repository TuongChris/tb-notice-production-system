// admin:create core against tb_notice_test (yarn test:db). The compiled CLI entry is guarded to
// tb_notice_dev, so the core function is exercised here directly; CI additionally runs the real
// `yarn admin:create --password-stdin` against its disposable tb_notice_dev.
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../../apps/api/generated/prisma/client.js';
import { AdminRefusal } from '../../apps/api/src/cli/admin-common.js';
import {
  createLocalAdmin,
  DUPLICATE_EMAIL_MESSAGE,
} from '../../apps/api/src/cli/admin-create-core.js';
import { systemClock } from '../../apps/api/src/infrastructure/time/clock.js';
import { PasswordHasher } from '../../apps/api/src/modules/auth/password-hasher.js';
import { SYNTHETIC_ACTOR } from '../../scripts/db/seed-data.mjs';
import {
  assertAuthTablesEmpty,
  cleanAuthTables,
  login,
  openTestPrisma,
  sessionTokenFrom,
  startTestApp,
} from './auth-support.js';

const PASSWORD = 'synthetic P1 admin passphrase 0001';
const EMAIL = 'p1-cli-admin@example.invalid';

class CountingHashHasher extends PasswordHasher {
  hashCalls = 0;
  override hash(password: string): Promise<string> {
    this.hashCalls += 1;
    return super.hash(password);
  }
}

let prisma: PrismaClient;
const deps = (hasher: PasswordHasher = new PasswordHasher()) => ({
  hasher,
  clock: systemClock,
  requestId: randomUUID(),
});

beforeAll(async () => {
  ({ prisma } = openTestPrisma());
  await assertAuthTablesEmpty(prisma);
});

afterEach(async () => {
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

describe('createLocalAdmin', () => {
  it('creates one enabled user with an Argon2id hash (never the plaintext) and a redacted audit event', async () => {
    const created = await createLocalAdmin(
      prisma,
      {
        email: 'P1-CLI-Admin@Example.Invalid',
        displayName: '  Synthetic CLI Admin  ',
        password: PASSWORD,
      },
      deps(),
    );
    expect(created.email).toBe(EMAIL);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: created.id } });
    expect(user).toMatchObject({
      email: EMAIL,
      displayName: 'Synthetic CLI Admin',
      enabled: true,
      sessionEpoch: 1,
      disabledAt: null,
    });
    expect(user.passwordChangedAt).not.toBeNull();
    expect(user.passwordHash).toMatch(/^\$argon2id\$v=19\$m=65536,/);
    expect(user.passwordHash).not.toContain(PASSWORD);
    expect(await new PasswordHasher().verify(user.passwordHash, PASSWORD)).toBe(true);

    const audit = await prisma.auditEvent.findMany();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: 'USER_CREATED_LOCAL_CLI',
      actorUserId: null,
      entityType: 'User',
      entityId: created.id,
      afterRedacted: { email: EMAIL, displayName: 'Synthetic CLI Admin', enabled: true },
    });
    const auditText = JSON.stringify(audit);
    expect(auditText).not.toContain(PASSWORD);
    expect(auditText).not.toContain(user.passwordHash);
    expect(auditText).toMatch(/not a Signer/);
  });

  it('creates an account that can sign in through the API', async () => {
    await createLocalAdmin(
      prisma,
      { email: EMAIL, displayName: 'Synthetic CLI Admin', password: PASSWORD },
      deps(),
    );
    const app = await startTestApp(prisma);
    try {
      const result = await login(app.port, EMAIL, PASSWORD);
      expect(result.status).toBe(200);
      expect(sessionTokenFrom(result)).toBeDefined();
      // NFKC: the same passphrase typed in decomposed form verifies too.
      expect((await login(app.port, EMAIL, PASSWORD.normalize('NFD'))).status).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('refuses a duplicate email (any case) without modifying the existing user', async () => {
    const original = await createLocalAdmin(
      prisma,
      { email: EMAIL, displayName: 'Synthetic CLI Admin', password: PASSWORD },
      deps(),
    );
    const before = await prisma.user.findUniqueOrThrow({ where: { id: original.id } });
    for (const email of [EMAIL, EMAIL.toUpperCase()]) {
      await expect(
        createLocalAdmin(
          prisma,
          { email, displayName: 'Overwrite attempt', password: 'synthetic other passphrase 02' },
          deps(),
        ),
      ).rejects.toThrow(DUPLICATE_EMAIL_MESSAGE);
    }
    expect(await prisma.user.findUniqueOrThrow({ where: { id: original.id } })).toEqual(before);
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.auditEvent.count()).toBe(1);
  });

  it('never turns the P0 disabled synthetic actor into an administrator', async () => {
    await prisma.user.create({
      data: {
        id: SYNTHETIC_ACTOR.id,
        email: SYNTHETIC_ACTOR.email,
        displayName: SYNTHETIC_ACTOR.displayName,
        passwordHash: SYNTHETIC_ACTOR.passwordHash,
        enabled: false,
        sessionEpoch: SYNTHETIC_ACTOR.sessionEpoch,
        disabledAt: new Date('2026-09-23T00:00:00.000Z'),
      },
    });
    const before = await prisma.user.findUniqueOrThrow({ where: { id: SYNTHETIC_ACTOR.id } });
    await expect(
      createLocalAdmin(
        prisma,
        { email: SYNTHETIC_ACTOR.email, displayName: 'Takeover', password: PASSWORD },
        deps(),
      ),
    ).rejects.toThrow(DUPLICATE_EMAIL_MESSAGE);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: SYNTHETIC_ACTOR.id } });
    expect(after).toEqual(before);
    expect(after.enabled).toBe(false);
    expect(after.passwordHash).toBe(SYNTHETIC_ACTOR.passwordHash);
  });

  it('validates email, display name and password policy before hashing or writing anything', async () => {
    const hasher = new CountingHashHasher();
    const invalid: Array<
      [string, { email: string; displayName: string; password: string }, RegExp]
    > = [
      [
        'bad email',
        { email: 'not-an-email', displayName: 'Synthetic', password: PASSWORD },
        /email/,
      ],
      [
        'empty display name',
        { email: EMAIL, displayName: '   ', password: PASSWORD },
        /display name/,
      ],
      [
        'short password',
        { email: EMAIL, displayName: 'Synthetic', password: 'too-short-01' },
        /at least 15/,
      ],
      [
        'password equals email',
        { email: EMAIL, displayName: 'Synthetic', password: EMAIL },
        /email/,
      ],
    ];
    for (const [label, input, message] of invalid) {
      const attempt = createLocalAdmin(prisma, input, deps(hasher));
      await expect(attempt, label).rejects.toBeInstanceOf(AdminRefusal);
      await expect(createLocalAdmin(prisma, input, deps(hasher)), label).rejects.toThrow(message);
    }
    expect(hasher.hashCalls).toBe(0);
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.auditEvent.count()).toBe(0);
  });
});
