import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import {
  listSourceDocuments,
  readSourceDocument,
  readSourceOutline,
  type SourceDocumentRecord,
  type SourceOutlineRecord,
  type WebGraphWikiOperationFailure,
  type WebGraphWikiValidationFailure,
} from "../server/graph-wiki.ts";

type SourcesSearch = {
  readonly sourceDocumentId?: string;
};

type SourcesPageData = {
  readonly documents: readonly SourceDocumentRecord[];
  readonly selectedDocumentId?: string;
  readonly selectedDocument?: SourceDocumentRecord;
  readonly outline: readonly SourceOutlineRecord[];
  readonly listError?: SourceDataError;
  readonly detailError?: SourceDataError;
  readonly outlineError?: SourceDataError;
};

type SourceDataError = WebGraphWikiOperationFailure | WebGraphWikiValidationFailure;

const sourcePdfRoutePrefix = "/sources/pdf";

const getSourcesPageData = createServerFn({ method: "GET" })
  .inputValidator(
    (input: SourcesSearch | undefined): SourcesSearch => ({
      sourceDocumentId:
        typeof input?.sourceDocumentId === "string" && input.sourceDocumentId.length > 0
          ? input.sourceDocumentId
          : undefined,
    }),
  )
  .handler(async ({ data }): Promise<SourcesPageData> => {
    const listResult = await listSourceDocuments();
    if (!listResult.ok) {
      return {
        documents: [],
        outline: [],
        listError: listResult.error,
      };
    }

    const selectedDocumentId = data.sourceDocumentId ?? listResult.data[0]?.id;
    if (!selectedDocumentId) {
      return {
        documents: listResult.data,
        outline: [],
      };
    }

    const selectedFromList = listResult.data.find((document) => document.id === selectedDocumentId);
    const detailResult = selectedFromList ? undefined : await readSourceDocument(selectedDocumentId);
    if (detailResult && !detailResult.ok) {
      return {
        documents: listResult.data,
        selectedDocumentId,
        outline: [],
        detailError: detailResult.error,
      };
    }

    const selectedDocument = selectedFromList ?? detailResult?.data;
    if (!selectedDocument) {
      return {
        documents: listResult.data,
        selectedDocumentId,
        outline: [],
      };
    }

    const outlineResult = await readSourceOutline(selectedDocument.id);
    if (!outlineResult.ok) {
      return {
        documents: listResult.data,
        selectedDocumentId: selectedDocument.id,
        selectedDocument,
        outline: [],
        outlineError: outlineResult.error,
      };
    }

    return {
      documents: listResult.data,
      selectedDocumentId: selectedDocument.id,
      selectedDocument,
      outline: outlineResult.data,
    };
  });

export const Route = createFileRoute("/sources")({
  validateSearch: (search: Record<string, unknown>): SourcesSearch => ({
    sourceDocumentId: typeof search.sourceDocumentId === "string" ? search.sourceDocumentId : undefined,
  }),
  loaderDeps: ({ search }) => ({ sourceDocumentId: search.sourceDocumentId }),
  loader: ({ deps }) => getSourcesPageData({ data: deps }),
  component: SourcesRoute,
  pendingComponent: SourcesPending,
  errorComponent: SourcesError,
});

