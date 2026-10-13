// PostToolUse hook (Write|Edit|MultiEdit): ADVISORY ONLY. When an edit touched a FinamX extension project
// it prints one line that tells the agent to run `finamx-ext check --json`. It starts no process and runs
// nothing from the project: the agent runs the check itself, under the normal permission prompts.
import nodeFs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { SAFE_NAME, hasSurfacesManifest, isSymlink, projectRoot, runHook } from './lib.mjs';

const EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.css', '.html', '.json']);
const SKIP_SEGMENTS = new Set(['node_modules', 'dist', '.git', '.finamx']);
const MAX_WALK_UP = 12;
const MAX_HOSTS = 3;
/** One note per project and session in this window, so a burst of edits is not answered line by line. */
export const DEBOUNCE_MS = 120000;

function real(p, fs) {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

function inside(root, p) {
  const rel = path.relative(root, p);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** Nearest directory at or above the file, not above the boundary and at most MAX_WALK_UP levels up, that holds an extension manifest. */
function findProjectDir(file, boundary, fs) {
  let dir = path.dirname(file);
  for (let i = 0; i <= MAX_WALK_UP; i++) {
    if (dir !== boundary && !inside(boundary, dir)) return null;
    if (hasSurfacesManifest(dir, fs)) return dir;
    if (dir === boundary) return null;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
  return null;
}

/** Names of pulled host domains (not the general templates), read from directory names only. */
function pulledHosts(projectDir, fs) {
  const dir = path.join(projectDir, '.finamx', 'domain');
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((n) => n !== 'templates' && !n.startsWith('.') && SAFE_NAME.test(n) && !/[/`]/.test(n))
    .sort()
    .filter((n) => {
      const p = path.join(dir, n);
      try {
        return !isSymlink(p, fs) && fs.statSync(p).isDirectory();
      } catch {
        return false;
      }
    });
}

/** True when a note for this project and session was printed less than DEBOUNCE_MS ago. Any doubt means "not yet". */
function notedRecently(key, { fs, stateDir, now }) {
  try {
    if (isSymlink(stateDir, fs)) return false;
    fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    const file = path.join(stateDir, key);
    let last = 0;
    try {
      const st = fs.lstatSync(file);
      if (!st.isFile()) return false;
      last = st.mtimeMs;
    } catch {
      // first note
    }
    if (last && now - last >= 0 && now - last < DEBOUNCE_MS) return true;
    fs.writeFileSync(file, '', { mode: 0o600 });
    fs.utimesSync(file, new Date(now), new Date(now));
    return false;
  } catch {
    return false;
  }
}

export function run(input, deps) {
  const { fs, env } = deps;
  const fp = input && input.tool_input && input.tool_input.file_path;
  if (typeof fp !== 'string' || !fp) return '';
  const rootRaw = projectRoot(input, env);
  if (!rootRaw) return '';
  // Real paths on both sides: a symlinked project root (or /tmp vs /private/tmp) must not hide the edit.
  const boundary = real(path.resolve(rootRaw), fs);
  const absRaw = path.resolve(input.cwd || rootRaw, fp);
  const abs = path.join(real(path.dirname(absRaw), fs), path.basename(absRaw));
  if (!inside(boundary, abs)) return '';
  if (!EXTENSIONS.has(path.extname(abs).toLowerCase())) return '';
  if (path.relative(boundary, abs).split(path.sep).some((s) => SKIP_SEGMENTS.has(s))) return '';
  const projectDir = findProjectDir(abs, boundary, fs);
  if (!projectDir) return '';
  const session = typeof input.session_id === 'string' ? input.session_id : '';
  const key = createHash('sha256').update(session + '\0' + projectDir).digest('hex').slice(0, 32);
  const stateDir = deps.stateDir || path.join(os.tmpdir(), 'finamx-openplatform-hooks');
  const now = typeof deps.now === 'number' ? deps.now : Date.now();
  if (notedRecently(key, { fs, stateDir, now })) return '';
  const hosts = pulledHosts(projectDir, fs);
  let note = 'FinamX extension project edited: run `finamx-ext check --json` and fix every entry of `errors` before going on';
  if (hosts.length) {
    const shown = hosts.slice(0, MAX_HOSTS).map((h) => '`' + h + '`').join(', ');
    const more = hosts.length > MAX_HOSTS ? ` and ${hosts.length - MAX_HOSTS} more` : '';
    note += `; after a manifest, scope or topic change also \`finamx-ext check --host <hostId> --json\` (pulled: ${shown}${more})`;
  }
  return note + '. This hook ran nothing.';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runHook('PostToolUse', (input, base) => run(input, base));
}
