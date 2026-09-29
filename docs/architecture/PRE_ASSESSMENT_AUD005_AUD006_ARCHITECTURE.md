# Pre-assessment architecture — R14-AUD-005 and R14-AUD-006

Status: **PROPOSED — pending the independent Astra review of the pre-assessment architecture** (recommended mission TB_ASTRA_PRE_ASSESSMENT_AUD005_AUD006_ARCHITECTURE_REVIEW). Architecture and specification only.

> **Later status (recorded 2026-09-29 by mission TB_P4I_READINESS_AND_UNSIGNED_EXPORT_FAST_TRACK; the text below is unchanged).** ADR-0008 and ADR-0009 were accepted for implementation by the operator (**ACCEPTED_BY_OPERATOR · INDEPENDENT_REVIEW_DEFERRED**) and implemented by P4H, merged into `main` by pull request #12 (`19a7cb2`; `docs/verification/p4h/`). The readiness this record describes as a later phase (§6, Appendix B) is implemented by P4I under ADR-0011 (`docs/verification/p4i/`): derived on every read from the current captured records and never stored; where this design and ADR-0011 differ, ADR-0011 governs. Nothing here is independently verified: the independent review is deferred by the operator until the final whole-system audit.

| | |
|---|---|
| Mission | TB_PRE_ASSESSMENT_AUD005_AUD006_ARCHITECTURE (operator, 2026-09-28) |
| Branch | `feature/pre-assessment-aud005-aud006-architecture`, from the exact `main` `20367b92c1ff81415ffa639ddf238ccad1d6b218` (the R14 merge, pull request #11) |
| Decisions | ADR-0008, candidate assessment freshness: **PROPOSED**. ADR-0009, the AssessmentSource read-back: **PROPOSED** |
| Wire proposal | `docs/proposals/TB-SCHEMA-API-v1.4.0-assessment-support-readback.md`: **PROPOSED FUTURE DELTA ONLY, NOT ACTIVE** |
| Findings | R14-AUD-005 and R14-AUD-006: **DESIGN_PROPOSED_PENDING_INDEPENDENT_REVIEW** (not closed here) |
| CandidateAssessment | **NOT_STARTED**, on **HOLD**. `captureCandidateAssessment` and `listCandidateAssessments` stay unrouted |
| External action | **NONE**. Synthetic examples only; no real case data |
| Verification | `docs/verification/pre-assessment/PRE_ASSESSMENT_ARCHITECTURE_VERIFICATION.md` |

**Boundary.** This record designs and decides nothing legal. It is not:

- a G1–G6 review, a readiness evaluation or READY_FOR_SIGNER;
- an unsigned export, G7, a signature or permission to send;
- a CandidateAssessment implementation, a contract activation, a schema change or a migration.

Where the repository's specifications do not settle a legal policy, this record says `LEGAL_POLICY_REQUIRED` instead of inventing one.

Reading map: §1–§3 baseline and findings · §4–§6 flows · §7–§9 AUD-005 (model, transition matrix, epoch) · §10–§14 AUD-006 (read-back, wire delta, storage, history) · §15–§17 provenance, isolation, gates · §18–§20 sequencing, tests, non-goals · Appendices A–D: traceability, readiness preconditions, open decisions and observations, files reviewed.

## 1. Current baseline (verified 2026-09-28)

| Item | State |
|---|---|
| R14 | **PASS** (R14 final, operator, 2026-09-28). P4G **VERIFIED_COMPLETE**, **MERGED_TO_MAIN** (PR #11, merge commit `20367b9`); `main` CI run 36399587944 success (`P4G_TECHNICAL_VALIDATION.md` §40) |
| Wire contract | `TB-SCHEMA-API-v1.3.0` (ADR-0006, accepted with documented qualification): 289 schemas, 144 operations, 99 paths; `CONTRACT_BASELINE = 'TB-SCHEMA-API-v1.3.0'` (`packages/contracts/src/index.ts:15`) |
| Digest definition | `TB-PRODUCTION-CONTEXT-DIGEST-v2` (ADR-0007; `context-dependencies.ts:65`) |
| Technical ruleset | `TB-TECHNICAL-RULESET-v2` (`technical-ruleset.ts:65`); 29 required rules |
| Other identifiers | `TB-PROMPT-TEMPLATE-v1`, `TB-CANDIDATE-ARTIFACT-v1`, `PFC-YT-EMAIL-v1.1` (unchanged); `TB-SCHEMA-API-v1.0.0` the frozen reference |
| Routed | 134 business operations. Every assessment, readiness and export operation stays unrouted |
| Storage | One migration, `20260923103912_initial_schema`. It already holds `candidate_assessments` and `assessment_sources` (unused) |
| R14-AUD-005, -006 | FUTURE_ASSESSMENT_PREREQUISITE before this mission (they block CandidateAssessment implementation) |

## 2. R14-AUD-005 — exact statement

As the mission states it:

- A NoticeCandidate stores `preparedDocuments[]`: `sourceId`, `purpose`, `state`, `fileName`, `contentSha256`, `disclosureReview` and `limitations`. P4G reads those plan sources, and observes:
  - the exact SourceReference;
  - the current group head;
  - the recorded hash;
  - the current applicability;
  - the current case scope.
- P4G computes a transient `planSourcesFingerprint` to detect a change during validation. That identity is not persisted with the ValidationRun.
- A prepared-document source outside the P4D closure can therefore have current state that the candidate's `dependencyDigest` does not represent.
- The current mitigation, `PLAN.SOURCE_IN_CONTEXT` REVIEW_REQUIRED, is safe for current P4G.
- The future risk: CandidateAssessment or readiness could clear, reuse or rely on a review of that plan source without binding the exact state that was reviewed.

As recorded at R14: "a future plan-source freshness policy (plan sources outside the dependency closure)", FUTURE_REQUIREMENT, blocking assessment implementation (`CURRENT_STATE.md`, Astra table).

## 3. R14-AUD-006 — exact statement

- `CaptureAssessment` accepts `sources: AssessmentSupport[1..100]` of `{caseSourceId, supportedConclusion}` (`core.ts:2845–2877`).
- The storage has `CandidateAssessment` and the append-only `AssessmentSource {id, assessmentId, caseSourceId, supportedConclusion, createdAt, createdById}` (`schema.prisma:1244`, `:1276`).
- The contracted responses return the CandidateAssessment only:
  - `CaptureCandidateAssessmentResponse`;
  - `ListCandidateAssessmentsResponse` (`core.ts:4027`, `:4041`).
- No contracted read returns the AssessmentSource rows after a reload. The source-to-conclusion relation would be write-only for an API client. That is the read-back gap earlier fixed for FactSource (ADR-0005) and ValidationRun (ADR-0006), and it must be resolved before CandidateAssessment is routed.

## 4. Data-flow diagrams

**Current (P4F import → P4G validation):**

```text
importCandidate (P4F)
  └─ NoticeCandidate.preparedDocuments[]   exact sourceId revisions (any that applies to the case,
                                           not only the prompt's manifest — R13 decision 9);
                                           the plan is part of artifactSha256 (TB-CANDIDATE-ARTIFACT-v1)

validateCandidate (P4G)
  capture — one REPEATABLE READ snapshot
  ├─ readContextRows(prompt scope) ─► ContextView { closure (dependencies), dependencyDigest (DIGEST-v2) }
  ├─ readPlanSources(plan)         ─► per source: exists · contentSha256 · headId · applicability(case)
  │                                   planSourcesFingerprint (transient)          ◄── not in the digest
  └─ evaluateCandidate (pure)       ─► PLAN.SOURCE_EXISTS / APPLIES / IN_CONTEXT / LATEST_REVISION /
                                       CONTENT_SHA256 / PREVIOUSLY_SUPPLIED, and the other 23 rules
  commit — one short SERIALIZABLE transaction
  ├─ lock case · same artifact (412) · rebuilt digest == evaluated (412)
  ├─ planSourcesFingerprint == captured (412 CONTEXT_CHANGED {preparedDocuments})
  └─ ValidationRun { artifactSha256, dependencyDigest, rulesetVersion, result, manifests }
                                           (the plan-source fingerprint is not stored)
```

**Future (design only; nothing below is implemented):**

```text
current epoch E = (candidateId, artifactSha256, digest(prompt scope), TECHNICAL_RULESET_VERSION)

captureCandidateAssessment (P4H)
  SERIALIZABLE: lock case → candidate, artifact (412) → rebuild digest of the prompt scope (412)
  → a completed ValidationRun of this candidate with exactly E exists (422)
  → supports: exist · this case · LINKED (· PASS: the source applies now) → CandidateAssessment {E}
  → AssessmentSource rows (ids ascending in request order) → redacted audit → idempotency record

getCandidateAssessmentSources (TB-SCHEMA-API-v1.4.0, proposed, inactive)
  → the exact stored AssessmentSource rows of one assessment of this candidate, (createdAt, id) ASC

readiness (a later phase)
  recompute E → run(E) TECHNICAL_PASS, every rule executed (baseline) → G1…G6 heads at E:
  PASS + SCOPE_CONFIRMED_FOR_CANDIDATE, one head each, non-compensatory → G7 HUMAN_PENDING,
  externalAction PROHIBITED
```

## 5. Plan-source current flow (code trace)

1. **Import** (`candidates.service.ts`, `candidate-rules.ts`).
   - Each plan source must apply to the case under `source-scope.ts`, target Case.
   - A hash only as recorded on the revision; PREVIOUSLY_SUPPLIED only as recorded by a prior transmission of the prompt's context.
   - The plan is stored exactly and hashed into `artifactSha256`.
   - A source outside the prompt's context is accepted when it applies. `tests/db/p4g-http.test.ts:1221` imports a plan naming an agency source that is not linked to the case.
2. **Capture** (`validation.service.ts:170–240`).
   - `readContextRows` of the prompt's scope (`validation-scope.ts:17`) and `readPlanSources` (`validation-inputs.ts:29–79`) run in the same REPEATABLE READ snapshot.
   - `readPlanSources` reads, per distinct `sourceId`:
     - the row: its agency, scope bindings and `contentSha256`;
     - every revision of its group, to find the head;
     - `applicabilityProblem(tx, row, caseTarget(caseRow))`: the recorded scope, then the owner dimension.
3. **Rules** (`technical-ruleset.ts:755–930`).
   - `PLAN.SOURCE_EXISTS`: BLOCKER if missing.
   - `PLAN.SOURCE_APPLIES`: BLOCKER with `{sourceId, code, reason?, ownerId?}`.
   - `PLAN.SOURCE_IN_CONTEXT`: REVIEW_REQUIRED if the id is not a `SourceReference` dependency of the evaluated context.
   - `PLAN.SOURCE_LATEST_REVISION`: REVIEW_REQUIRED, naming `latestRevisionId`.
   - `PLAN.CONTENT_SHA256`: BLOCKER.
   - `PLAN.PREVIOUSLY_SUPPLIED`: BLOCKER or REVIEW_REQUIRED from the evaluated context's prior messages.
4. **Commit** (`validation.service.ts:243–345`).
   - The digest is rebuilt and compared.
   - The plan sources are read again and `planSourcesFingerprint` compared (412 `{field: preparedDocuments}`). `tests/db/p4g-http.test.ts:1221` revises the outside source during a run and gets exactly this 412.
   - The run stores `dependencyDigest = view.dependencyDigest`: the P4D digest only.
5. **The same applicability function.** The P4D context evaluates every listed source with the same `applicabilityProblem` (`context-sources.ts:307–317`), against the target built from the same case, route and association (`context-snapshot.ts:218–227`; `caseTarget` / `caseTargetWith`, `case-rules.ts:63–85`).
6. **What the digest covers of a source** (`context-dependencies.ts:295–309`):
   - its semantic view, including `agencyId`, `scopeBindings`, `contentSha256`, `sourceGroupId` and `revision`;
   - `headId`: the head of its group;
   - `otherOwnerMaterial: true` when the applicability problem is `CROSS_OWNER_REFERENCE`.

   The recorded-scope part of applicability follows from closure records: the source, the CaseRecord (`agencyId`, `routeId`, `contextRevision`; `:108–122`), the Route and the OwnerSubject. The dependency list itself is in the digest (`:334–353`).
7. **Closure membership of case sources** (`context-snapshot.ts:467–494`).
   - Every LINKED link of the case is included, plus any link a current fact revision's support names, whatever its state.
   - A link-state change moves the case's `contextRevision` (`case-sources.service.ts:13–18`), which is in the CaseRecord fingerprint.

## 6. Assessment future flow (design; P4H is not started)

- **Capture** records one attributable G1–G6 review of one exact candidate, bound to the current epoch (§9). Its sources are LINKED case sources of the candidate's case (§16).
- It never:
  - creates or changes a ValidationRun;
  - changes the candidate, a fact, a source or the case context;
  - derives readiness.
- The case row is locked and not changed. `rowVersion` and `contextRevision` do not move: an assessment is downstream of the context, like a candidate or a run. An assessment is never part of the dependency closure: that would make the digest depend on the records that bind the digest.
- **Read-back:**
  - `listCandidateAssessments`, the frozen paginated list, gives the assessment rows;
  - `getCandidateAssessmentSources` (ADR-0009; TB-SCHEMA-API-v1.4.0, proposed) gives each assessment's exact support rows;
  - `getValidationRun` gives the run of the same epoch, whose stored evaluated context and dependency manifest document the context the assessment was bound to.
- **Readiness** (a later phase) derives its status from the current epoch, the epoch's run and the six gates' heads (Appendix B). It is never stored.

## 7. AUD-005 — Model A and Model B, and the selection

### 7.1 Comparison

| Aspect | Model A — closure-only clearance | Model B — explicit plan-evaluation identity |
|---|---|---|
| **Safety invariant** | A plan source counts toward clearance only while it is inside the dependency closure of the candidate's current context. `PLAN.SOURCE_IN_CONTEXT` REVIEW_REQUIRED is non-waivable. The epoch `E = (candidateId, artifactSha256, dependencyDigest, rulesetVersion)` then binds every PLAN rule input | A plan source outside the closure may count if the effective plan-source state `P` is persisted and bound: every assessment and readiness decision would carry `E` plus `P`, and staleness would compare both |
| **Current data required** | Already stored: the candidate (plan, `artifactSha256`), the run (digest, ruleset), the P4D closure | The same, plus per plan source: id, group, observed head, recorded hash, applicability result, case target, and a versioned fingerprint |
| **New persistence** | None | New columns on `validation_runs` and `candidate_assessments`, or a new table |
| **Wire change** | None for AUD-005 | Yes. `ValidationRun`, `CaptureAssessment`, `CandidateAssessment` and `Readiness` are strict frozen schemas, so a field cannot be added under the release rules. That means a new release, breaking for `CaptureAssessment` (a new required expectation), or new operations |
| **Migration** | No | Yes. No backfill is possible (past plan-source state is not reconstructible), and runs without `P` are ambiguous |
| **Race safety** | Existing: validation rechecks the digest and the plan fingerprint at a SERIALIZABLE commit (412). Capture and readiness rebuild the digest in their own SERIALIZABLE, case-locked transaction (INVARIANTS §5) | Capture and readiness would also re-read plan sources outside the closure, including the owner-dimension queries, under SERIALIZABLE: a second lock and read surface |
| **Post-review drift** | Any change to an in-closure plan source's head, recorded-scope applicability, owner applicability or closure membership changes the digest, so `E` changes and everything bound to the old `E` is stale. Changes to an outside source are not detected, and are irrelevant: its epoch can never count | Drift of `P` is detected only as long as `P`'s definition captures every input. It needs ADR-0007's versioning discipline a second time |
| **Historical reconstruction** | The assessment's epoch, its support rows (ADR-0009) and the run of the same epoch (`getValidationRun`: evaluated context and dependency manifest) | As A, plus a new read-back of `P` (another contract release) |
| **ValidationRun** | Unchanged. The run's stored digest is the epoch's digest | Gains `P` (schema, wire, migration) |
| **CandidateAssessment** | Its existing `artifactSha256`, `dependencyDigest` and `rulesetVersion` suffice (with `candidateId`) | Needs a field for `P`, and so a breaking `CaptureAssessment` change |
| **Readiness** | One epoch (ReadinessSchema already reports one triple and one run) | Two identities to evaluate and report. `Readiness` has no field for `P` |
| **Superseded candidates** | SUPERSEDED first; nothing counts; records kept | Same |
| **SourceReference revisions** | The plan names an exact revision, never re-pointed. A revision is immutable; its `contentSha256` never changes | Same |
| **Source head changes** | In closure: `headId` is in the fingerprint, so the digest changes | Detected via `P`'s head field |
| **Scope changes** | Recorded scope depends on the case's route and association (closure records); a route correction is refused once history exists | Must replicate the case-target evaluation in `P` |
| **`otherOwnerMaterial`** | Carried by the in-closure source's fingerprint (R14-AUD-010) | Must replicate the owner-dimension queries outside the closure |
| **CaseSource link state** | A LINKED link is in the closure. Pausing or unlinking removes it, unless a fact support cites it, where its fingerprint changes. Either way the digest changes | Link state is irrelevant to `P` unless added. A plan could clear through a source the case no longer links |
| **Audit complexity** | None new: the epoch triple is already stored on runs and assessments | Two identities per epoch, and their definitions, to audit and display |
| **Failure modes** | Operator does not link: REVIEW_REQUIRED stays, visible and safe. Linking makes assessments stale: re-record, citing earlier reviews. A later rule reading a non-fingerprinted input would reopen the gap: guarded by Decision 11 and test AUD-005-G | `P` and the digest disagree. `P`'s semantics change silently (the R14-AUD-013 pattern). Missing `P` on old rows. A document the drafting context never contained clears |

### 7.2 Selection: **Model A** (ADR-0008)

- **The proof obligation is met** (§5 items 5–7 and ADR-0008 Decision 4). For a plan source inside the closure, every PLAN rule input is a function of fingerprints the digest covers.
  - The single unfingerprinted value is the identity of the other owner that `PLAN.SOURCE_APPLIES` copies into its details. It never changes a rule result.
  - Evidence that each transition changes the digest: `tests/db/p4g-http.test.ts:1154` (a source head and a case-source link state each stale a reviewed digest) and `:2068` (another owner's later use changes the digest with the revision unchanged).
- **The frozen algorithm has one closure** containing the prepared-document plan (INVARIANTS §2 step 2). Model A realizes it without a second identity.
- **Model B's only benefit** — clearing a document the case context does not contain — is also its weakness: the draft would clear with a document its drafting context never included.
- **Model A never permanently blocks a legitimate document.** A source that applies to the case can always be linked, and the link rules are the `PLAN.SOURCE_APPLIES` rules.
- The decision is not taken because A is simpler; the proof above is what decides it.

## 8. Plan-source freshness transition matrix

- **Columns.**
  - A: `artifactSha256` changes?
  - D: the current `dependencyDigest` of the prompt scope changes?
  - V: a run recorded before is stale (its epoch ≠ the current one)?
  - S: an assessment bound to the earlier epoch is stale?
  - R: a READY view derived before can no longer be derived? (Readiness is never stored.)
  - H: stored runs, assessments, candidates, sources and links stay unchanged as history?
- **"n/a"** means the transition cannot happen as stated. Evidence cites current code and tests; P4H and readiness items are design.

| # | Transition (after a run or assessment at epoch E0) | A | D | V | S | R | H | Evidence and notes |
|---|---|---|---|---|---|---|---|---|
| 1 | A plan source **outside** the closure changes (newer head, or another owner's material) | No | **No** | No: undetected | No: same epoch | No change: it was never READY, because `PLAN.SOURCE_IN_CONTEXT` REVIEW_REQUIRED is non-waivable (ADR-0008 D2) | Yes | This is AUD-005 itself. `validation-inputs.ts:1–7`. The digest excludes the source; `planSourcesFingerprint` protects only one run's capture-to-commit window (`p4g-http.test.ts:1221`) |
| 2 | The plan source **enters** the closure (a LINKED link, or any other citation) | No | Yes | Yes | Yes | Yes: re-derive. The next run of the same candidate has `CONTEXT.PROMPT_DRIFT` REVIEW_REQUIRED (P4G V7), so the baseline needs a new prompt and candidate | Yes | New CaseSource and SourceReference dependencies; a link moves `contextRevision` (`case-sources.service.ts:6–8`) |
| 3 | A newer revision becomes the group head of an **in-closure** plan source | No: the plan keeps its exact revision | Yes | Yes | Yes | Yes | Yes | `headId` in the fingerprint (`context-dependencies.ts:306`). Next run: `PLAN.SOURCE_LATEST_REVISION` REVIEW_REQUIRED, nothing re-pointed (`p4g-http.test.ts:1154`, `validation-rules.test.ts:842`) |
| 3′ | The same for an **outside** plan source | No | No | No | No | No change: never READY | Yes | As row 1 |
| 4 | The source's recorded scope stops applying to the case | No | Yes, if it can happen | Yes | Yes | Yes | Yes | A revision's agency and scope bindings are immutable and the case's agency is fixed, so this reduces to row 5 (route) or row 6 (owner). A case-scoped source's case ids are immutable |
| 5 | The case's route or subject changes | No | Yes | Yes | Yes | Yes | Yes | A **correction** is refused once the case is history-bearing (a prompt or candidate makes it so): 409 `BINDING_CORRECTION_REQUIRES_RECONCILIATION` (`cases.service.ts:438–446`, `case-rules.ts:219–229`). A **first** binding stays allowed, but only a PREPARATION prompt can exist without a route (DRAFTING needs `CASE_ROUTE_UNBOUND` resolved), and its candidate is a deterministic BLOCKER (P4G V6). If it happens: `routeId` and `contextRevision` move |
| 6 | An in-closure plan source becomes **another owner's** material | No | Yes | Yes | Yes | Yes | Yes | `otherOwnerMaterial: true` (R14-AUD-010; `p4g-http.test.ts:2068`). The context lists `SOURCE_NOT_APPLICABLE` (`CROSS_OWNER_REFERENCE`); the next run has `PLAN.SOURCE_APPLIES` BLOCKER and `CONTEXT.CONFLICTS` REVIEW_REQUIRED. For an outside source: as row 1 |
| 7 | A CaseSource link goes LINKED → PAUSED | No | Yes | Yes | Yes | Yes | Yes | The only path: the link and its source leave the closure (`context-snapshot.ts:482–484`), and the next run has `PLAN.SOURCE_IN_CONTEXT` REVIEW_REQUIRED (non-waivable). Cited by a fact support: it stays, with `linkState` PAUSED in its fingerprint (`:276–283`). `contextRevision` moves either way |
| 8 | A CaseSource link goes LINKED → UNLINKED | No | Yes | Yes | Yes | Yes | Yes | As row 7. The link row and every historical support row (FactSource, AssessmentSource) stay unchanged |
| 9 | A selected authority or correspondence citation stops being current or applicable | No | Yes, or the scope becomes unreadable | Yes | Yes | Yes | Yes | New authority event; successor version or coverage; the source's other-owner use (all in fingerprints). A corrected selected binding makes the scope unreadable: validation 412 (P4G V3), and readiness has no current epoch |
| 10 | The DocumentPlan's `sourceId` changes | Yes: a **new candidate** | n/a | n/a | n/a | The new candidate starts with no run | Yes | Candidates are immutable. A new plan is a new candidate (revision or import) with a new id and artifact. The earlier candidate keeps its own epoch and records, and is not superseded by the revision (R13 decision 10). Nothing transfers |
| 11 | The DocumentPlan's `contentSha256` changes | Yes: a new candidate | n/a | n/a | n/a | As row 10 | Yes | `contentSha256` is part of the artifact object |
| 12 | The candidate is revised | Yes, usually. Identical content gives the same hash but another `candidateId` | n/a | n/a | n/a | As row 10 | Yes | `candidateId` is in the epoch. The same artifact in two candidates shares no run (`p4g-http.test.ts:2906`) |
| 13 | The candidate is superseded | No | No | Not stale, but **SUPERSEDED** | Not stale, but SUPERSEDED | Yes: SUPERSEDED dominates | Yes | Candidates are not in the closure. Readiness step 1 (INVARIANTS §2). Validation of a superseded candidate stays allowed as history (P4G V1) |
| 14 | The digest definition changes (for example to v3) | No | Yes: algorithm in the preimage | Yes | Yes | Yes | Yes | ADR-0007 Decisions 1, 3, 4. Stored digests are never recomputed |
| 15 | `CONTRACT_BASELINE` changes (for example the v1.4.0 activation) | No | Yes: contract in the preimage | Yes | Yes | Yes | Yes | Plus version-only `CONTEXT.PROMPT_DRIFT` REVIEW_REQUIRED for candidates of earlier-release prompts (ADR-0006), and a new ruleset version (row 16), because v2's pinned vocabulary lacks the new release identifier (`validation-rules.test.ts`, "a later identifier needs a new ruleset version") |
| 16 | The technical ruleset changes (v2 → v3) | No | No | Yes: not the current ruleset | Yes: `rulesetVersion` in the epoch | Yes | Yes | ADR-0006 §8. v2 runs stay v2 |
| 17 | Time passes with no record change | No | No | No | No | Only by time-dependent currentness that readiness evaluates at its instant (INVARIANTS §2 step 8); no stale-age rule | Yes | Out of AUD-005's scope; readiness phase |
| 18 | An in-closure plan source's only path is a fact support through a PAUSED or UNLINKED link | No | Its state is bound | — | — | — | Yes | Freshness is bound, and `PLAN.SOURCE_IN_CONTEXT` passes. Whether planning that document is appropriate is a G6 (artifact QA) question, not freshness (Appendix C, O-3) |

## 9. The assessment epoch

- **Definition** (ADR-0008 Decision 3): `E = (candidateId, artifactSha256, dependencyDigest, rulesetVersion)`, computed by the server for the candidate's prompt scope in one consistent snapshot. A scope that cannot be read has no epoch.
- **The questions of mission §13:**
  - **Must a counted assessment match the candidate's `artifactSha256`?** Yes. It is constant per candidate, and equality is still checked at capture (412) and at readiness (integrity).
  - **Must it match the current `dependencyDigest`?** Yes: the current digest of the candidate's prompt scope (INVARIANTS §2 steps 2 and 5).
  - **Must `rulesetVersion` correspond to a real ValidationRun of the same artifact and digest?** Yes.
    - At capture: `rulesetVersion` equals the current ruleset identifier, and a completed run of this candidate with exactly `(artifactSha256, dependencyDigest, rulesetVersion)` exists. Otherwise 422, for example `VALIDATION_RUN_REQUIRED`.
    - At readiness: the counted run has exactly `E`.
    - An arbitrary or unevaluated ruleset string is never recorded.
    - The reason `rulesetVersion` is stored: INVARIANTS §2 step 4 and the `Readiness` schema bind a single technical evaluation epoch. G6 reviews the run's issues, and those depend on the ruleset.
  - **Can several assessments bind the same epoch?** Yes. All six gates bind the same epoch. One gate may have several assessments at one epoch: successors, or unresolved concurrent conclusions, which are CONFLICT.
  - **What makes an old assessment stale?** Its epoch ≠ the current epoch (the stale rules below). Staleness is derived, never stored.
  - **Does superseding an assessment alter history?** No. It changes selection only (ADR-0008 Decision 13).
- **No mixing across epochs (mission §14), proved against the frozen intent.**
  - INVARIANTS §2 requires:
    - one current closure (step 2);
    - one run matched to exact `artifactSha256` + `dependencyDigest` + currently applicable `rulesetVersion` (step 4);
    - each gate's assessment with "exact artifact/dependency binding" (step 5).
  - `ReadinessSchema` (`core.ts:2899`) reports a single `candidateId`, `artifactSha256`, `dependencyDigest`, `rulesetVersion` and `validationRunId`, with six `gates[].assessmentId`. A readiness mixing a G1 assessment of epoch A with G2–G6 of epoch B would report a triple that is false for some gate.
  - So the counted run and all counted assessments bind exactly the current `E`.
  - The existing contract expresses this identity fully (`CandidateAssessment` has `candidateId`, `artifactSha256`, `dependencyDigest` and `rulesetVersion`). **No CONTRACT_GAP.**
- **Exact stale-assessment rules** (for readiness):
  - S1: the assessment's `candidateId` ≠ this candidate → never considered: another candidate's record.
  - S2: its `artifactSha256` ≠ the candidate's → an integrity breach. Capture prevents it; readiness refuses to count it.
  - S3: its `dependencyDigest` ≠ the current digest of the prompt scope → STALE.
  - S4: its `rulesetVersion` ≠ the current ruleset identifier → STALE.
  - S5: no completed run of the candidate with exactly `E` → the assessment is not stale, but nothing counts: readiness STALE_REVALIDATION_REQUIRED, or UNVALIDATED without any run.
  - S6: it has a successor → not current (history).
  - S7: the candidate is superseded → SUPERSEDED; nothing counts.
  - S8: the scope cannot be read → no current epoch; nothing counts.
  - No time-based rule.
- **`validationRunId` (mission §36): not needed on CandidateAssessment.**
  - Several runs of the same `(candidateId, artifactSha256, dependencyDigest, rulesetVersion)` can exist, since validation can be repeated.
  - Under Model A the epoch determines each countable run's content: the ruleset is pure, `candidateId` fixes the prompt, and every plan input is in the closure. Only a runtime ERROR differs.
  - Readiness uses the most recently recorded run of `E` and names it (`Readiness.validationRunId`). Disagreeing runs of one epoch are a reason not to be ready.
  - `ExportUnsigned.validationRunId` already names the exact run of the handoff.
  - Across candidates, identical triples are disambiguated by `candidateId`.
  - Not a CONTRACT_OR_SCHEMA_GAP. A future issue-disposition mechanism would need exact issue and run references, as part of its own gap (ADR-0008 Decision 9).
- **`scopeState`** (mission §34) — ADR-0008 Decision 14:
  - `SCOPE_CONFIRMED_FOR_CANDIDATE`: the operator genuinely checked applicability to this exact candidate and epoch. Required for counting.
  - `RECORDED_NOT_ADOPTED`: recorded as reported, no such confirmation.
  - Neither is G7, a signature, legal approval or evidence. The word "ADOPTED" is a design note, not a defect; there is no rename.
- **Supersession** (mission §33) — ADR-0008 Decision 13:
  - no deletion;
  - the predecessor's rows stay;
  - the successor has its own supports;
  - nothing inherited;
  - readiness selects heads by explicit rules;
  - a file name, status or label proves no adoption.
  - Whether a successor may name a predecessor of an earlier epoch is an open decision (Appendix C, D-2); the recommendation is yes, since staleness needs no supersession.
- **Technical-review override (mission §11)** — ADR-0008 Decision 9:
  - none exists or is designed;
  - baseline: READY_FOR_SIGNER requires the epoch's run to be TECHNICAL_PASS with every required rule executed;
  - `PLAN.SOURCE_IN_CONTEXT`, BLOCKERs, ERROR, NOT_EXECUTED and source-scope conflicts can never be waived.
  - The baseline was checked against PFC §9/§11 and INVARIANTS §2 step 7, which permit a future, separately designed, traceable disposition of other REVIEW_REQUIRED issues: the baseline is their conservative implementation.

## 10. AUD-006 — the selected read-back design

**Alternatives** (mission §17–§19):

| Design | Exact rows after reload | Complete and bounded | Additive only | Candidate/case isolation | Verdict |
|---|---|---|---|---|---|
| **`getCandidateAssessmentSources`** — `GET /candidates/{candidateId}/assessments/{id}/sources` → `{assessmentId, sources: AssessmentSource[1..100]}` | yes | yes: one response holds every row (capture allows at most 100) | yes: 1 operation, 2 schemas, 1 path | yes: the path's candidate | **Selected** (ADR-0009) |
| Global detail aggregate `GET /assessments/{id}` → `{assessment, sources}` | yes | yes | yes | no path scope: another candidate's assessment is reachable by id | Rejected: duplicates `CandidateAssessment` in a second semantic schema, and loses the candidate scope that `getCaseFactSources` established for support rows |
| Paginated `listAssessmentSources` (`limit`, `cursor`, `q`) | yes | split across pages; cursor state; `q` without meaning | yes | yes | Rejected: pagination for a set bounded at 100 invites hidden page loss (ADR-0005 §3 reasoning) |
| Embed `sources` in `CandidateAssessment` or `CaptureCandidateAssessmentResponse` | yes | yes | **no**: changes strict frozen schemas, breaking strict clients and the byte-identity rule | yes | Rejected (mission §23) |

- **The selection criteria are all met** (mission §18):
  - exact rows after a reload;
  - bounded completeness: 1–100 in one response;
  - no reconstruction from current CaseSource state;
  - candidate and case isolation;
  - no false currentness;
  - no legal conclusion;
  - deterministic order;
  - creator and time preserved;
  - `supportedConclusion` exact;
  - no hidden pagination loss;
  - rows stay visible after later CaseSource changes;
  - no breaking change.
- **Pagination (mission §19).** Capture accepts at most 100 supports, and the unique `(assessment_id, case_source_id)` key makes each row distinct. So one non-paginated aggregate truthfully guarantees completeness.
- **Bound 1..100, not 0..100.** The mission's candidate schema had 0..100. Capture requires at least one support (`minItems: 1`), and capture is the only writer: the frozen workflow imports even legacy findings through capture, per INVARIANTS §4. An empty list would falsely say "no support recorded". A stored assessment with no row is an integrity breach: a 500, never an empty answer. This differs on purpose from `CaseFactSourcesView` (0..100), where zero supports is legitimate. The inventory is unaffected.
- **Ordering (mission §20).** Ascending `(createdAt, id)`. It is storage-backed, deterministic, and independent of the current CaseSource state, source title, current revision and query order.
  - All rows of one assessment share the capture instant, so the order is by `id`.
  - P4H assigns the row ids ascending in the order of the request's `sources` (the reverse of P4G's descending issue ids), so the recorded order is also the submitted order.
  - The order carries no meaning: no rank or weight.
- **Wrong-scope behaviour (mission §21):**

| Case | Behaviour |
|---|---|
| Unknown candidate | 404 `NOT_FOUND` |
| Unknown assessment, or a malformed id | 404, the same answer |
| An assessment of another candidate, including another case's | 404, the same answer: no existence, count or id leaks |
| A stored support row whose CaseSource is of another case | 500 `INTERNAL`, never shown. The write path forbids it: INVARIANTS §3 "AssessmentSource links a CaseSource from the same Case", a service check, since the table has no `caseId` |
| More than 100 rows, or zero rows, on one assessment | 500, never a partial or empty answer |
| The row's CaseSource is now PAUSED or UNLINKED | The row is returned unchanged. The read never states a link state. A client reads the present state separately (`getCaseSource`) and shows it apart, as the current state and not the state at assessment time |
| No session | 401 (session security) |

- **Write/read round trip (mission §22).**
  - Capture with `sources = [{S1, C1}, {S2, C2}]`.
  - Then a full client reload: a new page and session state, with no client memory.
  - `listCandidateAssessments` gives the assessment's `id`, `gate`, `result`, `artifactSha256`, `dependencyDigest`, `rulesetVersion`, `createdAt` and `createdById`.
  - `getCandidateAssessmentSources(candidateId, id)` gives exactly two rows `{id, assessmentId, caseSourceId: S1, supportedConclusion: C1, createdAt, createdById}` and the same for S2, in request order.
  - No AuditEvent parsing, client memory, raw database access or present-state reconstruction is involved.

## 11. Proposed future wire delta (summary)

The exact delta is in `docs/proposals/TB-SCHEMA-API-v1.4.0-assessment-support-readback.md`.

- Base TB-SCHEMA-API-v1.3.0 (record `6b74c09a…1630`).
- One operation, `getCandidateAssessmentSources`: `GET /candidates/{candidateId}/assessments/{id}/sources`, tag `Assessment`, path parameters only, `200` `GetCandidateAssessmentSourcesResponse`, errors 400/401/403/404/409/413/422/429/500, session, `idempotentWrite: false`, `preconditionTarget: null`.
- Two schemas: `CandidateAssessmentSourcesView` and `GetCandidateAssessmentSourcesResponse`.
- One path.
- OpenAPI `info.version` 1.3.0 → 1.4.0.
- Expected future inventory: **291 schemas, 145 operations, 100 paths** (today 289 / 144 / 99; verified from the generated `openapi.json`: the path is new, `AssessmentSource` already exists).
- **Inactive:**
  - no contract source, generated artifact, `CONTRACT_BASELINE`, release record or test is changed or created;
  - no runtime returns the operation.

## 12. Existing storage sufficiency

- **`AssessmentSource`** (`schema.prisma:1276–1290`) stores exactly the historical fact A: "row X recorded `caseSourceId` Y supporting conclusion Z, at time T, by user U".
  - The unique key is `(assessment_id, case_source_id)`: one row per link per assessment.
  - Foreign keys use RESTRICT; `supported_conclusion` is LONGTEXT (capture bounds it at 8,000 code points).
  - No service path updates or deletes a row, and P4H must add none.
- **`CaseSource.sourceId` is immutable.**
  - Only `linkState` and `stateReason` change, through the link-state command (`case-sources.service.ts:52`); `useRole` and `scopeNote` are fixed at link time.
  - A SourceReference revision is immutable.
  - So `caseSourceId → sourceId → exact revision` resolves to the same revision forever. Nothing about the cited revision needs freezing.
- **Link state at assessment time.** Capture requires LINKED (mirroring the fact-support rule, `case-facts.service.ts:452–490`), so the state at capture is known without freezing it.
  - A later pause or unlink is the current interpretation B, read separately.
  - It also changes the digest (§8 rows 7–8), so the assessment's epoch is then visibly stale.
- **Source revision and head changes; scope drift through a newer revision.** The row names the link, and the link names its exact revision. A newer revision never re-points either. Its existence changes the digest when the source is in the closure (§8 row 3).
- **Case context changes.** The epoch digest binds the context the assessment was made against. The run of the same epoch stores that evaluated context and its dependency manifest (readable through `getValidationRun`), which fingerprints each CaseSource link, including its state.
  - Caveat: the evaluated `ProductionContext` lists source manifest entries, not link rows. The link states at the epoch are bound by fingerprint, not readable as text from the run.
  - The capture rule (LINKED) and the audit trail of link-state commands supply them.
- **Conclusion.** Exact read-back needs only the stored AssessmentSource rows. The historical fact A is never rebuilt from the current interpretation B.

## 13. Migration conclusion

**No migration is required** by either decision.

- `candidate_assessments` and `assessment_sources` exist in the initial migration with every field the designs use.
- No new column, index, constraint or backfill is needed.

Identified, not required:

- **O-4:** no composite foreign key ensures that an AssessmentSource's CaseSource is of the assessment's case. The table has no `case_id`, exactly like `fact_sources`; the service check and the read's integrity check (500) are the accepted pattern. A hardening column would be a migration and is not proposed.
- **O-5:** `supersedes_assessment_id` has no database check of the same candidate and gate. It is a P4H service check.

## 14. Historical semantics

- **Immutable history.** Assessments, their support rows, runs, prompts, candidates, source revisions and links are append-only or immutable as today. Nothing is re-pointed, re-evaluated, relabelled, merged or backfilled.
- **Reads return exactly what was recorded.** No read annotates a stored record with currentness: no "current", "stale", "valid" or present-day link state inside a historical response.
- **Staleness belongs to evaluation.** It is computed only by readiness, and later perhaps a separately contracted indicator, at its own instant.
- **Replays read back the stored record.** An idempotency replay of a capture reads the assessment back by id; its rows are unchanged.

## 15. Provenance rules (permanent)

- AssessmentSource existence ≠ DOCUMENT_REVIEWED. CaseSource existence ≠ DOCUMENT_REVIEWED. SourceReference existence ≠ DOCUMENT_REVIEWED.
- Citing a source in an assessment does not prove any of these:
  - ownership, authority or permission;
  - infringement or an exception result;
  - currentness;
  - the truth of `supportedConclusion`.
- `CandidateAssessment.provenance` is the assessment's own explicit provenance, stored exactly as supplied. It is never derived from, or upgraded by, its sources: OPERATOR_REPORTED or ANALYSIS never becomes DOCUMENT_REVIEWED through a source attachment.
- The permanent R6 DOCUMENT_REVIEWED rule applies: an actual human review, recorded only from an explicit human-entered fact.
- Whether capture must refuse DOCUMENT_REVIEWED from an `AI_ASSISTED` performer is an open P4H decision (Appendix C, D-4). The recommendation is to refuse it.

## 16. Case and owner isolation

- Every support names a CaseSource of the assessment's own case: 422 `CROSS_CASE_REFERENCE` at capture, and 500 at the read if a stored row ever breaks it.
- There is no cross-case support and no inheritance from another case, candidate or assessment.
- A shared SourceReference implies no reuse: support is always through this case's own link.
- **Owner dimension.** A PASS may rest only on sources that apply to the case in the capture snapshot (`applicabilityProblem` null: recorded scope and owner). Another owner's material never supports a PASS here: "No cross-owner support unless independently applicable through that Case".
- A non-PASS finding (HOLD, BLOCKED, MISSING, CONFLICT) may cite a LINKED link of this case whose source no longer applies. That records the problem truthfully, and it is not support for a positive conclusion. This is ADR-0009's capture rule, and an open point for the review (Appendix C, D-3).
- No source is transferred between copyright owners. Nothing is copied into another owner's records.
- Pages are rebuilt per candidate. Another candidate's assessment is shown like an unknown one.

## 17. Gate boundaries

- **G1–G6 are independent and non-compensatory.**
  - Each gate is PASS only by its own counted assessment.
  - Three or five PASS gates never compensate for one HOLD, MISSING, CONFLICT, BLOCKED or UNASSESSED gate.
  - No score, weighting or majority exists.
- **CandidateAssessment is G1–G6 substantive review capture.** Not G7.
- **G7** is the actual authorized human review, adoption, signature and sending act outside the application. AI cannot satisfy it.
  - No G7 schema, API, workflow, field or button is designed.
  - `signatureState` stays HUMAN_PENDING, and `externalAction` PROHIBITED.
- **TECHNICAL_PASS is not G1–G6**, and G6 (exact candidate artifact consistency, traceability and whole-artifact QA) is not personal adoption.

## 18. Future implementation sequencing

1. **Independent Astra review of this architecture** (recommended: TB_ASTRA_PRE_ASSESSMENT_AUD005_AUD006_ARCHITECTURE_REVIEW). It decides:
   - whether AUD-005 is closed by Model A;
   - whether the AUD-006 read is complete;
   - whether v1.4.0 is minimal and additive;
   - whether storage is sufficient;
   - whether a migration is needed;
   - whether CandidateAssessment may begin.
2. **The operator's decisions:**
   - ADR-0008 and ADR-0009;
   - the open decisions D-1…D-6 (Appendix C).
3. **P4H mission** (not authorized by this record), in order:
   - (a) the TB-SCHEMA-API-v1.4.0 release: amendment record, contract source, generation, parity tests and `CONTRACT_BASELINE`, together with the technical-ruleset decision the release forces (§8 rows 15–16; the proposal's activation consequences);
   - (b) capture, list and the sources read, under the ADR-0008 and ADR-0009 rules;
   - (c) the assessment UI (read-back from the server; the present link state shown apart; no readiness wording);
   - (d) the tests of §19 with negative controls; `smoke:p4h`; a browser pass;
   - (e) review gate R15.
4. **Readiness mission** (later). It must also decide:
   - the preconditions of Appendix B;
   - the time-dependent currentness evaluation;
   - version-only drift (a disposition or rebinding policy, or re-drafting);
   - whether any issue-disposition mechanism is introduced (a new ADR and release).
5. **Unsigned export mission** (later).

G7, signing, sending, mailbox and Drive writes never come.

## 19. Future acceptance test matrix (designed, not implemented)

Planned files:

- `tests/api/assessment-rules.test.ts` (pure rules);
- `tests/db/p4h-http.test.ts` (HTTP and database);
- `tests/contracts/release-v1-4-0.test.ts` (only when v1.4.0 is activated);
- `tests/web/p4h.test.tsx`;
- `scripts/local/p4h-smoke.ts`.

Each test must fail on its own assertion under a negative control that disables the protection it covers. All data is synthetic.

**AUD-005**

| ID | Scenario | Expected |
|---|---|---|
| AUD-005-A | A plan source outside the P4D closure. The run is REVIEW_REQUIRED by `PLAN.SOURCE_IN_CONTEXT`. G1–G6 all PASS with SCOPE_CONFIRMED at that epoch | Readiness is not READY_FOR_SIGNER (REVIEW_REQUIRED, naming `PLAN.SOURCE_IN_CONTEXT`). The run row is byte-identical before and after. No API accepts a waiver or disposition of it |
| AUD-005-B | The source enters the closure legitimately (a LINKED link) | The digest changes. The earlier run and assessments are stale. A new prompt, candidate and validation pass `PLAN.SOURCE_IN_CONTEXT` and record the current digest. Validating the old candidate reports `CONTEXT.PROMPT_DRIFT` REVIEW_REQUIRED |
| AUD-005-C | A newer revision of an in-closure plan source | The digest changes. Earlier assessments are stale (reason recorded), readiness is STALE_REVALIDATION_REQUIRED. The next run has `PLAN.SOURCE_LATEST_REVISION` REVIEW_REQUIRED, and the plan still names its revision |
| AUD-005-D | An in-closure plan source becomes another owner's material | The digest changes. The context lists `SOURCE_NOT_APPLICABLE`. The next run has `PLAN.SOURCE_APPLIES` BLOCKER. Earlier assessments are stale |
| AUD-005-E | A revised candidate with a different plan | A new id and `artifactSha256`. The parent's assessments never count for it; it starts UNVALIDATED. The parent's records are unchanged |
| AUD-005-F | The candidate is superseded | Its assessments are retained byte-identical and readable. Readiness is SUPERSEDED. None counts |
| AUD-005-G | Digest completeness (unit, per input) | For an in-closure plan source, mutating each PLAN input changes the digest: head, recorded-scope applicability through the route, owner applicability, closure membership. The only unfingerprinted value is the other owner's id in `PLAN.SOURCE_APPLIES` details, whose result is unchanged |
| AUD-005-H | Epoch mixing: G1 at E1, a context change, then G2–G6 at E2 | Not READY. G1 is reported stale |
| AUD-005-I | Capture binding | A wrong artifact → 412 `ARTIFACT_CHANGED`. A stale digest → 412 `CONTEXT_CHANGED`. A ruleset string that is not current, or with no run of exactly `E` → 422. Nothing is written and the claim is released |
| AUD-005-J | Truthful negatives | HOLD, BLOCKED, MISSING and CONFLICT are recordable on an epoch that cannot count, and read back exactly. They never count as PASS |
| AUD-005-K | No run mutation | Capturing any assessment leaves every ValidationRun and ValidationIssue row byte-identical |
| AUD-005-L | Two candidates with the same artifact | Runs and assessments never cross candidates |
| AUD-005-M | Non-compensation | Five PASS + one HOLD → not READY. Three PASS + three UNASSESSED → not READY |
| AUD-005-N | Same-epoch conflict | Two heads for one gate at `E` → CONFLICT. After an explicit successor, the successor alone counts |

**AUD-006**

| ID | Scenario | Expected |
|---|---|---|
| AUD-006-A | Capture with 2 supports, then a full reload | The list and `getCandidateAssessmentSources` recover the assessment's identity, S1→C1, S2→C2, `createdAt` and `createdById`, in request order. No audit parsing, client memory or database access |
| AUD-006-B | Exact bytes | `supportedConclusion` with CRLF, trailing spaces, combining marks, astral characters and 8,000 code points comes back byte-identical |
| AUD-006-C | A later LINKED → PAUSED | The row is unchanged and still listed. `getCaseSource` shows PAUSED separately |
| AUD-006-D | A later LINKED → UNLINKED | As C |
| AUD-006-E | Another candidate's assessment id in the path; an unknown candidate; a malformed id | 404 each, indistinguishable |
| AUD-006-F | A capture support naming another case's CaseSource | 422 `CROSS_CASE_REFERENCE`. No assessment, row, audit event or idempotency completion is written |
| AUD-006-G | A later source revision or head change | The row still names the same `caseSourceId`, the link still names its exact revision, and nothing is re-pointed |
| AUD-006-H | `sources: []`, more than 100, or a duplicate `caseSourceId` | 422 before any write (the contract bounds; the unique key checked before insert) |
| AUD-006-I | Integrity | A stored row naming another case's link (inserted directly in the test database), more than 100 rows, or zero rows → 500 with nothing leaked |
| AUD-006-J | Read-only | Repeated reads write nothing: no row, audit event, idempotency record, row version or context revision changes |
| AUD-006-K | Supersession | The successor has only its own rows. The predecessor's rows are unchanged. No merge |
| AUD-006-L | Release (at activation) | The amendment digest is pinned. The inventory is 291 / 145 / 100. Every earlier schema and operation is byte-identical. Three-way runtime parity. The placement is as recorded |
| AUD-006-M | Web | Supports shown from the server read after a reload. The present link state is labelled as present. Another candidate's assessment is shown like an unknown one. No "verified", "proven" or readiness wording |

## 20. Explicit non-goals

This mission does not:

- implement a CandidateAssessment service, controller, route, UI or supersession runtime;
- implement an AssessmentSource read;
- implement readiness, READY_FOR_SIGNER or the unsigned export;
- design or implement G7, signing, sending, email, Drive writes, uploader contact or platform action;
- activate a wire release, change `CONTRACT_BASELINE` or edit `packages/contracts/**`;
- generate OpenAPI or create an `amendment.json`;
- change the Prisma schema or add a migration;
- change the digest definition, the technical ruleset (no v3), the prompt template or the PFC;
- rewrite a stored record;
- decide a legal policy;
- use real case data;
- make an external request.

## Appendix A — Traceability matrix (mission §41)

| Requirement | Governing source | Existing implementation | Proposed invariant | Future location | Future test | Blocker if absent |
|---|---|---|---|---|---|---|
| AUD-005 | Astra R14-AUD-005; INVARIANTS §2 steps 2, 4–7 | `PLAN.SOURCE_IN_CONTEXT` REVIEW_REQUIRED; the transient `planSourcesFingerprint` | Model A; epoch `E`; no waiver (ADR-0008 D1–D5, D9) | P4H capture; readiness | AUD-005-A…N | CandidateAssessment and readiness could rest on unbound plan-source state |
| `PLAN.SOURCE_IN_CONTEXT` | ADR-0008 D2; INVARIANTS §2 step 6 | `technical-ruleset.ts:801` | Non-waivable; cleared only by a run where it reports nothing | readiness counting | AUD-005-A, -B | A waiver would clear unbound state |
| `PLAN.SOURCE_APPLIES` | `source-scope.ts`; PFC §12 | `technical-ruleset.ts:778` (BLOCKER) | Never downgraded; its inputs are bound by the digest for in-closure sources | readiness | AUD-005-D, -G | A plan source not applicable to the case could clear |
| Artifact freshness | INVARIANTS §6; PFC §8; DOMAIN_MODEL §14 | `artifactSha256` stored and recomputed (ARTIFACT rules) | `E.artifactSha256`; checked at capture (412) and readiness | capture; readiness | AUD-005-E, -I | An assessment of another artifact could count |
| Context digest freshness | ADR-0007; INVARIANTS §5 | `dependencyDigest` (DIGEST-v2); validation's 412 | `E.dependencyDigest` = the current digest of the prompt scope | capture (412); readiness | AUD-005-B, -C, -D, -H | A stale review could count |
| Source head freshness | P4D fingerprint `headId` | `context-dependencies.ts:306` | In closure: digest-bound; outside: never counts | — (existing) | AUD-005-C, -G | Newer revisions invisible to assessments |
| Scope freshness | `source-scope.ts`; P4A route rules | Recorded scope via closure records; route correction refused after history | Digest-bound (§8 rows 4–5) | — (existing) | AUD-005-G | A scope change unseen by an assessment |
| Other-owner freshness | R14-AUD-010 | `otherOwnerMaterial` in the fingerprint | Digest-bound; a PASS never rests on non-applicable sources (§16) | capture; readiness | AUD-005-D; AUD-006-F | Cross-owner material could support a PASS |
| Assessment stale detection | INVARIANTS §2 step 5; `ReadinessSchema` | none (unrouted) | Rules S1–S8 (§9); derived, never stored | readiness | AUD-005-C, -H, -N | Old PASS records could count |
| AUD-006 | Astra R14-AUD-006; ADR-0005/0006 precedent | none | Additive read (ADR-0009) | TB-SCHEMA-API-v1.4.0; P4H | AUD-006-A…M | Support rows write-only on the wire |
| AssessmentSource read-back | ADR-0009; INVARIANTS §3 | table exists; no operation returns it | `getCandidateAssessmentSources`, exact rows 1..100, `(createdAt, id)` | contract v1.4.0; P4H service | AUD-006-A, -B, -I, -J | Traceability broken after a reload |
| Case isolation | INVARIANTS §3, §4; CLAUDE.md case isolation | FactSource pattern (`case-facts.service.ts:452–490`) | Supports from this case only; path-scoped read; 404 alike | P4H capture and read | AUD-006-E, -F, -I | Cross-case support or leakage |
| Historical support | ADR-0005 historical pinning | FactSource read | Rows never re-pointed, hidden or annotated | P4H read and UI | AUD-006-C, -D, -G, -K | Present state rewriting history |
| G1–G6 | PFC §10; INVARIANTS §2 step 5 | none | Independent, non-compensatory; one head per gate at `E` | readiness | AUD-005-M, -N | Compensation or convenient-PASS selection |
| G7 separation | CLAUDE.md product boundary; PFC §7, §11 | `signatureState` HUMAN_PENDING constant; no send path | No G7 record or API; readiness literals | — | (existing guards) plus AUD-006-M wording | Adoption or sending implied by the app |

## Appendix B — Readiness preconditions (design only; READY_FOR_SIGNER is not decided here)

A future readiness evaluation must enforce at least the following, on every read, export and export replay (INVARIANTS §2; PFC §11):

1. **The candidate.** The user is authorized, and the exact candidate is loaded. If superseded → SUPERSEDED; no newer candidate is chosen.
2. **The current epoch `E`.** Computed in one consistent snapshot for the prompt scope. An unreadable scope (a corrected binding) → not ready.
3. **The prompt mode.** A PREPARATION prompt's candidate is never ready (the run is BLOCKED by `CONTEXT.GENERATION_MODE`).
4. **The run.** A completed run of the candidate with exactly `E`: the most recent one, named in the response.
   - None → UNVALIDATED (no run at all) or STALE_REVALIDATION_REQUIRED (runs, none of `E`).
   - Its result must be TECHNICAL_PASS with every required rule executed (baseline): ERROR, BLOCKED and REVIEW_REQUIRED are never ready.
   - `PLAN.SOURCE_IN_CONTEXT` and source-scope conflicts can never be resolved.
   - Disagreeing runs of `E` → not ready.
5. **The gates.** Each of G1–G6: exactly one head at `E` with PASS and SCOPE_CONFIRMED_FOR_CANDIDATE. Several heads → CONFLICT; none → UNASSESSED. No stale assessment counts. Non-compensatory.
6. **Time-dependent currentness.** What the gates reviewed is evaluated at the evaluation instant (INVARIANTS §2 step 8). This is designed by the readiness mission.
7. **The signature slot.** The pending slot exactly once: the run's rule.
8. **Constants.** G7 HUMAN_PENDING; `externalAction` PROHIBITED; nothing is signed, adopted or sent.

## Appendix C — Open decisions, warnings and observations

Open decisions for the independent review and the operator:

- **D-1 — Capture on a superseded candidate.**
  - Recommended: allowed and recorded as history, never counted, consistent with validation (P4G V1).
  - Alternative: 409.
  - Either way, it never counts.
- **D-2 — Cross-epoch supersession.** Recommended: a successor may name a predecessor of an earlier epoch, of the same candidate and gate, that is its chain's head. Staleness needs no supersession.
- **D-3 — Non-PASS citations of a source that no longer applies.**
  - Recommended: allowed for HOLD, BLOCKED, MISSING and CONFLICT, to record the problem; refused for PASS (ADR-0009 §6).
  - Alternative: refuse for every result. The cost: a truthful negative about that very document could not cite it.
- **D-4 — DOCUMENT_REVIEWED from an `AI_ASSISTED` performer.** Recommended: refuse it (the R6 rule: an actual human review). `LEGAL_POLICY_REQUIRED` only if the operator wants a documented external review to qualify differently.
- **D-5 — Support-less negative findings.** `CaptureAssessment.sources` requires at least one support, even for MISSING. A truthful MISSING cites the sources actually searched. Allowing none would be a contract change. This is a product question, not decided here.
- **D-6 — The G6 disposition of technical REVIEW_REQUIRED issues** (INVARIANTS §2 step 7).
  - Deferred to the readiness mission. It needs a new ADR and contract release.
  - It excludes `PLAN.SOURCE_IN_CONTEXT`, BLOCKERs, ERROR, NOT_EXECUTED and source-scope conflicts.
  - It also decides version-only drift.

Warnings:

- **W-1 — Activating TB-SCHEMA-API-v1.4.0 changes every current digest** (`CONTRACT_BASELINE` is in the preimage). Candidates of earlier prompts then validate REVIEW_REQUIRED (version-only drift), and the pinned vocabulary of `TB-TECHNICAL-RULESET-v2` lacks `TB-SCHEMA-API-v1.4.0`.
  - The unit test "a later identifier needs a new ruleset version" then fails until a new ruleset version or an explicit operator decision records it.
  - Activation belongs at the start of P4H, before any assessment exists.
- **W-2 — Under the baseline a candidate reaches TECHNICAL_PASS only when its prompt's context equals the current context** (no `CONTEXT.PROMPT_DRIFT`). Every context change after the prompt, including linking a planned document, means a new prompt and candidate, until D-6 decides otherwise.
- **W-3 — The recorded message of `PLAN.SOURCE_IN_CONTEXT` offers "or have its use reviewed".** Under ADR-0008 a review can be recorded but never clears it. The wording belongs to the v2 ruleset and is not changed here. Future UI copy must not present a review as clearing it.

Observations (outside AUD-005 and AUD-006; not changed; for the review to classify):

- **O-1 — `PLAN.SOURCE_APPLIES` stores the other owner's id** in its issue details (`{sourceId, ...scopeProblem}`, `technical-ruleset.ts:778–798`). The validation page shows the details JSON (`validation.tsx:669–673`). P4D's conflict deliberately names only the reason code (`context-assembly.ts:84–87`, `:456–466`). It is not a freshness matter; the review may classify it as backlog.
- **O-2 — `listCandidateAssessments`' `q` semantics are not yet designed** (P4H). The round trip does not depend on it.
- **O-3 — Row 18 of §8.** A plan source whose only closure path is a fact support through a paused or unlinked link counts as "in context". That is a G6 question; a later ruleset may flag it.
- **O-4, O-5** — §13.

## Appendix D — Files reviewed

- **Governing documents:**
  - `CLAUDE.md`, `docs/CURRENT_STATE.md`;
  - `docs/contracts/PRODUCTION_FORM_CONTRACT_v1.md`;
  - `docs/domain/DOMAIN_MODEL_v1.md` (§14–§17);
  - `docs/architecture/ARCHITECTURE_RESOLUTIONS_v1.md` (§0, AR-018, AR-024);
  - ADR-0004 (by reference), ADR-0005, ADR-0006, ADR-0007;
  - the P4D, P4E, P4F and P4G verification records (P4G §1.3 V1–V14, §7, §30, §36–§40);
  - the frozen `INVARIANTS.md` and `API_CONTRACT_v1.md`.
- **Contracts:**
  - `packages/contracts/src/api/schemas/core.ts` (the assessment, support, capture, readiness and export schemas);
  - `packages/contracts/src/api/schemas/production-bound.ts`;
  - `packages/contracts/src/production/pfc-youtube-email-v1_1/production-context.ts`;
  - `packages/contracts/src/api/operations.ts`;
  - the generated `openapi.json` (inventory);
  - `docs/contracts/TB-SCHEMA-API-v1.{2,3}.0/` (records).
- **Storage:** `apps/api/prisma/schema.prisma` and the initial migration's `candidate_assessments` and `assessment_sources`.
- **Code:**
  - `apps/api/src/modules/validation/{validation-inputs,validation.service,technical-ruleset,validation-scope}.ts`;
  - `apps/api/src/modules/production/{context-dependencies,context-snapshot,context-sources,context-assembly}.ts`;
  - `apps/api/src/modules/sources/source-scope.ts`;
  - `apps/api/src/modules/cases/{case-sources.service,case-facts.service,cases.service,case-rules}.ts`;
  - `apps/api/src/modules/candidates/**` (by reference);
  - `apps/web/src/app/cases/validation.tsx` (issue details).
- **Tests:**
  - `tests/api/validation-rules.test.ts` (the plan rules; the vocabulary and exception tests);
  - `tests/db/p4g-http.test.ts` (1154, 1221, 2068, 2799, 2906);
  - `tests/contracts/release.ts`;
  - `tests/tooling/gate-terminology.test.ts`.
- **Repository search:** `CandidateAssessment`, `AssessmentSource`, `AssessmentSupport`, `preparedDocuments`, `PLAN.SOURCE_IN_CONTEXT`, `PLAN.SOURCE_APPLIES`, `planSourcesFingerprint`, `readPlanSources`, `scopeState`, `SCOPE_CONFIRMED_FOR_CANDIDATE`, `READY_FOR_SIGNER`, `rulesetVersion`, `expectedDependencyDigest`.
