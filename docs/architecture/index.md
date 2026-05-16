# Architecture

Originium stores canonical Graph Wiki state in SurrealDB and exposes projections for humans and agents.

## Start Here

- [Quality](quality/index.md): baseline standards for errors, validation, and scope control.
- [ADRs](../adr): durable architecture decisions and historical context.
- [SPEC.md](../../SPEC.md): source of truth for Graph Wiki behavior.
- [CONTEXT.md](../../CONTEXT.md): source of truth for product language.

## Package Ownership

| Area             | Owner                 | Purpose                                                                   |
| ---------------- | --------------------- | ------------------------------------------------------------------------- |
| Domain language  | `packages/domain`     | Shared Graph Wiki types, IDs, and small pure helpers.                     |
| SurrealDB access | `packages/surreal`    | Database configuration, schema file references, and future query helpers. |
| PDF ingestion    | `packages/pdf-ingest` | Source Document import and Chapter Ingestion boundaries.                  |
| CLI              | `apps/cli`            | Local database commands, schema application, and ingestion entry points.  |
| Web              | `apps/web`            | Future human-facing Graph Wiki projection.                                |
| Schema           | `schema`              | Checked-in SurrealQL definitions.                                         |

## Runtime Summary

1. A Source Document is imported through the CLI.
2. The PDF binary is stored through SurrealDB file bucket support when configured.
3. Ingestion reads source text from the stored Source Document and processes one Source Heading or Ingestion Chunk at a time.
4. Agents write Wiki Pages, Citations, Manual Links, Agent Sessions, and Change Logs into SurrealDB.
5. CLI and web surfaces render Projections from graph state.

## Dependency Direction

Application boundaries may depend on packages. Shared packages should keep dependencies narrow:

- `packages/domain` has no Originium package dependencies.
- `packages/surreal` may depend on `packages/domain`.
- `packages/pdf-ingest` may depend on `packages/domain` and `packages/surreal`.
- `apps/cli` may depend on all package boundaries.
- `apps/web` should consume public package exports only.
