# CMS endpoints the host needs

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/v1/embed/launch` | Signed launch; may return `requiresIdentityContext`, `requiresAuthContext`, `exchangeCode`, `redeemUrl`, `uiContext` (host-only), `integrityStatus`; 409 `EXTENSION_INTEGRITY_DRIFT`, 503 `INTEGRITY_STATE_UNAVAILABLE` |
| POST | `/api/v1/auth-context/mint` | Host-auth remint (`?hostToken=`) |
| POST | `/api/v1/auth-context/redeem` | Public iframe redeem → `platform.auth_context.v1` |
| GET | `/.well-known/jwks.json` | Verify claims |
| GET | `/api/v1/extensions/{id}/authorized-issuers` | Confused-deputy defense |
| POST | `/api/v1/invoke` | Capability proxy |
| GET | `/api/v1/extensions` | Catalog (Bearer + availability); items carry `integrityStatus` |
| GET | `/api/v1/hosts/self/domain` | This host's domain |
| GET | `/api/v1/widget-hub` | Optional hub |

Never put `exchangeCode` into `launchUrl` query or `__FINAMX_BRIDGE_SESSION__` for the iframe.

## Integrity

Extensions that run from an origin the platform does not own are moderated and monitored. The state is the optional `integrityStatus` object `{ state, reason, checkedAt? }` (no URLs, hashes or credentials). Read it from the catalog (`GET /api/v1/extensions` items), from `POST /api/v1/embed/launch` (`LaunchResponse`) and, for MCP Apps, from `present_*` / `finamx_launch` (see the generative-UI `mcp-tools-reference.md`).

| `state` | Meaning | Host behaviour |
|---------|---------|----------------|
| `verified` | content-addressed artifact, matched declared hash, or platform-rendered | no marker needed |
| `unverified` | cannot be verified (no declared hash, unreachable, domains not approved, not yet checked) | stays available; show a neutral "unverified" marker, never hide it |
| `approved-by-migration` | grandfathered domains awaiting moderator confirmation | stays available; show a marker |
| `drift` | the reviewed bundle or origin changed | do not offer launch; launch returns 409 |

Errors on launch:

- 409 `EXTENSION_INTEGRITY_DRIFT`: show "temporarily unavailable". Not retryable in a loop; offer launch again only after the catalog shows a non-drift state (it heals by itself when the author restores the reviewed bytes or origin). The extension is not suspended.
- 503 `INTEGRITY_STATE_UNAVAILABLE`: fail-closed lookup failure; retry after 5 s (`Retry-After`, `retryAfterSeconds`), a few times at most.

Re-consent: installed extensions in the catalog and in `extension.list` carry `reconsentRequired` and `missingScopes` when the latest version requests scopes the user has not granted. Grants never widen on their own: when `reconsentRequired` is true, show your consent screen with `missingScopes` and then install with the wider scope set; until then calls behind the new scopes stay denied (`SCOPE_DENIED`).
