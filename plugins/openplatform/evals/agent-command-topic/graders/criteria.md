---
type: llm
weight: 1
---

A good answer:
- says the platform does not let an agent write `bridge.state`; only the widget writes it;
- designs an input topic `<extensionId>.<name>` with a schema in `surfaces.topics.subscribes[]`; the widget subscribes, applies the command to the screen, then persists the result with `bridge.state.set`, so the next open shows it;
- says the host (or its agent) publishes to that topic, and that `agentVisible: true` lets the agent read the current state of the acting user (with a warning that everything in the state becomes readable to it);
- says a vendor MCP server (`surfaces.mcp`) is for vendor settings not tied to one placement, because the gateway forwards the host user id, not the `uh_` handle; per-screen changes go through the input topic.
Fail if it has the agent or the vendor MCP write `bridge.state` directly.
Fail if it lets the command only change the screen without persisting it.