function SourcesRoute() {
  const data = Route.useLoaderData();
  const selectedDocument = data.selectedDocument;
  const selectedStatus = selectedDocument ? formatStatus(selectedDocument.extraction_status) : "No selection";
  const pdfSrc =
    selectedDocument && isPdfSourceDocument(selectedDocument) ? sourcePdfUrl(selectedDocument.id) : undefined;

  return (
    <section className="route-stack" aria-labelledby="sources-title">
      <header className="page-header">
        <div>
          <p className="eyebrow">Sources</p>
          <h1 id="sources-title">Source Documents</h1>
        </div>
        <div className="header-actions">
          <button type="button" className="button-link secondary" disabled>
            Refresh
          </button>
          <button type="button" className="button-link" disabled>
            Import
          </button>
        </div>
      </header>

      <div className="sources-layout">
        <section className="panel source-list-panel" aria-labelledby="source-list-heading">
          <div className="panel-toolbar">
            <div>
              <h2 id="source-list-heading">Inventory</h2>
              <span className="quiet-label">{formatCount(data.documents.length, "Source Document")}</span>
            </div>
            <label className="search-field">
              <span>Search</span>
              <input type="search" placeholder="Not implemented" disabled />
            </label>
          </div>

          {data.listError ? (
            <SourceDataErrorPanel title="Source Document list failed" error={data.listError} />
          ) : data.documents.length === 0 ? (
            <div className="empty-state compact-empty" role="status">
              <strong>No Source Documents</strong>
              <p>Import a source through the CLI or importer workflow to populate this list.</p>
            </div>
          ) : (
            <ul className="source-list" aria-label="Source Document list">
              {data.documents.map((document) => (
                <li key={document.id}>
                  <Link
                    to="/sources"
                    search={{ sourceDocumentId: document.id }}
                    className={
                      document.id === data.selectedDocumentId ? "source-row source-row-selected" : "source-row"
                    }
                  >
                    <span>
                      <strong>{document.title || document.id}</strong>
                      <small>{sourceRowMeta(document)}</small>
                    </span>
                    <span className={statusClassName(document.extraction_status)}>
                      {formatStatus(document.extraction_status)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel source-detail-panel" aria-labelledby="source-detail-heading">
          <div className="detail-grid">
            <div className="metadata-pane">
              <div className="panel-heading">
                <h2 id="source-detail-heading">Metadata</h2>
                <span className={statusPillClassName(selectedDocument?.extraction_status)}>{selectedStatus}</span>
              </div>

              {data.detailError ? (
                <SourceDataErrorPanel title="Source Document detail failed" error={data.detailError} />
              ) : selectedDocument ? (
                <SourceMetadata document={selectedDocument} outlineCount={data.outline.length} />
              ) : data.selectedDocumentId ? (
                <div className="state-panel slim" role="status">
                  <strong>Source Document not found</strong>
                  <p>{data.selectedDocumentId} was not returned by the Graph Wiki database.</p>
                </div>
              ) : (
                <div className="empty-state inline-empty" role="status">
                  <strong>No Source Document selected</strong>
                  <p>Select a Source Document from the inventory.</p>
                </div>
              )}
            </div>

            <section className="pdf-pane" aria-labelledby="pdf-heading">
              <div className="panel-heading">
                <h2 id="pdf-heading">PDF</h2>
                {pdfSrc ? (
                  <a href={pdfSrc} target="_blank" rel="noreferrer" className="button-link secondary small">
                    Open
                  </a>
                ) : (
                  <button type="button" className="button-link secondary small" disabled>
                    Open
                  </button>
                )}
              </div>
              <SourcePdfPane document={selectedDocument} pdfSrc={pdfSrc} selectedDocumentId={data.selectedDocumentId} />
            </section>

            <section className="headings-pane" aria-labelledby="headings-heading">
              <div className="panel-heading tight">
                <h3 id="headings-heading">Document Outline</h3>
                <span className="quiet-label">{data.outline.length}</span>
              </div>
              {data.outlineError ? (
                <SourceDataErrorPanel title="Document outline failed" error={data.outlineError} />
              ) : data.outline.length > 0 ? (
                <ol className="heading-list">
                  {data.outline.map((entry) => (
                    <li key={entry.id}>
                      <span className="heading-level">P</span>
                      <span>
                        <strong>{outlineTitle(entry)}</strong>
                        <small>{outlineMeta(entry)}</small>
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="empty-state inline-empty" role="status">
                  <strong>No document outline</strong>
                  <p>Outline projection metadata will appear after extraction.</p>
                </div>
              )}
            </section>
          </div>
        </section>
      </div>
    </section>
  );
}

function SourcePdfPane({
  document,
  pdfSrc,
  selectedDocumentId,
}: {
  readonly document?: SourceDocumentRecord;
  readonly pdfSrc?: string;
  readonly selectedDocumentId?: string;
}) {
  if (pdfSrc && document) {
    return (
      <div className="pdf-frame">
        <object
          className="pdf-document-frame"
          data={pdfSrc}
          type="application/pdf"
          aria-label={`${document.title} PDF`}
        >
          <div className="state-panel slim pdf-unavailable-state" role="status">
            <strong>PDF unavailable</strong>
            <p>The backend stream did not return an embeddable PDF for this Source Document.</p>
            <a href={pdfSrc} target="_blank" rel="noreferrer" className="button-link secondary small">
              Open stream response
            </a>
          </div>
        </object>
      </div>
    );
  }

  if (document) {
    return (
      <div className="state-panel slim pdf-state" role="status">
        <strong>No PDF file for this Source Document</strong>
        <p>
          {document.title || document.id} is recorded as{" "}
          {document.kind || document.mime_type || "an unknown source type"}. PDF preview is only available for PDF
          Source Documents.
        </p>
      </div>
    );
  }

  if (selectedDocumentId) {
    return (
      <div className="state-panel slim pdf-state" role="status">
        <strong>PDF unavailable</strong>
        <p>Select a valid PDF Source Document before opening the backend stream.</p>
      </div>
    );
  }

  return (
    <div className="empty-state inline-empty pdf-state" role="status">
      <strong>No Source Document selected</strong>
      <p>Select a PDF Source Document from the inventory to read it here.</p>
    </div>
  );
}

function SourceMetadata({
  document,
  outlineCount,
}: {
  readonly document: SourceDocumentRecord;
  readonly outlineCount: number;
}) {
  const fields = [
    { label: "Record", value: document.id },
    { label: "Kind", value: document.kind || "Unknown" },
    { label: "Corpus", value: document.corpus || "Missing" },
    { label: "Document class", value: document.document_class || "Missing" },
    { label: "Publisher", value: document.publisher || "Missing" },
    {
      label: "Industries",
      value: document.industries?.join(", ") || "Missing",
    },
    {
      label: "Product families",
      value: document.product_families?.join(", ") || "Missing",
    },
    { label: "Trust status", value: document.trust_status || "Missing" },
    { label: "Frame", value: recordLabel(document.frame) || "Missing" },
    { label: "MIME type", value: document.mime_type || "Unknown" },
    {
      label: "Pages",
      value: document.page_count === undefined ? "Unknown" : String(document.page_count),
    },
    { label: "Outline entries", value: String(outlineCount) },
    { label: "SHA-256", value: document.sha256 || "Unknown" },
    { label: "Source URI", value: document.source_uri || "Unknown" },
    { label: "Created", value: formatDate(document.created_at) },
    { label: "Updated", value: formatDate(document.updated_at) },
  ];

  return (
    <dl className="status-list compact source-metadata">
      {fields.map((field) => (
        <div key={field.label}>
          <dt>{field.label}</dt>
          <dd title={field.value}>{field.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SourceDataErrorPanel({ title, error }: { readonly title: string; readonly error: SourceDataError }) {
  return (
    <div className="state-panel error-state slim" role="alert">
      <strong>{title}</strong>
      <p>
        {error.operation}: {error.reason}
      </p>
      <p>{error.action}</p>
    </div>
  );
}

function SourcesPending() {
  return (
    <section className="route-stack" aria-labelledby="sources-pending-title">
      <header className="page-header">
        <div>
          <p className="eyebrow">Sources</p>
          <h1 id="sources-pending-title">Source Documents</h1>
        </div>
      </header>
      <div className="sources-layout">
        <div className="panel">
          <div className="skeleton-line wide" />
          <div className="skeleton-block tall" />
        </div>
        <div className="panel">
          <div className="skeleton-line" />
          <div className="skeleton-block tall" />
        </div>
      </div>
    </section>
  );
}

function SourcesError({ error }: { readonly error: Error }) {
  return (
    <section className="route-stack" aria-labelledby="sources-error-title">
      <header className="page-header">
        <div>
          <p className="eyebrow">Sources</p>
          <h1 id="sources-error-title">Source Documents</h1>
        </div>
      </header>
      <div className="state-panel error-state" role="alert">
        <strong>Sources route failed</strong>
        <p>{error.message}</p>
      </div>
    </section>
  );
}

function sourceRowMeta(document: SourceDocumentRecord): string {
  const pages = document.page_count === undefined ? "unknown pages" : formatCount(document.page_count, "page");
  const updated = document.updated_at ? `updated ${formatDate(document.updated_at)}` : "not timestamped";
  return `${document.corpus || document.document_class || document.kind || "source"} - ${pages} - ${updated}`;
}

function recordLabel(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value && typeof value.id === "string") return value.id;
  return undefined;
}

function outlineMeta(entry: SourceOutlineRecord): string {
  const endPage = entry.end_page && entry.end_page !== entry.start_page ? `-${entry.end_page}` : "";
  const projection = entry.projection_version ?? entry.extraction_method;
  return `Page ${entry.start_page}${endPage} - ${projection}`;
}

function outlineTitle(entry: SourceOutlineRecord): string {
  const endPage = entry.end_page && entry.end_page !== entry.start_page ? `-${entry.end_page}` : "";
  return `Source Text Projection ${entry.start_page}${endPage}`;
}

function formatCount(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function formatStatus(status: string | undefined): string {
  if (!status) return "Unknown";
  return status
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string | undefined): string {
  if (!value) return "Unknown";
  const dateOnly = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  return dateOnly ?? value;
}

function isPdfSourceDocument(document: SourceDocumentRecord): boolean {
  return (
    document.kind.toLowerCase() === "pdf" ||
    document.mime_type.toLowerCase() === "application/pdf" ||
    document.source_uri?.toLowerCase().endsWith(".pdf") === true
  );
}

function sourcePdfUrl(sourceDocumentId: string): string {
  return `${sourcePdfRoutePrefix}/${encodeURIComponent(sourceDocumentId)}`;
}

function statusClassName(status: string | undefined): string {
  return `row-status ${statusTone(status)}`;
}

function statusPillClassName(status: string | undefined): string {
  const tone = statusTone(status);
  return tone === "ok" ? "status-pill" : `status-pill ${tone}`;
}

function statusTone(status: string | undefined): "ok" | "warning" | "neutral" {
  const normalized = status?.toLowerCase() ?? "";
  if (["complete", "completed", "ready", "indexed", "extracted"].includes(normalized)) return "ok";
  if (["failed", "error", "blocked"].includes(normalized)) return "warning";
  return "neutral";
}
