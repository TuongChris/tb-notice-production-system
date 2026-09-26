// The production-context scope a candidate's technical validation evaluates: exactly its prompt
// snapshot's scope — the case, the task and mode, the authority selection and the parent binding
// the prompt named, and its prior transmissions. The snapshot stores the parent binding but not the
// prior bindings as a field; they are recovered exactly from its frozen dependency manifest: a
// correspondence binding enters the production-context closure only as the named parent or as a
// named prior (context-dependencies.ts), and a parent (an NMI) is never a prior (recorded as sent),
// so the manifest's bindings other than the parent are exactly the priors. Nothing newer, latest or
// default is chosen: a later selection, binding or prompt of the case never replaces these.
import type { Dependency } from '@tb/contracts';
import type { PromptSnapshot } from '../../../generated/prisma/client.js';
import { apiErrors } from '../../infrastructure/http/api-error.js';
import type { ContextScope } from '../production/context-scope.js';

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The scope of `prompt` (500 when its stored manifest contradicts its own selectors). */
export function validationScope(prompt: PromptSnapshot): ContextScope {
  const manifest = prompt.dependencyManifest as unknown as Dependency[];
  const bindings = manifest
    .filter((dependency) => dependency.entityType === 'CorrespondenceBinding')
    .map((dependency) => dependency.entityId);
  const parentListed = prompt.parentBindingId === null || bindings.includes(prompt.parentBindingId);
  const priorBindingIds = bindings.filter((id) => id !== prompt.parentBindingId).sort(byId);
  // A stored snapshot always lists its named parent, and an INITIAL one names no binding at all.
  if (!parentListed || (prompt.taskType === 'INITIAL' && bindings.length > 0)) {
    throw apiErrors.internal();
  }
  return {
    caseId: prompt.caseId,
    taskType: prompt.taskType,
    generationMode: prompt.generationMode,
    authoritySelectionId: prompt.authoritySelectionId,
    parentBindingId: prompt.parentBindingId,
    priorBindingIds,
  };
}
