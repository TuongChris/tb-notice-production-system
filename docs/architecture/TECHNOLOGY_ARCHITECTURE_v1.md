# TB Notice Production System — Technology Architecture v1

Release: **TB-ARCH-v1.0.0** · Local-first modular monolith.
Active-copy amendment: 2026-09-23 P0-D verification correction in §9 (Zod 4.6.5 string length counting; code-point helper and ajv-formats runtime decision retained). The frozen pack copy under `docs/reference/architecture-v1/` is unchanged.
This selects an architecture, not a claim that dependencies, Docker, Prisma or application runtime have already been tested. Exact installable patch versions are P0 outputs verified from official metadata and actual local execution.

## 1. Deployment and development boundary

One private repository, one backend and one local MySQL container per PC. React and Nest run directly in WSL for development. Later production-like testing may serve React static assets from Nest on the same origin; no Hostinger/staging/production deployment is authorized in P0.

Windows PC -> WSL2 Ubuntu -> React/Vite + NestJS -> Docker Desktop WSL integration -> MySQL.

Store the repository under `~/projects/`, not a Windows-mounted project tree. Windows/WSL integration is a development convenience, not a security boundary against host administrators. Company-device policies still apply. No production evidence or secrets on either development fixture set. [TECH-06.]

## 2. Version and package decisions

| Layer | Architecture choice | P0 handling |
|---|---|---|
| Node | Major 24 | Validate actual install and record exact patch; retain `.nvmrc` major 24, pin CI to tested patch |
| TypeScript | Strict, compatible stable release | Resolve/test exact version; do not assume TypeScript 6 from old prose |
| Package manager | Yarn 4, node-modules linker | Pin exact `packageManager` release and commit lockfile |
| Web | React + Vite + TypeScript | Minimal shell only; verify actual stable compatible packages |
| Routing | React Router | Do not assume a specific major or package-removal claim from prior chat; select compatible API in plan |
| API | NestJS + Express + REST `/api/v1` | Minimal shell/health/Prisma connection |
| Storage | MySQL 8.4, InnoDB | Pinned official image patch plus digest after pull/inspection |
| ORM | Prisma 7 | Pin CLI/client/official MySQL-capable adapter compatibility; no `latest` major |
| Contract authoring | Zod 4 | Restricted representable wire schemas + reviewed primitive lowerings |
| Contract runtime | Ajv 8, draft-2020-12 class + supported formats | P0 parity/conformance harness; later application context validation |
| Tests | Vitest; later Playwright | Pure/contracts/DB tests and shell HTTP smoke now; browser workflow later |
| Quality | Prettier; oxlint preferred | Verify compatible exact releases; incompatible lint/tool alternatives require plan disclosure |
| Security | DB-backed opaque sessions, Argon2id, Origin/CSRF | P1 behavior; P0 does not expose login/user APIs |
| Later UI | Tailwind, shadcn/ui, lucide, TanStack Query/Table, React Hook Form | Do not install unused full feature stack during P0 |

Use `fetch` via a small app wrapper later; no Axios/Redux prerequisite. UI primitive choice follows the stable compatible scaffold selected in the plan; no unverified prior claim about shadcn defaults is normative. Never invent versions or package compatibility to satisfy this table.

## 3. ESM and compiler boundary

Preferred active packages use ESM (`type: module`). Shared contracts emit JavaScript plus declaration types and expose package exports. Node-facing TypeScript uses compatible NodeNext resolution with explicit emitted import paths. Web may use Vite's bundler-oriented TS configuration.

Prisma's generated client path is `apps/api/generated/prisma`, consistent with `../generated/prisma` from the schema directory. Configure compilation/imports so the generated client is available to the built API; prove this with a compiled-process smoke test. Do not solve a runtime import failure by shipping unexplained generated files in Git.

Nest decorator compilation must preserve whatever metadata the selected Nest release actually needs. A test runner's default TS transpiler may not reproduce production compiler behavior. P0 includes a build-and-launch check of the real compiled Nest app; do not mark API boot verified from pure helper tests. Minor syntax/build-path corrections are technical; dropping domain constraints is not.

## 4. Workspaces and dependency direction

Use Yarn Workspaces only: `apps/web` (`@tb/web`), `apps/api` (`@tb/api`), `packages/contracts` (`@tb/contracts`). Internal dependency specifiers use `workspace:*`; all workspaces are private.

Both apps depend on contracts. Contracts cannot import Prisma models, Nest services, React components or app paths. No generic repository/BaseCrud abstraction, Nx, Turborepo, Lerna or extra shared packages are required.

`.yarnrc.yml` uses `nodeLinker: node-modules`. First installation is allowed to create the new lockfile in the approved implementation mission. After that, immutable install must succeed. `--immutable` cannot truthfully be the command that creates a missing lockfile. [TECH-05.]

