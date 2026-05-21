# Inspect Or Repair Previous Work

Use this procedure for sessions, lint output, citation mismatches, duplicate
pages, fragmented concepts, stale synthesis, and previous failed work.

Load first:

- [../standards/cli.md](../standards/cli.md)
- [../standards/concepts.md](../standards/concepts.md)
- [../standards/wiki-writing.md](../standards/wiki-writing.md)
- [page.md](page.md), when page edits are needed
- [links.md](links.md), when legacy Manual Links or future relation modeling are
  involved

Start with the relevant Agent Session or record ID.

```bash
originium session show <session-id>
originium log show --session <session-id>
originium page read <wiki-page-id> --session <session-id>
originium citation list <wiki-page-id> --session <session-id>
originium citation validate <wiki-page-id> --session <session-id>
originium graph neighborhood <record-id> --session <session-id>
originium graph lint --session <session-id>
```

Use the Change Log to understand what was read and changed. Prefer compensating
CLI edits over direct database edits so the repair is also logged.

Run `graph lint` before and after cleanup or indexing passes. It reports empty
and uncited Wiki Pages, Citation Marker/Citation mismatches, unused Citations,
duplicate-ish and orphan pages, broad heading-level citation targets when Source
Anchors exist, misplaced Wiki Page References, and disabled legacy Manual Links.

Treat lint output as a repair queue; destructive cleanup should be explicit and
logged rather than done through direct database edits.

## Typical Repairs

- duplicate topic: update the better Wiki Page; report any unsupported merge or
  delete that still needs a future CLI command
- bad Page Body: run `page update` with corrected synthesis
- citation mismatch: align Citation Markers and Citation keys, then validate
- bad legacy Manual Link: inspect it and report the unsupported removal if no
  delete command exists
- bad Wiki Page Reference: keep it inline in prose, fix the target page, or
  remove it if it is being used as evidence
- fragmented concept pages: choose the better page, update it with any missing
  cited synthesis, add or report a merge/supersession follow-up, and avoid
  creating another near-duplicate
- stale or superseded synthesis: preserve the older claim in a labeled cited
  section when historically useful; otherwise replace it and report the change
- failed command: report `error.operation`, `error.input`, `error.reason`, and
  `error.action`
