# Interview: questions, branches, plan card

Ask only what you cannot detect. Batches of 2 to 4. Recommended option first. Accept "as you suggest".

## Batch 1: purpose and shape

1. **What should the extension do for the user?** (1 to 2 sentences). This becomes `displayName` and the plan-card "Does" line only. Do not write `description` or `summary` from this answer.
2. **Store text.** After they answer question 1, ask exactly: «Текст для витрины. Его увидят люди в каталоге. Предложи 1–2 предложения и жди правку или да». Propose 1–2 sentences from their answer, then stop. Write `description` only after they edit the text or say «да» (or "yes" / "as you suggest"). A session that is not in Russian asks the same question in the developer's language and still waits. Finishing init, scaffolding, or writing `manifest.json` with a `description` copied from question 1 is a failure. `summary` is a shortened copy of the confirmed text (≤ 280 characters), not a new sentence.
3. **How to use it on the board.** Ask: «Как этим пользоваться на доске? 3–6 коротких предложений. Это поле usage, из него хост сделает заметку рядом с виджетом». An answer becomes root `usage` (plain text, ≤ 1200 characters). An empty answer means do not write `usage`; the host will not create a note.
4. **Shape**
   - Widget shown in the host page (recommended; any visual tool, table, chart, form)
   - Headless: reacts to host topics on your server, no UI (`delivery: ["s2s"]`, webhook)
   - MCP tools for AI agents (`surfaces.mcp`, your MCP server; can be combined with a widget)
5. **Starting point** (detect first): empty folder / existing web app / existing backend.

## Batch 2: data

6. **Where does the data come from?** (several may apply)

   | Answer | What it means | Server needed? |
   |---|---|---|
   | Only from neighbour widgets (topics) | subscribe to e.g. `fdc3.instrument` | no |
   | From the host (quotes, portfolio, user profile) | `bridge.platform.invoke('<method>')`, request the scope | no |
   | A public HTTP API that allows CORS | `fetch` from the widget, origin in `csp.connect` | no |
   | The user's own account at a service (they have a personal token) | user types the token into the widget, kept in memory/localStorage, origin in `csp.connect` | no |
   | An API that needs **our** key/secret, or a database | a backend you run (BFF); widget authenticates with the platform auth context | **yes** |
   | Private host data processed on your server | user-bound s2s (push or pull) | **yes** |

   If the API has no CORS, it is effectively the "needs a backend" row (a tiny proxy).

7. **Does it need to know who the user is?** No (recommended unless required) / yes, a verified platform claim
   (`hostBridge.requiresAuthContext` + `auth.context`) / yes, identity context for partner apps
   (`requiresIdentityContext`). See `auth-context.md`.

## Batch 3: neighbours and identity

8. **Talk to other widgets?**
   - Listen to the selected instrument `fdc3.instrument` (recommended for anything instrument-related)
   - Send the instrument the user picks (`publishes: fdc3.instrument`)
   - Own data for own other widgets: topic `<extensionId>.<name>` with a JSON Schema
   - Other host topics: `finamx.timeframe`, `finamx.filter`, `fdc3.instrumentList`, `fdc3.portfolio`… only if the
     target host lists them (pick from the methods and topics in the pulled domain: `finamx-ext domain pull <hostId>`)
9. **extensionId**: propose `com.<github-user-or-company>.<slug>`; lowercase letters, digits, hyphens, dots.
   Never `com.finamx.*`. It is permanent and owned by the account that submits it first.
10. **Platforms**: web (recommended) / also ios, android (the widget must then work in mobile web views).

## Batch 4: build and delivery

11. **Stack**: the generated project, vanilla JS + esbuild (recommended, already compliant) / keep the existing framework.
12. **Delivery**: artifact upload of `dist/` (recommended) / they already host it and want `embedBundleUrl`
    (platform still freezes a copy at submit) / headless (no UI). Details in the openplatform-ext-publish skill.
13. **Paid?** Free (recommended to start) / one_time, subscription, freemium, trial_then_paid: monetization is per
    version, a free version cannot be turned paid later (publish a new version).
14. **Target portal**: the shared portal `https://openplatform.changesandbox.ru` (default) or a local platform
    `http://127.0.0.1:3001`.

## Plan card

Show this before writing code, and again whenever it changes:

```
Plan
- Extension: <displayName> (<extensionId>), <shape>
- Target host: <hostId | templates>   Domain hash: <from .finamx/domain/<hostId>/domain.json>
- Does: <one sentence>
- Store text: <confirmed description | waiting — do not write description>
- Usage: <board how-to | none>
- Data: <sources>; backend: <none | what and where>
- Talks to: subscribes <topics>; publishes <topics>
- Scopes: <list>   Auth: <none | auth context | identity>
- External origins (need review): <list or none>
- Stack: <template | existing framework>   Delivery: <artifact | embedBundleUrl | headless>
- Portal: <url>   Price: <free | …>
Next: login -> domain pull -> scaffold -> manifest -> code -> build + check + check --host -> publish
```

## Recommended defaults (when the developer says "as you suggest")

Widget, template stack, data from topics and/or host methods, no backend, no auth, `ui.toast` plus the scopes of
the methods it calls, subscribe `fdc3.instrument`, artifact upload, free, web, shared portal.
