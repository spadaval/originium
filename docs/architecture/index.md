# Architecture

Originium stores canonical Graph Wiki state in SurrealDB and exposes derived
projections for humans, agents, and retrieval.

## Start Here

- [Quality](quality/index.md): baseline standards for errors, validation, and scope control.
- [Surrealist inspection](surrealist-inspection.md): POC database inspection workflow and queries.
- [Host-direct operations](../operations/host-direct.md): local startup,
  health checks, validation scenario, and known gate classifications.
- [ADRs](../adr): durable architecture decisions and historical context.
- [SPEC.md](../../SPEC.md): source of truth for Graph Wiki behavior.
- [CONTEXT.md](../../CONTEXT.md): source of truth for product language.

## Package Ownership

| Area             | Owner                 | Purpose                                                                                                                       |
| ---------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Domain language  | `packages/domain`     | Shared Graph Wiki types, IDs, and small pure helpers.                                                                         |
| SurrealDB access | `packages/surreal`    | Database configuration, schema file references, file-bucket helpers, and shared persistence helpers such as Agent Activity.   |
| PDF ingestion    | `packages/pdf-ingest` | Source Document import, Source Text Projection generation, and Chapter Ingestion boundaries.                                  |
| CLI              | `apps/cli`            | Local database commands, schema application, ingestion entry points, retrieval workflows, and agent-facing query composition. |
| Web              | `apps/web`            | TanStack Start shell, host-direct browser/backend seams, and browser-facing Graph Wiki projection/retrieval composition.      |
| Schema           | `schema`              | Checked-in SurrealQL definitions.                                                                                             |

## Runtime Summary

1. A Source Document is imported through the CLI.
2. The PDF binary is stored through SurrealDB file bucket support when configured.
3. Extraction creates outline metadata and per-page Source Text Projections:
   lossy, rebuildable search caches with page numbers, provenance, and retrieval
   metadata.
4. Ingestion reads source text through Source Text Projections or one-off
   projections from the stored Source Document and processes one page range,
   chapter, theme, or Ingestion Chunk at a time.
5. Agents write Wiki Pages, Citations, inline Wiki Page References, Agent
   Sessions, and Change Logs into SurrealDB.
   Source Document provenance and Wiki Page semantic roles are stored as
   frame-guided metadata, not Page Body frontmatter.
6. Retrieval uses SurrealDB hybrid candidate search across Wiki Pages, Source
   Documents, and Source Text Projections, then applies graph-aware reranking
   from Citation relations, Wiki Page References, future governed Domain
   Relations, and local graph neighborhoods.
7. During the POC, the CLI renders agent-facing Projections and Surrealist is
   used for database-management inspection and manual validation.
8. `apps/web` serves browser-facing route shells and backend seams for Source
   Documents, Wiki Pages, Agent Sessions, Change Logs, Agent Activity, and PDF
   streaming while downstream epics fill in the interactive workflows.

Source Documents remain immutable canonical evidence. Source Text Projections
are durable only as derived caches: they may be indexed, embedded, deleted, and
rebuilt without changing the evidence record. Projection text may lose
formatting, diagrams, emphasis, tables, layout, and exact reading order, so
citations target Source Documents with citation-local locator metadata rather
than projection rows.

Retrieval has four separate jobs:

- Concept reuse checks look for existing Wiki Pages before creating new
  synthesis.
- Answer retrieval finds synthesized Wiki Page context and follows Citations to
  evidence.
- Evidence search inspects Source Documents and Source Text Projections with
  page-range provenance.
- Graph neighborhood inspection traverses known records through Citations,
  Wiki Page References, Agent Sessions, future governed Domain Relations, and
  nearby Wiki Pages or cited Source Documents.

Contradictions should be represented as cited disagreement in Wiki Page prose
and retrieval output until repeated workflows justify a dedicated contradiction
record or relation. Do not encode a hardcoded contradiction schema in the first
retrieval foundation.

The current proof-of-concept graph may be rebuilt when frame-guided metadata
changes the schema. Compatibility migrations are deferred until Originium has
durable user data that cannot be regenerated from Source Documents and checked-in
catalogs.

## Single-Host Topology

The current runtime is host-direct. It does not use containers, a process
supervisor, or a remote service boundary.

