// PromptSnapshot (P4E) — generatePrompt, listCasePrompts and getPrompt (TB-SCHEMA-API-v1.2.0). A
// prompt snapshot is an immutable record of one prompt rendered from one exact production context:
// input for a later drafting step, never a notice, an approval, a readiness decision, a signature, a
// transmission or a legal conclusion.
//
//   generate  POST /cases/{caseId}/prompts. Idempotency-Key; no If-Match (the contract declares no
//             precondition target: the expected context revision and dependency digest in the body
//             are the precondition). One short SERIALIZABLE transaction (INVARIANTS §5 "Prompt
//             generation"):
//               lock the CaseRecord FOR UPDATE (404; an archived case is read-only, 409)
//               → the expected context revision must be the case's (412 CONTEXT_CHANGED)
//               → rebuild exactly the requested context from current data with the P4D reader and
//                 assembly (its selector refusals, 422/409, apply unchanged)
//               → the expected dependency digest must be the rebuilt one (412 CONTEXT_CHANGED)
//               → the P4D bounds and DRAFTING gate (409 / 422)
//               → the snapshot's manifest bounds (409 PROMPT_TOO_LARGE)
//               → the next version for this case and task, under the case lock
//               → the deterministic renderer, then its size bound (409 PROMPT_TOO_LARGE, never cut)
//               → one PromptSnapshot freezing exactly that context, revision, digest, dependencies,
//                 source manifest, missing items and conflicts, the rendered text and the SHA-256 of
//                 its exact UTF-8 bytes
//               → one redacted audit event (identifiers, versions, digests, counts and lengths — never
//                 the prompt, the context or a captured text) → the idempotency record → commit.
//             The case row is locked, not changed: a prompt is not case context (it would otherwise
//             invalidate the very context it froze), though it makes the case history-bearing. A
//             replay of the same key returns the stored snapshot, even after the case changed; it
//             claims nothing about freshness. Nothing is sent, fetched or called: no AI provider,
//             network, mail or Drive access exists here or anywhere in this module.
//   list      GET /cases/{caseId}/prompts — this case's snapshots (404 for an unknown case), newest
//             first, summaries only; `q` matches exactly a snapshot id, a dependency digest or a
//             prompt SHA-256 — never a search of the prompt text or the context.
//   get       GET /prompts/{id} — one snapshot exactly as stored (404 for an unknown id). Reading it
//             recomputes nothing, and a later context change never edits it.
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  CONTRACT_BASELINE,
  codePointLength,
  type GeneratePrompt,
  type PromptSnapshot as PromptSnapshotView,
  type PromptSnapshotSummary,
} from '@tb/contracts';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { apiErrors } from '../../infrastructure/http/api-error.js';
import { exactTextSha256 } from '../../infrastructure/integrity/tb-canonical-json.js';
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
  type WriteReply,
  type WriteRequester,
} from '../../infrastructure/write/write-executor.js';
import { assertCaseWritable, lockCase } from '../cases/case-rules.js';
import { created } from '../directory/outcomes.js';
import { assembleContext, assertDeliverable } from '../production/context-assembly.js';
import { NO_CONTEXT_READ_OBSERVER } from '../production/context-read-observer.js';
import { readContextRows } from '../production/context-snapshot.js';
import {
  PROMPT_GENERATION_OBSERVER,
  type PromptGenerationObserver,
} from './prompt-generation-observer.js';
import { renderPrompt } from './prompt-renderer.js';
import { promptScope } from './prompt-scope.js';
import {
  assertManifestBounds,
  assertPromptSize,
  promptSourceManifest,
} from './prompt-snapshot-rules.js';
import { PROMPT_TEMPLATE_VERSION } from './prompt-template.js';
import { SUMMARY_COLUMNS, toPromptSnapshotSummary, toPromptSnapshotView } from './prompt-views.js';

const ENTITY = 'PromptSnapshot';

const json = (value: unknown) => value as Prisma.InputJsonValue;

