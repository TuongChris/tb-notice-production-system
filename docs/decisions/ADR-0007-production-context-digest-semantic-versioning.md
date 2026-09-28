# ADR-0007 — TB-PRODUCTION-CONTEXT-DIGEST-v2: the dependency digest names the context semantics

Status: **ACCEPTED** with documented qualification — operator, 2026-09-28, at review gate **R14 final**, whose result is **PASS** (mission TB_R14_FINAL_ACCEPTANCE_CLOSEOUT_AND_MERGE), on the recommendation of the independent Astra review of the exact head `c889e63d868b524909882e5e4c0a61620ee86c20`. **`TB-PRODUCTION-CONTEXT-DIGEST-v2` is the active production-context digest definition.** The qualification is documentation only (R14-AUD-014, CLOSED_DOCUMENTATION_ONLY): Decision 7's statement of where the literal can appear is corrected; no rule, assertion or behaviour changed (Acceptance, at the end). Proposed 2026-09-28 with mission TB_R14_ASTRA_AUD013_SEMANTIC_DIGEST_REMEDIATION for the operator's review at gate R14 final. It remediates the independent Astra re-audit finding R14-AUD-013 (at `e0a521a`; CONFIRMED_DEFECT, HIGH; it blocked R14 final and assessment implementation), now CLOSED_VERIFIED_WITH_LIMITS. It is a separate decision from ADR-0006 (the additive `getValidationRun` read, TB-SCHEMA-API-v1.3.0), accepted at the same gate and only cross-referenced.
Acceptance boundary: an engineering change to an internal digest definition only. It creates no legal or factual authority, no finding, no review, no G1–G7 decision and no readiness implication. A conflict it makes visible decides no gate (Consequences). Its acceptance is a bounded technical acceptance: not legal approval, real-case authorization, a G1–G6 substantive assessment, G7 or permission to send.
Scope: `apps/api/src/modules/production/context-dependencies.ts` (the identifier `DEPENDENCY_DIGEST_ALGORITHM` and its documented rule), the test-only oracles `tests/support/context-digest-oracles.ts`, the tests and compiled smokes that pin the definition, and the records that describe it.
Related: P4D report §1.3 D5 (the accepted digest), P4E §5 (the stale-context 412) and §12 (the frozen digest), P4G §7 (fresh dependency binding), §36–§37 (R14-AUD-001, -009, -010: the semantic changes), ADR-0006 §8 and Consequences (the contract coupling and the technical-ruleset identity).
Verification: P4G report §38 — implemented on `feature/r14-validation-run-readback` (code head recorded there); tests, negative controls, browser pass, regression sweep and CI in §38 and `docs/verification/p4g/evidence/r14-astra3-*`. R14 final acceptance and R14-AUD-014: P4G report §39.

## Context

- **What the digest protects.** A person reviews one production context and then asks for a prompt (`generatePrompt`) or a technical validation (`validateCandidate`). The request names the reviewed `expectedContextRevision` and `expectedDependencyDigest`. The server rebuilds the context and refuses any difference with 412 `CONTEXT_CHANGED`. Nothing is written unless the rebuilt context is the one reviewed. That is the exact-preview guarantee (P4E §5, P4G §7).
- **What the digest covered.** `dependencyDigest` is the SHA-256 of the TB canonical JSON v1 of `{algorithm, contract, schemaVersion, scope, dependencies: [{entityType, entityId, fingerprint}]}`. The pieces are:
  - `algorithm`: the identifier of this closure and digest definition, `TB-PRODUCTION-CONTEXT-DIGEST-v1` until now.
  - `contract`: the active wire release (`CONTRACT_BASELINE`).
  - `schemaVersion`: the PFC identifier.
  - `scope`: the request scope.
  - `dependencies`: one fingerprint per persisted record of the closure.

  `Case.contextRevision` moves with persisted material changes of the case. Neither the revision nor the fingerprints change when a deployment starts to read the same rows differently.
- **Database state versus the meaning of that state.** The fingerprints describe the persisted dependency rows. The context is what the application derives from them: its conflicts, missing items, closure and the meaning of each record. The derivation changed without a new identifier:
  - R14-AUD-001 made every source a selected message cites a checked condition.
  - R14-AUD-009 extended this to every source the context lists, including a mandate version's primary, additional and signed-date sources and a whole-mandate event's source. These are checked against the case now.
  - R14-AUD-010 added another owner's use of a listed source to the fingerprints.

  For a source that another owner never used, the new result follows only from records already in the closure: the source's scope bindings, the case, its route and association. No fingerprint changed, while the context gained a `SOURCE_NOT_APPLICABLE` conflict.
