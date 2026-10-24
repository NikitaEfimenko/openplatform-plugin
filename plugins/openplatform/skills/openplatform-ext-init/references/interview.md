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

7. **What does the backend need to trust?** Route the answer, do not ask about flags first (matrix in `auth-context.md`):

   | Answer | Choose |
   |---|---|
   | Nothing, ordinary widget (recommended) | no auth flag |
   | Host data for the user (portfolio, orders) | `invoke` with granted scopes, or user-bound s2s |
   | Proof that the launch came from the platform (not a user) | `hostBridge.requiresAuthContext` + `auth.context` → `platform.auth_context.v1` |
   | The host's trusted user id on my backend | `requiresIdentityContext` → `platform.identity.v1` (host-signed ES256, verified with `verifyHostIdentity`) |
   | My own accounts / login / SSO | the extension's own OIDC / backend popup, not a flag |

   Auth-context is not SSO: it carries no user unless the extension opts in (`hostBridge.requiresUserKey` or a
   declared `surfaces.ui.state`), and then only the pairwise handle `uh_`, never the host user id. Identity `sub` is the host's user id, not an account of the
   extension. There is no shared-secret (HMAC) option.

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
11. **Settings and state.** Does the screen have per-user settings (filters, tab, columns, form draft), and must they
    survive a reload or follow the user to another device? Yes: `bridge.state` with a schema, `schemaVersion`
    (recommended for any screen with filters or forms). Vendor-side data: BFF keyed by `authContextStateKey`. Never the
    last-value cache. Details: `state.md`.
12. **Control.** Who must change them besides the user (the host's agent, your server), and should the agent see them?
    Agent or host changes the screen: an input topic as the command channel (the widget applies, then persists);
    agent reads: `agentVisible`; vendor settings: BFF or MCP. Details: `state.md`.
13. **Trust.** Which inputs change something important (order prefill, actions) and which only display? Important:
    `acceptFrom: "self"`; display-only: open. How does the widget handle a refused publish
    (`onPublishRejected`)? Details: `trust.md`.

## Batch 4: build and delivery

14. **Stack**: the generated project, vanilla JS + esbuild (recommended, already compliant) / keep the existing framework.
15. **Delivery**: artifact upload of `dist/` (recommended) / they already host it and want `embedBundleUrl`
    (platform still freezes a copy at submit) / headless (no UI). Details in the openplatform-ext-publish skill.
16. **Size.** Какого размера виджет? Compact (about 320x200) / medium (about 480x320, recommended) / wide (about 720x400)
    / fits the container. Map the answer to `surfaces.ui.layout.preferredSize` (`width`, `height` in px; or
    `aspectRatio` such as `16:9`) and, when the layout must change with the box, `breakpoints`. "Fits the container"
    means no `preferredSize`, only `breakpoints` and CSS that renders at any size. It is a hint: the host decides, the
    widget still has to look right at any size. Examples: `manifest.md`; reading it at runtime: `runtime.md`.
17. **Paid?** Free (recommended to start) / one_time, subscription, freemium, trial_then_paid: monetization is per
    version, a free version cannot be turned paid later (publish a new version).
18. **Target portal**: the shared portal `https://openplatform.changesandbox.ru` (default) or a local platform
    `http://127.0.0.1:3001`.

### When the data answer needs a separate deploy or a backend

Check what the project already has (`git remote -v`, `gh auth status`, `vercel whoami`, `vercel.json`,
`.vercel/project.json`) and say it in one line. On GitHub (or no git yet) recommend the preset **GitHub + Vercel** for
a BFF: ask "(recommended) GitHub + Vercel / another host you already use". On GitLab or any other host keep the neutral
path. Details and steps: `data-and-backend.md`, "Deploy preset: GitHub + Vercel".

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
- State and control: <bridge.state schema | BFF | none>; agent: <agentVisible, command topic | none>
- Trust: <acceptFrom per own input; Publisher pin on BFF | none>
- Scopes: <list>   Auth: <none | auth context | host identity | own OIDC>
- External origins (need review): <list or none>
- Stack: <template | existing framework>   Delivery: <artifact | embedBundleUrl | headless>
- Size: <compact | medium | wide | fits container> (preferredSize <WxH | none>)
- Deploy: <none | GitHub + Vercel | other>
- Portal: <url>   Price: <free | …>
Next: login -> domain pull -> scaffold -> manifest -> code -> build + check + check --host -> publish
```

## Recommended defaults (when the developer says "as you suggest")

Widget, template stack, data from topics and/or host methods, no backend, no auth, `ui.toast` plus the scopes of
the methods it calls, subscribe `fdc3.instrument`, artifact upload, free, web, shared portal.
