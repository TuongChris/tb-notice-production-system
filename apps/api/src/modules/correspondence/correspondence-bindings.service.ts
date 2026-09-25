// CorrespondenceBinding (P4C) — the append-only, explicit interpretation of one captured message for
// one case (DOMAIN_MODEL_v1 §13; the old conceptual "CaseEvent"). A binding is not the message and
// not a transmission: its event types name captured past events, never commands — recording
// INITIAL_AS_SENT or REPLY_AS_SENT sends nothing, and nothing is inferred from the direction, subject,
// body, Message-ID, sender or timing (there is no NMI or outcome classifier).
//
//   bind   POST /cases/{caseId}/correspondence-bindings with the case's If-Match (the case's
//          rowVersion and contextRevision +1: correspondence is part of the case context, and a
//          binding makes the case history-bearing). The case is unarchived (409); the correspondence
//          exists (422) and belongs to the case's agency (422 CROSS_AGENCY_REFERENCE; the composite
//          foreign key is the backstop); a reported item exists, belongs to this case (422
//          CROSS_CASE_REFERENCE; composite key) and is unarchived (409). An OUTCOME event and any
//          outcome value name one reported item (422 OUTCOME_ITEM_REQUIRED — INVARIANTS §4 "OUTCOME
//          bindings require one ReportedItem in V1"; "An outcome binds to a specific reported item"):
//          mixed outcomes are separate item bindings, a reinstatement is a new binding, and silence
//          never becomes an outcome. supersedesBindingId corrects an earlier interpretation: that
//          binding exists (422), belongs to this case (422 CROSS_CASE_REFERENCE — its foreign key is
//          not composite), names the same message (422 REVISION_SCOPE_CHANGE: a correction never
//          re-points to another message) and has no correction yet (409 BINDING_ALREADY_SUPERSEDED;
//          the unique supersedes key is the backstop). Nothing is edited or deleted: the earlier
//          binding and the correspondence stay exactly as recorded.
//   list   every binding of the case — superseded ones included, the history — newest recorded
//          first; `q`: the exact id of a binding, its correspondence, its reported item or the
//          binding it corrects, or a literal, case- and accent-insensitive substring of the platform
//          reference.
// One message may be bound several times (several items, cases of its agency or event types); each
// binding is explicit and case-specific, and transmissions are counted by distinct Correspondence,
// never by binding rows. Nothing of one case's binding appears in or transfers to another case.
// Lock order: CaseRecord (update) → ReportedItem (share); correspondence rows and earlier bindings
// are immutable and only read.
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  BindCorrespondence,
  CorrespondenceBinding as CorrespondenceBindingView,
} from '@tb/contracts';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { apiErrors, type ApiError } from '../../infrastructure/http/api-error.js';
import { CursorCodec } from '../../infrastructure/write/cursor.js';
import { isUniqueViolation } from '../../infrastructure/write/database-errors.js';
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
  type WriteReply,
  type WriteRequester,
} from '../../infrastructure/write/write-executor.js';
import { auditFields } from '../directory/changes.js';
import { created } from '../directory/outcomes.js';
import { assertCaseWritable, CASE_ENTITY, lockCase } from '../cases/case-rules.js';
import {
  assertBodyChild,
  caseAffected,
  caseVersions,
  touchCaseFor,
} from '../cases/intake-rules.js';
import { toCorrespondenceBindingView } from './correspondence-views.js';

const ENTITY = 'CorrespondenceBinding';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const AUDITED_FIELDS = [
  'caseId',
  'agencyId',
  'correspondenceId',
  'reportedItemId',
  'eventType',
  'platformReference',
  'outcome',
  'interpretation',
  'supersedesBindingId',
];

/**
 * Request-only checks, before any idempotency claim or database access: an OUTCOME event and any
 * recorded outcome name one reported item (422 OUTCOME_ITEM_REQUIRED).
 */
export function bindingProblem(body: BindCorrespondence): ApiError | null {
  const item = body.reportedItemId ?? null;
  if (item !== null) return null;
  if (body.eventType === 'OUTCOME') return apiErrors.outcomeItemRequired('OUTCOME_EVENT');
  if ((body.outcome ?? null) !== null) return apiErrors.outcomeItemRequired('OUTCOME_VALUE');
  return null;
}

