import { createFileRoute } from "@tanstack/react-router";

const sourceRows = [
  { name: "No Source Documents", meta: "Inventory empty", status: "Idle" },
  { name: "Source Headings", meta: "0 anchors", status: "Waiting" },
  { name: "PDF lane", meta: "No file selected", status: "Offline" },
] as const;

const selectedSourceFields = [
  { label: "Source Document", value: "None selected" },
  { label: "Source Headings", value: "0" },
  { label: "Extraction", value: "Not connected" },
  { label: "PDF stream", value: "Unavailable" },
] as const;

export const Route = createFileRoute("/sources")({
  component: SourcesRoute,
  pendingComponent: SourcesPending,
  errorComponent: SourcesError,
});

function SourcesRoute() {
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
              <span className="quiet-label">0 Source Documents</span>
            </div>
            <label className="search-field">
              <span>Search</span>
              <input type="search" placeholder="Backend required" disabled />
            </label>
          </div>

          <ul className="source-list" aria-label="Source Document list">
            {sourceRows.map((row) => (
              <li key={row.name}>
                <button type="button" className="source-row" disabled>
                  <span>
                    <strong>{row.name}</strong>
                    <small>{row.meta}</small>
                  </span>
                  <span className="row-status">{row.status}</span>
                </button>
              </li>
            ))}
          </ul>

          <div className="state-panel slim" role="status">
            <strong>No imported sources</strong>
            <p>The inventory will populate from Source Document records.</p>
          </div>
        </section>

        <section className="panel source-detail-panel" aria-labelledby="source-detail-heading">
          <div className="detail-grid">
            <div className="metadata-pane">
              <div className="panel-heading">
                <h2 id="source-detail-heading">Metadata</h2>
                <span className="status-pill warning">No selection</span>
              </div>
              <dl className="status-list compact">
                {selectedSourceFields.map((field) => (
                  <div key={field.label}>
                    <dt>{field.label}</dt>
                    <dd>{field.value}</dd>
                  </div>
                ))}
              </dl>

              <section className="headings-pane" aria-labelledby="headings-heading">
                <div className="panel-heading tight">
                  <h3 id="headings-heading">Source Headings</h3>
                  <span className="quiet-label">0</span>
                </div>
                <div className="empty-state inline-empty">
                  <strong>No Source Headings</strong>
                  <p>Heading anchors will appear after extraction.</p>
                </div>
              </section>
            </div>

            <section className="pdf-pane" aria-labelledby="pdf-heading">
              <div className="panel-heading">
                <h2 id="pdf-heading">PDF</h2>
                <button type="button" className="button-link secondary small" disabled>
                  Open
                </button>
              </div>
              <div className="pdf-frame" role="img" aria-label="PDF lane empty state">
                <div className="pdf-page-skeleton">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
              <div className="state-panel error-state slim" role="status">
                <strong>PDF stream unavailable</strong>
                <p>Select a Source Document after the backend PDF endpoint is connected.</p>
              </div>
            </section>
          </div>
        </section>
      </div>
    </section>
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

function SourcesError() {
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
        <p>Reload /sources. If it fails again, inspect the Vite server log for the route render error.</p>
      </div>
    </section>
  );
}
