import type { GeometryOps, LoadGeometryOpsOptions } from './types.js';
import { createJsFallbackGeometryOps } from './fallback.js';

export type { FlatPointCloud, FlatPolyline, GeometryOps, LoadGeometryOpsOptions } from './types.js';
export { createJsFallbackGeometryOps } from './fallback.js';

/**
 * Structural shape of the generated wasm-bindgen `--target web` module,
 * once `npm run build:wasm` has produced `wasm/geometry_wasm.js` (see
 * README.md). This is hand-written rather than imported from a generated
 * `.d.ts` because the `wasm/` output directory is git-ignored and may not
 * exist at all in a given checkout -- that's the whole point of the
 * fallback below.
 */
interface WasmModuleExports {
  /** wasm-bindgen's `--target web` init function; must be awaited once before use. */
  default: (input?: unknown) => Promise<unknown>;
  downsample_point_cloud(points: Float32Array, voxelSize: number): Float32Array;
  simplify_polygon(points: Float32Array, epsilon: number): Float32Array;
  geometry_wasm_version(): string;
}

// Deliberately not a static string literal import specifier: this path only
// resolves after an opt-in `npm run build:wasm`, and this indirection keeps
// bundlers (Vite, etc.) from hard-failing at analysis time when it doesn't
// exist yet. At runtime, an unresolvable specifier simply rejects the
// dynamic import promise, which is handled below.
const WASM_MODULE_SPECIFIER = '../wasm/geometry_wasm.js';

const BUILD_INSTRUCTIONS =
  'The @topview/geometry-wasm wasm binary has not been built. Run ' +
  '`npm run build:wasm -w @topview/geometry-wasm` (requires a Rust ' +
  'toolchain + wasm-pack -- see packages/geometry-wasm/README.md), or call ' +
  'loadGeometryOps({ mode: "js-fallback" }) to use the pure-JS ' +
  'implementation instead.';

let wasmOpsPromise: Promise<GeometryOps> | null = null;

async function loadWasmOps(): Promise<GeometryOps> {
  if (!wasmOpsPromise) {
    wasmOpsPromise = (async () => {
      let mod: WasmModuleExports;
      try {
        mod = (await import(/* @vite-ignore */ WASM_MODULE_SPECIFIER)) as unknown as WasmModuleExports;
      } catch (cause) {
        throw new Error(BUILD_INSTRUCTIONS, { cause: cause as Error });
      }

      if (typeof mod.default === 'function') {
        // wasm-bindgen `--target web` modules require calling the default
        // export once to instantiate the `.wasm` binary before any other
        // export is usable.
        await mod.default();
      }

      const ops: GeometryOps = {
        backend: 'wasm',
        downsamplePointCloud: (points, voxelSize) => mod.downsample_point_cloud(points, voxelSize),
        simplifyPolygon: (points, epsilon) => mod.simplify_polygon(points, epsilon),
      };
      return ops;
    })();
  }
  return wasmOpsPromise;
}

let hasWarnedFallback = false;

/**
 * Resolves a {@link GeometryOps} implementation.
 *
 * Defaults (`mode: 'auto'`) to the wasm-accelerated backend, transparently
 * falling back to the pure-JS implementation (with a one-time console
 * warning) if the wasm module has not been built. This is the function the
 * SVG editor's snapping engine (`apps/web/src/svg-editor/snapping/`) calls,
 * so its snap behavior and any headless/CLI geometry cleanup share
 * identical math regardless of which backend actually ran.
 *
 * @example
 * ```ts
 * import { loadGeometryOps } from '@topview/geometry-wasm';
 *
 * const ops = await loadGeometryOps();
 * const thinned = ops.downsamplePointCloud(rawPoints, 0.02);
 * ```
 */
export async function loadGeometryOps(options: LoadGeometryOpsOptions = {}): Promise<GeometryOps> {
  const mode = options.mode ?? 'auto';

  if (mode === 'js-fallback') {
    return createJsFallbackGeometryOps();
  }

  if (mode === 'wasm') {
    return loadWasmOps();
  }

  try {
    return await loadWasmOps();
  } catch (err) {
    if (!hasWarnedFallback) {
      hasWarnedFallback = true;
      // Intentional one-time operator-facing warning.
      console.warn(
        `[@topview/geometry-wasm] falling back to the pure-JS geometry implementation: ${
          (err as Error).message
        }`,
      );
    }
    return createJsFallbackGeometryOps();
  }
}
