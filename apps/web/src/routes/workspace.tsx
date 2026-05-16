import { createFileRoute } from "@tanstack/react-router";

const activityItems = [
  { label: "Agent session", value: "No active session" },
  { label: "Current page", value: "Select a Wiki Page" },
  { label: "Graph focus", value: "Projection pending" },
] as const;

export const Route = createFileRoute("/workspace")({
  component: WorkspaceRoute,
});

function WorkspaceRoute() {
  return (
    <section className="route-stack" aria-labelledby="workspace-title">
      <header className="page-header">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1 id="workspace-title">Agent workbench</h1>
        </div>
        <span className="status-pill">Backend pending</span>
      </header>

      <div className="workspace-layout">
        <section className="panel conversation-panel" aria-labelledby="session-heading">
          <div className="panel-heading">
            <h2 id="session-heading">Session</h2>
            <span className="quiet-label">Codex app-server</span>
          </div>
          <div className="empty-state">
            <strong>No active agent session</strong>
            <p>Session creation and streaming activity will attach here after the backend runtime slice lands.</p>
          </div>
        </section>

        <section className="panel context-panel" aria-labelledby="context-heading">
          <div className="panel-heading">
            <h2 id="context-heading">Context</h2>
            <span className="quiet-label">Graph Wiki</span>
          </div>
          <dl className="status-list">
            {activityItems.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </section>
  );
}
