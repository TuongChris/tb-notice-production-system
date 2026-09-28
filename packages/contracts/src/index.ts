// @tb/contracts — shared wire contracts. Depends on neither app nor Prisma (AR-007).
//
// Active editable source since the Zod-first transition (ADR-0002): wire schemas are built with the
// `tb` builders in ./api/schemas and ./production, HTTP operation metadata lives in
// ./api/operations.ts and ./api/openapi-document.ts. JSON Schema and OpenAPI artifacts are derived
// (`yarn contracts:generate`) and must never be edited by hand.
import type { GetHealthResponse, Health } from './api/schemas/index.js';

/**
 * Active wire-contract release: the frozen reference release plus its additive amendments, in order
 * (TB-SCHEMA-API-v1.1.0: ADR-0004, docs/contracts/TB-SCHEMA-API-v1.1.0; TB-SCHEMA-API-v1.2.0:
 * ADR-0005, docs/contracts/TB-SCHEMA-API-v1.2.0; TB-SCHEMA-API-v1.3.0: ADR-0006,
 * docs/contracts/TB-SCHEMA-API-v1.3.0).
 */
export const CONTRACT_BASELINE = 'TB-SCHEMA-API-v1.3.0';

/** The frozen reference release the active one extends (docs/reference/database-api-v1, never edited). */
export const FROZEN_REFERENCE_RELEASE = 'TB-SCHEMA-API-v1.0.0';

export * from './api/schemas/index.js';
export { API_CONTRACT_ID, apiSchemaCatalog } from './api/catalog.js';
export { operations } from './api/operations.js';
export { openApiDocument } from './api/openapi-document.js';
export type * from './api/operation-types.js';
export { PFC_SCHEMA_VERSION } from './production/pfc-youtube-email-v1_1/index.js';
export { tb, wireRegistration, type WireLowering } from './primitives/wire.js';
export { codePointLength } from './primitives/unicode.js';
export {
  matchesWireFormat,
  isWireFormat,
  WIRE_FORMATS,
  type WireFormat,
} from './primitives/formats.js';
export {
  buildContractArtifacts,
  buildJsonSchemaBundle,
  buildOpenApiDocument,
  JSON_SCHEMA_DIALECT,
  lowerSchema,
  type ContractArtifacts,
  type JsonObject,
  type JsonValue,
  type LoweringContext,
  type SchemaCatalog,
} from './generation/index.js';

/** Health status values of GET /api/v1/health (`Health.status`). */
export type HealthStatus = Health['status'];

/** One entry of `ResponseMeta.affectedResources`. */
export type AffectedResource = NonNullable<GetHealthResponse['meta']['affectedResources']>[number];
