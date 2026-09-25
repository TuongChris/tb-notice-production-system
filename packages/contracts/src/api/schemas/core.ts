// Wire schemas of TB-SCHEMA-API-v1 that do not depend on ProductionContext.
//
// Initial content generated ONCE by scripts/migrations/port-frozen-contract-v1.ts from the frozen
// TB-SCHEMA-API-v1.0.0 reference (docs/reference/database-api-v1/…):
//   contracts/api-schemas.json sha256 bdb3213ba0070d13173fd5ba5f9177b769f54c90af6a46f5473667b0f1b4f7b4
//   contracts/openapi.json sha256 c47e2ea160eaa747f64218746c2997a99dec4206fbec6294ebe1335f2a7a8ba2
//   contracts/endpoint-catalog.json sha256 3f6263e82252695bdc621cdb636fd2f75ffb00b8ff0ba2617b2998c1d2cf1e61
// After the Zod-first transition is accepted (ADR-0002) this file is editable active source; the
// port is provenance only and must not be re-run over it. Build wire schemas with the `tb`
// builders only — the JSON Schema/OpenAPI lowering rejects anything else.
// Amended additively by TB-SCHEMA-API-v1.1.0 (ADR-0004, docs/contracts/TB-SCHEMA-API-v1.1.0):
// CaseAuthoritySelectionView and GetCaseAuthoritySelectionResponse; and by TB-SCHEMA-API-v1.2.0
// (ADR-0005, docs/contracts/TB-SCHEMA-API-v1.2.0): CaseFactSourcesView and
// GetCaseFactSourcesResponse.

import type { z } from 'zod';
import { tb } from '../../primitives/wire.js';
import { PFC_SCHEMA_VERSION } from '../../production/pfc-youtube-email-v1_1/constants.js';

export const LooseObjectSchema = tb.looseObject({
  description:
    'Reserved extension data only. Not accepted for material facts without an explicit schema.',
});
export type LooseObject = z.infer<typeof LooseObjectSchema>;

export const PostalAddressSchema = tb.object({
  line1: tb.string({ maxLength: 255 }).optional(),
  line2: tb.string({ maxLength: 255 }).optional(),
  city: tb.string({ maxLength: 150 }).optional(),
  region: tb.string({ maxLength: 150 }).optional(),
  postalCode: tb.string({ maxLength: 40 }).optional(),
  country: tb.string({ maxLength: 2, minLength: 2, pattern: '^[A-Z]{2}$' }).optional(),
});
export type PostalAddress = z.infer<typeof PostalAddressSchema>;

export const FieldAttributionSchema = tb.object({
  field: tb.string({ maxLength: 100, minLength: 1 }),
  provenance: tb.enum([
    'DOCUMENT_REVIEWED',
    'OPERATOR_REPORTED',
    'ANALYSIS',
    'MISSING',
    'CONFLICT',
  ]),
  sourceIds: tb.array(tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }), {
    minItems: 0,
    maxItems: 50,
  }),
  scopeText: tb.string({ maxLength: 3000, minLength: 1 }),
  asOf: tb.string({ maxLength: 40, format: 'date-time' }).nullable().optional(),
  limitations: tb.string({ maxLength: 5000 }).nullable().optional(),
});
export type FieldAttribution = z.infer<typeof FieldAttributionSchema>;

export const SourceChannelSchema = tb.object({
  platform: tb.enum(['YOUTUBE']),
  channelId: tb.string({ maxLength: 100, minLength: 1 }).nullable().optional(),
  url: tb.string({ maxLength: 4096, minLength: 1, format: 'uri', pattern: '^https?://' }),
  displayName: tb.string({ maxLength: 255 }).nullable().optional(),
});
export type SourceChannel = z.infer<typeof SourceChannelSchema>;

export const SourceLinkSchema = tb.object({
  sourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  role: tb.string({ maxLength: 80, minLength: 1 }),
  scopeText: tb.string({ maxLength: 4000, minLength: 1 }),
});
export type SourceLink = z.infer<typeof SourceLinkSchema>;

export const DocumentPlanSchema = tb.object({
  sourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  purpose: tb.string({ maxLength: 1000, minLength: 1 }),
  state: tb.enum(['REFERENCE_ONLY', 'PREPARED_FOR_ATTACHMENT', 'PREVIOUSLY_SUPPLIED', 'UNKNOWN']),
  fileName: tb.string({ maxLength: 255 }).nullable().optional(),
  contentSha256: tb
    .string({ maxLength: 64, minLength: 64, pattern: '^[0-9a-f]{64}$' })
    .nullable()
    .optional(),
  disclosureReview: tb.enum(['PENDING', 'REVIEWED_WITH_LIMITS']),
  limitations: tb.string({ maxLength: 3000 }).nullable().optional(),
});
export type DocumentPlan = z.infer<typeof DocumentPlanSchema>;

export const EnvelopeSchema = tb.object({
  from: tb.string({ maxLength: 254, minLength: 3, format: 'email' }),
  to: tb.string({ maxLength: 254, minLength: 3, format: 'email' }),
  replyTo: tb.string({ maxLength: 254, minLength: 3, format: 'email' }).nullable().optional(),
  parentBindingId: tb
    .string({ maxLength: 36, minLength: 36, format: 'uuid' })
    .nullable()
    .optional(),
});
export type Envelope = z.infer<typeof EnvelopeSchema>;

export const AttachmentObservationSchema = tb.object({
  fileName: tb.string({ maxLength: 255, minLength: 1 }),
  sourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
  sha256: tb
    .string({ maxLength: 64, minLength: 64, pattern: '^[0-9a-f]{64}$' })
    .nullable()
    .optional(),
  state: tb.enum(['OBSERVED_IN_RAW_MIME', 'COPIED_TEXT_ALLEGATION', 'UNKNOWN']),
});
export type AttachmentObservation = z.infer<typeof AttachmentObservationSchema>;

export const DependencySchema = tb.object({
  entityType: tb.string({ maxLength: 100, minLength: 1 }),
  entityId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  rowVersion: tb.integer({ minimum: 1, maximum: 4294967295 }).nullable().optional(),
  fingerprint: tb.string({ maxLength: 64, minLength: 64, pattern: '^[0-9a-f]{64}$' }),
});
export type Dependency = z.infer<typeof DependencySchema>;

export const AskDispositionSchema = tb.object({
  askId: tb.string({ maxLength: 100, minLength: 1 }),
  questionText: tb.string({ maxLength: 12000, minLength: 1 }),
  parentBindingId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  disposition: tb.enum([
    'ANSWERED_SUPPORTED',
    'ANSWERED_WITH_LIMITATION',
    'REQUIRES_DOCUMENT',
    'MISSING_FACT',
    'LEGAL_REVIEW_REQUIRED',
    'NOT_APPLICABLE_WITH_REASON',
  ]),
  answerLocator: tb.string({ maxLength: 1000 }).nullable().optional(),
  sourceIds: tb.array(tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }), {
    minItems: 0,
    maxItems: 50,
  }),
  unresolvedRemainder: tb.string({ maxLength: 5000 }).nullable().optional(),
});
export type AskDisposition = z.infer<typeof AskDispositionSchema>;

export const SourceManifestEntrySchema = tb.object({
  sourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  role: tb.string({ maxLength: 80, minLength: 1 }),
  canonicalUrl: tb
    .string({ maxLength: 4096, minLength: 1, format: 'uri', pattern: '^https?://' })
    .nullable()
    .optional(),
  contentSha256: tb
    .string({ maxLength: 64, minLength: 64, pattern: '^[0-9a-f]{64}$' })
    .nullable()
    .optional(),
  hashTarget: tb.enum(['RAW_FILE', 'EXTRACTED_TEXT', 'OTHER']).nullable().optional(),
  provenance: tb.enum([
    'DOCUMENT_REVIEWED',
    'OPERATOR_REPORTED',
    'ANALYSIS',
    'MISSING',
    'CONFLICT',
  ]),
  scopeText: tb.string({ maxLength: 5000, minLength: 1 }),
  limitations: tb.string({ maxLength: 5000 }).nullable().optional(),
});
export type SourceManifestEntry = z.infer<typeof SourceManifestEntrySchema>;

export const MissingItemSchema = tb.object({
  code: tb.string({ maxLength: 100, minLength: 1 }),
  message: tb.string({ maxLength: 8000, minLength: 1 }),
  fieldPath: tb.string({ maxLength: 500 }).nullable().optional(),
});
export type MissingItem = z.infer<typeof MissingItemSchema>;

export const RawTimecodesSchema = tb.object({
  sourceStart: tb.string({ maxLength: 100 }).nullable().optional(),
  sourceEnd: tb.string({ maxLength: 100 }).nullable().optional(),
  reportedStart: tb.string({ maxLength: 100 }).nullable().optional(),
  reportedEnd: tb.string({ maxLength: 100 }).nullable().optional(),
});
export type RawTimecodes = z.infer<typeof RawTimecodesSchema>;

export const CoverageManifestSchema = tb.object({
  requiredRuleIds: tb.array(tb.string({ maxLength: 100, minLength: 1 }), {
    minItems: 0,
    maxItems: 1000,
  }),
  executedRuleIds: tb.array(tb.string({ maxLength: 100, minLength: 1 }), {
    minItems: 0,
    maxItems: 1000,
  }),
  notExecutedRuleIds: tb.array(tb.string({ maxLength: 100, minLength: 1 }), {
    minItems: 0,
    maxItems: 1000,
  }),
  semanticReviewRequired: tb.literal(true),
});
export type CoverageManifest = z.infer<typeof CoverageManifestSchema>;

export const SelectedCoverageSchema = tb.object({
  coverageId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  applicationScope: tb.string({ maxLength: 6000, minLength: 1 }),
});
export type SelectedCoverage = z.infer<typeof SelectedCoverageSchema>;

export const FactValue_RIGHTS_BASISSchema = tb.object({
  basis: tb.enum([
    'CREATOR_ORIGIN',
    'ASSIGNMENT',
    'TRANSFER',
    'EMPLOYMENT',
    'EXCLUSIVE_LICENCE',
    'OTHER',
    'UNKNOWN',
  ]),
  assertion: tb.string({ maxLength: 24000 }),
  limitations: tb.string({ maxLength: 8000 }).nullable().optional(),
});
export type FactValue_RIGHTS_BASIS = z.infer<typeof FactValue_RIGHTS_BASISSchema>;

export const FactValue_RIGHTS_SCOPESchema = tb.object({
  exclusiveRights: tb.array(tb.string({ maxLength: 120, minLength: 1 }), {
    minItems: 0,
    maxItems: 30,
  }),
  protectedExpression: tb.string({ maxLength: 16000 }),
  thirdPartyExclusions: tb.string({ maxLength: 16000 }),
  contraryRecords: tb.string({ maxLength: 16000 }),
});
export type FactValue_RIGHTS_SCOPE = z.infer<typeof FactValue_RIGHTS_SCOPESchema>;

export const FactValue_PERMISSIONSchema = tb.object({
  finding: tb.enum(['NO_PERMISSION_REPORTED', 'PERMISSION_GRANTED', 'UNKNOWN', 'CONFLICT']),
  assertion: tb.string({ maxLength: 16000 }),
  reviewScope: tb.string({ maxLength: 8000 }),
});
export type FactValue_PERMISSION = z.infer<typeof FactValue_PERMISSIONSchema>;

export const FactValue_AV_COMPARISONSchema = tb.object({
  finding: tb.enum([
    'HUMAN_REVIEW_REPORTED',
    'PRIMARY_EVIDENCE_REVIEWED',
    'UNREVIEWED',
    'CONFLICT',
  ]),
  method: tb.string({ maxLength: 8000 }),
  assertion: tb.string({ maxLength: 16000 }),
  limitations: tb.string({ maxLength: 8000 }),
});
export type FactValue_AV_COMPARISON = z.infer<typeof FactValue_AV_COMPARISONSchema>;

export const FactValue_EXCEPTION_REVIEWSchema = tb.object({
  finding: tb.enum(['REVIEW_RECORDED', 'UNREVIEWED', 'LEGAL_REVIEW_REQUIRED', 'CONFLICT']),
  reasoning: tb.string({ maxLength: 24000 }),
  jurisdictionScope: tb.string({ maxLength: 4000 }),
  limitations: tb.string({ maxLength: 8000 }),
});
export type FactValue_EXCEPTION_REVIEW = z.infer<typeof FactValue_EXCEPTION_REVIEWSchema>;

export const FactValue_WORK_IDENTIFICATIONSchema = tb.object({
  description: tb.string({ maxLength: 16000 }),
  limitations: tb.string({ maxLength: 8000 }),
});
export type FactValue_WORK_IDENTIFICATION = z.infer<typeof FactValue_WORK_IDENTIFICATIONSchema>;

export const FactValue_REPORTED_IDENTIFICATIONSchema = tb.object({
  description: tb.string({ maxLength: 16000 }),
  limitations: tb.string({ maxLength: 8000 }),
});
export type FactValue_REPORTED_IDENTIFICATION = z.infer<
  typeof FactValue_REPORTED_IDENTIFICATIONSchema
>;

export const FactValue_DUPLICATE_REVIEWSchema = tb.object({
  finding: tb.enum(['UNCHECKED', 'POSSIBLE_OVERLAP', 'REVIEWED_DISTINCT', 'EXISTING_MATTER']),
  coverageDescription: tb.string({ maxLength: 8000 }),
  observedThrough: tb.string({ maxLength: 40, format: 'date-time' }).nullable(),
  relatedCaseIds: tb.array(tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }), {
    minItems: 0,
    maxItems: 100,
  }),
  reasoning: tb.string({ maxLength: 16000 }),
});
export type FactValue_DUPLICATE_REVIEW = z.infer<typeof FactValue_DUPLICATE_REVIEWSchema>;

export const FactValue_AUTHORITY_CURRENTNESSSchema = tb.object({
  finding: tb.enum(['REPORTED_CURRENT', 'UNKNOWN', 'CONFLICT', 'ENDED']),
  assertion: tb.string({ maxLength: 16000 }),
  asOf: tb.string({ maxLength: 40, format: 'date-time' }).nullable(),
  limitations: tb.string({ maxLength: 8000 }),
});
export type FactValue_AUTHORITY_CURRENTNESS = z.infer<typeof FactValue_AUTHORITY_CURRENTNESSSchema>;

export const FactValueSchema = tb.oneOf('factType', [
  tb.object({ factType: tb.literal('RIGHTS_BASIS'), value: FactValue_RIGHTS_BASISSchema }),
  tb.object({ factType: tb.literal('RIGHTS_SCOPE'), value: FactValue_RIGHTS_SCOPESchema }),
  tb.object({ factType: tb.literal('PERMISSION'), value: FactValue_PERMISSIONSchema }),
  tb.object({ factType: tb.literal('AV_COMPARISON'), value: FactValue_AV_COMPARISONSchema }),
  tb.object({ factType: tb.literal('EXCEPTION_REVIEW'), value: FactValue_EXCEPTION_REVIEWSchema }),
  tb.object({
    factType: tb.literal('WORK_IDENTIFICATION'),
    value: FactValue_WORK_IDENTIFICATIONSchema,
  }),
  tb.object({
    factType: tb.literal('REPORTED_IDENTIFICATION'),
    value: FactValue_REPORTED_IDENTIFICATIONSchema,
  }),
  tb.object({ factType: tb.literal('DUPLICATE_REVIEW'), value: FactValue_DUPLICATE_REVIEWSchema }),
  tb.object({
    factType: tb.literal('AUTHORITY_CURRENTNESS'),
    value: FactValue_AUTHORITY_CURRENTNESSSchema,
  }),
]);
export type FactValue = z.infer<typeof FactValueSchema>;

export const UserSchema = tb.object({
  id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  email: tb.string({ maxLength: 254 }),
  displayName: tb.string({ maxLength: 160 }),
  enabled: tb.boolean(),
  passwordChangedAt: tb.string({ maxLength: 40, format: 'date-time' }).nullable(),
  disabledAt: tb.string({ maxLength: 40, format: 'date-time' }).nullable(),
  createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
});
export type User = z.infer<typeof UserSchema>;

export const AuthSessionSchema = tb.object({
  id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  userId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  expiresAt: tb.string({ maxLength: 40, format: 'date-time' }),
  lastSeenAt: tb.string({ maxLength: 40, format: 'date-time' }),
  revokedAt: tb.string({ maxLength: 40, format: 'date-time' }).nullable(),
  createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
});
export type AuthSession = z.infer<typeof AuthSessionSchema>;

export const AgencySchema = tb.object({
  id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  displayName: tb.string({ maxLength: 200 }),
  legalName: tb.string({ maxLength: 255 }).nullable(),
  organizationType: tb.string({ maxLength: 50 }).nullable(),
  jurisdictionCountry: tb.string({ maxLength: 2 }).nullable(),
  registrationAuthority: tb.string({ maxLength: 200 }).nullable(),
  registrationNumber: tb.string({ maxLength: 100 }).nullable(),
  websiteUrl: tb
    .string({ maxLength: 2048, minLength: 1, format: 'uri', pattern: '^https?://' })
    .nullable(),
  copyrightEmail: tb.string({ maxLength: 254, minLength: 3, format: 'email' }).nullable(),
  verificationEmail: tb.string({ maxLength: 254, minLength: 3, format: 'email' }).nullable(),
  postalAddress: PostalAddressSchema.nullable(),
  phone: tb.string({ maxLength: 80 }).nullable(),
  driveRootUrl: tb
    .string({ maxLength: 2048, minLength: 1, format: 'uri', pattern: '^https?://' })
    .nullable(),
  masterUrl: tb
    .string({ maxLength: 2048, minLength: 1, format: 'uri', pattern: '^https?://' })
    .nullable(),
  startHereUrl: tb
    .string({ maxLength: 2048, minLength: 1, format: 'uri', pattern: '^https?://' })
    .nullable(),
  fieldAttributions: tb.array(FieldAttributionSchema, { minItems: 0, maxItems: 100 }).nullable(),
  recordState: tb.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']),
  canonicalCode: tb.string({ maxLength: 100 }).nullable(),
  canonicalSourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  bindingState: tb.enum(['LOCAL_ONLY', 'SOURCE_REFERENCED', 'DIVERGENT']),
  notes: tb.string({ maxLength: 1000000 }).nullable(),
  archivedAt: tb.string({ maxLength: 40, format: 'date-time' }).nullable(),
  archiveReason: tb.string({ maxLength: 1000000 }).nullable(),
  createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
  createdById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  updatedAt: tb.string({ maxLength: 40, format: 'date-time' }),
  updatedById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  rowVersion: tb.integer({ minimum: 1, maximum: 4294967295 }),
});
export type Agency = z.infer<typeof AgencySchema>;

export const OwnerSchema = tb.object({
  id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  displayName: tb.string({ maxLength: 200 }),
  aliases: tb
    .array(tb.string({ maxLength: 255, minLength: 1 }), { minItems: 0, maxItems: 100 })
    .nullable(),
  contactName: tb.string({ maxLength: 200 }).nullable(),
  contactEmail: tb.string({ maxLength: 254, minLength: 3, format: 'email' }).nullable(),
  sourceChannels: tb.array(SourceChannelSchema, { minItems: 0, maxItems: 100 }).nullable(),
  websiteUrl: tb
    .string({ maxLength: 2048, minLength: 1, format: 'uri', pattern: '^https?://' })
    .nullable(),
  preferredLanguage: tb.string({ maxLength: 20 }).nullable(),
  driveFolderUrl: tb
    .string({ maxLength: 2048, minLength: 1, format: 'uri', pattern: '^https?://' })
    .nullable(),
  recordState: tb.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']),
  canonicalCode: tb.string({ maxLength: 100 }).nullable(),
  canonicalSourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  bindingState: tb.enum(['LOCAL_ONLY', 'SOURCE_REFERENCED', 'DIVERGENT']),
  notes: tb.string({ maxLength: 1000000 }).nullable(),
  archivedAt: tb.string({ maxLength: 40, format: 'date-time' }).nullable(),
  archiveReason: tb.string({ maxLength: 1000000 }).nullable(),
  createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
  createdById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  updatedAt: tb.string({ maxLength: 40, format: 'date-time' }),
  updatedById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  rowVersion: tb.integer({ minimum: 1, maximum: 4294967295 }),
});
export type Owner = z.infer<typeof OwnerSchema>;

export const LegalSubjectSchema = tb.object({
  id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  subjectType: tb.enum(['INDIVIDUAL', 'LEGAL_ENTITY', 'OTHER']),
  legalName: tb.string({ maxLength: 255 }),
  aliases: tb
    .array(tb.string({ maxLength: 255, minLength: 1 }), { minItems: 0, maxItems: 100 })
    .nullable(),
  jurisdictionCountry: tb.string({ maxLength: 2 }).nullable(),
  legalForm: tb.string({ maxLength: 80 }).nullable(),
  registrationAuthority: tb.string({ maxLength: 200 }).nullable(),
  registrationNumber: tb.string({ maxLength: 100 }).nullable(),
  contactEmail: tb.string({ maxLength: 254, minLength: 3, format: 'email' }).nullable(),
  postalAddress: PostalAddressSchema.nullable(),
  fieldAttributions: tb.array(FieldAttributionSchema, { minItems: 0, maxItems: 100 }).nullable(),
  identityReviewState: tb.enum(['UNREVIEWED', 'REVIEWED_WITH_LIMITS', 'CONFLICT']),
  recordState: tb.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']),
  canonicalCode: tb.string({ maxLength: 100 }).nullable(),
  canonicalSourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  bindingState: tb.enum(['LOCAL_ONLY', 'SOURCE_REFERENCED', 'DIVERGENT']),
  notes: tb.string({ maxLength: 1000000 }).nullable(),
  archivedAt: tb.string({ maxLength: 40, format: 'date-time' }).nullable(),
  archiveReason: tb.string({ maxLength: 1000000 }).nullable(),
  createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
  createdById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  updatedAt: tb.string({ maxLength: 40, format: 'date-time' }),
  updatedById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  rowVersion: tb.integer({ minimum: 1, maximum: 4294967295 }),
});
export type LegalSubject = z.infer<typeof LegalSubjectSchema>;

export const OwnerSubjectSchema = tb.object({
  id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  ownerId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  legalSubjectId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  relationshipLabel: tb.string({ maxLength: 200 }).nullable(),
  sourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  linkState: tb.enum(['LINKED', 'PAUSED', 'UNLINKED']),
  unlinkedAt: tb.string({ maxLength: 40, format: 'date-time' }).nullable(),
  unlinkReason: tb.string({ maxLength: 1000000 }).nullable(),
  createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
  createdById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  updatedAt: tb.string({ maxLength: 40, format: 'date-time' }),
  updatedById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  rowVersion: tb.integer({ minimum: 1, maximum: 4294967295 }),
});
export type OwnerSubject = z.infer<typeof OwnerSubjectSchema>;

