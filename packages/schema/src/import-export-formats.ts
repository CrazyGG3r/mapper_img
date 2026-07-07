/**
 * Type stubs for every import/export deliverable format the pipeline's
 * final `export` stage and `@topview/svg-engine`'s `Exporter` adapters
 * (docs/api.md §4) target: SVG, DXF, JSON, GeoJSON, OBJ, GLTF, PLY.
 *
 * These are shared, dependency-free option/result shapes — the actual
 * serialization logic lives in `@topview/svg-engine`, not here. Keeping the
 * *shape* of "what does exporting to format X take/produce" in
 * `@topview/schema` lets `apps/web`'s export UI, `svg-engine`'s adapters,
 * and any future headless/CLI export path agree on one contract.
 */
import type { AnyEntity } from './entities';

export type ExportFormatId = 'svg' | 'dxf' | 'json' | 'geojson' | 'obj' | 'gltf' | 'ply';

/** Human/UI-facing description of one supported export format. */
export interface ExportFormatDescriptor {
  id: ExportFormatId;
  label: string;
  fileExtension: string;
  mimeType: string;
  dimensionality: '2d' | '3d';
}

export const EXPORT_FORMAT_DESCRIPTORS: readonly ExportFormatDescriptor[] = [
  { id: 'svg', label: 'SVG', fileExtension: '.svg', mimeType: 'image/svg+xml', dimensionality: '2d' },
  { id: 'dxf', label: 'AutoCAD DXF', fileExtension: '.dxf', mimeType: 'image/vnd.dxf', dimensionality: '2d' },
  { id: 'json', label: 'TopView JSON', fileExtension: '.json', mimeType: 'application/json', dimensionality: '2d' },
  { id: 'geojson', label: 'GeoJSON', fileExtension: '.geojson', mimeType: 'application/geo+json', dimensionality: '2d' },
  { id: 'obj', label: 'Wavefront OBJ', fileExtension: '.obj', mimeType: 'model/obj', dimensionality: '3d' },
  { id: 'gltf', label: 'glTF', fileExtension: '.gltf', mimeType: 'model/gltf+json', dimensionality: '3d' },
  { id: 'ply', label: 'Stanford PLY', fileExtension: '.ply', mimeType: 'application/octet-stream', dimensionality: '3d' },
] as const;

export interface SvgExportOptions {
  format: 'svg';
  unitsPerMeter: number;
  /** Layer ids to include; empty array means "all layers". */
  includeLayers: string[];
  embedMetadata: boolean;
}

export type DxfVersion = 'R12' | 'R2000' | 'R2010' | 'R2018';

export interface DxfExportOptions {
  format: 'dxf';
  dxfVersion: DxfVersion;
  unitsPerMeter: number;
  /** TopView layer id -> DXF layer name, when the default 1:1 mapping isn't desired. */
  layerMapping?: Record<string, string>;
}

export interface JsonExportOptions {
  format: 'json';
  pretty: boolean;
  /** Bundle `ProjectVersion[]` history into the exported file (see project-format.ts). */
  includeVersionHistory: boolean;
}

export interface GeoJsonExportOptions {
  format: 'geojson';
  /** CRS identifier (e.g. `"EPSG:4326"`) if georeferenced; omitted for a plain local plane. */
  crs?: string;
  includeProperties: boolean;
}

export interface ObjExportOptions {
  format: 'obj';
  includeMaterials: boolean;
  /** Extruded wall height for entities that don't specify their own `heightM`. */
  wallHeightM: number;
}

export interface GltfExportOptions {
  format: 'gltf';
  /** `true` emits a single binary `.glb`; `false` emits `.gltf` + side-car buffers. */
  binary: boolean;
  includeTextures: boolean;
  wallHeightM: number;
}

export type PlyEncoding = 'ascii' | 'binary_little_endian';

export interface PlyExportOptions {
  format: 'ply';
  encoding: PlyEncoding;
  includeColor: boolean;
  includeNormals: boolean;
}

export type ExportOptions =
  | SvgExportOptions
  | DxfExportOptions
  | JsonExportOptions
  | GeoJsonExportOptions
  | ObjExportOptions
  | GltfExportOptions
  | PlyExportOptions;

/** The result of a completed export, ready to hand to the browser's download path or write to disk. */
export interface ExportResult {
  format: ExportFormatId;
  data: Uint8Array | string;
  fileName: string;
  mimeType: string;
}

export type ImportFormatId = ExportFormatId;

/** A raw import request, before `svg-engine`'s per-format parser turns it into entities. */
export interface ImportRequest {
  format: ImportFormatId;
  data: Uint8Array | string;
  sourceFileName: string;
}

/** The result of parsing an imported file back into scene entities (the editor re-open path). */
export interface ImportResult {
  entities: AnyEntity[];
  /** Non-fatal issues encountered while importing (unsupported entities, lossy conversions, …). */
  warnings: string[];
}
