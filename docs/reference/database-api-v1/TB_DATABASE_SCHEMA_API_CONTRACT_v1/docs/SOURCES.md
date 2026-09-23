# Sources and provenance

Specification date: 2026-09-23. This is an application-design mission, not a live case audit.

## User-directed/source-derived requirements

- Two Windows PCs, private Git repository, local-first development; independent local DBs, no deployment now.
- React/NestJS relational application, deterministic prompt production, ChatGPT drafts outside the app, Claude Code as intended implementation writer.
- Software ends at an **unsigned** candidate. The intended human sender is the human signer; the app does not personally adopt, sign or transmit.
- Domain Model v1: current conversation attachment `TB_OPERATIONS_MANAGER_DOMAIN_MODEL_v1.md`, read from its confirmed mounted path. Prompt-only endpoint in that earlier model is superseded by the user's later unsigned-form objective.
- Existing Production Form Contract and Technology Architecture in this conversation were used as design inputs. Their technical-validation-to-READY simplification is explicitly corrected in INVARIANTS.md; no unverified current framework-version assertions were carried forward.
- Canonical ChatGPT Case Retrieval and Authoring Standard was searched/read live from Google Drive in this mission: https://drive.google.com/file/d/15UgPzE3zR7hBS2w_wc7tg1H2nLsbOCD5/view . It requires independent G1–G6, source scope/provenance, exact-version QA and human-only G7. Reading it establishes the content of a control, not the rights of any real owner.
- No real Case Packet, owner authority, evidence, mailbox, AS_SENT, gate or outcome was mutated or newly assessed.

## External primary technical documentation checked in this mission

1. Prisma v7 MySQL setup, datasource/config and mappings: https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/mysql
2. Prisma v7 schema reference: https://www.prisma.io/docs/orm/v7/reference/prisma-schema-reference
3. Prisma transactions/OCC/idempotency: https://docs.prisma.io/docs/orm/v7/prisma-client/queries/transactions
4. MySQL 8.4 foreign keys: https://dev.mysql.com/doc/refman/8.4/en/create-table-foreign-keys.html
5. MySQL 8.4 CHECK constraints: https://dev.mysql.com/doc/refman/8.4/en/create-table-check-constraints.html
6. MySQL identifier case portability: https://dev.mysql.com/doc/refman/8.4/en/identifier-case-sensitivity.html
7. MySQL Unicode/collations: https://dev.mysql.com/doc/refman/8.4/en/charset-unicode-sets.html
8. OpenAPI 3.1.1: https://spec.openapis.org/oas/v3.1.1.html
9. Zod JSON Schema conversion: https://zod.dev/json-schema
10. OWASP Authorization: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
11. OWASP CSRF: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html

These sources support technology capabilities and security requirements. Exact entity fields, status/error names, digest strategy, seven-day replay horizon, endpoint set and deployment sequence are **proposed architecture choices**, not quotes from platform rules or evidence of legal compliance.
