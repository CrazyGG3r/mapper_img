# User Guide

This guide walks through the end-to-end workflow: uploading a walkthrough video, watching the
11-stage reconstruction pipeline run, reviewing and correcting detected entities, editing the
resulting floor plan, and exporting it.

## 1. Upload

Open `apps/web` and start a new project (`apps/web/src/upload/`). You can provide either:

- a single walkthrough **video** of the space, or
- a pre-captured **image sequence** (a folder of still photos taken while moving through the
  space).

See `data/samples/README.md` for the exact folder shape expected of a sample dataset if you're
testing with one of the provided sample fixtures rather than your own capture.

Before uploading, pick a **compute mode** in `apps/web/src/settings/` — `local` (runs entirely in
your browser, no server needed), `backend` (offloads the heavy stages to a
`services/reconstruction-api` instance you or your organization runs), or `cloud` (managed,
currently stubbed — see `roadmap.md`). You can change this later per-project; it only affects
*where* the pipeline computes, never what it computes.

## 2. Watch the pipeline run

Once uploaded, the project moves through eleven stages, each rendered as a progress row in
`apps/web/src/pipeline-view/`:

1. **Upload** — ingest the video/image sequence
2. **Frame extraction** — sample frames at a target cadence
3. **Feature detection** — 2D keypoints per frame
4. **Camera reconstruction** — estimate where the camera was for each frame (SfM)
5. **Point cloud generation** — build a 3D point cloud from the reconstructed cameras
6. **Geometry recovery** — extract planar surfaces/primitives from the point cloud
7. **Wall detection** — classify recovered geometry into walls and corners
8. **Furniture detection** — detect furniture/fixture entities
9. **Layout generation** — assemble a coherent top-down 2D layout
10. **SVG cleanup** — snap and simplify the layout into clean vector geometry
11. **Export-ready** — the project is now ready to review, edit, and export

Each row updates live from `StageProgressEvent`s (a moving fraction and status message) and
transitions through `StageLifecycleEvent`s (`stage:started` → `stage:completed`, or
`stage:skipped` if a stage has nothing to do for this project). If a stage fails, a
`PipelineErrorEvent` surfaces an error message and whether it's recoverable — see
`troubleshooting.md` for what specific error codes mean and how to respond to them.

Detectors that produce entities (wall detection, furniture detection) run through whatever
plugins are currently registered — the built-in reference plugin ships by default and produces
no entities on its own; install and enable a real detection plugin to get actual wall/furniture
results (see `plugin-development.md` if you're building one, or `configuration.md` for how
installed plugins get registered).

## 3. Review detections

Every entity a detector produces carries a **confidence** score and a **validation status**
(`unreviewed`, `user-accepted`, `user-rejected`). After the pipeline completes, review the
detected walls, corners, and furniture in the viewers (`apps/web/src/viewers/` — video,
point-cloud, depth, and SVG views, all showing the same underlying project) and in the SVG
editor itself. Low-confidence entities are the ones most worth a manual look — see
`troubleshooting.md`'s low-confidence review workflow section for a suggested triage order.

Accepting or rejecting a detected entity is an ordinary, undoable editor action — see §4.

## 4. Edit in the SVG editor

`apps/web/src/svg-editor/` is where you clean up the automatically generated floor plan:

- **Vertex editing** — drag wall endpoints/corners.
- **Edge editing** — split or merge wall segments.
- **Snapping** — dragged geometry snaps to nearby vertices/edges/angles using the same geometry
  math the automated SVG cleanup stage used (`@topview/geometry-wasm`'s `GeometryOps`), so manual
  edits and automated cleanup never disagree about what counts as "aligned."
- **Layers** — toggle visibility/lock per layer (e.g. hide furniture while cleaning up walls).
- **Validation status** — accept or reject a detected entity directly in the editor.

Every one of these — dragging a vertex, splitting a wall, toggling a layer, rejecting a detected
entity — is modeled as one `EditorCommand` on a single undo/redo stack. That means undo/redo is
completely uniform: rejecting a wall you don't trust is exactly as undoable as nudging its
endpoint one pixel, and you can freely mix geometry edits and review decisions in one undo
history without either kind "winning" over the other.

## 5. Autosave and version history

Your project autosaves continuously (`apps/web/src/project/`'s `AutosaveManager`) — on a
debounce timer, on every completed pipeline stage, and on destructive edits. The version history
panel lists these saved `ProjectVersion`s with timestamps; restoring an older version is itself a
single undoable editor action, so if you restore and change your mind, undo brings you right
back to where you were.

## 6. Export

Once you're happy with the layout, use the export stage (`apps/web/src/svg-editor/` export
action, backed by `@topview/svg-engine`'s `Exporter` adapters) to produce the final deliverable —
a clean SVG floor plan reflecting every accepted entity and edit. Additional export formats are
added by registering additional `Exporter` adapters (see `configuration.md` and
`plugin-development.md` for the general plugin registration pattern, which export adapters follow
too).

## 7. Choosing a compute mode day-to-day

- Use **local** for a self-contained, no-setup workflow — best for trying the tool out or working
  offline.
- Use **backend** once you (or your organization) are running `services/reconstruction-api` — see
  `deployment.md` — for heavier projects or shared/team usage where you don't want reconstruction
  compute tied to one person's browser tab.
- **Cloud** is not yet functional (`roadmap.md`); the setting exists so switching to it later
  requires no project migration.
