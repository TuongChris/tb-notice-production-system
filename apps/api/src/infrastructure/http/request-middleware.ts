// Express-level middleware registered BEFORE the JSON body parser (configure-app.ts), so origin and
// content-type rejections happen before any request body is read or parsed (API_CONTRACT_v1 §3–4).
import { randomUUID } from 'node:crypto';
import { apiErrors } from './api-error.js';
import { headerValue, type HttpRequest, type HttpResponse } from './http-types.js';

type Next = (error?: unknown) => void;

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isSafeMethod(method: string | undefined): boolean {
  return SAFE_METHODS.has((method ?? 'GET').toUpperCase());
}

/** Assigns the request id and marks every API response as private (`Cache-Control: no-store`). */
export function requestContextMiddleware(req: HttpRequest, res: HttpResponse, next: Next): void {
  req.requestId = randomUUID();
  res.setHeader('Cache-Control', 'no-store');
  next();
}

/**
 * Exact-origin and JSON-body policy for browser requests:
 * - any request that carries an Origin header must carry an exactly allowlisted one (a cross-origin
 *   read attempt is refused even though CORS is never enabled);
 * - every unsafe method (anything but GET/HEAD/OPTIONS) must carry an allowlisted Origin — missing
 *   or "null" is rejected (login CSRF, API_CONTRACT §3);
 * - an unsafe request with a body must declare `application/json` (UTF-8).
 * Routing-independent on purpose: it covers unknown routes too and cannot be bypassed by path case.
 */
export function createRequestPolicyMiddleware(allowedOrigins: ReadonlySet<string>) {
  return (req: HttpRequest, _res: HttpResponse, next: Next): void => {
    const origin = headerValue(req.headers.origin);
    if (origin !== undefined && !allowedOrigins.has(origin)) {
      next(apiErrors.originRejected());
      return;
    }
    if (!isSafeMethod(req.method)) {
      if (origin === undefined) {
        next(apiErrors.originRejected());
        return;
      }
      if (hasBody(req) && !isJsonContentType(headerValue(req.headers['content-type']))) {
        next(apiErrors.unsupportedContentType());
        return;
      }
    }
    next();
  };
}

function hasBody(req: HttpRequest): boolean {
  if (req.headers['transfer-encoding'] !== undefined) return true;
  const length = Number(headerValue(req.headers['content-length']) ?? '0');
  return !Number.isFinite(length) || length > 0;
}

/** `application/json`, optionally with `charset=utf-8`; parameters are case-insensitive. */
export function isJsonContentType(value: string | undefined): boolean {
  if (value === undefined) return false;
  const [mediaType = '', ...parameters] = value.split(';').map((part) => part.trim().toLowerCase());
  if (mediaType !== 'application/json') return false;
  return parameters.every((parameter) => parameter === '' || parameter === 'charset=utf-8');
}
