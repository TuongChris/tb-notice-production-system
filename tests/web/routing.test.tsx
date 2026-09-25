// @vitest-environment happy-dom
// UI routing with route-level code splitting (P4B §25): every page module is loaded on first use,
// behind a loading notice inside the shell or section layout. A direct address opens its page
// inside the shell, an address without a session goes to Login before any page module or record is
// loaded, and history back/forward moves between pages of different modules. All data is synthetic.
import { describe, expect, it } from 'vitest';
import { FakeDirectory, go, history, pageText, q, render, until, waitFor } from './support.js';

function world(api: FakeDirectory) {
  const agency = api.seed('Agency', { displayName: 'SYNTHETIC Agency' });
  const caseA = api.seed('CaseRecord', { agencyId: agency.id, intakeLabel: 'SYNTHETIC Case A' });
  api.seed('CaseWork', { caseId: caseA.id, title: 'SYNTHETIC routing work' });
  return { agency, caseA };
}

describe('route-level code splitting', () => {
  it('a direct address of a lazily loaded page opens it inside the shell', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    await render(api, `/cases/${w.caseA.id}/facts/new`);
    await waitFor(() => q('#fact-factType') !== null, 'fact form');
    expect(q('[data-testid="app-shell"]')).not.toBeNull();
    expect(q('nav[aria-label="Modules"]')).not.toBeNull();
    expect(pageText()).toContain('New case fact');
    expect(pageText()).not.toContain('Loading page…');
    await go('/directory/signers');
    await waitFor(() => q('nav[aria-label="Directory"]') !== null, 'directory layout');
    await until('Signers');
  });

  it('an address without a session goes to Login; no page module’s records are requested', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    api.sessionGone = true;
    await render(api, `/cases/${w.caseA.id}/works/new`);
    await waitFor(() => q('input[type="password"]') !== null, 'login form');
    expect(q('[data-testid="app-shell"]')).toBeNull();
    expect(api.requests.some((request) => request.path.startsWith('/api/v1/cases'))).toBe(false);
  });

  it('history back and forward move between pages of different modules', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    await render(api, `/cases/${w.caseA.id}`);
    await waitFor(() => q('[data-testid="case-intake"]') !== null, 'case page');
    await until('SYNTHETIC routing work');
    await go('/directory/agencies');
    await until('SYNTHETIC Agency');
    await go(`/cases/${w.caseA.id}/works/new`);
    await waitFor(() => q('#work-title') !== null, 'work form');
    await history(-1);
    await waitFor(() => q('nav[aria-label="Directory"]') !== null, 'back to agencies');
    await until('SYNTHETIC Agency');
    expect(q('#work-title')).toBeNull();
    await history(-1);
    await waitFor(() => q('[data-testid="case-intake"]') !== null, 'back to the case');
    await until('SYNTHETIC routing work');
    await history(1);
    await waitFor(() => q('nav[aria-label="Directory"]') !== null, 'forward to agencies');
    await history(1);
    await waitFor(() => q('#work-title') !== null, 'forward to the work form');
  });
});
