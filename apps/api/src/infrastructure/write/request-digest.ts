// Idempotency request digest (API_CONTRACT_v1 §7, INVARIANTS §5): SHA-256 over the canonical JSON
// of operationId + method + normalized path (path parameters substituted into the contract path
// template, so query strings, trailing slashes and letter case of the static segments cannot change
// it) + the request body. Headers such as If-Match are not part of the digest: a retry of an
// accepted request must replay its stored result even though the record's version moved on.
import { createHash } from 'node:crypto';

/**
 * TB canonical JSON (INVARIANTS §6, the subset needed for request bodies): object keys sorted in
 * JavaScript UTF-16 order, arrays kept in order, no whitespace. Only JSON values are accepted.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value)) throw new Error('canonicalJson: non-finite number');
      return JSON.stringify(value);
    case 'object': {
      if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
    }
    default:
      throw new Error(`canonicalJson: unsupported ${typeof value}`);
  }
}

export interface DigestInput {
  readonly operationId: string;
  readonly method: string;
  /** Contract path with its parameters substituted, e.g. `/agencies/<uuid>/archive`. */
  readonly path: string;
  /** Parsed JSON request body, or null when the operation takes none. */
  readonly body: unknown;
}

export function requestDigest(input: DigestInput): string {
  const canonical = canonicalJson({
    operationId: input.operationId,
    method: input.method.toUpperCase(),
    path: input.path,
    body: input.body ?? null,
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/** Substitutes `{name}` parameters into a contract path template. */
export function contractPath(template: string, params: Readonly<Record<string, string>>): string {
  return template.replace(/\{([A-Za-z]+)\}/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`contractPath: missing path parameter ${name}`);
    return value;
  });
}
