import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { codePointLength } from '@tb/contracts';
import { apiErrors } from '../../infrastructure/http/api-error.js';
import {
  headerValue,
  type HttpRequest,
  type HttpResponse,
} from '../../infrastructure/http/http-types.js';
import { isSafeMethod } from '../../infrastructure/http/request-middleware.js';
import { AUTH_CONFIG, type AuthConfig } from './auth-config.js';
import { PUBLIC_ROUTE, type PublicRouteOptions } from './public-route.decorator.js';
import { serializeClearedSessionCookie } from './session-cookie.js';
import { matchesDigest, sha256Hex } from './session-tokens.js';
import { SessionService } from './session.service.js';

/** Contract `Csrf` header parameter bounds (X-CSRF-Token: 20–200 characters). */
const CSRF_MIN = 20;
const CSRF_MAX = 200;

/**
 * Global guard (registered as APP_GUARD). Runs after the request-policy middleware has already
 * enforced the exact Origin for unsafe methods.
 * - Public routes: optional `X-Requested-With: TB-APP` requirement (login).
 * - All other routes: a valid session (401 SESSION_REQUIRED otherwise; an unusable presented cookie
 *   is cleared), and for unsafe methods an X-CSRF-Token equal to the session-bound token
 *   (403 CSRF_TOKEN_INVALID). A CSRF failure never revokes the session. Idle-timeout activity is
 *   recorded only after all checks pass.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return false;
    const http = context.switchToHttp();
    const request = http.getRequest<HttpRequest>();
    const response = http.getResponse<HttpResponse>();
    const route = this.reflector.getAllAndOverride<PublicRouteOptions | undefined>(PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (route) {
      if (
        route.requireRequestedWith &&
        headerValue(request.headers['x-requested-with']) !== 'TB-APP'
      ) {
        throw apiErrors.requestedWithRequired();
      }
      return true;
    }
    const lookup = await this.sessions.authenticate(headerValue(request.headers.cookie));
    if (lookup.kind !== 'valid') {
      if (lookup.kind === 'invalid') {
        response.setHeader('Set-Cookie', serializeClearedSessionCookie(this.config.cookie));
      }
      throw apiErrors.sessionRequired();
    }
    const safe = isSafeMethod(request.method);
    if (!safe) {
      const presented = headerValue(request.headers['x-csrf-token']);
      if (
        presented === undefined ||
        codePointLength(presented) < CSRF_MIN ||
        codePointLength(presented) > CSRF_MAX ||
        !matchesDigest(presented, sha256Hex(lookup.session.csrfToken))
      ) {
        throw apiErrors.csrfTokenInvalid();
      }
    }
    // Idle-timeout activity: unsafe requests that passed Origin + CSRF, or safe requests carrying
    // the application header (a cross-site page cannot add it without a CORS preflight, which
    // always fails). Plain same-site loads (images, scripts) never extend a session.
    if (!safe || headerValue(request.headers['x-requested-with']) === 'TB-APP') {
      await this.sessions.recordActivity(lookup.session);
    }
    request.authSession = lookup.session;
    return true;
  }
}
