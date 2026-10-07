#!/usr/bin/env node
// Runs dist/ inside a real host before you submit: @finamx/host-bridge (createWebHostBridge, CapabilityRouter,
// PubSubBroker), the widget on a different origin, the platform sandbox ("allow-scripts allow-same-origin
// allow-popups allow-forms", or embedSandbox from the manifest, as the platform does) and the exact platform CSP. A widget that passes here does not show up empty in the host.
//
//   node scripts/finamx/host-check.mjs            (build first: npm run build)
//
// Checks: handshake (data-boot="host"), no CSP violations or page errors, host tokens applied (theme + background),
// a token change from the host (host:tokens) re-themes the widget.
// Needs devDependencies @finamx/host-bridge, playwright-core, esbuild and Google Chrome (or CHROME_PATH=<binary>).
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';

const ROOT = process.cwd();
const require = createRequire(join(ROOT, 'package.json'));
const manifest = JSON.parse(readFileSync(resolve(ROOT, 'manifest.json'), 'utf8'));
const last = manifest.versions[manifest.versions.length - 1];
const topics = (last.surfaces && last.surfaces.topics) || {};
const names = list => (list || []).map(e => (typeof e === 'string' ? e : e.topicType)).filter(Boolean);

const LIGHT = { colors: { background: '#ffffff', foreground: '#111114', primary: '#d9480f', 'primary-foreground': '#ffffff', muted: '#f1f3f5', 'muted-foreground': '#5c5f66', border: '#dee2e6', accent: '#fff4e6', 'accent-foreground': '#111114', card: '#f8f9fa', 'card-foreground': '#111114', destructive: '#e03131' }, radius: '4px', fontFamily: 'Georgia, serif' };
const DARK = { colors: { background: '#0b1f33', foreground: '#e6f1ff', primary: '#00b3a4', 'primary-foreground': '#031a18', muted: '#1b3b5c', 'muted-foreground': '#8fb0d4', border: '#2a4d73', accent: '#1f4a73', 'accent-foreground': '#ffffff', card: '#12304d', 'card-foreground': '#d0e4ff', destructive: '#ff6b6b' }, radius: '12px', fontFamily: 'Verdana, sans-serif' };
const rgb = hex => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };

const freePort = () => new Promise(r => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });

const brokerFile = join(dirname(require.resolve('@finamx/host-bridge/package.json')), 'dist', 'pub-sub-broker.js');
const hostSource = `
import { createWebHostBridge, CapabilityRouter } from '@finamx/host-bridge/core';
import { PubSubBroker } from ${JSON.stringify(brokerFile)};
import { parseHostDomain } from '@finamx/bridge-protocol';
const cfg = window.__CFG__;
const hostDomain = parseHostDomain({
  methods: cfg.scopes.map(s => ({ method: s, requiredScope: s })),
  topics: cfg.topics.map(t => ({ topicType: t })),
  consentMatrix: cfg.topics.map(t => ({ topicType: t, access: 'public' })),
});
const broker = new PubSubBroker({ hostDomain });
const b64 = s => btoa(unescape(encodeURIComponent(s)));
const session = { sessionId: 'sess-' + Math.random().toString(36).slice(2), extensionId: cfg.extensionId, allowedOrigin: cfg.widgetOrigin,
  grantedScopes: cfg.scopes, trustClass: 'external', extensionTopics: { publishes: cfg.publishes, subscribes: cfg.subscribes }, userId: 'user-1' };
const iframe = document.createElement('iframe');
iframe.name = 'widget';
iframe.setAttribute('sandbox', cfg.sandbox);
iframe.src = cfg.widgetOrigin + '/#__bsession=' + b64(JSON.stringify({ sessionId: session.sessionId, extensionId: session.extensionId, parentOrigin: location.origin }));
document.body.appendChild(iframe);
const router = new CapabilityRouter({ userId: session.userId, hostDomain });
window.__host = { ready: false, errors: [], toasts: [] };
router.registerMethod('ui.toast', async ({ params }) => { window.__host.toasts.push(params); return { shown: true }; });
const bridge = createWebHostBridge({ iframe, allowedOrigin: session.allowedOrigin, session, capabilityRouter: router,
  hostContext: { uiTokens: cfg.light, theme: 'light' }, pubSubBroker: broker,
  onError: e => window.__host.errors.push(e.code + ': ' + e.message),
  onToast: (message, variant) => window.__host.toasts.push({ message, variant }),
  onReady: () => { window.__host.ready = true; } });
window.__host.pushTokens = t => bridge.pushUiTokens(t);
window.__host.publish = (t, p) => broker.publishTopic(t, p);
`;

