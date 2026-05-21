---
name: graph-wiki
description: "Use when operating Originium from the CLI as an agent-maintained knowledge base: answer questions, find evidence, import Source Documents, synthesize Wiki Pages, maintain Citations and Manual Links, inspect Change Logs, and clean up graph state."
argument-hint: "[subskill] [target]"
user-invocable: true
---

# Originium Graph Wiki

Originium is a CLI-operated knowledge base for agents. It stores trusted source
material, source metadata, agent-written synthesis, frame assignments,
citations, explicit links, and edit logs in a graph database. The goal is to
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
| `links`    | Adding or inspecting explicit Manual Links                              | [procedures/links.md](procedures/links.md)             |
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

## When To Use Originium

Use this skill when a user asks you to:

- answer a question from the maintained knowledge base
- find source-backed context for a topic
- add or ingest a PDF
- create or update a durable knowledge page
- validate or repair citations
- add explicit relationships between records
- inspect what a previous agent session read or changed
- clean up stale, duplicate, or inconsistent graph state
