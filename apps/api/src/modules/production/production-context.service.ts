import { Inject, Injectable } from '@nestjs/common';
import type { ContextView } from '@tb/contracts';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { apiErrors } from '../../infrastructure/http/api-error.js';
import type { QueryValues } from '../../infrastructure/write/request-parsing.js';
import { assembleContext, exceededLimit } from './context-assembly.js';
import { CONTEXT_READ_OBSERVER, type ContextReadObserver } from './context-read-observer.js';
import { contextScope } from './context-scope.js';
import { readContextRows } from './context-snapshot.js';

/**
 * One short read-only transaction (INVARIANTS §5): REPEATABLE READ gives every read of the request
 * the snapshot fixed by its first read. Nothing long or external happens inside it.
 */
const SNAPSHOT_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  maxWait: 2000,
  timeout: 5000,
} as const;

/**
 * getProductionContext (TB-SCHEMA-API-v1.2.0, P4D): the current, scoped production context of one
 * case — recorded input a later production step may inspect, assembled from one consistent
 * snapshot. Read-only: no write, audit event, idempotency record, cache or context-revision change.
 * It is not a G1–G7 decision, READY_FOR_SIGNER, legal approval, an ownership, permission or
 * infringement finding, or a current-authority adjudication; nothing is prompted, drafted, signed,
 * sent, fetched or contacted.
 */
@Injectable()
export class ProductionContextService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONTEXT_READ_OBSERVER) private readonly observer: ContextReadObserver,
  ) {}

  /**
   * 404 for an unknown case. Explicit selectors are validated in the snapshot (422/409). A context
   * larger than a contracted bound is refused whole (409 PRODUCTION_CONTEXT_TOO_LARGE), never cut.
   * DRAFTING needs the Production Form Contract's required input: a reply without its named NMI
   * parent is 422 REPLY_PARENT_REQUIRED, any other missing required input 422
   * DRAFTING_INPUT_MISSING — both naming every blocking missing code. PREPARATION returns the
   * context with its gaps listed.
   */
  async get(caseId: string, query: QueryValues): Promise<ContextView> {
    const scope = contextScope(caseId, query);
    const rows = await this.prisma.$transaction(
      (tx) => readContextRows(tx, scope, this.observer),
      SNAPSHOT_OPTIONS,
    );
    const { view, blocking } = assembleContext(rows, scope);
    const exceeded = exceededLimit(view);
    if (exceeded) {
      throw apiErrors.productionContextTooLarge(exceeded.field, exceeded.count, exceeded.maximum);
    }
    if (scope.generationMode === 'DRAFTING' && blocking.length > 0) {
      if (blocking.includes('REPLY_PARENT_NOT_SELECTED')) {
        throw apiErrors.replyParentRequired({
          field: 'parentBindingId',
          reason: 'NOT_SELECTED',
          missing: blocking,
        });
      }
      throw apiErrors.draftingInputMissing(blocking);
    }
    return view;
  }
}
