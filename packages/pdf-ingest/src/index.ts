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
