// Candidate assessments (P4H) — captureCandidateAssessment and listCandidateAssessments
// (TB-SCHEMA-API-v1.0.0) and the read-back getCandidateAssessmentSources (TB-SCHEMA-API-v1.4.0,
// ADR-0009). ADR-0008 and ADR-0009 were accepted by the operator for implementation with the
// independent review deferred (mission TB_P4H_CANDIDATE_ASSESSMENT_FAST_TRACK_IMPLEMENTATION).
//
// A CandidateAssessment records one attributable G1–G6 review of one exact candidate artifact,
// bound to one evaluation epoch E = (candidateId, artifactSha256, dependencyDigest,
// rulesetVersion) — the review a person (or a documented external review the operator reports)
// actually made, with its sources. Recording is not counting: an assessment is never a readiness
// decision, READY_FOR_SIGNER, G7, a signature, an approval or permission to send, and it never
// changes, resolves or waives a technical validation run or issue (D-6: no disposition exists).
//
//   capture  POST /candidates/{candidateId}/assessments. Idempotency-Key; no If-Match (the contract
//            declares no precondition target: the expected artifact SHA-256 and dependency digest
//            in the body are the precondition). The request-only checks run before the claim
//            (assessment-rules.ts). One short SERIALIZABLE transaction (INVARIANTS §5; the reads of
//            the context rebuild keep a concurrent dependency write out until the commit):
//              the candidate of the path (404) → its CaseRecord locked FOR UPDATE (archived → 409)
//              → the candidate share-locked and re-read (a superseded candidate is recorded as
//                history — D-1; it never counts) → the expected artifact SHA-256 is the stored one
//                (412 ARTIFACT_CHANGED) → the prompt snapshot's scope (validation-scope.ts) → the
//                CURRENT production context of that scope with the P4D reader and assembly (a
//                binding the prompt named that has been corrected since → 412 CONTEXT_CHANGED) → the
//                expected dependency digest is the current one (412 CONTEXT_CHANGED; never
//                substituted) → the P4D bounds and DRAFTING gate → the ruleset identifier is the
//                one the server runs now (422 RULESET_NOT_CURRENT) → a completed ValidationRun of
//                exactly this epoch exists (422 VALIDATION_RUN_REQUIRED; its result may be anything)
//              → the superseded assessment, when named: of this case, candidate and gate, the head
//                of its chain (422 / 409; the epochs may differ — D-2)
//              → each support: an existing CaseSource (422 REFERENCE_NOT_FOUND) of this case (422
//                CROSS_CASE_REFERENCE) that is LINKED (409); for a PASS each cited source applies
//                to the case now (source-scope.ts, 422 with its scope code — D-3); the ask
//                dispositions: the parent binding is one of this case and exactly the prompt's
//                parent (422), their sources apply to the case (the general cited-source rule)
//              → one CandidateAssessment, its AssessmentSource rows (ids ascending in the order
//                the request lists them, all at the write instant), one redacted audit event, the
//                idempotency record → commit.
//            The case row is locked, never changed (no rowVersion or contextRevision move: an
//            assessment is downstream of the context); nothing else is written. A replay of the
//            same key reads the stored assessment back (the idempotency record keeps no copy); the
//            same key with another body is 409.
//   list     GET /candidates/{candidateId}/assessments — this candidate's assessments (404 for an
//            unknown candidate), newest first, exactly as stored, superseded ones included; no
//            head, currentness or staleness is selected or added. `q` matches exactly an
//            assessment id, a gate, a result, a scope state, a dependency digest, a ruleset
//            identifier or a performer label — never a text search or a legal equivalence.
//   sources  GET /candidates/{candidateId}/assessments/{id}/sources — the stored AssessmentSource
//            rows of one assessment of this candidate, ascending (createdAt, id); 404 for an
//            unknown candidate, an unknown or malformed assessment and another candidate's
//            assessment, alike. A historical record: nothing present-day is resolved (no link
//            state, source revision or applicability). A stored row naming another case's link, or
//            none or more than 100 rows, is a 500 — never a partial answer. Read only.
// Nothing is sent, fetched or called: no AI provider, network, mail or Drive access exists here.
// Lock order: CaseRecord → NoticeCandidate → CandidateAssessment → CaseSource → SourceReference.
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type {
  AskDisposition,
  CandidateAssessment as CandidateAssessmentView,
  CandidateAssessmentSourcesView,
  CaptureAssessment,
} from '@tb/contracts';
import {
  Prisma,
  type CandidateAssessment,
  type CaseRecord,
  type NoticeCandidate,
  type PromptSnapshot,
} from '../../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { ApiError, apiErrors } from '../../infrastructure/http/api-error.js';
import { CursorCodec } from '../../infrastructure/write/cursor.js';
import { isUniqueViolation } from '../../infrastructure/write/database-errors.js';
import {
  inIdOrder,
  keysetAfter,
  pageLimit,
  pageRequest,
  searchText,
  toPage,
} from '../../infrastructure/write/pagination.js';
import { contractOperation, type QueryValues } from '../../infrastructure/write/request-parsing.js';
import { toDbInstant } from '../../infrastructure/write/storability.js';
import {
  WriteExecutor,
  type WriteContext,
  type WriteReply,
  type WriteRequester,
} from '../../infrastructure/write/write-executor.js';
import { assertCaseWritable, caseTarget, lockCase } from '../cases/case-rules.js';
import { lockForShare } from '../directory/records.js';
import { created } from '../directory/outcomes.js';
import { assembleContext, assertDeliverable } from '../production/context-assembly.js';
import { NO_CONTEXT_READ_OBSERVER } from '../production/context-read-observer.js';
import type { ContextScope } from '../production/context-scope.js';
import { readContextRows, type ContextRows } from '../production/context-snapshot.js';
import { assertSourcesUsable, type SourceUse } from '../sources/source-scope.js';
import { TECHNICAL_RULESET_VERSION } from '../validation/technical-ruleset.js';
import { validationScope } from '../validation/validation-scope.js';
import {
  captureRequestProblem,
  rulesetProblem,
  supersessionProblem,
  supportsMustApply,
  textLength,
} from './assessment-rules.js';
import { toAssessmentSourceView, toCandidateAssessmentView } from './assessment-views.js';
import {
  ASSESSMENT_WRITE_OBSERVER,
  type AssessmentWriteObserver,
} from './assessment-write-observer.js';

