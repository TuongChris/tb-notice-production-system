# P0-D contract transition evidence (first PC) — review gate R2

Recorded 2026-09-23. Scope: P0-D only (Zod-first active contract source with frozen-behaviour parity, ADR-0002). P0-E and P1 have not started. P0 overall is not complete.
Raw evidence: `evidence/p0d-test-contracts.txt` (all 817 test results), `evidence/p0d-three-way-parity-stats.json`, `evidence/p0d-format-parity.txt`.

## 1. Packages (exact, registry metadata + Yarn age gate 1440 min not weakened)

| Package | Version | Where | Published (age at install) | Engines / peers / deps |
|---|---|---|---|---|
| zod | 4.6.5 | `@tb/contracts` dependency | 2026-09-13 (9.5 d) | ESM, no engines, no deps |
| ajv-formats | 3.0.1 | `@tb/contracts` dependency (runtime format helpers) and root dev | 2024-03-30 | dep/peer `ajv ^8.0.0` |
| ajv | 8.20.0 | root devDependency (oracle) | 2026-04-24 | deps fast-deep-equal, fast-uri, json-schema-traverse, require-from-string |
| yaml | 2.9.1 | root devDependency (OpenAPI YAML) | 2026-09-11 (12 d) | node `>= 14.6`, no deps; latest stable (`next` is 3.0.0-2) |

No quarantine, no new peer warnings (only the known Prisma Studio React peers). Node 24.21.0 runs the `.ts` scripts natively (type stripping); scripts are type-checked with `erasableSyntaxOnly` (verified to reject an `enum` probe) and `verbatimModuleSyntax`. TypeScript 7.0.2 compiles the 8 000-line ported source.

## 2. Frozen inputs used by the port

Read-only, verified against the frozen `MANIFEST.sha256`, whose own sha256 must equal the pinned identity `42c2a419…46e9c`:

| Input | sha256 |
|---|---|
| `contracts/api-schemas.json` (284-schema JSON Schema 2020-12 bundle) | `bdb3213ba0070d13173fd5ba5f9177b769f54c90af6a46f5473667b0f1b4f7b4` |
| `contracts/openapi.json` (141 operations, components, document metadata) | `c47e2ea160eaa747f64218746c2997a99dec4206fbec6294ebe1335f2a7a8ba2` |
| `contracts/endpoint-catalog.json` (141-entry cross-check) | `3f6263e82252695bdc621cdb636fd2f75ffb00b8ff0ba2617b2998c1d2cf1e61` |

The port first failed closed on the endpoint-catalog cross-check: the catalog's `response` names the *payload* schema, while `openapi.json` references the `{data, meta}` envelope. This relation was verified for all 141 operations (132 envelopes `{data, meta: ResponseMeta}`, `required: [data, meta]`; 9 × 204 → null) before it was encoded, and any other envelope shape still fails closed. The port also verifies that `openapi.json` `components.schemas` equal the bundle `$defs` (modulo `$ref` prefix) in the same order.

## 3. Files

Hand-written, reviewed (`packages/contracts/src`): `primitives/unicode.ts`, `primitives/formats.ts`, `primitives/wire.ts`, `generation/json-schema.ts`, `generation/artifacts.ts`, `generation/index.ts`, `api/operation-types.ts`, `index.ts`.
Ported once (active source), sha256 at transition: `api/schemas/core.ts` (276 schemas), `production/pfc-youtube-email-v1_1/production-context.ts` (ProductionContext), `api/schemas/production-bound.ts` (7 schemas depending on ProductionContext), `production/pfc-youtube-email-v1_1/{constants,index}.ts`, `api/schemas/index.ts`, `api/catalog.ts`, `api/operations.ts` (141), `api/openapi-document.ts`.
Generated (committed, never hand-edited): `packages/contracts/schemas/api-schemas.json`, `packages/contracts/openapi/openapi.json`, `packages/contracts/openapi/openapi.yaml`.
Tooling: `scripts/migrations/port-frozen-contract-v1.ts`, `scripts/contracts/{render,paths,generate,check}.ts`, `scripts/reference/{verify,check,run-helper-tests}.ts`, `scripts/tsconfig.json`, `vitest.contracts.config.ts`, `tests/contracts/**`.
Decision record: `docs/decisions/ADR-0002-zod-first-contract-authoring.md` (Proposed, pending R2).

## 4. Results

