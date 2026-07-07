#!/usr/bin/env node
// packages/schema/scripts/copy-schemas.mjs
//
// Copies the hand-authored JSON Schema documents in src/schemas/ into
// dist/schema/ after `tsc` has emitted the compiled JS/d.ts (see the
// "build" script in package.json). This is the documented contract-sync
// mechanism referenced by docs/architecture.md §7:
// `services/reconstruction-api`'s CI step loads
// `packages/schema/dist/schema/*.json` and validates fixture payloads
// produced by its hand-maintained Pydantic models against it (via the
// `jsonschema` package), so drift between the TypeScript types and the
// Python mirror fails CI instead of shipping silently.
//
// These schemas are currently hand-maintained alongside the TypeScript
// source in src/schemas/ rather than derived from the types via a
// generator (e.g. ts-json-schema-generator) -- see docs/roadmap.md for the
// planned move to generated JSON Schema once the type surface stabilizes.
import { cpSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, '..', 'src', 'schemas');
const outDir = join(here, '..', 'dist', 'schema');

mkdirSync(outDir, { recursive: true });
cpSync(srcDir, outDir, { recursive: true });

console.log(`[copy-schemas] copied ${srcDir} -> ${outDir}`);
