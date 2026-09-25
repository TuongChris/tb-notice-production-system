// Case correspondence (P4C): the bindings of one case — each the explicit interpretation, for this
// case only, of one captured message — shown as a history, and the page that records a binding.
// Event types name captured past events, never commands: recording an "as sent" event is recorded
// history and sends nothing; nothing is inferred from a message's direction, subject, text,
// Message-ID or timing; an outcome is recorded for one reported item and is never the platform's
// present status; silence is never an outcome. Bindings are never edited or deleted: a corrected
// interpretation is a later binding that names the one it corrects, and both stay in the history.
// Transmissions are counted by distinct captured messages, never by bindings. Every page is keyed by
// the case id, so nothing loaded or entered for one case is shown for another.
import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import type {
  BindCorrespondence,
  CaseRecord,
  Correspondence,
  CorrespondenceBinding,
  ReportedItem,
} from '@tb/contracts';
import { ApiError } from '../api/client.js';
import { useSession } from '../auth/session.js';
import {
  AS_SENT_COPY,
  BINDING_MEANING,
  CAPTURE_MODE_MEANING,
  CapturePosture,
  CORRECTION_MEANING,
  COUNT_MEANING,
  isAsSent,
  NO_EXTERNAL_ACTION,
  OUTCOME_MEANING,
  SILENCE_MEANING,
} from '../correspondence/correspondence-ui.js';
import { Time } from '../directory/agencies.js';
import { SelectField, TextField } from '../directory/fields.js';
import {
  BODY_ROLE_LABEL,
  CAPTURE_MODE_LABEL,
  CORRESPONDENCE_EVENT_LABEL,
  describeError,
  DIRECTION_LABEL,
  formatDateTime,
  issuesOf,
  OUTCOME_LABEL,
} from '../directory/format.js';
import { useDirectoryApi, useLoad, type Load } from '../directory/hooks.js';
import { useSubmission, type FlashState } from '../directory/record-page.js';
import {
  Breadcrumbs,
  ConflictNotice,
  Details,
  ErrorNotice,
  LoadingNotice,
  Section,
  UnavailableAction,
  ValidationSummary,
} from '../directory/ui.js';
import { RecordedBy } from '../representation/authority-ui.js';
import { reportedItemLabel } from './intake-ui.js';

type EventType = CorrespondenceBinding['eventType'];
type Outcome = NonNullable<CorrespondenceBinding['outcome']>;

const options = <K extends string>(labels: Readonly<Record<K, string>>) =>
  (Object.keys(labels) as K[]).map((value) => ({ value, label: labels[value] }));

/**
 * The last loaded value while a reload is in flight (as on the fact form), so "Load latest version"
 * after a version conflict keeps what the operator entered.
 */
function useKept<T>(state: Load<T>): T | null {
  const [kept, setKept] = useState<T | null>(null);
  useEffect(() => {
    if (state.status === 'ready') setKept(state.value);
  }, [state]);
  return state.status === 'ready' ? state.value : kept;
}

/** At most this many bindings are shown (ten pages of the largest contracted page size). */
const MAX_BINDINGS = 1000;

interface CaseCorrespondence {
  /** Every binding of the case, newest recorded first — corrected ones included. */
  readonly bindings: CorrespondenceBinding[];
  /** False when the case has more bindings than are shown. */
  readonly complete: boolean;
  /** The captured messages the bindings name, by id. */
  readonly messages: ReadonlyMap<string, Correspondence>;
  readonly items: ReadonlyMap<string, ReportedItem>;
}

