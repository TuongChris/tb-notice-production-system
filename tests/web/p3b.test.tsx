// @vitest-environment happy-dom
// UI (P3B): mandates, versions, freeze, coverage, coverage signers, authority events and a route's
// preferred coverage against the synthetic in-memory API (support.tsx). Covers the hierarchy,
// explicit choices only (no derived route, signer or date), scoped pickers, the exact payloads and
// preconditions, the freeze dialog's meaning, frozen immutability, version conflicts, recorded vs
// effective dates, provenance without upgrade, keyboard focus and the absence of authority wording.
// All data is synthetic.
import { describe, expect, it } from 'vitest';
import {
  all,
  byText,
  click,
  FakeDirectory,
  pageText,
  q,
  render,
  submit,
  type,
  until,
  waitFor,
} from './support.js';

/** Status-like wording an authority record must never display as its state. */
const AUTHORITY_WORDS = /\b(authori[sz]ed|ready|eligible|verified|approved|valid|current|g1|g7)\b/i;
/** Signer labels the neutral wording rule forbids (mission §14). */
const SIGNER_CLAIMS = /authori[sz]ed signer|approved signer|ready to sign|eligible for notice/i;

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

function optionValues(selector: string): string[] {
  return [...((q(selector) as HTMLSelectElement | null)?.options ?? [])].map((o) => o.value);
}

function world(api: FakeDirectory) {
  const agency = api.seed('Agency', { displayName: 'SYNTHETIC Agency' });
  const other = api.seed('Agency', { displayName: 'SYNTHETIC Other Agency' });
  const owner = api.seed('Owner', { displayName: 'SYNTHETIC Brand' });
  const subject = api.seed('LegalSubject', { legalName: 'SYNTHETIC Subject LLC' });
  const link = api.seed('OwnerSubject', { ownerId: owner.id, legalSubjectId: subject.id });
  const route = api.seed('Route', { agencyId: agency.id, ownerSubjectId: link.id });
  const otherSubject = api.seed('LegalSubject', { legalName: 'SYNTHETIC Other Subject' });
  const otherLink = api.seed('OwnerSubject', {
    ownerId: owner.id,
    legalSubjectId: otherSubject.id,
  });
  const otherRoute = api.seed('Route', { agencyId: other.id, ownerSubjectId: otherLink.id });
  const signer = api.seed('Signer', { agencyId: agency.id, fullLegalName: 'SYNTHETIC Signer' });
  const source = api.seedSource({ agencyId: agency.id, title: 'SYNTHETIC agreement' });
  const otherSource = api.seedSource({ agencyId: other.id, title: 'SYNTHETIC other agreement' });
  const mandate = api.seed('Mandate', {
    agencyId: agency.id,
    label: 'SYNTHETIC Representation agreement',
  });
  return {
    agency,
    other,
    owner,
    subject,
    link,
    route,
    otherSubject,
    otherRoute,
    signer,
    source,
    otherSource,
    mandate,
  };
}

function version(
  api: FakeDirectory,
  mandate: { id: string; agencyId?: unknown },
  fields: Record<string, unknown> = {},
) {
  return api.seed('MandateVersion', {
    mandateId: mandate.id,
    agencyId: mandate.agencyId,
    ...fields,
  });
}

function coverage(
  api: FakeDirectory,
  versionRow: { id: string; agencyId?: unknown },
  routeId: string,
  fields: Record<string, unknown> = {},
) {
  return api.seed('MandateCoverage', {
    mandateVersionId: versionRow.id,
    agencyId: versionRow.agencyId,
    routeId,
    coverageLabel: 'SYNTHETIC YouTube coverage',
    ...fields,
  });
}

