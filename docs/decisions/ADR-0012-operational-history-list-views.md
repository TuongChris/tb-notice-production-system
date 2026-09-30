# ADR-0012 — Explicit operational and historical list views

Status: PROPOSED / IMPLEMENTED_FOR_REVIEW. Operator authorized implementation through TB_OPERATIONAL_ONLY_DEFAULT_VIEWS_WITH_HISTORY_ACCESS; this PR does not record final acceptance.

## Decision

Add optional typed `view=operational|history|all` to listRoutes, listLegalSubjects, listMandates and listOwnerSubjects in TB-SCHEMA-API-v1.5.0. Omission means all, preserving existing API consumers and legacy unfiltered cursors. The UI defaults to operational and offers History / inactive and All. Direct GET-by-ID remains unchanged.

The server applies the chosen predicate before search, keyset pagination and LIMIT. Cursor fingerprints bind non-all views along with the existing search/agency/owner filters; switching UI view resets paging. History is the exact complement of operational within the queried list scope. No client filtering of a partial server page.

| List | Operational predicate |
|---|---|
| Routes | Route not archived and LINKED; exact OwnerSubject LINKED; LegalSubject not archived and INDIVIDUAL; Agency and Owner not archived |
| LegalSubjects | recordState is not ARCHIVED; no identity-type conversion or deletion |
| Mandates | archivedAt is null; no inspection of document text, subject names, or Coverage content |
| OwnerSubjects | linkState LINKED; exact LegalSubject not archived and INDIVIDUAL |

The individual-only policy is an operator's current workflow scope. Corporate Agencies remain valid, and mixed documentary Mandates stay visible when unarchived. Operational is not a finding of legal effectiveness, authority, evidence sufficiency, G1–G7 or readiness. Existing Case create/bind selectors request operational Routes; the server's Case and authority guards are unchanged. Existing bound-case history is read directly and is not erased by the list view.

## Version and compatibility

This is an additive optional-query release, not an unversioned edit to v1.4.0. No schema, response, write endpoint, migration or historical record changes. The operator separately authorized the required ruleset identifier update. Earlier amendment records stay byte-identical; composition tests reproduce their accepted hashes. The new amendment declares only four optional query additions and OpenAPI info.version.

CONTRACT_BASELINE becomes TB-SCHEMA-API-v1.5.0. The existing conservative identifier policy therefore changes newly computed dependency digests and new PromptSnapshot contractVersion; older previews require refresh, and historical prompts can trigger existing REVIEW_REQUIRED drift. This is not mandatory re-drafting. The digest algorithm/semantic identifier remains TB-PRODUCTION-CONTEXT-DIGEST-v2, the new pinned technical ruleset is TB-TECHNICAL-RULESET-v4, and all historical snapshots/runs stay unchanged. v4 retains all v3 identifiers and adds only TB-SCHEMA-API-v1.5.0 and its own TB-TECHNICAL-RULESET-v4 identifier; the same 29 rules, kinds, severity, order and aggregation remain. Existing freshness checks can require a new validation and G1–G6 assessment under the current epoch; this does not mandate re-drafting. Historical v1/v2/v3 runs remain readable and idempotently replayable without re-execution or relabelling. No readiness or authority evaluator is modified.

## Alternatives

Filtering the first client page is rejected because it would omit later operational records and misstate paging/search. Loading the entire directory into the browser for every view is unnecessary and unbounded. Silent default API filtering would break historical consumers. Deleting historical rows would violate the mission and frozen-record invariants.

## Validation

Real HTTP/MySQL synthetic tests exercise exact membership, complements, search, keyset pages, wrong-view cursor rejection, invalid view rejection, historical direct reads and no write side effects. Web tests exercise default/history/all, current owner relationships, Case selectors, direct history and paging reset. The verification record documents local checks and browser QA.
