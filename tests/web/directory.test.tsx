// @vitest-environment happy-dom
// UI: the P2 Directory pages against a synthetic in-memory API (fake fetch) that enforces the same
// request contract as the server — session CSRF token, one Idempotency-Key per write, and the exact
// If-Match ETag of the precondition target (428 missing, 412 stale). Covers list/empty/loading/error
// states, create/edit/validation, archive/restore/state dialogs, delete confirmation and refusal,
// version conflicts, deferred canonical binding, owner ↔ subject linking, signers, focus handling,
// CSRF refresh and session loss. All data is synthetic.
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { createApiClient } from '../../apps/web/src/app/api/client.js';
import { App } from '../../apps/web/src/app/App.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Kind = 'Agency' | 'Owner' | 'LegalSubject' | 'Signer' | 'OwnerSubject';
type Row = Record<string, unknown> & { id: string; rowVersion: number };

interface RecordedRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: Record<string, string>;
  readonly body: unknown;
}

const USER_ID = '00000000-0000-4000-8000-0000000000a1';
const NOW = '2026-09-24T09:00:00.000Z';
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
const failure = (status: number, code: string, details: Record<string, unknown> = {}) =>
  json(status, { error: { code, message: `synthetic ${code}`, details, requestId: 'r' } });

const COLLECTIONS: Record<string, Kind> = {
  agencies: 'Agency',
  owners: 'Owner',
  'legal-subjects': 'LegalSubject',
  signers: 'Signer',
};

/** Synthetic backend with the directory's request rules. */
class FakeDirectory {
  readonly csrfToken = 'synthetic-csrf-token-000000000000000000000';
  readonly requests: RecordedRequest[] = [];
  readonly rows: Record<Kind, Map<string, Row>> = {
    Agency: new Map(),
    Owner: new Map(),
    LegalSubject: new Map(),
    Signer: new Map(),
    OwnerSubject: new Map(),
  };
  /** Records the server refuses to delete, with their blockers. */
  readonly deleteBlockers = new Map<string, string[]>();
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
      return change(request);
    }
    if (action === 'archive')
      return change({
        recordState: kind === 'Signer' ? row['recordState'] : 'ARCHIVED',
        archivedAt: NOW,
        archiveReason: request['reason'],
      });
    if (action === 'restore')
      return change({
        ...(kind === 'Signer' ? {} : { recordState: 'DRAFT' }),
        archivedAt: null,
        archiveReason: null,
      });
    if (action === 'state') {
      return change(
        kind === 'Signer'
          ? { operationalState: request['state'] }
          : { recordState: request['state'] },
      );
    }
    return failure(404, 'NOT_FOUND');
  };

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

async function render(api: FakeDirectory, path: string): Promise<void> {
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

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

async function waitFor(check: () => boolean, label: string): Promise<void> {
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

const all = (selector: string) =>
  [...(container?.querySelectorAll(selector) ?? [])] as HTMLElement[];
const q = (selector: string) => container?.querySelector<HTMLElement>(selector) ?? null;
const pageText = () => container?.textContent ?? '';

function byText(selector: string, text: string | RegExp): HTMLElement {
  const found = all(selector).find((element) =>
    typeof text === 'string'
      ? element.textContent?.trim() === text
      : text.test(element.textContent ?? ''),
  );
  if (!found) throw new Error(`no ${selector} with text ${String(text)}`);
  return found;
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.click();
  });
}

