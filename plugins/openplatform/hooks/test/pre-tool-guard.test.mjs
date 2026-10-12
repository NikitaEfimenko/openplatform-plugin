import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide } from '../pre-tool-guard.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const AGENTS = ['openplatform:openplatform-reviewer', 'openplatform-dev-watcher'];
const bash = (agent_type, command) => ({ agent_type, tool_name: 'Bash', tool_input: { command } });

test('guard: the reviewer and dev-watcher subagents are denied finamx-ext publish, login, push, link, submit and npm run publish:ext', () => {
  for (const a of AGENTS) {
    for (const c of ['finamx-ext publish', 'npx finamx-ext login', 'npx @finamx/extension-sdk publish --api x', 'finamx-ext push', 'finamx-ext link', 'finamx-ext submit', 'npm run publish:ext', 'cd x && finamx-ext publish']) {
      assert.ok(decide(bash(a, c)), `${a}: ${c}`);
    }
    assert.equal(decide(bash(a, 'finamx-ext check --json')), null);
    assert.equal(decide(bash(a, 'finamx-ext domain pull --check --json')), null);
  }
});

test('guard: the plugin subagents are denied reading .env files and credentials.json through Bash, Read or Grep; .env.example is allowed', () => {
  for (const a of AGENTS) {
    for (const c of ['cat .env', 'cat ./.env.local', 'cat .env*', 'cat ~/.finamx/credentials.json', 'printenv', 'env', 'a && env | sort']) assert.ok(decide(bash(a, c)), c);
    assert.equal(decide(bash(a, 'cat .env.example')), null);
    assert.equal(decide(bash(a, 'node env.js')), null);
    const read = (f) => decide({ agent_type: a, tool_name: 'Read', tool_input: { file_path: f } });
    assert.ok(read('/p/.env') && read('/p/.env.production') && read('/p/credentials.json'));
    assert.equal(read('/p/.env.example'), null);
    assert.equal(read('/p/src/a.js'), null);
    const grep = (t) => decide({ agent_type: a, tool_name: 'Grep', tool_input: t });
    assert.ok(grep({ pattern: 'x', path: '/p/.env' }) && grep({ pattern: 'x', glob: '**/.env*' }) && grep({ pattern: 'x', glob: 'credentials.json' }));
    assert.equal(grep({ pattern: 'x', path: '/p/src', glob: '*.js' }), null);
  }
});

test('guard: the main session and other subagents are never blocked', () => {
  assert.equal(decide(bash(undefined, 'finamx-ext publish')), null);
  assert.equal(decide(bash('general-purpose', 'cat .env')), null);
  assert.equal(decide(bash('other:not-openplatform-reviewer-x', 'finamx-ext login')), null);
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
