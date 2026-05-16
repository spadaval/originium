import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import type { CodexAppServerConfig, WebRuntimeConfig } from "../config.ts";
import { type AgentActivityDraft, recordAgentActivity, type WebGraphWikiDependencies } from "./graph-wiki.ts";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];
type JsonObject = { readonly [key: string]: JsonValue | undefined };

export type CodexAppServerFailure = {
  readonly kind: "codex_app_server_failure";
  readonly operation: string;
  readonly target: string;
  readonly input: Record<string, unknown>;
  readonly reason: string;
  readonly action: string;
};

export type CodexAppServerResult<T> =
  | {
      readonly ok: true;
      readonly operation: string;
      readonly target: string;
      readonly data: T;
    }
  | {
      readonly ok: false;
      readonly error: CodexAppServerFailure;
    };

export type CodexAppServerProcessBoundary = {
  readonly mode: "attached" | "started";
  readonly protocolUrl: string;
  readonly readyzUrl: string;
  readonly listen: string;
  readonly pid?: number;
};

export type CodexAppServerSmokeInput = {
  readonly sessionId: string;
  readonly prompt: string;
  readonly cwd?: string;
  readonly timeoutMs?: number;
};

export type CodexAppServerSmokeData = {
  readonly boundary: CodexAppServerProcessBoundary;
  readonly userAgent: string;
  readonly threadId: string;
  readonly turnId: string;
  readonly messageText: string;
  readonly streamedEventCount: number;
  readonly activityRecordCount: number;
};

type CodexAppServerWebSocket = {
  readonly readyState?: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: "open" | "message" | "error" | "close", listener: (event: unknown) => void): void;
};

type CodexAppServerWebSocketFactory = (url: string) => CodexAppServerWebSocket;
type CodexAppServerFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type SpawnAppServer = (
  command: string,
  args: readonly string[],
  options: { readonly env: NodeJS.ProcessEnv; readonly cwd: string },
) => ChildProcessWithoutNullStreams;

export type CodexAppServerDependencies = {
  readonly activity?: WebGraphWikiDependencies;
  readonly fetch?: CodexAppServerFetch;
  readonly spawn?: SpawnAppServer;
  readonly webSocket?: CodexAppServerWebSocketFactory;
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly newRequestId?: () => string | number;
};

type JsonRpcRequest = {
  readonly id: string | number;
  readonly method: string;
  readonly params?: JsonObject | readonly JsonValue[];
};

type JsonRpcResponse = {
  readonly id: string | number;
  readonly result?: unknown;
  readonly error?: {
    readonly code: number;
    readonly message: string;
    readonly data?: unknown;
  };
};

type JsonRpcNotification = {
  readonly method: string;
  readonly params?: JsonObject;
};

const connectTimeoutMs = 5_000;
const smokeTimeoutMs = 45_000;

export async function ensureCodexAppServer(
  config: WebRuntimeConfig,
  dependencies: CodexAppServerDependencies = {},
): Promise<CodexAppServerResult<CodexAppServerProcessBoundary>> {
  const operation = "web.codex_app_server.ensure";
  const protocolUrl = codexAppServerProtocolUrl(config.codexAppServer);
  const readyzUrl = codexAppServerReadyzUrl(config.codexAppServer);
  const listen = `${config.codexAppServer.listen.host}:${config.codexAppServer.listen.port}`;
  const input = { url: config.codexAppServer.url, protocolUrl, readyzUrl, listen };

  if (await isReady(readyzUrl, dependencies.fetch)) {
    return {
      ok: true,
      operation,
      target: protocolUrl,
      data: { mode: "attached", protocolUrl, readyzUrl, listen },
    };
  }

  const spawnImpl = dependencies.spawn ?? spawn;
  const args = ["app-server", "--listen", protocolUrl];
  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawnImpl("codex", args, {
      cwd: dependencies.cwd ?? process.cwd(),
      env: dependencies.env ?? process.env,
    });
  } catch (error) {
    return {
      ok: false,
      error: codexFailure({
        operation,
        target: protocolUrl,
        input,
        reason: errorReason(error),
        action: `Install the Codex CLI or start Codex app-server manually with: codex ${args.join(" ")}`,
      }),
    };
  }

  const started = await waitForReady(readyzUrl, child, dependencies.fetch);
  if (!started.ok) {
    return {
      ok: false,
      error: codexFailure({
        operation,
        target: protocolUrl,
        input: { ...input, pid: child.pid },
        reason: started.reason,
        action: `Inspect the Codex app-server process logs or start it manually with: codex ${args.join(" ")}`,
      }),
    };
  }

  return {
    ok: true,
    operation,
    target: protocolUrl,
    data: { mode: "started", protocolUrl, readyzUrl, listen, pid: child.pid },
  };
}

