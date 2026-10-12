#!/usr/bin/env node
// Repository self-check: skill frontmatter (Agent Skills spec), marketplace/plugin manifests
// for Claude Code, Codex and Cursor, secrets and internal references, and links from SKILL.md to bundled files.
//   node scripts/validate.mjs
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const PLUGIN = join(ROOT, 'plugins/openplatform');
const errors = [];
const err = (where, msg) => errors.push(`${relative(ROOT, where) || '.'}: ${msg}`);
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => {
  if (['node_modules', '.git', 'results', 'dist'].includes(e.name)) return [];
  const p = join(dir, e.name);
  return e.isDirectory() ? walk(p) : [p];
});
const json = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch (e) { err(p, 'invalid JSON: ' + e.message); return {}; } };

// 1. Skills: frontmatter, size, links
const skillsDir = join(PLUGIN, 'skills');
const skills = readdirSync(skillsDir).filter(d => statSync(join(skillsDir, d)).isDirectory());
for (const name of skills) {
  const file = join(skillsDir, name, 'SKILL.md');
  if (!existsSync(file)) { err(file, 'missing SKILL.md'); continue; }
  const text = readFileSync(file, 'utf8');
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!fm) { err(file, 'missing YAML frontmatter'); continue; }
  const fmName = /^name:\s*(\S+)/m.exec(fm[1]);
  if (!fmName || fmName[1] !== name) err(file, `frontmatter name must equal the directory name (${name})`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64) err(file, 'name must be lowercase-hyphenated, ≤ 64 chars');
  const block = /description:\s*>-?\s*\n((?:[ \t]+.*\n?)+)/.exec(fm[1]);
  const desc = block ? block[1].split('\n').map(l => l.trim()).filter(Boolean).join(' ') : ((/description:\s*(.*)/.exec(fm[1]) || [])[1] || '');
  if (!desc) err(file, 'missing description');
  if (desc.length > 1024) err(file, `description is ${desc.length} chars (max 1024)`);
  const lines = text.split('\n').length;
  if (lines > 500) err(file, `SKILL.md has ${lines} lines (keep it under 500, move detail to references/)`);
  for (const m of text.matchAll(/`((?:references|resources|scripts|assets)\/[A-Za-z0-9_./-]+)`/g)) {
    const target = m[1].replace(/\/$/, '');
    if (!existsSync(join(skillsDir, name, target))) err(file, `references a missing file: ${m[1]}`);
  }
}

// 2. Manifests for every agent agree on name and version
const claudeMkt = json(join(ROOT, '.claude-plugin/marketplace.json'));
const codexMkt = json(join(ROOT, '.agents/plugins/marketplace.json'));
const cursorMkt = json(join(ROOT, '.cursor-plugin/marketplace.json'));
const manifests = {
  'plugin.json': json(join(PLUGIN, 'plugin.json')),
  '.claude-plugin/plugin.json': json(join(PLUGIN, '.claude-plugin/plugin.json')),
  '.codex-plugin/plugin.json': json(join(PLUGIN, '.codex-plugin/plugin.json')),
  '.cursor-plugin/plugin.json': json(join(PLUGIN, '.cursor-plugin/plugin.json')),
};
const version = manifests['plugin.json'].version;
for (const [f, m] of Object.entries(manifests)) {
  if (m.name !== 'openplatform') err(join(PLUGIN, f), 'name must be "openplatform"');
  if (m.version !== version) err(join(PLUGIN, f), `version ${m.version} != ${version}`);
}
const entry = (claudeMkt.plugins || []).find(p => p.name === 'openplatform');
if (!entry || entry.source !== './plugins/openplatform') err(join(ROOT, '.claude-plugin/marketplace.json'), 'plugin entry openplatform with source ./plugins/openplatform required');
if (entry && entry.version !== version) err(join(ROOT, '.claude-plugin/marketplace.json'), `version ${entry.version} != ${version}`);
if (!(codexMkt.plugins || []).some(p => p.name === 'openplatform' && p.source && p.source.path === './plugins/openplatform')) err(join(ROOT, '.agents/plugins/marketplace.json'), 'plugin entry openplatform missing');
if (!(cursorMkt.plugins || []).some(p => p.name === 'openplatform' && p.source === 'plugins/openplatform')) err(join(ROOT, '.cursor-plugin/marketplace.json'), 'plugin entry openplatform missing');

