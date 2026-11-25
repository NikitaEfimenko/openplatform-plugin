# User-bound s2s: private host data on your backend

Two profiles. Do not mix them up.

| Profile | Token typ | Use | Verify with |
|---------|-----------|-----|-------------|
| host-only | `platform.s2s.v1` | host/platform caller, public topics without a user | `verifyPlatformClaim` / `createS2sWebhookHandler()` default |
| user-bound | `platform.s2s.user.v1` | CMS-minted after consent, private host data for one user | `verifyUserBoundS2s` / `createS2sWebhookHandler({ profile: 'user' })` |

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
  jwksUrl: `${process.env.FINAMX_PLATFORM_API_BASE /* the portal, e.g. https://openplatform.changesandbox.ru */}/op/jwks`,
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

Use this sequence for pull access and for Flow V2 completion. Explain each step before running it.

Explain the three roles plainly: the developer key lets the CLI manage your extension; the private signing key
stays on your backend and signs its requests; the matching public JWK is sent to the platform to verify those
signatures. These are separate credentials. CMS keys from `/op/jwks` verify incoming platform tokens; they do not
replace your backend's own key pair. You do not need to copy a public key into a moderator chat for initial setup:
`register` sends it through the developer API. A moderator is still responsible for publication and live-key rotation.

1. Log in with `finamx-ext login`; the developer enters the key in their terminal. Select the Publisher with
   `finamx-ext publishers use <id>` if needed. Never ask for keys in chat.
2. Check `finamx-ext s2s --help` includes `keygen` and `register`. Install/update `@finamx/extension-sdk@latest` for these commands.
   The selected CMS also needs a deployment exposing `PUT /api/v1/developer/extensions/{extensionId}/s2s-key`. Installing `@finamx/extension-sdk@latest` alone does not establish CMS support. If absent, report the CLI/CMS upgrade dependency. The bundled
   `scripts/generate-s2s-keypair.mjs` remains a generation-only fallback; it cannot register a key.
3. Add `.secrets/` to the project's `.gitignore` **before** generation. Run:

   ```bash
   finamx-ext s2s keygen --out-dir .secrets/finamx-s2s
   ```

   It creates private/public JWK and public JWKS files with the same `kid`, refuses overwrites, and prints only
   paths. The private file is mode 0600. Put it in the deployed BFF secret store; never read its content into chat,
   logs or a browser bundle. Use different keys per environment.
4. Deploy the HTTPS webhook and submit its URL in the extension version manifest with `finamx-ext publish`.
   Registration needs an existing extension record. A private `push` does not enable published-only S2S or Flow.
5. From that extension project run:

   ```bash
   finamx-ext s2s register --public-jwk .secrets/finamx-s2s/s2s-public.jwk.json
   # Or name the extension explicitly:
   finamx-ext s2s register com.acme.diary --public-jwk .secrets/finamx-s2s/s2s-public.jwk.json
   ```

   This uses the saved developer login and Publisher and sends only a single public ES256 JWK plus its `kid`.
   It rejects a private JWK or JWKS file. The same registration can be retried. `--json` reports `registered`,
   `kid` and `reviewRequired`. Registration is not proof of publication, consent or a working webhook.
6. Confirm the published version, host availability/licence, required consent, deployed key identifier and a real
   call. Initial registration on an already published extension flags manual review under the existing platform
   policy; this flag is not a deferred activation queue. A changed key **or kid** on a published extension with
   an existing key returns `S2S_KEY_ROTATION_REQUIRES_MODERATOR` (409) without replacing it. Arrange moderator
   rotation and switch the backend secret when the intended public key is active. Never regenerate on every run.

For a 401, log in again; for `PUBLISHER_REQUIRED`, select the Publisher; for 404 verify portal, extension ID,
Publisher access and that the CMS has the new endpoint. Do not retry by sending a private key or using a host key.

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
