// Test seam of prompt generation: called inside the generation transaction. The application binds
// the no-op below; the consistency and concurrency tests of `yarn test:db` bind an observer that
// commits, or starts, a concurrent change at exactly these points, to prove that a snapshot freezes
// one transaction's view and that versions are never allocated twice.

export interface PromptGenerationObserver {
  /** Right after the CaseRecord is locked FOR UPDATE, before the context is read. */
  afterCaseLock(caseId: string): Promise<void>;
  /** After the context was checked and the prompt rendered, right before the snapshot is inserted. */
  beforeInsert(caseId: string): Promise<void>;
}

export const PROMPT_GENERATION_OBSERVER = Symbol('PROMPT_GENERATION_OBSERVER');

export const NO_PROMPT_GENERATION_OBSERVER: PromptGenerationObserver = {
  afterCaseLock: async () => {},
  beforeInsert: async () => {},
};
