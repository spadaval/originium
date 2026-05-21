# Deprecated Manual Links And Future Relations

Use Citations for evidence. Use inline Wiki Page References for navigation to
other Wiki Pages. Use frame metadata for semantic classification.

Generic Manual Links are disabled or deprecated for new semantic graph edges.
This procedure exists only for cleanup of legacy Manual Links and for deciding
whether a repeated relationship need should become a future governed Domain
Relation.

Load first:

- [../standards/cli.md](../standards/cli.md)
- [../standards/concepts.md](../standards/concepts.md)
- [../standards/wiki-writing.md](../standards/wiki-writing.md)

Inspect legacy links around a record when cleanup requires it:

```bash
originium link list --record <record-id> --session <session-id>
```

Do not add new Manual Links:

```bash
# Non-example: disabled/deprecated
originium link add --from <record-id> --to <record-id> --label related
```

## Reference Discipline

- Use `[[Page Title]]` or `[[Page Title|label]]` inside Page Body prose for
  Wiki Page References.
- Do not place Wiki Page References in Citation footnote sections.
- Do not use a Wiki Page Reference or Manual Link as evidence support. Cite the
  underlying Source Document directly.
- Remove, ignore, or report legacy Manual Links with vague labels such as
  `related` or `related evidence`.
- If a relationship repeatedly needs graph semantics, create a follow-up design
  issue for a governed Domain Relation instead of inventing an ad hoc label.

## Future Domain Relations

Domain Relations are deferred until a dedicated model exists. They must have:

- typed predicates with definitions, examples, and non-examples
- evidence, usually a Citation or Source Document locator
- subject and object record scopes
- reason or claim text explaining what the relation asserts
- confidence and review status, such as draft, reviewed, or deprecated
- lint rules for allowed predicates, endpoint types, evidence presence, review
  status, and stale or contradictory edges

Do not build relation-label search or ad hoc semantic link creation before the
governed model is accepted. Until then, keep implementation work focused on
Citation locators, Wiki Page References, answer context, lint, and safe
refactors.