@Injectable()
export class CorrespondenceBindingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly writes: WriteExecutor,
    private readonly cursors: CursorCodec,
  ) {}

  /** Every binding of one case (404 for an unknown case), newest recorded first. */
  async list(
    caseId: string,
    query: QueryValues,
  ): Promise<{ items: CorrespondenceBindingView[]; nextCursor: string | null }> {
    const owner = await this.prisma.caseRecord.findUnique({
      where: { id: caseId },
      select: { id: true },
    });
    if (!owner) throw apiErrors.notFound();
    const q = searchText(query);
    const page = pageRequest(
      contractOperation('listCaseCorrespondenceBindings'),
      query,
      this.cursors,
      { caseId, q },
    );
    const exact =
      q !== null && UUID.test(q)
        ? Prisma.sql`OR b.id = ${q} OR b.correspondence_id = ${q} OR b.reported_item_id = ${q}
            OR b.supersedes_binding_id = ${q}`
        : Prisma.empty;
    const match =
      q === null
        ? Prisma.empty
        : Prisma.sql`AND (b.platform_reference COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!'
            ${exact})`;
    const ids = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT b.id FROM correspondence_bindings b WHERE b.case_id = ${caseId} ${match}
        ${keysetAfter(page.after, 'b')}
        ORDER BY b.created_at DESC, b.id DESC ${pageLimit(page)}`,
    );
    const rows = await this.prisma.correspondenceBinding.findMany({
      where: { id: { in: ids.map((row) => row.id) } },
    });
    return toPage(inIdOrder(ids, rows), page, this.cursors, toCorrespondenceBindingView);
  }

  /** One explicit interpretation of one captured message for this case, exactly as supplied. */
  bind(requester: WriteRequester, caseId: string, body: BindCorrespondence): Promise<WriteReply> {
    const problem = bindingProblem(body);
    if (problem) throw problem;
    return this.writes.execute(
      { operationId: 'bindCaseCorrespondence', pathParams: { caseId }, body, requester },
      async (context) => {
        const { tx } = context;
        const operation = 'bindCaseCorrespondence';
        const current = await lockCase(tx, caseId);
        context.checkPrecondition({
          entityType: CASE_ENTITY,
          id: caseId,
          rowVersion: current.rowVersion,
        });
        assertCaseWritable(current, operation);
        const message = await tx.correspondence.findUnique({
          where: { id: body.correspondenceId },
          select: { agencyId: true },
        });
        if (!message) throw apiErrors.referenceNotFound('correspondenceId');
        if (message.agencyId !== current.agencyId) {
          throw apiErrors.crossAgencyReference('correspondenceId', 'record');
        }
        const reportedItemId = body.reportedItemId ?? null;
        if (reportedItemId !== null) {
          await assertBodyChild(
            tx,
            'ReportedItem',
            caseId,
            reportedItemId,
            'reportedItemId',
            operation,
          );
        }
        const supersedesBindingId = body.supersedesBindingId ?? null;
        if (supersedesBindingId !== null) {
          // Every binding write of this case holds the case lock, so a committed correction of the
          // earlier binding is visible here.
          const earlier = await tx.correspondenceBinding.findUnique({
            where: { id: supersedesBindingId },
            select: { caseId: true, correspondenceId: true },
          });
          if (!earlier) throw apiErrors.referenceNotFound('supersedesBindingId');
          if (earlier.caseId !== caseId) {
            throw apiErrors.crossCaseReference('supersedesBindingId', 'record');
          }
          if (earlier.correspondenceId !== body.correspondenceId) {
            throw apiErrors.revisionScopeChange(['correspondenceId'], 'binding');
          }
          const successor = await tx.correspondenceBinding.findUnique({
            where: { supersedesBindingId },
            select: { id: true },
          });
          if (successor) throw apiErrors.bindingAlreadySuperseded(successor.id);
        }
        const id = randomUUID();
        const row = await tx.correspondenceBinding
          .create({
            data: {
              id,
              caseId,
              agencyId: current.agencyId,
              correspondenceId: body.correspondenceId,
              reportedItemId,
              eventType: body.eventType,
              platformReference: body.platformReference ?? null,
              outcome: body.outcome ?? null,
              interpretation: body.interpretation ?? null,
              supersedesBindingId,
              createdAt: context.now,
              createdById: context.actorUserId,
            },
          })
          .catch((error: unknown) => {
            // The unique supersedes key is the backstop of the one-correction rule.
            if (supersedesBindingId !== null && isUniqueViolation(error)) {
              throw apiErrors.bindingAlreadySuperseded(null);
            }
            throw error;
          });
        const touched = await touchCaseFor(context, current);
        const view = toCorrespondenceBindingView(row);
        await context.audit({
          action: 'CORRESPONDENCE_BOUND',
          entityType: ENTITY,
          entityId: id,
          before: caseVersions(current),
          after: { ...auditFields(view, AUDITED_FIELDS), ...caseVersions(touched) },
        });
        return created(ENTITY, view, [caseAffected(touched)]);
      },
    );
  }
}
