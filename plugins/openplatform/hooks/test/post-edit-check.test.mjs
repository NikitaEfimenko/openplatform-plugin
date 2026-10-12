import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run } from '../post-edit-check.mjs';

function project({ cli = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'op-hook-'));
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ versions: [{}] }));
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src', 'a.js'), '');
  if (cli) {
    const d = path.join(root, 'node_modules', '@finamx', 'extension-sdk', 'dist', 'cli');
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'index.js'), '');
  }
  return root;
}
function fake(stdout = '{"errors":[],"warnings":[]}', stderr = '') {
  const calls = [];
  const execFile = (file, args, opts, cb) => {
    calls.push({ file, args, opts });
    cb(null, stdout, stderr);
  };
  return { calls, execFile };
}
const go = (root, file, f, env = {}) =>
  run({ cwd: root, tool_name: 'Edit', tool_input: { file_path: file } }, { fs, execFile: f.execFile, env, execPath: 'NODE' });

test('post-edit: edits outside an extension project, in node_modules, dist, .git or .finamx, or of other file types run nothing', async () => {
  const root = project();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'op-hook-'));
  fs.writeFileSync(path.join(outside, 'x.js'), '');
  for (const f of [path.join(outside, 'x.js'), 'node_modules/p/i.js', 'dist/a.js', '.git/x.js', '.finamx/a.json', 'src/readme.md', 'src/pic.png']) {
    const fk = fake();
    assert.equal(await go(root, f, fk), '', f);
    assert.equal(fk.calls.length, 0, f);
  }
  const fk = fake();
  await run({ cwd: outside, tool_name: 'Edit', tool_input: { file_path: 'x.js' } }, { fs, execFile: fk.execFile, env: {}, execPath: 'NODE' });
  assert.equal(fk.calls.length, 0);
});

test('post-edit: runs node <root>/node_modules/@finamx/extension-sdk/dist/cli/index.js check --json with execFile, shell false, cwd = project root, timeout 60 s, maxBuffer 1 MB', async () => {
  const root = project();
  const fk = fake();
  await go(root, 'src/a.js', fk);
  assert.equal(fk.calls.length, 1);
  const c = fk.calls[0];
  assert.equal(c.file, 'NODE');
  assert.deepEqual(c.args, [path.join(root, 'node_modules', '@finamx', 'extension-sdk', 'dist', 'cli', 'index.js'), 'check', '--json']);
  assert.equal(c.opts.shell, false);
  assert.equal(c.opts.cwd, root);
  assert.equal(c.opts.timeout, 60000);
  assert.equal(c.opts.maxBuffer, 1048576);
});

test('post-edit: the child environment has no FINAMX_DEV_TOKEN, FINAMX_API_TOKEN, FINAMX_API_URL or any variable whose name contains TOKEN, SECRET, PASSWORD or KEY', async () => {
  const root = project();
  const fk = fake();
  await go(root, 'src/a.js', fk, { FINAMX_DEV_TOKEN: 'a', FINAMX_API_TOKEN: 'b', FINAMX_API_URL: 'u', MY_SECRET: 's', DB_PASSWORD: 'p', SSH_KEY: 'k', GITHUB_TOKEN: 't', PATH: '/bin', HOME: '/h' });
  assert.deepEqual(Object.keys(fk.calls[0].opts.env).sort(), ['HOME', 'PATH']);
});

test('post-edit: without a local finamx-ext it runs nothing and prints nothing', async () => {
  const root = project({ cli: false });
  const fk = fake('{"errors":["x"]}');
  assert.equal(await go(root, 'src/a.js', fk), '');
  assert.equal(fk.calls.length, 0);
});

test('post-edit: errors come back as additionalContext with at most 20 sanitised entries and a build hint when dist is mentioned; a clean check prints nothing', async () => {
  const root = project();
  assert.equal(await go(root, 'src/a.js', fake()), '');
  const errors = Array.from({ length: 30 }, (_, i) => (i === 0 ? '\u001b[31mentry dist/index.html is missing\u001b[0m' : { file: 'f.js', code: 'E' + i, message: 'bad' }));
  const out = await go(root, 'src/a.js', fake(JSON.stringify({ errors, warnings: ['w'] })));
  assert.match(out, /found 30 error\(s\) after editing src\/a\.js/);
  assert.equal(out.split('\n').filter((l) => l.startsWith('- ')).length, 20);
  assert.ok(!out.includes('\u001b'));
  assert.match(out, /npm run build/);
  assert.match(out, /1 warning\(s\)/);
});

test('post-edit: unreadable check output yields a short sanitised note, never the raw output', async () => {
  const root = project();
  const out = await go(root, 'src/a.js', fake('RAW-STDOUT-LEAK not json', '\u001b[31m' + 'e'.repeat(1000)));
  assert.match(out, /^finamx-ext check did not return JSON: /);
  assert.ok(!out.includes('RAW-STDOUT-LEAK') && !out.includes('\u001b') && out.length < 400);
});
