// LegalSubject pages: the exact individual, legal entity or other party. The subject type is set
// once at creation and never converted; once the subject is established (active, canonically bound
// or referenced), its identity fields can't be filled in, changed or cleared here.
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { CreateLegalSubject, LegalSubject, PatchLegalSubject } from '@tb/contracts';
import type { Versioned } from '../api/directory.js';
import { CanonicalBindingSection } from './canonical-binding.js';
import { Absent, AttributionsTable, formatAddress, RecordFacts, Time } from './agencies.js';
import {
  addressText,
  addressValue,
  attributionRows,
  attributionsValue,
  AttributionsField,
  createTexts,
  fieldIdFor,
  initialTexts,
  linesOf,
  LinesField,
  patchTexts,
  PostalAddressFields,
  sameJson,
  SelectField,
  text,
  TextField,
  type AddressText,
  type AttributionRow,
  type TextSpec,
} from './fields.js';
import {
  issuesOf,
  RECORD_STATE_LABEL,
  RECORD_STATE_TONE,
  REVIEW_STATE_LABEL,
  SUBJECT_TYPE_LABEL,
} from './format.js';
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

type SubjectType = LegalSubject['subjectType'];
type TextKey =
  | 'legalName'
  | 'legalForm'
  | 'jurisdictionCountry'
  | 'registrationAuthority'
  | 'registrationNumber'
  | 'contactEmail'
  | 'notes';

const IDENTITY: readonly TextSpec<TextKey>[] = [
  { name: 'legalForm', label: 'Legal form', hint: 'For example: joint stock company.' },
  { name: 'jurisdictionCountry', label: 'Jurisdiction', hint: 'Two-letter country code, e.g. VN.' },
  { name: 'registrationAuthority', label: 'Registration authority' },
  { name: 'registrationNumber', label: 'Registration number' },
];
const TEXTS: readonly TextSpec<TextKey>[] = [
  { name: 'legalName', label: 'Legal name', hint: 'Exactly as in the identifying document.' },
  ...IDENTITY,
  { name: 'contactEmail', label: 'Contact email', type: 'email' },
  { name: 'notes', label: 'Notes', multiline: true },
];
const IDENTITY_KEYS = new Set<string>(['legalName', ...IDENTITY.map((spec) => spec.name)]);
/** The one notice every locked identity field of the form points to. */
const IDENTITY_LOCK_ID = 'subject-identity-locked';

const ATTRIBUTABLE = [
  { name: 'subjectType', label: 'Subject type' },
  { name: 'legalName', label: 'Legal name' },
  { name: 'aliases', label: 'Aliases' },
  ...IDENTITY.map(({ name, label }) => ({ name, label })),
  { name: 'contactEmail', label: 'Contact email' },
  { name: 'postalAddress', label: 'Postal address' },
];

const labelOf = (path: string): string => {
  const [head, index] = path.split('.');
  if (head === 'subjectType') return 'Subject type';
  if (head === 'aliases') return 'Aliases';
  if (head === 'postalAddress') return `Postal address${index ? ` (${index})` : ''}`;
  if (head === 'fieldAttributions') return `Attribution ${Number(index ?? 0) + 1}`;
  return TEXTS.find((spec) => spec.name === head)?.label ?? head ?? 'Request';
};

const BOUNDARY =
  'The exact party. Names and registration numbers are matching hints, never automatic merges.';

export function LegalSubjectListPage() {
  const api = useDirectoryApi();
  return (
    <DirectoryList<LegalSubject>
      title="Legal subjects"
      noun="legal subjects"
      intro="Exact individuals and legal entities. A subject is never inferred from an owner or brand name."
      searchLabel="Search by legal name, alias or registration number"
      newLabel="New legal subject"
      newTo="/directory/legal-subjects/new"
      load={(query) => api.legalSubjects.list(query)}
      emptyText={
        <p>
          No legal subjects yet.{' '}
          <Link to="/directory/legal-subjects/new">Create the first legal subject</Link>.
        </p>
      }
      columns={[
        {
          header: 'Legal name',
          cell: (subject) => (
            <Link to={`/directory/legal-subjects/${subject.id}`}>{subject.legalName}</Link>
          ),
        },
        { header: 'Type', cell: (subject) => SUBJECT_TYPE_LABEL[subject.subjectType] },
        { header: 'Jurisdiction', cell: (subject) => subject.jurisdictionCountry ?? <Absent /> },
        { header: 'Registration no.', cell: (subject) => subject.registrationNumber ?? <Absent /> },
        {
          header: 'State',
          cell: (subject) => (
            <StateStamp
              label={RECORD_STATE_LABEL[subject.recordState]}
              tone={RECORD_STATE_TONE[subject.recordState]}
            />
          ),
        },
        { header: 'Updated', cell: (subject) => <Time iso={subject.updatedAt} /> },
      ]}
    />
  );
}

