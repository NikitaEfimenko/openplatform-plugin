---
name: openplatform-ext-publish
description: >-
  Submits a FinamX Open Platform extension to the platform portal with finamx-ext publish and sees it through review:
  pre-publish checks and review, developer key (finamx-ext login), choosing how the code is delivered (artifact upload of dist/ vs embedBundleUrl vs
  headless), new versions, moderation status (finamx-ext status), and every error the portal returns (401, 404
  NOT_FOUND, 409 EXTENSION_EXISTS / VERSION_NOT_NEWER / DOMAINS_NOT_APPROVED, BUNDLE_IMPORT_FAILED, INVALID_MANIFEST). Use it whenever someone wants to publish, submit,
  upload, release, update or check the review status of a FinamX / Open Platform extension or widget, asks whether the
  platform takes the files from their own server, why a version is not live, why moderation fails, or why the host
  still shows an old version, even if they only say "send it" or "отправь расширение". To build or fix the extension
  itself use openplatform-ext-init.
---

# FinamX Open Platform: submit and release an extension

The portal (default `https://openplatform.changesandbox.ru`) takes a manifest and, for widgets, the built files.
A moderator reviews the submission, publishes it and enables it for hosts. Your job: get it submitted the easiest
way, explain what happens next, and turn any error into a concrete next step.

Talk in the developer's language. Never ask for the key in the chat and never print it.

## 1. Before submitting

Run, in this order, and fix what fails (a submission that is empty in the host wastes a review round):

```bash
npm run build
npx finamx-ext check                       # manifest + built files
npx finamx-ext check --host <hostId>       # the built widget against the pulled domain of each target host
npx finamx-ext domain pull --check         # the pulled host domain is still current (exit 1 = pull again)
```

Then the pre-publish review, using the full checklist (the review-checklist reference of the openplatform-ext-init
skill). In Claude Code the openplatform-reviewer subagent can do it, but it is read-only (tools Read, Grep, Glob; no
shell, no network), so you run the CLI yourself first and hand it the output:

```bash
mkdir -p .finamx/review                    # add .finamx/review/ to .gitignore
npx finamx-ext check --json > .finamx/review/check.json
npx finamx-ext check --host <hostId> --json > .finamx/review/check-host-<hostId>.json
npx finamx-ext domain pull --check --json > .finamx/review/domain-check.json
npx finamx-ext hosts --json > .finamx/review/hosts.json
```

`domain pull --check` and `hosts` call the portal with the developer key; the usual permission prompts apply. Then
start the reviewer with the project root and the host ids. Elsewhere do the review yourself. The short version:

1. Manifest: valid, `platformSupport` and description present, version higher than any stored one, changelog written.
2. Every `csp.*` origin is justified by a call the code really makes; nothing broader than needed.
3. UI follows the host UI tokens (colours, fonts, theme switch).
4. Scopes equal what the pulled domain of the host lists and what the code actually calls: no more, no less.
5. Topics: own topics are named `<extensionId>.<name>` and have a schema; host topics have none.
6. No secrets in the manifest, the build or the repository.
7. State: `surfaces.ui.state` has a schema plus `schemaVersion`, stale records are migrated, `NOT_SUPPORTED` is handled,
   `fromCache` is not used as storage; BFF keys come only from `authContextStateKey`, `onConsentRevoked` is idempotent.
8. Trust: `acceptFrom` is decided for every own input, `onPublishRejected` is handled, the BFF pins `expectedPublisher`
   or `expectedAud`.
9. If backend pull or Flow V2 completion is used, prepare the deployed HTTPS webhook, concrete request/output
   schemas and an environment-specific key pair; keep the private JWK in the BFF secret store. Follow
   [key setup](../openplatform-ext-init/references/user-bound-s2s.md). On first submission the extension record
   may not exist yet: register the public JWK after submission (Step 5), then verify a manual Flow run after
   publication and host access. Do not require those later checkpoints before creating the record.

Show the user the result and wait for their explicit confirmation. Never run `finamx-ext publish` without it.

## 2. Account and key

1. Register at `<portal>/ru/developer/register` (`/en/...` for English). Extensions belong to a Publisher;
   several developers can work in one Publisher, and a developer can belong to several. Select the intended
   Publisher with `finamx-ext publishers use <id>` after login; a `viewer` cannot submit or register keys.
2. Cabinet (`<portal>/ru/developer/dashboard#key`) -> generate a developer key. It is shown once.
3. The developer runs `npx @finamx/extension-sdk@latest login` in their own terminal and types the key into the hidden prompt
   (another instance: `npx @finamx/extension-sdk@latest --api <url> login`, remembered afterwards). `--token-stdin` and
   `FINAMX_DEV_TOKEN` are only the CI fallback. Never ask for the key in the chat, never paste or print it. Host keys
   are refused by the CLI and must never be used here.

