# Errors

## Submitting (developer API)

| Where | Answer | Cause | Fix |
|---|---|---|---|
| any | network error, `fetch failed` | a proxy dropped the connection | `publish.mjs` retries up to 6 times; just re-run, it is idempotent |
| any | 401 `UNAUTHORIZED` | no token, wrong token, revoked token, token of another portal | new token in the dashboard; check `FINAMX_DEV_TOKEN` and `FINAMX_API_URL` point to the same portal |
| upload | 4xx with `error`/`code` | the artifact violates limits or file rules | `check.mjs`: ≤ 200 files, ≤ 5 MiB, allowed types, no hidden files, entry `.html` present |
| submit | 400 `INVALID_JSON` | not JSON | — |
| submit | 400 `INVALID_MANIFEST` + `details` | strict schema: unknown key (`kind`, `widget`, `pubsub`, `hosts`), bad extensionId, missing `platformSupport`/`description`, bad semver, `artifact` together with `embedBundleUrl`, `embedEntryPath` with an artifact, bad csp origin, disallowed sandbox token | read `details[].path`; `check.mjs` reports the same in plain words |
| submit | 400 with a topic message (`an extension-owned topic needs a JSON Schema`, `a schema is only allowed on topics in your namespace`) | own topic not named `<extensionId>.<name>`, or a schema on a host topic | rename own topics to `<extensionId>.<name>` with schema; drop schemas from host topics |
| submit | 400 `surfaces.mcp.namespace … already used` | MCP namespace taken | choose another namespace |
| submit | 403 `NAMESPACE_RESERVED` | `com.finamx.*` | your own prefix |
| submit | 409 `EXTENSION_EXISTS` | id already registered | if yours: submit a version (`publish.mjs` does it); otherwise another id |
| submit | 400 `ARTIFACT_*` / unknown sha256 | the manifest references an artifact this account did not upload | let the script upload and fill `artifact` (never write it by hand) |
| submit | 400 `BUNDLE_IMPORT_FAILED` | `embedBundleUrl` import failed (entry unreachable, redirect, asset missing, > 200 files, > 5 MiB) | serve files with direct 200; or switch to artifact upload |
| submit | 400 `BUNDLE_UNREACHABLE` / `BUNDLE_SHA_REQUIRED` | legacy link mode could not pin the bundle hash | 200 without redirect, or upload instead |
| submit | 400 `SANDBOX_ORIGIN_NOT_CONFIGURED` | this platform cannot serve artifacts | use `embedBundleUrl` there |
| version | 404 `NOT_FOUND` | the extension exists but was submitted by another account (the version route only finds extensions of the token owner; 404 rather than 403 so ownership is not disclosed) | the owner's token, a transfer by a moderator, or a new extensionId |
| version | 409 `VERSION_NOT_NEWER` | the version is not higher than every stored version | bump semver in a new `versions[]` entry |
| version | 409 `EXTENSION_SUSPENDED` | moderators suspended it | contact them |
| submit | 400 `Cannot change version … from free to a paid monetization type` | monetization of an existing version changed | new version |

## Review (moderator side; ask the moderator for the exact message)

| Answer | Cause | Fix |
|---|---|---|
| 409 `DOMAINS_NOT_APPROVED: <kind> <origin>` | an external domain of the version is not approved for this extension (`connect`, `resource`, `frame`, or `bundle` for a live link) | moderator: Trust & integrity → Approve each domain, then approve the version / publish. Developer: justify each domain in the changelog |
| 400 on "Approve version" with a topic message | a pending version violates the topic rules (submitted before the rules were checked client-side) | fix the manifest, submit the same version number again: a newer pending submission replaces the old one |
| version approved but the host shows the old one | the open page still runs the old iframe | reload the host page (hard reload) or re-add the widget |

## Launch and runtime (in the host)

| Symptom | Cause | Fix |
|---|---|---|
| widget missing from the host catalog | not `published`, or not enabled for that host (host availability) | ask the moderator to enable it for the host |
| `Granted scopes not in manifest: X` | the host grants a scope the version does not request (a host bug or a stale consent) | request exactly what you use; report the host |
| empty page / dark page / no theme | the script did not run: CSP (inline script/style, eval, WebAssembly) or `embedSandbox` without `allow-same-origin` | `npm run check:host`; remove `embedSandbox`; see sandbox-and-csp in openplatform-ext-init |
| "No connection to the host" | the host did not answer the bridge handshake | reload; if it persists, the host side is broken |
| 409 `EXTENSION_INTEGRITY_DRIFT` | the bytes or origin of a reviewed live link changed | restore them or release a new version |
| 402 `PAYMENT_REQUIRED` / 503 `ENTITLEMENT_UNAVAILABLE` | paid extension without an entitlement / billing provider unavailable | host-side billing |
| `SCOPE_DENIED` / `CAPABILITY_DENIED` from invoke | scope not granted, or the host does not declare that method | request the scope, ask the user to re-consent, confirm the host offers the method |
| a neighbour widget receives nothing | topic not declared in one of the manifests, or the host does not allow it; own topics must be `<extensionId>.<name>` | fix declarations; publish/subscribe names must match |
