import { describe, expect, it } from 'vitest';
import { createJsFallbackGeometryOps } from './fallback.js';
import { loadGeometryOps } from './index.js';

describe('createJsFallbackGeometryOps', () => {
  it('reports its backend as js-fallback', () => {
    const ops = createJsFallbackGeometryOps();
    expect(ops.backend).toBe('js-fallback');
  });

  describe('downsamplePointCloud', () => {
    it('collapses points inside the same voxel into a single centroid', () => {
      const ops = createJsFallbackGeometryOps();
      // Two points close together (same 1-unit voxel) + one far away point.
      const points = new Float32Array([0, 0, 0, 0.1, 0.1, 0.1, 5, 5, 5]);

      const result = ops.downsamplePointCloud(points, 1.0);

      expect(result.length).toBe(6); // 2 output points * 3 components
      // The collapsed voxel's centroid should be the average of the two inputs.
      expect(result[0]).toBeCloseTo(0.05, 5);
      expect(result[1]).toBeCloseTo(0.05, 5);
      expect(result[2]).toBeCloseTo(0.05, 5);
    });

    it('returns the input unchanged for a non-positive voxel size', () => {
      const ops = createJsFallbackGeometryOps();
      const points = new Float32Array([1, 2, 3, 4, 5, 6]);
      const result = ops.downsamplePointCloud(points, 0);
      expect(Array.from(result)).toEqual(Array.from(points));
    });
  });

  describe('simplifyPolygon', () => {
    it('drops a near-collinear midpoint that is within epsilon', () => {
      const ops = createJsFallbackGeometryOps();
      // (0,0) -> (1, 0.01) -> (2,0): middle point deviates ~0.01 from the
      // straight line, well within a 0.5 epsilon.
      const points = new Float32Array([0, 0, 1, 0.01, 2, 0]);

      const result = ops.simplifyPolygon(points, 0.5);

      expect(Array.from(result)).toEqual([0, 0, 2, 0]);
    });

    it('keeps a vertex that deviates more than epsilon', () => {
      const ops = createJsFallbackGeometryOps();
      // Middle point is a sharp 90-degree corner -- must survive simplification.
      const points = new Float32Array([0, 0, 1, 5, 2, 0]);

      const result = ops.simplifyPolygon(points, 0.5);

      expect(Array.from(result)).toEqual([0, 0, 1, 5, 2, 0]);
    });
  });
});

describe('loadGeometryOps', () => {
  it('falls back to the pure-JS implementation when the wasm module has not been built', async () => {
    // In this environment the wasm/ output has never been generated (no
    // Rust toolchain), so 'auto' mode must transparently degrade instead of
    // throwing -- this is the scaffold's core safety guarantee.
    const ops = await loadGeometryOps();
    expect(ops.backend).toBe('js-fallback');
  });

  it('honors an explicit js-fallback mode without attempting to load wasm', async () => {
    const ops = await loadGeometryOps({ mode: 'js-fallback' });
    expect(ops.backend).toBe('js-fallback');
  });

  it('throws a descriptive, actionable error when wasm is explicitly required but missing', async () => {
    await expect(loadGeometryOps({ mode: 'wasm' })).rejects.toThrow(/build:wasm/);
  });
});
