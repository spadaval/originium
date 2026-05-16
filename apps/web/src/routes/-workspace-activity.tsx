import type { AgentActivityRecord } from "@originium/surreal";
import type { WebGraphWikiOperationFailure, WebGraphWikiValidationFailure } from "../server/graph-wiki.ts";

export type WorkspaceDataError = WebGraphWikiOperationFailure | WebGraphWikiValidationFailure;

export type WorkspaceTurnError = {
  readonly kind: "codex_app_server_failure";
  readonly operation: string;
  readonly target: string;
  readonly input: Record<string, string | number | boolean | null>;
  readonly reason: string;
  readonly action: string;
};

export type WorkspaceAgentActivityRecord = Omit<AgentActivityRecord, "metadata"> & {
  readonly metadata?: string;
};

export type WorkspaceChangeLogRecord = {
  readonly id: string;
  readonly agent_session?: string;
  readonly command: string;
  readonly operation: string;
  readonly target: string;
  readonly target_records: readonly string[];
  readonly summary: string;
  readonly created_at?: string;
};

export type ChatMessage = {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly status: "streaming" | "completed" | "failed";
};

export type WorkspaceTimelineItem =
  | {
      readonly id: string;
      readonly lane: "runtime";
      readonly createdAt?: string;
      readonly kind: AgentActivityRecord["kind"];
      readonly status: AgentActivityRecord["status"];
      readonly source: AgentActivityRecord["source"];
      readonly summary: string;
      readonly operation?: string;
      readonly targetRecords: readonly string[];
      readonly metadata?: string;
    }
  | {
      readonly id: string;
      readonly lane: "graph";
      readonly createdAt?: string;
      readonly command: string;
      readonly operation: string;
      readonly target: string;
      readonly summary: string;
      readonly targetRecords: readonly string[];
    };

export function ActivityTimeline({ items }: { readonly items: readonly WorkspaceTimelineItem[] }) {
  if (items.length === 0) {
    return (
      <div className="empty-state inline-empty compact-graph-empty" role="status">
        <strong>No activity yet</strong>
        <p>Send a message or save a Wiki Page body to populate runtime events and Graph Wiki mutations.</p>
      </div>
    );
  }

  return (
    <ol className="activity-list" aria-label="Agent Activity and Change Log records">
      {items.map((item) => (
        <li key={`${item.lane}-${item.id}`} className={`activity-item ${item.lane}`}>
          <time dateTime={item.createdAt}>{formatActivityTime(item.createdAt)}</time>
          <div>
            <div className="activity-title-line">
              <strong>{item.summary}</strong>
              <span className={`activity-lane ${item.lane}`}>{item.lane === "runtime" ? "Runtime" : "Graph Wiki"}</span>
            </div>
            {item.lane === "runtime" ? (
              <>
                <span>
                  {activityKindLabel(item.kind)} · {activityStatusLabel(item.status)} · {item.source}
                </span>
                {item.operation ? <code>{item.operation}</code> : null}
              </>
            ) : (
              <>
                <span>
                  {item.command} · {item.target}
                </span>
                <code>{item.operation}</code>
              </>
            )}
            {item.targetRecords.length > 0 ? <small>{item.targetRecords.join(", ")}</small> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function WorkspaceTurnErrorPanel({
  title,
  error,
}: {
  readonly title: string;
  readonly error: WorkspaceTurnError;
}) {
  return (
    <div className="state-panel error-state slim" role="alert">
      <strong>{title}</strong>
      <p>
        {error.operation} on {error.target}: {error.reason}
      </p>
      <p>{error.action}</p>
    </div>
  );
}

export function WorkspaceDataErrorPanel({
  title,
  error,
}: {
  readonly title: string;
  readonly error: WorkspaceDataError;
}) {
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

export function mergeTimeline(
  activity: readonly WorkspaceAgentActivityRecord[],
  changeLogs: readonly WorkspaceChangeLogRecord[],
): readonly WorkspaceTimelineItem[] {
  const runtimeItems: WorkspaceTimelineItem[] = activity.map((record) => ({
    id: record.id,
    lane: "runtime",
    createdAt: record.created_at,
    kind: record.kind,
    status: record.status,
    source: record.source,
    summary: record.summary,
    operation: record.operation,
    targetRecords: record.target_records,
    metadata: record.metadata,
  }));
  const graphItems: WorkspaceTimelineItem[] = changeLogs.map((record) => ({
    id: record.id,
    lane: "graph",
    createdAt: record.created_at,
    command: record.command,
    operation: record.operation,
    target: record.target,
    summary: record.summary,
    targetRecords: record.target_records,
  }));
  return [...runtimeItems, ...graphItems].sort((left, right) => {
    const leftTime = left.createdAt ? Date.parse(left.createdAt) : 0;
    const rightTime = right.createdAt ? Date.parse(right.createdAt) : 0;
    return rightTime - leftTime;
  });
}

export function messageStatusLabel(status: ChatMessage["status"]): string {
  switch (status) {
    case "streaming":
      return "Streaming";
    case "failed":
      return "Failed";
    case "completed":
      return "Completed";
  }
}

export function formatCount(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function activityKindLabel(kind: AgentActivityRecord["kind"]): string {
  switch (kind) {
    case "file_change":
      return "File change";
    case "graph_mutation":
      return "Graph mutation";
    case "message":
      return "Message";
    case "command":
      return "Command";
    case "tool":
      return "Tool";
    case "status":
      return "Status";
    case "error":
      return "Error";
  }
}

function activityStatusLabel(status: AgentActivityRecord["status"]): string {
  switch (status) {
    case "started":
      return "Started";
    case "streaming":
      return "Streaming";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
  }
}

function formatActivityTime(value: string | undefined): string {
  if (!value) return "--:--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
}