/** The correspondence history of one case: every binding, as recorded. */
export function CaseCorrespondenceSection({ caseRecord }: { caseRecord: CaseRecord }) {
  const api = useDirectoryApi();
  const { state: session } = useSession();
  const currentUserId = session.status === 'authenticated' ? session.session.user.id : '';
  const caseId = caseRecord.id;
  const [state, reload] = useLoad<CaseCorrespondence>(
    `case-correspondence:${caseId}:${caseRecord.rowVersion}`,
    async () => {
      const bindings: CorrespondenceBinding[] = [];
      let cursor: string | null = null;
      do {
        const page = await api.correspondence.bindings.list(caseId, {
          limit: 100,
          ...(cursor === null ? {} : { cursor }),
        });
        bindings.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor !== null && bindings.length < MAX_BINDINGS);
      const ids = [...new Set(bindings.map((binding) => binding.correspondenceId))];
      const [messages, items] = await Promise.all([
        Promise.all(ids.map((id) => api.correspondence.get(id))),
        api.cases.reportedItems.list(caseId, { limit: 100 }),
      ]);
      return {
        bindings,
        complete: cursor === null,
        messages: new Map(messages.map((message) => [message.id, message])),
        items: new Map(items.items.map((item) => [item.id, item])),
      };
    },
  );
  const archived = caseRecord.archivedAt !== null;
  return (
    <Section
      title="Correspondence"
      actions={
        archived ? (
          <UnavailableAction
            label="Bind captured correspondence"
            reason="Archived cases are read-only. Restore the case first."
          />
        ) : (
          <Link className="button" to={`/cases/${caseId}/correspondence-bindings/new`}>
            Bind captured correspondence
          </Link>
        )
      }
    >
      <p className="hint">{BINDING_MEANING}</p>
      <p className="hint">{NO_EXTERNAL_ACTION}</p>
      {state.status === 'loading' && <LoadingNotice label="Loading correspondence…" />}
      {state.status === 'error' && (
        <ErrorNotice error={state.error} recordLabel="correspondence" onRetry={reload} />
      )}
      {state.status === 'ready' && state.value.bindings.length === 0 && (
        <p className="absent" data-testid="case-correspondence-empty">
          No captured correspondence is bound to this case. {SILENCE_MEANING}
        </p>
      )}
      {state.status === 'ready' && state.value.bindings.length > 0 && (
        <CorrespondenceHistory
          caseRecord={caseRecord}
          loaded={state.value}
          currentUserId={currentUserId}
        />
      )}
    </Section>
  );
}

function CorrespondenceHistory({
  caseRecord,
  loaded,
  currentUserId,
}: {
  caseRecord: CaseRecord;
  loaded: CaseCorrespondence;
  currentUserId: string;
}) {
  const { bindings, messages, items, complete } = loaded;
  const successors = new Map(
    bindings
      .filter((binding) => binding.supersedesBindingId !== null)
      .map((binding) => [binding.supersedesBindingId as string, binding]),
  );
  const messageCount = messages.size;
  return (
    <>
      <p data-testid="correspondence-counts">
        <span data-testid="binding-count">
          {bindings.length} {bindings.length === 1 ? 'binding' : 'bindings'}
        </span>{' '}
        of{' '}
        <span data-testid="message-count">
          {messageCount} captured {messageCount === 1 ? 'message' : 'messages'}
        </span>
        . {COUNT_MEANING}
      </p>
      <p className="hint">
        Newest recorded first. Occurred is the time a message is stated to have been sent or
        received; recorded in TB is when it was captured or bound here. {OUTCOME_MEANING}{' '}
        {SILENCE_MEANING} {CORRECTION_MEANING}
      </p>
      <ol
        className="timeline"
        aria-label="Correspondence history"
        data-testid="case-correspondence"
      >
        {bindings.map((binding) => (
          <BindingItem
            key={binding.id}
            caseRecord={caseRecord}
            binding={binding}
            message={messages.get(binding.correspondenceId) ?? null}
            item={
              binding.reportedItemId === null ? null : (items.get(binding.reportedItemId) ?? null)
            }
            successor={successors.get(binding.id) ?? null}
            currentUserId={currentUserId}
          />
        ))}
      </ol>
      {!complete && (
        <p className="hint">
          Only the newest {bindings.length} bindings are shown; search the case’s bindings by
          message or reported item for older ones.
        </p>
      )}
    </>
  );
}

