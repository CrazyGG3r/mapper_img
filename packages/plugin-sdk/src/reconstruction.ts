import type { CameraPose, DataRef, DetectedEntity, PipelineStageId } from './common.js';
import type { PluginExecutionContext } from './context.js';

export type ReconstructionArtifactKind =
  | 'camera-poses'
  | 'point-cloud'
  | 'mesh'
  | 'geometry-graph'
  | (string & {});

export interface ReconstructionRequest {
  readonly runId: string;
  readonly projectId: string;
  readonly stage: PipelineStageId;
  readonly frames?: readonly DataRef[];
  readonly cameraPoses?: readonly CameraPose[];
  readonly pointCloud?: DataRef;
  readonly config?: Readonly<Record<string, unknown>>;
}

export interface ReconstructionResult {
  readonly artifactKind: ReconstructionArtifactKind;
  readonly cameraPoses?: readonly CameraPose[];
  readonly pointCloud?: DataRef;
  readonly mesh?: DataRef;
  readonly entities?: readonly DetectedEntity[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Covers the camera-reconstruction / point-cloud-generation / geometry-recovery
 * stages: turns raw frames into cameras, point clouds, meshes, or geometry
 * graphs (COLMAP/OpenMVG/OpenMVS-style pipelines are the expected first-party
 * implementations, see `services/reconstruction-api/core/colmap_bridge.py`).
 */
export interface ReconstructionAlgorithm<TConfig = unknown> {
  readonly manifestId: string;
  readonly produces: readonly ReconstructionArtifactKind[];
  configure(config: TConfig): void;
  reconstruct(request: ReconstructionRequest, ctx: PluginExecutionContext): Promise<ReconstructionResult>;
  dispose(): Promise<void>;
}
