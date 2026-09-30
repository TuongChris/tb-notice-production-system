// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  all,
  byText,
  click,
  FakeDirectory,
  pageText,
  q,
  render,
  type,
  until,
  unmount,
  waitFor,
  NOW,
} from './support.js';
function fixture() {
  const api = new FakeDirectory();
  const agency = api.seed('Agency', { displayName: 'SYNTHETIC Agency LLC' });
  const owner = api.seed('Owner', { displayName: 'SYNTHETIC Namespace' });
  const current = api.seed('LegalSubject', {
    subjectType: 'INDIVIDUAL',
    legalName: 'SYNTHETIC Individual',
  });
  const old = api.seed('LegalSubject', {
    subjectType: 'LEGAL_ENTITY',
    legalName: 'SYNTHETIC Historical LLC',
    recordState: 'ARCHIVED',
    archivedAt: NOW,
  });
  const link = api.seed('OwnerSubject', { ownerId: owner.id, legalSubjectId: current.id });
  const oldLink = api.seed('OwnerSubject', {
    ownerId: owner.id,
    legalSubjectId: old.id,
    linkState: 'UNLINKED',
  });
  for (let i = 0; i < 5; i++)
    api.seed('Route', { agencyId: agency.id, ownerSubjectId: link.id, notes: 'SYNTHETIC' });
  const oldRoute = api.seed('Route', {
    agencyId: agency.id,
    ownerSubjectId: oldLink.id,
    linkState: 'UNLINKED',
    archivedAt: NOW,
    notes: 'SYNTHETIC',
  });
  for (let i = 0; i < 2; i++)
    api.seed('Route', {
      agencyId: agency.id,
      ownerSubjectId: oldLink.id,
      linkState: 'UNLINKED',
      archivedAt: NOW,
      notes: 'SYNTHETIC',
    });
  const mixed = api.seed('Mandate', {
    agencyId: agency.id,
    label: 'SYNTHETIC Individual AND LLC documentary mandate',
  });
  const archived = api.seed('Mandate', {
    agencyId: agency.id,
    label: 'SYNTHETIC Archived mandate',
    archivedAt: NOW,
  });
  return { api, agency, owner, current, old, oldRoute, mixed, archived };
}
describe('operational defaults with explicit history access', () => {
  it('routes show five current records, history shows three retained rows, all shows eight; filters only read', async () => {
    const { api } = fixture();
    await render(api, '/representation/routes');
    await until('SYNTHETIC Individual');
    expect(all('table.records tbody tr')).toHaveLength(5);
    expect(pageText()).not.toContain('SYNTHETIC Historical LLC');
    await type('#operational-view', 'history');
    await until('SYNTHETIC Historical LLC');
    expect(all('table.records tbody tr')).toHaveLength(3);
    expect(pageText()).toContain('Archived');
    expect(pageText()).toContain('Unlinked');
    await type('#operational-view', 'all');
    await waitFor(() => all('table.records tbody tr').length === 8, 'all rows');
    expect(api.writes()).toEqual([]);
    expect(api.requests.some((r) => r.path.includes('view=operational'))).toBe(true);
  });
  it('subjects and mandates hide archived rows by default, expose history, and keep mixed documentary text', async () => {
    const { api } = fixture();
    await render(api, '/directory/legal-subjects');
    await until('SYNTHETIC Individual');
    expect(pageText()).not.toContain('SYNTHETIC Historical LLC');
    await type('#operational-view', 'history');
    await until('SYNTHETIC Historical LLC');
    expect(pageText()).not.toContain('SYNTHETIC Individual');
    await unmount();
    await render(api, '/representation/mandates');
    await until('SYNTHETIC Individual AND LLC documentary mandate');
    expect(pageText()).not.toContain('SYNTHETIC Archived mandate');
    await type('#operational-view', 'history');
    await until('SYNTHETIC Archived mandate');
    expect(api.writes()).toEqual([]);
  });
  it('owner shows current relationships separately from inactive history and preserves direct historical details', async () => {
    const { api, owner, old, oldRoute, archived } = fixture();
    await render(api, '/directory/owners/' + owner.id);
    await until('Current relationships');
    await until('SYNTHETIC Individual');
    expect(q('[data-testid=owner-subjects]')?.textContent).not.toContain(
      'SYNTHETIC Historical LLC',
    );
    await type('#relationship-view', 'history');
    await until('History / inactive relationships');
    await until('SYNTHETIC Historical LLC');
    for (const [path, text] of [
      ['/directory/legal-subjects/' + old.id, 'SYNTHETIC Historical LLC'],
      ['/representation/routes/' + oldRoute.id, 'Archived'],
      ['/representation/mandates/' + archived.id, 'SYNTHETIC Archived mandate'],
    ]) {
      await unmount();
      await render(api, path!);
      await until(text!);
    }
    expect(api.writes()).toEqual([]);
  });
  it('new case and route binding load operational routes only, never offer retained LLC history', async () => {
    const { api, agency, oldRoute, owner } = fixture();
    await render(api, '/cases/new');
    await until('New case');
    await type('#case-agencyId', agency.id);
    await waitFor(() => all('#case-routeId option').length === 6, 'five current choices');
    expect(
      all('#case-routeId option').some((o) => (o as HTMLOptionElement).value === oldRoute.id),
    ).toBe(false);
    expect(
      api.requests.some((r) => r.path.includes('/routes?') && r.path.includes('view=operational')),
    ).toBe(true);
    await unmount();
    const c = api.seed('CaseRecord', {
      agencyId: agency.id,
      ownerHintId: owner.id,
      intakeLabel: 'SYNTHETIC bind',
    });
    await render(api, '/cases/' + c.id);
    await until('SYNTHETIC bind');
    await click(byText('button', 'Bind a route'));
    await waitFor(
      () =>
        api.requests.filter(
          (r) => r.path.includes('/routes?') && r.path.includes('view=operational'),
        ).length >= 2,
      'operational binding query',
    );
    expect(api.writes()).toEqual([]);
  });
  it('changing view resets keyset pagination and preserves the search filter', async () => {
    const { api } = fixture();
    api.pageSize = 2;
    await render(api, '/representation/routes?q=SYNTHETIC');
    await until('SYNTHETIC Individual');
    await click(byText('button', 'Next page'));
    await until('Page 2');
    await type('#operational-view', 'history');
    await until('Page 1');
    await until('SYNTHETIC Historical LLC');
    const requests = api.requests.filter((r) => r.path.includes('/routes?'));
    const last = requests.at(-1)!;
    expect(last.path).toContain('q=SYNTHETIC');
    expect(last.path).toContain('view=history');
    expect(last.path).not.toContain('cursor=');
    await type('#operational-view', 'operational');
    await until('SYNTHETIC Individual');
    expect(pageText()).toContain('Page 1');
    expect(api.requests.filter((r) => r.path.includes('/routes?')).at(-1)?.path).not.toContain(
      'cursor=',
    );
  });
  it('owner paging resets on a round trip, and an existing link outside the displayed view cannot be offered as new', async () => {
    const { api, owner, current } = fixture();
    for (let i = 0; i < 3; i++) {
      const subject = api.seed('LegalSubject', {
        legalName: `SYNTHETIC Extra ${i}`,
        subjectType: 'INDIVIDUAL',
      });
      api.seed('OwnerSubject', { ownerId: owner.id, legalSubjectId: subject.id });
    }
    api.pageSize = 2;
    await render(api, `/directory/owners/${owner.id}`);
    await until('Current relationships');
    await waitFor(() => all('[data-testid=owner-subjects] tbody tr').length === 2, 'current page');
    await click(byText('button', 'Next page'));
    await until('Page 2');
    await type('#relationship-view', 'history');
    await until('History / inactive relationships');
    await until('Page 1');
    await waitFor(
      () => q(`input[name=legalSubjectId][value="${current.id}"]`) !== null,
      'existing subject choice',
    );
    expect(
      (q(`input[name=legalSubjectId][value="${current.id}"]`) as HTMLInputElement).disabled,
    ).toBe(true);
    await type('#relationship-view', 'operational');
    await until('Current relationships');
    await until('Page 1');
    expect(api.writes()).toEqual([]);
  });
});
