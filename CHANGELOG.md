# Changelog

All notable changes to the `openplatform` plugin. Format: Keep a Changelog.

## [2.3.0] — 2026-10-24

### Added

- Key-first onboarding: ext-init, ext-plan, host-init and host-generative-ui-init ask first whether the developer is
  registered and has a key (registration and cabinet links, `<portal>/ru/developer/register`, `.../dashboard#key`); the key
  is typed into `npx @finamx/extension-sdk login` in the developer's own terminal and never pasted into the chat
  (revoke and reissue if it was).
- ext-init checks `git remote -v` at the start and offers the preset "GitHub + Vercel" when a separate deploy or a BFF
  is needed (`data-and-backend.md`: stable production origin in `csp.connect`, moderator approval of every origin).
- Sizing: an interview question (compact / medium / wide / fits container), two `surfaces.ui.layout` manifest examples with
  the schema limits, and a runtime example with `bridge.ui.layout()?.preferredSize` (SDK `[Unreleased]`).
- ext-publish `errors.md`: "Moderation: approve failed" (`VERSION_INVALID` with fields, `DOMAINS_NOT_APPROVED`,
  `INVALID_TRANSITION`, `NOTHING_TO_APPROVE`, `NO_PENDING_VERSION`, `EXTENSION_INTEGRITY_DRIFT`) with the next command.

### Changed

- `login` is the primary authentication path everywhere; `--token-stdin` and `FINAMX_DEV_TOKEN` are the CI fallback.
  `cli.md` documents the stored default portal (`login --api <url>` remembers the instance; order `--api`,
  `FINAMX_API_URL`, project `.env`, stored default, built-in default).
- Cursor install line in the README is `npx skills add NikitaEfimenko/openplatform-plugin`, as on the landing.

## [2.2.0] — 2026-10-24

### Added

- ext-init references `state.md` and `trust.md`: decision guidance (where data lives: `bridge.state`, BFF keyed by
  `authContextStateKey`, last-value cache; filter-panel pattern; agent control through an input topic; `acceptFrom`,
  `meta.relation`, `onPublishRejected`, Publisher pin on the BFF) and how to test it. They condense the platform
  guides `extension-state` and `extension-trust` (application-layer guides of the platform repository, in Russian)
  and the RFCs RFC-EXTENSION-STATE / RFC-EXTENSION-TRUST.
- Three questions (settings and state, control, trust) in the ext-init interview and the ext-plan first round; the PRD
  template gets "State and control" and "Shared topics and trust" sections ("none" when they do not apply).
- Review checklist rows 18-25 and publish-skill review items 7-8 for state, BFF keys, `acceptFrom`, rejections and the
  verifier pin.
- Four evals: `state-filters`, `state-bff-key`, `trust-accept-from`, `agent-command-topic` (14 in total).

### Changed

- `runtime.md` keeps the API tables and points to `state.md` / `trust.md` for decisions.

## [2.1.0] — 2026-10-19

### Changed

- Identity: host identity is only the host-signed ES256 `platform.identity.v1` (`signHostIdentity` /
  `verifyHostIdentity` / `resolveHostIdentity`); the shared-secret HMAC grant is gone from every skill. ext-init asks
  "what must the backend trust?" and routes with one matrix (no flag / invoke or s2s / auth-context / identity / own
  OIDC); host-init documents key setup and the 300 s rotation overlap. New eval `identity-matrix`.
- `platform.auth_context.v1` is no longer described as always sub-less: it carries `host`, `instanceId`, the Publisher
  tag `pub`, and `sub` = pairwise `uh_` only on opt-in (`hostBridge.requiresUserKey` or `surfaces.ui.state`, SDK
  3.5.0+). `expectedAud` or `expectedPublisher` is mandatory in the verifier (SDK 3.6.0).

### Added

- Runtime reference: instance state (`bridge.state`), `meta.relation`, `acceptFrom`, `onPublishRejected`
  (`SENDER_NOT_ACCEPTED`), last-value cache vs state.

## [2.0.0] — 2026-10-12 (not published)

### Breaking

- The bundled extension template and the publish skill's check/publish scripts are removed. New projects start with
  `npx @finamx/extension-sdk init`; everything else goes through the `finamx-ext` CLI. Anyone who copied the old
  scripts into a project should follow `references/migrate-from-scripts.md` in `openplatform-ext-init`.
- Requires `@finamx/extension-sdk` 2.2.0 or newer (2.3.0 for `finamx-ext context`) and Node 20+.

### Added

- Skill `openplatform-ext-plan`: turns an idea into a PRD for one extension or a set of extensions. The approach is
  adapted from mattpocock/skills (MIT, see the skill's `NOTICE.md`).
- Claude Code hooks: SessionStart adds pulled host domains and recent dev events as context; PostToolUse is
  advisory (one line reminding the agent to run `finamx-ext check --json` after edits; no hook starts a process); PreToolUse is a best-effort hint that keeps the plugin subagents from opening `.env*` and `credentials.json`.
- Agents `openplatform-reviewer` and `openplatform-dev-watcher`, read-only by their tool list (Read, Grep, Glob):
  the main session runs `finamx-ext` and hands them the output.
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
