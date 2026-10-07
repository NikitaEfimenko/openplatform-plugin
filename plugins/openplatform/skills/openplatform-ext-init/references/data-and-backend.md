# Data, secrets and backend

Rule of thumb: the widget bundle is public (anyone can read it, and the moderator does). Anything that must stay
secret lives on a server you run. Everything else can stay in the browser, which is the easiest path.

## Decision table

| Need | Recommended way | Server? | Manifest |
|---|---|---|---|
| React to what other widgets select | topics (`fdc3.instrument`…) | no | `surfaces.topics.subscribes` |
| Host data: quotes, portfolio, profile | `bridge.platform.invoke('<method>')` | no | scope in `capabilitiesRequested` |
| Public API with CORS | `fetch` from the widget | no | origin in `csp.connect` |
| Public API **without** CORS | tiny proxy you host | yes (proxy) | proxy origin in `csp.connect` |
| User's own account at a service (personal API token) | user enters the token in the widget; keep it in memory or `localStorage`, send it only to that service | no | service origin in `csp.connect` |
| Your API key, client secret, database, paid upstream | backend for frontend (BFF) you run; widget calls it | yes | BFF origin in `csp.connect`, usually `hostBridge.requiresAuthContext` |
| Know which platform user/host is calling your BFF | platform auth context: verified short-lived claim | yes | `requiresAuthContext: true`, scope `auth.context` |
| Process private host data on your server | user-bound s2s (push to your webhook, or pull with a signed request) | yes | `topics` with `delivery: ["s2s"]`, `s2sClient` key for pull |
| Tools for AI agents | your MCP server | yes | `surfaces.mcp` |

## Secrets: what never goes where

- Never in the bundle, `manifest.json`, topics, console logs or URLs.
- Never a shared "widget key" that the browser sends to your server: anyone can copy it from the bundle. Identify
  the caller with the platform auth context instead.
- Your server keeps its secrets in its own environment. The platform does not store your secrets.
- The publisher token (`FINAMX_DEV_TOKEN`) is for submitting only; keep it in `.env` (gitignored), never in code.

## User-entered tokens (no backend)

Good for "connect your own account" widgets (e.g. a trading account token the user already has).

- Show a token screen; keep the token in memory, optionally in `localStorage` with an explicit "remember" choice.
- Send it only to the service origin in `csp.connect`; never publish it to topics.
- Recommend read-only tokens where the service offers them.
- Each version runs on a new origin: users re-enter the token after an update.

## Backend for frontend (BFF)

1. Host it anywhere with HTTPS and CORS that allows the sandbox origin (simplest: allow any origin and rely on the
   auth claim, not on the origin).
2. Declare its origin in `csp.connect`.
3. Authenticate requests with the platform auth context: set `hostBridge.requiresAuthContext: true`, request
   `auth.context`, call `resolveAuthContext(bridge, { jwksUrl, expectedAud: EXTENSION_ID })` in the widget and send
   the resulting token as `Authorization: Bearer`; the BFF verifies it with `verifyPlatformClaim` against the
   platform JWKS (`<portal>/.well-known/jwks.json`). Details: `auth-context.md`.
4. The claim proves the platform session, not access to a third-party API: the BFF still does its own upstream
   auth (OAuth with PKCE started in a popup, server-side code exchange).

## Private host data on your server (user-bound s2s)

When your backend needs, for example, the user's portfolio: the host either pushes topics to your webhook with a
short-lived user-bound token, or your backend pulls through the platform with a signed request. Only after the user
consented and the scope is granted. Full guide: `user-bound-s2s.md`.

## MCP tools

Declare `surfaces.mcp { transport: "streamable-http", url, namespace }`. Hosts reach it only through the platform
gateway; your server keeps its credentials. The URL is an external domain and is reviewed like `csp.connect`.
