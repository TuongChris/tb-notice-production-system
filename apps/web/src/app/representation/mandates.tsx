// Mandate pages (P3B). A mandate is the container of one agency's representation record: its
// documentary terms live in its versions, their scope in coverages over exact routes, and later
// source-backed changes in authority events. A mandate row proves no current effectiveness, scope,
// signer eligibility, owner rights or case standing, so nothing here reads as authorized, valid,
// current or approved — and nothing is inferred from its label (a "FINAL" or "signed" label proves
// nothing). Archiving is an administrative flag only; it revokes and records nothing.
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import type {
  CreateMandate,
  Mandate,
  MandateCoverage,
  MandateVersion,
  PatchMandate,
} from '@tb/contracts';
import type { Versioned } from '../api/directory.js';
import { Absent, RecordFacts, Time } from '../directory/agencies.js';
import { CanonicalBindingSection, isBound } from '../directory/canonical-binding.js';
import {
  createText,
  fieldIdFor,
  SelectField,
  TextField,
  text as textOf,
} from '../directory/fields.js';
import {
  BINDING_STATE_LABEL,
  CHANGE_KIND_LABEL,
  DOCUMENT_STATE_LABEL,
  EXCLUSIVITY_LABEL,
  issuesOf,
  REVIEW_STATE_LABEL,
} from '../directory/format.js';
import { useDirectoryApi, useLoad } from '../directory/hooks.js';
import { DirectoryList } from '../directory/list.js';
import { RecordName } from '../directory/lookup.js';
import { useRecordOperation } from '../directory/record-actions.js';
import { useRecordPage, useSubmission, type FlashState } from '../directory/record-page.js';
import {
  Breadcrumbs,
  ConfirmDialog,
  ConflictNotice,
  Details,
  ErrorNotice,
  LoadingNotice,
  ReasonDialog,
  RecordHeader,
  Section,
  StateStamp,
  StatusNotice,
  UnavailableAction,
  ValidationSummary,
} from '../directory/ui.js';
import { NO_CURRENTNESS, NOT_AUTHORITY, VersionStamp } from './authority-ui.js';
import { EventTimeline } from './events.js';

const BOUNDARY =
  'The container of one agency’s representation record. It is not authority: it proves no current effectiveness, scope, signer eligibility, owner rights or case standing.';

const LABELS: Record<string, string> = {
  agencyId: 'Agency',
  label: 'Label',
  externalReference: 'External reference',
  description: 'Description',
  notes: 'Notes',
};

export function MandateListPage() {
  const api = useDirectoryApi();
  const [params, setParams] = useSearchParams();
  const agencyId = params.get('agencyId') ?? '';
  const [agencies] = useLoad('mandates:agency-filter', () => api.agencies.list({ limit: 100 }));
  const agencyItems = agencies.status === 'ready' ? agencies.value.items : [];
  function setAgency(value: string) {
    const next = new URLSearchParams(params);
    if (value === '') next.delete('agencyId');
    else next.set('agencyId', value);
    setParams(next);
  }
  const newTo = `/representation/mandates/new${agencyId ? `?agencyId=${agencyId}` : ''}`;
  return (
    <DirectoryList<Mandate>
      title="Mandates"
      noun="mandates"
      intro="Containers of one agency’s representation records: versions of the documentary terms, coverage over exact routes, coverage signers and authority events. A mandate is not authority by existing."
      searchLabel="Search label, external reference or code"
      newLabel="New mandate"
      newTo={newTo}
      filterKey={agencyId}
      filters={
        <label className="list-filter">
          Agency
          <select value={agencyId} onChange={(event) => setAgency(event.target.value)}>
            <option value="">All agencies</option>
            {agencyItems.map((agency) => (
              <option key={agency.id} value={agency.id}>
                {agency.displayName}
              </option>
            ))}
          </select>
        </label>
      }
      load={(query) => api.mandates.list({ ...query, ...(agencyId ? { agencyId } : {}) })}
      emptyText={
        agencyId ? (
          <p>
            No mandates for this agency.{' '}
            <button type="button" className="button-link" onClick={() => setAgency('')}>
              Show all agencies
            </button>
          </p>
        ) : (
          <p>
            No mandates yet. <Link to="/representation/mandates/new">Record the first mandate</Link>
            .
          </p>
        )
      }
      columns={[
        {
          header: 'Label',
          cell: (mandate) => (
            <Link to={`/representation/mandates/${mandate.id}`}>{mandate.label}</Link>
          ),
        },
        { header: 'Agency', cell: (mandate) => <RecordName kind="agency" id={mandate.agencyId} /> },
        {
          header: 'External reference',
          cell: (mandate) => mandate.externalReference ?? <Absent />,
        },
        {
          header: 'Canonical code',
          cell: (mandate) => mandate.canonicalCode ?? BINDING_STATE_LABEL[mandate.bindingState],
        },
        {
          header: 'Record',
          cell: (mandate) =>
            mandate.archivedAt === null ? (
              <span className="hint">Not archived</span>
            ) : (
              <StateStamp label="Archived" tone="archived" />
            ),
        },
        { header: 'Updated', cell: (mandate) => <Time iso={mandate.updatedAt} /> },
      ]}
    />
  );
}

