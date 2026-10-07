---
name: openplatform-host-init
description: >-
  Initialize a host app to embed FinamX Open Platform extensions: host token,
  fetchEmbedLaunch, useExtensionEmbed / ExtensionEmbedFrame, uiTokens,
  CapabilityRouter, PubSubBroker, host domain, optional identity/auth-context
  grants, MCP catalog tools, MCP Apps for external chat clients (Claude.ai,
  ChatGPT). Use when adding an extensions surface or debugging bridge traffic.
  Not for authoring extensions — use openplatform-ext-init.
---

# Open Platform — Host Init

Self-contained skill. Templates and rules are under `resources/`. Do not chase missing repo doc paths — use those files.

**Pinned packages (2.0 model):** `@finamx/bridge-protocol` ≥2.0 · `@finamx/host-bridge` ≥2.0 (Node-only subpath `@finamx/host-bridge/server`) · `@finamx/repl` ≥0.2. Re-check with `npm view` each run. The platform ships **no** built-in host vocabulary: a host with an empty `Hosts.domain` allows nothing (fail-closed).

Sibling: `openplatform-ext-init` (extension side).

## Clarification (ask before coding)

```
1. Стек host? (Next App Router / другой React / иное)
2. Platform base URL? (default https://openplatform.changesandbox.ru; local platform http://127.0.0.1:3001)
3. Есть Host token? (Payload /admin → Hosts → Issue key) — или создать host запись
4. hostId / slug для tenant? (например com.acme.host)
5. Какие шаблоны вставить в domain? (FDC3 2.2 / FinamX finance / Host UI basics / Sandbox kit / Canvas / board / свой JSON) И какие методы host реально обслуживает сам?
6. Embed path: UI only / + MCP agent tools / + board multi-widget pubsub / + MCP Apps во внешних чатах (Claude.ai, ChatGPT)
7. Grants: identity HMAC / auth-context exchange / оба / нет
8. Availability: какие extensionId разрешить этому host?
9. (если MCP Apps) Есть свой OAuth 2.1 и MCP-endpoint для продакшена, или пока только тест через UAT на sandbox-хосте?
```

Details: `resources/clarification.md`.

## Process

### 0. Package check

```bash
npm view @finamx/bridge-protocol version
npm view @finamx/host-bridge version
```

If a package version is missing on npm, stop and report it; do not copy package sources into the host.

### 1. Install

```bash
npm install @finamx/bridge-protocol@^2.0.0 @finamx/host-bridge@^2.0.0
```

Finance vocabulary is **data**, not a package: insert the `finamx-fibo@1` template (step 3). Do not import vocabulary constants from packages.

Env + token: `resources/env-and-token.md`.

### 2. Platform prerequisites

CMS must serve endpoints listed in `resources/platform-endpoints.md`.

### 3. Host record + token + availability

