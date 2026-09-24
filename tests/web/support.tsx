// Shared UI test support: a synthetic in-memory API (fake fetch) that enforces the same request
// contract as the server — session CSRF token, one Idempotency-Key per write, the exact If-Match
// ETag of the precondition target (428 missing, 412 stale) — plus rendering and interaction
// helpers. All data is synthetic.
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach } from 'vitest';
import { createApiClient } from '../../apps/web/src/app/api/client.js';
import { App } from '../../apps/web/src/app/App.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export type Kind = 'Agency' | 'Owner' | 'LegalSubject' | 'Signer' | 'OwnerSubject' | 'Route';
export type Row = Record<string, unknown> & { id: string; rowVersion: number };

export interface RecordedRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: Record<string, string>;
  readonly body: unknown;
}

export const USER_ID = '00000000-0000-4000-8000-0000000000a1';
export const NOW = '2026-09-24T09:00:00.000Z';
export const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
export const failure = (status: number, code: string, details: Record<string, unknown> = {}) =>
  json(status, { error: { code, message: `synthetic ${code}`, details, requestId: 'r' } });

/** Identity-defining fields the server locks once a record is established (decision D3, R5). */
export const IDENTITY_FIELDS: Partial<Record<Kind, readonly string[]>> = {
  Agency: [
    'legalName',
    'organizationType',
    'jurisdictionCountry',
    'registrationAuthority',
    'registrationNumber',
  ],
  LegalSubject: [
    'legalName',
    'legalForm',
    'jurisdictionCountry',
    'registrationAuthority',
    'registrationNumber',
  ],
};

const COLLECTIONS: Record<string, Kind> = {
  agencies: 'Agency',
  owners: 'Owner',
  'legal-subjects': 'LegalSubject',
  signers: 'Signer',
  routes: 'Route',
};

/** Fields of a SourceReferenceSummary (list DTO). */
const SUMMARY_FIELDS = [
  'id',
  'agencyId',
  'sourceGroupId',
  'revision',
  'supersedesSourceId',
  'title',
  'canonicalUrl',
  'sourceRole',
  'accessState',
  'contentSha256',
  'hashTarget',
  'reportedProvenance',
  'observedAt',
  'reviewedAt',
  'createdAt',
];

/** Synthetic backend with the directory's request rules. */
export class FakeDirectory {
  readonly csrfToken = 'synthetic-csrf-token-000000000000000000000';
  readonly requests: RecordedRequest[] = [];
  readonly rows: Record<Kind, Map<string, Row>> = {
    Agency: new Map(),
    Owner: new Map(),
    LegalSubject: new Map(),
    Signer: new Map(),
    OwnerSubject: new Map(),
    Route: new Map(),
  };
  /** Immutable SourceReference revisions (no ETag, no row version). */
  readonly sources = new Map<string, Record<string, unknown> & { id: string }>();
  /** Canonical-binding refusals the server would give for a record id (e.g. owner material). */
  readonly bindingRefusals = new Map<
    string,
    { status: number; code: string; details?: Record<string, unknown> }
  >();
  /** Records the server refuses to delete, with their blockers. */
  readonly deleteBlockers = new Map<string, string[]>();
  /** Records the server knows to be established (e.g. referenced), with the reasons. */
  readonly established = new Map<string, string[]>();
  pageSize: number | null = null;
  failNextCsrf = false;
  sessionGone = false;
  holdLists = false;
  failLists = false;
  private sequence = 0;

  id(): string {
    this.sequence += 1;
    return `00000000-0000-4000-8000-${String(this.sequence).padStart(12, '0')}`;
  }

