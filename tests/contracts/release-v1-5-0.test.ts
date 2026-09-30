import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildContractArtifacts,
  CONTRACT_BASELINE,
  operations,
} from '../../packages/contracts/src/index.js';
import { repoRoot } from './oracle.js';
import {
  ACTIVE_RELEASE,
  RELEASES,
  amendmentBytes,
  readAmendment,
  releaseDocuments,
  renderDocuments,
  sha256,
  type JsonObject,
} from './release.js';
const paths = ['/routes', '/legal-subjects', '/mandates', '/owners/{ownerId}/subjects'];
describe('TB-SCHEMA-API-v1.5.0 optional list views', () => {
  it('names the new release and preserves every earlier accepted release hash', () => {
    expect(ACTIVE_RELEASE).toBe('TB-SCHEMA-API-v1.5.0');
    expect(CONTRACT_BASELINE).toBe(ACTIVE_RELEASE);
    expect(sha256(amendmentBytes(ACTIVE_RELEASE))).toBe(
      '6ba99bdceaf1a3f73ee6bd7f57e416257e5c2bd896c20c7902d9583492f270c8',
    );
    for (const name of RELEASES) {
      const a = readAmendment(name),
        rendered = renderDocuments(releaseDocuments(name));
      for (const [file, hash] of Object.entries(a.result.files))
        expect(sha256(rendered[file]!), name + ':' + file).toBe(hash);
    }
    const a = readAmendment();
    expect(a.base.release).toBe('TB-SCHEMA-API-v1.4.0');
    expect('amendmentSha256' in a.base && a.base.amendmentSha256).toBe(
      sha256(amendmentBytes('TB-SCHEMA-API-v1.4.0')),
    );
  });
  it('adds only one optional enum to four lists; omitted calls, schemas, writes and history GET are unchanged', () => {
    const previous = releaseDocuments('TB-SCHEMA-API-v1.4.0'),
      { jsonSchemaBundle, openApi } = buildContractArtifacts();
    expect(jsonSchemaBundle).toEqual(previous.bundle);
    const reverted = structuredClone(openApi) as JsonObject;
    (reverted['info'] as JsonObject)['version'] = '1.4.0';
    const items = reverted['paths'] as JsonObject;
    for (const p of paths) {
      const op = (items[p] as JsonObject)['get'] as JsonObject;
      const params = op['parameters'] as JsonObject[];
      expect(params.shift()).toEqual({
        name: 'view',
        in: 'query',
        schema: { type: 'string', enum: ['operational', 'history', 'all'] },
      });
    }
    expect(reverted).toEqual(previous.openApi);
    expect(operations).toHaveLength(145);
  });
  it('committed generated artifacts exactly match the composed release', () => {
    const expected = renderDocuments(releaseDocuments());
    for (const [file, text] of Object.entries(expected))
      expect(readFileSync(path.join(repoRoot, file), 'utf8')).toBe(text);
  });
});
