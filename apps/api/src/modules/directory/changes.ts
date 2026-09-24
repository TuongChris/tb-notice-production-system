// Field-level change detection, Prisma write data and redacted audit diffs for directory writes.
//
// PATCH semantics (API_CONTRACT_v1 §4): an omitted field is preserved, explicit null clears a
// nullable field, and only fields whose value actually differs are written. A PATCH that changes
// nothing is a successful no-op: no write, no audit event, no version increment.
//
// Audit (INVARIANTS §7 "minimal field diff"): before/after carry only the changed fields plus the
// row version. Free-text notes — and a source's scope text, excerpt and limitations, which may quote
// the source — are redacted to their length; no credential, token or cookie data is ever part of a
// directory or source record. The authority records' free text (P3B) is treated the same way: a
// mandate's description, a version's change reason and validity notes, a coverage's scope texts,
// an authority event's scope text, interpretation and raw effective text may quote the authority
// document, so the audit trail keeps only their length.
import { codePointLength } from '@tb/contracts';
import { Prisma } from '../../../generated/prisma/client.js';
import { canonicalJson } from '../../infrastructure/write/request-digest.js';

/** Free-text fields recorded in audit only as `{ redacted: true, codePoints }`. */
const REDACTED_FIELDS = new Set([
  'notes',
  'scopeText',
  'excerpt',
  'limitations',
  'description',
  'changeReason',
  'validityNotes',
  'coveredWorksScope',
  'territorialScope',
  'exclusions',
  'conditions',
  'interpretation',
  'rawEffectiveText',
]);

function comparable(value: unknown): unknown {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

export function sameValue(a: unknown, b: unknown): boolean {
  return canonicalJson(comparable(a)) === canonicalJson(comparable(b));
}

/** Keys of `patch` whose value differs from the current row (JSON compared canonically). */
export function changedFields(
  current: Readonly<Record<string, unknown>>,
  patch: Readonly<Record<string, unknown>>,
): string[] {
  return Object.entries(patch)
    .filter(([field, value]) => value !== undefined && !sameValue(current[field], value))
    .map(([field]) => field);
}

/**
 * Prisma data for the given contract fields: nullable JSON columns are cleared with SQL NULL
 * (`Prisma.DbNull`); every other value is written as received.
 */
export function writeData(
  source: Readonly<Record<string, unknown>>,
  fields: readonly string[],
  jsonFields: readonly string[],
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const field of fields) {
    const value = source[field];
    if (value === undefined) continue;
    data[field] = value === null && jsonFields.includes(field) ? Prisma.DbNull : value;
  }
  return data;
}

export function auditValue(field: string, value: unknown): Prisma.InputJsonValue | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (REDACTED_FIELDS.has(field) && typeof value === 'string') {
    return { redacted: true, codePoints: codePointLength(value) };
  }
  return value as Prisma.InputJsonValue;
}

export function auditFields(
  source: Readonly<Record<string, unknown>>,
  fields: readonly string[],
): Prisma.InputJsonObject {
  const result: Record<string, Prisma.InputJsonValue | null> = {};
  for (const field of fields) result[field] = auditValue(field, source[field]);
  return result;
}

/** Non-null contract fields of a create request (the initial state recorded in audit). */
export function presentFields(source: Readonly<Record<string, unknown>>): string[] {
  return Object.entries(source)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([field]) => field);
}
