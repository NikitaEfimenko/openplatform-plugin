# Convert an existing web app

Goal: a static build in `dist/` that passes `check.mjs` and `host-check.mjs`. Keep the app's framework; add the
platform pieces from the template.

## 1. Copy the platform pieces

From `assets/template/`: `src/boot.js`, `src/host-tokens.js`, `src/config.js`, `scripts/finamx/`, `.env.example`,
the variable block and the `data-boot` rules from `base.css`, and `manifest.json`. Add to `package.json`:

```json
"dependencies": { "@finamx/extension-sdk": "^2.0.0", "@finamx/bridge-protocol": "^2.1.0" },
"devDependencies": { "@finamx/host-bridge": "^2.1.1", "playwright-core": "^1.50.0", "esbuild": "^0.25.0" },
"scripts": {
  "check": "node scripts/finamx/check.mjs",
  "check:host": "npm run build && node scripts/finamx/host-check.mjs",
  "publish:ext": "npm run build && node scripts/finamx/publish.mjs",
  "status:ext": "node scripts/finamx/publish.mjs status"
}
```

`host-check.mjs` needs `esbuild` even when the app builds with Vite (it bundles the test host page).

## 2. Start the app through bootWidget

Mount the app inside `start` so it only renders once the bridge (or mock) is ready, and pass the bridge down
(React context, a store, a module singleton):

```jsx
import { createRoot } from 'react-dom/client';
import { bootWidget } from './boot.js';
import { EXTENSION_ID, SCOPES, DEV_FIXTURES } from './config.js';

bootWidget({ extensionId: EXTENSION_ID, scopes: SCOPES, fixtures: DEV_FIXTURES,
  start: ({ bridge, mode, toast }) => createRoot(document.getElementById('root')).render(<App bridge={bridge} mode={mode} toast={toast} />) });
```

Keep an element `<div id="state" class="state" hidden></div>` outside the React root for failure states, and
wrap the app in `.wrap` (or adapt the `data-boot` CSS selectors).

## 3. Framework specifics

**Vite**
- `base: './'` in `vite.config` (relative asset paths).
- `build.modulePreload: { polyfill: false }` and no `@vitejs/plugin-legacy` (it injects inline scripts).
- Do not import CSS as inline `<style>` at runtime (`?inline`, CSS-in-JS that injects `<style>`). Emitted `.css`
  files are fine. Styled-components / Emotion inject `<style>` tags: blocked by `style-src 'self'`.
- `build.assetsInlineLimit: 0` so small images are files, not `data:` URLs (or add `"data:"` to `csp.resource`).
- Remove the `<link rel="icon" href="/vite.svg">` or make it relative.

**React (CRA, Next)**
- Next: `output: 'export'` (static export), `images.unoptimized: true`, `assetPrefix: './'`; no server components,
  API routes or middleware in the widget (move those to a separate backend). Next injects inline scripts for
  hydration data: prefer Vite for widgets; if staying on Next, verify with `check.mjs` and `host-check.mjs`.
- Production builds only: dev builds use `eval` for source maps.

**Charts and heavy libraries**
- Check for `new Function`/`eval` in the bundle (`check.mjs` does it). Common offenders: template compilers,
  some expression evaluators, older chart builds. Pick a CSP-safe build or another library.
- WebAssembly cannot run (no `wasm-unsafe-eval`).

**Styling**
- Replace hard-coded colors, radii and fonts with the CSS variables (`runtime.md`, token table). For Tailwind,
  map theme colors to the variables (`colors: { bg: 'var(--bg)', fg: 'var(--fg)', accent: 'var(--accent)', … }`).
- Remove `data-theme`/`class="dark"` hard-coded on `<html>`; the host decides.

## 4. Data and network

- Every external origin goes into `csp.connect` (API) / `csp.resource` (images, fonts) / `csp.frame`.
- Calls to your own server: see `data-and-backend.md` (CORS, auth context, never a shared key in the bundle).
- No `fetch` of files from the app itself (connect-src has no `'self'`): import JSON at build time.

## 5. Verify

```bash
npm run build && npm run check && npm run check:host
```

Point `check.mjs` at the right folders if they differ: `--dist build --manifest manifest.json --config src/config.js`.
