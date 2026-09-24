// Agency pages. An Agency is the representing organization; this directory record is
// administrative: creating or activating it creates no authority and makes nothing ready.
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { Agency, CreateAgency, PatchAgency } from '@tb/contracts';
import type { Versioned } from '../api/directory.js';
import {
  addressText,
  addressValue,
  attributionRows,
  attributionsValue,
  AttributionsField,
  createTexts,
  fieldIdFor,
  initialTexts,
  patchTexts,
  PostalAddressFields,
  sameJson,
  text,
  TextField,
  type AddressText,
  type AttributionRow,
  type TextSpec as FieldTextSpec,
} from './fields.js';
import {
  BINDING_STATE_LABEL,
  formatDateTime,
  issuesOf,
  PROVENANCE_LABEL,
  RECORD_STATE_LABEL,
  RECORD_STATE_TONE,
  SIGNER_STATE_LABEL,
  SIGNER_STATE_TONE,
} from './format.js';
import { CanonicalBindingSection } from './canonical-binding.js';
import { isEstablishedRefusal, useDirectoryApi, useLoad } from './hooks.js';
import { DirectoryList } from './list.js';
import { RecordStateActions } from './record-actions.js';
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

type TextKey =
  | 'displayName'
  | 'legalName'
  | 'organizationType'
  | 'jurisdictionCountry'
  | 'registrationAuthority'
  | 'registrationNumber'
  | 'copyrightEmail'
  | 'verificationEmail'
  | 'phone'
  | 'websiteUrl'
  | 'driveRootUrl'
  | 'masterUrl'
  | 'startHereUrl'
  | 'notes';

type TextSpec = FieldTextSpec<TextKey>;

const IDENTITY: readonly TextSpec[] = [
  { name: 'legalName', label: 'Legal name' },
  {
    name: 'organizationType',
    label: 'Organization type',
    hint: 'For example: limited liability company.',
  },
  { name: 'jurisdictionCountry', label: 'Jurisdiction', hint: 'Two-letter country code, e.g. VN.' },
  { name: 'registrationAuthority', label: 'Registration authority' },
  { name: 'registrationNumber', label: 'Registration number' },
];
const CONTACT: readonly TextSpec[] = [
  { name: 'copyrightEmail', label: 'Copyright contact email', type: 'email' },
  { name: 'verificationEmail', label: 'Verification email', type: 'email' },
  { name: 'phone', label: 'Phone', type: 'tel' },
];
const LINKS: readonly TextSpec[] = [
  { name: 'websiteUrl', label: 'Website', type: 'url' },
  { name: 'driveRootUrl', label: 'Drive root folder', type: 'url' },
  { name: 'masterUrl', label: 'Master record', type: 'url' },
  { name: 'startHereUrl', label: 'Start-here document', type: 'url' },
];
const ALL_TEXT: readonly TextSpec[] = [
  { name: 'displayName', label: 'Display name' },
  ...IDENTITY,
  ...CONTACT,
  ...LINKS,
  { name: 'notes', label: 'Notes', multiline: true },
];
const IDENTITY_KEYS = new Set<string>(IDENTITY.map((spec) => spec.name));
/** The one notice every locked identity field of the form points to. */
const IDENTITY_LOCK_ID = 'agency-identity-locked';

/** Fields that attributions may describe (the contract's attributable Agency data). */
const ATTRIBUTABLE = [
  { name: 'displayName', label: 'Display name' },
  ...IDENTITY.map(({ name, label }) => ({ name, label })),
  ...CONTACT.map(({ name, label }) => ({ name, label })),
  { name: 'postalAddress', label: 'Postal address' },
  ...LINKS.map(({ name, label }) => ({ name, label })),
];

const labelOf = (path: string): string => {
  const [head, index] = path.split('.');
  if (head === 'postalAddress') return `Postal address${index ? ` (${index})` : ''}`;
  if (head === 'fieldAttributions') return `Attribution ${Number(index ?? 0) + 1}`;
  return ALL_TEXT.find((spec) => spec.name === head)?.label ?? head ?? 'Request';
};

const BOUNDARY = 'Directory record only: it grants no authority and makes nothing ready to send.';

