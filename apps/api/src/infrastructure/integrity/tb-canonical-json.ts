// TB canonical JSON v1 (INVARIANTS §6 "Exact bytes / digest contract"; PFC §8): the narrowly defined
// TB encoding used for structured hashing — object keys sorted in JavaScript UTF-16 code-unit order,
// arrays kept in the order given (a caller hashing a set sorts it by a stable id first), numbers only
// as finite safe integers (never -0), strings and keys without NUL or unpaired surrogates, plain
// objects only; no Date, BigInt, undefined, function or prototype values. It is the frozen reference
// helper (docs/reference/database-api-v1/…/contracts/consistency-reference.mjs: `canonicalJson`,
// `canonicalSha256`) ported without change; tests/api/production-context-rules.test.ts runs both on
// the same values. It is not a claim of general RFC 8785 conformance. The same helper's exact-text
// hash (`exactTextSha256`: SHA-256 of the UTF-8 bytes, no trimming, newline or Unicode
// normalization) and pending signature slot (`PENDING_SIGNATURE`) are ported below for P4E
// (tests/api/prompt-rules.test.ts compares them with the frozen helper).
//
// The request digest of idempotency (request-digest.ts) keeps its own, older subset for request
// bodies; dependency fingerprints and digests use this strict encoding only.
import { createHash } from 'node:crypto';

/** Throws unless `value` is text MySQL and the frozen helper both keep exactly (no NUL, paired surrogates). */
function assertText(value: string): string {
  if (value.includes('\0')) throw new Error('INVALID_TEXT');
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      index += 1;
      const next = value.charCodeAt(index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error('UNPAIRED_SURROGATE');
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new Error('UNPAIRED_SURROGATE');
    }
  }
  return value;
}

/** TB canonical JSON v1 text of a JSON value (throws on anything the encoding does not admit). */
export function tbCanonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(assertText(value));
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) throw new Error('UNSAFE_NUMBER');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(tbCanonicalJson).join(',')}]`;
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(assertText(key))}:${tbCanonicalJson(record[key])}`)
      .join(',')}}`;
  }
  throw new Error('UNSUPPORTED_CANONICAL_VALUE');
}

/** Lower-case hex SHA-256 of the UTF-8 bytes of the TB canonical JSON v1 text of `value`. */
export function tbCanonicalSha256(value: unknown): string {
  return createHash('sha256')
    .update(Buffer.from(assertText(tbCanonicalJson(value)), 'utf8'))
    .digest('hex');
}

/**
 * The one signature slot an unsigned artifact carries (Production Form Contract §7; the frozen
 * helper's `PENDING_SIGNATURE`). A human signs outside the application; nothing here fills it.
 */
export const PENDING_SIGNATURE = '[PENDING AUTHORIZED SIGNER — FULL LEGAL NAME REQUIRED]';

/**
 * SHA-256 (lowercase hex) of the exact UTF-8 bytes of a text (INVARIANTS §6; the frozen helper's
 * `exactTextSha256`): no trimming, newline rewriting or Unicode normalization; NUL and unpaired
 * surrogates are refused rather than replaced.
 */
export function exactTextSha256(value: string): string {
  return createHash('sha256')
    .update(Buffer.from(assertText(value), 'utf8'))
    .digest('hex');
}
