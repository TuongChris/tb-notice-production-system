// Shared pieces of the local admin CLI (yarn admin:create | password | disable | enable |
// revoke-sessions). These commands manage application-User login state only: they never touch a
// Signer, an authority record or any business entity, and they confer no legal authority.
import { codePointLength } from '@tb/contracts';
import type { PrismaClient, User } from '../../generated/prisma/client.js';
import { isWellFormedText, validateAccountEmail } from '../modules/auth/credentials.js';

/** A refusal whose message is safe to print (never a password, hash, token or digest). */
export class AdminRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminRefusal';
  }
}

/** Store operations the admin commands use (a PrismaClient in production and in tests). */
export type AdminStore = Pick<PrismaClient, 'user' | '$transaction' | '$queryRaw'>;

/**
 * The P0 disabled synthetic actor (scripts/db/seed-data.mjs; parity is tested). It exists only to
 * satisfy created_by foreign keys (AR-013) and is never modified by admin commands.
 */
export const P0_SYNTHETIC_ACTOR = Object.freeze({
  id: '00000000-0000-4000-8000-00000000a0c7',
  email: 'p0-synthetic-actor@example.invalid',
});

/**
 * Rows that admin commands never modify: the P0 synthetic actor (by id or email) and any fixture
 * whose password_hash is a non-credential marker (AR-013 markers start with "!").
 */
export function isProtectedFixture(user: Pick<User, 'id' | 'email' | 'passwordHash'>): boolean {
  return (
    user.id === P0_SYNTHETIC_ACTOR.id ||
    user.email === P0_SYNTHETIC_ACTOR.email ||
    user.passwordHash.startsWith('!')
  );
}

export const PROTECTED_FIXTURE_MESSAGE =
  'the P0 synthetic actor (or another non-credential fixture) is protected; admin commands never modify it';

/** Validates and normalizes an account email (contract rule), refusing before any database work. */
export function acceptEmail(input: string): string {
  const result = validateAccountEmail(input);
  if ('problem' in result) throw new AdminRefusal(result.problem);
  return result.email;
}

const REASON_MAX_CODE_POINTS = 500;
// eslint-disable-next-line no-control-regex -- matching control characters is the purpose here
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/u;

/** Optional operator-supplied audit context: 1–500 characters, no control characters. */
export function acceptReason(input: string): string {
  const reason = input.trim();
  if (
    reason === '' ||
    CONTROL_CHARACTER.test(reason) ||
    !isWellFormedText(reason) ||
    codePointLength(reason) > REASON_MAX_CODE_POINTS
  ) {
    throw new AdminRefusal(
      `--reason must be 1–${REASON_MAX_CODE_POINTS} characters without control characters`,
    );
  }
  return reason;
}
