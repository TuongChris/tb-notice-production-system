// Case sources (P4A): the explicit association of one SourceReference with one case. A link means
// only "this source is associated with this case" — it reviews nothing, proves nothing and never
// changes the source's provenance. A link cites the exact source revision it names and never moves
// to a newer one. Pausing or unlinking keeps the row and the source; relinking is checked again
// against the case's current context. Only sources whose recorded scope includes this case are
// offered (sources/scope.ts); the server checks again, including another owner's material.
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { CaseRecord, CaseSource, LinkCaseSource, LinkStateRequest } from '@tb/contracts';
import { ApiError } from '../api/client.js';
import { etagOf } from '../api/directory.js';
import { Time } from '../directory/agencies.js';
import { fieldIdFor, SelectField, TextField } from '../directory/fields.js';
import {
  issuesOf,
  LINK_STATE_LABEL,
  LINK_STATE_TONE,
  PROVENANCE_LABEL,
} from '../directory/format.js';
import { useDirectoryApi, useIntentKey, useLoad, useWrite } from '../directory/hooks.js';
import { useSubmission, type FlashState } from '../directory/record-page.js';
import {
  Breadcrumbs,
  ConflictNotice,
  Dialog,
  ErrorNotice,
  LoadingNotice,
  Section,
  StateStamp,
  UnavailableAction,
  ValidationSummary,
} from '../directory/ui.js';
import { SourceCitation, SourceSelect } from '../representation/authority-ui.js';
import { CASE_SOURCE_MEANING, useCaseTarget } from './case-ui.js';

type LinkState = CaseSource['linkState'];
const LINK_STATES = Object.keys(LINK_STATE_LABEL) as LinkState[];

