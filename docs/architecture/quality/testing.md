# Testing

## Layers

- Package unit tests cover public interfaces, pure helpers, policies, parsing,
  and deterministic ID generation.
- CLI tests exercise agent-facing command behavior through the bundled
  executable when practical.
- SurrealDB integration tests should prove schema application, graph relation
  behavior, file bucket access, and query helpers against a real or explicitly
  configured test database.
- PDF ingestion tests should separate pure parsing/projection behavior from
  fixture-backed extraction behavior.
- Web tests should focus on the inspection experience: source document lists,
  heading outlines, wiki page rendering, citation panels, graph neighborhoods,
  sessions, and change logs.
- Biome, Prettier, build checks, and bead lint are validation gates, not test
  suites.

## Fixtures

- Prefer fixtures that satisfy the public interface under test.
- Avoid compatibility helpers that keep deleted interfaces alive.
- Keep fixture PDFs small for ordinary tests. Use `~/Downloads/IA-Mining-DG.pdf`
  or other large documents for explicit POC or acceptance validation, not every
  unit test.
- Tests should not store full extracted source body text in durable wiki records.
- For citation behavior, fixtures should include both valid marker/relation
  agreement and concrete mismatch cases.

## Commands

```bash
bun test
bun run test
bun run check
```

Use `bun test` for ordinary unit coverage relevant to changed packages. Use
`bun run test` when the build step matters, especially for CLI binary behavior.
Use `bun run check` for the normal full local gate.

Use [validation.md](validation.md) for scenario proof, closeout proof, and
failure classification.
