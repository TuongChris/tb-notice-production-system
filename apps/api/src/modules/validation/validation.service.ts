// Technical validation (P4G) — validateCandidate, listValidationRuns and listValidationIssues
// (TB-SCHEMA-API-v1.2.0). A ValidationRun records what the technical ruleset TB-TECHNICAL-RULESET-v1
// found for one exact candidate artifact against the current production context of its prompt's
// scope. It is a technical result only: never a G1–G6 review, legal approval or sufficiency,
// signer eligibility, readiness, READY_FOR_SIGNER, a signature, G7 or permission to send, and it
// creates no CandidateAssessment and changes no candidate, fact or case record.
//
//   validate  POST /candidates/{candidateId}/validation-runs. Idempotency-Key; no If-Match (the
//             contract declares no precondition target: the expected artifact SHA-256 and
//             dependency digest in the body are the precondition). INVARIANTS §5 "Validation
//             captures context, runs bounded deterministic checks outside any long-lived lock, then
//             rechecks the dependency digest in a short transaction before committing":
//             capture (after the idempotency claim, outside the write transaction; one REPEATABLE
//             READ read-only snapshot):
//               the exact candidate named in the path (404; never another one: no latest version,
//               no parent or child followed; a superseded candidate is validated as the exact
//               historical artifact it is) → its case (archived → 409, read-only) → the expected
//               artifact SHA-256 is the stored one (412 ARTIFACT_CHANGED; nothing is recomputed
//               from client text) → its prompt snapshot → the scope of that prompt
//               (validation-scope.ts) → the CURRENT production context of that scope with the P4D
//               reader and assembly (the digest, closure and fingerprints of P4D, unchanged; a
//               binding the prompt named that has been corrected since → 412 CONTEXT_CHANGED) → the
//               plan's source revisions (validation-inputs.ts) → the expected dependency digest is
//               the current one (412 CONTEXT_CHANGED; never substituted) → the P4D bounds and
//               DRAFTING gate
//             evaluate (pure, no transaction and no lock): the ruleset (technical-ruleset.ts); a
//               rule that fails while running makes an ERROR run with its diagnostics, never a pass
//             commit (one short SERIALIZABLE transaction): lock the CaseRecord FOR UPDATE (archived
//               meanwhile → 409) → the candidate is still the same artifact → the context of the same
//               scope is rebuilt and its digest must be the evaluated one, the plan's sources must
//               read as evaluated (412 CONTEXT_CHANGED otherwise: no run is published against mixed
//               snapshots) → one ValidationRun with exactly the evaluated context, dependency
//               manifest, digest, ruleset, result, coverage manifest and counts → its
//               ValidationIssues → one redacted audit event → the idempotency record → commit.
//             The case row is locked, never changed; the candidate is never changed. A replay of the
//             same key reads the stored run back (the idempotency record keeps no copy of it); the
//             same key with another body is 409.
//   list      GET /candidates/{candidateId}/validation-runs — that candidate's runs (404 for an
//             unknown candidate), newest first, summaries only; a superseded candidate's runs stay
//             readable. `q` matches exactly a run id, a dependency digest or a result.
//   issues    GET /validation-runs/{id}/issues — that run's issues (404 for an unknown run) in the
//             order the ruleset reported them; `q` matches exactly an issue id, a rule id, a severity
//             or a check kind.
// Nothing is sent, fetched or called: no AI provider, network, mail or Drive access exists here.
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type {
  ContextView,
  Dependency,
  ValidateCandidate,
  ValidationIssue as ValidationIssueView,
  ValidationRun as ValidationRunView,
  ValidationRunSummary,
} from '@tb/contracts';
import { Prisma, type NoticeCandidate } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { ApiError, apiErrors } from '../../infrastructure/http/api-error.js';
import { CLOCK, type Clock } from '../../infrastructure/time/clock.js';
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
  type WriteOutcome,
  type WriteReply,
  type WriteRequester,
} from '../../infrastructure/write/write-executor.js';
import { assertCaseWritable, lockCase } from '../cases/case-rules.js';
import { created } from '../directory/outcomes.js';
import { assembleContext, assertDeliverable } from '../production/context-assembly.js';
import { NO_CONTEXT_READ_OBSERVER } from '../production/context-read-observer.js';
import type { ContextScope } from '../production/context-scope.js';
import { readContextRows, type ContextRows } from '../production/context-snapshot.js';
import { evaluateCandidate, type Evaluation } from './technical-ruleset.js';
import { planSourcesFingerprint, readPlanSources } from './validation-inputs.js';
import { VALIDATION_OBSERVER, type ValidationObserver } from './validation-observer.js';
import { validationScope } from './validation-scope.js';
import {
  RUN_SUMMARY_COLUMNS,
  toValidationIssueView,
  toValidationRunSummary,
  toValidationRunView,
} from './validation-views.js';

