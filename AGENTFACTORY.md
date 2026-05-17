# Agent Factory Binding

This file binds the generic agent-factory operating model to this repository's
concrete files, commands, and product-specific skills.

## Sources

- Agent instructions: `AGENTS.md`
- Docs map: `docs/index.md`
- Domain context: `CONTEXT.md`
- Product intent: `SPEC.md`
- ADR directory: `docs/adr/`
- Architecture index: `docs/architecture/index.md`
- Quality index: `docs/architecture/quality/index.md`
- Architecture quality vocabulary: `docs/architecture/quality/architecture-quality.md`
- Code standards: `docs/architecture/quality/standards.md`
- Validation router: `docs/architecture/quality/validation.md`

## Tracker

- Tracker: Beads
- Tracker backup/export: `.beads/issues.jsonl`
- Sync commands:
  - `bd dolt pull`
  - `bd dolt push`
  - `bd dolt status`

## Checks

- Markdown formatting: `bun run check:markdown`
- Diff whitespace: `git diff --check`
- Bead lint: `bd lint`
- Full repository check: `bun run check`

## Product-Specific Skills

- Graph Wiki operation: `.agents/skills/graph-wiki/SKILL.md`
- Frontend craft: `.agents/skills/impeccable/SKILL.md`
