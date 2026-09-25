// Rules shared by the case intake services (P4B): ReportedItem, CaseWork, UseMapping and CaseFact
// are case-specific records. A child is always found through the exact case of the request path —
// another case's child is 404 exactly like an unknown one — and a child named in a request body must
// belong to the same case (422 REFERENCE_NOT_FOUND for an unknown id, 422 CROSS_CASE_REFERENCE for
// another case's record, API_CONTRACT_v1 §5; the composite foreign keys (id, case_id) are the
// backstop). Nothing is matched, copied or inherited across cases by URL, title, video id, agency,
// owner, route, mandate or coverage.
//
// None of these records is a legal finding: a reported item is not an infringement finding, a work
// is not ownership proof, a mapping is not an infringement or audiovisual-identity finding, and a
// fact is an explicit, attributed, case-specific assertion — never inferred from silence,
// similarity, a URL, a publication or the existence of a source.
//
// Lock order (records.ts): CaseRecord (update) → CaseSource → CaseWork → ReportedItem → UseMapping →
// CaseFact → SourceReference. Every P4B write locks its CaseRecord first, so the writes of one case
// are serialized and a child's state read under the case lock is current.
import type { AffectedResource } from '@tb/contracts';
import type { CaseRecord, Prisma } from '../../../generated/prisma/client.js';
import {
  apiErrors,
  type ApiError,
  type ValidationIssue,
} from '../../infrastructure/http/api-error.js';
import type { WriteContext } from '../../infrastructure/write/write-executor.js';
import { lockForShare, lockForUpdate, type RecordEntity } from '../directory/records.js';
import { CASE_ENTITY, lockCase } from './case-rules.js';

/** The intake record types, with their Prisma delegates' common shape. */
export type IntakeEntity = 'ReportedItem' | 'CaseWork' | 'UseMapping' | 'CaseFact';

interface CaseOwned {
  readonly caseId: string;
}

/** The immutable owning case of a child, read without a lock (a child never moves). */
export async function childCase(
  tx: Prisma.TransactionClient,
  entity: IntakeEntity,
  id: string,
): Promise<string | null> {
  const select = { select: { caseId: true } } as const;
  let row: CaseOwned | null;
  switch (entity) {
    case 'ReportedItem':
      row = await tx.reportedItem.findUnique({ where: { id }, ...select });
      break;
    case 'CaseWork':
      row = await tx.caseWork.findUnique({ where: { id }, ...select });
      break;
    case 'UseMapping':
      row = await tx.useMapping.findUnique({ where: { id }, ...select });
      break;
    case 'CaseFact':
      row = await tx.caseFact.findUnique({ where: { id }, ...select });
      break;
  }
  return row?.caseId ?? null;
}

/**
 * Locks the case of the request path FOR UPDATE, then the child named by the path FOR UPDATE; 404
 * when the case or the child does not exist or the child belongs to another case (nothing of the
 * other case is locked or revealed).
 */
export async function lockCaseChild(
  tx: Prisma.TransactionClient,
  entity: IntakeEntity,
  caseId: string,
  id: string,
): Promise<CaseRecord> {
  if ((await childCase(tx, entity, id)) !== caseId) throw apiErrors.notFound();
  const caseRow = await lockCase(tx, caseId);
  if (!(await lockForUpdate(tx, entity as RecordEntity, id))) throw apiErrors.notFound();
  return caseRow;
}

/** 409: an archived intake record is read-only except restore. */
export function assertChildWritable(
  row: { readonly archivedAt: Date | null },
  record: IntakeEntity,
  operation: string,
): void {
  if (row.archivedAt !== null) {
    throw apiErrors.recordStateConflict({ record, archived: true, operation });
  }
}

/**
 * A record named in a request body (a mapping's work and reported item, a fact's scope target):
 * it exists (422 REFERENCE_NOT_FOUND), belongs to this case (422 CROSS_CASE_REFERENCE) and is not
 * archived (409 — nothing new is recorded against archived material). Share-locked; the case lock
 * is already held.
 */
