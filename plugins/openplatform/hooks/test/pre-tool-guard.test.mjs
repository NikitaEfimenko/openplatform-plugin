import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide } from '../pre-tool-guard.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const AGENTS = ['openplatform:openplatform-reviewer', 'openplatform-dev-watcher'];
const bash = (agent_type, command) => ({ agent_type, tool_name: 'Bash', tool_input: { command } });

const read = (agent_type, file_path) => decide({ agent_type, tool_name: 'Read', tool_input: { file_path } });
const grep = (agent_type, tool_input) => decide({ agent_type, tool_name: 'Grep', tool_input });

test('agents: the reviewer and the dev-watcher have exactly the tools Read, Grep, Glob (no shell, no edit, no network)', () => {
  for (const a of ['openplatform-reviewer', 'openplatform-dev-watcher']) {
    const text = fs.readFileSync(path.join(here, '..', '..', 'agents', a + '.md'), 'utf8');
    const fm = /^---\n([\s\S]*?)\n---\n/.exec(text)[1];
    const tools = /^tools:\s*(.*)$/m.exec(fm)[1].split(',').map((t) => t.trim()).sort();
    assert.deepEqual(tools, ['Glob', 'Grep', 'Read'], a);
    assert.match(fm, /no shell, no network/);
    assert.ok(!/npx|node_modules\/\.bin/.test(text), a + ' must not tell the agent how to start the CLI');
  }
});

test('guard: the plugin subagents are stopped from reading .env files and credentials.json through Read or Grep; example files are allowed', () => {
  for (const a of AGENTS) {
    for (const f of ['/p/.env', '/p/.env.production', '/p/.envrc', '/p/credentials.json', '/h/.config/finamx/credentials.json', '.env']) assert.ok(read(a, f), f);
    for (const f of ['/p/.env.example', '/p/.env.sample', '/p/src/a.js', '/p/src/env.js', '/p/manifest.json']) assert.equal(read(a, f), null, f);
    for (const t of [{ pattern: 'x', path: '/p/.env' }, { pattern: 'x', glob: '**/.env*' }, { pattern: 'x', glob: 'credentials.json' }, { pattern: 'x', glob: '{src/**,.env.local}' }]) {
      assert.ok(grep(a, t), JSON.stringify(t));
    }
    assert.equal(grep(a, { pattern: 'x', path: '/p/src', glob: '*.js' }), null);
    assert.equal(grep(a, { pattern: 'x', glob: '.env.example' }), null);
  }
});

test('guard: the reviewer can do its own checklist step, reading .gitignore and searching it for .env', () => {
  for (const a of AGENTS) {
    assert.equal(read(a, '/p/.gitignore'), null);
    assert.equal(grep(a, { pattern: '\\.env', path: '/p/.gitignore' }), null);
    assert.equal(grep(a, { pattern: '^\\.env$', path: '.gitignore' }), null);
    assert.equal(grep(a, { pattern: 'FINAMX_DEV_TOKEN|\\.env', path: '/p/dist' }), null);
  }
});

test('guard: it is a hint for Read and Grep only; Bash and other tools are not its business (the agents have no Bash)', () => {
  for (const a of AGENTS) {
    assert.equal(decide(bash(a, 'cat .env')), null);
    assert.equal(decide({ agent_type: a, tool_name: 'Glob', tool_input: { pattern: '.env*' } }), null);
  }
  const cfg = JSON.parse(fs.readFileSync(path.join(here, '..', 'hooks.json'), 'utf8'));
  assert.deepEqual(cfg.hooks.PreToolUse.map((g) => g.matcher), ['Read|Grep']);
});

test('guard: the main session and other subagents are never blocked', () => {
  assert.equal(read(undefined, '/p/.env'), null);
  assert.equal(read('general-purpose', '/p/.env'), null);
  assert.equal(read('other:not-openplatform-reviewer-x', '/p/credentials.json'), null);
  assert.equal(decide({}), null);
});

test('hooks.json: valid JSON, registers SessionStart, PostToolUse and PreToolUse, every command runs node on a script under ${CLAUDE_PLUGIN_ROOT}/hooks that exists', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(here, '..', 'hooks.json'), 'utf8'));
  for (const ev of ['SessionStart', 'PostToolUse', 'PreToolUse']) assert.ok(Array.isArray(cfg.hooks[ev]) && cfg.hooks[ev].length, ev);
  let n = 0;
  for (const groups of Object.values(cfg.hooks)) {
    for (const g of groups) {
      for (const h of g.hooks) {
        n++;
        assert.equal(h.type, 'command');
        const script = h.args ? (assert.equal(h.command, 'node'), h.args[0]) : /^node "([^"]+)"$/.exec(h.command)[1];
        const m = /^\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/([a-z-]+\.mjs)$/.exec(script);
        assert.ok(m, script);
        assert.ok(fs.existsSync(path.join(here, '..', m[1])));
        assert.ok(h.timeout > 0);
      }
    }
  }
  assert.equal(n, 3);
});
