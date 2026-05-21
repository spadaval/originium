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

export type WikiPageDraft = {
  readonly title: string;
  readonly slug: string;
  readonly body: string;
  readonly aliases?: readonly string[];
  readonly scopeNote?: string;
  readonly pageKind?: WikiPageKind;
};

export type WikiPageKind = "concept" | "workflow" | "evidence" | "decision" | "question";

export type SourceTextProjectionDraft = {
  readonly sourceDocumentId: string;
  readonly startPage: number;
  readonly endPage: number;
  readonly projectionVersion: string;
};

export type CitationLocatorKind = "whole-document" | "page-range" | "quote-context";

export type CitationPageRange = {
  readonly startPage: number;
  readonly endPage: number;
};

export type CitationValidationStatus = "validated" | "needs-review" | "invalid";

export type CitationDraft = {
  readonly wikiPageId: string;
  readonly sourceDocumentId: string;
  readonly key: string;
  readonly label: string;
  readonly claim: string;
  readonly locatorKind: CitationLocatorKind;
  readonly pageRange?: CitationPageRange;
  readonly locationHint?: string;
  readonly quote?: string;
  readonly context?: string;
  readonly projectionId?: string;
  readonly textHash?: string;
  readonly validationStatus: CitationValidationStatus;
  readonly confidence: number;
};

export type DomainFrameRecordScope = "source_document" | "wiki_page";

export type DomainFrameStatus = "draft" | "reviewed" | "deprecated";

export type MetadataSlotPresence = "required" | "recommended" | "optional";

export type MetadataSlotValueKind = "string" | "string_list" | "date" | "boolean" | "number" | "controlled_string";

export type MetadataSlotDefinition = {
  readonly name: string;
  readonly presence: MetadataSlotPresence;
  readonly valueKind: MetadataSlotValueKind;
  readonly allowedValues?: readonly string[];
};

export type DomainFrameDraft = {
  readonly name: string;
  readonly scopeNote: string;
  readonly recordScope: DomainFrameRecordScope;
  readonly status: DomainFrameStatus;
  readonly slotDefinitions?: readonly MetadataSlotDefinition[];
  readonly createdBy?: string;
  readonly createdSessionId?: string;
  readonly updatedBy?: string;
  readonly updatedSessionId?: string;
  readonly reviewedAt?: string;
  readonly reviewedBy?: string;
};

export type FrameAssignmentStatus = "advisory" | "needs-review" | "reviewed" | "deprecated";

export type FrameMetadata = Readonly<Record<string, unknown>>;

export type FrameMetadataValidationIssueKind =
  | "missing-required-slot"
  | "missing-recommended-slot"
  | "unknown-slot"
  | "invalid-slot-type";

