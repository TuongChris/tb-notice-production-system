import type { SessionView, User as UserView } from '@tb/contracts';
import type { User } from '../../../generated/prisma/client.js';

/**
 * Contract `User` projection of an application user. Only these seven fields leave the server:
 * never the password hash or session epoch. An application User is not a Signer and carries no
 * legal authority.
 */
export function toUserView(user: User): UserView {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    enabled: user.enabled,
    passwordChangedAt: user.passwordChangedAt?.toISOString() ?? null,
    disabledAt: user.disabledAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

export function toSessionView(user: User, expiresAt: Date, csrfToken: string): SessionView {
  return { user: toUserView(user), expiresAt: expiresAt.toISOString(), csrfToken };
}
