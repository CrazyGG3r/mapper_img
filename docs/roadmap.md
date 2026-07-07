# Roadmap

This roadmap is phased deliberately: each phase produces something usable end-to-end before the
next phase's complexity is added, and each phase's ordering is chosen so later phases build on
infrastructure the earlier ones already established rather than requiring rework.

## Phase 0 — Scaffold (current)

The state this blueprint produces: every package's structure, types, dependency graph, and
wiring exist and compile, but the actual reconstruction/detection math is either a stub or the
trivial reference implementation (`plugins/example-detector` returns no entities;
`services/reconstruction-api`'s stage routers raise `NotImplementedError`;
`CloudComputeBackend`/`computeMode: 'cloud'` is a stub). This phase's job is to make Phases 1+
additive — no restructuring of the monorepo, dependency graph, or event protocol should be
needed to build any later phase.

## Phase 1 — MVP: local SfM + SVG export

**Goal:** a user can upload a walkthrough video, get a real (not stubbed) top-down floor plan,
lightly clean it up, and export an SVG — entirely in the browser, no backend required.

**Why first:** this is the smallest slice that is *actually useful* to a real user, and it forces
the hardest cross-cutting decisions (the 11-stage pipeline shape, the `PipelineEvent` protocol,
the `ComputeBackendHandle` abstraction, the `ProjectDocument`/editor data model) to get exercised
by real data before anything else is layered on top. Building the plugin ecosystem or the backend
first would mean designing those against a pipeline that doesn't actually produce correct
output yet — better to prove the core reconstruction path works, then generalize.

**Concrete work:**

- Implement real `frame-extraction`, `feature-detection`, `camera-reconstruction`, and
  `point-cloud-generation` stages against `LocalComputeBackend` (WebWorker/WASM-hosted classical
  SfM — e.g. a WASM-compiled feature matcher + incremental SfM solver; evaluate reusing an
  existing open-source WASM-portable SfM implementation vs. building a minimal one before
  committing).
- Implement a real (non-trivial) built-in `geometry-recovery` → `wall-detection` heuristic
  (planar-surface extraction + wall/corner classification from the point cloud) — this can ship
  as the first *real* detector plugin, replacing `plugins/example-detector` as the default while
  keeping the example package around purely as the reference doc artifact
  (`plugin-development.md`).
- Implement `layout-generation` and `svg-cleanup` for real, using `@topview/geometry-wasm`'s
  `GeometryOps` (TypeScript fallback is sufficient for Phase 1 — see `performance.md` §1 for when
  the accelerated build becomes worth it).
- Implement `export` for at least clean SVG output via `@topview/svg-engine`.
- Minimum viable editor: vertex/edge editing and snapping only (defer layers, full version-history
  UI polish, and multi-format export to Phase 5).
- Furniture detection can remain a stub/no-op through Phase 1 — walls are the MVP's floor-plan
  value; furniture is additive.

**Exit criteria:** a real captured walkthrough video, run entirely with `computeMode: 'local'`,
produces a recognizably-correct floor plan SVG for a simple room or two, with no backend running.

## Phase 2 — Plugin ecosystem

**Goal:** third parties (or later phases of this project itself) can ship detector plugins
without touching `pipeline-core` or `apps/web`.

**Why second, not first:** Phase 1 needs *a* working detector to prove the pipeline end-to-end,
but building a whole discoverable, versioned, config-schema-driven plugin ecosystem before
knowing what a real detector's inputs/outputs need to look like risks designing the
`FeatureDetector`/`PluginExecutionContext` contract wrong. Phase 1's real wall-detection
implementation is what validates that contract under real load; Phase 2 generalizes it.

**Concrete work:**

- Harden `PluginRegistry` discovery beyond the current "explicit built-in list in
  `plugins-runtime/`" (Phase 0/1 state) to also discover plugins installed as ordinary npm
  dependencies of `apps/web` without hand-editing a registration list per plugin.
