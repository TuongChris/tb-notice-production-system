// NoticeCandidate (P4F) — importCandidate, listCaseCandidates, getCandidate, reviseCandidate and
// supersedeCandidate (TB-SCHEMA-API-v1.2.0). A candidate is the exact draft artifact imported into
// TB for later validation and human review: the subject, body, envelope and prepared-document plan
// drafted outside the application from one exact prompt snapshot, stored unsigned. Storing it
// proves nothing about the prose and is never an approval, a review, a correctness or legal-validity
// finding, a G1–G6 PASS, READY_FOR_SIGNER, a signature, an adoption or a transmission.
//
//   import    POST /cases/{caseId}/candidates. Idempotency-Key; no If-Match (the contract declares
//             no precondition target). The texts are checked for NUL before the claim (422). One
//             READ COMMITTED transaction:
//               lock the CaseRecord FOR UPDATE (404; an archived case is read-only, 409)
//               → the named prompt snapshot of this case (422 REFERENCE_NOT_FOUND /
//                 CROSS_CASE_REFERENCE); the task is the prompt's
//               → the envelope against that prompt (candidate-rules.ts: its parent binding exactly,
//                 the pinned selection's sender mailbox exactly)
//               → the document plans: each source revision applies to this case (source-scope.ts,
//                 target Case), a named hash is the one recorded on that revision, and
//                 PREVIOUSLY_SUPPLIED is recorded on a prior transmission in the prompt's context
//               → the next version for this case and task, under the case lock (the unique key
//                 (case, task, version) is the backstop)
//               → bodySha256 and artifactSha256 (candidate-artifact.ts)
//               → one NoticeCandidate (parent none, signature state HUMAN_PENDING)
//               → one redacted audit event (identifiers, version, hashes, counts and lengths —
//                 never the subject, body, addresses or plan texts) → the idempotency record →
//                 commit.
//   revise    POST /candidates/{id}/revisions. The same checks for the new content and its prompt,
//             under the lock of the candidate's own case: the candidate is the latest version of
//             its chain (a successor exists → 409 REVISION_NOT_HEAD naming the latest), the new
//             prompt is of the same case (422 CROSS_CASE_REFERENCE) and the same task (422
//             REVISION_SCOPE_CHANGE). A NEW candidate is inserted with the next version and
//             parentCandidateId = the revised one; the revised candidate is never touched.
//   supersede POST /candidates/{id}/supersede — the dedicated lifecycle command: under the case lock
//             it records supersededAt and the reason once (a second supersession → 409
//             CANDIDATE_ALREADY_SUPERSEDED). Content, hashes and every other record stay as they
//             are: it deletes, edits and creates nothing, and it is an internal artifact lifecycle
//             step — never a retraction of a platform notice, never a correspondence record.
//   list      GET /cases/{caseId}/candidates — this case's candidates (404 for an unknown case),
//             newest first, summaries only, superseded ones included; `q` matches exactly a
//             candidate id, a prompt snapshot id, a body SHA-256 or an artifact SHA-256 — never a
//             search of the subject or body.
//   get       GET /candidates/{id} — one candidate exactly as stored (404 for an unknown id).
//
// Every candidate write locks its case first, so the writes of one case are serialized: two imports
// cannot take one version, two revisions of one candidate cannot both succeed, a candidate is
// superseded once. The case row is locked, not changed: a candidate is downstream of a prompt, not
// case context (it would otherwise change the very context its prompt froze); a candidate makes the
// case history-bearing (case-rules.ts HISTORY). The replay of an idempotent write reads the candidate
// back by id: the idempotency record keeps no copy of the draft. Nothing is sent, fetched or called:
// no AI provider, network, mail or Drive access exists here or anywhere in this module.
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  codePointLength,
  type ArchiveRequest,
  type CreateCandidate,
  type NoticeCandidate as CandidateView,
  type NoticeCandidateSummary,
  type ProductionContext,
  type ReviseCandidate,
} from '@tb/contracts';
import { Prisma, type CaseRecord, type NoticeCandidate } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { apiErrors } from '../../infrastructure/http/api-error.js';
import { CursorCodec } from '../../infrastructure/write/cursor.js';
import {
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
import { assertCaseWritable, caseTarget, lockCase } from '../cases/case-rules.js';
import { created, updated } from '../directory/outcomes.js';
import { assertSourcesUsable, type SourceUse } from '../sources/source-scope.js';
import {
  CANDIDATE_SIGNATURE_STATE,
  candidateArtifactSha256,
  candidateBodySha256,
  storedDocumentPlan,
  storedEnvelope,
  type StoredDocumentPlan,
  type StoredEnvelope,
} from './candidate-artifact.js';
import {
  candidateTextProblem,
  documentPlanProblem,
  envelopeProblem,
  type PromptBinding,
} from './candidate-rules.js';
import { SUMMARY_COLUMNS, toCandidateSummary, toCandidateView } from './candidate-views.js';
import {
  CANDIDATE_WRITE_OBSERVER,
  type CandidateWriteObserver,
} from './candidate-write-observer.js';

const ENTITY = 'NoticeCandidate';

const json = (value: unknown) => value as Prisma.InputJsonValue;

/** A free text in audit: only its length (INVARIANTS §7 "Audit redact ... full private bodies"). */
const textLength = (value: string) => ({ redacted: true, codePoints: codePointLength(value) });

/** The prompt snapshot a candidate names: a snapshot of this case (422 otherwise). */
async function promptOf(
  tx: Prisma.TransactionClient,
  caseId: string,
  promptSnapshotId: string,
): Promise<PromptBinding> {
  const row = await tx.promptSnapshot.findUnique({
    where: { id: promptSnapshotId },
    select: { id: true, caseId: true, taskType: true, parentBindingId: true, contextJson: true },
  });
  if (row === null) throw apiErrors.referenceNotFound('promptSnapshotId');
  if (row.caseId !== caseId) throw apiErrors.crossCaseReference('promptSnapshotId', 'record');
  return {
    id: row.id,
    caseId: row.caseId,
    taskType: row.taskType,
    parentBindingId: row.parentBindingId,
    context: row.contextJson as unknown as ProductionContext,
  };
}

/** The latest version of the chain that continues at `id` (a chain never forks). */
async function chainHead(tx: Prisma.TransactionClient, id: string): Promise<string> {
  let head = id;
  for (;;) {
    const next = await tx.noticeCandidate.findFirst({
      where: { parentCandidateId: head },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    if (next === null) return head;
    head = next.id;
  }
}

/** The distinct sources a candidate's document plans cite (AuditEvent.sourceIds). */
const planSourceIds = (plans: readonly StoredDocumentPlan[]) => [
  ...new Set(plans.map((plan) => plan.sourceId)),
];

/** The audit record of a candidate's content: identifiers, hashes, counts and lengths only. */
function contentAudit(
  row: NoticeCandidate,
  envelope: StoredEnvelope,
  plans: readonly StoredDocumentPlan[],
): Prisma.InputJsonObject {
  const states: Record<string, number> = {};
  for (const plan of plans) states[plan.state] = (states[plan.state] ?? 0) + 1;
  return {
    caseId: row.caseId,
    promptSnapshotId: row.promptSnapshotId,
    parentCandidateId: row.parentCandidateId,
    taskType: row.taskType,
    version: row.version,
    bodySha256: row.bodySha256,
    artifactSha256: row.artifactSha256,
    signatureState: row.signatureState,
    envelopeParentBindingId: envelope.parentBindingId,
    subject: textLength(row.subject),
    bodyText: textLength(row.bodyText),
    preparedDocuments: { count: plans.length, states },
    authoringTool: row.authoringTool === null ? null : textLength(row.authoringTool),
    revisionReason: row.revisionReason === null ? null : textLength(row.revisionReason),
  };
}

@Injectable()
export class CandidatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly writes: WriteExecutor,
    private readonly cursors: CursorCodec,
    @Inject(CANDIDATE_WRITE_OBSERVER) private readonly observer: CandidateWriteObserver,
  ) {}

  /** The first candidate of a new chain, drafted from one prompt snapshot of this case. */
  import(requester: WriteRequester, caseId: string, body: CreateCandidate): Promise<WriteReply> {
    const problem = candidateTextProblem(body);
    if (problem) throw problem;
    return this.writes.execute(
      { operationId: 'importCandidate', pathParams: { caseId }, body, requester },
      async (context) => {
        const current = await lockCase(context.tx, caseId);
        assertCaseWritable(current, 'importCandidate');
        await this.observer.afterCaseLock(caseId);
        const prompt = await promptOf(context.tx, caseId, body.promptSnapshotId);
        const { row, envelope, plans } = await this.insert(context, current, prompt, body, null);
        await context.audit({
          action: 'CANDIDATE_IMPORTED',
          entityType: ENTITY,
          entityId: row.id,
          after: contentAudit(row, envelope, plans),
          sourceIds: planSourceIds(plans),
        });
        return created(ENTITY, toCandidateView(row));
      },
      { replayRecord: (id) => this.stored(id) },
    );
  }

  /** A new candidate revising the latest version of a chain; the revised one never changes. */
  revise(requester: WriteRequester, id: string, body: ReviseCandidate): Promise<WriteReply> {
    const problem = candidateTextProblem(body);
    if (problem) throw problem;
    return this.writes.execute(
      { operationId: 'reviseCandidate', pathParams: { id }, body, requester },
      async (context) => {
        const { caseRow, candidate: parent } = await this.lockCandidate(
          context,
          id,
          'reviseCandidate',
        );
        const successor = await context.tx.noticeCandidate.findFirst({
          where: { parentCandidateId: parent.id },
          select: { id: true },
        });
        if (successor !== null) {
          throw apiErrors.revisionNotHead(await chainHead(context.tx, successor.id), 'candidate');
        }
        const prompt = await promptOf(context.tx, parent.caseId, body.promptSnapshotId);
        if (prompt.taskType !== parent.taskType) {
          throw apiErrors.revisionScopeChange(['promptSnapshotId'], 'candidate');
        }
        const { row, envelope, plans } = await this.insert(context, caseRow, prompt, body, parent);
        await context.audit({
          action: 'CANDIDATE_REVISED',
          entityType: ENTITY,
          entityId: row.id,
          after: {
            ...contentAudit(row, envelope, plans),
            revisedArtifactSha256: parent.artifactSha256,
            samePromptSnapshot: parent.promptSnapshotId === row.promptSnapshotId,
          },
          sourceIds: planSourceIds(plans),
        });
        return created(ENTITY, toCandidateView(row));
      },
      { replayRecord: (candidateId) => this.stored(candidateId) },
    );
  }

  /**
   * Records once that this draft artifact is no longer the active one (the dedicated lifecycle
   * command). Nothing else changes; nothing is retracted, sent or contacted.
   */
  supersede(requester: WriteRequester, id: string, body: ArchiveRequest): Promise<WriteReply> {
    const problem = candidateTextProblem(body);
    if (problem) throw problem;
    return this.writes.execute(
      { operationId: 'supersedeCandidate', pathParams: { id }, body, requester },
      async (context) => {
        const { candidate: current } = await this.lockCandidate(context, id, 'supersedeCandidate');
        if (current.supersededAt !== null) {
          throw apiErrors.candidateAlreadySuperseded(current.supersededAt.toISOString());
        }
        const changed = await context.tx.noticeCandidate.updateMany({
          where: { id, supersededAt: null },
          data: { supersededAt: context.now, supersedeReason: body.reason },
        });
        if (changed.count !== 1) throw new Error('a locked candidate changed during supersession');
        const row = await context.tx.noticeCandidate.findUniqueOrThrow({ where: { id } });
        await context.audit({
          action: 'CANDIDATE_SUPERSEDED',
          entityType: ENTITY,
          entityId: row.id,
          before: { supersededAt: null },
          after: {
            caseId: row.caseId,
            taskType: row.taskType,
            version: row.version,
            artifactSha256: row.artifactSha256,
            supersededAt: context.now.toISOString(),
            supersedeReason: textLength(body.reason),
            supersession: 'INTERNAL_DRAFT_ARTIFACT',
            platformRetraction: false,
            externalAction: 'NONE',
          },
        });
        return updated(ENTITY, toCandidateView(row));
      },
      { replayRecord: (candidateId) => this.stored(candidateId) },
    );
  }

  /** This case's candidates (404 for an unknown case), newest first, as summaries. */
  async list(
    caseId: string,
    query: QueryValues,
  ): Promise<{ items: NoticeCandidateSummary[]; nextCursor: string | null }> {
    const owner = await this.prisma.caseRecord.findUnique({
      where: { id: caseId },
      select: { id: true },
    });
    if (!owner) throw apiErrors.notFound();
    const q = searchText(query);
    const page = pageRequest(contractOperation('listCaseCandidates'), query, this.cursors, {
      caseId,
      q,
    });
    const match =
      q === null
        ? Prisma.empty
        : Prisma.sql`AND (c.id = ${q} OR c.prompt_snapshot_id = ${q} OR c.body_sha256 = ${q} OR c.artifact_sha256 = ${q})`;
    const ids = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT c.id FROM notice_candidates c WHERE c.case_id = ${caseId} ${match}
        ${keysetAfter(page.after, 'c')}
        ORDER BY c.created_at DESC, c.id DESC ${pageLimit(page)}`,
    );
    const rows = await this.prisma.noticeCandidate.findMany({
      where: { id: { in: ids.map((row) => row.id) } },
      select: SUMMARY_COLUMNS,
    });
    return toPage(inIdOrder(ids, rows), page, this.cursors, toCandidateSummary);
  }

  /** One candidate exactly as stored (404 for an unknown id). */
  async get(id: string): Promise<CandidateView> {
    const candidate = await this.stored(id);
    if (candidate === null) throw apiErrors.notFound();
    return candidate;
  }

  private async stored(id: string): Promise<CandidateView | null> {
    const row = await this.prisma.noticeCandidate.findUnique({ where: { id } });
    return row === null ? null : toCandidateView(row);
  }

  /**
   * Locks the case of an existing candidate (its case never changes, so it is read before the
   * lock), then the candidate itself — the lock order CaseRecord → NoticeCandidate — and re-reads
   * it. 404 for an unknown candidate; its archived case is read-only (409).
   */
  private async lockCandidate(
    context: WriteContext,
    id: string,
    operation: string,
  ): Promise<{ caseRow: CaseRecord; candidate: NoticeCandidate }> {
    const { tx } = context;
    const found = await tx.noticeCandidate.findUnique({ where: { id }, select: { caseId: true } });
    if (found === null) throw apiErrors.notFound();
    const caseRow = await lockCase(tx, found.caseId);
    assertCaseWritable(caseRow, operation);
    await this.observer.afterCaseLock(found.caseId);
    await tx.$queryRaw(Prisma.sql`SELECT id FROM notice_candidates WHERE id = ${id} FOR UPDATE`);
    const candidate = await tx.noticeCandidate.findUniqueOrThrow({ where: { id } });
    return { caseRow, candidate };
  }

  /**
   * Checks and inserts one candidate of `caseRow` drafted from `prompt` (the case is locked): the
   * envelope against the prompt, the document plans, the next version, the hashes.
   */
  private async insert(
    context: WriteContext,
    caseRow: CaseRecord,
    prompt: PromptBinding,
    body: CreateCandidate | ReviseCandidate,
    parent: NoticeCandidate | null,
  ): Promise<{
    row: NoticeCandidate;
    envelope: StoredEnvelope;
    plans: readonly StoredDocumentPlan[];
  }> {
    const { tx } = context;
    const envelope = storedEnvelope(body.envelope);
    const envelopeRefusal = envelopeProblem(prompt, envelope);
    if (envelopeRefusal) throw envelopeRefusal;
    const plans = body.preparedDocuments.map(storedDocumentPlan);
    const uses: SourceUse[] = plans.map((plan, index) => ({
      field: `preparedDocuments.${index}.sourceId`,
      sourceId: plan.sourceId,
    }));
    await assertSourcesUsable(tx, uses, await caseTarget(tx, caseRow));
    const recorded =
      uses.length === 0
        ? []
        : await tx.sourceReference.findMany({
            where: { id: { in: planSourceIds(plans) } },
            select: { id: true, contentSha256: true },
          });
    const planRefusal = documentPlanProblem(
      plans,
      prompt.context,
      new Map(recorded.map((source) => [source.id, source.contentSha256])),
    );
    if (planRefusal) throw planRefusal;
    const last = await tx.noticeCandidate.aggregate({
      where: { caseId: caseRow.id, taskType: prompt.taskType },
      _max: { version: true },
    });
    const version = (last._max.version ?? 0) + 1;
    const content = {
      subject: body.subject,
      bodyText: body.bodyText,
      envelope,
      preparedDocuments: plans,
    };
    const bodySha256 = candidateBodySha256(body.bodyText);
    const artifactSha256 = candidateArtifactSha256(content);
    await this.observer.beforeInsert(caseRow.id);
    const row = await tx.noticeCandidate.create({
      data: {
        id: randomUUID(),
        caseId: caseRow.id,
        promptSnapshotId: prompt.id,
        parentCandidateId: parent?.id ?? null,
        version,
        taskType: prompt.taskType,
        subject: body.subject,
        envelopeJson: json(envelope),
        bodyText: body.bodyText,
        bodySha256,
        artifactSha256,
        preparedDocuments: json(plans),
        signatureState: CANDIDATE_SIGNATURE_STATE,
        authoringTool: body.authoringTool ?? null,
        revisionReason: body.revisionReason ?? null,
        createdAt: context.now,
        createdById: context.actorUserId,
      },
    });
    return { row, envelope, plans };
  }
}
