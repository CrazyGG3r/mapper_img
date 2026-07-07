import { exportEntities, type AnyExportOptions } from '@topview/svg-engine';
import type { AnyEntity } from '@topview/schema';

export interface ExportPanelProps {
  readonly entities: readonly AnyEntity[];
}

const FORMATS: readonly { format: AnyExportOptions['format']; label: string }[] = [
  { format: 'svg', label: 'SVG' },
  { format: 'json', label: 'TopView JSON' },
  { format: 'geojson', label: 'GeoJSON' },
  { format: 'dxf', label: 'DXF (R12)' },
  { format: 'obj', label: 'OBJ (extruded walls)' },
];

function downloadResult(data: string | Uint8Array, fileName: string, mimeType: string): void {
  // Cast away the `ArrayBufferLike`-includes-`SharedArrayBuffer` generic typed-array
  // strictness -- export results are always backed by a plain `ArrayBuffer`.
  const part = data instanceof Uint8Array ? (data as unknown as BlobPart) : data;
  const blob = new Blob([part], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ExportPanel({ entities }: ExportPanelProps): JSX.Element {
  const handleExport = (format: AnyExportOptions['format']) => {
    try {
      const result = exportEntities(entities, { format } as AnyExportOptions);
      downloadResult(result.data, result.fileName, result.mimeType);
    } catch (err) {
      // Simplest honest surface for a not-yet-implemented format in this MVP.
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="panel-section">
      <h3 style={{ marginTop: 0 }}>Export</h3>
      {entities.length === 0 ? (
        <p className="muted">Nothing to export yet -- run the pipeline first.</p>
      ) : (
        <div className="editor-toolbar">
          {FORMATS.map((f) => (
            <button key={f.format} className="secondary" onClick={() => handleExport(f.format)}>
              Download {f.label}
            </button>
          ))}
        </div>
      )}
      <p className="muted">glTF and PLY are not implemented yet (see docs/roadmap.md); their buttons are omitted here rather than left silently broken.</p>
    </div>
  );
}
