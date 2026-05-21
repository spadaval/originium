# Validate A Local Installation

Use this for a local proof that database setup, PDF import, heading extraction,
Chapter Ingestion, citation validation, retrieval, and logging are wired
together.

Load first:

- [../standards/cli.md](../standards/cli.md)

Run:

```bash
originium acceptance poc <pdf-path>
```

If the acceptance command fails, use the failing stage, operation, reason, and
action from the JSON output as the next diagnostic step.