describe('P3B mandates UI', () => {
  it('lists mandates and shows the recorded hierarchy: versions → coverage → coverage signers', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    const v1 = version(api, w.mandate, {
      versionState: 'FROZEN',
      frozenAt: '2026-09-24T09:30:00.000Z',
    });
    const c1 = coverage(api, v1, w.route.id);
    api.seed('CoverageSigner', {
      coverageId: c1.id,
      agencyId: w.agency.id,
      signerId: w.signer.id,
      capacity: 'SYNTHETIC Director',
    });
    version(api, w.mandate, { version: 2, changeKind: 'AMENDMENT', predecessorId: v1.id });
    await render(api, '/representation/mandates');
    await until('SYNTHETIC Representation agreement');
    await until('SYNTHETIC Agency');
    expect(pageText()).toContain('A mandate is not authority by existing.');
    await click(byText('a', 'SYNTHETIC Representation agreement'));
    await waitFor(() => q('[data-testid="mandate-detail"]') !== null, 'detail');
    await until('Version 2');
    await until('SYNTHETIC Director');
    await until('SYNTHETIC Brand · SYNTHETIC Subject LLC (YouTube)');
    const tree = q('.authority-tree')?.textContent ?? '';
    expect(tree).toContain('follows version 1');
    expect(tree).toContain('Coverage signer');
    expect(tree).toContain('SYNTHETIC YouTube coverage');
    expect(pageText()).toContain(
      'Nothing here states that authority is current: that is never computed from dates, a frozen state, the highest version number or a missing end date.',
    );
    expect(stampTexts()).toEqual(['Draft', 'Frozen']);
    expect(stampTexts().join(' ')).not.toMatch(AUTHORITY_WORDS);
    expect(tree).not.toMatch(AUTHORITY_WORDS);
    expect(pageText()).not.toMatch(SIGNER_CLAIMS);
  });

  it('creates a mandate from an explicit agency: the label proves nothing and nothing else is sent', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    api.seed('Agency', { displayName: 'SYNTHETIC Archived Agency', recordState: 'ARCHIVED' });
    await render(api, '/representation/mandates/new');
    await waitFor(() => q('#mandate-label') !== null, 'form');
    expect(pageText()).toContain('a label such as “FINAL” or “signed” proves nothing');
    await submit(q('form.record-form'));
    expect(pageText()).toContain('Choose the agency this mandate belongs to.');
    expect(pageText()).toContain('Enter the administrative label.');
    expect(document.activeElement?.id).toBe('mandate-agencyId');
    expect(api.writes()).toEqual([]);
    await waitFor(() => optionValues('#mandate-agencyId').length === 3, 'agencies');
    expect(optionValues('#mandate-agencyId')).toEqual(['', w.agency.id, w.other.id]);
    await type('#mandate-agencyId', w.agency.id);
    await type('#mandate-label', '  SYNTHETIC FINAL signed agreement  ');
    await submit(q('form.record-form'));
    await waitFor(() => q('[data-testid="mandate-detail"]') !== null, 'detail');
    expect(api.writes().map((request) => [request.path, request.body])).toEqual([
      ['/api/v1/mandates', { agencyId: w.agency.id, label: 'SYNTHETIC FINAL signed agreement' }],
    ]);
    await until('Mandate recorded.');
    await until('No version recorded yet.');
    expect(stampTexts()).toEqual([]);
  });

  it('archive is an administrative flag: the dialog says nothing is revoked, and the record becomes read-only', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    await render(api, `/representation/mandates/${w.mandate.id}`);
    await waitFor(() => q('[data-testid="mandate-detail"]') !== null, 'detail');
    expect(byText('a', 'Record a version').getAttribute('href')).toBe(
      `/representation/mandates/${w.mandate.id}/versions/new`,
    );
    await click(byText('button', 'Archive'));
    await waitFor(() => q('dialog[open]') !== null, 'dialog');
    expect(q('dialog[open]')?.textContent).toContain(
      'Nothing is revoked, terminated or recorded as an authority event.',
    );
    await type('dialog[open] textarea', 'synthetic archive');
    await submit(q('dialog[open] form'));
    await until('Archived.');
    expect(api.writes()[0]).toMatchObject({
      path: `/api/v1/mandates/${w.mandate.id}/archive`,
      headers: { 'If-Match': `"Mandate:${w.mandate.id}:v1"` },
    });
    expect(all('a').some((link) => link.textContent === 'Record a version')).toBe(false);
    expect(all('a').some((link) => link.textContent === 'Record authority event')).toBe(false);
    expect(byText('button', 'Delete unused mandate').getAttribute('aria-disabled')).toBe('true');
    expect(api.events).toEqual([]);
  });
});

