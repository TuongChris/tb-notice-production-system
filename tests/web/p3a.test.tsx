// @vitest-environment happy-dom
// UI (P3A): Sources, canonical bindings and Routes against the synthetic in-memory API
// (support.tsx). Covers the source capture boundary (nothing inferred, no invented fields, no
// provenance upgrade), revision chains, scoped source pickers for every binding target, refusals,
// identity locks after binding, route creation from explicit choices, link state, archive/restore,
// delete eligibility, version conflicts, keyboard focus and the absence of authority wording. All
// data is synthetic.
import { describe, expect, it } from 'vitest';
import {
  all,
  byText,
  claimTexts,
  click,
  FakeDirectory,
  IDENTITY_FIELDS,
  pageText,
  q,
  render,
  submit,
  type,
  unmount,
  until,
  waitFor,
} from './support.js';

/** Status-like wording a source, binding or route must never display. */
const AUTHORITY_WORDS = /\b(authori[sz]ed|ready|eligible|verified|approved|g1 pass)\b/i;

function stampTexts(): string[] {
  return all('.stamp').map((stamp) => stamp.textContent ?? '');
}

async function select(selector: string, value: string, label: string): Promise<void> {
  await waitFor(
    () =>
      [...((q(selector) as HTMLSelectElement | null)?.options ?? [])].some(
        (o) => o.value === value,
      ),
    label,
  );
  await type(selector, value);
}

