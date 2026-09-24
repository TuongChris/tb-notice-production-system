// Shared pieces of the case pages (P4A): the permanent wording of what a case, a route binding, a
// canonical case id, a linked source and an authority selection are — and are not — the workflow
// stamp, and the source-scope target of a case. Every case page keys its state by the case id, so
// nothing entered or loaded for one case is ever shown for another.
import type { CaseRecord } from '@tb/contracts';
import { useDirectoryApi, useLoad, type Load } from '../directory/hooks.js';
import { WORKFLOW_STATE_LABEL, WORKFLOW_STATE_TONE } from '../directory/format.js';
import { StateStamp } from '../directory/ui.js';
import type { SourceTarget } from '../sources/scope.js';

export const CASE_BOUNDARY =
  'A case is the boundary of its case-specific records. It is not a legal verdict: it establishes no ownership, infringement, permission, authority or readiness.';
export const WORKFLOW_MEANING =
  'Workflow states describe operational activity only. No state means infringement, authority, readiness, submission or an outcome.';
export const ROUTE_BINDING_MEANING =
  'A route binding records which route this case uses. It is an association only: it selects no mandate, coverage or signer and grants no authority.';
export const ROUTE_CORRECTION =
  'A bound route can be corrected only while the case has no authority selection or later case history, and every source the case relies on must fit the new route.';
export const CANONICAL_CASE_MEANING =
  'Records which source holds the case’s canonical case id. It is an identity reference only: it proves nothing and changes no provenance.';
export const CASE_SOURCE_MEANING =
  'A linked source is associated with this case — nothing more. Linking does not mean the document was reviewed, that what it says is true, that infringement is proven, that permission is absent or that authority is valid, and it never changes the source’s provenance.';
/** The required statement of what an authority selection is (mission §31, verbatim). */
export const SELECTION_MEANING =
  'This selection records which authority materials will be evaluated for this Case. It is not a G1 decision.';
export const SELECTION_DETAIL =
  'It pins exact records — the case’s route, one signer and each chosen coverage of a frozen version — for later evaluation. It does not confirm standing, current authority, owner rights or signer eligibility, and it makes nothing ready for signature.';
export const SELECTION_HISTORY =
  'Selections are append-only. A new selection becomes the one in use for evaluation; earlier selections stay unchanged in the history.';
export const PINNED_COVERAGE_LIMIT =
  'The coverages a selection pins are stored with it, but the contract has no operation that reads them back yet, so this page shows them only while a selection is being made.';
export const OWNER_HINT_MEANING =
  'A hint only, not a finding of ownership. Once a route is bound, the hint is empty or that route’s owner.';

export function WorkflowStamp({ state }: { state: CaseRecord['workflowState'] }) {
  return <StateStamp label={WORKFLOW_STATE_LABEL[state]} tone={WORKFLOW_STATE_TONE[state]} />;
}

/**
 * The case's source-scope target: its agency and, once a route is bound, that route's legal
 * subject (loaded from the route's owner–subject link). The value is null until the case is known.
 */
export function useCaseTarget(
  record: Pick<CaseRecord, 'id' | 'agencyId' | 'routeId'> | null,
): Load<SourceTarget | null> {
  const api = useDirectoryApi();
  const [state] = useLoad<SourceTarget | null>(
    `case-target:${record?.id ?? ''}:${record?.routeId ?? ''}`,
    async () => {
      if (record === null) return null;
      if (record.routeId === null) {
        return { kind: 'Case', caseId: record.id, agencyId: record.agencyId, legalSubjectId: null };
      }
      const route = (await api.routes.get(record.routeId)).data;
      const link = (await api.ownerSubjects.get(route.ownerSubjectId)).data;
      return {
        kind: 'Case',
        caseId: record.id,
        agencyId: record.agencyId,
        legalSubjectId: link.legalSubjectId,
      };
    },
  );
  return state;
}
