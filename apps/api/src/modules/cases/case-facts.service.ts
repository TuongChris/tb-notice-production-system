// CaseFact (P4B) — versioned, structured, case-specific information recorded explicitly by an
// operator (DOMAIN_MODEL_v1 §12). A fact is an attributed assertion with its provenance exactly as
// supplied; the server decides nothing about infringement, ownership, permission, fair use or
// fair dealing, exceptions, authority currentness or G1–G7, and never manufactures a fact from a
// URL, a publication, a mapping, similarity, silence (no permission source found) or a source's
// existence. MISSING, CONFLICT and UNASSESSED stay exactly what they are; resolutionState is a
// stored state supplied by the operator (default UNASSESSED), never computed — SUPPORTED_FOR_SCOPE
// is never set from sources, matching or completeness.
//
//   create   POST /cases/{caseId}/facts with the case's If-Match (the case's rowVersion and
//            contextRevision +1): revision 1 of a new chain (new factGroupId). The typed value is
//            validated by the contract for its factType. Scope (intake-rules.ts factScope): CASE
//            names no record; WORK / REPORTED_ITEM / USE name exactly their record, which must
//            belong to this case (422 REFERENCE_NOT_FOUND / CROSS_CASE_REFERENCE; the composite
//            foreign keys are the backstop) and be unarchived (409). Each FactSupport names a
//            CaseSource of THIS case (INVARIANTS §3 "FactSource links a CaseSource from the same
//            Case"; AC-030) that is LINKED (409 otherwise), each (case source, support role) once;
//            its source revision stays pinned through the link and must still apply to the case
//            (source-scope.ts). DOCUMENT_REVIEWED needs at least one supporting source that itself
//            records an attributed review (422 REVIEW_UNSUPPORTED — the permanent R6 rule); a
//            support never upgrades provenance. assertedAsOf follows the R7 storability rule.
//            DUPLICATE_REVIEW relatedCaseIds must name other existing cases; nothing of them is
//            read, copied or changed.
//   revise   POST /cases/{caseId}/facts/{id}/revisions with the case's If-Match: only the current
//            head of its chain (409 REVISION_NOT_HEAD naming the head; INVARIANTS §4, AC-029), same
//            fact type and scope (422 REVISION_SCOPE_CHANGE — "a correction is not silent
//            reparenting"), the same checks as create; revision + 1, supersedesFactId = the head;
//            earlier revisions and their supports never change. A newer SourceReference revision
//            never re-points an existing fact.
//   list     current heads only (a superseded revision is reached by id or through its chain),
//            newest first; get: any revision of this case by id.
// Contract gap (reported at R9, not worked around): no operation returns FactSource rows, so a
// fact's supports are written and validated here but cannot be read back on the wire.
// Every child is found through the exact case of the path: another case's fact is 404.
// Lock order: CaseRecord (update) → CaseSource (share) → CaseWork / ReportedItem / UseMapping
// (share) → CaseFact (update, the revised head) → SourceReference.
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  CaseFact as CaseFactView,
  CaseFactSummary,
  CreateFact,
  FactSupport,
  ReviseFact,
} from '@tb/contracts';
import { codePointLength } from '@tb/contracts';
import { Prisma, type CaseFact, type CaseRecord } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { apiErrors, type ValidationIssue } from '../../infrastructure/http/api-error.js';
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
import { canonicalJson } from '../../infrastructure/write/request-digest.js';
import { contractOperation, type QueryValues } from '../../infrastructure/write/request-parsing.js';
import { storabilityProblem, toDbInstant } from '../../infrastructure/write/storability.js';
import {
  WriteExecutor,
  type WriteContext,
  type WriteReply,
  type WriteRequester,
} from '../../infrastructure/write/write-executor.js';
import { auditFields, auditValue } from '../directory/changes.js';
import { created } from '../directory/outcomes.js';
import { lockForShare, lockForUpdate } from '../directory/records.js';
import { assertSourcesUsable } from '../sources/source-scope.js';
import { assertCaseWritable, CASE_ENTITY, caseTarget, lockCase } from './case-rules.js';
import {
  assertBodyChild,
  caseAffected,
  caseVersions,
  childCase,
  factScope,
  TARGET_ENTITY,
  TARGET_FIELDS,
  touchCaseFor,
} from './intake-rules.js';
import { toCaseFactSummary, toCaseFactView } from './intake-views.js';

