# GAPs — what the SDK does not provide today

Each item: what is missing (verified in code), the workaround that works today, the proposed ADDITIVE SDK addition.
Do not "fix" a GAP by editing `@finamx/*` inside a host project; use the workaround and report the GAP.

## GAP-1 `ExtensionEmbedFrame` is single-frame only
- Verified: `@finamx/host-bridge` `ExtensionEmbedFrame` props have no `pubSubBroker`, `mintIdentity`,
  `mintAuthContext`, `fdc3DesktopAgent`, `platformBase`/`sessionJwt`. Only `useExtensionEmbed` has them.
- Workaround: `useExtensionEmbed` (see `embed-frames.tsx`). `ExtensionEmbedFrame` is fine for ONE isolated frame that needs no interop.
- Proposed: make `ExtensionEmbedFrame` a thin wrapper over `useExtensionEmbed` and forward the same options (additive props).

## GAP-2 No multi-frame layout helper, no graph -> frames mapping
- Verified: host-bridge exports `PubSubBroker`/`pubSubBroker`, `useExtensionEmbed`, `HostEventSinkRegistry`, but nothing that renders N frames
  from a graph snapshot. Reference hosts do it privately in their own board code.
- Workaround: `graph-layout.tsx` (`applyGraphMutation`, `graphToFrames`, `applyEdgesToBroker`, `useSharedBroker`, `GraphLayout`).
- Proposed: move the pure parts to `@finamx/bridge-protocol` graph module (`applyGraphMutation`, `graphToFrames`) and the React part to
  `@finamx/host-bridge` (`<GraphFrameHost>`), plus `usePubSubBroker(hostDomain)`.

## GAP-3 Edges are advisory: no edge-scoped routing, no instance identity for the extension
- Verified: `PubSubBroker.publish` fans out to every subscriber of `${channel}:${topicType}`; `setEdgeTopicSchema` only ADDS a schema check for
  that channel+topic. `instanceId` / graph `config` are never sent to the extension (no `instanceId` in host-bridge / CMS launch / extension-sdk;
  `HostContext` has theme, locale, platform, appVersion, uiTokens, embedLayout only). The extension picks its channel itself
  (`bridge.context.subscribe(topic, handler, { channel })`, default `"default"`).
- Consequence: with one broker, every frame subscribed to the same topic on the same channel hears every publisher, edge or no edge;
  an edge does not "connect" two frames, it validates a topic on a channel. Two instances of the same extension on one broker will cross-talk.
- Workaround: (a) put interlinked frames on one broker, unlinked groups on separate brokers (`new PubSubBroker()` per group);
  (b) for agent HTML pass the edge's channel explicitly (`__finamx.subscribe(topic, h, channel)`) and tell the model the channel;
  (c) treat the edge as documentation + schema.
- Proposed: `PubSubBroker.setEdgeRoutes(edges, sessionIdByInstanceId)` (deliver only source -> target), `useExtensionEmbed({ instanceId })`,
  and a `platform:event` `host:instance` `{ instanceId, channels }` push so extensions can learn their channel.

## GAP-4 `extension.present({ extensionId })` is not renderable as returned
- Verified: the platform MCP `extension.present` handler builds `embedUrl = ${cmsBase}/preview/<extensionId>[/<route>]`,
  spec `external-embed`, no `launchUrl`. CMS `/preview/[slug]` only serves DivKit Widgets slugs and calls `notFound()` otherwise (404).
  The tool description itself says "Launch remains for real extension sessions". `route` is only baked into that dead URL.
- Workaround: `decideRender` maps `spec: external-embed + extensionId` -> `native-extension` and the host runs Launch (`fetchEmbedLaunch`).
  `route` is NOT delivered to the extension by any SDK path; do not promise deep links.
- Proposed: envelope gets an additive `launch: { extensionId, version? }` hint and `embedUrl` stays for legacy; or CMS serves `/preview/<extensionId>`
  as a moderator-style Launch page.

## GAP-5 HTML / DivKit cannot host extensions or share a bridge inside one layout
- Verified: agent DivKit allows only `finamSparkLine`, `finamNewsCard`, `webEmbed` (`DEFAULT_AGENT_CUSTOM_TYPES`; anything else is stripped);
  `webEmbed` takes a plain URL, no bridge, no broker. Agent HTML is one document in one iframe; `frame-src 'none'`.
  `finamExtensionEmbed` exists only as an `assertExternalEmbedPolicy` marker for CMS-authored DivKit.
