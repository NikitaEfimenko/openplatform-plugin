# Dual grants — host identity vs exchange auth-context

Independent flags on the extension (`hostBridge`) and echoed on Launch/session. Both travel on the `widget.identity.grant` wire event; `profile` discriminates.

## Mechanism matrix

| Mechanism | Reaches iframe? | Contains a user? | Who signs | Who verifies | Never use it for |
|-----------|-----------------|------------------|-----------|--------------|------------------|
| Launch sessionJwt | No. Host only. | Host session subject, not an extension claim | Platform (Launch) | Platform on invoke | Iframe, extension BFF, URL, logs |
| platform.auth_context.v1 | Exchange code via widget.identity.grant, then the JWT after redeem | No sub | Platform (`iss` = `cms`) | Extension via verifyPlatformClaim | User identity, SSO, upstream Core access |
| platform.identity.v1 | Compact JWT via widget.identity.grant profile platform.identity.v1 field identityToken | Yes. `sub` is the host-local user id | Host, ES256, private key only on the host | Extension BFF via verifyHostIdentity (host JWKS + platform-signed authorized-issuers) | SSO, account linking, s2s data access, another extension `aud` |
| platform.s2s.v1 | No | No sub (userless) | Platform | Extension webhook verifier | User identity, iframe |
| platform.s2s.user.v1 | No | Pairwise `uh_` handle (push) or host bucket (pull), 120 s, one scope, consent-gated | Platform | Extension (push) or host verifyUserBoundS2s (pull) | Replacing identity, SSO, widening scope, iframe |
| Extension OIDC / BFF SSO | Popup, opaque app session only | The extension's own account | The extension's IdP | The extension | Core or gateway access tokens in the iframe; automatic linking from `sub` |

## Flags

| Flag | Mechanism | Host wiring |
|------|-----------|-------------|
| `requiresIdentityContext` | `widget.identity.grant` profile `platform.identity.v1`, field `identityToken` | `mintIdentity` calls your server route, which signs with `signHostIdentity` from `@finamx/host-bridge/server` (the private key never reaches the browser) and returns `{ profile: 'platform.identity.v1', mode: 'identity', identityToken }` |
| `requiresAuthContext` | profile `platform.auth_context.v1` (exchange) | Auto from Launch `exchangeCode`/`redeemUrl`, or `mintAuthContext`; remint via `remintAuthContext` |

Both true → send the identity grant first, then the auth-context grant (two envelopes). Keep `identityGrant` and `authContextGrant` separate in UI state. A wrong-profile result in a slot is dropped with an error, never posted. Do not put `sub` into auth-context.

The extension verifies the identity with `verifyHostIdentity` (or `resolveHostIdentity` in the SDK waiter): ES256 signature by the host JWKS **and** the platform-signed authorized-issuers document for that extension. The host sends no shared-secret identity. `platform.s2s.user.v1` is consent-gated host data access for an extension backend; it is not identity and not SSO.

## Host key setup

1. Generate an ES256 (P-256) key pair on the host. Keep the private JWK only in the host secret store (an environment secret, or a file with mode 0600). Never commit it, never ship it to the browser.
2. Register only the public half in the host admin Keys area: `kid` (`<hostId>.<suffix>`) and the public JWK. Private members (`d`, ...) are rejected on save.
3. Use the same `kid` when the host signs.
4. A missing or corrupt key means the mint route answers 503 `IDENTITY_KEY_MISSING` and no grant is sent.

## Key rotation

1. Publish the new public `kid` while the previous public `kid` stays registered for at least 300 seconds (the claim TTL).
2. Confirm both keys are in the host JWKS and in the signed issuer list (`GET {portal}/api/v1/extensions/{extensionId}/authorized-issuers`).
3. Only then switch the host private key in the secret store to the new one.
4. Remove the old public key after the overlap window.

Rollback is to stop sending the identity grant. There is no shared-secret fallback.

## Remint (no iframe reload)

```ts
async function remintAuthContextGrant(session: { requiresAuthContext?: boolean; extensionId: string; userId: string }, cmsBase: string, hostToken?: string) {
  if (!session.requiresAuthContext) return null;
  const url = new URL('/api/v1/auth-context/mint', cmsBase);
  if (hostToken) url.searchParams.set('hostToken', hostToken);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ extensionId: session.extensionId, userId: session.userId }),
  });
  if (!res.ok) return null;
  return res.json(); // { exchangeCode, redeemUrl, uiContext? }
}
```

## Never

- `exchangeCode` in URL/query
- Core or gateway access tokens into the iframe as "platform auth"
- Launch `sessionJwt` into the iframe, a URL or logs
- A private JWK (`d`) in an example, repo, admin field or browser bundle
- Invent `widget.auth.exchange` — transport stays `widget.identity.grant`
