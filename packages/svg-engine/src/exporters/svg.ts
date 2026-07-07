import type { AnyEntity, ExportResult } from '@topview/schema';
import { generateSvg, type SvgGenerateOptions } from '../generate.js';

export function exportSvg(
  entities: readonly AnyEntity[],
  options: SvgGenerateOptions & { fileName?: string } = {},
): ExportResult {
  const svg = generateSvg(entities, options);
  return {
    format: 'svg',
    data: svg,
    fileName: options.fileName ?? 'topview-export.svg',
    mimeType: 'image/svg+xml',
  };
}
