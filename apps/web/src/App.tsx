import { useCallback, useState } from 'react';
import type { AnyEntity } from '@topview/schema';
import type { DataRef } from '@topview/plugin-sdk';
import { usePipelineRunner } from './hooks/usePipelineRunner.js';
import { buildSyntheticRoomPointCloud, pointCloudToDataRef } from './lib/sampleData.js';
import { saveProject } from './lib/projectStore.js';
import { PipelinePanel } from './components/PipelinePanel.js';
import { SvgViewer } from './components/SvgViewer.js';
import { ExportPanel } from './components/ExportPanel.js';
import { Editor } from './editor/Editor.js';

type Tab = 'pipeline' | 'editor' | 'export';

export function App(): JSX.Element {
  const [tab, setTab] = useState<Tab>('pipeline');
  const [pointCloud, setPointCloud] = useState<DataRef | null>(null);
  const [entities, setEntities] = useState<AnyEntity[]>([]);
  const [generation, setGeneration] = useState(0);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const { stages, log, result, isRunning, run, cancel } = usePipelineRunner();

  const handleLoadSample = useCallback(() => {
    const points = buildSyntheticRoomPointCloud();
    setPointCloud(pointCloudToDataRef(`sample-${Date.now()}`, points));
  }, []);

  const handleRun = useCallback(async () => {
    if (!pointCloud) return;
    const runResult = await run(pointCloud);
    setEntities(runResult.projectEntities);
    setGeneration((g) => g + 1);
    setTab('editor');
  }, [pointCloud, run]);

  const handleSave = useCallback(() => {
    saveProject(entities);
    setSaveMessage(`Saved ${entities.length} entities to this browser's local storage at ${new Date().toLocaleTimeString()}.`);
  }, [entities]);

  return (
    <>
      <header className="app-header">
        <span className="app-title">TopView SVG Mapper</span>
        <nav className="tabs">
          <button className={`tab-button ${tab === 'pipeline' ? 'active' : ''}`} onClick={() => setTab('pipeline')}>
            Pipeline
          </button>
          <button className={`tab-button ${tab === 'editor' ? 'active' : ''}`} onClick={() => setTab('editor')}>
            Editor
          </button>
          <button className={`tab-button ${tab === 'export' ? 'active' : ''}`} onClick={() => setTab('export')}>
            Export
          </button>
        </nav>
        <div>
          <button className="secondary" onClick={handleSave} disabled={entities.length === 0}>
            Save Project
          </button>
        </div>
      </header>

      <div className="app-body">
        <div className="panel" style={{ flex: 1 }}>
          {tab === 'pipeline' && (
            <PipelinePanel
              stages={stages}
              log={log}
              isRunning={isRunning}
              hasPointCloud={pointCloud !== null}
              onLoadSample={handleLoadSample}
              onRun={handleRun}
              onCancel={cancel}
            />
          )}

          {tab === 'editor' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="panel-section">
                <h3 style={{ marginTop: 0 }}>Editor</h3>
                <Editor initialEntities={result?.projectEntities ?? entities} generation={generation} onEntitiesChange={setEntities} />
              </div>
              <SvgViewer entities={entities} />
            </div>
          )}

          {tab === 'export' && <ExportPanel entities={entities} />}

          {saveMessage && <p className="muted">{saveMessage}</p>}
        </div>
      </div>
    </>
  );
}
