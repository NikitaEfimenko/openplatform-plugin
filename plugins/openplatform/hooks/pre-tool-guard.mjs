// PreToolUse hook (Bash|Read|Grep): fences the plugin's own subagents off from publishing,
// login and secret files. The main session and other subagents are never blocked.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readStdinJson } from './lib.mjs';

const AGENT = /(^|:)openplatform-(reviewer|dev-watcher)$/;
const REASON = 'openplatform subagents never publish, log in or read secrets; hand this back to the user';
const COMMANDS = [
  /\bfinamx-ext\s+(publish|login|push|link|submit)\b/,
  /\bnpm\s+run\s+publish:ext\b/,
  /\bnpx\s+(@finamx\/extension-sdk|finamx-ext)\s+(publish|login)\b/,
  /(^|[;&|(]\s*|^\s*)(printenv|env)(\s|$)/,
];
const ENV_REF = /(?:^|[\s/='"])(\.env(?:\.[\w-]+)*)(?=$|[\s'"|;&)<>*?[{])/g;
const CRED_REF = /credentials\.json/;

function secretRef(text) {
  if (typeof text !== 'string') return false;
  if (CRED_REF.test(text)) return true;
  for (const m of text.matchAll(ENV_REF)) if (m[1] !== '.env.example') return true;
  return false;
}

export function decide(input) {
  if (!input || typeof input.agent_type !== 'string' || !AGENT.test(input.agent_type)) return null;
  const ti = input.tool_input || {};
  switch (input.tool_name) {
    case 'Bash': {
      const c = ti.command;
      if (typeof c !== 'string') return null;
      if (COMMANDS.some((re) => re.test(c)) || secretRef(c)) return REASON;
      return null;
    }
    case 'Read': {
      const f = ti.file_path;
      if (typeof f !== 'string') return null;
      const base = path.basename(f);
      if (/^\.env(\..+)?$/.test(base) && base !== '.env.example') return REASON;
      if (f.endsWith('credentials.json')) return REASON;
      return null;
    }
    case 'Grep':
      return secretRef(ti.path) || secretRef(ti.glob) ? REASON : null;
    default:
      return null;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const reason = decide(readStdinJson());
    if (reason) {
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }) + '\n');
    }
  } catch {
    // never block on a broken guard
  }
  process.exit(0);
}