export function MandateDetailPage() {
  const { id = '' } = useParams();
  return <MandateDetail key={id} id={id} />;
}

function MandateDetail({ id }: { id: string }) {
  const api = useDirectoryApi();
  const navigate = useNavigate();
  const page = useRecordPage(`mandate:${id}`, () => api.mandates.get(id));
  const trail = [
    ['Representation', '/representation'],
    ['Mandates', '/representation/mandates'],
  ] as const;
  if (page.state.status === 'loading') return <LoadingNotice label="Loading mandate…" />;
  if (page.state.status === 'error') {
    return (
      <>
        <Breadcrumbs trail={[...trail, ['Mandate', null]]} />
        <ErrorNotice error={page.state.error} recordLabel="mandate" onRetry={page.reload} />
      </>
    );
  }
  const record = page.state.value;
  const mandate = record.data;
  const archived = mandate.archivedAt !== null;
  return (
    <article className="sheet" data-testid="mandate-detail">
      <Breadcrumbs trail={[...trail, [mandate.label, null]]} />
      <RecordHeader
        name={mandate.label}
        stamp={archived ? <StateStamp label="Archived" tone="archived" /> : null}
        facts={[
          <>
            Agency: <RecordName kind="agency" id={mandate.agencyId} />
          </>,
          `Record version ${mandate.rowVersion}`,
          mandate.canonicalCode === null
            ? 'No canonical code (local only)'
            : `Canonical code ${mandate.canonicalCode}`,
        ]}
        boundary={BOUNDARY}
      />
      {page.conflict && <ConflictNotice recordLabel="mandate" onReload={page.reload} />}
      <StatusNotice message={page.message} />
      <MandateActions
        record={record}
        onChanged={page.update}
        onConflict={page.raiseConflict}
        onDeleted={() =>
          void navigate('/representation/mandates', {
            state: { flash: 'Unused mandate deleted.' } satisfies FlashState,
          })
        }
      />
      {archived && (
        <p className="notice notice-quiet">
          Archived <Time iso={mandate.archivedAt} />. Reason: {mandate.archiveReason}. An archived
          mandate and everything recorded under it are read-only; nothing was revoked.
        </p>
      )}
      <Section title="Mandate">
        <Details
          rows={[
            ['Agency', <RecordName kind="agency" id={mandate.agencyId} />],
            ['External reference', mandate.externalReference],
            ['Description', mandate.description && <p className="prose">{mandate.description}</p>],
          ]}
        />
        <p className="hint">
          Dates, scope, territory, platform and signers are recorded in the versions and their
          coverage — never on the mandate and never inferred from its label.
        </p>
      </Section>
      <AuthorityTree mandate={mandate} />
      <Section
        title="Authority events"
        actions={
          archived ? undefined : (
            <Link className="button" to={`/representation/mandates/${mandate.id}/events/new`}>
              Record authority event
            </Link>
          )
        }
      >
        <EventTimeline mandateId={mandate.id} />
      </Section>
      <CanonicalBindingSection
        noun="mandate"
        record={record}
        archived={archived}
        target={{ kind: 'Agency', agencyId: mandate.agencyId }}
        bind={(body, ifMatch, auth) => api.mandates.bindCanonical(mandate.id, body, ifMatch, auth)}
        onBound={page.update}
        onConflict={page.raiseConflict}
      />
      <Section title="Notes">
        {mandate.notes ? <p className="prose">{mandate.notes}</p> : <Absent />}
      </Section>
      <RecordFacts record={mandate} />
    </article>
  );
}

