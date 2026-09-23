# Architecture source register v1

Release: TB-ARCH-v1.0.0 · Research/specification date: 2026-09-23.
This is a source/decision register, not a legal opinion or a certificate of application correctness.

## 1. Materials actually used

| ID | Material | Use and limitation |
|---|---|---|
| LOCAL-01 | Attached TB_DATABASE_SCHEMA_API_CONTRACT_v1.zip, release TB-SCHEMA-API-v1.0.0 | Extracted locally; existing 31-entry SHA manifest checked; README, API_CONTRACT, INVARIANTS, LOCAL_FIRST_HANDOFF, schema/config, catalogs, reference functions and verification record inspected. No real database run implied. |
| LOCAL-02 | Attached TB_OPERATIONS_MANAGER_DOMAIN_MODEL_v1.md | Earlier conceptual design; unsigned-candidate/product and later machine-contract changes explicitly reconciled, not silently substituted. No real case facts copied into this pack. |
| LOCAL-03 | Operator-pasted Claude read-only inspection report | Basis for the 16-item resolution matrix and reported branch/context. GitHub/WSL state was not independently re-fetched in this pack-building mission. |
| LOCAL-04 | Current conversation instructions: unsigned form; intended sender signs; local-first; two Windows/WSL PCs; Claude implementation role | Product/engineering decisions, not owner rights evidence or permission to send notices. |
| LOCAL-05 | Prior failed Architecture Pack code visible in conversation | Unpublished draft intent only. Not treated as an existing file or successful prior deliverable. This release is a newly materialized verified archive. |

Exact local input hashes/counts are recorded in the pack's `verification/REFERENCE_BASELINE.json`. The original archive is not bundled again; it is expected at the existing repository reference path. The importer requires its exact known manifest and verifies its entries before writing documentation.

## 2. Engineering design choices

Node24, Yarn4/node-modules, MySQL8.4/loopback3307, workspaces, scoped migration accounts, Zod-first active authoring under parity constraints, manual SQL checks, disabled fixture actor and phase allocation are **engineering decisions**. They are not inferred legal requirements or proof of tool compatibility. Runtime package/image selection and actual local tests remain P0 tasks.

## 3. Public primary documentation consulted

| ID | Official source | Specific support; not a broad endorsement |
|---|---|---|
| TECH-01 | https://zod.dev/json-schema | Native JSON Schema conversion exists; some checks/types do not convert safely. Use strict wire primitives, explicit lowering and conformance tests; arbitrary refinements are not automatically lossless. |
| TECH-02 | https://www.prisma.io/changelog/2025-11-19 | Prisma7's generated client/config/explicit environment-loading changes. This historical release note is not a statement that a particular patch is newest. |
| TECH-03 | https://www.prisma.io/docs/orm/v7/reference/prisma-schema-reference | v7 datasource/provider and relationMode documentation. Actual generated schema/client still require P0 validation. |
| TECH-04 | https://ajv.js.org/json-schema.html | JSON Schema dialect support; select the draft-2020-12 implementation rather than silently validating under a different draft. |
| TECH-05 | https://yarnpkg.com/configuration/yarnrc | nodeLinker and immutable-install configuration. This pack selects node-modules; it does not assert defaults for every Yarn release. |
| TECH-06 | https://docs.docker.com/desktop/features/wsl/ | Docker Desktop WSL2 integration and host/Linux environment boundary. Successful operation on the user's PCs is a separate test. |
| TECH-07 | https://docs.prisma.io/docs/orm/prisma-migrate/workflows/unsupported-database-features | Draft migrations can be customized before application for features not represented by the schema. Actual v7 command support is checked in P0. |
| TECH-08 | https://www.prisma.io/docs/orm/v7/prisma-migrate/understanding-prisma-migrate/shadow-database | Separate shadow database, permissions and configuration. Never use the development data URL as the shadow URL. |
| TECH-09 | https://dev.mysql.com/doc/refman/8.4/en/create-table-check-constraints.html | MySQL8.4 CHECK constraint behavior. Validate the actual enforced clauses, not simply the presence of SQL text. |
| TECH-10 | https://spec.openapis.org/oas/v3.1.1.html | Chosen OpenAPI3.1.1 interface description format. No claim that this is the latest version. |

Version-specific pages that did not open directly were not counted as successful independent fetches. Where official search results or the accessible release/reference page supplied the relevant detail, that scope—not unobserved page contents—was used. Exact selected package engines/peers/versions must be checked from official registry metadata during approved P0 work.

## 4. Public policy background — not new case findings

| ID | Official source | Limited use |
|---|---|---|
| POL-01 | https://support.google.com/youtube/answer/2807622?hl=en | Email-body required information, work/material identification, exceptions and full-name signature requirements. No claim about an internal fraud score or that a candidate will be accepted. |
| POL-02 | https://www.copyright.gov/512/ | Notice-and-takedown baseline categories and the distinction between a prepared draft and a notice with an actual signature. Not universal international certification. |

This pack does not include live case evidence, complete legal declarations as executable constants, account credentials or new G1–G7 decisions. Before actual notice drafting, the applicable ruleset must reference current policy and case-specific support. P0 does not need to fetch private Drive documents merely to compile or migrate a synthetic database.

## 5. What verification means here

PACK checks: local text/structure/link checks, source-manifest integrity, importer syntax and behavior in disposable Git repositories, checksum/ZIP readback. Their actual output is in the pack verification report.

NOT performed by this pack: actual Prisma validation/generation; application Zod/JSON parity implementation; MySQL migration or database tests; React/Nest boot; GitHub CI; Windows machine setup; second-PC reproduction; legal review; real-source currentness verification; deployment. Those remain explicit acceptance items.