- **The defect (R14-AUD-013).** Take the same rows, the same contextRevision D, the same `CONTRACT_BASELINE` and PFC identifier, and fingerprints with no owner marker. An earlier deployment showed no conflict and digest H. The current deployment built a materially different context, with the conflict, under the same identifier and so the same digest H. A preview kept from the earlier deployment (D, H) passed both stale checks of `generatePrompt` and `validateCandidate`, and a prompt snapshot was stored with a context the person never saw. The P4G record had already said so: "a new digest identifier would have changed every digest. The operator's confirmation is asked" (§37.13, item 1). The audit answered: the identifier must change.
- **Excluded workarounds.**
  - Rewriting stored records or their digests.
  - A synthetic `contextRevision` write for every case.
  - A second, parallel semantics identifier.
  - A wire field or query parameter naming the algorithm.
  - A v1 fallback.
  - Blocking legitimate shared source reuse.

## Decision

1. **`TB-PRODUCTION-CONTEXT-DIGEST-v2`.** `DEPENDENCY_DIGEST_ALGORITHM` changes from `TB-PRODUCTION-CONTEXT-DIGEST-v1` to `TB-PRODUCTION-CONTEXT-DIGEST-v2`. Nothing else in the definition changes:
   - the preimage fields `{algorithm, contract: CONTRACT_BASELINE, schemaVersion: PFC_SCHEMA_VERSION, scope (priors as a sorted set), dependencies: [{entityType, entityId, fingerprint}] in (entityType, entityId) order}`;
   - TB canonical JSON v1, SHA-256, lowercase 64-hex;
   - `rowVersion` stays a diagnostic outside the digest;
   - the fingerprints, the closure and the R14-AUD-001/-009/-010 semantics.

   The same rows, scope, contract and PFC identifier give another digest. A preview read under v1 therefore never authorizes a write under v2: it is refused with 412 `CONTEXT_CHANGED` `{field: expectedDependencyDigest}`, and nothing is written.
2. **One definition, one path.**
   - `getProductionContext`, the `generatePrompt` rebuild, and the `validateCandidate` capture and commit rebuild all compute the digest through the same `assembleContext` → `dependencyDigest` call.
   - No caller chooses a definition. There is no query parameter, option or fallback.
   - The v1 definition exists only in test code: the oracle `tests/support/context-digest-oracles.ts` and the compiled smokes' independent recomputation (`smoke:p4d`, `smoke:p4g`). Each writes the definition out and hashes it with the frozen reference helper, and it reproduces what v1 deployments computed.
   - A static unit test pins the one definition and the one call.
3. **The versioning rule (permanent).** The digest-definition identifier MUST change whenever a deployment can build a materially different production context, as relevant to review or generation, from identical:
   - persisted dependency rows;
   - request scope;
   - `CONTRACT_BASELINE`;
   - PFC schema version.

   It must change for:
   - a new current-applicability semantic;
   - a new or changed conflict or missing-item derivation;
   - a changed dependency-closure interpretation;
   - a change in which current records affect the context's meaning;
   - any other evaluator change that changes reviewable context without changing a fingerprinted persisted input.

   It must not change for:
   - a refactor with byte- and meaning-identical output;
   - a UI-only or CSS change;
   - test-only changes;
   - a performance change that keeps the semantics;
   - logging;
   - wording outside the context artifact.

   A wire release is no substitute: the contract is a separate part of the preimage. A later change must never alter material context semantics silently under the same identifier.
4. **History is immutable.**
   - A prompt snapshot keeps exactly its recorded digest, dependency manifest, context, rendered prompt, contract version and prompt SHA-256.
   - A validation run keeps exactly its digest, evaluated context, dependency manifest, result, coverage and ruleset version.
   - `getPrompt`, `getValidationRun`, the lists and replays return them as stored. Nothing is re-digested, re-evaluated, relabelled, backfilled or migrated, and no current conflict is inserted into a stored context.
   - A present-day evaluation is a new record.
