/**
 * Unicode code-point length of a JavaScript string (ADR-0002, TECHNOLOGY_ARCHITECTURE §9).
 *
 * JSON Schema minLength/maxLength count characters (code points), not UTF-16 code units.
 * A valid surrogate pair counts as one; an unpaired surrogate counts as one. This is the same
 * rule Ajv applies for minLength/maxLength (`ajv/dist/runtime/ucs2length`), which is the frozen
 * compatibility oracle. `String.prototype.length` must not be used for wire length limits.
 */
export function codePointLength(value: string): number {
  let length = 0;
  let position = 0;
  while (position < value.length) {
    length += 1;
    const code = value.charCodeAt(position);
    position += 1;
    if (code >= 0xd800 && code <= 0xdbff && position < value.length) {
      const next = value.charCodeAt(position);
      if ((next & 0xfc00) === 0xdc00) position += 1;
    }
  }
  return length;
}
