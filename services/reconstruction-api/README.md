# services/reconstruction-api

FastAPI stub service for TopView's heavy-compute reconstruction stages
(structure-from-motion, dense reconstruction, AI inference, and batch
orchestration across those — PRS §26). No `package.json` lives anywhere in
this directory: it is deliberately invisible to the root npm workspace globs
(`apps/*`, `packages/*`, `plugins/*`) and nothing in the root npm scripts
references it.

## Status: unverified in this environment

**This environment has no Python installed.** Every file here has been
written carefully — real imports, real Pydantic v2 models, real FastAPI
routing — but **none of it has been executed, imported, type-checked, or
linted locally.** Treat any runtime error (a typo, an incompatible API
between the pinned dependency versions, an off-by-one in a Pydantic
constraint) as a normal bug to fix, not a surprise. The repo's CI (once
wired up in `.github/workflows/ci.yml`) provisions Python independently via
`actions/setup-python` and is the first place this code will actually run.

Before trusting this service beyond "plausible, well-typed scaffold":

```bash
cd services/reconstruction-api
python -m venv .venv && source .venv/bin/activate   # or .venv\Scripts\activate on Windows
pip install -r requirements.txt -r requirements-dev.txt
ruff check .
pytest
uvicorn app.main:app --reload --port 8000
curl http://localhost:8000/healthz
```

## Naming note — please reconcile before/while wiring root CI

This directory's Python package is named **`app`** (`app/main.py`,
`app/routers/`, `app/models.py`, entrypoint `app.main:app`), per this
service's explicit scaffolding instructions. An earlier, more detailed
planning pass for this same service (referenced in this monorepo's overall
blueprint discussion) described the package as **`reconstruction_api`**
(`reconstruction_api/main.py`, entrypoint `reconstruction_api.main:app`,
CI step `python -c "import reconstruction_api"`). Those two names are
**not** both present here — only `app/` exists.

If the root `.github/workflows/ci.yml` (out of this directory's scope,
authored by a different pass) contains a step like:

```yaml
- run: python -c "import reconstruction_api"
```

it will fail against this layout and needs to be updated to:

```yaml
- run: python -c "import app.main"
```

(and the Docker/uvicorn entrypoint, if referenced anywhere outside this
directory, should read `app.main:app`, matching `Dockerfile` and
`docker-compose.yml` in this directory, which already use that form
consistently). Flagging this explicitly here so it's a one-line fix instead
of a silent CI failure.

## Layout

```
services/reconstruction-api/
├── requirements.txt          (runtime deps; heavy optional deps commented out)
├── requirements-dev.txt      (pytest, httpx, ruff — dev/CI only)
├── pyproject.toml            (pytest + ruff config)
├── Dockerfile
├── docker-compose.yml        (snippet: reconstruction-api + how apps/web reaches it)
├── app/
│   ├── main.py                (FastAPI app factory, CORS, /healthz, router wiring)
│   ├── config.py              (pydantic-settings, env-driven — TOPVIEW_ prefix)
│   ├── models.py              (Pydantic mirror of @topview/schema entities — see caveat below)
│   ├── jobs.py                 (shared JobStatus/JobHandle/JobError vocabulary)
│   └── routers/
│       ├── sfm.py                       (POST/GET /sfm/jobs...)
│       ├── dense_reconstruction.py       (POST/GET /dense-reconstruction/jobs...)
│       ├── ai_inference.py               (POST/GET /ai-inference/jobs...)
│       └── batch.py                       (POST/GET/DELETE /batch/jobs...)
└── tests/
    ├── test_health.py
    └── test_stage_stubs.py    (asserts every router is wired and returns 501, not 404)
```

## What's real vs. stubbed

- **Real**: FastAPI app wiring, CORS, `/healthz`, every router's URL prefix
  and registration, every request/response Pydantic model (with actual field
  types, constraints, and docstrings), the entity models in `models.py`, job
  vocabulary in `jobs.py`, settings loading in `config.py`.
- **Stubbed**: every `/sfm`, `/dense-reconstruction`, `/ai-inference`, and
  `/batch` handler body. Each one validates its request against a real
  Pydantic model, then immediately raises `HTTPException(status_code=501)`
  with a descriptive message — this is the "stage stub" pattern used
  throughout the pipeline scaffold. No handler does partial or fake work; a
  501 is an honest signal that the compute backend (pycolmap/COLMAP,
  OpenMVS/Open3D, a real inference model) is not wired up yet.

## `app/models.py` alignment caveat

`Wall`, `Door`, `Window`, `Room`, `Furniture`, `CameraPose`, `PointCloud`, and
`ConfidenceMeta` in `app/models.py` are meant to structurally mirror
`@topview/schema`'s TypeScript entity types. At the time this service was
scaffolded, `packages/schema` had not yet been generated on disk in this
same pass (a different agent owns it), so these Pydantic models are a
best-effort, docs-consistent **proposal**, not a verified mirror. Once
`packages/schema/dist/schema/*.json` exists, diff it against these models —
ideally via the CI step described in `docs/architecture.md` (load the
generated JSON Schema and validate fixture payloads produced by these Python
models against it with the `jsonschema` package) — and fix drift here rather
than silently shipping a mismatch.

## Endpoints

Every stage router follows the same shape:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/healthz` | Liveness check (implemented, not a stub) |
| `POST` | `/sfm/jobs` | Submit a structure-from-motion job → 501 |
| `GET` | `/sfm/jobs/{job_id}` | Poll job status/result → 501 |
| `POST` | `/dense-reconstruction/jobs` | Submit a dense-reconstruction (MVS) job → 501 |
| `GET` | `/dense-reconstruction/jobs/{job_id}` | Poll job status/result → 501 |
| `POST` | `/ai-inference/jobs` | Submit an AI-inference (entity detection) job → 501 |
| `GET` | `/ai-inference/jobs/{job_id}` | Poll job status/result → 501 |
| `POST` | `/batch/jobs` | Submit a multi-stage batch job → 501 |
| `GET` | `/batch/jobs/{batch_id}` | Poll aggregate + per-stage batch status → 501 |
| `DELETE` | `/batch/jobs/{batch_id}` | Cancel a batch job → 501 |

## Docker / Compose

`Dockerfile` builds a `python:3.12-slim`-based image (with `libgl1` /
`libglib2.0-0` installed for `opencv-python`'s dlopen needs) and runs
`uvicorn app.main:app`. `docker-compose.yml` in this directory is a scoped
snippet showing this service alongside an illustrative `apps/web` service
reaching it at `http://reconstruction-api:8000` via
`VITE_RECONSTRUCTION_API_URL` — merge it into a root compose file once one
exists, rather than treating it as a full deployment topology on its own.
Also unverified locally (no Docker available in this environment either).
