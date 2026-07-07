#!/usr/bin/env node
/**
 * Builds the Rust/wasm-bindgen crate in `crate/` into a wasm-bindgen
 * "web"-target JS+wasm bundle under `wasm/`, which `src/index.ts` loads at
 * runtime via a dynamic import.
 *
 * IMPORTANT: this script is intentionally NOT part of this package's
 * default "build" script (see package.json) and is not wired into any
 * root/turbo pipeline task. This environment has no confirmed Rust/
 * wasm-pack toolchain, so nothing in the default `npm install` / `npm run
 * build` / `npm test` path may depend on it. Run it manually, opt-in:
 *
 *   npm run build:wasm -w @topview/geometry-wasm
 *   # or, from this package directory:
 *   npm run build:wasm
 *
 * It fails loudly (non-zero exit, actionable message) if `cargo` or
 * `wasm-pack` are missing, rather than silently no-opping -- but because
 * nothing else invokes it automatically, its absence never breaks anything
 * outside of this opt-in step. See ../README.md for the full story.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const crateDir = path.join(packageRoot, 'crate');
const outDir = path.join(packageRoot, 'wasm');

function commandExists(cmd) {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(probe, [cmd], { stdio: 'ignore' });
  return result.status === 0;
}

function fail(message) {
  console.error(`\n[build:wasm] ${message}\n`);
  process.exit(1);
}

if (!commandExists('cargo')) {
  fail(
    'Rust toolchain not found (no `cargo` on PATH). Install Rust via ' +
      'https://rustup.rs, then re-run `npm run build:wasm`. This failure is ' +
      'expected in environments without a confirmed Rust toolchain -- ' +
      'nothing else in the monorepo depends on this step succeeding.',
  );
}

if (!commandExists('wasm-pack')) {
  fail(
    '`wasm-pack` not found on PATH. Install it with `cargo install ' +
      'wasm-pack` (or see https://rustwasm.github.io/wasm-pack/installer/), ' +
      'then re-run `npm run build:wasm`.',
  );
}

if (!existsSync(crateDir)) {
  fail(`Expected Rust crate at ${crateDir}, but it does not exist.`);
}

console.log(`[build:wasm] building ${crateDir}`);
console.log(`[build:wasm]   target:  web`);
console.log(`[build:wasm]   out-dir: ${outDir}`);

const result = spawnSync(
  'wasm-pack',
  ['build', crateDir, '--target', 'web', '--out-dir', outDir, '--out-name', 'geometry_wasm'],
  { stdio: 'inherit' },
);

if (result.error) {
  fail(`failed to spawn wasm-pack: ${result.error.message}`);
}

if (result.status !== 0) {
  fail('wasm-pack build failed -- see output above.');
}

console.log(`\n[build:wasm] done. Output written to ${outDir}`);
console.log('[build:wasm] src/index.ts (loadGeometryOps) will now use the wasm backend.');
