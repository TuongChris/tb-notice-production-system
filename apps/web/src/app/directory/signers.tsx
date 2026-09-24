// Signer pages. A signer record describes a person acting in one agency's capacity. It is not an
// application login, it signs nothing, and being AVAILABLE does not make the person eligible for
// any authority (that needs mandate coverage, a later phase). The agency is fixed at creation.
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import type { Agency, CreateSigner, PatchSigner, Signer } from '@tb/contracts';
import type { Versioned } from '../api/directory.js';
import { Absent, RecordFacts, Time } from './agencies.js';
import {
  createTexts,
  fieldIdFor,
  initialTexts,
  patchTexts,
  SelectField,
  TextField,
  type TextSpec,
} from './fields.js';
import { issuesOf, RECORD_STATE_LABEL, SIGNER_STATE_LABEL, SIGNER_STATE_TONE } from './format.js';
import { useDirectoryApi, useLoad } from './hooks.js';
import { DirectoryList } from './list.js';
import { SignerActions } from './record-actions.js';
import { useRecordPage, useSubmission, type FlashState } from './record-page.js';
import {
  Breadcrumbs,
  ConflictNotice,
  Details,
  ErrorNotice,
  LoadingNotice,
  RecordHeader,
  Section,
  StateStamp,
  StatusNotice,
  ValidationSummary,
} from './ui.js';

type TextKey = 'fullLegalName' | 'title' | 'contactEmail' | 'notes';

const TEXTS: readonly TextSpec<TextKey>[] = [
  {
    name: 'fullLegalName',
    label: 'Full legal name',
    hint: 'As in the person’s identity document.',
  },
  {
    name: 'title',
    label: 'Title or capacity',
    hint: 'For example: director. A title is not proof of authority.',
  },
  { name: 'contactEmail', label: 'Contact email', type: 'email' },
  { name: 'notes', label: 'Notes', multiline: true },
];

const labelOf = (path: string): string => {
  const [head] = path.split('.');
  if (head === 'agencyId') return 'Agency';
  return TEXTS.find((spec) => spec.name === head)?.label ?? head ?? 'Request';
};

const BOUNDARY =
  'A person acting for one agency. Not a login; signs nothing; eligibility comes only from mandate coverage, which is not part of this phase.';

const SOURCES_UNAVAILABLE =
  'Identity and delegation source references can’t be attached until the Source phase.';

/** All agencies for pickers and name lookups (the directory is small; at most 100 are shown). */
function useAgencies() {
  const api = useDirectoryApi();
  return useLoad('agencies:all', () => api.agencies.list({ limit: 100 }));
}

