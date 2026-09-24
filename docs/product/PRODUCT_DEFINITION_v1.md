# TB Notice Production System — Product Definition v1

Release: **TB-ARCH-v1.0.0** · Date: **2026-09-23**
Status: **PROPOSED_BASELINE_FOR_READ_ONLY_REINSPECTION**
Machine contract compatibility: **TB-SCHEMA-API-v1.0.0**.
This specification does not authorize implementation or any legal/external action by itself.

## 1. Purpose and measurable value

Build the simplest internal application that reliably prepares a **case-specific, unsigned YouTube copyright notice or substantive reply**, using structured facts and attributable sources. Reduce repeated data entry, inconsistent party identification, stale context and avoidable reviewer questions. Do not optimize for bypassing abuse review or claim a hidden platform trust score.

The operator defines product decisions. ChatGPT supplies analysis/specifications/review. Claude Code is the selected implementation engineer. One active implementation writer works on a scoped branch at a time. Source code and engineering specifications are maintained in the private Git repository; canonical legal/evidentiary records remain in the authorized Google Drive.

## 2. Product boundary and final output

Software handoff ends at **READY_FOR_SIGNER**, a derived status for an exact unsigned candidate and current applicable context. The intended sender is also the intended human signer in this product workflow. This is a TB workflow rule, not a statement that all legal systems universally require the same arrangement.

The human independently reviews the exact text, adopts the representations, enters their full legal name as signature and sends outside this application. The app neither performs nor presumes these events. A signer name stored as identity is not a completed signature. The configured output signature slot remains `HUMAN_PENDING`.

A technical check passing is not the final handoff condition. Relevant G1–G6 assessments must actually exist, be attributable and apply to the exact artifact/context. G7 remains outside the application. Never create a UI action or generic PATCH that sets readiness to READY_FOR_SIGNER.

## 3. V1 capabilities

| Capability | Included behavior | Boundary |
|---|---|---|
| Directory | Agency, Owner, LegalSubject, OwnerSubject and Signer records | A record or relationship does not prove legal rights |
| Representation | Route; Mandate; draft/frozen versions; scope-specific coverage; signer scope; authority events | No inferred legal revocation from an unlink; no blanket rights from an LOA |
| Case workspace | Intake, sourced canonical binding, reported items, works, repeated-use mappings | No automatic canonical ID allocation; no automatic AV verification |
| Facts and sources | Scoped assertions, source references, provenance, limitations, revisions | Presence of a link is not source review |
| Correspondence | Capture or reference existing correspondence and exact thread/item bindings | No mailbox send API or inferred outcome |
| Prompt production | Deterministic INITIAL/NMI_REPLY context and immutable prompt snapshots | ChatGPT use is manual and external to the app; no AI API |
| Candidate production | Import exact draft, preserve revisions, technical runs, attributable assessments, current readiness and unsigned export | No signature, adoption, G7, transmission or AS_SENT creation from export |
| Operations | Audit, version conflicts, idempotency, source/candidate lineage | App audit is not independent legal evidence or tamper-proof storage |

## 4. Human actions must remain narrow

Reuse supported agency/owner-level records only within their actual scope. Do not routinely ask the owner to sign a new LOA or repeat an accepted review merely because the UI expects a field. Missing substantive facts go to the correctly scoped requirement/issue, not to cosmetic PASS. Routine copying, indexing, formatting, validation and filing should be tool-assisted when authorized tools are available.

Within this local MVP, adding a source is an explicit local operation; it does not edit or replace the canonical source. Currentness not captured into the app is not magically known. Show source observation dates and access limitations.

## 5. Canonical and engineering boundaries

| Information | Authority for this product |
|---|---|
| Executed instruments, accepted evidence, actual correspondence/AS_SENT/outcomes | Current canonical source in authorized Drive or actual source-backed capture |
| Operational working rows and local task state | App DB, explicitly classified as working data/projections |
| Exact prompt and candidate versions produced in app | App artifact records, with their real provenance |
| Code, migrations, engineering contracts and decisions | Git repository and approved release history |
| Chat summaries or AI-generated reports | Analysis/reference; never automatically evidence |

No production records are imported into Git fixtures. A private repository is not an evidentiary archive. Customer portals and agency-specific external access are not part of V1.

## 6. Out of scope

No signing service, G7 console, SMTP/IMAP integration, mail sending, automatic submission, retraction, counter-notice response, uploader contact, Drive writer, raw-media upload pipeline, Tool Quét verification, AI infringement decision, AI-provider API, billing, customer signup, SaaS tenancy, queues or distributed workflow engine.

Existing correspondence can be recorded to support a reply; that is not authorization to continue external correspondence. The product does not assert universal international compliance or guarantee platform acceptance, automated removal or absence of fraud questions. Necessary jurisdiction-specific legal analysis is scoped to the affected case/claim.

## 7. Local-first and growth

Both physical Windows PCs run a Linux development environment through WSL2 Ubuntu. Source, migrations, fixtures and specifications synchronize through Git. Local `.env`, passwords, Docker volumes and uncommitted work do not synchronize through Git. Each PC has an independent disposable development database.

P0 produces the foundation and database rehearsal. P1 adds authentication. Directory, representation, case workspace and production features follow in reviewed increments. Many agency/owner rows do not require microservices. Performance claims must be based on representative tests and measured query behavior, not speculative case-count guarantees.

## 8. Success criteria

The full product must demonstrate that supported context is reused without contamination, unknown facts stay unknown, immutable artifacts do not change retrospectively, and unsigned export refuses stale or unsupported handoff. Readiness cannot be purchased by checking a box, renaming a file FINAL, or creating a successful technical run.

P0 success is narrower: reproducible source/toolchain, actual local MySQL migration, structural tests, contracts parity, app shells and health. P0 success is not case readiness or production launch. See the phase-specific acceptance contract.

## 9. Navigation and sources

Read [Domain Model](../domain/DOMAIN_MODEL_v1.md), [Production Form Contract](../contracts/PRODUCTION_FORM_CONTRACT_v1.md), and [Architecture Resolutions](../architecture/ARCHITECTURE_RESOLUTIONS_v1.md).

Basis: the user's stated unsigned-output and local-first decisions; the attached Database/API release README and INVARIANTS; source lineage is recorded in [the pack source register](../architecture/SOURCE_REGISTER_v1.md). No real case has been opened, reassessed or mutated in preparing this specification.
