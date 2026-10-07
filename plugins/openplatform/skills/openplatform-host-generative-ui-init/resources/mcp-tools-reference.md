# Platform MCP reference (verified against the platform MCP server)

Endpoint `POST {MCP_CATALOG_URL|https://openplatform-mcp.changesandbox.ru}/mcp`, MCP Streamable HTTP, stateless (new server per request, no `Mcp-Session-Id`).
`GET /health` is ungated. Shared platform: `https://openplatform-mcp.changesandbox.ru/mcp`; local platform: MCP :3100, CMS :3001.

| Header | Required | Notes |
|--------|----------|-------|
| `Authorization: Bearer <FINAMX_HOST_TOKEN>` | yes | 401 `host token required` / 403 invalid or suspended. Also accepted as `?apikey=` / `?hostToken=` on the URL (do not use: leaks in logs). |
| `X-User-Id: <end-user id>` | for anything per-user | Becomes the "bucket". Missing: `extension.install` -> tool_error `BUCKET_REQUIRED`; `present_*`/`finamx_launch` -> 400 `BUCKET_REQUIRED`; `installed` flags in `extension.list` come back empty. |
| `Host:` | must be allowed | DNS-rebinding allowlist: localhost, 127.0.0.1, [::1], host.docker.internal; extend with MCP process env `MCP_ALLOWED_HOSTS` (comma list). |

