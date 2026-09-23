# P0 toolchain selection and compatibility evidence

Mission: TB-P0-LOCAL-BOOTSTRAP, phase P0-A (acceptance rows P0-03, P0-05, P0-06).
Recorded: 2026-09-23 on the first PC. This file records selections and evidence actually observed; it is not a claim that later P0 phases passed.

## 1. Observed first-PC environment (read-only inventory)

| Item | Observed |
|---|---|
| OS | WSL2 kernel `6.18.33.2-microsoft-standard-WSL2`, Ubuntu 24.04.3 LTS, x86_64 |
| Repository location | `~/projects/tb-notice-production-system` (Linux filesystem, not `/mnt/c`) |
| Node | `v24.21.0` (nvm) — satisfies the Node 24 target (AR-005) |
| npm | `11.19.0` (used only for read-only registry metadata queries) |
| Corepack | `0.36.0` (already enabled; no global setting changed) |
| Git | `2.43.0`; global `core.autocrlf=input` |
| Docker | Client/Server `29.7.2`, Docker Desktop with WSL integration, `x86_64` |
| Docker Compose | `v5.4.0` |

Side effect of inventory: running `yarn --version` before the repository pinned a package manager made Corepack download Yarn Classic 1.22.22 into its user cache (`~/.cache/node/corepack`). Nothing in the repository was affected. The repository pins Yarn 4 via `packageManager`.

## 2. Selected exact versions

Source: `npm view <pkg> dist-tags / version / engines / peerDependencies` against registry.npmjs.org on 2026-09-23. Only stable releases were considered; `latest` dist-tags were not trusted blindly (see Prisma note).

| Layer | Package | Exact version | Engines / peers checked | Installed in |
|---|---|---|---|---|
| Package manager | Yarn (`@yarnpkg/cli-dist`) | 4.18.0 | node `>=18.12.0` | root `packageManager` |
| Language | typescript | 7.0.2 | node `>=16.20.0`; Prisma client peer `typescript >=5.4.0` | root |
| Node types | @types/node | 24.13.6 | matches Node 24 major | root |
| API | @nestjs/common, @nestjs/core, @nestjs/platform-express | 12.1.0 | core node `>=20`; peers rxjs `^7.1.0`, reflect-metadata `^0.1.12 \|\| ^0.2.0`; packages are `type: module` | apps/api |
| API | reflect-metadata | 0.2.2 | Nest peer range | apps/api |
| API | rxjs | 7.8.2 | Nest peer `^7.1.0` | apps/api |
| ORM CLI | prisma | 7.10.0 | node `^20.19 \|\| ^22.12 \|\| >=24.0`; peer typescript `>=5.4.0` | apps/api (dev) |
| ORM client | @prisma/client | 7.10.0 | same engines; peers prisma `*`, typescript `>=5.4.0` | apps/api |
| DB adapter | @prisma/adapter-mariadb | 7.10.0 | depends on exact `mariadb@3.4.5` | apps/api |
| Web | react, react-dom | 19.3.0 | react-dom peer `react ^19.3.0` | apps/web |
| Web types | @types/react, @types/react-dom | 19.3.0 | @types/react-dom peer `@types/react ^19.2.0` | apps/web |
| Web build | vite | 8.3.0 | node `^20.19.0 \|\| >=22.12.0` | apps/web |
| Web build | @vitejs/plugin-react | 6.1.1 | peer vite `^8.0.0` | apps/web |
| Format | prettier | 3.9.9 | node `>=14` | root |
| Lint | oxlint | 1.85.0 | node `^20.19.0 \|\| >=22.12.0` | root |

Selected but **not installed in this mission** (not needed before P0-D/P0-E; recorded so later phases do not re-select silently):

| Package | Exact version | Evidence | Planned phase |
|---|---|---|---|
| zod | 4.6.5 | `type: module`, no peers | P0-D |
| ajv | 8.20.0 | latest 8.x | P0-D |
| ajv-formats | 3.0.1 | peer `ajv ^8.0.0` | P0-D |
| vitest | 5.0.1 | node `^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0`; peer vite `^6.4.0 \|\| ^7.0.0 \|\| ^8.0.0` | P0-C7/P0-E |
| react-router | 8.4.0 | node `>=22.22.0`; peers react/react-dom `>=19.2.7` | when routing is needed (not in P0 shell) |

Not selected: `dotenv` (the root `.env` is loaded with Node 24's built-in `process.loadEnvFile` from a path resolved relative to the module, per TECHNOLOGY_ARCHITECTURE §7), `@nestjs/cli` (the API builds with `tsc`), `tsx`.

### Prisma dist-tag warning

On 2026-09-23 the npm `latest` dist-tag of `prisma` points to **`8.0.0-rc.15`** (a release candidate of a different major), while `@prisma/client` and `@prisma/adapter-mariadb` `latest` are `7.10.0`. The stable Prisma 7 line is `7.0.0 … 7.10.0`. Prisma is therefore pinned explicitly to `7.10.0`; installing `prisma@latest` would violate the Prisma 7 architecture choice.

### Adapter naming

`@prisma/adapter-mariadb` is the Prisma 7 driver adapter used for MySQL connections (it uses the `mariadb` Node driver). The server remains the official MySQL 8.4 image; the actual engine is confirmed by `SELECT VERSION()` (see DOCKER_MYSQL.md). No MariaDB server is used.

## 3. Compatibility probe: TypeScript 7 + NestJS 12 decorator metadata

TypeScript 7 is a new compiler implementation, so decorator-metadata emission required for Nest dependency injection was tested before selection, in a throwaway directory outside the repository (scratchpad, `npm install` of the exact versions above):

- tsconfig: `module`/`moduleResolution` `NodeNext`, `strict`, `experimentalDecorators`, `emitDecoratorMetadata`, ESM package.
- `tsc -v` → `Version 7.0.2`; `tsc -p .` exit 0.
- Emitted JS contains `__metadata("design:paramtypes", …)` (2 occurrences).
- Compiled Nest 12 app with a constructor-injected provider started, served `GET /h` → `200 {"status":"injected-ok"}`, closed cleanly; exit 0.

Conclusion: Node 24 + TypeScript 7.0.2 + NestJS 12.1.0 ESM/NodeNext does not require an architecture change. The real repository build is proven separately in P0-B.

## 4. Pending records

- MySQL image tag, digest and architecture: recorded in `DOCKER_MYSQL.md` after the actual pull.
- `packageManager` hash and lockfile: produced by the first resolve in P0-B.
- CI Node patch pin: `24.21.0` (the tested patch) when CI is configured in P0-E.