async function type(selector: string, value: string): Promise<void> {
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

async function submit(form: HTMLElement | null): Promise<void> {
  await act(async () => {
    (form as HTMLFormElement).requestSubmit();
  });
}

const until = (text: string | RegExp) =>
  waitFor(
    () => (typeof text === 'string' ? pageText().includes(text) : text.test(pageText())),
    String(text),
  );

describe('P2 directory UI', () => {
  it('lists agencies with loading, empty and failure states, and reaches the list from the shell', async () => {
    const api = new FakeDirectory();
    api.holdLists = true;
    await render(api, '/directory');
    await waitFor(() => q('[data-testid="loading"]') !== null, 'loading');
    expect(q('[data-testid="loading"]')?.getAttribute('role')).toBe('status');
    expect(pageText()).toContain('Loading agencies…');
    await act(async () => root?.unmount());
    container?.remove();

    const empty = new FakeDirectory();
    await render(empty, '/directory/agencies');
    await waitFor(() => q('[data-testid="empty-state"]') !== null, 'empty state');
    expect(pageText()).toContain('No agencies yet.');
    expect(byText('a', 'Create the first agency record').getAttribute('href')).toBe(
      '/directory/agencies/new',
    );
    // The Directory sub-navigation marks the current record type.
    expect(byText('nav[aria-label="Directory"] a', 'Agencies').getAttribute('aria-current')).toBe(
      'page',
    );
    await act(async () => root?.unmount());
    container?.remove();

    const broken = new FakeDirectory();
    broken.failLists = true;
    await render(broken, '/directory/agencies');
    await waitFor(() => q('[data-testid="error-notice"]') !== null, 'error');
    expect(q('[data-testid="error-notice"]')?.getAttribute('role')).toBe('alert');
    expect(pageText()).toContain("The server couldn't confirm the change.");
    broken.failLists = false;
    await click(byText('button', 'Try again'));
    await waitFor(() => q('[data-testid="empty-state"]') !== null, 'recovered');
  });

  it('creates a draft agency with CSRF token and Idempotency-Key, then shows its registry header', async () => {
    const api = new FakeDirectory();
    await render(api, '/directory/agencies/new');
    await waitFor(() => q('#agency-displayName') !== null, 'form');
    // Client-side check: the display name is required and nothing is sent without it.
    await submit(q('form.record-form'));
    expect(q('#agency-displayName')?.getAttribute('aria-invalid')).toBe('true');
    expect(pageText()).toContain('Enter a display name.');
    expect(api.writes()).toHaveLength(0);

    await type('#agency-displayName', '  SYNTHETIC Agency UI  ');
    await type('#agency-legalName', 'SYNTHETIC Agency UI Ltd');
    await submit(q('form.record-form'));
    await waitFor(() => q('[data-testid="agency-detail"]') !== null, 'detail');
    const [created] = api.writes();
    expect(created?.path).toBe('/api/v1/agencies');
    expect(created?.body).toEqual({
      displayName: 'SYNTHETIC Agency UI',
      legalName: 'SYNTHETIC Agency UI Ltd',
    });
    expect(created?.headers['X-CSRF-Token']).toBe(api.csrfToken);
    expect(created?.headers['Idempotency-Key']).toMatch(/^[A-Za-z0-9_-]{16,100}$/);
    expect(created?.headers['If-Match']).toBeUndefined();
    expect(q('h1')?.textContent).toBe('SYNTHETIC Agency UI');
    expect(q('.record-header .stamp')?.textContent).toBe('Draft');
    expect(pageText()).toContain('Version 1');
    expect(pageText()).toContain('Agency created as a draft.');
    expect(pageText()).toContain('it grants no authority and makes nothing ready to send');
  });

  it('maps server validation errors to a focused summary and the fields themselves', async () => {
    const api = new FakeDirectory();
    await render(api, '/directory/agencies/new');
    await waitFor(() => q('#agency-displayName') !== null, 'form');
    await type('#agency-displayName', 'SYNTHETIC Agency');
    await type('#agency-copyrightEmail', 'not-an-email');
    await submit(q('form.record-form'));
    await waitFor(() => q('[data-testid="validation-summary"]') !== null, 'summary');
    const summary = q('[data-testid="validation-summary"]');
    expect(summary?.getAttribute('role')).toBe('alert');
    expect(document.activeElement).toBe(summary);
    const link = summary?.querySelector('a');
    expect(link?.getAttribute('href')).toBe('#agency-copyrightEmail');
    expect(link?.textContent).toBe('Copyright contact email: Enter a valid email address.');
    const field = q('#agency-copyrightEmail');
    expect(field?.getAttribute('aria-invalid')).toBe('true');
    expect(field?.getAttribute('aria-describedby')).toContain('agency-copyrightEmail-error');
    expect(q('#agency-copyrightEmail-error')?.textContent).toBe('Enter a valid email address.');
  });

  it('edits with the exact ETag, sends only changed fields, and reports a no-op without a request', async () => {
    const api = new FakeDirectory();
    const agency = api.seed('Agency', {
      displayName: 'SYNTHETIC Edit',
      phone: '+84 1',
      legalName: 'Keep Ltd',
    });
    await render(api, `/directory/agencies/${agency.id}/edit`);
    await waitFor(() => q('#agency-phone') !== null, 'form');
    await submit(q('form.record-form'));
    expect(pageText()).toContain('Nothing to save: no field was changed.');
    expect(api.writes()).toHaveLength(0);
    await type('#agency-phone', '');
    await type('#agency-copyrightEmail', 'rights@example.invalid');
    await submit(q('form.record-form'));
    await waitFor(() => q('[data-testid="agency-detail"]') !== null, 'detail');
    const [patch] = api.writes();
    expect(patch?.method).toBe('PATCH');
    expect(patch?.headers['If-Match']).toBe(`"Agency:${agency.id}:v1"`);
    expect(patch?.body).toEqual({ phone: null, copyrightEmail: 'rights@example.invalid' });
    expect(pageText()).toContain('Changes saved.');
    expect(pageText()).toContain('Version 2');
  });

  it('a stale ETag (412) shows the conflict notice and "Load latest version" restores the server values', async () => {
    const api = new FakeDirectory();
    const agency = api.seed('Agency', { displayName: 'SYNTHETIC Conflict', phone: 'tab A' });
    await render(api, `/directory/agencies/${agency.id}/edit`);
    await waitFor(() => q('#agency-phone') !== null, 'form');
    // Another tab saves first.
    api.touch('Agency', agency.id, { phone: 'saved in another tab' });
    await type('#agency-phone', 'tab B');
    await submit(q('form.record-form'));
    await waitFor(() => q('[data-testid="conflict-notice"]') !== null, 'conflict');
    expect(q('[data-testid="conflict-notice"]')?.getAttribute('role')).toBe('alert');
    expect(pageText()).toContain('This agency changed after you opened it');
    expect(api.rows.Agency.get(agency.id)?.['phone']).toBe('saved in another tab');
    await click(byText('button', 'Load latest version'));
    await waitFor(
      () => (q('#agency-phone') as HTMLInputElement | null)?.value === 'saved in another tab',
      'reloaded',
    );
    expect(q('[data-testid="conflict-notice"]')).toBeNull();
  });

  it('archive and restore go through a reason dialog; archived records are read-only', async () => {
    const api = new FakeDirectory();
    const agency = api.seed('Agency', { displayName: 'SYNTHETIC Archive' });
    await render(api, `/directory/agencies/${agency.id}`);
    await waitFor(() => q('[data-testid="agency-detail"]') !== null, 'detail');
    const archive = byText('button', 'Archive');
    archive.focus();
    await click(archive);
    const dialog = q('dialog[open]');
    expect(dialog?.hasAttribute('open')).toBe(true);
    const reason = dialog?.querySelector('textarea');
    expect(document.activeElement).toBe(reason);
    // A reason is required and kept in the audit trail.
    await submit(dialog?.querySelector('form') ?? null);
    expect(dialog?.textContent).toContain('Enter a reason. It is kept in the audit trail.');
    expect(reason?.getAttribute('aria-invalid')).toBe('true');
    expect(api.writes()).toHaveLength(0);
    // Cancel returns focus to the button that opened the dialog.
    await click(byText('dialog[open] button', 'Cancel'));
    expect(dialog?.hasAttribute('open')).toBe(false);
    expect(document.activeElement).toBe(archive);

    await click(byText('button', 'Archive'));
    await type('dialog[open] textarea', 'synthetic duplicate');
    await submit(q('dialog[open] form'));
    await until('Archived.');
    const [request] = api.writes();
    expect(request?.path).toBe(`/api/v1/agencies/${agency.id}/archive`);
    expect(request?.body).toEqual({ reason: 'synthetic duplicate' });
    expect(request?.headers['If-Match']).toBe(`"Agency:${agency.id}:v1"`);
    expect(q('.record-header .stamp')?.textContent).toBe('Archived');
    expect(all('a').some((link) => link.textContent === 'Edit')).toBe(false);
    await click(byText('button', 'Restore'));
    expect(q('dialog[open]')?.textContent).toContain('never revives any authority');
    await type('dialog[open] textarea', 'synthetic restore');
    await submit(q('dialog[open] form'));
    await until('Restored as a draft.');
    expect(q('.record-header .stamp')?.textContent).toBe('Draft');
  });

  it('marks an agency active only through an explained, reasoned state change', async () => {
    const api = new FakeDirectory();
    const agency = api.seed('Agency', { displayName: 'SYNTHETIC State' });
    await render(api, `/directory/agencies/${agency.id}`);
    await waitFor(() => q('[data-testid="agency-detail"]') !== null, 'detail');
    await click(byText('button', 'Mark active'));
    expect(q('dialog[open]')?.textContent).toContain('It does not grant any authority');
    await type('dialog[open] textarea', 'synthetic onboarding');
    await submit(q('dialog[open] form'));
    await until('Marked active.');
    expect(api.writes()[0]?.body).toEqual({ state: 'ACTIVE', reason: 'synthetic onboarding' });
    expect(q('.record-header .stamp')?.textContent).toBe('Active');
    // An active record offers no delete action.
    expect(all('button').some((button) => button.textContent === 'Delete draft')).toBe(false);
  });

  it('delete asks for confirmation (safe default focused) and explains a refusal', async () => {
    const api = new FakeDirectory();
    const agency = api.seed('Agency', { displayName: 'SYNTHETIC Referenced' });
    api.deleteBlockers.set(agency.id, ['REFERENCED_BY:signers.agency_id']);
    await render(api, `/directory/agencies/${agency.id}`);
    await waitFor(() => q('[data-testid="agency-detail"]') !== null, 'detail');
    await click(byText('button', 'Delete draft'));
    expect(document.activeElement?.textContent).toBe('Keep it');
    await click(byText('dialog[open] button', 'Delete draft agency'));
    await waitFor(
      () => (q('dialog[open]')?.textContent ?? '').includes('signers belong to it'),
      'refusal',
    );
    expect(q('dialog[open]')?.textContent).toContain(
      "This agency can't be deleted because signers belong to it. Archive it instead",
    );
    expect(api.rows.Agency.has(agency.id)).toBe(true);
    await click(byText('dialog[open] button', 'Keep it'));

    const unused = api.seed('Agency', { displayName: 'SYNTHETIC Unused' });
    await act(async () => root?.unmount());
    container?.remove();
    await render(api, `/directory/agencies/${unused.id}`);
    await waitFor(() => q('[data-testid="agency-detail"]') !== null, 'detail');
    await click(byText('button', 'Delete draft'));
    await click(byText('dialog[open] button', 'Delete draft agency'));
    await until('Draft agency “SYNTHETIC Unused” deleted.');
    expect(api.rows.Agency.has(unused.id)).toBe(false);
    const request = api.writes().at(-1);
    expect([request?.method, request?.headers['If-Match']]).toEqual([
      'DELETE',
      `"Agency:${unused.id}:v1"`,
    ]);
  });

  it('canonical binding is visibly unavailable: aria-disabled, explained, and sends nothing', async () => {
    const api = new FakeDirectory();
    const agency = api.seed('Agency', { displayName: 'SYNTHETIC Binding' });
    await render(api, `/directory/agencies/${agency.id}`);
    await waitFor(() => q('[data-testid="agency-detail"]') !== null, 'detail');
    const bind = byText('button', 'Bind canonical code');
    expect(bind.getAttribute('aria-disabled')).toBe('true');
    const description = document.getElementById(bind.getAttribute('aria-describedby') ?? '');
    expect(description?.textContent).toContain(
      'Source references can’t be recorded until the Source phase',
    );
    await click(bind);
    expect(api.writes()).toHaveLength(0);
    expect(api.requests.some((request) => request.path.includes('canonical-bindings'))).toBe(false);
  });

  it('pages with the server cursor and searches through ?q=', async () => {
    const api = new FakeDirectory();
    api.pageSize = 2;
    for (const name of ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon']) {
      api.seed('Agency', { displayName: `SYNTHETIC ${name}` });
    }
    await render(api, '/directory/agencies');
    await waitFor(() => all('table.records tbody tr').length === 2, 'page 1');
    expect(pageText()).toContain('Page 1, 2 records shown');
    await click(byText('button', 'Next page'));
    await waitFor(() => pageText().includes('Page 2'), 'page 2');
    expect(api.requests.at(-1)?.path).toContain('cursor=c2');
    expect(all('table.records tbody th').map((cell) => cell.textContent)).toEqual([
      'SYNTHETIC Gamma',
      'SYNTHETIC Delta',
    ]);
    await click(byText('button', 'Previous page'));
    await waitFor(() => pageText().includes('Page 1'), 'back to page 1');
    expect(api.requests.at(-1)?.path).not.toContain('cursor');
    // A new search starts again at page 1 (a cursor is bound to its filters).
    await click(byText('button', 'Next page'));
    await waitFor(() => pageText().includes('Page 2'), 'page 2 again');
    await type('input[type="search"]', 'epsilon');
    await submit(q('form[role="search"]'));
    await waitFor(() => all('table.records tbody tr').length === 1, 'search result');
    const last = api.requests.at(-1)?.path ?? '';
    expect(last).toContain('q=epsilon');
    expect(last).not.toContain('cursor');
    await click(byText('button', 'Clear search'));
    await waitFor(() => all('table.records tbody tr').length === 2, 'cleared');
  });

  it('a rejected CSRF token is refreshed once and the same intent is retried with the same key', async () => {
    const api = new FakeDirectory();
    const agency = api.seed('Agency', { displayName: 'SYNTHETIC Csrf' });
    await render(api, `/directory/agencies/${agency.id}`);
    await waitFor(() => q('[data-testid="agency-detail"]') !== null, 'detail');
    api.failNextCsrf = true;
    await click(byText('button', 'Archive'));
    await type('dialog[open] textarea', 'synthetic');
    await submit(q('dialog[open] form'));
    await until('Archived.');
    const [rejected, retried] = api.writes();
    expect(rejected?.headers['Idempotency-Key']).toBe(retried?.headers['Idempotency-Key']);
    expect(retried?.headers['X-CSRF-Token']).toBe(api.csrfToken);
  });

  it('a 401 from a directory call returns to Login with the session-ended notice', async () => {
    const api = new FakeDirectory();
    const agency = api.seed('Agency', { displayName: 'SYNTHETIC Session' });
    await render(api, `/directory/agencies/${agency.id}`);
    await waitFor(() => q('[data-testid="agency-detail"]') !== null, 'detail');
    api.sessionGone = true;
    await click(byText('button', 'Archive'));
    await type('dialog[open] textarea', 'synthetic');
    await submit(q('dialog[open] form'));
    await waitFor(() => q('[data-testid="login-form"]') !== null, 'login');
    expect(pageText()).toContain('Your session has ended');
  });

  it('an owner links the exact legal subject explicitly with the owner ETag, then pauses the link', async () => {
    const api = new FakeDirectory();
    const owner = api.seed('Owner', { displayName: 'SYNTHETIC Brand' });
    const subject = api.seed('LegalSubject', { legalName: 'SYNTHETIC Brand Holdings JSC' });
    api.seed('LegalSubject', { legalName: 'SYNTHETIC Archived Co', recordState: 'ARCHIVED' });
    await render(api, `/directory/owners/${owner.id}`);
    await waitFor(() => q('[data-testid="no-links"]') !== null, 'no links');
    expect(pageText()).toContain('The owner can stay unlinked until the legal party is known.');
    await waitFor(() => all('input[name="legalSubjectId"]').length === 2, 'choices');
    const archivedChoice = all('input[name="legalSubjectId"]').find(
      (input) => (input as HTMLInputElement).disabled,
    );
    expect(archivedChoice).toBeDefined();
    // Nothing is linked implicitly: submitting without a choice asks for one.
    await submit(q('form.link-form'));
    expect(pageText()).toContain('Choose the exact legal subject to link.');
    const choice = all('input[name="legalSubjectId"]').find(
      (input) => !(input as HTMLInputElement).disabled,
    );
    await click(choice as HTMLElement);
    await type('form.link-form input[type="text"]', 'brand operated by');
    await submit(q('form.link-form'));
    await waitFor(() => q('[data-testid="owner-subjects"]') !== null, 'linked');
    const link = api.writes()[0];
    expect(link?.path).toBe(`/api/v1/owners/${owner.id}/subjects`);
    expect(link?.headers['If-Match']).toBe(`"Owner:${owner.id}:v1"`);
    expect(link?.body).toEqual({
      legalSubjectId: subject.id,
      relationshipLabel: 'brand operated by',
    });
    await waitFor(() => pageText().includes('SYNTHETIC Brand Holdings JSC'), 'subject name');
    // The owner was re-read: its new version is shown.
    await waitFor(() => pageText().includes('Version 2'), 'owner v2');
    await click(byText('button', /^Pause/));
    expect(q('dialog[open]')?.textContent).toContain('A paused link stays on record');
    await type('dialog[open] textarea', 'synthetic pause');
    await submit(q('dialog[open] form'));
    await waitFor(() => pageText().includes('Link paused.'), 'paused');
    const pause = api.writes()[1];
    expect(pause?.path).toMatch(/\/api\/v1\/owner-subjects\/.+\/link-state$/);
    expect(pause?.body).toEqual({ state: 'PAUSED', reason: 'synthetic pause' });
    expect(pause?.headers['If-Match']).toMatch(/^"OwnerSubject:.+:v1"$/);
  });

  it('a link created elsewhere meanwhile is refused as a duplicate, with a way to the existing link', async () => {
    const api = new FakeDirectory();
    const owner = api.seed('Owner', { displayName: 'SYNTHETIC Brand' });
    const subject = api.seed('LegalSubject', { legalName: 'SYNTHETIC Party' });
    await render(api, `/directory/owners/${owner.id}`);
    await waitFor(() => all('input[name="legalSubjectId"]').length === 1, 'choices');
    // Another tab links the same pair after this page loaded.
    const existing = api.seed('OwnerSubject', { ownerId: owner.id, legalSubjectId: subject.id });
    await click(all('input[name="legalSubjectId"]')[0] as HTMLElement);
    await submit(q('form.link-form'));
    await waitFor(() => pageText().includes('already linked'), 'duplicate');
    expect(byText('a', 'Open the existing link').getAttribute('href')).toBe(
      `/directory/owner-subjects/${existing.id}`,
    );
  });

  it('a known link or signer replaces "Delete draft" with an explained, inert action', async () => {
    const api = new FakeDirectory();
    const owner = api.seed('Owner', { displayName: 'SYNTHETIC Linked Brand' });
    const subject = api.seed('LegalSubject', { legalName: 'SYNTHETIC Linked Party' });
    api.seed('OwnerSubject', { ownerId: owner.id, legalSubjectId: subject.id });
    await render(api, `/directory/owners/${owner.id}`);
    await waitFor(() => q('[data-testid="owner-subjects"]') !== null, 'links');
    const remove = byText('.record-actions button', 'Delete draft');
    expect(remove.getAttribute('aria-disabled')).toBe('true');
    expect(
      document.getElementById(remove.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toContain('Legal subjects are linked to this owner');
    // The linked subject can't be chosen again in the picker.
    await waitFor(() => all('input[name="legalSubjectId"]').length === 1, 'choices');
    expect((all('input[name="legalSubjectId"]')[0] as HTMLInputElement).disabled).toBe(true);
    expect(pageText()).toContain('already linked (change it in the table above)');
    await click(remove);
    expect(api.writes()).toHaveLength(0);
  });

  it('records a signer in a chosen agency; the agency is fixed afterwards and the boundary is stated', async () => {
    const api = new FakeDirectory();
    const agency = api.seed('Agency', { displayName: 'SYNTHETIC Signer Agency' });
    await render(api, `/directory/signers/new?agencyId=${agency.id}`);
    await waitFor(() => q('#signer-fullLegalName') !== null, 'form');
    await waitFor(
      () => (q('#signer-agencyId') as HTMLSelectElement | null)?.value === agency.id,
      'preselected agency',
    );
    expect(pageText()).toContain('Not a login; signs nothing');
    await type('#signer-fullLegalName', 'SYNTHETIC Trần Văn D');
    await submit(q('form.record-form'));
    await waitFor(() => q('[data-testid="signer-detail"]') !== null, 'detail');
    expect(api.writes()[0]?.body).toEqual({
      agencyId: agency.id,
      fullLegalName: 'SYNTHETIC Trần Văn D',
    });
    const signerId = [...api.rows.Signer.keys()][0];
    await act(async () => root?.unmount());
    container?.remove();
    await render(api, `/directory/signers/${signerId}/edit`);
    await waitFor(() => q('#signer-title') !== null, 'edit form');
    expect(q('#signer-agencyId')).toBeNull();
    expect(pageText()).toContain(
      'Fixed: a person acting for another agency needs a separate signer record.',
    );
  });

  it('a legal subject’s type is chosen once and shown as fixed when editing', async () => {
    const api = new FakeDirectory();
    await render(api, '/directory/legal-subjects/new');
    await waitFor(() => q('#subject-subjectType') !== null, 'form');
    await type('#subject-legalName', 'SYNTHETIC Individual');
    await submit(q('form.record-form'));
    expect(pageText()).toContain('Choose the subject type.');
    expect(api.writes()).toHaveLength(0);
    await type('#subject-subjectType', 'INDIVIDUAL');
    await submit(q('form.record-form'));
    await waitFor(() => q('[data-testid="legal-subject-detail"]') !== null, 'detail');
    expect(api.writes()[0]?.body).toEqual({
      subjectType: 'INDIVIDUAL',
      legalName: 'SYNTHETIC Individual',
    });
    const id = [...api.rows.LegalSubject.keys()][0];
    await act(async () => root?.unmount());
    container?.remove();
    await render(api, `/directory/legal-subjects/${id}/edit`);
    await waitFor(() => q('#subject-legalName') !== null, 'edit');
    expect(q('#subject-subjectType')).toBeNull();
    expect(pageText()).toContain('Fixed: a different kind of party needs its own record.');
  });

  it('locks set identity values of an active agency in the form and never sends them', async () => {
    const api = new FakeDirectory();
    const agency = api.seed('Agency', {
      displayName: 'SYNTHETIC Active',
      legalName: 'SYNTHETIC Active Ltd',
      recordState: 'ACTIVE',
    });
    await render(api, `/directory/agencies/${agency.id}/edit`);
    await waitFor(() => q('#agency-legalName') !== null, 'form');
    const legalName = q('#agency-legalName') as HTMLInputElement;
    expect(legalName.readOnly).toBe(true);
    expect(pageText()).toContain('Locked: this agency is established');
    // An empty identity field can still be completed.
    expect((q('#agency-registrationNumber') as HTMLInputElement).readOnly).toBe(false);
    await type('#agency-registrationNumber', 'SYN-REG-1');
    await submit(q('form.record-form'));
    await waitFor(() => q('[data-testid="agency-detail"]') !== null, 'saved');
    expect(api.writes()[0]?.body).toEqual({ registrationNumber: 'SYN-REG-1' });
  });

  it('keeps the application boundary visible: the directory never offers sign, send or login actions', async () => {
    const api = new FakeDirectory();
    const agency = api.seed('Agency', { displayName: 'SYNTHETIC Boundary' });
    await render(api, `/directory/agencies/${agency.id}`);
    await waitFor(() => q('[data-testid="agency-detail"]') !== null, 'detail');
    const labels = all('button, a').map((element) => element.textContent?.toLowerCase() ?? '');
    for (const forbidden of [
      /\bsign\b(?! out)/,
      /\bsend\b/,
      /\badopt/,
      /\bapprove/,
      /ready for signer/,
    ]) {
      expect(
        labels.filter((label) => forbidden.test(label)),
        String(forbidden),
      ).toEqual([]);
    }
  });
});
