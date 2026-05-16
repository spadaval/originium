# Separate Agent Activity From Change Log

Originium will persist embedded-agent runtime events as Agent Activity records
instead of overloading Change Log entries. Change Logs remain mutation history
for Graph Wiki inspection and undo, while Agent Activity records capture
session events such as streamed messages, command execution, tool calls, status
changes, and errors. The web Agent Activity Log can render both together, but
the database keeps them distinct so routine runtime chatter does not obscure
Graph Wiki mutation history.

This separation is also a prerequisite for moving agent workers off the
host-direct web backend later. While the backend owns Codex app-server and
CLI/RPC execution on the same host, it can persist Agent Activity directly.
Remote workers need a durable activity stream contract before their events can
be trusted as part of the same Agent Session timeline.
