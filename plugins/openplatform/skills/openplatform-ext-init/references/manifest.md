# manifest.json

The registry accepts exactly this shape (strict: unknown keys are rejected). Keep the file at the project root.
Tools submit the **last** entry of `versions[]`; for a brand-new extension the whole manifest is sent.

## Root

| Field | Rule |
|---|---|
| `extensionId` | `^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$`, e.g. `com.acme.price-alerts`. Permanent, owned by the first submitter's account. `com.finamx.*` is reserved |
| `displayName` | catalog name |
| `description` | catalog text |
| `summary` | optional, ≤ 280 chars; used in catalog cards and as the tool description for agents |
| `iconUrl` | optional absolute URL |
| `platformSupport` | at least one of `web`, `ios`, `android` |
| `visibility` | `public` (default), `unlisted`, `private` |
| `desiredHostIds` | optional wish list of host ids; it does **not** enable the extension in a host, the moderator does |
| `hostBridge` | optional `{ requiresAuthContext, requiresIdentityContext }` booleans, see `auth-context.md` |
| `versions` | at least one version |

## Version

| Field | Rule |
|---|---|
| `version` | semver `1.2.3` (pre-release `1.2.3-beta.1` allowed); each submission must be higher than every stored one |
| `changelog` | what changed; also the place to justify new scopes and external domains for the moderator |
| `capabilitiesRequested` | ≥ 1 scope, `a.b` format, lowercase, ≤ 64 chars, ≤ 32 entries |
| `surfaces` | `ui`, `topics`, `mcp` (all optional; omit `ui` for headless) |
| `monetization` | optional `{ type: free | one_time | subscription | freemium | trial_then_paid, price, currency, billingInterval, trialDays }`; a free version cannot later become paid |
| `integrity` | optional `{ bundleSha256 }`, only for `embedBundleUrl` without import; tools manage it |

## surfaces.ui

| Field | Rule |
|---|---|
| `renderMode` | `external-embed` (default) |
| `artifact` | `{ sha256, entry }` set by the publish tool after upload; never write it by hand |
| `embedBundleUrl` | alternative to `artifact`: https URL of your hosted bundle (mutually exclusive with `artifact`) |
| `embedEntryPath` | with `embedBundleUrl` only, e.g. `/index.html` |
| `embedSandbox` | **leave it out.** Allowed tokens: allow-scripts, allow-same-origin, allow-forms, allow-popups, allow-modals, allow-downloads. Anything without `allow-same-origin` breaks module script loading |
| `permissions` | optional browser permissions for the iframe (camera, microphone, clipboard…); each one is reviewed |
| `csp` | `{ connect, resource, frame, baseUri }`: bare origins `https://host[:port]`; `resource` also accepts `data:` and `blob:`; max 10 per key; no paths, wildcards or `wss://`. `http://localhost` works only on a local platform |

## surfaces.topics

```json
"topics": {
  "subscribes": [ { "topicType": "fdc3.instrument", "delivery": ["bridge"] } ],
  "publishes": [
    { "topicType": "fdc3.instrument", "delivery": ["bridge"] },
    { "topicType": "com.acme.price-alerts.alert", "delivery": ["bridge"],
      "schema": { "type": "object", "required": ["type", "symbol"],
                  "properties": { "type": { "const": "com.acme.price-alerts.alert" }, "symbol": { "type": "string" } } } }
  ],
  "s2sChannels": { "webhook": { "url": "https://api.acme.com/finamx/topics" } }
}
```

- **Own topics** are named `<extensionId>.<name>` and must carry a JSON Schema.
- **Any other name** is a reference to a host topic (e.g. `fdc3.instrument`, `finamx.filter`): no schema allowed,
  and it works only on hosts that declare it. Publishing an undeclared topic is silently dropped by the host.
- `delivery`: `bridge` (live, between widgets in the browser), `s2s` (to your server through `s2sChannels.webhook`).
- Payloads conventionally carry `type` equal to the topic name.

## surfaces.mcp

```json
"mcp": { "transport": "streamable-http", "url": "https://mcp.acme.com/mcp", "namespace": "acme" }
```

Hosts reach your MCP server only through the platform MCP gateway (tools appear as `<namespace>_<tool>`); they
never call your URL directly. The namespace must be unique on the platform; topics named `<namespace>.<name>` also
count as yours.

## Examples

Widget, artifact, minimum:

```json
{
  "extensionId": "com.acme.price-alerts",
  "displayName": "Price alerts",
  "description": "Set a price alert for the selected instrument and get a toast when it triggers.",
  "platformSupport": ["web"],
  "versions": [{
    "version": "0.1.0",
    "changelog": "First release.",
    "capabilitiesRequested": ["ui.toast", "market.read"],
    "surfaces": {
      "ui": { "renderMode": "external-embed" },
      "topics": { "subscribes": [{ "topicType": "fdc3.instrument", "delivery": ["bridge"] }] }
    }
  }]
}
```

Widget calling an external API:

```json
"ui": { "renderMode": "external-embed", "csp": { "connect": ["https://api.acme.com"] } }
```

Headless (no UI), topics to your server:

```json
"surfaces": { "topics": {
  "subscribes": [{ "topicType": "fdc3.instrument", "delivery": ["s2s"] }],
  "s2sChannels": { "webhook": { "url": "https://api.acme.com/finamx/topics" } } } }
```

## New version

Append a new object to `versions[]` (do not edit published ones: their bytes are frozen after review), raise the
semver, write the changelog. New scopes require users to consent again; new external domains need review again.

## Old formats

| Old | Now |
|---|---|
| `kind: "widget"` | remove |
| `versions[].widget` | `versions[].surfaces.ui` |
| `pubsub: { publishes: ["fdc3.instrument"] }` | `surfaces.topics.publishes: [{ topicType, delivery: ["bridge"] }]` |
| `mcpApp` block | remove; the platform projects MCP Apps from `surfaces.ui` |
| `embedSandbox: "allow-scripts allow-popups"` | remove |
