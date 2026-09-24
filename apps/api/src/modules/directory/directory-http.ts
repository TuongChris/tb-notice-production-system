// HTTP glue shared by the directory controllers: who is writing, which conditional headers were
// sent, and how replies carry the ETag. Every directory route is session-protected by the global
// AuthGuard (Origin + CSRF for unsafe methods) before a handler runs.
import { randomUUID } from 'node:crypto';
import type { ResponseMeta } from '@tb/contracts';
import { apiErrors } from '../../infrastructure/http/api-error.js';
import {
  headerValue,
  type HttpRequest,
  type HttpResponse,
} from '../../infrastructure/http/http-types.js';
import { entityEtag } from '../../infrastructure/write/etag.js';
import type {
  ResponseBody,
  WireEntity,
  WriteReply,
  WriteRequester,
} from '../../infrastructure/write/write-executor.js';

export function requestIdOf(request: HttpRequest): string {
  return request.requestId ?? randomUUID();
}

/** The authenticated application User and the write headers of this request. */
export function requesterOf(request: HttpRequest): WriteRequester {
  // Set by the global AuthGuard; absent only if the guard wiring is broken.
  const session = request.authSession;
  if (!session) throw apiErrors.sessionRequired();
  return {
    actorUserId: session.user.id,
    requestId: requestIdOf(request),
    idempotencyKey: headerValue(request.headers['idempotency-key']),
    ifMatch: headerValue(request.headers['if-match']),
  };
}

/** Sends a write result: its ETag (when it returns an entity) and body. */
export function writeReply(response: HttpResponse, reply: WriteReply): ResponseBody | undefined {
  if (reply.etag !== undefined) response.setHeader('ETag', reply.etag);
  return reply.body;
}

/** A GET of one mutable resource: the body plus its strong row-version ETag. */
export function entityReply<T extends WireEntity & { readonly rowVersion: number }>(
  request: HttpRequest,
  response: HttpResponse,
  entityType: string,
  data: T,
): { data: T; meta: ResponseMeta } {
  response.setHeader('ETag', entityEtag(entityType, data.id, data.rowVersion));
  return { data, meta: { requestId: requestIdOf(request), affectedResources: [] } };
}

/**
 * A GET of one immutable resource (API_CONTRACT_v1 §6: only mutable resources carry an ETag; an
 * immutable record changes only through a new revision, never through a conditional write).
 */
export function resourceReply<T>(request: HttpRequest, data: T): { data: T; meta: ResponseMeta } {
  return { data, meta: { requestId: requestIdOf(request), affectedResources: [] } };
}

export function pageReply<T>(
  request: HttpRequest,
  page: { items: T[]; nextCursor: string | null },
): { data: { items: T[]; nextCursor: string | null }; meta: ResponseMeta } {
  return { data: page, meta: { requestId: requestIdOf(request), affectedResources: [] } };
}
