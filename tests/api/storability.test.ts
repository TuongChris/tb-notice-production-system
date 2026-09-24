// Shared storability rule (infrastructure/write/storability.ts): which contract dates and instants
// the MySQL DATE / DATETIME(3) columns store and read back unchanged, and the exact instant that is
// written. Every case below is a wire-valid contract value, so it passes request parsing and reaches
// this rule. Database round trips of the same values are covered over HTTP in
// tests/db/p3a-http.test.ts (source instants) and tests/db/p3b-http.test.ts (authority events).
import { describe, expect, it } from 'vitest';
import { matchesWireFormat } from '../../packages/contracts/src/index.js';
import {
  storabilityProblem,
  storableInstant,
  toDbInstant,
} from '../../apps/api/src/infrastructure/write/storability.js';

/** [case, wire value, the UTC instant stored and read back]. */
const STORED: Array<[string, string, string]> = [
  ['whole seconds', '2025-06-30T10:15:00Z', '2025-06-30T10:15:00.000Z'],
  ['milliseconds', '2025-06-30T10:15:00.123Z', '2025-06-30T10:15:00.123Z'],
  ['one fraction digit', '2025-06-30T10:15:00.5Z', '2025-06-30T10:15:00.500Z'],
  ['zeros after the milliseconds', '2025-06-30T10:15:00.123000Z', '2025-06-30T10:15:00.123Z'],
  ['offset ±HH:MM', '2025-06-30T17:15:00.123+07:00', '2025-06-30T10:15:00.123Z'],
  ['offset ±HHMM', '2025-06-30T15:45:00+0530', '2025-06-30T10:15:00.000Z'],
  ['offset ±HH', '2025-06-30T15:15:00+05', '2025-06-30T10:15:00.000Z'],
  ['negative offset', '2025-06-30T03:15:00-07:00', '2025-06-30T10:15:00.000Z'],
  ['offset -00:00', '2025-06-30T10:15:00-00:00', '2025-06-30T10:15:00.000Z'],
  ['lowercase t and z', '2025-06-30t10:15:00z', '2025-06-30T10:15:00.000Z'],
  ['space separator', '2025-06-30 10:15:00Z', '2025-06-30T10:15:00.000Z'],
  ['tab separator', '2025-06-30\t10:15:00Z', '2025-06-30T10:15:00.000Z'],
  ['ideographic space separator', '2025-06-30　10:15:00Z', '2025-06-30T10:15:00.000Z'],
  ['leap day', '2028-02-29T23:59:59.999Z', '2028-02-29T23:59:59.999Z'],
  ['an offset crossing the year', '2025-12-31T23:30:00-01:00', '2026-01-01T00:30:00.000Z'],
  ['lowest instant', '1000-01-01T00:00:00Z', '1000-01-01T00:00:00.000Z'],
  [
    'local year 0999 that is year 1000 in UTC',
    '0999-12-31T23:30:00-01:00',
    '1000-01-01T00:30:00.000Z',
  ],
  ['highest instant', '9999-12-31T23:59:59.499Z', '9999-12-31T23:59:59.499Z'],
  ['last whole second', '9999-12-31T23:59:59Z', '9999-12-31T23:59:59.000Z'],
];

/** [case, wire value] — values the columns cannot store and read back exactly. */
const REFUSED: Array<[string, string]> = [
  ['leap second', '2016-12-31T23:59:60Z'],
  ['leap second with a fraction', '2016-12-31T23:59:60.500Z'],
  ['leap second written with an offset', '2016-12-31T15:59:60-08:00'],
  ['leap second just after midnight in its offset', '2017-01-01T00:59:60+01:00'],
  ['hour 24 (admitted by the format’s leap-second rule)', '2025-06-30T24:59:30+01:00'],
  ['minute 99 (admitted by the format’s leap-second rule)', '2025-06-30T23:99:60+00:40'],
  ['microseconds', '2025-06-30T10:15:00.123456Z'],
  ['a fourth fraction digit', '2025-06-30T10:15:00.1234Z'],
  ['sub-millisecond digits that would round up', '2025-06-30T10:15:00.123999Z'],
  ['only a sub-millisecond digit', '2025-06-30T10:15:00.0005Z'],
  ['year 0999', '0999-06-30T10:00:00Z'],
  ['last millisecond of year 0999', '0999-12-31T23:59:59.999Z'],
  ['local year 1000 that is year 0999 in UTC', '1000-01-01T00:30:00+01:00'],
  ['year 0000', '0000-01-01T00:00:00Z'],
  ['year 0050 with a space separator (V8’s legacy parser reads 1950)', '0050-06-30 10:00:00Z'],
  ['past MySQL’s supported range (…23:59:59.499999)', '9999-12-31T23:59:59.500Z'],
  ['last millisecond of year 9999', '9999-12-31T23:59:59.999Z'],
  ['year 10000 in UTC through an offset', '9999-12-31T23:59:59-01:00'],
];

const at = (value: unknown) => storabilityProblem({ at: value }, [], ['at']);

