import type { DataRef, PipelineStageId } from './common.js';

export interface PluginLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Everything a plugin needs from its host at call time, injected fresh for
 * every invocation. Constructed by the pipeline runner (`@topview/pipeline-core`)
 * or, for `VisualizationMode` plugins, by the web app's viewer harness.
 */
export interface PluginExecutionContext {
  readonly runId: string;
  readonly projectId: string;
  readonly stage: PipelineStageId;
  readonly log: PluginLogger;
  /**
   * Report incremental progress for this invocation.
   * @param fraction a number in [0, 1], where 1 means complete.
   * @param message optional human-readable status for the pipeline-view UI.
   */
  reportProgress(fraction: number, message?: string): void;
  /** Cooperative cancellation -- long-running plugins should honor this. */
  readonly signal?: AbortSignal;
  /** The plugin's own `configSchema`-validated configuration for this run. */
  readonly pluginConfig?: Readonly<Record<string, unknown>>;
  /**
   * Resolves a `DataRef` to its raw bytes through whatever storage/compute
   * backend the host injected (local blob URL, IndexedDB, or a backend
   * fetch), fulfilling the contract `DataRef`'s own doc comment describes.
   * Optional because some hosts (e.g. a `VisualizationMode` render call) may
   * hand plugins a ref purely for display without ever needing its bytes.
   *
   * Point clouds resolved this way are a flat `Float32Array` of packed
   * `[x0,y0,z0,x1,y1,z1,...]` triples -- the same convention
   * `@topview/geometry-wasm`'s `FlatPointCloud` uses, so a resolved point
   * cloud can be handed straight to `loadGeometryOps()` without conversion.
   */
  resolveDataRef?(ref: DataRef): Promise<ArrayBuffer>;
}
