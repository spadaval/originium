---
name: graph-wiki
description: "Use when operating Originium from the CLI as an agent-maintained knowledge base: answer questions, find evidence, import Source Documents, synthesize Wiki Pages, maintain Citations and Wiki Page References, inspect Change Logs, and clean up graph state."
argument-hint: "[subskill] [target]"
user-invocable: true
---

# Originium Graph Wiki

Originium is a CLI-operated knowledge base for agents. It stores trusted source
material, source metadata, agent-written synthesis, frame assignments,
citations, inline Wiki Page References, and edit logs in a graph database. The goal is to
turn raw Source Documents into a maintained Graph Wiki that gets more useful
over time.

The `originium` CLI is the main interface. Prefer the installed command:

```bash
originium
```

If `originium` is not on `PATH` and you are inside the source repository, use the
repo wrapper:

```bash
bun run cli --
```

For command behavior, error reporting, and session setup, load
[standards/cli.md](standards/cli.md).

## Subskills

| Subskill   | Use For                                                                 | Load                                                   |
| ---------- | ----------------------------------------------------------------------- | ------------------------------------------------------ |
| `answer`   | Answering from maintained Wiki Pages and cited evidence                 | [procedures/answer.md](procedures/answer.md)           |
| `source`   | Importing, extracting, reading, searching, or chunking Source Documents | [procedures/source.md](procedures/source.md)           |
| `index`    | Running an LLM-powered indexing pass over a document, chapter, or theme | [procedures/index.md](procedures/index.md)             |
| `page`     | Creating, updating, replacing, appending, patching, or ingesting pages  | [procedures/page.md](procedures/page.md)               |
| `links`    | Cleaning up deprecated Manual Links and preparing governed relations    | [procedures/links.md](procedures/links.md)             |
| `repair`   | Inspecting sessions, lint output, citations, duplicates, and stale work | [procedures/repair.md](procedures/repair.md)           |
| `validate` | Proving a local install with the acceptance workflow                    | [procedures/validate.md](procedures/validate.md)       |
| `concepts` | Graph Wiki record types and evidence model                              | [standards/concepts.md](standards/concepts.md)         |
| `writing`  | Page granularity, citation discipline, retrieval validation, closeout   | [standards/wiki-writing.md](standards/wiki-writing.md) |
| `cli`      | CLI selection, JSON failure reporting, database/session start gate      | [standards/cli.md](standards/cli.md)                   |

## Subskill Rules

1. If the first argument is a subskill, load that subskill reference and follow
   it.
2. If no subskill is named, choose the smallest matching workflow from the table.
   Load only the needed procedure plus any referenced standards.
3. For every meaningful task, start from the CLI/session gate in
   [standards/cli.md](standards/cli.md).
4. For writes, page synthesis, indexing, citation decisions, or cleanup, also
   load [standards/concepts.md](standards/concepts.md) and
   [standards/wiki-writing.md](standards/wiki-writing.md).
5. When a CLI command fails, report `error.operation`, `error.input`,
   `error.reason`, and `error.action` directly.

## Citation And Reference Rules

- Citations target Source Documents only. Do not cite Wiki Pages, Source Text
  Projections, or inline page links as evidence.
- Citation Markers use keyed footnote-style syntax such as
  `[^fm1000-enclosure]`. Numbered footnotes may be rendered from those keys in
  a Projection, but the key remains the canonical handle.
- Wiki Page References use inline page-link syntax such as
  `[[Autonomous Operations]]` or `[[Autonomous Operations|autonomous mining
operations]]`. They are navigation and synthesis context, not evidence.
- Do not put Wiki Page References in Citation footnote sections.
- If a page relies on evidence summarized by another Wiki Page, cite the
  underlying Source Document directly from the current page.
- Generic Manual Links are disabled or deprecated for new semantic graph edges.
  Do not create `related` or `related evidence` graph edges.
- Future semantic graph edges belong in governed Domain Relations with typed
  predicates, evidence, review status, and lint rules.
  See
  [ADR 0005](../../../docs/adr/0005-governed-domain-relations.md)
  before proposing or implementing them.

Example:

```md
CURWB networks support autonomous operations [^curwb-autonomy]. See [[Autonomous Operations]] for the synthesized topic.
```

Non-examples:

```md
CURWB networks support autonomous operations [^autonomous-operations-page].

[^1]: [[Autonomous Operations]]
```

## Modeling Deferrals

Keep the first Graph Wiki model small and evidence-first:

- Contradictions stay in cited Wiki Page prose or follow-up maintenance tasks.
  Do not create first-class contradiction records until repeated workflows prove
  their fields, lifecycle, and review semantics.
- Source-only material stays as a Source Document, Source Text Projection, or
  retrieval/projection context unless a repeated workflow justifies a durable
  Wiki Page or other record.
- Procedural order belongs in cited Wiki Page prose before any procedure-step
  schema exists. Preserve the source order with Citation Markers rather than
  inventing step records.
- Wiki Page-to-Wiki Page reading paths use inline Page Body links. Citations
  target Source Documents only.
- Manual Links and generic semantic graph links are deferred. Future semantic
  links require an accepted governed Domain Relation decision, not ad hoc labels
  or relation-label search.
- Implementation beads should remain focused on citation locators, Wiki Page
  References, answer context, lint, and safe refactors unless a new accepted
  decision expands the model.

## When To Use Originium

Use this skill when a user asks you to:

- answer a question from the maintained knowledge base
- find source-backed context for a topic
- add or ingest a PDF
- create or update a durable knowledge page
- validate or repair citations
- add inline Wiki Page References or clean up deprecated relationships
- inspect what a previous agent session read or changed
- clean up stale, duplicate, or inconsistent graph state
