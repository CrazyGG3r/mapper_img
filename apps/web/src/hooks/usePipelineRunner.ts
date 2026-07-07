import { useCallback, useMemo, useRef, useState } from 'react';
import {
  createPipelineRunner,
  STAGE_DEFINITIONS,
  type PipelineEvent,
  type PipelineRunResult,
  type PipelineStageId,
} from '@topview/pipeline-core';
import type { DataRef } from '@topview/plugin-sdk';
import { createDefaultPluginRegistry } from '../lib/pluginRegistry.js';

export type StageStatus = 'idle' | 'running' | 'completed' | 'skipped' | 'error';

export interface StageState {
  readonly id: PipelineStageId;
  readonly label: string;
  readonly status: StageStatus;
  readonly progress: number;
  readonly message?: string;
}

function initialStages(): StageState[] {
  return STAGE_DEFINITIONS.map((s) => ({ id: s.id, label: s.label, status: 'idle', progress: 0 }));
}

function formatEvent(event: PipelineEvent): string {
  switch (event.type) {
    case 'stage:started':
      return `[${event.stage}] started`;
    case 'stage:progress':
      return `[${event.stage}] ${(event.fraction * 100).toFixed(0)}%${event.message ? ` -- ${event.message}` : ''}`;
    case 'stage:completed':
      return `[${event.stage}] completed`;
    case 'stage:skipped':
      return `[${event.stage}] skipped (${event.reason ?? 'no reason given'})`;
    case 'stage:error':
    case 'pipeline:error':
      return `[${event.stage ?? 'pipeline'}] ERROR: ${event.message}`;
    default:
      return JSON.stringify(event);
  }
}

export function usePipelineRunner() {
  const registry = useMemo(() => createDefaultPluginRegistry(), []);
  const [stages, setStages] = useState<StageState[]>(initialStages);
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<PipelineRunResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const activeRunner = useRef<ReturnType<typeof createPipelineRunner> | null>(null);

  const reset = useCallback(() => {
    setStages(initialStages());
    setLog([]);
    setResult(null);
  }, []);

  const run = useCallback(
    async (pointCloud?: DataRef) => {
      reset();
      setIsRunning(true);
      const runner = createPipelineRunner({ registry });
      activeRunner.current = runner;

      runner.on((event) => {
        setLog((prev) => [...prev, formatEvent(event)]);
        if (event.type === 'stage:progress' || event.type === 'stage:started' || event.type === 'stage:completed' || event.type === 'stage:skipped' || event.type === 'stage:error') {
          setStages((prev) =>
            prev.map((s) => {
              if (s.id !== event.stage) return s;
              switch (event.type) {
                case 'stage:started':
                  return { ...s, status: 'running', progress: 0, message: undefined };
                case 'stage:progress':
                  return { ...s, status: 'running', progress: event.fraction, message: event.message };
                case 'stage:completed':
                  return { ...s, status: 'completed', progress: 1 };
                case 'stage:skipped':
                  return { ...s, status: 'skipped', message: event.reason };
                case 'stage:error':
                  return { ...s, status: 'error', message: event.message };
                default:
                  return s;
              }
            }),
          );
        }
      });

      try {
        const runResult = await runner.run({
          runId: `run-${Date.now()}`,
          projectId: 'local-project',
          activeLayerId: 'layer-default',
          pointCloud,
          exportFormat: 'svg',
        });
        setResult(runResult);
        return runResult;
      } finally {
        setIsRunning(false);
        activeRunner.current = null;
      }
    },
    [registry, reset],
  );

  const cancel = useCallback(() => {
    activeRunner.current?.cancel();
  }, []);

  return { stages, log, result, isRunning, run, cancel, reset };
}
