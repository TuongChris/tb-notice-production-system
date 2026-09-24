// Contract list pagination (API_CONTRACT_v1 §5): default 25, maximum 100 (the `limit` parameter
// schema), stable (createdAt DESC, id DESC) order, HMAC-protected cursors bound to the operation,
// its path scope and its filters.
import type { OperationSpec } from '@tb/contracts';
import { Prisma } from '../../../generated/prisma/client.js';
import { type CursorCodec, type CursorPosition, listFingerprint } from './cursor.js';
import { defaultLimit, type QueryValues } from './request-parsing.js';

export interface PageRequest {
  readonly operationId: string;
  readonly limit: number;
  readonly after: CursorPosition | undefined;
  readonly fingerprint: string;
}

/**
 * Resolves limit and cursor. `filters` must contain every filter that shapes the list (path scope
 * and query filters, null when absent): the cursor is only valid for exactly the same values.
 */
export function pageRequest(
  operation: OperationSpec,
  query: QueryValues,
  codec: CursorCodec,
  filters: Readonly<Record<string, string | null>>,
): PageRequest {
  const fingerprint = listFingerprint(operation.operationId, filters);
  const limit = typeof query['limit'] === 'number' ? query['limit'] : defaultLimit(operation);
  const cursor = query['cursor'];
  const after =
    typeof cursor === 'string'
      ? codec.decode(operation.operationId, fingerprint, cursor)
      : undefined;
  return { operationId: operation.operationId, limit, after, fingerprint };
}

/** The optional free-text filter `q`: absent or empty means no filter. */
export function searchText(query: QueryValues): string | null {
  const q = query['q'];
  return typeof q === 'string' && q !== '' ? q : null;
}

/**
 * `LIKE … ESCAPE '!'` pattern for a literal substring: the escape character and the LIKE wildcards
 * in the user's text match themselves.
 */
export function containsPattern(text: string): string {
  return `%${text.replace(/[!%_]/g, (character) => `!${character}`)}%`;
}

/**
 * Builds a page from `rows` fetched with LIMIT limit + 1, in list order. `nextCursor` points after
 * the last returned row and is null on the last page.
 */
export function toPage<Row extends { readonly createdAt: Date; readonly id: string }, Item>(
  rows: readonly Row[],
  request: PageRequest,
  codec: CursorCodec,
  view: (row: Row) => Item,
): { items: Item[]; nextCursor: string | null } {
  const page = rows.slice(0, request.limit);
  const last = page.at(-1);
  const nextCursor =
    rows.length > request.limit && last !== undefined
      ? codec.encode(request.operationId, request.fingerprint, {
          createdAt: last.createdAt,
          id: last.id,
        })
      : null;
  return { items: page.map(view), nextCursor };
}

/**
 * `AND (created_at, id) < (after.createdAt, after.id)` in (createdAt DESC, id DESC) order, for the
 * table alias given (or unqualified columns); empty for the first page.
 */
export function keysetAfter(after: CursorPosition | undefined, alias?: string): Prisma.Sql {
  if (after === undefined) return Prisma.empty;
  const column = (name: string) => Prisma.raw(alias === undefined ? name : `${alias}.${name}`);
  return Prisma.sql`AND (${column('created_at')} < ${after.createdAt} OR (${column('created_at')} = ${after.createdAt} AND ${column('id')} < ${after.id}))`;
}

/** Rows loaded by id, put back into the order of the id query. */
export function inIdOrder<Row extends { readonly id: string }>(
  ids: readonly { readonly id: string }[],
  rows: readonly Row[],
): Row[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap(({ id }) => {
    const row = byId.get(id);
    return row === undefined ? [] : [row];
  });
}

/** `LIMIT n` for a page query (n is a validated integer, so it is inlined). */
export function pageLimit(request: PageRequest): Prisma.Sql {
  return Prisma.raw(`LIMIT ${request.limit + 1}`);
}
