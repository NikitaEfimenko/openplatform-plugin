# FinamX Open Platform skills

Skills for coding agents (Claude Code, Codex, Cursor and any agent that reads `SKILL.md`) that take a developer
from an empty folder to an extension running in FinamX hosts: they ask the right questions, recommend the easiest
path, scaffold a tested template, check it under the platform's real CSP and host bridge, submit it, and explain
every review or portal error.

Portal for publishers: https://openplatform.changesandbox.ru

## Install


**Claude Code**

```text
/plugin marketplace add NikitaEfimenko/openplatform-plugin
/plugin install openplatform@finamx-openplatform
```

or from a shell: `claude plugin marketplace add NikitaEfimenko/openplatform-plugin && claude plugin install openplatform@finamx-openplatform`.
Skills then run as `/openplatform:openplatform-ext-init` and the like, or on their own when you describe the task.

**Codex**

```bash
codex plugin marketplace add NikitaEfimenko/openplatform-plugin
```

then install `openplatform` from the plugin directory (`/plugins`). Codex reads `.agents/plugins/marketplace.json`.

**Cursor**

```bash
npx skills add NikitaEfimenko/openplatform-plugin
```

(the same line as on the platform landing; the skills land in `.cursor/skills/`). Alternative: Dashboard → Plugins → Add
Marketplace → Import from Repo → `https://github.com/NikitaEfimenko/openplatform-plugin` (reads
`.cursor-plugin/marketplace.json`), then enable `openplatform`.

**Any other agent** (Gemini CLI, GitHub Copilot, Windsurf, OpenCode…), or a single project:

```bash
npx skills add NikitaEfimenko/openplatform-plugin           # choose agents and skills interactively
npx skills add NikitaEfimenko/openplatform-plugin --skill openplatform-ext-init
```

**Manually:** copy `plugins/openplatform/skills/<skill>/` into your agent's skills folder
(`.claude/skills/`, `.agents/skills/`, `.cursor/skills/`…).

### Enable it for everyone working in a project (Claude Code)

Commit `.claude/settings.json` to the project (an extension repo, a partner template). Claude Code then offers to
install the marketplace and the plugin when someone opens the project:

```json
{
  "extraKnownMarketplaces": {
    "finamx-openplatform": {
      "source": { "source": "github", "repo": "NikitaEfimenko/openplatform-plugin" }
    }
  },
  "enabledPlugins": { "openplatform@finamx-openplatform": true }
}
```

Remove older copies of these skills from the project (`.claude/skills/openplatform-*`, `.agents/skills/openplatform-*`),
otherwise the agent sees two versions with different rules.

### Get updates

| Agent | Command |
|---|---|
| Claude Code | `/plugin marketplace update finamx-openplatform` (or `claude plugin marketplace update finamx-openplatform`) |
| Codex | `codex plugin marketplace upgrade` |
| Cursor | team marketplaces sync from the repository |
| `npx skills` | run the same `npx skills add …` again |

## Skills

| Skill | Use it to |
|---|---|
| `openplatform-ext-plan` | turn an idea into a PRD for one extension or a set of extensions: numbered question rounds, what already exists in the catalog and in the chosen hosts, a map of tickets |
| `openplatform-ext-init` | build or convert an extension: SDK init, manifest, bridge, host domain, sizing, per-user state, s2s key generation, Flow V2 steps and real-host checks |
| `openplatform-ext-publish` | get a publisher token, choose the delivery mode (artifact upload, `embedBundleUrl`, headless), `finamx-ext publish` and `status`, release new versions, fix every portal error |
| `openplatform-host-init` | embed extensions into your own host app: launch, host bridge, capability router, pub/sub broker, host domain, consent and Flow V2 lifecycle |
| `openplatform-host-generative-ui-init` | let a chat or agent in your host show extensions and agent-built UI through the platform MCP, also in external clients (Claude.ai, ChatGPT) as MCP Apps |

