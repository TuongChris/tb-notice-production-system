// Verifies an applied TB schema against MySQL's own metadata (P0-C5, AR-010, ADR-0001).
//
//   node scripts/db/verify-metadata.mjs <test|replay|dev> [--json-out <file>] [--expect-empty]
//
// Expected inventory: parsed from the committed, reviewed initial migration and cross-checked
// against the fixed inventory counts (33 tables, 541 columns, 50 unique keys, 34 indexes, 125 FKs,
// 30 CHECKs). Actual state: information_schema only (TABLES, COLUMNS, STATISTICS,
// REFERENTIAL_CONSTRAINTS, KEY_COLUMN_USAGE, TABLE_CONSTRAINTS, CHECK_CONSTRAINTS, SCHEMATA) plus
// Prisma's _prisma_migrations bookkeeping rows. Read-only: it issues SELECT statements only.
// Prisma's `_prisma_migrations` table is excluded from the domain inventory.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createConnection } from 'mariadb';
import {
  canonicalCheck,
  expectedMysqlColumnDefault,
  expectedMysqlColumnType,
  isCharacterColumnType,
  parseSchema,
  summarize,
  unescapeMysqlCheckClause,
} from './lib/ddl.mjs';
import { driverConfig, loadRootEnv, repoRoot, resolveTarget } from './lib/targets.mjs';

const MIGRATION_NAME = '20260923103912_initial_schema';
const MIGRATION_FILE = path.join(
  repoRoot,
  'apps/api/prisma/migrations',
  MIGRATION_NAME,
  'migration.sql',
);
const PRISMA_TABLE = '_prisma_migrations';
const INVENTORY = Object.freeze({
  tables: 33,
  columns: 541,
  uniques: 50,
  indexes: 34,
  foreignKeys: 125,
  checks: 30,
});
const REQUIRED_COLLATION = 'utf8mb4_0900_bin';
const REQUIRED_CHARSET = 'utf8mb4';

const args = process.argv.slice(2);
const targetName = args[0];
const jsonOut = args.includes('--json-out') ? args[args.indexOf('--json-out') + 1] : null;
const expectEmpty = args.includes('--expect-empty');

loadRootEnv();

const failures = [];
const fail = (area, detail) => failures.push({ area, ...detail });

function expectedModel() {
  const sql = readFileSync(MIGRATION_FILE);
  const model = parseSchema(sql.toString('utf8'));
  const counts = summarize(model);
  for (const [key, value] of Object.entries(INVENTORY)) {
    if (counts[key] !== value) {
      throw new Error(
        `Reviewed migration inventory mismatch: ${key}=${counts[key]}, expected ${value}`,
      );
    }
  }
  return { model, counts, sha256: createHash('sha256').update(sql).digest('hex') };
}