MCP process env you may need to know: `FINAMX_API_BASE` (server -> CMS), `FINAMX_CMS_PUBLIC_BASE` / `CMS_PUBLIC_URL` (browser-facing origin baked into `embedUrl`;
must be HTTPS in prod and reachable from the user's browser), `FINAMX_FF_APPS` (default `host`), `FINAMX_FF_ENVS`, `FINAMX_HOST_EVENT_SINKS`.

## Tools

| Tool | Args (zod) | Result |
|------|-----------|--------|
| `extension.list` | `hasUi?`, `tags?[]`, `search?`, `platform?` (`web|ios|android`), `apps?[]`, `envs?[]`, `featureFlags?` | text JSON array of `ExtensionCatalogItem`: `extensionId, hasUi, displayName, description, platformSupport, publisher, latestVersion, capabilitiesRequested, installed, grantedScopes?, pubsub{publishes,subscribes,topics{publishes,subscribes}}`. Empty until admin saves availability for this host. (`AGENTS.md` mentions `kind`; the code has NO `kind` arg.) |
| `extension.get` | `extensionId` | one item (same fields, incl. `integrityStatus`), or tool_error `ExtensionNotFound` |
| `extension.schema` | `extensionId` | `{extensionId, displayName, platformSupport, capabilitiesRequested, latestVersion, publishes[], subscribes[], topics{...}}` |
| `extension.install` | `extensionId`, `grantedScopes[] (min 1)` | CMS install JSON `{userId, install{extensionId, grantedScopes, installedAt}}`; needs `X-User-Id` |
| `extension.present` | XOR `html` / `divkitJson` / `extensionId` / `slug` (deprecated); + `route?`, `targetWidgetId?` (uuid), `vizSourceTopic?`+`title?` (html/divkit only), `pubsub?{publishes[],subscribes[]}` | `structuredContent` = `PresentableAgentUi`, plus the same JSON as text. Error: `tool_error` `InvalidRenderTarget` / `ValidationFailed`. |
| `compose` | XOR `html` / `divkitJson`; `title?`, `vizSourceTopic?`, `pubsub?`, `targetWidgetId?`; `intent?`/`context?` DEPRECATED + ignored (a warning text part is appended) | same envelope (`widgetSlug: compose:<slug>`). Validates `pubsub` topics against `GET /api/v1/hosts/self/domain` (error text lists allowed topics). Never calls an LLM. |
| `get_host_domain` | none | `{ ok, hostId, domain: { topics[{topicType,...}], methods[], consentMatrix[] } }` |
| `capability.list` | `type?` (accepted, not applied) | `{ capabilities: [...] }` |
| `graph.addInstance` | `extensionId`, `instanceId?`, `label?`, `config?` | `{ ok, instance{instanceId, extensionId, label?}, sinkDelivered, sinkListeners }` (201 upstream) |
| `graph.removeInstance` | `instanceId` | `{ ok, removed, removedEdgeIds, sinkDelivered, sinkListeners }` |
| `graph.applyEdge` | `sourceInstanceId`, `targetInstanceId`, `channel`, `contextType`, `edgeId?`, `direction?` (`forward|bidirectional`), `schemaRef?`, `schema?` | `{ ok, edge{edgeId, source/target, channel, contextType, direction, schemaRef?, schema?}, sinkDelivered, ... }`; errors `tool_error` in `{INSTANCE_NOT_FOUND, MISSING_CONTEXT_TYPE, DOMAIN_GATED, EDGE_VALIDATION_FAILED, HOST_DOMAIN_UNAVAILABLE, GRAPH_REQUEST_FAILED}` |
| `graph.removeEdge` | `edgeId` | `{ ok, removed, sinkDelivered, sinkListeners }` |
| `divkit.list` / `divkit.get` | deprecated built-in DivKit slug catalog, NOT the Registry | do not use |
| `present_<extensionId>` | none (MCP Apps projection, model-only) | text fallback + `structuredContent {extensionId, version, mode: 'inline'|'shell', displayOnly, enforcement: 'csp'|'none', permissions, ui: 'app'|'text', reason?, integrityStatus?}` (; adds `integrityStatus` here, in `_meta["finamx/present"].finamx.integrityStatus` and as a fixed integrity sentence in the description/text; `drift` degrades the item to `ui: 'text'` with reason `integrity_drift`; `unverified` and `approved-by-migration` still render the app; was `ui: 'mcp-app'` with title/summary in 87); `_meta.ui.resourceUri = ui://finamx/<id>/<version>` on eligible ones |
| `finamx_launch` / `finamx_invoke` / `finamx_action` | app-only (`_meta.ui.visibility ["app"]`) | never show to the model; `finamx_launch` token only in result `_meta["finamx/launch"]`; `structuredContent.integrityStatus` (never in `_meta`); CMS 409 maps to tool_error `EXTENSION_INTEGRITY_DRIFT` (not retryable until healed), 503 `INTEGRITY_STATE_UNAVAILABLE` retry after 5 s |

Graph tools are host-scoped (keyed by the host resolved from the Bearer token), not per-user. Old names (`list_widgets`, `widget.render`,
`workspace.launchWidget`, ...) no longer exist.

Resources: `extensions://catalog` (JSON of all items), `ui://finamx/{extensionId}/{version}` (MCP Apps).

## Envelope `PresentableAgentUi` (`@finamx/bridge-protocol/agent-ui`, strict zod)

`type: 'generative_ui'`, `schemaVersion: 1`, `spec` in `divkit | compose | compose-html | external-embed | html | a2ui-passthrough`, `embedUrl` (required),
`previewUrl?`, `launchUrl?`, `widgetSlug?`, `extensionId?`, `title?` (<=120), `vizSourceTopic?`, `uiResource?` (`ui://...`), `mimeType?`, `platformSupport?`,
`trustClass?` (`standard-divkit | custom-by-id | trusted-web-embed | agent-generated`), `ephemeral?`, `action` (`present|update`, default present),
`targetWidgetId?` (uuid; required when action=update), `fingerprint?`, `pubsub?{publishes,subscribes}`, `validation?{version,warnings}`, `divkitJson?`, `rawForeign?`.
Unknown keys and anything matching the deny list (scopes/tokens; `AGENT_UI_FORBIDDEN_KEYS`) are REJECTED by `safeParsePresentableAgentUi`. It NEVER carries
`grantedScopes`: scopes come from the server install record at Launch.

| Producer | spec | trustClass | embedUrl |
|----------|------|-----------|----------|
| `compose` / `extension.present` with `html` | `compose-html` | `agent-generated` (+ `ephemeral: true`) | `${CMS_PUBLIC}/widget/html-inline?html=<base64url>&trust=agent-generated` |
| ... with `divkitJson` | `compose` | `agent-generated` | `${CMS_PUBLIC}/widget/inline?json=<base64url>&trust=agent-generated` (envelope also has `divkitJson`) |
| `extension.present({extensionId})` | `external-embed` | (unset) | `${CMS_PUBLIC}/preview/<extensionId>[/route]` -> 404; ignore, Launch instead |
| `extension.present({slug})` deprecated | `divkit` | - | widget embedUrl |

## Launch (CMS) `POST /api/v1/embed/launch`
Body `{ extensionId, version?, hostOrigin?, userId }`; headers `Authorization: Bearer <host token>`, `X-User-Id`, `Origin`.
Gates (do not rely on their order): host token (401 `HOST_TOKEN_REQUIRED`, 403 `INVALID_HOST_TOKEN` / `HOST_SUSPENDED`, 429 `HOST_TOKEN_RATE_LIMITED`), host origin (403 `ORIGIN_NOT_ALLOWED`),
extension available for this host (403 `EXTENSION_NOT_AVAILABLE`), user installed (403 `CONSENT_REQUIRED`), billing (402 `PAYMENT_REQUIRED` / 503 `ENTITLEMENT_UNAVAILABLE`), integrity (409 `EXTENSION_INTEGRITY_DRIFT` / 503 `INTEGRITY_STATE_UNAVAILABLE`),
UI resolvable (503 `EMBED_UI_UNAVAILABLE`, `SANDBOX_ORIGIN_NOT_CONFIGURED`), missing user (400 `BUCKET_REQUIRED`).
Response `LaunchResponse`: `launchUrl, bridgeSessionId, allowedOrigin, grantedScopes, expiresAt, extensionId, maxEmbedHeight, embedLayout?, sessionJwt?,
embedPolicy{allow,sandbox}?, entitlement?, integrityStatus?, trustClass?, requiresIdentityContext?, requiresAuthContext?, exchangeCode?, redeemUrl?, uiContext?, enforcement?`.
Launch JWT TTL is short (reload after expiry needs a fresh Launch).
