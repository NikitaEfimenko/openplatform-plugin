# Auth context and identity

Use only when the widget (or its backend) must know which platform user and host it serves. Most widgets do not.

## Platform auth context (recommended form)

Manifest:

```json
"hostBridge": { "requiresAuthContext": true },
"versions": [{ "capabilitiesRequested": ["auth.context", "ui.toast"], "…": "…" }]
```

Widget:

```js
import { resolveAuthContext } from '@finamx/extension-sdk';

const ctx = await resolveAuthContext(bridge, {
  jwksUrl: 'https://openplatform.changesandbox.ru/.well-known/jwks.json', // the portal you submit to
  expectedAud: EXTENSION_ID,
  timeoutMs: 15000,
});
const token = ctx.mode === 'exchange' ? ctx.redeem.token : null; // send as Authorization: Bearer to your BFF
```

- The host sends a `widget.identity.grant`; `resolveAuthContext` waits for it, redeems the exchange code and
  verifies the claim (`platform.auth_context.v1`, short-lived, no `sub`).
- The host may re-issue the grant without a reload: on a 401 from your backend, call `resolveAuthContext` again once.
- Do not block the UI on it: start the widget, show "connecting" for the data that needs the backend.

Backend (Node):

```js
import { verifyPlatformClaim } from '@finamx/extension-sdk';
const claims = await verifyPlatformClaim(token, 'platform.auth_context.v1', 'com.acme.my-widget', {
  jwksUrl: 'https://openplatform.changesandbox.ru/.well-known/jwks.json',
});
```

`expectedProfile` and `expectedAud` are mandatory: without them any platform token would pass.

## What the claim is not

It proves "this request comes from your extension running in a platform session". It is not an access token for
any upstream API. If your backend calls a partner API on behalf of the user, do that API's own auth:

1. Start OAuth (PKCE) **inside a popup** you open from the widget (`openOAuthPopup`), not inside the iframe.
2. Exchange the code on your server.
3. The popup's done message carries only your own opaque session id, never the upstream access or refresh token.
4. Prefer a Bearer token held in memory over third-party cookies (they are often blocked in embedded frames).

## Identity context (partner apps)

`hostBridge.requiresIdentityContext: true` makes the host send an HMAC-mode grant with `identityContext` and
`apiBase` (for partner apps that run their own identity broker). Read it with `awaitIdentityGrant` or the `hmac`
branch of `resolveAuthContext`. Do not invent cookies inside the iframe.

## Headless backends

- Host topics to your server: `surfaces.topics` with `delivery: ["s2s"]` and `s2sChannels.webhook.url`; verify the
  incoming token with `createS2sWebhookHandler()` (host-only profile) for public topics.
- Private per-user host data: user-bound s2s (`user-bound-s2s.md`); never verify a user-bound token with the
  host-only verifier, and vice versa.
