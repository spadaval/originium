import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { basename } from "node:path";
import type { SourceDocumentDraft } from "@originium/domain";

export type PdfImportRequest = {
  readonly path: string;
  readonly title: string;
  readonly sha256: string;
  readonly pageCount?: number;
};

export function createPdfSourceDocumentDraft(request: PdfImportRequest): SourceDocumentDraft {
  return {
    title: request.title,
    kind: "pdf",
    sha256: request.sha256,
    mimeType: "application/pdf",
    sourceUri: request.path,
    pageCount: request.pageCount,
  };
}

export type PdfMetadata = {
  readonly title: string;
  readonly pageCount: number;
};

export type PdfToolFailure = {
  readonly operation: string;
  readonly input: string;
  readonly reason: string;
  readonly action: string;
};

export type SourceHeadingProjection = {
  readonly id: string;
  readonly sourceDocumentId: string;
  readonly title: string;
  readonly headingPath: readonly string[];
  readonly level: number;
  readonly startPage: number;
  readonly endPage?: number;
  readonly order: number;
  readonly extractionMethod: "outline" | "table-of-contents" | "heading-detection" | "synthetic";
};

export type IngestionChunkProjection = {
  readonly sourceDocumentId: string;
  readonly headingId: string;
  readonly pageRange: {
    readonly start: number;
    readonly end: number;
  };
  readonly tokenEstimate: number;
  readonly extractionMethod: SourceHeadingProjection["extractionMethod"];
  readonly text: string;
};

export type SourceTextProvenance = {
  readonly extractionMethod: "pdftotext-page-projection";
  readonly tool: "pdftotext";
  readonly toolVersion?: string;
  readonly lossy: true;
  readonly checksumSha256: string;
};

export type SourceTextProjection = {
  readonly sourceDocumentId: string;
  readonly pageRange: {
    readonly start: number;
    readonly end: number;
  };
  readonly tokenEstimate: number;
  readonly text: string;
  readonly provenance: SourceTextProvenance;
  readonly warning: string;
};

export type SourceTextSearchHit = {
  readonly sourceDocumentId: string;
  readonly pageRange: {
    readonly start: number;
    readonly end: number;
  };
  readonly snippet: string;
  readonly nearestHeading?: SourceHeadingProjection;
  readonly provenance: SourceTextProvenance;
  readonly warning: string;
};

export function parsePdfInfo(output: string): PdfMetadata {
  const title = output.match(/^Title:\s*(.+)$/m)?.[1]?.trim();
  const pages = output.match(/^Pages:\s*(\d+)$/m)?.[1];

  if (!pages) {
    throw new Error("operation=pdf.metadata input=pdfinfo reason=missing Pages field action=verify pdfinfo output");
  }

  return {
    title: title && title.length > 0 ? title : "Untitled PDF",
    pageCount: Number.parseInt(pages, 10),
  };
}

export function readPdfMetadata(path: string): PdfMetadata {
  try {
    return parsePdfInfo(execFileSync("pdfinfo", [path], { encoding: "utf8" }));
  } catch (error) {
    throw toolFailure("pdf.metadata", path, error, "Install poppler pdfinfo and verify the PDF path is readable.");
  }
}

export async function createPdfSourceDocumentDraftFromFile(path: string): Promise<SourceDocumentDraft> {
  const [bytes, metadata] = await Promise.all([Bun.file(path).arrayBuffer(), Promise.resolve(readPdfMetadata(path))]);
  const sha256 = createHash("sha256").update(Buffer.from(bytes)).digest("hex");

  return createPdfSourceDocumentDraft({
    path,
    title: metadata.title === "Untitled PDF" ? basename(path) : metadata.title,
    sha256,
    pageCount: metadata.pageCount,
  });
}

export function parseTableOfContentsHeadings(
  sourceDocumentId: string,
  contentsText: string,
): readonly SourceHeadingProjection[] {
  const lines = contentsText.split(/\r?\n/);
  const headings: SourceHeadingProjection[] = [];

  for (const line of lines) {
    const match = line.match(/^(.+?)\s+(?:\.\s*){2,}(\d+)\s*$/);
    if (!match) continue;

    const title = match[1].trim().replace(/\s+/g, " ");
    if (!title || title.toLowerCase() === "contents") continue;

    const startPage = Number.parseInt(match[2], 10);
    const level = title.startsWith("Chapter ") ? 1 : 2;
    const headingPath = level === 1 ? [title] : [nearestChapterTitle(headings), title].filter(Boolean);
    const order = headings.length + 1;

    headings.push({
      id: sourceHeadingId(sourceDocumentId, headingPath, startPage, order),
      sourceDocumentId,
      title,
      headingPath,
      level,
      startPage,
      order,
      extractionMethod: "table-of-contents",
    });
  }

  return headings.map((heading, index) => {
    const next = headings[index + 1];
    return next && next.startPage > heading.startPage ? { ...heading, endPage: next.startPage } : heading;
  });
}

