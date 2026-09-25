// Correspondence pages (P4C): the registry of captured messages of each agency, the capture form
// and the captured record. A capture is one recorded communication, stored exactly as entered and
// never edited or deleted. Capturing sends, replies to, acknowledges, marks read, fetches and
// contacts nothing, and it proves no transmission, receipt, authenticity or outcome: what a message
// means for a case is recorded separately, as an explicit binding of that case. Captured text is
// untrusted and shown as plain text only. There is no send, reply, forward or contact action.
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import type { Correspondence, CorrespondenceSummary, CreateCorrespondence } from '@tb/contracts';
import { ApiError } from '../api/client.js';
import { useSession } from '../auth/session.js';
import { instantValue } from '../cases/intake-ui.js';
import { Absent, Time } from '../directory/agencies.js';
import { fieldIdFor, SelectField, TextField } from '../directory/fields.js';
import {
  ATTACHMENT_STATE_LABEL,
  BODY_ROLE_LABEL,
  CAPTURE_MODE_LABEL,
  describeError,
  DIRECTION_LABEL,
  issuesOf,
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
  StatusNotice,
  ValidationSummary,
} from '../directory/ui.js';
import { RecordedBy, SourceCitation, SourceSelect } from '../representation/authority-ui.js';
import {
  ATTACHMENTS_MEANING,
  BODY_HASH_LABEL,
  BODY_HASH_MEANING,
  CAPTURE_IMMUTABLE,
  CAPTURE_MODE_MEANING,
  CAPTURE_POSTURE_MEANING,
  CapturedText,
  CapturePosture,
  CORRESPONDENCE_MEANING,
  DATES_MEANING,
  DIRECTION_MEANING,
  IDENTIFIERS_MEANING,
  NO_EXTERNAL_ACTION,
  RAW_SOURCE_MEANING,
} from './correspondence-ui.js';

type Direction = Correspondence['direction'];
type CaptureMode = Correspondence['captureMode'];
type BodyRole = Correspondence['bodyRole'];
type AttachmentState = keyof typeof ATTACHMENT_STATE_LABEL;

const options = <K extends string>(labels: Readonly<Record<K, string>>) =>
  (Object.keys(labels) as K[]).map((value) => ({ value, label: labels[value] }));

/** A recorded instant: the viewer's local reading and the exact stored value. */
function Instant({ iso }: { iso: string | null }) {
  if (iso === null) return <Absent />;
  return (
    <span>
      <Time iso={iso} /> <code className="hint">{iso}</code>
    </span>
  );
}

export function CorrespondenceListPage() {
  const api = useDirectoryApi();
  const [params, setParams] = useSearchParams();
  const agencyId = params.get('agencyId') ?? '';
  const [agencies] = useLoad('correspondence:agency-filter', () =>
    api.agencies.list({ limit: 100 }),
  );
  const agencyItems = agencies.status === 'ready' ? agencies.value.items : [];
  function setAgency(value: string) {
    const next = new URLSearchParams(params);
    if (value === '') next.delete('agencyId');
    else next.set('agencyId', value);
    setParams(next);
  }
  return (
    <DirectoryList<CorrespondenceSummary>
      title="Correspondence"
      noun="captured messages"
      intro={`${CORRESPONDENCE_MEANING} ${NO_EXTERNAL_ACTION}`}
      searchLabel="Search subject, mailbox, Message-ID or address"
      newLabel="Capture correspondence"
      newTo="/correspondence/new"
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
      load={(query) => api.correspondence.list({ ...query, ...(agencyId ? { agencyId } : {}) })}
      emptyText={
        agencyId ? (
          <p>
            No message is captured for this agency.{' '}
            <button type="button" className="button-link" onClick={() => setAgency('')}>
              Show all agencies
            </button>
          </p>
        ) : (
          <p>
            No correspondence captured yet.{' '}
            <Link to="/correspondence/new">Capture the first message</Link>.
          </p>
        )
      }
      columns={[
        {
          header: 'Subject as captured',
          cell: (item) => <Link to={`/correspondence/${item.id}`}>{item.subject}</Link>,
        },
        { header: 'Direction', cell: (item) => DIRECTION_LABEL[item.direction] },
        { header: 'Capture mode', cell: (item) => CAPTURE_MODE_LABEL[item.captureMode] },
        { header: 'Body role', cell: (item) => BODY_ROLE_LABEL[item.bodyRole] },
        { header: 'Agency', cell: (item) => <RecordName kind="agency" id={item.agencyId} /> },
        { header: 'Occurred', cell: (item) => <Time iso={item.occurredAt} /> },
        { header: 'Recorded in TB', cell: (item) => <Time iso={item.createdAt} /> },
      ]}
    />
  );
}

