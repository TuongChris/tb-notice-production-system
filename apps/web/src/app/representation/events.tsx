// Authority events (P3B): the append-only history of one mandate. An event records what an
// operator reports a cited source supports — currentness, revocation, termination, supersession,
// resignation or correction — with an explicit provenance; its existence proves nothing by itself.
// The timeline keeps two different times apart: when this application recorded the event, and the
// effective date or wording the source is reported to state (shown only when recorded). Events are
// never changed or deleted; a later event may supersede an earlier one of the same scope.
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { AuthorityEvent, CreateAuthorityEvent, MandateCoverage } from '@tb/contracts';
import { useSession } from '../auth/session.js';
import { Time } from '../directory/agencies.js';
import { fieldIdFor, SelectField, TextField } from '../directory/fields.js';
import { EVENT_TYPE_LABEL, issuesOf, PROVENANCE_LABEL } from '../directory/format.js';
import { useDirectoryApi, useLoad } from '../directory/hooks.js';
import { RecordName } from '../directory/lookup.js';
import { useSubmission, type FlashState } from '../directory/record-page.js';
import {
  Breadcrumbs,
  ConflictNotice,
  Details,
  ErrorNotice,
  LoadingNotice,
  ValidationSummary,
} from '../directory/ui.js';
import type { SourceTarget } from '../sources/scope.js';
import { RecordedBy, RecordedDate, SourceCitation, SourceSelect } from './authority-ui.js';

type EventType = AuthorityEvent['eventType'];
type Provenance = AuthorityEvent['provenance'];

const TIMES =
  '“Recorded” is when this application recorded the event — never a legal effective date. Effective dates are shown only as the source is reported to state them.';

function Effective({ event }: { event: AuthorityEvent }) {
  if (event.effectiveOn === null && event.effectiveAt === null && event.rawEffectiveText === null) {
    return <span className="absent">No effective date recorded</span>;
  }
  return (
    <span className="effective">
      {event.effectiveOn !== null && (
        <span>
          On <RecordedDate value={event.effectiveOn} />
        </span>
      )}
      {event.effectiveAt !== null && (
        <span>
          At <Time iso={event.effectiveAt} />
        </span>
      )}
      {event.rawEffectiveText !== null && <span>Wording: “{event.rawEffectiveText}”</span>}
    </span>
  );
}

