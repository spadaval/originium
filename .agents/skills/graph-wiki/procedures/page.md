# Create Or Update A Wiki Page

Use this procedure for creating pages, updating pages, adding citations, small
edits, and one-shot chapter ingestion into a page.

Load first:

- [../standards/cli.md](../standards/cli.md)
- [../standards/concepts.md](../standards/concepts.md)
- [../standards/wiki-writing.md](../standards/wiki-writing.md)

## Pre-Write Candidate Search

Before writing, search for an existing page about the same topic:

```bash
originium page candidates "<topic>" --session <session-id>
originium page search "<topic>" --session <session-id>
originium page search "<alias, acronym, or broader term>" --session <session-id>
```

Prefer updating the existing Wiki Page over creating a duplicate. Candidate
search is a pre-write requirement for indexing and cleanup work.

Read any close candidate before deciding:

```bash
originium page read <wiki-page-id> --session <session-id>
originium citation list <wiki-page-id> --session <session-id>
originium link list --record <wiki-page-id> --session <session-id>
```

When `page candidates` is unavailable, use repeated `page search` and
`retrieval search` over aliases and broader terms, then report that fallback.

## Create Or Update

Create a new page:

```bash
originium page create \
  --title "<title>" \
  --body "<concise synthesis with [^citation-key] markers when needed>" \
  --session <session-id>
```

Update a page by title:

```bash
originium page update \
  --title "<title>" \
  --body "<revised synthesis>" \
  --session <session-id>
```

If the Page Body uses Citation Markers, add matching Citation relations:

```bash
originium citation add \
  --page <wiki-page-id> \
  --source <source-document-id> \
  --pages <start-end> \
  --key <citation-key> \
  --label "<human label>" \
  --quote "<short supporting quote when useful>" \
  --session <session-id>
```

Then validate the page:

```bash
originium citation validate <wiki-page-id> --session <session-id>
```

## Small Corrections

For small corrections, prefer preview-first editing over rewriting the whole
body:

```bash
originium page replace \
  --page <wiki-page-id> \
  --find "<exact current text>" \
  --replace "<replacement text>" \
  --session <session-id>

originium page replace ... --apply
originium page patch --page <wiki-page-id> --body-file <path> --apply
originium page append --page <wiki-page-id> --body "<additional synthesis>" --apply
```

`page replace`, `page patch`, and `page append` preview by default and refuse to
apply edits that make Citation Markers disagree with graph Citations.

## Ingest A Chapter Into A Wiki Page

Use this when a Source Document page range or chapter should become or refresh a
Wiki Page in one CLI operation.

```bash
originium ingest chapter \
  --source <source-document-id> \
  --pages <start-end> \
  --title "<wiki page title>" \
  --body "<concise synthesis with [^citation-key] marker>" \
  --key <citation-key> \
  --label "<human citation label>" \
  --quote "<short supporting quote when useful>" \
  --session <session-id>
```

The Citation Marker in `--body` must match `--key`. If the command reports a
citation validation failure, change the Page Body or key before retrying.
