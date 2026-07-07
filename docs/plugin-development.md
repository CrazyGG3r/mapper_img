# Plugin Development

Feature detection in TopView SVG Mapper is pluggable: the pipeline never hard-codes a specific
wall or furniture detector. Instead, any package that satisfies the `FeatureDetector` contract
from `@topview/plugin-sdk` and ships a valid `plugin.manifest.json` can be registered into the
`PluginRegistry` and invoked by a pipeline stage.

This document walks through `plugins/example-detector` file by file — it is the literal,
complete, working reference every plugin author should start by copying.

## 1. Why a trivial reference plugin

`@topview/plugin-example-detector` is intentionally trivial: its `detect()` method returns an
empty array of entities. Its value isn't detection quality — it's being a correct, minimal,
end-to-end demonstration of every piece of wiring a real plugin needs: the manifest shape, the
`FeatureDetector` implementation, how it's registered, how the registry discovers and
version-checks it, and how a pipeline stage invokes it. Real detectors (ORB/SIFT/SuperPoint-based
wall finders, learned furniture classifiers, etc.) ship as separate first-party or third-party
plugin packages that follow this exact shape but replace the body of `detect()`.

## 2. The manifest — `plugins/example-detector/plugin.manifest.json`

```jsonc
{
  "id": "topview.detector.example-wall-heuristic",
  "name": "Example Wall Detector (reference heuristic)",
  "version": "0.1.0",
  "sdkCompatibility": "^0.1.0",
  "detects": ["wall", "corner"],
  "configSchema": {
    "type": "object",
    "properties": {
      "minSegmentLengthM": { "type": "number", "default": 0.3 }
    },
    "additionalProperties": false
  },
  "entryPoint": "./dist/index.js"
}
```

Field-by-field:

- **`id`** — a globally unique, reverse-DNS-style plugin identifier. This is the value the
  `FeatureDetector` instance exposes at runtime as `manifestId` — the registry cross-checks the
  two match, so a plugin can't silently masquerade as a different id after it's loaded.
- **`name`** — human-readable label shown in `apps/web`'s plugin management UI.
- **`version`** — this plugin package's own semver, independent of the SDK version.
- **`sdkCompatibility`** — a semver range against `@topview/plugin-sdk`'s version. The registry
  refuses to register a plugin whose declared range doesn't include the host's
  `installedSdkVersion`, *at registration time* — failing fast and legibly instead of loading an
  incompatible plugin that then breaks mid-pipeline in some more confusing way.
- **`detects`** — the capability tags this plugin's `detect()` can produce. A stage looks up
  registered plugins by matching stage requirements against this list (e.g. the `wall-detection`
  stage looks for plugins whose `detects` includes `'wall'`).
- **`configSchema`** — a JSON Schema describing the plugin's configuration shape.
  `apps/web/src/settings/` auto-generates a settings UI from this schema (see
  `configuration.md`) so plugin authors get a working config UI for free without writing any
  form code.
- **`entryPoint`** — the path (relative to the manifest) to the compiled JS module that
  default-exports the plugin's registration factory. Points at build output (`./dist/index.js`),
  not source, because the registry loads compiled plugins, not TypeScript.

## 3. The implementation — `plugins/example-detector/src/index.ts`

```typescript
import type {
  FeatureDetector, FeatureDetectionRequest, DetectedEntity, PluginExecutionContext,
} from '@topview/plugin-sdk';

export interface ExampleWallDetectorConfig {
  minSegmentLengthM: number;
}

export class ExampleWallDetector implements FeatureDetector<ExampleWallDetectorConfig> {
  readonly manifestId = 'topview.detector.example-wall-heuristic';
  readonly detects = ['wall', 'corner'] as const;
  private config: ExampleWallDetectorConfig = { minSegmentLengthM: 0.3 };

  configure(config: ExampleWallDetectorConfig): void {
    this.config = config;
  }

  async detect(
    request: FeatureDetectionRequest,
    ctx: PluginExecutionContext,
  ): Promise<DetectedEntity[]> {
    ctx.reportProgress(0, 'scanning point cloud for planar wall candidates');
    ctx.log.info('example-wall-detector starting', { minSegmentLengthM: this.config.minSegmentLengthM });

    const detected: DetectedEntity[] = [];

    ctx.reportProgress(1, 'done');
    return detected;
  }

  async dispose(): Promise<void> {
    // no resources held in this trivial example
  }
}

export default function registerPlugin() {
  return new ExampleWallDetector();
}
```

Walking through it:

- **`manifestId`** must match `id` in `plugin.manifest.json` exactly — this is the identity check
  the registry performs at load time (§2).
- **`detects`** must match the manifest's `detects` array — declared twice (manifest + class) on
  purpose, so the registry can validate a plugin's *runtime* self-description against its
  *static* manifest before ever calling `detect()`.
- **`configure()`** receives a value already validated against `configSchema` — a plugin never
  needs to hand-validate its own config shape.
- **`detect(request, ctx)`** is where real detection logic goes. `request` carries whatever the
  invoking stage needs to pass in (frame references, point cloud, prior-stage outputs); `ctx` is
  the plugin's *only* window into the host — no ambient access to the DOM, network, or other
  plugins. In this reference implementation the body is a comment pointing back here rather than
  real detection math — deliberately, so this package stays a stable, minimal thing to diff a
  real plugin against.