describe('P3A sources UI', () => {
  it('lists current revisions as pointers: kind, owner, access and reported provenance', async () => {
    const api = new FakeDirectory();
    const agency = api.seed('Agency', { displayName: 'SYNTHETIC Agency' });
    const first = api.seedSource({ title: 'SYNTHETIC registry extract', agencyId: agency.id });
    api.seedSource({
      title: 'SYNTHETIC registry extract (rev 2)',
      agencyId: agency.id,
      sourceGroupId: first['sourceGroupId'],
      revision: 2,
      supersedesSourceId: first.id,
      accessState: 'ACCESSIBLE_AT_CHECK',
    });
    await render(api, '/sources');
    await until('SYNTHETIC registry extract (rev 2)');
    expect(pageText()).toContain(
      'Recording it proves nothing, reviews nothing and fetches nothing.',
    );
    const rows = all('table.records tbody tr');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain('Canonical record');
    expect(rows[0]?.textContent).toContain('Accessible when checked');
    expect(rows[0]?.textContent).toContain('Operator reported');
    await until('SYNTHETIC Agency');
  });

  it('records a source with exactly what was entered: no invented fields, no upgraded provenance', async () => {
    const api = new FakeDirectory();
    await render(api, '/sources/new');
    await waitFor(() => q('#source-title') !== null, 'form');
    await submit(q('form.record-form'));
    expect(pageText()).toContain('Enter a title.');
    expect(pageText()).toContain('Choose what kind of source this is.');
    expect(pageText()).toContain('Describe what the source covers.');
    expect(document.activeElement?.id).toBe('source-title');
    await type('#source-title', '  SYNTHETIC Drive record  ');
    await type('#source-sourceRole', 'OPERATOR_INPUT');
    await type('#source-scopeText', 'Synthetic: the whole document');
    await type('#source-canonicalUrl', 'https://drive.example.invalid/file/SYN-1');
    await type('#source-reportedProvenance', 'DOCUMENT_REVIEWED');
    await submit(q('form.record-form'));
    expect(pageText()).toContain('Name who reviewed the document');
    await type('#source-contentSha256', 'ABC');
    await submit(q('form.record-form'));
    expect(pageText()).toContain('Use exactly 64 lowercase hexadecimal characters.');
    expect(api.writes()).toHaveLength(0);
    await type('#source-contentSha256', '');
    await type('#source-reportedProvenance', 'OPERATOR_REPORTED');
    await submit(q('form.record-form'));
    await waitFor(() => q('[data-testid="source-detail"]') !== null, 'detail');
    expect(api.writes().map((request) => request.body)).toEqual([
      {
        title: 'SYNTHETIC Drive record',
        sourceRole: 'OPERATOR_INPUT',
        scopeText: 'Synthetic: the whole document',
        accessState: 'NOT_CHECKED',
        reportedProvenance: 'OPERATOR_REPORTED',
        canonicalUrl: 'https://drive.example.invalid/file/SYN-1',
      },
    ]);
    expect(pageText()).toContain('Source recorded.');
    expect(pageText()).toContain('The app never opens or fetches this address.');
    expect(stampTexts().join(' ')).not.toMatch(AUTHORITY_WORDS);
  });

  it('a revision keeps agency and scope, and the earlier revision is shown as superseded', async () => {
    const api = new FakeDirectory();
    const subject = api.seed('LegalSubject', { legalName: 'SYNTHETIC Subject LLC' });
    const first = api.seedSource({
      title: 'SYNTHETIC scoped record',
      scopeBindings: { legalSubjectIds: [subject.id] },
    });
    await render(api, `/sources/${first.id}`);
    await waitFor(() => q('[data-testid="source-detail"]') !== null, 'detail');
    expect(stampTexts()).toContain('Current revision');
    await click(byText('a', 'Record a new revision'));
    await waitFor(() => q('#source-title') !== null, 'revise form');
    expect(pageText()).toContain('Agency and scope stay as they are');
    expect(q('#source-agencyId')).toBeNull();
    await type('#source-providerRevisionId', 'SYN-REV-2');
    await submit(q('form.record-form'));
    await until('Revision 2 recorded.');
    const [write] = api.writes();
    expect(write?.path).toBe(`/api/v1/sources/${first.id}/revisions`);
    expect(write?.headers['If-Match']).toBeUndefined();
    expect(write?.body).toMatchObject({
      agencyId: null,
      scopeBindings: { legalSubjectIds: [subject.id] },
      providerRevisionId: 'SYN-REV-2',
    });
    await unmount();
    await render(api, `/sources/${first.id}`);
    await waitFor(() => q('[data-testid="source-detail"]') !== null, 'old revision');
    expect(stampTexts()).toContain('Superseded');
    expect(pageText()).toContain('A newer revision exists');
    const revise = byText('button', 'Record a new revision');
    expect(revise.getAttribute('aria-disabled')).toBe('true');
  });

  it('a stale revision is refused by the server and explained', async () => {
    const api = new FakeDirectory();
    const first = api.seedSource({ title: 'SYNTHETIC record' });
    await render(api, `/sources/${first.id}/revise`);
    await waitFor(() => q('#source-title') !== null, 'form');
    // Another tab records revision 2 meanwhile.
    api.seedSource({
      sourceGroupId: first['sourceGroupId'],
      revision: 2,
      supersedesSourceId: first.id,
    });
    await submit(q('form.record-form'));
    await until('Only the current revision can be revised.');
  });
});

