// Shared pieces of the case intake pages (P4B): the permanent wording of what a reported item, a
// work, a use mapping and a case fact are — and are not — exact millisecond timecodes, recorded
// instants that are sent back unchanged when the operator does not touch them, and the safe
// not-found notice of a record asked for under the wrong case. Nothing here fetches a video, infers
// a party, matches works or computes readiness, a G1–G7 decision or an infringement finding.
import { Link } from 'react-router';
import type { ArchiveRequest, CaseWork, ReportedItem, UseMapping } from '@tb/contracts';
import type { Versioned, WriteAuth } from '../api/directory.js';
import { useRecordOperation } from '../directory/record-actions.js';
import { ReasonDialog, StateStamp, UnavailableAction } from '../directory/ui.js';

export const REPORTED_ITEM_MEANING =
  'A reported item records one YouTube video address named for this case, exactly as entered, with the video id read from the address. It is not a finding of infringement, and nothing is fetched from YouTube.';
export const WORK_MEANING =
  'A work records a copyrighted work named for this case, as entered. It does not establish ownership, authorship, registration or any right: rights assertions are separate, scoped facts.';
export const MAPPING_MEANING =
  'A use mapping records, as entered, which part of a work is reported to appear in which part of a reported item. It is shown as recorded, not as an infringement verdict: similarity alone is never infringement.';
export const FACT_MEANING =
  'A case fact is structured information recorded explicitly for this case, with its provenance exactly as entered. Nothing is inferred from silence, similarity, an address or a source’s existence, and a fact never carries over to another case.';
export const FACT_HISTORY =
  'Facts are revised, never edited: a new revision becomes the current one, and earlier revisions stay readable and unchanged.';
export const FACT_PROVENANCE =
  'Provenance and resolution state are stored exactly as chosen and never upgraded: “Missing”, “Conflict” and “Unassessed” stay what they are. “Document reviewed” needs a supporting linked source that records who reviewed the document.';
/** The contract gap reported at R9: FactSource rows are written but no operation returns them. */
export const FACT_SUPPORT_GAP =
  'The linked sources recorded as supporting a fact are stored with that revision, but the current API contract (TB-SCHEMA-API-v1.1.0) has no read that returns them, so they cannot be shown here. They are not lost, and they never change the fact’s provenance.';
export const NO_READINESS =
  'Nothing here computes readiness, a G1–G7 decision, an infringement finding or whether a notice can be sent.';
export const PERMISSION_SILENCE =
  'Permission is never inferred from silence: “No permission reported” records only what was reported.';
export const ARCHIVE_NO_CASCADE =
  'Archiving is administrative: the record stays exactly as it is, nothing that names it changes, and archiving is not a finding about it. An archived record is read-only until it is restored, and nothing new can name it.';
export const CASE_ARCHIVED_READ_ONLY = 'Archived cases are read-only. Restore the case first.';

/** Largest millisecond value the contract accepts (2^53 − 1). */
export const MAX_MILLISECONDS = 9007199254740991n;

const CLOCK = /^(?:(\d+):)?([0-5]?\d):([0-5]\d)(?:\.(\d{1,3}))?$/;

/**
 * Exact milliseconds (decimal string) of a clock time `h:mm:ss.fff` or `m:ss.fff` as the operator
 * typed it; null when the text is not such a time or exceeds the contract maximum. Integer
 * arithmetic only — nothing is rounded.
 */
export function clockToMs(text: string): string | null {
  const match = CLOCK.exec(text.trim());
  if (!match) return null;
  const [, hours = '0', minutes = '0', seconds = '0', fraction = ''] = match;
  const total =
    ((BigInt(hours) * 60n + BigInt(minutes)) * 60n + BigInt(seconds)) * 1000n +
    BigInt(fraction.padEnd(3, '0'));
  return total > MAX_MILLISECONDS ? null : total.toString();
}

/** `h:mm:ss.fff` of an exact millisecond value (decimal string). */
export function msToClock(ms: string): string {
  const total = BigInt(ms);
  const fraction = total % 1000n;
  const seconds = (total / 1000n) % 60n;
  const minutes = (total / 60000n) % 60n;
  const hours = total / 3600000n;
  const two = (value: bigint) => value.toString().padStart(2, '0');
  return `${hours}:${two(minutes)}:${two(seconds)}.${fraction.toString().padStart(3, '0')}`;
}

/** A millisecond value exactly as stored, with its clock reading (or an explicit "Not recorded"). */
export function Milliseconds({ value }: { value: string | null }) {
  if (value === null) return <span className="absent">Not recorded</span>;
  return (
    <span className="milliseconds">
      <span>{msToClock(value)}</span> <span className="hint">({value} ms)</span>
    </span>
  );
}

