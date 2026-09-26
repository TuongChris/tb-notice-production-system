// Test seam of technical validation. The application binds the no-op below; the consistency tests
// of `yarn test:db` bind an observer that commits a dependency change between the capture and the
// commit transaction (to prove the final digest recheck), inside the commit transaction (to prove
// the case lock and the SERIALIZABLE reads), or that makes one rule fail (to prove an ERROR run).

export interface ValidationObserver {
  /** After the context was captured and checked, before the rules run (outside any transaction). */
  afterCapture(caseId: string): Promise<void>;
  /** Right after the CaseRecord is locked FOR UPDATE in the commit transaction. */
  afterCaseLock(caseId: string): Promise<void>;
  /** After the recheck passed, right before the run and its issues are inserted. */
  beforeInsert(caseId: string): Promise<void>;
  /** Right before each rule runs (synchronous: the rules engine is a pure function). */
  beforeRule(ruleId: string): void;
}

export const VALIDATION_OBSERVER = Symbol('VALIDATION_OBSERVER');

export const NO_VALIDATION_OBSERVER: ValidationObserver = {
  afterCapture: async () => {},
  afterCaseLock: async () => {},
  beforeInsert: async () => {},
  beforeRule: () => {},
};
