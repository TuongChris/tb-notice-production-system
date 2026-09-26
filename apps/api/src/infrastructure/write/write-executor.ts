// The shared write path of contracted business mutations (INVARIANTS §5 "Mutable row update").
//
//   request body already parsed with the contract schema by the caller (422 before anything else)
//   → Idempotency-Key present and well formed (400), If-Match present when the operation declares an
//     `x-precondition-target` (428)
//   → idempotency claim or replay (409 IDEMPOTENCY_CONFLICT / IDEMPOTENCY_IN_PROGRESS)
//   → one READ COMMITTED transaction: the caller's `work` locks its rows in a fixed order, checks the
//     If-Match of the contract's precondition target (412), applies business rules and the change,
//     and appends the audit event; the executor then completes the idempotency record in the same
//     transaction
//   → deadlock / lock-wait failures retried (same key, same claim), at most 3 attempts, then 409
//     RETRYABLE_TRANSACTION_CONFLICT
//   → any failure releases the claim, so no failed request is ever stored as a replayable success.
// Method, normalized path and precondition target come from the contract operation metadata, never
// from the caller. Nothing outside the database happens inside the transaction. Success is only
// reported after commit; a response lost after commit is recovered by replaying the same key.
//
// Options (per operation, never per request): a stricter isolation level (generatePrompt runs
// SERIALIZABLE, INVARIANTS §5 "Prompt generation"), and for a write that creates one immutable
// record, `replayRecord`: the idempotency record then keeps the response status, meta and the
// record's type and id — not a second copy of its data — and a replay reads that immutable record
// back, so it returns exactly what the original response returned.
import { setTimeout as delay } from 'node:timers/promises';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AffectedResource } from '@tb/contracts';
import { Prisma } from '../../../generated/prisma/client.js';
import type { AuditEntry } from '../audit/audit-log.js';
import { PrismaService } from '../database/prisma.service.js';
import { apiErrors } from '../http/api-error.js';
import { CLOCK, type Clock } from '../time/clock.js';
import { AuditWriter } from './audit-writer.js';
import { isRetryableTransactionError, MAX_TRANSACTION_ATTEMPTS } from './database-errors.js';
import { assertIfMatch, entityEtag, requireIfMatch } from './etag.js';
import { IdempotencyStore, parseIdempotencyKey, type Claim } from './idempotency.js';
import { contractPath, requestDigest } from './request-digest.js';
import { contractOperation } from './request-parsing.js';

/** Interactive transaction bounds (Prisma defaults, stated explicitly). */
const TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  maxWait: 2000,
  timeout: 5000,
} as const;

export interface WriteOptions {
  /** The transaction's isolation level (READ COMMITTED unless the operation's recipe says otherwise). */
  readonly isolationLevel?: Prisma.TransactionIsolationLevel;
  /**
   * For a write whose response `data` is one immutable record it created: reads that record back
   * by id (null when it does not exist). The idempotency record then stores no copy of the data,
   * and a replay returns the record as stored.
   */
  readonly replayRecord?: (id: string) => Promise<WireEntity | null>;
}

/** Who sent the write and the conditional headers they sent (from the authenticated request). */
export interface WriteRequester {
  readonly actorUserId: string;
  readonly requestId: string;
  readonly idempotencyKey: string | undefined;
  readonly ifMatch: string | undefined;
}

export interface WriteCommand {
  readonly operationId: string;
  readonly pathParams: Readonly<Record<string, string>>;
  /** The contract-validated request body, or null when the operation has none. */
  readonly body: unknown;
  readonly requester: WriteRequester;
}

export type AuditRecord = Omit<AuditEntry, 'requestId' | 'actorUserId'>;

export interface VersionedTarget {
  readonly entityType: string;
  readonly id: string;
  readonly rowVersion: number;
}

export interface WriteContext {
  readonly tx: Prisma.TransactionClient;
  /** One instant for every timestamp written by this request. */
  readonly now: Date;
  readonly actorUserId: string;
  /**
   * Checks If-Match against the current version of the operation's contract precondition target
   * (412 RECORD_VERSION_CONFLICT). Call it after locking that row.
   */
  checkPrecondition(target: VersionedTarget): void;
  /** Appends the audit event of this change inside the same transaction. */
  audit(entry: AuditRecord): Promise<void>;
}

/**
 * The wire entity returned by a mutation. Mutable records carry `rowVersion` (and the response
 * carries their strong ETag); immutable records such as a SourceReference revision have none.
 */
export interface WireEntity {
  readonly id: string;
  readonly rowVersion?: number;
}

export interface WriteOutcome {
  readonly status: 200 | 201 | 204;
  /** The resource the response describes (and whose ETag it carries). */
  readonly resource: { readonly type: string; readonly id: string };
  /** Response `data`; absent for 204. */
  readonly data?: WireEntity;
  readonly affected: readonly AffectedResource[];
}

export interface ResponseBody {
  readonly data: unknown;
  readonly meta: { readonly requestId: string; readonly affectedResources: AffectedResource[] };
}

export interface WriteReply {
  readonly status: number;
  readonly body?: ResponseBody;
  readonly etag?: string;
  readonly replayed: boolean;
}

