/**
 * Bridges the two entity vocabularies that meet at a stage boundary:
 *
 *  - `@topview/plugin-sdk`'s `DetectedEntity` -- generic, geometry-bag-shaped
 *    (`points2D`/`points3D` + a free-form `properties` bag), carrying
 *    detector provenance/confidence. This is the wire format plugins
 *    speak: detectors *produce* it, exporters *consume* it.
 *  - `@topview/schema`'s `AnyEntity` -- the finalized, concretely-typed
 *    project scene graph (`Wall.start/end/thicknessM`, `Room.boundary`, ...)
 *    that `ProjectDocument.entities` and the SVG editor operate on.
 *
 * `detectedToProjectEntity` runs once, right after a detection/reconstruction
 * stage completes, merging its output into the project's authoritative
 * entities. `projectEntityToDetected` runs the opposite direction, right
 * before the `export` stage hands entities to an `Exporter` plugin, so every
 * plugin boundary -- in either direction -- speaks the same `DetectedEntity`
 * shape (see docs/architecture.md).
 */
import {
  createDefaultConfidenceMeta,
  type AnyEntity,
  type ConfidenceMeta,
  type Point2D as SchemaPoint2D,
} from '@topview/schema';
import type { DetectedEntity } from '@topview/plugin-sdk';

const DEFAULT_WALL_THICKNESS_M = 0.1;

function centroid(points: readonly SchemaPoint2D[]): SchemaPoint2D {
  if (points.length === 0) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

function confidenceFromDetection(detected: DetectedEntity): ConfidenceMeta {
  return {
    score: detected.confidence,
    source: 'detector',
    sourcePluginId: detected.sourcePluginId,
    validationStatus: detected.validationStatus === 'user-rejected' ? 'user-rejected' : 'unreviewed',
  };
}

/**
 * Converts one detector-produced `DetectedEntity` into a concrete project
 * `AnyEntity`, or returns `null` when the detection doesn't carry enough
 * geometry to become a well-formed project entity (e.g. a `door`/`window`
 * detection with no host wall reference yet -- left for a future
 * wall-attachment pass rather than guessed at).
 */
export function detectedToProjectEntity(
  detected: DetectedEntity,
  layerId: string,
  now: string = new Date().toISOString(),
): AnyEntity | null {
  const confidence = confidenceFromDetection(detected);
  const base = {
    id: detected.id,
    layerId,
    confidence,
    createdAt: now,
    updatedAt: now,
  };

  const points2D = detected.geometry.points2D ?? [];
  const props = (detected.properties ?? {}) as Record<string, unknown>;

  switch (detected.kind) {
    case 'wall': {
      if (points2D.length < 2) return null;
      const thicknessM =
        typeof props.thicknessM === 'number' ? props.thicknessM : DEFAULT_WALL_THICKNESS_M;
      return {
        ...base,
        kind: 'wall',
        start: points2D[0]!,
        end: points2D[points2D.length - 1]!,
        thicknessM,
      };
    }
    case 'corner': {
      if (points2D.length < 1) return null;
      return {
        ...base,
        kind: 'corner',
        position: points2D[0]!,
        connectedWallIds: [],
      };
    }
    case 'room': {
      if (points2D.length < 3) return null;
      return {
        ...base,
        kind: 'room',
        boundary: [...points2D],
        wallIds: [],
        label: typeof props.label === 'string' ? props.label : undefined,
      };
    }
    case 'furniture': {
      if (points2D.length < 1) return null;
      return {
        ...base,
        kind: 'furniture',
        category: (typeof props.category === 'string' ? props.category : 'other') as
          | 'sofa'
          | 'table'
          | 'chair'
          | 'bed'
          | 'cabinet'
          | 'appliance'
          | 'other',
        position: centroid(points2D),
        rotationDeg: typeof props.rotationDeg === 'number' ? props.rotationDeg : 0,
        footprint: [...points2D],
        label: typeof props.label === 'string' ? props.label : undefined,
      };
    }
    case 'door':
    case 'window':
      // Doors/windows need a resolved host wall + position-along-wall, which
      // a raw geometric detection doesn't carry. Left to a dedicated
      // wall-attachment step (docs/roadmap.md) rather than guessed here.
      return null;
    default:
      return null;
  }
}

/**
 * The inverse of {@link detectedToProjectEntity}: flattens a finalized
 * project `AnyEntity` back into the generic `DetectedEntity` shape `Exporter`
 * plugins are contractually given (`@topview/plugin-sdk`'s `ExportRequest`).
 * `sourcePluginId`/`sourceManifestId` are set to a synthetic
 * `"topview.project"` provenance since, at export time, the entity's
 * original detector may no longer be registered (or it may be wholly
 * user-authored).
 */
export function projectEntityToDetected(entity: AnyEntity): DetectedEntity {
  const points2D: SchemaPoint2D[] = (() => {
    switch (entity.kind) {
      case 'wall':
        return [entity.start, entity.end];
      case 'corner':
        return [entity.position];
      case 'room':
        return entity.boundary;
      case 'furniture':
        return entity.footprint;
      case 'door':
      case 'window':
        return [];
      default:
        return [];
    }
  })();

  return {
    id: entity.id,
    kind: entity.kind,
    geometry: { points2D },
    confidence: entity.confidence.score,
    sourcePluginId: entity.confidence.sourcePluginId ?? 'topview.project',
    sourceManifestId: entity.confidence.sourcePluginId ?? 'topview.project',
    validationStatus:
      entity.confidence.validationStatus === 'user-rejected' ? 'user-rejected' : 'accepted',
    properties: entityToProperties(entity),
  };
}

function entityToProperties(entity: AnyEntity): Record<string, unknown> {
  switch (entity.kind) {
    case 'wall':
      return { thicknessM: entity.thicknessM, heightM: entity.heightM };
    case 'door':
      return {
        wallId: entity.wallId,
        positionOnWallM: entity.positionOnWallM,
        widthM: entity.widthM,
        swingDirection: entity.swingDirection,
      };
    case 'window':
      return { wallId: entity.wallId, positionOnWallM: entity.positionOnWallM, widthM: entity.widthM };
    case 'room':
      return { label: entity.label, areaSqM: entity.areaSqM };
    case 'furniture':
      return { category: entity.category, label: entity.label };
    default:
      return {};
  }
}

/** Applies `createDefaultConfidenceMeta` when constructing wholly-new, user-authored entities from `apps/web`. */
export { createDefaultConfidenceMeta };
