import type { DataRef, DetectedEntity } from './common.js';
import type { PluginExecutionContext } from './context.js';

export interface VisualizationRenderRequest {
  readonly runId: string;
  readonly projectId: string;
  /** e.g. "video" | "point-cloud" | "depth" | "svg" -- must be one of the mode's declared `viewerKinds`. */
  readonly viewerKind: string;
  /**
   * Host-provided mount target (e.g. an `HTMLElement` in `apps/web`). Kept
   * opaque (`unknown`) so this package has no DOM lib dependency and stays
   * usable from non-browser hosts too -- implementations downcast it.
   */
  readonly container: unknown;
  readonly entities?: readonly DetectedEntity[];
  readonly pointCloud?: DataRef;
  readonly options?: Readonly<Record<string, unknown>>;
}

export interface VisualizationHandle {
  update(request: Partial<VisualizationRenderRequest>): void;
  dispose(): void;
}

/**
 * A renderable mode for one of `apps/web/src/viewers/` (video, point-cloud,
 * depth, svg). Unlike the other plugin kinds this is invoked directly from
 * the browser rather than through a compute backend job, but shares the same
 * lifecycle/config/dispose shape for uniform registry handling.
 */
export interface VisualizationMode<TConfig = unknown> {
  readonly manifestId: string;
  readonly viewerKinds: readonly string[];
  configure(config: TConfig): void;
  render(request: VisualizationRenderRequest, ctx: PluginExecutionContext): Promise<VisualizationHandle>;
  dispose(): Promise<void>;
}
