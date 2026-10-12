// PreToolUse hook (Read|Grep): a best-effort hint that keeps the plugin's own subagents from opening
// secret files by name. It is NOT the boundary: the subagents are read-only because their tool list is
// Read, Grep, Glob (no shell, no network). A glob such as `.e*` or a search over a whole directory is
// not caught here. The main session and other subagents are never blocked.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readStdinJson } from './lib.mjs';

const AGENT = /(^|:)openplatform-(reviewer|dev-watcher)$/;
const REASON = 'openplatform subagents do not read secret files; if the file is needed, hand this back to the user';
// Example files hold no secrets by convention.
const EXAMPLES = new Set(['.env.example', '.env.sample', '.env.template']);
const SECRET_SEGMENT = /^(\.env[^/\\]*|.*credentials\.json)$/;

/** True when a path or glob names a secret file in any of its segments. */
function secretRef(text) {
  if (typeof text !== 'string' || !text) return false;
  return text.split(/[/\\{},]+/).some((seg) => {
    const s = seg.trim().replace(/^['"]|['"]$/g, '');
    return SECRET_SEGMENT.test(s) && !EXAMPLES.has(s);
  });
}

export function decide(input) {
  if (!input || typeof input.agent_type !== 'string' || !AGENT.test(input.agent_type)) return null;
  const ti = input.tool_input || {};
  switch (input.tool_name) {
    case 'Read': {
      const f = ti.file_path;
      if (typeof f !== 'string') return null;
      return secretRef(path.basename(f)) ? REASON : null;
    }
    case 'Grep':
      // Only where the search runs matters. The pattern is free: the reviewer greps `.gitignore` for `.env`.
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
