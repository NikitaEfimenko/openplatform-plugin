#!/usr/bin/env node
// Local server for dist/ with the same Content-Security-Policy the platform serves your artifact with
// (buildSandboxCsp from @finamx/bridge-protocol, csp from the last manifest version). If the widget works here,
// CSP will not break it inside the host.
//   PORT=8787 node scripts/finamx/dev-server.mjs           standalone: http://localhost:8787/ (?devtokens=ocean|paper)
//   SANDBOX_CSP_ANCESTOR=<host origin>                       exact platform policy for scripts/finamx/host-check.mjs
import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { buildSandboxCsp } from '@finamx/bridge-protocol';

const ROOT = process.cwd();
const DIST = resolve(ROOT, process.env.DIST || 'dist');
const PORT = Number(process.env.PORT || 8787);
const ANCESTOR = process.env.SANDBOX_CSP_ANCESTOR || '';

const manifest = JSON.parse(readFileSync(resolve(ROOT, 'manifest.json'), 'utf8'));
const last = manifest.versions[manifest.versions.length - 1];
const csp = ((last.surfaces && last.surfaces.ui) || {}).csp || null;
const CSP = buildSandboxCsp({ csp, frameAncestors: ANCESTOR ? [ANCESTOR] : [], allowLoopbackHttp: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.map': 'application/json', '.txt': 'text/plain; charset=utf-8' };

export function startServer({ port = PORT } = {}) {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (path === '/__health') { res.writeHead(200); res.end('ok'); return; }
    const rel = path.endsWith('/') ? path + 'index.html' : path;
    const abs = resolve(DIST, '.' + rel);
    if (!abs.startsWith(DIST + sep) || !existsSync(abs) || !statSync(abs).isFile()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, {
      'content-type': MIME[extname(abs)] || 'application/octet-stream',
      'cache-control': 'no-store',
      'content-security-policy': CSP,
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    });
    createReadStream(abs).pipe(res);
  });
  return new Promise(r => server.listen(port, '127.0.0.1', () => r(server)));
}

if (process.argv[1] && process.argv[1].endsWith('dev-server.mjs')) {
  await startServer();
  console.log(`dev: http://localhost:${PORT}/   (try ?devtokens=ocean or ?devtokens=paper)`);
  console.log(`CSP: ${CSP}`);
}
