// yarn ui:sandbox owns the rows of tb_notice_test only after it verified, itself, that the schema is
// tb_notice_test and every sandbox table is empty (R14-AUD-004). Before that its cleanup is
// disarmed: a refused guard, a start-up error or a signal closes only what the process opened and
// issues no UPDATE or DELETE. No database is used: a stand-in connection records every statement
// and holds the row counts; nothing real is ever deleted.
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SANDBOX_POINTERS,
  SANDBOX_TABLES,
  sandboxLifecycle,
  stopOnSignals,
  type SandboxDatabase,
} from '../../scripts/local/sandbox-lifecycle.ts';

const repoRoot = path.resolve(import.meta.dirname, '../..');

/** The expected owned teardown: every pointer cleared, then every table emptied in FK order. */
const CLEANUP = [...SANDBOX_POINTERS, ...SANDBOX_TABLES.map((table) => `DELETE FROM \`${table}\``)];

interface FakeDatabase extends SandboxDatabase {
  readonly queries: string[];
  /** Every UPDATE / DELETE issued: the cleanup statements. */
  readonly writes: string[];
  readonly rows: Map<string, number>;
  /** When set, the next query waits until `release()` is called (a check still in flight). */
  hold: boolean;
  release: () => void;
  failWrites: boolean;
}

function fakeDatabase(options: { schema?: string; rows?: Record<string, number> } = {}) {
  const db: FakeDatabase = {
    queries: [],
    writes: [],
    rows: new Map(Object.entries(options.rows ?? {})),
    hold: false,
    release: () => undefined,
    failWrites: false,
    async $queryRawUnsafe<T>(sql: string): Promise<T> {
      if (db.hold) {
        db.hold = false;
        await new Promise<void>((resolve) => {
          db.release = resolve;
        });
      }
      db.queries.push(sql);
      if (sql === 'SELECT DATABASE() AS db') {
        return [{ db: options.schema ?? 'tb_notice_test' }] as T;
      }
      const table = /FROM `(\w+)`/.exec(sql)?.[1];
      if (!table) throw new Error(`unexpected query ${sql}`);
      return [{ n: BigInt(db.rows.get(table) ?? 0) }] as T;
    },
    async $executeRawUnsafe(sql: string): Promise<number> {
      if (db.failWrites) throw new Error('SYNTHETIC write failure');
      db.writes.push(sql);
      const table = /^DELETE FROM `(\w+)`$/.exec(sql)?.[1];
      if (table) db.rows.set(table, 0);
      return 0;
    },
  };
  return db;
}

function harness(db: FakeDatabase) {
  const events: string[] = [];
  let exited: (code: number) => void = () => undefined;
  const exit = new Promise<number>((resolve) => {
    exited = resolve;
  });
  const lifecycle = sandboxLifecycle({
    db,
    closeOwnResources: async () => {
      events.push('close own resources');
    },
    disconnect: async () => {
      events.push('disconnect');
    },
    exit: (code) => {
      events.push(`exit ${code}`);
      exited(code);
    },
    log: (message) => events.push(`log ${message}`),
    error: (message) => events.push(`error ${message}`),
  });
  return { lifecycle, events, exit };
}

const NOT_ARMED =
  'log cleanup not armed: this run never verified an empty tb_notice_test, so no row was updated or deleted';

