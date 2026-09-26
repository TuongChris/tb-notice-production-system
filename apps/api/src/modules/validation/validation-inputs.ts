// The stored source revisions a candidate's document plan names, as the technical ruleset reads them
// (PLAN.* rules): whether each exists, the SHA-256 recorded on it, the latest revision of its source
// group, and whether it applies to the candidate's case under the current source rules
// (source-scope.ts, target Case — the recorded-scope dimensions and the owner dimension). Plain reads
// in the caller's transaction; nothing is locked, written or re-pointed. A plan may name a source
// outside the production-context closure, so these reads are not covered by the dependency digest:
// their fingerprint is compared again before a run is committed (validation.service.ts).
import type { CaseRecord, Prisma } from '../../../generated/prisma/client.js';
import { tbCanonicalSha256 } from '../../infrastructure/integrity/tb-canonical-json.js';
import { caseTarget } from '../cases/case-rules.js';
import { otherOwnerUsing, scopeProblem } from '../sources/source-scope.js';
import type { PlanSourceRecord } from './technical-ruleset.js';

type Tx = Prisma.TransactionClient;

/** The distinct source ids the stored plan names (entries that are not objects are skipped). */
export function planSourceIds(preparedDocuments: unknown): string[] {
  if (!Array.isArray(preparedDocuments)) return [];
  const ids = preparedDocuments.flatMap((entry) => {
    const sourceId =
      entry !== null && typeof entry === 'object' && !Array.isArray(entry)
        ? (entry as Record<string, unknown>)['sourceId']
        : undefined;
    return typeof sourceId === 'string' ? [sourceId] : [];
  });
  return [...new Set(ids)].sort();
}

export async function readPlanSources(
  tx: Tx,
  preparedDocuments: unknown,
  caseRow: Pick<CaseRecord, 'id' | 'agencyId' | 'routeId'>,
): Promise<Map<string, PlanSourceRecord | null>> {
  const ids = planSourceIds(preparedDocuments);
  const records = new Map<string, PlanSourceRecord | null>();
  if (ids.length === 0) return records;
  const rows = await tx.sourceReference.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      sourceGroupId: true,
      agencyId: true,
      scopeBindings: true,
      contentSha256: true,
    },
  });
  const groups = [...new Set(rows.map((row) => row.sourceGroupId))];
  const revisions =
    groups.length === 0
      ? []
      : await tx.sourceReference.findMany({
          where: { sourceGroupId: { in: groups } },
          select: { id: true, sourceGroupId: true, revision: true },
        });
  const heads = new Map<string, { id: string; revision: number }>();
  for (const revision of revisions) {
    const head = heads.get(revision.sourceGroupId);
    if (!head || revision.revision > head.revision) {
      heads.set(revision.sourceGroupId, { id: revision.id, revision: revision.revision });
    }
  }
  const target = await caseTarget(tx, caseRow);
  const ownerId = target.kind === 'Case' ? (target.route?.ownerId ?? null) : null;
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const id of ids) {
    const row = byId.get(id);
    if (row === undefined) {
      records.set(id, null);
      continue;
    }
    const recorded = scopeProblem(row, target);
    let problem: PlanSourceRecord['scopeProblem'] =
      recorded === null
        ? null
        : 'reason' in recorded
          ? { code: recorded.code, reason: recorded.reason }
          : { code: recorded.code };
    if (problem === null && ownerId !== null) {
      const other = await otherOwnerUsing(tx, id, ownerId);
      if (other !== null) problem = { code: 'CROSS_OWNER_REFERENCE', ownerId: other };
    }
    records.set(id, {
      id,
      contentSha256: row.contentSha256,
      headId: heads.get(row.sourceGroupId)?.id ?? id,
      scopeProblem: problem,
    });
  }
  return records;
}

/** A fingerprint of what the plan rules read: compared again before a run is committed. */
export function planSourcesFingerprint(
  records: ReadonlyMap<string, PlanSourceRecord | null>,
): string {
  return tbCanonicalSha256(
    [...records.keys()].sort().map((id) => {
      const record = records.get(id) ?? null;
      return {
        id,
        record:
          record === null
            ? null
            : {
                contentSha256: record.contentSha256,
                headId: record.headId,
                scopeProblem:
                  record.scopeProblem === null
                    ? null
                    : {
                        code: record.scopeProblem.code,
                        reason: record.scopeProblem.reason ?? null,
                        ownerId: record.scopeProblem.ownerId ?? null,
                      },
              },
      };
    }),
  );
}
