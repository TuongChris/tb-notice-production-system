// Production context (P4D): the recorded input of one case for one task, exactly as the API
// assembles it from one consistent snapshot (getProductionContext, TB-SCHEMA-API-v1.2.0). The page
// reads and decides nothing: no G1–G7 decision, readiness, approval, currentness, ownership,
// permission or infringement is shown or computed here, and nothing is written. Every selector is
// explicit — no authority selection, parent NMI or prior transmission is preselected, not even the
// case's current selection — and the scope lives in the address, so a reload reads the same scope
// again. Missing context stays missing and recorded conflicts stay visible, each with its own
// treatment; capture posture is shown as recorded; captured, source and fact text is plain text and
// no address in it is opened. There is no generate, approve, sign or send action here. The page is
// keyed by the case id, so nothing of one case carries over to another.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import type {
  CaseAuthoritySelection,
  CaseAuthoritySelectionView,
  ContextView,
  Correspondence,
  CorrespondenceBinding,
  MissingItem,
  SourceManifestEntry,
} from '@tb/contracts';
import { ApiError } from '../api/client.js';
import { contextQueryString, type ContextQuery, type Page } from '../api/directory.js';
import { Absent, Time } from '../directory/agencies.js';
import {
  ATTACHMENT_STATE_LABEL,
  BODY_ROLE_LABEL,
  BOUNDARY_CONVENTION_LABEL,
  CORRESPONDENCE_EVENT_LABEL,
  describeError,
  DIRECTION_LABEL,
  DOCUMENT_STATE_LABEL,
  EVENT_TYPE_LABEL,
  EXCLUSIVITY_LABEL,
  FACT_TYPE_LABEL,
  formatDateTime,
  HASH_TARGET_LABEL,
  PROVENANCE_LABEL,
  RESOLUTION_STATE_LABEL,
  REVIEW_STATE_LABEL,
  SCOPE_KIND_LABEL,
  SOURCE_ROLE_LABEL,
  TASK_TYPE_LABEL,
  VALIDITY_MODEL_LABEL,
} from '../directory/format.js';
import { useDirectoryApi, useLoad } from '../directory/hooks.js';
import { RecordName } from '../directory/lookup.js';
import { Breadcrumbs, Details, ErrorNotice, LoadingNotice, Section } from '../directory/ui.js';
import {
  AS_SENT_COPY,
  ATTACHMENTS_MEANING,
  CAPTURE_MODE_MEANING,
  CapturedText,
  CapturePosture,
  isAsSent,
} from '../correspondence/correspondence-ui.js';
import {
  ActionScopeText,
  NO_CURRENTNESS,
  RecordedDate,
  SourceCitation,
  VersionStamp,
} from '../representation/authority-ui.js';
import { FactValueDetails, ProvenanceText } from './facts.js';
import { ArchivedStamp, Milliseconds, mappingLabel, reportedItemLabel } from './intake-ui.js';

/** The permanent statement of what this view is (mission §35, verbatim). */
export const CONTEXT_BOUNDARY =
  'This view assembles recorded case context. It does not determine G1–G7 or readiness.';
/** The permanent authority copy of this view (mission §37, verbatim). */
export const AUTHORITY_IN_CONTEXT = 'Selected for evaluation; not a G1 decision.';
const SCOPE_MEANING =
  'Choose the task and the mode, and name any selection or binding yourself. Nothing is chosen for you — not the case’s current selection, the latest request for more information or any transmission recorded as sent.';
const READ_ONLY =
  'Showing the context only reads it: no record, revision or history changes, and nothing is sent.';
const MODE_MEANING = {
  PREPARATION: 'Assembles the recorded context and lists what is missing for the task.',
  DRAFTING:
    'Returns the context only when the required content of the task is recorded; otherwise it is refused with the gaps.',
} as const;
const MODES_NOT_READINESS = 'Neither mode is readiness, approval or a G1–G7 decision.';
const DIGEST_MEANING =
  'The dependency digest identifies exactly the records and the scope this context was assembled from; it changes when any of them changes. It is not an approval, a signature or a readiness state.';
const MISSING_MEANING =
  'Recorded information the task needs that this case does not hold. It is shown as missing — never read as false, negative or absent in law.';
const CONFLICT_MEANING =
  'Conflicts the records themselves state, and records kept although archived because an included record still names them. They are shown as recorded and are not resolved here.';
const SOURCES_MEANING =
  'Each source is a pointer to material kept elsewhere, at the exact revision this context relies on. Its address is not opened or fetched, a hash is not a review, and a source proves nothing by existing.';
const POLICY_MEANING =
  'Only policy references explicitly linked to this case. Nothing is added from the source registry.';
const PARTY_MEANING =
  'The owner and legal subject come only from the route bound to the case, the signer only from the selection named. Nothing is taken from names, the owner hint or a route default.';
const INTAKE_MEANING =
  'Exactly the case’s records as stored. A reported item is not an infringement finding, a work is not ownership proof and a mapping is not a copying verdict.';
const FACTS_MEANING =
  'The current revision of each fact chain, with its provenance and resolution state exactly as recorded. Earlier revisions stay in the fact’s history.';
const CORRESPONDENCE_MEANING =
  'Only the messages of the bindings named for this context, once each, with their capture posture as recorded. No outcome, receipt or transmission is inferred.';
const DEPENDENCIES_MEANING =
  'Every record the context was assembled from, with a fingerprint of its content. The row version is shown for information; the digest never depends on it.';
