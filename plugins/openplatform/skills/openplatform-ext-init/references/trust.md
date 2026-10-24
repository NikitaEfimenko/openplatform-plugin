# Trust: own and foreign extensions on one board

Needs `@finamx/extension-sdk` 3.6.0+. API table: `runtime.md`. Full guide (Russian): the platform guide "extension-trust" in the application-layer guides of the platform repository,
with its RFC for the contract.

## What the receiver learns

`meta.relation` on a subscription (live, last-value replay and parked deliveries):

| `relation` | Sender |
|---|---|
| `self` | an extension of your Publisher (team) |
| `other` | anyone else |
| absent | the host itself |
| `trusted` | reserved, issued to no one |

Absent means a host event, never `other`. The platform withholds who the sender is on purpose: identity-based
behaviour would make the board depend on side deals between vendors instead of the user's choice. The exact identity
goes to the audit log only. Never write per-partner logic.

## Decide `acceptFrom` for every own input

`acceptFrom` lives on an own input topic (`subscribes[]` with a `schema`): `any` (default), `trusted`, `self`. A refused
event is invisible to the receiver; host events always pass.

- Input that changes something important (order prefill, trade or settings actions): `acceptFrom: "self"`.
- Input that only displays (chart instrument, row highlight): leave it `any`. Users build boards from several vendors;
  do not close every input.

```json
{ "topicType": "com.vendor.ticket.prefill", "schema": { "type": "object" }, "acceptFrom": "self" }
```

## Soft pattern: accept everyone, treat differently

```ts
bridge.context.subscribe('com.vendor.filters.sync', (payload, meta) => {
  if (meta.relation === 'self' || meta.relation === undefined) apply(payload);   // own widget or host: silently
  else suggest('Apply the filter from another widget?', () => apply(payload));   // other: the user decides
});
```

Optionally mark the source on screen ("from your widget", "from another extension", "from the host") without naming
the vendor.

## Rejections

A refused publisher gets `SENDER_NOT_ACCEPTED` only through `bridge.context.onPublishRejected((err) => ...)` with
`err.topicType` and `err.channel`; `publish` returns nothing and there is no success acknowledgement. Handle it: disable
or explain the action. Do not retry in a loop, the refusal is stable.

## Backend

- One BFF for all your extensions: `verifyPlatformClaim(token, 'platform.auth_context.v1', undefined, { jwksUrl,
  expectedPublisher: process.env.FINAMX_PUBLISHER_TAG })`. `claims.aud` says which widget came; another team's token
  fails with `PUBLISHER_MISMATCH`. The tag (`pub`) is opaque, comes from the cabinet team page or `finamx-ext publishers`,
  and lives only on the BFF: never in the widget bundle or iframe.
- Without a publisher pin the verifier needs `expectedAud` (one extension id). One of the two is mandatory.
- s2s push `rel` (when the host passed `causedBy`): `self` the push was caused by your own extension, `other` by a
  foreign one, absent a host event with no cause. Absent is not safer than `other`: refresh eagerly on `self`, softly
  (a "new data" marker) otherwise.

## Test

- `createMockBridge()`: `simulateEvent(topic, payload, { relation: 'self' | 'other' })` drives both branches (no
  `relation` = host event); `simulatePublishRejected(topic)` drives the rejection handler.
- `finamx-ext dev`: all widgets of the project share a test Publisher tag and are `self` to each other; catalog and
  base widgets are `other`. Put two own widgets and one catalog widget on the board: the `self` input accepts the own
  event, refuses the catalog one (the bus log shows why), and `meta.relation` is right in both cases.
- Live host (two Publishers on one host): a foreign sender to a `self` input gets `SENDER_NOT_ACCEPTED`; to an open
  input it arrives with `relation: other`; same-team events arrive as `self`; a BFF with `expectedPublisher` rejects a
  foreign token.

Do not: treat absent `relation` as `other`; close every input with `self`; ship the Publisher tag to the iframe; wait
for a publish confirmation.