/** The events of a mandate, newest recording first (optionally only those of one coverage). */
export function EventTimeline({
  mandateId,
  coverageId,
}: {
  mandateId: string;
  coverageId?: string;
}) {
  const api = useDirectoryApi();
  const { state: session } = useSession();
  const userId = session.status === 'authenticated' ? session.session.user.id : '';
  const [state, reload] = useLoad(`events:${mandateId}:${coverageId ?? ''}`, async () => {
    const page = await api.events.list(mandateId, {
      ...(coverageId ? { q: coverageId } : {}),
      limit: 100,
    });
    return page.items;
  });
  if (state.status === 'loading') return <LoadingNotice label="Loading authority events…" />;
  if (state.status === 'error') return <ErrorNotice error={state.error} onRetry={reload} />;
  const events = coverageId
    ? state.value.filter((event) => event.coverageId === coverageId)
    : state.value;
  return (
    <>
      <p className="hint">{TIMES}</p>
      {events.length === 0 ? (
        <p className="absent">
          No authority event recorded. The absence of an event means nothing was recorded — not that
          authority continues or ended.
        </p>
      ) : (
        <ol className="timeline" aria-label="Authority events, newest recording first">
          {events.map((event) => {
            const successor = state.value.find((other) => other.supersedesEventId === event.id);
            return (
              <li key={event.id} id={`event-${event.id}`} className="timeline-item">
                <div className="timeline-when">
                  <span className="timeline-label">Recorded</span>
                  <Time iso={event.createdAt} />
                  <span className="hint">
                    by <RecordedBy userId={event.createdById} currentUserId={userId} />
                  </span>
                </div>
                <div className="timeline-body">
                  <h3>
                    {EVENT_TYPE_LABEL[event.eventType]}{' '}
                    <span className={`provenance provenance-${event.provenance.toLowerCase()}`}>
                      {PROVENANCE_LABEL[event.provenance]}
                    </span>
                  </h3>
                  <Details
                    rows={[
                      ['Effective (as recorded)', <Effective event={event} />],
                      [
                        'Scope',
                        event.coverageId === null ? (
                          'Whole mandate, as the source is reported to support'
                        ) : (
                          <>
                            Coverage <RecordName kind="coverage" id={event.coverageId} />
                          </>
                        ),
                      ],
                      ['Source', <SourceCitation sourceId={event.sourceId} />],
                      [
                        'Supersedes',
                        event.supersedesEventId === null ? null : (
                          <a href={`#event-${event.supersedesEventId}`}>An earlier event</a>
                        ),
                      ],
                      [
                        'Superseded by',
                        successor === undefined ? null : (
                          <a href={`#event-${successor.id}`}>A later event</a>
                        ),
                      ],
                      ['Scope text', <p className="prose">{event.scopeText}</p>],
                      ['Interpretation', <p className="prose">{event.interpretation}</p>],
                    ]}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}

const LABELS: Record<string, string> = {
  coverageId: 'Scope',
  eventType: 'Event type',
  sourceId: 'Source',
  provenance: 'Provenance',
  effectiveOn: 'Effective on',
  effectiveAt: 'Effective at',
  rawEffectiveText: 'Effective wording',
  scopeText: 'Scope text',
  supersedesEventId: 'Supersedes',
  interpretation: 'Interpretation',
};

interface CoverageChoice {
  readonly coverage: MandateCoverage;
  readonly version: number;
}

export function NewAuthorityEventPage() {
  const { id = '' } = useParams();
  const api = useDirectoryApi();
  const navigate = useNavigate();
  const submission = useSubmission();
  const [mandate, reloadMandate] = useLoad(`event-form:mandate:${id}`, () => api.mandates.get(id));
  const [coverages] = useLoad(`event-form:coverages:${id}`, async (): Promise<CoverageChoice[]> => {
    const versions = (await api.versions.list(id, { limit: 100 })).items.filter(
      (version) => version.versionState === 'FROZEN',
    );
    const lists = await Promise.all(
      versions.map(async (version) =>
        (await api.coverages.list(version.id, { limit: 100 })).items.map((coverage) => ({
          coverage,
          version: version.version,
        })),
      ),
    );
    return lists.flat();
  });
  const [events] = useLoad(
    `event-form:events:${id}`,
    async () => (await api.events.list(id, { limit: 100 })).items,
  );
  const [coverageId, setCoverageId] = useState('');
  const [eventType, setEventType] = useState<EventType | ''>('');
  const [sourceId, setSourceId] = useState('');
  const [provenance, setProvenance] = useState<Provenance>('OPERATOR_REPORTED');
  const [effectiveOn, setEffectiveOn] = useState('');
  const [effectiveAt, setEffectiveAt] = useState('');
  const [rawEffectiveText, setRawEffectiveText] = useState('');
  const [scopeText, setScopeText] = useState('');
  const [interpretation, setInterpretation] = useState('');
  const [supersedesEventId, setSupersedesEventId] = useState('');
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const coverageItems = coverages.status === 'ready' ? coverages.value : [];
  const chosen = coverageItems.find((item) => item.coverage.id === coverageId) ?? null;
  const [routeSubject] = useLoad(`event-form:route:${chosen?.coverage.routeId ?? ''}`, async () => {
    if (chosen === null) return null;
    const route = (await api.routes.get(chosen.coverage.routeId)).data;
    return (await api.ownerSubjects.get(route.ownerSubjectId)).data.legalSubjectId;
  });
  const [source] = useLoad(`event-form:source:${sourceId}`, async () =>
    sourceId === '' ? null : api.sources.get(sourceId),
  );
  const sourceReviewed =
    source.status === 'ready' && source.value?.reportedProvenance === 'DOCUMENT_REVIEWED';
  const issues = issuesOf(submission.error);
  const errorFor = (path: string) =>
    clientErrors[path] ?? issues.find((issue) => issue.path === path)?.message;

  if (mandate.status === 'loading') return <LoadingNotice label="Loading mandate…" />;
  if (mandate.status === 'error') {
    return <ErrorNotice error={mandate.error} recordLabel="mandate" onRetry={reloadMandate} />;
  }
  const record = mandate.value;
  const agencyId = record.data.agencyId;
  const target: SourceTarget | null =
    coverageId === ''
      ? { kind: 'Agency', agencyId }
      : routeSubject.status === 'ready' && routeSubject.value !== null
        ? { kind: 'Route', agencyId, legalSubjectId: routeSubject.value }
        : null;
  const eventItems = events.status === 'ready' ? events.value : [];
  const supersedable = eventItems.filter(
    (event) =>
      (event.coverageId ?? '') === coverageId &&
      !eventItems.some((other) => other.supersedesEventId === event.id),
  );

  async function onSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const problems: Record<string, string> = {};
    if (eventType === '') problems['eventType'] = 'Choose the event type the source states.';
    if (sourceId === '') problems['sourceId'] = 'Choose the source that supports this event.';
    if (scopeText.trim() === '') problems['scopeText'] = 'Describe the scope the source states.';
    if (interpretation.trim() === '') {
      problems['interpretation'] = 'Record how the source was read.';
    }
    setClientErrors(problems);
    const first = Object.keys(problems)[0];
    if (first !== undefined || eventType === '') {
      if (first !== undefined) document.getElementById(`event-${first}`)?.focus();
      return;
    }
    const body: CreateAuthorityEvent = {
      eventType,
      sourceId,
      provenance,
      scopeText,
      interpretation,
      ...(coverageId === '' ? {} : { coverageId }),
      ...(effectiveOn === '' ? {} : { effectiveOn }),
      ...(effectiveAt.trim() === '' ? {} : { effectiveAt: effectiveAt.trim() }),
      ...(rawEffectiveText.trim() === '' ? {} : { rawEffectiveText: rawEffectiveText.trim() }),
      ...(supersedesEventId === '' ? {} : { supersedesEventId }),
    };
    const outcome = await submission.submit({ mandate: record.etag, body }, (auth) =>
      api.mandates.recordEvent(record.data.id, body, record.etag, auth),
    );
    if (outcome.ok) {
      void navigate(`/representation/mandates/${record.data.id}`, {
        state: { flash: 'Authority event recorded.' } satisfies FlashState,
      });
    }
  }

  return (
    <article className="sheet">
      <Breadcrumbs
        trail={[
          ['Representation', '/representation'],
          ['Mandates', '/representation/mandates'],
          [record.data.label, `/representation/mandates/${record.data.id}`],
          ['Record authority event', null],
        ]}
      />
      <h1>Record authority event</h1>
      <p className="page-intro">
        Record only what the cited source is reported to support, exactly as it states it. An event
        is appended to the history and never changed; the recording time is kept separately and is
        never an effective date. Nothing is inferred from silence, a missing end date or a later
        version.
      </p>
      {submission.conflict && (
        <ConflictNotice
          recordLabel="mandate"
          onReload={() => {
            submission.reset();
            reloadMandate();
          }}
        />
      )}
      <ValidationSummary
        issues={issues}
        label={(path) => LABELS[path] ?? path}
        fieldId={(path) => fieldIdFor('event', path)}
      />
      {submission.error !== null && issues.length === 0 && (
        <ErrorNotice error={submission.error} recordLabel="event" focusOnShow />
      )}
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="record-form">
        <fieldset className="fieldset">
          <legend>What the source records</legend>
          <SelectField
            id="event-coverageId"
            label="Scope"
            hint="The whole mandate only when the source supports that scope; otherwise one coverage of a frozen version. A draft version is edited, not evented."
            value={coverageId}
            options={[
              { value: '', label: 'Whole mandate' },
              ...coverageItems.map(({ coverage, version }) => ({
                value: coverage.id,
                label: `Coverage “${coverage.coverageLabel}” (version ${version})`,
              })),
            ]}
            error={errorFor('coverageId')}
            onChange={(value) => {
              setCoverageId(value);
              setSourceId('');
              setSupersedesEventId('');
            }}
          />
          <SelectField
            id="event-eventType"
            label="Event type"
            required
            value={eventType}
            placeholder="Choose the event type"
            options={(Object.keys(EVENT_TYPE_LABEL) as EventType[]).map((value) => ({
              value,
              label: EVENT_TYPE_LABEL[value],
            }))}
            error={errorFor('eventType')}
            onChange={(value) => setEventType(value as EventType | '')}
          />
          <SourceSelect
            id="event-sourceId"
            label="Source"
            required
            hint="Only sources whose recorded scope includes this scope are offered."
            target={target}
            value={sourceId}
            noneLabel="Choose a source"
            error={errorFor('sourceId')}
            onChange={(value) => {
              setSourceId(value);
              if (provenance === 'DOCUMENT_REVIEWED') setProvenance('OPERATOR_REPORTED');
            }}
          />
          <SelectField
            id="event-provenance"
            label="Provenance"
            required
            hint="Stored exactly as chosen and never upgraded. “Document reviewed” is available only when the chosen source records who reviewed the document."
            value={provenance}
            options={(Object.keys(PROVENANCE_LABEL) as Provenance[]).map((value) => ({
              value,
              label: PROVENANCE_LABEL[value],
              disabled: value === 'DOCUMENT_REVIEWED' && !sourceReviewed,
            }))}
            error={errorFor('provenance')}
            onChange={(value) => setProvenance(value as Provenance)}
          />
        </fieldset>
        <fieldset className="fieldset">
          <legend>Effective date, only as the source states it</legend>
          <p className="hint">
            Leave empty when the source states no date. The capture date, today and the recording
            time are never used as an effective date.
          </p>
          <TextField
            id="event-effectiveOn"
            label="Effective on"
            type="date"
            value={effectiveOn}
            error={errorFor('effectiveOn')}
            onChange={setEffectiveOn}
          />
          <TextField
            id="event-effectiveAt"
            label="Effective at"
            hint="Date and time with offset, e.g. 2026-09-24T10:00:00+07:00."
            value={effectiveAt}
            error={errorFor('effectiveAt')}
            onChange={setEffectiveAt}
          />
          <TextField
            id="event-rawEffectiveText"
            label="Effective wording"
            hint="The source’s own words, e.g. “with effect from the end of the month”."
            value={rawEffectiveText}
            error={errorFor('rawEffectiveText')}
            onChange={setRawEffectiveText}
          />
        </fieldset>
        <fieldset className="fieldset">
          <legend>Reading</legend>
          <TextField
            id="event-scopeText"
            label="Scope text"
            required
            multiline
            value={scopeText}
            error={errorFor('scopeText')}
            onChange={setScopeText}
          />
          <TextField
            id="event-interpretation"
            label="Interpretation"
            required
            multiline
            hint="How the source was read. Kept with the event; the audit trail records only its length."
            value={interpretation}
            error={errorFor('interpretation')}
            onChange={setInterpretation}
          />
          <SelectField
            id="event-supersedesEventId"
            label="Supersedes"
            hint="Optional. Only an event of the same scope that has no successor yet; the earlier event is kept unchanged."
            value={supersedesEventId}
            options={[
              { value: '', label: 'Supersedes no event' },
              ...supersedable.map((event) => ({
                value: event.id,
                label: `${EVENT_TYPE_LABEL[event.eventType]} recorded ${new Date(event.createdAt).toLocaleString()}`,
              })),
            ]}
            error={errorFor('supersedesEventId')}
            onChange={setSupersedesEventId}
          />
        </fieldset>
        <div className="form-actions">
          <button type="submit" className="button-primary" disabled={submission.pending}>
            {submission.pending ? 'Saving…' : 'Record event'}
          </button>
          <Link to={`/representation/mandates/${record.data.id}`}>Cancel</Link>
        </div>
      </form>
    </article>
  );
}
