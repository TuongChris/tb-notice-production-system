// Readiness and the unsigned export (P4I) — the contracted operations getCandidateReadiness and
// exportUnsignedCandidate of TB-SCHEMA-API-v1.0.0, unchanged in the active TB-SCHEMA-API-v1.4.0 (no
// wire release). ADR-0011 was accepted by the operator with the independent review deferred
// (mission TB_P4I_READINESS_AND_UNSIGNED_EXPORT_FAST_TRACK).
//
// READY_FOR_SIGNER is a derived, currently evaluated, pre-signature state — "ready for authorized
// human signer review" — never stored, never a legal approval, G7, a signature, an adoption or
// permission to send. The candidate stays unsigned and unsent; an authorized human reviews, adopts,
// signs and sends outside the application.
//
//   readiness  GET /candidates/{candidateId}/readiness — one REPEATABLE READ snapshot (plain reads):
//              the candidate (404), the readiness reader (readiness-inputs.ts; a binding its prompt
//              named that has been corrected since → 409 BINDING_ALREADY_SUPERSEDED, no readiness)
//              and the pure rules (readiness-rules.ts) at the current instant. Writes nothing: no
//              audit event, idempotency record, row version, context revision or other change.
//   export     POST /candidates/{candidateId}/unsigned-exports. Idempotency-Key; no If-Match (the
//              expected artifact, digest and run in the body are the precondition). One short
//              SERIALIZABLE transaction through the WriteExecutor (bounded retries, at most 3):
//                the candidate (404) → its CaseRecord locked FOR UPDATE → the candidate share-locked
//                and re-read → the same reader and rules at the current instant (a corrected named
//                binding → 412 CONTEXT_CHANGED) → the caller's artifact (412 ARTIFACT_CHANGED) and
//                digest (412 CONTEXT_CHANGED) → READY_FOR_SIGNER (409 CANDIDATE_NOT_READY with the
//                status and reason codes) → the counted run (412 VALIDATION_RUN_CHANGED) → one
//                redacted audit event EXPORT_UNSIGNED → the response: the stored subject, envelope
//                and body exactly, HUMAN_PENDING, sendPerformed false, the readiness evaluated and
//                the instant.
//              The case row is locked, never changed; no export table, row or copy exists. A replay
//              of the same key re-evaluates the current readiness in a consistent snapshot, at an
//              instant sampled after that snapshot's reads (R14-AUD-020: never the request's
//              instant from before the claim and the replay lookup), and applies the same refusals
//              to the original request; only while it is still READY_FOR_SIGNER with the same
//              artifact, digest and run does it return the historical response, rebuilt from the
//              immutable candidate with the kept readiness and instant (the idempotency record
//              keeps no subject, envelope or body). Otherwise it returns the present refusal and
//              releases nothing; a replay writes nothing.
// Nothing is signed, adopted, sent, submitted, fetched or contacted: no AI provider, network, mail,
// platform or Drive access exists here. Lock order: CaseRecord → NoticeCandidate.
import { Inject, Injectable } from '@nestjs/common';
import type { ExportUnsigned, Readiness, UnsignedExport } from '@tb/contracts';
import { Prisma, type NoticeCandidate } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { ApiError, apiErrors } from '../../infrastructure/http/api-error.js';
import { CLOCK, type Clock } from '../../infrastructure/time/clock.js';
import {
  WriteExecutor,
  type WriteContext,
  type WriteOutcome,
  type WriteReply,
  type WriteRequester,
} from '../../infrastructure/write/write-executor.js';
import { textLength } from '../assessments/assessment-rules.js';
import { lockCase } from '../cases/case-rules.js';
import { readReadinessInput } from './readiness-inputs.js';
import { READINESS_OBSERVER, type ReadinessObserver } from './readiness-observer.js';
import { evaluateReadiness, exportRefusal } from './readiness-rules.js';
import { keptExport, keptOf, toUnsignedExportView } from './readiness-views.js';

const OPERATION = 'exportUnsignedCandidate';
const ENTITY = 'NoticeCandidate';

/** One consistent snapshot of plain reads (the P4G capture's options). */
const SNAPSHOT_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  maxWait: 2000,
  timeout: 5000,
} as const;

/**
 * The readiness input of `candidate`; a binding its prompt named that has been corrected since
 * leaves no readable scope, and `refusal` says so for the operation.
 */
async function scopedInput(
  tx: Prisma.TransactionClient,
  candidate: NoticeCandidate,
  refusal: (field: string, successorId: string) => ApiError,
) {
  try {
    return await readReadinessInput(tx, candidate);
  } catch (error) {
    if (error instanceof ApiError && error.code === 'BINDING_ALREADY_SUPERSEDED') {
      throw refusal(String(error.details['field']), String(error.details['successorId']));
    }
    throw error;
  }
}