- **`ctx.reportProgress(fraction, message)`** emits a `StageProgressEvent` (see `architecture.md`
  §5) that flows straight through to `apps/web/src/pipeline-view/`'s live progress UI. Call it at
  least at the start (`0`) and end (`1`) of `detect()`; call it more often for long-running
  detectors so progress UI doesn't sit frozen.
- **`ctx.log`** is structured logging attributed to this plugin id — prefer it over `console.*`
  so log lines are attributable and filterable in the host's log viewer.
- **`dispose()`** releases any resources the plugin is holding (model weights, worker threads,
  open file handles). This example holds none, so it's a no-op — but the method must still exist
  and resolve, because the registry calls it unconditionally when a plugin is unregistered or the
  registry is torn down.
- **`export default function registerPlugin()`** is the function `entryPoint`'s module must
  default-export. It's a *factory*, not a singleton instance, so the host can construct a fresh
  detector instance per pipeline run if it chooses to (keeping per-run state isolated).

## 4. The manifest → registration → discovery → invocation flow

This is the exact sequence `apps/web/src/plugins-runtime/` (and any future headless runner) drives:

1. **Discovery**: the host enumerates installed plugin packages (in `apps/web`, this currently
   means the built-in default set registered explicitly in `plugins-runtime/`, plus any
   additional plugin packages installed as dependencies — see `configuration.md` for how
   third-party plugins get added to that list).
2. **Manifest load**: for each candidate, the host reads `plugin.manifest.json` and validates its
   shape (required fields present, `configSchema` is valid JSON Schema, `entryPoint` resolves to
   a file that exists).
3. **Compatibility check**: `createPluginRegistry(installedSdkVersion)` compares the manifest's
   `sdkCompatibility` range against `installedSdkVersion`. Incompatible → registration is refused
   and a diagnostic is logged; the pipeline continues without that plugin rather than crashing.
4. **Module load + identity check**: the host dynamically imports `entryPoint`, calls the default
   export factory, and verifies the returned instance's `manifestId`/`detects` match the manifest
   (§3). Mismatch → registration refused, same as a failed compatibility check.
5. **Registration**: the validated `FeatureDetector` instance is added to the `PluginRegistry`,
   indexed by the capability tags in `detects`.
6. **Configuration**: `apps/web/src/settings/` auto-generates a config form from `configSchema`
   (see `configuration.md`); when the user changes settings, `configure()` is called with the
   new, schema-validated value.
7. **Stage invocation**: when a pipeline stage runs (e.g. `wall-detection`), `pipeline-core` looks
   up registry entries whose `detects` matches that stage's required capability, builds a
   `FeatureDetectionRequest` from the stage's inputs, and calls `detect(request, ctx)` on each
   matching plugin. Returned `DetectedEntity[]` are merged into the pipeline's working project
   state (each entity carrying `sourcePluginId` so its provenance is always traceable in the
   editor).
8. **Disposal**: when a plugin is unregistered (settings change) or the host process/registry
   tears down, `dispose()` is called so the plugin can release resources deterministically.

## 5. Writing your own plugin

1. Scaffold a new package under `plugins/your-plugin-name/`, following
   `plugins/example-detector`'s layout: `plugin.manifest.json`, `src/index.ts`, a `package.json`
   depending only on `@topview/schema` and `@topview/plugin-sdk` (per the dependency graph in
   `architecture.md` §3 — a detector plugin has no legitimate reason to depend on
   `pipeline-core`, `svg-engine`, or `apps/web`).
2. Implement `FeatureDetector<TYourConfig>`: pick a unique `manifestId`, declare the capability
   tags your plugin actually produces in `detects`, and implement `detect()` using whatever
   detection approach you want (classical CV, a learned model loaded in `configure()`, calling
   out to `@topview/geometry-wasm`'s `GeometryOps` for geometric primitives, etc.).
3. Keep `detect()` pure with respect to the host: read only from `request` and your own
   `configure()`d state; write only by returning `DetectedEntity[]`; report progress and log only
   through `ctx`.
4. Write `plugin.manifest.json` matching your class's `manifestId`/`detects` exactly, and define
   `configSchema` for every field your config type has.
5. Build (`entryPoint` must point at compiled output), then register the package the same way
   `plugins-runtime/` registers `@topview/plugin-example-detector` (see `configuration.md` for
   the registration list) — or install it as a dependency of `apps/web` and add it to that list.
6. Verify the whole chain end-to-end: does the registry accept your manifest (correct
   `sdkCompatibility`)? Does the settings UI render your `configSchema` correctly? Does your
   stage's progress bar move when `ctx.reportProgress` is called? Do returned entities show up in
   the SVG editor with your plugin's id as `sourcePluginId`?

## 6. Compatibility rules recap

- `sdkCompatibility` is checked against the *host's* installed `@topview/plugin-sdk` version, not
  against any particular pipeline-core or web-app version — this is what lets a plugin be
  written once and stay compatible across host releases that don't bump the SDK's own major
  version.
- A plugin that fails its compatibility check or its identity check (§4 steps 3–4) is skipped,
  not fatal — one broken/incompatible plugin must never take down the whole pipeline run. Confirm
  this behavior when testing a new plugin by deliberately declaring an out-of-range
  `sdkCompatibility` and verifying the host degrades gracefully.
- Plugin-to-plugin dependencies (one detector consuming another's output beyond the ordinary
  stage-input contract) are explicitly **not** supported in v1 — see `roadmap.md` for when
  fine-grained plugin dependency resolution is planned.
