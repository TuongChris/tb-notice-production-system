// Capture rules of a SourceReference (P3A). A SourceReference is immutable capture metadata about a
// source that lives elsewhere (normally the canonical record in Google Drive): a pointer, not the
// evidence, not a permission and not proof of review (DOMAIN_MODEL_v1 §12, INVARIANTS §4). The app
// never fetches the URL, never computes a hash from bytes it does not have and never derives
// provenance from a title, URL, role or the row's existence.
//
//   stored as supplied    every contract field; omitted accessState / reportedProvenance take the
//                         schema defaults NOT_CHECKED / OPERATOR_REPORTED (nothing is upgraded)
//   content hash          contentSha256 and hashTarget come together (a hash without its target
//                         does not say which bytes it covers)            → 422 CONTENT_HASH_INCOMPLETE
//   DOCUMENT_REVIEWED     an attributable report of an actual review: it needs reviewedByLabel
//                         (reviewedAt may stay null when unknown)         → 422 REVIEW_UNATTRIBUTED
//   case scope            no Case exists before the Case phase           → 422 CASE_SCOPE_UNAVAILABLE
//   agency                the owning agency exists (422) and is not archived (409)
//   scopeBindings         named agencies and subjects exist (422) and are not archived (409); an
//                         agency's own source is not shared with another agency
//                                                                         → 422 CROSS_AGENCY_REFERENCE
import type { CreateSource, ReviseSource } from '@tb/contracts';
import { codePointLength } from '@tb/contracts';
import type { Prisma, SourceReference } from '../../../generated/prisma/client.js';
import { apiErrors, type ApiError } from '../../infrastructure/http/api-error.js';
import { auditFields } from '../directory/changes.js';
import { lockForShare } from '../directory/records.js';
import { scopeBindingsOf } from './source-scope.js';

export type SourceCapture = CreateSource | ReviseSource;

/** Writable capture fields (CreateSource and ReviseSource have the same shape). */
export const CAPTURE_FIELDS = [
  'agencyId',
  'title',
  'canonicalUrl',
  'providerFileId',
  'providerRevisionId',
  'sourceRole',
  'accessState',
  'contentSha256',
  'hashTarget',
  'reportedProvenance',
  'rawProvenance',
  'scopeText',
  'scopeBindings',
  'observedAt',
  'reviewedByLabel',
  'reviewedAt',
  'excerpt',
  'excerptLocator',
  'limitations',
] as const;

export const CAPTURE_JSON_FIELDS = ['scopeBindings'];

/** The request-only checks (no database), run before an idempotency claim is taken. */
export function captureProblem(body: SourceCapture): ApiError | null {
  const scope = scopeBindingsOf(body.scopeBindings ?? null);
  if (scope.caseIds.length > 0) return apiErrors.caseScopeUnavailable('scopeBindings.caseIds');
  const hash = body.contentSha256 ?? null;
  const target = body.hashTarget ?? null;
  if ((hash === null) !== (target === null)) {
    return apiErrors.contentHashIncomplete(hash === null ? 'contentSha256' : 'hashTarget');
  }
  if (
    body.reportedProvenance === 'DOCUMENT_REVIEWED' &&
    (body.reviewedByLabel ?? '').trim() === ''
  ) {
    return apiErrors.reviewUnattributed('reviewedByLabel');
  }
  const owner = body.agencyId ?? null;
  if (owner !== null) {
    const index = scope.agencyIds.findIndex((agencyId) => agencyId !== owner);
    if (index >= 0) {
      return apiErrors.crossAgencyReference(`scopeBindings.agencyIds.${index}`, 'scope');
    }
  }
  return null;
}

/**
 * The owning agency and every agency / subject named in scopeBindings exist and are not archived.
 * Rows are share-locked in the lock order (agencies, then legal subjects, each in id order) so none
 * can be archived or deleted while the source that names them is written.
 */
