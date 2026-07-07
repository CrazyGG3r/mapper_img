import { describe, expect, it } from 'vitest';
import { createPluginRegistry } from '@topview/plugin-sdk';
import type { DetectedEntity, Exporter, ExportRequest, ExportResult, FeatureDetectionRequest, FeatureDetector, PluginExecutionContext, PluginManifest } from '@topview/plugin-sdk';
import type { PipelineEvent } from '@topview/schema';
import { createPipelineRunner } from '../src/orchestrator.js';

const SDK_VERSION = '0.1.0';

function fakeWallDetector(): { manifest: PluginManifest; instance: FeatureDetector } {
  const manifest: PluginManifest = {
    id: 'test.detector.fake-wall',
    name: 'Fake Wall Detector',
    version: '0.1.0',
    kind: 'feature-detector',
    sdkVersionRange: '^0.1.0',
    detects: ['wall'],
    entryPoint: './index.js',
  };
  const instance: FeatureDetector = {
    manifestId: manifest.id,
    detects: ['wall'],
    configure: () => {},
    async detect(request: FeatureDetectionRequest, ctx: PluginExecutionContext): Promise<DetectedEntity[]> {
      ctx.reportProgress(0.5, 'detecting');
      const entity: DetectedEntity = {
        id: 'wall-1',
        kind: 'wall',
        geometry: { points2D: [{ x: 0, y: 0 }, { x: 3, y: 0 }] },
        confidence: 0.8,
        sourcePluginId: manifest.id,
        sourceManifestId: manifest.id,
        validationStatus: 'unreviewed',
      };
      return [entity];
    },
    dispose: async () => {},
  };
  return { manifest, instance };
}

function fakeSvgExporter(): { manifest: PluginManifest; instance: Exporter } {
  const manifest: PluginManifest = {
    id: 'test.exporter.fake-svg',
    name: 'Fake SVG Exporter',
    version: '0.1.0',
    kind: 'exporter',
    sdkVersionRange: '^0.1.0',
    entryPoint: './index.js',
  };
  const instance: Exporter = {
    manifestId: manifest.id,
    formats: ['svg'],
    configure: () => {},
    async export(request: ExportRequest): Promise<ExportResult> {
      return {
        format: request.format,
        output: { id: 'out-1', uri: 'memory://out-1' },
      };
    },
    dispose: async () => {},
  };
  return { manifest, instance };
}

describe('PipelineRunner', () => {
  it('runs a wall-detector + svg-exporter end to end, merging detections into project entities', async () => {
    const registry = createPluginRegistry(SDK_VERSION);
    const detector = fakeWallDetector();
    const exporter = fakeSvgExporter();
    registry.register(detector.manifest, () => detector.instance);
    registry.register(exporter.manifest, () => exporter.instance);

    const runner = createPipelineRunner({ registry });
    const events: PipelineEvent[] = [];
    runner.on((event) => events.push(event));

    const result = await runner.run({
      runId: 'run-1',
      projectId: 'proj-1',
      exportFormat: 'svg',
    });

    expect(runner.state).toBe('completed');
    expect(result.detectedEntities).toHaveLength(1);
    expect(result.projectEntities).toHaveLength(1);
    expect(result.projectEntities[0]).toMatchObject({ kind: 'wall', start: { x: 0, y: 0 }, end: { x: 3, y: 0 } });
    expect(result.exportResult?.output.id).toBe('out-1');

    // wall-detection and feature-detection both match the registered detector
    // (it declares `detects: ['wall']`), so both should complete rather than skip.
    expect(result.completedStages).toContain('feature-detection');
    expect(result.completedStages).toContain('wall-detection');
    // no reconstruction-algorithm / spatial-analyzer plugin was registered
    expect(result.skippedStages.map((s) => s.stage)).toEqual(
      expect.arrayContaining(['camera-reconstruction', 'point-cloud-generation', 'geometry-recovery', 'furniture-detection', 'layout-generation']),
    );

    const startedTypes = events.filter((e) => e.type === 'stage:started').map((e) => e.stage);
    const completedTypes = events.filter((e) => e.type === 'stage:completed').map((e) => e.stage);
    expect(startedTypes[0]).toBe('upload');
    expect(startedTypes[startedTypes.length - 1]).toBe('export');
    expect(completedTypes).toContain('export');
  });

  it('skips every plugin-driven stage cleanly when no plugins are registered', async () => {
    const registry = createPluginRegistry(SDK_VERSION);
    const runner = createPipelineRunner({ registry });

    const result = await runner.run({ runId: 'run-2', projectId: 'proj-2' });

    expect(runner.state).toBe('completed');
    expect(result.detectedEntities).toHaveLength(0);
    // upload/frame-extraction always complete (host-only, no plugin needed);
    // svg-cleanup skips because there are no project entities yet.
    expect(result.completedStages).toEqual(['upload', 'frame-extraction']);
    expect(result.skippedStages.length).toBeGreaterThan(0);
  });

  it('supports cancellation between stages', async () => {
    const registry = createPluginRegistry(SDK_VERSION);
    const runner = createPipelineRunner({ registry });

    const runPromise = runner.run({ runId: 'run-3', projectId: 'proj-3' });
    runner.cancel();
    await runPromise;

    expect(runner.state).toBe('cancelled');
  });
});