function BindingItem({
  caseRecord,
  binding,
  message,
  item,
  successor,
  currentUserId,
}: {
  caseRecord: CaseRecord;
  binding: CorrespondenceBinding;
  message: Correspondence | null;
  item: ReportedItem | null;
  successor: CorrespondenceBinding | null;
  currentUserId: string;
}) {
  const caseId = caseRecord.id;
  const asSent = isAsSent(binding.eventType);
  const eventLabel = CORRESPONDENCE_EVENT_LABEL[binding.eventType];
  return (
    <li className="timeline-item" id={`binding-${binding.id}`} data-testid="binding-item">
      <div className="timeline-when">
        <span className="timeline-label" data-testid="binding-event">
          {eventLabel}
        </span>
        <span>
          Occurred:{' '}
          <span data-testid="binding-occurred">
            <Time iso={message?.occurredAt ?? null} />
          </span>
        </span>
        <span>
          Recorded in TB:{' '}
          <span data-testid="binding-recorded">
            <Time iso={binding.createdAt} />
          </span>
        </span>
        {successor !== null && (
          <span className="tag tag-quiet" data-testid="binding-corrected">
            Corrected by a later interpretation
          </span>
        )}
        {binding.supersedesBindingId !== null && (
          <span className="tag tag-quiet" data-testid="binding-corrects">
            Corrects an earlier interpretation
          </span>
        )}
      </div>
      <div className="timeline-body">
        {asSent && (
          <p className="notice notice-quiet" data-testid="as-sent-copy">
            {AS_SENT_COPY}
          </p>
        )}
        {asSent && message?.captureMode === 'OPERATOR_REPORTED' && (
          <p className="hint" data-testid="as-sent-limited-posture">
            Capture posture of this transmission record: {CAPTURE_MODE_LABEL.OPERATOR_REPORTED}.{' '}
            {CAPTURE_MODE_MEANING.OPERATOR_REPORTED}
          </p>
        )}
        <Details
          rows={[
            ['Event as recorded', eventLabel],
            [
              'Captured message',
              message === null ? (
                <Link to={`/correspondence/${binding.correspondenceId}`}>
                  Open captured message
                </Link>
              ) : (
                <Link to={`/correspondence/${message.id}`} data-testid="binding-message">
                  {message.subject}
                </Link>
              ),
            ],
            ['Direction', message && DIRECTION_LABEL[message.direction]],
            [
              'Capture posture',
              message && (
                <>
                  <CapturePosture mode={message.captureMode} /> body role:{' '}
                  {BODY_ROLE_LABEL[message.bodyRole].toLowerCase()}
                </>
              ),
            ],
            ['Message recorded in TB', message && <Time iso={message.createdAt} />],
            [
              'Reported item',
              binding.reportedItemId === null ? (
                <span className="hint">None — the case as a whole</span>
              ) : (
                <Link
                  to={`/cases/${caseId}/reported-items/${binding.reportedItemId}`}
                  data-testid="binding-item-link"
                >
                  {item === null ? 'Reported item' : reportedItemLabel(item)}
                </Link>
              ),
            ],
            [
              'Platform reference',
              binding.platformReference && <code>{binding.platformReference}</code>,
            ],
            [
              'Recorded outcome',
              binding.outcome && (
                <span data-testid="binding-outcome">{OUTCOME_LABEL[binding.outcome]}</span>
              ),
            ],
            [
              'Interpretation',
              binding.interpretation && <p className="prose">{binding.interpretation}</p>,
            ],
            [
              'Corrects',
              binding.supersedesBindingId && (
                <a href={`#binding-${binding.supersedesBindingId}`}>the earlier interpretation</a>
              ),
            ],
            [
              'Corrected by',
              successor && (
                <a href={`#binding-${successor.id}`}>
                  the interpretation recorded {formatDateTime(successor.createdAt)}
                </a>
              ),
            ],
            [
              'Recorded by',
              <RecordedBy userId={binding.createdById} currentUserId={currentUserId} />,
            ],
          ]}
        />
        {successor === null && caseRecord.archivedAt === null && (
          <p>
            <Link
              to={`/cases/${caseId}/correspondence-bindings/new?supersedes=${binding.id}`}
              aria-label={`Record a corrected interpretation of the binding recorded ${formatDateTime(binding.createdAt)}`}
            >
              Record a corrected interpretation
            </Link>
          </p>
        )}
      </div>
    </li>
  );
}

