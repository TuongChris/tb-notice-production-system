// Test seam of the unsigned export. The application binds the no-op below; the consistency tests of
// `yarn test:db` bind an observer that starts a concurrent write while the export holds the case
// lock (to prove the serialization and the SERIALIZABLE reads) or right before the audit event, and
// one that lets time pass inside a guarded replay (R14-AUD-020: the replay's evaluation instant is
// sampled after its reads, never taken from before the claim, the replay lookup or those reads).

export interface ReadinessObserver {
  /** Right after the CaseRecord is locked FOR UPDATE in the export transaction. */
  afterCaseLock(caseId: string): Promise<void>;
  /** After readiness was re-evaluated and every check passed, right before the audit event. */
  beforeRecord(caseId: string): Promise<void>;
  /**
   * A guarded replay of a completed export, before it opens its snapshot: after the request's
   * instant, the idempotency claim and the replay lookup.
   */
  beforeReplayRead(candidateId: string): Promise<void>;
  /** A guarded replay, after its readiness input was read and before its evaluation instant. */
  afterReplayInput(candidateId: string): Promise<void>;
}

export const READINESS_OBSERVER = Symbol('READINESS_OBSERVER');

export const NO_READINESS_OBSERVER: ReadinessObserver = {
  afterCaseLock: async () => {},
  beforeRecord: async () => {},
  beforeReplayRead: async () => {},
  afterReplayInput: async () => {},
};
