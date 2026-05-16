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

export function toSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
