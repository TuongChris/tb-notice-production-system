// @vitest-environment happy-dom
// UI (P4D): the Production context page against the synthetic in-memory API (support.tsx). Covers
// the permanent boundary statement; a scope chosen explicitly — no task, mode, authority selection,
// parent NMI or prior transmission preselected, not even the case's current selection — and sent
// exactly as chosen; INITIAL without reply selectors; the NMI and as-sent pickers limited to this
// case's bindings of those event types (a corrected binding is not offered, OUTBOUND + OTHER never
// is); every block of the view shown as recorded — missing context and recorded conflicts in their
// own treatments, the authority copy, the application scope read back, capture posture, attachment
// observations, captured text as inert plain text, a MISSING fact never shown as a negative
// finding; DRAFTING and selector refusals; case isolation; keyboard focus following a read asked for
// on the page to its outcome; and that the page writes nothing and offers no generate, approve,
// ready, sign or send action. All data is synthetic.
import { describe, expect, it } from 'vitest';
import type { ContextView, ProductionContext } from '../../packages/contracts/src/index.js';
import { ContextViewSchema } from '../../packages/contracts/src/index.js';
import { contextQueryString, type ContextQuery } from '../../apps/web/src/app/api/directory.js';
import {
  AUTHORITY_IN_CONTEXT,
  CONTEXT_BOUNDARY,
} from '../../apps/web/src/app/cases/production-context.js';
import { AS_SENT_COPY } from '../../apps/web/src/app/correspondence/correspondence-ui.js';
import {
  CAPTURE_MODE_LABEL,
  PERMISSION_FINDING_LABEL,
} from '../../apps/web/src/app/directory/format.js';
import {
  all,
  byText,
  click,
  failure,
  FakeDirectory,
  go,
  json,
  NOW,
  pageText,
  q,
  render,
  submit,
  type,
  unmount,
  until,
  waitFor,
} from './support.js';

/** Claims the page never makes: it assembles recorded input and determines nothing. */
const FORBIDDEN_CLAIMS =
  /\b(g1 pass|g[1-7] passed|ready for signer|ready to sign|ready to send|approved|authori[sz]ed signer|valid authority|current authority|verified|infringing|unauthori[sz]ed|failed|invalid rights)\b/i;
/** Actions the page never offers. */
const FORBIDDEN_ACTIONS = /\b(generate|approve|ready|sign|send|export|submit)\b/i;

const meta = { requestId: 'synthetic', affectedResources: [] };