describe('P3A canonical bindings UI', () => {
  it('an owner is offered only shared, subject-free canonical records; an owner-material refusal is explained', async () => {
    const api = new FakeDirectory();
    const agency = api.seed('Agency', { displayName: 'SYNTHETIC Agency' });
    const subject = api.seed('LegalSubject', { legalName: 'SYNTHETIC Subject' });
    const owner = api.seed('Owner', { displayName: 'SYNTHETIC Brand' });
    const shared = api.seedSource({ title: 'SYNTHETIC brand registry' });
    api.seedSource({ title: 'SYNTHETIC agency record', agencyId: agency.id });
    api.seedSource({
      title: 'SYNTHETIC subject record',
      scopeBindings: { legalSubjectIds: [subject.id] },
    });
    api.bindingRefusals.set(owner.id, {
      status: 422,
      code: 'CROSS_OWNER_REFERENCE',
      details: { field: 'sourceId', ownerId: 'x' },
    });
    await render(api, `/directory/owners/${owner.id}`);
    await waitFor(() => q('[data-testid="owner-detail"]') !== null, 'owner');
    await click(byText('button', 'Bind canonical source'));
    await until('SYNTHETIC brand registry');
    const dialog = q('dialog[open]');
    expect(dialog?.textContent).not.toContain('SYNTHETIC agency record');
    expect(dialog?.textContent).not.toContain('SYNTHETIC subject record');
    expect(dialog?.textContent).toContain('outside this owner namespace’s scope');
    await click(q(`input[value="${shared.id}"]`) as HTMLElement);
    await type('#bind-canonicalCode', 'SYN-OW-1');
    await type('#bind-reason', 'synthetic');
    await submit(q('dialog[open] form'));
    await until('already recorded as another owner’s material');
    expect(api.rows.Owner.get(owner.id)?.['bindingState']).toBe('LOCAL_ONLY');
    for (const text of claimTexts()) expect(text).not.toMatch(/verified copyright owner/i);
  });

  it('a bound legal subject locks every identity field under one notice; its binding shows the source', async () => {
    const api = new FakeDirectory();
    const subject = api.seed('LegalSubject', { legalName: 'SYNTHETIC Subject LLC' });
    const scoped = api.seedSource({
      title: 'SYNTHETIC company registry',
      scopeBindings: { legalSubjectIds: [subject.id] },
    });
    api.seedSource({ title: 'SYNTHETIC unscoped record' });
    await render(api, `/directory/legal-subjects/${subject.id}`);
    await waitFor(() => q('[data-testid="legal-subject-detail"]') !== null, 'subject');
    await click(byText('button', 'Bind canonical source'));
    await until('SYNTHETIC company registry');
    expect(q('dialog[open]')?.textContent).not.toContain('SYNTHETIC unscoped record');
    await click(q(`input[value="${scoped.id}"]`) as HTMLElement);
    await type('#bind-canonicalCode', 'SYN-LS-1');
    await type('#bind-reason', 'synthetic');
    await submit(q('dialog[open] form'));
    await until('Canonical source bound.');
    await until('SYNTHETIC company registry (revision 1)');
    await unmount();
    await render(api, `/directory/legal-subjects/${subject.id}/edit`);
    await waitFor(() => q('#subject-legalName') !== null, 'edit');
    const notices = all('.lock-notice');
    expect(notices).toHaveLength(1);
    for (const name of IDENTITY_FIELDS.LegalSubject ?? []) {
      const input = q(`#subject-${name}`) as HTMLInputElement;
      expect(input.readOnly, name).toBe(true);
      expect(input.getAttribute('aria-describedby') ?? '', name).toContain(
        'subject-identity-locked',
      );
    }
    // One notice for the section, not one per field.
    expect(all('.hint-locked')).toHaveLength(0);
  });

  it('a signer is offered sources of its own agency; once bound, its name locks and other fields stay editable', async () => {
    const api = new FakeDirectory();
    const agency = api.seed('Agency', { displayName: 'SYNTHETIC Agency' });
    const other = api.seed('Agency', { displayName: 'SYNTHETIC Other' });
    const signer = api.seed('Signer', { agencyId: agency.id, fullLegalName: 'SYNTHETIC Signer' });
    const own = api.seedSource({ title: 'SYNTHETIC staff register', agencyId: agency.id });
    api.seedSource({
      title: 'SYNTHETIC shared register',
      scopeBindings: { agencyIds: [agency.id] },
    });
    api.seedSource({ title: 'SYNTHETIC other register', agencyId: other.id });
    await render(api, `/directory/signers/${signer.id}`);
    await waitFor(() => q('[data-testid="signer-detail"]') !== null, 'signer');
    await click(byText('button', 'Bind canonical source'));
    await until('SYNTHETIC staff register');
    const dialog = q('dialog[open]');
    expect(dialog?.textContent).toContain('SYNTHETIC shared register');
    expect(dialog?.textContent).not.toContain('SYNTHETIC other register');
    await click(q(`input[value="${own.id}"]`) as HTMLElement);
    await type('#bind-canonicalCode', 'SYN-SG-1');
    await type('#bind-reason', 'synthetic');
    await submit(q('dialog[open] form'));
    await until('Canonical source bound.');
    await unmount();
    await render(api, `/directory/signers/${signer.id}/edit`);
    await waitFor(() => q('#signer-fullLegalName') !== null, 'edit');
    expect((q('#signer-fullLegalName') as HTMLInputElement).readOnly).toBe(true);
    expect(pageText()).toContain('this signer has a canonical binding');
    expect((q('#signer-title') as HTMLInputElement).readOnly).toBe(false);
    await type('#signer-title', 'SYNTHETIC Director');
    await submit(q('form.record-form'));
    await waitFor(() => q('[data-testid="signer-detail"]') !== null, 'saved');
    expect(api.writes().at(-1)?.body).toEqual({ title: 'SYNTHETIC Director' });
  });

  it('a binding of a record that changed elsewhere is 412: the dialog closes and the conflict notice offers a reload', async () => {
    const api = new FakeDirectory();
    const agency = api.seed('Agency', { displayName: 'SYNTHETIC Agency' });
    const own = api.seedSource({ title: 'SYNTHETIC own record', agencyId: agency.id });
    await render(api, `/directory/agencies/${agency.id}`);
    await waitFor(() => q('[data-testid="agency-detail"]') !== null, 'detail');
    await click(byText('button', 'Bind canonical source'));
    await until('SYNTHETIC own record');
    api.touch('Agency', agency.id, { phone: '+84 28 0000 0000' });
    await click(q(`input[value="${own.id}"]`) as HTMLElement);
    await type('#bind-canonicalCode', 'SYN-AG-9');
    await type('#bind-reason', 'synthetic');
    await submit(q('dialog[open] form'));
    await until('This agency changed after you opened it');
    expect(q('dialog[open]')).toBeNull();
    expect(api.rows.Agency.get(agency.id)?.['bindingState']).toBe('LOCAL_ONLY');
  });

  it('a bound record shows when its source has a newer revision and offers no second binding; archived records cannot bind', async () => {
    const api = new FakeDirectory();
    const agency = api.seed('Agency', { displayName: 'SYNTHETIC Agency' });
    const first = api.seedSource({ title: 'SYNTHETIC record', agencyId: agency.id });
    api.seedSource({
      title: 'SYNTHETIC record (rev 2)',
      agencyId: agency.id,
      sourceGroupId: first['sourceGroupId'],
      revision: 2,
      supersedesSourceId: first.id,
    });
    const bound = api.seed('Agency', {
      displayName: 'SYNTHETIC Bound',
      canonicalCode: 'SYN-B-1',
      canonicalSourceId: first.id,
      bindingState: 'SOURCE_REFERENCED',
    });
    await render(api, `/directory/agencies/${bound.id}`);
    await until('The source now has a newer revision (2).');
    expect(all('button').some((button) => button.textContent === 'Bind canonical source')).toBe(
      false,
    );
    await unmount();
    const archived = api.seed('Agency', {
      displayName: 'SYNTHETIC Archived',
      recordState: 'ARCHIVED',
    });
    await render(api, `/directory/agencies/${archived.id}`);
    await waitFor(() => q('[data-testid="agency-detail"]') !== null, 'archived');
    const action = byText('button', 'Bind canonical source');
    expect(action.getAttribute('aria-disabled')).toBe('true');
    expect(pageText()).toContain('Archived records are read-only. Restore the agency first.');
  });

  it('keyboard: the binding dialog starts in the search field; Escape closes it and returns focus', async () => {
    const api = new FakeDirectory();
    const agency = api.seed('Agency', { displayName: 'SYNTHETIC Agency' });
    await render(api, `/directory/agencies/${agency.id}`);
    await waitFor(() => q('[data-testid="agency-detail"]') !== null, 'detail');
    const opener = byText('button', 'Bind canonical source');
    opener.focus();
    await click(opener);
    await waitFor(() => q('dialog[open]') !== null, 'dialog');
    expect(document.activeElement?.getAttribute('type')).toBe('search');
    const dialog = q('dialog[open]') as HTMLDialogElement;
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    await waitFor(() => q('dialog[open]') === null, 'closed');
    expect(document.activeElement).toBe(opener);
  });
});

