/**
 * Extrudes walls into simple rectangular-prism meshes (and emits room
 * boundaries as flat floor polygons) as a Wavefront OBJ text file. This is a
 * genuinely-working, if geometrically simple, 3D export -- no materials,
 * texture coordinates, or non-planar room handling. `includeMaterials` is
 * accepted for interface parity with `ObjExportOptions` (`@topview/schema`)
 * but not yet implemented (no `.mtl` sidecar is written).
 */
import type { AnyEntity, ExportResult, Point2D, Wall } from '@topview/schema';

export interface ObjExportOptions {
  readonly includeMaterials?: boolean;
  readonly wallHeightM?: number;
  readonly fileName?: string;
}

const DEFAULT_WALL_HEIGHT_M = 2.4;

/** Footprint (XY) corners of a wall's rectangular cross-section; height is applied separately by the caller. */
function wallBoxVertices(wall: Wall): Point2D[] {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const length = Math.hypot(dx, dy) || 1;
  const dir = { x: dx / length, y: dy / length };
  const half = wall.thicknessM / 2;
  const perp = { x: -dir.y * half, y: dir.x * half };

  return [
    { x: wall.start.x + perp.x, y: wall.start.y + perp.y },
    { x: wall.start.x - perp.x, y: wall.start.y - perp.y },
    { x: wall.end.x - perp.x, y: wall.end.y - perp.y },
    { x: wall.end.x + perp.x, y: wall.end.y + perp.y },
  ];
}

export function exportObj(entities: readonly AnyEntity[], options: ObjExportOptions = {}): ExportResult {
  const heightM = options.wallHeightM ?? DEFAULT_WALL_HEIGHT_M;
  const lines: string[] = ['# TopView SVG Mapper -- OBJ export', '# walls extruded as rectangular prisms; rooms as flat floor polygons'];
  let vertexCount = 0;

  const pushVertex = (p: Point2D, z: number) => {
    lines.push(`v ${p.x.toFixed(4)} ${p.y.toFixed(4)} ${z.toFixed(4)}`);
    vertexCount += 1;
    return vertexCount; // 1-indexed, matches OBJ convention
  };

  for (const entity of entities) {
    if (entity.kind === 'wall') {
      const wallHeightM = entity.heightM ?? heightM;
      const corners = wallBoxVertices(entity);
      const bottom = corners.map((p) => pushVertex(p, 0));
      const top = corners.map((p) => pushVertex(p, wallHeightM));

      lines.push(`f ${bottom[0]} ${bottom[1]} ${bottom[2]} ${bottom[3]}`);
      lines.push(`f ${top[0]} ${top[1]} ${top[2]} ${top[3]}`);
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        lines.push(`f ${bottom[i]} ${bottom[j]} ${top[j]} ${top[i]}`);
      }
    } else if (entity.kind === 'room' && entity.boundary.length >= 3) {
      const indices = entity.boundary.map((p) => pushVertex(p, 0));
      lines.push(`f ${indices.join(' ')}`);
    }
  }

  return {
    format: 'obj',
    data: lines.join('\n'),
    fileName: options.fileName ?? 'topview-export.obj',
    mimeType: 'model/obj',
  };
}
