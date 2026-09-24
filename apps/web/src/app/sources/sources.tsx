// Source registry pages (P3A). A source record points to a document kept elsewhere — normally the
// canonical record in Google Drive — with capture metadata: where it is, what it covers, whether
// access was checked and when, a content hash the operator supplied, and the provenance as
// reported. It is not the evidence, not a permission and not proof that anyone reviewed anything;
// nothing is fetched from the address and no hash is computed here. Records are immutable: a change
// is recorded as a new revision of the same chain, and only the current revision can be revised.
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import type {
  CreateSource,
  ReviseSource,
  SourceReference,
  SourceReferenceSummary,
} from '@tb/contracts';
import { Absent, Time } from '../directory/agencies.js';
import { createText, fieldIdFor, SelectField, TextField } from '../directory/fields.js';
import {
  ACCESS_STATE_LABEL,
  HASH_TARGET_LABEL,
  issuesOf,
  PROVENANCE_LABEL,
  SOURCE_ROLE_LABEL,
} from '../directory/format.js';
import { useDirectoryApi, useLoad } from '../directory/hooks.js';
import { DirectoryList } from '../directory/list.js';
import { RecordName } from '../directory/lookup.js';
import { useFlashMessage, useSubmission, type FlashState } from '../directory/record-page.js';
import {
  Breadcrumbs,
  Details,
  ErrorNotice,
  LoadingNotice,
  RecordHeader,
  Section,
  StateStamp,
  StatusNotice,
  UnavailableAction,
  ValidationSummary,
} from '../directory/ui.js';

type Role = SourceReference['sourceRole'];
type Access = SourceReference['accessState'];
type Provenance = SourceReference['reportedProvenance'];
type HashTarget = NonNullable<SourceReference['hashTarget']>;

const BOUNDARY =
  'A pointer with capture metadata — not evidence, permission, authority or proof of review.';
const INTRO =
  'A source record points to a document kept elsewhere, usually in Google Drive. Recording it proves nothing, reviews nothing and fetches nothing.';

const options = <K extends string>(labels: Readonly<Record<K, string>>) =>
  (Object.keys(labels) as K[]).map((value) => ({ value, label: labels[value] }));

export function SourceListPage() {
  const api = useDirectoryApi();
  const [params, setParams] = useSearchParams();
  const agencyId = params.get('agencyId') ?? '';
  const [agencies] = useLoad('sources:agency-filter', () => api.agencies.list({ limit: 100 }));
  const agencyItems = agencies.status === 'ready' ? agencies.value.items : [];
  return (
    <DirectoryList<SourceReferenceSummary>
      title="Sources"
      noun="sources"
      intro={INTRO}
      searchLabel="Search title, address or file id"
      newLabel="Record a source"
      newTo="/sources/new"
      filterKey={agencyId}
      filters={
        <label className="list-filter">
          Agency
          <select
            value={agencyId}
            onChange={(event) => {
              const next = new URLSearchParams(params);
              if (event.target.value === '') next.delete('agencyId');
              else next.set('agencyId', event.target.value);
              setParams(next);
            }}
          >
            <option value="">All sources</option>
            {agencyItems.map((agency) => (
              <option key={agency.id} value={agency.id}>
                {agency.displayName} (own and shared)
              </option>
            ))}
          </select>
        </label>
      }
      load={(query) => api.sources.list({ ...query, ...(agencyId ? { agencyId } : {}) })}
      emptyText={
        <p>
          No sources recorded yet. <Link to="/sources/new">Record the first source</Link>.
        </p>
      }
      columns={[
        {
          header: 'Title',
          cell: (source) => <Link to={`/sources/${source.id}`}>{source.title}</Link>,
        },
        { header: 'Kind', cell: (source) => SOURCE_ROLE_LABEL[source.sourceRole] },
        {
          header: 'Belongs to',
          cell: (source) =>
            source.agencyId === null ? (
              'Shared (no agency)'
            ) : (
              <RecordName kind="agency" id={source.agencyId} />
            ),
        },
        { header: 'Access', cell: (source) => ACCESS_STATE_LABEL[source.accessState] },
        {
          header: 'Reported provenance',
          cell: (source) => PROVENANCE_LABEL[source.reportedProvenance],
        },
        { header: 'Revision', cell: (source) => source.revision },
        { header: 'Recorded', cell: (source) => <Time iso={source.createdAt} /> },
      ]}
    />
  );
}

