#!/usr/bin/env node
// Pre-flight checks for a FinamX Open Platform extension: the artifact (dist/) against the platform sandbox CSP
// and the manifest against the registry rules. Catches the mistakes that otherwise surface only as an empty widget
// inside the host or as a rejected submission.
//
//   node scripts/finamx/check.mjs [--dist dist] [--manifest manifest.json] [--config src/config.js] [--json]
//
// Exit code 1 on any error; warnings are printed but do not fail.
//
// Platform CSP the artifact is served with (from @finamx/bridge-protocol buildSandboxCsp):
//   default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' <csp.resource>;
//   [font-src/media-src 'self' <csp.resource> only when csp.resource is non-empty];
//   connect-src <csp.connect> (no 'self'!); frame-src <csp.frame>; base-uri <csp.baseUri>; form-action 'none'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep, resolve } from 'node:path';

export const ARTIFACT_LIMITS = { maxFiles: 200, maxBytes: 5 * 1024 * 1024, maxPath: 200 };
export const ARTIFACT_TYPES = new Set(['html', 'js', 'mjs', 'css', 'json', 'svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'woff', 'woff2', 'txt', 'map', 'wasm']);
const EXTENSION_ID_RE = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;
const SCOPE_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;
const ORIGIN_RE = /^https:\/\/[a-z0-9.-]+(:\d+)?$/i;
const DEV_ORIGIN_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

const walk = dir => readdirSync(dir, { withFileTypes: true })
  .flatMap(e => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));

function semverCmp(a, b) {
  const pa = String(a).split(/[.-]/), pb = String(b).split(/[.-]/);
  for (let i = 0; i < 3; i++) { const d = Number(pa[i]) - Number(pb[i]); if (d) return d; }
  return 0;
}

/** Checks dist/ against the artifact limits and the sandbox CSP. Returns { errors, warnings, files, bytes }. */
export function checkArtifact(dir, { entry = 'index.html', csp = {} } = {}) {
  const errors = [], warnings = [];
  if (!existsSync(dir)) return { errors: [`${dir} does not exist: build first`], warnings, files: 0, bytes: 0 };
  const files = walk(dir);
  if (files.length > ARTIFACT_LIMITS.maxFiles) errors.push(`${files.length} files, the artifact limit is ${ARTIFACT_LIMITS.maxFiles}`);
  let bytes = 0;
  const rels = [];
  for (const f of files) {
    const rel = relative(dir, f).split(sep).join('/');
    rels.push(rel);
    const ext = rel.slice(rel.lastIndexOf('.') + 1).toLowerCase();
    if (rel.split('/').some(p => p.startsWith('.'))) errors.push(`hidden file in the artifact (rejected): ${rel}`);
    else if (!ARTIFACT_TYPES.has(ext)) errors.push(`file type not allowed in an artifact: ${rel}`);
    if (rel.length > ARTIFACT_LIMITS.maxPath) errors.push(`path longer than ${ARTIFACT_LIMITS.maxPath} chars: ${rel}`);
    if (ext === 'wasm') warnings.push(`${rel}: WebAssembly cannot be compiled under script-src 'self' (no 'wasm-unsafe-eval')`);
    bytes += statSync(f).size;
  }
  if (bytes > ARTIFACT_LIMITS.maxBytes) errors.push(`artifact is ${bytes} bytes, the limit is ${ARTIFACT_LIMITS.maxBytes}`);
  if (!rels.includes(entry)) errors.push(`entry ${entry} is missing in ${dir}`);

  const resource = (csp && csp.resource) || [];
  for (const rel of rels) {
    const abs = join(dir, rel);
    if (rel.endsWith('.html')) {
      const html = readFileSync(abs, 'utf8');
      if (/<script(?![^>]*\ssrc=)[^>]*>\s*\S/i.test(html)) errors.push(`${rel}: inline <script> is blocked (script-src 'self'); move it into a .js file`);
      if (/<script[^>]*\ssrc=["']?(https?:)?\/\//i.test(html)) errors.push(`${rel}: <script src> from another origin is blocked (script-src 'self'); bundle it`);
      if (/<style[\s>]/i.test(html)) errors.push(`${rel}: <style> is blocked (style-src 'self'); move it into a .css file`);
      if (/\sstyle\s*=/i.test(html)) errors.push(`${rel}: style="" attributes are blocked (style-src 'self'); use classes or el.style.* from JS`);
      if (/\son[a-z]+\s*=/i.test(html)) errors.push(`${rel}: inline event handlers (onclick=...) are blocked; use addEventListener`);
      if (/data:/i.test(html)) errors.push(`${rel}: data: URLs are blocked (also <link rel=icon href="data:,">); remove them`);
      if (/<link[^>]*\shref=["']?(https?:)?\/\//i.test(html)) errors.push(`${rel}: <link> to another origin (fonts, CSS) is blocked; ship the file in the artifact`);
      if (/\s(src|href)=["']\/(?!\/)/i.test(html)) warnings.push(`${rel}: root-relative src/href ("/..."); prefer relative paths ("app.js") so the bundle works under any base path`);
      if (/<html[^>]*\sdata-theme=/i.test(html)) warnings.push(`${rel}: hard-coded data-theme on <html>; let the host theme/tokens decide`);
    } else if (/\.(m?js)$/.test(rel)) {
      const js = readFileSync(abs, 'utf8');
      for (const [re, what] of [[/\bnew\s+Function\s*\(/, 'new Function'], [/(^|[^.\w$])eval\s*\(/, 'eval('], [/\bWebAssembly\.(instantiate|compile)/, 'WebAssembly']]) {
        if (re.test(js)) errors.push(`${rel}: uses ${what}; script-src 'self' without 'unsafe-eval' stops the whole script`);
      }
      if (/["'`(]data:[a-z]+\/[a-z0-9.+-]+[;,]/i.test(js)) warnings.push(`${rel}: contains a data: URL; images/fonts from data: load only if csp.resource lists data:`);
      if (/\bfetch\(\s*["'`](\.{0,2}\/)(?!\/)/.test(js)) warnings.push(`${rel}: fetch() of a relative URL; connect-src has no 'self', so files of your own artifact cannot be fetched (import JSON at build time instead)`);
      if (/new\s+WebSocket\s*\(/.test(js)) warnings.push(`${rel}: WebSocket needs its wss:// origin in csp.connect, and csp only accepts https:// origins; prefer SSE or streaming fetch`);
      if (/\b(alert|confirm|prompt)\s*\(/.test(js)) warnings.push(`${rel}: alert/confirm/prompt do nothing in the sandbox (no allow-modals); render the dialog in the page`);
    } else if (rel.endsWith('.css')) {
      const css = readFileSync(abs, 'utf8');
      if (/@import\s+(url\()?\s*["']?(https?:)?\/\//i.test(css)) errors.push(`${rel}: @import from another origin is blocked (style-src 'self')`);
      if (/url\(\s*["']?(https?:)?\/\//i.test(css) && !resource.length) errors.push(`${rel}: url() to another origin needs that origin in csp.resource`);
      if (/url\(\s*["']?data:/i.test(css) && !resource.includes('data:')) errors.push(`${rel}: url(data:...) needs "data:" in csp.resource`);
      if (/@font-face/i.test(css) && !resource.length) warnings.push(`${rel}: @font-face from the artifact: font-src exists only when csp.resource is non-empty, otherwise fonts fall back to default-src 'none'. Use system fonts or declare a csp.resource entry`);
    }
  }
  return { errors, warnings, files: files.length, bytes };
}

/** Checks the manifest (the last version is what gets submitted). Returns { errors, warnings }. */
export function checkManifest(m, { config } = {}) {
  const errors = [], warnings = [];
  if (!m || typeof m !== 'object') return { errors: ['manifest.json is not an object'], warnings };
  for (const k of ['kind', 'widget', 'pubsub', 'hosts', 'mcpApp']) if (k in m) errors.push(`root field "${k}" is not accepted by the registry; use versions[].surfaces`);
  if (!EXTENSION_ID_RE.test(m.extensionId || '')) errors.push(`extensionId "${m.extensionId}" must be reverse-DNS, lowercase: com.<you>.<slug>`);
  if (/^com\.finamx\./.test(m.extensionId || '')) errors.push('com.finamx.* is reserved for FinamX itself; use your own namespace');
  if (!m.displayName) errors.push('displayName is required');
  if (!m.description) errors.push('description is required');
  if (m.summary && m.summary.length > 280) errors.push('summary is longer than 280 characters');
  if (!Array.isArray(m.platformSupport) || !m.platformSupport.length) errors.push('platformSupport needs at least one of web, ios, android');
  if (!Array.isArray(m.versions) || !m.versions.length) { errors.push('versions[] needs at least one version'); return { errors, warnings }; }
  m.versions.forEach((v, i) => { if (!SEMVER_RE.test(v.version || '')) errors.push(`versions[${i}].version "${v.version}" is not semver`); });
  const last = m.versions[m.versions.length - 1];
  for (const v of m.versions.slice(0, -1)) if (semverCmp(v.version, last.version) >= 0) errors.push(`the last entry of versions[] (${last.version}) must be the highest version; tools submit the last one`);
  for (const k of ['widget', 'pubsub']) if (k in last) errors.push(`versions[].${k} is not accepted; use versions[].surfaces`);

  const scopes = last.capabilitiesRequested || [];
  if (!scopes.length) errors.push('capabilitiesRequested needs at least one scope (ui.toast is the usual minimum)');
  for (const s of scopes) if (!SCOPE_RE.test(s) || s.length > 64) errors.push(`scope "${s}" must look like a.b (lowercase, dots)`);
  const hb = m.hostBridge || {};
  if (hb.requiresAuthContext && !scopes.includes('auth.context')) warnings.push('hostBridge.requiresAuthContext is true but auth.context is not requested');
  if (scopes.includes('auth.context') && !hb.requiresAuthContext) warnings.push('auth.context is requested but hostBridge.requiresAuthContext is not true: the host will not send a grant');

  const ui = last.surfaces && last.surfaces.ui;
  if (ui) {
    if ('embedSandbox' in ui) {
      const tokens = String(ui.embedSandbox).split(/\s+/);
      if (!tokens.includes('allow-same-origin')) errors.push('embedSandbox without allow-same-origin gives the iframe an opaque origin: <script type="module" src> is blocked (artifacts are served without CORS) and the widget stays an empty page. Remove embedSandbox; the platform default is "allow-scripts allow-same-origin allow-popups allow-forms" on an isolated sandbox origin');
      else warnings.push('embedSandbox is set; the platform default is usually right. Remove it unless you need a narrower set');
    }
    if (ui.artifact && ui.embedBundleUrl) errors.push('surfaces.ui.artifact and embedBundleUrl are mutually exclusive');
    if (ui.artifact && ui.embedEntryPath) errors.push('embedEntryPath must not be set with an artifact');
    if (ui.embedBundleUrl) warnings.push('embedBundleUrl: the platform downloads your bundle once at submit and freezes it as an artifact; uploading with --artifact-dir is simpler (see the openplatform-ext-publish skill)');
    const csp = ui.csp || {};
    for (const key of Object.keys(csp)) {
      if (!['connect', 'resource', 'frame', 'baseUri'].includes(key)) { errors.push(`csp.${key} is not a known key (connect, resource, frame, baseUri)`); continue; }
      const list = csp[key] || [];
      if (list.length > 10) errors.push(`csp.${key} has more than 10 entries`);
      for (const o of list) {
        if (key === 'resource' && (o === 'data:' || o === 'blob:')) continue;
        if (DEV_ORIGIN_RE.test(o)) { warnings.push(`csp.${key}: ${o} works only on a local platform; remove before submitting to a shared one`); continue; }
        if (!ORIGIN_RE.test(o)) errors.push(`csp.${key}: "${o}" must be a bare https:// origin (no path, no wildcard, no wss://)`);
      }
    }
    if ((csp.connect || []).length || (csp.frame || []).length || (csp.resource || []).filter(o => /^https:/.test(o)).length) {
      warnings.push(`external domains (${[...(csp.connect || []), ...(csp.frame || []), ...(csp.resource || [])].filter(o => /^https:/.test(o)).join(', ')}) need moderator approval per extension; mention them in the changelog`);
    }
  }

  const topics = last.surfaces && last.surfaces.topics;
  if (topics) {
    const owned = t => typeof t === 'string' && t.startsWith(m.extensionId + '.') && t.length > m.extensionId.length + 1;
    (topics.publishes || []).forEach((e, i) => {
      if (typeof e === 'string') { errors.push(`topics.publishes[${i}] must be an object { topicType, delivery }`); return; }
      const has = e.schema !== undefined && e.schema !== null;
      if (owned(e.topicType) && !has) errors.push(`topics.publishes[${i}] ${e.topicType}: your own topic needs a JSON Schema`);
      if (!owned(e.topicType) && has) errors.push(`topics.publishes[${i}] ${e.topicType}: a schema is only allowed on topics named ${m.extensionId}.<name>; ${e.topicType} is a host topic reference, drop the schema (or rename the topic to ${m.extensionId}.<name>)`);
      if (!Array.isArray(e.delivery) || !e.delivery.length) errors.push(`topics.publishes[${i}] needs delivery: ["bridge"] and/or ["s2s"]`);
    });
    (topics.subscribes || []).forEach((e, i) => { if (typeof e === 'string') errors.push(`topics.subscribes[${i}] must be an object { topicType, delivery }`); });
  }

  if (config) {
    const id = /EXTENSION_ID\s*=\s*['"]([^'"]+)['"]/.exec(config);
    if (id && id[1] !== m.extensionId) errors.push(`src/config.js EXTENSION_ID "${id[1]}" differs from manifest extensionId "${m.extensionId}"`);
    const sc = /SCOPES\s*=\s*(\[[^\]]*\])/.exec(config);
    if (sc) {
      try {
        const codeScopes = JSON.parse(sc[1].replace(/'/g, '"'));
        if (JSON.stringify([...codeScopes].sort()) !== JSON.stringify([...scopes].sort())) warnings.push(`src/config.js SCOPES ${JSON.stringify(codeScopes)} differ from capabilitiesRequested ${JSON.stringify(scopes)}`);
      } catch (_) { /* not a literal list */ }
    }
  }
  return { errors, warnings };
}

function main() {
  const argv = process.argv.slice(2);
  const arg = (name, def) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def; };
  const dist = resolve(arg('--dist', 'dist'));
  const manifestPath = resolve(arg('--manifest', 'manifest.json'));
  const configPath = resolve(arg('--config', 'src/config.js'));
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const last = manifest.versions && manifest.versions[manifest.versions.length - 1];
  const ui = last && last.surfaces && last.surfaces.ui;
  const m = checkManifest(manifest, { config: existsSync(configPath) ? readFileSync(configPath, 'utf8') : '' });
  const a = ui ? checkArtifact(dist, { csp: ui.csp }) : { errors: [], warnings: [], files: 0, bytes: 0 };
  const errors = [...m.errors, ...a.errors], warnings = [...m.warnings, ...a.warnings];
  if (argv.includes('--json')) { console.log(JSON.stringify({ errors, warnings, files: a.files, bytes: a.bytes }, null, 2)); }
  else {
    for (const w of warnings) console.log('warn  ' + w);
    for (const e of errors) console.log('ERROR ' + e);
    console.log(errors.length ? `✗ ${errors.length} error(s)` : `✓ checks passed${ui ? ` (${a.files} files, ${(a.bytes / 1024).toFixed(1)} KiB)` : ''}`);
  }
  process.exit(errors.length ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('check.mjs')) main();