Key order: `--token`, `FINAMX_DEV_TOKEN`, `.env`, the stored credentials. Portal order: `--api`, `FINAMX_API_URL`, project `.env`, the stored default portal, the built-in default. Check it without printing it:
`npx finamx-ext status` answers 401 for a bad key and 404 if the extension is missing or inaccessible in the selected Publisher.

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
  publish output prints the sha256. A moderation error that mentions a `bundle https://…` domain means the version kept
  `embedBundleUrl` as a live link (it was not imported).

## 4. Submit

```bash
npx finamx-ext publish --dry-run   # shows the portal, mode, artifact sha256 and the version JSON; sends nothing
npx finamx-ext publish             # checks -> upload -> submit (or a new version if the id already exists)
npx finamx-ext status              # moderation status and moderator comment (--json for scripts)
```

What `finamx-ext publish` does: prints `portal <origin> (from --api|FINAMX_API_URL|.env|default)`; runs the pre-publish
checks and stops on an error; when the last version has `surfaces.ui` with neither `embedBundleUrl` nor a pinned
`surfaces.ui.artifact`, packs `./dist` (or `--dist`) and uploads it; a pinned artifact is sent as written unless
`--artifact-dir` is given; submits the manifest, and on 409 `EXTENSION_EXISTS` submits the last version as a new
version. It retries nothing blindly: if an answer is lost it asks the portal and tells you how to finish.

Safety stops, never work around them:
- `INSECURE_API_URL`: the portal URL must be https (http only for localhost). Fix the URL.
- `PORTAL_NOT_CONFIRMED`: a key from the environment is not sent to a portal that is named only by `.env`. Ask the
  user to pass `--api <url>` explicitly. Never edit `.env` to get around it.

## 5. After submitting: register the key and verify readiness

For backend pull or Flow V2, the successful submission creates the record needed for registration. From the same
extension project and selected Publisher run:

```bash
finamx-ext s2s register --public-jwk .secrets/finamx-s2s/s2s-public.jwk.json --json
```

Use the single public JWK, not the private file or public JWKS. Explain: “The private key stays on your server;
this command sends the platform only the public key that recognises your server's signature.” The response must
report `registered: true` and the expected `kid`. An exact retry is safe. `reviewRequired` reports manual review;
it is not proof of publication or a deferred activation queue. Rotation of an existing published key needs a
moderator; do not generate a new pair to work around a 409. Details: [key setup](../openplatform-ext-init/references/user-bound-s2s.md).

1. Status `in_review`. The moderator checks the manifest, the requested scopes and every external domain
   (`csp.connect/resource/frame`, `embedBundleUrl`, `surfaces.mcp.url`), approves the domains, then publishes.
2. Status `published`. The extension is still invisible in hosts until the moderator enables it for a host
   (`desiredHostIds` is only a wish).
3. The user adds it in the host and consents to the scopes.
4. For Flow V2, verify the deployed key and one manual run through durable job, saved result and owner ACK;
   prove duplicate/restart/cancellation handling and closed-board execution before enabling a schedule. Follow
   the [program quickstart](../openplatform-ext-init/references/program-quickstart.md). Submission and key
   registration alone do not establish a working program.

Tell the developer what to send the moderator: the extensionId, the version, why each scope and each external domain
is needed. More: `references/review-and-hosts.md`.

## 6. New versions

1. Append a new entry to `versions[]` with a higher semver and a changelog. Never edit a version that was reviewed.
2. `npm run build && npx finamx-ext publish` (it submits a new version automatically on 409).
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
| 401 UNAUTHORIZED | key missing/invalid | new key, `npx @finamx/extension-sdk@latest login`, check the portal (`--api`) |
| 404 NOT_FOUND on a new version | wrong portal, missing extension, or no write access in the selected Publisher | check the portal and ID, select the owning Publisher, and ask its owner/admin for a write role |
| 409 EXTENSION_EXISTS | id taken | `finamx-ext publish` switches to a new version automatically if it is yours |
| 409 VERSION_NOT_NEWER | version not higher than stored ones | bump semver |
| 400 INVALID_MANIFEST | schema violation | read `details`, run `finamx-ext check` |
| 403 NAMESPACE_RESERVED | `com.finamx.*` | own prefix |
| 400 BUNDLE_IMPORT_FAILED | embedBundleUrl could not be downloaded | 200 without redirects, ≤ 5 MiB / 200 files, or switch to artifact upload |
| 409 DOMAINS_NOT_APPROVED (moderator side) | an external domain is not approved yet | moderator approves it in Trust & integrity |
| 400 VERSION_INVALID (moderator side, on Approve) | the pending version fails manifest validation; the answer lists the fields | the moderator rejects with a comment naming the fields; you fix the manifest and submit a new version. Next steps: `references/errors.md`, "Moderation: approve failed" |
| 409 EXTENSION_INTEGRITY_DRIFT (launch) | the bytes or origin of a reviewed live link changed | restore them or release a new version |

## References

| File | When |
|---|---|
| `references/delivery-modes.md` | the three delivery modes in depth, how to tell which one a version used |
| `references/errors.md` | every portal and launch error with cause and fix |
| `references/review-and-hosts.md` | what the moderator does, statuses, host availability, why a host shows an old version |
| `references/portal-api.md` | developer API endpoints for scripting and CI |
