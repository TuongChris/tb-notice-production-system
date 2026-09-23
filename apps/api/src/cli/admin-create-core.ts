// Core of `yarn admin:create` (AR-013: local administrator bootstrap through a reviewed local CLI;
// there is no public signup or user-creation API). Separated from terminal handling so tests can
// run it against the disposable tb_notice_test schema.
import { randomUUID } from 'node:crypto';
import { appendAuditEvent } from '../infrastructure/audit/audit-log.js';
import type { Clock } from '../infrastructure/time/clock.js';
import { newPasswordProblems, validateDisplayName } from '../modules/auth/credentials.js';
import type { PasswordHasher } from '../modules/auth/password-hasher.js';
import { acceptEmail, AdminRefusal, type AdminStore } from './admin-common.js';

export interface AdminCreateInput {
  readonly email: string;
  readonly displayName: string;
  readonly password: string;
}

export interface CreatedAdmin {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly createdAt: Date;
}

export interface AdminCreateDeps {
  readonly hasher: PasswordHasher;
  readonly clock: Clock;
  readonly requestId: string;
}

type UserStore = Pick<AdminStore, 'user' | '$transaction'>;

export const DUPLICATE_EMAIL_MESSAGE =
  'a user with this email already exists; admin:create never modifies, re-enables or overwrites an existing user';

export function acceptDisplayName(input: string): string {
  const result = validateDisplayName(input);
  if ('problem' in result) throw new AdminRefusal(result.problem);
  return result.displayName;
}

export async function assertEmailAvailable(store: UserStore, email: string): Promise<void> {
  const existing = await store.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw new AdminRefusal(DUPLICATE_EMAIL_MESSAGE);
}

/**
 * Creates one enabled application user with an Argon2id password hash and a redacted audit event,
 * in one transaction. Never updates an existing row: a duplicate email (checked first, and again
 * by the unique index under a race) is refused. The user is an application login only — not a
 * Signer, with no legal authority.
 */
export async function createLocalAdmin(
  store: UserStore,
  input: AdminCreateInput,
  deps: AdminCreateDeps,
): Promise<CreatedAdmin> {
  const email = acceptEmail(input.email);
  const displayName = acceptDisplayName(input.displayName);
  const problems = newPasswordProblems(input.password, email);
  if (problems.length > 0) throw new AdminRefusal(problems.join('; '));
  await assertEmailAvailable(store, email);

  const passwordHash = await deps.hasher.hash(input.password);
  const now = deps.clock.now();
  const id = randomUUID();
  try {
    await store.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          id,
          email,
          displayName,
          passwordHash,
          enabled: true,
          sessionEpoch: 1,
          passwordChangedAt: now,
          disabledAt: null,
          createdAt: now,
        },
      });
      await appendAuditEvent(tx, {
        requestId: deps.requestId,
        actorUserId: null,
        action: 'USER_CREATED_LOCAL_CLI',
        entityType: 'User',
        entityId: id,
        after: { email, displayName, enabled: true },
        reason:
          'Local administrator bootstrap via yarn admin:create. Application login only; ' +
          'not a Signer; confers no legal authority.',
      });
    });
  } catch (error) {
    if ((error as { code?: unknown }).code === 'P2002') {
      throw new AdminRefusal(DUPLICATE_EMAIL_MESSAGE);
    }
    throw error;
  }
  return { id, email, displayName, createdAt: now };
}
