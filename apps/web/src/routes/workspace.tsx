import { validatePageBodyCitationMarkers } from "@originium/domain";
import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { type CSSProperties, type FormEvent, useEffect, useState, useTransition } from "react";
import {
  type GraphNeighborhoodData,
  type GraphNeighborhoodEdge,
  type GraphNeighborhoodNode,
  listWikiPages,
  readGraphNeighborhood,
  readWikiPage,
  saveWikiPageBody,
  type WebGraphWikiOperationFailure,
  type WebGraphWikiValidationFailure,
  type WikiPageRecord,
} from "../server/graph-wiki.ts";

type WorkspaceSearch = {
  readonly recordId?: string;
  readonly tab?: "graph" | "page";
};

type WorkspacePageData = {
  readonly pages: readonly WikiPageRecord[];
  readonly selectedRecordId?: string;
  readonly graph?: GraphNeighborhoodData;
  readonly page?: WorkspaceWikiPage;
  readonly pageValidation?: PageCitationValidation;
  readonly listError?: WorkspaceDataError;
  readonly graphError?: WorkspaceDataError;
  readonly pageError?: WorkspaceDataError;
};

type WorkspaceDataError = WebGraphWikiOperationFailure | WebGraphWikiValidationFailure;
type PageCitationValidation = ReturnType<typeof validatePageBodyCitationMarkers>;

type WorkspaceCitationRecord = {
  readonly key: string;
  readonly label?: string;
  readonly quote?: string;
};

type WorkspaceWikiPage = WikiPageRecord & {
  readonly citations: readonly WorkspaceCitationRecord[];
};

type SavePageBodyInput = {
  readonly pageId: string;
  readonly body: string;
};

type SavePageBodyResult =
  | {
      readonly ok: true;
      readonly changed: boolean;
      readonly validation: PageCitationValidation;
      readonly beforeLength: number;
      readonly afterLength: number;
    }
  | {
      readonly ok: false;
      readonly error: WorkspaceDataError;
    };

const graphLimit = 9;

const graphPositions = [
  { x: 50, y: 18 },
  { x: 18, y: 42 },
  { x: 50, y: 42 },
  { x: 82, y: 42 },
  { x: 18, y: 70 },
  { x: 50, y: 70 },
  { x: 82, y: 70 },
  { x: 34, y: 88 },
  { x: 66, y: 88 },
] as const;

const getWorkspacePageData = createServerFn({ method: "GET" })
  .inputValidator(
    (input: WorkspaceSearch | undefined): WorkspaceSearch => ({
      recordId: typeof input?.recordId === "string" && input.recordId.length > 0 ? input.recordId : undefined,
      tab: input?.tab === "page" ? "page" : "graph",
    }),
  )
  .handler(async ({ data }): Promise<WorkspacePageData> => {
    const listResult = await listWikiPages();
    if (!listResult.ok) {
      return {
        pages: [],
        listError: listResult.error,
      };
    }

    const selectedRecordId = data.recordId ?? listResult.data[0]?.id;
    if (!selectedRecordId) {
      return {
        pages: listResult.data,
      };
    }

    const graphResult = await readGraphNeighborhood({ recordId: selectedRecordId, limit: graphLimit });
    if (!graphResult.ok) {
      return {
        pages: listResult.data,
        selectedRecordId,
        graphError: graphResult.error,
      };
    }

    const selectedNode = graphResult.data.nodes.find((node) => node.selected);
    if (selectedNode?.kind !== "wiki_page") {
      return {
        pages: listResult.data,
        selectedRecordId,
        graph: graphResult.data,
      };
    }

    const pageResult = await readWikiPage({ pageId: selectedNode.id });
    if (!pageResult.ok) {
      return {
        pages: listResult.data,
        selectedRecordId,
        graph: graphResult.data,
        pageError: pageResult.error,
      };
    }

    const page =
      pageResult.data === undefined
        ? undefined
        : {
            id: pageResult.data.id,
            title: pageResult.data.title,
            slug: pageResult.data.slug,
            body: pageResult.data.body,
            created_at: pageResult.data.created_at,
            updated_at: pageResult.data.updated_at,
            citations: pageResult.data.citations.map((citation) => ({
              key: citation.key,
              label: citation.label,
              quote: citation.quote,
            })),
          };
    const pageValidation =
      page === undefined
        ? undefined
        : validatePageBodyCitationMarkers({
            wikiPageId: page.id,
            pageBody: page.body,
            graphCitationKeys: page.citations.map((citation) => citation.key),
          });

    return {
      pages: listResult.data,
      selectedRecordId,
      graph: graphResult.data,
      page,
      pageValidation,
    };
  });