- Publish `@topview/plugin-sdk` and `@topview/schema` with real semver discipline (this is the
  point at which `sdkCompatibility` ranges in third-party manifests start mattering for real,
  rather than only being exercised against in-repo plugins).
- Flesh out `docs/plugin-development.md`'s walkthrough with a second, non-trivial example plugin
  (e.g. a furniture-detection plugin) demonstrating a realistic `detect()` implementation, since
  `plugins/example-detector` deliberately stays trivial by design (`architecture.md` §6,
  `plugin-development.md` §1).
- Plugin marketplace/listing UI in `apps/web/src/settings/` (install/enable/disable/configure
  third-party plugins without a rebuild).

**Exit criteria:** a plugin author outside this repo can write, package, and install a detector
plugin that the running app discovers and invokes, using only `docs/plugin-development.md` and
published `@topview/schema`/`@topview/plugin-sdk` packages — no access to this repo's source
required.

## Phase 3 — Hybrid backend (`computeMode: 'backend'` made real)

**Goal:** `services/reconstruction-api`'s stage routers do real work, and `HttpComputeBackend`
is a fully functional alternative to `LocalComputeBackend` for the same pipeline.

**Why third, not earlier:** the backend's value is offloading the *same* computation Phase 1
already implemented client-side to a bigger/shared machine — building it before Phase 1's stages
have real, validated implementations would mean re-deriving the reconstruction algorithms twice
(once in a rush to unblock the backend, once correctly for the browser) or, worse, having the two
paths silently diverge in behavior. Sequencing backend-enablement after the local path is proven
means the backend can port/reuse validated logic (or call into mature native tools like COLMAP/
OpenMVG/OpenMVS via `core/colmap_bridge.py`) rather than inventing it under time pressure.

**Concrete work:**

