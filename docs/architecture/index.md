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
| Web              | `apps/web`            | TanStack Start shell and host-direct browser/backend seams.               |
| Schema           | `schema`              | Checked-in SurrealQL definitions.                                         |

## Runtime Summary

1. A Source Document is imported through the CLI.
2. The PDF binary is stored through SurrealDB file bucket support when configured.
3. Ingestion reads source text from the stored Source Document and processes one Source Heading or Ingestion Chunk at a time.
4. Agents write Wiki Pages, Citations, Manual Links, Agent Sessions, and Change Logs into SurrealDB.
5. During the POC, the CLI renders agent-facing Projections and Surrealist is
   used for database-management inspection and manual validation.
6. `apps/web` serves browser-facing route shells and backend seams for Source
   Documents, Wiki Pages, Agent Sessions, Change Logs, Agent Activity, and PDF
   streaming while downstream epics fill in the interactive workflows.

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

Install dependencies and build the CLI before using the host-direct web app:

```bash
bun install
bun run --cwd apps/cli build
```

Start the local database, apply the schema, then start the web server:

```bash
./apps/cli/dist/originium db start
./apps/cli/dist/originium db apply-schema
bun run dev:web
```

The default web backend listens on `127.0.0.1:3000`; open
`http://127.0.0.1:3000/workspace` for the Agent Workspace and
`http://127.0.0.1:3000/sources` for Source Documents. `apps/web` also exposes
`/api/health`, which checks the five host-direct components: SurrealDB, CLI,
Codex app-server, Source PDF bucket, and web backend configuration.

Codex app-server may be started by the web backend when a workspace turn needs
it. Operators can also start it explicitly before health validation:

```bash
codex app-server --listen ws://127.0.0.1:3001
```

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

Validation for the integrated host-direct scenario should combine the static
repo gates with live runtime proof:

```bash
bun run check:markdown
bun run check:biome
bun run check:typecheck
bun run check:build
bun test
curl -fsS http://127.0.0.1:3000/api/health
```

The validation bead `originium-7fl` passed at commit `1551acc` with runtime
health green for SurrealDB, CLI, Codex app-server, Source PDF bucket, and web
backend. It also proved `/workspace` chat through Codex with response
`validation ping`; Agent Activity persisted separately from Change Log records;
`/sources` loaded
`source_document:curwb_deployment_for_autonomous_operations_in_open_pit_mining_66dd4ae65769`
and streamed its 27,502,694-byte PDF; the graph neighborhood rendered for
`wiki_page:poc_mining_deployment`; and a Page Body save created
`change_log:bca0cab78f1b4dab95a0c6f983ebbf1a`.

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
