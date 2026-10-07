# PubSub / FDC3 rules

1. One module-level `pubSubBroker` shared by **every** embed that should interop.
2. Pass the same instance into `useExtensionEmbed({ pubSubBroker })`.
3. `fdc3DesktopAgent: true` when the widget speaks FDC3 Desktop Agent.
4. Manifest `surfaces.topics` drives UX/docs; runtime fan-out for `delivery: ["bridge"]` is PubSubBroker. `delivery: ["s2s"]` is server-side (CMS dispatch), not the browser broker.

## Never on the bus

Do not put on pubsub payloads or board snapshots:

- `exchangeCode`, `redeemUrl`
- tokens, JWTs, identityContext
- hostToken, session secrets

## Multi-widget boards

Without a shared broker, each iframe silos silently — looks like “pubsub broken”.
