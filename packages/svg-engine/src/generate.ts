/**
 * Renders a project's `AnyEntity[]` scene graph into a layered, editable SVG
 * document (PRS §12): one `<g>` per layer (Rooms, Walls, Doors, Windows,
 * Furniture, Dimensions, Labels, Camera Path, Obstacles, Unknown Geometry),
 * entities carry their `EntityId` as the SVG element `id` so the browser
 * editor (`apps/web/src/svg-editor/`) can round-trip a rendered element back
 * to the entity it came from.
 */
import type { AnyEntity, Door, Furniture, Point2D, Room, Wall, Window } from '@topview/schema';

export interface SvgGenerateOptions {
  /** Pixels per meter in the emitted document. */
  readonly unitsPerMeter?: number;
  /** Extra margin (in meters) added around the computed content bounds. */
  readonly paddingM?: number;
  /** Entity ids to include; omit/empty means "all". Mirrors `SvgExportOptions.includeLayers` (`@topview/schema`) at the layer level, not per-entity. */
  readonly includeLayers?: readonly string[];
  readonly embedMetadata?: boolean;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function fmt(n: number): string {
  return Number(n.toFixed(3)).toString();
}

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&apos;';
    }
  });
}

function attrId(id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, '_');
  return /^[a-zA-Z_]/.test(safe) ? safe : `e_${safe}`;
}

function centroid(points: readonly Point2D[]): Point2D {
  if (points.length === 0) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

function computeBounds(entities: readonly AnyEntity[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const consider = (p: Point2D) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  };

  for (const entity of entities) {
    switch (entity.kind) {
      case 'wall':
        consider(entity.start);
        consider(entity.end);
        break;
      case 'corner':
        consider(entity.position);
        break;
      case 'room':
        entity.boundary.forEach(consider);
        break;
      case 'furniture':
        entity.footprint.forEach(consider);
        break;
      default:
        break;
    }
  }

  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  }
  return { minX, minY, maxX, maxY };
}

function resolvePositionOnWall(wall: Wall, positionOnWallM: number): Point2D {
  const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
  const t = length > 0 ? positionOnWallM / length : 0;
  return {
    x: wall.start.x + (wall.end.x - wall.start.x) * t,
    y: wall.start.y + (wall.end.y - wall.start.y) * t,
  };
}

function wallDirection(wall: Wall): Point2D {
  const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y) || 1;
  return { x: (wall.end.x - wall.start.x) / length, y: (wall.end.y - wall.start.y) / length };
}

function openingMarkup(
  opening: Door | Window,
  walls: readonly Wall[],
  toPx: (p: Point2D) => Point2D,
  cssClass: string,
  color: string,
): string {
  const wall = opening.wallId ? walls.find((w) => w.id === opening.wallId) : undefined;
  if (!wall) return '';
  const center = resolvePositionOnWall(wall, opening.positionOnWallM);
  const dir = wallDirection(wall);
  const half = opening.widthM / 2;
  const p1 = toPx({ x: center.x - dir.x * half, y: center.y - dir.y * half });
  const p2 = toPx({ x: center.x + dir.x * half, y: center.y + dir.y * half });
  return `<line id="${attrId(opening.id)}" x1="${fmt(p1.x)}" y1="${fmt(p1.y)}" x2="${fmt(p2.x)}" y2="${fmt(p2.y)}" class="${cssClass}" stroke="${color}" stroke-width="3" stroke-linecap="round" />`;
}

/**
 * Renders `entities` into a complete, standalone SVG document string. Kept
 * as a plain function (not a `plugin-sdk` `Exporter`) so it has no
 * plugin-sdk dependency and can be called directly by `apps/web`'s viewer/
 * export UI as well as from `@topview/pipeline-core`'s built-in
 * `svg-cleanup`/`export`-adjacent paths, and unit-tested in isolation.
 */
