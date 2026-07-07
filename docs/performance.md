# Performance

## 1. When to invest in `build:wasm`

`@topview/geometry-wasm` ships two implementations behind one `loadGeometryOps()` entry point: a
pure-TypeScript fallback (always available, zero toolchain requirements) and an accelerated
Rust/WASM path (`crate/`, built via `npm run build:wasm`, requires `cargo` — `installation.md`
§6). Both implement the identical `GeometryOps` surface, so switching between them is never a
correctness question, only a speed one.

**Invest in the WASM build when:**

- Point clouds/layouts routinely exceed roughly tens of thousands of points/segments, and the
  editor's live snapping starts to feel laggy while dragging vertices.
- `svg-cleanup` stage duration on large projects is a noticeable fraction of total pipeline time.
- You're deploying for many concurrent users on `computeMode: 'local'`, where geometry math runs
  on each user's own device and every bit of per-op speedup multiplies across your whole user
  base's experience.

**Skip it when:**

- You're developing/scaffolding and want the fastest possible install (no Rust toolchain step).
- Typical projects are small interiors (a handful of rooms) — the TypeScript fallback is fast
  enough that the difference is not perceptible during interactive editing.
- You're running in an environment (e.g. certain CI runners, some managed build platforms)
  where installing a Rust toolchain adds meaningful build time or complexity for a speedup that
  doesn't matter for that deployment's actual project sizes.

If you do build it for production, make sure your deployment build pipeline runs `build:wasm`
itself rather than relying on a locally-built artifact making its way into the deployed bundle by
accident — see `deployment.md` §5.

## 2. `local` / `backend` / `cloud` compute-mode tradeoffs

| | `local` | `backend` | `cloud` |
|---|---|---|---|
| Setup | None — works out of the box | Requires a running `services/reconstruction-api` instance | Stubbed in v1 (`roadmap.md`) |
| Compute ceiling | Bounded by the end user's device (CPU/GPU/memory, browser WASM limits) | Bounded by the backend host's resources — can be much larger than any one user's device | Intended to be elastic/managed once real |
| Latency | No network round-trip for job submission/progress | Network round-trip per job submission + SSE stream overhead | Same shape as `backend`, plus provider-specific cold-start considerations |
| Data locality | Video/point-cloud data never leaves the browser | Source data and intermediate artifacts (frames, point clouds) are uploaded to the backend | Same as `backend`, plus whatever the managed provider's data-handling policy is |
| Best for | Trying the tool, offline work, privacy-sensitive captures, small-to-medium projects | Large projects, teams sharing compute, projects too heavy for a typical laptop/phone | Not yet usable — planned for scale-out scenarios |

Because every mode implements the same `ComputeBackendHandle`/`PipelineEvent` contract
(`architecture.md` §4–5), switching modes on an existing project changes *only* where computation
happens — the pipeline stages, event protocol, editor, and autosave behavior are identical
regardless of mode, so there is no per-mode feature gap to plan around here, only a
resource/latency/data-locality tradeoff.

## 3. Inline vs. external `PointCloud` storage tradeoffs

A project's point cloud can be stored two ways inside a `ProjectDocument`/`ProjectVersion`
snapshot:

- **Inline** — the point cloud data is embedded directly in the saved document/snapshot.
  - Pro: a single self-contained artifact — simplest to export, share, or restore from, with no
    dangling external references.
  - Con: every `ProjectVersion` snapshot that includes it (before diff-mode kicks in — see
    `architecture.md` §8) grows large fast; IndexedDB storage and any transfer to a backend both
    get proportionally slower.
- **External** — the point cloud is stored as a separate blob (IndexedDB blob store locally, or
  object storage once `computeMode !== 'local'`), and the document/snapshot holds only a
  reference to it.
  - Pro: version snapshots stay small and fast to write/diff even for large projects; the same
    point cloud can be referenced by multiple versions without duplication.
  - Con: an extra indirection to manage — a snapshot restore or export needs to resolve the
    reference, and reference bookkeeping (garbage-collecting blobs no version points at anymore)
    is nontrivial.

**Guidance:** default to external storage once a project's point cloud crosses a size threshold
where inline embedding would make routine autosave snapshots noticeably slow (a few tens of
megabytes is a reasonable rule of thumb to start tuning from); keep small test/sample projects
inline for simplicity. This tradeoff compounds with the diff-mode snapshotting described in
`architecture.md` §8 — external storage plus diff-mode snapshots is what keeps long editing
sessions on large projects from growing storage unboundedly.

## 4. Other performance notes

- **Frame extraction cadence**: extracting more frames from a source video improves
  reconstruction quality up to a point, then mostly adds compute cost for diminishing accuracy
  gain. Prefer moderate, steady camera motion during capture over maximizing frame count.
- **Turborepo caching**: `npm run build`/`typecheck`/`test` at the root are cached per package
  by Turborepo (`configuration.md` §1.1) — CI and local dev both benefit from this once a
  package's inputs haven't changed; don't work around it by hand-clearing caches unless you
  suspect a stale-cache bug.
- **SSE stream overhead** (`backend`/`cloud` modes): a very high `StageProgressEvent` emission
  rate from a plugin (calling `ctx.reportProgress` on every tiny increment) adds network and
  UI-render overhead with little user-visible benefit — report progress at a granularity a human
  can actually perceive (roughly every 1–5% of a stage's work, not every loop iteration).
