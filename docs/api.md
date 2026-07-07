# API Reference

This document has two parts: the public exports of each `@topview/*` package (the TypeScript
contracts other packages and plugin authors code against), and the REST/SSE surface of
`services/reconstruction-api`.

## 1. `@topview/schema`

The dependency-free root of the graph. Everything else imports types from here.

- **Entities**: `EntityId`, `AnyEntity`, `DetectedEntity` (adds `confidence`, `validationStatus:
  'unreviewed' | 'user-accepted' | 'user-rejected' | ...`, `sourcePluginId`), plus concrete
  entity shapes (walls, corners, doors, windows, furniture items).
- **Pipeline**: `PipelineStageId` (the 11-stage string union — see `architecture.md` §4),
  `PipelineEvent` (discriminated union of `StageProgressEvent`, `StageLifecycleEvent`,
  `PipelineErrorEvent`), `PipelineErrorCode`.
- **Persistence**: `ProjectDocument`, `ProjectVersion` (`id`, `parentVersionId`, `snapshotRef`,
  `createdAt`, …).
- **Point cloud / geometry primitives**: shared numeric/geometry types consumed by
  `geometry-wasm` and `svg-engine`.
- **Build output**: `dist/schema/*.json` — JSON Schema generated from the TypeScript types, used
  by `services/reconstruction-api`'s CI contract-sync check (see `architecture.md` §7).

## 2. `@topview/plugin-sdk`

The plugin-author-facing surface. Depends only on `@topview/schema`.

- `FeatureDetector<TConfig>` — the interface every detector plugin implements:
  - `readonly manifestId: string`
  - `readonly detects: readonly string[]` (capability tags, e.g. `['wall', 'corner']`)
  - `configure(config: TConfig): void`
  - `detect(request: FeatureDetectionRequest, ctx: PluginExecutionContext): Promise<DetectedEntity[]>`
  - `dispose(): Promise<void>`
- `FeatureDetectionRequest` — the input payload a detector receives for a stage invocation
  (frame/point-cloud references, stage id, prior-stage outputs it depends on).
- `PluginExecutionContext` — the plugin's only window into the host runtime:
  - `reportProgress(fraction: number, message?: string): void` — emits a `StageProgressEvent`.
  - `log: { info, warn, error }` — structured logging, attributed to the plugin.
- `PluginRegistry` / `createPluginRegistry(installedSdkVersion: string)` — constructs a registry
  that validates each plugin's manifest-declared SDK compatibility range against
  `installedSdkVersion` before registering it. See `plugin-development.md` for the manifest shape
  and `architecture.md` §6 for the full discovery flow.

## 3. `@topview/pipeline-core`

Depends on `@topview/schema`, `@topview/plugin-sdk`, `@topview/svg-engine`.

- `createPipelineRunner(options)` — the single entry point that wires a `PluginRegistry` and a
  `ComputeBackendHandle` together into a runnable pipeline.
- `PipelineRunner` — `.run(project)`, `.on(event => void)` (subscribe to the `PipelineEvent`
  stream described in `architecture.md` §5), `.cancel()`.
- `ComputeBackendHandle` — the contract satisfied by `LocalComputeBackend`,
  `HttpComputeBackend`, and `CloudComputeBackend`:
  - `submit(request: ComputeJobRequest): Promise<ComputeJobHandle>`
  - `ComputeJobHandle` — `{ jobId, on(event => void), cancel(), result(): Promise<...> }`
- `ComputeJobRequest` — `{ stage: PipelineStageId, pluginId: string, payload: unknown, priority:
  'interactive' | 'batch' }`. This is the exact contract `reconstruction_api`'s
  `JobSubmitRequest`/`JobHandleResponse` (Python) mirrors by hand (§4 below).

## 4. `@topview/svg-engine`

Depends on `@topview/schema`, `@topview/geometry-wasm`.

- `Exporter` — adapter interface for serializing a scene to a deliverable format (SVG, and
  future formats); `apps/web/src/plugins-runtime/` registers the built-in exporters into the
  same `PluginRegistry` used for detectors.
- SVG cleanup pass — snapping/simplification functions built on `@topview/geometry-wasm`'s
  `GeometryOps`, shared verbatim with the editor's live snapping (`apps/web/src/svg-editor/snapping/`).
- Import/parse helpers for round-tripping an exported SVG back into scene entities (editor
  re-open path).

## 5. `@topview/geometry-wasm`

Depends on `@topview/schema` (types only).

- `loadGeometryOps(): Promise<GeometryOps>` — resolves to either the accelerated Rust/WASM
  implementation (if built, see `performance.md`) or the pure-TypeScript fallback, transparently.