export function SignerListPage() {
  const api = useDirectoryApi();
  const [params, setParams] = useSearchParams();
  const agencyId = params.get('agencyId') ?? '';
  const [agencies] = useAgencies();
  const agencyItems = agencies.status === 'ready' ? agencies.value.items : [];
  const agencyName = (id: string) => agencyItems.find((agency) => agency.id === id)?.displayName;
  return (
    <DirectoryList<Signer>
      title="Signers"
      noun="signers"
      intro="People acting in an agency's capacity. A signer record is not a login and grants nothing on its own."
      searchLabel="Search by name or title"
      newLabel="New signer"
      newTo={agencyId ? `/directory/signers/new?agencyId=${agencyId}` : '/directory/signers/new'}
      filterKey={agencyId}
      filters={
        <div className="list-filter">
          <SelectField
            id="signer-filter-agency"
            label="Agency"
            value={agencyId}
            placeholder="All agencies"
            options={agencyItems.map((agency) => ({ value: agency.id, label: agency.displayName }))}
            onChange={(value) => {
              const next = new URLSearchParams(params);
              if (value === '') next.delete('agencyId');
              else next.set('agencyId', value);
              setParams(next);
            }}
          />
        </div>
      }
      load={(query) => api.signers.list({ ...query, ...(agencyId ? { agencyId } : {}) })}
      emptyText={
        <p>
          No signers recorded
          {agencyId ? ' for this agency' : ''}.{' '}
          <Link
            to={agencyId ? `/directory/signers/new?agencyId=${agencyId}` : '/directory/signers/new'}
          >
            Record a signer
          </Link>
          .
        </p>
      }
      columns={[
        {
          header: 'Full legal name',
          cell: (signer) => (
            <Link to={`/directory/signers/${signer.id}`}>{signer.fullLegalName}</Link>
          ),
        },
        { header: 'Title', cell: (signer) => signer.title ?? <Absent /> },
        {
          header: 'Agency',
          cell: (signer) => (
            <Link to={`/directory/agencies/${signer.agencyId}`}>
              {agencyName(signer.agencyId) ?? 'Agency'}
            </Link>
          ),
        },
        {
          header: 'Operational state',
          cell: (signer) => (
            <>
              <StateStamp
                label={SIGNER_STATE_LABEL[signer.operationalState]}
                tone={SIGNER_STATE_TONE[signer.operationalState]}
              />
              {signer.archivedAt !== null && <span className="hint"> Archived</span>}
            </>
          ),
        },
        { header: 'Updated', cell: (signer) => <Time iso={signer.updatedAt} /> },
      ]}
    />
  );
}

export function SignerDetailPage() {
  const { id = '' } = useParams();
  return <SignerDetail key={id} id={id} />;
}

function SignerDetail({ id }: { id: string }) {
  const api = useDirectoryApi();
  const navigate = useNavigate();
  const page = useRecordPage(`signer:${id}`, () => api.signers.get(id));
  const agencyId = page.state.status === 'ready' ? page.state.value.data.agencyId : null;
  const [agency] = useLoad(`signer-agency:${agencyId ?? ''}`, () =>
    agencyId === null ? Promise.resolve(null) : api.agencies.get(agencyId),
  );
  const trail = [
    ['Directory', '/directory'],
    ['Signers', '/directory/signers'],
  ] as const;
  if (page.state.status === 'loading') return <LoadingNotice label="Loading signer…" />;
  if (page.state.status === 'error') {
    return (
      <>
        <Breadcrumbs trail={[...trail, ['Signer', null]]} />
        <ErrorNotice error={page.state.error} recordLabel="signer" onRetry={page.reload} />
      </>
    );
  }
  const record = page.state.value;
  const signer = record.data;
  const agencyRecord =
    agency.status === 'ready' && agency.value !== null ? agency.value.data : null;
  return (
    <article className="sheet" data-testid="signer-detail">
      <Breadcrumbs trail={[...trail, [signer.fullLegalName, null]]} />
      <RecordHeader
        name={signer.fullLegalName}
        stamp={
          <StateStamp
            label={SIGNER_STATE_LABEL[signer.operationalState]}
            tone={SIGNER_STATE_TONE[signer.operationalState]}
          />
        }
        facts={[
          `Version ${signer.rowVersion}`,
          signer.archivedAt === null ? 'Not archived' : 'Archived',
          signer.canonicalCode === null
            ? 'No canonical code (local only)'
            : `Canonical code ${signer.canonicalCode}`,
        ]}
        boundary={BOUNDARY}
      />
      {page.conflict && <ConflictNotice recordLabel="signer" onReload={page.reload} />}
      <StatusNotice message={page.message} />
      <SignerActions
        record={record}
        api={api.signers}
        onChanged={page.update}
        onConflict={page.raiseConflict}
        onDeleted={() =>
          void navigate('/directory/signers', {
            state: {
              flash: `Draft signer “${signer.fullLegalName}” deleted.`,
            } satisfies FlashState,
          })
        }
        edit={
          <Link className="button" to={`/directory/signers/${signer.id}/edit`}>
            Edit
          </Link>
        }
      />
      {signer.archivedAt !== null && (
        <p className="notice notice-quiet">
          Archived <Time iso={signer.archivedAt} />. Reason: {signer.archiveReason}
        </p>
      )}
      <div className="sheet-columns">
        <Section title="Capacity">
          <Details
            rows={[
              [
                'Agency',
                <Link key="agency" to={`/directory/agencies/${signer.agencyId}`}>
                  {agencyRecord?.displayName ?? 'Agency'}
                </Link>,
              ],
              ['Title or capacity', signer.title],
              ['Contact email', signer.contactEmail],
            ]}
          />
        </Section>
        <Section title="Sources">
          <Details
            rows={[
              [
                'Identity source',
                signer.identitySourceId && <code>{signer.identitySourceId}</code>,
              ],
              [
                'Delegation source',
                signer.delegationSourceId && <code>{signer.delegationSourceId}</code>,
              ],
            ]}
          />
          <p className="hint">{SOURCES_UNAVAILABLE}</p>
        </Section>
      </div>
      <Section title="Notes">
        {signer.notes ? <p className="prose">{signer.notes}</p> : <Absent />}
      </Section>
      <RecordFacts record={signer} />
    </article>
  );
}

