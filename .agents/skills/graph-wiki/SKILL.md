---
name: graph-wiki
description: "Use when operating Originium as a Graph Wiki through the CLI: importing or selecting Source Documents, processing Source Headings through Chapter Ingestion, creating or updating Wiki Pages, managing Citations and Citation Markers, adding explicit Manual Links, using Graph Retrieval, and reviewing Agent Session Change Logs."
---

# Graph Wiki Skill

Use this skill when an agent is using Originium's Graph Wiki product surface,
not when making generic repo code changes. The CLI is the agent-facing
mutation surface. SurrealDB graph records are canonical; markdown-like text is
only a Projection.

## Product Rules

- Call the product a Graph Wiki, not a RAG index or markdown wiki.
- Source Documents are trusted raw material. Wiki Pages are agent-authored
  synthesis.
- Do not copy raw Source Document body text into Wiki Pages or durable wiki
  records.
- Page Body prose may include Citation Markers, but Citation targets live in
  `cites` graph relations.
- Use Source Headings as Source Anchors for the POC.
- Do not put raw source addresses, SurrealDB record IDs, file bucket pointers,
  page ranges, or citation metadata into Page Body prose.
- Create Manual Links only when explicitly requested. Do not infer or auto-add
  semantic links.
- Every meaningful read or write should happen in an Agent Session so Change
  Logs can be inspected.

## Start A Work Session

Start by checking the active database target and creating an Agent Session:

```bash
originium db status
originium session start --purpose "<specific work purpose>"
```

Keep the returned `agent_session:<id>` and pass it as `--session <session-id>`
to later commands that read or write Graph Wiki state.

If SurrealDB or schema setup is part of the task:

```bash
originium db start
originium db doctor
originium db apply-schema
```

When a command fails, report the concrete command, operation, input identifier,
reason, and next action from the CLI output. Do not hide failures behind a
generic summary.

## Source Context

Import a new trusted PDF only when the task asks you to ingest a new Source
Document:

```bash
originium source import-pdf <pdf-path> --session <session-id>
originium source headings <pdf-path> --source <source-document-id> --session <session-id>
```

For an existing Source Document, inspect headings and select one Source Heading
or chapter-sized anchor. Process large documents one Source Heading at a time;
do not load a whole PDF into context.

Use Chapter Ingestion to create or refresh the Ingestion Chunk and optional Wiki
Page/Citation state:

```bash
originium ingest chapter \
  --source <source-document-id> \
  --heading <source-heading-id> \
  --title "<wiki page title>" \
  --body "<page body with [^citation-key] marker>" \
  --key <citation-key> \
  --label "<human citation label>" \
  --session <session-id>
```

If you only need chapter context and are not ready to update a Wiki Page, omit
`--title`, `--body`, and citation options.

## Wiki Pages

Use Wiki Pages for concise synthesis. Page Body should be readable prose with
Citation Markers such as `[^source]` or `[^safety-systems]`.

```bash
originium page create --title "<title>" --body "<body>" --session <session-id>
originium page read <wiki-page-id> --session <session-id>
originium page update --title "<title>" --body "<body>" --session <session-id>
```

Prefer updating an existing Wiki Page when the topic already exists. Repeated
passes over a Source Document should improve graph state rather than creating
duplicates.

## Citations

Every Citation Marker used in Page Body must have a matching Citation relation.
The marker key and graph Citation key must agree.

```bash
originium citation add \
  --page <wiki-page-id> \
  --heading <source-heading-id> \
  --key <citation-key> \
  --label "<label>" \
  --quote "<short supporting quote when useful>" \
  --session <session-id>

originium citation validate <wiki-page-id> --session <session-id>
originium citation list <wiki-page-id> --session <session-id>
```

If validation reports `missing-graph-citation`, add the Citation relation or
remove the marker. If it reports `unused-graph-citation`, add the matching
marker or remove/rewrite the stale Citation through the supported workflow.

## Manual Links

Manual Links are explicit graph relationships. Add one only when the user or
task asks for a link and gives a reason.

```bash
originium link add \
  --from <record-id> \
  --to <record-id> \
  --reason "<explicit reason>" \
  --label "<optional label>" \
  --session <session-id>

originium link list --record <record-id> --session <session-id>
```

Do not use Manual Links as a substitute for Citations.

## Retrieval

Use Graph Retrieval to find existing Wiki Pages first, with cited Source
Heading evidence attached when available:

```bash
originium page search "<query>" --session <session-id>
originium retrieval search "<query>" --session <session-id>
```

Graph Retrieval uses local Ollama embeddings when available. If Ollama or the
model is missing, follow the CLI's action field, usually:

```bash
ollama pull nomic-embed-text
```

Do not treat Source Heading fallback results as a replacement for durable Wiki
Page synthesis. If retrieval finds only Source Headings, create or update a
Wiki Page before treating the knowledge as compiled.

## Change Log Review

End Graph Wiki work by inspecting the Agent Session log:

```bash
originium log show --session <session-id>
```

Confirm the log includes the reads and writes you performed, concrete target
records, and before/after data for edits when available. Use this log to
explain what changed and to plan compensating edits if something was wrong.

## Language To Preserve

- Graph Wiki
- Source Document
- Wiki Page
- Page Body
- Source Anchor
- Source Heading
- Citation
- Citation Marker
- Projection
- Change Log
- Agent Session
- Chapter Ingestion
- Ingestion Chunk
- Manual Link
- Graph Retrieval
