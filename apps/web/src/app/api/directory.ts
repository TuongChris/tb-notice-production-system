// Typed access to the contracted directory, source, route, representation-authority and case
// operations (TB-SCHEMA-API-v1). Types come from @tb/contracts; the server validates everything
// again. SourceReferences, AuthorityEvents and CaseAuthoritySelections are immutable: they carry no
// ETag (a source changes only through a new revision, an event is superseded by a later event, a
// selection is followed by a later selection). A selection is read back with the exact coverage rows
// it pinned through getCaseAuthoritySelection (TB-SCHEMA-API-v1.1.0, ADR-0004).
import type {
  Agency,
  ArchiveRequest,
  AuthorityEvent,
  BindCaseRoute,
  CanonicalBindingRequest,
  CaseAuthoritySelection,
  CaseAuthoritySelectionView,
  CaseRecord,
  CaseSource,
  CaseWorkflowRequest,
  CoverageSigner,
  CreateAgency,
  CreateAuthorityEvent,
  CreateCase,
  CreateCoverage,
  CreateCoverageSigner,
  CreateLegalSubject,
  CreateMandate,
  CreateMandateVersion,
  CreateOwner,
  CreateRoute,
  CreateSigner,
  CreateSource,
  LegalSubject,
  LinkCaseSource,
  LinkOwnerSubject,
  LinkStateRequest,
  Mandate,
  MandateCoverage,
  MandateVersion,
  Owner,
  OwnerSubject,
  PatchAgency,
  PatchCase,
  PatchCoverage,
  PatchLegalSubject,
  PatchMandate,
  PatchMandateVersion,
  PatchOwner,
  PatchRoute,
  PatchSigner,
  RecordStateRequest,
  ReviseSource,
  Route,
  SelectAuthority,
  Signer,
  SignerStateRequest,
  SourceReference,
  SourceReferenceSummary,
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
  /** listSigners, listSources, listRoutes, listMandates and listCases. */
  readonly agencyId?: string;
  /** listCases only. */
  readonly routeId?: string;
  /** listCases only. */
  readonly workflowState?: string;
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
  if (query.routeId) params.set('routeId', query.routeId);
  if (query.workflowState) params.set('workflowState', query.workflowState);
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
    /** Records the source that holds the record's canonical code (identity reference only). */
    bindCanonical: (id: string, body: CanonicalBindingRequest, ifMatch: string, auth: WriteAuth) =>
      versioned(
        api.request<T>('POST', `${base}/${id}/canonical-bindings`, {
          body,
          ...write(auth, ifMatch),
        }),
      ),
  };
}

