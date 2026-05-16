import { createFileRoute } from "@tanstack/react-router";

const sourceRows = [
  { name: "Imported documents", value: "Waiting for backend projection" },
  { name: "Extraction status", value: "Not connected" },
  { name: "PDF route", value: "/sources/pdf" },
] as const;

export const Route = createFileRoute("/sources")({
  component: SourcesRoute,
});

function SourcesRoute() {
  return (
    <section className="route-stack" aria-labelledby="sources-title">
      <header className="page-header">
        <div>
          <p className="eyebrow">Sources</p>
          <h1 id="sources-title">Source document review</h1>
        </div>
        <span className="status-pill">Shell only</span>
      </header>

      <div className="sources-layout">
        <section className="panel" aria-labelledby="source-list-heading">
          <div className="panel-heading">
            <h2 id="source-list-heading">Documents</h2>
            <span className="quiet-label">Inventory</span>
          </div>
          <dl className="status-list">
            {sourceRows.map((row) => (
              <div key={row.name}>
                <dt>{row.name}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="panel reader-panel" aria-labelledby="reader-heading">
          <div className="panel-heading">
            <h2 id="reader-heading">Reader</h2>
            <span className="quiet-label">Native PDF lane</span>
          </div>
          <div className="empty-state">
            <strong>No source selected</strong>
            <p>PDF embedding waits for the backend streaming route and source document projection.</p>
          </div>
        </section>
      </div>
    </section>
  );
}
