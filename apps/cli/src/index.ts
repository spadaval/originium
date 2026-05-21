import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import {
  type CitationDraft,
  type CitationLocatorKind,
  formatCitationPageRange,
  parseCitationPageRange,
  sourceDocumentRecordId,
  sourceTextProjectionRecordId,
  toSlug,
  validateCitationLocator,
  validatePageBodyCitationMarkers,
  validatePageBodyWikiPageReferences,
  type WikiPageKind,
  wikiPageRecordId,
  wikiPageSlugFromTitle,
} from "@originium/domain";
import {
  createPdfSourceDocumentDraftFromFile,
  extractPdfOutline,
  nearestOutlineForPage,
  projectPdfText,
  readPdfMetadata,
  type SourceOutlineEntry,
  searchPdfText,
} from "@originium/pdf-ingest";
import {
  type AgentActivityDraft,
  agentActivityKinds,
  agentActivitySources,
  agentActivityStatuses,
  buildAgentActivityListQuery,
  buildAgentActivityRecordQuery as buildSurrealAgentActivityRecordQuery,
  coreSchemaPath,
  defaultAgentActivityStatus,
  describeSurrealTarget,
  executeSurrealQuery,
  isAgentActivityKind,
  isAgentActivitySource,
  isAgentActivityStatus,
  localSurrealStartCommand,
  readSurrealConfig,
  type SurrealConfig,
  sourceDocumentBucketName,
  sourceDocumentBucketSurql,
} from "@originium/surreal";

type CliSuccess = {
  readonly ok: true;
  readonly command: string;
  readonly operation: string;
  readonly input: readonly string[];
  readonly message: string;
  readonly data?: unknown;
};

type CliFailure = {
  readonly ok: false;
  readonly command: string;
  readonly data?: unknown;
  readonly error: {
    readonly kind: "usage_error" | "operation_failure";
    readonly operation: string;
    readonly input: string;
    readonly reason: string;
    readonly action: string;
  };
};

export type CliResult = CliSuccess | CliFailure;

type CommandHandler = (argv: readonly string[]) => Promise<CliResult> | CliResult;

type HelpTopic = {
  readonly group: string;
  readonly summary: string;
  readonly commands: readonly {
    readonly usage: string;
    readonly summary: string;
    readonly example: string;
  }[];
  readonly workflows: readonly string[];
};

type HelpData =
  | {
      readonly mode: "top-level";
      readonly usage: string;
      readonly json: string;
      readonly groups: readonly { readonly group: string; readonly summary: string }[];
    }
  | {
      readonly mode: "group";
      readonly group: string;
      readonly summary: string;
      readonly commands: HelpTopic["commands"];
      readonly workflows: readonly string[];
      readonly json: string;
    };

type QueryLogOptions = {
  readonly kind: "read" | "write";
  readonly targetRecords: readonly string[];
  readonly beforeQuery?: string;
  readonly afterQuery?: string;
  readonly sessionId?: string;
  readonly relateEditedTargets?: readonly string[];
};

type AcceptanceStageState = "pass" | "fail" | "blocked" | "deferred" | "not-applicable";

type AcceptanceStage = {
  readonly name: string;
  readonly state: AcceptanceStageState;
  readonly reason: string;
  readonly result?: CliResult;
};

type RetrievalCandidate = {
  readonly kind: "wiki_page" | "source_text_projection";
  readonly id: string;
  readonly title: string;
  readonly text: string;
  readonly embedding?: readonly number[];
  readonly citedEvidence: readonly Record<string, unknown>[];
  readonly metadata: Record<string, unknown>;
};

type RankedRetrievalCandidate = {
  readonly kind: RetrievalCandidate["kind"];
  readonly id: string;
  readonly title: string;
  readonly score: number;
  readonly signals: {
    readonly lexical: number;
    readonly vector: number;
    readonly graphAuthority: number;
  };
  readonly citedEvidence: readonly Record<string, unknown>[];
  readonly metadata: Record<string, unknown>;
};

type OllamaEmbeddingConfig = {
  readonly url: string;
  readonly model: string;
};

const routeGroups: Record<string, CommandHandler> = {
  acceptance: routeAcceptance,
  activity: routeActivity,
  cite: routeCitation,
  citation: routeCitation,
  db: routeDb,
  help: routeHelp,
  ingest: routeIngest,
  link: routeLink,
  log: routeLog,
  page: routePage,
  refactor: routeRefactor,
  graph: routeGraph,
  retrieval: routeRetrieval,
  session: routeSession,
  source: routeSource,
  workflow: routeWorkflow,
};

const helpTopics: Record<string, HelpTopic> = {
  acceptance: {
    group: "acceptance",
    summary: "Run proof-oriented acceptance workflows.",
    commands: [
      {
        usage: "acceptance poc <pdf-path>",
        summary: "Run the POC acceptance harness and report blocked stages concretely.",
        example: "originium acceptance poc fixtures/source-documents/IA-Mining-DG.pdf --json",
      },
    ],
    workflows: ["Use before claiming a POC demo is healthy."],
  },
  activity: {
    group: "activity",
    summary: "Record and inspect agent activity outside durable Change Log mutations.",
    commands: [
      {
        usage: "activity record --kind <kind> --summary <summary> [--session <agent-session-id>]",
        summary: "Record a message, command, tool, status, file_change, graph_mutation, or error event.",
        example: 'originium activity record --kind status --summary "Started source audit" --json',
      },
      {
        usage: "activity list [--session <agent-session-id>]",
        summary: "List activity records, optionally scoped to an Agent Session.",
        example: "originium activity list --session agent_session:abc --json",
      },
    ],
    workflows: ["Use for operator-visible trace, not graph facts."],
  },
  citation: {
    group: "citation",
    summary: "Create, list, validate, narrow, and repair Citation relations.",
    commands: [
      {
        usage:
          "citation add --page <wiki-page-id> --source <source-document-id> --key <marker-key> [--pages <n-m>] [--quote <text>]",
        summary: "Create a Source Document Citation with citation-local locator fields.",
        example:
          'originium citation add --page wiki_page:curwb --source source_document:ia --key source --pages 12-13 --quote "Ultra-Reliable Wireless Backhaul" --json',
      },
      {
        usage: "citation validate <wiki-page-id>",
        summary:
          "Validate marker matching, targets, locator breadth, projection freshness, and claim metadata where available.",
        example: "originium citation validate wiki_page:curwb --json",
      },
      {
        usage: "citation narrow --page <wiki-page-id> --key <marker-key> --pages <n-m> [--quote <text>]",
        summary: "Update locator fields without changing the supported claim.",
        example: "originium citation narrow --page wiki_page:curwb --key source --pages 12-13 --json",
      },
      {
        usage:
          "citation repair --page <wiki-page-id> --key <marker-key> (--source <source-document-id> | --unsupported)",
        summary: "Retarget a Citation or mark the claim unsupported with before/after output.",
        example: "originium citation repair --page wiki_page:curwb --key source --unsupported --json",
      },
    ],
    workflows: [
      "Citations target Source Documents only; use inline Wiki Page References for page-to-page navigation.",
      "Run after page edits and before answer-context or refactor workflows.",
    ],
  },
  cite: {
    group: "cite",
    summary: "Shortcut group for creating validated Source Document Citations.",
    commands: [
      {
        usage:
          "cite create --page <wiki-page-id> --source <source-document-id> --key <marker-key> [--pages <n-m>] [--quote <text>]",
        summary: "Create a Source Document Citation with citation-local locator fields.",
        example:
          'originium cite create --page wiki_page:curwb --source source_document:ia --key source --pages 12-13 --quote "Ultra-Reliable Wireless Backhaul" --json',
      },
    ],
    workflows: [
      "Equivalent to citation add/create; Citation targets must be Source Documents.",
      "Use before citation validate and source promotion.",
    ],
  },
  db: {
    group: "db",
    summary: "Operate the local SurrealDB target and schema.",
    commands: [
      {
        usage: "db status",
        summary: "Show configured SurrealDB target and managed process state.",
        example: "originium db status",
      },
      {
        usage: "db doctor",
        summary: "Check database connectivity and file bucket capability.",
        example: "originium db doctor --json",
      },
      {
        usage: "db apply-schema",
        summary: "Apply the core Graph Wiki schema.",
        example: "originium db apply-schema --json",
      },
    ],
    workflows: ["Run db doctor before diagnosing command-specific failures."],
  },
  graph: {
    group: "graph",
    summary: "Inspect and lint Graph Wiki records.",
    commands: [
      {
        usage: "graph lint [--family citation|source|page|page-reference|link]",
        summary: "Run umbrella or focused lint families.",
        example: "originium graph lint --family page-reference --json",
      },
      {
        usage: "graph neighborhood <record-id>",
        summary: "Read a bounded Wiki Page or Source Document neighborhood.",
        example: "originium graph neighborhood wiki_page:curwb --json",
      },
    ],
    workflows: ["Use focused lint after citation, source, page, or refactor mutations."],
  },
  help: {
    group: "help",
    summary: "Show command discovery output.",
    commands: [
      { usage: "help [group]", summary: "Show top-level help or one group.", example: "originium help citation" },
      { usage: "<group> --help", summary: "Show group-level help.", example: "originium citation --help" },
    ],
    workflows: ["Use --json on any command for structured output."],
  },
  ingest: {
    group: "ingest",
    summary: "Run bounded ingestion helpers.",
    commands: [
      {
        usage: "ingest chapter --source <source-document-id> --locator <locator> [--title <page-title>]",
        summary: "Prepare a bounded source-to-page ingestion context.",
        example: 'originium ingest chapter --source source_document:ia --pages 12-13 --title "CURWB" --json',
      },
    ],
    workflows: ["Broad ingestion automation is deferred; prefer source promote for one selected locator."],
  },
  link: {
    group: "link",
    summary: "Inspect deprecated Manual Links; new generic link writes are disabled.",
    commands: [
      {
        usage: "link add --from <record-id> --to <record-id> --label <label> --reason <reason>",
        summary: "Disabled for the frame workflow MVP; use inline Wiki Page References or Citations instead.",
        example: 'originium link add --from wiki_page:a --to wiki_page:b --label "uses" --reason "deprecated" --json',
      },
      {
        usage: "link list [--record <record-id>]",
        summary: "List Manual Links.",
        example: "originium link list --record wiki_page:a --json",
      },
    ],
    workflows: ["Use inline Wiki Page References for page navigation and Citations for Source Document evidence."],
  },
  log: {
    group: "log",
    summary: "Inspect durable Change Log entries.",
    commands: [
      {
        usage: "log show [--session <agent-session-id>]",
        summary: "List graph mutation Change Log entries.",
        example: "originium log show --session agent_session:abc --json",
      },
    ],
    workflows: ["Use after write commands and refactors to audit mutations."],
  },
  model: {
    group: "model",
    summary: "Deferred Domain Model primitive surface; frame workflows own the MVP.",
    commands: [
      {
        usage: "model --help",
        summary: "Explain deferred model primitives and frame ownership.",
        example: "originium model --help",
      },
    ],
    workflows: [
      "Relation-label registries, model proposals, versions, impact analysis, and migrations require separate future beads.",
    ],
  },
  page: {
    group: "page",
    summary: "Create, edit, search, and inspect Wiki Pages.",
    commands: [
      {
        usage: "page update --title <title> --body <body>",
        summary: "Create or update a Wiki Page.",
        example: 'originium page update --title "CURWB" --body "Maintained synthesis.[^source]" --json',
      },
      {
        usage: "page patch --page <wiki-page-id> --body-file <path> [--apply]",
        summary: "Preview or apply a full body patch with citation validation.",
        example: "originium page patch --page wiki_page:curwb --body-file /tmp/body.md --apply --json",
      },
      {
        usage: "page candidates <topic>",
        summary: "Find reuse candidates before creating a page.",
        example: 'originium page candidates "wireless backhaul" --json',
      },
    ],
    workflows: ["Run citation validate and focused lint after page edits."],
  },
  refactor: {
    group: "refactor",
    summary: "Dry-run-first graph refactor workflows.",
    commands: [
      {
        usage: "refactor rename-page --page <wiki-page-id> --title <new-title> [--dry-run]",
        summary: "Preview or execute a citation-safe page rename.",
        example: 'originium refactor rename-page --page wiki_page:old --title "New Title" --dry-run --json',
      },
    ],
    workflows: ["Refactors must preserve Citation edges and run focused lint before commit."],
  },
  retrieval: {
    group: "retrieval",
    summary: "Search and embed retrieval records.",
    commands: [
      {
        usage: "retrieval search <query>",
        summary: "Rank Wiki Pages and Source Text Projections.",
        example: 'originium retrieval search "wireless backhaul" --json',
      },
      {
        usage: "retrieval embed [--target all|wiki|source]",
        summary: "Refresh stale embeddings.",
        example: "originium retrieval embed --target wiki --limit 10 --json",
      },
    ],
    workflows: ["Answer-context owns the bundled question answering workflow."],
  },
  session: {
    group: "session",
    summary: "Manage Agent Sessions.",
    commands: [
      {
        usage: "session start --purpose <purpose>",
        summary: "Create and remember a current Agent Session.",
        example: 'originium session start --purpose "Graph maintenance" --json',
      },
      {
        usage: "session current",
        summary: "Show the current Agent Session source.",
        example: "originium session current",
      },
      { usage: "session end", summary: "Clear the current Agent Session.", example: "originium session end" },
    ],
    workflows: ["Write commands use the current session for Change Log context when available."],
  },
  source: {
    group: "source",
    summary: "Import, locate, diagnose, and search Source Documents and projections.",
    commands: [
      {
        usage: "source import-pdf <path>",
        summary: "Import a PDF Source Document into the file bucket.",
        example: "originium source import-pdf fixtures/source-documents/IA-Mining-DG.pdf --json",
      },
      {
        usage: "source find <query-or-id>",
        summary: "Resolve Source Documents by path, title, fingerprint, or corpus metadata.",
        example: 'originium source find "IA Mining" --json',
      },
      {
        usage: "source locate --source <source-document-id> (--pages <n-m> | --quote <text>)",
        summary: "Map page or quote input to document-local locators and projection spans.",
        example: 'originium source locate --source source_document:ia --pages 12-13 --quote "Ultra-Reliable" --json',
      },
      {
        usage: "source diagnostics [--source <source-document-id>]",
        summary: "Report import, projection, embedding, and citation-locator health.",
        example: "originium source diagnostics --source source_document:ia --json",
      },
      {
        usage: "source evidence <query> [--trace]",
        summary: "Search Source Documents and Source Text Projections with trace output.",
        example: 'originium source evidence "backhaul" --trace --json',
      },
    ],
    workflows: ["Use source locate before citation add or source promote."],
  },
  workflow: {
    group: "workflow",
    summary: "Run bundled access-pattern workflows.",
    commands: [
      {
        usage: "workflow answer-context <query>",
        summary: "Bundle maintained synthesis, cited evidence, snippets, and warnings.",
        example: 'originium workflow answer-context "How is CURWB used?" --json',
      },
      {
        usage: "workflow page-upsert --title <title> --source <source-document-id> --key <marker-key>",
        summary: "Create or update one Wiki Page with one Citation.",
        example: 'originium workflow page-upsert --title "CURWB" --source source_document:ia --key source --json',
      },
    ],
    workflows: ["Workflow commands compose lower-level page, citation, source, lint, and retrieval operations."],
  },
};

const wikiPageKinds = ["concept", "workflow", "evidence", "decision", "question"] as const;

