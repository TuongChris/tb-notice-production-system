// Display vocabulary of the directory, source, route, authority and case pages: enum labels, dates,
// and plain-language explanations of the contract error codes (what happened and what to do next).
// Authority and case vocabulary is neutral: a recorded state never reads as authorized, approved,
// eligible, current, valid or ready, and a case state is never a legal conclusion.
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

/** Operational activity of a case only — never infringement, authority, readiness or an outcome. */
export const WORKFLOW_STATE_LABEL = {
  INTAKE: 'Intake',
  PREPARING: 'Preparing',
  DRAFTING: 'Drafting',
  AWAITING_HUMAN: 'Awaiting a person',
  AWAITING_PLATFORM: 'Awaiting the platform',
  CLOSED: 'Closed',
} as const;
export const CASE_CLASS_LABEL = {
  WORKING_INTAKE: 'Working intake',
  CURRENT_OPERATION: 'Current operation',
  RECOVERED_HISTORY: 'Recovered history',
  EXTERNAL_REFERENCE: 'External reference',
} as const;
/** The kind of notice work a selection is recorded for (stored as supplied, evaluated later). */
export const TASK_TYPE_LABEL = {
  INITIAL: 'Initial notice',
  NMI_REPLY: 'Reply to a request for more information',
} as const;

/**
 * Case intake (P4B). A fact type names what a structured case fact is about; the fact records what
 * was stated or reviewed, never a conclusion the application reached.
 */
export const FACT_TYPE_LABEL = {
  RIGHTS_BASIS: 'Rights basis',
  RIGHTS_SCOPE: 'Rights scope',
  PERMISSION: 'Permission',
  AV_COMPARISON: 'Audio-visual comparison',
  EXCEPTION_REVIEW: 'Exception review',
  WORK_IDENTIFICATION: 'Work identification',
  REPORTED_IDENTIFICATION: 'Reported item identification',
  DUPLICATE_REVIEW: 'Duplicate review',
  AUTHORITY_CURRENTNESS: 'Authority currentness (as reported)',
} as const;
export const SCOPE_KIND_LABEL = {
  CASE: 'The whole case',
  WORK: 'One work',
  REPORTED_ITEM: 'One reported item',
  USE: 'One use mapping',
} as const;
/** A state the operator records for a fact; nothing computes it from sources or matching. */
export const RESOLUTION_STATE_LABEL = {
  UNASSESSED: 'Unassessed',
  SUPPORTED_FOR_SCOPE: 'Recorded as supported for its scope',
  CONFLICT: 'Conflict',
  WITHDRAWN: 'Withdrawn',
} as const;
export const RIGHTS_BASIS_LABEL = {
  CREATOR_ORIGIN: 'Creator origin (as stated)',
  ASSIGNMENT: 'Assignment (as stated)',
  TRANSFER: 'Transfer (as stated)',
  EMPLOYMENT: 'Employment (as stated)',
  EXCLUSIVE_LICENCE: 'Exclusive licence (as stated)',
  OTHER: 'Other',
  UNKNOWN: 'Unknown',
} as const;
/** Permission is never inferred from silence: "no permission reported" is only what was reported. */
export const PERMISSION_FINDING_LABEL = {
  NO_PERMISSION_REPORTED: 'No permission reported',
  PERMISSION_GRANTED: 'Permission granted (as reported)',
  UNKNOWN: 'Unknown',
  CONFLICT: 'Conflict',
} as const;
export const AV_FINDING_LABEL = {
  HUMAN_REVIEW_REPORTED: 'Human review reported',
  PRIMARY_EVIDENCE_REVIEWED: 'Primary evidence reviewed (as reported)',
  UNREVIEWED: 'Unreviewed',
  CONFLICT: 'Conflict',
} as const;
export const EXCEPTION_FINDING_LABEL = {
  REVIEW_RECORDED: 'Review recorded',
  UNREVIEWED: 'Unreviewed',
  LEGAL_REVIEW_REQUIRED: 'Legal review required',
  CONFLICT: 'Conflict',
} as const;
export const DUPLICATE_FINDING_LABEL = {
  UNCHECKED: 'Unchecked',
  POSSIBLE_OVERLAP: 'Possible overlap',
  REVIEWED_DISTINCT: 'Reviewed as distinct',
  EXISTING_MATTER: 'Existing matter',
} as const;
/** What a source reports about authority; the application never computes currentness. */
export const CURRENTNESS_FINDING_LABEL = {
  REPORTED_CURRENT: 'Reported as current by the source (not computed)',
  UNKNOWN: 'Unknown',
  CONFLICT: 'Conflict',
  ENDED: 'Reported as ended',
} as const;
/** How a mapping's start and end times are to be read, as the source states them. */
export const BOUNDARY_CONVENTION_LABEL: Record<string, string> = {
  UNKNOWN: 'Unknown',
  HALF_OPEN: 'Start included, end excluded',
  INCLUSIVE: 'Start and end included',
};