const ENTITY = 'ValidationRun';

/** The capture's read-only snapshot (INVARIANTS §5): short, no lock, nothing external. */
const SNAPSHOT_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  maxWait: 2000,
  timeout: 5000,
} as const;

const json = (value: unknown) => value as Prisma.InputJsonValue;

/** What the capture read and the rules found, carried unchanged into the commit transaction. */
interface Captured {
  readonly candidate: NoticeCandidate;
  readonly promptSnapshotId: string;
  readonly generationMode: string;
  readonly scope: ContextScope;
  readonly view: ContextView;
  readonly planFingerprint: string;
  readonly evaluation: Evaluation;
  readonly startedAt: Date;
  readonly completedAt: Date;
}

/**
 * The current context rows of the scope. A binding the prompt named that has been corrected since
 * cannot be read for this scope any more: the context the caller reviewed has changed (412), and a
 * fresh read of the scope names the correction.
 */
async function currentRows(
  tx: Prisma.TransactionClient,
  scope: ContextScope,
): Promise<ContextRows> {
  try {
    return await readContextRows(tx, scope, NO_CONTEXT_READ_OBSERVER);
  } catch (error) {
    if (error instanceof ApiError && error.code === 'BINDING_ALREADY_SUPERSEDED') {
      throw apiErrors.validationContextChanged('expectedDependencyDigest');
    }
    throw error;
  }
}

