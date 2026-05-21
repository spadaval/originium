---
name: agent-factory
description: "Use for coordinated agent work: installing bindings, planning beads, orchestrating execution, implementing slices, migration, review, validation, docs, audit, and tracker hygiene. The orchestrator assigns one role/subskill per subagent."
argument-hint: "[subskill] [target]"
user-invocable: true
---

# Agent Factory

The agent factory is the subskill assigner for coordinated agent work. It assigns
subskills so agents operate from durable repository state, not private chat history.

## General Guidelines

- Load `AGENTFACTORY.md` first. It binds this operating model to concrete repo
  paths, commands, checks, and product-specific skills.
- For delegated work, the orchestrator explicitly assigns one subskill to each
  subagent. A subagent loads only the assigned subskill reference unless the
  assignment says otherwise.
- Beads are the durable work queue. Use explicit `bd` commands. See
  [standards/beads.md](standards/beads.md) for tracker mechanics, including the
  prohibition on interactive commands such as `bd edit`.
- Shared git/worktree lifecycle rules live in
  [standards/repo-workflow.md](standards/repo-workflow.md). Procedure docs
  should link there instead of repeating the same start, checkpoint, and
  handoff blocks.
- Planning and execution are separate concerns. Do not reshape the bead graph
  while implementing unless graph management is the assigned subskill.
- Use the mapped repo docs for code, architecture, validation, product, and
  quality rules. This skill owns role procedure and coordination mechanics.

## Subskills

| Subskill      | Use For                                                                                   | Load                                                   |
| ------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `install`     | Installing agent-factory in a repository and creating required bindings/scaffolding       | [procedures/install.md](procedures/install.md)         |
| `plan`        | Creating, splitting, sequencing, clarifying, or cleaning up beads                         | [procedures/plan.md](procedures/plan.md)               |
| `orchestrate` | Running an epic or multi-bead workstream and assigning subagents                          | [procedures/orchestrate.md](procedures/orchestrate.md) |
| `implement`   | Executing one ordinary assigned bead or owned slice                                       | [procedures/implement.md](procedures/implement.md)     |
| `migrate`     | Demolition, reconnect, closeout, or other intentional temporary breakage                  | [procedures/migrate.md](procedures/migrate.md)         |
| `review`      | Adversarial diff, code, design, architecture, security, or test-quality review            | [procedures/review.md](procedures/review.md)           |
| `validate`    | Scenario-centered product, operator, browser, runtime, integration, or preservation proof | [procedures/validate.md](procedures/validate.md)       |
| `docs`        | Documentation refresh, reconciliation, or docs/process drift cleanup                      | [procedures/docs.md](procedures/docs.md)               |
| `audit`       | Evidence-backed architecture-quality findings without implementing fixes                  | [procedures/audit.md](procedures/audit.md)             |
| `readiness`   | Assessing whether a repository is legible and operable by agents                          | [procedures/readiness.md](procedures/readiness.md)     |
| `beads`       | Beads command mechanics, issue standards, dependency rules, and tracker sync              | [standards/beads.md](standards/beads.md)               |

## Subskill Rules

1. If the first argument is a subskill, load that subskill reference and follow it.
2. If no subskill is named, stop and ask for the assigned subskill.
3. If the work is an epic or spans multiple beads, use `orchestrate`; the
   orchestrator may then assign subagents to other subskills.
4. If the work starts from a diff, use `review`. If it starts from a scenario or
   behavior claim, use `validate`.
5. If `AGENTFACTORY.md` is missing or the user asks to set up agent-factory,
   use `install`.
6. If a bead intentionally permits breakage, closes out a migration, or asks for
   demolition/reconnect classification, use `migrate`.
