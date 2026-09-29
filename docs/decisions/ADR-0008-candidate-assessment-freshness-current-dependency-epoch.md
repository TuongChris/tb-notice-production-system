# ADR-0008 — Candidate assessment freshness uses the current production context dependency epoch

Status: **ACCEPTED_BY_OPERATOR · INDEPENDENT_REVIEW_DEFERRED** — accepted for implementation by the operator on 2026-09-28 (mission TB_P4H_CANDIDATE_ASSESSMENT_FAST_TRACK_IMPLEMENTATION, an operator-authorized fast track), on the architecture committed at `5afd2ec`, with the open decisions D-1…D-6 resolved as recorded under "Operator acceptance" below. The independent Astra review of this architecture was **deferred by the operator**: no independent review has taken place, and nothing here is independently verified. Proposed 2026-09-28 by mission TB_PRE_ASSESSMENT_AUD005_AUD006_ARCHITECTURE (architecture and specification only).
Addresses: the Astra finding **R14-AUD-005** (a future plan-source freshness policy; FUTURE_ASSESSMENT_PREREQUISITE, it blocked CandidateAssessment implementation). Proposed as DESIGN_PROPOSED_PENDING_INDEPENDENT_REVIEW; after the operator's acceptance it is implemented by P4H (status in `docs/verification/p4h/P4H_CANDIDATE_ASSESSMENT.md`), with the independent review deferred.
Acceptance boundary: an engineering design decision only. It creates no legal or factual authority, no finding, no review, no G1–G7 decision and no readiness. It derives no READY_FOR_SIGNER. The operator's acceptance authorizes the P4H CandidateAssessment capture and history only — no readiness, unsigned export, G7, signature, sending or external action.
Scope: the CandidateAssessment capture (`captureCandidateAssessment`, `listCandidateAssessments`; P4H) and the future readiness evaluation (`getCandidateReadiness`, `exportUnsignedCandidate`; later phases). As proposed it changed no code, contract, schema, ruleset, digest definition or record; the identifier changes made with its implementation are ADR-0009's and ADR-0010's.
Related: frozen INVARIANTS §2 (the readiness decision algorithm) and §5 (validation/export transactions); PFC §8–§12; DOMAIN_MODEL §14–§16; ADR-0006 (the v1.3.0 read, ruleset identity §8, Consequences on version-only drift); ADR-0007 (the digest definition, its versioning rule and history); ADR-0009 (the AssessmentSource read-back, the other pre-assessment prerequisite); P4F report (R13 decisions 9, 10, 13); P4G report §7 and §30 (V1–V14), §36–§40.
Design record: `docs/architecture/PRE_ASSESSMENT_AUD005_AUD006_ARCHITECTURE.md`. It holds the code trace, the full transition matrix, the traceability matrix and the future acceptance tests. Verification of this mission: `docs/verification/pre-assessment/PRE_ASSESSMENT_ARCHITECTURE_VERIFICATION.md`.

## Operator acceptance (2026-09-28, fast track; independent review deferred)

The operator accepted this ADR and ADR-0009 for implementation without waiting for the independent Astra architecture review ("DEFERRED" is not "independently verified"), and resolved the open decisions of the design record (Appendix C):

