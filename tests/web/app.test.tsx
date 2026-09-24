// @vitest-environment happy-dom
// UI: the P1 React shell against a synthetic in-memory API (fake fetch). Covers the login screen,
// the session-check state, the protected shell, logout, and expired/revoked-session handling.
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import type { SessionView } from '@tb/contracts';
import { createApiClient } from '../../apps/web/src/app/api/client.js';
import { App } from '../../apps/web/src/app/App.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const EMAIL = 'p1-ui-admin@example.invalid';
const PASSWORD = 'synthetic-P1-ui-password-0001';

interface RecordedRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: Record<string, string>;
  readonly body: string | undefined;
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
const failure = (status: number, code: string, headers: Record<string, string> = {}) =>
  json(
    status,
    { error: { code, message: `synthetic ${code}`, details: {}, requestId: 'synthetic-request' } },
    headers,
  );

/** Synthetic API: one user, one session, contract-shaped responses. */
class FakeApi {
  loggedIn = false;
  csrfToken = 'synthetic-csrf-token-000000000000000000000';
  throttled = false;
  sessionUnavailable = false;
  logoutStatus: 204 | 401 = 204;
  /** While true, session checks stay pending until releaseSessions() (StrictMode issues two). */
  holdSessions = false;
  private readonly pending: Array<(response: Response) => void> = [];
  readonly requests: RecordedRequest[] = [];

  readonly view = (): SessionView => ({
    user: {
      id: '00000000-0000-4000-8000-0000000000u1',
      email: EMAIL,
      displayName: 'Synthetic UI Admin',
      enabled: true,
      passwordChangedAt: null,
      disabledAt: null,
      createdAt: '2026-09-23T09:00:00.000Z',
    },
    expiresAt: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
    csrfToken: this.csrfToken,
  });

  readonly fetch = async (path: string, init: RequestInit): Promise<Response> => {
    const method = init.method ?? 'GET';
    const headers = { ...(init.headers as Record<string, string>) };
    this.requests.push({ method, path, headers, body: init.body as string | undefined });
    const meta = { requestId: 'synthetic-request', affectedResources: [] };
    if (path === '/api/v1/health') return json(200, { data: { status: 'ok' }, meta });
    if (path === '/api/v1/auth/session') {
      if (this.sessionUnavailable) throw new TypeError('synthetic network failure');
      if (this.holdSessions) {
        return new Promise((resolve) => {
          this.pending.push(resolve);
        });
      }
      return this.loggedIn
        ? json(200, { data: this.view(), meta })
        : failure(401, 'SESSION_REQUIRED');
    }
    if (path === '/api/v1/auth/login' && method === 'POST') {
      if (headers['X-Requested-With'] !== 'TB-APP') return failure(403, 'REQUESTED_WITH_REQUIRED');
      if (this.throttled) return failure(429, 'LOGIN_RATE_LIMITED', { 'Retry-After': '900' });
      const body = JSON.parse(String(init.body)) as { email: string; password: string };
      if (body.email !== EMAIL || body.password !== PASSWORD)
        return failure(403, 'INVALID_CREDENTIALS');
      this.loggedIn = true;
      return json(200, { data: this.view(), meta });
    }
    if (path === '/api/v1/auth/logout' && method === 'POST') {
      if (!this.loggedIn || this.logoutStatus === 401) return failure(401, 'SESSION_REQUIRED');
      if (headers['X-CSRF-Token'] !== this.csrfToken) return failure(403, 'CSRF_TOKEN_INVALID');
      this.loggedIn = false;
      return new Response(null, { status: 204 });
    }
    return failure(404, 'NOT_FOUND');
  };

  releaseSessions(make: () => Response): void {
    this.holdSessions = false;
    for (const resolve of this.pending.splice(0)) resolve(make());
  }
}

let root: Root | undefined;
let container: HTMLElement | undefined;

async function renderApp(api: FakeApi, path = '/'): Promise<HTMLElement> {
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
  return container;
}

async function waitFor(check: () => boolean, label: string): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > 3000) throw new Error(`timed out waiting for ${label}`);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

