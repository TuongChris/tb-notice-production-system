// Strong row-version ETags and If-Match preconditions (API_CONTRACT_v1 §6).
//
// A mutable resource's ETag is `"<EntityType>:<id>:v<rowVersion>"` (the contract example is
// `"CaseRecord:<UUID>:v7"`). A conditional write must present exactly the current value of its
// `x-precondition-target`: a missing header is 428, anything else that is not byte-identical — a
// stale version, a weak validator, `*` or a list — is 412. The server never falls back to
// fetch-and-overwrite.
import { apiErrors } from '../http/api-error.js';

export function entityEtag(entityType: string, id: string, rowVersion: number): string {
  return `"${entityType}:${id}:v${rowVersion}"`;
}

/** Returns the presented If-Match value; 428 PRECONDITION_REQUIRED when it is absent or empty. */
export function requireIfMatch(value: string | undefined): string {
  if (value === undefined || value.trim() === '') throw apiErrors.preconditionRequired();
  return value;
}

/** 412 RECORD_VERSION_CONFLICT unless `presented` is exactly the target's current ETag. */
export function assertIfMatch(
  presented: string,
  target: { readonly entityType: string; readonly id: string; readonly rowVersion: number },
): void {
  if (presented !== entityEtag(target.entityType, target.id, target.rowVersion)) {
    throw apiErrors.recordVersionConflict();
  }
}
