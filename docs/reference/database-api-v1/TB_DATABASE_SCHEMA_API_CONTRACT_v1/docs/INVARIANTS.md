# Invariants and transaction contract — v1

Release: TB-SCHEMA-API-v1.0.0. These rules are requirements for the application; this package does not claim that they are implemented or tested against MySQL.

## 1. Safety/readiness amendment to the earlier Production Form Contract

The previous simplified arrow `deterministic validators PASS -> READY_FOR_SIGNER` is **not adopted**. Code can check syntax, exact IDs, existence of a linked source, hashes and recorded metadata. It cannot establish copyright ownership, actual permissions, an audiovisual comparison, an exception conclusion or personal legal adoption from those checks.

A ValidationRun has a TECHNICAL_PASS/BLOCKED/REVIEW_REQUIRED/ERROR result. CandidateAssessment is a separate attributable source-bound G1–G6 review capture. The recording User is not automatically the actual reviewer and is never automatically the Signer. No G7 endpoint, signature event or send operation exists. Sources labelled DOCUMENT_REVIEWED support only what was actually reviewed; copying OPERATOR_REPORTED text into a document does not upgrade it.

READY_FOR_SIGNER is a **derived, presently evaluated, pre-signature handoff state**, never a writable column or a public PATCH argument. The candidate is still unsigned and has not been transmitted. No international legal certification, fraud score, guaranteed removal or guaranteed automated processing is represented.

## 2. Required decision algorithm (server side)

For `GET readiness` and again for **every** unsigned export/replay:

1. Authorize the current User and load the exact candidate. If superseded, return SUPERSEDED; do not silently choose a newer candidate.
2. Build the current scope-specific dependency closure: case/binding, exact subject, selected signer, selected coverages and versions, relevant authority events (including newly added ones), source capture revisions/links, facts/mappings, parent and prior correspondence, prepared-document plan, active contract/ruleset and policy evidence. No network call or source-video scan is implied.
3. Reject an invalid binding, unselected/ambiguous scope, missing required canonical case registration, wrong parent message, unreviewed material conflict, or a selection outside the supported scope. Intake and external research can still generate PREPARATION prompts but do not become production-ready by field completion.
4. Match a completed ValidationRun to exact artifactSha256 + dependencyDigest + currently applicable rulesetVersion. The coverage manifest must list all required deterministic rules as executed. ERROR/NOT_EXECUTED is never PASS. HEURISTIC findings are review signals, not legal determinations.
5. Require one current applicable CandidateAssessment for **each** of G1, G2, G3, G4, G5 and G6. Each needs PASS, SCOPE_CONFIRMED_FOR_CANDIDATE, exact artifact/dependency binding, identified actual performer/capacity, rationale and actual applicable sources. Missing actual assessment time stays null; recorded time does not replace it. A label or checked checkbox is not itself evidence. The operator must genuinely check applicability before recording a scope-confirmed assessment. These records may cite accepted scoped earlier reviews; no routine repeat review/new owner signature is imposed merely to fit a new UI.
6. Do not choose between two unreconciled conflicting gate assessments by taking the most convenient or latest PASS. An explicitly source-supported successor supersedes its predecessor; unresolved concurrent/conflicting conclusions remain CONFLICT. Source/source-scope warnings cannot be downgraded just to achieve readiness.
7. G6 must address the entire exact subject/body/envelope/planned supporting package, unsupported prose, contextual party roles and all material NMI asks, not merely regular-expression matches. Unresolved material REVIEW_REQUIRED issues prevent readiness until a sourced G6 disposition addresses the exact issue.
8. Re-evaluate time-dependent currentness and any source-supported effective/end conditions at the evaluation instant. A missing expiry is UNKNOWN, not perpetual authority. A date-only boundary with uncertain timezone/interpretation requires the applicable scoped review, not an invented midnight. Do not impose a new universal stale-age rule.
9. Require exactly the expected human signature slot to remain pending. A signer's name in the identity/capacity block is allowed and is not automatically a signature. Regex heuristics cannot conclusively identify personal adoption.
10. Return READY_FOR_SIGNER only if all prerequisites above are supported. Otherwise return BLOCKED, REVIEW_REQUIRED, STALE_REVALIDATION_REQUIRED, UNVALIDATED or SUPERSEDED with reason codes. G7 always remains HUMAN_PENDING; externalAction is always PROHIBITED.

