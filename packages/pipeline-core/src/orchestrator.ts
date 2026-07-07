/**
 * `PipelineRunner` -- runs the 11 `STAGE_DEFINITIONS` in order against a
 * `PluginRegistry`, bridging entities across the plugin/project boundary
 * (`entity-bridge.ts`) and emitting the `PipelineEvent` protocol every stage
 * reports through (`events.ts`). See docs/architecture.md for the full
 * protocol and docs/user-guide.md for the end-to-end flow this powers.
 */
import type { AnyEntity, PipelineStageId } from '@topview/schema';
import { cleanupEntities } from '@topview/svg-engine';
import type {
  CameraPose,
  DataRef,
  DetectedEntity,
  Exporter,
  ExportRequest,
  ExportResult,
  FeatureDetectionRequest,
  FeatureDetector,
  PluginExecutionContext,
  PluginLogger,
  PluginRegistry,
  ReconstructionAlgorithm,
  ReconstructionRequest,
  RegisteredPlugin,
  SpatialAnalysisRequest,
  SpatialAnalyzer,
  SpatialMetric,
} from '@topview/plugin-sdk';

import { detectedToProjectEntity, projectEntityToDetected } from './entity-bridge.js';
import { PipelineEventEmitter, makeEventId, nowIso, type PipelineEvent, type Unsubscribe } from './events.js';
import { STAGE_DEFINITIONS, type StageDefinition } from './stages.js';

export interface PipelineRunnerOptions {
  readonly registry: PluginRegistry;
  /**
   * Resolves a `DataRef` to raw bytes for `PluginExecutionContext.resolveDataRef`.
   * Defaults to `fetch(ref.uri).then(r => r.arrayBuffer())`, which works
   * as-is for `blob:`/`http(s):` URIs (covers `apps/web`'s local
   * `URL.createObjectURL()` uploads and any backend-hosted artifact) --
   * override only for storage schemes `fetch` can't reach (e.g. a custom
   * IndexedDB-backed `idb:` scheme).
   */
  readonly resolveDataRef?: (ref: DataRef) => Promise<ArrayBuffer>;
}

async function defaultResolveDataRef(ref: DataRef): Promise<ArrayBuffer> {
  const response = await fetch(ref.uri);
  if (!response.ok) {
    throw new Error(`Failed to resolve DataRef "${ref.id}" (${ref.uri}): HTTP ${response.status}`);
  }
  return response.arrayBuffer();
}

export interface PipelineRunInput {
  readonly runId: string;
  readonly projectId: string;
  readonly activeLayerId?: string;
  readonly frames?: readonly DataRef[];
  readonly pointCloud?: DataRef;
  readonly cameraPoses?: readonly CameraPose[];
  /** Seed entities already accepted into the project (e.g. re-running a later stage after manual edits). */
  readonly seedProjectEntities?: readonly AnyEntity[];
  /** Per-stage plugin configuration, keyed by `PipelineStageId`. */
  readonly stageConfig?: Partial<Record<PipelineStageId, Record<string, unknown>>>;
  /** Force a specific plugin's `manifestId` for a stage instead of auto-selecting the first match. */
  readonly pluginSelection?: Partial<Record<PipelineStageId, string>>;
  /** Format id (e.g. `"svg"`) the `export` stage should produce; skipped if omitted. */
  readonly exportFormat?: string;
}

export interface PipelineRunResult {
  readonly runId: string;
  readonly projectId: string;
  readonly cameraPoses: CameraPose[];
  readonly pointCloud?: DataRef;
  readonly detectedEntities: DetectedEntity[];
  readonly projectEntities: AnyEntity[];
  readonly layoutMetrics: SpatialMetric[];
  readonly exportResult?: ExportResult;
  readonly completedStages: PipelineStageId[];
  readonly skippedStages: readonly { stage: PipelineStageId; reason: string }[];
}

export type PipelineRunnerState = 'idle' | 'running' | 'paused' | 'cancelled' | 'completed' | 'error';

interface Gate {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
}

