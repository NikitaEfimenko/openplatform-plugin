# Finding the chat / agent surface in an unknown project

Run these from the project root (skip `node_modules`, `.next`, `dist`). Report one line per hit, then decide the integration mode.

```bash
# 1. LLM / chat wiring
grep -rIlE "useChat|streamText|generateText|createMCPClient|experimental_createMCPClient|@ai-sdk/|from 'ai'|toUIMessageStreamResponse|convertToModelMessages" --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist .
# 2. Other stacks (no AI SDK)
grep -rIlE "openai|anthropic|langchain|litellm|EventSource|text/event-stream|tool_calls|tool_use|event: tool" --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist . | head -40
# 3. UI: message lists, tool renderers, agent panels
grep -rIlE "message\.parts|parts\.map|ToolUIPart|isToolUIPart|tool-invocation|toolInvocations|AgentPanel|ChatWindow|ChatMessage|onToolCall|tool_progress" --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist .
# 4. Chat routes / gateways
find . -path ./node_modules -prune -o \( -path "*api/chat*" -o -path "*api/agent*" -o -name "*chat*controller*" -o -name "*chat*route*" \) -print | head
# 5. Already-integrated FinamX pieces
grep -rIlE "@finamx/(host-bridge|bridge-protocol)|FINAMX_HOST_TOKEN|fetchEmbedLaunch|3100/mcp|MCP_CATALOG_URL" --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist .
```

## Decision by what you found

| Found | Mode | What to change |
|-------|------|----------------|
| `streamText` on server + `useChat` on client (AI SDK UI messages) | A. AI SDK | server: `mcp-connect.server.ts` (add MCP tools + system prompt); client: `chat-part-renderer.tsx` inside the message parts loop. |
| AI SDK on server but a custom stream to the client (SSE events, own message model) | B. Custom stream | server: same MCP wiring; make the stream carry tool name + tool input + tool RESULT (JSON) per call; client: call `decideRender(name, result, input)` in your event handler and render the same switch. Reference: `extensions/ |
| A different LLM stack (own tool loop, OpenAI SDK, LangChain, Nest service) | C. Generic | Use an MCP client for that stack against the same endpoint/headers (`mcp-tools-reference.md`); the adapter + frames are framework-neutral. Tool names may be prefixed/renamed: `canonicalToolName` handles `extension_list` and `mcp__<server>__extension_list`. |
| Mobile / non-web (Flutter, native) | D. Not this skill's React templates | Same MCP + Launch contract; render with a WebView using `launchUrl` and `allowedOrigin` filtering; Flutter and native hosts follow the same protocol. |
| No chat at all | stop | Ask whether to create one; otherwise use `openplatform-host-init`. |

## Checklist while reading the chat code

- Where is the tools object built? (that is where MCP tools are merged)
- Where is the system prompt? (append `FINAMX_GENERATIVE_UI_INSTRUCTIONS`, do not replace the host's own prompt)
- Is there a tool-call cap (`stopWhen`, max steps, MAX tools)? Chains need ~12 steps; the catalog exposes ~14 tools + up to 20 `present_*` + 3 app-only.
- Are tool RESULTS persisted and replayed on reload? If only text is persisted the frames vanish: persist the tool part (or re-derive from `GET /api/v1/hosts/self/graph` for graphs).
- Is there an existing iframe/embed component or a shared PubSubBroker? Reuse it; there must be exactly ONE broker per screen.
- Which user id does the backend trust? It goes into `X-User-Id` (MCP) and `userId` (Launch). Never take it from the model or from the URL.
- Is the LLM call in a browser? Then the host token would leak: move the MCP client to a server route first.
