import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const packageFile = require.resolve('@finamx/extension-sdk/package.json');
const sdk = JSON.parse(readFileSync(packageFile, 'utf8'));
const table = JSON.parse(readFileSync(new URL('./finamx-ext-cli.json', import.meta.url), 'utf8'));
const { COMMAND_FLAGS } = await import(pathToFileURL(join(dirname(packageFile), 'dist/cli/args.js')));
const bin = join(dirname(packageFile), sdk.bin['finamx-ext']);

const cwd = mkdtempSync(join(tmpdir(), 'finamx-plugin-cli-'));
try {
  // Keep developer credentials out of the smoke test.
  const env = { PATH: process.env.PATH, HOME: cwd, USERPROFILE: cwd };
  const cli = (...args) => execFileSync(process.execPath, [bin, ...args], { cwd, env, encoding: 'utf8' });
  assert.equal(cli('--version').trim(), table.sdk);
  assert.deepEqual(Object.keys(COMMAND_FLAGS).sort(), Object.keys(table.commands).sort());
  for (const [command, flags] of Object.entries(table.commands)) {
    const spec = COMMAND_FLAGS[command];
    assert.deepEqual([...spec.values, ...spec.booleans, ...spec.optionalValues].sort(), [...flags].sort(), command);
    assert.match(cli(command, '--help'), new RegExp(`finamx-ext ${command}\\b`));
  }

  cli('init', 'smoke-widget', '--yes');
  const manifest = JSON.parse(readFileSync(join(cwd, 'smoke-widget/manifest.json'), 'utf8'));
  assert.equal(manifest.extensionId, 'com.example.smoke-widget');
  const dryRun = cli('publish', '--dry-run', '--manifest',
    new URL('../plugins/openplatform/skills/openplatform-ext-init/examples/holdings-manifest.json', import.meta.url).pathname);
  assert.match(dryRun, /--dry-run: would send this last version/);
  console.log(`✓ SDK ${sdk.version}: ${Object.keys(COMMAND_FLAGS).length} CLI commands, scaffold and headless publish dry-run`);
} finally {
  rmSync(cwd, { recursive: true, force: true });
}
