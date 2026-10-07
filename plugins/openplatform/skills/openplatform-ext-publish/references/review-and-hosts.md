# Review, statuses and hosts

## Statuses

| Status | Meaning |
|---|---|
| `in_review` | first submission (or a version of a not-yet-published extension) waits for a moderator |
| `published` | live; a newer version may wait as `pending_version` while this one keeps running |
| `rejected` | see `moderatorComment` (`publish.mjs status` prints it); fix and submit a new version |
| `suspended` | blocked by moderators; contact them |

## What the moderator does

1. Reads the manifest, changelog, requested scopes and permissions; previews the version.
2. Approves every external domain per extension (Trust & integrity): `csp.connect`, `csp.resource`, `csp.frame`,
   `surfaces.mcp.url`, and `bundle` for live links. Approval is per extension: the same domain on another extension
   is reviewed again.
3. Publishes the extension, or approves the pending version.
4. Enables it for each host (host availability). `desiredHostIds` in the manifest is only a request.
5. May set a trust class: `external` for third-party authors (default). `internal` is reserved for FinamX's own apps;
   it does not skip domain approval.

Help the developer write the note for the moderator:

```
Extension: <extensionId> <version>
What it does: <one sentence>
Scopes: ui.toast (notifications), market.read (quotes for the selected instrument)
External domains: https://api.example.com (quotes API, CORS enabled)
Hosts requested: <host ids>
Delivery: artifact upload, sha256 <…>
```

## Ownership

- The account that first submits an `extensionId` owns it. Versions can be submitted only with that account's token.
- A version submitted with another account's token gets 404 `NOT_FOUND`.
- Transfer: a moderator can reassign the owner, or delete the record so the id can be submitted again (deleting
  drops host availability and installs; users have to add the widget again).

## Why the host shows an old version

- The new version is still `pending_version` (not approved yet).
- The page with the widget was open before the approval: reload it.
- For live links: the host caches nothing, but the integrity monitor may block a changed bundle.

## Checking without the admin panel

```bash
node scripts/finamx/publish.mjs status      # status + moderator comment
```

The host catalog shows the latest approved version once the extension is enabled for that host.
