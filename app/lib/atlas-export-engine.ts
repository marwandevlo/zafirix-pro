/**
 * Central export format registry for Zafirix Pro documents & reports.
 */

export const EXPORT_FORMATS = ['pdf', 'xlsx', 'docx', 'xml', 'csv', 'json', 'zip'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const EXPORT_CONTENT_TYPES: Record<ExportFormat, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xml: 'application/xml; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  json: 'application/json',
  zip: 'application/zip',
};

export const EXPORT_LABELS: Record<ExportFormat, string> = {
  pdf: 'PDF',
  xlsx: 'Excel',
  docx: 'Word',
  xml: 'XML',
  csv: 'CSV',
  json: 'JSON',
  zip: 'ZIP (tous formats)',
};

export function isExportFormat(value: string): value is ExportFormat {
  return (EXPORT_FORMATS as readonly string[]).includes(value);
}

/** Trigger authenticated document export download in browser. */
export function downloadAuthenticatedExport(documentId: string, format: ExportFormat): void {
  if (typeof window === 'undefined') return;
  const url = `/api/documents/${encodeURIComponent(documentId)}/export?format=${format}`;
  const a = window.document.createElement('a');
  a.href = url;
  a.download = '';
  a.rel = 'noopener';
  a.click();
}

/** Trigger token-scoped public export download. */
export function downloadSharedExport(token: string, format: ExportFormat): void {
  if (typeof window === 'undefined') return;
  const url = `/api/share/${encodeURIComponent(token)}/export?format=${format}`;
  const a = window.document.createElement('a');
  a.href = url;
  a.download = '';
  a.rel = 'noopener';
  a.click();
}
