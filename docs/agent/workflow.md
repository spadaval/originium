# Agent Workflow

Originium has two primary workflows: **planning** and **execution**. Planning is
human-in-the-loop. Execution is orchestrated.

No work reaches the execution queue without passing through planning. Beads are
deliberate, not emergent.

## Planning

A human, or human-assigned planning agent, shapes the bead graph before
implementation begins. This is judgment about what work exists, what is ready,
and what proof will satisfy.

```text
Problem or Goal
      |
      v
[ Understand ] -- Read docs, ADRs, existing beads, current system
      |
      v
[ Shape ] -- Split, sequence, name scope and acceptance criteria
      |
      v
[ Verify ready ] -- Can a future agent execute without hidden context?
      |
      v
[ Assign or queue ] -- Hand to orchestrator or leave in ready state
```

Planning uses `manage-beads`. A ready bead must answer: what, why, in scope,
out of scope, how to prove it, and which skill to load.

## Execution

The orchestrator drives implementation.

```text
Ready Beads
      |
      v
[ Dolt preflight ] -- Sync tracker, verify graph is executable
      |
      v
[ Scope and assign ] -- Pick coherent slice, shape worker prompt
      |
      v
[ Worker executes ] -- One owned slice with clear boundaries
      |
      v
[ Review / Validate ] -- Independent verification
      |
      v
[ Integrate or recover ] -- Checkpoint, commit, decide next step
      |
      v
[ Closeout ] -- Prove epic criteria, reconcile docs, push tracker
```

See `.agents/skills/orchestrate-epic/SKILL.md` for the full procedure.

## Separation

Planning and execution are different concerns with different pacing.

- **Planning** requires judgment about scope, sequencing, and whether the
  problem is understood. It is not parallelizable. The planner must hold the
  whole problem.
- **Execution** requires focus on one coherent slice. It is parallelizable when
  write sets are disjoint. The worker must not hold the whole problem.

A single session should not casually do both. Plan, then execute. Or execute,
then plan what follows. Do not reshape the bead graph while implementing beads
unless that is the assigned work.

## Why Human-In-The-Loop

The system is not designed to autonomously discover what to build. It is
designed to execute what has been deliberately planned.

This matters because:

- **Scope is the hardest problem.** Defining what not to build requires
  understanding the whole.
- **Acceptance criteria are the contract.** Without deliberate criteria,
  verification becomes a negotiation, not a signal.
- **Beads are durable intent.** They preserve planning decisions so the next
  agent can execute without reconstructing them.

The human, or explicitly assigned planning agent, owns the problem definition.
The orchestrator owns execution. The worker owns the slice. The validator owns
the signal.

## Anti-Patterns

- **Emergent work**: creating beads mid-execution because scope was not
  understood during planning.
- **Self-assignment**: a worker deciding its own scope. Scope is given, not
  discovered.
- **Planning while executing**: shaping the graph and implementing beads in the
  same session.
- **Vague acceptance**: criteria like "fix the bug" or "make it better."
  Criteria must be verifiable.
- **Skipping closeout**: treating the last implementation bead as done.
  Closeout proves the epic, reconciles docs, and cleans up migration debris.
