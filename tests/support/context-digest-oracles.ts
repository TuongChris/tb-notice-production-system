// Test-only oracles of the production-context dependency digest (R14-AUD-013, ADR-0007).
//
// The application computes one definition only, the current TB-PRODUCTION-CONTEXT-DIGEST-v2
// (apps/api/src/modules/production/context-dependencies.ts): no parameter, option or fallback there
// computes another. These oracles rebuild a digest from its written-out definition, independently of
// the application: the preimage is assembled here field by field and hashed with the frozen reference
// helper (docs/reference/…/consistency-reference.mjs, `canonicalSha256`), never with the
// application's port of it.
//
// - TB-PRODUCTION-CONTEXT-DIGEST-v1 (historical): the definition accepted with P4D and used by every
//   deployment up to e0a521a — also by the ones whose context semantics R14-AUD-001, -009 and -010
//   changed without changing it (R14-AUD-013). A stored v1 digest is reproduced only from its own
//   definition, here.
// - TB-PRODUCTION-CONTEXT-DIGEST-v2 (current): the same preimage fields, TB canonical JSON v1 and
//   SHA-256; only the identifier differs. Identical persisted rows, scope and identifiers now give a
//   materially different context (the current applicability of every listed source), so the digest
//   of the unchanged closure is another value: a preview read under v1 never authorizes a v2 write.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Dependency } from '../../packages/contracts/src/index.js';

export const LEGACY_DIGEST_V1 = 'TB-PRODUCTION-CONTEXT-DIGEST-v1';
export const CURRENT_DIGEST_V2 = 'TB-PRODUCTION-CONTEXT-DIGEST-v2';

/** The request scope a digest covers (priors as named; the preimage sorts them). */
export interface DigestScope {
  readonly caseId: string;
  readonly taskType: string;
  readonly generationMode: string;
  readonly authoritySelectionId: string | null;
  readonly parentBindingId: string | null;
  readonly priorBindingIds: readonly string[];
}

/** The contract and PFC identifiers a digest names (both definitions name them the same way). */
export interface DigestIdentifiers {
  readonly contract: string;
  readonly schemaVersion: string;
}

interface FrozenCanonical {
  canonicalJson(value: unknown): string;
  canonicalSha256(value: unknown): string;
}
/** The frozen reference helper (read-only): TB canonical JSON v1 and its SHA-256. */
const frozen = (await import(
  pathToFileURL(
    path.resolve(
      import.meta.dirname,
      '../../docs/reference/database-api-v1/TB_DATABASE_SCHEMA_API_CONTRACT_v1/contracts/consistency-reference.mjs',
    ),
  ).href
)) as FrozenCanonical;

/**
 * The digest preimage of a definition: { algorithm, contract, schemaVersion, scope (priors as a
 * sorted set), dependencies: [{ entityType, entityId, fingerprint }] in the order given } — never a
 * row version or a clock.
 */
export function digestPreimage(
  algorithm: string,
  identifiers: DigestIdentifiers,
  scope: DigestScope,
  dependencies: readonly Dependency[],
): Record<string, unknown> {
  return {
    algorithm,
    contract: identifiers.contract,
    schemaVersion: identifiers.schemaVersion,
    scope: {
      caseId: scope.caseId,
      taskType: scope.taskType,
      generationMode: scope.generationMode,
      authoritySelectionId: scope.authoritySelectionId,
      parentBindingId: scope.parentBindingId,
      priorBindingIds: [...scope.priorBindingIds].sort(),
    },
    dependencies: dependencies.map(({ entityType, entityId, fingerprint }) => ({
      entityType,
      entityId,
      fingerprint,
    })),
  };
}

/** The TB canonical JSON v1 text of a definition's preimage (the frozen helper's encoding). */
export function digestPreimageText(
  algorithm: string,
  identifiers: DigestIdentifiers,
  scope: DigestScope,
  dependencies: readonly Dependency[],
): string {
  return frozen.canonicalJson(digestPreimage(algorithm, identifiers, scope, dependencies));
}

/** What a TB-PRODUCTION-CONTEXT-DIGEST-v1 deployment computed for this closure (historical only). */
export function legacyV1Digest(
  identifiers: DigestIdentifiers,
  scope: DigestScope,
  dependencies: readonly Dependency[],
): string {
  return frozen.canonicalSha256(digestPreimage(LEGACY_DIGEST_V1, identifiers, scope, dependencies));
}

/** The current definition, TB-PRODUCTION-CONTEXT-DIGEST-v2, rebuilt independently of the application. */
export function currentV2Digest(
  identifiers: DigestIdentifiers,
  scope: DigestScope,
  dependencies: readonly Dependency[],
): string {
  return frozen.canonicalSha256(
    digestPreimage(CURRENT_DIGEST_V2, identifiers, scope, dependencies),
  );
}
