# Couple The Web Agent To Codex App-Server

Originium's first web app agent runtime will couple directly to Codex
app-server instead of introducing a provider abstraction. The app is an Agent
Workspace whose central feature is unrestricted agent chat, and Codex
app-server already exposes the thread, turn, streaming message, command output,
and file-change activity needed for that experience. A generic agent-runtime
interface is deferred until there is a real second runtime, such as a custom Pi
agent, with concrete incompatibilities to abstract over.

**Consequences**

- The backend owns the Codex app-server process and protocol boundary.
- The first deployment keeps the web backend, Codex app-server, CLI execution,
  and SurrealDB on the same trusted host.
- The browser talks to the Originium backend, not directly to Codex app-server,
  SurrealDB, local files, or the CLI.
- Codex app-server protocol changes may require direct Originium web/backend
  changes; this is accepted to keep the first implementation simpler.
- Splitting agent workers from the backend waits for durable job/session state,
  workspace ownership, Agent Activity stream persistence, cancellation/retry
  behavior, and explicit credential handling.
