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
  assert.equal(table.sdk, 'latest');
  assert.equal(cli('--version').trim(), sdk.version);
  for (const [command, flags] of Object.entries(table.commands)) {
    const spec = COMMAND_FLAGS[command];
    if (!spec && table.pendingCommands?.includes(command)) {
      console.log(`Pending release: ${command} is not yet available in npm latest (${sdk.version}); follow the documented upgrade dependency.`);
      continue;
    }
    assert.ok(spec, `documented command ${command} must exist in npm latest`);
    const installedFlags = new Set([...spec.values, ...spec.booleans, ...spec.optionalValues]);
    for (const flag of flags) assert.ok(installedFlags.has(flag), `${command}: documented flag ${flag} must exist in npm latest`);
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
