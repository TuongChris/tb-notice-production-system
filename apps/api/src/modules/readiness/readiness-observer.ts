// Test seam of the unsigned export. The application binds the no-op below; the consistency tests of
// `yarn test:db` bind an observer that starts a concurrent write while the export holds the case
// lock (to prove the serialization and the SERIALIZABLE reads) or right before the audit event.

export interface ReadinessObserver {
  /** Right after the CaseRecord is locked FOR UPDATE in the export transaction. */
  afterCaseLock(caseId: string): Promise<void>;
  /** After readiness was re-evaluated and every check passed, right before the audit event. */
  beforeRecord(caseId: string): Promise<void>;
}

export const READINESS_OBSERVER = Symbol('READINESS_OBSERVER');

export const NO_READINESS_OBSERVER: ReadinessObserver = {
  afterCaseLock: async () => {},
  beforeRecord: async () => {},
};
