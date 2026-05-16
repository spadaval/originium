import { constants, createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { basename, relative, resolve, sep } from "node:path";
import { toSlug } from "@originium/domain";
import {
  describeSurrealTarget,
  executeSurrealQuery,
  type SafeSurrealTarget,
  type SurrealFetch,
  sourceDocumentBucketSurql,
} from "@originium/surreal";
import type { SourcePdfServingConfig, WebRuntimeConfig } from "../config.ts";

export type SourcePdfFailure = {
  readonly kind: "operation_failure";
  readonly operation: "web.source_pdf.stream";
  readonly target?: SafeSurrealTarget;
  readonly input: {
    readonly sourceDocumentId: string;
  };
  readonly reason: string;
  readonly action: string;
};

export type SourcePdfDependencies = {
  readonly access?: (path: string, mode?: number) => Promise<void>;
  readonly fetch?: SurrealFetch;
  readonly openReadStream?: (path: string) => BodyInit;
  readonly stat?: (path: string) => Promise<{ readonly isDirectory: () => boolean; readonly isFile: () => boolean }>;
};

type SourceDocumentFile = {
  readonly bucket?: unknown;
  readonly key?: unknown;
  readonly pointer?: unknown;
};

type SourceDocumentRecord = {
  readonly id?: unknown;
  readonly title?: unknown;
  readonly kind?: unknown;
  readonly mime_type?: unknown;
  readonly file?: unknown;
};

export async function streamSourcePdfResponse(
  sourceDocumentId: string,
  config: WebRuntimeConfig,
  dependencies: SourcePdfDependencies = {},
): Promise<Response> {
  const result = await resolveSourcePdf(sourceDocumentId, config, dependencies);
  if (!result.ok) return sourcePdfErrorResponse(result.error);

  return new Response(result.body, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `inline; filename="${result.filename}"`,
      "Content-Type": "application/pdf",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function resolveSourcePdf(
  sourceDocumentId: string,
  config: WebRuntimeConfig,
  dependencies: SourcePdfDependencies,
): Promise<
  | {
      readonly ok: true;
      readonly body: BodyInit;
      readonly filename: string;
    }
  | {
      readonly ok: false;
      readonly error: SourcePdfFailure;
    }
> {
  const operation = "web.source_pdf.stream";
  const target = describeSurrealTarget(config.surreal);
  const input = { sourceDocumentId };

  if (!config.sourcePdf.enabled) {
    return failure({
      input,
      reason: "backend PDF serving is disabled by ORIGINIUM_WEB_SOURCE_PDFS_ENABLED",
      action: "Set ORIGINIUM_WEB_SOURCE_PDFS_ENABLED=true when this host must stream Source Document PDFs.",
    });
  }

  const bucketCheck = await checkBucketConfig(config.sourcePdf, dependencies);
  if (!bucketCheck.ok) {
    return failure({
      input,
      reason: bucketCheck.reason,
      action: bucketCheck.action,
    });
  }

  const queryResult = await executeSurrealQuery(
    config.surreal,
    `${sourceDocumentBucketSurql(config.surreal)}\nSELECT id, title, kind, mime_type, file FROM ${recordId(sourceDocumentId)};`,
    {
      fetch: dependencies.fetch,
      queryId: `${operation}:${sourceDocumentId}`,
    },
  );
  if (!queryResult.ok) {
    return failure({
      target,
      input,
      reason: redactBucketPath(queryResult.error.reason, config),
      action:
        "Read Source Document metadata from the Graph Wiki database and verify the Source Document ID, SurrealDB connection, and file bucket definition.",
    });
  }

  const source = firstRow<SourceDocumentRecord>(queryResult.result);
  if (!source) {
    return failure({
      target,
      input,
      reason: `Source Document ${sourceDocumentId} does not exist; SELECT returned no source_document record.`,
      action: "Import the PDF Source Document first, or pass an existing source_document record ID.",
    });
  }

  if (source.kind !== "pdf" || source.mime_type !== "application/pdf") {
    return failure({
      target,
      input,
      reason: `Source Document ${sourceDocumentId} is not a PDF; kind=${String(source.kind)} mime_type=${String(source.mime_type)}.`,
      action: "Open only PDF Source Documents through this endpoint, or import this source as a PDF first.",
    });
  }

  const file = source.file && typeof source.file === "object" ? (source.file as SourceDocumentFile) : undefined;
  if (!file || file.bucket !== config.sourcePdf.bucketName || typeof file.key !== "string") {
    return failure({
      target,
      input,
      reason: `Source Document ${sourceDocumentId} has no usable ${config.sourcePdf.bucketName} file key.`,
      action: "Re-import the PDF Source Document so its file bucket metadata includes bucket and key.",
    });
  }

  const bucketPath = bucketFilePath(config.sourcePdf.bucketDir, file.key);
  if (!bucketPath) {
    return failure({
      target,
      input,
      reason: `Source Document ${sourceDocumentId} has a file key that resolves outside the configured bucket.`,
      action: "Re-import the PDF Source Document so its file key is relative to the source PDF bucket.",
    });
  }

  const fileCheck = await checkBucketFile(bucketPath, dependencies);
  if (!fileCheck.ok) {
    return failure({
      target,
      input,
      reason: fileCheck.reason,
      action: "Restore the imported PDF in the configured source PDF bucket, or re-import the Source Document.",
    });
  }

  return {
    ok: true,
    body: (dependencies.openReadStream ?? defaultOpenReadStream)(bucketPath),
    filename: responseFilename(source.title, file.key),
  };
}

async function checkBucketConfig(
  config: SourcePdfServingConfig,
  dependencies: SourcePdfDependencies,
): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string; readonly action: string }> {
  const statImpl = dependencies.stat ?? stat;
  const accessImpl = dependencies.access ?? access;

  try {
    const bucketStat = await statImpl(config.bucketDir);
    if (!bucketStat.isDirectory()) {
      return {
        ok: false,
        reason: "configured source PDF bucket path is not a directory",
        action:
          "Create a directory for ORIGINIUM_WEB_SOURCE_PDF_BUCKET_DIR or point it at the SurrealDB file bucket directory.",
      };
    }
    await accessImpl(config.bucketDir, constants.R_OK);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: `configured source PDF bucket is not readable: ${boundedFileReason(error)}`,
      action:
        "Create the source PDF bucket directory and grant the web process read access, or set ORIGINIUM_WEB_SOURCE_PDF_BUCKET_DIR to the correct bucket path.",
    };
  }
}

async function checkBucketFile(
  path: string,
  dependencies: SourcePdfDependencies,
): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }> {
  const statImpl = dependencies.stat ?? stat;
  const accessImpl = dependencies.access ?? access;

  try {
    const fileStat = await statImpl(path);
    if (!fileStat.isFile()) {
      return { ok: false, reason: "source PDF bucket entry exists but is not a file" };
    }
    await accessImpl(path, constants.R_OK);
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: `source PDF bucket file is not readable: ${boundedFileReason(error)}` };
  }
}