const savePageBody = createServerFn({ method: "POST" })
  .inputValidator((input: unknown): SavePageBodyInput => {
    const candidate = input && typeof input === "object" ? (input as Partial<SavePageBodyInput>) : {};
    const pageId = typeof candidate.pageId === "string" ? candidate.pageId.trim() : "";
    return {
      pageId,
      body: typeof candidate.body === "string" ? candidate.body : "",
    };
  })
  .handler(async ({ data }): Promise<SavePageBodyResult> => {
    const result = await saveWikiPageBody({ pageId: data.pageId, body: data.body });
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      changed: result.data.changed,
      validation: result.data.citationValidation,
      beforeLength: result.data.beforeLength,
      afterLength: result.data.afterLength,
    };
  });

const activityItems = [
  { time: "--:--", label: "Session idle", detail: "No Agent Session selected." },
  { time: "--:--", label: "Activity stream idle", detail: "Agent Activity records are not connected." },
  { time: "--:--", label: "Change Log idle", detail: "No Graph Wiki mutations in scope." },
] as const;

export const Route = createFileRoute("/workspace")({
  validateSearch: (search: Record<string, unknown>): WorkspaceSearch => ({
    recordId: typeof search.recordId === "string" ? search.recordId : undefined,
    tab: search.tab === "page" ? "page" : "graph",
  }),
  loaderDeps: ({ search }) => ({ recordId: search.recordId, tab: search.tab }),
  loader: ({ deps }) => getWorkspacePageData({ data: deps }),
  component: WorkspaceRoute,
  pendingComponent: WorkspacePending,
  errorComponent: WorkspaceError,
});

function WorkspaceRoute() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const activeTab = search.tab ?? "graph";
  const selectedNode = data.graph?.nodes.find((node) => node.selected);

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
            <Link
              to="/workspace"
              search={{ recordId: data.selectedRecordId, tab: "graph" }}
              role="tab"
              aria-selected={activeTab === "graph"}
              className={activeTab === "graph" ? "tab-button active" : "tab-button"}
            >
              Graph
            </Link>
            <Link
              to="/workspace"
              search={{ recordId: data.selectedRecordId, tab: "page" }}
              role="tab"
              aria-selected={activeTab === "page"}
              className={activeTab === "page" ? "tab-button active" : "tab-button"}
            >
              Wiki Page
            </Link>
          </div>

          {activeTab === "graph" ? (
            <GraphTab data={data} selectedNode={selectedNode} />
          ) : (
            <PageTab
              page={data.page}
              pageError={data.pageError}
              pageValidation={data.pageValidation}
              selectedNode={selectedNode}
              selectedRecordId={data.selectedRecordId}
            />
          )}

          {data.graphError ? (
            <WorkspaceDataErrorPanel title="Graph neighborhood failed" error={data.graphError} />
          ) : null}
        </section>
      </div>
    </section>
  );
}

function GraphTab({
  data,
  selectedNode,
}: {
  readonly data: WorkspacePageData;
  readonly selectedNode?: GraphNeighborhoodNode;
}) {
  return (
    <section className="graph-region" aria-labelledby="graph-heading">
      <div className="panel-heading">
        <div>
          <h2 id="graph-heading">Graph focus</h2>
          <span className="quiet-label">{selectedNode ? nodeMeta(selectedNode) : "No projection"}</span>
        </div>
        <span className="status-pill neutral">{data.graph ? boundedCount(data.graph) : "Read only"}</span>
      </div>

      <WikiPageFocusList pages={data.pages} selectedRecordId={data.selectedRecordId} listError={data.listError} />

      {data.graph ? (
        data.graph.nodes.length > 0 ? (
          <>
            <GraphCanvas graph={data.graph} />
            <GraphEdgeList graph={data.graph} />
          </>
        ) : (
          <div className="empty-state inline-empty" role="status">
            <strong>No graph records</strong>
            <p>{data.selectedRecordId} returned no Wiki Page or Source Heading node.</p>
          </div>
        )
      ) : data.listError || data.graphError ? null : (
        <div className="empty-state inline-empty" role="status">
          <strong>No Wiki Pages</strong>
          <p>Create or import Graph Wiki records before opening a graph neighborhood.</p>
        </div>
      )}
    </section>
  );
}

