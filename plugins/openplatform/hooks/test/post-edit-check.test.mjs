import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { DEBOUNCE_MS, run } from '../post-edit-check.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'op-hook-')));

function project({ manifest = { versions: [{ version: '1.0.0', surfaces: { ui: {} } }] }, hosts = [] } = {}) {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest));
  fs.mkdirSync(path.join(root, 'src', 'deep', 'er'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'a.js'), '');
  for (const h of hosts) fs.mkdirSync(path.join(root, '.finamx', 'domain', h), { recursive: true });
  return root;
}
let n = 0;
const go = (root, file, extra = {}) =>
  run({ cwd: root, session_id: 's' + n++, tool_name: 'Edit', tool_input: { file_path: file }, ...extra.input }, { fs, env: {}, stateDir: extra.stateDir || tmp(), now: extra.now });

test('post-edit: edits outside an extension project, in node_modules, dist, .git or .finamx, or of other file types print nothing', () => {
  const root = project();
  const outside = tmp();
  fs.writeFileSync(path.join(outside, 'x.js'), '');
  for (const f of [path.join(outside, 'x.js'), 'node_modules/p/i.js', 'dist/a.js', '.git/x.js', '.finamx/a.json', 'src/readme.md', 'src/pic.png']) {
    assert.equal(go(root, f), '', f);
  }
  assert.equal(go(outside, 'x.js'), '');
});

test('post-edit: a manifest.json without versions[].surfaces is not an extension project', () => {
  for (const manifest of [{ versions: [{}] }, { versions: [] }, { name: 'some-app' }, { versions: [{ surfaces: 'x' }] }]) {
    assert.equal(go(project({ manifest }), 'src/a.js'), '', JSON.stringify(manifest));
  }
});

test('post-edit: an edit in an extension project yields one advisory line naming finamx-ext check --json', () => {
  const root = project();
  for (const f of ['src/a.js', 'manifest.json', 'src/deep/er/b.ts']) {
    const out = go(root, f);
    assert.match(out, /run `finamx-ext check --json`/, f);
    assert.equal(out.split('\n').length, 1);
    assert.ok(out.length < 400);
    assert.ok(!out.includes('--host'));
  }
});

test('post-edit: with a pulled host the note also names finamx-ext check --host and the host ids; templates and unsafe names are left out', () => {
  const root = project({ hosts: ['trading-diary', 'templates', 'bad name', 'acme'] });
  fs.symlinkSync(path.join(root, '.finamx', 'domain', 'acme'), path.join(root, '.finamx', 'domain', 'zlink'));
  const out = go(root, 'src/a.js');
  assert.match(out, /`finamx-ext check --host <hostId> --json` \(pulled: `acme`, `trading-diary`\)/);
  assert.ok(!out.includes('templates') && !out.includes('bad name') && !out.includes('zlink'));
  assert.equal(out.split('\n').length, 1);
});

test('post-edit: the nearest manifest above the edited file wins, the walk never leaves the session project root', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'apps', 'widget', 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'apps', 'widget', 'manifest.json'), JSON.stringify({ versions: [{ surfaces: {} }] }));
  fs.mkdirSync(path.join(root, 'apps', 'widget', '.finamx', 'domain', 'h1'), { recursive: true });
  fs.mkdirSync(path.join(root, 'apps', 'other'), { recursive: true });
  assert.match(go(root, 'apps/widget/src/a.js'), /pulled: `h1`/);
  assert.equal(go(root, 'apps/other/a.js'), '');
  // the manifest sits above the boundary: not seen
  assert.equal(go(path.join(root, 'apps', 'widget', 'src'), 'a.js'), '');
});

test('post-edit: a symlinked project root still gets the note', () => {
  const root = project();
  const link = path.join(tmp(), 'link');
  fs.symlinkSync(root, link);
  assert.match(run({ cwd: link, session_id: 'x', tool_input: { file_path: path.join(root, 'src', 'a.js') } }, { fs, env: {}, stateDir: tmp() }), /finamx-ext check --json/);
  assert.match(run({ cwd: root, session_id: 'x', tool_input: { file_path: path.join(link, 'src', 'a.js') } }, { fs, env: {}, stateDir: tmp() }), /finamx-ext check --json/);
});