- **D-1 — capture on a superseded candidate: the recommended design.** A capture may record an assessment on a superseded candidate as a historical review. It can never count toward current readiness (Decision 5: SUPERSEDED first). There is no hidden refusal merely because the candidate is superseded, and the candidate's supersession is never changed.
- **D-2 — cross-epoch supersession: the recommended design.** A successor may supersede the head assessment of the same candidate and gate even when predecessor and successor bind different epochs. Staleness is separate from supersession (Decision 13).
- **D-3 — non-PASS citations of support that no longer applies: the recommended design.** For HOLD, BLOCKED, MISSING and CONFLICT a reviewer may cite a same-case LINKED CaseSource whose SourceReference no longer applies to the case, to record the problem truthfully. For PASS every cited support's SourceReference must apply to the case now (`applicabilityProblem` null): no other owner's inapplicable material supports a PASS.
- **D-4 — DOCUMENT_REVIEWED and an AI-assisted performer: the conservative rule.** `performerKind` AI_ASSISTED with `provenance` DOCUMENT_REVIEWED is refused with 422. DOCUMENT_REVIEWED is never inferred because a source, link, file name, URL or metadata exists. A HUMAN performer records DOCUMENT_REVIEWED when the operator actually records that review; DOCUMENTED_EXTERNAL_REVIEW records it only as the operator's explicit report of an actual documented human external review.
- **D-5 — support-less negatives: the current contract.** `CaptureAssessment.sources` keeps `minItems` 1; a MISSING review cites the material actually checked or searched. No support-less CandidateAssessment is introduced.
- **D-6 — the disposition of technical REVIEW_REQUIRED issues: deferred.** P4H introduces no waiver, disposition, override or rebinding. The baseline of Decision 9 stands for the readiness phase: READY_FOR_SIGNER requires a current TECHNICAL_PASS run with every required rule executed; no CandidateAssessment turns REVIEW_REQUIRED into TECHNICAL_PASS; `PLAN.SOURCE_IN_CONTEXT`, BLOCKERs, ERROR, NOT_EXECUTED and source-scope conflicts stay non-waivable. Version-only drift stays a later readiness decision.

At acceptance the same mission activated TB-SCHEMA-API-v1.4.0 (ADR-0009) and, because that release adds an identifier the application emits, `TB-TECHNICAL-RULESET-v3` (ADR-0010). Decisions 3 and 15 below describe the identifiers when this ADR was proposed (`TB-TECHNICAL-RULESET-v2`, TB-SCHEMA-API-v1.3.0); the epoch's `rulesetVersion` is the ruleset the server currently runs — `TB-TECHNICAL-RULESET-v3` since ADR-0010.

## Context

- **What a candidate plans.** A NoticeCandidate stores `preparedDocuments[]`. Each DocumentPlan names one exact SourceReference revision (`sourceId`) with `purpose`, `state`, `fileName`, `contentSha256`, `disclosureReview` and `limitations`. The plan is immutable and part of `artifactSha256` (`TB-CANDIDATE-ARTIFACT-v1`).
  - Import accepts any exact source revision that applies to the case under the current source rules, not only the prompt's source manifest (R13 decision 9). A plan can therefore name a source outside the production context.
- **What P4G reads about a plan source** (`validation-inputs.ts`, `readPlanSources`), in the capture's REPEATABLE READ snapshot:
  - whether the revision exists;
  - the `contentSha256` recorded on it;
  - the head of its source group (`headId`);
  - whether it applies to the case now: `applicabilityProblem` (`source-scope.ts`), the recorded-scope dimensions and then the owner dimension, against the case's target.

  The PLAN rules of `TB-TECHNICAL-RULESET-v2` use these inputs:
  - `PLAN.SOURCE_EXISTS`, `PLAN.SOURCE_APPLIES` and `PLAN.CONTENT_SHA256` report BLOCKERs;
  - `PLAN.SOURCE_LATEST_REVISION` reports REVIEW_REQUIRED;
  - `PLAN.SOURCE_IN_CONTEXT` reports REVIEW_REQUIRED for a source outside the evaluated context's dependency closure;
  - `PLAN.PREVIOUSLY_SUPPLIED` reads the evaluated context's prior transmissions.
- **What P4G persists.** A ValidationRun stores the P4D `dependencyDigest` it evaluated, with its dependency manifest, evaluated context, `rulesetVersion` and result.
  - `planSourcesFingerprint` over the plan-source reads is compared again at the commit (412 `CONTEXT_CHANGED` {field `preparedDocuments`}). It is not persisted.
  - So the state of a plan source outside the closure is represented neither by the stored digest nor by any other stored field of the run.
- **The finding (R14-AUD-005).**
  - A plan source outside the closure can change after a run: a newer revision, or another owner's material. The candidate's `dependencyDigest` does not change.
  - Today this is safe: `PLAN.SOURCE_IN_CONTEXT` keeps such a run REVIEW_REQUIRED, never TECHNICAL_PASS, and nothing downstream exists.
  - The risk is future: a CandidateAssessment or a readiness rule could clear, reuse or rely on a review of that plan source without binding the exact state that was reviewed.