  seed(kind: Kind, fields: Record<string, unknown>): Row {
    const id = this.id();
    const base: Row = {
      id,
      rowVersion: 1,
      createdAt: NOW,
      updatedAt: NOW,
      createdById: USER_ID,
      updatedById: USER_ID,
      canonicalCode: null,
      canonicalSourceId: null,
      bindingState: 'LOCAL_ONLY',
      notes: null,
      archivedAt: null,
      archiveReason: null,
    };
    const defaults: Record<Kind, Record<string, unknown>> = {
      Agency: {
        displayName: 'x',
        legalName: null,
        organizationType: null,
        jurisdictionCountry: null,
        registrationAuthority: null,
        registrationNumber: null,
        websiteUrl: null,
        copyrightEmail: null,
        verificationEmail: null,
        postalAddress: null,
        phone: null,
        driveRootUrl: null,
        masterUrl: null,
        startHereUrl: null,
        fieldAttributions: null,
        recordState: 'DRAFT',
      },
      Owner: {
        displayName: 'x',
        aliases: null,
        contactName: null,
        contactEmail: null,
        sourceChannels: null,
        websiteUrl: null,
        preferredLanguage: null,
        driveFolderUrl: null,
        recordState: 'DRAFT',
      },
      LegalSubject: {
        subjectType: 'LEGAL_ENTITY',
        legalName: 'x',
        aliases: null,
        jurisdictionCountry: null,
        legalForm: null,
        registrationAuthority: null,
        registrationNumber: null,
        contactEmail: null,
        postalAddress: null,
        fieldAttributions: null,
        identityReviewState: 'UNREVIEWED',
        recordState: 'DRAFT',
      },
      Signer: {
        agencyId: '',
        fullLegalName: 'x',
        title: null,
        contactEmail: null,
        identitySourceId: null,
        delegationSourceId: null,
        operationalState: 'DRAFT',
      },
      OwnerSubject: {
        ownerId: '',
        legalSubjectId: '',
        relationshipLabel: null,
        sourceId: null,
        linkState: 'LINKED',
        unlinkedAt: null,
        unlinkReason: null,
      },
      Route: {
        agencyId: '',
        ownerSubjectId: '',
        platform: 'YOUTUBE',
        linkState: 'LINKED',
        defaultSignerId: null,
        preferredCoverageId: null,
        casePrefixHint: null,
        unlinkedAt: null,
        stateReason: null,
      },
    };
    const row = { ...base, ...defaults[kind], ...fields } as Row;
    if (kind === 'OwnerSubject') {
      for (const key of [
        'canonicalCode',
        'canonicalSourceId',
        'bindingState',
        'notes',
        'archivedAt',
        'archiveReason',
      ]) {
        delete row[key];
      }
    }
    this.rows[kind].set(id, row);
    return row;
  }

  /** A synthetic SourceReference revision (defaults: a shared canonical record, revision 1). */
  seedSource(fields: Record<string, unknown> = {}): Record<string, unknown> & { id: string } {
    const id = this.id();
    const row = {
      id,
      agencyId: null,
      sourceGroupId: this.id(),
      revision: 1,
      supersedesSourceId: null,
      title: 'SYNTHETIC source',
      canonicalUrl: null,
      providerFileId: null,
      providerRevisionId: null,
      sourceRole: 'CANONICAL_RECORD',
      accessState: 'NOT_CHECKED',
      contentSha256: null,
      hashTarget: null,
      reportedProvenance: 'OPERATOR_REPORTED',
      rawProvenance: null,
      scopeText: 'Synthetic scope',
      scopeBindings: null,
      observedAt: null,
      reviewedByLabel: null,
      reviewedAt: null,
      excerpt: null,
      excerptLocator: null,
      limitations: null,
      createdAt: NOW,
      createdById: USER_ID,
      ...fields,
    };
    this.sources.set(id, row);
    return row;
  }

  etag(kind: Kind, row: Row): string {
    return `"${kind}:${row.id}:v${row.rowVersion}"`;
  }

  /** Simulates a change made elsewhere (another tab): the version moves on. */
  touch(kind: Kind, id: string, fields: Record<string, unknown> = {}): void {
    const row = this.rows[kind].get(id);
    if (!row) throw new Error('no such row');
    Object.assign(row, fields, { rowVersion: row.rowVersion + 1 });
  }

