# Core Concepts

**Graph Wiki**: the maintained knowledge base. Its canonical state is graph
records in SurrealDB, not markdown files and not an opaque RAG index.

**Source Document**: trusted raw material, such as an imported PDF. Source
Documents provide evidence, but they are not the final compiled knowledge layer.

**Source Text Projection**: a derived, rebuildable, lossy text cache extracted
from a Source Document for search and retrieval. For paginated Source
Documents, durable projections are per-page and can be rebuilt from the Source
Document. They are useful for candidate finding, snippets, page ranges,
checksums, and extractor provenance, but they are not canonical evidence and
should not be treated as exact source wording.

**Ingestion Chunk**: an agent-readable projection of one page range,
chapter-sized slice, or theme. Use it to process large documents without
loading the whole document into context.

**Wiki Page**: durable agent-written synthesis about a topic, entity, question,
or procedure. Wiki Pages are the primary place to answer from.

**Page Body**: the prose field of a Wiki Page. It may contain Citation Markers
such as `[^network-architecture]`, but it should not contain raw record IDs,
file bucket pointers, page ranges, or source metadata.

**Citation Marker**: an inline marker in a Page Body. It is only a handle.

**Citation**: a graph relation from a Wiki Page to a Source Document. The
Citation `key` must match the Page Body Citation Marker key. Page ranges,
quotes, context, projection IDs, text hashes, and supported-claim details live
as citation-local locator metadata.

**Manual Link**: an explicit graph relationship between records. Create one only
when the user asks for a relationship and you can state the reason.

**Agent Session**: a bounded unit of agent work. Start one for every meaningful
task.

**Change Log**: a durable record of CLI reads and writes. Use it to explain,
audit, and repair agent work.

**Graph Retrieval**: search over Wiki Pages, Source Documents, and Source Text
Projections, with graph signals and local embeddings when available.

**Page Candidate**: a Wiki Page candidate returned for concept reuse before a
write. Candidate search is distinct from answer retrieval and evidence search:
it asks "should I update an existing page instead of creating another one?"
