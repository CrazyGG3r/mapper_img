//! `geometry-wasm`: perf-critical geometry kernels for TopView SVG Mapper.
//!
//! Compiled to WebAssembly via `wasm-bindgen` (see `../README.md` and
//! `../scripts/build-wasm.mjs` for the opt-in `npm run build:wasm` build
//! step). The TypeScript wrapper in `../src/index.ts` loads the resulting
//! module and exposes it behind the same `GeometryOps` interface as the
//! pure-JS fallback in `../src/fallback.ts` -- the two implementations are
//! kept algorithmically equivalent by hand; if you change one, change the
//! other.
//!
//! Every exported function operates on flat `f32` buffers (not arrays of
//! structs) because that is the representation `wasm-bindgen` can hand
//! across the JS/wasm boundary as a `Float32Array` with a single copy, no
//! per-element marshaling.

use std::collections::HashMap;

use wasm_bindgen::prelude::*;

/// Voxel-grid downsamples a flat XYZ point cloud (`[x0,y0,z0,x1,y1,z1,...]`).
///
/// Points are bucketed into cubes of side `voxel_size` and each occupied
/// voxel collapses to the centroid of the points that fall inside it. This
/// is a standard, cheap point-cloud thinning strategy used before
/// downstream geometry recovery so later stages (and the SVG editor's
/// snapping engine) operate on a bounded number of points regardless of
/// raw reconstruction density.
///
/// Returns the input unchanged (copied) if `voxel_size` is non-positive or
/// the input has fewer than one full XYZ triple.
#[wasm_bindgen]
pub fn downsample_point_cloud(points: &[f32], voxel_size: f32) -> Vec<f32> {
    if !(voxel_size > 0.0) || points.len() < 3 {
        return points.to_vec();
    }

    #[derive(Default, Clone, Copy)]
    struct Bucket {
        sum_x: f64,
        sum_y: f64,
        sum_z: f64,
        count: u32,
    }

    let mut buckets: HashMap<(i64, i64, i64), Bucket> = HashMap::new();

    for chunk in points.chunks_exact(3) {
        let (x, y, z) = (chunk[0], chunk[1], chunk[2]);
        let key = (
            (x / voxel_size).floor() as i64,
            (y / voxel_size).floor() as i64,
            (z / voxel_size).floor() as i64,
        );
        let bucket = buckets.entry(key).or_insert_with(Bucket::default);
        bucket.sum_x += x as f64;
        bucket.sum_y += y as f64;
        bucket.sum_z += z as f64;
        bucket.count += 1;
    }

    let mut out = Vec::with_capacity(buckets.len() * 3);
    for bucket in buckets.values() {
        let n = f64::from(bucket.count);
        out.push((bucket.sum_x / n) as f32);
        out.push((bucket.sum_y / n) as f32);
        out.push((bucket.sum_z / n) as f32);
    }
    out
}

/// Simplifies a flat XY polyline/ring (`[x0,y0,x1,y1,...]`) with the
/// Ramer-Douglas-Peucker algorithm, dropping vertices that deviate from the
/// simplified line by less than `epsilon`. Endpoints are always kept.
///
/// Returns the input unchanged (copied) if there are fewer than 3 vertices
/// or `epsilon` is non-positive.
#[wasm_bindgen]
pub fn simplify_polygon(points: &[f32], epsilon: f32) -> Vec<f32> {
    let pts: Vec<(f32, f32)> = points.chunks_exact(2).map(|c| (c[0], c[1])).collect();
    if pts.len() < 3 || !(epsilon > 0.0) {
        return points.to_vec();
    }

    let mut keep = vec![false; pts.len()];
    keep[0] = true;
    keep[pts.len() - 1] = true;
    rdp(&pts, 0, pts.len() - 1, epsilon, &mut keep);

    let mut out = Vec::new();
    for (i, k) in keep.iter().enumerate() {
        if *k {
            out.push(pts[i].0);
            out.push(pts[i].1);
        }
    }
    out
}

/// Recursive Ramer-Douglas-Peucker over the index range `[start, end]`,
/// marking `keep[i] = true` for every vertex that must survive.
fn rdp(pts: &[(f32, f32)], start: usize, end: usize, epsilon: f32, keep: &mut [bool]) {
    if end <= start + 1 {
        return;
    }

    let (x1, y1) = pts[start];
    let (x2, y2) = pts[end];
    let dx = x2 - x1;
    let dy = y2 - y1;
    let seg_len_sq = dx * dx + dy * dy;

    let mut max_dist = -1.0f32;
    let mut max_index = start;

    for (i, &(x0, y0)) in pts.iter().enumerate().take(end).skip(start + 1) {
        let dist = if seg_len_sq == 0.0 {
            ((x0 - x1).powi(2) + (y0 - y1).powi(2)).sqrt()
        } else {
            (dy * x0 - dx * y0 + x2 * y1 - y2 * x1).abs() / seg_len_sq.sqrt()
        };
        if dist > max_dist {
            max_dist = dist;
            max_index = i;
        }
    }

    if max_dist > epsilon {
        keep[max_index] = true;
        rdp(pts, start, max_index, epsilon, keep);
        rdp(pts, max_index, end, epsilon, keep);
    }
}

/// Build metadata baked in at compile time, so the TS wrapper (or a human)
/// can sanity-check that a loaded `.wasm` binary actually matches this
/// source tree's `Cargo.toml` version.
#[wasm_bindgen]
pub fn geometry_wasm_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn downsample_collapses_points_in_the_same_voxel() {
        let points = vec![0.0, 0.0, 0.0, 0.1, 0.1, 0.1, 5.0, 5.0, 5.0];
        let result = downsample_point_cloud(&points, 1.0);
        assert_eq!(result.len(), 6); // two occupied voxels -> two points
    }

    #[test]
    fn downsample_passes_through_on_non_positive_voxel_size() {
        let points = vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0];
        let result = downsample_point_cloud(&points, 0.0);
        assert_eq!(result, points);
    }

    #[test]
    fn simplify_drops_near_collinear_midpoint() {
        let points = vec![0.0, 0.0, 1.0, 0.01, 2.0, 0.0];
        let result = simplify_polygon(&points, 0.5);
        assert_eq!(result, vec![0.0, 0.0, 2.0, 0.0]);
    }

    #[test]
    fn simplify_keeps_a_sharp_corner() {
        let points = vec![0.0, 0.0, 1.0, 5.0, 2.0, 0.0];
        let result = simplify_polygon(&points, 0.5);
        assert_eq!(result, points);
    }

    #[test]
    fn version_is_reported() {
        assert_eq!(geometry_wasm_version(), env!("CARGO_PKG_VERSION"));
    }
}
