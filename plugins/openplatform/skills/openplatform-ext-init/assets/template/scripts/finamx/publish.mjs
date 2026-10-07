#!/usr/bin/env node
// Submits the extension to a FinamX Open Platform portal, the recommended way: dist/ is uploaded as an artifact
// (no hosting of your own needed), then the manifest goes to review. Safe to re-run.
//
//   node scripts/finamx/publish.mjs              check -> upload dist/ -> submit; an existing extension gets the
//                                                last versions[] entry as a new version (waits for review)
//   node scripts/finamx/publish.mjs --dry-run    show what would be sent, send nothing
//   node scripts/finamx/publish.mjs status       moderation status of this extensionId
//   options: --dist dist  --entry index.html  --manifest manifest.json  --skip-checks
//
// Token: FINAMX_DEV_TOKEN (env or .env). Portal: FINAMX_API_URL (env or .env), default https://openplatform.changesandbox.ru
// The token is read from the environment only; it is never printed or written anywhere.
//
// Delivery modes (decided from the last version in manifest.json):
//   surfaces.ui without embedBundleUrl -> artifact upload of dist/ (recommended)
//   surfaces.ui.embedBundleUrl         -> no upload: the platform downloads your hosted bundle once at submit
//   no surfaces.ui (headless)          -> manifest only
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const arg = (name, def) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def; };
const flag = name => argv.includes(name);
const cmd = argv[0] === 'status' ? 'status' : 'publish';
const DRY = flag('--dry-run');

