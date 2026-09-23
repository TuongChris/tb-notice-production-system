# Database Schema v1 — field dictionary

Release: **TB-SCHEMA-API-v1.0.0**. Status: **DESIGN_ARTIFACT; NO_DATABASE_MIGRATION_EXECUTED**.

Target: MySQL **8.4**, InnoDB, `utf8mb4_0900_bin`. This is a local-first selection, not a verified Hostinger production engine. Prisma schema targets v7 syntax; connection URL belongs in `prisma.config.ts`.

This dictionary is generated from the same model catalog as `schema.prisma`. A NOT NULL field is a storage requirement, not necessarily a client-supplied create field. Server-generated IDs, timestamps, versions, hashes and states are excluded from writable DTOs. See OpenAPI for the request allowlists.

## Summary

| Model | SQL table | Mutability | Purpose |
|---|---|---|---|
| `User` | `users` | Append-only or dedicated lifecycle command | App operator, never automatically a signer. Bootstrap via local CLI, no public user creation API. |
| `AuthSession` | `auth_sessions` | Append-only or dedicated lifecycle command | Store only hashes, never raw browser tokens. |
| `Agency` | `agencies` | Version-checked mutable; see freeze rules | Directory/configuration state is not legal authority. fieldAttributions has schema and source checks in service. |
| `Owner` | `owners` | Version-checked mutable; see freeze rules | Client namespace, not proof of work ownership. |
| `LegalSubject` | `legal_subjects` | Version-checked mutable; see freeze rules | Exact person or legal entity. Names/registration are matching hints, not automatic global deduplication. |
| `OwnerSubject` | `owner_subjects` | Version-checked mutable; see freeze rules |  |
| `Signer` | `signers` | Version-checked mutable; see freeze rules | Person in an agency capacity. No signature blob, adoption, or send endpoint. |
| `Route` | `routes` | Version-checked mutable; see freeze rules |  |
| `Mandate` | `mandates` | Version-checked mutable; see freeze rules |  |
| `MandateVersion` | `mandate_versions` | Version-checked mutable; see freeze rules | Freeze parent plus all coverage/signer children atomically before selection; successors do not automatically legally supersede predecessors. |
| `MandateCoverage` | `mandate_coverages` | Version-checked mutable; see freeze rules | Draft-editable only while parent version DRAFT. Source-backed legal changes are append-only AuthorityEvents. |
| `CoverageSigner` | `coverage_signers` | Version-checked mutable; see freeze rules | Never confers rights merely from insertion; parent version must be draft to alter this row. |
| `AuthorityEvent` | `authority_events` | Append-only or dedicated lifecycle command | Records observed currentness/revocation etc. Nullable coverage means whole mandate only if source supports it. No legal action is executed. |
| `CaseRecord` | `cases` | Version-checked mutable; see freeze rules | Business case, not an automated legal verdict. Canonical code only binds to an actual sourced existing/registered code. |
| `CaseAuthoritySelection` | `case_authority_selections` | Append-only or dedicated lifecycle command | Immutable explicit selection; a new default signer does not rewrite this selection. Server checks case route equals selected route. |
| `CaseAuthorityCoverage` | `case_authority_coverages` | Append-only or dedicated lifecycle command | One or more precisely scoped coverages. Do not union grants into unsupported authority. |
| `ReportedItem` | `reported_items` | Version-checked mutable; see freeze rules | Only YouTube video formats in V1. Identifier remains case-sensitive. No global uniqueness across cases. |
| `CaseWork` | `case_works` | Version-checked mutable; see freeze rules |  |
| `UseMapping` | `use_mappings` | Version-checked mutable; see freeze rules | Integer milliseconds exposed as decimal strings. Duration equality is never AV verification. |
| `SourceReference` | `source_references` | Append-only or dedicated lifecycle command | Immutable capture metadata, not a guarantee of truth. A URL hash is not a content hash. Null agency only for public/shared-scoped sources, not permission to cross agencies. |
| `CaseSource` | `case_sources` | Version-checked mutable; see freeze rules |  |
| `CaseFact` | `case_facts` | Append-only or dedicated lifecycle command | Append-only revisions. The value schema is selected by FactType. Latest successor is current; WITHDRAWN is a retraction, not deletion. |
| `FactSource` | `fact_sources` | Append-only or dedicated lifecycle command | Server must check CaseFact.caseId = CaseSource.caseId. Named supporting assertion is not authentication. |
| `Correspondence` | `correspondence` | Append-only or dedicated lifecycle command | Preserve actual observations; not a send API. Source identity hash derived from a trustworthy provider/capture identity, never subject or Message-ID alone. |
| `CorrespondenceBinding` | `correspondence_bindings` | Append-only or dedicated lifecycle command | Append-only semantic binding. Corrections create successors; one transmission may bind to multiple URLs. Outcome requires a specific item in V1. |
| `PromptSnapshot` | `prompt_snapshots` | Append-only or dedicated lifecycle command | Exact immutable prompt/context. SHA-256 of exact stored UTF-8 text, not a legal attestation. |
| `NoticeCandidate` | `notice_candidates` | Append-only or dedicated lifecycle command | Content immutable at insert. PATCH body is forbidden. Only supersededAt/reason may be set by dedicated command. Artifact hash binds body, subject, envelope, planned documents and signature slot; does not prove send. |
| `ValidationRun` | `validation_runs` | Append-only or dedicated lifecycle command | Server-generated structural/heuristic checks only. Never implies G1-G6 were reviewed substantively. |
| `ValidationIssue` | `validation_issues` | Append-only or dedicated lifecycle command |  |
| `CandidateAssessment` | `candidate_assessments` | Append-only or dedicated lifecycle command | Attributable source-bound G1-G6 review capture, not an automatic decision and never G7. Source inclusion alone cannot verify legal facts. POST is an operator report of an actual assessment, not a request for fabricated PASS. |
| `AssessmentSource` | `assessment_sources` | Append-only or dedicated lifecycle command | Backend checks the case and scope of both endpoints. |
| `AuditEvent` | `audit_events` | Append-only or dedicated lifecycle command | Append-only application audit, not tamper-proof evidence. Passwords, session tokens and raw confidential bodies excluded. |
| `IdempotencyRecord` | `idempotency_records` | Append-only or dedicated lifecycle command | Same actor + operation + key + payload replays same response; failed tx leaves no committed result. Expiry is bounded replay horizon, not permanent deduplication. |

## User — `users`

App operator, never automatically a signer. Bootstrap via local CLI, no public user creation API.

| Field | SQL type | NULL | Default/owner |
|---|---|---:|---|
| `id` / `id` | `CHAR(36)` | No | `uuid()` |
| `email` / `email` | `VARCHAR(254)` | No | `—` |
| `displayName` / `display_name` | `VARCHAR(160)` | No | `—` |
| `passwordHash` / `password_hash` | `VARCHAR(255)` | No | `—` |
| `enabled` / `enabled` | `BOOLEAN` | No | `true` |
| `sessionEpoch` / `session_epoch` | `INT UNSIGNED` | No | `1` |
| `passwordChangedAt` / `password_changed_at` | `DATETIME(3)` | Yes | `—` |
| `disabledAt` / `disabled_at` | `DATETIME(3)` | Yes | `—` |
| `createdAt` / `created_at` | `DATETIME(3)` | No | `now()` |

**Unique constraints:** `email`.
**Indexes:** FK backing indexes plus primary/unique indexes.

**Foreign keys (all RESTRICT):**

## AuthSession — `auth_sessions`

Store only hashes, never raw browser tokens.

| Field | SQL type | NULL | Default/owner |
|---|---|---:|---|
| `id` / `id` | `CHAR(36)` | No | `uuid()` |
| `userId` / `user_id` | `CHAR(36)` | No | `—` |
| `tokenHash` / `token_hash` | `VARCHAR(64)` | No | `—` |
| `csrfTokenHash` / `csrf_token_hash` | `VARCHAR(64)` | No | `—` |
| `expiresAt` / `expires_at` | `DATETIME(3)` | No | `—` |
| `lastSeenAt` / `last_seen_at` | `DATETIME(3)` | No | `—` |
| `revokedAt` / `revoked_at` | `DATETIME(3)` | Yes | `—` |
| `createdAt` / `created_at` | `DATETIME(3)` | No | `now()` |

**Unique constraints:** `tokenHash`.
**Indexes:** `userId, expiresAt`; `expiresAt`.

**Foreign keys (all RESTRICT):**
- `userId` → `User(id)`.

## Agency — `agencies`

Directory/configuration state is not legal authority. fieldAttributions has schema and source checks in service.

