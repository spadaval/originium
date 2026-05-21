# Canonical Graph Wiki State Lives In SurrealDB

Originium is building a Graph Wiki rather than a markdown-backed wiki or a generic RAG index. The canonical state of Source Documents, Wiki Pages, Citations, Manual Links, Change Logs, retrieval metadata, and graph relations lives in SurrealDB; markdown-like text is only a Page Body or Projection for humans and LLMs. This keeps citations, links, file metadata, graph authority, access/edit history, and retrieval signals queryable as first-class records instead of embedding them in prose.

SurrealDB is also the chosen file and graph store for the proof of concept.
Source Document binaries should live in Surreal file buckets as immutable
canonical evidence, Source Text Projections may store lossy extracted text and
outline metadata as rebuildable search caches, and Wiki Pages should store
synthesis prose plus graph-backed Citations.
Projection rows may be indexed and embedded, but citation evidence still points
back to Source Documents through Citation relations with citation-local locator
metadata. The
first implementation may use raw SurrealQL where the type-safe query layer
cannot express file buckets, vector/full-text search, graph relations,
graph-aware reranking, or schema setup cleanly.
