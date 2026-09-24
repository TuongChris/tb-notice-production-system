# TB Notice Production System — Production Form Contract v1

Document release: **TB-ARCH-v1.0.0**.
**Compatible machine schema identifier: PFC-YT-EMAIL-v1.1.**
The filename v1 denotes this specification-pack edition, not a request to downgrade the existing wire schemaVersion from v1.1 to v1.

## 1. Normative purpose and limits

Produce the most complete, precise, internally consistent and source-verifiable unsigned INITIAL notice or NMI_REPLY that the case evidence truthfully supports. Do not represent global legal certification, a fraud/trust score, guaranteed automated processing or guaranteed removal.

YouTube's published email procedure requires information in the message body and a human owner's/authorized representative's signature; an unsigned artifact is therefore a pre-signature handoff, not a completed submitted notice. The statutory notice baseline and current platform instructions must be checked for actual case use. They do not prove the merits of a case. [Sources: POL-01, POL-02 in the source register.]

Rule origin must distinguish `PLATFORM_REQUIRED`, `STATUTORY_BASELINE`, `TB_PRODUCTION_CONTROL`, and `PRESENTATION_PREFERENCE`. An internal formatting preference is not a platform requirement.

## 2. Data and authority hierarchy

Exact canonical case sources and genuine owner/reviewer evidence govern material assertions. Database links, summaries, labels and technical validators do not authenticate facts merely by existing.

PartyContext must resolve Agency, Owner namespace, exact LegalSubject and proposed Signer without substitution. AuthorityContext must name the actual Route, selected frozen coverage/version, action and signer scope, currentness evidence and limits. App login does not supply representative authority. A mandate appointment does not establish work-specific ownership.

The app ends before G7. The intended human sender/signatory must personally review/adopt/sign/send outside this application. Drafting legal declarations for review is not asserting that the signer has adopted them.

## 3. Task types and preparation mode

Use the actual baseline enums: `TaskType = INITIAL | NMI_REPLY`; `GenerationMode = PREPARATION | DRAFTING`.

PREPARATION may expose known gaps/conflicts and support independent safe preparation. It must not produce a falsely cleared final candidate. DRAFTING means enough task context to prepare text under the known limits; it is not READY_FOR_SIGNER. Missing rights, identity, permission or comparison support is not manufactured to leave preparation mode.

## 4. Context blocks and exact bindings

Logical blocks map to existing ProductionContext schema keys; they do not authorize adding arbitrary new API keys.

| Logical block | Required content |
|---|---|
| Party | agency, namespace, legal subject, proposed signer identity/capacity |
| Authority | exact selection, coverage/version sources, platform/action scope, currentness and limitations |
| Case | canonical/local IDs as actually present; reported items; works; use mappings |
| Facts | typed case/work/use facts, their provenance and unresolved contrary evidence |
| Sources | explicit source captures, scope, access/review limits, revision/hash target |
| Task | INITIAL scope or explicit parent NMI, literal asks and prior AS_SENT/attachments |
| Integrity | contract/template versions, context revision, dependency manifest/digest, missing/conflicts |

Relevant legal declarations are policy constants reviewed against official sources before the production-authoring phase. **This P0 pack supplies no executable notice generator or pre-adopted legal declarations.** P0 can validate the wire shape and reserved unsigned slot without creating a real notice.

## 5. INITIAL content requirements

The unsigned draft should identify who is acting, for which precise subject and in which supported capacity; provide appropriate contact information; identify each reported item and copyrighted work precisely; explain the asserted rights/use sufficiently for this case; and include the required declaration text in a later reviewed ruleset with one pending signature slot.

Rights and permission support, AV/use description and exception consideration must exist in the internal scoped record where the proposed representations depend on them. Not every piece of internal evidence belongs in the external email. Avoid excessive biographies, irrelevant legal rhetoric, unsupported titles or unnecessary exhibits.

A source URL, publication date, duration or file hash alone does not establish title, unauthorized use or a completed review. Only the expression and rights actually supported are asserted; mixed third-party material is not swept into an owner-wide claim.

## 6. NMI_REPLY requirements

Start from the exact bound NMI and literal material questions, not a generic “NMI template.” Examine current authority, relevant work/use facts, prior AS_SENT and actual prior attachments. Answer the current question directly with support and truthful document posture. Do not silently change the thread, recipient or referenced claim.

Each material ask needs a supported disposition: answered with evidence, answered with explicit limits, a requested record still needed, missing owner-controlled fact, legal review needed, or not applicable with reason. The actual wire representation is the existing ask-disposition schema. Longer prose and removal of inconvenient wording do not cure an outstanding material document/fact requirement.

Do not force complete INITIAL repetition or mechanically require the INITIAL declaration check for every reply; use a task-specific applicable policy and source-backed scope assessment.

## 7. Attachment, signature and copy boundaries

The wire DocumentPlan states are **REFERENCE_ONLY, PREPARED_FOR_ATTACHMENT, PREVIOUSLY_SUPPLIED, UNKNOWN**. These do not include a fabricated ACTUALLY_ATTACHED state for the future export. Historical AttachmentObservation records actual observed attachment evidence separately.

If a candidate says an exhibit is attached but only a Drive URL exists, flag the mismatch. Later composition/package handling must distinguish a prepared file from actual transmitted MIME. The product has no email composer/send engine in V1. Pending attachment actions must be clear in internal handoff, and unsupported external claims must not be silently approved.

The one permitted signature slot is:

`[PENDING AUTHORIZED SIGNER — FULL LEGAL NAME REQUIRED]`

A name may appear in an identity/capacity block. Do not confuse that with personal signature, or insert a redundant completed sign-off name immediately below the pending slot. A slot-count validator proves only that the expected token occurs once; it cannot certify that free-form prose elsewhere has not implied adoption.

Do not include internal gate IDs, hashes, review codes or operator notes in the external copy area unless genuinely required by the correspondence. Internal provenance/limitations stay available for review.

## 8. Candidate artifact contract

NoticeCandidate is immutable at insert: subject, bodyText, envelopeJson, preparedDocuments, signatureState and prompt lineage. Revisions create new IDs/versions. No body PATCH or writable readiness field is introduced.

bodySha256 is over the exact valid UTF-8 body. artifactSha256 binds subject/body/envelope/document plan/signature slot. dependencyDigest binds the current applicable case/authority/source context and ruleset. Use the frozen TB canonical JSON v1 semantics for structured hashing; do not silently replace them with a differently ordered JSON library or generic RFC canonicalizer.

No trimming, normalization of Unicode or newline rewriting on stored candidate/prompt/correspondence text. Reject NUL and unpaired surrogates. Source raw-file hashes remain distinct from extracted-text hashes. Copy/export verifies exactness and freshness; clipboard/rendering transformations require specific tests before production use.

## 9. Technical checks and semantic review are different

| Check kind | What it can establish | What it cannot establish alone |
|---|---|---|
| Schema validation | Required shape, types, bounds and known enums | Real ownership or current legal effect |
| Relational constraints | Same-case/agency references, valid linked IDs | That the linked source supports the claim |
| Exact matching/hash | Identifier/string consistency and unchanged artifact | Truth, authenticity or human adoption |
| Heuristic prose scan | Potential unknown assertion, attachment wording or contamination | Complete semantic correctness of arbitrary text |
| Attributable review | Supported substantive findings within actual scope | An unrelated case's review or future human G7 |

Rule results use **TechnicalResult: TECHNICAL_PASS, BLOCKED, REVIEW_REQUIRED, ERROR**. Issues use **BLOCKER, REVIEW_REQUIRED, WARNING, INFO**. Missing/unexecuted checks are never PASS. Heuristics may raise REVIEW_REQUIRED and require actual disposition; do not label unsupported-assertion detection in arbitrary free text as fully deterministic.

## 10. G1–G6 assessments

G1 authority/standing, G2 work-specific rights, G3 identification, G4 evidence/AV comparison, G5 permission/exceptions and G6 exact artifact/traceability QA are independent gates.

CandidateAssessment preserves actual performer kind/label/capacity, rationale, sources, provenance, artifact/dependency binding and scope. The recorder is not automatically the reviewer. Accepted existing reviews can be cited when their scope genuinely applies; no cosmetic repeat review or new owner signature is required merely to fill a database row.

Contradictory assessments require explicit supported reconciliation/successorship; never select the latest convenient PASS. Missing assessedAt stays null. A materially unresolved legal interpretation is held only in its dependent branch.

## 11. Readiness and export decision

Follow the detailed existing INVARIANTS algorithm. In summary: authorize the user; load the exact unsuperseded candidate; build fresh scoped dependencies including newly captured authority events; reject invalid binding/required missing registration/parent/scope; find an applicable completed technical run with rule coverage; require all six attributable applicable gate assessments; handle material REVIEW_REQUIRED issues; evaluate relevant temporal limits; require the pending signature slot; then derive the handoff state.

Allowed derived statuses are **UNVALIDATED, BLOCKED, REVIEW_REQUIRED, STALE_REVALIDATION_REQUIRED, READY_FOR_SIGNER, SUPERSEDED**. READY_FOR_SIGNER is not stored on NoticeCandidate and cannot be set by generic PATCH. Recheck on **every export and idempotent replay**. Old successful export does not authorize later export after a changed/revoked context.

Source changes never captured by this link-only MVP are not automatically detectable. Show observation cutoffs and perform the appropriate actual source check when currentness matters. Do not advertise live verification.

## 12. No cosmetic completion

No universal 30-day currentness cutoff, “fraud score,” “7/7” generated readiness or universal licence/fair-use boilerplate. Do not default unknown facts to false, expired or no permission. Missing optional metadata is a warning only when it does not undermine a material representation; genuine blockers cannot be downgraded to clear the dashboard.

Tool Quét remains reference/discovery-only where permitted; it cannot verify timestamps, AV, exceptions or G4/G6. Respect stricter no-use scopes without importing another case's permission to use the tool.

## 13. P0 versus later implementation

P0 establishes schema representability/parity, immutable reference hashing utilities, unsigned slot primitive tests and reproducible tooling. It does **not** implement prompt drafting, arbitrary-prose analysis, source review, readiness or any real G1–G6 outcome. Those behaviors are future feature acceptance criteria.

The complete app must demonstrate INITIAL and NMI_REPLY with synthetic fixtures, injected defects, context invalidation and unsigned export. Synthetic PASS records are test fixtures only, never attributed to real people or cases.

## 14. Source status

This document reconciles the user's unsigned-output requirement with the attached Database/API INVARIANTS. It corrects the earlier shorthand `technical PASS -> READY_FOR_SIGNER` without removing the user's final unsigned-output objective. [Source register](../architecture/SOURCE_REGISTER_v1.md) records policy links and the limited review performed for this pack. Further policy maintenance before real case use is not part of P0.