const ENTITY = 'CandidateAssessment';
const OPERATION = 'captureCandidateAssessment';
/** The bound of the supports a capture accepts — the only way AssessmentSource rows are written. */
const MAX_SUPPORTS = 100;

const json = (value: unknown) => value as Prisma.InputJsonValue;

/** One supporting link as read under its share lock, in request order. */
interface SupportLink {
  readonly id: string;
  readonly sourceId: string;
}

/**
 * The current context rows of the scope. A binding the prompt named that has been corrected since
 * cannot be read for this scope any more: the context the reviewer read has changed (412).
 */
async function currentRows(
  tx: Prisma.TransactionClient,
  scope: ContextScope,
): Promise<ContextRows> {
  try {
    return await readContextRows(tx, scope, NO_CONTEXT_READ_OBSERVER);
  } catch (error) {
    if (error instanceof ApiError && error.code === 'BINDING_ALREADY_SUPERSEDED') {
      throw apiErrors.assessmentContextChanged();
    }
    throw error;
  }
}

/** The ask dispositions of an audit record: their count and dispositions only (no question text). */
function askAudit(dispositions: readonly AskDisposition[] | undefined): Prisma.InputJsonValue {
  if (dispositions === undefined) return null as unknown as Prisma.InputJsonValue;
  const kinds: Record<string, number> = {};
  for (const item of dispositions) kinds[item.disposition] = (kinds[item.disposition] ?? 0) + 1;
  return { count: dispositions.length, dispositions: kinds };
}

