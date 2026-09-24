// Semantic comparison of MySQL DDL files (AR-011, P0 Bootstrap Contract §6 step 5 and §7).
//
//   node scripts/db/sql-semantic-compare.mjs <reference.sql> <candidate.sql> [--json]
//
// Parses CREATE TABLE and ALTER TABLE ... ADD CONSTRAINT statements as text and compares meaning:
// tables, column types/sizes/unsignedness/nullability/defaults, primary keys, unique keys, indexes,
// foreign keys (columns, target, actions), CHECK expressions and table engine/charset/collation.
// Constraint/index names and statement order are reported separately and are not semantic.
// It never connects to a database and never writes files. It only understands the DDL subset
// emitted by Prisma Migrate for MySQL and by the frozen TB preview; unknown table items fail closed.
import { readFileSync } from 'node:fs';
import { parseSchema, summarize } from './lib/ddl.mjs';

const [referencePath, candidatePath, flag] = process.argv.slice(2);
if (!referencePath || !candidatePath) {
  console.error('usage: sql-semantic-compare.mjs <reference.sql> <candidate.sql> [--json]');
  process.exit(2);
}

const key = (...parts) => JSON.stringify(parts);

export function compareSchemas(reference, candidate) {
  const semantic = [];
  const nonSemantic = [];
  const refNames = [...reference.keys()].sort();
  const candNames = [...candidate.keys()].sort();
  for (const name of refNames.filter((n) => !candidate.has(n))) {
    semantic.push({ table: name, kind: 'table', issue: 'missing in candidate' });
  }
  for (const name of candNames.filter((n) => !reference.has(n))) {
    semantic.push({ table: name, kind: 'table', issue: 'extra in candidate' });
  }
  for (const name of refNames.filter((n) => candidate.has(n))) {
    const r = reference.get(name);
    const c = candidate.get(name);
    for (const field of ['engine', 'charset', 'collate']) {
      if (r.options[field] !== c.options[field]) {
        semantic.push({
          table: name,
          kind: `table ${field}`,
          reference: r.options[field],
          candidate: c.options[field],
        });
      }
    }
    const rCols = new Map(r.columns.map((x) => [x.name, x]));
    const cCols = new Map(c.columns.map((x) => [x.name, x]));
    for (const col of r.columns) {
      const other = cCols.get(col.name);
      if (!other) {
        semantic.push({ table: name, kind: 'column', column: col.name, issue: 'missing' });
        continue;
      }
      for (const field of [
        'type',
        'nullable',
        'default',
        'onUpdate',
        'autoIncrement',
        'collate',
        'charset',
      ]) {
        if (col[field] !== other[field]) {
          semantic.push({
            table: name,
            kind: `column ${field}`,
            column: col.name,
            reference: col[field],
            candidate: other[field],
          });
        }
      }
    }
    for (const col of c.columns.filter((x) => !rCols.has(x.name))) {
      semantic.push({ table: name, kind: 'column', column: col.name, issue: 'extra in candidate' });
    }
    const rOrder = r.columns.map((x) => x.name).join(',');
    const cOrder = c.columns.map((x) => x.name).join(',');
    if (rOrder !== cOrder) nonSemantic.push({ table: name, kind: 'column order differs' });
    if (key(r.primaryKey) !== key(c.primaryKey)) {
      semantic.push({
        table: name,
        kind: 'primary key',
        reference: r.primaryKey,
        candidate: c.primaryKey,
      });
    }
    const compareSet = (kind, rs, cs, sig, label) => {
      const cBySig = new Map(cs.map((x) => [sig(x), x]));
      const rBySig = new Map(rs.map((x) => [sig(x), x]));
      for (const [s, x] of rBySig) {
        const other = cBySig.get(s);
        if (!other)
          semantic.push({ table: name, kind, issue: 'missing in candidate', reference: label(x) });
        else if (other.name !== x.name) {
          nonSemantic.push({
            table: name,
            kind: `${kind} name`,
            reference: x.name,
            candidate: other.name,
          });
        }
      }
      for (const [s, x] of cBySig) {
        if (!rBySig.has(s))
          semantic.push({ table: name, kind, issue: 'extra in candidate', candidate: label(x) });
      }
    };
    compareSet(
      'unique key',
      r.uniques,
      c.uniques,
      (x) => key(x.columns),
      (x) => x.columns,
    );
    compareSet(
      'index',
      r.indexes,
      c.indexes,
      (x) => key(x.columns),
      (x) => x.columns,
    );
    compareSet(
      'foreign key',
      r.foreignKeys,
      c.foreignKeys,
      (x) => key(x.columns, x.refTable, x.refColumns, x.onDelete, x.onUpdate),
      (x) => `${x.columns} -> ${x.refTable}(${x.refColumns}) ${x.onDelete}/${x.onUpdate}`,
    );
    compareSet(
      'check',
      r.checks,
      c.checks,
      (x) => x.expression,
      (x) => x.expression,
    );
  }
  return { semantic, nonSemantic };
}

const reference = parseSchema(readFileSync(referencePath, 'utf8'));
const candidate = parseSchema(readFileSync(candidatePath, 'utf8'));
const result = {
  reference: { path: referencePath, ...summarize(reference) },
  candidate: { path: candidatePath, ...summarize(candidate) },
  ...compareSchemas(reference, candidate),
};

if (flag === '--json') {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log('reference:', JSON.stringify(result.reference));
  console.log('candidate:', JSON.stringify(result.candidate));
  console.log(`semantic differences: ${result.semantic.length}`);
  for (const d of result.semantic) console.log('  SEMANTIC', JSON.stringify(d));
  console.log(`non-semantic differences (names/order): ${result.nonSemantic.length}`);
}
process.exit(result.semantic.length === 0 ? 0 : 1);
