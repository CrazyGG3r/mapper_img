import type { DataRef, DetectedEntity } from './common.js';
import type { PluginExecutionContext } from './context.js';

export interface ExportRequest {
  readonly runId: string;
  readonly projectId: string;
  /** e.g. "svg" | "dxf" | "png" | "pdf" -- must be one of the exporter's declared `formats`. */
  readonly format: string;
  readonly scene: {
    readonly entities: readonly DetectedEntity[];
  };
  readonly options?: Readonly<Record<string, unknown>>;
}

export interface ExportResult {
  readonly format: string;
  readonly output: DataRef;
  readonly warnings?: readonly string[];
}

/**
 * Serializes a project's scene graph into a downloadable artifact. First-party
 * exporters ship as `@topview/svg-engine`'s built-in `Exporter` adapters,
 * registered as default plugins by `apps/web/src/plugins-runtime/`.
 */
export interface Exporter<TConfig = unknown> {
  readonly manifestId: string;
  readonly formats: readonly string[];
  configure(config: TConfig): void;
  export(request: ExportRequest, ctx: PluginExecutionContext): Promise<ExportResult>;
  dispose(): Promise<void>;
}
