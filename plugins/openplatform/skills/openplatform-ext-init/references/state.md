# State: where data lives, and how an agent controls the widget

Needs `@finamx/extension-sdk` 3.5.0+. API table: `runtime.md`. Full guide (Russian): the platform guide "extension-state" in the application-layer guides of the platform repository,
with its RFC for the contract.

## Choose the place

| Where | Put there | Survives |
|---|---|---|
| `bridge.state` | per-user screen state: filters, sort, tab, columns, form draft | reload, other tab, other device of the same user |
| your BFF, keyed by `authContextStateKey(claims)` | vendor data: saved queries, alert rules, heavy caches, anything over the host limit or needed by your server | until you delete it |
| last-value cache (`meta.fromCache`) | nothing durable: the last bus event of this host session | the session only |

Rule: if the screen must reopen "as the user left it", use `bridge.state`. If your server needs the value or it is larger
than a few dozen KiB, use the BFF. Never read `fromCache` to restore a filter. The key of `bridge.state` is
(extension, placement, user): each user has their own state, two placements of one widget do not collide, there is no
state shared by all users.

## Declare it

`versions[].surfaces.ui.state`: `schema` (JSON Schema, mandatory), `schemaVersion` (string), optional `agentVisible`.
Without it every call answers `STATE_SCHEMA_REQUIRED`. Bump `schemaVersion` on every schema change and ship a migration.

## Filter-panel pattern

1. Start from defaults and render at once; never wait for the store.
2. `bridge.state.get()`: `null` means defaults; `stale: true` means migrate the old `value` by its `schemaVersion`, then
   save the migrated form on the next `set`.
3. Save debounced (about 400 ms) with `bridge.state.set(value, { ifVersion })`; keep the returned `version`.
4. On `CONFLICT` take `err.current` (version and value), merge your pending change on top, save again once.
5. `bridge.state.onChanged(rec)`: update `version` and apply `rec.value` (change from another tab or device).
6. Catch `InstanceStateError`. `NOT_SUPPORTED` (host without a store, MCP Apps presentation, no user) is not an error
   for the user: keep working on defaults, do not show a failure. Other codes (`STATE_SCHEMA_INVALID`,
   `STATE_TOO_LARGE`, `STATE_NO_INSTANCE`, `STATE_NO_USER`) get a quiet note; filtering keeps working.

```ts
import { InstanceStateError } from '@finamx/extension-sdk';
try {
  version = (await bridge.state.set(filters, { ifVersion: version })).version;
} catch (err) {
  if (err instanceof InstanceStateError && err.code === 'CONFLICT' && err.current) {
    version = err.current.version;
    apply({ ...(err.current.value as object), ...filters });
  } else if (!(err instanceof InstanceStateError && err.code === 'NOT_SUPPORTED')) quietNote(err);
}
```

## BFF data

- Enable the user key: `hostBridge.requiresUserKey: true` (implied by a declared `surfaces.ui.state`). SDK older than
  3.5.0 rejects any `sub` (`SUB_FORBIDDEN`).
- The widget sends `resolveAuthContext(bridge, { jwksUrl, expectedAud })`'s `ctx.redeem.token` as `Authorization: Bearer`.
- The BFF runs `verifyPlatformClaim(token, 'platform.auth_context.v1', EXTENSION_ID, { jwksUrl })` then
  `authContextStateKey(claims)` (`{ host, sub: 'uh_...', instanceId? }` or `null`; `null` means 403).
- Key rows only by that value. Never by `userId`, `instanceId` or `host` from the request body: the widget can forge
  any field, it cannot forge the CMS signature. A setting shared by all placements keys by `(host, sub)`.
- `createS2sWebhookHandler({ onConsentRevoked })`: delete everything stored for `(host, handle)`. The handler must be
  idempotent: the notification can arrive twice.

## Agent and vendor control

- Read: `agentVisible: true` lets the host's agent read the state of the acting user. Everything in the state becomes
  readable to it; keep secrets and draft text the agent must not see out of the schema.
- Write: the platform never lets an agent write `bridge.state`; only the widget does. Control goes through an input
  topic: declare `<extensionId>.<name>` in `surfaces.topics.subscribes[]` with a schema (for example
  `com.vendor.screener.filters.apply`). The widget subscribes, applies the command to the screen, then persists the
  result with `bridge.state.set`. The host (or its agent) publishes to that topic. Next open shows the commanded state.
- Vendor MCP (`surfaces.mcp`): the gateway forwards `x-host-id` and `x-user-id` (the host's user id), not the `uh_`
  handle, so a tool call cannot be tied to one user's placement. Use MCP for vendor settings not tied to a placement
  (the widget reads them from the BFF at load); change what a particular screen shows through the input topic.
- Who else may send that command: see `trust.md` (`acceptFrom`).

## Test

- `createMockBridge({ stateSchema, stateSchemaVersion })` from `@finamx/extension-sdk/mock`: in-memory store with
  host-like errors. Cover: first run without a record, save then re-read, `CONFLICT` on a stale `ifVersion`, schema
  rejection, a `stale: true` migration, no store (`NOT_SUPPORTED`). `simulateEvent(topic, payload)` drives the command
  topic.
- `finamx-ext dev`: state lives in process memory (a widget reload keeps it, restarting dev drops it); two placements of
  one widget have separate state; publish to the input topic from another project widget and check the screen applied
  and remembered it.
- Live host checklist: change filters and reload (kept); change in tab 1 and see tab 2 update (`state:changed`); sign in
  as another user (own filters); remove the placement (state gone, BFF gets `consent/revoked`); with `agentVisible`, ask
  the host agent for the current filters.

Common mistakes: BFF keyed from the body, filters in `fromCache`, a `set` per keystroke, a schema change without a
`schemaVersion` bump and migration, `agentVisible` on a state with private data, `NOT_SUPPORTED` rendered as an empty
screen.
