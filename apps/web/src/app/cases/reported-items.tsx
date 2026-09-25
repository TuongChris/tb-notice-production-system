// Reported items (P4B): one YouTube video address named for one case. The address is stored exactly
// as entered; the server reads the video id from it (recognize-or-reject, nothing is fetched) and
// keeps a normalized watch address. A reported item is not a finding of infringement. The address,
// video id and normalized address are fixed once recorded; the title and observation time can be
// edited. Archiving is administrative and cascades to nothing. Every page is keyed by the case and
// item ids and reads the item only under its own case: another case's item is not found.
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type {
  CaseRecord,
  CreateReportedItem,
  PatchReportedItem,
  ReportedItem,
} from '@tb/contracts';
import { ApiError } from '../api/client.js';
import type { Page, Versioned } from '../api/directory.js';
import { Time } from '../directory/agencies.js';
import { fieldIdFor, patchText, TextField, text as textOf } from '../directory/fields.js';
import { describeError, FACT_TYPE_LABEL, issuesOf } from '../directory/format.js';
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
  instantInput,
  instantValue,
  IntakeActions,
  NotInThisCase,
  REPORTED_ITEM_MEANING,
  reportedItemLabel,
} from './intake-ui.js';

/** The reported items of one case, archived ones included, newest first. */
export function ReportedItemsSection({
  caseRecord,
  items,
}: {
  caseRecord: CaseRecord;
  items: Page<ReportedItem> | null;
}) {
  const archived = caseRecord.archivedAt !== null;
  return (
    <Section
      title="Reported items"
      actions={
        archived ? (
          <UnavailableAction label="Add a reported item" reason={CASE_ARCHIVED_READ_ONLY} />
        ) : (
          <Link className="button" to={`/cases/${caseRecord.id}/reported-items/new`}>
            Add a reported item
          </Link>
        )
      }
    >
      <p className="hint">{REPORTED_ITEM_MEANING}</p>
      {items !== null && items.items.length === 0 && (
        <p className="absent" data-testid="reported-items-empty">
          No reported item is recorded for this case.
        </p>
      )}
      {items !== null && items.items.length > 0 && (
        <div className="table-frame">
          <table className="records" data-testid="reported-items">
            <caption className="visually-hidden">Reported items of this case</caption>
            <thead>
              <tr>
                <th scope="col">Reported item</th>
                <th scope="col">Video id</th>
                <th scope="col">Address as entered</th>
                <th scope="col">Observed</th>
                <th scope="col">State</th>
              </tr>
            </thead>
            <tbody>
              {items.items.map((item) => (
                <tr key={item.id}>
                  <th scope="row">
                    <Link to={`/cases/${caseRecord.id}/reported-items/${item.id}`}>
                      {reportedItemLabel(item)}
                    </Link>
                  </th>
                  <td>
                    <code>{item.externalItemId}</code>
                  </td>
                  <td className="prose">{item.rawUrl}</td>
                  <td>
                    <Time iso={item.observedAt} />
                  </td>
                  <td>
                    <ArchivedStamp archivedAt={item.archivedAt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {items?.nextCursor != null && (
        <p className="hint">Only the newest 100 reported items are listed here.</p>
      )}
    </Section>
  );
}

export function ReportedItemDetailPage() {
  const { id = '', itemId = '' } = useParams();
  return <ReportedItemDetail key={`${id}:${itemId}`} caseId={id} itemId={itemId} />;
}

function ReportedItemDetail({ caseId, itemId }: { caseId: string; itemId: string }) {
  const api = useDirectoryApi();
  const page = useRecordPage(`reported-item:${caseId}:${itemId}`, () =>
    api.cases.reportedItems.get(caseId, itemId),
  );
  const [caseState] = useLoad(`reported-item-case:${caseId}`, () => api.cases.get(caseId));
  const caseRecord = caseState.status === 'ready' ? caseState.value.data : null;
  const trail = [
    ['Cases', '/cases'],
    [caseRecord?.intakeLabel ?? 'Case', `/cases/${caseId}`],
  ] as const;
  if (page.state.status === 'loading') return <LoadingNotice label="Loading reported item…" />;
  if (page.state.status === 'error') {
    const notFound = page.state.error instanceof ApiError && page.state.error.status === 404;
    return (
      <article className="sheet" data-testid="reported-item-detail">
        <Breadcrumbs trail={[...trail, ['Reported item', null]]} />
        <h1>Reported item</h1>
        {notFound ? (
          <NotInThisCase caseId={caseId} noun="reported item" testId="reported-item-not-found" />
        ) : (
          <ErrorNotice error={page.state.error} recordLabel="reported item" onRetry={page.reload} />
        )}
      </article>
    );
  }
  const record = page.state.value;
  const item = record.data;
  const caseArchived = caseRecord === null ? null : caseRecord.archivedAt !== null;
  return (
    <article className="sheet" data-testid="reported-item-detail">
      <Breadcrumbs trail={[...trail, [reportedItemLabel(item), null]]} />
      <RecordHeader
        name={reportedItemLabel(item)}
        stamp={<ArchivedStamp archivedAt={item.archivedAt} />}
        facts={[`Version ${item.rowVersion}`, `Video id ${item.externalItemId}`]}
        boundary={REPORTED_ITEM_MEANING}
      />
      {page.conflict && <ConflictNotice recordLabel="reported item" onReload={page.reload} />}
      <StatusNotice message={page.message} />
      <IntakeActions
        record={record}
        noun="reported item"
        editTo={`/cases/${caseId}/reported-items/${item.id}/edit`}
        caseArchived={caseArchived}
        archive={(body, etag, auth) =>
          api.cases.reportedItems.archive(caseId, item.id, body, etag, auth)
        }
        restore={(body, etag, auth) =>
          api.cases.reportedItems.restore(caseId, item.id, body, etag, auth)
        }
        onChanged={page.update}
        onConflict={page.raiseConflict}
      />
      {item.archivedAt !== null && (
        <p className="notice notice-quiet">
          Archived <Time iso={item.archivedAt} />. Reason: {item.archiveReason}.{' '}
          {ARCHIVE_NO_CASCADE}
        </p>
      )}
      <Section title="Reported item">
        <Details
          rows={[
            ['Address as entered', <span className="prose">{item.rawUrl}</span>],
            ['Video id (read from the address)', <code>{item.externalItemId}</code>],
            ['Normalized address', <span className="prose">{item.normalizedUrl}</span>],
            ['Title', item.displayTitle],
            ['Observed at', item.observedAt && <Time iso={item.observedAt} />],
          ]}
        />
        <p className="hint">
          The video id and normalized address are read from the address as entered; nothing was
          fetched from YouTube. They are fixed once recorded: a different video needs a new reported
          item.
        </p>
      </Section>
      <NamedBy caseId={caseId} itemId={item.id} version={item.rowVersion} />
      <Section title="Record">
        <Details
          rows={[
            ['Record id', <code>{item.id}</code>],
            ['Case', <Link to={`/cases/${caseId}`}>{caseRecord?.intakeLabel ?? caseId}</Link>],
            ['Created', <Time iso={item.createdAt} />],
            ['Last changed', <Time iso={item.updatedAt} />],
            ['Version', String(item.rowVersion)],
          ]}
        />
      </Section>
      <p>
        <Link to={`/cases/${caseId}`}>Back to the case</Link>
      </p>
    </article>
  );
}

/** Use mappings and current fact revisions of this case that name the item (nothing cascades). */
function NamedBy({ caseId, itemId, version }: { caseId: string; itemId: string; version: number }) {
  const api = useDirectoryApi();
  const [state] = useLoad(`reported-item-named-by:${caseId}:${itemId}:${version}`, async () => {
    const [mappings, facts] = await Promise.all([
      api.cases.mappings.list(caseId, { q: itemId, limit: 100 }),
      api.cases.facts.list(caseId, { q: itemId, limit: 100 }),
    ]);
    return {
      mappings: mappings.items.filter((mapping) => mapping.reportedItemId === itemId),
      facts: facts.items.filter((fact) => fact.reportedItemId === itemId),
    };
  });
  return (
    <Section title="Recorded with this reported item">
      {state.status === 'loading' && <LoadingNotice label="Loading…" />}
      {state.status === 'error' && <ErrorNotice error={state.error} />}
      {state.status === 'ready' && (
        <>
          {state.value.mappings.length === 0 && state.value.facts.length === 0 ? (
            <p className="absent">No use mapping or fact of this case names this reported item.</p>
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
          )}
        </>
      )}
    </Section>
  );
}

// forms -----------------------------------------------------------------------------------------

const LABELS: Record<string, string> = {
  rawUrl: 'YouTube video address',
  displayTitle: 'Title',
  observedAt: 'Observed at',
};

const URL_HINT =
  'The address of one YouTube video: youtube.com/watch?v=…, youtu.be/…, youtube.com/shorts/… or youtube.com/live/…. It is stored exactly as entered and never opened.';

export function NewReportedItemPage() {
  const { id = '' } = useParams();
  return <NewReportedItem key={id} caseId={id} />;
}

function NewReportedItem({ caseId }: { caseId: string }) {
  const api = useDirectoryApi();
  const navigate = useNavigate();
  const submission = useSubmission();
  const [state, reload] = useLoad(`reported-item-new:${caseId}`, () => api.cases.get(caseId));
  const [rawUrl, setRawUrl] = useState('');
  const [displayTitle, setDisplayTitle] = useState('');
  const [observedAt, setObservedAt] = useState('');
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const issues = issuesOf(submission.error);
  const refusal = submission.error instanceof ApiError ? submission.error : null;
  const errorFor = (path: string) =>
    clientErrors[path] ??
    issues.find((issue) => issue.path === path)?.message ??
    (refusal?.code === 'REPORTED_URL_UNSUPPORTED' && path === 'rawUrl'
      ? describeError(refusal, 'reported item')
      : undefined);
  if (state.status === 'loading') return <LoadingNotice label="Loading case…" />;
  if (state.status === 'error') {
    return <ErrorNotice error={state.error} recordLabel="case" onRetry={reload} />;
  }
  const caseRecord = state.value.data;
  const etag = state.value.etag;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problems: Record<string, string> = {};
    if (rawUrl.trim() === '') problems['rawUrl'] = 'Enter the address of the YouTube video.';
    setClientErrors(problems);
    if (Object.keys(problems).length > 0) {
      document.getElementById('reported-item-rawUrl')?.focus();
      return;
    }
    const observed = instantValue(observedAt, null);
    const body: CreateReportedItem = {
      rawUrl: rawUrl.trim(),
      ...(displayTitle.trim() === '' ? {} : { displayTitle: displayTitle.trim() }),
      ...(observed === null ? {} : { observedAt: observed }),
    };
    const outcome = await submission.submit({ caseId, etag, body }, (auth) =>
      api.cases.reportedItems.create(caseId, body, etag, auth),
    );
    if (outcome.ok) {
      void navigate(`/cases/${caseId}/reported-items/${outcome.value.data.id}`, {
        state: { flash: 'Reported item recorded.' } satisfies FlashState,
      });
    } else if (
      outcome.error instanceof ApiError &&
      outcome.error.code === 'REPORTED_URL_UNSUPPORTED'
    ) {
      document.getElementById('reported-item-rawUrl')?.focus();
    }
  }

  const duplicateId =
    refusal?.code === 'DUPLICATE_REPORTED_ITEM' &&
    typeof refusal.details['reportedItemId'] === 'string'
      ? refusal.details['reportedItemId']
      : null;
  return (
    <article className="sheet">
      <Breadcrumbs
        trail={[
          ['Cases', '/cases'],
          [caseRecord.intakeLabel, `/cases/${caseId}`],
          ['New reported item', null],
        ]}
      />
      <h1>New reported item</h1>
      <p className="page-intro">{REPORTED_ITEM_MEANING}</p>
      {caseRecord.archivedAt !== null ? (
        <p className="notice notice-quiet">
          This case is archived, so nothing can be added to it. Restore the case first.
        </p>
      ) : (
        <>
          {submission.conflict && <ConflictNotice recordLabel="case" onReload={reload} />}
          <ValidationSummary
            issues={issues}
            label={(path) => LABELS[path.split('.')[0] ?? ''] ?? path}
            fieldId={(path) => fieldIdFor('reported-item', path)}
          />
          {submission.error !== null &&
            issues.length === 0 &&
            refusal?.code !== 'REPORTED_URL_UNSUPPORTED' && (
              <ErrorNotice error={submission.error} recordLabel="case" focusOnShow />
            )}
          {duplicateId !== null && (
            <p className="notice notice-quiet">
              <Link to={`/cases/${caseId}/reported-items/${duplicateId}`}>
                Open the existing reported item
              </Link>
            </p>
          )}
          <form noValidate onSubmit={(event) => void onSubmit(event)} className="record-form">
            <TextField
              id="reported-item-rawUrl"
              label="YouTube video address"
              type="url"
              required
              hint={URL_HINT}
              value={rawUrl}
              error={errorFor('rawUrl')}
              onChange={setRawUrl}
            />
            <TextField
              id="reported-item-displayTitle"
              label="Title (optional)"
              hint="The title as you saw it; it identifies nothing by itself."
              value={displayTitle}
              error={errorFor('displayTitle')}
              onChange={setDisplayTitle}
            />
            <TextField
              id="reported-item-observedAt"
              label="Observed at (optional)"
              type="datetime-local"
              hint="When you observed the video, in your local time."
              value={observedAt}
              error={errorFor('observedAt')}
              onChange={setObservedAt}
            />
            <div className="form-actions">
              <button type="submit" className="button-primary" disabled={submission.pending}>
                {submission.pending ? 'Recording…' : 'Record reported item'}
              </button>
              <Link to={`/cases/${caseId}`}>Cancel</Link>
            </div>
          </form>
        </>
      )}
    </article>
  );
}

export function EditReportedItemPage() {
  const { id = '', itemId = '' } = useParams();
  return <EditReportedItem key={`${id}:${itemId}`} caseId={id} itemId={itemId} />;
}

function EditReportedItem({ caseId, itemId }: { caseId: string; itemId: string }) {
  const api = useDirectoryApi();
  const [state, reload] = useLoad(`reported-item-edit:${caseId}:${itemId}`, async () => {
    const [caseResult, item] = await Promise.all([
      api.cases.get(caseId),
      api.cases.reportedItems.get(caseId, itemId),
    ]);
    return { caseRecord: caseResult.data, item };
  });
  if (state.status === 'loading') return <LoadingNotice label="Loading reported item…" />;
  if (state.status === 'error') {
    if (state.error instanceof ApiError && state.error.status === 404) {
      return (
        <article className="sheet">
          <h1>Edit reported item</h1>
          <NotInThisCase caseId={caseId} noun="reported item" testId="reported-item-not-found" />
        </article>
      );
    }
    return <ErrorNotice error={state.error} recordLabel="reported item" onRetry={reload} />;
  }
  return (
    <ReportedItemEditForm
      key={state.value.item.etag}
      caseRecord={state.value.caseRecord}
      record={state.value.item}
      onReload={reload}
    />
  );
}

function ReportedItemEditForm({
  caseRecord,
  record,
  onReload,
}: {
  caseRecord: CaseRecord;
  record: Versioned<ReportedItem>;
  onReload: () => void;
}) {
  const api = useDirectoryApi();
  const navigate = useNavigate();
  const submission = useSubmission();
  const item = record.data;
  const caseId = caseRecord.id;
  const [displayTitle, setDisplayTitle] = useState(textOf(item.displayTitle));
  const [observedAt, setObservedAt] = useState(instantInput(item.observedAt));
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const issues = issuesOf(submission.error);
  const errorFor = (path: string) =>
    clientErrors[path] ?? issues.find((issue) => issue.path === path)?.message;
  const readOnly =
    caseRecord.archivedAt !== null
      ? 'This case is archived, so its reported items are read-only.'
      : item.archivedAt !== null
        ? 'This reported item is archived. Restore it before editing.'
        : null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = patchText(displayTitle, item.displayTitle);
    const observed = instantValue(observedAt, item.observedAt);
    const body: PatchReportedItem = {
      ...(title === undefined ? {} : { displayTitle: title }),
      ...(observed === item.observedAt ? {} : { observedAt: observed }),
    };
    if (Object.keys(body).length === 0) {
      setClientErrors({ displayTitle: 'Change at least one field before saving.' });
      document.getElementById('reported-item-displayTitle')?.focus();
      return;
    }
    setClientErrors({});
    const outcome = await submission.submit({ id: item.id, etag: record.etag, body }, (auth) =>
      api.cases.reportedItems.patch(caseId, item.id, body, record.etag, auth),
    );
    if (outcome.ok) {
      void navigate(`/cases/${caseId}/reported-items/${item.id}`, {
        state: { flash: 'Reported item updated.' } satisfies FlashState,
      });
    }
  }

  return (
    <article className="sheet">
      <Breadcrumbs
        trail={[
          ['Cases', '/cases'],
          [caseRecord.intakeLabel, `/cases/${caseId}`],
          [reportedItemLabel(item), `/cases/${caseId}/reported-items/${item.id}`],
          ['Edit', null],
        ]}
      />
      <h1>Edit reported item</h1>
      <p className="page-intro">
        The address, video id and normalized address are fixed once recorded; a different video
        needs a new reported item. {REPORTED_ITEM_MEANING}
      </p>
      {readOnly !== null ? (
        <p className="notice notice-quiet">{readOnly}</p>
      ) : (
        <>
          {submission.conflict && (
            <ConflictNotice recordLabel="reported item" onReload={onReload} />
          )}
          <ValidationSummary
            issues={issues}
            label={(path) => LABELS[path.split('.')[0] ?? ''] ?? path}
            fieldId={(path) => fieldIdFor('reported-item', path)}
          />
          {submission.error !== null && issues.length === 0 && (
            <ErrorNotice error={submission.error} recordLabel="reported item" focusOnShow />
          )}
          <form noValidate onSubmit={(event) => void onSubmit(event)} className="record-form">
            <Details
              rows={[
                ['Address as entered', <span className="prose">{item.rawUrl}</span>],
                ['Video id', <code>{item.externalItemId}</code>],
              ]}
            />
            <TextField
              id="reported-item-displayTitle"
              label="Title"
              value={displayTitle}
              error={errorFor('displayTitle')}
              onChange={setDisplayTitle}
            />
            <TextField
              id="reported-item-observedAt"
              label="Observed at"
              type="datetime-local"
              hint="In your local time. Left unchanged, the recorded time is kept exactly."
              value={observedAt}
              error={errorFor('observedAt')}
              onChange={setObservedAt}
            />
            <div className="form-actions">
              <button type="submit" className="button-primary" disabled={submission.pending}>
                {submission.pending ? 'Saving…' : 'Save changes'}
              </button>
              <Link to={`/cases/${caseId}/reported-items/${item.id}`}>Cancel</Link>
            </div>
          </form>
        </>
      )}
    </article>
  );
}
