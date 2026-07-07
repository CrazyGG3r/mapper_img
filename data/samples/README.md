# Sample datasets

This directory documents the expected shape of a sample dataset used by `tests/e2e` and by
anyone manually exercising the pipeline end-to-end (`docs/user-guide.md`). **No binary sample
data (video files, image sequences, point clouds) is committed to this repository.** Only this
README and per-sample provenance notes live under version control here — actual sample assets are
fetched/generated separately (see §3) and stored locally (or in a project's own storage/CDN, ignored
by git) before running anything that needs them.

## 1. Expected folder shape

Each sample dataset lives in its own subdirectory named after the sample:

```
data/samples/<sample-name>/
├── frames/                  (an image-sequence sample: numbered frame files, e.g. frame_0001.jpg, frame_0002.jpg, ...)
│   ├── frame_0001.jpg
│   ├── frame_0002.jpg
│   └── ...
│                            — or, for a video-sourced sample, a single source video file instead of a frames/ folder,
│                              e.g. <sample-name>/source.mp4 — matching whichever `sourceKind` (§2) the sample declares
├── expected-project.json    (a ProjectDocument fixture — the expected pipeline output, used by tests/e2e assertions)
└── NOTES.md                 (provenance / licensing notes for this specific sample)
```

Only one of `frames/` or a source video file should be present per sample, matching the
`sourceKind` the sample is meant to exercise (`@topview/schema`'s upload-stage input shape —
see `docs/architecture.md` §4 and `docs/api.md` for the `upload` stage). Don't provide both for
the same sample — it should be unambiguous which ingestion path (`frame-extraction`-from-video vs.
directly-supplied `frames/`) a given sample is exercising.

## 2. `expected-project.json`

This file is a `ProjectDocument` fixture (the same shape `apps/web`/`@topview/schema` produce and
consume — see `docs/api.md` §1) representing the *expected* end state after running the full
11-stage pipeline against this sample's source data. `tests/e2e` uses it as an assertion target:
after driving upload → pipeline completion → export in the built `apps/web`, the test compares
the resulting project's entities (walls, corners, furniture, layout) against this fixture,
typically with reasonable tolerances on things like vertex coordinates rather than requiring
byte-identical output.

Keep this fixture small and hand-reviewable — it should describe entity counts, rough
positions/types, and any specific validation-status expectations, not an exhaustive pixel-perfect
scene.

## 3. Where actual sample assets come from

Real capture files (video/images) are **never** committed to this repository — the working
directory intentionally has no binaries under `data/samples/`. When a sample is needed (for local
manual testing or for `tests/e2e` to run against real data):

- Fetch it from wherever the project's asset storage is configured (an external bucket/CDN,
  documented per-sample in that sample's `NOTES.md`), or
- Capture your own short walkthrough video/image sequence matching the folder shape above, or
- Use a synthetic/procedurally generated fixture where one exists for a given test scenario.

Whatever the source, place it under `data/samples/<sample-name>/` locally — this path is
`.gitignore`d for actual media files (see `.gitignore` at the repo root; only `README.md`,
`NOTES.md`, and `expected-project.json` per sample are meant to be tracked) so a contributor can
drop real assets in without risking an accidental commit of large binary data.

## 4. `NOTES.md` per sample

Every sample's `NOTES.md` should record, at minimum:

- **Provenance** — who/how it was captured (or generated), and when.
- **Licensing** — under what terms it may be used/redistributed (many real interior captures are
  not freely redistributable; synthetic/procedural samples should say so explicitly).
- **What it's meant to exercise** — e.g. "single rectangular room, video source, tests basic
  wall detection" or "L-shaped room with furniture, image-sequence source, tests furniture
  detection and multi-corner layout."

## 5. Adding a new sample

1. Create `data/samples/<new-sample-name>/`.
2. Add either `frames/` or a source video file (kept out of git — see §3), matching one
   `sourceKind`.
3. Run the pipeline against it once (any `computeMode`), review the output carefully, and hand-
   author `expected-project.json` from that reviewed output — don't just dump raw pipeline
   output verbatim without checking it, since this file becomes the correctness assertion for
   every future `tests/e2e` run against this sample.
4. Write `NOTES.md` per §4.
5. If `tests/e2e` should exercise this sample, wire it into that suite's test list (see
   `tests/e2e`'s own configuration — out of scope for this README, which only documents the
   fixture shape, not the test harness).