  readonly fetch = async (path: string, init: RequestInit): Promise<Response> => {
    const method = init.method ?? 'GET';
    const headers = { ...(init.headers as Record<string, string>) };
    const body = init.body === undefined ? undefined : (JSON.parse(String(init.body)) as unknown);
    this.requests.push({ method, path, headers, body });
    const meta = { requestId: 'synthetic', affectedResources: [] };
    const url = new URL(path, 'http://app.invalid');
    if (url.pathname === '/api/v1/health') return json(200, { data: { status: 'ok' }, meta });
    if (url.pathname === '/api/v1/auth/session') {
      if (this.sessionGone) return failure(401, 'SESSION_REQUIRED');
      return json(200, {
        data: {
          user: {
            id: USER_ID,
            email: 'p2-ui@example.invalid',
            displayName: 'Synthetic P2 UI User',
            enabled: true,
            passwordChangedAt: null,
            disabledAt: null,
            createdAt: NOW,
          },
          expiresAt: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
          csrfToken: this.csrfToken,
        },
        meta,
      });
    }
    if (this.sessionGone) return failure(401, 'SESSION_REQUIRED');
    if (method !== 'GET') {
      if (this.failNextCsrf) {
        this.failNextCsrf = false;
        return failure(403, 'CSRF_TOKEN_INVALID');
      }
      if (headers['X-CSRF-Token'] !== this.csrfToken) return failure(403, 'CSRF_TOKEN_INVALID');
      if (!headers['Idempotency-Key']) return failure(400, 'IDEMPOTENCY_KEY_REQUIRED');
    }
    const parts = url.pathname.replace('/api/v1/', '').split('/');
    const [collection, id, action] = parts;
    if (collection === 'sources') return this.sourceRequest(method, id, action, url, body);
    if (collection === 'owner-subjects' && id)
      return this.ownerSubject(method, id, action, headers, body);
    if (collection === 'owners' && id && action === 'subjects') {
      return this.ownerSubjects(method, id, url, headers, body);
    }
    const kind = collection ? COLLECTIONS[collection] : undefined;
    if (!kind) return failure(404, 'NOT_FOUND');
    if (!id) {
      if (method === 'GET') return this.list(kind, url);
      return this.create(kind, body as Record<string, unknown>);
    }
    const row = this.rows[kind].get(id);
    if (!row) return failure(404, 'NOT_FOUND');
    if (method === 'GET' && action === undefined) {
      return json(200, { data: row, meta }, { ETag: this.etag(kind, row) });
    }
    const precondition = this.precondition(kind, row, headers);
    if (precondition) return precondition;
    if (method === 'DELETE') {
      const blockers = this.deleteBlockers.get(id);
      if (blockers) return failure(409, 'REFERENCED_RECORD_CANNOT_DELETE', { blockers });
      this.rows[kind].delete(id);
      return new Response(null, { status: 204 });
    }
    const change = (fields: Record<string, unknown>) => {
      Object.assign(row, fields, { rowVersion: row.rowVersion + 1, updatedAt: NOW });
      return json(200, { data: row, meta }, { ETag: this.etag(kind, row) });
    };
    const request = body as Record<string, unknown>;
    if (method === 'PATCH') {
      if (Object.keys(request).length === 0) {
        return failure(422, 'VALIDATION_FAILED', {
          issues: [{ path: '(body)', message: 'At least one field is required' }],
        });
      }
      const invalid = this.invalidEmails(request);
      if (invalid) return invalid;
      const reasons = this.established.get(row.id);
      const identity = (IDENTITY_FIELDS[kind] ?? []).filter(
        (field) => field in request && request[field] !== row[field],
      );
      if (reasons && identity.length > 0) {
        return failure(409, 'ESTABLISHED_IDENTITY_IMMUTABLE', {
          fields: identity,
          establishedBy: reasons,
        });
      }
      return change(request);
    }
    const flagOnly = kind === 'Signer' || kind === 'Route';
    if (action === 'archive')
      return change({
        ...(flagOnly ? {} : { recordState: 'ARCHIVED' }),
        archivedAt: NOW,
        archiveReason: request['reason'],
      });
    if (action === 'restore')
      return change({
        ...(flagOnly ? {} : { recordState: 'DRAFT' }),
        archivedAt: null,
        archiveReason: null,
      });
    if (action === 'link-state') {
      return change({
        linkState: request['state'],
        stateReason: request['reason'],
        unlinkedAt: request['state'] === 'UNLINKED' ? NOW : null,
      });
    }
    if (action === 'canonical-bindings') {
      if (row['archivedAt'] || row['recordState'] === 'ARCHIVED') {
        return failure(409, 'RECORD_STATE_CONFLICT', { archived: true });
      }
      if (row['canonicalCode'] !== null || row['bindingState'] !== 'LOCAL_ONLY') {
        return failure(409, 'BINDING_CORRECTION_REQUIRES_RECONCILIATION', {
          canonicalCode: row['canonicalCode'],
        });
      }
      const refusal = this.bindingRefusals.get(row.id);
      if (refusal) return failure(refusal.status, refusal.code, refusal.details ?? {});
      if (!this.sources.has(String(request['sourceId']))) {
        return failure(422, 'REFERENCE_NOT_FOUND', { field: 'sourceId' });
      }
      return change({
        canonicalCode: request['canonicalCode'],
        canonicalSourceId: request['sourceId'],
        bindingState: 'SOURCE_REFERENCED',
      });
    }
    if (action === 'state') {
      return change(
        kind === 'Signer'
          ? { operationalState: request['state'] }
          : { recordState: request['state'] },
      );
    }
    return failure(404, 'NOT_FOUND');
  };

