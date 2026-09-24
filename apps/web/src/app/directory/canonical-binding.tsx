// Canonical identity source of a record (P3A): which SourceReference holds the record's canonical
// code. The section shows the current binding (and whether its source has a newer revision), or
// offers "Bind canonical source". The dialog lists only current canonical records whose recorded
// scope includes this record; the server checks everything again (scope, owner material, code
// uniqueness, version). A binding is an identity/reference association only — it establishes no
// rights, authority, eligibility or permission — and it is never replaced here: a correction needs
// a reconciliation workflow that does not exist yet.
import { useEffect, useId, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link } from 'react-router';
import type {
  CanonicalBindingRequest,
  SourceReference,
  SourceReferenceSummary,
} from '@tb/contracts';
import { ApiError } from '../api/client.js';
import type { Versioned, WriteAuth } from '../api/directory.js';
import { listAgencyOf, scopeReason, type SourceTarget } from '../sources/scope.js';
import { TextField } from './fields.js';
import {
  ACCESS_STATE_LABEL,
  BINDING_STATE_LABEL,
  PROVENANCE_LABEL,
  SOURCE_ROLE_LABEL,
} from './format.js';
import { useDirectoryApi, useIntentKey, useLoad, useWrite } from './hooks.js';
import { Details, Dialog, ErrorNotice, Section, UnavailableAction } from './ui.js';

interface Bindable {
  readonly id: string;
  readonly canonicalCode: string | null;
  readonly canonicalSourceId: string | null;
  readonly bindingState: 'LOCAL_ONLY' | 'SOURCE_REFERENCED' | 'DIVERGENT';
}

export function isBound(record: Bindable): boolean {
  return (
    record.canonicalCode !== null ||
    record.canonicalSourceId !== null ||
    record.bindingState !== 'LOCAL_ONLY'
  );
}

const MEANING =
  'Records which source holds the canonical code. It is an identity reference only: it does not establish rights, authority, eligibility or permission.';

export function CanonicalBindingSection<T extends Bindable>({
  noun,
  record,
  archived,
  target,
  bind,
  onBound,
  onConflict,
}: {
  /** e.g. "agency", "owner namespace", "route". */
  noun: string;
  record: Versioned<T>;
  archived: boolean;
  target: SourceTarget;
  bind: (body: CanonicalBindingRequest, ifMatch: string, auth: WriteAuth) => Promise<Versioned<T>>;
  onBound: (next: Versioned<T>, message: string) => void;
  onConflict: () => void;
}) {
  const [open, setOpen] = useState(false);
  const bound = isBound(record.data);
  return (
    <Section title="Canonical identity source">
      <p className="hint">{MEANING}</p>
      {bound ? (
        <BoundSource record={record.data} />
      ) : (
        <>
          <p className="absent">No canonical binding: this {noun} is local only.</p>
          {archived ? (
            <UnavailableAction
              label="Bind canonical source"
              reason={`Archived records are read-only. Restore the ${noun} first.`}
            />
          ) : (
            <button type="button" onClick={() => setOpen(true)}>
              Bind canonical source
            </button>
          )}
        </>
      )}
      <BindDialog
        open={open}
        noun={noun}
        record={record}
        target={target}
        bind={bind}
        onCancel={() => setOpen(false)}
        onBound={(next) => {
          setOpen(false);
          onBound(next, 'Canonical source bound.');
        }}
        onConflict={() => {
          setOpen(false);
          onConflict();
        }}
      />
    </Section>
  );
}