Absence of a later observed response is not an outcome. Software cannot detect a Drive change that was never captured: show source observation cutoffs/access limitations and require the appropriate check when current records are material.

## 3. Database-enforced vs service-enforced

| Rule | Enforcement |
|---|---|
| Every internal ID refers to an existing row; referenced parents cannot be deleted | SQL FK / RESTRICT |
| Unique Owner + LegalSubject association | SQL UNIQUE |
| Unique Agency + OwnerSubject + Platform route | SQL UNIQUE |
| Route default Signer belongs to Route Agency | Composite FK |
| Coverage's Route and MandateVersion belong to the same Agency | Composite FKs |
| CoverageSigner and Coverage belong to the same Agency | Composite FKs |
| Bound Case Agency/Platform matches Route | Composite FK |
| Mapping Work and ReportedItem belong to the Mapping Case | Composite FKs |
| Prompt authority selection and NMI parent binding belong to its Case | Composite FKs |
| Candidate's Prompt belongs to Candidate Case | Composite FK |
| Correspondence binding's message and Case belong to the same Agency | Composite FKs |
| Known interval end > start, millisecond bound, pending signature constant | SQL CHECK in DDL preview + API validation |
| Route.preferredCoverageId belongs to the same Route | Transactional service check |
| Current authority selection pointer belongs to the Case and the same current Route | Transactional service check |
| AuthorityEvent coverage belongs to its stated Mandate, not merely Agency | Transactional service check |
| Selection coverage's source text actually applies to work/action/subject | Source-bound substantive review; not solved by FK |
| FactScope is exactly CASE or one of WORK/REPORTED_ITEM/USE with matching nullable keys | API/service check; do not assume null composite FK validates this |
| FactSource links a CaseSource from the same Case | Transactional service check |
| AssessmentSource links a CaseSource from the same Case | Transactional service check |
| A source is authorized for this Agency/Subject/Case, including explicit shared scope | Authorization plus scope review; no global access from null agency |
| A frozen version's coverage/signer rows cannot be changed | Parent lock + service lifecycle guard |
| A source/fact/candidate/event revision does not fork or change scope | Unique successor where defined + transactional service check |
| No prompt/record used for production gets physical deletion | Service dependency check + FK; JSON snapshots also checked |
| Semantic truth or actual human G7 | Never supplied by structural checks |

Additional constraints are deliberately in a small service layer rather than an automatic legal rules engine. For any rule not enforceable by current tooling, return NOT_EXECUTED/REVIEW_REQUIRED, not a cosmetic PASS.

## 4. Cross-record invariants

