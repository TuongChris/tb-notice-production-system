# TB Architecture Specification Pack v1

Release **TB-ARCH-v1.0.0** — complete documentation pack for read-only reinspection before P0.

Start with [README_VI.md](README_VI.md) for operator instructions.

Agent read order:
1. [Architecture resolutions](docs/architecture/ARCHITECTURE_RESOLUTIONS_v1.md)
2. [Product definition](docs/product/PRODUCT_DEFINITION_v1.md)
3. [Domain model](docs/domain/DOMAIN_MODEL_v1.md)
4. [Production form contract](docs/contracts/PRODUCTION_FORM_CONTRACT_v1.md)
5. [Technology architecture](docs/architecture/TECHNOLOGY_ARCHITECTURE_v1.md)
6. [Repository blueprint](docs/architecture/REPOSITORY_BLUEPRINT_v1.md)
7. [P0 bootstrap contract](docs/architecture/P0_BOOTSTRAP_CONTRACT_v1.md)
8. [Source register](docs/architecture/SOURCE_REGISTER_v1.md)

Compatibility input: existing frozen **TB-SCHEMA-API-v1.0.0**, not included again in this archive. Full app scope is declarations only; P0 implementation remains separately approved.

The importer verifies checksums and refuses overwrite conflicts. It does not scaffold code, install packages, migrate databases, sign, send, commit or push. Hashes show consistency, not legal authenticity.

Actual documentation/importer tests are recorded in `verification/PACK_VERIFICATION.json`. P0 acceptance rows remain NOT_RUN/DEFERRED. No legal case, authority, G7, external correspondence or production system was changed to prepare this pack.
