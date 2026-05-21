import { validatePageBodyCitationMarkers } from "@originium/domain";
import type { AgentActivityRecord } from "@originium/surreal";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { type FormEvent, useEffect, useState, useTransition } from "react";
import { readWebRuntimeConfig } from "../config.ts";
import { type CodexWorkspaceTurnData, runCodexWorkspaceTurn } from "../server/codex-app-server.ts";
import {
  type AgentSessionRecord,
  type ChangeLogRecord,
  createOrResumeWorkspaceAgentSession,
  type GraphNeighborhoodData,
  type GraphNeighborhoodNode,
  listAgentActivity,
  listChangeLogs,
  listWikiPages,
  readGraphNeighborhood,
  readWikiPage,
  saveWikiPageBody,
  type WikiPageRecord,
} from "../server/graph-wiki.ts";
import {
  ActivityTimeline,
  type ChatMessage,
  formatCount,
  mergeTimeline,
  messageStatusLabel,
  type WorkspaceAgentActivityRecord,
  type WorkspaceChangeLogRecord,
  type WorkspaceDataError,
  WorkspaceDataErrorPanel,
  type WorkspaceTurnError,
  WorkspaceTurnErrorPanel,
} from "./-workspace-activity.tsx";
import { GraphTab } from "./-workspace-graph.tsx";

type WorkspaceSearch = {
  readonly recordId?: string;
  readonly tab?: "graph" | "page";
};

type WorkspacePageData = {
  readonly session?: AgentSessionRecord;
  readonly pages: readonly WikiPageRecord[];
  readonly selectedRecordId?: string;
  readonly graph?: GraphNeighborhoodData;
  readonly page?: WorkspaceWikiPage;
  readonly pageValidation?: PageCitationValidation;
  readonly agentActivity: readonly WorkspaceAgentActivityRecord[];
  readonly changeLogs: readonly WorkspaceChangeLogRecord[];
  readonly sessionError?: WorkspaceDataError;
  readonly listError?: WorkspaceDataError;
  readonly graphError?: WorkspaceDataError;
  readonly pageError?: WorkspaceDataError;
  readonly activityError?: WorkspaceDataError;
  readonly changeLogError?: WorkspaceDataError;
};

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

type SendWorkspaceMessageInput = {
  readonly prompt: string;
};

type SendWorkspaceMessageResult =
  | {
      readonly ok: true;
      readonly data: CodexWorkspaceTurnData;
    }
  | {
      readonly ok: false;
      readonly error: WorkspaceTurnError;
    };

const graphLimit = 9;
const workspaceKey = "default";

