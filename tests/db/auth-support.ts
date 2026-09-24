// Support for the P1 HTTP/CLI integration tests on tb_notice_test (tb_migrate tooling account,
// resolved through the shared allowlist). The real AppModule wiring runs in-process with four
// test overrides: Prisma → tb_notice_test, a synthetic HMAC secret, a controllable clock and a
// counting password hasher. All data is synthetic; every test deletes what it created and the
// suite refuses to run unless the auth tables start empty.
import { randomBytes } from 'node:crypto';
import { request as httpRequestRaw, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { LoggerService } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { expect } from 'vitest';
import { PrismaClient } from '../../apps/api/generated/prisma/client.js';
import { AppModule } from '../../apps/api/src/app.module.js';
import { PrismaService } from '../../apps/api/src/infrastructure/database/prisma.service.js';
import { configureApp } from '../../apps/api/src/infrastructure/http/configure-app.js';
import { CLOCK, type Clock } from '../../apps/api/src/infrastructure/time/clock.js';
import {
  AUTH_CONFIG,
  LAST_SEEN_WRITE_INTERVAL_MS,
  LOOPBACK_DEV_COOKIE_POLICY,
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_TTL_MS,
  type AuthConfig,
} from '../../apps/api/src/modules/auth/auth-config.js';
import {
  DEFAULT_LOGIN_THROTTLE,
  type LoginThrottleSettings,
} from '../../apps/api/src/modules/auth/login-throttle.js';
import { PasswordHasher } from '../../apps/api/src/modules/auth/password-hasher.js';
import { AuditWriter } from '../../apps/api/src/infrastructure/write/audit-writer.js';
import { driverConfig, loadRootEnv, resolveTarget } from '../../scripts/db/lib/targets.mjs';

export const ALLOWED_ORIGIN = 'http://localhost:5173';
export const SECOND_ALLOWED_ORIGIN = 'http://127.0.0.1:5173';
/** Synthetic per-run HMAC key; never a real secret. */
export const TEST_SESSION_SECRET = randomBytes(32);

export function openTestPrisma(): { prisma: PrismaClient; label: string } {
  loadRootEnv();
  const resolved = resolveTarget('test', ['test']);
  const prisma = new PrismaClient({
    adapter: new PrismaMariaDb({ ...driverConfig(resolved), connectionLimit: 4 }),
  });
  return { prisma, label: resolved.label };
}

const AUTH_TABLES = ['audit_events', 'auth_sessions', 'users'] as const;

/** Fail closed: the suite only ever deletes rows it created, so the tables must start empty. */
export async function assertAuthTablesEmpty(prisma: PrismaClient): Promise<void> {
  const [session] = await prisma.$queryRaw<Array<{ db: string }>>`SELECT DATABASE() AS db`;
  expect(session?.db).toBe('tb_notice_test');
  for (const table of AUTH_TABLES) {
    const [row] = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT COUNT(*) AS n FROM \`${table}\``,
    );
    expect(Number(row?.n ?? -1), `${table} must be empty before the P1 suite`).toBe(0);
  }
}

/** Deletes the synthetic rows of one test (FK order; all modeled FKs are RESTRICT). */
export async function cleanAuthTables(prisma: PrismaClient): Promise<void> {
  await prisma.auditEvent.deleteMany({});
  await prisma.authSession.deleteMany({});
  await prisma.user.deleteMany({});
}

export class TestClock implements Clock {
  ms = Date.UTC(2026, 8, 23, 9, 0, 0);
  failNext = false;
  now(): Date {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('synthetic clock failure SECRET-MESSAGE-MUST-NOT-LEAK');
    }
    return new Date(this.ms);
  }
  advance(ms: number): void {
    this.ms += ms;
  }
}

export class CountingHasher extends PasswordHasher {
  verifyCalls = 0;
  override verify(storedHash: string | null, password: string): Promise<boolean> {
    this.verifyCalls += 1;
    return super.verify(storedHash, password);
  }
}

export class CapturingLogger implements LoggerService {
  constructor(readonly lines: string[]) {}
  private push(level: string, message: unknown, params: unknown[]): void {
    this.lines.push(`${level} ${String(message)} ${params.map(String).join(' ')}`);
  }
  log(message: unknown, ...params: unknown[]): void {
    this.push('log', message, params);
  }
  error(message: unknown, ...params: unknown[]): void {
    this.push('error', message, params);
  }
  warn(message: unknown, ...params: unknown[]): void {
    this.push('warn', message, params);
  }
  debug(message: unknown, ...params: unknown[]): void {
    this.push('debug', message, params);
  }
  verbose(message: unknown, ...params: unknown[]): void {
    this.push('verbose', message, params);
  }
  fatal(message: unknown, ...params: unknown[]): void {
    this.push('fatal', message, params);
  }
}