export const SignerSchema = tb.object({
  id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  agencyId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  fullLegalName: tb.string({ maxLength: 255 }),
  title: tb.string({ maxLength: 200 }).nullable(),
  contactEmail: tb.string({ maxLength: 254, minLength: 3, format: 'email' }).nullable(),
  identitySourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  delegationSourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  operationalState: tb.enum(['DRAFT', 'AVAILABLE', 'PAUSED', 'ENDED']),
  canonicalCode: tb.string({ maxLength: 100 }).nullable(),
  canonicalSourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  bindingState: tb.enum(['LOCAL_ONLY', 'SOURCE_REFERENCED', 'DIVERGENT']),
  notes: tb.string({ maxLength: 1000000 }).nullable(),
  archivedAt: tb.string({ maxLength: 40, format: 'date-time' }).nullable(),
  archiveReason: tb.string({ maxLength: 1000000 }).nullable(),
  createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
  createdById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  updatedAt: tb.string({ maxLength: 40, format: 'date-time' }),
  updatedById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  rowVersion: tb.integer({ minimum: 1, maximum: 4294967295 }),
});
export type Signer = z.infer<typeof SignerSchema>;

export const RouteSchema = tb.object({
  id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  agencyId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  ownerSubjectId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  platform: tb.enum(['YOUTUBE']),
  linkState: tb.enum(['LINKED', 'PAUSED', 'UNLINKED']),
  defaultSignerId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  preferredCoverageId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  casePrefixHint: tb.string({ maxLength: 40 }).nullable(),
  unlinkedAt: tb.string({ maxLength: 40, format: 'date-time' }).nullable(),
  stateReason: tb.string({ maxLength: 1000000 }).nullable(),
  canonicalCode: tb.string({ maxLength: 100 }).nullable(),
  canonicalSourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  bindingState: tb.enum(['LOCAL_ONLY', 'SOURCE_REFERENCED', 'DIVERGENT']),
  notes: tb.string({ maxLength: 1000000 }).nullable(),
  archivedAt: tb.string({ maxLength: 40, format: 'date-time' }).nullable(),
  archiveReason: tb.string({ maxLength: 1000000 }).nullable(),
  createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
  createdById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  updatedAt: tb.string({ maxLength: 40, format: 'date-time' }),
  updatedById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  rowVersion: tb.integer({ minimum: 1, maximum: 4294967295 }),
});
export type Route = z.infer<typeof RouteSchema>;

export const MandateSchema = tb.object({
  id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  agencyId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  label: tb.string({ maxLength: 255 }),
  externalReference: tb.string({ maxLength: 191 }).nullable(),
  description: tb.string({ maxLength: 1000000 }).nullable(),
  canonicalCode: tb.string({ maxLength: 100 }).nullable(),
  canonicalSourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  bindingState: tb.enum(['LOCAL_ONLY', 'SOURCE_REFERENCED', 'DIVERGENT']),
  notes: tb.string({ maxLength: 1000000 }).nullable(),
  archivedAt: tb.string({ maxLength: 40, format: 'date-time' }).nullable(),
  archiveReason: tb.string({ maxLength: 1000000 }).nullable(),
  createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
  createdById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  updatedAt: tb.string({ maxLength: 40, format: 'date-time' }),
  updatedById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  rowVersion: tb.integer({ minimum: 1, maximum: 4294967295 }),
});
export type Mandate = z.infer<typeof MandateSchema>;

export const MandateVersionSchema = tb.object({
  id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  mandateId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  agencyId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  version: tb.integer({ minimum: 1, maximum: 4294967295 }),
  versionState: tb.enum(['DRAFT', 'FROZEN']),
  changeKind: tb.enum([
    'NEW_AUTHORIZATION',
    'AMENDMENT',
    'DOCUMENT_CAPTURE',
    'METADATA_CORRECTION',
  ]),
  predecessorId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  primarySourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  additionalSourceRefs: tb.array(SourceLinkSchema, { minItems: 0, maxItems: 100 }).nullable(),
  documentState: tb.enum(['MISSING', 'DRAFT', 'SIGNED_APPEARING', 'UNKNOWN']),
  sourceReviewState: tb.enum(['UNREVIEWED', 'REVIEWED_WITH_LIMITS', 'CONFLICT']),
  signedDatesRaw: tb
    .array(
      tb.object({
        subjectLabel: tb.string({ maxLength: 255, minLength: 1 }),
        dateRaw: tb.string({ maxLength: 100, minLength: 1 }),
        sourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
      }),
      { minItems: 0, maxItems: 50 },
    )
    .nullable(),
  validityModel: tb.enum(['UNKNOWN', 'FIXED_TERM', 'UNTIL_TERMINATED']),
  effectiveOn: tb.string({ maxLength: 10, minLength: 10, format: 'date' }).nullable(),
  expiresOn: tb.string({ maxLength: 10, minLength: 10, format: 'date' }).nullable(),
  validityNotes: tb.string({ maxLength: 1000000 }).nullable(),
  frozenAt: tb.string({ maxLength: 40, format: 'date-time' }).nullable(),
  changeReason: tb.string({ maxLength: 1000000 }),
  createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
  createdById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  updatedAt: tb.string({ maxLength: 40, format: 'date-time' }),
  updatedById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  rowVersion: tb.integer({ minimum: 1, maximum: 4294967295 }),
});
export type MandateVersion = z.infer<typeof MandateVersionSchema>;

export const MandateCoverageSchema = tb.object({
  id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  mandateVersionId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  routeId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  agencyId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  coverageLabel: tb.string({ maxLength: 191 }),
  coveredWorksScope: tb.string({ maxLength: 1000000 }).nullable(),
  territorialScope: tb.string({ maxLength: 1000000 }).nullable(),
  actionScope: tb
    .array(
      tb.enum([
        'PREPARE_NOTICE',
        'SIGN_NOTICE',
        'SUBMIT_NOTICE',
        'SUPPLEMENT',
        'CORRECTION',
        'ADMINISTRATIVE_COUNTERNOTICE',
      ]),
      { minItems: 0, maxItems: 10 },
    )
    .nullable(),
  exclusions: tb.string({ maxLength: 1000000 }).nullable(),
  conditions: tb.string({ maxLength: 1000000 }).nullable(),
  exclusivity: tb.enum(['UNKNOWN', 'EXCLUSIVE', 'NON_EXCLUSIVE']),
  effectiveOn: tb.string({ maxLength: 10, minLength: 10, format: 'date' }).nullable(),
  expiresOn: tb.string({ maxLength: 10, minLength: 10, format: 'date' }).nullable(),
  basisSourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  predecessorCoverageId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
  createdById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  updatedAt: tb.string({ maxLength: 40, format: 'date-time' }),
  updatedById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  rowVersion: tb.integer({ minimum: 1, maximum: 4294967295 }),
});
export type MandateCoverage = z.infer<typeof MandateCoverageSchema>;

export const CoverageSignerSchema = tb.object({
  id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  coverageId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  agencyId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  signerId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  capacity: tb.string({ maxLength: 120 }),
  actionScope: tb
    .array(
      tb.enum([
        'PREPARE_NOTICE',
        'SIGN_NOTICE',
        'SUBMIT_NOTICE',
        'SUPPLEMENT',
        'CORRECTION',
        'ADMINISTRATIVE_COUNTERNOTICE',
      ]),
      { minItems: 0, maxItems: 10 },
    )
    .nullable(),
  sourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  effectiveOn: tb.string({ maxLength: 10, minLength: 10, format: 'date' }).nullable(),
  endsOn: tb.string({ maxLength: 10, minLength: 10, format: 'date' }).nullable(),
  limitations: tb.string({ maxLength: 1000000 }).nullable(),
  createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
  createdById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  updatedAt: tb.string({ maxLength: 40, format: 'date-time' }),
  updatedById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  rowVersion: tb.integer({ minimum: 1, maximum: 4294967295 }),
});
export type CoverageSigner = z.infer<typeof CoverageSignerSchema>;

export const AuthorityEventSchema = tb.object({
  id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  mandateId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  agencyId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  coverageId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  eventType: tb.enum([
    'CURRENTNESS_RECORDED',
    'REVOCATION',
    'TERMINATION',
    'SUPERSESSION',
    'RESIGNATION',
    'CORRECTION',
  ]),
  sourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  provenance: tb.enum([
    'DOCUMENT_REVIEWED',
    'OPERATOR_REPORTED',
    'ANALYSIS',
    'MISSING',
    'CONFLICT',
  ]),
  effectiveOn: tb.string({ maxLength: 10, minLength: 10, format: 'date' }).nullable(),
  effectiveAt: tb.string({ maxLength: 40, format: 'date-time' }).nullable(),
  rawEffectiveText: tb.string({ maxLength: 500 }).nullable(),
  scopeText: tb.string({ maxLength: 1000000 }),
  supersedesEventId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  interpretation: tb.string({ maxLength: 1000000 }),
  createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
  createdById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
});
export type AuthorityEvent = z.infer<typeof AuthorityEventSchema>;

export const CaseRecordSchema = tb.object({
  id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  agencyId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  platform: tb.enum(['YOUTUBE']),
  intakeLabel: tb.string({ maxLength: 255 }),
  ownerHintId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  routeId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  canonicalCaseId: tb.string({ maxLength: 100 }).nullable(),
  canonicalBindingSourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  caseClass: tb.enum([
    'WORKING_INTAKE',
    'CURRENT_OPERATION',
    'RECOVERED_HISTORY',
    'EXTERNAL_REFERENCE',
  ]),
  workflowState: tb.enum([
    'INTAKE',
    'PREPARING',
    'DRAFTING',
    'AWAITING_HUMAN',
    'AWAITING_PLATFORM',
    'CLOSED',
  ]),
  currentAuthoritySelectionId: tb
    .string({ maxLength: 36, minLength: 36, format: 'uuid' })
    .nullable(),
  packetSourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  driveFolderUrl: tb
    .string({ maxLength: 2048, minLength: 1, format: 'uri', pattern: '^https?://' })
    .nullable(),
  contextRevision: tb.integer({ minimum: 1, maximum: 4294967295 }),
  closedAt: tb.string({ maxLength: 40, format: 'date-time' }).nullable(),
  closeReason: tb.string({ maxLength: 1000000 }).nullable(),
  archivedAt: tb.string({ maxLength: 40, format: 'date-time' }).nullable(),
  archiveReason: tb.string({ maxLength: 1000000 }).nullable(),
  notes: tb.string({ maxLength: 1000000 }).nullable(),
  createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
  createdById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  updatedAt: tb.string({ maxLength: 40, format: 'date-time' }),
  updatedById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  rowVersion: tb.integer({ minimum: 1, maximum: 4294967295 }),
});
export type CaseRecord = z.infer<typeof CaseRecordSchema>;

export const CaseAuthoritySelectionSchema = tb.object({
  id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  caseId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  agencyId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  routeId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  signerId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  taskType: tb.enum(['INITIAL', 'NMI_REPLY']),
  intendedFromEmail: tb.string({ maxLength: 254, minLength: 3, format: 'email' }),
  basisSourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  selectionNote: tb.string({ maxLength: 1000000 }),
  createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
  createdById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
});
export type CaseAuthoritySelection = z.infer<typeof CaseAuthoritySelectionSchema>;

export const CaseAuthorityCoverageSchema = tb.object({
  id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  selectionId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  caseId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  agencyId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  routeId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  coverageId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  applicationScope: tb.string({ maxLength: 1000000 }),
  createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
  createdById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
});
export type CaseAuthorityCoverage = z.infer<typeof CaseAuthorityCoverageSchema>;

export const ReportedItemSchema = tb.object({
  id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  caseId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  rawUrl: tb.string({ maxLength: 4096, minLength: 1, format: 'uri', pattern: '^https?://' }),
  normalizedUrl: tb.string({ maxLength: 2048, minLength: 1, format: 'uri', pattern: '^https?://' }),
  externalItemId: tb.string({ maxLength: 64 }),
  displayTitle: tb.string({ maxLength: 500 }).nullable(),
  observedAt: tb.string({ maxLength: 40, format: 'date-time' }).nullable(),
  archivedAt: tb.string({ maxLength: 40, format: 'date-time' }).nullable(),
  archiveReason: tb.string({ maxLength: 1000000 }).nullable(),
  createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
  createdById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  updatedAt: tb.string({ maxLength: 40, format: 'date-time' }),
  updatedById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  rowVersion: tb.integer({ minimum: 1, maximum: 4294967295 }),
});
export type ReportedItem = z.infer<typeof ReportedItemSchema>;

export const CaseWorkSchema = tb.object({
  id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  caseId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  title: tb.string({ maxLength: 500 }),
  sourceUrl: tb
    .string({ maxLength: 4096, minLength: 1, format: 'uri', pattern: '^https?://' })
    .nullable(),
  externalWorkId: tb.string({ maxLength: 191 }).nullable(),
  workType: tb.string({ maxLength: 100 }).nullable(),
  notes: tb.string({ maxLength: 1000000 }).nullable(),
  archivedAt: tb.string({ maxLength: 40, format: 'date-time' }).nullable(),
  archiveReason: tb.string({ maxLength: 1000000 }).nullable(),
  createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
  createdById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  updatedAt: tb.string({ maxLength: 40, format: 'date-time' }),
  updatedById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  rowVersion: tb.integer({ minimum: 1, maximum: 4294967295 }),
});
export type CaseWork = z.infer<typeof CaseWorkSchema>;

export const UseMappingSchema = tb.object({
  id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  caseId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  caseWorkId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  reportedItemId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  occurrence: tb.integer({ minimum: 1, maximum: 4294967295 }),
  sourceStartMs: tb
    .string({
      maxLength: 16,
      minLength: 1,
      pattern: '^(0|[1-9][0-9]{0,15})$',
      description:
        'Unsigned milliseconds as decimal string, <= 9007199254740991; server maps to BigInt.',
    })
    .nullable(),
  sourceEndMs: tb
    .string({
      maxLength: 16,
      minLength: 1,
      pattern: '^(0|[1-9][0-9]{0,15})$',
      description:
        'Unsigned milliseconds as decimal string, <= 9007199254740991; server maps to BigInt.',
    })
    .nullable(),
  reportedStartMs: tb
    .string({
      maxLength: 16,
      minLength: 1,
      pattern: '^(0|[1-9][0-9]{0,15})$',
      description:
        'Unsigned milliseconds as decimal string, <= 9007199254740991; server maps to BigInt.',
    })
    .nullable(),
  reportedEndMs: tb
    .string({
      maxLength: 16,
      minLength: 1,
      pattern: '^(0|[1-9][0-9]{0,15})$',
      description:
        'Unsigned milliseconds as decimal string, <= 9007199254740991; server maps to BigInt.',
    })
    .nullable(),
  rawTimecodes: RawTimecodesSchema.nullable(),
  boundaryConvention: tb.string({ maxLength: 40 }),
  provenance: tb.enum([
    'DOCUMENT_REVIEWED',
    'OPERATOR_REPORTED',
    'ANALYSIS',
    'MISSING',
    'CONFLICT',
  ]),
  basisSourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  limitations: tb.string({ maxLength: 1000000 }).nullable(),
  archivedAt: tb.string({ maxLength: 40, format: 'date-time' }).nullable(),
  archiveReason: tb.string({ maxLength: 1000000 }).nullable(),
  createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
  createdById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  updatedAt: tb.string({ maxLength: 40, format: 'date-time' }),
  updatedById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  rowVersion: tb.integer({ minimum: 1, maximum: 4294967295 }),
});
export type UseMapping = z.infer<typeof UseMappingSchema>;

export const SourceReferenceSchema = tb.object({
  id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  agencyId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  sourceGroupId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  revision: tb.integer({ minimum: 1, maximum: 4294967295 }),
  supersedesSourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  title: tb.string({ maxLength: 500 }),
  canonicalUrl: tb
    .string({ maxLength: 4096, minLength: 1, format: 'uri', pattern: '^https?://' })
    .nullable(),
  providerFileId: tb.string({ maxLength: 191 }).nullable(),
  providerRevisionId: tb.string({ maxLength: 191 }).nullable(),
  sourceRole: tb.enum([
    'CANONICAL_RECORD',
    'PRIMARY_CORRESPONDENCE',
    'OPERATOR_INPUT',
    'DERIVED_DRAFT',
    'EXTERNAL_REFERENCE',
    'POLICY_REFERENCE',
  ]),
  accessState: tb.enum(['NOT_CHECKED', 'ACCESSIBLE_AT_CHECK', 'UNAVAILABLE_AT_CHECK']),
  contentSha256: tb.string({ maxLength: 64, minLength: 64, pattern: '^[0-9a-f]{64}$' }).nullable(),
  hashTarget: tb.enum(['RAW_FILE', 'EXTRACTED_TEXT', 'OTHER']).nullable(),
  reportedProvenance: tb.enum([
    'DOCUMENT_REVIEWED',
    'OPERATOR_REPORTED',
    'ANALYSIS',
    'MISSING',
    'CONFLICT',
  ]),
  rawProvenance: tb.string({ maxLength: 120 }).nullable(),
  scopeText: tb.string({ maxLength: 1000000 }),
  scopeBindings: tb
    .object({
      caseIds: tb
        .array(tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }), {
          minItems: 0,
          maxItems: 1000,
        })
        .optional(),
      legalSubjectIds: tb
        .array(tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }), {
          minItems: 0,
          maxItems: 1000,
        })
        .optional(),
      agencyIds: tb
        .array(tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }), {
          minItems: 0,
          maxItems: 1000,
        })
        .optional(),
      limitation: tb.string({ maxLength: 8000 }).optional(),
    })
    .nullable(),
  observedAt: tb.string({ maxLength: 40, format: 'date-time' }).nullable(),
  reviewedByLabel: tb.string({ maxLength: 255 }).nullable(),
  reviewedAt: tb.string({ maxLength: 40, format: 'date-time' }).nullable(),
  excerpt: tb.string({ maxLength: 1000000 }).nullable(),
  excerptLocator: tb.string({ maxLength: 500 }).nullable(),
  limitations: tb.string({ maxLength: 1000000 }).nullable(),
  createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
  createdById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
});
export type SourceReference = z.infer<typeof SourceReferenceSchema>;

export const CaseSourceSchema = tb.object({
  id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  caseId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  sourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  useRole: tb.string({ maxLength: 60 }),
  scopeNote: tb.string({ maxLength: 1000000 }),
  linkState: tb.enum(['LINKED', 'PAUSED', 'UNLINKED']),
  stateReason: tb.string({ maxLength: 1000000 }).nullable(),
  createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
  createdById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  updatedAt: tb.string({ maxLength: 40, format: 'date-time' }),
  updatedById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  rowVersion: tb.integer({ minimum: 1, maximum: 4294967295 }),
});
export type CaseSource = z.infer<typeof CaseSourceSchema>;

