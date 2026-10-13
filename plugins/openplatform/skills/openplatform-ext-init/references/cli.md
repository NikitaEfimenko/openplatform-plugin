# finamx-ext CLI reference

`finamx-ext` ships with `@finamx/extension-sdk` (SDK 2.2.0 or newer, Node 20+). Use it through the project scripts or
`npx @finamx/extension-sdk <command>` before the package is installed.

```bash
npx @finamx/extension-sdk init my-widget
cd my-widget && npm install
finamx-ext login
finamx-ext hosts
finamx-ext domain pull <hostId>
finamx-ext publish
```

Global options: `--api <url>`, `--token <key>` (legacy, not accepted by `login`), `--json`, `--help`, `--version`.

## Commands

| Command | Flags | Purpose |
|---|---|---|
| `init [dir]` | `--id`, `--name`, `--target <templates\|hostId>`, `--template widget`, `--yes`, `--force` | Scaffold a widget project; refuses to write through symlinks |
| `login` | `--token-stdin`, `--global` | Save the developer key (project `.env`, or `--global` for `~/.config/finamx/credentials.json`, mode 0600). The key is read from a hidden prompt or stdin and never printed. Host keys (`fxh_...`) are refused |
| `hosts` | `--manifest`, `--json` | Hosts visible to the developer key and compatibility of the local manifest per host: `works`, `missing`, `needs_access` |
| `domain pull [<hostId>\|templates]` | `--check`, `--json` | Write `.finamx/domain/<target>/{CONTEXT.md, domain.json, types.d.ts, mocks/}`. `--check` leaves files untouched and exits 1 when the domain changed |
| `catalog [extensionId]` | `--page`, `--limit`, `--json` | Browse published extensions (to see what already exists and which topics they use) |
| `check` | `--dist`, `--manifest`, `--config`, `--entry`, `--json` | Static checks of manifest and `dist/` (CSP, sandbox, topics, limits, identity) |
| `check --host [<hostId>]` | as `check` | Run the built widget headless in a local host bridge with the pulled domain of that host. Without an id it uses the only pulled host; with none (or several) it uses a domain built from the manifest where everything is allowed, which proves nothing about a host and says so |
| `serve` | `--dist`, `--port` (8787), `--manifest`, `--ancestor`, `--strict-csp` | Static server with the platform sandbox CSP. By default `http://localhost` / `http://127.0.0.1` origins of the manifest stay allowed (the platform drops them); `--strict-csp` builds the production CSP |
| `dev` | `--port`, `--json`, `--headless`, `--open`, `--strict-csp`, `--no-watch`, `--no-poll` | Local developer host: bento board, host selector, mocks from domain schemas, bus and consent panels, s2s mock. Needs the optional `@finamx/dev-host`. Loopback only, a per-run secret, mocks only; the developer key never reaches the board. Your `watch` script is started automatically with your user's permissions (`--no-watch` skips it) |
| `publish` | `--manifest`, `--dist`, `--entry`, `--artifact-dir`, `--artifact-entry`, `--dry-run`, `--skip-checks` | Submit the manifest (a new version on 409). Packs `./dist` only when the manifest pins no artifact and has no `embedBundleUrl` |
| `status [extensionId]` | `--manifest`, `--json` | Moderation state; the id defaults to the manifest |
| `context [<hostId>\|templates]` | `--remote`, `--json` | (SDK 2.3.0 and newer) print the host context as Markdown for tools that cannot read files. Reads the pulled copy in `.finamx/domain/`; `--remote` fetches the domain from the portal with the developer key instead and writes nothing. Without a target: the only pulled host (several are an error); with nothing pulled, `--remote` means `templates` and the offline form fails |

Template npm scripts: `build` (`node build.mjs`), `watch`, `dev` (`finamx-ext dev`), `check` (`finamx-ext check`),
`check:host` (`node build.mjs && finamx-ext check --host`), `publish:ext` (`npm run build && finamx-ext publish`),
`status:ext` (`finamx-ext status`).

## JSON outputs agents read

- `hosts --json`: the visible hosts and, per host, the compatibility of the local manifest.
- `domain pull --json`: the targets written, the domain hash, and warnings for skipped entries.
- `catalog --json`: a page of extensions.
- `check --json`: `{ errors, warnings, files, bytes, host? }`. With `--host`, `host` is
  `{ hostId, domain: 'pulled' | 'synthetic', hostCompatibilityChecked, ok, exitCode, missing[], lines[], skipped, error, hint }`.
  `domain: 'synthetic'` or `hostCompatibilityChecked: false` means no real host was checked.
- `status --json`: version states and moderation notes.
- `context --json`: `{ format, target, kind, origin: 'pulled' | 'portal', domainHash, markdown }`.

`init`, `login`, `serve` and `publish` print no JSON. The table above is the whole CLI. The general
templates are pulled with `domain pull templates`, and the CLI has no command to request host access, push, link or
submit.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | success |
| 1 | failure, or a change found by `domain pull --check` |
| 2 | environment problem: no Chrome or `playwright-core` for `check --host`, no `@finamx/dev-host` for `dev` |

## Portal and developer key

The default portal is `https://openplatform.changesandbox.ru`. Another portal (for example a local platform) is set
with `--api <url>` or `FINAMX_API_URL`. The key is resolved in this order: `--token`, `FINAMX_DEV_TOKEN`, the
project `.env`, `~/.config/finamx/credentials.json`.

The portal is resolved from `--api`, `FINAMX_API_URL` in the process environment, `FINAMX_API_URL` in the project
`.env`, then the default. A key from the environment or `--token` is not sent to a portal that only the project
`.env` names: the CLI answers `PORTAL_NOT_CONFIRMED`. Do not edit `.env` to get around it; ask the user to pass
`--api <url>` or export `FINAMX_API_URL`.

Get a developer key in the portal's developer cabinet (register, then generate an API token). Never commit the key.