/**
 * Correspondence (P4C). The capture posture says how a message was captured. The postures are not
 * equivalent and are never upgraded; none of them verifies the message, its sending or receipt.
 */
export const CAPTURE_MODE_LABEL = {
  RAW_SOURCE: 'Raw source captured',
  COPIED_FULL_TEXT: 'Copied full text',
  EXCERPT: 'Excerpt',
  OPERATOR_REPORTED: 'Operator reported',
} as const;
/** What the recorded body text is, as entered. */
export const BODY_ROLE_LABEL = {
  FULL_MESSAGE: 'Full message',
  AUTHORED_BODY: 'Authored body only',
  QUOTED_HISTORY: 'Quoted history',
  EXCERPT: 'Excerpt',
  UNKNOWN: 'Unknown',
} as const;
/** Which way a message is recorded as going, relative to the mailbox — not proof of either. */
export const DIRECTION_LABEL = { INBOUND: 'Inbound', OUTBOUND: 'Outbound' } as const;
/** An attachment observation as recorded — never the attachment itself or proof it was attached. */
export const ATTACHMENT_STATE_LABEL = {
  OBSERVED_IN_RAW_MIME: 'Recorded as observed in the raw message',
  COPIED_TEXT_ALLEGATION: 'Mentioned in copied text only',
  UNKNOWN: 'Unknown',
} as const;
/**
 * What a binding records a captured message as, for one case: past events, never commands. An
 * "as sent" event is a transmission recorded as having happened; recording it sends nothing.
 */
export const CORRESPONDENCE_EVENT_LABEL = {
  INITIAL_AS_SENT: 'Initial notice (recorded as sent)',
  ACK: 'Acknowledgement',
  NMI: 'Request for more information (NMI)',
  REPLY_AS_SENT: 'Reply (recorded as sent)',
  SUPPLEMENT_AS_SENT: 'Supplement (recorded as sent)',
  CORRECTION_AS_SENT: 'Correction notice (recorded as sent)',
  OUTCOME: 'Outcome',
  OTHER: 'Other',
} as const;
/** A recorded outcome for one reported item — as recorded, not the platform's present status. */
export const OUTCOME_LABEL = {
  REMOVED: 'Removed',
  REINSTATED: 'Reinstated',
  REJECTED: 'Rejected',
  RETRACTED: 'Retracted',
  OTHER: 'Other',
} as const;

/**
 * Notice candidates (P4F). A planned document's state is a plan for a later human composition,
 * never a record that anything was attached, uploaded or sent (there is no "attached" state).
 */
export const PLAN_STATE_LABEL = {
  REFERENCE_ONLY: 'Reference only',
  PREPARED_FOR_ATTACHMENT: 'Prepared for attachment (planned, not attached)',
  PREVIOUSLY_SUPPLIED: 'Previously supplied (as recorded)',
  UNKNOWN: 'Unknown',
} as const;
/** Whether a planned document's disclosure was reviewed, as entered — never an approval. */
export const DISCLOSURE_REVIEW_LABEL = {
  PENDING: 'Disclosure review pending',
  REVIEWED_WITH_LIMITS: 'Reviewed with limits',
} as const;

