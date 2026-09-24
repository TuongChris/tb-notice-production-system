// fieldAttributions of Agency and LegalSubject (decision D4). The wire shape is already validated by
// the contract schema; these are the service rules on top of it:
//   - `field` must name an attributable field of that entity (its identity/contact data; not notes,
//     lifecycle, binding or server fields);
//   - DOCUMENT_REVIEWED needs at least one source id (and every id must exist and be in scope —
//     sources.ts);
//   - provenance is stored exactly as supplied: never upgraded, MISSING stays MISSING and CONFLICT
//     stays CONFLICT; other provenance values do not require a source (the contract does not).
// The list replaces the stored list as a whole (PATCH semantics for an array field).
import type { FieldAttribution } from '@tb/contracts';
import type { ValidationIssue } from '../../infrastructure/http/api-error.js';
import type { SourceUse } from './sources.js';

export const ATTRIBUTABLE_FIELDS = {
  Agency: [
    'displayName',
    'legalName',
    'organizationType',
    'jurisdictionCountry',
    'registrationAuthority',
    'registrationNumber',
    'websiteUrl',
    'copyrightEmail',
    'verificationEmail',
    'postalAddress',
    'phone',
    'driveRootUrl',
    'masterUrl',
    'startHereUrl',
  ],
  LegalSubject: [
    'subjectType',
    'legalName',
    'aliases',
    'jurisdictionCountry',
    'legalForm',
    'registrationAuthority',
    'registrationNumber',
    'contactEmail',
    'postalAddress',
  ],
} as const satisfies Record<string, readonly string[]>;

export type AttributedEntity = keyof typeof ATTRIBUTABLE_FIELDS;

export function attributionIssues(
  entity: AttributedEntity,
  attributions: readonly FieldAttribution[] | null | undefined,
): ValidationIssue[] {
  if (!attributions) return [];
  const allowed: readonly string[] = ATTRIBUTABLE_FIELDS[entity];
  const issues: ValidationIssue[] = [];
  attributions.forEach((attribution, index) => {
    if (!allowed.includes(attribution.field)) {
      issues.push({
        path: `fieldAttributions.${index}.field`,
        message: `Not an attributable field of ${entity}`,
      });
    }
    if (attribution.provenance === 'DOCUMENT_REVIEWED' && attribution.sourceIds.length === 0) {
      issues.push({
        path: `fieldAttributions.${index}.sourceIds`,
        message: 'DOCUMENT_REVIEWED requires at least one source reference',
      });
    }
  });
  return issues;
}

export function attributionSourceUses(
  attributions: readonly FieldAttribution[] | null | undefined,
): SourceUse[] {
  if (!attributions) return [];
  return attributions.flatMap((attribution, index) =>
    attribution.sourceIds.map((sourceId, position) => ({
      field: `fieldAttributions.${index}.sourceIds.${position}`,
      sourceId,
    })),
  );
}
