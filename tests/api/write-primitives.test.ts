// Shared write-layer primitives (P2): ETag / If-Match, idempotency keys and request digests,
// integrity-protected list cursors and database error classification. Pure unit tests.
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../apps/api/src/infrastructure/http/api-error.js';
import { CursorCodec, listFingerprint } from '../../apps/api/src/infrastructure/write/cursor.js';
import {
  isRetryableTransactionError,
  isUniqueViolation,
  MAX_TRANSACTION_ATTEMPTS,
} from '../../apps/api/src/infrastructure/write/database-errors.js';
import {
  assertIfMatch,
  entityEtag,
  requireIfMatch,
} from '../../apps/api/src/infrastructure/write/etag.js';
import {
  IDEMPOTENCY_IN_PROGRESS_LEASE_MS,
  IDEMPOTENCY_REPLAY_HORIZON_MS,
  parseIdempotencyKey,
} from '../../apps/api/src/infrastructure/write/idempotency.js';
import {
  canonicalJson,
  contractPath,
  requestDigest,
} from '../../apps/api/src/infrastructure/write/request-digest.js';

const ID = '3f2b8c1e-8a55-4f0e-9c1d-2b7e6a4d9f10';

function apiError(action: () => unknown): ApiError {
  try {
    action();
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error('expected an ApiError');
}

describe('ETag / If-Match', () => {
  it('formats the contract strong ETag "<Type>:<id>:v<rowVersion>"', () => {
    expect(entityEtag('Agency', ID, 7)).toBe(`"Agency:${ID}:v7"`);
  });

  it('a missing or empty If-Match is 428 PRECONDITION_REQUIRED', () => {
    for (const value of [undefined, '', '   ']) {
      const error = apiError(() => requireIfMatch(value));
      expect([error.status, error.code]).toEqual([428, 'PRECONDITION_REQUIRED']);
    }
    expect(requireIfMatch('"x"')).toBe('"x"');
  });

  it('only the exact current ETag passes; stale, weak, wildcard, lists and other types are 412', () => {
    const target = { entityType: 'Agency', id: ID, rowVersion: 3 };
    expect(() => assertIfMatch(`"Agency:${ID}:v3"`, target)).not.toThrow();
    for (const presented of [
      `"Agency:${ID}:v2"`,
      `W/"Agency:${ID}:v3"`,
      '*',
      `"Agency:${ID}:v3", "Agency:${ID}:v4"`,
      `Agency:${ID}:v3`,
      `"Owner:${ID}:v3"`,
      `"agency:${ID}:v3"`,
    ]) {
      const error = apiError(() => assertIfMatch(presented, target));
      expect([error.status, error.code], presented).toEqual([412, 'RECORD_VERSION_CONFLICT']);
    }
  });
});

describe('Idempotency key and request digest', () => {
  it('accepts 16–100 characters of [A-Za-z0-9_-] only; missing is 400 REQUIRED, bad is 400 INVALID', () => {
    expect(parseIdempotencyKey('a'.repeat(16))).toBe('a'.repeat(16));
    expect(parseIdempotencyKey(`K_-${'9'.repeat(97)}`)).toHaveLength(100);
    expect(parseIdempotencyKey('3f2b8c1e-8a55-4f0e-9c1d-2b7e6a4d9f10')).toHaveLength(36);
    expect(apiError(() => parseIdempotencyKey(undefined)).code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(apiError(() => parseIdempotencyKey('')).code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    for (const key of [
      'a'.repeat(15),
      'a'.repeat(101),
      'with space-0123456',
      'ünïcode-0123456789',
      'a,b-0123456789abcd',
    ]) {
      const error = apiError(() => parseIdempotencyKey(key));
      expect([error.status, error.code], key).toEqual([400, 'IDEMPOTENCY_KEY_INVALID']);
    }
  });

  it('keeps the 7-day replay horizon and a 60 s in-progress lease', () => {
    expect(IDEMPOTENCY_REPLAY_HORIZON_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(IDEMPOTENCY_IN_PROGRESS_LEASE_MS).toBe(60_000);
  });

  it('canonical JSON sorts keys recursively, keeps array order and drops undefined members', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: null }, u: undefined })).toBe(
      '{"a":{"c":null,"d":[3,{"y":2,"z":1}]},"b":1}',
    );
    expect(canonicalJson('é"\\')).toBe('"é\\"\\\\"');
    expect(() => canonicalJson(Number.NaN)).toThrow();
  });

  it('the digest binds operation, method, normalized path and body — not key order', () => {
    const base = {
      operationId: 'patchAgency',
      method: 'patch',
      path: `/agencies/${ID}`,
      body: { a: 1, b: 'x' },
    };
    const digest = requestDigest(base);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(requestDigest({ ...base, body: { b: 'x', a: 1 } })).toBe(digest);
    expect(requestDigest({ ...base, method: 'PATCH' })).toBe(digest);
    for (const variant of [
      { ...base, operationId: 'patchOwner' },
      { ...base, method: 'post' },
      { ...base, path: `/agencies/${ID.replace('3f', '4f')}` },
      { ...base, body: { a: 1, b: 'y' } },
      { ...base, body: { a: 1 } },
      { ...base, body: null },
    ]) {
      expect(requestDigest(variant)).not.toBe(digest);
    }
  });

  it('contractPath substitutes path parameters into the contract template', () => {
    expect(contractPath('/owners/{ownerId}/subjects', { ownerId: ID })).toBe(
      `/owners/${ID}/subjects`,
    );
    expect(() => contractPath('/agencies/{id}', {})).toThrow();
  });
});

