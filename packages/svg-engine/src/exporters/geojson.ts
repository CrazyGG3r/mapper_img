/**
 * Emits entities as a GeoJSON `FeatureCollection`. Coordinates are the
 * project's local planar (meter) coordinates verbatim -- no georeferencing
 * is assumed unless the caller supplies a `crs` (mirrors
 * `GeoJsonExportOptions.crs` in `@topview/schema`), consistent with PRS §10's
 * "if absolute scale is unavailable, produce a relative-scale map".
 */
import type { AnyEntity, ExportResult, Point2D, Wall } from '@topview/schema';

export interface GeoJsonExportOptions {
  readonly crs?: string;
  readonly includeProperties?: boolean;
  readonly fileName?: string;
}

type Ring = readonly [number, number][];

interface GeoJsonFeature {
  readonly type: 'Feature';
  readonly geometry:
    | { readonly type: 'LineString'; readonly coordinates: readonly [number, number][] }
    | { readonly type: 'Polygon'; readonly coordinates: readonly Ring[] }
    | { readonly type: 'Point'; readonly coordinates: readonly [number, number] };
  readonly properties: Record<string, unknown>;
}

function closedRing(points: readonly Point2D[]): Ring {
  const ring = points.map((p): [number, number] => [p.x, p.y]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    ring.push(first);
  }
  return ring;
}

function resolvePositionOnWall(wall: Wall, positionOnWallM: number): Point2D {
  const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
  const t = length > 0 ? positionOnWallM / length : 0;
  return {
    x: wall.start.x + (wall.end.x - wall.start.x) * t,
    y: wall.start.y + (wall.end.y - wall.start.y) * t,
  };
}

export function exportGeoJson(
  entities: readonly AnyEntity[],
  options: GeoJsonExportOptions = {},
): ExportResult {
  const includeProperties = options.includeProperties ?? true;
  const walls = entities.filter((e): e is Wall => e.kind === 'wall');

  const features: GeoJsonFeature[] = entities.flatMap((entity): GeoJsonFeature[] => {
    const properties: Record<string, unknown> = includeProperties
      ? { id: entity.id, kind: entity.kind, layerId: entity.layerId }
      : {};

    switch (entity.kind) {
      case 'wall':
        return [
          {
            type: 'Feature' as const,
            geometry: { type: 'LineString' as const, coordinates: [[entity.start.x, entity.start.y], [entity.end.x, entity.end.y]] },
            properties: includeProperties ? { ...properties, thicknessM: entity.thicknessM } : properties,
          },
        ];
      case 'room':
        if (entity.boundary.length < 3) return [];
        return [
          {
            type: 'Feature' as const,
            geometry: { type: 'Polygon' as const, coordinates: [closedRing(entity.boundary)] },
            properties: includeProperties ? { ...properties, label: entity.label } : properties,
          },
        ];
      case 'furniture':
        if (entity.footprint.length < 3) return [];
        return [
          {
            type: 'Feature' as const,
            geometry: { type: 'Polygon' as const, coordinates: [closedRing(entity.footprint)] },
            properties: includeProperties ? { ...properties, category: entity.category } : properties,
          },
        ];
      case 'corner':
        return [
          {
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates: [entity.position.x, entity.position.y] },
            properties,
          },
        ];
      case 'door':
      case 'window': {
        const wall = entity.wallId ? walls.find((w) => w.id === entity.wallId) : undefined;
        if (!wall) return [];
        const position = resolvePositionOnWall(wall, entity.positionOnWallM);
        return [
          {
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates: [position.x, position.y] },
            properties: includeProperties ? { ...properties, widthM: entity.widthM } : properties,
          },
        ];
      }
      default:
        return [];
    }
  });

  const collection = {
    type: 'FeatureCollection' as const,
    ...(options.crs ? { crs: { type: 'name', properties: { name: options.crs } } } : {}),
    features,
  };

  return {
    format: 'geojson',
    data: JSON.stringify(collection),
    fileName: options.fileName ?? 'topview-export.geojson',
    mimeType: 'application/geo+json',
  };
}
