// @vitest-environment happy-dom
// UI (P4A): cases, their route binding, canonical id, linked sources and the authority materials
// selected for evaluation, against the synthetic in-memory API (support.tsx). Covers explicit
// choices only (no inferred route, signer, coverage or source), scoped source pickers, the exact
// payloads and preconditions (the case's ETag, the link's own ETag), read-only archived cases,
// version conflicts, the required statement that a selection is not a G1 decision, the absence of
// authority badges, and that nothing loaded or entered for one case is shown for another. Since
// TB-SCHEMA-API-v1.1.0 (R8), a selection is read back after any reload with exactly the coverage and
// application scopes it pinned, and only under its own case. All data is synthetic.
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
  submit,
  type,
  unmount,
  until,
  waitFor,
} from './support.js';

/** The statement every selection view must show (mission §31, verbatim). */
const SELECTION_MEANING =
  'This selection records which authority materials will be evaluated for this Case. It is not a G1 decision.';
/** Badge wording a case, link or selection must never display as its state. */
const FORBIDDEN_STAMPS =
  /\b(authori[sz]ed|approved|valid authority|valid|g1 pass|g7|ready|eligible|verified|current authority)\b/i;

function stampTexts(): string[] {
  return all('.stamp, .tag, .badge').map((element) => element.textContent ?? '');
}

async function choose(selector: string, value: string, label: string): Promise<void> {
  await waitFor(
    () =>
      [...((q(selector) as HTMLSelectElement | null)?.options ?? [])].some(
        (option) => option.value === value,
      ),
    label,
  );
  await type(selector, value);
}

function optionValues(selector: string): string[] {
  return [...((q(selector) as HTMLSelectElement | null)?.options ?? [])].map((o) => o.value);
}

function bodies(api: FakeDirectory, method: string, pathPart: string) {
  return api
    .writes()
    .filter((request) => request.method === method && request.path.includes(pathPart));
}

function world(api: FakeDirectory) {
  const agency = api.seed('Agency', { displayName: 'SYNTHETIC Agency' });
  const other = api.seed('Agency', { displayName: 'SYNTHETIC Other Agency' });
  const owner = api.seed('Owner', { displayName: 'SYNTHETIC Brand' });
  const subject = api.seed('LegalSubject', { legalName: 'SYNTHETIC Subject LLC' });
  const link = api.seed('OwnerSubject', { ownerId: owner.id, legalSubjectId: subject.id });
  const route = api.seed('Route', { agencyId: agency.id, ownerSubjectId: link.id });
  const secondSubject = api.seed('LegalSubject', { legalName: 'SYNTHETIC Second Subject' });
  const secondLink = api.seed('OwnerSubject', {
    ownerId: owner.id,
    legalSubjectId: secondSubject.id,
  });
  const pausedRoute = api.seed('Route', {
    agencyId: agency.id,
    ownerSubjectId: secondLink.id,
    linkState: 'PAUSED',
  });
  const otherLink = api.seed('OwnerSubject', {
    ownerId: owner.id,
    legalSubjectId: api.seed('LegalSubject', { legalName: 'SYNTHETIC Other Subject' }).id,
  });
  const otherRoute = api.seed('Route', { agencyId: other.id, ownerSubjectId: otherLink.id });
  const signer = api.seed('Signer', { agencyId: agency.id, fullLegalName: 'SYNTHETIC Signer' });
  const unrecorded = api.seed('Signer', {
    agencyId: agency.id,
    fullLegalName: 'SYNTHETIC Unrecorded Signer',
  });
  const ended = api.seed('Signer', {
    agencyId: agency.id,
    fullLegalName: 'SYNTHETIC Ended Signer',
    operationalState: 'ENDED',
  });
  const source = api.seedSource({ agencyId: agency.id, title: 'SYNTHETIC agency record' });
  const shared = api.seedSource({
    title: 'SYNTHETIC shared record',
    scopeBindings: { agencyIds: [agency.id] },
  });
  const foreign = api.seedSource({ agencyId: other.id, title: 'SYNTHETIC other agency record' });
  const subjectScoped = api.seedSource({
    agencyId: agency.id,
    title: 'SYNTHETIC subject record',
    scopeBindings: { legalSubjectIds: [subject.id] },
  });
  const mandate = api.seed('Mandate', {
    agencyId: agency.id,
    label: 'SYNTHETIC Representation agreement',
  });
  const frozen = api.seed('MandateVersion', {
    mandateId: mandate.id,
    agencyId: agency.id,
    versionState: 'FROZEN',
    frozenAt: '2026-09-24T09:30:00.000Z',
    effectiveOn: '2024-01-01',
    expiresOn: '2020-12-31',
  });
  const coverage = api.seed('MandateCoverage', {
    mandateVersionId: frozen.id,
    agencyId: agency.id,
    routeId: route.id,
    coverageLabel: 'SYNTHETIC YouTube coverage',
    actionScope: ['PREPARE_NOTICE'],
  });
  api.seed('CoverageSigner', {
    coverageId: coverage.id,
    agencyId: agency.id,
    signerId: signer.id,
    capacity: 'SYNTHETIC Director',
  });
  const preferred = api.seed('MandateCoverage', {
    mandateVersionId: frozen.id,
    agencyId: agency.id,
    routeId: route.id,
    coverageLabel: 'SYNTHETIC preferred coverage',
  });
  api.seed('CoverageSigner', {
    coverageId: preferred.id,
    agencyId: agency.id,
    signerId: signer.id,
    capacity: 'SYNTHETIC Director',
  });
  const draft = api.seed('MandateVersion', {
    mandateId: mandate.id,
    agencyId: agency.id,
    version: 2,
    predecessorId: frozen.id,
  });
  api.seed('MandateCoverage', {
    mandateVersionId: draft.id,
    agencyId: agency.id,
    routeId: route.id,
    coverageLabel: 'SYNTHETIC draft coverage',
  });
  api.seed('MandateCoverage', {
    mandateVersionId: frozen.id,
    agencyId: agency.id,
    routeId: pausedRoute.id,
    coverageLabel: 'SYNTHETIC other route coverage',
  });
  const unrecordedCoverage = api.seed('MandateCoverage', {
    mandateVersionId: frozen.id,
    agencyId: agency.id,
    routeId: route.id,
    coverageLabel: 'SYNTHETIC coverage of another signer',
  });
  api.seed('CoverageSigner', {
    coverageId: unrecordedCoverage.id,
    agencyId: agency.id,
    signerId: unrecorded.id,
    capacity: 'SYNTHETIC Manager',
  });
  Object.assign(route, { defaultSignerId: signer.id, preferredCoverageId: preferred.id });
  const bound = api.seed('CaseRecord', {
    agencyId: agency.id,
    intakeLabel: 'SYNTHETIC Case A',
    routeId: route.id,
  });
  const unbound = api.seed('CaseRecord', { agencyId: agency.id, intakeLabel: 'SYNTHETIC Case B' });
  const scopedToA = api.seedSource({
    title: 'SYNTHETIC record of case A',
    scopeBindings: { caseIds: [bound.id] },
  });
  const scopedToB = api.seedSource({
    title: 'SYNTHETIC record of case B',
    scopeBindings: { caseIds: [unbound.id] },
  });
  return {
    agency,
    other,
    owner,
    subject,
    route,
    pausedRoute,
    otherRoute,
    signer,
    unrecorded,
    ended,
    source,
    shared,
    foreign,
    subjectScoped,
    mandate,
    frozen,
    coverage,
    preferred,
    unrecordedCoverage,
    bound,
    unbound,
    scopedToA,
    scopedToB,
  };
}

