#!/bin/bash
# Sourced by the official MySQL image entrypoint on first initialization of an empty volume only.
# Creates the four allowlisted schemas and the two scoped accounts (decision D3).
# Passwords come from the container environment and are never echoed.
# Sourced (not executed) by the entrypoint: do not change its shell options here.

for name in TB_DB_APP_PASSWORD TB_DB_MIGRATE_PASSWORD; do
  value="${!name:-}"
  if [[ ! "$value" =~ ^[A-Za-z0-9]{24,128}$ ]]; then
    echo "tb-init: $name must be 24-128 alphanumeric characters" >&2
    exit 1
  fi
done

docker_process_sql --database=mysql <<-EOSQL
	CREATE DATABASE tb_notice_dev    CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;
	CREATE DATABASE tb_notice_shadow CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;
	CREATE DATABASE tb_notice_test   CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;
	CREATE DATABASE tb_notice_replay CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

	-- Runtime account: DML on the development schema only; no DDL, no create/drop.
	CREATE USER 'tb_dev'@'%' IDENTIFIED BY '${TB_DB_APP_PASSWORD}';
	GRANT SELECT, INSERT, UPDATE, DELETE ON tb_notice_dev.* TO 'tb_dev'@'%';

	-- Migration/test tooling account: full privileges on the four allowlisted schemas only.
	-- No global privileges, no GRANT OPTION.
	CREATE USER 'tb_migrate'@'%' IDENTIFIED BY '${TB_DB_MIGRATE_PASSWORD}';
	GRANT ALL PRIVILEGES ON tb_notice_dev.*    TO 'tb_migrate'@'%';
	GRANT ALL PRIVILEGES ON tb_notice_shadow.* TO 'tb_migrate'@'%';
	GRANT ALL PRIVILEGES ON tb_notice_test.*   TO 'tb_migrate'@'%';
	GRANT ALL PRIVILEGES ON tb_notice_replay.* TO 'tb_migrate'@'%';
EOSQL

echo 'tb-init: schemas and scoped accounts created'
