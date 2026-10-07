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

Dashboard → Plugins → Add Marketplace → Import from Repo → `https://github.com/NikitaEfimenko/openplatform-plugin`
(reads `.cursor-plugin/marketplace.json`), then enable `openplatform`.

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
| `openplatform-ext-init` | build a new extension or convert an existing web app: interview with recommended answers, template (vanilla JS + esbuild), manifest, bridge, host theme and UI tokens, topics, host methods, data/secrets/backend, checks inside a real host |
| `openplatform-ext-publish` | get a publisher token, choose the delivery mode (artifact upload, `embedBundleUrl`, headless), submit, release new versions, read review status, fix every portal error |
| `openplatform-host-init` | embed extensions into your own host app: launch, host bridge, capability router, pub/sub broker, host domain, consent |
| `openplatform-host-generative-ui-init` | let a chat or agent in your host show extensions and agent-built UI through the platform MCP, also in external clients (Claude.ai, ChatGPT) as MCP Apps |

## Try it

In an empty folder, ask your agent:

```text
I want to build a FinamX widget that shows news for the instrument selected in neighbouring widgets.
```

The agent asks a few questions (each with a recommended option), shows a plan, scaffolds the template, and runs:

```bash
npm run build          # bundle + platform checks (CSP, sandbox, manifest, topics, artifact limits)
npm run check:host     # the widget inside a real @finamx/host-bridge host: handshake, CSP, host tokens
npm run publish:ext    # upload dist/ as an artifact and submit for review (token in .env)
npm run status:ext
```

## The easy path in one paragraph

A static widget built with the template, no backend, data from neighbour widgets (`fdc3.instrument`) and host
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
  skills/<name>/SKILL.md            the skills (+ references/, scripts/, assets/)
  evals/<case>/                     eval cases for `claude plugin eval`
scripts/validate.mjs                repository self-check
scripts/check-imports.mjs           @finamx imports vs published npm packages
scripts/sync-shared.mjs             keeps shared tool copies identical
```

## Development

```bash
node scripts/validate.mjs                       # frontmatter, manifests, shared copies, secrets, links, no outside references
npm i --no-save @finamx/host-bridge @finamx/extension-sdk @finamx/bridge-protocol react react-dom
node scripts/check-imports.mjs                  # every @finamx import exists in the published npm packages
claude plugin validate . && claude plugin validate ./plugins/openplatform
claude plugin eval ./plugins/openplatform --runs 3 --no-publish   # with/without-plugin comparison
```

Last eval run (6 cases, 1 run each): with the plugin 6/6 passed, without it 3/6 (mean delta +0.5).

### Releasing a new version

1. Edit the skills. Edit tooling only in `skills/openplatform-ext-init/assets/template/scripts/finamx/`, then run
   `node scripts/sync-shared.mjs` (the publish skill keeps identical copies).
2. Bump `version` in `plugins/openplatform/plugin.json`, its `.claude-plugin/`, `.codex-plugin/`, `.cursor-plugin/`
   manifests and in `.claude-plugin/marketplace.json` (validate.mjs checks they match).
3. Run the checks above; `claude plugin eval` costs about 1–2 USD per run with `--runs 1`.
4. Push to `main`. CI repeats the checks and runs the extension template inside a real host. Users pick the update
   up with the commands in "Get updates".

Never commit tokens, `.env` files or eval results (`plugins/openplatform/evals/results/` is gitignored).

## License

MIT

---

## По-русски

Набор скиллов для агентов (Claude Code, Codex, Cursor и любых, кто читает `SKILL.md`). Он проводит разработчика
от пустой папки до расширения в хостах FinamX: задаёт вопросы с рекомендуемыми ответами, выбирает самый простой
путь (статический виджет из шаблона, загрузка сборки артефактом, без своего хостинга и бэкенда), проверяет
виджет под настоящими CSP и мостом хоста, отправляет его на портал и объясняет любые ошибки модерации и портала.

Установка: команды выше. Начать можно с фразы агенту:
«Хочу сделать виджет для открытой платформы FinamX, который …».
