---
name: graph-wiki
description: "Use when operating Originium as a Graph Wiki from the CLI: answering questions from maintained knowledge, finding evidence, importing Source Documents, creating or updating Wiki Pages, maintaining Citations and Manual Links, inspecting Change Logs, and performing cleanup."
---

# Graph Wiki Skill

Use this skill when you need Originium to behave like a maintained knowledge
base. The user may ask you to look up a fact, answer a question with context,
add a document, synthesize or update wiki knowledge, validate citations, inspect
past edits, or clean up graph state.

Originium is a Graph Wiki, not a generic RAG index and not a folder of markdown
files. The CLI is the agent-facing interface. SurrealDB graph records are the
canonical state. Markdown-like text is only a human/agent Projection.

## Operating Model

- Prefer the installed `originium` command. Do not assume the skill lives inside
  the Originium source repository. If `originium` is not on `PATH` and you are in
  a source checkout, use the repo's documented wrapper, such as `bun run cli --`.
- Use the CLI for Graph Wiki reads and writes. Do not edit SurrealDB directly
  unless the user explicitly asks for low-level database inspection or repair.
- Start each meaningful task with an Agent Session and pass `--session` to later
  Graph Wiki commands so the Change Log can explain what happened.
- Read command output as structured JSON. Successful results include `ok`,
  `message`, and `data`; failures include `error.operation`, `error.input`,
  `error.reason`, and `error.action`.
- When reporting a failure, preserve the concrete operation, input identifier,
  actionable reason, and next action from the CLI output.

## Product Rules

- Call the product a Graph Wiki.
- Source Documents are trusted raw material. Wiki Pages are agent-authored
  synthesis.
- Do not copy raw Source Document body text into Wiki Pages or durable wiki
  records. Use short quotes in Citation metadata only when useful.
- Page Body prose may include Citation Markers such as `[^source-key]`, but the
  Citation target lives in the `cites` graph relation.
- Citation Marker keys must match graph Citation keys.
- Use Source Headings as Source Anchors unless a later Originium release exposes
  more precise anchors.
- Do not put raw source addresses, SurrealDB record IDs, file bucket pointers,
  page ranges, or citation metadata into Page Body prose.
- Create Manual Links only when explicitly requested and only with a reason.
- Prefer updating existing Wiki Pages over creating duplicates.

## Start Any Job

First identify the active database target:

```bash
originium db status
```

If the database is unavailable or uninitialized, use the local setup commands:

```bash
originium db start
originium db doctor
originium db apply-schema
```

Create an Agent Session for the specific user task:

```bash
originium session start --purpose "<specific user task>"
```

Keep the returned ID, for example `agent_session:<id>`, and pass it to later
commands:

```bash
originium page search "<query>" --session <session-id>
```

## Answer A Question

Use maintained Wiki Pages first. They are the compiled knowledge layer:

```bash
originium page search "<question or topic>" --session <session-id>
originium retrieval search "<question or topic>" --session <session-id>
```

Then read the strongest Wiki Page candidates:

```bash
originium page read <wiki-page-id> --session <session-id>
originium citation list <wiki-page-id> --session <session-id>
originium citation validate <wiki-page-id> --session <session-id>
```

Answer from Wiki Page synthesis and cited Source Heading evidence. If retrieval
only finds Source Headings, say the Graph Wiki has not synthesized that topic
yet. Use those Source Headings as context, but do not present them as maintained
wiki knowledge unless you create or update a Wiki Page.

If Graph Retrieval fails because Ollama or the embedding model is unavailable,
follow the CLI `error.action`. The usual local fix is:

```bash
ollama pull nomic-embed-text
```

## Add A Source Document

Import a trusted PDF only when the user asks you to add or ingest a document:

```bash
originium source import-pdf <pdf-path> --session <session-id>
```

Record the returned Source Document ID. Then project Source Headings from the
same PDF path:

```bash
originium source headings <pdf-path> --source <source-document-id> --session <session-id>
```

Process large documents one Source Heading or chapter-sized section at a time.
Do not load a whole large PDF into agent context.

To prepare one chapter or heading for synthesis:

```bash
originium ingest chapter \
  --source <source-document-id> \
  --heading <source-heading-id> \
  --session <session-id>
```

When you are ready to create or refresh a Wiki Page from that heading, include a
title, Page Body, and matching citation key:

```bash
originium ingest chapter \
  --source <source-document-id> \
  --heading <source-heading-id> \
  --title "<wiki page title>" \
  --body "<concise synthesis with [^citation-key] marker>" \
  --key <citation-key> \
  --label "<human citation label>" \
  --session <session-id>
```

## Create Or Update Wiki Pages

Write concise synthesis. Keep Page Body prose useful to a reader who does not
care about storage internals.

```bash
originium page create \
  --title "<title>" \
  --body "<body with Citation Markers when claims need evidence>" \
  --session <session-id>

originium page update \
  --title "<title>" \
  --body "<revised body>" \
  --session <session-id>
```

After writing a page that uses Citation Markers, create or refresh matching
Citation graph relations:

```bash
originium citation add \
  --page <wiki-page-id> \
  --heading <source-heading-id> \
  --key <citation-key> \
  --label "<label>" \
  --quote "<short supporting quote when useful>" \
  --session <session-id>

originium citation validate <wiki-page-id> --session <session-id>
```

If validation reports `missing-graph-citation`, add the Citation relation or
remove the marker. If it reports `unused-graph-citation`, add the matching
marker or revise the stale Citation through the supported CLI workflow. If it
reports `duplicate-marker` or `invalid-marker-syntax`, rewrite the Page Body.

## Add Manual Links

Manual Links are explicit graph relationships. Add one only when the user asks
for a relationship or when a task specifically requires one.

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

## Cleanup And Maintenance

Use maintenance commands to make graph state inspectable before changing it:

```bash
originium db doctor
originium page search "<topic>" --session <session-id>
originium citation validate <wiki-page-id> --session <session-id>
originium citation list <wiki-page-id> --session <session-id>
originium link list --record <record-id> --session <session-id>
originium log show --session <session-id>
```

Common cleanup actions:

- Duplicate topic: update the better existing Wiki Page instead of creating
  another page.
- Bad Page Body: use `page update` with corrected synthesis.
- Citation mismatch: align Citation Markers and Citation graph keys, then run
  `citation validate` again.
- Bad Manual Link: inspect the link and Change Log first; if the CLI has no
  supported delete/repair command, report the exact unsupported cleanup needed
  rather than editing the database silently.
- Suspect previous edit: inspect the Agent Session Change Log, then make a
  compensating CLI edit so the correction is also logged.

The POC also has an end-to-end acceptance harness for local validation:

```bash
originium acceptance poc <pdf-path>
```

## End The Job

Before handing back, inspect the Agent Session:

```bash
originium log show --session <session-id>
```

Summarize what you read, what you changed, the important record IDs, and any
remaining unsupported cleanup or follow-up. If a command failed, quote the CLI's
operation, input, reason, and action in your summary.

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
