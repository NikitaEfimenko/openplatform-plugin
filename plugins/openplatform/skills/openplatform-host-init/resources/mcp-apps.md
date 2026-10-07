# MCP Apps: host extensions in external chat clients (Claude.ai, ChatGPT)

The platform MCP (`mcp-catalog`) projects, per host and per user bucket:

| Surface | Who sees it | Purpose |
|---------|-------------|---------|
| `present_<extensionId>` | model (`_meta.ui.visibility: ["model"]`) | opens the view; `_meta.ui.resourceUri = ui://finamx/<id>/<version>` |
| `finamx_launch`, `finamx_invoke`, `finamx_action` | view only (`["app"]`) | launch handle (only in result `_meta`), scoped invoke through `/api/v1/invoke` |
| `ui://finamx/<id>/<version>` | chat client | single-file HTML view, `_meta.ui.csp` from the manifest `csp` |
| `extension.list/get/schema` | model | catalog of the host's available extensions |

Every host-available UI extension projects: single-file artifacts and platform-inlined static
multi-file artifacts as `inline`; `embedBundleUrl`, SSR and dynamic multi-file as `shell` (FinamX shell + nested frame +
Host Bridge relay). Reach is per client: claude.ai web refuses nested frames, so `shell` extensions fall back to
"Open in FinamX" (needs `FINAMX_PUBLIC_APP_URL`) or text there; single-file MCP App builds render everywhere.

## Host prerequisites (same as the base host)

1. Host record + key (`/admin` → Hosts → Issue key). **One active key per host**: Issue key deletes the previous keys,
   so every server of the host (web backend, MCP relay) reads the same secret.
2. extension-host-availability for the extensions the chats should offer.
3. User consent per extension (`POST /api/v1/hosts/{hostId}/users/{userId}/extensions/{id}/consent` with the host key,
   body `{"grantedScopes":[…]}`); without it the view shows `CONSENT_REQUIRED`.

## Two ways to run it

| | Test (now) | Production |
|---|------------|-----------|
| Path | Claude.ai → tunnel → platform MCP UAT listener → CMS | Claude.ai → **your MCP server** (OAuth 2.1, relay) → platform MCP → CMS |
| Auth | secret path, no user login; `NODE_ENV=development` only | your authorization server; token audience = your MCP URL |
| Bucket | one fixed test id | your user id from your verified token |
| Host | a **dedicated sandbox host** (never a real host key) | your real host |
| How | ask the platform team for a UAT listener on a sandbox host | skill `openplatform-host-generative-ui-init` step 6b (`host-mcp-apps-server.ts`) |

## Rules

- Host key server-side only; the chat client never receives it.
- Bucket only from a verified token, never from the request.
- Consent from the user's own flow, not from a model-called `extension.install`.
- The chat client enforces the view CSP; external APIs work only if declared in the manifest `csp.connect`.
- `present_*` for a newly available extension appears after the chat client reconnects (no `list_changed` from a stateless server).

## Integrity

Extensions that run from an origin the platform does not own are moderated and monitored. The state is the optional `integrityStatus` object `{ state, reason, checkedAt? }` (no URLs, hashes or credentials). Read it from the catalog (`GET /api/v1/extensions` items), from `POST /api/v1/embed/launch` (`LaunchResponse`) and, for MCP Apps, from `present_*` / `finamx_launch` (see the generative-UI `mcp-tools-reference.md`).

| `state` | Meaning | Host behaviour |
|---------|---------|----------------|
| `verified` | content-addressed artifact, matched declared hash, or platform-rendered | no marker needed |
| `unverified` | cannot be verified (no declared hash, unreachable, domains not approved, not yet checked) | stays available; show a neutral "unverified" marker, never hide it |
| `approved-by-migration` | grandfathered domains awaiting moderator confirmation | stays available; show a marker |
| `drift` | the reviewed bundle or origin changed | do not offer launch; launch returns 409 |

Errors on launch:

- 409 `EXTENSION_INTEGRITY_DRIFT`: show "temporarily unavailable". Not retryable in a loop; offer launch again only after the catalog shows a non-drift state (it heals by itself when the author restores the reviewed bytes or origin). The extension is not suspended.
- 503 `INTEGRITY_STATE_UNAVAILABLE`: fail-closed lookup failure; retry after 5 s (`Retry-After`, `retryAfterSeconds`), a few times at most.

Re-consent: installed extensions in the catalog and in `extension.list` carry `reconsentRequired` and `missingScopes` when the latest version requests scopes the user has not granted. Grants never widen on their own: when `reconsentRequired` is true, show your consent screen with `missingScopes` and then install with the wider scope set; until then calls behind the new scopes stay denied (`SCOPE_DENIED`).