const FIXED_MEANING = {
  sourcePrecedence: 'Canonical primary records take precedence over anything this app derives.',
  signatureState: 'A human signer reviews, adopts, signs and sends outside this application.',
  externalAction: 'This application takes no external action.',
  scannerVerification: 'No scanner result is used or implied.',
} as const;

/** What each DRAFTING-blocking gap means (the refusal lists the codes; preparation explains them). */
const BLOCKING_TEXT: Record<string, string> = {
  CASE_ROUTE_UNBOUND:
    'No route is bound to this case, so its owner and legal subject are not resolved.',
  AUTHORITY_SELECTION_NOT_SELECTED: 'No authority selection is named.',
  REPORTED_ITEMS_ABSENT: 'No reported item is recorded.',
  WORKS_ABSENT: 'No work is recorded.',
  USE_MAPPINGS_ABSENT: 'No use mapping is recorded.',
  REPLY_PARENT_NOT_SELECTED:
    'No request for more information (NMI) binding is named as the parent of the reply.',
  PRIOR_AS_SENT_NOT_SELECTED: 'No prior transmission (a binding recorded as sent) is named.',
};

type Task = ContextQuery['taskType'];
type Mode = ContextQuery['generationMode'];
const TASKS: readonly Task[] = ['INITIAL', 'NMI_REPLY'];
const MODES: readonly Mode[] = ['PREPARATION', 'DRAFTING'];
const MODE_LABEL: Record<Mode, string> = { PREPARATION: 'Preparation', DRAFTING: 'Drafting' };
/** Pages of a case's selections or bindings loaded for the pickers (100 each). */
const PICKER_PAGES = 10;

/** The scope the address names, or null until a task and a mode are chosen. Nothing is dropped. */
function scopeOf(params: URLSearchParams): ContextQuery | null {
  const taskType = params.get('taskType');
  const generationMode = params.get('generationMode');
  if (!TASKS.includes(taskType as Task) || !MODES.includes(generationMode as Mode)) return null;
  return {
    taskType: taskType as Task,
    generationMode: generationMode as Mode,
    authoritySelectionId: params.get('authoritySelectionId'),
    parentBindingId: params.get('parentBindingId'),
    priorBindingIds: params.getAll('priorBindingIds'),
  };
}

async function allPages<T>(load: (cursor: string | undefined) => Promise<Page<T>>): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < PICKER_PAGES; page += 1) {
    const next = await load(cursor);
    items.push(...next.items);
    if (next.nextCursor === null) break;
    cursor = next.nextCursor;
  }
  return items;
}

interface Choices {
  readonly selections: CaseAuthoritySelection[];
  readonly bindings: CorrespondenceBinding[];
}

export function ProductionContextPage() {
  const { id = '' } = useParams();
  return <ProductionContext key={id} caseId={id} />;
}

function ProductionContext({ caseId }: { caseId: string }) {
  const api = useDirectoryApi();
  const [params, setParams] = useSearchParams();
  const scope = scopeOf(params);
  // Focus follows a read asked for on this page, never arriving on it: the control that asked is
  // replaced while the context is read.
  const [focusOutcome, setFocusOutcome] = useState(false);
  function show(query: ContextQuery) {
    setFocusOutcome(true);
    setParams(contextQueryString(query));
  }
  const [caseState] = useLoad(`context-case:${caseId}`, () => api.cases.get(caseId));
  const [choices] = useLoad<Choices>(`context-choices:${caseId}`, async () => {
    const [selections, bindings] = await Promise.all([
      allPages((cursor) =>
        api.cases.selections.list(caseId, { limit: 100, ...(cursor ? { cursor } : {}) }),
      ),
      allPages((cursor) =>
        api.correspondence.bindings.list(caseId, { limit: 100, ...(cursor ? { cursor } : {}) }),
      ),
    ]);
    return { selections, bindings };
  });
  const trail = [['Cases', '/cases']] as const;
  if (caseState.status === 'loading') return <LoadingNotice label="Loading case…" />;
  if (caseState.status === 'error') {
    return (
      <>
        <Breadcrumbs trail={[...trail, ['Production context', null]]} />
        <ErrorNotice error={caseState.error} recordLabel="case" />
      </>
    );
  }
  const record = caseState.value.data;
  return (
    <article className="sheet" data-testid="production-context">
      <Breadcrumbs
        trail={[...trail, [record.intakeLabel, `/cases/${caseId}`], ['Production context', null]]}
      />
      <header className="record-header">
        <h1 className="record-name">Production context</h1>
        <div className="record-facts">
          <span className="record-fact">{record.intakeLabel}</span>
          <span className="record-fact">Case context revision {record.contextRevision}</span>
        </div>
        <p className="context-boundary" role="note" data-testid="context-boundary">
          {CONTEXT_BOUNDARY}
        </p>
        <p className="record-boundary">{READ_ONLY}</p>
      </header>
      {choices.status === 'loading' && <LoadingNotice label="Loading this case’s records…" />}
      {choices.status === 'error' && <ErrorNotice error={choices.error} recordLabel="case" />}
      {choices.status === 'ready' && (
        <ScopeForm
          key={params.toString()}
          choices={choices.value}
          currentSelectionId={record.currentAuthoritySelectionId}
          initial={scope}
          onShow={show}
        />
      )}
      {scope === null ? (
        <p className="notice notice-quiet" data-testid="context-idle">
          Choose a task and a mode, then show the context. Nothing is read until you do.
        </p>
      ) : (
        <ContextRead
          caseId={caseId}
          scope={scope}
          bindings={choices.status === 'ready' ? choices.value.bindings : []}
          focusOnShow={focusOutcome}
          onAsk={() => setFocusOutcome(true)}
          onPreparation={() => show({ ...scope, generationMode: 'PREPARATION' })}
        />
      )}
    </article>
  );
}

