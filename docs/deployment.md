# Deployment

TopView SVG Mapper supports three deployment/compute topologies, selected per-project via the
`computeMode` setting (`architecture.md` §4, `configuration.md` §2): **local**, **hybrid
(backend)**, and **cloud**. This document covers deploying each of the pieces involved.

## 1. `apps/web` — static hosting

`apps/web` builds to a static bundle:

```bash
cd apps/web
npm run build          # tsc -b + vite build → apps/web/dist/
npm run preview        # serve the production build locally for a smoke test
```

The output of `npm run build` (`apps/web/dist/`) is a fully static site — HTML/JS/CSS/WASM
assets — deployable to any static host (S3+CloudFront, Netlify, Vercel, GitHub Pages, an nginx
container, etc.). There is no server-side rendering and no required backend for
`computeMode: 'local'`: a user can open the built app, upload a video, and run the entire 11-stage
pipeline, edit, and export, entirely client-side.

Set `VITE_RECONSTRUCTION_API_BASE_URL` (see `configuration.md` §4) at build time (or via runtime
config injection, if your host supports it) if you want the deployed app to default to pointing
at a specific `services/reconstruction-api` instance for `computeMode: 'backend'`.

## 2. Local mode (no backend)

The simplest deployment: host `apps/web`'s static build anywhere, set (or leave default)
`computeMode: 'local'`. All 11 stages run in the browser via `LocalComputeBackend`
(WebWorkers/WASM), and projects persist to the browser's IndexedDB. No server component is
required at all. This is the mode the MVP targets first — see `roadmap.md` Phase 1.

Tradeoffs (see `performance.md` for detail): compute is bounded by the end user's device, and
project data lives only in that browser unless the user exports it.

## 3. Hybrid mode (`apps/web` + `services/reconstruction-api`)

Set `computeMode: 'backend'`, pointed at a running `services/reconstruction-api` instance.
`HttpComputeBackend` submits jobs to `POST /stages/{stage}/jobs` and streams progress from
`GET /stages/{stage}/jobs/{job_id}/events` (full contract in `api.md` §8).

### 3.1 Running the backend via Docker

```bash
cd services/reconstruction-api
docker build -t topview-reconstruction-api .
docker run -p 8000:8000 \
  -e RECONSTRUCTION_API_CORS_ORIGINS=https://your-web-app.example.com \
  topview-reconstruction-api
```

### 3.2 Docker Compose (co-locating web + backend for a self-hosted deployment)

A minimal `docker-compose.yml` shape for self-hosting both pieces together (adjust image
build/push steps for your registry):

```yaml
services:
  reconstruction-api:
    build: ./services/reconstruction-api
    ports: ["8000:8000"]
    environment:
      RECONSTRUCTION_API_CORS_ORIGINS: "http://localhost:5173"
  web:
    build: ./apps/web
    ports: ["8080:80"]
    environment:
      VITE_RECONSTRUCTION_API_BASE_URL: "http://localhost:8000"
```

(`apps/web`'s own Dockerfile, if added, would build the static bundle and serve it via a minimal
web server image — since `apps/web` produces a static site, any static-file image works.)

### 3.3 Production hardening before going live

- **CORS**: `services/reconstruction-api/reconstruction_api/main.py` ships with
  `allow_origins=["*"]` for local development convenience. Before any real deployment, set
  `RECONSTRUCTION_API_CORS_ORIGINS` to the exact origin(s) `apps/web` is served from — never run
  the wildcard in production.
- **TLS**: terminate TLS in front of both the static host and the API (a reverse proxy/load
  balancer, e.g. nginx, Caddy, or your cloud provider's managed LB) — neither `vite preview` nor
  bare `uvicorn` are production TLS terminators.
- **Job durability**: the backend stub's job registry (`reconstruction_api/jobs/manager.py`) is
  in-process for v1 — a process restart loses in-flight jobs. Treat this as a known v1 limitation
  (see `roadmap.md`), not something to paper over with retries in the client.

## 4. Cloud mode

`computeMode: 'cloud'` targets `CloudComputeBackend`, a managed/hosted variant of the same
`ComputeBackendHandle` contract `HttpComputeBackend` satisfies, aimed at offloading compute to a
provider-managed fleet instead of a self-hosted `services/reconstruction-api` instance. This mode
is **stubbed in v1** — the interface exists so the rest of the system (pipeline orchestration,
event protocol, editor, autosave) is written against the same abstraction from day one, but there
is no managed endpoint to point it at yet. See `roadmap.md` for when this is expected to become
real, and treat any current `cloud` selection in the settings UI as a placeholder, not a working
path.

## 5. `packages/geometry-wasm` accelerated build in deployed builds

If you built the Rust/WASM-accelerated geometry kernels locally (`npm run build:wasm`, requires
`cargo` — see `installation.md` §6), make sure your CI/build pipeline that produces the deployed
`apps/web` bundle either (a) also has a Rust toolchain and runs the same `build:wasm` step before
`vite build`, or (b) intentionally ships the pure-TypeScript fallback. Do not assume a locally
built `.wasm` artifact is picked up by a deployment pipeline that never ran `build:wasm` itself —
see `performance.md` for the tradeoff and `installation.md` §6 for the build step.

## 6. `tests/e2e` against a deployed environment

`tests/e2e` (Playwright) is written to drive a *built* `apps/web` as a black box over HTTP (see
`architecture.md` §2 and `installation.md` §7). Pointing it at a staging deployment instead of a
local `vite preview` is a matter of configuring its base URL — it never depends on
`apps/web/src` internals, by construction, so "deployed staging environment" and "local preview
server" are equally valid targets for it.
