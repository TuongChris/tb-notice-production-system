// The request scope of one production-context read (getProductionContext, TB-SCHEMA-API-v1.2.0):
// the path case, the task and mode, and the explicit selectors exactly as named. Nothing here is
// chosen for the caller — no current, latest, default or preferred record stands in for a missing
// selector — and a selector the task has no meaning for is refused rather than ignored.
import { apiErrors } from '../../infrastructure/http/api-error.js';
import type { QueryValues } from '../../infrastructure/write/request-parsing.js';

export type TaskType = 'INITIAL' | 'NMI_REPLY';
export type GenerationMode = 'PREPARATION' | 'DRAFTING';

export interface ContextScope {
  readonly caseId: string;
  readonly taskType: TaskType;
  readonly generationMode: GenerationMode;
  /** The selection named by the caller, or null (then the context has no authority). */
  readonly authoritySelectionId: string | null;
  /** The NMI binding a reply starts from, as named, or null. */
  readonly parentBindingId: string | null;
  /** The prior transmissions named for a reply, as supplied (each once). */
  readonly priorBindingIds: readonly string[];
}

/**
 * The scope of a request whose query `parseQuery` has validated against the contract (declared
 * parameters, required task and mode, enum values, UUID syntax, at most 100 prior bindings).
 * Request-only rules, before any database access: a prior binding is named once (400), and an
 * INITIAL context has no parent message and no prior transmissions (422 SELECTOR_NOT_FOR_TASK).
 */
export function contextScope(caseId: string, query: QueryValues): ContextScope {
  const taskType = query['taskType'] as TaskType;
  const generationMode = query['generationMode'] as GenerationMode;
  const text = (name: string): string | null => {
    const value = query[name];
    return typeof value === 'string' ? value : null;
  };
  const priors = query['priorBindingIds'];
  const priorBindingIds: readonly string[] = Array.isArray(priors) ? priors : [];
  if (new Set(priorBindingIds).size !== priorBindingIds.length) {
    throw apiErrors.invalidQueryParameter('priorBindingIds');
  }
  const scope: ContextScope = {
    caseId,
    taskType,
    generationMode,
    authoritySelectionId: text('authoritySelectionId'),
    parentBindingId: text('parentBindingId'),
    priorBindingIds,
  };
  if (taskType === 'INITIAL') {
    if (scope.parentBindingId !== null) {
      throw apiErrors.selectorNotForTask('parentBindingId', taskType);
    }
    if (priorBindingIds.length > 0) throw apiErrors.selectorNotForTask('priorBindingIds', taskType);
  }
  return scope;
}
