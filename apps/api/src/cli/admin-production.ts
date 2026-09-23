import { randomUUID } from 'node:crypto';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../../generated/prisma/client.js';
import { systemClock } from '../infrastructure/time/clock.js';
import { PasswordHasher } from '../modules/auth/password-hasher.js';
import type { AdminCliDeps } from './admin-cli.js';
import { resolveCliTarget } from './cli-target.js';

/**
 * Dependencies of the compiled admin CLI. The target resolver is always resolveCliTarget (shared
 * allowlist + API runtime boundary), so running the compiled entry directly is exactly as
 * restricted as `yarn admin:<command>`; the database connection uses the validated runtime pool.
 */
export function productionAdminCliDeps(): AdminCliDeps {
  return {
    env: process.env,
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
    resolveTarget: resolveCliTarget,
    openDatabase: (target) => {
      const client = new PrismaClient({ adapter: new PrismaMariaDb(target.pool) });
      return { client, close: () => client.$disconnect() };
    },
    clock: systemClock,
    hasher: new PasswordHasher(),
    newRequestId: randomUUID,
  };
}
