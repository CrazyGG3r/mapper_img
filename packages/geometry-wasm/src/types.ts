/**
 * A flat XYZ point cloud: `[x0, y0, z0, x1, y1, z1, ...]`.
 *
 * Flat typed arrays (rather than an array of `{x,y,z}` objects) are used
 * throughout this package because they are the representation both the
 * wasm-bindgen boundary (§ crate/src/lib.rs) and the pure-JS fallback
 * (§ src/fallback.ts) can share without any conversion cost.
 */
export type FlatPointCloud = Float32Array;

/** A flat XY polyline/polygon ring: `[x0, y0, x1, y1, ...]`. */
export type FlatPolyline = Float32Array;

/**
 * Perf-critical geometry operations used by the SVG editor's snapping
 * engine and by pipeline stages that need to simplify or thin out raw
 * reconstruction output before it becomes editable entities.
 *
 * Two interchangeable implementations exist:
 *  - a wasm-bindgen/Rust backend (`crate/`, built via `npm run build:wasm`)
 *  - a pure-JS/TS fallback (`src/fallback.ts`) that needs no native toolchain
 *
 * Callers should not need to care which one they got -- see
 * {@link loadGeometryOps} in `src/index.ts`.
 */
export interface GeometryOps {
  /** Identifies which implementation is backing these ops. */
  readonly backend: 'wasm' | 'js-fallback';

  /**
   * Voxel-grid downsamples a flat XYZ point cloud: points are bucketed into
   * `voxelSize`-sided cubes and each occupied voxel collapses to the
   * centroid of the points that fall inside it.
   *
   * @param points flat `[x,y,z,...]` array, length must be a multiple of 3
   * @param voxelSize edge length of each voxel cube, in the point cloud's
   *   own units (typically meters)
   * @returns a new flat `[x,y,z,...]` array, one point per occupied voxel
   */
  downsamplePointCloud(points: FlatPointCloud, voxelSize: number): FlatPointCloud;

  /**
   * Simplifies a flat XY polyline/ring with the Ramer-Douglas-Peucker
   * algorithm, dropping vertices that deviate from the simplified line by
   * less than `epsilon`. Endpoints are always kept.
   *
   * @param points flat `[x,y,...]` array, length must be a multiple of 2
   * @param epsilon maximum perpendicular deviation allowed before a vertex
   *   is considered load-bearing and kept
   * @returns a new, shorter (or equal-length) flat `[x,y,...]` array
   */
  simplifyPolygon(points: FlatPolyline, epsilon: number): FlatPolyline;
}

export interface LoadGeometryOpsOptions {
  /**
   * - `'auto'` (default): try to load the compiled wasm module; if it has
   *   not been built (see README.md's `build:wasm` step) or fails to load
   *   for any reason, transparently fall back to the pure-JS
   *   implementation and log a one-time console warning.
   * - `'wasm'`: require the wasm module; throws a descriptive error instead
   *   of silently falling back if it has not been built.
   * - `'js-fallback'`: always use the pure-JS implementation, skipping the
   *   wasm module entirely. Useful in tests/CI environments known not to
   *   have a Rust toolchain.
   */
  mode?: 'auto' | 'wasm' | 'js-fallback';
}
