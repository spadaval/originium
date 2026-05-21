# Audit

Use this subskill to inspect architecture quality, identify complexity-fit
problems, and record evidence-backed findings without designing or implementing
refactors.

Use `implement` or `migrate` only after a bead already describes the problem and
desired work.

## Read First

- the mapped architecture quality vocabulary for value tests;
- the mapped domain context for product terms;
- the mapped architecture index for ownership and dependency direction;
- the mapped ADR directory for durable decisions.

## Audit Mode

Audit mode identifies problems, not fixes. For each finding, report:

- **Problem**: the complexity mismatch.
- **Evidence**: concrete files, packages, workflows, tests, searches, or caller
  behavior.
- **Quality smell**: shallow abstraction, information leakage, low cohesion,
  high coupling, change amplification, speculative abstraction, misplaced
  responsibility, legacy drag, or weak test interface.
- **Likely cause**: why the design creates the friction.
- **Value if fixed**: caller knowledge removed, code deleted, changes
  localized, tests improved, agent confusion reduced, or behavior made more
  reliable.
- **Risk**: what assumption could make a refactor premature or harmful, and
  what must be learned before shaping work.
- **Confidence**: high, medium, or low.
- **Next step**: no action, spike, decision, docs clarification, ordinary
  implementation bead, demolition, reconnect, or closeout.

Be specific.
Recommend an implementation only if a solution is obvious.

## Value Discipline

Ignore implementation effort when deciding whether the architecture problem is
worth caring about. Cost affects bead sequencing, not codebase value.

Reject candidates justified only by taste, symmetry, pattern completion,
smaller files, or speculative future variation. Prefer findings that reduce
cognitive load, change amplification, coupling, information leakage, or legacy
drag.

## Tracker Handoff

When the user asks to record findings, use the `plan` subskill conventions:

- create problem beads when the problem is clear enough;
- create spike beads when evidence or solution space is incomplete;
- create decision beads when a durable architecture choice is needed;
- create demolition/reconnect/closeout beads only after the target direction is
  clear.

Durable architecture decisions belong in ADRs or target-state docs, not only in
bead notes.