export const CaseFactSchema = tb.oneOf('factType', [
  tb.object({
    id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
    caseId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
    factGroupId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
    revision: tb.integer({ minimum: 1, maximum: 4294967295 }),
    supersedesFactId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
    factType: tb.literal('RIGHTS_BASIS'),
    scopeKind: tb.enum(['CASE', 'WORK', 'REPORTED_ITEM', 'USE']),
    caseWorkId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
    reportedItemId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
    mappingId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
    value: FactValue_RIGHTS_BASISSchema,
    provenance: tb.enum([
      'DOCUMENT_REVIEWED',
      'OPERATOR_REPORTED',
      'ANALYSIS',
      'MISSING',
      'CONFLICT',
    ]),
    rawProvenance: tb.string({ maxLength: 120 }).nullable(),
    resolutionState: tb.enum(['UNASSESSED', 'SUPPORTED_FOR_SCOPE', 'CONFLICT', 'WITHDRAWN']),
    assertedByLabel: tb.string({ maxLength: 255 }).nullable(),
    assertedAsOf: tb.string({ maxLength: 40, format: 'date-time' }).nullable(),
    scopeText: tb.string({ maxLength: 1000000 }),
    limitations: tb.string({ maxLength: 1000000 }).nullable(),
    changeReason: tb.string({ maxLength: 1000000 }),
    createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
    createdById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  }),
  tb.object({
    id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
    caseId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
    factGroupId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
    revision: tb.integer({ minimum: 1, maximum: 4294967295 }),
    supersedesFactId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
    factType: tb.literal('RIGHTS_SCOPE'),
    scopeKind: tb.enum(['CASE', 'WORK', 'REPORTED_ITEM', 'USE']),
    caseWorkId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
    reportedItemId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
    mappingId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
    value: FactValue_RIGHTS_SCOPESchema,
    provenance: tb.enum([
      'DOCUMENT_REVIEWED',
      'OPERATOR_REPORTED',
      'ANALYSIS',
      'MISSING',
      'CONFLICT',
    ]),
    rawProvenance: tb.string({ maxLength: 120 }).nullable(),
    resolutionState: tb.enum(['UNASSESSED', 'SUPPORTED_FOR_SCOPE', 'CONFLICT', 'WITHDRAWN']),
    assertedByLabel: tb.string({ maxLength: 255 }).nullable(),
    assertedAsOf: tb.string({ maxLength: 40, format: 'date-time' }).nullable(),
    scopeText: tb.string({ maxLength: 1000000 }),
    limitations: tb.string({ maxLength: 1000000 }).nullable(),
    changeReason: tb.string({ maxLength: 1000000 }),
    createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
    createdById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  }),
  tb.object({
    id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
    caseId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
    factGroupId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
    revision: tb.integer({ minimum: 1, maximum: 4294967295 }),
    supersedesFactId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
    factType: tb.literal('PERMISSION'),
    scopeKind: tb.enum(['CASE', 'WORK', 'REPORTED_ITEM', 'USE']),
    caseWorkId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
    reportedItemId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
    mappingId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
    value: FactValue_PERMISSIONSchema,
    provenance: tb.enum([
      'DOCUMENT_REVIEWED',
      'OPERATOR_REPORTED',
      'ANALYSIS',
      'MISSING',
      'CONFLICT',
    ]),
    rawProvenance: tb.string({ maxLength: 120 }).nullable(),
    resolutionState: tb.enum(['UNASSESSED', 'SUPPORTED_FOR_SCOPE', 'CONFLICT', 'WITHDRAWN']),
    assertedByLabel: tb.string({ maxLength: 255 }).nullable(),
    assertedAsOf: tb.string({ maxLength: 40, format: 'date-time' }).nullable(),
    scopeText: tb.string({ maxLength: 1000000 }),
    limitations: tb.string({ maxLength: 1000000 }).nullable(),
    changeReason: tb.string({ maxLength: 1000000 }),
    createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
    createdById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  }),
  tb.object({
    id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
    caseId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
    factGroupId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
    revision: tb.integer({ minimum: 1, maximum: 4294967295 }),
    supersedesFactId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
    factType: tb.literal('AV_COMPARISON'),
    scopeKind: tb.enum(['CASE', 'WORK', 'REPORTED_ITEM', 'USE']),
    caseWorkId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
    reportedItemId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
    mappingId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
    value: FactValue_AV_COMPARISONSchema,
    provenance: tb.enum([
      'DOCUMENT_REVIEWED',
      'OPERATOR_REPORTED',
      'ANALYSIS',
      'MISSING',
      'CONFLICT',
    ]),
    rawProvenance: tb.string({ maxLength: 120 }).nullable(),
    resolutionState: tb.enum(['UNASSESSED', 'SUPPORTED_FOR_SCOPE', 'CONFLICT', 'WITHDRAWN']),
    assertedByLabel: tb.string({ maxLength: 255 }).nullable(),
    assertedAsOf: tb.string({ maxLength: 40, format: 'date-time' }).nullable(),
    scopeText: tb.string({ maxLength: 1000000 }),
    limitations: tb.string({ maxLength: 1000000 }).nullable(),
    changeReason: tb.string({ maxLength: 1000000 }),
    createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
    createdById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  }),
  tb.object({
    id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
    caseId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
    factGroupId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
    revision: tb.integer({ minimum: 1, maximum: 4294967295 }),
    supersedesFactId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
    factType: tb.literal('EXCEPTION_REVIEW'),
    scopeKind: tb.enum(['CASE', 'WORK', 'REPORTED_ITEM', 'USE']),
    caseWorkId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
    reportedItemId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
    mappingId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
    value: FactValue_EXCEPTION_REVIEWSchema,
    provenance: tb.enum([
      'DOCUMENT_REVIEWED',
      'OPERATOR_REPORTED',
      'ANALYSIS',
      'MISSING',
      'CONFLICT',
    ]),
    rawProvenance: tb.string({ maxLength: 120 }).nullable(),
    resolutionState: tb.enum(['UNASSESSED', 'SUPPORTED_FOR_SCOPE', 'CONFLICT', 'WITHDRAWN']),
    assertedByLabel: tb.string({ maxLength: 255 }).nullable(),
    assertedAsOf: tb.string({ maxLength: 40, format: 'date-time' }).nullable(),
    scopeText: tb.string({ maxLength: 1000000 }),
    limitations: tb.string({ maxLength: 1000000 }).nullable(),
    changeReason: tb.string({ maxLength: 1000000 }),
    createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
    createdById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  }),
  tb.object({
    id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
    caseId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
    factGroupId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
    revision: tb.integer({ minimum: 1, maximum: 4294967295 }),
    supersedesFactId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
    factType: tb.literal('WORK_IDENTIFICATION'),
    scopeKind: tb.enum(['CASE', 'WORK', 'REPORTED_ITEM', 'USE']),
    caseWorkId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
    reportedItemId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
    mappingId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
    value: FactValue_WORK_IDENTIFICATIONSchema,
    provenance: tb.enum([
      'DOCUMENT_REVIEWED',
      'OPERATOR_REPORTED',
      'ANALYSIS',
      'MISSING',
      'CONFLICT',
    ]),
    rawProvenance: tb.string({ maxLength: 120 }).nullable(),
    resolutionState: tb.enum(['UNASSESSED', 'SUPPORTED_FOR_SCOPE', 'CONFLICT', 'WITHDRAWN']),
    assertedByLabel: tb.string({ maxLength: 255 }).nullable(),
    assertedAsOf: tb.string({ maxLength: 40, format: 'date-time' }).nullable(),
    scopeText: tb.string({ maxLength: 1000000 }),
    limitations: tb.string({ maxLength: 1000000 }).nullable(),
    changeReason: tb.string({ maxLength: 1000000 }),
    createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
    createdById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  }),
  tb.object({
    id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
    caseId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
    factGroupId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
    revision: tb.integer({ minimum: 1, maximum: 4294967295 }),
    supersedesFactId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
    factType: tb.literal('REPORTED_IDENTIFICATION'),
    scopeKind: tb.enum(['CASE', 'WORK', 'REPORTED_ITEM', 'USE']),
    caseWorkId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
    reportedItemId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
    mappingId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
    value: FactValue_REPORTED_IDENTIFICATIONSchema,
    provenance: tb.enum([
      'DOCUMENT_REVIEWED',
      'OPERATOR_REPORTED',
      'ANALYSIS',
      'MISSING',
      'CONFLICT',
    ]),
    rawProvenance: tb.string({ maxLength: 120 }).nullable(),
    resolutionState: tb.enum(['UNASSESSED', 'SUPPORTED_FOR_SCOPE', 'CONFLICT', 'WITHDRAWN']),
    assertedByLabel: tb.string({ maxLength: 255 }).nullable(),
    assertedAsOf: tb.string({ maxLength: 40, format: 'date-time' }).nullable(),
    scopeText: tb.string({ maxLength: 1000000 }),
    limitations: tb.string({ maxLength: 1000000 }).nullable(),
    changeReason: tb.string({ maxLength: 1000000 }),
    createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
    createdById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  }),
  tb.object({
    id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
    caseId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
    factGroupId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
    revision: tb.integer({ minimum: 1, maximum: 4294967295 }),
    supersedesFactId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
    factType: tb.literal('DUPLICATE_REVIEW'),
    scopeKind: tb.enum(['CASE', 'WORK', 'REPORTED_ITEM', 'USE']),
    caseWorkId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
    reportedItemId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
    mappingId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
    value: FactValue_DUPLICATE_REVIEWSchema,
    provenance: tb.enum([
      'DOCUMENT_REVIEWED',
      'OPERATOR_REPORTED',
      'ANALYSIS',
      'MISSING',
      'CONFLICT',
    ]),
    rawProvenance: tb.string({ maxLength: 120 }).nullable(),
    resolutionState: tb.enum(['UNASSESSED', 'SUPPORTED_FOR_SCOPE', 'CONFLICT', 'WITHDRAWN']),
    assertedByLabel: tb.string({ maxLength: 255 }).nullable(),
    assertedAsOf: tb.string({ maxLength: 40, format: 'date-time' }).nullable(),
    scopeText: tb.string({ maxLength: 1000000 }),
    limitations: tb.string({ maxLength: 1000000 }).nullable(),
    changeReason: tb.string({ maxLength: 1000000 }),
    createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
    createdById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  }),
  tb.object({
    id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
    caseId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
    factGroupId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
    revision: tb.integer({ minimum: 1, maximum: 4294967295 }),
    supersedesFactId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
    factType: tb.literal('AUTHORITY_CURRENTNESS'),
    scopeKind: tb.enum(['CASE', 'WORK', 'REPORTED_ITEM', 'USE']),
    caseWorkId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
    reportedItemId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
    mappingId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
    value: FactValue_AUTHORITY_CURRENTNESSSchema,
    provenance: tb.enum([
      'DOCUMENT_REVIEWED',
      'OPERATOR_REPORTED',
      'ANALYSIS',
      'MISSING',
      'CONFLICT',
    ]),
    rawProvenance: tb.string({ maxLength: 120 }).nullable(),
    resolutionState: tb.enum(['UNASSESSED', 'SUPPORTED_FOR_SCOPE', 'CONFLICT', 'WITHDRAWN']),
    assertedByLabel: tb.string({ maxLength: 255 }).nullable(),
    assertedAsOf: tb.string({ maxLength: 40, format: 'date-time' }).nullable(),
    scopeText: tb.string({ maxLength: 1000000 }),
    limitations: tb.string({ maxLength: 1000000 }).nullable(),
    changeReason: tb.string({ maxLength: 1000000 }),
    createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
    createdById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  }),
]);
export type CaseFact = z.infer<typeof CaseFactSchema>;

export const FactSourceSchema = tb.object({
  id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  factId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  caseSourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  supportRole: tb.string({ maxLength: 80 }),
  supportedAssertion: tb.string({ maxLength: 1000000 }),
  createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
  createdById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
});
export type FactSource = z.infer<typeof FactSourceSchema>;

export const CorrespondenceSchema = tb.object({
  id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  agencyId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  mailboxAddress: tb.string({ maxLength: 254, minLength: 3, format: 'email' }),
  direction: tb.enum(['INBOUND', 'OUTBOUND']),
  subject: tb.string({ maxLength: 998 }),
  messageId: tb.string({ maxLength: 998 }).nullable(),
  inReplyTo: tb.string({ maxLength: 998 }).nullable(),
  references: tb
    .array(tb.string({ maxLength: 998, minLength: 1 }), { minItems: 0, maxItems: 300 })
    .nullable(),
  sourceIdentityHash: tb.string({ maxLength: 64 }).nullable(),
  captureMode: tb.enum(['RAW_SOURCE', 'COPIED_FULL_TEXT', 'EXCERPT', 'OPERATOR_REPORTED']),
  bodyRole: tb.enum(['FULL_MESSAGE', 'AUTHORED_BODY', 'QUOTED_HISTORY', 'EXCERPT', 'UNKNOWN']),
  bodyText: tb.string({ maxLength: 1000000 }).nullable(),
  bodySha256: tb.string({ maxLength: 64, minLength: 64, pattern: '^[0-9a-f]{64}$' }).nullable(),
  rawSourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  attachmentsManifest: tb
    .array(AttachmentObservationSchema, { minItems: 0, maxItems: 100 })
    .nullable(),
  headerDateRaw: tb.string({ maxLength: 255 }).nullable(),
  occurredAt: tb.string({ maxLength: 40, format: 'date-time' }).nullable(),
  timestampPrecision: tb.string({ maxLength: 40 }),
  fromAddress: tb.string({ maxLength: 254, minLength: 3, format: 'email' }).nullable(),
  toAddress: tb.string({ maxLength: 254, minLength: 3, format: 'email' }).nullable(),
  replyToAddress: tb.string({ maxLength: 254, minLength: 3, format: 'email' }).nullable(),
  limitations: tb.string({ maxLength: 1000000 }).nullable(),
  createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
  createdById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
});
export type Correspondence = z.infer<typeof CorrespondenceSchema>;

export const CorrespondenceBindingSchema = tb.object({
  id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  caseId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  agencyId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  correspondenceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  reportedItemId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  eventType: tb.enum([
    'INITIAL_AS_SENT',
    'ACK',
    'NMI',
    'REPLY_AS_SENT',
    'SUPPLEMENT_AS_SENT',
    'CORRECTION_AS_SENT',
    'OUTCOME',
    'OTHER',
  ]),
  platformReference: tb.string({ maxLength: 191 }).nullable(),
  outcome: tb.enum(['REMOVED', 'REINSTATED', 'REJECTED', 'RETRACTED', 'OTHER']).nullable(),
  interpretation: tb.string({ maxLength: 1000000 }).nullable(),
  supersedesBindingId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
  createdById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
});
export type CorrespondenceBinding = z.infer<typeof CorrespondenceBindingSchema>;

export const NoticeCandidateSchema = tb.object({
  id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  caseId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  promptSnapshotId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  parentCandidateId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  version: tb.integer({ minimum: 1, maximum: 4294967295 }),
  taskType: tb.enum(['INITIAL', 'NMI_REPLY']),
  subject: tb.string({ maxLength: 998 }),
  envelopeJson: EnvelopeSchema,
  bodyText: tb.string({ maxLength: 1000000 }),
  bodySha256: tb.string({ maxLength: 64, minLength: 64, pattern: '^[0-9a-f]{64}$' }),
  artifactSha256: tb.string({ maxLength: 64, minLength: 64, pattern: '^[0-9a-f]{64}$' }),
  preparedDocuments: tb.array(DocumentPlanSchema, { minItems: 0, maxItems: 100 }),
  signatureState: tb.string({ maxLength: 40 }),
  authoringTool: tb.string({ maxLength: 100 }).nullable(),
  revisionReason: tb.string({ maxLength: 1000000 }).nullable(),
  supersededAt: tb.string({ maxLength: 40, format: 'date-time' }).nullable(),
  supersedeReason: tb.string({ maxLength: 1000000 }).nullable(),
  createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
  createdById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
});
export type NoticeCandidate = z.infer<typeof NoticeCandidateSchema>;

export const ValidationIssueSchema = tb.object({
  id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  runId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  ruleId: tb.string({ maxLength: 100 }),
  checkKind: tb.enum(['DETERMINISTIC', 'HEURISTIC']),
  severity: tb.enum(['BLOCKER', 'REVIEW_REQUIRED', 'WARNING', 'INFO']),
  fieldPath: tb.string({ maxLength: 500 }).nullable(),
  message: tb.string({ maxLength: 1000000 }),
  details: LooseObjectSchema.nullable(),
  createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
  createdById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
});
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;

export const CandidateAssessmentSchema = tb.object({
  id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  candidateId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  caseId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  gate: tb.enum(['G1', 'G2', 'G3', 'G4', 'G5', 'G6']),
  result: tb.enum(['PASS', 'HOLD', 'BLOCKED', 'MISSING', 'CONFLICT']),
  artifactSha256: tb.string({ maxLength: 64, minLength: 64, pattern: '^[0-9a-f]{64}$' }),
  dependencyDigest: tb.string({ maxLength: 64, minLength: 64, pattern: '^[0-9a-f]{64}$' }),
  rulesetVersion: tb.string({ maxLength: 80 }),
  scopeState: tb.enum(['RECORDED_NOT_ADOPTED', 'SCOPE_CONFIRMED_FOR_CANDIDATE']),
  performerKind: tb.enum(['HUMAN', 'AI_ASSISTED', 'DOCUMENTED_EXTERNAL_REVIEW']),
  performerLabel: tb.string({ maxLength: 255 }),
  assessedAt: tb.string({ maxLength: 40, format: 'date-time' }).nullable(),
  provenance: tb.enum([
    'DOCUMENT_REVIEWED',
    'OPERATOR_REPORTED',
    'ANALYSIS',
    'MISSING',
    'CONFLICT',
  ]),
  rationale: tb.string({ maxLength: 1000000 }),
  scopeText: tb.string({ maxLength: 1000000 }),
  limitations: tb.string({ maxLength: 1000000 }).nullable(),
  askDispositions: tb.array(AskDispositionSchema, { minItems: 0, maxItems: 100 }).nullable(),
  supersedesAssessmentId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
  createdById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
});
export type CandidateAssessment = z.infer<typeof CandidateAssessmentSchema>;

export const AssessmentSourceSchema = tb.object({
  id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  assessmentId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  caseSourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  supportedConclusion: tb.string({ maxLength: 1000000 }),
  createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
  createdById: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
});
export type AssessmentSource = z.infer<typeof AssessmentSourceSchema>;

export const AuditEventSchema = tb.object({
  id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  actorUserId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  requestId: tb.string({ maxLength: 100 }),
  action: tb.string({ maxLength: 120 }),
  entityType: tb.string({ maxLength: 100 }),
  entityId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  beforeRedacted: LooseObjectSchema.nullable(),
  afterRedacted: LooseObjectSchema.nullable(),
  reason: tb.string({ maxLength: 1000000 }).nullable(),
  sourceIds: tb
    .array(tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }), {
      minItems: 0,
      maxItems: 1000,
    })
    .nullable(),
  createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

export const IdempotencyRecordSchema = tb.object({
  id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  actorUserId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  operationId: tb.string({ maxLength: 100 }),
  idempotencyKey: tb.string({ maxLength: 100 }),
  state: tb.enum(['IN_PROGRESS', 'COMPLETED']),
  responseStatus: tb.integer({ minimum: 0, maximum: 4294967295 }).nullable(),
  resourceType: tb.string({ maxLength: 100 }).nullable(),
  resourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  expiresAt: tb.string({ maxLength: 40, format: 'date-time' }),
  createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
});
export type IdempotencyRecord = z.infer<typeof IdempotencyRecordSchema>;

export const CreateAgencySchema = tb.object({
  displayName: tb.string({ maxLength: 200, minLength: 1 }),
  legalName: tb.string({ maxLength: 255 }).nullable().optional(),
  organizationType: tb.string({ maxLength: 50 }).nullable().optional(),
  jurisdictionCountry: tb.string({ maxLength: 2 }).nullable().optional(),
  registrationAuthority: tb.string({ maxLength: 200 }).nullable().optional(),
  registrationNumber: tb.string({ maxLength: 100 }).nullable().optional(),
  websiteUrl: tb
    .string({ maxLength: 2048, minLength: 1, format: 'uri', pattern: '^https?://' })
    .nullable()
    .optional(),
  copyrightEmail: tb
    .string({ maxLength: 254, minLength: 3, format: 'email' })
    .nullable()
    .optional(),
  verificationEmail: tb
    .string({ maxLength: 254, minLength: 3, format: 'email' })
    .nullable()
    .optional(),
  postalAddress: PostalAddressSchema.nullable().optional(),
  phone: tb.string({ maxLength: 80 }).nullable().optional(),
  driveRootUrl: tb
    .string({ maxLength: 2048, minLength: 1, format: 'uri', pattern: '^https?://' })
    .nullable()
    .optional(),
  masterUrl: tb
    .string({ maxLength: 2048, minLength: 1, format: 'uri', pattern: '^https?://' })
    .nullable()
    .optional(),
  startHereUrl: tb
    .string({ maxLength: 2048, minLength: 1, format: 'uri', pattern: '^https?://' })
    .nullable()
    .optional(),
  fieldAttributions: tb
    .array(FieldAttributionSchema, { minItems: 0, maxItems: 100 })
    .nullable()
    .optional(),
  notes: tb.string({ maxLength: 1000000 }).nullable().optional(),
});
export type CreateAgency = z.infer<typeof CreateAgencySchema>;

export const PatchAgencySchema = tb.object(
  {
    displayName: tb.string({ maxLength: 200, minLength: 1 }).optional(),
    legalName: tb.string({ maxLength: 255 }).nullable().optional(),
    organizationType: tb.string({ maxLength: 50 }).nullable().optional(),
    jurisdictionCountry: tb.string({ maxLength: 2 }).nullable().optional(),
    registrationAuthority: tb.string({ maxLength: 200 }).nullable().optional(),
    registrationNumber: tb.string({ maxLength: 100 }).nullable().optional(),
    websiteUrl: tb
      .string({ maxLength: 2048, minLength: 1, format: 'uri', pattern: '^https?://' })
      .nullable()
      .optional(),
    copyrightEmail: tb
      .string({ maxLength: 254, minLength: 3, format: 'email' })
      .nullable()
      .optional(),
    verificationEmail: tb
      .string({ maxLength: 254, minLength: 3, format: 'email' })
      .nullable()
      .optional(),
    postalAddress: PostalAddressSchema.nullable().optional(),
    phone: tb.string({ maxLength: 80 }).nullable().optional(),
    driveRootUrl: tb
      .string({ maxLength: 2048, minLength: 1, format: 'uri', pattern: '^https?://' })
      .nullable()
      .optional(),
    masterUrl: tb
      .string({ maxLength: 2048, minLength: 1, format: 'uri', pattern: '^https?://' })
      .nullable()
      .optional(),
    startHereUrl: tb
      .string({ maxLength: 2048, minLength: 1, format: 'uri', pattern: '^https?://' })
      .nullable()
      .optional(),
    fieldAttributions: tb
      .array(FieldAttributionSchema, { minItems: 0, maxItems: 100 })
      .nullable()
      .optional(),
    notes: tb.string({ maxLength: 1000000 }).nullable().optional(),
  },
  { minProperties: 1 },
);
export type PatchAgency = z.infer<typeof PatchAgencySchema>;

export const CreateOwnerSchema = tb.object({
  displayName: tb.string({ maxLength: 200, minLength: 1 }),
  aliases: tb
    .array(tb.string({ maxLength: 255, minLength: 1 }), { minItems: 0, maxItems: 100 })
    .nullable()
    .optional(),
  contactName: tb.string({ maxLength: 200 }).nullable().optional(),
  contactEmail: tb.string({ maxLength: 254, minLength: 3, format: 'email' }).nullable().optional(),
  sourceChannels: tb
    .array(SourceChannelSchema, { minItems: 0, maxItems: 100 })
    .nullable()
    .optional(),
  websiteUrl: tb
    .string({ maxLength: 2048, minLength: 1, format: 'uri', pattern: '^https?://' })
    .nullable()
    .optional(),
  preferredLanguage: tb.string({ maxLength: 20 }).nullable().optional(),
  driveFolderUrl: tb
    .string({ maxLength: 2048, minLength: 1, format: 'uri', pattern: '^https?://' })
    .nullable()
    .optional(),
  notes: tb.string({ maxLength: 1000000 }).nullable().optional(),
});
export type CreateOwner = z.infer<typeof CreateOwnerSchema>;

export const PatchOwnerSchema = tb.object(
  {
    displayName: tb.string({ maxLength: 200, minLength: 1 }).optional(),
    aliases: tb
      .array(tb.string({ maxLength: 255, minLength: 1 }), { minItems: 0, maxItems: 100 })
      .nullable()
      .optional(),
    contactName: tb.string({ maxLength: 200 }).nullable().optional(),
    contactEmail: tb
      .string({ maxLength: 254, minLength: 3, format: 'email' })
      .nullable()
      .optional(),
    sourceChannels: tb
      .array(SourceChannelSchema, { minItems: 0, maxItems: 100 })
      .nullable()
      .optional(),
    websiteUrl: tb
      .string({ maxLength: 2048, minLength: 1, format: 'uri', pattern: '^https?://' })
      .nullable()
      .optional(),
    preferredLanguage: tb.string({ maxLength: 20 }).nullable().optional(),
    driveFolderUrl: tb
      .string({ maxLength: 2048, minLength: 1, format: 'uri', pattern: '^https?://' })
      .nullable()
      .optional(),
    notes: tb.string({ maxLength: 1000000 }).nullable().optional(),
  },
  { minProperties: 1 },
);
export type PatchOwner = z.infer<typeof PatchOwnerSchema>;

export const CreateLegalSubjectSchema = tb.object({
  subjectType: tb.enum(['INDIVIDUAL', 'LEGAL_ENTITY', 'OTHER']),
  legalName: tb.string({ maxLength: 255, minLength: 1 }),
  aliases: tb
    .array(tb.string({ maxLength: 255, minLength: 1 }), { minItems: 0, maxItems: 100 })
    .nullable()
    .optional(),
  jurisdictionCountry: tb.string({ maxLength: 2 }).nullable().optional(),
  legalForm: tb.string({ maxLength: 80 }).nullable().optional(),
  registrationAuthority: tb.string({ maxLength: 200 }).nullable().optional(),
  registrationNumber: tb.string({ maxLength: 100 }).nullable().optional(),
  contactEmail: tb.string({ maxLength: 254, minLength: 3, format: 'email' }).nullable().optional(),
  postalAddress: PostalAddressSchema.nullable().optional(),
  fieldAttributions: tb
    .array(FieldAttributionSchema, { minItems: 0, maxItems: 100 })
    .nullable()
    .optional(),
  notes: tb.string({ maxLength: 1000000 }).nullable().optional(),
});
export type CreateLegalSubject = z.infer<typeof CreateLegalSubjectSchema>;

