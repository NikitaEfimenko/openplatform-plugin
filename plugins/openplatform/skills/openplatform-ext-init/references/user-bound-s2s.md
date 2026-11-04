# User-bound s2s: private host data on your backend

Two profiles. Do not mix them up.

| Profile | Token typ | Use | Verify with |
|---------|-----------|-----|-------------|
| host-only `platform.s2s.v1` | host or platform as caller, no user | public topics (no consent) | `verifyPlatformClaim` / `createS2sWebhookHandler()` default |
| user-bound `platform.s2s.user.v1` | CMS-minted after the user's consent | private host data for one user | `verifyUserBoundS2s` / `createS2sWebhookHandler({ profile: 'user' })` |

The host-only verifier **refuses** user tokens and the user verifier refuses host tokens (`WRONG_PROFILE`). Never accept a user-bound token with the host-only verifier.

Claims of `platform.s2s.user.v1` (ES256, signed by CMS, TTL 120 s): `iss` cms, `aud`, `sub`, `jti`, `host` (hostId), `ext` (extensionId), `scope` (space separated), `dir` (`push` | `pull`).

`platform.s2s.user.v1` `sub` is not `platform.identity.v1` `sub` and is not an extension account id: push `sub` is a pairwise handle, pull `sub` is a host bucket. It carries one scope for 120 s and is not a login; never use it to identify or link an account (see `auth-context.md`).

## Push receiver (host -> your backend)

The host calls your stored webhook (`surfaces.topics.s2sChannels.webhook.url`). `aud` is your `extensionId`, `sub` is a pairwise handle (`uh_...`, stable per user and host, not the host's user id).

```ts
import { createS2sWebhookHandler } from '@finamx/extension-sdk';

const handler = createS2sWebhookHandler({
  extensionId: 'com.acme.diary',
  profile: 'user',
  jwksUrl: `${process.env.FINAMX_PLATFORM_API_BASE /* the portal, e.g. https://openplatform.changesandbox.ru */}/.well-known/jwks.json`,
  onTopic: async (request, _claims, user) => {
    // user = { sub, scopes, host, ext }; check user.scopes before touching private data
  },
});
// or directly:
// import { verifyUserBoundS2s, createReplayCache } from '@finamx/extension-sdk';
// const claims = await verifyUserBoundS2s(token, {
//   jwksUrl, expectedAud: 'com.acme.diary', expectedDir: 'push', expectedHost: 'com.acme.host',
//   replayCache: createReplayCache(), // one per process: jti is single use
// });
```

## Pull client (your backend -> host data)

Generate an ES256 key pair; keep the private JWK in your secret store, never in the repo or the browser. The same
registered `s2sClient` key signs Flow Runner completion assertions (`flow-runner.md`). Run from the extension project,
replacing the quoted script path with the installed `openplatform-ext-init` skill path:

```bash
node "/path/to/openplatform-ext-init/scripts/generate-s2s-keypair.mjs" --out-dir .secrets/finamx-s2s
```

Add `.secrets/` to the extension project's `.gitignore` before running. The script creates a mode-0600
`s2s-private.jwk.json`, `s2s-public.jwk.json` and `s2s-public.jwks.json` with matching `kid`; it refuses to overwrite
existing files and prints paths only. Give the **single public JWK** and its `kid` to platform moderators: they register it on your extension
record (`s2sClient.publicJwk` + `s2sClient.kid`; it is not part of `manifest.json`). Never send the private key.
Changing the key of a published extension triggers a manual review. On rotation keep the old private key until the
new public key is approved and active, then switch the backend secret and remove the old key.

```ts
import { requestUserS2sToken, callHostMethod } from '@finamx/extension-sdk';

const { token, endpoint } = await requestUserS2sToken({
  cmsBase: process.env.FINAMX_PLATFORM_API_BASE!,
  extensionId: 'com.acme.diary',
  privateJwk: JSON.parse(process.env.S2S_PRIVATE_JWK!),
  kid: process.env.S2S_KID!,
  hostId,          // from the Launch session
  user: s2sUserHandle, // the handle the host gave you for this user (Launch response)
  method: 'portfolio.read',
});
const data = await callHostMethod({ endpoint, token, method: 'portfolio.read', params: {} });
```

- The endpoint URL comes **from CMS** (`Hosts.s2s.methodEndpointUrl`). Never dial a URL of your own or one a user or host message hands you; `callHostMethod` requires https, no redirects, 5 s timeout.
- CMS mints only if the user consented, the extension is licensed for the host and the scope is granted; otherwise you get `UserS2sTokenError` (uniform `NO_CONSENT` for missing/revoked consent).
- Fetch a fresh token per call or per short burst (TTL 120 s). Pull `sub` is the host's own user bucket id.

## Dev without a host

`createMockBridge()` has **no** built-in host vocabulary: every invoke answers `NOT_IMPLEMENTED` until you opt in, and `grantedScopes` defaults to empty (pass the scopes you test with).

```ts
import { createMockBridge, createFixtureInvoke } from '@finamx/extension-sdk/mock';

const bridge = createMockBridge({
  grantedScopes: ['market.read'],
  invokeHandler: createFixtureInvoke({ 'market.quote': { symbol: 'SBER', name: 'Sber', price: 1 } }),
});
// fixture answers carry `_mock: true` and `[MOCK]` name prefixes; never ship them as real data
```
