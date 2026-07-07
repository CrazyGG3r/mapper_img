/**
 * Metadata for the 11 pipeline stages defined by `PIPELINE_STAGE_IDS`
 * (`@topview/schema`). Order and ids are re-exported rather than redeclared
 * here so the stage list can never drift out of sync with the schema
 * package -- see docs/architecture.md.
 */
import { PIPELINE_STAGE_IDS, type PipelineStageId } from '@topview/schema';
import type { EntityKind } from '@topview/plugin-sdk';
import type { PluginKind } from '@topview/plugin-sdk';

export { PIPELINE_STAGE_IDS };
export type { PipelineStageId };

export interface StageDefinition {
  readonly id: PipelineStageId;
  readonly label: string;
  /**
   * Which plugin capability this stage invokes. `undefined` for host-only
   * bookkeeping stages (`upload`, `frame-extraction`) that have no plugin
   * kind of their own, and for `svg-cleanup`, which is a built-in
   * `@topview/svg-engine` call rather than a plugin invocation (see
   * `orchestrator.ts`).
   */
  readonly pluginKind?: PluginKind;
  /**
   * Restricts which `feature-detector` plugins count as this stage's job,
   * by their declared `detects` entity kinds. `undefined` means "any
   * feature-detector" (used by the generic `feature-detection` stage);
   * `wall-detection` and `furniture-detection` narrow this down so the same
   * detector plugin kind can power more than one stage.
   */
  readonly entityKinds?: readonly EntityKind[];
}

const DEFINITIONS_BY_ID: Record<PipelineStageId, StageDefinition> = {
  upload: { id: 'upload', label: 'Upload' },
  'frame-extraction': { id: 'frame-extraction', label: 'Frame Extraction' },
  'feature-detection': {
    id: 'feature-detection',
    label: 'Feature Detection',
    pluginKind: 'feature-detector',
  },
  'camera-reconstruction': {
    id: 'camera-reconstruction',
    label: 'Camera Reconstruction',
    pluginKind: 'reconstruction-algorithm',
  },
  'point-cloud-generation': {
    id: 'point-cloud-generation',
    label: 'Point Cloud Generation',
    pluginKind: 'reconstruction-algorithm',
  },
  'geometry-recovery': {
    id: 'geometry-recovery',
    label: 'Geometry Recovery',
    pluginKind: 'reconstruction-algorithm',
  },
  'wall-detection': {
    id: 'wall-detection',
    label: 'Wall Detection',
    pluginKind: 'feature-detector',
    entityKinds: ['wall', 'corner'],
  },
  'furniture-detection': {
    id: 'furniture-detection',
    label: 'Furniture Detection',
    pluginKind: 'feature-detector',
    entityKinds: ['furniture'],
  },
  'layout-generation': {
    id: 'layout-generation',
    label: 'Layout Generation',
    pluginKind: 'spatial-analyzer',
  },
  'svg-cleanup': { id: 'svg-cleanup', label: 'SVG Cleanup' },
  export: { id: 'export', label: 'Export', pluginKind: 'exporter' },
};

/** `StageDefinition`s in pipeline execution order. */
export const STAGE_DEFINITIONS: readonly StageDefinition[] = PIPELINE_STAGE_IDS.map(
  (id) => DEFINITIONS_BY_ID[id],
);

export function getStageDefinition(id: PipelineStageId): StageDefinition {
  return DEFINITIONS_BY_ID[id];
}