function createGate(): Gate {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function consoleLogger(prefix: string): PluginLogger {
  const line = (level: string, message: string, meta?: Record<string, unknown>) =>
    // This IS the logging implementation.
    console[level === 'debug' ? 'debug' : level === 'warn' ? 'warn' : level === 'error' ? 'error' : 'log'](
      `[${prefix}] ${message}`,
      meta ?? '',
    );
  return {
    debug: (m, meta) => line('debug', m, meta),
    info: (m, meta) => line('info', m, meta),
    warn: (m, meta) => line('warn', m, meta),
    error: (m, meta) => line('error', m, meta),
  };
}

interface MutableRunState {
  cameraPoses: CameraPose[];
  pointCloud?: DataRef;
  detectedEntities: Map<string, DetectedEntity>;
  projectEntities: Map<string, AnyEntity>;
  layoutMetrics: SpatialMetric[];
  exportResult?: ExportResult;
  completedStages: PipelineStageId[];
  skippedStages: { stage: PipelineStageId; reason: string }[];
}

/** Thrown internally to short-circuit a stage as "skipped" rather than "failed". Never escapes `run()`. */
class StageSkipped extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'StageSkipped';
  }
}

export class PipelineRunner {
  private readonly registry: PluginRegistry;
  private readonly resolveDataRefImpl: (ref: DataRef) => Promise<ArrayBuffer>;
  private readonly emitter = new PipelineEventEmitter();
  private abortController: AbortController | null = null;
  private pauseGate: Gate | null = null;
  private runnerState: PipelineRunnerState = 'idle';

  constructor(options: PipelineRunnerOptions) {
    this.registry = options.registry;
    this.resolveDataRefImpl = options.resolveDataRef ?? defaultResolveDataRef;
  }

  get state(): PipelineRunnerState {
    return this.runnerState;
  }

  /**
   * A separate method (not an inline `this.runnerState === 'cancelled'`
   * check) so TS doesn't over-narrow `runnerState` to the literal type it
   * was last assigned earlier in `run()`'s own scope -- `cancel()` can
   * mutate it asynchronously between checks, which a same-method narrow
   * can't see coming.
   */
  private isCancelled(): boolean {
    return this.runnerState === 'cancelled';
  }

  on(listener: (event: PipelineEvent) => void): Unsubscribe {
    return this.emitter.on(listener);
  }

  /** Pauses between stages (a stage already in flight runs to completion first). */
  pause(): void {
    if (this.runnerState !== 'running') return;
    this.runnerState = 'paused';
    this.pauseGate = createGate();
  }

  resume(): void {
    if (this.runnerState !== 'paused') return;
    this.runnerState = 'running';
    this.pauseGate?.resolve();
    this.pauseGate = null;
  }

  /** Cooperative cancellation: signals `AbortController` and stops before the next stage. */
  cancel(): void {
    if (this.runnerState === 'completed' || this.runnerState === 'cancelled') return;
    this.abortController?.abort();
    this.runnerState = 'cancelled';
    this.pauseGate?.resolve();
    this.pauseGate = null;
  }

  async run(input: PipelineRunInput): Promise<PipelineRunResult> {
    if (this.runnerState === 'running' || this.runnerState === 'paused') {
      throw new Error('PipelineRunner is already running; construct a new PipelineRunner per run.');
    }

    this.runnerState = 'running';
    this.abortController = new AbortController();
    const activeLayerId = input.activeLayerId ?? 'layer-default';

    const state: MutableRunState = {
      cameraPoses: [...(input.cameraPoses ?? [])],
      pointCloud: input.pointCloud,
      detectedEntities: new Map(),
      projectEntities: new Map((input.seedProjectEntities ?? []).map((e) => [e.id, e])),
      layoutMetrics: [],
      completedStages: [],
      skippedStages: [],
    };

    for (const stageDef of STAGE_DEFINITIONS) {
      if (this.isCancelled()) break;
      if (this.pauseGate) await this.pauseGate.promise;
      if (this.isCancelled()) break;

      this.emitLifecycle(input, stageDef.id, 'stage:started');

      try {
        await this.runStage(stageDef, input, state, activeLayerId);
        state.completedStages.push(stageDef.id);
        this.emitLifecycle(input, stageDef.id, 'stage:completed');
      } catch (err) {
        if (err instanceof StageSkipped) {
          state.skippedStages.push({ stage: stageDef.id, reason: err.message });
          this.emitLifecycle(input, stageDef.id, 'stage:skipped', err.message);
          continue;
        }
        this.runnerState = 'error';
        this.emitter.emit({
          eventId: makeEventId(),
          runId: input.runId,
          projectId: input.projectId,
          timestamp: nowIso(),
          type: 'stage:error',
          stage: stageDef.id,
          code: 'plugin_execution_failed',
          message: err instanceof Error ? err.message : String(err),
          recoverable: true,
        });
        throw err;
      }
    }

    if (!this.isCancelled()) {
      this.runnerState = 'completed';
    }

    return {
      runId: input.runId,
      projectId: input.projectId,
      cameraPoses: state.cameraPoses,
      pointCloud: state.pointCloud,
      detectedEntities: [...state.detectedEntities.values()],
      projectEntities: [...state.projectEntities.values()],
      layoutMetrics: state.layoutMetrics,
      exportResult: state.exportResult,
      completedStages: state.completedStages,
      skippedStages: state.skippedStages,
    };
  }