function loadDotEnv() {
  const file = join(ROOT, '.env');
  const out = {};
  if (!existsSync(file)) return out;
  for (const raw of readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}
const env = { ...loadDotEnv(), ...process.env };
const TOKEN = env.FINAMX_DEV_TOKEN || env.FINAMX_API_TOKEN || '';
const API = (env.FINAMX_API_URL || 'https://openplatform.changesandbox.ru').replace(/\/$/, '');
const manifestPath = resolve(arg('--manifest', 'manifest.json'));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const id = manifest.extensionId;

// What each answer means and what to do about it.
const HINTS = {
  UNAUTHORIZED: 'The token is missing, wrong or revoked. Issue a new one in the portal: /developer/dashboard -> Generate API Token.',
  INVALID_MANIFEST: 'The registry rejected the manifest; the details list the failing fields. Run node scripts/finamx/check.mjs.',
  NAMESPACE_RESERVED: 'com.finamx.* is reserved for FinamX. Use your own prefix, e.g. com.<you>.<slug>.',
  EXTENSION_EXISTS: 'This extensionId is taken. If it is yours, the script submits a new version; otherwise pick another id.',
  NOT_FOUND: 'The extension exists but belongs to another publisher account (the token owner is not the one who first submitted it). Use that account\'s token, ask a moderator to transfer it, or choose another extensionId.',
  VERSION_NOT_NEWER: 'Add a new entry at the end of versions[] with a higher semver and a changelog.',
  EXTENSION_SUSPENDED: 'The extension is suspended. Contact the platform moderators.',
  BUNDLE_IMPORT_FAILED: 'The platform could not download embedBundleUrl: files must answer 200 directly (no redirects), max 5 MiB / 200 files. Or drop embedBundleUrl and upload dist/ instead.',
  BUNDLE_UNREACHABLE: 'embedBundleUrl did not answer 200 without redirects.',
  SANDBOX_ORIGIN_NOT_CONFIGURED: 'This platform cannot run artifacts. Host the bundle and submit surfaces.ui.embedBundleUrl.',
  DOMAINS_NOT_APPROVED: 'A moderator has to approve the external domains (csp.*, embedBundleUrl) of this extension first. Tell them which domains and why.',
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
// Retries only network failures (some proxies drop keep-alive connections); an HTTP answer is final.
async function request(method, path, body, okStatuses) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(API + path, {
        method,
        headers: { Authorization: `Bearer ${TOKEN}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { raw: text.slice(0, 300) }; }
      return { ok: okStatuses.includes(res.status), status: res.status, data };
    } catch (err) {
      if (attempt >= 6) throw new Error(`network error after ${attempt} attempts: ${err.message}`);
      await sleep(1500 * attempt);
    }
  }
}

function fail(step, r) {
  const code = r.data && (r.data.error || r.data.code);
  console.error(`✗ ${step}: HTTP ${r.status}${code ? ' ' + code : ''}${r.data && r.data.message ? ' — ' + r.data.message : ''}`);
  if (r.data && r.data.details) console.error(JSON.stringify(r.data.details, null, 2).slice(0, 2000));
  if (r.data && r.data.domains) console.error('domains: ' + JSON.stringify(r.data.domains));
  const hint = HINTS[code] || (r.status === 401 ? HINTS.UNAUTHORIZED : null);
  if (hint) console.error('→ ' + hint);
  process.exit(1);
}

async function status() {
  const r = await request('GET', `/api/v1/developer/extensions/${encodeURIComponent(id)}`, null, [200]);
  if (!r.ok) fail('status', r.status === 404 ? { ...r, data: { error: 'NOT_FOUND' } } : r);
  const d = r.data;
  console.log(`${d.extensionId}: ${d.status}${d.moderatorComment ? ` — moderator: ${d.moderatorComment}` : ''} (updated ${d.updatedAt})`);
  console.log('in_review = waiting for the first review; published = live (a newer version may be waiting); rejected = see the moderator comment.');
  console.log('Note: a published extension is visible in a host only after the moderator enables it for that host.');
}

async function packArtifact(dist, entry) {
  const require = createRequire(join(ROOT, 'package.json'));
  const sdkDir = dirname(require.resolve('@finamx/extension-sdk/package.json'));
  const { packArtifactDir } = await import(pathToFileURL(join(sdkDir, 'dist', 'cli', 'artifact-pack.js')).href);
  return packArtifactDir(resolve(dist), { entry });
}

async function publish() {
  const last = manifest.versions[manifest.versions.length - 1];
  const ui = last.surfaces && last.surfaces.ui;
  const mode = !ui ? 'headless' : ui.embedBundleUrl ? 'bundle-url' : 'artifact';
  const dist = arg('--dist', 'dist');
  const entry = arg('--entry', 'index.html');
  console.log(`portal ${API}\nextension ${id} version ${last.version}, mode: ${mode}`);

  if (!flag('--skip-checks') && existsSync(join(ROOT, 'scripts/finamx/check.mjs'))) {
    execFileSync(process.execPath, ['scripts/finamx/check.mjs', '--dist', dist, '--manifest', manifestPath], { stdio: 'inherit' });
  }

  const { status: _s, submittedBy: _b, ...clean } = manifest;
  const version = JSON.parse(JSON.stringify(last));
  let packed = null;
  if (mode === 'artifact') {
    packed = await packArtifact(dist, entry);
    const vui = version.surfaces.ui;
    delete vui.embedBundleUrl; delete vui.embedEntryPath;
    vui.artifact = { sha256: packed.sha256, entry: packed.entry };
    console.log(`artifact: ${packed.envelope.files.length} files, sha256 ${packed.sha256}`);
  }
  clean.versions = [...manifest.versions.slice(0, -1), version];

  if (DRY) {
    console.log('--dry-run: would send this last version:\n' + JSON.stringify(version, null, 2));
    return;
  }
  if (!TOKEN) {
    console.error('✗ No FINAMX_DEV_TOKEN. Register at ' + API + '/developer/register, then Dashboard -> Generate API Token,\n  and put FINAMX_DEV_TOKEN=<token> into .env (gitignored) or export it. Never commit the token.');
    process.exit(1);
  }

  if (packed) {
    const up = await request('POST', '/api/v1/developer/artifacts', packed.envelope, [201]);
    if (!up.ok) fail('artifact upload', up);
    console.log('✓ artifact uploaded');
  }

  const created = await request('POST', '/api/v1/developer/extensions', clean, [200, 201, 202]);
  if (created.ok) {
    console.log(`✓ ${id} submitted for review (status: ${created.data.status || 'in_review'})`);
  } else if (created.status === 409 && (created.data.error === 'EXTENSION_EXISTS' || /already exists/i.test(created.data.message || created.data.error || ''))) {
    console.log(`${id} already exists: submitting version ${version.version}`);
    const v = await request('POST', `/api/v1/developer/extensions/${encodeURIComponent(id)}/versions`, version, [200, 201, 202]);
    if (!v.ok) fail('new version', v);
    console.log(v.data.review === 'pending_version'
      ? `✓ version ${version.version} waits for review; the published version keeps running until it is approved`
      : `✓ version ${version.version} added; the extension is back in review`);
  } else {
    fail('submit', created);
  }
  console.log('Next: a moderator reviews it (external domains, then publish, then enables it for a host). Check with: node scripts/finamx/publish.mjs status');
}

(cmd === 'status' ? status() : publish()).catch(err => { console.error('✗ ' + err.message); process.exit(1); });