export function SourceDetailPage() {
  const { id = '' } = useParams();
  return <SourceDetail key={id} id={id} />;
}

interface SourceView {
  readonly source: SourceReference;
  /** The current revision of the chain (null only if the list could not find it). */
  readonly head: SourceReferenceSummary | null;
  /** This revision and its predecessors, newest first. */
  readonly chain: SourceReference[];
}

function SourceDetail({ id }: { id: string }) {
  const api = useDirectoryApi();
  const flash = useFlashMessage();
  const [state, reload] = useLoad<SourceView>(`source:${id}`, async () => {
    const source = await api.sources.get(id);
    const heads = await api.sources.list({ q: source.sourceGroupId, limit: 1 });
    const chain: SourceReference[] = [source];
    let previous = source.supersedesSourceId;
    while (previous !== null && chain.length < 100) {
      const earlier = await api.sources.get(previous);
      chain.push(earlier);
      previous = earlier.supersedesSourceId;
    }
    return { source, head: heads.items[0] ?? null, chain };
  });
  const trail = [['Sources', '/sources']] as const;
  if (state.status === 'loading') return <LoadingNotice label="Loading source…" />;
  if (state.status === 'error') {
    return (
      <>
        <Breadcrumbs trail={[...trail, ['Source', null]]} />
        <ErrorNotice error={state.error} recordLabel="source" onRetry={reload} />
      </>
    );
  }
  const { source, head, chain } = state.value;
  const current = head === null || head.id === source.id;
  const scope = source.scopeBindings ?? {};
  return (
    <article className="sheet" data-testid="source-detail">
      <Breadcrumbs trail={[...trail, [source.title, null]]} />
      <RecordHeader
        name={source.title}
        stamp={
          <StateStamp
            label={current ? 'Current revision' : 'Superseded'}
            tone={current ? 'active' : 'ended'}
          />
        }
        facts={[
          `Revision ${source.revision}`,
          SOURCE_ROLE_LABEL[source.sourceRole],
          source.agencyId === null ? 'Shared (no agency)' : 'Agency source',
        ]}
        boundary={BOUNDARY}
      />
      <StatusNotice message={flash} />
      <div className="record-actions" role="group" aria-label="Actions for this source">
        {current ? (
          <Link className="button" to={`/sources/${source.id}/revise`}>
            Record a new revision
          </Link>
        ) : (
          <UnavailableAction
            label="Record a new revision"
            reason="Only the current revision of a source can be revised."
          />
        )}
      </div>
      {!current && head !== null && (
        <p className="notice notice-quiet">
          A newer revision exists:{' '}
          <Link to={`/sources/${head.id}`}>
            revision {head.revision} — {head.title}
          </Link>
          . Records that cite this revision keep pointing at it.
        </p>
      )}
      <div className="sheet-columns">
        <Section title="Location">
          <Details
            rows={[
              [
                'Address',
                source.canonicalUrl && (
                  <a href={source.canonicalUrl} target="_blank" rel="noopener noreferrer">
                    {source.canonicalUrl}
                  </a>
                ),
              ],
              ['Provider file id', source.providerFileId && <code>{source.providerFileId}</code>],
              [
                'Provider revision id',
                source.providerRevisionId && <code>{source.providerRevisionId}</code>,
              ],
            ]}
          />
          <p className="hint">The app never opens or fetches this address.</p>
        </Section>
        <Section title="Access and content">
          <Details
            rows={[
              [
                'Access',
                <>
                  {ACCESS_STATE_LABEL[source.accessState]}
                  {source.observedAt !== null && (
                    <>
                      {' '}
                      (observed <Time iso={source.observedAt} />)
                    </>
                  )}
                </>,
              ],
              [
                'Content SHA-256',
                source.contentSha256 && (
                  <>
                    <code className="hash">{source.contentSha256}</code>
                    {source.hashTarget && <> of the {HASH_TARGET_LABEL[source.hashTarget]}</>}
                  </>
                ),
              ],
            ]}
          />
          <p className="hint">
            A hash is shown as it was supplied; this app does not compute or verify it.
          </p>
        </Section>
      </div>
      <Section title="Provenance as reported">
        <Details
          rows={[
            ['Reported provenance', PROVENANCE_LABEL[source.reportedProvenance]],
            ['Original label', source.rawProvenance],
            ['Reviewed by', source.reviewedByLabel],
            ['Reviewed at', source.reviewedAt && <Time iso={source.reviewedAt} />],
          ]}
        />
        <p className="hint">
          Recorded exactly as reported. This app reviews no documents and never upgrades provenance.
        </p>
      </Section>
      <Section title="Scope">
        <Details
          rows={[
            [
              'Belongs to',
              source.agencyId === null ? (
                'Shared (no agency)'
              ) : (
                <RecordName kind="agency" id={source.agencyId} />
              ),
            ],
            [
              'Shared with agencies',
              (scope.agencyIds ?? []).length === 0 ? null : (
                <NameList kind="agency" ids={scope.agencyIds ?? []} />
              ),
            ],
            [
              'Legal subjects named',
              (scope.legalSubjectIds ?? []).length === 0 ? null : (
                <NameList kind="legalSubject" ids={scope.legalSubjectIds ?? []} />
              ),
            ],
            ['Scope limitation', scope.limitation],
            ['What it covers', <p className="prose">{source.scopeText}</p>],
          ]}
        />
      </Section>
      <Section title="Excerpt">
        <Details
          rows={[
            ['Excerpt', source.excerpt && <p className="prose">{source.excerpt}</p>],
            ['Where in the source', source.excerptLocator],
            ['Limitations', source.limitations && <p className="prose">{source.limitations}</p>],
          ]}
        />
      </Section>
      <Section title="Revision history">
        <ol className="revision-list" reversed>
          {chain.map((revision) => (
            <li key={revision.id}>
              {revision.id === source.id ? (
                <strong>
                  Revision {revision.revision} (this page) — {revision.title}
                </strong>
              ) : (
                <Link to={`/sources/${revision.id}`}>
                  Revision {revision.revision} — {revision.title}
                </Link>
              )}{' '}
              <span className="hint">
                recorded <Time iso={revision.createdAt} />
              </span>
            </li>
          ))}
        </ol>
      </Section>
      <Section title="Record">
        <Details
          rows={[
            ['Record id', <code>{source.id}</code>],
            ['Chain id', <code>{source.sourceGroupId}</code>],
            ['Recorded', <Time iso={source.createdAt} />],
          ]}
        />
      </Section>
    </article>
  );
}