function BoundSource({ record }: { record: Bindable }) {
  const api = useDirectoryApi();
  const sourceId = record.canonicalSourceId;
  const [state] = useLoad(`bound-source:${sourceId ?? ''}`, async () => {
    if (sourceId === null) return null;
    const source = await api.sources.get(sourceId);
    // The current revision of the source's chain (the list returns current revisions only).
    const heads = await api.sources.list({ q: source.sourceGroupId, limit: 1 });
    return { source, head: heads.items[0] ?? null };
  });
  const loaded = state.status === 'ready' ? state.value : null;
  return (
    <>
      <Details
        rows={[
          ['Canonical code', record.canonicalCode],
          [
            'Source',
            sourceId === null ? null : (
              <Link to={`/sources/${sourceId}`}>
                {loaded?.source.title ?? 'Open source record'}
                {loaded ? ` (revision ${loaded.source.revision})` : ''}
              </Link>
            ),
          ],
          ['Binding', BINDING_STATE_LABEL[record.bindingState]],
        ]}
      />
      {loaded?.head && loaded.head.id !== loaded.source.id && (
        <p className="notice notice-quiet">
          The source now has a newer revision ({loaded.head.revision}). This binding keeps pointing
          at revision {loaded.source.revision}; changing it needs a reconciliation workflow that
          isn’t available yet.
        </p>
      )}
      {state.status === 'error' && <ErrorNotice error={state.error} recordLabel="source" />}
      <p className="hint">
        A binding is not replaced here: correcting it needs a reconciliation workflow that isn’t
        available yet.
      </p>
    </>
  );
}

interface Candidates {
  readonly offered: SourceReference[];
  readonly notCanonical: number;
  readonly outOfScope: number;
}

