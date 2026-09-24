// Lifecycle actions of a directory record: explicit state change, archive/restore and deletion of
// an unused draft, each confirmed in a dialog, sent with the record's ETag and one Idempotency-Key
// per intent. Canonical binding has its own section (canonical-binding.tsx). The copy says what each action does NOT do (grant authority, revive authority).
// A 412 closes the dialog and hands over to the page's version-conflict notice.
import { useState, type ReactNode } from 'react';
import { ApiError } from '../api/client.js';
import type { Versioned, WriteAuth } from '../api/directory.js';
import { SIGNER_STATE_LABEL } from './format.js';
import { SelectField } from './fields.js';
import { useIntentKey, useWrite } from './hooks.js';
import { ConfirmDialog, ReasonDialog, UnavailableAction } from './ui.js';

export type Operation = 'state' | 'archive' | 'restore' | 'delete' | 'link-state';

export interface ActionApi<T> {
  archive(
    id: string,
    body: { reason: string },
    ifMatch: string,
    auth: WriteAuth,
  ): Promise<Versioned<T>>;
  restore(
    id: string,
    body: { reason: string },
    ifMatch: string,
    auth: WriteAuth,
  ): Promise<Versioned<T>>;
  remove(id: string, ifMatch: string, auth: WriteAuth): Promise<void>;
}

/**
 * One confirmed operation on a record: its dialog, pending and error state, and one Idempotency-Key
 * per intent. A 412 closes the dialog and raises the page's version-conflict notice.
 */
export function useRecordOperation(
  record: Versioned<{ readonly id: string }>,
  onConflict: () => void,
) {
  const write = useWrite();
  const intent = useIntentKey();
  const [open, setOpen] = useState<Operation | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function run<R>(
    operation: Operation,
    payload: unknown,
    perform: (auth: WriteAuth) => Promise<R>,
    done: (result: R) => void,
  ) {
    setPending(true);
    setError(null);
    try {
      const key = intent.keyFor({ operation, id: record.data.id, etag: record.etag, payload });
      const result = await write(key, perform);
      intent.done();
      setOpen(null);
      done(result);
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 412) {
        setOpen(null);
        onConflict();
      } else {
        setError(failure);
      }
    } finally {
      setPending(false);
    }
  }

  return {
    open,
    pending,
    error,
    show: (operation: Operation) => {
      setError(null);
      setOpen(operation);
    },
    close: () => setOpen(null),
    run,
  };
}

/** Actions of Agency, Owner and LegalSubject (RecordState DRAFT | ACTIVE | ARCHIVED). */
export function RecordStateActions<
  T extends {
    readonly id: string;
    readonly recordState: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
    readonly canonicalCode: string | null;
    readonly canonicalSourceId: string | null;
    readonly bindingState: string;
  },