- **What the frozen algorithm requires.**
  - INVARIANTS §2 step 2 builds one "current scope-specific dependency closure", and the "prepared-document plan" is part of it.
  - Step 4 matches a completed ValidationRun to "exact artifactSha256 + dependencyDigest + currently applicable rulesetVersion".
  - Step 5 requires, for each gate, an assessment with "exact artifact/dependency binding".
  - Step 6: "Source/source-scope warnings cannot be downgraded just to achieve readiness."
  - Step 7: unresolved material REVIEW_REQUIRED issues prevent readiness "until a sourced G6 disposition addresses the exact issue".

## Decision

1. **Model A — closure-only clearance — is the permanent invariant.**
   - A prepared-document source can count toward the clearance of a candidate only while it is inside the dependency closure of the candidate's current production context. The context is the P4D context of the candidate's prompt scope: task, mode, the named selection, the parent binding and the prior bindings of the prompt's frozen manifest (P4G V4).
   - Model B, an explicit persisted plan-evaluation identity, is rejected (Alternatives).
   - The design record proves the selection against the current code.
2. **`PLAN.SOURCE_IN_CONTEXT` REVIEW_REQUIRED is non-waivable.**
   - No CandidateAssessment, disposition, override, readiness rule or later mechanism may treat it as resolved, count it as passed or remove it.
   - The only way to clear it is a new technical run in which the rule reports nothing, because the source has legitimately entered the closure (item 7).
   - The same holds, by the frozen rules, for:
     - every BLOCKER ("genuine blockers cannot be downgraded", PFC §12);
     - an ERROR run and a NOT_EXECUTED rule ("never PASS", INVARIANTS §2 step 4);
     - every source or source-scope conflict (`SOURCE_NOT_APPLICABLE`, `CORRESPONDENCE_SOURCE_NOT_APPLICABLE`; INVARIANTS §2 step 6).
   - The rule's recorded message says "Link it to the case, or have its use reviewed". A review may be recorded (item 6), but it does not clear the condition. The message belongs to `TB-TECHNICAL-RULESET-v2` and is not reworded here; a new wording would need a new ruleset version.
3. **The evaluation epoch.** Freshness for technical runs, assessments and readiness has one identity:

   `E = (candidateId, artifactSha256, dependencyDigest, rulesetVersion)`

   - `candidateId` is the exact candidate. `artifactSha256` alone does not identify a candidate: two candidates can hold byte-identical content (R13 decision 13).
   - `artifactSha256` is the candidate's stored artifact hash. It never changes for a candidate: a different plan or text is a different candidate.
   - `dependencyDigest` is the current P4D digest of the candidate's prompt scope. The server computes it with the one digest definition of every read and rebuild (`TB-PRODUCTION-CONTEXT-DIGEST-v2` today, ADR-0007). It is never the prompt's recorded digest and never a second digest algorithm.
   - `rulesetVersion` is the technical ruleset identifier the server currently runs (`TECHNICAL_RULESET_VERSION`, `TB-TECHNICAL-RULESET-v2` today).
   - The current epoch is computed by the server in one consistent snapshot. A client supplies expectations only (`expectedArtifactSha256`, `expectedDependencyDigest`, `rulesetVersion`), never the epoch.
   - A scope that cannot be read has no current epoch: for example, a binding the prompt named that has since been corrected. Nothing can count against it.
