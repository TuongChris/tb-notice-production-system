// P2 directory service rules that need no database: request parsing against the active contract,
// fieldAttributions checks, change detection and audit redaction, lifecycle transitions, LIKE
// escaping, and a guard that the reference/snapshot inventories match the reviewed migration.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../apps/api/src/infrastructure/http/api-error.js';
import { containsPattern } from '../../apps/api/src/infrastructure/write/pagination.js';
import {
  contractOperation,
  parseBody,
  parsePathParam,
  parseQuery,
} from '../../apps/api/src/infrastructure/write/request-parsing.js';
import { AGENCY_IDENTITY_FIELDS } from '../../apps/api/src/modules/directory/agencies.service.js';
import {
  ATTRIBUTABLE_FIELDS,
  attributionIssues,
  attributionSourceUses,
} from '../../apps/api/src/modules/directory/attributions.js';
import {
  auditFields,
  changedFields,
  sameValue,
  writeData,
} from '../../apps/api/src/modules/directory/changes.js';
import { LEGAL_SUBJECT_IDENTITY_FIELDS } from '../../apps/api/src/modules/directory/legal-subjects.service.js';
import {
  archiveChange,
  restoreChange,
  stateChange,
} from '../../apps/api/src/modules/directory/lifecycle.js';
import {
  DIRECT_REFERENCES,
  DIRECTORY_TABLES,
  JSON_SCAN_EXCLUDED_TABLES,
  SNAPSHOT_JSON_COLUMNS,
} from '../../apps/api/src/modules/directory/records.js';
import {
  CreateAgencySchema,
  CreateLegalSubjectSchema,
  PatchAgencySchema,
  PatchLegalSubjectSchema,
} from '../../packages/contracts/src/index.js';

