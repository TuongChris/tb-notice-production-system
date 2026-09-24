// Agency — the representing organization (DOMAIN_MODEL_v1 §4). Directory state only: creating or
// activating an Agency creates no authority and no readiness (INVARIANTS §4).
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  Agency as AgencyView,
  ArchiveRequest,
  CreateAgency,
  PatchAgency,
  RecordStateRequest,
} from '@tb/contracts';
import { Prisma, type Agency } from '../../../generated/prisma/client.js';
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
import { toAgencyView } from './views.js';

const ENTITY = 'Agency';

/** Writable contract fields (CreateAgency / PatchAgency). */
const FIELDS = [
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
  'fieldAttributions',
  'notes',
] as const;
const JSON_FIELDS = ['postalAddress', 'fieldAttributions'];

/**
 * Identity-defining fields: the legal entity the record stands for ("a different legal entity needs
 * a different Agency record", DOMAIN_MODEL_v1 §4). displayName and contact data are same-entity
 * corrections and stay editable.
 */
export const AGENCY_IDENTITY_FIELDS = [
  'legalName',
  'organizationType',
  'jurisdictionCountry',
  'registrationAuthority',
  'registrationNumber',
] as const;

@Injectable()
export class AgenciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly writes: WriteExecutor,
    private readonly cursors: CursorCodec,
  ) {}

  /** `q`: case- and accent-insensitive substring of displayName or legalName. */
  async list(query: QueryValues): Promise<{ items: AgencyView[]; nextCursor: string | null }> {
    const q = searchText(query);
    const page = pageRequest(contractOperation('listAgencies'), query, this.cursors, { q });
    const match =
      q === null
        ? Prisma.empty
        : Prisma.sql`AND (display_name COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!'
            OR legal_name COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!')`;
    const ids = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM agencies WHERE 1 = 1 ${match} ${keysetAfter(page.after)}
        ORDER BY created_at DESC, id DESC ${pageLimit(page)}`,
    );
    const rows = await this.prisma.agency.findMany({ where: { id: { in: ids.map((r) => r.id) } } });
    return toPage(inIdOrder(ids, rows), page, this.cursors, toAgencyView);
  }

  async get(id: string): Promise<AgencyView> {
    const row = await this.prisma.agency.findUnique({ where: { id } });
    if (!row) throw apiErrors.notFound();
    return toAgencyView(row);
  }

  /** New Agencies are DRAFT with only the supplied fields; nothing is inferred or bound. */
  create(requester: WriteRequester, body: CreateAgency): Promise<WriteReply> {
    const issues = attributionIssues(ENTITY, body.fieldAttributions);
    if (issues.length > 0) throw apiErrors.fieldAttributionInvalid(issues);
    return this.writes.execute(
      { operationId: 'createAgency', pathParams: {}, body, requester },
      async (context) => {
        const id = randomUUID();
        const uses = attributionSourceUses(body.fieldAttributions);
        await assertSourcesUsable(context.tx, uses, { agencyId: id });
        const row = await context.tx.agency.create({
          data: {
            ...writeData(body, FIELDS, JSON_FIELDS),
            id,
            createdAt: context.now,
            createdById: context.actorUserId,
            updatedAt: context.now,
            updatedById: context.actorUserId,
          } as Prisma.AgencyUncheckedCreateInput,
        });
        await context.audit({
          action: 'AGENCY_CREATED',
          entityType: ENTITY,
          entityId: id,
          after: {
            ...auditFields(row, presentFields(body)),
            recordState: row.recordState,
            rowVersion: row.rowVersion,
          },
          sourceIds: sourceIdsOf(uses),
        });
        return created(ENTITY, toAgencyView(row));
      },
    );
  }

  patch(requester: WriteRequester, id: string, body: PatchAgency): Promise<WriteReply> {
    const issues = attributionIssues(ENTITY, body.fieldAttributions);
    if (issues.length > 0) throw apiErrors.fieldAttributionInvalid(issues);
    return this.writes.execute(
      { operationId: 'patchAgency', pathParams: { id }, body, requester },
      async (context) => {
        const current = await this.lock(context, id);
        assertNotArchived(current.recordState, 'patch');
        const changed = changedFields(current, body);
        const identity = AGENCY_IDENTITY_FIELDS.filter(
          (field) => changed.includes(field) && current[field] !== null,
        );
        if (identity.length > 0) {
          const reasons = await establishedBy(context.tx, ENTITY, current);
          if (reasons.length > 0) throw apiErrors.establishedIdentityImmutable(identity, reasons);
        }
        const uses = changed.includes('fieldAttributions')
          ? attributionSourceUses(body.fieldAttributions)
          : [];
        await assertSourcesUsable(context.tx, uses, { agencyId: id });
        if (changed.length === 0) return unchanged(ENTITY, toAgencyView(current));
        const row = await context.tx.agency.update({
          where: { id, rowVersion: current.rowVersion },
          data: {
            ...writeData(body, changed, JSON_FIELDS),
            rowVersion: { increment: 1 },
            updatedAt: context.now,
            updatedById: context.actorUserId,
          },
        });
        await context.audit({
          action: 'AGENCY_UPDATED',
          entityType: ENTITY,
          entityId: id,
          before: { ...auditFields(current, changed), rowVersion: current.rowVersion },
          after: { ...auditFields(row, changed), rowVersion: row.rowVersion },
          sourceIds: sourceIdsOf(uses),
        });
        return updated(ENTITY, toAgencyView(row));
      },
    );
  }

  archive(requester: WriteRequester, id: string, body: ArchiveRequest): Promise<WriteReply> {
    return this.transition(
      requester,
      'archiveAgency',
      id,
      body,
      'AGENCY_ARCHIVED',
      (current, now) => archiveChange(current.recordState, body.reason, now),
    );
  }

  /** Restores the administrative record to DRAFT only; it never revives any authority. */
  restore(requester: WriteRequester, id: string, body: ArchiveRequest): Promise<WriteReply> {
    return this.transition(requester, 'restoreAgency', id, body, 'AGENCY_RESTORED', (current) =>
      restoreChange(current.recordState),
    );
  }

  /** DRAFT ⇄ ACTIVE. ACTIVE is administrative availability, not authority or readiness. */
  setState(requester: WriteRequester, id: string, body: RecordStateRequest): Promise<WriteReply> {
    return this.transition(
      requester,
      'setAgencyState',
      id,
      body,
      'AGENCY_STATE_CHANGED',
      (current) => stateChange(current.recordState, body.state),
    );
  }

  /** Hard delete only of an unused, unbound DRAFT (decision D5); otherwise 409. */
  delete(requester: WriteRequester, id: string): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'deleteUnusedAgency', pathParams: { id }, body: null, requester },
      async (context) => {
        const current = await this.lock(context, id);
        const blockers: string[] = [];
        if (current.recordState === 'ACTIVE') blockers.push('NOT_DRAFT');
        if (current.recordState === 'ARCHIVED') blockers.push('ARCHIVED');
        if (hasCanonicalBinding(current)) blockers.push('CANONICAL_BINDING');
        blockers.push(...(await dependencyReasons(context.tx, ENTITY, id)));
        if (blockers.length > 0) throw apiErrors.referencedRecordCannotDelete(blockers);
        await context.tx.agency.delete({ where: { id, rowVersion: current.rowVersion } });
        await context.audit({
          action: 'AGENCY_DELETED',
          entityType: ENTITY,
          entityId: id,
          before: {
            ...auditFields(current, ['displayName', 'legalName', 'recordState']),
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
    plan: (current: Agency, now: Date) => RecordLifecycleChange,
  ): Promise<WriteReply> {
    return this.writes.execute(
      { operationId, pathParams: { id }, body, requester },
      async (context) => {
        const current = await this.lock(context, id);
        const change = plan(current, context.now);
        const fields = Object.keys(change);
        const row = await context.tx.agency.update({
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
        return updated(ENTITY, toAgencyView(row));
      },
    );
  }

  /** Locks the Agency row, loads it and checks If-Match (404 before 412). */
  private async lock(context: WriteContext, id: string): Promise<Agency> {
    if (!(await lockForUpdate(context.tx, ENTITY, id))) throw apiErrors.notFound();
    const current = await context.tx.agency.findUniqueOrThrow({ where: { id } });
    context.checkPrecondition({ entityType: ENTITY, id, rowVersion: current.rowVersion });
    return current;
  }
}
