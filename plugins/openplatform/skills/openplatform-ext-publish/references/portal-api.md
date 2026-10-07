# Developer API (for scripts and CI)

Base: the portal, e.g. `https://openplatform.changesandbox.ru`. Auth: `Authorization: Bearer <developer token>`.

| Method | Path | Body | Success |
|---|---|---|---|
| POST | `/api/v1/developer/artifacts` | `{ files: [{ path, sha256, contentBase64 }], entry, sha256 }` (build it with the SDK packer, see `publish.mjs`) | 201 |
| POST | `/api/v1/developer/extensions` | full manifest | 201/202, status `in_review` |
| POST | `/api/v1/developer/extensions/{extensionId}/versions` | one version object (the last `versions[]` entry) | 202, `review: pending_version` or `in_review` |
| GET | `/api/v1/developer/extensions` | — | 200 `{ items: [{ extensionId, displayName, status, moderatorComment, updatedAt }] }` (only this account's) |
| GET | `/api/v1/developer/extensions/{extensionId}` | — | 200 status and moderator comment; 404 if not owned by this account |
| GET | `/api/v1/hosts/picker` | — | 200 `{ hosts: [{ hostId, displayName, status }] }`: host ids for `desiredHostIds` |
| GET | `/.well-known/jwks.json` | — | platform keys for verifying auth-context and s2s tokens |

Account endpoints (browser UI is simpler): `/developer/register`, `/developer/dashboard`.

## CI example (GitHub Actions)

```yaml
- run: npm ci && npm run build && node scripts/finamx/check.mjs
- run: node scripts/finamx/publish.mjs
  env:
    FINAMX_DEV_TOKEN: ${{ secrets.FINAMX_DEV_TOKEN }}
    FINAMX_API_URL: https://openplatform.changesandbox.ru
```

Run the publish step only on tags or manual dispatch: every run with a new version number creates a review request.
