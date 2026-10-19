# Auth context and identity

Use only when the widget (or its backend) must prove where it runs or know which host user it serves. Most widgets do not need any of this.

## Mechanism matrix

Pick by what the extension needs. Ordinary widgets need none of them (no auth flag).

| Mechanism | Reaches iframe? | Contains a user? | Who signs | Who verifies | Never use it for |
|-----------|-----------------|------------------|-----------|--------------|------------------|
| Launch sessionJwt | No. Host only. | Host session subject, not an extension claim | Platform (Launch) | Platform on invoke | Iframe, extension backend, URL, logs |
| `platform.auth_context.v1` | Exchange code via `widget.identity.grant`, then the JWT after redeem | No `sub` unless opted in; then the pairwise handle `uh_`, never the host user id | Platform | Extension via `verifyPlatformClaim` | User identity, SSO, upstream API access |
| `platform.identity.v1` | Compact JWT via `widget.identity.grant`, profile `platform.identity.v1`, field `identityToken` | Yes. `sub` is the host-local user id | Host, ES256, private key only on the host | Extension backend via `verifyHostIdentity` (host JWKS + signed authorized-issuers) | SSO, account linking, s2s data access, another extension's `aud` |
| `platform.s2s.v1` | No | No `sub` | Platform | Extension webhook verifier | User identity, iframe |
| `platform.s2s.user.v1` | No | Pairwise handle (push) or host bucket (pull), 120 s, one scope | Platform | Extension (push) or host via `verifyUserBoundS2s` (pull) | Replacing identity, widening scope, iframe |
| Extension OIDC / backend SSO | Popup, opaque app session only | The extension's own account | The extension's identity provider | The extension | Core or gateway access tokens in the iframe; automatic linking from `sub` |

Which flag for which need:

| Need | Choose |
|------|--------|
| Ordinary widget, public data | No auth flag |
| Host data for the user (portfolio, orders) | `invoke` with granted scopes, or user-bound s2s (`user-bound-s2s.md`) |
| Proof that the launch came from the platform | `requiresAuthContext` → `platform.auth_context.v1` |
| Trusted host user id on the extension backend | `requiresIdentityContext` → `platform.identity.v1` |
| Extension-owned accounts, login, SSO | The extension's own OIDC / backend popup flow |

Both flags may be true; the host then sends two grants (identity first, then auth-context). Both arrive as `widget.identity.grant`; the `profile` field is the only discriminator.

## Platform auth context (`requiresAuthContext`)

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
const token = ctx.mode === 'exchange' ? ctx.redeem.token : null; // send as Authorization: Bearer to your backend
```

- The host sends a `widget.identity.grant`; `resolveAuthContext` waits for it, redeems the exchange code and
  verifies the claim (`platform.auth_context.v1`, short-lived, issuer `cms`). It never returns a host user id.
  The claim carries `host`, a CMS-bound `instanceId` and an opaque Publisher tag `pub`; `sub` only on opt-in (below).
- The host may re-issue the grant without a reload: on a 401 from your backend, call `resolveAuthContext` again once.
- Do not block the UI on it: start the widget, show "connecting" for the data that needs the backend.

Backend (Node):

```js
import { verifyPlatformClaim } from '@finamx/extension-sdk';
const claims = await verifyPlatformClaim(token, 'platform.auth_context.v1', 'com.acme.my-widget', {
  jwksUrl: 'https://openplatform.changesandbox.ru/.well-known/jwks.json',
});
```

`expectedProfile` is mandatory, and so is `expectedAud` or `expectedPublisher` (SDK 3.6.0+): without either, any
platform token would pass. Pin the Publisher tag (cabinet, team page or `finamx-ext publishers`) so another
Publisher cannot replay its own token:

```js
// shared backend for several widgets of one Publisher
const claims = await verifyPlatformClaim(token, 'platform.auth_context.v1', undefined, {
  jwksUrl, expectedPublisher: process.env.FINAMX_PUBLISHER_TAG, // other tag: PUBLISHER_MISMATCH
});
```

### Opt-in user key (`sub`)

`sub` is present only when the manifest sets `hostBridge.requiresUserKey: true`, or automatically when the published
version declares `surfaces.ui.state`. It is the pairwise handle `uh_` (per host and extension), not the host user id and
not an identity. Key server-side state only by `authContextStateKey(claims)` = `(host, sub, instanceId)`, never by
values from the widget's request body. Opt in only together with `@finamx/extension-sdk` 3.5.0 or newer: older
verifiers reject any `sub` (`SUB_FORBIDDEN`). Handle `consent/revoked` with
`createS2sWebhookHandler({ onConsentRevoked })` and delete the `(host, handle)` data.

It proves "this request comes from your extension running in a platform session". It is not SSO, not a user identity
and not an access token for any upstream API.

## Host identity (`requiresIdentityContext`)

`platform.identity.v1` is an ES256 JWT signed by the **host** (`iss` = host id, `sub` = host-local user id,
`aud` = your extension id, lifetime up to 300 s). The iframe only forwards the compact token to your backend; the
backend verifies it.

```ts
import { resolveHostIdentity, verifyHostIdentity } from '@finamx/extension-sdk';