/** The binding dialog; the case page reuses it with the case's own display of the binding. */
export function BindDialog<T extends { readonly id: string }>({
  open,
  noun,
  record,
  target,
  bind,
  onCancel,
  onBound,
  onConflict,
}: {
  open: boolean;
  noun: string;
  record: Versioned<T>;
  target: SourceTarget;
  bind: (body: CanonicalBindingRequest, ifMatch: string, auth: WriteAuth) => Promise<Versioned<T>>;
  onCancel: () => void;
  onBound: (next: Versioned<T>) => void;
  onConflict: () => void;
}) {
  const api = useDirectoryApi();
  const write = useWrite();
  const intent = useIntentKey();
  const searchId = useId();
  const [searchText, setSearchText] = useState('');
  const [q, setQ] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [code, setCode] = useState('');
  const [reason, setReason] = useState('');
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (open) {
      setSearchText('');
      setQ('');
      setSourceId('');
      setCode('');
      setReason('');
      setProblems({});
      setError(null);
    }
  }, [open]);

  const agencyId = listAgencyOf(target);
  const [candidates] = useLoad<Candidates | null>(
    `bind-candidates:${open ? 'open' : 'closed'}:${record.data.id}:${q}`,
    async () => {
      if (!open) return null;
      const page = await api.sources.list({
        ...(q ? { q } : {}),
        ...(agencyId ? { agencyId } : {}),
        limit: 25,
      });
      const canonical = page.items.filter(
        (item: SourceReferenceSummary) => item.sourceRole === 'CANONICAL_RECORD',
      );
      const details = await Promise.all(canonical.map((item) => api.sources.get(item.id)));
      const offered = details.filter((source) => scopeReason(source, target) === null);
      return {
        offered,
        notCanonical: page.items.length - canonical.length,
        outOfScope: canonical.length - offered.length,
      };
    },
  );

  function runSearch() {
    setQ(searchText.trim());
    setSourceId('');
  }

  function onSearchKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      runSearch();
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found: Record<string, string> = {};
    if (sourceId === '') found['sourceId'] = 'Choose the source that holds the canonical code.';
    if (code.trim() === '')
      found['canonicalCode'] = 'Enter the canonical code as the source shows it.';
    if (reason.trim() === '') found['reason'] = 'Enter a reason. It is kept in the audit trail.';
    setProblems(found);
    const first = Object.keys(found)[0];
    if (first !== undefined) {
      document.getElementById(`bind-${first}`)?.focus();
      return;
    }
    const body: CanonicalBindingRequest = { canonicalCode: code.trim(), sourceId, reason };
    setPending(true);
    setError(null);
    try {
      const next = await write(
        intent.keyFor({ id: record.data.id, etag: record.etag, body }),
        (auth) => bind(body, record.etag, auth),
      );
      intent.done();
      onBound(next);
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 412) onConflict();
      else setError(failure);
    } finally {
      setPending(false);
    }
  }

  const list = candidates.status === 'ready' ? candidates.value : null;
  return (
    <Dialog
      open={open}
      title="Bind canonical source"
      busy={pending}
      onCancel={onCancel}
      description={
        <p>
          Choose the source that holds this {noun}’s canonical code and enter the code exactly as
          the source shows it. {MEANING}
        </p>
      }
    >
      <form noValidate onSubmit={(event) => void submit(event)} className="dialog-form">
        <div className="field">
          <label htmlFor={searchId}>Find a source</label>
          <div className="inline-search">
            <input
              id={searchId}
              type="search"
              value={searchText}
              data-autofocus
              autoComplete="off"
              onChange={(event) => setSearchText(event.target.value)}
              onKeyDown={onSearchKey}
            />
            <button type="button" onClick={runSearch}>
              Search
            </button>
          </div>
        </div>
        <fieldset className="fieldset source-choice" aria-describedby="bind-sourceId-hint">
          <legend>Source</legend>
          <p id="bind-sourceId-hint" className="hint">
            Only current canonical records whose recorded scope includes this {noun} are offered.
          </p>
          {candidates.status === 'loading' && (
            <p className="notice notice-quiet">Loading sources…</p>
          )}
          {candidates.status === 'error' && (
            <ErrorNotice error={candidates.error} recordLabel="source" />
          )}
          {list !== null && list.offered.length === 0 && (
            <p className="absent">
              No applicable source{q ? ` matches “${q}”` : ''}.{' '}
              <Link to="/sources/new">Record a source</Link> first if the canonical record is not in
              the registry yet.
            </p>
          )}
          {list !== null &&
            list.offered.map((source, index) => (
              <label key={source.id} className="choice">
                <input
                  type="radio"
                  name="bind-source"
                  id={index === 0 ? 'bind-sourceId' : undefined}
                  value={source.id}
                  checked={sourceId === source.id}
                  onChange={() => setSourceId(source.id)}
                />
                <span className="choice-text">
                  <span className="choice-title">{source.title}</span>
                  <span className="choice-meta">
                    {SOURCE_ROLE_LABEL[source.sourceRole]} · revision {source.revision} ·{' '}
                    {source.agencyId === null ? 'shared source' : 'this agency’s own source'} ·{' '}
                    {ACCESS_STATE_LABEL[source.accessState].toLowerCase()} · reported provenance:{' '}
                    {PROVENANCE_LABEL[source.reportedProvenance].toLowerCase()}
                  </span>
                </span>
              </label>
            ))}
          {list !== null && list.notCanonical + list.outOfScope > 0 && (
            <p className="hint">
              Not offered: {list.notCanonical} source{list.notCanonical === 1 ? '' : 's'} not
              recorded as canonical records, {list.outOfScope} outside this {noun}’s scope.
            </p>
          )}
          {problems['sourceId'] && <p className="field-error">{problems['sourceId']}</p>}
        </fieldset>
        <TextField
          id="bind-canonicalCode"
          label="Canonical code"
          required
          hint="Exactly as written in the source. The app never allocates canonical codes."
          value={code}
          error={problems['canonicalCode']}
          onChange={setCode}
        />
        <TextField
          id="bind-reason"
          label="Reason"
          required
          multiline
          hint="Kept in the audit trail."
          value={reason}
          error={problems['reason']}
          onChange={setReason}
        />
        {error !== null && <ErrorNotice error={error} recordLabel={noun} />}
        <div className="dialog-actions">
          <button type="button" onClick={onCancel} disabled={pending}>
            Cancel
          </button>
          <button type="submit" className="button-primary" disabled={pending}>
            {pending ? 'Binding…' : 'Bind canonical source'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
