# Env and host token

## Required env (host app)

| Var | Purpose |
|-----|---------|
| `FINAMX_HOST_TOKEN` | Server-side Bearer for CMS/MCP |
| `NEXT_PUBLIC_FINAMX_HOST_TOKEN` | Only if browser must call Launch with `?hostToken=` (prefer server proxy) |
| `FINAMX_PLATFORM_API_BASE` or `NEXT_PUBLIC_CMS_URL` | platform base (default `https://openplatform.changesandbox.ru`) |

Gitignore `.env.local`. Never commit plaintext keys.

## Mint / rotate / revoke

1. Open `{CMS}/admin` → **Hosts**
2. Select host → **Issue key** (copy once)
3. Rotate / Revoke from same UI


## Auth shapes

| Consumer | How |
|----------|-----|
| MCP `:3100/mcp` | `Authorization: Bearer <FINAMX_HOST_TOKEN>` |
| Catalog REST | same Bearer |
| Embed Launch | often `?hostToken=` on launch URL (host-bridge `fetchEmbedLaunch`) |
| Auth-context remint | `POST /api/v1/auth-context/mint?hostToken=` |

## Tenant gate

`extension.list` / catalog list is **empty** until admin saves **extension-host-availability** for this `hostId`. Visibility ≠ availability.

Host = tenant (no org grouping).