/** The sources linked to one case, every link state included, with their state changes. */
export function CaseSourcesSection({
  caseRecord,
  onCaseChanged,
}: {
  caseRecord: CaseRecord;
  /** A link change moved the case's version: the page reloads the case. */
  onCaseChanged: (message: string) => void;
}) {
  const api = useDirectoryApi();
  const archived = caseRecord.archivedAt !== null;
  const [state, reload] = useLoad(`case-sources:${caseRecord.id}:${caseRecord.rowVersion}`, () =>
    api.cases.sources.list(caseRecord.id, { limit: 100 }),
  );
  const [changing, setChanging] = useState<CaseSource | null>(null);
  return (
    <Section
      title="Linked sources"
      actions={
        archived ? (
          <UnavailableAction
            label="Link a source"
            reason="Archived cases are read-only. Restore the case first."
          />
        ) : (
          <Link className="button" to={`/cases/${caseRecord.id}/sources/new`}>
            Link a source
          </Link>
        )
      }
    >
      <p className="hint">{CASE_SOURCE_MEANING}</p>
      {state.status === 'loading' && <LoadingNotice label="Loading linked sources…" />}
      {state.status === 'error' && <ErrorNotice error={state.error} onRetry={reload} />}
      {state.status === 'ready' && state.value.items.length === 0 && (
        <p className="absent" data-testid="case-sources-empty">
          No source is linked to this case.
        </p>
      )}
      {state.status === 'ready' && state.value.items.length > 0 && (
        <div className="table-frame">
          <table className="records" data-testid="case-sources">
            <caption className="visually-hidden">Sources linked to this case</caption>
            <thead>
              <tr>
                <th scope="col">Source reference (exact revision)</th>
                <th scope="col">Recorded provenance</th>
                <th scope="col">Role</th>
                <th scope="col">Scope note</th>
                <th scope="col">Link</th>
                <th scope="col">Linked</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {state.value.items.map((link) => (
                <tr key={link.id}>
                  <th scope="row">
                    <SourceCitation sourceId={link.sourceId} />
                  </th>
                  <td>
                    <RecordedProvenance sourceId={link.sourceId} />
                  </td>
                  <td>{link.useRole}</td>
                  <td className="prose">{link.scopeNote}</td>
                  <td>
                    <StateStamp
                      label={LINK_STATE_LABEL[link.linkState]}
                      tone={LINK_STATE_TONE[link.linkState]}
                    />
                    {link.stateReason && <p className="hint">Reason: {link.stateReason}</p>}
                  </td>
                  <td>
                    <Time iso={link.createdAt} />
                  </td>
                  <td>
                    {archived ? null : (
                      <button type="button" onClick={() => setChanging(link)}>
                        Change link state
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <LinkStateDialog
        link={changing}
        onCancel={() => setChanging(null)}
        onChanged={(next) => {
          setChanging(null);
          onCaseChanged(`Link state changed to ${LINK_STATE_LABEL[next.linkState]}.`);
        }}
      />
    </Section>
  );
}

/** The provenance the source records, exactly as recorded (linking never changes it). */
function RecordedProvenance({ sourceId }: { sourceId: string }) {
  const api = useDirectoryApi();
  const [state] = useLoad(`case-source-provenance:${sourceId}`, () => api.sources.get(sourceId));
  if (state.status === 'loading') return <span className="hint">Loading…</span>;
  if (state.status === 'error') return <span className="absent">Not available</span>;
  return <>{PROVENANCE_LABEL[state.value.reportedProvenance]}</>;
}

function LinkStateDialog({
  link,
  onCancel,
  onChanged,
}: {
  link: CaseSource | null;
  onCancel: () => void;
  onChanged: (next: CaseSource) => void;
}) {
  const api = useDirectoryApi();
  const write = useWrite();
  const intent = useIntentKey();
  const others = LINK_STATES.filter((state) => state !== link?.linkState);
  const [nextState, setNextState] = useState<LinkState>('PAUSED');
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [conflict, setConflict] = useState(false);
  const linkId = link?.id ?? null;
  const firstOther = others[0] ?? 'PAUSED';
  useEffect(() => {
    setNextState(firstOther);
    setReason('');
    setProblem(null);
    setError(null);
    setConflict(false);
    // A new dialog for every link opened.
  }, [linkId, firstOther]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (link === null) return;
    if (reason.trim() === '') {
      setProblem('Enter a reason. It is kept in the audit trail.');
      return;
    }
    setProblem(null);
    const body: LinkStateRequest = { state: nextState, reason };
    const ifMatch = etagOf('CaseSource', link);
    setPending(true);
    setError(null);
    try {
      const next = await write(intent.keyFor({ id: link.id, ifMatch, body }), (auth) =>
        api.cases.sources.setLinkState(link.id, body, ifMatch, auth),
      );
      intent.done();
      onChanged(next.data);
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 412) setConflict(true);
      else setError(failure);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={link !== null}
      title="Change link state"
      busy={pending}
      onCancel={onCancel}
      description={
        <p>
          Pausing or unlinking keeps the link and the source; an unlinked source is not false or
          invalid, only no longer linked. Linking again is checked against the case as it is now.
        </p>
      }
    >
      <form noValidate onSubmit={(event) => void submit(event)} className="dialog-form">
        {conflict && (
          <p role="alert" className="notice notice-conflict">
            This link changed after the page loaded. Nothing was saved. Close this dialog and reload
            the case.
          </p>
        )}
        <SelectField
          id="case-source-next-state"
          label="New link state"
          value={nextState}
          options={others.map((state) => ({ value: state, label: LINK_STATE_LABEL[state] }))}
          onChange={(value) => setNextState(value as LinkState)}
        />
        <TextField
          id="case-source-state-reason"
          label="Reason"
          required
          multiline
          hint="Kept in the audit trail."
          value={reason}
          error={problem ?? undefined}
          onChange={setReason}
        />
        {error !== null && <ErrorNotice error={error} recordLabel="case" />}
        <div className="dialog-actions">
          <button type="button" onClick={onCancel} disabled={pending}>
            Cancel
          </button>
          <button type="submit" className="button-primary" disabled={pending || conflict}>
            {pending ? 'Saving…' : 'Change link state'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

const LABELS: Record<string, string> = {
  sourceId: 'Source to link',
  useRole: 'Role',
  scopeNote: 'Scope note',
};

export function LinkCaseSourcePage() {
  const { id = '' } = useParams();
  return <LinkCaseSource key={id} caseId={id} />;
}

function LinkCaseSource({ caseId }: { caseId: string }) {
  const api = useDirectoryApi();
  const navigate = useNavigate();
  const submission = useSubmission();
  const [state, reload] = useLoad(`case-link:${caseId}`, () => api.cases.get(caseId));
  const record = state.status === 'ready' ? state.value : null;
  const target = useCaseTarget(record?.data ?? null);
  const [sourceId, setSourceId] = useState('');
  const [useRole, setUseRole] = useState('');
  const [scopeNote, setScopeNote] = useState('');
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const issues = issuesOf(submission.error);
  const errorFor = (path: string) =>
    clientErrors[path] ?? issues.find((issue) => issue.path === path)?.message;
  if (state.status === 'loading') return <LoadingNotice label="Loading case…" />;
  if (state.status === 'error') {
    return <ErrorNotice error={state.error} recordLabel="case" onRetry={reload} />;
  }
  const item = state.value.data;
  const etag = state.value.etag;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problems: Record<string, string> = {};
    if (sourceId === '') problems['sourceId'] = 'Choose the source to link.';
    if (useRole.trim() === '') problems['useRole'] = 'Enter the role this source plays here.';
    if (scopeNote.trim() === '') problems['scopeNote'] = 'Describe what the source is linked for.';
    setClientErrors(problems);
    const first = Object.keys(problems)[0];
    if (first !== undefined) {
      document.getElementById(`case-source-${first}`)?.focus();
      return;
    }
    const body: LinkCaseSource = { sourceId, useRole: useRole.trim(), scopeNote };
    const outcome = await submission.submit({ caseId, etag, body }, (auth) =>
      api.cases.sources.link(caseId, body, etag, auth),
    );
    if (outcome.ok) {
      void navigate(`/cases/${caseId}`, {
        state: { flash: 'Source linked to this case.' } satisfies FlashState,
      });
    }
  }

  return (
    <article className="sheet">
      <Breadcrumbs
        trail={[
          ['Cases', '/cases'],
          [item.intakeLabel, `/cases/${caseId}`],
          ['Link a source', null],
        ]}
      />
      <h1>Link a source to this case</h1>
      <p className="page-intro">{CASE_SOURCE_MEANING}</p>
      {item.archivedAt !== null ? (
        <p className="notice notice-quiet">
          This case is archived, so no source can be linked. Restore the case first.
        </p>
      ) : (
        <>
          {submission.conflict && <ConflictNotice recordLabel="case" onReload={reload} />}
          <ValidationSummary
            issues={issues}
            label={(path) => LABELS[path.split('.')[0] ?? ''] ?? path}
            fieldId={(path) => fieldIdFor('case-source', path)}
          />
          {submission.error !== null && issues.length === 0 && (
            <ErrorNotice error={submission.error} recordLabel="case" focusOnShow />
          )}
          <form noValidate onSubmit={(event) => void onSubmit(event)} className="record-form">
            <SourceSelect
              id="case-source-sourceId"
              label="Source to link"
              required
              hint="Only sources whose recorded scope includes this case are offered: this agency’s own or shared with it, or scoped to this case; a source about particular legal subjects needs the case’s route to name that subject. The exact revision chosen stays linked."
              target={target.status === 'ready' ? target.value : null}
              value={sourceId}
              onChange={setSourceId}
              error={errorFor('sourceId')}
              noneLabel="Choose a source"
            />
            <TextField
              id="case-source-useRole"
              label="Role"
              required
              hint="A short label for how the case uses the source, for example PACKET or CONTEXT."
              value={useRole}
              error={errorFor('useRole')}
              onChange={setUseRole}
            />
            <TextField
              id="case-source-scopeNote"
              label="Scope note"
              required
              multiline
              hint="Which parts of the source matter for this case, in your words."
              value={scopeNote}
              error={errorFor('scopeNote')}
              onChange={setScopeNote}
            />
            <div className="form-actions">
              <button type="submit" className="button-primary" disabled={submission.pending}>
                {submission.pending ? 'Linking…' : 'Link source'}
              </button>
              <Link to={`/cases/${caseId}`}>Cancel</Link>
            </div>
          </form>
        </>
      )}
    </article>
  );
}
