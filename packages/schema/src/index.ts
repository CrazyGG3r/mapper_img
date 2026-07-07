/**
 * `@topview/schema` — the dependency-free root of the TopView SVG Mapper
 * monorepo's type graph (docs/architecture.md §3). Every other
 * `@topview/*` package, and `services/reconstruction-api`'s hand-mirrored
 * Pydantic models, treat these shapes as the single source of truth.
 *
 * Public surface (docs/api.md §1):
 *  - Entities: `EntityId`, `AnyEntity`, `DetectedEntity`, `ConfidenceMeta`,
 *    plus concrete kinds (`Wall`, `Corner`, `Door`, `Window`, `Room`,
 *    `Furniture`), camera/point-cloud primitives (`CameraPose`, `PointCloud`).
 *  - Pipeline: `PipelineStageId`, `PipelineEvent`
 *    (`StageProgressEvent` | `StageLifecycleEvent` | `PipelineErrorEvent`),
 *    `PipelineErrorCode`.
 *  - Persistence: `ProjectDocument`, `ProjectVersion`, `TopviewProjectFile`.
 *  - Import/export: per-format option/result types for SVG/DXF/JSON/GeoJSON/OBJ/GLTF/PLY.
 *  - Build output: `dist/schema/*.json` — JSON Schema for a subset of these
 *    types (see src/schemas/ and scripts/copy-schemas.mjs), used by
 *    `services/reconstruction-api`'s CI contract-sync check
 *    (docs/architecture.md §7).
 */

export * from './entities';
export * from './pipeline';
export * from './project-format';
export * from './import-export-formats';
