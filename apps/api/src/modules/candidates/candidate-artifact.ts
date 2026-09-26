// The exact artifact of a NoticeCandidate (P4F) and its two hashes (INVARIANTS §6 "Exact bytes /
// digest contract"; Production Form Contract §8 "Candidate artifact contract").
//
//   bodySha256      SHA-256 of the exact UTF-8 bytes of bodyText (the frozen helper's
//                   `exactTextSha256`): no trimming, newline rewriting or Unicode normalization.
//   artifactSha256  SHA-256 of the TB canonical JSON v1 text (tb-canonical-json.ts, the frozen
//                   helper's `canonicalSha256`) of exactly this object:
//                     { algorithm: 'TB-CANDIDATE-ARTIFACT-v1',
//                       subject, bodyText,                                   the exact stored text
//                       envelope: { from, to, replyTo, parentBindingId },               as stored
//                       preparedDocuments: [ { sourceId, purpose, state, fileName, contentSha256,
//                                              disclosureReview, limitations }, … ]  in stored order
//                       signatureState: 'HUMAN_PENDING',
//                       signatureSlot: '[PENDING AUTHORIZED SIGNER — FULL LEGAL NAME REQUIRED]' }
//                   It binds the subject, the exact body, the envelope, the ordered prepared-document
//                   manifest and the signature state and slot ("artifactSha256 hashes canonical JSON
//                   containing subject, exact body, envelope, ordered prepared-document manifest and
//                   signature-state/slot. No creation timestamp in this content hash.") — and nothing
//                   else: no id, case, prompt, parent, version, task, authoring tool, revision reason,
//                   supersession or creation time. The encoding sorts object keys; array order is kept,
//                   so a reordered document plan is another artifact. Any changed character — one
//                   space, CRLF for LF, a decomposed for a composed letter — is another artifact.
//
// The stored envelope and document plans carry every contracted key: an omitted optional field is
// stored as null, since the contract gives omission and null one meaning ("none"). The hash of a
// stored candidate can therefore be recomputed from exactly what getCandidate returns.
import type { DocumentPlan, Envelope } from '@tb/contracts';
import {
  exactTextSha256,
  PENDING_SIGNATURE,
  tbCanonicalSha256,
} from '../../infrastructure/integrity/tb-canonical-json.js';

/** The identifier of this artifact definition (changing the object needs a new identifier). */
export const ARTIFACT_ALGORITHM = 'TB-CANDIDATE-ARTIFACT-v1';

/**
 * The only signature state a candidate has: unsigned, waiting for a human signer outside the
 * application (the DB CHECK ck_notice_candidates_unsigned_only is the backstop).
 */
export const CANDIDATE_SIGNATURE_STATE = 'HUMAN_PENDING';

export interface StoredEnvelope {
  readonly from: string;
  readonly to: string;
  readonly replyTo: string | null;
  readonly parentBindingId: string | null;
}

export interface StoredDocumentPlan {
  readonly sourceId: string;
  readonly purpose: string;
  readonly state: DocumentPlan['state'];
  readonly fileName: string | null;
  readonly contentSha256: string | null;
  readonly disclosureReview: DocumentPlan['disclosureReview'];
  readonly limitations: string | null;
}

/** The envelope as stored: exactly the supplied values, every contracted key present. */
export function storedEnvelope(envelope: Envelope): StoredEnvelope {
  return {
    from: envelope.from,
    to: envelope.to,
    replyTo: envelope.replyTo ?? null,
    parentBindingId: envelope.parentBindingId ?? null,
  };
}

/** One document plan as stored: exactly the supplied values, every contracted key present. */
export function storedDocumentPlan(plan: DocumentPlan): StoredDocumentPlan {
  return {
    sourceId: plan.sourceId,
    purpose: plan.purpose,
    state: plan.state,
    fileName: plan.fileName ?? null,
    contentSha256: plan.contentSha256 ?? null,
    disclosureReview: plan.disclosureReview,
    limitations: plan.limitations ?? null,
  };
}

/** The content a candidate's artifact hash binds. */
export interface CandidateContent {
  readonly subject: string;
  readonly bodyText: string;
  readonly envelope: StoredEnvelope;
  readonly preparedDocuments: readonly StoredDocumentPlan[];
}

/** The exact object artifactSha256 hashes (see above). */
export function candidateArtifact(content: CandidateContent) {
  const { envelope } = content;
  return {
    algorithm: ARTIFACT_ALGORITHM,
    subject: content.subject,
    bodyText: content.bodyText,
    envelope: {
      from: envelope.from,
      to: envelope.to,
      replyTo: envelope.replyTo,
      parentBindingId: envelope.parentBindingId,
    },
    preparedDocuments: content.preparedDocuments.map((plan) => ({
      sourceId: plan.sourceId,
      purpose: plan.purpose,
      state: plan.state,
      fileName: plan.fileName,
      contentSha256: plan.contentSha256,
      disclosureReview: plan.disclosureReview,
      limitations: plan.limitations,
    })),
    signatureState: CANDIDATE_SIGNATURE_STATE,
    signatureSlot: PENDING_SIGNATURE,
  };
}

/** SHA-256 (lowercase hex) of the exact UTF-8 bytes of the body text. */
export function candidateBodySha256(bodyText: string): string {
  return exactTextSha256(bodyText);
}

/** SHA-256 (lowercase hex) of the TB canonical JSON v1 text of the candidate's artifact. */
export function candidateArtifactSha256(content: CandidateContent): string {
  return tbCanonicalSha256(candidateArtifact(content));
}