async function main() {
  const resolved = resolveTarget(targetName, ['test', 'replay', 'dev']);
  const schema = resolved.schema;
  const expected = expectedModel();
  const conn = await createConnection(driverConfig(resolved));
  const q = (sql, params = []) => conn.query({ sql, bigIntAsNumber: true }, params);
  try {
    const [server] = await q(
      'SELECT VERSION() AS version, @@version_comment AS comment, @@sql_mode AS sqlMode, ' +
        'CURRENT_USER() AS currentUser, DATABASE() AS db, @@session.time_zone AS sessionTz, ' +
        '@@session.collation_connection AS sessionCollation',
    );
    const [schemaRow] = await q(
      'SELECT DEFAULT_CHARACTER_SET_NAME AS charset, DEFAULT_COLLATION_NAME AS collation ' +
        'FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?',
      [schema],
    );

    // --- Tables -------------------------------------------------------------------------------
    const tableRows = await q(
      'SELECT TABLE_NAME AS name, ENGINE AS engine, TABLE_COLLATION AS collation, TABLE_TYPE AS type ' +
        'FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?',
      [schema],
    );
    const actualTables = new Map(tableRows.map((r) => [r.name, r]));
    const domainTableNames = [...expected.model.keys()].sort();
    for (const name of domainTableNames) {
      const row = actualTables.get(name);
      if (!row) {
        fail('table', { table: name, issue: 'missing' });
        continue;
      }
      if (row.type !== 'BASE TABLE') fail('table', { table: name, issue: `type ${row.type}` });
      if (row.engine !== 'InnoDB') fail('table engine', { table: name, actual: row.engine });
      if (row.collation !== REQUIRED_COLLATION) {
        fail('table collation', { table: name, actual: row.collation });
      }
    }
    const unexpectedTables = [...actualTables.keys()].filter(
      (n) => !expected.model.has(n) && n !== PRISMA_TABLE,
    );
    for (const name of unexpectedTables) fail('table', { table: name, issue: 'unexpected table' });

    // --- Columns ------------------------------------------------------------------------------
    const columnRows = await q(
      'SELECT TABLE_NAME AS tableName, COLUMN_NAME AS name, ORDINAL_POSITION AS position, ' +
        'COLUMN_TYPE AS columnType, IS_NULLABLE AS nullable, COLUMN_DEFAULT AS columnDefault, ' +
        'EXTRA AS extra, CHARACTER_SET_NAME AS charset, COLLATION_NAME AS collation ' +
        'FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION',
      [schema],
    );
    const columnsByTable = new Map();
    for (const row of columnRows) {
      if (!expected.model.has(row.tableName)) continue;
      if (!columnsByTable.has(row.tableName)) columnsByTable.set(row.tableName, new Map());
      columnsByTable.get(row.tableName).set(row.name, row);
    }
    let columnsVerified = 0;
    let characterColumns = 0;
    const columnOrderDifferences = [];
    for (const [tableName, table] of expected.model) {
      const actual = columnsByTable.get(tableName) ?? new Map();
      for (const col of table.columns) {
        const row = actual.get(col.name);
        if (!row) {
          fail('column', { table: tableName, column: col.name, issue: 'missing' });
          continue;
        }
        const where = { table: tableName, column: col.name };
        const expectedType = expectedMysqlColumnType(col.type);
        if (row.columnType !== expectedType) {
          fail('column type', { ...where, expected: expectedType, actual: row.columnType });
        }
        if ((row.nullable === 'YES') !== col.nullable) {
          fail('column nullability', { ...where, expected: col.nullable, actual: row.nullable });
        }
        const expectedDefault = expectedMysqlColumnDefault(col.default);
        if ((row.columnDefault ?? null) !== expectedDefault) {
          fail('column default', {
            ...where,
            expected: expectedDefault,
            actual: row.columnDefault,
          });
        }
        const allowedExtra = expectedDefault?.startsWith('CURRENT_TIMESTAMP')
          ? 'DEFAULT_GENERATED'
          : '';
        if (row.extra !== allowedExtra) {
          fail('column extra', { ...where, expected: allowedExtra, actual: row.extra });
        }
        if (isCharacterColumnType(row.columnType)) {
          characterColumns += 1;
          if (row.collation !== REQUIRED_COLLATION || row.charset !== REQUIRED_CHARSET) {
            fail('column collation', { ...where, charset: row.charset, collation: row.collation });
          }
        } else if (row.collation !== null && !row.columnType.startsWith('json')) {
          fail('column collation', {
            ...where,
            issue: 'unexpected collation on non-character column',
          });
        }
        columnsVerified += 1;
      }
      for (const name of actual.keys()) {
        if (!table.columns.some((c) => c.name === name)) {
          fail('column', { table: tableName, column: name, issue: 'unexpected column' });
        }
      }
      const expectedOrder = table.columns.map((c) => c.name).join(',');
      const actualOrder = [...actual.keys()].join(',');
      if (expectedOrder !== actualOrder) columnOrderDifferences.push(tableName);
    }

    // --- Indexes (STATISTICS) -------------------------------------------------------------------
    const statRows = await q(
      'SELECT TABLE_NAME AS tableName, INDEX_NAME AS indexName, NON_UNIQUE AS nonUnique, ' +
        'SEQ_IN_INDEX AS seq, COLUMN_NAME AS columnName, SUB_PART AS subPart, COLLATION AS dir ' +
        'FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX',
      [schema],
    );
    const indexes = new Map();
    for (const row of statRows) {
      if (!expected.model.has(row.tableName)) continue;
      const key = `${row.tableName}.${row.indexName}`;
      if (!indexes.has(key)) {
        indexes.set(key, {
          table: row.tableName,
          name: row.indexName,
          unique: Number(row.nonUnique) === 0,
          columns: [],
        });
      }
      indexes
        .get(key)
        .columns.push(
          row.columnName +
            (row.subPart ? `(${row.subPart})` : '') +
            (row.dir === 'D' ? ' DESC' : ''),
        );
    }
    const sameColumns = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const consumed = new Set();
    let primaryKeysVerified = 0;
    let uniquesVerified = 0;
    let indexesVerified = 0;
    for (const [tableName, table] of expected.model) {
      const pk = indexes.get(`${tableName}.PRIMARY`);
      if (!pk || !pk.unique || !sameColumns(pk.columns, table.primaryKey)) {
        fail('primary key', { table: tableName, expected: table.primaryKey, actual: pk?.columns });
      } else {
        primaryKeysVerified += 1;
        consumed.add(`${tableName}.PRIMARY`);
      }
      for (const [kind, list, unique] of [
        ['unique key', table.uniques, true],
        ['index', table.indexes, false],
      ]) {
        for (const idx of list) {
          const key = `${tableName}.${idx.name}`;
          const actual = indexes.get(key);
          if (!actual || actual.unique !== unique || !sameColumns(actual.columns, idx.columns)) {
            fail(kind, {
              table: tableName,
              name: idx.name,
              expected: idx.columns,
              actual: actual?.columns,
            });
            continue;
          }
          consumed.add(key);
          if (unique) uniquesVerified += 1;
          else indexesVerified += 1;
        }
      }
    }
    // MySQL creates an index for a foreign key only when no usable index exists; such implicit
    // indexes carry the FK constraint name. Anything else is unexpected.
    const fkNamesByTable = new Map();
    for (const [tableName, table] of expected.model) {
      fkNamesByTable.set(tableName, new Set(table.foreignKeys.map((fk) => fk.name)));
    }
    const implicitFkIndexes = [];
    for (const [key, idx] of indexes) {
      if (consumed.has(key)) continue;
      if (!idx.unique && fkNamesByTable.get(idx.table)?.has(idx.name)) {
        implicitFkIndexes.push(`${idx.table}.${idx.name}(${idx.columns.join(',')})`);
      } else {
        fail('index', {
          table: idx.table,
          name: idx.name,
          issue: 'unexpected index',
          columns: idx.columns,
        });
      }
    }

    // --- Foreign keys ---------------------------------------------------------------------------
    const refRows = await q(
      'SELECT CONSTRAINT_NAME AS name, TABLE_NAME AS tableName, REFERENCED_TABLE_NAME AS refTable, ' +
        'UPDATE_RULE AS updateRule, DELETE_RULE AS deleteRule, MATCH_OPTION AS matchOption ' +
        'FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = ?',
      [schema],
    );
    const kcuRows = await q(
      'SELECT CONSTRAINT_NAME AS name, TABLE_NAME AS tableName, COLUMN_NAME AS columnName, ' +
        'ORDINAL_POSITION AS position, REFERENCED_TABLE_SCHEMA AS refSchema, ' +
        'REFERENCED_TABLE_NAME AS refTable, REFERENCED_COLUMN_NAME AS refColumn ' +
        'FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL ' +
        'ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION',
      [schema],
    );
    const actualFks = new Map();
    for (const row of refRows) {
      actualFks.set(`${row.tableName}.${row.name}`, {
        ...row,
        columns: [],
        refColumns: [],
        refSchemas: new Set(),
      });
    }
    for (const row of kcuRows) {
      const fk = actualFks.get(`${row.tableName}.${row.name}`);
      if (!fk) continue;
      fk.columns.push(row.columnName);
      fk.refColumns.push(row.refColumn);
      fk.refSchemas.add(row.refSchema);
    }
    let fksVerified = 0;
    let compositeFks = 0;
    const expectedFkKeys = new Set();
    for (const [tableName, table] of expected.model) {
      for (const fk of table.foreignKeys) {
        const key = `${tableName}.${fk.name}`;
        expectedFkKeys.add(key);
        const actual = actualFks.get(key);
        const where = { table: tableName, name: fk.name };
        if (!actual) {
          fail('foreign key', { ...where, issue: 'missing' });
          continue;
        }
        const problems = [];
        if (actual.refTable !== fk.refTable) problems.push(`target ${actual.refTable}`);
        if (!sameColumns(actual.columns, fk.columns)) problems.push(`columns ${actual.columns}`);
        if (!sameColumns(actual.refColumns, fk.refColumns))
          problems.push(`refColumns ${actual.refColumns}`);
        if (actual.deleteRule !== 'RESTRICT' || fk.onDelete !== 'RESTRICT') {
          problems.push(`ON DELETE ${actual.deleteRule}`);
        }
        if (actual.updateRule !== 'RESTRICT' || fk.onUpdate !== 'RESTRICT') {
          problems.push(`ON UPDATE ${actual.updateRule}`);
        }
        if (actual.refSchemas.size !== 1 || !actual.refSchemas.has(schema)) {
          problems.push(`referenced schema ${[...actual.refSchemas]}`);
        }
        if (problems.length > 0) {
          fail('foreign key', { ...where, problems });
          continue;
        }
        fksVerified += 1;
        if (fk.columns.length > 1) compositeFks += 1;
      }
    }
    for (const key of actualFks.keys()) {
      if (!expectedFkKeys.has(key) && !key.startsWith(`${PRISMA_TABLE}.`)) {
        fail('foreign key', { name: key, issue: 'unexpected foreign key' });
      }
    }

    // --- CHECK constraints ----------------------------------------------------------------------
    const checkRows = await q(
      'SELECT tc.TABLE_NAME AS tableName, tc.CONSTRAINT_NAME AS name, tc.ENFORCED AS enforced, ' +
        'cc.CHECK_CLAUSE AS clause FROM information_schema.TABLE_CONSTRAINTS tc ' +
        'JOIN information_schema.CHECK_CONSTRAINTS cc ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA ' +
        'AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME ' +
        "WHERE tc.CONSTRAINT_SCHEMA = ? AND tc.CONSTRAINT_TYPE = 'CHECK' ORDER BY tc.TABLE_NAME, tc.CONSTRAINT_NAME",
      [schema],
    );
    const actualChecks = new Map(checkRows.map((r) => [r.name, r]));
    const checks = [];
    const expectedCheckNames = new Set();
    for (const [tableName, table] of expected.model) {
      for (const check of table.checks) {
        expectedCheckNames.add(check.name);
        const actual = actualChecks.get(check.name);
        if (!actual) {
          fail('check', { table: tableName, name: check.name, issue: 'missing' });
          continue;
        }
        const expectedCanonical = canonicalCheck(check.expression);
        const actualCanonical = canonicalCheck(unescapeMysqlCheckClause(actual.clause));
        const record = {
          table: tableName,
          name: check.name,
          enforced: actual.enforced,
          mysqlClause: actual.clause,
          canonical: actualCanonical,
          semanticMatch: expectedCanonical === actualCanonical,
        };
        checks.push(record);
        if (actual.tableName !== tableName)
          fail('check', { name: check.name, issue: `on table ${actual.tableName}` });
        if (!record.semanticMatch) {
          fail('check', { name: check.name, expected: expectedCanonical, actual: actualCanonical });
        }
        if (actual.enforced !== 'YES')
          fail('check', { name: check.name, issue: `ENFORCED=${actual.enforced}` });
      }
    }
    for (const name of actualChecks.keys()) {
      if (!expectedCheckNames.has(name))
        fail('check', { name, issue: 'unexpected CHECK constraint' });
    }

    // --- Prisma migration bookkeeping ---------------------------------------------------------
    let migrations = [];
    if (actualTables.has(PRISMA_TABLE)) {
      migrations = await q(
        `SELECT migration_name AS name, checksum, finished_at AS finishedAt, rolled_back_at AS rolledBackAt, ` +
          `applied_steps_count AS appliedSteps, logs FROM \`${PRISMA_TABLE}\` ORDER BY started_at`,
      );
    }
    const applied = migrations.filter((m) => m.finishedAt !== null && m.rolledBackAt === null);
    if (applied.length !== 1 || applied[0].name !== MIGRATION_NAME) {
      fail('migrations', {
        issue: 'expected exactly the reviewed initial migration applied',
        rows: migrations.length,
      });
    } else if (applied[0].checksum !== expected.sha256) {
      fail('migrations', {
        issue: 'checksum differs from committed migration.sql',
        actual: applied[0].checksum,
      });
    }
    if (migrations.length !== applied.length) {
      fail('migrations', {
        issue: 'unfinished or rolled-back migration rows present',
        rows: migrations.length,
      });
    }

    // --- Row counts ---------------------------------------------------------------------------
    const rowCounts = {};
    for (const name of domainTableNames) {
      if (!actualTables.has(name)) continue;
      const [row] = await q(`SELECT COUNT(*) AS n FROM \`${name}\``);
      rowCounts[name] = Number(row.n);
    }
    const nonEmpty = Object.entries(rowCounts).filter(([, n]) => n > 0);
    if (expectEmpty && nonEmpty.length > 0)
      fail('rows', { issue: 'domain tables not empty', nonEmpty });

    const report = {
      target: resolved.name,
      schema,
      connection: resolved.label,
      server,
      schemaDefaults: schemaRow,
      reviewedMigration: {
        name: MIGRATION_NAME,
        sha256: expected.sha256,
        inventory: expected.counts,
      },
      appliedMigrations: migrations.map((m) => ({
        name: m.name,
        checksum: m.checksum,
        finished: m.finishedAt !== null,
        rolledBack: m.rolledBackAt !== null,
        appliedSteps: m.appliedSteps,
      })),
      verified: {
        domainTables: domainTableNames.filter((n) => actualTables.has(n)).length,
        domainTableNames,
        innodbTables: domainTableNames.filter((n) => actualTables.get(n)?.engine === 'InnoDB')
          .length,
        binaryCollationTables: domainTableNames.filter(
          (n) => actualTables.get(n)?.collation === REQUIRED_COLLATION,
        ).length,
        columns: columnsVerified,
        characterColumnsWithBinaryCollation: characterColumns,
        primaryKeys: primaryKeysVerified,
        uniqueKeys: uniquesVerified,
        indexes: indexesVerified,
        implicitFkIndexes,
        foreignKeys: fksVerified,
        compositeForeignKeys: compositeFks,
        checks: checks.filter((c) => c.semanticMatch && c.enforced === 'YES').length,
      },
      nonSemantic: { columnOrderDifferences },
      checks,
      rowCounts,
      failures,
    };
    if (jsonOut) writeFileSync(path.resolve(jsonOut), `${JSON.stringify(report, null, 2)}\n`);
    const v = report.verified;
    console.log(
      `[verify] target ${report.connection} — MySQL ${server.version} (${server.comment})`,
    );
    console.log(`[verify] reviewed migration sha256 ${expected.sha256}`);
    console.log(
      `[verify] tables ${v.domainTables}/${INVENTORY.tables} (InnoDB ${v.innodbTables}, ${REQUIRED_COLLATION} ${v.binaryCollationTables}); ` +
        `columns ${v.columns}/${INVENTORY.columns} (character columns with binary collation ${v.characterColumnsWithBinaryCollation})`,
    );
    console.log(
      `[verify] primary keys ${v.primaryKeys}/${INVENTORY.tables}; unique keys ${v.uniqueKeys}/${INVENTORY.uniques}; ` +
        `indexes ${v.indexes}/${INVENTORY.indexes}; implicit FK indexes ${implicitFkIndexes.length}`,
    );
    console.log(
      `[verify] foreign keys ${v.foreignKeys}/${INVENTORY.foreignKeys} RESTRICT/RESTRICT (composite ${v.compositeForeignKeys}); ` +
        `CHECK constraints ${v.checks}/${INVENTORY.checks} semantically matching and ENFORCED=YES`,
    );
    console.log(
      `[verify] applied migrations: ${report.appliedMigrations.map((m) => `${m.name} ${m.checksum}`).join('; ') || 'none'}`,
    );
    console.log(
      `[verify] domain rows total: ${Object.values(rowCounts).reduce((a, b) => a + b, 0)}`,
    );
    if (failures.length > 0) {
      console.log(`[verify] FAILED with ${failures.length} finding(s):`);
      for (const f of failures.slice(0, 50)) console.log(`  - ${JSON.stringify(f)}`);
      process.exitCode = 1;
    } else {
      console.log('[verify] PASS: metadata matches the reviewed inventory.');
    }
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error(`[verify] error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
