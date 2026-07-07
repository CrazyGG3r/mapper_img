import { describe, expect, it } from 'vitest';
import { createDefaultConfidenceMeta, type Wall } from '@topview/schema';
import { mergeCollinearSegments, mergeDuplicateEdges, orthogonalizeWalls, snapNearbyVertices } from '../src/cleanup.js';

function makeWall(id: string, start: { x: number; y: number }, end: { x: number; y: number }, overrides: Partial<Wall> = {}): Wall {
  const now = new Date().toISOString();
  return {
    id,
    kind: 'wall',
    layerId: 'layer-default',
    start,
    end,
    thicknessM: 0.1,
    confidence: createDefaultConfidenceMeta(),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('snapNearbyVertices', () => {
  it('snaps two endpoints within tolerance to a shared position', () => {
    const walls = [
      makeWall('w1', { x: 0, y: 0 }, { x: 2, y: 0.01 }),
      makeWall('w2', { x: 2.01, y: 0 }, { x: 4, y: 0 }),
    ];
    const { walls: snapped, snapped: count } = snapNearbyVertices(walls, 0.05);
    expect(count).toBeGreaterThan(0);
    expect(snapped[0]!.end.x).toBeCloseTo(snapped[1]!.start.x, 3);
    expect(snapped[0]!.end.y).toBeCloseTo(snapped[1]!.start.y, 3);
  });
});

describe('mergeDuplicateEdges', () => {
  it('removes a wall that duplicates another within tolerance, keeping the higher-confidence one', () => {
    const low = makeWall('w1', { x: 0, y: 0 }, { x: 1, y: 0 }, {
      confidence: createDefaultConfidenceMeta({ score: 0.3, source: 'detector' }),
    });
    const high = makeWall('w2', { x: 0.005, y: 0 }, { x: 1.005, y: 0 }, {
      confidence: createDefaultConfidenceMeta({ score: 0.9, source: 'detector' }),
    });
    const { walls, removed } = mergeDuplicateEdges([low, high], 0.02);
    expect(removed).toBe(1);
    expect(walls).toHaveLength(1);
    expect(walls[0]!.confidence.score).toBe(0.9);
  });

  it('keeps two walls that are not within tolerance', () => {
    const a = makeWall('w1', { x: 0, y: 0 }, { x: 1, y: 0 });
    const b = makeWall('w2', { x: 0, y: 5 }, { x: 1, y: 5 });
    const { walls, removed } = mergeDuplicateEdges([a, b], 0.02);
    expect(removed).toBe(0);
    expect(walls).toHaveLength(2);
  });
});

describe('mergeCollinearSegments', () => {
  it('merges two connected, collinear walls into one', () => {
    const a = makeWall('w1', { x: 0, y: 0 }, { x: 2, y: 0 });
    const b = makeWall('w2', { x: 2, y: 0 }, { x: 5, y: 0 });
    const { walls, merged } = mergeCollinearSegments([a, b], 3, 0.05);
    expect(merged).toBe(1);
    expect(walls).toHaveLength(1);
    expect(walls[0]!.start).toEqual({ x: 0, y: 0 });
    expect(walls[0]!.end).toEqual({ x: 5, y: 0 });
  });

  it('does not merge two walls meeting at a right angle', () => {
    const a = makeWall('w1', { x: 0, y: 0 }, { x: 2, y: 0 });
    const b = makeWall('w2', { x: 2, y: 0 }, { x: 2, y: 3 });
    const { walls, merged } = mergeCollinearSegments([a, b], 3, 0.05);
    expect(merged).toBe(0);
    expect(walls).toHaveLength(2);
  });
});

describe('orthogonalizeWalls', () => {
  it('snaps a near-horizontal wall to exactly horizontal, preserving length', () => {
    const wall = makeWall('w1', { x: 0, y: 0 }, { x: 10, y: 0.3 });
    const originalLength = Math.hypot(10, 0.3);
    const { walls, adjusted } = orthogonalizeWalls([wall], 6);
    expect(adjusted).toBe(1);
    const result = walls[0]!;
    expect(result.end.y).toBeCloseTo(0, 6);
    expect(Math.hypot(result.end.x - result.start.x, result.end.y - result.start.y)).toBeCloseTo(originalLength, 3);
  });

  it('leaves a low-confidence wall untouched', () => {
    const wall = makeWall('w1', { x: 0, y: 0 }, { x: 10, y: 0.3 }, {
      confidence: createDefaultConfidenceMeta({ score: 0.2, source: 'detector' }),
    });
    const { walls, adjusted } = orthogonalizeWalls([wall], 6);
    expect(adjusted).toBe(0);
    expect(walls[0]!.end).toEqual({ x: 10, y: 0.3 });
  });

  it('leaves a wall far from any right angle untouched', () => {
    const wall = makeWall('w1', { x: 0, y: 0 }, { x: 10, y: 4 });
    const { walls, adjusted } = orthogonalizeWalls([wall], 6);
    expect(adjusted).toBe(0);
    expect(walls[0]!.end).toEqual({ x: 10, y: 4 });
  });
});