function world(api: FakeDirectory) {
  const agency = api.seed('Agency', {
    displayName: 'SYNTHETIC Agency A',
    legalName: 'SYNTHETIC A Agency Legal Name Ltd',
  });
  const owner = api.seed('Owner', { displayName: 'SYNTHETIC Brand X' });
  const subject = api.seed('LegalSubject', { legalName: 'SYNTHETIC Subject L LLC' });
  const association = api.seed('OwnerSubject', { ownerId: owner.id, legalSubjectId: subject.id });
  const route = api.seed('Route', { agencyId: agency.id, ownerSubjectId: association.id });
  const signer = api.seed('Signer', {
    agencyId: agency.id,
    fullLegalName: 'SYNTHETIC Signer Person',
  });
  const primary = api.seedSource({ agencyId: agency.id, title: 'SYNTHETIC agency record' });
  const basis = api.seedSource({
    agencyId: agency.id,
    title: 'SYNTHETIC coverage basis',
    sourceRole: 'OPERATOR_INPUT',
  });
  const policy = api.seedSource({
    agencyId: agency.id,
    title: 'SYNTHETIC policy page',
    sourceRole: 'POLICY_REFERENCE',
    canonicalUrl: 'https://policy.example.invalid/copyright',
  });
  const mandate = api.seed('Mandate', { agencyId: agency.id, label: 'SYNTHETIC mandate' });
  const version = api.seed('MandateVersion', {
    mandateId: mandate.id,
    agencyId: agency.id,
    versionState: 'FROZEN',
    primarySourceId: primary.id,
    documentState: 'SIGNED_APPEARING',
    frozenAt: NOW,
  });
  const coverage = api.seed('MandateCoverage', {
    mandateVersionId: version.id,
    routeId: route.id,
    agencyId: agency.id,
    coverageLabel: 'SYNTHETIC coverage',
    basisSourceId: basis.id,
    actionScope: ['PREPARE_NOTICE'],
  });
  const coverageSigner = api.seed('CoverageSigner', {
    coverageId: coverage.id,
    agencyId: agency.id,
    signerId: signer.id,
    capacity: 'SYNTHETIC capacity',
    sourceId: basis.id,
  });
  const caseA = api.seed('CaseRecord', {
    agencyId: agency.id,
    intakeLabel: 'SYNTHETIC Case A',
    routeId: route.id,
    contextRevision: 7,
  });
  const caseB = api.seed('CaseRecord', {
    agencyId: agency.id,
    intakeLabel: 'SYNTHETIC Case B',
    routeId: route.id,
    contextRevision: 2,
  });
  const pinning = { caseId: caseA.id, agencyId: agency.id, routeId: route.id, signerId: signer.id };
  const earlier = api.seedSelection({ ...pinning, createdAt: '2026-09-24T07:00:00.000Z' }, [
    { coverageId: coverage.id, applicationScope: 'SYNTHETIC earlier application scope' },
  ]);
  const selection = api.seedSelection(
    { ...pinning, createdAt: '2026-09-24T08:00:00.000Z', selectionNote: 'SYNTHETIC note A' },
    [{ coverageId: coverage.id, applicationScope: 'SYNTHETIC application scope A' }],
  );
  // The case's current pointer is the later selection — the page still preselects nothing.
  caseA['currentAuthoritySelectionId'] = selection.id;
  const item = api.seed('ReportedItem', {
    caseId: caseA.id,
    rawUrl: 'https://youtu.be/SYNTHETICA1',
    normalizedUrl: 'https://www.youtube.com/watch?v=SYNTHETICA1',
    externalItemId: 'SYNTHETICA1',
    displayTitle: 'SYNTHETIC video A1',
  });
  const work = api.seed('CaseWork', { caseId: caseA.id, title: 'SYNTHETIC work A' });
  const mapping = api.seed('UseMapping', {
    caseId: caseA.id,
    caseWorkId: work.id,
    reportedItemId: item.id,
    provenance: 'OPERATOR_REPORTED',
    basisSourceId: basis.id,
  });
  const permission = api.seedFact({
    caseId: caseA.id,
    factType: 'PERMISSION',
    value: { finding: 'UNKNOWN', assertion: '', reviewScope: 'Not reviewed' },
    provenance: 'MISSING',
  });
  const comparison = api.seedFact({
    caseId: caseA.id,
    factType: 'AV_COMPARISON',
    value: { finding: 'CONFLICT', method: '', assertion: '', limitations: '' },
    provenance: 'CONFLICT',
    resolutionState: 'CONFLICT',
  });
  const nmiMessage = api.seedCorrespondence({
    agencyId: agency.id,
    subject: 'SYNTHETIC request for more information',
    captureMode: 'EXCERPT',
    bodyRole: 'EXCERPT',
    bodyText:
      '<img src=x onerror="window.__pwned=1"> SYNTHETIC excerpt: please provide the licence.',
    createdAt: '2026-09-24T08:10:00.000Z',
  });
  const nmi = api.seedBinding({
    caseId: caseA.id,
    agencyId: agency.id,
    correspondenceId: nmiMessage.id,
    eventType: 'NMI',
  });
  const oldNmiMessage = api.seedCorrespondence({ agencyId: agency.id, subject: 'SYNTHETIC NMI 0' });
  const correctedNmi = api.seedBinding({
    caseId: caseA.id,
    agencyId: agency.id,
    correspondenceId: oldNmiMessage.id,
    eventType: 'NMI',
  });
  const correction = api.seedBinding({
    caseId: caseA.id,
    agencyId: agency.id,
    correspondenceId: oldNmiMessage.id,
    eventType: 'ACK',
    supersedesBindingId: correctedNmi.id,
  });
  const outbound = api.seedCorrespondence({
    agencyId: agency.id,
    direction: 'OUTBOUND',
    subject: 'SYNTHETIC notice',
    captureMode: 'OPERATOR_REPORTED',
    limitations: 'SYNTHETIC reported by the operator',
    attachmentsManifest: [
      { fileName: 'SYNTHETIC-licence.pdf', state: 'COPIED_TEXT_ALLEGATION' },
      { fileName: 'SYNTHETIC-<b>bold</b>.txt', sourceId: basis.id, state: 'UNKNOWN' },
    ],
    createdAt: '2026-09-24T08:20:00.000Z',
  });
  const sent = api.seedBinding({
    caseId: caseA.id,
    agencyId: agency.id,
    correspondenceId: outbound.id,
    eventType: 'INITIAL_AS_SENT',
    reportedItemId: item.id,
  });
  const sentAgain = api.seedBinding({
    caseId: caseA.id,
    agencyId: agency.id,
    correspondenceId: outbound.id,
    eventType: 'SUPPLEMENT_AS_SENT',
  });
  const outboundOther = api.seedBinding({
    caseId: caseA.id,
    agencyId: agency.id,
    correspondenceId: outbound.id,
    eventType: 'OTHER',
  });
  const bMessage = api.seedCorrespondence({ agencyId: agency.id, subject: 'SYNTHETIC-B-ONLY NMI' });
  const bNmi = api.seedBinding({
    caseId: caseB.id,
    agencyId: agency.id,
    correspondenceId: bMessage.id,
    eventType: 'NMI',
  });
  return {
    agency,
    owner,
    subject,
    route,
    signer,
    primary,
    basis,
    policy,
    mandate,
    version,
    coverage,
    coverageSigner,
    caseA,
    caseB,
    earlier,
    selection,
    item,
    work,
    mapping,
    permission,
    comparison,
    nmiMessage,
    nmi,
    correctedNmi,
    correction,
    outbound,
    sent,
    sentAgain,
    outboundOther,
    bMessage,
    bNmi,
  };
}
type World = ReturnType<typeof world>;

