# Architecture

TopView SVG Mapper turns a walkthrough video (or an image sequence) of an interior space into
a clean, editable 2D top-down SVG floor plan. A pipeline of Structure-from-Motion (SfM),
point-cloud, and feature-detection stages produces a set of typed "entities" (walls, corners,
doors, windows, furniture, …); an in-browser SVG editor lets a human review, correct, and
export them. The system is designed so that the heavy compute stages can run **locally in the
browser**, **on a self-hosted backend**, or **in the cloud**, without the rest of the
application knowing or caring which.

This document is the map of the monorepo: what each package is for, how packages are allowed
to depend on one another (and how that's enforced), how the pipeline and its events flow
end-to-end, and how the plugin system is discovered and wired up at runtime.

## 1. Monorepo layout

```
topview-svg-mapper/                  (root: turbo, typescript, eslint, prettier, rimraf)
├── apps/
│   └── web/                         @topview/web            — the SPA
├── packages/
│   ├── schema/                      @topview/schema         — shared types + JSON Schema
│   ├── plugin-sdk/                  @topview/plugin-sdk     — plugin author-facing contracts
│   ├── pipeline-core/               @topview/pipeline-core  — stage orchestration, compute backends
│   ├── svg-engine/                  @topview/svg-engine     — SVG serialization/export/import
│   └── geometry-wasm/                @topview/geometry-wasm  — geometry kernels (TS + optional Rust/WASM)
├── plugins/
│   └── example-detector/            @topview/plugin-example-detector — reference plugin
├── services/
│   └── reconstruction-api/          reconstruction_api (Python) — FastAPI backend stub
├── docs/                             (this directory)
├── data/
│   └── samples/                      sample-dataset folder shape, no binaries committed
├── tests/
│   └── e2e/                          topview-e2e — Playwright black-box tests
└── tools/
    └── dependency-policy.json         machine-readable mirror of §2's dependency table
```

## 2. Workspace boundaries

The root `package.json` declares:

```json
{ "workspaces": ["apps/*", "packages/*", "plugins/*"] }
```

Only three directories are npm workspace members: `apps/`, `packages/`, and `plugins/`. This is
deliberate, not incidental:

- **`services/reconstruction-api/` has no `package.json` anywhere in its tree.** It is a Python
  package and is structurally invisible to the workspace globs. Nothing in the root npm scripts
  (`build`, `typecheck`, `lint`, `test`, `verify-deps`) touches it, and `npm install` at the root
  never attempts to resolve it as a Node package.
- **`tests/e2e/` has its own `package.json` but is not matched by any of the three globs.** It is
  intentionally excluded so that installing and running Playwright is a separate, explicit step
  (`cd tests/e2e && npm install && npx playwright install --with-deps`) that never happens as a
  side effect of a root `npm install`. It also must not import anything from `apps/web/src` — it
  drives a *built* web app as a black box over HTTP, the same way a real user would.
- **`docs/` and `data/samples/` carry no code and no `package.json`** — they document and
  describe, respectively, but never participate in the dependency graph.

## 3. The dependency graph (binding)

Internal `@topview/*` packages may only depend on each other along the edges below. Every edge
is declared as a plain `"*"` version range in `package.json#dependencies` — **never**
`workspace:*`. `workspace:*` is a pnpm/Yarn-specific protocol string; this repo uses plain npm
workspaces, where a bare `"*"` range is enough for npm to resolve the sibling workspace package
from the local tree instead of the registry. Introducing `workspace:*` anywhere is a bug, not a
style choice — npm will fail to resolve it. See `troubleshooting.md` for what that failure looks
like.

| Package | npm name | Allowed internal dependencies |
|---|---|---|
| `apps/web` | `@topview/web` | `@topview/schema`, `@topview/plugin-sdk`, `@topview/pipeline-core`, `@topview/svg-engine`, `@topview/geometry-wasm` |
| `packages/schema` | `@topview/schema` | *(none)* |
| `packages/plugin-sdk` | `@topview/plugin-sdk` | `@topview/schema` |
| `packages/pipeline-core` | `@topview/pipeline-core` | `@topview/schema`, `@topview/plugin-sdk`, `@topview/svg-engine` |
| `packages/svg-engine` | `@topview/svg-engine` | `@topview/schema`, `@topview/geometry-wasm` |
| `packages/geometry-wasm` | `@topview/geometry-wasm` | `@topview/schema` (types only; the Rust crate under `crate/` has no JS deps at all) |
| `plugins/example-detector` | `@topview/plugin-example-detector` | `@topview/schema`, `@topview/plugin-sdk` |
| `services/reconstruction-api` | `reconstruction_api` (Python) | *(none from the npm graph — contract is hand-mirrored, see §7)* |
| `tests/e2e` | `topview-e2e` | *(none from the npm graph — drives a built `apps/web` over HTTP)* |

**Why this shape, package by package:**

- `schema` is the graph's root and has zero internal dependencies — every other package needs a
  stable, dependency-free vocabulary of types (`AnyEntity`, `EntityId`, `PipelineStageId`,
  `PipelineEvent`, `ProjectDocument`, …) it can trust never to import *them* back, which is what
  keeps the graph a DAG instead of a tangle.
- `plugin-sdk` depends only on `schema` because a plugin author should be able to write a
  detector against a small, stable surface (`FeatureDetector`, `PluginExecutionContext`,
  `DetectedEntity`) without pulling in orchestration or rendering code.
- `geometry-wasm` depends only on `schema` (for shared numeric/geometry types) — it is a
  low-level, side-effect-free math layer that both the editor's snapping code and `svg-engine`'s
  cleanup passes need identical answers from, so neither is allowed to fork its own copy of the
  math.
- `svg-engine` depends on `schema` (entity types) and `geometry-wasm` (shared geometry kernels)
  so that SVG cleanup/export uses the exact same snapping and geometry math the live editor uses
  — there is exactly one implementation of "what counts as collinear" in the whole system.
- `pipeline-core` depends on `schema`, `plugin-sdk` (it hosts the `PluginRegistry` and invokes
  `FeatureDetector`s through the SDK contract), and `svg-engine` (the final pipeline stages emit
  SVG-shaped output). It does **not** depend on `apps/web` — orchestration must be runnable
  outside a browser (e.g. from `services/reconstruction-api`'s job workers in a later phase,
  see `roadmap.md`).
- `apps/web` is the only consumer allowed to depend on all five packages, because it is the only
  place all five concerns (types, plugins, orchestration, SVG rendering, geometry) come together
  in one running process.
- `services/reconstruction-api` deliberately has **no** edge into the npm graph. It is a
  separate runtime (Python/FastAPI) that mirrors `schema`'s event contract by hand — see §7.
- `tests/e2e` has no edge into the npm graph either, and specifically must never import from
  `apps/web/src`: it validates the built artifact's behavior from the outside, the way a
  deployed instance would be used.

### 3.1 Enforcement

The graph above is not just documentation — it is enforced by `scripts/verify-dependency-graph.mjs`,
run as `npm run verify-deps` (part of the CI `node` job, `.github/workflows/ci.yml`). The script:

1. Reads `tools/dependency-policy.json`, a machine-readable mirror of the table in §3 (shape:
   `{ "@topview/plugin-sdk": ["@topview/schema"], ... }`).
2. Globs every `{apps,packages,plugins}/*/package.json`.
3. For each `@topview/*` entry in that package's `dependencies`, checks it appears in the
   policy's allow-list for that package name.
4. Exits non-zero the moment a disallowed edge is found, printing which package declared which
   forbidden dependency.

Because this runs in CI on every push and pull request, an accidental edge (e.g. `svg-engine`
reaching back into `pipeline-core`) fails the build instead of silently ossifying into a cycle.

## 4. The pipeline: 11 stages

A project moves through eleven ordered stages, each identified by a `PipelineStageId` string
defined in `@topview/schema`:

1. `upload` — ingest a source video or image sequence
2. `frame-extraction` — sample frames from video at a target cadence
3. `feature-detection` — 2D keypoint/feature detection per frame (ORB/SIFT/SuperPoint-class)
4. `camera-reconstruction` — Structure-from-Motion: estimate per-frame camera poses
5. `point-cloud-generation` — dense/semi-dense point cloud from reconstructed cameras
6. `geometry-recovery` — planar surface / primitive extraction from the point cloud
7. `wall-detection` — classify recovered geometry into wall segments and corners
8. `furniture-detection` — detect furniture/fixture entities
9. `layout-generation` — assemble a coherent top-down 2D layout from 3D detections
10. `svg-cleanup` — snap, simplify, and regularize the layout into clean SVG geometry
11. `export` — serialize the final `ProjectDocument`/scene into deliverable formats

Each stage is a boundary the `PipelineRunner` (in `@topview/pipeline-core`) understands
independent of *how* it is computed. Every stage submits a `ComputeJobRequest` (stage id, plugin
id, payload, priority) to a `ComputeBackendHandle`, and gets back a `ComputeJobHandle` it can poll
or subscribe to for progress. Three interchangeable backend implementations satisfy that same
handle contract:

- **`LocalComputeBackend`** — runs the work in-process/in-browser (WebWorkers/WASM), used by
  `computeMode: 'local'`.
- **`HttpComputeBackend`** — submits the job to `services/reconstruction-api`'s
  `POST /stages/{stage}/jobs` and streams `GET /stages/{stage}/jobs/{job_id}/events`, used by
  `computeMode: 'backend'`.
- **`CloudComputeBackend`** — a managed/hosted variant of the same contract, used by
  `computeMode: 'cloud'` (stubbed for v1; see `roadmap.md`).

`apps/web/src/settings/` is where a user picks `computeMode`, and that choice is threaded into
the single `createPipelineRunner()` call that both the web app and (in later phases) any headless
runner use — the orchestration logic itself never branches on compute mode; only the backend
handle it's given differs.

## 5. Event and progress protocol

Every stage — regardless of which `ComputeBackendHandle` executes it — reports progress and
outcome through one discriminated union, `PipelineEvent`, defined once in `@topview/schema` and
consumed via `PipelineRunner.on()`:

- **`StageProgressEvent`** (`type: 'stage:progress'`) — `{ stage, fraction, message?, detail }`,
  emitted as work proceeds (e.g. a detector calling `ctx.reportProgress(0.4, '...')`).
- **`StageLifecycleEvent`** (`type: 'stage:started' | 'stage:completed' | 'stage:skipped'`) —
  `{ stage, reason? }`, the start/end bookends around a stage's execution.
- **`PipelineErrorEvent`** (`type: 'stage:error' | 'pipeline:error'`) — `{ stage?, code,
  message, recoverable, plugin_id? }`, surfaced whenever a stage or the pipeline as a whole
  fails.

`apps/web/src/pipeline-view/` subscribes to this exact channel to render live progress UI, and
`apps/web/src/project/`'s `AutosaveManager` subscribes to the same channel to decide when to
snapshot a `ProjectVersion` (on `stage:completed` and on destructive editor commands — see
`user-guide.md` and the editor section of `apps/web`'s own README-level comments).

`services/reconstruction-api`'s `events.py` defines a **hand-maintained Pydantic mirror** of this
same union (`StageProgressEvent`, `StageLifecycleEvent`, `PipelineErrorEvent` → `PipelineEvent`),
because the browser and the Python backend are different runtimes with no shared type system.
See §7 for how the two are kept from silently drifting apart.

## 6. Plugin registry and discovery

Feature detection is deliberately pluggable: `@topview/pipeline-core` never hard-codes a specific
wall or furniture detector. Instead:

1. A plugin ships a `plugin.manifest.json` (id, `detects` capability list, `configSchema`,
   `entryPoint`, and an SDK compatibility range) alongside compiled JS (`entryPoint`, e.g.
   `./dist/index.js`) that default-exports a factory function returning an instance implementing
   `FeatureDetector` from `@topview/plugin-sdk`.
2. `createPluginRegistry(installedSdkVersion)` (from `@topview/plugin-sdk`) constructs a
   `PluginRegistry` that plugins are registered into. At registration time the registry checks
   the plugin's declared SDK compatibility range against `installedSdkVersion` and refuses to
   register an incompatible plugin rather than loading it and failing later, mid-pipeline.
3. `apps/web/src/plugins-runtime/` is where discovery happens for the web app: it constructs the
   registry, registers `@topview/plugin-example-detector` as a built-in default, registers
   `svg-engine`'s built-in `Exporter` adapters, and hands the populated registry to
   `createPipelineRunner()`.
4. At stage-execution time, `pipeline-core` looks up the registered `FeatureDetector`(s) whose
   `detects` capability matches the stage being run, invokes `detect(request, ctx)`, and folds the
   returned `DetectedEntity[]` into the pipeline's working state. `ctx` (a
   `PluginExecutionContext`) is the plugin's only window into the host: `ctx.reportProgress(...)`
   feeds `StageProgressEvent`s, `ctx.log` feeds structured logging, nothing else is exposed.

`plugins/example-detector` (see `plugin-development.md`) is the literal, complete reference for
this manifest → registration → discovery → invocation flow; every third-party plugin author
starts by copying it.

## 7. Contract-sync strategy: `services/reconstruction-api`

`services/reconstruction-api` is a Python/FastAPI service that will eventually run the compute-
heavy stages for `computeMode: 'backend'`. Because it lives outside the TypeScript project
graph entirely (§2), it cannot import `@topview/schema`'s types directly. Instead:

- `reconstruction_api/events.py` hand-maintains Pydantic models (`StageProgressEvent`,
  `StageLifecycleEvent`, `PipelineErrorEvent`, and the `PipelineEvent` union) that are intended
  to be *shape-compatible* with `@topview/schema`'s TypeScript equivalents.
- `reconstruction_api/jobs/models.py` (`JobSubmitRequest`, `JobHandleResponse`) mirrors the
  `ComputeJobHandle`/`ComputeJobRequest` contract from `@topview/pipeline-core`.
- No mature JSON-Schema-to-Pydantic codegen is assumed for v1 — this is a conscious scope cut,
  not an oversight (real codegen is a `roadmap.md` Phase 2+ item).
- Drift between the two hand-maintained sides is caught, not shipped silently: a CI step loads
  `packages/schema/dist/schema/*.json` (the JSON Schema `@topview/schema` generates at build
  time) and validates fixture payloads produced by the Python models against it using the
  `jsonschema` package. A mismatch fails CI.

This is intentionally the highest-friction part of the system today, and is called out plainly
(not hidden) in `roadmap.md` and `troubleshooting.md`.

## 8. Persistence model

`ProjectDocument` and `ProjectVersion` (defined in `@topview/schema`) are the single on-disk
shape used both for local (IndexedDB) storage in `computeMode: 'local'` and for backend-persisted
storage once `computeMode !== 'local'`. `apps/web/src/project/`'s `AutosaveManager` listens on the
same `PipelineRunner.on()` event channel described in §5 and snapshots a `ProjectVersion` on a
debounce timer, on every `stage:completed`, and on destructive `EditorCommand`s. Past a
configurable version count it stores JSON-Patch diffs against `parentVersionId` instead of full
snapshots, to bound storage growth. See `user-guide.md` for the user-facing version-history
workflow and `performance.md` for the inline-vs-external storage tradeoff this interacts with.

## 9. The editor as commands

The SVG editor (`apps/web/src/svg-editor/`) models every mutation — geometry edits (moving a
vertex, splitting/merging a wall) *and* metadata edits (rejecting a detected entity) — as an
`EditorCommand` pushed onto one `UndoRedoStack`. This is why "reject this detected wall" and
"drag this vertex three pixels" are both exactly as undoable: they're the same kind of object.
Snapping delegates to `@topview/geometry-wasm`'s `GeometryOps` so the editor's snap behavior and
`svg-engine`'s headless cleanup pass share identical math (§3's rationale for that dependency
edge).

## 10. Summary: the six ground rules

Every scaffolding agent working on this repo re-checks these before finishing their part:

1. Internal dependencies are declared as plain `"*"` ranges — never `workspace:*`.
2. Only `apps/*`, `packages/*`, `plugins/*` are npm workspace members.
3. `services/reconstruction-api` has no `package.json` anywhere in its tree.
4. `tests/e2e` has its own `package.json` but is excluded from the workspace globs, and never
   imports from `apps/web/src`.
5. The dependency graph in §3 is binding and machine-enforced by `verify-dependency-graph.mjs`
   against `tools/dependency-policy.json` — don't add an edge the table doesn't list.
6. `docs/` and `data/samples/` carry documentation and fixture *shape* only — no code, no
   committed binaries.
