// Which SourceReference may support which record — the page-side copy of the server rules
// (apps/api/src/modules/sources/source-scope.ts), used only to offer applicable sources in a
// picker. The server checks again and is the authority; the one rule the page cannot see (a source
// already recorded as another owner's material) is reported by the server's refusal.
import type { SourceReference } from '@tb/contracts';

export type SourceTarget =
  | { readonly kind: 'Agency'; readonly agencyId: string }
  | {
      readonly kind: 'Route';
      readonly agencyId: string;
      readonly legalSubjectId: string;
    }
  | { readonly kind: 'LegalSubject'; readonly legalSubjectId: string }
  | { readonly kind: 'Owner' }
  | { readonly kind: 'OwnerSubject'; readonly legalSubjectId: string }
  | {
      /** A case (P4A): its agency and, once a route is bound, that route's legal subject. */
      readonly kind: 'Case';
      readonly caseId: string;
      readonly agencyId: string;
      readonly legalSubjectId: string | null;
    };

export type ScopeReason =
  | 'CROSS_AGENCY_REFERENCE'
  | 'CROSS_CASE_REFERENCE'
  | 'CASE_SCOPED_SOURCE'
  | 'CASE_SUBJECT_UNBOUND'
  | 'NOT_SCOPED_TO_AGENCY'
  | 'AGENCY_OWNED_SOURCE'
  | 'AGENCY_RESTRICTED_SOURCE'
  | 'NOT_SCOPED_TO_SUBJECT'
  | 'SCOPED_TO_OTHER_SUBJECT'
  | 'SUBJECT_SPECIFIC_SOURCE';

type Scoped = Pick<SourceReference, 'agencyId' | 'scopeBindings'>;

/** Why the source's recorded scope does not include the target (null when it does). */
export function scopeReason(source: Scoped, target: SourceTarget): ScopeReason | null {
  const scope = source.scopeBindings ?? {};
  const caseIds = scope.caseIds ?? [];
  const agencyIds = scope.agencyIds ?? [];
  const legalSubjectIds = scope.legalSubjectIds ?? [];
  if (caseIds.length > 0) {
    // A case-scoped source supports only the cases it names, and no other kind of record.
    if (target.kind !== 'Case') return 'CASE_SCOPED_SOURCE';
    if (!caseIds.includes(target.caseId)) return 'CROSS_CASE_REFERENCE';
    if (source.agencyId !== null && source.agencyId !== target.agencyId) {
      return 'CROSS_AGENCY_REFERENCE';
    }
    if (agencyIds.length > 0 && !agencyIds.includes(target.agencyId)) {
      return 'NOT_SCOPED_TO_AGENCY';
    }
  } else if (target.kind === 'Agency' || target.kind === 'Route' || target.kind === 'Case') {
    if (source.agencyId !== null) {
      if (source.agencyId !== target.agencyId) return 'CROSS_AGENCY_REFERENCE';
    } else if (!agencyIds.includes(target.agencyId)) {
      return 'NOT_SCOPED_TO_AGENCY';
    }
  } else {
    if (source.agencyId !== null) return 'AGENCY_OWNED_SOURCE';
    if (agencyIds.length > 0) return 'AGENCY_RESTRICTED_SOURCE';
  }
  switch (target.kind) {
    case 'LegalSubject':
      return legalSubjectIds.includes(target.legalSubjectId) ? null : 'NOT_SCOPED_TO_SUBJECT';
    case 'Route':
    case 'OwnerSubject':
      return legalSubjectIds.length > 0 && !legalSubjectIds.includes(target.legalSubjectId)
        ? 'SCOPED_TO_OTHER_SUBJECT'
        : null;
    case 'Case':
      if (legalSubjectIds.length === 0) return null;
      if (target.legalSubjectId === null) return 'CASE_SUBJECT_UNBOUND';
      return legalSubjectIds.includes(target.legalSubjectId) ? null : 'SCOPED_TO_OTHER_SUBJECT';
    case 'Owner':
      return legalSubjectIds.length > 0 ? 'SUBJECT_SPECIFIC_SOURCE' : null;
    case 'Agency':
      return null;
  }
}

/**
 * Only an agency or route target narrows a source list by agency (own and explicitly shared). A
 * case is not narrowed: a source that names the case applies to it without naming its agency.
 */
export function listAgencyOf(target: SourceTarget): string | undefined {
  return target.kind === 'Agency' || target.kind === 'Route' ? target.agencyId : undefined;
}
