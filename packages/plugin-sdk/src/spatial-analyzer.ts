import type { DetectedEntity, EntityId } from './common.js';
import type { PluginExecutionContext } from './context.js';

export interface SpatialAnalysisRequest {
  readonly runId: string;
  readonly projectId: string;
  readonly entities: readonly DetectedEntity[];
  readonly config?: Readonly<Record<string, unknown>>;
}

export interface SpatialMetric {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  readonly unit?: string;
  readonly relatedEntityIds?: readonly EntityId[];
}

export interface SpatialAnalysisResult {
  readonly metrics: readonly SpatialMetric[];
  readonly warnings?: readonly string[];
}

/**
 * Computes derived spatial metrics over a (possibly partial) scene graph --
 * room areas, adjacency, egress checks, and similar layout-generation-stage
 * analyses.
 */
export interface SpatialAnalyzer<TConfig = unknown> {
  readonly manifestId: string;
  readonly analyses: readonly string[];
  configure(config: TConfig): void;
  analyze(request: SpatialAnalysisRequest, ctx: PluginExecutionContext): Promise<SpatialAnalysisResult>;
  dispose(): Promise<void>;
}
