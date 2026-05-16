# Beads Workflow

Beads is the durable issue tracker for Originium agent work.

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

Avoid `bd edit`; it opens an interactive editor and can block agents. Use
explicit `bd update` flags instead.

## Issue Quality

A ready executable bead should name:

- the concrete behavior or artifact to change,
- in-scope and out-of-scope work,
- the relevant package, app, schema, doc, or CLI surface,
- acceptance criteria,
- proof commands or validation scenarios,
- blockers and dependencies.

Do not leave vague executable work in the ready queue. Split broad work into
owned slices with clear dependencies.

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

## Handoff

Closeout notes should include:

- changed paths or tracker areas,
- validation commands run,
- failures or skipped checks,
- remaining risks,
- follow-up beads created or updated.
