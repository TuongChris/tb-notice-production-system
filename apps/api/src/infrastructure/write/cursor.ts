// Keyset pagination cursors (API_CONTRACT_v1 §5): lists are ordered by (createdAt DESC, id DESC);
// a cursor encodes a format version, the operation, a fingerprint of the list's scope and filters,
// and the sort tuple of the last returned row. It is authenticated with HMAC-SHA256 under a key
// derived from TB_SESSION_SECRET (domain-separated), so a modified, truncated or foreign cursor and
// a cursor replayed against a different filter or scope are rejected with 400 INVALID_CURSOR.
// The payload holds only values the client already received (a timestamp and an id): no SQL offset
// or server state.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { apiErrors } from '../http/api-error.js';
import { canonicalJson } from './request-digest.js';

const CURSOR_KEY_LABEL = 'tb/list-cursor/v1';
const CURSOR_VERSION = 1;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

export interface CursorPosition {
  readonly createdAt: Date;
  readonly id: string;
}

interface CursorPayload {
  readonly v: number;
  readonly o: string;
  readonly f: string;
  readonly t: number;
  readonly i: string;
}

/** Fingerprint of a list's operation, path scope and filters (absent filters are null). */
export function listFingerprint(
  operationId: string,
  filters: Readonly<Record<string, string | null>>,
): string {
  return createHash('sha256')
    .update(canonicalJson({ operationId, filters }), 'utf8')
    .digest('base64url')
    .slice(0, 22);
}

export class CursorCodec {
  private readonly key: Buffer;

  constructor(secret: Buffer) {
    this.key = createHmac('sha256', secret).update(CURSOR_KEY_LABEL, 'utf8').digest();
  }

  encode(operationId: string, fingerprint: string, position: CursorPosition): string {
    const payload: CursorPayload = {
      v: CURSOR_VERSION,
      o: operationId,
      f: fingerprint,
      t: position.createdAt.getTime(),
      i: position.id,
    };
    const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return `${body}.${this.mac(body)}`;
  }

  /** The position encoded in `cursor`; 400 INVALID_CURSOR for anything not issued for this list. */
  decode(operationId: string, fingerprint: string, cursor: string): CursorPosition {
    const parts = cursor.split('.');
    const [body, mac] = parts;
    if (parts.length !== 2 || !body || !mac || !BASE64URL.test(body) || !BASE64URL.test(mac)) {
      throw apiErrors.invalidCursor();
    }
    const expected = Buffer.from(this.mac(body), 'base64url');
    const presented = Buffer.from(mac, 'base64url');
    if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
      throw apiErrors.invalidCursor();
    }
    let payload: Partial<CursorPayload>;
    try {
      payload = JSON.parse(
        Buffer.from(body, 'base64url').toString('utf8'),
      ) as Partial<CursorPayload>;
    } catch {
      throw apiErrors.invalidCursor();
    }
    if (
      payload.v !== CURSOR_VERSION ||
      payload.o !== operationId ||
      payload.f !== fingerprint ||
      typeof payload.t !== 'number' ||
      !Number.isSafeInteger(payload.t) ||
      payload.t < 0 ||
      typeof payload.i !== 'string' ||
      !UUID.test(payload.i)
    ) {
      throw apiErrors.invalidCursor();
    }
    return { createdAt: new Date(payload.t), id: payload.i };
  }

  private mac(body: string): string {
    return createHmac('sha256', this.key).update(body, 'utf8').digest('base64url');
  }
}
