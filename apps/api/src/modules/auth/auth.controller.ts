import { randomUUID } from 'node:crypto';
import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import type { GetSessionResponse, LoginResponse } from '@tb/contracts';
import { apiErrors } from '../../infrastructure/http/api-error.js';
import {
  headerValue,
  type HttpRequest,
  type HttpResponse,
} from '../../infrastructure/http/http-types.js';
import { AUTH_CONFIG, type AuthConfig } from './auth-config.js';
import { AuthService } from './auth.service.js';
import { PublicRoute } from './public-route.decorator.js';
import { serializeClearedSessionCookie } from './session-cookie.js';
import { toSessionView } from './session-view.js';
import { SessionService, type AuthenticatedSession } from './session.service.js';

/**
 * The three contracted auth operations (TB-SCHEMA-API-v1: login, getSession, logout). There is no
 * signup, user-management, signing, adoption or sending route. Login/logout are exempt from
 * Idempotency-Key (API_CONTRACT_v1 §3). All responses carry `Cache-Control: no-store`.
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  /** POST /api/v1/auth/login — exact Origin (middleware) + X-Requested-With + strict JSON body. */
  @Post('login')
  @HttpCode(200)
  @PublicRoute({ requireRequestedWith: true })
  async login(
    @Body() body: unknown,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<LoginResponse> {
    const requestId = requestIdOf(request);
    const opened = await this.auth.login(body, headerValue(request.headers.cookie), requestId);
    response.setHeader('Set-Cookie', opened.setCookie);
    return { data: opened.view, meta: { requestId, affectedResources: [] } };
  }

  /** GET /api/v1/auth/session — the current session with its session-bound CSRF token. */
  @Get('session')
  getSession(@Req() request: HttpRequest): GetSessionResponse {
    const session = sessionOf(request);
    return {
      data: toSessionView(session.user, session.expiresAt, session.csrfToken),
      meta: { requestId: requestIdOf(request), affectedResources: [] },
    };
  }

  /** POST /api/v1/auth/logout — revokes the session and clears the cookie (204). */
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<void> {
    await this.sessions.revoke(sessionOf(request), requestIdOf(request));
    response.setHeader('Set-Cookie', serializeClearedSessionCookie(this.config.cookie));
  }
}

function requestIdOf(request: HttpRequest): string {
  return request.requestId ?? randomUUID();
}

function sessionOf(request: HttpRequest): AuthenticatedSession {
  // Set by the global AuthGuard; absent only if the guard wiring is broken.
  if (!request.authSession) throw apiErrors.sessionRequired();
  return request.authSession;
}
