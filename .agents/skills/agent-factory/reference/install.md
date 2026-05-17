# Install

Use this route to install agent-factory in a repository. Installation creates
the concrete repository binding and the minimum durable sources that agents need
to plan, execute, review, validate, and hand off work.

Do not make doctrine optional. The install route binds the doctrine to concrete
paths and commands; it does not negotiate the operating model.

## Target Repository Shape

An agent-factory-ready repository has durable places for intent, scope,
decisions, proof, and handoff. A fresh agent should be able to answer these
questions without private chat history:

- **What is this repository for?** Product intent names users, purpose, and
  observable target behaviors.
- **What words mean what?** Domain context defines core nouns and records
  ambiguity decisions.
- **Where do I start reading?** A docs map routes agents to product,
  architecture, quality, validation, operations, and agent-process sources.
- **What decisions are durable?** ADRs record choices that are costly,
  surprising, or repeatedly relevant.
- **How do I prove work?** A validation router maps checks and proof methods to
  the behavior or quality they own.
- **How is work tracked?** Beads holds scope, acceptance criteria, dependencies,
  status, and handoff. Dolt sync keeps tracker state durable across machines.
- **How does agent-factory bind to this repo?** `AGENTFACTORY.md` maps the
  generic operating model to concrete files, commands, checks, tracker backup,
  and product-specific skills.

The expected shape is:

```text
.
├── AGENTS.md
├── AGENTFACTORY.md
├── CONTEXT.md
├── SPEC.md
├── docs/
│   ├── index.md
│   ├── adr/
│   └── architecture/
│       ├── index.md
│       └── quality/
│           ├── index.md
│           ├── architecture-quality.md
│           ├── standards.md
│           └── validation.md
├── .agents/
│   └── skills/
│       └── <product-specific skills>
└── .beads/
```

Exact names may differ only when `AGENTFACTORY.md` binds the equivalent source
clearly. Missing equivalents are installation gaps, not harmless omissions.

## Start Gate

Inspect the repository before writing:

```bash
git status --short --branch
find . -maxdepth 3 -type f \( -name AGENTS.md -o -name AGENTFACTORY.md -o -name CONTEXT.md -o -name SPEC.md \)
find docs -maxdepth 3 -type f 2>/dev/null
find . -maxdepth 3 -type d \( -name adr -o -name .beads \)
```

If the worktree is dirty, preserve unrelated changes. If existing docs conflict
with the expected scaffolding, adapt the binding to the existing structure
rather than duplicating sources.

## Required Outputs

Create or verify these repository sources:

- `AGENTFACTORY.md`: concrete binding for this repository.
- Agent instructions file: usually `AGENTS.md`.
- Docs map: usually `docs/index.md`.
- Domain context: usually `CONTEXT.md`.
- Product intent: usually `SPEC.md` or a clearly named equivalent.
- ADR directory: usually `docs/adr/`.
- Architecture index: usually `docs/architecture/index.md`.
- Quality index: usually `docs/architecture/quality/index.md`.
- Architecture quality vocabulary: usually
  `docs/architecture/quality/architecture-quality.md`.
- Code standards: usually `docs/architecture/quality/standards.md`.
- Validation router: usually `docs/architecture/quality/validation.md`.
- Beads tracker with Dolt sync available.
- Tracker backup/export binding, usually `.beads/issues.jsonl`.

Use existing equivalent files when they already exist. Otherwise create concise
starter files with useful headings and explicit TODO markers.

## Binding File

`AGENTFACTORY.md` must be an abstract-to-concrete binding, not a policy override
file. It maps the operating model to repository paths and commands.

Use this shape:

```md
# Agent Factory Binding

This file binds the generic agent-factory operating model to this repository's
concrete files, commands, and product-specific skills.

## Sources

- Agent instructions: `AGENTS.md`
- Docs map: `docs/index.md`
- Domain context: `CONTEXT.md`
- Product intent: `SPEC.md`
- ADR directory: `docs/adr/`
- Architecture index: `docs/architecture/index.md`
- Quality index: `docs/architecture/quality/index.md`
- Architecture quality vocabulary: `docs/architecture/quality/architecture-quality.md`
- Code standards: `docs/architecture/quality/standards.md`
- Validation router: `docs/architecture/quality/validation.md`

## Tracker

- Tracker: Beads
- Tracker backup/export: `.beads/issues.jsonl`
- Sync commands:
  - `bd dolt pull`
  - `bd dolt push`
  - `bd dolt status`

## Checks

- Markdown formatting: `<command>`
- Diff whitespace: `git diff --check`
- Bead lint: `bd lint`
- Full repository check: `<command>`

## Product-Specific Skills

- `<name>`: `<path>`
```

Delete entries that truly do not exist only after creating a follow-up bead to
add the missing source. A missing binding is not a silent omission.

## Starter Files

When creating starter files, keep them small and useful.

`CONTEXT.md` should define domain language:

```md
# Context

## Domain Terms

- TODO: define the core nouns agents must use consistently.

## Ambiguities

- TODO: record terminology decisions that prevent repeated confusion.
```

The product intent file should define purpose and user-visible target behavior:

```md
# Product Intent

## Purpose

TODO: state what this repository is for.

## Users

TODO: name the users or operators.

## Target Behaviors

- TODO: list observable behaviors the product must support.
```

The docs map should route agents to durable sources:

```md
# Documentation Map

- `AGENTFACTORY.md`: agent-factory bindings.
- `CONTEXT.md`: domain language.
- `SPEC.md`: product intent.
- `docs/adr/`: durable decisions.
- `docs/architecture/`: architecture and ownership.
- `docs/architecture/quality/`: quality, standards, and validation.
```

The validation router should define check ownership:

```md
# Validation

## Commands

| Command            | Owns                                                    |
| ------------------ | ------------------------------------------------------- |
| `git diff --check` | whitespace and patch hygiene                            |
| `bd lint`          | Beads structure                                         |
| TODO               | project tests, type checks, build, lint, or docs checks |

## Result States

- `pass`
- `fail`
- `blocked`
- `deferred`
- `not-applicable`
```

## Beads Setup

Verify Beads is available:

```bash
bd --version
bd status
bd dolt status
```

If Beads is not initialized, run the repository-appropriate Beads setup command
or stop with the exact missing command/tool. Do not invent a parallel tracker.

After tracker setup, ensure the binding names the tracker backup/export path and
that tracker changes are committed with related work.

## AGENTS.md Update

Ensure agent instructions say:

- use Beads for task tracking;
- load `AGENTFACTORY.md` for agent-factory bindings;
- use the `agent-factory` skill for coordinated agent work;
- orchestrators assign one route per subagent;
- avoid interactive tracker commands such as `bd edit`.

Keep this short. Do not duplicate the route references in `AGENTS.md`.

## Verification

Before handoff:

```bash
test -f AGENTFACTORY.md
test -f CONTEXT.md
test -d docs/adr
bd lint
git diff --check
<mapped markdown check, if available>
```

If any required source is intentionally deferred, create a bead that names the
missing source, why it matters, and which route should create it.

## Handoff

Report:

- binding file created or updated;
- required sources created, reused, or deferred;
- Beads/Dolt setup status;
- checks run and failures;
- follow-up bead IDs.