export type FrameMetadataValidationIssue = {
  readonly kind: FrameMetadataValidationIssueKind;
  readonly recordId: string;
  readonly frameId: string;
  readonly slot: string;
  readonly receivedValue?: unknown;
  readonly message: string;
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

export type WikiPageReference = {
  readonly target: string;
  readonly label?: string;
  readonly marker: string;
  readonly index: number;
};

export type WikiPageReferenceIssueKind = "duplicate-reference" | "malformed-reference";

export type WikiPageReferenceIssue = {
  readonly kind: WikiPageReferenceIssueKind;
  readonly wikiPageId: string;
  readonly message: string;
  readonly target?: string;
  readonly marker?: string;
  readonly index?: number;
};

export type WikiPageReferenceValidation = {
  readonly references: readonly WikiPageReference[];
  readonly issues: readonly WikiPageReferenceIssue[];
};

export function toSlug(input: string): string {
  return normalizeRecordIdPart(input);
}

export function sourceDocumentRecordId(draft: SourceDocumentDraft): string {
  const base = normalizeRecordIdPart(draft.title) || filenameSlugFromSourceUri(draft.sourceUri) || "source-document";
  return `source_document:${toSurrealIdPart(`${base}-${shortSha256(draft.sha256)}`)}`;
}

export function wikiPageSlugFromTitle(title: string): string {
  return normalizeRecordIdPart(title);
}

export function wikiPageRecordId(title: string): string {
  return `wiki_page:${toSurrealIdPart(wikiPageSlugFromTitle(title))}`;
}

export function sourceTextProjectionRecordId(draft: SourceTextProjectionDraft): string {
  const documentPart = normalizeRecordIdPart(draft.sourceDocumentId.replace(/^[^:]+:/, ""));
  const versionPart = normalizeRecordIdPart(draft.projectionVersion) || "projection";
  return `source_text_projection:${toSurrealIdPart(
    `${documentPart}-p${draft.startPage}-${draft.endPage}-${versionPart}`,
  )}`;
}

export function formatGraphWikiRecordIdConflict(conflict: GraphWikiRecordIdConflict): string {
  return [
    `Graph Wiki ${conflict.operation} failed for input "${conflict.inputIdentifier}".`,
    `Proposed record ID "${conflict.proposedId}" conflicts with existing record "${conflict.existingRecordId}".`,
    "Use a distinct title, filename, page range, projection version, or slug before retrying.",
  ].join(" ");
}

export function assertGraphWikiRecordIdAvailable(conflict: GraphWikiRecordIdConflict): never {
  throw new GraphWikiRecordIdConflictError(conflict);
}

export function parseCitationPageRange(input: string): CitationPageRange | undefined {
  const match = /^\s*(?:p(?:p)?\.?\s*)?([1-9][0-9]*)(?:\s*-\s*(?:p(?:p)?\.?\s*)?([1-9][0-9]*))?\s*$/.exec(input);

  if (match === null) {
    return undefined;
  }

  const startPage = Number(match[1]);
  const endPage = match[2] === undefined ? startPage : Number(match[2]);
  const pageRange = { startPage, endPage };

  return isValidCitationPageRange(pageRange) ? pageRange : undefined;
}

export function formatCitationPageRange(pageRange: CitationPageRange): string {
  return pageRange.startPage === pageRange.endPage
    ? `p${pageRange.startPage}`
    : `pp${pageRange.startPage}-${pageRange.endPage}`;
}

export function isValidCitationPageRange(pageRange: CitationPageRange): boolean {
  return (
    Number.isInteger(pageRange.startPage) &&
    Number.isInteger(pageRange.endPage) &&
    pageRange.startPage >= 1 &&
    pageRange.endPage >= pageRange.startPage
  );
}

export function validateCitationLocator(
  draft: Pick<CitationDraft, "locatorKind" | "pageRange" | "quote" | "context" | "confidence">,
): readonly string[] {
  const issues: string[] = [];

  if (draft.confidence < 0 || draft.confidence > 1) {
    issues.push(`Citation locator confidence ${draft.confidence} is invalid. Use a number from 0 to 1.`);
  }

  if (draft.pageRange !== undefined && !isValidCitationPageRange(draft.pageRange)) {
    issues.push(
      `Citation locator page range ${draft.pageRange.startPage}-${draft.pageRange.endPage} is invalid. Use positive integer pages with endPage greater than or equal to startPage.`,
    );
  }

  if (draft.locatorKind === "whole-document" && draft.pageRange !== undefined) {
    issues.push(
      "Citation locator kind whole-document must not include a page range. Use page-range when pages are known.",
    );
  }

  if (draft.locatorKind === "page-range" && draft.pageRange === undefined) {
    issues.push("Citation locator kind page-range requires pageRange.");
  }

  if (draft.locatorKind === "quote-context" && draft.quote === undefined && draft.context === undefined) {
    issues.push("Citation locator kind quote-context requires quote or context evidence.");
  }

  return issues;
}

export function validateDomainFrameDraft(draft: DomainFrameDraft): readonly string[] {
  const issues: string[] = [];

  if (!hasAuditActor(draft.createdBy, draft.createdSessionId)) {
    issues.push(
      `Domain Frame "${draft.name}" is missing creation provenance. Set createdBy or createdSessionId before persisting the frame.`,
    );
  }

  if (!hasAuditActor(draft.updatedBy, draft.updatedSessionId)) {
    issues.push(
      `Domain Frame "${draft.name}" is missing update provenance. Set updatedBy or updatedSessionId before persisting the frame.`,
    );
  }

  if (draft.status === "reviewed") {
    if (draft.reviewedBy === undefined || draft.reviewedBy.trim() === "") {
      issues.push(`Domain Frame "${draft.name}" has status reviewed but no reviewedBy value. Record the reviewer.`);
    }

    if (draft.reviewedAt === undefined || Number.isNaN(Date.parse(draft.reviewedAt))) {
      issues.push(
        `Domain Frame "${draft.name}" has status reviewed but reviewedAt is missing or invalid. Use an ISO date-time string.`,
      );
    }
  }

  return issues;
}

export function validateFrameMetadata(input: {
  readonly operation: string;
  readonly recordId: string;
  readonly frameId: string;
  readonly slotDefinitions: readonly MetadataSlotDefinition[];
  readonly metadata?: FrameMetadata;
  readonly reportMissingRecommended?: boolean;
}): readonly FrameMetadataValidationIssue[] {
  const metadata = input.metadata ?? {};
  const issues: FrameMetadataValidationIssue[] = [];
  const slotsByName = new Map(input.slotDefinitions.map((slot) => [slot.name, slot]));

  for (const slot of input.slotDefinitions) {
    if (Object.hasOwn(metadata, slot.name)) {
      continue;
    }

    if (slot.presence === "required" || (slot.presence === "recommended" && input.reportMissingRecommended)) {
      const kind: FrameMetadataValidationIssueKind =
        slot.presence === "required" ? "missing-required-slot" : "missing-recommended-slot";
      issues.push({
        kind,
        recordId: input.recordId,
        frameId: input.frameId,
        slot: slot.name,
        message: `Frame metadata ${input.operation} for record "${input.recordId}" using frame "${input.frameId}" is missing ${slot.presence} slot "${slot.name}". Add the slot when known or leave the sparse assignment with this lint issue visible.`,
      });
    }
  }

  for (const [slotName, receivedValue] of Object.entries(metadata)) {
    const slot = slotsByName.get(slotName);

    if (slot === undefined) {
      issues.push({
        kind: "unknown-slot",
        recordId: input.recordId,
        frameId: input.frameId,
        slot: slotName,
        receivedValue,
        message: `Frame metadata ${input.operation} for record "${input.recordId}" using frame "${input.frameId}" received unknown slot "${slotName}". Define the slot on the Domain Frame, remove the metadata, or keep it as an explicit review issue.`,
      });
      continue;
    }

    if (!isValidFrameMetadataValue(slot, receivedValue)) {
      issues.push({
        kind: "invalid-slot-type",
        recordId: input.recordId,
        frameId: input.frameId,
        slot: slotName,
        receivedValue,
        message: `Frame metadata ${input.operation} for record "${input.recordId}" using frame "${input.frameId}" received invalid value ${formatReceivedValue(
          receivedValue,
        )} for slot "${slotName}". Expected ${describeMetadataSlotValueKind(slot)}.`,
      });
    }
  }

  return issues;
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

export function parseWikiPageReferences(pageBody: string): WikiPageReferenceValidation {
  return validatePageBodyWikiPageReferences({
    wikiPageId: "unknown Wiki Page",
    pageBody,
  });
}

export function validatePageBodyWikiPageReferences(input: {
  readonly wikiPageId: string;
  readonly pageBody: string;
}): WikiPageReferenceValidation {
  const references: WikiPageReference[] = [];
  const issues: WikiPageReferenceIssue[] = [];
  let searchFrom = 0;

  while (searchFrom < input.pageBody.length) {
    const markerStart = input.pageBody.indexOf("[[", searchFrom);

    if (markerStart === -1) {
      break;
    }

    const markerEnd = input.pageBody.indexOf("]]", markerStart + 2);
    const lineEnd = input.pageBody.indexOf("\n", markerStart + 2);
    const hasClosingBrackets = markerEnd !== -1 && (lineEnd === -1 || markerEnd < lineEnd);
    const rawMarker = hasClosingBrackets
      ? input.pageBody.slice(markerStart, markerEnd + 2)
      : input.pageBody.slice(markerStart, lineEnd === -1 ? input.pageBody.length : lineEnd);
    const parsedReference = parseWikiPageReference(rawMarker, markerStart);

    if (parsedReference === undefined) {
      issues.push({
        kind: "malformed-reference",
        wikiPageId: input.wikiPageId,
        marker: rawMarker,
        index: markerStart,
        message: `Wiki Page Reference validation failed for Wiki Page "${input.wikiPageId}": malformed-reference for marker "${rawMarker}". Use "[[Page Title]]" or "[[Page Title|label]]" with non-empty target text and label text.`,
      });
    } else {
      references.push(parsedReference);
    }

    searchFrom = hasClosingBrackets ? markerEnd + 2 : markerStart + 2;
  }

  const seenTargets = new Set<string>();
  for (const reference of references) {
    const targetKey = toSlug(reference.target);
    if (seenTargets.has(targetKey)) {
      issues.push({
        kind: "duplicate-reference",
        wikiPageId: input.wikiPageId,
        target: reference.target,
        marker: reference.marker,
        index: reference.index,
        message: `Wiki Page Reference validation failed for Wiki Page "${input.wikiPageId}": duplicate-reference for target "${reference.target}". Each target should appear once in a Page Body; use one reference with a clear label.`,
      });
    }

    seenTargets.add(targetKey);
  }

  return { references, issues };
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

function hasAuditActor(actor: string | undefined, sessionId: string | undefined): boolean {
  return actor !== undefined && actor.trim() !== "" ? true : sessionId !== undefined && sessionId.trim() !== "";
}

function isValidFrameMetadataValue(slot: MetadataSlotDefinition, value: unknown): boolean {
  switch (slot.valueKind) {
    case "string":
      return typeof value === "string";
    case "string_list":
      return Array.isArray(value) && value.every((item) => typeof item === "string");
    case "date":
      return typeof value === "string" && !Number.isNaN(Date.parse(value));
    case "boolean":
      return typeof value === "boolean";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "controlled_string":
      return (
        typeof value === "string" &&
        (slot.allowedValues === undefined || slot.allowedValues.length === 0 || slot.allowedValues.includes(value))
      );
  }
}

function describeMetadataSlotValueKind(slot: MetadataSlotDefinition): string {
  if (slot.valueKind === "controlled_string" && slot.allowedValues !== undefined && slot.allowedValues.length > 0) {
    return `controlled_string with one of: ${slot.allowedValues.join(", ")}`;
  }

  return slot.valueKind;
}

function formatReceivedValue(value: unknown): string {
  if (typeof value === "string") {
    return `"${value}"`;
  }

  return JSON.stringify(value) ?? String(value);
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

function parseWikiPageReference(rawMarker: string, index: number): WikiPageReference | undefined {
  const match = /^\[\[([^[\]|\r\n]+?)(?:\|([^[\]|\r\n]+))?\]\]$/.exec(rawMarker);

  if (match === null) {
    return undefined;
  }

  const target = match[1].trim();
  const label = match[2]?.trim();
  if (target.length === 0 || label === "") {
    return undefined;
  }

  return {
    target,
    label: label === undefined ? undefined : label,
    marker: rawMarker,
    index,
  };
}
