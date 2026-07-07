/**
 * `@topview/svg-engine` -- SVG generation, geometry cleanup, and multi-format
 * export over a project's `AnyEntity[]` scene graph (docs/api.md §3).
 *
 * Deliberately has no `@topview/plugin-sdk` dependency: every function here
 * takes/returns plain `@topview/schema` shapes, so it stays usable directly
 * from `apps/web`'s export UI and from tests without a `PluginRegistry` in
 * the loop. `apps/web/src/plugins-runtime/` is what wraps these functions
 * into `plugin-sdk` `Exporter` plugin instances (converting `DetectedEntity`
 * to/from `AnyEntity` via `@topview/pipeline-core`'s entity-bridge) so they
 * can be registered and invoked through the pipeline's `export` stage.
 */
import type { AnyEntity, ExportFormatId, ExportResult } from '@topview/schema';
import { exportDxf, type DxfExportOptions } from './exporters/dxf.js';
import { exportGeoJson, type GeoJsonExportOptions } from './exporters/geojson.js';
import { exportGltf, type GltfExportOptions } from './exporters/gltf.js';
import { exportJson, type JsonExportOptions } from './exporters/json.js';
import { exportObj, type ObjExportOptions } from './exporters/obj.js';
import { exportPly, type PlyExportOptions } from './exporters/ply.js';
import { exportSvg } from './exporters/svg.js';
import type { SvgGenerateOptions } from './generate.js';

export type { ExportResult } from '@topview/schema';
export { generateSvg, type SvgGenerateOptions } from './generate.js';
export {
  cleanupEntities,
  mergeCollinearSegments,
  mergeDuplicateEdges,
  orthogonalizeWalls,
  snapNearbyVertices,
  type CleanupOptions,
  type CleanupReport,
} from './cleanup.js';

export { exportSvg } from './exporters/svg.js';
export { exportJson, type JsonExportOptions } from './exporters/json.js';
export { exportGeoJson, type GeoJsonExportOptions } from './exporters/geojson.js';
export { exportDxf, type DxfExportOptions } from './exporters/dxf.js';
export { exportObj, type ObjExportOptions } from './exporters/obj.js';
export { exportGltf, type GltfExportOptions } from './exporters/gltf.js';
export { exportPly, type PlyExportOptions } from './exporters/ply.js';

export type AnyExportOptions =
  | ({ format: 'svg' } & SvgGenerateOptions)
  | ({ format: 'json' } & JsonExportOptions)
  | ({ format: 'geojson' } & GeoJsonExportOptions)
  | ({ format: 'dxf' } & DxfExportOptions)
  | ({ format: 'obj' } & ObjExportOptions)
  | ({ format: 'gltf' } & GltfExportOptions)
  | ({ format: 'ply' } & PlyExportOptions);

/**
 * Dispatches to the exporter matching `options.format`. A thin convenience
 * over calling `exportSvg`/`exportJson`/etc. directly -- useful wherever the
 * target format is only known at runtime (e.g. `apps/web`'s export UI).
 */
export function exportEntities(entities: readonly AnyEntity[], options: AnyExportOptions): ExportResult {
  switch (options.format) {
    case 'svg':
      return exportSvg(entities, options);
    case 'json':
      return exportJson(entities, options);
    case 'geojson':
      return exportGeoJson(entities, options);
    case 'dxf':
      return exportDxf(entities, options);
    case 'obj':
      return exportObj(entities, options);
    case 'gltf':
      return exportGltf(entities, options);
    case 'ply':
      return exportPly(entities, options);
    default: {
      const exhaustive: never = options;
      throw new Error(`Unsupported export format: ${(exhaustive as { format: ExportFormatId }).format}`);
    }
  }
}