// binding form ------------------------------------------------------------------------------------

const LABELS: Record<string, string> = {
  correspondenceId: 'Captured message',
  eventType: 'Recorded as',
  reportedItemId: 'Reported item',
  outcome: 'Recorded outcome',
  platformReference: 'Platform reference',
  interpretation: 'Interpretation',
  supersedesBindingId: 'Corrected binding',
};

export function BindCorrespondencePage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const supersedes = params.get('supersedes') ?? '';
  const preset = params.get('correspondenceId') ?? '';
  return (
    <BindCorrespondenceForm
      key={`${id}:${supersedes}:${preset}`}
      caseId={id}
      supersedes={supersedes}
      preset={preset}
    />
  );
}

interface BindContext {
  readonly caseRecord: CaseRecord;
  readonly etag: string;
  readonly items: ReportedItem[];
  /** The binding a correction names (null for a new binding or when this case has none). */
  readonly earlier: CorrespondenceBinding | null;
  /** A correction that already exists for `earlier`. */
  readonly successor: CorrespondenceBinding | null;
  /**
   * The message named in the address (from a captured message's page): null when none was named;
   * `message` is null when it does not exist.
   */
  readonly preset: { readonly message: Correspondence | null } | null;
}

function BindCorrespondenceForm({
  caseId,
  supersedes,
  preset,
}: {
  caseId: string;
  supersedes: string;
  preset: string;
}) {
  const api = useDirectoryApi();
  const [state, reload] = useLoad<BindContext>(
    `bind-correspondence:${caseId}:${supersedes}:${preset}`,
    async () => {
      const [caseResult, items, related, presetMessage] = await Promise.all([
        api.cases.get(caseId),
        api.cases.reportedItems.list(caseId, { limit: 100 }),
        supersedes === ''
          ? Promise.resolve(null)
          : api.correspondence.bindings.list(caseId, { q: supersedes, limit: 100 }),
        preset === ''
          ? Promise.resolve(null)
          : api.correspondence.get(preset).catch((error: unknown) => {
              if (error instanceof ApiError && error.status === 404) return null;
              throw error;
            }),
      ]);
      const earlier = related?.items.find((binding) => binding.id === supersedes) ?? null;
      const successor =
        related?.items.find((binding) => binding.supersedesBindingId === supersedes) ?? null;
      return {
        caseRecord: caseResult.data,
        etag: caseResult.etag,
        items: items.items,
        earlier,
        successor,
        preset: preset === '' ? null : { message: presetMessage },
      };
    },
  );
  const kept = useKept(state);
  if (state.status === 'error') {
    return <ErrorNotice error={state.error} recordLabel="case" onRetry={reload} />;
  }
  if (kept === null) return <LoadingNotice label="Loading case…" />;
  const context = kept;
  const trail = [
    ['Cases', '/cases'],
    [context.caseRecord.intakeLabel, `/cases/${caseId}`],
  ] as const;
  const title = supersedes === '' ? 'Bind captured correspondence' : 'Correct a binding';
  if (supersedes !== '' && context.earlier === null) {
    return (
      <article className="sheet">
        <Breadcrumbs trail={[...trail, [title, null]]} />
        <h1>{title}</h1>
        <p className="notice notice-quiet" role="alert" data-testid="binding-not-found">
          This case has no binding with this id. A binding is shown and corrected only under the
          case it belongs to. <Link to={`/cases/${caseId}`}>Back to the case</Link>
        </p>
      </article>
    );
  }
  return (
    <article className="sheet">
      <Breadcrumbs trail={[...trail, [title, null]]} />
      <h1>{title}</h1>
      <p className="page-intro">
        {BINDING_MEANING} {supersedes === '' ? '' : CORRECTION_MEANING}
      </p>
      <p className="notice notice-quiet">{NO_EXTERNAL_ACTION}</p>
      {context.caseRecord.archivedAt !== null ? (
        <p className="notice notice-quiet">
          This case is archived, so nothing can be bound to it. Restore the case first.
        </p>
      ) : context.successor !== null ? (
        <p className="notice notice-quiet" data-testid="binding-already-corrected">
          This binding already has a corrected interpretation. A binding history does not fork:{' '}
          <Link to={`/cases/${caseId}`}>open the case history</Link> and correct the latest one.
        </p>
      ) : (
        <BindingFields context={context} onReload={reload} />
      )}
    </article>
  );
}