/** `datetime-local` text of a recorded instant (the viewer's local time, minute precision). */
export function instantInput(iso: string | null): string {
  if (iso === null) return '';
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * The instant to send for a `datetime-local` entry: the recorded value exactly as it was when the
 * operator left the field untouched (so seconds and milliseconds are never cut), null when cleared.
 */
export function instantValue(local: string, initial: string | null): string | null {
  if (local === instantInput(initial)) return initial;
  return local === '' ? null : new Date(local).toISOString();
}

export function ArchivedStamp({ archivedAt }: { archivedAt: string | null }) {
  return archivedAt === null ? null : <StateStamp label="Archived" tone="archived" />;
}

export function reportedItemLabel(item: Pick<ReportedItem, 'displayTitle' | 'externalItemId'>) {
  return item.displayTitle ?? `YouTube video ${item.externalItemId}`;
}

export function mappingLabel(
  mapping: Pick<UseMapping, 'caseWorkId' | 'reportedItemId' | 'occurrence'>,
  works: readonly CaseWork[],
  items: readonly ReportedItem[],
): string {
  const work = works.find((row) => row.id === mapping.caseWorkId);
  const item = items.find((row) => row.id === mapping.reportedItemId);
  return `${work?.title ?? 'Work'} → ${item ? reportedItemLabel(item) : 'reported item'} (occurrence ${mapping.occurrence})`;
}

/**
 * A record asked for under a case it does not belong to — or that does not exist — is not found:
 * the page names nothing of any other case.
 */
export function NotInThisCase({
  caseId,
  noun,
  testId,
}: {
  caseId: string;
  noun: string;
  testId: string;
}) {
  return (
    <p className="notice notice-quiet" role="alert" data-testid={testId}>
      This case has no {noun} with this id. A {noun} is shown only under the case it belongs to.{' '}
      <Link to={`/cases/${caseId}`}>Back to the case</Link>
    </p>
  );
}

type ArchiveCommand<T> = (
  body: ArchiveRequest,
  ifMatch: string,
  auth: WriteAuth,
) => Promise<Versioned<T>>;

/**
 * Edit, archive and restore of one intake record, each sent with the record's own ETag and one
 * Idempotency-Key per intent; a 412 hands over to the page's version-conflict notice. Under an
 * archived case every action stays visible but inert.
 */
export function IntakeActions<
  T extends { readonly id: string; readonly archivedAt: string | null },
>({
  record,
  noun,
  editTo,
  caseArchived,
  archive,
  restore,
  onChanged,
  onConflict,
}: {
  record: Versioned<T>;
  noun: string;
  editTo: string;
  /** Null while the case is loading: no action is offered before its state is known. */
  caseArchived: boolean | null;
  archive: ArchiveCommand<T>;
  restore: ArchiveCommand<T>;
  onChanged: (next: Versioned<T>, message: string) => void;
  onConflict: () => void;
}) {
  const operation = useRecordOperation(record, onConflict);
  const archived = record.data.archivedAt !== null;
  const label = `Actions for this ${noun}`;
  if (caseArchived === null) return null;
  if (caseArchived) {
    return (
      <div className="record-actions" role="group" aria-label={label}>
        <UnavailableAction
          label={archived ? 'Restore' : 'Edit or archive'}
          reason={CASE_ARCHIVED_READ_ONLY}
        />
      </div>
    );
  }
  return (
    <div className="record-actions" role="group" aria-label={label}>
      {!archived && (
        <Link className="button" to={editTo}>
          Edit
        </Link>
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
      <ReasonDialog
        open={operation.open === 'archive'}
        title={`Archive this ${noun}`}
        description={<p>{ARCHIVE_NO_CASCADE}</p>}
        confirmLabel="Archive"
        recordLabel={noun}
        pending={operation.pending}
        error={operation.error}
        onCancel={operation.close}
        onConfirm={(reason) =>
          void operation.run(
            'archive',
            { reason },
            (auth) => archive({ reason }, record.etag, auth),
            (next) => onChanged(next, 'Archived.'),
          )
        }
      />
      <ReasonDialog
        open={operation.open === 'restore'}
        title={`Restore this ${noun}`}
        description={
          <p>The {noun} becomes editable again exactly as it was. Nothing else changes.</p>
        }
        confirmLabel="Restore"
        recordLabel={noun}
        pending={operation.pending}
        error={operation.error}
        onCancel={operation.close}
        onConfirm={(reason) =>
          void operation.run(
            'restore',
            { reason },
            (auth) => restore({ reason }, record.etag, auth),
            (next) => onChanged(next, 'Restored.'),
          )
        }
      />
    </div>
  );
}