export function extractPdfHeadings(path: string, sourceDocumentId: string): readonly SourceHeadingProjection[] {
  const metadata = readPdfMetadata(path);
  const maxTocPage = Math.min(metadata.pageCount, 12);

  try {
    const contentsText = execFileSync("pdftotext", ["-f", "1", "-l", String(maxTocPage), path, "-"], {
      encoding: "utf8",
    });
    const headings = parseTableOfContentsHeadings(sourceDocumentId, contentsText);
    if (headings.length > 0) return headings;

    return [
      {
        id: sourceHeadingId(sourceDocumentId, [metadata.title], 1, 1),
        sourceDocumentId,
        title: metadata.title,
        headingPath: [metadata.title],
        level: 1,
        startPage: 1,
        endPage: metadata.pageCount,
        order: 1,
        extractionMethod: "synthetic",
      },
    ];
  } catch (error) {
    throw toolFailure("pdf.headings", path, error, "Install poppler pdftotext and verify the PDF is extractable.");
  }
}

export function projectPdfChunk(
  path: string,
  heading: SourceHeadingProjection,
  options: { readonly maxTokens?: number } = {},
): IngestionChunkProjection {
  const maxTokens = options.maxTokens ?? 100_000;
  const endPage = heading.endPage ?? heading.startPage;

  try {
    const text = execFileSync("pdftotext", ["-f", String(heading.startPage), "-l", String(endPage), path, "-"], {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    }).trim();
    const tokenEstimate = estimateTokens(text);
    const boundedText = tokenEstimate > maxTokens ? trimToEstimatedTokens(text, maxTokens) : text;

    return {
      sourceDocumentId: heading.sourceDocumentId,
      headingId: heading.id,
      pageRange: { start: heading.startPage, end: endPage },
      tokenEstimate: Math.min(tokenEstimate, maxTokens),
      extractionMethod: heading.extractionMethod,
      text: boundedText,
    };
  } catch (error) {
    throw toolFailure(
      "pdf.chunk",
      `${path}#${heading.id}`,
      error,
      "Verify pdftotext can read the requested page range.",
    );
  }
}

export function projectPdfText(
  path: string,
  options: {
    readonly sourceDocumentId: string;
    readonly pageRange: { readonly start: number; readonly end: number };
    readonly maxTokens?: number;
  },
): SourceTextProjection {
  const pageRange = normalizePageRange(options.pageRange);
  const text = readPdfText(path, pageRange, "pdf.source-text.read").trim();
  const tokenEstimate = estimateTokens(text);
  const maxTokens = options.maxTokens ?? 4_000;
  const boundedText = tokenEstimate > maxTokens ? trimToEstimatedTokens(text, maxTokens) : text;

  return {
    sourceDocumentId: options.sourceDocumentId,
    pageRange,
    tokenEstimate: Math.min(tokenEstimate, maxTokens),
    text: boundedText,
    provenance: sourceTextProvenance(boundedText),
    warning: sourceTextProjectionWarning,
  };
}

export function searchPdfText(
  path: string,
  headings: readonly SourceHeadingProjection[],
  query: string,
  options: {
    readonly sourceDocumentId: string;
    readonly pageRange?: { readonly start: number; readonly end: number };
    readonly limit?: number;
    readonly snippetCharacters?: number;
  },
): readonly SourceTextSearchHit[] {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];

  const metadata = readPdfMetadata(path);
  const limit = options.limit ?? 10;
  const snippetCharacters = options.snippetCharacters ?? 280;
  const pageRange = normalizePageRange(options.pageRange ?? { start: 1, end: metadata.pageCount });
  const hits: SourceTextSearchHit[] = [];

  for (let page = pageRange.start; page <= pageRange.end && hits.length < limit; page += 1) {
    const pageText = readPdfText(path, { start: page, end: page }, "pdf.source-text.search").trim();
    const matchIndex = pageText.toLowerCase().indexOf(normalizedQuery.toLowerCase());
    if (matchIndex === -1) continue;

    hits.push({
      sourceDocumentId: options.sourceDocumentId,
      pageRange: { start: page, end: page },
      snippet: snippetAround(pageText, matchIndex, normalizedQuery.length, snippetCharacters),
      nearestHeading: nearestHeadingForPage(headings, page),
      provenance: sourceTextProvenance(pageText),
      warning: sourceTextProjectionWarning,
    });
  }

  return hits;
}

