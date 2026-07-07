# Troubleshooting

## 1. Missing Python locally

**Symptom:** you can't run or test `services/reconstruction-api` — `python`/`pip`/`uvicorn`
commands fail, or aren't installed at all.

**This is expected, not a scaffold defect.** `services/reconstruction-api` has no `package.json`
anywhere in its tree and is not an npm workspace member (`architecture.md` §2), so its absence
has zero effect on `npm install`, `npm run build`, `npm run typecheck`, `npm run lint`, or
`npm test` at the root — every one of those commands succeeds with no Python installed at all.

**Fix, if you need the backend:** install Python 3.12+ and follow `installation.md` §5, or run it
via Docker (`services/reconstruction-api/Dockerfile`), which needs no Python on the host. CI
provisions Python independently (`actions/setup-python@v5`) and that job (`python-service` in
`.github/workflows/ci.yml`) runs with `continue-on-error: true` — it's best-effort, so a
transient Python-side issue there doesn't block the Node-only jobs from passing.

## 2. Missing Rust/`cargo` locally

**Symptom:** `packages/geometry-wasm`'s `npm run build:wasm` fails or `cargo` isn't found.

**Also expected.** `@topview/geometry-wasm` ships a pure-TypeScript implementation of `GeometryOps`
that every consumer (`svg-engine`, the editor's snapping code) works against by default via
`loadGeometryOps()`. Rust only unlocks the accelerated native/WASM path — its absence means
slower geometry operations on very large point clouds/layouts, not broken functionality. See
`performance.md` for when it's actually worth installing Rust to build the accelerated path. CI's
`rust-wasm` job runs `continue-on-error: true` and explicitly checks `command -v cargo` before
attempting anything, printing a clear "skipping (expected, non-blocking)" message when absent.

## 3. `PipelineErrorCode` meanings

`PipelineErrorEvent`s (from the `PipelineEvent` union, `architecture.md` §5) carry a `code` field.
Broad categories to expect (exact enum lives in `@topview/schema`; treat this table as the
mental model, not the literal source of truth):

| Code family | Meaning | Typical response |
|---|---|---|
| `INPUT_*` (e.g. `INPUT_UNREADABLE`, `INPUT_TOO_SHORT`) | The uploaded video/image sequence couldn't be used as-is | Re-export/re-capture the source; check `data/samples/README.md` for the expected shape if testing with a sample |
| `RECONSTRUCTION_*` (e.g. `RECONSTRUCTION_INSUFFICIENT_OVERLAP`) | SfM/camera-reconstruction couldn't converge | Recapture with more frame overlap / slower camera motion |
| `PLUGIN_*` (e.g. `PLUGIN_INCOMPATIBLE`, `PLUGIN_TIMEOUT`) | A registered plugin failed, was incompatible, or exceeded its time budget | See `plugin-development.md` §6 — an incompatible/erroring plugin is skipped, not fatal, unless every plugin for a required capability fails |
| `BACKEND_*` (e.g. `BACKEND_UNREACHABLE`) | `computeMode: 'backend'` couldn't reach `services/reconstruction-api` | Check `VITE_RECONSTRUCTION_API_BASE_URL`, confirm `/healthz` responds (`installation.md` §5), check CORS config (`deployment.md` §3.3) |
| `CANCELLED` | User or system cancelled the run | Informational, not an error to "fix" |

`recoverable: true` on an error means the pipeline can retry or continue past that stage;
`recoverable: false` means the run is done and the project needs a re-upload or a settings
change before trying again. `apps/web/src/pipeline-view/` should surface this distinction visibly
rather than showing every error identically.

## 4. Low-confidence entity review workflow

Detected entities carry `confidence` and `validationStatus`. A practical review order:

1. Sort/filter by ascending `confidence` in the SVG editor's entity list.
2. For each low-confidence entity, cross-reference the point-cloud/depth viewers
   (`apps/web/src/viewers/`) against the SVG view to judge whether it's real.
3. Accept (`user-accepted`) or reject (`user-rejected`) — both are ordinary `EditorCommand`s on
   the undo stack (`architecture.md` §9), so triaging a batch of low-confidence entities is fully
   undoable if you change your mind partway through.
4. Re-run `svg-cleanup`/`export` only after triage — cleanup snapping decisions are more stable
   once obviously-wrong entities are rejected first.

## 5. The `workspace:*` gotcha

**Never write `"@topview/some-package": "workspace:*"` anywhere in this repo.** This repo uses
plain npm workspaces, not pnpm or Yarn — `workspace:*` is a protocol string those other tools'
installers understand and rewrite at publish time; npm does not understand it at all. If you see
it in a `package.json`, npm install will either fail outright or (depending on npm version)
attempt to resolve a literal package version string called `workspace:*` from the registry and
fail with a confusing 404-class error.

**The fix:** replace it with a plain `"*"` version range. npm workspaces resolves a bare `"*"`
dependency on a `@topview/*` package straight to the local sibling workspace package on disk —
no publish step required. This is the one and only accepted way to declare an internal
dependency in this repo (`architecture.md` §3, `installation.md` §3). `npm run verify-deps`
checks *which* packages a package depends on, not the version string syntax used — so also
visually double-check any new internal dependency line you add uses `"*"`, not `workspace:*`,
since that specific mistake won't be caught by the dependency-graph check.

## 6. `verify-deps` failures

**Symptom:** `npm run verify-deps` (or the CI `node` job) exits non-zero with `[verify-deps]
<package> declares disallowed dependency <dep>`.

**Fix:** either (a) remove the dependency if it was added by mistake, or (b) if the new edge is
intentional and architecturally justified, add it to both `tools/dependency-policy.json` *and*
the table in `architecture.md` §3 in the same change — the policy file and the docs table must
never drift from each other or from reality.

## 7. `services/reconstruction-api` endpoints return `501`/`NotImplementedError`

**Expected in v1.** Every stage router's two endpoints
(`POST /stages/{stage}/jobs`, `GET /stages/{stage}/jobs/{job_id}/events`) are stubs that raise
`NotImplementedError("stage stub — see docs/roadmap.md")`. `computeMode: 'backend'` is not yet a
functional path end-to-end — see `roadmap.md` for when real dispatch logic lands. Use
`computeMode: 'local'` until then.

## 8. Contract drift between `@topview/schema` and `reconstruction_api/events.py`

If the CI contract-sync check (`architecture.md` §7 — loading
`packages/schema/dist/schema/*.json` and validating Python-model fixture payloads against it via
`jsonschema`) fails, it means the hand-maintained Pydantic models in
`reconstruction_api/events.py`/`jobs/models.py` no longer match the TypeScript source of truth in
`@topview/schema`. Fix by hand-editing the Pydantic models to match — there is no codegen to
re-run yet (planned for `roadmap.md` Phase 2+). Do not "fix" this by loosening the JSON Schema
validation in CI; the whole point of the check is to catch exactly this drift before it ships.