  private emitLifecycle(
    input: PipelineRunInput,
    stage: PipelineStageId,
    type: 'stage:started' | 'stage:completed' | 'stage:skipped',
    reason?: string,
  ): void {
    this.emitter.emit({
      eventId: makeEventId(),
      runId: input.runId,
      projectId: input.projectId,
      timestamp: nowIso(),
      type,
      stage,
      ...(reason ? { reason } : {}),
    });
  }

  private makeContext(input: PipelineRunInput, stage: PipelineStageId): PluginExecutionContext {
    const emit = this.emitter;
    const resolveDataRef = this.resolveDataRefImpl;
    return {
      runId: input.runId,
      projectId: input.projectId,
      stage,
      log: consoleLogger(`pipeline:${stage}`),
      resolveDataRef,
      reportProgress(fraction: number, message?: string) {
        emit.emit({
          eventId: makeEventId(),
          runId: input.runId,
          projectId: input.projectId,
          timestamp: nowIso(),
          type: 'stage:progress',
          stage,
          fraction,
          message,
          detail: {},
        });
      },
      signal: this.abortController?.signal,
      pluginConfig: input.stageConfig?.[stage],
    };
  }

  private mergeDetected(state: MutableRunState, entities: readonly DetectedEntity[], activeLayerId: string): void {
    for (const entity of entities) {
      state.detectedEntities.set(entity.id, entity);
      const projected = detectedToProjectEntity(entity, activeLayerId);
      if (projected) {
        state.projectEntities.set(projected.id, projected);
      }
    }
  }

