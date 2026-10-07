# Runtime: bridge, topics, host methods, tokens

Package: `@finamx/extension-sdk` (runtime) + `@finamx/bridge-protocol` (types, CSP helpers). Never ship
`@finamx/host-bridge` in the widget bundle; it is a devDependency for `host-check.mjs` only.

## Boot

```js
import { bootWidget } from './boot.js';
bootWidget({ extensionId: EXTENSION_ID, scopes: SCOPES, fixtures: DEV_FIXTURES, start });

async function start({ bridge, mode, toast, showFailure }) { /* mode: 'host' | 'standalone' */ }
```

- Inside a host (`#__bsession=` in the URL) it waits for the real bridge. If the host does not answer, it shows
  "No connection to the host" instead of silently running on fake data.
- Standalone it creates `createMockBridge` with your scopes and fixtures, so `npm run dev` works without a host.
- `<html data-boot>`: `wait` / `host` / `standalone` / `error`; tests and CSS key off it.

## Topics (pub/sub between widgets)

```js
const off = bridge.context.subscribe('fdc3.instrument', (payload, meta) => {
  // payload: { type: 'fdc3.instrument', id: { ticker, mic?, isin? }, name? }
  // meta.fromCache: true when this is the last value replayed to a late subscriber
});
bridge.context.publish('fdc3.instrument', { type: 'fdc3.instrument', id: { ticker: 'SBER', mic: 'MISX' } });
```

- Declare every topic you publish or subscribe in `surfaces.topics` (see `manifest.md`).
- The host drops publications it does not allow, without an error. If a neighbour does not receive anything,
  check that both manifests declare the topic and the host declares it (host topics) or the name is
  `<extensionId>.<name>` with a schema (own topics).
- Topics are visible to every subscriber on the board: never put tokens, keys or personal data there.

Common host topics (available only where the host declares them; ask the host owner for its list):

| Topic | Payload idea | Access on reference hosts |
|---|---|---|
| `fdc3.instrument` | selected instrument `{ id: { ticker, mic, isin } }` | public |
| `fdc3.instrumentList`, `fdc3.portfolio`, `fdc3.position`, `fdc3.timeRange`, `fdc3.chart`… | FDC3 2.2 contexts | varies |
| `finamx.timeframe` | chart resolution `{ resolution: '1D' }` | public |
| `finamx.filter` | filter state `{ domain, criteria }` | public |
| `finamx.orderDraft` | order draft | needs `market.read` |
| `finamx.userProfile` | user profile | needs `user.profile.read` |

## Host methods and scopes

```js
try {
  const quote = await bridge.platform.invoke('market.quote', { symbol: 'SBER@MISX' });
} catch (err) {
  showFailure(err); // denied scope or method -> "No access" state
}
```

- Methods and their scopes are **declared by each host**; there is no global list. Request the scope in
  `capabilitiesRequested`, the user grants a subset at install. A call without a granted scope, or to a method the
  host does not offer, rejects (the message contains `SCOPE_DENIED` / `CAPABILITY_DENIED`).
- Methods found on reference hosts: `ui.toast` (`ui.toast`), `market.quote` (`market.read`), `portfolio.read`,
  `portfolio.summary` (`portfolio.read`), `user.profile.read` (`user.profile.read`), `repl.js` / `repl.python`
  (`repl.execute`). Confirm with the host owner before relying on one.
- Prefer `bridge.ui.toast(message, 'info' | 'success' | 'warning' | 'error')` for notifications; it needs `ui.toast`.
- A new version that requests more scopes does not widen existing grants: users must consent again.

## Size

`bootWidget` calls `bridge.ui.autoResize()` inside a host: the frame follows your content height. For a fixed
height use `bridge.ui.resize({ height })`.

## Theme and UI tokens (required)

The host sends `hostContext.theme` / `theme.changed` and UI tokens (`hostContext.uiTokens`, event `host:tokens`):
colors (`background, foreground, card, card-foreground, muted, muted-foreground, border, primary,
primary-foreground, accent, accent-foreground, destructive`), `radius`, `fontFamily`.
`src/host-tokens.js` maps all of them to CSS variables; `base.css` must use only those variables.

| Token | Variable | Use for |
|---|---|---|
| background | `--bg` | page background |
| card / card-foreground | `--surface` / `--on-surface` | panels, cards |
| muted | `--sunken` | inputs, wells |
| foreground / muted-foreground | `--fg` / `--muted` (+ `--faint`) | text |
| border | `--line` (+ `--line-strong`) | borders |
| primary / primary-foreground | `--accent` / `--on-accent` (+ `--accent-soft`) | primary buttons, links, selection |
| accent / accent-foreground | `--hover` / `--on-hover` | hover states |
| destructive | `--down` (+ `--down-soft`) | errors, negative values |
| radius | `--radius` (+ `--r-md`, `--r-xl`) | corner radii |
| fontFamily | `--font` | text |

Test locally with `?devtokens=ocean` or `?devtokens=paper` on `npm run dev`, and in a real host with
`npm run check:host` (it pushes a light set, then a dark set, and checks the widget follows).

## Standalone fixtures

```js
export const DEV_FIXTURES = { 'market.quote': { symbol: 'SBER', price: 312.45 } };
```

`createFixtureInvoke` answers only listed methods, marks answers `_mock: true`, and rejects the rest with
`NOT_IMPLEMENTED`. Fixtures never run inside a host.

## Things that do not work in the widget

`alert/confirm/prompt` (no `allow-modals`), `eval` and `new Function`, WebAssembly, inline `<script>`/`<style>`/
`style=""`/`onclick=""`, `fetch` of your own files, fonts from the artifact without a `csp.resource` entry,
WebSockets (csp accepts only https origins). See `sandbox-and-csp.md` for workarounds.
