// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  all,
  byText,
  click,
  FakeDirectory,
  go,
  pageText,
  q,
  render,
  type,
  until,
  waitFor,
} from './support.js';

function seedCases(api: FakeDirectory) {
  const agency = api.seed('Agency', { displayName: 'SYNTHETIC Production Agency' });
  return ['Alpha', 'Beta'].map((label) =>
    api.seed('CaseRecord', {
      agencyId: agency.id,
      intakeLabel: `SYNTHETIC ${label}`,
      routeId: null,
    }),
  );
}

describe('Production navigation', () => {
  it('reaches Production from the shell and removes obsolete Overview claims', async () => {
    const api = new FakeDirectory();
    await render(api, '/');
    await until('Overview');
    expect(pageText()).not.toMatch(/not implemented yet|Production Not implemented/);
    expect(pageText()).toContain('Unsigned Export');
    await click(byText('nav[aria-label="Modules"] a', 'Production'));
    await until('No cases yet.');
    expect(q('[data-testid="production-page"]')).not.toBeNull();
    expect(q('nav[aria-label="Modules"] a[aria-current="page"]')?.textContent).toBe('Production');
    expect(pageText()).toContain('An application User is not a Signer.');
    expect(pageText()).toContain('This application never signs or sends notices.');
    expect(pageText()).toContain('Technical PASS is not G1–G6 PASS.');
    expect(pageText()).toContain('not approval or permission to send');
    expect(pageText()).toMatch(/G7.*remains outside/);
    expect(
      all('button, a')
        .map((el) => el.textContent)
        .join(' '),
    ).not.toMatch(/\b(Sign notice|Send notice|Complete G7|Approve|Mark ready)\b/i);
    expect(api.writes()).toHaveLength(0);
  });

  it('keeps every workflow link on its explicitly chosen case, including unbound and archived history', async () => {
    const api = new FakeDirectory();
    const cases = seedCases(api);
    cases[1]!.archivedAt = '2026-09-29T00:00:00.000Z';
    await render(api, '/production');
    await until('SYNTHETIC Alpha');
    await until('SYNTHETIC Beta');
    for (const item of cases) {
      const nav = q(`nav[aria-label="Production for ${item.intakeLabel}"]`);
      expect([...nav!.querySelectorAll('a')].map((link) => link.getAttribute('href'))).toEqual([
        `/cases/${item.id}/production-context`,
        `/cases/${item.id}/prompts`,
        `/cases/${item.id}/candidates`,
      ]);
    }
    expect(pageText()).toContain('Archived — read-only');
    expect(pageText()).toContain('No route bound');
    expect(api.requests.some((r) => /production-context|prompts|candidates/.test(r.path))).toBe(
      false,
    );
    for (const item of cases) {
      await click(q(`a[href="/cases/${item.id}/prompts"]`)!);
      await waitFor(() => q('[data-testid="prompt-history"]') !== null, 'prompt history');
      await until(String(item.intakeLabel));
      expect(q('[data-testid="prompt-history"]')).not.toBeNull();
      expect(api.requests.some((r) => r.path.includes(`/cases/${item.id}/prompts`))).toBe(true);
      await go('/production');
      await until('SYNTHETIC Alpha');
    }
    expect(api.writes()).toHaveLength(0);
  });

  it('uses the existing search and handles an empty match without choosing a case', async () => {
    const api = new FakeDirectory();
    seedCases(api);
    await render(api, '/production');
    await until('SYNTHETIC Alpha');
    await type('input[type="search"]', 'no such case');
    await click(byText('button', 'Search'));
    await until('No cases match');
    expect(all('nav[aria-label^="Production for"]')).toHaveLength(0);
    expect(api.writes()).toHaveLength(0);
  });
});
