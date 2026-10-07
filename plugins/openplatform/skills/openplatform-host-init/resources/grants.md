# Dual grants — HMAC identity vs exchange auth-context

Independent flags on the extension (`hostBridge`) and echoed on Launch/session.

| Flag | Mechanism | Host wiring |
|------|-----------|-------------|
| `requiresIdentityContext` | `widget.identity.grant` `mode: 'hmac'` | `mintIdentity` → e.g. POST `/api/avatar/session` → `{ identityContext, apiBase }` |
| `requiresAuthContext` | `mode: 'exchange'` | Auto from Launch `exchangeCode`/`redeemUrl`, or `mintAuthContext`; remint via `remintAuthContext` |

Both true → send HMAC first, then exchange (two envelopes). Keep `identityGrant` and `authContextGrant` separate in UI state.

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
- Core access tokens into the iframe as “platform auth”
- Invent `widget.auth.exchange` — transport stays `widget.identity.grant`