export async function assertScopeRecords(
  tx: Prisma.TransactionClient,
  body: SourceCapture,
  operation: string,
): Promise<void> {
  const scope = scopeBindingsOf(body.scopeBindings ?? null);
  const agencyFields = new Map<string, string>();
  if (body.agencyId) agencyFields.set(body.agencyId, 'agencyId');
  scope.agencyIds.forEach((id, index) => {
    if (!agencyFields.has(id)) agencyFields.set(id, `scopeBindings.agencyIds.${index}`);
  });
  const subjectFields = new Map<string, string>();
  scope.legalSubjectIds.forEach((id, index) => {
    if (!subjectFields.has(id)) subjectFields.set(id, `scopeBindings.legalSubjectIds.${index}`);
  });
  for (const id of [...agencyFields.keys()].sort()) {
    if (!(await lockForShare(tx, 'Agency', id))) {
      throw apiErrors.referenceNotFound(agencyFields.get(id) ?? 'agencyId');
    }
  }
  for (const id of [...subjectFields.keys()].sort()) {
    if (!(await lockForShare(tx, 'LegalSubject', id))) {
      throw apiErrors.referenceNotFound(subjectFields.get(id) ?? 'scopeBindings');
    }
  }
  const agencies = await tx.agency.findMany({
    where: { id: { in: [...agencyFields.keys()] }, recordState: 'ARCHIVED' },
    select: { id: true },
  });
  const subjects = await tx.legalSubject.findMany({
    where: { id: { in: [...subjectFields.keys()] }, recordState: 'ARCHIVED' },
    select: { id: true },
  });
  const archived = agencies[0] ?? subjects[0];
  if (archived !== undefined) {
    throw apiErrors.recordStateConflict({
      record: agencies[0] === undefined ? 'LegalSubject' : 'Agency',
      state: 'ARCHIVED',
      operation,
      field: agencyFields.get(archived.id) ?? subjectFields.get(archived.id),
    });
  }
}

/** Scope bindings compared as sets of ids plus the exact limitation text. */
export function sameScopeBindings(
  a: Prisma.JsonValue | null | undefined,
  b: Prisma.JsonValue | null | undefined,
): boolean {
  const left = scopeBindingsOf(a);
  const right = scopeBindingsOf(b);
  const sameSet = (x: readonly string[], y: readonly string[]) => {
    const xs = [...new Set(x)].sort();
    const ys = [...new Set(y)].sort();
    return xs.length === ys.length && xs.every((value, index) => value === ys[index]);
  };
  return (
    sameSet(left.caseIds, right.caseIds) &&
    sameSet(left.agencyIds, right.agencyIds) &&
    sameSet(left.legalSubjectIds, right.legalSubjectIds) &&
    left.limitation === right.limitation
  );
}

/**
 * The audit record of a capture: metadata only. Free text that may quote the source (scopeText,
 * excerpt, limitations, the scope limitation) is recorded as its length, never copied (INVARIANTS
 * §7; raw evidence stays in Drive).
 */
export function sourceAuditRecord(row: SourceReference): Prisma.InputJsonObject {
  const scope = row.scopeBindings === null ? null : scopeBindingsOf(row.scopeBindings);
  return {
    ...auditFields(row, [
      'agencyId',
      'sourceGroupId',
      'revision',
      'supersedesSourceId',
      'title',
      'canonicalUrl',
      'providerFileId',
      'providerRevisionId',
      'sourceRole',
      'accessState',
      'reportedProvenance',
      'rawProvenance',
      'scopeText',
      'observedAt',
      'reviewedByLabel',
      'reviewedAt',
      'excerpt',
      'excerptLocator',
      'limitations',
    ]),
    // The supplied content digest, under keys the audit key guard accepts (it refuses any key
    // naming a hash, so that no credential digest can ever be logged).
    contentDigest:
      row.contentSha256 === null ? null : { sha256: row.contentSha256, target: row.hashTarget },
    scopeBindings:
      scope === null
        ? null
        : {
            caseIds: [...scope.caseIds],
            legalSubjectIds: [...scope.legalSubjectIds],
            agencyIds: [...scope.agencyIds],
            limitation:
              scope.limitation === null
                ? null
                : { redacted: true, codePoints: codePointLength(scope.limitation) },
          },
  };
}
