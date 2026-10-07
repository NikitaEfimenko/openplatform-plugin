#!/usr/bin/env node
// Builds dist/ (index.html + app.js + style.css) and runs the platform checks.
//   node build.mjs           build + checks
//   node build.mjs --watch   rebuild on change (no checks)
import { build, context } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const watch = process.argv.includes('--watch');
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
copyFileSync('index.html', 'dist/index.html');
writeFileSync('dist/style.css', readFileSync('base.css', 'utf8'));

const options = {
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  outfile: 'dist/app.js',
  minify: !watch,
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'info',
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
  execFileSync(process.execPath, ['scripts/finamx/check.mjs'], { stdio: 'inherit' });
}
