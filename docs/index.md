# Originium Knowledge Map

This is the top-level router for the repository docs.

## Product Docs

- [SPEC.md](../SPEC.md) for Graph Wiki purpose, proof-of-concept requirements, storage model, ingestion model, and target commands.
- [CONTEXT.md](../CONTEXT.md) for canonical product language and ambiguity resolutions.

## Architecture Docs

- [docs/architecture/index.md](architecture/index.md) for package ownership,
  host-direct runtime topology, environment variables, and deferred
  split-topology/containerization work.
- [docs/operations/host-direct.md](operations/host-direct.md) for starting,
  validating, and troubleshooting the proven single-host web app.
- [docs/architecture/quality/index.md](architecture/quality/index.md) for engineering quality rules.
- [docs/architecture/quality/validation.md](architecture/quality/validation.md) for proof methods, validation beads, result states, and failure classification.
- [docs/adr](adr) for durable architecture decisions.

## Agent Docs

- [AGENTS.md](../AGENTS.md) for repository agent workflow rules.
- [docs/agent/index.md](agent/index.md) for the local agent factory process.
- [docs/agent/beads.md](agent/beads.md) for Beads workflow rules.
- [.agents/skills/graph-wiki/SKILL.md](../.agents/skills/graph-wiki/SKILL.md) for Originium-specific Graph Wiki agent rules.