interface TreeVersion {
  readonly version: MandateVersion;
  readonly coverages: Array<{
    readonly coverage: MandateCoverage;
    readonly signers: Array<{
      readonly id: string;
      readonly signerId: string;
      readonly capacity: string;
    }>;
  }>;
}

/** The recorded hierarchy under a mandate: versions → coverage → coverage signers. */
function AuthorityTree({ mandate }: { mandate: Mandate }) {
  const api = useDirectoryApi();
  const [state, reload] = useLoad(`mandate-tree:${mandate.id}:${mandate.rowVersion}`, async () => {
    const versions = (await api.versions.list(mandate.id, { limit: 100 })).items;
    const ordered = [...versions].sort((a, b) => b.version - a.version);
    return Promise.all(
      ordered.map(async (version): Promise<TreeVersion> => {
        const coverages = (await api.coverages.list(version.id, { limit: 100 })).items;
        return {
          version,
          coverages: await Promise.all(
            coverages.map(async (coverage) => ({
              coverage,
              signers: (await api.coverageSigners.list(coverage.id, { limit: 100 })).items,
            })),
          ),
        };
      }),
    );
  });
  const archived = mandate.archivedAt !== null;
  const numberOf = (id: string | null) =>
    state.status === 'ready'
      ? state.value.find((item) => item.version.id === id)?.version.version
      : undefined;
  return (
    <Section
      title="Versions, coverage and coverage signers"
      actions={
        archived ? undefined : (
          <Link className="button" to={`/representation/mandates/${mandate.id}/versions/new`}>
            Record a version
          </Link>
        )
      }
    >
      <p className="hint">{NO_CURRENTNESS}</p>
      {state.status === 'loading' && <LoadingNotice label="Loading versions…" />}
      {state.status === 'error' && <ErrorNotice error={state.error} onRetry={reload} />}
      {state.status === 'ready' &&
        (state.value.length === 0 ? (
          <p className="absent">No version recorded yet.</p>
        ) : (
          <ol className="authority-tree" aria-label="Recorded versions">
            {state.value.map(({ version, coverages }) => (
              <li key={version.id}>
                <div className="tree-node">
                  <Link to={`/representation/versions/${version.id}`}>
                    Version {version.version}
                  </Link>{' '}
                  <VersionStamp state={version.versionState} />
                  <span className="tree-meta">
                    {CHANGE_KIND_LABEL[version.changeKind]}
                    {version.predecessorId !== null &&
                      ` · follows version ${numberOf(version.predecessorId) ?? '?'}`}{' '}
                    · document: {DOCUMENT_STATE_LABEL[version.documentState].toLowerCase()} ·
                    review: {REVIEW_STATE_LABEL[version.sourceReviewState].toLowerCase()}
                  </span>
                </div>
                {coverages.length === 0 ? (
                  <p className="tree-empty absent">No coverage recorded in this version.</p>
                ) : (
                  <ul aria-label={`Coverage of version ${version.version}`}>
                    {coverages.map(({ coverage, signers }) => (
                      <li key={coverage.id}>
                        <div className="tree-node">
                          <span className="tree-kind">Coverage</span>{' '}
                          <Link to={`/representation/coverages/${coverage.id}`}>
                            {coverage.coverageLabel}
                          </Link>
                          <span className="tree-meta">
                            route <RecordName kind="route" id={coverage.routeId} plain /> ·{' '}
                            {EXCLUSIVITY_LABEL[coverage.exclusivity].toLowerCase()}
                          </span>
                        </div>
                        {signers.length > 0 && (
                          <ul aria-label={`Coverage signers of ${coverage.coverageLabel}`}>
                            {signers.map((signer) => (
                              <li key={signer.id} className="tree-node">
                                <span className="tree-kind">Coverage signer</span>{' '}
                                <RecordName kind="signer" id={signer.signerId} />
                                <span className="tree-meta">{signer.capacity}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        ))}
    </Section>
  );
}

function MandateActions({
  record,
  onChanged,
  onConflict,
  onDeleted,
}: {
  record: Versioned<Mandate>;
  onChanged: (next: Versioned<Mandate>, message: string) => void;
  onConflict: () => void;
  onDeleted: () => void;
}) {
  const api = useDirectoryApi();
  const operation = useRecordOperation(record, onConflict);
  const mandate = record.data;
  const archived = mandate.archivedAt !== null;
  const deleteBlocker = archived
    ? 'Archived mandates are kept for history and are not deleted.'
    : isBound(mandate)
      ? 'This mandate has a canonical binding, so it is not an unused mandate.'
      : null;
  return (
    <div className="record-actions" role="group" aria-label="Actions for this mandate">
      {!archived && (
        <Link className="button" to={`/representation/mandates/${mandate.id}/edit`}>
          Edit
        </Link>
      )}
      {!archived ? (
        <button type="button" onClick={() => operation.show('archive')}>
          Archive
        </button>
      ) : (
        <button type="button" onClick={() => operation.show('restore')}>
          Restore
        </button>
      )}
      {deleteBlocker === null ? (
        <button
          type="button"
          className="button-danger-quiet"
          onClick={() => operation.show('delete')}
        >
          Delete unused mandate
        </button>
      ) : (
        <UnavailableAction label="Delete unused mandate" reason={deleteBlocker} />
      )}
      <ReasonDialog
        open={operation.open === 'archive'}
        title="Archive this mandate"
        description={
          <p>
            Archiving is an administrative flag: the mandate, its versions, coverage, coverage
            signers and events are kept unchanged but become read-only. Nothing is revoked,
            terminated or recorded as an authority event.
          </p>
        }
        confirmLabel="Archive"
        recordLabel="mandate"
        pending={operation.pending}
        error={operation.error}
        onCancel={operation.close}
        onConfirm={(reason) =>
          void operation.run(
            'archive',
            { reason },
            (auth) => api.mandates.archive(mandate.id, { reason }, record.etag, auth),
            (next) => onChanged(next, 'Archived.'),
          )
        }
      />
      <ReasonDialog
        open={operation.open === 'restore'}
        title="Restore this mandate"
        description={
          <p>
            The mandate becomes editable again. Restoring revives nothing: it states nothing about
            current authority. It is not restored while its agency is archived.
          </p>
        }
        confirmLabel="Restore"
        recordLabel="mandate"
        pending={operation.pending}
        error={operation.error}
        onCancel={operation.close}
        onConfirm={(reason) =>
          void operation.run(
            'restore',
            { reason },
            (auth) => api.mandates.restore(mandate.id, { reason }, record.etag, auth),
            (next) => onChanged(next, 'Restored.'),
          )
        }
      />
      <ConfirmDialog
        open={operation.open === 'delete'}
        title="Delete this unused mandate?"
        description={
          <p>
            Only a mandate with no version, no authority event, no binding and no other reference
            can be deleted, and deletion can’t be undone. Otherwise the server refuses and you can
            archive it instead.
          </p>
        }
        confirmLabel="Delete mandate"
        recordLabel="mandate"
        pending={operation.pending}
        error={operation.error}
        onCancel={operation.close}
        onConfirm={() =>
          void operation.run(
            'delete',
            null,
            (auth) => api.mandates.remove(mandate.id, record.etag, auth),
            () => onDeleted(),
          )
        }
      />
    </div>
  );
}

export function NewMandatePage() {
  const api = useDirectoryApi();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const submission = useSubmission();
  const [agencyId, setAgencyId] = useState(params.get('agencyId') ?? '');
  const [label, setLabel] = useState('');
  const [externalReference, setExternalReference] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [agencies] = useLoad('mandate-form:agencies', () => api.agencies.list({ limit: 100 }));
  const agencyItems = (agencies.status === 'ready' ? agencies.value.items : []).filter(
    (agency) => agency.recordState !== 'ARCHIVED',
  );
  const issues = issuesOf(submission.error);
  const errorFor = (path: string) =>
    clientErrors[path] ?? issues.find((issue) => issue.path === path)?.message;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problems: Record<string, string> = {};
    if (agencyId === '') problems['agencyId'] = 'Choose the agency this mandate belongs to.';
    if (label.trim() === '') problems['label'] = 'Enter the administrative label.';
    setClientErrors(problems);
    const first = Object.keys(problems)[0];
    if (first !== undefined) {
      document.getElementById(`mandate-${first}`)?.focus();
      return;
    }
    const reference = createText(externalReference);
    const descriptionText = createText(description, true);
    const noteText = createText(notes, true);
    const body: CreateMandate = {
      agencyId,
      label: label.trim(),
      ...(reference === undefined ? {} : { externalReference: reference }),
      ...(descriptionText === undefined ? {} : { description: descriptionText }),
      ...(noteText === undefined ? {} : { notes: noteText }),
    };
    const outcome = await submission.submit(body, (auth) => api.mandates.create(body, auth));
    if (outcome.ok) {
      void navigate(`/representation/mandates/${outcome.value.data.id}`, {
        state: {
          flash: 'Mandate recorded. Record its versions and coverage next.',
        } satisfies FlashState,
      });
    }
  }

  return (
    <article className="sheet">
      <Breadcrumbs
        trail={[
          ['Representation', '/representation'],
          ['Mandates', '/representation/mandates'],
          ['New mandate', null],
        ]}
      />
      <h1>New mandate</h1>
      <p className="page-intro">
        Record the container only. Dates, scope, territory, platform and signers belong to its
        versions and coverage, and nothing is inferred from the label — a label such as “FINAL” or
        “signed” proves nothing. {NOT_AUTHORITY}
      </p>
      <ValidationSummary
        issues={issues}
        label={(path) => LABELS[path] ?? path}
        fieldId={(path) => fieldIdFor('mandate', path)}
      />
      {submission.error !== null && issues.length === 0 && (
        <ErrorNotice error={submission.error} recordLabel="mandate" focusOnShow />
      )}
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="record-form">
        <fieldset className="fieldset">
          <legend>Mandate</legend>
          <SelectField
            id="mandate-agencyId"
            label="Agency"
            required
            hint="The agency whose representation record this is. Chosen explicitly; it never changes."
            value={agencyId}
            placeholder="Choose an agency"
            options={agencyItems.map((agency) => ({ value: agency.id, label: agency.displayName }))}
            error={errorFor('agencyId')}
            onChange={setAgencyId}
          />
          <TextField
            id="mandate-label"
            label="Label"
            required
            hint="An administrative name for finding the record."
            value={label}
            error={errorFor('label')}
            onChange={setLabel}
          />
          <TextField
            id="mandate-externalReference"
            label="External reference"
            hint="A reference printed on the document, if any. It is not a canonical code."
            value={externalReference}
            error={errorFor('externalReference')}
            onChange={setExternalReference}
          />
          <TextField
            id="mandate-description"
            label="Description"
            multiline
            value={description}
            error={errorFor('description')}
            onChange={setDescription}
          />
          <TextField
            id="mandate-notes"
            label="Notes"
            multiline
            value={notes}
            error={errorFor('notes')}
            onChange={setNotes}
          />
        </fieldset>
        <div className="form-actions">
          <button type="submit" className="button-primary" disabled={submission.pending}>
            {submission.pending ? 'Saving…' : 'Record mandate'}
          </button>
          <Link to="/representation/mandates">Cancel</Link>
        </div>
      </form>
    </article>
  );
}

export function EditMandatePage() {
  const { id = '' } = useParams();
  const api = useDirectoryApi();
  const [state, reload] = useLoad(`mandate-edit:${id}`, () => api.mandates.get(id));
  if (state.status === 'loading') return <LoadingNotice label="Loading mandate…" />;
  if (state.status === 'error') {
    return <ErrorNotice error={state.error} recordLabel="mandate" onRetry={reload} />;
  }
  return <MandatePatchForm key={state.value.etag} record={state.value} onReload={reload} />;
}

function MandatePatchForm({
  record,
  onReload,
}: {
  record: Versioned<Mandate>;
  onReload: () => void;
}) {
  const api = useDirectoryApi();
  const navigate = useNavigate();
  const submission = useSubmission();
  const mandate = record.data;
  const [label, setLabel] = useState(mandate.label);
  const [externalReference, setExternalReference] = useState(textOf(mandate.externalReference));
  const [description, setDescription] = useState(textOf(mandate.description));
  const [notes, setNotes] = useState(textOf(mandate.notes));
  const [nothingToSave, setNothingToSave] = useState(false);
  const issues = issuesOf(submission.error);
  const errorFor = (path: string) => issues.find((issue) => issue.path === path)?.message;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNothingToSave(false);
    const body: PatchMandate = {};
    if (label.trim() !== mandate.label && label.trim() !== '') body.label = label.trim();
    const reference = externalReference.trim() === '' ? null : externalReference.trim();
    if (reference !== mandate.externalReference) body.externalReference = reference;
    const descriptionValue = description.trim() === '' ? null : description;
    if (descriptionValue !== mandate.description) body.description = descriptionValue;
    const noteValue = notes.trim() === '' ? null : notes;
    if (noteValue !== mandate.notes) body.notes = noteValue;
    if (Object.keys(body).length === 0) {
      setNothingToSave(true);
      return;
    }
    const outcome = await submission.submit({ id: mandate.id, body }, (auth) =>
      api.mandates.patch(mandate.id, body, record.etag, auth),
    );
    if (outcome.ok) {
      void navigate(`/representation/mandates/${mandate.id}`, {
        state: { flash: 'Changes saved.' } satisfies FlashState,
      });
    }
  }

  return (
    <article className="sheet">
      <Breadcrumbs
        trail={[
          ['Representation', '/representation'],
          ['Mandates', '/representation/mandates'],
          [mandate.label, `/representation/mandates/${mandate.id}`],
          ['Edit', null],
        ]}
      />
      <h1>Edit mandate</h1>
      <p className="page-intro">
        Only changed fields are sent. The agency never changes; a different agency’s record is a
        different mandate.
      </p>
      {submission.conflict && <ConflictNotice recordLabel="mandate" onReload={onReload} />}
      <ValidationSummary
        issues={issues}
        label={(path) => LABELS[path] ?? path}
        fieldId={(path) => fieldIdFor('mandate', path)}
      />
      {submission.error !== null && issues.length === 0 && (
        <ErrorNotice error={submission.error} recordLabel="mandate" focusOnShow />
      )}
      {nothingToSave && (
        <p role="status" className="notice notice-quiet">
          Nothing to save: no field was changed.
        </p>
      )}
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="record-form">
        <fieldset className="fieldset">
          <legend>Agency (fixed)</legend>
          <Details rows={[['Agency', <RecordName kind="agency" id={mandate.agencyId} />]]} />
        </fieldset>
        <fieldset className="fieldset">
          <legend>Mandate</legend>
          <TextField
            id="mandate-label"
            label="Label"
            required
            value={label}
            error={errorFor('label')}
            onChange={setLabel}
          />
          <TextField
            id="mandate-externalReference"
            label="External reference"
            value={externalReference}
            error={errorFor('externalReference')}
            onChange={setExternalReference}
          />
          <TextField
            id="mandate-description"
            label="Description"
            multiline
            value={description}
            error={errorFor('description')}
            onChange={setDescription}
          />
          <TextField
            id="mandate-notes"
            label="Notes"
            multiline
            value={notes}
            error={errorFor('notes')}
            onChange={setNotes}
          />
        </fieldset>
        <div className="form-actions">
          <button type="submit" className="button-primary" disabled={submission.pending}>
            {submission.pending ? 'Saving…' : 'Save changes'}
          </button>
          <Link to={`/representation/mandates/${mandate.id}`}>Cancel</Link>
        </div>
      </form>
    </article>
  );
}
