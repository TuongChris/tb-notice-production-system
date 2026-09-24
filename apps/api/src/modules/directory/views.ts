// Contract wire views of directory rows. Each view lists exactly the fields of the contract schema
// (strict objects), with timestamps as ISO 8601 UTC strings. JSON columns were validated with the
// contract schema when written, so they are returned as stored (MySQL may reorder object keys).
import type {
  Agency as AgencyView,
  LegalSubject as LegalSubjectView,
  Owner as OwnerView,
  OwnerSubject as OwnerSubjectView,
  Signer as SignerView,
} from '@tb/contracts';
import type {
  Agency,
  LegalSubject,
  Owner,
  OwnerSubject,
  Signer,
} from '../../../generated/prisma/client.js';

const iso = (value: Date | null): string | null => (value === null ? null : value.toISOString());

export function toAgencyView(row: Agency): AgencyView {
  return {
    id: row.id,
    displayName: row.displayName,
    legalName: row.legalName,
    organizationType: row.organizationType,
    jurisdictionCountry: row.jurisdictionCountry,
    registrationAuthority: row.registrationAuthority,
    registrationNumber: row.registrationNumber,
    websiteUrl: row.websiteUrl,
    copyrightEmail: row.copyrightEmail,
    verificationEmail: row.verificationEmail,
    postalAddress: row.postalAddress as AgencyView['postalAddress'],
    phone: row.phone,
    driveRootUrl: row.driveRootUrl,
    masterUrl: row.masterUrl,
    startHereUrl: row.startHereUrl,
    fieldAttributions: row.fieldAttributions as AgencyView['fieldAttributions'],
    recordState: row.recordState,
    canonicalCode: row.canonicalCode,
    canonicalSourceId: row.canonicalSourceId,
    bindingState: row.bindingState,
    notes: row.notes,
    archivedAt: iso(row.archivedAt),
    archiveReason: row.archiveReason,
    createdAt: row.createdAt.toISOString(),
    createdById: row.createdById,
    updatedAt: row.updatedAt.toISOString(),
    updatedById: row.updatedById,
    rowVersion: row.rowVersion,
  };
}

export function toOwnerView(row: Owner): OwnerView {
  return {
    id: row.id,
    displayName: row.displayName,
    aliases: row.aliases as OwnerView['aliases'],
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    sourceChannels: row.sourceChannels as OwnerView['sourceChannels'],
    websiteUrl: row.websiteUrl,
    preferredLanguage: row.preferredLanguage,
    driveFolderUrl: row.driveFolderUrl,
    recordState: row.recordState,
    canonicalCode: row.canonicalCode,
    canonicalSourceId: row.canonicalSourceId,
    bindingState: row.bindingState,
    notes: row.notes,
    archivedAt: iso(row.archivedAt),
    archiveReason: row.archiveReason,
    createdAt: row.createdAt.toISOString(),
    createdById: row.createdById,
    updatedAt: row.updatedAt.toISOString(),
    updatedById: row.updatedById,
    rowVersion: row.rowVersion,
  };
}

export function toLegalSubjectView(row: LegalSubject): LegalSubjectView {
  return {
    id: row.id,
    subjectType: row.subjectType,
    legalName: row.legalName,
    aliases: row.aliases as LegalSubjectView['aliases'],
    jurisdictionCountry: row.jurisdictionCountry,
    legalForm: row.legalForm,
    registrationAuthority: row.registrationAuthority,
    registrationNumber: row.registrationNumber,
    contactEmail: row.contactEmail,
    postalAddress: row.postalAddress as LegalSubjectView['postalAddress'],
    fieldAttributions: row.fieldAttributions as LegalSubjectView['fieldAttributions'],
    identityReviewState: row.identityReviewState,
    recordState: row.recordState,
    canonicalCode: row.canonicalCode,
    canonicalSourceId: row.canonicalSourceId,
    bindingState: row.bindingState,
    notes: row.notes,
    archivedAt: iso(row.archivedAt),
    archiveReason: row.archiveReason,
    createdAt: row.createdAt.toISOString(),
    createdById: row.createdById,
    updatedAt: row.updatedAt.toISOString(),
    updatedById: row.updatedById,
    rowVersion: row.rowVersion,
  };
}

export function toOwnerSubjectView(row: OwnerSubject): OwnerSubjectView {
  return {
    id: row.id,
    ownerId: row.ownerId,
    legalSubjectId: row.legalSubjectId,
    relationshipLabel: row.relationshipLabel,
    sourceId: row.sourceId,
    linkState: row.linkState,
    unlinkedAt: iso(row.unlinkedAt),
    unlinkReason: row.unlinkReason,
    createdAt: row.createdAt.toISOString(),
    createdById: row.createdById,
    updatedAt: row.updatedAt.toISOString(),
    updatedById: row.updatedById,
    rowVersion: row.rowVersion,
  };
}

export function toSignerView(row: Signer): SignerView {
  return {
    id: row.id,
    agencyId: row.agencyId,
    fullLegalName: row.fullLegalName,
    title: row.title,
    contactEmail: row.contactEmail,
    identitySourceId: row.identitySourceId,
    delegationSourceId: row.delegationSourceId,
    operationalState: row.operationalState,
    canonicalCode: row.canonicalCode,
    canonicalSourceId: row.canonicalSourceId,
    bindingState: row.bindingState,
    notes: row.notes,
    archivedAt: iso(row.archivedAt),
    archiveReason: row.archiveReason,
    createdAt: row.createdAt.toISOString(),
    createdById: row.createdById,
    updatedAt: row.updatedAt.toISOString(),
    updatedById: row.updatedById,
    rowVersion: row.rowVersion,
  };
}