## Hooks and agents (Claude Code)

The plugin ships three hooks and two subagents.

The hooks read local files and print text. They start no process, run nothing from the project and make no network
call (`scripts/validate.mjs` fails on `child_process`, a network module or `fetch(` in `hooks/`), and they never read
`.env` or credentials. The agent runs `finamx-ext` itself, under the normal permission prompts.

The subagents are read-only by construction: their tool list is `Read, Grep, Glob`, so they have no shell and no
network and cannot run `finamx-ext`, edit a file or publish. The main session runs the CLI (`finamx-ext check --json`,
`check --host <id> --json`, `domain pull --check --json`, `hosts --json`; the last two call the portal with the
developer key, and the usual permission prompts apply) and hands the output to the reviewer. That tool list is the
boundary. The PreToolUse guard is only a hint on top of it: it stops the two subagents from opening `.env*` and
`credentials.json` by name through Read or Grep, and a broad search or an unusual glob can get past it.

| Hook | What it does |
|---|---|
| SessionStart | in an extension project, adds the pulled host domains (names and scopes only) and the dev events of the last 30 minutes as bounded context. Event text comes from widgets and hosts: each event is one line inside a code span with its age, marked as data. That marking is a convention, not a sandbox: a model can still be misled by text it reads |
| PostToolUse (Write, Edit, MultiEdit) | advisory only: after an edit in an extension project (a `manifest.json` with `versions[].surfaces`) it prints one line telling the agent to run `finamx-ext check --json` (and `check --host <hostId>` when a host domain is pulled). At most one line per two minutes per session and project |
| PreToolUse (Read, Grep) | best-effort hint: the plugin subagents do not open `.env*` or `credentials.json` by name. Not a security control |

| Agent | What it does |
|---|---|
| `openplatform-reviewer` | read-only (Read, Grep, Glob) pre-publish review of the manifest, CSP, UI tokens and scopes against the pulled host domain and the CLI output the main session collected: ready / not ready |
| `openplatform-dev-watcher` | read-only (Read, Grep, Glob): reads `.finamx/dev-events.ndjson` from `finamx-ext dev` and proposes fixes for schema, scope and CSP errors |

## Codex, Cursor and other agents

Hooks and agents are Claude Code features. In other agents the same steps run as text: follow
`references/agent-loop.md` in `openplatform-ext-init` (pull the domain, edit, run `finamx-ext check`, read the dev events).

## Context for tools without a terminal (v0, Databutton)

Run `finamx-ext context <hostId>` and paste the output into the tool, or use the button
"Copy context" in the developer cabinet.

## Try it

In an empty folder, ask your agent:

```text
I want to build a FinamX widget that shows news for the instrument selected in neighbouring widgets.
```

The agent asks a few questions (each with a recommended option), writes a plan and runs:

```bash
npx @finamx/extension-sdk@latest login     # type the developer key into the hidden prompt (never into the chat)
npx @finamx/extension-sdk@latest init      # scaffold the project
finamx-ext domain pull <hostId>     # the host's real topics, methods and scopes
npm run dev                         # local dev host with an event log
finamx-ext check --host <hostId>    # manifest, CSP, topics and scopes against the host domain
finamx-ext publish                  # upload and submit for review (the key from login)
```

## Upgrading from 1.x

- Remove project copies of the old skills: `.claude/skills/openplatform-*` and `.agents/skills/openplatform-*`.
- Projects that copied the old check and publish scripts follow the migration reference in
  `openplatform-ext-init` (`references/migrate-from-scripts.md`).
