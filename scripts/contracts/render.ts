// Deterministic serialization of the derived contract artifacts (ADR-0002).
// JSON: JSON.stringify(value, null, 2) without a trailing newline (the frozen reference convention).
// YAML: serialized from the SAME in-memory OpenAPI object, without anchors/aliases, no line folding.
import { stringify } from 'yaml';
import { buildContractArtifacts } from '../../packages/contracts/dist/index.js';

/** Designated generated outputs (repository-relative). Nothing else may be written. */
export const GENERATED_OUTPUTS = [
  'packages/contracts/schemas/api-schemas.json',
  'packages/contracts/openapi/openapi.json',
  'packages/contracts/openapi/openapi.yaml',
] as const;

/** Directories that must contain exactly the designated outputs. */
export const GENERATED_DIRECTORIES = [
  'packages/contracts/schemas',
  'packages/contracts/openapi',
] as const;

export function renderArtifacts(): Map<string, string> {
  const { jsonSchemaBundle, openApi } = buildContractArtifacts();
  const yaml = stringify(openApi, {
    aliasDuplicateObjects: false,
    lineWidth: 0,
    minContentWidth: 0,
    indent: 2,
    sortMapEntries: false,
  });
  return new Map<string, string>([
    ['packages/contracts/schemas/api-schemas.json', JSON.stringify(jsonSchemaBundle, null, 2)],
    ['packages/contracts/openapi/openapi.json', JSON.stringify(openApi, null, 2)],
    ['packages/contracts/openapi/openapi.yaml', yaml],
  ]);
}
