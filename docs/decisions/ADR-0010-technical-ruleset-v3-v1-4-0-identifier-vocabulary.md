# ADR-0010 — TB-TECHNICAL-RULESET-v3 for the TB-SCHEMA-API-v1.4.0 internal-identifier vocabulary

Status: **ACCEPTED** — independent final engineering audit: **VERIFIED_WITH_LIMITS** at `3d432688a20266548447d71029830a4bbf85e38d`.
- The audit — the independent Astra re-audit of that exact target — recommended accepting `TB-TECHNICAL-RULESET-v3` for its reviewed engineering semantics.
- The operator accepted that recommendation on 2026-09-29 (mission TB_FINAL_ACCEPTANCE_CLOSEOUT_MERGE_AND_POST_MAIN_VERIFICATION).
- A bounded review of the accepted single-PC engineering scope: whole-critical coverage 73.18 %, the whole repository PARTIAL.
- **Unchanged by the acceptance:**
  - the 29-rule identity (24 deterministic, 5 heuristic);
  - the immutability of runs recorded as v1 or v2;
  - the pinned vocabulary;
  - the technical-only meaning — a TECHNICAL_PASS implies no G1–G7 decision, readiness or READY_FOR_SIGNER.
- `TB-TECHNICAL-RULESET-v3` is **ACCEPTED / ACTIVE**. The earlier status text is kept verbatim under "Acceptance history".
- Record: `docs/verification/final-audit/FINAL_ENGINEERING_AUDIT_CLOSEOUT.md`.

Related: ADR-0006 §8 (the technical ruleset identity, R14-AUD-003), ADR-0007 (the digest definition; its Decision 7 and the R14-AUD-013 vocabulary exception; R14-AUD-014), ADR-0008 (the assessment epoch, whose `rulesetVersion` this identifier fills), ADR-0009 (TB-SCHEMA-API-v1.4.0, whose activation requires this decision).
Acceptance boundary: an engineering identity decision about a technical ruleset. It is no legal review, no G1–G6 assessment, no readiness, no READY_FOR_SIGNER and no G7.

## Acceptance history

Kept as recorded. The independent review took place **after** the implementation, not before it.