const manifest = (source: Record<string, unknown>) => ({
  sourceId: source['id'],
  role: source['sourceRole'],
  canonicalUrl: source['canonicalUrl'],
  contentSha256: source['contentSha256'],
  hashTarget: source['hashTarget'],
  provenance: source['reportedProvenance'],
  scopeText: source['scopeText'],
  limitations: source['limitations'],
});

/** A contract-valid view of case A (the fake assembles nothing; each test states the view). */
function viewOf(
  w: World,
  context: Partial<ProductionContext> = {},
  digest = 'a'.repeat(64),
): ContextView {
  const base = {
    schemaVersion: 'PFC-YT-EMAIL-v1.1',
    caseId: w.caseA.id,
    canonicalCaseId: null,
    taskType: 'INITIAL',
    generationMode: 'PREPARATION',
    caseContextRevision: 7,
    party: {
      agencyId: w.agency.id,
      ownerId: w.owner.id,
      legalSubjectId: w.subject.id,
      signerId: w.signer.id,
      agencyLegalName: 'SYNTHETIC A Agency Legal Name Ltd',
      legalSubjectName: 'SYNTHETIC Subject L LLC',
      signerFullLegalName: 'SYNTHETIC Signer Person',
    },
    authoritySelectionId: w.selection.id,
    reportedItems: [w.item],
    works: [w.work],
    mappings: [w.mapping],
    facts: [w.permission, w.comparison],
    sources: [manifest(w.primary), manifest(w.basis)],
    parentBindingId: null,
    priorCorrespondenceIds: [],
    missing: [
      {
        code: 'FACT_PROVENANCE_MISSING',
        message: `Fact ${w.permission.id} (PERMISSION) is recorded with provenance MISSING. It is not read as false, absent or negative.`,
        fieldPath: 'facts[0]',
      },
    ],
    conflicts: [
      {
        code: 'FACT_PROVENANCE_CONFLICT',
        message: `Fact ${w.comparison.id} (AV_COMPARISON) is recorded with provenance CONFLICT.`,
        fieldPath: 'facts[1]',
      },
    ],
    sourcePrecedence: 'CANONICAL_PRIMARY_RECORDS_OVER_APP_DERIVATIVES',
    signatureState: 'HUMAN_PENDING',
    externalAction: 'PROHIBITED',
    scannerVerification: 'DISABLED',
    authority: {
      selection: w.selection,
      coverages: [
        {
          coverage: w.coverage,
          version: w.version,
          signerScopes: [w.coverageSigner],
          authorityEvents: [],
        },
      ],
    },
    correspondence: [],
    policySources: [],
  };
  return ContextViewSchema.parse({
    contextRevision: 7,
    dependencyDigest: digest,
    dependencies: [
      {
        entityType: 'CaseRecord',
        entityId: w.caseA.id,
        rowVersion: 3,
        fingerprint: 'b'.repeat(64),
      },
    ],
    context: { ...base, ...context },
  });
}

/** Every context request the page made (query strings, in order; StrictMode may repeat a read). */
function contextRequests(api: FakeDirectory, caseId: string): string[] {
  return api.requests
    .filter((request) => request.path.startsWith(`/api/v1/cases/${caseId}/production-context`))
    .map((request) => new URL(request.path, 'http://app.invalid').search.slice(1));
}

/** The distinct scopes the page read, in the order first read. */
const contextQueries = (api: FakeDirectory, caseId: string) => [
  ...new Set(contextRequests(api, caseId)),
];

