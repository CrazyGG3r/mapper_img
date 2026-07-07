#!/usr/bin/env node
/**
 * Enforces docs/architecture.md's binding package-dependency table
 * (tools/dependency-policy.json) and the "no workspace:* protocol" rule
 * (this repo uses plain npm workspaces, resolved by package name alone --
 * "workspace:*" is a pnpm/yarn-ism npm does not understand). Run via
 * `npm run verify-deps`.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const policy = JSON.parse(readFileSync(path.join(rootDir, 'tools', 'dependency-policy.json'), 'utf8'));

let failed = false;

function checkPackage(pkgJsonPath) {
  const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
  const allowed = policy[pkg.name];
  const deps = { ...(pkg.dependencies ?? {}) };

  for (const [dep, range] of Object.entries(deps)) {
    if (!dep.startsWith('@topview/')) continue;

    if (range === 'workspace:*') {
      console.error(
        `[verify-deps] ${pkg.name} declares "${dep}": "workspace:*" -- use plain "*" (npm workspaces protocol, not pnpm/yarn's).`,
      );
      failed = true;
    }

    if (allowed && !allowed.includes(dep)) {
      console.error(
        `[verify-deps] ${pkg.name} declares disallowed dependency "${dep}" (allowed: ${allowed.join(', ') || 'none'}).`,
      );
      failed = true;
    }
  }
}

for (const group of ['apps', 'packages', 'plugins']) {
  const groupDir = path.join(rootDir, group);
  if (!existsSync(groupDir)) continue;

  for (const entry of readdirSync(groupDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pkgJsonPath = path.join(groupDir, entry.name, 'package.json');
    if (existsSync(pkgJsonPath)) checkPackage(pkgJsonPath);
  }
}

if (failed) {
  console.error('[verify-deps] dependency graph violations found -- see docs/architecture.md.');
  process.exit(1);
}

console.log('[verify-deps] OK -- dependency graph matches tools/dependency-policy.json.');