const q = (selector: string) => container?.querySelector(selector) ?? null;
const text = (selector: string) => q(selector)?.textContent ?? '';

async function signIn(email: string, password: string): Promise<void> {
  (q('input[name="email"]') as HTMLInputElement).value = email;
  (q('input[name="password"]') as HTMLInputElement).value = password;
  await act(async () => {
    (q('[data-testid="login-form"]') as HTMLFormElement).requestSubmit();
  });
}

async function click(selector: string): Promise<void> {
  await act(async () => {
    (q(selector) as HTMLElement).click();
  });
}

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

describe('P1 web shell', () => {
  it('shows the session-check state, then Login when there is no session', async () => {
    const api = new FakeApi();
    api.holdSessions = true;
    await renderApp(api);
    expect(q('[data-testid="session-check"]')?.textContent).toMatch(/Checking your session/);
    expect(q('[data-testid="login-form"]')).toBeNull();
    await act(async () => api.releaseSessions(() => failure(401, 'SESSION_REQUIRED')));
    await waitFor(() => q('[data-testid="login-form"]') !== null, 'login form');
    expect(q('[data-testid="app-shell"]')).toBeNull();
    expect(q('[data-testid="login-notice"]')).toBeNull();
  });

  it('signs in and shows the protected shell with safe identity and clearly unavailable modules', async () => {
    const api = new FakeApi();
    await renderApp(api, '/login');
    await waitFor(() => q('[data-testid="login-form"]') !== null, 'login form');
    await signIn(`  ${EMAIL}  `, PASSWORD);
    await waitFor(() => q('[data-testid="app-shell"]') !== null, 'shell');

    const loginRequest = api.requests.find((request) => request.path === '/api/v1/auth/login');
    expect(loginRequest?.headers).toMatchObject({
      'X-Requested-With': 'TB-APP',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(loginRequest?.body ?? '{}')).toEqual({ email: EMAIL, password: PASSWORD });

    expect(text('[data-testid="identity"]')).toBe(`Signed in as Synthetic UI Admin (${EMAIL})`);
    const modules = [...(container?.querySelectorAll('[data-testid="unavailable-module"]') ?? [])];
    expect(modules.map((item) => item.textContent)).toEqual([
      'Representation Not implemented',
      'Cases Not implemented',
      'Production Not implemented',
    ]);
    for (const item of modules) {
      expect(item.getAttribute('aria-disabled')).toBe('true');
      expect(item.querySelector('a')).toBeNull();
    }
    // P2: the Directory is the one reachable business module.
    const navLinks = [...(container?.querySelectorAll('nav[aria-label="Modules"] a') ?? [])];
    expect(navLinks.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Overview', '/'],
      ['Directory', '/directory'],
    ]);
    expect(text('[data-testid="boundary-note"]')).toMatch(/does not make you a Signer/);
    expect(text('[data-testid="boundary-note"]')).toMatch(/signs, adopts or sends nothing/);
    // Only safe identity: no internal ids, tokens or hashes are rendered.
    const html = container?.innerHTML ?? '';
    expect(html).not.toContain(api.csrfToken);
    expect(html).not.toContain('00000000-0000-4000-8000-0000000000u1');
    expect(html).not.toContain(PASSWORD);
  });

  it('a failed sign-in shows one generic message and clears the password field', async () => {
    const api = new FakeApi();
    await renderApp(api, '/login');
    await waitFor(() => q('[data-testid="login-form"]') !== null, 'login form');
    await signIn(EMAIL, 'synthetic-wrong-password');
    await waitFor(() => q('[data-testid="login-error"]') !== null, 'error');
    expect(text('[data-testid="login-error"]')).toBe(
      'Sign-in failed. Check the email address and password.',
    );
    expect((q('input[name="password"]') as HTMLInputElement).value).toBe('');
    // No UTF-16 maxLength on the password: the server enforces the contract's 256 code points.
    expect(q('input[name="password"]')?.hasAttribute('maxlength')).toBe(false);
    expect((q('input[name="email"]') as HTMLInputElement).value).toBe(EMAIL);
    expect(q('[data-testid="app-shell"]')).toBeNull();
  });

  it('shows a retry hint when sign-in is rate limited', async () => {
    const api = new FakeApi();
    api.throttled = true;
    await renderApp(api, '/login');
    await waitFor(() => q('[data-testid="login-form"]') !== null, 'login form');
    await signIn(EMAIL, PASSWORD);
    await waitFor(() => q('[data-testid="login-error"]') !== null, 'error');
    expect(text('[data-testid="login-error"]')).toBe(
      'Too many sign-in attempts. Try again in about 15 minutes.',
    );
  });

  it('goes straight to the shell when a session already exists', async () => {
    const api = new FakeApi();
    api.loggedIn = true;
    await renderApp(api, '/login');
    await waitFor(() => q('[data-testid="app-shell"]') !== null, 'shell');
    expect(text('[data-testid="session-expiry"]')).toMatch(/30 minutes without activity/);
  });

  it('logout sends the session CSRF token and returns to Login', async () => {
    const api = new FakeApi();
    api.loggedIn = true;
    await renderApp(api);
    await waitFor(() => q('[data-testid="app-shell"]') !== null, 'shell');
    await click('.shell-header button');
    await waitFor(() => q('[data-testid="login-form"]') !== null, 'login form');
    const logout = api.requests.find((request) => request.path === '/api/v1/auth/logout');
    expect(logout?.headers['X-CSRF-Token']).toBe(api.csrfToken);
    expect(logout?.body).toBeUndefined();
    expect(text('[data-testid="login-notice"]')).toBe('You have signed out.');
    expect(api.loggedIn).toBe(false);
  });

  it('a session revoked or expired elsewhere returns to Login when the window regains focus', async () => {
    const api = new FakeApi();
    api.loggedIn = true;
    await renderApp(api);
    await waitFor(() => q('[data-testid="app-shell"]') !== null, 'shell');
    api.loggedIn = false; // e.g. logout in another tab, idle expiry or sessionEpoch revocation
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => q('[data-testid="login-form"]') !== null, 'login form');
    expect(text('[data-testid="login-notice"]')).toMatch(/Your session has ended/);
  });

  it('logout of an already-expired session still returns to Login', async () => {
    const api = new FakeApi();
    api.loggedIn = true;
    api.logoutStatus = 401;
    await renderApp(api);
    await waitFor(() => q('[data-testid="app-shell"]') !== null, 'shell');
    await click('.shell-header button');
    await waitFor(() => q('[data-testid="login-form"]') !== null, 'login form');
    expect(text('[data-testid="login-notice"]')).toMatch(/Your session has ended/);
  });

  it('a stale CSRF token (newer login in another tab) is refreshed once, then logout succeeds', async () => {
    const api = new FakeApi();
    api.loggedIn = true;
    await renderApp(api);
    await waitFor(() => q('[data-testid="app-shell"]') !== null, 'shell');
    api.csrfToken = 'synthetic-rotated-csrf-token-0000000000000';
    await click('.shell-header button');
    await waitFor(() => q('[data-testid="login-form"]') !== null, 'login form');
    const tokens = api.requests
      .filter((request) => request.path === '/api/v1/auth/logout')
      .map((request) => request.headers['X-CSRF-Token']);
    expect(tokens).toEqual([
      'synthetic-csrf-token-000000000000000000000',
      'synthetic-rotated-csrf-token-0000000000000',
    ]);
    expect(text('[data-testid="login-notice"]')).toBe('You have signed out.');
  });

  it('an unreachable API shows Login with an availability notice; unknown routes land on Login', async () => {
    const api = new FakeApi();
    api.sessionUnavailable = true;
    await renderApp(api, '/cases/anything');
    await waitFor(() => q('[data-testid="login-form"]') !== null, 'login form');
    expect(text('[data-testid="login-notice"]')).toBe(
      'The API could not be reached to check your session.',
    );
    expect(q('[data-testid="app-shell"]')).toBeNull();
  });
});