| Field | SQL type | NULL | Default/owner |
|---|---|---:|---|
| `id` / `id` | `CHAR(36)` | No | `uuid()` |
| `displayName` / `display_name` | `VARCHAR(200)` | No | `—` |
| `legalName` / `legal_name` | `VARCHAR(255)` | Yes | `—` |
| `organizationType` / `organization_type` | `VARCHAR(50)` | Yes | `—` |
| `jurisdictionCountry` / `jurisdiction_country` | `VARCHAR(2)` | Yes | `—` |
| `registrationAuthority` / `registration_authority` | `VARCHAR(200)` | Yes | `—` |
| `registrationNumber` / `registration_number` | `VARCHAR(100)` | Yes | `—` |
| `websiteUrl` / `website_url` | `VARCHAR(2048)` | Yes | `—` |
| `copyrightEmail` / `copyright_email` | `VARCHAR(254)` | Yes | `—` |
| `verificationEmail` / `verification_email` | `VARCHAR(254)` | Yes | `—` |
| `postalAddress` / `postal_address` | `JSON` | Yes | `—` |
| `phone` / `phone` | `VARCHAR(80)` | Yes | `—` |
| `driveRootUrl` / `drive_root_url` | `VARCHAR(2048)` | Yes | `—` |
| `masterUrl` / `master_url` | `VARCHAR(2048)` | Yes | `—` |
| `startHereUrl` / `start_here_url` | `VARCHAR(2048)` | Yes | `—` |
| `fieldAttributions` / `field_attributions` | `JSON` | Yes | `—` |
| `recordState` / `record_state` | `ENUM('DRAFT','ACTIVE','ARCHIVED')` | No | `DRAFT` |
| `canonicalCode` / `canonical_code` | `VARCHAR(100)` | Yes | `—` |
| `canonicalSourceId` / `canonical_source_id` | `CHAR(36)` | Yes | `—` |
| `bindingState` / `binding_state` | `ENUM('LOCAL_ONLY','SOURCE_REFERENCED','DIVERGENT')` | No | `LOCAL_ONLY` |
| `notes` / `notes` | `LONGTEXT` | Yes | `—` |
| `archivedAt` / `archived_at` | `DATETIME(3)` | Yes | `—` |
| `archiveReason` / `archive_reason` | `LONGTEXT` | Yes | `—` |
| `createdAt` / `created_at` | `DATETIME(3)` | No | `now()` |
| `createdById` / `created_by_id` | `CHAR(36)` | No | `—` |
| `updatedAt` / `updated_at` | `DATETIME(3)` | No | `@updatedAt` |
| `updatedById` / `updated_by_id` | `CHAR(36)` | No | `—` |
| `rowVersion` / `row_version` | `INT UNSIGNED` | No | `1` |

**Unique constraints:** `canonicalCode`.
**Indexes:** `recordState, createdAt`.

**Foreign keys (all RESTRICT):**
- `createdById` → `User(id)`.
- `updatedById` → `User(id)`.
- `canonicalSourceId` → `SourceReference(id)`.

## Owner — `owners`

Client namespace, not proof of work ownership.

| Field | SQL type | NULL | Default/owner |
|---|---|---:|---|
| `id` / `id` | `CHAR(36)` | No | `uuid()` |
| `displayName` / `display_name` | `VARCHAR(200)` | No | `—` |
| `aliases` / `aliases` | `JSON` | Yes | `—` |
| `contactName` / `contact_name` | `VARCHAR(200)` | Yes | `—` |
| `contactEmail` / `contact_email` | `VARCHAR(254)` | Yes | `—` |
| `sourceChannels` / `source_channels` | `JSON` | Yes | `—` |
| `websiteUrl` / `website_url` | `VARCHAR(2048)` | Yes | `—` |
| `preferredLanguage` / `preferred_language` | `VARCHAR(20)` | Yes | `—` |
| `driveFolderUrl` / `drive_folder_url` | `VARCHAR(2048)` | Yes | `—` |
| `recordState` / `record_state` | `ENUM('DRAFT','ACTIVE','ARCHIVED')` | No | `DRAFT` |
| `canonicalCode` / `canonical_code` | `VARCHAR(100)` | Yes | `—` |
| `canonicalSourceId` / `canonical_source_id` | `CHAR(36)` | Yes | `—` |
| `bindingState` / `binding_state` | `ENUM('LOCAL_ONLY','SOURCE_REFERENCED','DIVERGENT')` | No | `LOCAL_ONLY` |
| `notes` / `notes` | `LONGTEXT` | Yes | `—` |
| `archivedAt` / `archived_at` | `DATETIME(3)` | Yes | `—` |
| `archiveReason` / `archive_reason` | `LONGTEXT` | Yes | `—` |
| `createdAt` / `created_at` | `DATETIME(3)` | No | `now()` |
| `createdById` / `created_by_id` | `CHAR(36)` | No | `—` |
| `updatedAt` / `updated_at` | `DATETIME(3)` | No | `@updatedAt` |
| `updatedById` / `updated_by_id` | `CHAR(36)` | No | `—` |
| `rowVersion` / `row_version` | `INT UNSIGNED` | No | `1` |

**Unique constraints:** `canonicalCode`.
**Indexes:** `recordState, createdAt`.

**Foreign keys (all RESTRICT):**
- `createdById` → `User(id)`.
- `updatedById` → `User(id)`.
- `canonicalSourceId` → `SourceReference(id)`.

## LegalSubject — `legal_subjects`

Exact person or legal entity. Names/registration are matching hints, not automatic global deduplication.

| Field | SQL type | NULL | Default/owner |
|---|---|---:|---|
| `id` / `id` | `CHAR(36)` | No | `uuid()` |
| `subjectType` / `subject_type` | `ENUM('INDIVIDUAL','LEGAL_ENTITY','OTHER')` | No | `—` |
| `legalName` / `legal_name` | `VARCHAR(255)` | No | `—` |
| `aliases` / `aliases` | `JSON` | Yes | `—` |
| `jurisdictionCountry` / `jurisdiction_country` | `VARCHAR(2)` | Yes | `—` |
| `legalForm` / `legal_form` | `VARCHAR(80)` | Yes | `—` |
| `registrationAuthority` / `registration_authority` | `VARCHAR(200)` | Yes | `—` |
| `registrationNumber` / `registration_number` | `VARCHAR(100)` | Yes | `—` |
| `contactEmail` / `contact_email` | `VARCHAR(254)` | Yes | `—` |
| `postalAddress` / `postal_address` | `JSON` | Yes | `—` |
| `fieldAttributions` / `field_attributions` | `JSON` | Yes | `—` |
| `identityReviewState` / `identity_review_state` | `ENUM('UNREVIEWED','REVIEWED_WITH_LIMITS','CONFLICT')` | No | `UNREVIEWED` |
| `recordState` / `record_state` | `ENUM('DRAFT','ACTIVE','ARCHIVED')` | No | `DRAFT` |
| `canonicalCode` / `canonical_code` | `VARCHAR(100)` | Yes | `—` |
| `canonicalSourceId` / `canonical_source_id` | `CHAR(36)` | Yes | `—` |
| `bindingState` / `binding_state` | `ENUM('LOCAL_ONLY','SOURCE_REFERENCED','DIVERGENT')` | No | `LOCAL_ONLY` |
| `notes` / `notes` | `LONGTEXT` | Yes | `—` |
| `archivedAt` / `archived_at` | `DATETIME(3)` | Yes | `—` |
| `archiveReason` / `archive_reason` | `LONGTEXT` | Yes | `—` |
| `createdAt` / `created_at` | `DATETIME(3)` | No | `now()` |
| `createdById` / `created_by_id` | `CHAR(36)` | No | `—` |
| `updatedAt` / `updated_at` | `DATETIME(3)` | No | `@updatedAt` |
| `updatedById` / `updated_by_id` | `CHAR(36)` | No | `—` |
| `rowVersion` / `row_version` | `INT UNSIGNED` | No | `1` |

**Unique constraints:** `canonicalCode`.
**Indexes:** `legalName`; `registrationAuthority, registrationNumber`.

**Foreign keys (all RESTRICT):**
- `createdById` → `User(id)`.
- `updatedById` → `User(id)`.
- `canonicalSourceId` → `SourceReference(id)`.

## OwnerSubject — `owner_subjects`



| Field | SQL type | NULL | Default/owner |
|---|---|---:|---|
| `id` / `id` | `CHAR(36)` | No | `uuid()` |
| `ownerId` / `owner_id` | `CHAR(36)` | No | `—` |
| `legalSubjectId` / `legal_subject_id` | `CHAR(36)` | No | `—` |
| `relationshipLabel` / `relationship_label` | `VARCHAR(200)` | Yes | `—` |
| `sourceId` / `source_id` | `CHAR(36)` | Yes | `—` |
| `linkState` / `link_state` | `ENUM('LINKED','PAUSED','UNLINKED')` | No | `LINKED` |
| `unlinkedAt` / `unlinked_at` | `DATETIME(3)` | Yes | `—` |
| `unlinkReason` / `unlink_reason` | `LONGTEXT` | Yes | `—` |
| `createdAt` / `created_at` | `DATETIME(3)` | No | `now()` |
| `createdById` / `created_by_id` | `CHAR(36)` | No | `—` |
| `updatedAt` / `updated_at` | `DATETIME(3)` | No | `@updatedAt` |
| `updatedById` / `updated_by_id` | `CHAR(36)` | No | `—` |
| `rowVersion` / `row_version` | `INT UNSIGNED` | No | `1` |

**Unique constraints:** `ownerId, legalSubjectId`.
**Indexes:** `legalSubjectId, linkState`.

**Foreign keys (all RESTRICT):**
- `createdById` → `User(id)`.
- `updatedById` → `User(id)`.
- `ownerId` → `Owner(id)`.
- `legalSubjectId` → `LegalSubject(id)`.
- `sourceId` → `SourceReference(id)`.

## Signer — `signers`

Person in an agency capacity. No signature blob, adoption, or send endpoint.