describe('P3B versions UI', () => {
  it('records a draft version with the Mandate ETag; only in-scope sources and open predecessors are offered', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    const shared = api.seedSource({
      title: 'SYNTHETIC shared registry',
      scopeBindings: { agencyIds: [w.agency.id] },
    });
    const unscoped = api.seedSource({ title: 'SYNTHETIC unscoped public source' });
    const v1 = version(api, w.mandate, { versionState: 'FROZEN' });
    const v2 = version(api, w.mandate, {
      version: 2,
      versionState: 'FROZEN',
      predecessorId: v1.id,
    });
    version(api, w.mandate, { version: 3 });
    await render(api, `/representation/mandates/${w.mandate.id}/versions/new`);
    await waitFor(() => optionValues('#version-predecessorId').length === 2, 'predecessors');
    expect(optionValues('#version-predecessorId')).toEqual(['', v2.id]);
    await waitFor(() => optionValues('#version-primarySourceId').length === 3, 'sources');
    const offered = optionValues('#version-primarySourceId');
    expect(offered).toContain(w.source.id);
    expect(offered).toContain(shared.id);
    expect(offered).not.toContain(w.otherSource.id);
    expect(offered).not.toContain(unscoped.id);
    await type('#version-changeKind', 'AMENDMENT');
    await type('#version-predecessorId', v2.id);
    await type('#version-primarySourceId', w.source.id);
    await type('#version-documentState', 'SIGNED_APPEARING');
    await type('#version-effectiveOn', '2025-03-03');
    await type('#version-changeReason', 'SYNTHETIC amendment capture');
    await submit(q('form.record-form'));
    await waitFor(() => q('[data-testid="version-detail"]') !== null, 'version');
    expect(api.writes()).toHaveLength(1);
    expect(api.writes()[0]).toMatchObject({
      method: 'POST',
      path: `/api/v1/mandates/${w.mandate.id}/versions`,
      headers: { 'If-Match': `"Mandate:${w.mandate.id}:v1"` },
      body: {
        changeKind: 'AMENDMENT',
        changeReason: 'SYNTHETIC amendment capture',
        predecessorId: v2.id,
        primarySourceId: w.source.id,
        documentState: 'SIGNED_APPEARING',
        effectiveOn: '2025-03-03',
      },
    });
    expect(Object.keys(api.writes()[0]?.body as object).sort()).toEqual(
      [
        'changeKind',
        'changeReason',
        'documentState',
        'effectiveOn',
        'predecessorId',
        'primarySourceId',
      ].sort(),
    );
    await until('Version 4 recorded as a draft.');
    expect(pageText()).toContain(
      'A draft snapshot of recorded terms. Complete or not, a draft is not adopted authority.',
    );
    expect(stampTexts()).toEqual(['Draft']);
  });

  it('a claim the server refuses is explained and nothing is saved (document state without its document)', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    await render(api, `/representation/mandates/${w.mandate.id}/versions/new`);
    await waitFor(() => q('#version-changeKind') !== null, 'form');
    await type('#version-changeKind', 'DOCUMENT_CAPTURE');
    await type('#version-documentState', 'DRAFT');
    await type('#version-changeReason', 'SYNTHETIC capture');
    await submit(q('form.record-form'));
    await until('“Draft document” and “Appears signed” describe a document');
    expect(api.rows.MandateVersion.size).toBe(0);
  });

  it('freeze: the dialog says what freezing is and is not; the version then offers no change', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    const draft = version(api, w.mandate);
    coverage(api, draft, w.route.id);
    await render(api, `/representation/versions/${draft.id}`);
    await waitFor(() => q('[data-testid="version-detail"]') !== null, 'version');
    await until('SYNTHETIC YouTube coverage');
    const freezeButton = byText('button', 'Freeze version');
    freezeButton.focus();
    await click(freezeButton);
    await waitFor(() => q('dialog[open]') !== null, 'dialog');
    const dialog = q('dialog[open]')?.textContent ?? '';
    expect(dialog).toContain('Freezing makes this system record immutable.');
    expect(dialog).toContain(
      'Freezing is not a signature, legal approval, owner confirmation, G1 decision or notice adoption, and it does not make any authority current.',
    );
    expect(dialog).toContain('1 coverage');
    expect(document.activeElement?.tagName).toBe('TEXTAREA');
    await submit(q('dialog[open] form'));
    expect(q('dialog[open]')?.textContent).toContain('Enter a reason.');
    expect(api.writes()).toEqual([]);
    await type('dialog[open] textarea', 'SYNTHETIC complete capture');
    await submit(q('dialog[open] form'));
    await until('Version 1 frozen: the record is now immutable.');
    expect(api.writes()[0]).toMatchObject({
      path: `/api/v1/mandate-versions/${draft.id}/freeze`,
      headers: { 'If-Match': `"MandateVersion:${draft.id}:v1"` },
      body: { reason: 'SYNTHETIC complete capture' },
    });
    expect(stampTexts()).toEqual(['Frozen']);
    expect(pageText()).toContain(
      'Frozen means only that the system record is immutable. It is not a signature, legal approval, owner confirmation, G1 decision or current authority.',
    );
    for (const label of ['Edit draft', 'Add coverage']) {
      expect(all('a').some((link) => link.textContent === label)).toBe(false);
    }
    expect(all('button').some((button) => button.textContent === 'Freeze version')).toBe(false);
    expect(byText('a', 'Record a successor version').getAttribute('href')).toBe(
      `/representation/mandates/${w.mandate.id}/versions/new?predecessorId=${draft.id}`,
    );
  });

  it('a freeze with an outdated version shows the conflict notice and freezes nothing', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    const draft = version(api, w.mandate);
    await render(api, `/representation/versions/${draft.id}`);
    await waitFor(() => q('[data-testid="version-detail"]') !== null, 'version');
    api.touch('MandateVersion', draft.id, { validityNotes: 'changed in another tab' });
    await click(byText('button', 'Freeze version'));
    await waitFor(() => q('dialog[open]') !== null, 'dialog');
    await type('dialog[open] textarea', 'SYNTHETIC stale freeze');
    await submit(q('dialog[open] form'));
    await until('This version changed after you opened it');
    expect(api.rows.MandateVersion.get(draft.id)?.['versionState']).toBe('DRAFT');
    await click(byText('button', 'Load latest version'));
    await until('changed in another tab');
  });

  it('a frozen version has no edit form, and a pinned citation says a newer source revision changes nothing', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    api.seedSource({
      agencyId: w.agency.id,
      title: 'SYNTHETIC agreement (rev 2)',
      sourceGroupId: w.source['sourceGroupId'],
      revision: 2,
      supersedesSourceId: w.source.id,
    });
    const frozen = version(api, w.mandate, {
      versionState: 'FROZEN',
      primarySourceId: w.source.id,
      documentState: 'SIGNED_APPEARING',
    });
    await render(api, `/representation/versions/${frozen.id}`);
    await until('the source now has revision 2. The citation does not move to it.');
    await until('Citations are pinned to the exact revisions shown');
    await render(api, `/representation/versions/${frozen.id}/edit`);
    await until('Version 1 is frozen');
    expect(q('form.record-form')).toBeNull();
  });
});

