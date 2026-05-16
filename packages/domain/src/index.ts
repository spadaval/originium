import { createHash } from "node:crypto";

export type SourceDocumentKind = "pdf" | "web";

export type SourceDocumentDraft = {
  readonly title: string;
  readonly kind: SourceDocumentKind;
  readonly sha256: string;
  readonly mimeType: string;
  readonly sourceUri?: string;
  readonly pageCount?: number;
};

export type SourceHeadingDraft = {
  readonly sourceDocumentId: string;
  readonly title: string;
  readonly headingPath: readonly string[];
  readonly level: number;
  readonly startPage: number;
  readonly endPage?: number;
  readonly order: number;
  readonly extractionMethod: "outline" | "table-of-contents" | "heading-detection" | "synthetic";
};

export type WikiPageDraft = {
  readonly title: string;
  readonly slug: string;
  readonly body: string;
};

export type CitationDraft = {
  readonly wikiPageId: string;
  readonly sourceHeadingId: string;
  readonly key: string;
  readonly label: string;
  readonly quote?: string;
};

export type GraphWikiRecordIdConflict = {
  readonly operation: string;
  readonly inputIdentifier: string;
  readonly proposedId: string;
  readonly existingRecordId: string;
};

export class GraphWikiRecordIdConflictError extends Error {
  readonly operation: string;
  readonly inputIdentifier: string;
  readonly proposedId: string;
  readonly existingRecordId: string;

  constructor(conflict: GraphWikiRecordIdConflict) {
    super(formatGraphWikiRecordIdConflict(conflict));
    this.name = "GraphWikiRecordIdConflictError";
    this.operation = conflict.operation;
    this.inputIdentifier = conflict.inputIdentifier;
    this.proposedId = conflict.proposedId;
    this.existingRecordId = conflict.existingRecordId;
  }
}

export type CitationMarker = {
  readonly key: string;
  readonly label?: string;
  readonly marker: string;
  readonly index: number;
};

export type CitationValidationIssueKind =
  | "duplicate-marker"
  | "missing-graph-citation"
  | "unused-graph-citation"
  | "invalid-marker-syntax";

export type CitationValidationIssue = {
  readonly kind: CitationValidationIssueKind;
  readonly wikiPageId: string;
  readonly message: string;
  readonly citationMarkerKey?: string;
  readonly graphCitationKey?: string;
  readonly marker?: string;
  readonly index?: number;
};

export type CitationMarkerValidation = {
  readonly markers: readonly CitationMarker[];
  readonly issues: readonly CitationValidationIssue[];
};

export function toSlug(input: string): string {
  return normalizeRecordIdPart(input);
}

export function sourceDocumentRecordId(draft: SourceDocumentDraft): string {
  const base = normalizeRecordIdPart(draft.title) || filenameSlugFromSourceUri(draft.sourceUri) || "source-document";
  return `source_document:${toSurrealIdPart(`${base}-${shortSha256(draft.sha256)}`)}`;
}

export function sourceHeadingRecordId(draft: SourceHeadingDraft): string {
  const documentPart = toSurrealIdPart(normalizeRecordIdPart(draft.sourceDocumentId.replace(/^[^:]+:/, "")));
  const headingPart = draft.headingPath
    .map((part) => normalizeRecordIdPart(part))
    .filter(Boolean)
    .join("-");
  const titlePart = normalizeRecordIdPart(draft.title);
  const anchorPart = headingPart || titlePart || "source-heading";
  const pagePart = draft.endPage === undefined ? `p${draft.startPage}` : `p${draft.startPage}-${draft.endPage}`;

  return `source_heading:${toSurrealIdPart(`${documentPart}-${anchorPart}-${pagePart}-o${draft.order}`)}`;
}

export function wikiPageSlugFromTitle(title: string): string {
  return normalizeRecordIdPart(title);
}

export function wikiPageRecordId(title: string): string {
  return `wiki_page:${toSurrealIdPart(wikiPageSlugFromTitle(title))}`;
}

export function formatGraphWikiRecordIdConflict(conflict: GraphWikiRecordIdConflict): string {
  return [
    `Graph Wiki ${conflict.operation} failed for input "${conflict.inputIdentifier}".`,
    `Proposed record ID "${conflict.proposedId}" conflicts with existing record "${conflict.existingRecordId}".`,
    "Use a distinct title, filename, heading path, or slug before retrying.",
  ].join(" ");
}

export function assertGraphWikiRecordIdAvailable(conflict: GraphWikiRecordIdConflict): never {
  throw new GraphWikiRecordIdConflictError(conflict);
}

export function parseCitationMarkers(pageBody: string): CitationMarkerValidation {
  return validatePageBodyCitationMarkers({
    wikiPageId: "unknown Wiki Page",
    pageBody,
    graphCitationKeys: [],
    allowMissingGraphCitations: true,
  });
}

