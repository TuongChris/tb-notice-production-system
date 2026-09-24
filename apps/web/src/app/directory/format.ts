// Display vocabulary of the directory, source, route and authority pages: enum labels, dates, and
// plain-language explanations of the contract error codes (what happened and what to do next).
// Authority vocabulary is neutral: a recorded state never reads as authorized, approved, eligible,
// current or ready.
import { ApiError } from '../api/client.js';

export const RECORD_STATE_LABEL = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  ARCHIVED: 'Archived',
} as const;
export const SIGNER_STATE_LABEL = {
  DRAFT: 'Draft',
  AVAILABLE: 'Available',
  PAUSED: 'Paused',
  ENDED: 'Ended',
} as const;
export const LINK_STATE_LABEL = {
  LINKED: 'Linked',
  PAUSED: 'Paused',
  UNLINKED: 'Unlinked',
} as const;
export const SUBJECT_TYPE_LABEL = {
  INDIVIDUAL: 'Individual',
  LEGAL_ENTITY: 'Legal entity',
  OTHER: 'Other',
} as const;
export const BINDING_STATE_LABEL = {
  LOCAL_ONLY: 'Local only',
  SOURCE_REFERENCED: 'Source-referenced',
  DIVERGENT: 'Divergent',
} as const;
export const REVIEW_STATE_LABEL = {
  UNREVIEWED: 'Unreviewed',
  REVIEWED_WITH_LIMITS: 'Reviewed with limits',
  CONFLICT: 'Conflict',
} as const;
export const PROVENANCE_LABEL = {
  DOCUMENT_REVIEWED: 'Document reviewed',
  OPERATOR_REPORTED: 'Operator reported',
  ANALYSIS: 'Analysis',
  MISSING: 'Missing',
  CONFLICT: 'Conflict',
} as const;
export const SOURCE_ROLE_LABEL = {
  CANONICAL_RECORD: 'Canonical record',
  PRIMARY_CORRESPONDENCE: 'Primary correspondence',
  OPERATOR_INPUT: 'Operator input',
  DERIVED_DRAFT: 'Derived draft',
  EXTERNAL_REFERENCE: 'External reference',
  POLICY_REFERENCE: 'Policy reference',
} as const;
/** Access is a point-in-time observation, never an evergreen guarantee. */
export const ACCESS_STATE_LABEL = {
  NOT_CHECKED: 'Access not checked',
  ACCESSIBLE_AT_CHECK: 'Accessible when checked',
  UNAVAILABLE_AT_CHECK: 'Unavailable when checked',
} as const;
export const HASH_TARGET_LABEL = {
  RAW_FILE: 'raw file bytes',
  EXTRACTED_TEXT: 'extracted text',
  OTHER: 'other stated content',
} as const;
export const PLATFORM_LABEL = { YOUTUBE: 'YouTube' } as const;

/** FROZEN = the system record is immutable; it is not approval, a signature or currentness. */
export const VERSION_STATE_LABEL = { DRAFT: 'Draft', FROZEN: 'Frozen' } as const;
export const CHANGE_KIND_LABEL = {
  NEW_AUTHORIZATION: 'New authorization document',
  AMENDMENT: 'Amendment',
  DOCUMENT_CAPTURE: 'Document capture',
  METADATA_CORRECTION: 'Metadata correction',
} as const;
export const DOCUMENT_STATE_LABEL = {
  MISSING: 'Document missing',
  DRAFT: 'Draft document',
  SIGNED_APPEARING: 'Appears signed',
  UNKNOWN: 'Unknown',
} as const;
export const VALIDITY_MODEL_LABEL = {
  UNKNOWN: 'Unknown',
  FIXED_TERM: 'Fixed term (as stated)',
  UNTIL_TERMINATED: 'Until terminated (as stated)',
} as const;
export const EXCLUSIVITY_LABEL = {
  UNKNOWN: 'Unknown',
  EXCLUSIVE: 'Exclusive (as stated)',
  NON_EXCLUSIVE: 'Non-exclusive (as stated)',
} as const;
/** Scope values as a document states them; recording one grants nothing and performs nothing. */
export const ACTION_SCOPE_LABEL = {
  PREPARE_NOTICE: 'Prepare notices',
  SIGN_NOTICE: 'Sign notices',
  SUBMIT_NOTICE: 'Submit notices',
  SUPPLEMENT: 'Supplements',
  CORRECTION: 'Corrections',
  ADMINISTRATIVE_COUNTERNOTICE: 'Administrative counter-notices',
} as const;
export const EVENT_TYPE_LABEL = {
  CURRENTNESS_RECORDED: 'Currentness recorded',
  REVOCATION: 'Revocation',
  TERMINATION: 'Termination',
  SUPERSESSION: 'Supersession',
  RESIGNATION: 'Resignation',
  CORRECTION: 'Correction',
} as const;

