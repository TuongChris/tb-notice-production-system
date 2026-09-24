// Shared pieces of the representation-authority pages (P3B): the scoped source picker, the display
// of a cited source (pinned to the exact revision it names), the action-scope field, recorded dates
// and the neutral wording every authority page uses. A source is offered only when its recorded
// scope includes the record (sources/scope.ts); the server checks again, including the owner
// material the page cannot see. Nothing here computes whether authority is current.
import { useId, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router';
import type { SourceReference } from '@tb/contracts';
import { Absent } from '../directory/agencies.js';
import {
  ACCESS_STATE_LABEL,
  ACTION_SCOPE_LABEL,
  formatDate,
  PROVENANCE_LABEL,
  SOURCE_ROLE_LABEL,
  VERSION_STATE_LABEL,
  VERSION_STATE_TONE,
} from '../directory/format.js';
import { useDirectoryApi, useLoad } from '../directory/hooks.js';
import { ErrorNotice, StateStamp } from '../directory/ui.js';
import { listAgencyOf, scopeReason, type SourceTarget } from '../sources/scope.js';

/** What every authority record is not (shown with each record). */
export const NOT_AUTHORITY =
  'A structured record of what cited sources are reported to support — not authority by existing, not a G1–G7 decision and not a signature.';
export const FROZEN_MEANING =
  'Frozen means only that the system record is immutable. It is not a signature, legal approval, owner confirmation, G1 decision or current authority.';
export const NO_CURRENTNESS =
  'Nothing here states that authority is current: that is never computed from dates, a frozen state, the highest version number or a missing end date.';
export const PREFERRED_COVERAGE_MEANING =
  'Preferred coverage is an operational default. Case authority is determined later.';

export type ActionScope = keyof typeof ACTION_SCOPE_LABEL;

export function VersionStamp({ state }: { state: keyof typeof VERSION_STATE_LABEL }) {
  return <StateStamp label={VERSION_STATE_LABEL[state]} tone={VERSION_STATE_TONE[state]} />;
}

/** A calendar date exactly as recorded, or an explicit "Not recorded". */
export function RecordedDate({ value }: { value: string | null }) {
  if (value === null) return <Absent />;
  return (
    <time dateTime={value} title={value}>
      {formatDate(value)}
    </time>
  );
}

export function ActionScopeText({ scope }: { scope: readonly ActionScope[] | null }) {
  if (scope === null || scope.length === 0) return <Absent />;
  return <>{scope.map((value) => ACTION_SCOPE_LABEL[value]).join(', ')}</>;
}

/** Checkboxes for an action scope as the document states it (order of the vocabulary). */
export function ActionScopeField({
  idPrefix,
  legend,
  hint,
  value,
  onChange,
}: {
  idPrefix: string;
  legend: string;
  hint: string;
  value: readonly ActionScope[];
  onChange: (value: ActionScope[]) => void;
}) {
  const hintId = `${idPrefix}-hint`;
  const all = Object.keys(ACTION_SCOPE_LABEL) as ActionScope[];
  return (
    <fieldset className="fieldset checkbox-grid" aria-describedby={hintId}>
      <legend>{legend}</legend>
      <p id={hintId} className="hint">
        {hint}
      </p>
      <div className="checkbox-options">
        {all.map((scope) => (
          <label key={scope} className="checkbox">
            <input
              type="checkbox"
              id={`${idPrefix}-${scope}`}
              checked={value.includes(scope)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? all.filter((item) => item === scope || value.includes(item))
                    : value.filter((item) => item !== scope),
                )
              }
            />
            {ACTION_SCOPE_LABEL[scope]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function sourceMeta(source: SourceReference): string {
  return [
    SOURCE_ROLE_LABEL[source.sourceRole],
    `revision ${source.revision}`,
    source.agencyId === null ? 'shared source' : 'agency’s own source',
    ACCESS_STATE_LABEL[source.accessState].toLowerCase(),
    `reported provenance: ${PROVENANCE_LABEL[source.reportedProvenance].toLowerCase()}`,
  ].join(' · ');
}

/**
 * The exact source revision a record cites, with a note when the source now has a newer revision:
 * the record keeps citing the revision it names (it never follows a newer one).
 */
export function SourceCitation({ sourceId }: { sourceId: string | null }) {
  const api = useDirectoryApi();
  const [state] = useLoad(`citation:${sourceId ?? ''}`, async () => {
    if (sourceId === null) return null;
    const source = await api.sources.get(sourceId);
    const heads = await api.sources.list({ q: source.sourceGroupId, limit: 1 });
    return { source, head: heads.items[0] ?? null };
  });
  if (sourceId === null) return <Absent />;
  if (state.status === 'loading') return <span className="hint">Loading source…</span>;
  if (state.status === 'error') return <ErrorNotice error={state.error} recordLabel="source" />;
  const loaded = state.value;
  if (loaded === null) return <Absent />;
  const { source, head } = loaded;
  return (
    <span className="citation">
      <Link to={`/sources/${source.id}`}>{source.title}</Link>
      <span className="choice-meta"> {sourceMeta(source)}</span>
      {head !== null && head.id !== source.id && (
        <span className="hint citation-pinned">
          {' '}
          This record cites revision {source.revision}; the source now has revision {head.revision}.
          The citation does not move to it.
        </span>
      )}
    </span>
  );
}

interface Offered {
  readonly offered: SourceReference[];
  readonly outOfScope: number;
}

/**
 * A source picker limited to current sources whose recorded scope includes `target`. A value that
 * is not offered (for example an earlier revision a draft already cites) stays selected and is
 * shown as the current citation.
 */
export function SourceSelect({
  id,
  label,
  hint,
  target,
  value,
  onChange,
  error,
  required = false,
  noneLabel = 'No source',
}: {
  id: string;
  label: string;
  hint: string;
  target: SourceTarget | null;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  required?: boolean;
  noneLabel?: string;
}) {
  const api = useDirectoryApi();
  const searchId = useId();
  const [searchText, setSearchText] = useState('');
  const [q, setQ] = useState('');
  const agencyId = target === null ? undefined : listAgencyOf(target);
  const [state] = useLoad<Offered | null>(
    `source-select:${id}:${JSON.stringify(target)}:${q}`,
    async () => {
      if (target === null) return null;
      const page = await api.sources.list({
        ...(q ? { q } : {}),
        ...(agencyId ? { agencyId } : {}),
        limit: 25,
      });
      const details = await Promise.all(page.items.map((item) => api.sources.get(item.id)));
      const offered = details.filter((source) => scopeReason(source, target) === null);
      return { offered, outOfScope: details.length - offered.length };
    },
  );
  const [current] = useLoad(`source-select-current:${value}`, async () =>
    value === '' ? null : api.sources.get(value),
  );
  const offered = state.status === 'ready' && state.value !== null ? state.value.offered : [];
  const currentSource = current.status === 'ready' ? current.value : null;
  const extra =
    currentSource !== null && !offered.some((source) => source.id === currentSource.id)
      ? [currentSource]
      : [];
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  function runSearch() {
    setQ(searchText.trim());
  }

  function onSearchKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      runSearch();
    }
  }

  return (
    <div className={`field source-select${error ? ' field-invalid' : ''}`}>
      <label htmlFor={id}>
        {label}
        {required && <span className="required"> (required)</span>}
      </label>
      <p id={hintId} className="hint">
        {hint}
      </p>
      <div className="inline-search">
        <label htmlFor={searchId} className="visually-hidden">
          Find a source for {label.toLowerCase()}
        </label>
        <input
          id={searchId}
          type="search"
          placeholder="Find a source by title"
          value={searchText}
          autoComplete="off"
          disabled={target === null}
          onChange={(event) => setSearchText(event.target.value)}
          onKeyDown={onSearchKey}
        />
        <button type="button" onClick={runSearch} disabled={target === null}>
          Find
        </button>
      </div>
      <select
        id={id}
        name={id}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${hintId} ${errorId}` : hintId}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{target === null ? 'Choose the record first' : noneLabel}</option>
        {extra.map((source) => (
          <option key={source.id} value={source.id}>
            {`Current citation: ${source.title} (revision ${source.revision})`}
          </option>
        ))}
        {offered.map((source) => (
          <option key={source.id} value={source.id}>
            {`${source.title} — revision ${source.revision}, ${PROVENANCE_LABEL[source.reportedProvenance].toLowerCase()}`}
          </option>
        ))}
      </select>
      {state.status === 'loading' && target !== null && (
        <p className="hint">Loading applicable sources…</p>
      )}
      {state.status === 'error' && <ErrorNotice error={state.error} recordLabel="source" />}
      {state.status === 'ready' && state.value !== null && (
        <p className="hint">
          {state.value.offered.length === 0
            ? `No applicable source${q ? ` matches “${q}”` : ''}. `
            : ''}
          {state.value.outOfScope > 0
            ? `${state.value.outOfScope} source${state.value.outOfScope === 1 ? '' : 's'} outside this record’s scope not offered. `
            : ''}
          <Link to="/sources/new">Record a source</Link> if the document is not in the registry yet.
        </p>
      )}
      {error && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}

/** "you" for the signed-in User, otherwise the recording application user's id (never a Signer). */
export function RecordedBy({ userId, currentUserId }: { userId: string; currentUserId: string }) {
  return userId === currentUserId ? (
    <span>you (application user)</span>
  ) : (
    <span>
      application user <code>{userId}</code>
    </span>
  );
}