@Injectable()
export class AssessmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly writes: WriteExecutor,
    private readonly cursors: CursorCodec,
    @Inject(ASSESSMENT_WRITE_OBSERVER) private readonly observer: AssessmentWriteObserver,
  ) {}

  /** One attributable G1–G6 review of exactly this candidate at the current epoch (see above). */
  capture(
    requester: WriteRequester,
    candidateId: string,
    body: CaptureAssessment,
  ): Promise<WriteReply> {
    const problem = captureRequestProblem(body);
    if (problem) throw problem;
    return this.writes.execute(
      { operationId: OPERATION, pathParams: { candidateId }, body, requester },
      (context) => this.record(context, candidateId, body),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        replayRecord: (id) => this.stored(id),
      },
    );
  }

  private async record(context: WriteContext, candidateId: string, body: CaptureAssessment) {
    const { tx } = context;
    const found = await tx.noticeCandidate.findUnique({
      where: { id: candidateId },
      select: { caseId: true },
    });
    if (found === null) throw apiErrors.notFound();
    const caseRow = await lockCase(tx, found.caseId);
    assertCaseWritable(caseRow, OPERATION);
    await this.observer.afterCaseLock(caseRow.id);
    // The candidate's content never changes; its supersession is written under the same case lock.
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM notice_candidates WHERE id = ${candidateId} FOR SHARE`,
    );
    const candidate = await tx.noticeCandidate.findUniqueOrThrow({ where: { id: candidateId } });
    if (candidate.caseId !== caseRow.id) throw apiErrors.internal();
    if (candidate.artifactSha256 !== body.expectedArtifactSha256) {
      throw apiErrors.assessmentArtifactChanged();
    }
    const prompt = await tx.promptSnapshot.findUniqueOrThrow({
      where: { id: candidate.promptSnapshotId },
    });
    const scope = validationScope(prompt);
    const { view, blocking } = assembleContext(await currentRows(tx, scope), scope);
    if (view.dependencyDigest !== body.expectedDependencyDigest) {
      throw apiErrors.assessmentContextChanged();
    }
    assertDeliverable(view, scope, blocking);
    const ruleset = rulesetProblem(body.rulesetVersion, TECHNICAL_RULESET_VERSION);
    if (ruleset) throw ruleset;
    const epoch = {
      candidateId: candidate.id,
      artifactSha256: candidate.artifactSha256,
      dependencyDigest: view.dependencyDigest,
      rulesetVersion: TECHNICAL_RULESET_VERSION,
    };
    const run = await tx.validationRun.findFirst({
      where: epoch,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    if (run === null) {
      throw apiErrors.validationRunRequired({
        artifactSha256: epoch.artifactSha256,
        dependencyDigest: epoch.dependencyDigest,
        rulesetVersion: epoch.rulesetVersion,
      });
    }
    const predecessor =
      body.supersedesAssessmentId === undefined || body.supersedesAssessmentId === null
        ? null
        : await this.predecessor(tx, candidate, body.gate, body.supersedesAssessmentId);
    const links = await this.lockSupports(tx, caseRow.id, body);
    await this.checkCitedSources(tx, caseRow, prompt, body, links);
    await this.observer.beforeInsert(caseRow.id);

    const id = randomUUID();
    const row = await tx.candidateAssessment
      .create({
        data: {
          id,
          candidateId: candidate.id,
          caseId: candidate.caseId,
          gate: body.gate,
          result: body.result,
          artifactSha256: epoch.artifactSha256,
          dependencyDigest: epoch.dependencyDigest,
          rulesetVersion: epoch.rulesetVersion,
          scopeState: body.scopeState,
          performerKind: body.performerKind,
          performerLabel: body.performerLabel,
          assessedAt: typeof body.assessedAt === 'string' ? toDbInstant(body.assessedAt) : null,
          provenance: body.provenance,
          rationale: body.rationale,
          scopeText: body.scopeText,
          limitations: body.limitations ?? null,
          askDispositions:
            body.askDispositions === undefined ? Prisma.DbNull : json(body.askDispositions),
          supersedesAssessmentId: predecessor?.id ?? null,
          createdAt: context.now,
          createdById: context.actorUserId,
        },
      })
      .catch((error: unknown) => {
        // The unique supersedes key is the backstop of the head check.
        if (predecessor !== null && isUniqueViolation(error)) {
          throw apiErrors.assessmentAlreadySuperseded(null);
        }
        throw error;
      });
    // One instant for every row: ascending ids make the (createdAt, id) order the request order.
    const supportIds = body.sources.map(() => randomUUID()).sort();
    await tx.assessmentSource.createMany({
      data: body.sources.map((support, index) => ({
        id: supportIds[index] as string,
        assessmentId: id,
        caseSourceId: support.caseSourceId,
        supportedConclusion: support.supportedConclusion,
        createdAt: context.now,
        createdById: context.actorUserId,
      })),
    });
    await context.audit({
      action: 'CANDIDATE_ASSESSMENT_CAPTURED',
      entityType: ENTITY,
      entityId: id,
      after: {
        candidateId: candidate.id,
        caseId: candidate.caseId,
        gate: row.gate,
        result: row.result,
        artifactSha256: row.artifactSha256,
        dependencyDigest: row.dependencyDigest,
        rulesetVersion: row.rulesetVersion,
        epochValidationRunId: run.id,
        scopeState: row.scopeState,
        performerKind: row.performerKind,
        performerLabel: textLength(row.performerLabel),
        provenance: row.provenance,
        assessedAt: row.assessedAt === null ? null : row.assessedAt.toISOString(),
        rationale: textLength(row.rationale),
        scopeText: textLength(row.scopeText),
        limitations: row.limitations === null ? null : textLength(row.limitations),
        askDispositions: askAudit(body.askDispositions),
        supersedesAssessmentId: row.supersedesAssessmentId,
        candidateSuperseded: candidate.supersededAt !== null,
        sources: body.sources.map((support, index) => ({
          assessmentSourceId: supportIds[index] as string,
          caseSourceId: support.caseSourceId,
          sourceId: links[index]?.sourceId ?? '',
          supportedConclusion: textLength(support.supportedConclusion),
        })),
      },
      sourceIds: [...new Set(links.map((link) => link.sourceId))],
    });
    // The assessment only, like a validation run without its issues: its support rows are read back
    // with getCandidateAssessmentSources (1–100 rows would overrun the 100 affected resources).
    return created(ENTITY, toCandidateAssessmentView(row));
  }

  /**
   * The assessment a new one supersedes (locked FOR UPDATE): it exists (422 REFERENCE_NOT_FOUND)
   * and is of this case, candidate and gate and the head of its chain (assessment-rules.ts).
   */
  private async predecessor(
    tx: Prisma.TransactionClient,
    candidate: NoticeCandidate,
    gate: CaptureAssessment['gate'],
    id: string,
  ): Promise<CandidateAssessment> {
    const locked = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM candidate_assessments WHERE id = ${id} FOR UPDATE`,
    );
    if (locked.length === 0) throw apiErrors.referenceNotFound('supersedesAssessmentId');
    const row = await tx.candidateAssessment.findUniqueOrThrow({ where: { id } });
    const successor = await tx.candidateAssessment.findFirst({
      where: { supersedesAssessmentId: id },
      select: { id: true },
    });
    const problem = supersessionProblem(
      row,
      { caseId: candidate.caseId, candidateId: candidate.id, gate },
      successor?.id ?? null,
    );
    if (problem) throw problem;
    return row;
  }

  /**
   * Each supporting CaseSource exists (422 REFERENCE_NOT_FOUND), belongs to this case (422
   * CROSS_CASE_REFERENCE; INVARIANTS §3 "AssessmentSource links a CaseSource from the same Case")
   * and is LINKED (409: a paused or unlinked link supports nothing new). Share-locked in id order;
   * returns the links in request order.
   */
  private async lockSupports(
    tx: Prisma.TransactionClient,
    caseId: string,
    body: CaptureAssessment,
  ): Promise<SupportLink[]> {
    for (const id of [...new Set(body.sources.map((support) => support.caseSourceId))].sort()) {
      await lockForShare(tx, 'CaseSource', id);
    }
    const links: SupportLink[] = [];
    for (const [index, support] of body.sources.entries()) {
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
          operation: OPERATION,
          field,
        });
      }
      links.push({ id: link.id, sourceId: link.sourceId });
    }
    return links;
  }

  /**
   * The sources the assessment cites, checked in one sorted locking pass (source-scope.ts, target
   * Case): for a PASS, the source behind every support applies to the case now (D-3 — a HOLD,
   * BLOCKED, MISSING or CONFLICT may cite a linked source of this case that no longer applies, to
   * record the problem); the sources of every ask disposition apply to the case, and each
   * disposition answers an ask of this case's parent binding the prompt named.
   */
  private async checkCitedSources(
    tx: Prisma.TransactionClient,
    caseRow: CaseRecord,
    prompt: PromptSnapshot,
    body: CaptureAssessment,
    links: readonly SupportLink[],
  ): Promise<void> {
    const uses: SourceUse[] = supportsMustApply(body.result)
      ? links.map((link, index) => ({
          field: `sources.${index}.caseSourceId`,
          sourceId: link.sourceId,
        }))
      : [];
    for (const [index, disposition] of (body.askDispositions ?? []).entries()) {
      const field = `askDispositions.${index}.parentBindingId`;
      const binding = await tx.correspondenceBinding.findUnique({
        where: { id: disposition.parentBindingId },
        select: { id: true, caseId: true },
      });
      if (!binding) throw apiErrors.referenceNotFound(field);
      if (binding.caseId !== caseRow.id) throw apiErrors.crossCaseReference(field, 'record');
      if (binding.id !== prompt.parentBindingId) {
        throw apiErrors.askParentMismatch(field, prompt.parentBindingId);
      }
      disposition.sourceIds.forEach((sourceId, position) =>
        uses.push({ field: `askDispositions.${index}.sourceIds.${position}`, sourceId }),
      );
    }
    if (uses.length > 0) await assertSourcesUsable(tx, uses, await caseTarget(tx, caseRow));
  }

  /** This candidate's assessments (404 for an unknown candidate), newest first, as stored. */
  async list(
    candidateId: string,
    query: QueryValues,
  ): Promise<{ items: CandidateAssessmentView[]; nextCursor: string | null }> {
    const owner = await this.prisma.noticeCandidate.findUnique({
      where: { id: candidateId },
      select: { id: true },
    });
    if (!owner) throw apiErrors.notFound();
    const q = searchText(query);
    const page = pageRequest(contractOperation('listCandidateAssessments'), query, this.cursors, {
      candidateId,
      q,
    });
    const match =
      q === null
        ? Prisma.empty
        : Prisma.sql`AND (a.id = ${q} OR a.gate = ${q} OR a.result = ${q} OR a.scope_state = ${q}
            OR a.dependency_digest = ${q} OR a.ruleset_version = ${q} OR a.performer_label = ${q})`;
    const ids = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT a.id FROM candidate_assessments a WHERE a.candidate_id = ${candidateId}
        ${match} ${keysetAfter(page.after, 'a')}
        ORDER BY a.created_at DESC, a.id DESC ${pageLimit(page)}`,
    );
    const rows = await this.prisma.candidateAssessment.findMany({
      where: { id: { in: ids.map((row) => row.id) } },
    });
    return toPage(inIdOrder(ids, rows), page, this.cursors, toCandidateAssessmentView);
  }

  /**
   * The AssessmentSource rows recorded for one assessment of this candidate, exactly as stored, in
   * ascending (createdAt, id) order — the order the capture listed them. 404 for an unknown
   * candidate, an unknown assessment and another candidate's assessment, indistinguishably.
   */
  async sources(candidateId: string, id: string): Promise<CandidateAssessmentSourcesView> {
    const candidate = await this.prisma.noticeCandidate.findUnique({
      where: { id: candidateId },
      select: { id: true, caseId: true },
    });
    if (!candidate) throw apiErrors.notFound();
    const assessment = await this.prisma.candidateAssessment.findUnique({
      where: { id },
      select: { id: true, candidateId: true, caseId: true },
    });
    if (!assessment || assessment.candidateId !== candidate.id) throw apiErrors.notFound();
    const rows = await this.prisma.assessmentSource.findMany({
      where: { assessmentId: assessment.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: MAX_SUPPORTS + 1,
      include: { caseSource: { select: { caseId: true } } },
    });
    // A capture writes 1–100 rows naming CaseSources of the assessment's own case (INVARIANTS §3),
    // and the assessment's case is its candidate's (composite foreign key). Anything else is never
    // shown: it would name another case's link or break the contract (500, never a partial answer).
    if (
      assessment.caseId !== candidate.caseId ||
      rows.length === 0 ||
      rows.length > MAX_SUPPORTS ||
      rows.some((row) => row.caseSource.caseId !== assessment.caseId)
    ) {
      throw apiErrors.internal();
    }
    return {
      assessmentId: assessment.id,
      sources: rows.map(({ caseSource: _caseSource, ...row }) => toAssessmentSourceView(row)),
    };
  }

  private async stored(id: string): Promise<CandidateAssessmentView | null> {
    const row = await this.prisma.candidateAssessment.findUnique({ where: { id } });
    return row === null ? null : toCandidateAssessmentView(row);
  }
}
