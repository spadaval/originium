# Architecture

Originium stores canonical Graph Wiki state in SurrealDB and exposes projections for humans and agents.

## Start Here

- [Quality](quality/index.md): baseline standards for errors, validation, and scope control.
- [Surrealist inspection](surrealist-inspection.md): POC database inspection workflow and queries.
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
| Web              | `apps/web`            | Deferred human-facing Graph Wiki app and projection.                      |
| Schema           | `schema`              | Checked-in SurrealQL definitions.                                         |

## Runtime Summary

1. A Source Document is imported through the CLI.
2. The PDF binary is stored through SurrealDB file bucket support when configured.
3. Ingestion reads source text from the stored Source Document and processes one Source Heading or Ingestion Chunk at a time.
4. Agents write Wiki Pages, Citations, Manual Links, Agent Sessions, and Change Logs into SurrealDB.
5. During the POC, the CLI renders agent-facing Projections and Surrealist is
   used for database-management inspection and manual validation.
6. After the POC, `apps/web` can add user-facing interaction, editing, richer
   Projections, and embedded agent chat.

## External Tools

Surrealist is the POC database-management and manual inspection surface. Do not
vendor Surrealist source code into this repository. Downloaded desktop release
artifacts may live in the ignored repo-local tool cache:

```text
.originium/tools/surrealist/<version>/
```

Current local cache target:

- Release: `surrealist-v3.8.5`
- macOS arm64 asset: `Surrealist_3.8.5_aarch64.dmg`
- SHA-256:
  `07112ecba22409717ddcce1ba744c9631add7bc07805773543dd5222ffdd3b81`

Use Surrealist for inspection and manual validation only. Originium-owned
mutation workflows, schema application, ingestion, and Graph Wiki projections
remain CLI/package responsibilities.

## Dependency Direction

Application boundaries may depend on packages. Shared packages should keep dependencies narrow:

- `packages/domain` has no Originium package dependencies.
- `packages/surreal` may depend on `packages/domain`.
- `packages/pdf-ingest` may depend on `packages/domain` and `packages/surreal`.
- `apps/cli` may depend on all package boundaries.
- `apps/web` should consume public package exports only when the deferred app
  work starts.