// 3. No secrets, no internal references
const SECRET = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/\bAuthorization:\s*Bearer\s+(?!<|\$|\{|`|\.\.\.|…)[A-Za-z0-9._-]{24,}/i, 'hard-coded bearer token'],
  [/\b(FINAMX_DEV_TOKEN|FINAMX_API_TOKEN|FINAMX_HOST_TOKEN)\s*=\s*(?!<|\$|\{|$)[A-Za-z0-9._-]{16,}/m, 'token value in an env assignment'],
  [/\btapi_sk_[A-Za-z0-9]{16,}/, 'Finam Trade API secret'],
  [/"d"\s*:\s*"[A-Za-z0-9_-]{40,}"/, 'private JWK component'],
  [/gldt-[A-Za-z0-9_-]{10,}/, 'GitLab deploy token'],
];
const INTERNAL = [/\.\/scripts\/(startup|regression|harness)/, /\bcd cms\b/, /seed:ontology|migrate:874|declare:host-domain|provision:host/, /\bdocs\/(guides|adr|rfc)\//, /\bin this repo\b|\bthis monorepo\b/i, /hosts\/conduit/, /ngrok/i, /@[a-z0-9-]+\.local\b/i, /\/Users\/|\/home\//, /cms\/src\//, /mcp-catalog\/src\//, /\.planning\//, /\.agents\/security\.md/, /gitlab\.changesandbox/, /dash\.changesandbox/, /coolify/i, /limex-team/, /\bD-\d{2,3}-[A-Z0-9-]+\b/, /\bPhase \d{2}(\.\d)?\b/];
for (const f of walk(ROOT)) {
  if (!/\.(md|mjs|js|ts|tsx|json|ya?ml|css|html|txt)$/.test(f) || f.endsWith('scripts/validate.mjs')) continue;
  const text = readFileSync(f, 'utf8');
  for (const [re, what] of SECRET) if (re.test(text)) err(f, `possible secret: ${what}`);
  for (const re of INTERNAL) if (re.test(text)) err(f, `internal reference: ${re}`);
}

// 4. Plugin parts added in 2.0: no bundled template, no stale script names, hooks, agents, evals, attribution, changelog
const MIGRATION_REF = join(PLUGIN, 'skills/openplatform-ext-init/references/migrate-from-scripts.md');
for (const sk of skills) {
  const tpl = join(skillsDir, sk, 'assets/template');
  if (existsSync(tpl)) err(tpl, 'bundled template must not come back (projects use `npx @finamx/extension-sdk init`)');
}
for (const f of walk(PLUGIN)) {
  if (f === MIGRATION_REF || !/\.(md|mjs|js|ts|tsx|json|ya?ml|txt)$/.test(f)) continue;
  if (readFileSync(f, 'utf8').includes('scripts/finamx')) err(f, 'names scripts/finamx outside the migration reference');
}
const hooksDir = join(PLUGIN, 'hooks');
const hooksFile = join(hooksDir, 'hooks.json');
let hookScripts = [];
const HOOK_IMPORTS = ['node:fs', 'node:path', 'node:url', 'node:os', 'node:crypto', './lib.mjs'];
if (!existsSync(hooksFile)) err(hooksFile, 'missing hooks.json');
else {
  const hj = json(hooksFile);
  if (!hj.hooks || typeof hj.hooks !== 'object') err(hooksFile, 'needs a top-level "hooks" object');
  else for (const ev of ['SessionStart', 'PostToolUse', 'PreToolUse']) {
    if (!Array.isArray(hj.hooks[ev]) || !hj.hooks[ev].length) err(hooksFile, `hooks.${ev} must be a non-empty array`);
  }
  // Every hook uses the shell form shown in the Claude Code docs: one command string with the quoted
  // ${CLAUDE_PLUGIN_ROOT} path and a timeout in seconds. The exec form ("args") is not used.
  for (const [ev, groups] of Object.entries(hj.hooks || {})) {
    for (const g of Array.isArray(groups) ? groups : []) {
      if (typeof g.matcher !== 'string') err(hooksFile, `hooks.${ev}: every group needs a matcher string`);
      for (const h of Array.isArray(g.hooks) ? g.hooks : []) {
        if (h.type !== 'command') err(hooksFile, `hooks.${ev}: type must be "command"`);
        if ('args' in h) err(hooksFile, `hooks.${ev}: exec form ("args") is not used; write "command": "node \\"\${CLAUDE_PLUGIN_ROOT}/hooks/<file>.mjs\\""`);
        const m = /^node "\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/([A-Za-z0-9_.-]+\.mjs)"$/.exec(String(h.command));
        if (!m) err(hooksFile, `hooks.${ev}: command must be node "\${CLAUDE_PLUGIN_ROOT}/hooks/<file>.mjs" (found ${h.command})`);
        else if (!existsSync(join(hooksDir, m[1]))) err(hooksFile, `points to a missing hook script: ${m[1]}`);
        if (!Number.isInteger(h.timeout) || h.timeout < 1 || h.timeout > 60) err(hooksFile, `hooks.${ev}: timeout must be 1..60 (seconds)`);
      }
    }
  }
}
if (existsSync(hooksDir)) {
  hookScripts = readdirSync(hooksDir).filter(f => f.endsWith('.mjs')).map(f => join(hooksDir, f));
  for (const f of hookScripts) {
    const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8', shell: false });
    if (r.status !== 0) err(f, 'does not parse: ' + (r.stderr || '').split('\n')[0]);
    // Hooks are advisory: they read local files and print text. They start no process and open no socket.
    const src = readFileSync(f, 'utf8');
    if (/child_process|\b(spawn|spawnSync|execFile|execFileSync|execSync|fork)\b|\bexec\(/.test(src)) err(f, 'hooks must not start a process (no child_process, spawn or exec)');
    if (/node:(net|http|https|http2|tls|dgram|dns)\b|\bfetch\(|\bimport\(/.test(src)) err(f, 'hooks must not use the network or a dynamic import');
    for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      if (!HOOK_IMPORTS.includes(m[1])) err(f, `hooks may import only ${HOOK_IMPORTS.join(', ')} (found ${m[1]})`);
    }
  }
}
const agentsDir = join(PLUGIN, 'agents');
const agentFiles = existsSync(agentsDir) ? readdirSync(agentsDir).filter(f => f.endsWith('.md')) : [];
if (!agentFiles.length) err(agentsDir, 'no agents found');
for (const f of agentFiles) {
  const file = join(agentsDir, f);
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(readFileSync(file, 'utf8'));
  if (!fm) { err(file, 'missing YAML frontmatter'); continue; }
  const stem = f.replace(/\.md$/, '');
  const n = /^name:\s*(\S+)/m.exec(fm[1]);
  if (!n || n[1] !== stem) err(file, `frontmatter name must equal the file stem (${stem})`);
  if (!/^description:\s*\S/m.test(fm[1]) && !/^description:\s*[>|]-?\s*\n\s+\S/m.test(fm[1])) err(file, 'missing description');
  const tools = /^tools:\s*(.*)$/m.exec(fm[1]);
  if (!tools) err(file, 'missing tools line');
  // The subagents are read-only by construction: this tool list is the boundary, the PreToolUse guard is only a hint.
  else if (tools[1].split(',').map(t => t.trim()).sort().join(',') !== 'Glob,Grep,Read') err(file, `tools must be exactly "Read, Grep, Glob" (found: ${tools[1]})`);
}
const evalsDir = join(PLUGIN, 'evals');
const evalCases = existsSync(evalsDir) ? readdirSync(evalsDir, { withFileTypes: true }).filter(e => e.isDirectory() && e.name !== 'results').map(e => e.name) : [];
for (const c of evalCases) {
  const prompt = join(evalsDir, c, 'prompt.md');
  if (!existsSync(prompt) || !readFileSync(prompt, 'utf8').trim()) err(prompt, 'eval needs a non-empty prompt.md');
  const gdir = join(evalsDir, c, 'graders');
  const graders = existsSync(gdir) ? readdirSync(gdir).filter(f => f.endsWith('.md') && readFileSync(join(gdir, f), 'utf8').trim()) : [];
  if (!graders.length) err(gdir, 'eval needs at least one non-empty graders/*.md');
}
const notice = join(PLUGIN, 'skills/openplatform-ext-plan/NOTICE.md');
if (!existsSync(notice)) err(notice, 'missing attribution NOTICE.md');
else {
  const t = readFileSync(notice, 'utf8');
  if (!t.includes('MIT License') || !t.includes('Matt Pocock')) err(notice, 'must contain the MIT License text and the copyright holder (Matt Pocock)');
}
const changelog = join(ROOT, 'CHANGELOG.md');
if (!existsSync(changelog)) err(changelog, 'missing CHANGELOG.md');
else {
  const h = /^## \[(\d+\.\d+\.\d+)\]/m.exec(readFileSync(changelog, 'utf8'));
  if (!h || h[1] !== version) err(changelog, `first release heading (${h ? h[1] : 'none'}) must equal the manifest version ${version}`);
}

if (errors.length) {
  for (const e of errors) console.log('✗ ' + e);
  console.log(`\n${errors.length} problem(s)`);
  process.exit(1);
}
console.log(`✓ ${skills.length} skills, ${hookScripts.length} hook scripts, ${agentFiles.length} agents, ${evalCases.length} evals, manifests for Claude Code / Codex / Cursor / Agent Plugins agree (v${version}), no secrets or internal references`);
