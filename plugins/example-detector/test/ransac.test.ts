import { describe, expect, it } from 'vitest';
import { extractLineSegments, type Point2 } from '../src/ransac.js';

/** Deterministic pseudo-noise so the test doesn't depend on Math.random. */
function noise(i: number, amplitude: number): number {
  return (Math.sin(i * 12.9898) * 43758.5453 % 1) * amplitude;
}

function pointsAlong(start: Point2, end: Point2, count: number, noiseAmplitude: number, seedOffset: number): Point2[] {
  const points: Point2[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const x = start.x + (end.x - start.x) * t;
    const y = start.y + (end.y - start.y) * t;
    points.push({ x: x + noise(i + seedOffset, noiseAmplitude), y: y + noise(i + seedOffset + 1000, noiseAmplitude) });
  }
  return points;
}

describe('extractLineSegments', () => {
  it('recovers a single straight wall from noisy points along it', () => {
    const points = pointsAlong({ x: 0, y: 0 }, { x: 5, y: 0 }, 60, 0.01, 1);
    const segments = extractLineSegments(points, { distanceThresholdM: 0.05, minInliers: 10 });

    expect(segments.length).toBeGreaterThanOrEqual(1);
    const seg = segments[0]!;
    const length = Math.hypot(seg.end.x - seg.start.x, seg.end.y - seg.start.y);
    expect(length).toBeGreaterThan(4.5);
    // both endpoints should be near y=0
    expect(Math.abs(seg.start.y)).toBeLessThan(0.1);
    expect(Math.abs(seg.end.y)).toBeLessThan(0.1);
  });

  it('recovers two perpendicular walls sharing a corner', () => {
    const horizontal = pointsAlong({ x: 0, y: 0 }, { x: 5, y: 0 }, 50, 0.01, 1);
    const vertical = pointsAlong({ x: 5, y: 0 }, { x: 5, y: 4 }, 50, 0.01, 500);
    const points = [...horizontal, ...vertical];

    const segments = extractLineSegments(points, { distanceThresholdM: 0.05, minInliers: 10 });
    expect(segments.length).toBeGreaterThanOrEqual(2);

    const lengths = segments.map((s) => Math.hypot(s.end.x - s.start.x, s.end.y - s.start.y)).sort((a, b) => b - a);
    expect(lengths[0]).toBeGreaterThan(3.5);
    expect(lengths[1]).toBeGreaterThan(2.5);
  });

  it('finds nothing in pure noise below the inlier threshold', () => {
    const points: Point2[] = Array.from({ length: 20 }, (_, i) => ({
      x: noise(i, 5),
      y: noise(i + 777, 5),
    }));
    const segments = extractLineSegments(points, { minInliers: 15 });
    expect(segments).toHaveLength(0);
  });

  it('is deterministic for a fixed seed', () => {
    const points = pointsAlong({ x: 0, y: 0 }, { x: 3, y: 0 }, 40, 0.02, 3);
    const a = extractLineSegments(points, { seed: 42 });
    const b = extractLineSegments(points, { seed: 42 });
    expect(a).toEqual(b);
  });
});
