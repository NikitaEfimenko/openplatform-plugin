#!/usr/bin/env node
// Generate an ES256 client key for s2s pull and Flow Runner completion.
// The private JWK is written only to a mode-0600 file, never to stdout.
import { randomUUID, webcrypto } from 'node:crypto';
import { mkdir, open } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const args = process.argv.slice(2);
const usage = 'Usage: node generate-s2s-keypair.mjs --out-dir <gitignored-directory> [--kid <key-id>]';
if (args.includes('--help')) {
  console.log(usage);
  process.exit(0);
}
const option = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`${name} requires a value`);
  return args[i + 1];
};

try {
  if (args.some((arg, i) => i % 2 === 0 && !['--out-dir', '--kid'].includes(arg)) || args.length % 2) {
    throw new Error(usage);
  }
  const out = option('--out-dir');
  if (!out) throw new Error(usage);
  const kid = option('--kid') ?? `s2s-${randomUUID()}`;
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(kid)) throw new Error('kid must be 1–128 URL-safe characters');
  const dir = resolve(out);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const { privateKey, publicKey } = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'],
  );
  const privateJwk = { ...(await webcrypto.subtle.exportKey('jwk', privateKey)), kid, alg: 'ES256', use: 'sig' };
  const publicJwk = { ...(await webcrypto.subtle.exportKey('jwk', publicKey)), kid, alg: 'ES256', use: 'sig' };
  const privatePath = join(dir, 's2s-private.jwk.json');
  const publicPath = join(dir, 's2s-public.jwk.json');
  const jwksPath = join(dir, 's2s-public.jwks.json');
  const privateFile = await open(privatePath, 'wx', 0o600);
  try {
    await privateFile.writeFile(`${JSON.stringify(privateJwk, null, 2)}\n`);
  } finally {
    await privateFile.close();
  }
  try {
    const publicFile = await open(publicPath, 'wx', 0o644);
    try {
      await publicFile.writeFile(`${JSON.stringify(publicJwk, null, 2)}\n`);
    } finally {
      await publicFile.close();
    }
  } catch (error) {
    // Keep the private file for recovery if only the public filename collided.
    throw error;
  }
  const jwksFile = await open(jwksPath, 'wx', 0o644);
  try {
    await jwksFile.writeFile(`${JSON.stringify({ keys: [publicJwk] }, null, 2)}\n`);
  } finally {
    await jwksFile.close();
  }
  console.log(`Public JWK: ${publicPath}\nPublic JWKS: ${jwksPath}\nPrivate JWK: ${privatePath} (mode 0600; keep secret)\nkid: ${kid}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