export type Tone = 'draft' | 'active' | 'archived' | 'paused' | 'ended' | 'frozen';

export const RECORD_STATE_TONE: Record<keyof typeof RECORD_STATE_LABEL, Tone> = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  ARCHIVED: 'archived',
};
export const SIGNER_STATE_TONE: Record<keyof typeof SIGNER_STATE_LABEL, Tone> = {
  DRAFT: 'draft',
  AVAILABLE: 'active',
  PAUSED: 'paused',
  ENDED: 'ended',
};
export const LINK_STATE_TONE: Record<keyof typeof LINK_STATE_LABEL, Tone> = {
  LINKED: 'active',
  PAUSED: 'paused',
  UNLINKED: 'ended',
};
/** Neutral tones: "frozen" is not the green of an active record. */
export const VERSION_STATE_TONE: Record<keyof typeof VERSION_STATE_LABEL, Tone> = {
  DRAFT: 'draft',
  FROZEN: 'frozen',
};

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function formatDateTime(iso: string | null): string {
  return iso === null ? '' : dateTime.format(new Date(iso));
}

const calendarDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' });

/** A recorded calendar date (YYYY-MM-DD), shown without any time-zone shift. */
export function formatDate(value: string | null): string {
  return value === null ? '' : calendarDate.format(new Date(`${value}T00:00:00.000Z`));
}

/** "Not recorded" for empty values, so absence is explicit rather than a blank cell. */
export const NOT_RECORDED = 'Not recorded';

const BLOCKER_TEXT: Record<string, string> = {
  NOT_DRAFT: 'it is no longer a draft',
  ARCHIVED: 'it is archived',
  CANONICAL_BINDING: 'it has a canonical binding',
  'REFERENCED_BY:signers.agency_id': 'signers belong to it',
  'REFERENCED_BY:routes.agency_id': 'routes use it',
  'REFERENCED_BY:mandates.agency_id': 'mandates belong to it',
  'REFERENCED_BY:cases.agency_id': 'cases belong to it',
  'REFERENCED_BY:source_references.agency_id': 'source references belong to it',
  'REFERENCED_BY:correspondence.agency_id': 'correspondence belongs to it',
  'REFERENCED_BY:owner_subjects.owner_id': 'it is linked to legal subjects',
  'REFERENCED_BY:cases.owner_hint_id': 'cases refer to it',
  'REFERENCED_BY:owner_subjects.legal_subject_id': 'owners are linked to it',
  'REFERENCED_BY:routes.default_signer_id': 'a route uses it as default signer',
  'REFERENCED_BY:coverage_signers.signer_id': 'mandate coverage names it',
  'REFERENCED_BY:case_authority_selections.signer_id': 'a case selected it',
  'REFERENCED_BY:routes.owner_subject_id': 'routes use it',
  'REFERENCED_BY:cases.route_id': 'cases use it',
  'REFERENCED_BY:case_authority_selections.route_id': 'a case selected it',
  'REFERENCED_BY:mandate_coverages.route_id': 'mandate coverage uses it',
  'REFERENCED_BY:mandate_versions.mandate_id': 'versions were recorded under it',
  'REFERENCED_BY:authority_events.mandate_id': 'authority events were recorded under it',
};

