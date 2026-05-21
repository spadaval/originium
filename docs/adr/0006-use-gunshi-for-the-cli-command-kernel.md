# Use Gunshi For The CLI Command Kernel

## Decision

Originium uses Gunshi as the lightweight typed TypeScript command framework for
the CLI command tree. Gunshi owns command group and subcommand resolution; the
Originium CLI kernel remains responsible for `CliResult`, `--json` rendering,
human output, structured failures, session behavior, and Graph Wiki semantics.

Command modules should be declared as typed command definitions with group
metadata, subcommand metadata, and a runner that returns or assigns an
Originium `CliResult`. Framework-native help and validation rendering are
disabled unless they are translated back into the local `CliResult` failure
shape.

The bundled CLI tests remain the authoritative proof surface because they run
the compiled binary that agents and operators use.

## Rationale

The previous CLI entrypoint had grown a bespoke router and command table inside
`apps/cli/src/index.ts`. That made every new command responsible for preserving
the same routing, help, and output contract by convention.

Gunshi fits this codebase because it provides declarative command definitions,
typed argument schemas, nested subcommands, and custom renderer hooks while
remaining small enough for the Bun-compiled CLI. Its command tree lets
Originium move routing and argument parsing into a framework without moving
Graph Wiki behavior into that framework layer.

The local `CliResult` contract remains more important than framework defaults.
Originium errors must expose operation, input, reason, and action; human output
must stay concise by default; and `--json` must stay stable for agent workflows.

## Alternatives Considered

Gunshi. Selected. It supports declarative command definitions, nested
subcommands, lazy command loading patterns, custom usage and validation
renderers, and a direct Bun installation path. The current implementation uses
Gunshi for command tree resolution and preserves local rendering.

Clipanion. Viable for typed commands, but it brings a class/decorator-oriented
shape that is more ceremony than the current CLI needs. Originium benefits more
from small command definition objects that can sit near existing Graph Wiki
operations during migration.

Commander. Mature and familiar, but the type leverage is weaker for nested
command definitions and parsed values. It would reduce hand routing but would
not clearly improve the command-module contract enough to justify the migration.

Keep the custom router. This avoids a dependency, but it keeps growing local
framework code in the CLI entrypoint. The router was already accumulating group
dispatch, help handling, output flag stripping, and bespoke failure paths.

## Consequences

Future CLI work should add or update command modules instead of adding new
top-level route tables. Command-local parsing helpers may remain where they
preserve Originium-specific validation or failure language, but generic routing
and command tree concerns belong to Gunshi definitions.

Changes to help output, structured failures, `--json`, or bundled binary
behavior require bundled CLI tests. Framework defaults are acceptable only when
they are adapted to ADR 0002's CLI UX contract.

References:

- Gunshi advanced subcommand and lazy-loading guide:
  https://gunshi.dev/guide/advanced/advanced-lazy-loading
- Gunshi renderer/custom rendering API:
  https://jsr.io/@gunshi/plugin-renderer
