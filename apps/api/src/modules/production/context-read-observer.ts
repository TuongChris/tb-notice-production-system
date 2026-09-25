// Test seam of the production-context read: called once inside the read's database snapshot,
// right after the case row — the first read, which fixes the snapshot — has been read. The
// application binds the no-op below; the snapshot test of `yarn test:db` binds an observer that
// commits a concurrent change at exactly this point, to prove the rest of the read cannot see it.

export interface ContextReadObserver {
  afterSnapshot(caseId: string): Promise<void>;
}

export const CONTEXT_READ_OBSERVER = Symbol('CONTEXT_READ_OBSERVER');

export const NO_CONTEXT_READ_OBSERVER: ContextReadObserver = {
  afterSnapshot: async () => {},
};