/** Why a source's recorded scope does not include a record (SOURCE_SCOPE_UNRESOLVED reasons). */
export const SOURCE_SCOPE_REASON_TEXT: Record<string, string> = {
  CASE_SCOPED_SOURCE: 'the source is scoped to a case, and cases do not exist yet',
  NOT_SCOPED_TO_AGENCY: 'the source is neither this agency’s own nor shared with this agency',
  AGENCY_OWNED_SOURCE:
    'the source belongs to one agency, but this record is shared by all agencies',
  AGENCY_RESTRICTED_SOURCE:
    'the source is shared only with particular agencies, but this record is shared by all agencies',
  NOT_SCOPED_TO_SUBJECT: 'the source’s scope does not name this legal subject',
  SCOPED_TO_OTHER_SUBJECT: 'the source is scoped to a different legal subject',
  SUBJECT_SPECIFIC_SOURCE:
    'the source is about particular legal subjects, not this owner namespace',
};

function blockerText(blocker: string): string {
  if (blocker.startsWith('SNAPSHOT_REFERENCE:'))
    return 'saved snapshots or source scopes mention it';
  return BLOCKER_TEXT[blocker] ?? blocker;
}

const ESTABLISHED_TEXT: Record<string, string> = {
  ACTIVE: 'it is active',
  CANONICAL_BINDING: 'it has a canonical binding',
};

function establishedText(reason: string): string {
  if (reason.startsWith('REFERENCED_BY:')) return `${blockerText(reason)}`;
  if (reason.startsWith('SNAPSHOT_REFERENCE:')) return blockerText(reason);
  return ESTABLISHED_TEXT[reason] ?? reason;
}

