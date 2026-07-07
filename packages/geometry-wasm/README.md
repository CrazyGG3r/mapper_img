# `@topview/geometry-wasm`

Perf-critical geometry kernels shared by the pipeline stages and the SVG
editor's snapping engine:

- **`downsamplePointCloud`** — voxel-grid centroid downsampling of a raw
  point cloud, so later stages (and interactive editing) work against a
  bounded number of points regardless of raw reconstruction density.
- **`simplifyPolygon`** — Ramer-Douglas-Peucker polyline/polygon
  simplification, used to clean up recovered wall/room outlines before they
  become editable `AnyEntity` geometry.

Two independent, interchangeable implementations exist:

| Backend | Where | Needs |
|---|---|---|
| wasm-bindgen / Rust | `crate/` | Rust toolchain + `wasm-pack`, built via the **opt-in** `npm run build:wasm` |
| pure JS/TS fallback | `src/fallback.ts` | nothing — always available |

Callers don't need to know which one they got: call `loadGeometryOps()`
from `src/index.ts` and use the returned `GeometryOps`.

## Why this split exists

**This environment does not have a confirmed Rust toolchain.** The rest of
the monorepo — `npm install`, the root `build`/`typecheck`/`lint`/`test`
pipeline, `apps/web`, CI's `node` job — must work correctly whether or not
`cargo`/`wasm-pack` are installed anywhere. Concretely, that means:

- This package's default **`npm run build`** only compiles the TypeScript
  wrapper (`tsc -p tsconfig.json`). It never shells out to `cargo` or
  `wasm-pack`, and never touches `crate/`.
- Nothing in the root `turbo`/npm pipeline invokes `build:wasm`. It is a
  separate, explicitly-named script you (or a future CI job with a
  provisioned Rust toolchain — see `.github/workflows/ci.yml`'s
  best-effort `rust-wasm` job) run by hand.
- At runtime, `loadGeometryOps()` defaults to `mode: 'auto'`: it tries to
  load the compiled wasm module and, if it hasn't been built (or fails to
  load for any reason), transparently falls back to the pure-JS
  implementation with a one-time `console.warn`. The application never
  crashes or hangs just because Rust isn't installed.

In short: **absence of the Rust toolchain is a documented prerequisite gap,
never a scaffold defect** — see `docs/installation.md` and
`docs/troubleshooting.md` at the repo root.

## Usage

```ts
import { loadGeometryOps } from '@topview/geometry-wasm';

// 'auto' (default): wasm if it's been built, pure-JS fallback otherwise.
const ops = await loadGeometryOps();
console.log(ops.backend); // 'wasm' | 'js-fallback'

const thinned = ops.downsamplePointCloud(rawXyzPoints, /* voxelSize */ 0.02);
const cleanOutline = ops.simplifyPolygon(rawXyPolyline, /* epsilon */ 0.01);
```

`loadGeometryOps(options)` also accepts:

- `{ mode: 'wasm' }` — require the wasm backend; rejects with an actionable
  error (pointing back at this README) instead of silently falling back.
  Useful when you specifically want to verify the accelerated path is wired
  up correctly.
- `{ mode: 'js-fallback' }` — always use the pure-JS implementation. This is
  what `npm test` in this package (and any environment/CI job without Rust)
  exercises, since it needs no build step at all.

## Building the wasm backend (optional, opt-in)

Requires a Rust toolchain ([rustup.rs](https://rustup.rs)) and
[`wasm-pack`](https://rustwasm.github.io/wasm-pack/installer/)
(`cargo install wasm-pack`).

```sh
npm run build:wasm -w @topview/geometry-wasm
# or, from this directory:
npm run build:wasm
```

This runs `scripts/build-wasm.mjs`, which:

1. Checks `cargo` and `wasm-pack` are on `PATH`, failing loudly with
   install instructions if not.
2. Shells out to
   `wasm-pack build crate --target web --out-dir wasm --out-name geometry_wasm`.
3. Leaves the compiled output in `wasm/` (git-ignored — see `.gitignore`),
   which `src/index.ts` dynamically imports as `../wasm/geometry_wasm.js`.

If `wasm/` doesn't exist, `loadGeometryOps({ mode: 'auto' | 'wasm' })`
detects the failed dynamic import and either falls back (`'auto'`) or
throws a message pointing back at this section (`'wasm'`).

## Directory layout

```
packages/geometry-wasm/
├── package.json           default "build" = TS wrapper only; "build:wasm" = opt-in Rust build
├── tsconfig.json
├── README.md               (this file)
├── scripts/
│   └── build-wasm.mjs      shells out to wasm-pack; never invoked automatically
├── src/
│   ├── types.ts             GeometryOps / FlatPointCloud / FlatPolyline
│   ├── fallback.ts           pure-JS implementation of both ops
│   ├── fallback.test.ts      vitest coverage for the fallback + loadGeometryOps
│   └── index.ts              loadGeometryOps(): wasm-first, JS-fallback-on-failure
├── crate/                   Rust crate, has no JS/npm dependencies of its own
│   ├── Cargo.toml
│   └── src/lib.rs             wasm-bindgen exports + native #[test]s
├── dist/                    (git-ignored) tsc output, produced by "npm run build"
└── wasm/                    (git-ignored) wasm-pack output, produced by "npm run build:wasm"
```

## Keeping the two implementations in sync

`crate/src/lib.rs` and `src/fallback.ts` implement the *same* algorithms
(voxel-grid downsampling, Ramer-Douglas-Peucker simplification)
independently, so the SVG editor's snap behavior is geometrically
equivalent no matter which backend is active. They are **not** required to
be bit-identical (floating point summation order differs), but any
behavioral change to one should be mirrored in the other. Both sides have
their own unit tests:

- `crate/src/lib.rs`'s `#[cfg(test)] mod tests` runs under plain
  `cargo test` (no `wasm32` target or `wasm-pack` needed — the crate's
  `rlib` crate-type keeps it usable as an ordinary native Rust library for
  this purpose). Exercised by CI's best-effort `rust-wasm` job only.
- `src/fallback.test.ts` runs under `npm test` (vitest) in every
  environment, with no toolchain prerequisite at all.

## Dependency note

Per the monorepo's dependency policy this package depends on
`@topview/schema` (types only). No module in this package currently imports
from it directly — `GeometryOps`'s flat-array types are intentionally
self-contained so this package builds independently of `@topview/schema`'s
exact shape. The dependency is declared to reserve the allowed edge for
future geometry-adjacent shared types (e.g. if pipeline stages need to pass
`@topview/schema` entity geometry through `GeometryOps` directly).