export function CorrespondenceDetailPage() {
  const { id = '' } = useParams();
  return <CorrespondenceDetail key={id} id={id} />;
}

function CorrespondenceDetail({ id }: { id: string }) {
  const api = useDirectoryApi();
  const flash = useFlashMessage();
  const { state: session } = useSession();
  const currentUserId = session.status === 'authenticated' ? session.session.user.id : '';
  const [state, reload] = useLoad(`correspondence:${id}`, () => api.correspondence.get(id));
  const trail = [['Correspondence', '/correspondence']] as const;
  if (state.status === 'loading') return <LoadingNotice label="Loading captured message…" />;
  if (state.status === 'error') {
    return (
      <>
        <Breadcrumbs trail={[...trail, ['Captured message', null]]} />
        <ErrorNotice error={state.error} recordLabel="captured message" onRetry={reload} />
      </>
    );
  }
  const message = state.value;
  const attachments = message.attachmentsManifest ?? [];
  return (
    <article className="sheet" data-testid="correspondence-detail">
      <Breadcrumbs trail={[...trail, [message.subject, null]]} />
      <RecordHeader
        name={message.subject}
        stamp={<CapturePosture mode={message.captureMode} />}
        facts={[
          DIRECTION_LABEL[message.direction],
          `Body role: ${BODY_ROLE_LABEL[message.bodyRole]}`,
          <>
            Recorded in TB <Time iso={message.createdAt} />
          </>,
        ]}
        boundary={CORRESPONDENCE_MEANING}
      />
      <StatusNotice message={flash} />
      <p className="notice notice-quiet" data-testid="no-external-action">
        {NO_EXTERNAL_ACTION} {CAPTURE_IMMUTABLE}
      </p>
      <Section title="Message as captured">
        <Details
          rows={[
            [
              'Direction',
              <span data-testid="direction">{DIRECTION_LABEL[message.direction]}</span>,
            ],
            ['Mailbox', <span className="prose">{message.mailboxAddress}</span>],
            ['Subject', <span className="prose">{message.subject}</span>],
            ['From', message.fromAddress && <span className="prose">{message.fromAddress}</span>],
            ['To', message.toAddress && <span className="prose">{message.toAddress}</span>],
            [
              'Reply-To',
              message.replyToAddress && <span className="prose">{message.replyToAddress}</span>,
            ],
          ]}
        />
        <p className="hint">{DIRECTION_MEANING}</p>
      </Section>
      <Section title="Message-ID and threading">
        <Details
          rows={[
            ['Message-ID', message.messageId && <code>{message.messageId}</code>],
            ['In-Reply-To', message.inReplyTo && <code>{message.inReplyTo}</code>],
            [
              'References',
              message.references && message.references.length > 0 && (
                <ol className="plain-list">
                  {message.references.map((reference, index) => (
                    <li key={index}>
                      <code>{reference}</code>
                    </li>
                  ))}
                </ol>
              ),
            ],
          ]}
        />
        <p className="hint">{IDENTIFIERS_MEANING}</p>
      </Section>
      <Section title="Capture posture">
        <Details
          rows={[
            [
              'Capture mode',
              <>
                <CapturePosture mode={message.captureMode} />{' '}
                <span data-testid="capture-mode-meaning">
                  {CAPTURE_MODE_MEANING[message.captureMode]}
                </span>
              </>,
            ],
            ['Body role', <span data-testid="body-role">{BODY_ROLE_LABEL[message.bodyRole]}</span>],
            [
              'Raw source',
              message.rawSourceId === null ? null : (
                <SourceCitation sourceId={message.rawSourceId} />
              ),
            ],
          ]}
        />
        <p className="hint">{CAPTURE_POSTURE_MEANING}</p>
        <p className="hint">{RAW_SOURCE_MEANING}</p>
      </Section>
      <Section title="Captured body">
        {message.bodyText === null ? (
          <p className="absent" data-testid="captured-body-none">
            No body text is recorded for this message.
          </p>
        ) : (
          <CapturedText testId="captured-body" text={message.bodyText} />
        )}
        <Details
          rows={[
            [
              BODY_HASH_LABEL,
              message.bodySha256 && (
                <code className="hash" data-testid="body-sha256">
                  {message.bodySha256}
                </code>
              ),
            ],
          ]}
        />
        <p className="hint">{BODY_HASH_MEANING}</p>
      </Section>
      <Section title="Attachment observations">
        {attachments.length === 0 ? (
          <p className="absent" data-testid="attachments-none">
            No attachment observation is recorded.
          </p>
        ) : (
          <div className="table-frame">
            <table className="records" data-testid="attachments">
              <caption className="visually-hidden">Attachment observations as recorded</caption>
              <thead>
                <tr>
                  <th scope="col">File name as observed</th>
                  <th scope="col">Observation</th>
                  <th scope="col">Source record</th>
                  <th scope="col">SHA-256 as entered</th>
                </tr>
              </thead>
              <tbody>
                {attachments.map((attachment, index) => (
                  <tr key={index}>
                    <th scope="row" className="prose">
                      {attachment.fileName}
                    </th>
                    <td>{ATTACHMENT_STATE_LABEL[attachment.state]}</td>
                    <td>
                      {attachment.sourceId ? (
                        <SourceCitation sourceId={attachment.sourceId} />
                      ) : (
                        <Absent />
                      )}
                    </td>
                    <td>
                      {attachment.sha256 ? (
                        <code className="hash">{attachment.sha256}</code>
                      ) : (
                        <Absent />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="hint">{ATTACHMENTS_MEANING}</p>
      </Section>
      <Section title="Dates">
        <Details
          rows={[
            [
              'Occurred',
              <span data-testid="occurred-at">
                <Instant iso={message.occurredAt} />
              </span>,
            ],
            [
              'Timestamp precision',
              <span data-testid="timestamp-precision">{message.timestampPrecision}</span>,
            ],
            [
              'Raw header date (text, not parsed)',
              message.headerDateRaw && (
                <code data-testid="header-date-raw">{message.headerDateRaw}</code>
              ),
            ],
            [
              'Recorded in TB',
              <span data-testid="recorded-at">
                <Instant iso={message.createdAt} />
              </span>,
            ],
          ]}
        />
        <p className="hint">{DATES_MEANING}</p>
      </Section>
      <Section title="Limitations">
        {message.limitations === null ? (
          <Absent />
        ) : (
          <CapturedText testId="captured-limitations" text={message.limitations} />
        )}
      </Section>
      <BindToCase message={message} />
      <Section title="Record">
        <Details
          rows={[
            ['Record id', <code>{message.id}</code>],
            ['Agency', <RecordName kind="agency" id={message.agencyId} />],
            [
              'Recorded by',
              <RecordedBy userId={message.createdById} currentUserId={currentUserId} />,
            ],
            ['Recorded in TB', <Time iso={message.createdAt} />],
          ]}
        />
      </Section>
    </article>
  );
}

/**
 * Leads to the binding page of one case of the message's agency. Nothing is bound here: a binding
 * is recorded explicitly on the case, with the case's version.
 */
function BindToCase({ message }: { message: Correspondence }) {
  const api = useDirectoryApi();
  const [caseId, setCaseId] = useState('');
  const [state] = useLoad(`correspondence-cases:${message.agencyId}`, () =>
    api.cases.list({ agencyId: message.agencyId, limit: 100 }),
  );
  const cases =
    state.status === 'ready' ? state.value.items.filter((item) => item.archivedAt === null) : [];
  return (
    <Section title="Bind to a case">
      <p className="hint">
        A binding records what this message is interpreted as for one case of its agency. Each case
        needs its own explicit binding; nothing is bound by capturing.
      </p>
      {state.status === 'loading' && <LoadingNotice label="Loading cases…" />}
      {state.status === 'error' && <ErrorNotice error={state.error} recordLabel="case" />}
      {state.status === 'ready' &&
        (cases.length === 0 ? (
          <p className="absent">This agency has no unarchived case to bind to.</p>
        ) : (
          <div className="link-form">
            <SelectField
              id="bind-caseId"
              label="Case of this agency"
              value={caseId}
              placeholder="Choose a case"
              options={cases.map((item) => ({ value: item.id, label: item.intakeLabel }))}
              onChange={setCaseId}
            />
            {caseId === '' ? (
              <p className="hint">Choose a case to continue.</p>
            ) : (
              <Link
                className="button"
                to={`/cases/${caseId}/correspondence-bindings/new?correspondenceId=${message.id}`}
              >
                Continue to the binding
              </Link>
            )}
          </div>
        ))}
    </Section>
  );
}

// capture form ------------------------------------------------------------------------------------

const LABELS: Record<string, string> = {
  agencyId: 'Agency',
  mailboxAddress: 'Mailbox address',
  direction: 'Direction',
  subject: 'Subject',
  messageId: 'Message-ID',
  inReplyTo: 'In-Reply-To',
  references: 'References',
  captureMode: 'Capture mode',
  bodyRole: 'Body role',
  bodyText: 'Body text',
  rawSourceId: 'Raw source',
  attachmentsManifest: 'Attachment observations',
  headerDateRaw: 'Raw header date',
  occurredAt: 'Occurred at',
  timestampPrecision: 'Timestamp precision',
  fromAddress: 'From',
  toAddress: 'To',
  replyToAddress: 'Reply-To',
  limitations: 'Limitations',
};

/** The input of an issue path; an attachment row's fields have their own inputs. */
function captureFieldId(path: string): string | null {
  const [head, index, sub] = path.split('.');
  if (head === 'attachmentsManifest' && index !== undefined) {
    return `correspondence-attachments-${index}-${sub ?? 'fileName'}`;
  }
  return fieldIdFor('correspondence', path);
}

interface AttachmentRow {
  readonly fileName: string;
  readonly state: AttachmentState | '';
  readonly sourceId: string;
  readonly sha256: string;
}

const TEXT_FIELDS = [
  'mailboxAddress',
  'subject',
  'messageId',
  'inReplyTo',
  'references',
  'bodyText',
  'headerDateRaw',
  'timestampPrecision',
  'fromAddress',
  'toAddress',
  'replyToAddress',
  'limitations',
] as const;
type TextName = (typeof TEXT_FIELDS)[number];

/** An optional captured value: sent exactly as typed (nothing trimmed), not sent when empty. */
function exact<K extends string>(key: K, value: string): Partial<Record<K, string>> {
  return value === '' ? {} : ({ [key]: value } as Record<K, string>);
}

export function NewCorrespondencePage() {
  const api = useDirectoryApi();
  const navigate = useNavigate();
  const submission = useSubmission();
  const [values, setValues] = useState<Record<TextName, string>>(
    () => Object.fromEntries(TEXT_FIELDS.map((name) => [name, ''])) as Record<TextName, string>,
  );
  const [agencyId, setAgencyId] = useState('');
  const [direction, setDirection] = useState<Direction | ''>('');
  const [captureMode, setCaptureMode] = useState<CaptureMode | ''>('');
  const [bodyRole, setBodyRole] = useState<BodyRole>('UNKNOWN');
  const [rawSourceId, setRawSourceId] = useState('');
  const [occurredAt, setOccurredAt] = useState('');
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [agencies] = useLoad('correspondence-form:agencies', () =>
    api.agencies.list({ limit: 100 }),
  );
  const agencyItems = (agencies.status === 'ready' ? agencies.value.items : []).filter(
    (agency) => agency.recordState !== 'ARCHIVED',
  );
  const target = agencyId === '' ? null : ({ kind: 'Agency', agencyId } as const);
  const issues = issuesOf(submission.error);
  const refusal = submission.error instanceof ApiError ? submission.error : null;
  const postureField =
    refusal?.code === 'CAPTURE_POSTURE_UNSUPPORTED' && typeof refusal.details['field'] === 'string'
      ? refusal.details['field']
      : null;
  const errorFor = (path: string) =>
    clientErrors[path] ??
    issues.find((issue) => issue.path === path)?.message ??
    (postureField === path ? describeError(refusal, 'correspondence') : undefined);
  const set = (name: TextName) => (value: string) =>
    setValues((current) => ({ ...current, [name]: value }));
  const updateAttachment = (index: number, change: Partial<AttachmentRow>) =>
    setAttachments((rows) => rows.map((row, i) => (i === index ? { ...row, ...change } : row)));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problems: Record<string, string> = {};
    if (agencyId === '') problems['agencyId'] = 'Choose the agency whose mailbox holds it.';
    if (values.mailboxAddress === '') problems['mailboxAddress'] = 'Enter the mailbox address.';
    if (direction === '') problems['direction'] = 'Choose the direction as recorded.';
    if (values.subject === '') problems['subject'] = 'Enter the subject exactly as it appears.';
    if (captureMode === '') problems['captureMode'] = 'Choose how this message was captured.';
    attachments.forEach((row, index) => {
      if (row.fileName === '') {
        problems[`attachmentsManifest.${index}.fileName`] = 'Enter the file name as observed.';
      }
      if (row.state === '') {
        problems[`attachmentsManifest.${index}.state`] = 'Choose what was observed.';
      }
      if (row.sha256 !== '' && !/^[0-9a-f]{64}$/.test(row.sha256)) {
        problems[`attachmentsManifest.${index}.sha256`] =
          'Use exactly 64 lowercase hexadecimal characters.';
      }
    });
    setClientErrors(problems);
    const first = Object.keys(problems)[0];
    if (first !== undefined) {
      const fieldId = captureFieldId(first);
      if (fieldId !== null) document.getElementById(fieldId)?.focus();
      return;
    }
    const references = values.references.split('\n').filter((line) => line !== '');
    const occurred = instantValue(occurredAt, null);
    const body: CreateCorrespondence = {
      agencyId,
      mailboxAddress: values.mailboxAddress,
      direction: direction as Direction,
      subject: values.subject,
      captureMode: captureMode as CaptureMode,
      bodyRole,
      ...exact('messageId', values.messageId),
      ...exact('inReplyTo', values.inReplyTo),
      ...(references.length === 0 ? {} : { references }),
      ...exact('bodyText', values.bodyText),
      ...(rawSourceId === '' ? {} : { rawSourceId }),
      ...(attachments.length === 0
        ? {}
        : {
            attachmentsManifest: attachments.map((row) => ({
              fileName: row.fileName,
              state: row.state as AttachmentState,
              ...(row.sourceId === '' ? {} : { sourceId: row.sourceId }),
              ...(row.sha256 === '' ? {} : { sha256: row.sha256 }),
            })),
          }),
      ...exact('headerDateRaw', values.headerDateRaw),
      ...(occurred === null ? {} : { occurredAt: occurred }),
      ...exact('timestampPrecision', values.timestampPrecision),
      ...exact('fromAddress', values.fromAddress),
      ...exact('toAddress', values.toAddress),
      ...exact('replyToAddress', values.replyToAddress),
      ...exact('limitations', values.limitations),
    };
    const outcome = await submission.submit(body, (auth) => api.correspondence.capture(body, auth));
    if (outcome.ok) {
      void navigate(`/correspondence/${outcome.value.id}`, {
        state: {
          flash: 'Message captured. Nothing was sent, fetched or marked.',
        } satisfies FlashState,
      });
      return;
    }
    const failure = outcome.error;
    if (failure instanceof ApiError && failure.code === 'CAPTURE_POSTURE_UNSUPPORTED') {
      const fieldId = captureFieldId(String(failure.details['field']));
      if (fieldId !== null) document.getElementById(fieldId)?.focus();
    }
  }

  const text = (
    name: TextName,
    label: string,
    extra: {
      hint?: string;
      required?: boolean;
      multiline?: boolean;
      type?: 'email';
    } = {},
  ) => (
    <TextField
      id={`correspondence-${name}`}
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

  return (
    <article className="sheet">
      <Breadcrumbs
        trail={[
          ['Correspondence', '/correspondence'],
          ['Capture correspondence', null],
        ]}
      />
      <h1>Capture correspondence</h1>
      <p className="page-intro">
        {CORRESPONDENCE_MEANING} Enter only what the message shows; every text is stored exactly as
        typed, and nothing is filled in, parsed or looked up for you.
      </p>
      <p className="notice notice-quiet">{NO_EXTERNAL_ACTION}</p>
      <ValidationSummary
        issues={issues}
        label={(path) => LABELS[path.split('.')[0] ?? ''] ?? path}
        fieldId={captureFieldId}
      />
      {submission.error !== null && issues.length === 0 && postureField === null && (
        <ErrorNotice error={submission.error} recordLabel="correspondence" focusOnShow />
      )}
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="record-form">
        <fieldset className="fieldset">
          <legend>Mailbox and direction</legend>
          <div className="field-grid">
            <SelectField
              id="correspondence-agencyId"
              label="Agency"
              required
              hint="The agency whose mailbox holds the message. Its sources can be cited below."
              value={agencyId}
              placeholder="Choose an agency"
              options={agencyItems.map((agency) => ({
                value: agency.id,
                label: agency.displayName,
              }))}
              error={errorFor('agencyId')}
              onChange={(value) => {
                setAgencyId(value);
                setRawSourceId('');
                setAttachments((rows) => rows.map((row) => ({ ...row, sourceId: '' })));
              }}
            />
            {text('mailboxAddress', 'Mailbox address', { required: true, type: 'email' })}
            <SelectField
              id="correspondence-direction"
              label="Direction"
              required
              hint={DIRECTION_MEANING}
              value={direction}
              placeholder="Choose the direction as recorded"
              options={options(DIRECTION_LABEL)}
              error={errorFor('direction')}
              onChange={(value) => setDirection(value as Direction | '')}
            />
          </div>
        </fieldset>
        <fieldset className="fieldset">
          <legend>Headers as shown</legend>
          {text('subject', 'Subject', { required: true, hint: 'Exactly as it appears.' })}
          <div className="field-grid">
            {text('fromAddress', 'From (optional)', { type: 'email' })}
            {text('toAddress', 'To (optional)', { type: 'email' })}
            {text('replyToAddress', 'Reply-To (optional)', { type: 'email' })}
          </div>
          <div className="field-grid">
            {text('messageId', 'Message-ID (optional)', {
              hint: 'As shown, angle brackets included. It identifies no transmission.',
            })}
            {text('inReplyTo', 'In-Reply-To (optional)')}
          </div>
          {text('references', 'References (optional)', {
            multiline: true,
            hint: 'One Message-ID per line, as shown. Empty lines are ignored.',
          })}
        </fieldset>
        <fieldset className="fieldset">
          <legend>Capture posture</legend>
          <p className="hint">{CAPTURE_POSTURE_MEANING}</p>
          <div className="field-grid">
            <SelectField
              id="correspondence-captureMode"
              label="Capture mode"
              required
              hint={
                captureMode === ''
                  ? 'How you have this message. Nothing is assumed.'
                  : CAPTURE_MODE_MEANING[captureMode]
              }
              value={captureMode}
              placeholder="Choose how it was captured"
              options={options(CAPTURE_MODE_LABEL)}
              error={errorFor('captureMode')}
              onChange={(value) => setCaptureMode(value as CaptureMode | '')}
            />
            <SelectField
              id="correspondence-bodyRole"
              label="Body role"
              hint="What the recorded body text is. Unknown stays unknown."
              value={bodyRole}
              options={options(BODY_ROLE_LABEL)}
              error={errorFor('bodyRole')}
              onChange={(value) => setBodyRole(value as BodyRole)}
            />
          </div>
          <SourceSelect
            id="correspondence-rawSourceId"
            label="Raw source (optional)"
            hint={`The source record of the raw message file (for example a saved message file in Drive). A raw-source capture needs it. ${RAW_SOURCE_MEANING}`}
            target={target}
            value={rawSourceId}
            onChange={setRawSourceId}
            error={errorFor('rawSourceId')}
            noneLabel="No raw source"
          />
        </fieldset>
        <fieldset className="fieldset">
          <legend>Body</legend>
          {text('bodyText', 'Body text (optional)', {
            multiline: true,
            hint: 'Stored exactly as typed or pasted — nothing is trimmed or normalized. A browser text box records every line break as a single line feed. The text is untrusted: it is only ever shown as plain text.',
          })}
        </fieldset>
        <fieldset className="fieldset" data-testid="attachment-rows">
          <legend>Attachment observations (optional)</legend>
          <p className="hint">{ATTACHMENTS_MEANING}</p>
          {attachments.map((row, index) => (
            <div key={index} className="repeat-row">
              <TextField
                id={`correspondence-attachments-${index}-fileName`}
                label={`Attachment ${index + 1}: file name as observed`}
                required
                value={row.fileName}
                error={errorFor(`attachmentsManifest.${index}.fileName`)}
                onChange={(fileName) => updateAttachment(index, { fileName })}
              />
              <SelectField
                id={`correspondence-attachments-${index}-state`}
                label="Observation"
                required
                value={row.state}
                placeholder="Choose what was observed"
                options={options(ATTACHMENT_STATE_LABEL)}
                error={errorFor(`attachmentsManifest.${index}.state`)}
                onChange={(state) => updateAttachment(index, { state: state as AttachmentState })}
              />
              <SourceSelect
                id={`correspondence-attachments-${index}-sourceId`}
                label="Source record of the file (optional)"
                hint="Only a source already recorded for this file. None is created here."
                target={target}
                value={row.sourceId}
                onChange={(sourceId) => updateAttachment(index, { sourceId })}
                error={errorFor(`attachmentsManifest.${index}.sourceId`)}
              />
              <TextField
                id={`correspondence-attachments-${index}-sha256`}
                label="SHA-256 as entered (optional)"
                hint="Only a value computed from the file itself. This app computes and verifies none."
                value={row.sha256}
                error={errorFor(`attachmentsManifest.${index}.sha256`)}
                onChange={(sha256) => updateAttachment(index, { sha256 })}
              />
              <button
                type="button"
                className="button-quiet"
                onClick={() => setAttachments((rows) => rows.filter((_, i) => i !== index))}
              >
                Remove attachment {index + 1}
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setAttachments((rows) => [
                ...rows,
                { fileName: '', state: '', sourceId: '', sha256: '' },
              ])
            }
          >
            Add an attachment observation
          </button>
        </fieldset>
        <fieldset className="fieldset">
          <legend>Dates</legend>
          <p className="hint">{DATES_MEANING}</p>
          <div className="field-grid">
            {text('headerDateRaw', 'Raw header date (optional)', {
              hint: 'The Date header as text, exactly as shown. It is never parsed.',
            })}
            <TextField
              id="correspondence-occurredAt"
              label="Occurred at (optional)"
              type="datetime-local"
              hint="When the message is stated to have been sent or received, in your local time. Leave empty when not known."
              value={occurredAt}
              error={errorFor('occurredAt')}
              onChange={setOccurredAt}
            />
            {text('timestampPrecision', 'Timestamp precision (optional)', {
              hint: 'For example MINUTE or DAY. Left empty, it is recorded as UNKNOWN.',
            })}
          </div>
        </fieldset>
        <fieldset className="fieldset">
          <legend>Limitations</legend>
          {text('limitations', 'Limitations (optional)', {
            multiline: true,
            hint: 'What this capture does not show — for example a missing attachment or an unknown sender.',
          })}
        </fieldset>
        <div className="form-actions">
          <button type="submit" className="button-primary" disabled={submission.pending}>
            {submission.pending ? 'Recording…' : 'Record captured message'}
          </button>
          <Link to="/correspondence">Cancel</Link>
        </div>
      </form>
    </article>
  );
}
