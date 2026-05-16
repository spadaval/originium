import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import {
  listSourceDocuments,
  readSourceDocument,
  readSourceHeadings,
  type SourceDocumentRecord,
  type SourceHeadingRecord,
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
  readonly headings: readonly SourceHeadingRecord[];
  readonly listError?: SourceDataError;
  readonly detailError?: SourceDataError;
  readonly headingsError?: SourceDataError;
};

type SourceDataError = WebGraphWikiOperationFailure | WebGraphWikiValidationFailure;

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
        headings: [],
        listError: listResult.error,
      };
    }

    const selectedDocumentId = data.sourceDocumentId ?? listResult.data[0]?.id;
    if (!selectedDocumentId) {
      return {
        documents: listResult.data,
        headings: [],
      };
    }

    const selectedFromList = listResult.data.find((document) => document.id === selectedDocumentId);
    const detailResult = selectedFromList ? undefined : await readSourceDocument(selectedDocumentId);
    if (detailResult && !detailResult.ok) {
      return {
        documents: listResult.data,
        selectedDocumentId,
        headings: [],
        detailError: detailResult.error,
      };
    }

    const selectedDocument = selectedFromList ?? detailResult?.data;
    if (!selectedDocument) {
      return {
        documents: listResult.data,
        selectedDocumentId,
        headings: [],
      };
    }

    const headingsResult = await readSourceHeadings(selectedDocument.id);
    if (!headingsResult.ok) {
      return {
        documents: listResult.data,
        selectedDocumentId: selectedDocument.id,
        selectedDocument,
        headings: [],
        headingsError: headingsResult.error,
      };
    }

    return {
      documents: listResult.data,
      selectedDocumentId: selectedDocument.id,
      selectedDocument,
      headings: headingsResult.data,
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
                <SourceMetadata document={selectedDocument} headingCount={data.headings.length} />
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

              <section className="headings-pane" aria-labelledby="headings-heading">
                <div className="panel-heading tight">
                  <h3 id="headings-heading">Source Headings</h3>
                  <span className="quiet-label">{data.headings.length}</span>
                </div>
                {data.headingsError ? (
                  <SourceDataErrorPanel title="Source Headings failed" error={data.headingsError} />
                ) : data.headings.length > 0 ? (
                  <ol className="heading-list">
                    {data.headings.map((heading) => (
                      <li key={heading.id}>
                        <span className="heading-level">H{heading.level}</span>
                        <span>
                          <strong>{heading.title}</strong>
                          <small>{headingMeta(heading)}</small>
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="empty-state inline-empty" role="status">
                    <strong>No Source Headings</strong>
                    <p>Heading anchors will appear after extraction.</p>
                  </div>
                )}
              </section>
            </div>

            <section className="pdf-pane" aria-labelledby="pdf-heading">
              <div className="panel-heading">
                <h2 id="pdf-heading">PDF</h2>
                <button type="button" className="button-link secondary small" disabled>
                  Open
                </button>
              </div>
              <div className="pdf-frame" role="img" aria-label="PDF lane placeholder">
                <div className="pdf-page-skeleton">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
              <div className="state-panel slim" role="status">
                <strong>PDF viewer pending</strong>
                <p>PDF embedding is owned by the next Source Document Page slice.</p>
              </div>
            </section>
          </div>
        </section>
      </div>
    </section>
  );
}

function SourceMetadata({
  document,
  headingCount,
}: {
  readonly document: SourceDocumentRecord;
  readonly headingCount: number;
}) {
  const fields = [
    { label: "Record", value: document.id },
    { label: "Kind", value: document.kind || "Unknown" },
    { label: "MIME type", value: document.mime_type || "Unknown" },
    { label: "Pages", value: document.page_count === undefined ? "Unknown" : String(document.page_count) },
    { label: "Source Headings", value: String(headingCount) },
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
  return `${document.kind || "source"} - ${pages} - ${updated}`;
}

function headingMeta(heading: SourceHeadingRecord): string {
  const endPage = heading.end_page && heading.end_page !== heading.start_page ? `-${heading.end_page}` : "";
  const path = heading.heading_path.length > 1 ? heading.heading_path.join(" / ") : heading.extraction_method;
  return `Page ${heading.start_page}${endPage} - ${path}`;
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