const ENTITY = 'CaseFact';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const FACT_TYPES: readonly string[] = [
  'RIGHTS_BASIS',
  'RIGHTS_SCOPE',
  'PERMISSION',
  'AV_COMPARISON',
  'EXCEPTION_REVIEW',
  'WORK_IDENTIFICATION',
  'REPORTED_IDENTIFICATION',
  'DUPLICATE_REVIEW',
  'AUTHORITY_CURRENTNESS',
];
/** What a revision keeps from the head it revises ("a correction is not silent reparenting"). */
const CHAIN_FIELDS = ['factType', 'scopeKind', ...TARGET_FIELDS] as const;
const AUDITED_FIELDS = [
  'factType',
  'scopeKind',
  ...TARGET_FIELDS,
  'provenance',
  'rawProvenance',
  'resolutionState',
  'assertedByLabel',
  'assertedAsOf',
  'scopeText',
  'limitations',
  'changeReason',
];

type FactRequest = CreateFact | ReviseFact;

/**
 * Request-only checks, before any idempotency claim or database access: the scope names exactly
 * its record (422 FACT_SCOPE_INVALID), assertedAsOf is storable (422), each (case source, support
 * role) is supported once, and a DUPLICATE_REVIEW names other cases, each once (422).
 */
export function factRequestProblem(caseId: string, body: FactRequest) {
  factScope(body);
  const storability = storabilityProblem(body, [], ['assertedAsOf']);
  if (storability) return storability;
  const issues: ValidationIssue[] = [];
  const supports = new Set<string>();
  body.sources.forEach((support, index) => {
    const key = `${support.caseSourceId}\u0000${support.supportRole}`;
    if (supports.has(key)) {
      issues.push({
        path: `sources.${index}.supportRole`,
        message: 'Each case source supports a fact once per support role',
      });
    }
    supports.add(key);
  });
  if (body.factType === 'DUPLICATE_REVIEW') {
    const related = new Set<string>();
    body.value.relatedCaseIds.forEach((relatedId, index) => {
      if (relatedId === caseId || related.has(relatedId)) {
        issues.push({
          path: `value.relatedCaseIds.${index}`,
          message: 'Must name another case, each once',
        });
      }
      related.add(relatedId);
    });
  }
  return issues.length === 0 ? null : apiErrors.bodyValidationFailed(issues);
}

