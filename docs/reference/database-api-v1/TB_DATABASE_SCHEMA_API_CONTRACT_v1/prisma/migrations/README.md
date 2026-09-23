# Migration status: NOT_CREATED / NOT_APPLIED

`../initial-schema.preview.sql` is a DDL proposal, not an applied migration.
Before creating the application migration, Claude Code must install a compatible pinned Prisma 7 CLI, run `prisma format`, `prisma validate`, generate an empty-to-schema SQL diff, compare it to the preview, and apply the approved result to a disposable MySQL 8.4 database. Include the preview's collation and CHECK requirements in the real migration. Then run FK/uniqueness/constraint tests and a restore test. Never execute against the existing canonical system.

All actual migration files must be committed. The second Windows PC runs committed migrations with `migrate deploy`; only the active feature writer creates new migrations using `migrate dev`. Do not use `db push` to synchronize the two computers. Do not share a Docker data directory across computers.
