# P0-C1/C2 Prisma evidence (first PC)

Recorded 2026-09-23. Acceptance rows P0-07, P0-08. All commands were actually run; outputs are summarized with exit codes.

## Toolchain reported by the CLI

`prisma --version`: prisma 7.10.0, @prisma/client 7.10.0, Node v24.21.0, TypeScript 7.0.2, Query Compiler enabled, PSL `@prisma/prisma-schema-wasm 7.10.0-4.0edf323…`, schema engine `schema-engine-cli 0edf323efd1d98336f3f0a68684b56f689b900d3`.

Engine provenance: Yarn 4.18 disables dependency build scripts by default, so `@prisma/engines` postinstall did not run. The Prisma CLI downloaded `schema-engine-debian-openssl-3.0.x` on first use from Prisma's engine distribution into `node_modules/@prisma/engines/` (sha256 `29557c21d47da6f1695ec1a747cb6c607dade5e44e8b3e4fa687bd4dc226956d`). A fresh clone/CI will perform the same lazy download.

Telemetry: the guarded wrapper sets `CHECKPOINT_DISABLE=1` and `PRISMA_HIDE_UPDATE_MESSAGE=1`. The update notice seen once recommended `prisma@latest`, which is `8.0.0-rc.15` and is not followed (see TOOLCHAIN.md).

## C1 — active schema and config

| Active path | Source | Change |
|---|---|---|
| `apps/api/prisma/schema.prisma` | frozen `prisma/schema.prisma` (sha256 `fab4607a…4dc`) | Byte copy, then `prisma format` only |
| `apps/api/prisma.config.ts` | frozen `prisma.config.ts` | Technical config refinement (below) |

### Schema: `prisma format` effect

`prisma format --check` on the byte copy exited 1 (unformatted). After `prisma format`:

- Changes are column alignment, blank-line/indent changes and attribute order within a field (`@map(...)` moved before `@db.*`). No attribute, type, relation, index, enum value, default or comment text was added, removed or altered.
- `prisma migrate diff --from-schema <frozen> --to-schema apps/api/prisma/schema.prisma --script --exit-code` → `-- This is an empty migration.`, exit 0.
- Line-level comparison after sorting attribute tokens within each line: 1223 = 1223 normalized lines, identical.
- The generator block (`provider = "prisma-client"`, `output = "../generated/prisma"`) and datasource block (`provider = "mysql"`, `relationMode = "foreignKeys"`, no `url`) are unchanged and accepted by Prisma 7.10.0.

### Config: technical differences from the frozen `prisma.config.ts`

| Frozen | Active | Reason |
|---|---|---|
| `import "dotenv/config"` (loads `.env` from the current working directory) | `process.loadEnvFile(<repo root>/.env)` if present, path resolved from the config file location; no override of existing variables | AR-014 / TECH §7: one root `.env`, independent of cwd; no dotenv dependency |
| `datasource: { url: env("DATABASE_URL") }` | `datasource: { url: process.env.MIGRATION_DATABASE_URL, shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL }` | AR-014 / D3: CLI uses the scoped `tb_migrate` account and a separate shadow schema; runtime uses `DATABASE_URL` through the adapter. `process.env` instead of `env()` so validate/generate work without a database URL |
| `schema`, `migrations.path` | unchanged (`prisma/schema.prisma`, `prisma/migrations`) | Relative to `apps/api/` per LOCAL_FIRST_HANDOFF |

No domain, nullability, identity, cardinality, FK scope, delete behavior, byte semantics or readiness change was made.

## C2 — format / validate / generate

| Command (via `scripts/db/prisma-guarded.mjs`) | Exit | Output |
|---|---|---|
| `yarn db:validate` | 0 | `The schema at prisma/schema.prisma is valid` |
| `prisma format --check` (byte copy) | 1 | `There are unformatted files` |
| `yarn db:format` | 0 | `Formatted prisma/schema.prisma` |
| `prisma format --check` (after) | 0 | — |
| `yarn db:generate` | 0 | `Generated Prisma Client (7.10.0) to ./generated/prisma` |

Generated client: TypeScript source using ESM `.js` import specifiers and `import.meta.url`; compiled together with the API by `tsc` (NodeNext). `apps/api/generated/` is git-ignored and regenerated locally.

## Compiled NestJS import proof (P0-08)

- `yarn workspace @tb/api run build` (TypeScript 7.0.2, NodeNext, decorators + metadata) → exit 0; output `apps/api/dist/src/**` and `apps/api/dist/generated/prisma/**`.
- `node apps/api/dist/src/main.js` started Nest 12.0.4 and mapped only `GET /api/v1/health`.
- `GET /api/v1/health` → `200`, `Cache-Control: no-store`, `{"data":{"status":"ok"},"meta":{"requestId":"<uuid>","affectedResources":[]}}` — backed by `SELECT 1` through the generated client and `@prisma/adapter-mariadb`.
- Runtime session probe through the compiled `PrismaService`: `VERSION()=8.4.11` (MySQL Community Server), `CURRENT_USER()=tb_dev@%`, `DATABASE()=tb_notice_dev`, `@@session.time_zone=+00:00`, `collation_connection=utf8mb4_0900_bin` (set with driver `initSql`; the driver default was `utf8mb4_0900_ai_ci`), `UTC_TIMESTAMP(3)` equal to `NOW(3)` and within milliseconds of Node's clock.
- With MySQL stopped: `200 {"data":{"status":"unavailable"},…}` after the 2 s bound; internal log `Database health check failed (Error).` with no URL or password (0 matches). The process exited within ~1 s of SIGTERM while the database was down.
- Unknown routes (`/api/v1/agencies`, `/health`) → 404.
- Vite dev server on `127.0.0.1:5173` (strict port; a second instance failed with `Port 5173 is already in use`) proxied `/api/v1/health` → `ok` via both `http://127.0.0.1:5173` and `http://localhost:5173`. `yarn dev` started both processes. The Windows-browser check and clean Ctrl-C shutdown of `yarn dev` are not yet recorded (P0-22 / P0-E).