| Field | SQL type | NULL | Default/owner |
|---|---|---:|---|
| `id` / `id` | `CHAR(36)` | No | `uuid()` |
| `agencyId` / `agency_id` | `CHAR(36)` | No | `—` |
| `fullLegalName` / `full_legal_name` | `VARCHAR(255)` | No | `—` |
| `title` / `title` | `VARCHAR(200)` | Yes | `—` |
| `contactEmail` / `contact_email` | `VARCHAR(254)` | Yes | `—` |
| `identitySourceId` / `identity_source_id` | `CHAR(36)` | Yes | `—` |
| `delegationSourceId` / `delegation_source_id` | `CHAR(36)` | Yes | `—` |
| `operationalState` / `operational_state` | `ENUM('DRAFT','AVAILABLE','PAUSED','ENDED')` | No | `DRAFT` |
| `canonicalCode` / `canonical_code` | `VARCHAR(100)` | Yes | `—` |
| `canonicalSourceId` / `canonical_source_id` | `CHAR(36)` | Yes | `—` |
| `bindingState` / `binding_state` | `ENUM('LOCAL_ONLY','SOURCE_REFERENCED','DIVERGENT')` | No | `LOCAL_ONLY` |
| `notes` / `notes` | `LONGTEXT` | Yes | `—` |
| `archivedAt` / `archived_at` | `DATETIME(3)` | Yes | `—` |
| `archiveReason` / `archive_reason` | `LONGTEXT` | Yes | `—` |
| `createdAt` / `created_at` | `DATETIME(3)` | No | `now()` |
| `createdById` / `created_by_id` | `CHAR(36)` | No | `—` |
| `updatedAt` / `updated_at` | `DATETIME(3)` | No | `@updatedAt` |
| `updatedById` / `updated_by_id` | `CHAR(36)` | No | `—` |
| `rowVersion` / `row_version` | `INT UNSIGNED` | No | `1` |

**Unique constraints:** `id, agencyId`; `canonicalCode`.
**Indexes:** `agencyId, operationalState`.

**Foreign keys (all RESTRICT):**
- `createdById` → `User(id)`.
- `updatedById` → `User(id)`.
- `agencyId` → `Agency(id)`.
- `identitySourceId` → `SourceReference(id)`.
- `delegationSourceId` → `SourceReference(id)`.
- `canonicalSourceId` → `SourceReference(id)`.

## Route — `routes`



| Field | SQL type | NULL | Default/owner |
|---|---|---:|---|
| `id` / `id` | `CHAR(36)` | No | `uuid()` |
| `agencyId` / `agency_id` | `CHAR(36)` | No | `—` |
| `ownerSubjectId` / `owner_subject_id` | `CHAR(36)` | No | `—` |
| `platform` / `platform` | `ENUM('YOUTUBE')` | No | `YOUTUBE` |
| `linkState` / `link_state` | `ENUM('LINKED','PAUSED','UNLINKED')` | No | `LINKED` |
| `defaultSignerId` / `default_signer_id` | `CHAR(36)` | Yes | `—` |
| `preferredCoverageId` / `preferred_coverage_id` | `CHAR(36)` | Yes | `—` |
| `casePrefixHint` / `case_prefix_hint` | `VARCHAR(40)` | Yes | `—` |
| `unlinkedAt` / `unlinked_at` | `DATETIME(3)` | Yes | `—` |
| `stateReason` / `state_reason` | `LONGTEXT` | Yes | `—` |
| `canonicalCode` / `canonical_code` | `VARCHAR(100)` | Yes | `—` |
| `canonicalSourceId` / `canonical_source_id` | `CHAR(36)` | Yes | `—` |
| `bindingState` / `binding_state` | `ENUM('LOCAL_ONLY','SOURCE_REFERENCED','DIVERGENT')` | No | `LOCAL_ONLY` |
| `notes` / `notes` | `LONGTEXT` | Yes | `—` |
| `archivedAt` / `archived_at` | `DATETIME(3)` | Yes | `—` |
| `archiveReason` / `archive_reason` | `LONGTEXT` | Yes | `—` |
| `createdAt` / `created_at` | `DATETIME(3)` | No | `now()` |
| `createdById` / `created_by_id` | `CHAR(36)` | No | `—` |
| `updatedAt` / `updated_at` | `DATETIME(3)` | No | `@updatedAt` |
| `updatedById` / `updated_by_id` | `CHAR(36)` | No | `—` |
| `rowVersion` / `row_version` | `INT UNSIGNED` | No | `1` |

**Unique constraints:** `agencyId, ownerSubjectId, platform`; `id, agencyId, platform`; `id, agencyId`; `canonicalCode`.
**Indexes:** `ownerSubjectId, linkState`.

**Foreign keys (all RESTRICT):**
- `createdById` → `User(id)`.
- `updatedById` → `User(id)`.
- `agencyId` → `Agency(id)`.
- `ownerSubjectId` → `OwnerSubject(id)`.
- `defaultSignerId, agencyId` → `Signer(id, agencyId)`.
- `preferredCoverageId` → `MandateCoverage(id)`.
- `canonicalSourceId` → `SourceReference(id)`.

## Mandate — `mandates`



| Field | SQL type | NULL | Default/owner |
|---|---|---:|---|
| `id` / `id` | `CHAR(36)` | No | `uuid()` |
| `agencyId` / `agency_id` | `CHAR(36)` | No | `—` |
| `label` / `label` | `VARCHAR(255)` | No | `—` |
| `externalReference` / `external_reference` | `VARCHAR(191)` | Yes | `—` |
| `description` / `description` | `LONGTEXT` | Yes | `—` |
| `canonicalCode` / `canonical_code` | `VARCHAR(100)` | Yes | `—` |
| `canonicalSourceId` / `canonical_source_id` | `CHAR(36)` | Yes | `—` |
| `bindingState` / `binding_state` | `ENUM('LOCAL_ONLY','SOURCE_REFERENCED','DIVERGENT')` | No | `LOCAL_ONLY` |
| `notes` / `notes` | `LONGTEXT` | Yes | `—` |
| `archivedAt` / `archived_at` | `DATETIME(3)` | Yes | `—` |
| `archiveReason` / `archive_reason` | `LONGTEXT` | Yes | `—` |
| `createdAt` / `created_at` | `DATETIME(3)` | No | `now()` |
| `createdById` / `created_by_id` | `CHAR(36)` | No | `—` |
| `updatedAt` / `updated_at` | `DATETIME(3)` | No | `@updatedAt` |
| `updatedById` / `updated_by_id` | `CHAR(36)` | No | `—` |
| `rowVersion` / `row_version` | `INT UNSIGNED` | No | `1` |

**Unique constraints:** `id, agencyId`; `canonicalCode`.
**Indexes:** `agencyId, createdAt`.

**Foreign keys (all RESTRICT):**
- `createdById` → `User(id)`.
- `updatedById` → `User(id)`.
- `agencyId` → `Agency(id)`.
- `canonicalSourceId` → `SourceReference(id)`.

## MandateVersion — `mandate_versions`

Freeze parent plus all coverage/signer children atomically before selection; successors do not automatically legally supersede predecessors.

| Field | SQL type | NULL | Default/owner |
|---|---|---:|---|
| `id` / `id` | `CHAR(36)` | No | `uuid()` |
| `mandateId` / `mandate_id` | `CHAR(36)` | No | `—` |
| `agencyId` / `agency_id` | `CHAR(36)` | No | `—` |
| `version` / `version` | `INT UNSIGNED` | No | `—` |
| `versionState` / `version_state` | `ENUM('DRAFT','FROZEN')` | No | `DRAFT` |
| `changeKind` / `change_kind` | `ENUM('NEW_AUTHORIZATION','AMENDMENT','DOCUMENT_CAPTURE','METADATA_CORRECTION')` | No | `—` |
| `predecessorId` / `predecessor_id` | `CHAR(36)` | Yes | `—` |
| `primarySourceId` / `primary_source_id` | `CHAR(36)` | Yes | `—` |
| `additionalSourceRefs` / `additional_source_refs` | `JSON` | Yes | `—` |
| `documentState` / `document_state` | `ENUM('MISSING','DRAFT','SIGNED_APPEARING','UNKNOWN')` | No | `UNKNOWN` |
| `sourceReviewState` / `source_review_state` | `ENUM('UNREVIEWED','REVIEWED_WITH_LIMITS','CONFLICT')` | No | `UNREVIEWED` |
| `signedDatesRaw` / `signed_dates_raw` | `JSON` | Yes | `—` |
| `validityModel` / `validity_model` | `ENUM('UNKNOWN','FIXED_TERM','UNTIL_TERMINATED')` | No | `UNKNOWN` |
| `effectiveOn` / `effective_on` | `DATE` | Yes | `—` |
| `expiresOn` / `expires_on` | `DATE` | Yes | `—` |
| `validityNotes` / `validity_notes` | `LONGTEXT` | Yes | `—` |
| `frozenAt` / `frozen_at` | `DATETIME(3)` | Yes | `—` |
| `changeReason` / `change_reason` | `LONGTEXT` | No | `—` |
| `createdAt` / `created_at` | `DATETIME(3)` | No | `now()` |
| `createdById` / `created_by_id` | `CHAR(36)` | No | `—` |
| `updatedAt` / `updated_at` | `DATETIME(3)` | No | `@updatedAt` |
| `updatedById` / `updated_by_id` | `CHAR(36)` | No | `—` |
| `rowVersion` / `row_version` | `INT UNSIGNED` | No | `1` |

**Unique constraints:** `mandateId, version`; `id, agencyId`.
**Indexes:** FK backing indexes plus primary/unique indexes.

**Foreign keys (all RESTRICT):**
- `createdById` → `User(id)`.
- `updatedById` → `User(id)`.
- `mandateId, agencyId` → `Mandate(id, agencyId)`.
- `predecessorId` → `MandateVersion(id)`.
- `primarySourceId` → `SourceReference(id)`.

## MandateCoverage — `mandate_coverages`

Draft-editable only while parent version DRAFT. Source-backed legal changes are append-only AuthorityEvents.