export async function assertBodyChild(
  tx: Prisma.TransactionClient,
  entity: Exclude<IntakeEntity, 'CaseFact'>,
  caseId: string,
  id: string,
  field: string,
  operation: string,
): Promise<void> {
  const owner = await childCase(tx, entity, id);
  if (owner === null) throw apiErrors.referenceNotFound(field);
  if (owner !== caseId) throw apiErrors.crossCaseReference(field, 'record');
  await lockForShare(tx, entity, id);
  const archivedAt = await childArchivedAt(tx, entity, id);
  if (archivedAt !== null) {
    throw apiErrors.recordStateConflict({ record: entity, archived: true, operation, field });
  }
}

async function childArchivedAt(
  tx: Prisma.TransactionClient,
  entity: Exclude<IntakeEntity, 'CaseFact'>,
  id: string,
): Promise<Date | null> {
  const select = { select: { archivedAt: true } } as const;
  switch (entity) {
    case 'ReportedItem':
      return (await tx.reportedItem.findUniqueOrThrow({ where: { id }, ...select })).archivedAt;
    case 'CaseWork':
      return (await tx.caseWork.findUniqueOrThrow({ where: { id }, ...select })).archivedAt;
    case 'UseMapping':
      return (await tx.useMapping.findUniqueOrThrow({ where: { id }, ...select })).archivedAt;
  }
}

/**
 * The case's version moves with every change of its intake material, and its context revision too
 * when the change is material (INVARIANTS §5; API_CONTRACT_v1 §6: "editing a mapping uses that
 * mapping's ETag but still locks and increments the parent case's context revision").
 */
export async function touchCaseFor(context: WriteContext, row: CaseRecord): Promise<CaseRecord> {
  return context.tx.caseRecord.update({
    where: { id: row.id, rowVersion: row.rowVersion },
    data: {
      rowVersion: { increment: 1 },
      contextRevision: { increment: 1 },
      updatedAt: context.now,
      updatedById: context.actorUserId,
    },
  });
}

/** The case versions recorded in an intake audit event. */
export function caseVersions(row: CaseRecord): {
  caseRowVersion: number;
  caseContextRevision: number;
} {
  return { caseRowVersion: row.rowVersion, caseContextRevision: row.contextRevision };
}

/** The case as an affected resource of an intake write (its version moved). */
export function caseAffected(row: CaseRecord): AffectedResource {
  return { type: CASE_ENTITY, id: row.id, rowVersion: row.rowVersion };
}

// ---------------------------------------------------------------------------------------------
// UseMapping values (DOMAIN_MODEL_v1 §11; DATABASE_SCHEMA_v1 CHECK constraints): unsigned integer
// milliseconds as decimal strings bounded by 9007199254740991, stored as BIGINT UNSIGNED (never SQL
// TIME); unknown bounds stay null and are never fabricated; a known end must exceed its known start;
// the boundary convention is UNKNOWN, HALF_OPEN or INCLUSIVE; raw timecodes are kept as supplied and
// never reinterpreted. Equal durations or matching endpoints never prove audiovisual identity.
// ---------------------------------------------------------------------------------------------

export const MAX_MILLISECONDS = 9007199254740991n;
export const BOUNDARY_CONVENTIONS: readonly string[] = ['UNKNOWN', 'HALF_OPEN', 'INCLUSIVE'];
export const MILLISECOND_FIELDS = [
  'sourceStartMs',
  'sourceEndMs',
  'reportedStartMs',
  'reportedEndMs',
] as const;
export type MillisecondField = (typeof MILLISECOND_FIELDS)[number];
const INTERVALS: ReadonlyArray<readonly [MillisecondField, MillisecondField]> = [
  ['sourceStartMs', 'sourceEndMs'],
  ['reportedStartMs', 'reportedEndMs'],
];

/**
 * 422 VALIDATION_FAILED for supplied values the contract pattern admits but the domain does not:
 * a millisecond value above 9007199254740991 (the pattern admits 16 digits) and a boundary
 * convention outside UNKNOWN / HALF_OPEN / INCLUSIVE (the contract allows any 1–40 characters; the
 * database CHECK is the backstop).
 */
