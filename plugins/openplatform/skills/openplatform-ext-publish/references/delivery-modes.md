# Delivery modes

## Artifact upload (recommended)

```
npm run build  ->  dist/  ->  pack (files + sha256)  ->  POST /api/v1/developer/artifacts (201)
                          ->  manifest: versions[-1].surfaces.ui.artifact = { sha256, entry }
                          ->  POST /api/v1/developer/extensions   (or …/<id>/versions)
```

- The platform stores the files by content hash and serves them from an isolated origin per version, with the
  platform CSP. Your servers are not involved at all.
- What runs is byte-for-byte what you uploaded and the moderator reviewed. Changing anything means a new version.
- Limits: ≤ 200 files, ≤ 5 MiB total, paths ≤ 200 chars, no hidden files; types html, js, mjs, css, json, svg,
  png, jpg, jpeg, gif, webp, ico, woff, woff2, txt, map, wasm (wasm cannot execute under the CSP).
- `embedEntryPath` must not be set; `artifact.entry` (default `index.html`) is the entry.
- The upload is tied to the account that uploaded it; another account cannot reference your sha256.

## embedBundleUrl (import at submit)

```json
"ui": { "renderMode": "external-embed", "embedBundleUrl": "https://you.example.com/widget/", "embedEntryPath": "/index.html" }
```

- At submit the platform downloads the entry and follows the references it can see (HTML `src`/`href`, CSS
  `url()`/`@import`, relative JS `import`) under that URL, and turns them into an artifact. Files loaded through a
  computed path (string concatenation, a JSON manifest of chunks) are not discovered and will 404 later: another
  reason to prefer the upload, which takes the whole `dist/`. From then on it is exactly like an upload: your server is not used, later changes there are ignored.
- Your server must answer 200 directly (no redirects) for each file, ≤ 5 MiB and ≤ 200 files; otherwise
  `400 BUNDLE_IMPORT_FAILED`.
- When to use: the build is already deployed and you do not want the upload tool. Otherwise prefer the upload, it
  has fewer failure modes.

## Live link (first party only)

The import is skipped, and the URL stays a live link, when the submission is made by a platform admin or the id is in
the reserved `com.finamx.*` namespace. Then:

- the origin of `embedBundleUrl` is an external domain of kind `bundle` that a moderator must approve
  (`DOMAINS_NOT_APPROVED: bundle https://…` until then);
- a daily integrity monitor compares the served bytes and origin with the reviewed ones and blocks launch with
  `409 EXTENSION_INTEGRITY_DRIFT` after any change, until restored or a new version is released;
- every redeploy of that server is effectively a content change.

Third-party developers never get this mode by submitting with their own token; if a reviewer sees a `bundle` domain
on your extension, the version was submitted by an admin account or under `com.finamx.*`.

## Headless

No `surfaces.ui`: only the manifest is submitted (topics with `delivery: ["s2s"]` to your webhook, and/or
`surfaces.mcp`). External URLs of your webhook and MCP server are reviewed like other domains.

## How to tell what a version uses

| Signal | Mode |
|---|---|
| `surfaces.ui.artifact { sha256, entry }` in the version (moderator: "Full version JSON") | artifact (uploaded or imported) |
| `surfaces.ui.embedBundleUrl` still present after submit | live link |
| Publish output `artifact: N files, sha256 …` / `✓ artifact uploaded` | upload |
| Review error mentions `bundle https://…` | live link |
