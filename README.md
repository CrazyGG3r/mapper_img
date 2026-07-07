# TopView SVG Mapper

TopView SVG Mapper turns a walkthrough video of an indoor space into an
editable, top-down 2D SVG floor plan. A video is decomposed into frames,
run through a plugin-extensible feature-detection pipeline (camera pose,
point cloud, walls, furniture, layout), and the result is cleaned up in an
in-browser SVG editor and exported.

## Architecture at a glance

This is a plain npm-workspaces monorepo -- each package's own `build` script
uses TypeScript project references, which self-order builds by dependency, so
no separate task runner is needed on top (Turborepo was tried and dropped:
its native binary segfaulted in this repo's dev environment).
The dependency graph between packages is intentionally one-directional and
enforced in CI (`npm run verify-deps`) — see `docs/architecture.md` for the
full rationale.

```
apps/web                      SPA: upload, pipeline progress, viewers, SVG editor
packages/schema                shared TypeScript types + generated JSON Schema
packages/plugin-sdk             the contract third-party feature detectors implement
packages/pipeline-core           stage orchestration, event/progress protocol
packages/svg-engine               SVG scene graph, editing primitives, exporters
packages/geometry-wasm              geometry kernels (optional Rust/WASM acceleration)
plugins/example-detector      reference FeatureDetector plugin (wall/corner heuristic)
services/reconstruction-api   optional FastAPI backend for offloaded/cloud compute
tests/e2e                     Playwright black-box tests against a built apps/web
data/samples                  sample-dataset fixtures (no binaries committed)
docs/                         architecture, plugin dev, deployment, roadmap, etc.
```

Everything under `apps/*`, `packages/*`, and `plugins/*` is an npm workspace
member. `services/reconstruction-api` (Python/FastAPI) and `tests/e2e`
(Playwright) are deliberately **outside** the npm workspace globs — they're
independent toolchains with their own install steps. Internal
`@topview/*` dependencies are always declared as the plain range `"*"`,
never `workspace:*`.

## Prerequisites

- **Node.js 20+** and npm — required for everything in `apps/*`,
  `packages/*`, and `plugins/*`.
- **Python 3.12+** — only needed if you're working on
  `services/reconstruction-api`. The rest of the repo builds, type-checks,
  lints, and tests without it.
- **Rust + `wasm-pack`** — only needed for `packages/geometry-wasm`'s
  accelerated build (`build:wasm`); a pure-TypeScript fallback implementation
  is used otherwise.

See `docs/installation.md` for the precise breakdown of what's optional and
what breaks without it.

## Quickstart

```bash
# install all JS/TS workspace dependencies (single root install)
npm install

# run every package's dev task in parallel (e.g. apps/web's Vite dev server)
npm run dev

# build every workspace package, respecting the dependency graph
npm run build

# type-check, lint, and test everything
npm run typecheck
npm run lint
npm test

# enforce the allowed @topview/* dependency graph (also runs in CI)
npm run verify-deps
```

`services/reconstruction-api` and `tests/e2e` have their own install/run
steps documented in `docs/installation.md` and `tests/e2e/README` — they are
never touched by the root `npm install`.

## Documentation

Start in [`docs/architecture.md`](docs/architecture.md) for the system
design, then:

- [`docs/installation.md`](docs/installation.md) — full setup, including
  optional Python/Rust toolchains
- [`docs/plugin-development.md`](docs/plugin-development.md) — build a
  feature-detector plugin, walked through using `plugins/example-detector`
- [`docs/configuration.md`](docs/configuration.md) — root npm scripts,
  `tsconfig.base.json`, compute modes, environment variables
- [`docs/api.md`](docs/api.md) — public package exports and the REST/SSE
  surface of `services/reconstruction-api`
- [`docs/deployment.md`](docs/deployment.md) — hosting `apps/web` and the
  reconstruction API
- [`docs/user-guide.md`](docs/user-guide.md) — end-to-end usage walkthrough
- [`docs/troubleshooting.md`](docs/troubleshooting.md) /
  [`docs/performance.md`](docs/performance.md) /
  [`docs/roadmap.md`](docs/roadmap.md)

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

[MIT](LICENSE)
