import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { SessionView } from '@tb/contracts';
import type { User } from '../../../generated/prisma/client.js';
import { appendAuditEvent } from '../../infrastructure/audit/audit-log.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { CLOCK, type Clock } from '../../infrastructure/time/clock.js';
import { AUTH_CONFIG, type AuthConfig } from './auth-config.js';
import { readCookieValues, serializeSessionCookie } from './session-cookie.js';
import {
  deriveCsrfToken,
  generateSessionToken,
  isWellFormedSessionToken,
  matchesDigest,
  sha256Hex,
} from './session-tokens.js';
import { toSessionView } from './session-view.js';

/** A validated session for the current request. Holds no raw session token. */
export interface AuthenticatedSession {
  readonly sessionId: string;
  readonly expiresAt: Date;
  readonly lastSeenAt: Date;
  readonly user: User;
  readonly csrfToken: string;
}

export type SessionLookup =
  | { readonly kind: 'absent' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'valid'; readonly session: AuthenticatedSession };

export interface OpenedSession {
  readonly view: SessionView;
  readonly setCookie: string;
}

/**
 * Opaque DB-backed sessions (API_CONTRACT_v1 §3). The browser holds a random token in an HttpOnly
 * cookie; auth_sessions stores only SHA-256 digests of the token and of its CSRF token.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Opens a new session for an authenticated, enabled user. Sessions named by `replacedTokens`
   * (cookies the browser sent with the login request) are revoked in the same transaction: a
   * successful login always rotates to a fresh token and never adopts a presented one.
   */
  async open(
    user: User,
    replacedTokens: readonly string[],
    requestId: string,
  ): Promise<OpenedSession> {
    const now = this.clock.now();
    const sessionId = randomUUID();
    const token = generateSessionToken();
    const expiresAt = new Date(now.getTime() + this.config.sessionTtlMs);
    const csrfToken = deriveCsrfToken(this.config.sessionSecret, {
      sessionId,
      sessionEpoch: user.sessionEpoch,
      sessionToken: token,
    });
    const replacedHashes = [
      ...new Set(replacedTokens.filter(isWellFormedSessionToken).map(sha256Hex)),
    ];
    await this.prisma.$transaction(async (tx) => {
      const rotated =
        replacedHashes.length === 0
          ? 0
          : (
              await tx.authSession.updateMany({
                where: { tokenHash: { in: replacedHashes }, revokedAt: null },
                data: { revokedAt: now },
              })
            ).count;
      await tx.authSession.create({
        data: {
          id: sessionId,
          userId: user.id,
          tokenHash: sha256Hex(token),
          csrfTokenHash: sha256Hex(csrfToken),
          expiresAt,
          lastSeenAt: now,
          // One clock for all session timestamps (ck_auth_sessions_session_time: expires > created).
          createdAt: now,
        },
      });
      await appendAuditEvent(tx, {
        requestId,
        actorUserId: user.id,
        action: 'AUTH_LOGIN_SUCCEEDED',
        entityType: 'AuthSession',
        entityId: sessionId,
        after: { userId: user.id, expiresAt: expiresAt.toISOString(), rotatedSessions: rotated },
      });
    });
    return {
      view: toSessionView(user, expiresAt, csrfToken),
      setCookie: serializeSessionCookie(
        this.config.cookie,
        token,
        Math.floor(this.config.sessionTtlMs / 1000),
      ),
    };
  }

  /**
   * Resolves the session cookie. `invalid` means a cookie was presented but cannot be used
   * (malformed, duplicated, unknown, revoked, expired, idle, disabled user, or a sessionEpoch /
   * server-secret change detected through the CSRF binding).
   */
  async authenticate(cookieHeader: string | undefined): Promise<SessionLookup> {
    const values = readCookieValues(cookieHeader, this.config.cookie.name);
    if (values.length === 0) return { kind: 'absent' };
    const [token] = values;
    if (values.length !== 1 || token === undefined || !isWellFormedSessionToken(token)) {
      return { kind: 'invalid' };
    }
    const row = await this.prisma.authSession.findUnique({
      where: { tokenHash: sha256Hex(token) },
      include: { user: true },
    });
    if (!row) return { kind: 'invalid' };
    const now = this.clock.now().getTime();
    const { user } = row;
    if (
      row.revokedAt !== null ||
      row.expiresAt.getTime() <= now ||
      now - row.lastSeenAt.getTime() > this.config.idleTimeoutMs ||
      !user.enabled ||
      user.disabledAt !== null
    ) {
      return { kind: 'invalid' };
    }
    const csrfToken = deriveCsrfToken(this.config.sessionSecret, {
      sessionId: row.id,
      sessionEpoch: user.sessionEpoch,
      sessionToken: token,
    });
    if (!matchesDigest(csrfToken, row.csrfTokenHash)) return { kind: 'invalid' };
    return {
      kind: 'valid',
      session: {
        sessionId: row.id,
        expiresAt: row.expiresAt,
        lastSeenAt: row.lastSeenAt,
        user,
        csrfToken,
      },
    };
  }

  /**
   * Records application activity for the idle timeout (writes lastSeenAt at most once per interval).
   * Called by the guard only after every check passed, and only for requests that genuinely come
   * from the application, so another page cannot keep a session alive.
   */
  async recordActivity(session: AuthenticatedSession): Promise<void> {
    const now = this.clock.now();
    if (now.getTime() - session.lastSeenAt.getTime() < this.config.lastSeenWriteIntervalMs) return;
    await this.prisma.authSession.updateMany({
      where: { id: session.sessionId, revokedAt: null },
      data: { lastSeenAt: now },
    });
  }

  /** Revokes the current session (logout) and records the audit event atomically. */
  async revoke(session: AuthenticatedSession, requestId: string): Promise<void> {
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.authSession.updateMany({
        where: { id: session.sessionId, revokedAt: null },
        data: { revokedAt: now },
      });
      await appendAuditEvent(tx, {
        requestId,
        actorUserId: session.user.id,
        action: 'AUTH_LOGOUT',
        entityType: 'AuthSession',
        entityId: session.sessionId,
        after: { revoked: count === 1 },
      });
    });
  }
}
