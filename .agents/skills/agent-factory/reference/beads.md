# Beads Reference

Beads is the durable issue tracker for agent work. Use it to preserve scope,
acceptance criteria, status, follow-up work, dependencies, and handoff outside
chat.

## Core Commands

```bash
bd ready
bd list --status=open
bd show <id>
bd search "<topic>"
bd update <id> --claim
bd update <id> --append-notes "..."
bd close <id> --reason "..."
bd dep add <blocked-id> <blocker-id>
bd dep remove <blocked-id> <blocker-id>
bd lint
bd lint <id>
```

Do not use `bd edit`; it opens an interactive editor and blocks agents. Use
explicit `bd update` flags instead.

Use `bd remember` for persistent knowledge that must survive across sessions.
Do not use MEMORY.md files.

Use `bd <command> --help` when syntax is unclear.

## Ready Bead Standard

A ready executable bead answers, without private context:

- what package, app, workflow, file area, interface, or owner is changing;
- why the work exists;
- what is in scope and out of scope;
- what `Acceptance Criteria` define done and how to prove them;
- which parent epic validation criterion the bead advances, when applicable;
- what docs or ADRs are relevant, when needed;
- whether downstream breakage is expected;
- which bead owns later reconnect or closeout, when breakage is expected;
- which agent-factory subskill is recommended, when assignment is non-obvious.

Do not leave vague executable beads in the ready queue. If a bead is too large,
ambiguous, missing prerequisites, or hiding several deliverables, reshape it
before treating it as executable.

## Issue Types

`epic` groups related child beads and names the product, operator, or
behavior-preservation criteria it must prove. Every epic ends with a
`closeout` child when broad validation, cleanup, or handoff is required.

`task`, `feature`, `story`, and `bug` are executable by one worker
without hidden planning. They name owned scope and acceptance criteria
with practical proof.

`validation` starts from a product, operator, live-runtime, browser,
integration, or behavior-preservation scenario. It names the proof method,
required evidence, pass criteria, and failure classification.

`closeout` owns integrated proof, cleanup, and handoff for an epic or phase. It
classifies every parent epic validation criterion as passed, deferred to a
named owner, blocked with a concrete reason, or not applicable.

`milestone` marks program progress or a release boundary. It does not own
executable validation work; it depends on the closeout beads that prove
the milestone.

`spike` reduces uncertainty. It names the question, bounded evidence expected,
and likely follow-up subskill.

`decision` records a durable architecture, domain, or process choice. Update
relevant docs or ADRs when the decision changes target design.

## Migration Tags

Use phase tags when a bead differs from ordinary implementation:

- `[DEMOLITION]`: remove a legacy interface in place; downstream callers may
  break; no compatibility wrappers, shims, aliases, dual imports, or old-path
  re-exports.
- `[RECONNECT]`: reconnect one owned seam to the target design and restore
  focused proof for that seam.
- `[CLOSEOUT]`: validate integrated state, clean up migration damage, run broad
  checks, and classify parent epic criteria.
- `[SPIKE]`: gather bounded evidence and recommend follow-up.

## Dependencies

Use parent-child relationships for grouping under epics:

```bash
bd update <child-id> --parent <epic-id>
```

Use `blocks` only for real sequencing:

```bash
bd dep add <blocked-id> <blocker-id>
bd dep remove <blocked-id> <blocker-id>
```

Do not use blockers to mean "same epic", "preferred order", or "probably
related". Prefer epic-to-epic blockers for macro ordering.

## Tracker Sync

For long orchestrated work, check tracker health before assigning work:

```bash
bd dolt status
bd dolt pull
bd dolt push
bd lint
```

If Dolt sync fails, stop orchestration and fix tracker state before spawning or
assigning more work.

The mapped tracker backup/export is the committed backup of Beads state.
Tracker updates change the export file. Stage and commit it explicitly—either
with related changes or in a tracker-only commit.
