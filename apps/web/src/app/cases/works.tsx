// Works (P4B): a copyrighted work named for one case, recorded exactly as entered. A work does not
// establish ownership, authorship, registration, standing or any right — a publication or source
// address is not title to anything — and rights assertions are separate, scoped case facts. Nothing
// is matched or de-duplicated by title or address, within a case or across cases. Archiving is
// administrative and cascades to nothing. Every page is keyed by the case and work ids and reads
// the work only under its own case: another case's work is not found.
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { CaseRecord, CaseWork, CreateCaseWork, PatchCaseWork } from '@tb/contracts';
import { ApiError } from '../api/client.js';
import type { Page, Versioned } from '../api/directory.js';
import { Time } from '../directory/agencies.js';
import {
  createText,
  fieldIdFor,
  patchText,
  TextField,
  text as textOf,
} from '../directory/fields.js';
import { FACT_TYPE_LABEL, issuesOf } from '../directory/format.js';
import { useDirectoryApi, useLoad } from '../directory/hooks.js';
import { useRecordPage, useSubmission, type FlashState } from '../directory/record-page.js';
import {
  Breadcrumbs,
  ConflictNotice,
  Details,
  ErrorNotice,
  LoadingNotice,
  RecordHeader,
  Section,
  StatusNotice,
  UnavailableAction,
  ValidationSummary,
} from '../directory/ui.js';
import {
  ARCHIVE_NO_CASCADE,
  ArchivedStamp,
  CASE_ARCHIVED_READ_ONLY,
  IntakeActions,
  NotInThisCase,
  WORK_MEANING,
} from './intake-ui.js';

