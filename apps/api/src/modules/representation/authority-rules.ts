// Request-level rules of the representation-authority records (P3B) that need no database: date
// ranges, the claims a version may make about its documents, the sources a version cites, write
// data for DATE/JSON columns and the redacted audit record. The services apply them; the database
// rules (locks, states, scope, chains) live in the services.
//
//   dates           a start date after its end date is refused (422 DATE_RANGE_INVALID); equal dates
//                   are a one-day range. Nothing is inferred: a missing end date is not "no end",
//                   a missing start date is not the capture date, and no date is computed.
//   document state  DRAFT and SIGNED_APPEARING describe a document, so they need the version's
//                   primary source (422 DOCUMENT_STATE_UNSUPPORTED); MISSING and UNKNOWN need none.
//   source review   REVIEWED_WITH_LIMITS claims that the version's sources were reviewed: at least
//                   one cited version source (primary or additional) must itself record an
//                   attributed review — reportedProvenance DOCUMENT_REVIEWED, which P3A accepts only
//                   with the reviewer's name (422 REVIEW_UNSUPPORTED). UNREVIEWED and CONFLICT are
//                   never refused; nothing upgrades a state.
//   event review    an AuthorityEvent recorded as DOCUMENT_REVIEWED needs its source to record such
//                   an attributed review (the event itself has no reviewer field).
import type { SourceLink } from '@tb/contracts';
import { Prisma } from '../../../generated/prisma/client.js';
import { apiErrors, type ApiError } from '../../infrastructure/http/api-error.js';
import { auditValue } from '../directory/changes.js';
import type { SourceUse } from '../sources/source-scope.js';

/** DATE columns of the authority records (YYYY-MM-DD on the wire). */
const DATE_FIELDS = new Set(['effectiveOn', 'expiresOn', 'endsOn']);
/** JSON columns of the authority records. */
export const AUTHORITY_JSON_FIELDS = ['additionalSourceRefs', 'signedDatesRaw', 'actionScope'];

/** A contract date (YYYY-MM-DD, already format-checked) as the UTC-midnight Date Prisma stores. */
export function toDbDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** MySQL's supported DATE / DATETIME range (the contract formats alone allow years 0000–0999). */
const MIN_STORABLE = '1000-01-01';
const MAX_STORABLE = '9999-12-31';

/**
 * Dates and timestamps the database cannot store exactly are refused rather than altered (the stored
 * value must equal the accepted value, as for text in request-parsing.ts): a date outside the
 * supported range; a timestamp that is not a real instant (for example a leap second, which the
 * RFC 3339 format admits), has more than millisecond precision (DATETIME(3)) or falls outside the
 * range in UTC. The exact wording of a source can be kept in a raw-text field instead.
 */
export function storabilityProblem(
  body: Readonly<Record<string, unknown>>,
  dateFields: readonly string[],
  timestampFields: readonly string[] = [],
): ApiError | null {
  const issues: { path: string; message: string }[] = [];
  for (const field of dateFields) {
    const value = body[field];
    if (typeof value === 'string' && (value < MIN_STORABLE || value > MAX_STORABLE)) {
      issues.push({ path: field, message: 'Must be a date between 1000-01-01 and 9999-12-31' });
    }
  }
  for (const field of timestampFields) {
    const value = body[field];
    if (typeof value !== 'string') continue;
    const instant = new Date(value);
    const fraction = /[.,](\d+)/.exec(value)?.[1] ?? '';
    const utcDate = Number.isNaN(instant.getTime()) ? '' : instant.toISOString().slice(0, 10);
    if (utcDate === '' || fraction.length > 3 || utcDate < MIN_STORABLE || utcDate > MAX_STORABLE) {
      issues.push({
        path: field,
        message:
          'Must be a real instant with at most millisecond precision between years 1000 and 9999 (keep the exact wording in the raw text field)',
      });
    }
  }
  return issues.length === 0 ? null : apiErrors.bodyValidationFailed(issues);
}

/**
 * 422 DATE_RANGE_INVALID when both dates are known and the start is after the end. Contract dates
 * are zero-padded calendar dates, so their string order is their calendar order.
 */
export function dateRangeProblem(
  startField: string,
  start: string | null | undefined,
  endField: string,
  end: string | null | undefined,
  details: Readonly<Record<string, unknown>> = {},
): ApiError | null {
  if (start == null || end == null || start <= end) return null;
  return apiErrors.dateRangeInvalid([startField, endField], details);
}

export interface SignedDateRaw {
  readonly subjectLabel: string;
  readonly dateRaw: string;
  readonly sourceId: string;
}

