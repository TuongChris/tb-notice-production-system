// Signer — a person in one Agency's capacity (DOMAIN_MODEL_v1 §7). A Signer is not an application
// User, a directory record creates no G7 and signs nothing. Operational state is administrative
// only (R5 interpretation C): no state implies mandate coverage, eligibility, G7, signature
// authority or notice adoption; eligibility comes from CoverageSigner scope, which is not part of
// P2. agencyId is fixed at creation (PatchSigner has no agencyId; AC-006). Identity and delegation
// sources are optional pointers to existing sources of the same agency; none is invented.
//
// Lifecycle: operationalState DRAFT | AVAILABLE | PAUSED | ENDED is changed only by the state
// command (any other state, with a reason); archive/restore is an orthogonal administrative flag
// (archivedAt) that leaves the operational state unchanged. An archived Signer is read-only.
// Canonical binding (P3A) records the source of the person's identity; once bound, fullLegalName is
// locked against generic PATCH. The binding is not delegation, coverage, eligibility or G7.
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  ArchiveRequest,
  CanonicalBindingRequest,
  CreateSigner,
  PatchSigner,
  Signer as SignerView,
  SignerStateRequest,
} from '@tb/contracts';
import { Prisma, type Signer } from '../../../generated/prisma/client.js';
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
import { applyCanonicalBinding } from './canonical-binding.js';
import { created, deleted, unchanged, updated } from './outcomes.js';
import { dependencyReasons, hasCanonicalBinding, lockForShare, lockForUpdate } from './records.js';
import { assertSourcesUsable, sourceIdsOf, type SourceUse } from '../sources/source-scope.js';
import { toSignerView } from './views.js';

const ENTITY = 'Signer';

/** Writable contract fields (CreateSigner; agencyId is create-only). */
const FIELDS = [
  'agencyId',
  'fullLegalName',
  'title',
  'contactEmail',
  'identitySourceId',
  'delegationSourceId',
  'notes',
] as const;

function sourceUses(body: {
  readonly identitySourceId?: string | null;
  readonly delegationSourceId?: string | null;
}): SourceUse[] {
  const uses: SourceUse[] = [];
  if (body.identitySourceId)
    uses.push({ field: 'identitySourceId', sourceId: body.identitySourceId });
  if (body.delegationSourceId) {
    uses.push({ field: 'delegationSourceId', sourceId: body.delegationSourceId });
  }
  return uses;
}