  private async runStage(
    stageDef: StageDefinition,
    input: PipelineRunInput,
    state: MutableRunState,
    activeLayerId: string,
  ): Promise<void> {
    const ctx = this.makeContext(input, stageDef.id);

    switch (stageDef.id) {
      case 'upload':
      case 'frame-extraction': {
        // Host-side concerns (`apps/web/src/upload/`) happen before a
        // PipelineRunner is even constructed; these stages exist purely so
        // the progress UI has a consistent 11-stage timeline to render.
        ctx.reportProgress(1, 'handled by the host application before pipeline invocation');
        return;
      }

      case 'camera-reconstruction':
      case 'point-cloud-generation':
      case 'geometry-recovery': {
        const plugin = this.selectPlugin<ReconstructionAlgorithm>(stageDef, input);
        if (!plugin) throw new StageSkipped(`no reconstruction-algorithm plugin registered for "${stageDef.id}"`);
        const request: ReconstructionRequest = {
          runId: input.runId,
          projectId: input.projectId,
          stage: stageDef.id,
          frames: input.frames,
          cameraPoses: state.cameraPoses,
          pointCloud: state.pointCloud,
          config: input.stageConfig?.[stageDef.id],
        };
        const result = await plugin.instance.reconstruct(request, ctx);
        if (result.cameraPoses) state.cameraPoses = [...result.cameraPoses];
        if (result.pointCloud) state.pointCloud = result.pointCloud;
        if (result.entities) this.mergeDetected(state, result.entities, activeLayerId);
        return;
      }

      case 'feature-detection':
      case 'wall-detection':
      case 'furniture-detection': {
        const plugins = this.selectDetectors(stageDef, input);
        if (plugins.length === 0) {
          throw new StageSkipped(`no matching feature-detector plugin registered for "${stageDef.id}"`);
        }
        for (const plugin of plugins) {
          const request: FeatureDetectionRequest = {
            runId: input.runId,
            projectId: input.projectId,
            stage: stageDef.id,
            frames: input.frames,
            pointCloud: state.pointCloud,
            cameraPoses: state.cameraPoses,
            existingEntities: [...state.detectedEntities.values()],
            config: input.stageConfig?.[stageDef.id],
          };
          const detected = await plugin.instance.detect(request, ctx);
          this.mergeDetected(state, detected, activeLayerId);
        }
        return;
      }

      case 'layout-generation': {
        const plugin = this.selectPlugin<SpatialAnalyzer>(stageDef, input);
        if (!plugin) throw new StageSkipped('no spatial-analyzer plugin registered for "layout-generation"');
        const request: SpatialAnalysisRequest = {
          runId: input.runId,
          projectId: input.projectId,
          entities: [...state.detectedEntities.values()],
          config: input.stageConfig?.[stageDef.id],
        };
        const result = await plugin.instance.analyze(request, ctx);
        state.layoutMetrics = [...result.metrics];
        return;
      }

      case 'svg-cleanup': {
        const entities = [...state.projectEntities.values()];
        if (entities.length === 0) throw new StageSkipped('no project entities to clean up yet');
        ctx.reportProgress(0, 'merging/snapping/orthogonalizing wall geometry');
        const { entities: cleaned } = await cleanupEntities(entities);
        state.projectEntities = new Map(cleaned.map((e) => [e.id, e]));
        ctx.reportProgress(1, 'done');
        return;
      }

      case 'export': {
        if (!input.exportFormat) throw new StageSkipped('no exportFormat requested for this run');
        const plugin = this.selectExporter(input.exportFormat, input);
        if (!plugin) throw new StageSkipped(`no exporter plugin registered for format "${input.exportFormat}"`);
        const request: ExportRequest = {
          runId: input.runId,
          projectId: input.projectId,
          format: input.exportFormat,
          scene: { entities: [...state.projectEntities.values()].map(projectEntityToDetected) },
          options: input.stageConfig?.export,
        };
        state.exportResult = await plugin.instance.export(request, ctx);
        return;
      }

      default: {
        const exhaustive: never = stageDef.id;
        throw new Error(`Unhandled pipeline stage: ${exhaustive as string}`);
      }
    }
  }

  private selectPlugin<T extends ReconstructionAlgorithm | SpatialAnalyzer>(
    stageDef: StageDefinition,
    input: PipelineRunInput,
  ): RegisteredPlugin<T> | undefined {
    if (!stageDef.pluginKind) return undefined;
    const candidates = this.registry.list({ kind: stageDef.pluginKind }) as readonly RegisteredPlugin<T>[];
    const forcedId = input.pluginSelection?.[stageDef.id];
    if (forcedId) return candidates.find((p) => p.manifest.id === forcedId);
    return candidates[0];
  }

  private selectDetectors(stageDef: StageDefinition, input: PipelineRunInput): readonly RegisteredPlugin<FeatureDetector>[] {
    const forcedId = input.pluginSelection?.[stageDef.id];
    const all = this.registry.list({ kind: 'feature-detector' }) as readonly RegisteredPlugin<FeatureDetector>[];

    return all.filter((p) => {
      if (forcedId) return p.manifest.id === forcedId;
      if (!stageDef.entityKinds) return true;
      return p.instance.detects.some((k) => stageDef.entityKinds!.includes(k));
    });
  }

  private selectExporter(format: string, input: PipelineRunInput): RegisteredPlugin<Exporter> | undefined {
    const forcedId = input.pluginSelection?.export;
    const all = this.registry.list({ kind: 'exporter' }) as readonly RegisteredPlugin<Exporter>[];
    return all.find((p) => (forcedId ? p.manifest.id === forcedId : p.instance.formats.includes(format)));
  }
}

export function createPipelineRunner(options: PipelineRunnerOptions): PipelineRunner {
  return new PipelineRunner(options);
}
