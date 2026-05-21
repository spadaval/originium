# Graph Wiki CLI UX Contract

Originium's CLI is both an operator interface and the primary agent interface.
The command surface should therefore optimize for readable default output while
retaining structured output for automation.

## Decision

CLI commands default to concise human-readable ASCII output. Commands that are
used by scripts or agent workflows must also support `--json`; streaming or
large result commands may add `--ndjson` when a single JSON document would be
awkward or too large.

Human output must keep the same technical facts as structured output:

- operation name
- relevant input or record identifier
- result state
- actionable reason and next command when a command fails

Errors remain structured internally as `operation`, `input`, `reason`, and
`action`. Human rendering may format those fields, but it must not replace them
with vague text.

Read commands must not create durable `change_log` rows. `change_log` is
mutation history for review and recovery, not a read audit log. Mutating
commands should record the session, operation, target records, and before/after
state where the before/after query is meaningful.

Agent sessions are implicit after `session start`, with this precedence:

1. explicit `--session`
2. `ORIGINIUM_SESSION`
3. current session stored by the CLI

Commands that mutate without any active session should create and report an
implicit session. Explicit session overrides remain available for automation and
nested workflows.

Source text exposed through the CLI is a lossy Source Text Projection. Source
Documents remain the trusted material and stable citation targets. Citation
relations must carry document-local locator metadata, and source text
read/search commands must report extraction provenance and location context.
Durable projection caches are allowed for retrieval, but they are rebuildable
and non-canonical.

Graph QA commands use the term graph lint for checks that find empty Wiki Pages,
uncited pages, citation marker/relation mismatches, duplicate-ish pages, orphan
records, broad citation targets, and weak Manual Links. Destructive cleanup is
preview-first and explicit.

Workflow commands should preserve the lower-level primitives but collapse common
agent flows such as concept reuse checks, answer-context retrieval, page upsert
with citations, evidence search, source read/search, and graph neighborhood
inspection.

## Rationale

The IA Mining dry run showed that the low-level JSON-only CLI was technically
usable but expensive for both humans and agents. Agents had to pass explicit
sessions everywhere, shell out to PDF/text tools for source inspection, sift
large JSON payloads, and perform multiple low-level calls for common Graph Wiki
workflows.

Human-readable defaults reduce token volume and make operator debugging faster.
Structured output remains available where exact fields matter. Mutation-only
Change Logs keep recovery history focused on edits that may need inspection or
compensating changes.

## Alternatives Considered

Keep JSON as the only output format. This is easy to implement but keeps routine
operator and agent work noisy, especially for lists, reads, and validation
results.

Log every read as durable history. This preserves a broad audit trail, but the
current Change Log exists for mutation review and recovery. Read logging would
bury the useful before/after records under routine access noise.

Require explicit `--session` on every mutating command. This is simple and
predictable for scripts, but it is unnecessarily repetitive for long agent
sessions. Explicit session override still gives scripts deterministic control.

Treat extracted source text as canonical graph state. This would make source
search convenient, but it blurs the boundary between trusted Source Documents
and lossy extraction. Source Text Projections may be durable retrieval caches,
but they remain rebuildable, lossy, and subordinate to Source Documents.
