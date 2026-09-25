// @vitest-environment happy-dom
// UI: the P2 Directory pages against a synthetic in-memory API (fake fetch) that enforces the same
// request contract as the server — session CSRF token, one Idempotency-Key per write, and the exact
// If-Match ETag of the precondition target (428 missing, 412 stale). Covers list/empty/loading/error
// states, create/edit/validation, archive/restore/state dialogs, delete confirmation and refusal,
// version conflicts, deferred canonical binding, owner ↔ subject linking, signers, focus handling,
// CSRF refresh and session loss. All data is synthetic.
import { describe, expect, it } from 'vitest';
import {
  FakeDirectory,
  IDENTITY_FIELDS,
  all,
  byText,
  claimTexts,
  click,
  pageText,
  q,
  render,
  submit,
  type,
  unmount,
  until,
  waitFor,
} from './support.js';

describe('P2 directory UI', () => {
  it('lists agencies with loading, empty and failure states, and reaches the list from the shell', async () => {
    const api = new FakeDirectory();
    api.holdLists = true;
    await render(api, '/directory');
    await waitFor(() => q('[data-testid="loading"]') !== null, 'loading');
    expect(q('[data-testid="loading"]')?.getAttribute('role')).toBe('status');
    expect(pageText()).toContain('Loading agencies…');
    await unmount();

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
    await unmount();

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
    await unmount();
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

  it('canonical binding offers only this agency’s current canonical records and sends the exact binding with If-Match', async () => {
    const api = new FakeDirectory();
    const agency = api.seed('Agency', { displayName: 'SYNTHETIC Binding' });
    const other = api.seed('Agency', { displayName: 'SYNTHETIC Other' });
    const own = api.seedSource({ agencyId: agency.id, title: 'SYNTHETIC own registry record' });
    api.seedSource({ agencyId: other.id, title: 'SYNTHETIC other agency record' });
    api.seedSource({
      agencyId: agency.id,
      title: 'SYNTHETIC own draft',
      sourceRole: 'DERIVED_DRAFT',
    });
    api.seedSource({ title: 'SYNTHETIC public record' });
    await render(api, `/directory/agencies/${agency.id}`);
    await waitFor(() => q('[data-testid="agency-detail"]') !== null, 'detail');
    expect(pageText()).toContain('No canonical binding: this agency is local only.');
    await click(byText('button', 'Bind canonical source'));
    await until('SYNTHETIC own registry record');
    const dialog = q('dialog[open]');
    expect(dialog?.textContent).not.toContain('SYNTHETIC other agency record');
    expect(dialog?.textContent).not.toContain('SYNTHETIC own draft');
    expect(dialog?.textContent).not.toContain('SYNTHETIC public record');
    expect(dialog?.textContent).toContain('does not establish rights, authority, eligibility');
    await click(q(`input[value="${own.id}"]`) as HTMLElement);
    await type('#bind-canonicalCode', 'SYN-AG-7');
    await type('#bind-reason', 'synthetic registry code');
    await submit(q('dialog[open] form'));
    await until('Canonical source bound.');
    const [write] = api.writes();
    expect(write?.path).toBe(`/api/v1/agencies/${agency.id}/canonical-bindings`);
    expect(write?.headers['If-Match']).toBe(`"Agency:${agency.id}:v1"`);
    expect(write?.body).toEqual({
      canonicalCode: 'SYN-AG-7',
      sourceId: own.id,
      reason: 'synthetic registry code',
    });
    expect(pageText()).toContain('Canonical code SYN-AG-7');
    // Bound: no second binding is offered.
    expect(all('button').some((button) => button.textContent === 'Bind canonical source')).toBe(
      false,
    );
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
    await unmount();
    await render(api, `/directory/signers/${signerId}/edit`);
    await waitFor(() => q('#signer-title') !== null, 'edit form');
    expect(q('#signer-agencyId')).toBeNull();
    expect(pageText()).toContain(
      'Fixed: a person acting for another agency needs a separate signer record.',
    );
  });

  it('the signer state dialog states that no state carries authority', async () => {
    const api = new FakeDirectory();
    const agency = api.seed('Agency', { displayName: 'SYNTHETIC Agency for state' });
    const signer = api.seed('Signer', {
      agencyId: agency.id,
      fullLegalName: 'SYNTHETIC Signer State',
    });
    await render(api, `/directory/signers/${signer.id}`);
    await waitFor(
      () => all('button').some((button) => button.textContent === 'Change operational state'),
      'state action',
    );
    await click(byText('button', 'Change operational state'));
    await waitFor(() => q('dialog[open]') !== null, 'state dialog');
    const dialog = q('dialog[open]');
    expect(dialog?.textContent).toContain(
      'No state gives mandate coverage, eligibility, G7 clearance, signature authority or the right to adopt a notice.',
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
    await unmount();
    await render(api, `/directory/legal-subjects/${id}/edit`);
    await waitFor(() => q('#subject-legalName') !== null, 'edit');
    expect(q('#subject-subjectType')).toBeNull();
    expect(pageText()).toContain('Fixed: a different kind of party needs its own record.');
  });

  it('locks every identity field of an active agency, empty ones included, and still saves contact changes', async () => {
    const api = new FakeDirectory();
    const agency = api.seed('Agency', {
      displayName: 'SYNTHETIC Active',
      legalName: 'SYNTHETIC Active Ltd',
      recordState: 'ACTIVE',
    });
    await render(api, `/directory/agencies/${agency.id}/edit`);
    await waitFor(() => q('#agency-legalName') !== null, 'form');
    for (const name of IDENTITY_FIELDS.Agency ?? []) {
      expect((q(`#agency-${name}`) as HTMLInputElement).readOnly, name).toBe(true);
    }
    expect(pageText()).toContain('Locked: this agency is established');
    await type('#agency-phone', '+84 28 0000 0003');
    await submit(q('form.record-form'));
    await waitFor(() => q('[data-testid="agency-detail"]') !== null, 'saved');
    expect(api.writes().map((request) => request.body)).toEqual([{ phone: '+84 28 0000 0003' }]);
  });

  it('a draft agency the server reports as established: the fill is refused, every identity field locks, contact still saves', async () => {
    const api = new FakeDirectory();
    const agency = api.seed('Agency', {
      displayName: 'SYNTHETIC Referenced',
      legalName: 'SYNTHETIC Referenced Ltd',
    });
    api.established.set(agency.id, ['REFERENCED_BY:signers.agency_id']);
    await render(api, `/directory/agencies/${agency.id}/edit`);
    await waitFor(() => q('#agency-registrationNumber') !== null, 'form');
    // Nothing on the page shows the signer reference, so the form starts editable.
    expect((q('#agency-registrationNumber') as HTMLInputElement).readOnly).toBe(false);
    await type('#agency-registrationNumber', 'SYN-REG-9');
    await type('#agency-phone', '+84 28 0000 0004');
    await submit(q('form.record-form'));
    await until(
      "This agency's identity can't be filled in, changed or cleared here because signers belong to it.",
    );
    for (const name of IDENTITY_FIELDS.Agency ?? []) {
      expect((q(`#agency-${name}`) as HTMLInputElement).readOnly, name).toBe(true);
    }
    expect((q('#agency-registrationNumber') as HTMLInputElement).value).toBe('');
    expect((q('#agency-legalName') as HTMLInputElement).value).toBe('SYNTHETIC Referenced Ltd');
    expect((q('#agency-phone') as HTMLInputElement).value).toBe('+84 28 0000 0004');
    await submit(q('form.record-form'));
    await waitFor(() => q('[data-testid="agency-detail"]') !== null, 'saved');
    expect(api.writes().map((request) => request.body)).toEqual([
      { registrationNumber: 'SYN-REG-9', phone: '+84 28 0000 0004' },
      { phone: '+84 28 0000 0004' },
    ]);
    expect(api.rows.Agency.get(agency.id)?.['registrationNumber']).toBeNull();
  });

  it('locks every identity field of an active legal subject, empty ones included', async () => {
    const api = new FakeDirectory();
    const subject = api.seed('LegalSubject', {
      legalName: 'SYNTHETIC Active Subject LLC',
      recordState: 'ACTIVE',
    });
    await render(api, `/directory/legal-subjects/${subject.id}/edit`);
    await waitFor(() => q('#subject-legalName') !== null, 'form');
    for (const name of IDENTITY_FIELDS.LegalSubject ?? []) {
      expect((q(`#subject-${name}`) as HTMLInputElement).readOnly, name).toBe(true);
    }
    expect(pageText()).toContain('Locked: this subject is established');
    await type('#subject-contactEmail', 'subject@example.invalid');
    await submit(q('form.record-form'));
    await waitFor(() => q('[data-testid="legal-subject-detail"]') !== null, 'saved');
    expect(api.writes().map((request) => request.body)).toEqual([
      { contactEmail: 'subject@example.invalid' },
    ]);
  });

  it('keeps the application boundary visible: the directory never offers sign, send or login actions', async () => {
    const api = new FakeDirectory();
    const agency = api.seed('Agency', { displayName: 'SYNTHETIC Boundary' });
    await render(api, `/directory/agencies/${agency.id}`);
    await waitFor(() => q('[data-testid="agency-detail"]') !== null, 'detail');
    const labels = all('button, a').flatMap((element) =>
      claimTexts(element).map((text) => text.toLowerCase()),
    );
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
