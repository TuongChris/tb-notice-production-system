// Production Form Contract PFC-YT-EMAIL-v1.1 wire entry point.
//
// Initial content generated ONCE by scripts/migrations/port-frozen-contract-v1.ts from the frozen
// TB-SCHEMA-API-v1.0.0 reference (docs/reference/database-api-v1/…):
//   contracts/api-schemas.json sha256 bdb3213ba0070d13173fd5ba5f9177b769f54c90af6a46f5473667b0f1b4f7b4
//   contracts/openapi.json sha256 c47e2ea160eaa747f64218746c2997a99dec4206fbec6294ebe1335f2a7a8ba2
//   contracts/endpoint-catalog.json sha256 3f6263e82252695bdc621cdb636fd2f75ffb00b8ff0ba2617b2998c1d2cf1e61
// After the Zod-first transition is accepted (ADR-0002) this file is editable active source; the
// port is provenance only and must not be re-run over it. Build wire schemas with the `tb`
// builders only — the JSON Schema/OpenAPI lowering rejects anything else.

export { PFC_SCHEMA_VERSION } from './constants.js';
export { ProductionContextSchema, type ProductionContext } from './production-context.js';