export async function runCodexAppServerSmoke(
  config: WebRuntimeConfig,
  input: CodexAppServerSmokeInput,
  dependencies: CodexAppServerDependencies = {},
): Promise<CodexAppServerResult<CodexAppServerSmokeData>> {
  const operation = "web.codex_app_server.smoke";
  const boundary = await ensureCodexAppServer(config, dependencies);
  if (!boundary.ok) return boundary;

  let activityRecordCount = 0;
  const activityTargetRecords = [input.sessionId];
  const recordActivity = async (draft: Omit<AgentActivityDraft, "source" | "targetRecords">) => {
    const result = await recordAgentActivity(
      {
        ...draft,
        source: "codex_app_server",
        targetRecords: activityTargetRecords,
      },
      dependencies.activity,
    );
    if (!result.ok) {
      throw new Error(
        `Agent Activity persistence failed for operation=${draft.operation ?? operation}: ${result.error.reason}`,
      );
    }
    activityRecordCount += 1;
  };

  const messageDeltas: string[] = [];
  let streamedEventCount = 0;
  let observedThreadId: string | undefined;
  let observedTurnId: string | undefined;
  let terminalError: Error | undefined;
  let completed = false;

  const connection = await openJsonRpcConnection(boundary.data.protocolUrl, dependencies, async (notification) => {
    try {
      const activity = activityFromNotification(notification, input.sessionId);
      if (activity) {
        streamedEventCount += 1;
        if (notification.method === "item/agentMessage/delta") {
          const delta = stringProperty(notification.params, "delta");
          if (delta) messageDeltas.push(delta);
        }
        await recordActivity(activity);
      }
      if (notification.method === "turn/completed") {
        completed = true;
        observedThreadId = stringProperty(notification.params, "threadId") ?? observedThreadId;
        observedTurnId = stringProperty(objectProperty(notification.params, "turn"), "id") ?? observedTurnId;
      }
      if (notification.method === "error") {
        const error = objectProperty(notification.params, "error");
        const message = stringProperty(error, "message") ?? JSON.stringify(error ?? notification.params);
        terminalError = new Error(message);
        completed = true;
      }
    } catch (error) {
      terminalError = error instanceof Error ? error : new Error(String(error));
      completed = true;
    }
  });
  if (!connection.ok) {
    return {
      ok: false,
      error: codexFailure({
        operation,
        target: boundary.data.protocolUrl,
        input: { sessionId: input.sessionId, promptLength: input.prompt.length },
        reason: connection.error.reason,
        action: "Verify ORIGINIUM_CODEX_APP_SERVER_URL points to the Codex app-server WebSocket endpoint.",
      }),
    };
  }

  try {
    await recordActivity({
      sessionId: input.sessionId,
      kind: "status",
      status: "started",
      summary: `Codex app-server smoke ${boundary.data.mode}`,
      operation: "web.codex_app_server.ensure",
      metadata: boundary.data,
    });

    const initialize = await connection.data.request("initialize", {
      clientInfo: { name: "originium-web", version: "0.1.0" },
      capabilities: null,
    });
    const userAgent = stringProperty(initialize, "userAgent") ?? "unknown";

    const threadResponse = await connection.data.request("thread/start", {
      cwd: input.cwd ?? dependencies.cwd ?? process.cwd(),
      approvalPolicy: "never",
      sandbox: "danger-full-access",
      ephemeral: true,
      serviceName: "Originium",
    });
    const thread = objectProperty(threadResponse, "thread");
    const threadId = requireStringProperty(thread, "id", "thread/start response");
    observedThreadId = threadId;
    await recordActivity({
      sessionId: input.sessionId,
      kind: "status",
      status: "completed",
      summary: `Codex thread started ${threadId}`,
      operation: "thread/start",
      metadata: { threadId },
    });

    const turnResponse = await connection.data.request("turn/start", {
      threadId,
      input: [{ type: "text", text: input.prompt }],
    });
    const turn = objectProperty(turnResponse, "turn");
    const turnId = requireStringProperty(turn, "id", "turn/start response");
    observedTurnId = turnId;

    await waitForTurnCompletion(() => completed, input.timeoutMs ?? smokeTimeoutMs);
    if (terminalError) throw terminalError;
    const messageText = messageDeltas.join("");
    if (!messageText) {
      throw new Error(
        `Codex app-server turn ${observedTurnId ?? turnId} on thread ${observedThreadId ?? threadId} completed without item/agentMessage/delta notifications`,
      );
    }

    return {
      ok: true,
      operation,
      target: boundary.data.protocolUrl,
      data: {
        boundary: boundary.data,
        userAgent,
        threadId,
        turnId,
        messageText,
        streamedEventCount,
        activityRecordCount,
      },
    };
  } catch (error) {
    await safeClose(connection.data);
    return {
      ok: false,
      error: codexFailure({
        operation,
        target: boundary.data.protocolUrl,
        input: {
          sessionId: input.sessionId,
          threadId: observedThreadId,
          turnId: observedTurnId,
          promptLength: input.prompt.length,
        },
        reason: errorReason(error),
        action:
          "Inspect Codex app-server logs, verify the configured model/auth state, and retry the smoke with a reachable app-server.",
      }),
    };
  } finally {
    await safeClose(connection.data);
  }
}