// Widget side: await the identity grant and verify in one step,
// or forward grant.identityToken to your backend and call verifyHostIdentity there.
const claims = await resolveHostIdentity(bridge, {
  audience: EXTENSION_ID,
  issuer: HOST_ID,         // exact host id, never defaulted
  jwksUrl: HOST_JWKS_URL,  // the host's public keys
  authorizedIssuersSig,    // `sig` from GET {portal}/api/v1/extensions/{extensionId}/authorized-issuers
  cmsGetKey,               // portal public key resolver for that signature
});
// Backend: await verifyHostIdentity(identityToken, { audience, issuer, jwksUrl, authorizedIssuersSig, cmsGetKey });
```

- Two checks must both pass: the signature is by a key in the host JWKS, **and** the platform-signed
  authorized-issuers document lists that host and key for your extension. JWKS membership alone never authorizes a
  host; never read the unsigned `issuers` array.
- `sub` is the host's user id. It is not a login, not an account id of your product and not the `sub` of
  `platform.s2s.user.v1`. Do not link or merge accounts automatically from it.
- There is no shared-secret (HMAC) path for identity. `awaitIdentityGrant` is only the unverified waiter behind
  `resolveHostIdentity`; do not read the user id from it directly.
- Do not invent cookies inside the iframe.

### What the host does (so you can ask for it)

1. Generates an ES256 (P-256) key pair locally and keeps the private JWK only in its secret store or a file with mode
   0600. The private key never goes to the browser or a repository.
2. Registers the key id (`<hostId>.<suffix>`) and the **public** JWK in the host admin Keys area. Private members
   are rejected.
3. Rotates by publishing the new public key first and keeping the previous one for at least 300 seconds (the token
   lifetime) before signing with the new private key.
4. Rolls back by no longer sending the identity grant, never by going back to a shared secret.

## Your own accounts and upstream APIs (backend SSO)

If your backend calls a partner API on behalf of the user, or you keep your own accounts, use that service's own auth:

1. Start OAuth (PKCE) **inside a popup** you open from the widget (`openOAuthPopup`), not inside the iframe.
2. Exchange the code on your server.
3. The popup's done message carries only your own opaque session id, never the upstream access or refresh token.
4. Prefer a Bearer token held in memory over third-party cookies (they are often blocked in embedded frames).

Core or gateway access tokens never enter the iframe.

## Headless backends

- Host topics to your server: `surfaces.topics` with `delivery: ["s2s"]` and `s2sChannels.webhook.url`; verify the
  incoming token with `createS2sWebhookHandler()` (host-only profile) for public topics.
- Private per-user host data: user-bound s2s (`user-bound-s2s.md`); never verify a user-bound token with the
  host-only verifier, and vice versa. A user-bound `sub` is not an identity.
