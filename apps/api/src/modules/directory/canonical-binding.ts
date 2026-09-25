// Canonical binding (P3A; Mandate in P3B): bindCanonicalAgency / Owner / LegalSubject / Signer /
// Route / Mandate.
//
// A canonical binding records which SourceReference holds a record's already-established canonical
// code ("Canonical-bind commands attach an already established source-backed code. They do not
// allocate canonical numbers, create authority, change Drive or satisfy readiness", API_CONTRACT_v1
// §8). It is an identity/reference association only: it establishes no rights, representation
// authority, mandate, permission, eligibility, G1–G7 or readiness, and it changes no provenance.
//
// Checks, in order, inside the write transaction (the target row is already locked FOR UPDATE and
// its If-Match checked):
//   archived target                                   → 409 RECORD_STATE_CONFLICT
//   already bound (any code, source or binding state) → 409 BINDING_CORRECTION_REQUIRES_RECONCILIATION
//                                                       (a correction is a reconciliation, not CRUD)
//   source exists and applies to the target (scope)   → 422 REFERENCE_NOT_FOUND /
//                                                       CROSS_AGENCY_REFERENCE / SOURCE_SCOPE_UNRESOLVED /
//                                                       CROSS_OWNER_REFERENCE (source-scope.ts)
//   source is the current revision of its chain       → 409 SOURCE_NOT_CURRENT
//   source role is CANONICAL_RECORD                   → 422 SOURCE_ROLE_NOT_VERIFICATION
//   canonical code unused by another record of the
//   same kind (exact, binary comparison)              → 409 DUPLICATE_CANONICAL_CODE
// Then canonicalCode, canonicalSourceId and bindingState SOURCE_REFERENCED are written with the row
// version +1 and one audit event carrying the reason and the source id. DIVERGENT is never set here.
// A bound Agency / LegalSubject is established (its identity fields lock, records.ts); a bound
// Signer's fullLegalName locks as well (signers.service.ts).
import type { CanonicalBindingRequest } from '@tb/contracts';
import type { Prisma } from '../../../generated/prisma/client.js';
import { apiErrors } from '../../infrastructure/http/api-error.js';
import { isUniqueViolation } from '../../infrastructure/write/database-errors.js';
import type { WriteContext } from '../../infrastructure/write/write-executor.js';
import { assertSourcesUsable, type SourceTarget } from '../sources/source-scope.js';
import { auditFields } from './changes.js';
import { hasCanonicalBinding, type CanonicalFields } from './records.js';

export type BindableEntity = 'Agency' | 'Owner' | 'LegalSubject' | 'Signer' | 'Route' | 'Mandate';

const AUDIT_ACTION: Readonly<Record<BindableEntity, string>> = {
  Agency: 'AGENCY_CANONICAL_BOUND',
  Owner: 'OWNER_CANONICAL_BOUND',
  LegalSubject: 'LEGAL_SUBJECT_CANONICAL_BOUND',
  Signer: 'SIGNER_CANONICAL_BOUND',
  Route: 'ROUTE_CANONICAL_BOUND',
  Mandate: 'MANDATE_CANONICAL_BOUND',
};

const BINDING_FIELDS = ['canonicalCode', 'canonicalSourceId', 'bindingState'] as const;

export interface BindingWrite {
  readonly canonicalCode: string;
  readonly canonicalSourceId: string;
  readonly bindingState: 'SOURCE_REFERENCED';
  readonly rowVersion: { readonly increment: 1 };
  readonly updatedAt: Date;
  readonly updatedById: string;
}

export interface BindingSpec<Row> {
  readonly entity: BindableEntity;
  readonly operation: string;
  /** The locked current row (If-Match already checked). */
  readonly current: Row;
  readonly archived: boolean;
  readonly body: CanonicalBindingRequest;
  /** The scope the source must apply to (source-scope.ts). */
  readonly scope: SourceTarget;
  /** Finds another record of the same kind holding `code` (exact comparison); null if none. */
  readonly codeHolder: (code: string) => Promise<string | null>;
  /** Writes the binding with a compare-and-set on the current row version. */
  readonly update: (data: BindingWrite) => Promise<Row>;
}

type BindableRow = CanonicalFields & { readonly id: string; readonly rowVersion: number };

export async function applyCanonicalBinding<Row extends BindableRow>(
  context: WriteContext,
  spec: BindingSpec<Row>,
): Promise<Row> {
  const { tx } = context;
  const { current, body } = spec;
  if (spec.archived) {
    throw apiErrors.recordStateConflict({ archived: true, operation: spec.operation });
  }
  if (hasCanonicalBinding(current)) {
    throw apiErrors.bindingCorrectionRequiresReconciliation({
      canonicalCode: current.canonicalCode,
      canonicalSourceId: current.canonicalSourceId,
      bindingState: current.bindingState,
    });
  }
  const [source] = await assertSourcesUsable(
    tx,
    [{ field: 'sourceId', sourceId: body.sourceId }],
    spec.scope,
  );
  if (source === undefined) throw apiErrors.referenceNotFound('sourceId');
  const head = await currentHead(tx, source.id, source.sourceGroupId);
  if (head !== source.id) throw apiErrors.sourceNotCurrent('sourceId', head);
  if (source.sourceRole !== 'CANONICAL_RECORD') {
    throw apiErrors.sourceRoleNotVerification('sourceId', source.sourceRole);
  }
  const holder = await spec.codeHolder(body.canonicalCode);
  if (holder !== null && holder !== current.id) throw apiErrors.duplicateCanonicalCode(holder);
  const row = await spec
    .update({
      canonicalCode: body.canonicalCode,
      canonicalSourceId: source.id,
      bindingState: 'SOURCE_REFERENCED',
      rowVersion: { increment: 1 },
      updatedAt: context.now,
      updatedById: context.actorUserId,
    })
    .catch((error: unknown) => {
      // A concurrent binding of the same code won the table's unique canonical_code key.
      if (isUniqueViolation(error)) throw apiErrors.duplicateCanonicalCode(null);
      throw error;
    });
  await context.audit({
    action: AUDIT_ACTION[spec.entity],
    entityType: spec.entity,
    entityId: current.id,
    before: { ...auditFields(fieldsOf(current), BINDING_FIELDS), rowVersion: current.rowVersion },
    after: { ...auditFields(fieldsOf(row), BINDING_FIELDS), rowVersion: row.rowVersion },
    reason: body.reason,
    sourceIds: [source.id],
  });
  return row;
}

const fieldsOf = (row: BindableRow): Readonly<Record<string, unknown>> => ({
  canonicalCode: row.canonicalCode,
  canonicalSourceId: row.canonicalSourceId,
  bindingState: row.bindingState,
});

/** The id of the current (highest) revision of the chain `sourceId` belongs to. */
export async function currentHead(
  tx: Prisma.TransactionClient,
  sourceId: string,
  sourceGroupId: string,
): Promise<string> {
  const head = await tx.sourceReference.findFirst({
    where: { sourceGroupId },
    orderBy: { revision: 'desc' },
    select: { id: true },
  });
  return head?.id ?? sourceId;
}