function BindingFields({ context, onReload }: { context: BindContext; onReload: () => void }) {
  const api = useDirectoryApi();
  const navigate = useNavigate();
  const submission = useSubmission();
  const { caseRecord, earlier, etag, preset } = context;
  const caseId = caseRecord.id;
  // A message named in the address is offered only when it was captured for this case's agency.
  const presetMessage =
    preset?.message != null && preset.message.agencyId === caseRecord.agencyId
      ? preset.message
      : null;
  const [correspondenceId, setCorrespondenceId] = useState(
    earlier?.correspondenceId ?? presetMessage?.id ?? '',
  );
  const [eventType, setEventType] = useState<EventType | ''>(earlier?.eventType ?? '');
  const [reportedItemId, setReportedItemId] = useState(earlier?.reportedItemId ?? '');
  const [outcome, setOutcome] = useState<Outcome | ''>(earlier?.outcome ?? '');
  const [platformReference, setPlatformReference] = useState(earlier?.platformReference ?? '');
  const [interpretation, setInterpretation] = useState(earlier?.interpretation ?? '');
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const issues = issuesOf(submission.error);
  const refusal = submission.error instanceof ApiError ? submission.error : null;
  const refusedField =
    refusal !== null &&
    [
      'OUTCOME_ITEM_REQUIRED',
      'CROSS_CASE_REFERENCE',
      'CROSS_AGENCY_REFERENCE',
      'REFERENCE_NOT_FOUND',
    ].includes(refusal.code) &&
    typeof refusal.details['field'] === 'string'
      ? refusal.details['field']
      : null;
  const errorFor = (path: string) =>
    clientErrors[path] ??
    issues.find((issue) => issue.path === path)?.message ??
    (refusedField === path ? describeError(refusal, 'case') : undefined);
  const selectedMessage = useMessage(correspondenceId);
  const successorId =
    refusal?.code === 'BINDING_ALREADY_SUPERSEDED' ? refusal.details['successorId'] : undefined;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problems: Record<string, string> = {};
    if (correspondenceId === '') problems['correspondenceId'] = 'Choose the captured message.';
    if (eventType === '') problems['eventType'] = 'Choose what this message is recorded as.';
    setClientErrors(problems);
    const first = Object.keys(problems)[0];
    if (first !== undefined) {
      document.getElementById(`binding-${first}`)?.focus();
      return;
    }
    const body: BindCorrespondence = {
      correspondenceId,
      eventType: eventType as EventType,
      ...(reportedItemId === '' ? {} : { reportedItemId }),
      ...(outcome === '' ? {} : { outcome }),
      ...(platformReference === '' ? {} : { platformReference }),
      ...(interpretation === '' ? {} : { interpretation }),
      ...(earlier === null ? {} : { supersedesBindingId: earlier.id }),
    };
    const outcomeOfSubmit = await submission.submit({ caseId, etag, body }, (auth) =>
      api.correspondence.bindings.bind(caseId, body, etag, auth),
    );
    if (outcomeOfSubmit.ok) {
      void navigate(`/cases/${caseId}`, {
        state: {
          flash:
            earlier === null
              ? 'Binding recorded. Nothing was sent.'
              : 'Corrected interpretation recorded; the earlier binding stays as recorded. Nothing was sent.',
        } satisfies FlashState,
      });
      return;
    }
    const failure = outcomeOfSubmit.error;
    if (failure instanceof ApiError && typeof failure.details['field'] === 'string') {
      document.getElementById(`binding-${failure.details['field']}`)?.focus();
    }
  }

  return (
    <>
      {submission.conflict && (
        <ConflictNotice
          recordLabel="case"
          onReload={() => {
            submission.reset();
            onReload();
          }}
        />
      )}
      <ValidationSummary
        issues={issues}
        label={(path) => LABELS[path.split('.')[0] ?? ''] ?? path}
        fieldId={(path) => `binding-${path.split('.')[0] ?? ''}`}
      />
      {submission.error !== null && issues.length === 0 && refusedField === null && (
        <ErrorNotice error={submission.error} recordLabel="case" focusOnShow />
      )}
      {typeof successorId === 'string' && (
        <p className="notice notice-quiet">
          <Link to={`/cases/${caseId}`}>Open the case history</Link> to correct the latest
          interpretation.
        </p>
      )}
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="record-form">
        <fieldset className="fieldset">
          <legend>Captured message</legend>
          {preset !== null && presetMessage === null && (
            <p className="notice notice-quiet" data-testid="binding-foreign-message">
              The message named in this page’s address was not captured for this case’s agency, so
              it is not offered. A case binds only correspondence captured for its own agency.
            </p>
          )}
          {earlier === null ? (
            <MessagePicker
              agencyId={caseRecord.agencyId}
              value={correspondenceId}
              chosen={selectedMessage}
              onChange={setCorrespondenceId}
              error={errorFor('correspondenceId')}
            />
          ) : (
            <p className="hint">
              A correction keeps the captured message of the binding it corrects; another message
              needs its own binding.
            </p>
          )}
          {selectedMessage !== null && <MessageSummary message={selectedMessage} />}
        </fieldset>
        <fieldset className="fieldset">
          <legend>Interpretation for this case</legend>
          <SelectField
            id="binding-eventType"
            label="Recorded as"
            required
            hint="A past event, chosen explicitly — never inferred from the message, and never a command."
            value={eventType}
            placeholder="Choose what this message is recorded as"
            options={options(CORRESPONDENCE_EVENT_LABEL)}
            error={errorFor('eventType')}
            onChange={(value) => setEventType(value as EventType | '')}
          />
          {eventType !== '' && isAsSent(eventType) && (
            <p className="notice notice-quiet" data-testid="as-sent-copy">
              {AS_SENT_COPY}
            </p>
          )}
          {eventType !== '' &&
            isAsSent(eventType) &&
            selectedMessage?.captureMode === 'OPERATOR_REPORTED' && (
              <p className="hint" data-testid="as-sent-limited-posture">
                This message’s capture posture is “{CAPTURE_MODE_LABEL.OPERATOR_REPORTED}”.{' '}
                {CAPTURE_MODE_MEANING.OPERATOR_REPORTED}
              </p>
            )}
          <div className="field-grid">
            <SelectField
              id="binding-reportedItemId"
              label="Reported item"
              hint="An outcome is recorded for one reported item of this case; for several videos, record one binding per item."
              value={reportedItemId}
              options={[
                { value: '', label: 'None — the case as a whole' },
                ...context.items.map((item) => ({
                  value: item.id,
                  label: `${reportedItemLabel(item)}${item.archivedAt === null ? '' : ' (archived)'}`,
                  disabled: item.archivedAt !== null,
                })),
              ]}
              error={errorFor('reportedItemId')}
              onChange={setReportedItemId}
            />
            <SelectField
              id="binding-outcome"
              label="Recorded outcome"
              hint={OUTCOME_MEANING}
              value={outcome}
              options={[{ value: '', label: 'No outcome recorded' }, ...options(OUTCOME_LABEL)]}
              error={errorFor('outcome')}
              onChange={(value) => setOutcome(value as Outcome | '')}
            />
          </div>
          <TextField
            id="binding-platformReference"
            label="Platform reference (optional)"
            hint="For example a ticket number, exactly as it appears."
            value={platformReference}
            error={errorFor('platformReference')}
            onChange={setPlatformReference}
          />
          <TextField
            id="binding-interpretation"
            label="Interpretation (optional)"
            multiline
            hint="Your reading of the message for this case, in your words."
            value={interpretation}
            error={errorFor('interpretation')}
            onChange={setInterpretation}
          />
        </fieldset>
        <div className="form-actions">
          <button type="submit" className="button-primary" disabled={submission.pending}>
            {submission.pending
              ? 'Recording…'
              : earlier === null
                ? 'Record binding'
                : 'Record corrected interpretation'}
          </button>
          <Link to={`/cases/${caseId}`}>Cancel</Link>
        </div>
      </form>
    </>
  );
}

