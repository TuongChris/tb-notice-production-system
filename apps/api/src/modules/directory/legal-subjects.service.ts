// LegalSubject — the exact individual, legal entity or other party (DOMAIN_MODEL_v1 §6).
// subjectType (INDIVIDUAL | LEGAL_ENTITY | OTHER) is fixed at creation: PatchLegalSubject has no
// subjectType, so a type is never converted ("a change from an individual to a company is a new
// subject"). Names and registration data are matching hints, never global deduplication keys, and
// nothing is inferred from an Owner or brand.
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  ArchiveRequest,
  CreateLegalSubject,
  LegalSubject as LegalSubjectView,
  PatchLegalSubject,
  RecordStateRequest,
} from '@tb/contracts';
import { Prisma, type LegalSubject } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { apiErrors } from '../../infrastructure/http/api-error.js';
import { CursorCodec } from '../../infrastructure/write/cursor.js';
import {
  containsPattern,
  inIdOrder,
  keysetAfter,
  pageLimit,
  pageRequest,
  searchText,
  toPage,
} from '../../infrastructure/write/pagination.js';
import { contractOperation, type QueryValues } from '../../infrastructure/write/request-parsing.js';
import {
  WriteExecutor,
  type WriteContext,
  type WriteReply,
  type WriteRequester,
} from '../../infrastructure/write/write-executor.js';
import { attributionIssues, attributionSourceUses } from './attributions.js';
import { auditFields, changedFields, presentFields, writeData } from './changes.js';
import {
  archiveChange,
  assertNotArchived,
  restoreChange,
  stateChange,
  type RecordLifecycleChange,
} from './lifecycle.js';
import { created, deleted, unchanged, updated } from './outcomes.js';
import { dependencyReasons, establishedBy, hasCanonicalBinding, lockForUpdate } from './records.js';
import { assertSourcesUsable, sourceIdsOf } from './sources.js';
import { toLegalSubjectView } from './views.js';

const ENTITY = 'LegalSubject';

/** Writable contract fields (CreateLegalSubject; subjectType is create-only). */
const FIELDS = [
  'subjectType',
  'legalName',
  'aliases',
  'jurisdictionCountry',
  'legalForm',
  'registrationAuthority',
  'registrationNumber',
  'contactEmail',
  'postalAddress',
  'fieldAttributions',
  'notes',
] as const;
const JSON_FIELDS = ['aliases', 'postalAddress', 'fieldAttributions'];

/**
 * Identity-defining fields of the exact party (subjectType is immutable by contract). Once the
 * subject is established, a set value is never changed or cleared by generic PATCH (AC-005); a
 * documented correction needs the later identity-resolution workflow.
 */
export const LEGAL_SUBJECT_IDENTITY_FIELDS = [
  'legalName',
  'legalForm',
  'jurisdictionCountry',
  'registrationAuthority',
  'registrationNumber',
] as const;