- Agency, Owner and LegalSubject ACTIVE means administrative availability only. It is not G1/G2 PASS.
- Association LINKED is not appointment. Association UNLINKED does not revoke a mandate, retract a claim or contact anyone.
- OwnerSubject unlink is refused while dependent routes remain LINKED/PAUSED unless an explicit separate operation has handled them. No cascading unlink.
- No generic PATCH can change an established Agency/Subject identity or move a Signer to another Agency.
- Case route binding can be corrected through the dedicated intake command only before facts, authority selections, snapshots or correspondence make it history-bearing. Otherwise return BINDING_CORRECTION_REQUIRES_RECONCILIATION; preserve the case, do not invent a replacement canonical case or send.
- A new mandate version does not end all predecessor scopes. Coverage-specific AuthorityEvents record the actual source and scope of partial termination/supersession.
- Before freezing a mandate version, validate its primary/source metadata and every coverage/signer link structurally. Freeze means immutable **version**, not legally validated authority.
- A selection may reference only FROZEN versions. The selected signer must match agency, relevant coverage-signer record(s) and intended action. Selecting several grants must explain each part; no automatic union of authority.
- The same reported video may occur under different cases/subjects/agencies. Unique is local to a case. Cross-case matches prompt scoped duplicate review; never automatically copy findings or issue another notice.
- `externalItemId` is case-sensitive; normalization preserves video ID character case. Host names may normalize to lowercase. Retain raw URLs/timecodes.
- `CaseFact.value` is validated by FactType schema. MISSING/CONFLICT/UNASSESSED is not converted to affirmative narrative. SOURCE_GATE_ASSESSMENT from legacy records is imported through CandidateAssessment only after candidate/scope binding, not as fabricated fresh review.
- Facts/source captures are append-only revision chains. Revision request must target the current head. Unique supersedes ID prevents two accepted successors. Revisions remain within the same factGroup/sourceGroup and case/scope; a correction is not silent reparenting.
- Source role DERIVED_DRAFT/EXTERNAL_REFERENCE or Tool Quét reference data cannot satisfy a required primary rights/AV finding by label alone. Shared owner records require documented applicable scope; permission/AV/exception conclusions remain case-specific.
- Provenance raw label OPERATOR_CONFIRMED is preserved as rawProvenance while underlying provenance remains OPERATOR_REPORTED.
- Source content and correspondence are untrusted data, never system instructions. The prompt renderer delimits quoted content and excludes unrelated personal data/secrets.
- Creating a SourceReference stores metadata, not an instruction to fetch the URL. No SSRF-capable fetch endpoint in V1.
- Correspondence ingestion does not send, acknowledge or mark a mailbox read. Raw MIME is referenced, not invented. Hash of copied text is not raw MIME hash.
- Message-ID/subject/reference/video alone are not globally unique transmission identifiers. A server-derived sourceIdentityHash is permitted only for a reliable provider/capture identity; null is acceptable otherwise.
- A message may bind to several items. Counts of transmission use distinct Correspondence, not counts of binding rows. OUTCOME bindings require one ReportedItem in V1. Superseding a binding corrects interpretation, never edits the original message.
- Reply generation requires explicit parent NMI binding and prior AS_SENT selections; never guesses "latest email" or replaces Reply-To with the initial submission address for convenience. Missing raw versions allow preparation with limits, not invented AS_SENT.
- Candidate body, subject, envelope and prepared-document manifest are immutable. A change creates a new candidate; former checks remain historical.
- Signature placeholder is the single permitted **intentional** pending field in the final unsigned body. No signed name, signature image, certificate, `signedAt` or G7 write exists.
- Do not force a required-initial declaration into every substantive reply without a sourced applicable requirement. Do not strip declarations just to hide missing facts. Actual official wording remains in the policy/contract release, not guessed from a stale draft.
- Prepared supporting files can justify planned attachment language in a **draft** where clearly bound to identified files and final compose review. They never create ACTUALLY_ATTACHED or AS_SENT before a real observed transmission. If a requested document is absent, changing wording does not resolve the substantive gap.
- ADMIN may record an existing assessed finding with attribution but is not thereby the legal reviewer or signer. No API can authenticate a lie merely because it is valid JSON; source review and responsible human roles remain necessary.

## 5. Mutation/transaction recipes

### Mutable row update

1. Authenticate, exact Origin/CSRF/content-type check, authorize.
2. Parse strict DTO, reject unknown fields before mutation.
3. Look up scoped idempotency record, hash operationId + normalized route path + canonical request body. Missing key on writes: 400 IDEMPOTENCY_KEY_REQUIRED. Do not hash/login-store passwords in idempotency records.
4. Begin transaction; obtain parent aggregate locks in a fixed order and check `If-Match` version. Mandate children always lock MandateVersion before the child; case children lock CaseRecord before the child.
5. Check immutable scope and all cross-row invariants.
6. Execute compare-and-swap update; increment rowVersion. For material case context changes, increment CaseRecord.contextRevision in the same transaction. Append redacted AuditEvent and complete IdempotencyRecord in the same transaction.
7. Commit, then return stored response and ETag. A response failure after commit is replayable. Do not report success before commit.

