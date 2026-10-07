---
name: openplatform-ext-init
description: >-
  Guides a developer from an empty folder (or an existing web app) to a working FinamX Open Platform extension
  (widget, headless topic processor or MCP tools): interviews with recommended answers, picks the easiest path,
  scaffolds a tested template, writes manifest.json (versions[].surfaces), wires @finamx/extension-sdk (host
  bridge, host theme and UI tokens, topics like fdc3.instrument, host methods), settles data, secrets and backend,
  and verifies the build in a real host under the platform CSP. Use it whenever someone wants to build, convert,
  fix or check a FinamX / Finam / Open Platform extension or widget, mentions manifest.json surfaces, finamx-ext,
  @finamx/extension-sdk, a widget that is blank inside the host, or says "I want to send you an extension", even
  without naming the platform precisely. For submitting, versions and moderation use openplatform-ext-publish;
  for embedding extensions into a host app use openplatform-host-init.
---

# FinamX Open Platform: build an extension

An extension is a small web app (or a backend) that FinamX hosts run for their users: a widget inside a host page
(an iframe), a headless processor of host topics, or an MCP server with tools for agents. The developer builds it,
submits it to the platform portal, a moderator reviews it, and hosts that enable it show it to their users.

Your job: get the developer from whatever they have now to a build that passes the checks in a real host and is
ready to submit, with as few decisions on their side as possible. Most developers want the same thing: a static
widget, no servers, uploaded as an artifact. Steer toward that path unless their answers rule it out.

## How to work with the developer

- Speak the developer's language (Russian and English are both common here).
- Ask in small batches (2 to 4 questions), only what you cannot detect yourself. Put the recommended option first,
  marked "(recommended)", with one line on the trade-off. The developer can always answer "as you suggest".
- Keep a short **plan card** (template in `references/interview.md`) and show it before you write code; update it
  when an answer changes the path.
- Explain the why when a platform rule forces a choice (CSP, sandbox, review). Developers accept constraints they
  understand and fight the ones they do not.
- Never ask the developer to paste a token or password into the chat. Tokens go into `.env` (gitignored) or the
  shell environment, and you never print them.

## Step 0: look before asking

Check the working directory and report in one line what you found:

| Found | Path |
|---|---|
| Nothing, or no web project | new extension from `assets/template/` |
| `manifest.json` with `versions[].surfaces` | existing extension: run the checks (Step 6), fix, then publish |
| `manifest.json` with `kind`, `widget`, flat `pubsub` | old format: migrate (`references/manifest.md`, "Old formats") |
| A web app (Vite, React, Next, plain HTML) | convert it (`references/convert-existing-app.md`) |
| A backend only (no UI) | headless or MCP extension (`references/data-and-backend.md`) |

Also note: Node version (needs 20+), package manager, whether Google Chrome is installed (the host check uses it).

## Step 1: interview

Use `references/interview.md` for the full bank and branching. The core questions, with what to recommend:

1. **What should it do?** One or two sentences; this becomes `displayName`, `description`, `summary`.
2. **What kind?** Widget in the host page (recommended, most extensions) / headless reaction to host topics /
   MCP tools for agents.
3. **Where does its data come from?**
   - nothing external, only what neighbour widgets send (recommended when it fits);
   - data the host offers (quotes, portfolio, profile) through host methods: no server, needs scopes;
   - a public API with CORS: call it from the browser, declare the origin in `csp.connect`;
   - the user's own account at a third party (the user enters their token in the widget);
   - anything that needs **your** secret (API key, client secret, database): needs a backend you run.
   See `references/data-and-backend.md`; the last option is the only one that needs a server.
4. **Does it talk to other widgets?** Usually: listen to `fdc3.instrument` (the selected instrument) and/or send it.
   Own topics are named `<extensionId>.<name>` and need a JSON Schema.
5. **Identity:** `extensionId` as `com.<you or company>.<slug>` (lowercase, dots, hyphens). Suggest one.
   `com.finamx.*` is reserved.
6. **Stack:** start from the template (recommended: vanilla JS + esbuild, already passes all checks) or keep their
   framework (React/Vite works; see the conversion guide).
7. **Delivery:** upload the build as an artifact (recommended: no hosting, what you upload is exactly what runs).
   Alternatives and when they make sense are in the `openplatform-ext-publish` skill; mention only if asked or if
   they already host it.

Then show the plan card and get a yes.

## Step 2: scaffold or convert

New extension: copy `assets/template/` into the project (keep `.gitignore` and `.env.example`; copy `.env.example`
to `.env`). Then set the identity in **both** places:

- `manifest.json`: `extensionId`, `displayName`, `description`, `summary`, `capabilitiesRequested`, topics;
- `src/config.js`: `EXTENSION_ID`, `SCOPES` (same list as `capabilitiesRequested`), `DEV_FIXTURES`.

Run `npm install`, then `npm run build`. The template is a working widget: it listens to and sends
`fdc3.instrument`, applies the host theme and tokens, and shows failure states instead of a blank page.

What the template gives you and why each piece exists:

| File | Purpose |
|---|---|
| `src/boot.js` | `bootWidget()`: real bridge inside a host, mock standalone, never a mock inside a host; visible "no connection" state; applies host theme and tokens before the first visible frame |
| `src/host-tokens.js` | full mapping of host UI tokens to CSS variables, repairs degenerate tokens, `?devtokens=ocean|paper` for local testing |
| `base.css` | all colors and radii as variables; hidden content until boot, so no black flash in a light host |
| `build.mjs` | esbuild bundle into `dist/` (index.html, app.js, style.css), then the checks |
| `scripts/finamx/check.mjs` | manifest and artifact rules (CSP, sandbox, topics, limits) |
| `scripts/finamx/dev-server.mjs` | serves `dist/` with the exact platform CSP |
| `scripts/finamx/host-check.mjs` | runs the widget inside a real `@finamx/host-bridge` host, checks handshake, CSP, tokens |
| `scripts/finamx/publish.mjs` | upload and submit with retries, new versions, status, `--dry-run` |

Existing app: follow `references/convert-existing-app.md`; copy `src/boot.js`, `src/host-tokens.js`, the CSS
variable approach and `scripts/finamx/` from the template.

## Step 3: manifest

Rules and examples: `references/manifest.md`. The essentials:

- Only `versions[].surfaces.{ui,topics,mcp}`. No `kind`, `widget`, flat `pubsub`.
- The **last** entry of `versions[]` is what gets submitted and must be the highest semver.
- `surfaces.ui: { "renderMode": "external-embed" }` is enough for an artifact. Do **not** set `embedSandbox`: the
  platform default (`allow-scripts allow-same-origin allow-popups allow-forms` on an isolated per-version origin) is
  what makes the module script load. Without `allow-same-origin` the widget is an empty page.
- External origins go into `surfaces.ui.csp.connect` (API calls), `resource` (images, fonts, media),
  `frame` (nested iframes): bare `https://host` origins, no paths, no wildcards, max 10 each. Every one of them is
  reviewed by a moderator, so keep the list short and explain each in the changelog.
- `capabilitiesRequested`: at least one scope (`ui.toast` is the harmless minimum). Scopes are declared by each
  host, request only what you call (`references/runtime.md`, "Host methods and scopes").

## Step 4: runtime code

`references/runtime.md` covers the bridge API with examples: `bridge.context.subscribe/publish` for topics,
`bridge.platform.invoke` for host methods, `bridge.ui.toast`, auto-resize, theme and tokens, standalone fixtures.
Rules that matter most:

- Start through `bootWidget()`; inside a host never fall back to the mock.
- Style only through CSS variables; the host theme and tokens must apply to every element (backgrounds, text,
  borders, accents, radius, font). A widget that ignores the host palette looks broken in the host.
- The platform CSP forbids inline scripts and styles, `eval`/`new Function`, WebAssembly, `data:` URLs (unless
  declared), `fetch` of your own files, `alert/confirm`. Details and fixes: `references/sandbox-and-csp.md`.
- Never put secrets or user tokens into topics or logs: every subscriber on the board can read topics.
- `localStorage` works, but each version runs on its own origin, so stored data is gone after an update.

## Step 5: data, secrets, backend

Only when the interview says so: `references/data-and-backend.md` (decision table: browser-only, host methods,
user-entered tokens, your own backend with platform auth context, user-bound server-to-server access to host data,
MCP). The short version: a browser bundle is public and reviewed, so any secret that is yours lives on a server you
run; the widget proves who it is to that server with the platform auth context, never with a shared key.

## Step 6: verify (do not skip)

```bash
npm run build          # bundle + check.mjs (manifest + artifact rules); fix every ERROR
npm run dev            # http://localhost:8787/ standalone with the platform CSP; try ?devtokens=ocean
npm run check:host     # inside a real host: handshake, no CSP violations, host tokens applied and re-applied
```

The host check is the one that predicts what the moderator and users will see. Dev mode on the mock bridge proves
nothing about CSP, sandbox or tokens. If it fails, read the reason line: it names the cause (CSP violation,
sandbox, missing `bootWidget`, tokens ignored). It needs Google Chrome (or `CHROME_PATH`).

## Step 7: hand off to publishing

When the checks pass, continue with the **openplatform-ext-publish** skill (account and token, upload, review,
new versions, errors). If that skill is not available, the short path is: put `FINAMX_DEV_TOKEN` into `.env`, run
`npm run publish:ext`, then `npm run status:ext`.

## Checklist before handing off

- [ ] `extensionId` and scopes identical in `manifest.json` and `src/config.js`
- [ ] last `versions[]` entry is the highest semver, has a `changelog`
- [ ] no `embedSandbox`; external origins only in `csp.*`, bare `https://` origins, each one justified
- [ ] own topics named `<extensionId>.<name>` with a schema; host topics without a schema
- [ ] all colors/radii/fonts through CSS variables; host tokens verified by `npm run check:host`
- [ ] no secrets in the bundle, topics or logs; `.env` is gitignored
- [ ] `npm run build` and `npm run check:host` are green

## References

| File | When |
|---|---|
| `references/interview.md` | full question bank, branches, plan card |
| `references/manifest.md` | manifest fields, examples (UI, headless, topics, MCP), old formats |
| `references/runtime.md` | bridge API, topics, host methods and scopes, tokens, fixtures |
| `references/sandbox-and-csp.md` | what the platform CSP and sandbox block and how to work with it |
| `references/data-and-backend.md` | where data comes from, secrets, backend, auth context, s2s, MCP |
| `references/auth-context.md` | platform auth context and identity grants in detail |
| `references/user-bound-s2s.md` | backend access to private host data for one user |
| `references/convert-existing-app.md` | turning a Vite/React/Next/static app into an extension |