export function codexAppServerProtocolUrl(config: CodexAppServerConfig): string {
  const url = new URL(config.url);
  if (url.protocol === "http:") url.protocol = "ws:";
  if (url.protocol === "https:") url.protocol = "wss:";
  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    return `ws://${config.listen.host}:${config.listen.port}`;
  }
  return url.toString().replace(/\/$/, "");
}

export function codexAppServerReadyzUrl(config: CodexAppServerConfig): string {
  const url = new URL(config.url);
  if (url.protocol === "ws:") url.protocol = "http:";
  if (url.protocol === "wss:") url.protocol = "https:";
  const pathname = url.pathname.replace(/\/$/, "");
  url.pathname = pathname && pathname !== "/" ? `${pathname}/readyz` : "/readyz";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function activityFromNotification(
  notification: JsonRpcNotification,
  sessionId: string,
): Omit<AgentActivityDraft, "source" | "targetRecords"> | undefined {
  const params = notification.params;
  const threadId = stringProperty(params, "threadId");
  const turnId = stringProperty(params, "turnId") ?? stringProperty(objectProperty(params, "turn"), "id");
  const itemId = stringProperty(params, "itemId") ?? stringProperty(objectProperty(params, "item"), "id");
  const metadata = compactMetadata({ threadId, turnId, itemId, method: notification.method, params });

  switch (notification.method) {
    case "thread/started":
      return {
        sessionId,
        kind: "status",
        status: "completed",
        summary: `Codex thread started ${stringProperty(objectProperty(params, "thread"), "id") ?? "unknown"}`,
        operation: notification.method,
        metadata,
      };
    case "turn/started":
      return {
        sessionId,
        kind: "status",
        status: "started",
        summary: `Codex turn started ${turnId ?? "unknown"}`,
        operation: notification.method,
        metadata,
      };
    case "turn/completed":
      return {
        sessionId,
        kind: "status",
        status: "completed",
        summary: `Codex turn completed ${turnId ?? "unknown"}`,
        operation: notification.method,
        metadata,
      };
    case "item/agentMessage/delta":
      return {
        sessionId,
        kind: "message",
        status: "streaming",
        summary: `Codex assistant streamed ${truncateSummary(stringProperty(params, "delta") ?? "")}`,
        operation: notification.method,
        metadata,
      };
    case "item/commandExecution/outputDelta":
    case "command/exec/outputDelta":
    case "process/outputDelta":
      return {
        sessionId,
        kind: "command",
        status: "streaming",
        summary: `Codex command output ${itemId ?? turnId ?? "unknown"}`,
        operation: notification.method,
        metadata,
      };
    case "item/fileChange/outputDelta":
    case "item/fileChange/patchUpdated":
    case "turn/diff/updated":
      return {
        sessionId,
        kind: "file_change",
        status: "streaming",
        summary: `Codex file change ${itemId ?? turnId ?? "unknown"}`,
        operation: notification.method,
        metadata,
      };
    case "item/mcpToolCall/progress":
      return {
        sessionId,
        kind: "tool",
        status: "streaming",
        summary: `Codex tool call ${itemId ?? turnId ?? "unknown"}`,
        operation: notification.method,
        metadata,
      };
    case "error":
      return {
        sessionId,
        kind: "error",
        status: "failed",
        summary: `Codex app-server error ${errorSummary(params)}`,
        operation: notification.method,
        metadata,
      };
    default:
      return undefined;
  }
}

async function openJsonRpcConnection(
  url: string,
  dependencies: CodexAppServerDependencies,
  onNotification: (notification: JsonRpcNotification) => Promise<void>,
): Promise<
  CodexAppServerResult<{ request: (method: string, params?: JsonObject) => Promise<unknown>; close: () => void }>
> {
  const operation = "web.codex_app_server.protocol.connect";
  const WebSocketFactory = dependencies.webSocket ?? defaultWebSocketFactory;
  const pending = new Map<
    string | number,
    { readonly resolve: (value: unknown) => void; readonly reject: (reason: Error) => void }
  >();
  let nextId = 1;

  try {
    const socket = WebSocketFactory(url);
    const opened = await new Promise<CodexAppServerResult<CodexAppServerWebSocket>>((resolve) => {
      const timeout = setTimeout(() => {
        resolve({
          ok: false,
          error: codexFailure({
            operation,
            target: url,
            input: { timeoutMs: connectTimeoutMs },
            reason: `timed out after ${connectTimeoutMs}ms waiting for WebSocket open`,
            action: "Start Codex app-server or correct ORIGINIUM_CODEX_APP_SERVER_URL.",
          }),
        });
      }, connectTimeoutMs);
      socket.addEventListener("open", () => {
        clearTimeout(timeout);
        resolve({ ok: true, operation, target: url, data: socket });
      });
      socket.addEventListener("error", (event) => {
        clearTimeout(timeout);
        resolve({
          ok: false,
          error: codexFailure({
            operation,
            target: url,
            input: { event: eventSummary(event) },
            reason: `WebSocket connection failed: ${eventSummary(event)}`,
            action: "Start Codex app-server or correct ORIGINIUM_CODEX_APP_SERVER_URL.",
          }),
        });
      });
    });
    if (!opened.ok) return opened;

    socket.addEventListener("message", (event) => {
      void handleJsonRpcMessage(messageData(event), pending, onNotification);
    });
    socket.addEventListener("close", () => {
      for (const waiter of pending.values()) waiter.reject(new Error("Codex app-server WebSocket closed"));
      pending.clear();
    });

    return {
      ok: true,
      operation,
      target: url,
      data: {
        request(method: string, params?: JsonObject) {
          const id = dependencies.newRequestId?.() ?? nextId++;
          const request: JsonRpcRequest = { id, method, params };
          const response = new Promise<unknown>((resolve, reject) => {
            pending.set(id, { resolve, reject });
          });
          socket.send(JSON.stringify(request));
          return response;
        },
        close() {
          socket.close();
        },
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: codexFailure({
        operation,
        target: url,
        input: {},
        reason: errorReason(error),
        action: "Verify this Node/Bun runtime has a WebSocket implementation and the app-server URL is valid.",
      }),
    };
  }
}

async function handleJsonRpcMessage(
  raw: string,
  pending: Map<
    string | number,
    { readonly resolve: (value: unknown) => void; readonly reject: (reason: Error) => void }
  >,
  onNotification: (notification: JsonRpcNotification) => Promise<void>,
): Promise<void> {
  const message = JSON.parse(raw) as JsonRpcResponse | JsonRpcNotification;
  if ("id" in message) {
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if ("error" in message && message.error) {
      waiter.reject(new Error(`JSON-RPC ${message.id} failed: ${message.error.message}`));
    } else {
      waiter.resolve(message.result);
    }
    return;
  }
  if ("method" in message) await onNotification(message);
}

async function isReady(url: string, fetchImpl: CodexAppServerFetch = fetch): Promise<boolean> {
  try {
    const response = await fetchImpl(url, { method: "GET", headers: { Accept: "application/json, text/plain, */*" } });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForReady(
  url: string,
  child: ChildProcessWithoutNullStreams,
  fetchImpl: CodexAppServerFetch = fetch,
): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }> {
  const startedAt = Date.now();
  let exitReason: string | undefined;
  child.once("error", (error) => {
    exitReason = errorReason(error);
  });
  child.once("exit", (code, signal) => {
    exitReason = `process exited before readyz responded code=${code ?? "null"} signal=${signal ?? "null"}`;
  });

  while (Date.now() - startedAt < connectTimeoutMs) {
    if (exitReason) return { ok: false, reason: exitReason };
    if (await isReady(url, fetchImpl)) return { ok: true };
    await delay(100);
  }
  return { ok: false, reason: `timed out after ${connectTimeoutMs}ms waiting for ${url}` };
}

async function waitForTurnCompletion(isCompleted: () => boolean, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();
  while (!isCompleted()) {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error(`timed out after ${timeoutMs}ms waiting for Codex turn completion`);
    }
    await delay(50);
  }
}

async function safeClose(connection: { close: () => void }): Promise<void> {
  try {
    connection.close();
  } catch {
    // Closing is best-effort after a protocol failure.
  }
}

function defaultWebSocketFactory(url: string): CodexAppServerWebSocket {
  const WebSocketConstructor = globalThis.WebSocket;
  if (!WebSocketConstructor) throw new Error("global WebSocket constructor is not available");
  return new WebSocketConstructor(url);
}

function codexFailure(input: {
  readonly operation: string;
  readonly target: string;
  readonly input: Record<string, unknown>;
  readonly reason: string;
  readonly action: string;
}): CodexAppServerFailure {
  return {
    kind: "codex_app_server_failure",
    operation: input.operation,
    target: input.target,
    input: input.input,
    reason: input.reason,
    action: input.action,
  };
}

function requireStringProperty(value: unknown, property: string, context: string): string {
  const propertyValue = stringProperty(value, property);
  if (!propertyValue) throw new Error(`${context} did not include string property '${property}'`);
  return propertyValue;
}

function objectProperty(value: unknown, property: string): JsonObject | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const propertyValue = (value as Record<string, unknown>)[property];
  if (!propertyValue || typeof propertyValue !== "object" || Array.isArray(propertyValue)) return undefined;
  return propertyValue as JsonObject;
}

function stringProperty(value: unknown, property: string): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const propertyValue = (value as Record<string, unknown>)[property];
  return typeof propertyValue === "string" ? propertyValue : undefined;
}

function compactMetadata(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter((entry) => entry[1] !== undefined));
}

function truncateSummary(value: string): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return "delta";
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed;
}

function errorSummary(params: JsonObject | undefined): string {
  const error = objectProperty(params, "error");
  return truncateSummary(stringProperty(error, "message") ?? JSON.stringify(error ?? params ?? {}));
}

function messageData(event: unknown): string {
  if (event && typeof event === "object" && "data" in event) return String((event as { readonly data: unknown }).data);
  return String(event);
}

function eventSummary(event: unknown): string {
  if (event instanceof Error) return event.message;
  if (event && typeof event === "object" && "message" in event) {
    const message = (event as { readonly message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return String(event);
}

function errorReason(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return error instanceof Error ? error.message : String(error);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