@Injectable()
export class ValidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly writes: WriteExecutor,
    private readonly cursors: CursorCodec,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(VALIDATION_OBSERVER) private readonly observer: ValidationObserver,
  ) {}

  /** One technical validation run of exactly this candidate (see above). */
  validate(
    requester: WriteRequester,
    candidateId: string,
    body: ValidateCandidate,
  ): Promise<WriteReply> {
    return this.writes.execute<Captured>(
      { operationId: 'validateCandidate', pathParams: { candidateId }, body, requester },
      (context, captured) => this.commit(context, captured),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        replayRecord: (id) => this.storedRun(id),
        prepare: (now) => this.capture(candidateId, body, now),
      },
    );
  }

  /** Capture and evaluate: one read-only snapshot, then the pure ruleset outside any transaction. */
  private async capture(
    candidateId: string,
    body: ValidateCandidate,
    now: Date,
  ): Promise<Captured> {
    const read = await this.prisma.$transaction(async (tx) => {
      const candidate = await tx.noticeCandidate.findUnique({ where: { id: candidateId } });
      if (candidate === null) throw apiErrors.notFound();
      const caseRow = await tx.caseRecord.findUniqueOrThrow({ where: { id: candidate.caseId } });
      assertCaseWritable(caseRow, 'validateCandidate');
      if (candidate.artifactSha256 !== body.expectedArtifactSha256) {
        throw apiErrors.artifactChanged('expectedArtifactSha256');
      }
      const prompt = await tx.promptSnapshot.findUniqueOrThrow({
        where: { id: candidate.promptSnapshotId },
      });
      const scope = validationScope(prompt);
      const rows = await currentRows(tx, scope);
      const planSources = await readPlanSources(tx, candidate.preparedDocuments, caseRow);
      return { candidate, prompt, scope, rows, planSources };
    }, SNAPSHOT_OPTIONS);
    const { candidate, prompt, scope, rows, planSources } = read;
    const { view, blocking } = assembleContext(rows, scope);
    if (view.dependencyDigest !== body.expectedDependencyDigest) {
      throw apiErrors.validationContextChanged('expectedDependencyDigest');
    }
    assertDeliverable(view, scope, blocking);
    await this.observer.afterCapture(candidate.caseId);
    const evaluation = evaluateCandidate(
      {
        candidate: {
          id: candidate.id,
          caseId: candidate.caseId,
          taskType: candidate.taskType,
          subject: candidate.subject,
          bodyText: candidate.bodyText,
          bodySha256: candidate.bodySha256,
          artifactSha256: candidate.artifactSha256,
          signatureState: candidate.signatureState,
          envelope: candidate.envelopeJson,
          preparedDocuments: candidate.preparedDocuments,
        },
        prompt: {
          id: prompt.id,
          caseId: prompt.caseId,
          taskType: prompt.taskType,
          generationMode: prompt.generationMode,
          parentBindingId: prompt.parentBindingId,
          dependencyDigest: prompt.dependencyDigest,
          dependencyManifest: prompt.dependencyManifest as unknown as Dependency[],
          promptSha256: prompt.promptSha256,
        },
        evaluated: view,
        parentCorrespondenceId: rows.parent?.correspondenceId ?? null,
        planSources,
      },
      { beforeRule: (ruleId) => this.observer.beforeRule(ruleId) },
    );
    const finished = this.clock.now();
    return {
      candidate,
      promptSnapshotId: prompt.id,
      generationMode: prompt.generationMode,
      scope,
      view,
      planFingerprint: planSourcesFingerprint(planSources),
      evaluation,
      startedAt: now,
      completedAt: finished.getTime() < now.getTime() ? now : finished,
    };
  }

  /** The short commit transaction: recheck, then store exactly what was evaluated. */
  private async commit(context: WriteContext, captured: Captured): Promise<WriteOutcome> {
    const { tx } = context;
    const { candidate, view, evaluation } = captured;
    const caseRow = await lockCase(tx, candidate.caseId);
    assertCaseWritable(caseRow, 'validateCandidate');
    await this.observer.afterCaseLock(candidate.caseId);
    const stored = await tx.noticeCandidate.findUniqueOrThrow({
      where: { id: candidate.id },
      select: { artifactSha256: true },
    });
    if (stored.artifactSha256 !== candidate.artifactSha256) {
      throw apiErrors.artifactChanged('expectedArtifactSha256');
    }
    const rebuilt = assembleContext(await currentRows(tx, captured.scope), captured.scope).view;
    if (rebuilt.dependencyDigest !== view.dependencyDigest) {
      throw apiErrors.validationContextChanged('expectedDependencyDigest');
    }
    const planSources = await readPlanSources(tx, candidate.preparedDocuments, caseRow);
    if (planSourcesFingerprint(planSources) !== captured.planFingerprint) {
      throw apiErrors.validationContextChanged('preparedDocuments');
    }
    await this.observer.beforeInsert(candidate.caseId);
    const runId = randomUUID();
    const run = await tx.validationRun.create({
      data: {
        id: runId,
        candidateId: candidate.id,
        caseId: candidate.caseId,
        artifactSha256: candidate.artifactSha256,
        dependencyDigest: view.dependencyDigest,
        dependencyManifest: json(view.dependencies),
        evaluatedContextJson: json(view.context),
        rulesetVersion: evaluation.rulesetVersion,
        result: evaluation.result,
        coverageManifest: json(evaluation.coverageManifest),
        blockerCount: evaluation.counts.blocker,
        reviewRequiredCount: evaluation.counts.reviewRequired,
        warningCount: evaluation.counts.warning,
        startedAt: captured.startedAt,
        completedAt: captured.completedAt,
        createdAt: context.now,
        createdById: context.actorUserId,
      },
    });
    // One instant for every issue: descending ids make the standard (createdAt DESC, id DESC)
    // order of the list the order the ruleset reported them in.
    const issueIds = evaluation.findings
      .map(() => randomUUID())
      .sort()
      .reverse();
    if (evaluation.findings.length > 0) {
      await tx.validationIssue.createMany({
        data: evaluation.findings.map((item, index) => ({
          id: issueIds[index] as string,
          runId,
          ruleId: item.ruleId,
          checkKind: item.checkKind,
          severity: item.severity,
          fieldPath: item.fieldPath,
          message: item.message,
          details: item.details === null ? Prisma.DbNull : json(item.details),
          createdAt: context.now,
          createdById: context.actorUserId,
        })),
      });
    }
    const coverage = evaluation.coverageManifest;
    await context.audit({
      action: 'VALIDATION_RUN_RECORDED',
      entityType: ENTITY,
      entityId: runId,
      after: {
        candidateId: candidate.id,
        caseId: candidate.caseId,
        promptSnapshotId: captured.promptSnapshotId,
        taskType: candidate.taskType,
        generationMode: captured.generationMode,
        artifactSha256: candidate.artifactSha256,
        dependencyDigest: view.dependencyDigest,
        rulesetVersion: evaluation.rulesetVersion,
        result: evaluation.result,
        issues: {
          total: evaluation.findings.length,
          blocker: evaluation.counts.blocker,
          reviewRequired: evaluation.counts.reviewRequired,
          warning: evaluation.counts.warning,
          info: evaluation.counts.info,
        },
        rules: {
          required: coverage.requiredRuleIds.length,
          executed: coverage.executedRuleIds.length,
          notExecuted: coverage.notExecutedRuleIds.length,
          notExecutedRuleIds: [...coverage.notExecutedRuleIds],
        },
        semanticReviewRequired: true,
        dependencies: view.dependencies.length,
        startedAt: captured.startedAt.toISOString(),
        completedAt: captured.completedAt.toISOString(),
        durationMs: captured.completedAt.getTime() - captured.startedAt.getTime(),
      },
    });
    return created(ENTITY, toValidationRunView(run));
  }

  /** This candidate's runs (404 for an unknown candidate), newest first, as summaries. */
  async listRuns(
    candidateId: string,
    query: QueryValues,
  ): Promise<{ items: ValidationRunSummary[]; nextCursor: string | null }> {
    const owner = await this.prisma.noticeCandidate.findUnique({
      where: { id: candidateId },
      select: { id: true },
    });
    if (!owner) throw apiErrors.notFound();
    const q = searchText(query);
    const page = pageRequest(contractOperation('listValidationRuns'), query, this.cursors, {
      candidateId,
      q,
    });
    const match =
      q === null
        ? Prisma.empty
        : Prisma.sql`AND (r.id = ${q} OR r.dependency_digest = ${q} OR r.result = ${q})`;
    const ids = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT r.id FROM validation_runs r WHERE r.candidate_id = ${candidateId} ${match}
        ${keysetAfter(page.after, 'r')}
        ORDER BY r.created_at DESC, r.id DESC ${pageLimit(page)}`,
    );
    const rows = await this.prisma.validationRun.findMany({
      where: { id: { in: ids.map((row) => row.id) } },
      select: RUN_SUMMARY_COLUMNS,
    });
    return toPage(inIdOrder(ids, rows), page, this.cursors, toValidationRunSummary);
  }

  /** One run's issues (404 for an unknown run), in the order the ruleset reported them. */
  async listIssues(
    runId: string,
    query: QueryValues,
  ): Promise<{ items: ValidationIssueView[]; nextCursor: string | null }> {
    const owner = await this.prisma.validationRun.findUnique({
      where: { id: runId },
      select: { id: true },
    });
    if (!owner) throw apiErrors.notFound();
    const q = searchText(query);
    const page = pageRequest(contractOperation('listValidationIssues'), query, this.cursors, {
      runId,
      q,
    });
    const match =
      q === null
        ? Prisma.empty
        : Prisma.sql`AND (i.id = ${q} OR i.rule_id = ${q} OR i.severity = ${q} OR i.check_kind = ${q})`;
    const ids = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT i.id FROM validation_issues i WHERE i.run_id = ${runId} ${match}
        ${keysetAfter(page.after, 'i')}
        ORDER BY i.created_at DESC, i.id DESC ${pageLimit(page)}`,
    );
    const rows = await this.prisma.validationIssue.findMany({
      where: { id: { in: ids.map((row) => row.id) } },
    });
    return toPage(inIdOrder(ids, rows), page, this.cursors, toValidationIssueView);
  }

  private async storedRun(id: string): Promise<ValidationRunView | null> {
    const row = await this.prisma.validationRun.findUnique({ where: { id } });
    return row === null ? null : toValidationRunView(row);
  }
}