test('post-edit: a burst of edits in one session and project gets one note per debounce window; another session or project is not silenced', () => {
  const root = project();
  const stateDir = tmp();
  const at = (now, session_id = 'burst', r = root) => run({ cwd: r, session_id, tool_input: { file_path: 'src/a.js' } }, { fs, env: {}, stateDir, now });
  const t0 = 1700000000000;
  assert.notEqual(at(t0), '');
  assert.equal(at(t0 + 1000), '');
  assert.equal(at(t0 + DEBOUNCE_MS - 1), '');
  assert.notEqual(at(t0 + DEBOUNCE_MS + 1), '');
  assert.notEqual(at(t0 + 2000, 'other-session'), '');
  assert.notEqual(at(t0 + 2000, 'burst', project()), '');
  // state files hold nothing and are named by a hash only
  for (const f of fs.readdirSync(stateDir)) {
    assert.match(f, /^[0-9a-f]{32}$/);
    assert.equal(fs.readFileSync(path.join(stateDir, f), 'utf8'), '');
  }
});

test('post-edit: when the state directory cannot be used the note is still printed', () => {
  const root = project();
  const real = tmp();
  const link = path.join(tmp(), 'state-link');
  fs.symlinkSync(real, link);
  assert.notEqual(go(root, 'src/a.js', { stateDir: link }), '');
  assert.notEqual(go(root, 'src/a.js', { stateDir: link }), '');
  assert.deepEqual(fs.readdirSync(real), []);
  const file = path.join(tmp(), 'not-a-dir');
  fs.writeFileSync(file, '');
  assert.notEqual(go(root, 'src/a.js', { stateDir: file }), '');
});

test('post-edit: the hook executes nothing from the project: a planted node_modules/@finamx/extension-sdk CLI is never started', () => {
  const root = project();
  const d = path.join(root, 'node_modules', '@finamx', 'extension-sdk', 'dist', 'cli');
  fs.mkdirSync(d, { recursive: true });
  const proof = path.join(root, 'PLANTED-RAN');
  fs.writeFileSync(path.join(d, 'index.js'), `require('node:fs').writeFileSync(${JSON.stringify(proof)}, 'x'); console.log('{"errors":["PLANTED"]}');`);
  fs.mkdirSync(path.join(root, 'node_modules', '.bin'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules', '.bin', 'finamx-ext'), `#!/bin/sh\ntouch ${JSON.stringify(proof)}\n`, { mode: 0o755 });
  // the real hook process, as Claude Code starts it
  const r = spawnSync(process.execPath, [path.join(here, '..', 'post-edit-check.mjs')], {
    input: JSON.stringify({ cwd: root, session_id: 'planted-' + Date.now(), hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: path.join(root, 'src', 'a.js') } }),
    encoding: 'utf8',
    env: { PATH: path.join(root, 'node_modules', '.bin') + path.delimiter + process.env.PATH, TMPDIR: tmp() },
  });
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.match(out.hookSpecificOutput.additionalContext, /run `finamx-ext check --json`/);
  assert.ok(!r.stdout.includes('PLANTED'));
  assert.ok(!fs.existsSync(proof));
});

test('hooks: no hook script imports child_process, a network module or calls fetch', () => {
  const dir = path.join(here, '..');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.mjs'));
  assert.ok(files.length >= 4);
  for (const f of files) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.ok(!/child_process|\b(spawn|spawnSync|execFile|execFileSync|execSync|fork)\b|\bexec\(/.test(text), f + ' starts a process');
    assert.ok(!/node:(net|http|https|http2|tls|dgram|dns)\b|\bfetch\(|\bimport\(/.test(text), f + ' reaches the network or imports dynamically');
    for (const m of text.matchAll(/from '([^']+)'/g)) {
      assert.ok(['node:fs', 'node:path', 'node:url', 'node:os', 'node:crypto', './lib.mjs'].includes(m[1]), `${f} imports ${m[1]}`);
    }
  }
});