export function estimateTokens(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(words * 1.35);
}

export function nearestHeadingForPage(
  headings: readonly SourceHeadingProjection[],
  page: number,
): SourceHeadingProjection | undefined {
  return headings
    .filter((heading) => heading.startPage <= page && (heading.endPage === undefined || heading.endPage >= page))
    .sort((left, right) => right.startPage - left.startPage || right.order - left.order)[0];
}

function nearestChapterTitle(headings: readonly SourceHeadingProjection[]): string {
  return [...headings].reverse().find((heading) => heading.level === 1)?.title ?? "";
}

function sourceHeadingId(
  sourceDocumentId: string,
  headingPath: readonly string[],
  startPage: number,
  order: number,
): string {
  const suffix = headingPath
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);

  return `source_heading:${sourceDocumentId.replace(/^source_document:/, "")}_${order}_${startPage}_${suffix}`;
}

function trimToEstimatedTokens(text: string, maxTokens: number): string {
  const maxWords = Math.floor(maxTokens / 1.35);
  return text.split(/\s+/).slice(0, maxWords).join(" ");
}

const sourceTextProjectionWarning =
  "Lossy source text projection from PDF extraction; use the original Source Document for canonical wording, tables, figures, and layout.";

function readPdfText(
  path: string,
  pageRange: { readonly start: number; readonly end: number },
  operation: string,
): string {
  try {
    return execFileSync("pdftotext", ["-f", String(pageRange.start), "-l", String(pageRange.end), path, "-"], {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch (error) {
    throw toolFailure(
      operation,
      `${path}#p${pageRange.start}-${pageRange.end}`,
      error,
      "Verify pdftotext can read the requested page range.",
    );
  }
}

function normalizePageRange(pageRange: { readonly start: number; readonly end: number }): {
  readonly start: number;
  readonly end: number;
} {
  if (
    !Number.isInteger(pageRange.start) ||
    !Number.isInteger(pageRange.end) ||
    pageRange.start < 1 ||
    pageRange.end < pageRange.start
  ) {
    throw new Error(
      `operation=pdf.source-text.page-range input=${pageRange.start}-${pageRange.end} reason=invalid page range action=pass a page range such as --pages 12-14`,
    );
  }
  return pageRange;
}

function snippetAround(text: string, matchIndex: number, queryLength: number, snippetCharacters: number): string {
  const halfWindow = Math.floor(Math.max(snippetCharacters, queryLength) / 2);
  const start = Math.max(0, matchIndex - halfWindow);
  const end = Math.min(text.length, matchIndex + queryLength + halfWindow);
  return `${start > 0 ? "... " : ""}${text.slice(start, end).replace(/\s+/g, " ").trim()}${end < text.length ? " ..." : ""}`;
}

function sourceTextProvenance(text: string): SourceTextProvenance {
  return {
    extractionMethod: "pdftotext-page-projection",
    tool: "pdftotext",
    toolVersion: pdfTextToolVersion(),
    lossy: true,
    checksumSha256: createHash("sha256").update(text).digest("hex"),
  };
}

let cachedPdfTextToolVersion: string | undefined;

function pdfTextToolVersion(): string | undefined {
  if (cachedPdfTextToolVersion !== undefined) return cachedPdfTextToolVersion;
  try {
    const output = execFileSync("pdftotext", ["-v"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    cachedPdfTextToolVersion = output.trim().split(/\r?\n/)[0] || undefined;
  } catch (error) {
    const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
    cachedPdfTextToolVersion = message || undefined;
  }
  return cachedPdfTextToolVersion;
}

function toolFailure(operation: string, input: string, error: unknown, action: string): Error {
  const reason = error instanceof Error ? error.message.split("\n")[0] : String(error);
  return new Error(`operation=${operation} input=${input} reason=${reason} action=${action}`);
}
