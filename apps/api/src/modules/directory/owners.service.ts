// Owner — an internal client/brand namespace (DOMAIN_MODEL_v1 §5). It is not the legal claimant and
// not proof of work ownership: an Owner may exist without any LegalSubject, and nothing is inferred
// from its name, aliases, channels or website.
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  ArchiveRequest,
  CreateOwner,
  Owner as OwnerView,
  PatchOwner,
  RecordStateRequest,
} from '@tb/contracts';
import { Prisma, type Owner } from '../../../generated/prisma/client.js';
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
import { auditFields, changedFields, presentFields, writeData } from './changes.js';
import {
  archiveChange,
  assertNotArchived,
  restoreChange,
  stateChange,
  type RecordLifecycleChange,
} from './lifecycle.js';
import { created, deleted, unchanged, updated } from './outcomes.js';
import { dependencyReasons, hasCanonicalBinding, lockForUpdate } from './records.js';
import { toOwnerView } from './views.js';

const ENTITY = 'Owner';

/** Writable contract fields (CreateOwner / PatchOwner). */
const FIELDS = [
  'displayName',
  'aliases',
  'contactName',
  'contactEmail',
  'sourceChannels',
  'websiteUrl',
  'preferredLanguage',
  'driveFolderUrl',
  'notes',
] as const;
const JSON_FIELDS = ['aliases', 'sourceChannels'];

@Injectable()
export class OwnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly writes: WriteExecutor,
    private readonly cursors: CursorCodec,
  ) {}

  /** `q`: case- and accent-insensitive substring of displayName or an alias. */
  async list(query: QueryValues): Promise<{ items: OwnerView[]; nextCursor: string | null }> {
    const q = searchText(query);
    const page = pageRequest(contractOperation('listOwners'), query, this.cursors, { q });
    const match =
      q === null
        ? Prisma.empty
        : Prisma.sql`AND (display_name COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!'
            OR CAST(aliases AS CHAR) COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!')`;
    const ids = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM owners WHERE 1 = 1 ${match} ${keysetAfter(page.after)}
        ORDER BY created_at DESC, id DESC ${pageLimit(page)}`,
    );
    const rows = await this.prisma.owner.findMany({ where: { id: { in: ids.map((r) => r.id) } } });
    return toPage(inIdOrder(ids, rows), page, this.cursors, toOwnerView);
  }

  async get(id: string): Promise<OwnerView> {
    const row = await this.prisma.owner.findUnique({ where: { id } });
    if (!row) throw apiErrors.notFound();
    return toOwnerView(row);
  }

  create(requester: WriteRequester, body: CreateOwner): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'createOwner', pathParams: {}, body, requester },
      async (context) => {
        const id = randomUUID();
        const row = await context.tx.owner.create({
          data: {
            ...writeData(body, FIELDS, JSON_FIELDS),
            id,
            createdAt: context.now,
            createdById: context.actorUserId,
            updatedAt: context.now,
            updatedById: context.actorUserId,
          } as Prisma.OwnerUncheckedCreateInput,
        });
        await context.audit({
          action: 'OWNER_CREATED',
          entityType: ENTITY,
          entityId: id,
          after: {
            ...auditFields(row, presentFields(body)),
            recordState: row.recordState,
            rowVersion: row.rowVersion,
          },
        });
        return created(ENTITY, toOwnerView(row));
      },
    );
  }

  patch(requester: WriteRequester, id: string, body: PatchOwner): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'patchOwner', pathParams: { id }, body, requester },
      async (context) => {
        const current = await this.lock(context, id);
        assertNotArchived(current.recordState, 'patch');
        const changed = changedFields(current, body);
        if (changed.length === 0) return unchanged(ENTITY, toOwnerView(current));
        const row = await context.tx.owner.update({
          where: { id, rowVersion: current.rowVersion },
          data: {
            ...writeData(body, changed, JSON_FIELDS),
            rowVersion: { increment: 1 },
            updatedAt: context.now,
            updatedById: context.actorUserId,
          },
        });
        await context.audit({
          action: 'OWNER_UPDATED',
          entityType: ENTITY,
          entityId: id,
          before: { ...auditFields(current, changed), rowVersion: current.rowVersion },
          after: { ...auditFields(row, changed), rowVersion: row.rowVersion },
        });
        return updated(ENTITY, toOwnerView(row));
      },
    );
  }

  /** Archives only this namespace: shared LegalSubjects and associations are left as they are. */
  archive(requester: WriteRequester, id: string, body: ArchiveRequest): Promise<WriteReply> {
    return this.transition(requester, 'archiveOwner', id, body, 'OWNER_ARCHIVED', (current, now) =>
      archiveChange(current.recordState, body.reason, now),
    );
  }

  restore(requester: WriteRequester, id: string, body: ArchiveRequest): Promise<WriteReply> {
    return this.transition(requester, 'restoreOwner', id, body, 'OWNER_RESTORED', (current) =>
      restoreChange(current.recordState),
    );
  }

  setState(requester: WriteRequester, id: string, body: RecordStateRequest): Promise<WriteReply> {
    return this.transition(requester, 'setOwnerState', id, body, 'OWNER_STATE_CHANGED', (current) =>
      stateChange(current.recordState, body.state),
    );
  }

  delete(requester: WriteRequester, id: string): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'deleteUnusedOwner', pathParams: { id }, body: null, requester },
      async (context) => {
        const current = await this.lock(context, id);
        const blockers: string[] = [];
        if (current.recordState === 'ACTIVE') blockers.push('NOT_DRAFT');
        if (current.recordState === 'ARCHIVED') blockers.push('ARCHIVED');
        if (hasCanonicalBinding(current)) blockers.push('CANONICAL_BINDING');
        blockers.push(...(await dependencyReasons(context.tx, ENTITY, id)));
        if (blockers.length > 0) throw apiErrors.referencedRecordCannotDelete(blockers);
        await context.tx.owner.delete({ where: { id, rowVersion: current.rowVersion } });
        await context.audit({
          action: 'OWNER_DELETED',
          entityType: ENTITY,
          entityId: id,
          before: {
            ...auditFields(current, ['displayName', 'recordState']),
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
    plan: (current: Owner, now: Date) => RecordLifecycleChange,
  ): Promise<WriteReply> {
    return this.writes.execute(
      { operationId, pathParams: { id }, body, requester },
      async (context) => {
        const current = await this.lock(context, id);
        const change = plan(current, context.now);
        const fields = Object.keys(change);
        const row = await context.tx.owner.update({
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
        return updated(ENTITY, toOwnerView(row));
      },
    );
  }

  private async lock(context: WriteContext, id: string): Promise<Owner> {
    if (!(await lockForUpdate(context.tx, ENTITY, id))) throw apiErrors.notFound();
    const current = await context.tx.owner.findUniqueOrThrow({ where: { id } });
    context.checkPrecondition({ entityType: ENTITY, id, rowVersion: current.rowVersion });
    return current;
  }
}