describe('ui:sandbox cleanup ownership — disarmed until the empty-start check passes', () => {
  it('a row that was already in tb_notice_test refuses the start, and the teardown issues no UPDATE or DELETE: the row stays', async () => {
    const db = fakeDatabase({ rows: { cases: 2, source_references: 1 } });
    const { lifecycle, events } = harness(db);
    await expect(lifecycle.claimEmptyStart()).rejects.toThrow(
      'tb_notice_test is not empty before start (cases=2, source_references=1); refusing',
    );
    expect(lifecycle.cleanupArmed).toBe(false);
    await lifecycle.stop(1);
    expect(db.writes).toEqual([]);
    expect(Object.fromEntries(db.rows)).toEqual({ cases: 2, source_references: 1 });
    expect(events).toEqual([
      'log stopping…',
      'close own resources',
      NOT_ARMED,
      'disconnect',
      'exit 1',
    ]);
  });

  it('a connection on another schema is refused before any count, and nothing is updated or deleted there', async () => {
    const db = fakeDatabase({ schema: 'tb_notice_dev', rows: { agencies: 5 } });
    const { lifecycle } = harness(db);
    await expect(lifecycle.claimEmptyStart()).rejects.toThrow(
      'connected to tb_notice_dev, not tb_notice_test',
    );
    await lifecycle.stop(1);
    expect(db.queries).toEqual(['SELECT DATABASE() AS db']);
    expect(db.writes).toEqual([]);
    expect(db.rows.get('agencies')).toBe(5);
  });

  it('Ctrl+C or SIGTERM before the empty-start check closes only what the process opened: no statement at all', async () => {
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      const db = fakeDatabase({ rows: { users: 1 } });
      const { lifecycle, events, exit } = harness(db);
      const process = new EventEmitter();
      stopOnSignals(process, lifecycle);
      process.emit(signal);
      expect(await exit).toBe(0);
      expect(db.queries, signal).toEqual([]);
      expect(db.writes, signal).toEqual([]);
      expect(db.rows.get('users'), signal).toBe(1);
      expect(events, signal).toEqual([
        'log stopping…',
        'close own resources',
        NOT_ARMED,
        'disconnect',
        'exit 0',
      ]);
    }
  });

  it('a signal while the empty-start check is still running leaves the cleanup disarmed, also after the check then passes', async () => {
    const db = fakeDatabase();
    const { lifecycle, exit } = harness(db);
    const process = new EventEmitter();
    stopOnSignals(process, lifecycle);
    db.hold = true;
    const claim = lifecycle.claimEmptyStart();
    process.emit('SIGINT');
    expect(await exit).toBe(0);
    db.release();
    await claim;
    expect(lifecycle.cleanupArmed).toBe(false);
    expect(db.writes).toEqual([]);
  });

  it('an empty start arms the cleanup; the teardown then deletes every sandbox row in foreign-key order and verifies the tables are empty again', async () => {
    const db = fakeDatabase();
    const { lifecycle, events } = harness(db);
    await lifecycle.claimEmptyStart();
    expect(lifecycle.cleanupArmed).toBe(true);
    // What the running sandbox wrote after it owned the schema.
    db.rows.set('cases', 3);
    db.rows.set('users', 1);
    db.queries.length = 0;
    await lifecycle.stop(0);
    expect(db.writes).toEqual(CLEANUP);
    expect([...db.rows.values()].every((count) => count === 0)).toBe(true);
    expect(db.queries).toEqual([
      'SELECT DATABASE() AS db',
      ...SANDBOX_TABLES.map((table) => `SELECT COUNT(*) AS n FROM \`${table}\``),
    ]);
    expect(events).toEqual([
      'log stopping…',
      'close own resources',
      'log sandbox rows deleted; tb_notice_test is empty again',
      'disconnect',
      'exit 0',
    ]);
  });

  it('a signal after the empty start runs the owned teardown once; a second signal does nothing more', async () => {
    const db = fakeDatabase();
    const { lifecycle, events, exit } = harness(db);
    const process = new EventEmitter();
    stopOnSignals(process, lifecycle);
    await lifecycle.claimEmptyStart();
    process.emit('SIGTERM');
    process.emit('SIGINT');
    expect(await exit).toBe(0);
    expect(db.writes).toEqual(CLEANUP);
    expect(events.filter((event) => event.startsWith('exit'))).toEqual(['exit 0']);
  });

  it('an owned teardown whose cleanup fails is reported and exits 1', async () => {
    const db = fakeDatabase();
    const { lifecycle, events } = harness(db);
    await lifecycle.claimEmptyStart();
    db.failWrites = true;
    await lifecycle.stop(0);
    expect(events).toContain('error cleanup FAILED: SYNTHETIC write failure');
    expect(events.at(-1)).toBe('exit 1');
  });

  it('the teardown covers every table of the committed migration once (the P4H assessment tables included), in an order its foreign keys allow: a referencing table is emptied first, or its pointer is cleared first', () => {
    const migration = readFileSync(
      path.join(repoRoot, 'apps/api/prisma/migrations/20260923103912_initial_schema/migration.sql'),
      'utf8',
    );
    const tables = [...migration.matchAll(/CREATE TABLE `(\w+)`/g)].map((match) => match[1]);
    expect([...SANDBOX_TABLES].sort()).toEqual([...tables].sort());
    expect(new Set(SANDBOX_TABLES).size).toBe(SANDBOX_TABLES.length);
    expect(SANDBOX_TABLES).toEqual(
      expect.arrayContaining(['candidate_assessments', 'assessment_sources']),
    );
    const cleared = SANDBOX_POINTERS.map((statement) => ({
      table: /^UPDATE `(\w+)`/.exec(statement)?.[1],
      columns: [...statement.matchAll(/`(\w+)` = NULL/g)].map((match) => match[1]),
    }));
    const foreignKeys = [
      ...migration.matchAll(
        /ALTER TABLE `(\w+)` ADD CONSTRAINT `(\w+)` FOREIGN KEY \(([^)]*)\) REFERENCES `(\w+)`/g,
      ),
    ].map((match) => ({
      from: match[1] as string,
      name: match[2] as string,
      columns: [...(match[3] ?? '').matchAll(/`(\w+)`/g)].map((column) => column[1]),
      to: match[4] as string,
    }));
    expect(foreignKeys.length).toBeGreaterThan(100);
    const order = SANDBOX_TABLES as readonly string[];
    const blocked = foreignKeys.filter(
      (key) =>
        order.indexOf(key.from) >= order.indexOf(key.to) &&
        !cleared.some(
          (pointer) =>
            pointer.table === key.from &&
            key.columns.every((column) => pointer.columns.includes(column)),
        ),
    );
    expect(blocked.map((key) => key.name)).toEqual([]);
  });

  it('the script cleans up only through the lifecycle: signals, the empty-start check and every failure go through it', () => {
    const script = readFileSync(path.join(repoRoot, 'scripts/local/ui-sandbox.ts'), 'utf8');
    const code = script.replace(/^\s*\/\/.*$/gm, '');
    expect(code).toContain("from './sandbox-lifecycle.ts'");
    expect(code).toContain('stopOnSignals(process, lifecycle);');
    expect(code).toContain('await lifecycle.claimEmptyStart();');
    expect(code).toContain('await lifecycle.stop(1);');
    expect(code).not.toMatch(/process\.on\(|\$executeRawUnsafe|DELETE FROM|UPDATE `|cleanup\(/);
    const lifecycleModule = readFileSync(
      path.join(repoRoot, 'scripts/local/sandbox-lifecycle.ts'),
      'utf8',
    );
    // The only call of the cleanup is the armed branch of stop().
    expect(lifecycleModule.match(/await cleanup\(/g)).toHaveLength(1);
    expect(lifecycleModule).toMatch(/if \(cleanupArmed\) \{\s*try \{\s*await cleanup\(/);
  });
});
