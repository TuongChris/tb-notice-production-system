import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { LoginRequestSchema } from '@tb/contracts';
import type { User } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { apiErrors, type ValidationIssue } from '../../infrastructure/http/api-error.js';
import { AUTH_CONFIG, type AuthConfig } from './auth-config.js';
import { normalizeEmail } from './credentials.js';
import { LoginThrottle } from './login-throttle.js';
import { PasswordHasher } from './password-hasher.js';
import { readCookieValues } from './session-cookie.js';
import { SessionService, type OpenedSession } from './session.service.js';

/**
 * Login orchestration (POST /auth/login). Logging in authenticates an application User only: it
 * confers no legal authority, satisfies no G1–G7 gate and signs, adopts or sends nothing.
 *
 * Every rejected credential check — unknown email, wrong password, disabled account — returns the
 * same 403 INVALID_CREDENTIALS after the same Argon2id work and throttle accounting. Failed logins
 * write nothing to the database (so the failure path has no account-dependent write) and are logged
 * without the email address.
 */
@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger('AuthService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly hasher: PasswordHasher,
    private readonly throttle: LoginThrottle,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.hasher.warmUp();
  }

  async login(
    body: unknown,
    cookieHeader: string | undefined,
    requestId: string,
  ): Promise<OpenedSession> {
    const parsed = LoginRequestSchema.safeParse(body);
    if (!parsed.success) {
      // Paths and fixed rule messages only; issue objects are never echoed (they can hold input).
      const issues: ValidationIssue[] = parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.') || '(body)',
        message: issue.code === 'unrecognized_keys' ? 'Unknown field' : issue.message,
      }));
      throw apiErrors.validationFailed(issues);
    }
    const email = normalizeEmail(parsed.data.email);
    const decision = this.throttle.begin(email);
    if (!decision.allowed) {
      this.logger.warn(`Login throttled (requestId=${requestId}).`);
      throw apiErrors.loginRateLimited(decision.retryAfterSeconds);
    }
    let accepted: User | null = null;
    try {
      const user = await this.prisma.user.findUnique({ where: { email } });
      const verified = await this.hasher.verify(user?.passwordHash ?? null, parsed.data.password);
      if (user && verified && user.enabled && user.disabledAt === null) accepted = user;
    } catch (error) {
      this.throttle.release(decision.ticket);
      throw error;
    }
    if (!accepted) {
      this.throttle.fail(decision.ticket);
      this.logger.warn(`Login rejected (requestId=${requestId}).`);
      throw apiErrors.invalidCredentials();
    }
    this.throttle.succeed(decision.ticket);
    const presented = readCookieValues(cookieHeader, this.config.cookie.name);
    return this.sessions.open(accepted, presented, requestId);
  }
}