## 5. Local addresses and browser origin

| Component | Bind / public development entry |
|---|---|
| Vite | `127.0.0.1:5173`, strict port; no automatic fallback to 5174 |
| Nest | `127.0.0.1:3000` |
| MySQL container | internal 3306; publish **127.0.0.1:3307:3306** only |
| Browser | `http://127.0.0.1:5173`; `/api` proxied to `http://127.0.0.1:3000` |

Use one hostname consistently per session. Do not add public bindings, wildcard CORS, arbitrary Origin reflection, port forwarding, tunnels or cloud DBs. An occupied port yields a clear error, not an architecture change. Verify Windows-browser-to-WSL behavior on both PCs rather than assuming isolation or reachability from settings alone.

## 6. Database accounts and shadow database

Provision through a local initialization step using the container's administrative access; root is not the runtime connection.

| Name | Purpose / scope |
|---|---|
| `tb_notice_dev` | Development schema for API and seed |
| `tb_notice_shadow` | Separate disposable Prisma shadow schema, never same URL as dev |
| `tb_notice_test` | Disposable structural-test schema |
| `tb_notice_replay` | Empty-database migration replay target when required |
| `tb_dev` | Runtime DML privileges on `tb_notice_dev` only |
| `tb_migrate` | DDL/DML sufficient on the four named development schemas only; no global grant/admin use by app |

All are in **one MySQL container**, not additional services. Precreating a separate shadow schema avoids using a runtime account with blanket server-level database-creation privilege. Selected Prisma behavior and required grants are confirmed in P0. No `SET FOREIGN_KEY_CHECKS=0` workaround for a failing invariant. No reset/drop on a non-disposable or unrecognized schema.

Set `--character-set-server=utf8mb4`, required binary collation and `--default-time-zone=+00:00` in the approved MySQL configuration; verify actual database/table/connection properties. OS `TZ` alone does not establish every SQL session time zone. Ensure every app/CLI/test connection follows the intended UTC conversion behavior. MySQL DATETIME does not itself encode a timezone.

Pin the pulled official image tag/digest and architecture in the recorded P0 toolchain report; never fabricate a digest. Named Docker volume remains local, excluded from Git. Do not expose MySQL X port or docker.sock to app code.

## 7. Environment and secret handling

Use one root local `.env`, explicitly loaded by scripts/API/config via a path resolved from the repository/module location, not accidental current working directory. Do not create competing nested `.env` files.

Required configuration names are documented with placeholders only:

- `DATABASE_URL`: runtime non-root DML connection to dev schema.
- `MIGRATION_DATABASE_URL`: scoped migration account and dev schema.
- `SHADOW_DATABASE_URL`: separate scoped shadow connection.
- `TEST_DATABASE_URL`: explicitly disposable test target.
- Docker initialization secret variables, kept local and redacted.

The active Prisma CLI config reads the migration/shadow URLs; runtime Prisma uses DATABASE_URL. This is an explicit P0 configuration refinement of the reference's single-URL example, not a change to the database domain.

Use random local credentials generated without logging them. Do not commit literal passwords, token output, dumps, `.env`, Docker data, auth-state files or `.claude` session data. `.env.example` lists required names with non-working placeholders. Browser-exposed `VITE_*` variables may never contain a secret.

## 8. Prisma storage ownership

Working schema: `apps/api/prisma/schema.prisma`. CLI config: `apps/api/prisma.config.ts`. Migrations: `apps/api/prisma/migrations/`. Generated client: `apps/api/generated/prisma/` (ignored).

Prisma 7 is the selected ORM major, not a claim about the newest market release. Confirm official MySQL adapter, config and generator behavior. A package named `@prisma/adapter-mariadb` may legitimately connect to MySQL; its name does not authorize substituting MariaDB as the server. Confirm the actual engine by query. [TECH-02, TECH-03.]

The active schema plus reviewed custom migration SQL are editable database sources. The frozen model catalog/SQL preview/dictionary remain comparison inputs. P0 does not rebuild an absent model-catalog-to-all-files generator.

## 9. Contract ownership — explicit AR-002 transition

The frozen API release currently describes **JSON Schema as authoring source** and Zod as a generated adapter. The later Architecture Resolution proposes **Zod-first active authoring**. These are different architectures, not interchangeable labels. The transition is permitted only under the parity conditions below; preserve the frozen release unchanged.

Active sources:

1. `packages/contracts/src/api/` and `src/production/`: Zod wire definitions.
2. `packages/contracts/src/api/operations.ts`: operation metadata (method/path/operationId/parameters/security/responses/extensions), initially transcribed from the frozen OpenAPI/endpoint catalog.
3. Explicit named semantic validators in services/later production rules: not silently exported as JSON Schema.

