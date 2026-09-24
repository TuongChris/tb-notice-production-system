// A directory list: search text in the URL (?q=), keyset pages walked with the server's cursors
// (a stack, so "Previous page" returns exactly), and explicit loading, empty and failure states.
// A cursor is only valid for the filters it was issued with, so changing the search or page size
// starts again at page 1.
import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { ListQuery, Page } from '../api/directory.js';
import { useLoad } from './hooks.js';
import { useFlashMessage } from './record-page.js';
import { ErrorNotice, LoadingNotice, PageHeading, Pager, SearchForm, StatusNotice } from './ui.js';

export interface Column<T> {
  readonly header: string;
  readonly cell: (item: T) => ReactNode;
}

export function DirectoryList<T extends { readonly id: string }>({
  title,
  intro,
  noun,
  searchLabel,
  newLabel,
  newTo,
  columns,
  load,
  filterKey = '',
  filters,
  emptyText,
}: {
  title: string;
  intro: ReactNode;
  /** Plural noun for messages, e.g. "agencies". */
  noun: string;
  searchLabel: string;
  newLabel?: string;
  newTo?: string;
  columns: readonly Column<T>[];
  load: (query: ListQuery) => Promise<Page<T>>;
  /** Extra filters that shape the list (reset paging when they change). */
  filterKey?: string;
  filters?: ReactNode;
  emptyText: ReactNode;
}) {
  const [params, setParams] = useSearchParams();
  const flash = useFlashMessage();
  const q = params.get('q') ?? '';
  const [limit, setLimit] = useState(25);
  const key = `${q}\u0000${limit}\u0000${filterKey}`;
  const [paging, setPaging] = useState<{ key: string; stack: Array<string | undefined> }>({
    key,
    stack: [undefined],
  });
  const stack = paging.key === key ? paging.stack : [undefined];
  const cursor = stack[stack.length - 1];
  const [state, reload] = useLoad(`${key}\u0000${cursor ?? ''}`, () =>
    load({ ...(q ? { q } : {}), limit, ...(cursor ? { cursor } : {}) }),
  );

  function search(value: string) {
    const next = new URLSearchParams(params);
    if (value === '') next.delete('q');
    else next.set('q', value);
    setParams(next);
  }

  return (
    <>
      <PageHeading
        title={title}
        intro={intro}
        actions={
          newTo && newLabel ? (
            <Link className="button button-primary" to={newTo}>
              {newLabel}
            </Link>
          ) : undefined
        }
      />
      <StatusNotice message={flash} />
      <div className="list-tools">
        <SearchForm label={searchLabel} value={q} onSearch={search} />
        {filters}
      </div>
      {state.status === 'loading' && <LoadingNotice label={`Loading ${noun}…`} />}
      {state.status === 'error' && <ErrorNotice error={state.error} onRetry={reload} />}
      {state.status === 'ready' && state.value.items.length === 0 && (
        <div className="empty" data-testid="empty-state">
          {q !== '' ? (
            <p>
              No {noun} match “{q}”.{' '}
              <button type="button" className="button-link" onClick={() => search('')}>
                Clear search
              </button>
            </p>
          ) : (
            emptyText
          )}
        </div>
      )}
      {state.status === 'ready' && state.value.items.length > 0 && (
        <>
          <div className="table-frame">
            <table className="records">
              <caption className="visually-hidden">{title}</caption>
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column.header} scope="col">
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.value.items.map((item) => (
                  <tr key={item.id}>
                    {columns.map((column, index) =>
                      index === 0 ? (
                        <th key={column.header} scope="row">
                          {column.cell(item)}
                        </th>
                      ) : (
                        <td key={column.header}>{column.cell(item)}</td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager
            pageNumber={stack.length}
            shown={state.value.items.length}
            hasPrevious={stack.length > 1}
            hasNext={state.value.nextCursor !== null}
            onPrevious={() => setPaging({ key, stack: stack.slice(0, -1) })}
            onNext={() => {
              const next = state.value.nextCursor;
              if (next !== null) setPaging({ key, stack: [...stack, next] });
            }}
            limit={limit}
            onLimit={setLimit}
          />
        </>
      )}
    </>
  );
}
