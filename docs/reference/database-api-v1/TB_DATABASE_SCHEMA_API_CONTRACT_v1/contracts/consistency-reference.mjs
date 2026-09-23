/** Executable SPECIFICATION helpers, not a backend service or legal validator. */
import { createHash } from 'node:crypto';
export const PENDING_SIGNATURE = '[PENDING AUTHORIZED SIGNER — FULL LEGAL NAME REQUIRED]';
export function assertUnicode(value) {
  if (typeof value !== 'string' || value.includes('\0')) throw new Error('INVALID_TEXT');
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const n = value.charCodeAt(++i);
      if (!(n >= 0xdc00 && n <= 0xdfff)) throw new Error('UNPAIRED_SURROGATE');
    } else if (c >= 0xdc00 && c <= 0xdfff) throw new Error('UNPAIRED_SURROGATE');
  }
  return value;
}
export function exactTextSha256(value) {
  return createHash('sha256').update(Buffer.from(assertUnicode(value), 'utf8')).digest('hex');
}
export function canonicalJson(value) {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(assertUnicode(value));
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) throw new Error('UNSAFE_NUMBER');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(assertUnicode(k)) + ':' + canonicalJson(value[k])).join(',') + '}';
  }
  throw new Error('UNSUPPORTED_CANONICAL_VALUE');
}
export const canonicalSha256 = value => exactTextSha256(canonicalJson(value));
export function parseMilliseconds(value) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,15})$/.test(value)) throw new Error('INVALID_MILLISECONDS');
  const n = BigInt(value);
  if (n > 9007199254740991n) throw new Error('MILLISECONDS_OUT_OF_RANGE');
  return n;
}
export function checkInterval(start, end) {
  const a = start === null ? null : parseMilliseconds(start);
  const b = end === null ? null : parseMilliseconds(end);
  if (a !== null && b !== null && b <= a) throw new Error('INTERVAL_END_NOT_AFTER_START');
  return { start: a, end: b }; // no conclusion about copying/AV identity
}
export function sameCase(parentCaseId, ...objects) {
  if (objects.some(x => x.caseId !== parentCaseId)) throw new Error('CROSS_CASE_REFERENCE');
  return true;
}
export function sameAgency(parentAgencyId, ...objects) {
  if (objects.some(x => x.agencyId !== parentAgencyId)) throw new Error('CROSS_AGENCY_REFERENCE');
  return true;
}
export function requirePendingSignatureSlot(body) {
  assertUnicode(body);
  if (body.split(PENDING_SIGNATURE).length - 1 !== 1) throw new Error('SIGNATURE_SLOT_COUNT');
  // This establishes only slot count, not absence of a semantic/handwritten signature elsewhere.
  return true;
}
