#!/usr/bin/env node
// Repository self-check: skill frontmatter (Agent Skills spec), shared script copies, marketplace/plugin manifests
// for Claude Code, Codex and Cursor, secrets and internal references, and links from SKILL.md to bundled files.
//   node scripts/validate.mjs
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';

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
    if (m[1].startsWith('scripts/finamx/')) continue; // paths inside the developer's project after copying
    const target = m[1].replace(/\/$/, '');
    if (!existsSync(join(skillsDir, name, target))) err(file, `references a missing file: ${m[1]}`);
  }
}

// 2. Shared copies must be identical
const shared = [
  ['openplatform-ext-init/assets/template/scripts/finamx/publish.mjs', 'openplatform-ext-publish/scripts/publish.mjs'],
  ['openplatform-ext-init/assets/template/scripts/finamx/check.mjs', 'openplatform-ext-publish/scripts/check.mjs'],
];
for (const [a, b] of shared) {
  const pa = join(skillsDir, a), pb = join(skillsDir, b);
  if (!existsSync(pa) || !existsSync(pb)) { err(pb, 'shared copy missing'); continue; }
  if (readFileSync(pa, 'utf8') !== readFileSync(pb, 'utf8')) err(pb, `differs from ${a}; run node scripts/sync-shared.mjs`);
}

// 3. Manifests for every agent agree on name and version
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

// 4. No secrets, no internal references
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

if (errors.length) {
  for (const e of errors) console.log('✗ ' + e);
  console.log(`\n${errors.length} problem(s)`);
  process.exit(1);
}
console.log(`✓ ${skills.length} skills, manifests for Claude Code / Codex / Cursor / Agent Plugins agree (v${version}), no secrets or internal references`);
