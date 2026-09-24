// Owner pages. An Owner is a client/brand namespace. It is not the legal claimant: the exact legal
// party is a LegalSubject that is linked explicitly, and nothing is inferred from names, aliases or
// channels. The association section manages OwnerSubject links (link, pause, unlink, relink).
import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { CreateOwner, LegalSubject, Owner, OwnerSubject, PatchOwner } from '@tb/contracts';
import { ApiError } from '../api/client.js';
import { etagOf, type Versioned } from '../api/directory.js';
import { CanonicalBindingSection } from './canonical-binding.js';
import { Absent, RecordFacts, Time } from './agencies.js';
import {
  channelRows,
  channelsValue,
  ChannelsField,
  createTexts,
  fieldIdFor,
  initialTexts,
  linesOf,
  LinesField,
  patchTexts,
  sameJson,
  TextField,
  type ChannelRow,
  type TextSpec,
} from './fields.js';
import {
  describeError,
  issuesOf,
  LINK_STATE_LABEL,
  LINK_STATE_TONE,
  RECORD_STATE_LABEL,
  RECORD_STATE_TONE,
  SUBJECT_TYPE_LABEL,
} from './format.js';
import { useDirectoryApi, useIntentKey, useLoad, useWrite } from './hooks.js';
import { DirectoryList } from './list.js';
import { RecordStateActions } from './record-actions.js';
import { useRecordPage, useSubmission, type FlashState } from './record-page.js';
import {
  Breadcrumbs,
  ConflictNotice,
  Details,
  ErrorNotice,
  LoadingNotice,
  ReasonDialog,
  RecordHeader,
  Section,
  StateStamp,
  StatusNotice,
  ValidationSummary,
} from './ui.js';

type TextKey =
  | 'displayName'
  | 'contactName'
  | 'contactEmail'
  | 'websiteUrl'
  | 'preferredLanguage'
  | 'driveFolderUrl'
  | 'notes';

const TEXTS: readonly TextSpec<TextKey>[] = [
  { name: 'displayName', label: 'Display name' },
  {
    name: 'contactName',
    label: 'Contact person',
    hint: 'Not necessarily the rights holder or an authorized signatory.',
  },
  { name: 'contactEmail', label: 'Contact email', type: 'email' },
  { name: 'websiteUrl', label: 'Website', type: 'url' },
  { name: 'preferredLanguage', label: 'Preferred language', hint: 'For example: vi or en.' },
  { name: 'driveFolderUrl', label: 'Drive folder', type: 'url' },
  { name: 'notes', label: 'Notes', multiline: true },
];

const labelOf = (path: string): string => {
  const [head, index] = path.split('.');
  if (head === 'aliases') return 'Aliases';
  if (head === 'sourceChannels') return `Channel ${Number(index ?? 0) + 1}`;
  return TEXTS.find((spec) => spec.name === head)?.label ?? head ?? 'Request';
};

const BOUNDARY =
  'A client or brand namespace, not the legal claimant. Link the exact legal subject explicitly.';

export function OwnerListPage() {
  const api = useDirectoryApi();
  return (
    <DirectoryList<Owner>
      title="Owners"
      noun="owners"
      intro="Client and brand namespaces. An owner is not the legal claimant; its legal subjects are linked explicitly."
      searchLabel="Search by name or alias"
      newLabel="New owner"
      newTo="/directory/owners/new"
      load={(query) => api.owners.list(query)}
      emptyText={
        <p>
          No owners yet. <Link to="/directory/owners/new">Create the first owner record</Link>.
        </p>
      }
      columns={[
        {
          header: 'Display name',
          cell: (owner) => <Link to={`/directory/owners/${owner.id}`}>{owner.displayName}</Link>,
        },
        {
          header: 'Aliases',
          cell: (owner) =>
            owner.aliases === null || owner.aliases.length === 0 ? (
              <Absent />
            ) : (
              owner.aliases.join('; ')
            ),
        },
        {
          header: 'Contact',
          cell: (owner) => owner.contactName ?? owner.contactEmail ?? <Absent />,
        },
        {
          header: 'State',
          cell: (owner) => (
            <StateStamp
              label={RECORD_STATE_LABEL[owner.recordState]}
              tone={RECORD_STATE_TONE[owner.recordState]}
            />
          ),
        },
        { header: 'Updated', cell: (owner) => <Time iso={owner.updatedAt} /> },
      ]}
    />
  );
}