Generated outputs: JSON Schema catalog and OpenAPI JSON/YAML; inferred TypeScript/declaration output from the same Zod types. Schemas alone cannot generate route methods, security or ETag targets; the operation manifest is necessary and is not a second editable copy of property definitions.

During migration, the frozen 284-schema/141-operation public behavior remains the compatibility baseline. A fresh generation must preserve required/optional/null rules, unknown-field policy, formats, bounds, enums, response/status/header security and `x-precondition-target`. Coverage includes all declared operations; P0 implements only health, not the other HTTP routes.

### Conversion safety

Use only representable wire constructs, with `unrepresentable: throw` where supported. No arbitrary coercion/transform/custom predicate is treated as lossless JSON Schema. Do not use fallback `{}`, `z.any`, or dropped checks to get a green generator. Do not infer completeness from successful serialization. [TECH-01.]

**Unicode detail found in the frozen adapters:** they use code-point length refinements (`Array.from(value).length`), not simply JS UTF-16 `.length`. A naive substitution with `.min/.max` can change behavior for supplementary characters. Introduce one explicit, reviewed Unicode-string primitive with runtime behavior and JSON Schema minLength/maxLength lowering tested together. If a custom refinement is retained, its exact schema lowering must be known and tested; no promise that arbitrary refine functions convert automatically.

> **P0-D verification correction (2026-09-23; recorded at P0-E, not a rewrite of the statement above).** The preceding paragraph implied that Zod's built-in string `.min/.max` necessarily count JavaScript UTF-16 code units. P0-D verified empirically that the pinned **Zod 4.6.5** built-in string length limits count **Unicode code points** (its `$ZodCheckMaxLength`/`$ZodCheckMinLength` fall back to a code-point count). TB nevertheless **retains its own reviewed code-point helper** (`packages/contracts/src/primitives/unicode.ts`, equal to Ajv's `ucs2length` rule including unpaired surrogates) inside the `tb.string` builder, so wire behaviour stays pinned to the frozen compatibility oracle (JSON Schema 2020-12 + Ajv 8 + ajv-formats full) and does not depend on current or future Zod internals. The parity tests (`yarn test`: Unicode, format and three-way runtime parity) remain authoritative. Wire formats likewise delegate to the exact-pinned `ajv-formats` 3.0.1 runtime dependency (ADR-0002); any `ajv-formats`/`ajv` version change is contract-sensitive and requires the full parity suite before acceptance. Evidence: `docs/verification/p0/P0_D_CONTRACTS.md`.

Ajv draft-2020-12 plus the selected formats configuration is used as a parity checker. Test JSON Schema and Zod acceptance on the same synthetic fixtures, including Unicode boundaries, nullable/optional fields, formats, unknown keys and code-point limits. Schema/catalog coverage counts alone do not establish semantic equivalence. [TECH-04.]

If a real incompatibility cannot be resolved without changing accepted payloads or domain meaning, stop with an explicit example and proposed amendment. Do not quietly switch source direction again.

## 10. Generation versus checking

`contracts:generate` may intentionally update only designated generated files in the active package. `contracts:check` generates to a temporary directory/in-memory and compares; it must **not repair or overwrite** artifacts on a failing check. It exits nonzero on missing output, changed semantics or drift.

Keep frozen Python verifier unexecuted in its reference directory: it writes files. The active pipeline is Node/TypeScript; Python is not an app/runtime/CI dependency. Original 27 Node helper tests may be rerun read-only and their implementations ported with parity tests.

## 11. Security and later services

P1 adds local-admin bootstrap, opaque server sessions, Argon2id, exact Origin allowlists and CSRF. Single admin is not a bypass of server authorization or same-agency checks. No P0 endpoint may grant a human identity, legal authority or signature.

Future services use typed allowlists, stable error codes, transaction-bound audit/idempotency, exact ETag preconditions, limited queries and no-store for private responses, as specified in the frozen API. A URL-reference input is not permission to fetch arbitrary internal/public URLs from the server.

## 12. Explicitly excluded dependencies and capabilities

No Redis/BullMQ/Kafka/RabbitMQ, Temporal/Camunda, GraphQL/tRPC, vector/search cluster, microservices, billing, public registration, customer portal, AI API, mail sending, Drive writing, uploader contact, auto-sign/G7 or production deployment. Development metadata/package/container downloads from official sources are allowed **only once implementation is approved**; “no external action” refers to production/legal/customer actions, not a ban on installing dependencies.

## 13. Validation status

This pack contains specifications, metadata and a documentation installer only. It does not run Nest, Prisma or MySQL. Exact package lock, compiled ESM integration, real migration, CI, Windows two-PC reproduction and runtime performance remain unexecuted P0 deliverables. See [P0 Bootstrap Contract](P0_BOOTSTRAP_CONTRACT_v1.md) and [Source Register](SOURCE_REGISTER_v1.md).