describe('storableInstant — the exact instant a DATETIME(3) column stores and reads back', () => {
  it('every case is a wire-valid contract date-time, so it reaches this rule', () => {
    const invalid = [...STORED.map(([, value]) => value), ...REFUSED.map(([, value]) => value)]
      .filter((value) => !matchesWireFormat('date-time', value))
      .map((value) => JSON.stringify(value));
    expect(invalid).toEqual([]);
  });

  it.each(STORED)('%s: %j is stored as %s', (_, value, stored) => {
    expect(storableInstant(value)?.toISOString()).toBe(stored);
    expect(toDbInstant(value).toISOString()).toBe(stored);
    expect(at(value)).toBeNull();
  });

  it.each(REFUSED)('%s: %j is refused, never altered', (_, value) => {
    expect(storableInstant(value)).toBeNull();
    expect(() => toDbInstant(value)).toThrow();
    const problem = at(value);
    expect(problem?.status).toBe(422);
    expect(problem?.code).toBe('VALIDATION_FAILED');
    expect(problem?.details).toEqual({
      issues: [{ path: 'at', message: expect.stringContaining('real instant') }],
    });
  });

  it('values outside the contract format are never storable', () => {
    for (const value of [
      '2025-06-30T10:15:00',
      '2025-06-30T10:15Z',
      '2025-06-30T10:15:00,123Z',
      '2025-02-29T10:15:00Z',
      '2025-13-01T10:15:00Z',
      '2025-06-30T10:15:00+24:00',
      '+002025-06-30T10:15:00Z',
      '',
    ]) {
      expect(storableInstant(value), JSON.stringify(value)).toBeNull();
    }
  });

  it('agrees with the ECMAScript date-time string parser wherever that parser is specified', () => {
    // Canonical spellings (T separator, Z or ±HH:MM, no or three fraction digits) are parsed by
    // Date.parse as ECMA-262 specifies; the stored instant must be exactly that instant when it is
    // inside MySQL's supported range, and nothing otherwise.
    const min = Date.UTC(1000, 0, 1);
    const max = Date.UTC(9999, 11, 31, 23, 59, 59, 499);
    let compared = 0;
    for (const year of ['0999', '1000', '1001', '1970', '2025', '2028', '9998', '9999'])
      for (const monthDay of ['01-01', '02-28', '02-29', '06-30', '12-31'])
        for (const time of ['00:00:00', '00:30:00', '12:34:56', '23:30:00', '23:59:59'])
          for (const fraction of ['', '.000', '.001', '.499', '.500', '.999'])
            for (const zone of ['Z', '+00:00', '-00:00', '+01:00', '-01:00', '+14:00', '-12:00']) {
              const value = `${year}-${monthDay}T${time}${fraction}${zone}`;
              if (!matchesWireFormat('date-time', value)) continue;
              const expected = Date.parse(value);
              const stored = storableInstant(value);
              expect(stored?.getTime() ?? null, value).toBe(
                expected >= min && expected <= max ? expected : null,
              );
              compared++;
            }
    expect(compared).toBeGreaterThan(5000);
  });

  it('every spelling the format admits names the same instant as the canonical spelling', () => {
    let compared = 0;
    for (const year of ['0999', '1000', '2025', '9999'])
      for (const time of ['00:00:00', '12:34:56.5', '23:59:59.499', '23:59:59.999'])
        for (const [zone, ...spellings] of [
          ['Z', 'z', '+00', '+0000', '-00:00'],
          ['+05:00', '+0500', '+05'],
          ['-07:30', '-0730'],
          ['+23:59', '+2359'],
        ] as const) {
          const canonical = `${year}-12-31T${time}${zone}`;
          const expected = storableInstant(canonical)?.getTime() ?? null;
          const variants = [
            ...spellings.map((spelling) => `${year}-12-31T${time}${spelling}`),
            ...['t', ' ', '\t', '\n', ' ', '　'].map(
              (separator) => `${year}-12-31${separator}${time}${zone}`,
            ),
          ];
          for (const variant of variants) {
            expect(matchesWireFormat('date-time', variant), JSON.stringify(variant)).toBe(true);
            expect(storableInstant(variant)?.getTime() ?? null, JSON.stringify(variant)).toBe(
              expected,
            );
            compared++;
          }
        }
    expect(compared).toBeGreaterThan(100);
  });
});

describe('storabilityProblem — values the database cannot store exactly are refused, never altered', () => {
  it.each([
    ['1000-01-01', null],
    ['9999-12-31', null],
    ['0999-12-31', 'VALIDATION_FAILED'],
    ['0000-01-01', 'VALIDATION_FAILED'],
  ])('date %s → %s', (effectiveOn, expected) => {
    expect(storabilityProblem({ effectiveOn }, ['effectiveOn'])?.code ?? null).toBe(expected);
  });

  it('omitted and null fields are not checked', () => {
    expect(storabilityProblem({}, ['effectiveOn'], ['at'])).toBeNull();
    expect(storabilityProblem({ effectiveOn: null, at: null }, ['effectiveOn'], ['at'])).toBeNull();
  });

  it('reports every unstorable field, dates first, in the order given', () => {
    const problem = storabilityProblem(
      {
        observedAt: '2016-12-31T23:59:60Z',
        effectiveOn: '0999-12-31',
        reviewedAt: '2025-06-30T10:15:00.123456Z',
        kept: '2025-06-30T10:15:00Z',
      },
      ['effectiveOn'],
      ['observedAt', 'reviewedAt', 'kept'],
    );
    const issues = (problem?.details['issues'] ?? []) as Array<{ path: string }>;
    expect(issues.map((issue) => issue.path)).toEqual(['effectiveOn', 'observedAt', 'reviewedAt']);
  });
});
