# Claude Code handoff — local-first

## Scope of this delivery

This directory is a **schema/API specification package**, not a runnable React/NestJS application. No package installation, database server, Docker deployment, production evidence ingestion, endpoint implementation, account bootstrap or migration has been performed by this artifact.

## Where the files will go in the future monorepo

- `prisma/schema.prisma` -> `apps/api/prisma/schema.prisma`.
- `prisma.config.ts` -> `apps/api/prisma.config.ts` (paths are relative to that config).
- API schemas/types -> the shared contracts package; preserve generated/read-only ownership.
- `openapi.yaml` -> version-controlled API contract; controllers must not silently diverge.
- Documentation -> `docs/database`, `docs/api`, `docs/decisions` or equivalent existing locations.
- `initial-schema.preview.sql` is for review/comparison, not an existing applied migration.

## First implementation mission

Search the current repository before creating files. Read README, Domain Model, the user's unsigned-output instruction, API_CONTRACT, INVARIANTS and the actual current architecture. Do not import real agency/owner case facts into fixtures. Do not implement all 141 endpoint operations in one unchecked change; work by the agreed phases.

Resolve and pin a mutually compatible Prisma **7** CLI/client/driver-adapter and Zod **4** toolchain from official metadata. Confirm Node support. Do not use any unverified earlier claim about latest React/NestJS/Prisma versions as a reason to upgrade. Pin a MySQL8.4 container digest/tag consistently across the two PCs. The exact image patch/digest and full Yarn lock are bootstrap outputs, not fabricated in this design package.

With dependencies installed and local env configured, the intended checks include:

```
yarn prisma format --config prisma.config.ts
yarn prisma validate --config prisma.config.ts
yarn prisma generate --config prisma.config.ts
```

Then generate/review the real first migration against the SQL preview, including collation and CHECK requirements. Apply only to a disposable local MySQL8.4 database; test foreign keys, source-scoping rules, freeze/edit races, idempotency and rollback. Prisma validate alone does not test MySQL constraints or services.

The second Windows PC pulls the committed migration and applies it with `migrate deploy`; it does not recreate the same migration with `migrate dev`. Keep .env, Docker volumes and private evidence out of Git. Local test fixtures remain synthetic. Each local administrator is bootstrapped separately, never with a committed password.

## Actual verification performed in the authoring environment

See verification/VERIFICATION.json. Offline schema/reference-helper checks are not a running API or a passing application E2E suite. Network DNS access to npm was unavailable here, and no Docker/MySQL/Prisma CLI was present. Real Prisma/Zod runtime and database validation remain explicit acceptance items.

## Do not silently simplify away

No removal of exact LegalSubject, scope-specific MandateCoverage, immutable artifact versions, source attribution, composite same-agency/case keys, exact sender/signer selection, or independent substantive G1–G6 review requirements. No auto-sign/G7/send. No generic `PATCH status=READY_FOR_SIGNER`. No hardcoded legal facts or true/false defaults for owner-controlled findings.