@Injectable()
export class CaseFactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly writes: WriteExecutor,
    private readonly cursors: CursorCodec,
  ) {}

  /**
   * The current head of every fact chain of one case (404 for an unknown case), newest first.
   * `factType`: exact filter (an unknown type is 400). `q`: the exact id or factGroupId of a fact
   * (the head of that chain), the exact id of its scoped work, reported item or mapping, or a
   * literal, case- and accent-insensitive substring of the scope text (discovery only).
   */
  async list(
    caseId: string,
    query: QueryValues,
  ): Promise<{ items: CaseFactSummary[]; nextCursor: string | null }> {
    const owner = await this.prisma.caseRecord.findUnique({
      where: { id: caseId },
      select: { id: true },
    });
    if (!owner) throw apiErrors.notFound();
    const factType = typeof query['factType'] === 'string' ? query['factType'] : null;
    if (factType !== null && !FACT_TYPES.includes(factType)) {
      throw apiErrors.invalidQueryParameter('factType');
    }
    const q = searchText(query);
    const page = pageRequest(contractOperation('listCaseFacts'), query, this.cursors, {
      caseId,
      q,
      factType,
    });
    const type = factType === null ? Prisma.empty : Prisma.sql`AND f.fact_type = ${factType}`;
    const exact =
      q !== null && UUID.test(q)
        ? Prisma.sql`OR f.id = ${q} OR f.fact_group_id = ${q} OR f.case_work_id = ${q}
            OR f.reported_item_id = ${q} OR f.mapping_id = ${q}`
        : Prisma.empty;
    const match =
      q === null
        ? Prisma.empty
        : Prisma.sql`AND (f.scope_text COLLATE utf8mb4_0900_ai_ci LIKE ${containsPattern(q)} ESCAPE '!'
            ${exact})`;
    const ids = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT f.id FROM case_facts f WHERE f.case_id = ${caseId}
        AND NOT EXISTS (SELECT 1 FROM case_facts n WHERE n.supersedes_fact_id = f.id)
        ${type} ${match} ${keysetAfter(page.after, 'f')}
        ORDER BY f.created_at DESC, f.id DESC ${pageLimit(page)}`,
    );
    const rows = await this.prisma.caseFact.findMany({
      where: { id: { in: ids.map((row) => row.id) } },
    });
    return toPage(inIdOrder(ids, rows), page, this.cursors, toCaseFactSummary);
  }

  /** Any revision of this case by id; another case's fact is 404 exactly like an unknown one. */
  async get(caseId: string, id: string): Promise<CaseFactView> {
    const row = await this.prisma.caseFact.findFirst({ where: { id, caseId } });
    if (!row) throw apiErrors.notFound();
    return toCaseFactView(row);
  }

  /** Revision 1 of a new fact chain, exactly as supplied, with its supports. */
  create(requester: WriteRequester, caseId: string, body: CreateFact): Promise<WriteReply> {
    const problem = factRequestProblem(caseId, body);
    if (problem) throw problem;
    return this.writes.execute(
      { operationId: 'createCaseFact', pathParams: { caseId }, body, requester },
      async (context) => {
        const current = await lockCase(context.tx, caseId);
        context.checkPrecondition({
          entityType: CASE_ENTITY,
          id: caseId,
          rowVersion: current.rowVersion,
        });
        assertCaseWritable(current, 'createCaseFact');
        return this.record(context, current, body, null, 'createCaseFact');
      },
    );
  }

  /** The next revision of the chain whose current head is `id`, within the same type and scope. */
  revise(
    requester: WriteRequester,
    caseId: string,
    id: string,
    body: ReviseFact,
  ): Promise<WriteReply> {
    const problem = factRequestProblem(caseId, body);
    if (problem) throw problem;
    return this.writes.execute(
      { operationId: 'reviseCaseFact', pathParams: { caseId, id }, body, requester },
      async (context) => {
        const { tx } = context;
        // A fact's case never changes: read it first (404 for another case's fact, nothing of that
        // case is locked), then lock the case.
        if ((await childCase(tx, ENTITY, id)) !== caseId) throw apiErrors.notFound();
        const current = await lockCase(tx, caseId);
        context.checkPrecondition({
          entityType: CASE_ENTITY,
          id: caseId,
          rowVersion: current.rowVersion,
        });
        assertCaseWritable(current, 'reviseCaseFact');
        const head = await tx.caseFact.findUniqueOrThrow({ where: { id } });
        // Every fact write of this case holds the case lock, so a committed successor is visible.
        const successor = await tx.caseFact.findUnique({
          where: { supersedesFactId: id },
          select: { id: true },
        });
        if (successor) {
          const latest = await tx.caseFact.findFirst({
            where: { factGroupId: head.factGroupId },
            orderBy: { revision: 'desc' },
            select: { id: true },
          });
          throw apiErrors.revisionNotHead(latest?.id ?? null, 'fact');
        }
        const { targets } = factScope(body);
        const requested: Record<string, unknown> = {
          factType: body.factType,
          scopeKind: body.scopeKind,
          ...targets,
        };
        const changedChain = CHAIN_FIELDS.filter((field) => requested[field] !== head[field]);
        if (changedChain.length > 0) throw apiErrors.revisionScopeChange(changedChain, 'fact');
        return this.record(context, current, body, head, 'reviseCaseFact');
      },
    );
  }

  /** Validates the scope target and supports, then writes the revision and its supports. */
  private async record(
    context: WriteContext,
    caseRow: CaseRecord,
    body: FactRequest,
    head: CaseFact | null,
    operation: string,
  ): Promise<ReturnType<typeof created>> {
    const { tx } = context;
    const caseId = caseRow.id;
    const links = await this.lockSupports(tx, caseId, body.sources, operation);
    const { targets } = factScope(body);
    for (const field of TARGET_FIELDS) {
      const targetId = targets[field];
      if (targetId !== null) {
        await assertBodyChild(tx, TARGET_ENTITY[field], caseId, targetId, field, operation);
      }
    }
    if (head !== null && !(await lockForUpdate(tx, 'CaseFact', head.id))) {
      throw apiErrors.notFound();
    }
    if (body.factType === 'DUPLICATE_REVIEW') {
      for (const [index, relatedId] of body.value.relatedCaseIds.entries()) {
        const related = await tx.caseRecord.findUnique({
          where: { id: relatedId },
          select: { id: true },
        });
        if (!related) throw apiErrors.referenceNotFound(`value.relatedCaseIds.${index}`);
      }
    }
    // The pinned revision behind each supporting link must still apply to this case.
    const sources = await assertSourcesUsable(
      tx,
      links.map((link, index) => ({
        field: `sources.${index}.caseSourceId`,
        sourceId: link.sourceId,
      })),
      await caseTarget(tx, caseRow),
    );
    if (body.provenance === 'DOCUMENT_REVIEWED') {
      const reviewed = await tx.sourceReference.count({
        where: {
          id: { in: sources.map((source) => source.id) },
          reportedProvenance: 'DOCUMENT_REVIEWED',
        },
      });
      if (reviewed === 0) throw apiErrors.reviewUnsupported('provenance', 'NO_REVIEWED_SOURCE');
    }

    const id = randomUUID();
    const row = await tx.caseFact
      .create({
        data: {
          id,
          caseId,
          factGroupId: head?.factGroupId ?? randomUUID(),
          revision: head === null ? 1 : head.revision + 1,
          supersedesFactId: head?.id ?? null,
          factType: body.factType,
          scopeKind: body.scopeKind,
          caseWorkId: targets.caseWorkId,
          reportedItemId: targets.reportedItemId,
          mappingId: targets.mappingId,
          value: body.value as Prisma.InputJsonValue,
          provenance: body.provenance,
          rawProvenance: body.rawProvenance ?? null,
          resolutionState: body.resolutionState ?? 'UNASSESSED',
          assertedByLabel: body.assertedByLabel ?? null,
          assertedAsOf:
            typeof body.assertedAsOf === 'string' ? toDbInstant(body.assertedAsOf) : null,
          scopeText: body.scopeText,
          limitations: body.limitations ?? null,
          changeReason: body.changeReason,
          createdAt: context.now,
          createdById: context.actorUserId,
        },
      })
      .catch((error: unknown) => {
        // The unique (group, revision) and supersedes keys are the backstop of the head check.
        if (head !== null && isUniqueViolation(error)) {
          throw apiErrors.revisionNotHead(null, 'fact');
        }
        throw error;
      });
    const supports: Array<{ id: string; caseSourceId: string; sourceId: string } & FactSupport> =
      [];
    for (const [index, support] of body.sources.entries()) {
      const supportId = randomUUID();
      await tx.factSource.create({
        data: {
          id: supportId,
          factId: id,
          caseSourceId: support.caseSourceId,
          supportRole: support.supportRole,
          supportedAssertion: support.supportedAssertion,
          createdAt: context.now,
          createdById: context.actorUserId,
        },
      });
      supports.push({ ...support, id: supportId, sourceId: links[index]?.sourceId ?? '' });
    }
    const touched = await touchCaseFor(context, caseRow);
    const view = toCaseFactView(row);
    await context.audit({
      action: head === null ? 'CASE_FACT_CREATED' : 'CASE_FACT_REVISED',
      entityType: ENTITY,
      entityId: id,
      before: {
        ...(head === null ? {} : { supersedesFactId: head.id, revision: head.revision }),
        ...caseVersions(caseRow),
      },
      after: {
        caseId,
        factGroupId: row.factGroupId,
        revision: row.revision,
        ...auditFields(view, AUDITED_FIELDS),
        value: { redacted: true, codePoints: codePointLength(canonicalJson(body.value)) },
        sources: supports.map((support) => ({
          factSourceId: support.id,
          caseSourceId: support.caseSourceId,
          sourceId: support.sourceId,
          supportRole: support.supportRole,
          supportedAssertion: auditValue('supportedAssertion', support.supportedAssertion),
        })),
        ...caseVersions(touched),
      },
      sourceIds: [...new Set(supports.map((support) => support.sourceId))],
    });
    return created(ENTITY, view, [
      caseAffected(touched),
      ...supports.map((support) => ({ type: 'FactSource', id: support.id, rowVersion: null })),
    ]);
  }

  /**
   * Each supporting CaseSource exists (422 REFERENCE_NOT_FOUND), belongs to this case (422
   * CROSS_CASE_REFERENCE) and is LINKED (409: a paused or unlinked link supports nothing new).
   * Share-locked in id order; returns the links in request order.
   */
  private async lockSupports(
    tx: Prisma.TransactionClient,
    caseId: string,
    supports: readonly FactSupport[],
    operation: string,
  ): Promise<Array<{ id: string; sourceId: string }>> {
    for (const id of [...new Set(supports.map((support) => support.caseSourceId))].sort()) {
      await lockForShare(tx, 'CaseSource', id);
    }
    const links: Array<{ id: string; sourceId: string }> = [];
    for (const [index, support] of supports.entries()) {
      const field = `sources.${index}.caseSourceId`;
      const link = await tx.caseSource.findUnique({
        where: { id: support.caseSourceId },
        select: { id: true, caseId: true, sourceId: true, linkState: true },
      });
      if (!link) throw apiErrors.referenceNotFound(field);
      if (link.caseId !== caseId) throw apiErrors.crossCaseReference(field, 'record');
      if (link.linkState !== 'LINKED') {
        throw apiErrors.recordStateConflict({
          record: 'CaseSource',
          linkState: link.linkState,
          operation,
          field,
        });
      }
      links.push({ id: link.id, sourceId: link.sourceId });
    }
    return links;
  }
}
