# Convert an existing web app

Goal: a static build in `dist/` that passes `finamx-ext check` and `finamx-ext check --host <hostId>`. Keep the app's
framework; add the platform pieces from a freshly generated project.

## 1. Take the platform pieces from a scratch project

Generate a scratch project once and copy from it, then delete it:

```bash
npx @finamx/extension-sdk init ../ext-scratch --id com.example.scratch --name Scratch --target templates --yes
```

Take `src/boot.js` and `src/host-tokens.js` from `ext-scratch`, `src/config.js` as a model, the variable block and the
`data-boot` rules from `base.css`, `manifest.json` as a model, and the `AGENTS.md` and `.gitignore` lines. Add to
`package.json`:

```json
"dependencies": { "@finamx/extension-sdk": "^2.2.0", "@finamx/bridge-protocol": "^2.1.0" },
"devDependencies": { "@finamx/dev-host": "*", "playwright-core": "^1.50.0" },
"scripts": {
  "dev": "finamx-ext dev",
  "check": "finamx-ext check",
  "check:host": "<your build command> && finamx-ext check --host",
  "publish:ext": "<your build command> && finamx-ext publish",
  "status:ext": "finamx-ext status"
}
```

Then pull the host domain: `finamx-ext login`, `finamx-ext hosts --json`, `finamx-ext domain pull <hostId>` (see
`host-domain.md`) and set `extensionId` and `SCOPES` from it. Add `.finamx/dev-events.ndjson` to `.gitignore`.

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
  hydration data: prefer Vite for widgets; if staying on Next, verify with `finamx-ext check` and `finamx-ext check --host <hostId>`.
- Production builds only: dev builds use `eval` for source maps.

**Charts and heavy libraries**
- Check for `new Function`/`eval` in the bundle (`finamx-ext check` does it). Common offenders: template compilers,
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
npm run build && finamx-ext check && finamx-ext check --host <hostId>
```

Point `check` at the right folders if they differ: `--dist build --manifest manifest.json --config src/config.js`.
