# Fill Hosts.domain from templates

The platform has **no built-in host vocabulary**. A host with an empty `Hosts.domain` allows no topic, no method and no scope. The domain is data you assemble by inserting ontology templates.

## Seeded templates

| Key | Contents |
|-----|----------|
| `fdc3@2.2` | FDC3 2.2 contexts (instrument, instrumentList, portfolio, position, timeRange, valuation, currency, contact, organization, chart) + `fdc3.intent.View*` methods (scope `host.view`); consent per context (`portfolio.read`, `contacts.read` where private) |
| `finamx-fibo@1` | FinamX finance vocabulary: `fdc3.instrument` (with `id.ticker`), `finamx.timeframe`, `finamx.orderDraft`, `finamx.filter`, `finamx.userProfile`; methods `market.quote`, `portfolio.read`, `portfolio.summary`, `user.profile.read` |
| `host-ui-basics@1` | `ui.toast` (scope `ui.toast`) |
| `sandbox-kit@1` | `repl.js`, `repl.python` (scope `repl.execute`), `sandbox.server` (scope `sandbox.execute`) |
| `canvas-board@1` | `finamx.board.snapshot` (aggregate, needs `board.read`, strict schema) |

## Insert (admin)

`https://openplatform.changesandbox.ru/admin` -> Hosts -> your host -> **Template insert** panel: pick a template (whole or selected topics/methods), run **dry run**, review, apply. Merge is **host-wins**: anything the host already declares is kept; differences are reported, never overwritten. Save the form first (the panel refuses on unsaved edits).

Endpoint behind the panel: `POST /api/hosts/<id>/domain/insert-template` (admin session only).

## Existing hosts

A host created before templates existed has an empty domain and allows nothing until templates are inserted. Insert them in the admin panel as above, or ask the platform team.

## Scopes

Scopes are free text declared by the host in `methods[].requiredScope` and `consentMatrix[].needsScope`. Format: `a.b`, lowercase, dot separated, at most 64 chars. Extensions request them in `capabilitiesRequested`; the user grants a subset at install.
