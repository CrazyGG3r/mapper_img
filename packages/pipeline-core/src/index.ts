/**
 * `@topview/pipeline-core` -- orchestrates the 11-stage TopView reconstruction
 * pipeline against a `PluginRegistry` (docs/api.md §2). Also the home of the
 * `DetectedEntity` <-> `AnyEntity` bridge used at every stage boundary.
 */
export {
  createPipelineRunner,
  PipelineRunner,
  type PipelineRunInput,
  type PipelineRunnerOptions,
  type PipelineRunnerState,
  type PipelineRunResult,
} from './orchestrator.js';

export { detectedToProjectEntity, projectEntityToDetected, createDefaultConfidenceMeta } from './entity-bridge.js';

export {
  getStageDefinition,
  PIPELINE_STAGE_IDS,
  STAGE_DEFINITIONS,
  type PipelineStageId,
  type StageDefinition,
} from './stages.js';

export { makeEventId, nowIso, PipelineEventEmitter, type PipelineEvent, type PipelineEventListener, type Unsubscribe } from './events.js';