export async function runCli(argv: readonly string[] = process.argv.slice(2)): Promise<CliResult> {
  const routedArgv = withoutOutputFlags(argv);
  const [group] = routedArgv;

  if (!group || group === "--help" || group === "-h") return helpResult(routedArgv, undefined);
  if (group === "help") return routeHelp(routedArgv);

  const handler = routeGroups[group];
  if (routedArgv[1] === "--help" || routedArgv[1] === "-h") return helpResult(routedArgv, group);
  if (!handler) {
    return usageFailure({
      command: group,
      operation: "cli.route",
      input: routedArgv.join(" "),
      reason: `Unknown command group '${group}'.`,
      action: `Choose one of: ${Object.keys(routeGroups).join(", ")}.`,
    });
  }

  return handler(routedArgv);
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<string> {
  const result = await runCli(argv);
  return wantsJson(argv) ? JSON.stringify(result, null, 2) : renderCliResult(result);
}

async function routeDb(argv: readonly string[]): Promise<CliResult> {
  const [, command] = argv;
  const config = readSurrealConfig();

  if (!command) {
    return usageFailure({
      command: "db",
      operation: "db.route",
      input: argv.join(" "),
      reason: "Missing db command.",
      action: "Use one of: start, stop, status, doctor, apply-schema.",
    });
  }

  if (command === "start") return startDb(argv, config);
  if (command === "stop") return stopDb(argv, config);

  if (command === "status") {
    const target = describeSurrealTarget(config);
    const pid = readPid(config);
    return success({
      command: "db status",
      operation: "db.status",
      input: argv,
      message: `SurrealDB target: ${target.url} ns=${target.namespace} db=${target.database}`,
      data: {
        target,
        managedProcess: pid ? { pid, running: isProcessRunning(pid), pidFile: config.pidFile } : undefined,
        bucketDir: config.bucketDir,
      },
    });
  }

  if (command === "doctor") {
    const result = await executeSurrealQuery(config, `${sourceDocumentBucketSurql(config)}\nINFO FOR DB;`, {
      queryId: "db.doctor.file-bucket",
    });
    if (!result.ok) return fromSurrealFailure("db doctor", argv, result.error);
    return success({
      command: "db doctor",
      operation: "db.doctor",
      input: argv,
      message: `SurrealDB doctor passed for ${describeSurrealTarget(config).url}; file bucket '${sourceDocumentBucketName}' is definable.`,
      data: result.result,
    });
  }

  if (command === "apply-schema") {
    const schema = await Bun.file(coreSchemaPath).text();
    const result = await executeSurrealQuery(config, `${sourceDocumentBucketSurql(config)}\n${schema}`, {
      queryId: coreSchemaPath,
    });
    if (!result.ok) return fromSurrealFailure("db apply-schema", argv, result.error);
    return success({
      command: "db apply-schema",
      operation: "db.apply-schema",
      input: argv,
      message: `Applied schema file: ${coreSchemaPath}`,
      data: { schemaPath: coreSchemaPath, target: describeSurrealTarget(config) },
    });
  }

  return usageFailure({
    command: `db ${command}`,
    operation: "db.route",
    input: argv.join(" "),
    reason: `Unknown db command '${command}'.`,
    action: "Use one of: start, stop, status, doctor, apply-schema.",
  });
}

function routeHelp(argv: readonly string[]): CliResult {
  const topic = argv[1];
  if (!topic) return helpResult(argv, undefined);
  if (topic === "--help" || topic === "-h") return helpResult(argv, "help");
  return helpResult(argv, topic);
}

function helpResult(argv: readonly string[], group: string | undefined): CliResult {
  if (group) {
    const topic = helpTopics[group];
    if (!topic) {
      return usageFailure({
        command: "help",
        operation: "help.show",
        input: argv.join(" "),
        reason: `Unknown help group '${group}'.`,
        action: `Choose one of: ${Object.keys(helpTopics).sort().join(", ")}.`,
      });
    }

    return success({
      command: group === "help" ? "help" : `help ${group}`,
      operation: "help.show",
      input: argv,
      message: `${topic.group}: ${topic.summary}`,
      data: {
        mode: "group",
        group: topic.group,
        summary: topic.summary,
        commands: topic.commands,
        workflows: topic.workflows,
        json: "Append --json to any command for structured output.",
      } satisfies HelpData,
    });
  }

  const groups = Object.values(helpTopics)
    .map((topic) => ({ group: topic.group, summary: topic.summary }))
    .sort((left, right) => left.group.localeCompare(right.group));

  return success({
    command: "help",
    operation: "help.show",
    input: argv,
    message: "Originium Graph Wiki CLI command groups.",
    data: {
      mode: "top-level",
      usage: "originium <group> <command> [options]",
      json: "Append --json to any command for structured output.",
      groups,
    } satisfies HelpData,
  });
}

async function routeSource(argv: readonly string[]): Promise<CliResult> {
  const [, command] = argv;
  const config = readSurrealConfig();

  if (!command) {
    return usageFailure({
      command: "source",
      operation: "source.route",
      input: argv.join(" "),
      reason: "Missing source command.",
      action:
        "Use one of: import-pdf, list, find, outline, projections, evidence, locate, diagnostics, promote, chunk, read, search.",
    });
  }

  if (command === "anchor") return deprecatedSourceAnchorCommand(argv);
  if (command === "list") {
    return queryCommand(
      "source list",
      "source.list",
      argv,
      "SELECT id, title, kind, sha256, mime_type, page_count, source_uri, corpus, publisher, document_class, industries, product_families, version, publication_date, trust_status, frame, frame_metadata, extraction_status, updated_at FROM source_document ORDER BY updated_at DESC;",
      "Listed imported Source Documents.",
      {},
      { kind: "read", targetRecords: ["source_document"] },
    );
  }
  if (command === "metadata") return sourceMetadata(argv);
  if (command === "find") return findSourceDocuments(argv);

  if (command === "import-pdf") {
    const path = argv[2];
    if (!path) return missingArgument("source import-pdf", "source.import-pdf", argv, "<path>");

    try {
      const draft = await createPdfSourceDocumentDraftFromFile(path);
      const id = sourceDocumentRecordId(draft);
      const fileKey = `${id.replace("source_document:", "")}/${basename(path)}`;
      const filePointer = `${sourceDocumentBucketName}:/${fileKey}`;
      const bucketPath = join(config.bucketDir, fileKey);
      mkdirSync(dirname(bucketPath), { recursive: true });
      copyFileSync(path, bucketPath);
      const metadata = sourceMetadataFromArgv(argv);
      if (!metadata.ok) return metadata.failure;
      const query = [
        sourceDocumentBucketSurql(config),
        `UPSERT ${id} SET title = "${escapeSurrealString(draft.title)}", kind = "pdf", file = { bucket: "${sourceDocumentBucketName}", key: "/${escapeSurrealString(fileKey)}", pointer: "f\\"${escapeSurrealString(filePointer)}\\"" }, sha256 = "${draft.sha256}", mime_type = "${draft.mimeType}", page_count = ${draft.pageCount ?? "NONE"}, source_uri = "${escapeSurrealString(draft.sourceUri ?? path)}", extraction_status = "imported"${metadata.setClause}, updated_at = time::now();`,
        `SELECT * FROM ${id};`,
      ].join("\n");
      const result = await executeSurrealQuery(
        config,
        loggedQuery("source import-pdf", "source.import-pdf", argv, query, {
          kind: "write",
          targetRecords: [id],
          beforeQuery: `SELECT * FROM ${id}`,
          afterQuery: `SELECT * FROM ${id}`,
          relateEditedTargets: [id],
        }),
        { queryId: `source.import-pdf:${path}` },
      );
      if (!result.ok) return fromSurrealFailure("source import-pdf", argv, result.error);
      return success({
        command: "source import-pdf",
        operation: "source.import-pdf",
        input: argv,
        message: `Imported Source Document ${id} into file bucket ${sourceDocumentBucketName}.`,
        data: {
          id,
          filePointer,
          sha256: draft.sha256,
          pageCount: draft.pageCount,
          metadata: metadata.data,
          result: result.result,
        },
      });
    } catch (error) {
      return operationFailure(
        "source import-pdf",
        "source.import-pdf",
        argv,
        errorReason(error),
        "Verify the PDF path exists and poppler pdfinfo is installed.",
      );
    }
  }

  if (command === "headings") {
    return operationFailure(
      "source headings",
      "source.headings",
      argv,
      "Source Outline records are no longer part of the Graph Wiki command model.",
      "Use 'originium source outline <pdf-path> --source <source-document-id>' for non-canonical outline metadata, or 'originium source locate --source <source-document-id> --pages <range>' for citation locators.",
    );
  }

  if (command === "outline") {
    const path = argv[2];
    const sourceOnlyId = valueAfter(argv, "--source") ?? (isRecordId(path, "source_document") ? path : undefined);
    if (!path || isRecordId(path, "source_document"))
      return missingArgument("source outline", "source.outline", argv, "<pdf-path>");
    const sourceId = sourceOnlyId ?? defaultSourceDocumentId(path);
    try {
      const outline = extractPdfOutline(path, sourceId).map((outlineEntry) =>
        cliSourceOutlineEntry(outlineEntry, sourceId),
      );
      return success({
        command: "source outline",
        operation: "source.outline",
        input: argv,
        message: `Extracted ${outline.length} outline entr${outline.length === 1 ? "y" : "ies"} for ${sourceId}.`,
        data: {
          sourceId,
          warning:
            "Source outline entries are projection metadata for navigation only. Do not use them as graph records or citation targets.",
          outline,
        },
      });
    } catch (error) {
      return operationFailure(
        "source outline",
        "source.outline",
        argv,
        errorReason(error),
        "Verify pdftotext can extract the fixture PDF.",
      );
    }
  }

  if (command === "projections") return buildSourceTextProjections(argv);
  if (command === "evidence") return searchPersistedEvidence(argv);
  if (command === "locate") return locateSourceEvidence(argv);
  if (command === "diagnostics") return sourceDiagnostics(argv);
  if (command === "promote") return promoteSourceLocator(argv);

  if (command === "chunk") {
    const path = argv[2];
    if (!path) return missingArgument("source chunk", "source.chunk", argv, "<pdf-path>");
    if (valueAfter(argv, "--heading")) {
      return operationFailure(
        "source chunk",
        "source.chunk",
        argv,
        "Source Outline IDs are no longer accepted by source chunk.",
        "Pass a document-local locator such as --pages 12-14, or run source locate first.",
      );
    }
    const pageRange = parsePageRangeArgument(argv);
    if (!pageRange) return missingArgument("source chunk", "source.chunk", argv, "--pages <start-end>");
    if ("ok" in pageRange) return pageRange;
    const sourceId = valueAfter(argv, "--source") ?? defaultSourceDocumentId(path);
    const maxTokens = Number.parseInt(valueAfter(argv, "--max-tokens") ?? "100000", 10);
    const chunk = projectPdfText(path, { sourceDocumentId: sourceId, pageRange, maxTokens });
    const chunkId = `ingestion_chunk:${sourceId.replace(/^source_document:/, "")}_p${pageRange.start}_${pageRange.end}_${maxTokens}`;
    const result = await executeSurrealQuery(
      readSurrealConfig(),
      loggedQuery(
        "source chunk",
        "source.chunk",
        argv,
        `UPSERT ${chunkId} SET source_document = ${sourceId}, start_page = ${chunk.pageRange.start}, end_page = ${chunk.pageRange.end}, token_estimate = ${chunk.tokenEstimate}, extraction_method = "${chunk.provenance.extractionMethod}", created_at = time::now(); SELECT * FROM ${chunkId};`,
        {
          kind: "write",
          targetRecords: [chunkId, sourceId],
          beforeQuery: `SELECT * FROM ${chunkId}`,
          afterQuery: `SELECT * FROM ${chunkId}`,
          relateEditedTargets: [chunkId],
        },
      ),
      { queryId: `source.chunk:${sourceId}:${pageRange.start}-${pageRange.end}` },
    );
    if (!result.ok) return fromSurrealFailure("source chunk", argv, result.error);
    return success({
      command: "source chunk",
      operation: "source.chunk",
      input: argv,
      message: `Projected and recorded Ingestion Chunk ${chunkId} for ${sourceId} pages ${pageRange.start}-${pageRange.end} with estimated ${chunk.tokenEstimate} tokens.`,
      data: {
        id: chunkId,
        sourceDocumentId: chunk.sourceDocumentId,
        citationTarget: sourceId,
        pageRange: chunk.pageRange,
        tokenEstimate: chunk.tokenEstimate,
        extractionMethod: chunk.provenance.extractionMethod,
        text: chunk.text,
        result: result.result,
      },
    });
  }

  if (command === "read") return readSourceText(argv);
  if (command === "search") return searchSourceText(argv, command);

  return unknownCommand(
    "source",
    command,
    argv,
    "Use one of: import-pdf, list, find, outline, projections, evidence, locate, diagnostics, promote, chunk, read, search.",
  );
}

async function buildSourceTextProjections(argv: readonly string[]): Promise<CliResult> {
  const path = argv[2];
  if (!path) return missingArgument("source projections", "source.projections", argv, "<pdf-path>");
  const sourceId = valueAfter(argv, "--source") ?? defaultSourceDocumentId(path);
  const maxTokens = Number.parseInt(valueAfter(argv, "--max-tokens") ?? "12000", 10);
  const projectionVersion = valueAfter(argv, "--projection-version") ?? "pdf-page-v1";

  try {
    const metadata = readPdfMetadata(path);
    const pageCount = metadata.pageCount;
    const projections = Array.from({ length: pageCount }, (_, index) => {
      const startPage = index + 1;
      const endPage = startPage;
      const projection = projectPdfText(path, {
        sourceDocumentId: sourceId,
        pageRange: { start: startPage, end: endPage },
        maxTokens,
      });
      const projectionId = sourceTextProjectionRecordId({
        sourceDocumentId: sourceId,
        startPage,
        endPage,
        projectionVersion,
      });
      const textHash = sha256Hex(projection.text);
      return {
        id: projectionId,
        startPage,
        endPage,
        textHash,
        statement: `UPSERT ${projectionId} SET source_document = ${sourceId}, start_page = ${startPage}, end_page = ${endPage}, text = "${escapeSurrealString(projection.text)}", text_hash = "${textHash}", extraction_method = "${escapeSurrealString(projection.provenance.extractionMethod)}", extraction_version = "pdf-ingest-v1", projection_version = "${escapeSurrealString(projectionVersion)}", projection_status = "ready", updated_at = time::now();`,
      };
    });
    const result = await executeSurrealQuery(
      readSurrealConfig(),
      loggedQuery(
        "source projections",
        "source.projections",
        argv,
        projections.map((projection) => projection.statement).join("\n"),
        {
          kind: "write",
          targetRecords: [sourceId, "source_text_projection"],
          afterQuery: `SELECT id, source_document, start_page, end_page, text_hash, extraction_method, projection_version, projection_status FROM source_text_projection WHERE source_document = ${sourceId} ORDER BY start_page ASC`,
          relateEditedTargets: [sourceId],
        },
      ),
      { queryId: `source.projections:${sourceId}` },
    );
    if (!result.ok) return fromSurrealFailure("source projections", argv, result.error);
    return success({
      command: "source projections",
      operation: "source.projections",
      input: argv,
      message: `Built ${projections.length} per-page Source Text Projection record(s) for ${sourceId}.`,
      data: {
        sourceId,
        projectionVersion,
        warning:
          "Source Text Projections are lossy, rebuildable search caches. Verify evidence against the canonical Source Document before citing.",
        projections: projections.map(({ id, startPage, endPage, textHash }) => ({ id, startPage, endPage, textHash })),
        result: result.result,
      },
    });
  } catch (error) {
    return operationFailure(
      "source projections",
      "source.projections",
      argv,
      errorReason(error),
      "Verify the PDF path and rerun source projections with the same --source ID.",
    );
  }
}

async function searchPersistedEvidence(argv: readonly string[]): Promise<CliResult> {
  const queryText = positionalArgs(argv, 2).join(" ").trim();
  if (!queryText) return missingArgument("source evidence", "source.evidence", argv, "<query>");
  const sourceId = valueAfter(argv, "--source");
  const limit = Number.parseInt(valueAfter(argv, "--limit") ?? "10", 10);
  const traceEnabled = argv.includes("--trace");
  if (valueAfter(argv, "--heading")) {
    return operationFailure(
      "source evidence",
      "source.evidence",
      argv,
      "Source Outline filters are no longer supported by source evidence.",
      "Filter by --source <source-document-id> and use page ranges or citation locators in downstream commands.",
    );
  }
  if (sourceId && !isRecordId(sourceId, "source_document")) {
    return operationFailure(
      "source evidence",
      "source.evidence",
      argv,
      `Invalid Source Document ID '${sourceId}'.`,
      "Pass a Source Document record ID from 'originium source list', such as source_document:example.",
    );
  }
  const filters = [
    sourceId ? `source_document = ${sourceId}` : "",
    `text CONTAINS "${escapeSurrealString(queryText)}"`,
  ].filter(Boolean);
  const where = filters.length > 0 ? ` WHERE ${filters.join(" AND ")}` : "";
  const projectionScope = [sourceId ? `source_document = ${sourceId}` : ""].filter(Boolean);
  const projectionWhere = projectionScope.length > 0 ? ` WHERE ${projectionScope.join(" AND ")}` : "";
  const statements = [
    sourceId ? `SELECT id FROM ${sourceId};` : "",
    `SELECT id FROM source_text_projection${projectionWhere} LIMIT 1;`,
    `SELECT id, source_document, start_page, end_page, text_hash, extraction_method, extraction_version, projection_version, projection_status, string::slice(text, 0, 700) AS snippet FROM source_text_projection${where} ORDER BY start_page ASC LIMIT ${limit} FETCH source_document;`,
    traceEnabled
      ? `SELECT id, source_document, start_page, end_page, text_hash, projection_status, string::slice(text, 0, 240) AS snippet FROM source_text_projection${projectionWhere} ORDER BY start_page ASC LIMIT ${limit * 2};`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  const result = await executeSurrealQuery(
    readSurrealConfig(),
    loggedQuery("source evidence", "source.evidence", argv, statements, {
      kind: "read",
      targetRecords: [sourceId ?? "source_text_projection"],
    }),
    { queryId: `source.evidence:${queryText}` },
  );
  if (!result.ok) return fromSurrealFailure("source evidence", argv, result.error);
  const queryResult = result.result as Array<{ result?: unknown }>;
  const sourceStatementOffset = sourceId ? 1 : 0;
  if (sourceId && resultRowCount(queryResult[0]) === 0) {
    return operationFailure(
      "source evidence",
      "source.evidence",
      argv,
      `Source Document ${sourceId} does not exist; SELECT returned no source_document record.`,
      "Run 'originium source list' to find an imported Source Document, or import the PDF before evidence search.",
    );
  }
  if (resultRowCount(queryResult[sourceStatementOffset]) === 0) {
    return operationFailure(
      "source evidence",
      "source.evidence",
      argv,
      `No Source Text Projections exist for ${sourceId ?? "the database"}.`,
      sourceId
        ? `Run 'originium source projections <pdf-path> --source ${sourceId}' before evidence search.`
        : "Run 'originium source projections <pdf-path> --source <source-document-id>' for at least one imported Source Document.",
    );
  }

  return success({
    command: "source evidence",
    operation: "source.evidence",
    input: argv,
    message: `Searched lossy Source Text Projections for '${queryText}'.`,
    data: {
      query: queryText,
      sourceId,
      warning:
        "Source Text Projections are lossy search caches. Use Source Document/PDF reading for canonical verification before citing.",
      trace: traceEnabled
        ? {
            query: queryText,
            filters: { sourceId, limit },
            executedStatements: statements.split("\n"),
            rejectedNearMisses: queryResult[sourceStatementOffset + 2]?.result ?? [],
          }
        : undefined,
      result: result.result,
    },
  });
}

function findSourceDocuments(argv: readonly string[]): Promise<CliResult> {
  const queryText = positionalArgs(argv, 2).join(" ").trim() || valueAfter(argv, "--query");
  if (!queryText) return Promise.resolve(missingArgument("source find", "source.find", argv, "<query-or-id>"));
  const limit = Number.parseInt(valueAfter(argv, "--limit") ?? "10", 10);
  const sourceId = isRecordId(queryText, "source_document") ? queryText : undefined;
  const escaped = escapeSurrealString(queryText);
  const where = sourceId
    ? `id = ${sourceId}`
    : `title CONTAINS "${escaped}" OR source_uri CONTAINS "${escaped}" OR sha256 = "${escaped}" OR kind CONTAINS "${escaped}" OR corpus CONTAINS "${escaped}" OR document_class CONTAINS "${escaped}" OR publisher CONTAINS "${escaped}"`;
  return queryCommand(
    "source find",
    "source.find",
    argv,
    `SELECT id, title, kind, sha256, mime_type, page_count, source_uri, corpus, publisher, document_class, industries, product_families, version, publication_date, trust_status, frame, frame_metadata, extraction_status, updated_at FROM source_document WHERE ${where} ORDER BY updated_at DESC, title ASC LIMIT ${limit};`,
    `Resolved Source Documents for '${queryText}'.`,
    { query: queryText, limit },
    { kind: "read", targetRecords: [sourceId ?? "source_document"] },
  );
}

function locateSourceEvidence(argv: readonly string[]): CliResult {
  const sourceId = valueAfter(argv, "--source") ?? valueAfter(argv, "--document");
  if (!sourceId) return missingArgument("source locate", "source.locate", argv, "--source <source-document-id>");
  if (!isRecordId(sourceId, "source_document")) {
    return operationFailure(
      "source locate",
      "source.locate",
      argv,
      `Invalid Source Document ID '${sourceId}'.`,
      "Pass a Source Document record ID from 'originium source list', such as source_document:example.",
    );
  }
  const pageRange = citationPageRangeFromArgv(argv);
  if (pageRange instanceof Error) {
    return operationFailure(
      "source locate",
      "source.locate",
      argv,
      pageRange.message,
      "Pass a page range such as --pages 12-14.",
    );
  }
  const quote = valueAfter(argv, "--quote");
  const context = valueAfter(argv, "--context");
  if (!pageRange && !quote && !context) {
    return missingArgument(
      "source locate",
      "source.locate",
      argv,
      "--pages <range>, --quote <text>, or --context <text>",
    );
  }
  const locatorKind = inferLocatorKind(pageRange, quote, context);
  const locator = {
    sourceDocumentId: sourceId,
    locatorKind,
    pageRange,
    locationHint: valueAfter(argv, "--location") ?? valueAfter(argv, "--location-hint"),
    quote,
    context,
    projectionId: valueAfter(argv, "--projection") ?? valueAfter(argv, "--projection-id"),
  };
  return success({
    command: "source locate",
    operation: "source.locate",
    input: argv,
    message: `Prepared ${locatorKind} locator for ${sourceId}.`,
    data: {
      locator,
      suggestedCitation:
        "Use this locator with citation add/create by passing --source, --pages, --quote/--context, --location, and --projection as applicable.",
    },
  });
}

function sourceDiagnostics(argv: readonly string[]): Promise<CliResult> {
  const sourceId = valueAfter(argv, "--source") ?? valueAfter(argv, "--document");
  const where = sourceId ? ` WHERE source_document = ${sourceId}` : "";
  if (sourceId && !isRecordId(sourceId, "source_document")) {
    return Promise.resolve(
      operationFailure(
        "source diagnostics",
        "source.diagnostics",
        argv,
        `Invalid Source Document ID '${sourceId}'.`,
        "Pass a Source Document record ID from 'originium source list', such as source_document:example.",
      ),
    );
  }
  return queryCommand(
    "source diagnostics",
    "source.diagnostics",
    argv,
    [
      sourceId
        ? `SELECT id, title, kind, sha256, mime_type, page_count, source_uri, extraction_status, updated_at FROM ${sourceId};`
        : "SELECT id, title, kind, sha256, mime_type, page_count, source_uri, extraction_status, updated_at FROM source_document ORDER BY updated_at DESC LIMIT 20;",
      `SELECT count() AS projection_count, math::min(start_page) AS first_page, math::max(end_page) AS last_page FROM source_text_projection${where} GROUP ALL;`,
      sourceId
        ? `SELECT count() AS citation_count FROM cites WHERE out = ${sourceId} GROUP ALL;`
        : "SELECT count() AS citation_count FROM cites GROUP ALL;",
    ].join("\n"),
    sourceId ? `Reported Source Document diagnostics for ${sourceId}.` : "Reported Source Document diagnostics.",
    { sourceId },
    { kind: "read", targetRecords: [sourceId ?? "source_document", "source_text_projection", "cites"] },
  );
}

async function promoteSourceLocator(argv: readonly string[]): Promise<CliResult> {
  const sourceId = valueAfter(argv, "--source") ?? valueAfter(argv, "--document");
  const title = valueAfter(argv, "--title");
  const pageId = valueAfter(argv, "--page") ?? (title ? wikiPageRecordId(title) : undefined);
  const key = valueAfter(argv, "--key") ?? "source";
  const body =
    valueAfter(argv, "--body") ??
    (title ? `${title} synthesized from selected Source Document evidence.[^${key}]` : undefined);
  if (!sourceId) return missingArgument("source promote", "source.promote", argv, "--source <source-document-id>");
  if (!isRecordId(sourceId, "source_document")) {
    return operationFailure(
      "source promote",
      "source.promote",
      argv,
      `Invalid Source Document ID '${sourceId}'.`,
      "Pass a Source Document record ID from 'originium source list', such as source_document:example.",
    );
  }
  if (!title && !pageId) return missingArgument("source promote", "source.promote", argv, "--title or --page");
  if (!body) return missingArgument("source promote", "source.promote", argv, "--body <page-body>");
  const pageRange = citationPageRangeFromArgv(argv);
  if (pageRange instanceof Error) {
    return operationFailure(
      "source promote",
      "source.promote",
      argv,
      pageRange.message,
      "Pass a page range such as --pages 12-14.",
    );
  }
  const citationDraft = citationDraftFromInput({
    pageId: pageId ?? wikiPageRecordId(title ?? ""),
    sourceId,
    key,
    label: valueAfter(argv, "--label") ?? key,
    claim: valueAfter(argv, "--claim") ?? title ?? key,
    quote: valueAfter(argv, "--quote"),
    context: valueAfter(argv, "--context"),
    pageRange,
    locationHint: valueAfter(argv, "--location") ?? valueAfter(argv, "--location-hint"),
    projectionId: valueAfter(argv, "--projection") ?? valueAfter(argv, "--projection-id"),
    textHash: valueAfter(argv, "--text-hash"),
    confidence: optionalFloatAfter(argv, "--confidence") ?? 1,
  });
  const locatorIssues = validateCitationLocator(citationDraft);
  if (locatorIssues.length > 0) {
    return operationFailure(
      "source promote",
      "source.promote",
      argv,
      `Source promotion locator validation failed for ${sourceId}: ${locatorIssues.join(" ")}`,
      "Run source locate first or pass narrower --pages, --quote, --context, and --claim values.",
      { issues: locatorIssues },
    );
  }

  const pageTitle = title ?? pageId ?? "Promoted Source Evidence";
  const pageSlug = wikiPageSlugFromTitle(pageTitle);
  const targetPageId = pageId ?? wikiPageRecordId(pageTitle);
  const candidatesQuery = [
    `SELECT id, title, slug, string::slice(body, 0, 280) AS snippet FROM wiki_page WHERE slug = "${escapeSurrealString(pageSlug)}" OR title CONTAINS "${escapeSurrealString(pageTitle)}" LIMIT 5;`,
    `UPSERT ${targetPageId} SET title = "${escapeSurrealString(pageTitle)}", slug = "${pageSlug}", body = "${escapeSurrealString(body)}", updated_at = time::now();`,
    `DELETE cites WHERE in = ${targetPageId} AND key = "${escapeSurrealString(key)}";`,
    `RELATE ${targetPageId}->cites->${sourceId} SET ${citationSetClause(citationDraft)};`,
    `SELECT id, title, slug, body FROM ${targetPageId};`,
    `SELECT id, in, out, key, label, claim, locator_kind, page_range, quote, context, validation_status, confidence FROM cites WHERE in = ${targetPageId};`,
  ].join("\n");
  const result = await executeSurrealQuery(
    readSurrealConfig(),
    loggedQuery("source promote", "source.promote", argv, candidatesQuery, {
      kind: "write",
      targetRecords: [targetPageId, sourceId],
      beforeQuery: `SELECT * FROM ${targetPageId}`,
      afterQuery: `SELECT * FROM ${targetPageId}`,
      relateEditedTargets: [targetPageId],
    }),
    { queryId: `source.promote:${targetPageId}:${key}` },
  );
  if (!result.ok) return fromSurrealFailure("source promote", argv, result.error);
  const lint = lintGraphWikiStatements([
    { result: [{ id: targetPageId, title: pageTitle, slug: pageSlug, body }] },
    { result: [{ in: targetPageId, out: sourceId, key, ...citationDraftToLintRecord(citationDraft) }] },
    { result: [] },
    { result: [] },
  ]);
  return success({
    command: "source promote",
    operation: "source.promote",
    input: argv,
    message: `Promoted ${sourceId} locator into Wiki Page ${targetPageId} with Citation ${key}.`,
    data: {
      pageId: targetPageId,
      sourceId,
      citationKey: key,
      duplicateRisk:
        "Review the first query result for same-title or same-slug Wiki Pages before relying on the new page.",
      focusedLint: lint,
      result: result.result,
    },
  });
}

function sourceMetadata(argv: readonly string[]): Promise<CliResult> {
  const sourceId = valueAfter(argv, "--source") ?? argv[2];
  if (!sourceId)
    return Promise.resolve(
      missingArgument("source metadata", "source.metadata", argv, "--source <source-document-id>"),
    );
  if (!isRecordId(sourceId, "source_document")) {
    return Promise.resolve(
      operationFailure(
        "source metadata",
        "source.metadata",
        argv,
        `Invalid Source Document metadata target "${sourceId}".`,
        "Pass a Source Document record ID such as source_document:example.",
      ),
    );
  }
  const metadata = sourceMetadataFromArgv(argv);
  if (!metadata.ok) return Promise.resolve(metadata.failure);
  if (metadata.setClause.length === 0) {
    return queryCommand(
      "source metadata",
      "source.metadata",
      argv,
      `SELECT id, title, corpus, publisher, document_class, industries, product_families, version, publication_date, source_uri, trust_status, frame, frame_metadata FROM ${sourceId};`,
      `Read Source Document metadata for ${sourceId}.`,
      { id: sourceId },
      { kind: "read", targetRecords: [sourceId] },
    );
  }
  return queryCommand(
    "source metadata",
    "source.metadata",
    argv,
    `UPDATE ${sourceId} SET ${metadata.setClause.slice(2)}, updated_at = time::now(); SELECT id, title, corpus, publisher, document_class, industries, product_families, version, publication_date, source_uri, trust_status, frame, frame_metadata FROM ${sourceId};`,
    `Updated Source Document metadata for ${sourceId}.`,
    { id: sourceId, metadata: metadata.data },
    {
      kind: "write",
      targetRecords: [sourceId],
      beforeQuery: `SELECT * FROM ${sourceId}`,
      afterQuery: `SELECT * FROM ${sourceId}`,
      relateEditedTargets: [sourceId],
    },
  );
}

function deprecatedSourceAnchorCommand(argv: readonly string[]): CliFailure {
  return operationFailure(
    "source anchor",
    "source.anchor",
    argv,
    "Source Anchor records are no longer part of the Graph Wiki command model.",
    "Put location precision directly on Citation locator fields with 'originium citation add --source <source-document-id> --pages <range> --quote <text>' or 'originium source locate'.",
  );
}

function readSourceText(argv: readonly string[]): CliResult {
  const path = argv[2];
  if (!path) return missingArgument("source read", "source.read", argv, "<pdf-path>");
  const sourceId = valueAfter(argv, "--source") ?? defaultSourceDocumentId(path);

  try {
    if (valueAfter(argv, "--heading") || valueAfter(argv, "--anchor")) {
      return operationFailure(
        "source read",
        "source.read",
        argv,
        "Source Outline and Source Anchor selectors are no longer supported by source read.",
        "Pass a document-local locator such as --pages 12-14, or run source locate first.",
      );
    }
    const outline = extractPdfOutline(path, sourceId);
    const pageRange = parsePageRangeArgument(argv);
    if (!pageRange) {
      return missingArgument("source read", "source.read", argv, "--pages <start-end>");
    }
    if ("ok" in pageRange) return pageRange;

    const projection = projectPdfText(path, {
      sourceDocumentId: sourceId,
      pageRange,
      maxTokens: Number.parseInt(valueAfter(argv, "--max-tokens") ?? "4000", 10),
    });
    const nearestOutline = nearestOutlineForPage(outline, projection.pageRange.start);

    return success({
      command: "source read",
      operation: "source.read",
      input: argv,
      message: `Read lossy Source Text projection for ${sourceId} pages ${projection.pageRange.start}-${projection.pageRange.end}.`,
      data: {
        ...projection,
        sourceDocument: sourceId,
        nearestOutline: nearestOutline ? cliSourceOutlineEntry(nearestOutline, sourceId) : undefined,
      },
    });
  } catch (error) {
    return operationFailure(
      "source read",
      "source.read",
      argv,
      errorReason(error),
      "Verify the PDF path and page range.",
    );
  }
}

function searchSourceText(argv: readonly string[], command: "search" | "find"): CliResult {
  const path = argv[2];
  const query = argv[3] ?? valueAfter(argv, "--query");
  if (!path) return missingArgument(`source ${command}`, `source.${command}`, argv, "<pdf-path>");
  if (!query) return missingArgument(`source ${command}`, `source.${command}`, argv, "<query>");
  const sourceId = valueAfter(argv, "--source") ?? defaultSourceDocumentId(path);

  try {
    const pageRange = parsePageRangeArgument(argv);
    if (pageRange && "ok" in pageRange) return pageRange;
    const outline = extractPdfOutline(path, sourceId);
    const hits = searchPdfText(path, outline, query, {
      sourceDocumentId: sourceId,
      pageRange,
      limit: Number.parseInt(valueAfter(argv, "--limit") ?? "10", 10),
    }).map((hit) => ({
      sourceDocument: hit.sourceDocumentId,
      pageRange: hit.pageRange,
      snippet: hit.snippet,
      nearestOutline: hit.nearestOutline ? cliSourceOutlineEntry(hit.nearestOutline, sourceId) : undefined,
      provenance: hit.provenance,
      warning: hit.warning,
    }));

    return success({
      command: `source ${command}`,
      operation: `source.${command}`,
      input: argv,
      message: `Found ${hits.length} lossy Source Text projection match(es) for '${query}' in ${sourceId}.`,
      data: { sourceDocument: sourceId, query, hits },
    });
  } catch (error) {
    return operationFailure(
      `source ${command}`,
      `source.${command}`,
      argv,
      errorReason(error),
      "Verify the PDF path and query, or narrow the search with --pages <start-end>.",
    );
  }
}

async function routePage(argv: readonly string[]): Promise<CliResult> {
  const [, command] = argv;
  if (!command)
    return missingGroupCommand("page", argv, "Use one of: create, read, update, replace, patch, append, search.");
  if (command === "create" || command === "update") return writePage(argv, command);
  if (command === "replace" || command === "patch" || command === "append") return editPage(argv, command);
  if (command === "read") return selectById("page read", "page.read", argv, argv[2], "Wiki Page ID");
  if (command === "search") return searchPages(argv);
  if (command === "candidates") return pageCandidates(argv);
  return unknownCommand(
    "page",
    command,
    argv,
    "Use one of: create, read, update, replace, patch, append, search, candidates.",
  );
}

async function routeCitation(argv: readonly string[]): Promise<CliResult> {
  const [group, rawCommand] = argv;
  const command = group === "cite" && rawCommand === "create" ? "add" : rawCommand;
  const commandPrefix = group === "cite" ? "cite" : "citation";
  if (!command)
    return missingGroupCommand(commandPrefix, argv, "Use one of: add/create, list, validate, narrow, repair.");

  const config = readSurrealConfig();
  if (command === "add" || command === "create") {
    const pageId = valueAfter(argv, "--page");
    const sourceId = valueAfter(argv, "--source") ?? valueAfter(argv, "--document");
    const key = valueAfter(argv, "--key");
    const label = valueAfter(argv, "--label") ?? key;
    const claim = valueAfter(argv, "--claim") ?? "";
    const quote = valueAfter(argv, "--quote");
    const context = valueAfter(argv, "--context");
    const pageRange = citationPageRangeFromArgv(argv);
    if (pageRange instanceof Error) {
      return operationFailure(
        commandPrefix,
        `${commandPrefix}.${command}`,
        argv,
        pageRange.message,
        "Pass a page range such as --pages 12-14.",
      );
    }
    if (valueAfter(argv, "--heading")) {
      return operationFailure(
        commandPrefix,
        `${commandPrefix}.${command}`,
        argv,
        "Source Outline IDs are no longer valid Citation targets.",
        "Pass --source <source-document-id> and locator fields such as --pages, --quote, --context, and --claim.",
      );
    }
    if (!pageId) return missingArgument(commandPrefix, `${commandPrefix}.${command}`, argv, "--page <wiki-page-id>");
    if (!sourceId)
      return missingArgument(commandPrefix, `${commandPrefix}.${command}`, argv, "--source <source-document-id>");
    if (!key) return missingArgument(commandPrefix, `${commandPrefix}.${command}`, argv, "--key <citation-key>");
    const targetFailure = validateCitationSourceDocumentTarget({
      command: commandPrefix,
      operation: `${commandPrefix}.${command}`,
      argv,
      pageId,
      key,
      sourceId,
    });
    if (targetFailure) return targetFailure;

    const citationDraft = citationDraftFromInput({
      pageId,
      sourceId,
      key,
      label: label ?? key,
      claim,
      quote,
      context,
      pageRange,
      locationHint: valueAfter(argv, "--location") ?? valueAfter(argv, "--location-hint"),
      projectionId: valueAfter(argv, "--projection") ?? valueAfter(argv, "--projection-id"),
      textHash: valueAfter(argv, "--text-hash"),
      confidence: optionalFloatAfter(argv, "--confidence") ?? 1,
    });
    const locatorIssues = validateCitationLocator(citationDraft);
    if (locatorIssues.length > 0) {
      return operationFailure(
        commandPrefix,
        `${commandPrefix}.${command}`,
        argv,
        `Citation locator validation failed for ${pageId}/${key}: ${locatorIssues.join(" ")}`,
        "Revise --pages, --quote/--context, and --confidence before creating the Citation.",
        { issues: locatorIssues, draft: citationDraft },
      );
    }

    const relationTarget = `${pageId}->cites->${sourceId}:${key}`;
    const relationQuery = `SELECT * FROM cites WHERE in = ${pageId} AND key = "${escapeSurrealString(key)}"`;
    const query = [
      `DELETE cites WHERE in = ${pageId} AND key = "${escapeSurrealString(key)}";`,
      `RELATE ${pageId}->cites->${sourceId} SET ${citationSetClause(citationDraft)};`,
      relationQuery,
    ].join("\n");
    const result = await executeSurrealQuery(
      config,
      loggedQuery(`${commandPrefix} ${rawCommand}`, `${commandPrefix}.${rawCommand}`, argv, query, {
        kind: "write",
        targetRecords: [relationTarget, pageId, sourceId],
        beforeQuery: relationQuery,
        afterQuery: relationQuery,
        relateEditedTargets: [pageId],
      }),
      { queryId: `${commandPrefix}.${rawCommand}:${pageId}:${key}` },
    );
    if (!result.ok) return fromSurrealFailure(`${commandPrefix} ${rawCommand}`, argv, result.error);
    return success({
      command: `${commandPrefix} ${rawCommand}`,
      operation: `${commandPrefix}.${rawCommand}`,
      input: argv,
      message: `Added Citation ${key} from ${pageId} to ${sourceId}.`,
      data: { draft: citationDraft, result: result.result },
    });
  }

  if (command === "list") {
    const pageId = argv[2] ?? valueAfter(argv, "--page");
    if (!pageId) return missingArgument("citation list", "citation.list", argv, "<wiki-page-id>");
    return queryCommand(
      "citation list",
      "citation.list",
      argv,
      `SELECT *, out.* AS source_document FROM cites WHERE in = ${pageId};`,
      `Listed Citations for ${pageId}.`,
      {},
      { kind: "read", targetRecords: [pageId] },
    );
  }

  if (command === "validate") {
    const pageId = argv[2] ?? valueAfter(argv, "--page");
    if (!pageId) return missingArgument("citation validate", "citation.validate", argv, "<wiki-page-id>");
    const pageResult = await executeSurrealQuery(
      config,
      loggedQuery(
        "citation validate",
        "citation.validate",
        argv,
        [
          `SELECT body FROM ${pageId};`,
          `SELECT id, in, out, key, label, claim, locator_kind, page_range, location_hint, quote, context, projection_id, text_hash, validation_status, confidence FROM cites WHERE in = ${pageId} FETCH out;`,
          `SELECT id, source_document, start_page, end_page, text_hash, projection_status, string::slice(text, 0, 1200) AS text FROM source_text_projection WHERE source_document IN (SELECT VALUE out FROM cites WHERE in = ${pageId});`,
        ].join("\n"),
        { kind: "read", targetRecords: [pageId] },
      ),
      {
        queryId: `citation.validate:${pageId}`,
      },
    );
    if (!pageResult.ok) return fromSurrealFailure("citation validate", argv, pageResult.error);
    const statements = pageResult.result as Array<{ result?: unknown }>;
    const body = pageBodyFromStatements(statements);
    const keys = citationKeysFromStatements(statements);
    const markerValidation = validatePageBodyCitationMarkers({
      wikiPageId: pageId,
      pageBody: body,
      graphCitationKeys: keys,
    });
    const citationRows = rowsAtStatement(statements, 1);
    const projectionRows = rowsAtStatement(statements, 2);
    const locatorIssues = citationRows.flatMap((citation) => validateCitationRow(citation, projectionRows));
    const issueCount = markerValidation.issues.length + locatorIssues.length;
    return success({
      command: "citation validate",
      operation: "citation.validate",
      input: argv,
      message:
        issueCount === 0
          ? `Citation Markers match graph Citations for ${pageId}.`
          : `Citation validation found ${issueCount} issue(s) for ${pageId}.`,
      data: {
        wikiPageId: pageId,
        markerValidation,
        locatorValidation: {
          issueCount: locatorIssues.length,
          issues: locatorIssues,
        },
        citations: citationRows,
      },
    });
  }

  if (command === "narrow") {
    const pageId = valueAfter(argv, "--page");
    const key = valueAfter(argv, "--key");
    if (!pageId) return missingArgument("citation narrow", "citation.narrow", argv, "--page <wiki-page-id>");
    if (!key) return missingArgument("citation narrow", "citation.narrow", argv, "--key <citation-key>");
    const pageRange = citationPageRangeFromArgv(argv);
    if (pageRange instanceof Error) {
      return operationFailure(
        "citation narrow",
        "citation.narrow",
        argv,
        pageRange.message,
        "Pass a page range such as --pages 12-14.",
      );
    }
    const quote = valueAfter(argv, "--quote");
    const context = valueAfter(argv, "--context");
    if (!pageRange && !quote && !context && !valueAfter(argv, "--location") && !valueAfter(argv, "--projection")) {
      return missingArgument(
        "citation narrow",
        "citation.narrow",
        argv,
        "--pages, --quote, --context, --location, or --projection",
      );
    }
    const updates = citationLocatorUpdateClauses({
      pageRange,
      quote,
      context,
      locationHint: valueAfter(argv, "--location") ?? valueAfter(argv, "--location-hint"),
      projectionId: valueAfter(argv, "--projection") ?? valueAfter(argv, "--projection-id"),
      textHash: valueAfter(argv, "--text-hash"),
      confidence: optionalFloatAfter(argv, "--confidence"),
    });
    return queryCommand(
      "citation narrow",
      "citation.narrow",
      argv,
      [
        `LET $originium_before_citation = (SELECT * FROM cites WHERE in = ${pageId} AND key = "${escapeSurrealString(key)}")[0];`,
        `UPDATE cites SET ${updates.join(", ")} WHERE in = ${pageId} AND key = "${escapeSurrealString(key)}";`,
        `SELECT before = $originium_before_citation, after = (SELECT * FROM cites WHERE in = ${pageId} AND key = "${escapeSurrealString(key)}")[0];`,
      ].join("\n"),
      `Narrowed Citation ${key} on ${pageId}.`,
      { pageId, key, updates },
      {
        kind: "write",
        targetRecords: [pageId, `cites:${key}`],
        beforeQuery: `SELECT * FROM cites WHERE in = ${pageId} AND key = "${escapeSurrealString(key)}"`,
        afterQuery: `SELECT * FROM cites WHERE in = ${pageId} AND key = "${escapeSurrealString(key)}"`,
        relateEditedTargets: [pageId],
      },
    );
  }

  if (command === "repair") {
    const pageId = valueAfter(argv, "--page");
    const key = valueAfter(argv, "--key");
    const sourceId = valueAfter(argv, "--source") ?? valueAfter(argv, "--document");
    const unsupported = argv.includes("--unsupported");
    if (!pageId) return missingArgument("citation repair", "citation.repair", argv, "--page <wiki-page-id>");
    if (!key) return missingArgument("citation repair", "citation.repair", argv, "--key <citation-key>");
    if (!sourceId && !unsupported) {
      return missingArgument(
        "citation repair",
        "citation.repair",
        argv,
        "--source <source-document-id> or --unsupported",
      );
    }
    if (sourceId) {
      const targetFailure = validateCitationSourceDocumentTarget({
        command: "citation repair",
        operation: "citation.repair",
        argv,
        pageId,
        key,
        sourceId,
      });
      if (targetFailure) return targetFailure;
    }
    if (unsupported) {
      return queryCommand(
        "citation repair",
        "citation.repair",
        argv,
        [
          `LET $originium_before_citation = (SELECT * FROM cites WHERE in = ${pageId} AND key = "${escapeSurrealString(key)}")[0];`,
          `UPDATE cites SET validation_status = "invalid", confidence = 0, location_hint = "unsupported claim" WHERE in = ${pageId} AND key = "${escapeSurrealString(key)}";`,
          `SELECT before = $originium_before_citation, after = (SELECT * FROM cites WHERE in = ${pageId} AND key = "${escapeSurrealString(key)}")[0];`,
        ].join("\n"),
        `Marked Citation ${key} on ${pageId} as unsupported.`,
        { pageId, key, unsupported: true },
        {
          kind: "write",
          targetRecords: [pageId, `cites:${key}`],
          beforeQuery: `SELECT * FROM cites WHERE in = ${pageId} AND key = "${escapeSurrealString(key)}"`,
          afterQuery: `SELECT * FROM cites WHERE in = ${pageId} AND key = "${escapeSurrealString(key)}"`,
          relateEditedTargets: [pageId],
        },
      );
    }
    return routeCitation([
      "citation",
      "add",
      "--page",
      pageId,
      "--source",
      sourceId ?? "",
      "--key",
      key,
      ...argv.slice(2),
    ]);
  }

  return unknownCommand(commandPrefix, command, argv, "Use one of: add/create, list, validate, narrow, repair.");
}

async function routeLink(argv: readonly string[]): Promise<CliResult> {
  const [, command] = argv;
  if (!command) return missingGroupCommand("link", argv, "Use one of: add, list.");

  if (command === "add") {
    const from = valueAfter(argv, "--from");
    const to = valueAfter(argv, "--to");
    const reason = valueAfter(argv, "--reason");
    const label = valueAfter(argv, "--label") ?? "related evidence";
    if (!from) return missingArgument("link add", "link.add", argv, "--from <record-id>");
    if (!to) return missingArgument("link add", "link.add", argv, "--to <record-id>");
    if (!reason) return missingArgument("link add", "link.add", argv, "--reason <reason>");
    return Promise.resolve(
      operationFailure(
        "link add",
        "link.add",
        argv,
        `Manual Link writes are disabled for '${from}' -> '${to}' with label '${label}'. Generic Manual Links are deprecated for the frame workflow MVP.`,
        "Use an inline Wiki Page Reference such as [[Page Title]] for page-to-page navigation, use a Citation to a Source Document for evidence, or file a Domain Relation design follow-up for governed semantic edges.",
        { from, to, label, reason },
      ),
    );
  }

  if (command === "list") {
    const record = valueAfter(argv, "--record") ?? argv[2];
    const where = record ? `WHERE in = ${record} OR out = ${record}` : "";
    return queryCommand(
      "link list",
      "link.list",
      argv,
      `SELECT * FROM manual_link ${where};`,
      "Listed Manual Links.",
      {},
      {
        kind: "read",
        targetRecords: record ? [record] : ["manual_link"],
      },
    );
  }

  return unknownCommand("link", command, argv, "Use one of: add, list.");
}

async function routeSession(argv: readonly string[]): Promise<CliResult> {
  const [, command] = argv;
  if (!command) return missingGroupCommand("session", argv, "Use one of: start, show, current, end.");
  if (command === "start") {
    const purpose = (valueAfter(argv, "--purpose") ?? argv.slice(2).join(" ")) || "Graph Wiki CLI session";
    const id = `agent_session:${randomUUID().replaceAll("-", "")}`;
    const result = await queryCommand(
      "session start",
      "session.start",
      argv,
      `CREATE ${id} SET purpose = "${escapeSurrealString(purpose)}", created_at = time::now();`,
      `Started Agent Session ${id}.`,
      { id, purpose },
      {
        kind: "write",
        targetRecords: [id],
        afterQuery: `SELECT * FROM ${id}`,
        sessionId: id,
      },
    );
    if (result.ok) writeCurrentSession(id);
    return result;
  }
  if (command === "show") return selectById("session show", "session.show", argv, argv[2], "Agent Session ID");
  if (command === "current") {
    const sessionId = resolveSessionId(argv, { createImplicit: false });
    return success({
      command: "session current",
      operation: "session.current",
      input: argv,
      message: sessionId ? `Current Agent Session: ${sessionId}.` : "No current Agent Session is set.",
      data: {
        id: sessionId,
        source: sessionSource(argv),
        currentSessionFile: currentSessionFile(),
      },
    });
  }
  if (command === "end" || command === "clear") {
    const prior = readCurrentSession();
    clearCurrentSession();
    return success({
      command: `session ${command}`,
      operation: "session.end",
      input: argv,
      message: prior ? `Cleared current Agent Session ${prior}.` : "No current Agent Session was set.",
      data: { cleared: prior, currentSessionFile: currentSessionFile() },
    });
  }
  return unknownCommand("session", command, argv, "Use one of: start, show, current, end.");
}

async function routeLog(argv: readonly string[]): Promise<CliResult> {
  const [, command] = argv;
  if (!command) return missingGroupCommand("log", argv, "Use one of: show.");
  if (command === "show") {
    const session = valueAfter(argv, "--session");
    const where = session ? `WHERE agent_session = ${session}` : "";
    return queryCommand(
      "log show",
      "log.show",
      argv,
      `SELECT * FROM change_log ${where} ORDER BY created_at ASC;`,
      "Listed Change Log entries.",
    );
  }
  return unknownCommand("log", command, argv, "Use one of: show.");
}

async function routeActivity(argv: readonly string[]): Promise<CliResult> {
  const [, command] = argv;
  if (!command) return missingGroupCommand("activity", argv, "Use one of: record, list, show.");

  if (command === "record") {
    const draft = agentActivityDraftFromArgv(argv);
    if ("ok" in draft) return draft;

    const result = await executeSurrealQuery(readSurrealConfig(), buildAgentActivityRecordQuery(draft), {
      queryId: `activity.record:${draft.sessionId}:${draft.kind}`,
    });
    if (!result.ok) return fromSurrealFailure("activity record", argv, result.error);

    return success({
      command: "activity record",
      operation: "activity.record",
      input: argv,
      message: `Recorded Agent Activity ${draft.id}.`,
      data: {
        id: draft.id,
        sessionId: draft.sessionId,
        source: draft.source,
        kind: draft.kind,
        status: draft.status,
        result: result.result,
      },
    });
  }

  if (command === "list") {
    const sessionId = valueAfter(argv, "--session") ?? resolveSessionId(argv, { createImplicit: false });
    const query = buildAgentActivityListQuery(sessionId);
    return queryCommand(
      "activity list",
      "activity.list",
      argv,
      query,
      sessionId ? `Listed Agent Activity records for ${sessionId}.` : "Listed Agent Activity records.",
      { sessionId },
      {
        kind: "read",
        targetRecords: sessionId ? [sessionId] : ["agent_activity"],
      },
    );
  }

  if (command === "show") {
    return selectById("activity show", "activity.show", argv, argv[2], "Agent Activity ID");
  }

  return unknownCommand("activity", command, argv, "Use one of: record, list, show.");
}

async function routeGraph(argv: readonly string[]): Promise<CliResult> {
  const [, command] = argv;
  if (!command) return missingGroupCommand("graph", argv, "Use one of: lint, neighborhood.");
  if (command === "neighborhood") return graphNeighborhood(argv);
  if (command !== "lint") return unknownCommand("graph", command, argv, "Use one of: lint, neighborhood.");
  const family = valueAfter(argv, "--family");
  const supportedFamilies = ["citation", "source", "page", "page-reference", "link"] as const;
  if (family && !supportedFamilies.includes(family as (typeof supportedFamilies)[number])) {
    return operationFailure(
      "graph lint",
      "graph.lint",
      argv,
      `Unsupported graph lint family '${family}'.`,
      "Use --family citation, --family source, --family page, --family page-reference, or --family link; omit --family for the umbrella lint.",
    );
  }

  const result = await executeSurrealQuery(
    readSurrealConfig(),
    loggedQuery(
      "graph lint",
      "graph.lint",
      argv,
      [
        "SELECT id, title, slug, aliases, body FROM wiki_page;",
        "SELECT id, in, out, key, label, claim, locator_kind, page_range, location_hint, quote, context, projection_id, text_hash, validation_status, confidence FROM cites;",
        "SELECT id, source_document, start_page, end_page, text_hash, extraction_method, extraction_version, projection_version, projection_status FROM source_text_projection;",
        "SELECT id, in, out, reason, label FROM manual_link;",
      ].join("\n"),
      { kind: "read", targetRecords: ["wiki_page", "cites", "source_text_projection", "manual_link"] },
    ),
    { queryId: "graph.lint" },
  );
  if (!result.ok) return fromSurrealFailure("graph lint", argv, result.error);

  const lint = lintGraphWikiStatements(result.result as Array<{ result?: unknown }>, family);
  return success({
    command: "graph lint",
    operation: "graph.lint",
    input: argv,
    message:
      lint.issueCount === 0
        ? `Graph Wiki${family ? ` ${family}` : ""} lint found no hygiene issues.`
        : `Graph Wiki${family ? ` ${family}` : ""} lint found ${lint.issueCount} hygiene issue(s).`,
    data: lint,
  });
}

async function graphNeighborhood(argv: readonly string[]): Promise<CliResult> {
  const recordId = argv[2] ?? valueAfter(argv, "--record");
  if (!recordId) return missingArgument("graph neighborhood", "graph.neighborhood", argv, "<record-id>");

  const query = [
    `LET $record = ${recordId};`,
    `SELECT id, title, slug, aliases, scope_note, page_kind, frame, frame_metadata, ->cites AS outgoing_citations, <-cites AS incoming_citations, ->manual_link AS outgoing_links, <-manual_link AS incoming_links FROM ONLY $record;`,
    `SELECT id, in, out, key, label, quote FROM cites WHERE in = $record OR out = $record;`,
    `SELECT id, in, out, label, reason FROM manual_link WHERE in = $record OR out = $record;`,
    `SELECT id, title, slug FROM wiki_page WHERE ->cites->source_document CONTAINS $record OR <-cites<-wiki_page CONTAINS $record LIMIT 20;`,
  ].join("\n");
  return queryCommand(
    "graph neighborhood",
    "graph.neighborhood",
    argv,
    query,
    `Inspected graph neighborhood for ${recordId}.`,
    { id: recordId },
    { kind: "read", targetRecords: [recordId] },
  );
}

async function routeRetrieval(argv: readonly string[]): Promise<CliResult> {
  const [, command] = argv;
  if (!command) return missingGroupCommand("retrieval", argv, "Use one of: search, embed.");
  if (command === "search") return searchPages(argv);
  if (command === "embed") return embedRetrievalRecords(argv);
  return unknownCommand("retrieval", command, argv, "Use one of: search, embed.");
}

async function routeRefactor(argv: readonly string[]): Promise<CliResult> {
  const [, command] = argv;
  if (!command) return missingGroupCommand("refactor", argv, "Use one of: rename-page.");
  if (command !== "rename-page") return unknownCommand("refactor", command, argv, "Use one of: rename-page.");

  const pageId = valueAfter(argv, "--page") ?? argv[2];
  const title = valueAfter(argv, "--title");
  const dryRun = argv.includes("--dry-run") || !argv.includes("--apply");
  if (!pageId) return missingArgument("refactor rename-page", "refactor.rename-page", argv, "--page <wiki-page-id>");
  if (!title) return missingArgument("refactor rename-page", "refactor.rename-page", argv, "--title <new-title>");
  if (!isRecordId(pageId, "wiki_page")) {
    return operationFailure(
      "refactor rename-page",
      "refactor.rename-page",
      argv,
      `Invalid Wiki Page ID '${pageId}'.`,
      "Pass a Wiki Page record ID such as wiki_page:example.",
    );
  }

  const slug = wikiPageSlugFromTitle(title);
  const query = dryRun
    ? [
        `SELECT id, title, slug, aliases, body, ->cites AS citations FROM ${pageId};`,
        `SELECT id, title, slug FROM wiki_page WHERE slug = "${escapeSurrealString(slug)}" AND id != ${pageId};`,
      ].join("\n")
    : [
        `LET $originium_before_page = (SELECT * FROM ${pageId})[0];`,
        `UPDATE ${pageId} SET aliases = array::distinct(array::concat(aliases ?? [], [$originium_before_page.title])), title = "${escapeSurrealString(title)}", slug = "${slug}", updated_at = time::now();`,
        `SELECT before = $originium_before_page, after = (SELECT * FROM ${pageId})[0], citations = (SELECT * FROM cites WHERE in = ${pageId});`,
      ].join("\n");
  const result = await executeSurrealQuery(
    readSurrealConfig(),
    loggedQuery("refactor rename-page", "refactor.rename-page", argv, query, {
      kind: dryRun ? "read" : "write",
      targetRecords: [pageId],
      beforeQuery: dryRun ? undefined : `SELECT * FROM ${pageId}`,
      afterQuery: dryRun ? undefined : `SELECT * FROM ${pageId}`,
      relateEditedTargets: [pageId],
    }),
    { queryId: `refactor.rename-page:${pageId}` },
  );
  if (!result.ok) return fromSurrealFailure("refactor rename-page", argv, result.error);
  return success({
    command: "refactor rename-page",
    operation: "refactor.rename-page",
    input: argv,
    message: dryRun
      ? `Prepared dry-run rename of ${pageId} to '${title}'.`
      : `Renamed ${pageId} to '${title}' while preserving Citation relations.`,
    data: {
      pageId,
      newTitle: title,
      newSlug: slug,
      mode: dryRun ? "dry-run" : "apply",
      citationSafety:
        "The workflow keeps the same Wiki Page record ID, so existing Citation edges and body markers remain attached.",
      focusedLint: dryRun
        ? undefined
        : "Run graph lint --family page and graph lint --family citation for post-refactor verification.",
      result: result.result,
    },
  });
}

async function routeWorkflow(argv: readonly string[]): Promise<CliResult> {
  const [, command] = argv;
  if (!command) return missingGroupCommand("workflow", argv, "Use one of: answer-context, page-upsert.");

  if (command === "answer-context") {
    const query = positionalArgs(argv, 2).join(" ").trim();
    if (!query) return missingArgument("workflow answer-context", "workflow.answer-context", argv, "<query>");
    const limit = Number.parseInt(valueAfter(argv, "--limit") ?? "5", 10);
    const escaped = escapeSurrealString(query);
    const answerQuery = [
      `LET $pages = (SELECT id, title, slug, body, updated_at FROM wiki_page WHERE title CONTAINS "${escaped}" OR body CONTAINS "${escaped}" ORDER BY updated_at DESC LIMIT ${limit});`,
      "SELECT * FROM $pages;",
      "SELECT id, in, out, key, label, claim, locator_kind, page_range, location_hint, quote, context, projection_id, text_hash, validation_status, confidence FROM cites WHERE in IN (SELECT VALUE id FROM $pages) FETCH out;",
      `SELECT id, source_document, start_page, end_page, text_hash, projection_status, string::slice(text, 0, 700) AS snippet FROM source_text_projection WHERE text CONTAINS "${escaped}" ORDER BY start_page ASC LIMIT ${limit};`,
    ].join("\n");
    const result = await executeSurrealQuery(
      readSurrealConfig(),
      loggedQuery("workflow answer-context", "workflow.answer-context", argv, answerQuery, {
        kind: "read",
        targetRecords: ["wiki_page", "cites", "source_text_projection"],
      }),
      { queryId: `workflow.answer-context:${query}` },
    );
    if (!result.ok) return fromSurrealFailure("workflow answer-context", argv, result.error);
    const statements = result.result as Array<{ result?: unknown }>;
    const pages = rowsAtStatement(statements, 1);
    const citations = rowsAtStatement(statements, 2);
    const snippets = rowsAtStatement(statements, 3);
    const gaps = [
      pages.length === 0 ? "No maintained Wiki Page synthesis matched the query." : "",
      citations.length === 0 ? "No graph Citations were found for the matched Wiki Pages." : "",
      snippets.length === 0 ? "No raw Source Text Projection snippet matched the query." : "",
    ].filter(Boolean);
    return success({
      command: "workflow answer-context",
      operation: "workflow.answer-context",
      input: argv,
      message: `Prepared answer context for '${query}'.`,
      data: {
        query,
        maintainedSynthesis: pages,
        citationEvidence: citations,
        rawSourceEvidence: snippets,
        warnings: [
          "Maintained synthesis is preferred for answers; raw Source Text Projections are lossy and need Source Document verification.",
        ],
        gaps,
        trace: argv.includes("--trace") ? { query: answerQuery, result: result.result } : undefined,
      },
    });
  }

  if (command === "page-upsert") {
    const title = valueAfter(argv, "--title");
    const body = valueAfter(argv, "--body") ?? "";
    const source = valueAfter(argv, "--source") ?? valueAfter(argv, "--document");
    const key = valueAfter(argv, "--key") ?? "source";
    const label = valueAfter(argv, "--label") ?? key;
    if (!title) return missingArgument("workflow page-upsert", "workflow.page-upsert", argv, "--title <title>");
    if (valueAfter(argv, "--heading")) {
      return operationFailure(
        "workflow page-upsert",
        "workflow.page-upsert",
        argv,
        "Source Outline IDs are no longer accepted by workflow page-upsert.",
        "Pass --source <source-document-id> and locator flags such as --pages, --quote, and --claim.",
      );
    }
    if (!source)
      return missingArgument("workflow page-upsert", "workflow.page-upsert", argv, "--source <source-document-id>");
    const page = await writePage(
      ["page", "update", "--title", title, "--body", body, ...sessionArgsForChild(argv)],
      "update",
    );
    if (!page.ok) return page;
    const pageId = (page.data as { id?: string }).id;
    if (!pageId) {
      return operationFailure(
        "workflow page-upsert",
        "workflow.page-upsert",
        argv,
        `Page upsert for title '${title}' did not return a Wiki Page ID.`,
        "Run page update directly and inspect the result.",
      );
    }
    const citation = await routeCitation([
      "citation",
      "add",
      "--page",
      pageId,
      "--source",
      source,
      "--key",
      key,
      "--label",
      label,
      ...locatorArgsForChild(argv),
      ...sessionArgsForChild(argv),
    ]);
    if (!citation.ok) return citation;
    return success({
      command: "workflow page-upsert",
      operation: "workflow.page-upsert",
      input: argv,
      message: `Upserted Wiki Page ${pageId} and Citation ${key}.`,
      data: { page: page.data, citation: citation.data },
    });
  }

  return unknownCommand("workflow", command, argv, "Use one of: answer-context, page-upsert.");
}

async function routeIngest(argv: readonly string[]): Promise<CliResult> {
  const [, command] = argv;
  if (!command) return missingGroupCommand("ingest", argv, "Use one of: chapter.");
  if (command !== "chapter") return unknownCommand("ingest", command, argv, "Use one of: chapter.");
  const source = valueAfter(argv, "--source");
  if (!source) return missingArgument("ingest chapter", "ingest.chapter", argv, "--source <source-document-id>");
  if (valueAfter(argv, "--heading")) {
    return operationFailure(
      "ingest chapter",
      "ingest.chapter",
      argv,
      "Source Outline IDs are no longer accepted by ingest chapter.",
      "Pass a bounded document-local locator such as --pages 12-14.",
    );
  }
  const pageRange = parsePageRangeArgument(argv);
  if (!pageRange) return missingArgument("ingest chapter", "ingest.chapter", argv, "--pages <start-end>");
  if ("ok" in pageRange) return pageRange;
  const maxTokens = Number.parseInt(valueAfter(argv, "--max-tokens") ?? "100000", 10);
  const chunkId = `ingestion_chunk:${source.replace(/^source_document:/, "")}_p${pageRange.start}_${pageRange.end}_${maxTokens}`;
  const title = valueAfter(argv, "--title");
  const citationKey = valueAfter(argv, "--key") ?? "source";
  const body =
    valueAfter(argv, "--body") ?? (title ? `${title} synthesis from Chapter Ingestion.[^${citationKey}]` : undefined);
  const pageId = title ? wikiPageRecordId(title) : undefined;
  const pageSlug = title ? wikiPageSlugFromTitle(title) : undefined;
  const label = valueAfter(argv, "--label") ?? citationKey;
  const quote = valueAfter(argv, "--quote");
  const linkTo = valueAfter(argv, "--link-to");
  const linkReason = valueAfter(argv, "--link-reason");
  const session = valueAfter(argv, "--session");
  const validation =
    pageId && body
      ? validatePageBodyCitationMarkers({ wikiPageId: pageId, pageBody: body, graphCitationKeys: [citationKey] })
      : undefined;
  if (validation && validation.issues.length > 0) {
    return operationFailure(
      "ingest chapter",
      "ingest.chapter",
      argv,
      `Chapter Ingestion citation validation failed for ${pageId}: ${validation.issues.map((issue) => issue.message).join(" ")}`,
      "Use a Page Body with a Citation Marker matching --key, or change --key to match the Page Body.",
    );
  }

  const pageStatements =
    title && body && pageId && pageSlug
      ? [
          `UPSERT ${pageId} SET title = "${escapeSurrealString(title)}", slug = "${pageSlug}", body = "${escapeSurrealString(body)}", updated_at = time::now();`,
          `DELETE cites WHERE in = ${pageId} AND key = "${escapeSurrealString(citationKey)}";`,
          `RELATE ${pageId}->cites->${source} SET ${citationSetClause(
            citationDraftFromInput({
              pageId,
              sourceId: source,
              key: citationKey,
              label,
              claim: valueAfter(argv, "--claim") ?? label,
              quote,
              context: valueAfter(argv, "--context"),
              pageRange: { startPage: pageRange.start, endPage: pageRange.end },
              locationHint: valueAfter(argv, "--location") ?? valueAfter(argv, "--location-hint"),
              confidence: optionalFloatAfter(argv, "--confidence") ?? 1,
            }),
          )};`,
          ...(linkTo && linkReason
            ? [
                `RELATE ${pageId}->manual_link->${linkTo} SET reason = "${escapeSurrealString(linkReason)}", label = NONE, created_session = ${session ?? "NONE"}, created_at = time::now();`,
              ]
            : []),
        ]
      : [];
  const query = [
    `UPSERT ${chunkId} SET source_document = ${source}, start_page = ${pageRange.start}, end_page = ${pageRange.end}, token_estimate = ${maxTokens}, extraction_method = "chapter-ingestion", created_at = time::now();`,
    ...pageStatements,
    `SELECT * FROM ${source};`,
    `SELECT * FROM ${chunkId};`,
    `SELECT id, title, slug, body, updated_at, ->cites->source_document AS cited_evidence FROM wiki_page ORDER BY updated_at DESC LIMIT 10;`,
  ].join("\n");
  const result = await executeSurrealQuery(
    readSurrealConfig(),
    loggedQuery("ingest chapter", "ingest.chapter", argv, query, {
      kind: "write",
      targetRecords: [source, chunkId, ...(pageId ? [pageId] : [])],
      beforeQuery: `SELECT * FROM ${chunkId}`,
      afterQuery: `SELECT * FROM ${chunkId}`,
      sessionId: session,
      relateEditedTargets: [chunkId, ...(pageId ? [pageId] : [])],
    }),
    { queryId: `ingest.chapter:${source}:${pageRange.start}-${pageRange.end}` },
  );
  if (!result.ok) return fromSurrealFailure("ingest chapter", argv, result.error);
  return success({
    command: "ingest chapter",
    operation: "ingest.chapter",
    input: argv,
    message: pageId
      ? `Prepared bounded ingestion context for ${source} pages ${pageRange.start}-${pageRange.end} and updated Wiki Page ${pageId}.`
      : `Prepared bounded ingestion context for ${source} pages ${pageRange.start}-${pageRange.end}.`,
    data: {
      source,
      pageRange,
      chunkId,
      pageId,
      citationKey: pageId ? citationKey : undefined,
      citationValidation: validation,
      result: result.result,
    },
  });
}

async function routeAcceptance(argv: readonly string[]): Promise<CliResult> {
  const [, command] = argv;
  if (command !== "poc") return unknownCommand("acceptance", command ?? "", argv, "Use: acceptance poc <pdf-path>.");
  const path = argv[2] ?? "fixtures/source-documents/IA-Mining-DG.pdf";
  const stages: AcceptanceStage[] = [];

  stages.push(acceptanceStage("db-status", await routeDb(["db", "status"])));
  const dbDoctorStage = acceptanceStage("db-doctor", await routeDb(["db", "doctor"]));
  stages.push(dbDoctorStage);
  if (dbDoctorStage.state === "blocked" || dbDoctorStage.state === "fail") {
    stages.push(blockedStage("schema", "Blocked because db doctor did not pass."));
    stages.push(blockedStage("source-import", "Blocked because db doctor did not pass."));
    stages.push(blockedStage("source-projections", "Blocked because Source Document import did not run."));
    stages.push(blockedStage("session-start", "Blocked because Source Document import did not run."));
    stages.push(blockedStage("chapter-ingestion", "Blocked because Source Document import did not run."));
    stages.push(blockedStage("citation-validation", "Blocked because Chapter Ingestion did not run."));
    stages.push(blockedStage("graph-retrieval", "Blocked because Chapter Ingestion did not run."));
    stages.push(blockedStage("change-log", "Blocked because no Agent Session was created."));
    stages.push({
      name: "surrealist-inspection",
      state: "not-applicable",
      reason:
        "Not applicable to the automated CLI harness; Surrealist inspection is validated by the manual inspection beads.",
    });
    const data = { stages, overallState: dbDoctorStage.state };
    return operationFailure(
      "acceptance poc",
      "acceptance.poc",
      argv,
      `POC acceptance ${dbDoctorStage.state} at stage 'db-doctor': ${dbDoctorStage.reason}`,
      "Resolve the stage failure or record the environment blocker before relying on POC acceptance proof.",
      data,
    );
  }
  stages.push(acceptanceStage("schema", await routeDb(["db", "apply-schema"])));

  const importResult = await routeSource(["source", "import-pdf", path]);
  stages.push(acceptanceStage("source-import", importResult));
  const sourceId = importResult.ok ? (importResult.data as { id?: string }).id : undefined;

  const projectionsResult = await routeSource([
    "source",
    "projections",
    path,
    "--source",
    sourceId ?? "source_document:fixture",
    "--max-tokens",
    "12000",
  ]);
  stages.push(acceptanceStage("source-projections", projectionsResult));

  if (!sourceId || !projectionsResult.ok) {
    stages.push(
      blockedStage(
        "session-start",
        "Blocked because Source Document import or Source Text Projection build did not produce IDs.",
      ),
    );
    stages.push(
      blockedStage(
        "chapter-ingestion",
        "Blocked because Source Document import or Source Text Projection build did not produce IDs.",
      ),
    );
    stages.push(blockedStage("citation-validation", "Blocked because Chapter Ingestion did not run."));
    stages.push(blockedStage("graph-retrieval", "Blocked because Chapter Ingestion did not run."));
    stages.push(blockedStage("change-log", "Blocked because no Agent Session was created."));
  } else {
    const sessionResult = await routeSession(["session", "start", "--purpose", `POC acceptance for ${path}`]);
    stages.push(acceptanceStage("session-start", sessionResult));
    const sessionId = sessionResult.ok ? (sessionResult.data as { id?: string }).id : undefined;

    if (!sessionId) {
      stages.push(blockedStage("chapter-ingestion", "Blocked because Agent Session creation did not produce an ID."));
      stages.push(blockedStage("citation-validation", "Blocked because Chapter Ingestion did not run."));
      stages.push(blockedStage("graph-retrieval", "Blocked because Chapter Ingestion did not run."));
      stages.push(blockedStage("change-log", "Blocked because no Agent Session was created."));
    } else {
      const pageTitle = "POC Mining Deployment";
      const pageId = wikiPageRecordId(pageTitle);
      stages.push(
        acceptanceStage(
          "chapter-ingestion",
          await routeIngest([
            "ingest",
            "chapter",
            "--source",
            sourceId,
            "--pages",
            "1",
            "--title",
            pageTitle,
            "--body",
            `${pageTitle} synthesized for POC acceptance.[^source]`,
            "--key",
            "source",
            "--label",
            pageTitle,
            "--session",
            sessionId,
          ]),
        ),
      );
      stages.push(
        acceptanceStage(
          "citation-validation",
          await routeCitation(["citation", "validate", pageId, "--session", sessionId]),
        ),
      );
      stages.push(
        acceptanceStage(
          "graph-retrieval",
          await routeRetrieval(["retrieval", "search", pageTitle, "POC", "acceptance", "--session", sessionId]),
        ),
      );
      stages.push(acceptanceStage("change-log", await routeLog(["log", "show", "--session", sessionId])));
    }
  }

  stages.push({
    name: "surrealist-inspection",
    state: "not-applicable",
    reason:
      "Not applicable to the automated CLI harness; Surrealist inspection is validated by the manual inspection beads.",
  });
  const blockingStage = stages.find((stage) => stage.state === "fail" || stage.state === "blocked");
  const data = { stages, overallState: blockingStage?.state ?? "pass" };

  if (blockingStage) {
    return operationFailure(
      "acceptance poc",
      "acceptance.poc",
      argv,
      `POC acceptance ${blockingStage.state} at stage '${blockingStage.name}': ${blockingStage.reason}`,
      "Resolve the stage failure or record the environment blocker before relying on POC acceptance proof.",
      data,
    );
  }

  return success({
    command: "acceptance poc",
    operation: "acceptance.poc",
    input: argv,
    message: "POC acceptance stages passed or were explicitly deferred/not-applicable.",
    data,
  });
}

async function writePage(argv: readonly string[], command: "create" | "update"): Promise<CliResult> {
  const title = valueAfter(argv, "--title");
  const body = valueAfter(argv, "--body") ?? "";
  if (!title) return missingArgument(`page ${command}`, `page.${command}`, argv, "--title <title>");
  const slug = wikiPageSlugFromTitle(title);
  const id = wikiPageRecordId(title);
  const pageReferenceValidation = validateWikiPageReferencesForPage({
    wikiPageId: id,
    title,
    slug,
    pageBody: body,
  });
  if (pageReferenceValidation.issues.length > 0) {
    return operationFailure(
      `page ${command}`,
      `page.${command}`,
      argv,
      `Wiki Page Reference validation failed for ${id}: ${pageReferenceValidation.issues.map((issue) => issue.message).join(" ")}`,
      "Keep Wiki Page References inline with non-empty targets, avoid duplicate/self references, and use Citations for Source Document evidence.",
      { id, pageReferenceValidation },
    );
  }
  const aliases = valuesAfter(argv, "--alias");
  const scopeNote = valueAfter(argv, "--scope-note");
  const pageKind = valueAfter(argv, "--kind") as WikiPageKind | undefined;
  const frameId = valueAfter(argv, "--frame");
  const frameMetadata = frameMetadataFromArgv(argv, `page ${command}`, `page.${command}`);
  if (!frameMetadata.ok) return frameMetadata.failure;
  if (pageKind && !wikiPageKinds.includes(pageKind)) {
    return operationFailure(
      `page ${command}`,
      `page.${command}`,
      argv,
      `Unsupported Wiki Page kind '${pageKind}'.`,
      `Use one of: ${wikiPageKinds.join(", ")}.`,
    );
  }
  const pageKindSet = pageKind ? `, page_kind = "${escapeSurrealString(pageKind)}"` : "";
  const frameSet = frameId ? `, frame = ${frameRecordId(frameId)}` : "";
  const frameMetadataSet =
    frameMetadata.value === undefined ? "" : `, frame_metadata = ${surrealObject(frameMetadata.value)}`;
  const aliasesSet = aliases.length > 0 ? `, aliases = ${surrealArray(aliases)}` : "";
  const scopeSet = scopeNote ? `, scope_note = "${escapeSurrealString(scopeNote)}"` : "";
  const query = `UPSERT ${id} SET title = "${escapeSurrealString(title)}", slug = "${slug}", body = "${escapeSurrealString(body)}"${aliasesSet}${scopeSet}${pageKindSet}${frameSet}${frameMetadataSet}, updated_at = time::now();`;
  return queryCommand(
    `page ${command}`,
    `page.${command}`,
    argv,
    query,
    `${command === "create" ? "Created" : "Updated"} Wiki Page ${id}.`,
    {
      id,
      slug,
      aliases,
      scopeNote,
      pageKind,
      frame: frameId,
      frameMetadata: frameMetadata.value,
      pageReferenceValidation,
    },
    {
      kind: "write",
      targetRecords: [id],
      beforeQuery: `SELECT * FROM ${id}`,
      afterQuery: `SELECT * FROM ${id}`,
      relateEditedTargets: [id],
    },
  );
}

async function pageCandidates(argv: readonly string[]): Promise<CliResult> {
  const queryText = positionalArgs(argv, 2).join(" ").trim();
  if (!queryText) return missingArgument("page candidates", "page.candidates", argv, "<topic>");
  const limit = Number.parseInt(valueAfter(argv, "--limit") ?? "10", 10);
  const slug = wikiPageSlugFromTitle(queryText);
  const query = [
    `LET $exact = (SELECT id, title, slug, aliases, scope_note, page_kind, frame, frame_metadata, body, ->cites->source_document AS cited_evidence, <-manual_link<-wiki_page AS inbound_links, ->manual_link->wiki_page AS outbound_links FROM wiki_page WHERE slug = "${escapeSurrealString(slug)}" OR title = "${escapeSurrealString(queryText)}");`,
    `LET $text = (SELECT id, title, slug, aliases, scope_note, page_kind, frame, frame_metadata, body, ->cites->source_document AS cited_evidence, <-manual_link<-wiki_page AS inbound_links, ->manual_link->wiki_page AS outbound_links FROM wiki_page WHERE title CONTAINS "${escapeSurrealString(queryText)}" OR body CONTAINS "${escapeSurrealString(queryText)}" OR aliases CONTAINS "${escapeSurrealString(queryText)}" OR frame_metadata CONTAINS "${escapeSurrealString(queryText)}" LIMIT ${limit});`,
    "RETURN array::distinct(array::concat($exact, $text));",
  ].join("\n");
  const result = await executeSurrealQuery(
    readSurrealConfig(),
    loggedQuery("page candidates", "page.candidates", argv, query, {
      kind: "read",
      targetRecords: [`page.candidates:${queryText}`],
    }),
    { queryId: `page.candidates:${queryText}` },
  );
  if (!result.ok) return fromSurrealFailure("page candidates", argv, result.error);
  const candidates = pageCandidateRows(result.result as Array<{ result?: unknown }>, queryText).slice(0, limit);
  return success({
    command: "page candidates",
    operation: "page.candidates",
    input: argv,
    message: `Found ${candidates.length} Wiki Page reuse candidate(s) for '${queryText}'.`,
    data: {
      query: queryText,
      results: candidates,
      interpretation:
        "Extend or broaden a high-overlap candidate before creating a new page; create only when no candidate covers the concept scope.",
      result: result.result,
    },
  });
}

async function editPage(argv: readonly string[], command: "replace" | "patch" | "append"): Promise<CliResult> {
  const pageId =
    valueAfter(argv, "--page") ??
    (valueAfter(argv, "--title") ? wikiPageRecordId(valueAfter(argv, "--title") ?? "") : argv[2]);
  if (!pageId) return missingArgument(`page ${command}`, `page.${command}`, argv, "--page <wiki-page-id>");

  const pageResult = await executeSurrealQuery(
    readSurrealConfig(),
    loggedQuery(
      `page ${command}`,
      `page.${command}`,
      argv,
      `SELECT title, slug, body FROM ${pageId}; SELECT key FROM cites WHERE in = ${pageId};`,
      { kind: "read", targetRecords: [pageId] },
    ),
    { queryId: `page.${command}:${pageId}:read` },
  );
  if (!pageResult.ok) return fromSurrealFailure(`page ${command}`, argv, pageResult.error);

  const statements = pageResult.result as Array<{ result?: unknown }>;
  const currentBody = pageBodyFromStatements(statements);
  const pageExists = pageRecordFromStatements(statements) !== undefined;
  if (!pageExists) {
    return operationFailure(
      `page ${command}`,
      `page.${command}`,
      argv,
      `Wiki Page ${pageId} does not exist; SELECT returned no page record.`,
      "Create the Wiki Page first, or pass the exact --page record ID returned by page search/read.",
    );
  }

  const graphCitationKeys = citationKeysFromStatements(statements);
  let edit: PageEditPreviewResult;
  try {
    edit =
      command === "replace"
        ? previewPageReplace(pageId, currentBody, graphCitationKeys, {
            find: valueAfter(argv, "--find"),
            replace: valueAfter(argv, "--replace") ?? "",
          })
        : command === "patch"
          ? previewPagePatch(pageId, currentBody, graphCitationKeys, readBodyInput(argv, "--body", "--body-file"))
          : previewPageAppend(
              pageId,
              currentBody,
              graphCitationKeys,
              readBodyInput(argv, "--body", "--body-file", "--append-file"),
            );
  } catch (error) {
    return operationFailure(
      `page ${command}`,
      `page.${command}`,
      argv,
      `Could not read Wiki Page edit input for ${pageId}: ${errorReason(error)}`,
      "Pass inline --body text or a readable body file path.",
    );
  }

  if (!edit.ok) {
    return operationFailure(`page ${command}`, `page.${command}`, argv, edit.reason, edit.action, edit.data);
  }

  const apply = argv.includes("--apply");
  if (!apply) {
    return success({
      command: `page ${command}`,
      operation: `page.${command}`,
      input: argv,
      message: `Previewed Wiki Page ${command} for ${pageId}; no data was mutated. Pass --apply to write it.`,
      data: { ...edit.data, preview: true, applied: false },
    });
  }

  const result = await executeSurrealQuery(
    readSurrealConfig(),
    loggedQuery(
      `page ${command}`,
      `page.${command}`,
      argv,
      `UPDATE ${pageId} SET body = "${escapeSurrealString(edit.nextBody)}", updated_at = time::now();`,
      {
        kind: "write",
        targetRecords: [pageId],
        beforeQuery: `SELECT body FROM ${pageId}`,
        afterQuery: `SELECT body FROM ${pageId}`,
        relateEditedTargets: [pageId],
      },
    ),
    { queryId: `page.${command}:${pageId}:apply` },
  );
  if (!result.ok) return fromSurrealFailure(`page ${command}`, argv, result.error);

  return success({
    command: `page ${command}`,
    operation: `page.${command}`,
    input: argv,
    message: `Applied Wiki Page ${command} to ${pageId}.`,
    data: { ...edit.data, preview: false, applied: true, result: result.result },
  });
}

type PageEditPreviewResult =
  | {
      readonly ok: true;
      readonly nextBody: string;
      readonly data: {
        readonly pageId: string;
        readonly changed: boolean;
        readonly beforeLength: number;
        readonly afterLength: number;
        readonly beforeContext: string;
        readonly afterContext: string;
        readonly citationValidation: ReturnType<typeof validatePageBodyCitationMarkers>;
        readonly pageReferenceValidation: PageReferenceValidation;
        readonly matchCount?: number;
      };
    }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly action: string;
      readonly data?: unknown;
    };

export function previewPageReplace(
  pageId: string,
  currentBody: string,
  graphCitationKeys: readonly string[],
  input: { readonly find?: string; readonly replace: string },
): PageEditPreviewResult {
  if (!input.find) {
    return {
      ok: false,
      reason: "Missing required find text for Wiki Page replace.",
      action: "Pass --find <text> with the exact body text to replace.",
    };
  }

  const matchCount = countPageEditOccurrences(currentBody, input.find);
  if (matchCount === 0) {
    return {
      ok: false,
      reason: `Find text was absent in ${pageId}: ${JSON.stringify(input.find)}.`,
      action: "Run page read to inspect the current body, then retry with exact text from that Wiki Page.",
      data: { pageId, find: input.find, matchCount },
    };
  }
  if (matchCount > 1) {
    return {
      ok: false,
      reason: `Find text was ambiguous in ${pageId}: ${matchCount} matches for ${JSON.stringify(input.find)}.`,
      action: "Use a longer unique --find value that includes surrounding context.",
      data: { pageId, find: input.find, matchCount },
    };
  }

  const matchIndex = currentBody.indexOf(input.find);
  const nextBody = `${currentBody.slice(0, matchIndex)}${input.replace}${currentBody.slice(matchIndex + input.find.length)}`;
  return validatePageEditPreview(pageId, currentBody, nextBody, graphCitationKeys, {
    matchIndex,
    contextLength: Math.max(input.find.length, input.replace.length),
    matchCount,
  });
}

export function previewPagePatch(
  pageId: string,
  currentBody: string,
  graphCitationKeys: readonly string[],
  nextBody: string | undefined,
): PageEditPreviewResult {
  if (nextBody === undefined) {
    return {
      ok: false,
      reason: "Missing required replacement body for Wiki Page patch.",
      action: "Pass --body <text> or --body-file <path>.",
    };
  }

  return validatePageEditPreview(pageId, currentBody, nextBody, graphCitationKeys, {
    matchIndex: firstDifferenceIndex(currentBody, nextBody),
    contextLength: 80,
  });
}

export function previewPageAppend(
  pageId: string,
  currentBody: string,
  graphCitationKeys: readonly string[],
  appendedBody: string | undefined,
): PageEditPreviewResult {
  if (appendedBody === undefined) {
    return {
      ok: false,
      reason: "Missing required appended body for Wiki Page append.",
      action: "Pass --body <text>, --body-file <path>, or --append-file <path>.",
    };
  }

  const separator = currentBody.length === 0 || currentBody.endsWith("\n") ? "" : "\n\n";
  const nextBody = `${currentBody}${separator}${appendedBody}`;
  return validatePageEditPreview(pageId, currentBody, nextBody, graphCitationKeys, {
    matchIndex: currentBody.length,
    contextLength: appendedBody.length,
  });
}

function validatePageEditPreview(
  pageId: string,
  currentBody: string,
  nextBody: string,
  graphCitationKeys: readonly string[],
  options: { readonly matchIndex: number; readonly contextLength: number; readonly matchCount?: number },
): PageEditPreviewResult {
  const citationValidation = validatePageBodyCitationMarkers({
    wikiPageId: pageId,
    pageBody: nextBody,
    graphCitationKeys,
  });
  const pageReferenceValidation = validateWikiPageReferencesForPage({
    wikiPageId: pageId,
    pageBody: nextBody,
  });
  if (citationValidation.issues.length > 0) {
    return {
      ok: false,
      reason: `Wiki Page edit would break citation marker validation for ${pageId}: ${citationValidation.issues.map((issue) => issue.message).join(" ")}`,
      action:
        "Keep Citation Markers aligned with graph Citation keys, or update Citations before applying the Page Body edit.",
      data: { pageId, citationValidation },
    };
  }
  if (pageReferenceValidation.issues.length > 0) {
    return {
      ok: false,
      reason: `Wiki Page edit would break Wiki Page Reference validation for ${pageId}: ${pageReferenceValidation.issues.map((issue) => issue.message).join(" ")}`,
      action:
        "Keep Wiki Page References inline with non-empty targets, avoid duplicate/self references, and use Citations for Source Document evidence.",
      data: { pageId, pageReferenceValidation },
    };
  }

  const start = Math.max(0, options.matchIndex - 80);
  const end = Math.min(currentBody.length, options.matchIndex + Math.max(options.contextLength, 80));
  const nextEnd = Math.min(nextBody.length, options.matchIndex + Math.max(options.contextLength, 80));

  return {
    ok: true,
    nextBody,
    data: {
      pageId,
      changed: currentBody !== nextBody,
      beforeLength: currentBody.length,
      afterLength: nextBody.length,
      beforeContext: currentBody.slice(start, end),
      afterContext: nextBody.slice(start, nextEnd),
      citationValidation,
      pageReferenceValidation,
      ...(options.matchCount === undefined ? {} : { matchCount: options.matchCount }),
    },
  };
}

function readBodyInput(
  argv: readonly string[],
  inlineFlag: string,
  fileFlag: string,
  alternateFileFlag?: string,
): string | undefined {
  const inline = valueAfter(argv, inlineFlag);
  if (inline !== undefined) return inline;
  const file = valueAfter(argv, fileFlag) ?? (alternateFileFlag ? valueAfter(argv, alternateFileFlag) : undefined);
  return file ? readFileSync(file, "utf8") : undefined;
}

function countPageEditOccurrences(body: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let index = body.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = body.indexOf(needle, index + needle.length);
  }
  return count;
}

