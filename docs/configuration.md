# Configuration

## 1. Build/tooling configuration: `turbo.json` and `tsconfig.base.json`

### 1.1 `turbo.json`

The root `turbo.json` defines the task graph Turborepo uses to order and cache work across every
workspace package:

```jsonc
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "lint": {},
    "test": {
      "dependsOn": ["^build"]
    }
  }
}
```

- `"dependsOn": ["^build"]` means "build this package's internal `@topview/*` dependencies first"
  — Turborepo reads this alongside each package's own `package.json#dependencies` to compute the
  correct build order automatically from the dependency graph in `architecture.md` §3. You never
  need to hand-order `packages/schema` before `packages/plugin-sdk` before `packages/pipeline-core`
  — Turborepo derives it.
- `"outputs": ["dist/**"]` tells Turborepo what to cache; unchanged packages skip rebuilding
  entirely on a cache hit, which is why `npm run build` gets fast after the first run.
- `typecheck` and `test` also depend on `^build` because they need built `.d.ts`/`dist` output
  from internal dependencies to type-check or run against, mirroring how `apps/web` actually
  consumes its `@topview/*` dependencies.

### 1.2 `tsconfig.base.json`

The root `tsconfig.base.json` holds compiler options shared by every package (target/module
settings, `strict: true`, consistent module resolution). Every package's own `tsconfig.json`
extends it:

```jsonc
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "outDir": "dist" }, "include": ["src"] }
```

`apps/web`'s `tsconfig.json` is a **solution file** — it contains no compiler options itself,
only `references` to `tsconfig.app.json` (browser code) and `tsconfig.node.json` (Vite config,
Node-context code), which is why `apps/web`'s `build`/`typecheck` scripts invoke `tsc -b` against
both explicitly rather than a single config.

Never loosen `strict` mode in an individual package's `tsconfig.json` — if a package's types are
awkward under `strict`, fix the types, since every downstream consumer relies on those types
being sound (this matters especially for `@topview/schema`, whose types anchor the entire graph).

## 2. `computeMode` selection

`apps/web/src/settings/` exposes a `computeMode` setting with three values, each backed by a
different `ComputeBackendHandle` implementation (see `architecture.md` §4):

| `computeMode` | Backend | What it needs |
|---|---|---|
| `local` | `LocalComputeBackend` | Nothing extra — runs in-browser (WebWorkers/WASM). Default. |
| `backend` | `HttpComputeBackend` | A reachable `services/reconstruction-api` instance (see `deployment.md`). Configure its base URL via the environment variable in §4. |
| `cloud` | `CloudComputeBackend` | A managed endpoint; stubbed for v1 (see `roadmap.md`). |

Changing `computeMode` swaps which backend `createPipelineRunner()` is constructed with; the
`PipelineRunner`, the `PipelineEvent` protocol, and every UI subscriber are identical regardless
of mode — see `architecture.md` §§4–5 for why that's true by construction rather than by
UI-layer branching.

## 3. Plugin `configSchema` → settings UI

Every registered plugin declares a `configSchema` (JSON Schema) in its `plugin.manifest.json`
(see `plugin-development.md` §2). `apps/web/src/settings/` renders one form control per schema
property automatically:

- `{ "type": "number", "default": 0.3 }` → a numeric input pre-filled with the default.
- `{ "type": "boolean" }` → a checkbox.
- `{ "type": "string", "enum": [...] }` → a select.

There is no per-plugin custom settings code to write — a plugin author who wants a working
settings panel needs only an accurate `configSchema`. When the user changes a value, the form
validates it against the schema client-side, then calls the plugin instance's `configure()` with
the validated value (see `plugin-development.md` §4 step 6).

## 4. Environment variables

### `apps/web`

Vite-style `import.meta.env.VITE_*` variables, set via a `.env.local` file (gitignored) or the
hosting platform's environment configuration:

| Variable | Purpose | Default |
|---|---|---|
| `VITE_RECONSTRUCTION_API_BASE_URL` | Base URL `HttpComputeBackend` targets when `computeMode: 'backend'` | `http://localhost:8000` |
| `VITE_DEFAULT_COMPUTE_MODE` | Initial `computeMode` shown on first run | `local` |

### `services/reconstruction-api`

Managed via `pydantic-settings` in `reconstruction_api/config.py`, reading from process
environment (or a `.env` file, gitignored):

| Variable | Purpose | Default |
|---|---|---|
| `RECONSTRUCTION_API_HOST` | Bind host | `0.0.0.0` |
| `RECONSTRUCTION_API_PORT` | Bind port | `8000` |
| `RECONSTRUCTION_API_CORS_ORIGINS` | Comma-separated allowed origins | `*` (tighten before any real deployment — see `deployment.md`) |
| `RECONSTRUCTION_API_LOG_LEVEL` | Logging verbosity | `info` |

Never commit a populated `.env` file for either side — `.gitignore` at the repo root and inside
`services/reconstruction-api/` excludes them; commit only documented defaults here and in
`deployment.md`.

## 5. Dependency policy configuration: `tools/dependency-policy.json`

A machine-readable mirror of the dependency table in `architecture.md` §3, consumed by
`scripts/verify-dependency-graph.mjs` (`npm run verify-deps`):

```jsonc
{
  "@topview/web": ["@topview/schema", "@topview/plugin-sdk", "@topview/pipeline-core", "@topview/svg-engine", "@topview/geometry-wasm"],
  "@topview/schema": [],
  "@topview/plugin-sdk": ["@topview/schema"],
  "@topview/pipeline-core": ["@topview/schema", "@topview/plugin-sdk", "@topview/svg-engine"],
  "@topview/svg-engine": ["@topview/schema", "@topview/geometry-wasm"],
  "@topview/geometry-wasm": ["@topview/schema"],
  "@topview/plugin-example-detector": ["@topview/schema", "@topview/plugin-sdk"]
}
```

If you add a new internal package or a new legitimate dependency edge, update this file in the
same change — `verify-deps` fails CI the moment a package's `package.json#dependencies` lists a
`@topview/*` entry this policy doesn't allow for it.
