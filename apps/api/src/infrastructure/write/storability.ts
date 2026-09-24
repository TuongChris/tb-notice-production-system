// Storability of contract dates and instants in the MySQL columns that hold them: DATE and
// DATETIME(3), written and read in UTC. The contract formats (ajv-formats "full": RFC 3339 plus the
// variants that implementation admits) accept values these columns cannot hold exactly, and the
// parsers between a request and the column — V8's Date parser, Prisma's DateTime parser and the
// driver — refuse some of them (a 500) or change them (a truncated fraction, a shifted year). A
// value is therefore accepted only when the column stores it and reads it back unchanged; anything
// else is refused with 422 VALIDATION_FAILED before any idempotency claim or write (the stored
// value must equal the accepted value, as for text in request-parsing.ts). An accepted instant is
// written as the exact Date computed here from its components, never as the request string, so no
// other parser decides which instant is stored.
//
//   date     YYYY-MM-DD within MySQL's supported DATE range, 1000-01-01 … 9999-12-31
//   instant  a real time of day: no leap second (23:59:60), none of the hour-24 or minute-overflow
//            forms the format's leap-second rule lets through with an offset; at most millisecond
//            precision: further fraction digits must be zeros (.123000 is .123; .123456 is
//            refused, never cut to .123); and, in UTC, within MySQL's supported DATETIME range with
//            a fractional part ('1000-01-01 00:00:00.000000' … '9999-12-31 23:59:59.499999'), so
//            1000-01-01T00:00:00.000Z … 9999-12-31T23:59:59.499Z. Every offset spelling the format
//            admits (Z, ±HH:MM, ±HHMM, ±HH) and every date/time separator (T, t or one whitespace
//            character) names the same instant, which is stored and returned in UTC.
import { apiErrors, type ApiError, type ValidationIssue } from '../http/api-error.js';

/** MySQL's supported DATE range (the contract `date` format also admits years 0000–0999). */
const MIN_DATE = '1000-01-01';
const MAX_DATE = '9999-12-31';

/** MySQL's supported DATETIME range with a fractional part, at millisecond precision. */
const MIN_INSTANT = Date.UTC(1000, 0, 1);
const MAX_INSTANT = Date.UTC(9999, 11, 31, 23, 59, 59, 499);

/** The contract `date-time` grammar: ajv-formats "full", time zone required. */
const DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})[Tt\s](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:[Zz]|([+-])(\d{2})(?::?(\d{2}))?)$/;

const INSTANT_MESSAGE =
  'Must be a real instant (no leap second) with at most millisecond precision, between 1000-01-01T00:00:00.000Z and 9999-12-31T23:59:59.499Z';

/**
 * The instant a contract `date-time` value names, as the Date a DATETIME(3) column stores and reads
 * back unchanged; null when there is none (see the header).
 */
export function storableInstant(value: string): Date | null {
  const match = DATE_TIME.exec(value);
  if (match === null) return null;
  const part = (group: number): number => Number(match[group] ?? 0);
  const year = part(1);
  const month = part(2);
  const day = part(3);
  const hour = part(4);
  const minute = part(5);
  const second = part(6);
  const fraction = match[7] ?? '';
  const offsetHours = part(9);
  const offsetMinutes = part(10);
  if (hour > 23 || minute > 59 || second > 59 || offsetHours > 23 || offsetMinutes > 59) {
    return null;
  }
  if (/[1-9]/.test(fraction.slice(3))) return null;
  const local = new Date(0);
  // setUTCFullYear, unlike Date.UTC, keeps years 0–99 as written.
  local.setUTCFullYear(year, month - 1, day);
  local.setUTCHours(hour, minute, second, Number(fraction.slice(0, 3).padEnd(3, '0')));
  if (
    local.getUTCFullYear() !== year ||
    local.getUTCMonth() !== month - 1 ||
    local.getUTCDate() !== day
  ) {
    return null;
  }
  const offset = (match[8] === '-' ? -1 : 1) * (offsetHours * 60 + offsetMinutes) * 60_000;
  const instant = local.getTime() - offset;
  return instant >= MIN_INSTANT && instant <= MAX_INSTANT ? new Date(instant) : null;
}

/**
 * The Date to write for a contract instant that storabilityProblem accepted. An instant that was
 * never checked fails the request (500) instead of being written altered.
 */
export function toDbInstant(value: string): Date {
  const instant = storableInstant(value);
  if (instant === null) throw new Error('An instant reached a write without a storability check');
  return instant;
}

/**
 * 422 VALIDATION_FAILED naming every given field whose value the database cannot store exactly:
 * a date outside the supported DATE range, or an instant storableInstant refuses. Omitted and null
 * fields are not checked.
 */
export function storabilityProblem(
  body: Readonly<Record<string, unknown>>,
  dateFields: readonly string[],
  timestampFields: readonly string[] = [],
): ApiError | null {
  const issues: ValidationIssue[] = [];
  for (const field of dateFields) {
    const value = body[field];
    if (typeof value === 'string' && (value < MIN_DATE || value > MAX_DATE)) {
      issues.push({ path: field, message: 'Must be a date between 1000-01-01 and 9999-12-31' });
    }
  }
  for (const field of timestampFields) {
    const value = body[field];
    if (typeof value === 'string' && storableInstant(value) === null) {
      issues.push({ path: field, message: INSTANT_MESSAGE });
    }
  }
  return issues.length === 0 ? null : apiErrors.bodyValidationFailed(issues);
}