/** Why a capture's posture was refused (CAPTURE_POSTURE_UNSUPPORTED reasons). */
const CAPTURE_POSTURE_REASON_TEXT: Record<string, string> = {
  RAW_SOURCE_NOT_REFERENCED:
    'A raw-source capture names the source record of the raw message file. Choose it, or choose the capture mode that describes what you have.',
  RAW_MIME_NOT_REFERENCED:
    'An attachment recorded as observed in the raw message needs the source record of that raw message. Choose it, or record the attachment as you actually saw it.',
  EXCERPT_NOT_FULL_MESSAGE:
    'An excerpt is not the full message. Choose the body role that describes the recorded text.',
};

/** Why a reported item address was refused (REPORTED_URL_UNSUPPORTED reasons). */
const REPORTED_URL_REASON_TEXT: Record<string, string> = {
  UNPARSEABLE: 'That text could not be read as a web address.',
  CREDENTIALS_IN_URL: 'The address contains a user name or password. Remove them.',
  PORT_IN_URL: 'The address names a port. Use the plain YouTube address.',
  NOT_YOUTUBE: 'Only a YouTube video address can be recorded as a reported item.',
  NOT_A_VIDEO_URL:
    'That is not the address of one video (for example a channel, playlist or search page). Enter the video’s own address.',
  AMBIGUOUS_VIDEO_ID: 'The address names more than one video. Enter an address with exactly one.',
  INVALID_VIDEO_ID:
    'The video id in the address is not a YouTube video id (11 letters, digits, hyphens or underscores).',
};

/** The case child a refusal names (RECORD_STATE_CONFLICT `record`). */
const INTAKE_RECORD_TEXT: Record<string, string> = {
  CaseWork: 'That work',
  ReportedItem: 'That reported item',
  UseMapping: 'That use mapping',
};

/** A selector of a production-context read (P4D): named explicitly, never chosen for the caller. */
function isContextSelector(field: unknown): boolean {
  return (
    field === 'authoritySelectionId' ||
    field === 'parentBindingId' ||
    (typeof field === 'string' && field.startsWith('priorBindingIds'))
  );
}

/** Case-child reference fields: a CROSS_CASE_REFERENCE on them names a record of another case. */
function isCaseRecordField(field: string): boolean {
  return (
    field === 'caseWorkId' ||
    field === 'reportedItemId' ||
    field === 'mappingId' ||
    field.startsWith('sources.')
  );
}

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
/** Neutral tones: no workflow state is shown in the green of an active record. */
export const WORKFLOW_STATE_TONE: Record<keyof typeof WORKFLOW_STATE_LABEL, Tone> = {
  INTAKE: 'draft',
  PREPARING: 'draft',
  DRAFTING: 'draft',
  AWAITING_HUMAN: 'paused',
  AWAITING_PLATFORM: 'paused',
  CLOSED: 'ended',
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

const instantWithZone = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
});

/** A recorded instant with the viewer's time-zone name, so a stated time is never read zoneless. */
export function formatInstant(iso: string): string {
  return instantWithZone.format(new Date(iso));
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
  'REFERENCED_BY:case_sources.case_id': 'sources are linked to it',
  'REFERENCED_BY:case_authority_selections.case_id': 'authority selections were recorded for it',
  'REFERENCED_BY:reported_items.case_id': 'reported items belong to it',
  'REFERENCED_BY:case_works.case_id': 'works belong to it',
  'REFERENCED_BY:use_mappings.case_id': 'use mappings belong to it',
  'REFERENCED_BY:case_facts.case_id': 'facts were recorded for it',
  'REFERENCED_BY:correspondence_bindings.case_id': 'correspondence is bound to it',
  'REFERENCED_BY:prompt_snapshots.case_id': 'prompt snapshots were taken for it',
  'REFERENCED_BY:notice_candidates.case_id': 'notice candidates belong to it',
};

