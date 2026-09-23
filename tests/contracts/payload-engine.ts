// Deterministic, schema-driven synthetic payloads for three-way runtime parity (P0-D).
//
// For every frozen schema: build one valid synthetic instance, then derive mutations for every
// inline node (not crossing into other named schemas, which are mutated as their own roots):
// string bounds by Unicode code point, formats, patterns, integer/array bounds, enums/consts,
// wrong types, unknown keys, omitted vs null, empty PATCH (minProperties) and oneOf branch errors.
// The engine never decides the expected result; the parity test requires all validators to agree.
import { FORMAT_CASES, PATTERN_CASES, SUPPLEMENTARY } from './edge-cases.js';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Node = Record<string, unknown>;
type PathKey = string | number;

export interface ParityCase {
  readonly schema: string;
  readonly label: string;
  readonly payload: unknown;
}

const SAMPLE_BY_FORMAT: Readonly<Record<string, string>> = {
  uuid: '11111111-1111-4111-8111-111111111111',
  'date-time': '2026-09-23T10:00:00Z',
  date: '2026-09-23',
  email: 'synthetic@example.invalid',
  uri: 'https://example.invalid/p0',
};

const SAMPLE_BY_PATTERN: Readonly<Record<string, string>> = {
  '^[0-9a-f]{64}$': 'a'.repeat(64),
  '^(0|[1-9][0-9]{0,15})$': '1000',
  '^[A-Z]{2}$': 'US',
  '^https?://': 'https://example.invalid/p0',
};

const clone = <T>(value: T): T => structuredClone(value);