describe('P3B coverage UI', () => {
  it('adds coverage over one exact route of the agency; other agencies’ and archived routes are not offered', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    const archivedOwner = api.seed('Owner', { displayName: 'SYNTHETIC Archived-route owner' });
    const archivedLink = api.seed('OwnerSubject', {
      ownerId: archivedOwner.id,
      legalSubjectId: w.otherSubject.id,
    });
    const archivedRoute = api.seed('Route', {
      agencyId: w.agency.id,
      ownerSubjectId: archivedLink.id,
      archivedAt: '2026-09-24T08:00:00.000Z',
    });
    const otherSubjectSource = api.seedSource({
      title: 'SYNTHETIC other subject material',
      scopeBindings: { agencyIds: [w.agency.id], legalSubjectIds: [w.otherSubject.id] },
    });
    const draft = version(api, w.mandate);
    await render(api, `/representation/versions/${draft.id}/coverages/new`);
    await waitFor(() => optionValues('#coverage-routeId').length === 2, 'routes');
    expect(optionValues('#coverage-routeId')).toEqual(['', w.route.id]);
    expect(optionValues('#coverage-routeId')).not.toContain(w.otherRoute.id);
    expect(optionValues('#coverage-routeId')).not.toContain(archivedRoute.id);
    await submit(q('form.record-form'));
    expect(pageText()).toContain('Choose the exact route this coverage names.');
    expect(document.activeElement?.id).toBe('coverage-routeId');
    await type('#coverage-routeId', w.route.id);
    await waitFor(() => optionValues('#coverage-basisSourceId').includes(w.source.id), 'basis');
    expect(optionValues('#coverage-basisSourceId')).not.toContain(otherSubjectSource.id);
    expect(optionValues('#coverage-basisSourceId')).not.toContain(w.otherSource.id);
    await type('#coverage-coverageLabel', 'SYNTHETIC channel coverage');
    await type('#coverage-territorialScope', 'SYNTHETIC territory as stated');
    await click(q('#coverage-actionScope-PREPARE_NOTICE') as HTMLElement);
    await type('#coverage-basisSourceId', w.source.id);
    await submit(q('form.record-form'));
    await waitFor(() => q('[data-testid="coverage-detail"]') !== null, 'coverage');
    expect(api.writes()[0]).toMatchObject({
      method: 'POST',
      path: `/api/v1/mandate-versions/${draft.id}/coverages`,
      headers: { 'If-Match': `"MandateVersion:${draft.id}:v1"` },
    });
    expect(api.writes()[0]?.body).toEqual({
      routeId: w.route.id,
      coverageLabel: 'SYNTHETIC channel coverage',
      territorialScope: 'SYNTHETIC territory as stated',
      actionScope: ['PREPARE_NOTICE'],
      basisSourceId: w.source.id,
    });
    await until('Coverage recorded in the draft version.');
    await until('SYNTHETIC Subject LLC');
    const path = q('[aria-label="Covered route"]')?.textContent ?? '';
    expect(path).toContain('SYNTHETIC Agency');
    expect(path).toContain('YouTube');
    expect(path).toContain('SYNTHETIC Brand');
    expect(pageText()).toContain('A coverage is not a G1 decision and adjudicates nothing');
    expect(stampTexts().join(' ')).not.toMatch(AUTHORITY_WORDS);
  });

  it('records a coverage signer with neutral wording; other agencies’, archived and ended signers are not offered', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    const ended = api.seed('Signer', {
      agencyId: w.agency.id,
      fullLegalName: 'SYNTHETIC Ended',
      operationalState: 'ENDED',
    });
    const archived = api.seed('Signer', {
      agencyId: w.agency.id,
      fullLegalName: 'SYNTHETIC Archived',
      archivedAt: '2026-09-24T08:00:00.000Z',
    });
    const outsider = api.seed('Signer', { agencyId: w.other.id, fullLegalName: 'SYNTHETIC Out' });
    const draft = version(api, w.mandate);
    const c = coverage(api, draft, w.route.id);
    await render(api, `/representation/coverages/${c.id}/signers/new`);
    await waitFor(() => optionValues('#coverage-signer-signerId').length === 2, 'signers');
    expect(optionValues('#coverage-signer-signerId')).toEqual(['', w.signer.id]);
    for (const refused of [ended, archived, outsider]) {
      expect(optionValues('#coverage-signer-signerId')).not.toContain(refused.id);
    }
    expect(pageText()).toContain('The signed-in application user is never a signer.');
    await type('#coverage-signer-signerId', w.signer.id);
    await type('#coverage-signer-capacity', 'SYNTHETIC Director');
    await submit(q('form.record-form'));
    await waitFor(() => q('[data-testid="coverage-detail"]') !== null, 'coverage');
    expect(api.writes()[0]).toMatchObject({
      path: `/api/v1/coverages/${c.id}/signers`,
      headers: { 'If-Match': `"MandateCoverage:${c.id}:v1"` },
      body: { signerId: w.signer.id, capacity: 'SYNTHETIC Director' },
    });
    await until('Signer recorded under this coverage.');
    await waitFor(() => all('[data-testid="coverage-signer"]').length === 1, 'listed');
    const row = q('[data-testid="coverage-signer"]')?.textContent ?? '';
    expect(row).toContain('Associated signer');
    expect(row).toContain('SYNTHETIC Director');
    expect(pageText()).toContain(
      'An association is not signature authority, G7 clearance or eligibility for any notice',
    );
    expect(pageText()).not.toMatch(SIGNER_CLAIMS);
    await click(byText('button', 'Remove from this draft'));
    await waitFor(() => q('dialog[open]') !== null, 'confirm');
    await click(byText('button', 'Remove signer'));
    await waitFor(() => all('[data-testid="coverage-signer"]').length === 0, 'removed');
    const removal = api.writes().at(-1);
    expect(removal?.method).toBe('DELETE');
    expect(removal?.headers['If-Match']).toMatch(/^"CoverageSigner:[0-9a-f-]{36}:v1"$/);
    await until('Coverage signer removed from the draft.');
  });

  it('coverage of a frozen version offers no edit, no signer change and says why', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    const frozen = version(api, w.mandate, { versionState: 'FROZEN' });
    const c = coverage(api, frozen, w.route.id);
    api.seed('CoverageSigner', {
      coverageId: c.id,
      agencyId: w.agency.id,
      signerId: w.signer.id,
      capacity: 'SYNTHETIC Director',
    });
    await render(api, `/representation/coverages/${c.id}`);
    await until('This coverage belongs to a frozen version');
    await waitFor(() => all('[data-testid="coverage-signer"]').length === 1, 'signer');
    for (const label of ['Edit coverage', 'Add coverage signer']) {
      expect(all('a').some((link) => link.textContent === label)).toBe(false);
    }
    expect(all('button').some((button) => button.textContent === 'Remove from this draft')).toBe(
      false,
    );
  });
});

