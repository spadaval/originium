# Docs

Use this subskill when documentation freshness is the task, or when a bead's main
output is reconciling docs with target design, code, beads, or agent process.

## Source Map

- Use `AGENTFACTORY.md` to find the docs map, domain context, product intent,
  architecture docs, quality docs, validation router, and ADR directory.
- Beads: active work, sequencing, phase tags, handoff notes, and migration
  intent.

## Staleness Rules

- During active rewrites, docs and current ADRs describe the target design.
- When docs and code disagree, identify whether code is behind target design or
  docs are stale before editing.
- Do not leave two competing target states. Update, delete, or clearly mark
  superseded language.
- Historical ADRs may preserve old rationale, but current docs should not rely
  on historical text for target-state instructions.
- Migration notes may mention old names, but target-state docs should use
  current vocabulary.

## Update Rules

- Update architecture docs when ownership, package boundaries, contracts,
  runtime topology, security model, reliability model, or validation strategy
  changes.
- Update ADRs only for decisions that are hard to reverse, surprising without
  context, and the result of a real trade-off.
- Update the mapped domain context when vocabulary changes or a term is being
  used inconsistently across docs, beads, and code.
- Update product docs when user-visible behavior, UX principles, or design
  language changes.
- Update agent docs or skills when process changes. Keep role-specific
  procedure in subskill references. Keep design docs focused on principles and
  trade-offs, not step-by-step instructions.
- Update bead descriptions, acceptance criteria, or notes when docs work
  reveals tracker ambiguity that would mislead the next agent.
- Keep Beads-native acceptance criteria as the executable contract for bead
  done-ness.

## Start Gate

Follow [repository workflow](../standards/repo-workflow.md) for git worktree
checks, and [beads.md](../standards/beads.md) for tracker mechanics and Dolt
sync.

## Reconciliation Workflow

1. Identify the docs scope: domain, architecture, ADR, product, agent process,
   operations, or bead tracker.
2. Read the current authoritative docs for that scope before editing.
3. Search for stale terms and competing claims with `rg`.
4. Inspect code or beads only as needed to resolve whether docs or code are
   stale.
5. Edit the smallest set of docs that removes ambiguity.
6. If the work changes target design, update or create beads/decision records
   as appropriate.
7. Verify docs and targeted references.

## Verification

Use the mapped validation router for check ownership. For docs-only changes,
run focused docs checks. Run additional checks only when the docs work also
changes scripts, package entrypoints, file names, executable behavior, or
file-size-sensitive content.

## Handoff

Report docs changed, stale claims removed, target-state source of truth, checks
run, unresolved mismatches, and follow-up bead IDs.