function firstDifferenceIndex(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) return index;
  }
  return length;
}

async function searchPages(argv: readonly string[]): Promise<CliResult> {
  const queryText = positionalArgs(argv, 2).join(" ").trim();
  const command = argv[0] === "retrieval" ? "retrieval search" : "page search";
  const operation = argv[0] === "retrieval" ? "retrieval.search" : "page.search";
  if (!queryText) return missingArgument(command, operation, argv, "<query>");

  const queryEmbedding = await fetchOllamaEmbedding(queryText, command, operation, argv);
  if (!queryEmbedding.ok) return queryEmbedding.failure;

  const lexical = escapeSurrealString(queryText);
  const result = await executeSurrealQuery(
    readSurrealConfig(),
    loggedQuery(
      command,
      operation,
      argv,
      [
        `LET $query_embedding = ${surrealNumberArray(queryEmbedding.embedding)};`,
        `LET $wiki = (SELECT id, title, slug, aliases, scope_note, page_kind, frame, frame_metadata, body, embedding, embedded_text_hash, vector::similarity::cosine(embedding, $query_embedding) AS db_vector_score, ->cites->source_document AS cited_evidence FROM wiki_page WHERE embedding != NONE AND (title CONTAINS "${lexical}" OR body CONTAINS "${lexical}" OR aliases CONTAINS "${lexical}" OR frame_metadata CONTAINS "${lexical}") ORDER BY db_vector_score DESC LIMIT 50);`,
        `LET $evidence = (SELECT id, source_document, start_page, end_page, text, text_hash, embedding, embedded_text_hash, extraction_method, projection_version, projection_status, vector::similarity::cosine(embedding, $query_embedding) AS db_vector_score FROM source_text_projection WHERE embedding != NONE AND text CONTAINS "${lexical}" ORDER BY db_vector_score DESC LIMIT 50 FETCH source_document);`,
        "RETURN { wiki: $wiki, evidence: $evidence };",
      ].join("\n"),
      { kind: "read", targetRecords: [`${operation}:${queryText}`] },
    ),
    { queryId: `${operation}:${queryText}` },
  );

  if (!result.ok) return fromSurrealFailure(command, argv, result.error);

  const candidates = retrievalCandidatesFromStatements(result.result as Array<{ result?: unknown }>);
  let ranked: readonly RankedRetrievalCandidate[];
  try {
    ranked = await rankRetrievalCandidates(candidates, queryText, queryEmbedding.embedding);
  } catch (error) {
    return operationFailure(
      command,
      operation,
      argv,
      errorReason(error),
      `Start Ollama and pull the embedding model with: ollama pull ${queryEmbedding.config.model}`,
    );
  }

  return success({
    command,
    operation,
    input: argv,
    message: `Graph Retrieval ranked ${ranked.length} candidate(s) for '${queryText}' using ${queryEmbedding.config.model}.`,
    data: {
      query: queryText,
      embedding: queryEmbedding.config,
      results: ranked.slice(0, 10),
      candidateSource: "surreal-hybrid-candidate-query",
      result: result.result,
    },
  });
}

