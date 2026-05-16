---
name: graph-wiki
description: "Use when working on Originium product behavior, data modeling, ingestion, citations, graph retrieval, or agent-written wiki state."
---

# Graph Wiki Skill

Use this skill when working on Originium product behavior, data modeling, ingestion, citations, graph retrieval, or agent-written wiki state.

## Canonical Product Rules

- Call the product a Graph Wiki, not a generic RAG index or markdown wiki.
- SurrealDB graph records are canonical. Markdown-like text is a Projection for humans and agents.
- Source Documents are trusted raw material. Wiki Pages are agent-authored synthesis.
- Do not copy extracted Source Document body text into Wiki Pages or durable wiki records.
- Source Headings are the default Source Anchors for the first proof of concept.
- Citation Markers may appear in Page Bodies, but Citation targets live in graph relations.
- Manual Links are created only when explicitly requested.
- Agent writes are allowed for the proof of concept, with Agent Sessions and Change Logs used for inspection and undo workflows.

## Implementation Rules

- Keep package boundaries aligned with `docs/architecture/index.md`.
- Prefer deterministic record IDs for Source Documents, Source Headings, and Wiki Pages when practical.
- Process large Source Documents through Chapter Ingestion and Ingestion Chunks instead of whole-document context loading.
- Store schema definitions in checked-in `.surql` files and expose schema application through the CLI.
- Local database commands should manage a project-owned SurrealDB process when implemented, while still supporting `ORIGINIUM_SURREAL_URL`.
- When an operation fails, report the operation, input identifier, concrete reason, and next useful action.

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
