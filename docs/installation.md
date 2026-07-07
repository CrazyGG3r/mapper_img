# Installation

## 1. What you need (required)

- **Node.js 25 or newer.** The CI matrix pins `actions/setup-node@v4` to `node-version: '25'`;
  match that locally to avoid version-skew surprises.
- **npm** (ships with Node). This repo uses plain npm workspaces — no pnpm, no Yarn.

That's it for the entire JS/TypeScript graph: `apps/web` and every package under `packages/` and
`plugins/`.

## 2. What you don't need yet (optional)

- **Python 3.12** — only required to run or test `services/reconstruction-api`. It has no
  `package.json` and is not part of the npm workspace graph (see `architecture.md` §2), so its
  absence has **zero** effect on `npm install`, `npm run build`, `npm run typecheck`, `npm run
  lint`, or `npm test` at the root.
- **Rust + `cargo`** — only required for `packages/geometry-wasm`'s accelerated native/WASM code
  path (the `crate/` directory). The package ships a pure-TypeScript implementation of the same
  `GeometryOps` surface that works with zero native toolchain; Rust only unlocks the optimized
  `build:wasm` path described in `performance.md`.

If neither is installed on your machine right now, that is an expected, documented state — not a
scaffold defect. `services/reconstruction-api` simply cannot be run or tested locally until
Python is installed, and `geometry-wasm` will use its TypeScript fallback until Rust is
installed. CI provisions both independently (`actions/setup-python@v5`, and a `command -v cargo`
guard) so the absence of either on a contributor's machine never blocks the Node-only path in CI
or locally.

## 3. Install (JS/TS graph)

From the repo root:

```bash
npm install
```

This resolves every workspace under `apps/*`, `packages/*`, and `plugins/*` in one pass. Internal
`@topview/*` cross-dependencies are declared as plain `"*"` ranges, which npm workspaces resolves
straight to the local sibling package on disk — no publishing step, no `workspace:*` protocol
string (npm does not understand `workspace:*`; see `troubleshooting.md` if you ever see a
resolution error mentioning it).

Do **not** run `npm install` inside individual `apps/*`/`packages/*`/`plugins/*` directories —
always install from the root so the workspace hoisting and cross-linking behaves correctly.

## 4. Common root scripts

Run from the repo root (plain `npm --workspaces`; each package's `build` uses
TypeScript project references, which self-order builds by dependency, so no
separate task runner is needed):

```bash
npm run build        # builds every workspace package, respecting the dependency graph's order
npm run typecheck    # tsc --noEmit across every workspace package
npm run lint         # eslint across every workspace package
npm test             # vitest (or package-local test runner) across every workspace package
npm run verify-deps  # runs scripts/verify-dependency-graph.mjs — see architecture.md §3.1
```

(Turborepo was evaluated and dropped: its native binary segfaulted with an
illegal-instruction error in this repo's dev environment. Plain npm-workspaces
scripts have no caching, so `npm run build` always rebuilds everything --
acceptable at this repo's current size.)

## 5. Optional: `services/reconstruction-api` (Python)

Only needed if you intend to run the FastAPI backend stub locally (e.g. to exercise
`computeMode: 'backend'` against a real server instead of just reading the stub source).

```bash
cd services/reconstruction-api
python -m pip install -r requirements.txt
uvicorn reconstruction_api.main:app --reload
```

Or via Docker, which sidesteps needing Python installed on the host at all:

```bash
cd services/reconstruction-api
docker build -t topview-reconstruction-api .
docker run -p 8000:8000 topview-reconstruction-api
```

Verify it came up with:

```bash
curl http://localhost:8000/healthz
# {"status":"ok"}
```

See `api.md` for the endpoint surface and `deployment.md` for running it alongside `apps/web`.

## 6. Optional: `packages/geometry-wasm` accelerated build

Only needed if you want the native/WASM-accelerated geometry kernels instead of the default
TypeScript implementation.

```bash
# requires a working Rust toolchain (rustup, cargo)
cd packages/geometry-wasm
npm run build:wasm
```

If `cargo` is not on your `PATH`, skip this — every consumer of `@topview/geometry-wasm` works
correctly (just slower on very large geometry sets) against the TypeScript fallback. See
`performance.md` for when it's worth investing in this build.

## 7. Optional: end-to-end tests (`tests/e2e`)

`tests/e2e` is intentionally **not** an npm workspace member, so it is never installed as a side
effect of the root `npm install`. Install and run it explicitly:

```bash
cd tests/e2e
npm install
npx playwright install --with-deps
npm test
```

This drives a *built* `apps/web` (dev server or `vite preview`) as a black box over HTTP, so run
`npm run build` (or `npm run dev` in `apps/web`) first — see `deployment.md`.

## 8. Sanity-check the install

```bash
npm run build && npm run typecheck && npm run lint && npm test && npm run verify-deps
```

If all five pass, your JS/TS install is healthy. Python and Rust remain optional and are
independently verifiable per §5/§6 above.
