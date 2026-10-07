# Host widgets in EXTERNAL chat clients (Claude.ai, ChatGPT, …) via MCP Apps

Use when the host wants its users to open FinamX extensions inside a third-party chat, not in the host's own chat.
The view is an MCP App: the chat client renders `ui://finamx/<id>/<version>` in its own sandbox and enforces the CSP.

## Pick the mode

| Mode | Who runs what | Identity (bucket) | Status |
|------|---------------|-------------------|--------|
| **R. Relay through the host's MCP server** (recommended) | Host runs an MCP server + its own OAuth 2.1 AS; the server relays the platform MCP (`host-mcp-apps-server.ts`) and adds host tools | Host user id from the host's own token → `X-User-Id` | **works**: relay verified 2026-09-29 (tools, `_meta`, `ui://`, launch handle, host tool) |
| **U. UAT listener** (testing only) | Platform team runs a UAT listener of the platform MCP behind a tunnel | One fixed bucket per run | works, dev/test only (ask the platform team) |
| **P. Platform MCP accepts the host's OAuth tokens directly** | Host runs only its AS; `mcp-catalog` validates host-issued tokens | `sub` of the host token | **GAP** (G1): not built |

Mode R keeps the platform trust model unchanged: the platform sees only the host key and a bucket; the host owns login, consent UX and business logic.

## Mode R: what the host builds

1. **OAuth 2.1 authorization server** (host's own identity), per the MCP authorization spec:
   - Protected Resource Metadata at `/.well-known/oauth-protected-resource` on the MCP origin, naming the AS;
   - AS metadata, authorization code + **PKCE**, client registration (DCR and/or Client ID Metadata Documents);
   - tokens with **audience = your MCP URL** (resource indicator); reject tokens minted for anything else;
   - 401 with `WWW-Authenticate: Bearer resource_metadata="<absolute PRM URL>"`.
   Better Auth has an MCP/OIDC provider plugin; any compliant AS works.
2. **MCP endpoint** (`handleHostMcpPost` in `host-mcp-apps-server.ts`):
   - `verifyUser(req)` validates YOUR token and returns YOUR user id; that id is the platform bucket (`X-User-Id`);
   - one platform client per request (stateless) with `Authorization: Bearer <FINAMX_HOST_TOKEN>` + `X-User-Id`;
   - relays `tools/list|call`, `resources/list|templates/list|read` 1:1, **keeps `_meta`**;
   - relays only the MCP Apps set by default (`EXTERNAL_CLIENT_TOOLS`: `present_*`, `finamx_*`, `extension.list|get|schema`);
     `compose`, `graph.*`, `extension.present`, `divkit.*`, `extension.install` are for the host's own chat.
3. **Host tools** (optional): business tools next to the platform ones (`HostTool[]`); names must not collide with platform tools.
4. **Consent**: grant FinamX scopes from YOUR consent flow (server: `POST /api/v1/hosts/{hostId}/users/{userId}/extensions/{id}/consent`
   with the host key), not from a model-called `extension.install`. Without consent `finamx_launch` answers `CONSENT_REQUIRED`.
5. **Availability**: `/admin` → the host's extension-host-availability decides which `present_*` exist.

## What renders

Every host-available UI extension projects: single-file artifacts and platform-inlined static multi-file
artifacts as `inline`, legacy `embedBundleUrl` / SSR / dynamic multi-file as `shell` (FinamX shell + nested frame + Host Bridge relay).
Reach is per client: claude.ai web refuses nested frames, so `shell` extensions fall down the ladder (R3 "Open in FinamX" / R4 text) there.
For the widest reach, author or port a single-file MCP App (`openplatform-ext-init`): `ui/initialize`, host theme,
`finamx_launch/invoke`, `ui/message`, `ui/update-model-context`, `size-changed`; external APIs only through `csp.connect`.

## Rules

- Host key server-side only; the chat client holds only the host's own OAuth token (security rule 8).
- Never take the bucket from the request body or a client header: only from the verified token.
- One active key per host (Issue key deletes the previous keys): the relay and every other server of the host share it via secrets.
- `finamx_*` are app-only; the platform authorises them by launch token + grants, not by visibility (rule 16).
- The chat client enforces the view CSP; FinamX enforces its own sandbox only in FinamX hosts.
- Stateless server: `initialize` advertises `tools.listChanged` but no notification is sent (GAP G8); new extensions appear after the client reconnects.

## Verify

```
- [ ] PRM + AS metadata reachable; a token for another audience is rejected (401)
- [ ] tools/list through your endpoint: present_* for the host's available artifact extensions + finamx_* (visibility app) + your tools; no compose/graph.*
- [ ] present_<id> result: structuredContent.ui = "app" (mode inline|shell), tool _meta.ui.resourceUri = ui://finamx/<id>/<version>
- [ ] resources/read ui://… returns text/html;profile=mcp-app with _meta.ui.csp
- [ ] finamx_launch: handle only in result _meta ("finamx/launch", "finamx/sid"), never in content/structuredContent
- [ ] consent revoked → next launch CONSENT_REQUIRED
- [ ] real client (Claude.ai / ChatGPT): widget renders, ui/message reaches the chat, finamx_* hidden from the model
```