| Field | SQL type | NULL | Default/owner |
|---|---|---:|---|
| `id` / `id` | `CHAR(36)` | No | `uuid()` |
| `mandateVersionId` / `mandate_version_id` | `CHAR(36)` | No | `—` |
| `routeId` / `route_id` | `CHAR(36)` | No | `—` |
| `agencyId` / `agency_id` | `CHAR(36)` | No | `—` |
| `coverageLabel` / `coverage_label` | `VARCHAR(191)` | No | `—` |
| `coveredWorksScope` / `covered_works_scope` | `LONGTEXT` | Yes | `—` |
| `territorialScope` / `territorial_scope` | `LONGTEXT` | Yes | `—` |
| `actionScope` / `action_scope` | `JSON` | Yes | `—` |
| `exclusions` / `exclusions` | `LONGTEXT` | Yes | `—` |
| `conditions` / `conditions` | `LONGTEXT` | Yes | `—` |
| `exclusivity` / `exclusivity` | `ENUM('UNKNOWN','EXCLUSIVE','NON_EXCLUSIVE')` | No | `UNKNOWN` |
| `effectiveOn` / `effective_on` | `DATE` | Yes | `—` |
| `expiresOn` / `expires_on` | `DATE` | Yes | `—` |
| `basisSourceId` / `basis_source_id` | `CHAR(36)` | Yes | `—` |
| `predecessorCoverageId` / `predecessor_coverage_id` | `CHAR(36)` | Yes | `—` |
| `createdAt` / `created_at` | `DATETIME(3)` | No | `now()` |
| `createdById` / `created_by_id` | `CHAR(36)` | No | `—` |
| `updatedAt` / `updated_at` | `DATETIME(3)` | No | `@updatedAt` |
| `updatedById` / `updated_by_id` | `CHAR(36)` | No | `—` |
| `rowVersion` / `row_version` | `INT UNSIGNED` | No | `1` |

**Unique constraints:** `routeId, mandateVersionId, coverageLabel`; `id, agencyId`; `id, routeId, agencyId`.
**Indexes:** FK backing indexes plus primary/unique indexes.

**Foreign keys (all RESTRICT):**
- `createdById` → `User(id)`.
- `updatedById` → `User(id)`.
- `mandateVersionId, agencyId` → `MandateVersion(id, agencyId)`.
- `routeId, agencyId` → `Route(id, agencyId)`.
- `basisSourceId` → `SourceReference(id)`.
- `predecessorCoverageId` → `MandateCoverage(id)`.

## CoverageSigner — `coverage_signers`

Never confers rights merely from insertion; parent version must be draft to alter this row.

| Field | SQL type | NULL | Default/owner |
|---|---|---:|---|
| `id` / `id` | `CHAR(36)` | No | `uuid()` |
| `coverageId` / `coverage_id` | `CHAR(36)` | No | `—` |
| `agencyId` / `agency_id` | `CHAR(36)` | No | `—` |
| `signerId` / `signer_id` | `CHAR(36)` | No | `—` |
| `capacity` / `capacity` | `VARCHAR(120)` | No | `—` |
| `actionScope` / `action_scope` | `JSON` | Yes | `—` |
| `sourceId` / `source_id` | `CHAR(36)` | Yes | `—` |
| `effectiveOn` / `effective_on` | `DATE` | Yes | `—` |
| `endsOn` / `ends_on` | `DATE` | Yes | `—` |
| `limitations` / `limitations` | `LONGTEXT` | Yes | `—` |
| `createdAt` / `created_at` | `DATETIME(3)` | No | `now()` |
| `createdById` / `created_by_id` | `CHAR(36)` | No | `—` |
| `updatedAt` / `updated_at` | `DATETIME(3)` | No | `@updatedAt` |
| `updatedById` / `updated_by_id` | `CHAR(36)` | No | `—` |
| `rowVersion` / `row_version` | `INT UNSIGNED` | No | `1` |

**Unique constraints:** `coverageId, signerId, capacity`.
**Indexes:** FK backing indexes plus primary/unique indexes.

**Foreign keys (all RESTRICT):**
- `createdById` → `User(id)`.
- `updatedById` → `User(id)`.
- `coverageId, agencyId` → `MandateCoverage(id, agencyId)`.
- `signerId, agencyId` → `Signer(id, agencyId)`.
- `sourceId` → `SourceReference(id)`.

## AuthorityEvent — `authority_events`

Records observed currentness/revocation etc. Nullable coverage means whole mandate only if source supports it. No legal action is executed.

| Field | SQL type | NULL | Default/owner |
|---|---|---:|---|
| `id` / `id` | `CHAR(36)` | No | `uuid()` |
| `mandateId` / `mandate_id` | `CHAR(36)` | No | `—` |
| `agencyId` / `agency_id` | `CHAR(36)` | No | `—` |
| `coverageId` / `coverage_id` | `CHAR(36)` | Yes | `—` |
| `eventType` / `event_type` | `ENUM('CURRENTNESS_RECORDED','REVOCATION','TERMINATION','SUPERSESSION','RESIGNATION','CORRECTION')` | No | `—` |
| `sourceId` / `source_id` | `CHAR(36)` | No | `—` |
| `provenance` / `provenance` | `ENUM('DOCUMENT_REVIEWED','OPERATOR_REPORTED','ANALYSIS','MISSING','CONFLICT')` | No | `—` |
| `effectiveOn` / `effective_on` | `DATE` | Yes | `—` |
| `effectiveAt` / `effective_at` | `DATETIME(3)` | Yes | `—` |
| `rawEffectiveText` / `raw_effective_text` | `VARCHAR(500)` | Yes | `—` |
| `scopeText` / `scope_text` | `LONGTEXT` | No | `—` |
| `supersedesEventId` / `supersedes_event_id` | `CHAR(36)` | Yes | `—` |
| `interpretation` / `interpretation` | `LONGTEXT` | No | `—` |
| `createdAt` / `created_at` | `DATETIME(3)` | No | `now()` |
| `createdById` / `created_by_id` | `CHAR(36)` | No | `—` |

**Unique constraints:** `supersedesEventId`.
**Indexes:** `mandateId, createdAt`; `coverageId, createdAt`.

**Foreign keys (all RESTRICT):**
- `createdById` → `User(id)`.
- `mandateId, agencyId` → `Mandate(id, agencyId)`.
- `coverageId, agencyId` → `MandateCoverage(id, agencyId)`.
- `sourceId` → `SourceReference(id)`.
- `supersedesEventId` → `AuthorityEvent(id)`.

## CaseRecord — `cases`

Business case, not an automated legal verdict. Canonical code only binds to an actual sourced existing/registered code.

| Field | SQL type | NULL | Default/owner |
|---|---|---:|---|
| `id` / `id` | `CHAR(36)` | No | `uuid()` |
| `agencyId` / `agency_id` | `CHAR(36)` | No | `—` |
| `platform` / `platform` | `ENUM('YOUTUBE')` | No | `YOUTUBE` |
| `intakeLabel` / `intake_label` | `VARCHAR(255)` | No | `—` |
| `ownerHintId` / `owner_hint_id` | `CHAR(36)` | Yes | `—` |
| `routeId` / `route_id` | `CHAR(36)` | Yes | `—` |
| `canonicalCaseId` / `canonical_case_id` | `VARCHAR(100)` | Yes | `—` |
| `canonicalBindingSourceId` / `canonical_binding_source_id` | `CHAR(36)` | Yes | `—` |
| `caseClass` / `case_class` | `ENUM('WORKING_INTAKE','CURRENT_OPERATION','RECOVERED_HISTORY','EXTERNAL_REFERENCE')` | No | `WORKING_INTAKE` |
| `workflowState` / `workflow_state` | `ENUM('INTAKE','PREPARING','DRAFTING','AWAITING_HUMAN','AWAITING_PLATFORM','CLOSED')` | No | `INTAKE` |
| `currentAuthoritySelectionId` / `current_authority_selection_id` | `CHAR(36)` | Yes | `—` |
| `packetSourceId` / `packet_source_id` | `CHAR(36)` | Yes | `—` |
| `driveFolderUrl` / `drive_folder_url` | `VARCHAR(2048)` | Yes | `—` |
| `contextRevision` / `context_revision` | `INT UNSIGNED` | No | `1` |
| `closedAt` / `closed_at` | `DATETIME(3)` | Yes | `—` |
| `closeReason` / `close_reason` | `LONGTEXT` | Yes | `—` |
| `archivedAt` / `archived_at` | `DATETIME(3)` | Yes | `—` |
| `archiveReason` / `archive_reason` | `LONGTEXT` | Yes | `—` |
| `notes` / `notes` | `LONGTEXT` | Yes | `—` |
| `createdAt` / `created_at` | `DATETIME(3)` | No | `now()` |
| `createdById` / `created_by_id` | `CHAR(36)` | No | `—` |
| `updatedAt` / `updated_at` | `DATETIME(3)` | No | `@updatedAt` |
| `updatedById` / `updated_by_id` | `CHAR(36)` | No | `—` |
| `rowVersion` / `row_version` | `INT UNSIGNED` | No | `1` |

**Unique constraints:** `id, agencyId`; `canonicalCaseId`.
**Indexes:** `agencyId, workflowState, createdAt, id`; `routeId, createdAt, id`.

**Foreign keys (all RESTRICT):**
- `createdById` → `User(id)`.
- `updatedById` → `User(id)`.
- `agencyId` → `Agency(id)`.
- `ownerHintId` → `Owner(id)`.
- `routeId, agencyId, platform` → `Route(id, agencyId, platform)`.
- `currentAuthoritySelectionId` → `CaseAuthoritySelection(id)`.
- `packetSourceId` → `SourceReference(id)`.
- `canonicalBindingSourceId` → `SourceReference(id)`.

## CaseAuthoritySelection — `case_authority_selections`

Immutable explicit selection; a new default signer does not rewrite this selection. Server checks case route equals selected route.

