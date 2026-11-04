import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('key generator writes a matching public JWK, protects private key, and refuses overwrite', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'finamx-s2s-key-'));
  const script = new URL('./generate-s2s-keypair.mjs', import.meta.url).pathname;
  try {
    const run = () => spawnSync(process.execPath, [script, '--out-dir', dir, '--kid', 'test-key'], { encoding: 'utf8' });
    const first = run();
    assert.equal(first.status, 0, first.stderr);
    assert.doesNotMatch(first.stdout, /"d"\s*:/);
    const privatePath = join(dir, 's2s-private.jwk.json');
    const privateJwk = JSON.parse(readFileSync(privatePath, 'utf8'));
    const publicJwk = JSON.parse(readFileSync(join(dir, 's2s-public.jwk.json'), 'utf8'));
    const jwks = JSON.parse(readFileSync(join(dir, 's2s-public.jwks.json'), 'utf8'));
    assert.equal(statSync(privatePath).mode & 0o077, 0);
    assert.equal(privateJwk.kid, 'test-key');
    assert.equal(publicJwk.kid, 'test-key');
    assert.equal(publicJwk.d, undefined);
    assert.deepEqual(jwks, { keys: [publicJwk] });
    const privateKey = await webcrypto.subtle.importKey('jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const publicKey = await webcrypto.subtle.importKey('jwk', publicJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const payload = new TextEncoder().encode('finamx-s2s');
    const signature = await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, payload);
    assert.equal(await webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, signature, payload), true);
    const second = run();
    assert.notEqual(second.status, 0);
    assert.deepEqual(JSON.parse(readFileSync(privatePath, 'utf8')), privateJwk);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
