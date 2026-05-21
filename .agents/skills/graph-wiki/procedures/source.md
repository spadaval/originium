# Add Or Inspect A Source Document

Use this procedure when importing a PDF, rebuilding Source Text Projections,
reading chunks, or using source text search.

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

2. Rebuild Source Text Projections and extraction metadata for the Source
   Document:

   ```bash
   originium source projections rebuild \
     --source <source-document-id> \
     --session <session-id>
   ```

   Use returned projection IDs, page ranges, checksums, and outline metadata as
   locator inputs. Citations still target the Source Document.

3. Choose one page range, chapter-sized region, or theme. Large documents should
   be processed in bounded ranges.

## Chunk Projection

If you need the chunk projection without creating a Wiki Page yet:

```bash
originium source chunk <pdf-path> \
  --source <source-document-id> \
  --pages <start-end> \
  --max-tokens 100000 \
  --session <session-id>
```

The chunk output should make the Source Document ID, page range, projection
IDs, and text hashes prominent. Use those fields as citation-local locator
metadata for `citation add`.

## Targeted Source Text

If you need targeted source text without creating graph records:

```bash
originium source read <pdf-path> \
  --source <source-document-id> \
  --pages <start-end>

originium source search <pdf-path> "<query>" \
  --source <source-document-id> \
  --pages 12-18
```

Source text read/search output is a lossy PDF text projection with page range,
nearest outline or section context, extraction provenance, and checksum. Source
Text Projection records, when present, have the same evidence status: they are
search caches, not canonical evidence.

Use the original Source Document for canonical wording, tables, figures,
emphasis, diagrams, and layout-sensitive claims.

As the graph-native retrieval epic lands, prefer DB-backed evidence discovery
commands before local-path-only PDF search:

```bash
originium source list --session <session-id>
originium source projections list --source <source-document-id> --session <session-id>
originium source evidence search "<query>" --source <source-document-id> --session <session-id>
```

If those commands are not available yet, use `source read` and `source search`
with the local PDF path and report the fallback.

## Chapter Ingestion Context

If you need Chapter Ingestion context:

```bash
originium ingest chapter \
  --source <source-document-id> \
  --pages <start-end> \
  --session <session-id>
```

Do not copy raw PDF body text into Wiki Pages or durable wiki records. Use
Source Documents and Ingestion Chunks as input for concise synthesis.