5. **The digest is not self-describing on the wire.** `dependencyDigest` stays the only wire field, with no algorithm field. This is acceptable because a stored record also freezes exactly what it evaluated: its context, dependency manifest and creation instant. A prompt snapshot also records its contract version and its scope; a run records its ruleset version and reaches its scope through its candidate's prompt.
   - Nothing stored names the definition. v1 and v2 were both computed under TB-SCHEMA-API-v1.3.0, so a contract version does not tell them apart. The database records no deployment instant, so a creation instant relates a record to the repository's history only outside the database.
   - A stored digest's definition is established by recomputing it from its frozen dependency manifest and scope under each written-out definition, as the history test does with the test oracles.
   - A stored digest is reproduced only under its own definition. The current implementation cannot recompute a v1 digest, and nothing claims otherwise.
   - A self-describing digest on the wire would be a separate contract change, not made here.
6. **Unchanged.**
   - No wire change: TB-SCHEMA-API-v1.3.0 keeps 289 schemas, 144 operations and 99 paths, and the amendment keeps sha256 `6b74c09a…1630`.
   - No schema, migration, backfill or new table.
   - `CONTRACT_BASELINE` stays in the preimage.
   - The PFC identifier `PFC-YT-EMAIL-v1.1` stays.
   - `TB-PROMPT-TEMPLATE-v1`: the renderer is unchanged, and the same supplied context renders the same bytes.
   - `TB-TECHNICAL-RULESET-v2` is unchanged (item 7).
   - `Case.contextRevision` records persisted material case mutations only and is never incremented for a deployment.
7. **Technical ruleset: one named exception (operator decision, 2026-09-28).**
   - `MARKER.INTERNAL_IDENTIFIERS` of `TB-TECHNICAL-RULESET-v2` keeps its pinned vocabulary exactly, `TB-PRODUCTION-CONTEXT-DIGEST-v1` included. The ruleset is not re-versioned for this change.
   - The unit test that requires every identifier the application uses to be in that vocabulary (ADR-0006 §8) now exempts exactly this one identifier: it pins `DEPENDENCY_DIGEST_ALGORITHM` as `TB-PRODUCTION-CONTEXT-DIGEST-v2`, outside v2's vocabulary. Any other new identifier, including a later digest identifier, still fails it.
   - Effect: a candidate whose text contains the literal `TB-PRODUCTION-CONTEXT-DIGEST-v2` raises no `MARKER.INTERNAL_IDENTIFIERS` finding. The application itself uses the identifier only inside the hashed digest preimage. The application does not itself emit `TB-PRODUCTION-CONTEXT-DIGEST-v2` as generated metadata, template text or UI metadata. Captured or operator-supplied free text can nevertheless contain that literal and may flow through context/prompt/candidate text. `TB-TECHNICAL-RULESET-v2` intentionally does not detect that new literal; this is a documented bounded limitation, not evidence that the literal cannot appear. *(Qualified before acceptance, 2026-09-28, R14-AUD-014 — documentation only. As first proposed, the second sentence read: "The string appears on no wire, in no prompt text and on no page, only inside the hashed preimage." That overstated it: recorded free text is carried on the wire, frozen into contexts and prompts and shown on pages exactly as recorded, so it can contain any literal.)*
   - A ruleset that detects it needs a new ruleset version (backlog).

## Consequences

- **Every current digest changes once, at deployment.**
  - A preview kept from before is refused once with 412 `CONTEXT_CHANGED`. The page says "Context changed. Review the current context before generating again." (or "…before validating again.") and offers only a new read, never a silent retry.
  - The dependency manifest of an unchanged context is identical. Only the digest differs, which is intended.
- **Stored prompts and their candidates.** A candidate drafted from a prompt recorded under v1 is validated against the current v2 context.
  - With every record unchanged, `CONTEXT.PROMPT_DRIFT` reports one REVIEW_REQUIRED issue with change `IDENTIFIERS`. The recorded message names "the digest's contract or context-schema identifiers". The digest-definition identifier is one of the digest's identifiers.
  - Clearer wording would change the rule's vocabulary and need a new ruleset version (backlog).
  - `CONTEXT.CONFLICTS` reports any conflict the current semantics list.
  - REVIEW_REQUIRED is not a mandatory re-draft. It asks a person to review. It does not mean the candidate's content is wrong or must be rewritten. No automatic redraft, candidate rewrite or rebinding workflow exists or is added.
