// Mandate (P3B) — the durable container of one Agency's representation/appointment record
// (DOMAIN_MODEL_v1 §9: "Logical identity belongs to one Agency. label is the administrative name;
// canonicalCode and externalAuthorizationReference are distinct. One mandate can support several
// subject-specific routes"). A Mandate row is not authority: it proves no current effectiveness,
// scope, signer eligibility, owner rights or case standing. It has no state beyond the
// administrative archive flag; the documentary terms live in its versions, the scope in their
// coverages, and later source-backed changes in authority events.
//
//   create      agencyId (an existing, unarchived Agency) + label; externalReference, description
//               and notes as supplied. Nothing is inferred or created alongside it: no version,
//               date, scope, platform, signer or status.
//   patch       label, externalReference, description, notes with If-Match; the agency never
//               changes (not in PatchMandate → 422); a no-op PATCH writes nothing.
//   archive     administrative flag only (archivedAt / archiveReason): versions, coverages,
//               signers and events stay as they are, nothing is revoked, no event is recorded; an
//               archived mandate is read-only except restore.
//   restore     clears the flag; revives nothing; refused while the agency is archived.
//   delete      only an unused mandate: not archived, not canonically bound, no version, no event
//               and no snapshot reference → otherwise 409 REFERENCED_RECORD_CANNOT_DELETE.
//   canonical   canonical-binding.ts with the mandate's agency as the source scope.
// Lock order: Agency (share) → Mandate (update) → SourceReference.
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  ArchiveRequest,
  CanonicalBindingRequest,
  CreateMandate,
  Mandate as MandateView,
  PatchMandate,
} from '@tb/contracts';
import { Prisma, type Mandate } from '../../../generated/prisma/client.js';
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
import { applyCanonicalBinding } from '../directory/canonical-binding.js';
import { auditFields, changedFields, presentFields, writeData } from '../directory/changes.js';
import { created, deleted, unchanged, updated } from '../directory/outcomes.js';
import {
  dependencyReasons,
  hasCanonicalBinding,
  lockForShare,
  lockForUpdate,
} from '../directory/records.js';
import { assertMandateUsable, lockUnarchivedAgencies } from './authority-chain.js';
import { toMandateView } from './authority-views.js';

const ENTITY = 'Mandate';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Writable contract fields (CreateMandate; agencyId is create-only). */
const FIELDS = ['agencyId', 'label', 'externalReference', 'description', 'notes'] as const;
const ARCHIVE_FIELDS = ['archivedAt', 'archiveReason'] as const;