export const PatchLegalSubjectSchema = tb.object(
  {
    legalName: tb.string({ maxLength: 255, minLength: 1 }).optional(),
    aliases: tb
      .array(tb.string({ maxLength: 255, minLength: 1 }), { minItems: 0, maxItems: 100 })
      .nullable()
      .optional(),
    jurisdictionCountry: tb.string({ maxLength: 2 }).nullable().optional(),
    legalForm: tb.string({ maxLength: 80 }).nullable().optional(),
    registrationAuthority: tb.string({ maxLength: 200 }).nullable().optional(),
    registrationNumber: tb.string({ maxLength: 100 }).nullable().optional(),
    contactEmail: tb
      .string({ maxLength: 254, minLength: 3, format: 'email' })
      .nullable()
      .optional(),
    postalAddress: PostalAddressSchema.nullable().optional(),
    fieldAttributions: tb
      .array(FieldAttributionSchema, { minItems: 0, maxItems: 100 })
      .nullable()
      .optional(),
    notes: tb.string({ maxLength: 1000000 }).nullable().optional(),
  },
  { minProperties: 1 },
);
export type PatchLegalSubject = z.infer<typeof PatchLegalSubjectSchema>;

export const CreateSignerSchema = tb.object({
  agencyId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  fullLegalName: tb.string({ maxLength: 255, minLength: 1 }),
  title: tb.string({ maxLength: 200 }).nullable().optional(),
  contactEmail: tb.string({ maxLength: 254, minLength: 3, format: 'email' }).nullable().optional(),
  identitySourceId: tb
    .string({ maxLength: 36, minLength: 36, format: 'uuid' })
    .nullable()
    .optional(),
  delegationSourceId: tb
    .string({ maxLength: 36, minLength: 36, format: 'uuid' })
    .nullable()
    .optional(),
  notes: tb.string({ maxLength: 1000000 }).nullable().optional(),
});
export type CreateSigner = z.infer<typeof CreateSignerSchema>;

export const PatchSignerSchema = tb.object(
  {
    fullLegalName: tb.string({ maxLength: 255, minLength: 1 }).optional(),
    title: tb.string({ maxLength: 200 }).nullable().optional(),
    contactEmail: tb
      .string({ maxLength: 254, minLength: 3, format: 'email' })
      .nullable()
      .optional(),
    identitySourceId: tb
      .string({ maxLength: 36, minLength: 36, format: 'uuid' })
      .nullable()
      .optional(),
    delegationSourceId: tb
      .string({ maxLength: 36, minLength: 36, format: 'uuid' })
      .nullable()
      .optional(),
    notes: tb.string({ maxLength: 1000000 }).nullable().optional(),
  },
  { minProperties: 1 },
);
export type PatchSigner = z.infer<typeof PatchSignerSchema>;

export const CreateMandateSchema = tb.object({
  agencyId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  label: tb.string({ maxLength: 255, minLength: 1 }),
  externalReference: tb.string({ maxLength: 191 }).nullable().optional(),
  description: tb.string({ maxLength: 1000000 }).nullable().optional(),
  notes: tb.string({ maxLength: 1000000 }).nullable().optional(),
});
export type CreateMandate = z.infer<typeof CreateMandateSchema>;

export const PatchMandateSchema = tb.object(
  {
    label: tb.string({ maxLength: 255, minLength: 1 }).optional(),
    externalReference: tb.string({ maxLength: 191 }).nullable().optional(),
    description: tb.string({ maxLength: 1000000 }).nullable().optional(),
    notes: tb.string({ maxLength: 1000000 }).nullable().optional(),
  },
  { minProperties: 1 },
);
export type PatchMandate = z.infer<typeof PatchMandateSchema>;

export const CreateRouteSchema = tb.object({
  agencyId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  ownerSubjectId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  platform: tb.enum(['YOUTUBE']).optional(),
  defaultSignerId: tb
    .string({ maxLength: 36, minLength: 36, format: 'uuid' })
    .nullable()
    .optional(),
  preferredCoverageId: tb
    .string({ maxLength: 36, minLength: 36, format: 'uuid' })
    .nullable()
    .optional(),
  casePrefixHint: tb.string({ maxLength: 40 }).nullable().optional(),
  notes: tb.string({ maxLength: 1000000 }).nullable().optional(),
});
export type CreateRoute = z.infer<typeof CreateRouteSchema>;

export const PatchRouteSchema = tb.object(
  {
    defaultSignerId: tb
      .string({ maxLength: 36, minLength: 36, format: 'uuid' })
      .nullable()
      .optional(),
    preferredCoverageId: tb
      .string({ maxLength: 36, minLength: 36, format: 'uuid' })
      .nullable()
      .optional(),
    casePrefixHint: tb.string({ maxLength: 40 }).nullable().optional(),
    notes: tb.string({ maxLength: 1000000 }).nullable().optional(),
  },
  { minProperties: 1 },
);
export type PatchRoute = z.infer<typeof PatchRouteSchema>;

export const LinkOwnerSubjectSchema = tb.object({
  legalSubjectId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  relationshipLabel: tb.string({ maxLength: 200 }).nullable().optional(),
  sourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
});
export type LinkOwnerSubject = z.infer<typeof LinkOwnerSubjectSchema>;

export const ArchiveRequestSchema = tb.object({
  reason: tb.string({ maxLength: 2000, minLength: 1 }),
});
export type ArchiveRequest = z.infer<typeof ArchiveRequestSchema>;

export const LinkStateRequestSchema = tb.object({
  state: tb.enum(['LINKED', 'PAUSED', 'UNLINKED']),
  reason: tb.string({ maxLength: 2000, minLength: 1 }),
});
export type LinkStateRequest = z.infer<typeof LinkStateRequestSchema>;

export const RecordStateRequestSchema = tb.object({
  state: tb.enum(['DRAFT', 'ACTIVE']),
  reason: tb.string({ maxLength: 2000, minLength: 1 }),
});
export type RecordStateRequest = z.infer<typeof RecordStateRequestSchema>;

export const SignerStateRequestSchema = tb.object({
  state: tb.enum(['DRAFT', 'AVAILABLE', 'PAUSED', 'ENDED']),
  reason: tb.string({ maxLength: 2000, minLength: 1 }),
});
export type SignerStateRequest = z.infer<typeof SignerStateRequestSchema>;

export const CanonicalBindingRequestSchema = tb.object({
  canonicalCode: tb.string({ maxLength: 100, minLength: 1 }),
  sourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  reason: tb.string({ maxLength: 2000, minLength: 1 }),
});
export type CanonicalBindingRequest = z.infer<typeof CanonicalBindingRequestSchema>;

export const CreateMandateVersionSchema = tb.object({
  changeKind: tb.enum([
    'NEW_AUTHORIZATION',
    'AMENDMENT',
    'DOCUMENT_CAPTURE',
    'METADATA_CORRECTION',
  ]),
  predecessorId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
  primarySourceId: tb
    .string({ maxLength: 36, minLength: 36, format: 'uuid' })
    .nullable()
    .optional(),
  additionalSourceRefs: tb
    .array(SourceLinkSchema, { minItems: 0, maxItems: 100 })
    .nullable()
    .optional(),
  documentState: tb.enum(['MISSING', 'DRAFT', 'SIGNED_APPEARING', 'UNKNOWN']).optional(),
  sourceReviewState: tb.enum(['UNREVIEWED', 'REVIEWED_WITH_LIMITS', 'CONFLICT']).optional(),
  signedDatesRaw: tb
    .array(
      tb.object({
        subjectLabel: tb.string({ maxLength: 255, minLength: 1 }),
        dateRaw: tb.string({ maxLength: 100, minLength: 1 }),
        sourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
      }),
      { minItems: 0, maxItems: 50 },
    )
    .nullable()
    .optional(),
  validityModel: tb.enum(['UNKNOWN', 'FIXED_TERM', 'UNTIL_TERMINATED']).optional(),
  effectiveOn: tb.string({ maxLength: 10, minLength: 10, format: 'date' }).nullable().optional(),
  expiresOn: tb.string({ maxLength: 10, minLength: 10, format: 'date' }).nullable().optional(),
  validityNotes: tb.string({ maxLength: 1000000 }).nullable().optional(),
  changeReason: tb.string({ maxLength: 1000000, minLength: 1 }),
});
export type CreateMandateVersion = z.infer<typeof CreateMandateVersionSchema>;

export const PatchMandateVersionSchema = tb.object(
  {
    primarySourceId: tb
      .string({ maxLength: 36, minLength: 36, format: 'uuid' })
      .nullable()
      .optional(),
    additionalSourceRefs: tb
      .array(SourceLinkSchema, { minItems: 0, maxItems: 100 })
      .nullable()
      .optional(),
    documentState: tb.enum(['MISSING', 'DRAFT', 'SIGNED_APPEARING', 'UNKNOWN']).optional(),
    sourceReviewState: tb.enum(['UNREVIEWED', 'REVIEWED_WITH_LIMITS', 'CONFLICT']).optional(),
    signedDatesRaw: tb
      .array(
        tb.object({
          subjectLabel: tb.string({ maxLength: 255, minLength: 1 }),
          dateRaw: tb.string({ maxLength: 100, minLength: 1 }),
          sourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
        }),
        { minItems: 0, maxItems: 50 },
      )
      .nullable()
      .optional(),
    validityModel: tb.enum(['UNKNOWN', 'FIXED_TERM', 'UNTIL_TERMINATED']).optional(),
    effectiveOn: tb.string({ maxLength: 10, minLength: 10, format: 'date' }).nullable().optional(),
    expiresOn: tb.string({ maxLength: 10, minLength: 10, format: 'date' }).nullable().optional(),
    validityNotes: tb.string({ maxLength: 1000000 }).nullable().optional(),
    changeReason: tb.string({ maxLength: 1000000, minLength: 1 }).optional(),
  },
  { minProperties: 1 },
);
export type PatchMandateVersion = z.infer<typeof PatchMandateVersionSchema>;

export const CreateCoverageSchema = tb.object({
  routeId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  coverageLabel: tb.string({ maxLength: 191, minLength: 1 }),
  coveredWorksScope: tb.string({ maxLength: 1000000 }).nullable().optional(),
  territorialScope: tb.string({ maxLength: 1000000 }).nullable().optional(),
  actionScope: tb
    .array(
      tb.enum([
        'PREPARE_NOTICE',
        'SIGN_NOTICE',
        'SUBMIT_NOTICE',
        'SUPPLEMENT',
        'CORRECTION',
        'ADMINISTRATIVE_COUNTERNOTICE',
      ]),
      { minItems: 0, maxItems: 10 },
    )
    .nullable()
    .optional(),
  exclusions: tb.string({ maxLength: 1000000 }).nullable().optional(),
  conditions: tb.string({ maxLength: 1000000 }).nullable().optional(),
  exclusivity: tb.enum(['UNKNOWN', 'EXCLUSIVE', 'NON_EXCLUSIVE']).optional(),
  effectiveOn: tb.string({ maxLength: 10, minLength: 10, format: 'date' }).nullable().optional(),
  expiresOn: tb.string({ maxLength: 10, minLength: 10, format: 'date' }).nullable().optional(),
  basisSourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
  predecessorCoverageId: tb
    .string({ maxLength: 36, minLength: 36, format: 'uuid' })
    .nullable()
    .optional(),
});
export type CreateCoverage = z.infer<typeof CreateCoverageSchema>;

export const PatchCoverageSchema = tb.object(
  {
    coverageLabel: tb.string({ maxLength: 191, minLength: 1 }).optional(),
    coveredWorksScope: tb.string({ maxLength: 1000000 }).nullable().optional(),
    territorialScope: tb.string({ maxLength: 1000000 }).nullable().optional(),
    actionScope: tb
      .array(
        tb.enum([
          'PREPARE_NOTICE',
          'SIGN_NOTICE',
          'SUBMIT_NOTICE',
          'SUPPLEMENT',
          'CORRECTION',
          'ADMINISTRATIVE_COUNTERNOTICE',
        ]),
        { minItems: 0, maxItems: 10 },
      )
      .nullable()
      .optional(),
    exclusions: tb.string({ maxLength: 1000000 }).nullable().optional(),
    conditions: tb.string({ maxLength: 1000000 }).nullable().optional(),
    exclusivity: tb.enum(['UNKNOWN', 'EXCLUSIVE', 'NON_EXCLUSIVE']).optional(),
    effectiveOn: tb.string({ maxLength: 10, minLength: 10, format: 'date' }).nullable().optional(),
    expiresOn: tb.string({ maxLength: 10, minLength: 10, format: 'date' }).nullable().optional(),
    basisSourceId: tb
      .string({ maxLength: 36, minLength: 36, format: 'uuid' })
      .nullable()
      .optional(),
  },
  { minProperties: 1 },
);
export type PatchCoverage = z.infer<typeof PatchCoverageSchema>;

export const CreateCoverageSignerSchema = tb.object({
  signerId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  capacity: tb.string({ maxLength: 120, minLength: 1 }),
  actionScope: tb
    .array(
      tb.enum([
        'PREPARE_NOTICE',
        'SIGN_NOTICE',
        'SUBMIT_NOTICE',
        'SUPPLEMENT',
        'CORRECTION',
        'ADMINISTRATIVE_COUNTERNOTICE',
      ]),
      { minItems: 0, maxItems: 10 },
    )
    .nullable()
    .optional(),
  sourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
  effectiveOn: tb.string({ maxLength: 10, minLength: 10, format: 'date' }).nullable().optional(),
  endsOn: tb.string({ maxLength: 10, minLength: 10, format: 'date' }).nullable().optional(),
  limitations: tb.string({ maxLength: 1000000 }).nullable().optional(),
});
export type CreateCoverageSigner = z.infer<typeof CreateCoverageSignerSchema>;

export const CreateAuthorityEventSchema = tb.object({
  coverageId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
  eventType: tb.enum([
    'CURRENTNESS_RECORDED',
    'REVOCATION',
    'TERMINATION',
    'SUPERSESSION',
    'RESIGNATION',
    'CORRECTION',
  ]),
  sourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  provenance: tb.enum([
    'DOCUMENT_REVIEWED',
    'OPERATOR_REPORTED',
    'ANALYSIS',
    'MISSING',
    'CONFLICT',
  ]),
  effectiveOn: tb.string({ maxLength: 10, minLength: 10, format: 'date' }).nullable().optional(),
  effectiveAt: tb.string({ maxLength: 40, format: 'date-time' }).nullable().optional(),
  rawEffectiveText: tb.string({ maxLength: 500 }).nullable().optional(),
  scopeText: tb.string({ maxLength: 1000000, minLength: 1 }),
  supersedesEventId: tb
    .string({ maxLength: 36, minLength: 36, format: 'uuid' })
    .nullable()
    .optional(),
  interpretation: tb.string({ maxLength: 1000000, minLength: 1 }),
});
export type CreateAuthorityEvent = z.infer<typeof CreateAuthorityEventSchema>;

export const CreateCaseSchema = tb.object({
  agencyId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  platform: tb.enum(['YOUTUBE']).optional(),
  intakeLabel: tb.string({ maxLength: 255, minLength: 1 }),
  ownerHintId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
  routeId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
  caseClass: tb
    .enum(['WORKING_INTAKE', 'CURRENT_OPERATION', 'RECOVERED_HISTORY', 'EXTERNAL_REFERENCE'])
    .optional(),
  notes: tb.string({ maxLength: 1000000 }).nullable().optional(),
});
export type CreateCase = z.infer<typeof CreateCaseSchema>;

export const PatchCaseSchema = tb.object(
  {
    intakeLabel: tb.string({ maxLength: 255, minLength: 1 }).optional(),
    ownerHintId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
    packetSourceId: tb
      .string({ maxLength: 36, minLength: 36, format: 'uuid' })
      .nullable()
      .optional(),
    driveFolderUrl: tb
      .string({ maxLength: 2048, minLength: 1, format: 'uri', pattern: '^https?://' })
      .nullable()
      .optional(),
    notes: tb.string({ maxLength: 1000000 }).nullable().optional(),
  },
  { minProperties: 1 },
);
export type PatchCase = z.infer<typeof PatchCaseSchema>;

export const BindCaseRouteSchema = tb.object({
  routeId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  reason: tb.string({ maxLength: 2000, minLength: 1 }),
});
export type BindCaseRoute = z.infer<typeof BindCaseRouteSchema>;

export const CaseWorkflowRequestSchema = tb.object({
  state: tb.enum([
    'INTAKE',
    'PREPARING',
    'DRAFTING',
    'AWAITING_HUMAN',
    'AWAITING_PLATFORM',
    'CLOSED',
  ]),
  reason: tb.string({ maxLength: 2000, minLength: 1 }),
});
export type CaseWorkflowRequest = z.infer<typeof CaseWorkflowRequestSchema>;

export const SelectAuthoritySchema = tb.object({
  routeId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  signerId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  taskType: tb.enum(['INITIAL', 'NMI_REPLY']),
  intendedFromEmail: tb.string({ maxLength: 254, minLength: 3, format: 'email' }),
  basisSourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
  selectionNote: tb.string({ maxLength: 2000, minLength: 1 }),
  coverages: tb.array(SelectedCoverageSchema, { minItems: 1, maxItems: 20 }),
});
export type SelectAuthority = z.infer<typeof SelectAuthoritySchema>;

export const CreateReportedItemSchema = tb.object({
  rawUrl: tb.string({ maxLength: 4096, minLength: 1, format: 'uri', pattern: '^https?://' }),
  displayTitle: tb.string({ maxLength: 500 }).nullable().optional(),
  observedAt: tb.string({ maxLength: 40, format: 'date-time' }).nullable().optional(),
});
export type CreateReportedItem = z.infer<typeof CreateReportedItemSchema>;

export const PatchReportedItemSchema = tb.object(
  {
    displayTitle: tb.string({ maxLength: 500 }).nullable().optional(),
    observedAt: tb.string({ maxLength: 40, format: 'date-time' }).nullable().optional(),
  },
  { minProperties: 1 },
);
export type PatchReportedItem = z.infer<typeof PatchReportedItemSchema>;

export const CreateCaseWorkSchema = tb.object({
  title: tb.string({ maxLength: 500, minLength: 1 }),
  sourceUrl: tb
    .string({ maxLength: 4096, minLength: 1, format: 'uri', pattern: '^https?://' })
    .nullable()
    .optional(),
  externalWorkId: tb.string({ maxLength: 191 }).nullable().optional(),
  workType: tb.string({ maxLength: 100 }).nullable().optional(),
  notes: tb.string({ maxLength: 1000000 }).nullable().optional(),
});
export type CreateCaseWork = z.infer<typeof CreateCaseWorkSchema>;

export const PatchCaseWorkSchema = tb.object(
  {
    title: tb.string({ maxLength: 500, minLength: 1 }).optional(),
    sourceUrl: tb
      .string({ maxLength: 4096, minLength: 1, format: 'uri', pattern: '^https?://' })
      .nullable()
      .optional(),
    externalWorkId: tb.string({ maxLength: 191 }).nullable().optional(),
    workType: tb.string({ maxLength: 100 }).nullable().optional(),
    notes: tb.string({ maxLength: 1000000 }).nullable().optional(),
  },
  { minProperties: 1 },
);
export type PatchCaseWork = z.infer<typeof PatchCaseWorkSchema>;

export const CreateUseMappingSchema = tb.object({
  caseWorkId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  reportedItemId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  occurrence: tb.integer({ minimum: 1, maximum: 4294967295 }),
  sourceStartMs: tb
    .string({
      maxLength: 16,
      minLength: 1,
      pattern: '^(0|[1-9][0-9]{0,15})$',
      description:
        'Unsigned milliseconds as decimal string, <= 9007199254740991; server maps to BigInt.',
    })
    .nullable()
    .optional(),
  sourceEndMs: tb
    .string({
      maxLength: 16,
      minLength: 1,
      pattern: '^(0|[1-9][0-9]{0,15})$',
      description:
        'Unsigned milliseconds as decimal string, <= 9007199254740991; server maps to BigInt.',
    })
    .nullable()
    .optional(),
  reportedStartMs: tb
    .string({
      maxLength: 16,
      minLength: 1,
      pattern: '^(0|[1-9][0-9]{0,15})$',
      description:
        'Unsigned milliseconds as decimal string, <= 9007199254740991; server maps to BigInt.',
    })
    .nullable()
    .optional(),
  reportedEndMs: tb
    .string({
      maxLength: 16,
      minLength: 1,
      pattern: '^(0|[1-9][0-9]{0,15})$',
      description:
        'Unsigned milliseconds as decimal string, <= 9007199254740991; server maps to BigInt.',
    })
    .nullable()
    .optional(),
  rawTimecodes: RawTimecodesSchema.nullable().optional(),
  boundaryConvention: tb.string({ maxLength: 40, minLength: 1 }).optional(),
  provenance: tb
    .enum(['DOCUMENT_REVIEWED', 'OPERATOR_REPORTED', 'ANALYSIS', 'MISSING', 'CONFLICT'])
    .optional(),
  basisSourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
  limitations: tb.string({ maxLength: 1000000 }).nullable().optional(),
});
export type CreateUseMapping = z.infer<typeof CreateUseMappingSchema>;

export const PatchUseMappingSchema = tb.object(
  {
    sourceStartMs: tb
      .string({
        maxLength: 16,
        minLength: 1,
        pattern: '^(0|[1-9][0-9]{0,15})$',
        description:
          'Unsigned milliseconds as decimal string, <= 9007199254740991; server maps to BigInt.',
      })
      .nullable()
      .optional(),
    sourceEndMs: tb
      .string({
        maxLength: 16,
        minLength: 1,
        pattern: '^(0|[1-9][0-9]{0,15})$',
        description:
          'Unsigned milliseconds as decimal string, <= 9007199254740991; server maps to BigInt.',
      })
      .nullable()
      .optional(),
    reportedStartMs: tb
      .string({
        maxLength: 16,
        minLength: 1,
        pattern: '^(0|[1-9][0-9]{0,15})$',
        description:
          'Unsigned milliseconds as decimal string, <= 9007199254740991; server maps to BigInt.',
      })
      .nullable()
      .optional(),
    reportedEndMs: tb
      .string({
        maxLength: 16,
        minLength: 1,
        pattern: '^(0|[1-9][0-9]{0,15})$',
        description:
          'Unsigned milliseconds as decimal string, <= 9007199254740991; server maps to BigInt.',
      })
      .nullable()
      .optional(),
    rawTimecodes: RawTimecodesSchema.nullable().optional(),
    boundaryConvention: tb.string({ maxLength: 40, minLength: 1 }).optional(),
    provenance: tb
      .enum(['DOCUMENT_REVIEWED', 'OPERATOR_REPORTED', 'ANALYSIS', 'MISSING', 'CONFLICT'])
      .optional(),
    basisSourceId: tb
      .string({ maxLength: 36, minLength: 36, format: 'uuid' })
      .nullable()
      .optional(),
    limitations: tb.string({ maxLength: 1000000 }).nullable().optional(),
  },
  { minProperties: 1 },
);
export type PatchUseMapping = z.infer<typeof PatchUseMappingSchema>;