/** The documentary state of a version (the stored row merged with a request). */
export interface VersionTerms {
  readonly primarySourceId: string | null;
  readonly additionalSourceRefs: readonly SourceLink[] | null;
  readonly signedDatesRaw: readonly SignedDateRaw[] | null;
  readonly documentState: 'MISSING' | 'DRAFT' | 'SIGNED_APPEARING' | 'UNKNOWN';
  readonly sourceReviewState: 'UNREVIEWED' | 'REVIEWED_WITH_LIMITS' | 'CONFLICT';
  readonly effectiveOn: string | null;
  readonly expiresOn: string | null;
}

/** Every source a version cites, with the request path of each id. */
export function versionSourceUses(terms: VersionTerms): SourceUse[] {
  const uses: SourceUse[] = [];
  if (terms.primarySourceId !== null) {
    uses.push({ field: 'primarySourceId', sourceId: terms.primarySourceId });
  }
  (terms.additionalSourceRefs ?? []).forEach((link, index) =>
    uses.push({ field: `additionalSourceRefs.${index}.sourceId`, sourceId: link.sourceId }),
  );
  (terms.signedDatesRaw ?? []).forEach((entry, index) =>
    uses.push({ field: `signedDatesRaw.${index}.sourceId`, sourceId: entry.sourceId }),
  );
  return uses;
}

/** The request-level checks of a version's terms (dates and document state). */
export function versionTermsProblem(terms: VersionTerms): ApiError | null {
  const dates = dateRangeProblem('effectiveOn', terms.effectiveOn, 'expiresOn', terms.expiresOn);
  if (dates) return dates;
  if (
    (terms.documentState === 'DRAFT' || terms.documentState === 'SIGNED_APPEARING') &&
    terms.primarySourceId === null
  ) {
    return apiErrors.documentStateUnsupported('documentState');
  }
  return null;
}

/**
 * REVIEWED_WITH_LIMITS needs a cited primary or additional source that records an attributed review
 * (`reviewed` = ids of cited sources whose reportedProvenance is DOCUMENT_REVIEWED).
 */
export function versionReviewProblem(
  terms: VersionTerms,
  reviewed: ReadonlySet<string>,
): ApiError | null {
  if (terms.sourceReviewState !== 'REVIEWED_WITH_LIMITS') return null;
  const reviewable = [
    ...(terms.primarySourceId === null ? [] : [terms.primarySourceId]),
    ...(terms.additionalSourceRefs ?? []).map((link) => link.sourceId),
  ];
  return reviewable.some((id) => reviewed.has(id))
    ? null
    : apiErrors.reviewUnsupported('sourceReviewState', 'NO_REVIEWED_SOURCE');
}

/** An event recorded as DOCUMENT_REVIEWED needs a source that records an attributed review. */
export function eventReviewProblem(provenance: string, sourceProvenance: string): ApiError | null {
  if (provenance !== 'DOCUMENT_REVIEWED' || sourceProvenance === 'DOCUMENT_REVIEWED') return null;
  return apiErrors.reviewUnsupported('provenance', 'SOURCE_NOT_REVIEWED');
}

/**
 * Prisma data for the given contract fields: DATE fields become UTC-midnight Dates, a nullable JSON
 * column is cleared with SQL NULL, every other value is written as received.
 */
export function authorityWriteData(
  source: Readonly<Record<string, unknown>>,
  fields: readonly string[],
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const field of fields) {
    const value = source[field];
    if (value === undefined) continue;
    if (value === null) {
      data[field] = AUTHORITY_JSON_FIELDS.includes(field) ? Prisma.DbNull : null;
    } else if (DATE_FIELDS.has(field) && typeof value === 'string') {
      data[field] = toDbDate(value);
    } else {
      data[field] = value;
    }
  }
  return data;
}

function citationsAudit(value: unknown): Prisma.InputJsonValue | null {
  if (!Array.isArray(value)) return null;
  const sourceIds = value
    .map((entry) => (entry as { sourceId?: unknown }).sourceId)
    .filter((id): id is string => typeof id === 'string');
  return { count: value.length, sourceIds };
}

/**
 * The audit value of an authority field: free text redacted to its length (changes.ts), dates as
 * YYYY-MM-DD, and the JSON citation lists as their count and source ids only (their role, scope,
 * signer label and raw date text may quote the document).
 */
export function authorityAuditValue(field: string, value: unknown): Prisma.InputJsonValue | null {
  if (value === null || value === undefined) return null;
  if (DATE_FIELDS.has(field) && value instanceof Date) return value.toISOString().slice(0, 10);
  if (field === 'additionalSourceRefs' || field === 'signedDatesRaw') return citationsAudit(value);
  return auditValue(field, value);
}

export function authorityAuditFields(
  source: Readonly<Record<string, unknown>>,
  fields: readonly string[],
): Prisma.InputJsonObject {
  const result: Record<string, Prisma.InputJsonValue | null> = {};
  for (const field of fields) result[field] = authorityAuditValue(field, source[field]);
  return result;
}
