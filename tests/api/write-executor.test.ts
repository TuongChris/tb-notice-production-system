// WriteExecutor against an in-memory fake of the idempotency table and transactions. Covers what a
// real database cannot produce on demand: deadlock retries and their bound, claim release after any
// failure, and the structural guarantees that conditional operations check their contract
// precondition target. The real MySQL behaviour is covered by tests/db/directory-http.test.ts.
import { describe, expect, it } from 'vitest';
import type { AuditEntry } from '../../apps/api/src/infrastructure/audit/audit-log.js';
import { ApiError } from '../../apps/api/src/infrastructure/http/api-error.js';
import type { AuditWriter } from '../../apps/api/src/infrastructure/write/audit-writer.js';
import {
  WriteExecutor,
  type WriteCommand,
  type WriteContext,
  type WriteOutcome,
} from '../../apps/api/src/infrastructure/write/write-executor.js';

const ID = '3f2b8c1e-8a55-4f0e-9c1d-2b7e6a4d9f10';
const NOW = new Date('2026-09-24T00:00:00.000Z');

interface Row {
  id: string;
  actorUserId: string;
  operationId: string;
  idempotencyKey: string;
  requestSha256: string;
  state: 'IN_PROGRESS' | 'COMPLETED';
  responseStatus: number | null;
  responseJson: unknown;
  resourceType: string | null;
  resourceId: string | null;
  expiresAt: Date;
  createdAt: Date;
}

class FakeDatabase {
  rows: Row[] = [];
  transactions = 0;
  failures: unknown[] = [];
  private sequence = 0;

  readonly idempotencyRecord = {
    create: async ({
      data,
    }: {
      data: Omit<Row, 'id' | 'responseStatus' | 'responseJson' | 'resourceType' | 'resourceId'>;
    }) => {
      if (
        this.rows.some(
          (row) =>
            row.actorUserId === data.actorUserId &&
            row.operationId === data.operationId &&
            row.idempotencyKey === data.idempotencyKey,
        )
      ) {
        throw Object.assign(new Error('duplicate'), { code: 'P2002' });
      }
      const row: Row = {
        ...data,
        id: `record-${(this.sequence += 1)}`,
        responseStatus: null,
        responseJson: null,
        resourceType: null,
        resourceId: null,
      };
      this.rows.push(row);
      return { id: row.id };
    },
    findUnique: async ({
      where,
    }: {
      where: {
        actorUserId_operationId_idempotencyKey: Pick<
          Row,
          'actorUserId' | 'operationId' | 'idempotencyKey'
        >;
      };
    }) => {
      const key = where.actorUserId_operationId_idempotencyKey;
      return (
        this.rows.find(
          (row) =>
            row.actorUserId === key.actorUserId &&
            row.operationId === key.operationId &&
            row.idempotencyKey === key.idempotencyKey,
        ) ?? null
      );
    },
    deleteMany: async ({ where }: { where: { id: string; state?: string } }) => {
      const before = this.rows.length;
      this.rows = this.rows.filter(
        (row) => !(row.id === where.id && (where.state === undefined || row.state === where.state)),
      );
      return { count: before - this.rows.length };
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { id: string; state: string };
      data: Partial<Row>;
    }) => {
      const row = this.rows.find((item) => item.id === where.id && item.state === where.state);
      if (!row) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    },
  };

  async $transaction<T>(work: (tx: this) => Promise<T>): Promise<T> {
    this.transactions += 1;
    const failure = this.failures.shift();
    const snapshot = this.rows.map((row) => ({ ...row }));
    try {
      const result = await work(this);
      if (failure !== undefined) throw failure; // fails at commit: nothing persists
      return result;
    } catch (error) {
      this.rows = snapshot; // rollback
      throw error;
    }
  }
}

class RecordingAudit {
  entries: AuditEntry[] = [];
  async append(_tx: unknown, entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
}

function setup() {
  const db = new FakeDatabase();
  const audit = new RecordingAudit();
  const executor = new WriteExecutor(
    db as never,
    { now: () => NOW },
    audit as unknown as AuditWriter,
  );
  return { db, audit, executor };
}

const requester = (overrides: Partial<WriteCommand['requester']> = {}) => ({
  actorUserId: 'user-1',
  requestId: 'request-1',
  idempotencyKey: 'key-0123456789abcdef',
  ifMatch: `"Agency:${ID}:v1"`,
  ...overrides,
});

const patchCommand = (overrides: Partial<WriteCommand['requester']> = {}): WriteCommand => ({
  operationId: 'patchAgency',
  pathParams: { id: ID },
  body: { phone: '1' },
  requester: requester(overrides),
});

async function patchWork(context: WriteContext): Promise<WriteOutcome> {
  context.checkPrecondition({ entityType: 'Agency', id: ID, rowVersion: 1 });
  await context.audit({ action: 'AGENCY_UPDATED', entityType: 'Agency', entityId: ID });
  return {
    status: 200,
    resource: { type: 'Agency', id: ID },
    data: { id: ID, rowVersion: 2 },
    affected: [{ type: 'Agency', id: ID, rowVersion: 2 }],
  };
}

const deadlock = () => Object.assign(new Error('deadlock'), { code: 'P2034' });

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection');
}