| Field | SQL type | NULL | Default/owner |
|---|---|---:|---|
| `id` / `id` | `CHAR(36)` | No | `uuid()` |
| `caseId` / `case_id` | `CHAR(36)` | No | `—` |
| `agencyId` / `agency_id` | `CHAR(36)` | No | `—` |
| `routeId` / `route_id` | `CHAR(36)` | No | `—` |
| `signerId` / `signer_id` | `CHAR(36)` | No | `—` |
| `taskType` / `task_type` | `ENUM('INITIAL','NMI_REPLY')` | No | `—` |
| `intendedFromEmail` / `intended_from_email` | `VARCHAR(254)` | No | `—` |
| `basisSourceId` / `basis_source_id` | `CHAR(36)` | Yes | `—` |
| `selectionNote` / `selection_note` | `LONGTEXT` | No | `—` |
| `createdAt` / `created_at` | `DATETIME(3)` | No | `now()` |
| `createdById` / `created_by_id` | `CHAR(36)` | No | `—` |

**Unique constraints:** `id, caseId`; `id, caseId, agencyId, routeId`.
**Indexes:** `caseId, createdAt`.

**Foreign keys (all RESTRICT):**
- `createdById` → `User(id)`.
- `caseId, agencyId` → `CaseRecord(id, agencyId)`.
- `routeId, agencyId` → `Route(id, agencyId)`.
- `signerId, agencyId` → `Signer(id, agencyId)`.
- `basisSourceId` → `SourceReference(id)`.

## CaseAuthorityCoverage — `case_authority_coverages`

One or more precisely scoped coverages. Do not union grants into unsupported authority.

| Field | SQL type | NULL | Default/owner |
|---|---|---:|---|
| `id` / `id` | `CHAR(36)` | No | `uuid()` |
| `selectionId` / `selection_id` | `CHAR(36)` | No | `—` |
| `caseId` / `case_id` | `CHAR(36)` | No | `—` |
| `agencyId` / `agency_id` | `CHAR(36)` | No | `—` |
| `routeId` / `route_id` | `CHAR(36)` | No | `—` |
| `coverageId` / `coverage_id` | `CHAR(36)` | No | `—` |
| `applicationScope` / `application_scope` | `LONGTEXT` | No | `—` |
| `createdAt` / `created_at` | `DATETIME(3)` | No | `now()` |
| `createdById` / `created_by_id` | `CHAR(36)` | No | `—` |

**Unique constraints:** `selectionId, coverageId`.
**Indexes:** FK backing indexes plus primary/unique indexes.

**Foreign keys (all RESTRICT):**
- `createdById` → `User(id)`.
- `selectionId, caseId, agencyId, routeId` → `CaseAuthoritySelection(id, caseId, agencyId, routeId)`.
- `coverageId, routeId, agencyId` → `MandateCoverage(id, routeId, agencyId)`.

## ReportedItem — `reported_items`

Only YouTube video formats in V1. Identifier remains case-sensitive. No global uniqueness across cases.

| Field | SQL type | NULL | Default/owner |
|---|---|---:|---|
| `id` / `id` | `CHAR(36)` | No | `uuid()` |
| `caseId` / `case_id` | `CHAR(36)` | No | `—` |
| `rawUrl` / `raw_url` | `VARCHAR(4096)` | No | `—` |
| `normalizedUrl` / `normalized_url` | `VARCHAR(2048)` | No | `—` |
| `externalItemId` / `external_item_id` | `VARCHAR(64)` | No | `—` |
| `displayTitle` / `display_title` | `VARCHAR(500)` | Yes | `—` |
| `observedAt` / `observed_at` | `DATETIME(3)` | Yes | `—` |
| `archivedAt` / `archived_at` | `DATETIME(3)` | Yes | `—` |
| `archiveReason` / `archive_reason` | `LONGTEXT` | Yes | `—` |
| `createdAt` / `created_at` | `DATETIME(3)` | No | `now()` |
| `createdById` / `created_by_id` | `CHAR(36)` | No | `—` |
| `updatedAt` / `updated_at` | `DATETIME(3)` | No | `@updatedAt` |
| `updatedById` / `updated_by_id` | `CHAR(36)` | No | `—` |
| `rowVersion` / `row_version` | `INT UNSIGNED` | No | `1` |

**Unique constraints:** `caseId, externalItemId`; `id, caseId`.
**Indexes:** `externalItemId`.

**Foreign keys (all RESTRICT):**
- `createdById` → `User(id)`.
- `updatedById` → `User(id)`.
- `caseId` → `CaseRecord(id)`.

## CaseWork — `case_works`



| Field | SQL type | NULL | Default/owner |
|---|---|---:|---|
| `id` / `id` | `CHAR(36)` | No | `uuid()` |
| `caseId` / `case_id` | `CHAR(36)` | No | `—` |
| `title` / `title` | `VARCHAR(500)` | No | `—` |
| `sourceUrl` / `source_url` | `VARCHAR(4096)` | Yes | `—` |
| `externalWorkId` / `external_work_id` | `VARCHAR(191)` | Yes | `—` |
| `workType` / `work_type` | `VARCHAR(100)` | Yes | `—` |
| `notes` / `notes` | `LONGTEXT` | Yes | `—` |
| `archivedAt` / `archived_at` | `DATETIME(3)` | Yes | `—` |
| `archiveReason` / `archive_reason` | `LONGTEXT` | Yes | `—` |
| `createdAt` / `created_at` | `DATETIME(3)` | No | `now()` |
| `createdById` / `created_by_id` | `CHAR(36)` | No | `—` |
| `updatedAt` / `updated_at` | `DATETIME(3)` | No | `@updatedAt` |
| `updatedById` / `updated_by_id` | `CHAR(36)` | No | `—` |
| `rowVersion` / `row_version` | `INT UNSIGNED` | No | `1` |

**Unique constraints:** `id, caseId`.
**Indexes:** `caseId, createdAt`.

**Foreign keys (all RESTRICT):**
- `createdById` → `User(id)`.
- `updatedById` → `User(id)`.
- `caseId` → `CaseRecord(id)`.

## UseMapping — `use_mappings`

Integer milliseconds exposed as decimal strings. Duration equality is never AV verification.

| Field | SQL type | NULL | Default/owner |
|---|---|---:|---|
| `id` / `id` | `CHAR(36)` | No | `uuid()` |
| `caseId` / `case_id` | `CHAR(36)` | No | `—` |
| `caseWorkId` / `case_work_id` | `CHAR(36)` | No | `—` |
| `reportedItemId` / `reported_item_id` | `CHAR(36)` | No | `—` |
| `occurrence` / `occurrence` | `INT UNSIGNED` | No | `—` |
| `sourceStartMs` / `source_start_ms` | `BIGINT UNSIGNED` | Yes | `—` |
| `sourceEndMs` / `source_end_ms` | `BIGINT UNSIGNED` | Yes | `—` |
| `reportedStartMs` / `reported_start_ms` | `BIGINT UNSIGNED` | Yes | `—` |
| `reportedEndMs` / `reported_end_ms` | `BIGINT UNSIGNED` | Yes | `—` |
| `rawTimecodes` / `raw_timecodes` | `JSON` | Yes | `—` |
| `boundaryConvention` / `boundary_convention` | `VARCHAR(40)` | No | `"UNKNOWN"` |
| `provenance` / `provenance` | `ENUM('DOCUMENT_REVIEWED','OPERATOR_REPORTED','ANALYSIS','MISSING','CONFLICT')` | No | `MISSING` |
| `basisSourceId` / `basis_source_id` | `CHAR(36)` | Yes | `—` |
| `limitations` / `limitations` | `LONGTEXT` | Yes | `—` |
| `archivedAt` / `archived_at` | `DATETIME(3)` | Yes | `—` |
| `archiveReason` / `archive_reason` | `LONGTEXT` | Yes | `—` |
| `createdAt` / `created_at` | `DATETIME(3)` | No | `now()` |
| `createdById` / `created_by_id` | `CHAR(36)` | No | `—` |
| `updatedAt` / `updated_at` | `DATETIME(3)` | No | `@updatedAt` |
| `updatedById` / `updated_by_id` | `CHAR(36)` | No | `—` |
| `rowVersion` / `row_version` | `INT UNSIGNED` | No | `1` |

**Unique constraints:** `caseWorkId, reportedItemId, occurrence`; `id, caseId`.
**Indexes:** `reportedItemId, caseId`.

**Foreign keys (all RESTRICT):**
- `createdById` → `User(id)`.
- `updatedById` → `User(id)`.
- `caseId` → `CaseRecord(id)`.
- `caseWorkId, caseId` → `CaseWork(id, caseId)`.
- `reportedItemId, caseId` → `ReportedItem(id, caseId)`.
- `basisSourceId` → `SourceReference(id)`.

## SourceReference — `source_references`

Immutable capture metadata, not a guarantee of truth. A URL hash is not a content hash. Null agency only for public/shared-scoped sources, not permission to cross agencies.

