import type { AffectedResource } from '@tb/contracts';
import type { WireEntity, WriteOutcome } from '../../infrastructure/write/write-executor.js';

const affected = (type: string, entity: WireEntity): AffectedResource => ({
  type,
  id: entity.id,
  rowVersion: entity.rowVersion,
});

/** 201 with the new entity (its ETag is sent). */
export function created(
  type: string,
  entity: WireEntity,
  extra: AffectedResource[] = [],
): WriteOutcome {
  return {
    status: 201,
    resource: { type, id: entity.id },
    data: entity,
    affected: [...extra, affected(type, entity)],
  };
}

/** 200 with the changed entity (its ETag is sent). */
export function updated(type: string, entity: WireEntity): WriteOutcome {
  return {
    status: 200,
    resource: { type, id: entity.id },
    data: entity,
    affected: [affected(type, entity)],
  };
}

/** 200 for a PATCH that changed nothing: the current entity, no version increment. */
export function unchanged(type: string, entity: WireEntity): WriteOutcome {
  return { status: 200, resource: { type, id: entity.id }, data: entity, affected: [] };
}

/** 204 after deleting an unused draft. */
export function deleted(type: string, id: string): WriteOutcome {
  return { status: 204, resource: { type, id }, affected: [{ type, id, rowVersion: null }] };
}