function apiError(action: () => unknown): ApiError {
  try {
    action();
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error('expected an ApiError');
}

const ID = '3f2b8c1e-8a55-4f0e-9c1d-2b7e6a4d9f10';

describe('request parsing against the active contract', () => {
  it('bodies: strict contract schemas → 422 VALIDATION_FAILED with paths and fixed messages', () => {
    const patch = contractOperation('patchAgency');
    expect(parseBody(patch, { legalName: null })).toEqual({ legalName: null });
    const empty = apiError(() => parseBody(patch, {}));
    expect([empty.status, empty.code]).toEqual([422, 'VALIDATION_FAILED']);
    const unknown = apiError(() => parseBody(patch, { ownsAllWorks: true, 'secret-value': 1 }));
    expect(JSON.stringify(unknown.details)).not.toContain('secret-value');
    expect(unknown.details['issues']).toEqual(
      expect.arrayContaining([{ path: '(body)', message: 'Unknown field' }]),
    );
    const surrogate = apiError(() =>
      parseBody(contractOperation('createAgency'), { displayName: 'x', notes: 'a\udc00b' }),
    );
    expect(surrogate.details).toEqual({
      issues: [{ path: 'notes', message: expect.stringContaining('unpaired') }],
    });
    // Operations without a request body accept none.
    const remove = contractOperation('deleteUnusedAgency');
    expect(parseBody(remove, undefined)).toBeUndefined();
    expect(parseBody(remove, {})).toBeUndefined();
    expect(apiError(() => parseBody(remove, { force: true })).status).toBe(422);
  });

  it('path ids: anything the contract uuid parameter rejects is 404', () => {
    const get = contractOperation('getAgency');
    expect(parsePathParam(get, 'id', ID)).toBe(ID);
    for (const value of ['x', `${ID}0`, `urn:uuid:${ID}`, '', undefined]) {
      expect(apiError(() => parsePathParam(get, 'id', value)).code, String(value)).toBe(
        'NOT_FOUND',
      );
    }
  });

  it('queries: only declared parameters, one value each, integers as plain digits', () => {
    const list = contractOperation('listSigners');
    expect(parseQuery(list, { limit: '100', q: 'a', agencyId: ID, cursor: 'c' })).toEqual({
      limit: 100,
      q: 'a',
      agencyId: ID,
      cursor: 'c',
    });
    for (const query of [
      { limit: '0' },
      { limit: '101' },
      { limit: '01' },
      { limit: '1e2' },
      { limit: ['1', '2'] },
      { agencyId: 'x' },
      { q: 'x'.repeat(201) },
      { other: '1' },
    ]) {
      const error = apiError(() => parseQuery(list, query));
      expect([error.status, error.code], JSON.stringify(query)).toEqual([
        400,
        'INVALID_QUERY_PARAMETER',
      ]);
    }
    expect(
      apiError(() => parseQuery(contractOperation('listAgencies'), { agencyId: ID })).code,
    ).toBe('INVALID_QUERY_PARAMETER');
  });

  it('frozen request cases: displayName-only Agency and explicit null are valid; unknown flags are not', () => {
    expect(CreateAgencySchema.safeParse({ displayName: 'TEST Agency A' }).success).toBe(true);
    expect(
      CreateAgencySchema.safeParse({ displayName: 'TEST A', ownsAllWorks: true }).success,
    ).toBe(false);
    expect(PatchAgencySchema.safeParse({}).success).toBe(false);
    expect(PatchAgencySchema.safeParse({ legalName: null }).success).toBe(true);
    // subjectType is create-only: the patch schema has no such field.
    expect(CreateLegalSubjectSchema.shape).toHaveProperty('subjectType');
    expect(PatchLegalSubjectSchema.shape).not.toHaveProperty('subjectType');
  });
});

describe('fieldAttributions (D4)', () => {
  const attribution = (overrides: Record<string, unknown>) =>
    ({
      field: 'legalName',
      provenance: 'OPERATOR_REPORTED',
      sourceIds: [],
      scopeText: 'x',
      ...overrides,
    }) as never;

  it('fields must be attributable data of the entity; DOCUMENT_REVIEWED needs a source', () => {
    expect(attributionIssues('Agency', null)).toEqual([]);
    expect(attributionIssues('Agency', [attribution({})])).toEqual([]);
    expect(
      attributionIssues('Agency', [
        attribution({ field: 'notes' }),
        attribution({ field: 'recordState' }),
        attribution({ provenance: 'DOCUMENT_REVIEWED' }),
        attribution({ field: 'subjectType' }),
      ]).map((issue) => issue.path),
    ).toEqual([
      'fieldAttributions.0.field',
      'fieldAttributions.1.field',
      'fieldAttributions.2.sourceIds',
      'fieldAttributions.3.field',
    ]);
    expect(attributionIssues('LegalSubject', [attribution({ field: 'subjectType' })])).toEqual([]);
    for (const provenance of ['OPERATOR_REPORTED', 'ANALYSIS', 'MISSING', 'CONFLICT']) {
      expect(attributionIssues('Agency', [attribution({ provenance })]), provenance).toEqual([]);
    }
  });

  it('attributable fields are exactly the entity’s own identity/contact data', () => {
    for (const [entity, fields] of Object.entries(ATTRIBUTABLE_FIELDS)) {
      const schema = entity === 'Agency' ? CreateAgencySchema : CreateLegalSubjectSchema;
      const writable = Object.keys(schema.shape).filter(
        (field) => !['fieldAttributions', 'notes'].includes(field),
      );
      expect([...fields].sort(), entity).toEqual(writable.sort());
    }
    for (const field of AGENCY_IDENTITY_FIELDS) {
      expect(ATTRIBUTABLE_FIELDS.Agency as readonly string[]).toContain(field);
    }
    for (const field of LEGAL_SUBJECT_IDENTITY_FIELDS) {
      expect(ATTRIBUTABLE_FIELDS.LegalSubject as readonly string[]).toContain(field);
    }
  });

  it('source uses carry the exact request path of each id', () => {
    expect(
      attributionSourceUses([
        attribution({ sourceIds: ['a', 'b'] }),
        attribution({}),
        attribution({ sourceIds: ['c'] }),
      ]),
    ).toEqual([
      { field: 'fieldAttributions.0.sourceIds.0', sourceId: 'a' },
      { field: 'fieldAttributions.0.sourceIds.1', sourceId: 'b' },
      { field: 'fieldAttributions.2.sourceIds.0', sourceId: 'c' },
    ]);
  });
});

describe('changes and audit redaction', () => {
  it('only differing fields change; JSON compares canonically; Dates compare as instants', () => {
    const current = {
      phone: '1',
      postalAddress: { country: 'VN', city: 'X' },
      archivedAt: new Date('2026-09-24T00:00:00Z'),
      aliases: null,
    };
    expect(
      changedFields(current, {
        phone: '1',
        postalAddress: { city: 'X', country: 'VN' },
        aliases: null,
        archivedAt: new Date('2026-09-24T00:00:00Z'),
      }),
    ).toEqual([]);
    expect(changedFields(current, { phone: '2', aliases: [], postalAddress: null })).toEqual([
      'phone',
      'aliases',
      'postalAddress',
    ]);
    expect(sameValue(undefined, null)).toBe(true);
    expect(sameValue(['a', 'b'], ['b', 'a'])).toBe(false);
  });

  it('write data clears JSON columns with SQL NULL and skips omitted fields', () => {
    const data = writeData(
      { postalAddress: null, phone: null, legalName: undefined },
      ['postalAddress', 'phone', 'legalName'],
      ['postalAddress'],
    );
    expect(Object.keys(data)).toEqual(['postalAddress', 'phone']);
    expect(data['phone']).toBeNull();
    expect(data['postalAddress']).not.toBeNull();
  });

  it('audit values: notes are redacted to their code-point length; dates are ISO strings', () => {
    expect(
      auditFields(
        { notes: 'Chú thích 😀', archivedAt: new Date('2026-09-24T00:00:00Z'), phone: null },
        ['notes', 'archivedAt', 'phone'],
      ),
    ).toEqual({
      notes: { redacted: true, codePoints: 11 },
      archivedAt: '2026-09-24T00:00:00.000Z',
      phone: null,
    });
  });
});

describe('record lifecycle (administrative only)', () => {
  const now = new Date('2026-09-24T00:00:00Z');

  it('DRAFT ⇄ ACTIVE; ARCHIVED only through archive; restore returns to DRAFT', () => {
    expect(stateChange('DRAFT', 'ACTIVE')).toEqual({ recordState: 'ACTIVE' });
    expect(stateChange('ACTIVE', 'DRAFT')).toEqual({ recordState: 'DRAFT' });
    expect(archiveChange('ACTIVE', 'r', now)).toEqual({
      recordState: 'ARCHIVED',
      archivedAt: now,
      archiveReason: 'r',
    });
    expect(restoreChange('ARCHIVED')).toEqual({
      recordState: 'DRAFT',
      archivedAt: null,
      archiveReason: null,
    });
    for (const action of [
      () => stateChange('ACTIVE', 'ACTIVE'),
      () => stateChange('ARCHIVED', 'ACTIVE'),
      () => archiveChange('ARCHIVED', 'r', now),
      () => restoreChange('DRAFT'),
      () => restoreChange('ACTIVE'),
    ]) {
      const error = apiError(action);
      expect([error.status, error.code]).toEqual([409, 'RECORD_STATE_CONFLICT']);
    }
  });
});

describe('search patterns', () => {
  it('escapes the escape character and LIKE wildcards', () => {
    expect(containsPattern('a%b_c!d')).toBe('%a!%b!_c!!d%');
    expect(containsPattern('plain')).toBe('%plain%');
  });
});

describe('accent-insensitive matching is for search only (R5 interpretation E)', () => {
  // utf8mb4_0900_ai_ci folds case and accents. It may serve discovery (`q` substring search) but
  // never identity equality, canonical matching, duplicate detection or unique keys, which keep
  // the binary collation of the reviewed migration (ADR-0001).
  const sourceRoot = new URL('../../apps/api/src/', import.meta.url);

  it('every case/accent-insensitive collation in the API source is a LIKE search on a `q` pattern', () => {
    const files = readdirSync(sourceRoot, { recursive: true, encoding: 'utf8' }).filter((file) =>
      file.endsWith('.ts'),
    );
    const uses: string[] = [];
    for (const file of files) {
      const lines = readFileSync(new URL(file, sourceRoot), 'utf8').split('\n');
      for (const [index, line] of lines.entries()) {
        if (!/_ci\b/i.test(line)) continue;
        uses.push(`${file}:${index + 1}`);
        expect(line, `${file}:${index + 1}`).toMatch(
          /COLLATE utf8mb4_0900_ai_ci LIKE \$\{containsPattern\(q\)\} ESCAPE '!'/,
        );
      }
    }
    // P2: listAgencies 2, listOwners 2, listLegalSubjects 3, listOwnerSubjects 2, listSigners 2.
    expect(uses.length).toBeGreaterThanOrEqual(11);
  });
});

describe('dependency inventories match the reviewed migration', () => {
  const migration = readFileSync(
    new URL(
      '../../apps/api/prisma/migrations/20260923103912_initial_schema/migration.sql',
      import.meta.url,
    ),
    'utf8',
  );

  it('DIRECT_REFERENCES lists every foreign key that points at a directory table', () => {
    const tableToEntity = new Map(
      Object.entries(DIRECTORY_TABLES).map(([entity, table]) => [table, entity]),
    );
    const found: Record<string, string[]> = {};
    const foreignKey =
      /ALTER TABLE `([a-z_]+)` ADD CONSTRAINT `[a-z0-9_]+` FOREIGN KEY \(`([a-z_]+)`[^)]*\) REFERENCES `([a-z_]+)`\(`id`/g;
    for (const [, table, column, target] of migration.matchAll(foreignKey)) {
      const entity = tableToEntity.get(target ?? '');
      if (entity) (found[entity] ??= []).push(`${table}.${column}`);
    }
    for (const [entity, references] of Object.entries(DIRECT_REFERENCES)) {
      expect(references.map((ref) => `${ref.table}.${ref.column}`).sort(), entity).toEqual(
        (found[entity] ?? []).sort(),
      );
    }
  });

  it('SNAPSHOT_JSON_COLUMNS covers every JSON column outside the excluded record/history tables', () => {
    const jsonColumns: string[] = [];
    for (const [, table, body] of migration.matchAll(
      /CREATE TABLE `([a-z_]+)` \(([\s\S]*?)\n\) /g,
    )) {
      for (const [, column] of (body ?? '').matchAll(/`([a-z_]+)` JSON (?:NOT )?NULL/g)) {
        jsonColumns.push(`${table}.${column}`);
      }
    }
    expect(jsonColumns.length).toBeGreaterThan(20);
    const configured = SNAPSHOT_JSON_COLUMNS.flatMap(({ table, columns }) =>
      columns.map((column) => `${table}.${column}`),
    );
    const expected = jsonColumns.filter(
      (column) => !JSON_SCAN_EXCLUDED_TABLES.includes(column.split('.')[0] ?? ''),
    );
    expect(configured.sort()).toEqual(expected.sort());
  });
});
