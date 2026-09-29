// Test seam of the assessment capture. The application binds the no-op below; the consistency tests
// of `yarn test:db` bind an observer that starts a concurrent write while the capture holds the
// case lock (to prove the serialization and the SERIALIZABLE reads) or right before the insert.

export interface AssessmentWriteObserver {
  /** Right after the CaseRecord is locked FOR UPDATE in the capture transaction. */
  afterCaseLock(caseId: string): Promise<void>;
  /** After every check passed, right before the assessment and its supports are inserted. */
  beforeInsert(caseId: string): Promise<void>;
}

export const ASSESSMENT_WRITE_OBSERVER = Symbol('ASSESSMENT_WRITE_OBSERVER');

export const NO_ASSESSMENT_WRITE_OBSERVER: AssessmentWriteObserver = {
  afterCaseLock: async () => {},
  beforeInsert: async () => {},
};