async function embedRetrievalRecords(argv: readonly string[]): Promise<CliResult> {
  const target = valueAfter(argv, "--target") ?? "all";
  const limit = Number.parseInt(valueAfter(argv, "--limit") ?? "10", 10);
  if (!["all", "wiki", "source"].includes(target)) {
    return operationFailure(
      "retrieval embed",
      "retrieval.embed",
      argv,
      `Unsupported embedding target '${target}'.`,
      "Use --target all, --target wiki, or --target source.",
    );
  }
  const query = [
    target === "all" || target === "wiki"
      ? `SELECT id, title, body, embedded_text_hash, updated_at FROM wiki_page ORDER BY updated_at DESC LIMIT ${limit};`
      : "",
    target === "all" || target === "source"
      ? `SELECT id, text, text_hash, embedded_text_hash, updated_at FROM source_text_projection WHERE projection_status = 'ready' ORDER BY updated_at DESC LIMIT ${limit};`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  const result = await executeSurrealQuery(readSurrealConfig(), query, { queryId: `retrieval.embed.read:${target}` });
  if (!result.ok) return fromSurrealFailure("retrieval embed", argv, result.error);

  const config = readOllamaEmbeddingConfig();
  const statements: string[] = [];
  for (const candidate of embeddingCandidatesFromStatements(result.result as Array<{ result?: unknown }>)) {
    if (candidate.embeddedTextHash === candidate.textHash) continue;
    const embedding = await fetchOllamaEmbedding(candidate.text, "retrieval embed", "retrieval.embed", argv);
    if (!embedding.ok) return embedding.failure;
    if (embedding.embedding.length !== 768) {
      return operationFailure(
        "retrieval embed",
        "retrieval.embed",
        argv,
        `Embedding dimension mismatch for ${candidate.id}: model '${config.model}' returned ${embedding.embedding.length}, schema index expects 768.`,
        "Use an embedding model with 768 dimensions or change the SurrealDB vector index dimension deliberately.",
      );
    }
    statements.push(
      `UPDATE ${candidate.id} SET embedding = ${surrealNumberArray(embedding.embedding)}, embedding_provider = "ollama", embedding_model = "${escapeSurrealString(config.model)}", embedding_dimensions = ${embedding.embedding.length}, embedded_text_hash = "${candidate.textHash}", embedded_at = time::now();`,
    );
  }

  if (statements.length === 0) {
    return success({
      command: "retrieval embed",
      operation: "retrieval.embed",
      input: argv,
      message: `No stale retrieval embedding records found for target '${target}'.`,
      data: { target, limit, updated: 0, provider: "ollama", model: config.model },
    });
  }

  const update = await executeSurrealQuery(
    readSurrealConfig(),
    loggedQuery("retrieval embed", "retrieval.embed", argv, statements.join("\n"), {
      kind: "write",
      targetRecords: ["wiki_page", "source_text_projection"],
      relateEditedTargets: [],
    }),
    { queryId: `retrieval.embed.update:${target}` },
  );
  if (!update.ok) return fromSurrealFailure("retrieval embed", argv, update.error);
  return success({
    command: "retrieval embed",
    operation: "retrieval.embed",
    input: argv,
    message: `Updated ${statements.length} retrieval embedding record(s) for target '${target}'.`,
    data: { target, limit, updated: statements.length, provider: "ollama", model: config.model, result: update.result },
  });
}

async function queryCommand(
  command: string,
  operation: string,
  argv: readonly string[],
  query: string,
  message: string,
  data: Record<string, unknown> = {},
  logOptions?: QueryLogOptions,
): Promise<CliResult> {
  const result = await executeSurrealQuery(
    readSurrealConfig(),
    loggedQuery(command, operation, argv, query, logOptions),
    {
      queryId: `${operation}:${argv.join(" ")}`,
    },
  );
  if (!result.ok) return fromSurrealFailure(command, argv, result.error);
  return success({ command, operation, input: argv, message, data: { ...data, result: result.result } });
}

async function selectById(
  command: string,
  operation: string,
  argv: readonly string[],
  id: string | undefined,
  label: string,
): Promise<CliResult> {
  if (!id) return missingArgument(command, operation, argv, `<${label}>`);
  return queryCommand(
    command,
    operation,
    argv,
    `SELECT * FROM ${id};`,
    `Read ${label} ${id}.`,
    {},
    {
      kind: "read",
      targetRecords: [id],
    },
  );
}

export function buildAgentActivityRecordQuery(draft: AgentActivityDraft): string {
  return buildSurrealAgentActivityRecordQuery(draft, {
    implicitSessionPurpose: "Implicit Agent Activity CLI session",
  });
}

function agentActivityDraftFromArgv(argv: readonly string[]): AgentActivityDraft | CliFailure {
  const sessionId = resolveSessionId(argv, { createImplicit: true });
  const source = valueAfter(argv, "--source") ?? "cli";
  const kind = valueAfter(argv, "--kind");
  const status = valueAfter(argv, "--status") ?? defaultAgentActivityStatus(kind);
  const summary = valueAfter(argv, "--summary") ?? positionalArgs(argv, 2).join(" ");
  const operation = valueAfter(argv, "--operation");
  const targetRecords = valuesAfter(argv, "--target");
  const metadataJson = valueAfter(argv, "--metadata-json");
  const metadata = metadataJson === undefined ? undefined : parseMetadataJson(metadataJson);

  if (!sessionId) return missingArgument("activity record", "activity.record", argv, "<Agent Session ID>");
  if (!isAgentActivitySource(source)) {
    return operationFailure(
      "activity record",
      "activity.record",
      argv,
      `Invalid Agent Activity source '${source}'.`,
      `Use one of: ${agentActivitySources.join(", ")}.`,
    );
  }
  if (!isAgentActivityKind(kind)) {
    return operationFailure(
      "activity record",
      "activity.record",
      argv,
      kind ? `Invalid Agent Activity kind '${kind}'.` : "Missing Agent Activity kind.",
      `Pass --kind with one of: ${agentActivityKinds.join(", ")}.`,
    );
  }
  if (!isAgentActivityStatus(status)) {
    return operationFailure(
      "activity record",
      "activity.record",
      argv,
      `Invalid Agent Activity status '${status}'.`,
      `Pass --status with one of: ${agentActivityStatuses.join(", ")}.`,
    );
  }
  if (!summary.trim()) return missingArgument("activity record", "activity.record", argv, "--summary <summary>");
  if (metadata instanceof Error) {
    return operationFailure(
      "activity record",
      "activity.record",
      argv,
      `Invalid --metadata-json value: ${metadata.message}.`,
      "Pass a JSON object such as --metadata-json '{\"exitCode\":1}'.",
    );
  }

  const providedSessionId = valueAfter(argv, "--session") ?? process.env.ORIGINIUM_SESSION ?? readCurrentSession();
  const id = `agent_activity:${randomUUID().replaceAll("-", "")}`;
  return {
    id,
    sessionId,
    createSession: !providedSessionId,
    source,
    kind,
    status,
    summary,
    operation,
    targetRecords,
    metadata,
  };
}

function loggedQuery(
  command: string,
  operation: string,
  argv: readonly string[],
  query: string,
  options: QueryLogOptions | undefined,
): string {
  if (!options) return query;
  if (options.kind === "read") return query;

  const providedSessionId = options.sessionId ?? valueAfter(argv, "--session");
  const sessionId = providedSessionId ?? resolveSessionId(argv, { createImplicit: true });
  const targetRecords = options.targetRecords.length === 0 ? ["<unspecified>"] : options.targetRecords;
  const logId = `change_log:${randomUUID().replaceAll("-", "")}`;
  const implicitSessionStatement =
    sessionId && !providedSessionId && !process.env.ORIGINIUM_SESSION && !readCurrentSession()
      ? `CREATE ${sessionId} SET purpose = "Implicit Graph Wiki CLI session", created_at = time::now();`
      : "";
  const beforeStatement = options.beforeQuery
    ? `LET $originium_before = (${options.beforeQuery})[0];`
    : "LET $originium_before = NONE;";
  const afterStatement = options.afterQuery
    ? `LET $originium_after = (${options.afterQuery})[0];`
    : "LET $originium_after = NONE;";
  const editedRelations =
    options.kind === "write" && sessionId
      ? (options.relateEditedTargets ?? targetRecords)
          .map((target) => `RELATE ${target}->edited_in->${sessionId} SET created_at = time::now();`)
          .join("\n")
      : "";

  return [
    implicitSessionStatement,
    beforeStatement,
    query,
    afterStatement,
    `CREATE ${logId} SET agent_session = ${sessionId ?? "NONE"}, command = "${escapeSurrealString(command)}", operation = "${escapeSurrealString(operation)}", target = "${escapeSurrealString(targetRecords.join(", "))}", target_records = ${surrealArray(targetRecords)}, summary = "${escapeSurrealString(`${options.kind} ${command}`)}", before = $originium_before, after = $originium_after, created_at = time::now();`,
    editedRelations,
  ]
    .filter(Boolean)
    .join("\n");
}

function renderCliResult(result: CliResult): string {
  if (!result.ok) {
    return [
      `ERROR ${result.command || result.error.operation}`,
      `operation: ${result.error.operation}`,
      `input: ${result.error.input}`,
      `reason: ${result.error.reason}`,
      `action: ${result.error.action}`,
    ].join("\n");
  }

  const lines = [`OK ${result.command}`, result.message];
  const details = humanDetails(result.data);
  if (details.length > 0) lines.push(...details);
  return lines.join("\n");
}

function humanDetails(data: unknown): readonly string[] {
  if (!data || typeof data !== "object") return [];
  const record = data as Record<string, unknown>;
  const help = helpDetails(record);
  if (help.length > 0) return help;
  const lines: string[] = [];
  for (const key of ["id", "slug", "sourceId", "pageId", "outlineEntryId", "chunkId", "query"] as const) {
    const value = record[key];
    if (typeof value === "string") lines.push(`${key}: ${value}`);
  }
  if (Array.isArray(record.results)) {
    lines.push(`results: ${record.results.length}`);
    for (const result of record.results.slice(0, 5)) {
      if (!result || typeof result !== "object") continue;
      const item = result as { id?: unknown; title?: unknown; score?: unknown };
      lines.push(`- ${String(item.id ?? "<unknown>")} ${String(item.title ?? "")} ${String(item.score ?? "")}`.trim());
    }
  }
  if (Array.isArray(record.outline)) {
    lines.push(`outline: ${record.outline.length}`);
    for (const outlineEntry of record.outline.slice(0, 8)) {
      if (!outlineEntry || typeof outlineEntry !== "object") continue;
      const item = outlineEntry as {
        id?: unknown;
        persistedId?: unknown;
        title?: unknown;
        startPage?: unknown;
        endPage?: unknown;
      };
      lines.push(
        `- ${String(item.persistedId ?? item.id ?? "<unknown>")} ${String(item.title ?? "")} pages ${String(item.startPage ?? "?")}-${String(item.endPage ?? item.startPage ?? "?")}`,
      );
    }
  }
  return lines;
}

function helpDetails(record: Record<string, unknown>): readonly string[] {
  if (record.mode === "top-level" && Array.isArray(record.groups)) {
    const lines = [`usage: ${String(record.usage)}`, String(record.json), "groups:"];
    for (const group of record.groups) {
      if (!group || typeof group !== "object") continue;
      const item = group as { readonly group?: unknown; readonly summary?: unknown };
      lines.push(`- ${String(item.group ?? "<unknown>")}: ${String(item.summary ?? "")}`);
    }
    return lines;
  }

  if (record.mode === "group" && Array.isArray(record.commands)) {
    const lines = ["commands:"];
    for (const command of record.commands) {
      if (!command || typeof command !== "object") continue;
      const item = command as {
        readonly usage?: unknown;
        readonly summary?: unknown;
        readonly example?: unknown;
      };
      lines.push(`- ${String(item.usage ?? "<unknown>")}`);
      lines.push(`  ${String(item.summary ?? "")}`);
      lines.push(`  example: ${String(item.example ?? "")}`);
    }
    if (Array.isArray(record.workflows) && record.workflows.length > 0) {
      lines.push("related workflows:");
      for (const workflow of record.workflows) lines.push(`- ${String(workflow)}`);
    }
    lines.push(String(record.json));
    return lines;
  }

  return [];
}

function wantsJson(argv: readonly string[]): boolean {
  return argv.includes("--json");
}

function withoutOutputFlags(argv: readonly string[]): readonly string[] {
  return argv.filter((arg) => arg !== "--json" && arg !== "--ndjson");
}

function resolveSessionId(argv: readonly string[], options: { readonly createImplicit: boolean }): string | undefined {
  const explicit = valueAfter(argv, "--session");
  if (explicit) return explicit;
  if (process.env.ORIGINIUM_SESSION) return process.env.ORIGINIUM_SESSION;
  const current = readCurrentSession();
  if (current) return current;
  return options.createImplicit ? `agent_session:${randomUUID().replaceAll("-", "")}` : undefined;
}

function sessionSource(argv: readonly string[]): string | undefined {
  if (valueAfter(argv, "--session")) return "explicit";
  if (process.env.ORIGINIUM_SESSION) return "env";
  if (readCurrentSession()) return "current";
  return undefined;
}

function sessionArgsForChild(argv: readonly string[]): readonly string[] {
  const sessionId = resolveSessionId(argv, { createImplicit: false });
  return sessionId ? ["--session", sessionId] : [];
}

function locatorArgsForChild(argv: readonly string[]): readonly string[] {
  const forwarded: string[] = [];
  for (const flag of [
    "--pages",
    "--page-range",
    "--page",
    "--start-page",
    "--end-page",
    "--quote",
    "--context",
    "--claim",
    "--location",
    "--location-hint",
    "--projection",
    "--projection-id",
    "--text-hash",
    "--confidence",
  ]) {
    const value = valueAfter(argv, flag);
    if (value !== undefined) forwarded.push(flag, value);
  }
  return forwarded;
}

function currentSessionFile(): string {
  return join(process.cwd(), ".originium", "current-session");
}

function readCurrentSession(): string | undefined {
  try {
    const value = readFileSync(currentSessionFile(), "utf8").trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

function writeCurrentSession(sessionId: string): void {
  mkdirSync(dirname(currentSessionFile()), { recursive: true });
  writeFileSync(currentSessionFile(), `${sessionId}\n`);
}

function clearCurrentSession(): void {
  try {
    unlinkSync(currentSessionFile());
  } catch {
    // The command is idempotent for operators clearing stale local state.
  }
}

function pageBodyFromStatements(statements: readonly { readonly result?: unknown }[]): string {
  for (const statement of statements) {
    if (!Array.isArray(statement.result)) continue;
    const row = statement.result.find((candidate) => {
      return candidate && typeof candidate === "object" && "body" in candidate;
    }) as { body?: unknown } | undefined;
    if (typeof row?.body === "string") return row.body;
  }

  return "";
}

function pageRecordFromStatements(
  statements: readonly { readonly result?: unknown }[],
): Record<string, unknown> | undefined {
  for (const statement of statements) {
    if (!Array.isArray(statement.result)) continue;
    const row = statement.result.find((candidate) => {
      return candidate && typeof candidate === "object" && "body" in candidate;
    });
    if (row && typeof row === "object") return row as Record<string, unknown>;
  }

  return undefined;
}

function citationKeysFromStatements(statements: readonly { readonly result?: unknown }[]): readonly string[] {
  for (const statement of statements) {
    if (!Array.isArray(statement.result)) continue;
    const keys = statement.result.flatMap((row) => {
      if (!row || typeof row !== "object" || !("key" in row)) return [];
      const key = (row as { key?: unknown }).key;
      return typeof key === "string" ? [key] : [];
    });
    if (keys.length > 0) return keys;
  }

  return [];
}

function rowsAtStatement(
  statements: readonly { readonly result?: unknown }[],
  index: number,
): readonly Record<string, unknown>[] {
  const rows = statements[index]?.result;
  return Array.isArray(rows) ? rows.filter(isRecord) : [];
}

function validateCitationRow(
  citation: Record<string, unknown>,
  projections: readonly Record<string, unknown>[],
): readonly Record<string, unknown>[] {
  const issues: Record<string, unknown>[] = [];
  const key = stringField(citation, "key") ?? "<unknown>";
  const pageId = stringField(citation, "in") ?? "<unknown-page>";
  const sourceId = recordRefString(citation.out);
  const locatorKind = stringField(citation, "locator_kind");
  const pageRange = citation.page_range as { readonly start_page?: unknown; readonly end_page?: unknown } | undefined;
  const quote = stringField(citation, "quote");
  const context = stringField(citation, "context");
  const claim = stringField(citation, "claim");
  if (!sourceId?.startsWith("source_document:")) {
    issues.push({
      kind: "missing-source-document-target",
      severity: "error",
      recordId: `${pageId}:${key}`,
      reason: `Citation ${key} does not target a Source Document.`,
      suggestedRepair: `Run citation repair --page ${pageId} --key ${key} --source <source-document-id>.`,
    });
  }
  if (!claim) {
    issues.push({
      kind: "missing-claim",
      severity: "warning",
      recordId: `${pageId}:${key}`,
      reason: `Citation ${key} is missing claim metadata.`,
      suggestedRepair: `Run citation narrow --page ${pageId} --key ${key} --context <supported claim context>.`,
    });
  }
  if (!locatorKind || locatorKind === "whole-document" || (!pageRange && !quote && !context)) {
    issues.push({
      kind: "broad-locator",
      severity: "warning",
      recordId: `${pageId}:${key}`,
      reason: `Citation ${key} has a broad or missing locator.`,
      suggestedRepair: `Run citation narrow --page ${pageId} --key ${key} --pages <range> and add --quote or --context when possible.`,
    });
  }
  const projectionId = stringField(citation, "projection_id");
  const textHash = stringField(citation, "text_hash");
  if (projectionId) {
    const projection = projections.find((candidate) => stringField(candidate, "id") === projectionId);
    if (!projection) {
      issues.push({
        kind: "missing-projection",
        severity: "warning",
        recordId: `${pageId}:${key}`,
        reason: `Citation ${key} references missing Source Text Projection ${projectionId}.`,
        suggestedRepair: `Run source projections <pdf-path> --source ${sourceId ?? "<source-document-id>"} or citation narrow with a valid --projection.`,
      });
    } else if (textHash && stringField(projection, "text_hash") && stringField(projection, "text_hash") !== textHash) {
      issues.push({
        kind: "stale-projection-hash",
        severity: "warning",
        recordId: `${pageId}:${key}`,
        reason: `Citation ${key} text_hash does not match ${projectionId}.`,
        suggestedRepair: `Rerun citation narrow --page ${pageId} --key ${key} --projection ${projectionId} --text-hash ${stringField(projection, "text_hash")}.`,
      });
    }
  }
  if (quote) {
    const quotedProjection = projections.find((projection) => {
      const text = stringField(projection, "text") ?? "";
      return text.includes(quote);
    });
    if (projections.length > 0 && !quotedProjection) {
      issues.push({
        kind: "quote-not-found",
        severity: "warning",
        recordId: `${pageId}:${key}`,
        reason: `Citation ${key} quote was not found in available Source Text Projections.`,
        suggestedRepair: `Run source evidence ${JSON.stringify(quote)} --source ${sourceId ?? "<source-document-id>"} --trace, then narrow or repair the Citation.`,
      });
    }
  }
  return issues;
}

function recordRefString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.id === "string") return record.id;
  }
  return undefined;
}

