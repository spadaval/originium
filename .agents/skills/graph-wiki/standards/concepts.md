# Core Concepts

**Graph Wiki**: the maintained knowledge base. Its canonical state is graph
records in SurrealDB, not markdown files and not an opaque RAG index.

**Source Document**: trusted raw material, such as an imported PDF. Source
Documents provide evidence, but they are not the final compiled knowledge layer.
Source Document provenance, corpus, document class, publisher, product family,
publication date, URL, and trust status belong on the Source Document as
metadata when known.

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
procedure, requirement set, technology component, reference architecture, use
case, or operational risk. Wiki Pages are the primary place to answer from.

**Page Body**: the prose field of a Wiki Page. It may contain Citation Markers
such as `[^network-architecture]` and inline Wiki Page References such as
`[[Autonomous Operations]]`, but it should not contain raw record IDs, file
bucket pointers, page ranges, or source metadata.

**Citation Marker**: an inline keyed footnote-style marker in a Page Body. It
is only a handle. Renderers may project markers as numbered footnotes, but the
key remains canonical.

**Citation**: a graph relation from a Wiki Page to a Source Document. The
Citation `key` must match the Page Body Citation Marker key. Page ranges,
quotes, context, projection IDs, text hashes, and supported-claim details live
as citation-local locator metadata. Citations target Source Documents only; do
not cite Wiki Pages or Source Text Projections.

**Wiki Page Reference**: an inline Page Body link to another Wiki Page, using
`[[Page Title]]` or `[[Page Title|label]]`. It is navigation and synthesis
context, not evidence. Do not place Wiki Page References in Citation footnote
sections. If the current page depends on another Wiki Page's evidence, cite the
underlying Source Document directly.

**Domain Frame**: an advisory Source Document class or Wiki Page role that
defines useful metadata slots. Frames guide classification and linting; they do
not block sparse imports or ordinary page creation.

**Frame Assignment**: the semantic claim that a Source Document or Wiki Page
uses a Domain Frame. Leave uncertain records unframed or propose a better frame
rather than forcing a poor fit.

**Frame Metadata**: sparse record metadata scoped by the assigned Domain Frame.
Do not put frame metadata in the Page Body.

**Manual Link**: a deprecated generic graph relationship. Do not create new
Manual Links for semantic edges. Use Wiki Page References for page navigation,
Citations for evidence support, and frame metadata for classification.

**Domain Relation**: a future governed semantic graph edge with a typed
predicate, evidence, review status, and lint rules. Generic `related` edges are
non-examples.

**Agent Session**: a bounded unit of agent work. Start one for every meaningful
task.

**Change Log**: a durable record of CLI reads and writes. Use it to explain,
audit, and repair agent work.

**Graph Retrieval**: search over Wiki Pages, Source Documents, and Source Text
Projections, with graph signals and local embeddings when available.

**Page Candidate**: a Wiki Page candidate returned for concept reuse before a
write. Candidate search is distinct from answer retrieval and evidence search:
it asks "should I update an existing page instead of creating another one?"
