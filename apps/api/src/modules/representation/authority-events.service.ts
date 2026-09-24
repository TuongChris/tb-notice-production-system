// AuthorityEvent (P3B) — append-only authority history of one Mandate (DOMAIN_MODEL_v1 §9:
// "AuthorityEvent records currentness, revocation, termination, supersession, resignation or
// correction that a source supports. A null coverageId means whole-mandate scope only when the source
// actually supports that scope. A newer version does not automatically supersede every earlier grant.
// Partial termination for subject A must not alter subject B."). An event row is not proof by
// existence: it records what an operator reports a cited source supports, with an explicit provenance.
// Recording one changes no version, coverage, signer, route or case, and nothing else ever creates
// one — not a source, a revision, a freeze, a coverage, a signer association or an archive.
//
//   record  POST /mandates/{mandateId}/events with the Mandate's If-Match (its history changes:
//           Mandate rowVersion +1); the Mandate and its Agency are unarchived. The source is
//           required and must apply: to the coverage's route (agency, subject, owner material) for a
//           coverage-scoped event, to the Mandate's agency for a whole-mandate event. coverageId,
//           when given, is a coverage of THIS mandate (INVARIANTS §3: "AuthorityEvent coverage
//           belongs to its stated Mandate, not merely Agency" → 422 AUTHORITY_SCOPE_UNRESOLVED) in a
//           FROZEN version (a draft is edited, not evented → 409 VERSION_NOT_FROZEN).
//           supersedesEventId, when given, is an event of this Mandate with the same scope (a
//           successor does not change scope → 422) that has no successor yet (unique key as
//           backstop → 409 EVENT_ALREADY_SUPERSEDED); the earlier event is never changed.
//           provenance is stored exactly as given; DOCUMENT_REVIEWED needs a source that records an
//           attributed review (422 REVIEW_UNSUPPORTED). effectiveOn / effectiveAt /
//           rawEffectiveText are stored only as supplied — never taken from the capture date, the
//           recording time or today.
//   list    the history in recording order (newest first); recordedAt (createdAt) is when the app
//           recorded it, not a legal effective date.
// Lock order: Agency (share) → Mandate (update) → SourceReference.
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { AuthorityEvent as AuthorityEventView, CreateAuthorityEvent } from '@tb/contracts';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { apiErrors } from '../../infrastructure/http/api-error.js';
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
import { created } from '../directory/outcomes.js';
import { lockForShare } from '../directory/records.js';
import { assertSourcesUsable, type SourceTarget } from '../sources/source-scope.js';
import {
  assertMandateUsable,
  lockMandate,
  lockUnarchivedAgencies,
  routeContext,
  routeTarget,
} from './authority-chain.js';
import {
  authorityAuditFields,
  eventReviewProblem,
  storabilityProblem,
  toDbDate,
} from './authority-rules.js';
import { toAuthorityEventView } from './authority-views.js';

const ENTITY = 'AuthorityEvent';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EVENT_TYPES = new Set([
  'CURRENTNESS_RECORDED',
  'REVOCATION',
  'TERMINATION',
  'SUPERSESSION',
  'RESIGNATION',
  'CORRECTION',
]);

/** Fields of the event recorded (redacted where they may quote the source) in the audit trail. */
const AUDIT_FIELDS = [
  'mandateId',
  'coverageId',
  'eventType',
  'sourceId',
  'provenance',
  'effectiveOn',
  'effectiveAt',
  'rawEffectiveText',
  'scopeText',
  'supersedesEventId',
  'interpretation',
] as const;