export function NewSignerPage() {
  return <SignerForm record={null} />;
}

export function EditSignerPage() {
  const { id = '' } = useParams();
  const api = useDirectoryApi();
  const [state, reload] = useLoad(`signer-edit:${id}`, () => api.signers.get(id));
  if (state.status === 'loading') return <LoadingNotice label="Loading signer…" />;
  if (state.status === 'error') {
    return <ErrorNotice error={state.error} recordLabel="signer" onRetry={reload} />;
  }
  return <SignerForm key={state.value.etag} record={state.value} onReload={reload} />;
}

function SignerForm({
  record,
  onReload,
}: {
  record: Versioned<Signer> | null;
  onReload?: () => void;
}) {
  const api = useDirectoryApi();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initial = record?.data ?? null;
  const [agencies, reloadAgencies] = useAgencies();
  const [agencyId, setAgencyId] = useState(initial?.agencyId ?? params.get('agencyId') ?? '');
  const [values, setValues] = useState(() => initialTexts(TEXTS, initial));
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [nothingToSave, setNothingToSave] = useState(false);
  const submission = useSubmission();
  const issues = issuesOf(submission.error);
  const errorFor = (path: string) =>
    clientErrors[path] ?? issues.find((issue) => issue.path === path)?.message;
  const agencyItems: Agency[] = agencies.status === 'ready' ? agencies.value.items : [];

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNothingToSave(false);
    const problems: Record<string, string> = {};
    if (initial === null && agencyId === '') problems['agencyId'] = 'Choose the agency.';
    if (values.fullLegalName.trim() === '')
      problems['fullLegalName'] = 'Enter the full legal name.';
    setClientErrors(problems);
    const firstProblem = Object.keys(problems)[0];
    if (firstProblem !== undefined) {
      document.getElementById(`signer-${firstProblem}`)?.focus();
      return;
    }
    if (initial === null) {
      const body: CreateSigner = {
        ...createTexts(TEXTS, values),
        agencyId,
        fullLegalName: values.fullLegalName.trim(),
      };
      const outcome = await submission.submit(body, (auth) => api.signers.create(body, auth));
      if (outcome.ok) {
        void navigate(`/directory/signers/${outcome.value.data.id}`, {
          state: { flash: 'Signer recorded as a draft.' } satisfies FlashState,
        });
      }
      return;
    }
    const body = patchTexts(TEXTS, values, initial);
    if (Object.keys(body).length === 0) {
      setNothingToSave(true);
      return;
    }
    const outcome = await submission.submit({ id: initial.id, body }, (auth) =>
      api.signers.patch(initial.id, body as PatchSigner, record?.etag ?? '', auth),
    );
    if (outcome.ok) {
      void navigate(`/directory/signers/${initial.id}`, {
        state: { flash: 'Changes saved.' } satisfies FlashState,
      });
    }
  }

  const field = (spec: TextSpec<TextKey>) => (
    <TextField
      key={spec.name}
      id={`signer-${spec.name}`}
      label={spec.label}
      type={spec.type ?? 'text'}
      multiline={spec.multiline ?? false}
      hint={spec.hint}
      required={spec.name === 'fullLegalName'}
      value={values[spec.name]}
      error={errorFor(spec.name)}
      onChange={(value) => {
        setValues((current) => ({ ...current, [spec.name]: value }));
        setNothingToSave(false);
      }}
    />
  );
  const agencyLabel = agencyItems.find(
    (agency) => agency.id === (initial?.agencyId ?? ''),
  )?.displayName;

  return (
    <article className="sheet">
      <Breadcrumbs
        trail={[
          ['Directory', '/directory'],
          ['Signers', '/directory/signers'],
          ...(initial === null
            ? []
            : ([[initial.fullLegalName, `/directory/signers/${initial.id}`]] as const)),
          [initial === null ? 'New signer' : 'Edit', null],
        ]}
      />
      <h1>{initial === null ? 'New signer' : `Edit ${initial.fullLegalName}`}</h1>
      <p className="page-intro">{BOUNDARY}</p>
      {submission.conflict && onReload && (
        <ConflictNotice recordLabel="signer" onReload={onReload} />
      )}
      <ValidationSummary
        issues={issues}
        label={labelOf}
        fieldId={(path) => fieldIdFor('signer', path)}
      />
      {submission.error !== null && issues.length === 0 && (
        <ErrorNotice error={submission.error} recordLabel="signer" focusOnShow />
      )}
      {nothingToSave && (
        <p role="status" className="notice notice-quiet">
          Nothing to save: no field was changed.
        </p>
      )}
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="record-form">
        <fieldset className="fieldset">
          <legend>Agency</legend>
          {initial === null ? (
            <>
              {agencies.status === 'error' && (
                <ErrorNotice error={agencies.error} onRetry={reloadAgencies} />
              )}
              <SelectField
                id="signer-agencyId"
                label="Agency"
                required
                hint="Fixed once saved: a person acting for another agency needs a separate signer record."
                value={agencyId}
                placeholder={
                  agencies.status === 'loading' ? 'Loading agencies…' : 'Choose an agency'
                }
                error={errorFor('agencyId')}
                options={agencyItems.map((agency) => ({
                  value: agency.id,
                  label: `${agency.displayName} (${RECORD_STATE_LABEL[agency.recordState].toLowerCase()})`,
                  disabled: agency.recordState === 'ARCHIVED',
                }))}
                onChange={setAgencyId}
              />
            </>
          ) : (
            <p className="field-static">
              <span className="field-static-label">Agency</span>{' '}
              <Link to={`/directory/agencies/${initial.agencyId}`}>{agencyLabel ?? 'Agency'}</Link>
              <span className="hint">
                {' '}
                Fixed: a person acting for another agency needs a separate signer record.
              </span>
            </p>
          )}
        </fieldset>
        <fieldset className="fieldset">
          <legend>Person</legend>
          <div className="field-grid">
            {TEXTS.filter((spec) => spec.name !== 'notes').map(field)}
          </div>
          <p className="hint">{SOURCES_UNAVAILABLE}</p>
        </fieldset>
        {field(TEXTS[3] as TextSpec<TextKey>)}
        <div className="form-actions">
          <button type="submit" className="button-primary" disabled={submission.pending}>
            {submission.pending
              ? 'Saving…'
              : initial === null
                ? 'Record draft signer'
                : 'Save changes'}
          </button>
          <Link
            className="button button-quiet"
            to={initial === null ? '/directory/signers' : `/directory/signers/${initial.id}`}
          >
            Cancel
          </Link>
        </div>
      </form>
    </article>
  );
}
