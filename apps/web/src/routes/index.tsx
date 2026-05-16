import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: OverviewRoute,
});

function OverviewRoute() {
  return (
    <section className="route-stack" aria-labelledby="overview-title">
      <header className="page-header">
        <div>
          <p className="eyebrow">Web shell</p>
          <h1 id="overview-title">Originium workspace</h1>
        </div>
        <span className="status-pill">Scaffold</span>
      </header>

      <div className="overview-grid">
        <section className="panel">
          <h2>Session surface</h2>
          <p>
            Open the agent workspace route for the first split view: session activity, page context, and graph
            placeholders.
          </p>
          <Link to="/workspace" className="button-link">
            Open workspace
          </Link>
        </section>
        <section className="panel">
          <h2>Source review</h2>
          <p>
            Open the source route for imported document inventory, extraction status, and the future PDF reading lane.
          </p>
          <Link to="/sources" className="button-link secondary">
            View sources
          </Link>
        </section>
      </div>

      <section className="panel wide-panel">
        <h2>Host boundary</h2>
        <dl className="boundary-list">
          <div>
            <dt>Browser</dt>
            <dd>Talks to the Originium web backend served by this app.</dd>
          </div>
          <div>
            <dt>Backend</dt>
            <dd>Owns SurrealDB, Codex app-server, CLI, and source PDF access.</dd>
          </div>
          <div>
            <dt>Routes</dt>
            <dd>Workspace and source shells are ready for the next backend slices.</dd>
          </div>
        </dl>
      </section>
    </section>
  );
}