describe('P3B authority events UI', () => {
  it('records an event: scope only whole-mandate or frozen coverage; DOCUMENT_REVIEWED only with a reviewed source', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    const reviewed = api.seedSource({
      agencyId: w.agency.id,
      title: 'SYNTHETIC reviewed agreement',
      reportedProvenance: 'DOCUMENT_REVIEWED',
      reviewedByLabel: 'SYNTHETIC Reviewer',
    });
    const frozen = version(api, w.mandate, { versionState: 'FROZEN' });
    const frozenCoverage = coverage(api, frozen, w.route.id, { coverageLabel: 'SYNTHETIC frozen' });
    const draft = version(api, w.mandate, { version: 2 });
    const draftCoverage = coverage(api, draft, w.route.id, { coverageLabel: 'SYNTHETIC draft' });
    await render(api, `/representation/mandates/${w.mandate.id}/events/new`);
    await waitFor(() => optionValues('#event-coverageId').length === 2, 'scopes');
    expect(optionValues('#event-coverageId')).toEqual(['', frozenCoverage.id]);
    expect(optionValues('#event-coverageId')).not.toContain(draftCoverage.id);
    const reviewedOption = () =>
      [...((q('#event-provenance') as HTMLSelectElement).options ?? [])].find(
        (option) => option.value === 'DOCUMENT_REVIEWED',
      );
    expect(reviewedOption()?.disabled).toBe(true);
    await type('#event-eventType', 'CURRENTNESS_RECORDED');
    await select('#event-sourceId', w.source.id, 'sources');
    await waitFor(() => !pageText().includes('Loading applicable sources'), 'loaded');
    expect(reviewedOption()?.disabled).toBe(true);
    await type('#event-sourceId', reviewed.id);
    await waitFor(() => reviewedOption()?.disabled === false, 'reviewed source');
    await type('#event-provenance', 'DOCUMENT_REVIEWED');
    await type('#event-effectiveOn', '2025-06-30');
    await type('#event-scopeText', 'SYNTHETIC whole mandate');
    await type('#event-interpretation', 'SYNTHETIC reading of the letter');
    await submit(q('form.record-form'));
    await waitFor(() => q('[data-testid="mandate-detail"]') !== null, 'mandate');
    expect(api.writes()[0]).toMatchObject({
      path: `/api/v1/mandates/${w.mandate.id}/events`,
      headers: { 'If-Match': `"Mandate:${w.mandate.id}:v1"` },
    });
    expect(api.writes()[0]?.body).toEqual({
      eventType: 'CURRENTNESS_RECORDED',
      sourceId: reviewed.id,
      provenance: 'DOCUMENT_REVIEWED',
      scopeText: 'SYNTHETIC whole mandate',
      interpretation: 'SYNTHETIC reading of the letter',
      effectiveOn: '2025-06-30',
    });
    await until('Authority event recorded.');
    await waitFor(() => all('.timeline-item').length === 1, 'timeline');
    const item = q('.timeline-item')?.textContent ?? '';
    expect(item).toContain('Recorded');
    expect(item).toContain('Effective (as recorded)');
    expect(item).toContain('Document reviewed');
    expect(item).toContain('you (application user)');
    expect(pageText()).toContain(
      '“Recorded” is when this application recorded the event — never a legal effective date.',
    );
  });

  it('the timeline keeps recorded and effective dates apart and never fills one from the other', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    const first = api.seedEvent({
      mandateId: w.mandate.id,
      agencyId: w.agency.id,
      sourceId: w.source.id,
      eventType: 'REVOCATION',
    });
    api.seedEvent({
      mandateId: w.mandate.id,
      agencyId: w.agency.id,
      sourceId: w.source.id,
      eventType: 'CORRECTION',
      supersedesEventId: first.id,
      effectiveAt: '2025-06-30T10:15:00.000Z',
      rawEffectiveText: 'SYNTHETIC as of the end of June',
      createdById: '00000000-0000-4000-8000-0000000000b2',
    });
    await render(api, `/representation/mandates/${w.mandate.id}`);
    await waitFor(() => all('.timeline-item').length === 2, 'timeline');
    const [newest, oldest] = all('.timeline-item').map((item) => item.textContent ?? '');
    expect(newest).toContain('Correction');
    expect(newest).toContain('Wording: “SYNTHETIC as of the end of June”');
    expect(newest).toContain('application user 00000000-0000-4000-8000-0000000000b2');
    expect(newest).toContain('An earlier event');
    expect(oldest).toContain('Revocation');
    expect(oldest).toContain('No effective date recorded');
    expect(oldest).toContain('A later event');
  });
});