export function OwnerDetailPage() {
  const { id = '' } = useParams();
  return <OwnerDetail key={id} id={id} />;
}

function OwnerDetail({ id }: { id: string }) {
  const api = useDirectoryApi();
  const navigate = useNavigate();
  const page = useRecordPage(`owner:${id}`, () => api.owners.get(id));
  const [linkCount, setLinkCount] = useState(0);
  const trail = [
    ['Directory', '/directory'],
    ['Owners', '/directory/owners'],
  ] as const;
  if (page.state.status === 'loading') return <LoadingNotice label="Loading owner…" />;
  if (page.state.status === 'error') {
    return (
      <>
        <Breadcrumbs trail={[...trail, ['Owner', null]]} />
        <ErrorNotice error={page.state.error} recordLabel="owner" onRetry={page.reload} />
      </>
    );
  }
  const record = page.state.value;
  const owner = record.data;
  return (
    <article className="sheet" data-testid="owner-detail">
      <Breadcrumbs trail={[...trail, [owner.displayName, null]]} />
      <RecordHeader
        name={owner.displayName}
        stamp={
          <StateStamp
            label={RECORD_STATE_LABEL[owner.recordState]}
            tone={RECORD_STATE_TONE[owner.recordState]}
          />
        }
        facts={[
          `Version ${owner.rowVersion}`,
          owner.canonicalCode === null
            ? 'No canonical code (local only)'
            : `Canonical code ${owner.canonicalCode}`,
        ]}
        boundary={BOUNDARY}
      />
      {page.conflict && <ConflictNotice recordLabel="owner" onReload={page.reload} />}
      <StatusNotice message={page.message} />
      <RecordStateActions
        noun="owner"
        record={record}
        api={api.owners}
        onChanged={page.update}
        onConflict={page.raiseConflict}
        deleteBlocker={
          linkCount > 0
            ? 'Legal subjects are linked to this owner, so it is not an unused draft. Archive it instead.'
            : null
        }
        onDeleted={() =>
          void navigate('/directory/owners', {
            state: { flash: `Draft owner “${owner.displayName}” deleted.` } satisfies FlashState,
          })
        }
        edit={
          <Link className="button" to={`/directory/owners/${owner.id}/edit`}>
            Edit
          </Link>
        }
      />
      {owner.archivedAt !== null && (
        <p className="notice notice-quiet">
          Archived <Time iso={owner.archivedAt} />. Reason: {owner.archiveReason}
        </p>
      )}
      <OwnerSubjects
        owner={record}
        onOwnerChanged={async (message) => {
          try {
            page.update(await api.owners.get(owner.id), message);
          } catch {
            page.reload();
          }
        }}
        onConflict={page.raiseConflict}
        onCount={setLinkCount}
      />
      <div className="sheet-columns">
        <Section title="Contact">
          <Details
            rows={[
              ['Contact person', owner.contactName],
              ['Contact email', owner.contactEmail],
              ['Preferred language', owner.preferredLanguage],
            ]}
          />
        </Section>
        <Section title="Names and channels">
          <Details
            rows={[
              [
                'Aliases',
                owner.aliases && owner.aliases.length > 0 ? owner.aliases.join('; ') : null,
              ],
              [
                'YouTube channels',
                owner.sourceChannels && owner.sourceChannels.length > 0 ? (
                  <ul className="plain-list">
                    {owner.sourceChannels.map((channel) => (
                      <li key={channel.url}>
                        <a href={channel.url} target="_blank" rel="noopener noreferrer">
                          {channel.displayName ?? channel.url}
                        </a>
                        {channel.channelId ? (
                          <span className="hint"> ({channel.channelId})</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null,
              ],
            ]}
          />
        </Section>
      </div>
      <Section title="Links">
        <Details
          rows={[
            [
              'Website',
              owner.websiteUrl && (
                <a href={owner.websiteUrl} target="_blank" rel="noopener noreferrer">
                  {owner.websiteUrl}
                </a>
              ),
            ],
            [
              'Drive folder',
              owner.driveFolderUrl && (
                <a href={owner.driveFolderUrl} target="_blank" rel="noopener noreferrer">
                  {owner.driveFolderUrl}
                </a>
              ),
            ],
          ]}
        />
      </Section>
      <CanonicalBindingSection
        noun="owner namespace"
        record={record}
        archived={owner.recordState === 'ARCHIVED'}
        target={{ kind: 'Owner' }}
        bind={(body, ifMatch, auth) => api.owners.bindCanonical(owner.id, body, ifMatch, auth)}
        onBound={page.update}
        onConflict={page.raiseConflict}
      />
      <Section title="Notes">
        {owner.notes ? <p className="prose">{owner.notes}</p> : <Absent />}
      </Section>
      <RecordFacts record={owner} />
    </article>
  );
}

type LinkOperation = {
  readonly association: OwnerSubject;
  readonly state: OwnerSubject['linkState'];
};

function OwnerSubjects({
  owner,
  onOwnerChanged,
  onConflict,
  onCount,
}: {
  owner: Versioned<Owner>;
  onOwnerChanged: (message: string) => Promise<void>;
  onConflict: () => void;
  onCount: (count: number) => void;
}) {
  const api = useDirectoryApi();
  const write = useWrite();
  const intent = useIntentKey();
  const [generation, setGeneration] = useState(0);
  const [state, reload] = useLoad(`owner-subjects:${owner.data.id}:${generation}`, () =>
    api.ownerSubjects.list(owner.data.id, { limit: 100 }),
  );
  const [subjects, setSubjects] = useState<Record<string, LegalSubject | null>>({});
  const [operation, setOperation] = useState<LinkOperation | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (state.status === 'ready') onCount(state.value.items.length);
  }, [state, onCount]);

  useEffect(() => {
    if (state.status !== 'ready') return;
    const missing = state.value.items
      .map((item) => item.legalSubjectId)
      .filter((subjectId) => !(subjectId in subjects));
    if (missing.length === 0) return;
    let active = true;
    void Promise.all(
      [...new Set(missing)].map(async (subjectId) => {
        try {
          return [subjectId, (await api.legalSubjects.get(subjectId)).data] as const;
        } catch {
          return [subjectId, null] as const;
        }
      }),
    ).then((entries) => {
      if (active) setSubjects((current) => ({ ...current, ...Object.fromEntries(entries) }));
    });
    return () => {
      active = false;
    };
  }, [state, subjects, api]);

  async function changeState(reason: string) {
    if (operation === null) return;
    const { association, state: target } = operation;
    setPending(true);
    setError(null);
    try {
      const key = intent.keyFor({
        id: association.id,
        target,
        reason,
        version: association.rowVersion,
      });
      await write(key, (auth) =>
        api.ownerSubjects.setLinkState(
          association.id,
          { state: target, reason },
          etagOf('OwnerSubject', association),
          auth,
        ),
      );
      intent.done();
      setOperation(null);
      setMessage(`Link ${LINK_STATE_LABEL[target].toLowerCase()}.`);
      setGeneration((value) => value + 1);
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 412) {
        setOperation(null);
        setMessage(null);
        setError(failure);
        reload();
      } else {
        setError(failure);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Section title="Legal subjects">
      <p className="hint">
        The exact people or legal entities behind this owner. A link records a relationship only: it
        is not an appointment and grants no authority, and unlinking revokes nothing.
      </p>
      <StatusNotice message={message} />
      {state.status === 'loading' && <LoadingNotice label="Loading linked legal subjects…" />}
      {state.status === 'error' && <ErrorNotice error={state.error} onRetry={reload} />}
      {error !== null && operation === null && <ErrorNotice error={error} recordLabel="link" />}
      {state.status === 'ready' &&
        (state.value.items.length === 0 ? (
          <p className="absent" data-testid="no-links">
            No legal subject is linked. The owner can stay unlinked until the legal party is known.
          </p>
        ) : (
          <div className="table-frame">
            <table className="records" data-testid="owner-subjects">
              <thead>
                <tr>
                  <th scope="col">Legal subject</th>
                  <th scope="col">Relationship</th>
                  <th scope="col">Link</th>
                  <th scope="col">Since</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {state.value.items.map((association) => {
                  const subject = subjects[association.legalSubjectId];
                  return (
                    <tr key={association.id}>
                      <th scope="row">
                        <Link to={`/directory/legal-subjects/${association.legalSubjectId}`}>
                          {subject?.legalName ?? 'Legal subject'}
                        </Link>
                        {subject ? (
                          <span className="hint"> {SUBJECT_TYPE_LABEL[subject.subjectType]}</span>
                        ) : null}
                      </th>
                      <td>{association.relationshipLabel ?? <Absent />}</td>
                      <td>
                        <StateStamp
                          label={LINK_STATE_LABEL[association.linkState]}
                          tone={LINK_STATE_TONE[association.linkState]}
                        />
                      </td>
                      <td>
                        <Time iso={association.createdAt} />
                      </td>
                      <td className="row-actions">
                        <Link to={`/directory/owner-subjects/${association.id}`}>Open link</Link>
                        {(['LINKED', 'PAUSED', 'UNLINKED'] as const)
                          .filter((target) => target !== association.linkState)
                          .map((target) => (
                            <button
                              key={target}
                              type="button"
                              className="button-small"
                              onClick={() => {
                                setError(null);
                                setOperation({ association, state: target });
                              }}
                            >
                              {target === 'LINKED'
                                ? 'Relink'
                                : target === 'PAUSED'
                                  ? 'Pause'
                                  : 'Unlink'}
                              <span className="visually-hidden">
                                {' '}
                                {subject?.legalName ?? 'this legal subject'}
                              </span>
                            </button>
                          ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      <ReasonDialog
        open={operation !== null}
        title={
          operation === null
            ? ''
            : operation.state === 'UNLINKED'
              ? 'Unlink this legal subject'
              : operation.state === 'PAUSED'
                ? 'Pause this link'
                : 'Relink this legal subject'
        }
        description={
          <p>
            {operation?.state === 'UNLINKED'
              ? 'The link is kept for history and marked unlinked. Nothing is revoked, retracted or sent. It is refused while routes still use it.'
              : operation?.state === 'PAUSED'
                ? 'A paused link stays on record; nothing that already refers to it changes.'
                : 'The link becomes active again. Relinking does not revive any expired or revoked authority.'}
          </p>
        }
        confirmLabel={
          operation?.state === 'UNLINKED'
            ? 'Unlink'
            : operation?.state === 'PAUSED'
              ? 'Pause'
              : 'Relink'
        }
        danger={operation?.state === 'UNLINKED'}
        recordLabel="link"
        pending={pending}
        error={operation !== null ? error : null}
        onCancel={() => setOperation(null)}
        onConfirm={(reason) => void changeState(reason)}
      />
      {owner.data.recordState !== 'ARCHIVED' ? (
        <LinkSubjectForm
          owner={owner}
          linkedSubjectIds={
            state.status === 'ready' ? state.value.items.map((item) => item.legalSubjectId) : []
          }
          onConflict={onConflict}
          onLinked={async (subject) => {
            setGeneration((value) => value + 1);
            await onOwnerChanged(`Linked ${subject.legalName}.`);
          }}
        />
      ) : (
        <p className="hint">Restore the owner to link legal subjects.</p>
      )}
    </Section>
  );
}

function LinkSubjectForm({
  owner,
  linkedSubjectIds,
  onLinked,
  onConflict,
}: {
  owner: Versioned<Owner>;
  /** Subjects that already have a link with this owner (in any state). */
  linkedSubjectIds: readonly string[];
  onLinked: (subject: LegalSubject) => Promise<void>;
  onConflict: () => void;
}) {
  const api = useDirectoryApi();
  const submission = useSubmission();
  const searchId = useId();
  const labelId = useId();
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [results, reloadResults] = useLoad(`link-search:${search}`, () =>
    api.legalSubjects.list({ ...(search ? { q: search } : {}), limit: 10 }),
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selected === null) {
      setProblem('Choose the exact legal subject to link.');
      document
        .querySelector<HTMLInputElement>('input[name="legalSubjectId"]:not(:disabled)')
        ?.focus();
      return;
    }
    setProblem(null);
    const subject =
      results.status === 'ready'
        ? results.value.items.find((item) => item.id === selected)
        : undefined;
    const body = {
      legalSubjectId: selected,
      ...(label.trim() === '' ? {} : { relationshipLabel: label.trim() }),
    };
    const outcome = await submission.submit({ owner: owner.data.id, body }, (auth) =>
      api.ownerSubjects.link(owner.data.id, body, owner.etag, auth),
    );
    if (outcome.ok) {
      setSelected(null);
      setLabel('');
      if (subject) await onLinked(subject);
    } else if (outcome.error instanceof ApiError && outcome.error.status === 412) {
      onConflict();
    }
  }

  const duplicateId =
    submission.error instanceof ApiError && submission.error.code === 'DUPLICATE_OWNER_SUBJECT'
      ? submission.error.details['ownerSubjectId']
      : undefined;

  return (
    <form className="link-form" noValidate onSubmit={(event) => void submit(event)}>
      <h3>Link a legal subject</h3>
      <p className="hint">
        Choose the exact party. Similar names are only hints; nothing is linked automatically.{' '}
        <Link to="/directory/legal-subjects/new">Create a legal subject</Link> if it is not in the
        directory yet.
      </p>
      <div className="search">
        <label htmlFor={searchId}>Find legal subject</label>
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              setSearch(query);
            }
          }}
        />
        <button type="button" onClick={() => setSearch(query)}>
          Search
        </button>
      </div>
      {results.status === 'loading' && <LoadingNotice label="Searching legal subjects…" />}
      {results.status === 'error' && <ErrorNotice error={results.error} onRetry={reloadResults} />}
      {results.status === 'ready' && (
        <fieldset
          className="fieldset choice-list"
          aria-describedby={problem ? `${searchId}-problem` : undefined}
        >
          <legend>Legal subject</legend>
          {results.value.items.length === 0 && (
            <p className="absent">No legal subjects match. Create one first.</p>
          )}
          {results.value.items.map((subject) => {
            const archived = subject.recordState === 'ARCHIVED';
            const linked = linkedSubjectIds.includes(subject.id);
            return (
              <label
                key={subject.id}
                className={`choice${archived || linked ? ' choice-disabled' : ''}`}
              >
                <input
                  type="radio"
                  name="legalSubjectId"
                  value={subject.id}
                  checked={selected === subject.id}
                  disabled={archived || linked}
                  onChange={() => setSelected(subject.id)}
                />
                <span className="choice-name">{subject.legalName}</span>
                <span className="hint">
                  {SUBJECT_TYPE_LABEL[subject.subjectType]}
                  {subject.jurisdictionCountry ? `, ${subject.jurisdictionCountry}` : ''}
                  {subject.registrationNumber ? `, reg. ${subject.registrationNumber}` : ''}
                  {archived ? ', archived' : ''}
                  {linked ? ', already linked (change it in the table above)' : ''}
                </span>
              </label>
            );
          })}
          {problem && (
            <p id={`${searchId}-problem`} className="field-error">
              {problem}
            </p>
          )}
        </fieldset>
      )}
      <div className="field">
        <label htmlFor={labelId}>Relationship (optional)</label>
        <input
          id={labelId}
          type="text"
          value={label}
          placeholder="For example: brand operated by"
          onChange={(event) => setLabel(event.target.value)}
        />
      </div>
      <p className="hint">This page records the relationship only; it does not attach a source.</p>
      {submission.error !== null && (
        <div role="alert" className="notice notice-error">
          <p>{describeError(submission.error, 'link')}</p>
          {typeof duplicateId === 'string' && (
            <Link to={`/directory/owner-subjects/${duplicateId}`}>Open the existing link</Link>
          )}
        </div>
      )}
      <button type="submit" className="button-primary" disabled={submission.pending}>
        {submission.pending ? 'Linking…' : 'Link legal subject'}
      </button>
    </form>
  );
}

export function NewOwnerPage() {
  return <OwnerForm record={null} />;
}

export function EditOwnerPage() {
  const { id = '' } = useParams();
  const api = useDirectoryApi();
  const [state, reload] = useLoad(`owner-edit:${id}`, () => api.owners.get(id));
  if (state.status === 'loading') return <LoadingNotice label="Loading owner…" />;
  if (state.status === 'error') {
    return <ErrorNotice error={state.error} recordLabel="owner" onRetry={reload} />;
  }
  return <OwnerForm key={state.value.etag} record={state.value} onReload={reload} />;
}

function OwnerForm({
  record,
  onReload,
}: {
  record: Versioned<Owner> | null;
  onReload?: () => void;
}) {
  const api = useDirectoryApi();
  const navigate = useNavigate();
  const initial = record?.data ?? null;
  const [values, setValues] = useState(() => initialTexts(TEXTS, initial));
  const [aliases, setAliases] = useState(() => (initial?.aliases ?? []).join('\n'));
  const [channels, setChannels] = useState<ChannelRow[]>(() =>
    channelRows(initial?.sourceChannels),
  );
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [nothingToSave, setNothingToSave] = useState(false);
  const submission = useSubmission();
  const issues = issuesOf(submission.error);
  const errorFor = (path: string) =>
    clientErrors[path] ?? issues.find((issue) => issue.path === path)?.message;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNothingToSave(false);
    if (values.displayName.trim() === '') {
      setClientErrors({ displayName: 'Enter a display name.' });
      document.getElementById('owner-displayName')?.focus();
      return;
    }
    setClientErrors({});
    const aliasList = linesOf(aliases);
    const channelList = channelsValue(channels);
    if (initial === null) {
      const body: CreateOwner = {
        ...createTexts(TEXTS, values),
        displayName: values.displayName.trim(),
        ...(aliasList.length === 0 ? {} : { aliases: aliasList }),
        ...(channelList.length === 0 ? {} : { sourceChannels: channelList }),
      };
      const outcome = await submission.submit(body, (auth) => api.owners.create(body, auth));
      if (outcome.ok) {
        void navigate(`/directory/owners/${outcome.value.data.id}`, {
          state: { flash: 'Owner created as a draft.' } satisfies FlashState,
        });
      }
      return;
    }
    const body: Record<string, unknown> = { ...patchTexts(TEXTS, values, initial) };
    if (!sameJson(aliasList, initial.aliases ?? []))
      body['aliases'] = aliasList.length === 0 ? null : aliasList;
    if (!sameJson(channelList, channelsValue(channelRows(initial.sourceChannels)))) {
      body['sourceChannels'] = channelList.length === 0 ? null : channelList;
    }
    if (Object.keys(body).length === 0) {
      setNothingToSave(true);
      return;
    }
    const outcome = await submission.submit({ id: initial.id, body }, (auth) =>
      api.owners.patch(initial.id, body as PatchOwner, record?.etag ?? '', auth),
    );
    if (outcome.ok) {
      void navigate(`/directory/owners/${initial.id}`, {
        state: { flash: 'Changes saved.' } satisfies FlashState,
      });
    }
  }

  const field = (spec: TextSpec<TextKey>) => (
    <TextField
      key={spec.name}
      id={`owner-${spec.name}`}
      label={spec.label}
      type={spec.type ?? 'text'}
      multiline={spec.multiline ?? false}
      hint={spec.hint}
      required={spec.name === 'displayName'}
      value={values[spec.name]}
      error={errorFor(spec.name)}
      onChange={(value) => {
        setValues((current) => ({ ...current, [spec.name]: value }));
        setNothingToSave(false);
      }}
    />
  );
  const spec = (name: TextKey) => TEXTS.find((item) => item.name === name) as TextSpec<TextKey>;

  return (
    <article className="sheet">
      <Breadcrumbs
        trail={[
          ['Directory', '/directory'],
          ['Owners', '/directory/owners'],
          ...(initial === null
            ? []
            : ([[initial.displayName, `/directory/owners/${initial.id}`]] as const)),
          [initial === null ? 'New owner' : 'Edit', null],
        ]}
      />
      <h1>{initial === null ? 'New owner' : `Edit ${initial.displayName}`}</h1>
      <p className="page-intro">
        {initial === null
          ? 'Only a display name is required. An owner can exist before its legal subject is known.'
          : 'Only changed fields are sent. Clearing a field removes its value.'}
      </p>
      {submission.conflict && onReload && (
        <ConflictNotice recordLabel="owner" onReload={onReload} />
      )}
      <ValidationSummary
        issues={issues}
        label={labelOf}
        fieldId={(path) => fieldIdFor('owner', path)}
      />
      {submission.error !== null && issues.length === 0 && (
        <ErrorNotice error={submission.error} recordLabel="owner" focusOnShow />
      )}
      {nothingToSave && (
        <p role="status" className="notice notice-quiet">
          Nothing to save: no field was changed.
        </p>
      )}
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="record-form">
        <fieldset className="fieldset">
          <legend>Name</legend>
          {field(spec('displayName'))}
          <LinesField
            id="owner-aliases"
            label="Aliases"
            hint="One per line. Other names are matching hints only; nothing is merged or inferred from them."
            value={aliases}
            error={errorFor('aliases')}
            onChange={(value) => {
              setAliases(value);
              setNothingToSave(false);
            }}
          />
        </fieldset>
        <fieldset className="fieldset">
          <legend>Contact</legend>
          <div className="field-grid">
            {field(spec('contactName'))}
            {field(spec('contactEmail'))}
            {field(spec('preferredLanguage'))}
          </div>
        </fieldset>
        <ChannelsField
          idPrefix="owner"
          rows={channels}
          errorFor={errorFor}
          onChange={(rows) => {
            setChannels(rows);
            setNothingToSave(false);
          }}
        />
        <fieldset className="fieldset">
          <legend>Links</legend>
          <div className="field-grid">
            {field(spec('websiteUrl'))}
            {field(spec('driveFolderUrl'))}
          </div>
        </fieldset>
        {field(spec('notes'))}
        <div className="form-actions">
          <button type="submit" className="button-primary" disabled={submission.pending}>
            {submission.pending
              ? 'Saving…'
              : initial === null
                ? 'Create draft owner'
                : 'Save changes'}
          </button>
          <Link
            className="button button-quiet"
            to={initial === null ? '/directory/owners' : `/directory/owners/${initial.id}`}
          >
            Cancel
          </Link>
        </div>
      </form>
    </article>
  );
}