export function mappingValueProblem(body: Readonly<Record<string, unknown>>): ApiError | null {
  const issues: ValidationIssue[] = [];
  for (const field of MILLISECOND_FIELDS) {
    const value = body[field];
    if (typeof value === 'string' && BigInt(value) > MAX_MILLISECONDS) {
      issues.push({ path: field, message: 'Must be at most 9007199254740991 milliseconds' });
    }
  }
  const convention = body['boundaryConvention'];
  if (typeof convention === 'string' && !BOUNDARY_CONVENTIONS.includes(convention)) {
    issues.push({
      path: 'boundaryConvention',
      message: 'Must be UNKNOWN, HALF_OPEN or INCLUSIVE',
    });
  }
  return issues.length === 0 ? null : apiErrors.bodyValidationFailed(issues);
}

/**
 * 422 TIME_RANGE_INVALID when an interval has both bounds and the end does not exceed the start —
 * checked on the state that would be stored (a PATCH merged onto the current row). A missing bound
 * is unknown and never checked against anything.
 */
export function intervalProblem(
  state: Readonly<Record<MillisecondField, string | null>>,
): ApiError | null {
  for (const [start, end] of INTERVALS) {
    const from = state[start];
    const to = state[end];
    if (from !== null && to !== null && BigInt(to) <= BigInt(from)) {
      return apiErrors.timeRangeInvalid([start, end]);
    }
  }
  return null;
}

/** A contract millisecond string as the BIGINT the column stores (null stays null). */
export function toMilliseconds(value: string | null): bigint | null {
  return value === null ? null : BigInt(value);
}

// ---------------------------------------------------------------------------------------------
// CaseFact scope (INVARIANTS §3: "FactScope is exactly CASE or one of WORK/REPORTED_ITEM/USE with
// matching nullable keys — API/service check"): CASE names no record; WORK names exactly its work,
// REPORTED_ITEM exactly its reported item and USE exactly its mapping. No other id is accepted "for
// context", and a scope is never broadened or narrowed by the server.
// ---------------------------------------------------------------------------------------------

export const SCOPE_TARGETS = {
  CASE: null,
  WORK: 'caseWorkId',
  REPORTED_ITEM: 'reportedItemId',
  USE: 'mappingId',
} as const;
export type ScopeKind = keyof typeof SCOPE_TARGETS;
export const TARGET_FIELDS = ['caseWorkId', 'reportedItemId', 'mappingId'] as const;
export type TargetField = (typeof TARGET_FIELDS)[number];
export const TARGET_ENTITY: Readonly<Record<TargetField, Exclude<IntakeEntity, 'CaseFact'>>> = {
  caseWorkId: 'CaseWork',
  reportedItemId: 'ReportedItem',
  mappingId: 'UseMapping',
};

export interface FactScopeInput {
  readonly scopeKind: ScopeKind;
  readonly caseWorkId?: string | null;
  readonly reportedItemId?: string | null;
  readonly mappingId?: string | null;
}

/** The exact scope of a fact request, or 422 FACT_SCOPE_INVALID naming the offending field. */
export function factScope(body: FactScopeInput): {
  readonly scopeKind: ScopeKind;
  readonly targets: Readonly<Record<TargetField, string | null>>;
} {
  const required = SCOPE_TARGETS[body.scopeKind];
  const targets = {
    caseWorkId: body.caseWorkId ?? null,
    reportedItemId: body.reportedItemId ?? null,
    mappingId: body.mappingId ?? null,
  };
  for (const field of TARGET_FIELDS) {
    if (field === required && targets[field] === null) {
      throw apiErrors.factScopeInvalid(field, body.scopeKind, 'TARGET_REQUIRED');
    }
    if (field !== required && targets[field] !== null) {
      throw apiErrors.factScopeInvalid(field, body.scopeKind, 'TARGET_NOT_ALLOWED');
    }
  }
  return { scopeKind: body.scopeKind, targets };
}