  /** SourceReference registry: immutable revisions, current heads in lists, no If-Match. */
  private sourceRequest(
    method: string,
    id: string | undefined,
    action: string | undefined,
    url: URL,
    body: unknown,
  ): Response {
    const meta = { requestId: 'r', affectedResources: [] };
    const heads = () =>
      [...this.sources.values()].filter(
        (row) =>
          ![...this.sources.values()].some((other) => other['supersedesSourceId'] === row.id),
      );
    const request = (body ?? {}) as Record<string, unknown>;
    if (id === undefined) {
      if (method === 'GET') {
        const q = url.searchParams.get('q')?.toLowerCase() ?? '';
        const agencyId = url.searchParams.get('agencyId');
        const items = heads()
          .filter(
            (row) =>
              q === '' ||
              row.id === q ||
              row['sourceGroupId'] === q ||
              String(row['title']).toLowerCase().includes(q),
          )
          .filter((row) => {
            if (!agencyId) return true;
            const shared = (row['scopeBindings'] as { agencyIds?: string[] } | null)?.agencyIds;
            return (
              row['agencyId'] === agencyId ||
              (row['agencyId'] === null && !!shared?.includes(agencyId))
            );
          })
          .map((row) => Object.fromEntries(SUMMARY_FIELDS.map((field) => [field, row[field]])));
        return json(200, { data: { items, nextCursor: null }, meta });
      }
      if (request['reportedProvenance'] === 'DOCUMENT_REVIEWED' && !request['reviewedByLabel']) {
        return failure(422, 'REVIEW_UNATTRIBUTED', { field: 'reviewedByLabel' });
      }
      return json(201, { data: this.seedSource(request), meta });
    }
    const row = this.sources.get(id);
    if (!row) return failure(404, 'NOT_FOUND');
    if (method === 'GET' && action === undefined) return json(200, { data: row, meta });
    if (method === 'POST' && action === 'revisions') {
      const successor = [...this.sources.values()].find(
        (other) => other['supersedesSourceId'] === id,
      );
      if (successor) {
        const head = heads().find((other) => other['sourceGroupId'] === row['sourceGroupId']);
        return failure(409, 'REVISION_NOT_HEAD', { headId: head?.id });
      }
      if (
        (request['agencyId'] ?? null) !== row['agencyId'] ||
        JSON.stringify(request['scopeBindings'] ?? null) !== JSON.stringify(row['scopeBindings'])
      ) {
        return failure(422, 'REVISION_SCOPE_CHANGE', { fields: ['scopeBindings'] });
      }
      const next = this.seedSource({
        ...request,
        sourceGroupId: row['sourceGroupId'],
        revision: Number(row['revision']) + 1,
        supersedesSourceId: id,
      });
      return json(201, { data: next, meta });
    }
    return failure(404, 'NOT_FOUND');
  }

