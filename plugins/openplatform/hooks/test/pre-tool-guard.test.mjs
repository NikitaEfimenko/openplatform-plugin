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

test('hooks.json: top-level "hooks", three events, every hook is the documented shell form node "${CLAUDE_PLUGIN_ROOT}/hooks/<file>.mjs" with a timeout in seconds and no args', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(here, '..', 'hooks.json'), 'utf8'));
  assert.deepEqual(Object.keys(cfg), ['hooks']);
  assert.deepEqual(Object.keys(cfg.hooks).sort(), ['PostToolUse', 'PreToolUse', 'SessionStart']);
  const seen = [];
  for (const [ev, groups] of Object.entries(cfg.hooks)) {
    assert.ok(Array.isArray(groups) && groups.length, ev);
    for (const g of groups) {
      assert.equal(typeof g.matcher, 'string');
      for (const h of g.hooks) {
        assert.deepEqual(Object.keys(h).sort(), ['command', 'timeout', 'type'], 'no exec-form args: ' + JSON.stringify(h));
        assert.equal(h.type, 'command');
        const m = /^node "\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/([a-z-]+\.mjs)"$/.exec(h.command);
        assert.ok(m, h.command);
        assert.ok(fs.existsSync(path.join(here, '..', m[1])), m[1]);
        // seconds, not milliseconds
        assert.ok(Number.isInteger(h.timeout) && h.timeout >= 1 && h.timeout <= 60, String(h.timeout));
        seen.push(`${ev}:${m[1]}`);
      }
    }
  }
  assert.deepEqual(seen.sort(), ['PostToolUse:post-edit-check.mjs', 'PreToolUse:pre-tool-guard.mjs', 'SessionStart:session-start.mjs']);
});
