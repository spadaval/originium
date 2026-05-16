# Host-Direct Operations

This runbook is the operator entry point for the proven host-direct Originium
web app. It is not a split deployment or container contract.

Use it when a fresh agent or local operator needs to start the app, validate the
runtime, capture evidence, or classify known non-blocking gate failures.

## Topology

The current runtime keeps five components on one trusted host:

| Component        | Runtime role                                                                 |
| ---------------- | ---------------------------------------------------------------------------- |
| SurrealDB        | Local database process and Source PDF file-bucket storage.                   |
| CLI              | Local command boundary for database, schema, ingestion, and Graph Wiki work. |
| Codex app-server | Local WebSocket JSON-RPC process for Agent Workspace turns.                  |
| Web backend      | `apps/web` server process, health checks, CLI/Codex boundaries, PDF routes.  |
| Web frontend     | Browser UI served by `apps/web`.                                             |

The browser must call the Originium backend. It must not receive direct
SurrealDB credentials, local file paths, CLI access, or Codex app-server access.

Split deployment, remote SurrealDB, durable agent workers, and containers are
deferred to `originium-iv7`.

## Start

Install dependencies and build the CLI:

```bash
bun install
bun run --cwd apps/cli build
```

Start the local database and apply the schema:

```bash
./apps/cli/dist/originium db start
./apps/cli/dist/originium db apply-schema
```

Start the web app:

```bash
bun run dev:web
```

Open the main routes:

- `http://127.0.0.1:3000/workspace`
- `http://127.0.0.1:3000/sources`

The web backend can start Codex app-server when a workspace turn needs it. To
start it explicitly before validation:

```bash
codex app-server --listen ws://127.0.0.1:3001
```

## Health

Use the web health route as the runtime readiness check:

```bash
curl -fsS http://127.0.0.1:3000/api/health
```

The health response should report concrete status for:

- SurrealDB
- CLI
- Codex app-server
- Source PDF bucket
- web backend configuration

Useful focused checks:

```bash
./apps/cli/dist/originium db status
bun run --cwd apps/web check:typecheck
bun run --cwd apps/web build
bun test
```

## Validation Scenario

The integrated host-direct scenario should prove product behavior from the
operator point of view:

1. Open `/workspace`.
2. Send a simple Agent Workspace prompt.
3. Verify Agent Activity records for the Codex turn.
4. Verify Change Log records remain separate from Agent Activity.
5. Open `/sources`.
6. Load the known PDF Source Document.
7. Open `wiki_page:poc_mining_deployment`.
8. Inspect the graph neighborhood.
9. Save a small Page Body edit.
10. Verify the saved edit creates a Change Log record.

Known validation records from the completed host-direct milestone:

- Source Document:
  `source_document:curwb_deployment_for_autonomous_operations_in_open_pit_mining_66dd4ae65769`
- Wiki Page: `wiki_page:poc_mining_deployment`
- Integrated validation bead: `originium-7fl`
- Integrated closeout bead: `originium-ros`
- Host-direct milestone: `originium-ogo`

`originium-7fl` passed at commit `1551acc` with:

- runtime health green for SurrealDB, CLI, Codex app-server, Source PDF bucket,
  and web backend;
- `/workspace` chat through Codex with response `validation ping`;
- Agent Activity persisted separately from Change Log records;
- `/sources` loaded the known PDF Source Document;
- the PDF route returned a 27,502,694-byte PDF;
- graph neighborhood rendered for `wiki_page:poc_mining_deployment`;
- Page Body save created
  `change_log:bca0cab78f1b4dab95a0c6f983ebbf1a`.

## Evidence

Capture evidence that lets the next agent distinguish product behavior from
local setup drift:

- exact commands;
- URLs;
- HTTP status, content type, and response size for PDF routes;
- record IDs such as `agent_session:*`, `agent_activity:*`,
  `source_document:*`, `wiki_page:*`, and `change_log:*`;
- concise browser observations or screenshots when validating UI state;
- failure classification with operation, input or identifier, reason, and
  action.

For Agent Workspace validation, explicitly prove whether a record is Agent
Activity or Change Log. Codex protocol events belong in Agent Activity; Graph
Wiki mutations belong in Change Log.

## Known Gate Classifications

Do not broaden unrelated feature or validation beads into these known gate
repairs unless the bead explicitly owns that gate:

| Bead            | Gate failure                                                                 |
| --------------- | ---------------------------------------------------------------------------- |
| `originium-dlg` | Root `bun run check:typecheck` TSX configuration failure.                    |
| `originium-kxi` | Package-local typecheck/build scripts accidentally compile web TSX.          |
| `originium-473` | Biome resolver/lint drift around TanStack route imports and adjacent checks. |
| `originium-5iv` | Repo-wide markdown formatting drift.                                         |

Closeouts may classify these failures to their owning beads instead of fixing
them inside unrelated work.

## Deferred Topology

The current host-direct runtime intentionally does not promise:

- remote SurrealDB or remote file-bucket storage;
- split frontend/backend deployment;
- split web backend/agent worker deployment;
- container packaging;
- durable distributed job/session ownership.

Those require explicit service, storage, credential, API, origin-policy,
job/session, and validation contracts before implementation. Track that future
work through `originium-iv7`.
