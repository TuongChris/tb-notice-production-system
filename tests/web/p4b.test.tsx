// @vitest-environment happy-dom
// UI (P4B): the case intake — reported items, works, use mappings and case facts — against the
// synthetic in-memory API (support.tsx). Covers the exact payloads and preconditions (the case's
// ETag for new records and fact revisions, the record's own ETag for edits and archive/restore),
// addresses and times kept exactly as entered, explicit choices of this case's own records only,
// provenance as chosen (never upgraded), immutable fact revisions with readable history, the
// supports each revision recorded — read back exactly (TB-SCHEMA-API-v1.2.0, R9), with the link's
// present state shown apart — neutral wording (no infringement, ownership, readiness or G1–G7 claim),
// safe not-found for another case's record and that nothing loaded or entered for one case is shown
// for another. All data is synthetic.
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../apps/web/src/app/api/client.js';
import {
  clockToMs,
  instantInput,
  instantValue,
  msToClock,
} from '../../apps/web/src/app/cases/intake-ui.js';
import { describeError } from '../../apps/web/src/app/directory/format.js';
import {
  all,
  byText,
  claimTexts,
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

/** Badge wording an intake record must never display as its state. */
const FORBIDDEN_STAMPS =
  /\b(infring\w*|owned|owner|verified|authori[sz]ed|approved|valid|g1|g7|ready|eligible|pass)\b/i;
/** Claims no intake page makes: a record is never an infringement, ownership or readiness verdict. */
const FORBIDDEN_CLAIMS =
  /\b(infringing video|infringes|is infringing|infringement (is )?(found|confirmed|established)|verified copyright\w*|owned by|owns the work|g1 pass|ready for signer|ready to sign|eligible for notice)\b/i;

function stampTexts(): string[] {
  return all('.stamp, .tag, .badge').map((element) => element.textContent ?? '');
}

/** The recorded supports on a fact page: [role, assertion] each, in the order shown. */
function supportRows(): Array<[string | null | undefined, string | null | undefined]> {
  return all('[data-testid="fact-support"]').map((item) => [
    item.querySelector('[data-testid="fact-support-role"]')?.textContent,
    item.querySelector('[data-testid="fact-support-assertion"]')?.textContent,
  ]);
}

/** Wording the supports section never uses about a support: it is a record of what was cited. */
const SUPPORT_CLAIMS =
  /\b(proof|proves?|proven|verified( fact)?|confirmed|permission denied|infringe\w*|unsupported|disproved?)\b/i;

function optionValues(selector: string): string[] {
  return [...((q(selector) as HTMLSelectElement | null)?.options ?? [])].map((o) => o.value);
}

async function choose(selector: string, value: string, label: string): Promise<void> {
  await waitFor(() => optionValues(selector).includes(value), label);
  await type(selector, value);
}

function bodies(api: FakeDirectory, method: string, pathPart: string) {
  return api
    .writes()
    .filter((request) => request.method === method && request.path.includes(pathPart));
}

function world(api: FakeDirectory) {
  const agency = api.seed('Agency', { displayName: 'SYNTHETIC Agency' });
  const owner = api.seed('Owner', { displayName: 'SYNTHETIC Brand' });
  const subject = api.seed('LegalSubject', { legalName: 'SYNTHETIC Subject LLC' });
  const link = api.seed('OwnerSubject', { ownerId: owner.id, legalSubjectId: subject.id });
  const route = api.seed('Route', { agencyId: agency.id, ownerSubjectId: link.id });
  const caseA = api.seed('CaseRecord', {
    agencyId: agency.id,
    intakeLabel: 'SYNTHETIC Case A',
    routeId: route.id,
  });
  const caseB = api.seed('CaseRecord', {
    agencyId: agency.id,
    intakeLabel: 'SYNTHETIC Case B',
    routeId: route.id,
  });
  const reviewed = api.seedSource({
    agencyId: agency.id,
    title: 'SYNTHETIC reviewed record',
    reportedProvenance: 'DOCUMENT_REVIEWED',
    reviewedByLabel: 'SYNTHETIC Reviewer',
  });
  const reported = api.seedSource({ agencyId: agency.id, title: 'SYNTHETIC reported record' });
  const linkReviewed = api.seed('CaseSource', {
    caseId: caseA.id,
    sourceId: reviewed.id,
    useRole: 'PACKET',
  });
  const linkReported = api.seed('CaseSource', {
    caseId: caseA.id,
    sourceId: reported.id,
    useRole: 'CONTEXT',
  });
  const linkB = api.seed('CaseSource', {
    caseId: caseB.id,
    sourceId: reported.id,
    useRole: 'B-ONLY-ROLE',
  });
  const itemA = api.seed('ReportedItem', {
    caseId: caseA.id,
    rawUrl: 'https://youtu.be/SYNTHETICA1',
    normalizedUrl: 'https://www.youtube.com/watch?v=SYNTHETICA1',
    externalItemId: 'SYNTHETICA1',
    displayTitle: 'SYNTHETIC-A-ONLY video',
  });
  const workA = api.seed('CaseWork', { caseId: caseA.id, title: 'SYNTHETIC-A-ONLY work' });
  const itemB = api.seed('ReportedItem', {
    caseId: caseB.id,
    rawUrl: 'https://youtu.be/SYNTHETICB1',
    normalizedUrl: 'https://www.youtube.com/watch?v=SYNTHETICB1',
    externalItemId: 'SYNTHETICB1',
    displayTitle: 'SYNTHETIC-B video',
  });
  const workB = api.seed('CaseWork', { caseId: caseB.id, title: 'SYNTHETIC-B work' });
  return {
    agency,
    route,
    caseA,
    caseB,
    reviewed,
    reported,
    linkReviewed,
    linkReported,
    linkB,
    itemA,
    workA,
    itemB,
    workB,
  };
}

describe('P4B intake helpers', () => {
  it('turns a typed clock time into exact milliseconds and back, without rounding', () => {
    expect(clockToMs('1:02:03.5')).toBe('3723500');
    expect(clockToMs('0:05')).toBe('5000');
    expect(clockToMs('12:34.056')).toBe('754056');
    expect(clockToMs(' 100:00:00 ')).toBe('360000000');
    expect(clockToMs('2501999792:59:00.991')).toBe('9007199254740991');
    expect(clockToMs('2501999792:59:01')).toBeNull();
    expect(clockToMs('about a minute')).toBeNull();
    expect(clockToMs('1:60')).toBeNull();
    expect(clockToMs('3723500')).toBeNull();
    expect(msToClock('3723500')).toBe('1:02:03.500');
    expect(msToClock('0')).toBe('0:00:00.000');
    expect(msToClock('9007199254740991')).toBe('2501999792:59:00.991');
    expect(clockToMs(msToClock('9007199254740991'))).toBe('9007199254740991');
  });

  it('sends a recorded instant back exactly when the field is left unchanged', () => {
    const recorded = '2026-09-24T10:30:45.678Z';
    expect(instantValue(instantInput(recorded), recorded)).toBe(recorded);
    expect(instantValue('', recorded)).toBeNull();
    expect(instantValue('', null)).toBeNull();
    const local = '2026-09-25T08:15';
    expect(instantValue(local, recorded)).toBe(new Date(local).toISOString());
  });

  it('explains the intake refusals in plain language', () => {
    const refusal = (code: string, details: Record<string, unknown>, status = 422) =>
      describeError(new ApiError(status, code, 'synthetic', undefined, details), 'case');
    expect(
      refusal('REPORTED_URL_UNSUPPORTED', { field: 'rawUrl', reason: 'NOT_A_VIDEO_URL' }),
    ).toBe(
      'That is not the address of one video (for example a channel, playlist or search page). Enter the video’s own address. Nothing was fetched.',
    );
    expect(refusal('CROSS_CASE_REFERENCE', { field: 'caseWorkId' })).toContain(
      'That record belongs to another case.',
    );
    expect(refusal('CROSS_CASE_REFERENCE', { field: 'sourceId' })).toContain(
      'That source is scoped to another case',
    );
    expect(refusal('TIME_RANGE_INVALID', { fields: ['sourceStartMs', 'sourceEndMs'] })).toContain(
      'A known end time must be after its start time.',
    );
    expect(refusal('DUPLICATE_USE_MAPPING', { useMappingId: 'x' }, 409)).toContain(
      'already mapped in this case',
    );
    expect(refusal('REVIEW_UNSUPPORTED', { reason: 'NO_REVIEWED_SOURCE' })).toContain(
      'at least one supporting linked source that records who reviewed the document',
    );
    expect(describeError(new ApiError(409, 'REVISION_NOT_HEAD', 'synthetic'), 'fact')).toContain(
      'A newer revision of this fact exists.',
    );
    expect(refusal('RECORD_STATE_CONFLICT', { record: 'CaseWork', archived: true }, 409)).toContain(
      'That work is archived',
    );
  });
});

describe('P4B case intake UI', () => {
  it('the case page shows the four intake sections as recorded, in neutral words, with no verdict badge', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    await render(api, `/cases/${w.caseA.id}`);
    await waitFor(() => q('[data-testid="case-intake"]') !== null, 'intake');
    for (const heading of ['Reported items', 'Works', 'Use mappings', 'Facts']) {
      expect(
        all('h2').some((element) => element.textContent === heading),
        heading,
      ).toBe(true);
    }
    expect(pageText()).toContain('It is not a finding of infringement, and nothing is fetched');
    expect(pageText()).toContain('It does not establish ownership, authorship, registration');
    expect(pageText()).toContain('It is shown as recorded, not as an infringement verdict');
    expect(pageText()).toContain('Nothing is inferred from silence, similarity, an address');
    expect(pageText()).toContain('Nothing here computes readiness, a G1–G7 decision');
    expect(q('[data-testid="reported-items"]')?.textContent).toContain('SYNTHETIC-A-ONLY video');
    expect(q('[data-testid="works"]')?.textContent).toContain('SYNTHETIC-A-ONLY work');
    expect(pageText()).not.toContain('SYNTHETIC-B');
    expect(q('[data-testid="mappings-empty"]')).not.toBeNull();
    expect(q('[data-testid="facts-empty"]')).not.toBeNull();
    for (const text of claimTexts()) expect(text).not.toMatch(FORBIDDEN_CLAIMS);
    for (const stamp of stampTexts()) expect(stamp).not.toMatch(FORBIDDEN_STAMPS);
  });

  it('records a reported item exactly as typed with the case ETag; a channel address is refused on the field and nothing is recorded', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    const before = api.rows.ReportedItem.size;
    await render(api, `/cases/${w.caseA.id}/reported-items/new`);
    await waitFor(() => q('#reported-item-rawUrl') !== null, 'form');
    await submit(q('form.record-form'));
    await until('Enter the address of the YouTube video.');
    expect(document.activeElement?.id).toBe('reported-item-rawUrl');
    await type('#reported-item-rawUrl', 'https://www.youtube.com/@SyntheticChannel');
    await submit(q('form.record-form'));
    await until('That is not the address of one video');
    expect(q('#reported-item-rawUrl-error')?.textContent).toContain('Nothing was fetched.');
    expect(api.rows.ReportedItem.size).toBe(before);
    await type('#reported-item-rawUrl', ' https://youtu.be/SYNTHETIC_2 ');
    await type('#reported-item-displayTitle', '  SYNTHETIC title  ');
    await type('#reported-item-observedAt', '2026-09-24T10:30');
    await submit(q('form.record-form'));
    await waitFor(() => q('[data-testid="reported-item-detail"]') !== null, 'detail');
    await until('Reported item recorded.');
    const posted = bodies(api, 'POST', `/cases/${w.caseA.id}/reported-items`);
    expect(posted.at(-1)?.body).toEqual({
      rawUrl: 'https://youtu.be/SYNTHETIC_2',
      displayTitle: 'SYNTHETIC title',
      observedAt: new Date('2026-09-24T10:30').toISOString(),
    });
    expect(posted.at(-1)?.headers['If-Match']).toBe(`"CaseRecord:${w.caseA.id}:v1"`);
    expect(posted.at(-1)?.headers['Idempotency-Key']).toBeTruthy();
    expect(pageText()).toContain('SYNTHETIC_2');
    expect(pageText()).toContain('https://www.youtube.com/watch?v=SYNTHETIC_2');
    expect(pageText()).toContain('nothing was fetched from YouTube');
    for (const text of claimTexts()) expect(text).not.toMatch(FORBIDDEN_CLAIMS);
  });

  it('edits a reported item with its own ETag: only changed fields; an untouched observation time is kept exactly; an outdated version shows the conflict notice', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    Object.assign(api.rows.ReportedItem.get(w.itemA.id) ?? {}, {
      observedAt: '2026-09-24T10:30:45.678Z',
    });
    await render(api, `/cases/${w.caseA.id}/reported-items/${w.itemA.id}/edit`);
    await waitFor(() => q('#reported-item-displayTitle') !== null, 'form');
    await type('#reported-item-displayTitle', 'SYNTHETIC renamed video');
    await submit(q('form.record-form'));
    await until('Reported item updated.');
    const [patch] = bodies(api, 'PATCH', `/reported-items/${w.itemA.id}`);
    expect(patch?.body).toEqual({ displayTitle: 'SYNTHETIC renamed video' });
    expect(patch?.headers['If-Match']).toBe(`"ReportedItem:${w.itemA.id}:v1"`);
    expect(api.rows.ReportedItem.get(w.itemA.id)?.['observedAt']).toBe('2026-09-24T10:30:45.678Z');
    // Changed elsewhere after the form loaded: nothing is saved.
    await go(`/cases/${w.caseA.id}/reported-items/${w.itemA.id}/edit`);
    await waitFor(() => q('#reported-item-displayTitle') !== null, 'form again');
    api.touch('ReportedItem', w.itemA.id, { displayTitle: 'SYNTHETIC changed elsewhere' });
    await type('#reported-item-displayTitle', 'SYNTHETIC stale title');
    await submit(q('form.record-form'));
    await waitFor(() => q('[data-testid="conflict-notice"]') !== null, 'conflict');
    expect(api.rows.ReportedItem.get(w.itemA.id)?.['displayTitle']).toBe(
      'SYNTHETIC changed elsewhere',
    );
  });

  it('archives and restores a reported item with a reason and its own ETag; nothing that names it changes', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    const mapping = api.seed('UseMapping', {
      caseId: w.caseA.id,
      caseWorkId: w.workA.id,
      reportedItemId: w.itemA.id,
    });
    await render(api, `/cases/${w.caseA.id}/reported-items/${w.itemA.id}`);
    await waitFor(() => q('[data-testid="reported-item-detail"]') !== null, 'detail');
    await until('Use mapping, occurrence 1');
    await waitFor(
      () => all('button').some((button) => button.textContent === 'Archive'),
      'archive',
    );
    await click(byText('button', 'Archive'));
    await waitFor(() => q('dialog[open]') !== null, 'dialog');
    expect(q('dialog[open]')?.textContent).toContain('nothing that names it changes');
    await type('dialog[open] textarea', 'SYNTHETIC archive reason');
    await submit(q('dialog[open] form'));
    await until('Archived.');
    const [archive] = bodies(api, 'POST', `/reported-items/${w.itemA.id}/archive`);
    expect(archive?.body).toEqual({ reason: 'SYNTHETIC archive reason' });
    expect(archive?.headers['If-Match']).toBe(`"ReportedItem:${w.itemA.id}:v1"`);
    expect(api.rows.UseMapping.get(mapping.id)).toMatchObject({ rowVersion: 1, archivedAt: null });
    expect(all('a').some((link) => link.textContent === 'Edit')).toBe(false);
    await click(byText('button', 'Restore'));
    await waitFor(() => q('dialog[open]') !== null, 'restore dialog');
    await type('dialog[open] textarea', 'SYNTHETIC restore reason');
    await submit(q('dialog[open] form'));
    await until('Restored.');
    const [restore] = bodies(api, 'POST', `/reported-items/${w.itemA.id}/restore`);
    expect(restore?.headers['If-Match']).toBe(`"ReportedItem:${w.itemA.id}:v2"`);
  });

  it('records and edits a work exactly as entered; a notes-only change leaves the case context unchanged; the copy never claims ownership', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    await render(api, `/cases/${w.caseA.id}/works/new`);
    await waitFor(() => q('#work-title') !== null, 'form');
    await type('#work-title', '  SYNTHETIC Song  ');
    await type('#work-workType', ' music recording ');
    await type('#work-externalWorkId', 'SYN-001');
    await type('#work-sourceUrl', 'https://example.invalid/synthetic-song');
    await type('#work-notes', 'SYNTHETIC note\nsecond line');
    await submit(q('form.record-form'));
    await waitFor(() => q('[data-testid="work-detail"]') !== null, 'detail');
    await until('Work recorded.');
    const [created] = bodies(api, 'POST', `/cases/${w.caseA.id}/works`);
    expect(created?.body).toEqual({
      title: 'SYNTHETIC Song',
      workType: 'music recording',
      externalWorkId: 'SYN-001',
      sourceUrl: 'https://example.invalid/synthetic-song',
      notes: 'SYNTHETIC note\nsecond line',
    });
    expect(created?.headers['If-Match']).toBe(`"CaseRecord:${w.caseA.id}:v1"`);
    expect(pageText()).toContain('It does not establish ownership');
    expect(pageText()).toContain('is not proof of ownership or of any right');
    for (const text of claimTexts()) expect(text).not.toMatch(FORBIDDEN_CLAIMS);
    const contextAfterCreate = api.rows.CaseRecord.get(w.caseA.id)?.['contextRevision'];
    const work = [...api.rows.CaseWork.values()].find((row) => row['title'] === 'SYNTHETIC Song');
    await waitFor(() => all('a').some((link) => link.textContent === 'Edit'), 'edit link');
    await click(byText('a', 'Edit'));
    await waitFor(() => q('#work-notes') !== null, 'edit form');
    await type('#work-notes', 'SYNTHETIC note only');
    await submit(q('form.record-form'));
    await until('Work updated.');
    const [patch] = bodies(api, 'PATCH', `/works/${work?.id ?? ''}`);
    expect(patch?.body).toEqual({ notes: 'SYNTHETIC note only' });
    expect(patch?.headers['If-Match']).toBe(`"CaseWork:${work?.id ?? ''}:v1"`);
    expect(api.rows.CaseRecord.get(w.caseA.id)?.['contextRevision']).toBe(contextAfterCreate);
  });

  it('a new record with an outdated case version: "Load latest version" keeps what was typed, clears the notice and saves with the new case version', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    await render(api, `/cases/${w.caseA.id}/works/new`);
    await waitFor(() => q('#work-title') !== null, 'work form');
    api.touch('CaseRecord', w.caseA.id);
    await type('#work-title', 'SYNTHETIC work typed before the conflict');
    await submit(q('form.record-form'));
    await waitFor(() => q('[data-testid="conflict-notice"]') !== null, 'conflict');
    expect(api.rows.CaseWork.size).toBe(2);
    await click(byText('button', 'Load latest version'));
    await waitFor(() => q('[data-testid="conflict-notice"]') === null, 'notice cleared');
    await waitFor(() => q('#work-title') !== null, 'form again');
    expect((q('#work-title') as HTMLInputElement).value).toBe(
      'SYNTHETIC work typed before the conflict',
    );
    await submit(q('form.record-form'));
    await until('Work recorded.');
    const posted = bodies(api, 'POST', `/cases/${w.caseA.id}/works`);
    expect(posted.map((request) => request.headers['If-Match'])).toEqual([
      `"CaseRecord:${w.caseA.id}:v1"`,
      `"CaseRecord:${w.caseA.id}:v2"`,
    ]);
    expect(posted[0]?.headers['Idempotency-Key']).not.toBe(posted[1]?.headers['Idempotency-Key']);
  });

  it('a new fact with an outdated case version keeps what was typed after "Load latest version"', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    await render(api, `/cases/${w.caseA.id}/facts/new`);
    await waitFor(() => q('#fact-factType') !== null, 'fact form');
    await type('#fact-factType', 'WORK_IDENTIFICATION');
    await type('#fact-scopeKind', 'CASE');
    await waitFor(() => q('#fact-value-description') !== null, 'value fields');
    await type('#fact-value-description', 'SYNTHETIC description typed before the conflict');
    await type('#fact-provenance', 'OPERATOR_REPORTED');
    await type('#fact-scopeText', 'SYNTHETIC scope typed before the conflict');
    await type('#fact-changeReason', 'SYNTHETIC reason');
    api.touch('CaseRecord', w.caseA.id);
    await submit(q('form.record-form'));
    await waitFor(() => q('[data-testid="conflict-notice"]') !== null, 'conflict');
    expect(api.facts).toHaveLength(0);
    await click(byText('button', 'Load latest version'));
    await waitFor(() => q('[data-testid="conflict-notice"]') === null, 'notice cleared');
    expect((q('#fact-scopeText') as HTMLTextAreaElement).value).toBe(
      'SYNTHETIC scope typed before the conflict',
    );
    expect((q('#fact-value-description') as HTMLTextAreaElement).value).toBe(
      'SYNTHETIC description typed before the conflict',
    );
    await waitFor(
      () =>
        api.requests.filter((request) => request.path === `/api/v1/cases/${w.caseA.id}`).length >=
        2,
      'case reloaded',
    );
    await submit(q('form.record-form'));
    await until('Fact recorded.');
    const posted = bodies(api, 'POST', `/cases/${w.caseA.id}/facts`);
    expect(posted.at(-1)?.headers['If-Match']).toBe(`"CaseRecord:${w.caseA.id}:v2"`);
    expect(api.facts).toHaveLength(1);
  });

  it('records a use mapping from this case’s own work and reported item; times are exact milliseconds next to the text as stated', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    await render(api, `/cases/${w.caseA.id}/mappings/new`);
    await waitFor(() => optionValues('#mapping-caseWorkId').includes(w.workA.id), 'works');
    expect(optionValues('#mapping-caseWorkId')).not.toContain(w.workB.id);
    expect(optionValues('#mapping-reportedItemId')).toContain(w.itemA.id);
    expect(optionValues('#mapping-reportedItemId')).not.toContain(w.itemB.id);
    expect((q('#mapping-occurrence') as HTMLInputElement).value).toBe('1');
    expect((q('#mapping-provenance') as HTMLSelectElement).value).toBe('MISSING');
    await type('#mapping-caseWorkId', w.workA.id);
    await type('#mapping-reportedItemId', w.itemA.id);
    await type('#mapping-raw-sourceStart', '1:02:03.5');
    await click(byText('button', 'Use 3723500 ms for “1:02:03.5”'));
    expect((q('#mapping-sourceStartMs') as HTMLInputElement).value).toBe('3723500');
    await type('#mapping-sourceEndMs', '9007199254740991');
    await type('#mapping-raw-reportedStart', '0:05');
    await click(byText('button', 'Use 5000 ms for “0:05”'));
    await type('#mapping-reportedEndMs', '65000');
    await type('#mapping-boundaryConvention', 'HALF_OPEN');
    await type('#mapping-provenance', 'OPERATOR_REPORTED');
    await submit(q('form.record-form'));
    await waitFor(() => q('[data-testid="mapping-detail"]') !== null, 'detail');
    await until('Use mapping recorded.');
    const [created] = bodies(api, 'POST', `/cases/${w.caseA.id}/mappings`);
    expect(created?.body).toEqual({
      caseWorkId: w.workA.id,
      reportedItemId: w.itemA.id,
      occurrence: 1,
      sourceStartMs: '3723500',
      sourceEndMs: '9007199254740991',
      reportedStartMs: '5000',
      reportedEndMs: '65000',
      rawTimecodes: { sourceStart: '1:02:03.5', reportedStart: '0:05' },
      boundaryConvention: 'HALF_OPEN',
      provenance: 'OPERATOR_REPORTED',
    });
    expect(created?.headers['If-Match']).toBe(`"CaseRecord:${w.caseA.id}:v1"`);
    expect(q('[data-testid="mapping-sourceStart"]')?.textContent).toContain('1:02:03.500');
    expect(q('[data-testid="mapping-sourceStart"]')?.textContent).toContain('(3723500 ms)');
    expect(q('[data-testid="mapping-sourceStart"]')?.textContent).toContain(
      'as stated: “1:02:03.5”',
    );
    expect(q('[data-testid="mapping-sourceEnd"]')?.textContent).toContain('(9007199254740991 ms)');
    expect(pageText()).toContain('not as an infringement verdict');
    expect(pageText()).toContain('similarity alone is never infringement');
    for (const text of claimTexts()) expect(text).not.toMatch(FORBIDDEN_CLAIMS);
    for (const stamp of stampTexts()) expect(stamp).not.toMatch(FORBIDDEN_STAMPS);
  });

  it('a mapping whose end is not after its start, or whose milliseconds are not whole, is refused on the form and nothing is sent', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    await render(api, `/cases/${w.caseA.id}/mappings/new`);
    await choose('#mapping-caseWorkId', w.workA.id, 'works');
    await type('#mapping-reportedItemId', w.itemA.id);
    await type('#mapping-sourceStartMs', '5000');
    await type('#mapping-sourceEndMs', '5000');
    await type('#mapping-reportedStartMs', '1.5');
    await submit(q('form.record-form'));
    await until('A known end must be after its start.');
    expect(pageText()).toContain('Enter whole milliseconds');
    expect(bodies(api, 'POST', '/mappings')).toHaveLength(0);
  });

  it('edits a mapping with its own ETag and sends only what changed; a newer basis-source revision is not followed', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    const mapping = api.seed('UseMapping', {
      caseId: w.caseA.id,
      caseWorkId: w.workA.id,
      reportedItemId: w.itemA.id,
      sourceStartMs: '1000',
      sourceEndMs: '2000',
      rawTimecodes: { sourceStart: '0:01', sourceEnd: null },
      provenance: 'OPERATOR_REPORTED',
      basisSourceId: w.reported.id,
    });
    api.seedSource({
      agencyId: w.agency.id,
      title: 'SYNTHETIC reported record',
      sourceGroupId: w.reported['sourceGroupId'],
      revision: 2,
      supersedesSourceId: w.reported.id,
    });
    await render(api, `/cases/${w.caseA.id}/mappings/${mapping.id}`);
    await waitFor(() => q('[data-testid="mapping-detail"]') !== null, 'detail');
    await until('This record cites revision 1; the source now has revision 2.');
    await waitFor(() => all('a').some((link) => link.textContent === 'Edit'), 'edit link');
    await click(byText('a', 'Edit'));
    await waitFor(() => q('#mapping-sourceEndMs') !== null, 'edit form');
    await type('#mapping-sourceEndMs', '2500');
    await submit(q('form.record-form'));
    await until('Use mapping updated.');
    const [patch] = bodies(api, 'PATCH', `/mappings/${mapping.id}`);
    expect(patch?.body).toEqual({ sourceEndMs: '2500' });
    expect(patch?.headers['If-Match']).toBe(`"UseMapping:${mapping.id}:v1"`);
    expect(api.rows.UseMapping.get(mapping.id)?.['basisSourceId']).toBe(w.reported.id);
  });

  it('records a case fact exactly as entered: explicit type and scope, typed value, provenance as chosen and the supports, which the page then reads back as recorded', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    await render(api, `/cases/${w.caseA.id}/facts/new`);
    await waitFor(() => q('#fact-factType') !== null, 'form');
    await submit(q('form.record-form'));
    await until('Choose what kind of fact this is.');
    expect(document.activeElement?.id).toBe('fact-factType');
    await type('#fact-factType', 'PERMISSION');
    await waitFor(() => q('#fact-value-finding') !== null, 'value fields');
    expect(q('[data-testid="fact-value-fields"]')?.textContent).toContain(
      'Permission is never inferred from silence',
    );
    await type('#fact-scopeKind', 'REPORTED_ITEM');
    await waitFor(() => q('#fact-reportedItemId') !== null, 'target');
    expect(optionValues('#fact-reportedItemId')).toContain(w.itemA.id);
    expect(optionValues('#fact-reportedItemId')).not.toContain(w.itemB.id);
    await type('#fact-reportedItemId', w.itemA.id);
    const reviewedOption = () =>
      [...((q('#fact-provenance') as HTMLSelectElement).options ?? [])].find(
        (option) => option.value === 'DOCUMENT_REVIEWED',
      );
    expect(reviewedOption()?.disabled).toBe(true);
    await click(byText('button', 'Add a supporting source'));
    await waitFor(() => optionValues('#fact-sources-0-caseSourceId').length > 1, 'links');
    expect(optionValues('#fact-sources-0-caseSourceId')).toEqual([
      '',
      w.linkReported.id,
      w.linkReviewed.id,
    ]);
    expect(optionValues('#fact-sources-0-caseSourceId')).not.toContain(w.linkB.id);
    await type('#fact-sources-0-caseSourceId', w.linkReviewed.id);
    await type('#fact-sources-0-supportRole', ' PRIMARY ');
    await type('#fact-sources-0-supportedAssertion', 'SYNTHETIC supported statement');
    expect(reviewedOption()?.disabled).toBe(false);
    await type('#fact-provenance', 'DOCUMENT_REVIEWED');
    await type('#fact-value-finding', 'NO_PERMISSION_REPORTED');
    await type('#fact-value-assertion', 'SYNTHETIC no permission was reported');
    await type('#fact-value-reviewScope', 'SYNTHETIC checked the packet');
    await type('#fact-scopeText', 'SYNTHETIC scope of the fact');
    await type('#fact-changeReason', 'SYNTHETIC first record');
    await submit(q('form.record-form'));
    await waitFor(() => q('[data-testid="fact-detail"]') !== null, 'detail');
    await until('Fact recorded.');
    const [created] = bodies(api, 'POST', `/cases/${w.caseA.id}/facts`);
    expect(created?.body).toEqual({
      factType: 'PERMISSION',
      scopeKind: 'REPORTED_ITEM',
      reportedItemId: w.itemA.id,
      value: {
        finding: 'NO_PERMISSION_REPORTED',
        assertion: 'SYNTHETIC no permission was reported',
        reviewScope: 'SYNTHETIC checked the packet',
      },
      provenance: 'DOCUMENT_REVIEWED',
      resolutionState: 'UNASSESSED',
      scopeText: 'SYNTHETIC scope of the fact',
      changeReason: 'SYNTHETIC first record',
      sources: [
        {
          caseSourceId: w.linkReviewed.id,
          supportRole: 'PRIMARY',
          supportedAssertion: 'SYNTHETIC supported statement',
        },
      ],
    });
    expect(created?.headers['If-Match']).toBe(`"CaseRecord:${w.caseA.id}:v1"`);
    await until('SYNTHETIC-A-ONLY video');
    expect(pageText()).toContain('No permission reported');
    expect(pageText()).toContain('Document reviewed');
    expect(pageText()).toContain('Unassessed');
    // The support is read back from the server (getCaseFactSources), exactly as recorded.
    await waitFor(() => supportRows().length === 1, 'recorded support');
    expect(supportRows()).toEqual([['PRIMARY', 'SYNTHETIC supported statement']]);
    const [fact] = api.facts;
    expect(
      api.requests.some(
        (request) =>
          request.method === 'GET' &&
          request.path.endsWith(`/cases/${w.caseA.id}/facts/${fact?.id ?? ''}/sources`),
      ),
    ).toBe(true);
    expect(all('[data-testid="fact-history"] li')).toHaveLength(1);
    for (const text of claimTexts()) expect(text).not.toMatch(FORBIDDEN_CLAIMS);
    for (const stamp of stampTexts()) expect(stamp).not.toMatch(FORBIDDEN_STAMPS);
  });

  it('a reviewed source upgrades nothing: a fact and a use mapping are sent with the provenance and resolution exactly as chosen', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    await render(api, `/cases/${w.caseA.id}/facts/new`);
    await waitFor(() => q('#fact-factType') !== null, 'form');
    await type('#fact-factType', 'WORK_IDENTIFICATION');
    await type('#fact-scopeKind', 'CASE');
    await click(byText('button', 'Add a supporting source'));
    await choose('#fact-sources-0-caseSourceId', w.linkReviewed.id, 'links');
    await type('#fact-sources-0-supportRole', 'PRIMARY');
    await type('#fact-sources-0-supportedAssertion', 'SYNTHETIC supported statement');
    // Choosing a reviewed source chooses nothing for the operator.
    expect((q('#fact-provenance') as HTMLSelectElement).value).toBe('');
    expect((q('#fact-resolutionState') as HTMLSelectElement).value).toBe('UNASSESSED');
    await type('#fact-provenance', 'OPERATOR_REPORTED');
    await type('#fact-value-description', 'SYNTHETIC description');
    await type('#fact-scopeText', 'SYNTHETIC scope of the fact');
    await type('#fact-changeReason', 'SYNTHETIC first record');
    await submit(q('form.record-form'));
    await until('Fact recorded.');
    const [fact] = bodies(api, 'POST', `/cases/${w.caseA.id}/facts`);
    expect(fact?.body).toMatchObject({
      provenance: 'OPERATOR_REPORTED',
      resolutionState: 'UNASSESSED',
      sources: [{ caseSourceId: w.linkReviewed.id }],
    });
    // A mapping based on the reviewed source keeps the provenance as chosen (here the default).
    await go(`/cases/${w.caseA.id}/mappings/new`);
    await choose('#mapping-caseWorkId', w.workA.id, 'works');
    await type('#mapping-reportedItemId', w.itemA.id);
    await choose('#mapping-basisSourceId', w.reviewed.id, 'basis sources');
    expect((q('#mapping-provenance') as HTMLSelectElement).value).toBe('MISSING');
    await submit(q('form.record-form'));
    await until('Use mapping recorded.');
    const [mapping] = bodies(api, 'POST', `/cases/${w.caseA.id}/mappings`);
    expect(mapping?.body).toMatchObject({ provenance: 'MISSING', basisSourceId: w.reviewed.id });
  });

  it('revises the current fact with the case ETag: type and scope fixed; the earlier revision stays readable, marked as earlier, and cannot be revised', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    const first = api.seedFact({
      caseId: w.caseA.id,
      factType: 'WORK_IDENTIFICATION',
      scopeKind: 'WORK',
      caseWorkId: w.workA.id,
      value: { description: 'SYNTHETIC first description', limitations: '' },
      assertedAsOf: '2026-09-24T10:30:45.678Z',
    });
    await render(api, `/cases/${w.caseA.id}/facts/${first.id}/revise`);
    await waitFor(() => q('#fact-value-description') !== null, 'form');
    expect((q('#fact-factType') as HTMLSelectElement).disabled).toBe(true);
    expect((q('#fact-scopeKind') as HTMLSelectElement).disabled).toBe(true);
    expect((q('#fact-caseWorkId') as HTMLSelectElement).disabled).toBe(true);
    expect((q('#fact-value-description') as HTMLTextAreaElement).value).toBe(
      'SYNTHETIC first description',
    );
    expect(pageText()).toContain(
      'the earlier revision keeps its own supports, shown on its page, and they are not copied here',
    );
    await type('#fact-value-description', 'SYNTHETIC corrected description');
    await type('#fact-provenance', 'OPERATOR_REPORTED');
    await type('#fact-changeReason', 'SYNTHETIC correction');
    await submit(q('form.record-form'));
    await until('Revision 2 recorded.');
    const [revised] = bodies(api, 'POST', `/facts/${first.id}/revisions`);
    expect(revised?.body).toMatchObject({
      factType: 'WORK_IDENTIFICATION',
      scopeKind: 'WORK',
      caseWorkId: w.workA.id,
      value: { description: 'SYNTHETIC corrected description', limitations: '' },
      assertedAsOf: '2026-09-24T10:30:45.678Z',
      changeReason: 'SYNTHETIC correction',
      sources: [],
    });
    expect(revised?.headers['If-Match']).toBe(`"CaseRecord:${w.caseA.id}:v1"`);
    expect(all('[data-testid="fact-history"] li')).toHaveLength(2);
    expect(pageText()).toContain('Revision 2 (this page)');
    // The earlier revision, by its own address: unchanged and marked as earlier.
    await go(`/cases/${w.caseA.id}/facts/${first.id}`);
    await waitFor(() => q('[data-testid="fact-superseded"]') !== null, 'earlier');
    expect(pageText()).toContain('SYNTHETIC first description');
    expect(pageText()).not.toContain('SYNTHETIC corrected description');
    expect(byText('button', 'Record a new revision').getAttribute('aria-disabled')).toBe('true');
    await go(`/cases/${w.caseA.id}/facts/${first.id}/revise`);
    await waitFor(() => q('[data-testid="fact-not-head"]') !== null, 'not head');
    expect(q('#fact-value-description')).toBeNull();
  });

  it('the fact list shows current revisions only and filters by fact type', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    const first = api.seedFact({ caseId: w.caseA.id, factType: 'PERMISSION', scopeText: 'x' });
    api.seedFact({
      caseId: w.caseA.id,
      factType: 'PERMISSION',
      factGroupId: first['factGroupId'],
      revision: 2,
      supersedesFactId: first.id,
    });
    api.seedFact({ caseId: w.caseA.id, factType: 'AV_COMPARISON' });
    api.seedFact({ caseId: w.caseB.id, factType: 'PERMISSION' });
    await render(api, `/cases/${w.caseA.id}`);
    await waitFor(() => q('[data-testid="facts"]') !== null, 'facts');
    expect(all('[data-testid="facts"] tbody tr')).toHaveLength(2);
    const filter = all('select').find((element) =>
      element.parentElement?.textContent?.startsWith('Fact type'),
    ) as HTMLSelectElement;
    filter.id = 'fact-filter';
    await type('#fact-filter', 'PERMISSION');
    await waitFor(() => all('[data-testid="facts"] tbody tr').length === 1, 'filtered');
    expect(
      api.requests.some(
        (request) =>
          request.path.startsWith(`/api/v1/cases/${w.caseA.id}/facts?`) &&
          request.path.includes('factType=PERMISSION'),
      ),
    ).toBe(true);
  });

  it('switching from case A to case B shows only B’s intake: nothing loaded or entered for A carries over', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    await render(api, `/cases/${w.caseA.id}`);
    await waitFor(() => q('[data-testid="reported-items"]') !== null, 'A intake');
    expect(pageText()).toContain('SYNTHETIC-A-ONLY video');
    await go(`/cases/${w.caseB.id}`);
    await waitFor(
      () => q('[data-testid="case-detail"] h1')?.textContent === 'SYNTHETIC Case B',
      'B detail',
    );
    await until('SYNTHETIC-B video');
    expect(pageText()).not.toContain('SYNTHETIC-A-ONLY');
    // A half-filled mapping for A leaves nothing in B's mapping form.
    await go(`/cases/${w.caseA.id}/mappings/new`);
    await choose('#mapping-caseWorkId', w.workA.id, 'A works');
    await type('#mapping-raw-sourceStart', 'SYNTHETIC-A-ONLY time');
    await go(`/cases/${w.caseB.id}/mappings/new`);
    await waitFor(() => optionValues('#mapping-caseWorkId').includes(w.workB.id), 'B works');
    expect((q('#mapping-caseWorkId') as HTMLSelectElement).value).toBe('');
    expect((q('#mapping-raw-sourceStart') as HTMLInputElement).value).toBe('');
    expect(optionValues('#mapping-caseWorkId')).not.toContain(w.workA.id);
    // A half-filled fact for A leaves nothing in B's fact form.
    await go(`/cases/${w.caseA.id}/facts/new`);
    await waitFor(() => q('#fact-scopeText') !== null, 'A fact form');
    await type('#fact-scopeText', 'SYNTHETIC-A-ONLY scope');
    await go(`/cases/${w.caseB.id}/facts/new`);
    await waitFor(
      () => (q('nav[aria-label="Breadcrumb"]')?.textContent ?? '').includes('SYNTHETIC Case B'),
      'B fact form',
    );
    expect((q('#fact-scopeText') as HTMLTextAreaElement).value).toBe('');
    expect(pageText()).not.toContain('SYNTHETIC-A-ONLY');
    expect(bodies(api, 'POST', '/mappings')).toHaveLength(0);
    expect(bodies(api, 'POST', '/facts')).toHaveLength(0);
  });

  it('a record asked for under another case shows a safe not-found and nothing of the record', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    const mapping = api.seed('UseMapping', {
      caseId: w.caseA.id,
      caseWorkId: w.workA.id,
      reportedItemId: w.itemA.id,
      limitations: 'SYNTHETIC-A-ONLY limitation',
    });
    const fact = api.seedFact({ caseId: w.caseA.id, scopeText: 'SYNTHETIC-A-ONLY fact scope' });
    const cases: Array<[string, string]> = [
      [`/cases/${w.caseB.id}/reported-items/${w.itemA.id}`, 'reported-item-not-found'],
      [`/cases/${w.caseB.id}/reported-items/${w.itemA.id}/edit`, 'reported-item-not-found'],
      [`/cases/${w.caseB.id}/works/${w.workA.id}`, 'work-not-found'],
      [`/cases/${w.caseB.id}/works/${w.workA.id}/edit`, 'work-not-found'],
      [`/cases/${w.caseB.id}/mappings/${mapping.id}`, 'mapping-not-found'],
      [`/cases/${w.caseB.id}/mappings/${mapping.id}/edit`, 'mapping-not-found'],
      [`/cases/${w.caseB.id}/facts/${fact.id}`, 'fact-not-found'],
      [`/cases/${w.caseB.id}/facts/${fact.id}/revise`, 'fact-not-found'],
    ];
    await render(api, cases[0]?.[0] ?? '/');
    for (const [path, testId] of cases) {
      await go(path);
      await waitFor(() => q(`[data-testid="${testId}"]`) !== null, path);
      expect(q(`[data-testid="${testId}"]`)?.textContent).toContain('This case has no');
      expect(pageText()).not.toContain('SYNTHETIC-A-ONLY');
    }
  });

  it('under an archived case every intake change is visible but unavailable, with the reason', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    Object.assign(api.rows.CaseRecord.get(w.caseA.id) ?? {}, {
      archivedAt: '2026-09-24T09:30:00.000Z',
      archiveReason: 'SYNTHETIC archive',
    });
    await render(api, `/cases/${w.caseA.id}`);
    await waitFor(() => q('[data-testid="case-intake"]') !== null, 'intake');
    for (const label of [
      'Add a reported item',
      'Add a work',
      'Add a use mapping',
      'Record a fact',
    ]) {
      expect(byText('button', label).getAttribute('aria-disabled'), label).toBe('true');
    }
    await go(`/cases/${w.caseA.id}/works/${w.workA.id}`);
    await waitFor(() => q('[data-testid="work-detail"]') !== null, 'work');
    await until('Archived cases are read-only. Restore the case first.');
    expect(byText('button', 'Edit or archive').getAttribute('aria-disabled')).toBe('true');
    expect(all('a').some((link) => link.textContent === 'Edit')).toBe(false);
  });
});

