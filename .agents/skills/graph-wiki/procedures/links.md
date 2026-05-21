# Add Explicit Links

Use Citations for evidence. Use frame metadata for semantic classification. Use
Manual Links only for explicit navigation relationships requested by the user or
required by an indexing assignment. Manual Links should improve future
traversal; they are not tags, backlinks, evidence support, or decorative
related-content links.

Load first:

- [../standards/cli.md](../standards/cli.md)
- [../standards/concepts.md](../standards/concepts.md)

Add a Manual Link:

```bash
originium link add \
  --from <record-id> \
  --to <record-id> \
  --reason "<why this relationship should exist>" \
  --label "<optional label>" \
  --session <session-id>
```

Inspect links around a record:

```bash
originium link list --record <record-id> --session <session-id>
```

## Manual Link Discipline

- Use a concrete label from the controlled vocabulary when the CLI supports it.
  Good labels include `depends on`, `constrains`, `implements`, `uses`,
  `applies to`, `contrasts with`, and `supersedes`.
- Make the reason specific enough that another agent can explain why traversing
  the edge is useful.
- Prefer Citations for source support and Manual Links for domain
  relationships. Do not use a Manual Link as a substitute for a missing
  Citation.
- Do not use `related evidence`; direct support belongs in a Citation relation.
- Do not infer links just because two pages seem related. If the user or
  indexing assignment did not ask for graph enrichment, leave the relationship
  out.
- For contradiction, stale, or superseded material, usually write a cited page
  section first. Add a `contrasts with` or `supersedes` Manual Link only when it
  connects two durable pages and the traversal reason is clear.
