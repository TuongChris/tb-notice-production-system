// Administrative lifecycle of Agency, Owner and LegalSubject (RecordState DRAFT | ACTIVE | ARCHIVED).
// These states are record administration only (INVARIANTS §4): ACTIVE is not legal authority, G1/G2
// or readiness; restore never revives authority. Every transition is explicit, audited and changes
// the row version once:
//   state   DRAFT ⇄ ACTIVE (the contract's RecordStateRequest offers only these two);
//   archive DRAFT | ACTIVE → ARCHIVED (archivedAt, archiveReason);
//   restore ARCHIVED → DRAFT (conservative: the record is re-activated only by an explicit state
//           change; the archive facts stay in the audit trail).
// An archived record is read-only until restored.
import { apiErrors } from '../../infrastructure/http/api-error.js';

export type RecordState = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

/** The columns a lifecycle command writes. */
export interface RecordLifecycleChange {
  readonly recordState?: RecordState;
  readonly archivedAt?: Date | null;
  readonly archiveReason?: string | null;
}

export function assertNotArchived(state: RecordState, operation: string): void {
  if (state === 'ARCHIVED') throw apiErrors.recordStateConflict({ state, operation });
}

export function archiveChange(
  state: RecordState,
  reason: string,
  now: Date,
): { recordState: 'ARCHIVED'; archivedAt: Date; archiveReason: string } {
  if (state === 'ARCHIVED') throw apiErrors.recordStateConflict({ state, operation: 'archive' });
  return { recordState: 'ARCHIVED', archivedAt: now, archiveReason: reason };
}

export function restoreChange(state: RecordState): {
  recordState: 'DRAFT';
  archivedAt: null;
  archiveReason: null;
} {
  if (state !== 'ARCHIVED') throw apiErrors.recordStateConflict({ state, operation: 'restore' });
  return { recordState: 'DRAFT', archivedAt: null, archiveReason: null };
}

export function stateChange(
  state: RecordState,
  requested: 'DRAFT' | 'ACTIVE',
): { recordState: 'DRAFT' | 'ACTIVE' } {
  assertNotArchived(state, 'state');
  if (state === requested) {
    throw apiErrors.recordStateConflict({ state, requested, operation: 'state' });
  }
  return { recordState: requested };
}
