// The records one readiness evaluation reads (P4I; ADR-0011), in the caller's transaction — one
// REPEATABLE READ snapshot for getCandidateReadiness and an export replay, the SERIALIZABLE export
// transaction otherwise:
//   the candidate's prompt snapshot and its scope (validation-scope.ts: exactly the task, mode,
//   selection, parent and priors the prompt named) → the CURRENT production context of exactly that
//   scope with the P4D reader and assembly (no second context engine; nothing latest, default or
//   replacing is chosen; a binding the prompt named that has been corrected since → the reader's
//   409 BINDING_ALREADY_SUPERSEDED, which the caller maps) → every validation run of the candidate
//   and the issues of the runs of the current epoch → every assessment of the candidate → the stored
//   supports of the heads that may count, with their CaseSource as it is now → whether each source a
//   countable G6 head's ask dispositions cite exists and applies to the case now (source-scope.ts;
//   those sources may lie outside the context, so the digest does not bind them).
// Plain reads only: nothing is locked here, written, audited, re-pointed or remembered.
import type { NoticeCandidate, Prisma } from '../../../generated/prisma/client.js';
import { apiErrors } from '../../infrastructure/http/api-error.js';
import { caseTarget } from '../cases/case-rules.js';
import { assembleContext, exceededLimit } from '../production/context-assembly.js';
import { NO_CONTEXT_READ_OBSERVER } from '../production/context-read-observer.js';
import { readContextRows, type ContextRows } from '../production/context-snapshot.js';
import { dateOnly } from '../representation/authority-views.js';
import { applicabilityProblem } from '../sources/source-scope.js';
import { REQUIRED_RULES, TECHNICAL_RULESET_VERSION } from '../validation/technical-ruleset.js';
import { validationScope } from '../validation/validation-scope.js';
import {
  askSourceIds,
  countableHeads,
  epochRuns,
  readinessEpoch,
  type CurrentRuleset,
  type IssueRecord,
  type ReadinessContext,
  type ReadinessInput,
  type SupportRecord,
} from './readiness-rules.js';

type Tx = Prisma.TransactionClient;

/** The ruleset the server runs now (never one a caller chooses). */
export const CURRENT_RULESET: CurrentRuleset = {
  version: TECHNICAL_RULESET_VERSION,
  requiredRuleIds: REQUIRED_RULES.map((rule) => rule.id),
};

const RUN_COLUMNS = {
  id: true,
  candidateId: true,
  artifactSha256: true,
  dependencyDigest: true,
  rulesetVersion: true,
  result: true,
  coverageManifest: true,
  createdAt: true,
} as const;

const ASSESSMENT_COLUMNS = {
  id: true,
  caseId: true,
  candidateId: true,
  gate: true,
  supersedesAssessmentId: true,
  artifactSha256: true,
  dependencyDigest: true,
  rulesetVersion: true,
  result: true,
  scopeState: true,
  performerLabel: true,
  rationale: true,
  scopeText: true,
  provenance: true,
  assessedAt: true,
  askDispositions: true,
} as const;

/** What the current context says readiness needs (ContextRows and the assembled view). */
function readinessContext(rows: ContextRows, scope: ReturnType<typeof validationScope>) {
  const { view, blocking } = assembleContext(rows, scope);
  const context: ReadinessContext = {
    caseArchived: rows.caseRow.archivedAt !== null,
    taskType: scope.taskType,
    generationMode: scope.generationMode,
    parentBindingId: scope.parentBindingId,
    dependencyDigest: view.dependencyDigest,
    blockingMissing: blocking,
    missingCount: view.context.missing.length,
    conflictCount: view.context.conflicts.length,
    tooLarge: exceededLimit(view) !== null,
    listedSourceApplies: new Map(
      [...rows.sourceApplicability].map(([id, problem]) => [id, problem === null] as const),
    ),
    authority: {
      versions: rows.versions.map((row) => ({
        effectiveOn: dateOnly(row.effectiveOn),
        expiresOn: dateOnly(row.expiresOn),
      })),
      coverages: rows.coverages.map((row) => ({
        effectiveOn: dateOnly(row.effectiveOn),
        expiresOn: dateOnly(row.expiresOn),
      })),
      coverageSigners: rows.coverageSigners.map((row) => ({
        effectiveOn: dateOnly(row.effectiveOn),
        endsOn: dateOnly(row.endsOn),
      })),
      events: rows.events.map((row) => ({
        id: row.id,
        supersedesEventId: row.supersedesEventId,
        effectiveAt: row.effectiveAt,
        effectiveOn: dateOnly(row.effectiveOn),
      })),
    },
  };
  return context;
}

