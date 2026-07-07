import { useMemo } from 'react';
import { generateSvg } from '@topview/svg-engine';
import type { AnyEntity } from '@topview/schema';

export interface SvgViewerProps {
  readonly entities: readonly AnyEntity[];
}

/**
 * Renders the current project entities as SVG using `@topview/svg-engine`'s
 * `generateSvg` directly (not the pipeline's `export` stage output), so the
 * viewer always reflects live edits made in the editor tab.
 */
export function SvgViewer({ entities }: SvgViewerProps): JSX.Element {
  const svg = useMemo(() => generateSvg(entities, { unitsPerMeter: 80, embedMetadata: false }), [entities]);

  return (
    <div className="panel-section">
      <h3 style={{ marginTop: 0 }}>Top-View SVG</h3>
      {entities.length === 0 ? (
        <p className="muted">Run the pipeline to generate a floor plan.</p>
      ) : (
        // This IS the SVG viewer; svg-engine's generateSvg output is well-formed/escaped.
        <div className="svg-host" dangerouslySetInnerHTML={{ __html: svg }} />
      )}
    </div>
  );
}