export function AgencyListPage() {
  const api = useDirectoryApi();
  return (
    <DirectoryList<Agency>
      title="Agencies"
      noun="agencies"
      intro="Organizations that represent owners. A record here is administrative; it is not authority."
      searchLabel="Search by display or legal name"
      newLabel="New agency"
      newTo="/directory/agencies/new"
      load={(query) => api.agencies.list(query)}
      emptyText={
        <p>
          No agencies yet. <Link to="/directory/agencies/new">Create the first agency record</Link>.
        </p>
      }
      columns={[
        {
          header: 'Display name',
          cell: (agency) => (
            <Link to={`/directory/agencies/${agency.id}`}>{agency.displayName}</Link>
          ),
        },
        { header: 'Legal name', cell: (agency) => agency.legalName ?? <Absent /> },
        {
          header: 'State',
          cell: (agency) => (
            <StateStamp
              label={RECORD_STATE_LABEL[agency.recordState]}
              tone={RECORD_STATE_TONE[agency.recordState]}
            />
          ),
        },
        {
          header: 'Canonical code',
          cell: (agency) => agency.canonicalCode ?? BINDING_STATE_LABEL[agency.bindingState],
        },
        { header: 'Updated', cell: (agency) => <Time iso={agency.updatedAt} /> },
      ]}
    />
  );
}

export function Absent() {
  return <span className="absent">Not recorded</span>;
}

export function Time({ iso }: { iso: string | null }) {
  if (iso === null) return <Absent />;
  return (
    <time dateTime={iso} title={iso}>
      {formatDateTime(iso)}
    </time>
  );
}

export function AgencyDetailPage() {
  const { id = '' } = useParams();
  return <AgencyDetail key={id} id={id} />;
}