export function LegalSubjectDetailPage() {
  const { id = '' } = useParams();
  return <LegalSubjectDetail key={id} id={id} />;
}

function LegalSubjectDetail({ id }: { id: string }) {
  const api = useDirectoryApi();
  const navigate = useNavigate();
  const page = useRecordPage(`legal-subject:${id}`, () => api.legalSubjects.get(id));
  const trail = [
    ['Directory', '/directory'],
    ['Legal subjects', '/directory/legal-subjects'],
  ] as const;
  if (page.state.status === 'loading') return <LoadingNotice label="Loading legal subject…" />;
  if (page.state.status === 'error') {
    return (
      <>
        <Breadcrumbs trail={[...trail, ['Legal subject', null]]} />
        <ErrorNotice error={page.state.error} recordLabel="legal subject" onRetry={page.reload} />
      </>
    );
  }
  const record = page.state.value;
  const subject = record.data;
  return (
    <article className="sheet" data-testid="legal-subject-detail">
      <Breadcrumbs trail={[...trail, [subject.legalName, null]]} />
      <RecordHeader
        name={subject.legalName}
        stamp={
          <StateStamp
            label={RECORD_STATE_LABEL[subject.recordState]}
            tone={RECORD_STATE_TONE[subject.recordState]}
          />
        }
        facts={[
          SUBJECT_TYPE_LABEL[subject.subjectType],
          `Version ${subject.rowVersion}`,
          `Identity review: ${REVIEW_STATE_LABEL[subject.identityReviewState]}`,
          subject.canonicalCode === null
            ? 'No canonical code (local only)'
            : `Canonical code ${subject.canonicalCode}`,
        ]}
        boundary={BOUNDARY}
      />
      {page.conflict && <ConflictNotice recordLabel="legal subject" onReload={page.reload} />}
      <StatusNotice message={page.message} />
      <RecordStateActions
        noun="legal subject"
        record={record}
        api={api.legalSubjects}
        onChanged={page.update}
        onConflict={page.raiseConflict}
        onDeleted={() =>
          void navigate('/directory/legal-subjects', {
            state: {
              flash: `Draft legal subject “${subject.legalName}” deleted.`,
            } satisfies FlashState,
          })
        }
        edit={
          <Link className="button" to={`/directory/legal-subjects/${subject.id}/edit`}>
            Edit
          </Link>
        }
      />
      {subject.archivedAt !== null && (
        <p className="notice notice-quiet">
          Archived <Time iso={subject.archivedAt} />. Reason: {subject.archiveReason}
        </p>
      )}
      <div className="sheet-columns">
        <Section title="Identity">
          <Details
            rows={[
              ['Subject type', SUBJECT_TYPE_LABEL[subject.subjectType]],
              ['Legal name', subject.legalName],
              ...IDENTITY.map((spec) => [spec.label, subject[spec.name]] as const),
              [
                'Aliases',
                subject.aliases && subject.aliases.length > 0 ? subject.aliases.join('; ') : null,
              ],
            ]}
          />
        </Section>
        <Section title="Contact">
          <Details
            rows={[
              ['Contact email', subject.contactEmail],
              ['Postal address', formatAddress(subject.postalAddress)],
            ]}
          />
        </Section>
      </div>
      <CanonicalBindingSection
        noun="legal subject"
        record={record}
        archived={subject.recordState === 'ARCHIVED'}
        target={{ kind: 'LegalSubject', legalSubjectId: subject.id }}
        bind={(body, ifMatch, auth) =>
          api.legalSubjects.bindCanonical(subject.id, body, ifMatch, auth)
        }
        onBound={page.update}
        onConflict={page.raiseConflict}
      />
      <AttributionsTable attributions={subject.fieldAttributions} labels={ATTRIBUTABLE} />
      <Section title="Owners">
        <p className="hint">
          Links between owners and this subject are managed on each owner’s page. A link is a
          recorded relationship, not an appointment or authority.
        </p>
      </Section>
      <Section title="Notes">
        {subject.notes ? <p className="prose">{subject.notes}</p> : <Absent />}
      </Section>
      <RecordFacts record={subject} />
    </article>
  );
}

export function NewLegalSubjectPage() {
  return <LegalSubjectForm record={null} />;
}

