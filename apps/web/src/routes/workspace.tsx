import { createFileRoute } from "@tanstack/react-router";

const activityItems = [
  { time: "--:--", label: "Session idle", detail: "No Agent Session selected." },
  { time: "--:--", label: "Activity stream idle", detail: "Agent Activity records are not connected." },
  { time: "--:--", label: "Change Log idle", detail: "No Graph Wiki mutations in scope." },
] as const;

const pageRecords = [
  { label: "Wiki Page", value: "No page selected" },
  { label: "Page Body", value: "Empty" },
  { label: "Citations", value: "0" },
] as const;

export const Route = createFileRoute("/workspace")({
  component: WorkspaceRoute,
  pendingComponent: WorkspacePending,
  errorComponent: WorkspaceError,
});

function WorkspaceRoute() {
  return (
    <section className="route-stack" aria-labelledby="workspace-title">
      <header className="page-header">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1 id="workspace-title">Agent Session</h1>
        </div>
        <div className="header-actions">
          <button type="button" className="button-link secondary" disabled>
            Resume
          </button>
          <button type="button" className="button-link" disabled>
            New session
          </button>
        </div>
      </header>

      <div className="workspace-layout">
        <section className="panel conversation-panel" aria-labelledby="session-heading" aria-busy="false">
          <div className="panel-toolbar">
            <div>
              <h2 id="session-heading">Chat</h2>
              <span className="quiet-label">Codex app-server disconnected</span>
            </div>
            <span className="status-pill warning">Idle</span>
          </div>

          <div className="empty-state compact-empty">
            <strong>No Agent Session</strong>
            <p>Select or create a session when the backend connection is available.</p>
          </div>

          <form className="composer" aria-label="Session message composer">
            <label htmlFor="session-message">Message</label>
            <textarea id="session-message" placeholder="Backend connection required" disabled />
            <div className="composer-actions">
              <button type="button" className="button-link secondary" disabled>
                Attach page
              </button>
              <button type="submit" className="button-link" disabled>
                Send
              </button>
            </div>
          </form>

          <section className="activity-region" aria-labelledby="activity-heading">
            <div className="panel-heading tight">
              <h3 id="activity-heading">Activity</h3>
              <span className="quiet-label">0 records</span>
            </div>
            <ol className="activity-list">
              {activityItems.map((item) => (
                <li key={item.label}>
                  <time>{item.time}</time>
                  <div>
                    <strong>{item.label}</strong>
                    <span>{item.detail}</span>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </section>

        <section className="panel context-panel" aria-labelledby="graph-heading">
          <div className="tabbar" role="tablist" aria-label="Workspace projection">
            <button type="button" role="tab" aria-selected="true" className="tab-button active">
              Graph
            </button>
            <button type="button" role="tab" aria-selected="false" className="tab-button">
              Wiki Page
            </button>
          </div>

          <section className="graph-placeholder" aria-labelledby="graph-heading">
            <div className="panel-heading">
              <h2 id="graph-heading">Graph focus</h2>
              <span className="quiet-label">No projection</span>
            </div>
            <div className="graph-canvas" role="img" aria-label="Empty graph projection">
              <span className="graph-node primary" />
              <span className="graph-node" />
              <span className="graph-node muted" />
              <span className="graph-edge edge-a" />
              <span className="graph-edge edge-b" />
            </div>
            <div className="empty-state inline-empty">
              <strong>No Wiki Page selected</strong>
              <p>Graph projection will render when a page or Source Heading is in focus.</p>
            </div>
          </section>

          <section className="page-placeholder" aria-labelledby="page-heading">
            <div className="panel-heading">
              <h2 id="page-heading">Page record</h2>
              <button type="button" className="button-link secondary small" disabled>
                Save
              </button>
            </div>
            <dl className="status-list compact">
              {pageRecords.map((item) => (
                <div key={item.label}>
                  <dt>{item.label}</dt>
                  <dd>{item.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <div className="state-panel error-state slim" role="status">
            <strong>Backend not connected</strong>
            <p>Graph Wiki reads are waiting on the server data functions.</p>
          </div>
        </section>
      </div>
    </section>
  );
}

function WorkspacePending() {
  return (
    <section className="route-stack" aria-labelledby="workspace-pending-title">
      <header className="page-header">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1 id="workspace-pending-title">Agent Session</h1>
        </div>
      </header>
      <div className="workspace-layout">
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

function WorkspaceError() {
  return (
    <section className="route-stack" aria-labelledby="workspace-error-title">
      <header className="page-header">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1 id="workspace-error-title">Agent Session</h1>
        </div>
      </header>
      <div className="state-panel error-state" role="alert">
        <strong>Workspace route failed</strong>
        <p>Reload /workspace. If it fails again, inspect the Vite server log for the route render error.</p>
      </div>
    </section>
  );
}
