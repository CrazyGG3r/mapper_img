/**
 * Geometry cleanup over a project's `AnyEntity[]` scene graph (PRS §13):
 * snap nearby vertices, merge duplicate edges, merge collinear wall chains
 * into single segments, and orthogonalize walls when confidence is high.
 * Room boundaries are additionally simplified via `@topview/geometry-wasm`'s
 * Ramer-Douglas-Peucker implementation, demonstrating the intended
 * wasm/js-fallback geometry kernel being used from a real call site (not
 * just the editor's snapping engine).
 */
import { loadGeometryOps } from '@topview/geometry-wasm';
import type { AnyEntity, Point2D, Room, Wall } from '@topview/schema';

export interface CleanupOptions {
  readonly snapToleranceM?: number;
  readonly duplicateToleranceM?: number;
  readonly collinearAngleToleranceDeg?: number;
  readonly collinearGapToleranceM?: number;
  readonly orthogonalizeToleranceDeg?: number;
  readonly roomSimplifyEpsilonM?: number;
  /** PRS §13: "orthogonalize walls when confidence is high, preserve irregular geometry where appropriate". */
  readonly orthogonalize?: boolean;
}

export interface CleanupReport {
  readonly verticesSnapped: number;
  readonly duplicateEdgesRemoved: number;
  readonly segmentsMerged: number;
  readonly wallsOrthogonalized: number;
  readonly roomBoundariesSimplified: number;
}

interface ResolvedOptions {
  snapToleranceM: number;
  duplicateToleranceM: number;
  collinearAngleToleranceDeg: number;
  collinearGapToleranceM: number;
  orthogonalizeToleranceDeg: number;
  roomSimplifyEpsilonM: number;
  orthogonalize: boolean;
}

const DEFAULTS: ResolvedOptions = {
  snapToleranceM: 0.05,
  duplicateToleranceM: 0.02,
  collinearAngleToleranceDeg: 3,
  collinearGapToleranceM: 0.05,
  orthogonalizeToleranceDeg: 6,
  roomSimplifyEpsilonM: 0.02,
  orthogonalize: true,
};

