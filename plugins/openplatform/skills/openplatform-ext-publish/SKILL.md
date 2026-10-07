---
name: openplatform-ext-publish
description: >-
  Submits a FinamX Open Platform extension to the platform portal and sees it through review: publisher account and
  API token, choosing how the code is delivered (artifact upload of dist/ vs embedBundleUrl vs headless), uploading
  with retries, new versions, moderation status, and every error the portal returns (401, 404 NOT_FOUND for an
  extension owned by another account, 409 EXTENSION_EXISTS / VERSION_NOT_NEWER / DOMAINS_NOT_APPROVED /
  EXTENSION_INTEGRITY_DRIFT, BUNDLE_IMPORT_FAILED, INVALID_MANIFEST). Use it whenever someone wants to publish,
  submit, upload, release, update or check the review status of a FinamX / Open Platform extension or widget, runs
  finamx-ext publish, asks whether the platform takes the files from their own server, why a version is not live,
  why moderation fails, or why the host still shows an old version, even if they only say "send it" or
  "отправь расширение". To build or fix the extension itself use openplatform-ext-init.
---

# FinamX Open Platform: submit and release an extension

The portal (default `https://openplatform.changesandbox.ru`) takes a manifest and, for widgets, the built files.
A moderator reviews the submission, publishes it and enables it for hosts. Your job: get it submitted the easiest
way, explain what happens next, and turn any error into a concrete next step.

Talk in the developer's language. Never ask for the token in the chat and never print it.

## 1. Before submitting

The extension must pass its checks. If the project came from the openplatform-ext-init template:

```bash
npm run build && npm run check:host
```

Otherwise copy `scripts/check.mjs` and `scripts/publish.mjs` from this skill into the project as
`scripts/finamx/check.mjs` and `scripts/finamx/publish.mjs`, then `node scripts/finamx/check.mjs --dist <build dir>`.
If the build fails the checks, fix it first (the openplatform-ext-init skill, its sandbox-and-csp reference): a submission
that is empty in the host wastes a review round.

## 2. Account and token

1. Register at `<portal>/developer/register` (email, password, name). One account per publisher; the account that
   submits an `extensionId` first owns it for good.
2. Dashboard (`<portal>/developer/dashboard`) → **Generate API Token**. It is shown once.
3. The developer puts it into `.env` as `FINAMX_DEV_TOKEN=…` (make sure `.env` is in `.gitignore`), or exports it
   in the shell. For a local platform also set `FINAMX_API_URL=http://127.0.0.1:3001`.

Check it without printing it: `node scripts/finamx/publish.mjs status` answers 401 for a bad token and 404 if this
account does not own the extension.

## 3. Choose the delivery mode

Recommend **artifact upload** unless there is a concrete reason not to. Details: `references/delivery-modes.md`.

| Mode | What the platform runs | Your hosting | When |
|---|---|---|---|
| **Artifact upload** (recommended) | exactly the files of `dist/` you uploaded, served from an isolated sandbox origin | not needed | almost always |
| `embedBundleUrl` (import) | a copy the platform downloads from your URL **once, at submit**, then frozen as an artifact | only at submit time | you already host the build and do not want to run the upload tool |
| Live link | your server, live, every launch | always | only FinamX first-party apps (reserved `com.finamx.*` or submitted by an admin); needs domain approval, a daily integrity monitor blocks launch if your bytes change |
| Headless | nothing in the browser: manifest only (topics to your webhook, MCP) | your backend | no UI |

Answers to the usual questions:
- *Will it take the files from my deployment?* With artifact upload: no, never. With `embedBundleUrl`: once, when
  you submit; later changes on your server are not picked up. Only the live-link mode runs from your server.
- *Is it exactly the files I send?* Yes for artifacts: the version is pinned to the sha256 of the upload. At runtime
  the widget can reach only the origins listed in `csp.*`.