/** The works of one case, archived ones included, newest first. */
export function WorksSection({
  caseRecord,
  works,
}: {
  caseRecord: CaseRecord;
  works: Page<CaseWork> | null;
}) {
  const archived = caseRecord.archivedAt !== null;
  return (
    <Section
      title="Works"
      actions={
        archived ? (
          <UnavailableAction label="Add a work" reason={CASE_ARCHIVED_READ_ONLY} />
        ) : (
          <Link className="button" to={`/cases/${caseRecord.id}/works/new`}>
            Add a work
          </Link>
        )
      }
    >
      <p className="hint">{WORK_MEANING}</p>
      {works !== null && works.items.length === 0 && (
        <p className="absent" data-testid="works-empty">
          No work is recorded for this case.
        </p>
      )}
      {works !== null && works.items.length > 0 && (
        <div className="table-frame">
          <table className="records" data-testid="works">
            <caption className="visually-hidden">Works of this case</caption>
            <thead>
              <tr>
                <th scope="col">Work as recorded</th>
                <th scope="col">Work type</th>
                <th scope="col">External work id</th>
                <th scope="col">Source address</th>
                <th scope="col">State</th>
              </tr>
            </thead>
            <tbody>
              {works.items.map((work) => (
                <tr key={work.id}>
                  <th scope="row">
                    <Link to={`/cases/${caseRecord.id}/works/${work.id}`}>{work.title}</Link>
                  </th>
                  <td>{work.workType ?? <span className="absent">Not recorded</span>}</td>
                  <td>{work.externalWorkId ?? <span className="absent">Not recorded</span>}</td>
                  <td className="prose">
                    {work.sourceUrl ?? <span className="absent">Not recorded</span>}
                  </td>
                  <td>
                    <ArchivedStamp archivedAt={work.archivedAt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {works?.nextCursor != null && (
        <p className="hint">Only the newest 100 works are listed here.</p>
      )}
    </Section>
  );
}

export function WorkDetailPage() {
  const { id = '', workId = '' } = useParams();
  return <WorkDetail key={`${id}:${workId}`} caseId={id} workId={workId} />;
}

function WorkDetail({ caseId, workId }: { caseId: string; workId: string }) {
  const api = useDirectoryApi();
  const page = useRecordPage(`work:${caseId}:${workId}`, () => api.cases.works.get(caseId, workId));
  const [caseState] = useLoad(`work-case:${caseId}`, () => api.cases.get(caseId));
  const caseRecord = caseState.status === 'ready' ? caseState.value.data : null;
  const trail = [
    ['Cases', '/cases'],
    [caseRecord?.intakeLabel ?? 'Case', `/cases/${caseId}`],
  ] as const;
  if (page.state.status === 'loading') return <LoadingNotice label="Loading work…" />;
  if (page.state.status === 'error') {
    const notFound = page.state.error instanceof ApiError && page.state.error.status === 404;
    return (
      <article className="sheet" data-testid="work-detail">
        <Breadcrumbs trail={[...trail, ['Work', null]]} />
        <h1>Work</h1>
        {notFound ? (
          <NotInThisCase caseId={caseId} noun="work" testId="work-not-found" />
        ) : (
          <ErrorNotice error={page.state.error} recordLabel="work" onRetry={page.reload} />
        )}
      </article>
    );
  }
  const record = page.state.value;
  const work = record.data;
  return (
    <article className="sheet" data-testid="work-detail">
      <Breadcrumbs trail={[...trail, [work.title, null]]} />
      <RecordHeader
        name={work.title}
        stamp={<ArchivedStamp archivedAt={work.archivedAt} />}
        facts={[`Version ${work.rowVersion}`, work.workType ?? 'Work type not recorded']}
        boundary={WORK_MEANING}
      />
      {page.conflict && <ConflictNotice recordLabel="work" onReload={page.reload} />}
      <StatusNotice message={page.message} />
      <IntakeActions
        record={record}
        noun="work"
        editTo={`/cases/${caseId}/works/${work.id}/edit`}
        caseArchived={caseRecord === null ? null : caseRecord.archivedAt !== null}
        archive={(body, etag, auth) => api.cases.works.archive(caseId, work.id, body, etag, auth)}
        restore={(body, etag, auth) => api.cases.works.restore(caseId, work.id, body, etag, auth)}
        onChanged={page.update}
        onConflict={page.raiseConflict}
      />
      {work.archivedAt !== null && (
        <p className="notice notice-quiet">
          Archived <Time iso={work.archivedAt} />. Reason: {work.archiveReason}.{' '}
          {ARCHIVE_NO_CASCADE}
        </p>
      )}
      <Section title="Work as recorded">
        <Details
          rows={[
            ['Title', work.title],
            ['Work type', work.workType],
            ['External work id', work.externalWorkId],
            ['Source address', work.sourceUrl && <span className="prose">{work.sourceUrl}</span>],
            ['Notes', work.notes && <p className="prose">{work.notes}</p>],
          ]}
        />
        <p className="hint">
          A source address is a pointer only: it is never opened and is not proof of ownership or of
          any right.
        </p>
      </Section>
      <WorkNamedBy caseId={caseId} workId={work.id} version={work.rowVersion} />
      <Section title="Record">
        <Details
          rows={[
            ['Record id', <code>{work.id}</code>],
            ['Case', <Link to={`/cases/${caseId}`}>{caseRecord?.intakeLabel ?? caseId}</Link>],
            ['Created', <Time iso={work.createdAt} />],
            ['Last changed', <Time iso={work.updatedAt} />],
            ['Version', String(work.rowVersion)],
          ]}
        />
      </Section>
      <p>
        <Link to={`/cases/${caseId}`}>Back to the case</Link>
      </p>
    </article>
  );
}

/** Use mappings and current fact revisions of this case that name the work (nothing cascades). */
function WorkNamedBy({
  caseId,
  workId,
  version,
}: {
  caseId: string;
  workId: string;
  version: number;
}) {
  const api = useDirectoryApi();
  const [state] = useLoad(`work-named-by:${caseId}:${workId}:${version}`, async () => {
    const [mappings, facts] = await Promise.all([
      api.cases.mappings.list(caseId, { q: workId, limit: 100 }),
      api.cases.facts.list(caseId, { q: workId, limit: 100 }),
    ]);
    return {
      mappings: mappings.items.filter((mapping) => mapping.caseWorkId === workId),
      facts: facts.items.filter((fact) => fact.caseWorkId === workId),
    };
  });
  return (
    <Section title="Recorded with this work">
      {state.status === 'loading' && <LoadingNotice label="Loading…" />}
      {state.status === 'error' && <ErrorNotice error={state.error} />}
      {state.status === 'ready' &&
        (state.value.mappings.length === 0 && state.value.facts.length === 0 ? (
          <p className="absent">No use mapping or fact of this case names this work.</p>
        ) : (
          <ul className="plain-list">
            {state.value.mappings.map((mapping) => (
              <li key={mapping.id}>
                <Link to={`/cases/${caseId}/mappings/${mapping.id}`}>
                  Use mapping, occurrence {mapping.occurrence}
                </Link>{' '}
                <ArchivedStamp archivedAt={mapping.archivedAt} />
              </li>
            ))}
            {state.value.facts.map((fact) => (
              <li key={fact.id}>
                <Link to={`/cases/${caseId}/facts/${fact.id}`}>
                  Fact: {FACT_TYPE_LABEL[fact.factType]} (revision {fact.revision})
                </Link>
              </li>
            ))}
          </ul>
        ))}
    </Section>
  );
}

// forms -----------------------------------------------------------------------------------------

const LABELS: Record<string, string> = {
  title: 'Title',
  sourceUrl: 'Source address',
  externalWorkId: 'External work id',
  workType: 'Work type',
  notes: 'Notes',
};

interface WorkText {
  readonly title: string;
  readonly sourceUrl: string;
  readonly externalWorkId: string;
  readonly workType: string;
  readonly notes: string;
}

function WorkFields({
  values,
  onChange,
  errorFor,
}: {
  values: WorkText;
  onChange: (values: WorkText) => void;
  errorFor: (path: string) => string | undefined;
}) {
  const set = (name: keyof WorkText) => (value: string) => onChange({ ...values, [name]: value });
  return (
    <>
      <TextField
        id="work-title"
        label="Title"
        required
        hint="The work’s title as the material names it."
        value={values.title}
        error={errorFor('title')}
        onChange={set('title')}
      />
      <TextField
        id="work-workType"
        label="Work type (optional)"
        hint="For example: music recording, film, broadcast, artwork."
        value={values.workType}
        error={errorFor('workType')}
        onChange={set('workType')}
      />
      <TextField
        id="work-externalWorkId"
        label="External work id (optional)"
        hint="An identifier the material uses for the work, for example a catalogue number."
        value={values.externalWorkId}
        error={errorFor('externalWorkId')}
        onChange={set('externalWorkId')}
      />
      <TextField
        id="work-sourceUrl"
        label="Source address (optional)"
        type="url"
        hint="Where the work is published or described. Stored as a pointer, never opened; it proves no ownership."
        value={values.sourceUrl}
        error={errorFor('sourceUrl')}
        onChange={set('sourceUrl')}
      />
      <TextField
        id="work-notes"
        label="Notes (optional)"
        multiline
        value={values.notes}
        error={errorFor('notes')}
        onChange={set('notes')}
      />
    </>
  );
}

const EMPTY_WORK: WorkText = {
  title: '',
  sourceUrl: '',
  externalWorkId: '',
  workType: '',
  notes: '',
};

export function NewWorkPage() {
  const { id = '' } = useParams();
  return <NewWork key={id} caseId={id} />;
}

function NewWork({ caseId }: { caseId: string }) {
  const api = useDirectoryApi();
  const navigate = useNavigate();
  const submission = useSubmission();
  const [state, reload] = useLoad(`work-new:${caseId}`, () => api.cases.get(caseId));
  const [values, setValues] = useState<WorkText>(EMPTY_WORK);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const issues = issuesOf(submission.error);
  const errorFor = (path: string) =>
    clientErrors[path] ?? issues.find((issue) => issue.path === path)?.message;
  if (state.status === 'loading') return <LoadingNotice label="Loading case…" />;
  if (state.status === 'error') {
    return <ErrorNotice error={state.error} recordLabel="case" onRetry={reload} />;
  }
  const caseRecord = state.value.data;
  const etag = state.value.etag;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (values.title.trim() === '') {
      setClientErrors({ title: 'Enter the work’s title.' });
      document.getElementById('work-title')?.focus();
      return;
    }
    setClientErrors({});
    const optional = (name: keyof WorkText, multiline = false) => {
      const value = createText(values[name], multiline);
      return value === undefined ? {} : { [name]: value };
    };
    const body: CreateCaseWork = {
      title: values.title.trim(),
      ...optional('workType'),
      ...optional('externalWorkId'),
      ...optional('sourceUrl'),
      ...optional('notes', true),
    };
    const outcome = await submission.submit({ caseId, etag, body }, (auth) =>
      api.cases.works.create(caseId, body, etag, auth),
    );
    if (outcome.ok) {
      void navigate(`/cases/${caseId}/works/${outcome.value.data.id}`, {
        state: { flash: 'Work recorded.' } satisfies FlashState,
      });
    }
  }

  return (
    <article className="sheet">
      <Breadcrumbs
        trail={[
          ['Cases', '/cases'],
          [caseRecord.intakeLabel, `/cases/${caseId}`],
          ['New work', null],
        ]}
      />
      <h1>New work</h1>
      <p className="page-intro">{WORK_MEANING}</p>
      {caseRecord.archivedAt !== null ? (
        <p className="notice notice-quiet">
          This case is archived, so nothing can be added to it. Restore the case first.
        </p>
      ) : (
        <>
          {submission.conflict && (
            <ConflictNotice
              recordLabel="case"
              onReload={() => {
                submission.reset();
                reload();
              }}
            />
          )}
          <ValidationSummary
            issues={issues}
            label={(path) => LABELS[path.split('.')[0] ?? ''] ?? path}
            fieldId={(path) => fieldIdFor('work', path)}
          />
          {submission.error !== null && issues.length === 0 && (
            <ErrorNotice error={submission.error} recordLabel="case" focusOnShow />
          )}
          <form noValidate onSubmit={(event) => void onSubmit(event)} className="record-form">
            <WorkFields values={values} onChange={setValues} errorFor={errorFor} />
            <div className="form-actions">
              <button type="submit" className="button-primary" disabled={submission.pending}>
                {submission.pending ? 'Recording…' : 'Record work'}
              </button>
              <Link to={`/cases/${caseId}`}>Cancel</Link>
            </div>
          </form>
        </>
      )}
    </article>
  );
}

export function EditWorkPage() {
  const { id = '', workId = '' } = useParams();
  return <EditWork key={`${id}:${workId}`} caseId={id} workId={workId} />;
}

function EditWork({ caseId, workId }: { caseId: string; workId: string }) {
  const api = useDirectoryApi();
  const [state, reload] = useLoad(`work-edit:${caseId}:${workId}`, async () => {
    const [caseResult, work] = await Promise.all([
      api.cases.get(caseId),
      api.cases.works.get(caseId, workId),
    ]);
    return { caseRecord: caseResult.data, work };
  });
  if (state.status === 'loading') return <LoadingNotice label="Loading work…" />;
  if (state.status === 'error') {
    if (state.error instanceof ApiError && state.error.status === 404) {
      return (
        <article className="sheet">
          <h1>Edit work</h1>
          <NotInThisCase caseId={caseId} noun="work" testId="work-not-found" />
        </article>
      );
    }
    return <ErrorNotice error={state.error} recordLabel="work" onRetry={reload} />;
  }
  return (
    <WorkEditForm
      key={state.value.work.etag}
      caseRecord={state.value.caseRecord}
      record={state.value.work}
      onReload={reload}
    />
  );
}

function WorkEditForm({
  caseRecord,
  record,
  onReload,
}: {
  caseRecord: CaseRecord;
  record: Versioned<CaseWork>;
  onReload: () => void;
}) {
  const api = useDirectoryApi();
  const navigate = useNavigate();
  const submission = useSubmission();
  const work = record.data;
  const caseId = caseRecord.id;
  const [values, setValues] = useState<WorkText>({
    title: work.title,
    sourceUrl: textOf(work.sourceUrl),
    externalWorkId: textOf(work.externalWorkId),
    workType: textOf(work.workType),
    notes: textOf(work.notes),
  });
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const issues = issuesOf(submission.error);
  const errorFor = (path: string) =>
    clientErrors[path] ?? issues.find((issue) => issue.path === path)?.message;
  const readOnly =
    caseRecord.archivedAt !== null
      ? 'This case is archived, so its works are read-only.'
      : work.archivedAt !== null
        ? 'This work is archived. Restore it before editing.'
        : null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = values.title.trim();
    if (title === '') {
      setClientErrors({ title: 'Enter the work’s title.' });
      document.getElementById('work-title')?.focus();
      return;
    }
    const changed = (name: 'sourceUrl' | 'externalWorkId' | 'workType' | 'notes') => {
      const value = patchText(values[name], work[name], name === 'notes');
      return value === undefined ? {} : { [name]: value };
    };
    const body: PatchCaseWork = {
      ...(title === work.title ? {} : { title }),
      ...changed('workType'),
      ...changed('externalWorkId'),
      ...changed('sourceUrl'),
      ...changed('notes'),
    };
    if (Object.keys(body).length === 0) {
      setClientErrors({ title: 'Change at least one field before saving.' });
      document.getElementById('work-title')?.focus();
      return;
    }
    setClientErrors({});
    const outcome = await submission.submit({ id: work.id, etag: record.etag, body }, (auth) =>
      api.cases.works.patch(caseId, work.id, body, record.etag, auth),
    );
    if (outcome.ok) {
      void navigate(`/cases/${caseId}/works/${work.id}`, {
        state: { flash: 'Work updated.' } satisfies FlashState,
      });
    }
  }

  return (
    <article className="sheet">
      <Breadcrumbs
        trail={[
          ['Cases', '/cases'],
          [caseRecord.intakeLabel, `/cases/${caseId}`],
          [work.title, `/cases/${caseId}/works/${work.id}`],
          ['Edit', null],
        ]}
      />
      <h1>Edit work</h1>
      <p className="page-intro">{WORK_MEANING}</p>
      {readOnly !== null ? (
        <p className="notice notice-quiet">{readOnly}</p>
      ) : (
        <>
          {submission.conflict && <ConflictNotice recordLabel="work" onReload={onReload} />}
          <ValidationSummary
            issues={issues}
            label={(path) => LABELS[path.split('.')[0] ?? ''] ?? path}
            fieldId={(path) => fieldIdFor('work', path)}
          />
          {submission.error !== null && issues.length === 0 && (
            <ErrorNotice error={submission.error} recordLabel="work" focusOnShow />
          )}
          <form noValidate onSubmit={(event) => void onSubmit(event)} className="record-form">
            <WorkFields values={values} onChange={setValues} errorFor={errorFor} />
            <div className="form-actions">
              <button type="submit" className="button-primary" disabled={submission.pending}>
                {submission.pending ? 'Saving…' : 'Save changes'}
              </button>
              <Link to={`/cases/${caseId}/works/${work.id}`}>Cancel</Link>
            </div>
          </form>
        </>
      )}
    </article>
  );
}