  private precondition(kind: Kind, row: Row, headers: Record<string, string>): Response | null {
    const ifMatch = headers['If-Match'];
    if (ifMatch === undefined) return failure(428, 'PRECONDITION_REQUIRED');
    if (ifMatch !== this.etag(kind, row)) return failure(412, 'RECORD_VERSION_CONFLICT');
    return null;
  }

  private invalidEmails(request: Record<string, unknown>): Response | null {
    const issues = Object.entries(request)
      .filter(
        ([key, value]) =>
          key.endsWith('Email') && typeof value === 'string' && !value.includes('@'),
      )
      .map(([key]) => ({
        path: key,
        message: 'Must be a valid email (JSON Schema format, ajv-formats full mode)',
      }));
    return issues.length === 0 ? null : failure(422, 'VALIDATION_FAILED', { issues });
  }

  private list(kind: Kind, url: URL): Response | Promise<Response> {
    if (this.failLists) return failure(500, 'INTERNAL_ERROR');
    const q = url.searchParams.get('q')?.toLowerCase();
    const agencyId = url.searchParams.get('agencyId');
    const limit = this.pageSize ?? Number(url.searchParams.get('limit') ?? 25);
    const start = Number(url.searchParams.get('cursor')?.replace('c', '') ?? 0);
    const all = [...this.rows[kind].values()].filter(
      (row) =>
        (!q || JSON.stringify(row).toLowerCase().includes(q)) &&
        (!agencyId || row['agencyId'] === agencyId),
    );
    const items = all.slice(start, start + limit);
    const nextCursor = start + limit < all.length ? `c${start + limit}` : null;
    const response = json(200, {
      data: { items, nextCursor },
      meta: { requestId: 'r', affectedResources: [] },
    });
    if (this.holdLists) return new Promise(() => undefined);
    return response;
  }

  private create(kind: Kind, request: Record<string, unknown>): Response {
    const invalid = this.invalidEmails(request);
    if (invalid) return invalid;
    if (kind === 'Route') {
      const existing = [...this.rows.Route.values()].find(
        (row) =>
          row['agencyId'] === request['agencyId'] &&
          row['ownerSubjectId'] === request['ownerSubjectId'],
      );
      if (existing) return failure(409, 'DUPLICATE_ROUTE', { routeId: existing.id });
    }
    const row = this.seed(kind, request);
    return json(
      201,
      { data: row, meta: { requestId: 'r', affectedResources: [] } },
      { ETag: this.etag(kind, row) },
    );
  }

