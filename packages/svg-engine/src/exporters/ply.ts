/**
 * Not yet implemented. A useful PLY export here would carry the
 * reconstruction's dense point cloud (with per-point color/normal), not the
 * vector entities this package operates on -- that data lives in
 * `ProjectDocument.pointCloud`, not `AnyEntity[]`, so this exporter's real
 * home is a future point-cloud-aware export path (docs/roadmap.md).
 */
import type { AnyEntity, ExportResult } from '@topview/schema';

export interface PlyExportOptions {
  readonly encoding?: 'ascii' | 'binary_little_endian';
  readonly includeColor?: boolean;
  readonly includeNormals?: boolean;
  readonly fileName?: string;
}

export function exportPly(_entities: readonly AnyEntity[], _options: PlyExportOptions = {}): ExportResult {
  throw new Error(
    'PLY export is not yet implemented (see docs/roadmap.md) -- it belongs on ProjectDocument.pointCloud, not the vector entity graph.',
  );
}
