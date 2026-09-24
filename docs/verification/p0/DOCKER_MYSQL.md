# P0 Docker/MySQL local infrastructure evidence

Scope: first PC, phase P0-B (acceptance row P0-06). Recorded 2026-09-23. Secret values were never printed; they were read from the untracked root `.env` into process environment only.

## Image

| Item | Value |
|---|---|
| Pulled reference | `docker.io/library/mysql:8.4` |
| Pinned in `compose.yaml` | `mysql:8.4.11@sha256:0744ee5ef89ce6ccfa13de3e579fe6b9e27f93dd70da9c06d2c908b1b193fb8d` |
| Digest kind | OCI image index (multi-arch: `linux/amd64`, `linux/arm64/v8`); `mysql:8.4.11` resolves to the same index digest |
| linux/amd64 manifest | `sha256:f015b98a954d6bb92c370d93f354b85f4bcea15642d9fb2975f841a00d400b65` |
| Image env | `MYSQL_MAJOR=8.4`, `MYSQL_VERSION=8.4.11-1.el9` |
| Image created | `2026-09-21T23:08:59Z` |
| Local architecture | amd64 |

## Server configuration (observed through `tb_migrate` over TCP)

| Variable | Observed |
|---|---|
| `VERSION()` / comment | `8.4.11` / `MySQL Community Server - GPL` (not MariaDB) |
| `character_set_server` | `utf8mb4` |
| `collation_server` | `utf8mb4_0900_bin` |
| `@@global.time_zone` / `@@session.time_zone` | `+00:00` / `+00:00`; `NOW(3)` equals `UTC_TIMESTAMP(3)` |
| `skip_name_resolve` | `1` |
| X Plugin | `mysqlx` plugin `DISABLED` (`--mysqlx=OFF`); no 33060 listener in the container |

Application-client (Prisma adapter) session time zone is verified separately when the API connects.

## Schemas and accounts

All four schemas exist with `utf8mb4` / `utf8mb4_0900_bin`: `tb_notice_dev`, `tb_notice_shadow`, `tb_notice_test`, `tb_notice_replay`.

| Account | Grants observed (`SHOW GRANTS`) |
|---|---|
| `tb_dev@%` | `USAGE ON *.*`; `SELECT, INSERT, UPDATE, DELETE ON tb_notice_dev.*` |
| `tb_migrate@%` | `USAGE ON *.*`; `ALL PRIVILEGES` on each of the four `tb_notice_*` schemas; no global privileges, no GRANT OPTION |
| `root@localhost` | Container-internal only (`MYSQL_ROOT_HOST=localhost`); used by the image entrypoint for initialization |

Negative checks actually run:

| Attempt | Result |
|---|---|
| `tb_dev`: `CREATE TABLE tb_notice_dev.p0_probe` | `ERROR 1142` CREATE command denied |
| `tb_dev`: `CREATE DATABASE tb_probe` | `ERROR 1044` access denied |
| `tb_migrate`: `CREATE DATABASE tb_probe` (outside allowlist) | `ERROR 1044` access denied |
| `root` over TCP `127.0.0.1` | `ERROR 1045` access denied |

The `%` host on the scoped accounts is required because Docker-forwarded connections arrive from the container network; exposure is limited by the loopback-only publication below.

## Network binding

| Check | Observed |
|---|---|
| `docker port tb-notice-mysql-1` | `3306/tcp -> 127.0.0.1:3307` |
| WSL `ss -ltn` | `127.0.0.1:3307` only |
| Windows `netstat.exe -ano -p TCP` | `127.0.0.1:3307 LISTENING` only |
| Container listeners | 3306 (and Docker's embedded DNS on 127.0.0.11); no 33060 |

## Lifecycle

- `yarn env:init` created `.env` (mode 600, git-ignored); it refuses to overwrite an existing file.
- `yarn db:up` = `docker compose up -d --wait mysql`; the container reached `healthy`; the init log line `tb-init: schemas and scoped accounts created` appeared once (first initialization of the empty named volume `tb-notice_tb_mysql_data`).
- The init script runs only on an empty volume. Changing passwords later requires a deliberate, separately reviewed procedure; it is not automated.
- No other container, volume or port on this machine was modified.