function NameList({ kind, ids }: { kind: 'agency' | 'legalSubject'; ids: readonly string[] }) {
  return (
    <ul className="plain-list">
      {ids.map((id) => (
        <li key={id}>
          <RecordName kind={kind} id={id} />
        </li>
      ))}
    </ul>
  );
}

export function NewSourcePage() {
  return <SourceForm base={null} />;
}

export function ReviseSourcePage() {
  const { id = '' } = useParams();
  const api = useDirectoryApi();
  const [state, reload] = useLoad(`source-revise:${id}`, () => api.sources.get(id));
  if (state.status === 'loading') return <LoadingNotice label="Loading source…" />;
  if (state.status === 'error') {
    return <ErrorNotice error={state.error} recordLabel="source" onRetry={reload} />;
  }
  return <SourceForm key={state.value.id} base={state.value} />;
}

/** `YYYY-MM-DDTHH:mm` in local time for a datetime-local input. */
function localInput(iso: string | null): string {
  if (iso === null) return '';
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const isoOf = (local: string): string | undefined =>
  local === '' ? undefined : new Date(local).toISOString();

const LABELS: Record<string, string> = {
  title: 'Title',
  sourceRole: 'Kind',
  canonicalUrl: 'Address',
  providerFileId: 'Provider file id',
  providerRevisionId: 'Provider revision id',
  agencyId: 'Belongs to',
  scopeText: 'What it covers',
  scopeBindings: 'Scope',
  accessState: 'Access',
  observedAt: 'Observed at',
  contentSha256: 'Content SHA-256',
  hashTarget: 'Computed from',
  reportedProvenance: 'Reported provenance',
  rawProvenance: 'Original label',
  reviewedByLabel: 'Reviewed by',
  reviewedAt: 'Reviewed at',
  excerpt: 'Excerpt',
  excerptLocator: 'Where in the source',
  limitations: 'Limitations',
};

/** Create (base = null) or record the next revision of `base` (agency and scope stay fixed). */
function SourceForm({ base }: { base: SourceReference | null }) {
  const api = useDirectoryApi();
  const navigate = useNavigate();
  const submission = useSubmission();
  const [values, setValues] = useState({
    title: base?.title ?? '',
    canonicalUrl: base?.canonicalUrl ?? '',
    providerFileId: base?.providerFileId ?? '',
    providerRevisionId: base?.providerRevisionId ?? '',
    scopeText: base?.scopeText ?? '',
    contentSha256: base?.contentSha256 ?? '',
    rawProvenance: base?.rawProvenance ?? '',
    reviewedByLabel: base?.reviewedByLabel ?? '',
    excerpt: base?.excerpt ?? '',
    excerptLocator: base?.excerptLocator ?? '',
    limitations: base?.limitations ?? '',
    scopeLimitation: '',
  });
  const [sourceRole, setSourceRole] = useState<Role | ''>(base?.sourceRole ?? '');
  const [accessState, setAccessState] = useState<Access>(base?.accessState ?? 'NOT_CHECKED');
  const [hashTarget, setHashTarget] = useState<HashTarget | ''>(base?.hashTarget ?? '');
  const [provenance, setProvenance] = useState<Provenance>(
    base?.reportedProvenance ?? 'OPERATOR_REPORTED',
  );
  const [observedAt, setObservedAt] = useState(localInput(base?.observedAt ?? null));
  const [reviewedAt, setReviewedAt] = useState(localInput(base?.reviewedAt ?? null));
  const [agencyId, setAgencyId] = useState('');
  const [sharedWith, setSharedWith] = useState<string[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [agencies] = useLoad('source-form:agencies', () => api.agencies.list({ limit: 100 }));
  const [subjectList] = useLoad('source-form:subjects', () =>
    api.legalSubjects.list({ limit: 100 }),
  );
  const agencyItems = (agencies.status === 'ready' ? agencies.value.items : []).filter(
    (agency) => agency.recordState !== 'ARCHIVED',
  );
  const subjectItems = (subjectList.status === 'ready' ? subjectList.value.items : []).filter(
    (subject) => subject.recordState !== 'ARCHIVED',
  );
  const issues = issuesOf(submission.error);
  const errorFor = (path: string) =>
    clientErrors[path] ?? issues.find((issue) => issue.path === path)?.message;
  const set = (name: keyof typeof values) => (value: string) =>
    setValues((current) => ({ ...current, [name]: value }));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problems: Record<string, string> = {};
    if (values.title.trim() === '') problems['title'] = 'Enter a title.';
    if (sourceRole === '') problems['sourceRole'] = 'Choose what kind of source this is.';
    if (values.scopeText.trim() === '') problems['scopeText'] = 'Describe what the source covers.';
    if (values.contentSha256 !== '' && !/^[0-9a-f]{64}$/.test(values.contentSha256)) {
      problems['contentSha256'] = 'Use exactly 64 lowercase hexadecimal characters.';
    }
    if ((values.contentSha256 === '') !== (hashTarget === '')) {
      problems[values.contentSha256 === '' ? 'contentSha256' : 'hashTarget'] =
        'Enter the SHA-256 value and what it was computed from, or neither.';
    }
    if (provenance === 'DOCUMENT_REVIEWED' && values.reviewedByLabel.trim() === '') {
      problems['reviewedByLabel'] = 'Name who reviewed the document, or choose another provenance.';
    }
    setClientErrors(problems);
    const first = Object.keys(problems)[0];
    if (first !== undefined) {
      document.getElementById(`source-${first}`)?.focus();
      return;
    }
    const scopeLimitation = createText(values.scopeLimitation, true);
    const newScope =
      sharedWith.length + subjects.length === 0 && scopeLimitation === undefined
        ? undefined
        : {
            ...(sharedWith.length > 0 ? { agencyIds: sharedWith } : {}),
            ...(subjects.length > 0 ? { legalSubjectIds: subjects } : {}),
            ...(scopeLimitation === undefined ? {} : { limitation: scopeLimitation }),
          };
    const capture = {
      title: values.title.trim(),
      sourceRole: sourceRole as Role,
      scopeText: values.scopeText,
      accessState,
      reportedProvenance: provenance,
      ...optional('canonicalUrl', createText(values.canonicalUrl)),
      ...optional('providerFileId', createText(values.providerFileId)),
      ...optional('providerRevisionId', createText(values.providerRevisionId)),
      ...(values.contentSha256 === ''
        ? {}
        : { contentSha256: values.contentSha256, hashTarget: hashTarget as HashTarget }),
      ...optional('observedAt', isoOf(observedAt)),
      ...optional('rawProvenance', createText(values.rawProvenance)),
      ...optional('reviewedByLabel', createText(values.reviewedByLabel)),
      ...optional('reviewedAt', isoOf(reviewedAt)),
      ...optional('excerpt', createText(values.excerpt, true)),
      ...optional('excerptLocator', createText(values.excerptLocator)),
      ...optional('limitations', createText(values.limitations, true)),
    };
    if (base === null) {
      const body: CreateSource = {
        ...capture,
        ...(agencyId === '' ? {} : { agencyId }),
        ...(newScope === undefined ? {} : { scopeBindings: newScope }),
      };
      const outcome = await submission.submit(body, (auth) => api.sources.create(body, auth));
      if (outcome.ok) {
        void navigate(`/sources/${outcome.value.id}`, {
          state: { flash: 'Source recorded.' } satisfies FlashState,
        });
      }
      return;
    }
    // A revision keeps the agency and scope of the current revision exactly.
    const body: ReviseSource = {
      ...capture,
      agencyId: base.agencyId,
      scopeBindings: base.scopeBindings,
    };
    const outcome = await submission.submit({ id: base.id, body }, (auth) =>
      api.sources.revise(base.id, body, auth),
    );
    if (outcome.ok) {
      void navigate(`/sources/${outcome.value.id}`, {
        state: { flash: `Revision ${outcome.value.revision} recorded.` } satisfies FlashState,
      });
    }
  }

  const text = (
    name: keyof typeof values,
    label: string,
    extra: { hint?: ReactNode; required?: boolean; multiline?: boolean; type?: 'url' } = {},
  ) => (
    <TextField
      id={`source-${name}`}
      label={label}
      value={values[name]}
      onChange={set(name)}
      error={errorFor(name)}
      hint={extra.hint}
      required={extra.required ?? false}
      multiline={extra.multiline ?? false}
      type={extra.type ?? 'text'}
    />
  );

  const title = base === null ? 'Record a source' : `New revision of ${base.title}`;
  return (
    <article className="sheet">
      <Breadcrumbs
        trail={[
          ['Sources', '/sources'],
          ...(base === null ? [] : ([[base.title, `/sources/${base.id}`]] as const)),
          [base === null ? 'Record a source' : 'New revision', null],
        ]}
      />
      <h1>{title}</h1>
      <p className="page-intro">
        {base === null
          ? `${INTRO} Enter only what you know; nothing is filled in for you.`
          : `The current revision stays unchanged; this creates revision ${base.revision + 1} of the same source. Agency and scope stay as they are — a different scope needs a new source record.`}
      </p>
      <ValidationSummary
        issues={issues}
        label={(path) => LABELS[path.split('.')[0] ?? ''] ?? path}
        fieldId={(path) => fieldIdFor('source', path)}
      />
      {submission.error !== null && issues.length === 0 && (
        <ErrorNotice error={submission.error} recordLabel="source" focusOnShow />
      )}
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="record-form">
        <fieldset className="fieldset">
          <legend>What it is</legend>
          {text('title', 'Title', { required: true, hint: 'As the document is known.' })}
          <SelectField
            id="source-sourceRole"
            label="Kind"
            required
            hint="A description of the source, not a verification."
            value={sourceRole}
            placeholder="Choose a kind"
            options={options(SOURCE_ROLE_LABEL)}
            error={errorFor('sourceRole')}
            onChange={(value) => setSourceRole(value as Role | '')}
          />
        </fieldset>
        <fieldset className="fieldset">
          <legend>Where it is</legend>
          <div className="field-grid">
            {text('canonicalUrl', 'Address', {
              type: 'url',
              hint: 'Full address, e.g. the Drive link. It is stored as a pointer and never opened.',
            })}
            {text('providerFileId', 'Provider file id', { hint: 'For example the Drive file id.' })}
            {text('providerRevisionId', 'Provider revision id')}
          </div>
        </fieldset>
        <fieldset className="fieldset">
          <legend>Scope</legend>
          {base === null ? (
            <>
              <SelectField
                id="source-agencyId"
                label="Belongs to"
                hint="An agency’s own source supports only that agency’s records. A shared source applies only where its scope names the record."
                value={agencyId}
                options={[
                  { value: '', label: 'Shared (no agency)' },
                  ...agencyItems.map((agency) => ({ value: agency.id, label: agency.displayName })),
                ]}
                error={errorFor('agencyId')}
                onChange={(value) => {
                  setAgencyId(value);
                  setSharedWith([]);
                }}
              />
              {agencyId === '' && (
                <CheckboxList
                  legend="Shared with agencies"
                  hint="Leave empty for a source that is not restricted to agencies."
                  items={agencyItems.map((agency) => ({
                    id: agency.id,
                    label: agency.displayName,
                  }))}
                  selected={sharedWith}
                  onChange={setSharedWith}
                />
              )}
              <CheckboxList
                legend="Legal subjects named"
                hint="The source applies to a legal subject only when it names that subject here."
                items={subjectItems.map((subject) => ({
                  id: subject.id,
                  label: subject.legalName,
                }))}
                selected={subjects}
                onChange={setSubjects}
              />
              {text('scopeLimitation', 'Scope limitation', { multiline: true })}
              <p className="hint">Case scope cannot be recorded before cases exist.</p>
            </>
          ) : (
            <Details
              rows={[
                [
                  'Belongs to',
                  base.agencyId === null ? (
                    'Shared (no agency)'
                  ) : (
                    <RecordName kind="agency" id={base.agencyId} />
                  ),
                ],
                [
                  'Shared with agencies',
                  (base.scopeBindings?.agencyIds ?? []).length === 0 ? null : (
                    <NameList kind="agency" ids={base.scopeBindings?.agencyIds ?? []} />
                  ),
                ],
                [
                  'Legal subjects named',
                  (base.scopeBindings?.legalSubjectIds ?? []).length === 0 ? null : (
                    <NameList kind="legalSubject" ids={base.scopeBindings?.legalSubjectIds ?? []} />
                  ),
                ],
                ['Scope limitation', base.scopeBindings?.limitation ?? null],
              ]}
            />
          )}
          {text('scopeText', 'What it covers', {
            required: true,
            multiline: true,
            hint: 'In your words: which parts of the document, for what.',
          })}
        </fieldset>
        <fieldset className="fieldset">
          <legend>Access and content</legend>
          <div className="field-grid">
            <SelectField
              id="source-accessState"
              label="Access"
              hint="Whether you could open it when you checked — a point in time, not a guarantee."
              value={accessState}
              options={options(ACCESS_STATE_LABEL)}
              onChange={(value) => setAccessState(value as Access)}
            />
            <DateTimeField
              id="source-observedAt"
              label="Observed at"
              value={observedAt}
              onChange={setObservedAt}
            />
          </div>
          <div className="field-grid">
            {text('contentSha256', 'Content SHA-256', {
              hint: 'Only a value you computed from the document itself. The app never computes one, and an address is never hashed as content.',
            })}
            <SelectField
              id="source-hashTarget"
              label="Computed from"
              value={hashTarget}
              placeholder="Not applicable"
              options={options(HASH_TARGET_LABEL)}
              error={errorFor('hashTarget')}
              onChange={(value) => setHashTarget(value as HashTarget | '')}
            />
          </div>
        </fieldset>
        <fieldset className="fieldset">
          <legend>Provenance as reported</legend>
          <p className="hint">
            Recorded exactly as you report it and never upgraded. “Document reviewed” is recorded
            only with the name of the person who reviewed the document.
          </p>
          <div className="field-grid">
            <SelectField
              id="source-reportedProvenance"
              label="Reported provenance"
              value={provenance}
              options={options(PROVENANCE_LABEL)}
              onChange={(value) => setProvenance(value as Provenance)}
            />
            {text('rawProvenance', 'Original label', {
              hint: 'An imported label such as OPERATOR_CONFIRMED, kept as written.',
            })}
            {text('reviewedByLabel', 'Reviewed by')}
            <DateTimeField
              id="source-reviewedAt"
              label="Reviewed at"
              hint="Leave empty when the time is not known."
              value={reviewedAt}
              onChange={setReviewedAt}
            />
          </div>
        </fieldset>
        <fieldset className="fieldset">
          <legend>Excerpt and limitations</legend>
          <p className="hint">
            Quote only the passage you need; the document itself stays in Drive.
          </p>
          {text('excerpt', 'Excerpt', { multiline: true })}
          {text('excerptLocator', 'Where in the source', {
            hint: 'For example: page 2, clause 4.',
          })}
          {text('limitations', 'Limitations', { multiline: true })}
        </fieldset>
        <div className="form-actions">
          <button type="submit" className="button-primary" disabled={submission.pending}>
            {submission.pending
              ? 'Saving…'
              : base === null
                ? 'Record source'
                : `Record revision ${base.revision + 1}`}
          </button>
          <Link to={base === null ? '/sources' : `/sources/${base.id}`}>Cancel</Link>
        </div>
      </form>
    </article>
  );
}

function optional<K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

function DateTimeField({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint && (
        <p id={`${id}-hint`} className="hint">
          {hint}
        </p>
      )}
      <input
        id={id}
        type="datetime-local"
        value={value}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function CheckboxList({
  legend,
  hint,
  items,
  selected,
  onChange,
}: {
  legend: string;
  hint: string;
  items: ReadonlyArray<{ id: string; label: string }>;
  selected: readonly string[];
  onChange: (next: string[]) => void;
}) {
  const [filter, setFilter] = useState('');
  const shown = items.filter((item) =>
    item.label.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase()),
  );
  return (
    <fieldset className="fieldset checkbox-list">
      <legend>{legend}</legend>
      <p className="hint">{hint}</p>
      {items.length > 8 && (
        <label className="list-filter">
          Filter
          <input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} />
        </label>
      )}
      {items.length === 0 ? (
        <Absent />
      ) : (
        <ul className="plain-list">
          {shown.map((item) => (
            <li key={item.id}>
              <label className="choice">
                <input
                  type="checkbox"
                  checked={selected.includes(item.id)}
                  onChange={(event) =>
                    onChange(
                      event.target.checked
                        ? [...selected, item.id]
                        : selected.filter((id) => id !== item.id),
                    )
                  }
                />
                <span>{item.label}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