@Injectable()
export class LegalSubjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly writes: WriteExecutor,
    private readonly cursors: CursorCodec,
  ) {}

  /** `q`: case- and accent-insensitive substring of legalName, an alias or registrationNumber. */
  async list(
    query: QueryValues,
  ): Promise<{ items: LegalSubjectView[]; nextCursor: string | null }> {
    const q = searchText(query);
    const page = pageRequest(contractOperation('listLegalSubjects'), query, this.cursors, { q });
    const match =
      q === null
        ? Prisma.empty
        : Prisma.sql`AND (legal_name COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!'
            OR CAST(aliases AS CHAR) COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!'
            OR registration_number COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!')`;
    const ids = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM legal_subjects WHERE 1 = 1 ${match} ${keysetAfter(page.after)}
        ORDER BY created_at DESC, id DESC ${pageLimit(page)}`,
    );
    const rows = await this.prisma.legalSubject.findMany({
      where: { id: { in: ids.map((r) => r.id) } },
    });
    return toPage(inIdOrder(ids, rows), page, this.cursors, toLegalSubjectView);
  }

  async get(id: string): Promise<LegalSubjectView> {
    const row = await this.prisma.legalSubject.findUnique({ where: { id } });
    if (!row) throw apiErrors.notFound();
    return toLegalSubjectView(row);
  }

  create(requester: WriteRequester, body: CreateLegalSubject): Promise<WriteReply> {
    const issues = attributionIssues(ENTITY, body.fieldAttributions);
    if (issues.length > 0) throw apiErrors.fieldAttributionInvalid(issues);
    return this.writes.execute(
      { operationId: 'createLegalSubject', pathParams: {}, body, requester },
      async (context) => {
        const id = randomUUID();
        const uses = attributionSourceUses(body.fieldAttributions);
        await assertSourcesUsable(context.tx, uses, null);
        const row = await context.tx.legalSubject.create({
          data: {
            ...writeData(body, FIELDS, JSON_FIELDS),
            id,
            createdAt: context.now,
            createdById: context.actorUserId,
            updatedAt: context.now,
            updatedById: context.actorUserId,
          } as Prisma.LegalSubjectUncheckedCreateInput,
        });
        await context.audit({
          action: 'LEGAL_SUBJECT_CREATED',
          entityType: ENTITY,
          entityId: id,
          after: {
            ...auditFields(row, presentFields(body)),
            recordState: row.recordState,
            identityReviewState: row.identityReviewState,
            rowVersion: row.rowVersion,
          },
          sourceIds: sourceIdsOf(uses),
        });
        return created(ENTITY, toLegalSubjectView(row));
      },
    );
  }

  patch(requester: WriteRequester, id: string, body: PatchLegalSubject): Promise<WriteReply> {
    const issues = attributionIssues(ENTITY, body.fieldAttributions);
    if (issues.length > 0) throw apiErrors.fieldAttributionInvalid(issues);
    return this.writes.execute(
      { operationId: 'patchLegalSubject', pathParams: { id }, body, requester },
      async (context) => {
        const current = await this.lock(context, id);
        assertNotArchived(current.recordState, 'patch');
        const changed = changedFields(current, body);
        const identity = LEGAL_SUBJECT_IDENTITY_FIELDS.filter(
          (field) => changed.includes(field) && current[field] !== null,
        );
        if (identity.length > 0) {
          const reasons = await establishedBy(context.tx, ENTITY, current);
          if (reasons.length > 0) throw apiErrors.establishedIdentityImmutable(identity, reasons);
        }
        const uses = changed.includes('fieldAttributions')
          ? attributionSourceUses(body.fieldAttributions)
          : [];
        await assertSourcesUsable(context.tx, uses, null);
        if (changed.length === 0) return unchanged(ENTITY, toLegalSubjectView(current));
        const row = await context.tx.legalSubject.update({
          where: { id, rowVersion: current.rowVersion },
          data: {
            ...writeData(body, changed, JSON_FIELDS),
            rowVersion: { increment: 1 },
            updatedAt: context.now,
            updatedById: context.actorUserId,
          },
        });
        await context.audit({
          action: 'LEGAL_SUBJECT_UPDATED',
          entityType: ENTITY,
          entityId: id,
          before: { ...auditFields(current, changed), rowVersion: current.rowVersion },
          after: { ...auditFields(row, changed), rowVersion: row.rowVersion },
          sourceIds: sourceIdsOf(uses),
        });
        return updated(ENTITY, toLegalSubjectView(row));
      },
    );
  }

  archive(requester: WriteRequester, id: string, body: ArchiveRequest): Promise<WriteReply> {
    return this.transition(
      requester,
      'archiveLegalSubject',
      id,
      body,
      'LEGAL_SUBJECT_ARCHIVED',
      (current, now) => archiveChange(current.recordState, body.reason, now),
    );
  }

  restore(requester: WriteRequester, id: string, body: ArchiveRequest): Promise<WriteReply> {
    return this.transition(
      requester,
      'restoreLegalSubject',
      id,
      body,
      'LEGAL_SUBJECT_RESTORED',
      (current) => restoreChange(current.recordState),
    );
  }

  setState(requester: WriteRequester, id: string, body: RecordStateRequest): Promise<WriteReply> {
    return this.transition(
      requester,
      'setLegalSubjectState',
      id,
      body,
      'LEGAL_SUBJECT_STATE_CHANGED',
      (current) => stateChange(current.recordState, body.state),
    );
  }

  delete(requester: WriteRequester, id: string): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'deleteUnusedLegalSubject', pathParams: { id }, body: null, requester },
      async (context) => {
        const current = await this.lock(context, id);
        const blockers: string[] = [];
        if (current.recordState === 'ACTIVE') blockers.push('NOT_DRAFT');
        if (current.recordState === 'ARCHIVED') blockers.push('ARCHIVED');
        if (hasCanonicalBinding(current)) blockers.push('CANONICAL_BINDING');
        blockers.push(...(await dependencyReasons(context.tx, ENTITY, id)));
        if (blockers.length > 0) throw apiErrors.referencedRecordCannotDelete(blockers);
        await context.tx.legalSubject.delete({ where: { id, rowVersion: current.rowVersion } });
        await context.audit({
          action: 'LEGAL_SUBJECT_DELETED',
          entityType: ENTITY,
          entityId: id,
          before: {
            ...auditFields(current, ['subjectType', 'legalName', 'recordState']),
            rowVersion: current.rowVersion,
          },
        });
        return deleted(ENTITY, id);
      },
    );
  }

  private transition(
    requester: WriteRequester,
    operationId: string,
    id: string,
    body: ArchiveRequest | RecordStateRequest,
    action: string,
    plan: (current: LegalSubject, now: Date) => RecordLifecycleChange,
  ): Promise<WriteReply> {
    return this.writes.execute(
      { operationId, pathParams: { id }, body, requester },
      async (context) => {
        const current = await this.lock(context, id);
        const change = plan(current, context.now);
        const fields = Object.keys(change);
        const row = await context.tx.legalSubject.update({
          where: { id, rowVersion: current.rowVersion },
          data: {
            ...change,
            rowVersion: { increment: 1 },
            updatedAt: context.now,
            updatedById: context.actorUserId,
          },
        });
        await context.audit({
          action,
          entityType: ENTITY,
          entityId: id,
          before: { ...auditFields(current, fields), rowVersion: current.rowVersion },
          after: { ...auditFields(row, fields), rowVersion: row.rowVersion },
          reason: body.reason,
        });
        return updated(ENTITY, toLegalSubjectView(row));
      },
    );
  }

  private async lock(context: WriteContext, id: string): Promise<LegalSubject> {
    if (!(await lockForUpdate(context.tx, ENTITY, id))) throw apiErrors.notFound();
    const current = await context.tx.legalSubject.findUniqueOrThrow({ where: { id } });
    context.checkPrecondition({ entityType: ENTITY, id, rowVersion: current.rowVersion });
    return current;
  }
}
