# Interview: questions, branches, plan card

Ask only what you cannot detect. Batches of 2 to 4. Recommended option first. Accept "as you suggest".

## Batch 1: purpose and shape

1. **What should the extension do for the user?** (1 to 2 sentences, becomes the catalog text)
2. **Shape**
   - Widget shown in the host page (recommended; any visual tool, table, chart, form)
   - Headless: reacts to host topics on your server, no UI (`delivery: ["s2s"]`, webhook)
   - MCP tools for AI agents (`surfaces.mcp`, your MCP server; can be combined with a widget)
3. **Starting point** (detect first): empty folder / existing web app / existing backend.

## Batch 2: data

4. **Where does the data come from?** (several may apply)

   | Answer | What it means | Server needed? |
   |---|---|---|
   | Only from neighbour widgets (topics) | subscribe to e.g. `fdc3.instrument` | no |
   | From the host (quotes, portfolio, user profile) | `bridge.platform.invoke('<method>')`, request the scope | no |
   | A public HTTP API that allows CORS | `fetch` from the widget, origin in `csp.connect` | no |
   | The user's own account at a service (they have a personal token) | user types the token into the widget, kept in memory/localStorage, origin in `csp.connect` | no |
   | An API that needs **our** key/secret, or a database | a backend you run (BFF); widget authenticates with the platform auth context | **yes** |
   | Private host data processed on your server | user-bound s2s (push or pull) | **yes** |

   If the API has no CORS, it is effectively the "needs a backend" row (a tiny proxy).

5. **Does it need to know who the user is?** No (recommended unless required) / yes, a verified platform claim
   (`hostBridge.requiresAuthContext` + `auth.context`) / yes, identity context for partner apps
   (`requiresIdentityContext`). See `auth-context.md`.

## Batch 3: neighbours and identity

6. **Talk to other widgets?**
   - Listen to the selected instrument `fdc3.instrument` (recommended for anything instrument-related)
   - Send the instrument the user picks (`publishes: fdc3.instrument`)
   - Own data for own other widgets: topic `<extensionId>.<name>` with a JSON Schema
   - Other host topics: `finamx.timeframe`, `finamx.filter`, `fdc3.instrumentList`, `fdc3.portfolio`… only if the
     target host declares them (ask the host owner)
7. **extensionId**: propose `com.<github-user-or-company>.<slug>`; lowercase letters, digits, hyphens, dots.
   Never `com.finamx.*`. It is permanent and owned by the account that submits it first.
8. **Platforms**: web (recommended) / also ios, android (the widget must then work in mobile web views).

## Batch 4: build and delivery

9. **Stack**: template, vanilla JS + esbuild (recommended, already compliant) / keep the existing framework.
10. **Delivery**: artifact upload of `dist/` (recommended) / they already host it and want `embedBundleUrl`
    (platform still freezes a copy at submit) / headless (no UI). Details in the openplatform-ext-publish skill.
11. **Paid?** Free (recommended to start) / one_time, subscription, freemium, trial_then_paid: monetization is per
    version, a free version cannot be turned paid later (publish a new version).
12. **Target portal**: the shared portal `https://openplatform.changesandbox.ru` (default) or a local platform
    `http://127.0.0.1:3001`.

## Plan card

Show this before writing code, and again whenever it changes:

```
Plan
- Extension: <displayName> (<extensionId>), <shape>
- Does: <one sentence>
- Data: <sources>; backend: <none | what and where>
- Talks to: subscribes <topics>; publishes <topics>
- Scopes: <list>   Auth: <none | auth context | identity>
- External origins (need review): <list or none>
- Stack: <template | existing framework>   Delivery: <artifact | embedBundleUrl | headless>
- Portal: <url>   Price: <free | …>
Next: scaffold -> manifest -> code -> build + host check -> publish
```

## Recommended defaults (when the developer says "as you suggest")

Widget, template stack, data from topics and/or host methods, no backend, no auth, `ui.toast` plus the scopes of
the methods it calls, subscribe `fdc3.instrument`, artifact upload, free, web, shared portal.
