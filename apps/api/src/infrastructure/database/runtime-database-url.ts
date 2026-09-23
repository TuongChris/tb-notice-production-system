import type { PrismaMariaDb } from '@prisma/adapter-mariadb';

/** Driver pool configuration accepted by the Prisma MariaDB/MySQL adapter. */
export type RuntimePoolConfig = Exclude<ConstructorParameters<typeof PrismaMariaDb>[0], string>;

const RUNTIME_SCHEMA = 'tb_notice_dev';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost']);

/**
 * Parses DATABASE_URL into a driver pool configuration for the runtime account.
 * Fails closed: the runtime must use the scoped tb_dev-style account on the local development
 * schema, never root (decision D3). Error messages never include the password.
 */
export function runtimePoolConfig(rawUrl: string | undefined): RuntimePoolConfig {
  if (!rawUrl) {
    throw new Error('DATABASE_URL is not set.');
  }
  const url = new URL(rawUrl);
  const user = decodeURIComponent(url.username);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (url.protocol !== 'mysql:') {
    throw new Error('DATABASE_URL must use the mysql: protocol.');
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error('DATABASE_URL must point to the local loopback database.');
  }
  if (user === 'root' || user === 'tb_migrate') {
    throw new Error(`DATABASE_URL user ${user} is not permitted for the application runtime.`);
  }
  if (database !== RUNTIME_SCHEMA) {
    throw new Error(`DATABASE_URL schema must be ${RUNTIME_SCHEMA}.`);
  }
  return {
    host: url.hostname,
    port: Number(url.port || '3306'),
    user,
    password: decodeURIComponent(url.password),
    database,
    connectionLimit: 5,
    connectTimeout: 2000,
    acquireTimeout: 3000,
    // Session time zone is UTC to match the server (+00:00) and the UTC storage contract.
    timezone: '+00:00',
    // Session collation matches the binary schema collation (utf8mb4_0900_bin) so literal
    // comparisons in this session are case- and accent-sensitive like the stored identifiers.
    initSql: 'SET NAMES utf8mb4 COLLATE utf8mb4_0900_bin',
    // MySQL 8.4 caching_sha2_password over a loopback non-TLS connection needs the server RSA key.
    allowPublicKeyRetrieval: true,
  };
}
