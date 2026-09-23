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

const [referencePath, candidatePath, flag] = process.argv.slice(2);
if (!referencePath || !candidatePath) {
  console.error('usage: sql-semantic-compare.mjs <reference.sql> <candidate.sql> [--json]');
  process.exit(2);
}

function stripComments(sql) {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

function splitTopLevel(text, separator = ',') {
  const parts = [];
  let depth = 0;
  let quote = null;
  let current = '';
  for (const ch of text) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '`' || ch === '"') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === separator && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

const identList = (text) =>
  splitTopLevel(text).map((c) => {
    const m = /^`([^`]+)`(?:\s*\((\d+)\))?(?:\s+(ASC|DESC))?$/i.exec(c.trim());
    if (!m) throw new Error(`Unsupported index column expression: ${c}`);
    return (
      m[1] + (m[2] ? `(${m[2]})` : '') + (m[3] && m[3].toUpperCase() === 'DESC' ? ' DESC' : '')
    );
  });

function normalizeType(raw) {
  let t = raw.replace(/\s+/g, ' ').trim().toUpperCase();
  t = t.replace(/^INTEGER\b/, 'INT');
  t = t.replace(/^BOOL\b/, 'BOOLEAN');
  t = t
    .replace(/\s*\(\s*/g, '(')
    .replace(/\s*\)\s*/g, ')')
    .replace(/\s*,\s*/g, ',');
  return t;
}

function normalizeDefault(raw) {
  if (raw === undefined) return null;
  let d = raw.trim();
  if (/^(true|false)$/i.test(d)) d = d.toUpperCase() === 'TRUE' ? '1' : '0';
  if (/^'.*'$/.test(d)) return d;
  return d.toUpperCase();
}

export function normalizeExpression(raw) {
  let e = raw.replace(/\s+/g, ' ').trim();
  // Remove redundant outer parentheses.
  for (;;) {
    if (!(e.startsWith('(') && e.endsWith(')'))) break;
    let depth = 0;
    let wraps = true;
    for (let i = 0; i < e.length; i += 1) {
      if (e[i] === '(') depth += 1;
      if (e[i] === ')') depth -= 1;
      if (depth === 0 && i < e.length - 1) {
        wraps = false;
        break;
      }
    }
    if (!wraps) break;
    e = e.slice(1, -1).trim();
  }
  return e
    .replace(/\s*([(),<>=])\s*/g, '$1')
    .replace(/<\s*=/g, '<=')
    .replace(/>\s*=/g, '>=')
    .replace(/\b(is|not|null|and|or|in|coalesce)\b/gi, (w) => w.toUpperCase());
}

function parseColumn(item) {
  const m = /^`([^`]+)`\s+(.*)$/s.exec(item);
  if (!m) throw new Error(`Unsupported column definition: ${item}`);
  const name = m[1];
  let rest = m[2];
  const typeMatch = /^([A-Za-z]+(?:\s*\((?:[^()]|'[^']*')*\))?(?:\s+UNSIGNED)?)(?=\s|$)/i.exec(
    rest,
  );
  if (!typeMatch) throw new Error(`Cannot parse type of ${name}: ${rest}`);
  const type = normalizeType(typeMatch[1]);
  rest = rest.slice(typeMatch[1].length);
  const collate = /\bCOLLATE\s+(\w+)/i.exec(rest)?.[1] ?? null;
  const charset = /\bCHARACTER SET\s+(\w+)/i.exec(rest)?.[1] ?? null;
  const nullable = !/\bNOT NULL\b/i.test(rest);
  const defaultMatch = /\bDEFAULT\s+('(?:[^']|'')*'|[A-Za-z_]+\(\d*\)|[^\s,]+)/i.exec(rest);
  const onUpdate = /\bON UPDATE\s+([A-Za-z_]+(?:\(\d*\))?)/i.exec(rest)?.[1] ?? null;
  const autoIncrement = /\bAUTO_INCREMENT\b/i.test(rest);
  return {
    name,
    type,
    nullable,
    default: normalizeDefault(defaultMatch?.[1]),
    onUpdate: onUpdate ? onUpdate.toUpperCase() : null,
    autoIncrement,
    collate,
    charset,
  };
}

function parseTableOptions(text) {
  return {
    engine: /ENGINE\s*=\s*(\w+)/i.exec(text)?.[1]?.toUpperCase() ?? null,
    charset:
      /CHARACTER SET\s*=?\s*(\w+)|CHARSET\s*=\s*(\w+)/i.exec(text)?.slice(1).find(Boolean) ?? null,
    collate: /COLLATE\s*=?\s*(\w+)/i.exec(text)?.[1] ?? null,
  };
}

export function parseSchema(sql) {
  const tables = new Map();
  const statements = splitTopLevel(stripComments(sql), ';');
  const table = (name) => {
    if (!tables.has(name)) throw new Error(`Statement references unknown table ${name}`);
    return tables.get(name);
  };
  const addForeignKey = (t, name, body) => {
    const m =
      /^FOREIGN KEY\s*\(([^)]*)\)\s*REFERENCES\s*`([^`]+)`\s*\(([^)]*)\)\s*ON DELETE\s+(RESTRICT|CASCADE|SET NULL|NO ACTION|SET DEFAULT)\s+ON UPDATE\s+(RESTRICT|CASCADE|SET NULL|NO ACTION|SET DEFAULT)$/is.exec(
        body.replace(/\s+/g, ' ').trim(),
      );
    if (!m) throw new Error(`Unsupported foreign key on ${t.name}: ${body}`);
    t.foreignKeys.push({
      name,
      columns: identList(m[1]),
      refTable: m[2],
      refColumns: identList(m[3]),
      onDelete: m[4].toUpperCase(),
      onUpdate: m[5].toUpperCase(),
    });
  };
  for (const statement of statements) {
    const create = /^CREATE TABLE\s+`([^`]+)`\s*\(([\s\S]*)\)\s*([^)]*)$/i.exec(statement);
    if (create) {
      const t = {
        name: create[1],
        columns: [],
        primaryKey: null,
        uniques: [],
        indexes: [],
        foreignKeys: [],
        checks: [],
        options: parseTableOptions(create[3]),
      };
      tables.set(t.name, t);
      for (const item of splitTopLevel(create[2])) {
        let m;
        if ((m = /^PRIMARY KEY\s*\(([^)]*)\)$/i.exec(item))) {
          t.primaryKey = identList(m[1]);
        } else if ((m = /^UNIQUE (?:INDEX|KEY)\s*`([^`]+)`\s*\(([\s\S]*)\)$/i.exec(item))) {
          t.uniques.push({ name: m[1], columns: identList(m[2]) });
        } else if ((m = /^(?:INDEX|KEY)\s*`([^`]+)`\s*\(([\s\S]*)\)$/i.exec(item))) {
          t.indexes.push({ name: m[1], columns: identList(m[2]) });
        } else if ((m = /^CONSTRAINT\s*`([^`]+)`\s*CHECK\s*([\s\S]*)$/i.exec(item))) {
          t.checks.push({ name: m[1], expression: normalizeExpression(m[2]) });
        } else if ((m = /^CONSTRAINT\s*`([^`]+)`\s*(FOREIGN KEY[\s\S]*)$/i.exec(item))) {
          addForeignKey(t, m[1], m[2]);
        } else if (item.startsWith('`')) {
          t.columns.push(parseColumn(item));
        } else {
          throw new Error(`Unsupported table item in ${t.name}: ${item}`);
        }
      }
      continue;
    }
    const alter = /^ALTER TABLE\s+`([^`]+)`\s+ADD CONSTRAINT\s+`([^`]+)`\s+([\s\S]*)$/i.exec(
      statement,
    );
    if (alter) {
      const t = table(alter[1]);
      const body = alter[3].trim();
      if (/^CHECK\b/i.test(body)) {
        t.checks.push({
          name: alter[2],
          expression: normalizeExpression(body.replace(/^CHECK/i, '')),
        });
      } else if (/^FOREIGN KEY\b/i.test(body)) {
        addForeignKey(t, alter[2], body);
      } else {
        throw new Error(`Unsupported ALTER TABLE constraint: ${statement}`);
      }
      continue;
    }
    throw new Error(`Unsupported statement: ${statement.slice(0, 120)}`);
  }
  return tables;
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

function summarize(tables) {
  let columns = 0;
  let uniques = 0;
  let indexes = 0;
  let foreignKeys = 0;
  let checks = 0;
  for (const t of tables.values()) {
    columns += t.columns.length;
    uniques += t.uniques.length;
    indexes += t.indexes.length;
    foreignKeys += t.foreignKeys.length;
    checks += t.checks.length;
  }
  return { tables: tables.size, columns, uniques, indexes, foreignKeys, checks };
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
