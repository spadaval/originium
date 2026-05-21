# Wiki Writing Standards

## Working Style

- Keep Wiki Pages concise and synthetic. Do not turn them into pasted source
  excerpts.
- Cite claims that depend on Source Document evidence.
- Keep Page Body prose readable. Put evidence targets in Citation relations,
  not inline metadata.
- Process large documents one Source Heading at a time.
- Make every meaningful read and write part of an Agent Session.
- Validate retrieval after indexing with likely questions, aliases, acronyms,
  broader terms, and at least one graph-neighborhood inspection when available.
- End by summarizing records read, records changed, pages reused or created,
  split-vs-merge decisions, citation validation results, retrieval checks,
  Manual Links added, Source Text Projection fallbacks or verification gaps, and
  remaining unsupported cleanup.

## Page Granularity

Create Wiki Pages for concepts that are likely query targets, design
constraints, deployment patterns, system requirements, procedures, component
roles, known tradeoffs, and operational risks.

- Prefer one focused page per durable concept.
- Avoid one giant document summary page.
- Avoid tiny pages that only restate a single sentence.
- Use chapter or major Source Heading pages only as overview/navigation pages;
  link them to more specific pages when those relationships are useful.
- Synthesize across multiple Source Headings when a concept is distributed
  across the document. Cite each materially different source of evidence.
- Preserve contradictions, stale information, and superseded guidance in cited
  Wiki Page sections.

Use this split-vs-merge heuristic:

- Merge or update when the difference is terminology, document structure,
  vendor phrasing, or an alias for the same concept.
- Add a section to an existing page when new evidence changes nuance, version
  applicability, operational caveats, or known risks within the same concept.
- Broaden an existing page when two narrow pages would always be retrieved
  together and the distinction is mostly naming, vendor phrasing, or source
  document structure.
- Split when the concept has a different audience, lifecycle stage, failure
  mode, configuration surface, operational consequence, or retrieval intent.
- Create a new page only after candidate, alias, and broader-term searches do
  not reveal a better home.
- Keep stale or superseded material in a clearly labeled cited section when it
  is useful for historical interpretation. Otherwise replace stale prose and
  explain the replaced source in the session closeout.

## Citation Discipline

- Each evidence-backed claim in a Page Body should have a nearby Citation
  Marker. One marker can support a short paragraph, but not an entire page of
  unrelated claims.
- Citation labels should name the human source anchor, not repeat opaque record
  IDs.
- If Source Headings are too broad for confident citation, create Source
  Anchors when the CLI supports the needed anchor; otherwise keep the heading
  citation and report the precision gap.
- If a source point is unclear or contradictory, create a page that preserves
  the uncertainty instead of silently choosing one interpretation.
- If a projection snippet looks useful but cannot be verified against a Source
  Heading, Source Anchor, or original document, do not use it for a durable
  claim. Report the evidence gap.

Interpret citation validation results literally:

- `missing-graph-citation`: the Page Body has a marker with no matching Citation
  relation. Add the relation or remove the marker.
- `unused-graph-citation`: a Citation relation exists but no matching marker is
  used in the Page Body. Add the marker or revise the stale citation through a
  supported CLI workflow.
- `duplicate-marker`: the same Citation Marker key appears more than once.
  Rewrite the Page Body.
- `invalid-marker-syntax`: the marker is malformed. Use lowercase keys with
  letters, numbers, `_`, or `-`, such as `[^source-1]`.

## Retrieval Validation

After indexing, likely queries should find maintained Wiki Pages before raw
Source Headings for important topics covered by the indexed scope.

Run retrieval validation for likely questions, aliases, and broader terms with
`originium retrieval search`, `originium page candidates`, and
`originium graph neighborhood` when available. Inspect whether intended Wiki
Pages rank ahead of raw Source Headings and whether graph neighborhoods expose
useful citations and Manual Links.

If planned commands are not available yet, use `page search`, `retrieval search`,
`citation list`, and `link list`, then report the fallback.
