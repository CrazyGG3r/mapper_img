/**
 * Iterative RANSAC line-fitting over a 2D point set: repeatedly finds the
 * line with the most inliers, refines it via a total-least-squares (PCA) fit
 * over those inliers, extracts the segment's extent along that line, removes
 * the consumed inliers, and repeats until no more segments clear the
 * confidence thresholds. This is the actual detection algorithm
 * `ExampleWallDetector` runs against a projected point cloud -- a real (if
 * deliberately simple) computer-vision technique, not a stand-in.
 */
export interface Point2 {
  readonly x: number;
  readonly y: number;
}

export interface LineSegment {
  readonly start: Point2;
  readonly end: Point2;
  readonly inlierCount: number;
  readonly candidateCount: number;
}

export interface RansacOptions {
  /** Max perpendicular distance (in the point cloud's own units) for a point to count as an inlier. */
  readonly distanceThresholdM?: number;
  /** RANSAC trials per segment search. */
  readonly iterationsPerSegment?: number;
  /** Stop searching for more segments once fewer than this many points remain. */
  readonly minRemainingPoints?: number;
  /** A candidate line must have at least this many inliers to be accepted. */
  readonly minInliers?: number;
  /** A fitted segment shorter than this (in meters) is discarded (but its inliers are still consumed, to avoid re-fitting noise forever). */
  readonly minSegmentLengthM?: number;
  /** Hard cap on how many segments one call will extract. */
  readonly maxSegments?: number;
  /** Seed for the internal PRNG, so detection is reproducible in tests. */
  readonly seed?: number;
}

const DEFAULTS: Required<RansacOptions> = {
  distanceThresholdM: 0.05,
  iterationsPerSegment: 200,
  minRemainingPoints: 10,
  minInliers: 8,
  minSegmentLengthM: 0.3,
  maxSegments: 64,
  seed: 0xc0ffee,
};

/** Small, fast, deterministic PRNG (mulberry32) -- good enough for RANSAC sampling, not for cryptography. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function perpendicularDistance(p: Point2, linePoint: Point2, dir: Point2): number {
  const dx = p.x - linePoint.x;
  const dy = p.y - linePoint.y;
  // magnitude of the 2D cross product of (p - linePoint) and the (unit) direction
  return Math.abs(dx * dir.y - dy * dir.x);
}

function normalize(v: Point2): Point2 {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}

/** Total-least-squares direction fit (largest eigenvector of the 2x2 covariance matrix) over a point set. */
function fitDirection(points: readonly Point2[], mean: Point2): Point2 {
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of points) {
    const dx = p.x - mean.x;
    const dy = p.y - mean.y;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

function meanOf(points: readonly Point2[]): Point2 {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

/**
 * Extracts up to `maxSegments` line segments from `points` via iterative
 * RANSAC. Consumed inliers are removed from the working set between
 * segments so the same wall isn't detected twice and a second, less-populated
 * wall gets a fair chance at the remaining points.
 */
export function extractLineSegments(points: readonly Point2[], options: RansacOptions = {}): LineSegment[] {
  const opts: Required<RansacOptions> = { ...DEFAULTS, ...options };
  const rand = mulberry32(opts.seed);
  let remaining = [...points];
  const segments: LineSegment[] = [];

  while (remaining.length >= opts.minRemainingPoints && segments.length < opts.maxSegments) {
    let bestInlierIndices: number[] = [];

    for (let iter = 0; iter < opts.iterationsPerSegment; iter++) {
      const i = Math.floor(rand() * remaining.length);
      let j = Math.floor(rand() * remaining.length);
      if (j === i) j = (j + 1) % remaining.length;
      const p1 = remaining[i]!;
      const p2 = remaining[j]!;
      if (p1.x === p2.x && p1.y === p2.y) continue;

      const dir = normalize({ x: p2.x - p1.x, y: p2.y - p1.y });
      const inlierIndices: number[] = [];
      for (let k = 0; k < remaining.length; k++) {
        if (perpendicularDistance(remaining[k]!, p1, dir) <= opts.distanceThresholdM) {
          inlierIndices.push(k);
        }
      }
      if (inlierIndices.length > bestInlierIndices.length) {
        bestInlierIndices = inlierIndices;
      }
    }

    if (bestInlierIndices.length < opts.minInliers) break;

    const inlierPoints = bestInlierIndices.map((idx) => remaining[idx]!);
    const mean = meanOf(inlierPoints);
    const dir = fitDirection(inlierPoints, mean);

    let tMin = Infinity;
    let tMax = -Infinity;
    for (const p of inlierPoints) {
      const t = (p.x - mean.x) * dir.x + (p.y - mean.y) * dir.y;
      tMin = Math.min(tMin, t);
      tMax = Math.max(tMax, t);
    }
    const start: Point2 = { x: mean.x + dir.x * tMin, y: mean.y + dir.y * tMin };
    const end: Point2 = { x: mean.x + dir.x * tMax, y: mean.y + dir.y * tMax };
    const length = Math.hypot(end.x - start.x, end.y - start.y);

    // Always consume the inliers (even a too-short segment is "explained"
    // noise, not a wall worth re-fitting on the next iteration).
    const inlierSet = new Set(bestInlierIndices);
    remaining = remaining.filter((_, idx) => !inlierSet.has(idx));

    if (length >= opts.minSegmentLengthM) {
      segments.push({ start, end, inlierCount: bestInlierIndices.length, candidateCount: inlierPoints.length });
    }
  }

  return segments;
}