| Check | Result |
|---|---|
| Port determinism | Two runs into empty temp directories byte-identical; equal to the committed initial source (9 files); re-run over the repo without `--overwrite` accepted only because the output was identical; refuses `docs/reference` targets and differing files |
| Generated JSON Schema | **byte-identical** to frozen `api-schemas.json` (sha256 `bdb3213b…4b7b4`) |
| Generated OpenAPI JSON | **byte-identical** to frozen `openapi.json` (sha256 `c47e2ea1…a8ba2`) |
| Generated OpenAPI YAML | sha256 `1fa8eb84…6c38`; parses with default `yaml` settings to exactly the generated JSON; 0 anchors/aliases; semantically equal to the frozen YAML (45 anchors / 351 aliases, parsed with unlimited aliases) |
| 284-schema inventory | Names and order identical; per-schema itemized inventory equal for all 284 (properties, required, strict/open objects, enums, consts, patterns, integer/array/string bounds, formats, nullable unions, oneOf, minProperties, `$ref`s, descriptions). Totals: 4 oneOf, 12 minProperties, 691 nullable unions, 626 formats, 80 patterns, 410 refs, 216 enums, 49 consts, 49 integer bounds, 123 array bounds |
| 141-operation OpenAPI parity | Per operation: method, path, operationId, tags, summary, parameters, requestBody, response status codes + schemas + headers, security, `x-precondition-target`, `x-idempotent-write` — all 141 equal; info/servers (`http://localhost:3000/api/v1`)/tags/security/components equal; every `$ref` resolves |
| PFC | `PFC_SCHEMA_VERSION === 'PFC-YT-EMAIL-v1.1'`; `ProductionContext.schemaVersion` and `AppMeta.contractVersion` lower to `{const: 'PFC-YT-EMAIL-v1.1'}`; Zod rejects `PFC-YT-EMAIL-v1`, `…-v1.1.0`, lower-case, `…-v1.2` |
| Three-way runtime parity | 31 frozen fixtures (all also match their recorded `expectedValid`) + synthetic payloads for all 284 schemas: **27 379 payloads, 10 730 accepted, 16 649 rejected, 0 divergences** (frozen Ajv vs generated Ajv vs Zod). No exception list exists |
| Format parity (100 edge cases) | TB helpers agree with the oracle on all: uuid 16 (8 accept / 8 reject), uri 24 (13/11), email 21 (6/15), date 16 (6/10), date-time 23 (13/10) |
| Zod built-in formats (negative control) | Diverge from the oracle: uuid 3, uri 9, email 1, date 0, date-time 6 (table in `evidence/p0d-format-parity.txt`) |
| Unicode | `codePointLength` equals Ajv `ucs2length` on 12 fixed strings (incl. unpaired surrogates) and 5 000 pseudo-random UTF-16 strings; tb.string accepts N supplementary chars at maxLength N and rejects N+1 (exercised for every bounded string in the parity run) |
| oneOf / non-empty PATCH | 4 oneOf unions (FactValue, CaseFact, CreateFact, ReviseFact) with a required, distinct `factType` const in every branch → discriminated union; branch swap, missing/unknown/lower-case discriminator all agree three-way. 12 PATCH bodies with `minProperties: 1` and `required: []`: `{}` rejected and single-field accepted three-way |
| Fail-closed lowering | 19 unsupported constructs throw (raw `z.string`, extra `.max()`/`.refine()`/late `.describe()`, `z.uuid`, `z.email`, `z.int`, plain union, loose/strip objects, transform, default, lazy, top-level optional, bigint, date, tuple, …) |
| `yarn contracts:generate` | exit 0; writes only the 3 designated outputs |
| `yarn contracts:check` | exit 0 on the repo and on a fresh clone |
| Tamper (disposable clone of `5cdd055`, `yarn install --immutable`) | Changed server URL in committed `openapi.json` → exit 1, file sha unchanged (not repaired). Changed `PostalAddress.line1` maxLength 255→256 in active source without regenerating → exit 1 on all 3 outputs (outputs unchanged) and 8 inventory parity tests fail. Changed frozen-reference copy → `reference:check` exit 1. Clone deleted; real tree untouched |
| `yarn reference:check` | OK: database-api-v1 31 entries, MANIFEST `42c2a419…`; architecture-v1 18 entries, MANIFEST `62b4d113…`; pinned identity matches. Tamper tests in temp copies: changed byte, unlisted file, missing file and a tampered file with a re-signed manifest line all detected |
| Frozen 27 Node helper tests | `yarn reference:helper-tests`: pass 27, fail 0 (Node 24.21.0), run from a temp cwd; references intact before and after. `verify_contracts.py` not executed |
| Health contract | Temporary hand-written types replaced by ported `Health`/`ResponseMeta`/`GetHealthResponse`; `HealthStatus`/`AffectedResource` kept as derived aliases. API and web typecheck/build pass; web bundle unchanged (`index-BcGHGpDq.js`, 220 436 bytes). Live compiled API: `200`, `Cache-Control: no-store`, body valid under frozen Ajv, generated Ajv and Zod |
| Regression | `yarn test:db` 22/22 pass; `yarn db:verify dev` PASS |
| Totals | `yarn test:contracts`: 5 files, **817 passed, 0 failed**; typecheck (all workspaces, tests, scripts), lint and format:check pass |

## 5. Warnings, findings and limitations

- **Zod 4.6.5 built-in string lengths count code points** — contrary to the warning in TECHNOLOGY_ARCHITECTURE §9, which reflects older Zod. `tb.string` keeps its own helper (tested against Ajv) so parity does not depend on Zod internals.
- **Frozen `openapi.yaml` uses YAML anchors/aliases**; the `yaml` library refuses it under default alias limits ("Excessive alias count"). The generated YAML has none and is semantically equal.
- **Runtime dependency**: `@tb/contracts` imports `ajv-formats/dist/formats.js` (no `exports` map; documented deep import). Web bundle unaffected today because the web imports types only.
- **Deliberate edge-case scope**: the parity payloads are synthetic and schema-driven; they are strong evidence, not a proof over all possible inputs. Formats are identical by construction (delegation); other constraints were exercised at their boundaries.
- **Transition baseline test** (port output = committed source) must be retired with the first intentional edit of the active source; parity against TB-SCHEMA-API-v1.0.0 remains until a new contract release is approved (ADR-0002 §6).
- **Evidence scope**: first PC only. CI and second-PC reproduction are P0-E items, not run.
