// Prompt snapshots (P4E) of one case: the history of the prompts generated for it (summaries only),
// the page that generates one from exactly the production context the operator reviewed, and the
// page that shows one snapshot exactly as stored. The server renders a prompt from the recorded
// context (generatePrompt, TB-SCHEMA-API-v1.2.0) as input for a later drafting step outside this
// application — a person, or a drafting tool the operator chooses. A snapshot is never a notice, an
// approval, a readiness decision, a signature or a transmission, and nothing here drafts, sends,
// submits, signs or calls an AI provider.
//
// Generation is explicit and reviewed: the operator chooses the task, the mode and every selector
// (nothing is preselected — the production-context scope form), reads the context, and generates
// against exactly that read's context revision and dependency digest. If anything the context
// relies on changed since the read, the server refuses (412) and the page says so and asks for a
// new review; it never retries against a newer context by itself. The same intent keeps its
// Idempotency-Key, so a retry after a lost response returns the snapshot already generated instead
// of a second one. "Copy prompt" copies the stored text to the local clipboard only and changes
// nothing. Every page is keyed by the case id, and a snapshot is shown only under its own case.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import type { ContextView, GeneratePrompt, PromptSnapshot } from '@tb/contracts';
import { ApiError } from '../api/client.js';
import { contextQueryString, type ContextQuery } from '../api/directory.js';
import { useSession } from '../auth/session.js';
import { Time } from '../directory/agencies.js';
import { TASK_TYPE_LABEL } from '../directory/format.js';
import { useDirectoryApi, useIntentKey, useLoad, useWrite } from '../directory/hooks.js';
import { useFlashMessage, type FlashState } from '../directory/record-page.js';
import {
  Breadcrumbs,
  Details,
  ErrorNotice,
  LoadingNotice,
  Section,
  StatusNotice,
} from '../directory/ui.js';
import { RecordedBy } from '../representation/authority-ui.js';
import { NotInThisCase } from './intake-ui.js';
import {
  allPages,
  ConflictSection,
  ContextRefusal,
  ContextResult,
  MissingSection,
  MODE_LABEL,
  ScopeForm,
  scopeOf,
  type Choices,
} from './production-context.js';

/** The permanent statement of what a prompt snapshot is (mission §34, verbatim). */
export const PROMPT_BOUNDARY =
  'This is an immutable prompt snapshot. It is not a notice, approval, readiness decision, signature, or transmission.';
/** What the page says when the context changed after it was read (mission §33, verbatim). */
export const CONTEXT_CHANGED_MESSAGE =
  'Context changed. Review the current context before generating again.';
const HISTORY_BOUNDARY =
  'Each prompt is an immutable snapshot. None is a notice, approval, readiness decision, signature, or transmission.';
const HISTORY_MEANING =
  'Each prompt was generated from one exact recorded context of this case — its context revision and dependency digest are kept with it — and never changes. A later change to the case does not change an earlier prompt.';
const GENERATE_BOUNDARY =
  'A prompt is generated only from the context you review here, at exactly its context revision and dependency digest. It is input for a drafting step outside this application — not a notice, approval, readiness decision, signature, or transmission.';
const LOCAL_ONLY =
  'Generating renders the prompt text in this application and stores it with its context. Nothing is sent, submitted, signed or passed to an AI provider.';
const GENERATE_MEANING =
  'The prompt is generated against this context revision and dependency digest. If anything the context relies on changed since this read, nothing is generated.';
const FROZEN_GAPS =
  'The missing context and recorded conflicts of the context this prompt was generated from, frozen with it.';
const PROMPT_TEXT_MEANING =
  'The prompt exactly as stored. Recorded case text appears in it only inside the case-data block, as quoted data.';
const SHA_MEANING = 'SHA-256 of the exact UTF-8 bytes of the prompt text.';
const COPY_MEANING =
  'Copies the stored prompt text to this computer’s clipboard, for a drafting workflow outside this application. Nothing is sent, submitted or marked as used, and the stored prompt does not change.';
const HISTORY_PAGE_SIZE = 25;

/** "Initial notice · version 2" — the task and the version of one snapshot. */
function promptTitle(prompt: { taskType: PromptSnapshot['taskType']; version: number }): string {
  return `${TASK_TYPE_LABEL[prompt.taskType]} · version ${prompt.version}`;
}

// History -----------------------------------------------------------------------------------------

export function PromptHistoryPage() {
  const { id = '' } = useParams();
  return <PromptHistory key={id} caseId={id} />;
}

