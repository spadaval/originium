import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: OverviewRoute,
});

function OverviewRoute() {
  return (
    <section className="route-stack" aria-labelledby="overview-title">
      <header className="page-header">
        <div>
          <p className="eyebrow">Overview</p>
          <h1 id="overview-title">Graph Wiki operations</h1>
        </div>
        <span className="status-pill neutral">Shell ready</span>
      </header>

      <div className="overview-actions">
        <section className="panel action-panel">
          <div>
            <h2>Agent Workspace</h2>
            <p>Session, activity, Wiki Page, and graph lanes.</p>
          </div>
          <Link to="/workspace" className="button-link">
            Open workspace
          </Link>
        </section>
        <section className="panel action-panel">
          <div>
            <h2>Source Documents</h2>
            <p>Inventory, Document Outline, metadata, and PDF lane.</p>
          </div>
          <Link to="/sources" className="button-link secondary">
            View sources
          </Link>
        </section>
      </div>

      <section className="panel system-panel" aria-labelledby="system-heading">
        <div className="panel-heading">
          <h2 id="system-heading">Runtime lanes</h2>
          <span className="quiet-label">Local app</span>
        </div>
        <dl className="status-list compact">
          <div>
            <dt>Workspace route</dt>
            <dd>
              <span className="state-dot idle" aria-hidden="true" /> Waiting for Agent Session backend.
            </dd>
          </div>
          <div>
            <dt>Sources route</dt>
            <dd>
              <span className="state-dot idle" aria-hidden="true" /> Waiting for Source Document data.
            </dd>
          </div>
          <div>
            <dt>API health</dt>
            <dd>
              <span className="state-dot ok" aria-hidden="true" /> Available at /api/health.
            </dd>
          </div>
        </dl>
      </section>
    </section>
  );
}