| Field | SQL type | NULL | Default/owner |
|---|---|---:|---|
| `id` / `id` | `CHAR(36)` | No | `uuid()` |
| `agencyId` / `agency_id` | `CHAR(36)` | Yes | `—` |
| `sourceGroupId` / `source_group_id` | `CHAR(36)` | No | `—` |
| `revision` / `revision` | `INT UNSIGNED` | No | `—` |
| `supersedesSourceId` / `supersedes_source_id` | `CHAR(36)` | Yes | `—` |
| `title` / `title` | `VARCHAR(500)` | No | `—` |
| `canonicalUrl` / `canonical_url` | `VARCHAR(4096)` | Yes | `—` |
| `providerFileId` / `provider_file_id` | `VARCHAR(191)` | Yes | `—` |
| `providerRevisionId` / `provider_revision_id` | `VARCHAR(191)` | Yes | `—` |
| `sourceRole` / `source_role` | `ENUM('CANONICAL_RECORD','PRIMARY_CORRESPONDENCE','OPERATOR_INPUT','DERIVED_DRAFT','EXTERNAL_REFERENCE','POLICY_REFERENCE')` | No | `—` |
| `accessState` / `access_state` | `ENUM('NOT_CHECKED','ACCESSIBLE_AT_CHECK','UNAVAILABLE_AT_CHECK')` | No | `NOT_CHECKED` |
| `contentSha256` / `content_sha256` | `VARCHAR(64)` | Yes | `—` |
| `hashTarget` / `hash_target` | `ENUM('RAW_FILE','EXTRACTED_TEXT','OTHER')` | Yes | `—` |
| `reportedProvenance` / `reported_provenance` | `ENUM('DOCUMENT_REVIEWED','OPERATOR_REPORTED','ANALYSIS','MISSING','CONFLICT')` | No | `OPERATOR_REPORTED` |
| `rawProvenance` / `raw_provenance` | `VARCHAR(120)` | Yes | `—` |
| `scopeText` / `scope_text` | `LONGTEXT` | No | `—` |
| `scopeBindings` / `scope_bindings` | `JSON` | Yes | `—` |
| `observedAt` / `observed_at` | `DATETIME(3)` | Yes | `—` |
| `reviewedByLabel` / `reviewed_by_label` | `VARCHAR(255)` | Yes | `—` |
| `reviewedAt` / `reviewed_at` | `DATETIME(3)` | Yes | `—` |
| `excerpt` / `excerpt` | `LONGTEXT` | Yes | `—` |
| `excerptLocator` / `excerpt_locator` | `VARCHAR(500)` | Yes | `—` |
| `limitations` / `limitations` | `LONGTEXT` | Yes | `—` |
| `createdAt` / `created_at` | `DATETIME(3)` | No | `now()` |
| `createdById` / `created_by_id` | `CHAR(36)` | No | `—` |

**Unique constraints:** `sourceGroupId, revision`; `supersedesSourceId`.
**Indexes:** `agencyId, createdAt`; `providerFileId`.

**Foreign keys (all RESTRICT):**
- `createdById` → `User(id)`.
- `agencyId` → `Agency(id)`.
- `supersedesSourceId` → `SourceReference(id)`.

## CaseSource — `case_sources`



| Field | SQL type | NULL | Default/owner |
|---|---|---:|---|
| `id` / `id` | `CHAR(36)` | No | `uuid()` |
| `caseId` / `case_id` | `CHAR(36)` | No | `—` |
| `sourceId` / `source_id` | `CHAR(36)` | No | `—` |
| `useRole` / `use_role` | `VARCHAR(60)` | No | `—` |
| `scopeNote` / `scope_note` | `LONGTEXT` | No | `—` |
| `linkState` / `link_state` | `ENUM('LINKED','PAUSED','UNLINKED')` | No | `LINKED` |
| `stateReason` / `state_reason` | `LONGTEXT` | Yes | `—` |
| `createdAt` / `created_at` | `DATETIME(3)` | No | `now()` |
| `createdById` / `created_by_id` | `CHAR(36)` | No | `—` |
| `updatedAt` / `updated_at` | `DATETIME(3)` | No | `@updatedAt` |
| `updatedById` / `updated_by_id` | `CHAR(36)` | No | `—` |
| `rowVersion` / `row_version` | `INT UNSIGNED` | No | `1` |

**Unique constraints:** `caseId, sourceId, useRole`.
**Indexes:** `sourceId`.

**Foreign keys (all RESTRICT):**
- `createdById` → `User(id)`.
- `updatedById` → `User(id)`.
- `caseId` → `CaseRecord(id)`.
- `sourceId` → `SourceReference(id)`.

## CaseFact — `case_facts`

Append-only revisions. The value schema is selected by FactType. Latest successor is current; WITHDRAWN is a retraction, not deletion.

| Field | SQL type | NULL | Default/owner |
|---|---|---:|---|
| `id` / `id` | `CHAR(36)` | No | `uuid()` |
| `caseId` / `case_id` | `CHAR(36)` | No | `—` |
| `factGroupId` / `fact_group_id` | `CHAR(36)` | No | `—` |
| `revision` / `revision` | `INT UNSIGNED` | No | `—` |
| `supersedesFactId` / `supersedes_fact_id` | `CHAR(36)` | Yes | `—` |
| `factType` / `fact_type` | `ENUM('RIGHTS_BASIS','RIGHTS_SCOPE','PERMISSION','AV_COMPARISON','EXCEPTION_REVIEW','WORK_IDENTIFICATION','REPORTED_IDENTIFICATION','DUPLICATE_REVIEW','AUTHORITY_CURRENTNESS')` | No | `—` |
| `scopeKind` / `scope_kind` | `ENUM('CASE','WORK','REPORTED_ITEM','USE')` | No | `—` |
| `caseWorkId` / `case_work_id` | `CHAR(36)` | Yes | `—` |
| `reportedItemId` / `reported_item_id` | `CHAR(36)` | Yes | `—` |
| `mappingId` / `mapping_id` | `CHAR(36)` | Yes | `—` |
| `value` / `value` | `JSON` | No | `—` |
| `provenance` / `provenance` | `ENUM('DOCUMENT_REVIEWED','OPERATOR_REPORTED','ANALYSIS','MISSING','CONFLICT')` | No | `—` |
| `rawProvenance` / `raw_provenance` | `VARCHAR(120)` | Yes | `—` |
| `resolutionState` / `resolution_state` | `ENUM('UNASSESSED','SUPPORTED_FOR_SCOPE','CONFLICT','WITHDRAWN')` | No | `UNASSESSED` |
| `assertedByLabel` / `asserted_by_label` | `VARCHAR(255)` | Yes | `—` |
| `assertedAsOf` / `asserted_as_of` | `DATETIME(3)` | Yes | `—` |
| `scopeText` / `scope_text` | `LONGTEXT` | No | `—` |
| `limitations` / `limitations` | `LONGTEXT` | Yes | `—` |
| `changeReason` / `change_reason` | `LONGTEXT` | No | `—` |
| `createdAt` / `created_at` | `DATETIME(3)` | No | `now()` |
| `createdById` / `created_by_id` | `CHAR(36)` | No | `—` |

**Unique constraints:** `factGroupId, revision`; `id, caseId`; `supersedesFactId`.
**Indexes:** `caseId, factType, createdAt`.

**Foreign keys (all RESTRICT):**
- `createdById` → `User(id)`.
- `caseId` → `CaseRecord(id)`.
- `caseWorkId, caseId` → `CaseWork(id, caseId)`.
- `reportedItemId, caseId` → `ReportedItem(id, caseId)`.
- `mappingId, caseId` → `UseMapping(id, caseId)`.
- `supersedesFactId` → `CaseFact(id)`.

## FactSource — `fact_sources`

Server must check CaseFact.caseId = CaseSource.caseId. Named supporting assertion is not authentication.

| Field | SQL type | NULL | Default/owner |
|---|---|---:|---|
| `id` / `id` | `CHAR(36)` | No | `uuid()` |
| `factId` / `fact_id` | `CHAR(36)` | No | `—` |
| `caseSourceId` / `case_source_id` | `CHAR(36)` | No | `—` |
| `supportRole` / `support_role` | `VARCHAR(80)` | No | `—` |
| `supportedAssertion` / `supported_assertion` | `LONGTEXT` | No | `—` |
| `createdAt` / `created_at` | `DATETIME(3)` | No | `now()` |
| `createdById` / `created_by_id` | `CHAR(36)` | No | `—` |

**Unique constraints:** `factId, caseSourceId, supportRole`.
**Indexes:** FK backing indexes plus primary/unique indexes.

**Foreign keys (all RESTRICT):**
- `createdById` → `User(id)`.
- `factId` → `CaseFact(id)`.
- `caseSourceId` → `CaseSource(id)`.

## Correspondence — `correspondence`

Preserve actual observations; not a send API. Source identity hash derived from a trustworthy provider/capture identity, never subject or Message-ID alone.

| Field | SQL type | NULL | Default/owner |
|---|---|---:|---|
| `id` / `id` | `CHAR(36)` | No | `uuid()` |
| `agencyId` / `agency_id` | `CHAR(36)` | No | `—` |
| `mailboxAddress` / `mailbox_address` | `VARCHAR(254)` | No | `—` |
| `direction` / `direction` | `ENUM('INBOUND','OUTBOUND')` | No | `—` |
| `subject` / `subject` | `VARCHAR(998)` | No | `—` |
| `messageId` / `message_id` | `VARCHAR(998)` | Yes | `—` |
| `inReplyTo` / `in_reply_to` | `VARCHAR(998)` | Yes | `—` |
| `references` / `references` | `JSON` | Yes | `—` |
| `sourceIdentityHash` / `source_identity_hash` | `VARCHAR(64)` | Yes | `—` |
| `captureMode` / `capture_mode` | `ENUM('RAW_SOURCE','COPIED_FULL_TEXT','EXCERPT','OPERATOR_REPORTED')` | No | `—` |
| `bodyRole` / `body_role` | `ENUM('FULL_MESSAGE','AUTHORED_BODY','QUOTED_HISTORY','EXCERPT','UNKNOWN')` | No | `UNKNOWN` |
| `bodyText` / `body_text` | `LONGTEXT` | Yes | `—` |
| `bodySha256` / `body_sha256` | `VARCHAR(64)` | Yes | `—` |
| `rawSourceId` / `raw_source_id` | `CHAR(36)` | Yes | `—` |
| `attachmentsManifest` / `attachments_manifest` | `JSON` | Yes | `—` |
| `headerDateRaw` / `header_date_raw` | `VARCHAR(255)` | Yes | `—` |
| `occurredAt` / `occurred_at` | `DATETIME(3)` | Yes | `—` |
| `timestampPrecision` / `timestamp_precision` | `VARCHAR(40)` | No | `"UNKNOWN"` |
| `fromAddress` / `from_address` | `VARCHAR(254)` | Yes | `—` |
| `toAddress` / `to_address` | `VARCHAR(254)` | Yes | `—` |
| `replyToAddress` / `reply_to_address` | `VARCHAR(254)` | Yes | `—` |
| `limitations` / `limitations` | `LONGTEXT` | Yes | `—` |
| `createdAt` / `created_at` | `DATETIME(3)` | No | `now()` |
| `createdById` / `created_by_id` | `CHAR(36)` | No | `—` |