@Injectable()
export class SignersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly writes: WriteExecutor,
    private readonly cursors: CursorCodec,
  ) {}

  /** `agencyId`: exact agency filter. `q`: case- and accent-insensitive fullLegalName or title. */
  async list(query: QueryValues): Promise<{ items: SignerView[]; nextCursor: string | null }> {
    const q = searchText(query);
    const agencyId = typeof query['agencyId'] === 'string' ? query['agencyId'] : null;
    const page = pageRequest(contractOperation('listSigners'), query, this.cursors, {
      q,
      agencyId,
    });
    const match =
      q === null
        ? Prisma.empty
        : Prisma.sql`AND (full_legal_name COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!'
            OR title COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!')`;
    const agency = agencyId === null ? Prisma.empty : Prisma.sql`AND agency_id = ${agencyId}`;
    const ids = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM signers WHERE 1 = 1 ${agency} ${match} ${keysetAfter(page.after)}
        ORDER BY created_at DESC, id DESC ${pageLimit(page)}`,
    );
    const rows = await this.prisma.signer.findMany({ where: { id: { in: ids.map((r) => r.id) } } });
    return toPage(inIdOrder(ids, rows), page, this.cursors, toSignerView);
  }

  async get(id: string): Promise<SignerView> {
    const row = await this.prisma.signer.findUnique({ where: { id } });
    if (!row) throw apiErrors.notFound();
    return toSignerView(row);
  }

  /** New Signers are DRAFT in an existing, non-archived Agency (the Agency row is share-locked). */
  create(requester: WriteRequester, body: CreateSigner): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'createSigner', pathParams: {}, body, requester },
      async (context) => {
        if (!(await lockForShare(context.tx, 'Agency', body.agencyId))) {
          throw apiErrors.referenceNotFound('agencyId');
        }
        const agency = await context.tx.agency.findUniqueOrThrow({
          where: { id: body.agencyId },
          select: { recordState: true },
        });
        if (agency.recordState === 'ARCHIVED') {
          throw apiErrors.recordStateConflict({
            record: 'Agency',
            state: 'ARCHIVED',
            operation: 'createSigner',
          });
        }
        const uses = sourceUses(body);
        await assertSourcesUsable(context.tx, uses, { kind: 'Agency', agencyId: body.agencyId });
        const id = randomUUID();
        const row = await context.tx.signer.create({
          data: {
            ...writeData(body, FIELDS, []),
            id,
            createdAt: context.now,
            createdById: context.actorUserId,
            updatedAt: context.now,
            updatedById: context.actorUserId,
          } as Prisma.SignerUncheckedCreateInput,
        });
        await context.audit({
          action: 'SIGNER_CREATED',
          entityType: ENTITY,
          entityId: id,
          after: {
            ...auditFields(row, presentFields(body)),
            operationalState: row.operationalState,
            rowVersion: row.rowVersion,
          },
          sourceIds: sourceIdsOf(uses),
        });
        return created(ENTITY, toSignerView(row));
      },
    );
  }

  patch(requester: WriteRequester, id: string, body: PatchSigner): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'patchSigner', pathParams: { id }, body, requester },
      async (context) => {
        const current = await this.lock(context, id);
        this.assertNotArchived(current, 'patch');
        const changed = changedFields(current, body);
        // A canonical binding records the source of this person's identity; the bound name is no
        // longer changed by generic PATCH (a correction needs a reconciliation workflow).
        if (changed.includes('fullLegalName') && hasCanonicalBinding(current)) {
          throw apiErrors.establishedIdentityImmutable(['fullLegalName'], ['CANONICAL_BINDING']);
        }
        const uses = sourceUses({
          ...(changed.includes('identitySourceId')
            ? { identitySourceId: body.identitySourceId ?? null }
            : {}),
          ...(changed.includes('delegationSourceId')
            ? { delegationSourceId: body.delegationSourceId ?? null }
            : {}),
        });
        await assertSourcesUsable(context.tx, uses, { kind: 'Agency', agencyId: current.agencyId });
        if (changed.length === 0) return unchanged(ENTITY, toSignerView(current));
        const row = await context.tx.signer.update({
          where: { id, rowVersion: current.rowVersion },
          data: {
            ...writeData(body, changed, []),
            rowVersion: { increment: 1 },
            updatedAt: context.now,
            updatedById: context.actorUserId,
          },
        });
        await context.audit({
          action: 'SIGNER_UPDATED',
          entityType: ENTITY,
          entityId: id,
          before: { ...auditFields(current, changed), rowVersion: current.rowVersion },
          after: { ...auditFields(row, changed), rowVersion: row.rowVersion },
          sourceIds: sourceIdsOf(uses),
        });
        return updated(ENTITY, toSignerView(row));
      },
    );
  }

  archive(requester: WriteRequester, id: string, body: ArchiveRequest): Promise<WriteReply> {
    return this.transition(
      requester,
      'archiveSigner',
      id,
      body,
      'SIGNER_ARCHIVED',
      (current, now) => {
        if (current.archivedAt !== null) {
          throw apiErrors.recordStateConflict({ archived: true, operation: 'archive' });
        }
        return { archivedAt: now, archiveReason: body.reason };
      },
    );
  }

  /** Clears the archive flag only; the operational state and any authority are unchanged. */
  restore(requester: WriteRequester, id: string, body: ArchiveRequest): Promise<WriteReply> {
    return this.transition(requester, 'restoreSigner', id, body, 'SIGNER_RESTORED', (current) => {
      if (current.archivedAt === null) {
        throw apiErrors.recordStateConflict({ archived: false, operation: 'restore' });
      }
      return { archivedAt: null, archiveReason: null };
    });
  }

  setState(requester: WriteRequester, id: string, body: SignerStateRequest): Promise<WriteReply> {
    return this.transition(
      requester,
      'setSignerState',
      id,
      body,
      'SIGNER_STATE_CHANGED',
      (current) => {
        this.assertNotArchived(current, 'state');
        if (current.operationalState === body.state) {
          throw apiErrors.recordStateConflict({
            state: current.operationalState,
            requested: body.state,
            operation: 'state',
          });
        }
        return { operationalState: body.state };
      },
    );
  }

  delete(requester: WriteRequester, id: string): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'deleteUnusedSigner', pathParams: { id }, body: null, requester },
      async (context) => {
        const current = await this.lock(context, id);
        const blockers: string[] = [];
        if (current.operationalState !== 'DRAFT') blockers.push('NOT_DRAFT');
        if (current.archivedAt !== null) blockers.push('ARCHIVED');
        if (hasCanonicalBinding(current)) blockers.push('CANONICAL_BINDING');
        blockers.push(...(await dependencyReasons(context.tx, ENTITY, id)));
        if (blockers.length > 0) throw apiErrors.referencedRecordCannotDelete(blockers);
        await context.tx.signer.delete({ where: { id, rowVersion: current.rowVersion } });
        await context.audit({
          action: 'SIGNER_DELETED',
          entityType: ENTITY,
          entityId: id,
          before: {
            ...auditFields(current, ['agencyId', 'fullLegalName', 'operationalState']),
            rowVersion: current.rowVersion,
          },
        });
        return deleted(ENTITY, id);
      },
    );
  }

  private assertNotArchived(current: Signer, operation: string): void {
    if (current.archivedAt !== null) {
      throw apiErrors.recordStateConflict({ archived: true, operation });
    }
  }

  private transition(
    requester: WriteRequester,
    operationId: string,
    id: string,
    body: ArchiveRequest | SignerStateRequest,
    action: string,
    plan: (
      current: Signer,
      now: Date,
    ) => Partial<Pick<Signer, 'archivedAt' | 'archiveReason' | 'operationalState'>>,
  ): Promise<WriteReply> {
    return this.writes.execute(
      { operationId, pathParams: { id }, body, requester },
      async (context) => {
        const current = await this.lock(context, id);
        const change = plan(current, context.now);
        const fields = Object.keys(change);
        const row = await context.tx.signer.update({
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
        return updated(ENTITY, toSignerView(row));
      },
    );
  }

  /**
   * Records the SourceReference that holds this signer's canonical code (canonical-binding.ts):
   * an identity/reference association only — no rights, authority, eligibility or readiness.
   */
  bindCanonical(
    requester: WriteRequester,
    id: string,
    body: CanonicalBindingRequest,
  ): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'bindCanonicalSigner', pathParams: { id }, body, requester },
      async (context) => {
        const current = await this.lock(context, id);
        const row = await applyCanonicalBinding(context, {
          entity: ENTITY,
          operation: 'bindCanonicalSigner',
          current,
          archived: current.archivedAt !== null,
          body,
          scope: { kind: 'Agency', agencyId: current.agencyId },
          codeHolder: async (code) =>
            (
              await context.tx.signer.findFirst({
                where: { canonicalCode: code },
                select: { id: true },
              })
            )?.id ?? null,
          update: (data) =>
            context.tx.signer.update({ where: { id, rowVersion: current.rowVersion }, data }),
        });
        return updated(ENTITY, toSignerView(row));
      },
    );
  }

  private async lock(context: WriteContext, id: string): Promise<Signer> {
    if (!(await lockForUpdate(context.tx, ENTITY, id))) throw apiErrors.notFound();
    const current = await context.tx.signer.findUniqueOrThrow({ where: { id } });
    context.checkPrecondition({ entityType: ENTITY, id, rowVersion: current.rowVersion });
    return current;
  }
}