function WikiPageFocusList({
  pages,
  selectedRecordId,
  listError,
}: {
  readonly pages: readonly WikiPageRecord[];
  readonly selectedRecordId?: string;
  readonly listError?: WorkspaceDataError;
}) {
  if (listError) return <WorkspaceDataErrorPanel title="Wiki Page list failed" error={listError} />;
  if (pages.length === 0) return null;

  return (
    <section className="graph-focus-picker" aria-labelledby="graph-focus-picker-heading">
      <div className="panel-heading tight">
        <h3 id="graph-focus-picker-heading">Wiki Page focus</h3>
        <span className="quiet-label">{formatCount(pages.length, "page")}</span>
      </div>
      <div className="focus-chip-list">
        {pages.slice(0, 6).map((page) => (
          <Link
            key={page.id}
            to="/workspace"
            search={{ recordId: page.id, tab: "graph" }}
            className={page.id === selectedRecordId ? "focus-chip selected" : "focus-chip"}
          >
            {page.title || page.id}
          </Link>
        ))}
      </div>
    </section>
  );
}

function GraphCanvas({ graph }: { readonly graph: GraphNeighborhoodData }) {
  const visibleNodes = graph.nodes.slice(0, graphPositions.length);
  const positionById = new Map(visibleNodes.map((node, index) => [node.id, graphPositions[index]]));
  const visibleEdges = graph.edges.filter((edge) => positionById.has(edge.from) && positionById.has(edge.to));

  return (
    <div className="graph-canvas" role="img" aria-label={`Bounded graph neighborhood for ${graph.selectedRecordId}`}>
      <svg className="graph-svg" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        {visibleEdges.map((edge) => {
          const from = positionById.get(edge.from);
          const to = positionById.get(edge.to);
          if (!from || !to) return null;
          const midX = (from.x + to.x) / 2;
          const midY = (from.y + to.y) / 2;
          return (
            <g key={edge.id}>
              <line
                className={edge.kind === "citation" ? "graph-line citation" : "graph-line"}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
              />
              <text className="graph-edge-text" x={midX} y={midY}>
                {edgeShortLabel(edge)}
              </text>
            </g>
          );
        })}
      </svg>
      {visibleNodes.map((node, index) => {
        const position = graphPositions[index];
        return (
          <Link
            key={node.id}
            to="/workspace"
            search={{ recordId: node.id, tab: "graph" }}
            className={graphNodeClassName(node)}
            style={{ "--graph-x": `${position.x}%`, "--graph-y": `${position.y}%` } as CSSProperties}
            title={`${nodeKindLabel(node.kind)}: ${node.label}`}
          >
            <span>{nodeKindLabel(node.kind)}</span>
            <strong>{node.label || node.id}</strong>
          </Link>
        );
      })}
    </div>
  );
}

