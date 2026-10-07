# Sandbox and CSP

The platform serves every artifact version from its own isolated origin and loads it in the host page as an iframe.
Two layers restrict it: the iframe `sandbox` attribute and the `Content-Security-Policy` header on every file.
Most "the widget is empty inside the host" reports are one of the rules below.

## The policy

```
default-src 'none'; script-src 'self'; style-src 'self';
img-src 'self' <csp.resource>;
font-src 'self' <csp.resource>; media-src 'self' <csp.resource>     <- only when csp.resource is non-empty
connect-src <csp.connect>          <- no 'self'
frame-src <csp.frame>; base-uri <csp.baseUri>; form-action 'none'; frame-ancestors <the host>
```

Sandbox (default, keep it): `allow-scripts allow-same-origin allow-popups allow-forms`.

## What breaks and how to fix it

| Symptom / cause | Fix |
|---|---|
| Empty page, nothing in the widget, "Refused to load module script… CORS" | `embedSandbox` without `allow-same-origin` makes the origin opaque, and the module script is fetched cross-origin without CORS. Remove `embedSandbox` |
| Empty page, "Refused to execute inline script" | move code from `<script>…</script>` into a bundled `.js` file |
| Empty page, "unsafe-eval" | a dependency uses `eval`/`new Function` (some template engines, older lodash.template, JSON schema compilers, some chart libs in dev builds). Use a production build or another library |
| Empty page, WebAssembly error | no `wasm-unsafe-eval`: use a JS implementation |
| Styles missing | `<style>` blocks and `style="…"` attributes are blocked: use classes, or set `el.style.prop = …` from JS (CSSOM is allowed) |
| Buttons do nothing | `onclick="…"` attributes are blocked: use `addEventListener` |
| Icons or images missing | `data:` URLs need `"data:"` in `csp.resource`; remote images need their origin in `csp.resource`; or ship them as files |
| Fonts not applied | font files from the artifact need a non-empty `csp.resource` (font-src otherwise falls back to `'none'`); simplest: use the host font (`--font` from tokens) or system fonts |
| `fetch('./data.json')` fails | `connect-src` has no `'self'`: import the data at build time (`import data from './data.json'` with the bundler) |
| API calls fail | the API origin is not in `csp.connect`, or the API has no CORS for an opaque/foreign origin; add the origin or call it through your backend |
| WebSocket fails | `csp` accepts only `https://` origins: use SSE (`EventSource`) or streaming `fetch` |
| `alert()` / `confirm()` silently do nothing | no `allow-modals`: render the dialog in the page |
| Login popups | `window.open` works (`allow-popups`); OAuth must start inside the popup (see `auth-context.md`) |
| Data in `localStorage` disappears after an update | every version has its own origin; treat storage as a cache and re-ask or re-sync |
| Absolute asset paths 404 | use relative paths (`app.js`, not `/app.js`) so the bundle works under any base path |

## How to check before submitting

```bash
npm run build        # check.mjs flags inline scripts/styles, eval, data:, embedSandbox, csp format
npm run dev          # standalone page with the exact platform CSP; watch the console
npm run check:host   # real host bridge + platform CSP + your manifest's sandbox
```

`dev-server.mjs` builds the policy with `buildSandboxCsp` from `@finamx/bridge-protocol`, the same function the
platform uses, so a clean console there means a clean console in the host.
