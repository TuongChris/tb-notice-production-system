// Test seam of the candidate writes: called inside the write transaction. The application binds the
// no-op below; the concurrency tests of `yarn test:db` bind an observer that starts a concurrent
// write at exactly these points, to prove that versions are never allocated twice, that a candidate
// chain never forks and that a candidate is superseded once.

export interface CandidateWriteObserver {
  /** Right after the CaseRecord is locked FOR UPDATE (import, revise and supersede). */
  afterCaseLock(caseId: string): Promise<void>;
  /** After every check passed and the hashes were computed, right before the candidate is inserted. */
  beforeInsert(caseId: string): Promise<void>;
}

export const CANDIDATE_WRITE_OBSERVER = Symbol('CANDIDATE_WRITE_OBSERVER');

export const NO_CANDIDATE_WRITE_OBSERVER: CandidateWriteObserver = {
  afterCaseLock: async () => {},
  beforeInsert: async () => {},
};
