# Agent Factory

The factory is a set of repo-local skills that lets agents split, execute,
review, validate, and hand off work without relying on private chat history.
Its operating principles are in [constitution.md](constitution.md), and its
planning/execution flow is in [workflow.md](workflow.md).

## Roles

- `orchestrate-epic`: coordinates a multi-bead workstream, assigns bounded
  slices, reviews integration, and records handoff.
- `manage-beads`: shapes the backlog so future agents can execute from durable
  issue text.
- `implement`: changes one ordinary owned slice.
- `breaking-migration`: handles deliberate demolition, reconnect, or closeout
  work where temporary breakage is named and bounded.
- `review-code`: reviews a diff or design for construction defects.
- `validate-behavior`: validates an observable scenario.
- `refresh-docs`: reconciles docs, ADRs, skills, and beads after behavior or
  architecture changes.
- `architecture-audit`: finds evidence-backed architecture problems without
  jumping into implementation.

## Defaults

- Use Beads as the durable work queue.
- Keep product language aligned with `CONTEXT.md`.
- Keep Graph Wiki behavior aligned with `SPEC.md`.
- Prefer bundled CLI validation for agent-facing command behavior.
- Record follow-up work in Beads instead of burying it in chat.