@Injectable()
export class AuthorityEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly writes: WriteExecutor,
    private readonly cursors: CursorCodec,
  ) {}

  /**
   * The events of one Mandate (404 for an unknown Mandate), newest recording first. `q`: an exact
   * event, coverage, source or superseded-event id, an exact event type, or a case- and
   * accent-insensitive substring of the scope text, interpretation or raw effective text.
   */
  async list(
    mandateId: string,
    query: QueryValues,
  ): Promise<{ items: AuthorityEventView[]; nextCursor: string | null }> {
    const mandate = await this.prisma.mandate.findUnique({
      where: { id: mandateId },
      select: { id: true },
    });
    if (!mandate) throw apiErrors.notFound();
    const q = searchText(query);
    const page = pageRequest(contractOperation('listAuthorityEvents'), query, this.cursors, {
      mandateId,
      q,
    });
    const exact =
      q === null
        ? Prisma.empty
        : UUID.test(q)
          ? Prisma.sql`OR e.id = ${q} OR e.coverage_id = ${q} OR e.source_id = ${q}
              OR e.supersedes_event_id = ${q}`
          : EVENT_TYPES.has(q)
            ? Prisma.sql`OR e.event_type = ${q}`
            : Prisma.empty;
    const match =
      q === null
        ? Prisma.empty
        : Prisma.sql`AND (e.scope_text COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!'
            OR e.interpretation COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!'
            OR e.raw_effective_text COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!'
            ${exact})`;
    const ids = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT e.id FROM authority_events e WHERE e.mandate_id = ${mandateId} ${match}
        ${keysetAfter(page.after, 'e')}
        ORDER BY e.created_at DESC, e.id DESC ${pageLimit(page)}`,
    );
    const rows = await this.prisma.authorityEvent.findMany({
      where: { id: { in: ids.map((row) => row.id) } },
    });
    return toPage(inIdOrder(ids, rows), page, this.cursors, toAuthorityEventView);
  }

  /** Appends one source-backed event to the Mandate's history, exactly as reported. */
  record(
    requester: WriteRequester,
    mandateId: string,
    body: CreateAuthorityEvent,
  ): Promise<WriteReply> {
    const problem = storabilityProblem(body, ['effectiveOn'], ['effectiveAt']);
    if (problem) throw problem;
    return this.writes.execute(
      { operationId: 'recordAuthorityEvent', pathParams: { mandateId }, body, requester },
      async (context) => {
        const { tx } = context;
        const parent = await tx.mandate.findUnique({
          where: { id: mandateId },
          select: { agencyId: true },
        });
        if (!parent) throw apiErrors.notFound();
        await lockForShare(tx, 'Agency', parent.agencyId);
        const mandate = await lockMandate(tx, mandateId, 'update');
        context.checkPrecondition({
          entityType: 'Mandate',
          id: mandateId,
          rowVersion: mandate.rowVersion,
        });
        assertMandateUsable(mandate, 'recordAuthorityEvent');
        await lockUnarchivedAgencies(
          tx,
          [{ id: mandate.agencyId, field: 'agencyId' }],
          'recordAuthorityEvent',
        );
        const coverageId = body.coverageId ?? null;
        let target: SourceTarget = { kind: 'Agency', agencyId: mandate.agencyId };
        if (coverageId !== null) {
          const coverage = await tx.mandateCoverage.findUnique({
            where: { id: coverageId },
            select: {
              routeId: true,
              mandateVersionId: true,
              version: { select: { mandateId: true, versionState: true } },
            },
          });
          if (!coverage) throw apiErrors.referenceNotFound('coverageId');
          if (coverage.version.mandateId !== mandateId) {
            throw apiErrors.authorityScopeUnresolved('coverageId', 'OTHER_MANDATE');
          }
          if (coverage.version.versionState !== 'FROZEN') {
            throw apiErrors.versionNotFrozen('coverageId', coverage.mandateVersionId);
          }
          const route = await routeContext(tx, coverage.routeId);
          if (!route) throw new Error('coverage route missing');
          target = routeTarget(route);
        }
        if (body.supersedesEventId) {
          const prior = await tx.authorityEvent.findUnique({
            where: { id: body.supersedesEventId },
            select: { id: true, mandateId: true, coverageId: true },
          });
          if (!prior) throw apiErrors.referenceNotFound('supersedesEventId');
          if (prior.mandateId !== mandateId) {
            throw apiErrors.authorityScopeUnresolved('supersedesEventId', 'OTHER_MANDATE');
          }
          if (prior.coverageId !== coverageId) {
            throw apiErrors.authorityScopeUnresolved('supersedesEventId', 'SCOPE_CHANGE');
          }
          const successor = await tx.authorityEvent.findUnique({
            where: { supersedesEventId: prior.id },
            select: { id: true },
          });
          if (successor) throw apiErrors.eventAlreadySuperseded(successor.id);
        }
        await assertSourcesUsable(tx, [{ field: 'sourceId', sourceId: body.sourceId }], target);
        const source = await tx.sourceReference.findUniqueOrThrow({
          where: { id: body.sourceId },
          select: { reportedProvenance: true },
        });
        const review = eventReviewProblem(body.provenance, source.reportedProvenance);
        if (review) throw review;
        const id = randomUUID();
        const row = await tx.authorityEvent
          .create({
            data: {
              id,
              mandateId,
              agencyId: mandate.agencyId,
              coverageId,
              eventType: body.eventType,
              sourceId: body.sourceId,
              provenance: body.provenance,
              effectiveOn: body.effectiveOn ? toDbDate(body.effectiveOn) : null,
              effectiveAt: body.effectiveAt ? new Date(body.effectiveAt) : null,
              rawEffectiveText: body.rawEffectiveText ?? null,
              scopeText: body.scopeText,
              supersedesEventId: body.supersedesEventId ?? null,
              interpretation: body.interpretation,
              createdAt: context.now,
              createdById: context.actorUserId,
            },
          })
          .catch((error: unknown) => {
            // A concurrent successor of the same event won the unique supersedes key.
            if (isUniqueViolation(error)) throw apiErrors.eventAlreadySuperseded(null);
            throw error;
          });
        const parentRow = await tx.mandate.update({
          where: { id: mandateId, rowVersion: mandate.rowVersion },
          data: {
            rowVersion: { increment: 1 },
            updatedAt: context.now,
            updatedById: context.actorUserId,
          },
          select: { rowVersion: true },
        });
        await context.audit({
          action: 'AUTHORITY_EVENT_RECORDED',
          entityType: ENTITY,
          entityId: id,
          before: { mandateRowVersion: mandate.rowVersion },
          after: {
            ...authorityAuditFields(
              { ...row, effectiveAt: row.effectiveAt?.toISOString() ?? null },
              AUDIT_FIELDS,
            ),
            mandateRowVersion: parentRow.rowVersion,
          },
          sourceIds: [body.sourceId],
        });
        return created(ENTITY, toAuthorityEventView(row), [
          { type: 'Mandate', id: mandateId, rowVersion: parentRow.rowVersion },
        ]);
      },
    );
  }
}