describe('P4A cases UI', () => {
  it('the shell links to Cases; the list shows cases with neutral workflow stamps and filters by workflow state', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    api.seed('CaseRecord', {
      agencyId: w.agency.id,
      intakeLabel: 'SYNTHETIC Closed case',
      workflowState: 'CLOSED',
    });
    await render(api, '/');
    await waitFor(() => q('nav[aria-label="Modules"] a[href="/cases"]') !== null, 'nav');
    await click(q('nav[aria-label="Modules"] a[href="/cases"]') as HTMLElement);
    await until('SYNTHETIC Case A');
    await until('SYNTHETIC Closed case');
    expect(pageText()).toContain('A case is not a legal verdict.');
    await until('SYNTHETIC Brand · SYNTHETIC Subject LLC (YouTube)');
    expect(pageText()).toContain('No route bound');
    for (const stamp of stampTexts()) expect(stamp).not.toMatch(FORBIDDEN_STAMPS);
    const workflow = all('select').find((element) =>
      element.parentElement?.textContent?.startsWith('Workflow'),
    ) as HTMLSelectElement;
    workflow.id = 'workflow-filter';
    await type('#workflow-filter', 'CLOSED');
    await waitFor(() => !pageText().includes('SYNTHETIC Case A'), 'filtered');
    expect(pageText()).toContain('SYNTHETIC Closed case');
    const listRequest = api.requests.filter((request) => request.path.startsWith('/api/v1/cases?'));
    expect(listRequest.at(-1)?.path).toContain('workflowState=CLOSED');
  });

  it('creates a case from explicit choices only: nothing is inferred and nothing else is sent', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    await render(api, '/cases/new');
    await waitFor(() => q('#case-agencyId') !== null, 'form');
    await submit(q('form.record-form'));
    await until('Choose the agency this case belongs to.');
    expect(bodies(api, 'POST', '/api/v1/cases')).toHaveLength(0);
    await choose('#case-agencyId', w.agency.id, 'agency');
    await type('#case-intakeLabel', '  SYNTHETIC New intake  ');
    // Routes of the chosen agency only; a paused route is shown but cannot be chosen.
    await waitFor(() => optionValues('#case-routeId').includes(w.route.id), 'routes');
    expect(optionValues('#case-routeId')).not.toContain(w.otherRoute.id);
    const paused = [...((q('#case-routeId') as HTMLSelectElement).options ?? [])].find(
      (option) => option.value === w.pausedRoute.id,
    );
    expect(paused?.disabled).toBe(true);
    expect(paused?.textContent).toContain('not available: paused');
    await submit(q('form.record-form'));
    await waitFor(() => q('[data-testid="case-detail"]') !== null, 'detail');
    const [created] = bodies(api, 'POST', '/api/v1/cases');
    expect(created?.body).toEqual({
      agencyId: w.agency.id,
      intakeLabel: 'SYNTHETIC New intake',
      caseClass: 'WORKING_INTAKE',
    });
    expect(created?.headers['If-Match']).toBeUndefined();
    await until('Case created.');
    expect(pageText()).toContain('No route bound to this case.');
    expect(pageText()).toContain('No canonical case id: this case is local only.');
    expect(pageText()).toContain('No source is linked to this case.');
    expect(pageText()).toContain(
      'No authority materials have been selected for evaluation in this case.',
    );
  });

  it('the case page states what a case, a link and a selection are — and shows no authority badge', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    await render(api, `/cases/${w.bound.id}`);
    await waitFor(() => q('[data-testid="case-detail"]') !== null, 'detail');
    await until('SYNTHETIC Brand');
    expect(pageText()).toContain(
      'A case is the boundary of its case-specific records. It is not a legal verdict',
    );
    expect(q('[data-testid="selection-meaning"]')?.textContent).toBe(SELECTION_MEANING);
    expect(pageText()).toContain('It does not confirm standing, current authority, owner rights');
    expect(pageText()).toContain(
      'Linking does not mean the document was reviewed, that what it says is true',
    );
    expect(pageText()).toContain('A route binding records which route this case uses.');
    expect(pageText()).toContain(
      'Open a selection to see the exact coverage records it pinned and the application scope recorded for each.',
    );
    expect(pageText()).not.toContain('the contract has no operation that reads them back yet');
    for (const stamp of stampTexts()) expect(stamp).not.toMatch(FORBIDDEN_STAMPS);
    expect(pageText()).not.toMatch(/\b(authorized|approved|g1 pass|eligible|ready to sign)\b/i);
  });

  it('binds a route: only the case agency’s linked routes can be chosen; the case ETag is sent; nothing is selected', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    await render(api, `/cases/${w.unbound.id}`);
    await waitFor(() => q('[data-testid="case-detail"]') !== null, 'detail');
    await click(byText('button', 'Bind a route'));
    // Focus moves into the dialog at once, before its route options have loaded.
    expect(document.activeElement?.tagName).toBe('FIELDSET');
    expect(document.activeElement?.closest('dialog[open]')).not.toBeNull();
    await waitFor(() => q('dialog[open] input[name="case-route"]') !== null, 'route options');
    const radios = all('dialog[open] input[name="case-route"]') as HTMLInputElement[];
    expect(radios.map((radio) => radio.value).sort()).toEqual(
      [w.route.id, w.pausedRoute.id].sort(),
    );
    expect(radios.find((radio) => radio.value === w.pausedRoute.id)?.disabled).toBe(true);
    expect(q('dialog[open]')?.textContent).toContain('Nothing is chosen from matching names.');
    await submit(q('dialog[open] form'));
    await until('Choose the route this case uses.');
    await click(radios.find((radio) => radio.value === w.route.id) as HTMLElement);
    await type('dialog[open] textarea', 'SYNTHETIC binding reason');
    await submit(q('dialog[open] form'));
    await until('Route bound to this case.');
    const [binding] = bodies(api, 'POST', '/route-binding');
    expect(binding?.body).toEqual({ routeId: w.route.id, reason: 'SYNTHETIC binding reason' });
    expect(binding?.headers['If-Match']).toBe(`"CaseRecord:${w.unbound.id}:v1"`);
    await until('SYNTHETIC Subject LLC');
    expect(api.selections).toHaveLength(0);
    expect(bodies(api, 'POST', '/authority-selections')).toHaveLength(0);
    expect(pageText()).toContain('Context revision 2');
  });

  it('a refused route correction is explained: the case already has history on its route', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    const second = api.seed('Route', {
      agencyId: w.agency.id,
      ownerSubjectId: api.seed('OwnerSubject', {
        ownerId: w.owner.id,
        legalSubjectId: api.seed('LegalSubject', { legalName: 'SYNTHETIC Third Subject' }).id,
      }).id,
    });
    api.seedSelection({ caseId: w.bound.id, agencyId: w.agency.id, routeId: w.route.id });
    await render(api, `/cases/${w.bound.id}`);
    await waitFor(() => q('[data-testid="case-detail"]') !== null, 'detail');
    await click(byText('button', 'Correct the route binding'));
    await waitFor(() => q(`dialog[open] input[value="${second.id}"]`) !== null, 'options');
    await click(q(`dialog[open] input[value="${second.id}"]`) as HTMLElement);
    await type('dialog[open] textarea', 'SYNTHETIC correction');
    await submit(q('dialog[open] form'));
    await until('Changing the route needs a reconciliation workflow');
    expect(api.rows.CaseRecord.get(w.bound.id)?.['routeId']).toBe(w.route.id);
  });

  it('changes the workflow state with a reason and the case ETag; the dialog says no state is a legal conclusion', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    await render(api, `/cases/${w.unbound.id}`);
    await waitFor(() => q('[data-testid="case-detail"]') !== null, 'detail');
    await click(byText('button', 'Change workflow state'));
    await waitFor(() => q('dialog[open]') !== null, 'dialog');
    expect(q('dialog[open]')?.textContent).toContain(
      'No state means infringement, authority, readiness, submission or an outcome.',
    );
    const offered = optionValues('#case-next-workflow-state');
    expect(offered).not.toContain('INTAKE');
    expect(offered).not.toContain('READY_FOR_SIGNER');
    await type('#case-next-workflow-state', 'CLOSED');
    await type('dialog[open] textarea', 'SYNTHETIC close');
    await submit(q('dialog[open] form'));
    await until('Workflow state changed to Closed.');
    const [change] = bodies(api, 'POST', '/workflow');
    expect(change?.body).toEqual({ state: 'CLOSED', reason: 'SYNTHETIC close' });
    expect(change?.headers['If-Match']).toBe(`"CaseRecord:${w.unbound.id}:v1"`);
    expect(pageText()).toContain('SYNTHETIC close');
  });

  it('an archived case is read-only: every change is offered as unavailable with the reason; restore brings it back', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    await render(api, `/cases/${w.bound.id}`);
    await waitFor(() => q('[data-testid="case-detail"]') !== null, 'detail');
    await click(byText('button', 'Archive'));
    await waitFor(() => q('dialog[open]') !== null, 'dialog');
    expect(q('dialog[open]')?.textContent).toContain('Nothing is revoked, deleted or sent.');
    await type('dialog[open] textarea', 'SYNTHETIC archive');
    await submit(q('dialog[open] form'));
    await until('Archived.');
    expect(pageText()).toContain('An archived case and everything under it are read-only');
    for (const label of [
      'Link a source',
      'Select authority materials',
      'Correct the route binding',
    ]) {
      const button = byText('button', label);
      expect(button.getAttribute('aria-disabled'), label).toBe('true');
    }
    expect(all('a').some((link) => link.textContent === 'Edit')).toBe(false);
    await click(byText('button', 'Restore'));
    await waitFor(() => q('dialog[open]') !== null, 'restore dialog');
    await type('dialog[open] textarea', 'SYNTHETIC restore');
    await submit(q('dialog[open] form'));
    await until('Restored.');
    expect(byText('a', 'Link a source')).not.toBeNull();
  });

  it('a change with an outdated case version shows the conflict notice and changes nothing', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    await render(api, `/cases/${w.unbound.id}`);
    await waitFor(() => q('[data-testid="case-detail"]') !== null, 'detail');
    api.touch('CaseRecord', w.unbound.id);
    await click(byText('button', 'Change workflow state'));
    await waitFor(() => q('dialog[open]') !== null, 'dialog');
    await type('dialog[open] textarea', 'SYNTHETIC stale change');
    await submit(q('dialog[open] form'));
    await waitFor(() => q('[data-testid="conflict-notice"]') !== null, 'conflict');
    expect(api.rows.CaseRecord.get(w.unbound.id)?.['workflowState']).toBe('INTAKE');
  });

  it('links a source: only sources whose scope includes this case are offered; the exact revision and the case ETag are sent', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    await render(api, `/cases/${w.bound.id}/sources/new`);
    await waitFor(() => q('#case-source-sourceId') !== null, 'form');
    expect(q('label[for="case-source-sourceId"]')?.textContent).toBe('Source to link (required)');
    expect(pageText()).toContain('Find a source for source to link');
    await waitFor(() => optionValues('#case-source-sourceId').includes(w.source.id), 'offered');
    await waitFor(
      () => optionValues('#case-source-sourceId').includes(w.subjectScoped.id),
      'subject',
    );
    const offered = optionValues('#case-source-sourceId');
    expect(offered).toContain(w.shared.id);
    expect(offered).toContain(w.scopedToA.id);
    expect(offered).not.toContain(w.foreign.id);
    expect(offered).not.toContain(w.scopedToB.id);
    expect(pageText()).toContain(
      'Linking does not mean the document was reviewed, that what it says is true',
    );
    await submit(q('form.record-form'));
    await until('Choose the source to link.');
    await type('#case-source-sourceId', w.subjectScoped.id);
    await type('#case-source-useRole', ' PACKET ');
    await type('#case-source-scopeNote', 'SYNTHETIC-SCOPE pages 1–3');
    await submit(q('form.record-form'));
    await waitFor(() => q('[data-testid="case-detail"]') !== null, 'detail');
    await until('Source linked to this case.');
    const [linked] = bodies(api, 'POST', `/cases/${w.bound.id}/sources`);
    expect(linked?.body).toEqual({
      sourceId: w.subjectScoped.id,
      useRole: 'PACKET',
      scopeNote: 'SYNTHETIC-SCOPE pages 1–3',
    });
    expect(linked?.headers['If-Match']).toBe(`"CaseRecord:${w.bound.id}:v1"`);
    await waitFor(() => q('[data-testid="case-sources"]') !== null, 'links');
    expect(q('[data-testid="case-sources"]')?.textContent).toContain('SYNTHETIC subject record');
    expect(q('[data-testid="case-sources"]')?.textContent).toContain('Linked');
    // A subject-scoped source is not offered to a case without a route (its subject is unknown).
    await unmount();
    await render(api, `/cases/${w.unbound.id}/sources/new`);
    await waitFor(() => optionValues('#case-source-sourceId').includes(w.source.id), 'unbound');
    expect(optionValues('#case-source-sourceId')).not.toContain(w.subjectScoped.id);
    expect(optionValues('#case-source-sourceId')).toContain(w.scopedToB.id);
    expect(optionValues('#case-source-sourceId')).not.toContain(w.scopedToA.id);
  });

  it('changes a link state with the link’s own ETag; an outdated link shows a conflict and saves nothing', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    const link = api.seed('CaseSource', {
      caseId: w.bound.id,
      sourceId: w.source.id,
      useRole: 'PACKET',
      scopeNote: 'SYNTHETIC scope note',
    });
    await render(api, `/cases/${w.bound.id}`);
    await waitFor(() => q('[data-testid="case-sources"]') !== null, 'links');
    // A visually hidden (absolutely positioned) header at the table's right edge escaped the
    // scroll frame and widened the page at 390px; column headers are visible text, as elsewhere.
    expect(q('.table-frame th .visually-hidden')).toBeNull();
    expect(q('[data-testid="case-sources"] thead th:last-child')?.textContent).toBe('Actions');
    await click(byText('button', 'Change link state'));
    await waitFor(() => q('dialog[open]') !== null, 'dialog');
    expect(q('dialog[open]')?.textContent).toContain(
      'an unlinked source is not false or invalid, only no longer linked',
    );
    await type('#case-source-next-state', 'UNLINKED');
    await type('#case-source-state-reason', 'SYNTHETIC unlink');
    await submit(q('dialog[open] form'));
    await until('Link state changed to Unlinked.');
    const [change] = bodies(api, 'POST', '/link-state');
    expect(change?.path).toBe(`/api/v1/case-sources/${link.id}/link-state`);
    expect(change?.body).toEqual({ state: 'UNLINKED', reason: 'SYNTHETIC unlink' });
    expect(change?.headers['If-Match']).toBe(`"CaseSource:${link.id}:v1"`);
    expect(api.rows.CaseSource.has(link.id)).toBe(true);
    await waitFor(() => q('[data-testid="case-sources"]') !== null, 'links again');
    api.touch('CaseSource', link.id);
    await click(byText('button', 'Change link state'));
    await waitFor(() => q('dialog[open]') !== null, 'dialog again');
    await type('#case-source-state-reason', 'SYNTHETIC relink');
    await submit(q('dialog[open] form'));
    await until('This link changed after the page loaded. Nothing was saved.');
    expect(api.rows.CaseSource.get(link.id)?.['linkState']).toBe('UNLINKED');
  });

  it('a case without a route cannot select authority; the page says why', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    await render(api, `/cases/${w.unbound.id}`);
    await waitFor(() => q('[data-testid="case-detail"]') !== null, 'detail');
    expect(byText('button', 'Select authority materials').getAttribute('aria-disabled')).toBe(
      'true',
    );
    expect(pageText()).toContain('Bind a route to this case first');
    await unmount();
    await render(api, `/cases/${w.unbound.id}/authority-selections/new`);
    await until('This case has no route yet.');
    expect(q('[data-testid="selection-meaning"]')?.textContent).toBe(SELECTION_MEANING);
    expect(q('form')).toBeNull();
  });

  it('selects authority for evaluation: explicit chain only, nothing preselected, frozen coverage of this route that records the signer', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    await render(api, `/cases/${w.bound.id}/authority-selections/new`);
    await waitFor(() => q('[data-testid="select-authority"]') !== null, 'form');
    expect(q('[data-testid="selection-meaning"]')?.textContent).toBe(SELECTION_MEANING);
    await waitFor(() => all('[data-testid="coverage-candidate"]').length === 3, 'candidates');
    const candidates = all('[data-testid="coverage-candidate"]').map((item) => item.textContent);
    expect(candidates.join('\n')).toContain('SYNTHETIC YouTube coverage');
    expect(candidates.join('\n')).not.toContain('SYNTHETIC draft coverage');
    expect(candidates.join('\n')).not.toContain('SYNTHETIC other route coverage');
    expect(pageText()).toContain('1 coverage record of draft versions not offered');
    // Dates exactly as recorded, with no currentness conclusion.
    expect(candidates.join('\n')).toContain('(as recorded)');
    // Nothing preselected: no signer, no coverage — the route's defaults are only suggestions.
    expect((q('#select-signerId') as HTMLSelectElement).value).toBe('');
    await until('It is a suggestion only and is not preselected.');
    expect(q('[data-testid="preferred-coverage-note"]')?.textContent).toContain('not preselected');
    const boxes = () =>
      all('[data-testid="coverage-candidate"] input[type="checkbox"]') as HTMLInputElement[];
    expect(boxes().every((box) => !box.checked && box.disabled)).toBe(true);
    expect(pageText()).toContain('Choose the signer first.');
    const ended = [...(q('#select-signerId') as HTMLSelectElement).options].find(
      (option) => option.value === w.ended.id,
    );
    expect(ended?.disabled).toBe(true);
    await type('#select-signerId', w.signer.id);
    const byCoverage = (id: string) => q(`#select-coverage-${id}`) as HTMLInputElement;
    expect(byCoverage(w.coverage.id).disabled).toBe(false);
    expect(byCoverage(w.unrecordedCoverage.id).disabled).toBe(true);
    expect(pageText()).toContain('The chosen signer is not recorded under this coverage.');
    await submit(q('form.record-form'));
    await until('Choose at least one coverage to evaluate.');
    expect(bodies(api, 'POST', '/authority-selections')).toHaveLength(0);
    await click(byCoverage(w.coverage.id));
    await waitFor(() => q(`#select-scope-${w.coverage.id}`) !== null, 'scope field');
    await type(`#select-scope-${w.coverage.id}`, 'SYNTHETIC channel uploads');
    await type('#select-taskType', 'INITIAL');
    await type('#select-intendedFromEmail', ' synthetic-sender@example.invalid ');
    await type('#select-selectionNote', 'SYNTHETIC evaluate this agreement');
    const summary = q('[data-testid="chain-summary"]')?.textContent ?? '';
    expect(summary).toContain('SYNTHETIC Case A');
    expect(summary).toContain('SYNTHETIC YouTube coverage');
    expect(summary).toContain('It is not a G1 decision.');
    await submit(q('form.record-form'));
    await waitFor(() => q('[data-testid="case-detail"]') !== null, 'detail');
    await until('Authority materials selected for evaluation. This is not a G1 decision.');
    const [selected] = bodies(api, 'POST', '/authority-selections');
    expect(selected?.body).toEqual({
      routeId: w.route.id,
      signerId: w.signer.id,
      taskType: 'INITIAL',
      intendedFromEmail: 'synthetic-sender@example.invalid',
      selectionNote: 'SYNTHETIC evaluate this agreement',
      coverages: [{ coverageId: w.coverage.id, applicationScope: 'SYNTHETIC channel uploads' }],
    });
    expect(selected?.headers['If-Match']).toBe(`"CaseRecord:${w.bound.id}:v1"`);
    await waitFor(() => q('[data-testid="case-selections"]') !== null, 'history');
    expect(q('[data-testid="selection-in-use"]')?.textContent).toBe('In use for evaluation');
    expect(q('[data-testid="case-selections"]')?.textContent).toContain(
      'SYNTHETIC evaluate this agreement',
    );
    expect(q('[data-testid="selection-meaning"]')?.textContent).toBe(SELECTION_MEANING);
    for (const stamp of stampTexts()) expect(stamp).not.toMatch(FORBIDDEN_STAMPS);
  });

  it('a refused selection is explained and nothing is recorded (the signer is not recorded under the coverage)', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    await render(api, `/cases/${w.bound.id}/authority-selections/new`);
    await waitFor(() => all('[data-testid="coverage-candidate"]').length === 3, 'candidates');
    await type('#select-signerId', w.signer.id);
    await click(q(`#select-coverage-${w.coverage.id}`) as HTMLElement);
    await waitFor(() => q(`#select-scope-${w.coverage.id}`) !== null, 'scope');
    await type(`#select-scope-${w.coverage.id}`, 'SYNTHETIC scope');
    await type('#select-taskType', 'NMI_REPLY');
    await type('#select-intendedFromEmail', 'synthetic-sender@example.invalid');
    await type('#select-selectionNote', 'SYNTHETIC note');
    // Meanwhile the association was removed on the server.
    for (const [id, row] of api.rows.CoverageSigner) {
      if (row['coverageId'] === w.coverage.id) api.rows.CoverageSigner.delete(id);
    }
    await submit(q('form.record-form'));
    await until('The chosen signer is not recorded under that coverage.');
    expect(api.selections).toHaveLength(0);
  });

  it('switching from case A to case B shows only B: no link, selection, message, dialog or entered text of A carries over', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    const linkA = api.seed('CaseSource', {
      caseId: w.bound.id,
      sourceId: w.source.id,
      useRole: 'PACKET',
      scopeNote: 'SYNTHETIC-A-ONLY scope note',
    });
    api.seedSelection({
      caseId: w.bound.id,
      agencyId: w.agency.id,
      routeId: w.route.id,
      signerId: w.signer.id,
      selectionNote: 'SYNTHETIC-A-ONLY selection note',
    });
    Object.assign(api.rows.CaseRecord.get(w.bound.id) ?? {}, {
      currentAuthoritySelectionId: api.selections[0]?.id,
    });
    const caseC = api.seed('CaseRecord', {
      agencyId: w.agency.id,
      intakeLabel: 'SYNTHETIC Case C',
      routeId: w.route.id,
    });
    await render(api, `/cases/${w.bound.id}`);
    await waitFor(() => q('[data-testid="case-sources"]') !== null, 'A links');
    await waitFor(() => q('[data-testid="case-selections"]') !== null, 'A selections');
    expect(pageText()).toContain('SYNTHETIC-A-ONLY scope note');
    expect(pageText()).toContain('SYNTHETIC-A-ONLY selection note');
    // A status message of A, then A's link-state dialog left open with a typed reason.
    await click(byText('button', 'Change workflow state'));
    await waitFor(() => q('dialog[open]') !== null, 'workflow dialog');
    await type('dialog[open] textarea', 'SYNTHETIC-A-ONLY workflow reason');
    await submit(q('dialog[open] form'));
    await until('Workflow state changed to Preparing.');
    await waitFor(() => q('[data-testid="case-sources"]') !== null, 'A links again');
    await click(byText('button', 'Change link state'));
    await waitFor(() => q('dialog[open]') !== null, 'link dialog');
    await type('#case-source-state-reason', 'SYNTHETIC-A-ONLY link reason');
    // Straight to case B (same page, other case), as history navigation would do.
    await go(`/cases/${w.unbound.id}`);
    await waitFor(
      () => q('[data-testid="case-detail"] h1')?.textContent === 'SYNTHETIC Case B',
      'B detail',
    );
    await until('No source is linked to this case.');
    await until('No authority materials have been selected for evaluation in this case.');
    expect(pageText()).not.toContain('SYNTHETIC-A-ONLY');
    expect(pageText()).not.toContain('SYNTHETIC Case A');
    expect(pageText()).not.toContain('Workflow state changed');
    expect(q('dialog[open]')).toBeNull();
    expect(q('[data-testid="selection-in-use"]')).toBeNull();
    // Nothing was sent for A's open dialog.
    expect(bodies(api, 'POST', `/case-sources/${linkA.id}/link-state`)).toHaveLength(0);
    // A half-filled selection for A leaves nothing in the selection form of case C.
    await go(`/cases/${w.bound.id}/authority-selections/new`);
    await waitFor(() => all('[data-testid="coverage-candidate"]').length === 3, 'A form');
    await type('#select-selectionNote', 'SYNTHETIC-A-ONLY draft note');
    await type('#select-intendedFromEmail', 'synthetic-a-only@example.invalid');
    await type('#select-signerId', w.signer.id);
    await click(q(`#select-coverage-${w.coverage.id}`) as HTMLElement);
    await waitFor(() => q(`#select-scope-${w.coverage.id}`) !== null, 'A scope');
    await type(`#select-scope-${w.coverage.id}`, 'SYNTHETIC-A-ONLY scope');
    await go(`/cases/${caseC.id}/authority-selections/new`);
    await waitFor(
      () => (q('[data-testid="chain-summary"]')?.textContent ?? '').includes('SYNTHETIC Case C'),
      'C form',
    );
    await waitFor(() => all('[data-testid="coverage-candidate"]').length === 3, 'C candidates');
    expect((q('#select-selectionNote') as HTMLTextAreaElement).value).toBe('');
    expect((q('#select-intendedFromEmail') as HTMLInputElement).value).toBe('');
    expect((q('#select-signerId') as HTMLSelectElement).value).toBe('');
    expect((q(`#select-coverage-${w.coverage.id}`) as HTMLInputElement).checked).toBe(false);
    expect(q(`#select-scope-${w.coverage.id}`)).toBeNull();
    expect(pageText()).not.toContain('SYNTHETIC-A-ONLY');
    expect(bodies(api, 'POST', '/authority-selections')).toHaveLength(0);
    // The link form: a source chosen for A is not carried to B, and B is offered B's sources.
    await go(`/cases/${w.bound.id}/sources/new`);
    await waitFor(
      () => optionValues('#case-source-sourceId').includes(w.scopedToA.id),
      'A link form',
    );
    await type('#case-source-sourceId', w.scopedToA.id);
    await type('#case-source-useRole', 'SYNTHETIC-A-ONLY role');
    await type('#case-source-scopeNote', 'SYNTHETIC-A-ONLY note');
    await go(`/cases/${w.unbound.id}/sources/new`);
    await waitFor(
      () => optionValues('#case-source-sourceId').includes(w.scopedToB.id),
      'B link form',
    );
    expect((q('#case-source-sourceId') as HTMLSelectElement).value).toBe('');
    expect((q('#case-source-useRole') as HTMLInputElement).value).toBe('');
    expect((q('#case-source-scopeNote') as HTMLTextAreaElement).value).toBe('');
    expect(optionValues('#case-source-sourceId')).not.toContain(w.scopedToA.id);
    expect(bodies(api, 'POST', '/sources')).toHaveLength(0);
    // Route options belong to each case's own agency.
    const caseD = api.seed('CaseRecord', { agencyId: w.other.id, intakeLabel: 'SYNTHETIC Case D' });
    await go(`/cases/${w.bound.id}`);
    await waitFor(() => q('[data-testid="case-detail"]') !== null, 'A again');
    await click(byText('button', 'Correct the route binding'));
    await waitFor(() => q('dialog[open] input[name="case-route"]') !== null, 'A route options');
    await go(`/cases/${caseD.id}`);
    await waitFor(
      () => q('[data-testid="case-detail"] h1')?.textContent === 'SYNTHETIC Case D',
      'D detail',
    );
    expect(q('dialog[open]')).toBeNull();
    await click(byText('button', 'Bind a route'));
    await waitFor(() => q('dialog[open] input[name="case-route"]') !== null, 'D route options');
    const offered = (all('dialog[open] input[name="case-route"]') as HTMLInputElement[]).map(
      (radio) => radio.value,
    );
    expect(offered).toEqual([w.otherRoute.id]);
  });

  it('reads a selection back after a reload: the exact pinned coverage and each application scope, nothing re-evaluated, not a G1 decision', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    const scopes = new Map([
      [w.coverage.id, '  SYNTHETIC-SCOPE-1 channel uploads\n  second line kept  '],
      [w.preferred.id, 'SYNTHETIC-SCOPE-2 caf\u00e9 / cafe\u0301 “quoted” 𝄞'],
    ]);
    await render(api, `/cases/${w.bound.id}/authority-selections/new`);
    await waitFor(() => all('[data-testid="coverage-candidate"]').length === 3, 'candidates');
    await type('#select-signerId', w.signer.id);
    for (const [coverageId, scope] of scopes) {
      await click(q(`#select-coverage-${coverageId}`) as HTMLElement);
      await waitFor(() => q(`#select-scope-${coverageId}`) !== null, `scope ${coverageId}`);
      await type(`#select-scope-${coverageId}`, scope);
    }
    await type('#select-taskType', 'NMI_REPLY');
    await type('#select-intendedFromEmail', 'synthetic-sender@example.invalid');
    await type('#select-selectionNote', 'SYNTHETIC evaluate both coverages');
    await submit(q('form.record-form'));
    await until('Authority materials selected for evaluation. This is not a G1 decision.');
    const [recorded] = api.selections;
    const selectionId = String(recorded?.id);
    // Present-day authority state moves on after the selection: another preferred coverage and an
    // archived mandate. The read-back shows what was pinned, not today's state.
    Object.assign(api.rows.Route.get(w.route.id) ?? {}, {
      preferredCoverageId: w.unrecordedCoverage.id,
    });
    Object.assign(api.rows.Mandate.get(w.mandate.id) ?? {}, { archivedAt: 'NOW-SYNTHETIC' });
    // A reload: all page state is discarded; only the stored records remain.
    await unmount();
    const writesBefore = api.writes().length;
    await render(api, `/cases/${w.bound.id}`);
    await waitFor(() => q('[data-testid="case-selections"]') !== null, 'history');
    const open = byText('[data-testid="case-selections"] a', 'Open selection');
    expect(open.getAttribute('href')).toBe(
      `/cases/${w.bound.id}/authority-selections/${selectionId}`,
    );
    expect(open.getAttribute('aria-label')).toMatch(/^Open selection recorded /);
    await click(open);
    await waitFor(() => all('[data-testid="pinned-coverage"]').length === 2, 'pinned coverage');
    const detail = () => q('[data-testid="selection-detail"]')?.textContent ?? '';
    expect(q('[data-testid="selection-meaning"]')?.textContent).toBe(SELECTION_MEANING);
    expect(q('[data-testid="selection-id"]')?.textContent).toBe(selectionId);
    await until('SYNTHETIC YouTube coverage');
    await until('SYNTHETIC preferred coverage');
    await until('SYNTHETIC Brand · SYNTHETIC Subject LLC (YouTube)');
    expect(detail()).toContain('SYNTHETIC Signer');
    expect(detail()).toContain('synthetic-sender@example.invalid');
    expect(detail()).toContain('SYNTHETIC evaluate both coverages');
    expect(detail()).toContain('In use for evaluation');
    expect(detail()).toContain('you (application user)');
    // Exactly the stored rows, in ascending coverageId order, each scope byte for byte.
    const ids = all('[data-testid="pinned-coverage-id"]').map((element) => element.textContent);
    expect(ids).toEqual([...scopes.keys()].sort());
    const shown = all('[data-testid="pinned-scope"]').map((element) => element.textContent);
    expect(shown).toEqual([...scopes.keys()].sort().map((id) => scopes.get(id)));
    expect(detail()).not.toContain('SYNTHETIC coverage of another signer');
    // F4 (R8 browser pass): the pinned rows are a record list. A timeline entry is a two-column
    // grid (when | body); an entry without its "when" column squeezed its body into the narrow
    // first column at desktop widths, one character per line.
    expect(q('[data-testid="pinned-coverages"]')?.classList.contains('timeline')).toBe(false);
    for (const item of all('.timeline-item')) {
      expect(item.querySelector(':scope > .timeline-when')).not.toBeNull();
    }
    for (const stamp of stampTexts()) expect(stamp).not.toMatch(FORBIDDEN_STAMPS);
    expect(detail()).not.toMatch(
      /\b(authorized|approved|g1 pass|eligible|ready to sign|archived)\b/i,
    );
    // One read, no write: the read-back is a GET of the contracted operation.
    expect(api.writes()).toHaveLength(writesBefore);
    expect(
      api.requests.some(
        (request) =>
          request.method === 'GET' &&
          request.path === `/api/v1/cases/${w.bound.id}/authority-selections/${selectionId}`,
      ),
    ).toBe(true);
    // Another reload straight onto the selection's address shows the same record.
    await unmount();
    await render(api, `/cases/${w.bound.id}/authority-selections/${selectionId}`);
    await waitFor(() => all('[data-testid="pinned-scope"]').length === 2, 'deep link');
    expect(all('[data-testid="pinned-scope"]').map((element) => element.textContent)).toEqual(
      shown,
    );
    expect(api.writes()).toHaveLength(writesBefore);
  });

  it('a selection is shown only under its own case: another case’s address shows not found and nothing of it', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    const selectionA = api.seedSelection(
      {
        caseId: w.bound.id,
        agencyId: w.agency.id,
        routeId: w.route.id,
        signerId: w.signer.id,
        selectionNote: 'SYNTHETIC-A-ONLY selection note',
      },
      [{ coverageId: w.coverage.id, applicationScope: 'SYNTHETIC-A-ONLY scope' }],
    );
    const caseC = api.seed('CaseRecord', {
      agencyId: w.agency.id,
      intakeLabel: 'SYNTHETIC Case C',
      routeId: w.route.id,
    });
    await render(api, `/cases/${caseC.id}/authority-selections/${selectionA.id}`);
    await waitFor(() => q('[data-testid="selection-not-found"]') !== null, 'not found');
    expect(q('[data-testid="selection-not-found"]')?.textContent).toContain(
      'A selection is shown only under the case it was made for.',
    );
    expect(pageText()).not.toContain('SYNTHETIC-A-ONLY');
    expect(q('[data-testid="pinned-coverage"]')).toBeNull();
    // In place to case A's own address, then back to C's: nothing of A stays on C's page.
    await go(`/cases/${w.bound.id}/authority-selections/${selectionA.id}`);
    await waitFor(() => q('[data-testid="pinned-scope"]') !== null, 'A selection');
    expect(q('[data-testid="pinned-scope"]')?.textContent).toBe('SYNTHETIC-A-ONLY scope');
    await go(`/cases/${caseC.id}/authority-selections/${selectionA.id}`);
    await waitFor(() => q('[data-testid="selection-not-found"]') !== null, 'not found again');
    expect(pageText()).not.toContain('SYNTHETIC-A-ONLY');
    await go(`/cases/${w.bound.id}/authority-selections/00000000-0000-4000-8000-00000000dead`);
    await waitFor(() => q('[data-testid="selection-not-found"]') !== null, 'unknown');
    expect(api.writes()).toHaveLength(0);
  });

  it('the source form can name cases; case scope is sent exactly as chosen', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    await render(api, '/sources/new');
    await waitFor(() => q('#source-title') !== null, 'form');
    await until('SYNTHETIC Case A');
    expect(pageText()).not.toContain('Case scope cannot be recorded before cases exist.');
    expect(pageText()).toContain(
      'A source that names cases applies only to those cases — to no directory, route or authority record.',
    );
    await type('#source-title', 'SYNTHETIC case packet');
    await type('#source-sourceRole', 'OPERATOR_INPUT');
    await type('#source-scopeText', 'SYNTHETIC scope');
    const caseBox = all('.checkbox-list label')
      .find((label) => label.textContent?.includes('SYNTHETIC Case A'))
      ?.querySelector('input') as HTMLInputElement;
    await click(caseBox);
    await submit(q('form.record-form'));
    await waitFor(() => bodies(api, 'POST', '/api/v1/sources').length === 1, 'created');
    const [created] = bodies(api, 'POST', '/api/v1/sources');
    const scope = (created?.body as { scopeBindings?: unknown } | undefined)?.scopeBindings;
    expect(scope).toEqual({ caseIds: [w.bound.id] });
  });
});
