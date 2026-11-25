import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createPublicKey, createPrivateKey, sign, verify } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const packageFile = require.resolve('@finamx/extension-sdk/package.json');
const sdk = JSON.parse(readFileSync(packageFile, 'utf8'));
const bin = join(dirname(packageFile), sdk.bin['finamx-ext']);

test('published CLI generates a usable pair and registers only public material with saved login and Publisher', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'finamx-plugin-s2s-'));
  // Synthetic credentials, isolated HOME and loopback API: never use the developer's actual session.
  const token = 'plugin-smoke-synthetic-developer-key';
  const publisher = 'com.acme';
  const extensionId = 'com.acme.smoke';
  const requests = [];
  let responseStatus = 200;
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString();
    requests.push({ path: req.url, method: req.method, headers: req.headers, raw });
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/v1/developer/hosts') return res.end(JSON.stringify({ hosts: [] }));
    if (req.url === '/api/v1/developer/publishers') return res.end(JSON.stringify({ publishers: [{
      publisherId: publisher, displayName: 'Smoke', role: 'developer', verificationStatus: 'unverified',
      personal: false, selected: false,
    }] }));
    if (req.url !== `/api/v1/developer/extensions/${extensionId}/s2s-key` || req.method !== 'PUT') {
      res.statusCode = 404;
      return res.end(JSON.stringify({ error: 'NOT_FOUND' }));
    }
    res.statusCode = responseStatus;
    return res.end(JSON.stringify(responseStatus === 200
      ? { registered: true, kid: JSON.parse(raw).kid, reviewRequired: true }
      : { error: 'S2S_KEY_ROTATION_REQUIRES_MODERATOR' }));
  });
  const cli = (args, input = '') => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bin, ...args], {
      cwd, env: { PATH: process.env.PATH, HOME: cwd, USERPROFILE: cwd }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
    child.stdin.end(input);
  });
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const api = `http://127.0.0.1:${server.address().port}`;
    const login = await cli(['--api', api, 'login', '--global', '--token-stdin'], `${token}\n`);
    assert.equal(login.code, 0, login.stderr);
    assert.ok(!login.stdout.includes(token));
    const selected = await cli(['publishers', 'use', publisher]);
    assert.equal(selected.code, 0, selected.stderr);
    writeFileSync(join(cwd, 'manifest.json'), JSON.stringify({ extensionId }));
    const dir = '.secrets/finamx-s2s';
    const generated = await cli(['s2s', 'keygen', '--out-dir', dir, '--json']);
    assert.equal(generated.code, 0, generated.stderr);
    const files = JSON.parse(generated.stdout);
    const privateJwk = JSON.parse(readFileSync(files.privatePath, 'utf8'));
    const publicJwk = JSON.parse(readFileSync(files.publicPath, 'utf8'));
    assert.equal(statSync(files.privatePath).mode & 0o777, 0o600);
    assert.equal(publicJwk.kid, privateJwk.kid);
    assert.equal(publicJwk.d, undefined);
    assert.ok(!generated.stdout.includes(privateJwk.d));
    const message = Buffer.from('Flow completion sender smoke');
    const signature = sign('sha256', message, createPrivateKey({ key: privateJwk, format: 'jwk' }));
    assert.equal(verify('sha256', message, createPublicKey({ key: publicJwk, format: 'jwk' }), signature), true);
    const rerun = await cli(['s2s', 'keygen', '--out-dir', dir]);
    assert.notEqual(rerun.code, 0);
    assert.deepEqual(JSON.parse(readFileSync(files.privatePath, 'utf8')), privateJwk);
    const registerArgs = ['s2s', 'register', '--public-jwk', files.publicPath, '--json'];
    for (let retry = 0; retry < 2; retry++) {
      const registered = await cli(registerArgs);
      assert.equal(registered.code, 0, registered.stderr);
      assert.deepEqual(JSON.parse(registered.stdout), { registered: true, kid: publicJwk.kid, reviewRequired: true });
      const sent = requests.at(-1);
      assert.equal(sent.headers.authorization, `Bearer ${token}`);
      assert.equal(sent.headers['x-finamx-publisher'], publisher);
      assert.deepEqual(JSON.parse(sent.raw), { publicJwk, kid: publicJwk.kid });
      assert.ok(!sent.raw.includes(privateJwk.d));
    }
    for (const path of [files.privatePath, files.jwksPath]) {
      const before = requests.length;
      const rejected = await cli(['s2s', 'register', '--public-jwk', path]);
      assert.notEqual(rejected.code, 0);
      assert.equal(requests.length, before, 'private JWK and JWKS must fail before a request');
      assert.ok(!`${rejected.stdout}${rejected.stderr}`.includes(privateJwk.d));
    }
    responseStatus = 409;
    const rotation = await cli(registerArgs);
    assert.notEqual(rotation.code, 0);
    assert.match(rotation.stderr, /S2S_KEY_ROTATION_REQUIRES_MODERATOR/);
  } finally {
    await new Promise(resolve => server.close(resolve));
    rmSync(cwd, { recursive: true, force: true });
  }
});