describe('P3A routes UI', () => {
  function graph(api: FakeDirectory) {
    const agency = api.seed('Agency', { displayName: 'SYNTHETIC Agency' });
    const other = api.seed('Agency', { displayName: 'SYNTHETIC Other agency' });
    const owner = api.seed('Owner', { displayName: 'SYNTHETIC Brand' });
    const subject = api.seed('LegalSubject', { legalName: 'SYNTHETIC Subject LLC' });
    const paused = api.seed('LegalSubject', { legalName: 'SYNTHETIC Paused LLC' });
    const link = api.seed('OwnerSubject', {
      ownerId: owner.id,
      legalSubjectId: subject.id,
    });
    const pausedLink = api.seed('OwnerSubject', {
      ownerId: owner.id,
      legalSubjectId: paused.id,
      linkState: 'PAUSED',
    });
    const signer = api.seed('Signer', { agencyId: agency.id, fullLegalName: 'SYNTHETIC Signer' });
    api.seed('Signer', {
      agencyId: agency.id,
      fullLegalName: 'SYNTHETIC Ended Signer',
      operationalState: 'ENDED',
    });
    api.seed('Signer', { agencyId: other.id, fullLegalName: 'SYNTHETIC Other Signer' });
    return { agency, other, owner, subject, link, pausedLink, signer };
  }

  it('creates a route from explicit choices only: linked links, signers of the agency, YouTube', async () => {
    const api = new FakeDirectory();
    const { agency, owner, link, pausedLink, signer } = graph(api);
    await render(api, '/representation/routes/new');
    await waitFor(() => q('#route-agencyId') !== null, 'form');
    expect(pageText()).toContain('nothing is matched from names');
    await submit(q('form.record-form'));
    expect(pageText()).toContain('Choose the agency.');
    expect(api.writes()).toHaveLength(0);
    await select('#route-agencyId', agency.id, 'agencies');
    await select('#route-ownerId', owner.id, 'owners');
    await waitFor(
      () => (q('#route-ownerSubjectId') as HTMLSelectElement).options.length > 2,
      'links',
    );
    const linkOptions = [...(q('#route-ownerSubjectId') as HTMLSelectElement).options];
    expect(linkOptions.find((option) => option.value === pausedLink.id)?.disabled).toBe(true);
    await type('#route-ownerSubjectId', link.id);
    await waitFor(
      () =>
        [...(q('#route-defaultSignerId') as HTMLSelectElement).options].some(
          (o) => o.value === signer.id,
        ),
      'signers',
    );
    const signerLabels = [...(q('#route-defaultSignerId') as HTMLSelectElement).options].map(
      (option) => option.textContent,
    );
    expect(signerLabels).toEqual(['No default signer', 'SYNTHETIC Signer']);
    await type('#route-defaultSignerId', signer.id);
    await type('#route-casePrefixHint', 'SYN');
    await submit(q('form.record-form'));
    await waitFor(() => q('[data-testid="route-detail"]') !== null, 'detail');
    expect(api.writes().map((request) => request.body)).toEqual([
      {
        agencyId: agency.id,
        ownerSubjectId: link.id,
        platform: 'YOUTUBE',
        defaultSignerId: signer.id,
        casePrefixHint: 'SYN',
      },
    ]);
    await until('Route created (linked).');
    await until('SYNTHETIC Subject LLC');
    const path = q('[aria-label="Route path"]');
    expect(path?.textContent).toContain('SYNTHETIC Agency');
    expect(path?.textContent).toContain('YouTube');
    expect(path?.textContent).toContain('SYNTHETIC Brand');
    // P3B: a new route has no preferred coverage; the default is explained, never adjudicated.
    expect(pageText()).toContain('No preferred coverage');
    expect(pageText()).toContain(
      'Preferred coverage is an operational default. Case authority is determined later.',
    );
    expect(stampTexts().join(' ')).not.toMatch(AUTHORITY_WORDS);
  });

  it('a duplicate route is refused with a way to the existing route', async () => {
    const api = new FakeDirectory();
    const { agency, owner, link } = graph(api);
    const existing = api.seed('Route', { agencyId: agency.id, ownerSubjectId: link.id });
    await render(api, '/representation/routes/new');
    await select('#route-agencyId', agency.id, 'agencies');
    await select('#route-ownerId', owner.id, 'owners');
    await select('#route-ownerSubjectId', link.id, 'links');
    await submit(q('form.record-form'));
    await until('A route for this agency, association and platform already exists.');
    expect(byText('a', 'Open the existing route').getAttribute('href')).toBe(
      `/representation/routes/${existing.id}`,
    );
  });

  it('link state, archive and restore go through explained dialogs with the route ETag', async () => {
    const api = new FakeDirectory();
    const { agency, link } = graph(api);
    const route = api.seed('Route', { agencyId: agency.id, ownerSubjectId: link.id });
    await render(api, `/representation/routes/${route.id}`);
    await waitFor(() => q('[data-testid="route-detail"]') !== null, 'detail');
    await click(byText('button', 'Change link state'));
    await waitFor(() => q('dialog[open]') !== null, 'dialog');
    expect(q('dialog[open]')?.textContent).toContain('No state grants authority.');
    await type('#route-next-state', 'UNLINKED');
    await type('dialog[open] textarea', 'synthetic unlink');
    await submit(q('dialog[open] form'));
    await until('Link state changed to Unlinked.');
    expect(api.writes()[0]).toMatchObject({
      path: `/api/v1/routes/${route.id}/link-state`,
      body: { state: 'UNLINKED', reason: 'synthetic unlink' },
      headers: { 'If-Match': `"Route:${route.id}:v1"` },
    });
    await click(byText('button', 'Archive'));
    await waitFor(() => q('dialog[open]') !== null, 'archive dialog');
    await type('dialog[open] textarea', 'synthetic archive');
    await submit(q('dialog[open] form'));
    await until('Archived.');
    expect(all('button').some((button) => button.textContent === 'Change link state')).toBe(false);
    expect(all('a').some((link) => link.textContent === 'Edit')).toBe(false);
    expect(byText('button', 'Delete unused route').getAttribute('aria-disabled')).toBe('true');
    await click(byText('button', 'Restore'));
    await waitFor(() => q('dialog[open]') !== null, 'restore dialog');
    await type('dialog[open] textarea', 'synthetic restore');
    await submit(q('dialog[open] form'));
    await until('Restored.');
    expect(api.rows.Route.get(route.id)?.['linkState']).toBe('UNLINKED');
  });

  it('an unused route is deleted after confirmation; a bound route cannot be deleted', async () => {
    const api = new FakeDirectory();
    const { agency, link } = graph(api);
    const route = api.seed('Route', { agencyId: agency.id, ownerSubjectId: link.id });
    await render(api, `/representation/routes/${route.id}`);
    await waitFor(() => q('[data-testid="route-detail"]') !== null, 'detail');
    await click(byText('button', 'Delete unused route'));
    await waitFor(() => q('dialog[open]') !== null, 'confirm');
    expect(document.activeElement?.textContent).toBe('Keep it');
    await click(byText('button', 'Delete route'));
    await until('Unused route deleted.');
    expect(api.rows.Route.has(route.id)).toBe(false);
    await unmount();
    const bound = api.seed('Route', {
      agencyId: agency.id,
      ownerSubjectId: link.id,
      canonicalCode: 'SYN-RT-1',
      canonicalSourceId: api.seedSource({ agencyId: agency.id }).id,
      bindingState: 'SOURCE_REFERENCED',
    });
    await render(api, `/representation/routes/${bound.id}`);
    await waitFor(() => q('[data-testid="route-detail"]') !== null, 'bound');
    expect(byText('button', 'Delete unused route').getAttribute('aria-disabled')).toBe('true');
    expect(pageText()).toContain('This route has a canonical binding');
  });

  it('editing keeps the path fixed, sends only changed fields, and a stale ETag shows the conflict notice', async () => {
    const api = new FakeDirectory();
    const { agency, link } = graph(api);
    const route = api.seed('Route', { agencyId: agency.id, ownerSubjectId: link.id });
    await render(api, `/representation/routes/${route.id}/edit`);
    await waitFor(() => q('#route-casePrefixHint') !== null, 'edit');
    expect(q('#route-agencyId')).toBeNull();
    expect(pageText()).toContain('Path (fixed)');
    await submit(q('form.record-form'));
    expect(pageText()).toContain('Nothing to save: no field was changed.');
    await type('#route-casePrefixHint', 'SYN-2');
    api.touch('Route', route.id, { notes: 'changed in another tab' });
    await submit(q('form.record-form'));
    await until('This route changed after you opened it');
    await click(byText('button', 'Load latest version'));
    await waitFor(
      () => (q('#route-notes') as HTMLTextAreaElement | null)?.value === 'changed in another tab',
      'reloaded',
    );
    await type('#route-casePrefixHint', 'SYN-2');
    await submit(q('form.record-form'));
    await waitFor(() => q('[data-testid="route-detail"]') !== null, 'saved');
    expect(api.writes().at(-1)?.body).toEqual({ casePrefixHint: 'SYN-2' });
  });

  it('an owner–subject link lists its routes and offers a prefilled new route', async () => {
    const api = new FakeDirectory();
    const { agency, owner, link } = graph(api);
    api.seed('Route', { agencyId: agency.id, ownerSubjectId: link.id });
    await render(api, `/directory/owner-subjects/${link.id}`);
    await until('SYNTHETIC Agency · YouTube');
    expect(byText('a', 'Create a route').getAttribute('href')).toBe(
      `/representation/routes/new?ownerId=${owner.id}&ownerSubjectId=${link.id}`,
    );
  });

  it('an agency filter without matches says so and offers the full list, for routes and sources', async () => {
    const api = new FakeDirectory();
    const { agency, other, link } = graph(api);
    api.seed('Route', { agencyId: agency.id, ownerSubjectId: link.id });
    await render(api, `/representation/routes?agencyId=${other.id}`);
    await until('No routes for this agency.');
    expect(pageText()).not.toContain('No routes yet.');
    await click(byText('button', 'Show all agencies'));
    await waitFor(() => all('table.records tbody tr').length === 1, 'all routes');
    await unmount();
    api.seedSource({ title: 'SYNTHETIC own source', agencyId: agency.id });
    await render(api, `/sources?agencyId=${other.id}`);
    await until('No sources belong to this agency or are shared with it.');
    expect(pageText()).not.toContain('No sources recorded yet.');
    await click(byText('button', 'Show all sources'));
    await waitFor(() => all('table.records tbody tr').length === 1, 'all sources');
  });

  it('the Representation section offers routes and (since P3B) mandates', async () => {
    const api = new FakeDirectory();
    await render(api, '/representation');
    await until('No routes yet.');
    expect(q('[data-testid="unavailable-subsection"]')).toBeNull();
    const nav = q('nav[aria-label="Representation"]');
    expect(
      [...(nav?.querySelectorAll('a') ?? [])].map((link) => link.getAttribute('href')),
    ).toEqual(['/representation/routes', '/representation/mandates']);
  });
});