const getWorkspacePageData = createServerFn({ method: "GET" })
  .inputValidator(
    (input: WorkspaceSearch | undefined): WorkspaceSearch => ({
      recordId: typeof input?.recordId === "string" && input.recordId.length > 0 ? input.recordId : undefined,
      tab: input?.tab === "page" ? "page" : "graph",
    }),
  )
  .handler(async ({ data }): Promise<WorkspacePageData> => {
    const sessionResult = await createOrResumeWorkspaceAgentSession({ workspaceKey });
    const listResult = await listWikiPages();
    const session = sessionResult.ok ? sessionResult.data.session : undefined;
    const sessionError = sessionResult.ok ? undefined : sessionResult.error;
    const activityResult = session ? await listAgentActivity({ sessionId: session.id }) : undefined;
    const changeLogResult = session ? await listChangeLogs({ sessionId: session.id }) : undefined;
    if (!listResult.ok) {
      return {
        session,
        pages: [],
        agentActivity: activityResult?.ok ? activityResult.data.map(serializableActivityRecord) : [],
        changeLogs: changeLogResult?.ok ? changeLogResult.data.map(serializableChangeLogRecord) : [],
        sessionError,
        listError: listResult.error,
        activityError: activityResult && !activityResult.ok ? activityResult.error : undefined,
        changeLogError: changeLogResult && !changeLogResult.ok ? changeLogResult.error : undefined,
      };
    }

    const selectedRecordId = data.recordId ?? listResult.data[0]?.id;
    if (!selectedRecordId) {
      return {
        session,
        pages: listResult.data,
        agentActivity: activityResult?.ok ? activityResult.data.map(serializableActivityRecord) : [],
        changeLogs: changeLogResult?.ok ? changeLogResult.data.map(serializableChangeLogRecord) : [],
        sessionError,
        activityError: activityResult && !activityResult.ok ? activityResult.error : undefined,
        changeLogError: changeLogResult && !changeLogResult.ok ? changeLogResult.error : undefined,
      };
    }

    const graphResult = await readGraphNeighborhood({ recordId: selectedRecordId, limit: graphLimit });
    if (!graphResult.ok) {
      return {
        session,
        pages: listResult.data,
        selectedRecordId,
        agentActivity: activityResult?.ok ? activityResult.data.map(serializableActivityRecord) : [],
        changeLogs: changeLogResult?.ok ? changeLogResult.data.map(serializableChangeLogRecord) : [],
        sessionError,
        graphError: graphResult.error,
        activityError: activityResult && !activityResult.ok ? activityResult.error : undefined,
        changeLogError: changeLogResult && !changeLogResult.ok ? changeLogResult.error : undefined,
      };
    }

    const selectedNode = graphResult.data.nodes.find((node) => node.selected);

    const pageResult = await readWikiPage({ pageId: selectedNode?.id ?? selectedRecordId });
    if (!pageResult.ok) {
      return {
        session,
        pages: listResult.data,
        selectedRecordId,
        graph: graphResult.data,
        agentActivity: activityResult?.ok ? activityResult.data.map(serializableActivityRecord) : [],
        changeLogs: changeLogResult?.ok ? changeLogResult.data.map(serializableChangeLogRecord) : [],
        sessionError,
        pageError: pageResult.error,
        activityError: activityResult && !activityResult.ok ? activityResult.error : undefined,
        changeLogError: changeLogResult && !changeLogResult.ok ? changeLogResult.error : undefined,
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
      session,
      pages: listResult.data,
      selectedRecordId,
      graph: graphResult.data,
      page,
      pageValidation,
      agentActivity: activityResult?.ok ? activityResult.data.map(serializableActivityRecord) : [],
      changeLogs: changeLogResult?.ok ? changeLogResult.data.map(serializableChangeLogRecord) : [],
      sessionError,
      activityError: activityResult && !activityResult.ok ? activityResult.error : undefined,
      changeLogError: changeLogResult && !changeLogResult.ok ? changeLogResult.error : undefined,
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
    const sessionResult = await createOrResumeWorkspaceAgentSession({ workspaceKey });
    if (!sessionResult.ok) return { ok: false, error: sessionResult.error };
    const result = await saveWikiPageBody({
      pageId: data.pageId,
      body: data.body,
      sessionId: sessionResult.data.session.id,
    });
    if (!result.ok) return { ok: false, error: result.error };
    return {
      ok: true,
      changed: result.data.changed,
      validation: result.data.citationValidation,
      beforeLength: result.data.beforeLength,
      afterLength: result.data.afterLength,
    };
  });

const sendWorkspaceMessage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown): SendWorkspaceMessageInput => {
    const candidate = input && typeof input === "object" ? (input as Partial<SendWorkspaceMessageInput>) : {};
    return {
      prompt: typeof candidate.prompt === "string" ? candidate.prompt.trim() : "",
    };
  })
  .handler(async ({ data }): Promise<SendWorkspaceMessageResult> => {
    const result = await runCodexWorkspaceTurn(readWebRuntimeConfig(), {
      workspaceKey,
      prompt: data.prompt,
      purpose: "Codex-powered Agent Workspace",
    });
    if (!result.ok) return { ok: false, error: serializableCodexFailure(result.error) };
    return { ok: true, data: result.data };
  });

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
  const router = useRouter();
  const activeTab = search.tab ?? "graph";
  const selectedNode = data.graph?.nodes.find((node) => node.selected);
  const session = data.session;
  const [messageText, setMessageText] = useState("");
  const [chatMessages, setChatMessages] = useState<readonly ChatMessage[]>([]);
  const [sendError, setSendError] = useState<WorkspaceTurnError | undefined>();
  const [turnSummary, setTurnSummary] = useState<CodexWorkspaceTurnData | undefined>();
  const [isSending, startSending] = useTransition();
  const timelineItems = mergeTimeline(data.agentActivity, data.changeLogs);
  const canSend = Boolean(session) && messageText.trim().length > 0 && !isSending;

  function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = messageText.trim();
    if (!prompt || isSending) return;

    const userMessageId = `user-${Date.now()}`;
    const assistantMessageId = `assistant-${Date.now()}`;
    setMessageText("");
    setSendError(undefined);
    setTurnSummary(undefined);
    setChatMessages((messages) => [
      ...messages,
      { id: userMessageId, role: "user", text: prompt, status: "completed" },
      {
        id: assistantMessageId,
        role: "assistant",
        text: "Waiting for Codex app-server output...",
        status: "streaming",
      },
    ]);

    startSending(async () => {
      try {
        const result = await sendWorkspaceMessage({ data: { prompt } });
        if (result.ok) {
          setTurnSummary(result.data);
          setChatMessages((messages) =>
            messages.map((message) =>
              message.id === assistantMessageId
                ? { ...message, text: result.data.messageText, status: "completed" }
                : message,
            ),
          );
          await router.invalidate();
          return;
        }
        setSendError(result.error);
        setChatMessages((messages) =>
          messages.map((message) =>
            message.id === assistantMessageId
              ? { ...message, text: `${result.error.operation}: ${result.error.reason}`, status: "failed" }
              : message,
          ),
        );
        await router.invalidate();
      } catch (error) {
        const failure: WorkspaceTurnError = {
          kind: "codex_app_server_failure",
          operation: "web.workspace.message.send",
          target: "workspace",
          input: { promptLength: prompt.length },
          reason: error instanceof Error ? error.message : String(error),
          action: "Inspect the web route log and retry the workspace turn.",
        };
        setSendError(failure);
        setChatMessages((messages) =>
          messages.map((message) =>
            message.id === assistantMessageId
              ? { ...message, text: `${failure.operation}: ${failure.reason}`, status: "failed" }
              : message,
          ),
        );
      }
    });
  }

  return (
    <section className="route-stack" aria-labelledby="workspace-title">
      <header className="page-header">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1 id="workspace-title">Agent Session</h1>
        </div>
        <div className="header-actions">
          <span className={session ? "status-pill" : "status-pill warning"}>
            {session ? "Session ready" : "Session failed"}
          </span>
        </div>
      </header>

      <div className="workspace-layout">
        <section className="panel conversation-panel" aria-labelledby="session-heading" aria-busy="false">
          <div className="panel-toolbar">
            <div>
              <h2 id="session-heading">Chat</h2>
              <span className="quiet-label">{session?.id ?? "Agent Session unavailable"}</span>
            </div>
            <span className={isSending ? "status-pill warning" : "status-pill neutral"}>
              {isSending ? "Turn running" : session ? "Ready" : "Offline"}
            </span>
          </div>

          {data.sessionError ? (
            <WorkspaceDataErrorPanel title="Agent Session startup failed" error={data.sessionError} />
          ) : null}

          <section className="chat-transcript" aria-label="Workspace chat transcript" aria-live="polite">
            {chatMessages.length === 0 ? (
              <div className="empty-state compact-empty">
                <strong>{session ? "Ask the workspace agent" : "No Agent Session"}</strong>
                <p>
                  {session
                    ? "Messages run through the mapped Codex thread. Runtime events and Graph Wiki mutations appear below."
                    : "Session creation failed; the composer stays disabled until the Agent Session can be created."}
                </p>
              </div>
            ) : (
              <ol className="message-list">
                {chatMessages.map((message) => (
                  <li key={message.id} className={`message-row ${message.role}`}>
                    <span className="message-role">{message.role === "user" ? "You" : "Codex"}</span>
                    <div className="message-bubble">
                      <p>{message.text}</p>
                      <span className={`message-status ${message.status}`}>{messageStatusLabel(message.status)}</span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {turnSummary ? (
            <div className="turn-summary" role="status">
              <span>thread {turnSummary.threadId}</span>
              <span>turn {turnSummary.turnId}</span>
              <span>{formatCount(turnSummary.streamedEventCount, "streamed event")}</span>
              <span>{formatCount(turnSummary.activityRecordCount, "activity record")}</span>
            </div>
          ) : null}

          {sendError ? <WorkspaceTurnErrorPanel title="Message send failed" error={sendError} /> : null}

          <form className="composer" aria-label="Session message composer" onSubmit={handleSendMessage}>
            <label htmlFor="session-message">Message</label>
            <textarea
              id="session-message"
              placeholder={session ? "Send a task, question, or inspection request" : "Agent Session unavailable"}
              disabled={!session || isSending}
              value={messageText}
              onChange={(event) => setMessageText(event.currentTarget.value)}
            />
            <div className="composer-actions">
              <button type="button" className="button-link secondary" disabled>
                Attach page
              </button>
              <button type="submit" className="button-link" disabled={!canSend}>
                {isSending ? "Sending" : "Send"}
              </button>
            </div>
          </form>

          <section className="activity-region" aria-labelledby="activity-heading">
            <div className="panel-heading tight">
              <h3 id="activity-heading">Activity</h3>
              <span className="quiet-label">{formatCount(timelineItems.length, "record")}</span>
            </div>
            {data.activityError ? (
              <WorkspaceDataErrorPanel title="Agent Activity read failed" error={data.activityError} />
            ) : null}
            {data.changeLogError ? (
              <WorkspaceDataErrorPanel title="Change Log read failed" error={data.changeLogError} />
            ) : null}
            <ActivityTimeline items={timelineItems} />
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
            <GraphTab
              graph={data.graph}
              pages={data.pages}
              selectedRecordId={data.selectedRecordId}
              selectedNode={selectedNode}
              listError={data.listError}
              graphError={data.graphError}
            />
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
  const router = useRouter();
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
        if (result.ok) {
          setBaseBody(body);
          await router.invalidate();
        }
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

function serializableActivityRecord(record: AgentActivityRecord): WorkspaceAgentActivityRecord {
  return {
    ...record,
    metadata: record.metadata === undefined ? undefined : JSON.stringify(record.metadata),
  };
}

function serializableChangeLogRecord(record: ChangeLogRecord): WorkspaceChangeLogRecord {
  return {
    id: record.id,
    agent_session: record.agent_session,
    command: record.command,
    operation: record.operation,
    target: record.target,
    target_records: record.target_records,
    summary: record.summary,
    created_at: record.created_at,
  };
}

function serializableCodexFailure(error: {
  readonly kind: "codex_app_server_failure";
  readonly operation: string;
  readonly target: string;
  readonly input: Record<string, unknown>;
  readonly reason: string;
  readonly action: string;
}): WorkspaceTurnError {
  return {
    kind: error.kind,
    operation: error.operation,
    target: error.target,
    input: Object.fromEntries(Object.entries(error.input).map(([key, value]) => [key, serializableScalar(value)])),
    reason: error.reason,
    action: error.action,
  };
}

function serializableScalar(value: unknown): string | number | boolean | null {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }
  if (value === undefined) return null;
  return JSON.stringify(value);
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