- Workaround: the host lays out several `NativeExtensionFrame` / `AgentGeneratedFrame` on ONE shared broker (`GraphLayout`).
  For host-authored (not agent) DivKit you can map custom components via `DivKitJsonHost customComponents` from `@finamx/host-bridge/widgets`.
- ROADMAP, NOT BUILT: DivKit custom types `finamExtension` and `agentHtml` (mixed DivKit + mounted extensions + agent HTML sharing one bridge).
  Do not emit them; do not write code that expects them.

## GAP-6 MCP Apps projection is narrow and needs a host-supplied sandbox proxy
- Verified: `decideProjection` (bridge-protocol `mcp-apps.ts`) only projects published, `hasUi`, non-divkit, artifact-mode, exactly one `.html` file;
  legacy `embedBundleUrl` => text-only (`legacy_embed_bundle`), multi-file => `multi_file_artifact`; cap `MAX_PROJECTED_TOOLS = 20`.
  A projected single-file artifact is an MCP-Apps-only build (FinamX sandbox CSP forbids inline script, security.md rule 16).
  `@ai-sdk/react` `experimental_MCPAppRenderer` needs `sandbox.url` = a page YOU host on another origin; the SDK ships none.
  Inside an MCP App the host-bridge/PubSub is NOT available (views talk through app-only `finamx_launch|invoke|action` tools).
- Workaround: MCP Apps only for hosts that want the standard protocol; keep Launch + host-bridge as the default; always keep the text fallback.
- Proposed: ship a static, versioned sandbox proxy page (`@finamx/host-bridge/mcp-apps-sandbox`) and a `finamx_invoke` <-> CapabilityRouter adapter.

## GAP-7 Agent HTML travels in the URL and is served from the CMS origin
- Verified: `buildAgentHtmlEmbedUrl` -> `${cms}/widget/html-inline?html=<base64url>&trust=agent-generated` (uses Node `Buffer`: server only).
  Limit is 512 KB of HTML, i.e. a ~700 KB URL; reverse proxies commonly cap URLs far lower (not measured here: test yours; keep documents small).
  The route answers with `frame-ancestors *`, and the host frame sandbox (`DEFAULT_EMBED_SANDBOX`) includes `allow-same-origin`
  because the bridge filters by `event.origin`; CSP `connect-src 'none'` is the exfiltration barrier.
- Workaround: instruct the model to stay small (compact HTML, no big inline data); use `extension.present`/Launch for heavy UIs.
- Proposed: `POST /widget/html-inline` that stores the document and returns an opaque id URL; serve it from the sandbox origin.

## GAP-8 No chat-side building blocks in the SDK
- Verified: no exported chat hook/component that maps a tool part to a renderer, no consent UI, no theme-token reader
  (reference hosts implement a consent overlay and a host UI tokens hook).
- Workaround: `chat-part-renderer.tsx`, `tool-result-adapter.ts`, `embed-frames.tsx` (consent slot), `ui-tokens.ts` from `openplatform-host-init`.
- Proposed: `@finamx/host-bridge/chat` exporting `decideRender`, `GenerativeToolPart`, `ConsentGate`.

## GAP-9 Graph change notification reaches the browser only through the tool result (or your own backend fan-out)
- Verified: `hostEventSinkRegistry` is in-process to the MCP process; the MCP registers webhook sinks from env `FINAMX_HOST_EVENT_SINKS`
  (`{ "<hostId>": { "url": "...", "token": "..." } }`, POST of a `GraphEvent`, 3 s timeout). No SSE/WebSocket client helper exists in the SDK.
  `graph.*` tool results carry `sinkDelivered` / `sinkListeners`; `false` is still a successful mutation.
- Workaround: in-chat flows parse the `graph.*` tool result (`decideRender` -> `graph-mutation`); on reload hydrate from
  `GET /api/v1/hosts/self/graph` (`createGraphHandler`). Cross-tab/other-user sync: your backend receives the webhook and pushes to clients.
- Proposed: `createGraphEventStream(hostId)` SSE helper next to `HostEventSinkRegistry`.
