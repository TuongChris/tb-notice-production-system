// Core of the local recovery commands: yarn admin:password | admin:disable | admin:enable |
// admin:revoke-sessions. Separated from terminal handling so tests can run it against the
// disposable tb_notice_test schema.
//
// Rules shared by every command:
// - the target is one existing application User identified by normalized email; a missing user is
//   refused and never created;
// - protected fixtures (the P0 synthetic actor, non-credential markers) are never modified;
// - each change, its session revocations and its redacted audit event commit in one transaction;
// - users.session_epoch is incremented atomically, so every earlier session fails the CSRF binding
//   check even if a row escaped revocation (sessions of other users are never touched);
// - revocation sets revoked_at on this user's active rows only; expired or already revoked rows are
//   historical and stay as they are.
// Application-User login state only: no Signer, authority or business entity is read or changed,
// and nothing confers legal authority.
import type { User } from '../../generated/prisma/client.js';
import { appendAuditEvent } from '../infrastructure/audit/audit-log.js';
import type { Clock } from '../infrastructure/time/clock.js';
import { newPasswordProblems } from '../modules/auth/credentials.js';
import type { PasswordHasher } from '../modules/auth/password-hasher.js';
import {
  acceptEmail,
  AdminRefusal,
  isProtectedFixture,
  P0_SYNTHETIC_ACTOR,
  PROTECTED_FIXTURE_MESSAGE,
  type AdminStore,
} from './admin-common.js';

export type RecoveryCommand = 'password' | 'disable' | 'enable' | 'revoke-sessions';

type RecoveryStore = Pick<AdminStore, 'user' | '$transaction'>;
type Transaction = Parameters<Parameters<RecoveryStore['$transaction']>[0]>[0];

export interface RecoveryDeps {
  readonly clock: Clock;
  readonly requestId: string;
  /** Optional operator-supplied context, appended to the audit reason. */
  readonly reason?: string;
}

export interface RecoveryOutcome {
  readonly userId: string;
  readonly email: string;
  /** False for an idempotent no-op (already disabled / already enabled). */
  readonly changed: boolean;
  readonly enabled: boolean;
  readonly sessionEpochBefore: number;
  readonly sessionEpochAfter: number;
  readonly revokedSessions: number;
  readonly protectedFixture: boolean;
}

export const UNKNOWN_USER_MESSAGE =
  'no application user matches that email; nothing was changed (admin commands never create users; use yarn admin:create)';

const auditReason = (command: RecoveryCommand, reason: string | undefined) =>
  `Local administrator recovery via yarn admin:${command}. Application login state only; ` +
  `not a Signer; confers no legal authority.${reason === undefined ? '' : ` Operator reason: ${reason}`}`;

const iso = (value: Date | null) => value?.toISOString() ?? null;

function unchanged(user: User, protectedFixture = false): RecoveryOutcome {
  return {
    userId: user.id,
    email: user.email,
    changed: false,
    enabled: user.enabled,
    sessionEpochBefore: user.sessionEpoch,
    sessionEpochAfter: user.sessionEpoch,
    revokedSessions: 0,
    protectedFixture,
  };
}

function changed(user: User, revokedSessions: number): RecoveryOutcome {
  return {
    userId: user.id,
    email: user.email,
    changed: true,
    enabled: user.enabled,
    sessionEpochBefore: user.sessionEpoch - 1,
    sessionEpochAfter: user.sessionEpoch,
    revokedSessions,
    protectedFixture: false,
  };
}

/** Revokes this user's active sessions (not revoked, not expired); returns how many. */
async function revokeActiveSessions(tx: Transaction, userId: string, now: Date): Promise<number> {
  const { count } = await tx.authSession.updateMany({
    where: { userId, revokedAt: null, expiresAt: { gt: now } },
    data: { revokedAt: now },
  });
  return count;
}

/** Looks up the existing target user, refusing unknown emails. */
export async function findTargetUser(store: RecoveryStore, emailInput: string): Promise<User> {
  const user = await store.user.findUnique({ where: { email: acceptEmail(emailInput) } });
  if (!user) throw new AdminRefusal(UNKNOWN_USER_MESSAGE);
  return user;
}

/** Target lookup for commands that may never touch a protected fixture. */
export async function findModifiableUser(store: RecoveryStore, emailInput: string): Promise<User> {
  if (acceptEmail(emailInput) === P0_SYNTHETIC_ACTOR.email) {
    throw new AdminRefusal(PROTECTED_FIXTURE_MESSAGE);
  }
  const user = await findTargetUser(store, emailInput);
  if (isProtectedFixture(user)) throw new AdminRefusal(PROTECTED_FIXTURE_MESSAGE);
  return user;
}

/**
 * Replaces the password (same policy, NFKC normalization and Argon2id parameters as admin:create
 * and login). Changes only password_hash and password_changed_at, increments session_epoch and
 * revokes every active session. The enabled/disabled state is not changed.
 */
