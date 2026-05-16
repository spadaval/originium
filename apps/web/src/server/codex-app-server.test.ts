import assert from "node:assert/strict";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import test from "node:test";
import type { SurrealFetch } from "@originium/surreal";
import { readWebRuntimeConfig } from "../config.ts";
import {
  codexAppServerProtocolUrl,
  codexAppServerReadyzUrl,
  ensureCodexAppServer,
  runCodexAppServerSmoke,
} from "./codex-app-server.ts";

type Listener = (event: unknown) => void;

class FakeCodexWebSocket {
  readonly sent: string[] = [];
  private readonly listeners = new Map<string, Listener[]>();

  constructor(readonly url: string) {
    setTimeout(() => this.emit("open", {}), 0);
  }

  addEventListener(type: "open" | "message" | "error" | "close", listener: Listener): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  send(data: string): void {
    this.sent.push(data);
    const request = JSON.parse(data) as { readonly id: number; readonly method: string; readonly params?: unknown };

    if (request.method === "initialize") {
      this.emitJson({
        id: request.id,
        result: { userAgent: "originium-test", codexHome: "/tmp", platformFamily: "unix" },
      });
      return;
    }

    if (request.method === "thread/start") {
      const thread = { id: "codex-thread-1", sessionId: "codex-thread-1" };
      this.emitJson({ id: request.id, result: { thread, model: "gpt-test", modelProvider: "openai", cwd: "/tmp" } });
      this.emitJson({ method: "thread/started", params: { thread } });
      return;
    }

    if (request.method === "turn/start") {
      const turn = { id: "codex-turn-1", status: "inProgress" };
      this.emitJson({ id: request.id, result: { turn } });
      setTimeout(() => {
        this.emitJson({ method: "turn/started", params: { threadId: "codex-thread-1", turn } });
        this.emitJson({
          method: "item/agentMessage/delta",
          params: { threadId: "codex-thread-1", turnId: "codex-turn-1", itemId: "msg-1", delta: "hello" },
        });
        this.emitJson({
          method: "item/commandExecution/outputDelta",
          params: { threadId: "codex-thread-1", turnId: "codex-turn-1", itemId: "cmd-1", delta: "ok" },
        });
        this.emitJson({
          method: "item/fileChange/patchUpdated",
          params: { threadId: "codex-thread-1", turnId: "codex-turn-1", itemId: "patch-1", changes: [] },
        });
        this.emitJson({
          method: "turn/completed",
          params: { threadId: "codex-thread-1", turn: { id: "codex-turn-1", status: "completed" } },
        });
      }, 0);
    }
  }

  close(): void {
    this.emit("close", {});
  }

  private emitJson(message: unknown): void {
    this.emit("message", { data: JSON.stringify(message) });
  }

  private emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

class FailingCodexWebSocket {
  constructor(readonly url: string) {
    setTimeout(() => this.emit("error", { message: "connection refused" }), 0);
  }

  private readonly listeners = new Map<string, Listener[]>();

  addEventListener(type: "open" | "message" | "error" | "close", listener: Listener): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  send(): void {}

  close(): void {}

  private emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

test("derives Codex app-server protocol and readyz endpoints from web config", () => {
  const config = readWebRuntimeConfig({
    ORIGINIUM_CODEX_APP_SERVER_BIND: "127.0.0.1:4101",
    ORIGINIUM_CODEX_APP_SERVER_URL: "http://localhost:4101/api/",
  });

  assert.equal(codexAppServerProtocolUrl(config.codexAppServer), "ws://localhost:4101/api");
  assert.equal(codexAppServerReadyzUrl(config.codexAppServer), "http://localhost:4101/api/readyz");
});

test("starts Codex app-server with the configured host-direct listen target when readyz is unavailable", async () => {
  const config = readWebRuntimeConfig({
    ORIGINIUM_CODEX_APP_SERVER_BIND: "127.0.0.1:4101",
    ORIGINIUM_CODEX_APP_SERVER_URL: "http://127.0.0.1:4101",
  });
  const spawned: Array<{ readonly command: string; readonly args: readonly string[] }> = [];
  let readyzAttempts = 0;

  const result = await ensureCodexAppServer(config, {
    fetch: async () => {
      readyzAttempts += 1;
      return new Response("ok", { status: readyzAttempts >= 2 ? 200 : 503 });
    },
    spawn: (command, args) => {
      spawned.push({ command, args });
      return Object.assign(new EventEmitter(), { pid: 4242 }) as ChildProcessWithoutNullStreams;
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.mode, "started");
  assert.equal(result.data.pid, 4242);
  assert.deepEqual(spawned, [{ command: "codex", args: ["app-server", "--listen", "ws://127.0.0.1:4101"] }]);
});

test("runs a Codex app-server smoke turn and records protocol activity", async () => {
  const config = readWebRuntimeConfig({ ORIGINIUM_CODEX_APP_SERVER_URL: "http://127.0.0.1:3001" });
  const sockets: FakeCodexWebSocket[] = [];
  const activityQueries: string[] = [];
  const activityFetch: SurrealFetch = async (_url, init) => {
    activityQueries.push(String(init?.body));
    return new Response(JSON.stringify([{ status: "OK", result: [{ id: "agent_activity:test" }] }]), { status: 200 });
  };

  const result = await runCodexAppServerSmoke(
    config,
    {
      sessionId: "agent_session:test",
      prompt: "Say hello",
      timeoutMs: 1_000,
    },
    {
      activity: { fetch: activityFetch },
      fetch: async (url) => {
        assert.equal(String(url), "http://127.0.0.1:3001/readyz");
        return new Response("ok", { status: 200 });
      },
      webSocket: (url) => {
        const socket = new FakeCodexWebSocket(url);
        sockets.push(socket);
        return socket;
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.data.messageText, "hello");
  assert.equal(result.data.threadId, "codex-thread-1");
  assert.equal(result.data.turnId, "codex-turn-1");
  assert.equal(result.data.boundary.mode, "attached");
  assert.equal(sockets[0]?.url, "ws://127.0.0.1:3001");
  assert.equal(activityQueries.length, result.data.activityRecordCount);
  assert.match(activityQueries.join("\n"), /operation = "item\/agentMessage\/delta"/);
  assert.match(activityQueries.join("\n"), /kind = "command"/);
  assert.match(activityQueries.join("\n"), /kind = "file_change"/);
  assert.doesNotMatch(activityQueries.join("\n"), /change_log/);
});

test("reports concrete smoke failure when the app-server websocket cannot connect", async () => {
  const config = readWebRuntimeConfig({ ORIGINIUM_CODEX_APP_SERVER_URL: "http://127.0.0.1:3001" });

  const result = await runCodexAppServerSmoke(
    config,
    { sessionId: "agent_session:test", prompt: "Say hello", timeoutMs: 1_000 },
    {
      fetch: async () => new Response("ok", { status: 200 }),
      webSocket: (url) => new FailingCodexWebSocket(url),
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.operation, "web.codex_app_server.smoke");
  assert.equal(result.error.target, "ws://127.0.0.1:3001");
  assert.match(result.error.reason, /WebSocket connection failed.*connection refused/);
  assert.match(result.error.action, /ORIGINIUM_CODEX_APP_SERVER_URL/);
});