export function createDirectoryApi(api: ApiClient) {
  return {
    sources: createSourcesApi(api),
    routes: createRoutesApi(api),
    cases: createCasesApi(api),
    ...createAuthorityApi(api),
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

function writeHeaders(auth: WriteAuth, ifMatch?: string) {
  return {
    csrfToken: auth.csrfToken,
    idempotencyKey: auth.idempotencyKey,
    ...(ifMatch === undefined ? {} : { ifMatch }),
  };
}

/** SourceReference registry: immutable capture metadata, revised through new revisions. */
export function createSourcesApi(api: ApiClient) {
  return {
    list: async (query: ListQuery = {}) =>
      (
        await api.request<Page<SourceReferenceSummary>>(
          'GET',
          `/api/v1/sources${queryString(query)}`,
        )
      ).data,
    get: async (id: string) =>
      (await api.request<SourceReference>('GET', `/api/v1/sources/${id}`)).data,
    create: async (body: CreateSource, auth: WriteAuth) =>
      (
        await api.request<SourceReference>('POST', '/api/v1/sources', {
          body,
          ...writeHeaders(auth),
        })
      ).data,
    revise: async (id: string, body: ReviseSource, auth: WriteAuth) =>
      (
        await api.request<SourceReference>('POST', `/api/v1/sources/${id}/revisions`, {
          body,
          ...writeHeaders(auth),
        })
      ).data,
  };
}

/** Routes: the operational path Agency + OwnerSubject + Platform (no authority). */
export function createRoutesApi(api: ApiClient) {
  const base = '/api/v1/routes';
  return {
    list: async (query: ListQuery = {}) =>
      (await api.request<Page<Route>>('GET', `${base}${queryString(query)}`)).data,
    get: (id: string) => versioned(api.request<Route>('GET', `${base}/${id}`)),
    create: (body: CreateRoute, auth: WriteAuth) =>
      versioned(api.request<Route>('POST', base, { body, ...writeHeaders(auth) })),
    patch: (id: string, body: PatchRoute, ifMatch: string, auth: WriteAuth) =>
      versioned(
        api.request<Route>('PATCH', `${base}/${id}`, { body, ...writeHeaders(auth, ifMatch) }),
      ),
    archive: (id: string, body: ArchiveRequest, ifMatch: string, auth: WriteAuth) =>
      versioned(
        api.request<Route>('POST', `${base}/${id}/archive`, {
          body,
          ...writeHeaders(auth, ifMatch),
        }),
      ),
    restore: (id: string, body: ArchiveRequest, ifMatch: string, auth: WriteAuth) =>
      versioned(
        api.request<Route>('POST', `${base}/${id}/restore`, {
          body,
          ...writeHeaders(auth, ifMatch),
        }),
      ),
    setLinkState: (id: string, body: LinkStateRequest, ifMatch: string, auth: WriteAuth) =>
      versioned(
        api.request<Route>('POST', `${base}/${id}/link-state`, {
          body,
          ...writeHeaders(auth, ifMatch),
        }),
      ),
    bindCanonical: (id: string, body: CanonicalBindingRequest, ifMatch: string, auth: WriteAuth) =>
      versioned(
        api.request<Route>('POST', `${base}/${id}/canonical-bindings`, {
          body,
          ...writeHeaders(auth, ifMatch),
        }),
      ),
    remove: async (id: string, ifMatch: string, auth: WriteAuth) => {
      await api.request<void>('DELETE', `${base}/${id}`, writeHeaders(auth, ifMatch));
    },
  };
}

/**
 * Representation-authority records (P3B). Each write names its contracted precondition target:
 * a new version or event carries the Mandate's ETag, a new coverage the version's, a new coverage
 * signer the coverage's. None of these records is authority, readiness or a signature.
 */
export function createAuthorityApi(api: ApiClient) {
  const mandates = '/api/v1/mandates';
  return {
    mandates: {
      ...directoryRecord<Mandate, CreateMandate, PatchMandate, never>(api, mandates),
      /** Precondition target: the Mandate's ETag (its version set changes). */
      createVersion: (
        mandateId: string,
        body: CreateMandateVersion,
        mandateEtag: string,
        auth: WriteAuth,
      ) =>
        versioned(
          api.request<MandateVersion>('POST', `${mandates}/${mandateId}/versions`, {
            body,
            ...writeHeaders(auth, mandateEtag),
          }),
        ),
      /** Precondition target: the Mandate's ETag (its history changes). No ETag in the reply. */
      recordEvent: async (
        mandateId: string,
        body: CreateAuthorityEvent,
        mandateEtag: string,
        auth: WriteAuth,
      ) =>
        (
          await api.request<AuthorityEvent>('POST', `${mandates}/${mandateId}/events`, {
            body,
            ...writeHeaders(auth, mandateEtag),
          })
        ).data,
    },
    versions: {
      list: async (mandateId: string, query: ListQuery = {}) =>
        (
          await api.request<Page<MandateVersion>>(
            'GET',
            `${mandates}/${mandateId}/versions${queryString(query)}`,
          )
        ).data,
      get: (id: string) =>
        versioned(api.request<MandateVersion>('GET', `/api/v1/mandate-versions/${id}`)),
      patch: (id: string, body: PatchMandateVersion, ifMatch: string, auth: WriteAuth) =>
        versioned(
          api.request<MandateVersion>('PATCH', `/api/v1/mandate-versions/${id}`, {
            body,
            ...writeHeaders(auth, ifMatch),
          }),
        ),
      freeze: (id: string, body: ArchiveRequest, ifMatch: string, auth: WriteAuth) =>
        versioned(
          api.request<MandateVersion>('POST', `/api/v1/mandate-versions/${id}/freeze`, {
            body,
            ...writeHeaders(auth, ifMatch),
          }),
        ),
    },
    coverages: {
      list: async (versionId: string, query: ListQuery = {}) =>
        (
          await api.request<Page<MandateCoverage>>(
            'GET',
            `/api/v1/mandate-versions/${versionId}/coverages${queryString(query)}`,
          )
        ).data,
      get: (id: string) =>
        versioned(api.request<MandateCoverage>('GET', `/api/v1/coverages/${id}`)),
      /** Precondition target: the version's ETag. */
      create: (versionId: string, body: CreateCoverage, versionEtag: string, auth: WriteAuth) =>
        versioned(
          api.request<MandateCoverage>('POST', `/api/v1/mandate-versions/${versionId}/coverages`, {
            body,
            ...writeHeaders(auth, versionEtag),
          }),
        ),
      patch: (id: string, body: PatchCoverage, ifMatch: string, auth: WriteAuth) =>
        versioned(
          api.request<MandateCoverage>('PATCH', `/api/v1/coverages/${id}`, {
            body,
            ...writeHeaders(auth, ifMatch),
          }),
        ),
    },
    coverageSigners: {
      list: async (coverageId: string, query: ListQuery = {}) =>
        (
          await api.request<Page<CoverageSigner>>(
            'GET',
            `/api/v1/coverages/${coverageId}/signers${queryString(query)}`,
          )
        ).data,
      get: (id: string) =>
        versioned(api.request<CoverageSigner>('GET', `/api/v1/coverage-signers/${id}`)),
      /** Precondition target: the coverage's ETag. */
      create: (
        coverageId: string,
        body: CreateCoverageSigner,
        coverageEtag: string,
        auth: WriteAuth,
      ) =>
        versioned(
          api.request<CoverageSigner>('POST', `/api/v1/coverages/${coverageId}/signers`, {
            body,
            ...writeHeaders(auth, coverageEtag),
          }),
        ),
      remove: async (id: string, ifMatch: string, auth: WriteAuth) => {
        await api.request<void>(
          'DELETE',
          `/api/v1/coverage-signers/${id}`,
          writeHeaders(auth, ifMatch),
        );
      },
    },
    events: {
      list: async (mandateId: string, query: ListQuery = {}) =>
        (
          await api.request<Page<AuthorityEvent>>(
            'GET',
            `${mandates}/${mandateId}/events${queryString(query)}`,
          )
        ).data,
    },
  };
}

/**
 * Cases (P4A): the case record, its explicit source links and its append-only authority
 * selections. Case commands and new children carry the case's ETag; a link-state change carries the
 * link's own ETag. A selection is "the authority chain selected/pinned for evaluation in this
 * specific Case" — never a G1 decision, current authority, signer eligibility or readiness — and
 * has no ETag: it is never edited, only followed by a later selection.
 */
export function createCasesApi(api: ApiClient) {
  const base = '/api/v1/cases';
  const command =
    <B>(suffix: string) =>
    (id: string, body: B, ifMatch: string, auth: WriteAuth) =>
      versioned(
        api.request<CaseRecord>('POST', `${base}/${id}/${suffix}`, {
          body,
          ...writeHeaders(auth, ifMatch),
        }),
      );
  return {
    list: async (query: ListQuery = {}) =>
      (await api.request<Page<CaseRecord>>('GET', `${base}${queryString(query)}`)).data,
    get: (id: string) => versioned(api.request<CaseRecord>('GET', `${base}/${id}`)),
    create: (body: CreateCase, auth: WriteAuth) =>
      versioned(api.request<CaseRecord>('POST', base, { body, ...writeHeaders(auth) })),
    patch: (id: string, body: PatchCase, ifMatch: string, auth: WriteAuth) =>
      versioned(
        api.request<CaseRecord>('PATCH', `${base}/${id}`, {
          body,
          ...writeHeaders(auth, ifMatch),
        }),
      ),
    remove: async (id: string, ifMatch: string, auth: WriteAuth) => {
      await api.request<void>('DELETE', `${base}/${id}`, writeHeaders(auth, ifMatch));
    },
    archive: command<ArchiveRequest>('archive'),
    restore: command<ArchiveRequest>('restore'),
    setWorkflow: command<CaseWorkflowRequest>('workflow'),
    bindRoute: command<BindCaseRoute>('route-binding'),
    bindCanonical: command<CanonicalBindingRequest>('canonical-binding'),
    sources: {
      list: async (caseId: string, query: ListQuery = {}) =>
        (
          await api.request<Page<CaseSource>>(
            'GET',
            `${base}/${caseId}/sources${queryString(query)}`,
          )
        ).data,
      get: (id: string) => versioned(api.request<CaseSource>('GET', `/api/v1/case-sources/${id}`)),
      /** Precondition target: the case's ETag (its context changes). */
      link: (caseId: string, body: LinkCaseSource, caseEtag: string, auth: WriteAuth) =>
        versioned(
          api.request<CaseSource>('POST', `${base}/${caseId}/sources`, {
            body,
            ...writeHeaders(auth, caseEtag),
          }),
        ),
      /** Precondition target: the link's own ETag. */
      setLinkState: (id: string, body: LinkStateRequest, ifMatch: string, auth: WriteAuth) =>
        versioned(
          api.request<CaseSource>('POST', `/api/v1/case-sources/${id}/link-state`, {
            body,
            ...writeHeaders(auth, ifMatch),
          }),
        ),
    },
    selections: {
      list: async (caseId: string, query: ListQuery = {}) =>
        (
          await api.request<Page<CaseAuthoritySelection>>(
            'GET',
            `${base}/${caseId}/authority-selections${queryString(query)}`,
          )
        ).data,
      /**
       * One selection of this case with the exact coverage rows it pinned, as stored
       * (getCaseAuthoritySelection, TB-SCHEMA-API-v1.1.0). Another case's selection is 404.
       */
      get: async (caseId: string, id: string) =>
        (
          await api.request<CaseAuthoritySelectionView>(
            'GET',
            `${base}/${caseId}/authority-selections/${id}`,
          )
        ).data,
      /** Precondition target: the case's ETag. The selection itself carries no ETag. */
      select: async (caseId: string, body: SelectAuthority, caseEtag: string, auth: WriteAuth) =>
        (
          await api.request<CaseAuthoritySelection>(
            'POST',
            `${base}/${caseId}/authority-selections`,
            { body, ...writeHeaders(auth, caseEtag) },
          )
        ).data,
    },
  };
}