@Injectable()
export class PromptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly writes: WriteExecutor,
    private readonly cursors: CursorCodec,
    @Inject(PROMPT_GENERATION_OBSERVER) private readonly observer: PromptGenerationObserver,
  ) {}

  /** One immutable prompt snapshot from exactly the context the caller reviewed (see above). */
  generate(requester: WriteRequester, caseId: string, body: GeneratePrompt): Promise<WriteReply> {
    const scope = promptScope(caseId, body);
    return this.writes.execute(
      { operationId: 'generatePrompt', pathParams: { caseId }, body, requester },
      async (context) => {
        const { tx } = context;
        const current = await lockCase(tx, caseId);
        assertCaseWritable(current, 'generatePrompt');
        await this.observer.afterCaseLock(caseId);
        if (current.contextRevision !== body.expectedContextRevision) {
          throw apiErrors.contextChanged('expectedContextRevision');
        }
        const rows = await readContextRows(tx, scope, NO_CONTEXT_READ_OBSERVER);
        const { view, blocking } = assembleContext(rows, scope);
        if (view.contextRevision !== body.expectedContextRevision) {
          throw apiErrors.contextChanged('expectedContextRevision');
        }
        if (view.dependencyDigest !== body.expectedDependencyDigest) {
          throw apiErrors.contextChanged('expectedDependencyDigest');
        }
        assertDeliverable(view, scope, blocking);
        const sourceManifest = promptSourceManifest(view.context);
        assertManifestBounds(view, sourceManifest);
        const last = await tx.promptSnapshot.aggregate({
          where: { caseId, taskType: scope.taskType },
          _max: { version: true },
        });
        const version = (last._max.version ?? 0) + 1;
        const renderedPrompt = renderPrompt(view, CONTRACT_BASELINE);
        assertPromptSize(renderedPrompt);
        const promptSha256 = exactTextSha256(renderedPrompt);
        await this.observer.beforeInsert(caseId);
        const row = await tx.promptSnapshot.create({
          data: {
            id: randomUUID(),
            caseId,
            taskType: scope.taskType,
            generationMode: scope.generationMode,
            version,
            authoritySelectionId: scope.authoritySelectionId,
            parentBindingId: scope.parentBindingId,
            contractVersion: CONTRACT_BASELINE,
            templateVersion: PROMPT_TEMPLATE_VERSION,
            contextRevision: view.contextRevision,
            dependencyDigest: view.dependencyDigest,
            dependencyManifest: json(view.dependencies),
            contextJson: json(view.context),
            sourceManifest: json(sourceManifest),
            missingItems: json(view.context.missing),
            conflicts: json(view.context.conflicts),
            renderedPrompt,
            promptSha256,
            createdAt: context.now,
            createdById: context.actorUserId,
          },
        });
        await context.audit({
          action: 'PROMPT_GENERATED',
          entityType: ENTITY,
          entityId: row.id,
          after: {
            caseId,
            taskType: row.taskType,
            generationMode: row.generationMode,
            version: row.version,
            contractVersion: row.contractVersion,
            templateVersion: row.templateVersion,
            contextRevision: row.contextRevision,
            dependencyDigest: row.dependencyDigest,
            promptSha256: row.promptSha256,
            authoritySelectionId: row.authoritySelectionId,
            parentBindingId: row.parentBindingId,
            priorBindingIds: [...scope.priorBindingIds],
            renderedPromptCodePoints: codePointLength(renderedPrompt),
            counts: {
              dependencies: view.dependencies.length,
              sources: sourceManifest.length,
              missingItems: view.context.missing.length,
              conflicts: view.context.conflicts.length,
              reportedItems: view.context.reportedItems.length,
              works: view.context.works.length,
              mappings: view.context.mappings.length,
              facts: view.context.facts.length,
              correspondence: view.context.correspondence.length,
            },
          },
        });
        return created(ENTITY, toPromptSnapshotView(row));
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        replayRecord: (id) => this.stored(id),
      },
    );
  }

  /** This case's snapshots (404 for an unknown case), newest first, as summaries. */
  async list(
    caseId: string,
    query: QueryValues,
  ): Promise<{ items: PromptSnapshotSummary[]; nextCursor: string | null }> {
    const owner = await this.prisma.caseRecord.findUnique({
      where: { id: caseId },
      select: { id: true },
    });
    if (!owner) throw apiErrors.notFound();
    const q = searchText(query);
    const page = pageRequest(contractOperation('listCasePrompts'), query, this.cursors, {
      caseId,
      q,
    });
    const match =
      q === null
        ? Prisma.empty
        : Prisma.sql`AND (p.id = ${q} OR p.dependency_digest = ${q} OR p.prompt_sha256 = ${q})`;
    const ids = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT p.id FROM prompt_snapshots p WHERE p.case_id = ${caseId} ${match}
        ${keysetAfter(page.after, 'p')}
        ORDER BY p.created_at DESC, p.id DESC ${pageLimit(page)}`,
    );
    const rows = await this.prisma.promptSnapshot.findMany({
      where: { id: { in: ids.map((row) => row.id) } },
      select: SUMMARY_COLUMNS,
    });
    return toPage(inIdOrder(ids, rows), page, this.cursors, toPromptSnapshotSummary);
  }

  /** One snapshot exactly as stored (404 for an unknown id). */
  async get(id: string): Promise<PromptSnapshotView> {
    const snapshot = await this.stored(id);
    if (snapshot === null) throw apiErrors.notFound();
    return snapshot;
  }

  private async stored(id: string): Promise<PromptSnapshotView | null> {
    const row = await this.prisma.promptSnapshot.findUnique({ where: { id } });
    return row === null ? null : toPromptSnapshotView(row);
  }
}