/** Why a source's recorded scope does not include a record (SOURCE_SCOPE_UNRESOLVED reasons). */
export const SOURCE_SCOPE_REASON_TEXT: Record<string, string> = {
  CASE_SCOPED_SOURCE: 'the source is scoped to particular cases, and this record is not a case',
  CASE_SUBJECT_UNBOUND:
    'the source is about particular legal subjects, and this case has no route yet that tells its legal subject',
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
      if (record === 'CaseRecord') {
        return 'This case is archived, so it and everything under it are read-only until it is restored.';
      }
      if (record !== null && INTAKE_RECORD_TEXT[record] !== undefined) {
        return `${INTAKE_RECORD_TEXT[record]} is archived, so nothing new can name it. Restore it first.`;
      }
      if (record === 'CaseSource') {
        return 'That linked source is paused or unlinked, so it cannot support a fact. Link it again first.';
      }
      if (record === 'Route') {
        return typeof details['linkState'] === 'string'
          ? 'That route is paused or unlinked, so no case can be bound to it or select authority under it.'
          : 'The route is archived. Restore it first.';
      }
      if (record === 'Mandate') {
        return 'The mandate is archived, so it and everything under it are read-only until it is restored.';
      }
      if (record === 'OwnerSubject') {
        return 'The owner–subject link is not linked, so no route can use it. Relink it first.';
      }
      if (record === 'Signer') {
        if (details['operation'] === 'selectCaseAuthority') {
          return 'That signer is archived or ended, so it cannot be selected for a case.';
        }
        return details['operation'] === 'createCoverageSigner'
          ? 'That signer is archived or ended, so it cannot be recorded under a coverage.'
          : 'That signer is archived or ended, so it cannot be a default signer.';
      }
      if (typeof details['workflowState'] === 'string') {
        return 'The case is already in that workflow state.';
      }
      if (details['operation'] === 'route-binding') {
        return 'The case is already bound to that route.';
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
      if (details['field'] === 'correspondenceId') {
        return 'That message was captured for another agency. A case binds only correspondence captured for its own agency.';
      }
      if (recordLabel === 'case') {
        const field = typeof details['field'] === 'string' ? details['field'] : '';
        if (field === 'routeId') {
          return 'That route belongs to another agency. A case uses only routes of its own agency.';
        }
        if (field === 'signerId') {
          return 'That signer acts for another agency. A case selects only signers of its own agency.';
        }
        if (field.startsWith('coverages.')) {
          return 'That coverage belongs to another agency’s mandate, so this case cannot select it.';
        }
        return 'That source belongs to another agency, so it cannot support this case.';
      }
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
      if (typeof details['conflict'] === 'string') {
        return `A source this case relies on would not apply on that route: ${
          SOURCE_SCOPE_REASON_TEXT[reason] ?? 'its recorded scope does not include the route'
        }. Unlink that source or choose another route.`;
      }
      return `That source cannot support this ${recordLabel}: ${
        SOURCE_SCOPE_REASON_TEXT[reason] ?? 'its recorded scope does not include this record'
      }.`;
    }
    case 'CROSS_OWNER_REFERENCE':
      if (typeof details['conflict'] === 'string') {
        return 'A source this case relies on is recorded as another owner’s material, so the case cannot move to that route.';
      }
      if (details['field'] === 'routeId' || details['field'] === 'ownerHintId') {
        return 'The case’s owner hint and its route’s owner must be the same owner. Change the owner hint or choose that owner’s route.';
      }
      return 'That source is already recorded as another owner’s material, so it cannot be used for this owner.';
    case 'CROSS_CASE_REFERENCE':
      if (details['field'] === 'promptSnapshotId') {
        return 'That prompt snapshot belongs to another case. A candidate is drafted from a prompt snapshot of its own case, and a revision stays in its case.';
      }
      if (isContextSelector(details['field'])) {
        return 'That selection or binding belongs to another case. A production context uses only this case’s own records.';
      }
      if (details['field'] === 'supersedesBindingId') {
        return 'That binding belongs to another case. A corrected interpretation names an earlier binding of this same case.';
      }
      if (isCaseRecordField(typeof details['field'] === 'string' ? details['field'] : '')) {
        return 'That record belongs to another case. A case uses only its own works, reported items, use mappings and linked sources.';
      }
      return 'That source is scoped to another case, so it cannot support this case.';
    case 'REPORTED_URL_UNSUPPORTED':
      return `${
        REPORTED_URL_REASON_TEXT[String(details['reason'])] ??
        'Only a YouTube video address can be recorded as a reported item.'
      } Nothing was fetched.`;
    case 'DUPLICATE_REPORTED_ITEM':
      return 'This case already has a reported item for this video. Open the existing reported item instead.';
    case 'DUPLICATE_USE_MAPPING':
      return 'This work, reported item and occurrence are already mapped in this case. Open the existing mapping or use another occurrence number.';
    case 'TIME_RANGE_INVALID':
      return 'A known end time must be after its start time. Check both times exactly as the source states them.';
    case 'FACT_SCOPE_INVALID':
      return details['reason'] === 'TARGET_NOT_ALLOWED'
        ? 'A fact names only the record of its scope: none for the whole case, the work, reported item or use mapping otherwise.'
        : 'Choose the record this fact is about: the work, reported item or use mapping of its scope.';
    case 'DUPLICATE_CASE_SOURCE':
      return 'This source is already linked to this case in that role. Change the existing link’s state instead.';
    case 'SOURCE_NOT_CURRENT':
      return 'That source has a newer revision. Choose the current revision.';
    case 'SOURCE_ROLE_NOT_VERIFICATION':
      return 'A canonical binding needs a source recorded as a canonical record.';
    case 'BINDING_CORRECTION_REQUIRES_RECONCILIATION':
      if (Array.isArray(details['blockers'])) {
        return 'This case already has history on its bound route (for example an authority selection). Changing the route needs a reconciliation workflow that isn’t available yet.';
      }
      return `This ${recordLabel} already has a canonical binding. Changing it needs a reconciliation workflow that isn't available yet.`;
    case 'DUPLICATE_CANONICAL_CODE':
      return 'Another record of this kind already has that canonical code. Check the code in the source.';
    case 'DUPLICATE_ROUTE':
      return 'A route for this agency, association and platform already exists. Open that route instead.';
    case 'REVISION_NOT_HEAD':
      if (recordLabel === 'candidate') {
        return 'This candidate already has a revision. A candidate history does not fork: open the latest version and revise that one.';
      }
      if (recordLabel === 'fact') {
        return 'A newer revision of this fact exists. Only the current revision can be revised: open it and revise that one.';
      }
      return 'A newer revision of this source exists. Only the current revision can be revised.';
    case 'REVISION_SCOPE_CHANGE':
      if (stringList(details['fields']).includes('promptSnapshotId')) {
        return 'A revision keeps the candidate’s task: choose a prompt snapshot of the same task. A draft for another task needs its own candidate.';
      }
      if (stringList(details['fields']).includes('correspondenceId')) {
        return 'A corrected interpretation keeps the captured message of the binding it corrects. Another message needs its own binding.';
      }
      if (recordLabel === 'fact') {
        return 'A revision keeps the fact’s type and scope. A different type or scope needs a new fact.';
      }
      return 'A revision keeps the source’s agency and scope. A different scope needs a new source record.';
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
          if (String(details['field']).startsWith('coverages.')) {
            return 'That coverage belongs to a draft version. Only coverage of a frozen version can be selected for a case.';
          }
          return 'The referenced version is still a draft; only a frozen version can be used here.';
      }
    case 'VERSION_SUCCESSOR_EXISTS':
      return 'That version already has a successor. A version chain does not fork: open the successor instead.';
    case 'AUTHORITY_SCOPE_UNRESOLVED':
      switch (details['reason']) {
        case 'CASE_ROUTE_UNBOUND':
          return 'Bind this case to a route before selecting authority materials.';
        case 'NOT_CASE_ROUTE':
          return 'A selection names the case’s own bound route. Reload the case and try again.';
        case 'SIGNER_NOT_RECORDED':
          return 'The chosen signer is not recorded under that coverage. Choose coverage that records this signer, or another signer.';
        case 'OTHER_MANDATE':
          return 'That record belongs to another mandate, so it cannot be used here.';
        case 'OTHER_ROUTE':
          if (recordLabel === 'case') {
            return 'That coverage names another route, not the route this case is bound to.';
          }
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
      switch (details['reason']) {
        case 'SOURCE_NOT_REVIEWED':
          return '“Document reviewed” needs a source that records who reviewed the document.';
        case 'NO_BASIS_SOURCE':
          return '“Document reviewed” needs a basis source that records who reviewed the document.';
        case 'NO_REVIEWED_SOURCE':
          return '“Document reviewed” needs at least one supporting linked source that records who reviewed the document.';
        default:
          return '“Reviewed with limits” needs a cited primary or additional source that records who reviewed the document.';
      }
    case 'DUPLICATE_COVERAGE':
      return 'This version already has a coverage with that label for that route.';
    case 'DUPLICATE_COVERAGE_SIGNER':
      return 'That signer is already recorded under this coverage in that capacity.';
    case 'CAPTURE_POSTURE_UNSUPPORTED':
      return (
        CAPTURE_POSTURE_REASON_TEXT[String(details['reason'])] ??
        'The capture posture contradicts what was recorded. Choose the capture mode and body role that describe what you have.'
      );
    case 'OUTCOME_ITEM_REQUIRED':
      return 'An outcome is recorded for one reported item of this case. Choose the reported item; for several videos, record one binding per item.';
    case 'BINDING_ALREADY_SUPERSEDED':
      if (isContextSelector(details['field'])) {
        return 'That binding was corrected by a later binding. Name the correction instead; the earlier binding stays in the history and is never used in its place.';
      }
      return 'That binding already has a corrected interpretation. A binding history does not fork: correct the latest binding instead.';
    case 'SELECTOR_NOT_FOR_TASK':
      return 'An initial notice has no parent message and no prior transmissions. Those selectors apply to a reply to a request for more information only.';
    case 'REPLY_PARENT_REQUIRED':
      if (details['reason'] === 'NOT_IN_ENVELOPE') {
        return 'A reply keeps the thread of its prompt snapshot: the envelope names the prompt’s parent binding. None is chosen for you.';
      }
      return details['reason'] === 'NOT_NMI'
        ? 'That binding is not recorded as a request for more information (NMI). A reply starts from the exact NMI binding it answers.'
        : 'Drafting a reply needs the exact binding of the request for more information (NMI) it answers. Name it; none is chosen for you.';
    case 'PRIOR_BINDING_NOT_AS_SENT':
      return 'That binding is not recorded as a past transmission (as sent). Only a binding recorded as sent can be a prior transmission; a message’s direction never makes one.';
    case 'DRAFTING_INPUT_MISSING':
      return 'Drafting needs the required content listed below. Nothing was filled in; the preparation view shows the same context with these gaps.';
    case 'PRODUCTION_CONTEXT_TOO_LARGE':
      return `This context holds more records than the contract allows (${String(details['field'])}: ${String(details['count'])}, at most ${String(details['maximum'])}). Nothing is cut to fit.`;
    case 'INVALID_QUERY_PARAMETER':
      return `The request named an invalid value (${String(details['parameter'])}). Choose again.`;
    case 'CONTEXT_CHANGED':
      return 'Context changed. Review the current context before generating again.';
    case 'ENVELOPE_PARENT_MISMATCH':
      return 'A candidate keeps the reply thread of its prompt snapshot: the envelope’s parent binding is the prompt’s own, and none when the prompt named none.';
    case 'ENVELOPE_SENDER_MISMATCH':
      return 'The prompt snapshot names an authority selection: the sender must be exactly its intended mailbox. Another mailbox needs its own selection and prompt.';
    case 'DOCUMENT_PLAN_UNSUPPORTED':
      return details['reason'] === 'NOT_RECORDED_AS_SUPPLIED'
        ? '“Previously supplied” needs a prior transmission in this prompt snapshot’s context whose captured attachments name that exact source. A source or a sent message alone does not record it.'
        : 'A planned document can name only the SHA-256 recorded on its source revision, whose hash target says what that hash covers.';
    case 'CANDIDATE_ALREADY_SUPERSEDED':
      return 'This draft artifact is already superseded. A supersession is recorded once and never changed.';
    case 'PROMPT_TOO_LARGE':
      return `The prompt would be larger than the contract allows (${String(details['field'])}: ${String(details['count'])}, at most ${String(details['maximum'])}). Nothing is cut to fit, so no prompt was generated.`;
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
