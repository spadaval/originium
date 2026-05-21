# Add Or Inspect A Source Document

Use this procedure when importing a PDF, extracting Source Headings, reading
chunks, creating Source Anchors, or using source text search.

Load first:

- [../standards/cli.md](../standards/cli.md)
- [../standards/concepts.md](../standards/concepts.md)

Import a PDF only when the user asks you to add, ingest, or use that document as
trusted source material.

## Import And Extract

1. Import the PDF:

   ```bash
   originium source import-pdf <pdf-path> --session <session-id>
   ```

   Save the returned Source Document ID.

2. Extract Source Headings from the same PDF path:

   ```bash
   originium source headings <pdf-path> \
     --source <source-document-id> \
     --session <session-id>
   ```

   Use `data.headings[].id` as the persisted Source Heading ID for citations
   and links. `extractionHeadingId` is only provenance for the text projection.

3. Choose one Source Heading or chapter-sized anchor. Large documents should be
   processed heading by heading.

## Chunk Projection

If you need the chunk projection without creating a Wiki Page yet:

```bash
originium source chunk <pdf-path> \
  --source <source-document-id> \
  --heading <source-heading-id> \
  --max-tokens 100000 \
  --session <session-id>
```

The chunk output makes `persistedSourceHeadingId` and `citationTarget`
prominent. Use that ID for `citation add`; treat `projectionHeadingId` as
extraction provenance only.

## Targeted Source Text

If you need targeted source text without creating graph records:

```bash
originium source read <pdf-path> \
  --source <source-document-id> \
  --heading <source-heading-id>

originium source search <pdf-path> "<query>" \
  --source <source-document-id> \
  --pages 12-18
```

Source text read/search output is a lossy PDF text projection with page range,
nearest heading/anchor context, extraction provenance, and checksum. Source Text
Projection records, when present, have the same evidence status: they are search
caches, not canonical evidence.

Use the original Source Document or a verified Source Heading/Anchor read for
canonical wording, tables, figures, emphasis, diagrams, and layout-sensitive
claims.

As the graph-native retrieval epic lands, prefer DB-backed evidence discovery
commands before local-path-only PDF search:

```bash
originium source list --session <session-id>
originium source headings --source <source-document-id> --session <session-id>
originium source evidence search "<query>" --source <source-document-id> --session <session-id>
```

If those commands are not available yet, use `source headings`, `source read`,
and `source search` with the local PDF path and report the fallback.

## Source Anchors

If a Source Heading is too broad for a body-section citation, create a Source
Anchor instead of editing extracted heading records:

```bash
originium source anchor create \
  --title "<body section or evidence name>" \
  --source <source-document-id> \
  --heading <source-heading-id> \
  --pages 12-14 \
  --location "<short location hint>" \
  --reason "<why this anchor is needed>" \
  --session <session-id>
```

Read or search anchors with:

```bash
originium source anchor read <source-anchor-id>
originium source anchor search "<query>"
```

## Chapter Ingestion Context

If you need Chapter Ingestion context:

```bash
originium ingest chapter \
  --source <source-document-id> \
  --heading <source-heading-id> \
  --session <session-id>
```

Do not copy raw PDF body text into Wiki Pages or durable wiki records. Use
Source Documents and Ingestion Chunks as input for concise synthesis.
