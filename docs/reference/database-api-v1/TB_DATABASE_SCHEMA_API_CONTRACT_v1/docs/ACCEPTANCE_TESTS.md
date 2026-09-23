# Application acceptance scenarios — implementation required

These are requirements, not passed application tests. Offline contract checks are reported separately.

| ID | Area | Scenario | Expected |
|---|---|---|---|
| AC-001 | Directory | An Agency is created with displayName only | DRAFT saved; no authority inferred |
| AC-002 | Directory | An Owner is created without legal subject | Intake usable; drafting claimant unresolved |
| AC-003 | Directory | One legal entity operates two owner brands | One subject, two OwnerSubject rows |
| AC-004 | Directory | Individual and LLC share a brand | Separate subjects; no fact/authority merge |
| AC-005 | Directory | An established subject is changed to another legal entity | Reject generic PATCH; explicit new/corrected binding required |
| AC-006 | Directory | Signer is changed to another agency | Reject; preserve original capacity record |
| AC-007 | Route | Same Agency/OwnerSubject/platform linked twice concurrently | One unique relation; no duplicate rows |
| AC-008 | Route | Route default signer belongs to another Agency | Composite FK and service reject |
| AC-009 | Route | Unlink route with existing case history | Preserve all history; no revocation/send |
| AC-010 | Route | Relink route after expired mandate | Do not revive authority |
| AC-011 | Route | Unlink OwnerSubject with linked routes | Dependency conflict, no silent cascade |
| AC-012 | Authority | One instrument covers two subjects | One version, two scope-specific coverages |
| AC-013 | Authority | Coverage combines route from another Agency | FK and service reject |
| AC-014 | Authority | Only one coverage is revoked | Unrelated subject coverage preserved |
| AC-015 | Authority | Mandate has unknown expiry | Not automatically perpetual |
| AC-016 | Authority | Two scopes overlap | Require source-based explicit selection, no latest-file shortcut |
| AC-017 | Authority | Child edit races version freeze | One serialized outcome, no post-freeze mutation |
| AC-018 | Authority | New currentness event added while prompt generates | Consistent context or 412; no mixed snapshot |
| AC-019 | Case | Local case has no canonical ID | Preparation allowed; no invented sequential code |
| AC-020 | Case | Binding uses a route from another Agency/platform | Reject |
| AC-021 | Case | Established case moved after correspondence | Refuse generic reparenting; preserve history |
| AC-022 | Case | Case default signer changes after snapshot | Original selection/snapshot unchanged |
| AC-023 | Case | Same video appears in two agencies or subjects | Scoped overlap warning; no global unique block or automatic resend |
| AC-024 | Case | Work from Case A mapped to reported item in Case B | Composite FK reject |
| AC-025 | Case | One work occurs three times in one reported video | Three UseMappings retained |
| AC-026 | Case | Timecodes longer than 24 hours | Stored as unsigned milliseconds, not wrapped TIME |
| AC-027 | Case | Known end precedes start | Reject at API and DB CHECK |
| AC-028 | Facts | No permission finding is known | MISSING/UNKNOWN retained; no affirmative prose |
| AC-029 | Facts | Two fact successor requests race | One head; second conflicts, old fact unchanged |
| AC-030 | Facts | Fact links CaseSource from another Case | Service rejects transaction |
| AC-031 | Facts | Scanner-only AV record used as primary finding | No verification PASS; reference-only remains |
| AC-032 | Sources | Private source lacks applicable agency scope | Access/source binding refused |
| AC-033 | Sources | New source revision changes previously used support | Fresh digest changes; prior snapshot preserved |
| AC-034 | Sources | Source URL exists but was never read | No DOCUMENT_REVIEWED or source-access claim inferred |
| AC-035 | Correspondence | One actual message concerns multiple reported items | One Correspondence; multiple bindings, one transmission count |
| AC-036 | Correspondence | Same Message-ID but different capture/provider facts | No blind global merge; variants preserved |
| AC-037 | Correspondence | Quoted prior email pasted inside new body | No invented separate transmission |
| AC-038 | Correspondence | A removal applies to one of three URLs | Only that item changes observed outcome |
| AC-039 | Correspondence | Later reinstatement arrives | Append event; keep earlier removal history |
| AC-040 | Prompt | Same intent retried after lost response | Same idempotent snapshot result |
| AC-041 | Prompt | Same Idempotency-Key used on another case/payload | 409 IDEMPOTENCY_CONFLICT |
| AC-042 | Prompt | Reply parent from another case | Composite FK/service reject |
| AC-043 | Prompt | Reply missing previous AS_SENT capture | PREPARATION with limits, no fabricated prior notice |
| AC-044 | Candidate | Body changes by one space | New artifact; earlier validation not reused |
| AC-045 | Candidate | Recipient/subject/document plan changes without body change | artifactSha256 changes; readiness invalidated |
| AC-046 | Candidate | Signer name appears in identity block | Not automatically a signature violation |
| AC-047 | Candidate | Signature slot removed or completed | No unsigned final export; retain draft for correction |
| AC-048 | Candidate | Source prose includes hidden instructions | Treat as quoted data; do not execute/prompt-prioritize |
| AC-049 | Validation | Technical checks pass but no G1-G6 reviews exist | REVIEW_REQUIRED, not READY_FOR_SIGNER |
| AC-050 | Validation | A required rule was not executed | No technical pass |
| AC-051 | Validation | Two conflicting substantive assessments | CONFLICT until source-supported reconciliation |
| AC-052 | Validation | AI record fabricates an owner-controlled confirmation | Cannot satisfy source support; no readiness upgrade |
| AC-053 | Export | Current READY candidate with exact sources and G1-G6 | Unsigned export; HUMAN_PENDING; no send/G7 |
| AC-054 | Export | Revocation arrives before retry of earlier export | Recheck before replay; refuse stale READY content |
| AC-055 | Concurrency | Two tabs update row v7 | First succeeds; second 412; no overwrite |
| AC-056 | Concurrency | Audit insert fails after attempted business change | Rollback both |
| AC-057 | Security | No cookie, invalid CSRF or wrong Origin | 401/403 before mutation |
| AC-058 | Security | User attempts to PATCH signedAt/send/ready | Reject unknown field/absent route |
| AC-059 | Migration | Fresh MySQL8.4 migration and second-PC deploy | Same schema; no duplicated/regenerated migration |
| AC-060 | Recovery | Backup restored into disposable database | Readback retains hashes, links, snapshots, FK integrity |
