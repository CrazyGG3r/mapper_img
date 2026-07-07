# Contributing to TopView SVG Mapper

Thanks for your interest in contributing. This document covers the
mechanics of working in this repo; for the "why" behind its structure, read
`docs/architecture.md` first.

## Repository layout

This is an npm-workspaces monorepo (`["apps/*", "packages/*", "plugins/*"]`).
Each package's own `build` script uses TypeScript project references, which
self-order builds by dependency, so root scripts just run `npm run <script>
--workspaces --if-present` -- no separate task runner (Turborepo was tried
and dropped: its native binary segfaulted in this repo's dev environment).
`services/reconstruction-api` (Python) and
`tests/e2e` (Playwright) are intentionally **not** npm workspace members —
they have their own install/run steps. See the root `README.md` for the
full directory map.

## Getting set up

```bash
npm install          # installs every apps/*, packages/*, plugins/* workspace
npm run build        # builds all packages in dependency order
npm run dev           # runs dev tasks (e.g. apps/web's Vite server) in parallel
```

If you're touching `services/reconstruction-api`, follow its own setup in
`docs/installation.md` (Python 3.12+, a virtualenv, `pip install -r
requirements.txt`). If you're touching `tests/e2e`, `cd tests/e2e && npm
install && npx playwright install --with-deps` — never run those from the
repo root.

## Ground rules (please read before opening a PR)

1. **One-directional dependency graph.** `@topview/*` packages may only
   depend on the packages listed for them in `docs/architecture.md` /
   `tools/dependency-policy.json`. `npm run verify-deps` enforces this in
   CI — run it locally before pushing.
2. **Never use `workspace:*`.** Internal `@topview/*` dependencies are
   always declared as the plain range `"*"` in `package.json`. This is a
   deliberate project convention, not an oversight — see
   `docs/troubleshooting.md`.
3. **`services/reconstruction-api` has no `package.json`.** Don't add one —
   it must stay structurally invisible to the npm workspace globs.
4. **Plugins implement `@topview/plugin-sdk`'s contract**, not internal
   APIs of `pipeline-core` or `apps/web`. If you're building a new feature
   detector, start from `plugins/example-detector` and read
   `docs/plugin-development.md`.
5. **Strict TypeScript everywhere.** All packages extend the shared
   `tsconfig.base.json` at the repo root; don't relax its strictness flags
   in a leaf `tsconfig.json` without a strong reason called out in the PR
   description.
6. **No committed binaries** under `data/samples/` — see
   `data/samples/README.md` for the expected (empty-of-binaries) fixture
   shape.

## Before opening a PR

```bash
npm run typecheck
npm run lint
npm test
npm run verify-deps
```

All four must pass. CI (`.github/workflows/ci.yml`) runs these plus the
Playwright e2e suite and a best-effort Python/Rust job (best-effort because
those toolchains are not assumed to be present on every contributor's
machine — see `docs/installation.md`).

## Commit / PR conventions

- Keep commits scoped to one logical change; prefer several small commits
  over one large one.
- Write commit subject lines in the imperative mood ("Add wall-merge
  command", not "Added" or "Adds").
- Reference the relevant `docs/*.md` section in the PR description when a
  change affects architecture, the plugin contract, or the event protocol —
  update that doc in the same PR.
- New packages must be added to `tools/dependency-policy.json` with their
  allowed `@topview/*` dependencies, or `npm run verify-deps` will fail.

## Code of conduct

Be respectful and constructive in reviews and discussion. Assume good
faith; ask questions before assuming a design choice was a mistake.
