// Pre-parse request policy (exact Origin, JSON bodies) as a unit; the HTTP pipeline is covered by
// tests/db/auth-http.test.ts.
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../apps/api/src/infrastructure/http/api-error.js';
import {
  createRequestPolicyMiddleware,
  isJsonContentType,
  isSafeMethod,
} from '../../apps/api/src/infrastructure/http/request-middleware.js';

const allowed = new Set(['http://localhost:5173', 'http://127.0.0.1:5173']);
const policy = createRequestPolicyMiddleware(allowed);

function run(method: string, headers: Record<string, string>): ApiError | 'next' {
  let outcome: ApiError | 'next' = 'next';
  policy({ method, headers } as never, {} as never, (error?: unknown) => {
    outcome = error === undefined ? 'next' : (error as ApiError);
  });
  return outcome;
}

describe('request policy middleware', () => {
  it('passes safe requests without Origin and with an allowed Origin', () => {
    expect(run('GET', {})).toBe('next');
    expect(run('GET', { origin: 'http://localhost:5173' })).toBe('next');
  });

  it('rejects any request whose Origin is present but not exactly allowlisted', () => {
    for (const origin of [
      'http://evil.example',
      'http://localhost:5174',
      'null',
      'http://LOCALHOST:5173',
      'http://localhost:5173/',
    ]) {
      const outcome = run('GET', { origin });
      expect(outcome, origin).toBeInstanceOf(ApiError);
      expect((outcome as ApiError).code).toBe('ORIGIN_REJECTED');
    }
  });

  it('requires an allowed Origin on every unsafe method', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect((run(method, {}) as ApiError).code).toBe('ORIGIN_REJECTED');
      expect((run(method, { origin: 'null' }) as ApiError).code).toBe('ORIGIN_REJECTED');
      expect(run(method, { origin: 'http://127.0.0.1:5173' })).toBe('next');
    }
  });

  it('requires application/json for unsafe requests that carry a body', () => {
    const origin = 'http://localhost:5173';
    expect(run('POST', { origin, 'content-length': '0' })).toBe('next');
    expect(run('POST', { origin, 'content-length': '2', 'content-type': 'application/json' })).toBe(
      'next',
    );
    for (const type of [
      'text/plain',
      'application/x-www-form-urlencoded',
      'multipart/form-data; boundary=x',
    ]) {
      const outcome = run('POST', { origin, 'content-length': '2', 'content-type': type });
      expect((outcome as ApiError).code, type).toBe('UNSUPPORTED_CONTENT_TYPE');
    }
    expect((run('POST', { origin, 'transfer-encoding': 'chunked' }) as ApiError).code).toBe(
      'UNSUPPORTED_CONTENT_TYPE',
    );
  });

  it('classifies methods and JSON media types', () => {
    expect(['GET', 'head', 'OPTIONS'].every(isSafeMethod)).toBe(true);
    expect(['POST', 'DELETE', 'TRACE'].some(isSafeMethod)).toBe(false);
    expect(isJsonContentType('application/json')).toBe(true);
    expect(isJsonContentType('Application/JSON; charset=UTF-8')).toBe(true);
    expect(isJsonContentType('application/json; charset=latin1')).toBe(false);
    expect(isJsonContentType('application/json-patch+json')).toBe(false);
    expect(isJsonContentType(undefined)).toBe(false);
  });
});
