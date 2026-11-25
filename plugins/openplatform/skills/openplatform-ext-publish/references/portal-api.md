# Developer API (for scripts and CI)

Base: the portal, e.g. `https://openplatform.changesandbox.ru`. Auth: `Authorization: Bearer <developer token>`.

| Method | Path | Body | Success |
|---|---|---|---|
| POST | `/api/v1/developer/artifacts` | `{ files: [{ path, sha256, contentBase64 }], entry, sha256 }` (`finamx-ext publish` builds and sends it) | 201 |
| POST | `/api/v1/developer/extensions` | full manifest | 201/202, status `in_review` |
| POST | `/api/v1/developer/extensions/{extensionId}/versions` | one version object (the last `versions[]` entry) | 202, `review: pending_version` or `in_review` |
| GET | `/api/v1/developer/extensions` | — | 200 `{ items: [{ extensionId, displayName, status, moderatorComment, updatedAt }] }` (only this account's) |
| GET | `/api/v1/developer/extensions/{extensionId}` | — | 200 status and moderator comment; 404 if not owned by this account |
| GET | `/api/v1/hosts/picker` | — | 200 `{ hosts: [{ hostId, displayName, status }] }`: host ids for `desiredHostIds` |
| PUT | `/api/v1/developer/extensions/{extensionId}/s2s-key` | `{ publicJwk, kid }` (single public ES256 JWK; developer login + Publisher) | 200 `{ registered, kid, reviewRequired }`; 409 on replacement of a published key; companion CMS deployment required |
| GET | `/op/jwks` | — | CMS-only keys for auth-context, user-bound S2S and platform Flow invocation verification |
| GET | `/host/jwks` | — | host identity keys; never a trust source for CMS-issued tokens |

Account endpoints (browser UI is simpler): `/ru/developer/register`, `/ru/developer/dashboard` (`/en/...` for English).

## CI example (GitHub Actions)

```yaml
- run: npm ci && npm run build && npx finamx-ext check && npx finamx-ext publish --api https://openplatform.changesandbox.ru
  env:
    FINAMX_DEV_TOKEN: ${{ secrets.FINAMX_DEV_TOKEN }}
```

Take the key from the CI secret store and always set `--api` explicitly: a key from the environment is only sent to a
portal named by `--api` or `FINAMX_API_URL`.

Run the publish step only on tags or manual dispatch: every run with a new version number creates a review request.
