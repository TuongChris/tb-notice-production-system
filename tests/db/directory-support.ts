// Support for the P2 directory HTTP tests on tb_notice_test (yarn test:db). The real AppModule +
// configureApp pipeline runs in-process (auth-support.ts); every request goes through the global
// guard with a real synthetic session, CSRF token and allowlisted Origin. All data is synthetic,
// the suite refuses to start unless the tables it touches are empty, and every test deletes what it
// created (foreign-key order; the agencies ⇄ source_references cycle is broken first).
import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { PrismaClient } from '../../apps/api/generated/prisma/client.js';
import { AuditWriter } from '../../apps/api/src/infrastructure/write/audit-writer.js';
import type { AuditEntry } from '../../apps/api/src/infrastructure/audit/audit-log.js';
import {
  ALLOWED_ORIGIN,
  cookieHeader,
  http,
  insertUser,
  login,
  sessionTokenFrom,
  type HttpResult,
} from './auth-support.js';

/** Tables the directory suite writes (every one must be empty before and after it). */
export const DIRECTORY_SUITE_TABLES = [
  'idempotency_records',
  'audit_events',
  'routes',
  'owner_subjects',
  'signers',
  'legal_subjects',
  'owners',
  'source_references',
  'agencies',
  'auth_sessions',
  'users',
] as const;

export async function assertSuiteTablesEmpty(prisma: PrismaClient): Promise<void> {
  const [session] = await prisma.$queryRaw<Array<{ db: string }>>`SELECT DATABASE() AS db`;
  expect(session?.db).toBe('tb_notice_test');
  for (const table of DIRECTORY_SUITE_TABLES) {
    const [row] = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT COUNT(*) AS n FROM \`${table}\``,
    );
    expect(Number(row?.n ?? -1), `${table} must be empty around the P2 suite`).toBe(0);
  }
}

/** Deletes every row of the suite's tables, in foreign-key order. */
export async function cleanSuiteTables(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe('UPDATE `agencies` SET `canonical_source_id` = NULL');
  await prisma.$executeRawUnsafe('UPDATE `owners` SET `canonical_source_id` = NULL');
  await prisma.$executeRawUnsafe('UPDATE `legal_subjects` SET `canonical_source_id` = NULL');
  await prisma.$executeRawUnsafe(
    'UPDATE `signers` SET `canonical_source_id` = NULL, `identity_source_id` = NULL, `delegation_source_id` = NULL',
  );
  for (const table of DIRECTORY_SUITE_TABLES) {
    await prisma.$executeRawUnsafe(`DELETE FROM \`${table}\``);
  }
}

export interface Session {
  readonly userId: string;
  readonly email: string;
  readonly token: string;
  readonly csrfToken: string;
}

/** Creates a synthetic enabled user and signs in through the real login endpoint. */
export async function signIn(
  port: number,
  prisma: PrismaClient,
  email = `p2-directory-${randomUUID().slice(0, 8)}@example.invalid`,
): Promise<Session> {
  const password = `synthetic-P2-password-${randomUUID()}`;
  const user = await insertUser(prisma, email, password);
  const result = await login(port, email, password);
  expect(result.status).toBe(200);
  const token = sessionTokenFrom(result);
  if (!token) throw new Error('login did not set a session cookie');
  const csrfToken = (result.json as { data: { csrfToken: string } }).data.csrfToken;
  return { userId: user.id, email, token, csrfToken };
}

export const newKey = (): string => `p2-test-${randomUUID()}`;

export interface Recorded {
  readonly operationId: string;
  readonly result: HttpResult;
}

export interface WriteOptions {
  readonly ifMatch?: string | null;
  readonly key?: string | null;
  readonly headers?: Record<string, string>;
  /** Raw body text instead of JSON.stringify(body). */
  readonly rawBody?: string;
}

/**
 * A browser-like client of one session: Origin, cookie, CSRF token and X-Requested-With on every
 * request, a fresh Idempotency-Key per write unless one is given (null omits it). Every result is
 * recorded with its contract operationId for the conformance check.
 */
export class DirectoryClient {
  constructor(
    private readonly port: number,
    readonly session: Session,
    private readonly recorded: Recorded[],
  ) {}

  private base(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Origin: ALLOWED_ORIGIN,
      'X-Requested-With': 'TB-APP',
      ...cookieHeader(this.session.token),
      ...extra,
    };
  }

  async get(operationId: string, path: string): Promise<HttpResult> {
    const result = await http(this.port, 'GET', `/api/v1${path}`, { headers: this.base() });
    this.recorded.push({ operationId, result });
    return result;
  }

  async write(
    operationId: string,
    method: 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
    options: WriteOptions = {},
  ): Promise<HttpResult> {
    const headers = this.base({ 'X-CSRF-Token': this.session.csrfToken, ...options.headers });
    const key = options.key === undefined ? newKey() : options.key;
    if (key !== null) headers['Idempotency-Key'] = key;
    if (options.ifMatch !== undefined && options.ifMatch !== null) {
      headers['If-Match'] = options.ifMatch;
    }
    const text = options.rawBody ?? (body === undefined ? undefined : JSON.stringify(body));
    if (text !== undefined) headers['Content-Type'] = 'application/json';
    const result = await http(this.port, method, `/api/v1${path}`, {
      headers,
      ...(text === undefined ? {} : { body: text }),
    });
    this.recorded.push({ operationId, result });
    return result;
  }
}

export function dataOf<T = Record<string, unknown>>(result: HttpResult): T {
  return (result.json as { data: T }).data;
}

export function errorOf(result: HttpResult): {
  code: string;
  details: Record<string, unknown>;
} {
  return (result.json as { error: { code: string; details: Record<string, unknown> } }).error;
}

export function etagOf(result: HttpResult): string {
  const value = result.headers['etag'];
  if (typeof value !== 'string') throw new Error(`no ETag on HTTP ${result.status}`);
  return value;
}

/** Audit writer that fails on demand AFTER the business change was attempted (AC-056). */
export class FailingAuditWriter extends AuditWriter {
  failures = 0;
  armed = false;
  override async append(tx: Parameters<AuditWriter['append']>[0], entry: AuditEntry) {
    if (this.armed) {
      this.failures += 1;
      throw new Error('synthetic audit failure');
    }
    return super.append(tx, entry);
  }
}

export async function countRows(prisma: PrismaClient, table: string): Promise<number> {
  const [row] = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT COUNT(*) AS n FROM \`${table}\``,
  );
  return Number(row?.n ?? 0);
}

/** A synthetic SourceReference inserted directly (the product cannot author one before Source). */
export async function insertSource(
  prisma: PrismaClient,
  actorUserId: string,
  options: { agencyId?: string | null; scopeBindings?: unknown } = {},
): Promise<string> {
  const id = randomUUID();
  await prisma.sourceReference.create({
    data: {
      id,
      agencyId: options.agencyId ?? null,
      sourceGroupId: randomUUID(),
      revision: 1,
      title: 'SYNTHETIC source fixture (test only; not evidence)',
      sourceRole: 'OPERATOR_INPUT',
      scopeText: 'Synthetic test scope',
      ...(options.scopeBindings === undefined
        ? {}
        : { scopeBindings: options.scopeBindings as object }),
      createdById: actorUserId,
    },
  });
  return id;
}

export { type HttpResult };