- `GeometryOps` — snapping, intersection, collinearity, simplification primitives shared by the
  editor and `svg-engine`.
- `crate/` — the optional Rust source for the accelerated path; it has no JS dependencies and is
  compiled independently via `npm run build:wasm` (requires `cargo`).

## 6. `@topview/plugin-example-detector`

Depends on `@topview/schema`, `@topview/plugin-sdk`. The reference plugin — see
`plugin-development.md` for a line-by-line walkthrough. Public export: a default export factory
function returning a `FeatureDetector<ExampleWallDetectorConfig>` instance
(`manifestId: 'topview.detector.example-wall-heuristic'`, `detects: ['wall', 'corner']`).

## 7. `@topview/web`

The SPA; not a library other packages import. See `user-guide.md` for the user-facing surface
and `architecture.md` §§6/8/9 for how it wires the registry, autosave, and editor together.

---

## 8. `services/reconstruction-api` — REST/SSE surface

Base URL: `http://localhost:8000` in local/dev (see `deployment.md` for production
considerations, notably the wide-open CORS policy that must be tightened before any real
deployment).

### 8.1 Health

```
GET /healthz → 200 { "status": "ok" }
```

### 8.2 Per-stage job endpoints

Every one of the 11 pipeline stages exposes the identical two-endpoint shape, each under its own
router prefix:

```
POST /stages/{stage}/jobs
GET  /stages/{stage}/jobs/{job_id}/events
```

| Stage | Prefix |
|---|---|
| Upload | `/stages/upload` |
| Frame extraction | `/stages/frame-extraction` |
| Feature detection | `/stages/feature-detection` |
| Camera reconstruction | `/stages/camera-reconstruction` |
| Point cloud generation | `/stages/point-cloud-generation` |
| Geometry recovery | `/stages/geometry-recovery` |
| Wall detection | `/stages/wall-detection` |
| Furniture detection | `/stages/furniture-detection` |
| Layout generation | `/stages/layout-generation` |
| SVG cleanup | `/stages/svg-cleanup` |
| Export | `/stages/export` |

**`POST /stages/{stage}/jobs`**

Request body (`JobSubmitRequest`):

```jsonc
{
  "stage": "feature-detection",     // mirrors PipelineStageId
  "plugin_id": "topview.detector.example-wall-heuristic",
  "payload": { /* stage-specific input, opaque to the router */ },
  "priority": "batch"                 // "interactive" | "batch", default "batch"
}
```

Response body (`JobHandleResponse`):

```jsonc
{ "job_id": "..." }
```

This mirrors `@topview/pipeline-core`'s `ComputeJobRequest` → `ComputeJobHandle` contract exactly
(§3 above), so `HttpComputeBackend` on the TypeScript side can submit a job with no shape
translation beyond `camelCase` ↔ `snake_case`.

**`GET /stages/{stage}/jobs/{job_id}/events`**

A Server-Sent Events stream. Each event's `data:` payload is one JSON object matching the
`PipelineEvent` union from `reconstruction_api/events.py` (`StageProgressEvent`,
`StageLifecycleEvent`, `PipelineErrorEvent` — the hand-maintained Pydantic mirror of
`@topview/schema`'s TypeScript union; see `architecture.md` §7 for the contract-sync strategy and
how CI catches drift):

```jsonc
{"type":"stage:started","event_id":"...","run_id":"...","project_id":"...","timestamp":"...","stage":"feature-detection"}
{"type":"stage:progress","event_id":"...","run_id":"...","project_id":"...","timestamp":"...","stage":"feature-detection","fraction":0.4,"message":"...","detail":{}}
{"type":"stage:completed","event_id":"...","run_id":"...","project_id":"...","timestamp":"...","stage":"feature-detection"}
```

**Current status: stub.** Every router in v1 implements this exact two-endpoint shape but both
handlers currently raise `NotImplementedError("stage stub — see docs/roadmap.md")`. This is
intentional scaffolding, not a bug — see `roadmap.md` for when real dispatch logic lands (tied to
`HttpComputeBackend` becoming non-stubbed, so both sides ship together).

### 8.3 Error shape

Once implemented, error responses are expected to surface as HTTP error statuses whose body
carries a `PipelineErrorEvent`-shaped payload (`code`, `message`, `recoverable`, optional
`plugin_id`) so the same error-handling UI in `apps/web/src/pipeline-view/` can render backend
errors identically to local-compute errors. See `troubleshooting.md` for `PipelineErrorCode`
meanings.