/** The captured message a form names (null while none is chosen or it is loading). */
function useMessage(id: string): Correspondence | null {
  const api = useDirectoryApi();
  const [state] = useLoad(`bind-message:${id}`, async () =>
    id === '' ? null : api.correspondence.get(id),
  );
  return state.status === 'ready' ? state.value : null;
}

function MessageSummary({ message }: { message: Correspondence }) {
  return (
    <div data-testid="binding-message-summary">
      <Details
        rows={[
          ['Subject as captured', <span className="prose">{message.subject}</span>],
          ['Direction', DIRECTION_LABEL[message.direction]],
          ['Capture posture', <CapturePosture mode={message.captureMode} />],
          ['Occurred', <Time iso={message.occurredAt} />],
          ['Recorded in TB', <Time iso={message.createdAt} />],
        ]}
      />
      <p className="hint">
        <Link to={`/correspondence/${message.id}`}>Open the captured message</Link>
      </p>
    </div>
  );
}

/** Captured messages of the case's agency only: another agency's message is never offered. */
function MessagePicker({
  agencyId,
  value,
  chosen,
  onChange,
  error,
}: {
  agencyId: string;
  value: string;
  /** The chosen message, offered even when the current search does not list it. */
  chosen: Correspondence | null;
  onChange: (value: string) => void;
  error: string | undefined;
}) {
  const api = useDirectoryApi();
  const [searchText, setSearchText] = useState('');
  const [q, setQ] = useState('');
  const [state] = useLoad(`bind-messages:${agencyId}:${q}`, () =>
    api.correspondence.list({ agencyId, ...(q ? { q } : {}), limit: 25 }),
  );
  const listed = state.status === 'ready' ? state.value.items : [];
  const extra =
    chosen !== null &&
    chosen.id === value &&
    chosen.agencyId === agencyId &&
    !listed.some((message) => message.id === chosen.id)
      ? [chosen]
      : [];
  const describedBy = error
    ? 'binding-correspondenceId-hint binding-correspondenceId-error'
    : 'binding-correspondenceId-hint';

  function onSearchKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      setQ(searchText.trim());
    }
  }

  return (
    <div className={`field${error ? ' field-invalid' : ''}`}>
      <label htmlFor="binding-correspondenceId">
        Captured message<span className="required"> (required)</span>
      </label>
      <p id="binding-correspondenceId-hint" className="hint">
        Messages captured for this case’s agency, newest recorded first. A message of another agency
        cannot be bound to this case.
      </p>
      <div className="inline-search">
        <label htmlFor="binding-message-search" className="visually-hidden">
          Find a captured message
        </label>
        <input
          id="binding-message-search"
          type="search"
          placeholder="Find by subject, Message-ID or address"
          value={searchText}
          autoComplete="off"
          onChange={(event) => setSearchText(event.target.value)}
          onKeyDown={onSearchKey}
        />
        <button type="button" onClick={() => setQ(searchText.trim())}>
          Find
        </button>
      </div>
      <select
        id="binding-correspondenceId"
        name="binding-correspondenceId"
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Choose a captured message</option>
        {[...extra, ...listed].map((message) => (
          <option key={message.id} value={message.id}>
            {`${message.subject} — ${DIRECTION_LABEL[message.direction].toLowerCase()}, ${CAPTURE_MODE_LABEL[message.captureMode].toLowerCase()}, recorded ${formatDateTime(message.createdAt)}`}
          </option>
        ))}
      </select>
      {state.status === 'loading' && <p className="hint">Loading captured messages…</p>}
      {state.status === 'error' && <ErrorNotice error={state.error} recordLabel="correspondence" />}
      {state.status === 'ready' && listed.length === 0 && (
        <p className="hint">
          No captured message of this agency{q ? ` matches “${q}”` : ''}.{' '}
          <Link to="/correspondence/new">Capture correspondence</Link> first.
        </p>
      )}
      {error && (
        <p id="binding-correspondenceId-error" className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