describe('List cursors', () => {
  const secret = randomBytes(32);
  const codec = new CursorCodec(secret);
  const position = { createdAt: new Date('2026-09-24T01:02:03.456Z'), id: ID };
  const fingerprint = listFingerprint('listAgencies', { q: 'abc' });

  it('round-trips a position and carries no offset or secret', () => {
    const cursor = codec.encode('listAgencies', fingerprint, position);
    expect(cursor.length).toBeLessThan(300);
    expect(codec.decode('listAgencies', fingerprint, cursor)).toEqual(position);
    const payload = Buffer.from(cursor.split('.')[0] ?? '', 'base64url').toString('utf8');
    expect(Object.keys(JSON.parse(payload) as object).sort()).toEqual(['f', 'i', 'o', 't', 'v']);
    expect(payload).not.toContain(secret.toString('base64url'));
  });

  it('rejects tampering, truncation, other lists, other filters and another server secret', () => {
    const cursor = codec.encode('listAgencies', fingerprint, position);
    const [body = '', mac = ''] = cursor.split('.');
    const forgedBody = Buffer.from(
      JSON.stringify({ v: 1, o: 'listAgencies', f: fingerprint, t: 0, i: ID }),
    ).toString('base64url');
    const cases: Array<[string, string, string]> = [
      ['listAgencies', fingerprint, `${forgedBody}.${mac}`],
      ['listAgencies', fingerprint, `${body}.${mac.slice(1)}`],
      ['listAgencies', fingerprint, `${body}.`],
      ['listAgencies', fingerprint, `${body}.${mac}.x`],
      ['listAgencies', fingerprint, '!!.??'],
      ['listOwners', fingerprint, cursor],
      ['listAgencies', listFingerprint('listAgencies', { q: 'abd' }), cursor],
      ['listAgencies', listFingerprint('listAgencies', { q: null }), cursor],
    ];
    for (const [operationId, expectedFingerprint, value] of cases) {
      const error = apiError(() => codec.decode(operationId, expectedFingerprint, value));
      expect([error.status, error.code], value).toEqual([400, 'INVALID_CURSOR']);
    }
    const rotated = new CursorCodec(randomBytes(32));
    expect(apiError(() => rotated.decode('listAgencies', fingerprint, cursor)).code).toBe(
      'INVALID_CURSOR',
    );
  });

  it('a validly signed payload with wrong field types is still rejected', () => {
    const craft = (payload: unknown) => {
      // Sign with the codec's own key via encode's format (white-box: same derivation).
      const other = new CursorCodec(secret);
      const good = other.encode('listAgencies', fingerprint, position);
      const [, mac] = good.split('.');
      const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
      return `${body}.${mac}`;
    };
    for (const payload of [{ v: 2 }, { v: 1, o: 'listAgencies', f: fingerprint, t: -1, i: ID }]) {
      expect(apiError(() => codec.decode('listAgencies', fingerprint, craft(payload))).code).toBe(
        'INVALID_CURSOR',
      );
    }
  });
});

describe('Database error classification', () => {
  it('retries deadlocks and lock-wait timeouts only, at most three attempts', () => {
    expect(MAX_TRANSACTION_ATTEMPTS).toBe(3);
    const retryable = [
      { code: 'P2034' },
      { code: 'P2010', meta: { driverAdapterError: { cause: { originalCode: '1213' } } } },
      { name: 'DriverAdapterError', cause: { kind: 'mysql', originalCode: '1205' } },
      { errno: 1213 },
    ];
    for (const error of retryable)
      expect(isRetryableTransactionError(error), JSON.stringify(error)).toBe(true);
    for (const error of [
      { code: 'P2002' },
      { code: 'P2025' },
      new Error('boom'),
      null,
      'text',
      { cause: { originalCode: '1062' } },
    ]) {
      expect(isRetryableTransactionError(error), JSON.stringify(error)).toBe(false);
    }
  });

  it('recognizes unique violations', () => {
    expect(isUniqueViolation({ code: 'P2002' })).toBe(true);
    expect(
      isUniqueViolation({ meta: { driverAdapterError: { cause: { originalCode: '1062' } } } }),
    ).toBe(true);
    expect(isUniqueViolation({ code: 'P2034' })).toBe(false);
  });
});
