// Exact, bounded text scanning for the technical ruleset (TB-TECHNICAL-RULESET-v1): positions of an
// exact token and of a fixed pattern in one stored text, reported by line (1-based; lines end at a
// line feed, so a carriage return stays at the end of its line) and column (1-based, in code
// points), with the matched text cut to a short excerpt. Nothing is normalized or folded: a match is
// a match of the exact stored characters. At most MAX_LISTED_MATCHES matches are listed per field;
// the count is always complete.

/** Matches listed per field and rule (the count of all matches is always recorded). */
export const MAX_LISTED_MATCHES = 10;
/** Code points of matched text kept in an issue's details. */
export const MAX_EXCERPT_CODE_POINTS = 120;

export interface TextMatch {
  readonly text: string;
  readonly line: number;
  readonly column: number;
}

export interface Found {
  readonly index: number;
  readonly text: string;
}

/** Code-unit indexes of the non-overlapping occurrences of an exact token, in order. */
export function exactOccurrences(text: string, token: string): Found[] {
  const found: Found[] = [];
  if (token === '') return found;
  for (
    let index = text.indexOf(token);
    index !== -1;
    index = text.indexOf(token, index + token.length)
  ) {
    found.push({ index, text: token });
  }
  return found;
}

/** Every match of a global pattern, in order (an empty match is skipped). */
export function patternMatches(text: string, pattern: RegExp): Found[] {
  if (!pattern.global) throw new Error('patternMatches needs a global pattern');
  const found: Found[] = [];
  for (const match of text.matchAll(pattern)) {
    if (match[0] !== '' && match.index !== undefined) {
      found.push({ index: match.index, text: match[0] });
    }
  }
  return found;
}

/** Line (1-based) and column (1-based, code points) of a code-unit index. */
export function positionOf(text: string, index: number): { line: number; column: number } {
  const before = text.slice(0, index);
  let line = 1;
  for (let at = before.indexOf('\n'); at !== -1; at = before.indexOf('\n', at + 1)) line += 1;
  const lineStart = before.lastIndexOf('\n') + 1;
  return { line, column: Array.from(before.slice(lineStart)).length + 1 };
}

/** The matched text, cut to MAX_EXCERPT_CODE_POINTS code points. */
export function excerpt(value: string): string {
  const points = Array.from(value);
  return points.length <= MAX_EXCERPT_CODE_POINTS
    ? value
    : `${points.slice(0, MAX_EXCERPT_CODE_POINTS).join('')}…`;
}

/** The details of a set of matches in one field: their count and the first ones, located. */
export function located(
  text: string,
  found: readonly Found[],
): { occurrences: number; matches: TextMatch[] } {
  const sorted = [...found].sort((a, b) => a.index - b.index);
  return {
    occurrences: sorted.length,
    matches: sorted.slice(0, MAX_LISTED_MATCHES).map((match) => ({
      text: excerpt(match.text),
      ...positionOf(text, match.index),
    })),
  };
}