export const CreateSourceSchema = tb.object({
  agencyId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
  title: tb.string({ maxLength: 500, minLength: 1 }),
  canonicalUrl: tb
    .string({ maxLength: 4096, minLength: 1, format: 'uri', pattern: '^https?://' })
    .nullable()
    .optional(),
  providerFileId: tb.string({ maxLength: 191 }).nullable().optional(),
  providerRevisionId: tb.string({ maxLength: 191 }).nullable().optional(),
  sourceRole: tb.enum([
    'CANONICAL_RECORD',
    'PRIMARY_CORRESPONDENCE',
    'OPERATOR_INPUT',
    'DERIVED_DRAFT',
    'EXTERNAL_REFERENCE',
    'POLICY_REFERENCE',
  ]),
  accessState: tb.enum(['NOT_CHECKED', 'ACCESSIBLE_AT_CHECK', 'UNAVAILABLE_AT_CHECK']).optional(),
  contentSha256: tb
    .string({ maxLength: 64, minLength: 64, pattern: '^[0-9a-f]{64}$' })
    .nullable()
    .optional(),
  hashTarget: tb.enum(['RAW_FILE', 'EXTRACTED_TEXT', 'OTHER']).nullable().optional(),
  reportedProvenance: tb
    .enum(['DOCUMENT_REVIEWED', 'OPERATOR_REPORTED', 'ANALYSIS', 'MISSING', 'CONFLICT'])
    .optional(),
  rawProvenance: tb.string({ maxLength: 120 }).nullable().optional(),
  scopeText: tb.string({ maxLength: 1000000, minLength: 1 }),
  scopeBindings: tb
    .object({
      caseIds: tb
        .array(tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }), {
          minItems: 0,
          maxItems: 1000,
        })
        .optional(),
      legalSubjectIds: tb
        .array(tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }), {
          minItems: 0,
          maxItems: 1000,
        })
        .optional(),
      agencyIds: tb
        .array(tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }), {
          minItems: 0,
          maxItems: 1000,
        })
        .optional(),
      limitation: tb.string({ maxLength: 8000 }).optional(),
    })
    .nullable()
    .optional(),
  observedAt: tb.string({ maxLength: 40, format: 'date-time' }).nullable().optional(),
  reviewedByLabel: tb.string({ maxLength: 255 }).nullable().optional(),
  reviewedAt: tb.string({ maxLength: 40, format: 'date-time' }).nullable().optional(),
  excerpt: tb.string({ maxLength: 1000000 }).nullable().optional(),
  excerptLocator: tb.string({ maxLength: 500 }).nullable().optional(),
  limitations: tb.string({ maxLength: 1000000 }).nullable().optional(),
});
export type CreateSource = z.infer<typeof CreateSourceSchema>;

export const ReviseSourceSchema = tb.object({
  agencyId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
  title: tb.string({ maxLength: 500, minLength: 1 }),
  canonicalUrl: tb
    .string({ maxLength: 4096, minLength: 1, format: 'uri', pattern: '^https?://' })
    .nullable()
    .optional(),
  providerFileId: tb.string({ maxLength: 191 }).nullable().optional(),
  providerRevisionId: tb.string({ maxLength: 191 }).nullable().optional(),
  sourceRole: tb.enum([
    'CANONICAL_RECORD',
    'PRIMARY_CORRESPONDENCE',
    'OPERATOR_INPUT',
    'DERIVED_DRAFT',
    'EXTERNAL_REFERENCE',
    'POLICY_REFERENCE',
  ]),
  accessState: tb.enum(['NOT_CHECKED', 'ACCESSIBLE_AT_CHECK', 'UNAVAILABLE_AT_CHECK']).optional(),
  contentSha256: tb
    .string({ maxLength: 64, minLength: 64, pattern: '^[0-9a-f]{64}$' })
    .nullable()
    .optional(),
  hashTarget: tb.enum(['RAW_FILE', 'EXTRACTED_TEXT', 'OTHER']).nullable().optional(),
  reportedProvenance: tb
    .enum(['DOCUMENT_REVIEWED', 'OPERATOR_REPORTED', 'ANALYSIS', 'MISSING', 'CONFLICT'])
    .optional(),
  rawProvenance: tb.string({ maxLength: 120 }).nullable().optional(),
  scopeText: tb.string({ maxLength: 1000000, minLength: 1 }),
  scopeBindings: tb
    .object({
      caseIds: tb
        .array(tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }), {
          minItems: 0,
          maxItems: 1000,
        })
        .optional(),
      legalSubjectIds: tb
        .array(tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }), {
          minItems: 0,
          maxItems: 1000,
        })
        .optional(),
      agencyIds: tb
        .array(tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }), {
          minItems: 0,
          maxItems: 1000,
        })
        .optional(),
      limitation: tb.string({ maxLength: 8000 }).optional(),
    })
    .nullable()
    .optional(),
  observedAt: tb.string({ maxLength: 40, format: 'date-time' }).nullable().optional(),
  reviewedByLabel: tb.string({ maxLength: 255 }).nullable().optional(),
  reviewedAt: tb.string({ maxLength: 40, format: 'date-time' }).nullable().optional(),
  excerpt: tb.string({ maxLength: 1000000 }).nullable().optional(),
  excerptLocator: tb.string({ maxLength: 500 }).nullable().optional(),
  limitations: tb.string({ maxLength: 1000000 }).nullable().optional(),
});
export type ReviseSource = z.infer<typeof ReviseSourceSchema>;

export const LinkCaseSourceSchema = tb.object({
  sourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  useRole: tb.string({ maxLength: 60, minLength: 1 }),
  scopeNote: tb.string({ maxLength: 4000, minLength: 1 }),
});
export type LinkCaseSource = z.infer<typeof LinkCaseSourceSchema>;

export const FactSupportSchema = tb.object({
  caseSourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  supportRole: tb.string({ maxLength: 80, minLength: 1 }),
  supportedAssertion: tb.string({ maxLength: 8000, minLength: 1 }),
});
export type FactSupport = z.infer<typeof FactSupportSchema>;

export const CreateFactSchema = tb.oneOf(
  'factType',
  [
    tb.object({
      scopeKind: tb.enum(['CASE', 'WORK', 'REPORTED_ITEM', 'USE']),
      caseWorkId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
      reportedItemId: tb
        .string({ maxLength: 36, minLength: 36, format: 'uuid' })
        .nullable()
        .optional(),
      mappingId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
      provenance: tb.enum([
        'DOCUMENT_REVIEWED',
        'OPERATOR_REPORTED',
        'ANALYSIS',
        'MISSING',
        'CONFLICT',
      ]),
      rawProvenance: tb.string({ maxLength: 120 }).nullable().optional(),
      resolutionState: tb
        .enum(['UNASSESSED', 'SUPPORTED_FOR_SCOPE', 'CONFLICT', 'WITHDRAWN'])
        .optional(),
      assertedByLabel: tb.string({ maxLength: 255 }).nullable().optional(),
      assertedAsOf: tb.string({ maxLength: 40, format: 'date-time' }).nullable().optional(),
      scopeText: tb.string({ maxLength: 1000000, minLength: 1 }),
      limitations: tb.string({ maxLength: 1000000 }).nullable().optional(),
      changeReason: tb.string({ maxLength: 1000000, minLength: 1 }),
      factType: tb.literal('RIGHTS_BASIS'),
      value: FactValue_RIGHTS_BASISSchema,
      sources: tb.array(FactSupportSchema, { minItems: 0, maxItems: 100 }),
    }),
    tb.object({
      scopeKind: tb.enum(['CASE', 'WORK', 'REPORTED_ITEM', 'USE']),
      caseWorkId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
      reportedItemId: tb
        .string({ maxLength: 36, minLength: 36, format: 'uuid' })
        .nullable()
        .optional(),
      mappingId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
      provenance: tb.enum([
        'DOCUMENT_REVIEWED',
        'OPERATOR_REPORTED',
        'ANALYSIS',
        'MISSING',
        'CONFLICT',
      ]),
      rawProvenance: tb.string({ maxLength: 120 }).nullable().optional(),
      resolutionState: tb
        .enum(['UNASSESSED', 'SUPPORTED_FOR_SCOPE', 'CONFLICT', 'WITHDRAWN'])
        .optional(),
      assertedByLabel: tb.string({ maxLength: 255 }).nullable().optional(),
      assertedAsOf: tb.string({ maxLength: 40, format: 'date-time' }).nullable().optional(),
      scopeText: tb.string({ maxLength: 1000000, minLength: 1 }),
      limitations: tb.string({ maxLength: 1000000 }).nullable().optional(),
      changeReason: tb.string({ maxLength: 1000000, minLength: 1 }),
      factType: tb.literal('RIGHTS_SCOPE'),
      value: FactValue_RIGHTS_SCOPESchema,
      sources: tb.array(FactSupportSchema, { minItems: 0, maxItems: 100 }),
    }),
    tb.object({
      scopeKind: tb.enum(['CASE', 'WORK', 'REPORTED_ITEM', 'USE']),
      caseWorkId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
      reportedItemId: tb
        .string({ maxLength: 36, minLength: 36, format: 'uuid' })
        .nullable()
        .optional(),
      mappingId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
      provenance: tb.enum([
        'DOCUMENT_REVIEWED',
        'OPERATOR_REPORTED',
        'ANALYSIS',
        'MISSING',
        'CONFLICT',
      ]),
      rawProvenance: tb.string({ maxLength: 120 }).nullable().optional(),
      resolutionState: tb
        .enum(['UNASSESSED', 'SUPPORTED_FOR_SCOPE', 'CONFLICT', 'WITHDRAWN'])
        .optional(),
      assertedByLabel: tb.string({ maxLength: 255 }).nullable().optional(),
      assertedAsOf: tb.string({ maxLength: 40, format: 'date-time' }).nullable().optional(),
      scopeText: tb.string({ maxLength: 1000000, minLength: 1 }),
      limitations: tb.string({ maxLength: 1000000 }).nullable().optional(),
      changeReason: tb.string({ maxLength: 1000000, minLength: 1 }),
      factType: tb.literal('PERMISSION'),
      value: FactValue_PERMISSIONSchema,
      sources: tb.array(FactSupportSchema, { minItems: 0, maxItems: 100 }),
    }),
    tb.object({
      scopeKind: tb.enum(['CASE', 'WORK', 'REPORTED_ITEM', 'USE']),
      caseWorkId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
      reportedItemId: tb
        .string({ maxLength: 36, minLength: 36, format: 'uuid' })
        .nullable()
        .optional(),
      mappingId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
      provenance: tb.enum([
        'DOCUMENT_REVIEWED',
        'OPERATOR_REPORTED',
        'ANALYSIS',
        'MISSING',
        'CONFLICT',
      ]),
      rawProvenance: tb.string({ maxLength: 120 }).nullable().optional(),
      resolutionState: tb
        .enum(['UNASSESSED', 'SUPPORTED_FOR_SCOPE', 'CONFLICT', 'WITHDRAWN'])
        .optional(),
      assertedByLabel: tb.string({ maxLength: 255 }).nullable().optional(),
      assertedAsOf: tb.string({ maxLength: 40, format: 'date-time' }).nullable().optional(),
      scopeText: tb.string({ maxLength: 1000000, minLength: 1 }),
      limitations: tb.string({ maxLength: 1000000 }).nullable().optional(),
      changeReason: tb.string({ maxLength: 1000000, minLength: 1 }),
      factType: tb.literal('AV_COMPARISON'),
      value: FactValue_AV_COMPARISONSchema,
      sources: tb.array(FactSupportSchema, { minItems: 0, maxItems: 100 }),
    }),
    tb.object({
      scopeKind: tb.enum(['CASE', 'WORK', 'REPORTED_ITEM', 'USE']),
      caseWorkId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
      reportedItemId: tb
        .string({ maxLength: 36, minLength: 36, format: 'uuid' })
        .nullable()
        .optional(),
      mappingId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
      provenance: tb.enum([
        'DOCUMENT_REVIEWED',
        'OPERATOR_REPORTED',
        'ANALYSIS',
        'MISSING',
        'CONFLICT',
      ]),
      rawProvenance: tb.string({ maxLength: 120 }).nullable().optional(),
      resolutionState: tb
        .enum(['UNASSESSED', 'SUPPORTED_FOR_SCOPE', 'CONFLICT', 'WITHDRAWN'])
        .optional(),
      assertedByLabel: tb.string({ maxLength: 255 }).nullable().optional(),
      assertedAsOf: tb.string({ maxLength: 40, format: 'date-time' }).nullable().optional(),
      scopeText: tb.string({ maxLength: 1000000, minLength: 1 }),
      limitations: tb.string({ maxLength: 1000000 }).nullable().optional(),
      changeReason: tb.string({ maxLength: 1000000, minLength: 1 }),
      factType: tb.literal('EXCEPTION_REVIEW'),
      value: FactValue_EXCEPTION_REVIEWSchema,
      sources: tb.array(FactSupportSchema, { minItems: 0, maxItems: 100 }),
    }),
    tb.object({
      scopeKind: tb.enum(['CASE', 'WORK', 'REPORTED_ITEM', 'USE']),
      caseWorkId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
      reportedItemId: tb
        .string({ maxLength: 36, minLength: 36, format: 'uuid' })
        .nullable()
        .optional(),
      mappingId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
      provenance: tb.enum([
        'DOCUMENT_REVIEWED',
        'OPERATOR_REPORTED',
        'ANALYSIS',
        'MISSING',
        'CONFLICT',
      ]),
      rawProvenance: tb.string({ maxLength: 120 }).nullable().optional(),
      resolutionState: tb
        .enum(['UNASSESSED', 'SUPPORTED_FOR_SCOPE', 'CONFLICT', 'WITHDRAWN'])
        .optional(),
      assertedByLabel: tb.string({ maxLength: 255 }).nullable().optional(),
      assertedAsOf: tb.string({ maxLength: 40, format: 'date-time' }).nullable().optional(),
      scopeText: tb.string({ maxLength: 1000000, minLength: 1 }),
      limitations: tb.string({ maxLength: 1000000 }).nullable().optional(),
      changeReason: tb.string({ maxLength: 1000000, minLength: 1 }),
      factType: tb.literal('WORK_IDENTIFICATION'),
      value: FactValue_WORK_IDENTIFICATIONSchema,
      sources: tb.array(FactSupportSchema, { minItems: 0, maxItems: 100 }),
    }),
    tb.object({
      scopeKind: tb.enum(['CASE', 'WORK', 'REPORTED_ITEM', 'USE']),
      caseWorkId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
      reportedItemId: tb
        .string({ maxLength: 36, minLength: 36, format: 'uuid' })
        .nullable()
        .optional(),
      mappingId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
      provenance: tb.enum([
        'DOCUMENT_REVIEWED',
        'OPERATOR_REPORTED',
        'ANALYSIS',
        'MISSING',
        'CONFLICT',
      ]),
      rawProvenance: tb.string({ maxLength: 120 }).nullable().optional(),
      resolutionState: tb
        .enum(['UNASSESSED', 'SUPPORTED_FOR_SCOPE', 'CONFLICT', 'WITHDRAWN'])
        .optional(),
      assertedByLabel: tb.string({ maxLength: 255 }).nullable().optional(),
      assertedAsOf: tb.string({ maxLength: 40, format: 'date-time' }).nullable().optional(),
      scopeText: tb.string({ maxLength: 1000000, minLength: 1 }),
      limitations: tb.string({ maxLength: 1000000 }).nullable().optional(),
      changeReason: tb.string({ maxLength: 1000000, minLength: 1 }),
      factType: tb.literal('REPORTED_IDENTIFICATION'),
      value: FactValue_REPORTED_IDENTIFICATIONSchema,
      sources: tb.array(FactSupportSchema, { minItems: 0, maxItems: 100 }),
    }),
    tb.object({
      scopeKind: tb.enum(['CASE', 'WORK', 'REPORTED_ITEM', 'USE']),
      caseWorkId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
      reportedItemId: tb
        .string({ maxLength: 36, minLength: 36, format: 'uuid' })
        .nullable()
        .optional(),
      mappingId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
      provenance: tb.enum([
        'DOCUMENT_REVIEWED',
        'OPERATOR_REPORTED',
        'ANALYSIS',
        'MISSING',
        'CONFLICT',
      ]),
      rawProvenance: tb.string({ maxLength: 120 }).nullable().optional(),
      resolutionState: tb
        .enum(['UNASSESSED', 'SUPPORTED_FOR_SCOPE', 'CONFLICT', 'WITHDRAWN'])
        .optional(),
      assertedByLabel: tb.string({ maxLength: 255 }).nullable().optional(),
      assertedAsOf: tb.string({ maxLength: 40, format: 'date-time' }).nullable().optional(),
      scopeText: tb.string({ maxLength: 1000000, minLength: 1 }),
      limitations: tb.string({ maxLength: 1000000 }).nullable().optional(),
      changeReason: tb.string({ maxLength: 1000000, minLength: 1 }),
      factType: tb.literal('DUPLICATE_REVIEW'),
      value: FactValue_DUPLICATE_REVIEWSchema,
      sources: tb.array(FactSupportSchema, { minItems: 0, maxItems: 100 }),
    }),
    tb.object({
      scopeKind: tb.enum(['CASE', 'WORK', 'REPORTED_ITEM', 'USE']),
      caseWorkId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
      reportedItemId: tb
        .string({ maxLength: 36, minLength: 36, format: 'uuid' })
        .nullable()
        .optional(),
      mappingId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
      provenance: tb.enum([
        'DOCUMENT_REVIEWED',
        'OPERATOR_REPORTED',
        'ANALYSIS',
        'MISSING',
        'CONFLICT',
      ]),
      rawProvenance: tb.string({ maxLength: 120 }).nullable().optional(),
      resolutionState: tb
        .enum(['UNASSESSED', 'SUPPORTED_FOR_SCOPE', 'CONFLICT', 'WITHDRAWN'])
        .optional(),
      assertedByLabel: tb.string({ maxLength: 255 }).nullable().optional(),
      assertedAsOf: tb.string({ maxLength: 40, format: 'date-time' }).nullable().optional(),
      scopeText: tb.string({ maxLength: 1000000, minLength: 1 }),
      limitations: tb.string({ maxLength: 1000000 }).nullable().optional(),
      changeReason: tb.string({ maxLength: 1000000, minLength: 1 }),
      factType: tb.literal('AUTHORITY_CURRENTNESS'),
      value: FactValue_AUTHORITY_CURRENTNESSSchema,
      sources: tb.array(FactSupportSchema, { minItems: 0, maxItems: 100 }),
    }),
  ],
  {
    description:
      'Strict discriminated union. Scope/FK and source-role rules in INVARIANTS.md apply in addition to JSON Schema.',
  },
);
export type CreateFact = z.infer<typeof CreateFactSchema>;