>({
  noun,
  record,
  api,
  onChanged,
  onDeleted,
  onConflict,
  edit,
  deleteBlocker = null,
}: {
  noun: string;
  /** Why this record is known not to be an unused draft (e.g. it lists linked records). */
  deleteBlocker?: string | null;
  record: Versioned<T>;
  api: ActionApi<T> & {
    setState(
      id: string,
      body: { state: 'DRAFT' | 'ACTIVE'; reason: string },
      ifMatch: string,
      auth: WriteAuth,
    ): Promise<Versioned<T>>;
  };
  onChanged: (next: Versioned<T>, message: string) => void;
  onDeleted: () => void;
  onConflict: () => void;
  edit: ReactNode;
}) {
  const operation = useRecordOperation(record, onConflict);
  const { recordState } = record.data;
  const bound =
    record.data.canonicalCode !== null ||
    record.data.canonicalSourceId !== null ||
    record.data.bindingState !== 'LOCAL_ONLY';
  const target = recordState === 'ACTIVE' ? 'DRAFT' : 'ACTIVE';
  return (
    <div className="record-actions" role="group" aria-label={`Actions for this ${noun}`}>
      {recordState !== 'ARCHIVED' && edit}
      {recordState !== 'ARCHIVED' && (
        <button type="button" onClick={() => operation.show('state')}>
          {target === 'ACTIVE' ? 'Mark active' : 'Return to draft'}
        </button>
      )}
      {recordState !== 'ARCHIVED' ? (
        <button type="button" onClick={() => operation.show('archive')}>
          Archive
        </button>
      ) : (
        <button type="button" onClick={() => operation.show('restore')}>
          Restore
        </button>
      )}
      {recordState === 'DRAFT' &&
        !bound &&
        (deleteBlocker === null ? (
          <button
            type="button"
            className="button-danger-quiet"
            onClick={() => operation.show('delete')}
          >
            Delete draft
          </button>
        ) : (
          <UnavailableAction label="Delete draft" reason={deleteBlocker} />
        ))}

      <ReasonDialog
        open={operation.open === 'state'}
        title={target === 'ACTIVE' ? `Mark this ${noun} active` : `Return this ${noun} to draft`}
        description={
          target === 'ACTIVE' ? (
            <p>
              Active means the record is in use in the directory. It does not grant any authority,
              satisfy any review gate or make anything ready to send.
            </p>
          ) : (
            <p>The record stays in the directory as a draft. Nothing that refers to it changes.</p>
          )
        }
        confirmLabel={target === 'ACTIVE' ? 'Mark active' : 'Return to draft'}
        recordLabel={noun}
        pending={operation.pending}
        error={operation.error}
        onCancel={operation.close}
        onConfirm={(reason) =>
          void operation.run(
            'state',
            { state: target, reason },
            (auth) => api.setState(record.data.id, { state: target, reason }, record.etag, auth),
            (next) =>
              onChanged(next, target === 'ACTIVE' ? `Marked active.` : 'Returned to draft.'),
          )
        }
      />
      <ReasonDialog
        open={operation.open === 'archive'}
        title={`Archive this ${noun}`}
        description={
          <p>
            Archiving keeps the record and its history but makes it read-only. Linked records are
            not archived with it, and nothing is revoked or sent.
          </p>
        }
        confirmLabel="Archive"
        recordLabel={noun}
        pending={operation.pending}
        error={operation.error}
        onCancel={operation.close}
        onConfirm={(reason) =>
          void operation.run(
            'archive',
            { reason },
            (auth) => api.archive(record.data.id, { reason }, record.etag, auth),
            (next) => onChanged(next, 'Archived.'),
          )
        }
      />
      <ReasonDialog
        open={operation.open === 'restore'}
        title={`Restore this ${noun}`}
        description={
          <p>
            The record returns as a draft. Restoring an administrative record never revives any
            authority.
          </p>
        }
        confirmLabel="Restore as draft"
        recordLabel={noun}
        pending={operation.pending}
        error={operation.error}
        onCancel={operation.close}
        onConfirm={(reason) =>
          void operation.run(
            'restore',
            { reason },
            (auth) => api.restore(record.data.id, { reason }, record.etag, auth),
            (next) => onChanged(next, 'Restored as a draft.'),
          )
        }
      />
      <ConfirmDialog
        open={operation.open === 'delete'}
        title={`Delete this draft ${noun}?`}
        description={
          <p>
            Only an unused draft can be deleted, and deletion can’t be undone. If anything refers to
            this {noun}, the server refuses and you can archive it instead.
          </p>
        }
        confirmLabel={`Delete draft ${noun}`}
        recordLabel={noun}
        pending={operation.pending}
        error={operation.error}
        onCancel={operation.close}
        onConfirm={() =>
          void operation.run(
            'delete',
            null,
            (auth) => api.remove(record.data.id, record.etag, auth),
            () => onDeleted(),
          )
        }
      />
    </div>
  );
}

type SignerState = keyof typeof SIGNER_STATE_LABEL;

/** Actions of a Signer: operational state (any other state, with a reason) and archive flag. */
export function SignerActions<
  T extends {
    readonly id: string;
    readonly operationalState: SignerState;
    readonly archivedAt: string | null;
    readonly canonicalCode: string | null;
    readonly canonicalSourceId: string | null;
    readonly bindingState: string;
  },
