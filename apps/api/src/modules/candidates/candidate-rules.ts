// Rules of storing a NoticeCandidate (P4F): only the structural checks explicitly assigned to storing
// a candidate. Everything semantic belongs to the later technical validation and the attributable
// G1–G6 review: whether the prose is supported, whether the pending signature slot occurs exactly
// once, whether "attached" wording matches the document plan, whether the recipient is right.
// Nothing here pretends to decide any of it, and nothing rewrites what was drafted.
//
//   text        every text a candidate stores (subject, body, envelope, document plans, authoring
//               tool, revision and supersede reasons) is kept exactly as decoded from JSON: no
//               trimming, newline, whitespace or Unicode normalization, no sanitizing. NUL is
//               refused (INVARIANTS §6; the request parser refuses unpaired surrogates) → 422
//               VALIDATION_FAILED, before an idempotency claim.
//   prompt      promptSnapshotId names a PromptSnapshot of this case (422 REFERENCE_NOT_FOUND;
//               another case's → 422 CROSS_CASE_REFERENCE; the composite foreign key is the
//               backstop). The task is the prompt's: the request has no task field. The prompt is
//               used as stored — no freshness check against the case's current context, no other
//               prompt chosen — because a draft records what was drafted from that exact snapshot.
//   envelope    parentBindingId is exactly the prompt's parent binding, and none when the prompt
//               named none: an initial notice, or a reply prepared without its parent (INVARIANTS
//               §4 "Reply generation requires explicit parent NMI binding ... never guesses"; PFC §6
//               "Do not silently change the thread"). A reply whose prompt named a parent must name
//               it → 422 REPLY_PARENT_REQUIRED; any other difference → 422 ENVELOPE_PARENT_MISMATCH.
//               from is exactly the intended sender mailbox of the authority selection the prompt
//               pinned (API_CONTRACT §9 step 5: coverage(s), signer and intended mailbox are
//               selected; DOMAIN_MODEL §10: the selection names the task mailbox) → 422
//               ENVELOPE_SENDER_MISMATCH. A prompt without a selection pins no mailbox: the sender
//               is stored as entered and is backed by no selection. to and replyTo are stored as
//               entered.
//   documents   each plan names a SourceReference revision that applies to this case
//               (source-scope.ts, target Case; checked by the service); that exact revision is
//               stored and never followed to a newer one. A contentSha256 is the SHA-256 recorded on
//               that revision, whose hashTarget says what it covers → else 422
//               DOCUMENT_PLAN_UNSUPPORTED (HASH_NOT_RECORDED). PREVIOUSLY_SUPPLIED needs a prior
//               transmission in the prompt's frozen context whose captured attachment manifest names
//               that exact source → else 422 DOCUMENT_PLAN_UNSUPPORTED (NOT_RECORDED_AS_SUPPLIED): a
//               source, a sent message or a plan alone does not record that it was supplied. The
//               states are a plan only: nothing is attached or sent, and PREPARED_FOR_ATTACHMENT is
//               never ACTUALLY_ATTACHED (no such state exists).
//   signature   signatureState is HUMAN_PENDING — not a request field; the DB CHECK is the backstop.
//               Nothing inserts a name or signs. The body's pending slot is not checked here: a draft
//               without the slot, or with the slot completed, is stored so it can be corrected
//               (acceptance scenario AC-047); the slot count is the later validator's rule
//               (INVARIANTS §2 step 9).
import type { ProductionContext } from '@tb/contracts';
import { apiErrors, type ApiError } from '../../infrastructure/http/api-error.js';
import type { StoredDocumentPlan, StoredEnvelope } from './candidate-artifact.js';

interface TextIssue {
  readonly path: string;
  readonly message: string;
}

function nulIssues(value: unknown, path: readonly string[], issues: TextIssue[]): void {
  if (typeof value === 'string') {
    if (value.includes('\u0000')) {
      issues.push({
        path: path.join('.'),
        message: 'Contains a NUL character, which is not stored',
      });
    }
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => nulIssues(item, [...path, String(index)], issues));
  } else if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) nulIssues(item, [...path, key], issues);
  }
}

/**
 * The request-only check of every candidate text (no database), run before an idempotency claim:
 * a NUL anywhere in the body is refused (422 VALIDATION_FAILED naming each field).
 */
export function candidateTextProblem(body: unknown): ApiError | null {
  const issues: TextIssue[] = [];
  nulIssues(body, [], issues);
  return issues.length === 0 ? null : apiErrors.bodyValidationFailed(issues);
}

/** The stored prompt fields a candidate is checked against. */
export interface PromptBinding {
  readonly id: string;
  readonly caseId: string;
  readonly taskType: 'INITIAL' | 'NMI_REPLY';
  readonly parentBindingId: string | null;
  readonly context: ProductionContext;
}

/** The envelope against the exact prompt snapshot (see above), or null when it fits. */
export function envelopeProblem(prompt: PromptBinding, envelope: StoredEnvelope): ApiError | null {
  if (envelope.parentBindingId !== prompt.parentBindingId) {
    if (envelope.parentBindingId === null && prompt.parentBindingId !== null) {
      return apiErrors.replyParentRequired({
        field: 'envelope.parentBindingId',
        reason: 'NOT_IN_ENVELOPE',
        promptParentBindingId: prompt.parentBindingId,
      });
    }
    return apiErrors.envelopeParentMismatch(prompt.parentBindingId);
  }
  const selection = prompt.context.authority?.selection ?? null;
  if (selection !== null && envelope.from !== selection.intendedFromEmail) {
    return apiErrors.envelopeSenderMismatch(selection.id);
  }
  return null;
}

/**
 * The sources recorded as attachments of a prior transmission in the prompt's frozen context: the
 * captured attachment manifests of the messages its prior bindings name (priorCorrespondenceIds —
 * the bindings recorded as sent), never the parent NMI's or another message's.
 */
export function previouslySuppliedSources(context: ProductionContext): ReadonlySet<string> {
  const priors = new Set(context.priorCorrespondenceIds);
  const sources = new Set<string>();
  for (const message of context.correspondence) {
    if (!priors.has(message.id)) continue;
    for (const attachment of message.attachmentsManifest ?? []) {
      if (typeof attachment.sourceId === 'string') sources.add(attachment.sourceId);
    }
  }
  return sources;
}

/**
 * The document plans against the prompt's context and the SHA-256 recorded on each named source
 * revision (`recordedHashes`: source id → its recorded contentSha256, or null), or null when every
 * plan fits. The sources' existence and case scope are checked by the service first.
 */
export function documentPlanProblem(
  plans: readonly StoredDocumentPlan[],
  context: ProductionContext,
  recordedHashes: ReadonlyMap<string, string | null>,
): ApiError | null {
  const supplied = previouslySuppliedSources(context);
  for (const [index, plan] of plans.entries()) {
    if (plan.contentSha256 !== null && plan.contentSha256 !== recordedHashes.get(plan.sourceId)) {
      return apiErrors.documentPlanUnsupported(
        `preparedDocuments.${index}.contentSha256`,
        'HASH_NOT_RECORDED',
      );
    }
    if (plan.state === 'PREVIOUSLY_SUPPLIED' && !supplied.has(plan.sourceId)) {
      return apiErrors.documentPlanUnsupported(
        `preparedDocuments.${index}.state`,
        'NOT_RECORDED_AS_SUPPLIED',
      );
    }
  }
  return null;
}