export async function resetPassword(
  store: RecoveryStore,
  input: { readonly email: string; readonly password: string },
  deps: RecoveryDeps & { readonly hasher: PasswordHasher },
): Promise<RecoveryOutcome> {
  const user = await findModifiableUser(store, input.email);
  const problems = newPasswordProblems(input.password, user.email);
  if (problems.length > 0) throw new AdminRefusal(problems.join('; '));
  const passwordHash = await deps.hasher.hash(input.password);
  const now = deps.clock.now();
  return store.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: user.id },
      data: { passwordHash, passwordChangedAt: now, sessionEpoch: { increment: 1 } },
    });
    const revoked = await revokeActiveSessions(tx, user.id, now);
    await appendAuditEvent(tx, {
      requestId: deps.requestId,
      actorUserId: null,
      action: 'USER_PASSWORD_RESET_LOCAL_CLI',
      entityType: 'User',
      entityId: user.id,
      before: { sessionEpoch: updated.sessionEpoch - 1 },
      after: {
        email: user.email,
        credentialChangedAt: now.toISOString(),
        sessionEpoch: updated.sessionEpoch,
        revokedSessions: revoked,
      },
      reason: auditReason('password', deps.reason),
    });
    return changed(updated, revoked);
  });
}

/**
 * Disables the user (enabled = false, disabled_at = now), increments session_epoch and revokes
 * every active session. Never deletes the row. An already disabled user is reported unchanged; the
 * protected P0 actor is only ever reported (and refused if it is not in its canonical state).
 */
export async function disableUser(
  store: RecoveryStore,
  input: { readonly email: string },
  deps: RecoveryDeps,
): Promise<RecoveryOutcome> {
  const user = await findTargetUser(store, input.email);
  const alreadyDisabled = !user.enabled && user.disabledAt !== null;
  if (isProtectedFixture(user)) {
    if (alreadyDisabled) return unchanged(user, true);
    throw new AdminRefusal(
      `${PROTECTED_FIXTURE_MESSAGE}; it is not in its canonical disabled state — restore it with yarn db:seed`,
    );
  }
  if (alreadyDisabled) return unchanged(user);
  const now = deps.clock.now();
  return store.$transaction(async (tx) => {
    const { count } = await tx.user.updateMany({
      where: { id: user.id, OR: [{ enabled: true }, { disabledAt: null }] },
      data: { enabled: false, disabledAt: now, sessionEpoch: { increment: 1 } },
    });
    if (count === 0) return unchanged(user); // disabled concurrently: nothing to do
    const revoked = await revokeActiveSessions(tx, user.id, now);
    const updated = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
    await appendAuditEvent(tx, {
      requestId: deps.requestId,
      actorUserId: null,
      action: 'USER_DISABLED_LOCAL_CLI',
      entityType: 'User',
      entityId: user.id,
      before: {
        enabled: user.enabled,
        disabledAt: iso(user.disabledAt),
        sessionEpoch: updated.sessionEpoch - 1,
      },
      after: {
        email: user.email,
        enabled: false,
        disabledAt: now.toISOString(),
        sessionEpoch: updated.sessionEpoch,
        revokedSessions: revoked,
      },
      reason: auditReason('disable', deps.reason),
    });
    return changed(updated, revoked);
  });
}

/**
 * Enables the user (enabled = true, disabled_at = null) and increments session_epoch, so every
 * session from before the change stays unusable (any still-active row is revoked as well). An
 * already enabled user is reported unchanged. Protected fixtures can never be enabled.
 */
export async function enableUser(
  store: RecoveryStore,
  input: { readonly email: string },
  deps: RecoveryDeps,
): Promise<RecoveryOutcome> {
  const user = await findModifiableUser(store, input.email);
  if (user.enabled && user.disabledAt === null) return unchanged(user);
  const now = deps.clock.now();
  return store.$transaction(async (tx) => {
    const { count } = await tx.user.updateMany({
      where: { id: user.id, OR: [{ enabled: false }, { disabledAt: { not: null } }] },
      data: { enabled: true, disabledAt: null, sessionEpoch: { increment: 1 } },
    });
    if (count === 0) return unchanged(user); // enabled concurrently: nothing to do
    const revoked = await revokeActiveSessions(tx, user.id, now);
    const updated = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
    await appendAuditEvent(tx, {
      requestId: deps.requestId,
      actorUserId: null,
      action: 'USER_ENABLED_LOCAL_CLI',
      entityType: 'User',
      entityId: user.id,
      before: {
        enabled: user.enabled,
        disabledAt: iso(user.disabledAt),
        sessionEpoch: updated.sessionEpoch - 1,
      },
      after: {
        email: user.email,
        enabled: true,
        disabledAt: null,
        sessionEpoch: updated.sessionEpoch,
        revokedSessions: revoked,
      },
      reason: auditReason('enable', deps.reason),
    });
    return changed(updated, revoked);
  });
}

/**
 * Ends every session of the user: increments session_epoch and revokes the active rows. Works for
 * zero or many sessions; other users are never affected.
 */
export async function revokeUserSessions(
  store: RecoveryStore,
  input: { readonly email: string },
  deps: RecoveryDeps,
): Promise<RecoveryOutcome> {
  const user = await findModifiableUser(store, input.email);
  const now = deps.clock.now();
  return store.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: user.id },
      data: { sessionEpoch: { increment: 1 } },
    });
    const revoked = await revokeActiveSessions(tx, user.id, now);
    await appendAuditEvent(tx, {
      requestId: deps.requestId,
      actorUserId: null,
      action: 'USER_SESSIONS_REVOKED_LOCAL_CLI',
      entityType: 'User',
      entityId: user.id,
      before: { sessionEpoch: updated.sessionEpoch - 1 },
      after: { email: user.email, sessionEpoch: updated.sessionEpoch, revokedSessions: revoked },
      reason: auditReason('revoke-sessions', deps.reason),
    });
    return changed(updated, revoked);
  });
}