export function generateSvg(entities: readonly AnyEntity[], options: SvgGenerateOptions = {}): string {
  const unitsPerMeter = options.unitsPerMeter ?? 100;
  const paddingM = options.paddingM ?? 0.5;

  const included =
    options.includeLayers && options.includeLayers.length > 0
      ? entities.filter((e) => options.includeLayers!.includes(e.layerId))
      : entities;

  const bounds = computeBounds(included);
  const minX = bounds.minX - paddingM;
  const minY = bounds.minY - paddingM;
  const widthM = bounds.maxX - bounds.minX + paddingM * 2;
  const heightM = bounds.maxY - bounds.minY + paddingM * 2;
  const widthPx = widthM * unitsPerMeter;
  const heightPx = heightM * unitsPerMeter;

  const toPx = (p: Point2D): Point2D => ({
    x: (p.x - minX) * unitsPerMeter,
    y: (p.y - minY) * unitsPerMeter,
  });

  const walls = included.filter((e): e is Wall => e.kind === 'wall');
  const doors = included.filter((e): e is Door => e.kind === 'door');
  const windows = included.filter((e): e is Window => e.kind === 'window');
  const rooms = included.filter((e): e is Room => e.kind === 'room');
  const furniture = included.filter((e): e is Furniture => e.kind === 'furniture');

  const roomsMarkup = rooms
    .map((room) => {
      const pts = room.boundary.map((p) => toPx(p)).map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(' ');
      const polygon = `<polygon id="${attrId(room.id)}" points="${pts}" class="topview-room" fill="#cbd5e1" fill-opacity="0.35" stroke="none" />`;
      if (!room.label) return polygon;
      const c = toPx(centroid(room.boundary));
      const label = `<text x="${fmt(c.x)}" y="${fmt(c.y)}" class="topview-room-label" font-size="12" text-anchor="middle" fill="#334155">${escapeXml(room.label)}</text>`;
      return polygon + label;
    })
    .join('');

  const wallsMarkup = walls
    .map((wall) => {
      const s = toPx(wall.start);
      const e = toPx(wall.end);
      const strokeWidth = Math.max(1, wall.thicknessM * unitsPerMeter);
      return `<line id="${attrId(wall.id)}" x1="${fmt(s.x)}" y1="${fmt(s.y)}" x2="${fmt(e.x)}" y2="${fmt(e.y)}" class="topview-wall" stroke="#1f2937" stroke-width="${fmt(strokeWidth)}" stroke-linecap="square" />`;
    })
    .join('');

  const doorsMarkup = doors.map((d) => openingMarkup(d, walls, toPx, 'topview-door', '#2563eb')).join('');
  const windowsMarkup = windows.map((w) => openingMarkup(w, walls, toPx, 'topview-window', '#0891b2')).join('');

  const furnitureMarkup = furniture
    .map((f) => {
      const pts = f.footprint.map((p) => toPx(p)).map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(' ');
      return `<polygon id="${attrId(f.id)}" points="${pts}" class="topview-furniture topview-furniture-${f.category}" fill="#94a3b8" fill-opacity="0.6" stroke="#475569" stroke-width="1" />`;
    })
    .join('');

  const metadata = options.embedMetadata
    ? `<metadata>${escapeXml(JSON.stringify({ entityCount: included.length, unitsPerMeter }))}</metadata>`
    : '';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(widthPx)} ${fmt(heightPx)}" ` +
    `width="${fmt(widthPx)}" height="${fmt(heightPx)}" data-units-per-meter="${unitsPerMeter}">` +
    metadata +
    `<g id="rooms" class="topview-layer">${roomsMarkup}</g>` +
    `<g id="walls" class="topview-layer">${wallsMarkup}</g>` +
    `<g id="doors" class="topview-layer">${doorsMarkup}</g>` +
    `<g id="windows" class="topview-layer">${windowsMarkup}</g>` +
    `<g id="furniture" class="topview-layer">${furnitureMarkup}</g>` +
    `<g id="dimensions" class="topview-layer"></g>` +
    `<g id="labels" class="topview-layer"></g>` +
    `<g id="camera-path" class="topview-layer"></g>` +
    `<g id="obstacles" class="topview-layer"></g>` +
    `<g id="unknown" class="topview-layer"></g>` +
    `</svg>`
  );
}