@Injectable()
export class ReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly writes: WriteExecutor,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(READINESS_OBSERVER) private readonly observer: ReadinessObserver,
  ) {}

  /** getCandidateReadiness: derived now from one snapshot; writes nothing. */
  readiness(candidateId: string): Promise<Readiness> {
    return this.prisma.$transaction(async (tx) => {
      const candidate = await tx.noticeCandidate.findUnique({ where: { id: candidateId } });
      if (candidate === null) throw apiErrors.notFound();
      const input = await scopedInput(tx, candidate, apiErrors.readinessScopeUnavailable);
      return evaluateReadiness(input, this.clock.now()).readiness;
    }, SNAPSHOT_OPTIONS);
  }

  /** exportUnsignedCandidate: the unsigned handoff, only while READY_FOR_SIGNER (see above). */
  exportUnsigned(
    requester: WriteRequester,
    candidateId: string,
    body: ExportUnsigned,
  ): Promise<WriteReply> {
    return this.writes.execute(
      { operationId: OPERATION, pathParams: { candidateId }, body, requester },
      (context) => this.record(context, candidateId, body),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        guardedReplay: {
          keep: (data) => keptOf(data as UnsignedExport),
          release: (kept) => this.release(candidateId, body, kept),
        },
      },
    );
  }

  private async record(
    context: WriteContext,
    candidateId: string,
    body: ExportUnsigned,
  ): Promise<WriteOutcome> {
    const { tx } = context;
    const found = await tx.noticeCandidate.findUnique({
      where: { id: candidateId },
      select: { caseId: true },
    });
    if (found === null) throw apiErrors.notFound();
    // An archived case is not refused here: its readiness is BLOCKED (CASE_ARCHIVED), so the export
    // is refused below as not ready, with the reason.
    const caseRow = await lockCase(tx, found.caseId);
    await this.observer.afterCaseLock(caseRow.id);
    // The candidate's content never changes; its supersession is written under the same case lock.
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM notice_candidates WHERE id = ${candidateId} FOR SHARE`,
    );
    const candidate = await tx.noticeCandidate.findUniqueOrThrow({ where: { id: candidateId } });
    if (candidate.caseId !== caseRow.id) throw apiErrors.internal();
    const input = await scopedInput(tx, candidate, () => apiErrors.exportContextChanged());
    const exportedAt = this.clock.now();
    const { readiness } = evaluateReadiness(input, exportedAt);
    const refusal = exportRefusal(readiness, body);
    if (refusal) throw refusal;
    await this.observer.beforeRecord(caseRow.id);
    await context.audit({
      action: 'EXPORT_UNSIGNED',
      entityType: ENTITY,
      entityId: candidate.id,
      after: {
        candidateId: candidate.id,
        caseId: candidate.caseId,
        artifactSha256: candidate.artifactSha256,
        bodySha256: candidate.bodySha256,
        dependencyDigest: readiness.dependencyDigest,
        rulesetVersion: readiness.rulesetVersion,
        validationRunId: readiness.validationRunId,
        readinessStatus: readiness.status,
        gateAssessmentIds: Object.fromEntries(
          readiness.gates.map((gate) => [gate.gate, gate.assessmentId]),
        ),
        format: body.format,
        signatureState: 'HUMAN_PENDING',
        sendPerformed: false,
        externalAction: 'PROHIBITED',
        exportedAt: exportedAt.toISOString(),
        subject: textLength(candidate.subject),
        bodyText: textLength(candidate.bodyText),
      },
    });
    return {
      status: 200,
      resource: { type: ENTITY, id: candidate.id },
      data: toUnsignedExportView(candidate, readiness, exportedAt),
      affected: [],
    };
  }

  /**
   * A replay of a completed export: the current readiness in one snapshot, evaluated at the
   * current instant, the same refusals against the original request, then the historical response
   * rebuilt from the immutable candidate and the kept readiness and instant — or the present
   * refusal, releasing nothing.
   */
  private async release(
    candidateId: string,
    body: ExportUnsigned,
    kept: unknown,
  ): Promise<UnsignedExport> {
    const historical = keptExport(kept);
    await this.observer.beforeReplayRead(candidateId);
    return this.prisma.$transaction(async (tx) => {
      const candidate = await tx.noticeCandidate.findUnique({ where: { id: candidateId } });
      // A candidate is never deleted: a completed export's candidate always exists.
      if (candidate === null) throw apiErrors.internal();
      const input = await scopedInput(tx, candidate, () => apiErrors.exportContextChanged());
      await this.observer.afterReplayInput(candidateId);
      // R14-AUD-020: the evaluation instant is sampled after the reads it judges, right before the
      // evaluation (as GET and a new export do) — never the request's instant, which precedes the
      // claim, the replay lookup and these reads. The current readiness is only the guard: the
      // response below stays the historical one.
      const evaluatedAt = this.clock.now();
      const refusal = exportRefusal(evaluateReadiness(input, evaluatedAt).readiness, body);
      if (refusal) throw refusal;
      const recorded = historical.readiness;
      if (
        recorded.candidateId !== candidate.id ||
        recorded.artifactSha256 !== candidate.artifactSha256 ||
        recorded.status !== 'READY_FOR_SIGNER'
      ) {
        throw apiErrors.internal();
      }
      return toUnsignedExportView(candidate, recorded, new Date(historical.exportedAt));
    }, SNAPSHOT_OPTIONS);
  }
}