export function EditLegalSubjectPage() {
  const { id = '' } = useParams();
  const api = useDirectoryApi();
  const [state, reload] = useLoad(`legal-subject-edit:${id}`, () => api.legalSubjects.get(id));
  if (state.status === 'loading') return <LoadingNotice label="Loading legal subject…" />;
  if (state.status === 'error') {
    return <ErrorNotice error={state.error} recordLabel="legal subject" onRetry={reload} />;
  }
  return <LegalSubjectForm key={state.value.etag} record={state.value} onReload={reload} />;
}

function LegalSubjectForm({
  record,
  onReload,
}: {
  record: Versioned<LegalSubject> | null;
  onReload?: () => void;
}) {
  const api = useDirectoryApi();
  const navigate = useNavigate();
  const initial = record?.data ?? null;
  const [subjectType, setSubjectType] = useState<SubjectType | ''>(initial?.subjectType ?? '');
  const [values, setValues] = useState(() => initialTexts(TEXTS, initial));
  const [aliases, setAliases] = useState(() => (initial?.aliases ?? []).join('\n'));
  const [address, setAddress] = useState<AddressText>(() => addressText(initial?.postalAddress));
  const [attributions, setAttributions] = useState<AttributionRow[]>(() =>
    attributionRows(initial?.fieldAttributions),
  );
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [establishedByServer, setEstablishedByServer] = useState(false);
  const [nothingToSave, setNothingToSave] = useState(false);
  const submission = useSubmission();
  const issues = issuesOf(submission.error);
  const errorFor = (path: string) =>
    clientErrors[path] ?? issues.find((issue) => issue.path === path)?.message;
  // Every identity field of an established subject is locked, empty ones included; a link or
  // other reference is only learned from the server's refusal.
  const established =
    establishedByServer ||
    (initial !== null &&
      (initial.recordState === 'ACTIVE' ||
        initial.canonicalCode !== null ||
        initial.bindingState !== 'LOCAL_ONLY'));
  const isLocked = (name: TextKey): boolean =>
    initial !== null && established && IDENTITY_KEYS.has(name);
  const changed = () => setNothingToSave(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNothingToSave(false);
    const problems: Record<string, string> = {};
    if (initial === null && subjectType === '')
      problems['subjectType'] = 'Choose the subject type.';
    if (values.legalName.trim() === '') problems['legalName'] = 'Enter the legal name.';
    setClientErrors(problems);
    const firstProblem = Object.keys(problems)[0];
    if (firstProblem !== undefined) {
      document.getElementById(`subject-${firstProblem}`)?.focus();
      return;
    }
    const aliasList = linesOf(aliases);
    const attributionList = attributionsValue(attributions);
    if (initial === null) {
      const body: CreateLegalSubject = {
        ...createTexts(TEXTS, values),
        subjectType: subjectType as SubjectType,
        legalName: values.legalName.trim(),
        ...(aliasList.length === 0 ? {} : { aliases: aliasList }),
        ...(addressValue(address) === null ? {} : { postalAddress: addressValue(address) }),
        ...(attributionList.length === 0 ? {} : { fieldAttributions: attributionList }),
      };
      const outcome = await submission.submit(body, (auth) => api.legalSubjects.create(body, auth));
      if (outcome.ok) {
        void navigate(`/directory/legal-subjects/${outcome.value.data.id}`, {
          state: { flash: 'Legal subject created as a draft.' } satisfies FlashState,
        });
      }
      return;
    }
    const body: Record<string, unknown> = {
      ...patchTexts(TEXTS, values, initial, isLocked),
    };
    if (!sameJson(aliasList, initial.aliases ?? []))
      body['aliases'] = aliasList.length === 0 ? null : aliasList;
    if (!sameJson(addressValue(address), addressValue(addressText(initial.postalAddress)))) {
      body['postalAddress'] = addressValue(address);
    }
    if (!sameJson(attributionList, attributionsValue(attributionRows(initial.fieldAttributions)))) {
      body['fieldAttributions'] = attributionList.length === 0 ? null : attributionList;
    }
    if (Object.keys(body).length === 0) {
      setNothingToSave(true);
      return;
    }
    const outcome = await submission.submit({ id: initial.id, body }, (auth) =>
      api.legalSubjects.patch(initial.id, body as PatchLegalSubject, record?.etag ?? '', auth),
    );
    if (outcome.ok) {
      void navigate(`/directory/legal-subjects/${initial.id}`, {
        state: { flash: 'Changes saved.' } satisfies FlashState,
      });
      return;
    }
    // The server found the subject established: lock every identity field and restore its value.
    if (isEstablishedRefusal(outcome.error)) {
      setEstablishedByServer(true);
      setValues((current) => ({
        ...current,
        ...Object.fromEntries(
          [...IDENTITY_KEYS].map((name) => [name, text(initial[name as TextKey])]),
        ),
      }));
    }
  }

  const field = (spec: TextSpec<TextKey>) => (
    <TextField
      key={spec.name}
      id={`subject-${spec.name}`}
      label={spec.label}
      type={spec.type ?? 'text'}
      multiline={spec.multiline ?? false}
      hint={spec.hint}
      required={spec.name === 'legalName'}
      value={values[spec.name]}
      error={errorFor(spec.name)}
      lockedBy={isLocked(spec.name) ? IDENTITY_LOCK_ID : null}
      onChange={(value) => {
        setValues((current) => ({ ...current, [spec.name]: value }));
        changed();
      }}
    />
  );
  const spec = (name: TextKey) => TEXTS.find((item) => item.name === name) as TextSpec<TextKey>;

  return (
    <article className="sheet">
      <Breadcrumbs
        trail={[
          ['Directory', '/directory'],
          ['Legal subjects', '/directory/legal-subjects'],
          ...(initial === null
            ? []
            : ([[initial.legalName, `/directory/legal-subjects/${initial.id}`]] as const)),
          [initial === null ? 'New legal subject' : 'Edit', null],
        ]}
      />
      <h1>{initial === null ? 'New legal subject' : `Edit ${initial.legalName}`}</h1>
      <p className="page-intro">
        {initial === null
          ? 'Record the exact party. Unknown details can stay empty; never fill them with guesses.'
          : 'Only changed fields are sent. Clearing a field removes its value.'}
      </p>
      {submission.conflict && onReload && (
        <ConflictNotice recordLabel="legal subject" onReload={onReload} />
      )}
      <ValidationSummary
        issues={issues}
        label={labelOf}
        fieldId={(path) => fieldIdFor('subject', path)}
      />
      {submission.error !== null && issues.length === 0 && (
        <ErrorNotice error={submission.error} recordLabel="legal subject" focusOnShow />
      )}
      {nothingToSave && (
        <p role="status" className="notice notice-quiet">
          Nothing to save: no field was changed.
        </p>
      )}
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="record-form">
        <fieldset className="fieldset">
          <legend>Legal identity</legend>
          {initial !== null && established && (
            <p id={IDENTITY_LOCK_ID} className="lock-notice">
              Locked: this subject is established (active, canonically bound or referenced by
              another record). Its identity can’t be filled in, changed or cleared here.
            </p>
          )}
          {initial === null ? (
            <SelectField
              id="subject-subjectType"
              label="Subject type"
              required
              hint="Fixed once saved: a different kind of party needs its own record."
              value={subjectType}
              placeholder="Choose a type"
              error={errorFor('subjectType')}
              options={(Object.keys(SUBJECT_TYPE_LABEL) as SubjectType[]).map((value) => ({
                value,
                label: SUBJECT_TYPE_LABEL[value],
              }))}
              onChange={(value) => {
                setSubjectType(value as SubjectType | '');
                changed();
              }}
            />
          ) : (
            <p className="field-static">
              <span className="field-static-label">Subject type</span>{' '}
              {SUBJECT_TYPE_LABEL[initial.subjectType]}
              <span className="hint"> Fixed: a different kind of party needs its own record.</span>
            </p>
          )}
          {field(spec('legalName'))}
          <LinesField
            id="subject-aliases"
            label="Aliases"
            hint="One per line. Matching hints only; subjects are never merged by name."
            value={aliases}
            error={errorFor('aliases')}
            onChange={(value) => {
              setAliases(value);
              changed();
            }}
          />
          <div className="field-grid">{IDENTITY.map(field)}</div>
        </fieldset>
        <fieldset className="fieldset">
          <legend>Contact</legend>
          {field(spec('contactEmail'))}
        </fieldset>
        <PostalAddressFields
          idPrefix="subject-postalAddress"
          value={address}
          errorFor={errorFor}
          onChange={(next) => {
            setAddress(next);
            changed();
          }}
        />
        <AttributionsField
          idPrefix="subject"
          fields={ATTRIBUTABLE}
          rows={attributions}
          errorFor={errorFor}
          onChange={(rows) => {
            setAttributions(rows);
            changed();
          }}
        />
        {field(spec('notes'))}
        <div className="form-actions">
          <button type="submit" className="button-primary" disabled={submission.pending}>
            {submission.pending
              ? 'Saving…'
              : initial === null
                ? 'Create draft legal subject'
                : 'Save changes'}
          </button>
          <Link
            className="button button-quiet"
            to={
              initial === null
                ? '/directory/legal-subjects'
                : `/directory/legal-subjects/${initial.id}`
            }
          >
            Cancel
          </Link>
        </div>
      </form>
    </article>
  );
}