- **Interaction with `CONTRACT_BASELINE`.** Unchanged: a wire release still gives a new digest, as ADR-0006 records, and its version-only drift is REVIEW_REQUIRED. The two identifiers are independent. A wire release does not version the context semantics, and a digest-definition change is no wire release.
- **Interaction with the PFC identifier.** Unchanged, still part of the preimage. A PFC change is a separate form-contract decision.
- **Interaction with `TB-TECHNICAL-RULESET-v2`.** A separate identity, not conflated:
  - The ruleset version names what validation checks.
  - The digest definition names what context the checks run against.
  - Validation uses the current digest definition. A run records the ruleset and the digest it evaluated.
- **A newly visible conflict decides nothing.** A `SOURCE_NOT_APPLICABLE` that the current semantics list is not a G1–G6 result, invalid authority, absent ownership or absent permission.
  - PREPARATION prompts may carry it.
  - The P4D DRAFTING gate is unchanged: conflicts are listed, not a gate.
  - Substantive review stays future work.
- **CandidateAssessment remains blocked** by R14-AUD-005 and -006 (FUTURE_ASSESSMENT_PREREQUISITE), which this decision does not address.

## Alternatives considered

- **Keep v1 and rely on the case revision or the fingerprints.** The defect is exactly that neither moves when only the interpretation changes. Rejected.
- **Increment every case's `contextRevision` at deployment**, or otherwise write synthetic changes. The revision records persisted case mutations, and writes would fake history. Rejected.
- **A second, parallel semantics identifier in the preimage.** The existing identifier already names "this closure and digest definition". A second one would duplicate it. Rejected.
- **Expose the algorithm on the wire**, as a response field, a query parameter or a caller-selected version. That is a contract change, and a selectable definition would let a caller reach the old semantics. Rejected; a future self-describing digest would need its own contract decision.
- **Serve v1 digests alongside v2**, as a fallback or a compatibility window. That reopens the defect. Rejected.
- **Recompute or rewrite stored digests to v2.** That falsifies what each record evaluated. Rejected.
- **Re-version the technical ruleset (`TB-TECHNICAL-RULESET-v3`)** to add the new identifier to `MARKER.INTERNAL_IDENTIFIERS`. The mission kept the ruleset unchanged, and the operator chose the named exception (Decision 7). Rejected for now; backlog.

## Acceptance (R14 final, 2026-09-28)

- **Result.** R14 final = **PASS** (operator, 2026-09-28; mission TB_R14_FINAL_ACCEPTANCE_CLOSEOUT_AND_MERGE), on the recommendation of the independent Astra review of the exact head `c889e63d868b524909882e5e4c0a61620ee86c20`. R14-AUD-013 is **CLOSED_VERIFIED_WITH_LIMITS**.
- **Active.** `TB-PRODUCTION-CONTEXT-DIGEST-v2` is the active production-context digest definition: the one definition of every read and rebuild (Decisions 1–2).
- **Accepted as written and preserved:**
  - the semantic versioning rule: what must and what must not change the identifier (Decision 3);
  - historical immutability: stored digests, contexts, manifests, results and rendered prompts stay exactly as recorded (Decision 4);
  - no backfill, migration or rewrite of a stored digest (Decision 4; Excluded workarounds);
  - no wire field, parameter or option names the digest algorithm (Decision 5);
  - `CONTRACT_BASELINE` remains part of the digest preimage, as does the PFC identifier (Decision 6; Consequences);
  - REVIEW_REQUIRED from `CONTEXT.PROMPT_DRIFT` asks a person to review; it is not a mandatory re-draft (Consequences).
- **The documented qualification (R14-AUD-014, CLOSED_DOCUMENTATION_ONLY).** Decision 7's statement of where the literal can appear was over-broad and is corrected there. The application does not itself emit the identifier; captured or operator-supplied free text can contain it; `TB-TECHNICAL-RULESET-v2` intentionally does not detect it — a documented bounded limitation. This is a documentation correction only: no runtime remediation, no production-code change, no change to `TB-TECHNICAL-RULESET-v2` and no `TB-TECHNICAL-RULESET-v3`.
- **Boundary.** A bounded technical acceptance of an internal digest definition: not whole-repository assurance, legal approval, real-case authorization, a G1–G6 substantive assessment, G7 or permission to send. CandidateAssessment stays blocked by R14-AUD-005 and -006 (FUTURE_ASSESSMENT_PREREQUISITE).
