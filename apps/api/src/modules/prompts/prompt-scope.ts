// The request scope of one prompt generation (generatePrompt, TB-SCHEMA-API-v1.2.0): the same
// ContextScope a getProductionContext read of the same selectors uses — the path case, the task and
// mode, and the explicit selectors exactly as named — so the generation rebuilds exactly the context
// the caller reviewed. Nothing is chosen for the caller.
import type { GeneratePrompt } from '@tb/contracts';
import { apiErrors, type ValidationIssue } from '../../infrastructure/http/api-error.js';
import type { ContextScope } from '../production/context-scope.js';

/**
 * Request-only rules, before any idempotency claim or database access (the body is already parsed
 * against the contract): each prior binding is named once (422 VALIDATION_FAILED), and an INITIAL
 * prompt has no parent message and no prior transmissions (422 SELECTOR_NOT_FOR_TASK, the P4D rule).
 */
export function promptScope(caseId: string, body: GeneratePrompt): ContextScope {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  body.priorBindingIds.forEach((id, index) => {
    if (seen.has(id)) {
      issues.push({
        path: `priorBindingIds.${index}`,
        message: 'Each prior binding can be named only once',
      });
    }
    seen.add(id);
  });
  if (issues.length > 0) throw apiErrors.bodyValidationFailed(issues);
  const scope: ContextScope = {
    caseId,
    taskType: body.taskType,
    generationMode: body.generationMode,
    authoritySelectionId: body.authoritySelectionId ?? null,
    parentBindingId: body.parentBindingId ?? null,
    priorBindingIds: body.priorBindingIds,
  };
  if (scope.taskType === 'INITIAL') {
    if (scope.parentBindingId !== null) {
      throw apiErrors.selectorNotForTask('parentBindingId', scope.taskType);
    }
    if (scope.priorBindingIds.length > 0) {
      throw apiErrors.selectorNotForTask('priorBindingIds', scope.taskType);
    }
  }
  return scope;
}