export const ReviseFactSchema = tb.oneOf(
  'factType',
  [
    tb.object({
      scopeKind: tb.enum(['CASE', 'WORK', 'REPORTED_ITEM', 'USE']),
      caseWorkId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
      reportedItemId: tb
        .string({ maxLength: 36, minLength: 36, format: 'uuid' })
        .nullable()
        .optional(),
      mappingId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
      provenance: tb.enum([
        'DOCUMENT_REVIEWED',
        'OPERATOR_REPORTED',
        'ANALYSIS',
        'MISSING',
        'CONFLICT',
      ]),
      rawProvenance: tb.string({ maxLength: 120 }).nullable().optional(),
      resolutionState: tb
        .enum(['UNASSESSED', 'SUPPORTED_FOR_SCOPE', 'CONFLICT', 'WITHDRAWN'])
        .optional(),
      assertedByLabel: tb.string({ maxLength: 255 }).nullable().optional(),
      assertedAsOf: tb.string({ maxLength: 40, format: 'date-time' }).nullable().optional(),
      scopeText: tb.string({ maxLength: 1000000, minLength: 1 }),
      limitations: tb.string({ maxLength: 1000000 }).nullable().optional(),
      changeReason: tb.string({ maxLength: 1000000, minLength: 1 }),
      factType: tb.literal('RIGHTS_BASIS'),
      value: FactValue_RIGHTS_BASISSchema,
      sources: tb.array(FactSupportSchema, { minItems: 0, maxItems: 100 }),
    }),
    tb.object({
      scopeKind: tb.enum(['CASE', 'WORK', 'REPORTED_ITEM', 'USE']),
      caseWorkId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
      reportedItemId: tb
        .string({ maxLength: 36, minLength: 36, format: 'uuid' })
        .nullable()
        .optional(),
      mappingId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
      provenance: tb.enum([
        'DOCUMENT_REVIEWED',
        'OPERATOR_REPORTED',
        'ANALYSIS',
        'MISSING',
        'CONFLICT',
      ]),
      rawProvenance: tb.string({ maxLength: 120 }).nullable().optional(),
      resolutionState: tb
        .enum(['UNASSESSED', 'SUPPORTED_FOR_SCOPE', 'CONFLICT', 'WITHDRAWN'])
        .optional(),
      assertedByLabel: tb.string({ maxLength: 255 }).nullable().optional(),
      assertedAsOf: tb.string({ maxLength: 40, format: 'date-time' }).nullable().optional(),
      scopeText: tb.string({ maxLength: 1000000, minLength: 1 }),
      limitations: tb.string({ maxLength: 1000000 }).nullable().optional(),
      changeReason: tb.string({ maxLength: 1000000, minLength: 1 }),
      factType: tb.literal('RIGHTS_SCOPE'),
      value: FactValue_RIGHTS_SCOPESchema,
      sources: tb.array(FactSupportSchema, { minItems: 0, maxItems: 100 }),
    }),
    tb.object({
      scopeKind: tb.enum(['CASE', 'WORK', 'REPORTED_ITEM', 'USE']),
      caseWorkId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
      reportedItemId: tb
        .string({ maxLength: 36, minLength: 36, format: 'uuid' })
        .nullable()
        .optional(),
      mappingId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
      provenance: tb.enum([
        'DOCUMENT_REVIEWED',
        'OPERATOR_REPORTED',
        'ANALYSIS',
        'MISSING',
        'CONFLICT',
      ]),
      rawProvenance: tb.string({ maxLength: 120 }).nullable().optional(),
      resolutionState: tb
        .enum(['UNASSESSED', 'SUPPORTED_FOR_SCOPE', 'CONFLICT', 'WITHDRAWN'])
        .optional(),
      assertedByLabel: tb.string({ maxLength: 255 }).nullable().optional(),
      assertedAsOf: tb.string({ maxLength: 40, format: 'date-time' }).nullable().optional(),
      scopeText: tb.string({ maxLength: 1000000, minLength: 1 }),
      limitations: tb.string({ maxLength: 1000000 }).nullable().optional(),
      changeReason: tb.string({ maxLength: 1000000, minLength: 1 }),
      factType: tb.literal('PERMISSION'),
      value: FactValue_PERMISSIONSchema,
      sources: tb.array(FactSupportSchema, { minItems: 0, maxItems: 100 }),
    }),
    tb.object({
      scopeKind: tb.enum(['CASE', 'WORK', 'REPORTED_ITEM', 'USE']),
      caseWorkId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
      reportedItemId: tb
        .string({ maxLength: 36, minLength: 36, format: 'uuid' })
        .nullable()
        .optional(),
      mappingId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
      provenance: tb.enum([
        'DOCUMENT_REVIEWED',
        'OPERATOR_REPORTED',
        'ANALYSIS',
        'MISSING',
        'CONFLICT',
      ]),
      rawProvenance: tb.string({ maxLength: 120 }).nullable().optional(),
      resolutionState: tb
        .enum(['UNASSESSED', 'SUPPORTED_FOR_SCOPE', 'CONFLICT', 'WITHDRAWN'])
        .optional(),
      assertedByLabel: tb.string({ maxLength: 255 }).nullable().optional(),
      assertedAsOf: tb.string({ maxLength: 40, format: 'date-time' }).nullable().optional(),
      scopeText: tb.string({ maxLength: 1000000, minLength: 1 }),
      limitations: tb.string({ maxLength: 1000000 }).nullable().optional(),
      changeReason: tb.string({ maxLength: 1000000, minLength: 1 }),
      factType: tb.literal('AV_COMPARISON'),
      value: FactValue_AV_COMPARISONSchema,
      sources: tb.array(FactSupportSchema, { minItems: 0, maxItems: 100 }),
    }),
    tb.object({
      scopeKind: tb.enum(['CASE', 'WORK', 'REPORTED_ITEM', 'USE']),
      caseWorkId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
      reportedItemId: tb
        .string({ maxLength: 36, minLength: 36, format: 'uuid' })
        .nullable()
        .optional(),
      mappingId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
      provenance: tb.enum([
        'DOCUMENT_REVIEWED',
        'OPERATOR_REPORTED',
        'ANALYSIS',
        'MISSING',
        'CONFLICT',
      ]),
      rawProvenance: tb.string({ maxLength: 120 }).nullable().optional(),
      resolutionState: tb
        .enum(['UNASSESSED', 'SUPPORTED_FOR_SCOPE', 'CONFLICT', 'WITHDRAWN'])
        .optional(),
      assertedByLabel: tb.string({ maxLength: 255 }).nullable().optional(),
      assertedAsOf: tb.string({ maxLength: 40, format: 'date-time' }).nullable().optional(),
      scopeText: tb.string({ maxLength: 1000000, minLength: 1 }),
      limitations: tb.string({ maxLength: 1000000 }).nullable().optional(),
      changeReason: tb.string({ maxLength: 1000000, minLength: 1 }),
      factType: tb.literal('EXCEPTION_REVIEW'),
      value: FactValue_EXCEPTION_REVIEWSchema,
      sources: tb.array(FactSupportSchema, { minItems: 0, maxItems: 100 }),
    }),
    tb.object({
      scopeKind: tb.enum(['CASE', 'WORK', 'REPORTED_ITEM', 'USE']),
      caseWorkId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
      reportedItemId: tb
        .string({ maxLength: 36, minLength: 36, format: 'uuid' })
        .nullable()
        .optional(),
      mappingId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
      provenance: tb.enum([
        'DOCUMENT_REVIEWED',
        'OPERATOR_REPORTED',
        'ANALYSIS',
        'MISSING',
        'CONFLICT',
      ]),
      rawProvenance: tb.string({ maxLength: 120 }).nullable().optional(),
      resolutionState: tb
        .enum(['UNASSESSED', 'SUPPORTED_FOR_SCOPE', 'CONFLICT', 'WITHDRAWN'])
        .optional(),
      assertedByLabel: tb.string({ maxLength: 255 }).nullable().optional(),
      assertedAsOf: tb.string({ maxLength: 40, format: 'date-time' }).nullable().optional(),
      scopeText: tb.string({ maxLength: 1000000, minLength: 1 }),
      limitations: tb.string({ maxLength: 1000000 }).nullable().optional(),
      changeReason: tb.string({ maxLength: 1000000, minLength: 1 }),
      factType: tb.literal('WORK_IDENTIFICATION'),
      value: FactValue_WORK_IDENTIFICATIONSchema,
      sources: tb.array(FactSupportSchema, { minItems: 0, maxItems: 100 }),
    }),
    tb.object({
      scopeKind: tb.enum(['CASE', 'WORK', 'REPORTED_ITEM', 'USE']),
      caseWorkId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
      reportedItemId: tb
        .string({ maxLength: 36, minLength: 36, format: 'uuid' })
        .nullable()
        .optional(),
      mappingId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
      provenance: tb.enum([
        'DOCUMENT_REVIEWED',
        'OPERATOR_REPORTED',
        'ANALYSIS',
        'MISSING',
        'CONFLICT',
      ]),
      rawProvenance: tb.string({ maxLength: 120 }).nullable().optional(),
      resolutionState: tb
        .enum(['UNASSESSED', 'SUPPORTED_FOR_SCOPE', 'CONFLICT', 'WITHDRAWN'])
        .optional(),
      assertedByLabel: tb.string({ maxLength: 255 }).nullable().optional(),
      assertedAsOf: tb.string({ maxLength: 40, format: 'date-time' }).nullable().optional(),
      scopeText: tb.string({ maxLength: 1000000, minLength: 1 }),
      limitations: tb.string({ maxLength: 1000000 }).nullable().optional(),
      changeReason: tb.string({ maxLength: 1000000, minLength: 1 }),
      factType: tb.literal('REPORTED_IDENTIFICATION'),
      value: FactValue_REPORTED_IDENTIFICATIONSchema,
      sources: tb.array(FactSupportSchema, { minItems: 0, maxItems: 100 }),
    }),
    tb.object({
      scopeKind: tb.enum(['CASE', 'WORK', 'REPORTED_ITEM', 'USE']),
      caseWorkId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
      reportedItemId: tb
        .string({ maxLength: 36, minLength: 36, format: 'uuid' })
        .nullable()
        .optional(),
      mappingId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
      provenance: tb.enum([
        'DOCUMENT_REVIEWED',
        'OPERATOR_REPORTED',
        'ANALYSIS',
        'MISSING',
        'CONFLICT',
      ]),
      rawProvenance: tb.string({ maxLength: 120 }).nullable().optional(),
      resolutionState: tb
        .enum(['UNASSESSED', 'SUPPORTED_FOR_SCOPE', 'CONFLICT', 'WITHDRAWN'])
        .optional(),
      assertedByLabel: tb.string({ maxLength: 255 }).nullable().optional(),
      assertedAsOf: tb.string({ maxLength: 40, format: 'date-time' }).nullable().optional(),
      scopeText: tb.string({ maxLength: 1000000, minLength: 1 }),
      limitations: tb.string({ maxLength: 1000000 }).nullable().optional(),
      changeReason: tb.string({ maxLength: 1000000, minLength: 1 }),
      factType: tb.literal('DUPLICATE_REVIEW'),
      value: FactValue_DUPLICATE_REVIEWSchema,
      sources: tb.array(FactSupportSchema, { minItems: 0, maxItems: 100 }),
    }),
    tb.object({
      scopeKind: tb.enum(['CASE', 'WORK', 'REPORTED_ITEM', 'USE']),
      caseWorkId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
      reportedItemId: tb
        .string({ maxLength: 36, minLength: 36, format: 'uuid' })
        .nullable()
        .optional(),
      mappingId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
      provenance: tb.enum([
        'DOCUMENT_REVIEWED',
        'OPERATOR_REPORTED',
        'ANALYSIS',
        'MISSING',
        'CONFLICT',
      ]),
      rawProvenance: tb.string({ maxLength: 120 }).nullable().optional(),
      resolutionState: tb
        .enum(['UNASSESSED', 'SUPPORTED_FOR_SCOPE', 'CONFLICT', 'WITHDRAWN'])
        .optional(),
      assertedByLabel: tb.string({ maxLength: 255 }).nullable().optional(),
      assertedAsOf: tb.string({ maxLength: 40, format: 'date-time' }).nullable().optional(),
      scopeText: tb.string({ maxLength: 1000000, minLength: 1 }),
      limitations: tb.string({ maxLength: 1000000 }).nullable().optional(),
      changeReason: tb.string({ maxLength: 1000000, minLength: 1 }),
      factType: tb.literal('AUTHORITY_CURRENTNESS'),
      value: FactValue_AUTHORITY_CURRENTNESSSchema,
      sources: tb.array(FactSupportSchema, { minItems: 0, maxItems: 100 }),
    }),
  ],
  {
    description:
      'Strict discriminated union. Scope/FK and source-role rules in INVARIANTS.md apply in addition to JSON Schema.',
  },
);
export type ReviseFact = z.infer<typeof ReviseFactSchema>;

export const CreateCorrespondenceSchema = tb.object({
  agencyId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  mailboxAddress: tb.string({ maxLength: 254, minLength: 3, format: 'email' }),
  direction: tb.enum(['INBOUND', 'OUTBOUND']),
  subject: tb.string({ maxLength: 998, minLength: 1 }),
  messageId: tb.string({ maxLength: 998 }).nullable().optional(),
  inReplyTo: tb.string({ maxLength: 998 }).nullable().optional(),
  references: tb
    .array(tb.string({ maxLength: 998, minLength: 1 }), { minItems: 0, maxItems: 300 })
    .nullable()
    .optional(),
  captureMode: tb.enum(['RAW_SOURCE', 'COPIED_FULL_TEXT', 'EXCERPT', 'OPERATOR_REPORTED']),
  bodyRole: tb
    .enum(['FULL_MESSAGE', 'AUTHORED_BODY', 'QUOTED_HISTORY', 'EXCERPT', 'UNKNOWN'])
    .optional(),
  bodyText: tb.string({ maxLength: 1000000 }).nullable().optional(),
  rawSourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
  attachmentsManifest: tb
    .array(AttachmentObservationSchema, { minItems: 0, maxItems: 100 })
    .nullable()
    .optional(),
  headerDateRaw: tb.string({ maxLength: 255 }).nullable().optional(),
  occurredAt: tb.string({ maxLength: 40, format: 'date-time' }).nullable().optional(),
  timestampPrecision: tb.string({ maxLength: 40, minLength: 1 }).optional(),
  fromAddress: tb.string({ maxLength: 254, minLength: 3, format: 'email' }).nullable().optional(),
  toAddress: tb.string({ maxLength: 254, minLength: 3, format: 'email' }).nullable().optional(),
  replyToAddress: tb
    .string({ maxLength: 254, minLength: 3, format: 'email' })
    .nullable()
    .optional(),
  limitations: tb.string({ maxLength: 1000000 }).nullable().optional(),
});
export type CreateCorrespondence = z.infer<typeof CreateCorrespondenceSchema>;

export const BindCorrespondenceSchema = tb.object({
  correspondenceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  reportedItemId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable().optional(),
  eventType: tb.enum([
    'INITIAL_AS_SENT',
    'ACK',
    'NMI',
    'REPLY_AS_SENT',
    'SUPPLEMENT_AS_SENT',
    'CORRECTION_AS_SENT',
    'OUTCOME',
    'OTHER',
  ]),
  platformReference: tb.string({ maxLength: 191 }).nullable().optional(),
  outcome: tb
    .enum(['REMOVED', 'REINSTATED', 'REJECTED', 'RETRACTED', 'OTHER'])
    .nullable()
    .optional(),
  interpretation: tb.string({ maxLength: 1000000 }).nullable().optional(),
  supersedesBindingId: tb
    .string({ maxLength: 36, minLength: 36, format: 'uuid' })
    .nullable()
    .optional(),
});
export type BindCorrespondence = z.infer<typeof BindCorrespondenceSchema>;

export const GeneratePromptSchema = tb.object({
  taskType: tb.enum(['INITIAL', 'NMI_REPLY']),
  generationMode: tb.enum(['PREPARATION', 'DRAFTING']),
  expectedContextRevision: tb.integer({ minimum: 1, maximum: 4294967295 }),
  expectedDependencyDigest: tb.string({ maxLength: 64, minLength: 64, pattern: '^[0-9a-f]{64}$' }),
  authoritySelectionId: tb
    .string({ maxLength: 36, minLength: 36, format: 'uuid' })
    .nullable()
    .optional(),
  parentBindingId: tb
    .string({ maxLength: 36, minLength: 36, format: 'uuid' })
    .nullable()
    .optional(),
  priorBindingIds: tb.array(tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }), {
    minItems: 0,
    maxItems: 100,
  }),
});
export type GeneratePrompt = z.infer<typeof GeneratePromptSchema>;

export const CreateCandidateSchema = tb.object({
  promptSnapshotId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  subject: tb.string({ maxLength: 998, minLength: 1 }),
  envelope: EnvelopeSchema,
  bodyText: tb.string({ maxLength: 200000, minLength: 1 }),
  preparedDocuments: tb.array(DocumentPlanSchema, { minItems: 0, maxItems: 100 }),
  authoringTool: tb.string({ maxLength: 100 }).nullable().optional(),
  revisionReason: tb.string({ maxLength: 2000, minLength: 1 }).nullable().optional(),
});
export type CreateCandidate = z.infer<typeof CreateCandidateSchema>;

export const ReviseCandidateSchema = tb.object({
  promptSnapshotId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  subject: tb.string({ maxLength: 998, minLength: 1 }),
  envelope: EnvelopeSchema,
  bodyText: tb.string({ maxLength: 200000, minLength: 1 }),
  preparedDocuments: tb.array(DocumentPlanSchema, { minItems: 0, maxItems: 100 }),
  authoringTool: tb.string({ maxLength: 100 }).nullable().optional(),
  revisionReason: tb.string({ maxLength: 2000, minLength: 1 }).nullable(),
});
export type ReviseCandidate = z.infer<typeof ReviseCandidateSchema>;

export const ValidateCandidateSchema = tb.object({
  expectedArtifactSha256: tb.string({ maxLength: 64, minLength: 64, pattern: '^[0-9a-f]{64}$' }),
  expectedDependencyDigest: tb.string({ maxLength: 64, minLength: 64, pattern: '^[0-9a-f]{64}$' }),
});
export type ValidateCandidate = z.infer<typeof ValidateCandidateSchema>;

export const AssessmentSupportSchema = tb.object({
  caseSourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  supportedConclusion: tb.string({ maxLength: 8000, minLength: 1 }),
});
export type AssessmentSupport = z.infer<typeof AssessmentSupportSchema>;

export const CaptureAssessmentSchema = tb.object({
  gate: tb.enum(['G1', 'G2', 'G3', 'G4', 'G5', 'G6']),
  result: tb.enum(['PASS', 'HOLD', 'BLOCKED', 'MISSING', 'CONFLICT']),
  expectedArtifactSha256: tb.string({ maxLength: 64, minLength: 64, pattern: '^[0-9a-f]{64}$' }),
  expectedDependencyDigest: tb.string({ maxLength: 64, minLength: 64, pattern: '^[0-9a-f]{64}$' }),
  rulesetVersion: tb.string({ maxLength: 80, minLength: 1 }),
  scopeState: tb.enum(['RECORDED_NOT_ADOPTED', 'SCOPE_CONFIRMED_FOR_CANDIDATE']),
  performerKind: tb.enum(['HUMAN', 'AI_ASSISTED', 'DOCUMENTED_EXTERNAL_REVIEW']),
  performerLabel: tb.string({ maxLength: 255, minLength: 1 }),
  assessedAt: tb.string({ maxLength: 40, format: 'date-time' }).nullable().optional(),
  provenance: tb.enum([
    'DOCUMENT_REVIEWED',
    'OPERATOR_REPORTED',
    'ANALYSIS',
    'MISSING',
    'CONFLICT',
  ]),
  rationale: tb.string({ maxLength: 24000, minLength: 1 }),
  scopeText: tb.string({ maxLength: 8000, minLength: 1 }),
  limitations: tb.string({ maxLength: 8000 }).nullable().optional(),
  askDispositions: tb.array(AskDispositionSchema, { minItems: 0, maxItems: 100 }).optional(),
  supersedesAssessmentId: tb
    .string({ maxLength: 36, minLength: 36, format: 'uuid' })
    .nullable()
    .optional(),
  sources: tb.array(AssessmentSupportSchema, { minItems: 1, maxItems: 100 }),
});
export type CaptureAssessment = z.infer<typeof CaptureAssessmentSchema>;

export const ExportUnsignedSchema = tb.object({
  expectedArtifactSha256: tb.string({ maxLength: 64, minLength: 64, pattern: '^[0-9a-f]{64}$' }),
  expectedDependencyDigest: tb.string({ maxLength: 64, minLength: 64, pattern: '^[0-9a-f]{64}$' }),
  validationRunId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  format: tb.enum(['PLAIN_TEXT']),
});
export type ExportUnsigned = z.infer<typeof ExportUnsignedSchema>;

export const GateSummarySchema = tb.object({
  gate: tb.enum(['G1', 'G2', 'G3', 'G4', 'G5', 'G6']),
  status: tb.enum(['PASS', 'HOLD', 'BLOCKED', 'MISSING', 'CONFLICT', 'UNASSESSED']),
  assessmentId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  reasonCodes: tb.array(tb.string({ maxLength: 100, minLength: 1 }), {
    minItems: 0,
    maxItems: 1000,
  }),
});
export type GateSummary = z.infer<typeof GateSummarySchema>;

export const ReadinessSchema = tb.object({
  candidateId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  artifactSha256: tb.string({ maxLength: 64, minLength: 64, pattern: '^[0-9a-f]{64}$' }),
  dependencyDigest: tb.string({ maxLength: 64, minLength: 64, pattern: '^[0-9a-f]{64}$' }),
  rulesetVersion: tb.string({ maxLength: 80, minLength: 1 }),
  status: tb.enum([
    'UNVALIDATED',
    'BLOCKED',
    'REVIEW_REQUIRED',
    'STALE_REVALIDATION_REQUIRED',
    'READY_FOR_SIGNER',
    'SUPERSEDED',
  ]),
  technicalResult: tb.enum(['TECHNICAL_PASS', 'BLOCKED', 'REVIEW_REQUIRED', 'ERROR']).nullable(),
  validationRunId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  gates: tb.array(GateSummarySchema, { minItems: 6, maxItems: 6 }),
  reasonCodes: tb.array(tb.string({ maxLength: 100, minLength: 1 }), {
    minItems: 0,
    maxItems: 1000,
  }),
  signatureState: tb.literal('HUMAN_PENDING'),
  externalAction: tb.literal('PROHIBITED'),
  evaluatedAt: tb.string({ maxLength: 40, format: 'date-time' }),
});
export type Readiness = z.infer<typeof ReadinessSchema>;

export const UnsignedExportSchema = tb.object({
  candidateId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  artifactSha256: tb.string({ maxLength: 64, minLength: 64, pattern: '^[0-9a-f]{64}$' }),
  bodySha256: tb.string({ maxLength: 64, minLength: 64, pattern: '^[0-9a-f]{64}$' }),
  subject: tb.string({ maxLength: 998 }),
  envelope: EnvelopeSchema,
  bodyText: tb.string({ maxLength: 200000 }),
  signatureState: tb.literal('HUMAN_PENDING'),
  sendPerformed: tb.literal(false),
  readiness: ReadinessSchema,
  exportedAt: tb.string({ maxLength: 40, format: 'date-time' }),
});
export type UnsignedExport = z.infer<typeof UnsignedExportSchema>;

export const OperationErrorSchema = tb.object({
  error: tb.object({
    code: tb.string({ maxLength: 100, minLength: 1 }),
    message: tb.string({ maxLength: 4000, minLength: 1 }),
    details: LooseObjectSchema,
    requestId: tb.string({ maxLength: 100, minLength: 1 }),
  }),
});
export type OperationError = z.infer<typeof OperationErrorSchema>;

export const ResponseMetaSchema = tb.object({
  requestId: tb.string({ maxLength: 100, minLength: 1 }),
  affectedResources: tb
    .array(
      tb.object({
        type: tb.string({ maxLength: 100, minLength: 1 }),
        id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
        rowVersion: tb.integer({ minimum: 1, maximum: 4294967295 }).nullable(),
      }),
      { minItems: 0, maxItems: 100 },
    )
    .optional(),
});
export type ResponseMeta = z.infer<typeof ResponseMetaSchema>;

