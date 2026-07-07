/**
 * The 11-stage pipeline's string-union stage identifier, and the
 * `PipelineEvent` discriminated union every stage reports progress/outcome
 * through, regardless of which `ComputeBackendHandle` (`@topview/pipeline-core`)
 * executed it. See docs/architecture.md §4/§5 for the full protocol, and
 * docs/api.md §8 for the shape `services/reconstruction-api` mirrors by
 * hand in `reconstruction_api/events.py` (camelCase here, snake_case there).
 */
import type { IsoTimestamp } from './entities';

/** The pipeline's 11 ordered stages. See docs/architecture.md §4 for what each does. */
export type PipelineStageId =
  | 'upload'
  | 'frame-extraction'
  | 'feature-detection'
  | 'camera-reconstruction'
  | 'point-cloud-generation'
  | 'geometry-recovery'
  | 'wall-detection'
  | 'furniture-detection'
  | 'layout-generation'
  | 'svg-cleanup'
  | 'export';

/** `PipelineStageId` values in pipeline execution order. */
export const PIPELINE_STAGE_IDS: readonly PipelineStageId[] = [
  'upload',
  'frame-extraction',
  'feature-detection',
  'camera-reconstruction',
  'point-cloud-generation',
  'geometry-recovery',
  'wall-detection',
  'furniture-detection',
  'layout-generation',
  'svg-cleanup',
  'export',
] as const;

/** Stable machine-readable error codes surfaced by `PipelineErrorEvent`. See docs/troubleshooting.md. */
export type PipelineErrorCode =
  | 'invalid_input'
  | 'unsupported_media'
  | 'plugin_not_found'
  | 'plugin_incompatible'
  | 'plugin_execution_failed'
  | 'compute_backend_unavailable'
  | 'stage_dependency_missing'
  | 'timeout'
  | 'cancelled'
  | 'internal_error';

/** Fields common to every `PipelineEvent` variant. */
export interface PipelineEventBase {
  eventId: string;
  /** Identifies one end-to-end pipeline execution (one `PipelineRunner.run()` call). */
  runId: string;
  projectId: string;
  timestamp: IsoTimestamp;
}

/** Emitted as work proceeds within a stage, e.g. via `ctx.reportProgress(0.4, '...')`. */
export interface StageProgressEvent extends PipelineEventBase {
  type: 'stage:progress';
  stage: PipelineStageId;
  /** In [0, 1]. */
  fraction: number;
  message?: string;
  detail: Record<string, unknown>;
}

export type StageLifecycleEventType = 'stage:started' | 'stage:completed' | 'stage:skipped';

/** The start/end bookends around a stage's execution. */
export interface StageLifecycleEvent extends PipelineEventBase {
  type: StageLifecycleEventType;
  stage: PipelineStageId;
  /** Why a stage was skipped, e.g. "no plugin registered for capability". */
  reason?: string;
}

export type PipelineErrorEventType = 'stage:error' | 'pipeline:error';

/** Surfaced whenever a single stage, or the pipeline as a whole, fails. */
export interface PipelineErrorEvent extends PipelineEventBase {
  type: PipelineErrorEventType;
  /** Absent for a `pipeline:error` that isn't attributable to one stage. */
  stage?: PipelineStageId;
  code: PipelineErrorCode;
  message: string;
  /** Whether the pipeline can be resumed/retried past this error. */
  recoverable: boolean;
  /** manifestId of the plugin whose execution raised this error, if applicable. */
  pluginId?: string;
}

/**
 * The one event channel every stage reports through, consumed via
 * `PipelineRunner.on()` (`@topview/pipeline-core`). Defined once here so
 * both the browser pipeline and (by hand-maintained mirror, see
 * docs/architecture.md §7) `services/reconstruction-api`'s Python models
 * agree on the wire shape.
 */
export type PipelineEvent = StageProgressEvent | StageLifecycleEvent | PipelineErrorEvent;
