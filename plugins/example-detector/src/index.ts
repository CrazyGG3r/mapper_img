/**
 * Reference `FeatureDetector` implementation (docs/plugin-development.md
 * walks through this file line by line). Resolves the pipeline's point
 * cloud, projects it onto the XY (floor) plane by dropping the Z
 * coordinate -- this package assumes a Z-up reconstruction convention, the
 * same one implied by `@topview/schema`'s `Point3D`/`BoundingBox3D` and by
 * `@topview/geometry-wasm`'s flat `[x,y,z,...]` point-cloud layout -- and
 * extracts wall segments via `extractLineSegments` (`ransac.ts`).
 */
import type {
  DetectedEntity,
  FeatureDetectionRequest,
  FeatureDetector,
  PluginExecutionContext,
} from '@topview/plugin-sdk';
import { extractLineSegments, type Point2, type RansacOptions } from './ransac.js';
import { EXAMPLE_WALL_DETECTOR_MANIFEST } from './manifest.js';

export { EXAMPLE_WALL_DETECTOR_MANIFEST } from './manifest.js';
export { extractLineSegments, type LineSegment, type Point2, type RansacOptions } from './ransac.js';

export interface ExampleWallDetectorConfig {
  readonly thicknessM?: number;
  readonly distanceThresholdM?: number;
  readonly minSegmentLengthM?: number;
  readonly seed?: number;
}

function projectToXY(flatXYZ: Float32Array): Point2[] {
  const points: Point2[] = [];
  for (let i = 0; i + 2 < flatXYZ.length; i += 3) {
    points.push({ x: flatXYZ[i]!, y: flatXYZ[i + 1]! });
  }
  return points;
}

let detectionSequence = 0;

export class ExampleWallDetector implements FeatureDetector<ExampleWallDetectorConfig> {
  readonly manifestId = EXAMPLE_WALL_DETECTOR_MANIFEST.id;
  readonly detects = ['wall'] as const;

  private config: ExampleWallDetectorConfig = {};

  configure(config: ExampleWallDetectorConfig): void {
    this.config = config ?? {};
  }

  async detect(request: FeatureDetectionRequest, ctx: PluginExecutionContext): Promise<DetectedEntity[]> {
    const cfg = { ...this.config, ...(ctx.pluginConfig as ExampleWallDetectorConfig | undefined) };
    const thicknessM = cfg.thicknessM ?? 0.1;

    if (!request.pointCloud) {
      ctx.log.warn('no pointCloud provided in FeatureDetectionRequest; nothing to detect from');
      return [];
    }
    if (!ctx.resolveDataRef) {
      ctx.log.warn('host did not provide resolveDataRef; cannot read the point cloud bytes');
      return [];
    }

    ctx.reportProgress(0, 'resolving point cloud');
    const buffer = await ctx.resolveDataRef(request.pointCloud);
    const flat = new Float32Array(buffer);
    const points = projectToXY(flat);
    ctx.log.info(`projected ${points.length} points to the XY plane`, { pointCloudId: request.pointCloud.id });

    ctx.reportProgress(0.3, 'fitting wall segments via RANSAC');
    const ransacOptions: RansacOptions = {
      distanceThresholdM: cfg.distanceThresholdM,
      minSegmentLengthM: cfg.minSegmentLengthM,
      seed: cfg.seed,
    };
    const segments = extractLineSegments(points, ransacOptions);

    const now = new Date().toISOString();
    const detected: DetectedEntity[] = segments.map((segment) => {
      detectionSequence += 1;
      const confidence = Math.max(0, Math.min(1, segment.inlierCount / Math.max(1, segment.candidateCount)));
      return {
        id: `${this.manifestId}:${request.runId}:${detectionSequence}`,
        kind: 'wall',
        geometry: { points2D: [segment.start, segment.end] },
        confidence,
        sourcePluginId: this.manifestId,
        sourceManifestId: this.manifestId,
        validationStatus: 'unreviewed',
        properties: { thicknessM, createdAt: now, inlierCount: segment.inlierCount },
      };
    });

    ctx.reportProgress(1, `found ${detected.length} wall segment(s)`);
    return detected;
  }

  async dispose(): Promise<void> {
    // no held resources -- each detect() call is self-contained.
  }
}

export default function registerPlugin(): ExampleWallDetector {
  return new ExampleWallDetector();
}