function AgencyDetail({ id }: { id: string }) {
  const api = useDirectoryApi();
  const navigate = useNavigate();
  const page = useRecordPage(`agency:${id}`, () => api.agencies.get(id));
  const [signerCount, setSignerCount] = useState(0);
  const trail = [
    ['Directory', '/directory'],
    ['Agencies', '/directory/agencies'],
  ] as const;

  if (page.state.status === 'loading') return <LoadingNotice label="Loading agency…" />;
  if (page.state.status === 'error') {
    return (
      <>
        <Breadcrumbs trail={[...trail, ['Agency', null]]} />
        <ErrorNotice error={page.state.error} recordLabel="agency" onRetry={page.reload} />
      </>
    );
  }
  const record = page.state.value;
  const agency = record.data;
  return (
    <article className="sheet" data-testid="agency-detail">
      <Breadcrumbs trail={[...trail, [agency.displayName, null]]} />
      <RecordHeader
        name={agency.displayName}
        stamp={
          <StateStamp
            label={RECORD_STATE_LABEL[agency.recordState]}
            tone={RECORD_STATE_TONE[agency.recordState]}
          />
        }
        facts={[
          `Version ${agency.rowVersion}`,
          agency.canonicalCode === null
            ? 'No canonical code (local only)'
            : `Canonical code ${agency.canonicalCode}`,
        ]}
        boundary={BOUNDARY}
      />
      {page.conflict && <ConflictNotice recordLabel="agency" onReload={page.reload} />}
      <StatusNotice message={page.message} />
      <RecordStateActions
        noun="agency"
        record={record}
        api={api.agencies}
        onChanged={page.update}
        onConflict={page.raiseConflict}
        deleteBlocker={
          signerCount > 0
            ? 'Signers belong to this agency, so it is not an unused draft. Archive it instead.'
            : null
        }
        onDeleted={() =>
          void navigate('/directory/agencies', {
            state: { flash: `Draft agency “${agency.displayName}” deleted.` } satisfies FlashState,
          })
        }
        edit={
          <Link className="button" to={`/directory/agencies/${agency.id}/edit`}>
            Edit
          </Link>
        }
      />
      {agency.archivedAt !== null && (
        <p className="notice notice-quiet">
          Archived <Time iso={agency.archivedAt} />. Reason: {agency.archiveReason}
        </p>
      )}
      <div className="sheet-columns">
        <Section title="Identity">
          <Details rows={IDENTITY.map((spec) => [spec.label, agency[spec.name]] as const)} />
        </Section>
        <Section title="Contact">
          <Details
            rows={[
              ...CONTACT.map((spec) => [spec.label, agency[spec.name]] as const),
              ['Postal address', formatAddress(agency.postalAddress)],
            ]}
          />
        </Section>
      </div>
      <Section title="Links">
        <Details
          rows={LINKS.map(
            (spec) =>
              [
                spec.label,
                agency[spec.name] === null ? null : (
                  <a
                    href={agency[spec.name] ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {agency[spec.name]}
                  </a>
                ),
              ] as const,
          )}
        />
      </Section>
      <CanonicalBindingSection
        noun="agency"
        record={record}
        archived={agency.recordState === 'ARCHIVED'}
        target={{ kind: 'Agency', agencyId: agency.id }}
        bind={(body, ifMatch, auth) => api.agencies.bindCanonical(agency.id, body, ifMatch, auth)}
        onBound={page.update}
        onConflict={page.raiseConflict}
      />
      <AttributionsTable attributions={agency.fieldAttributions} labels={ATTRIBUTABLE} />
      <Section title="Notes">
        {agency.notes ? <p className="prose">{agency.notes}</p> : <Absent />}
      </Section>
      <AgencySigners agency={agency} onCount={setSignerCount} />
      <RecordFacts record={agency} />
    </article>
  );
}

export function formatAddress(address: Agency['postalAddress']): string | null {
  if (address === null) return null;
  const parts = [
    address.line1,
    address.line2,
    address.city,
    address.region,
    address.postalCode,
    address.country,
  ].filter((part) => part !== undefined && part !== '');
  return parts.length === 0 ? null : parts.join(', ');
}

export function AttributionsTable({
  attributions,
  labels,
}: {
  attributions: Agency['fieldAttributions'];
  labels: ReadonlyArray<{ name: string; label: string }>;
}) {
  return (
    <Section title="Field attributions">
      {attributions === null || attributions.length === 0 ? (
        <p className="absent">No attributions recorded.</p>
      ) : (
        <div className="table-frame">
          <table className="records">
            <thead>
              <tr>
                <th scope="col">Field</th>
                <th scope="col">Provenance</th>
                <th scope="col">Scope</th>
                <th scope="col">Sources</th>
              </tr>
            </thead>
            <tbody>
              {attributions.map((attribution, index) => (
                <tr key={index}>
                  <th scope="row">
                    {labels.find((item) => item.name === attribution.field)?.label ??
                      attribution.field}
                  </th>
                  <td>
                    <span
                      className={`provenance provenance-${attribution.provenance.toLowerCase()}`}
                    >
                      {PROVENANCE_LABEL[attribution.provenance]}
                    </span>
                  </td>
                  <td>
                    {attribution.scopeText}
                    {attribution.limitations ? (
                      <span className="hint"> Limitations: {attribution.limitations}</span>
                    ) : null}
                  </td>
                  <td>
                    {attribution.sourceIds.length === 0 ? 'None' : attribution.sourceIds.join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

export function RecordFacts({
  record,
}: {
  record: {
    readonly id: string;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly rowVersion: number;
    readonly bindingState: keyof typeof BINDING_STATE_LABEL;
  };
}) {
  return (
    <Section title="Record">
      <Details
        rows={[
          ['Record id', <code key="id">{record.id}</code>],
          ['Binding', BINDING_STATE_LABEL[record.bindingState]],
          ['Created', <Time key="created" iso={record.createdAt} />],
          ['Last changed', <Time key="updated" iso={record.updatedAt} />],
          ['Version', String(record.rowVersion)],
        ]}
      />
    </Section>
  );
}

function AgencySigners({ agency, onCount }: { agency: Agency; onCount: (count: number) => void }) {
  const api = useDirectoryApi();
  const [state, reload] = useLoad(`agency-signers:${agency.id}`, () =>
    api.signers.list({ agencyId: agency.id, limit: 100 }),
  );
  useEffect(() => {
    if (state.status === 'ready') onCount(state.value.items.length);
  }, [state, onCount]);
  return (
    <Section
      title="Signers in this agency"
      actions={
        agency.recordState !== 'ARCHIVED' ? (
          <Link className="button" to={`/directory/signers/new?agencyId=${agency.id}`}>
            Add signer
          </Link>
        ) : undefined
      }
    >
      <p className="hint">
        A signer record describes a person acting for this agency. It is not a login and signs
        nothing.
      </p>
      {state.status === 'loading' && <LoadingNotice label="Loading signers…" />}
      {state.status === 'error' && <ErrorNotice error={state.error} onRetry={reload} />}
      {state.status === 'ready' &&
        (state.value.items.length === 0 ? (
          <p className="absent">No signers recorded for this agency.</p>
        ) : (
          <ul className="plain-list">
            {state.value.items.map((signer) => (
              <li key={signer.id}>
                <Link to={`/directory/signers/${signer.id}`}>{signer.fullLegalName}</Link>
                {signer.title ? `, ${signer.title}` : ''}{' '}
                <StateStamp
                  label={SIGNER_STATE_LABEL[signer.operationalState]}
                  tone={SIGNER_STATE_TONE[signer.operationalState]}
                />
                {signer.archivedAt !== null && <span className="hint"> (archived)</span>}
              </li>
            ))}
          </ul>
        ))}
    </Section>
  );
}

export function NewAgencyPage() {
  return <AgencyForm record={null} />;
}

export function EditAgencyPage() {
  const { id = '' } = useParams();
  const api = useDirectoryApi();
  const [state, reload] = useLoad(`agency-edit:${id}`, () => api.agencies.get(id));
  if (state.status === 'loading') return <LoadingNotice label="Loading agency…" />;
  if (state.status === 'error') {
    return <ErrorNotice error={state.error} recordLabel="agency" onRetry={reload} />;
  }
  // A new ETag (after "Load latest version") starts the form again from the server's values.
  return <AgencyForm key={state.value.etag} record={state.value} onReload={reload} />;
}

function AgencyForm({
  record,
  onReload,
}: {
  record: Versioned<Agency> | null;
  onReload?: () => void;
}) {
  const api = useDirectoryApi();
  const navigate = useNavigate();
  const initial = record?.data ?? null;
  const [values, setValues] = useState<Record<TextKey, string>>(() =>
    initialTexts(ALL_TEXT, initial),
  );
  const [address, setAddress] = useState<AddressText>(() => addressText(initial?.postalAddress));
  const [attributions, setAttributions] = useState<AttributionRow[]>(() =>
    attributionRows(initial?.fieldAttributions),
  );
  const [nothingToSave, setNothingToSave] = useState(false);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [establishedByServer, setEstablishedByServer] = useState(false);
  const submission = useSubmission();
  const issues = issuesOf(submission.error);
  const errorFor = (path: string) =>
    clientErrors[path] ?? issues.find((issue) => issue.path === path)?.message;

  // Every identity field of an established agency is locked, empty ones included. The page can
  // see "active" and "canonically bound"; a reference from another record is only learned from
  // the server's refusal.
  const established =
    establishedByServer ||
    (initial !== null &&
      (initial.recordState === 'ACTIVE' ||
        initial.canonicalCode !== null ||
        initial.bindingState !== 'LOCAL_ONLY'));
  const isLocked = (name: TextKey): boolean =>
    initial !== null && established && IDENTITY_KEYS.has(name);

  function setValue(name: TextKey, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
    setNothingToSave(false);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNothingToSave(false);
    if (values.displayName.trim() === '') {
      setClientErrors({ displayName: 'Enter a display name.' });
      document.getElementById('agency-displayName')?.focus();
      return;
    }
    setClientErrors({});
    const attributionList = attributionsValue(attributions);
    if (initial === null) {
      const body: CreateAgency = {
        ...createTexts(ALL_TEXT, values),
        displayName: values.displayName.trim(),
        ...(addressValue(address) === null ? {} : { postalAddress: addressValue(address) }),
        ...(attributionList.length === 0 ? {} : { fieldAttributions: attributionList }),
      };
      const outcome = await submission.submit(body, (auth) => api.agencies.create(body, auth));
      if (outcome.ok) {
        void navigate(`/directory/agencies/${outcome.value.data.id}`, {
          state: { flash: 'Agency created as a draft.' } satisfies FlashState,
        });
      }
      return;
    }
    const body: Record<string, unknown> = {
      ...patchTexts(ALL_TEXT, values, initial, isLocked),
    };
    const nextAddress = addressValue(address);
    if (!sameJson(nextAddress, addressValue(addressText(initial.postalAddress)))) {
      body['postalAddress'] = nextAddress;
    }
    if (!sameJson(attributionList, attributionsValue(attributionRows(initial.fieldAttributions)))) {
      body['fieldAttributions'] = attributionList.length === 0 ? null : attributionList;
    }
    if (Object.keys(body).length === 0) {
      setNothingToSave(true);
      return;
    }
    const outcome = await submission.submit({ id: initial.id, body }, (auth) =>
      api.agencies.patch(initial.id, body as PatchAgency, record?.etag ?? '', auth),
    );
    if (outcome.ok) {
      void navigate(`/directory/agencies/${initial.id}`, {
        state: { flash: 'Changes saved.' } satisfies FlashState,
      });
      return;
    }
    // The server found the agency established: lock every identity field and restore its value.
    if (isEstablishedRefusal(outcome.error)) {
      setEstablishedByServer(true);
      setValues((current) => ({
        ...current,
        ...Object.fromEntries(IDENTITY.map(({ name }) => [name, text(initial[name])])),
      }));
    }
  }

  const title = initial === null ? 'New agency' : `Edit ${initial.displayName}`;
  const field = (spec: TextSpec) => (
    <TextField
      key={spec.name}
      id={`agency-${spec.name}`}
      label={spec.label}
      type={spec.type ?? 'text'}
      multiline={spec.multiline ?? false}
      hint={spec.hint}
      value={values[spec.name]}
      error={errorFor(spec.name)}
      lockedBy={isLocked(spec.name) ? IDENTITY_LOCK_ID : null}
      onChange={(value) => setValue(spec.name, value)}
    />
  );

  return (
    <article className="sheet">
      <Breadcrumbs
        trail={[
          ['Directory', '/directory'],
          ['Agencies', '/directory/agencies'],
          ...(initial === null
            ? []
            : ([[initial.displayName, `/directory/agencies/${initial.id}`]] as const)),
          [initial === null ? 'New agency' : 'Edit', null],
        ]}
      />
      <h1>{title}</h1>
      <p className="page-intro">
        {initial === null
          ? 'Only a display name is required. New agencies start as drafts; add legal and contact details when they are known.'
          : 'Only changed fields are sent. Clearing a field removes its value.'}
      </p>
      {submission.conflict && onReload && (
        <ConflictNotice recordLabel="agency" onReload={onReload} />
      )}
      <ValidationSummary
        issues={issues}
        label={labelOf}
        fieldId={(path) => fieldIdFor('agency', path)}
      />
      {submission.error !== null && issues.length === 0 && (
        <ErrorNotice error={submission.error} recordLabel="agency" focusOnShow />
      )}
      {nothingToSave && (
        <p role="status" className="notice notice-quiet">
          Nothing to save: no field was changed.
        </p>
      )}
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="record-form">
        <fieldset className="fieldset">
          <legend>Name</legend>
          <TextField
            id="agency-displayName"
            label="Display name"
            required
            hint="The name used in this directory."
            value={values.displayName}
            error={errorFor('displayName')}
            onChange={(value) => setValue('displayName', value)}
          />
        </fieldset>
        <fieldset className="fieldset">
          <legend>Legal identity</legend>
          <p className="hint">
            The legal entity this record stands for. Once the agency is established, these fields
            can’t be filled in, changed or cleared here; a different legal entity needs its own
            agency record.
          </p>
          {initial !== null && established && (
            <p id={IDENTITY_LOCK_ID} className="lock-notice">
              Locked: this agency is established (active, canonically bound or referenced by another
              record). Its legal identity can’t be filled in, changed or cleared here.
            </p>
          )}
          <div className="field-grid">{IDENTITY.map(field)}</div>
        </fieldset>
        <fieldset className="fieldset">
          <legend>Contact</legend>
          <div className="field-grid">{CONTACT.map(field)}</div>
        </fieldset>
        <PostalAddressFields
          idPrefix="agency-postalAddress"
          value={address}
          errorFor={errorFor}
          onChange={(next) => {
            setAddress(next);
            setNothingToSave(false);
          }}
        />
        <fieldset className="fieldset">
          <legend>Links</legend>
          <div className="field-grid">{LINKS.map(field)}</div>
        </fieldset>
        <AttributionsField
          idPrefix="agency"
          fields={ATTRIBUTABLE}
          rows={attributions}
          errorFor={errorFor}
          onChange={(rows) => {
            setAttributions(rows);
            setNothingToSave(false);
          }}
        />
        {field({ name: 'notes', label: 'Notes', multiline: true })}
        <div className="form-actions">
          <button type="submit" className="button-primary" disabled={submission.pending}>
            {submission.pending
              ? 'Saving…'
              : initial === null
                ? 'Create draft agency'
                : 'Save changes'}
          </button>
          <Link
            className="button button-quiet"
            to={initial === null ? '/directory/agencies' : `/directory/agencies/${initial.id}`}
          >
            Cancel
          </Link>
        </div>
      </form>
    </article>
  );
}
