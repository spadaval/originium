# Reliability

## Local Runtime Recovery

- Local SurrealDB lifecycle should be explicit through CLI commands, not hidden
  ambient assumptions.
- `originium db doctor` should diagnose URL, namespace, database, auth, file
  bucket support, and actionable setup failures.
- If the CLI manages a local process, process identifiers, data directory, and
  configured binary path should be visible in status output.

## Agent Work Recovery

- Agent Sessions and Change Logs are the recovery primitive for wiki edits.
- Change Logs should record bounded before/after data where practical so a
  later agent can write compensating edits.
- Automated rollback is out of scope for the POC; inspectable, reversible
  history is in scope.
- Repeated imports and ingestion passes should update existing graph state where
  deterministic IDs make that safe.

## Failure Modes

- PDF extraction failure should name the file, extraction phase, and fallback or
  next action.
- File bucket failure should name the bucket operation, source document ID or
  path, and SurrealDB capability or configuration problem.
- Ollama failure should name the embedding operation, model, endpoint, and next
  action.
- Citation validation failure should name the Wiki Page, Citation Marker key,
  graph Citation key, and mismatch class.
- Query failure should name the query operation, target record or search string,
  and concrete database error when available.

## Storage Recovery

- Schema changes live in checked-in `.surql` files and should be applied
  idempotently.
- Local data can be reset by using a project-owned data directory and clear CLI
  status output.
- Do not rely on hidden process state when reporting whether the database is
  usable.