type GraphLintIssue = {
  readonly family?: "citation" | "source" | "page" | "page-reference" | "link";
  readonly kind:
    | "empty-wiki-page"
    | "uncited-wiki-page"
    | "citation-marker-mismatch"
    | "unused-citation"
    | "malformed-wiki-page-reference"
    | "duplicate-wiki-page-reference"
    | "unresolved-wiki-page-reference"
    | "self-wiki-page-reference"
    | "missing-page-frame"
    | "missing-frame-metadata"
    | "duplicate-ish-page"
    | "orphan-page"
    | "stub-wiki-page"
    | "broad-citation-target"
    | "source-projection-missing-hash"
    | "source-projection-not-ready"
    | "deprecated-manual-link";
  readonly severity: "error" | "warning";
  readonly recordId: string;
  readonly message: string;
  readonly suggestion: string;
  readonly reason?: string;
  readonly suggestedRepair?: string;
  readonly autoFixable?: boolean;
  readonly retrievalImpact?: "none" | "low" | "medium" | "high";
  readonly details?: Record<string, unknown>;
};

export function lintGraphWikiStatements(
  statements: readonly { readonly result?: unknown }[],
  family?: string,
): {
  readonly issueCount: number;
  readonly issues: readonly GraphLintIssue[];
  readonly summary: Record<string, number>;
  readonly family?: string;
} {
  const rowsByStatement = statements.map((statement) =>
    Array.isArray(statement.result) ? statement.result.filter(isRecord) : [],
  );
  const pages = rowsByStatement[0] ?? [];
  const citations = rowsByStatement[1] ?? [];
  const projections = rowsByStatement[2] ?? [];
  const manualLinks = rowsByStatement[3] ?? [];
  const issues: GraphLintIssue[] = [];
  const citationsByPage = groupBy(citations, "in");
  const manualLinksByEndpoint = new Map<string, number>();

  for (const link of manualLinks) {
    const from = stringField(link, "in");
    const to = stringField(link, "out");
    if (from) manualLinksByEndpoint.set(from, (manualLinksByEndpoint.get(from) ?? 0) + 1);
    if (to) manualLinksByEndpoint.set(to, (manualLinksByEndpoint.get(to) ?? 0) + 1);
    const id = stringField(link, "id") || `${from}->manual_link->${to}`;
    issues.push({
      kind: "deprecated-manual-link",
      severity: "warning",
      recordId: id,
      message: `Graph lint link failed for Manual Link ${id}: deprecated-manual-link from "${from ?? "<missing>"}" to "${to ?? "<missing>"}". Generic Manual Links are disabled for the frame workflow MVP.`,
      suggestion:
        "Remove or ignore this legacy Manual Link, replace Wiki Page navigation with inline Wiki Page References, and use Citations to Source Documents for evidence.",
      details: { from, to, label: stringField(link, "label"), reason: stringField(link, "reason") },
    });
  }

  const pagesByDuplicateKey = new Map<string, Record<string, unknown>[]>();
  for (const page of pages) {
    const id = stringField(page, "id");
    const title = stringField(page, "title");
    const slug = stringField(page, "slug");
    const body = stringField(page, "body") ?? "";
    if (!id) continue;

    const pageReferenceValidation = validateWikiPageReferencesForPage({
      wikiPageId: id,
      title,
      slug,
      pageBody: body,
      knownPages: pages,
    });
    for (const issue of pageReferenceValidation.issues) {
      issues.push({
        kind: graphLintKindFromPageReferenceIssue(issue.kind),
        severity: issue.kind === "duplicate-reference" ? "warning" : "error",
        recordId: id,
        message: issue.message,
        suggestion: issue.action,
        details: { validationIssue: issue },
      });
    }

    const pageCitations = citationsByPage.get(id) ?? [];
    const pageCitationKeys = pageCitations.flatMap((citation) => {
      const key = stringField(citation, "key");
      return key ? [key] : [];
    });
    const validation = validatePageBodyCitationMarkers({
      wikiPageId: id,
      pageBody: body,
      graphCitationKeys: pageCitationKeys,
    });
    for (const issue of validation.issues) {
      issues.push({
        kind: issue.kind === "unused-graph-citation" ? "unused-citation" : "citation-marker-mismatch",
        severity: "error",
        recordId: id,
        message: issue.message,
        suggestion:
          issue.kind === "unused-graph-citation"
            ? `Add Citation Marker [^${issue.graphCitationKey}] to ${id}, or remove the unused Citation relation.`
            : `Add the missing Citation relation for ${id}, remove the stale marker, or use page replace/patch with --apply after previewing.`,
        details: { validationIssue: issue },
      });
    }

    if (body.trim().length === 0) {
      issues.push({
        kind: "empty-wiki-page",
        severity: "error",
        recordId: id,
        message: `Wiki Page ${id} is empty.`,
        suggestion: `Use page patch --page ${id} --body-file <path> --apply, or remove the residue through an explicit cleanup bead.`,
      });
    } else if (body.trim().length < 120) {
      issues.push({
        kind: "stub-wiki-page",
        severity: "warning",
        recordId: id,
        message: `Wiki Page ${id} is very short (${body.trim().length} characters).`,
        suggestion: `Expand ${id} with cited synthesis, or mark the page as intentional in a follow-up note.`,
      });
    }

    if (pageCitations.length === 0) {
      issues.push({
        kind: "uncited-wiki-page",
        severity: "warning",
        recordId: id,
        message: `Wiki Page ${id} has no graph Citations.`,
        suggestion: `Run citation add --page ${id} --source <source-document-id> --key <marker-key> after adding a matching Citation Marker.`,
      });
    }

    if (pageCitations.length === 0 && (manualLinksByEndpoint.get(id) ?? 0) === 0) {
      issues.push({
        kind: "orphan-page",
        severity: "warning",
        recordId: id,
        message: `Wiki Page ${id} has no Citations or Manual Links.`,
        suggestion: `Connect ${id} with citation add or link add, or clean up the orphan page explicitly.`,
      });
    }

    if (page.frame === undefined && page.page_kind === undefined) {
      issues.push({
        kind: "missing-page-frame",
        severity: "warning",
        recordId: id,
        message: `Wiki Page ${id} has no Domain Frame assignment or legacy page_kind.`,
        suggestion: `Run page update --title "${title ?? id}" --frame <domain-frame-id-or-name> --metadata-json <json> when the page role is known.`,
      });
    } else if (page.frame !== undefined && page.frame_metadata === undefined) {
      issues.push({
        kind: "missing-frame-metadata",
        severity: "warning",
        recordId: id,
        message: `Wiki Page ${id} has a Domain Frame assignment but no sparse frame metadata.`,
        suggestion: `Run page update --title "${title ?? id}" --frame <domain-frame-id-or-name> --metadata-json <json> with high-value frame slots when known.`,
      });
    }

    const duplicateKey = toSlug(slug || title || id);
    const duplicateSet = pagesByDuplicateKey.get(duplicateKey) ?? [];
    duplicateSet.push(page);
    pagesByDuplicateKey.set(duplicateKey, duplicateSet);
  }

  for (const [duplicateKey, duplicates] of pagesByDuplicateKey) {
    if (duplicates.length < 2) continue;
    const ids = duplicates.flatMap((page) => {
      const id = stringField(page, "id");
      return id ? [id] : [];
    });
    for (const id of ids) {
      issues.push({
        kind: "duplicate-ish-page",
        severity: "warning",
        recordId: id,
        message: `Wiki Page ${id} appears duplicate-ish with slug/title key '${duplicateKey}'.`,
        suggestion: `Compare duplicate-ish pages ${ids.join(", ")} and merge or rename intentionally.`,
        details: { duplicateKey, ids },
      });
    }
  }

  for (const citation of citations) {
    const pageId = stringField(citation, "in");
    const key = stringField(citation, "key") ?? "<unknown>";
    if (!pageId) continue;
    const locatorKind = stringField(citation, "locator_kind");
    const pageRange = citation.page_range;
    const quote = stringField(citation, "quote");
    const context = stringField(citation, "context");
    const claim = stringField(citation, "claim");
    if (!claim || !locatorKind || locatorKind === "whole-document" || (!pageRange && !quote && !context)) {
      issues.push({
        kind: "broad-citation-target",
        severity: "warning",
        recordId: `${pageId}:${key}`,
        message: `Citation ${key} on ${pageId} has missing or broad Source Document locator metadata.`,
        suggestion: `Run citation narrow --page ${pageId} --key ${key} --pages <range> and add --quote or --context when available.`,
        details: { pageId, citationKey: key, locatorKind, pageRange, quote, context, claim },
      });
    }
  }

  for (const projection of projections) {
    const id = stringField(projection, "id") ?? "<unknown-projection>";
    const status = stringField(projection, "projection_status");
    const textHash = stringField(projection, "text_hash");
    if (!textHash) {
      issues.push({
        kind: "source-projection-missing-hash",
        severity: "warning",
        recordId: id,
        message: `Source Text Projection ${id} is missing text_hash.`,
        suggestion: `Rebuild projections with source projections <pdf-path> --source ${stringField(projection, "source_document") ?? "<source-document-id>"}.`,
        details: { projection },
      });
    }
    if (status && status !== "ready") {
      issues.push({
        kind: "source-projection-not-ready",
        severity: "warning",
        recordId: id,
        message: `Source Text Projection ${id} is '${status}', not ready.`,
        suggestion: `Run source diagnostics --source ${stringField(projection, "source_document") ?? "<source-document-id>"} and rebuild projections when extraction is healthy.`,
        details: { projection },
      });
    }
  }

  const filteredIssues = issues.map(enrichGraphLintIssue).filter((issue) => !family || issue.family === family);
  const summary = filteredIssues.reduce<Record<string, number>>((accumulator, issue) => {
    accumulator[issue.kind] = (accumulator[issue.kind] ?? 0) + 1;
    return accumulator;
  }, {});

  return { issueCount: filteredIssues.length, issues: filteredIssues, summary, family };
}