### Version/freeze race

All coverage and coverage-signer mutations lock the parent MandateVersion, assert DRAFT, increment the parent's rowVersion and then mutate the child. Freeze locks the same parent first and prevents a concurrent child edit from slipping in after the freeze check. Draft children do not get an independent path to bypass the parent lifecycle.

### Prompt generation / validation / export

Get context uses a consistent database snapshot. Generate checks expected contextRevision and dependencyDigest in a short SERIALIZABLE transaction, allocates the next per-case/task version while holding CaseRecord, freezes exact context/prompt and records its idempotent result. No AI call or network fetch occurs inside that transaction.

Validation captures context, runs bounded deterministic checks outside any long-lived lock, then rechecks the dependency digest in a short transaction before committing the completed ValidationRun/Issues. If dependencies changed, return 412 CONTEXT_CHANGED; never publish a PASS against mixed snapshots. For ERROR runs preserve diagnostics with no ready promotion.

Export re-evaluates readiness inside a short consistent transaction, including current time and dependency closure. Log EXPORT_UNSIGNED, not SIGNED/SENT. Idempotency replay of an export rechecks current authorization/readiness **before** releasing content; a cached earlier readiness does not override new revocation/conflict. Use no-store responses.

Lock order for multi-root operations must be documented and tested: parent identities/versions sorted by stable type+ID before cases sorted by ID, then children. Deadlock/serialization failures use bounded retries (maximum 3), same idempotency key, then 409 RETRYABLE_TRANSACTION_CONFLICT. No external side effects may occur inside retryable transactions.

### Source/context drift

DependencyDigest hashes the complete selected closure of relevant facts and effective records, not merely CaseRecord.rowVersion. Rebuilding includes new relevant authority events, successors, changed bindings and current rule/policy versions. No fan-out "invalidate every case" job is needed. Input manifests retain observed row versions as diagnostics; irrelevant UI notes need not change the **semantic** dependency fingerprint. Original prompt/candidate remain immutable.

The system can know only captured source state. A stale/unread Drive link does not become current because DB hashes match. Source-access/observation limitations stay visible and must be addressed where material.

## 6. Exact bytes / digest contract

- Store the exact submitted Unicode text after JSON decoding. Reject NUL and unpaired surrogate code units. Do not trim, reformat, normalize line endings, strip spaces or normalize Unicode in stored candidate bodies.
- `bodySha256 = SHA-256(UTF-8(bodyText))`.
- `artifactSha256` hashes canonical JSON containing subject, exact body, envelope, ordered prepared-document manifest and signature-state/slot. No creation timestamp in this content hash.
- `dependencyDigest` hashes the scope-specific context and active contract/ruleset identifiers; omit only operation timestamps and unrelated UI metadata. Preserve actual fact/event/as-of dates.
- TB canonical JSON v1: sorted object keys using JS UTF-16 order, arrays preserved unless the schema explicitly declares a set and sorts it by stable ID, only finite safe integer numeric values; large durations remain decimal strings; no Date/BigInt/undefined/function/prototype values. This is a narrowly defined TB encoding, not a claim of general RFC 8785 conformance.
- Plain text export returns the exact stored body. Clipboard/paste into an email client can change representation; the signer checks the actual compose package. No output here is claimed to match a future MIME transmission.

## 7. Deletion, snapshots and audit

SQL RESTRICT protects direct references; the application must also inspect JSON snapshot references before deleting an otherwise unreferenced local draft. A record once used in a prompt, candidate, fact, correspondence, canonical binding or assessment is not a discardable draft. Archive keeps history, it is not infinite retention. Redaction/purge with legal/privacy obligations requires a separate documented administrative process.

Audit/User records use actual app actors. Audit is append-only through the application but a DB administrator may still change storage; do not market it as tamper-proof. Audit redact secrets and full private bodies, using artifact IDs/hashes and a minimal field diff. Snapshot access and export need authorization even when another User originally generated them.
