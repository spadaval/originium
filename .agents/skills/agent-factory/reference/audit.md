# Audit

Use this route to inspect Originium architecture quality, identify
complexity-fit problems, and record evidence-backed findings without designing
or implementing refactors.

Use `implement` or `migrate` only after a bead already describes the problem and
desired work.

## Read First

- `docs/architecture/quality/architecture-quality.md` for vocabulary and value
  tests.
- `CONTEXT.md` for Originium domain terms.
- `docs/architecture/index.md` for ownership and dependency direction.
- Current ADRs under `docs/adr/` for durable decisions.

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
- **Risk of wrong optimization**: what assumption could make a refactor
  premature or harmful.
- **Confidence**: high, medium, or low.
- **Unknowns**: what must be learned before shaping work.
- **Next step**: no action, spike, decision, docs clarification, ordinary
  implementation bead, demolition, reconnect, or closeout.

Do not force a solution. If several target states are plausible, say that.
Prefer a spike or decision bead when the solution space is unclear.

## Agent Process Audits

When auditing agent readiness, evaluate the role interface:

- the orchestrator can assign a clear route to each subagent;
- the central route table makes role boundaries explicit;
- route references contain task-specific procedure and constraints;
- shared docs stay focused on repository-wide principles and do not duplicate
  role-specific procedure.

Flag process findings only when route boundaries are ambiguous, stale,
overlapping in a way that misroutes work, or inconsistent with `AGENTS.md`,
current ADRs, or bead notes.

## Value Discipline

Ignore implementation effort when deciding whether the architecture problem is
worth caring about. Cost affects bead sequencing, not codebase value.

Reject candidates justified only by taste, symmetry, pattern completion,
smaller files, or speculative future variation. Prefer findings that reduce
cognitive load, change amplification, coupling, information leakage, or legacy
drag.

## Tracker Handoff

When the user asks to record findings, use the `plan` route conventions:

- create problem beads when the problem is clear enough;
- create spike beads when evidence or solution space is incomplete;
- create decision beads when a durable architecture choice is needed;
- create demolition/reconnect/closeout beads only after the target direction is
  clear.

Durable architecture decisions belong in ADRs or target-state docs, not only in
bead notes.