function dist(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isWall(e: AnyEntity): e is Wall {
  return e.kind === 'wall';
}

function isRoom(e: AnyEntity): e is Room {
  return e.kind === 'room';
}

function angleOfDeg(a: Point2D, b: Point2D): number {
  const rad = Math.atan2(b.y - a.y, b.x - a.x);
  const deg = (rad * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

function angularDiffDeg(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/**
 * Single-pass greedy clustering of wall endpoints within `toleranceM` of a
 * cluster's running centroid, then snaps every endpoint to its cluster's
 * centroid. Order-dependent (a known tradeoff of greedy clustering) but
 * deterministic for a given input order and adequate for cleanup, where the
 * goal is "close enough to render as one shared corner", not exact optimality.
 */
export function snapNearbyVertices(
  walls: readonly Wall[],
  toleranceM: number = DEFAULTS.snapToleranceM,
): { walls: Wall[]; snapped: number } {
  interface Cluster {
    sumX: number;
    sumY: number;
    count: number;
  }
  const clusters: Cluster[] = [];

  const assign = (p: Point2D): number => {
    for (let i = 0; i < clusters.length; i++) {
      const c = clusters[i]!;
      const cx = c.sumX / c.count;
      const cy = c.sumY / c.count;
      if (Math.hypot(cx - p.x, cy - p.y) <= toleranceM) {
        c.sumX += p.x;
        c.sumY += p.y;
        c.count += 1;
        return i;
      }
    }
    clusters.push({ sumX: p.x, sumY: p.y, count: 1 });
    return clusters.length - 1;
  };

  const startClusterOf = walls.map((w) => assign(w.start));
  const endClusterOf = walls.map((w) => assign(w.end));

  const centroidOf = (i: number): Point2D => {
    const c = clusters[i]!;
    return { x: c.sumX / c.count, y: c.sumY / c.count };
  };

  let snapped = 0;
  const result = walls.map((w, i) => {
    const newStart = centroidOf(startClusterOf[i]!);
    const newEnd = centroidOf(endClusterOf[i]!);
    if (dist(newStart, w.start) > 1e-9 || dist(newEnd, w.end) > 1e-9) snapped += 1;
    return { ...w, start: newStart, end: newEnd };
  });

  return { walls: result, snapped };
}

function isSameEdge(a: Wall, b: Wall, toleranceM: number): boolean {
  const sameDirection = dist(a.start, b.start) <= toleranceM && dist(a.end, b.end) <= toleranceM;
  const reversed = dist(a.start, b.end) <= toleranceM && dist(a.end, b.start) <= toleranceM;
  return sameDirection || reversed;
}

export function mergeDuplicateEdges(
  walls: readonly Wall[],
  toleranceM: number = DEFAULTS.duplicateToleranceM,
): { walls: Wall[]; removed: number } {
  const kept: Wall[] = [];
  let removed = 0;
  for (const wall of walls) {
    const dupIndex = kept.findIndex((k) => isSameEdge(k, wall, toleranceM));
    if (dupIndex === -1) {
      kept.push(wall);
      continue;
    }
    removed += 1;
    if (wall.confidence.score > kept[dupIndex]!.confidence.score) {
      kept[dupIndex] = wall;
    }
  }
  return { walls: kept, removed };
}

type SharedEndpoint = 'start-start' | 'start-end' | 'end-start' | 'end-end';

function findSharedEndpoint(a: Wall, b: Wall, toleranceM: number): SharedEndpoint | null {
  if (dist(a.start, b.start) <= toleranceM) return 'start-start';
  if (dist(a.start, b.end) <= toleranceM) return 'start-end';
  if (dist(a.end, b.start) <= toleranceM) return 'end-start';
  if (dist(a.end, b.end) <= toleranceM) return 'end-end';
  return null;
}

function mergeTwoWalls(a: Wall, b: Wall, shared: SharedEndpoint): Wall {
  const [start, end]: [Point2D, Point2D] = (() => {
    switch (shared) {
      case 'start-start':
        return [a.end, b.end];
      case 'start-end':
        return [a.end, b.start];
      case 'end-start':
        return [a.start, b.end];
      case 'end-end':
        return [a.start, b.start];
    }
  })();

  return {
    ...a,
    start,
    end,
    thicknessM: Math.max(a.thicknessM, b.thicknessM),
    confidence: { ...a.confidence, score: Math.min(a.confidence.score, b.confidence.score) },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Repeatedly merges pairs of walls that share an endpoint and whose
 * directions agree within `angleToleranceDeg` (mod 180, so a reversed
 * direction still counts as collinear) into one longer wall, until no more
 * merges apply. A wall that meets a third, non-collinear wall at a junction
 * (a T or L corner) is correctly left unmerged, since only the collinear
 * pair's angle test passes.
 */
export function mergeCollinearSegments(
  walls: readonly Wall[],
  angleToleranceDeg: number = DEFAULTS.collinearAngleToleranceDeg,
  gapToleranceM: number = DEFAULTS.collinearGapToleranceM,
): { walls: Wall[]; merged: number } {
  let current = [...walls];
  let mergedCount = 0;
  let changed = true;

  while (changed) {
    changed = false;
    for (let i = 0; i < current.length && !changed; i++) {
      for (let j = i + 1; j < current.length && !changed; j++) {
        const a = current[i]!;
        const b = current[j]!;
        const shared = findSharedEndpoint(a, b, gapToleranceM);
        if (!shared) continue;

        const angleA = angleOfDeg(a.start, a.end);
        const angleB = angleOfDeg(b.start, b.end);
        const diff = Math.min(angularDiffDeg(angleA, angleB), angularDiffDeg(angleA, (angleB + 180) % 360));
        if (diff > angleToleranceDeg) continue;

        const merged = mergeTwoWalls(a, b, shared);
        current = [...current.slice(0, i), merged, ...current.slice(i + 1, j), ...current.slice(j + 1)];
        mergedCount += 1;
        changed = true;
      }
    }
  }

  return { walls: current, merged: mergedCount };
}

const ORTHOGONAL_ANGLES_DEG: readonly number[] = [0, 90, 180, 270];

/**
 * Rotates each wall's endpoint to the nearest right angle when within
 * `toleranceDeg`, preserving the wall's start point and length. Low-confidence
 * or user-rejected walls are left untouched (PRS §13: "preserve irregular
 * geometry where appropriate").
 */
export function orthogonalizeWalls(
  walls: readonly Wall[],
  toleranceDeg: number = DEFAULTS.orthogonalizeToleranceDeg,
): { walls: Wall[]; adjusted: number } {
  let adjusted = 0;
  const result = walls.map((wall) => {
    if (wall.confidence.score < 0.5 || wall.confidence.validationStatus === 'user-rejected') {
      return wall;
    }
    const length = dist(wall.start, wall.end);
    if (length < 1e-9) return wall;

    const angleDeg = angleOfDeg(wall.start, wall.end);
    let nearest = ORTHOGONAL_ANGLES_DEG[0]!;
    let bestDiff = Infinity;
    for (const target of ORTHOGONAL_ANGLES_DEG) {
      const diff = angularDiffDeg(angleDeg, target);
      if (diff < bestDiff) {
        bestDiff = diff;
        nearest = target;
      }
    }
    if (bestDiff > toleranceDeg || bestDiff < 1e-9) return wall;

    const rad = (nearest * Math.PI) / 180;
    const newEnd: Point2D = {
      x: wall.start.x + Math.cos(rad) * length,
      y: wall.start.y + Math.sin(rad) * length,
    };
    adjusted += 1;
    return { ...wall, end: newEnd, updatedAt: new Date().toISOString() };
  });

  return { walls: result, adjusted };
}

async function simplifyRoomBoundaries(
  entities: readonly AnyEntity[],
  epsilonM: number,
): Promise<{ entities: AnyEntity[]; simplifiedCount: number }> {
  const hasRooms = entities.some(isRoom);
  if (!hasRooms) return { entities: [...entities], simplifiedCount: 0 };

  const ops = await loadGeometryOps();
  let simplifiedCount = 0;

  const result = entities.map((entity) => {
    if (!isRoom(entity) || entity.boundary.length < 4) return entity;

    const flat = new Float32Array(entity.boundary.length * 2);
    entity.boundary.forEach((p, i) => {
      flat[i * 2] = p.x;
      flat[i * 2 + 1] = p.y;
    });

    const simplifiedFlat = ops.simplifyPolygon(flat, epsilonM);
    if (simplifiedFlat.length >= flat.length) return entity;

    const boundary: Point2D[] = [];
    for (let i = 0; i + 1 < simplifiedFlat.length; i += 2) {
      boundary.push({ x: simplifiedFlat[i]!, y: simplifiedFlat[i + 1]! });
    }
    simplifiedCount += 1;
    return { ...entity, boundary, updatedAt: new Date().toISOString() };
  });

  return { entities: result, simplifiedCount };
}

/**
 * Runs the full cleanup pipeline (snap → dedupe → merge-collinear →
 * orthogonalize) over every `Wall` in `entities`, plus room-boundary
 * simplification, leaving every other entity kind untouched.
 */
export async function cleanupEntities(
  entities: readonly AnyEntity[],
  options: CleanupOptions = {},
): Promise<{ entities: AnyEntity[]; report: CleanupReport }> {
  const opts: ResolvedOptions = { ...DEFAULTS, ...options };

  const walls = entities.filter(isWall);
  const others = entities.filter((e) => !isWall(e));

  const snapResult = snapNearbyVertices(walls, opts.snapToleranceM);
  const dedupeResult = mergeDuplicateEdges(snapResult.walls, opts.duplicateToleranceM);
  const mergeResult = mergeCollinearSegments(
    dedupeResult.walls,
    opts.collinearAngleToleranceDeg,
    opts.collinearGapToleranceM,
  );
  const orthoResult = opts.orthogonalize
    ? orthogonalizeWalls(mergeResult.walls, opts.orthogonalizeToleranceDeg)
    : { walls: mergeResult.walls, adjusted: 0 };

  const { entities: simplifiedOthers, simplifiedCount } = await simplifyRoomBoundaries(
    others,
    opts.roomSimplifyEpsilonM,
  );

  return {
    entities: [...orthoResult.walls, ...simplifiedOthers],
    report: {
      verticesSnapped: snapResult.snapped,
      duplicateEdgesRemoved: dedupeResult.removed,
      segmentsMerged: mergeResult.merged,
      wallsOrthogonalized: orthoResult.adjusted,
      roomBoundariesSimplified: simplifiedCount,
    },
  };
}