1. Payload `/admin` → Hosts → create host (`hostId`)
2. Issue key → save as `FINAMX_HOST_TOKEN` / `NEXT_PUBLIC_FINAMX_HOST_TOKEN` (gitignore)
3. Save **extension-host-availability** or catalog/`extension.list` stays empty for this tenant
4. **Fill `Hosts.domain` by inserting templates** (admin: Hosts → your host → "Template insert" panel; dry run first, host's own entries win on conflict) — `resources/host-templates.md`. Templates: `fdc3@2.2`, `finamx-fibo@1`, `host-ui-basics@1` (`ui.toast`), `sandbox-kit@1` (`repl.js`, `repl.python`, `sandbox.server`), `canvas-board@1`. **An empty domain allows nothing** — no legacy defaults. CLI/JSON alternative: `resources/cli-host-domain.md`, `resources/host-domain.json`.

### 4. Launch + embed

Copy patterns from:

- `resources/embed-launch.ts`
- `resources/use-extension-embed.tsx`
- `resources/capability-router.ts`

### 5. Tokens / pubsub / grants

- Serve declared methods yourself (browser router + server handler) and publish host data: `resources/host-served-methods.md`
- UI tokens: partial merge over defaults (`resources/ui-tokens.ts`)
- Shared `PubSubBroker` singleton across embeds — `resources/pubsub-rules.md`
- Dual grants: `resources/grants.md`
- Never put auth fields on pubsub payloads

### 6. MCP (optional)

Catalog `:3100/mcp` Bearer host token. Tools: `resources/mcp-catalog-tools.md`.  
`divkit.*` ≠ Registry extensions.

### 6b. MCP Apps in external chat clients (optional)

Host extensions as MCP Apps in Claude.ai / ChatGPT: `resources/mcp-apps.md` (what the platform projects, prerequisites,
test vs production path, rules). Test now on a **dedicated sandbox host** through the UAT listener; production = the host's
own MCP server + OAuth 2.1 relaying the platform MCP — code and steps in skill `openplatform-host-generative-ui-init`, step 6b.
Every host-available UI extension is projected (inline for single-file or platform-inlined bundles, otherwise through the platform shell); some MCP clients (claude.ai web) do not render nested frames, so shell-mode extensions may answer with text there.

### 6c. Server-to-server (optional, user-bound)

Pull (extension backend asks the host for data) and push (host delivers a topic to the extension backend) both use the
user-bound `platform.s2s.user.v1` token minted by CMS after consent: `resources/host-served-methods.md` § s2s. Set
`Hosts.s2s.methodEndpointUrl` (+ `enabled`), mount `createHostS2sEndpoint`, call `pushTopic`. The host-only
`platform.s2s.v1` profile stays for public topics and is not accepted for user data.

### 7. Verify checklist

```
- [ ] Packages installed
- [ ] Host token in env; availability saved
- [ ] Launch → iframe; sandbox without allow-same-origin on host policy
- [ ] uiTokens applied
- [ ] `Hosts.domain` filled from templates (an empty domain allows nothing); dry-run insert reviewed
- [ ] Every declared data method has `router.registerMethod` (browser) and/or a `createHostInvokeHandler` entry (server, after `/invoke/authorize`)
- [ ] Topics published via `broker.publishTopic` (validated against the domain schema)
- [ ] CapabilityRouter has real handlers or platform proxy; no invented portfolio data
- [ ] Domain loaded once at session init (not per invoke)
- [ ] Grants work if flags set
- [ ] extension.list non-empty for this host
- [ ] (MCP Apps) present_* listed for the host's artifact extensions; consent granted; view renders in the chat client
```

## Before you deploy

```
- [ ] The host domain is filled from templates in the portal admin (Hosts → Template insert); an empty domain allows nothing
- [ ] `ui.toast` works: insert `host-ui-basics@1` (toast is a declared method now, not a platform default) or toasts are denied
- [ ] Every stub is labelled (`_mock: true`, `[MOCK]` names) and refuses to answer in production (`NODE_ENV=production` -> throw HostMethodNotImplementedError)
- [ ] `S2S_USER_HANDLE_SECRET` set in production CMS (boot refuses without it); `Hosts.s2s.methodEndpointUrl` is https
```

## Gotchas

- Empty `Hosts.domain` = deny everything. If an old host stopped working after the upgrade, run the backfill (it inserts `finamx-fibo@1` + `repl.js`/`repl.python` into empty hosts) or insert templates by hand
- Scopes are host-declared free text (`a.b`, lowercase, dot separated, ≤64 chars); you own the vocabulary

- `allowedOrigin` = embed/gateway origin, not host page origin
- Empty `userId` rejected on install/consent/audit
- One shared PubSubBroker or interop silos
- Board-first hosts may decide not to open a second live iframe in chat; others render extensions inline in chat
- Do not put `exchangeCode` in launch URL query
- Issue key deletes the host's previous keys: share one secret across the host's servers; give testers their own sandbox host

## Resources index

| File | Contents |
|------|----------|
| `resources/clarification.md` | Ask bank |
| `resources/env-and-token.md` | Env vars + mint key |
| `resources/platform-endpoints.md` | CMS routes |
| `resources/embed-launch.ts` | fetchEmbedLaunch |
| `resources/use-extension-embed.tsx` | Hook + iframe |
| `resources/capability-router.ts` | Invoke proxy |
| `resources/ui-tokens.ts` | Host CSS → UITokens |
| `resources/host-domain.json` | Domain example |
| `resources/host-templates.md` | Template insert (admin panel, dry run, backfill) |
| `resources/host-served-methods.md` | registerMethod, invoke handler, publishTopic, s2s pull/push |
| `resources/cli-host-domain.md` | declare and read back the host domain |
| `resources/pubsub-rules.md` | Broker / FDC3 / what never goes on the bus |
| `resources/grants.md` | HMAC + exchange |
| `resources/mcp-catalog-tools.md` | MCP tool table |
| `resources/platform-urls.md` | Local URLs |
| `resources/mcp-apps.md` | MCP Apps for external chat clients: projection, prerequisites, test vs production |