export function validatePageBodyCitationMarkers(input: {
  readonly wikiPageId: string;
  readonly pageBody: string;
  readonly graphCitationKeys: readonly string[];
  readonly allowMissingGraphCitations?: boolean;
}): CitationMarkerValidation {
  const markers: CitationMarker[] = [];
  const issues: CitationValidationIssue[] = [];
  let searchFrom = 0;

  while (searchFrom < input.pageBody.length) {
    const markerStart = input.pageBody.indexOf("[^", searchFrom);

    if (markerStart === -1) {
      break;
    }

    const markerEnd = input.pageBody.indexOf("]", markerStart + 2);
    const lineEnd = input.pageBody.indexOf("\n", markerStart + 2);
    const hasClosingBracket = markerEnd !== -1 && (lineEnd === -1 || markerEnd < lineEnd);
    const rawMarker = hasClosingBracket
      ? input.pageBody.slice(markerStart, markerEnd + 1)
      : input.pageBody.slice(markerStart, lineEnd === -1 ? input.pageBody.length : lineEnd);
    const parsedMarker = parseCitationMarker(rawMarker, markerStart);

    if (parsedMarker === undefined) {
      issues.push({
        kind: "invalid-marker-syntax",
        wikiPageId: input.wikiPageId,
        marker: rawMarker,
        index: markerStart,
        message: `Citation validation failed for Wiki Page "${input.wikiPageId}": invalid-marker-syntax for Citation Marker "${rawMarker}". Use "[^key]" or "[^key|label]" with lowercase key characters a-z, 0-9, "_" or "-".`,
      });
    } else {
      markers.push(parsedMarker);
    }

    searchFrom = hasClosingBracket ? markerEnd + 1 : markerStart + 2;
  }

  const markerKeys = new Set<string>();
  const graphCitationKeys = new Set(input.graphCitationKeys);

  for (const marker of markers) {
    if (markerKeys.has(marker.key)) {
      issues.push({
        kind: "duplicate-marker",
        wikiPageId: input.wikiPageId,
        citationMarkerKey: marker.key,
        graphCitationKey: marker.key,
        marker: marker.marker,
        index: marker.index,
        message: `Citation validation failed for Wiki Page "${input.wikiPageId}": duplicate-marker for Citation Marker key "${marker.key}" and graph Citation key "${marker.key}". Each Citation Marker key may appear once in a Page Body.`,
      });
    }

    markerKeys.add(marker.key);

    if (!input.allowMissingGraphCitations && !graphCitationKeys.has(marker.key)) {
      issues.push({
        kind: "missing-graph-citation",
        wikiPageId: input.wikiPageId,
        citationMarkerKey: marker.key,
        graphCitationKey: "<missing>",
        marker: marker.marker,
        index: marker.index,
        message: `Citation validation failed for Wiki Page "${input.wikiPageId}": missing-graph-citation for Citation Marker key "${marker.key}" and graph Citation key "<missing>". Add a Citation graph relation for this marker key or remove the marker.`,
      });
    }
  }

  for (const graphCitationKey of graphCitationKeys) {
    if (!markerKeys.has(graphCitationKey)) {
      issues.push({
        kind: "unused-graph-citation",
        wikiPageId: input.wikiPageId,
        citationMarkerKey: "<missing>",
        graphCitationKey,
        message: `Citation validation failed for Wiki Page "${input.wikiPageId}": unused-graph-citation for Citation Marker key "<missing>" and graph Citation key "${graphCitationKey}". Add a matching Citation Marker to the Page Body or remove the unused Citation graph relation.`,
      });
    }
  }

  return { markers, issues };
}

function normalizeRecordIdPart(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toSurrealIdPart(input: string): string {
  return input.replace(/-/g, "_");
}

function filenameSlugFromSourceUri(sourceUri: string | undefined): string {
  if (sourceUri === undefined) {
    return "";
  }

  const path = sourceUri.split(/[?#]/, 1)[0] ?? "";
  const filename = path.split("/").filter(Boolean).at(-1) ?? "";
  const extensionless = filename.replace(/\.[^.]+$/, "");

  return normalizeRecordIdPart(extensionless);
}

function shortSha256(input: string): string {
  const normalized = input.trim().toLowerCase();

  if (/^[a-f0-9]{64}$/.test(normalized)) {
    return normalized.slice(0, 12);
  }

  return createHash("sha256").update(input).digest("hex").slice(0, 12);
}

function parseCitationMarker(rawMarker: string, index: number): CitationMarker | undefined {
  const match = /^\[\^([a-z0-9][a-z0-9_-]*)(?:\|([^|\]\r\n]+))?\]$/.exec(rawMarker);

  if (match === null) {
    return undefined;
  }

  const label = match[2]?.trim();

  return {
    key: match[1],
    label: label === undefined || label === "" ? undefined : label,
    marker: rawMarker,
    index,
  };
}
