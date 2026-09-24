// Wire schemas of TB-SCHEMA-API-v1 that depend on ProductionContext.
//
// Initial content generated ONCE by scripts/migrations/port-frozen-contract-v1.ts from the frozen
// TB-SCHEMA-API-v1.0.0 reference (docs/reference/database-api-v1/…):
//   contracts/api-schemas.json sha256 bdb3213ba0070d13173fd5ba5f9177b769f54c90af6a46f5473667b0f1b4f7b4
//   contracts/openapi.json sha256 c47e2ea160eaa747f64218746c2997a99dec4206fbec6294ebe1335f2a7a8ba2
//   contracts/endpoint-catalog.json sha256 3f6263e82252695bdc621cdb636fd2f75ffb00b8ff0ba2617b2998c1d2cf1e61
// After the Zod-first transition is accepted (ADR-0002) this file is editable active source; the
// port is provenance only and must not be re-run over it. Build wire schemas with the `tb`
// builders only — the JSON Schema/OpenAPI lowering rejects anything else.

import type { z } from 'zod';
import { tb } from '../../primitives/wire.js';
import {
  CoverageManifestSchema,
  DependencySchema,
  MissingItemSchema,
  ResponseMetaSchema,
  SourceManifestEntrySchema,
} from './core.js';
import { ProductionContextSchema } from '../../production/pfc-youtube-email-v1_1/production-context.js';

export const PromptSnapshotSchema = tb.object({
  id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  caseId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  taskType: tb.enum(['INITIAL', 'NMI_REPLY']),
  generationMode: tb.enum(['PREPARATION', 'DRAFTING']),
  version: tb.integer({ minimum: 1, maximum: 4294967295 }),
  authoritySelectionId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  parentBindingId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  contractVersion: tb.string({ maxLength: 80 }),
  templateVersion: tb.string({ maxLength: 80 }),
  contextRevision: tb.integer({ minimum: 1, maximum: 4294967295 }),
  dependencyDigest: tb.string({ maxLength: 64, minLength: 64, pattern: '^[0-9a-f]{64}$' }),
  dependencyManifest: tb.array(DependencySchema, { minItems: 0, maxItems: 10000 }),
  contextJson: ProductionContextSchema,
  sourceManifest: tb.array(SourceManifestEntrySchema, { minItems: 0, maxItems: 1000 }),
  missingItems: tb.array(MissingItemSchema, { minItems: 0, maxItems: 1000 }),
  conflicts: tb.array(MissingItemSchema, { minItems: 0, maxItems: 1000 }),
  renderedPrompt: tb.string({ maxLength: 1000000 }),
  promptSha256: tb.string({ maxLength: 64, minLength: 64, pattern: '^[0-9a-f]{64}$' }),
  createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
  createdById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
});
export type PromptSnapshot = z.infer<typeof PromptSnapshotSchema>;

export const ValidationRunSchema = tb.object({
  id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  candidateId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  caseId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  artifactSha256: tb.string({ maxLength: 64, minLength: 64, pattern: '^[0-9a-f]{64}$' }),
  dependencyDigest: tb.string({ maxLength: 64, minLength: 64, pattern: '^[0-9a-f]{64}$' }),
  dependencyManifest: tb.array(DependencySchema, { minItems: 0, maxItems: 10000 }),
  evaluatedContextJson: ProductionContextSchema,
  rulesetVersion: tb.string({ maxLength: 80 }),
  result: tb.enum(['TECHNICAL_PASS', 'BLOCKED', 'REVIEW_REQUIRED', 'ERROR']),
  coverageManifest: CoverageManifestSchema,
  blockerCount: tb.integer({ minimum: 0, maximum: 4294967295 }),
  reviewRequiredCount: tb.integer({ minimum: 0, maximum: 4294967295 }),
  warningCount: tb.integer({ minimum: 0, maximum: 4294967295 }),
  startedAt: tb.string({ maxLength: 40, format: 'date-time' }),
  completedAt: tb.string({ maxLength: 40, format: 'date-time' }),
  createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
  createdById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
});
export type ValidationRun = z.infer<typeof ValidationRunSchema>;

export const ContextViewSchema = tb.object({
  contextRevision: tb.integer({ minimum: 1, maximum: 4294967295 }),
  dependencyDigest: tb.string({ maxLength: 64, minLength: 64, pattern: '^[0-9a-f]{64}$' }),
  dependencies: tb.array(DependencySchema, { minItems: 0, maxItems: 1000 }),
  context: ProductionContextSchema,
});
export type ContextView = z.infer<typeof ContextViewSchema>;

export const GetProductionContextResponseSchema = tb.object({
  data: ContextViewSchema,
  meta: ResponseMetaSchema,
});
export type GetProductionContextResponse = z.infer<typeof GetProductionContextResponseSchema>;

export const GeneratePromptResponseSchema = tb.object({
  data: PromptSnapshotSchema,
  meta: ResponseMetaSchema,
});
export type GeneratePromptResponse = z.infer<typeof GeneratePromptResponseSchema>;

export const GetPromptResponseSchema = tb.object({
  data: PromptSnapshotSchema,
  meta: ResponseMetaSchema,
});
export type GetPromptResponse = z.infer<typeof GetPromptResponseSchema>;

export const ValidateCandidateResponseSchema = tb.object({
  data: ValidationRunSchema,
  meta: ResponseMetaSchema,
});
export type ValidateCandidateResponse = z.infer<typeof ValidateCandidateResponseSchema>;