- For older projects: add `.finamx/dev-events.ndjson` to `.gitignore`.
- New S2S CLI registration workflow requires the companion CLI release and CMS `/s2s-key` deployment; check `finamx-ext s2s --help`. Install SDK packages from the npm `latest` tag; verify required capabilities with the installed CLI.
- Node 20+; npm packages: `@finamx/extension-sdk@latest`, `@finamx/host-bridge@latest`, `@finamx/bridge-protocol@latest` and `@finamx/dev-host@latest`.
- For background programs, start with the [Flow V2 program walkthrough](plugins/openplatform/skills/openplatform-ext-init/references/program-quickstart.md), then use the [Flow V2 BFF guide](plugins/openplatform/skills/openplatform-ext-init/references/flow-runner.md) and the [host lifecycle](plugins/openplatform/skills/openplatform-host-init/resources/flow-runner.md).

## The easy path in one paragraph

A static widget built from the SDK scaffold, no backend, data from neighbour widgets (`fdc3.instrument`) and host
methods, uploaded as an artifact: no hosting of your own, the platform runs exactly the files you uploaded, the
moderator reviews scopes and any external domains, then enables the extension for hosts. Anything that needs your
own secret moves to a small backend that the widget calls with the platform auth context.

## Repository layout

```
.claude-plugin/marketplace.json     Claude Code marketplace (Codex also reads it)
.agents/plugins/marketplace.json    Codex marketplace
.cursor-plugin/marketplace.json     Cursor marketplace
plugins/openplatform/
  plugin.json                       Agent Plugins 1.0 manifest
  .claude-plugin/ .codex-plugin/ .cursor-plugin/   per-agent plugin manifests
  skills/<name>/SKILL.md            the skills (+ references/, resources/)
  hooks/                            Claude Code hooks (hooks.json, *.mjs, test/)
  agents/                           subagents (openplatform-reviewer, openplatform-dev-watcher)
  evals/<case>/                     eval cases for `claude plugin eval`
scripts/validate.mjs                repository self-check
scripts/check-imports.mjs           @finamx imports vs published npm packages
scripts/check-cli.mjs               published CLI help, scaffolding and headless publish dry-run
scripts/check-flow-example.test.mjs  Flow V2 schema, signed completion and owner ACK
```

## Development

```bash
node scripts/validate.mjs                       # frontmatter, manifests, hooks, agents, evals, secrets, links
node --test "plugins/openplatform/hooks/test/*.test.mjs"    # hook unit tests
npm i --no-save @finamx/host-bridge@latest @finamx/extension-sdk@latest @finamx/bridge-protocol@latest jose@6 react@19 react-dom@19
node scripts/check-imports.mjs                  # every @finamx import exists in the published npm packages
node scripts/check-cli.mjs
node --test scripts/check-flow-example.test.mjs scripts/check-s2s-cli.test.mjs
claude plugin validate . && claude plugin validate ./plugins/openplatform   # manual: needs the `claude` CLI
claude plugin eval ./plugins/openplatform --runs 3 --no-publish   # with/without-plugin comparison
```

Maintainer notes: `claude plugin validate` and `claude plugin eval` need the `claude` CLI and are a manual step before a release. `hooks/hooks.json` uses the shell form from the Claude Code docs (`"command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/<file>.mjs\""`, `timeout` in seconds).

### Releasing a new version

1. Edit the skills. Tooling lives in the `finamx-ext` CLI (`@finamx/extension-sdk`), not in copied scripts.
2. Bump `version` in `plugins/openplatform/plugin.json`, its `.claude-plugin/`, `.codex-plugin/`, `.cursor-plugin/`
   manifests and in `.claude-plugin/marketplace.json` (validate.mjs checks they match).
3. Add a `CHANGELOG.md` entry and run the checks above; `claude plugin eval` costs about 1–2 USD per run with `--runs 1`.
4. Owner review of the branch, then push to `main`. CI repeats the checks. Users pick the update
   up with the commands in "Get updates".

Never commit tokens, `.env` files or eval results (`plugins/openplatform/evals/results/` is gitignored).

## Credits

The `openplatform-ext-plan` approach is adapted from mattpocock/skills (MIT); see `plugins/openplatform/skills/openplatform-ext-plan/NOTICE.md`.

## License

MIT

---
