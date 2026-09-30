# TB-SCHEMA-API-v1.5.0

Additive optional-query release implemented for review under [ADR-0012](../../decisions/ADR-0012-operational-history-list-views.md). Not a final acceptance decision.

The accepted v1.4.0 release plus `amendment.json` adds `view=operational|history|all` to four GET lists: Routes, LegalSubjects, Mandates and an Owner's subjects. Omitted view means all; history is the operational predicate's complement. No schemas or operations are added/removed (291 schemas,145 operations). Every existing parameter and response is retained. GET-by-ID, writes and guards remain unchanged.

The UI requests operational explicitly. The server filters before LIMIT; cursors include the selected non-all view. See ADR-0012 for exact predicates and the existing conservative contract-version drift implications. No database data conversion, frozen history rewrite, readiness rule change, G7, signing or sending.
