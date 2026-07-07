import type { FlatPointCloud, FlatPolyline, GeometryOps } from './types.js';

/**
 * Pure-JS voxel-grid downsampling. Algorithmically equivalent to
 * `downsample_point_cloud` in `crate/src/lib.rs` -- if you change one,
 * change the other. See {@link GeometryOps.downsamplePointCloud}.
 */
function downsamplePointCloudJs(points: FlatPointCloud, voxelSize: number): FlatPointCloud {
  if (!(voxelSize > 0) || points.length < 3) {
    return points.slice();
  }

  const buckets = new Map<string, { sx: number; sy: number; sz: number; n: number }>();

  for (let i = 0; i + 2 < points.length; i += 3) {
    const x = points[i]!;
    const y = points[i + 1]!;
    const z = points[i + 2]!;
    const key = `${Math.floor(x / voxelSize)}|${Math.floor(y / voxelSize)}|${Math.floor(z / voxelSize)}`;
    const bucket = buckets.get(key) ?? { sx: 0, sy: 0, sz: 0, n: 0 };
    bucket.sx += x;
    bucket.sy += y;
    bucket.sz += z;
    bucket.n += 1;
    buckets.set(key, bucket);
  }

  const out = new Float32Array(buckets.size * 3);
  let i = 0;
  for (const bucket of buckets.values()) {
    out[i++] = bucket.sx / bucket.n;
    out[i++] = bucket.sy / bucket.n;
    out[i++] = bucket.sz / bucket.n;
  }
  return out;
}

/** Perpendicular distance from (x0,y0) to the infinite line through (x1,y1)-(x2,y2). */
function perpendicularDistance(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const segLenSq = dx * dx + dy * dy;
  if (segLenSq === 0) {
    return Math.hypot(x0 - x1, y0 - y1);
  }
  return Math.abs(dy * x0 - dx * y0 + x2 * y1 - y2 * x1) / Math.sqrt(segLenSq);
}

/** Recursive Ramer-Douglas-Peucker over an index range, marking `keep`. */
function rdp(
  pts: ReadonlyArray<readonly [number, number]>,
  start: number,
  end: number,
  epsilon: number,
  keep: Uint8Array,
): void {
  if (end <= start + 1) {
    return;
  }

  const [x1, y1] = pts[start]!;
  const [x2, y2] = pts[end]!;

  let maxDist = -1;
  let maxIndex = start;

  for (let i = start + 1; i < end; i++) {
    const [x0, y0] = pts[i]!;
    const dist = perpendicularDistance(x0, y0, x1, y1, x2, y2);
    if (dist > maxDist) {
      maxDist = dist;
      maxIndex = i;
    }
  }

  if (maxDist > epsilon) {
    keep[maxIndex] = 1;
    rdp(pts, start, maxIndex, epsilon, keep);
    rdp(pts, maxIndex, end, epsilon, keep);
  }
}

/**
 * Pure-JS Ramer-Douglas-Peucker simplification. Algorithmically equivalent
 * to `simplify_polygon` in `crate/src/lib.rs` -- if you change one, change
 * the other. See {@link GeometryOps.simplifyPolygon}.
 */
function simplifyPolygonJs(points: FlatPolyline, epsilon: number): FlatPolyline {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    pts.push([points[i]!, points[i + 1]!]);
  }
  if (pts.length < 3 || !(epsilon > 0)) {
    return points.slice();
  }

  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  rdp(pts, 0, pts.length - 1, epsilon, keep);

  const out: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    if (keep[i]) {
      const [x, y] = pts[i]!;
      out.push(x, y);
    }
  }
  return new Float32Array(out);
}

/**
 * Pure-JS/TS implementation of {@link GeometryOps}. Slower than the wasm
 * backend on large inputs, but has zero build step and zero native
 * toolchain dependency, so the rest of the application -- and its tests --
 * can run end to end without Rust/wasm-pack ever being installed.
 */
export function createJsFallbackGeometryOps(): GeometryOps {
  return {
    backend: 'js-fallback',
    downsamplePointCloud: downsamplePointCloudJs,
    simplifyPolygon: simplifyPolygonJs,
  };
}