const answer = (view: ContextView) => () => json(200, { data: view, meta });

/**
 * The page's text nodes joined by spaces. textContent runs adjacent elements together ("G1 PASS"
 * followed by a label reads "G1 PASSSelection"), which a word-boundary scan would miss.
 */
function spacedText(): string {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    parts.push(node.textContent ?? '');
  }
  return parts.join(' ');
}

function actionTexts(): string[] {
  return all('[data-testid="production-context"] button, [data-testid="production-context"] a').map(
    (element) => element.textContent?.trim() ?? '',
  );
}

async function chooseRadio(name: string, value: string): Promise<void> {
  const radio = q(`input[name="${name}"][value="${value}"]`);
  if (!radio) throw new Error(`no radio ${name}=${value}`);
  await click(radio);
}

const optionValues = (selector: string) =>
  [...((q(selector) as HTMLSelectElement | null)?.options ?? [])].map((option) => ({
    value: option.value,
    disabled: option.disabled,
    text: option.textContent ?? '',
  }));

async function openContext(api: FakeDirectory, caseId: string, query?: ContextQuery) {
  await render(
    api,
    `/cases/${caseId}/production-context${query ? `?${contextQueryString(query)}` : ''}`,
  );
  await waitFor(() => q('[data-testid="production-context"]') !== null, 'the context page');
  await waitFor(() => q('form[aria-label="Context scope"]') !== null, 'the scope form');
}

