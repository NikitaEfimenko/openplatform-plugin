// SessionStart hook: pulled host domains (names and scopes only) and the last dev events.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DATA_MARKER, SAFE_NAME, isExtensionProject, isSymlink, projectRoot, readTail, runHook, sanitize } from './lib.mjs';

const MAX_TARGETS = 5;
const MAX_DOMAIN_BYTES = 1048576;
const TAIL_BYTES = 65536;
const MAX_EVENTS = 20;
const MAX_ERROR_EVENTS = 15;
const MAX_TOTAL = 9000;

const EVENT_FIELDS = {
  'dev.ready': ['url', 'hostId', 'status'],
  'dev.stopped': ['status'],
  'bus.publish': ['extensionId', 'topic', 'to', 'schema', 'fields'],
  'bus.subscribe': ['extensionId', 'topic'],
  invoke: ['extensionId', 'method', 'result', 'code', 'mock', 'scope'],
  'schema.error': ['extensionId', 'topic', 'schema', 'fields'],
  'scope.denied': ['extensionId', 'method', 'topic', 'scope', 'code'],
  'csp.violation': ['extensionId', 'directive', 'blockedUrl'],
  build: ['extensionId', 'status', 'message'],
  'domain.changed': ['hostId', 'previousHash', 'domainHash'],
  'domain.poll_failed': ['hostId', 'message'],
  'domain.refreshed': ['hostId', 'previousHash', 'domainHash', 'diff'],
  'consent.changed': ['extensionId', 'scope', 'granted'],
  'bridge.handshake': ['extensionId'],
  'tokens.delivered': ['extensionId', 'theme'],
  's2s.token': ['extensionId', 'dir', 'aud', 'exp', 'scope'],
  's2s.pull': ['method', 'result', 'code', 'mock'],
  's2s.push': ['extensionId', 'url', 'status'],
  'catalog.added': ['extensionId', 'status'],
  error: ['code', 'message'],
};

function isErrorClass(e) {
  if (['schema.error', 'scope.denied', 'csp.violation', 'error', 'domain.poll_failed'].includes(e.type)) return true;
  if (e.type === 'build' && e.status === 'failed') return true;
  if (e.type === 'invoke' && e.code) return true;
  return false;
}

function renderEvent(e) {
  const parts = [`\`${e.type}\``];
  for (const f of EVENT_FIELDS[e.type]) {
    if (e[f] === undefined || e[f] === null) continue;
    const v = typeof e[f] === 'object' ? JSON.stringify(e[f]) : e[f];
    parts.push(`${f}=${JSON.stringify(sanitize(v, 160))}`);
  }
  return '- ' + parts.join(' ');
}

function domainPart(root, fs) {
  const dir = path.join(root, '.finamx', 'domain');
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return '';
  }
  names = names
    .filter((n) => !n.startsWith('.') && SAFE_NAME.test(n))
    .sort()
    .filter((n) => {
      const p = path.join(dir, n);
      try {
        return !isSymlink(p, fs) && fs.statSync(p).isDirectory();
      } catch {
        return false;
      }
    })
    .slice(0, MAX_TARGETS);
  const lines = [];
  for (const t of names) {
    const file = path.join(dir, t, 'domain.json');
    let d;
    try {
      if (isSymlink(file, fs)) continue;
      const st = fs.statSync(file);
      if (!st.isFile() || st.size > MAX_DOMAIN_BYTES) continue;
      d = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    if (!d || d.format !== 'finamx.domain.v1' || !d.domain) continue;
    let dropped = 0;
    const ok = (n) => {
      if (typeof n === 'string' && SAFE_NAME.test(n)) return true;
      dropped++;
      return false;
    };
    const matrix = Array.isArray(d.domain.consentMatrix) ? d.domain.consentMatrix : [];
    const methods = [];
    for (const m of Array.isArray(d.domain.methods) ? d.domain.methods : []) {
      if (!m || !ok(m.method)) continue;
      const scope = typeof m.requiredScope === 'string' && SAFE_NAME.test(m.requiredScope) ? ` (scope \`${m.requiredScope}\`)` : '';
      methods.push(`\`${m.method}\`${scope}`);
    }
    const topics = [];
    for (const tp of Array.isArray(d.domain.topics) ? d.domain.topics : []) {
      if (!tp || !ok(tp.topicType)) continue;
      const c = matrix.find((x) => x && x.topicType === tp.topicType);
      // Same words as the SDK context pack: the protocol values are 'public' and 'needsScope'.
      let access = 'not declared (denied)';
      if (c && c.access === 'public') access = 'public';
      else if (c && c.access === 'needsScope') access = typeof c.scope === 'string' && SAFE_NAME.test(c.scope) ? `needsScope \`${c.scope}\`` : 'needsScope';
      topics.push(`\`${tp.topicType}\` (${access})`);
    }
    const kind = d.kind === 'templates' ? 'templates' : 'host';
    const hash = typeof d.domainHash === 'string' ? sanitize(d.domainHash.slice(0, 12), 12) : '?';
    let line = `- target \`${sanitize(t, 128)}\` (${kind}, domainHash \`${hash}\`): methods: ${methods.join(', ') || 'none'}; topics: ${topics.join(', ') || 'none'}`;
    if (dropped) line += `; ${dropped} name(s) dropped (unsafe characters)`;
    line += `. Full context: .finamx/domain/${sanitize(t, 128)}/CONTEXT.md; check freshness with finamx-ext domain pull --check.`;
    lines.push(line);
  }
  return lines.length ? 'Pulled host domains:\n' + lines.join('\n') : '';
}

function eventsPart(root, fs) {
  const file = path.join(root, '.finamx', 'dev-events.ndjson');
  let text;
  try {
    if (isSymlink(file, fs) || !fs.statSync(file).isFile()) return '';
    text = readTail(file, TAIL_BYTES, fs);
  } catch {
    return '';
  }
  const events = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (e && typeof e === 'object' && e.v === 1 && typeof e.type === 'string' && Object.hasOwn(EVENT_FIELDS, e.type)) events.push(e);
    } catch {
      // not JSON
    }
  }
  if (!events.length) return '';
  const newest = events.slice().reverse();
  const errs = newest.filter(isErrorClass).slice(0, MAX_ERROR_EVENTS);
  const others = newest.filter((e) => !errs.includes(e)).slice(0, MAX_EVENTS - errs.length);
  const all = [...errs, ...others];
  return 'Recent dev events (errors first):\n' + all.map(renderEvent).join('\n') + '\nFix guidance: openplatform-ext-init skill, references/dev-events.md.';
}

export function run(input, deps) {
  const { fs, env } = deps;
  const root = projectRoot(input, env);
  if (!isExtensionProject(root, fs)) return '';
  const parts = ['FinamX extension project (openplatform plugin)', DATA_MARKER];
  const d = domainPart(root, fs);
  if (d) parts.push(d);
  const e = eventsPart(root, fs);
  if (e) parts.push(e);
  if (parts.length === 2) return '';
  let out = parts.join('\n\n');
  if (out.length > MAX_TOTAL) out = out.slice(0, MAX_TOTAL - 20) + '\n(truncated)';
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runHook('SessionStart', run);
}
