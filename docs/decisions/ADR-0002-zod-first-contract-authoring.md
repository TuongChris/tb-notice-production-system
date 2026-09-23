# ADR-0002 — Zod-first active contract authoring with frozen-behaviour parity

Status: **Proposed — pending operator review at gate R2** (P0-D, 2026-09-23).
Scope: `packages/contracts/**`, `scripts/contracts/**`, `scripts/migrations/port-frozen-contract-v1.ts`.
Related: AR-002, TECHNOLOGY_ARCHITECTURE §9–10, decisions D1 (format oracle) and D2 (one-time port).
This is an engineering decision about the authoring representation only. It creates no legal or factual authority and changes no wire behaviour.

## Context

The frozen TB-SCHEMA-API-v1.0.0 release is JSON-Schema-first; the architecture selected Zod-first active authoring (AR-002) under the condition that frozen public behaviour is preserved exactly. The frozen material already includes Zod adapters, but they were never compiled or run against a real Zod package. Evidence collected during P0-D with the pinned Zod 4.6.5:

- `z.toJSONSchema` silently drops custom refinements (for example a code-point length check or a format compatibility check), emits nullable primitives as `type: [T, "null"]` instead of the frozen `anyOf`, omits empty `required` arrays and adds `type` to `const`. Its output cannot reproduce the frozen schemas without overriding almost every node.
- Zod's built-in format validators disagree with the frozen oracle (JSON Schema 2020-12 + Ajv 8 + ajv-formats `full`) on the P0-D edge cases: `z.uuid()` 3/16, `z.url()` 9/24, `z.email()` 1/21, `z.iso.datetime({ offset: true })` 6/23; `z.iso.date()` agreed on all 16 date cases.
- Zod 4.6.5's built-in string `.min()`/`.max()` count Unicode code points (a change from earlier Zod), so TECHNOLOGY_ARCHITECTURE §9's warning about UTF-16 counting no longer describes this Zod version. The explicit helper is kept anyway (below).

## Decision

1. **Editable source.** After transition acceptance, `packages/contracts/src/**` is the only editable contract source:
   - wire schemas: `api/schemas/{core,production-bound}.ts` and `production/pfc-youtube-email-v1_1/**` (the PFC wire identifier `PFC_SCHEMA_VERSION = 'PFC-YT-EMAIL-v1.1'` is defined once there);
   - HTTP operation metadata: `api/operations.ts` (method, path, operationId, parameters, request body, responses, security, `x-precondition-target`, `x-idempotent-write`) and `api/openapi-document.ts` (info, servers incl. `http://localhost:3000/api/v1`, tags, security scheme, shared parameters and responses) — Zod property schemas alone do not define the operation contract;
   - `api/catalog.ts`: named schemas in `$defs`/components order.
2. **Restricted TB wire builders.** Wire schemas use only `tb.*` builders (`primitives/wire.ts`). Each builder creates the Zod runtime checks and records its JSON Schema lowering from the same parameters. String lengths use `codePointLength` (Ajv `ucs2length` rule, including unpaired surrogates); patterns compile with the `u` flag as Ajv does; formats `uuid`, `uri`, `email`, `date`, `date-time` delegate to the ajv-formats `full` implementations (`ajv-formats/dist/formats.js`), so runtime acceptance equals the oracle by construction.
3. **Explicit, fail-closed lowering** (`generation/json-schema.ts`) replaces `z.toJSONSchema`. It accepts only TB builder schemas with exactly their registered checks, `nullable` wrappers, `optional` on object properties and named catalog references; any other construct or check throws.
4. **Derived artifacts** (`yarn contracts:generate`): `packages/contracts/schemas/api-schemas.json`, `packages/contracts/openapi/openapi.json` and `openapi.yaml` — JSON and YAML serialized from one in-memory OpenAPI object; YAML without anchors/aliases. They are never edited by hand; `yarn contracts:check` regenerates into a temporary directory and fails on drift without repairing anything.
5. **One-time port** (D2). `scripts/migrations/port-frozen-contract-v1.ts` produced the initial source from the frozen inputs deterministically and stays committed as provenance. It is not an authoring workflow: it refuses to overwrite differing files and must not be re-run over edited source.
6. **Compatibility gate.** Until a new contract release is approved, the active source must reproduce TB-SCHEMA-API-v1.0.0 exactly: byte-identical JSON Schema and OpenAPI JSON, itemized inventory parity and three-way runtime parity (frozen Ajv, generated Ajv, Zod) — `yarn test:contracts`. An intentional wire change therefore requires a new approved baseline (release + ADR), not an edit that makes tests pass. The test `transition baseline: output equals the committed initial active source` is retired with the first intentional source edit.
7. **Semantic rules stay separate.** Cross-field, relational, source-scope, readiness and G1–G6 rules (INVARIANTS.md) are service-layer checks, not schema refinements. Adding them to wire schemas requires a reviewed lowering or remains outside the JSON Schema contract.

## Consequences

- Runtime validation depends on `ajv-formats` (formats only, no Ajv core) in `@tb/contracts`.
- `tb.*` builders are the only supported vocabulary; new constructs need a builder, a lowering and parity tests together.
- The frozen `openapi.yaml` (45 anchors, 351 aliases) cannot be parsed by the `yaml` library with default alias limits; the generated YAML has no aliases and is semantically equal to it.

## Alternatives considered

- **JSON Schema remains the authoring source** (frozen release): rejected by AR-002 in favour of TypeScript-native authoring; still available if parity cannot be maintained.
- **`z.toJSONSchema` with `override` hooks**: rejected; exact reproduction would need overrides for most nodes, and refinement dropping would remain silent for future edits.
- **Zod built-in formats**: rejected; measured divergence from the frozen oracle.