- Real job dispatch in every `services/reconstruction-api` router: replace
  `NotImplementedError` stubs with actual stage execution, backed by `core/colmap_bridge.py`
  process wrappers around COLMAP/OpenMVG/OpenMVS for the SfM-heavy stages (reconstruction quality
  ceiling on the backend can exceed what's practical in-browser).
- A real, durable job registry in `jobs/manager.py` (Phase 0's in-process registry is
  non-durable across restarts — `deployment.md` §3.3 flags this explicitly).
- Real SSE event streaming matching the `PipelineEvent` contract, with the CI contract-sync check
  (`architecture.md` §7) now guarding a path that's actually exercised in production, not just in
  fixtures.
- `HttpComputeBackend` hardening: retry/backoff, upload progress for large source video files,
  auth (this repo's Phase 0 CORS story is wide-open by design for local dev — see
  `deployment.md` §3.3 — Phase 3 is when real auth needs to land alongside real functionality).

**Exit criteria:** the same project, run once with `computeMode: 'local'` and once with
`computeMode: 'backend'` against a deployed `services/reconstruction-api`, produces equivalent
floor plans, with the backend path handling noticeably larger source videos than the browser
comfortably can.

## Phase 4 — AI-assisted detection

**Goal:** replace/augment the classical-CV detectors from Phases 1–2 with learned models for
higher accuracy wall/furniture/room-type detection, and route the heavier ones through the
backend's inference path.

**Why fourth, not earlier:** learned detection models need (a) a stable plugin contract to be
packaged against (Phase 2) and (b) for the heaviest models, a backend capable of running them at
reasonable latency (Phase 3's `core/inference/` stub becoming real). Attempting AI-assisted
detection before either exists means either bypassing the plugin architecture (creating a
second, inconsistent detection path) or blocking on backend infrastructure that isn't there yet.
Sequencing it fourth lets AI detectors be *ordinary* plugins (Phase 2) that happen to optionally
run backend-side (Phase 3) for the expensive ones, and lets a Phase 1/2 classical detector serve
as a fallback when no learned model is configured.

**Concrete work:**

- Real model loading in `services/reconstruction-api/reconstruction_api/core/inference/`
  (currently a stub package) — e.g. a learned wall/room-boundary segmentation model, a furniture
  classifier.
- A `FeatureDetector` plugin (following the Phase 2 ecosystem conventions) that calls out to the
  backend's inference endpoint for `computeMode: 'backend'`/`'cloud'`, with a lighter on-device
  fallback model (or graceful degradation to the Phase 1 classical heuristic) for
  `computeMode: 'local'`.
- Confidence calibration work — `DetectedEntity.confidence` needs to mean something consistent
  and comparable whether it came from a classical heuristic or a learned model, since the editor's
  low-confidence review workflow (`troubleshooting.md` §4) depends on that comparability.

**Exit criteria:** a learned detector plugin measurably reduces the number of entities a user
needs to manually correct, on a held-out set of sample captures, compared to the Phase 1
classical heuristic alone.

## Phase 5 — Full editor

**Goal:** the complete editing experience described in the blueprint's editor sections — full
layer management, robust version-history UI with restore-to-version, multi-format export, and
polish beyond the Phase 1 minimum-viable vertex/edge editing.

**Why last:** the editor's *architecture* (command-based undo/redo, `EditorSceneState`, layers,
autosave-via-event-subscription) is deliberately built in Phase 0/1 already — see
`architecture.md` §§8–9 — because building it soundly from the start is cheap and building it
correctly later on top of an ad hoc Phase-1 editor would not be. What Phase 5 adds is breadth and
polish on that foundation once there's real usage data (from Phases 1–4) about which editing
workflows actually matter most, rather than guessing upfront.

**Concrete work:**

- Full layer management UI (reordering, per-layer opacity/color, bulk operations).
- Version-history UI: diff visualization between versions, not just restore; configurable
  diff-mode threshold (`architecture.md` §8, `performance.md` §3).
- Additional `Exporter` adapters beyond clean SVG (e.g. DXF, PDF, a simple JSON scene format for
  programmatic consumption) — each ships as an adapter registered the same way the built-in SVG
  exporter is (`configuration.md`), so this is additive, not architectural.
- Multi-floor/multi-level project support, if user research from Phases 1–4 usage shows it's
  needed.
- Collaborative/multi-user editing — explicitly out of scope for this roadmap's horizon; flagged
  here only so it's not silently assumed to be in Phase 5.

**Exit criteria:** the editor supports the full workflow described in `user-guide.md` §4–6
without rough edges, validated against real usage patterns observed from Phases 1–4.

## Other tracked items not tied to a specific phase above

- **Real wasm geometry kernels** (`packages/geometry-wasm/crate/`): can land any time after Phase
  1 once profiling (per `performance.md` §1) shows the TypeScript fallback is a bottleneck for
  real projects — not gated on any other phase.
- **`CloudComputeBackend`** becoming real: a natural follow-on to Phase 3 once
  `HttpComputeBackend`/`services/reconstruction-api` are proven, packaging the same capability as
  a managed offering instead of self-hosted.
- **COLMAP/OpenMVG import**: importing reconstructions produced by external tools directly,
  bypassing this project's own `camera-reconstruction`/`point-cloud-generation` stages — useful
  once Phase 3's `core/colmap_bridge.py` wrappers exist to build on.
- **JSON-Schema→Pydantic codegen**: automating the currently-hand-maintained contract-sync
  described in `architecture.md` §7, once the manual version has proven stable enough that
  investing in codegen tooling pays for itself (tracked as a Phase 2+ item per that section, not
  committed to a specific phase above since it's an internal-tooling improvement, not
  user-facing).
- **Plugin-to-plugin dependency resolution**: letting one plugin declare a dependency on another
  plugin's output beyond the ordinary stage-input contract (`plugin-development.md` §6) —
  deferred until Phase 2's ecosystem has enough real third-party plugins that the need is
  concretely demonstrated rather than speculative.
- **Fine-grained mid-stage pause**: pausing/resuming a pipeline run partway through a single
  stage (today, pause/cancel granularity is per-stage) — a Phase 3+/Phase 5-adjacent UX
  refinement once real stage durations on real backend hardware (Phase 3) make it clear whether
  users actually need it.
