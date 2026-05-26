# Repository Workflow

## Start Gate

Before planning, implementing, validating, migrating, or orchestrating, check
the current worktree state:

```bash
git status --short --branch
```

If tracker state also matters, follow [beads.md](beads.md) for the Dolt sync
commands and tracker-specific start checks.

## Checkpoint Pattern

For coherent slices or small bead groups:

```bash
git status --short
git diff --check
<focused validation>
git add <source/docs/tests>
git commit -m "<message>"
```

When tracker changes update the mapped export, stage that file explicitly with
the related work or in a tracker-only commit.

## Handoff Pattern

Before handoff, verify the worktree is clean:

```bash
git status --short --branch
```

If bead state changed, push tracker state according to [beads.md](beads.md)
before handoff.


