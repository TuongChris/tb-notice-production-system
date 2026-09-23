// ProductionContext wire schema (schemaVersion PFC-YT-EMAIL-v1.1).
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
import { PFC_SCHEMA_VERSION } from './constants.js';
import {
  AuthorityEventSchema,
  CaseAuthoritySelectionSchema,
  CaseFactSchema,
  CaseWorkSchema,
  CorrespondenceSchema,
  CoverageSignerSchema,
  MandateCoverageSchema,
  MandateVersionSchema,
  MissingItemSchema,
  ReportedItemSchema,
  SourceManifestEntrySchema,
  UseMappingSchema,
} from '../../api/schemas/core.js';

export const ProductionContextSchema = tb.object({
  schemaVersion: tb.literal(PFC_SCHEMA_VERSION),
  caseId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  canonicalCaseId: tb.string({ maxLength: 100, minLength: 1 }).nullable(),
  taskType: tb.enum(['INITIAL', 'NMI_REPLY']),
  generationMode: tb.enum(['PREPARATION', 'DRAFTING']),
  caseContextRevision: tb.integer({ minimum: 1, maximum: 4294967295 }),
  party: tb.object({
    agencyId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
    ownerId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
    legalSubjectId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
    signerId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
    agencyLegalName: tb.string({ maxLength: 255 }).nullable(),
    legalSubjectName: tb.string({ maxLength: 255 }).nullable(),
    signerFullLegalName: tb.string({ maxLength: 255 }).nullable(),
  }),
  authoritySelectionId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  reportedItems: tb.array(ReportedItemSchema, { minItems: 0, maxItems: 100 }),
  works: tb.array(CaseWorkSchema, { minItems: 0, maxItems: 100 }),
  mappings: tb.array(UseMappingSchema, { minItems: 0, maxItems: 1000 }),
  facts: tb.array(CaseFactSchema, { minItems: 0, maxItems: 1000 }),
  sources: tb.array(SourceManifestEntrySchema, { minItems: 0, maxItems: 1000 }),
  parentBindingId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  priorCorrespondenceIds: tb.array(tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }), {
    minItems: 0,
    maxItems: 100,
  }),
  missing: tb.array(MissingItemSchema, { minItems: 0, maxItems: 1000 }),
  conflicts: tb.array(MissingItemSchema, { minItems: 0, maxItems: 1000 }),
  sourcePrecedence: tb.literal('CANONICAL_PRIMARY_RECORDS_OVER_APP_DERIVATIVES'),
  signatureState: tb.literal('HUMAN_PENDING'),
  externalAction: tb.literal('PROHIBITED'),
  scannerVerification: tb.literal('DISABLED'),
  authority: tb
    .object({
      selection: CaseAuthoritySelectionSchema,
      coverages: tb.array(
        tb.object({
          coverage: MandateCoverageSchema,
          version: MandateVersionSchema,
          signerScopes: tb.array(CoverageSignerSchema, { minItems: 0, maxItems: 1000 }),
          authorityEvents: tb.array(AuthorityEventSchema, { minItems: 0, maxItems: 1000 }),
        }),
        { minItems: 1, maxItems: 20 },
      ),
    })
    .nullable(),
  correspondence: tb.array(CorrespondenceSchema, { minItems: 0, maxItems: 100 }),
  policySources: tb.array(SourceManifestEntrySchema, { minItems: 0, maxItems: 100 }),
});
export type ProductionContext = z.infer<typeof ProductionContextSchema>;
