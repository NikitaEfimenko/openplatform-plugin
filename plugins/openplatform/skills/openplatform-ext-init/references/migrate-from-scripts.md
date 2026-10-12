# Migrate a project that carries its own `scripts/finamx/` to finamx-ext

Earlier versions of this skill copied a template into the project, including its own copies of the platform checks
in `scripts/finamx/` (`check.mjs`, `dev-server.mjs`, `host-check.mjs`, `publish.mjs`). Those copies do not follow
platform changes (CSP, sandbox, manifest rules). The maintained tool is the `finamx-ext` CLI.

## Detect

The project has a `scripts/finamx/` directory and `package.json` scripts such as `node scripts/finamx/check.mjs`.

## Mapping

| Old script | New command |
|---|---|
| `scripts/finamx/check.mjs` | `finamx-ext check` |
| `scripts/finamx/dev-server.mjs` | `finamx-ext dev` (local board) or `finamx-ext serve` (static CSP server) |
| `scripts/finamx/host-check.mjs` | `finamx-ext check --host <hostId>` |
| `scripts/finamx/publish.mjs` (and its `status`) | `finamx-ext publish` / `finamx-ext status` |

`src/boot.js`, `src/host-tokens.js`, `src/config.js`, `base.css`, `build.mjs` and `manifest.json` are the author's code
and stay.

## Steps

1. Check that `git status` is clean, so the migration is one reviewable change.
2. Install the tools: `npm install -D @finamx/extension-sdk@^2.2.0 @finamx/dev-host`. Keep `@finamx/bridge-protocol`
   (runtime types). Remove `@finamx/host-bridge` and `playwright-core` from `devDependencies` only if nothing else
   imports them; `check --host` needs `playwright-core` and Chrome (`CHROME_PATH`).
3. Replace the `package.json` scripts:

   ```json
   "scripts": {
     "build": "node build.mjs",
     "watch": "node build.mjs --watch",
     "dev": "finamx-ext dev",
     "check": "finamx-ext check",
     "check:host": "node build.mjs && finamx-ext check --host",
     "publish:ext": "npm run build && finamx-ext publish",
     "status:ext": "finamx-ext status"
   }
   ```

   Keep your own `build.mjs` invocation and `watch` flags if they differ; if `build.mjs` used to call
   `scripts/finamx/check.mjs`, remove that call (checks run through `finamx-ext check`).
4. Delete `scripts/finamx/` (and `scripts/` if it is then empty).
5. Add `.finamx/dev-events.ndjson` to `.gitignore` (the agent loop writes dev events there).
6. Pull the domain of the host the extension targets: `finamx-ext login` (if needed), `finamx-ext hosts --json`,
   `finamx-ext domain pull <hostId>`. Commit `.finamx/`.
7. Verify: `npm run build`, `finamx-ext check`, `finamx-ext check --host <hostId>`. Fix what they report; the new checks
   are against the real host domain and may find scopes or topics the host does not offer.
8. Optional: copy `AGENTS.md` rules from a fresh `npx @finamx/extension-sdk init` scratch project so coding agents in
   this repository know the new commands.

Publishing is unchanged in effect: `finamx-ext publish` submits the manifest and uploads `dist/`, and answers 409 by
creating a new version when the extension exists.