/** Corrected bindings: a later binding names them as the one it corrects. */
function correctedIds(bindings: readonly CorrespondenceBinding[]): Set<string> {
  return new Set(
    bindings
      .map((binding) => binding.supersedesBindingId)
      .filter((id): id is string => id !== null),
  );
}

function selectionLabel(selection: CaseAuthoritySelection, currentId: string | null): string {
  return [
    `Recorded ${formatDateTime(selection.createdAt)}`,
    TASK_TYPE_LABEL[selection.taskType],
    `id ${selection.id}`,
    ...(selection.id === currentId ? ['the case’s current selection'] : []),
  ].join(' · ');
}

function bindingLabel(binding: CorrespondenceBinding): string {
  return [
    CORRESPONDENCE_EVENT_LABEL[binding.eventType],
    `recorded ${formatDateTime(binding.createdAt)}`,
    `id ${binding.id}`,
  ].join(' · ');
}

function ScopeForm({
  choices,
  currentSelectionId,
  initial,
  onShow,
}: {
  choices: Choices;
  currentSelectionId: string | null;
  initial: ContextQuery | null;
  onShow: (query: ContextQuery) => void;
}) {
  const [task, setTask] = useState<Task | ''>(initial?.taskType ?? '');
  const [mode, setMode] = useState<Mode | ''>(initial?.generationMode ?? '');
  const [selectionId, setSelectionId] = useState(initial?.authoritySelectionId ?? '');
  const [parentId, setParentId] = useState(initial?.parentBindingId ?? '');
  const [priorIds, setPriorIds] = useState<readonly string[]>(initial?.priorBindingIds ?? []);
  const [problem, setProblem] = useState<string | null>(null);
  const corrected = correctedIds(choices.bindings);
  const nmis = choices.bindings.filter((binding) => binding.eventType === 'NMI');
  const sent = choices.bindings.filter((binding) => isAsSent(binding.eventType));
  const reply = task === 'NMI_REPLY';

  function chooseTask(next: Task) {
    setTask(next);
    // An initial notice has no parent message and no prior transmissions: none is kept or sent.
    if (next === 'INITIAL') {
      setParentId('');
      setPriorIds([]);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (task === '' || mode === '') {
      setProblem('Choose a task and a mode.');
      return;
    }
    setProblem(null);
    onShow({
      taskType: task,
      generationMode: mode,
      authoritySelectionId: selectionId === '' ? null : selectionId,
      parentBindingId: reply && parentId !== '' ? parentId : null,
      priorBindingIds: reply ? priorIds : [],
    });
  }

  return (
    <form className="record-form context-scope" onSubmit={onSubmit} aria-label="Context scope">
      <p className="hint">{SCOPE_MEANING}</p>
      <div className="field-grid">
        <fieldset className="fieldset" data-testid="context-task">
          <legend>Task</legend>
          {TASKS.map((value) => (
            <label key={value} className="choice">
              <input
                type="radio"
                name="context-task"
                value={value}
                checked={task === value}
                onChange={() => chooseTask(value)}
              />
              <span className="choice-text">
                <span className="choice-title">{TASK_TYPE_LABEL[value]}</span>
                <span className="choice-meta">{value}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <fieldset className="fieldset" data-testid="context-mode">
          <legend>Mode</legend>
          {MODES.map((value) => (
            <label key={value} className="choice">
              <input
                type="radio"
                name="context-mode"
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
              />
              <span className="choice-text">
                <span className="choice-title">{MODE_LABEL[value]}</span>
                <span className="choice-meta">{MODE_MEANING[value]}</span>
              </span>
            </label>
          ))}
          <p className="hint">{MODES_NOT_READINESS}</p>
        </fieldset>
      </div>
      <div className="field">
        <label htmlFor="context-selection">Authority selection (optional)</label>
        <select
          id="context-selection"
          value={selectionId}
          onChange={(event) => setSelectionId(event.target.value)}
        >
          <option value="">No selection named</option>
          {choices.selections.map((selection) => (
            <option key={selection.id} value={selection.id}>
              {selectionLabel(selection, currentSelectionId)}
            </option>
          ))}
        </select>
        <p className="hint">
          {choices.selections.length === 0
            ? 'This case has no authority selection.'
            : 'Only this case’s selections. Without one, the context has no authority and no signer.'}
        </p>
      </div>
      {reply ? (
        <>
          <div className="field">
            <label htmlFor="context-parent">Parent: the NMI binding this reply answers</label>
            <select
              id="context-parent"
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
            >
              <option value="">No parent named</option>
              {nmis.map((binding) => (
                <option key={binding.id} value={binding.id} disabled={corrected.has(binding.id)}>
                  {bindingLabel(binding)}
                  {corrected.has(binding.id) ? ' · corrected by a later binding' : ''}
                </option>
              ))}
            </select>
            <p className="hint">
              {nmis.length === 0
                ? 'This case has no binding recorded as a request for more information.'
                : 'Only this case’s bindings recorded as a request for more information (NMI). A corrected binding is not offered: name its correction.'}
            </p>
          </div>
          <fieldset className="fieldset checkbox-list" data-testid="context-priors">
            <legend>Prior transmissions (bindings recorded as sent)</legend>
            {sent.length === 0 && (
              <p className="absent">This case has no binding recorded as sent.</p>
            )}
            {sent.map((binding) => (
              <label
                key={binding.id}
                className={`checkbox${corrected.has(binding.id) ? ' choice-disabled' : ''}`}
              >
                <input
                  type="checkbox"
                  value={binding.id}
                  disabled={corrected.has(binding.id)}
                  checked={priorIds.includes(binding.id)}
                  onChange={(event) =>
                    setPriorIds(
                      event.target.checked
                        ? [...priorIds, binding.id]
                        : priorIds.filter((id) => id !== binding.id),
                    )
                  }
                />
                {bindingLabel(binding)}
                {corrected.has(binding.id) ? ' · corrected by a later binding' : ''}
              </label>
            ))}
            <p className="hint">
              Only bindings recorded as sent. An outbound message is not a transmission unless a
              binding records it as sent, and none is added for you.
            </p>
          </fieldset>
        </>
      ) : (
        task === 'INITIAL' && (
          <p className="hint" data-testid="context-initial-selectors">
            An initial notice has no parent message and no prior transmissions.
          </p>
        )
      )}
      {problem && (
        <p className="field-error" role="alert">
          {problem}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="button button-primary">
          Show context
        </button>
      </div>
    </form>
  );
}

function ContextRead({
  caseId,
  scope,
  bindings,
  focusOnShow,
  onAsk,
  onPreparation,
}: {
  caseId: string;
  scope: ContextQuery;
  bindings: readonly CorrespondenceBinding[];
  /** Move focus to the outcome once it is shown (a read asked for on this page). */
  focusOnShow: boolean;
  /** A read is asked for here (Read again). */
  onAsk: () => void;
  onPreparation: () => void;
}) {
  const api = useDirectoryApi();
  const key = `context:${caseId}:${contextQueryString(scope)}`;
  const [state, reload] = useLoad(key, () => api.cases.productionContext(caseId, scope));
  const outcome = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusOnShow && state.status !== 'loading') outcome.current?.focus();
  }, [focusOnShow, state]);
  if (state.status === 'loading') return <LoadingNotice label="Reading the context…" />;
  return (
    <div ref={outcome} tabIndex={-1} className="context-outcome" data-testid="context-outcome">
      {state.status === 'error' ? (
        <ContextRefusal error={state.error} scope={scope} onPreparation={onPreparation} />
      ) : (
        <ContextResult
          view={state.value}
          caseId={caseId}
          bindings={bindings}
          onReload={() => {
            onAsk();
            reload();
          }}
        />
      )}
    </div>
  );
}

/** A refused read: the reason, and for DRAFTING the gaps it names (nothing is filled in). */
function ContextRefusal({
  error,
  scope,
  onPreparation,
}: {
  error: unknown;
  scope: ContextQuery;
  onPreparation: () => void;
}) {
  const missing =
    error instanceof ApiError && Array.isArray(error.details['missing'])
      ? error.details['missing'].map(String)
      : [];
  return (
    <div className="notice notice-error" role="alert" data-testid="context-refusal">
      <p>
        <strong>The context was not returned.</strong> {describeError(error, 'record')}
        {error instanceof ApiError && <code className="context-code"> {error.code}</code>}
      </p>
      {missing.length > 0 && (
        <ul className="context-list" data-testid="refusal-missing">
          {missing.map((code) => (
            <li key={code} className="context-missing">
              <span className="tag">Missing context</span> <code>{code}</code>{' '}
              {BLOCKING_TEXT[code] ?? ''}
            </li>
          ))}
        </ul>
      )}
      {scope.generationMode === 'DRAFTING' && missing.length > 0 && (
        <button type="button" className="button" onClick={onPreparation}>
          Show the preparation context
        </button>
      )}
    </div>
  );
}

function ContextResult({
  view,
  caseId,
  bindings,
  onReload,
}: {
  view: ContextView;
  caseId: string;
  bindings: readonly CorrespondenceBinding[];
  onReload: () => void;
}) {
  const context = view.context;
  return (
    <div className="context-result" data-testid="context-result">
      <Section
        title="Context"
        actions={
          <button type="button" className="button" onClick={onReload}>
            Read again
          </button>
        }
      >
        <Details
          rows={[
            ['Task', `${TASK_TYPE_LABEL[context.taskType]} (${context.taskType})`],
            ['Mode', `${MODE_LABEL[context.generationMode]} (${context.generationMode})`],
            ['Form contract', context.schemaVersion],
            [
              'Context revision',
              <span data-testid="context-revision">{view.contextRevision}</span>,
            ],
            [
              'Dependency digest',
              <code className="digest" data-testid="dependency-digest">
                {view.dependencyDigest}
              </code>,
            ],
            ['Canonical case id', context.canonicalCaseId],
          ]}
        />
        <p className="hint">{DIGEST_MEANING}</p>
      </Section>
      <MissingSection items={context.missing} />
      <ConflictSection items={context.conflicts} />
      <PartySection view={view} />
      <AuthoritySection caseId={caseId} authority={context.authority} />
      <IntakeSections view={view} caseId={caseId} />
      <FactsSection view={view} caseId={caseId} />
      <ManifestSection
        title="Sources"
        testId="context-sources"
        entries={context.sources}
        meaning={SOURCES_MEANING}
        empty="No source is part of this context."
      />
      <ManifestSection
        title="Policy sources"
        testId="context-policy-sources"
        entries={context.policySources}
        meaning={POLICY_MEANING}
        empty="No policy source is linked to this case."
      />
      <CorrespondenceSection view={view} bindings={bindings} />
      <Section title="Fixed values">
        <Details
          rows={[
            [
              'Source precedence',
              <FixedValue
                value={context.sourcePrecedence}
                meaning={FIXED_MEANING.sourcePrecedence}
              />,
            ],
            [
              'Signature',
              <FixedValue value={context.signatureState} meaning={FIXED_MEANING.signatureState} />,
            ],
            [
              'External action',
              <FixedValue value={context.externalAction} meaning={FIXED_MEANING.externalAction} />,
            ],
            [
              'Scanner verification',
              <FixedValue
                value={context.scannerVerification}
                meaning={FIXED_MEANING.scannerVerification}
              />,
            ],
          ]}
        />
      </Section>
      <DependenciesSection view={view} />
    </div>
  );
}

function FixedValue({ value, meaning }: { value: string; meaning: string }) {
  return (
    <>
      <code>{value}</code> <span className="hint">{meaning}</span>
    </>
  );
}

function ItemPath({ item }: { item: MissingItem }) {
  return item.fieldPath ? <code className="context-path">{item.fieldPath}</code> : null;
}

function MissingSection({ items }: { items: readonly MissingItem[] }) {
  return (
    <Section title={`Missing context (${items.length})`}>
      <p className="hint">{MISSING_MEANING}</p>
      {items.length === 0 ? (
        <p className="absent" data-testid="missing-none">
          No missing context is listed for this task and mode. That is not readiness.
        </p>
      ) : (
        <ul className="context-list" data-testid="missing-list">
          {items.map((item, index) => (
            <li key={`${item.code}:${index}`} className="context-missing">
              <span className="tag">Missing context</span> <code>{item.code}</code>{' '}
              <ItemPath item={item} />
              <span className="context-message">{item.message}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function ConflictSection({ items }: { items: readonly MissingItem[] }) {
  return (
    <Section title={`Recorded conflicts (${items.length})`}>
      <p className="hint">{CONFLICT_MEANING}</p>
      {items.length === 0 ? (
        <p className="absent" data-testid="conflicts-none">
          No recorded conflict is listed.
        </p>
      ) : (
        <ul className="context-list" data-testid="conflict-list">
          {items.map((item, index) => (
            <li key={`${item.code}:${index}`} className="context-conflict">
              <span className="tag tag-conflict">Recorded conflict</span> <code>{item.code}</code>{' '}
              <ItemPath item={item} />
              <span className="context-message">{item.message}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function PartySection({ view }: { view: ContextView }) {
  const party = view.context.party;
  const named = (text: string | null, record: ReactNode) =>
    text === null && record === null ? null : (
      <>
        {record}
        {text !== null && <span className="choice-meta"> Legal name as recorded: {text}</span>}
      </>
    );
  return (
    <Section title="Party">
      <div data-testid="context-party">
        <Details
          rows={[
            [
              'Agency',
              named(party.agencyLegalName, <RecordName kind="agency" id={party.agencyId} />),
            ],
            [
              'Owner',
              party.ownerId === null ? null : <RecordName kind="owner" id={party.ownerId} />,
            ],
            [
              'Legal subject',
              named(
                party.legalSubjectName,
                party.legalSubjectId === null ? null : (
                  <RecordName kind="legalSubject" id={party.legalSubjectId} />
                ),
              ),
            ],
            [
              'Signer (from the selection)',
              named(
                party.signerFullLegalName,
                party.signerId === null ? null : <RecordName kind="signer" id={party.signerId} />,
              ),
            ],
          ]}
        />
      </div>
      <p className="hint">{PARTY_MEANING}</p>
    </Section>
  );
}

function AuthoritySection({
  caseId,
  authority,
}: {
  caseId: string;
  authority: ContextView['context']['authority'];
}) {
  return (
    <Section title="Authority">
      <p className="selection-meaning" role="note" data-testid="authority-meaning">
        {AUTHORITY_IN_CONTEXT}
      </p>
      {authority === null ? (
        <p className="absent" data-testid="authority-none">
          No authority selection is named for this context, so it has no authority records and no
          signer.
        </p>
      ) : (
        <AuthorityRecords caseId={caseId} authority={authority} />
      )}
      <p className="hint">{NO_CURRENTNESS}</p>
    </Section>
  );
}

function AuthorityRecords({
  caseId,
  authority,
}: {
  caseId: string;
  authority: NonNullable<ContextView['context']['authority']>;
}) {
  const api = useDirectoryApi();
  const { selection } = authority;
  // The application scope of each pinned coverage, read back exactly as recorded (R8 read-back).
  const [pinned] = useLoad<CaseAuthoritySelectionView>(
    `context-selection:${caseId}:${selection.id}`,
    () => api.cases.selections.get(caseId, selection.id),
  );
  const scopeOf = (coverageId: string) =>
    pinned.status === 'ready'
      ? (pinned.value.coverages.find((row) => row.coverageId === coverageId)?.applicationScope ??
        null)
      : null;
  return (
    <div data-testid="context-authority">
      <Details
        rows={[
          [
            'Selection',
            <Link to={`/cases/${caseId}/authority-selections/${selection.id}`}>
              <code>{selection.id}</code>
            </Link>,
          ],
          ['Recorded', <Time iso={selection.createdAt} />],
          ['Task recorded with the selection', TASK_TYPE_LABEL[selection.taskType]],
          ['Signer', <RecordName kind="signer" id={selection.signerId} />],
          ['Intended sending address', selection.intendedFromEmail],
          [
            'Selection note',
            selection.selectionNote && <span className="prose">{selection.selectionNote}</span>,
          ],
          [
            'Basis source',
            selection.basisSourceId && <SourceCitation sourceId={selection.basisSourceId} />,
          ],
        ]}
      />
      {authority.coverages.map((block) => (
        <div key={block.coverage.id} className="context-block" data-testid="context-coverage">
          <h3>
            Coverage: {block.coverage.coverageLabel}{' '}
            <span className="choice-meta">({block.coverage.id})</span>
          </h3>
          <Details
            rows={[
              ['Route', <RecordName kind="route" id={block.coverage.routeId} />],
              ['Action scope', <ActionScopeText scope={block.coverage.actionScope} />],
              ['Effective on (as recorded)', <RecordedDate value={block.coverage.effectiveOn} />],
              ['Expires on (as recorded)', <RecordedDate value={block.coverage.expiresOn} />],
              ['Exclusivity', EXCLUSIVITY_LABEL[block.coverage.exclusivity]],
              [
                'Covered works',
                block.coverage.coveredWorksScope && (
                  <span className="prose">{block.coverage.coveredWorksScope}</span>
                ),
              ],
              [
                'Territory',
                block.coverage.territorialScope && (
                  <span className="prose">{block.coverage.territorialScope}</span>
                ),
              ],
              [
                'Exclusions',
                block.coverage.exclusions && (
                  <span className="prose">{block.coverage.exclusions}</span>
                ),
              ],
              [
                'Conditions',
                block.coverage.conditions && (
                  <span className="prose">{block.coverage.conditions}</span>
                ),
              ],
              ['Basis source', <SourceCitation sourceId={block.coverage.basisSourceId} />],
              [
                'Application scope recorded with the selection',
                pinned.status === 'loading' ? (
                  <span className="hint">Loading…</span>
                ) : (
                  scopeOf(block.coverage.id) && (
                    <span className="prose" data-testid="application-scope">
                      {scopeOf(block.coverage.id)}
                    </span>
                  )
                ),
              ],
            ]}
          />
          <h4>
            Mandate version {block.version.version}{' '}
            <VersionStamp state={block.version.versionState} />
          </h4>
          <Details
            rows={[
              ['Mandate', <RecordName kind="mandate" id={block.version.mandateId} />],
              ['Document', DOCUMENT_STATE_LABEL[block.version.documentState]],
              ['Source review', REVIEW_STATE_LABEL[block.version.sourceReviewState]],
              ['Validity model (as recorded)', VALIDITY_MODEL_LABEL[block.version.validityModel]],
              ['Primary source', <SourceCitation sourceId={block.version.primarySourceId} />],
            ]}
          />
          <h4>Coverage signer rows of the selected signer ({block.signerScopes.length})</h4>
          {block.signerScopes.length === 0 ? (
            <p className="absent">None recorded.</p>
          ) : (
            <ul className="plain-list">
              {block.signerScopes.map((row) => (
                <li key={row.id}>
                  <Details
                    rows={[
                      ['Capacity', row.capacity],
                      ['Action scope', <ActionScopeText scope={row.actionScope} />],
                      ['Effective on (as recorded)', <RecordedDate value={row.effectiveOn} />],
                      ['Ends on (as recorded)', <RecordedDate value={row.endsOn} />],
                      [
                        'Limitations',
                        row.limitations && <span className="prose">{row.limitations}</span>,
                      ],
                      ['Source', <SourceCitation sourceId={row.sourceId} />],
                    ]}
                  />
                </li>
              ))}
            </ul>
          )}
          <h4>Authority events ({block.authorityEvents.length})</h4>
          {block.authorityEvents.length === 0 ? (
            <p className="absent" data-testid="events-none">
              No authority event is recorded for this mandate or coverage. That does not make it
              current.
            </p>
          ) : (
            <ol className="plain-list" data-testid="context-events">
              {block.authorityEvents.map((event) => (
                <li key={event.id}>
                  <Details
                    rows={[
                      ['Event', `${EVENT_TYPE_LABEL[event.eventType]} (as recorded)`],
                      ['Scope', event.coverageId === null ? 'The whole mandate' : 'This coverage'],
                      ['Provenance', <ProvenanceText provenance={event.provenance} />],
                      ['Effective on (as recorded)', <RecordedDate value={event.effectiveOn} />],
                      [
                        'Effective at (as recorded)',
                        event.effectiveAt && <Time iso={event.effectiveAt} />,
                      ],
                      ['Effective (raw text)', event.rawEffectiveText],
                      ['Recorded in TB', <Time iso={event.createdAt} />],
                      ['Scope text', <span className="prose">{event.scopeText}</span>],
                      ['Interpretation', <span className="prose">{event.interpretation}</span>],
                      ['Source', <SourceCitation sourceId={event.sourceId} />],
                    ]}
                  />
                </li>
              ))}
            </ol>
          )}
        </div>
      ))}
    </div>
  );
}

function IntakeSections({ view, caseId }: { view: ContextView; caseId: string }) {
  const { reportedItems, works, mappings } = view.context;
  return (
    <>
      <Section title={`Reported items (${reportedItems.length})`}>
        <p className="hint">{INTAKE_MEANING}</p>
        {reportedItems.length === 0 ? (
          <p className="absent">None recorded.</p>
        ) : (
          <div className="table-frame">
            <table className="records" data-testid="context-items">
              <thead>
                <tr>
                  <th scope="col">Reported item</th>
                  <th scope="col">Video id</th>
                  <th scope="col">Address (not opened)</th>
                  <th scope="col">Observed</th>
                </tr>
              </thead>
              <tbody>
                {reportedItems.map((item) => (
                  <tr key={item.id}>
                    <th scope="row">
                      <Link to={`/cases/${caseId}/reported-items/${item.id}`}>
                        {reportedItemLabel(item)}
                      </Link>{' '}
                      <ArchivedStamp archivedAt={item.archivedAt} />
                    </th>
                    <td>
                      <code>{item.externalItemId}</code>
                    </td>
                    <td>
                      <code className="context-url">{item.normalizedUrl}</code>
                    </td>
                    <td>
                      <Time iso={item.observedAt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      <Section title={`Works (${works.length})`}>
        {works.length === 0 ? (
          <p className="absent">None recorded.</p>
        ) : (
          <div className="table-frame">
            <table className="records" data-testid="context-works">
              <thead>
                <tr>
                  <th scope="col">Work</th>
                  <th scope="col">Type</th>
                  <th scope="col">External id</th>
                  <th scope="col">Source address (not opened)</th>
                </tr>
              </thead>
              <tbody>
                {works.map((work) => (
                  <tr key={work.id}>
                    <th scope="row">
                      <Link to={`/cases/${caseId}/works/${work.id}`}>{work.title}</Link>{' '}
                      <ArchivedStamp archivedAt={work.archivedAt} />
                    </th>
                    <td>{work.workType ?? <Absent />}</td>
                    <td>{work.externalWorkId ?? <Absent />}</td>
                    <td>
                      {work.sourceUrl === null ? (
                        <Absent />
                      ) : (
                        <code className="context-url">{work.sourceUrl}</code>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      <Section title={`Use mappings (${mappings.length})`}>
        {mappings.length === 0 ? (
          <p className="absent">None recorded.</p>
        ) : (
          <div className="table-frame">
            <table className="records" data-testid="context-mappings">
              <thead>
                <tr>
                  <th scope="col">Mapping (shown as recorded, not as an infringement verdict)</th>
                  <th scope="col">Work time</th>
                  <th scope="col">Reported item time</th>
                  <th scope="col">Boundary</th>
                  <th scope="col">Provenance</th>
                  <th scope="col">Basis source</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((mapping) => (
                  <tr key={mapping.id}>
                    <th scope="row">
                      <Link to={`/cases/${caseId}/mappings/${mapping.id}`}>
                        {mappingLabel(mapping, works, reportedItems)}
                      </Link>{' '}
                      <ArchivedStamp archivedAt={mapping.archivedAt} />
                    </th>
                    <td>
                      <Milliseconds value={mapping.sourceStartMs} /> –{' '}
                      <Milliseconds value={mapping.sourceEndMs} />
                    </td>
                    <td>
                      <Milliseconds value={mapping.reportedStartMs} /> –{' '}
                      <Milliseconds value={mapping.reportedEndMs} />
                    </td>
                    <td>
                      {BOUNDARY_CONVENTION_LABEL[mapping.boundaryConvention] ??
                        mapping.boundaryConvention}
                    </td>
                    <td>
                      <ProvenanceText provenance={mapping.provenance} />
                    </td>
                    <td>
                      <SourceCitation sourceId={mapping.basisSourceId} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}

function FactsSection({ view, caseId }: { view: ContextView; caseId: string }) {
  const facts = view.context.facts;
  return (
    <Section title={`Facts (${facts.length})`}>
      <p className="hint">{FACTS_MEANING}</p>
      {facts.length === 0 ? (
        <p className="absent">None recorded.</p>
      ) : (
        <ol className="plain-list" data-testid="context-facts">
          {facts.map((fact) => (
            <li key={fact.id} className="context-block" data-testid="context-fact">
              <h3>
                <Link to={`/cases/${caseId}/facts/${fact.id}`}>
                  {FACT_TYPE_LABEL[fact.factType]}
                </Link>{' '}
                <span className="choice-meta">revision {fact.revision}</span>
              </h3>
              <Details
                rows={[
                  ['Scope', SCOPE_KIND_LABEL[fact.scopeKind]],
                  ['Provenance', <ProvenanceText provenance={fact.provenance} />],
                  ['Raw provenance', fact.rawProvenance],
                  ['Resolution state (as recorded)', RESOLUTION_STATE_LABEL[fact.resolutionState]],
                  ['Asserted by', fact.assertedByLabel],
                  ['Asserted as of', fact.assertedAsOf && <Time iso={fact.assertedAsOf} />],
                  ['Scope text', <span className="prose">{fact.scopeText}</span>],
                  [
                    'Limitations',
                    fact.limitations && <span className="prose">{fact.limitations}</span>,
                  ],
                  ['Change reason', <span className="prose">{fact.changeReason}</span>],
                ]}
              />
              <FactValueDetails fact={fact} />
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

function ManifestSection({
  title,
  testId,
  entries,
  meaning,
  empty,
}: {
  title: string;
  testId: string;
  entries: readonly SourceManifestEntry[];
  meaning: string;
  empty: string;
}) {
  return (
    <Section title={`${title} (${entries.length})`}>
      <p className="hint">{meaning}</p>
      {entries.length === 0 ? (
        <p className="absent">{empty}</p>
      ) : (
        <ol className="plain-list" data-testid={testId}>
          {entries.map((entry) => (
            <li key={entry.sourceId} className="context-block" data-testid="manifest-entry">
              <Details
                rows={[
                  ['Source revision', <SourceCitation sourceId={entry.sourceId} />],
                  ['Source id', <code>{entry.sourceId}</code>],
                  [
                    'Role',
                    SOURCE_ROLE_LABEL[entry.role as keyof typeof SOURCE_ROLE_LABEL] ?? entry.role,
                  ],
                  ['Reported provenance', PROVENANCE_LABEL[entry.provenance]],
                  [
                    'Canonical address (not opened)',
                    entry.canonicalUrl && <code className="context-url">{entry.canonicalUrl}</code>,
                  ],
                  [
                    'Content SHA-256 (as recorded)',
                    entry.contentSha256 && (
                      <>
                        <code className="digest">{entry.contentSha256}</code>
                        {entry.hashTarget && (
                          <span className="choice-meta">
                            {' '}
                            of the {HASH_TARGET_LABEL[entry.hashTarget]}
                          </span>
                        )}
                      </>
                    ),
                  ],
                  ['Scope text', <span className="prose">{entry.scopeText}</span>],
                  [
                    'Limitations',
                    entry.limitations && <span className="prose">{entry.limitations}</span>,
                  ],
                ]}
              />
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

function CorrespondenceSection({
  view,
  bindings,
}: {
  view: ContextView;
  bindings: readonly CorrespondenceBinding[];
}) {
  const { correspondence, parentBindingId, priorCorrespondenceIds } = view.context;
  const parentMessageId =
    bindings.find((binding) => binding.id === parentBindingId)?.correspondenceId ?? null;
  return (
    <Section title={`Correspondence (${correspondence.length})`}>
      <p className="hint">{CORRESPONDENCE_MEANING}</p>
      <Details
        rows={[
          ['Parent binding (NMI)', parentBindingId && <code>{parentBindingId}</code>],
          [
            'Prior transmissions',
            priorCorrespondenceIds.length === 0 ? null : (
              <ul className="plain-list" data-testid="context-priors-ids">
                {priorCorrespondenceIds.map((id) => (
                  <li key={id}>
                    <code>{id}</code>
                  </li>
                ))}
              </ul>
            ),
          ],
        ]}
      />
      {correspondence.length === 0 ? (
        <p className="absent" data-testid="correspondence-none">
          No message is part of this context.
        </p>
      ) : (
        <ol className="plain-list" data-testid="context-correspondence">
          {correspondence.map((message) => (
            <ContextMessage
              key={message.id}
              message={message}
              parent={message.id === parentMessageId}
              prior={priorCorrespondenceIds.includes(message.id)}
            />
          ))}
        </ol>
      )}
    </Section>
  );
}

function ContextMessage({
  message,
  parent,
  prior,
}: {
  message: Correspondence;
  parent: boolean;
  prior: boolean;
}) {
  return (
    <li className="context-block" data-testid="context-message">
      <h3>
        <Link to={`/correspondence/${message.id}`}>
          <span className="prose">{message.subject}</span>
        </Link>{' '}
        {parent && <span className="tag">Parent: request for more information</span>}{' '}
        {prior && <span className="tag">Prior transmission</span>}
      </h3>
      {prior && <p className="hint">{AS_SENT_COPY}</p>}
      <Details
        rows={[
          ['Capture posture', <CapturePosture mode={message.captureMode} />],
          ['What the posture means', CAPTURE_MODE_MEANING[message.captureMode]],
          ['Body role', BODY_ROLE_LABEL[message.bodyRole]],
          ['Direction (as recorded)', DIRECTION_LABEL[message.direction]],
          ['Occurred', message.occurredAt && <Time iso={message.occurredAt} />],
          ['Recorded in TB', <Time iso={message.createdAt} />],
          ['Message-ID (text)', message.messageId],
          ['Raw source', message.rawSourceId && <SourceCitation sourceId={message.rawSourceId} />],
          [
            'Limitations',
            message.limitations && <span className="prose">{message.limitations}</span>,
          ],
        ]}
      />
      {message.bodyText === null ? (
        <p className="absent">No body text is recorded.</p>
      ) : (
        <CapturedText testId="context-message-body" text={message.bodyText} />
      )}
      <h4>Attachment observations ({message.attachmentsManifest?.length ?? 0})</h4>
      {message.attachmentsManifest === null || message.attachmentsManifest.length === 0 ? (
        <p className="absent">None recorded.</p>
      ) : (
        <>
          <p className="hint">{ATTACHMENTS_MEANING}</p>
          <ul className="plain-list" data-testid="context-attachments">
            {message.attachmentsManifest.map((attachment, index) => (
              <li key={index}>
                <span className="prose">{attachment.fileName}</span> —{' '}
                {ATTACHMENT_STATE_LABEL[attachment.state]}
                {attachment.sourceId ? (
                  <>
                    {' '}
                    · <SourceCitation sourceId={attachment.sourceId} />
                  </>
                ) : null}
                {attachment.sha256 ? (
                  <>
                    {' '}
                    · SHA-256 as entered <code className="digest">{attachment.sha256}</code>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </li>
  );
}

function DependenciesSection({ view }: { view: ContextView }) {
  return (
    <Section title={`Dependencies (${view.dependencies.length})`}>
      <p className="hint">{DEPENDENCIES_MEANING}</p>
      <details>
        <summary>Show every dependency</summary>
        <div className="table-frame">
          <table className="records" data-testid="context-dependencies">
            <thead>
              <tr>
                <th scope="col">Record</th>
                <th scope="col">Id</th>
                <th scope="col">Row version</th>
                <th scope="col">Fingerprint</th>
              </tr>
            </thead>
            <tbody>
              {view.dependencies.map((dependency) => (
                <tr key={`${dependency.entityType}:${dependency.entityId}`}>
                  <th scope="row">{dependency.entityType}</th>
                  <td>
                    <code>{dependency.entityId}</code>
                  </td>
                  <td>{dependency.rowVersion ?? '—'}</td>
                  <td>
                    <code className="digest">{dependency.fingerprint}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Section>
  );
}