function PromptHistory({ caseId }: { caseId: string }) {
  const api = useDirectoryApi();
  const [caseState] = useLoad(`prompts-case:${caseId}`, () => api.cases.get(caseId));
  // The cursors of the pages shown so far: the last one is the page on screen (none = the newest).
  const [cursors, setCursors] = useState<readonly string[]>([]);
  const cursor = cursors.at(-1);
  const [state, reload] = useLoad(`prompts:${caseId}:${cursor ?? ''}`, () =>
    api.cases.prompts.list(caseId, {
      limit: HISTORY_PAGE_SIZE,
      ...(cursor === undefined ? {} : { cursor }),
    }),
  );
  const label = caseState.status === 'ready' ? caseState.value.data.intakeLabel : 'Case';
  const trail = [
    ['Cases', '/cases'],
    [label, `/cases/${caseId}`],
    ['Prompts', null],
  ] as const;
  if (caseState.status === 'error') {
    return (
      <article className="sheet" data-testid="prompt-history">
        <Breadcrumbs trail={trail} />
        <ErrorNotice error={caseState.error} recordLabel="case" />
      </article>
    );
  }
  return (
    <article className="sheet" data-testid="prompt-history">
      <Breadcrumbs trail={trail} />
      <header className="record-header">
        <h1 className="record-name">Prompts</h1>
        {caseState.status === 'ready' && (
          <div className="record-facts">
            <span className="record-fact">{caseState.value.data.intakeLabel}</span>
            <span className="record-fact">
              Case context revision {caseState.value.data.contextRevision}
            </span>
          </div>
        )}
        <p className="context-boundary" role="note" data-testid="prompt-history-boundary">
          {HISTORY_BOUNDARY}
        </p>
      </header>
      <Section
        title="Prompt history"
        actions={
          <Link
            className="button button-primary"
            to={`/cases/${caseId}/prompts/new`}
            data-testid="open-generate-prompt"
          >
            Generate a prompt
          </Link>
        }
      >
        <p className="hint">{HISTORY_MEANING}</p>
        {state.status === 'loading' && <LoadingNotice label="Loading prompts…" />}
        {state.status === 'error' && (
          <ErrorNotice error={state.error} recordLabel="case" onRetry={reload} />
        )}
        {state.status === 'ready' && state.value.items.length === 0 && (
          <p className="absent" data-testid="prompts-empty">
            {cursor === undefined
              ? 'No prompt has been generated for this case.'
              : 'No older prompt.'}
          </p>
        )}
        {state.status === 'ready' && state.value.items.length > 0 && (
          <div className="table-frame">
            <table className="records" data-testid="prompts">
              <caption className="visually-hidden">Prompts of this case, newest first</caption>
              <thead>
                <tr>
                  <th scope="col">Prompt</th>
                  <th scope="col">Mode</th>
                  <th scope="col">Generated</th>
                  <th scope="col">Context revision</th>
                  <th scope="col">Dependency digest</th>
                  <th scope="col">Prompt SHA-256</th>
                </tr>
              </thead>
              <tbody>
                {state.value.items.map((prompt) => (
                  <tr key={prompt.id} data-testid="prompt-row">
                    <th scope="row">
                      <Link to={`/cases/${caseId}/prompts/${prompt.id}`}>
                        {promptTitle(prompt)}
                      </Link>
                    </th>
                    <td>{MODE_LABEL[prompt.generationMode]}</td>
                    <td>
                      <Time iso={prompt.createdAt} />
                    </td>
                    <td>{prompt.contextRevision}</td>
                    <td>
                      <code className="digest">{prompt.dependencyDigest}</code>
                    </td>
                    <td>
                      <code className="digest">{prompt.promptSha256}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {state.status === 'ready' && (cursors.length > 0 || state.value.nextCursor !== null) && (
          <nav aria-label="Prompt pages" className="form-actions">
            {cursors.length > 0 && (
              <button type="button" className="button" onClick={() => setCursors([])}>
                Newest prompts
              </button>
            )}
            {state.value.nextCursor !== null && (
              <button
                type="button"
                className="button"
                onClick={() => {
                  const next = state.value.nextCursor;
                  if (next !== null) setCursors([...cursors, next]);
                }}
              >
                Older prompts
              </button>
            )}
          </nav>
        )}
      </Section>
    </article>
  );
}

// Generation --------------------------------------------------------------------------------------

export function GeneratePromptPage() {
  const { id = '' } = useParams();
  return <GeneratePromptFlow key={id} caseId={id} />;
}

function GeneratePromptFlow({ caseId }: { caseId: string }) {
  const api = useDirectoryApi();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const scope = scopeOf(params);
  // Focus follows a read asked for on this page, never arriving on it.
  const [focusOutcome, setFocusOutcome] = useState(false);
  function show(query: ContextQuery) {
    setFocusOutcome(true);
    setParams(contextQueryString(query));
  }
  const [caseState] = useLoad(`prompt-case:${caseId}`, () => api.cases.get(caseId));
  const [choices] = useLoad<Choices>(`prompt-choices:${caseId}`, async () => {
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
        <Breadcrumbs trail={[...trail, ['Generate a prompt', null]]} />
        <ErrorNotice error={caseState.error} recordLabel="case" />
      </>
    );
  }
  const record = caseState.value.data;
  return (
    <article className="sheet" data-testid="prompt-generate">
      <Breadcrumbs
        trail={[
          ...trail,
          [record.intakeLabel, `/cases/${caseId}`],
          ['Prompts', `/cases/${caseId}/prompts`],
          ['Generate a prompt', null],
        ]}
      />
      <header className="record-header">
        <h1 className="record-name">Generate a prompt</h1>
        <div className="record-facts">
          <span className="record-fact">{record.intakeLabel}</span>
          <span className="record-fact">Case context revision {record.contextRevision}</span>
        </div>
        <p className="context-boundary" role="note" data-testid="prompt-generate-boundary">
          {GENERATE_BOUNDARY}
        </p>
        <p className="record-boundary">{LOCAL_ONLY}</p>
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
        <p className="notice notice-quiet" data-testid="prompt-idle">
          Choose a task and a mode, then show the context. Nothing is read or generated until you
          do.
        </p>
      ) : (
        <ReviewAndGenerate
          caseId={caseId}
          scope={scope}
          bindings={choices.status === 'ready' ? choices.value.bindings : []}
          focusOnShow={focusOutcome}
          onAsk={() => setFocusOutcome(true)}
          onPreparation={() => show({ ...scope, generationMode: 'PREPARATION' })}
          onGenerated={(snapshot) =>
            navigate(`/cases/${caseId}/prompts/${snapshot.id}`, {
              state: {
                flash: `Prompt generated: ${promptTitle(snapshot)}, stored with its context.`,
              } satisfies FlashState,
            })
          }
        />
      )}
    </article>
  );
}

/** The generatePrompt body of one reviewed read: its revision and digest, the selectors named. */
function requestOf(scope: ContextQuery, view: ContextView): GeneratePrompt {
  return {
    taskType: scope.taskType,
    generationMode: scope.generationMode,
    expectedContextRevision: view.contextRevision,
    expectedDependencyDigest: view.dependencyDigest,
    ...(scope.authoritySelectionId ? { authoritySelectionId: scope.authoritySelectionId } : {}),
    ...(scope.parentBindingId ? { parentBindingId: scope.parentBindingId } : {}),
    priorBindingIds: [...(scope.priorBindingIds ?? [])],
  };
}

function ReviewAndGenerate({
  caseId,
  scope,
  bindings,
  focusOnShow,
  onAsk,
  onPreparation,
  onGenerated,
}: {
  caseId: string;
  scope: ContextQuery;
  bindings: ContextResultBindings;
  /** Move focus to the outcome once it is shown (a read asked for on this page). */
  focusOnShow: boolean;
  /** A read is asked for here. */
  onAsk: () => void;
  onPreparation: () => void;
  onGenerated: (snapshot: PromptSnapshot) => void;
}) {
  const api = useDirectoryApi();
  const write = useWrite();
  const intent = useIntentKey();
  const [state, reload] = useLoad(`prompt-context:${caseId}:${contextQueryString(scope)}`, () =>
    api.cases.productionContext(caseId, scope),
  );
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  // The read the server refused as changed: generating from it again is not offered.
  const [changedRead, setChangedRead] = useState<ContextView | null>(null);
  const outcome = useRef<HTMLDivElement>(null);
  const problem = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusOnShow && state.status !== 'loading') outcome.current?.focus();
  }, [focusOnShow, state]);
  useEffect(() => {
    if (changedRead !== null || failure !== null) problem.current?.focus();
  }, [changedRead, failure]);

  function readAgain() {
    onAsk();
    setFailure(null);
    reload();
  }

  if (state.status === 'loading') return <LoadingNotice label="Reading the context…" />;
  if (state.status === 'error') {
    return (
      <div
        ref={outcome}
        tabIndex={-1}
        className="context-outcome"
        data-testid="prompt-context-outcome"
      >
        <ContextRefusal error={state.error} scope={scope} onPreparation={onPreparation} />
        <p className="hint" data-testid="prompt-not-offered">
          No prompt can be generated from a context that was not returned.
        </p>
      </div>
    );
  }
  const view = state.value;
  const changed = changedRead === view;

  async function generate() {
    const body = requestOf(scope, view);
    setPending(true);
    setFailure(null);
    try {
      const snapshot = await write(intent.keyFor({ caseId, body }), (auth) =>
        api.cases.prompts.generate(caseId, body, auth),
      );
      intent.done();
      onGenerated(snapshot);
    } catch (error) {
      // Never retried here: a changed context needs a new review, anything else is shown.
      if (error instanceof ApiError && error.status === 412) setChangedRead(view);
      else setFailure(error);
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      ref={outcome}
      tabIndex={-1}
      className="context-outcome"
      data-testid="prompt-context-outcome"
    >
      <Section title="Generate from this context">
        <div data-testid="prompt-expected">
          <Details
            rows={[
              ['Task', `${TASK_TYPE_LABEL[view.context.taskType]} (${view.context.taskType})`],
              [
                'Mode',
                `${MODE_LABEL[view.context.generationMode]} (${view.context.generationMode})`,
              ],
              [
                'Context revision',
                <span data-testid="prompt-expected-revision">{view.contextRevision}</span>,
              ],
              [
                'Dependency digest',
                <code className="digest" data-testid="prompt-expected-digest">
                  {view.dependencyDigest}
                </code>,
              ],
              ['Missing context', String(view.context.missing.length)],
              ['Recorded conflicts', String(view.context.conflicts.length)],
            ]}
          />
        </div>
        <p className="hint">{GENERATE_MEANING}</p>
        <div ref={problem} tabIndex={-1} className="context-outcome">
          {changed && (
            <div className="notice notice-error" role="alert" data-testid="prompt-context-changed">
              <p>
                <strong>{CONTEXT_CHANGED_MESSAGE}</strong>
              </p>
              <p>
                No prompt was generated. The context shown below is the one read before the change.
              </p>
              <button type="button" className="button" onClick={readAgain}>
                Read the current context
              </button>
            </div>
          )}
          {failure !== null && <ErrorNotice error={failure} recordLabel="prompt" />}
        </div>
        {!changed && (
          <div className="form-actions">
            <button
              type="button"
              className="button button-primary"
              disabled={pending}
              onClick={() => void generate()}
              data-testid="prompt-generate-button"
            >
              {pending ? 'Generating…' : 'Generate prompt from this context'}
            </button>
          </div>
        )}
      </Section>
      <ContextResult view={view} caseId={caseId} bindings={bindings} onReload={readAgain} />
    </div>
  );
}

type ContextResultBindings = Parameters<typeof ContextResult>[0]['bindings'];

// Detail ------------------------------------------------------------------------------------------

export function PromptDetailPage() {
  const { id = '', promptId = '' } = useParams();
  return <PromptDetail key={`${id}:${promptId}`} caseId={id} promptId={promptId} />;
}

function PromptDetail({ caseId, promptId }: { caseId: string; promptId: string }) {
  const api = useDirectoryApi();
  // Shown once after generating here: cleared from history, so a reload does not repeat it.
  const generated = useFlashMessage();
  const { state: session } = useSession();
  const currentUserId = session.status === 'authenticated' ? session.session.user.id : '';
  const [caseState] = useLoad(`prompt-detail-case:${caseId}`, () => api.cases.get(caseId));
  const [state, reload] = useLoad(`prompt:${promptId}`, () => api.cases.prompts.get(promptId));
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (generated !== null && state.status === 'ready') heading.current?.focus();
  }, [generated, state.status]);
  const label = caseState.status === 'ready' ? caseState.value.data.intakeLabel : 'Case';
  const trail = [
    ['Cases', '/cases'],
    [label, `/cases/${caseId}`],
    ['Prompts', `/cases/${caseId}/prompts`],
  ] as const;
  if (state.status === 'loading') return <LoadingNotice label="Loading prompt…" />;
  // Another case's prompt is shown exactly like an unknown one: nothing of it appears here.
  const notHere =
    (state.status === 'error' && state.error instanceof ApiError && state.error.status === 404) ||
    (state.status === 'ready' && state.value.caseId !== caseId);
  if (state.status === 'error' || notHere) {
    return (
      <article className="sheet" data-testid="prompt-detail">
        <Breadcrumbs trail={[...trail, ['Prompt', null]]} />
        <h1>Prompt</h1>
        {notHere || state.status !== 'error' ? (
          <NotInThisCase caseId={caseId} noun="prompt" testId="prompt-not-found" />
        ) : (
          <ErrorNotice error={state.error} recordLabel="prompt" onRetry={reload} />
        )}
      </article>
    );
  }
  const prompt = state.value;
  const context = prompt.contextJson;
  return (
    <article className="sheet" data-testid="prompt-detail">
      <Breadcrumbs trail={[...trail, [promptTitle(prompt), null]]} />
      <header className="record-header">
        <h1 className="record-name" ref={heading} tabIndex={-1}>
          Prompt: {promptTitle(prompt)}
        </h1>
        <div className="record-facts">
          <span className="record-fact">{MODE_LABEL[prompt.generationMode]}</span>
          <span className="record-fact">Context revision {prompt.contextRevision}</span>
        </div>
        <p className="context-boundary" role="note" data-testid="prompt-boundary">
          {PROMPT_BOUNDARY}
        </p>
      </header>
      <StatusNotice message={generated} />
      <Section title="Snapshot">
        <div data-testid="prompt-facts">
          <Details
            rows={[
              ['Version', String(prompt.version)],
              ['Task', `${TASK_TYPE_LABEL[prompt.taskType]} (${prompt.taskType})`],
              ['Mode', `${MODE_LABEL[prompt.generationMode]} (${prompt.generationMode})`],
              ['Wire contract', <code>{prompt.contractVersion}</code>],
              ['Prompt template', <code>{prompt.templateVersion}</code>],
              [
                'Context revision',
                <span data-testid="prompt-revision">{prompt.contextRevision}</span>,
              ],
              [
                'Dependency digest',
                <code className="digest" data-testid="prompt-digest">
                  {prompt.dependencyDigest}
                </code>,
              ],
              ['Dependencies', `${prompt.dependencyManifest.length} records`],
              ['Sources', `${prompt.sourceManifest.length} source revisions`],
              [
                'Authority selection named',
                prompt.authoritySelectionId && (
                  <Link to={`/cases/${caseId}/authority-selections/${prompt.authoritySelectionId}`}>
                    <code>{prompt.authoritySelectionId}</code>
                  </Link>
                ),
              ],
              [
                'Parent binding (NMI)',
                prompt.parentBindingId && <code>{prompt.parentBindingId}</code>,
              ],
              [
                'Prior transmissions',
                context.priorCorrespondenceIds.length === 0 ? null : (
                  <ul className="plain-list">
                    {context.priorCorrespondenceIds.map((id) => (
                      <li key={id}>
                        <code>{id}</code>
                      </li>
                    ))}
                  </ul>
                ),
              ],
              ['Generated', <Time iso={prompt.createdAt} />],
              [
                'Generated by',
                <RecordedBy userId={prompt.createdById} currentUserId={currentUserId} />,
              ],
            ]}
          />
        </div>
      </Section>
      <p className="hint">{FROZEN_GAPS}</p>
      <MissingSection items={prompt.missingItems} />
      <ConflictSection items={prompt.conflicts} />
      <Section title="Prompt text" actions={<CopyPrompt text={prompt.renderedPrompt} />}>
        <p className="hint" id="copy-prompt-meaning">
          {COPY_MEANING}
        </p>
        <p className="hint">{PROMPT_TEXT_MEANING}</p>
        {/* Scrollable, so it is focusable: keyboard users scroll it too. */}
        <pre
          className="captured-text prompt-text"
          data-testid="prompt-text"
          tabIndex={0}
          aria-label="Prompt text"
        >
          {prompt.renderedPrompt}
        </pre>
        <Details
          rows={[
            [
              'Prompt SHA-256',
              <code className="digest" data-testid="prompt-sha256">
                {prompt.promptSha256}
              </code>,
            ],
          ]}
        />
        <p className="hint">{SHA_MEANING}</p>
      </Section>
      <p>
        <Link to={`/cases/${caseId}/prompts`}>Back to the prompts of this case</Link>
      </p>
    </article>
  );
}

/** Copies the stored prompt text to the local clipboard; nothing else happens. */
function CopyPrompt({ text }: { text: string }) {
  const [status, setStatus] = useState<string | null>(null);
  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(text);
      setStatus('Copied to this computer’s clipboard. Nothing was sent.');
    } catch {
      setStatus(
        'The clipboard is not available in this browser. Select the prompt text and copy it instead.',
      );
    }
  }
  return (
    <div className="copy-prompt">
      <button
        type="button"
        className="button"
        onClick={() => void copy()}
        aria-describedby="copy-prompt-meaning"
        data-testid="copy-prompt"
      >
        Copy prompt
      </button>
      <span role="status" className="hint" data-testid="copy-status">
        {status ?? ''}
      </span>
    </div>
  );
}