export interface TestApp {
  readonly app: NestExpressApplication;
  readonly port: number;
  readonly clock: TestClock;
  readonly hasher: CountingHasher;
  readonly logs: string[];
  close(): Promise<void>;
}

export function testAuthConfig(
  overrides: { secret?: Buffer; throttle?: Partial<LoginThrottleSettings> } = {},
): AuthConfig {
  return {
    sessionSecret: overrides.secret ?? TEST_SESSION_SECRET,
    allowedOrigins: new Set([ALLOWED_ORIGIN, SECOND_ALLOWED_ORIGIN]),
    cookie: LOOPBACK_DEV_COOKIE_POLICY,
    sessionTtlMs: SESSION_TTL_MS,
    idleTimeoutMs: SESSION_IDLE_TIMEOUT_MS,
    lastSeenWriteIntervalMs: LAST_SEEN_WRITE_INTERVAL_MS,
    throttle: { ...DEFAULT_LOGIN_THROTTLE, ...overrides.throttle },
  };
}

/** Boots the real AppModule + configureApp pipeline on an ephemeral loopback port. */
export async function startTestApp(
  prisma: PrismaClient,
  overrides: {
    secret?: Buffer;
    throttle?: Partial<LoginThrottleSettings>;
    clock?: TestClock;
    auditWriter?: AuditWriter;
  } = {},
): Promise<TestApp> {
  const clock = overrides.clock ?? new TestClock();
  const hasher = new CountingHasher();
  const logs: string[] = [];
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .overrideProvider(AUTH_CONFIG)
    .useValue(testAuthConfig(overrides))
    .overrideProvider(CLOCK)
    .useValue(clock)
    .overrideProvider(PasswordHasher)
    .useValue(hasher)
    .overrideProvider(AuditWriter)
    .useValue(overrides.auditWriter ?? new AuditWriter())
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
    logger: new CapturingLogger(logs),
  });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  return { app, port, clock, hasher, logs, close: () => app.close() };
}

export interface HttpResult {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly text: string;
  readonly json: unknown;
}

/** Raw HTTP client with full header control (Origin, Cookie) and access to every Set-Cookie. */
export function http(
  port: number,
  method: string,
  path: string,
  options: { headers?: Record<string, string>; body?: string } = {},
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { ...options.headers };
    if (options.body !== undefined)
      headers['Content-Length'] = String(Buffer.byteLength(options.body));
    const req = httpRequestRaw({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json: unknown;
        try {
          json = text === '' ? undefined : JSON.parse(text);
        } catch {
          json = undefined;
        }
        resolve({ status: res.statusCode ?? 0, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    if (options.body !== undefined) req.write(options.body);
    req.end();
  });
}

export const loginHeaders = (extra: Record<string, string> = {}): Record<string, string> => ({
  Origin: ALLOWED_ORIGIN,
  'X-Requested-With': 'TB-APP',
  'Content-Type': 'application/json',
  ...extra,
});

export function login(
  port: number,
  email: string,
  password: string,
  extra: Record<string, string> = {},
): Promise<HttpResult> {
  return http(port, 'POST', '/api/v1/auth/login', {
    headers: loginHeaders(extra),
    body: JSON.stringify({ email, password }),
  });
}

export function setCookies(result: HttpResult): string[] {
  const value = result.headers['set-cookie'];
  return value === undefined ? [] : value;
}

/** The tb_session_dev value set by a response, or undefined. */
export function sessionTokenFrom(result: HttpResult): string | undefined {
  for (const header of setCookies(result)) {
    const match = /^tb_session_dev=([^;]*)/.exec(header);
    if (match) return match[1];
  }
  return undefined;
}

export const cookieHeader = (token: string) => ({ Cookie: `tb_session_dev=${token}` });

export interface SyntheticUser {
  readonly id: string;
  readonly email: string;
  readonly password: string;
}

/** Inserts a synthetic user with a real Argon2id hash (bypassing the CLI's policy on purpose). */
export async function insertUser(
  prisma: PrismaClient,
  email: string,
  password: string,
  flags: { enabled?: boolean; disabledAt?: Date | null; passwordHash?: string } = {},
): Promise<SyntheticUser> {
  const user = await prisma.user.create({
    data: {
      email,
      displayName: `P1 synthetic user ${email}`,
      passwordHash: flags.passwordHash ?? (await new PasswordHasher().hash(password)),
      enabled: flags.enabled ?? true,
      disabledAt: flags.disabledAt ?? null,
    },
  });
  return { id: user.id, email, password };
}
