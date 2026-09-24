// Presentational building blocks of the directory pages. Every state is explicit: loading, empty,
// failure and version conflict each have their own announced notice; unavailable capabilities stay
// visible but inert, with the reason next to them.
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { describeError, NOT_RECORDED, type FieldIssue, type Tone } from './format.js';

export function Breadcrumbs({ trail }: { trail: ReadonlyArray<readonly [string, string | null]> }) {
  return (
    <nav aria-label="Breadcrumb" className="breadcrumbs">
      <ol>
        {trail.map(([label, to]) => (
          <li key={`${label}:${to ?? ''}`}>
            {to === null ? <span aria-current="page">{label}</span> : <Link to={to}>{label}</Link>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageHeading({
  title,
  intro,
  actions,
}: {
  title: string;
  intro?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        {intro && <p className="page-intro">{intro}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function StateStamp({ label, tone }: { label: string; tone: Tone }) {
  return <span className={`stamp stamp-${tone}`}>{label}</span>;
}

/** The registry-extract header of one record: its name, state stamp, version and binding. */
export function RecordHeader({
  name,
  stamp,
  facts,
  boundary,
}: {
  name: string;
  stamp: ReactNode;
  facts: ReactNode[];
  boundary: ReactNode;
}) {
  return (
    <header className="record-header">
      <h1 className="record-name">{name}</h1>
      <div className="record-facts">
        {stamp}
        {facts.map((fact, index) => (
          <span key={index} className="record-fact">
            {fact}
          </span>
        ))}
      </div>
      <p className="record-boundary">{boundary}</p>
    </header>
  );
}

export function Details({ rows }: { rows: ReadonlyArray<readonly [string, ReactNode]> }) {
  return (
    <dl className="details">
      {rows.map(([term, value]) => (
        <div key={term} className="details-row">
          <dt>{term}</dt>
          <dd>
            {value === null || value === undefined || value === '' ? (
              <span className="absent">{NOT_RECORDED}</span>
            ) : (
              value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function Section({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const id = useId();
  return (
    <section className="sheet-section" aria-labelledby={id}>
      <div className="section-heading">
        <h2 id={id}>{title}</h2>
        {actions && <div className="section-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function LoadingNotice({ label }: { label: string }) {
  return (
    <p role="status" className="notice notice-quiet" data-testid="loading">
      {label}
    </p>
  );
}

export function StatusNotice({ message }: { message: string | null }) {
  // Always rendered so screen readers announce changes of the live region.
  return (
    <p role="status" className={message ? 'notice notice-success' : 'visually-hidden'}>
      {message ?? ''}
    </p>
  );
}

export function ErrorNotice({
  error,
  recordLabel,
  onRetry,
  focusOnShow,
}: {
  error: unknown;
  recordLabel?: string;
  onRetry?: () => void;
  /** Move focus here when shown (a failed submit at the bottom of a long form). */
  focusOnShow?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusOnShow) ref.current?.focus();
  }, [focusOnShow, error]);
  return (
    <div
      ref={ref}
      tabIndex={focusOnShow ? -1 : undefined}
      role="alert"
      className="notice notice-error"
      data-testid="error-notice"
    >
      <p>{describeError(error, recordLabel)}</p>
      {onRetry && (
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

/** 412: the record changed elsewhere; nothing was saved. */
export function ConflictNotice({
  recordLabel,
  onReload,
}: {
  recordLabel: string;
  onReload: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      className="notice notice-conflict"
      data-testid="conflict-notice"
    >
      <p>
        <strong>This {recordLabel} changed after you opened it</strong>, for example in another tab.
        Nothing was saved. Load the latest version, check it, and make your change again.
      </p>
      <button type="button" onClick={onReload}>
        Load latest version
      </button>
    </div>
  );
}

/** The form's issues at the top, each linking to its field (fieldId maps an issue path). */
export function ValidationSummary({
  issues,
  label,
  fieldId,
}: {
  issues: readonly FieldIssue[];
  label: (path: string) => string;
  fieldId: (path: string) => string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (issues.length > 0) ref.current?.focus();
  }, [issues]);
  if (issues.length === 0) return null;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      className="notice notice-error validation-summary"
      data-testid="validation-summary"
    >
      <p>
        <strong>Nothing was saved.</strong> Fix{' '}
        {issues.length === 1 ? 'this field' : 'these fields'}:
      </p>
      <ul>
        {issues.map((issue) => {
          const target = fieldId(issue.path);
          const text = `${label(issue.path)}: ${issue.message}`;
          return (
            <li key={`${issue.path}:${issue.message}`}>
              {target ? <a href={`#${target}`}>{text}</a> : text}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** A capability that exists in the contract but is not available in this phase. */
export function UnavailableAction({ label, reason }: { label: string; reason: string }) {
  const id = useId();
  return (
    <span className="unavailable-action">
      <button
        type="button"
        aria-disabled="true"
        aria-describedby={id}
        onClick={(event) => event.preventDefault()}
      >
        {label}
      </button>
      <span id={id} className="hint">
        {reason}
      </span>
    </span>
  );
}

export function Pager({
  pageNumber,
  shown,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  limit,
  onLimit,
}: {
  pageNumber: number;
  shown: number;
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  limit: number;
  onLimit: (limit: number) => void;
}) {
  const id = useId();
  return (
    <nav aria-label="Pagination" className="pager">
      <p className="pager-position">
        Page {pageNumber}, {shown} {shown === 1 ? 'record' : 'records'} shown
      </p>
      <label htmlFor={id} className="pager-size">
        Rows per page
        <select id={id} value={limit} onChange={(event) => onLimit(Number(event.target.value))}>
          {[25, 50, 100].map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
      <div className="pager-buttons">
        <button type="button" onClick={onPrevious} disabled={!hasPrevious}>
          Previous page
        </button>
        <button type="button" onClick={onNext} disabled={!hasNext}>
          Next page
        </button>
      </div>
    </nav>
  );
}

export function SearchForm({
  label,
  value,
  onSearch,
}: {
  label: string;
  value: string;
  onSearch: (value: string) => void;
}) {
  const id = useId();
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearch(text);
  }
  return (
    <form role="search" className="search" onSubmit={submit}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        autoComplete="off"
      />
      <button type="submit">Search</button>
      {value !== '' && (
        <button
          type="button"
          onClick={() => {
            setText('');
            onSearch('');
          }}
        >
          Clear search
        </button>
      )}
    </form>
  );
}

/**
 * Modal dialog on the native <dialog> element: the page behind is inert, Escape cancels, focus
 * starts in the dialog and returns to the control that opened it.
 */
export function Dialog({
  open,
  title,
  description,
  busy,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  busy?: boolean;
  onCancel: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      // Recorded before anything inside the dialog takes focus.
      opener.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
      opener.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onCancelEvent = (event: Event) => {
      event.preventDefault();
      if (!busy) onCancel();
    };
    dialog.addEventListener('cancel', onCancelEvent);
    return () => dialog.removeEventListener('cancel', onCancelEvent);
  }, [busy, onCancel]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      data-testid="dialog"
    >
      <h2 id={titleId}>{title}</h2>
      {description && (
        <div id={descriptionId} className="dialog-description">
          {description}
        </div>
      )}
      {open && children}
    </dialog>
  );
}

/** A confirmed change that must be explained: the reason is kept in the audit trail. */
export function ReasonDialog({
  open,
  title,
  description,
  confirmLabel,
  danger,
  pending,
  error,
  onConfirm,
  onCancel,
  children,
  canConfirm = true,
  recordLabel,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  recordLabel?: string;
  danger?: boolean;
  pending: boolean;
  error: unknown;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  children?: ReactNode;
  canConfirm?: boolean;
}) {
  const reasonId = useId();
  const problemId = useId();
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setReason('');
      setProblem(null);
    }
  }, [open]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reason.trim() === '') {
      setProblem('Enter a reason. It is kept in the audit trail.');
      return;
    }
    setProblem(null);
    onConfirm(reason);
  }
  return (
    <Dialog open={open} title={title} description={description} busy={pending} onCancel={onCancel}>
      <form noValidate onSubmit={submit} className="dialog-form">
        {children}
        <div className="field">
          <label htmlFor={reasonId}>Reason</label>
          <textarea
            id={reasonId}
            rows={3}
            value={reason}
            data-autofocus
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? problemId : undefined}
            onChange={(event) => setReason(event.target.value)}
          />
          {problem && (
            <p id={problemId} className="field-error">
              {problem}
            </p>
          )}
        </div>
        {error !== null && error !== undefined && (
          <ErrorNotice error={error} {...(recordLabel ? { recordLabel } : {})} />
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onCancel} disabled={pending}>
            Cancel
          </button>
          <button
            type="submit"
            className={danger ? 'button-danger' : 'button-primary'}
            disabled={pending || !canConfirm}
          >
            {pending ? 'Saving…' : confirmLabel}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  recordLabel,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  recordLabel?: string;
  pending: boolean;
  error: unknown;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} title={title} description={description} busy={pending} onCancel={onCancel}>
      {error !== null && error !== undefined && (
        <ErrorNotice error={error} {...(recordLabel ? { recordLabel } : {})} />
      )}
      <div className="dialog-actions">
        <button type="button" onClick={onCancel} disabled={pending} data-autofocus>
          Keep it
        </button>
        <button type="button" className="button-danger" onClick={onConfirm} disabled={pending}>
          {pending ? 'Deleting…' : confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