export const LoginRequestSchema = tb.object({
  email: tb.string({ maxLength: 254, minLength: 3, format: 'email' }),
  password: tb.string({ maxLength: 256, minLength: 1 }),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const SessionViewSchema = tb.object({
  user: UserSchema,
  expiresAt: tb.string({ maxLength: 40, format: 'date-time' }),
  csrfToken: tb.string({ maxLength: 200, minLength: 20 }),
});
export type SessionView = z.infer<typeof SessionViewSchema>;

export const AppMetaSchema = tb.object({
  appVersion: tb.string({ maxLength: 80, minLength: 1 }),
  schemaRelease: tb.literal('TB-SCHEMA-API-v1.0.0'),
  contractVersion: tb.literal(PFC_SCHEMA_VERSION),
  rulesetVersion: tb.string({ maxLength: 80, minLength: 1 }),
  environment: tb.enum(['LOCAL', 'STAGING', 'PRODUCTION']),
  externalSendingEnabled: tb.literal(false),
});
export type AppMeta = z.infer<typeof AppMetaSchema>;

export const HealthSchema = tb.object({ status: tb.enum(['ok', 'unavailable']) });
export type Health = z.infer<typeof HealthSchema>;

export const GetHealthResponseSchema = tb.object({ data: HealthSchema, meta: ResponseMetaSchema });
export type GetHealthResponse = z.infer<typeof GetHealthResponseSchema>;

export const GetMetaResponseSchema = tb.object({ data: AppMetaSchema, meta: ResponseMetaSchema });
export type GetMetaResponse = z.infer<typeof GetMetaResponseSchema>;

export const LoginResponseSchema = tb.object({ data: SessionViewSchema, meta: ResponseMetaSchema });
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const GetSessionResponseSchema = tb.object({
  data: SessionViewSchema,
  meta: ResponseMetaSchema,
});
export type GetSessionResponse = z.infer<typeof GetSessionResponseSchema>;

export const AgencyPageSchema = tb.object({
  items: tb.array(AgencySchema, { minItems: 0, maxItems: 100 }),
  nextCursor: tb.string({ maxLength: 2000 }).nullable(),
});
export type AgencyPage = z.infer<typeof AgencyPageSchema>;

export const ListAgenciesResponseSchema = tb.object({
  data: AgencyPageSchema,
  meta: ResponseMetaSchema,
});
export type ListAgenciesResponse = z.infer<typeof ListAgenciesResponseSchema>;

export const CreateAgencyResponseSchema = tb.object({
  data: AgencySchema,
  meta: ResponseMetaSchema,
});
export type CreateAgencyResponse = z.infer<typeof CreateAgencyResponseSchema>;

export const GetAgencyResponseSchema = tb.object({ data: AgencySchema, meta: ResponseMetaSchema });
export type GetAgencyResponse = z.infer<typeof GetAgencyResponseSchema>;

export const PatchAgencyResponseSchema = tb.object({
  data: AgencySchema,
  meta: ResponseMetaSchema,
});
export type PatchAgencyResponse = z.infer<typeof PatchAgencyResponseSchema>;

export const ArchiveAgencyResponseSchema = tb.object({
  data: AgencySchema,
  meta: ResponseMetaSchema,
});
export type ArchiveAgencyResponse = z.infer<typeof ArchiveAgencyResponseSchema>;

export const RestoreAgencyResponseSchema = tb.object({
  data: AgencySchema,
  meta: ResponseMetaSchema,
});
export type RestoreAgencyResponse = z.infer<typeof RestoreAgencyResponseSchema>;

export const BindCanonicalAgencyResponseSchema = tb.object({
  data: AgencySchema,
  meta: ResponseMetaSchema,
});
export type BindCanonicalAgencyResponse = z.infer<typeof BindCanonicalAgencyResponseSchema>;

export const SetAgencyStateResponseSchema = tb.object({
  data: AgencySchema,
  meta: ResponseMetaSchema,
});
export type SetAgencyStateResponse = z.infer<typeof SetAgencyStateResponseSchema>;

export const OwnerPageSchema = tb.object({
  items: tb.array(OwnerSchema, { minItems: 0, maxItems: 100 }),
  nextCursor: tb.string({ maxLength: 2000 }).nullable(),
});
export type OwnerPage = z.infer<typeof OwnerPageSchema>;

export const ListOwnersResponseSchema = tb.object({
  data: OwnerPageSchema,
  meta: ResponseMetaSchema,
});
export type ListOwnersResponse = z.infer<typeof ListOwnersResponseSchema>;

export const CreateOwnerResponseSchema = tb.object({ data: OwnerSchema, meta: ResponseMetaSchema });
export type CreateOwnerResponse = z.infer<typeof CreateOwnerResponseSchema>;

export const GetOwnerResponseSchema = tb.object({ data: OwnerSchema, meta: ResponseMetaSchema });
export type GetOwnerResponse = z.infer<typeof GetOwnerResponseSchema>;

export const PatchOwnerResponseSchema = tb.object({ data: OwnerSchema, meta: ResponseMetaSchema });
export type PatchOwnerResponse = z.infer<typeof PatchOwnerResponseSchema>;

export const ArchiveOwnerResponseSchema = tb.object({
  data: OwnerSchema,
  meta: ResponseMetaSchema,
});
export type ArchiveOwnerResponse = z.infer<typeof ArchiveOwnerResponseSchema>;

export const RestoreOwnerResponseSchema = tb.object({
  data: OwnerSchema,
  meta: ResponseMetaSchema,
});
export type RestoreOwnerResponse = z.infer<typeof RestoreOwnerResponseSchema>;

export const BindCanonicalOwnerResponseSchema = tb.object({
  data: OwnerSchema,
  meta: ResponseMetaSchema,
});
export type BindCanonicalOwnerResponse = z.infer<typeof BindCanonicalOwnerResponseSchema>;

export const SetOwnerStateResponseSchema = tb.object({
  data: OwnerSchema,
  meta: ResponseMetaSchema,
});
export type SetOwnerStateResponse = z.infer<typeof SetOwnerStateResponseSchema>;

export const LegalSubjectPageSchema = tb.object({
  items: tb.array(LegalSubjectSchema, { minItems: 0, maxItems: 100 }),
  nextCursor: tb.string({ maxLength: 2000 }).nullable(),
});
export type LegalSubjectPage = z.infer<typeof LegalSubjectPageSchema>;

export const ListLegalSubjectsResponseSchema = tb.object({
  data: LegalSubjectPageSchema,
  meta: ResponseMetaSchema,
});
export type ListLegalSubjectsResponse = z.infer<typeof ListLegalSubjectsResponseSchema>;

export const CreateLegalSubjectResponseSchema = tb.object({
  data: LegalSubjectSchema,
  meta: ResponseMetaSchema,
});
export type CreateLegalSubjectResponse = z.infer<typeof CreateLegalSubjectResponseSchema>;

export const GetLegalSubjectResponseSchema = tb.object({
  data: LegalSubjectSchema,
  meta: ResponseMetaSchema,
});
export type GetLegalSubjectResponse = z.infer<typeof GetLegalSubjectResponseSchema>;

export const PatchLegalSubjectResponseSchema = tb.object({
  data: LegalSubjectSchema,
  meta: ResponseMetaSchema,
});
export type PatchLegalSubjectResponse = z.infer<typeof PatchLegalSubjectResponseSchema>;

export const ArchiveLegalSubjectResponseSchema = tb.object({
  data: LegalSubjectSchema,
  meta: ResponseMetaSchema,
});
export type ArchiveLegalSubjectResponse = z.infer<typeof ArchiveLegalSubjectResponseSchema>;

export const RestoreLegalSubjectResponseSchema = tb.object({
  data: LegalSubjectSchema,
  meta: ResponseMetaSchema,
});
export type RestoreLegalSubjectResponse = z.infer<typeof RestoreLegalSubjectResponseSchema>;

export const BindCanonicalLegalSubjectResponseSchema = tb.object({
  data: LegalSubjectSchema,
  meta: ResponseMetaSchema,
});
export type BindCanonicalLegalSubjectResponse = z.infer<
  typeof BindCanonicalLegalSubjectResponseSchema
>;

export const SetLegalSubjectStateResponseSchema = tb.object({
  data: LegalSubjectSchema,
  meta: ResponseMetaSchema,
});
export type SetLegalSubjectStateResponse = z.infer<typeof SetLegalSubjectStateResponseSchema>;

export const SignerPageSchema = tb.object({
  items: tb.array(SignerSchema, { minItems: 0, maxItems: 100 }),
  nextCursor: tb.string({ maxLength: 2000 }).nullable(),
});
export type SignerPage = z.infer<typeof SignerPageSchema>;

export const ListSignersResponseSchema = tb.object({
  data: SignerPageSchema,
  meta: ResponseMetaSchema,
});
export type ListSignersResponse = z.infer<typeof ListSignersResponseSchema>;

export const CreateSignerResponseSchema = tb.object({
  data: SignerSchema,
  meta: ResponseMetaSchema,
});
export type CreateSignerResponse = z.infer<typeof CreateSignerResponseSchema>;

export const GetSignerResponseSchema = tb.object({ data: SignerSchema, meta: ResponseMetaSchema });
export type GetSignerResponse = z.infer<typeof GetSignerResponseSchema>;

export const PatchSignerResponseSchema = tb.object({
  data: SignerSchema,
  meta: ResponseMetaSchema,
});
export type PatchSignerResponse = z.infer<typeof PatchSignerResponseSchema>;

export const ArchiveSignerResponseSchema = tb.object({
  data: SignerSchema,
  meta: ResponseMetaSchema,
});
export type ArchiveSignerResponse = z.infer<typeof ArchiveSignerResponseSchema>;

export const RestoreSignerResponseSchema = tb.object({
  data: SignerSchema,
  meta: ResponseMetaSchema,
});
export type RestoreSignerResponse = z.infer<typeof RestoreSignerResponseSchema>;

export const BindCanonicalSignerResponseSchema = tb.object({
  data: SignerSchema,
  meta: ResponseMetaSchema,
});
export type BindCanonicalSignerResponse = z.infer<typeof BindCanonicalSignerResponseSchema>;

export const SetSignerStateResponseSchema = tb.object({
  data: SignerSchema,
  meta: ResponseMetaSchema,
});
export type SetSignerStateResponse = z.infer<typeof SetSignerStateResponseSchema>;

export const RoutePageSchema = tb.object({
  items: tb.array(RouteSchema, { minItems: 0, maxItems: 100 }),
  nextCursor: tb.string({ maxLength: 2000 }).nullable(),
});
export type RoutePage = z.infer<typeof RoutePageSchema>;

export const ListRoutesResponseSchema = tb.object({
  data: RoutePageSchema,
  meta: ResponseMetaSchema,
});
export type ListRoutesResponse = z.infer<typeof ListRoutesResponseSchema>;

export const CreateRouteResponseSchema = tb.object({ data: RouteSchema, meta: ResponseMetaSchema });
export type CreateRouteResponse = z.infer<typeof CreateRouteResponseSchema>;

export const GetRouteResponseSchema = tb.object({ data: RouteSchema, meta: ResponseMetaSchema });
export type GetRouteResponse = z.infer<typeof GetRouteResponseSchema>;

export const PatchRouteResponseSchema = tb.object({ data: RouteSchema, meta: ResponseMetaSchema });
export type PatchRouteResponse = z.infer<typeof PatchRouteResponseSchema>;

export const ArchiveRouteResponseSchema = tb.object({
  data: RouteSchema,
  meta: ResponseMetaSchema,
});
export type ArchiveRouteResponse = z.infer<typeof ArchiveRouteResponseSchema>;

export const RestoreRouteResponseSchema = tb.object({
  data: RouteSchema,
  meta: ResponseMetaSchema,
});
export type RestoreRouteResponse = z.infer<typeof RestoreRouteResponseSchema>;

export const BindCanonicalRouteResponseSchema = tb.object({
  data: RouteSchema,
  meta: ResponseMetaSchema,
});
export type BindCanonicalRouteResponse = z.infer<typeof BindCanonicalRouteResponseSchema>;

export const SetRouteLinkStateResponseSchema = tb.object({
  data: RouteSchema,
  meta: ResponseMetaSchema,
});
export type SetRouteLinkStateResponse = z.infer<typeof SetRouteLinkStateResponseSchema>;

export const MandatePageSchema = tb.object({
  items: tb.array(MandateSchema, { minItems: 0, maxItems: 100 }),
  nextCursor: tb.string({ maxLength: 2000 }).nullable(),
});
export type MandatePage = z.infer<typeof MandatePageSchema>;

export const ListMandatesResponseSchema = tb.object({
  data: MandatePageSchema,
  meta: ResponseMetaSchema,
});
export type ListMandatesResponse = z.infer<typeof ListMandatesResponseSchema>;

export const CreateMandateResponseSchema = tb.object({
  data: MandateSchema,
  meta: ResponseMetaSchema,
});
export type CreateMandateResponse = z.infer<typeof CreateMandateResponseSchema>;

export const GetMandateResponseSchema = tb.object({
  data: MandateSchema,
  meta: ResponseMetaSchema,
});
export type GetMandateResponse = z.infer<typeof GetMandateResponseSchema>;

export const PatchMandateResponseSchema = tb.object({
  data: MandateSchema,
  meta: ResponseMetaSchema,
});
export type PatchMandateResponse = z.infer<typeof PatchMandateResponseSchema>;

export const ArchiveMandateResponseSchema = tb.object({
  data: MandateSchema,
  meta: ResponseMetaSchema,
});
export type ArchiveMandateResponse = z.infer<typeof ArchiveMandateResponseSchema>;

export const RestoreMandateResponseSchema = tb.object({
  data: MandateSchema,
  meta: ResponseMetaSchema,
});
export type RestoreMandateResponse = z.infer<typeof RestoreMandateResponseSchema>;

export const BindCanonicalMandateResponseSchema = tb.object({
  data: MandateSchema,
  meta: ResponseMetaSchema,
});
export type BindCanonicalMandateResponse = z.infer<typeof BindCanonicalMandateResponseSchema>;

export const OwnerSubjectPageSchema = tb.object({
  items: tb.array(OwnerSubjectSchema, { minItems: 0, maxItems: 100 }),
  nextCursor: tb.string({ maxLength: 2000 }).nullable(),
});
export type OwnerSubjectPage = z.infer<typeof OwnerSubjectPageSchema>;

export const ListOwnerSubjectsResponseSchema = tb.object({
  data: OwnerSubjectPageSchema,
  meta: ResponseMetaSchema,
});
export type ListOwnerSubjectsResponse = z.infer<typeof ListOwnerSubjectsResponseSchema>;

export const LinkOwnerSubjectResponseSchema = tb.object({
  data: OwnerSubjectSchema,
  meta: ResponseMetaSchema,
});
export type LinkOwnerSubjectResponse = z.infer<typeof LinkOwnerSubjectResponseSchema>;

export const GetOwnerSubjectResponseSchema = tb.object({
  data: OwnerSubjectSchema,
  meta: ResponseMetaSchema,
});
export type GetOwnerSubjectResponse = z.infer<typeof GetOwnerSubjectResponseSchema>;

export const SetOwnerSubjectLinkStateResponseSchema = tb.object({
  data: OwnerSubjectSchema,
  meta: ResponseMetaSchema,
});
export type SetOwnerSubjectLinkStateResponse = z.infer<
  typeof SetOwnerSubjectLinkStateResponseSchema
>;

export const MandateVersionPageSchema = tb.object({
  items: tb.array(MandateVersionSchema, { minItems: 0, maxItems: 100 }),
  nextCursor: tb.string({ maxLength: 2000 }).nullable(),
});
export type MandateVersionPage = z.infer<typeof MandateVersionPageSchema>;

export const ListMandateVersionsResponseSchema = tb.object({
  data: MandateVersionPageSchema,
  meta: ResponseMetaSchema,
});
export type ListMandateVersionsResponse = z.infer<typeof ListMandateVersionsResponseSchema>;

export const CreateMandateVersionResponseSchema = tb.object({
  data: MandateVersionSchema,
  meta: ResponseMetaSchema,
});
export type CreateMandateVersionResponse = z.infer<typeof CreateMandateVersionResponseSchema>;

export const GetMandateVersionResponseSchema = tb.object({
  data: MandateVersionSchema,
  meta: ResponseMetaSchema,
});
export type GetMandateVersionResponse = z.infer<typeof GetMandateVersionResponseSchema>;

export const PatchDraftMandateVersionResponseSchema = tb.object({
  data: MandateVersionSchema,
  meta: ResponseMetaSchema,
});
export type PatchDraftMandateVersionResponse = z.infer<
  typeof PatchDraftMandateVersionResponseSchema
>;

export const FreezeMandateVersionResponseSchema = tb.object({
  data: MandateVersionSchema,
  meta: ResponseMetaSchema,
});
export type FreezeMandateVersionResponse = z.infer<typeof FreezeMandateVersionResponseSchema>;

export const MandateCoveragePageSchema = tb.object({
  items: tb.array(MandateCoverageSchema, { minItems: 0, maxItems: 100 }),
  nextCursor: tb.string({ maxLength: 2000 }).nullable(),
});
export type MandateCoveragePage = z.infer<typeof MandateCoveragePageSchema>;

export const ListVersionCoveragesResponseSchema = tb.object({
  data: MandateCoveragePageSchema,
  meta: ResponseMetaSchema,
});
export type ListVersionCoveragesResponse = z.infer<typeof ListVersionCoveragesResponseSchema>;

export const CreateCoverageResponseSchema = tb.object({
  data: MandateCoverageSchema,
  meta: ResponseMetaSchema,
});
export type CreateCoverageResponse = z.infer<typeof CreateCoverageResponseSchema>;

export const GetCoverageResponseSchema = tb.object({
  data: MandateCoverageSchema,
  meta: ResponseMetaSchema,
});
export type GetCoverageResponse = z.infer<typeof GetCoverageResponseSchema>;

export const PatchDraftCoverageResponseSchema = tb.object({
  data: MandateCoverageSchema,
  meta: ResponseMetaSchema,
});
export type PatchDraftCoverageResponse = z.infer<typeof PatchDraftCoverageResponseSchema>;

export const CoverageSignerPageSchema = tb.object({
  items: tb.array(CoverageSignerSchema, { minItems: 0, maxItems: 100 }),
  nextCursor: tb.string({ maxLength: 2000 }).nullable(),
});
export type CoverageSignerPage = z.infer<typeof CoverageSignerPageSchema>;

export const ListCoverageSignersResponseSchema = tb.object({
  data: CoverageSignerPageSchema,
  meta: ResponseMetaSchema,
});
export type ListCoverageSignersResponse = z.infer<typeof ListCoverageSignersResponseSchema>;

export const CreateCoverageSignerResponseSchema = tb.object({
  data: CoverageSignerSchema,
  meta: ResponseMetaSchema,
});
export type CreateCoverageSignerResponse = z.infer<typeof CreateCoverageSignerResponseSchema>;

export const GetCoverageSignerResponseSchema = tb.object({
  data: CoverageSignerSchema,
  meta: ResponseMetaSchema,
});
export type GetCoverageSignerResponse = z.infer<typeof GetCoverageSignerResponseSchema>;

export const RecordAuthorityEventResponseSchema = tb.object({
  data: AuthorityEventSchema,
  meta: ResponseMetaSchema,
});
export type RecordAuthorityEventResponse = z.infer<typeof RecordAuthorityEventResponseSchema>;

export const AuthorityEventPageSchema = tb.object({
  items: tb.array(AuthorityEventSchema, { minItems: 0, maxItems: 100 }),
  nextCursor: tb.string({ maxLength: 2000 }).nullable(),
});
export type AuthorityEventPage = z.infer<typeof AuthorityEventPageSchema>;

export const ListAuthorityEventsResponseSchema = tb.object({
  data: AuthorityEventPageSchema,
  meta: ResponseMetaSchema,
});
export type ListAuthorityEventsResponse = z.infer<typeof ListAuthorityEventsResponseSchema>;

export const CaseRecordPageSchema = tb.object({
  items: tb.array(CaseRecordSchema, { minItems: 0, maxItems: 100 }),
  nextCursor: tb.string({ maxLength: 2000 }).nullable(),
});
export type CaseRecordPage = z.infer<typeof CaseRecordPageSchema>;

export const ListCasesResponseSchema = tb.object({
  data: CaseRecordPageSchema,
  meta: ResponseMetaSchema,
});
export type ListCasesResponse = z.infer<typeof ListCasesResponseSchema>;

export const CreateCaseResponseSchema = tb.object({
  data: CaseRecordSchema,
  meta: ResponseMetaSchema,
});
export type CreateCaseResponse = z.infer<typeof CreateCaseResponseSchema>;

export const GetCaseResponseSchema = tb.object({
  data: CaseRecordSchema,
  meta: ResponseMetaSchema,
});
export type GetCaseResponse = z.infer<typeof GetCaseResponseSchema>;

export const PatchCaseResponseSchema = tb.object({
  data: CaseRecordSchema,
  meta: ResponseMetaSchema,
});
export type PatchCaseResponse = z.infer<typeof PatchCaseResponseSchema>;

export const ArchiveCaseResponseSchema = tb.object({
  data: CaseRecordSchema,
  meta: ResponseMetaSchema,
});
export type ArchiveCaseResponse = z.infer<typeof ArchiveCaseResponseSchema>;

export const RestoreCaseResponseSchema = tb.object({
  data: CaseRecordSchema,
  meta: ResponseMetaSchema,
});
export type RestoreCaseResponse = z.infer<typeof RestoreCaseResponseSchema>;

export const WorkflowCaseResponseSchema = tb.object({
  data: CaseRecordSchema,
  meta: ResponseMetaSchema,
});
export type WorkflowCaseResponse = z.infer<typeof WorkflowCaseResponseSchema>;

export const RouteBindingCaseResponseSchema = tb.object({
  data: CaseRecordSchema,
  meta: ResponseMetaSchema,
});
export type RouteBindingCaseResponse = z.infer<typeof RouteBindingCaseResponseSchema>;

export const CanonicalBindingCaseResponseSchema = tb.object({
  data: CaseRecordSchema,
  meta: ResponseMetaSchema,
});
export type CanonicalBindingCaseResponse = z.infer<typeof CanonicalBindingCaseResponseSchema>;

export const SelectCaseAuthorityResponseSchema = tb.object({
  data: CaseAuthoritySelectionSchema,
  meta: ResponseMetaSchema,
});
export type SelectCaseAuthorityResponse = z.infer<typeof SelectCaseAuthorityResponseSchema>;

export const CaseAuthoritySelectionPageSchema = tb.object({
  items: tb.array(CaseAuthoritySelectionSchema, { minItems: 0, maxItems: 100 }),
  nextCursor: tb.string({ maxLength: 2000 }).nullable(),
});
export type CaseAuthoritySelectionPage = z.infer<typeof CaseAuthoritySelectionPageSchema>;

export const ListCaseAuthoritySelectionsResponseSchema = tb.object({
  data: CaseAuthoritySelectionPageSchema,
  meta: ResponseMetaSchema,
});
export type ListCaseAuthoritySelectionsResponse = z.infer<
  typeof ListCaseAuthoritySelectionsResponseSchema
>;

// TB-SCHEMA-API-v1.1.0 (ADR-0004, additive): the read-back of one selection with the coverage rows
// it pinned. Exactly the stored rows — nothing current, inferred or evaluated.
export const CaseAuthoritySelectionViewSchema = tb.object(
  {
    selection: CaseAuthoritySelectionSchema,
    coverages: tb.array(CaseAuthorityCoverageSchema, { minItems: 1, maxItems: 20 }),
  },
  {
    description:
      'The exact stored CaseAuthoritySelection and every CaseAuthorityCoverage row it pinned for evaluation in this Case, coverages in ascending coverageId order. A historical record only: never a G1 decision, current authority, signer eligibility, G7 or readiness.',
  },
);
export type CaseAuthoritySelectionView = z.infer<typeof CaseAuthoritySelectionViewSchema>;

export const GetCaseAuthoritySelectionResponseSchema = tb.object({
  data: CaseAuthoritySelectionViewSchema,
  meta: ResponseMetaSchema,
});
export type GetCaseAuthoritySelectionResponse = z.infer<
  typeof GetCaseAuthoritySelectionResponseSchema
>;

export const ReportedItemPageSchema = tb.object({
  items: tb.array(ReportedItemSchema, { minItems: 0, maxItems: 100 }),
  nextCursor: tb.string({ maxLength: 2000 }).nullable(),
});
export type ReportedItemPage = z.infer<typeof ReportedItemPageSchema>;

export const ListCaseReportedItemsResponseSchema = tb.object({
  data: ReportedItemPageSchema,
  meta: ResponseMetaSchema,
});
export type ListCaseReportedItemsResponse = z.infer<typeof ListCaseReportedItemsResponseSchema>;

export const CreateReportedItemResponseSchema = tb.object({
  data: ReportedItemSchema,
  meta: ResponseMetaSchema,
});
export type CreateReportedItemResponse = z.infer<typeof CreateReportedItemResponseSchema>;

export const GetReportedItemResponseSchema = tb.object({
  data: ReportedItemSchema,
  meta: ResponseMetaSchema,
});
export type GetReportedItemResponse = z.infer<typeof GetReportedItemResponseSchema>;

export const PatchReportedItemResponseSchema = tb.object({
  data: ReportedItemSchema,
  meta: ResponseMetaSchema,
});
export type PatchReportedItemResponse = z.infer<typeof PatchReportedItemResponseSchema>;

export const ArchiveReportedItemResponseSchema = tb.object({
  data: ReportedItemSchema,
  meta: ResponseMetaSchema,
});
export type ArchiveReportedItemResponse = z.infer<typeof ArchiveReportedItemResponseSchema>;

export const RestoreReportedItemResponseSchema = tb.object({
  data: ReportedItemSchema,
  meta: ResponseMetaSchema,
});
export type RestoreReportedItemResponse = z.infer<typeof RestoreReportedItemResponseSchema>;

export const CaseWorkPageSchema = tb.object({
  items: tb.array(CaseWorkSchema, { minItems: 0, maxItems: 100 }),
  nextCursor: tb.string({ maxLength: 2000 }).nullable(),
});
export type CaseWorkPage = z.infer<typeof CaseWorkPageSchema>;

export const ListCaseCaseWorksResponseSchema = tb.object({
  data: CaseWorkPageSchema,
  meta: ResponseMetaSchema,
});
export type ListCaseCaseWorksResponse = z.infer<typeof ListCaseCaseWorksResponseSchema>;

export const CreateCaseWorkResponseSchema = tb.object({
  data: CaseWorkSchema,
  meta: ResponseMetaSchema,
});
export type CreateCaseWorkResponse = z.infer<typeof CreateCaseWorkResponseSchema>;

export const GetCaseWorkResponseSchema = tb.object({
  data: CaseWorkSchema,
  meta: ResponseMetaSchema,
});
export type GetCaseWorkResponse = z.infer<typeof GetCaseWorkResponseSchema>;

export const PatchCaseWorkResponseSchema = tb.object({
  data: CaseWorkSchema,
  meta: ResponseMetaSchema,
});
export type PatchCaseWorkResponse = z.infer<typeof PatchCaseWorkResponseSchema>;

export const ArchiveCaseWorkResponseSchema = tb.object({
  data: CaseWorkSchema,
  meta: ResponseMetaSchema,
});
export type ArchiveCaseWorkResponse = z.infer<typeof ArchiveCaseWorkResponseSchema>;

export const RestoreCaseWorkResponseSchema = tb.object({
  data: CaseWorkSchema,
  meta: ResponseMetaSchema,
});
export type RestoreCaseWorkResponse = z.infer<typeof RestoreCaseWorkResponseSchema>;

export const UseMappingPageSchema = tb.object({
  items: tb.array(UseMappingSchema, { minItems: 0, maxItems: 100 }),
  nextCursor: tb.string({ maxLength: 2000 }).nullable(),
});
export type UseMappingPage = z.infer<typeof UseMappingPageSchema>;

export const ListCaseUseMappingsResponseSchema = tb.object({
  data: UseMappingPageSchema,
  meta: ResponseMetaSchema,
});
export type ListCaseUseMappingsResponse = z.infer<typeof ListCaseUseMappingsResponseSchema>;

export const CreateUseMappingResponseSchema = tb.object({
  data: UseMappingSchema,
  meta: ResponseMetaSchema,
});
export type CreateUseMappingResponse = z.infer<typeof CreateUseMappingResponseSchema>;

export const GetUseMappingResponseSchema = tb.object({
  data: UseMappingSchema,
  meta: ResponseMetaSchema,
});
export type GetUseMappingResponse = z.infer<typeof GetUseMappingResponseSchema>;

export const PatchUseMappingResponseSchema = tb.object({
  data: UseMappingSchema,
  meta: ResponseMetaSchema,
});
export type PatchUseMappingResponse = z.infer<typeof PatchUseMappingResponseSchema>;

export const ArchiveUseMappingResponseSchema = tb.object({
  data: UseMappingSchema,
  meta: ResponseMetaSchema,
});
export type ArchiveUseMappingResponse = z.infer<typeof ArchiveUseMappingResponseSchema>;

export const RestoreUseMappingResponseSchema = tb.object({
  data: UseMappingSchema,
  meta: ResponseMetaSchema,
});
export type RestoreUseMappingResponse = z.infer<typeof RestoreUseMappingResponseSchema>;

export const SourceReferenceSummarySchema = tb.object({
  id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  agencyId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  sourceGroupId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  revision: tb.integer({ minimum: 1, maximum: 4294967295 }),
  supersedesSourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  title: tb.string({ maxLength: 500 }),
  canonicalUrl: tb
    .string({ maxLength: 4096, minLength: 1, format: 'uri', pattern: '^https?://' })
    .nullable(),
  sourceRole: tb.enum([
    'CANONICAL_RECORD',
    'PRIMARY_CORRESPONDENCE',
    'OPERATOR_INPUT',
    'DERIVED_DRAFT',
    'EXTERNAL_REFERENCE',
    'POLICY_REFERENCE',
  ]),
  accessState: tb.enum(['NOT_CHECKED', 'ACCESSIBLE_AT_CHECK', 'UNAVAILABLE_AT_CHECK']),
  contentSha256: tb.string({ maxLength: 64, minLength: 64, pattern: '^[0-9a-f]{64}$' }).nullable(),
  hashTarget: tb.enum(['RAW_FILE', 'EXTRACTED_TEXT', 'OTHER']).nullable(),
  reportedProvenance: tb.enum([
    'DOCUMENT_REVIEWED',
    'OPERATOR_REPORTED',
    'ANALYSIS',
    'MISSING',
    'CONFLICT',
  ]),
  observedAt: tb.string({ maxLength: 40, format: 'date-time' }).nullable(),
  reviewedAt: tb.string({ maxLength: 40, format: 'date-time' }).nullable(),
  createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
});
export type SourceReferenceSummary = z.infer<typeof SourceReferenceSummarySchema>;

export const SourceReferencePageSchema = tb.object({
  items: tb.array(SourceReferenceSummarySchema, { minItems: 0, maxItems: 100 }),
  nextCursor: tb.string({ maxLength: 2000 }).nullable(),
});
export type SourceReferencePage = z.infer<typeof SourceReferencePageSchema>;

export const ListSourcesResponseSchema = tb.object({
  data: SourceReferencePageSchema,
  meta: ResponseMetaSchema,
});
export type ListSourcesResponse = z.infer<typeof ListSourcesResponseSchema>;

export const CreateSourceResponseSchema = tb.object({
  data: SourceReferenceSchema,
  meta: ResponseMetaSchema,
});
export type CreateSourceResponse = z.infer<typeof CreateSourceResponseSchema>;

export const GetSourceResponseSchema = tb.object({
  data: SourceReferenceSchema,
  meta: ResponseMetaSchema,
});
export type GetSourceResponse = z.infer<typeof GetSourceResponseSchema>;

export const ReviseSourceResponseSchema = tb.object({
  data: SourceReferenceSchema,
  meta: ResponseMetaSchema,
});
export type ReviseSourceResponse = z.infer<typeof ReviseSourceResponseSchema>;

export const CaseSourcePageSchema = tb.object({
  items: tb.array(CaseSourceSchema, { minItems: 0, maxItems: 100 }),
  nextCursor: tb.string({ maxLength: 2000 }).nullable(),
});
export type CaseSourcePage = z.infer<typeof CaseSourcePageSchema>;

export const ListCaseSourcesResponseSchema = tb.object({
  data: CaseSourcePageSchema,
  meta: ResponseMetaSchema,
});
export type ListCaseSourcesResponse = z.infer<typeof ListCaseSourcesResponseSchema>;

export const LinkCaseSourceResponseSchema = tb.object({
  data: CaseSourceSchema,
  meta: ResponseMetaSchema,
});
export type LinkCaseSourceResponse = z.infer<typeof LinkCaseSourceResponseSchema>;

export const GetCaseSourceResponseSchema = tb.object({
  data: CaseSourceSchema,
  meta: ResponseMetaSchema,
});
export type GetCaseSourceResponse = z.infer<typeof GetCaseSourceResponseSchema>;

export const SetCaseSourceLinkStateResponseSchema = tb.object({
  data: CaseSourceSchema,
  meta: ResponseMetaSchema,
});
export type SetCaseSourceLinkStateResponse = z.infer<typeof SetCaseSourceLinkStateResponseSchema>;

export const CaseFactSummarySchema = tb.object({
  id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  caseId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  factGroupId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  revision: tb.integer({ minimum: 1, maximum: 4294967295 }),
  supersedesFactId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  factType: tb.enum([
    'RIGHTS_BASIS',
    'RIGHTS_SCOPE',
    'PERMISSION',
    'AV_COMPARISON',
    'EXCEPTION_REVIEW',
    'WORK_IDENTIFICATION',
    'REPORTED_IDENTIFICATION',
    'DUPLICATE_REVIEW',
    'AUTHORITY_CURRENTNESS',
  ]),
  scopeKind: tb.enum(['CASE', 'WORK', 'REPORTED_ITEM', 'USE']),
  caseWorkId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  reportedItemId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  mappingId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  provenance: tb.enum([
    'DOCUMENT_REVIEWED',
    'OPERATOR_REPORTED',
    'ANALYSIS',
    'MISSING',
    'CONFLICT',
  ]),
  resolutionState: tb.enum(['UNASSESSED', 'SUPPORTED_FOR_SCOPE', 'CONFLICT', 'WITHDRAWN']),
  createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
});
export type CaseFactSummary = z.infer<typeof CaseFactSummarySchema>;

export const CaseFactPageSchema = tb.object({
  items: tb.array(CaseFactSummarySchema, { minItems: 0, maxItems: 100 }),
  nextCursor: tb.string({ maxLength: 2000 }).nullable(),
});
export type CaseFactPage = z.infer<typeof CaseFactPageSchema>;

export const ListCaseFactsResponseSchema = tb.object({
  data: CaseFactPageSchema,
  meta: ResponseMetaSchema,
});
export type ListCaseFactsResponse = z.infer<typeof ListCaseFactsResponseSchema>;

export const CreateCaseFactResponseSchema = tb.object({
  data: CaseFactSchema,
  meta: ResponseMetaSchema,
});
export type CreateCaseFactResponse = z.infer<typeof CreateCaseFactResponseSchema>;

export const GetCaseFactResponseSchema = tb.object({
  data: CaseFactSchema,
  meta: ResponseMetaSchema,
});
export type GetCaseFactResponse = z.infer<typeof GetCaseFactResponseSchema>;

// TB-SCHEMA-API-v1.2.0 (ADR-0005, additive): the read-back of the FactSource rows recorded for one
// fact revision. Exactly the stored rows — nothing current, inferred or evaluated; 0–100 rows, the
// bound of the CreateFact/ReviseFact supports that are the only way rows are written.
export const CaseFactSourcesViewSchema = tb.object(
  {
    factId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
    sources: tb.array(FactSourceSchema, { minItems: 0, maxItems: 100 }),
  },
  {
    description:
      'The exact stored FactSource rows recorded for one CaseFact revision (factId) of this Case, in ascending createdAt, then id order; an empty list means only that no FactSource row was recorded for that revision. A historical record only: never proof or truth of the fact, a document review, SUPPORTED_FOR_SCOPE, an infringement, ownership, permission or exception finding, G1–G7 or readiness.',
  },
);
export type CaseFactSourcesView = z.infer<typeof CaseFactSourcesViewSchema>;

export const GetCaseFactSourcesResponseSchema = tb.object({
  data: CaseFactSourcesViewSchema,
  meta: ResponseMetaSchema,
});
export type GetCaseFactSourcesResponse = z.infer<typeof GetCaseFactSourcesResponseSchema>;

export const ReviseCaseFactResponseSchema = tb.object({
  data: CaseFactSchema,
  meta: ResponseMetaSchema,
});
export type ReviseCaseFactResponse = z.infer<typeof ReviseCaseFactResponseSchema>;

export const CorrespondenceSummarySchema = tb.object({
  id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  agencyId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  mailboxAddress: tb.string({ maxLength: 254, minLength: 3, format: 'email' }),
  direction: tb.enum(['INBOUND', 'OUTBOUND']),
  subject: tb.string({ maxLength: 998 }),
  messageId: tb.string({ maxLength: 998 }).nullable(),
  captureMode: tb.enum(['RAW_SOURCE', 'COPIED_FULL_TEXT', 'EXCERPT', 'OPERATOR_REPORTED']),
  bodyRole: tb.enum(['FULL_MESSAGE', 'AUTHORED_BODY', 'QUOTED_HISTORY', 'EXCERPT', 'UNKNOWN']),
  rawSourceId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }).nullable(),
  occurredAt: tb.string({ maxLength: 40, format: 'date-time' }).nullable(),
  createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
});
export type CorrespondenceSummary = z.infer<typeof CorrespondenceSummarySchema>;