async function main() {
  const hostPort = await freePort();
  const widgetPort = await freePort();
  const HOST = `http://localhost:${hostPort}`;
  process.env.SANDBOX_CSP_ANCESTOR = HOST;
  process.env.PORT = String(widgetPort);
  const { startServer } = await import('./dev-server.mjs');
  const widgetServer = await startServer({ port: widgetPort });
  const hostJs = (await build({ stdin: { contents: hostSource, resolveDir: ROOT, loader: 'js' }, bundle: true, format: 'esm', platform: 'browser', write: false, logLevel: 'silent' })).outputFiles[0].text;
  const cfg = { widgetOrigin: `http://127.0.0.1:${widgetPort}`, extensionId: manifest.extensionId, scopes: last.capabilitiesRequested || [],
    publishes: names(topics.publishes), subscribes: names(topics.subscribes), topics: [...new Set([...names(topics.publishes), ...names(topics.subscribes)])], light: LIGHT,
    sandbox: ((last.surfaces && last.surfaces.ui) || {}).embedSandbox || 'allow-scripts allow-same-origin allow-popups allow-forms' };
  const html = `<!doctype html><meta charset="utf-8"><title>host</title><body style="margin:0"><script>window.__CFG__=${JSON.stringify(cfg)}</script><script type="module" src="/host.js"></script>`;
  const hostServer = createServer((req, res) => {
    if (req.url === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); return; }
    if (req.url === '/host.js') { res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' }); res.end(hostJs); return; }
    res.writeHead(404); res.end();
  });
  await new Promise(r => hostServer.listen(hostPort, '127.0.0.1', r));

  const launchOpts = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' };
  const browser = await chromium.launch({ headless: true, ...launchOpts }).catch(err => {
    console.error('Could not start Chrome (' + err.message.split('\n')[0] + '). Install Google Chrome or set CHROME_PATH.');
    process.exit(2);
  });
  const results = [];
  const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };
  try {
    const ctx = await browser.newContext({ colorScheme: 'dark', viewport: { width: 900, height: 700 } });
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', m => { if (m.type() === 'error' || /Content Security Policy|Refused/.test(m.text())) logs.push(m.text()); });
    page.on('pageerror', e => logs.push('pageerror: ' + e.message));
    await page.goto(HOST + '/');
    let frame = null;
    for (let i = 0; i < 100 && !frame; i++) { frame = page.frame({ name: 'widget' }); if (!frame) await page.waitForTimeout(50); }
    const booted = await frame.waitForFunction(() => document.documentElement.dataset.boot, null, { timeout: 15000 }).then(h => h.jsonValue()).catch(() => null);
    check('handshake with the host (data-boot="host")', booted === 'host', booted ? `data-boot=${booted}` : 'the widget script never set data-boot: it did not run (CSP violation, or embedSandbox without allow-same-origin) or does not use bootWidget');
    if (booted === 'host') {
      const st = await frame.evaluate(() => ({ theme: document.documentElement.dataset.theme, bg: getComputedStyle(document.body).backgroundColor }));
      check('host tokens applied (light set over a dark OS)', st.theme === 'light' && st.bg === rgb(LIGHT.colors.background), `theme=${st.theme}, body background=${st.bg}, expected ${rgb(LIGHT.colors.background)}`);
      await page.evaluate(t => window.__host.pushTokens(t), DARK);
      const re = await frame.waitForFunction(bg => getComputedStyle(document.body).backgroundColor === bg && document.documentElement.dataset.theme === 'dark', rgb(DARK.colors.background), { timeout: 5000 }).then(() => true).catch(() => false);
      check('host:tokens re-themes the widget', re, re ? '' : 'the widget ignored a token change (watch host:tokens)');
    }
    const cspErrors = logs.filter(l => /Content Security Policy|Refused/.test(l));
    check('no CSP violations', cspErrors.length === 0, cspErrors.slice(0, 3).join(' | '));
    const pageErrors = logs.filter(l => l.startsWith('pageerror'));
    check('no uncaught errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
    const hostErrors = await page.evaluate(() => window.__host.errors);
    check('no bridge protocol errors on the host side', hostErrors.length === 0, hostErrors.slice(0, 3).join(' | '));
    await ctx.close();
  } finally {
    await browser.close();
    widgetServer.close();
    hostServer.close();
  }
  const failed = results.filter(r => !r.ok).length;
  console.log(failed ? `✗ ${failed} host check(s) failed` : '✓ the widget works inside a real host');
  process.exit(failed ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
