# Originium

Originium is a Graph Wiki: a persistent, agent-maintained knowledge base that compiles trusted Source Documents into Wiki Pages backed by SurrealDB graph records.

## Local Setup

```bash
bun install
bun run check
```

## What Exists

- `packages/domain`: shared Graph Wiki domain types and small helpers.
- `packages/surreal`: SurrealDB configuration and schema file references.
- `packages/pdf-ingest`: early PDF ingestion boundary placeholder.
- `apps/cli`: command boundary for local database and ingestion workflows.
- `apps/web`: placeholder web app boundary.
- `schema/core.surql`: checked-in schemafull SurrealDB starting point.

## Runtime Notes

- CLI dev: `bun run --cwd apps/cli dev`
- Bundled CLI: `bun run --cwd apps/cli build && ./apps/cli/dist/originium db status`
- Web placeholder: `bun run dev:web`
- Full local gate: `bun run check`

## Operational Environment

- `ORIGINIUM_SURREAL_BIN` selects the SurrealDB binary used by local database commands.
- `ORIGINIUM_SURREAL_URL` connects to an external SurrealDB server.
- `ORIGINIUM_SURREAL_NAMESPACE` and `ORIGINIUM_SURREAL_DATABASE` select the Surreal namespace/database.
- `ORIGINIUM_SURREAL_USER` and `ORIGINIUM_SURREAL_PASSWORD` provide explicit auth.
- `ORIGINIUM_DATA_DIR` selects the project-owned local data directory.

## Docs Organization

- [SPEC.md](SPEC.md) defines the product and proof-of-concept target.
- [CONTEXT.md](CONTEXT.md) defines canonical Graph Wiki language.
- [docs/index.md](docs/index.md) is the compact knowledge map.
- [docs/architecture/index.md](docs/architecture/index.md) summarizes package ownership and runtime boundaries.
- [docs/agent/index.md](docs/agent/index.md) summarizes the repo-local agent factory process.
- [docs/architecture/quality/index.md](docs/architecture/quality/index.md) defines validation-centric engineering standards.