- *How do I know which mode a version used?* Artifact versions have `surfaces.ui.artifact { sha256, entry }` and the
  upload step prints the sha256. A moderation error that mentions a `bundle https://…` domain means the version kept
  `embedBundleUrl` as a live link (it was not imported).

## 4. Submit

```bash
node scripts/finamx/publish.mjs --dry-run   # shows mode, artifact sha256 and the version JSON; sends nothing
node scripts/finamx/publish.mjs             # check -> upload -> submit (or new version if it already exists)
node scripts/finamx/publish.mjs status
```

What the script does and why: it runs the checks; packs `dist/` with the SDK's own packer and uploads it
(`POST /api/v1/developer/artifacts`); puts `artifact { sha256, entry }` into the last version; submits the manifest
(`POST /api/v1/developer/extensions`); if the id already exists it submits only the last version
(`POST /api/v1/developer/extensions/<id>/versions`). It retries network failures (some proxies drop connections)
but never retries an HTTP answer, and explains every error code.

The bare CLI also works for a first submission: `npx finamx-ext publish --artifact-dir dist --api <portal>`
(token from `FINAMX_DEV_TOKEN`). Mind that its default `--api` is `http://localhost:3001`, and it cannot submit a
new version of an existing extension: use the script for that.

## 5. After submitting: what happens

1. Status `in_review`. The moderator checks the manifest, the requested scopes and every external domain
   (`csp.connect/resource/frame`, `embedBundleUrl`, `surfaces.mcp.url`), approves the domains, then publishes.
2. Status `published`. The extension is still invisible in hosts until the moderator enables it for a host
   (`desiredHostIds` is only a wish).
3. The user adds it in the host and consents to the scopes.

Tell the developer what to send the moderator: the extensionId, the version, why each scope and each external domain
is needed. More: `references/review-and-hosts.md`.

## 6. New versions

1. Append a new entry to `versions[]` with a higher semver and a changelog. Never edit a version that was reviewed.
2. `npm run build && node scripts/finamx/publish.mjs`.
3. For a published extension the version waits as `pending_version`; the live one keeps running. A newer
   submission replaces a pending one. For an extension still `in_review` the version is appended and the whole
   extension goes back to review.

Consequences to mention: new scopes need user re-consent; new domains need approval; each version runs on its own
origin, so `localStorage` data does not carry over; the host may keep an already open widget on the old version until
it is reloaded.

## 7. Errors

Full table with causes and fixes: `references/errors.md`. The ones people hit most:

| Answer | Meaning | Do |
|---|---|---|
| 401 UNAUTHORIZED | token missing/invalid | new token, check `.env` is loaded |
| 404 NOT_FOUND on a new version | the extension exists but another account owns it | use the owner's token, ask moderators to transfer, or pick another id |
| 409 EXTENSION_EXISTS | id taken | the script switches to a new version automatically if it is yours |
| 409 VERSION_NOT_NEWER | version not higher than stored ones | bump semver |
| 400 INVALID_MANIFEST | schema violation | read `details`, run `check.mjs` |
| 403 NAMESPACE_RESERVED | `com.finamx.*` | own prefix |
| 400 BUNDLE_IMPORT_FAILED | embedBundleUrl could not be downloaded | 200 without redirects, ≤ 5 MiB / 200 files, or switch to artifact upload |
| 409 DOMAINS_NOT_APPROVED (moderator side) | an external domain is not approved yet | moderator approves it in Trust & integrity |
| 409 EXTENSION_INTEGRITY_DRIFT (launch) | the bytes or origin of a reviewed live link changed | restore them or release a new version |

## References

| File | When |
|---|---|
| `references/delivery-modes.md` | the three delivery modes in depth, how to tell which one a version used |
| `references/errors.md` | every portal and launch error with cause and fix |
| `references/review-and-hosts.md` | what the moderator does, statuses, host availability, why a host shows an old version |
| `references/portal-api.md` | developer API endpoints for scripting and CI |
| `scripts/publish.mjs`, `scripts/check.mjs` | copy into the project as `scripts/finamx/` |