describe('P3B route preferred coverage UI', () => {
  it('the picker is enabled only when a frozen coverage of this route exists, and offers only that', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    await render(api, `/representation/routes/${w.route.id}/edit`);
    await until('No frozen coverage names this route yet.');
    expect((q('#route-preferredCoverageId') as HTMLSelectElement).disabled).toBe(true);
    const frozen = version(api, w.mandate, { versionState: 'FROZEN' });
    const usable = coverage(api, frozen, w.route.id, { coverageLabel: 'SYNTHETIC usable' });
    const draft = version(api, w.mandate, { version: 2 });
    const draftCoverage = coverage(api, draft, w.route.id, { coverageLabel: 'SYNTHETIC draft' });
    const secondLink = api.seed('OwnerSubject', {
      ownerId: w.owner.id,
      legalSubjectId: w.otherSubject.id,
    });
    const secondRoute = api.seed('Route', { agencyId: w.agency.id, ownerSubjectId: secondLink.id });
    const otherRouteCoverage = coverage(api, frozen, secondRoute.id, {
      coverageLabel: 'SYNTHETIC other route',
    });
    const archivedMandate = api.seed('Mandate', {
      agencyId: w.agency.id,
      label: 'SYNTHETIC archived mandate',
      archivedAt: '2026-09-24T08:00:00.000Z',
    });
    const archivedVersion = version(api, archivedMandate, { versionState: 'FROZEN' });
    const archivedCoverage = coverage(api, archivedVersion, w.route.id, {
      coverageLabel: 'SYNTHETIC archived',
    });
    await render(api, `/representation/routes/${w.route.id}/edit`);
    await waitFor(() => optionValues('#route-preferredCoverageId').length === 2, 'coverage');
    expect(optionValues('#route-preferredCoverageId')).toEqual(['', usable.id]);
    for (const refused of [draftCoverage, otherRouteCoverage, archivedCoverage]) {
      expect(optionValues('#route-preferredCoverageId')).not.toContain(refused.id);
    }
    expect(pageText()).toContain(
      'Preferred coverage is an operational default. Case authority is determined later.',
    );
    await type('#route-preferredCoverageId', usable.id);
    await submit(q('form.record-form'));
    await waitFor(() => q('[data-testid="route-detail"]') !== null, 'route');
    expect(api.writes().at(-1)).toMatchObject({
      method: 'PATCH',
      path: `/api/v1/routes/${w.route.id}`,
      headers: { 'If-Match': `"Route:${w.route.id}:v1"` },
      body: { preferredCoverageId: usable.id },
    });
    await until('SYNTHETIC usable');
    expect(stampTexts().join(' ')).not.toMatch(AUTHORITY_WORDS);
  });

  it('a preference the server refuses is explained (the mandate was archived meanwhile)', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    const frozen = version(api, w.mandate, { versionState: 'FROZEN' });
    const usable = coverage(api, frozen, w.route.id, { coverageLabel: 'SYNTHETIC usable' });
    await render(api, `/representation/routes/${w.route.id}/edit`);
    await select('#route-preferredCoverageId', usable.id, 'coverage');
    Object.assign(api.rows.Mandate.get(w.mandate.id) ?? {}, {
      archivedAt: '2026-09-24T10:00:00.000Z',
    });
    await submit(q('form.record-form'));
    await until('The mandate is archived, so it and everything under it are read-only');
    expect(api.rows.Route.get(w.route.id)?.['preferredCoverageId']).toBeNull();
  });
});
