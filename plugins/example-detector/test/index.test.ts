import { describe, expect, it } from 'vitest';
import { createPluginRegistry } from '@topview/plugin-sdk';
import type { FeatureDetectionRequest, PluginExecutionContext } from '@topview/plugin-sdk';
import { ExampleWallDetector, EXAMPLE_WALL_DETECTOR_MANIFEST } from '../src/index.js';

function makePointCloudBuffer(points: { x: number; y: number; z: number }[]): ArrayBuffer {
  const flat = new Float32Array(points.length * 3);
  points.forEach((p, i) => {
    flat[i * 3] = p.x;
    flat[i * 3 + 1] = p.y;
    flat[i * 3 + 2] = p.z;
  });
  return flat.buffer;
}

function makeContext(pointCloudBuffer: ArrayBuffer): PluginExecutionContext {
  return {
    runId: 'run-1',
    projectId: 'proj-1',
    stage: 'wall-detection',
    log: { debug() {}, info() {}, warn() {}, error() {} },
    reportProgress() {},
    resolveDataRef: async () => pointCloudBuffer,
  };
}

describe('ExampleWallDetector', () => {
  it('registers cleanly against a real PluginRegistry', () => {
    const registry = createPluginRegistry('0.1.0');
    const result = registry.tryRegister(EXAMPLE_WALL_DETECTOR_MANIFEST, () => new ExampleWallDetector());
    expect(result.ok).toBe(true);
  });

  it('detects a wall from a projected point cloud', async () => {
    const points = Array.from({ length: 60 }, (_, i) => {
      const t = i / 59;
      return { x: t * 4, y: 0.01 * Math.sin(i), z: 1.2 };
    });
    const buffer = makePointCloudBuffer(points);
    const ctx = makeContext(buffer);
    const detector = new ExampleWallDetector();
    detector.configure({ distanceThresholdM: 0.05, minSegmentLengthM: 0.3 });

    const request: FeatureDetectionRequest = {
      runId: 'run-1',
      projectId: 'proj-1',
      stage: 'wall-detection',
      pointCloud: { id: 'pc-1', uri: 'memory://pc-1' },
    };

    const detected = await detector.detect(request, ctx);
    expect(detected.length).toBeGreaterThanOrEqual(1);
    expect(detected[0]!.kind).toBe('wall');
    expect(detected[0]!.geometry.points2D).toHaveLength(2);
    expect(detected[0]!.confidence).toBeGreaterThan(0);
    expect(detected[0]!.sourcePluginId).toBe(EXAMPLE_WALL_DETECTOR_MANIFEST.id);
  });

  it('returns no entities and does not throw when no point cloud is provided', async () => {
    const ctx = makeContext(new ArrayBuffer(0));
    const detector = new ExampleWallDetector();
    const request: FeatureDetectionRequest = { runId: 'run-1', projectId: 'proj-1', stage: 'wall-detection' };
    const detected = await detector.detect(request, ctx);
    expect(detected).toEqual([]);
  });
});