@Injectable()
export class MandatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly writes: WriteExecutor,
    private readonly cursors: CursorCodec,
  ) {}

  /**
   * `agencyId`: exact agency filter. `q`: literal, case- and accent-insensitive substring of the
   * label, the external reference or the canonical code, or the exact mandate id.
   */
  async list(query: QueryValues): Promise<{ items: MandateView[]; nextCursor: string | null }> {
    const q = searchText(query);
    const agencyId = typeof query['agencyId'] === 'string' ? query['agencyId'] : null;
    const page = pageRequest(contractOperation('listMandates'), query, this.cursors, {
      q,
      agencyId,
    });
    const agency = agencyId === null ? Prisma.empty : Prisma.sql`AND m.agency_id = ${agencyId}`;
    const exact = q !== null && UUID.test(q) ? Prisma.sql`OR m.id = ${q}` : Prisma.empty;
    const match =
      q === null
        ? Prisma.empty
        : Prisma.sql`AND (m.label COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!'
            OR m.external_reference COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!'
            OR m.canonical_code COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!'
            ${exact})`;
    const ids = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT m.id FROM mandates m WHERE 1 = 1 ${agency} ${match}
        ${keysetAfter(page.after, 'm')}
        ORDER BY m.created_at DESC, m.id DESC ${pageLimit(page)}`,
    );
    const rows = await this.prisma.mandate.findMany({
      where: { id: { in: ids.map((row) => row.id) } },
    });
    return toPage(inIdOrder(ids, rows), page, this.cursors, toMandateView);
  }

  async get(id: string): Promise<MandateView> {
    const row = await this.prisma.mandate.findUnique({ where: { id } });
    if (!row) throw apiErrors.notFound();
    return toMandateView(row);
  }

  /** A new mandate of an existing, unarchived agency — a container only, with nothing inferred. */
  create(requester: WriteRequester, body: CreateMandate): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'createMandate', pathParams: {}, body, requester },
      async (context) => {
        await lockUnarchivedAgencies(
          context.tx,
          [{ id: body.agencyId, field: 'agencyId' }],
          'createMandate',
        );
        const id = randomUUID();
        const row = await context.tx.mandate.create({
          data: {
            ...writeData(body, FIELDS, []),
            id,
            createdAt: context.now,
            createdById: context.actorUserId,
            updatedAt: context.now,
            updatedById: context.actorUserId,
          } as Prisma.MandateUncheckedCreateInput,
        });
        await context.audit({
          action: 'MANDATE_CREATED',
          entityType: ENTITY,
          entityId: id,
          after: { ...auditFields(row, presentFields(body)), rowVersion: row.rowVersion },
        });
        return created(ENTITY, toMandateView(row));
      },
    );
  }

  patch(requester: WriteRequester, id: string, body: PatchMandate): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'patchMandate', pathParams: { id }, body, requester },
      async (context) => {
        const current = await this.lock(context, id);
        assertMandateUsable(current, 'patch');
        const changed = changedFields(current, body);
        if (changed.length === 0) return unchanged(ENTITY, toMandateView(current));
        const row = await context.tx.mandate.update({
          where: { id, rowVersion: current.rowVersion },
          data: {
            ...writeData(body, changed, []),
            rowVersion: { increment: 1 },
            updatedAt: context.now,
            updatedById: context.actorUserId,
          },
        });
        await context.audit({
          action: 'MANDATE_UPDATED',
          entityType: ENTITY,
          entityId: id,
          before: { ...auditFields(current, changed), rowVersion: current.rowVersion },
          after: { ...auditFields(row, changed), rowVersion: row.rowVersion },
        });
        return updated(ENTITY, toMandateView(row));
      },
    );
  }

  /** Discards an unused mandate; anything that refers to it (history included) blocks deletion. */
  delete(requester: WriteRequester, id: string): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'deleteUnusedMandate', pathParams: { id }, body: null, requester },
      async (context) => {
        const current = await this.lock(context, id);
        const blockers: string[] = [];
        if (current.archivedAt !== null) blockers.push('ARCHIVED');
        if (hasCanonicalBinding(current)) blockers.push('CANONICAL_BINDING');
        blockers.push(...(await dependencyReasons(context.tx, ENTITY, id)));
        if (blockers.length > 0) throw apiErrors.referencedRecordCannotDelete(blockers);
        await context.tx.mandate.delete({ where: { id, rowVersion: current.rowVersion } });
        await context.audit({
          action: 'MANDATE_DELETED',
          entityType: ENTITY,
          entityId: id,
          before: {
            ...auditFields(current, ['agencyId', 'label', 'externalReference']),
            rowVersion: current.rowVersion,
          },
        });
        return deleted(ENTITY, id);
      },
    );
  }

  /** Administrative archive: children and history are untouched; nothing is revoked or recorded. */
  archive(requester: WriteRequester, id: string, body: ArchiveRequest): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'archiveMandate', pathParams: { id }, body, requester },
      async (context) => {
        const current = await this.lock(context, id);
        if (current.archivedAt !== null) {
          throw apiErrors.recordStateConflict({ archived: true, operation: 'archive' });
        }
        return this.write(context, current, 'MANDATE_ARCHIVED', body.reason, {
          archivedAt: context.now,
          archiveReason: body.reason,
        });
      },
    );
  }

  /** Clears the archive flag only; it revives no authority and is refused under an archived agency. */
  restore(requester: WriteRequester, id: string, body: ArchiveRequest): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'restoreMandate', pathParams: { id }, body, requester },
      async (context) => {
        // The agency of a mandate never changes: read it first to lock it before the mandate.
        const parent = await context.tx.mandate.findUnique({
          where: { id },
          select: { agencyId: true },
        });
        if (!parent) throw apiErrors.notFound();
        const current = await this.lockAfterAgency(context, id, parent.agencyId);
        if (current.archivedAt === null) {
          throw apiErrors.recordStateConflict({ archived: false, operation: 'restore' });
        }
        const agency = await context.tx.agency.findUniqueOrThrow({
          where: { id: current.agencyId },
          select: { recordState: true },
        });
        if (agency.recordState === 'ARCHIVED') {
          throw apiErrors.recordStateConflict({
            record: 'Agency',
            state: 'ARCHIVED',
            operation: 'restoreMandate',
          });
        }
        return this.write(context, current, 'MANDATE_RESTORED', body.reason, {
          archivedAt: null,
          archiveReason: null,
        });
      },
    );
  }

  /**
   * Records the SourceReference that holds this mandate's canonical code (canonical-binding.ts): an
   * identity/reference association only — no authority, scope, currentness or readiness.
   */
  bindCanonical(
    requester: WriteRequester,
    id: string,
    body: CanonicalBindingRequest,
  ): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: 'bindCanonicalMandate', pathParams: { id }, body, requester },
      async (context) => {
        const current = await this.lock(context, id);
        const row = await applyCanonicalBinding(context, {
          entity: ENTITY,
          operation: 'bindCanonicalMandate',
          current,
          archived: current.archivedAt !== null,
          body,
          scope: { kind: 'Agency', agencyId: current.agencyId },
          codeHolder: async (code) =>
            (
              await context.tx.mandate.findFirst({
                where: { canonicalCode: code },
                select: { id: true },
              })
            )?.id ?? null,
          update: (data) =>
            context.tx.mandate.update({ where: { id, rowVersion: current.rowVersion }, data }),
        });
        return updated(ENTITY, toMandateView(row));
      },
    );
  }

  /** Writes an archive-flag change with one version increment and one audit event. */
  private async write(
    context: WriteContext,
    current: Mandate,
    action: string,
    reason: string,
    change: Pick<Mandate, 'archivedAt' | 'archiveReason'>,
  ) {
    const row = await context.tx.mandate.update({
      where: { id: current.id, rowVersion: current.rowVersion },
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
      entityId: current.id,
      before: { ...auditFields(current, ARCHIVE_FIELDS), rowVersion: current.rowVersion },
      after: { ...auditFields(row, ARCHIVE_FIELDS), rowVersion: row.rowVersion },
      reason,
    });
    return updated(ENTITY, toMandateView(row));
  }

  /** Locks the Mandate row, loads it and checks If-Match (404 before 412). */
  private async lock(context: WriteContext, id: string): Promise<Mandate> {
    if (!(await lockForUpdate(context.tx, ENTITY, id))) throw apiErrors.notFound();
    const current = await context.tx.mandate.findUniqueOrThrow({ where: { id } });
    context.checkPrecondition({ entityType: ENTITY, id, rowVersion: current.rowVersion });
    return current;
  }

  /** Share-locks the agency, then locks the mandate and checks If-Match. */
  private async lockAfterAgency(
    context: WriteContext,
    id: string,
    agencyId: string,
  ): Promise<Mandate> {
    await lockForShare(context.tx, 'Agency', agencyId);
    return this.lock(context, id);
  }
}
