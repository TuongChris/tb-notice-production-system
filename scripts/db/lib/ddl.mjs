// Shared MySQL DDL text parser for the TB P0 database tooling (moved unchanged from
// sql-semantic-compare.mjs). Understands the DDL subset emitted by Prisma Migrate for MySQL and by
// the frozen TB preview; unknown statements or table items fail closed. Never touches a database.

function stripComments(sql) {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

export function splitTopLevel(text, separator = ',') {
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

export function summarize(tables) {
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

// ---------------------------------------------------------------------------------------------
// CHECK expression canonicalization.
//
// MySQL stores CHECK_CLAUSE in its own rewritten form (extra parentheses, lower-case keywords,
// `_utf8mb4'…'` charset introducers). To compare "semantically", both the reviewed SQL and the
// stored clause are parsed into a small expression tree and printed canonically. Supported
// grammar (sufficient for the 30 TB checks; anything else throws, i.e. fails closed):
//   expr := or ; or := and (OR and)* ; and := not (AND not)* ; not := NOT not | predicate
//   predicate := operand [cmpop operand | IS [NOT] NULL | [NOT] IN (operand, …)]
//   operand := `ident` | number | 'string' | _charset'string' | name(args) | (expr)
// AND/OR chains are flattened; operand order is preserved (no commutativity assumptions).

function tokenizeCheck(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      i += 1;
    } else if (ch === '`') {
      const end = text.indexOf('`', i + 1);
      if (end < 0) throw new Error(`Unterminated identifier in CHECK: ${text}`);
      tokens.push({ t: 'ident', v: text.slice(i + 1, end) });
      i = end + 1;
    } else if (ch === "'" || (ch === '_' && /^_[a-z0-9]+'/i.test(text.slice(i)))) {
      if (ch === '_') i = text.indexOf("'", i);
      let j = i + 1;
      let value = '';
      for (;;) {
        if (j >= text.length) throw new Error(`Unterminated string in CHECK: ${text}`);
        if (text[j] === "'" && text[j + 1] === "'") {
          value += "'";
          j += 2;
        } else if (text[j] === "'") {
          break;
        } else {
          value += text[j];
          j += 1;
        }
      }
      tokens.push({ t: 'str', v: value });
      i = j + 1;
    } else if (/[0-9]/.test(ch)) {
      const m = /^[0-9]+/.exec(text.slice(i));
      tokens.push({ t: 'num', v: m[0].replace(/^0+(?=\d)/, '') });
      i += m[0].length;
    } else if (/[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i));
      tokens.push({ t: 'word', v: m[0].toUpperCase() });
      i += m[0].length;
    } else {
      const two = text.slice(i, i + 2);
      if (['<=', '>=', '<>', '!='].includes(two)) {
        tokens.push({ t: 'op', v: two === '!=' ? '<>' : two });
        i += 2;
      } else if ('=<>(),'.includes(ch)) {
        tokens.push({ t: ch === '(' || ch === ')' || ch === ',' ? ch : 'op', v: ch });
        i += 1;
      } else {
        throw new Error(`Unsupported character '${ch}' in CHECK: ${text}`);
      }
    }
  }
  return tokens;
}

function parseCheckTokens(tokens, source) {
  let pos = 0;
  const peek = () => tokens[pos];
  const isWord = (w) => peek()?.t === 'word' && peek().v === w;
  const expect = (t) => {
    if (peek()?.t !== t) throw new Error(`Expected ${t} in CHECK: ${source}`);
    return tokens[pos++];
  };
  const flatten = (kind, items) =>
    items.flatMap((x) => (x.kind === kind ? x.items : [x])).length > 1
      ? { kind, items: items.flatMap((x) => (x.kind === kind ? x.items : [x])) }
      : items[0];
  function parseOr() {
    const items = [parseAnd()];
    while (isWord('OR')) {
      pos += 1;
      items.push(parseAnd());
    }
    return flatten('or', items);
  }
  function parseAnd() {
    const items = [parseNot()];
    while (isWord('AND')) {
      pos += 1;
      items.push(parseNot());
    }
    return flatten('and', items);
  }
  function parseNot() {
    if (isWord('NOT')) {
      pos += 1;
      return { kind: 'not', item: parseNot() };
    }
    return parsePredicate();
  }
  function parsePredicate() {
    const left = parseOperand();
    const token = peek();
    if (token?.t === 'op') {
      pos += 1;
      return { kind: 'cmp', op: token.v, left, right: parseOperand() };
    }
    if (isWord('IS')) {
      pos += 1;
      let negated = false;
      if (isWord('NOT')) {
        pos += 1;
        negated = true;
      }
      if (!isWord('NULL')) throw new Error(`Expected NULL in CHECK: ${source}`);
      pos += 1;
      return { kind: negated ? 'isnotnull' : 'isnull', item: left };
    }
    let negatedIn = false;
    if (isWord('NOT') && tokens[pos + 1]?.t === 'word' && tokens[pos + 1].v === 'IN') {
      pos += 1;
      negatedIn = true;
    }
    if (isWord('IN')) {
      pos += 1;
      expect('(');
      const list = [parseOperand()];
      while (peek()?.t === ',') {
        pos += 1;
        list.push(parseOperand());
      }
      expect(')');
      return { kind: negatedIn ? 'notin' : 'in', item: left, list };
    }
    return left;
  }
  function parseOperand() {
    const token = peek();
    if (!token) throw new Error(`Unexpected end of CHECK: ${source}`);
    if (token.t === '(') {
      pos += 1;
      const inner = parseOr();
      expect(')');
      return inner;
    }
    if (token.t === 'ident') {
      pos += 1;
      return { kind: 'col', v: token.v };
    }
    if (token.t === 'num') {
      pos += 1;
      return { kind: 'num', v: token.v };
    }
    if (token.t === 'str') {
      pos += 1;
      return { kind: 'str', v: token.v };
    }
    if (token.t === 'word' && tokens[pos + 1]?.t === '(') {
      pos += 2;
      const args = [];
      if (peek()?.t !== ')') {
        args.push(parseOr());
        while (peek()?.t === ',') {
          pos += 1;
          args.push(parseOr());
        }
      }
      expect(')');
      return { kind: 'fn', name: token.v, args };
    }
    if (token.t === 'word' && token.v === 'NULL') {
      pos += 1;
      return { kind: 'null' };
    }
    throw new Error(`Unsupported operand '${token.v}' in CHECK: ${source}`);
  }
  const tree = parseOr();
  if (pos !== tokens.length) throw new Error(`Trailing tokens in CHECK: ${source}`);
  return tree;
}

function printCheck(node) {
  switch (node.kind) {
    case 'or':
    case 'and':
      return `${node.kind.toUpperCase()}(${node.items.map(printCheck).join(', ')})`;
    case 'not':
      return `NOT(${printCheck(node.item)})`;
    case 'cmp':
      return `(${printCheck(node.left)} ${node.op} ${printCheck(node.right)})`;
    case 'isnull':
      return `ISNULL(${printCheck(node.item)})`;
    case 'isnotnull':
      return `ISNOTNULL(${printCheck(node.item)})`;
    case 'in':
    case 'notin':
      return `${node.kind.toUpperCase()}(${printCheck(node.item)}; ${node.list.map(printCheck).join(', ')})`;
    case 'col':
      return `\`${node.v}\``;
    case 'num':
      return node.v;
    case 'str':
      return `'${node.v.replace(/'/g, "''")}'`;
    case 'null':
      return 'NULL';
    case 'fn':
      return `${node.name}(${node.args.map(printCheck).join(', ')})`;
    default:
      throw new Error(`Unknown CHECK node ${node.kind}`);
  }
}

/** Canonical, parenthesization-independent form of a CHECK expression (fails closed). */
export function canonicalCheck(expression) {
  const text = expression.replace(/^\s*CHECK\b/i, '');
  return printCheck(parseCheckTokens(tokenizeCheck(text), expression));
}

/** Expected information_schema.COLUMNS.COLUMN_TYPE for a parsed (normalized) DDL type. */
export function expectedMysqlColumnType(normalizedType) {
  if (normalizedType === 'BOOLEAN') return 'tinyint(1)';
  const m = /^([A-Z]+)(.*)$/.exec(normalizedType);
  if (!m) throw new Error(`Unsupported type ${normalizedType}`);
  const [, base, rest] = m;
  if (base === 'ENUM' || base === 'SET') return `${base.toLowerCase()}${rest}`;
  return `${base}${rest}`.toLowerCase();
}

/** Expected information_schema.COLUMNS.COLUMN_DEFAULT for a parsed default (null = none). */
export function expectedMysqlColumnDefault(parsedDefault) {
  if (parsedDefault === null) return null;
  if (/^'.*'$/s.test(parsedDefault)) return parsedDefault.slice(1, -1).replace(/''/g, "'");
  return parsedDefault;
}

/** Character-bearing MySQL column types that carry a collation. */
export function isCharacterColumnType(columnType) {
  return /^(char|varchar|tinytext|text|mediumtext|longtext|enum|set)\b/.test(columnType);
}