| Component        | Runs today                          | Configuration                                                                                                                                                                                                                                                                               |
| ---------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SurrealDB        | Local process on the developer host | `ORIGINIUM_SURREAL_BIN`, `ORIGINIUM_SURREAL_BIND`, `ORIGINIUM_SURREAL_DATA_DIR`, `ORIGINIUM_SURREAL_BUCKET_DIR`, `ORIGINIUM_SURREAL_PID_FILE`, `ORIGINIUM_SURREAL_URL`, `ORIGINIUM_SURREAL_NAMESPACE`, `ORIGINIUM_SURREAL_DATABASE`, `ORIGINIUM_SURREAL_USER`, `ORIGINIUM_SURREAL_PASSWORD` |
| CLI              | Developer shell on the same host    | SurrealDB variables above, `ORIGINIUM_SESSION`, `ORIGINIUM_OLLAMA_URL`, `ORIGINIUM_OLLAMA_EMBED_MODEL`                                                                                                                                                                                      |
| Codex app-server | Same host as the future web backend | `ORIGINIUM_CODEX_APP_SERVER_BIND`, `ORIGINIUM_CODEX_APP_SERVER_URL`                                                                                                                                                                                                                         |
| Web backend      | `apps/web` server process on host   | SurrealDB variables above, `ORIGINIUM_WEB_BACKEND_BIND`, `ORIGINIUM_CLI_PATH`, `ORIGINIUM_WEB_SOURCE_PDFS_ENABLED`, `ORIGINIUM_WEB_SOURCE_PDF_ROUTE_PREFIX`, `ORIGINIUM_WEB_SOURCE_PDF_BUCKET_DIR`                                                                                          |
| Web frontend     | Browser served by `apps/web`        | No direct runtime contract; it must call the Originium backend, not SurrealDB, local files, the CLI, or Codex app-server.                                                                                                                                                                   |

For now, SurrealDB, the CLI, the web backend, and Codex app-server must
remain co-located on one trusted host because the system relies on local process
management, local file-bucket paths, shell/CLI execution, and an owned
app-server process boundary. The frontend may run in a browser, but it is only
trusted to talk to the Originium backend served from that same deployment.
Container packaging is intentionally deferred until those local contracts are
replaced by explicit service, storage, credential, and job/session boundaries.

The web backend owns the concrete Codex app-server boundary. It uses the
configured Codex app-server URL for `/readyz` reachability checks, derives the
WebSocket JSON-RPC protocol endpoint from that URL, and can start a local
`codex app-server --listen ws://host:port` process from
`ORIGINIUM_CODEX_APP_SERVER_BIND` when no reachable app-server is already
attached. Streamed Codex protocol notifications are persisted as Agent Activity
records, not Change Log entries.

Before SurrealDB can split to another host, Originium needs an explicit remote
database operating contract: reachable `ORIGINIUM_SURREAL_URL`, non-default
credentials, namespace/database provisioning, file-bucket storage that is not a
local developer path, migration/schema application rules, and validation that
PDF streaming works without exposing bucket paths.

Before the frontend can split from the backend, the backend API must provide all
browser-visible capabilities: Graph Wiki projections, PDF streaming, citation
validation, chat/activity streaming, authentication and origin policy. The
browser still must not receive direct SurrealDB credentials or Codex app-server
access.

Before agent workers can split from the web backend, agent work needs a durable
job/session protocol, explicit workspace and filesystem ownership, streamed
Agent Activity persistence, cancellation/retry behavior, and a credential model.
Until then, the backend owns Codex app-server and CLI/RPC execution directly.

## Host-Direct Operation

Use [Host-direct operations](../operations/host-direct.md) for local startup,
health checks, integrated validation scenarios, evidence capture, and known
gate classifications.

Key environment variables:

- `ORIGINIUM_SURREAL_BIN`: SurrealDB binary for `db start`.
- `ORIGINIUM_SURREAL_BIND`: managed SurrealDB listen target.
- `ORIGINIUM_SURREAL_URL`: SurrealDB URL used by the CLI and web backend.
- `ORIGINIUM_SURREAL_NAMESPACE` and `ORIGINIUM_SURREAL_DATABASE`: active
  namespace/database.
- `ORIGINIUM_SURREAL_USER` and `ORIGINIUM_SURREAL_PASSWORD`: database auth.
- `ORIGINIUM_SURREAL_DATA_DIR`, `ORIGINIUM_SURREAL_BUCKET_DIR`, and
  `ORIGINIUM_SURREAL_PID_FILE`: host-local managed database paths.
- `ORIGINIUM_CLI_PATH`: CLI executable used by the web backend; defaults to
  `apps/cli/dist/originium`.
- `ORIGINIUM_CODEX_APP_SERVER_BIND`: app-server listen target used when the
  backend starts Codex app-server.
- `ORIGINIUM_CODEX_APP_SERVER_URL`: reachable Codex app-server endpoint for
  `/readyz` and WebSocket protocol derivation.
- `ORIGINIUM_WEB_BACKEND_BIND`: web backend listen target.
- `ORIGINIUM_WEB_SOURCE_PDFS_ENABLED`: enables backend PDF streaming.
- `ORIGINIUM_WEB_SOURCE_PDF_ROUTE_PREFIX`: Source PDF route prefix; defaults to
  `/sources/pdf`.
- `ORIGINIUM_WEB_SOURCE_PDF_BUCKET_DIR`: Source PDF bucket directory; defaults
  to the SurrealDB bucket directory.

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
- `apps/web` should consume public package exports and keep direct SurrealDB
  access behind backend-owned seams.
