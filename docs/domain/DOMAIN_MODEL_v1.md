# TB Notice Production System — Domain Model v1

Release: **TB-ARCH-v1.0.0** · **Reconciled business view of TB-SCHEMA-API-v1.0.0**.
This is the active conceptual specification. Exact wire keys, field types, nullability, unique keys and FK declarations remain those of the frozen Database/API baseline until a separately recorded technical/domain amendment. This file does not introduce additional database tables or renamed enums.

## 1. Vocabulary and the seven core entities

**Agency** is the representing organization. **Owner** is an internal customer/brand namespace. **LegalSubject** is the precise individual/entity. **Route** connects Agency, OwnerSubject and Platform. **Mandate** identifies an authority record. **Signer** identifies a person in an agency-specific capacity. **CaseRecord** is the storage name for the business Case.

Owner is not synonymous with LegalSubject. An Owner may have several subjects; one subject may appear in several legitimate Owner namespaces. Same names, websites or channels are matching clues, not proof that two records are the same party.

## 2. Cardinality

| From | Relationship | To / mechanism |
|---|---|---|
| Owner | N:N | LegalSubject through OwnerSubject |
| Agency | 1:N | Route, Signer, Mandate |
| OwnerSubject | 1:N | Route |
| Mandate | 1:N | MandateVersion |
| MandateVersion | N:N | Route through MandateCoverage |
| MandateCoverage | N:N | Signer through CoverageSigner |
| Route | 1:N | CaseRecord; unbound intake may have null routeId |
| CaseRecord | 1:N | CaseAuthoritySelection |
| CaseAuthoritySelection | N:N | MandateCoverage through CaseAuthorityCoverage |
| CaseRecord | 1:N | ReportedItem, CaseWork, UseMapping, CaseFact, PromptSnapshot, NoticeCandidate |
| CaseWork | N:N | ReportedItem through repeated UseMappings |
| Correspondence | N:N | Case/item scopes through CorrespondenceBinding |
| NoticeCandidate | 1:N | ValidationRun, CandidateAssessment |

The old conceptual name CaseEvent maps to **CorrespondenceBinding**, not a new table. Source scope joins use the existing CaseSource, FactSource and AssessmentSource models.

## 3. Common rules

Internal UUIDs are not canonical codes or platform references. Canonical codes are source-bound using dedicated operations; the app does not allocate real case numbers. Dates with no known time remain dates; ingestion timestamps never become execution/review/transmission timestamps. `null` is not false, zero, unlimited, permission denied, or a negative outcome.

Mutable records use rowVersion/If-Match and audit. A field marked required in storage may be server-generated; writable input requirements come from API DTO allowlists. Unknown request fields are rejected. Referenced records use RESTRICT, not cascading deletion. Archive/unlink is administrative, not an external legal act.

The storage provenance enum is exactly `DOCUMENT_REVIEWED | OPERATOR_REPORTED | ANALYSIS | MISSING | CONFLICT`. Preserve an imported label such as OPERATOR_CONFIRMED in `rawProvenance`; map to the actual supported class without elevating it. SourceRole and AccessState are separate from provenance.

## 4. Agency

Creation needs displayName; legalName, jurisdiction, contact and navigation fields may remain absent during onboarding. Their use in a substantive candidate requires appropriate support. Website presence and a professional title are not identity verification.

Allow DRAFT, ACTIVE and ARCHIVED record states. ACTIVE means record administration, not authority or readiness. Same-entity contact/name corrections are audited; a different legal entity needs a different Agency record. Once referenced, archive rather than hard-delete. Changing current contact data must not alter prior snapshot bodies or envelopes.

## 5. Owner and OwnerSubject

Owner creation needs displayName. Contacts, aliases, channels, website and language are optional until relevant. A contact person need not be the rights holder or authorized signatory.

OwnerSubject preserves one unique `(ownerId, legalSubjectId)` association. Link/unlink/relink retains history. Archiving an Owner does not archive a LegalSubject shared with another namespace. An unknown legal identity can remain Owner-only intake; do not invent a placeholder company to satisfy a relation.

## 6. LegalSubject

Required identity entry: legalName and subjectType (`INDIVIDUAL`, `LEGAL_ENTITY`, `OTHER`), with review/provenance limitations. Legal form, jurisdiction, registration and contacts are conditional or optional. Their absence does not force fabrication or block unrelated intake work.

A change from an individual to a company is a new subject, not a type toggle after history exists. For a documented same-entity legal-name correction, preserve source and artifact history. Do not globally deduplicate solely by name/email/channel. Historical binding corrections require controlled reconciliation rather than generic CRUD.

## 7. Signer

A Signer requires agencyId and fullLegalName. Title, email and delegation references are conditional. `SignerState` is `DRAFT | AVAILABLE | PAUSED | ENDED`; AVAILABLE is operational availability only.

A Signer record is not an application User. A logged-in admin is not automatically the named person. One person acting at two agencies has independently scoped capacity records; no automatic delegation transfer. Changing a route default only changes a future selection suggestion.

Scope for a particular authority comes through CoverageSigner. Names in identity/capacity blocks are permitted; the app never fills the pending signature slot as a human act.