describe('WriteExecutor', () => {
  it('commits the change, its audit event and the completed idempotency record together', async () => {
    const { db, audit, executor } = setup();
    const reply = await executor.execute(patchCommand(), patchWork);
    expect(reply).toMatchObject({ status: 200, etag: `"Agency:${ID}:v2"`, replayed: false });
    expect(reply.body?.meta).toEqual({
      requestId: 'request-1',
      affectedResources: [{ type: 'Agency', id: ID, rowVersion: 2 }],
    });
    expect(audit.entries).toEqual([
      expect.objectContaining({
        actorUserId: 'user-1',
        requestId: 'request-1',
        action: 'AGENCY_UPDATED',
      }),
    ]);
    expect(db.rows).toEqual([
      expect.objectContaining({
        state: 'COMPLETED',
        responseStatus: 200,
        resourceType: 'Agency',
        resourceId: ID,
        expiresAt: new Date(NOW.getTime() + 7 * 24 * 3600 * 1000),
      }),
    ]);
    const replay = await executor.execute(patchCommand({ requestId: 'request-2' }), patchWork);
    expect(replay).toMatchObject({ status: 200, etag: `"Agency:${ID}:v2"`, replayed: true });
    expect(replay.body?.meta.requestId).toBe('request-2');
    expect(db.transactions).toBe(1);
  });

  it('retries deadlocks with the same claim and succeeds within three attempts', async () => {
    const { db, executor } = setup();
    db.failures = [deadlock(), deadlock()];
    const reply = await executor.execute(patchCommand(), patchWork);
    expect(reply.status).toBe(200);
    expect(db.transactions).toBe(3);
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]?.state).toBe('COMPLETED');
  });

  it('gives up after three attempts with 409 RETRYABLE_TRANSACTION_CONFLICT and releases the claim', async () => {
    const { db, executor } = setup();
    db.failures = [deadlock(), deadlock(), deadlock()];
    const error = await rejection(executor.execute(patchCommand(), patchWork));
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('RETRYABLE_TRANSACTION_CONFLICT');
    expect(db.transactions).toBe(3);
    expect(db.rows).toEqual([]);
  });

  it('does not retry other failures and never stores them for replay', async () => {
    const { db, executor } = setup();
    db.failures = [new Error('constraint')];
    await expect(executor.execute(patchCommand(), patchWork)).rejects.toThrow('constraint');
    expect(db.transactions).toBe(1);
    expect(db.rows).toEqual([]);
    const stale = await rejection(
      executor.execute(patchCommand({ ifMatch: `"Agency:${ID}:v9"` }), patchWork),
    );
    expect((stale as ApiError).status).toBe(412);
    expect(db.rows).toEqual([]);
  });

  it('checks Idempotency-Key and If-Match presence before any claim', async () => {
    const { db, executor } = setup();
    const noKey = await rejection(
      executor.execute(patchCommand({ idempotencyKey: undefined }), patchWork),
    );
    expect((noKey as ApiError).status).toBe(400);
    const noIfMatch = await rejection(
      executor.execute(patchCommand({ ifMatch: undefined }), patchWork),
    );
    expect((noIfMatch as ApiError).status).toBe(428);
    expect(db.rows).toEqual([]);
    expect(db.transactions).toBe(0);
  });

  it('a conditional operation whose work skips or misdirects its precondition fails closed', async () => {
    const { db, executor } = setup();
    await expect(
      executor.execute(patchCommand(), async () => ({
        status: 200,
        resource: { type: 'Agency', id: ID },
        data: { id: ID, rowVersion: 2 },
        affected: [],
      })),
    ).rejects.toThrow('precondition was not checked');
    await expect(
      executor.execute(
        patchCommand({ idempotencyKey: 'key-other-0123456789' }),
        async (context) => {
          context.checkPrecondition({ entityType: 'Owner', id: ID, rowVersion: 1 });
          return { status: 200, resource: { type: 'Agency', id: ID }, affected: [] };
        },
      ),
    ).rejects.toThrow('precondition target is Agency, not Owner');
    expect(db.rows).toEqual([]);
  });

  it('refuses operations that are not idempotent writes in the contract', async () => {
    const { executor } = setup();
    await expect(
      executor.execute({ ...patchCommand(), operationId: 'getAgency' }, patchWork),
    ).rejects.toThrow('not an idempotent write');
  });
});
