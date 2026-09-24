// Idempotency-Key handling on the existing IdempotencyRecord model (API_CONTRACT_v1 §7,
// INVARIANTS §5, DATABASE_SCHEMA_v1 IdempotencyRecord).
//
// Scope: authenticated actor + operationId + key (the table's unique key). The stored request
// digest covers operationId, method, normalized path and canonical body (request-digest.ts).
//
//   claim     — before the business transaction, INSERT an IN_PROGRESS row (its own statement). A
//               concurrent duplicate hits the unique key: same digest + IN_PROGRESS → 409
//               IDEMPOTENCY_IN_PROGRESS; other digest → 409 IDEMPOTENCY_CONFLICT; COMPLETED →
//               replay. Expired rows (7-day horizon) and abandoned claims (older than the lease) are
//               removed and the key is claimed afresh.
//   complete  — INSIDE the business transaction, IN_PROGRESS → COMPLETED with the response, so the
//               business write, its audit event and the idempotency state commit or roll back
//               together.
//   release   — after a failed transaction the IN_PROGRESS claim is deleted: a failed request never
//               becomes a completed replay record.
import { Prisma, type PrismaClient } from '../../../generated/prisma/client.js';
import { apiErrors } from '../http/api-error.js';
import { isUniqueViolation } from './database-errors.js';

/** Replay horizon: 7 days (API_CONTRACT_v1 §7; an operational choice, not a legal deadline). */
export const IDEMPOTENCY_REPLAY_HORIZON_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * An IN_PROGRESS claim older than this is treated as abandoned (for example the process died between
 * claim and commit). A live claim cannot be that old: a request's transaction attempts are bounded
 * by the 2 s acquire wait, 5 s run time and 3 attempts.
 */
export const IDEMPOTENCY_IN_PROGRESS_LEASE_MS = 60 * 1000;
/** Retry-After (seconds) sent with 409 IDEMPOTENCY_IN_PROGRESS. */
export const IDEMPOTENCY_RETRY_AFTER_SECONDS = 1;

/** Contract `IdempotencyKey` header parameter: 16–100 characters of [A-Za-z0-9_-]. */
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{16,100}$/;

export function parseIdempotencyKey(raw: string | undefined): string {
  if (raw === undefined || raw === '') throw apiErrors.idempotencyKeyRequired();
  if (!IDEMPOTENCY_KEY.test(raw)) throw apiErrors.idempotencyKeyInvalid();
  return raw;
}

export interface IdempotencyScope {
  readonly actorUserId: string;
  readonly operationId: string;
  readonly key: string;
}

export interface StoredResponse {
  readonly status: number;
  /** Full response body `{ data, meta }`; null for 204. */
  readonly body: Prisma.InputJsonObject | null;
  readonly resourceType: string;
  readonly resourceId: string;
}

export type Claim =
  | { readonly kind: 'claimed'; readonly recordId: string }
  | {
      readonly kind: 'replay';
      readonly status: number;
      readonly body: Prisma.JsonValue | null;
      readonly resourceType: string | null;
      readonly resourceId: string | null;
    };

/** Bounded number of claim rounds (a round is only repeated after removing a stale row). */
const MAX_CLAIM_ROUNDS = 3;

export class IdempotencyStore {
  constructor(private readonly prisma: PrismaClient) {}

  async claim(scope: IdempotencyScope, digest: string, now: Date): Promise<Claim> {
    for (let round = 0; round < MAX_CLAIM_ROUNDS; round += 1) {
      try {
        const created = await this.prisma.idempotencyRecord.create({
          data: {
            actorUserId: scope.actorUserId,
            operationId: scope.operationId,
            idempotencyKey: scope.key,
            requestSha256: digest,
            state: 'IN_PROGRESS',
            expiresAt: new Date(now.getTime() + IDEMPOTENCY_REPLAY_HORIZON_MS),
            createdAt: now,
          },
          select: { id: true },
        });
        return { kind: 'claimed', recordId: created.id };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
      const existing = await this.prisma.idempotencyRecord.findUnique({
        where: {
          actorUserId_operationId_idempotencyKey: {
            actorUserId: scope.actorUserId,
            operationId: scope.operationId,
            idempotencyKey: scope.key,
          },
        },
      });
      if (existing === null) continue; // removed concurrently: claim again
      if (existing.expiresAt.getTime() <= now.getTime()) {
        // Past the replay horizon the key starts a new intent.
        await this.prisma.idempotencyRecord.deleteMany({
          where: { id: existing.id, expiresAt: { lte: now } },
        });
        continue;
      }
      if (existing.requestSha256 !== digest) throw apiErrors.idempotencyConflict();
      if (existing.state === 'IN_PROGRESS') {
        if (existing.createdAt.getTime() + IDEMPOTENCY_IN_PROGRESS_LEASE_MS <= now.getTime()) {
          await this.prisma.idempotencyRecord.deleteMany({
            where: { id: existing.id, state: 'IN_PROGRESS', createdAt: existing.createdAt },
          });
          continue;
        }
        throw apiErrors.idempotencyInProgress(IDEMPOTENCY_RETRY_AFTER_SECONDS);
      }
      if (existing.responseStatus === null) {
        throw new Error('completed idempotency record without a response status');
      }
      return {
        kind: 'replay',
        status: existing.responseStatus,
        body: existing.responseJson,
        resourceType: existing.resourceType,
        resourceId: existing.resourceId,
      };
    }
    throw apiErrors.idempotencyInProgress(IDEMPOTENCY_RETRY_AFTER_SECONDS);
  }

  /** Marks the claim COMPLETED inside the business transaction. */
  async complete(
    tx: Prisma.TransactionClient,
    recordId: string,
    response: StoredResponse,
  ): Promise<void> {
    const { count } = await tx.idempotencyRecord.updateMany({
      where: { id: recordId, state: 'IN_PROGRESS' },
      data: {
        state: 'COMPLETED',
        responseStatus: response.status,
        responseJson: response.body ?? Prisma.DbNull,
        resourceType: response.resourceType,
        resourceId: response.resourceId,
      },
    });
    // The claim vanished (taken over as abandoned): abort so the business write rolls back.
    if (count !== 1) throw apiErrors.idempotencyInProgress(IDEMPOTENCY_RETRY_AFTER_SECONDS);
  }

  /** Deletes an unfinished claim after a failed transaction. */
  async release(recordId: string): Promise<void> {
    await this.prisma.idempotencyRecord.deleteMany({
      where: { id: recordId, state: 'IN_PROGRESS' },
    });
  }
}
