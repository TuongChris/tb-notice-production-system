// Typed access to the contracted directory operations (TB-SCHEMA-API-v1). Types come from
// @tb/contracts; the server validates everything again. Canonical-binding operations are not
// offered: they need a SourceReference that cannot be recorded before the Source phase.
import type {
  Agency,
  ArchiveRequest,
  CreateAgency,
  CreateLegalSubject,
  CreateOwner,
  CreateSigner,
  LegalSubject,
  LinkOwnerSubject,
  LinkStateRequest,
  Owner,
  OwnerSubject,
  PatchAgency,
  PatchLegalSubject,
  PatchOwner,
  PatchSigner,
  RecordStateRequest,
  Signer,
  SignerStateRequest,
} from '@tb/contracts';
import { ApiError, type ApiClient, type ApiResult } from './client.js';

/** Credentials of one write intent: the session CSRF token and the intent's Idempotency-Key. */
export interface WriteAuth {
  readonly csrfToken: string;
  readonly idempotencyKey: string;
}

export interface ListQuery {
  readonly q?: string;
  readonly cursor?: string;
  readonly limit?: number;
  /** listSigners only. */
  readonly agencyId?: string;
}

export interface Page<T> {
  readonly items: T[];
  readonly nextCursor: string | null;
}

/** A mutable record with the ETag the server sent for it. */
export interface Versioned<T> {
  readonly data: T;
  readonly etag: string;
}

/**
 * The contract ETag `"<Type>:<id>:v<rowVersion>"` (API_CONTRACT_v1 §6) of a record the user is
 * looking at in a list. The server still decides: a record that changed meanwhile gets 412.
 */
export function etagOf(type: string, entity: { readonly id: string; readonly rowVersion: number }) {
  return `"${type}:${entity.id}:v${entity.rowVersion}"`;
}

function queryString(query: ListQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.agencyId) params.set('agencyId', query.agencyId);
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.cursor) params.set('cursor', query.cursor);
  const text = params.toString();
  return text === '' ? '' : `?${text}`;
}

async function versioned<T>(promise: Promise<ApiResult<T>>): Promise<Versioned<T>> {
  const result = await promise;
  if (result.etag === null) {
    throw new ApiError(result.status, 'MISSING_ETAG', 'The API response carried no ETag.');
  }
  return { data: result.data, etag: result.etag };
}

function directoryRecord<T, Create, Patch, State>(api: ApiClient, base: string) {
  const write = (auth: WriteAuth, ifMatch?: string) => ({
    csrfToken: auth.csrfToken,
    idempotencyKey: auth.idempotencyKey,
    ...(ifMatch === undefined ? {} : { ifMatch }),
  });
  return {
    list: async (query: ListQuery = {}) =>
      (await api.request<Page<T>>('GET', `${base}${queryString(query)}`)).data,
    get: (id: string) => versioned(api.request<T>('GET', `${base}/${id}`)),
    create: (body: Create, auth: WriteAuth) =>
      versioned(api.request<T>('POST', base, { body, ...write(auth) })),
    patch: (id: string, body: Patch, ifMatch: string, auth: WriteAuth) =>
      versioned(api.request<T>('PATCH', `${base}/${id}`, { body, ...write(auth, ifMatch) })),
    archive: (id: string, body: ArchiveRequest, ifMatch: string, auth: WriteAuth) =>
      versioned(api.request<T>('POST', `${base}/${id}/archive`, { body, ...write(auth, ifMatch) })),
    restore: (id: string, body: ArchiveRequest, ifMatch: string, auth: WriteAuth) =>
      versioned(api.request<T>('POST', `${base}/${id}/restore`, { body, ...write(auth, ifMatch) })),
    setState: (id: string, body: State, ifMatch: string, auth: WriteAuth) =>
      versioned(api.request<T>('POST', `${base}/${id}/state`, { body, ...write(auth, ifMatch) })),
    remove: async (id: string, ifMatch: string, auth: WriteAuth) => {
      await api.request<void>('DELETE', `${base}/${id}`, write(auth, ifMatch));
    },
  };
}

export function createDirectoryApi(api: ApiClient) {
  return {
    agencies: directoryRecord<Agency, CreateAgency, PatchAgency, RecordStateRequest>(
      api,
      '/api/v1/agencies',
    ),
    owners: directoryRecord<Owner, CreateOwner, PatchOwner, RecordStateRequest>(
      api,
      '/api/v1/owners',
    ),
    legalSubjects: directoryRecord<
      LegalSubject,
      CreateLegalSubject,
      PatchLegalSubject,
      RecordStateRequest
    >(api, '/api/v1/legal-subjects'),
    signers: directoryRecord<Signer, CreateSigner, PatchSigner, SignerStateRequest>(
      api,
      '/api/v1/signers',
    ),
    ownerSubjects: {
      list: async (ownerId: string, query: ListQuery = {}) =>
        (
          await api.request<Page<OwnerSubject>>(
            'GET',
            `/api/v1/owners/${ownerId}/subjects${queryString(query)}`,
          )
        ).data,
      get: (id: string) =>
        versioned(api.request<OwnerSubject>('GET', `/api/v1/owner-subjects/${id}`)),
      /** Precondition target: the Owner's ETag. */
      link: (ownerId: string, body: LinkOwnerSubject, ownerEtag: string, auth: WriteAuth) =>
        versioned(
          api.request<OwnerSubject>('POST', `/api/v1/owners/${ownerId}/subjects`, {
            body,
            csrfToken: auth.csrfToken,
            idempotencyKey: auth.idempotencyKey,
            ifMatch: ownerEtag,
          }),
        ),
      setLinkState: (id: string, body: LinkStateRequest, ifMatch: string, auth: WriteAuth) =>
        versioned(
          api.request<OwnerSubject>('POST', `/api/v1/owner-subjects/${id}/link-state`, {
            body,
            csrfToken: auth.csrfToken,
            idempotencyKey: auth.idempotencyKey,
            ifMatch,
          }),
        ),
    },
  };
}

export type DirectoryApi = ReturnType<typeof createDirectoryApi>;
