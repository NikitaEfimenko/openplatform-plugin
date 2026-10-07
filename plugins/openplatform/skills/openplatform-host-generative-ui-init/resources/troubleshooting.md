# Troubleshooting (symptom -> cause -> fix)

| Symptom | Cause | Fix |
|---------|-------|-----|
| `extension.list` returns `[]` | No `extension-host-availability` rows saved for THIS host (visibility != availability), or wrong host token | Payload `/admin` -> save availability for the host; confirm the token belongs to that host (`POST {CMS}/api/v1/hosts/verify`) |
| MCP `401 Unauthorized: host token required` | No `Authorization: Bearer` on POST `/mcp` | Add header (server side) |
| MCP `403 Forbidden: invalid or suspended host token` | Token revoked/rotated/host suspended | Issue key again in `/admin` -> Hosts |
| MCP 403 (Host header rejected) | DNS-rebinding allowlist | Add the hostname to MCP env `MCP_ALLOWED_HOSTS` |
| `tool_error BUCKET_REQUIRED` from `extension.install`; `present_*`/`finamx_launch` 400 | No `X-User-Id` on the MCP request | Send the end-user id on every MCP request |
| Launch `401 HOST_TOKEN_REQUIRED` | Token missing on Launch (Bearer) | Server-side `fetchEmbedLaunch({ hostToken })`; `?hostToken=` is refused in production |
| Launch `403 INVALID_HOST_TOKEN` / `HOST_SUSPENDED` / `ORIGIN_NOT_ALLOWED` | Bad token, suspended host, or the host page origin is not in the host's allowed origins | Fix token; add your origin to `Hosts.allowedOrigins` |
| Launch `403 EXTENSION_NOT_AVAILABLE` | Extension removed from this host's availability | Re-add availability |
| Launch `403 CONSENT_REQUIRED` ("is not installed") | User has not consented | Consent UI -> `extension.install` / `POST /api/v1/users/me/extensions/{id}/install` -> retry Launch |
| Launch `400 BUCKET_REQUIRED` | No `userId` / `X-User-Id` | Pass the real user id |
| Launch `402 PAYMENT_REQUIRED` | Definite billing denial (`not_entitled`, `expired`, or paid ext with no host SKU) | Show the payment wall (`useLaunchErrorWall`); checkout is the HOST's own flow, the platform has no payment link |
| Launch `503 ENTITLEMENT_UNAVAILABLE` (+ `Retry-After`) | Billing provider outage; fail-closed | Retry after `retryAfterSeconds`; NEVER show a payment wall for this |
| Launch `503 EMBED_UI_UNAVAILABLE` | Extension has no embeddable UI (headless) or no bundle | Do not Launch headless ones (`hasUi === false`) |
| Launch `503 SANDBOX_ORIGIN_NOT_CONFIGURED` | Artifact-mode extension but CMS has no `EMBED_SANDBOX_ORIGIN` | Ops: configure sandbox origin (wildcard DNS/TLS) |
| Launch `429 HOST_TOKEN_RATE_LIMITED` | Too many launches per host key | Back off; cache Launch per mounted frame, do not Launch on every re-render |
| Invoke (from extension) 402 / 503 | Same billing contract on `/api/v1/invoke` | Treat a 402 as a wall trigger (`setWall({visible:true, reason:'payment'})`) |
| Blank iframe, no `bridge:ready` | `allowedOrigin` set to the host page origin instead of `session.allowedOrigin` (embed origin); or iframe not the one the bridge was created for | Use `session.allowedOrigin` |
| Blank iframe, console "Refused to frame" / CSP | Frame-ancestors of the embed, or your page CSP has no `frame-src` for the CMS/sandbox origin | Add CMS public origin and the sandbox origin (`*.<EMBED_SANDBOX_ORIGIN host>`) to your `frame-src`; for agent HTML CMS answers `frame-ancestors *` |
| Agent HTML shows but `__finamx.subscribe` never fires | Frame not created through `useExtensionEmbed` with a `pubSubBroker` (stub `bridge:hello` unanswered), or no other frame on the same broker/channel, or topic not in host domain | Use `AgentGeneratedFrame`; one broker; `get_host_domain` topics |
| Agent HTML: fetch/XHR/WebSocket fail | By design: `connect-src 'none'`, `frame-src 'none'` | Inline data or pubsub; never network |
| `compose` -> `ValidationFailed` | Invalid HTML (external script src, `<iframe>/<object>/<embed>`, `javascript:`, > 512 KB) or bad DivKit card / > 256 KB | Fix the generated UI (the message lists the reason) |
| `compose` error "Topic(s) not declared by this host" | `pubsub` topics not in the host domain | `get_host_domain`; use only declared topics |
| Iframe of `extension.present({extensionId})` is 404 | `/preview/<extensionId>` is not a route (only DivKit slugs) | Do not iframe `embedUrl`; Launch (`decideRender` does this) |
| Frames do not talk to each other | Each frame got its own broker/singleton mismatch (hot reload, two package copies), or channel differs | One `PubSubBroker` instance (module singleton or `useSharedBroker`); same `channel`; one copy of `@finamx/host-bridge` in the bundle |
| `CAPABILITY_DENIED` / publish dropped | `trustClass 'external'` publishing a gated topic (or `needsScope` in the host consent matrix) | Declare the topic in the host domain consent matrix or use a non-gated topic |
| `INVALID_PUBSUB_PAYLOAD` | Payload violates the host topic schema or the edge schema | Fix the payload; inspect `get_host_domain` / edge `schema` |
| `SCOPE_DENIED` from `platform:invoke` | Method's scope not in `grantedScopes` (agent HTML only has `widget.render`) | Grant at install time (extensions) / widen `grantedScopes` deliberately for agent HTML |
| `graph.applyEdge` -> `DOMAIN_GATED` | Topic is gated (sensitive / `needsScope`) and target is not first-party (`com.finamx.*`) | Choose another topic |
| `graph.*` result has `sinkDelivered: false` | No host sink registered on the MCP process | Not an error: graph is saved on the platform; render from the tool result or `GET .../graph` |
| MCP tools missing in the model, dots rejected | Provider rejects `.` in tool names | `toModelTools` renames to `extension_list` |
| Model calls `present_*` and nothing renders | MCP Apps tools exposed without an MCP Apps renderer | Filter them (`toModelTools`) or implement `mcp-apps-chat.tsx` |
| Frames vanish on reload | Tool results not persisted with the message | Persist decision/tool part; re-hydrate graph from `GET /api/v1/hosts/self/graph` |
| Two widgets open the same instance twice | Launch per render | Key frames by instanceId/toolCallId, keep state above the message list |