function enrichGraphLintIssue(issue: GraphLintIssue): GraphLintIssue {
  const family = issue.family ?? graphLintIssueFamily(issue.kind);
  return {
    ...issue,
    family,
    reason: issue.reason ?? issue.message,
    suggestedRepair: issue.suggestedRepair ?? issue.suggestion,
    autoFixable: issue.autoFixable ?? graphLintAutoFixable(issue.kind),
    retrievalImpact: issue.retrievalImpact ?? graphLintRetrievalImpact(issue.kind),
  };
}

function graphLintIssueFamily(kind: GraphLintIssue["kind"]): NonNullable<GraphLintIssue["family"]> {
  if (kind.startsWith("source-projection")) return "source";
  if (kind.includes("wiki-page-reference")) return "page-reference";
  if (kind.includes("citation")) return "citation";
  if (kind === "broad-citation-target") return "citation";
  if (kind === "deprecated-manual-link") return "link";
  if (kind === "missing-page-frame" || kind === "missing-frame-metadata") return "page";
  return "page";
}

function graphLintAutoFixable(kind: GraphLintIssue["kind"]): boolean {
  return kind === "source-projection-missing-hash" || kind === "source-projection-not-ready";
}

function graphLintRetrievalImpact(kind: GraphLintIssue["kind"]): "none" | "low" | "medium" | "high" {
  if (kind === "empty-wiki-page" || kind === "source-projection-not-ready") return "high";
  if (kind === "stub-wiki-page" || kind === "broad-citation-target" || kind === "source-projection-missing-hash")
    return "medium";
  if (
    kind === "uncited-wiki-page" ||
    kind === "orphan-page" ||
    kind === "duplicate-ish-page" ||
    kind.includes("wiki-page-reference") ||
    kind === "deprecated-manual-link" ||
    kind === "missing-page-frame" ||
    kind === "missing-frame-metadata"
  )
    return "low";
  return "none";
}