@Injectable()
export class WriteExecutor {
  private readonly logger = new Logger('WriteExecutor');
  private readonly idempotency: IdempotencyStore;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly auditWriter: AuditWriter,
  ) {
    this.idempotency = new IdempotencyStore(prisma);
  }

  async execute(
    command: WriteCommand,
    work: (context: WriteContext) => Promise<WriteOutcome>,
    options: WriteOptions = {},
  ): Promise<WriteReply> {
    const operation = contractOperation(command.operationId);
    if (!operation.idempotentWrite) {
      throw new Error(`${operation.operationId} is not an idempotent write in the contract`);
    }
    const { requester } = command;
    const key = parseIdempotencyKey(requester.idempotencyKey);
    const target = operation.preconditionTarget;
    const ifMatch = target === null ? null : requireIfMatch(requester.ifMatch);
    const digest = requestDigest({
      operationId: operation.operationId,
      method: operation.method,
      path: contractPath(operation.path, command.pathParams),
      body: command.body ?? null,
    });
    const now = this.clock.now();
    const claim = await this.idempotency.claim(
      { actorUserId: requester.actorUserId, operationId: operation.operationId, key },
      digest,
      now,
    );
    if (claim.kind === 'replay') {
      return options.replayRecord === undefined
        ? replay(claim, requester.requestId)
        : replayStoredRecord(claim, requester.requestId, options.replayRecord);
    }
    const transactionOptions = {
      ...TRANSACTION_OPTIONS,
      isolationLevel: options.isolationLevel ?? TRANSACTION_OPTIONS.isolationLevel,
    };

    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          let preconditionChecked = false;
          const outcome = await work({
            tx,
            now,
            actorUserId: requester.actorUserId,
            checkPrecondition: (current) => {
              if (target === null || ifMatch === null || current.entityType !== target) {
                throw new Error(
                  `${operation.operationId}: precondition target is ${target ?? 'none'}, not ${current.entityType}`,
                );
              }
              assertIfMatch(ifMatch, current);
              preconditionChecked = true;
            },
            audit: (entry) =>
              this.auditWriter.append(tx, {
                ...entry,
                requestId: requester.requestId,
                actorUserId: requester.actorUserId,
              }),
          });
          if (target !== null && !preconditionChecked) {
            throw new Error(`${operation.operationId}: the If-Match precondition was not checked`);
          }
          const body: ResponseBody | undefined =
            outcome.data === undefined
              ? undefined
              : {
                  data: outcome.data,
                  meta: {
                    requestId: requester.requestId,
                    affectedResources: [...outcome.affected],
                  },
                };
          await this.idempotency.complete(tx, claim.recordId, {
            status: outcome.status,
            body:
              body === undefined
                ? null
                : toJsonObject(options.replayRecord === undefined ? body : { meta: body.meta }),
            resourceType: outcome.resource.type,
            resourceId: outcome.resource.id,
          });
          return {
            status: outcome.status,
            ...(body === undefined ? {} : { body }),
            ...(outcome.data?.rowVersion === undefined
              ? {}
              : {
                  etag: entityEtag(
                    outcome.resource.type,
                    outcome.resource.id,
                    outcome.data.rowVersion,
                  ),
                }),
            replayed: false,
          };
        }, transactionOptions);
      } catch (error) {
        const retryable = isRetryableTransactionError(error);
        if (retryable && attempt < MAX_TRANSACTION_ATTEMPTS) {
          await delay(attempt * 25);
          continue;
        }
        await this.release(claim);
        if (retryable) throw apiErrors.retryableTransactionConflict();
        throw error;
      }
    }
  }

  private async release(claim: Claim): Promise<void> {
    if (claim.kind !== 'claimed') return;
    try {
      await this.idempotency.release(claim.recordId);
    } catch (error) {
      // The claim then expires as abandoned after the lease; never report it as success.
      this.logger.warn(
        `Could not release an idempotency claim (${error instanceof Error ? error.name : 'Error'}).`,
      );
    }
  }
}

/** Rebuilds the stored response of an accepted request for a replay with the same key. */
function replay(claim: Extract<Claim, { kind: 'replay' }>, requestId: string): WriteReply {
  if (claim.body === null || typeof claim.body !== 'object' || Array.isArray(claim.body)) {
    return { status: claim.status, replayed: true };
  }
  const stored = claim.body as { data?: unknown; meta?: { affectedResources?: unknown } };
  const affectedResources = Array.isArray(stored.meta?.affectedResources)
    ? (stored.meta.affectedResources as AffectedResource[])
    : [];
  const body: ResponseBody = { data: stored.data, meta: { requestId, affectedResources } };
  const rowVersion = (stored.data as { rowVersion?: unknown } | undefined)?.rowVersion;
  return {
    status: claim.status,
    body,
    ...(claim.resourceType !== null && claim.resourceId !== null && typeof rowVersion === 'number'
      ? { etag: entityEtag(claim.resourceType, claim.resourceId, rowVersion) }
      : {}),
    replayed: true,
  };
}

/**
 * The replay of a write whose record is immutable: its stored status and meta, and the record read
 * back by the id the idempotency record names (never a stored copy, never regenerated).
 */
async function replayStoredRecord(
  claim: Extract<Claim, { kind: 'replay' }>,
  requestId: string,
  read: (id: string) => Promise<WireEntity | null>,
): Promise<WriteReply> {
  const data = claim.resourceId === null ? null : await read(claim.resourceId);
  if (data === null) throw new Error('the record of a completed idempotent write is missing');
  const stored = claim.body as { meta?: { affectedResources?: unknown } } | null;
  const affectedResources = Array.isArray(stored?.meta?.affectedResources)
    ? (stored.meta.affectedResources as AffectedResource[])
    : [];
  return {
    status: claim.status,
    body: { data, meta: { requestId, affectedResources } },
    replayed: true,
  };
}

function toJsonObject(body: object): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(body)) as Prisma.InputJsonObject;
}
