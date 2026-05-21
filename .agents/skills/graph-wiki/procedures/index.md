# Index A Source Document

Use this when the user wants an LLM-powered indexing pass over a document,
chapter, or theme. The CLI extracts headings and stores records; the agent is
responsible for deciding which concepts, facts, requirements, procedures,
tradeoffs, and cross-references deserve durable Wiki Pages and graph links.

Load first:

- [../standards/cli.md](../standards/cli.md)
- [../standards/concepts.md](../standards/concepts.md)
- [../standards/wiki-writing.md](../standards/wiki-writing.md)
- [source.md](source.md)
- [page.md](page.md)
- [links.md](links.md), when graph enrichment is requested

Indexing is not a page-by-page summary. Build a maintained knowledge layer.

## Recommended Loop

1. Start an Agent Session and list Source Text Projection coverage for the
   Source Document.
2. Choose a bounded chapter, section cluster, or theme to index.
3. Read the relevant chunks with `source chunk`. For broad or noisy ranges, use
   `source search` or `source read --pages <start-end>` to locate the real
   evidence before synthesizing.
4. Run concept reuse checks before writing:

   ```bash
   originium page candidates "<candidate concept>" --session <session-id>
   originium page search "<candidate concept>" --session <session-id>
   originium page search "<alias, acronym, or broader term>" --session <session-id>
   ```

   `page candidates` is owned by the graph-native retrieval epic. If the command
   is not available yet, use repeated `page search` and `retrieval search`, then
   report that concept reuse used the fallback.

5. Decide whether to update, broaden, split, or create using the page
   granularity rules in [../standards/wiki-writing.md](../standards/wiki-writing.md).
6. Create or update pages with citation markers in the body.
7. Add Citation relations whose keys exactly match the body markers.
8. Add Manual Links only when the indexing assignment asks for navigational
   graph enrichment and you can state the relationship reason concretely.
9. Validate citations for every page touched.
10. Run Graph lint and address or report hygiene issues:

    ```bash
    originium graph lint --session <session-id>
    ```

11. Run retrieval validation for likely questions, aliases, and broader terms.
12. Inspect the session log and report records read, records changed, validated
    pages, retrieval checks run, Manual Links added, fallbacks used, and known
    gaps.

## Manual Link Labels

When supported by the CLI, prefer controlled labels such as `depends on`,
`constrains`, `implements`, `uses`, `applies to`, `contrasts with`, and
`supersedes`. Do not add decorative, vague, or evidence-support links.