function GraphEdgeList({ graph }: { readonly graph: GraphNeighborhoodData }) {
  if (graph.edges.length === 0) {
    return (
      <div className="empty-state inline-empty compact-graph-empty" role="status">
        <strong>No linked neighbors</strong>
        <p>{graph.selectedRecordId} exists, but no Citation or Manual Link edges were returned.</p>
      </div>
    );
  }

  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  return (
    <section className="edge-list-region" aria-labelledby="edge-list-heading">
      <div className="panel-heading tight">
        <h3 id="edge-list-heading">Edges</h3>
        <span className="quiet-label">{formatCount(graph.edges.length, "edge")}</span>
      </div>
      <ol className="graph-edge-list">
        {graph.edges.map((edge) => (
          <li key={edge.id}>
            <GraphRecordChip node={nodesById.get(edge.from)} recordId={edge.from} />
            <span className="edge-label">{edgeLabel(edge)}</span>
            <GraphRecordChip node={nodesById.get(edge.to)} recordId={edge.to} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function GraphRecordChip({ node, recordId }: { readonly node?: GraphNeighborhoodNode; readonly recordId: string }) {
  if (!node) return <span className="record-chip muted">{recordId}</span>;
  return (
    <Link to="/workspace" search={{ recordId: node.id, tab: "graph" }} className="record-chip">
      {node.label || node.id}
    </Link>
  );
}

function PageTab({
  page,
  pageError,
  pageValidation,
  selectedNode,
  selectedRecordId,
}: {
  readonly page?: WorkspaceWikiPage;
  readonly pageError?: WorkspaceDataError;
  readonly pageValidation?: PageCitationValidation;
  readonly selectedNode?: GraphNeighborhoodNode;
  readonly selectedRecordId?: string;
}) {
  const [body, setBody] = useState(page?.body ?? "");
  const [baseBody, setBaseBody] = useState(page?.body ?? "");
  const [saveResult, setSaveResult] = useState<SavePageBodyResult | undefined>();
  const [saveError, setSaveError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  const selectedPageId = page?.id;
  const selectedPageBody = page?.body ?? "";

  useEffect(() => {
    const bodyForSelectedPage = selectedPageId ? selectedPageBody : "";
    setBody(bodyForSelectedPage);
    setBaseBody(bodyForSelectedPage);
    setSaveResult(undefined);
    setSaveError(undefined);
  }, [selectedPageId, selectedPageBody]);

  const activeValidation = saveResult?.ok ? saveResult.validation : pageValidation;
  const isDirty = page !== undefined && body !== baseBody;

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!page || isPending) return;

    setSaveError(undefined);
    startTransition(async () => {
      try {
        const result = await savePageBody({ data: { pageId: page.id, body } });
        setSaveResult(result);
        if (result.ok) setBaseBody(body);
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : "Unknown Page Body save failure.");
      }
    });
  }

  if (pageError) {
    return (
      <section className="page-region" aria-labelledby="page-heading">
        <div className="panel-heading">
          <h2 id="page-heading">Wiki Page</h2>
          <span className="status-pill warning">Read failed</span>
        </div>
        <WorkspaceDataErrorPanel title="Wiki Page read failed" error={pageError} />
      </section>
    );
  }

  if (selectedNode?.kind === "source_heading") {
    return (
      <section className="page-region" aria-labelledby="page-heading">
        <div className="panel-heading">
          <div>
            <h2 id="page-heading">Wiki Page</h2>
            <span className="quiet-label">Selected: Source Heading</span>
          </div>
          {selectedNode.navigation.sourceDocumentId ? (
            <Link
              to="/sources"
              search={{ sourceDocumentId: selectedNode.navigation.sourceDocumentId }}
              className="button-link secondary small"
            >
              Open source
            </Link>
          ) : null}
        </div>
        <div className="empty-state inline-empty" role="status">
          <strong>Select a Wiki Page</strong>
          <p>
            {navigationSummary(selectedNode)} is source context. Choose a Wiki Page node or focus chip to edit Page Body
            text.
          </p>
        </div>
      </section>
    );
  }

  if (!page) {
    return (
      <section className="page-region" aria-labelledby="page-heading">
        <div className="panel-heading">
          <div>
            <h2 id="page-heading">Wiki Page</h2>
            <span className="quiet-label">{selectedRecordId ?? "No selection"}</span>
          </div>
          <span className="status-pill neutral">Read only</span>
        </div>
        <div className="empty-state inline-empty" role="status">
          <strong>No Wiki Page selected</strong>
          <p>Select a Wiki Page in graph focus before reading or editing Page Body text.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="page-region" aria-labelledby="page-heading">
      <div className="panel-heading">
        <div>
          <h2 id="page-heading">{page.title || page.id}</h2>
          <span className="quiet-label">{page.slug ? `/${page.slug}` : page.id}</span>
        </div>
        <span className={activeValidation?.issues.length ? "status-pill warning" : "status-pill"}>
          {activeValidation?.issues.length ? "Citation issues" : "Citations valid"}
        </span>
      </div>

      <WikiPageCitationPanel citations={page.citations} validation={activeValidation} />

      <form className="page-editor" onSubmit={handleSave}>
        <label htmlFor="page-body-editor">Page Body</label>
        <textarea id="page-body-editor" value={body} onChange={(event) => setBody(event.currentTarget.value)} />
        <div className="page-editor-actions">
          <span className="quiet-label">
            {isDirty ? `Unsaved edit, ${body.length} characters` : `Saved body, ${baseBody.length} characters`}
          </span>
          <button type="submit" className="button-link small" disabled={!isDirty || isPending}>
            {isPending ? "Saving" : "Save"}
          </button>
        </div>
      </form>

      {saveResult?.ok ? (
        <div className="state-panel success-state slim" role="status">
          <strong>{saveResult.changed ? "Page Body saved" : "No body changes"}</strong>
          <p>
            Validation passed for {page.id}. Body length changed from {saveResult.beforeLength} to{" "}
            {saveResult.afterLength} characters.
          </p>
        </div>
      ) : null}

      {saveResult && !saveResult.ok ? (
        <WorkspaceDataErrorPanel title="Page Body save failed" error={saveResult.error} />
      ) : null}

      {saveError ? (
        <div className="state-panel error-state slim" role="alert">
          <strong>Page Body save failed</strong>
          <p>{saveError}</p>
        </div>
      ) : null}
    </section>
  );
}

function WikiPageCitationPanel({
  citations,
  validation,
}: {
  readonly citations: readonly WorkspaceCitationRecord[];
  readonly validation?: PageCitationValidation;
}) {
  return (
    <section className="citation-panel" aria-labelledby="citation-panel-heading">
      <div className="panel-heading tight">
        <h3 id="citation-panel-heading">Citations</h3>
        <span className="quiet-label">{formatCount(citations.length, "graph citation")}</span>
      </div>

      {validation && validation.issues.length > 0 ? (
        <div className="state-panel error-state slim" role="alert">
          <strong>Citation marker validation failed</strong>
          <ul className="validation-list">
            {validation.issues.map((issue) => (
              <li
                key={`${issue.kind}-${issue.citationMarkerKey ?? "missing-marker"}-${issue.graphCitationKey ?? "missing-graph"}`}
              >
                <strong>{issue.kind}</strong>
                <span>{issue.message}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="state-panel success-state slim" role="status">
          <strong>Citation markers match graph Citation keys</strong>
          <p>Page Body saves only update the Wiki Page body and Change Log through backend semantics.</p>
        </div>
      )}

      {citations.length > 0 ? (
        <ol className="citation-list">
          {citations.map((citation) => (
            <li key={citation.key}>
              <code>[^{citation.key}]</code>
              <span>{citation.label || citation.quote || "Graph Citation"}</span>
            </li>
          ))}
        </ol>
      ) : (
        <div className="empty-state inline-empty compact-graph-empty" role="status">
          <strong>No graph Citations</strong>
          <p>This page can be saved without citation markers, but relation editing stays outside this workspace tab.</p>
        </div>
      )}
    </section>
  );
}

function WorkspaceDataErrorPanel({ title, error }: { readonly title: string; readonly error: WorkspaceDataError }) {
  return (
    <div className="state-panel error-state slim" role="alert">
      <strong>{title}</strong>
      <p>
        {error.operation}: {error.reason}
      </p>
      <p>{error.action}</p>
      {error.kind === "validation_failure" ? (
        <ul className="validation-list">
          {error.issues.map((issue) => (
            <li
              key={`${issue.kind}-${issue.citationMarkerKey ?? "missing-marker"}-${issue.graphCitationKey ?? "missing-graph"}`}
            >
              <strong>{issue.kind}</strong>
              <span>{issue.message}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function graphNodeClassName(node: GraphNeighborhoodNode): string {
  return [
    "graph-map-node",
    node.kind === "source_heading" ? "source-heading" : "wiki-page",
    node.selected ? "selected" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function nodeKindLabel(kind: GraphNeighborhoodNode["kind"]): string {
  return kind === "source_heading" ? "Source Heading" : "Wiki Page";
}

function nodeMeta(node: GraphNeighborhoodNode): string {
  if (node.kind === "source_heading") {
    const page = node.navigation.startPage ? `page ${node.navigation.startPage}` : "no page";
    return `${nodeKindLabel(node.kind)} - ${page}`;
  }
  return `${nodeKindLabel(node.kind)} - ${node.navigation.slug ?? node.id}`;
}

function boundedCount(graph: GraphNeighborhoodData): string {
  return `${formatCount(graph.nodes.length, "node")} / ${formatCount(graph.edges.length, "edge")}`;
}

function edgeLabel(edge: GraphNeighborhoodEdge): string {
  const label =
    edge.label && edge.label.length > 0 ? edge.label : edge.kind === "citation" ? "Citation" : "Manual Link";
  return `${edgeKindLabel(edge.kind)}: ${label}`;
}

function edgeShortLabel(edge: GraphNeighborhoodEdge): string {
  const label = edge.label && edge.label.length > 0 ? edge.label : edgeKindLabel(edge.kind);
  return label.length > 18 ? `${label.slice(0, 17)}...` : label;
}

function edgeKindLabel(kind: GraphNeighborhoodEdge["kind"]): string {
  return kind === "citation" ? "Citation" : "Manual Link";
}

function navigationSummary(node: GraphNeighborhoodNode | undefined): string {
  if (!node) return "No graph node selected";
  if (node.kind === "wiki_page") return node.navigation.slug ? `Wiki Page slug ${node.navigation.slug}` : node.id;
  const pageRange =
    node.navigation.endPage && node.navigation.endPage !== node.navigation.startPage
      ? `pages ${node.navigation.startPage}-${node.navigation.endPage}`
      : `page ${node.navigation.startPage ?? "unknown"}`;
  return `${node.navigation.sourceDocumentId ?? "Unknown Source Document"} - ${pageRange}`;
}

function formatCount(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
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