>({
  record,
  api,
  onChanged,
  onDeleted,
  onConflict,
  edit,
}: {
  record: Versioned<T>;
  api: ActionApi<T> & {
    setState(
      id: string,
      body: { state: SignerState; reason: string },
      ifMatch: string,
      auth: WriteAuth,
    ): Promise<Versioned<T>>;
  };
  onChanged: (next: Versioned<T>, message: string) => void;
  onDeleted: () => void;
  onConflict: () => void;
  edit: ReactNode;
}) {
  const operation = useRecordOperation(record, onConflict);
  const { operationalState, archivedAt } = record.data;
  const others = (Object.keys(SIGNER_STATE_LABEL) as SignerState[]).filter(
    (state) => state !== operationalState,
  );
  const [nextState, setNextState] = useState<SignerState>(others[0] ?? 'DRAFT');
  const archived = archivedAt !== null;
  const bound =
    record.data.canonicalCode !== null ||
    record.data.canonicalSourceId !== null ||
    record.data.bindingState !== 'LOCAL_ONLY';
  return (
    <div className="record-actions" role="group" aria-label="Actions for this signer">
      {!archived && edit}
      {!archived && (
        <button
          type="button"
          onClick={() => {
            setNextState(others[0] ?? 'DRAFT');
            operation.show('state');
          }}
        >
          Change operational state
        </button>
      )}
      {!archived ? (
        <button type="button" onClick={() => operation.show('archive')}>
          Archive
        </button>
      ) : (
        <button type="button" onClick={() => operation.show('restore')}>
          Restore
        </button>
      )}
      {operationalState === 'DRAFT' && !archived && !bound && (
        <button
          type="button"
          className="button-danger-quiet"
          onClick={() => operation.show('delete')}
        >
          Delete draft
        </button>
      )}

      <ReasonDialog
        open={operation.open === 'state'}
        title="Change operational state"
        description={
          <p>
            Operational state is an administrative note only. No state gives mandate coverage,
            eligibility, G7 clearance, signature authority or the right to adopt a notice.
          </p>
        }
        confirmLabel="Change state"
        recordLabel="signer"
        pending={operation.pending}
        error={operation.error}
        onCancel={operation.close}
        onConfirm={(reason) =>
          void operation.run(
            'state',
            { state: nextState, reason },
            (auth) => api.setState(record.data.id, { state: nextState, reason }, record.etag, auth),
            (next) =>
              onChanged(next, `Operational state changed to ${SIGNER_STATE_LABEL[nextState]}.`),
          )
        }
      >
        <SelectField
          id="signer-next-state"
          label="New state"
          value={nextState}
          options={others.map((state) => ({ value: state, label: SIGNER_STATE_LABEL[state] }))}
          onChange={(value) => setNextState(value as SignerState)}
        />
      </ReasonDialog>
      <ReasonDialog
        open={operation.open === 'archive'}
        title="Archive this signer"
        description={
          <p>
            Archiving keeps the record and its history but makes it read-only. Its operational state
            is kept as it is.
          </p>
        }
        confirmLabel="Archive"
        recordLabel="signer"
        pending={operation.pending}
        error={operation.error}
        onCancel={operation.close}
        onConfirm={(reason) =>
          void operation.run(
            'archive',
            { reason },
            (auth) => api.archive(record.data.id, { reason }, record.etag, auth),
            (next) => onChanged(next, 'Archived.'),
          )
        }
      />
      <ReasonDialog
        open={operation.open === 'restore'}
        title="Restore this signer"
        description={
          <p>The archive flag is cleared. The operational state and any authority are unchanged.</p>
        }
        confirmLabel="Restore"
        recordLabel="signer"
        pending={operation.pending}
        error={operation.error}
        onCancel={operation.close}
        onConfirm={(reason) =>
          void operation.run(
            'restore',
            { reason },
            (auth) => api.restore(record.data.id, { reason }, record.etag, auth),
            (next) => onChanged(next, 'Restored.'),
          )
        }
      />
      <ConfirmDialog
        open={operation.open === 'delete'}
        title="Delete this draft signer?"
        description={
          <p>
            Only an unused draft can be deleted, and deletion can’t be undone. If anything refers to
            this signer, the server refuses and you can archive it instead.
          </p>
        }
        confirmLabel="Delete draft signer"
        recordLabel="signer"
        pending={operation.pending}
        error={operation.error}
        onCancel={operation.close}
        onConfirm={() =>
          void operation.run(
            'delete',
            null,
            (auth) => api.remove(record.data.id, record.etag, auth),
            () => onDeleted(),
          )
        }
      />
    </div>
  );
}
