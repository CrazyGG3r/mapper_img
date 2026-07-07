import type { AnyEntity, ExportResult } from '@topview/schema';

export interface JsonExportOptions {
  readonly pretty?: boolean;
  readonly fileName?: string;
}

export function exportJson(entities: readonly AnyEntity[], options: JsonExportOptions = {}): ExportResult {
  const payload = { entities };
  const data = options.pretty ? JSON.stringify(payload, null, 2) : JSON.stringify(payload);
  return {
    format: 'json',
    data,
    fileName: options.fileName ?? 'topview-export.json',
    mimeType: 'application/json',
  };
}
