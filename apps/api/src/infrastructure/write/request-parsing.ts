// Request parsing against the ACTIVE contract (@tb/contracts operation metadata), so every
// implemented operation validates exactly the schemas the generated OpenAPI publishes:
//   body        → strict contract schema; failure is 422 VALIDATION_FAILED (unknown fields and an
//                 empty PATCH included — API_CONTRACT_v1 §4); issue paths and fixed messages only;
//   path id     → contract path-parameter schema; a value that can never name a record is 404;
//   query       → only the operation's declared parameters, each a single value matching its
//                 contract schema — an array parameter (style form, explode: the name repeated once
//                 per item) its items — and every parameter the contract marks required present;
//                 anything else is 400 INVALID_QUERY_PARAMETER.
// Text that MySQL utf8mb4 cannot store exactly (an unpaired UTF-16 surrogate) is rejected rather
// than silently replaced (service constraint; the stored value must equal the accepted value).
import {
  operations,
  wireRegistration,
  type InlineParameter,
  type OperationSpec,
} from '@tb/contracts';
import type { z } from 'zod';
import { apiErrors, type ValidationIssue } from '../http/api-error.js';

const byId = new Map<string, OperationSpec>(
  operations.map((operation) => [operation.operationId, operation]),
);

/** The contract operation metadata for `operationId` (throws on an unknown id: a wiring bug). */
export function contractOperation(operationId: string): OperationSpec {
  const operation = byId.get(operationId);
  if (!operation) throw new Error(`Unknown contract operation ${operationId}`);
  return operation;
}

const UNPAIRED_SURROGATE = /\p{Surrogate}/u;

function surrogateIssues(value: unknown, path: string[], issues: ValidationIssue[]): void {
  if (typeof value === 'string') {
    if (UNPAIRED_SURROGATE.test(value)) {
      issues.push({
        path: path.join('.') || '(body)',
        message: 'Contains an unpaired UTF-16 surrogate, which cannot be stored exactly',
      });
    }
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => surrogateIssues(item, [...path, String(index)], issues));
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) surrogateIssues(item, [...path, key], issues);
  }
}

/** Parses a JSON body with the operation's contract request schema (422 on any failure). */
export function parseBody<T>(operation: OperationSpec, body: unknown): T {
  const schema = operation.requestBody as z.ZodType<T> | undefined;
  if (schema === undefined) {
    // The operation takes no body (e.g. DELETE): a body is an unknown field by definition.
    if (body === undefined || body === null || isEmptyObject(body)) return undefined as T;
    throw apiErrors.bodyValidationFailed([
      { path: '(body)', message: 'This operation accepts no request body' },
    ]);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw apiErrors.bodyValidationFailed(
      parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.') || '(body)',
        // Fixed rule messages; unrecognized-key messages would echo client input.
        message: issue.code === 'unrecognized_keys' ? 'Unknown field' : issue.message,
      })),
    );
  }
  const issues: ValidationIssue[] = [];
  surrogateIssues(parsed.data, [], issues);
  if (issues.length > 0) throw apiErrors.bodyValidationFailed(issues);
  return parsed.data;
}

function isEmptyObject(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  );
}

function inlineParameters(operation: OperationSpec, location: 'path' | 'query'): InlineParameter[] {
  return operation.parameters.filter(
    (parameter): parameter is InlineParameter => 'in' in parameter && parameter.in === location,
  );
}

/** Validates a path parameter with its contract schema; 404 when it cannot name a record. */
export function parsePathParam(operation: OperationSpec, name: string, value: unknown): string {
  const spec = inlineParameters(operation, 'path').find((parameter) => parameter.name === name);
  if (!spec) throw new Error(`${operation.operationId} has no path parameter ${name}`);
  if (typeof value !== 'string' || !spec.schema.safeParse(value).success) {
    throw apiErrors.notFound();
  }
  return value;
}

export type QueryValue = string | number | readonly string[];
export type QueryValues = Readonly<Record<string, QueryValue | undefined>>;

/**
 * Validates the query string against the operation's declared query parameters. Integers are
 * accepted only as plain decimal digits. An array parameter (style form, explode) is the name
 * repeated once per item (`?a=x&a=y`; one occurrence is a one-item array); its items and bounds
 * are checked with the contract array schema. A parameter the contract marks required must be
 * present. Returns only declared parameters that were present.
 */
export function parseQuery(operation: OperationSpec, raw: unknown): QueryValues {
  const specs = inlineParameters(operation, 'query');
  const values: Record<string, QueryValue | undefined> = {};
  const query = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  for (const [name, value] of Object.entries(query)) {
    const spec = specs.find((parameter) => parameter.name === name);
    if (!spec) throw apiErrors.invalidQueryParameter(name);
    if (wireRegistration(spec.schema)?.lowering.kind === 'array') {
      const items =
        typeof value === 'string'
          ? [value]
          : Array.isArray(value) && value.every((item) => typeof item === 'string')
            ? (value as string[])
            : null;
      if (items === null || !spec.schema.safeParse(items).success) {
        throw apiErrors.invalidQueryParameter(name);
      }
      values[name] = items;
      continue;
    }
    if (typeof value !== 'string') throw apiErrors.invalidQueryParameter(name);
    if (wireRegistration(spec.schema)?.lowering.kind === 'integer') {
      if (!/^(0|[1-9][0-9]*)$/.test(value)) throw apiErrors.invalidQueryParameter(name);
      const number = Number(value);
      if (!spec.schema.safeParse(number).success) throw apiErrors.invalidQueryParameter(name);
      values[name] = number;
    } else {
      if (!spec.schema.safeParse(value).success) throw apiErrors.invalidQueryParameter(name);
      values[name] = value;
    }
  }
  for (const spec of specs) {
    if (spec.required && values[spec.name] === undefined) {
      throw apiErrors.invalidQueryParameter(spec.name);
    }
  }
  return values;
}

/** Contract default page size (the `limit` parameter's documented default). */
export function defaultLimit(operation: OperationSpec): number {
  const limit = inlineParameters(operation, 'query').find(
    (parameter) => parameter.name === 'limit',
  );
  if (limit?.schemaDefault === undefined) throw new Error(`${operation.operationId} has no limit`);
  return limit.schemaDefault;
}
