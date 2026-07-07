import type { BoundingBox3D, CameraPose, DataRef, DetectedEntity, EntityKind, PipelineStageId } from './common.js';
import type { PluginExecutionContext } from './context.js';

export interface FeatureDetectionRequest {
  readonly runId: string;
  readonly projectId: string;
  readonly stage: PipelineStageId;
  readonly frames?: readonly DataRef[];
  readonly pointCloud?: DataRef;
  readonly cameraPoses?: readonly CameraPose[];
  /** Entities produced by earlier stages, made available for context (e.g. furniture detection reusing wall entities). */
  readonly existingEntities?: readonly DetectedEntity[];
  readonly regionOfInterest?: BoundingBox3D;
  readonly config?: Readonly<Record<string, unknown>>;
}

/**
 * Detects geometric/semantic entities (walls, corners, doors, furniture, ...)
 * from pipeline inputs. This is the interface `plugins/example-detector`
 * implements end to end -- see `docs/plugin-development.md`.
 */
export interface FeatureDetector<TConfig = unknown> {
  readonly manifestId: string;
  readonly detects: readonly EntityKind[];
  configure(config: TConfig): void;
  detect(request: FeatureDetectionRequest, ctx: PluginExecutionContext): Promise<DetectedEntity[]>;
  dispose(): Promise<void>;
}