function graphLintKindFromPageReferenceIssue(kind: PageReferenceIssue["kind"]): GraphLintIssue["kind"] {
  if (kind === "malformed-reference") return "malformed-wiki-page-reference";
  if (kind === "duplicate-reference") return "duplicate-wiki-page-reference";
  if (kind === "self-reference") return "self-wiki-page-reference";
  return "unresolved-wiki-page-reference";
}

function groupBy(records: readonly Record<string, unknown>[], key: string): Map<string, Record<string, unknown>[]> {
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const record of records) {
    const value = stringField(record, key);
    if (!value) continue;
    const group = groups.get(value) ?? [];
    group.push(record);
    groups.set(value, group);
  }
  return groups;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

type PageReferenceIssue = {
  readonly kind: "malformed-reference" | "duplicate-reference" | "unresolved-reference" | "self-reference";
  readonly wikiPageId: string;
  readonly message: string;
  readonly action: string;
  readonly target?: string;
  readonly marker?: string;
  readonly index?: number;
  readonly resolvedPageId?: string;
};

type PageReferenceValidation = {
  readonly references: ReturnType<typeof validatePageBodyWikiPageReferences>["references"];
  readonly issues: readonly PageReferenceIssue[];
};

function validateWikiPageReferencesForPage(input: {
  readonly wikiPageId: string;
  readonly title?: string;
  readonly slug?: string;
  readonly pageBody: string;
  readonly knownPages?: readonly Record<string, unknown>[];
}): PageReferenceValidation {
  const validation = validatePageBodyWikiPageReferences({
    wikiPageId: input.wikiPageId,
    pageBody: input.pageBody,
  });
  const issues: PageReferenceIssue[] = validation.issues.map((issue) => ({
    kind: issue.kind,
    wikiPageId: input.wikiPageId,
    marker: issue.marker,
    target: issue.target,
    index: issue.index,
    message: issue.message,
    action: "Use [[Page Title]] or [[Page Title|label]] with one non-empty target per referenced Wiki Page.",
  }));

  for (const reference of validation.references) {
    const resolvedPageId = resolveWikiPageReferenceTarget(reference.target, input.knownPages);
    if (isSelfWikiPageReference(reference.target, input, resolvedPageId)) {
      issues.push({
        kind: "self-reference",
        wikiPageId: input.wikiPageId,
        target: reference.target,
        marker: reference.marker,
        index: reference.index,
        resolvedPageId,
        message: `Wiki Page Reference validation failed for Wiki Page "${input.wikiPageId}": self-reference for marker "${reference.marker}" targeting "${reference.target}". A Wiki Page should not reference itself as navigation.`,
        action: "Remove the self-reference or rewrite the prose without a Wiki Page Reference.",
      });
    } else if (input.knownPages && resolvedPageId === undefined) {
      issues.push({
        kind: "unresolved-reference",
        wikiPageId: input.wikiPageId,
        target: reference.target,
        marker: reference.marker,
        index: reference.index,
        message: `Graph lint page-reference failed for Wiki Page "${input.wikiPageId}": unresolved-reference for Wiki Page Reference "${reference.marker}" targeting "${reference.target}".`,
        action:
          "Create or retitle the target Wiki Page, update the reference target, or remove the inline reference if it is not durable navigation.",
      });
    }
  }

  return { references: validation.references, issues };
}

function resolveWikiPageReferenceTarget(
  target: string,
  knownPages: readonly Record<string, unknown>[] | undefined,
): string | undefined {
  if (!knownPages) return undefined;
  const targetSlug = wikiPageSlugFromTitle(target);
  const targetLower = target.trim().toLowerCase();
  for (const page of knownPages) {
    const id = stringField(page, "id");
    const title = stringField(page, "title");
    const slug = stringField(page, "slug");
    if (id === target) return id;
    if (slug && slug === targetSlug) return id;
    if (title && title.trim().toLowerCase() === targetLower) return id;
  }
  return undefined;
}

function isSelfWikiPageReference(
  target: string,
  page: { readonly wikiPageId: string; readonly title?: string; readonly slug?: string },
  resolvedPageId: string | undefined,
): boolean {
  if (resolvedPageId === page.wikiPageId) return true;
  if (target === page.wikiPageId) return true;
  const targetSlug = wikiPageSlugFromTitle(target);
  if (page.slug && targetSlug === page.slug) return true;
  return page.title !== undefined && target.trim().toLowerCase() === page.title.trim().toLowerCase();
}

async function fetchOllamaEmbedding(
  text: string,
  command: string,
  operation: string,
  argv: readonly string[],
): Promise<
  | { readonly ok: true; readonly embedding: readonly number[]; readonly config: OllamaEmbeddingConfig }
  | { readonly ok: false; readonly failure: CliFailure }
> {
  const config = readOllamaEmbeddingConfig();
  const endpoint = new URL("/api/embeddings", config.url).toString();

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: config.model, prompt: text }),
    });

    if (!response.ok) {
      return {
        ok: false,
        failure: operationFailure(
          command,
          operation,
          argv,
          `Ollama embedding request failed for model '${config.model}' at ${endpoint}: ${response.status} ${response.statusText} ${await response.text()}`.trim(),
          `Start Ollama and pull the embedding model with: ollama pull ${config.model}`,
        ),
      };
    }

    const body = (await response.json()) as { embedding?: unknown; embeddings?: unknown };
    const embedding = parseOllamaEmbedding(body);
    if (!embedding) {
      return {
        ok: false,
        failure: operationFailure(
          command,
          operation,
          argv,
          `Ollama embedding response for model '${config.model}' at ${endpoint} did not include a numeric embedding vector.`,
          "Inspect the Ollama response shape or configure ORIGINIUM_OLLAMA_EMBED_MODEL to a local embedding model.",
        ),
      };
    }

    return { ok: true, embedding, config };
  } catch (error) {
    return {
      ok: false,
      failure: operationFailure(
        command,
        operation,
        argv,
        `Ollama embedding request failed for model '${config.model}' at ${endpoint}: ${errorReason(error)}`,
        `Start Ollama and pull the embedding model with: ollama pull ${config.model}`,
      ),
    };
  }
}

function readOllamaEmbeddingConfig(env: NodeJS.ProcessEnv = process.env): OllamaEmbeddingConfig {
  return {
    url: env.ORIGINIUM_OLLAMA_URL ?? "http://127.0.0.1:11434",
    model: env.ORIGINIUM_OLLAMA_EMBED_MODEL ?? "nomic-embed-text",
  };
}

function parseOllamaEmbedding(body: {
  readonly embedding?: unknown;
  readonly embeddings?: unknown;
}): readonly number[] | undefined {
  if (isNumberVector(body.embedding)) return body.embedding;
  if (Array.isArray(body.embeddings) && isNumberVector(body.embeddings[0])) return body.embeddings[0];
  return undefined;
}

function isNumberVector(value: unknown): value is readonly number[] {
  return Array.isArray(value) && value.length > 0 && value.every((entry) => typeof entry === "number");
}

function retrievalCandidatesFromStatements(
  statements: readonly { readonly result?: unknown }[],
): readonly RetrievalCandidate[] {
  const candidates: RetrievalCandidate[] = [];
  const rows = statements.flatMap((statement) => {
    const statementRows = Array.isArray(statement.result)
      ? statement.result
      : statement.result
        ? [statement.result]
        : [];
    return statementRows.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [entry];
      const record = entry as Record<string, unknown>;
      const nested = [record.wiki, record.evidence].flatMap((value) => (Array.isArray(value) ? value : []));
      return nested.length > 0 ? nested : [entry];
    });
  });

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : "";
    const fetchedSourceDocument =
      record.source_document && typeof record.source_document === "object"
        ? (record.source_document as Record<string, unknown>)
        : undefined;
    const title =
      typeof record.title === "string"
        ? record.title
        : typeof fetchedSourceDocument?.title === "string"
          ? fetchedSourceDocument.title
          : "";
    if (!id || !title) continue;

    if (typeof record.body === "string") {
      candidates.push({
        kind: "wiki_page",
        id,
        title,
        text: `${title}\n${record.body}`,
        embedding: numberVectorField(record, "embedding"),
        citedEvidence: citationEvidence(record.cited_evidence),
        metadata: {
          slug: record.slug,
          aliases: record.aliases,
          scopeNote: record.scope_note,
          pageKind: record.page_kind,
          dbVectorScore: record.db_vector_score,
        },
      });
      continue;
    }

    if (typeof record.text === "string") {
      candidates.push({
        kind: "source_text_projection",
        id,
        title,
        text: `${title}\n${record.text}`,
        embedding: numberVectorField(record, "embedding"),
        citedEvidence: [],
        metadata: {
          sourceDocument: record.source_document,
          startPage: record.start_page,
          endPage: record.end_page,
          textHash: record.text_hash,
          extractionMethod: record.extraction_method,
          projectionVersion: record.projection_version,
          projectionStatus: record.projection_status,
          dbVectorScore: record.db_vector_score,
        },
      });
    }
  }

  return candidates;
}

async function rankRetrievalCandidates(
  candidates: readonly RetrievalCandidate[],
  queryText: string,
  queryEmbedding: readonly number[],
): Promise<readonly RankedRetrievalCandidate[]> {
  const ranked: RankedRetrievalCandidate[] = [];

  for (const candidate of candidates) {
    if (!candidate.embedding) {
      throw new Error(
        `Missing persisted embedding for ${candidate.id}. Run 'originium retrieval embed --target all' before retrieval search.`,
      );
    }

    const lexical = lexicalScore(queryText, candidate.text);
    const vector = cosineSimilarity(queryEmbedding, candidate.embedding);
    const graphAuthority =
      (candidate.kind === "wiki_page" ? 0.35 : -0.05) + Math.min(candidate.citedEvidence.length, 3) * 0.15;
    const score = vector * 0.55 + lexical * 0.3 + graphAuthority;

    ranked.push({
      kind: candidate.kind,
      id: candidate.id,
      title: candidate.title,
      score: Number(score.toFixed(6)),
      signals: {
        lexical: Number(lexical.toFixed(6)),
        vector: Number(vector.toFixed(6)),
        graphAuthority: Number(graphAuthority.toFixed(6)),
      },
      citedEvidence: candidate.citedEvidence,
      metadata: candidate.metadata,
    });
  }

  return ranked.sort((left, right) => right.score - left.score);
}

function citationEvidence(value: unknown): readonly Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry): Record<string, unknown>[] => {
    if (typeof entry === "string") return [{ id: entry }];
    return entry && typeof entry === "object" ? [entry as Record<string, unknown>] : [];
  });
}