  private ownerSubjects(
    method: string,
    ownerId: string,
    url: URL,
    headers: Record<string, string>,
    body: unknown,
  ): Response {
    const owner = this.rows.Owner.get(ownerId);
    if (!owner) return failure(404, 'NOT_FOUND');
    if (method === 'GET') {
      const items = [...this.rows.OwnerSubject.values()].filter(
        (row) => row['ownerId'] === ownerId,
      );
      void url;
      return json(200, {
        data: { items, nextCursor: null },
        meta: { requestId: 'r', affectedResources: [] },
      });
    }
    const precondition = this.precondition('Owner', owner, headers);
    if (precondition) return precondition;
    const request = body as { legalSubjectId: string; relationshipLabel?: string };
    const existing = [...this.rows.OwnerSubject.values()].find(
      (row) => row['ownerId'] === ownerId && row['legalSubjectId'] === request.legalSubjectId,
    );
    if (existing) return failure(409, 'DUPLICATE_OWNER_SUBJECT', { ownerSubjectId: existing.id });
    owner.rowVersion += 1;
    const row = this.seed('OwnerSubject', {
      ownerId,
      legalSubjectId: request.legalSubjectId,
      relationshipLabel: request.relationshipLabel ?? null,
    });
    return json(
      201,
      { data: row, meta: { requestId: 'r', affectedResources: [] } },
      { ETag: this.etag('OwnerSubject', row) },
    );
  }

  private ownerSubject(
    method: string,
    id: string,
    action: string | undefined,
    headers: Record<string, string>,
    body: unknown,
  ): Response {
    const row = this.rows.OwnerSubject.get(id);
    if (!row) return failure(404, 'NOT_FOUND');
    if (method === 'GET') {
      return json(
        200,
        { data: row, meta: { requestId: 'r', affectedResources: [] } },
        { ETag: this.etag('OwnerSubject', row) },
      );
    }
    const precondition = this.precondition('OwnerSubject', row, headers);
    if (precondition) return precondition;
    if (action !== 'link-state') return failure(404, 'NOT_FOUND');
    const request = body as { state: string; reason: string };
    Object.assign(row, {
      linkState: request.state,
      unlinkedAt: request.state === 'UNLINKED' ? NOW : null,
      unlinkReason: request.state === 'UNLINKED' ? request.reason : null,
      rowVersion: row.rowVersion + 1,
    });
    return json(
      200,
      { data: row, meta: { requestId: 'r', affectedResources: [] } },
      { ETag: this.etag('OwnerSubject', row) },
    );
  }

  writes(): RecordedRequest[] {
    return this.requests.filter((request) => request.method !== 'GET');
  }
}

let root: Root | undefined;
let container: HTMLElement | undefined;

export async function render(api: FakeDirectory, path: string): Promise<void> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <StrictMode>
        <MemoryRouter initialEntries={[path]}>
          <App api={createApiClient(api.fetch)} />
        </MemoryRouter>
      </StrictMode>,
    );
  });
}

/** Unmounts the rendered app (to render another page of the same fake backend). */
export async function unmount(): Promise<void> {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
}

afterEach(unmount);

export async function waitFor(check: () => boolean, label: string): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > 3000) {
      throw new Error(
        `timed out waiting for ${label}\n${container?.textContent?.slice(0, 1500) ?? ''}`,
      );
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

export const all = (selector: string) =>
  [...(container?.querySelectorAll(selector) ?? [])] as HTMLElement[];
export const q = (selector: string) => container?.querySelector<HTMLElement>(selector) ?? null;
export const pageText = () => container?.textContent ?? '';

export function byText(selector: string, text: string | RegExp): HTMLElement {
  const found = all(selector).find((element) =>
    typeof text === 'string'
      ? element.textContent?.trim() === text
      : text.test(element.textContent ?? ''),
  );
  if (!found) throw new Error(`no ${selector} with text ${String(text)}`);
  return found;
}

export async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.click();
  });
}

export async function type(selector: string, value: string): Promise<void> {
  const element = q(selector) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
  if (!element) throw new Error(`no field ${selector}`);
  await act(async () => {
    const prototype = Object.getPrototypeOf(element) as object;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    setter?.call(element, value);
    element.dispatchEvent(
      new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }),
    );
  });
}

export async function submit(form: HTMLElement | null): Promise<void> {
  await act(async () => {
    (form as HTMLFormElement).requestSubmit();
  });
}

export const until = (text: string | RegExp) =>
  waitFor(
    () => (typeof text === 'string' ? pageText().includes(text) : text.test(pageText())),
    String(text),
  );
