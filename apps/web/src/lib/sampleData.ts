/**
 * A synthetic point cloud standing in for real SfM/SLAM output (PRS §6 --
 * "Structure from Motion / Visual SLAM" -- is not implemented in this pass;
 * see docs/roadmap.md Phase 1). It samples points along the four walls of a
 * rectangular room with a bit of noise, in the same flat `[x,y,z,...]`
 * layout `@topview/geometry-wasm` and `plugins/example-detector` both
 * assume, so the rest of the pipeline (RANSAC wall detection, cleanup,
 * SVG generation, export) runs against genuinely-shaped input end to end.
 */
import type { DataRef } from '@topview/plugin-sdk';

function sampleAlong(
  start: { x: number; y: number },
  end: { x: number; y: number },
  count: number,
  noiseAmplitude: number,
  z: number,
  out: number[],
): void {
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const nx = (Math.sin(i * 12.9898 + start.x) * 43758.5453) % 1;
    const ny = (Math.sin(i * 78.233 + start.y) * 12345.678) % 1;
    out.push(
      start.x + (end.x - start.x) * t + nx * noiseAmplitude,
      start.y + (end.y - start.y) * t + ny * noiseAmplitude,
      z + (Math.sin(i * 3.14) % 1) * 0.02,
    );
  }
}

export interface SyntheticRoomOptions {
  readonly widthM?: number;
  readonly depthM?: number;
  readonly pointsPerWall?: number;
  readonly noiseAmplitudeM?: number;
}

/** Builds a flat `[x,y,z,...]` `Float32Array` sampling the perimeter walls of a rectangular room. */
export function buildSyntheticRoomPointCloud(options: SyntheticRoomOptions = {}): Float32Array {
  const width = options.widthM ?? 5;
  const depth = options.depthM ?? 4;
  const perWall = options.pointsPerWall ?? 60;
  const noise = options.noiseAmplitudeM ?? 0.015;
  const z = 1.2;

  const corners = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: depth },
    { x: 0, y: depth },
  ];

  const flat: number[] = [];
  for (let i = 0; i < corners.length; i++) {
    sampleAlong(corners[i]!, corners[(i + 1) % corners.length]!, perWall, noise, z, flat);
  }
  return new Float32Array(flat);
}

/** Wraps a flat point cloud into a `blob:` URL `DataRef`, resolvable by `PipelineRunner`'s default `fetch`-based `resolveDataRef`. */
export function pointCloudToDataRef(id: string, points: Float32Array): DataRef {
  // `.buffer` is typed `ArrayBufferLike` (which admits `SharedArrayBuffer`) by
  // newer typed-array lib defs; this Float32Array is always backed by a plain
  // `ArrayBuffer` in practice, so the cast reflects a real invariant, not a risk.
  const blob = new Blob([points.buffer as ArrayBuffer], { type: 'application/octet-stream' });
  const uri = URL.createObjectURL(blob);
  return { id, uri, mimeType: 'application/octet-stream', sizeBytes: points.byteLength };
}
