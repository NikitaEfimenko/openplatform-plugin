# Changelog

All notable changes to the `openplatform` plugin. Format: Keep a Changelog.

## [2.0.0] — 2026-10-12 (not published)

### Breaking

- The bundled extension template and the publish skill's check/publish scripts are removed. New projects start with
  `npx @finamx/extension-sdk init`; everything else goes through the `finamx-ext` CLI. Anyone who copied the old
  scripts into a project should follow `references/migrate-from-scripts.md` in `openplatform-ext-init`.
- Requires `@finamx/extension-sdk` 2.2.0 or newer (2.3.0 for `finamx-ext context`) and Node 20+.

### Added

- Skill `openplatform-ext-plan`: turns an idea into a PRD for one extension or a set of extensions. The approach is
  adapted from mattpocock/skills (MIT, see the skill's `NOTICE.md`).
- Claude Code hooks: SessionStart adds pulled host domains and recent dev events as context; PostToolUse runs
  `finamx-ext check --json` after edits; PreToolUse guards the plugin subagents.
- Agents `openplatform-reviewer` and `openplatform-dev-watcher`.
- Evals `ext-plan-set`, `domain-pull-host-methods`, `dev-events-fix`.
- References `cli`, `host-domain`, `migrate-from-scripts`, `agent-loop`, `review-checklist`, `dev-events`.

### Changed

- `openplatform-ext-init` and `openplatform-ext-publish` use only `finamx-ext`.
- Host topics and methods come from pulled host domains, not from fixed lists.
- Host skills mention developer access to the host domain.
- Six existing evals are graded on the CLI path.
- Node 20+, like the SDK.

### Upgrade

1. Update the plugin with your agent's marketplace command.
2. Remove project copies of the old skills (`.claude/skills/openplatform-*`, `.agents/skills/openplatform-*`).
3. Projects with `scripts/finamx/`: follow the migration reference.
4. Add `.finamx/dev-events.ndjson` to `.gitignore` in projects created before SDK 2.3.0.

## [1.0.0]

- First release: ext-init, ext-publish, host-init and host-generative-ui-init skills.