describe('P4D production context page', () => {
  it('the case page opens it; the boundary statement is shown; nothing is preselected — not even the case’s current selection — and nothing is read before a task and a mode are chosen', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    await render(api, `/cases/${w.caseA.id}`);
    await waitFor(() => q('[data-testid="open-production-context"]') !== null, 'the case link');
    await click(q('[data-testid="open-production-context"]') as HTMLElement);
    await waitFor(() => q('form[aria-label="Context scope"]') !== null, 'the scope form');
    expect(q('[data-testid="context-boundary"]')?.textContent).toBe(CONTEXT_BOUNDARY);
    expect(CONTEXT_BOUNDARY).toBe(
      'This view assembles recorded case context. It does not determine G1–G7 or readiness.',
    );
    expect(
      all('input[type="radio"]').filter((radio) => (radio as HTMLInputElement).checked),
    ).toEqual([]);
    expect((q('#context-selection') as HTMLSelectElement).value).toBe('');
    const selections = optionValues('#context-selection');
    // Newest recorded first, as the list returns them; the current one is only labelled.
    expect(selections.map((option) => option.value)).toEqual(['', w.selection.id, w.earlier.id]);
    expect(selections[1]?.text).toContain('the case’s current selection');
    expect(selections[2]?.text).not.toContain('current');
    expect(q('[data-testid="context-idle"]')).not.toBeNull();
    await submit(q('form[aria-label="Context scope"]'));
    await until('Choose a task and a mode.');
    expect(contextQueries(api, w.caseA.id)).toEqual([]);
    expect(api.writes()).toEqual([]);
  });

  it('INITIAL + PREPARATION sends exactly the task and the mode; missing context and recorded conflicts are listed in their own treatments, never as a verdict; the fixed values and the digest are shown', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    const incomplete = viewOf(w, {
      authoritySelectionId: null,
      authority: null,
      party: {
        agencyId: w.agency.id,
        ownerId: w.owner.id,
        legalSubjectId: w.subject.id,
        signerId: null,
        agencyLegalName: 'SYNTHETIC A Agency Legal Name Ltd',
        legalSubjectName: 'SYNTHETIC Subject L LLC',
        signerFullLegalName: null,
      },
      missing: [
        {
          code: 'AUTHORITY_SELECTION_NOT_SELECTED',
          message: 'No authority selection is named for this context.',
          fieldPath: 'authoritySelectionId',
        },
        {
          code: 'FACT_PROVENANCE_MISSING',
          message: `Fact ${w.permission.id} (PERMISSION) is recorded with provenance MISSING. It is not read as false, absent or negative.`,
          fieldPath: 'facts[0]',
        },
      ],
    });
    api.contextReplies.set(w.caseA.id, answer(incomplete));
    await openContext(api, w.caseA.id);
    await chooseRadio('context-task', 'INITIAL');
    await chooseRadio('context-mode', 'PREPARATION');
    await submit(q('form[aria-label="Context scope"]'));
    await waitFor(() => q('[data-testid="context-result"]') !== null, 'the context');
    expect(contextQueries(api, w.caseA.id)).toEqual([
      'taskType=INITIAL&generationMode=PREPARATION',
    ]);
    const missing = all('[data-testid="missing-list"] li');
    expect(missing.map((item) => item.className)).toEqual(['context-missing', 'context-missing']);
    expect(missing[0]?.textContent).toContain('Missing context');
    expect(missing[0]?.textContent).toContain('AUTHORITY_SELECTION_NOT_SELECTED');
    expect(missing[1]?.textContent).toContain('It is not read as false, absent or negative.');
    const conflicts = all('[data-testid="conflict-list"] li');
    expect(conflicts.map((item) => item.className)).toEqual(['context-conflict']);
    expect(conflicts[0]?.textContent).toContain('Recorded conflict');
    expect(q('[data-testid="authority-none"]')).not.toBeNull();
    expect(q('[data-testid="authority-meaning"]')?.textContent).toBe(AUTHORITY_IN_CONTEXT);
    expect(q('[data-testid="dependency-digest"]')?.textContent).toBe('a'.repeat(64));
    for (const value of [
      'CANONICAL_PRIMARY_RECORDS_OVER_APP_DERIVATIVES',
      'HUMAN_PENDING',
      'PROHIBITED',
      'DISABLED',
    ]) {
      expect(pageText()).toContain(value);
    }
    expect(spacedText()).not.toMatch(FORBIDDEN_CLAIMS);
    expect(api.writes()).toEqual([]);
  });

  it('NMI_REPLY offers only this case’s NMI bindings as the parent and its bindings recorded as sent as priors — a corrected binding is not offered, OUTBOUND + OTHER never is — and sends exactly the named ids; switching to INITIAL drops them', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    api.contextReplies.set(w.caseA.id, answer(viewOf(w)));
    await openContext(api, w.caseA.id);
    expect(q('#context-parent')).toBeNull();
    expect(q('[data-testid="context-initial-selectors"]')).toBeNull();
    await chooseRadio('context-task', 'NMI_REPLY');
    const parents = optionValues('#context-parent');
    expect(parents.map((option) => option.value).sort()).toEqual(
      ['', w.nmi.id, w.correctedNmi.id].sort(),
    );
    expect(parents.find((option) => option.value === w.correctedNmi.id)?.disabled).toBe(true);
    expect(parents.map((option) => option.value)).not.toContain(w.bNmi.id);
    expect((q('#context-parent') as HTMLSelectElement).value).toBe('');
    const priors = all(
      '[data-testid="context-priors"] input[type="checkbox"]',
    ) as HTMLInputElement[];
    expect(priors.map((box) => box.value).sort()).toEqual([w.sent.id, w.sentAgain.id].sort());
    expect(priors.every((box) => !box.checked)).toBe(true);
    expect(priors.map((box) => box.value)).not.toContain(w.outboundOther.id);
    await type('#context-parent', w.nmi.id);
    const prior = (id: string) => priors.find((box) => box.value === id) as HTMLElement;
    await click(prior(w.sentAgain.id));
    await click(prior(w.sent.id));
    await chooseRadio('context-mode', 'DRAFTING');
    await type('#context-selection', w.earlier.id);
    await submit(q('form[aria-label="Context scope"]'));
    await waitFor(() => contextQueries(api, w.caseA.id).length === 1, 'the reply read');
    expect(contextQueries(api, w.caseA.id)[0]).toBe(
      contextQueryString({
        taskType: 'NMI_REPLY',
        generationMode: 'DRAFTING',
        authoritySelectionId: w.earlier.id,
        parentBindingId: w.nmi.id,
        priorBindingIds: [w.sentAgain.id, w.sent.id],
      }),
    );
    await waitFor(() => q('form[aria-label="Context scope"]') !== null, 'the form again');
    await chooseRadio('context-task', 'INITIAL');
    expect(q('#context-parent')).toBeNull();
    await submit(q('form[aria-label="Context scope"]'));
    await waitFor(() => contextQueries(api, w.caseA.id).length === 2, 'the initial read');
    expect(contextQueries(api, w.caseA.id)[1]).toBe(
      `taskType=INITIAL&generationMode=DRAFTING&authoritySelectionId=${w.earlier.id}`,
    );
    expect(api.writes()).toEqual([]);
  });

  it('a reply context shows every block as recorded: exact authority with the selection’s application scope, capture posture beside each message, the as-sent copy, attachment observations, one message once however often it is bound, captured text as inert text, and a MISSING fact never as a negative finding', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    const event = api.seedEvent({
      mandateId: w.mandate.id,
      agencyId: w.agency.id,
      eventType: 'TERMINATION',
      sourceId: w.primary.id,
      effectiveOn: '2026-01-31',
      scopeText: 'SYNTHETIC whole mandate',
      interpretation: 'SYNTHETIC operator reading',
    });
    const reply = viewOf(w, {
      taskType: 'NMI_REPLY',
      parentBindingId: w.nmi.id,
      priorCorrespondenceIds: [w.outbound.id],
      correspondence: [w.nmiMessage, w.outbound] as unknown as ProductionContext['correspondence'],
      policySources: [manifest(w.policy)] as unknown as ProductionContext['policySources'],
      authority: {
        selection: w.selection,
        coverages: [
          {
            coverage: w.coverage,
            version: w.version,
            signerScopes: [w.coverageSigner],
            authorityEvents: [event],
          },
        ],
      } as unknown as ProductionContext['authority'],
    });
    api.contextReplies.set(w.caseA.id, answer(reply));
    const scope: ContextQuery = {
      taskType: 'NMI_REPLY',
      generationMode: 'PREPARATION',
      authoritySelectionId: w.selection.id,
      parentBindingId: w.nmi.id,
      priorBindingIds: [w.sent.id, w.sentAgain.id],
    };
    await openContext(api, w.caseA.id, scope);
    await waitFor(() => q('[data-testid="context-result"]') !== null, 'the context');
    // The address holds the scope: the read happened without touching the form, exactly as named.
    expect(contextQueries(api, w.caseA.id)).toEqual([contextQueryString(scope)]);
    expect((q('#context-parent') as HTMLSelectElement).value).toBe(w.nmi.id);
    expect(q('[data-testid="authority-meaning"]')?.textContent).toBe(
      'Selected for evaluation; not a G1 decision.',
    );
    const authority = q('[data-testid="context-authority"]');
    expect(authority?.textContent).toContain(w.selection.id);
    await waitFor(() => q('[data-testid="application-scope"]') !== null, 'the application scope');
    expect(q('[data-testid="application-scope"]')?.textContent).toBe(
      'SYNTHETIC application scope A',
    );
    expect(q('[data-testid="context-events"]')?.textContent).toContain(
      'SYNTHETIC operator reading',
    );
    // Correspondence: two messages (the outbound one is bound twice as sent), posture as recorded.
    const messages = all('[data-testid="context-message"]');
    expect(messages).toHaveLength(2);
    const postures = all('[data-testid="context-message"] [data-testid="capture-mode"]').map(
      (tag) => tag.textContent,
    );
    expect(postures).toEqual([CAPTURE_MODE_LABEL.EXCERPT, CAPTURE_MODE_LABEL.OPERATOR_REPORTED]);
    expect(messages[0]?.textContent).toContain('Parent: request for more information');
    expect(messages[1]?.textContent).toContain('Prior transmission');
    expect(messages[1]?.textContent).toContain(AS_SENT_COPY);
    const body = q('[data-testid="context-message-body"]');
    expect(body?.tagName).toBe('PRE');
    expect(body?.textContent).toContain('<img src=x onerror="window.__pwned=1">');
    expect(q('[data-testid="context-correspondence"] img')).toBeNull();
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
    const attachments = all('[data-testid="context-attachments"] li').map((li) => li.textContent);
    expect(attachments[0]).toContain('SYNTHETIC-licence.pdf');
    expect(attachments[0]).toContain('Mentioned in copied text only');
    expect(attachments[1]).toContain('SYNTHETIC-<b>bold</b>.txt');
    expect(q('[data-testid="context-attachments"] b')).toBeNull();
    // Intake, facts and sources exactly as recorded.
    expect(q('[data-testid="context-items"]')?.textContent).toContain('SYNTHETICA1');
    expect(q('[data-testid="context-works"]')?.textContent).toContain('SYNTHETIC work A');
    expect(q('[data-testid="context-mappings"]')?.textContent).toContain('SYNTHETIC work A');
    const facts = all('[data-testid="context-fact"]');
    expect(facts[0]?.textContent).toContain('Missing');
    // The recorded finding row reads exactly as recorded (the type note quotes the other label).
    expect(facts[0]?.textContent).toContain(`What was reported${PERMISSION_FINDING_LABEL.UNKNOWN}`);
    expect(facts[0]?.textContent).not.toContain(
      `What was reported${PERMISSION_FINDING_LABEL.NO_PERMISSION_REPORTED}`,
    );
    expect(facts[1]?.textContent).toContain('Conflict');
    expect(all('[data-testid="context-sources"] [data-testid="manifest-entry"]')).toHaveLength(2);
    const policy = q('[data-testid="context-policy-sources"]');
    expect(policy?.textContent).toContain('https://policy.example.invalid/copyright');
    expect(q('[data-testid="context-policy-sources"] a[href^="https://"]')).toBeNull();
    expect(spacedText()).not.toMatch(FORBIDDEN_CLAIMS);
    expect(actionTexts().filter((text) => FORBIDDEN_ACTIONS.test(text))).toEqual([]);
    expect(api.writes()).toEqual([]);
  });

  it('DRAFTING refused: the reason and the gaps are shown and nothing is filled in; the preparation view is one step away; a repeated read asks again and nothing is written', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    api.contextReplies.set(w.caseA.id, (query) =>
      query.get('generationMode') === 'DRAFTING'
        ? failure(422, 'DRAFTING_INPUT_MISSING', {
            missing: ['AUTHORITY_SELECTION_NOT_SELECTED', 'REPORTED_ITEMS_ABSENT'],
          })
        : json(200, { data: viewOf(w), meta }),
    );
    await openContext(api, w.caseA.id, { taskType: 'INITIAL', generationMode: 'DRAFTING' });
    await waitFor(() => q('[data-testid="context-refusal"]') !== null, 'the refusal');
    const refusal = q('[data-testid="context-refusal"]');
    expect(refusal?.textContent).toContain('DRAFTING_INPUT_MISSING');
    expect(refusal?.textContent).toContain('Nothing was filled in');
    expect(all('[data-testid="refusal-missing"] li').map((li) => li.textContent)).toEqual([
      'Missing context AUTHORITY_SELECTION_NOT_SELECTED No authority selection is named.',
      'Missing context REPORTED_ITEMS_ABSENT No reported item is recorded.',
    ]);
    expect(q('[data-testid="context-result"]')).toBeNull();
    await click(byText('button', 'Show the preparation context'));
    await waitFor(() => q('[data-testid="context-result"]') !== null, 'the preparation context');
    // Its authority block has no recorded event: shown as selected, never as current or passed.
    expect(q('[data-testid="context-coverage"]')).not.toBeNull();
    expect(spacedText()).not.toMatch(FORBIDDEN_CLAIMS);
    expect(contextQueries(api, w.caseA.id)).toEqual([
      'taskType=INITIAL&generationMode=DRAFTING',
      'taskType=INITIAL&generationMode=PREPARATION',
    ]);
    const before = contextRequests(api, w.caseA.id).length;
    await click(byText('button', 'Read again'));
    await waitFor(() => contextRequests(api, w.caseA.id).length > before, 'the repeated read');
    expect(contextRequests(api, w.caseA.id).at(-1)).toBe(
      'taskType=INITIAL&generationMode=PREPARATION',
    );
    expect(api.writes()).toEqual([]);
  });

  it('keyboard focus follows a read asked for on the page — read again, show, the preparation view — to its outcome, since the control that asked is replaced while reading; arriving on the page moves no focus', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    api.contextReplies.set(w.caseA.id, (query) =>
      query.get('generationMode') === 'DRAFTING'
        ? failure(422, 'DRAFTING_INPUT_MISSING', { missing: ['REPORTED_ITEMS_ABSENT'] })
        : json(200, { data: viewOf(w), meta }),
    );
    const outcome = () => q('[data-testid="context-outcome"]');
    await openContext(api, w.caseA.id, { taskType: 'INITIAL', generationMode: 'PREPARATION' });
    await waitFor(() => q('[data-testid="context-result"]') !== null, 'the context on arrival');
    expect(document.activeElement).not.toBe(outcome());
    const before = contextRequests(api, w.caseA.id).length;
    await click(byText('button', 'Read again'));
    await waitFor(() => contextRequests(api, w.caseA.id).length > before, 'the repeated read');
    await waitFor(() => q('[data-testid="context-result"]') !== null, 'the context read again');
    expect(document.activeElement).toBe(outcome());
    await chooseRadio('context-mode', 'DRAFTING');
    await submit(q('form[aria-label="Context scope"]'));
    await waitFor(() => q('[data-testid="context-refusal"]') !== null, 'the refusal');
    expect(document.activeElement).toBe(outcome());
    expect(outcome()?.contains(q('[data-testid="context-refusal"]'))).toBe(true);
    await click(byText('button', 'Show the preparation context'));
    await waitFor(() => q('[data-testid="context-result"]') !== null, 'the preparation context');
    expect(document.activeElement).toBe(outcome());
    expect(contextQueries(api, w.caseA.id)).toEqual([
      'taskType=INITIAL&generationMode=PREPARATION',
      'taskType=INITIAL&generationMode=DRAFTING',
    ]);
    expect(api.writes()).toEqual([]);
  });

  it('selector refusals are shown as the server gave them — another case’s binding, a corrected binding, a binding not recorded as sent, reply selectors on an initial context, a context too large — and nothing is substituted', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    const cases: Array<[ContextQuery, number, string, Record<string, unknown>, string]> = [
      [
        { taskType: 'NMI_REPLY', generationMode: 'PREPARATION', parentBindingId: w.bNmi.id },
        422,
        'CROSS_CASE_REFERENCE',
        { field: 'parentBindingId', relation: 'record' },
        'belongs to another case',
      ],
      [
        { taskType: 'NMI_REPLY', generationMode: 'PREPARATION', priorBindingIds: [w.sent.id] },
        409,
        'BINDING_ALREADY_SUPERSEDED',
        { field: 'priorBindingIds.0', successorId: w.sentAgain.id },
        'Name the correction instead',
      ],
      [
        {
          taskType: 'NMI_REPLY',
          generationMode: 'PREPARATION',
          priorBindingIds: [w.outboundOther.id],
        },
        422,
        'PRIOR_BINDING_NOT_AS_SENT',
        { field: 'priorBindingIds.0', eventType: 'OTHER' },
        'a message’s direction never makes one',
      ],
      [
        { taskType: 'INITIAL', generationMode: 'PREPARATION', parentBindingId: w.nmi.id },
        422,
        'SELECTOR_NOT_FOR_TASK',
        { field: 'parentBindingId', taskType: 'INITIAL' },
        'An initial notice has no parent message',
      ],
      [
        { taskType: 'INITIAL', generationMode: 'PREPARATION' },
        409,
        'PRODUCTION_CONTEXT_TOO_LARGE',
        { field: 'reportedItems', count: 101, maximum: 100 },
        'Nothing is cut to fit',
      ],
      [
        { taskType: 'NMI_REPLY', generationMode: 'DRAFTING' },
        422,
        'REPLY_PARENT_REQUIRED',
        {
          field: 'parentBindingId',
          reason: 'NOT_SELECTED',
          missing: ['REPLY_PARENT_NOT_SELECTED'],
        },
        'none is chosen for you',
      ],
    ];
    for (const [scope, status, code, details, text] of cases) {
      api.contextReplies.set(w.caseA.id, () => failure(status, code, details));
      await openContext(api, w.caseA.id, scope);
      await waitFor(() => q('[data-testid="context-refusal"]') !== null, code);
      expect(q('[data-testid="context-refusal"]')?.textContent, code).toContain(text);
      expect(q('[data-testid="context-result"]'), code).toBeNull();
      // The address is sent as it is: nothing is dropped, corrected or chosen instead.
      expect(contextQueries(api, w.caseA.id).at(-1), code).toBe(contextQueryString(scope));
      await unmount();
    }
    expect(api.writes()).toEqual([]);
  });

  it('case isolation: another case’s page starts with no scope and offers only that case’s selections and bindings; nothing of the first case is shown', async () => {
    const api = new FakeDirectory();
    const w = world(api);
    api.contextReplies.set(w.caseA.id, answer(viewOf(w)));
    await openContext(api, w.caseA.id, { taskType: 'INITIAL', generationMode: 'PREPARATION' });
    await waitFor(() => q('[data-testid="context-result"]') !== null, 'case A context');
    await go(`/cases/${w.caseB.id}/production-context`);
    await waitFor(() => pageText().includes('SYNTHETIC Case B'), 'case B');
    await waitFor(() => q('form[aria-label="Context scope"]') !== null, 'case B form');
    expect(q('[data-testid="context-result"]')).toBeNull();
    expect(q('[data-testid="context-idle"]')).not.toBeNull();
    expect(optionValues('#context-selection').map((option) => option.value)).toEqual(['']);
    await chooseRadio('context-task', 'NMI_REPLY');
    expect(optionValues('#context-parent').map((option) => option.value)).toEqual(['', w.bNmi.id]);
    expect(all('[data-testid="context-priors"] input[type="checkbox"]')).toEqual([]);
    for (const id of [w.caseA.id, w.selection.id, w.nmi.id, w.item.id, w.permission.id]) {
      expect(pageText()).not.toContain(id);
    }
    expect(pageText()).not.toContain('SYNTHETIC Case A');
    expect(api.writes()).toEqual([]);
  });
});
