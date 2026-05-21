# Subskills

This document defines the agent-factory subskills, their boundaries, and selection rules.
Each subskill is a self-contained procedure loaded by a subagent when assigned work.

## Subskill Reference

| Subskill      | Use For                                                                                   | Load                                                 |
| ------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `install`     | Installing agent-factory in a repository and creating required bindings/scaffolding       | [../procedures/install.md](../procedures/install.md)         |
| `plan`        | Creating, splitting, sequencing, clarifying, or cleaning up beads                         | [../procedures/plan.md](../procedures/plan.md)               |
| `orchestrate` | Running an epic or multi-bead workstream and assigning subagents                          | [../procedures/orchestrate.md](../procedures/orchestrate.md) |
| `implement`   | Executing one ordinary assigned bead or owned slice                                       | [../procedures/implement.md](../procedures/implement.md)     |
| `migrate`     | Demolition, reconnect, closeout, or other intentional temporary breakage                  | [../procedures/migrate.md](../procedures/migrate.md)         |
| `review`      | Adversarial diff, code, design, architecture, security, or test-quality review            | [../procedures/review.md](../procedures/review.md)           |
| `validate`    | Scenario-centered product, operator, browser, runtime, integration, or preservation proof | [../procedures/validate.md](../procedures/validate.md)       |
| `docs`        | Documentation refresh, reconciliation, or docs/process drift cleanup                      | [../procedures/docs.md](../procedures/docs.md)               |
| `audit`       | Evidence-backed architecture-quality findings without implementing fixes                  | [../procedures/audit.md](../procedures/audit.md)             |
| `readiness`   | Assessing whether a repository is legible and operable by agents                         | [../procedures/readiness.md](../procedures/readiness.md)     |
| `beads`       | Beads command mechanics, issue standards, dependency rules, and tracker sync              | [beads.md](beads.md)                         |

## Selection Rules

1. If the first argument is a subskill, load that subskill reference and follow it.
2. If no subskill is named, stop and ask for the assigned subskill.
3. If the work is an epic or spans multiple beads, use `orchestrate`; the orchestrator may then assign subagents to other subskills.
4. If the work starts from a diff, use `review`. If it starts from a scenario or behavior claim, use `validate`.
5. If `AGENTFACTORY.md` is missing or the user asks to set up agent-factory, use `install`.
6. If a bead intentionally permits breakage, closes out a migration, or asks for demolition/reconnect classification, use `migrate`.

## Boundary Conditions

### Do not use `implement` for
- Graph planning or bead management (use `plan`).
- Demolition, breaking migration, or closeout work (use `migrate`).
- Independent validation or read-only review (use `validate` or `review`).

### Do not use `plan` for
- Implementation of a named code bead (use `implement`).
- Reshaping the graph while implementing unless explicitly assigned planning work.

### Do not use `validate` for
- Code review or diff analysis (use `review`).
- Fixing defects unless the bead explicitly assigns implementation work.

### Do not use `review` for
- Scenario-centered behavior proof (use `validate`).
- Closing product validation unless separately assigned the `validate` subskill.

### Do not use `migrate` for
- Ordinary implementation beads without named temporary breakage (use `implement`).

### Do not use `audit` for
- Architecture-quality fixes (use `implement` or `migrate` after a bead describes the work).

### Do not use `readiness` for
- Architecture quality findings (use `audit`).
- Code review (use `review`).
- Behavior validation (use `validate`).
- CI/CD pipelines, PR workflows, or observability systems (out of scope).

## Shared References

- [Beads](beads.md): tracker mechanics, standards, and command conventions referenced by multiple subskills.
- [Repository Shape](repo-shape.md): the intended shape of an agent-ready repository, shared by `install` and `readiness`.