function refName(node: Node): string | undefined {
  const ref = node['$ref'];
  return typeof ref === 'string' ? ref.replace(/^#\/\$defs\//, '') : undefined;
}

export class PayloadEngine {
  constructor(private readonly defs: Record<string, unknown>) {}

  private def(name: string): Node {
    const node = this.defs[name];
    if (!node || typeof node !== 'object') throw new Error(`unknown schema ${name}`);
    return node as Node;
  }

  sampleString(node: Node): string {
    const format = node['format'] as string | undefined;
    const pattern = node['pattern'] as string | undefined;
    if (format !== undefined) {
      const sample = SAMPLE_BY_FORMAT[format];
      if (sample === undefined) throw new Error(`no sample for format ${format}`);
      return sample;
    }
    if (pattern !== undefined) {
      const sample = SAMPLE_BY_PATTERN[pattern];
      if (sample === undefined) throw new Error(`no sample for pattern ${pattern}`);
      return sample;
    }
    const min = (node['minLength'] as number | undefined) ?? 0;
    return 'S'.repeat(Math.max(1, min));
  }

  /** A valid synthetic instance of a schema node. */
  sample(node: Node): Json {
    const ref = refName(node);
    if (ref !== undefined) return this.sample(this.def(ref));
    if (Array.isArray(node['anyOf'])) return this.sample(node['anyOf'][0] as Node);
    if (Array.isArray(node['oneOf'])) return this.sample(node['oneOf'][0] as Node);
    if ('const' in node) return node['const'] as Json;
    if (Array.isArray(node['enum'])) return node['enum'][0] as Json;
    switch (node['type']) {
      case 'string':
        return this.sampleString(node);
      case 'integer':
        return node['minimum'] as number;
      case 'boolean':
        return true;
      case 'array': {
        const count = Math.max(node['minItems'] as number, Math.min(1, node['maxItems'] as number));
        return Array.from({ length: count }, () => this.sample(node['items'] as Node));
      }
      case 'object': {
        if (node['additionalProperties'] === true) return {};
        const out: Record<string, Json> = {};
        for (const [key, property] of Object.entries(node['properties'] as Record<string, Node>)) {
          out[key] = this.sample(property);
        }
        return out;
      }
      default:
        throw new Error(`cannot sample ${JSON.stringify(node).slice(0, 120)}`);
    }
  }

  /** All parity cases for one named schema. */
  casesFor(schemaName: string): ParityCase[] {
    const root = this.def(schemaName);
    const cases: ParityCase[] = [];
    const add = (label: string, payload: unknown) =>
      cases.push({ schema: schemaName, label, payload });
    if (Array.isArray(root['oneOf'])) {
      this.oneOfCases(schemaName, root, add);
    } else {
      const base = this.sample(root);
      add('valid synthetic instance', base);
      this.mutate(root, base, [], add, true);
    }
    add('wrong top-level type: array', []);
    add('wrong top-level type: string', 'x');
    add('top-level null', null);
    return cases;
  }

  private oneOfCases(
    name: string,
    root: Node,
    add: (label: string, payload: unknown) => void,
  ): void {
    const branches = root['oneOf'] as Node[];
    const discriminator = 'factType';
    const values = branches.map(
      (branch) => ((branch['properties'] as Record<string, Node>)[discriminator] as Node)['const'],
    );
    branches.forEach((branch, index) => {
      const instance = this.sample(branch) as Record<string, Json>;
      add(`oneOf branch ${String(values[index])}: valid`, instance);
      const other = values[(index + 1) % values.length] as string;
      add(`oneOf branch ${String(values[index])}: discriminator swapped to ${other}`, {
        ...clone(instance),
        [discriminator]: other,
      });
      const missing = clone(instance);
      delete missing[discriminator];
      add(`oneOf branch ${String(values[index])}: discriminator missing`, missing);
      add(`oneOf branch ${String(values[index])}: unknown discriminator`, {
        ...clone(instance),
        [discriminator]: 'P0_UNKNOWN_FACT_TYPE',
      });
      add(`oneOf branch ${String(values[index])}: discriminator lower-case`, {
        ...clone(instance),
        [discriminator]: String(values[index]).toLowerCase(),
      });
      this.mutate(branch, instance, [], add, index === 0);
    });
    add(`${name}: empty object`, {});
  }

  private mutate(
    node: Node,
    instance: Json,
    path: PathKey[],
    add: (label: string, payload: unknown) => void,
    isRoot = false,
    nullable = false,
  ): void {
    const at = path.length === 0 ? '(root)' : path.join('.');
    const replace = (label: string, value: unknown) =>
      add(`${at}: ${label}`, setAt(instance, path, value));
    const ref = refName(node);
    if (ref !== undefined && !isRoot) {
      replace('wrong type number for referenced schema', 12345);
      if (!nullable) replace('null for non-nullable reference', null);
      const target = this.def(ref);
      if (target['type'] === 'object' && target['additionalProperties'] === false) {
        const value = getAt(instance, path);
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          replace('unknown key inside referenced object', { ...value, p0UnknownKey: 'x' });
        }
      }
      return;
    }
    if (Array.isArray(node['anyOf'])) {
      replace('null (nullable)', null);
      this.mutate(node['anyOf'][0] as Node, instance, path, add, false, true);
      return;
    }
    if (!nullable && path.length > 0 && node['type'] !== undefined)
      replace('null for non-nullable value', null);
    if ('const' in node) {
      const value = node['const'];
      if (typeof value === 'string') {
        replace('different string for const', `${value}_X`);
        replace('lower-case const', value.toLowerCase());
      } else {
        replace('negated boolean const', !value);
      }
      return;
    }
    if (Array.isArray(node['enum'])) {
      for (const value of node['enum'] as string[]) replace(`enum value ${value}`, value);
      replace('value outside enum', 'P0_NOT_IN_ENUM');
      replace('lower-case enum value', (node['enum'][0] as string).toLowerCase());
      replace('wrong type number for enum', 1);
      return;
    }
    switch (node['type']) {
      case 'string':
        this.stringCases(node, replace);
        return;
      case 'integer': {
        const minimum = node['minimum'] as number;
        const maximum = node['maximum'] as number;
        for (const value of [
          minimum,
          maximum,
          minimum - 1,
          maximum + 1,
          minimum + 0.5,
          2 ** 53,
          -1,
        ]) {
          replace(`integer ${value}`, value);
        }
        replace('integer as string', String(minimum));
        return;
      }
      case 'boolean':
        replace('false', false);
        replace('string "true"', 'true');
        replace('number 1', 1);
        return;
      case 'array': {
        const minItems = node['minItems'] as number;
        const maxItems = node['maxItems'] as number;
        const item = this.sample(node['items'] as Node);
        replace('empty array', []);
        if (minItems > 0)
          replace(
            `${minItems - 1} items (below minItems)`,
            Array.from({ length: minItems - 1 }, () => clone(item)),
          );
        replace(
          `${maxItems} items (maxItems)`,
          Array.from({ length: maxItems }, () => clone(item)),
        );
        replace(
          `${maxItems + 1} items (above maxItems)`,
          Array.from({ length: maxItems + 1 }, () => clone(item)),
        );
        replace('object instead of array', {});
        const current = getAt(instance, path);
        if (Array.isArray(current) && current.length > 0) {
          this.mutate(node['items'] as Node, instance, [...path, 0], add);
        }
        return;
      }
      case 'object': {
        if (node['additionalProperties'] === true) {
          replace('open object with nested values', { p0Key: { nested: [1, 'two', null] } });
          replace('array instead of open object', []);
          replace('string instead of open object', 'x');
          return;
        }
        const properties = node['properties'] as Record<string, Node>;
        const required = node['required'] as string[];
        const current = getAt(instance, path) as Record<string, Json>;
        replace('unknown key', { ...current, p0UnknownKey: 'x' });
        if (isRoot) {
          const withProto = clone(current) as Record<string, unknown>;
          Object.defineProperty(withProto, '__proto__', {
            value: { polluted: true },
            enumerable: true,
            configurable: true,
            writable: true,
          });
          replace('own __proto__ key', withProto);
        }
        replace('array instead of object', []);
        if (typeof node['minProperties'] === 'number') {
          replace('empty object (minProperties)', {});
          const first = Object.keys(properties)[0] as string;
          replace(`only ${first} (minProperties)`, { [first]: current[first] });
        }
        for (const key of Object.keys(properties)) {
          const without = { ...current };
          delete without[key];
          replace(
            `${required.includes(key) ? 'required' : 'optional'} property ${key} omitted`,
            without,
          );
          this.mutate(properties[key] as Node, instance, [...path, key], add);
        }
        return;
      }
      default:
        throw new Error(`cannot mutate ${JSON.stringify(node).slice(0, 120)}`);
    }
  }

  private stringCases(node: Node, replace: (label: string, value: unknown) => void): void {
    const maxLength = node['maxLength'] as number | undefined;
    const minLength = node['minLength'] as number | undefined;
    const format = node['format'] as keyof typeof FORMAT_CASES | undefined;
    const pattern = node['pattern'] as string | undefined;
    replace('wrong type number for string', 123);
    if (format !== undefined) {
      for (const value of FORMAT_CASES[format])
        replace(`format ${format}: ${JSON.stringify(value)}`, value);
    }
    if (pattern !== undefined) {
      for (const value of PATTERN_CASES[pattern] ?? [])
        replace(`pattern ${pattern}: ${JSON.stringify(value)}`, value);
    }
    if (format !== undefined || pattern !== undefined) {
      if (maxLength !== undefined) {
        const base = this.sampleString(node);
        replace(
          'format/pattern sample padded beyond maxLength',
          base + 'x'.repeat(Math.max(0, maxLength - base.length + 1)),
        );
      }
      return;
    }
    if (maxLength !== undefined) {
      replace(
        `${maxLength} supplementary chars (= maxLength code points, ${maxLength * 2} UTF-16 units)`,
        SUPPLEMENTARY.repeat(maxLength),
      );
      replace(
        `${maxLength + 1} supplementary chars (maxLength + 1 code points)`,
        SUPPLEMENTARY.repeat(maxLength + 1),
      );
      replace(`${maxLength} ASCII chars (= maxLength)`, 'a'.repeat(maxLength));
      replace(`${maxLength + 1} ASCII chars (maxLength + 1)`, 'a'.repeat(maxLength + 1));
      replace(
        'lone high surrogate at maxLength boundary',
        `${'a'.repeat(Math.max(0, maxLength - 1))}\ud800`,
      );
      replace(
        'combining sequence (2 code points per glyph) at maxLength',
        'é'.repeat(Math.floor(maxLength / 2)),
      );
    }
    if (minLength !== undefined && minLength > 0) {
      replace(`${minLength} supplementary chars (= minLength)`, SUPPLEMENTARY.repeat(minLength));
      replace(
        `${minLength - 1} supplementary chars (minLength - 1)`,
        SUPPLEMENTARY.repeat(minLength - 1),
      );
      replace('empty string', '');
    } else {
      replace('empty string (no minLength)', '');
    }
  }
}

export function getAt(value: unknown, path: readonly PathKey[]): unknown {
  let current = value;
  for (const key of path) current = (current as Record<PathKey, unknown>)[key];
  return current;
}

/** Deep copy of `root` with the value at `path` replaced (root replaced when path is empty). */
export function setAt(root: unknown, path: readonly PathKey[], value: unknown): unknown {
  if (path.length === 0) return value;
  const copy = structuredClone(root) as Record<PathKey, unknown>;
  let parent: Record<PathKey, unknown> = copy;
  for (const key of path.slice(0, -1)) parent = parent[key] as Record<PathKey, unknown>;
  parent[path[path.length - 1] as PathKey] = value;
  return copy;
}