function sourcePdfErrorResponse(error: SourcePdfFailure): Response {
  return Response.json(
    {
      error,
    },
    {
      status: statusForFailure(error.reason),
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

function statusForFailure(reason: string): number {
  if (reason.includes("does not exist")) return 404;
  if (reason.includes("not a PDF")) return 415;
  if (reason.includes("disabled") || reason.includes("configured source PDF bucket")) return 503;
  if (reason.includes("bucket file") || reason.includes("file key")) return 404;
  return 500;
}

function failure(input: {
  readonly target?: SafeSurrealTarget;
  readonly input: { readonly sourceDocumentId: string };
  readonly reason: string;
  readonly action: string;
}): { readonly ok: false; readonly error: SourcePdfFailure } {
  return {
    ok: false,
    error: {
      kind: "operation_failure",
      operation: "web.source_pdf.stream",
      target: input.target,
      input: input.input,
      reason: input.reason,
      action: input.action,
    },
  };
}

function bucketFilePath(bucketDir: string, key: string): string | undefined {
  const relativeKey = key.replace(/^\/+/, "");
  const path = resolve(bucketDir, relativeKey);
  const bucketRelativePath = relative(resolve(bucketDir), path);
  if (bucketRelativePath === "" || bucketRelativePath.startsWith("..") || bucketRelativePath.startsWith(sep)) {
    return undefined;
  }
  return path;
}

function responseFilename(title: unknown, key: string): string {
  const base = typeof title === "string" && title.trim() ? title : basename(key);
  const filename = base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
  return filename.replace(/["\\\r\n]/g, "_");
}

function defaultOpenReadStream(path: string): BodyInit {
  return createReadStream(path) as unknown as BodyInit;
}

function recordId(value: string): string {
  if (value.includes(":")) return value;
  return `source_document:${toSlug(value).replace(/-/g, "_")}`;
}

function firstRow<T>(result: unknown): T | undefined {
  if (!Array.isArray(result)) return undefined;
  for (let index = result.length - 1; index >= 0; index -= 1) {
    const statement = result[index];
    if (!statement || typeof statement !== "object" || !("result" in statement)) continue;
    const rows = statement.result;
    if (Array.isArray(rows)) return rows[0] as T | undefined;
  }
  return undefined;
}

function redactBucketPath(reason: string, config: WebRuntimeConfig): string {
  return [config.sourcePdf.bucketDir, config.surreal.bucketDir]
    .filter(Boolean)
    .reduce((redacted, path) => redacted.replaceAll(path, "[bucket-dir]"), reason);
}

function errorReason(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function boundedFileReason(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return errorReason(error).split(",")[0] ?? "filesystem operation failed";
}
