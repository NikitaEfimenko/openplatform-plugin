// PostToolUse hook (Write|Edit|MultiEdit): runs the project's own `finamx-ext check --json` and
// returns its errors to the agent. Silent when the check is clean or nothing applies.
import nodeFs from 'node:fs';
import { execFile as nodeExecFile } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { hasExtensionManifest, projectRoot, runHook, sanitize } from './lib.mjs';

const EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.css', '.html', '.json']);
const SKIP_SEGMENTS = new Set(['node_modules', 'dist', '.git', '.finamx']);
const SECRET_NAME = /TOKEN|SECRET|PASSWORD|KEY/i;
const MAX_ERRORS = 20;
const MAX_TOTAL = 6000;

export function scrubEnv(source) {
  const out = { ...source };
  for (const name of Object.keys(out)) {
    if (name.startsWith('FINAMX_') || SECRET_NAME.test(name)) delete out[name];
  }
  return out;
}

function inside(root, p) {
  const rel = path.relative(root, p);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function findProjectDir(file, boundary, fs) {
  let dir = path.dirname(file);
  while (inside(boundary, path.join(dir, 'x'))) {
    if (hasExtensionManifest(dir, fs)) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return hasExtensionManifest(boundary, fs) && file.startsWith(boundary) ? boundary : null;
}

function formatEntry(x) {
  if (typeof x === 'string') return sanitize(x, 300);
  if (x && typeof x === 'object') return sanitize([x.file, x.code, x.message].filter((v) => typeof v === 'string').join(' '), 300);
  return sanitize(String(x), 300);
}

export async function run(input, deps) {
  const { fs, execFile, env } = deps;
  const execPath = deps.execPath || process.execPath;
  const fp = input && input.tool_input && input.tool_input.file_path;
  if (typeof fp !== 'string' || !fp) return '';
  const boundary = projectRoot(input, env);
  if (!boundary) return '';
  const abs = path.resolve(input.cwd || boundary, fp);
  if (!inside(path.resolve(boundary), abs)) return '';
  if (!EXTENSIONS.has(path.extname(abs).toLowerCase())) return '';
  const projectDir = findProjectDir(abs, path.resolve(boundary), fs);
  if (!projectDir) return '';
  const rel = path.relative(projectDir, abs);
  if (abs.split(path.sep).includes('node_modules')) return '';
  if (rel.split(path.sep).some((s) => SKIP_SEGMENTS.has(s))) return '';
  if (path.relative(path.resolve(boundary), abs).split(path.sep).some((s) => SKIP_SEGMENTS.has(s))) return '';
  const cli = path.join(projectDir, 'node_modules', '@finamx', 'extension-sdk', 'dist', 'cli', 'index.js');
  try {
    if (!fs.statSync(cli).isFile()) return '';
  } catch {
    return '';
  }
  const { stdout, stderr } = await new Promise((resolve) => {
    execFile(
      execPath,
      [cli, 'check', '--json'],
      { cwd: projectDir, timeout: 60000, maxBuffer: 1048576, windowsHide: true, shell: false, env: scrubEnv(env) },
      (_err, out, errOut) => resolve({ stdout: String(out || ''), stderr: String(errOut || '') }),
    );
  });
  let report;
  try {
    report = JSON.parse(stdout);
  } catch {
    report = null;
  }
  const relOut = sanitize(rel.split(path.sep).join('/'), 200);
  if (!report || typeof report !== 'object' || !Array.isArray(report.errors)) {
    return 'finamx-ext check did not return JSON: ' + sanitize(stderr, 300);
  }
  if (report.errors.length === 0) return '';
  const errors = report.errors.slice(0, MAX_ERRORS).map((e) => '- ' + formatEntry(e));
  const lines = [`finamx-ext check --json found ${report.errors.length} error(s) after editing ${relOut}:`, ...errors];
  if (report.errors.length > MAX_ERRORS) lines.push(`(${report.errors.length - MAX_ERRORS} more not shown)`);
  const warnN = Array.isArray(report.warnings) ? report.warnings.length : 0;
  if (warnN) lines.push(`${warnN} warning(s)`);
  if (report.errors.some((e) => /dist/.test(formatEntry(e)))) lines.push('Hint: run npm run build, then the check runs on the new bundle.');
  let out = lines.join('\n');
  if (out.length > MAX_TOTAL) out = out.slice(0, MAX_TOTAL - 20) + '\n(truncated)';
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runHook('PostToolUse', (input, base) => run(input, { ...base, execFile: nodeExecFile, execPath: process.execPath }));
}
