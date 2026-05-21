# Answer A Question

Use this procedure when answering from the maintained knowledge base.

Load first:

- [../standards/cli.md](../standards/cli.md)
- [../standards/concepts.md](../standards/concepts.md)

Start from maintained synthesis, not raw source search.

1. Search for existing Wiki Pages and graph-backed candidates:

   ```bash
   originium page search "<question or topic>" --session <session-id>
   originium retrieval search "<question or topic>" --session <session-id>
   ```

   When available, use the dedicated answer and graph inspection commands named
   by the graph-native retrieval epic before falling back to generic search:

   ```bash
   originium retrieval search "<question or topic>" --session <session-id>
   originium graph neighborhood <record-id> --session <session-id>
   ```

2. Read the strongest Wiki Page candidates:

   ```bash
   originium page read <wiki-page-id> --session <session-id>
   ```

3. Inspect and validate the page evidence:

   ```bash
   originium citation list <wiki-page-id> --session <session-id>
   originium citation validate <wiki-page-id> --session <session-id>
   ```

4. Answer from the Wiki Page synthesis and cited Source Heading evidence. If a
   claim depends on a Source Text Projection snippet, verify it against the
   cited Source Heading, Source Anchor, or original Source Document before
   presenting it as fact.

5. If search only finds Source Headings, say that the topic has source material
   but no maintained Wiki Page yet. Use the Source Headings as context only if
   that satisfies the user, or create/update a Wiki Page before treating the
   knowledge as compiled.

6. If relevant pages disagree, are stale, or appear superseded, report that
   explicitly. Prefer answers like "the Graph Wiki has two cited sections that
   conflict" over silently choosing one. Name the page section and citation
   label that supports each side.