**Unique constraints:** `agencyId, mailboxAddress, sourceIdentityHash`; `id, agencyId`.
**Indexes:** `agencyId, occurredAt, id`.

**Foreign keys (all RESTRICT):**
- `createdById` → `User(id)`.
- `agencyId` → `Agency(id)`.
- `rawSourceId` → `SourceReference(id)`.

## CorrespondenceBinding — `correspondence_bindings`

Append-only semantic binding. Corrections create successors; one transmission may bind to multiple URLs. Outcome requires a specific item in V1.

| Field | SQL type | NULL | Default/owner |
|---|---|---:|---|
| `id` / `id` | `CHAR(36)` | No | `uuid()` |
| `caseId` / `case_id` | `CHAR(36)` | No | `—` |
| `agencyId` / `agency_id` | `CHAR(36)` | No | `—` |
| `correspondenceId` / `correspondence_id` | `CHAR(36)` | No | `—` |
| `reportedItemId` / `reported_item_id` | `CHAR(36)` | Yes | `—` |
| `eventType` / `event_type` | `ENUM('INITIAL_AS_SENT','ACK','NMI','REPLY_AS_SENT','SUPPLEMENT_AS_SENT','CORRECTION_AS_SENT','OUTCOME','OTHER')` | No | `—` |
| `platformReference` / `platform_reference` | `VARCHAR(191)` | Yes | `—` |
| `outcome` / `outcome` | `ENUM('REMOVED','REINSTATED','REJECTED','RETRACTED','OTHER')` | Yes | `—` |
| `interpretation` / `interpretation` | `LONGTEXT` | Yes | `—` |
| `supersedesBindingId` / `supersedes_binding_id` | `CHAR(36)` | Yes | `—` |
| `createdAt` / `created_at` | `DATETIME(3)` | No | `now()` |
| `createdById` / `created_by_id` | `CHAR(36)` | No | `—` |

**Unique constraints:** `id, caseId`; `supersedesBindingId`.
**Indexes:** `caseId, createdAt`; `correspondenceId`; `platformReference`.

**Foreign keys (all RESTRICT):**
- `createdById` → `User(id)`.
- `caseId, agencyId` → `CaseRecord(id, agencyId)`.
- `correspondenceId, agencyId` → `Correspondence(id, agencyId)`.
- `reportedItemId, caseId` → `ReportedItem(id, caseId)`.
- `supersedesBindingId` → `CorrespondenceBinding(id)`.

## PromptSnapshot — `prompt_snapshots`

Exact immutable prompt/context. SHA-256 of exact stored UTF-8 text, not a legal attestation.

| Field | SQL type | NULL | Default/owner |
|---|---|---:|---|
| `id` / `id` | `CHAR(36)` | No | `uuid()` |
| `caseId` / `case_id` | `CHAR(36)` | No | `—` |
| `taskType` / `task_type` | `ENUM('INITIAL','NMI_REPLY')` | No | `—` |
| `generationMode` / `generation_mode` | `ENUM('PREPARATION','DRAFTING')` | No | `—` |
| `version` / `version` | `INT UNSIGNED` | No | `—` |
| `authoritySelectionId` / `authority_selection_id` | `CHAR(36)` | Yes | `—` |
| `parentBindingId` / `parent_binding_id` | `CHAR(36)` | Yes | `—` |
| `contractVersion` / `contract_version` | `VARCHAR(80)` | No | `—` |
| `templateVersion` / `template_version` | `VARCHAR(80)` | No | `—` |
| `contextRevision` / `context_revision` | `INT UNSIGNED` | No | `—` |
| `dependencyDigest` / `dependency_digest` | `VARCHAR(64)` | No | `—` |
| `dependencyManifest` / `dependency_manifest` | `JSON` | No | `—` |
| `contextJson` / `context_json` | `JSON` | No | `—` |
| `sourceManifest` / `source_manifest` | `JSON` | No | `—` |
| `missingItems` / `missing_items` | `JSON` | No | `—` |
| `conflicts` / `conflicts` | `JSON` | No | `—` |
| `renderedPrompt` / `rendered_prompt` | `LONGTEXT` | No | `—` |
| `promptSha256` / `prompt_sha256` | `VARCHAR(64)` | No | `—` |
| `createdAt` / `created_at` | `DATETIME(3)` | No | `now()` |
| `createdById` / `created_by_id` | `CHAR(36)` | No | `—` |

**Unique constraints:** `caseId, taskType, version`; `id, caseId`.
**Indexes:** `caseId, createdAt`.

**Foreign keys (all RESTRICT):**
- `createdById` → `User(id)`.
- `caseId` → `CaseRecord(id)`.
- `authoritySelectionId, caseId` → `CaseAuthoritySelection(id, caseId)`.
- `parentBindingId, caseId` → `CorrespondenceBinding(id, caseId)`.

## NoticeCandidate — `notice_candidates`

Content immutable at insert. PATCH body is forbidden. Only supersededAt/reason may be set by dedicated command. Artifact hash binds body, subject, envelope, planned documents and signature slot; does not prove send.

| Field | SQL type | NULL | Default/owner |
|---|---|---:|---|
| `id` / `id` | `CHAR(36)` | No | `uuid()` |
| `caseId` / `case_id` | `CHAR(36)` | No | `—` |
| `promptSnapshotId` / `prompt_snapshot_id` | `CHAR(36)` | No | `—` |
| `parentCandidateId` / `parent_candidate_id` | `CHAR(36)` | Yes | `—` |
| `version` / `version` | `INT UNSIGNED` | No | `—` |
| `taskType` / `task_type` | `ENUM('INITIAL','NMI_REPLY')` | No | `—` |
| `subject` / `subject` | `VARCHAR(998)` | No | `—` |
| `envelopeJson` / `envelope_json` | `JSON` | No | `—` |
| `bodyText` / `body_text` | `LONGTEXT` | No | `—` |
| `bodySha256` / `body_sha256` | `VARCHAR(64)` | No | `—` |
| `artifactSha256` / `artifact_sha256` | `VARCHAR(64)` | No | `—` |
| `preparedDocuments` / `prepared_documents` | `JSON` | No | `—` |
| `signatureState` / `signature_state` | `VARCHAR(40)` | No | `"HUMAN_PENDING"` |
| `authoringTool` / `authoring_tool` | `VARCHAR(100)` | Yes | `—` |
| `revisionReason` / `revision_reason` | `LONGTEXT` | Yes | `—` |
| `supersededAt` / `superseded_at` | `DATETIME(3)` | Yes | `—` |
| `supersedeReason` / `supersede_reason` | `LONGTEXT` | Yes | `—` |
| `createdAt` / `created_at` | `DATETIME(3)` | No | `now()` |
| `createdById` / `created_by_id` | `CHAR(36)` | No | `—` |

**Unique constraints:** `caseId, taskType, version`; `id, caseId`.
**Indexes:** `caseId, createdAt`.

**Foreign keys (all RESTRICT):**
- `createdById` → `User(id)`.
- `caseId` → `CaseRecord(id)`.
- `promptSnapshotId, caseId` → `PromptSnapshot(id, caseId)`.
- `parentCandidateId` → `NoticeCandidate(id)`.

## ValidationRun — `validation_runs`

Server-generated structural/heuristic checks only. Never implies G1-G6 were reviewed substantively.

| Field | SQL type | NULL | Default/owner |
|---|---|---:|---|
| `id` / `id` | `CHAR(36)` | No | `uuid()` |
| `candidateId` / `candidate_id` | `CHAR(36)` | No | `—` |
| `caseId` / `case_id` | `CHAR(36)` | No | `—` |
| `artifactSha256` / `artifact_sha256` | `VARCHAR(64)` | No | `—` |
| `dependencyDigest` / `dependency_digest` | `VARCHAR(64)` | No | `—` |
| `dependencyManifest` / `dependency_manifest` | `JSON` | No | `—` |
| `evaluatedContextJson` / `evaluated_context_json` | `JSON` | No | `—` |
| `rulesetVersion` / `ruleset_version` | `VARCHAR(80)` | No | `—` |
| `result` / `result` | `ENUM('TECHNICAL_PASS','BLOCKED','REVIEW_REQUIRED','ERROR')` | No | `—` |
| `coverageManifest` / `coverage_manifest` | `JSON` | No | `—` |
| `blockerCount` / `blocker_count` | `INT UNSIGNED` | No | `—` |
| `reviewRequiredCount` / `review_required_count` | `INT UNSIGNED` | No | `—` |
| `warningCount` / `warning_count` | `INT UNSIGNED` | No | `—` |
| `startedAt` / `started_at` | `DATETIME(3)` | No | `—` |
| `completedAt` / `completed_at` | `DATETIME(3)` | No | `—` |
| `createdAt` / `created_at` | `DATETIME(3)` | No | `now()` |
| `createdById` / `created_by_id` | `CHAR(36)` | No | `—` |