## 8. Route

Unique identity: `(agencyId, ownerSubjectId, platform)`; platform is YOUTUBE in this release. LinkState is `LINKED | PAUSED | UNLINKED`. Optional defaults include signer and preferred coverage. A default is not a case-specific finding.

Link is a relationship record, not authority. Pause/unlink prevents inappropriate new selection but preserves open/historical cases and correspondence. Unlink does not revoke a mandate, retract a notice or invalidate historical authority. Relink does not revive expired/revoked scope. If the exact tuple already exists, return conflict or use its explicit lifecycle operation; do not create an identical route.

## 9. Mandate, versions, coverage and events

### Mandate

Logical identity belongs to one Agency. label is the administrative name; canonicalCode and externalAuthorizationReference are distinct. One mandate can support several subject-specific routes; do not restrict it to one owner or one route.

### MandateVersion

VersionState is `DRAFT | FROZEN`. While draft, source/term metadata and coverage children can be edited with concurrency checks. Before selection, freeze the parent and its coverage/signer children atomically. After freeze, use a successor or an AuthorityEvent rather than editing the terms in place.

ChangeKind is `NEW_AUTHORIZATION | AMENDMENT | DOCUMENT_CAPTURE | METADATA_CORRECTION`. A better scan is not automatically a new legal grant. ValidityModel is `UNKNOWN | FIXED_TERM | UNTIL_TERMINATED`. Missing expiresOn never implies perpetual effect; displayed dates retain their actual limits.

### MandateCoverage

Connect one exact MandateVersion to one exact Route. Preserve coveredWorksScope, territorialScope, actionScope, exclusions, conditions, exclusivity, dates and basis source. Scope for one subject is not transferred to another. Multiple relevant coverages can coexist; do not enforce a universal single-active-mandate rule.

`CoverageState` exists as a vocabulary in the reference catalog; do not add a persisted `coverageState` column if it is absent from the actual model. Current effects are interpreted from the version/coverage and source-backed AuthorityEvents.

### CoverageSigner and AuthorityEvent

CoverageSigner binds a same-agency Signer to coverage and its recorded limits. Adding a row does not grant real authority.

AuthorityEvent records currentness, revocation, termination, supersession, resignation or correction that a source supports. A null coverageId means whole-mandate scope only when the source actually supports that scope. A newer version does not automatically supersede every earlier grant. Partial termination for subject A must not alter subject B.

## 10. CaseRecord and authority selection

Initial creation requires agencyId, platform and an intakeLabel. ownerHintId and routeId may be null. CaseClass is `WORKING_INTAKE | CURRENT_OPERATION | RECOVERED_HISTORY | EXTERNAL_REFERENCE`. Keep research and recovered history distinct from newly initiated operational cases.

WorkflowState is `INTAKE | PREPARING | DRAFTING | AWAITING_HUMAN | AWAITING_PLATFORM | CLOSED`. It describes activity, not legal readiness or removal success. Closing a case needs the appropriate reason; no outcome is inferred from silence.

CaseAuthoritySelection is append-only, naming the selected route, signer, task/mailbox and scope. CaseAuthorityCoverage identifies the chosen grants. Do not union incompatible coverages or read route defaults retrospectively. Selecting an agency, signer or grant different from the earlier selection requires explicit new scope review where relevant.

Correct a wrong intake binding before dependent artifacts exist with validation/audit. Once history exists, generic PATCH cannot transfer the matter and its facts to another party. A controlled sourced correction preserves the original observation; a genuinely different matter requires separate case treatment.

## 11. ReportedItem, CaseWork and UseMapping

ReportedItem supports YouTube **video item formats** in V1, not every content type that YouTube may accept. externalItemId remains case-sensitive and unique within case scope, never globally. Different cases may legitimately reference the same video and need duplicate/material-conflict review.

CaseWork holds exact source-work identification. Source publication alone is not title to every right. Work-specific rights assertions are scoped facts.

One source work can appear repeatedly in a reported video. Each UseMapping has its occurrence and intervals. Store unsigned BIGINT milliseconds; API uses decimal strings bounded by `9007199254740991`. Null bounds stay null. End must exceed start when both exist. Boundary convention and raw timecodes are retained. Equal duration or matching endpoints never proves AV identity.

## 12. CaseFact and source links

FactType matches the schema: `RIGHTS_BASIS`, `RIGHTS_SCOPE`, `PERMISSION`, `AV_COMPARISON`, `EXCEPTION_REVIEW`, `WORK_IDENTIFICATION`, `REPORTED_IDENTIFICATION`, `DUPLICATE_REVIEW`, `AUTHORITY_CURRENTNESS`.

Concepts such as mixed-rights exclusions, licence records and contrary rights belong in those typed value structures/scope, not ad hoc new enum names. FactScope is `CASE | WORK | REPORTED_ITEM | USE`. ResolutionState is `UNASSESSED | SUPPORTED_FOR_SCOPE | CONFLICT | WITHDRAWN`.

Facts are immutable revision chains. The current sourced successor may retract or correct the earlier assertion without deleting history. FactSource references a CaseSource in the same case. A required source list is not a substitute for substantive review of what those sources support.