4. **Why the epoch binds every plan-source transition (Model A's proof obligation).**
   - For a plan source inside the closure, every input the PLAN rules read is a function of fingerprints the digest already covers:
     - the revision's `agencyId`, `scopeBindings` and `contentSha256` are in its fingerprint;
     - its group head is in it as `headId`;
     - the recorded-scope applicability follows from records already in the closure: the source revision, the case, its route and association;
     - the owner applicability is carried by `otherOwnerMaterial: true` on that source's fingerprint;
     - inclusion in the closure is the dependency list itself;
     - `PLAN.PREVIOUSLY_SUPPLIED` reads selected prior messages, which are in the closure.
   - The one input not fingerprinted is the identity of the other owner, which `PLAN.SOURCE_APPLIES` puts into its issue details. It changes no rule result. P4D deliberately names no other owner, and the owner dimension's result (applies or not) is covered.
   - So under Model A the epoch determines every PLAN rule's result. With `candidateId` fixing the prompt, and the ruleset being pure, it determines the whole run's result, except an ERROR from a runtime failure.
   - For a plan source outside the closure the epoch does not bind its state. Item 2 makes that state unable to count.
5. **Staleness.**
   - A run or an assessment is stale exactly when its `(candidateId, artifactSha256, dependencyDigest, rulesetVersion)` differs from the candidate's current epoch.
   - Staleness is derived when evaluated, never stored.
   - A stale record stays unchanged as history.
   - There is no time-based stale rule (INVARIANTS §2 step 8; PFC §12). Time-dependent currentness of what an assessment reviewed is evaluated by readiness at its instant, as the frozen algorithm requires; this decision does not design it.
   - A superseded candidate is SUPERSEDED before any epoch question arises. Its runs and assessments never count.
6. **Recording is not counting.** A future capture records what a reviewer actually found, and PASS, HOLD, BLOCKED, MISSING and CONFLICT stay recordable for a truthful review:
   - also on an epoch that can never count, for example one whose run is REVIEW_REQUIRED by `PLAN.SOURCE_IN_CONTEXT`;
   - also for a superseded or PREPARATION-mode candidate.

   Only readiness counts, and it counts an assessment only under item 8. Capture binding (P4H requirements):
   - `expectedArtifactSha256` must be the stored artifact hash (412 `ARTIFACT_CHANGED`).
   - `expectedDependencyDigest` must be the digest the server rebuilds for the candidate's prompt scope in the capture transaction (412 `CONTEXT_CHANGED`, never substituted).
   - `rulesetVersion` must be the current technical ruleset identifier, and a completed ValidationRun of this candidate with exactly this `(artifactSha256, dependencyDigest, rulesetVersion)` must exist. Otherwise it is a 422 with an implementation code in the existing free-string `code` (for example `VALIDATION_RUN_REQUIRED`); an arbitrary or unevaluated ruleset string is never recorded.
   - These make the stored `rulesetVersion` meaningful. They also mean the stored evaluated context and dependency manifest of that run, readable through `getValidationRun`, document the context the assessment was bound to.
   - A scope the DRAFTING gate refuses has no run and so no epoch. Nothing can be recorded against it, and nothing needs to be: readiness is blocked by the missing input itself.
7. **The path into the closure.**
   - A plan source enters the closure only through an existing, appropriate citation of the case's context, for example:
     - a LINKED CaseSource link of the case;
     - a fact support;
     - the case's packet or canonical-binding source;
     - a use mapping's or the selection's basis;
     - a source of the pinned authority chain;
     - a raw or attachment source of a selected message.
   - A source already in the closure through any of these needs no additional link. None is required for convenience.
   - A source outside the closure that applies to the case can always be linked. The CaseSource link applies the same `applicabilityProblem` rules as `PLAN.SOURCE_APPLIES`, against the same target.
   - Entering the closure changes the digest: a new epoch, earlier runs and assessments stale.
   - The next run of the same candidate then reports `CONTEXT.PROMPT_DRIFT` REVIEW_REQUIRED, because the dependencies changed since the prompt. Under item 9 a clean technical state therefore needs a new prompt snapshot and candidate prepared from a context that contains the planned documents. This is the principled state: the draft was prepared from a context that included them.
8. **Readiness counting rule** (design only; normative for the future readiness implementation, which decides nothing here):
   - Readiness uses one epoch, the candidate's current `E`. The counted run and all counted assessments bind exactly that `E`, with no mixing across epochs: the ReadinessSchema itself reports a single `artifactSha256`, `dependencyDigest`, `rulesetVersion` and `validationRunId`.
   - **The run.** The most recently recorded completed ValidationRun of the candidate with exactly `E`, named as `validationRunId`. Several runs of one `E` that disagree are a reason not to be ready, never resolved by choosing the convenient one.
   - **Each gate, G1 to G6 independently and non-compensatorily.**
     - The current assessments are the heads of the gate's supersession chains for this candidate whose epoch is `E`.
     - Exactly one head with PASS and `SCOPE_CONFIRMED_FOR_CANDIDATE` counts.
     - Two or more heads are CONFLICT, never the latest convenient PASS (INVARIANTS §2 step 6).
     - None is UNASSESSED.
     - Any gate not counted as PASS prevents READY_FOR_SIGNER. No score, weighting or majority exists.
   - `signatureState` stays HUMAN_PENDING and `externalAction` PROHIBITED (ReadinessSchema literals). G7 stays human and outside the application.
9. **Technical-review override policy: none.** No override, waiver or disposition of a technical condition exists, and none is designed here.
   - **Baseline, normative for P4H and the first readiness implementation.** READY_FOR_SIGNER requires the counted run of the current epoch to be TECHNICAL_PASS with every required rule executed.
   - **Checked against the frozen rules.**
     - PFC §9 ("Heuristics may raise REVIEW_REQUIRED and require actual disposition") and INVARIANTS §2 step 7 ("a sourced G6 disposition addresses the exact issue") permit a future disposition mechanism. The baseline is their conservative implementation: without a mechanism, every REVIEW_REQUIRED issue stays unresolved.
     - A future mechanism needs its own ADR and contract release. `CaptureAssessment` cannot name a ValidationIssue today: a CONTRACT_GAP only if such a mechanism is adopted.
     - It must be traceable to the exact issue and run.
     - It may never cover the conditions of item 2.
   - A CandidateAssessment never rewrites, relabels or annotates a ValidationRun or ValidationIssue, and never makes a run appear TECHNICAL_PASS.
10. **`planSourcesFingerprint` stays transient.** It remains the validation's capture-to-commit race guard only. It is never persisted, never on the wire, and never an assessment or readiness identity: there is no second freshness identity.
11. **Keeping item 4 true.** A later change to what a PLAN rule reads about a source must do one of two things:
    - stay a function of the closure's fingerprints;
    - come with a closure or fingerprint change under a new digest-definition identifier (ADR-0007 Decision 3), and a new ruleset version when a rule's meaning changes (ADR-0006 §8).

    The future acceptance tests include a digest-completeness test for plan sources inside the closure.
12. **No `validationRunId` on CandidateAssessment.** Not needed: under item 4 the epoch determines the content of every run that can count. `Readiness.validationRunId` and `ExportUnsigned.validationRunId` already name the exact run where the handoff depends on it. No CONTRACT_OR_SCHEMA_GAP. (A future issue-disposition mechanism, item 9, would need exact issue and run references; that is part of its own gap.)
13. **Assessment supersession changes selection only.**
    - `supersedesAssessmentId` names an earlier assessment of the same candidate and gate that has no successor yet. The database's unique key allows one successor.
    - The predecessor and its AssessmentSource rows never change.
    - The successor carries its own epoch binding and its own supports. Nothing is inherited, merged or carried over.
    - Staleness needs no supersession: a stale assessment simply no longer counts.
    - An earlier review may be cited by a new, re-recorded assessment when its scope genuinely applies (PFC §10: no cosmetic repeat review). It is never inherited silently.
14. **`scopeState`.**
    - `RECORDED_NOT_ADOPTED` (the default) records an assessment as reported, without the recorder confirming that its scope applies to this exact candidate artifact and epoch.
    - `SCOPE_CONFIRMED_FOR_CANDIDATE` records that the operator genuinely checked that applicability (INVARIANTS §2 step 5). Only it can count.
    - Neither is personal adoption of the notice, a signature, G7, legal approval or evidence.
    - Design note: the word "ADOPTED" in the frozen enum means adopting the assessment's scope for the candidate. It is not unsafe and is not renamed (a rename is a breaking wire change). Future UI copy says "Scope not confirmed for this candidate" / "Scope confirmed for this candidate (not a signature or personal adoption)".
15. **Unchanged.**
    - No wire change: TB-SCHEMA-API-v1.3.0, 289 schemas, 144 operations, 99 paths.
    - No schema or migration change: `20260923103912_initial_schema` stays the only migration.
    - `TB-PRODUCTION-CONTEXT-DIGEST-v2`, `TB-TECHNICAL-RULESET-v2`, `TB-PROMPT-TEMPLATE-v1`, `TB-CANDIDATE-ARTIFACT-v1` and `PFC-YT-EMAIL-v1.1` are unchanged.
    - No stored run, prompt, candidate or digest is changed.
    - No code is changed.

## Consequences

- **One freshness model.** Validation, assessments and readiness share the P4D closure and digest. The prepared-document plan is bound through `artifactSha256` and its sources through the closure, as the frozen algorithm's single closure requires.
- **Operational cost, by design.**
  - Linking a planned document to the case, and any other context change, makes every assessment of the candidate stale.
  - The new ones may cite the earlier reviews.
  - Under the baseline, a context change after the prompt needs a new prompt and candidate for a clean technical state.
- **Version-only drift.** A candidate drafted from a prompt of an earlier wire release or digest definition validates REVIEW_REQUIRED (`CONTEXT.PROMPT_DRIFT`, change `IDENTIFIERS`; ADR-0006, ADR-0007). REVIEW_REQUIRED is not a mandatory re-draft. But under the baseline no such run is TECHNICAL_PASS, so such a candidate cannot reach READY_FOR_SIGNER without either a new prompt and candidate, or a future, separately accepted disposition or rebinding policy. That decision belongs to the readiness phase.
- **Superseded candidates** stay validatable (P4G V1). Their assessments can be recorded as history and never count.
- **R14-AUD-005** becomes DESIGN_PROPOSED_PENDING_INDEPENDENT_REVIEW, pending the independent review. CandidateAssessment stays NOT_STARTED and on hold until both prerequisites are resolved and a P4H mission is approved.

## Alternatives considered

- **Model B — an explicit, persisted plan-source evaluation identity.** Persist the effective plan-source state per run or per assessment:
  - the source, its exact revision and group;
  - the observed head;
  - the recorded hash;
  - the applicability result and case target;
  - a versioned evaluation fingerprint.

  It would let an outside-closure document count. It needs:
  - new columns or a new table, so a migration with no possible backfill: past states are not reconstructible, and runs without the field are ambiguous;
  - a wire change: the strict `ValidationRun`, `CaptureAssessment`, `CandidateAssessment` and `Readiness` schemas cannot gain fields additively under the release rules, so a new release, for `CaptureAssessment` a breaking one;
  - a historical read-back of the new identity;
  - a second, separately versioned evaluation definition with ADR-0007's obligations;
  - a second freshness identity that readiness must combine and audit next to the digest.

  It also duplicates the P4D applicability and owner machinery outside the closure. And it lets a candidate clear a document its drafting context never contained. The existing transient `planSourcesFingerprint` is not a reason to choose it. Rejected.
- **Allow a G6 assessment to waive `PLAN.SOURCE_IN_CONTEXT`.** The waiver would rest on state no epoch binds, which is exactly R14-AUD-005. INVARIANTS §2 step 6 forbids downgrading source-scope warnings to reach readiness. Rejected.
- **Put plan sources into the P4D closure automatically.** The plan is downstream of the context: a candidate is imported from a prompt of a context. Adding candidate records to the closure would change every context digest whenever a candidate is imported. That would couple unrelated candidates, and it would need a new digest definition. Rejected; a plan source enters the closure only through the case's own records (Decision 7).
- **Make PLAN.SOURCE_IN_CONTEXT a BLOCKER.** That changes a rule's severity, so it needs a new ruleset version. It also adds nothing to safety under Decision 2: REVIEW_REQUIRED that can never be waived blocks readiness just the same, and it still lets an operator see and record the situation. Rejected for now; a later ruleset may choose it.
- **Add `validationRunId` to CandidateAssessment.** A breaking change to a strict schema, not needed (Decision 12). Rejected.
- **Time-based staleness** (for example, an assessment older than N days). Not supported by the frozen rules (no universal stale-age rule). Rejected.
