/**
 * Minimal AutoCAD DXF R12 writer: a bare `ENTITIES` section (no `HEADER`/
 * `TABLES`/`BLOCKS`) containing `LINE` entities for walls and `POLYLINE`/
 * `VERTEX`/`SEQEND` chains for room and furniture polygons. This is
 * intentionally the smallest structure most DXF readers (Illustrator,
 * Inkscape, `ezdxf`, ...) accept -- a fully-featured `HEADER`/`TABLES`
 * (layer color/linetype defs, units) is a documented `docs/roadmap.md`
 * follow-up, not silently pretended away.
 */
import type { AnyEntity, DxfVersion, ExportResult, Point2D } from '@topview/schema';

export interface DxfExportOptions {
  readonly dxfVersion?: DxfVersion;
  readonly unitsPerMeter?: number;
  readonly layerMapping?: Readonly<Record<string, string>>;
  readonly fileName?: string;
}

function group(code: number, value: string | number): string[] {
  return [String(code), String(value)];
}

function dxfLayerName(layerId: string, mapping?: Readonly<Record<string, string>>): string {
  return mapping?.[layerId] ?? layerId.replace(/[^A-Za-z0-9_-]/g, '_') ?? 'TOPVIEW';
}

function dxfLine(layer: string, a: Point2D, b: Point2D, scale: number): string[] {
  return [
    ...group(0, 'LINE'),
    ...group(8, layer),
    ...group(10, (a.x * scale).toFixed(4)),
    ...group(20, (a.y * scale).toFixed(4)),
    ...group(30, '0.0'),
    ...group(11, (b.x * scale).toFixed(4)),
    ...group(21, (b.y * scale).toFixed(4)),
    ...group(31, '0.0'),
  ];
}

function dxfPolyline(layer: string, points: readonly Point2D[], scale: number, closed: boolean): string[] {
  const lines: string[] = [
    ...group(0, 'POLYLINE'),
    ...group(8, layer),
    ...group(66, 1),
    ...group(70, closed ? 1 : 0),
  ];
  for (const p of points) {
    lines.push(...group(0, 'VERTEX'), ...group(8, layer), ...group(10, (p.x * scale).toFixed(4)), ...group(20, (p.y * scale).toFixed(4)), ...group(30, '0.0'));
  }
  lines.push(...group(0, 'SEQEND'));
  return lines;
}

export function exportDxf(entities: readonly AnyEntity[], options: DxfExportOptions = {}): ExportResult {
  const scale = options.unitsPerMeter ?? 1;
  const lines: string[] = [...group(0, 'SECTION'), ...group(2, 'ENTITIES')];

  for (const entity of entities) {
    const layer = dxfLayerName(entity.layerId, options.layerMapping);
    switch (entity.kind) {
      case 'wall':
        lines.push(...dxfLine(layer, entity.start, entity.end, scale));
        break;
      case 'room': {
        if (entity.boundary.length >= 2) lines.push(...dxfPolyline(layer, entity.boundary, scale, true));
        break;
      }
      case 'furniture':
        if (entity.footprint.length >= 2) lines.push(...dxfPolyline(layer, entity.footprint, scale, true));
        break;
      default:
        break;
    }
  }

  lines.push(...group(0, 'ENDSEC'), ...group(0, 'EOF'));

  return {
    format: 'dxf',
    data: lines.join('\n'),
    fileName: options.fileName ?? 'topview-export.dxf',
    mimeType: 'image/vnd.dxf',
  };
}