SourceReference is immutable capture metadata. SourceRole is `CANONICAL_RECORD | PRIMARY_CORRESPONDENCE | OPERATOR_INPUT | DERIVED_DRAFT | EXTERNAL_REFERENCE | POLICY_REFERENCE`. AccessState records whether access was checked at a particular time, not an evergreen guarantee. Content hash targets raw bytes or specified extracted text; a URL hash is never substituted for a content hash.

## 13. Correspondence and outcomes

Store one actual capture and link it through CorrespondenceBinding. Preserve full message/authored body/quoted-history/excerpt roles, observation modes, Message-ID, parent/reference relationships and exact source posture. Never deduplicate by subject or Message-ID alone. Reliable capture/provider identity and scope determine duplicates.

EventType includes observed INITIAL_AS_SENT, ACK, NMI, REPLY_AS_SENT, supplements/corrections, OUTCOME and OTHER. These names describe captured past events; they are not send operations. Operator-reported transmission remains attributed as such without a fabricated raw MIME hash.

An outcome binds to a specific reported item in this baseline. Mixed outcomes stay per-item; subsequent reinstatement is a new event, not deletion of the old removal. The app neither sends a reply nor retries an old transmission.

## 14. PromptSnapshot and NoticeCandidate

PromptSnapshot holds exact prompt/context, source/dependency manifests, missing items/conflicts, prompt/template/contract versions and hashes. The wire ProductionContext schemaVersion is **PFC-YT-EMAIL-v1.1**; the document filename v1 is not the wire identifier.

NoticeCandidate stores an immutable subject, bodyText, envelopeJson, preparedDocuments, signatureState, version/parent and hashes. There is **no persisted READY_FOR_SIGNER/candidateState column** in the baseline. Do not add one based on earlier conceptual diagrams. A dedicated supersession command may record supersededAt/reason without changing content.

bodySha256 protects body bytes; artifactSha256 protects the full subject/body/envelope/document-plan/signature artifact. Exact UTF-8 stored text is not trimmed or newline-normalized. Reject NUL and unpaired surrogates. A changed artifact requires new checks; old PASS does not migrate to a new version.

## 15. ValidationRun, assessments and derived readiness

TechnicalResult is `TECHNICAL_PASS | BLOCKED | REVIEW_REQUIRED | ERROR`. IssueSeverity is `BLOCKER | REVIEW_REQUIRED | WARNING | INFO`. CheckKind distinguishes DETERMINISTIC from HEURISTIC.

CandidateAssessment records actual attributable G1–G6 review with sources, scope, performer, artifact/dependency binding and any limitations. createdById identifies the recorder, not necessarily the reviewer. Missing actual review time stays null. AI-assisted reasoning never becomes personal signature/adoption.

Readiness statuses are `UNVALIDATED | BLOCKED | REVIEW_REQUIRED | STALE_REVALIDATION_REQUIRED | READY_FOR_SIGNER | SUPERSEDED`. These are evaluated views. Recheck current scope, dependencies and sourced assessments on every export, including an idempotent replay. No generic write may set READY_FOR_SIGNER, signed or sent.

## 16. Mutation and edge-case matrix

| Situation | Required behavior |
|---|---|
| Duplicate route/link | Reuse its identity via lifecycle or reject duplicate |
| Individual becomes LLC claimant | New LegalSubject/binding; no inherited rights facts |
| One grant has two subjects | Separate coverage scope; shared source not shared findings |
| Only one scope renewed | New scoped version/event; preserve other scope |
| New signer default | Future suggestion only; selections/snapshots unchanged |
| Changed source or authority | New source/event, dependency invalidation for affected scope |
| Multi-hour or >24-hour video | Milliseconds/string representation; no SQL TIME |
| Repeated copied occurrence | Multiple mapping rows, not overwritten timestamps |
| Same video at different agencies | Separate authority/case review; no blanket uniqueness |
| Same mail discusses several URLs | One capture, several bindings, no double-counted sends |
| Two stale browser tabs | Conditional update fails rather than silent overwrite |
| Changed candidate after technical pass | New revision and fresh applicable checks |
| Source URL exists but unreadable | Access gap; no proof-of-review label |
| Missing legal/permission fact | PREPARATION or affected hold, no invented value |
| Archive referenced entity | Preserve child history; no cascade deletion |
| No platform reply after a send | Outcome remains unknown |

## 17. Exact schema boundary

The reference defines 33 models, 38 enums and 125 modeled FKs. These are inventory counts, not proof of runtime enforcement. All modeled FK actions are RESTRICT. Composite keys constrain same-agency/case links, while additional INVARIANTS remain service-level obligations.

Active Prisma becomes the editable storage model in P0; the old model catalog is a frozen comparison baseline, not a live code generator that does not exist. Required custom MySQL checks/collation live in migration SQL and a constraint inventory. A material change to domain meaning must be reported before implementation.

See [Architecture Resolutions](../architecture/ARCHITECTURE_RESOLUTIONS_v1.md) and the unchanged Database/API `docs/INVARIANTS.md` for detailed authority, source, transaction and export rules.