describe('R9 — the supports recorded with each fact revision, read back (TB-SCHEMA-API-v1.2.0)', () => {
  it('create and revise with supports, then unmount and reload: the historical revision still shows exactly its own supports, read back from the server; the newer one only its own', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    await render(api, `/cases/${w.caseA.id}/facts/new`);
    await waitFor(() => q('#fact-factType') !== null, 'form');
    await type('#fact-factType', 'WORK_IDENTIFICATION');
    await type('#fact-scopeKind', 'CASE');
    await click(byText('button', 'Add a supporting source'));
    await choose('#fact-sources-0-caseSourceId', w.linkReported.id, 'links');
    await type('#fact-sources-0-supportRole', 'CONTEXT');
    await type('#fact-sources-0-supportedAssertion', '  SYNTHETIC first assertion — café  ');
    await click(byText('button', 'Add a supporting source'));
    await choose('#fact-sources-1-caseSourceId', w.linkReviewed.id, 'links');
    await type('#fact-sources-1-supportRole', 'PRIMARY');
    await type('#fact-sources-1-supportedAssertion', 'SYNTHETIC second assertion\nline two');
    await type('#fact-provenance', 'OPERATOR_REPORTED');
    await type('#fact-value-description', 'SYNTHETIC description');
    await type('#fact-scopeText', 'SYNTHETIC scope of the fact');
    await type('#fact-changeReason', 'SYNTHETIC first record');
    await submit(q('form.record-form'));
    await until('Fact recorded.');
    await waitFor(() => supportRows().length === 2, 'revision 1 supports');
    expect(supportRows()).toEqual([
      ['CONTEXT', '  SYNTHETIC first assertion — café  '],
      ['PRIMARY', 'SYNTHETIC second assertion\nline two'],
    ]);
    const [first] = api.facts;
    // A new revision with one other support.
    await go(`/cases/${w.caseA.id}/facts/${first?.id ?? ''}/revise`);
    await waitFor(() => q('#fact-value-description') !== null, 'revision form');
    expect(all('[id^="fact-sources-"]')).toHaveLength(0);
    await click(byText('button', 'Add a supporting source'));
    await choose('#fact-sources-0-caseSourceId', w.linkReported.id, 'links');
    await type('#fact-sources-0-supportRole', 'REVISED');
    await type('#fact-sources-0-supportedAssertion', 'SYNTHETIC revision 2 assertion');
    await type('#fact-changeReason', 'SYNTHETIC second record');
    await submit(q('form.record-form'));
    await until('Revision 2 recorded.');
    await waitFor(() => supportRows().length === 1, 'revision 2 support');
    expect(supportRows()).toEqual([['REVISED', 'SYNTHETIC revision 2 assertion']]);
    const [, revised] = bodies(api, 'POST', '/facts');
    expect(revised?.body).toMatchObject({
      sources: [
        {
          caseSourceId: w.linkReported.id,
          supportRole: 'REVISED',
          supportedAssertion: 'SYNTHETIC revision 2 assertion',
        },
      ],
    });
    // Unmount (a reload: the page remembers nothing) and open revision 1 by its own address.
    await unmount();
    const sent = api.requests.length;
    await render(api, `/cases/${w.caseA.id}/facts/${first?.id ?? ''}`);
    await waitFor(() => q('[data-testid="fact-superseded"]') !== null, 'earlier revision');
    await waitFor(() => supportRows().length === 2, 'revision 1 supports after reload');
    expect(supportRows()).toEqual([
      ['CONTEXT', '  SYNTHETIC first assertion — café  '],
      ['PRIMARY', 'SYNTHETIC second assertion\nline two'],
    ]);
    expect(pageText()).not.toContain('SYNTHETIC revision 2 assertion');
    expect(
      api.requests
        .slice(sent)
        .some(
          (request) =>
            request.method === 'GET' &&
            request.path.endsWith(`/cases/${w.caseA.id}/facts/${first?.id ?? ''}/sources`),
        ),
    ).toBe(true);
    for (const text of claimTexts()) expect(text).not.toMatch(FORBIDDEN_CLAIMS);
  });

  it('a support whose link was later paused or unlinked stays shown as recorded; the link’s state today is shown apart; a newer source revision is not followed', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    const fact = api.seedFact({ caseId: w.caseA.id, provenance: 'OPERATOR_REPORTED' });
    api.seedFactSource(fact.id, {
      caseSourceId: w.linkReported.id,
      supportRole: 'CONTEXT',
      supportedAssertion: 'SYNTHETIC recorded through the reported record',
    });
    api.seedFactSource(fact.id, {
      caseSourceId: w.linkReviewed.id,
      supportRole: 'PRIMARY',
      supportedAssertion: 'SYNTHETIC recorded through the reviewed record',
    });
    Object.assign(api.rows.CaseSource.get(w.linkReported.id) ?? {}, {
      linkState: 'PAUSED',
      stateReason: 'SYNTHETIC pause',
    });
    Object.assign(api.rows.CaseSource.get(w.linkReviewed.id) ?? {}, {
      linkState: 'UNLINKED',
      stateReason: 'SYNTHETIC unlink',
    });
    api.seedSource({
      agencyId: w.agency.id,
      title: 'SYNTHETIC reported record (rev 2)',
      sourceGroupId: w.reported['sourceGroupId'],
      revision: 2,
      supersedesSourceId: w.reported.id,
    });
    await render(api, `/cases/${w.caseA.id}/facts/${fact.id}`);
    await waitFor(() => supportRows().length === 2, 'supports');
    expect(supportRows()).toEqual([
      ['CONTEXT', 'SYNTHETIC recorded through the reported record'],
      ['PRIMARY', 'SYNTHETIC recorded through the reviewed record'],
    ]);
    await until('the source now has revision 2. The citation does not move to it.');
    // The recorded part cites the revision each link cites — revision 1 — never the newest.
    await waitFor(() => all('[data-testid="fact-support"] .citation a').length === 2, 'citations');
    expect(
      all('[data-testid="fact-support"] .citation a').map((link) => link.getAttribute('href')),
    ).toEqual([`/sources/${w.reported.id}`, `/sources/${w.reviewed.id}`]);
    // The link's state today, apart from the record, for each support.
    await waitFor(
      () => all('[data-testid="fact-support-link-now"] .stamp').length === 2,
      'link states',
    );
    const today = all('[data-testid="fact-support-link-now"]').map(
      (element) => element.textContent ?? '',
    );
    expect(today[0]).toContain('The link today — not part of this record');
    expect(today[0]).toContain('Paused');
    expect(today[0]).toContain('Reason: SYNTHETIC pause');
    expect(today[0]).toContain(
      'This link is now paused. The support above stays recorded for this revision exactly as it was.',
    );
    expect(today[1]).toContain('Unlinked');
    expect(today[1]).toContain('This link is now unlinked.');
    for (const item of all('[data-testid="fact-support"]')) {
      expect(item.querySelector('dl')?.textContent ?? '').not.toMatch(/Paused|Unlinked/);
    }
    const section = q('[data-testid="fact-supports"]')?.closest('section');
    for (const text of claimTexts(section)) expect(text).not.toMatch(SUPPORT_CLAIMS);
    for (const text of claimTexts()) expect(text).not.toMatch(FORBIDDEN_CLAIMS);
    for (const stamp of stampTexts()) expect(stamp).not.toMatch(FORBIDDEN_STAMPS);
    // Provenance and resolution stay as recorded: a reviewed source cited upgrades nothing.
    expect(all('.provenance').map((element) => element.textContent)).toEqual(['Operator reported']);
    expect(pageText()).toContain('Unassessed');
    expect(pageText()).not.toContain('Recorded as supported for its scope');
  });

  it('a revision recorded without supports says only that none was recorded; nothing is inferred from it', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    const fact = api.seedFact({ caseId: w.caseA.id, provenance: 'MISSING' });
    await render(api, `/cases/${w.caseA.id}/facts/${fact.id}`);
    await waitFor(() => q('[data-testid="fact-supports-none"]') !== null, 'no supports');
    expect(q('[data-testid="fact-supports-none"]')?.textContent).toBe(
      'No supporting source was recorded for this revision.',
    );
    expect(all('[data-testid="fact-support"]')).toHaveLength(0);
    const section = q('[data-testid="fact-supports-none"]')?.closest('section');
    for (const text of claimTexts(section)) expect(text).not.toMatch(SUPPORT_CLAIMS);
  });

  it('another case’s fact: not found, its supports never requested or shown; each case shows only its own supports', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    const factA = api.seedFact({ caseId: w.caseA.id });
    api.seedFactSource(factA.id, {
      caseSourceId: w.linkReported.id,
      supportRole: 'A_ROLE',
      supportedAssertion: 'SYNTHETIC-A-ONLY support',
    });
    const factB = api.seedFact({ caseId: w.caseB.id });
    api.seedFactSource(factB.id, {
      caseSourceId: w.linkB.id,
      supportRole: 'B_ROLE',
      supportedAssertion: 'SYNTHETIC-B-ONLY support',
    });
    await render(api, `/cases/${w.caseA.id}/facts/${factB.id}`);
    await waitFor(() => q('[data-testid="fact-not-found"]') !== null, 'not found');
    expect(pageText()).not.toContain('SYNTHETIC-B-ONLY');
    expect(
      api.requests.some((request) => request.path.includes(`/facts/${factB.id}/sources`)),
    ).toBe(false);
    await go(`/cases/${w.caseB.id}/facts/${factB.id}`);
    await waitFor(() => supportRows().length === 1, 'B support');
    expect(supportRows()).toEqual([['B_ROLE', 'SYNTHETIC-B-ONLY support']]);
    await go(`/cases/${w.caseA.id}/facts/${factA.id}`);
    await waitFor(() => supportRows()[0]?.[0] === 'A_ROLE', 'A support');
    expect(supportRows()).toEqual([['A_ROLE', 'SYNTHETIC-A-ONLY support']]);
    expect(pageText()).not.toContain('SYNTHETIC-B-ONLY');
    expect(pageText()).not.toContain(w.linkB.id);
  });
});
