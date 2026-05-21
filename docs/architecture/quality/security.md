# Security

## Source Document Safety

- Trusted Source Documents are raw material, not automatically safe output.
- Do not paste full extracted Source Document body text into logs, beads,
  prompts, Wiki Pages, Change Logs, durable events, or tracker notes.
- Source Text Projections may persist extracted text only as lossy, rebuildable
  search caches with source document ID, page range, extraction provenance, and
  warning context.
- Durable records may store stable metadata, source document IDs, outline paths,
  page ranges, hashes, MIME types, extraction methods, and concise diagnostics.
- Wiki Pages may quote short source excerpts when needed for citation evidence,
  but should not become a copy of the source document.

## Credential Handling

- Do not persist `OPENAI_API_KEY`, Ollama credentials, SurrealDB credentials,
  GitHub tokens, cookies, authorization headers, or provider response dumps in
  logs, Change Logs, beads, or generated artifacts.
- CLI commands should read credentials from explicit environment variables or
  local config boundaries, then report missing credentials with the operation,
  variable or config key, and next useful action.
- Tests should prefer fake credentials or isolated local services.

## Command And Log Safety

- Command output may be used as bounded observation.
- Durable logs should summarize operation, target, status, stable error code or
  concise message, retryability when useful, and timestamps.
- Do not persist raw stdout/stderr dumps, raw prompts, generated code, provider
  completions, full diffs, or secrets.
- If a failure depends on a long log, store a short summary and artifact path
  rather than pasting the full output into the tracker.

## External Systems And Failure Policy

- SurrealDB, Ollama, PDF extraction, browser automation, filesystem access, and
  provider credentials are fallible runtime dependencies.
- Required dependencies fail the operation with a bounded technical error.
- Optional signals may degrade to unavailable summaries when the core operation
  can still complete safely.
- Failure records may include phase names, stable error codes, retryability,
  concise messages, counters, identifiers, and timestamps.