1. **2026-09-28 — ACCEPTED_BY_OPERATOR · INDEPENDENT_REVIEW_DEFERRED**, with the activation of TB-SCHEMA-API-v1.4.0 by P4H (merged by pull request #12, merge commit `19a7cb2`). The status line then read:
   > Status: **ACCEPTED_BY_OPERATOR · INDEPENDENT_REVIEW_DEFERRED** — 2026-09-28, mission TB_P4H_CANDIDATE_ASSESSMENT_FAST_TRACK_IMPLEMENTATION (operator-authorized fast-track implementation). The independent Astra review of this decision was **deferred by the operator**; no independent review has taken place. This is self-verified engineering, not independent assurance.
2. **2026-09-29 — ACCEPTED.**
   - The independent Astra re-audit of `3d432688a20266548447d71029830a4bbf85e38d` recommended accepting `TB-TECHNICAL-RULESET-v3` and keeping the existing identifiers. Its reason: the readiness corrections of R14-AUD-015/016 change how immutable runs and assessments are consumed, not any technical rule's output, severity, kind or marker vocabulary.
   - The operator accepted the recommendation (mission TB_FINAL_ACCEPTANCE_CLOSEOUT_MERGE_AND_POST_MAIN_VERIFICATION).
   - The evidence listed at the end of this ADR is the implementer's own (self-verified). The re-audit's evidence is its own, outside this repository (`FINAL_ENGINEERING_AUDIT_CLOSEOUT.md` §2).

## Context

- `TB-TECHNICAL-RULESET-v2` (R14-AUD-003) pins the vocabulary of `MARKER.INTERNAL_IDENTIFIERS` in `INTERNAL_IDENTIFIER_STRINGS`, written out and never read from a constant that follows the active release. Its eight strings: `TB-PROMPT-TEMPLATE-v1`, `TB-CANDIDATE-ARTIFACT-v1`, `TB-PRODUCTION-CONTEXT-DIGEST-v1`, `TB-TECHNICAL-RULESET-v1`, `TB-TECHNICAL-RULESET-v2`, `TB-SCHEMA-API-v1.2.0`, `TB-SCHEMA-API-v1.3.0`, `PFC-YT-EMAIL-v1.1`.
- A unit test fails when an identifier the application uses is missing from the pinned vocabulary ("a later identifier needs a new ruleset version"). It names the active release, the PFC version, the prompt template, the candidate-artifact identifier and the ruleset itself.
- Activating **TB-SCHEMA-API-v1.4.0** (ADR-0009) makes `TB-SCHEMA-API-v1.4.0` an identifier the application emits: the header line "Wire contract: …" of every new prompt and a new prompt's `contractVersion`. A drafting tool may copy it into a candidate. v2 cannot detect it, and extending v2 would change what v2 detects under the same identifier — the defect R14-AUD-003 removed.
- By the operator's R14-AUD-013 decision (ADR-0007 §7), the digest definition identifier `TB-PRODUCTION-CONTEXT-DIGEST-v2` stayed outside v2's vocabulary: a documented bounded limitation (R14-AUD-014). The application never emits that literal itself, but captured or operator-supplied text can contain it.
- The previous ruleset-identity ambiguity is not to be repeated (mission §9): the activation records a new ruleset version, not an exception.

## Decision

1. **New runs record `TB-TECHNICAL-RULESET-v3`** (`TECHNICAL_RULESET_VERSION`, `apps/api/src/modules/validation/technical-ruleset.ts`). The web page names the same identifier (`validation.tsx`; a test pins them together).
2. **The rule inventory is unchanged.** The same 29 required rules (24 deterministic, 5 heuristic), with the same ids, check kinds, severities, run and report order, and the same result aggregation (ERROR > BLOCKED > REVIEW_REQUIRED > TECHNICAL_PASS; WARNING and INFO never change it). The coverage manifest keeps `semanticReviewRequired: true`.
3. **The one change: `MARKER.INTERNAL_IDENTIFIERS` gets a new explicitly pinned v3 vocabulary**, derived from v2's:
   - v2's eight strings, unchanged and in v2's order — nothing v2 detected is removed;
   - plus `TB-PRODUCTION-CONTEXT-DIGEST-v2` (the current digest definition: v3 no longer needs the R14-AUD-013 exception);
   - plus `TB-TECHNICAL-RULESET-v3` (the ruleset itself);
   - plus `TB-SCHEMA-API-v1.4.0` (the release activated with P4H).

   The vocabulary delta is exactly these three strings (eleven in total).
4. **Pinned, never derived.** The vocabulary is written out in the ruleset. It never reads `CONTRACT_BASELINE`, `PFC_SCHEMA_VERSION`, `PROMPT_TEMPLATE_VERSION` or `DEPENDENCY_DIGEST_ALGORITHM` (a unit test scans the source). A future identifier — for example a `TB-SCHEMA-API-v1.5.0`, a `TB-TECHNICAL-RULESET-v4` or a `TB-PRODUCTION-CONTEXT-DIGEST-v3` — is not part of v3 and needs a new ruleset version. A test replaces the active contract constant with a synthetic later release for its own module graph and shows v3 detects exactly the same strings.
5. **History is immutable.** Runs recorded as `TB-TECHNICAL-RULESET-v1` or `-v2` stay exactly as recorded: read back (`getValidationRun`), listed and replayed with their recorded identifier, never relabelled or re-executed. Only a new run executes v3.
6. **Boundary.** v3 is an implementation identifier of technical checks: not a wire-contract release, not a Production Form Contract version, not a legal or policy certification and not a G1–G6 review version. A TECHNICAL_PASS under v3 means exactly what it meant under v2. Technical validation is never G1–G6 review, legal approval, readiness, READY_FOR_SIGNER, a signature, G7 or permission to send.

## Consequences

- **The assessment epoch moves.** `rulesetVersion` is part of the epoch `E = (candidateId, artifactSha256, dependencyDigest, rulesetVersion)` (ADR-0008 Decision 3). A v2 run never matches the current epoch; `captureCandidateAssessment` requires a completed run with exactly the current epoch, so a candidate needs a new v3 run before an assessment can be recorded against it (422 `VALIDATION_RUN_REQUIRED` otherwise).
- **New detections.** A candidate whose subject or body contains `TB-SCHEMA-API-v1.4.0`, `TB-TECHNICAL-RULESET-v3` or `TB-PRODUCTION-CONTEXT-DIGEST-v2` gets one `MARKER.INTERNAL_IDENTIFIERS` REVIEW_REQUIRED finding under v3. R14-AUD-014's bounded limitation (the digest-v2 literal undetected) describes v2 runs only.
- **No other effect.** No wire, schema, migration, digest-definition, prompt-template or candidate-artifact change. The version change is not a change of meaning of any other rule: the documented `checks` text of every rule, with the vocabulary list masked, is byte-identical to v2's (a unit test pins its SHA-256, `62975f23…b7f7`, computed identically over the v2 code).

## Alternatives considered

- **Extend v2's vocabulary in place.** A silent change of what an existing identifier detects: exactly R14-AUD-003. Rejected.
- **Keep v2 and record an operator exception for `TB-SCHEMA-API-v1.4.0`** (the R14-AUD-013 pattern). The mission forbids repeating that ambiguity; it would leave the active release undetected. Rejected.
- **Derive the vocabulary from `CONTRACT_BASELINE`.** A later release would again change what the ruleset detects under an unchanged identifier (R14-AUD-003). Rejected.
- **Also add `TB-SCHEMA-API-v1.0.0` and `-v1.1.0`.** Neither is an identifier the application emits into prompt or candidate text today, and neither was in v1's or v2's vocabulary. Not needed for this delta; a later ruleset may add them. Not adopted.

## Evidence (self-verified)

- `tests/api/validation-rules.test.ts`: the pinned inventory (29 rules, kinds, order), the v2-derived golden vocabulary (eleven strings, the first eight v2's), each identifier one deterministic REVIEW_REQUIRED signal at its exact position, lookalikes and future identifiers undetected, every identifier the application uses (the digest definition included) in the vocabulary, the documented-rule identity with v2.
- `tests/api/validation-ruleset-identity.test.ts`: v3 under a synthetic active release detects exactly the same strings.
- `tests/db/p4g-http.test.ts`: new runs record v3 (the audit event too); a run recorded as v1 or v2 is read back, listed and replayed exactly as recorded.
- `tests/web/p4g.test.tsx`: the page names v3 for a new run and shows a recorded v1 or v2 run exactly as recorded.
