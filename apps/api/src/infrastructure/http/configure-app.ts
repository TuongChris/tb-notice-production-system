import type { NestExpressApplication } from '@nestjs/platform-express';
import { AUTH_CONFIG, type AuthConfig } from '../../modules/auth/auth-config.js';
import { createRequestPolicyMiddleware, requestContextMiddleware } from './request-middleware.js';

/** Contract request cap (API_CONTRACT_v1 §4: requests capped at 1 MiB JSON before parsing). */
const JSON_BODY_LIMIT = '1mb';

/**
 * HTTP pipeline shared by main.ts and the in-process tests, so both run the same order:
 * request id + no-store → exact-origin/JSON policy → JSON body parser (JSON only, no urlencoded,
 * no compressed bodies) → Nest routing with the global AuthGuard and ApiExceptionFilter.
 * The application must be created with `bodyParser: false` so no parser runs before the policy.
 * CORS is never enabled: no Access-Control-Allow-* header is ever sent.
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get<AuthConfig>(AUTH_CONFIG);
  const express = app.getHttpAdapter().getInstance() as {
    disable(setting: string): void;
    set(setting: string, value: unknown): void;
  };
  express.disable('x-powered-by');
  // Automatic weak ETags/304s are disabled: contract ETags are explicit row-version values only.
  express.set('etag', false);
  app.setGlobalPrefix('api/v1');
  app.use(requestContextMiddleware);
  app.use(createRequestPolicyMiddleware(config.allowedOrigins));
  app.useBodyParser('json', {
    limit: JSON_BODY_LIMIT,
    strict: true,
    inflate: false,
    type: 'application/json',
  });
}