/**
 * Whether each source a countable G6 head's ask dispositions cite exists and applies to the case
 * now: as the context evaluated it when the context lists it, otherwise evaluated here with the
 * same rule (applicabilityProblem, target Case; plain reads).
 */
async function askSourceApplicability(
  tx: Tx,
  rows: ContextRows,
  ids: readonly string[],
): Promise<Map<string, boolean>> {
  const applies = new Map<string, boolean>();
  const outside: string[] = [];
  for (const id of ids) {
    const listed = rows.sourceApplicability.get(id);
    if (listed === undefined) outside.push(id);
    else applies.set(id, listed === null);
  }
  if (outside.length === 0) return applies;
  const sources = await tx.sourceReference.findMany({
    where: { id: { in: outside } },
    select: { id: true, agencyId: true, scopeBindings: true },
  });
  const target = await caseTarget(tx, rows.caseRow);
  for (const id of outside) {
    const source = sources.find((row) => row.id === id);
    applies.set(
      id,
      source !== undefined && (await applicabilityProblem(tx, source, target)) === null,
    );
  }
  return applies;
}

/** Everything evaluateReadiness needs for `candidate`, read in the caller's transaction. */
export async function readReadinessInput(
  tx: Tx,
  candidate: NoticeCandidate,
): Promise<ReadinessInput> {
  const prompt = await tx.promptSnapshot.findUniqueOrThrow({
    where: { id: candidate.promptSnapshotId },
  });
  const scope = validationScope(prompt);
  const rows = await readContextRows(tx, scope, NO_CONTEXT_READ_OBSERVER);
  if (rows.caseRow.id !== candidate.caseId) throw apiErrors.internal();
  const context = readinessContext(rows, scope);
  const epoch = readinessEpoch(candidate, context, CURRENT_RULESET);

  const runs = await tx.validationRun.findMany({
    where: { candidateId: candidate.id },
    select: RUN_COLUMNS,
  });
  const currentRunIds = epochRuns(runs, epoch).map((run) => run.id);
  const issues = new Map<string, IssueRecord[]>(currentRunIds.map((id) => [id, []]));
  if (currentRunIds.length > 0) {
    const rowsOfIssues = await tx.validationIssue.findMany({
      where: { runId: { in: currentRunIds } },
      select: { runId: true, ruleId: true, checkKind: true, severity: true, fieldPath: true },
    });
    for (const { runId, ...issue } of rowsOfIssues) issues.get(runId)?.push(issue);
  }

  const assessments = await tx.candidateAssessment.findMany({
    where: { candidateId: candidate.id },
    select: ASSESSMENT_COLUMNS,
  });
  const heads = countableHeads(assessments, epoch);
  const supports = new Map<string, SupportRecord[]>(heads.map((head) => [head.id, []]));
  if (heads.length > 0) {
    const supportRows = await tx.assessmentSource.findMany({
      where: { assessmentId: { in: heads.map((head) => head.id) } },
      select: {
        assessmentId: true,
        caseSourceId: true,
        caseSource: { select: { caseId: true, linkState: true, sourceId: true } },
      },
    });
    for (const row of supportRows) {
      supports.get(row.assessmentId)?.push({
        caseSourceId: row.caseSourceId,
        caseId: row.caseSource.caseId,
        linkState: row.caseSource.linkState,
        sourceId: row.caseSource.sourceId,
      });
    }
  }
  const g6 = heads.find((head) => head.gate === 'G6');
  const askSourceApplies =
    g6 === undefined
      ? new Map<string, boolean>()
      : await askSourceApplicability(tx, rows, askSourceIds(g6));

  return {
    candidate: {
      id: candidate.id,
      subject: candidate.subject,
      bodyText: candidate.bodyText,
      bodySha256: candidate.bodySha256,
      artifactSha256: candidate.artifactSha256,
      envelope: candidate.envelopeJson,
      preparedDocuments: candidate.preparedDocuments,
      signatureState: candidate.signatureState,
      superseded: candidate.supersededAt !== null,
    },
    caseId: candidate.caseId,
    context,
    ruleset: CURRENT_RULESET,
    runs,
    issues,
    assessments,
    supports,
    askSourceApplies,
  };
}
