#!/usr/bin/env node
// Every `import { … } from '@finamx/…'` in the skills (code and examples in .md) must exist in the published npm
// packages: runtime names are imported for real, type-only names are looked up in the packages' .d.ts files.
//   npm i --no-save @finamx/host-bridge @finamx/extension-sdk @finamx/bridge-protocol react react-dom
//   node scripts/check-imports.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SKILLS = join(ROOT, 'plugins/openplatform/skills');
const walk = d => readdirSync(d, { withFileTypes: true }).flatMap(e => e.name === 'node_modules' ? [] : e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);

const wanted = new Map();
const IMPORT = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"](@finamx\/[a-z-]+(?:\/[a-z0-9-]+)?)['"]/g;
for (const f of walk(SKILLS)) {
  if (!/\.(md|ts|tsx|js|mjs)$/.test(f)) continue;
  for (const m of readFileSync(f, 'utf8').matchAll(IMPORT)) {
    const names = m[1].split(',').map(n => n.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim()).filter(Boolean);
    if (!wanted.has(m[2])) wanted.set(m[2], new Map());
    for (const n of names) wanted.get(m[2]).set(n, f.slice(SKILLS.length + 1));
  }
}

const dtsText = new Map();
function typeDeclared(spec, name) {
  const pkg = spec.split('/').slice(0, 2).join('/');
  if (!dtsText.has(pkg)) {
    const dir = join(ROOT, 'node_modules', pkg, 'dist');
    dtsText.set(pkg, walk(dir).filter(f => f.endsWith('.d.ts')).map(f => readFileSync(f, 'utf8')).join('\n'));
  }
  return new RegExp(`export\\s+(declare\\s+)?(interface|type|class|enum|const|function)\\s+${name}\\b|export\\s+(type\\s+)?\\{[^}]*\\b${name}\\b`).test(dtsText.get(pkg));
}

let bad = 0, total = 0;
for (const [spec, names] of wanted) {
  let mod = null;
  try { mod = await import(spec); } catch (e) { console.log(`✗ ${spec}: not importable (${e.message.split('\n')[0]})`); bad += names.size; continue; }
  for (const [name, file] of names) {
    total++;
    if (name in mod || typeDeclared(spec, name)) continue;
    console.log(`✗ ${spec} has no export ${name} (used in ${file})`);
    bad++;
  }
}
if (bad) { console.log(`${bad} unresolved import(s)`); process.exit(1); }
console.log(`✓ ${total} @finamx imports from ${wanted.size} entry points resolve against the published packages`);
