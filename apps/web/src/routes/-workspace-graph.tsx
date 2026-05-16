import { Link } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import type {
  GraphNeighborhoodData,
  GraphNeighborhoodEdge,
  GraphNeighborhoodNode,
  WikiPageRecord,
} from "../server/graph-wiki.ts";
import { formatCount, type WorkspaceDataError, WorkspaceDataErrorPanel } from "./-workspace-activity.tsx";

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

export function GraphTab({
  graph,
  pages,
  selectedRecordId,
  selectedNode,
  listError,
  graphError,
}: {
  readonly graph?: GraphNeighborhoodData;
  readonly pages: readonly WikiPageRecord[];
  readonly selectedRecordId?: string;
  readonly selectedNode?: GraphNeighborhoodNode;
  readonly listError?: WorkspaceDataError;
  readonly graphError?: WorkspaceDataError;
}) {
  return (
    <section className="graph-region" aria-labelledby="graph-heading">
      <div className="panel-heading">
        <div>
          <h2 id="graph-heading">Graph focus</h2>
          <span className="quiet-label">{selectedNode ? nodeMeta(selectedNode) : "No projection"}</span>
        </div>
        <span className="status-pill neutral">{graph ? boundedCount(graph) : "Read only"}</span>
      </div>

      <WikiPageFocusList pages={pages} selectedRecordId={selectedRecordId} listError={listError} />

      {graph ? (
        graph.nodes.length > 0 ? (
          <>
            <GraphCanvas graph={graph} />
            <GraphEdgeList graph={graph} />
          </>
        ) : (
          <div className="empty-state inline-empty" role="status">
            <strong>No graph records</strong>
            <p>{selectedRecordId} returned no Wiki Page or Source Heading node.</p>
          </div>
        )
      ) : listError || graphError ? null : (
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
