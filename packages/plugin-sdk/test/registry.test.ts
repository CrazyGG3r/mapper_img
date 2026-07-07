import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  DetectedEntity,
  Exporter,
  ExportRequest,
  ExportResult,
  FeatureDetectionRequest,
  FeatureDetector,
  PluginExecutionContext,
  PluginManifest,
} from '../src/index.js';
import { createPluginRegistry, PluginRegistrationError, PluginRegistry } from '../src/index.js';

function makeContext(overrides: Partial<PluginExecutionContext> = {}): PluginExecutionContext {
  return {
    runId: 'run-1',
    projectId: 'project-1',
    stage: 'feature-detection',
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    reportProgress: vi.fn(),
    ...overrides,
  };
}

class FakeWallDetector implements FeatureDetector {
  readonly manifestId = 'topview.detector.fake-wall';
  readonly detects = ['wall', 'corner'] as const;
  configured?: unknown;

  configure(config: unknown): void {
    this.configured = config;
  }

  async detect(_request: FeatureDetectionRequest, ctx: PluginExecutionContext): Promise<DetectedEntity[]> {
    ctx.reportProgress(1, 'done');
    return [];
  }

  async dispose(): Promise<void> {}
}

class FakeExporter implements Exporter {
  readonly manifestId = 'topview.exporter.fake-svg';
  readonly formats = ['svg'] as const;

  configure(): void {}

  async export(_request: ExportRequest, _ctx: PluginExecutionContext): Promise<ExportResult> {
    return { format: 'svg', output: { id: 'out-1', uri: 'mem://out-1' } };
  }

  async dispose(): Promise<void> {}
}

function detectorManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: 'topview.detector.fake-wall',
    name: 'Fake Wall Detector',
    version: '0.1.0',
    kind: 'feature-detector',
    sdkVersionRange: '^0.1.0',
    detects: ['wall', 'corner'],
    entryPoint: './dist/index.js',
    ...overrides,
  };
}

function exporterManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: 'topview.exporter.fake-svg',
    name: 'Fake SVG Exporter',
    version: '0.1.0',
    kind: 'exporter',
    sdkVersionRange: '^0.1.0',
    entryPoint: './dist/index.js',
    ...overrides,
  };
}

describe('PluginRegistry', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = createPluginRegistry('0.1.0');
  });

  it('registers a plugin and makes it retrievable via get()', () => {
    const registered = registry.register(detectorManifest(), () => new FakeWallDetector());

    expect(registered.manifest.id).toBe('topview.detector.fake-wall');
    expect(registered.instance).toBeInstanceOf(FakeWallDetector);

    const fetched = registry.get('topview.detector.fake-wall');
    expect(fetched).toBeDefined();
    expect(fetched?.instance).toBe(registered.instance);
    expect(registry.has('topview.detector.fake-wall')).toBe(true);
    expect(registry.size).toBe(1);
  });

  it('runs an end-to-end detect() call through a registered plugin', async () => {
    const registered = registry.register(detectorManifest(), () => new FakeWallDetector());
    const ctx = makeContext();
    const request: FeatureDetectionRequest = {
      runId: 'run-1',
      projectId: 'project-1',
      stage: 'feature-detection',
    };

    const detector = registered.instance as FeatureDetector;
    const result = await detector.detect(request, ctx);

    expect(result).toEqual([]);
    expect(ctx.reportProgress).toHaveBeenCalledWith(1, 'done');
  });

  it('lists all registered plugins, optionally filtered by kind', () => {
    registry.register(detectorManifest(), () => new FakeWallDetector());
    registry.register(exporterManifest(), () => new FakeExporter());

    expect(registry.list()).toHaveLength(2);
    expect(registry.list({ kind: 'feature-detector' })).toHaveLength(1);
    expect(registry.list({ kind: 'exporter' })).toHaveLength(1);
    expect(registry.list({ kind: 'spatial-analyzer' })).toHaveLength(0);
  });

  it('discovers plugins by capability (kind)', () => {
    registry.register(detectorManifest(), () => new FakeWallDetector());
    registry.register(exporterManifest(), () => new FakeExporter());

    const detectors = registry.discoverByCapability('feature-detector');
    expect(detectors).toHaveLength(1);
    expect(detectors[0].manifest.id).toBe('topview.detector.fake-wall');

    const exporters = registry.discoverByCapability('exporter');
    expect(exporters).toHaveLength(1);
    expect(exporters[0].manifest.id).toBe('topview.exporter.fake-svg');
  });

  it('rejects a duplicate manifest id', () => {
    registry.register(detectorManifest(), () => new FakeWallDetector());

    expect(() => registry.register(detectorManifest(), () => new FakeWallDetector())).toThrow(
      PluginRegistrationError,
    );

    const result = registry.tryRegister(detectorManifest(), () => new FakeWallDetector());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('duplicate-id');
      expect(result.error.manifestId).toBe('topview.detector.fake-wall');
    }
    // The original registration must be untouched.
    expect(registry.size).toBe(1);
  });

  it('rejects a plugin whose sdkVersionRange is incompatible with the installed SDK version', () => {
    const incompatible = detectorManifest({ sdkVersionRange: '^2.0.0' });

    const result = registry.tryRegister(incompatible, () => new FakeWallDetector());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('incompatible-sdk-version');
    }
    expect(registry.has('topview.detector.fake-wall')).toBe(false);
  });

  it('rejects a plugin instance whose manifestId does not match manifest.id', () => {
    const mismatched = detectorManifest({ id: 'topview.detector.different-id' });

    const result = registry.tryRegister(mismatched, () => new FakeWallDetector());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('manifest-id-mismatch');
    }
  });

  it('rejects a plugin whose declared kind does not match its instance shape', () => {
    const wrongKind = detectorManifest({ kind: 'exporter' });

    const result = registry.tryRegister(wrongKind, () => new FakeWallDetector());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('kind-mismatch');
    }
  });

  it('unregisters a plugin, disposing it and removing it from lookups', async () => {
    const registered = registry.register(detectorManifest(), () => new FakeWallDetector());
    const disposeSpy = vi.spyOn(registered.instance as FeatureDetector, 'dispose');

    const removed = registry.unregister('topview.detector.fake-wall');

    expect(removed).toBe(true);
    expect(disposeSpy).toHaveBeenCalledTimes(1);
    expect(registry.get('topview.detector.fake-wall')).toBeUndefined();
    expect(registry.has('topview.detector.fake-wall')).toBe(false);
    expect(registry.size).toBe(0);
  });

  it('returns false when unregistering an id that was never registered', () => {
    expect(registry.unregister('nope')).toBe(false);
  });
});