function pageCandidateRows(
  statements: readonly { readonly result?: unknown }[],
  queryText: string,
): readonly Record<string, unknown>[] {
  const querySlug = toSlug(queryText);
  return statements.flatMap((statement) => {
    const rows = Array.isArray(statement.result) ? statement.result : [];
    return rows.flatMap((entry): Record<string, unknown>[] => {
      const nestedRows = Array.isArray(entry) ? entry : [entry];
      return nestedRows.flatMap((row): Record<string, unknown>[] => {
        if (!row || typeof row !== "object") return [];
        const record = row as Record<string, unknown>;
        const title = stringField(record, "title") ?? "";
        const slug = stringField(record, "slug") ?? "";
        const body = stringField(record, "body") ?? "";
        const aliases = Array.isArray(record.aliases)
          ? record.aliases.filter((value) => typeof value === "string")
          : [];
        const reasons = [
          slug === querySlug ? "exact slug" : "",
          title.toLowerCase() === queryText.toLowerCase() ? "exact title" : "",
          aliases.some((alias) => alias.toLowerCase() === queryText.toLowerCase()) ? "exact alias" : "",
          title.toLowerCase().includes(queryText.toLowerCase()) ? "title text" : "",
          body.toLowerCase().includes(queryText.toLowerCase()) ? "body text" : "",
        ].filter(Boolean);
        return [
          {
            id: record.id,
            title,
            slug,
            aliases,
            scopeNote: record.scope_note,
            pageKind: record.page_kind,
            snippet: body.slice(0, 320),
            citationCount: Array.isArray(record.cited_evidence) ? record.cited_evidence.length : 0,
            inboundLinkCount: Array.isArray(record.inbound_links) ? record.inbound_links.length : 0,
            outboundLinkCount: Array.isArray(record.outbound_links) ? record.outbound_links.length : 0,
            matchReasons: reasons.length > 0 ? reasons : ["candidate query"],
          },
        ];
      });
    });
  });
}

function embeddingCandidatesFromStatements(statements: readonly { readonly result?: unknown }[]): readonly {
  readonly id: string;
  readonly text: string;
  readonly textHash: string;
  readonly embeddedTextHash?: string;
}[] {
  return statements.flatMap((statement) => {
    if (!Array.isArray(statement.result)) return [];
    return statement.result.flatMap((row) => {
      if (!row || typeof row !== "object") return [];
      const record = row as Record<string, unknown>;
      const id = stringField(record, "id");
      if (!id) return [];
      const text =
        typeof record.body === "string"
          ? `${stringField(record, "title") ?? ""}\n${record.body}`
          : typeof record.text === "string"
            ? record.text
            : "";
      if (!text.trim()) return [];
      return [
        {
          id,
          text,
          textHash: typeof record.text_hash === "string" ? record.text_hash : sha256Hex(text),
          embeddedTextHash: stringField(record, "embedded_text_hash"),
        },
      ];
    });
  });
}

function numberVectorField(record: Record<string, unknown>, key: string): readonly number[] | undefined {
  const value = record[key];
  return isNumberVector(value) ? value : undefined;
}

function resultRowCount(statement: { readonly result?: unknown } | undefined): number {
  if (!statement || !Array.isArray(statement.result)) return 0;
  return statement.result.length;
}

function lexicalScore(queryText: string, candidateText: string): number {
  const queryTokens = tokenSet(queryText);
  if (queryTokens.size === 0) return 0;
  const candidateTokens = tokenSet(candidateText);
  const matches = [...queryTokens].filter((token) => candidateTokens.has(token)).length;
  return matches / queryTokens.size;
}

function tokenSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .filter((token) => token.length > 1),
  );
}

function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  const length = Math.min(left.length, right.length);
  if (length === 0) return 0;

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }

  return leftMagnitude === 0 || rightMagnitude === 0 ? 0 : dot / Math.sqrt(leftMagnitude * rightMagnitude);
}

function startDb(argv: readonly string[], config: SurrealConfig): CliResult {
  const existingPid = readPid(config);
  if (existingPid && isProcessRunning(existingPid)) {
    return success({
      command: "db start",
      operation: "db.start",
      input: argv,
      message: `Managed SurrealDB process is already running with PID ${existingPid}.`,
      data: { pid: existingPid, pidFile: config.pidFile },
    });
  }

  mkdirSync(config.dataDir, { recursive: true });
  mkdirSync(config.bucketDir, { recursive: true });
  mkdirSync(config.pidFile.slice(0, config.pidFile.lastIndexOf("/")), { recursive: true });
  const command = localSurrealStartCommand(config);
  const child = spawn(command.command, command.args, {
    detached: true,
    env: { ...process.env, ...command.env },
    stdio: "ignore",
  });
  child.unref();
  writeFileSync(config.pidFile, String(child.pid));

  return success({
    command: "db start",
    operation: "db.start",
    input: argv,
    message: `Started managed SurrealDB process PID ${child.pid} at ${config.url}.`,
    data: { pid: child.pid, pidFile: config.pidFile, bucketDir: config.bucketDir },
  });
}

function stopDb(argv: readonly string[], config: SurrealConfig): CliResult {
  const pid = readPid(config);
  if (!pid) {
    return operationFailure(
      "db stop",
      "db.stop",
      argv,
      `No managed pid file found at ${config.pidFile}.`,
      "Run db status to inspect the configured external target.",
    );
  }
  if (isProcessRunning(pid)) process.kill(pid, "SIGINT");
  unlinkSync(config.pidFile);
  return success({
    command: "db stop",
    operation: "db.stop",
    input: argv,
    message: `Stopped managed SurrealDB process PID ${pid}.`,
    data: { pid, pidFile: config.pidFile },
  });
}

function readPid(config: SurrealConfig): number | undefined {
  if (!existsSync(config.pidFile)) return undefined;
  const pid = Number.parseInt(readFileSync(config.pidFile, "utf8"), 10);
  return Number.isFinite(pid) ? pid : undefined;
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function success(input: Omit<CliSuccess, "ok">): CliSuccess {
  return { ok: true, ...input };
}

function fromSurrealFailure(
  command: string,
  _argv: readonly string[],
  error: {
    readonly operation: string;
    readonly input: { readonly queryId: string };
    readonly reason: string;
    readonly action: string;
  },
): CliFailure {
  return {
    ok: false,
    command,
    error: {
      kind: "operation_failure",
      operation: error.operation,
      input: error.input.queryId,
      reason: error.reason,
      action: error.action,
    },
  };
}

function usageFailure(input: {
  readonly command: string;
  readonly operation: string;
  readonly input: string;
  readonly reason: string;
  readonly action: string;
}): CliFailure {
  return {
    ok: false,
    command: input.command,
    error: {
      kind: "usage_error",
      operation: input.operation,
      input: input.input,
      reason: input.reason,
      action: input.action,
    },
  };
}

function operationFailure(
  command: string,
  operation: string,
  argv: readonly string[],
  reason: string,
  action: string,
  data?: unknown,
): CliFailure {
  return {
    ok: false,
    command,
    ...(data === undefined ? {} : { data }),
    error: {
      kind: "operation_failure",
      operation,
      input: argv.join(" "),
      reason,
      action,
    },
  };
}

function acceptanceStage(name: string, result: CliResult): AcceptanceStage {
  if (result.ok) {
    return {
      name,
      state: "pass",
      reason: result.message,
      result,
    };
  }

  return {
    name,
    state: isEnvironmentBlocked(result.error.reason) ? "blocked" : "fail",
    reason: result.error.reason,
    result,
  };
}

function blockedStage(name: string, reason: string): AcceptanceStage {
  return {
    name,
    state: "blocked",
    reason,
  };
}

function defaultSourceDocumentId(path: string): string {
  return `source_document:${basename(path)
    .replace(/\.[^.]+$/, "")
    .toLowerCase()}`;
}

function cliSourceOutlineEntry(
  outlineEntry: SourceOutlineEntry,
  sourceDocumentId = outlineEntry.sourceDocumentId,
): Record<string, unknown> {
  return {
    id: outlineEntry.id,
    sourceDocumentId,
    title: outlineEntry.title,
    outlinePath: outlineEntry.outlinePath,
    level: outlineEntry.level,
    startPage: outlineEntry.startPage,
    endPage: outlineEntry.endPage,
    order: outlineEntry.order,
    extractionMethod: outlineEntry.extractionMethod,
  };
}

type PageRange = { readonly start: number; readonly end: number };

function parsePageRangeArgument(argv: readonly string[]): PageRange | CliFailure | undefined {
  const pages = valueAfter(argv, "--pages") ?? valueAfter(argv, "--page-range");
  if (pages) {
    const match = pages.match(/^(\d+)(?:-(\d+))?$/);
    if (!match) {
      return operationFailure(
        argv.slice(0, 2).join(" "),
        `${argv[0]}.${argv[1]}`,
        argv,
        `Invalid page range '${pages}'.`,
        "Pass a page range such as --pages 12-14.",
      );
    }
    const start = Number.parseInt(match[1], 10);
    const end = Number.parseInt(match[2] ?? match[1], 10);
    if (end < start) {
      return operationFailure(
        argv.slice(0, 2).join(" "),
        `${argv[0]}.${argv[1]}`,
        argv,
        `Invalid page range '${pages}' because the end page is before the start page.`,
        "Pass a page range such as --pages 12-14.",
      );
    }
    return { start, end };
  }

  const page = optionalIntegerAfter(argv, "--page");
  if (page !== undefined) return { start: page, end: page };
  const start = optionalIntegerAfter(argv, "--start-page") ?? optionalIntegerAfter(argv, "--from-page");
  const end = optionalIntegerAfter(argv, "--end-page") ?? optionalIntegerAfter(argv, "--to-page") ?? start;
  return start === undefined || end === undefined ? undefined : { start, end };
}

function citationPageRangeFromArgv(argv: readonly string[]): CitationDraft["pageRange"] | Error | undefined {
  const raw = valueAfter(argv, "--pages") ?? valueAfter(argv, "--page-range");
  if (raw) {
    const pageRange = parseCitationPageRange(raw);
    return pageRange ?? new Error(`Invalid page range '${raw}'.`);
  }
  const parsed = parsePageRangeArgument(argv);
  if (!parsed) return undefined;
  if ("ok" in parsed) return new Error(parsed.error.reason);
  return { startPage: parsed.start, endPage: parsed.end };
}

function inferLocatorKind(
  pageRange: CitationDraft["pageRange"] | undefined,
  quote: string | undefined,
  context: string | undefined,
): CitationLocatorKind {
  if (quote || context) return "quote-context";
  if (pageRange) return "page-range";
  return "whole-document";
}

function citationDraftFromInput(input: {
  readonly pageId: string;
  readonly sourceId: string;
  readonly key: string;
  readonly label: string;
  readonly claim: string;
  readonly quote?: string;
  readonly context?: string;
  readonly pageRange?: CitationDraft["pageRange"];
  readonly locationHint?: string;
  readonly projectionId?: string;
  readonly textHash?: string;
  readonly confidence: number;
}): CitationDraft {
  return {
    wikiPageId: input.pageId,
    sourceDocumentId: input.sourceId,
    key: input.key,
    label: input.label,
    claim: input.claim || input.label,
    locatorKind: inferLocatorKind(input.pageRange, input.quote, input.context),
    pageRange: input.pageRange,
    locationHint: input.locationHint,
    quote: input.quote,
    context: input.context,
    projectionId: input.projectionId,
    textHash: input.textHash,
    validationStatus: "validated",
    confidence: input.confidence,
  };
}

function citationSetClause(draft: CitationDraft): string {
  return [
    `key = "${escapeSurrealString(draft.key)}"`,
    `label = "${escapeSurrealString(draft.label)}"`,
    `claim = "${escapeSurrealString(draft.claim)}"`,
    `locator_kind = "${draft.locatorKind}"`,
    `page_range = ${draft.pageRange ? citationPageRangeObject(draft.pageRange) : "NONE"}`,
    `location_hint = ${optionalSurrealString(draft.locationHint)}`,
    `quote = ${optionalSurrealString(draft.quote)}`,
    `context = ${optionalSurrealString(draft.context)}`,
    `projection_id = ${optionalSurrealString(draft.projectionId)}`,
    `text_hash = ${optionalSurrealString(draft.textHash)}`,
    `validation_status = "${draft.validationStatus}"`,
    `confidence = ${draft.confidence}`,
    "created_at = time::now()",
  ].join(", ");
}

function citationDraftToLintRecord(draft: CitationDraft): Record<string, unknown> {
  return {
    key: draft.key,
    label: draft.label,
    claim: draft.claim,
    locator_kind: draft.locatorKind,
    page_range: draft.pageRange,
    location_hint: draft.locationHint,
    quote: draft.quote,
    context: draft.context,
    projection_id: draft.projectionId,
    text_hash: draft.textHash,
    validation_status: draft.validationStatus,
    confidence: draft.confidence,
  };
}

function citationLocatorUpdateClauses(input: {
  readonly pageRange?: CitationDraft["pageRange"];
  readonly quote?: string;
  readonly context?: string;
  readonly locationHint?: string;
  readonly projectionId?: string;
  readonly textHash?: string;
  readonly confidence?: number;
}): readonly string[] {
  const updates: string[] = [];
  if (input.pageRange) {
    updates.push(`page_range = ${citationPageRangeObject(input.pageRange)}`);
    updates.push('locator_kind = "page-range"');
  }
  if (input.quote !== undefined) {
    updates.push(`quote = ${optionalSurrealString(input.quote)}`);
    updates.push('locator_kind = "quote-context"');
  }
  if (input.context !== undefined) {
    updates.push(`context = ${optionalSurrealString(input.context)}`);
    updates.push('locator_kind = "quote-context"');
  }
  if (input.locationHint !== undefined) updates.push(`location_hint = ${optionalSurrealString(input.locationHint)}`);
  if (input.projectionId !== undefined) updates.push(`projection_id = ${optionalSurrealString(input.projectionId)}`);
  if (input.textHash !== undefined) updates.push(`text_hash = ${optionalSurrealString(input.textHash)}`);
  if (input.confidence !== undefined) updates.push(`confidence = ${input.confidence}`);
  updates.push('validation_status = "validated"');
  return updates;
}

function citationPageRangeObject(pageRange: NonNullable<CitationDraft["pageRange"]>): string {
  return `{ start_page: ${pageRange.startPage}, end_page: ${pageRange.endPage}, label: "${formatCitationPageRange(pageRange)}" }`;
}

type MetadataParseResult =
  | {
      readonly ok: true;
      readonly value: Record<string, unknown> | undefined;
      readonly setClause: string;
      readonly data: Record<string, unknown>;
    }
  | { readonly ok: false; readonly failure: CliFailure };

function sourceMetadataFromArgv(argv: readonly string[]): MetadataParseResult {
  const frameMetadata = frameMetadataFromArgv(argv, "source metadata", "source.metadata");
  if (!frameMetadata.ok) return frameMetadata;
  const data: Record<string, unknown> = {};
  const fields: string[] = [];
  for (const [flag, field] of [
    ["--corpus", "corpus"],
    ["--publisher", "publisher"],
    ["--document-class", "document_class"],
    ["--version", "version"],
    ["--publication-date", "publication_date"],
    ["--source-url", "source_uri"],
  ] as const) {
    const value = valueAfter(argv, flag);
    if (value !== undefined) {
      data[field] = value;
      fields.push(`${field} = "${escapeSurrealString(value)}"`);
    }
  }
  for (const [flag, field] of [
    ["--industry", "industries"],
    ["--product-family", "product_families"],
  ] as const) {
    const values = valuesAfter(argv, flag).flatMap(commaList);
    if (values.length > 0) {
      data[field] = values;
      fields.push(`${field} = ${surrealArray(values)}`);
    }
  }
  const trustStatus = valueAfter(argv, "--trust-status");
  if (trustStatus !== undefined) {
    if (!["trusted", "superseded", "draft", "unknown"].includes(trustStatus)) {
      return {
        ok: false,
        failure: operationFailure(
          "source metadata",
          "source.metadata",
          argv,
          `Invalid Source Document trust status "${trustStatus}".`,
          "Use --trust-status trusted, superseded, draft, or unknown.",
        ),
      };
    }
    data.trust_status = trustStatus;
    fields.push(`trust_status = "${trustStatus}"`);
  }
  const frame = valueAfter(argv, "--frame");
  if (frame !== undefined) {
    data.frame = frame;
    fields.push(`frame = ${frameRecordId(frame)}`);
  }
  if (frameMetadata.value !== undefined) {
    data.frame_metadata = frameMetadata.value;
    fields.push(`frame_metadata = ${surrealObject(frameMetadata.value)}`);
  }
  return { ok: true, value: frameMetadata.value, setClause: fields.length === 0 ? "" : `, ${fields.join(", ")}`, data };
}

function frameMetadataFromArgv(
  commandArgv: readonly string[],
  command: string,
  operation: string,
): MetadataParseResult {
  const raw = valueAfter(commandArgv, "--metadata-json") ?? valueAfter(commandArgv, "--frame-metadata-json");
  if (raw === undefined) return { ok: true, value: undefined, setClause: "", data: {} };
  const parsed = parseMetadataJson(raw);
  if (parsed instanceof Error) {
    return {
      ok: false,
      failure: operationFailure(
        command,
        operation,
        commandArgv,
        `Invalid frame metadata JSON: ${parsed.message}.`,
        'Pass a JSON object such as --metadata-json \'{"industries":["mining"]}\'.',
      ),
    };
  }
  return { ok: true, value: parsed, setClause: `, frame_metadata = ${surrealObject(parsed)}`, data: parsed };
}

function frameRecordId(input: string): string {
  return isRecordId(input, "domain_frame") ? input : `domain_frame:${toSurrealIdPart(toSlug(input))}`;
}

function optionalSurrealString(value: string | undefined): string {
  return value === undefined || value.length === 0 ? "NONE" : `"${escapeSurrealString(value)}"`;
}

function isEnvironmentBlocked(reason: string): boolean {
  return /ECONNREFUSED|fetch failed|connection refused|not found|No such file|could not connect|unreachable|Unable to connect/i.test(
    reason,
  );
}

function missingGroupCommand(group: string, argv: readonly string[], action: string): CliFailure {
  return usageFailure({
    command: group,
    operation: `${group}.route`,
    input: argv.join(" "),
    reason: `Missing ${group} command.`,
    action,
  });
}

function missingArgument(command: string, operation: string, argv: readonly string[], argument: string): CliFailure {
  return usageFailure({
    command,
    operation,
    input: argv.join(" "),
    reason: `Missing required argument ${argument}.`,
    action: `Provide ${argument} and retry.`,
  });
}

function unknownCommand(group: string, command: string, argv: readonly string[], action: string): CliFailure {
  return usageFailure({
    command: command ? `${group} ${command}` : group,
    operation: `${group}.route`,
    input: argv.join(" "),
    reason: command ? `Unknown ${group} command '${command}'.` : `Missing ${group} command.`,
    action,
  });
}

function valueAfter(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

function valuesAfter(argv: readonly string[], flag: string): readonly string[] {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag && argv[index + 1] !== undefined) values.push(argv[index + 1]);
  }
  return values;
}

function optionalIntegerAfter(argv: readonly string[], flag: string): number | undefined {
  const value = valueAfter(argv, flag);
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function optionalFloatAfter(argv: readonly string[], flag: string): number | undefined {
  const value = valueAfter(argv, flag);
  if (value === undefined) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function positionalArgs(argv: readonly string[], startIndex: number): readonly string[] {
  const values: string[] = [];
  for (let index = startIndex; index < argv.length; index += 1) {
    const value = argv[index];
    if (value.startsWith("--")) {
      index += 1;
      continue;
    }
    values.push(value);
  }
  return values;
}

function escapeSurrealString(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "\\n");
}

function toSurrealIdPart(input: string): string {
  return input.replace(/-/g, "_");
}

function surrealArray(values: readonly string[]): string {
  return `[${values.map((value) => `"${escapeSurrealString(value)}"`).join(", ")}]`;
}

function surrealObject(value: Record<string, unknown>): string {
  return JSON.stringify(value);
}

function commaList(value: string): readonly string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function surrealNumberArray(values: readonly number[]): string {
  return `[${values.map((value) => String(Number(value.toFixed(10)))).join(", ")}]`;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isRecordId(value: string | undefined, table?: string): value is string {
  if (!value) return false;
  return table ? value.startsWith(`${table}:`) : /^[a-z_]+:[A-Za-z0-9_:-]+$/.test(value);
}

function parseMetadataJson(value: string): Record<string, unknown> | Error {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return new Error("expected a JSON object");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    return new Error(errorReason(error));
  }
}

function validateCitationSourceDocumentTarget(input: {
  readonly command: string;
  readonly operation: string;
  readonly argv: readonly string[];
  readonly pageId: string;
  readonly key: string;
  readonly sourceId: string;
}): CliFailure | undefined {
  if (isRecordId(input.sourceId, "source_document")) return undefined;
  return operationFailure(
    input.command,
    input.operation,
    input.argv,
    `Citation target validation failed for Wiki Page "${input.pageId}", Citation key "${input.key}", invalid target "${input.sourceId}". Citations target Source Documents only.`,
    "Pass --source source_document:<id>. Use inline Wiki Page References such as [[Page Title]] for page-to-page navigation instead of Citation targets.",
    {
      pageId: input.pageId,
      citationKey: input.key,
      invalidTarget: input.sourceId,
      requiredTargetPrefix: "source_document:",
    },
  );
}

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (import.meta.main) {
  const result = await runCli();
  console.log(wantsJson(process.argv.slice(2)) ? JSON.stringify(result, null, 2) : renderCliResult(result));
  process.exitCode = result.ok ? 0 : 1;
}