export const CorrespondencePageSchema = tb.object({
  items: tb.array(CorrespondenceSummarySchema, { minItems: 0, maxItems: 100 }),
  nextCursor: tb.string({ maxLength: 2000 }).nullable(),
});
export type CorrespondencePage = z.infer<typeof CorrespondencePageSchema>;

export const ListCorrespondenceResponseSchema = tb.object({
  data: CorrespondencePageSchema,
  meta: ResponseMetaSchema,
});
export type ListCorrespondenceResponse = z.infer<typeof ListCorrespondenceResponseSchema>;

export const CaptureCorrespondenceResponseSchema = tb.object({
  data: CorrespondenceSchema,
  meta: ResponseMetaSchema,
});
export type CaptureCorrespondenceResponse = z.infer<typeof CaptureCorrespondenceResponseSchema>;

export const GetCorrespondenceResponseSchema = tb.object({
  data: CorrespondenceSchema,
  meta: ResponseMetaSchema,
});
export type GetCorrespondenceResponse = z.infer<typeof GetCorrespondenceResponseSchema>;

export const BindCaseCorrespondenceResponseSchema = tb.object({
  data: CorrespondenceBindingSchema,
  meta: ResponseMetaSchema,
});
export type BindCaseCorrespondenceResponse = z.infer<typeof BindCaseCorrespondenceResponseSchema>;

export const CorrespondenceBindingPageSchema = tb.object({
  items: tb.array(CorrespondenceBindingSchema, { minItems: 0, maxItems: 100 }),
  nextCursor: tb.string({ maxLength: 2000 }).nullable(),
});
export type CorrespondenceBindingPage = z.infer<typeof CorrespondenceBindingPageSchema>;

export const ListCaseCorrespondenceBindingsResponseSchema = tb.object({
  data: CorrespondenceBindingPageSchema,
  meta: ResponseMetaSchema,
});
export type ListCaseCorrespondenceBindingsResponse = z.infer<
  typeof ListCaseCorrespondenceBindingsResponseSchema
>;

export const PromptSnapshotSummarySchema = tb.object({
  id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  caseId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  taskType: tb.enum(['INITIAL', 'NMI_REPLY']),
  generationMode: tb.enum(['PREPARATION', 'DRAFTING']),
  version: tb.integer({ minimum: 1, maximum: 4294967295 }),
  contractVersion: tb.string({ maxLength: 80 }),
  templateVersion: tb.string({ maxLength: 80 }),
  contextRevision: tb.integer({ minimum: 1, maximum: 4294967295 }),
  dependencyDigest: tb.string({ maxLength: 64, minLength: 64, pattern: '^[0-9a-f]{64}$' }),
  promptSha256: tb.string({ maxLength: 64, minLength: 64, pattern: '^[0-9a-f]{64}$' }),
  createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
});
export type PromptSnapshotSummary = z.infer<typeof PromptSnapshotSummarySchema>;

export const PromptSnapshotPageSchema = tb.object({
  items: tb.array(PromptSnapshotSummarySchema, { minItems: 0, maxItems: 100 }),
  nextCursor: tb.string({ maxLength: 2000 }).nullable(),
});
export type PromptSnapshotPage = z.infer<typeof PromptSnapshotPageSchema>;

export const ListCasePromptsResponseSchema = tb.object({
  data: PromptSnapshotPageSchema,
  meta: ResponseMetaSchema,
});
export type ListCasePromptsResponse = z.infer<typeof ListCasePromptsResponseSchema>;

export const ImportCandidateResponseSchema = tb.object({
  data: NoticeCandidateSchema,
  meta: ResponseMetaSchema,
});
export type ImportCandidateResponse = z.infer<typeof ImportCandidateResponseSchema>;

export const NoticeCandidateSummarySchema = tb.object({
  id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  caseId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  promptSnapshotId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  version: tb.integer({ minimum: 1, maximum: 4294967295 }),
  taskType: tb.enum(['INITIAL', 'NMI_REPLY']),
  subject: tb.string({ maxLength: 998 }),
  bodySha256: tb.string({ maxLength: 64, minLength: 64, pattern: '^[0-9a-f]{64}$' }),
  artifactSha256: tb.string({ maxLength: 64, minLength: 64, pattern: '^[0-9a-f]{64}$' }),
  signatureState: tb.string({ maxLength: 40 }),
  supersededAt: tb.string({ maxLength: 40, format: 'date-time' }).nullable(),
  createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
});
export type NoticeCandidateSummary = z.infer<typeof NoticeCandidateSummarySchema>;

export const NoticeCandidatePageSchema = tb.object({
  items: tb.array(NoticeCandidateSummarySchema, { minItems: 0, maxItems: 100 }),
  nextCursor: tb.string({ maxLength: 2000 }).nullable(),
});
export type NoticeCandidatePage = z.infer<typeof NoticeCandidatePageSchema>;

export const ListCaseCandidatesResponseSchema = tb.object({
  data: NoticeCandidatePageSchema,
  meta: ResponseMetaSchema,
});
export type ListCaseCandidatesResponse = z.infer<typeof ListCaseCandidatesResponseSchema>;

export const GetCandidateResponseSchema = tb.object({
  data: NoticeCandidateSchema,
  meta: ResponseMetaSchema,
});
export type GetCandidateResponse = z.infer<typeof GetCandidateResponseSchema>;

export const ReviseCandidateResponseSchema = tb.object({
  data: NoticeCandidateSchema,
  meta: ResponseMetaSchema,
});
export type ReviseCandidateResponse = z.infer<typeof ReviseCandidateResponseSchema>;

export const SupersedeCandidateResponseSchema = tb.object({
  data: NoticeCandidateSchema,
  meta: ResponseMetaSchema,
});
export type SupersedeCandidateResponse = z.infer<typeof SupersedeCandidateResponseSchema>;

export const ValidationRunSummarySchema = tb.object({
  id: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  candidateId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  caseId: tb.string({ maxLength: 36, minLength: 36, format: 'uuid' }),
  artifactSha256: tb.string({ maxLength: 64, minLength: 64, pattern: '^[0-9a-f]{64}$' }),
  dependencyDigest: tb.string({ maxLength: 64, minLength: 64, pattern: '^[0-9a-f]{64}$' }),
  rulesetVersion: tb.string({ maxLength: 80 }),
  result: tb.enum(['TECHNICAL_PASS', 'BLOCKED', 'REVIEW_REQUIRED', 'ERROR']),
  blockerCount: tb.integer({ minimum: 0, maximum: 4294967295 }),
  reviewRequiredCount: tb.integer({ minimum: 0, maximum: 4294967295 }),
  warningCount: tb.integer({ minimum: 0, maximum: 4294967295 }),
  startedAt: tb.string({ maxLength: 40, format: 'date-time' }),
  completedAt: tb.string({ maxLength: 40, format: 'date-time' }),
  createdAt: tb.string({ maxLength: 40, format: 'date-time' }),
});
export type ValidationRunSummary = z.infer<typeof ValidationRunSummarySchema>;

export const ValidationRunPageSchema = tb.object({
  items: tb.array(ValidationRunSummarySchema, { minItems: 0, maxItems: 100 }),
  nextCursor: tb.string({ maxLength: 2000 }).nullable(),
});
export type ValidationRunPage = z.infer<typeof ValidationRunPageSchema>;

export const ListValidationRunsResponseSchema = tb.object({
  data: ValidationRunPageSchema,
  meta: ResponseMetaSchema,
});
export type ListValidationRunsResponse = z.infer<typeof ListValidationRunsResponseSchema>;

export const ValidationIssuePageSchema = tb.object({
  items: tb.array(ValidationIssueSchema, { minItems: 0, maxItems: 100 }),
  nextCursor: tb.string({ maxLength: 2000 }).nullable(),
});
export type ValidationIssuePage = z.infer<typeof ValidationIssuePageSchema>;

export const ListValidationIssuesResponseSchema = tb.object({
  data: ValidationIssuePageSchema,
  meta: ResponseMetaSchema,
});
export type ListValidationIssuesResponse = z.infer<typeof ListValidationIssuesResponseSchema>;

export const CaptureCandidateAssessmentResponseSchema = tb.object({
  data: CandidateAssessmentSchema,
  meta: ResponseMetaSchema,
});
export type CaptureCandidateAssessmentResponse = z.infer<
  typeof CaptureCandidateAssessmentResponseSchema
>;

export const CandidateAssessmentPageSchema = tb.object({
  items: tb.array(CandidateAssessmentSchema, { minItems: 0, maxItems: 100 }),
  nextCursor: tb.string({ maxLength: 2000 }).nullable(),
});
export type CandidateAssessmentPage = z.infer<typeof CandidateAssessmentPageSchema>;

export const ListCandidateAssessmentsResponseSchema = tb.object({
  data: CandidateAssessmentPageSchema,
  meta: ResponseMetaSchema,
});
export type ListCandidateAssessmentsResponse = z.infer<
  typeof ListCandidateAssessmentsResponseSchema
>;

export const GetCandidateReadinessResponseSchema = tb.object({
  data: ReadinessSchema,
  meta: ResponseMetaSchema,
});
export type GetCandidateReadinessResponse = z.infer<typeof GetCandidateReadinessResponseSchema>;

export const ExportUnsignedCandidateResponseSchema = tb.object({
  data: UnsignedExportSchema,
  meta: ResponseMetaSchema,
});
export type ExportUnsignedCandidateResponse = z.infer<typeof ExportUnsignedCandidateResponseSchema>;

export const AuditEventPageSchema = tb.object({
  items: tb.array(AuditEventSchema, { minItems: 0, maxItems: 100 }),
  nextCursor: tb.string({ maxLength: 2000 }).nullable(),
});
export type AuditEventPage = z.infer<typeof AuditEventPageSchema>;

export const ListAuditEventsResponseSchema = tb.object({
  data: AuditEventPageSchema,
  meta: ResponseMetaSchema,
});
export type ListAuditEventsResponse = z.infer<typeof ListAuditEventsResponseSchema>;
