---
name: architecture-audit
description: Use to inspect Originium architecture quality, identify complexity-fit problems, and record evidence-backed architecture findings without prematurely designing or implementing refactors.
---

# Architecture Audit

Find architecture quality problems. Do not design or execute refactors unless
the user explicitly asks for that after accepting a finding.

Use this skill for architecture audits, code quality discovery, complexity
reviews, and requests to find systemic bad patterns. Use `implement` or
`breaking-migration` after a bead already describes the problem and desired
work.

## Read First

- `docs/architecture/quality/architecture-quality.md` for vocabulary and value tests.
- `CONTEXT.md` for Originium domain terms.
- `docs/architecture/index.md` for ownership and dependency direction.
- Current ADRs under `docs/adr/` for durable decisions.

## Audit Mode

Audit mode identifies problems, not fixes.

For each finding, report:

- **Problem**: the complexity mismatch.
- **Evidence**: concrete files, packages, workflows, tests, repeated searches,
  or caller behavior.
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

When auditing agent readiness, assume the harness discovers repo-local skills
from skill metadata and task context. Do not treat the absence of manual
"load this skill" instructions in every quickstart as a finding by itself.

Evaluate the skill discovery interface instead:

- frontmatter `description` fields should clearly explain when each skill
  should be used;
- overlapping skill descriptions should make routing differences explicit;
- skill bodies should contain the task-specific procedure and constraints an
  agent needs after the harness selects the skill;
- shared docs should stay focused on repository-wide process and should not
  duplicate task-specific skill procedure.

Flag skill-related readiness issues only when descriptions are ambiguous,
stale, overlapping in a way that would misroute work, or inconsistent with
`AGENTS.md`, `docs/agent/*`, current ADRs, or bead notes.

## Scale Discipline

Use concrete nouns instead of generic `Module`:

- package, app, workflow, file, Effect service, repository, SDK operation,
  route, UI helper, adapter, interface, implementation, abstraction.

When friction appears in one file, check whether the cause is actually at a
broader owner or interface. Do not turn a systemic ownership problem into a
small local cleanup bead.

## Value Discipline

Ignore implementation effort when deciding whether the architecture problem is
worth caring about. Cost affects bead sequencing, not codebase value.

Reject candidates justified only by taste, symmetry, pattern completion,
smaller files, or speculative future variation. Prefer findings that reduce
cognitive load, change amplification, coupling, information leakage, or legacy
drag.

## Tracker Handoff

When the user asks to record findings, use `manage-beads` conventions:

- create problem beads when the problem is clear enough;
- create spike beads when evidence or solution space is incomplete;
- create decision beads when a durable architecture choice is needed;
- create demolition/reconnect/closeout beads only after the target direction is
  clear.

Durable architecture decisions belong in ADRs or target-state docs, not only in
bead notes.
