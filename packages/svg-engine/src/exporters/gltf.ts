/**
 * Not yet implemented. glTF requires a binary buffer layout (accessors,
 * bufferViews, either an embedded base64 buffer or a `.bin` sidecar) that is
 * meaningfully more structure than the OBJ/DXF/GeoJSON writers in this
 * directory -- tracked in docs/roadmap.md rather than approximated here.
 */
import type { AnyEntity, ExportResult } from '@topview/schema';

export interface GltfExportOptions {
  readonly binary?: boolean;
  readonly includeTextures?: boolean;
  readonly wallHeightM?: number;
  readonly fileName?: string;
}

export function exportGltf(_entities: readonly AnyEntity[], _options: GltfExportOptions = {}): ExportResult {
  throw new Error(
    'glTF export is not yet implemented (see docs/roadmap.md). Use "obj" for a working 3D export in the meantime.',
  );
}
