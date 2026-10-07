# Worked example: "find the chat and integrate" in a host with its own chat stack

A typical existing host: a backend that runs the LLM loop with `ai` + `@ai-sdk/mcp` and streams its **own** SSE
events to a custom frontend (no AI SDK UI messages on the client). Mode B in `discovery.md`.

## What discovery usually finds

| Layer | Look for | Typical fact |
|-------|----------|--------------|
| LLM loop | `streamText`, `fullStream`, `tool-result`, `tool-error` | backend consumes AI SDK stream parts and re-emits its own events |
| SSE events | an event type union (`message`, `tool_progress`, `done`, `error`) | tool results already travel to the client, e.g. `{ type: <toolName>, status, result }` |
| MCP wiring | `createMCPClient({ transport: { type: 'http', url, headers } })` | tools keyed `mcp__<server>__<tool>`; connect timeout; per-server isolation |
| FinamX auth | `FINAMX_HOST_TOKEN`, `FINAMX_MCP_URL` | headers injected server-side: `Authorization: Bearer <host token>`, per-turn `X-User-Id` |
| Admin binding | MCP connections attached to an agent | a tool budget limit (e.g. 128 tools) |
| Client parse | the SSE parser | maps tool events to UI handlers |
| Broker | an existing board | ONE module-level `PubSubBroker` shared by all extension frames |
| Launch | `fetchEmbedLaunch` + `launchToBridgeSession` | the host token must stay on the server |

If there is no hit for `extension.present`, `PresentableAgentUi` or `agent-generated` in the code, the backend half
(MCP connection, auth, user bucket) may already exist and only the prompt and rendering are missing.

## The integration, step by step

1. Backend, MCP: reuse the existing FinamX MCP headers; ensure the chat agent's MCP set includes the FinamX connection.
   Because tools arrive as `mcp__<server>__extension_list` etc., match names with `canonicalToolName()` from
   `tool-result-adapter.ts` (strips the prefix, maps `_` back to `.`). Hide MCP Apps tools (`present_*`,
   `finamx_launch|invoke|action`) from the model unless you implement MCP Apps.
2. Backend, prompt: append `FINAMX_GENERATIVE_UI_INSTRUCTIONS` (`system-prompt.ts`) to the agent's system prompt;
   do not replace it.
3. Backend, stream: forward the raw tool output **and** the tool input (needed for `graph.removeEdge` /
   `graph.removeInstance` ids). Check that results are not redacted before they are sent.
4. Frontend, adapter: in the tool event handler call `decideRender(type, result, input)`; persist the decision (or
   the raw result) with the message, otherwise frames disappear when the history reloads.
5. Frontend, render: below the assistant message render `NativeExtensionFrame` / `AgentGeneratedFrame` from
   `embed-frames.tsx`, passing the shared broker; `platformBase` is the platform base the browser can reach;
   `uiTokens` from the host's own token reader.
6. Frontend, launch: replace any browser-side `fetchEmbedLaunch` with a backend endpoint built like
   `createLaunchHandler` (the host token must never be in the browser bundle).
7. Frontend, graph: if the host already has a board, feed `applyGraphMutation` output into its own edge machinery
   instead of `GraphLayout`.
8. Consent: on 403 `CONSENT_REQUIRED` from Launch show the host's consent UI, or let the agent ask and call
   `extension.install`.

## Lessons for any project

- The chat may already have MCP and auth wired: search `FINAMX_HOST_TOKEN|FINAMX_MCP_URL` before adding anything.
- A custom SSE protocol is fine: the adapter needs only (tool name, tool result, tool input).
- Name mangling (`mcp__server__tool`, dots to underscores) is universal: never compare raw tool names.
- Persist what is needed to re-render, or the conversation history loses its UI.