function listOf(parts: string[]): string {
  const unique = [...new Set(parts)];
  if (unique.length <= 1) return unique[0] ?? '';
  return `${unique.slice(0, -1).join(', ')} and ${unique.at(-1)}`;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

/** One sentence explaining a failed request and what to do next. */
export function describeError(error: unknown, recordLabel = 'record'): string {
  if (!(error instanceof ApiError))
    return 'Something went wrong in the page. Reload and try again.';
  const { code, details } = error;
  switch (code) {
    case 'NETWORK_ERROR':
      return 'The API could not be reached. Check that the local API is running, then try again.';
    case 'NOT_FOUND':
      return `This ${recordLabel} does not exist (it may have been deleted).`;
    case 'RECORD_VERSION_CONFLICT':
      return `This ${recordLabel} changed after you opened it, for example in another tab. Nothing was saved. Load the latest version and try again.`;
    case 'PRECONDITION_REQUIRED':
      return 'The page did not send the record version. Reload the page and try again.';
    case 'ESTABLISHED_IDENTITY_IMMUTABLE':
      return `This ${recordLabel}'s identity can't be filled in, changed or cleared here because ${listOf(
        stringList(details['establishedBy']).map(establishedText),
      )}. Correcting or completing an established identity needs a separate workflow that isn't available yet.`;
    case 'REFERENCED_RECORD_CANNOT_DELETE':
      return `This ${recordLabel} can't be deleted because ${listOf(
        stringList(details['blockers']).map(blockerText),
      )}. Archive it instead; that keeps its history.`;
    case 'RECORD_STATE_CONFLICT': {
      const record = typeof details['record'] === 'string' ? details['record'] : null;
      if (record === 'LegalSubject') return 'The legal subject is archived. Restore it first.';
      if (record === 'Owner') return 'The owner is archived. Restore it first.';
      if (record === 'Agency') return 'The agency is archived. Restore it first.';
      if (record === 'Route') return 'The route is archived. Restore it first.';
      if (record === 'Mandate') {
        return 'The mandate is archived, so it and everything under it are read-only until it is restored.';
      }
      if (record === 'OwnerSubject') {
        return 'The owner–subject link is not linked, so no route can use it. Relink it first.';
      }
      if (record === 'Signer') {
        return details['operation'] === 'createCoverageSigner'
          ? 'That signer is archived or ended, so it cannot be recorded under a coverage.'
          : 'That signer is archived or ended, so it cannot be a default signer.';
      }
      return `This action isn't available in the ${recordLabel}'s current state. Reload to see its latest state.`;
    }
    case 'DUPLICATE_OWNER_SUBJECT':
      return 'This owner is already linked to that legal subject. Change the existing link instead.';
    case 'DEPENDENT_ROUTES_LINKED':
      return 'Linked or paused routes still use this link. Pause or unlink those routes first.';
    case 'REFERENCE_NOT_FOUND':
      return 'A referenced record no longer exists. Reload and choose again.';
    case 'CROSS_AGENCY_REFERENCE':
      switch (details['field']) {
        case 'defaultSignerId':
          return 'That signer belongs to another agency. A route’s default signer must act for the route’s agency.';
        case 'signerId':
          return 'That signer acts for another agency. A coverage signer must act for the coverage’s agency.';
        case 'routeId':
          return 'That route belongs to another agency. A coverage names a route of the mandate’s own agency.';
        case 'preferredCoverageId':
          return 'That coverage belongs to another agency’s mandate, so this route cannot prefer it.';
        default:
          return 'That source belongs to another agency, so it cannot support this record.';
      }
    case 'SOURCE_SCOPE_UNRESOLVED': {
      const reason = typeof details['reason'] === 'string' ? details['reason'] : '';
      return `That source cannot support this ${recordLabel}: ${
        SOURCE_SCOPE_REASON_TEXT[reason] ?? 'its recorded scope does not include this record'
      }.`;
    }
    case 'CROSS_OWNER_REFERENCE':
      return 'That source is already recorded as another owner’s material, so it cannot be used for this owner.';
    case 'SOURCE_NOT_CURRENT':
      return 'That source has a newer revision. Choose the current revision.';
    case 'SOURCE_ROLE_NOT_VERIFICATION':
      return 'A canonical binding needs a source recorded as a canonical record.';
    case 'BINDING_CORRECTION_REQUIRES_RECONCILIATION':
      return `This ${recordLabel} already has a canonical binding. Changing it needs a reconciliation workflow that isn't available yet.`;
    case 'DUPLICATE_CANONICAL_CODE':
      return 'Another record of this kind already has that canonical code. Check the code in the source.';
    case 'DUPLICATE_ROUTE':
      return 'A route for this agency, association and platform already exists. Open that route instead.';
    case 'REVISION_NOT_HEAD':
      return 'A newer revision of this source exists. Only the current revision can be revised.';
    case 'REVISION_SCOPE_CHANGE':
      return 'A revision keeps the source’s agency and scope. A different scope needs a new source record.';
    case 'CASE_SCOPE_UNAVAILABLE':
      return 'Case scope cannot be recorded before cases exist.';
    case 'CONTENT_HASH_INCOMPLETE':
      return 'Enter both the SHA-256 value and what it was computed from, or neither.';
    case 'REVIEW_UNATTRIBUTED':
      return '“Document reviewed” is recorded only with the name of the person who reviewed the document.';
    case 'FROZEN_VERSION':
      return 'This version is frozen: it and its coverage and coverage signers can no longer change. Record a successor version instead.';
    case 'VERSION_NOT_FROZEN':
      switch (details['field']) {
        case 'predecessorId':
          return 'The chosen predecessor is still a draft. A draft is edited, not succeeded; freeze it first if it is complete.';
        case 'coverageId':
          return 'That coverage belongs to a draft version. Events are recorded only for coverage of a frozen version.';
        case 'preferredCoverageId':
          return 'That coverage belongs to a draft version. Only coverage of a frozen version can be a preferred coverage.';
        default:
          return 'The referenced version is still a draft; only a frozen version can be used here.';
      }
    case 'VERSION_SUCCESSOR_EXISTS':
      return 'That version already has a successor. A version chain does not fork: open the successor instead.';
    case 'AUTHORITY_SCOPE_UNRESOLVED':
      switch (details['reason']) {
        case 'OTHER_MANDATE':
          return 'That record belongs to another mandate, so it cannot be used here.';
        case 'OTHER_ROUTE':
          return 'That coverage names another route. A route can prefer only its own coverage, and a coverage lineage stays on one route.';
        case 'SCOPE_CHANGE':
          return 'A superseding event keeps the scope of the event it supersedes (the whole mandate or the same coverage).';
        default:
          return 'The referenced authority record belongs to another mandate, route or scope.';
      }
    case 'DATE_RANGE_INVALID':
      return 'A start date is after its end date. Check both dates exactly as the source states them.';
    case 'DOCUMENT_STATE_UNSUPPORTED':
      return '“Draft document” and “Appears signed” describe a document: choose the primary source first.';
    case 'REVIEW_UNSUPPORTED':
      return details['reason'] === 'SOURCE_NOT_REVIEWED'
        ? '“Document reviewed” needs a source that records who reviewed the document.'
        : '“Reviewed with limits” needs a cited primary or additional source that records who reviewed the document.';
    case 'DUPLICATE_COVERAGE':
      return 'This version already has a coverage with that label for that route.';
    case 'DUPLICATE_COVERAGE_SIGNER':
      return 'That signer is already recorded under this coverage in that capacity.';
    case 'EVENT_ALREADY_SUPERSEDED':
      return 'That event already has a successor. An event history does not fork: supersede the latest event instead.';
    case 'IDEMPOTENCY_IN_PROGRESS':
      return 'The same change is still being processed. Wait a moment and try again.';
    case 'IDEMPOTENCY_CONFLICT':
      return 'This change collides with an earlier request. Reload the page and try again.';
    case 'RETRYABLE_TRANSACTION_CONFLICT':
      return 'Another change was saved at the same moment. Try again.';
    case 'VALIDATION_FAILED':
    case 'FIELD_ATTRIBUTION_INVALID':
      return 'Some fields need attention. Nothing was saved.';
    case 'CSRF_TOKEN_INVALID':
    case 'SESSION_REQUIRED':
      return 'Your session has ended. Sign in again.';
    default:
      if (error.status >= 500) {
        return "The server couldn't confirm the change. Try again; repeating the same change is safe.";
      }
      return `The request was refused (${code}).`;
  }
}

export interface FieldIssue {
  readonly path: string;
  readonly message: string;
}

/** Validation issues of a 422 response, with messages phrased for the form. */
export function issuesOf(error: unknown): FieldIssue[] {
  if (!(error instanceof ApiError)) return [];
  const issues = error.details['issues'];
  if (!Array.isArray(issues)) return [];
  return issues
    .filter(
      (issue): issue is FieldIssue =>
        typeof issue === 'object' &&
        issue !== null &&
        typeof (issue as FieldIssue).path === 'string' &&
        typeof (issue as FieldIssue).message === 'string',
    )
    .map((issue) => ({ path: issue.path, message: friendlyMessage(issue.message) }));
}

export function friendlyMessage(message: string): string {
  const atMost = /^Must contain at most (\d+) Unicode code points$/.exec(message);
  if (atMost) return `Use at most ${atMost[1]} characters.`;
  if (/^Must contain at least 1 Unicode code points$/.test(message)) return 'Enter a value.';
  if (message.startsWith('Must be a valid email')) return 'Enter a valid email address.';
  if (message.startsWith('Must be a valid uri') || message === 'Must match pattern ^https?://') {
    return 'Enter a full web address starting with http:// or https://.';
  }
  if (message === 'Must match pattern ^[A-Z]{2}$') return 'Use a two-letter country code, e.g. VN.';
  if (message === 'At least one field is required')
    return 'Change at least one field before saving.';
  if (message === 'Unknown field') return 'The page sent a field the API does not accept.';
  return message;
}