**Unique constraints:** `id, candidateId`.
**Indexes:** `candidateId, createdAt`.

**Foreign keys (all RESTRICT):**
- `createdById` → `User(id)`.
- `candidateId, caseId` → `NoticeCandidate(id, caseId)`.

## ValidationIssue — `validation_issues`



| Field | SQL type | NULL | Default/owner |
|---|---|---:|---|
| `id` / `id` | `CHAR(36)` | No | `uuid()` |
| `runId` / `run_id` | `CHAR(36)` | No | `—` |
| `ruleId` / `rule_id` | `VARCHAR(100)` | No | `—` |
| `checkKind` / `check_kind` | `ENUM('DETERMINISTIC','HEURISTIC')` | No | `—` |
| `severity` / `severity` | `ENUM('BLOCKER','REVIEW_REQUIRED','WARNING','INFO')` | No | `—` |
| `fieldPath` / `field_path` | `VARCHAR(500)` | Yes | `—` |
| `message` / `message` | `LONGTEXT` | No | `—` |
| `details` / `details` | `JSON` | Yes | `—` |
| `createdAt` / `created_at` | `DATETIME(3)` | No | `now()` |
| `createdById` / `created_by_id` | `CHAR(36)` | No | `—` |

**Unique constraints:** Primary key only.
**Indexes:** `runId, severity`.

**Foreign keys (all RESTRICT):**
- `createdById` → `User(id)`.
- `runId` → `ValidationRun(id)`.

## CandidateAssessment — `candidate_assessments`

Attributable source-bound G1-G6 review capture, not an automatic decision and never G7. Source inclusion alone cannot verify legal facts. POST is an operator report of an actual assessment, not a request for fabricated PASS.

| Field | SQL type | NULL | Default/owner |
|---|---|---:|---|
| `id` / `id` | `CHAR(36)` | No | `uuid()` |
| `candidateId` / `candidate_id` | `CHAR(36)` | No | `—` |
| `caseId` / `case_id` | `CHAR(36)` | No | `—` |
| `gate` / `gate` | `ENUM('G1','G2','G3','G4','G5','G6')` | No | `—` |
| `result` / `result` | `ENUM('PASS','HOLD','BLOCKED','MISSING','CONFLICT')` | No | `—` |
| `artifactSha256` / `artifact_sha256` | `VARCHAR(64)` | No | `—` |
| `dependencyDigest` / `dependency_digest` | `VARCHAR(64)` | No | `—` |
| `rulesetVersion` / `ruleset_version` | `VARCHAR(80)` | No | `—` |
| `scopeState` / `scope_state` | `ENUM('RECORDED_NOT_ADOPTED','SCOPE_CONFIRMED_FOR_CANDIDATE')` | No | `RECORDED_NOT_ADOPTED` |
| `performerKind` / `performer_kind` | `ENUM('HUMAN','AI_ASSISTED','DOCUMENTED_EXTERNAL_REVIEW')` | No | `—` |
| `performerLabel` / `performer_label` | `VARCHAR(255)` | No | `—` |
| `assessedAt` / `assessed_at` | `DATETIME(3)` | Yes | `—` |
| `provenance` / `provenance` | `ENUM('DOCUMENT_REVIEWED','OPERATOR_REPORTED','ANALYSIS','MISSING','CONFLICT')` | No | `—` |
| `rationale` / `rationale` | `LONGTEXT` | No | `—` |
| `scopeText` / `scope_text` | `LONGTEXT` | No | `—` |
| `limitations` / `limitations` | `LONGTEXT` | Yes | `—` |
| `askDispositions` / `ask_dispositions` | `JSON` | Yes | `—` |
| `supersedesAssessmentId` / `supersedes_assessment_id` | `CHAR(36)` | Yes | `—` |
| `createdAt` / `created_at` | `DATETIME(3)` | No | `now()` |
| `createdById` / `created_by_id` | `CHAR(36)` | No | `—` |

**Unique constraints:** `supersedesAssessmentId`.
**Indexes:** `candidateId, gate, createdAt`.

**Foreign keys (all RESTRICT):**
- `createdById` → `User(id)`.
- `candidateId, caseId` → `NoticeCandidate(id, caseId)`.
- `supersedesAssessmentId` → `CandidateAssessment(id)`.

## AssessmentSource — `assessment_sources`

Backend checks the case and scope of both endpoints.

| Field | SQL type | NULL | Default/owner |
|---|---|---:|---|
| `id` / `id` | `CHAR(36)` | No | `uuid()` |
| `assessmentId` / `assessment_id` | `CHAR(36)` | No | `—` |
| `caseSourceId` / `case_source_id` | `CHAR(36)` | No | `—` |
| `supportedConclusion` / `supported_conclusion` | `LONGTEXT` | No | `—` |
| `createdAt` / `created_at` | `DATETIME(3)` | No | `now()` |
| `createdById` / `created_by_id` | `CHAR(36)` | No | `—` |

**Unique constraints:** `assessmentId, caseSourceId`.
**Indexes:** FK backing indexes plus primary/unique indexes.

**Foreign keys (all RESTRICT):**
- `createdById` → `User(id)`.
- `assessmentId` → `CandidateAssessment(id)`.
- `caseSourceId` → `CaseSource(id)`.

## AuditEvent — `audit_events`

Append-only application audit, not tamper-proof evidence. Passwords, session tokens and raw confidential bodies excluded.

| Field | SQL type | NULL | Default/owner |
|---|---|---:|---|
| `id` / `id` | `CHAR(36)` | No | `uuid()` |
| `actorUserId` / `actor_user_id` | `CHAR(36)` | Yes | `—` |
| `requestId` / `request_id` | `VARCHAR(100)` | No | `—` |
| `action` / `action` | `VARCHAR(120)` | No | `—` |
| `entityType` / `entity_type` | `VARCHAR(100)` | No | `—` |
| `entityId` / `entity_id` | `CHAR(36)` | Yes | `—` |
| `beforeRedacted` / `before_redacted` | `JSON` | Yes | `—` |
| `afterRedacted` / `after_redacted` | `JSON` | Yes | `—` |
| `reason` / `reason` | `LONGTEXT` | Yes | `—` |
| `sourceIds` / `source_ids` | `JSON` | Yes | `—` |
| `createdAt` / `created_at` | `DATETIME(3)` | No | `now()` |

**Unique constraints:** Primary key only.
**Indexes:** `entityType, entityId, createdAt, id`; `actorUserId, createdAt`.

**Foreign keys (all RESTRICT):**
- `actorUserId` → `User(id)`.

## IdempotencyRecord — `idempotency_records`

Same actor + operation + key + payload replays same response; failed tx leaves no committed result. Expiry is bounded replay horizon, not permanent deduplication.

| Field | SQL type | NULL | Default/owner |
|---|---|---:|---|
| `id` / `id` | `CHAR(36)` | No | `uuid()` |
| `actorUserId` / `actor_user_id` | `CHAR(36)` | No | `—` |
| `operationId` / `operation_id` | `VARCHAR(100)` | No | `—` |
| `idempotencyKey` / `idempotency_key` | `VARCHAR(100)` | No | `—` |
| `requestSha256` / `request_sha256` | `VARCHAR(64)` | No | `—` |
| `state` / `state` | `ENUM('IN_PROGRESS','COMPLETED')` | No | `—` |
| `responseStatus` / `response_status` | `SMALLINT UNSIGNED` | Yes | `—` |
| `responseJson` / `response_json` | `JSON` | Yes | `—` |
| `resourceType` / `resource_type` | `VARCHAR(100)` | Yes | `—` |
| `resourceId` / `resource_id` | `CHAR(36)` | Yes | `—` |
| `expiresAt` / `expires_at` | `DATETIME(3)` | No | `—` |
| `createdAt` / `created_at` | `DATETIME(3)` | No | `now()` |

**Unique constraints:** `actorUserId, operationId, idempotencyKey`.
**Indexes:** `expiresAt`.

**Foreign keys (all RESTRICT):**
- `actorUserId` → `User(id)`.

## Additional CHECK constraints in SQL preview

Prisma does not encode these CHECK expressions directly in this schema. Preserve and inspect them when generating the real migration; never interpret ORM validation as proof they were applied.
- `use_mappings.source_interval`: `(`source_start_ms` IS NULL OR `source_end_ms` IS NULL OR `source_end_ms` > `source_start_ms`)`.
- `use_mappings.reported_interval`: `(`reported_start_ms` IS NULL OR `reported_end_ms` IS NULL OR `reported_end_ms` > `reported_start_ms`)`.
- `use_mappings.millisecond_bounds`: `COALESCE(`source_start_ms`,0) <= 9007199254740991 AND COALESCE(`source_end_ms`,0) <= 9007199254740991 AND COALESCE(`reported_start_ms`,0) <= 9007199254740991 AND COALESCE(`reported_end_ms`,0) <= 9007199254740991`.
- `use_mappings.boundary_convention`: ``boundary_convention` IN ('UNKNOWN','HALF_OPEN','INCLUSIVE')`.
- `notice_candidates.unsigned_only`: ``signature_state` = 'HUMAN_PENDING'`.
- `validation_runs.completion_time`: ``completed_at` >= `started_at``.
- `auth_sessions.session_time`: ``expires_at` > `created_at``.

Cross-field source/provenance, nullable scope, same-case fact-source and mandate-coverages membership checks are explicit **transactional service rules** in `INVARIANTS.md`. They are not claimed to be fully database-enforced. No DB CHECK claims to decide ownership, legal validity, permissions, exceptions or G1–G6 merits.
