import type { StageState } from '../hooks/usePipelineRunner.js';

export interface PipelinePanelProps {
  readonly stages: readonly StageState[];
  readonly log: readonly string[];
  readonly isRunning: boolean;
  readonly hasPointCloud: boolean;
  readonly onLoadSample: () => void;
  readonly onRun: () => void;
  readonly onCancel: () => void;
}

export function PipelinePanel(props: PipelinePanelProps): JSX.Element {
  const { stages, log, isRunning, hasPointCloud, onLoadSample, onRun, onCancel } = props;

  return (
    <div>
      <div className="panel-section">
        <p className="muted" style={{ marginTop: 0 }}>
          Real Structure-from-Motion isn&apos;t implemented in this pass (see docs/roadmap.md) -- load the
          synthetic point cloud below to exercise the real detection → cleanup → export pipeline end to end.
        </p>
        <div className="editor-toolbar">
          <button className="secondary" onClick={onLoadSample} disabled={isRunning}>
            Load Synthetic Sample Room
          </button>
          <button className="primary" onClick={onRun} disabled={isRunning || !hasPointCloud}>
            {isRunning ? 'Running…' : 'Run Pipeline'}
          </button>
          <button className="secondary" onClick={onCancel} disabled={!isRunning}>
            Cancel
          </button>
        </div>
      </div>

      <div className="panel-section">
        <h3 style={{ marginTop: 0 }}>Pipeline Stages</h3>
        {stages.map((stage) => (
          <div className="stage-row" key={stage.id}>
            <span className={`stage-badge ${stage.status}`} />
            <span className="stage-label">{stage.label}</span>
            <div className="progress-bar">
              <div className="progress-bar-fill" style={{ width: `${Math.round(stage.progress * 100)}%` }} />
            </div>
            {stage.message && <span className="stage-detail">{stage.message}</span>}
          </div>
        ))}
      </div>

      <div className="panel-section">
        <h3 style={{ marginTop: 0 }}>Event Log</h3>
        <div className="log-list">{log.length > 0 ? log.join('\n') : 'No events yet.'}</div>
      </div>
    </div>
  );
}
