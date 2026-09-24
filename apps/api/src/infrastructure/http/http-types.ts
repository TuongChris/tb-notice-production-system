import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthenticatedSession } from '../../modules/auth/session.service.js';

/**
 * Request fields used by the API. Typed against Node's IncomingMessage because the Express type
 * package is not a dependency; only these documented additions are read.
 */
export interface HttpRequest extends IncomingMessage {
  /** Server-generated id (request-context middleware), echoed in `meta`/`error.requestId`. */
  requestId?: string;
  /** Full request path set by Express (unchanged inside mounted routers). */
  originalUrl?: string;
  /** Parsed JSON body (express.json); undefined when the request carried no body. */
  body?: unknown;
  /** Set by the global AuthGuard for session-protected routes. */
  authSession?: AuthenticatedSession;
}

export type HttpResponse = ServerResponse;

/** The single value of a request header, or undefined when absent. */
export function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value.length === 1 ? value[0] : undefined;
  return value;
}
