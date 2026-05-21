# CLI And Session Gate

The `originium` CLI prints JSON. A successful command has `ok: true`, a human
`message`, and usually a `data` object. A failed command has `ok: false` and an
`error` object with `operation`, `input`, `reason`, and `action`.

When a command fails, report those fields directly; they are intended to be
useful technical error messages.

## Command Selection

Prefer the installed command:

```bash
originium
```

If `originium` is not on `PATH` and you are inside the source repository, use the
repo wrapper:

```bash
bun run cli --
```

## Before Any Work

Check which database the CLI will use:

```bash
originium db status
```

If the database is not running or the schema is missing, initialize it:

```bash
originium db start
originium db doctor
originium db apply-schema
```

Start an Agent Session for the user task:

```bash
originium session start --purpose "<specific task>"
```

Keep the returned `agent_session:<id>` and pass it to later reads and writes:

```bash
originium page search "<topic>" --session <session-id>
```

At the end of the task, inspect the session log:

```bash
originium log show --session <session-id>
```

## Embedding Search Failures

`page search` and `retrieval search` use local embeddings. If Ollama or the
embedding model is missing, follow the CLI `error.action`. The common fix is:

```bash
ollama pull nomic-embed-text
```
